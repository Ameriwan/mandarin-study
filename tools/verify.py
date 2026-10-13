"""Verify every Zhuyin string in content/ against MOE / TBCL data (MASTER_PROMPT §9.3).

    .venv\Scripts\python.exe tools\verify.py            check and print a summary
    .venv\Scripts\python.exe tools\verify.py --report   also write build-report.md (the build does this)

Rules
- Sources in order: TBCL 詞語表 Zhuyin, MOE 簡編本, MOE 修訂本.
- OK      the whole word (or every segment of a sentence) matches a first-listed reading.
- WARN ⚑  it matches only a 又音 / 語音 / 讀音 / 或讀 reading, a later 多音 entry, or differs from the
          first-listed reading by tone only (TBCL prints 一/不 sandhi; neutral vs full tone).
- FAIL    some syllable matches no listed reading at all. The build stops on any FAIL.
Content is fixed, never the verifier.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402

# (zh field, zhuyin field) pairs we look for in JSON objects and CSV rows
PAIRS = [("zh", "zhuyin"), ("word", "zhuyin"), ("text", "zhuyin"), ("char", "zhuyin"), ("symbol_word", "zhuyin")]
SANDHI_ONE = {"ㄧ", "ㄧˊ", "ㄧˋ"}
SANDHI_BU = {"ㄅㄨˋ", "ㄅㄨˊ"}


class Result:
    def __init__(self):
        self.checked = 0
        self.failures = []   # (where, zh, zhuyin, why)
        self.warnings = []   # (where, zh, zhuyin, why)

    def ok(self):
        return not self.failures


def tone_only_diff(a, b):
    """True if a and b have the same bases syllable by syllable and differ only in tone marks."""
    sa, sb = moe.syllables(a), moe.syllables(b)
    return len(sa) == len(sb) and all(moe.base(x) == moe.base(y) for x, y in zip(sa, sb)) and sa != sb


def check_word(zh, zhuyin):
    """Match a single lexical word. Returns ('ok'|'warn'|'fail', why)."""
    want = moe.norm(zhuyin)
    found = moe.word_readings(zh)
    if not found:
        return None, "not in any source"
    for z, src, kind in found:
        if z == want and kind == "main":
            if src == "TBCL":
                # TBCL prints 一/不 sandhi and sometimes a full tone for a neutral syllable; the app stores base tones
                moe_main = [m for m, s2, k2 in found if s2 != "TBCL" and k2 == "main"]
                moe_any = [m for m, s2, k2 in found if s2 != "TBCL"]
                if moe_main and all(m != want for m in moe_any) and any(tone_only_diff(m, want) for m in moe_main):
                    return "warn", f"matches TBCL, but MOE writes {moe_main[0]}; store the base tone (§6.4)"
            return "ok", f"{src}"
    for z, src, kind in found:
        if z == want:
            return "warn", f"matches {src} {kind} reading, not the first-listed one"
    for z, src, kind in found:
        if tone_only_diff(z, want):
            if kind == "main":
                return "warn", f"tone differs from {src} ({z}); store the base tone (§6.4)"
    return "fail", "no listed reading matches: " + " / ".join(f"{z}" for z, _, _ in found[:4])


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
    syls = moe.syllables(want)
    pieces = [p for p, kind in moe.segment(zh) if kind == "word"]
    if sum(len(p) for p in pieces) != len(syls):
        return "fail", f"{len(syls)} syllables for {sum(len(p) for p in pieces)} characters"
    worst, notes, i = "ok", [], 0
    for piece in pieces:
        part = " ".join(syls[i:i + len(piece)])
        i += len(piece)
        st, w = check_word(piece, part)
        if st is None:
            # unknown multi-char piece: fall back to characters
            st, w = "ok", ""
            for k, ch in enumerate(piece):
                s2, w2 = check_word(ch, syls[i - len(piece) + k])
                if s2 is None or s2 == "fail":
                    st, w = "fail", f"{ch}: {w2}"
                    break
                if s2 == "warn" and st != "fail":
                    st, w = "warn", f"{ch}: {w2}"
        if st == "fail":
            return "fail", f"{piece} {part}: {w}"
        if st == "warn":
            worst = "warn"
            notes.append(f"{piece}: {w}")
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
