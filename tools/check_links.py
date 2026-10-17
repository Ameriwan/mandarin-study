"""Re-test every external link in content/resources.json (MASTER_PROMPT §5.8, §10 CHECK).

Each URL gets a HEAD request, then a GET when HEAD fails or answers >= 400 (many servers refuse HEAD),
with a 15 s timeout, a normal browser User-Agent and redirects followed. The script writes back, per entry:
  status           final HTTP status (null when no answer), checked (YYYY-MM-DD),
  template_status  the same for url_template filled with template_example ({q} -> percent-encoded),
  final_url        only when the redirects end on a different page, error (when no answer),
  tls              set when Python could not verify the certificate chain (common on .gov.tw / .edu.tw
                   servers that omit the intermediate certificate; browsers fetch it themselves) and the
                   status therefore comes from an unverified retry,
  verified         true only for 2xx/3xx (url and, if any, the template link) and no manual `hold`.

Usage (project venv only):
  .venv/Scripts/python.exe tools/check_links.py                 check all and rewrite the file
  .venv/Scripts/python.exe tools/check_links.py --only a,b      check some ids
  .venv/Scripts/python.exe tools/check_links.py --dry-run       print only, write nothing
Exit code 1 when the file is invalid or any link is broken.
"""
import argparse
import datetime
import json
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
import urllib3

ROOT = Path(__file__).resolve().parent.parent
RESOURCES = ROOT / "content" / "resources.json"
TIMEOUT = 15
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/141.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
           "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"}
TLS_NOTE = "certificate chain not verifiable by Python (missing intermediate); status from an unverified retry"
REQUIRED = ["id", "title_zh", "title_en", "url", "track", "level_min", "level_max", "license_note",
            "verified", "checked", "status"]
ORDER = ["id", "title_zh", "title_en", "url", "track", "kind", "level_min", "level_max", "license_note",
         "note_en", "note_zh", "url_template", "template_example", "hold", "verified", "checked", "status",
         "template_status", "final_url", "tls", "error"]
RESULT_KEYS = ("status", "template_status", "final_url", "tls", "error")


def ok(status):
    return isinstance(status, int) and 200 <= status < 400


def fill(template, example):
    return template.replace("{q}", urllib.parse.quote(example or "", safe=""))


def _short(method, err):
    return f"{method}: {type(err).__name__}: {err}"[:240]


def fetch(url):
    """HEAD, then GET if needed. Returns {status, final_url, error, tls}."""
    res = {"status": None, "final_url": None, "error": None, "tls": None}
    verify = True
    with requests.Session() as s:
        for method in ("HEAD", "GET"):
            while True:
                try:
                    r = s.request(method, url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True,
                                  stream=method == "GET", verify=verify)
                    r.close()
                except requests.exceptions.SSLError as err:
                    if verify:              # retry once without verification, and say so
                        verify, res["tls"] = False, TLS_NOTE
                        continue
                    res["error"] = _short(method, err)
                except requests.RequestException as err:
                    res["error"] = _short(method, err)
                else:
                    res.update(status=r.status_code, final_url=r.url, error=None)
                break
            if ok(res["status"]):
                break
    return res


def _same(a, b):
    norm = lambda u: urllib.parse.unquote(u or "").split("#")[0].rstrip("/").lower()  # noqa: E731
    return norm(a) == norm(b)


def check_entry(e, today):
    r = fetch(e["url"])
    for k in RESULT_KEYS:
        e.pop(k, None)
    e["status"], e["checked"] = r["status"], today
    good = ok(r["status"])
    if r["final_url"] and not _same(r["final_url"], e["url"]):
        e["final_url"] = r["final_url"]
    if r["error"] and not good:
        e["error"] = r["error"]
    tls = r["tls"]
    if e.get("url_template"):
        t = fetch(fill(e["url_template"], e.get("template_example")))
        e["template_status"] = t["status"]
        tls = tls or t["tls"]
        good = good and ok(t["status"])
        if t["error"] and not ok(t["status"]):
            e["error"] = (e.get("error", "") + " | template " + t["error"]).strip(" |")
    if tls:
        e["tls"] = tls
    e["verified"] = bool(good and not e.get("hold"))
    return e


def ordered(e):
    out = {k: e[k] for k in ORDER if k in e}
    out.update({k: v for k, v in e.items() if k not in out})
    return out


def validate(data):
    """Schema problems in resources.json, as a list of strings (empty when fine)."""
    errs, seen = [], set()
    tracks = data.get("tracks") or {}
    items = data.get("resources")
    if not isinstance(items, list):
        return ["`resources` must be a list"]
    for i, e in enumerate(items):
        where = f"resources[{i}] {e.get('id', '?')}"
        errs += [f"{where}: missing {k}" for k in REQUIRED if k not in e]
        if e.get("id") in seen:
            errs.append(f"{where}: duplicate id")
        seen.add(e.get("id"))
        if tracks and e.get("track") not in tracks:
            errs.append(f"{where}: unknown track {e.get('track')!r}")
        lo, hi = e.get("level_min"), e.get("level_max")
        if not (isinstance(lo, int) and isinstance(hi, int) and 1 <= lo <= hi <= 7):
            errs.append(f"{where}: levels must be TBCL 1-7 with min <= max")
        if not str(e.get("url", "")).startswith("https://"):
            errs.append(f"{where}: url must be https")
        if e.get("url_template") and ("{q}" not in e["url_template"] or not e.get("template_example")):
            errs.append(f"{where}: url_template needs {{q}} and a template_example")
        if e.get("verified") and e.get("hold"):
            errs.append(f"{where}: verified while on hold")
    return errs


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--file", type=Path, default=RESOURCES)
    ap.add_argument("--only", default="", help="comma-separated ids")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    data = json.loads(args.file.read_text(encoding="utf-8-sig"))
    errs = validate(data)
    for msg in errs:
        print("INVALID", msg)
    only = {x.strip() for x in args.only.split(",") if x.strip()}
    items = [e for e in data["resources"] if not only or e["id"] in only]
    today = datetime.date.today().isoformat()
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda e: check_entry(e, today), items))
    data["resources"] = [ordered(e) for e in data["resources"]]
    if not only:
        data["checked"] = today

    broken = 0
    for e in items:
        bad = not ok(e["status"]) or ("template_status" in e and not ok(e["template_status"]))
        broken += bad
        mark = "BROKEN" if bad else ("hold  " if e.get("hold") else "ok    ")
        extra = "".join(f"  {k}={e[k]}" for k in ("template_status", "final_url") if k in e)
        extra += "  [tls]" if e.get("tls") else ""
        extra += f"  {e['error']}" if e.get("error") else ""
        print(f"{mark} {e['status']!s:>4}  {e['id']:<22} {e['url']}{extra}")
    held = sum(1 for e in items if e.get("hold"))
    print(f"Links: {len(items)} checked, {sum(e['verified'] for e in items)} verified, "
          f"{broken} broken, {held} on hold ({today})")
    if not args.dry_run:
        args.file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {args.file}")
    return 1 if errs or broken else 0


if __name__ == "__main__":
    sys.exit(main())
