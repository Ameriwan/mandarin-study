"""Shared data access for the build: MOE readings, the moedict audio-id map and the TBCL lists.

Everything here reads from .cache/ (filled by tools/fetch.py). Nothing is downloaded.
Zhuyin conventions (MASTER_PROMPT §9.2): syllables separated by one space, tone mark after the
syllable (ˊ ˇ ˋ, tone 1 unmarked), neutral tone ˙ before the syllable, base tones stored.
"""
import csv
import json
import re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
CONTENT = ROOT / "content"
DOCS = ROOT / "docs"

TONE_MARKS = "ˊˇˋ˙"
INITIALS = list("ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ")
MEDIALS = list("ㄧㄨㄩ")
FINALS = list("ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ")
SYMBOLS = INITIALS + MEDIALS + FINALS  # 37, textbook order
ZHUYIN_CHARS = set(SYMBOLS) | set(TONE_MARKS)
TBCL_LEVELS = ["第1級", "第1*級", "第2級", "第2*級", "第3級", "第3*級", "第4級", "第4*級", "第5級", "第6級", "第7級"]
PUNCT = set("，。？！、：；「」『』（）《》〈〉…—～·.,?!:;()[]\"' ")


def squash(z):
    """Remove every kind of whitespace (the audio-id map keys multi-syllable words without spaces)."""
    return re.sub(r"[\s\u3000]+", "", z or "")


def norm(z):
    """Canonical content form: single spaces, ˙ before its syllable, 兒化 ㄦ as its own syllable."""
    z = re.sub(r"[\s\u3000]+", " ", (z or "").strip())
    z = re.sub(r"(?<=[ㄅ-ㄩˊˇˋ])ㄦ", " ㄦ", z)  # MOE attaches 兒化 (ㄓㄜˋㄦ); one syllable per 兒
    out = []
    for syl in z.split(" "):
        if syl.endswith("˙") and len(syl) > 1:   # TBCL writes ㄉㄜ˙
            syl = "˙" + syl[:-1]
        out.append(syl)
    return " ".join(out)


def syllables(z):
    return [s for s in norm(z).split(" ") if s]


def tone(syl):
    """1-5 (5 = neutral)."""
    if syl.startswith("˙"):
        return 5
    return {"ˊ": 2, "ˇ": 3, "ˋ": 4}.get(syl[-1], 1)


def base(syl):
    """Syllable without its tone mark."""
    return syl.strip("˙").rstrip("ˊˇˋ")


def with_tone(b, t):
    return "˙" + b if t == 5 else b + {1: "", 2: "ˊ", 3: "ˇ", 4: "ˋ"}[t]


def split_syllable(b):
    """Base syllable -> (initial, medial, final). Any part may be ''."""
    ini = med = fin = ""
    i = 0
    if b and b[0] in INITIALS:
        ini, i = b[0], 1
    if i < len(b) and b[i] in MEDIALS:
        med, i = b[i], i + 1
    fin = b[i:]
    return ini, med, fin


def is_zhuyin(s):
    return bool(s) and all(c in ZHUYIN_CHARS or c in " \u3000" for c in s)


@lru_cache(maxsize=None)
def readings():
    """{'concised': {word: [{z, o, v?}]}, 'revised': {...}} from tools/fetch.py + the SETUP cache step."""
    p = CACHE / "moe-data" / "readings.json"
    if not p.exists():
        raise SystemExit("missing .cache/moe-data/readings.json: run the MOE spreadsheet cache step (see PROGRESS.md)")
    return json.load(open(p, encoding="utf-8"))


@lru_cache(maxsize=None)
def audio_map():
    """{word: {squashed_zhuyin: id}} from dict-concised.audio.json."""
    raw = json.load(open(CACHE / "moe-data" / "dict-concised.audio.json", encoding="utf-8"))
    out = {}
    for key, aid in raw.items():
        word, z = key.split(".", 1)
        z = re.sub(r"^（[^）]*）", "", z)  # （語音）/（讀音） prefixes on a few keys
        out.setdefault(word, {})[squash(z)] = aid
    return out


def audio_id(word, zhuyin):
    """moedict audio id for this exact word + reading, or None."""
    return audio_map().get(word, {}).get(squash(zhuyin))


def tbcl_parts(cell):
    """The '/'-separated readings of a TBCL bopomofo cell, cleaned of (一) sense markers, CJK 一 typed for ㄧ
    and syllables run together after a tone mark (ㄉㄧˊㄅㄨˊ)."""
    cell = re.sub(r"[(（][一二三四五六七八九十][)）]", "", str(cell or "")).replace("一", "ㄧ")
    cell = re.sub(r"([ˊˇˋ])(?=[ㄅ-ㄩ˙])", r"\1 ", cell)
    return [p for p in (norm(x) for x in cell.split("/")) if p]


def _fits(form, z):
    """z has one syllable per character of form, with ㄦ exactly where the form has 兒."""
    syl = syllables(z)
    return len(syl) == len(form) and all((c == "兒") == (base(s) == "ㄦ") for c, s in zip(form, syl))


def _form_readings(forms, parts, i):
    """Readings of forms[i] in a '爸爸/爸' row: the i-th part when the cell lists one per form, else every
    part that fits the form (cells like 那裡/那裏/那兒 → ㄋㄚˋ ㄌㄧˇ / ㄋㄚˋ ㄦ are not parallel).
    A form with no part of its length (剛 in 剛剛/剛 → ㄍㄤ ㄍㄤ) gets no TBCL reading."""
    form = forms[i]
    if len(forms) == len(parts) and len(syllables(parts[i])) == len(form):
        return [parts[i]]
    return [p for p in parts if _fits(form, p)] or [p for p in parts if len(syllables(p)) == len(form)]


@lru_cache(maxsize=None)
def tbcl_words():
    """{word: {zhuyin, readings, pinyin, level, band, situation, wfreq, sfreq}} from the NAER 詞語表 (cache only).

    `readings` lists every TBCL reading of that spelled form; numbered rows (得1/得2/得3) are merged and
    `zhuyin` is the same list joined with '/'. The other fields come from the form's first row.
    """
    import openpyxl
    p = CACHE / "tbcl" / "14452詞語表202504.xlsx"
    ws = openpyxl.load_workbook(p, read_only=True).worksheets[0]
    it = ws.iter_rows(values_only=True)
    hdr = next(it)
    H = {h: i for i, h in enumerate(hdr)}
    out = {}
    for r in it:
        w = r[H["word"]]
        if not w:
            continue
        forms = [f for f in (re.sub(r"\d+$", "", x).strip() for x in str(w).split("/")) if f]
        parts = tbcl_parts(r[H["bopomofo"]])
        for i, form in enumerate(forms):
            e = out.setdefault(form, {
                "readings": [], "pinyin": (r[H["pinyin"]] or "").strip(), "level": r[H["ji"]],
                "band": r[H["deng"]], "situation": r[H["situation"]] or "", "wfreq": int(r[H["wfreq"]] or 0),
                "sfreq": int(r[H["sfreq"]] or 0)})
            for z in _form_readings(forms, parts, i):
                if z not in e["readings"]:
                    e["readings"].append(z)
            e["zhuyin"] = "/".join(e["readings"])
    return out


@lru_cache(maxsize=None)
def tbcl_chars():
    """{char: {level, wfreq, sfreq}} from the NAER 漢字表."""
    import openpyxl
    ws = openpyxl.load_workbook(CACHE / "tbcl" / "漢字表_111-09-20.xlsx", read_only=True).worksheets[0]
    it = ws.iter_rows(values_only=True)
    next(it)
    out = {}
    for r in it:
        if r[1]:
            out[str(r[1]).strip()] = {"level": r[3], "band": r[2], "wfreq": int(r[4] or 0), "sfreq": int(r[5] or 0)}
    return out


def level_rank(level):
    return TBCL_LEVELS.index(level) if level in TBCL_LEVELS else 99


VARIANT_NOTE = re.compile(r"[之的](又音|語音|讀音|或讀)。")  # a later entry glossed "(一)之讀音。"


def word_readings(word):
    """All known readings of a word, in priority order, as [(zhuyin, source, kind)].

    kind: 'main' for every TBCL reading (TBCL does not rank 和1/和2 or slash forms) and for the
    first-listed reading of an MOE source, 'alt' for later MOE 多音 entries, or the MOE variant label
    (又音 / 語音 / 讀音 / 或讀 / 變), also for a later entry whose gloss says it is one.
    Sources in order: TBCL, MOE 簡編本, MOE 修訂本 (MASTER_PROMPT §9.3).
    """
    t = tbcl_words().get(word)
    out = [(z, "TBCL", "main") for z in (t["readings"] if t else [])]
    for src, label in (("concised", "簡編本"), ("revised", "修訂本")):
        for i, e in enumerate(readings()[src].get(word, [])):
            note = VARIANT_NOTE.search(e.get("pos") or "") if i else None
            out.append((norm(e["z"]), label, note.group(1) if note else "alt" if i else "main"))
            if e.get("v"):
                out.append((norm(e["v"]["z"]), label, e["v"]["type"]))
    return out


@lru_cache(maxsize=None)
def lexicon():
    """Every word form we can look up, for longest-match segmentation."""
    words = set(tbcl_words()) | set(readings()["concised"]) | set(readings()["revised"])
    return words


def match_lengths(text, i, longest=8):
    """Lengths of the lexicon words that start at text[i], longest first, always ending with 1."""
    lex = lexicon()
    return [n for n in range(min(longest, len(text) - i), 1, -1) if text[i:i + n] in lex] + [1]


def segment(text):
    """Longest-match segmentation of a Chinese string into lexicon words (single chars as fallback).
    Punctuation and non-CJK runs come back as their own tokens with kind 'skip'."""
    out, i = [], 0
    while i < len(text):
        c = text[i]
        if c in PUNCT or not ("\u3400" <= c <= "\u9fff" or "\uf900" <= c <= "\ufaff"):
            out.append((c, "skip"))
            i += 1
            continue
        n = match_lengths(text, i)[0]
        out.append((text[i:i + n], "word"))
        i += n
    return out


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = []
        for row in csv.DictReader(f):
            clean = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
            if any(clean.values()):
                rows.append(clean)
        return rows


def read_json(path, default=None):
    if not Path(path).exists():
        return default
    return json.load(open(path, encoding="utf-8-sig"))
