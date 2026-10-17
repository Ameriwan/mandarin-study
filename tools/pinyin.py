"""Zhuyin -> Hanyu Pinyin (MASTER_PROMPT §8.7, §9.2: pinyin is derived by the build, never typed by hand).

Our own table, no library: every base syllable is spelled from its Zhuyin parts (initial + rhyme) by the standard
pinyin spelling rules (y/w at the start, iou -> iu, uei -> ui, uen -> un, ü -> u after j q x and y, the empty
rhyme of zh ch sh r z c s -> i), and the tone mark goes on a/e, else the o of ou, else the last vowel.
tools/test_library.py checks the table against the paired bopomofo/pinyin columns of the TBCL 詞語表.

    syllable("ㄌㄩˋ") -> "lǜ"        word("ㄒㄧ ㄢ") ...       numbered("ㄌㄩˋ") -> "lv4" (CC-CEDICT style)
    word("ㄧ ㄉㄧㄢˇ ㄦ") -> "yīdiǎnr" (a toneless or neutral ㄦ after a syllable is 兒化 r)
"""
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402

INITIAL = dict(zip("ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ",
                   ["b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x",
                    "zh", "ch", "sh", "r", "z", "c", "s"]))
# rhyme (medial + final) -> (spelling after an initial, spelling on its own)
RHYME = {
    "": ("i", None),                     # the empty rhyme of ㄓㄔㄕㄖㄗㄘㄙ (zhi, si)
    "ㄚ": ("a", "a"), "ㄛ": ("o", "o"), "ㄜ": ("e", "e"), "ㄝ": ("ê", "ê"), "ㄞ": ("ai", "ai"), "ㄟ": ("ei", "ei"),
    "ㄠ": ("ao", "ao"), "ㄡ": ("ou", "ou"), "ㄢ": ("an", "an"), "ㄣ": ("en", "en"), "ㄤ": ("ang", "ang"),
    "ㄥ": ("eng", "eng"), "ㄦ": ("er", "er"),
    "ㄧ": ("i", "yi"), "ㄧㄚ": ("ia", "ya"), "ㄧㄛ": ("io", "yo"), "ㄧㄝ": ("ie", "ye"), "ㄧㄞ": ("iai", "yai"),
    "ㄧㄠ": ("iao", "yao"), "ㄧㄡ": ("iu", "you"), "ㄧㄢ": ("ian", "yan"), "ㄧㄣ": ("in", "yin"),
    "ㄧㄤ": ("iang", "yang"), "ㄧㄥ": ("ing", "ying"),
    "ㄨ": ("u", "wu"), "ㄨㄚ": ("ua", "wa"), "ㄨㄛ": ("uo", "wo"), "ㄨㄞ": ("uai", "wai"), "ㄨㄟ": ("ui", "wei"),
    "ㄨㄢ": ("uan", "wan"), "ㄨㄣ": ("un", "wen"), "ㄨㄤ": ("uang", "wang"), "ㄨㄥ": ("ong", "weng"),
    "ㄩ": ("ü", "yu"), "ㄩㄝ": ("üe", "yue"), "ㄩㄢ": ("üan", "yuan"), "ㄩㄣ": ("ün", "yun"), "ㄩㄥ": ("iong", "yong"),
}
MARKS = {1: "̄", 2: "́", 3: "̌", 4: "̀"}   # combining macron, acute, caron, grave


@lru_cache(maxsize=None)
def base_syllable(b):
    """Toneless pinyin of a base Zhuyin syllable (no tone mark), or None if it is not a syllable we know."""
    ini, med, fin = moe.split_syllable(b)
    if ini and ini not in INITIAL:
        return None
    rhyme = RHYME.get(med + fin)
    if rhyme is None:
        return None
    if not ini:
        return rhyme[1]
    if med + fin == "" and ini not in "ㄓㄔㄕㄖㄗㄘㄙ":
        return None
    r = rhyme[0]
    if ini in "ㄐㄑㄒ" and r.startswith("ü"):
        r = "u" + r[1:]                  # ju, que, xuan, jun
    return INITIAL[ini] + r


def mark(p, t):
    """Put tone t (1-4; 5 = neutral, no mark) on the right vowel of a toneless pinyin syllable."""
    if t not in MARKS:
        return p
    vowels = [i for i, c in enumerate(p) if c in "aeiouüê"]
    if not vowels:
        return p
    if "a" in p:
        i = p.index("a")
    elif "e" in p or "ê" in p:
        i = p.index("e") if "e" in p else p.index("ê")
    elif "ou" in p:
        i = p.index("o")
    else:
        i = vowels[-1]
    return unicodedata.normalize("NFC", p[:i + 1] + MARKS[t] + p[i + 1:])


def is_erhua(syl, k):
    """A toneless or neutral ㄦ after another syllable: the 兒化 r (一點兒 ㄧ ㄉㄧㄢˇ ㄦ)."""
    return k > 0 and moe.base(syl) == "ㄦ" and moe.tone(syl) in (1, 5)


def syllable(syl):
    """One toned Zhuyin syllable -> pinyin with its tone mark, or None if unknown."""
    p = base_syllable(moe.base(syl))
    return mark(p, moe.tone(syl)) if p else None


def word(z, sep=""):
    """A Zhuyin word or sentence -> pinyin: syllables joined by `sep` ("" = one word, with an apostrophe before a
    syllable that starts with a, o or e: xī'ān), 兒化 ㄦ as a final r. None if any syllable is unknown."""
    out = []
    for k, s in enumerate(moe.syllables(z)):
        if is_erhua(s, k):
            out[-1] += "r"
            continue
        p = syllable(s)
        if p is None:
            return None
        if out and not sep and unicodedata.normalize("NFD", p)[0] in "aoe":
            p = "'" + p
        out.append(p)
    return sep.join(out)


def numbered(z):
    """CC-CEDICT style numbered pinyin, syllables separated by spaces, ü as v, neutral 5, 兒化 r5:
    ㄌㄩˋ ˙ㄗ -> "lv4 zi5". None if any syllable is unknown."""
    out = []
    for k, s in enumerate(moe.syllables(z)):
        if is_erhua(s, k):
            out.append("r5")
            continue
        p = base_syllable(moe.base(s))
        if p is None:
            return None
        out.append(p.replace("ü", "v").replace("ê", "e") + str(moe.tone(s)))
    return " ".join(out)


def strip_tones(p):
    """Pinyin without tone marks (ü kept as u)."""
    s = unicodedata.normalize("NFD", p or "")
    return unicodedata.normalize("NFC", "".join(c for c in s if not unicodedata.combining(c))).replace("ü", "u")


def table():
    """{base Zhuyin syllable: toneless pinyin} for every base syllable the MOE 簡編本 / 修訂本 and TBCL use."""
    bases = set()
    for src in ("concised", "revised"):
        for rs in moe.readings()[src].values():
            for e in rs:
                bases.update(moe.base(s) for s in moe.syllables(e["z"]))
    for e in moe.tbcl_words().values():
        for z in e["readings"]:
            bases.update(moe.base(s) for s in moe.syllables(z))
    return {b: base_syllable(b) for b in sorted(bases) if b}
