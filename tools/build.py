"""Build everything the site needs from content/ (MASTER_PROMPT §9).

    .venv\\Scripts\\python.exe tools\\build.py              full build (verifies, downloads new MOE audio, contours)
    .venv\\Scripts\\python.exe tools\\build.py --no-audio   skip downloads and TTS (offline); missing clips are reported

Writes docs/data/*.json, docs/audio/**, and build-report.md. The build FAILS on any verifier failure.
"""
import argparse
import datetime as dt
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402
import verify  # noqa: E402
import audio  # noqa: E402
import contours  # noqa: E402

DATA = moe.DOCS / "data"
SIZE_BUDGET_MB = 600
TODAY = dt.date.today().isoformat()
log_lines = []


def log(msg):
    print(msg, flush=True)
    log_lines.append(msg)


def write_json(name, data):
    DATA.mkdir(parents=True, exist_ok=True)
    with open(DATA / f"{name}.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def first_reading_is(word, zhuyin):
    """True when `zhuyin` is the first-listed 簡編本 reading of `word` (so the audio says the everyday reading)."""
    rs = moe.readings()["concised"].get(word) or moe.readings()["revised"].get(word) or []
    return bool(rs) and moe.norm(rs[0]["z"]) == moe.norm(zhuyin)


# ---------------------------------------------------------------- syllable grid

def valid_syllable(syl):
    """One well-formed toned syllable: Zhuyin symbols only, tone mark in its place, a real final, not a bare ㄅ-type initial.

    Rejects squashed multi-syllable readings (ㄑㄧㄢㄨㄚˇ), internal tone marks (ㄕˊㄎㄜˋ) and obsolete symbols (ㄫ).
    """
    b = moe.base(syl)
    if not b or not set(b) <= set(moe.SYMBOLS) or moe.with_tone(b, moe.tone(syl)) != syl:
        return False
    ini, med, fin = moe.split_syllable(b)
    if fin and fin not in moe.FINALS:
        return False
    return bool(med or fin or ini in "ㄓㄔㄕㄖㄗㄘㄙ")


def build_syllable_grid(bank):
    """Every toned syllable that has a single-character MOE recording, with the best representative character.

    Ranking: in the TBCL 漢字表 first (each clip says the cell's reading, so a common character read in its
    secondary reading beats a rare one), then the reading being the character's first-listed reading, then
    TBCL level (lower first), then written frequency. `common` is false when no TBCL character has the
    reading; the page greys those cells (§5.2). Only the headword span is played (§7.3).
    """
    chars = moe.tbcl_chars()
    cands = defaultdict(list)  # toned syllable -> [(rank tuple, char, id)]
    for word, rd in moe.audio_map().items():
        if len(word) != 1:
            continue
        for z, aid in rd.items():
            syls = moe.syllables(z)
            if len(syls) != 1 or not valid_syllable(syls[0]):
                continue
            syl = syls[0]
            c = chars.get(word)
            rank = (0 if c else 1, 0 if first_reading_is(word, syl) else 1, moe.level_rank(c["level"]) if c else 99,
                    -(c["wfreq"] if c else 0), word)
            cands[syl].append((rank, word, aid))
    cells = {}
    for syl, lst in cands.items():
        lst.sort()
        rank, word, aid = lst[0]
        b, t = moe.base(syl), moe.tone(syl)
        cell = cells.setdefault(b, {})
        cell[str(t)] = {"zh": word, "id": bank.want_moe(aid, priority=1 + rank[2]), "level": chars.get(word, {}).get("level", ""),
                        "common": rank[0] == 0, "alts": [w for _, w, _ in lst[1:4]]}
    bases = sorted(cells)
    initials = [""] + moe.INITIALS

    def final_key(f):
        med = moe.MEDIALS.index(f[0]) + 1 if f and f[0] in moe.MEDIALS else 0
        fin = moe.FINALS.index(f[-1]) + 1 if f and f[-1] in moe.FINALS else 0
        return (med, fin)

    finals_seen = sorted({moe.split_syllable(b)[1] + moe.split_syllable(b)[2] for b in bases}, key=final_key)
    return {"initials": initials, "finals": finals_seen, "cells": cells,
            "counts": {"bases": len(bases), "toned": sum(len(c) for c in cells.values())}}


# ---------------------------------------------------------------- content -> data

def word_entry(w, bank):
    """Attach the MOE audio id (if the exact reading has one) to a {zh, zhuyin, en} item."""
    aid = moe.audio_id(w["zh"], w["zhuyin"])
    e = dict(w)
    e["id"] = bank.want_moe(aid, priority=0, nsyl=len(moe.syllables(w["zhuyin"]))) if aid else None
    t = moe.tbcl_words().get(w["zh"])
    if t:
        e["level"] = t["level"]
    return e


def build_symbols(bank):
    src = moe.read_json(moe.CONTENT / "zhuyin" / "symbols.json")
    out = {"order": src["order"], "groups": src["groups"], "symbols": []}
    for s in src["symbols"]:
        bank.want_juyin(s["symbol"])
        out["symbols"].append({**s, "audio": f"juyin:{s['symbol']}",
                               "examples": [word_entry(e, bank) for e in s["examples"]]})
    return out


def build_contrasts(bank):
    src = moe.read_json(moe.CONTENT / "zhuyin" / "contrasts.json")
    out = []
    for c in src["contrasts"]:
        item = {k: v for k, v in c.items() if k != "sets"}
        item["sets"] = [[word_entry(w, bank) for w in s] for s in c["sets"]]
        out.append(item)
    return out


def build_pairs(bank):
    rows = moe.read_csv(moe.CONTENT / "tones" / "pairs.csv")
    return [{**word_entry(r, bank), "t1": int(r["t1"]), "t2": int(r["t2"])} for r in rows]


# ---------------------------------------------------------------- report

def dir_size(p):
    return sum(f.stat().st_size for f in Path(p).rglob("*") if f.is_file())


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-audio", action="store_true", help="don't download MOE audio or call TTS")
    ap.add_argument("--no-contours", action="store_true")
    ap.add_argument("--max-new", type=int, default=None, help="download at most N new MOE clips this run (priority order); rerun to continue")
    args = ap.parse_args()

    log(f"Build {TODAY}")
    log("Verifying content/ ...")
    res = verify.verify_content()
    log(verify.summary(res))
    if not res.ok():
        log("BUILD FAILED: fix the content (never the verifier).")
        write_report(res, None, None, None, status="FAILED (verifier)")
        sys.exit(1)

    bank = audio.AudioBank()
    symbols = build_symbols(bank)
    contr = build_contrasts(bank)
    pairs = build_pairs(bank)
    grid = build_syllable_grid(bank)
    log(f"Syllable grid: {grid['counts']['bases']} bases, {grid['counts']['toned']} toned syllables with MOE audio")

    log("Audio ...")
    index = bank.render(download=not args.no_audio, max_new=args.max_new, log=log)

    model_ids = {c["id"] for cell in grid["cells"].values() for c in cell.values()}
    model_ids |= {w["id"] for c in contr for s in c["sets"] for w in s if w.get("id")}
    model_ids |= {p["id"] for p in pairs if p.get("id")}
    model_ids.discard(None)
    cont = {} if args.no_contours else contours.compute_all(index, sorted(model_ids), log=log)

    write_json("symbols", symbols)
    write_json("contrasts", contr)
    write_json("pairs", pairs)
    write_json("syllables", grid)
    write_json("audio", index)
    write_json("contours", cont)
    write_json("meta", {"built": TODAY, "moe_version": "簡編本 2026-09-29 export / 修訂本 2026-09-29 export",
                        "counts": {"symbols": len(symbols["symbols"]),
                                   "contrast_words": len({(w["zh"], w["zhuyin"]) for c in contr for s in c["sets"] for w in s}),
                                   "pairs": len(pairs), "syllables": grid["counts"]["toned"],
                                   "moe_clips": sum(1 for e in index.values() if e["src"] == "moe"),
                                   "contours": len(cont)}})

    words = [w for c in contr for s in c["sets"] for w in s] + pairs + [e for s in symbols["symbols"] for e in s["examples"]]
    no_audio = list(dict.fromkeys(f"{w['zh']} {w['zhuyin']}" for w in words if not w.get("id")))  # unique, content order
    size_mb = dir_size(moe.DOCS) / 1e6
    over = size_mb > SIZE_BUDGET_MB
    log(f"docs/ size: {size_mb:.1f} MB (budget {SIZE_BUDGET_MB} MB)")
    if bank.missing:
        log(f"  ! {len(bank.missing)} wanted clips are missing: {', '.join(bank.missing[:10])}")
    log("BUILD FAILED: docs/ is over the size budget" if over else "Done.")
    write_report(res, index, bank, {"no_audio_words": no_audio, "contours": len(cont), "size_mb": size_mb,
                                    "grid": grid["counts"]}, status="FAILED (size budget)" if over else "built")
    if over:
        sys.exit(1)


def write_report(res, index, bank, extra, status="built"):
    lines = [f"# Build report - {TODAY}", "", f"**Status:** {status}", "",
             "## Verifier", "", f"- checked: {res.checked}", f"- failures: {len(res.failures)}",
             f"- warnings: {len(res.warnings)}", ""]
    for where, zh, z, why in res.failures:
        lines.append(f"- FAIL `{where}`: {zh} `{z}` - {why}")
    for where, zh, z, why in res.warnings:
        lines.append(f"- WARN `{where}`: {zh} `{z}` - {why}")
    if index is not None:
        moe_n = sum(1 for e in index.values() if e["src"] == "moe")
        tts_n = sum(1 for e in index.values() if e["src"] == "tts")
        juyin_n = sum(1 for e in index.values() if e["src"] == "juyin")
        lines += ["", "## Audio coverage", "", f"- MOE human clips: {moe_n}", f"- MOE handbook symbol clips: {juyin_n}",
                  f"- TTS clips: {tts_n}",
                  f"- missing / failed: {len(bank.missing)}" + (" - " + ", ".join(bank.missing[:20]) if bank.missing else ""),
                  f"- content words without an exact-reading MOE clip (browser voice, labelled): {len(extra['no_audio_words'])}"]
        for w in extra["no_audio_words"][:40]:
            lines.append(f"  - {w}")
        flagged = [k for k, e in index.items() if e.get("check")]
        lines += ["", f"- spans flagged for a listen (outside the expected length): {len(flagged)}" + (" - " + ", ".join(flagged[:30]) if flagged else "")]
        lines += ["", "## Data", "", f"- syllable grid: {extra['grid']['bases']} bases / {extra['grid']['toned']} toned syllables",
                  f"- model contours: {extra['contours']}",
                  f"- docs/ size: {extra['size_mb']:.1f} MB (budget {SIZE_BUDGET_MB} MB)"]
    lines += ["", "## Log", "", "```", *log_lines, "```", ""]
    (moe.ROOT / "build-report.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
