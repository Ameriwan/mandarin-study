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

## Required attribution (goes on the Credits page)

- MOE 簡編本: 「中華民國教育部（Ministry of Education, R.O.C.）。《國語辭典簡編本》（版本編號：<version>）網址：http://dict.concised.moe.edu.tw/」 plus the unmodified MOE 使用說明.
- MOE 修訂本: per `reviseddict_10312.pdf`.
- MOE 注音符號手冊 audio: CC BY 4.0, 教育部.
- TBCL: 國家教育研究院 (NAER), 臺灣華語文能力基準.
- CC-CEDICT: CC BY-SA 4.0, MDBG.
- Libraries: pitchy 4.1.0 (MIT), Noto Sans/Serif TC (OFL), gTTS 2.5.4 (MIT), edge-tts (LGPLv3, build only), imageio-ffmpeg, librosa (ISC).

## Research cited in §6

See `MASTER_PROMPT.md` Appendix A for DOIs (Wang et al. 1999/2003, Perrachione 2011, Chun 2015, Foote & McDonough 2017, Baese-Berk & Samuel 2016, Pelzl 2019, Uchihara 2024; Kubler 1985, Fon & Chiang 1999, Huang 2017).

## Verified on this machine (2026-10-13)

- moedict API `https://www.moedict.tw/a/馬.json` → 200, JSON with audio ids.
- `https://r2-assets.moedict.tw/audio/a/0534.ogg` → 200, audio/ogg, 29,380 bytes.
- MOE handbook `html_ch/audio/F1.WAV` → 200, 147 KB WAV.
