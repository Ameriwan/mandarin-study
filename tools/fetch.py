"""Download the reference data the build needs into .cache/ (gitignored; never committed).

    .venv\Scripts\python.exe tools\fetch.py          fetch anything missing
    .venv\Scripts\python.exe tools\fetch.py --force  re-download everything

Sources and licenses: content/sources.md. Throttled to about one request per second.
"""
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
UA = "Mozilla/5.0 (mandarin-study build; personal study project)"

MOE_RESPUB = "https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub"
JUYIN = "https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin"
TBCL = "https://coct.naer.edu.tw/file/files"
G0V = "https://raw.githubusercontent.com/g0v/moedict-data/master"

FILES = {
    # MOE dictionaries (CC BY-ND 3.0 TW)
    "moe-data/dict-concised.audio.json": f"{G0V}/dict-concised.audio.json",
    "moe-data/dict-revised.json.xz": f"{G0V}/dict-revised.json.xz",
    "moe-data/dict_concised_2014_20260929.zip": f"{MOE_RESPUB}/download/dict_concised_2014_20260929.zip",
    "moe-data/dict_revised_2015_20260929.zip": f"{MOE_RESPUB}/download/dict_revised_2015_20260929.zip",
    "moe-data/conciseddict_10312.pdf": f"{MOE_RESPUB}/conciseddict_10312.pdf",
    "moe-data/reviseddict_10312.pdf": f"{MOE_RESPUB}/reviseddict_10312.pdf",
    # MOE 注音符號手冊 (audio CC BY 4.0)
    "moe-juyin/bopomofo_materials_20170213.zip": f"{JUYIN}/bopomofo_materials_20170213.zip",
    **{f"moe-juyin/F{i}.WAV": f"{JUYIN}/html_ch/audio/F{i}.WAV" for i in range(1, 38)},
    # TBCL (NAER, all rights reserved: cache only)
    "tbcl/14452詞語表202504.xlsx": f"{TBCL}/14452%E8%A9%9E%E8%AA%9E%E8%A1%A8202504.xlsx",
    "tbcl/漢字表_111-09-20.xlsx": f"{TBCL}/%E8%87%BA%E7%81%A3%E8%8F%AF%E8%AA%9E%E6%96%87%E8%83%BD%E5%8A%9B%E5%9F%BA%E6%BA%96%E6%BC%A2%E5%AD%97%E8%A1%A8_111-09-20(1).xlsx",
    "tbcl/語法點表_112-01-04.xlsx": f"{TBCL}/%E8%87%BA%E7%81%A3%E8%8F%AF%E8%AA%9E%E6%96%87%E8%83%BD%E5%8A%9B%E5%9F%BA%E6%BA%96%E8%AA%9E%E6%B3%95%E9%BB%9E%E8%A1%A8_112-01-04(1).xlsx",
    "tbcl/類詞綴表_20250429.xlsx": f"{TBCL}/%E8%87%BA%E7%81%A3%E8%8F%AF%E8%AA%9E%E6%96%87%E8%83%BD%E5%8A%9B%E5%9F%BA%E6%BA%96%E9%A1%9E%E8%A9%9E%E7%B6%B4%E8%A1%A8_20250429(1).xlsx",
    # TOCFL 8000 (all rights reserved: cache only)
    "tocfl/8000zhuyin_202409.zip": "https://tocfl.edu.tw/tocfl/assets/files/vocabulary/8000zhuyin_202409.zip",
    # CC-CEDICT (CC BY-SA 4.0)
    "cedict/cedict_1_0_ts_utf-8_mdbg.zip": "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip",
}


def fetch(dest: Path, url: str, force=False):
    if dest.exists() and dest.stat().st_size > 0 and not force:
        return "skip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
        while chunk := r.read(1 << 16):
            f.write(chunk)
    tmp.replace(dest)
    return "ok"


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    force = "--force" in sys.argv
    failed = []
    for rel, url in FILES.items():
        dest = CACHE / rel
        try:
            status = fetch(dest, url, force)
        except Exception as e:  # keep going; the build reports what's missing
            status = f"FAIL {e}"
            failed.append(rel)
        print(f"{status:6} {rel}")
        if status != "skip":
            time.sleep(1)
    if failed:
        print(f"\n{len(failed)} download(s) failed: " + ", ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
