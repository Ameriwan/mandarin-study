"""MOE 《成語典》 (CC BY-ND 3.0 TW): download the official data and convert it to JSON, unmodified.

    .venv\Scripts\python.exe tools\chengyu.py           download what is missing, then write chengyu.json
    .venv\Scripts\python.exe tools\chengyu.py --check   also check content/library/chengyu.csv against it

Downloads go to .cache/moe-data/ (gitignored). The MOE server resets long transfers, so downloads resume
with HTTP Range requests and retry. The 使用說明 (license terms that must travel with the data) is
idiomsdict_10409.pdf / .odt, downloaded next to the zip.

Output: .cache/moe-data/chengyu-v2.json  {idiom: {zhuyin, meaning, story, usage, usage_type, examples, id}}
        (all 5,489 rows; v2: 用法說明-使用類別 is a field of its own, as MOE heads it)
        .cache/moe-data/moe-license-idioms.txt  the 使用說明 as text
Format conversion only (§7.5): field text is copied exactly as MOE wrote it (no trimming, no rewording).
For the build: parse(), base_zhuyin(), read_selection(), check_selection(), attribution(), license_info().
"""
import csv
import http.client
import io
import json
import re
import sys
import time
import zipfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MOE = ROOT / ".cache" / "moe-data"
OUT = MOE / "chengyu-v2.json"   # v2: usage (語義說明) and usage_type (使用類別) apart; v1 joined them in usage
CSV = ROOT / "content" / "library" / "chengyu.csv"
UA = "Mozilla/5.0 (mandarin-study build; personal study project)"

RESPUB = "https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub"
VERSION = "dict_idioms_2020_20260929"
FILES = {
    f"{VERSION}.zip": f"{RESPUB}/download/{VERSION}.zip",   # 文字資料庫
    "idiomsdict_10409.pdf": f"{RESPUB}/idiomsdict_10409.pdf",  # 公眾授權使用說明
    "idiomsdict_10409.odt": f"{RESPUB}/idiomsdict_10409.odt",
}
PAGE = f"{RESPUB}/dict_idiomsdict_download.html"
# The 使用說明 as plain text (format conversion of the official .odt: paragraphs -> lines, nothing reworded).
# §7.5: it travels with any redistributed 成語典 text, like content/moe-license-concised.txt for the 簡編本.
LICENSE_TXT = MOE / "moe-license-idioms.txt"
LICENSE_PATH = "data/moe-license-idioms.txt"   # where the build is expected to publish it, relative to docs/
LICENSE_URL = f"{RESPUB}/idiomsdict_10409.pdf"


def version():
    """The 版本編號 in the export's file name: dict_idioms_2020_20260929 -> 2020_20260929."""
    return VERSION.replace("dict_idioms_", "")


def attribution():
    """The attribution line the 使用說明 (三) requires next to any 成語典 text (its own wording and URL)."""
    return (f"中華民國教育部（Ministry of Education, R.O.C.）。《成語典》（版本編號：{version()}）"
            f"網址：http://dict.idioms.moe.edu.tw/")


def license_info():
    """The `license` field for a data file that carries 成語典 text (same shape as entries.license_info())."""
    return {"name": "CC BY-ND 3.0 TW", "path": LICENSE_PATH, "version": version(), "terms": LICENSE_URL,
            "attribution": attribution()}


def download(dest: Path, url: str, tries=12):
    """Resumable download: keep the .part file and continue it with a Range request after a reset."""
    if dest.exists() and dest.stat().st_size > 0:
        return "skip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    total = None
    for attempt in range(1, tries + 1):
        have = tmp.stat().st_size if tmp.exists() else 0
        headers = {"User-Agent": UA}
        if have:
            headers["Range"] = f"bytes={have}-"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                if have and r.status != 206:          # server ignored the range: start over
                    have = 0
                length = r.headers.get("Content-Length")
                if length is not None:
                    total = have + int(length)
                with open(tmp, "ab" if have else "wb") as f:
                    while chunk := r.read(1 << 16):
                        f.write(chunk)
            size = tmp.stat().st_size
            if total is None or size >= total:
                tmp.replace(dest)
                return "ok"
        except urllib.error.HTTPError as e:
            if e.code == 416 and tmp.exists():         # range past the end: the .part is complete
                tmp.replace(dest)
                return "ok"
            if e.code < 500:
                raise
        except (urllib.error.URLError, http.client.HTTPException, OSError):
            pass
        time.sleep(min(2 * attempt, 10))
    raise RuntimeError(f"gave up after {tries} tries: {url}")


_XML_ESCAPE = re.compile(r"_x([0-9A-Fa-f]{4})_")   # how .xlsx stores control characters (_x000D_ = CR)


def cell(v):
    """Format conversion only: undo the .xlsx escape and use \\n line ends; the text itself is untouched."""
    if v is None:
        return ""
    s = _XML_ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), str(v))
    return s.replace("\r\n", "\n").replace("\r", "\n")


def rows():
    """The MOE sheet as dicts keyed by its own column names (編號, 成語, 注音, 釋義, 典故說明, 用法說明-…)."""
    import openpyxl
    with zipfile.ZipFile(MOE / f"{VERSION}.zip") as z:
        data = z.read(f"{VERSION}.xlsx")
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True)
    it = wb.worksheets[0].iter_rows(values_only=True)
    head = [cell(h) for h in next(it)]
    for r in it:
        if r and r[1]:
            yield dict(zip(head, (cell(v) for v in r)))


def parse():
    """{idiom: {zhuyin, meaning, story, usage, usage_type, examples, id}}, MOE text verbatim:
    zhuyin = 注音 (MOE's own 音讀 string: full-width spaces, a （變） sandhi form or a （又音） reading after the base
    reading; the build publishes it unchanged as chengyu.json `moe_zhuyin`), meaning = 釋義, story = 典故說明,
    usage = 用法說明-語義說明, usage_type = 用法說明-使用類別 (apart, so each shows under its own MOE heading),
    examples = 用法說明-例句 split into its lines, id = 編號. A repeated idiom keeps its 主條 (main) entry.
    MOE separates the senses of a many-sense idiom with ＆: inside usage, and as an example line of its own
    ("＆") between the examples of one sense and the next; both are kept as MOE wrote them."""
    out = {}
    for r in rows():
        idiom = r["成語"]
        main = r.get("主條成語／非主條成語", "") == "主條成語"
        if idiom in out and not main:
            continue
        out[idiom] = {
            "zhuyin": r["注音"],
            "meaning": r["釋義"],
            "story": r["典故說明"],
            "usage": r["用法說明-語義說明"],
            "usage_type": r["用法說明-使用類別"],
            "examples": [x for x in r["用法說明-例句"].split("\n") if x.strip()],
            "id": int(r["編號"]) if str(r["編號"]).isdigit() else r["編號"],
        }
    return out


def base_zhuyin(moe_zhuyin):
    """MOE's first (base-tone) reading in the content format of §9.2: 'ㄧ　ㄇㄠˊ　ㄅㄨˋ　ㄅㄚˊ　（變）　ㄧˋ …'
    -> 'ㄧ ㄇㄠˊ ㄅㄨˋ ㄅㄚˊ'. Only the separator changes (format conversion); a second listed reading
    after （又音） / （語音） / （讀音） is dropped as well."""
    first = re.split(r"[（(]", re.sub(r"^（一）", "", moe_zhuyin), maxsplit=1)[0]
    return re.sub(r"[\s　]+", " ", first).strip()


_ODT_TEXT = "urn:oasis:names:tc:opendocument:xmlns:text:1.0"


def _odt_run(el):
    """The text of one ODF element: spans flattened, <text:s c=N/> -> N spaces, line breaks and tabs kept."""
    out = [el.text or ""]
    for ch in el:
        tag = ch.tag.rsplit("}", 1)[-1]
        if tag == "line-break":
            out.append("\n")
        elif tag == "tab":
            out.append("\t")
        elif tag == "s":
            out.append(" " * int(ch.get(f"{{{_ODT_TEXT}}}c", "1")))
        else:
            out.append(_odt_run(ch))
        out.append(ch.tail or "")
    return "".join(out)


def license_text():
    """The 《成語典》公眾授權使用說明 as plain text, one line per paragraph of the official idiomsdict_10409.odt."""
    import xml.etree.ElementTree as ET
    with zipfile.ZipFile(MOE / "idiomsdict_10409.odt") as z:
        root = ET.fromstring(z.read("content.xml"))
    lines = []

    def walk(el):
        for ch in el:
            if ch.tag in (f"{{{_ODT_TEXT}}}p", f"{{{_ODT_TEXT}}}h"):
                lines.append(_odt_run(ch))
            else:
                walk(ch)
    walk(root)
    body = "\n".join(lines).strip("\n") + "\n"
    if "公眾授權使用說明" not in body:
        raise SystemExit("idiomsdict_10409.odt does not hold the MOE 使用說明")
    return body


def read_selection():
    with open(CSV, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def check_selection(data):
    """Every chengyu.csv row: in the MOE data, Zhuyin equal to MOE's base reading, verifier not 'fail', level B1/B2."""
    sys.path.insert(0, str(ROOT / "tools"))
    import verify
    problems, seen = [], set()
    for n, r in enumerate(read_selection(), start=2):
        idiom, z = r["idiom"], r["zhuyin"]
        where = f"chengyu.csv:{n} {idiom}"
        if idiom in seen:
            problems.append(f"{where}: repeated")
        seen.add(idiom)
        if idiom not in data:
            problems.append(f"{where}: not in the MOE 成語典 data")
            continue
        if z != base_zhuyin(data[idiom]["zhuyin"]):
            problems.append(f"{where}: Zhuyin {z} is not MOE's {base_zhuyin(data[idiom]['zhuyin'])}")
        st, why = verify.check(idiom, z)
        if st == "fail":
            problems.append(f"{where}: verifier fail: {why}")
        if r["level"] not in ("B1", "B2"):
            problems.append(f"{where}: level {r['level']} is not B1/B2")
    return problems


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    for name, url in FILES.items():
        print(f"{download(MOE / name, url):5} {name}")
    data = parse()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(data)} idioms -> {OUT.relative_to(ROOT)}")
    LICENSE_TXT.write_text(license_text(), encoding="utf-8", newline="\n")
    print(f"使用說明 -> {LICENSE_TXT.relative_to(ROOT)}")
    if "--check" in sys.argv:
        problems = check_selection(data)
        print("\n".join(problems) or f"chengyu.csv: {len(read_selection())} rows ok")
        sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
