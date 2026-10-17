"""Verify every Zhuyin string in content/ against MOE / TBCL data (MASTER_PROMPT §9.3).

    .venv\Scripts\python.exe tools\verify.py            check and print a summary
    .venv\Scripts\python.exe tools\verify.py --report   also write build-report.md (the build does this)

Rules
- Sources in order: TBCL 詞語表 Zhuyin, MOE 簡編本, MOE 修訂本.
- OK      the whole word (or every segment of a sentence) matches a first-listed reading. Every TBCL reading
          counts, unless MOE lists it only as a 變 / 又音 / 語音 / 讀音 variant. In a sentence, a function word
          standing as its own segment may take its listed neutral-tone reading (FUNCTION_WORDS: 了 ˙ㄌㄜ, 著 ˙ㄓㄜ,
          子 ˙ㄗ ...), even where MOE lists it after another reading.
- WARN ⚑  it matches only a 又音 / 語音 / 讀音 / 或讀 / 變 reading or a later 多音 entry; TBCL and MOE disagree;
          a tone differs from a listed reading only in a §6.4 way (the character's own full tone for ˙,
          一/不 sandhi, 3+3 sandhi); or a sentence fits only when a longest-match word gives up its tail
          to a word that crosses its edge (他|會計|算 → 他|會|計算).
- FAIL    some syllable matches no listed reading at all; any other tone difference fails too.
          The build stops on any FAIL.
Content is fixed, never the verifier.

Segmentation (check_run): longest match over TBCL + 簡編本 + 修訂本, except that a rare word (MOE-only, or TBCL
第6級 / 第7級) whose reading does not fit gives way to shorter words and single characters (每天都 is not 每|天都,
要買 ㄧㄠ ㄇㄞˇ is not the 要買 of 我要買); a TBCL 第1級-第5級 word is never split, so a wrong reading inside it
still fails (銀行 ㄧㄣˊ ㄒㄧㄥˊ).

Every Zhuyin field in content/ is checked (pairs_in): "zhuyin" with zh / word / text / char / symbol_word / idiom /
chengyu / hanzi / headword, and any "<x>_zhuyin" with "<x>_zh" or "<x>" (right / right_zhuyin, example_zh /
example_zhuyin, taiwan / taiwan_zhuyin, model_zh / model_zhuyin ...). A Zhuyin field with no Chinese text next to it
fails.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402

# (zh field, zhuyin field) pairs we look for in JSON objects and CSV rows: a plain "zhuyin" field goes with the
# first of these Chinese fields; any other "<x>_zhuyin" field with "<x>_zh" or "<x>" (pairs_in)
PAIRS = [("zh", "zhuyin"), ("word", "zhuyin"), ("text", "zhuyin"), ("char", "zhuyin"), ("symbol_word", "zhuyin"),
         ("idiom", "zhuyin"), ("chengyu", "zhuyin"), ("hanzi", "zhuyin"), ("headword", "zhuyin")]
# Function words whose neutral-tone reading MOE lists after another one (了 ㄌㄧㄠˇ first, ˙ㄌㄜ later): standing as
# their own segment in a sentence, this reading is ok, not a ⚑ (every other later 多音 choice still warns: that
# warning caught the 便當 error). Only when a source lists it (main or later 多音): 過 ˙ㄍㄨㄛ is listed nowhere.
FUNCTION_WORDS = {"了": "˙ㄌㄜ", "著": "˙ㄓㄜ", "的": "˙ㄉㄜ", "得": "˙ㄉㄜ", "地": "˙ㄉㄜ", "過": "˙ㄍㄨㄛ", "個": "˙ㄍㄜ",
                  "嗎": "˙ㄇㄚ", "呢": "˙ㄋㄜ", "吧": "˙ㄅㄚ", "們": "˙ㄇㄣ", "子": "˙ㄗ"}
ONE, BU = "ㄧ", "ㄅㄨˋ"                 # base tones of 一 and 不
SANDHI_ONE = {"ㄧˊ", "ㄧˋ"}            # 一: ㄧˊ before T4, ㄧˋ before T1-T3
ONE_BEFORE = {1: "ㄧˋ", 2: "ㄧˋ", 3: "ㄧˋ", 4: "ㄧˊ"}
SANDHI_BU = {"ㄅㄨˊ"}                  # 不: ㄅㄨˊ before T4
KIND_NAME = {"alt": "later 多音", "變": "變 (sandhi)"}
SPELL_AS_MOE = "spell it as MOE does, with base tones (§6.4)"
CORE_LEVEL = "第5級"                   # TBCL words up to this level are kept whole by the segmenter (check_run)


class Result:
    def __init__(self):
        self.checked = 0
        self.failures = []   # (where, zh, zhuyin, why)
        self.warnings = []   # (where, zh, zhuyin, why)

    def ok(self):
        return not self.failures


def same_bases(a, b):
    sa, sb = moe.syllables(a), moe.syllables(b)
    return len(sa) == len(sb) and all(moe.base(x) == moe.base(y) for x, y in zip(sa, sb))


def listed(ch):
    """Every reading any source lists for the character `ch`, except 變 (sandhi) forms."""
    return {z for z, _, kind in moe.word_readings(ch) if kind != "變"}


def as_listed(ch, syl):
    """The next syllable as the one before it sees it: a T3 written T2 (3+3 sandhi) counts as the T3 it is
    listed with, so a 3+3+3 chain is judged the same across words (我很好 ㄨㄛˊ ㄏㄣˊ ㄏㄠˇ) as inside one."""
    if not syl or moe.tone(syl) != 2:
        return syl
    t3, own = moe.with_tone(moe.base(syl), 3), listed(ch)
    return t3 if syl not in own and t3 in own else syl


def sandhi_diff(written, ref, chars="", after=None):
    """Why `written` may differ from the listed reading `ref` by tone only (§6.4), or None if it may not.

    Returns one reason per differing syllable: 'full tone for ˙' (where `ref` is neutral, the character's
    own full tone, i.e. a reading listed for it: 媽媽 ㄇㄚ ㄇㄚ, 桌子 ㄓㄨㄛ ㄗˇ; Taiwan speech, accepted
    for listening), '一 sandhi' / '不 sandhi' (in the right context), '3+3 sandhi' (T3 written T2 right
    before a T3), or 'base tone' (base 一/不 written where `ref` prints the sandhi, as TBCL does). A
    neutral tone where `ref` has a full tone is not allowed: MOE writes 頭髮 ㄊㄡˊ ㄈㄚˇ, the Mainland
    form is ˙ㄈㄚ (§6.5). `chars` tells 一/不 from other ㄧ / ㄅㄨ syllables; `after` is the syllable that
    follows in the sentence, if any (see as_listed).
    """
    w, r = moe.syllables(written), moe.syllables(ref)
    if w == r or not same_bases(written, ref):
        return None
    chars = chars if len(chars) == len(w) else ""
    reasons = []
    for k, (a, b) in enumerate(zip(w, r)):
        if a == b:
            continue
        nxt = r[k + 1] if k + 1 < len(r) else after
        nt = moe.tone(nxt) if nxt else None
        ch = chars[k] if chars else ""
        if moe.tone(a) == 5:
            return None
        if moe.tone(b) == 5:
            if not ch or a not in listed(ch):
                return None
            reasons.append("full tone for ˙")
        elif (ch, a) in (("一", ONE), ("不", BU)) and b in SANDHI_ONE | SANDHI_BU:
            reasons.append("base tone")
        elif ch == "一" and b == ONE and a in SANDHI_ONE and (nt == 5 or ONE_BEFORE.get(nt) == a):
            reasons.append("一 sandhi")
        elif ch == "不" and b == BU and a in SANDHI_BU and nt in (4, 5):
            reasons.append("不 sandhi")
        elif moe.tone(b) == 3 and moe.tone(a) == 2 and nt == 3:
            reasons.append("3+3 sandhi")
        else:
            return None
    return reasons


def check_tbcl(zh, want, mo, after):
    """`want` is a TBCL reading; `mo` the MOE readings. TBCL and MOE disagreeing is a warning (§9.3)."""
    if not mo or any(z == want and k in ("main", "alt") for z, _, k in mo):
        return "ok", "TBCL"
    for z, src, kind in mo:
        if z == want:
            first = next(m for m, s, k in mo if s == src and k == "main")
            tail = "store the base tone (§6.4)" if kind == "變" else "the app teaches the first-listed reading"
            return "warn", (f"matches TBCL, but {src} lists it only as a {KIND_NAME.get(kind, kind)} reading "
                            f"(first-listed {first}); {tail}")
    near = [(z, src) for z, src, k in mo if k in ("main", "alt") and same_bases(z, want)]
    for z, src in near:
        if sandhi_diff(want, z, zh, after):
            return "warn", f"matches TBCL, but {src} writes {z}; {SPELL_AS_MOE}"
    z, src = near[0] if near else next((m, s) for m, s, k in mo if k == "main")
    return "warn", f"matches TBCL, but {src} writes {z}; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)"


def check_word(zh, zhuyin, after=None):
    """Match a single lexical word; `after` is the next syllable in the sentence (for sandhi).
    Returns ('ok'|'warn'|'fail', why), or (None, why) when no source has the word."""
    want = moe.norm(zhuyin)
    found = moe.word_readings(zh)
    if not found:
        return None, "not in any source"
    mo = [(z, src, kind) for z, src, kind in found if src != "TBCL"]
    if any(z == want for z, src, _ in found if src == "TBCL"):
        return check_tbcl(zh, want, mo, after)
    for z, src, kind in mo:
        if z == want and kind == "main":
            return "ok", src
    for z, src, kind in mo:
        if z == want:
            return "warn", f"matches {src} {KIND_NAME.get(kind, kind)} reading, not the first-listed {found[0][0]}"
    for z, src, kind in found:
        why = sandhi_diff(want, z, zh, after) if kind in ("main", "alt") else None
        if why and src == "TBCL" and set(why) == {"base tone"}:
            return "ok", "TBCL, base tone"
        if why:
            return "warn", f"{', '.join(dict.fromkeys(why))}: {src} writes {z}; {SPELL_AS_MOE}"
    return "fail", "no listed reading matches: " + " / ".join(dict.fromkeys(z for z, _, _ in found[:4]))


def check_chars(piece, syls, after):
    """Check a piece character by character, each syllable against that character's own readings."""
    st, notes = "ok", []
    for k, ch in enumerate(piece):
        s2, w2 = check_word(ch, syls[k], as_listed(piece[k + 1], syls[k + 1]) if k + 1 < len(piece) else after)
        if s2 in (None, "fail"):
            return "fail", f"{ch} {syls[k]}: {w2}"
        if s2 == "warn":
            st = "warn"
            notes.append(f"{ch}: {w2}")
    return st, "; ".join(notes)


def function_word_ok(ch, syl):
    """True when `syl` is the FUNCTION_WORDS reading of `ch` and some source lists it as a main or later 多音
    reading (not only as a 變 / 又音 / 語音 / 讀音 variant)."""
    return (FUNCTION_WORDS.get(ch) == moe.norm(syl)
            and any(z == FUNCTION_WORDS[ch] and kind in ("main", "alt") for z, _, kind in moe.word_readings(ch)))


def check_at(text, syls, after, k, n):
    """check_word() on the piece text[k:k+n] of a run; a piece no source has goes character by character.
    A function word on its own takes its listed neutral reading as ok (FUNCTION_WORDS)."""
    end = k + n
    if n == 1 and function_word_ok(text[k], syls[k]):
        return "ok", ""
    nxt = as_listed(text[end], syls[end]) if end < len(text) else after
    st, why = check_word(text[k:end], " ".join(syls[k:end]), nxt)
    if st is None:
        st, why = check_chars(text[k:end], syls[k:end], nxt)
    return st, why


def resplit(text, syls, after, k, n):
    """Another split for the failing word text[k:k+n]: a shorter piece at k, then a lexicon word that runs
    past the old boundary (他|會計|算 → 他|會|計算), both passing. Returns (why, length covered) or None.
    Taking a word apart with nothing crossing its edge (銀|行 for 銀行 ㄒㄧㄥˊ) is no other split: it fails. The
    crossing word must be a core TBCL word (core_word): a rare one does not break a word (銀|行在 for 銀行在 ㄒㄧㄥˊ)."""
    for m in range(n - 1, 0, -1):
        if m > 1 and text[k:k + m] not in moe.lexicon():
            continue
        for n2 in moe.match_lengths(text, k + m):
            if n2 < 2 or m + n2 <= n or not core_word(text[k + m:k + m + n2]):
                continue
            got = [(text[k:k + m], check_at(text, syls, after, k, m)),
                   (text[k + m:k + m + n2], check_at(text, syls, after, k + m, n2))]
            if all(st in ("ok", "warn") for _, (st, _) in got):
                notes = "".join(f"; {p}: {w}" for p, (st, w) in got if st == "warn")
                return f"read as {'|'.join(p for p, _ in got)}{notes}", m + n2
    return None


def core_word(w):
    """A TBCL word of 第1級-第5級 (CORE_LEVEL): the segmenter never gives it up for shorter pieces."""
    t = moe.tbcl_words().get(w)
    return bool(t) and moe.level_rank(t["level"]) <= moe.level_rank(CORE_LEVEL)


def tbcl_char_ok(ch, syl):
    """A single character in TBCL's first reading of it as a word of its own (要 ㄧㄠˋ, 都 ㄉㄡ), or in its
    FUNCTION_WORDS reading: what may stand in for a rare word the segmenter gives up. A polyphone in another
    reading may not (中|國 for 中國 ㄓㄨㄥˋ ㄍㄨㄛˊ: TBCL lists 中 ㄓㄨㄥ first)."""
    t = moe.tbcl_words().get(ch)
    return function_word_ok(ch, syl) or bool(t and t["readings"] and moe.norm(syl) == t["readings"][0])


def check_run(text, syls, after, whole=False):
    """Check a run of characters (no punctuation) word by word, longest match first. Returns (status, why).

    A rare longest match (a word of two or more characters that is no core TBCL word: MOE-only, or TBCL 第6級 /
    第7級) gives way to the next shorter word, or to its first character read as TBCL reads it alone
    (tbcl_char_ok), when its reading does not fit or the rest of the run cannot be read after it: 我每|天都 →
    我每|天|都, 要買 ㄧㄠ ㄇㄞˇ → 要|買, 都會 ㄉㄨ ㄏㄨㄟˋ → 都|會, 的是 ㄉㄧˊ ㄕˋ → 的|是, 我家|裡 ˙ㄌㄧ → 我|家裡.
    That choice of segmentation is no ⚑. A core word is never split (銀行 ㄧㄣˊ ㄒㄧㄥˊ fails); a failing word may
    still give up its tail to a core word crossing its edge (resplit, a ⚑), which is tried first. `whole`: the run
    is the whole text, so a word that covers it stands on its own and is not re-segmented (會計 ㄏㄨㄟˋ ㄐㄧˋ fails)."""
    memo = {}

    def solve(k):
        """('ok'|'warn', [notes]) for text[k:], or ('fail', why) of the longest-match reading."""
        if k == len(text):
            return "ok", []
        if k in memo:
            return memo[k]
        first = None
        for i, n in enumerate(moe.match_lengths(text, k)):
            if i and n == 1 and not tbcl_char_ok(text[k], syls[k]):
                break
            piece, part = text[k:k + n], " ".join(syls[k:k + n])
            st, why = check_at(text, syls, after, k, n)
            m = n
            alt = resplit(text, syls, after, k, n) if st == "fail" and n > 1 else None
            if alt:
                (how, m), st = alt, "warn"
                why = f"word-level mismatch ({piece} {part}: {why}); {how}"
                piece = text[k:k + m]
            if st == "fail":
                got = ("fail", f"{piece} {part}: {why}")
            else:
                rest = solve(k + m)
                got = rest if rest[0] == "fail" else (
                    "warn" if "warn" in (st, rest[0]) else "ok", ([f"{piece}: {why}"] if st == "warn" else []) + rest[1])
            if got[0] != "fail":
                memo[k] = got
                return got
            first = first or got
            if n == 1 or core_word(text[k:k + n]) or (whole and n == len(text)):
                break
        memo[k] = first
        return first

    st, notes = solve(0)
    return (st, notes) if st == "fail" else (st, "; ".join(notes))


def word_runs(zh):
    """zh split at punctuation into runs of characters (no word crosses punctuation)."""
    runs = [""]
    for p, kind in moe.segment(zh):
        if kind == "word":
            runs[-1] += p
        elif runs[-1]:
            runs.append("")
    return [r for r in runs if r]


def check(zh, zhuyin):
    """Check a word or a sentence. Returns (status, why)."""
    zh = (zh or "").strip()
    want = moe.norm(zhuyin)
    if not zh or not want:
        return "fail", "empty"
    if not moe.is_zhuyin(want):
        bad = sorted({c for c in want if c not in moe.ZHUYIN_CHARS and c != " "})
        return "fail", f"not Zhuyin: {''.join(bad)}"
    # whole-word match first
    status, why = check_word(zh, want)
    if status in ("ok", "warn"):
        return status, why
    # sentence / compound: segment and align syllable by syllable
    syls, runs = moe.syllables(want), word_runs(zh)
    if sum(map(len, runs)) != len(syls):
        return "fail", f"{len(syls)} syllables for {sum(map(len, runs))} characters"
    worst, notes, i = "ok", [], 0
    for run in runs:
        end = i + len(run)
        # runs are split at punctuation, and tone sandhi (3+3, 一/不) never crosses a phrase or
        # sentence break, so each run is checked with no following syllable
        st, why = check_run(run, syls[i:end], None, whole=len(runs) == 1)
        if st == "fail":
            return st, why
        if st == "warn":
            worst = "warn"
            notes.append(why)
        i = end
    return worst, "; ".join(notes)


def pairs_in(obj):
    """[(Chinese field or None, Zhuyin field)] of a JSON object or CSV row: "zhuyin" with the first PAIRS field
    present, every "<x>_zhuyin" with "<x>_zh", else "<x>" (also "<x>_text", "<x>_word")."""
    out = []
    for k in obj:
        if k == "zhuyin":
            zf = next((z for z, p in PAIRS if p == k and z in obj), None)
        elif isinstance(k, str) and k.endswith("_zhuyin") and len(k) > len("_zhuyin"):
            x = k[:-len("_zhuyin")]
            zf = next((f for f in (f"{x}_zh", x, f"{x}_text", f"{x}_word") if f in obj), None)
        else:
            continue
        out.append((zf, k))
    return out


def record_pairs(res, where, obj, sep):
    """record() every Zhuyin field of `obj` (pairs_in) that has text; `where` gets `sep` + the Chinese field's name
    for any pair but the plain zh / zhuyin one. A Zhuyin field with no Chinese text next to it is a failure."""
    for zf, pf in pairs_in(obj):
        z = obj.get(pf)
        if not isinstance(z, str) or not z.strip():
            continue
        at = where if pf == "zhuyin" else f"{where}{sep}{zf or pf}"
        zh = obj.get(zf) if zf else None
        if not isinstance(zh, str) or not zh.strip():
            res.checked += 1
            res.failures.append((at, "", z, f"{pf} has no Chinese text next to it ({zf or 'no Chinese field'})"))
            continue
        record(res, at, zh, z)


def walk_json(obj, where, res):
    if isinstance(obj, dict):
        record_pairs(res, where, obj, "/")
        for k, v in obj.items():
            walk_json(v, f"{where}/{k}", res)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            walk_json(v, f"{where}[{i}]", res)


def record(res, where, zh, zhuyin):
    res.checked += 1
    st, why = check(zh, zhuyin)
    if st == "fail":
        res.failures.append((where, zh, zhuyin, why))
    elif st == "warn":
        res.warnings.append((where, zh, zhuyin, why))


def verify_content(content_dir=moe.CONTENT):
    res = Result()
    for path in sorted(Path(content_dir).rglob("*")):
        rel = path.relative_to(content_dir).as_posix()
        if path.suffix == ".json":
            try:
                data = json.load(open(path, encoding="utf-8-sig"))
            except json.JSONDecodeError as e:
                res.failures.append((rel, "", "", f"invalid JSON: {e}"))
                continue
            walk_json(data, rel, res)
        elif path.suffix == ".csv":
            for n, row in enumerate(moe.read_csv(path), start=2):
                record_pairs(res, f"{rel}:{n}", row, " ")
    return res


def summary(res):
    lines = [f"Verifier: {res.checked} Zhuyin strings checked, {len(res.failures)} failures, {len(res.warnings)} warnings ⚑"]
    for where, zh, z, why in res.failures:
        lines.append(f"  FAIL {where}: {zh} {z}  — {why}")
    for where, zh, z, why in res.warnings:
        lines.append(f"  ⚑ {where}: {zh} {z}  — {why}")
    return "\n".join(lines)


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    r = verify_content()
    print(summary(r))
    sys.exit(0 if r.ok() else 1)
