# 國語自學 Taiwan Mandarin Self-Study

A free static web app for self-study of Taiwan Mandarin (國語): Traditional characters, Zhuyin first,
MOE (教育部) readings and Taiwan vocabulary. Three jobs: a pronunciation & tone lab with native
Taiwan audio to shadow, a level-by-level study plan (TBCL / TOCFL), and a searchable library.

**Live site:** GitHub Pages serves the `docs/` folder. (Not published yet.)

The build plan is `MASTER_PROMPT.md`; progress is tracked in `PROGRESS.md`.

## Layout

```
content/   hand-written source data (words, units, drills) — edit these
tools/     build.py (content → docs/data, audio, contours), verify.py (MOE check)
docs/      the site; data/, audio/ and contours/ are GENERATED
.cache/    downloaded MOE / TBCL / CC-CEDICT data (gitignored, never committed)
progress/  my progress exports for WEEKLY (gitignored)
```

## Build

```
.venv\Scripts\python.exe tools\build.py
```

Preview locally: `python -m http.server 8782 --directory docs` → http://localhost:8782

Every Zhuyin string in `content/` is checked against MOE data by `tools/verify.py`; the build fails on any
mismatch. See `content/sources.md` and the Credits page for every source and license.
