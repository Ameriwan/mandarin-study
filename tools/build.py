"""Build everything the site needs from content/ (MASTER_PROMPT §9).

    .venv\\Scripts\\python.exe tools\\build.py                 full build (verifies, downloads new MOE audio, contours)
    .venv\\Scripts\\python.exe tools\\build.py --no-audio      skip downloads and TTS (offline); missing clips are reported
    .venv\\Scripts\\python.exe tools\\build.py --no-contours   compute no new model contours: reuse the ones computed
                                                         before (contour cache, else the old contours.json)

Writes docs/data/*.json (tones.json: the Tone Gym, M2), docs/audio/**, and build-report.md. The build FAILS on
any verifier failure, and on a content/tones/sandhi.json item whose spoken form (moe.spoken, §6.4) does not
show its rule, changes when marked no_change, or (half-third) changes at all.
"""
import argparse
import datetime as dt
import json
import sys
from collections import defaultdict
from functools import lru_cache
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


@lru_cache(maxsize=None)
def single_char_candidates():
    """{toned syllable: [(rank, char, MOE audio id)], best first}: every single-character MOE recording whose
    reading is one well-formed syllable, ranked as build_syllable_grid explains. Read-only (cached)."""
    chars = moe.tbcl_chars()
    cands = defaultdict(list)
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
            cands[syl].append((rank, word, str(aid)))
    return {syl: sorted(lst) for syl, lst in cands.items()}


def build_syllable_grid(bank):
    """Every toned syllable that has a single-character MOE recording, with the best representative character.

    Ranking: in the TBCL 漢字表 first (each clip says the cell's reading, so a common character read in its
    secondary reading beats a rare one), then the reading being the character's first-listed reading, then
    TBCL level (lower first), then written frequency. `common` is false when no TBCL character has the
    reading; the page greys those cells (§5.2). `first` is true when the cell's reading is the character's
    first-listed reading. Only the headword span is played (§7.3). The Tone ID pool picks its own character
    per syllable (id_pool_candidates), so a frequent character in a rare reading (們 ㄇㄣˊ) stays out of it.
    """
    chars = moe.tbcl_chars()
    cells = {}
    for syl, lst in single_char_candidates().items():
        rank, word, aid = lst[0]
        b, t = moe.base(syl), moe.tone(syl)
        cell = cells.setdefault(b, {})
        cell[str(t)] = {"zh": word, "id": bank.want_moe(aid, priority=1 + rank[2]), "level": chars.get(word, {}).get("level", ""),
                        "common": rank[0] == 0, "first": rank[1] == 0, "alts": [w for _, w, _ in lst[1:4]]}
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


def build_contrasts(bank, src=None):
    """content/zhuyin/contrasts.json -> contrasts whose words carry id, level and `spoken` (moe.spoken, §6.4:
    the drill's ruby shows the said tone when "show sandhi" is on, e.g. 水餃 ㄕㄨㄟˊ ㄐㄧㄠˇ)."""
    if src is None:
        src = moe.read_json(moe.CONTENT / "zhuyin" / "contrasts.json")
    out = []
    for c in src["contrasts"]:
        item = {k: v for k, v in c.items() if k != "sets"}
        item["sets"] = [[{**word_entry(w, bank), "spoken": moe.spoken(w["zh"], w["zhuyin"])} for w in s]
                        for s in c["sets"]]
        out.append(item)
    return out


# ---------------------------------------------------------------- Tone Gym data (docs/data/tones.json, M2)

TONES_DIR = moe.CONTENT / "tones"
TONE_EXAMPLES = [("媽", "ㄇㄚ"), ("麻", "ㄇㄚˊ"), ("馬", "ㄇㄚˇ"), ("罵", "ㄇㄚˋ")]   # one MOE clip per tone
ID_POOL_MAX_LEVEL = "第3*級"
SANDHI_RULES = ("3+3", "half3", "yi", "bu")
YES = ("1", "true", "yes", "y", "x")


def tone_entry(w, bank, keep=()):
    """{zh, zhuyin (normalized), spoken, ...keep fields} + MOE id and TBCL level (word_entry)."""
    z = moe.norm(w["zhuyin"])
    e = word_entry({"zh": w["zh"], "zhuyin": z, **{k: w.get(k, "") for k in keep}}, bank)
    e["spoken"] = moe.spoken(w["zh"], z)
    return e


def build_pairs(bank, rows=None):
    """content/tones/pairs.csv (t1,t2,zh,zhuyin,en,note[,core]) -> pair entries with spoken, core, id, level.
    Without a `core` column (the M1 file of the 20 §6.4 words) every row is core."""
    if rows is None:
        rows = moe.read_csv(TONES_DIR / "pairs.csv")
    has_core = any("core" in r for r in rows)
    out = []
    for r in rows:
        e = tone_entry(r, bank, keep=("en", "note"))
        out.append({"t1": int(r["t1"]), "t2": int(r["t2"]), **e,
                    "core": (r.get("core", "").lower() in YES) if has_core else True})
    return out


def pair_warnings(pairs):
    """Content to look at (logged, not fatal): written tones that do not match the t1/t2 cell, and words
    said differently from their cell other than by 3+3 (一/不 sandhi: the clip says the spoken tones)."""
    out = []
    for p in pairs:
        tones = [moe.tone(s) for s in moe.syllables(p["zhuyin"])]
        said = [moe.tone(s) for s in moe.syllables(p["spoken"])]
        if tones != [p["t1"], p["t2"]]:
            out.append(f"pairs.csv: {p['zh']} {p['zhuyin']} is in cell {p['t1']}/{p['t2']} but written {tones}")
        elif said != tones and tones != [3, 3]:
            out.append(f"pairs.csv: {p['zh']} {p['zhuyin']} is in cell {p['t1']}/{p['t2']} but said "
                       f"{p['spoken']} (一/不 sandhi)")
    return out


def syllable_runs(zh, n):
    """Index runs of an item's n syllables that sandhi stays inside (as in moe.spoken): split at punctuation or
    any other non-Chinese character when zh has one Chinese character per syllable, else one run."""
    if sum(1 for c in zh if moe._is_cjk(c)) != n:
        return [list(range(n))]
    runs, k = [[]], 0
    for c in zh:
        if moe._is_cjk(c):
            runs[-1].append(k)
            k += 1
        elif runs[-1]:
            runs.append([])
    return [r for r in runs if r]


def has_half_third(zh, spoken):
    """True when the spoken form says some T3 before a T1/T2/T4/neutral syllable of the same run (a half-third)."""
    said = moe.syllables(spoken)
    return any(moe.tone(said[a]) == 3 and moe.tone(said[b]) != 3
               for run in syllable_runs(zh, len(said)) for a, b in zip(run, run[1:]))


def sandhi_problem(item, rule_ids=SANDHI_RULES):
    """Why a sandhi item's spoken form is wrong for its rule, or None (§6.4; the build fails on any).

    - no_change: true -> the spoken form must equal the written one (第一, 十一, 不好 ...).
    - 3+3 / yi / bu -> the spoken form must show that rule's own change: a T3 said T2 / a 一 / a 不 that
      changes (a difference somewhere else does not count).
    - half3, with or without no_change -> the half-third is not a written change: a word or phrase must come
      out unchanged (洗手 is said ㄒㄧˊ ㄕㄡˇ, so it belongs under 3+3), and the spoken form must say a
      half-third (a T3 before T1/T2/T4/neutral). A sentence may also carry an incidental 3+3 (我很喜歡
      ㄨㄛˊ ㄏㄣˊ ㄒㄧˇ ㄏㄨㄢ) unless it is marked no_change.
    """
    rule = item.get("rule")
    if rule not in rule_ids:
        return f"unknown rule {rule!r} (rules: {', '.join(rule_ids)})"
    base, said = moe.syllables(item["zhuyin"]), moe.syllables(item["spoken"])
    changed = [i for i, (a, b) in enumerate(zip(base, said)) if a != b]
    if item.get("no_change"):
        if changed:
            return f"marked no_change, but the spoken form is {item['spoken']}"
        if rule != "half3":                       # a half3 item must still say a half-third (below)
            return None
    if rule == "half3":
        if changed and item.get("kind") != "sentence":
            return (f"half-third is not a written change, but the spoken form is {item['spoken']}: "
                    f"file it under the rule that changes it (3+3, yi or bu)")
        if not has_half_third(item["zh"], item["spoken"]):
            return f"rule half3: the spoken form {item['spoken']} has no T3 before a T1/T2/T4/neutral syllable"
        return None
    if rule not in ("3+3", "yi", "bu"):
        return None
    chars = [c for c in item["zh"] if moe._is_cjk(c)]
    if rule == "3+3":
        hit = any(moe.tone(base[i]) == 3 and moe.tone(said[i]) == 2 for i in changed)
    else:
        target = {"yi": "一", "bu": "不"}[rule]
        hit = len(chars) == len(base) and any(chars[i] == target for i in changed)
    return None if hit else f"rule {rule}: the spoken form {item['spoken']} shows no {rule} change"


def build_sandhi(bank, src=None):
    """content/tones/sandhi.json -> ({rules, items}, problems). Items get spoken, id (MOE clip of the exact
    reading) and audio (sentences: the gTTS key, replaced by its docs path in finish_sandhi_audio)."""
    if src is None:
        src = moe.read_json(TONES_DIR / "sandhi.json", default=None)
        if src is None:
            log("  content/tones/sandhi.json not found: the sandhi tab and the Today shadowing lines will be empty")
            src = {}
    rules = src.get("rules", [])
    rule_ids = tuple(r["id"] for r in rules if r.get("id")) or SANDHI_RULES
    items, problems = [], []
    for n, it in enumerate(src.get("items", [])):
        e = {**it, **tone_entry(it, bank)}
        e["audio"] = bank.want_tts(it["zh"]) if it.get("kind") == "sentence" else None
        why = sandhi_problem(e, rule_ids)
        if why:
            problems.append(f"sandhi.json items[{n}] {it['zh']} {e['zhuyin']}: {why}")
        items.append(e)
    return {"rules": rules, "items": items}, problems


def tone_shape(st, v, k, n):
    """Measured shape of syllable k of n in a model contour (40 points): "rise", "fall" or "level" from the change
    between the first and last quarter of its share of the points. Equal shares: fine for the 2-3 syllable words here."""
    a, b = round(len(st) * k / n), round(len(st) * (k + 1) / n)
    seg = [x for x, m in zip(st[a:b], v[a:b]) if m] if sum(v[a:b]) >= 3 else st[a:b]
    if len(seg) < 2:
        return None
    q = max(1, len(seg) // 4)
    slope = sum(seg[-q:]) / q - sum(seg[:q]) / q
    lift = seg[-1] - min(seg)  # a Taiwan T2 dips before it rises (§6.4: 323), so the net slope alone can look level
    if slope < -2.5:
        return "fall"
    return "rise" if slope > 2.0 or (lift >= 3.0 and slope > 0) else "level"


SANDHI_TARGET = {"yi": "一", "bu": "不"}


def sandhi_clip_check(items, cont, log=print):
    """Does each sandhi word's MOE recording actually say the taught tone on the syllable the drills ask about?

    The MOE announcer often reads 一 in its base tone before T1/T2/T3 (一天, 一般: level, not the ㄧˋ of §6.4), and
    a 不 inside a three-syllable phrase can be light. A listening check built on such a clip would mark the learner
    wrong for hearing correctly, so each asked-about syllable gets said_ok[k] = True/False (None = not asked or not
    measurable) and the page keeps only clips that say the taught tone. Taught shape: T2 rise, T4 fall, T1 level.
    Only 一 and 不 are checked: their misreadings are large (level vs a 9-st fall), while a 3+3 first syllable and a
    half-third one cannot be told apart reliably from equal syllable shares, and announcers apply 3+3 anyway."""
    bad = []
    for e in items:
        if e.get("kind") == "sentence" or not e.get("id") or e["id"] not in cont:
            continue
        c, chars = cont[e["id"]], [ch for ch in e["zh"] if moe._is_cjk(ch)]
        said, n = moe.syllables(e.get("spoken") or e["zhuyin"]), len(chars)
        if len(said) != n:
            continue
        ks = {k for k, ch in enumerate(chars) if ch in SANDHI_TARGET.values()}
        if not ks:
            continue
        ok = [None] * n
        for k in ks:
            shape, t = tone_shape(c["st"], c["v"], k, n), moe.tone(said[k])
            if shape is None or t == 5:
                continue
            ok[k] = shape == {1: "level", 2: "rise", 3: "level", 4: "fall"}[t]
            if not ok[k]:
                bad.append(f"{e['zh']} {chars[k]}={said[k]} heard {shape}")
        e["said_ok"] = ok
    if bad:
        log(f"  sandhi clips that do not say the taught tone (kept for display, left out of the check and mirror): "
            f"{len(bad)}: {'; '.join(bad)}")
    return bad


def finish_sandhi_audio(sandhi, index):
    """Swap each sentence's gTTS key for its docs path (labelled TTS on the page), or None if it failed."""
    for e in sandhi["items"]:
        if e.get("audio"):
            e["audio"] = (index.get(e["audio"]) or {}).get("path")


def build_readings(bank, rows=None):
    """content/tones/taiwan-readings.csv (zh,zhuyin,mainland,note,type) -> entries with spoken, id, level."""
    if rows is None:
        p = TONES_DIR / "taiwan-readings.csv"
        if not p.exists():
            log("  content/tones/taiwan-readings.csv not found: the Taiwan readings tab will be empty")
            return []
        rows = moe.read_csv(p)
    return [tone_entry(r, bank, keep=("mainland", "note", "type")) for r in rows]


def build_tone_examples(bank):
    """{"1": id, ...}: 媽 麻 馬 罵, the MOE example of each tone (None if a clip is missing)."""
    out = {}
    for zh, z in TONE_EXAMPLES:
        aid = moe.audio_id(zh, z)
        out[str(moe.tone(z))] = bank.want_moe(aid, priority=0) if aid else None
    return out


@lru_cache(maxsize=None)
def tbcl_char_syllables():
    """{char: set of syllables} the TBCL 詞語表 gives a character: the readings of its own one-character entry
    when it has any, else every syllable it takes inside the TBCL words that contain it (麼 in 什麼 ˙ㄇㄜ)."""
    words = moe.tbcl_words()
    out = defaultdict(set)
    for w, e in words.items():
        if len(w) == 1 or not all(moe._is_cjk(c) for c in w):
            continue
        for z in e["readings"]:
            syls = moe.syllables(z)
            if len(syls) == len(w):
                for c, s in zip(w, syls):
                    out[c].add(s)
    for w, e in words.items():
        if len(w) == 1 and e["readings"]:
            out[w] = {s for z in e["readings"] for s in moe.syllables(z)}
    return dict(out)


def tbcl_lists_reading(ch, syl):
    """False when the TBCL 詞語表 knows `ch` but never in the reading `syl` (們 is ˙ㄇㄣ there, never ㄇㄣˊ;
    的 is ˙ㄉㄜ, never ㄉㄧˋ); True when it lists the reading or does not know the character."""
    known = tbcl_char_syllables().get(ch)
    return not known or moe.norm(syl) in known


def id_pool_candidates(bank):
    """{toned syllable: [{zh, id, level}]}: the characters that may stand for a syllable in Tone ID, best first
    (the grid's rank): in the TBCL 漢字表 at 第1級-第3*級, read in their first-listed 簡編本 reading, in a
    reading the TBCL 詞語表 gives them (tbcl_lists_reading), tone 1-4. The grid's own character often fails the
    last test, as its frequency comes from another reading (們 ㄇㄣˊ, 的 ㄉㄧˋ, 給 ㄐㄧˇ, 沒 ㄇㄛˋ); the syllable
    then falls to the next one (門, 弟, 幾, 末). Wants the first candidate's clip (one per syllable: a clip
    costs ~0.2 MB of docs/); build_id_pool takes the first candidate with a published clip and a contour."""
    top = moe.level_rank(ID_POOL_MAX_LEVEL)
    chars = moe.tbcl_chars()
    out = {}
    for syl, lst in single_char_candidates().items():
        if moe.tone(syl) == 5:
            continue
        keep = [{"zh": zh, "id": aid, "level": chars[zh]["level"]} for rank, zh, aid in lst
                if rank[0] == 0 and rank[1] == 0 and rank[2] <= top and tbcl_lists_reading(zh, syl)]
        if keep:
            bank.want_moe(keep[0]["id"], priority=1 + moe.level_rank(keep[0]["level"]))
            out[syl] = keep
    return out


def build_id_pool(cands, index, cont):
    """Single syllables for Tone ID, ordered by base syllable then tone: for each syllable of
    id_pool_candidates, the first candidate with a published MOE clip and a model contour."""
    out = []
    for syl in sorted(cands, key=lambda s: (moe.base(s), moe.tone(s))):
        for c in cands[syl]:
            if (index.get(c["id"]) or {}).get("src") == "moe" and c["id"] in cont:
                out.append({"zh": c["zh"], "zhuyin": syl, "tone": moe.tone(syl), "id": c["id"], "level": c["level"]})
                break
    return out


def pool_notes(pool, grid):
    """Log lines: the Tone ID syllables whose character differs from the syllable grid's (TBCL reading check)."""
    other = []
    for p in pool:
        g = grid["cells"].get(moe.base(p["zhuyin"]), {}).get(str(p["tone"]))
        if g and g["zh"] != p["zh"]:
            other.append(f"{p['zhuyin']} {g['zh']}→{p['zh']}")
    return [f"  Tone ID uses another character than the grid for {len(other)} syllables: {', '.join(other)}"] if other else []


def empty_pool_reason(cands, index, cont, no_contours):
    """Why the Tone ID pool came out empty (logged as a warning, so a quick rebuild never empties it silently)."""
    ids = {c["id"] for lst in cands.values() for c in lst}
    if not cands:
        return "no single syllable passes the TBCL / first-reading filters (is .cache/ complete?)"
    if not any((index.get(i) or {}).get("src") == "moe" for i in ids):
        return "none of its MOE clips is published (--no-audio with an empty audio cache?)"
    if not cont:
        return ("--no-contours found no model contours computed before (no contour cache, no old contours.json); "
                "run once without --no-contours" if no_contours else "no model contours were computed")
    return "no candidate has both a published clip and a model contour"


def reuse_contours(index, ids, old=None):
    """--no-contours: the model contours computed before, without computing any. Per id: the contour cache entry
    for the clip's current span and analysis parameters (the key contours.compute_all uses; a cached null means
    no usable pitch), else the entry of the previous docs/data/contours.json. Returns (contours, n_from_old)."""
    cache = contours.load_cache()
    if old is None:
        old = moe.read_json(DATA / "contours.json", default={}) or {}
    out, n_old = {}, 0
    for aid in ids:
        e = index.get(aid) or {}
        if e.get("src") != "moe":
            continue
        key = f"{aid}:{e.get('start')}:{e.get('end')}:{contours.PARAMS_TAG}"
        if key in cache:
            if cache[key]:
                out[aid] = cache[key]
        elif old.get(aid):
            out[aid], n_old = old[aid], n_old + 1
    return out, n_old


MOE_VOICE = "moe-announcer"   # the one human voice so far (the MOE dictionary's announcer)


def tag_voices(index):
    """Give every MOE clip of audio.json its speaker, so a second human voice can be added later (§6.7
    adaptive variability: one voice per block while accuracy < 70 %, mixed after)."""
    for e in index.values():
        if e.get("src") == "moe":
            e["voice"] = MOE_VOICE
    return index


def tones_ids(tones):
    """Every MOE id the Tone Gym plays (they all need a model contour)."""
    ids = {p["id"] for p in tones["pairs"]} | {e["id"] for e in tones["sandhi"]["items"]}
    ids |= {r["id"] for r in tones["readings"]} | set(tones["tone_examples"].values())
    ids.discard(None)
    return ids


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
    ap.add_argument("--no-contours", action="store_true",
                    help="compute no new model contours; reuse the cached / previously published ones")
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
    log("Tone Gym content (spoken forms, §6.4) ...")
    pairs = build_pairs(bank)
    sandhi, sandhi_fail = build_sandhi(bank)
    readings = build_readings(bank)
    tone_examples = build_tone_examples(bank)
    tone_notes = pair_warnings(pairs)
    for line in tone_notes:
        log(f"  ⚑ {line}")
    log(f"  pairs {len(pairs)} ({sum(p['core'] for p in pairs)} core), sandhi items {len(sandhi['items'])}, "
        f"readings {len(readings)}, sandhi failures {len(sandhi_fail)}")
    if sandhi_fail:
        for line in sandhi_fail:
            log(f"  FAIL {line}")
        log("BUILD FAILED: a sandhi item's spoken form does not show its rule (fix the item or its rule / no_change).")
        write_report(res, None, None, None, status="FAILED (sandhi)", tone_notes=sandhi_fail + tone_notes)
        sys.exit(1)

    symbols = build_symbols(bank)
    contr = build_contrasts(bank)
    grid = build_syllable_grid(bank)
    pool_cands = id_pool_candidates(bank)
    log(f"Syllable grid: {grid['counts']['bases']} bases, {grid['counts']['toned']} toned syllables with MOE audio")

    log("Audio ...")
    index = tag_voices(bank.render(download=not args.no_audio, max_new=args.max_new, log=log))
    finish_sandhi_audio(sandhi, index)
    tones = {"id_pool": [], "pairs": pairs, "sandhi": sandhi, "readings": readings, "tone_examples": tone_examples}

    model_ids = {c["id"] for cell in grid["cells"].values() for c in cell.values()}
    model_ids |= {w["id"] for c in contr for s in c["sets"] for w in s if w.get("id")}
    model_ids |= {c["id"] for lst in pool_cands.values() for c in lst}
    model_ids |= tones_ids(tones)
    model_ids.discard(None)
    if args.no_contours:
        cont, n_old = reuse_contours(index, sorted(model_ids))
        log(f"  contours: --no-contours, none computed; reusing {len(cont)} computed before ({n_old} of them from the "
            f"previous contours.json); {sum(1 for i in model_ids if i in index and i not in cont)} clips have none")
    else:
        cont = contours.compute_all(index, sorted(model_ids), log=log)
    sandhi_clip_check(tones["sandhi"]["items"], cont, log=log)
    tones["id_pool"] = build_id_pool(pool_cands, index, cont)
    log(f"Tone ID pool: {len(tones['id_pool'])} single syllables (TBCL ≤ {ID_POOL_MAX_LEVEL}, first-listed reading "
        f"that the TBCL word list gives the character, tone 1-4, clip + contour)")
    for line in pool_notes(tones["id_pool"], grid):
        log(line)
    if not tones["id_pool"]:
        log(f"  ! the Tone ID pool is EMPTY (Tone Gym 辨識 and the mirror's single syllables will be too): "
            f"{empty_pool_reason(pool_cands, index, cont, args.no_contours)}")

    write_json("symbols", symbols)
    write_json("contrasts", contr)
    write_json("pairs", pairs)
    write_json("tones", tones)
    write_json("syllables", grid)
    write_json("audio", index)
    write_json("contours", cont)
    write_json("meta", {"built": TODAY, "moe_version": "簡編本 2026-09-29 export / 修訂本 2026-09-29 export",
                        "counts": {"symbols": len(symbols["symbols"]),
                                   "contrast_words": len({(w["zh"], w["zhuyin"]) for c in contr for s in c["sets"] for w in s}),
                                   "pairs": len(pairs), "syllables": grid["counts"]["toned"],
                                   "moe_clips": sum(1 for e in index.values() if e["src"] == "moe"),
                                   "contours": len(cont), "id_pool": len(tones["id_pool"]),
                                   "sandhi_items": len(sandhi["items"]), "readings": len(readings)}})

    words = ([w for c in contr for s in c["sets"] for w in s] + pairs + [e for s in symbols["symbols"] for e in s["examples"]]
             + [e for e in sandhi["items"] if e.get("kind") != "sentence"] + readings)
    no_audio = list(dict.fromkeys(f"{w['zh']} {w['zhuyin']}" for w in words if not w.get("id")))  # unique, content order
    no_tts = [e["zh"] for e in sandhi["items"] if e.get("kind") == "sentence" and not e.get("id") and not e.get("audio")]
    if no_tts:
        log(f"  ! {len(no_tts)} sandhi sentences have no TTS audio (browser voice, labelled): {' '.join(no_tts[:10])}")
    no_contour = sorted(i for i in tones_ids(tones) if i not in cont)
    size_mb = dir_size(moe.DOCS) / 1e6
    over = size_mb > SIZE_BUDGET_MB
    log(f"docs/ size: {size_mb:.1f} MB (budget {SIZE_BUDGET_MB} MB)")
    if bank.missing:
        log(f"  ! {len(bank.missing)} wanted clips are missing: {', '.join(bank.missing[:10])}")
    log("BUILD FAILED: docs/ is over the size budget" if over else "Done.")
    write_report(res, index, bank, {"no_audio_words": no_audio, "contours": len(cont), "size_mb": size_mb,
                                    "grid": grid["counts"],
                                    "tones": {"id_pool": len(tones["id_pool"]), "pairs": len(pairs),
                                              "core": sum(p["core"] for p in pairs), "sandhi_items": len(sandhi["items"]),
                                              "sentences_no_tts": no_tts, "readings": len(readings),
                                              "no_contour": no_contour}},
                 status="FAILED (size budget)" if over else "built", tone_notes=tone_notes)
    if over:
        sys.exit(1)


def write_report(res, index, bank, extra, status="built", tone_notes=()):
    lines = [f"# Build report - {TODAY}", "", f"**Status:** {status}", "",
             "## Verifier", "", f"- checked: {res.checked}", f"- failures: {len(res.failures)}",
             f"- warnings: {len(res.warnings)}", ""]
    for where, zh, z, why in res.failures:
        lines.append(f"- FAIL `{where}`: {zh} `{z}` - {why}")
    for where, zh, z, why in res.warnings:
        lines.append(f"- WARN `{where}`: {zh} `{z}` - {why}")
    if tone_notes:
        lines += ["", "## Tone Gym content (spoken forms, §6.4)", ""] + [f"- {n}" for n in tone_notes]
    if index is not None:
        moe_n = sum(1 for e in index.values() if e["src"] == "moe")
        tts_n = sum(1 for e in index.values() if e["src"] == "tts")
        juyin_n = sum(1 for e in index.values() if e["src"] == "juyin")
        lines += ["", "## Audio coverage", "", f"- MOE human clips: {moe_n}", f"- MOE handbook symbol clips: {juyin_n}",
                  f"- TTS clips: {tts_n}",
                  f"- missing / failed: {len(bank.missing)}" + (" - " + ", ".join(bank.missing[:20]) if bank.missing else ""),
                  f"- content words without an exact-reading MOE clip (browser voice, labelled): {len(extra['no_audio_words'])}"]
        for w in extra["no_audio_words"][:80]:
            lines.append(f"  - {w}")
        flagged = [k for k, e in index.items() if e.get("check")]
        lines += ["", f"- spans flagged for a listen (outside the expected length): {len(flagged)}" + (" - " + ", ".join(flagged[:30]) if flagged else "")]
        t = extra["tones"]
        lines += ["", "## Data", "", f"- syllable grid: {extra['grid']['bases']} bases / {extra['grid']['toned']} toned syllables",
                  f"- model contours: {extra['contours']}",
                  f"- Tone Gym (tones.json): id_pool {t['id_pool']}, pairs {t['pairs']} ({t['core']} core), "
                  f"sandhi items {t['sandhi_items']}, readings {t['readings']}",
                  f"- Tone Gym ids without a model contour: {len(t['no_contour'])}"
                  + (" - " + ", ".join(t["no_contour"][:30]) if t["no_contour"] else ""),
                  f"- sandhi sentences without TTS audio: {len(t['sentences_no_tts'])}"
                  + (" - " + " ".join(t["sentences_no_tts"][:10]) if t["sentences_no_tts"] else ""),
                  f"- docs/ size: {extra['size_mb']:.1f} MB (budget {SIZE_BUDGET_MB} MB)"]
    lines += ["", "## Log", "", "```", *log_lines, "```", ""]
    (moe.ROOT / "build-report.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
