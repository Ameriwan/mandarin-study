"""Library and placement data (M4, MASTER_PROMPT §5.6, §5.7, §8.7): docs/data/library-words.json, grammar.json,
patterns.json, measure-words.json, taiwan-vs-mainland.json, phrasebook.json, placement.json and search.json.

Licensing (§8.7, §7.5): from the TBCL lists only the word, its level and its 情境 (topic) and the grammar point's
name and level are published, never TBCL's example sentences or frequency columns (frequency only picks the
placement's level-5 sample). English glosses come from CC-CEDICT (CC BY-SA 4.0): every file that carries them
(CEDICT_FILES: library-words.json, search.json, placement.json, characters.json) is BY-SA and says so in its
`license` field (gloss_license), and CC-CEDICT's own notice with a note of our changes travels as
docs/data/cedict-license.txt (publish_cedict_license); its "Taiwan pr." notes only help pick the entry, never give
a Zhuyin. Zhuyin comes from TBCL / MOE
through the verifier rules (§9.3), in base tones; pinyin from tools/pinyin.py.

Audio (§7.6 size budget): the Library's word audio is streamed from the moedict CDN (`id`, played from `s`, the
headword span); the span is measured from a cache-only download (audio.stream_spans), capped per build and
resumable. Sentences (grammar examples, patterns, phrasebook, measure-word and Taiwan-usage examples, placement
listening items) get gTTS audio, labelled TTS; placement's single-word listening items and the pronunciation
diagnostic play self-hosted MOE clips (core set).
"""
import json
import re
import zipfile
from functools import lru_cache
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402
import pinyin  # noqa: E402
import verify  # noqa: E402

LIB = moe.CONTENT / "library"
PLACEMENT = moe.CONTENT / "placement"
WORD_LEVELS = moe.TBCL_LEVELS[:8]          # 第1級 .. 第4*級
L5, VOCAB_L5_N = "第5級", 40
CEDICT_ZIP = moe.CACHE / "cedict" / "cedict_1_0_ts_utf-8_mdbg.zip"
EN_SENSES, EN_SENSES_MAX, EN_SENSE_MAX, EN_CHARS = 3, 6, 60, 80

# ---------------------------------------------------------------- CC-CEDICT license (CC BY-SA 4.0, §7.5)
BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/"
CEDICT_LICENSE_PATH = "data/cedict-license.txt"   # relative to docs/; publish_cedict_license() writes it
CEDICT_ATTRIBUTION = ("CC-CEDICT, Community maintained free Chinese-English dictionary, published by MDBG "
                      "(https://www.mdbg.net/chinese/dictionary?page=cc-cedict); referenced work: CEDICT - Copyright (C) "
                      "1997, 1998 Paul Andrew Denisowski")
CEDICT_CHANGES = ("modified for this app: for each word the CC-CEDICT entries that match its Taiwan reading are "
                  "chosen; senses are selected and reordered (Taiwan senses first, classical ones last, 3 to 6 of "
                  "them); simplified forms, pinyin and CL: lists are removed from the senses (CL: measure words are "
                  "kept apart, traditional characters only); long senses and glosses are cut short with '…'; "
                  "search.json lowercases them; a radical's meaning in characters.json is its character's gloss, "
                  "cut to 48 characters")
CEDICT_FILES = {   # every published file that carries CC-CEDICT text, and where in it
    "data/library-words.json": "words[].en (English glosses), words[].cl (measure words from CL: lists)",
    "data/search.json": "the last column of each row (the English gloss, lowercased)",
    "data/placement.json": "vocab_l5[].en",
    "data/characters.json": "radicals[].meaning",
}


def gloss_license(**fields):
    """The `license` field of a published file that carries CC-CEDICT glosses (CC BY-SA 4.0 §3(a)): the file is
    shared under CC BY-SA 4.0, with CC-CEDICT's attribution, the notice file and a note that the glosses were
    modified. `fields` add the credits of the file's other parts (TBCL, MOE ...)."""
    return {"name": "CC BY-SA 4.0", "url": BY_SA, "path": CEDICT_LICENSE_PATH,
            "file": f"This file is shared under CC BY-SA 4.0 ({BY_SA}) because it carries CC-CEDICT glosses; "
                    f"CC-CEDICT's notice travels as {CEDICT_LICENSE_PATH}",
            "attribution": CEDICT_ATTRIBUTION, "modified": CEDICT_CHANGES, **fields}


WORDS_LICENSE = gloss_license(
    glosses="words[].en and words[].cl: English glosses and measure words from CC-CEDICT (MDBG), CC BY-SA 4.0, modified",
    levels="Words, levels and topics: 臺灣華語文能力基準 (TBCL), 國家教育研究院 NAER",
    zhuyin="Zhuyin checked against TBCL and the MOE 國語辭典簡編本 / 重編國語辭典修訂本 (base tones)",
    audio="MOE 國語辭典簡編本 recordings, streamed from the moedict CDN (CC BY-ND 3.0 TW, unmodified)",
)
SEARCH_LICENSE = gloss_license(
    glosses="the last column of each row: the English gloss from CC-CEDICT (MDBG), CC BY-SA 4.0, modified (lowercased)",
    levels="Library words: 臺灣華語文能力基準 (TBCL), 國家教育研究院 NAER",
    rows="[type, key, zh, zhuyin, zhuyin_no_tones, pinyin_no_tones, english_lower]",
)
PLACEMENT_LICENSE = gloss_license(
    vocab_l5="vocab_l5: TBCL 第5級 words (國家教育研究院 NAER) with an English gloss from CC-CEDICT (MDBG), CC BY-SA 4.0, "
             "modified",
    questions="questions and diagnostic: our writing; their MOE clips are 國語辭典簡編本 recordings (CC BY-ND 3.0 TW, "
              "unmodified; see data/moe-license-concised.txt)",
)


def cedict_notice():
    """CC-CEDICT's own notice: the comment header of the cached release (title, publisher, license, referenced
    works, version lines), unchanged. None when the release is not cached."""
    if not CEDICT_ZIP.exists():
        return None
    head = []
    with zipfile.ZipFile(CEDICT_ZIP) as z, z.open(z.namelist()[0]) as f:
        for raw in f:
            line = raw.decode("utf-8").rstrip("\r\n")
            if not line.startswith("#"):
                break
            head.append(line)
    return "\n".join(head) if head else None


def cedict_license_text():
    """docs/data/cedict-license.txt: CC-CEDICT's notice as it wrote it, the changes made (BY-SA 4.0 §3(a)(1)(B))
    and the files that carry the modified glosses. None without the cached release."""
    notice = cedict_notice()
    if not notice:
        return None
    files = "\n".join(f"  {p}: {where}" for p, where in CEDICT_FILES.items())
    return (f"The English glosses on this site come from CC-CEDICT and are shared under the Creative Commons\n"
            f"Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0): {BY_SA}\n\n"
            f"Attribution: {CEDICT_ATTRIBUTION}\n\n"
            f"CC-CEDICT's own notice, unchanged from the header of the release used ({CEDICT_ZIP.name}):\n\n"
            f"{notice}\n\n"
            f"Changes (CC BY-SA 4.0, section 3(a)(1)(B)): the glosses are {CEDICT_CHANGES}.\n\n"
            f"Files that carry these modified glosses, shared under CC BY-SA 4.0 (their `license` field says so and "
            f"credits their other sources):\n{files}\n")


def publish_cedict_license():
    """Write docs/data/cedict-license.txt (§7.5: the BY-SA glosses travel with CC-CEDICT's notice and a note that
    they were modified). Returns why it could not, or None."""
    text = cedict_license_text()
    if not text:
        return f"{CEDICT_ZIP.relative_to(moe.ROOT).as_posix()} is missing (CC-CEDICT's notice cannot be published)"
    dst = moe.DOCS / CEDICT_LICENSE_PATH
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text, encoding="utf-8", newline="\n")
    return None


def short_level(level):
    """'第1*級' -> '1*' ('' if not a TBCL level)."""
    m = re.search(r"(\d)\s*(\*)?", str(level or ""))
    return (m.group(1) + (m.group(2) or "")) if m else ""


def all_cjk(w):
    return bool(w) and all(moe._is_cjk(c) for c in w)


# ---------------------------------------------------------------- CC-CEDICT glosses

CEDICT_LINE = re.compile(r"^(\S+) (\S+) \[([^\]]*)\] /(.*)/\s*$")
REF = re.compile(r"([^\s|\[\],;()]+)\|[^\s\[\],;()]+\[[^\]]*\]|([^\s|\[\],;()]+)\[[^\]]*\]")
TARGET = re.compile(r"^(?:(?:old|archaic|ancient|erhua|Taiwan|Japanese|non-standard|unofficial) )*"
                    r"(?:variant of|see|see also|same as) ([^\s|\[,;]+)")
SKIP = re.compile(r"^(?:Taiwan pr\.|also pr\.|colloquial pr\.|pr\. |also written|surname [A-Z])")
PR_NOTE = re.compile(r"(?:Taiwan|also|colloquial) pr\. \[([^\]]*)\]")
CL = re.compile(r"\(?\bCL:([^)/]*)\)?")
OLD = re.compile(r"^\((?:classical|literary|archaic|old|dialect|obsolete)\)")
# character variants tried when CC-CEDICT lacks the TBCL spelling (lookup only; the published word keeps TBCL's form)
VARIANTS = {"甚": "什", "周": "週", "週": "周", "份": "分", "唸": "念", "表": "錶", "臺": "台", "台": "臺", "着": "著",
            "板": "闆", "汙": "污", "溼": "濕", "菸": "煙", "鍊": "鏈", "裏": "裡", "裡": "裏", "群": "羣", "峯": "峰",
            "綫": "線", "麪": "麵", "癡": "痴", "啓": "啟", "牀": "床", "爲": "為", "衆": "眾", "姊": "姐"}


def cedict_key(p):
    """CEDICT pinyin -> our numbered() form: lowercase, u: -> v, single spaces."""
    return re.sub(r"\s+", " ", p.lower().replace("u:", "v").replace("ü", "v")).strip()


@lru_cache(maxsize=None)
def cedict():
    """{traditional: [(numbered pinyin key, capitalised?, [senses])]} from the cached CC-CEDICT zip."""
    out = {}
    if not CEDICT_ZIP.exists():
        return out
    with zipfile.ZipFile(CEDICT_ZIP) as z:
        text = z.read(z.namelist()[0]).decode("utf-8")
    for line in text.splitlines():
        if line.startswith("#"):
            continue
        m = CEDICT_LINE.match(line)
        if m:
            trad, _, py, defs = m.groups()
            out.setdefault(trad, []).append((cedict_key(py), py[:1].isupper(), defs.split("/")))
    return out


def cedict_entries(w):
    """CC-CEDICT entries of `w`, else of a variant spelling (臺/台, 周/週 ... one kind at a time, then all)."""
    C = cedict()
    if w in C:
        return C[w]
    forms = [w.replace(c, v) for c, v in VARIANTS.items() if c in w]
    forms.append("".join(VARIANTS.get(c, c) for c in w))
    return next((C[f] for f in forms if f in C), [])


def clean_sense(s):
    """A CEDICT sense without simplified forms, pinyin and CL: lists: 'see 一點|一点[yi1 dian3]' -> 'see 一點'."""
    s = CL.sub("", s)
    s = REF.sub(lambda m: m.group(1) or m.group(2), s)
    return re.sub(r"\s+", " ", s).replace("()", "").strip(" ;,")


def trim(s, n=EN_SENSE_MAX):
    """At most n characters, cut at a word; an opened bracket left unclosed is cut off when enough remains."""
    if len(s) <= n:
        return s
    t = s[:n - 1].rsplit(" ", 1)[0].rstrip(",;")
    if t.count("(") > t.count(")"):
        if t.rfind("(") >= 12:
            return t[:t.rfind("(")].rstrip(" ,;") + "…"
        return t + "…)"
    return t + "…"


def entry_groups(w, z, loose=False):
    """Candidate CEDICT entry groups of `w` for our reading `z`, best first: exact numbered pinyin; entries whose
    "Taiwan pr." / "also pr." / "colloquial pr." note gives it; the same syllables with the fewest tone differences;
    with `loose`, any entry. Lower-case (common word) entries first within a group."""
    ents = cedict_entries(w)
    want = pinyin.numbered(z) or ""
    order = lambda e: e[1]                                   # noqa: E731 - capitalised (proper noun) last
    groups = [sorted((e for e in ents if e[0] == want), key=order),
              sorted((e for e in ents if any(cedict_key(x) == want for d in e[2] for x in PR_NOTE.findall(d))), key=order)]
    bare = re.sub(r"\d", "", want)
    near = [e for e in ents if re.sub(r"\d", "", e[0]) == bare]
    if near:
        diff = lambda e: sum(a != b for a, b in zip(e[0].split(), want.split()))   # noqa: E731
        best = min(map(diff, near))
        groups.append(sorted((e for e in near if diff(e) == best), key=order))
    ws = bare.split()
    if len(ws) >= 2:   # a Taiwan reading CEDICT lacks (成熟 ㄔㄥˊ ㄕㄡˊ: cheng2 shu2): one syllable differs at most
        far = lambda e: sum(a != b for a, b in zip(re.sub(r"\d", "", e[0]).split(), ws))   # noqa: E731
        groups.append(sorted((e for e in ents if len(e[0].split()) == len(ws) and far(e) == 1), key=order))
    if loose:
        groups.append(sorted(ents, key=order))
    return [g for g in groups if g]


def senses_of(entries):
    """(senses, old-style senses, pointer targets, measure words) of a group of CEDICT entries. Taiwan senses
    ("(Tw) scooter" for 機車) come first, slang last among them; then the rest; classical / archaic ones last."""
    tw, modern, old, targets, cls = [], [], [], [], []
    for _, _, senses in entries:
        for d in senses:
            d = d.strip()
            for m in CL.finditer(d):
                for part in m.group(1).split(","):
                    t = re.split(r"[|\[]", part.strip())[0]
                    if t and t not in cls:
                        cls.append(t)
            if not d or d.startswith("CL:") or SKIP.match(d):
                continue
            m = TARGET.match(d)
            if m:
                targets.append(m.group(1))
                continue
            c = clean_sense(d)
            if c and c not in tw + modern + old:
                (tw if c.startswith("(Tw)") and "slang" not in c else old if OLD.match(c) else modern).append(c)
    return tw + modern, old, targets, cls


def gloss(w, z, depth=0):
    """(English: the first EN_SENSES senses, trimmed, '; '-joined; [measure words, traditional]) from CC-CEDICT, from
    the first entry group (entry_groups) that has a real sense. A group that only points elsewhere (variant of / see
    X) is followed once."""
    targets, cls = [], []
    for g in entry_groups(w, z, loose=depth > 0):
        modern, old, tg, cl = senses_of(g)
        cls += [c for c in cl if c not in cls]
        senses = [trim(s) for s in modern + old]
        if senses:
            n = EN_SENSES   # at least 3 senses, more while short (CEDICT splits synonyms: 便當 convenient/handy/easy/bento)
            while n < min(len(senses), EN_SENSES_MAX) and len("; ".join(senses[:n + 1])) <= EN_CHARS:
                n += 1
            return "; ".join(senses[:n]), cls
        targets += tg
    if depth == 0:
        for t in dict.fromkeys(targets):
            if t != w:
                en, cl2 = gloss(t, z, depth=1)
                if en:
                    return en, cls or cl2
    return "", cls


# ---------------------------------------------------------------- word readings (§9.3)

def moe_first(w):
    """The first-listed MOE reading of `w` (簡編本, else 修訂本), normalised, or None."""
    for src in ("concised", "revised"):
        rs = moe.readings()[src].get(w)
        if rs:
            return moe.norm(rs[0]["z"])
    return None


def only_sandhi_or_neutral(w, r, m):
    """True when the TBCL reading `r` differs from the MOE reading `m` only by 一/不/3+3 sandhi or a neutral tone."""
    if r == m or not verify.same_bases(r, m):
        return False
    if verify.sandhi_diff(r, m, w):
        return True
    rs, ms = moe.syllables(r), moe.syllables(m)
    chars = w if len(w) == len(rs) else ""
    for k, (a, b) in enumerate(zip(rs, ms)):
        if a != b and not (moe.tone(a) == 5 or moe.tone(b) == 5 or (chars and chars[k] in "一不")):
            return False
    return True


def moe_choice(w, r):
    """The MOE reading to teach instead of the TBCL reading `r` that only warns, or None to keep `r`:
    - a MOE reading with the same syllables that differs only by sandhi / neutral tone (§6.4: spell as MOE does:
      一定 ㄧˊ ㄉㄧㄥˋ -> ㄧ ㄉㄧㄥˋ, 噢 ˙ㄛ -> ㄛ);
    - else, when TBCL and MOE disagree (§9.3), a first-listed MOE reading close to `r` (same syllables, or one
      syllable different in a longer word) that both MOE dictionaries give, or that has MOE audio when `r` has
      none (為什麼 ˙ㄇㄛ -> ˙ㄇㄜ, 喂 ㄨㄟˊ -> ㄨㄟˋ). 台 ㄊㄞˊ stays: 簡編本 ㄧˊ and 修訂本 ㄊㄞ disagree, no audio."""
    found = [(z, src, k) for z, src, k in moe.word_readings(w) if src != "TBCL"]
    near = [z for z, _, k in found if k in ("main", "alt") and verify.same_bases(z, r)]
    if near and only_sandhi_or_neutral(w, r, near[0]):
        return near[0]
    mains = {}
    for z, src, k in found:
        if k == "main":
            mains.setdefault(src, z)
    agreed = len(mains) == 2 and len(set(mains.values())) == 1

    def close(z):
        a, b = moe.syllables(z), moe.syllables(r)
        d = sum(moe.base(x) != moe.base(y) for x, y in zip(a, b))
        return len(a) == len(b) and (d == 0 or (len(a) >= 2 and d <= 1))

    for z in dict.fromkeys(mains.values()):
        if z != r and close(z) and (agreed or (moe.audio_id(w, z) and not moe.audio_id(w, r))):
            return z
    return None


def base_one_bu(w, r):
    """一 / 不 written with their sandhi tone -> base tone (ㄧ, ㄅㄨˋ), as MOE stores them (§6.4)."""
    syls = moe.syllables(r)
    if len(syls) != len(w):
        return r
    out = [("ㄧ" if c == "一" and s in verify.SANDHI_ONE else "ㄅㄨˋ" if c == "不" and s in verify.SANDHI_BU else s)
           for c, s in zip(w, syls)]
    return " ".join(out)


def full_for_unlisted_neutral(w, r):
    """A neutral syllable whose character MOE never lists as neutral -> that character's first full-tone reading
    with the same base (阿嬤 ㄚ ˙ㄇㄚ -> ㄚ ㄇㄚ, as MOE spells 阿媽)."""
    syls = moe.syllables(r)
    if len(syls) != len(w):
        return r
    out = []
    for c, s in zip(w, syls):
        listed = verify.listed(c)
        if moe.tone(s) == 5 and s not in listed:
            s = next((x for x in sorted(listed) if moe.base(x) == moe.base(s) and moe.tone(x) != 5), s)
        out.append(s)
    return " ".join(out)


def tbcl_only(w, r, notes):
    """A TBCL word MOE does not have: checked character by character (verify.check_chars), with 一/不 in base tone
    and a neutral tone MOE never lists for the character respelled. Returns the reading or None (logged)."""
    z = full_for_unlisted_neutral(w, base_one_bu(w, r))
    st, why = verify.check_chars(w, moe.syllables(z), None)
    if st == "fail":
        notes["tbcl_fail"].append(f"{w} {r} (TBCL only; per character: {why})")
        return None
    if z != r:
        notes["respelled"].append(f"{w} {r} -> {z} (TBCL only)")
    if st == "warn":
        notes["kept_warn"].append(f"{w} {z} (TBCL only; {why})")
    return z


def verified_readings(w, tbcl_readings, notes):
    """The readings the Library teaches for `w`, in TBCL order, none failing the verifier:
    - a TBCL reading that is ok;
    - one that only warns: moe_choice() when it has one (logged), else the TBCL reading itself (a listed reading,
      logged with its ⚑); when MOE lists it only as a 語音 / 又音 / 讀音 variant, MOE's first-listed reading of the
      same length goes before it;
    - a word MOE does not have at all: tbcl_only();
    - a failing TBCL reading is left out (logged).
    With none left, MOE's first-listed reading if it is ok. Empty = the word is dropped."""
    out = []
    in_moe = any(src != "TBCL" for _, src, _ in moe.word_readings(w))
    first = moe_first(w)
    for r in tbcl_readings:
        z = None
        if not in_moe and len(w) > 1:
            z = tbcl_only(w, r, notes)
        else:
            st, why = verify.check(w, r)
            if st == "ok":
                z = r
            elif st == "warn":
                m = moe_choice(w, r)
                if m and verify.check(w, m)[0] != "fail":
                    z = m
                    notes["respelled"].append(f"{w} {r} -> {m}")
                else:
                    z = r
                    notes["kept_warn"].append(f"{w} {r} ({why})")
                    if ("lists it only as" in why and first and first not in out
                            and len(moe.syllables(first)) == len(moe.syllables(r)) and verify.check(w, first)[0] == "ok"):
                        out.append(first)
            else:
                notes["tbcl_fail"].append(f"{w} {r} ({why})")
        if z and z not in out:
            out.append(z)
    if not out and first and verify.check(w, first)[0] == "ok":
        out.append(first)
        notes["moe_only"].append(f"{w} {first}")
    return out


def word_rows(levels, notes, spans):
    """[{w, z, p, lv, t, en, cl, id, s, sp?}] for the TBCL forms at `levels`, one row per verified reading."""
    rows = []
    for w, t in moe.tbcl_words().items():
        if t["level"] not in levels:
            continue
        if not all_cjk(w):
            notes["dropped"].append(f"{w} (not all Chinese characters)")
            continue
        zs = verified_readings(w, t["readings"], notes)
        if not zs:
            notes["dropped"].append(f"{w} {t['zhuyin'] or '(no TBCL Zhuyin)'}")
            continue
        for z in zs:
            p = pinyin.word(z)
            en, cl = gloss(w, z)
            if not en:
                notes["no_gloss"].append(f"{w} {z}")
            aid = moe.audio_id(w, z)
            row = {"w": w, "z": z, "p": p or "", "lv": short_level(t["level"]), "t": t["situation"] or "",
                   "en": en, "cl": cl, "id": str(aid) if aid else None, "s": span_of(spans, aid)}
            sp = moe.spoken(w, z)
            if sp != z:
                row["sp"] = sp
            rows.append(row)
    return rows


def span_of(spans, aid):
    """[start, end] of the measured headword span of MOE clip `aid`, or None."""
    e = spans.get(str(aid)) if aid else None
    return [e["start"], e["end"]] if e else None


def vocab_l5(spans, n=VOCAB_L5_N, pool=10):
    """placement.vocab_l5: n TBCL 第5級 content words (two or more characters, one reading that is ok by the verifier,
    a gloss that is not a grammar note), every `pool`-th of them by frequency, so the sample spans the level
    (frequency only selects; it is not published)."""
    T = moe.tbcl_words()
    cands = sorted((w for w, t in T.items() if t["level"] == L5 and len(w) >= 2 and all_cjk(w)),
                   key=lambda w: (-(T[w]["wfreq"] + T[w]["sfreq"]), w))
    ok = []
    for w in cands:
        if len(ok) >= n * pool:
            break
        zs = [r for r in T[w]["readings"] if verify.check(w, r)[0] == "ok"]
        if len(zs) != 1:
            continue
        en, _ = gloss(w, zs[0])
        if not en or en.startswith("(") or en.lower().startswith(("variant", "see ", "used in", "abbr")):
            continue
        ok.append((w, zs[0], en))
    step = max(1, len(ok) // n)
    out = []
    for w, z, en in ok[::step][:n]:
        aid = moe.audio_id(w, z)
        out.append({"w": w, "z": z, "p": pinyin.word(z) or "", "lv": "5", "en": en,
                    "id": str(aid) if aid else None, "s": span_of(spans, aid)})
    return out


# ---------------------------------------------------------------- sentence collections

def sentence(zh, zhuyin, bank, prefix=""):
    """{zh, zhuyin (normalised), spoken, audio (gTTS key; finish() swaps it for the docs path)} with key prefix."""
    z = moe.norm(zhuyin)
    return {f"{prefix}zh": zh, f"{prefix}zhuyin": z, f"{prefix}spoken": moe.spoken(zh, z),
            f"{prefix}audio": bank.want_tts(zh) if zh and z else None}


def load_grammar():
    """Every point of content/library/grammar/*.json, by TBCL 序號."""
    pts = []
    for p in sorted((LIB / "grammar").glob("*.json")):
        data = moe.read_json(p, default=[]) or []
        pts += data if isinstance(data, list) else data.get("points", [])
    return sorted(pts, key=lambda g: (int(g.get("tbcl") or 9999), g.get("id", "")))


def build_grammar(bank, notes, points=None):
    """grammar.json: the points with spoken + TTS audio on every example (the mistake's corrected sentence gets
    them in build_grammar_rights, after every other sentence has asked for TTS)."""
    out = []
    for g in (load_grammar() if points is None else points):
        e = dict(g)
        e["examples"] = [{**x, **sentence(x["zh"], x["zhuyin"], bank)} for x in g.get("examples", []) if x.get("zh")]
        if len(e["examples"]) < 3:
            notes["content"].append(f"grammar {g.get('id')}: {len(e['examples'])} examples (§9.2: at least 3)")
        out.append(e)
    return out


def build_grammar_rights(grammar, bank, notes):
    """Each mistake's corrected sentence: spoken + audio, from right_zhuyin or from the example it repeats."""
    for g in grammar:
        m = g.get("mistake")
        if not isinstance(m, dict) or not m.get("right"):
            continue
        z = m.get("right_zhuyin") or next((x["zhuyin"] for x in g["examples"] if x["zh"] == m["right"]), "")
        if not z:
            notes["content"].append(f"grammar {g.get('id')}: mistake.right {m['right']} has no right_zhuyin and is no example")
            continue
        s = sentence(m["right"], z, bank)
        m.update({"right_zhuyin": s["zhuyin"], "right_spoken": s["spoken"], "right_audio": s["audio"]})


def check_grammar_names(grammar, notes):
    """Each point's `pattern` and `level` against the TBCL 語法點表 row of its 序號 (logged, not fatal)."""
    p = moe.CACHE / "tbcl" / "語法點表_112-01-04.xlsx"
    if not p.exists():
        return
    import openpyxl
    rows = {}
    ws = openpyxl.load_workbook(p, read_only=True).worksheets[0]
    for r in list(ws.iter_rows(values_only=True))[1:]:
        if r[0]:
            rows[int(r[0])] = (str(r[1] or "").strip(), str(r[3] or "").strip())
    for g in grammar:
        want = rows.get(int(g.get("tbcl") or 0))
        if not want:
            notes["content"].append(f"grammar {g.get('id')}: TBCL 序號 {g.get('tbcl')} not in the 語法點表")
        elif (g.get("pattern"), g.get("level")) != want:
            notes["content"].append(f"grammar {g.get('id')}: {g.get('pattern')} {g.get('level')} vs TBCL {want[0]} {want[1]}")


def word_audio(zh, z, spans):
    """{id, s} for a single word with an exact-reading MOE clip (streamed like the Library words)."""
    aid = moe.audio_id(zh, z) if zh and z else None
    return {"id": str(aid) if aid else None, "s": span_of(spans, aid)}


def build_patterns(bank, rows=None):
    rows = moe.read_csv(LIB / "patterns.csv") if rows is None else rows
    return [{"id": r["id"], "level": r.get("level", ""), "pattern": r.get("pattern", ""),
             **sentence(r["zh"], r["zhuyin"], bank), "en": r.get("en", ""), "situation": r.get("situation", "")}
            for r in rows if r.get("zh") and r.get("zhuyin")]


def build_phrasebook(bank, rows=None):
    rows = moe.read_csv(LIB / "phrasebook.csv") if rows is None else rows
    return [{"id": r["id"], "situation": r.get("situation", ""), **sentence(r["zh"], r["zhuyin"], bank),
             "en": r.get("en", ""), "level": r.get("level", ""), "note": r.get("note", "")}
            for r in rows if r.get("zh") and r.get("zhuyin")]


def build_mistakes(rows=None):
    """my-mistakes.json: the CORRECT log (content/library/my-mistakes.csv) for the Library's My mistakes tab;
    an empty list while nothing is logged, so the page never asks for a file that does not exist."""
    path = LIB / "my-mistakes.csv"
    rows = (moe.read_csv(path) if path.exists() else []) if rows is None else rows
    keys = ("date", "wrong", "right", "right_zhuyin", "why_en", "pattern_id")
    return [{k: r.get(k, "") for k in keys} for r in rows if r.get("wrong") or r.get("right")]


def build_measure_words(bank, spans, rows=None):
    rows = moe.read_csv(LIB / "measure-words.csv") if rows is None else rows
    out = []
    for r in rows:
        z = moe.norm(r.get("zhuyin", ""))
        e = {"zh": r["zh"], "zhuyin": z, "spoken": moe.spoken(r["zh"], z), "p": pinyin.word(z) or "",
             "en": r.get("en", ""), "used_for": r.get("used_for", ""), "level": r.get("level", ""),
             **word_audio(r["zh"], z, spans)}
        if r.get("example_zh") and r.get("example_zhuyin"):
            e.update(sentence(r["example_zh"], r["example_zhuyin"], bank, "example_"))
            e["example_en"] = r.get("example_en", "")
        out.append(e)
    return out


def build_taiwan(bank, spans, rows=None):
    rows = moe.read_csv(LIB / "taiwan-vs-mainland.csv") if rows is None else rows
    out = []
    for r in rows:
        z = moe.norm(r.get("taiwan_zhuyin", ""))
        e = {"taiwan": r["taiwan"], "taiwan_zhuyin": z, "spoken": moe.spoken(r["taiwan"], z) if z else "",
             "p": (pinyin.word(z) or "") if z else "", "mainland": r.get("mainland", ""), "en": r.get("en", ""),
             "category": r.get("category", ""), "type": r.get("type", "")}
        if z and len(moe.syllables(z)) <= 4:
            e.update(word_audio(r["taiwan"], z, spans))
        if r.get("example_zh") and r.get("example_zhuyin"):
            e.update(sentence(r["example_zh"], r["example_zhuyin"], bank, "example_"))
            e["example_en"] = r.get("example_en", "")
        out.append(e)
    return out


def build_placement(bank, notes, spans, questions=None, diagnostic=None):
    """placement.json: questions (TTS key or self-hosted MOE clip of the exact reading), diagnostic words (MOE
    clip + model contour, core set), vocab_l5."""
    questions = moe.read_json(PLACEMENT / "questions.json", default=[]) if questions is None else questions
    diagnostic = moe.read_json(PLACEMENT / "diagnostic.json", default=[]) if diagnostic is None else diagnostic
    qs = []
    for n, q in enumerate(questions or []):
        z = moe.norm(q.get("zhuyin", ""))
        e = {**q, "zhuyin": z, "spoken": moe.spoken(q["zh"], z), "id": None}
        a = str(q.get("audio") or "")
        if a.startswith("moe:"):
            word = a[4:] or q["zh"]
            aid = moe.audio_id(word, z)
            if aid:
                e["id"] = bank.want_moe(aid, priority=0, nsyl=len(moe.syllables(z)))
                e["audio"] = None
            else:
                notes["content"].append(f"placement question {n} {word} {z}: no exact-reading MOE clip, TTS instead")
                e["audio"] = bank.want_tts(q["zh"])
        elif a == "tts" or (q.get("skill") == "listening" and not a):
            e["audio"] = bank.want_tts(q["zh"])
        else:
            e["audio"] = None
        qs.append(e)
    diag = []
    for d in diagnostic or []:
        z = moe.norm(d.get("zhuyin", ""))
        aid = moe.audio_id(d["zh"], z)
        if not aid:
            notes["content"].append(f"diagnostic {d['zh']} {z}: no exact-reading MOE clip (left out by the page)")
        diag.append({**d, "zhuyin": z, "spoken": moe.spoken(d["zh"], z),
                     "id": bank.want_moe(aid, priority=0, nsyl=len(moe.syllables(z))) if aid else None})
    return {"license": PLACEMENT_LICENSE, "questions": qs, "diagnostic": diag, "vocab_l5": vocab_l5(spans)}


# ---------------------------------------------------------------- the whole Library

def new_notes():
    return {k: [] for k in ("respelled", "kept_warn", "tbcl_fail", "moe_only", "dropped", "no_gloss", "content")}


def build(bank, spans=None, log=print):
    """Everything the Library and the Plan page read, with TTS keys still in place (finish() swaps them).
    TTS is asked for in priority order (a --max-tts cap cuts the tail): placement, phrasebook, patterns, grammar
    examples, measure-word and Taiwan-usage examples, then the grammar mistakes' corrected sentences."""
    import audio
    spans = audio.load_spans() if spans is None else spans
    notes = new_notes()
    lib = {"placement": build_placement(bank, notes, spans)}
    lib["phrasebook"] = build_phrasebook(bank)
    lib["patterns"] = build_patterns(bank)
    lib["grammar"] = build_grammar(bank, notes)
    lib["measure"] = build_measure_words(bank, spans)
    lib["taiwan"] = build_taiwan(bank, spans)
    build_grammar_rights(lib["grammar"], bank, notes)
    check_grammar_names(lib["grammar"], notes)
    lib["words"] = word_rows(WORD_LEVELS, notes, spans)
    lib["notes"] = notes
    log(f"  library: {len(lib['words'])} words ({len({w['w'] for w in lib['words']})} TBCL forms 第1級-第4*級), "
        f"{len(lib['grammar'])} grammar points, {len(lib['patterns'])} patterns, {len(lib['measure'])} measure words, "
        f"{len(lib['taiwan'])} Taiwan-usage rows, {len(lib['phrasebook'])} phrases; placement "
        f"{len(lib['placement']['questions'])} questions, {len(lib['placement']['diagnostic'])} diagnostic words, "
        f"{len(lib['placement']['vocab_l5'])} level-5 words")
    log("  library words: " + ", ".join(f"{k} {len(v)}" for k, v in notes.items() if k != "content"))
    return lib


def _swap(obj, key, index):
    if obj.get(key):
        obj[key] = (index.get(obj[key]) or {}).get("path")


def finish(lib, index):
    """After the audio is published: every TTS key -> its docs path (None when TTS failed or was capped: the page
    falls back to the browser voice, labelled)."""
    for g in lib["grammar"]:
        for x in g["examples"]:
            _swap(x, "audio", index)
        if isinstance(g.get("mistake"), dict):
            _swap(g["mistake"], "right_audio", index)
    for coll in ("patterns", "phrasebook"):
        for x in lib[coll]:
            _swap(x, "audio", index)
    for coll in ("measure", "taiwan"):
        for x in lib[coll]:
            _swap(x, "example_audio", index)
    for q in lib["placement"]["questions"]:
        _swap(q, "audio", index)


def tts_counts(lib):
    """(sentences with TTS audio, sentences in all) over every Library / placement sentence."""
    items = [x.get("audio") for g in lib["grammar"] for x in g["examples"]]
    items += [g["mistake"].get("right_audio") for g in lib["grammar"]
              if isinstance(g.get("mistake"), dict) and g["mistake"].get("right_spoken")]
    items += [x.get("audio") for c in ("patterns", "phrasebook") for x in lib[c]]
    items += [x.get("example_audio") for c in ("measure", "taiwan") for x in lib[c] if x.get("example_zh")]
    items += [q.get("audio") for q in lib["placement"]["questions"] if not q.get("id") and q.get("skill") == "listening"]
    return sum(1 for a in items if a), len(items)


def words_file(lib):
    return {"license": WORDS_LICENSE, "words": lib["words"]}


def search_file(rows):
    """search.json: {license, rows} (the rows carry CC-CEDICT glosses, so the file says it is CC BY-SA 4.0; the
    Library page reads `rows`)."""
    return {"license": SEARCH_LICENSE, "rows": rows}


# ---------------------------------------------------------------- search.json

def _row(type_, key, zh, z, en, p=None):
    z = moe.norm(z or "")
    if p is None:
        cjk = sum(1 for c in zh if moe._is_cjk(c))
        p = (pinyin.word(z, sep=" ") or "") if z and cjk == len(moe.syllables(z)) else ""
    bare = "".join(c for c in z if c not in "ˊˇˋ˙ ")
    return [type_, key, zh, z, bare, pinyin.strip_tones(p).replace("'", ""), (en or "").lower()]


def search_rows(lib, readings=()):
    """[type, key, zh, zhuyin, zhuyin_no_tones, pinyin_no_tones, english_lower] for every entry. Keys as the
    Library page makes them: words by their characters (+ '|' + Zhuyin without spaces when a word has two
    readings), grammar / patterns / phrases by id, measure words and Taiwan readings by characters, Taiwan usage
    by its Taiwan form."""
    rows, count = [], {}
    for w in lib["words"]:
        count[w["w"]] = count.get(w["w"], 0) + 1
    for w in lib["words"]:
        key = w["w"] if count[w["w"]] == 1 else f"{w['w']}|{moe.squash(w['z'])}"
        rows.append(_row("word", key, w["w"], w["z"], w["en"], w["p"]))
    for g in lib["grammar"]:
        rows.append(_row("grammar", g["id"], g.get("pattern", ""), "", f"{g.get('title_en', '')} | {g.get('structure', '')}", ""))
    for x in lib["patterns"]:
        rows.append(_row("pattern", x["id"], x["zh"], x["zhuyin"], x["en"]))
    for x in lib["measure"]:
        rows.append(_row("measure", x["zh"], x["zh"], x["zhuyin"], f"{x['en']} | {x['used_for']}", x["p"]))
    for x in lib["taiwan"]:
        rows.append(_row("taiwan", x["taiwan"], x["taiwan"], x["taiwan_zhuyin"], x["en"], x["p"]))
    for x in readings:
        rows.append(_row("reading", x["zh"], x["zh"], x["zhuyin"], x.get("note", "")))
    for x in lib["phrasebook"]:
        rows.append(_row("phrase", x["id"], x["zh"], x["zhuyin"], x["en"]))
    return rows


# ---------------------------------------------------------------- streamed word audio: headword spans

def span_wants(lib):
    """{MOE id: syllables} of every streamed clip (Library words, measure words, Taiwan-usage words, level-5 words),
    in Library order (level 1 first); audio.stream_spans skips the ones whose span is known."""
    out = {}
    items = [(w["id"], w["z"]) for w in lib["words"]] + [(x["id"], x["z"]) for x in lib["placement"]["vocab_l5"]]
    items += [(x.get("id"), x["zhuyin"]) for x in lib["measure"]] + [(x.get("id"), x["taiwan_zhuyin"]) for x in lib["taiwan"]]
    for aid, z in items:
        if aid and aid not in out:
            out[aid] = len(moe.syllables(z))
    return out


def drop_clips(lib, gone):
    """Streamed entries (Library words, level-5 words, measure words, Taiwan usage) whose MOE clip cannot be had
    (gone: {id: why}, e.g. 404 on the moedict CDN or a failed download): `id` and `s` become None, so the page plays
    the labelled browser voice instead of a MOE button that fails. Returns ["<word> <id> (<why>)"] for the report."""
    out = []
    for x in lib["words"] + lib["placement"]["vocab_l5"] + lib["measure"] + lib["taiwan"]:
        aid = x.get("id")
        if aid and aid in gone:
            out.append(f"{x.get('w') or x.get('zh') or x.get('taiwan') or ''} {aid} ({gone[aid]})")
            x["id"], x["s"] = None, None
    return out


def apply_spans(lib, spans):
    """Fill `s` from the span cache. Returns how many streamed entries have one."""
    n = 0
    for x in lib["words"] + lib["placement"]["vocab_l5"] + lib["measure"] + lib["taiwan"]:
        if x.get("id"):
            x["s"] = span_of(spans, x["id"])
            n += x["s"] is not None
    return n


def report_lines(lib, notes_max=40):
    """build-report.md lines for the Library section."""
    n = lib["notes"]
    words = lib["words"]
    with_tts, total = tts_counts(lib)
    out = [f"library words: {len(words)} rows / {len({w['w'] for w in words})} TBCL forms (第1級-第4*級); "
           f"with an exact-reading MOE clip {sum(1 for w in words if w['id'])}, with a measured span "
           f"{sum(1 for w in words if w.get('s'))}, without an English gloss {len(n['no_gloss'])}",
           f"readings: {len(n['respelled'])} TBCL readings respelled as MOE spells them (sandhi / neutral tone, or "
           f"TBCL and MOE disagree and MOE agrees with itself or has the audio, §9.3), "
           f"{len(n['kept_warn'])} kept with a ⚑, {len(n['tbcl_fail'])} TBCL readings failing the verifier left out, "
           f"{len(n['moe_only'])} words with MOE's reading only, {len(n['dropped'])} words dropped",
           f"grammar points {len(lib['grammar'])}, patterns {len(lib['patterns'])}, measure words {len(lib['measure'])}, "
           f"Taiwan-usage rows {len(lib['taiwan'])}, phrases {len(lib['phrasebook'])}",
           f"placement: {len(lib['placement']['questions'])} questions, {len(lib['placement']['diagnostic'])} diagnostic "
           f"words, {len(lib['placement']['vocab_l5'])} level-5 words",
           f"sentences with TTS audio: {with_tts} / {total} (the rest: browser voice, labelled)"]
    for k in ("dropped", "tbcl_fail", "respelled", "kept_warn", "no_gloss", "content"):
        if n[k]:
            out.append(f"{k} ({len(n[k])}): " + "; ".join(n[k][:notes_max]) + (" …" if len(n[k]) > notes_max else ""))
    return out
