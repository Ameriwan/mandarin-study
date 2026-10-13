# PROGRESS

Build plan: `MASTER_PROMPT.md` §11. One row per milestone; the log below records each session.

| # | Milestone | Status | Done when |
|---|---|---|---|
| M0 | **SETUP** (folders, venv, git, data cache, tool checks) | ✅ 2026-10-13 | Data cached, tools probed, settings filled in |
| M1 | SETUP + audio pipeline + Zhuyin Lab (symbols, syllable grid, contrasts, dictation) | ⬜ | Tap any syllable → correct MOE audio in all tones; contrast drills work |
| M2 | Tone Gym (ID, tone pairs, pitch mirror, sandhi, Taiwan readings) + Today (pronunciation block) | ⬜ | Pitch overlay works on phone and laptop |
| M3 | Shadowing (player, protocol, MOE dictionary readings, native-check hand-off) | ⬜ | A full 10-minute session runs |
| M4 | Plan + placement check + Library (TBCL L1–3, grammar, Taiwan vocab) | ⬜ | Placement gives a level and a starting unit |
| M5 | Units for my level and the next (subagents, verified) | ⬜ | Units released per the plan |
| M6 | Advanced tracks + resources + immersion mode | ⬜ | Links checked; reading ladder works |
| M7 | Polish + accessibility + PUBLISH (ask first) | ⬜ | Live site works on my phone |

## Settings

- Filled in 2026-10-13: GOAL = TOCFL Band B as fast as possible · PHONE = iPhone · PUBLIC_REPO_OK = yes · OBSIDIAN_EXPORT = yes
- Still blank (optional): `NATIVE_CHECKER`

## Open issues

- **簡編本 vs 修訂本 readings differ** for 4 items in §6.5: 癌症 (簡 ㄞˊ ㄓㄥˋ / 修 ㄧㄢˊ ㄓㄥˋ), 成熟 (簡 ㄕㄡˊ / 修 ㄕㄨˊ), 認識 (簡 ㄕˋ / 修 ˙ㄕ), 癌 (簡 ㄞˊ / 修 ㄧㄢˊ, 又音 ㄞˊ). The MOE *audio* follows the 簡編本. §6 says treat it as source of truth, so the app teaches §6 and the verifier logs these as ⚑ warnings; ask Amadeus if he wants the audio reading instead.
- **TBCL Zhuyin conventions differ from MOE:** TBCL prints the 一/不 sandhi (一定 ㄧˊ ㄉㄧㄥˋ), full tones where MOE has neutral (晚上 ㄕㄤˋ vs ˙ㄕㄤ), the dot after the syllable in 的 (ㄉㄜ˙), slash variants (爸爸/爸, 和1 ㄏㄢˋ / ㄏㄜˊ). The verifier must normalize these and treat tone-only differences as warnings (§9.3), never failures.
- The 解詞造句 PDF (§8.7) is not on the TBCL downloads page; only its technical report is. Skipped.

## Log

### 2026-10-13 · SETUP
- Created folder structure (§9.1), `.gitignore`, `.gitattributes`, `README.md`, `update-site.cmd`, `git init -b main`.
- Added `mandarin-site` (port 8782, serves `mandarin-study/docs`) to `~/.claude/launch.json`.
- Venv: `.venv` from the uv-managed CPython 3.11.15 (same base as english-lessons). Python 3.12 is not installed, so `librosa` is pinned `<1.0` (0.10.x supports 3.11).
- Data cached in `.cache/` via `tools/fetch.py` (52 files, all verified): MOE 簡編本 audio-id map (39,738 keys; 6,634 single characters → 1,253 toned syllables over 440 bases; 20 neutral-tone syllables, exactly as §7.2 says), MOE 簡編本 xlsx (45,178 rows, 2026-09-29 release) and 修訂本 xlsx (163,909 rows) plus g0v `dict-revised.json.xz` (161,194 entries), the two MOE license PDFs, the 37 handbook WAVs + materials zip (250 files), TBCL 詞語表 (14,452 words with Zhuyin+pinyin), 漢字表 (3,100), 語法點表 (496), 類詞綴表 (73), TOCFL 8000 zip, CC-CEDICT.
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
