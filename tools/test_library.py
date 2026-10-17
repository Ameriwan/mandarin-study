"""Tests for tools/pinyin.py, tools/library.py and the cache-only span path of tools/audio.py (M4).

    .venv\\Scripts\\python.exe tools\\test_library.py

Plain asserts; exits non-zero if any case fails. Needs the .cache/ data (TBCL, MOE, CC-CEDICT), no network.
"""
import re
import sys
import unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import audio  # noqa: E402
import library  # noqa: E402
import moe  # noqa: E402
import pinyin  # noqa: E402
import verify  # noqa: E402

errors = []


def eq(got, want, what):
    if got != want:
        errors.append(f"{what}: want {want!r}, got {got!r}")


# ---- pinyin.py: the spelling rules
for z, p in [("ㄅㄚ", "bā"), ("ㄇㄚˊ", "má"), ("ㄇㄚˇ", "mǎ"), ("ㄇㄚˋ", "mà"), ("˙ㄇㄚ", "ma"), ("ㄓ", "zhī"), ("ㄙˋ", "sì"),
             ("ㄖˋ", "rì"), ("ㄧ", "yī"), ("ㄧㄡˇ", "yǒu"), ("ㄌㄧㄡˊ", "liú"), ("ㄨㄟˋ", "wèi"), ("ㄉㄨㄟˋ", "duì"),
             ("ㄨㄣˋ", "wèn"), ("ㄌㄨㄣˋ", "lùn"), ("ㄨㄥ", "wēng"), ("ㄉㄨㄥ", "dōng"), ("ㄩˊ", "yú"), ("ㄌㄩˋ", "lǜ"),
             ("ㄋㄩˇ", "nǚ"), ("ㄐㄩ", "jū"), ("ㄑㄩㄝˋ", "què"), ("ㄒㄩㄢˇ", "xuǎn"), ("ㄩㄣˋ", "yùn"), ("ㄐㄩㄣ", "jūn"),
             ("ㄌㄩㄝˋ", "lüè"), ("ㄩㄥˇ", "yǒng"), ("ㄒㄩㄥˊ", "xióng"), ("ㄦˊ", "ér"), ("ㄝˋ", "ề"), ("ㄏㄨㄚ", "huā"),
             ("ㄍㄨㄛˊ", "guó"), ("ㄒㄧㄝˋ", "xiè"), ("ㄐㄧㄡˇ", "jiǔ"), ("ㄍㄨㄟˋ", "guì"), ("ㄈㄥ", "fēng"), ("ㄅㄛˊ", "bó")]:
    eq(pinyin.syllable(z), unicodedata.normalize("NFC", p), f"syllable {z}")
eq(pinyin.word("ㄒㄧ ㄢ"), "xī'ān", "apostrophe before a/o/e")
eq(pinyin.word("ㄑㄧㄣ ㄞˋ"), "qīn'ài", "apostrophe 親愛")
eq(pinyin.word("ㄧ ㄉㄧㄢˇ ㄦ"), "yīdiǎnr", "兒化 r")
eq(pinyin.word("ㄋㄚˇ ㄦ"), "nǎr", "哪兒")
eq(pinyin.word("ㄓㄨㄛ ˙ㄗ", sep=" "), "zhuō zi", "spaced, neutral")
eq(pinyin.numbered("ㄌㄩˋ ˙ㄗ"), "lv4 zi5", "numbered")
eq(pinyin.numbered("ㄧ ㄉㄧㄢˇ ㄦ"), "yi1 dian3 r5", "numbered 兒化")
eq(pinyin.strip_tones("lǜsè"), "luse", "strip tones")
eq(pinyin.syllable("ㄅ"), None, "a bare initial is no syllable")

# ---- pinyin.py: the table covers every base syllable MOE and TBCL use (~410), and agrees with TBCL's paired columns
T = pinyin.table()
bad = sorted(b for b, p in T.items() if p is None and moe.is_zhuyin(b) and len(b) <= 4)
eq(bad, ["ㄑ"], "base syllables without pinyin (only TBCL's stray ㄑ)")
known = [b for b, p in T.items() if p]
if not 400 <= len(known) <= 430:
    errors.append(f"pinyin table: {len(known)} base syllables (want about 410)")
import openpyxl  # noqa: E402
ws = openpyxl.load_workbook(moe.CACHE / "tbcl" / "14452詞語表202504.xlsx", read_only=True).worksheets[0]
it = ws.iter_rows(values_only=True)
H = {h: i for i, h in enumerate(next(it))}
key = lambda p: re.sub(r"[\s'’\-]", "", unicodedata.normalize("NFC", (p or "").lower()))   # noqa: E731
n = same = 0
for r in it:
    parts = moe.tbcl_parts(r[H["bopomofo"]])
    pys = [x.strip() for x in str(r[H["pinyin"]] or "").split("/") if x.strip()]
    if parts and len(parts) == len(pys):
        for z, p in zip(parts, pys):
            n += 1
            same += key(pinyin.word(z) or "") == key(p)
if n < 14000 or same / n < 0.998:
    errors.append(f"pinyin vs TBCL: {same}/{n} readings agree (want >= 99.8 %; the rest are TBCL typos)")

# ---- library.py: readings (§9.3, §6.4)
notes = library.new_notes()
eq(library.verified_readings("一定", ["ㄧˊ ㄉㄧㄥˋ"], notes), ["ㄧ ㄉㄧㄥˋ"], "TBCL sandhi -> MOE base tone")
eq(library.verified_readings("不錯", ["ㄅㄨˊ ㄘㄨㄛˋ"], notes), ["ㄅㄨˋ ㄘㄨㄛˋ"], "不 sandhi -> base")
eq(library.verified_readings("為什麼", ["ㄨㄟˋ ㄕㄣˊ ˙ㄇㄛ"], notes), ["ㄨㄟˋ ㄕㄣˊ ˙ㄇㄜ"], "both MOE dictionaries agree")
eq(library.verified_readings("台", ["ㄊㄞˊ"], notes), ["ㄊㄞˊ"], "台 ㄊㄞˊ kept (MOE disagrees with itself, no audio)")
eq(library.verified_readings("得", moe.tbcl_words()["得"]["readings"], notes)[:1], [moe.tbcl_words()["得"]["readings"][0]],
   "multi-reading word keeps TBCL order")
eq(set(library.verified_readings("得", moe.tbcl_words()["得"]["readings"], notes)), {"ㄉㄜˊ", "˙ㄉㄜ", "ㄉㄟˇ"}, "得 readings")
eq(library.verified_readings("阿嬤", ["ㄚ ˙ㄇㄚ"], notes), ["ㄚ ㄇㄚ"], "TBCL-only word, unlisted neutral -> full tone")
eq(library.verified_readings("有一點", ["ㄧㄡˇ ㄧˋ ㄉㄧㄢˇ"], notes), ["ㄧㄡˇ ㄧ ㄉㄧㄢˇ"], "TBCL-only word, 一 base tone")
eq(library.verified_readings("差一點", ["ㄔㄚ ㄧˋ ㄉㄧㄢ"], notes), [], "TBCL typo (點 ㄉㄧㄢ) is dropped")
eq(library.verified_readings("水果", ["ㄕㄨㄟˋ ㄍㄨㄛˊ"], notes), ["ㄕㄨㄟˇ ㄍㄨㄛˇ"], "failing TBCL reading -> MOE's")
if not library.only_sandhi_or_neutral("一起", "ㄧˋ ㄑㄧˇ", "ㄧ ㄑㄧˇ") or library.only_sandhi_or_neutral("喂", "ㄨㄟˊ", "ㄨㄟˋ"):
    errors.append("only_sandhi_or_neutral: 一起 is sandhi, 喂 ㄨㄟˊ/ㄨㄟˋ is not")
eq(library.short_level("第1*級"), "1*", "short level")
eq(library.short_level("第4級"), "4", "short level")

# ---- library.py: glosses (CC-CEDICT, the entry that matches our reading)
en, cl = library.gloss("垃圾", "ㄌㄜˋ ㄙㄜˋ")
if "trash" not in en and "garbage" not in en:
    errors.append(f"gloss 垃圾 ㄌㄜˋ ㄙㄜˋ via 'Taiwan pr.': {en!r}")
en, cl = library.gloss("機車", "ㄐㄧ ㄔㄜ")
if not en.startswith("(Tw) scooter"):
    errors.append(f"gloss 機車: Taiwan sense first, got {en!r}")
en, cl = library.gloss("得", "ㄉㄟˇ")
if "must" not in en and "have to" not in en:
    errors.append(f"gloss 得 ㄉㄟˇ: {en!r}")
en, cl = library.gloss("歌", "ㄍㄜ")
eq(cl, ["首", "支"], "measure words from CL: (traditional)")
if "CL:" in en or "[" in en:
    errors.append(f"gloss keeps CL: / pinyin brackets: {en!r}")
if not library.gloss("一點兒", "ㄧ ㄉㄧㄢˇ ㄦ")[0]:
    errors.append("gloss 一點兒: an erhua variant follows its target")
if not library.gloss("月台", "ㄩㄝˋ ㄊㄞˊ")[0]:
    errors.append("gloss 月台: tries the variant spelling 月臺")
if not library.gloss("成熟", "ㄔㄥˊ ㄕㄡˊ")[0]:
    errors.append("gloss 成熟 ㄔㄥˊ ㄕㄡˊ: the Taiwan reading CEDICT lacks still finds cheng2 shu2")

# ---- library.py: the built collections (no network: an AudioBank that is never rendered)
bank = audio.AudioBank()
lib = library.build(bank, log=lambda *a: None)
words = lib["words"]
if not 2700 <= len(words) <= 3200:
    errors.append(f"library words: {len(words)} (TBCL 第1級-第4*級 has 2,850 forms)")
for w in words:
    st, why = verify.check(w["w"], w["z"])
    if st == "fail" or w["p"] in ("", None) or set(w) - {"w", "z", "p", "lv", "t", "en", "cl", "id", "s", "sp"}:
        errors.append(f"library word {w}: {st} {why}")
        break
    if w["lv"] not in ("1", "1*", "2", "2*", "3", "3*", "4", "4*"):
        errors.append(f"library word level {w}")
        break
for w in words:
    if "wfreq" in w or "sfreq" in w:
        errors.append("frequency columns must not be published (§8.7)")
        break
assert sum(1 for w in words if w["en"]) / len(words) > 0.98, "glosses"
pl = lib["placement"]
eq(len(pl["vocab_l5"]), library.VOCAB_L5_N, "placement.vocab_l5 size")
if any(verify.check(w["w"], w["z"])[0] != "ok" or not w["en"] for w in pl["vocab_l5"]):
    errors.append("vocab_l5 words must be ok by the verifier and have a gloss")
for q in pl["questions"]:
    a = q.get("audio")
    if q.get("id") and a is not None:
        errors.append(f"MOE question {q['zh']} keeps a TTS key")
    if q.get("skill") == "listening" and not q.get("id") and not (a or "").startswith("tts_"):
        errors.append(f"listening question {q['zh']} has no audio")
if not all(d.get("id") for d in pl["diagnostic"]):
    errors.append("every diagnostic word needs its exact-reading MOE clip")
if not {d["id"] for d in pl["diagnostic"]} <= bank.moe_ids:
    errors.append("diagnostic clips must be self-hosted (wanted by the bank)")
g = lib["grammar"]
if len(g) < 200 or any(len(x["examples"]) < 3 for x in g):
    errors.append(f"grammar: {len(g)} points; each needs >= 3 examples")
if any(not x.get("spoken") or not x.get("audio") for p in g for x in p["examples"]):
    errors.append("grammar examples need spoken + a TTS key")
# TTS is asked for in priority order: placement first, grammar mistakes' corrected sentences last
order = list(bank.tts)
first_q = next(q["zh"] for q in pl["questions"] if (q.get("audio") or "").startswith("tts_"))
if order.index(moe.norm(first_q)) > 100:
    errors.append("placement TTS must be asked for first")
# finish(): keys -> paths (or None)
index = {k: {"src": "tts", "path": f"audio/tts/{k}"} for k in list(order)[:10]}
library.finish(lib, index)
if any(x.get("audio") and not x["audio"].startswith("audio/tts/") for p in g for x in p["examples"]):
    errors.append("finish() leaves a TTS key in grammar.json")

# ---- search.json rows
rows = library.search_rows(lib, [{"zh": "垃圾", "zhuyin": "ㄌㄜˋ ㄙㄜˋ", "note": "Taiwan reading"}])
types = {r[0] for r in rows}
eq(types, {"word", "grammar", "pattern", "measure", "taiwan", "reading", "phrase"}, "search types")
if any(len(r) != 7 for r in rows):
    errors.append("search rows: [type, key, zh, zhuyin, zhuyin_no_tones, pinyin_no_tones, english_lower]")
r = next(r for r in rows if r[0] == "word" and r[2] == "飛機")
eq(r[1:6], ["飛機", "飛機", "ㄈㄟ ㄐㄧ", "ㄈㄟㄐㄧ", "feiji"], "search row 飛機")
if r[6] != r[6].lower():
    errors.append("search English must be lower case")
keys = [(r[0], r[1]) for r in rows if r[0] == "word"]
if len(keys) != len(set(keys)) or not any(k[1].startswith("得|") for k in keys):
    errors.append("word keys: unique, '<word>|<zhuyin>' for a word with two readings")

# ---- CC-CEDICT license (§7.5, CC BY-SA 4.0 §3(a)): every file with its glosses says so, the notice travels
sf = library.search_file(rows)
if sf["rows"] is not rows or sf["license"]["name"] != "CC BY-SA 4.0":
    errors.append("search.json: {license (CC BY-SA 4.0), rows}")
for what, lic in (("library-words", library.words_file(lib)["license"]), ("search", sf["license"]),
                  ("placement", pl.get("license") or {})):
    if lic.get("name") != "CC BY-SA 4.0" or lic.get("path") != library.CEDICT_LICENSE_PATH \
            or "modified" not in lic.get("modified", "") or "MDBG" not in lic.get("attribution", ""):
        errors.append(f"{what}.json license field: BY-SA, notice path, attribution and the modification note")
notice = library.cedict_license_text() or ""
if not notice.startswith("The English glosses") or "# CC-CEDICT" not in notice or "#! license=" not in notice \
        or "3(a)(1)(B)" not in notice or not all(p in notice for p in library.CEDICT_FILES):
    errors.append("cedict-license.txt: CC-CEDICT's header notice unchanged, the change note and the files")

# ---- MOE clips that cannot be had are published nowhere (id None: the page uses the labelled browser voice)
fake = {"words": [{"w": "門", "id": "0660", "s": None}, {"w": "馬", "id": "0534", "s": [0.1, 0.5]}],
        "placement": {"vocab_l5": [{"w": "電池", "id": "120900099", "s": None}]}, "measure": [{"zh": "個"}],
        "taiwan": [{"taiwan": "原子筆", "id": "655100044", "s": None}]}
eq(library.drop_clips(fake, {"0660": "404", "120900099": "failed", "655100044": "404"}),
   ["門 0660 (404)", "電池 120900099 (failed)", "原子筆 655100044 (404)"], "drop_clips report")
eq([x.get("id") for x in fake["words"] + fake["placement"]["vocab_l5"] + fake["taiwan"]], [None, "0534", None, None],
   "drop_clips: only the gone ids become None")
nf = audio.not_found()
nf["test-404"] = __import__("time").strftime("%Y-%m-%d")
if not audio.known_missing("test-404") or audio.fetch_moe("test-404") is not None \
        or audio.missing_clips().get("test-404") != "404 on the moedict CDN":
    errors.append("a clip the CDN answered 404 for is known missing and not fetched again")
nf["test-404"] = "2000-01-01"
if audio.known_missing("test-404"):
    errors.append("a 404 older than NOT_FOUND_RECHECK_DAYS is asked for again")
del nf["test-404"]

# ---- audio.py: the cache-only span path never touches docs/
spans = {}
cached_id = next((p.stem for p in sorted(audio.MOE_CACHE.glob("*.ogg"))), None)
if cached_id:
    out_ogg = audio.OUT / "moe" / f"{cached_id}.ogg"
    existed = out_ogg.exists()
    e = audio.publish_moe(cached_id, spans, nsyl=1, publish=False)
    if not e or e.get("src") != "stream" or "start" not in e or cached_id not in spans:
        errors.append(f"publish_moe(publish=False) on a cached clip: {e}")
    if out_ogg.exists() != existed:
        errors.append("publish=False must not copy the clip into docs/")
eq(audio.span_only("does-not-exist", {}, download=False), None, "span_only without the clip and without download")
eq(library.span_of({"12": {"start": 0.1, "end": 0.9}}, "12"), [0.1, 0.9], "span_of")
# my-mistakes.json: the CORRECT log as rows (empty rows dropped), [] while nothing is logged
eq(library.build_mistakes([{"date": "2026-10-17", "wrong": "我很喜歡吃", "right": "我很喜歡吃東西", "why_en": "object", "x": "1"},
                           {"date": "2026-10-17"}]),
   [{"date": "2026-10-17", "wrong": "我很喜歡吃", "right": "我很喜歡吃東西", "right_zhuyin": "", "why_en": "object", "pattern_id": ""}],
   "build_mistakes")
eq(library.build_mistakes([]), [], "build_mistakes, nothing logged")

# ---- lessons.py (M5 / M6): levels, the Library keys of units-index.json, the Kangxi radicals
import lessons  # noqa: E402
eq([lessons.tbcl_level(x) for x in ("第2*級", "", None, "B1")], ["第2*級", None, None, None], "tbcl_level")
counts, reads = {"行": 2, "銀行": 1}, {"行": {"ㄒㄧㄥˊ", "ㄏㄤˊ"}, "銀行": {"ㄧㄣˊㄏㄤˊ"}}
eq([lessons.word_key("行", "ㄏㄤˊ", counts, reads), lessons.word_key("銀行", "ㄧㄣˊ ㄏㄤˊ", counts, reads),
    lessons.word_key("蛋餅", "ㄉㄢˋ ㄅㄧㄥˇ", counts, reads)], ["word:行|ㄏㄤˊ", "word:銀行", "word:蛋餅"], "word_key")
idx = lessons.units_index([{"id": "L1-01", "title_zh": "甲", "level": "第1級", "vocab": [{"zh": "行", "zhuyin": "ㄒㄧㄥˊ"}],
                            "grammar": [{"id": "G001"}]},
                           {"id": "L1-02", "title_zh": "乙", "level": "第1級", "vocab": [{"zh": "行", "zhuyin": "ㄒㄧㄥˊ"}], "grammar": []}],
                          [{"w": "行", "z": "ㄒㄧㄥˊ"}, {"w": "行", "z": "ㄏㄤˊ"}])
eq(idx["index"], {"word:行|ㄒㄧㄥˊ": [{"id": "L1-01", "title": "甲"}, {"id": "L1-02", "title": "乙"}],
                  "grammar:G001": [{"id": "L1-01", "title": "甲"}]}, "units_index")
eq([u["id"] for u in idx["units"]], ["L1-01", "L1-02"], "units_index unit list")
K = lessons.kangxi()
eq((len(K), K[0], K[84], K[173], len(set(K))), (214, "一", "水", "青", 214), "kangxi(): 214 radicals, 青 as MOE writes it")
if lessons.CHAR_LICENSE.get("name") != "CC BY-SA 4.0" or "meanings" not in lessons.CHAR_LICENSE:
    errors.append("characters.json license: CC BY-SA 4.0 (its radical meanings are CC-CEDICT glosses)")
us = [{"id": "L1-03", "vocab": [{"zh": "老闆娘", "id": "179200009", "s": None}, {"zh": "你", "id": "0001", "s": [0, 1]}]}]
eq(lessons.drop_clips(us, {"179200009": "404"}), ["L1-03 老闆娘 179200009 (404)"], "lessons.drop_clips")
eq([v["id"] for v in us[0]["vocab"]], [None, "0001"], "lessons.drop_clips: only the gone id")

# ---- build.py: every published file and audio folder needs a license entry (§7.5)
import tempfile  # noqa: E402
import build  # noqa: E402
with tempfile.TemporaryDirectory() as tmp:
    docs = Path(tmp)
    (docs / "data").mkdir()
    (docs / "audio" / "moe").mkdir(parents=True)
    (docs / "audio" / "edge").mkdir()
    for n in ("library-words.json", "chengyu.json", "foo.json"):
        (docs / "data" / n).write_text("{}", encoding="utf-8")
    md = docs / "sources.md"
    md.write_text("# S\n\n## Published files (`docs/data/`)\n\n| `library-words.json` | x |\n| `docs/audio/moe/*` | y |\n"
                  "| `docs/audio/edge/*` | z |\n\n## Original content\n\n`chengyu.json`\n", encoding="utf-8")
    probs, n = build.check_licenses(docs, md)
    eq((n, sorted(probs)), (5, ["docs/audio/edge/ is published but has no license entry (build.py PUBLISHED)",
                               "docs/data/chengyu.json is not listed in the 'Published files' table of content/sources.md",
                               "docs/data/foo.json is published but has no license entry (build.py PUBLISHED)"]),
       "check_licenses")

for e in errors:
    print("FAIL", e)
print(f"test_library: {len(errors)} failing case(s)")
assert not errors, f"{len(errors)} library regression(s)"
