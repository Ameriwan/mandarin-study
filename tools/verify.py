"""Verify every Zhuyin string in content/ against MOE / TBCL data (MASTER_PROMPT §9.3).

    .venv\Scripts\python.exe tools\verify.py            check and print a summary
    .venv\Scripts\python.exe tools\verify.py --report   also write build-report.md (the build does this)

Rules
- Sources in order: TBCL 詞語表 Zhuyin, MOE 簡編本, MOE 修訂本.
- OK      the whole word (or every segment of a sentence) matches a first-listed reading. Every TBCL reading
          counts, unless MOE lists it only as a 變 / 又音 / 語音 / 讀音 variant.
- WARN ⚑  it matches only a 又音 / 語音 / 讀音 / 或讀 / 變 reading or a later 多音 entry; TBCL and MOE disagree;
          a tone differs from a listed reading only in a §6.4 way (the character's own full tone for ˙,
          一/不 sandhi, 3+3 sandhi); or a sentence fits only when a longest-match word gives up its tail
          to a word that crosses its edge (他|會計|算 → 他|會|計算).
- FAIL    some syllable matches no listed reading at all; any other tone difference fails too.
          The build stops on any FAIL.
Content is fixed, never the verifier.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402

# (zh field, zhuyin field) pairs we look for in JSON objects and CSV rows
PAIRS = [("zh", "zhuyin"), ("word", "zhuyin"), ("text", "zhuyin"), ("char", "zhuyin"), ("symbol_word", "zhuyin")]
ONE, BU = "ㄧ", "ㄅㄨˋ"                 # base tones of 一 and 不
SANDHI_ONE = {"ㄧˊ", "ㄧˋ"}            # 一: ㄧˊ before T4, ㄧˋ before T1-T3
ONE_BEFORE = {1: "ㄧˋ", 2: "ㄧˋ", 3: "ㄧˋ", 4: "ㄧˊ"}
SANDHI_BU = {"ㄅㄨˊ"}                  # 不: ㄅㄨˊ before T4
KIND_NAME = {"alt": "later 多音", "變": "變 (sandhi)"}
SPELL_AS_MOE = "spell it as MOE does, with base tones (§6.4)"


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


def check_at(text, syls, after, k, n):
    """check_word() on the piece text[k:k+n] of a run; a piece no source has goes character by character."""
    end = k + n
    nxt = as_listed(text[end], syls[end]) if end < len(text) else after
    st, why = check_word(text[k:end], " ".join(syls[k:end]), nxt)
    if st is None:
        st, why = check_chars(text[k:end], syls[k:end], nxt)
    return st, why


def resplit(text, syls, after, k, n):
    """Another split for the failing word text[k:k+n]: a shorter piece at k, then a lexicon word that runs
    past the old boundary (他|會計|算 → 他|會|計算), both passing. Returns (why, length covered) or None.
    Taking a word apart with nothing crossing its edge (銀|行 for 銀行 ㄒㄧㄥˊ) is no other split: it fails."""
    for m in range(n - 1, 0, -1):
        if m > 1 and text[k:k + m] not in moe.lexicon():
            continue
        for n2 in moe.match_lengths(text, k + m):
            if n2 < 2 or m + n2 <= n:
                continue
            got = [(text[k:k + m], check_at(text, syls, after, k, m)),
                   (text[k + m:k + m + n2], check_at(text, syls, after, k + m, n2))]
            if all(st in ("ok", "warn") for _, (st, _) in got):
                notes = "".join(f"; {p}: {w}" for p, (st, w) in got if st == "warn")
                return f"read as {'|'.join(p for p, _ in got)}{notes}", m + n2
    return None


def check_run(text, syls, after):
    """Check a run of characters (no punctuation) word by word, longest match first. Returns (status, why)."""
    worst, notes, k = "ok", [], 0
    while k < len(text):
        n = moe.match_lengths(text, k)[0]
        piece, part = text[k:k + n], " ".join(syls[k:k + n])
        st, why = check_at(text, syls, after, k, n)
        alt = resplit(text, syls, after, k, n) if st == "fail" and n > 1 else None
        if alt:
            (how, n), st = alt, "warn"
            why = f"word-level mismatch ({piece} {part}: {why}); {how}"
            piece = text[k:k + n]
        if st == "fail":
            return "fail", f"{piece} {part}: {why}"
        if st == "warn":
            worst = "warn"
            notes.append(f"{piece}: {why}")
        k += n
    return worst, "; ".join(notes)


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
        st, why = check_run(run, syls[i:end], None)
        if st == "fail":
            return st, why
        if st == "warn":
            worst = "warn"
            notes.append(why)
        i = end
    return worst, "; ".join(notes)


def walk_json(obj, where, res):
    if isinstance(obj, dict):
        for zf, pf in PAIRS:
            if zf in obj and pf in obj and isinstance(obj.get(pf), str) and isinstance(obj.get(zf), str):
                record(res, where, obj[zf], obj[pf])
                break
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
                for zf, pf in PAIRS:
                    if row.get(zf) and row.get(pf):
                        record(res, f"{rel}:{n}", row[zf], row[pf])
                        break
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
