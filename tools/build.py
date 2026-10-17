"""Build everything the site needs from content/ (MASTER_PROMPT §9).

    .venv\\Scripts\\python.exe tools\\build.py                 full build (verifies, downloads new MOE audio, contours)
    .venv\\Scripts\\python.exe tools\\build.py --no-audio      skip downloads and TTS (offline); missing clips are reported
    .venv\\Scripts\\python.exe tools\\build.py --no-contours   compute no new model contours: reuse the ones computed
                                                         before (contour cache, else the old contours.json /
                                                         shadowing.json)
    --max-new N / --max-tts N   at most N new MOE downloads / gTTS requests this run (priority order); rerun to continue

Library and placement (M4, tools/library.py): library-words.json, grammar.json, patterns.json, measure-words.json,
taiwan-vs-mainland.json, phrasebook.json, placement.json, search.json. The headword spans of the streamed Library
clips are measured last, from cache-only downloads (audio.stream_spans): everything else is written before that.

Writes docs/data/*.json (tones.json: the Tone Gym, M2; shadowing.json: the Shadowing page, M3), the MOE 使用說明
docs/data/moe-license-concised.txt (§7.5; both files' `license` field points to it), CC-CEDICT's notice
docs/data/cedict-license.txt (the BY-SA glosses' files point to it), docs/audio/**, and build-report.md. The build
FAILS on any verifier failure, on a missing 使用說明 or CC-CEDICT notice, on a content/tones/sandhi.json item whose
spoken form (moe.spoken, §6.4) does not show its rule, changes when marked no_change, or (half-third) changes at
all, and on a file under docs/data/ or a folder under docs/audio/ with no license entry (PUBLISHED, and its row in
content/sources.md; §7.5 "the build must check that every redistributed file has a license entry"). The size budget
and license failures exit only after the streamed step, so its 404 handling always runs.

A MOE clip that is not published (404 on the moedict CDN, a failed download, or not downloaded yet) never keeps
its id in the data: the id becomes null (the pages then use the labelled browser voice) and the report lists it;
the same for a streamed clip that answers 404 or whose download failed.
"""
import argparse
import datetime as dt
import fnmatch
import json
import re
import sys
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402
import verify  # noqa: E402
import audio  # noqa: E402
import contours  # noqa: E402
import entries  # noqa: E402
import library  # noqa: E402
import lessons  # noqa: E402

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


# ---------------------------------------------------------------- Shadowing data (docs/data/shadowing.json, M3)

SHADOW_DIR = moe.CONTENT / "shadowing"
READING_MAX_S = 25            # M3-DESIGN §1 (c): a longer whole-entry recording is reported (kept)
SEGMENT_CONTOUR_MAX_S = 3.5   # model contours only for reading segments up to this long (M3-DESIGN §2)
SENTENCE_CHARS = (4, 14)      # M3-DESIGN §1: Chinese characters per sentence (outside: reported)


def media_duration(path):
    """Length in seconds of an audio file (2 decimals), decoded in full with the bundled ffmpeg (an mp3 header's
    duration is only an estimate from the bitrate), or None if ffmpeg cannot read it."""
    r = audio.run_ffmpeg(["-i", str(path), "-f", "null", "-"])
    t = re.findall(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)", r.stderr)
    if not t:
        t = re.findall(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", r.stderr)
    if not t:
        return None
    h, m, s = t[-1]
    return round(int(h) * 3600 + int(m) * 60 + float(s), 2)


def build_sentences(bank, rows=None):
    """content/shadowing/sentences.csv (id,level,zh,zhuyin,en,focus,source) -> (sentence entries, notes).

    Each entry: id, level, zh, zhuyin (normalized base tones), spoken (moe.spoken, §6.4), en, focus, source, and
    `audio` = the gTTS key (every sentence is TTS, labelled "TTS (Google zh-TW)", §7.6), swapped for its docs path
    with `dur` by finish_shadowing. No model contours: TTS intonation is not a model (§6.3). Notes (logged, not
    fatal): rows without zh / zhuyin (dropped), repeated ids (renumbered), lengths outside SENTENCE_CHARS."""
    notes = []
    if rows is None:
        p = SHADOW_DIR / "sentences.csv"
        if not p.exists():
            log("  content/shadowing/sentences.csv not found: the shadowing sentence bank will be empty")
            return [], notes
        rows = moe.read_csv(p)
    out, seen = [], set()
    for n, r in enumerate(rows, 1):
        zh, z = r.get("zh", ""), moe.norm(r.get("zhuyin", ""))
        if not zh or not z:
            notes.append(f"sentences.csv row {n + 1}: no zh or zhuyin, left out")
            continue
        sid = r.get("id") or f"s{n:03d}"
        if sid in seen:
            notes.append(f"sentences.csv: id {sid} repeats ({zh}), renumbered s{n:03d}x")
            sid = f"s{n:03d}x"
        seen.add(sid)
        k = sum(1 for c in zh if moe._is_cjk(c))
        if not SENTENCE_CHARS[0] <= k <= SENTENCE_CHARS[1]:
            notes.append(f"sentences.csv {sid} {zh}: {k} characters (design: {SENTENCE_CHARS[0]}-{SENTENCE_CHARS[1]})")
        out.append({"id": sid, "level": r.get("level", ""), "zh": zh, "zhuyin": z, "spoken": moe.spoken(zh, z),
                    "en": r.get("en", ""), "focus": r.get("focus", ""), "audio": bank.want_tts(zh),
                    "source": r.get("source") or "original", "dur": None})
    return out, notes


def build_moe_readings(bank, rows=None):
    """content/shadowing/moe-readings.csv (zh,zhuyin,level,topic) -> (reading entries, notes).

    A reading is a whole-entry MOE recording (headword, definition, 「例如」, example; §7.3) of the exact reading,
    played whole and labelled "MOE dictionary reading", with the 簡編本 entry text shown unmodified apart from
    format conversion (entries.clean_text, §7.5). Each entry: zh, zhuyin, spoken, level (the row's, else TBCL),
    topic, id (the reading's MOE audio id, which is its 簡編本 字詞號), text; dur, segments and contours are added
    by finish_shadowing once the clip is published. Dropped and noted: single characters (their files read the
    radical and stroke count), rows without an exact-reading audio id or without a 簡編本 row. Noted but kept: an
    entry without a [例] example."""
    notes = []
    if rows is None:
        p = SHADOW_DIR / "moe-readings.csv"
        if not p.exists():
            log("  content/shadowing/moe-readings.csv not found: there will be no MOE dictionary readings")
            return [], notes
        rows = moe.read_csv(p)
    out, seen = [], set()
    for r in rows:
        zh, z = r.get("zh", ""), moe.norm(r.get("zhuyin", ""))
        if not zh or not z:
            continue
        where = f"moe-readings.csv {zh} {z}"
        aid = moe.audio_id(zh, z)
        e = entries.entry_for(zh, z)
        if len(zh) < 2:
            notes.append(f"{where}: a single character (its file reads the radical and stroke count), left out")
        elif not aid:
            notes.append(f"{where}: no MOE recording of this exact reading, left out")
        elif not e or e["id"] != str(aid):
            notes.append(f"{where}: no 簡編本 row for audio id {aid}, left out")
        elif str(aid) in seen:
            notes.append(f"{where}: listed twice, kept once")
        else:
            seen.add(str(aid))
            if not entries.has_example(e):
                notes.append(f"{where}: the entry has no [例] example sentence")
            t = moe.tbcl_words().get(zh)
            out.append({"zh": zh, "zhuyin": z, "spoken": moe.spoken(zh, z),
                        "level": r.get("level") or (t["level"] if t else ""), "topic": r.get("topic", ""),
                        "id": bank.want_moe(aid, priority=0, nsyl=len(moe.syllables(z))), "text": e["text"],
                        "dur": None, "segments": [], "contours": {}})
    return out, notes


def segment_syllables(k, seg, nsyl):
    """Syllable count passed to the contour tracker for segment k: the headword's own for the first segment, else
    an estimate from its length (any count > 1 runs the word rules; the count is part of the cache key)."""
    return nsyl if k == 0 else max(2, round(4 * (seg[1] - seg[0])))


def reading_spans(readings):
    """{(reading index, segment index): (aid, start, end, syllables, span)} for every segment of at most
    SEGMENT_CONTOUR_MAX_S seconds (the ones that get a model contour). span: the connected-speech rules of
    contours.SPAN_PARAMS, for every segment but the first (the headword: word rules, the same contour as the
    headword span that the M2 sweep validated)."""
    spans = {}
    for i, r in enumerate(readings):
        nsyl = len(moe.syllables(r["zhuyin"]))
        for k, seg in enumerate(r["segments"]):
            if seg[1] - seg[0] <= SEGMENT_CONTOUR_MAX_S:
                spans[(i, k)] = (r["id"], seg[0], seg[1], segment_syllables(k, seg, nsyl), k > 0)
    return spans


def previous_span_contours(path=None):
    """{(reading id, segment start, segment end): contour} of the previous docs/data/shadowing.json (read before
    this build writes the new one)."""
    old = moe.read_json(path or DATA / "shadowing.json", default={}) or {}
    out = {}
    for r in old.get("readings") or []:
        segs = r.get("segments") or []
        for k, c in (r.get("contours") or {}).items():
            if c and str(k).isdigit() and int(k) < len(segs):
                out[(r.get("id"), segs[int(k)][0], segs[int(k)][1])] = c
    return out


def reuse_span_contours(spans, old=None):
    """--no-contours: the segment contours computed before, without computing any (as reuse_contours does for the
    headword ones). Per segment: the contour cache entry under the key contours.compute_spans uses (a cached null
    means no usable pitch), else the contour of the previous shadowing.json for the same reading id, segment start
    and end and point count. Either must pass contours.span_flags, as computed ones do. Returns (contours,
    n_from_old, n_held_back)."""
    cache = contours.load_cache()
    if old is None:
        old = previous_span_contours()
    out, n_old, held = {}, 0, 0
    for key, (aid, s, e, syl, span) in spans.items():
        n = contours.points_for(s, e)
        ck = contours.span_key(aid, s, e, n, syl, span)
        c, from_old = cache.get(ck), False
        if ck not in cache:
            c = old.get((aid, s, e))
            c, from_old = (c, True) if c and len(c.get("st") or ()) == n else (None, False)
        if not c:
            continue
        if contours.span_flags(c, s, e):
            held += 1
            continue
        out[key] = c
        n_old += from_old
    return out, n_old, held


def gate_span_contours(cont, spans):
    """Publish a connected-speech segment contour (span True: every segment but the headword) only if it passes
    contours.span_gate; headword segments are left as they are. Returns (kept contours, {reason: [keys]}): a key
    is listed under each reason it fails."""
    kept, failed = {}, {}
    for key, c in cont.items():
        why = contours.span_gate(c) if spans[key][4] else []
        for f in why:
            failed.setdefault(f, []).append(key)
        if not why:
            kept[key] = c
    return kept, failed


def finish_shadowing(shadow, index, no_contours=False):
    """After the audio is published: each sentence's gTTS key -> its docs path + measured `dur` (None when TTS
    failed: the page falls back to a labelled browser voice); each reading gets dur, segments
    (audio.detect_segments) and model contours of its segments of <= SEGMENT_CONTOUR_MAX_S s, keyed by segment
    index (contours.points_for: ~25 points per second, at least 40); a segment after the headword gets one only if
    it passes contours.span_gate (gate_span_contours). Readings whose clip is not published are dropped. Returns
    notes (logged)."""
    notes = []
    for s in shadow["sentences"]:
        e = index.get(s["audio"]) or {}
        s["audio"] = e.get("path")
        s["dur"] = media_duration(moe.DOCS / s["audio"]) if s["audio"] else None
        if s["audio"] and s["dur"] is None:
            notes.append(f"sentence {s['id']} {s['zh']}: ffmpeg could not measure {s['audio']}")
    kept, segcache = [], audio.load_segments()
    for r in shadow["readings"]:
        if (index.get(r["id"]) or {}).get("src") != "moe":
            notes.append(f"reading {r['zh']} {r['id']}: clip not published (not downloaded yet?), left out")
            continue
        info = audio.segment_info(audio.MOE_CACHE / f"{r['id']}.ogg", nsyl=len(moe.syllables(r["zhuyin"])),
                                  cache=segcache)
        r["dur"], r["segments"] = info["dur"], info["segments"]
        if info.get("check"):
            notes.append(f"reading {r['zh']} {r['id']}: no threshold gave plausible segments; kept the -35 dB ones "
                         f"({len(r['segments'])}), listen to it")
        if r["dur"] > READING_MAX_S:
            notes.append(f"reading {r['zh']} {r['id']}: {r['dur']} s, over {READING_MAX_S} s (design §1 c)")
        kept.append(r)
    audio.save_segments(segcache)
    shadow["readings"] = kept
    spans = reading_spans(kept)
    old = previous_span_contours()
    if no_contours:
        cont, n_old, held = reuse_span_contours(spans, old)
        how = (f" (--no-contours: none computed; {n_old} from the previous shadowing.json"
               + (f", {held} held back by contours.span_flags" if held else "") + ")")
    else:
        cont, how = contours.compute_spans(spans, log=log), ""
    n_conn = sum(1 for key in cont if spans[key][4])
    cont, failed = gate_span_contours(cont, spans)
    if failed:
        n_drop = n_conn - sum(1 for key in cont if spans[key][4])
        eg = sorted({key for ks in failed.values() for key in ks})[:8]
        msg = (f"{n_drop} of {n_conn} connected-speech segment contours failed the sanity gate (contours.span_gate: "
               + ", ".join(f"{f} {len(ks)}" for f, ks in sorted(failed.items()))
               + "), not published (no overlay on those lines)")
        log(f"  {msg}; e.g. " + " ".join(f"{kept[i]['zh']}:{k}" for i, k in eg))
        notes.append(msg)
    for (i, k), c in sorted(cont.items()):
        kept[i]["contours"][str(k)] = c
    log(f"  shadowing: {len(shadow['sentences'])} sentences ({sum(1 for s in shadow['sentences'] if s['audio'])} "
        f"with TTS), {len(kept)} MOE readings, {sum(len(r['segments']) for r in kept)} segments, "
        f"{len(cont)}/{len(spans)} segment contours{how}")
    if len(old) >= 20 and len(cont) < 0.8 * len(old):
        notes.append(f"only {len(cont)} segment contours, the previous shadowing.json had {len(old)} "
                     f"(the MOE lines of a timed session need one){': run once without --no-contours' if no_contours else ''}")
    return notes


def shadowing_size_mb(shadow):
    """docs/ megabytes of the shadowing audio (reading clips ogg + mp3, TTS sentences)."""
    files = [moe.DOCS / "audio" / "moe" / f"{r['id']}.{x}" for r in shadow["readings"] for x in ("ogg", "mp3")]
    files += [moe.DOCS / s["audio"] for s in shadow["sentences"] if s["audio"]]
    return sum(f.stat().st_size for f in files if f.exists()) / 1e6


def shadowing_summary(shadow, size_mb, notes):
    """Report lines for build-report.md."""
    sents, rds = shadow["sentences"], shadow["readings"]
    durs = sorted(r["dur"] for r in rds if r["dur"])
    no_tts = [s["zh"] for s in sents if not s["audio"]]
    return [f"sentences: {len(sents)} (by level: {dict(sorted(Counter(s['level'] for s in sents).items()))}); "
            f"without TTS audio: {len(no_tts)}" + (" - " + " ".join(no_tts[:10]) if no_tts else ""),
            f"sentence focus values: {dict(Counter(s['focus'] for s in sents).most_common())}",
            f"MOE dictionary readings: {len(rds)}" + (f", {durs[0]}-{durs[-1]} s (median {durs[len(durs) // 2]} s)"
                                                       if durs else ""),
            f"reading segments: {sum(len(r['segments']) for r in rds)}, with a model contour: "
            f"{sum(len(r['contours']) for r in rds)} (segments <= {SEGMENT_CONTOUR_MAX_S} s)",
            f"shadowing audio in docs/: {size_mb:.1f} MB",
            f"notes: {len(notes)}"] + [f"  - {n}" for n in notes]


def publish_license():
    """Copy the MOE 使用說明 of the 簡編本 (content/moe-license-concised.txt, kept unmodified) byte for byte to
    docs/data/, where the `license.path` of shadowing.json and tones.json points (§7.5: it travels with any
    redistributed 簡編本 text or audio). Returns why it could not, or None. The 修訂本's 使用說明 is not published:
    its data is used only to verify readings and derive spoken tones, none of its text or audio is redistributed."""
    src = entries.LICENSE_SRC
    body = src.read_bytes() if src.exists() else b""
    if "公眾授權使用說明".encode("utf-8") not in body:
        where = src.relative_to(moe.ROOT).as_posix() if src.is_relative_to(moe.ROOT) else str(src)
        return f"{where} is missing or is not the MOE 使用說明"
    dst = moe.DOCS / entries.LICENSE_PATH
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(body)
    return None


# ---------------------------------------------------------------- license entries (§7.5: the repo is public)

SOURCES_MD = moe.CONTENT / "sources.md"
_NAER = "TBCL fields credited to NAER (臺灣華語文能力基準, only the fields the app needs)"
_SA = "CC BY-SA 4.0 (CC-CEDICT glosses, modified; notice in data/cedict-license.txt)"
_ND = "CC BY-ND 3.0 TW, unmodified, with data/moe-license-concised.txt"
# Every file the site redistributes under docs/data/ and every folder under docs/audio/ (paths relative to docs/,
# fnmatch patterns allowed): (source, license). check_licenses() fails the build on a published file or folder
# with no row here, and on a row whose file content/sources.md ("Published files" table) does not list.
PUBLISHED = {
    "data/moe-license-concised.txt": ("MOE 國語辭典簡編本 使用說明 (content/moe-license-concised.txt, byte for byte)",
                                      "MOE's own terms, unmodified"),
    "data/moe-license-idioms.txt": ("MOE 成語典 使用說明 idiomsdict_10409 (as text)", "MOE's own terms, unmodified"),
    "data/cedict-license.txt": ("CC-CEDICT's header notice (unchanged) + our note of the changes made",
                                "CC BY-SA 4.0 notice"),
    "data/chengyu.json": ("MOE 成語典 entries (content/library/chengyu.csv selection)",
                          "CC BY-ND 3.0 TW, unmodified, with data/moe-license-idioms.txt"),
    "data/library-words.json": ("TBCL words, levels, topics; MOE/TBCL Zhuyin; CC-CEDICT glosses", f"{_SA}; {_NAER}"),
    "data/search.json": ("search index of the Library entries (CC-CEDICT glosses)", f"{_SA}; {_NAER}"),
    "data/placement.json": ("our questions and diagnostic; TBCL level-5 words with CC-CEDICT glosses",
                            f"{_SA}; {_NAER}; MOE clips {_ND}"),
    "data/characters.json": ("TBCL 漢字表 character + level; MOE 簡編本 部首字 and strokes; CC-CEDICT radical meanings",
                             f"{_SA}; {_NAER}"),
    "data/grammar.json": ("TBCL 語法點表 point name + level; our explanations and examples", f"our writing; {_NAER}"),
    "data/patterns.json": ("content/library/patterns.csv", "our writing"),
    "data/measure-words.json": ("content/library/measure-words.csv", "our writing; streamed MOE clips (ids only)"),
    "data/taiwan-vs-mainland.json": ("content/library/taiwan-vs-mainland.csv", "our writing; streamed MOE clips (ids only)"),
    "data/phrasebook.json": ("content/library/phrasebook.csv", "our writing"),
    "data/my-mistakes.json": ("content/library/my-mistakes.csv (the learner's CORRECT log)", "our writing"),
    "data/units.json": ("content/units/*.json", f"our writing; {_NAER}; TTS labelled (gTTS)"),
    "data/units-index.json": ("content/units/*.json (unit list, word and grammar keys)", f"our writing; {_NAER}"),
    "data/plan.json": ("content/plan.json", "our writing; TBCL / TOCFL level names credited to NAER / SC-TOP"),
    "data/reading.json": ("content/reading/*.json", "our writing; TTS labelled (gTTS)"),
    "data/advanced.json": ("content/advanced/*.json", "our writing; TTS labelled (gTTS)"),
    "data/resources.json": ("content/resources.json (links, check dates, HTTP status)", "links only, nothing copied"),
    "data/meta.json": ("build date, MOE export version and counts", "our own build metadata"),
    "data/tones.json": ("Tone Gym: MOE readings and clip ids, our pairs and sandhi items, Mainland readings",
                        f"{_ND}; Mainland readings from CC-CEDICT, CC BY-SA 4.0; our writing"),
    "data/shadowing.json": ("our sentences; MOE 簡編本 entry text and readings", _ND),
    "data/audio.json": ("index of the published clips (spans, paths, labels)", f"{_ND}; handbook CC BY 4.0; TTS labelled"),
    "data/contours.json": ("pitch contours measured from the MOE clips", _ND),
    "data/contrasts.json": ("content/zhuyin/contrasts.json + MOE clip ids", f"our writing; {_ND}"),
    "data/pairs.json": ("content/tones/pairs.csv + MOE clip ids", f"our writing; {_ND}"),
    "data/symbols.json": ("content/zhuyin/symbols.json + handbook / MOE clip ids", f"our writing; {_ND}; handbook CC BY 4.0"),
    "data/syllables.json": ("syllable grid: MOE clip ids, TBCL character levels", f"{_ND}; {_NAER}"),
    "audio/moe/": ("MOE 國語辭典簡編本 announcer recordings, whole files (+ mp3 format conversion)", _ND),
    "audio/juyin/": ("MOE 國語注音符號手冊 recordings (mp3 format conversion)", "CC BY 4.0, 教育部"),
    "audio/tts/": ("gTTS zh-TW sentence audio", "gTTS output, labelled TTS (edge-tts output is never published)"),
}


def published_items(docs=None):
    """Every file under docs/data/ and every folder (or loose file) under docs/audio/, relative to docs/."""
    docs = moe.DOCS if docs is None else Path(docs)
    out = sorted(f.relative_to(docs).as_posix() for f in (docs / "data").rglob("*") if f.is_file())
    if (docs / "audio").is_dir():
        out += sorted(f"audio/{p.name}/" if p.is_dir() else f"audio/{p.name}" for p in (docs / "audio").iterdir())
    return out


def listed_in_sources(item, tokens):
    """Does the 'Published files' table of content/sources.md name `item` (in backticks: `chengyu.json`,
    `docs/data/chengyu.json`, `docs/audio/moe/*` ...)?"""
    if item.startswith("audio/") and item.endswith("/"):
        return any(t.startswith(item) or t.startswith("docs/" + item) for t in tokens)
    name = item.removeprefix("data/")
    return any(t in (item, name, "docs/" + item) for t in tokens)


def check_licenses(docs=None, sources=None):
    """§7.5 (the repo is public, so the build must check that every redistributed file has a license entry): each
    file under docs/data/ and each folder under docs/audio/ needs a PUBLISHED row, and content/sources.md must list
    it in its 'Published files' table. Returns the problems (the build fails on any) and the number checked."""
    src = Path(sources) if sources else SOURCES_MD
    text = src.read_text(encoding="utf-8") if src.exists() else ""
    m = re.search(r"^## Published files.*?(?=^## |\Z)", text, re.S | re.M)
    tokens = set(re.findall(r"`([^`\n]+)`", m.group(0))) if m else set()
    items, problems = published_items(docs), []
    if not m:
        problems.append(f"{src.name} has no 'Published files' table")
    for it in items:
        if not any(fnmatch.fnmatchcase(it, pat) for pat in PUBLISHED):
            problems.append(f"docs/{it} is published but has no license entry (build.py PUBLISHED)")
        elif m and not listed_in_sources(it, tokens):
            problems.append(f"docs/{it} is not listed in the 'Published files' table of content/sources.md")
    return problems, len(items)


# ---------------------------------------------------------------- Library and placement data (M4)

def write_library(lib, readings, index, cont):
    """Write the Library and placement files (library.build after library.finish) and search.json. Returns notes
    for the report: placement / diagnostic clips that are not published or have no model contour."""
    notes = []
    library.apply_spans(lib, audio.load_spans())
    no_tts = []
    for q in lib["placement"]["questions"]:
        if q.get("id") and (index.get(q["id"]) or {}).get("src") != "moe":
            notes.append(f"placement listening item {q['zh']}: MOE clip {q['id']} not published (not downloaded yet?)")
        if q.get("skill") == "listening" and not q.get("id") and not q.get("audio"):
            no_tts.append(q["zh"])
    if no_tts:
        notes.append(f"{len(no_tts)} placement listening items have no TTS yet (browser voice, labelled): "
                     + " ".join(no_tts[:8]) + (" …" if len(no_tts) > 8 else ""))
    for d in lib["placement"]["diagnostic"]:
        if d.get("id") and (index.get(d["id"]) or {}).get("src") != "moe":
            notes.append(f"diagnostic {d['zh']}: MOE clip {d['id']} not published (not downloaded yet?)")
        elif d.get("id") and d["id"] not in cont:
            notes.append(f"diagnostic {d['zh']}: no model contour for clip {d['id']}")
    write_json("library-words", library.words_file(lib))
    write_json("grammar", lib["grammar"])
    write_json("patterns", lib["patterns"])
    write_json("measure-words", lib["measure"])
    write_json("taiwan-vs-mainland", lib["taiwan"])
    write_json("phrasebook", lib["phrasebook"])
    write_json("placement", lib["placement"])
    write_json("my-mistakes", library.build_mistakes())
    lib["search"] = library.search_rows(lib, readings)
    write_json("search", library.search_file(lib["search"]))
    for n in notes:
        log(f"  ⚑ {n}")
    return notes


def write_lessons(less):
    """Write the M5 / M6 files (lessons.py): units, units-index, plan, reading, advanced, chengyu, resources,
    characters. A file whose source is missing (chengyu without the MOE data, resources) is not written."""
    write_json("units", {"units": less["units"]})
    write_json("units-index", less["index"])
    write_json("plan", less["plan"])
    write_json("reading", less["reading"])
    write_json("advanced", less["advanced"])
    for name in ("chengyu", "resources", "characters"):
        if less.get(name) is not None:
            write_json(name, less[name])


def library_counts(lib):
    """meta.json counts of the Library and the placement check."""
    pl = lib["placement"]
    return {"library_words": len(lib["words"]), "library_forms": len({w["w"] for w in lib["words"]}),
            "library_word_audio": sum(1 for w in lib["words"] if w["id"]), "grammar_points": len(lib["grammar"]),
            "patterns": len(lib["patterns"]), "measure_words": len(lib["measure"]),
            "taiwan_vs_mainland": len(lib["taiwan"]), "phrases": len(lib["phrasebook"]),
            "placement_questions": len(pl["questions"]), "diagnostic_words": len(pl["diagnostic"]),
            "vocab_l5": len(pl["vocab_l5"]), "search_rows": len(lib.get("search") or []),
            "library_word_spans": sum(1 for w in lib["words"] if w.get("s"))}


MOE_VOICE = "moe-announcer"   # the one human voice so far (the MOE dictionary's announcer)


def tag_voices(index):
    """Give every MOE clip of audio.json its speaker, so a second human voice can be added later (§6.7
    adaptive variability: one voice per block while accuracy < 70 %, mixed after)."""
    for e in index.values():
        if e.get("src") == "moe":
            e["voice"] = MOE_VOICE
    return index


def drop_unpublished(bank, index, *objs):
    """A self-hosted MOE clip that was not published (404 on the moedict CDN, a failed download, or not downloaded
    yet: bank.moe_missing) must not look playable: every `id` naming it in `objs` (dicts / lists, walked) becomes
    None, so the page uses the labelled browser voice instead of a MOE button that fails. Returns
    ["<zh> <id> (<why>)"] for the report, one per clip."""
    gone = {a for a in bank.moe_ids if (index.get(a) or {}).get("src") != "moe"}
    out = {}

    def walk(x):
        if isinstance(x, dict):
            aid = x.get("id")
            if isinstance(aid, str) and aid in gone:
                out.setdefault(aid, f"{x.get('zh') or ''} {aid} ({bank.moe_missing.get(aid, 'not published')})".strip())
                x["id"] = None
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    for o in objs:
        walk(o)
    return list(out.values())


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
    ap.add_argument("--max-tts", type=int, default=None,
                    help="request at most N new gTTS sentences this run (priority order); rerun to continue")
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

    why, rule = publish_license(), "the MOE 使用說明 must travel with the redistributed 簡編本 text and audio"
    if not why:
        why, rule = library.publish_cedict_license(), "CC-CEDICT's notice must travel with its BY-SA glosses"
    if why:
        log(f"BUILD FAILED: {why} (§7.5: {rule}).")
        write_report(res, None, None, None, status="FAILED (license)", tone_notes=tone_notes)
        sys.exit(1)

    log("Shadowing content (M3) ...")
    sentences, shadow_notes = build_sentences(bank)
    moe_readings, notes = build_moe_readings(bank)
    shadow_notes += notes
    shadow = {"sentences": sentences, "readings": moe_readings, "attribution": entries.attribution(),
              "license": entries.license_info()}
    log(f"  sentences {len(sentences)}, MOE readings {len(moe_readings)}")

    log("Library and placement (M4) ...")
    lib = library.build(bank, log=log)

    symbols = build_symbols(bank)
    contr = build_contrasts(bank)

    log("Units, plan, reading, advanced (M5, M6) ...")
    lnotes = lessons.new_notes()
    units = lessons.build_units(bank, audio.load_spans(), lnotes, [g["id"] for g in lib["grammar"]], [c["id"] for c in contr])
    less = {"units": units, "plan": lessons.build_plan(units, lnotes), "reading": lessons.build_reading(bank, lnotes),
            "advanced": lessons.build_advanced(bank, lnotes), "chengyu": lessons.build_chengyu(lnotes),
            "resources": lessons.build_resources(lnotes), "characters": lessons.build_characters(lnotes)}
    less["index"] = lessons.units_index(units, lib["words"])
    for line in lessons.report_lines(less, lnotes)[:5]:
        log(f"  {line}")
    grid = build_syllable_grid(bank)
    pool_cands = id_pool_candidates(bank)
    log(f"Syllable grid: {grid['counts']['bases']} bases, {grid['counts']['toned']} toned syllables with MOE audio")

    log("Audio ...")
    index = tag_voices(bank.render(download=not args.no_audio, max_new=args.max_new, log=log, max_tts=args.max_tts))
    # A MOE clip that is not published keeps its id nowhere (the pages use the labelled browser voice): the
    # self-hosted ones not in audio.json, and the streamed ones the CDN answers 404 for (the rest are checked by the
    # span step at the end).
    dropped = drop_unpublished(bank, index, symbols, contr, pairs, sandhi, readings, grid,
                               lib["placement"]["questions"], lib["placement"]["diagnostic"])
    for k, v in tone_examples.items():
        if v and (index.get(v) or {}).get("src") != "moe":
            dropped.append(f"tone example {k} {v} ({bank.moe_missing.get(v, 'not published')})")
            tone_examples[k] = None
    streamed_dropped = (library.drop_clips(lib, audio.missing_clips())
                        + lessons.drop_clips(units, audio.missing_clips()))
    if dropped or streamed_dropped:
        log(f"  ! MOE clips not published, id set to null (browser voice, labelled): {len(dropped)} self-hosted, "
            f"{len(streamed_dropped)} streamed entries (see the report)")
    finish_sandhi_audio(sandhi, index)
    library.finish(lib, index)
    lessons.finish(less, index, media_duration)
    shadow_notes += finish_shadowing(shadow, index, no_contours=args.no_contours)
    for line in shadow_notes:
        log(f"  ⚑ {line}")
    tones = {"id_pool": [], "pairs": pairs, "sandhi": sandhi, "readings": readings, "tone_examples": tone_examples,
             "license": entries.license_info()}   # its MOE clips are 簡編本 audio (§7.5)

    model_ids = {c["id"] for cell in grid["cells"].values() for c in cell.values()}
    model_ids |= {w["id"] for c in contr for s in c["sets"] for w in s if w.get("id")}
    model_ids |= {c["id"] for lst in pool_cands.values() for c in lst}
    model_ids |= tones_ids(tones)
    model_ids |= {d["id"] for d in lib["placement"]["diagnostic"] if d.get("id")}   # the diagnostic's model contours
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
    write_json("shadowing", shadow)
    lib_notes = write_library(lib, readings, index, cont)
    write_lessons(less)
    meta = {"built": TODAY, "moe_version": "簡編本 2026-09-29 export / 修訂本 2026-09-29 export",
                        "counts": {"symbols": len(symbols["symbols"]),
                                   "contrast_words": len({(w["zh"], w["zhuyin"]) for c in contr for s in c["sets"] for w in s}),
                                   "pairs": len(pairs), "syllables": grid["counts"]["toned"],
                                   "moe_clips": sum(1 for e in index.values() if e["src"] == "moe"),
                                   "contours": len(cont), "id_pool": len(tones["id_pool"]),
                                   "sandhi_items": len(sandhi["items"]), "readings": len(readings),
                                   "sentences": len(shadow["sentences"]), "moe_readings": len(shadow["readings"]),
                                   **library_counts(lib), **lessons.counts(less)}}
    write_json("meta", meta)

    words = ([w for c in contr for s in c["sets"] for w in s] + pairs + [e for s in symbols["symbols"] for e in s["examples"]]
             + [e for e in sandhi["items"] if e.get("kind") != "sentence"] + readings)
    no_audio = list(dict.fromkeys(f"{w['zh']} {w['zhuyin']}" for w in words if not w.get("id")))  # unique, content order
    no_tts = [e["zh"] for e in sandhi["items"] if e.get("kind") == "sentence" and not e.get("id") and not e.get("audio")]
    if no_tts:
        log(f"  ! {len(no_tts)} sandhi sentences have no TTS audio (browser voice, labelled): {' '.join(no_tts[:10])}")
    no_contour = sorted(i for i in tones_ids(tones) if i not in cont)
    shadow_mb = shadowing_size_mb(shadow)
    if bank.missing:
        log(f"  ! {len(bank.missing)} wanted clips are missing: {', '.join(bank.missing[:10])}")
    extra = {"no_audio_words": no_audio, "contours": len(cont), "size_mb": 0.0, "grid": grid["counts"],
             "tones": {"id_pool": len(tones["id_pool"]), "pairs": len(pairs), "core": sum(p["core"] for p in pairs),
                       "sandhi_items": len(sandhi["items"]), "sentences_no_tts": no_tts, "readings": len(readings),
                       "no_contour": no_contour},
             "shadowing": shadowing_summary(shadow, shadow_mb, shadow_notes),
             "library": lambda: library.report_lines(lib) + lib_notes,
             "lessons": lambda: lessons.report_lines(less, lnotes),
             "licenses": ([], 0), "dropped": dropped, "streamed_dropped": streamed_dropped}

    def final_checks():
        """The size budget and the license check (§7.5), stored in `extra` for the report. Returns the failed status,
        or None. The build exits on a failure only at the very end, after the streamed step below, so a size or
        license failure never skips the streamed clips' 404 handling (those ids would otherwise ship as playable)."""
        size = dir_size(moe.DOCS) / 1e6
        extra["size_mb"], extra["licenses"] = size, check_licenses()
        return "FAILED (size budget)" if size > SIZE_BUDGET_MB else "FAILED (license)" if extra["licenses"][0] else None

    failed = final_checks()
    log(f"docs/ size: {extra['size_mb']:.1f} MB (budget {SIZE_BUDGET_MB} MB; shadowing audio {shadow_mb:.1f} MB)")
    log(f"  ! {failed}: the streamed clips step still runs (ids the CDN does not have become null), then the build "
        f"exits with an error" if failed else "Site data written.")
    write_report(res, index, bank, extra, status=f"{failed or 'built'} (Library spans pending)", tone_notes=tone_notes)
    # Last, as it is long and needs nothing above: the streamed Library clips' headword spans (cache-only
    # downloads, sharing --max-new with the published clips). Everything is already written, so stopping the build
    # here loses nothing; library-words.json is rewritten after every batch and the next build continues.
    log("Library word audio: headword spans of the streamed MOE clips ...")
    left_new = None if args.max_new is None else max(0, args.max_new - bank.downloaded)

    def write_streamed(spans, gone):
        """Drop the clips known to be gone (404, failed: their id becomes null), fill the spans, rewrite the files."""
        streamed_dropped.extend(library.drop_clips(lib, gone) + lessons.drop_clips(units, gone))
        library.apply_spans(lib, spans)
        lessons.apply_spans(units, spans)
        write_json("library-words", library.words_file(lib))
        write_json("placement", lib["placement"])
        write_json("measure-words", lib["measure"])
        write_json("taiwan-vs-mainland", lib["taiwan"])
        write_json("units", {"units": units})

    wants = library.span_wants(lib)
    wants.update({k: v for k, v in lessons.span_wants(units).items() if k not in wants})
    st = audio.stream_spans(wants, max_new=left_new, download=not args.no_audio, log=log,
                            on_batch=lambda spans: write_streamed(spans, audio.missing_clips()))
    gone = {**{a: "download failed this build" for a in st["failed_ids"]}, **audio.missing_clips()}
    write_streamed(audio.load_spans(), gone)
    n_span = sum(1 for x in lib["words"] + lib["placement"]["vocab_l5"] + lib["measure"] + lib["taiwan"] if x.get("s"))
    log(f"  streamed clips: {st['measured']} spans measured this run ({st['downloaded']} downloaded, {st['failed']} "
        f"failed, {len(st['unavailable'])} missing on the CDN); {n_span} streamed entries have a span; "
        f"{len(streamed_dropped)} streamed entries published without a clip (id null, browser voice); {st['left']} "
        f"clips still to fetch (rerun the build)")
    meta["counts"].update(library_counts(lib))
    meta["counts"].update(lessons.counts(less))
    write_json("meta", meta)
    failed = final_checks()   # again: the files above were rewritten
    for p in extra["licenses"][0]:
        log(f"  FAIL license: {p}")
    if failed:
        log(f"BUILD FAILED: docs/ is over the size budget ({extra['size_mb']:.1f} MB > {SIZE_BUDGET_MB} MB)"
            if failed == "FAILED (size budget)" else
            "BUILD FAILED: a published file has no license entry (§7.5: add it to PUBLISHED in tools/build.py and to "
            "the 'Published files' table of content/sources.md)")
        write_report(res, index, bank, extra, status=failed, tone_notes=tone_notes)
        sys.exit(1)
    log("Done.")
    write_report(res, index, bank, extra, status="built", tone_notes=tone_notes)


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
    if extra and (extra.get("dropped") or extra.get("streamed_dropped")):
        d, sd = extra.get("dropped") or [], extra.get("streamed_dropped") or []
        lines += ["", "## MOE clips not playable (id published as null: the pages use the labelled browser voice)", "",
                  f"- self-hosted clips not published (404 on the moedict CDN / download failed / not downloaded yet): "
                  f"{len(d)}"] + [f"  - {x}" for x in d[:200]] + (["  - …"] if len(d) > 200 else [])
        lines += [f"- streamed entries whose clip is missing on the CDN (404) or failed to download: {len(sd)}"]
        lines += [f"  - {x}" for x in sd[:200]] + (["  - …"] if len(sd) > 200 else [])
    if extra and extra.get("licenses"):
        problems, checked = extra["licenses"]
        lines += ["", "## Licenses (§7.5)", "",
                  f"- published files and audio folders checked against build.py PUBLISHED and content/sources.md: "
                  f"{checked}, problems: {len(problems)}"] + [f"  - FAIL {p}" for p in problems]
    if extra and extra.get("shadowing"):
        lines += ["", "## Shadowing (shadowing.json, M3)", ""] + [f"- {x}" for x in extra["shadowing"]]
    if extra and extra.get("library"):
        lines += ["", "## Library and placement (M4)", ""] + [f"- {x}" for x in extra["library"]()]
    if extra and extra.get("lessons"):
        lines += ["", "## Units, plan, reading, advanced (M5, M6)", ""] + [f"- {x}" for x in extra["lessons"]()]
    lines += ["", "## Log", "", "```", *log_lines, "```", ""]
    (moe.ROOT / "build-report.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
