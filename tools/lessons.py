"""Units, plan, reading, advanced, idioms, resources and characters data (M5, M6; MASTER_PROMPT §5.5, §5.8, §7.5).

    docs/data/units.json         content/units/*.json + spoken (sandhi) forms, TTS audio + dur on dialogue and
                                 shadowing lines, vocabulary MOE ids + headword spans (streamed like the Library)
    docs/data/units-index.json   {units: [unit list], index: {"word:<Library key>" | "grammar:<id>": [{id, title}]}}
    docs/data/plan.json          content/plan.json as written (released_units checked against the units)
    docs/data/reading.json       content/reading/L*.json + spoken forms and TTS audio + dur per sentence
    docs/data/advanced.json      content/advanced/prompts.json (journal flattened, role-play lines with TTS audio)
                                 + register.json (under "register"; pairs get their example as "examples")
    docs/data/chengyu.json       the 60 idioms of content/library/chengyu.csv with the MOE 成語典 fields, unmodified
                                 (CC BY-ND 3.0 TW; its 使用說明 travels as docs/data/moe-license-idioms.txt)
    docs/data/resources.json     content/resources.json as written (links with verified / checked / status)
    docs/data/characters.json    TBCL 漢字表 character + level only; the 214 Kangxi radicals (Unicode order) as the
                                 MOE 簡編本 部首字 column uses them, with stroke counts, a CC-CEDICT meaning and the
                                 TBCL characters filed under each

Zhuyin here is the content's own (verified in the build), stored in base tones; `spoken` comes from moe.spoken.
TTS keys (bank.want_tts) are swapped for docs paths by finish(), after the audio is rendered.
"""
import json
import shutil
import unicodedata
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402
import pinyin  # noqa: E402
import library  # noqa: E402

UNITS = moe.CONTENT / "units"
READING = moe.CONTENT / "reading"
ADV = moe.CONTENT / "advanced"
PLAN = moe.CONTENT / "plan.json"
RESOURCES = moe.CONTENT / "resources.json"
RADICAL_CHARS = 12          # TBCL characters listed under each radical (most common first)
DUR_CACHE = moe.CACHE / "tts" / "durations.json"
CHAR_LICENSE = library.gloss_license(   # the radical meanings are CC-CEDICT text: the file is CC BY-SA 4.0 (§7.5)
    levels="Characters and levels: 臺灣華語文能力基準 (TBCL) 漢字表, 國家教育研究院 NAER (character and level only)",
    radicals="The 214 Kangxi radicals in Unicode order, as the MOE 國語辭典簡編本 部首字 column files characters "
             "(青 for 靑); stroke counts and readings from the MOE dictionaries",
    meanings="radicals[].meaning: English from CC-CEDICT (MDBG), CC BY-SA 4.0, modified (the radical character's "
             "gloss, cut to 48 characters); see data/cedict-license.txt",
)


def new_notes():
    return {k: [] for k in ("units", "plan", "reading", "advanced", "chengyu", "resources", "characters")}


def tbcl_level(lv):
    """A TBCL level string ('第2*級') or None: a vocabulary item outside TBCL has no level."""
    lv = (lv or "").strip() if isinstance(lv, str) else lv
    return lv if lv in moe.TBCL_LEVELS else None


def with_spoken(x, zh_key="zh", z_key="zhuyin", sp_key="spoken"):
    """x with its Zhuyin normalised and the spoken (sandhi) form added, no audio."""
    zh, z = x.get(zh_key), moe.norm(x.get(z_key) or "")
    if not zh or not z:
        return dict(x)
    return {**x, z_key: z, sp_key: moe.spoken(zh, z)}


def line(x, bank):
    """A sentence to play: the content fields + normalised Zhuyin, spoken form and a TTS key (finish() swaps it)."""
    if not x.get("zh") or not x.get("zhuyin"):
        return dict(x)
    return {**x, **library.sentence(x["zh"], x["zhuyin"], bank), "dur": None}


# ---------------------------------------------------------------- units (M5)

def unit_vocab(v, spans):
    z = moe.norm(v.get("zhuyin") or "")
    e = {**v, "zhuyin": z, "level": tbcl_level(v.get("level"))}
    if v.get("zh") and z:
        e.update({"spoken": moe.spoken(v["zh"], z), "p": pinyin.word(z) or "", **library.word_audio(v["zh"], z, spans)})
    return e


def build_units(bank, spans, notes, grammar_ids=(), contrast_ids=()):
    """Every content/units/*.json, sorted by TBCL level then order. Dialogue lines ask for TTS first (all units),
    then the shadowing lines, so a --max-tts cap cuts the shadowing tail."""
    raw = []
    for p in sorted(UNITS.glob("*.json")):
        u = moe.read_json(p, default=None)
        if not isinstance(u, dict) or not u.get("id"):
            notes["units"].append(f"{p.name}: not a unit (no id), left out")
            continue
        raw.append(u)
    major = lambda u: int((library.short_level(u.get("level")) or "9")[0])   # noqa: E731 - 第1級 and 第1*級 units share a list
    raw.sort(key=lambda u: (major(u), int(u.get("order") or 0), u["id"]))
    units = [{**u, "dialogue": [line(x, bank) for x in u.get("dialogue") or []]} for u in raw]
    gids, cids = set(grammar_ids), set(contrast_ids)
    for u in units:
        u["shadowing"] = [line(x, bank) for x in u.get("shadowing") or []]
        u["vocab"] = [unit_vocab(v, spans) for v in u.get("vocab") or []]
        w = u.get("writing")
        if isinstance(w, dict) and w.get("model_zh") and w.get("model_zhuyin"):
            u["writing"] = with_spoken(w, "model_zh", "model_zhuyin", "model_spoken")
        for g in u.get("grammar") or []:
            if gids and g.get("id") not in gids:
                notes["units"].append(f"{u['id']}: grammar {g.get('id')} is no Library grammar point")
        c = (u.get("pronunciation") or {}).get("contrast")
        if c and cids and c not in cids:
            notes["units"].append(f"{u['id']}: pronunciation contrast {c} is not in contrasts.json")
        if tbcl_level(u.get("level")) is None:
            notes["units"].append(f"{u['id']}: level {u.get('level')!r} is no TBCL level")
    return units


def word_key(zh, z, counts, readings):
    """The Library's key of a word: its characters, or characters|Zhuyin when the Library has two readings."""
    if counts.get(zh, 0) > 1 and moe.squash(z) in readings.get(zh, ()):
        return f"word:{zh}|{moe.squash(z)}"
    return f"word:{zh}"


def units_index(units, lib_words):
    counts, readings = {}, {}
    for w in lib_words:
        counts[w["w"]] = counts.get(w["w"], 0) + 1
        readings.setdefault(w["w"], set()).add(moe.squash(w["z"]))
    index = {}

    def add(key, ref):
        refs = index.setdefault(key, [])
        if ref not in refs:
            refs.append(ref)
    for u in units:
        ref = {"id": u["id"], "title": u.get("title_zh") or u["id"]}
        for v in u.get("vocab") or []:
            if v.get("zh"):
                add(word_key(v["zh"], v.get("zhuyin") or "", counts, readings), ref)
        for g in u.get("grammar") or []:
            if g.get("id"):
                add(f"grammar:{g['id']}", ref)
    listing = [{k: u.get(k) for k in ("id", "level", "order", "topic", "title_zh", "title_en", "can_do_en")} for u in units]
    return {"units": listing, "index": index}


def build_plan(units, notes):
    """content/plan.json as written; released units that do not exist are noted (the pages skip them)."""
    plan = moe.read_json(PLAN, default=None) if PLAN.exists() else None
    ids = [u["id"] for u in units]
    if not isinstance(plan, dict):
        notes["plan"].append("content/plan.json is missing: every unit is released")
        return {"released_units": ids}
    rel = plan.get("released_units")
    if isinstance(rel, list):
        for r in rel:
            if r not in ids:
                notes["plan"].append(f"released unit {r} has no content/units file")
    return plan


# ---------------------------------------------------------------- reading (M6)

def build_reading(bank, notes):
    texts = []
    for p in sorted(READING.glob("*.json")):
        d = moe.read_json(p, default=None)
        for t in (d or {}).get("texts", []) if isinstance(d, dict) else (d or []):
            if not isinstance(t, dict):
                continue
            e = {**t, "band": t.get("band") or (d.get("band") if isinstance(d, dict) else None)}
            if isinstance(t.get("title"), dict):
                e["title"] = with_spoken(t["title"])
            e["paragraphs"] = [[line(s, bank) for s in para] for para in t.get("paragraphs") or []]
            if not any(e["paragraphs"]):
                notes["reading"].append(f"{p.name} {t.get('id')}: no paragraphs")
            texts.append(e)
    return {"texts": texts}


def reading_lines(reading):
    return [s for t in reading["texts"] for para in t["paragraphs"] for s in para]


# ---------------------------------------------------------------- advanced (M6)

def build_advanced(bank, notes):
    P = moe.read_json(ADV / "prompts.json", default={}) or {}
    R = moe.read_json(ADV / "register.json", default={}) or {}
    journal = []
    for g in P.get("journal") or []:
        for x in g.get("prompts") or []:
            journal.append({"level": g.get("level"), **with_spoken(x)})
    monologue = [{"id": f"mono-{int(m['month']):02d}" if m.get("month") else f"mono-{i + 1}", **with_spoken(m)}
                 for i, m in enumerate(P.get("monologue") or [])]
    roleplay = [{**r, "lines": [line(x, bank) for x in r.get("lines") or []]} for r in P.get("roleplay") or []]
    reg = {k: v for k, v in R.items() if not k.startswith("_")}
    pairs = []
    for x in R.get("pairs") or []:
        e = {**x}
        for k in ("written_zhuyin", "spoken_zhuyin", "example_zhuyin"):
            if e.get(k):
                e[k] = moe.norm(e[k])
        if x.get("example_zh") and x.get("example_zhuyin"):
            e["examples"] = [with_spoken({"zh": x["example_zh"], "zhuyin": x["example_zhuyin"], "en": x.get("example_en", "")})]
        pairs.append(e)     # "spoken" here is the colloquial form (content), not a sandhi form
    reg["pairs"] = pairs
    reg["news"] = [with_spoken(x) for x in R.get("news") or []]
    reg["news_topics"] = [with_spoken(x) for x in R.get("news_topics") or []]
    models = dict(R.get("models") or {})
    for k, m in models.items():
        if isinstance(m, dict) and isinstance(m.get("lines"), list):
            models[k] = {**m, "lines": [with_spoken(x) for x in m["lines"]]}
        elif isinstance(m, dict) and m.get("zh"):
            models[k] = with_spoken(m)
    reg["models"] = models
    if not journal:
        notes["advanced"].append("prompts.json: no journal prompts")
    if not roleplay:
        notes["advanced"].append("prompts.json: no role-plays")
    return {"journal": journal, "monologue": monologue, "roleplay": roleplay, "register": reg}


def advanced_lines(adv):
    return [x for r in adv["roleplay"] for x in r["lines"]]


# ---------------------------------------------------------------- 成語 (MOE 成語典, CC BY-ND)

def build_chengyu(notes):
    """The selection of content/library/chengyu.csv with the MOE fields as MOE wrote them (tools/chengyu.py
    parse(): meaning 釋義, story 典故說明, usage 用法說明-語義說明, usage_type 用法說明-使用類別, examples 例句;
    moe_zhuyin = MOE's 音讀 (注音) string, unchanged, for the page to show). Publishes
    the 使用說明 to docs/data/moe-license-idioms.txt. None (noted) when the MOE data cannot be had."""
    import chengyu
    data = None
    try:
        if not chengyu.OUT.exists():
            for name, url in chengyu.FILES.items():
                chengyu.download(chengyu.MOE / name, url)
            chengyu.OUT.write_text(json.dumps(chengyu.parse(), ensure_ascii=False, indent=0), encoding="utf-8")
        data = json.loads(chengyu.OUT.read_text(encoding="utf-8"))
        if not chengyu.LICENSE_TXT.exists():
            chengyu.LICENSE_TXT.write_text(chengyu.license_text(), encoding="utf-8", newline="\n")
    except Exception as e:   # network / file trouble: the page shows its "not built" notice
        notes["chengyu"].append(f"MOE 成語典 data not available ({e}); chengyu.json not written")
        return None
    dst = moe.DOCS / chengyu.LICENSE_PATH
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(chengyu.LICENSE_TXT, dst)
    items = []
    for r in chengyu.read_selection():
        m = data.get(r["idiom"])
        if not m:
            notes["chengyu"].append(f"{r['idiom']}: not in the MOE 成語典 data, left out")
            continue
        items.append({"zh": r["idiom"], "zhuyin": moe.norm(r["zhuyin"]), "level": r.get("level", ""), "id": m["id"],
                      "moe_zhuyin": m["zhuyin"], "meaning": m["meaning"], "story": m["story"], "usage": m["usage"],
                      "usage_type": m.get("usage_type", ""), "examples": m["examples"]})
    notes["chengyu"] += chengyu.check_selection(data)
    return {"attribution": chengyu.attribution(), "license": chengyu.license_info(), "version": chengyu.version(),
            "note": "MOE 成語典 fields shown as MOE wrote them (CC BY-ND 3.0 TW: no changes). moe_zhuyin = MOE's 音讀 "
                    "(注音) exactly as MOE wrote it, with any （變） sandhi or （又音） reading: the reading to show; "
                    "zhuyin = its first reading in base tones, only for the per-character ruby. usage = 用法說明-語義說明, "
                    "usage_type = 用法說明-使用類別",
            "items": items}


# ---------------------------------------------------------------- resources, characters

def build_resources(notes):
    res = moe.read_json(RESOURCES, default=None) if RESOURCES.exists() else None
    if res is None:
        notes["resources"].append("content/resources.json is missing")
        return None
    items = res.get("resources", []) if isinstance(res, dict) else res
    bad = [r.get("id") or r.get("url") for r in items if isinstance(r, dict) and not r.get("verified")]
    if bad:
        notes["resources"].append(f"{len(bad)} links not verified (shown marked): {', '.join(map(str, bad[:12]))}")
    return res


def concised_radicals():
    """{character: (部首字, 總筆畫數, 部首外筆畫數)} for the single-character headwords of the 簡編本."""
    import openpyxl
    wb = openpyxl.load_workbook(moe.CACHE / "moe-data" / "dict_concised_2014_20260929.xlsx", read_only=True)
    it = wb.worksheets[0].iter_rows(values_only=True)
    next(it)
    out = {}
    for r in it:
        w, b = str(r[0] or "").strip(), str(r[2] or "").strip()
        if len(w) == 1 and b and w not in out:
            out[w] = (b, r[3], r[4])
    return out


KANGXI_AS_MOE = {"靑": "青"}   # the Unicode Kangxi form -> the form MOE files characters under


def kangxi():
    """The 214 Kangxi radicals in order (Unicode Kangxi Radicals block, NFKC), as MOE writes them."""
    out = []
    for i in range(214):
        r = unicodedata.normalize("NFKC", chr(0x2F00 + i))
        out.append(KANGXI_AS_MOE.get(r, r))
    return out


def radical_meaning(ch, z):
    en = library.gloss(ch, z)[0] if z else ""
    if not en:
        for _, _, senses in library.cedict_entries(ch)[:1]:
            en = next((library.clean_sense(s) for s in senses if s.strip() and not s.startswith("CL:")), "")
    return library.trim(en, 48) if en else ""


def build_characters(notes):
    chars = moe.tbcl_chars()
    levels = {}
    for c, t in chars.items():
        lv = library.short_level(t["level"])
        for form in c.split("／"):
            form = form.strip()
            if len(form) == 1 and lv:
                levels[lv] = levels.get(lv, "") + (form if form not in levels.get(lv, "") else "")
    try:
        rad_of = concised_radicals()
    except Exception as e:
        notes["characters"].append(f"簡編本 data not available ({e}): no radicals")
        rad_of = {}
    order = sorted(((form.strip(), t) for c, t in chars.items() for form in c.split("／") if len(form.strip()) == 1),
                   key=lambda x: (moe.level_rank(x[1]["level"]), -(x[1]["wfreq"] + x[1]["sfreq"])))
    filed, seen = {}, set()
    for c, _ in order:
        if c in seen:
            continue
        seen.add(c)
        b = (rad_of.get(c) or ("",))[0]
        if b:
            filed.setdefault(b, []).append(c)
    radicals = []
    for n, r in (enumerate(kangxi(), 1) if rad_of else []):
        strokes = None
        own = rad_of.get(r)
        if own and own[1] is not None:
            strokes = int(own[1])
        else:
            diffs = {}
            for b, tot, out in rad_of.values():
                if b == r and tot is not None and out is not None:
                    diffs[int(tot) - int(out)] = diffs.get(int(tot) - int(out), 0) + 1
            strokes = max(diffs, key=diffs.get) if diffs else None
        z = library.moe_first(r)
        radicals.append({"n": n, "radical": r, "strokes": strokes, "zhuyin": z or "", "meaning": radical_meaning(r, z),
                         "chars": "".join(filed.get(r, [])[:RADICAL_CHARS]), "count": len(filed.get(r, []))})
    unfiled = sorted(set(filed) - set(kangxi()))
    if unfiled:
        notes["characters"].append(f"部首字 outside the Kangxi list: {' '.join(unfiled)}")
    return {"license": CHAR_LICENSE, "levels": levels, "radicals": radicals}


# ---------------------------------------------------------------- after the audio is rendered

def _durations():
    try:
        return json.loads(DUR_CACHE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def finish(data, index, measure):
    """TTS keys -> docs paths and measured `dur` (None when TTS failed or was capped: the pages fall back to a
    labelled browser voice). `measure(path)` gives a clip's length; lengths are cached by file name."""
    cache, changed = _durations(), False
    lines = [x for u in data["units"] for k in ("dialogue", "shadowing") for x in u[k]]
    lines += reading_lines(data["reading"]) + advanced_lines(data["advanced"])
    for x in lines:
        if not x.get("audio"):
            continue
        path = (index.get(x["audio"]) or {}).get("path")
        x["audio"] = path
        if path:
            name = Path(path).name
            if name not in cache:
                cache[name] = measure(moe.DOCS / path)
                changed = True
            x["dur"] = cache[name]
    if changed:
        DUR_CACHE.parent.mkdir(parents=True, exist_ok=True)
        DUR_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")


def span_wants(units):
    out = {}
    for u in units:
        for v in u["vocab"]:
            if v.get("id") and v["id"] not in out:
                out[v["id"]] = len(moe.syllables(v["zhuyin"]))
    return out


def drop_clips(units, gone):
    """Unit vocabulary whose streamed MOE clip cannot be had (gone: {id: why}, e.g. 404 on the moedict CDN or a
    failed download): `id` and `s` become None, so the page plays the labelled browser voice instead of a MOE
    button that fails. Returns ["<unit> <word> <id> (<why>)"] for the report."""
    out = []
    for u in units:
        for v in u["vocab"]:
            aid = v.get("id")
            if aid and aid in gone:
                out.append(f"{u['id']} {v.get('zh', '')} {aid} ({gone[aid]})")
                v["id"], v["s"] = None, None
    return out


def apply_spans(units, spans):
    n = 0
    for u in units:
        for v in u["vocab"]:
            if v.get("id"):
                v["s"] = library.span_of(spans, v["id"])
                n += v["s"] is not None
    return n


def counts(data):
    units, reading, adv = data["units"], data["reading"], data["advanced"]
    ul = [x for u in units for k in ("dialogue", "shadowing") for x in u[k]]
    vocab = [v for u in units for v in u["vocab"]]
    rl, al = reading_lines(reading), advanced_lines(adv)
    cy, ch = data.get("chengyu") or {}, data.get("characters") or {}
    return {"units": len(units), "unit_lines": len(ul), "unit_lines_tts": sum(1 for x in ul if x.get("audio")),
            "unit_vocab": len(vocab), "unit_vocab_moe": sum(1 for v in vocab if v.get("id")),
            "unit_vocab_spans": sum(1 for v in vocab if v.get("s")),
            "reading_texts": len(reading["texts"]), "reading_sentences": len(rl),
            "reading_tts": sum(1 for x in rl if x.get("audio")), "journal_prompts": len(adv["journal"]),
            "monologue_topics": len(adv["monologue"]), "roleplays": len(adv["roleplay"]), "roleplay_lines": len(al),
            "roleplay_tts": sum(1 for x in al if x.get("audio")), "register_pairs": len(adv["register"].get("pairs", [])),
            "news_words": len(adv["register"].get("news", [])), "chengyu": len(cy.get("items", [])),
            "resources": len((data.get("resources") or {}).get("resources", []) if isinstance(data.get("resources"), dict) else data.get("resources") or []),
            "characters": sum(len(v) for v in ch.get("levels", {}).values()), "radicals": len(ch.get("radicals", []))}


def report_lines(data, notes, notes_max=30):
    c = counts(data)
    out = [f"units: {c['units']} ({', '.join(u['id'] for u in data['units'])}); dialogue + shadowing lines "
           f"{c['unit_lines']}, with TTS audio {c['unit_lines_tts']}; vocabulary {c['unit_vocab']}, with an exact-reading "
           f"MOE clip {c['unit_vocab_moe']}, with a measured span {c['unit_vocab_spans']}",
           f"plan.json released units: {len((data['plan'] or {}).get('released_units') or [])}",
           f"reading: {c['reading_texts']} texts, {c['reading_sentences']} sentences, with TTS audio {c['reading_tts']}",
           f"advanced: {c['journal_prompts']} journal prompts, {c['monologue_topics']} monologue topics, {c['roleplays']} "
           f"role-plays ({c['roleplay_lines']} lines, with TTS audio {c['roleplay_tts']}), {c['register_pairs']} register "
           f"pairs, {c['news_words']} news words",
           f"chengyu: {c['chengyu']} idioms (MOE 成語典, unmodified); resources: {c['resources']} links; characters: "
           f"{c['characters']} TBCL characters, {c['radicals']} radicals"]
    for k, v in notes.items():
        if v:
            out.append(f"{k} notes ({len(v)}): " + "; ".join(v[:notes_max]) + (" …" if len(v) > notes_max else ""))
    return out
