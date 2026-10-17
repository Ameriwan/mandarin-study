# PROGRESS

Build plan: `MASTER_PROMPT.md` §11. One row per milestone; the log below records each session.

| # | Milestone | Status | Done when |
|---|---|---|---|
| M0 | **SETUP** (folders, venv, git, data cache, tool checks) | ✅ 2026-10-13 | Data cached, tools probed, settings filled in |
| M1 | SETUP + audio pipeline + Zhuyin Lab (symbols, syllable grid, contrasts, dictation) | ✅ built and QA'd 2026-10-13 (waiting on Amadeus's spot-listen and phone test) | Tap any syllable → correct MOE audio in all tones; contrast drills work |
| M2 | Tone Gym (ID, tone pairs, pitch mirror, sandhi, Taiwan readings) + Today (pronunciation block) | ✅ built and QA'd 2026-10-13 (waiting on the iPhone + laptop mic test) | Pitch overlay works on phone and laptop |
| M3 | Shadowing (player, protocol, MOE dictionary readings, native-check hand-off) | ✅ built and QA'd 2026-10-16 (waiting on a real-mic session) | A full 10-minute session runs |
| M4 | Plan + placement check + Library (TBCL L1–3, grammar, Taiwan vocab) | ✅ built and QA'd 2026-10-17 (Library seeded with TBCL L1–4 words for the Band B goal) | Placement gives a level and a starting unit |
| M5 | Units for my level and the next (subagents, verified) | ✅ 16 units for TBCL L1–L2 (placement not taken yet; LEVEL-UP adds the next level) | Units released per the plan |
| M6 | Advanced tracks + resources + immersion mode | ✅ built and QA'd 2026-10-17 (+ Settings and Credits) | Links checked; reading ladder works |
| M7 | Polish + accessibility + PUBLISH (ask first) | 🟡 published 2026-10-17 (https://ameriwan.github.io/mandarin-study/); the final QA review was stopped early to save session credits: run CHECK next | Live site works on my phone |

## Settings

- Filled in 2026-10-13: GOAL = TOCFL Band B as fast as possible · PHONE = iPhone · PUBLIC_REPO_OK = yes · OBSIDIAN_EXPORT = yes
- Still blank (optional): `NATIVE_CHECKER`

## Open issues

- **簡編本 vs 修訂本 readings differ** for 4 items in §6.5: 癌症 (簡 ㄞˊ ㄓㄥˋ / 修 ㄧㄢˊ ㄓㄥˋ), 成熟 (簡 ㄕㄡˊ / 修 ㄕㄨˊ), 認識 (簡 ㄕˋ / 修 ˙ㄕ), 癌 (簡 ㄞˊ / 修 ㄧㄢˊ, 又音 ㄞˊ). The MOE *audio* follows the 簡編本. §6 says treat it as source of truth, so the app teaches §6 and the verifier logs these as ⚑ warnings; ask Amadeus if he wants the audio reading instead.
- **TBCL Zhuyin conventions differ from MOE:** TBCL prints the 一/不 sandhi (一定 ㄧˊ ㄉㄧㄥˋ), full tones where MOE has neutral (晚上 ㄕㄤˋ vs ˙ㄕㄤ), the dot after the syllable in 的 (ㄉㄜ˙), slash variants (爸爸/爸, 和1 ㄏㄢˋ / ㄏㄜˊ). The verifier must normalize these and treat tone-only differences as warnings (§9.3), never failures.
- The 解詞造句 PDF (§8.7) is not on the TBCL downloads page; only its technical report is. Skipped.
- **§7.2 overcounts the id map:** it says 1,253 toned syllables over 440 bases; the real figure is 1,222 over 405 (1,253 / 440 counts raw key strings, 35 of which carry a （語音）/（讀音）/（又音）/（一） prefix or a trailing U+3000 space). Propose correcting §7.2; not edited, since MASTER_PROMPT is Amadeus's.

## Log

### 2026-10-13 · SETUP
- Created folder structure (§9.1), `.gitignore`, `.gitattributes`, `README.md`, `update-site.cmd`, `git init -b main`.
- Added `mandarin-site` (port 8782, serves `mandarin-study/docs`) to `~/.claude/launch.json`.
- Venv: `.venv` from the uv-managed CPython 3.11.15 (same base as english-lessons). Python 3.12 is not installed, so `librosa` is pinned `<1.0` (0.10.x supports 3.11).
- Data cached in `.cache/` via `tools/fetch.py` (52 files, all verified): MOE 簡編本 audio-id map (39,738 keys; 6,634 single characters → 1,222 toned syllables over 405 bases, 20 of them neutral tone. *Corrected in QA:* this line first said 1,253 over 440 "exactly as §7.2 says", but that counts raw key strings: 33 single-character keys carry a （語音）/（讀音）/（又音）/（一） prefix and 4 more end in a U+3000 space; once `moe.audio_map` strips those, 1,222 / 405 remain, and the grid holds all of them), MOE 簡編本 xlsx (45,178 rows, 2026-09-29 release) and 修訂本 xlsx (163,909 rows) plus g0v `dict-revised.json.xz` (161,194 entries), the two MOE license PDFs, the 37 handbook WAVs + materials zip (250 files), TBCL 詞語表 (14,452 words with Zhuyin+pinyin), 漢字表 (3,100), 語法點表 (496), 類詞綴表 (73), TOCFL 8000 zip, CC-CEDICT.
- MOE spreadsheets have columns 字詞名 / 多音排序 / 注音一式 / 變體類型 (1 變, 2 又音, 3 語音, 4 讀音, 5 或讀) / 變體注音 / 漢語拼音 / 釋義: the verifier reads these directly. All 44 readings spot-checked from §6.5 match the 2026 修訂本.
- TBCL words with an MOE audio id whose Zhuyin matches exactly: 10,975 / 14,452 (≈76% at every level); 353 more exist with a tone-only difference.
- Headword span confirmed with ffmpeg silencedetect on 馬 (0534.ogg, 9.04 s): speech 0.00–0.50 s, then a 0.74 s pause (§7.3).
- The id map keys multi-syllable words with `　` or no separator (`水果.ㄕㄨㄟˇㄍㄨㄛˇ`), so lookups strip all spaces.
- language.moe.gov.tw resets long downloads; `tools/fetch.py` streams, and the SETUP used `curl -C -` loops. uv's installer hung on PyPI for 50 min and was replaced by pip with timeouts.
- Plugins: `frontend-design` is in the official marketplace. There is **no "Design" plugin** (`accessibility-review`, `ux-copy`) in the marketplace — accessibility review will be done by hand against §10.

**Tool checks (inside `.venv`, 2026-10-13):**
- `imageio-ffmpeg` 0.6.0 → bundled ffmpeg 7.1 at `.venv/Lib/site-packages/imageio_ffmpeg/binaries/`; `silencedetect` on 馬 gives speech 0.00–0.50 s. ✅
- `gTTS` 2.5.4, `lang="zh-TW"` → 49.9 KB mp3 in 2.3 s. ✅ (working default for sentences)
- `edge-tts` upgraded to 7.2.8 → still **403** (`WSServerHandshakeError` on speech.platform.bing.com; issue rany2/edge-tts#490). ❌ Skip; re-probe at each BUILD.
- `librosa` 0.11.0 `pyin` on the 馬 headword span: with default parameters it marks **no frames voiced** (voiced_prob ≤ 0.05) on this quiet 22 kHz ogg, although it works on the handbook WAV and gTTS output. With `resolution=0.05, switch_prob=0.1` it tracks 199 → 121 → 241 Hz, and plain `librosa.yin` gives the same contour (matches §6.3: 200 → 123 → 235). **contours.py must use yin + an RMS/periodicity gate, or pyin with those parameters, and never trust pyin's default voicing on MOE clips.**
- Python 3.11 venv (uv-managed CPython; no Python 3.12 on this PC), so `librosa<1.0` (0.11.0 installed). `openpyxl` 3.1.5 reads all MOE/TBCL xlsx files.
- No network-dependent tool is needed for BUILD except TTS and the moedict CDN.

**Next:** `BUILD` to start M1 (audio pipeline + Zhuyin Lab). iPhone means every self-hosted clip needs an mp3 twin (format conversion only) chosen with `canPlayType`.

### 2026-10-13 · BUILD (M1)
- **Pipeline:** `tools/moe.py` (readings cache, audio-id map, TBCL lists, segmentation), `tools/verify.py` (§9.3: TBCL → 簡編本 → 修訂本; tone-only / 又音 / 語音 / 讀音 → ⚑ warnings; anything else fails), `tools/audio.py` (MOE ogg whole files + mp3 twins, silencedetect headword spans, 37 handbook WAVs → mp3, gTTS for sentences), `tools/contours.py` (yin/pyin + RMS gate, semitones vs. speaker median, 40 points), `tools/build.py` (→ `docs/data/*.json`, `build-report.md`, size check).
- **Content:** `content/zhuyin/symbols.json` (37 symbols from §6.1, 91 verified example words, written by a subagent and verified), `content/zhuyin/contrasts.json` (10 contrasts, §6.2), `content/tones/pairs.csv` (20 words, §6.4). Verifier: 261 strings, 0 failures, 1 warning (樂 ㄌㄜˋ is the 簡編本's second heteronym; correct).
- **Syllable grid:** 405 base syllables / 1,222 toned syllables have a single-character MOE recording (that is every single-character syllable in the id map; see the SETUP correction). Representative character = in the TBCL 漢字表 first, then first-listed reading, then lowest TBCL level, then frequency (changed in QA, see below).
- **Pages:** `docs/index.html` (Today placeholder: streak, week minutes, page map), `docs/lab.html` + `js/lab.js` (symbol chart → detail with handbook audio, IPA, how/error/notes, examples, record; syllable picker + full table view; contrast drills with per-contrast history in localStorage; dictation with the standard Zhuyin keyboard, physical-key mapping, syllable diff; mouth guides). `js/app.js` shared shell/store/audio (Web Audio span playback, ogg→mp3 by canPlayType, browser-voice fallback labelled), IndexedDB recordings, pitchy hook for M2. PWA: manifest, icons, `sw.js` (shell network-first, data network-first, audio cache-on-first-play).
- **Design:** one family (Noto Sans TC), cool slate background, deep-teal accent, dark mode via prefers-color-scheme; the 37-symbol chart is the hero. Tone colours off (not built yet). Bottom tab bar on phone (今天 / 注音 / 聲調 / 跟讀 / 更多), full nav on desktop.
- **Tested in the built-in browser** at 375 px and desktop: no console errors; handbook audio plays (`audio/juyin/F1.mp3` 200); contrast drill feedback/compare/next flow works; dictation keyboard and physical keys (a 8 3 → ㄇㄚˇ) work; hash deep links switch tabs.
- **Audio download is slow on this connection** (20–30 s per 30 KB clip). The build now downloads in priority order (content words first, then grid cells by TBCL level) with `--max-new N` per run and 3 parallel connections; rerun `BUILD` to continue filling the 1,305 clips. Cells without a clip show "clip not built yet".
- **Not yet verified:** mic recording in the browser pane (permission prompt), the 20-span spot-listen (§10.4) — needs Amadeus's ears.

### 2026-10-13 · BUILD (2nd run)
- 648 / 1,305 MOE clips published (565 / 1,222 grid cells), 615 contours, docs/ 178 MB. Remaining 657 clips are grid cells for TBCL L4+ characters; projected full set ≈ 300 MB (ogg 86 KB + mp3 142 KB median per clip, because the whole file is shipped).
- Span detector v3: silencedetect at -35 dB first, then -30 / -25 / -40 / -45 / -50 dB until the headword length is plausible (0.18–0.85 s per syllable + 0.3 s). Fixed 叫 (quiet file, 0.37 s) and 懂 (breath noise in the pause, 0.62 s). 0 flagged spans. Cache: `.cache/moe-audio/spans-v3.json`.
- Pages reload clean after the rebuild (only the blocked Google Fonts request logs in the pane).

### 2026-10-13 · QA fixes (`tools/build.py`)
- **Grid representatives:** TBCL 漢字表 characters now rank ahead of non-TBCL ones, then first-listed reading, level, frequency (each clip says the cell's reading, so a common character in a secondary reading beats a rare one). 18 cells changed, e.g. ㄊㄧㄠˇ 䠷 → 挑, ㄆㄧㄢˊ 胼 → 便, ㄍㄜˇ 舸 → 個, ㄉㄧㄠˇ 屌 → 鳥; their 18 clips download on the next full BUILD.
- **Grey-out signal (§5.2):** every grid cell carries `common` (representative is in the 漢字表): 1,103 true, 119 false (e.g. ˙ㄧㄝ 吔, ㄔㄨㄛ 戳). `level` is still the character's level, not the reading's.
- **Base validation:** grid syllables must be Zhuyin symbols only, with the tone mark in place and a real final, so a squashed two-syllable reading or an obsolete symbol can't add a bogus column (0 rejected in today's map).
- **Report:** content words without a clip are listed once each (25, was 40 with repeats; `meta.counts.contrast_words` is now unique words, 112); the size budget is checked before the report is written, so an over-budget build reports **Status: FAILED (size budget)** and its log lines are in the report.

### 2026-10-13 · BUILD (3rd run) + multi-agent QA
- **Audio complete:** 1,300 / 1,305 MOE clips (5 are not on the moedict CDN: 呀 ˙ㄧㄚ 5964, 裳 ˙ㄕㄤ 5082, 哩 ㄌㄧ 1854, 湳 ㄋㄢˇ 1624, 氌 ˙ㄌㄨ 2110; their cells show "no clip"). 1,217 / 1,222 grid cells play. 1,272 contours. docs/ 317 MB of 600 MB.
- **QA review:** 7 reviewers (verifier, audio, contours, front end, accessibility, content, build data) reported 40 findings; 3 skeptics each tried to refute every one. 34 confirmed, 6 refuted (3 of those were intended behaviour). Fixes were applied by one agent per file group, each checked by an independent agent, with one repair round; the lead finished the rest.
- **Verifier (`tools/verify.py`, `tools/moe.py`):** a wrong tone now **fails**. Only §6.4 differences warn: neutral ↔ full tone of the same base (a ˙ written where every source has a full tone fails, e.g. 頭髮 ˙ㄈㄚ), 一 / 不 sandhi, and 3+3 sandhi inside a phrase (never across punctuation). TBCL readings that only match an MOE 變 / 又音 / 語音 / 讀音 variant warn and name the variant. Sentences that longest-match segments badly are re-split (會|計算). TBCL slash forms and numbered homographs (和1/和2, 得1–3) are parsed properly. Regression tests: `tools/test_verify.py` (0 failing).
- **Spans (`tools/audio.py`, cache `spans-v4.json`):** words need a ≥0.45 s pause to end the headword (single characters keep 0.15 s), so 垃圾, 私人, 喜歡 keep their second syllable. 0 spans flagged.
- **Contours (`tools/contours.py`, cache `contours-v2.json`):** pyin dropped T4 falls and made octave errors (抱 26 st), and Praat (parselmouth, tried and removed) made octave errors too (抱, 女). The tracker is now YIN's CMNDF on a 600 Hz low-pass with a Viterbi path, an octave-continuity rule and a creak-tail rule (a quiet tail that turns upward is cut; a single T4 never ends in a rise). Each contour has a per-point voicing mask `v`. Mean shapes over 1,217 single syllables: T1 flat, T2 dip-then-rise (+6.4 st), T3 low dip then partial rise, T4 fall (−9.3 st); 0 T4 upturns. Contours stay in one file, `docs/data/contours.json` (447 KB), not the `docs/data/contours/` folder §7.4 names: one request instead of 1,272.
- **Front end:** dictation's key handler no longer leaks or hijacks Enter on buttons; full tabs pattern with arrow keys; dictation feedback is announced; the microphone is released when a recorder is removed or the tab changes; hidden-tab time is not counted as study time; aria-pressed renders "true"/"false"; focus ring ≥4:1 in both themes; unbuilt pages are shown disabled instead of linking to 404s; English runs carry `lang="en"` and no Chinese sits inside them; the service worker caches handbook clips despite Range requests and keeps the audio cache across version bumps; a failed clip fetch is retried. Rare-character grid cells are drawn dashed with 少用.
- **Content:** ㄧ error, ㄘ error and ㄋ how were set to empty because §6.1 gives nothing for them (my subagent brief had invented them); four §6.1 special-case details were restored.
- **Known, accepted:** 18 grid cells use a common character in a less usual reading (挑 ㄊㄧㄠˇ, 便 ㄆㄧㄢˊ, 寧 ㄋㄧㄥˋ, 殺 ㄕㄞˋ …); the audio is that reading, so it is correct, but the label can surprise. 寧 1706 and 處 4823 are flagged for range: real T4 falls into creak.
- **Still needs Amadeus:** spot-listen (§10.4) a few grid cells and the ㄅ examples; test recording and offline playback on the iPhone.

### 2026-10-13 · M2 Tone Gym + Today (built by a multi-agent workflow, reviewed, fixed)
- **Built:** `docs/tones.html` + `js/tones.js` (Basics with Taiwan tone targets and model curves, Tone ID with confusion matrix, tone-pair grid with separate identify and produce blocks, pitch mirror, sandhi rules with listening checks and a "show sandhi" switch, Taiwan readings), `js/pitch.js` (pitchy 4.1.0, live and offline pitch, normalization identical to contours.py, per-syllable scoring, overlay), `js/drills.js` (contrast / tone ID / pair ID / mirror / shadow-line drills, shared by Lab, Tone Gym and Today), Today (`js/home.js`: Phase 0 routine, four-step timed pronunciation session, Anki checkbox, log outside time). Content: `content/tones/sandhi.json` (85 items), `taiwan-readings.csv` (38 rows from §6.5), `pairs.csv` (119 words, 20 core). Build: `docs/data/tones.json`, `moe.spoken()` (§6.4 sandhi), `tools/test_spoken.py` (169 cases).
- **Data:** 1442 MOE clips, Tone ID pool 527 syllables, docs/ 340 MB of 600 MB.
- **Review:** 7 reviewers, 3 skeptics per finding; 33 findings confirmed (some duplicates), all fixed by file group with independent checks. Main fixes: the mirror score now separates wrong tones (wrong-tone medians 0–41 vs right 90–96; it was 74–86 vs 87–95); the Tone ID pool skips characters read in a rare way (沒→末, 的→弟, 個→各, 給→幾); daily focus follows §8.6 (in below 80 %, out at 85 %); MOE-only audio is asserted in code (§10 item 5); focus and contrast fixes; 一 at the end of 之一 / 統一 keeps its tone, 同一個 takes sandhi.
- **一 / 不 recordings:** the build measures whether each 一 / 不 word's MOE recording says the taught tone. The announcer reads 一 level before T1/T2/T3 in 一天 一些 一般 一時 一起 一點 (not the ㄧˋ of §6.4), and 不 is unclear in 撐不住 行不通 小不點; those stay on the page as examples with a note and are left out of the listening checks and the mirror (一 check: 7 words, 不 check: 12).
- **Only one human voice exists** (the MOE announcer), so §6.7's adaptive variability cannot switch voices yet; the Today and Lab contrast drills say so.
- **Known limits:** creaky low T3s score lower in both trackers (水果 ~62 for a perfect copy); 弟弟's model curve is wrong (self-test 15); the browser pane cannot use the microphone or register the service worker, so the mic path was tested with a fake stream of MOE clips.
- **Still needs Amadeus:** the pitch mirror on the iPhone and the laptop (M2's done-when), and the §10.4 spot-listen.

### 2026-10-16 · M3 Shadowing (workflow build, review, two fix rounds)
- **Built:** `docs/shadow.html` + `js/shadow.js` (guided protocol: listen ×3 → mumble ×2 → shadow with script ×2 → blind ×2 → record and compare → self-rate; timed 5/10/15-min sessions; sentence bank; MOE dictionary readings with segment chips and A–B loop; native-check hand-off; weekly dose), `js/player.js` (pitch-preserving `<audio>` player, exact range ends, loops with a 1.2× pause, A–B), `tools/entries.py` (簡編本 entry text), segment detection and segment contours. Today's Shadowing block is live. Content: 102 original sentences (`content/shadowing/sentences.csv`, gTTS, labelled TTS) and 111 MOE dictionary readings (`moe-readings.csv`, whole-entry recordings, text shown unmodified with the attribution). The MOE 使用說明 travels with the data (`docs/data/moe-license-concised.txt`, §7.5).
- **Measured:** range ends within 22 ms, slowed playback keeps pitch, a full 10-minute session runs at 375 px and desktop.
- **Review fixes:** native check follows the newest take; 便當 (lunch box) is ㄅㄧㄢˋ ㄉㄤ everywhere (˙ㄉㄤ is the "convenient" sense); 6 readings whose recordings do not read their displayed example were replaced; weekly dose = sessions of ≥ 10 min WITH self-recording on both pages; screen readers hear each step once, not every play; one set of step names; 44 px controls; a segment pitch curve is published only if it passes a sanity gate (36 of 422 dropped).
- **Still needs Amadeus:** one real-microphone shadowing session on the iPhone.

### 2026-10-16/17 · M4 Plan + Library, M5 Units, M6 Advanced + Settings (parallel workflows, one combined review)
- **Built:** Library (`library.html`: TBCL L1–4 words with CC-CEDICT glosses and streamed MOE audio, grammar G001–G241 written in our own words with 3+ examples and a common mistake each, patterns, measure words, Taiwan vs Mainland (§5.8 pairs only), phrasebook, 成語, radicals, notes, mistakes; search by characters, Zhuyin with or without tones, pinyin, English), Plan (`plan.html`: roadmap, hours and pace, the placement check with a pronunciation diagnostic, level checks), Units (`units.html`: 16 units L1-01–L2-08 set in Pingtung), Advanced (`advanced.html`: reading and listening ladders, grammar depth, characters, output tasks with monthly monologue, register and 成語, TOCFL prep), Settings and Credits (`settings.html`: display options applied app-wide, immersion mode, voice and speed, mic test, export / import / reset, credits with the MOE 使用說明 and the CC-CEDICT notice). Today now runs the unit and review blocks.
- **Data:** 2889 library words, grammar 241, units 16; docs/ 412 MB of 600 MB; build verifier 3,466 strings, 0 failures.
- **Verifier:** walks every zh/zhuyin field shape; particle readings in sentences are ok; sentence segmentation prefers TBCL words over rare MOE-only ones (每天都, 我要買 pass; 銀行 ㄒㄧㄥˊ still fails). 過 ˙ㄍㄨㄛ stays a failure (no source lists it; nothing uses it).
- **Review:** 29 findings confirmed (two skeptics each), all fixed: wrong readings from mis-split words, 便當 again, 累 ㄌㄟˋ, near-copies of TBCL example sentences rewritten (24 → 0), immersion no longer hides learning content (class `lc-en`), voice / speed / study-days settings applied, license notices and a build-time license check for every published file, unplayable MOE ids published as null (labelled browser voice).
- **Known:** 6 MOE clips and 9 streamed clips are not on the moedict CDN; their entries use the labelled browser voice.

### 2026-10-17 · PUBLISH
- Amadeus approved creating the public repo. Created github.com/Ameriwan/mandarin-study (public), pushed main, GitHub Pages from /docs. Live: https://ameriwan.github.io/mandarin-study/ (all pages, data and audio return 200).
- M7 polish done: proper ㄅ app icons (192, 512, maskable, Apple touch icon), README rewritten. The final §10 QA workflow was stopped before it reported; run `CHECK` to finish it (offline test in headless Edge, axe audit, code review).

- M7 QA fixes (2026-10-17): decoded-clip cache capped at 6 (memory), stopped clips no longer start after decoding, a recording that ends by itself is kept and resets its button, monologue Record ignores double taps, service worker falls back to cache after 4 s on a stalled connection, focused controls clear the mobile tab bar. Remaining QA findings are listed for CHECK.
