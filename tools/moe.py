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


# ---------------------------------------------------------------- spoken form (tone sandhi, §6.4)

def _is_cjk(c):
    """A Chinese character that takes one Zhuyin syllable (the same ranges as ruby() in docs/js/app.js)."""
    return "\u3400" <= c <= "\u9fff" or "\uf900" <= c <= "\ufaff"


_YI, _YI_2, _YI_4 = "ㄧ", "ㄧˊ", "ㄧˋ"            # 一: base, before T4, before T1/T2/T3
_BU, _BU_2 = "ㄅㄨˋ", "ㄅㄨˊ"                     # 不: base, before T4
_NUMERALS = "〇零一二三四五六七八九十百千萬億兩"       # a run of these just before 一 makes it part of a number ...
_NUMBER_DIGITS = set("〇零一二三四五六七八九十兩")      # ... when the run holds a digit: 十一, 二十一, 三萬一, 一百一.
#   百千萬億 alone are a number (百一詩) unless they end a word of their own right before the 一:
#   千萬一定 ("by all means"), 百萬一定 change; 萬一 stays as a word (_yi_final_words).
_DIGITS = set("〇零一二三四五六七八九十")             # 一 before these is read digit by digit: 一九四九, 一〇一.
#   Not 百千萬億兩: before them 一 counts like a numeral before a measure word and changes (一百, 一千, 一兩個).
_MULTIPLIERS = set("百千萬億")                       # ... also after 之: 百分之一百 ㄧˋ ㄅㄞˇ (but 三分之一 stays)
_ZHI_OBJECT_VERBS = set("為使與令將言付置")            # one-character verb + 之 "it": 為之一振, 使之一致, 簡而言之一定
_AFTER_ZHI_YI = set("就則便也卻又再是在有為而來乃即亦")   # 之一 "one of" + an adverb: 之一就是 (not the word 一就)
_ZHI_YI_WORDS = {"一生", "一世", "一舉", "一臂"}       # after 之, these 一X are words, so 一 changes: 人之一生
_ORDINAL_BEFORE = ("第",)                          # 第一, 第一次
_WEEKDAY_BEFORE = ("星期", "禮拜", "週")            # 星期一 Monday, 週一到週五 ...
_NOT_WEEKDAY = set("定起直樣些共切般次回趟遍")         # ... but not 這週一定, 這星期一起, 每週一次
_ORDINAL_AFTER = ("月", "號", "樓", "年級")          # 一月 January, 一號 the 1st, 一樓 1st floor, 一年級 1st grade
_YI_FINAL_EXTRA = ("均一", "專一")                    # MOE words ending in a numeral 一 that the TBCL list lacks
#   (not 同一: 同一個, 同一天 say ㄧˊ / ㄧˋ, a numeral before a measure word; 同一 alone ends its run and stays)


@lru_cache(maxsize=None)
def _yi_final_words():
    """Words that end in a 一 meaning "one / the same" (統一, 唯一, 單一, 萬一, 初一 ...): the TBCL 詞語表
    words ending in 一, plus _YI_FINAL_EXTRA. Not every MOE word: 不一, 加一, 和一 would swallow 不一起,
    再加一點, 我和一個 under the longest-match segmentation. Weekdays (週一, 星期一) are left to the weekday
    rule, which knows 每週一次 / 這週一定 are counting."""
    tbcl = {w for w in tbcl_words() if len(w) > 1 and w.endswith("一") and all(_is_cjk(c) for c in w)
            and not w[:-1].endswith(_WEEKDAY_BEFORE)}
    return frozenset(tbcl | set(_YI_FINAL_EXTRA))


def _token_spans(text):
    """[(start, end)] of the segment() tokens of `text` (a run of Chinese characters)."""
    out, i = [], 0
    for tok, _ in segment(text):
        out.append((i, i + len(tok)))
        i += len(tok)
    return out


@lru_cache(maxsize=None)
def _full_tone(ch, b):
    """Tone (1-4) of the first-listed full-tone MOE reading of `ch` with base syllable `b`, or None.
    Used for a neutral syllable after 一/不: 個 ˙ㄍㄜ → 4 (ㄍㄜˋ), 是 ˙ㄕ → 4 (ㄕˋ). 簡編本 first, then 修訂本."""
    for src in ("concised", "revised"):
        for e in readings()[src].get(ch, []):
            s = syllables(e["z"])
            if len(s) == 1 and base(s[0]) == b and tone(s[0]) != 5:
                return tone(s[0])
    return None


def _token_at(spans, k):
    """The (start, end) of the segment() token that holds character k."""
    return next(sp for sp in spans if sp[0] <= k < sp[1])


def _yi_stays(text, i, spans):
    """一 at text[i] (not the last character) as a number or ordinal (§6.4). `text` is its run of Chinese
    characters and `spans` the run's segment() tokens (_token_spans), so word boundaries count: 統一發票 and
    唯一機會 keep 一, 千萬一定, 唯一一次 and 總之一定 change it."""
    before, after = text[:i], text[i + 1:]
    if before.endswith(_ORDINAL_BEFORE):
        return True
    num = before[len(before.rstrip(_NUMERALS)):]                        # the numeral run just before 一
    if num:
        p = _token_at(spans, i - 1)
        word_end = p[1] == i and p[1] - p[0] > 1                         # a word of its own ends right before 一
        if ((word_end and text[p[0]:p[1]] in _yi_final_words())
                or (before.endswith("一") and before[:-1].endswith(_WEEKDAY_BEFORE))):
            pass                  # the 一 of 唯一 / 萬一 / 星期一 just before is no number: 唯一一次, 萬一一定, 星期一一定
        elif set(num) & _NUMBER_DIGITS or not word_end:
            return True           # a number: 十一, 二十一, 三萬一, 一百一; 百千萬億 alone too (百一詩, 百一 110)
        #                           unless they end a word of their own right before 一: 千萬一定, 百萬一定
    if before.endswith(_WEEKDAY_BEFORE) and after[0] not in _NOT_WEEKDAY:
        return True
    if after[0] in _DIGITS or after.startswith(_ORDINAL_AFTER):
        return True
    s, e = _token_at(spans, i)                                           # the token that holds this 一 ...
    if text[s:i + 1] in _yi_final_words():                               # ... is or starts with 統一 / 唯一 / 萬一:
        return True                                                      # 唯一機會, 統一發票, 單一窗口
    if not (before.endswith("之") and (i - 1, i) in spans):              # 之 as a word of its own (not 總之一定,
        return False                                                     # not the idiom 付之一炬) ...
    if before[:-1].endswith("分"):                                       # ... a fraction: 三分之一, 十分之一秒 keep 一,
        return after[0] not in _MULTIPLIERS                              # 百分之一百 changes like any 一百
    if before[:-1][-1:] in _ZHI_OBJECT_VERBS and (i - 2, i - 1) in spans:
        return False                                                     # ... 之 "it": 為之一振, 與之一戰
    if s == i and text[s:e] in _ZHI_YI_WORDS:
        return False                                                     # ... 一 starts a word: 人之一生
    return True                                                          # ... 之一 "one of": 其中之一是, 原因之一說明
    # (Greedy segmentation also glues the 一 of 之一 onto a following 一X headword such as 一說 / 一名 / 一應,
    #  so "一 starts a token" alone is not evidence of a word; only the listed words count.)


def spoken(zh, zhuyin):
    """The spoken form of `zhuyin` (written in base tones, §9.2) with the tone sandhi of §6.4 written out.

    - 3+3: in a run of consecutive T3 syllables, every T3 except the last becomes T2 (水果 ㄕㄨㄟˊ ㄍㄨㄛˇ,
      展覽館 ㄓㄢˊ ㄌㄢˊ ㄍㄨㄢˇ, 我也很好 ㄨㄛˊ ㄧㄝˊ ㄏㄣˊ ㄏㄠˇ).
    - 一 written ㄧ stays ㄧ as a number or ordinal: after 第 or a number (第一, 十一, 三萬一, 百一詩; 百千萬億
      ending a word of their own are no number, so 千萬一定 changes, and neither is the 一 that ends 唯一 / 統一
      / 萬一 / 星期一, so 唯一一次 and 星期一一定 change), as a weekday (星期一早上, 週一到週五, but not
      這週一定 / 每週一次), before a digit (一九四九), before 月 / 號 / 樓 / 年級 (一月 January; 一個月 does
      change), with nothing after it (統一), at the end of a word whose 一 means "one / the same" that is, or
      starts, the segment() token holding the 一 (唯一機會, 萬一下雨, 同一個, 統一發票: the TBCL words ending in 一
      plus 同一 均一 專一), in a fraction (三分之一, 十分之一秒; 百分之一百 changes like any 一百), or as 之一
      "one of" with 之 a word of its own (其中之一是, 原因之一就是). It changes after 總之 (總之一定), after 之
      "it" following a one-character verb (為之一振, 使之一致, 與之一起, 簡而言之一定), when it starts a word
      after 之 (人之一生) and in the idiom 付之一炬. Otherwise ㄧˊ before T4 (一定)
      and ㄧˋ before T1/T2/T3 (一天, 一起, 一百); before a neutral syllable it follows that character's own
      full tone (一個 ㄧ ˙ㄍㄜ → ㄧˊ ˙ㄍㄜ, as 個 is ㄍㄜˋ) and stays ㄧ when there is none.
      Checked against every 一/不 "(變)" form of the MOE 簡編本 (tools/test_spoken.py): all agree but three
      idioms where 一 contrasts with another number (說一不二, 一不做二不休, 一五一十).
    - 不 written ㄅㄨˋ becomes ㄅㄨˊ before T4 (不要) or before a neutral syllable whose full tone is T4
      (不是 ㄅㄨˋ ˙ㄕ → ㄅㄨˊ ˙ㄕ); unchanged elsewhere. A neutral ˙ㄧ / ˙ㄅㄨ (看一看, 對不起) is left alone.
    - Half-third (T3 as a low 21 before T1/T2/T4/neutral) is not a written change.
    Sandhi never crosses punctuation or any other non-Chinese character. The next syllable's written (base)
    tone decides 一/不, so 不一定 is ㄅㄨˋ ㄧˊ ㄉㄧㄥˋ. If `zh` does not have one Chinese character per
    syllable, only 3+3 is applied, over the whole string. Returns the syllables joined by single spaces.
    """
    syls = syllables(zhuyin)
    out = list(syls)
    chars = [c for c in (zh or "") if _is_cjk(c)]
    if len(chars) != len(syls):
        chars, runs = [""] * len(syls), [list(range(len(syls)))]
    else:
        runs, k = [[]], 0
        for c in zh:
            if _is_cjk(c):
                runs[-1].append(k)
                k += 1
            elif runs[-1]:
                runs.append([])
        runs = [r for r in runs if r]
    text = "".join(chars)
    for run in runs:
        rtext, r0 = text[run[0]:run[-1] + 1], run[0]
        spans = _token_spans(rtext) if any(chars[k] == "一" for k in run[:-1]) else []
        # 3+3, on the written tones
        i = 0
        while i < len(run):
            j = i
            while j < len(run) and tone(syls[run[j]]) == 3:
                j += 1
            if j - i > 1:
                for k in run[i:j - 1]:
                    out[k] = with_tone(base(syls[k]), 2)
            i = max(j, i + 1)
        # 一 and 不, on the written tone of the next syllable
        for pos, k in enumerate(run[:-1]):
            ch, syl, nk = chars[k], syls[k], run[pos + 1]
            if not ((ch == "一" and syl == _YI) or (ch == "不" and syl == _BU)):
                continue
            nt = tone(syls[nk])
            if nt == 5:
                nt = _full_tone(chars[nk], base(syls[nk]))
                if nt is None:
                    continue
            if ch == "不":
                if nt == 4:
                    out[k] = _BU_2
            elif not _yi_stays(rtext, k - r0, spans):
                out[k] = _YI_2 if nt == 4 else _YI_4
    return " ".join(out)


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
