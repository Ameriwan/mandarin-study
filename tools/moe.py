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
    """Canonical content form: single spaces, ˙ before its syllable, no stray marks."""
    z = re.sub(r"[\s\u3000]+", " ", (z or "").strip())
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


@lru_cache(maxsize=None)
def tbcl_words():
    """{word: {zhuyin, pinyin, level, band, situation, wfreq, sfreq}} from the NAER 詞語表 (cache only)."""
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
        entry = {"zhuyin": norm(r[H["bopomofo"]]), "pinyin": (r[H["pinyin"]] or "").strip(), "level": r[H["ji"]],
                 "band": r[H["deng"]], "situation": r[H["situation"]] or "", "wfreq": int(r[H["wfreq"]] or 0),
                 "sfreq": int(r[H["sfreq"]] or 0)}
        # "爸爸/爸" and "和1" style entries: register every spelled form
        for form in re.split(r"/", str(w)):
            form = re.sub(r"\d+$", "", form).strip()
            if form and form not in out:
                out[form] = dict(entry)
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


def word_readings(word):
    """All known readings of a word, in priority order, as [(zhuyin, source, kind)].

    kind: 'main' for the first-listed reading of a source, 'alt' for later 多音 entries,
    or the MOE variant label (又音 / 語音 / 讀音 / 或讀 / 變).
    Sources in order: TBCL, MOE 簡編本, MOE 修訂本 (MASTER_PROMPT §9.3).
    """
    out = []
    t = tbcl_words().get(word)
    if t and t["zhuyin"]:
        for i, z in enumerate(t["zhuyin"].split("/")):
            z = norm(z)
            if z:
                out.append((z, "TBCL", "main" if i == 0 else "alt"))
    for src, label in (("concised", "簡編本"), ("revised", "修訂本")):
        for i, e in enumerate(readings()[src].get(word, [])):
            out.append((norm(e["z"]), label, "main" if i == 0 else "alt"))
            if e.get("v"):
                out.append((norm(e["v"]["z"]), label, e["v"]["type"]))
    return out


@lru_cache(maxsize=None)
def lexicon():
    """Every word form we can look up, for longest-match segmentation."""
    words = set(tbcl_words()) | set(readings()["concised"]) | set(readings()["revised"])
    return words


def segment(text):
    """Longest-match segmentation of a Chinese string into lexicon words (single chars as fallback).
    Punctuation and non-CJK runs come back as their own tokens with kind 'skip'."""
    lex = lexicon()
    longest = 8
    out, i = [], 0
    while i < len(text):
        c = text[i]
        if c in PUNCT or not ("\u3400" <= c <= "\u9fff" or "\uf900" <= c <= "\ufaff"):
            out.append((c, "skip"))
            i += 1
            continue
        for n in range(min(longest, len(text) - i), 0, -1):
            cand = text[i:i + n]
            if n == 1 or cand in lex:
                out.append((cand, "word"))
                i += n
                break
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
