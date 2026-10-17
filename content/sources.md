# Sources and licenses

Every external source the build or the content uses, with its license and attribution text.
Pronunciation facts in `MASTER_PROMPT.md` §6 were checked against the MOE dictionaries on 2026-10-13.

## Data cached in `.cache/` (gitignored, never committed)

| Source | File(s) | License | Use |
|---|---|---|---|
| MOE 國語辭典簡編本 audio-id map (g0v/moedict-data) | `moe-data/dict-concised.audio.json` | data: CC BY-ND 3.0 TW (MOE); conversion by g0v | maps `字.注音` → moedict audio id |
| MOE 國語辭典簡編本 text (official 2026-09-29 release) | `moe-data/dict_concised_2014_20260929.zip` | CC BY-ND 3.0 TW | entry text for shadowing readings; verifier |
| MOE 重編國語辭典修訂本 (g0v/moedict-data, and the official 2026-09-29 zip) | `moe-data/dict-revised.json.xz`, `moe-data/dict_revised_2015_20260929.zip` | CC BY-ND 3.0 TW (see `reviseddict_10312.pdf`) | verifier: readings, 又音/語音/讀音 |
| MOE 國語注音符號手冊 (2017) | `moe-juyin/F1.WAV … F37.WAV`, `bopomofo_materials_20170213.zip` | audio/SVG/XML: CC BY 4.0; text: CC BY-ND 3.0 TW | the 37 symbol recordings |
| MOE announcer audio via moedict CDN | `moe-audio/<id>.ogg` | CC BY-ND 3.0 TW | headword spans, contours (whole files only, never trimmed) |
| TBCL 臺灣華語文能力基準 (NAER) | `tbcl/14452詞語表202504.xlsx`, `tbcl/漢字表_111-09-20.xlsx`, `tbcl/語法點表_112-01-04.xlsx`, `tbcl/類詞綴表_20250429.xlsx` | "All rights reserved" (coct.naer.edu.tw); NAER open-data declaration allows reuse with credit | levels, Zhuyin column, grammar point list — publish only the fields the app needs |
| TOCFL 華語八千詞 (SC-TOP) | `tocfl/8000zhuyin_202409.zip` | "All rights reserved" | optional cross-check only |
| CC-CEDICT (MDBG) | `cedict/cedict_1_0_ts_utf-8_mdbg.zip` | CC BY-SA 4.0 | English glosses (derived glosses file is BY-SA); Mainland readings for §6.5 comparison only — **never** a Zhuyin source |
| MOE 成語典 (official 2026-09-29 release) | `moe-data/dict_idioms_2020_20260929.zip`, its 使用說明 `moe-data/idiomsdict_10409.pdf` / `.odt` (as text: `moe-data/moe-license-idioms.txt`) | CC BY-ND 3.0 TW | idiom story, meaning and usage for the Advanced page's 成語 (Band B+), format conversion only (`tools/chengyu.py`) |

## Published files (`docs/data/`) and their licenses

What the site redistributes, and under which terms. A new published data file gets a row here before it ships.

| File | Contains | License / terms |
|---|---|---|
| `moe-license-concised.txt` | the MOE 使用說明 of the 國語辭典簡編本, byte for byte from `content/moe-license-concised.txt` (never edited) | MOE's own terms; travels with every file that carries 簡編本 text or audio (their `license.path` points to it) and is shown in full on the Credits page |
| `moe-license-idioms.txt` | the MOE 使用說明 of the 成語典 (`idiomsdict_10409`), as text, unmodified | MOE's own terms; travels with `chengyu.json` |
| `cedict-license.txt` | CC-CEDICT's header notice, unchanged from the release used, plus our note of the changes made to the glosses (CC BY-SA 4.0 §3(a)(1)(B)) and the list of the files that carry them | the CC BY-SA 4.0 notice; travels with `library-words.json`, `search.json`, `placement.json` and `characters.json` (their `license.path` points to it) |
| `chengyu.json` | the 成語典 entries listed in `content/library/chengyu.csv`: idiom, Zhuyin, meaning, story, usage, exactly as MOE wrote them | CC BY-ND 3.0 TW: unmodified, with the 成語典 attribution next to the text |
| `library-words.json` | TBCL words with level and topic (情境), Zhuyin (TBCL/MOE, base tones), pinyin (`tools/pinyin.py`), **English glosses from CC-CEDICT** | the glosses make this file **CC BY-SA 4.0** (it says so in its `license` field); TBCL fields credited to NAER |
| `search.json` | the search index: headword, Zhuyin, pinyin and the lowercased English gloss of every Library entry | CC BY-SA 4.0 (it carries the CC-CEDICT glosses); TBCL fields credited to NAER |
| `placement.json` | our placement questions and diagnostic list, plus `vocab_l5` (TBCL level-5 words with Zhuyin and a CC-CEDICT gloss) | our writing; the `vocab_l5` glosses are CC BY-SA 4.0 |
| `grammar.json` | TBCL grammar points: **only** the point's short name and level from 語法點表, plus our own explanations, patterns, examples and "common mistake" lines | TBCL fields credited to NAER ("All rights reserved": only these fields are published); the rest is our writing |
| `patterns.json`, `measure-words.json`, `taiwan-vs-mainland.json`, `phrasebook.json` | our own patterns, measure-word notes, Taiwan-vs-Mainland usage notes and phrases | our writing |
| `my-mistakes.json` | the learner's correction log from `content/library/my-mistakes.csv` (date, wrong and right sentence, Zhuyin, why, pattern id) for the Library's My mistakes tab; an empty list while nothing is logged | our writing |
| `units.json`, `units-index.json` | the 16 units (dialogues, vocabulary, tasks, culture notes), TBCL word levels, TTS audio paths | our writing; TBCL levels credited to NAER; TTS clips labelled (gTTS) |
| `plan.json` | the §8.1 phases (can-do goals, units, grammar levels, milestone checks) and `released_units` | our writing; TBCL / TOCFL level names and the CEFR mapping credited to NAER / SC-TOP |
| `reading.json`, `advanced.json` | graded reading texts, journal prompts, monologue topics, role-play scripts, register pairs, news vocabulary, letter and LINE models | our writing; TTS clips labelled (gTTS) |
| `characters.json` | the Advanced page's character and radical lists: TBCL 漢字表 character and level only; the 214 Kangxi radicals as the MOE 國語辭典簡編本 部首字 column files characters, with stroke counts and readings from the MOE dictionaries; **each radical's English meaning from CC-CEDICT** (modified: the radical character's gloss, cut short) | the meanings make this file **CC BY-SA 4.0** (it says so in its `license` field; CC-CEDICT's notice in `cedict-license.txt`); TBCL fields credited to NAER; radical list, strokes and readings credited to MOE |
| `resources.json` | external links with their check date and HTTP status | links only, nothing copied (§5.8) |
| `meta.json` | the build date, the MOE export versions and the content counts | our own build metadata |
| `tones.json`, `shadowing.json`, `audio.json`, `contours.json`, `contrasts.json`, `pairs.json`, `symbols.json`, `syllables.json` | M1–M3 data: MOE readings and clip ids, measured spans and pitch contours, our sentences and drills, the Taiwan readings with their Mainland pinyin | 簡編本 text and audio: CC BY-ND 3.0 TW with `moe-license-concised.txt`; handbook audio: CC BY 4.0; Mainland readings from CC-CEDICT: CC BY-SA 4.0; our writing otherwise |
| `docs/audio/moe/*`, `docs/audio/juyin/*`, `docs/audio/tts/*` | whole MOE clips (never trimmed), the 37 handbook recordings, gTTS sentence audio | CC BY-ND 3.0 TW / CC BY 4.0 / gTTS output, labelled TTS; edge-tts output is never published |

## Original content (written for this app)

Our own writing, checked against the content rules (§9.2): no third-party text is copied into these files; Zhuyin
in them comes from TBCL / MOE through the verifier (§9.3), English glosses we did not write come from CC-CEDICT and
are marked as such where published.

- Tones: `content/tones/sandhi.json`, `pairs.csv`, `taiwan-readings.csv` (the Mainland column from CC-CEDICT)
- Shadowing: `content/shadowing/sentences.csv`, `moe-readings.csv` (a list of MOE entries to read; the text itself comes from the 簡編本)
- Library: `content/library/grammar/L1.json`, `L2a.json`, `L2b.json`, `L3a.json`, `L3b.json`, `L3c.json` (explanations, examples, common mistakes; the TBCL point name and level only), `patterns.csv`, `measure-words.csv`, `taiwan-vs-mainland.csv`, `phrasebook.csv`, `my-mistakes.csv`, `chengyu.csv` (a selection list: idiom + level; the idiom texts are MOE's)
- Placement: `content/placement/questions.json`, `diagnostic.json`
- Units: `content/units/L1-01.json` … `L1-08.json`, `L2-01.json` … `L2-08.json`; the plan: `content/plan.json`
- Reading and output: `content/reading/L1.json` … `L4.json`, `content/advanced/prompts.json`, `content/advanced/register.json`
- Links: `content/resources.json` (URLs and our descriptions only)
- The MOE 使用說明 file `content/moe-license-concised.txt` is **not** ours: it is MOE's text, kept unmodified and published as is.

## Required attribution (goes on the Credits page)

- MOE 簡編本: 「中華民國教育部（Ministry of Education, R.O.C.）。《國語辭典簡編本》（版本編號：<version>）網址：http://dict.concised.moe.edu.tw/」 plus the unmodified MOE 使用說明.
- MOE 修訂本: per `reviseddict_10312.pdf`.
- MOE 注音符號手冊 audio: CC BY 4.0, 教育部.
- TBCL: 國家教育研究院 (NAER), 臺灣華語文能力基準.
- CC-CEDICT: CC BY-SA 4.0, MDBG (https://www.mdbg.net/chinese/dictionary?page=cc-cedict). Four published files carry its glosses, modified (entries chosen for the Taiwan reading, senses selected, reordered and cut short), and are shared under CC BY-SA 4.0: `library-words.json`, `search.json`, `placement.json` (the `vocab_l5` glosses) and `characters.json` (the radical meanings). CC-CEDICT's notice and our note of the changes travel as `cedict-license.txt`. The Mainland pinyin in `tones.json` (`readings[].mainland`) is also taken from CC-CEDICT.
- MOE 成語典: 「中華民國教育部（Ministry of Education, R.O.C.）。《成語典》（版本編號：2020_20260929）網址：http://dict.idioms.moe.edu.tw/」 plus its unmodified 使用說明 (`docs/data/moe-license-idioms.txt`); CC BY-ND 3.0 TW, so the idiom texts are shown exactly as MOE wrote them.
- TBCL fields published (word, level, 情境 topic; grammar point name and level; 漢字表 character and level): 國家教育研究院 (NAER), 臺灣華語文能力基準. Never TBCL's example sentences or frequency columns.
- Libraries: pitchy 4.1.0 (MIT), Noto Sans/Serif TC (OFL), gTTS 2.5.4 (MIT), edge-tts (LGPLv3, build only), imageio-ffmpeg, librosa (ISC).

## Research cited in §6

See `MASTER_PROMPT.md` Appendix A for DOIs (Wang et al. 1999/2003, Perrachione 2011, Chun 2015, Foote & McDonough 2017, Baese-Berk & Samuel 2016, Pelzl 2019, Uchihara 2024; Kubler 1985, Fon & Chiang 1999, Huang 2017).

## Verified on this machine (2026-10-13)

- moedict API `https://www.moedict.tw/a/馬.json` → 200, JSON with audio ids.
- `https://r2-assets.moedict.tw/audio/a/0534.ogg` → 200, audio/ogg, 29,380 bytes.
- MOE handbook `html_ch/audio/F1.WAV` → 200, 147 KB WAV.
