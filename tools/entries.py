"""MOE 國語辭典簡編本 entry text for the shadowing readings (MASTER_PROMPT §7.1-§7.3, §7.5; M3).

    .venv\\Scripts\\python.exe tools\\entries.py 東西 "ㄉㄨㄥ ˙ㄒㄧ"      print one entry (id, text)
    .venv\\Scripts\\python.exe tools\\entries.py --shortlist [N]         candidates for content/shadowing/moe-readings.csv

The official xlsx export (.cache/moe-data/dict_concised_2014_<date>.xlsx) is parsed once into
.cache/moe-data/entries.json {source, size, version, entries: {audio_id: {word, zhuyin, text}}}: the cache names the
export it was parsed from, and is parsed again whenever the newest export has another name or size (file times are
not trusted: an archive tool keeps the export's own date). version() and the §7.5 attribution use the 版本編號
stored with the cached text, so text and version always match, also once the xlsx is deleted. A row's 字詞號
(written ="1306000451" in the sheet) is the moedict audio id of that reading (東西 ㄉㄨㄥ ˙ㄒㄧ = 1306000451,
水果 = 516300045), so the whole-entry recording of an id reads exactly that row. `text` is the raw 釋義 column;
clean_text() is the display form, a format conversion only (CC BY-ND, §7.5): the spreadsheet artifacts go
(_x000D_, tabs, the U+3000 separators become one plain space), [例] is shown as 例：, and every word and mark
(1. 2. senses, § etymology, △ related terms, ◎) stays as MOE wrote it.
"""
import json
import re
import sys
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402

DATA_DIR = moe.CACHE / "moe-data"
CACHE_FILE = DATA_DIR / "entries.json"
XLSX_GLOB = "dict_concised_2014_*.xlsx"


def xlsx_path():
    """The newest 簡編本 export in the cache (by its release date in the file name), or None."""
    found = sorted(DATA_DIR.glob(XLSX_GLOB))
    return found[-1] if found else None


def version_of(path):
    """The 版本編號 in an export's file name: dict_concised_2014_20260929.xlsx -> 2014_20260929."""
    return Path(path).stem.replace("dict_concised_", "")


def version():
    """The 版本編號 of the export the entry text comes from (stored with it in entries.json); "?" when there is
    neither an export nor a cache (then there is no 簡編本 text either)."""
    try:
        return _data()["version"]
    except SystemExit:
        return "?"


def attribution():
    """The attribution line §7.5 requires next to any 簡編本 text or audio."""
    return (f"中華民國教育部（Ministry of Education, R.O.C.）。《國語辭典簡編本》（版本編號：{version()}）"
            f"網址：http://dict.concised.moe.edu.tw/")


# The MOE 使用說明 (terms of use) of the 簡編本, kept unmodified in content/ (text of the official
# conciseddict_10312.pdf, sha1 6d7b9b05...; only the PDF's line wrapping is undone). §7.5: it travels with every
# redistributed copy of 簡編本 text or audio, so the build copies it to docs/data/ and points to it from the data.
LICENSE_SRC = moe.CONTENT / "moe-license-concised.txt"
LICENSE_PATH = "data/moe-license-concised.txt"    # relative to docs/, as the pages fetch data/*.json
LICENSE_URL = "https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/conciseddict_10312.pdf"


def license_info():
    """The `license` field of every data file that carries 簡編本 text or audio (shadowing.json, tones.json):
    name, path of the 使用說明 (relative to docs/), version (the 版本編號 of the data), terms (the 使用說明's own
    source) and the attribution line."""
    return {"name": "CC BY-ND 3.0 TW", "path": LICENSE_PATH, "version": version(), "terms": LICENSE_URL,
            "attribution": attribution()}


def _audio_id(cell):
    """="1306000451" (how the sheet stores 字詞號 to keep its leading zeros) -> "1306000451"."""
    m = re.fullmatch(r'\s*="?(\d+)"?\s*', str(cell or ""))
    return m.group(1) if m else str(cell or "").strip()


def parse_xlsx(path):
    """{audio_id: {word, zhuyin (moe.norm of 注音一式), text (raw 釋義)}} from the export."""
    import openpyxl
    ws = openpyxl.load_workbook(path, read_only=True).worksheets[0]
    it = ws.iter_rows(values_only=True)
    H = {h: i for i, h in enumerate(next(it))}
    out = {}
    for r in it:
        aid, word = _audio_id(r[H["字詞號"]]), (r[H["字詞名"]] or "").strip()
        if aid and word:
            out[aid] = {"word": word, "zhuyin": moe.norm(r[H["注音一式"]] or ""), "text": r[H["釋義"]] or ""}
    return out


def _read_cache():
    """The cache file if it is in the current format ({source, size, version, entries}), else None (an older
    cache without its source is never trusted: its version is unknown)."""
    try:
        c = json.load(open(CACHE_FILE, encoding="utf-8"))
    except (OSError, ValueError):
        return None
    ok = isinstance(c, dict) and isinstance(c.get("entries"), dict) and c.get("source") and c.get("version")
    return c if ok else None


@lru_cache(maxsize=None)
def _data():
    """{source (export file name), size (bytes), version (its 版本編號), entries}: the cache when it was parsed from
    the newest export (same name and size) or when no export is left, else the newest export parsed again."""
    src = xlsx_path()
    cached = _read_cache()
    if cached and (src is None or (cached["source"] == src.name and cached.get("size") == src.stat().st_size)):
        return cached
    if src is None:
        raise SystemExit(f"missing {DATA_DIR / XLSX_GLOB} (and no usable {CACHE_FILE.name}): run tools/fetch.py "
                         f"and unzip the 簡編本 export")
    data = {"source": src.name, "size": src.stat().st_size, "version": version_of(src), "entries": parse_xlsx(src)}
    tmp = CACHE_FILE.with_name(f"{CACHE_FILE.stem}.{id(data)}.tmp")   # atomic: another process may be reading it
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(CACHE_FILE)
    return data


def entries():
    """{audio_id: {word, zhuyin, text (raw)}} of the export that version() names (see _data)."""
    return _data()["entries"]


@lru_cache(maxsize=None)
def _by_reading():
    """{(word, squashed zhuyin): audio_id}: the fallback lookup of entry_for."""
    out = {}
    for aid, e in entries().items():
        out.setdefault((e["word"], moe.squash(e["zhuyin"])), aid)
    return out


def clean_text(raw):
    """Display form of a 釋義 cell (format conversion only, §7.5): the spreadsheet's _x000D_ and \\r go, tabs and
    U+3000 (MOE's separator before △ / ◎ and between (1) (2)) become one plain space, [例] becomes 例：, each line is
    trimmed and blank lines are dropped (senses stay one per line, joined by \\n). No word or mark is changed."""
    t = re.sub(r"_x000[dD]_|\r", "", raw or "")
    t = t.replace("[例]", "例：")
    t = re.sub(r"[ \t　]+", " ", t)
    return "\n".join(line.strip() for line in t.split("\n") if line.strip())


def entry_for(word, zhuyin):
    """The 簡編本 entry of this exact reading: {id, word, zhuyin, text (clean_text), raw} or None.

    The id is the moedict audio id of the reading (moe.audio_id), which is that row's 字詞號. When the id map has
    no such reading, the row whose 字詞名 and 注音一式 match is used; its id then has no known recording."""
    aid = moe.audio_id(word, zhuyin)
    e = entries().get(str(aid)) if aid else None
    if e is None or e["word"] != word or moe.squash(e["zhuyin"]) != moe.squash(zhuyin):
        aid = _by_reading().get((word, moe.squash(zhuyin)))
        e = entries().get(aid) if aid else None
    if e is None:
        return None
    return {"id": str(aid), "word": e["word"], "zhuyin": e["zhuyin"], "text": clean_text(e["text"]), "raw": e["text"]}


def has_example(e):
    """True when the entry gives an example sentence ([例] in the raw text, 例： in the clean one)."""
    return "[例]" in (e.get("raw") or "") or "例：" in (e.get("text") or "")


def shortlist(max_level="第3*級", max_chars=90):
    """Candidates for content/shadowing/moe-readings.csv (M3-DESIGN §1): TBCL words up to max_level, two or more
    characters, whose TBCL reading has an exact-reading MOE recording, with a [例] example and a clean text of at
    most max_chars characters. [{zh, zhuyin, level, id, chars, text}], by level, then written frequency."""
    top = moe.level_rank(max_level)
    out = []
    for w, t in moe.tbcl_words().items():
        if len(w) < 2 or not all(moe._is_cjk(c) for c in w) or moe.level_rank(t["level"]) > top:
            continue
        for z in t["readings"]:
            if not moe.audio_id(w, z):
                continue
            e = entry_for(w, z)
            if e and has_example(e) and len(e["text"]) <= max_chars:
                out.append({"zh": w, "zhuyin": moe.norm(z), "level": t["level"], "id": e["id"], "chars": len(e["text"]),
                            "text": e["text"], "_rank": (moe.level_rank(t["level"]), -t["wfreq"])})
                break
    out.sort(key=lambda x: x["_rank"])
    for x in out:
        del x["_rank"]
    return out


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if argv and argv[0] == "--shortlist":
        n = int(argv[1]) if len(argv) > 1 else 300
        rows = shortlist()
        print(f"{len(rows)} candidates (showing {min(n, len(rows))}): zh, zhuyin, level, id, chars, text")
        for r in rows[:n]:
            print(f"{r['zh']}\t{r['zhuyin']}\t{r['level']}\t{r['id']}\t{r['chars']}\t{r['text'].replace(chr(10), ' / ')}")
    elif len(argv) == 2:
        e = entry_for(argv[0], argv[1])
        print(json.dumps(e, ensure_ascii=False, indent=1) if e else "no entry")
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
