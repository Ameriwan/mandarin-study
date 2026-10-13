# Taiwan Mandarin Self-Study App: Master Prompt (100% free)

> **How to use it**
> - **Recommended:** keep this file in `C:\Users\Amadeus\mandarin-study\`, open a Claude Code session in that folder, and start with:
>   `Read MASTER_PROMPT.md and follow it. SETUP`
>   Then give one command at a time (§4), for example `BUILD`, `CONTENT units L2`, `WEEKLY` or `STATUS`.
> - **Paste mode:** copy this whole file into a new Claude Code session opened in an empty folder, then type `SETUP`.
> - Rename this file to `CLAUDE.md` if you want it loaded automatically every session.
>
> The pronunciation facts in §6 were researched and checked against the 教育部 MOE dictionaries on 2026-10-13. Treat them as the source of truth. Don't "fix" them from memory.

---

## 0. My settings (fill in once)

```
MY_NAME:              Amadeus
NATIVE_LANGUAGE:      English (American)
GITHUB_USERNAME:      Ameriwan
REPO_NAME:            mandarin-study
SITE_URL:             https://ameriwan.github.io/mandarin-study/
PROJECT_FOLDER:       C:\Users\Amadeus\mandarin-study
WHAT_I_KNOW:          I learned all of Zhuyin (ㄅㄆㄇㄈ), but my pronunciation and tones are slipping
CURRENT_LEVEL:        unknown            # the app's placement check sets this
GOAL:                 TOCFL Band B as fast as possible   # prioritise vocab/grammar coverage; units still set in Pingtung daily life
DAILY_MINUTES:        30
STUDY_DAYS_PER_WEEK:  6
PHONE:                iPhone             # Safari/iOS: ship mp3 alongside MOE ogg, test mic on iOS
ROMANIZATION:         zhuyin             # pinyin hidden by default, toggle in Settings
ANKI:                 I already have my own decks → NO flashcard / SRS / deck-export features
PUBLIC_REPO_OK:       yes                # public repo OK; create at PUBLISH, nothing pushed until I say so
NATIVE_CHECKER:       ______             # optional: a Taiwanese friend who can rate my recordings
OBSIDIAN_EXPORT:      yes                # WEEKLY writes a note into C:\Users\Amadeus\Desktop\Hermes Vault\Mandarin\
```

If a setting is blank when a command needs it, ask me. Don't guess.

---

## 1. Your role

You are my **Mandarin study-app engineer and curriculum designer**. Build and maintain a free static web app that works on my phone and laptop, for **self-study of Taiwan Mandarin (國語)**: Traditional characters (`zh-Hant-TW`), **Zhuyin first**, MOE (教育部) readings and Taiwan vocabulary.

The app does three jobs:

1. **Pronunciation & tone lab.** Rebuild my slipping Zhuyin pronunciation and tones using **native Taiwan audio I can shadow**, pitch-contour feedback and drills backed by research (§6).
2. **Study plan.** A level-by-level roadmap from my current level to advanced (TBCL / TOCFL), turned into a concrete daily routine that adapts to my progress (§8).
3. **Database.** A searchable library of words, grammar points, sentence patterns, Taiwan usage notes, readings and my own notes and mistakes, all with audio (§5.6).

Its architecture should match my existing English-lessons site at `C:\Users\Amadeus\english-lessons`. Read its `README.md`, `tools/build.py` and `docs/js/app.js` for the patterns: a `content/` folder, a build script, `docs/` served by GitHub Pages and `update-site.cmd`. **Never modify that project.**

---

## 2. Ground rules (always apply)

1. **Free only.** No paid APIs, credit cards, trials or paid domains. If a step would cost money, stop and tell me.
2. **Taiwan standard.** Use Traditional characters, MOE readings (《重編國語辭典修訂本》 / 《國語辭典簡編本》) and Taiwan words (捷運, 計程車, 機車, 便當, 軟體, 網路, 品質 …). Set `lang="zh-Hant-TW"` on all Chinese text so fonts render Taiwan-standard glyphs.
3. **Never invent pronunciation or language facts.** The build must check every Zhuyin string in `content/` against MOE data (§9.3). Anything not in §6 needs a cited source in `content/sources.md`.
4. **No flashcards.** No SRS, no Anki export and no deck features. Quizzes and drills inside lessons are fine. "Anki reviews (my decks)" may appear only as a checkbox in the daily routine.
5. **Audio honesty.** Every clip is labelled with its source, either *MOE human voice* or *TTS (voice name)*. **Tone drills and syllable drills use human audio only** (§7).
6. **Licenses.** Follow §7.5 exactly. A Credits page lists every source and its license.
7. **Ask me before you:** create the GitHub repo, make it public, push, delete files or repos, or install anything system-wide (winget, global npm or pip).
8. **Python:** use the project's own venv at `mandarin-study\.venv`. **Never `pip install` into the default `python`**, which is my Hermes agent's environment. Installing gTTS there once downgraded `click`.
9. **Privacy.** My recordings stay on my device (IndexedDB). Nothing is uploaded anywhere.
10. **Keep it calm and simple.** Use clean, readable layouts, and limit gamification to a streak and minutes studied. Offer extra features in one sentence instead of building them unasked.
11. **Work in milestones** (§11). After each one: build, test it in the built-in browser at phone and laptop sizes, show me, update `PROGRESS.md`, then continue.

---

## 3. Plugins, skills and tools (use them on purpose)

| Job | Use | Notes |
|---|---|---|
| UI look and layout | **frontend-design** plugin (Anthropic Directory) | Use it for every page you build or redesign. Avoid the generic "AI template" look. |
| Accessibility and UX copy | **Design** plugin: `accessibility-review`, `ux-copy` | Run before every `PUBLISH`, then fix what it finds. |
| Writing content in parallel | **Agent tool subagents** | **One unit or file per agent** (big batches stalled last time). Give each agent §2, §6, the schema in §9 and its exact output path. Run the verifier (§9.3) on every file it writes. |
| Research and fact checks | WebSearch / WebFetch; the **deep-research** skill for big questions | Cite in `content/sources.md`. |
| Preview and testing | **Built-in browser**: `preview_start` with the `mandarin-site` entry, `resize_window` mobile/desktop, `read_console_messages` | Test mic, recording and pitch flows by hand when you can. If the pane doesn't draw, use scripted checks (`javascript_tool`). |
| Progress charts on the Plan page | **dataviz** skill | Keep charts minimal. |
| Code quality | `/code-review` and `/simplify` | Run before `PUBLISH`. |
| Tiny edits | the `free` skill | As my CLAUDE.md says. |
| Memory | Save a short project memory: paths, commands and gotchas | Don't duplicate what's in the repo. |
| Past work | Grep `C:\Users\Amadeus\Desktop\Hermes Vault\Claude\Chats\` | Do this when I say "like last time". |

If a plugin isn't installed, tell me its name once and carry on without it.

---

## 4. Commands

| Command | What you do |
|---|---|
| `SETUP` | Create the folder structure (§9.1), the venv, `.gitignore`, `git init`, the `mandarin-site` entry in `~/.claude/launch.json` (port 8782) and `PROGRESS.md`. Download the MOE data and audio-id map (§7.2), the TBCL lists (§8.7) and CC-CEDICT into `.cache/`. Check that the tools work (imageio-ffmpeg, gTTS, edge-tts status). Ask me for any blank settings. Then propose the milestone plan. |
| `BUILD` | Run `tools/build.py` (content → `docs/data`, audio, contours, search index), then the QA in §10. Show me the build report. |
| `CONTENT <area> [level]` | Write new content with subagents, verify it, then build. Areas: `units`, `grammar`, `shadowing`, `reading`, `phrasebook`, `taiwan`, `chengyu`. |
| `LEVEL-UP` | After I pass a level check, generate the next level's units, library entries and shadowing set, and move the plan forward. |
| `WEEKLY` | Read the progress export I drop into `progress/` (it's gitignored). Summarize minutes, streak, weak contrasts and tones, and unit progress. Adjust next week's focus in `content/plan.json`. If `OBSIDIAN_EXPORT` is yes, write a weekly Markdown note to the vault. |
| `CORRECT` | I paste something I wrote or said (as a transcript). Correct it using Taiwan usage, explain each fix in English, and add the recurring errors to `content/library/my-mistakes.csv`. |
| `CHECK` | Run the QA in §10 only. |
| `PUBLISH` | Run the accessibility review, `/code-review` and the size check. Then ask me, and commit and push (GitHub Pages serves `/docs`). |
| `STATUS` | Report what's built, what's next and any open issues. |
| `FIX <problem>` | Debug and fix it, then re-run the relevant QA. |

---

## 5. The app

**Stack** (same as english-lessons):
- Static HTML, CSS and vanilla JS in `docs/`, served by GitHub Pages from `/docs`. `tools/build.py` turns `content/` into `docs/data/*.json`, and `update-site.cmd` builds, commits and pushes.
- No framework and no bundler. CDN libraries must be pinned to exact versions. The main one is `pitchy@4.1.0`, imported with `import { PitchDetector } from "https://cdn.jsdelivr.net/npm/pitchy@4.1.0/+esm"`. Avoid `pitchfinder`, which is GPL.
- **PWA:** a manifest plus a service worker, so it can be added to the home screen and works offline. Cache the app shell, and cache audio on first play.
- **State:** `localStorage` for progress and settings, and IndexedDB for recordings. Settings has **Export / Import progress (JSON)**, used to move between phone and laptop and for `WEEKLY`.

**Display rules:**
- Zhuyin goes in `<ruby>` above the characters. Write tones the Taiwan way: tone 1 unmarked, then ˊ ˇ ˋ after the syllable, and the neutral tone as ˙ *before* the syllable.
- Display toggles: Zhuyin always / only on new words / off · Pinyin off by default · English meaning on/off · **show tone sandhi** (overlays the spoken tone on the written one, §6.4).
- Tone colours are **off by default**, because contour and number cues beat colour (§6.7). They're available as an option.
- Fonts: Noto Sans TC / Noto Serif TC (Google Fonts, OFL). Optional: an OFL Zhuyin font from ButTaiwan that places Zhuyin beside characters in Taiwan style. Check its license and file size before adding it.
- Interface language: bilingual labels (中文 + English). In Settings, an **immersion switch** makes the interface Chinese-only. Suggest it once I reach Band B.

### 5.1 今天 Today (home)
- Today's routine is generated from the plan (§8) and my weak spots, with time boxes that add up to `DAILY_MINUTES`. For example: 10 min pronunciation session (§6.7) → 10–12 min current unit → 5 min shadowing → ☐ Anki (my decks) → optional native listening.
- One big "Start" button runs the blocks in order with a timer.
- Show the streak, minutes this week, the current level and phase, and the next milestone.

### 5.2 注音 Zhuyin Lab
1. **Symbol chart (37).** Show the standard order and groups. Tapping a symbol opens:
   - the MOE handbook recording for that symbol (§7.2)
   - IPA, a "how to say it" note and the typical English-speaker error (§6.1)
   - 3–4 example words with MOE audio
   - record and compare
2. **Syllable grid.** Initials × finals for every valid syllable. Tapping a cell plays tones 1–4 (and neutral when one exists), using a representative character with MOE human audio from the headword span only (§7.3). Grey out combinations with no common character.
3. **Contrast drills (HVPT).** Cover the 10 contrasts in §6.2:
   - Listen, then choose; give immediate feedback with A/B replay.
   - Add more voices as accuracy grows (§6.7).
   - Keep a per-contrast accuracy history. Weak contrasts come back automatically in Today.
4. **Dictation.** Hear a syllable or word, then type its Zhuyin and tone on an on-screen **standard Zhuyin keyboard** (標準注音 layout; physical keys mapped the same way). Show a diff of what I got wrong. This also trains Zhuyin typing (§8.5).
5. **Mouth guides.** Simple, labelled side-view SVGs for the four sibilant places: ㄐㄑㄒ (tongue tip down), ㄓㄔㄕㄖ (tongue tip up), ㄗㄘㄙ (at the teeth), plus lip rounding for ㄩ. Keep them schematic and accurate, not decorative.

### 5.3 聲調 Tone Gym
1. **Tone basics** with the Taiwan targets from §6.4. Each tone gets a contour icon and its Chao numbers, and T3 is taught as **low (21)**.
2. **Tone identification** on single syllables. **MOE human audio only.** It's adaptive and keeps a confusion matrix (T2/T3 and T1/T4 get extra weight).
3. **Tone-pair grid** of the 20 words in §6.4, in two separate blocks: identification first, then production.
4. **Pitch mirror** (the core tone tool):
   - Record myself after the model, then overlay my F0 contour on the native one.
   - Draw both as **semitones relative to each speaker's own median**, time-normalized over the voiced part, so a male or female voice doesn't matter.
   - Mark the target band for each tone, replay both, and keep my best attempt.
   - Precompute model contours at build time (§7.4) and compute mine live with pitchy.
5. **Sandhi trainer.** Drills for 3+3, half-third, 一 and 不 (§6.4), using real words and phrases.
6. **Taiwan readings.** The table in §6.5, with MOE audio, plus a "neutral tone in Taiwan" note.
7. Browser speech recognition (zh-TW) may be offered as a rough "was I understood?" check. Label it clearly: **it forgives tone errors and does not grade tones.**

### 5.4 跟讀 Shadowing
- **Sentence bank by level:** unit dialogues, sentences in the library and **MOE dictionary readings** (§7.3: whole-entry recordings of definitions and example sentences in a Taiwan announcer's voice, shown with their text).
- **Player:**
  - speed 0.75 / 0.9 / 1.0 (`playbackRate` with `preservesPitch`)
  - loop ×N, with a pause after each play sized to 1.2× the sentence length so I can repeat it
  - A–B section loop
  - hide/show text, Zhuyin and English
- **Guided protocol:** listen ×3 → mumble along → shadow with the script → shadow blind → record and compare (with the pitch overlay for short lines) → self-rate. Default dose: **at least 4 × 10 min a week** (§6.7).
- **Native check:** a hand-off screen for `NATIVE_CHECKER`. It plays my saved recordings, and they tap ✓ / ✗ for each sound and tone. The results go into my weak-spot data.

### 5.5 課程 Units
Each unit has:
- a can-do goal
- a dialogue set in Taiwan, with audio and ruby/English toggles
- a vocabulary table (word, Zhuyin, meaning, audio, TBCL level, measure word)
- 1–2 grammar points
- a pronunciation focus that links to the matching Lab contrast or tone pair
- 5–8 shadowing lines
- a comprehension check
- a speaking task (a prompt plus a recording, with a self-rating checklist)
- a writing task (typed with a Zhuyin keyboard; `CORRECT` can check it)
- a Taiwan culture or usage note

Topics are practical for **daily life in southern Taiwan (Pingtung)**, for example:

| Area | Topics |
|---|---|
| Shopping and food | 便利商店, 早餐店 ordering, 手搖飲 (甜度/冰塊), 夜市, 便當, 小吃 |
| Getting around | 機車 / 火車 / 高鐵 / 客運, asking directions |
| Health | 看醫生 & 健保卡, 藥局 |
| Errands and housing | 銀行/ATM, 郵局, renting (租房) |
| Communication | phone & LINE, weather & 颱風, small talk with neighbours |
| People and life | family, work, 拜拜 & festivals, hobbies |

Units are grouped by TBCL level. Mark each unit done or needing review.

### 5.6 資料庫 Library (the database)
- **Collections:**
  - words (TBCL-tagged)
  - grammar points
  - sentence patterns
  - measure words
  - Taiwan vs Mainland vocabulary
  - Taiwan readings (§6.5)
  - a phrasebook by situation
  - 成語 (from Band B)
  - radicals and components
  - **my notes**
  - **my mistakes** (fed by `CORRECT`)
- **Search** runs on the client, from a prebuilt index. It works on characters, Zhuyin with or without tones (`ㄇㄚ` also matches `ㄇㄚˇ`), pinyin and English.
- **Filters:** level, topic, type and status (new / learning / known / trouble).
- **Each entry page:**
  - ruby text, audio and example sentences with audio
  - my own note (stored locally)
  - which units it appears in
  - links to the MOE dictionary and moedict
  - a "say it" recorder

### 5.7 計畫 Plan and 測驗 Level checks
- The roadmap from §8 shows the phases, my current position, hours logged against target, the next milestone and a pace estimate ("at this pace you reach Level 3 around …").
- **Placement check** (run on first visit, and again any time). It is fully self-run, with no teacher:
  1. **Vocabulary sampling** for each TBCL level: 10 words per level. Answer "know / don't know", then a quick meaning check catches over-claiming.
  2. **Listening and reading** questions for each level, stopping early once accuracy drops below 50%.
  3. A **pronunciation diagnostic**: read a short passage that covers every initial, final and tone, then self-check it against the model, with an optional native check.

  The result gives my starting level, my weak contrasts and tones, and the unit I should start with.
- **End-of-phase checks** use the same format, plus links to the official TOCFL mock tests (§8.4).

### 5.8 進階 Advanced
Each track is a ladder that unlocks by level. External links go in `content/resources.json`, and `CHECK` re-tests them for HTTP status. Mark any link that isn't verified, and **never copy external content into the app**; link to it instead.

1. **Reading ladder**
   1. Graded texts I write for each TBCL level, with ruby on every word.
   2. The same texts with ruby only on words I haven't marked "known".
   3. No ruby, with tap-to-look-up in the Library.
   4. MOE dictionary entry texts (§7.3).
   5. Authentic text: 國語日報 https://www.mdnkids.com/news.asp (A2–B2; web articles are free and in full Traditional text but have **no Zhuyin online**, and only the paid print paper is annotated, so the app's tap-to-look-up does the job), then 公視新聞網 https://news.pts.org.tw (B2+, free text and video).
   6. TOCFL mock reading.
2. **Listening ladder**
   1. Unit dialogues.
   2. MOE dictionary readings at full speed.
   3. 小公視, the PTS children's channel (A2–B1).
   4. **Talk Talk Mandarin 說說話** podcast with Taiwanese hosts (B1+; transcripts via linktr.ee/ttmctw; still active in Oct 2026).
   5. 公視新聞 video (B2+).
   6. A **"real Taiwan speech"** set that trains me to *understand* the colloquial features in §6.6.
   - Beginner listening: TaiwanPlus *Legit Mando* (https://www.taiwanplus.com/shows/mandarin-learning/all/523/legit-mando). These are free short skits on everyday Taiwan phrases, with Traditional on-screen text. Check the subtitles and episode dates before linking.
   - Not verified yet; check before adding:
     - 中央廣播電臺 Rti: its homepage has no learner section, only live native radio and 央廣學院 at academy.rti.org.tw.
     - 全球華文網 HuayuWorld: needs JavaScript to load; reportedly hosts the 《學華語向前走》 series.
     - The Taiwan-hosted podcasts "Learn Taiwanese Mandarin With Miss Lin" and 台味中文.
     - PTS children's shows.
     - MOE learning portals.
   - Mandarin Corner, Chinese Zero to Hero and Slow Chinese are Mainland-oriented, so don't list them as Taiwan sources.
   - TaiwanPlus's "Mandarin Speakers" is an English-language advice series, not lessons.
3. **Grammar depth**
   - TBCL's 496 grammar points (levels 1–5), each with my own English explanation, 3+ examples, audio and a "common mistake" line.
   - Link out to Chinese Grammar Wiki for extra explanation. It's CC BY-NC-SA and in Simplified, so link only and never copy.
4. **Taiwan usage**
   - Taiwan vs Mainland word pairs. Use only these verified pairs:
     - Transport and home: 計程車/出租車, 捷運/地鐵, 公車/公交車, 機車/摩托車, 冷氣/空調
     - Food: 便當/盒飯, 泡麵/方便麵, 馬鈴薯/土豆, 番茄/西紅柿, 高麗菜/捲心菜, 優格/酸奶
     - General: 品質/質量, 資訊/信息
     - Computers and tech: 軟體/軟件, 網路/網絡, 程式/程序, 數位/數字, 滑鼠/鼠標, 列印/打印, 印表機/打印機, 隨身碟/U盤, 簡訊/短信, 部落格/博客
     - Stationery: 原子筆/圓珠筆, 立可白/修正液
   - Taiwan grammar features:
     - 有 + verb for a completed action (你有看醫生嗎？)
     - 會 meaning "will" (他會來嗎？)
     - 會 + adjective in questions (你會不會熱？)
     - 幫忙 + object (我幫忙他)
     - the particles 啦 / 齁 / 喔 / 欸
     - 不錯吃
   - The 給 passive is the *Mainland* pattern. Don't teach it as a Taiwan feature.
5. **Characters**
   - Radicals and components, and the character list for each TBCL level.
   - **Stroke order:** link every character to the MOE stroke-order page (https://stroke-order.learningweb.moe.edu.tw/, one page per character via `searchW.jsp?WORD=<字>`). Its animations are BY-NC-ND, so link only, never copy.
   - Hanzi Writer 3.7.3 (MIT; data under the Arphic license) is optional, and only with a visible warning that it uses **Mainland stroke order**. Its known differences from Taiwan are 戈 成 必 里 再 母 馬 忄(情 慢) 說 青 之 及. Show the MOE link right next to it.
6. **Writing and speaking output**
   - Journal prompts for each level, typed with Zhuyin and checked with `CORRECT`.
   - Monthly 1-minute monologues (§8.3).
   - A role-play script bank for real situations in Pingtung (clinic, landlord, mechanic, market).
7. **Register and idioms (Band B+)**
   - 書面語 vs 口語 pairs, news vocabulary, formal letters and LINE messages.
   - 成語 with their story and usage, sourced from the MOE 成語典 (CC BY-ND, unmodified).
8. **TOCFL preparation:** official mock tests, timed, by band (§8.4).
9. **Immersion mode:** the Chinese-only interface (§5).
10. *Optional, ask me first:* a Taiwanese Hokkien (台語) awareness module with common words I'll hear in Pingtung. Research its sources first (e.g. the MOE 臺灣台語常用詞辭典) before building anything.

### 5.9 設定 Settings and Credits
- Display toggles, voice preference, default speed, mic test, immersion switch, export/import/reset.
- A **Credits & licenses** page with every source, its license, the required attribution text and the MOE 使用說明 (§7.5).

---

## 6. Pronunciation reference (pre-verified source of truth)

These facts were checked against MOE 《重編國語辭典修訂本》 (2021 edition) and the phonetics literature on 2026-10-13. ⚠ marks a point that is still uncertain. Use this section for the Lab and Tone Gym text and for all drill content.

### 6.1 The symbols (IPA in Taiwan standard, how to say it, typical English-speaker error)

| Zhuyin | IPA | How to say it | Typical error |
|---|---|---|---|
| ㄅ | p | p as in *spin*: no puff of air | voicing it into *b* |
| ㄆ | pʰ | strong puff (a paper strip in front of your lips flutters) | puff too weak, so it sounds like ㄅ |
| ㄇ / ㄈ | m / f | as in English | — (Taiwan colloquial ㄈ→[ɸ]/ㄏ: understand it, don't copy it) |
| ㄉ | t | tongue tip on the ridge behind the upper teeth, no puff | — |
| ㄊ | tʰ | ㄉ plus a strong puff | the American flap between vowels (*butter*) |
| ㄋ / ㄌ | n / l | clear *l* (Taiwan *l* can be close to [ɾ]) | dark *l*; mixing up n and l |
| ㄍ / ㄎ | k / kʰ | k as in *skin* / k plus a strong puff | weak puff on ㄎ |
| ㄏ | x ~ h | light friction at the soft palate | harsh "loch" scrape; a lighter [h] is normal in Taiwan ⚠ |
| ㄐ / ㄑ / ㄒ | tɕ / tɕʰ / ɕ | tongue **tip down** behind the lower teeth, blade raised to the hard palate, lips spread (smile) | English j/ch/sh with rounded lips |
| ㄓ / ㄔ / ㄕ | ʈʂ / ʈʂʰ / ʂ | tongue **tip up** just behind the gum ridge, lips neutral | English j/ch/sh, or merging into ㄗㄘㄙ |
| ㄖ | ʐ ~ ɻ | the ㄕ position plus voice, little friction, **no lip rounding** | English rounded r [ɹʷ] |
| ㄗ / ㄘ / ㄙ | ts / tsʰ / s | "ts" as in *cats*, voiceless / with a strong puff / plain s | voicing ㄗ into English *z* |
| ㄧ / ㄨ | i (j) / u (w) | tense "ee" / tight-lipped "oo" | a lax or too-forward "oo" |
| ㄩ | y (ɥ) | hold "ee", then round the lips without moving the tongue | saying "yoo" [ju], or a plain ㄧ |
| ㄚ | a (ɑ in ㄠ ㄤ; ɛ in ㄧㄢ ㄩㄢ) | "ah" | — |
| ㄛ | o ~ ɔ | a steady rounded o with no glide | English "oh" [oʊ], which sounds like ㄡ |
| ㄜ | ɤ | tongue placed as for "oh", lips **spread** | English "uh" [ʌ] or "er" |
| ㄝ | e ~ ɛ | a steady *e* as in *bet* (in ㄧㄝ, ㄩㄝ) | gliding into "ay" |
| ㄞ ㄟ ㄠ ㄡ | ai, ei, ɑu, ou | eye / ay / ow / oh | merging ㄡ with ㄛ |
| ㄢ / ㄤ | an / ɑŋ | open "ahn" ending with the tongue tip on the ridge / "ahng" | *ban* [æn] / *bang* [æŋ] |
| ㄣ / ㄥ | ən / əŋ | close with the tongue tip / close with the back of the tongue | merging the two |
| ㄦ | ɚ (Taiwan) | an American "er" | — |

**Special cases (Zhuyin makes these visible; pinyin hides them):**
- **Empty rhyme ㄭ** is never written. After ㄓㄔㄕㄖ it is [ɻ̩]: hold the ㄖ position and voice it. After ㄗㄘㄙ it is [ɹ̩ ~ z̩]: buzz in the ㄙ position. *Error:* saying "ee" (reading pinyin *shi* as "she") or adding a schwa.
- **ㄧㄡ** = [jou]; the o is clearest on T3/T4 (pinyin *-iu*). **ㄨㄟ** = [wei] (pinyin *-ui*, which learners say as "wee"). **ㄨㄣ** = [wən] (pinyin *-un*, which learners say as "oon").
- **ㄧㄢ** = [jɛn] ("yen", not "yahn"). **ㄩㄢ** = [ɥɛn] (not "wan").
- **ㄨㄥ** = [ʊŋ] after a consonant and [wəŋ] on its own (翁). It is not English "-ong".
- **ㄧㄥ vs ㄧㄣ:** ㄧㄥ [iŋ] (often with a slight [ᵊ] glide) closes with the back of the tongue. ㄧㄣ [in] closes with the tongue tip.
- **ㄅㄛ ㄆㄛ ㄇㄛ ㄈㄛ** ⚠: the standard writes no ㄨ, but a brief rounded on-glide [pʷo] is normal. Teach [po] with only a light glide. Taiwan colloquial speech often turns it into a full ㄅㄨㄛ (博 said as ㄅㄨㄛˊ); understand that, don't copy it.
- The 2017 MOE 《國語注音符號手冊》 covers shapes, stroke order and typesetting, not articulation. It confirms that ㄭ is the 空韻 and is left unwritten, and that the neutral-tone dot marks a "較輕短之變調".

### 6.2 Hardest contrasts for English speakers (ranked; every pair is MOE-verified)

| # | Contrast | Minimal pairs |
|---|---|---|
| 1 | **Tones** (especially T2/T3 and T1/T4) | 湯ㄊㄤ / 糖ㄊㄤˊ / 躺ㄊㄤˇ / 燙ㄊㄤˋ · 埋ㄇㄞˊ / 買ㄇㄞˇ / 賣ㄇㄞˋ · 魚ㄩˊ / 雨ㄩˇ · 湖ㄏㄨˊ / 虎ㄏㄨˇ · 物理ㄨˋ ㄌㄧˇ / 無理ㄨˊ ㄌㄧˇ · 睡覺ㄕㄨㄟˋ ㄐㄧㄠˋ / 水餃ㄕㄨㄟˇ ㄐㄧㄠˇ |
| 2 | ㄐ / ㄓ / ㄗ | 雞ㄐㄧ / 知ㄓ / 資ㄗ · 居ㄐㄩ / 豬ㄓㄨ / 租ㄗㄨ · 主力ㄓㄨˇ ㄌㄧˋ / 阻力ㄗㄨˇ ㄌㄧˋ · 支援ㄓ ㄩㄢˊ / 資源ㄗ ㄩㄢˊ |
| 3 | ㄑ / ㄔ / ㄘ | 期ㄑㄧˊ / 池ㄔˊ / 詞ㄘˊ · 區ㄑㄩ / 出ㄔㄨ / 粗ㄘㄨ · 初步ㄔㄨ ㄅㄨˋ / 粗布ㄘㄨ ㄅㄨˋ · 炒ㄔㄠˇ / 草ㄘㄠˇ · 春ㄔㄨㄣ / 村ㄘㄨㄣ |
| 4 | ㄒ / ㄕ / ㄙ | 西ㄒㄧ / 師ㄕ / 絲ㄙ · 需ㄒㄩ / 書ㄕㄨ / 蘇ㄙㄨ · 詩人ㄕ ㄖㄣˊ / 私人ㄙ ㄖㄣˊ · 山ㄕㄢ / 三ㄙㄢ |
| 5 | ㄩ / ㄧ / ㄨ | 魚ㄩˊ / 姨ㄧˊ / 無ㄨˊ · 女ㄋㄩˇ / 你ㄋㄧˇ / 努ㄋㄨˇ · 旅ㄌㄩˇ / 李ㄌㄧˇ / 魯ㄌㄨˇ · 去ㄑㄩˋ / 氣ㄑㄧˋ · 下雨ㄒㄧㄚˋ ㄩˇ / 下午ㄒㄧㄚˋ ㄨˇ |
| 6 | ㄣ / ㄥ | 人民ㄖㄣˊ ㄇㄧㄣˊ / 人名ㄖㄣˊ ㄇㄧㄥˊ · 親近ㄑㄧㄣ ㄐㄧㄣˋ / 清靜ㄑㄧㄥ ㄐㄧㄥˋ · 信ㄒㄧㄣˋ / 姓ㄒㄧㄥˋ · 陳ㄔㄣˊ / 成ㄔㄥˊ · 分ㄈㄣ / 風ㄈㄥ · 金ㄐㄧㄣ / 經ㄐㄧㄥ |
| 7 | ㄜ vs "uh"; ㄨㄛ; ㄚ | 哥ㄍㄜ / 鍋ㄍㄨㄛ · 河ㄏㄜˊ / 活ㄏㄨㄛˊ · 課ㄎㄜˋ / 闊ㄎㄨㄛˋ · 喝ㄏㄜ / 哈ㄏㄚ · 餓ㄜˋ / 二ㄦˋ |
| 8 | ㄢ / ㄤ | 擔心ㄉㄢ ㄒㄧㄣ / 當心ㄉㄤ ㄒㄧㄣ · 開飯ㄎㄞ ㄈㄢˋ / 開放ㄎㄞ ㄈㄤˋ · 船ㄔㄨㄢˊ / 床ㄔㄨㄤˊ · 山ㄕㄢ / 商ㄕㄤ · 反ㄈㄢˇ / 訪ㄈㄤˇ |
| 9 | ㄖ vs English r and ㄌ | 熱ㄖㄜˋ / 樂ㄌㄜˋ · 入ㄖㄨˋ / 路ㄌㄨˋ · 讓ㄖㄤˋ / 浪ㄌㄤˋ · 容ㄖㄨㄥˊ / 龍ㄌㄨㄥˊ · 肉ㄖㄡˋ / 漏ㄌㄡˋ · 日ㄖˋ / 二ㄦˋ |
| 10 | Aspiration | 肚子ㄉㄨˋ ˙ㄗ / 兔子ㄊㄨˋ ˙ㄗ · 讀書ㄉㄨˊ ㄕㄨ / 圖書ㄊㄨˊ ㄕㄨ · 擔心ㄉㄢ ㄒㄧㄣ / 貪心ㄊㄢ ㄒㄧㄣ · 爸ㄅㄚˋ / 怕ㄆㄚˋ · 抱ㄅㄠˋ / 泡ㄆㄠˋ · 在ㄗㄞˋ / 菜ㄘㄞˋ |

The ranking is a synthesis, not an empirical result. Don't use 綠/路: MOE gives 綠 the 讀音 ㄌㄨˋ.

### 6.3 Audio reality check
In the MOE recordings, 馬 (T3) dips fully: 200 → 123 → 235 Hz. Google zh-TW TTS only falls (229 → 155 → 168 Hz). **This is why single-syllable tone work never uses TTS.**

### 6.4 Tones in Taiwan Mandarin

| Tone | Textbook (Chao 1968) | Typical Taiwan speech ⚠ (varies by speaker) | What the app teaches |
|---|---|---|---|
| T1 ˉ | 55 | 44 | high and level |
| T2 ˊ | 35 | 323 (dips early, then rises) | rising (35) |
| T3 ˇ | 214 | **21 / 31, low falling, often creaky; the final rise is rare** | **low (21).** The rise is allowed only for a syllable on its own or at the end of a phrase. |
| T4 ˋ | 51 | 52 / 53 | high falling |

Sources: Kubler 1985 (T3 is [21] "in most situations"); Fon & Chiang 1999, *JCL* 27(1); Huang 2017, *IJCL* 4(2).

**Neutral tone (輕聲) in Taiwan:**
- Taiwan speech uses it less than Beijing does.
- **MOE writes a full tone** in: 時候ㄕˊ ㄏㄡˋ · 喜歡ㄒㄧˇ ㄏㄨㄢ · 學生ㄒㄩㄝˊ ㄕㄥ · 先生ㄒㄧㄢ ㄕㄥ · 朋友ㄆㄥˊ ㄧㄡˇ · 聰明ㄘㄨㄥ ㄇㄧㄥˊ · 關係ㄍㄨㄢ ㄒㄧˋ · 事情ㄕˋ ㄑㄧㄥˊ · 清楚ㄑㄧㄥ ㄔㄨˇ · 眼睛ㄧㄢˇ ㄐㄧㄥ · 頭髮ㄊㄡˊ ㄈㄚˇ · 休息ㄒㄧㄡ ㄒㄧˊ · 消息ㄒㄧㄠ ㄒㄧˊ · 告訴ㄍㄠˋ ㄙㄨˋ.
- **MOE still writes a neutral tone** in: 認識ㄖㄣˋ ˙ㄕ · 漂亮ㄆㄧㄠˋ ˙ㄌㄧㄤ · 衣服ㄧ ˙ㄈㄨ · 舒服ㄕㄨ ˙ㄈㄨ · 麻煩ㄇㄚˊ ˙ㄈㄢ · 明白ㄇㄧㄥˊ ˙ㄅㄞ · 但是ㄉㄢˋ ˙ㄕ. Many Taiwanese speakers say these with full tones.
- The suffix 子 and repeated kinship terms (爸爸, 媽媽) are always neutral.
- **App policy:** spell words as MOE does, and accept the full-tone versions for listening.

**Sandhi:**
- **3 + 3 → 2 + 3.** Example: 水果 is said ㄕㄨㄟˊ ㄍㄨㄛˇ. This happens every time in Taiwan.
- **Half-third:** T3 before T1, T2, T4 or a neutral tone is a low 21 with no rise.
- **一:**
  - as a number or ordinal it stays ㄧ (第一, 十一)
  - before T4 it becomes ㄧˊ (一定)
  - before T1, T2 or T3 it becomes ㄧˋ (一起, 一天)
- **不:** before T4 it becomes ㄅㄨˊ (不要, 不是).
- 七 and 八 before T4: old-fashioned and optional ⚠. Don't drill it.

**How sandhi is written:**
- The MOE 修訂本 writes the **base tone** (一定 ㄧ ㄉㄧㄥˋ, 不要 ㄅㄨˋ ㄧㄠˋ, 水果 ㄕㄨㄟˇ ㄍㄨㄛˇ).
- The 簡編本 writes the base tone and adds the sandhi with "(變)".
- School textbooks often print the 一/不 sandhi directly.
- 3+3 sandhi is never written.
- **App policy:** store the base tone and use the "show sandhi" toggle to overlay the spoken tone.

**The 20 tone-pair drill words (MOE-verified):**

| 1st \ 2nd | + T1 | + T2 | + T3 | + T4 | + neutral |
|---|---|---|---|---|---|
| **T1** | 飛機 ㄈㄟ ㄐㄧ | 中國 ㄓㄨㄥ ㄍㄨㄛˊ | 身體 ㄕㄣ ㄊㄧˇ | 音樂 ㄧㄣ ㄩㄝˋ | 桌子 ㄓㄨㄛ ˙ㄗ |
| **T2** | 明天 ㄇㄧㄥˊ ㄊㄧㄢ | 銀行 ㄧㄣˊ ㄏㄤˊ | 蘋果 ㄆㄧㄥˊ ㄍㄨㄛˇ | 學校 ㄒㄩㄝˊ ㄒㄧㄠˋ | 孩子 ㄏㄞˊ ˙ㄗ |
| **T3** | 老師 ㄌㄠˇ ㄕ | 旅行 ㄌㄩˇ ㄒㄧㄥˊ | 水果 ㄕㄨㄟˇ ㄍㄨㄛˇ (said 2+3) | 考試 ㄎㄠˇ ㄕˋ | 椅子 ㄧˇ ˙ㄗ |
| **T4** | 汽車 ㄑㄧˋ ㄔㄜ | 大學 ㄉㄚˋ ㄒㄩㄝˊ | 電腦 ㄉㄧㄢˋ ㄋㄠˇ | 電話 ㄉㄧㄢˋ ㄏㄨㄚˋ | 爸爸 ㄅㄚˋ ˙ㄅㄚ |

Add more words for each cell from the TBCL level 1–3 vocabulary, run through the verifier.

### 6.5 Taiwan (MOE) vs Mainland readings (MOE 2021 checked; Mainland from CC-CEDICT)

| Word | MOE (teach this) | Mainland |
|---|---|---|
| 垃圾 | ㄌㄜˋ ㄙㄜˋ | lājī |
| 星期 / 期待 | ㄒㄧㄥ ㄑㄧˊ / ㄑㄧˊ ㄉㄞˋ | xīngqī / qīdài |
| 危險 / 微笑 | ㄨㄟˊ ㄒㄧㄢˇ / ㄨㄟˊ ㄒㄧㄠˋ | wēi- |
| 頭髮 | ㄊㄡˊ ㄈㄚˇ | tóufa |
| 研究 | ㄧㄢˊ ㄐㄧㄡˋ | yánjiū |
| 企業 | ㄑㄧˋ ㄧㄝˋ | qǐyè |
| 綜合 | ㄗㄨㄥˋ ㄏㄜˊ | zōnghé |
| 品質 / 質量 | ㄆㄧㄣˇ ㄓˊ / ㄓˊ ㄌㄧㄤˋ | pǐnzhì / zhìliàng |
| 知識 | ㄓ ㄕˋ | zhīshi |
| 攻擊 / 可惜 / 休息 | ㄍㄨㄥ ㄐㄧˊ / ㄎㄜˇ ㄒㄧˊ / ㄒㄧㄡ ㄒㄧˊ | gōngjī / kěxī / xiūxi |
| 突然 | ㄊㄨˊ ㄖㄢˊ | tūrán |
| 擁抱 | ㄩㄥˇ ㄅㄠˋ | yōngbào |
| 癌症 | ㄧㄢˊ ㄓㄥˋ | áizhèng |
| 暴露 / 曝光 | ㄆㄨˋ ㄌㄨˋ / ㄆㄨˋ ㄍㄨㄤ | bào- |
| 從容 | ㄘㄨㄥ ㄖㄨㄥˊ | cóngróng |
| 口吃 | ㄎㄡˇ ㄐㄧˊ | kǒuchī |
| 暫時 | ㄓㄢˋ ㄕˊ | zànshí |
| 發酵 | ㄈㄚ ㄒㄧㄠˋ | fājiào |
| 攜帶 | ㄒㄧ ㄉㄞˋ | xiédài |
| 蝸牛 | ㄍㄨㄚ ㄋㄧㄡˊ | wōniú |
| 細菌 | ㄒㄧˋ ㄐㄩㄣˋ | xìjūn |
| 檔案 | ㄉㄤˇ ㄢˋ | dàng'àn |
| 廣播 | ㄍㄨㄤˇ ㄅㄛˋ | guǎngbō |
| 跌倒 | ㄉㄧㄝˊ ㄉㄠˇ | diēdǎo |
| 夾克 | ㄐㄧㄚˊ ㄎㄜˋ | jiākè |
| 和 ("and") | ㄏㄜˊ; ㄏㄢˋ is the everyday 語音 | hé |

**These are NOT differences.** Don't list them:
- 法國 ㄈㄚˇ ㄍㄨㄛˊ
- 血液 / 液體 (液 = ㄧㄝˋ)
- 成熟 ㄔㄥˊ ㄕㄨˊ
- 認識 ㄖㄣˋ ˙ㄕ
- 亞洲 ㄧㄚˋ ㄓㄡ

Some characters also have a listed 又音 (期 ㄑㄧ, 微 ㄨㄟ, 究 ㄐㄧㄡ, 癌 ㄞˊ). The verifier accepts these, but the app teaches the first-listed reading.

### 6.6 Colloquial Taiwan features (understand them, but produce the standard)
- Retroflex sounds shift to dental ones: ㄓㄔㄕ → ㄗㄘㄙ, and ㄖ → [z] or [l]. Some speakers also over-correct the other way.
- ㄣ and ㄥ merge (especially ㄧㄥ → ㄧㄣ). After a lip consonant, ㄥ becomes [oŋ] (風 sounds like "fong").
- ㄩ → ㄧ; ㄈ → [ɸ] or [h]; ㄟ and ㄨㄟ flatten to [e].
- ㄦ is said lighter, and 兒化 (adding -r) is rare.
- There are fewer neutral tones, and T3 has no final rise.
- ㄅㄛ is said as ㄅㄨㄛ.

Give these listening-only examples in the Advanced listening track (§5.8).

### 6.7 How to train (evidence → app design)

| Evidence | What the app does |
|---|---|
| Wang, Spence, Jongman & Sereno 1999, *JASA* 106:3649. Two weeks of multi-talker tone ID with feedback gave +21%. It generalized to new voices and words and lasted 6 months. | Identification drills use several voices and give immediate feedback with A/B replay. |
| Wang, Jongman & Sereno 2003, *JASA* 113:1033. Listening training alone improved production by +18% (native-judged). | Train listening first, every session. |
| Thomson 2018, *JSLP* 4(2); Uchihara, Karas & Thomson 2024, *Applied Psycholinguistics* 45. HVPT reliably improves perception, but production gains are smaller and fade. | Add explicit production practice (the pitch mirror). Retention checks at 1 and 4 weeks. |
| Baese-Berk & Samuel 2016, *JML* 89. Producing a sound on every trial can **disrupt** perceptual learning. | Keep **listening blocks and speaking blocks separate.** |
| Perrachione et al. 2011, *JASA*. High variability helps strong perceivers and can hurt weak ones. | **Adaptive variability:** use one voice per block while accuracy is under ~70%, then mix voices. |
| Chun et al. 2015, *JSLP* 1(1); Godfroid, Lin & Ryu 2017, *Language Learning* 67. Comparing your pitch curve with a native one improves tones; contours and numbers beat colour; two visual cues are no better than one. | The pitch overlay shows contour lines. Tone colours stay off by default. |
| Pelzl et al. 2019, *SSLA* 41. Advanced learners are near-native on single syllables but weak on tones inside two-syllable words. | Drill **tone pairs and real words**, not just syllables. |
| Foote & McDonough 2017, *JSLP* 3(1). 8 weeks of shadowing (at least 4 × 10 min a week, with self-recording) improved comprehensibility and fluency. | Shadowing protocol and dose (§5.4). |

**The daily 10-minute pronunciation session (the "Pronunciation" block in Today):**
1. **Listening ID (3 min):** today's contrast from §6.2, with Taiwan-standard voices, feedback and adaptive variability.
2. **Tone-pair ID (2 min):** the 20-cell grid, weighted toward my confusion matrix (T2/T3 and T1/T4 first).
3. **Production (3 min):** imitate, record, compare on the pitch overlay (semitone-normalized; T3 target 21), and replay both.
4. **Shadowing (2 min):** one sentence that contains a sandhi.

**Weekly:** a test with untrained voices and words, plus retention checks on items from 1 and 4 weeks ago. This feeds `WEEKLY`.

---

## 7. Audio pipeline

### 7.1 Source priority
1. **MOE 《國語辭典簡編本》 announcer audio** (human, Taiwan standard), via the moedict id map:
   - syllables and characters, using the headword span
   - words, using the headword span
   - whole-entry readings for shadowing
2. **The 37 symbol recordings from the MOE 《國語注音符號手冊》** (2017), used to introduce each symbol.
3. **Syllable–tone combinations with no real character, and most neutral tones:** teach them through real words (e.g. 東西 ㄉㄨㄥ ˙ㄒㄧ). **Never synthesize them.**
4. **Sentences MOE doesn't cover:** zh-TW TTS generated at build time (§7.6). As a runtime fallback, use the browser's `speechSynthesis` with a zh-TW / cmn-TW voice.
5. Mainland recordings (e.g. hugolpz/audio-cmn, CC BY-SA; Lingua Libre, mostly Mainland) only if clearly labelled "Mainland accent". Prefer not to use them at all.

### 7.2 Where to get it (verified 2026-10-13)
- **moedict API:** `https://www.moedict.tw/a/<word>.json` (percent-encoded). It sends CORS `*` and JSONP is documented.
  - For each reading, `h[i]["="]` is the audio id, `b` is the Zhuyin and `p` is the pinyin.
  - Example ids: 媽 0527, 麻 0529, 馬 0534, 罵 0539, 了(˙ㄌㄜ) 1756, 東西(ㄉㄨㄥ ˙ㄒㄧ) 1306000451.
  - The `/uni/` and `/raw/` endpoints remove the audio id, so don't use them.
- **Audio files:** `https://r2-assets.moedict.tw/audio/a/<id>.ogg` (about 30 KB, 22 kHz mono) or `.mp3` (about 180 KB).
  - These files send **no CORS header**. A plain `<audio>` element plays them, but `fetch()` and Web Audio pitch analysis are blocked, so **download at build time** whatever needs analysis or exact spans.
  - The old rackcdn URLs return 404.
- **Audio-id map:** `dict-concised.audio.json` maps `字.注音` to an id across 39,738 entries. Find it in the g0v moedict repos (`g0v/moedict-data` / `moedict-webkit`) during SETUP.
  - 6,634 entries are single characters, covering 1,253 toned syllables over 440 bases.
  - Only about 20 single-character neutral-tone syllables exist (e.g. ˙ㄇㄚ 嗎/嘛).
- **Bulk downloads (official MOE):** https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/dict_concised_download.html
  - text: 6.9 MB
  - per-character audio zip: 1.52 GB
  - full-entry audio: about 14.7 GB
  - It isn't verified whether the zip's file names match the moedict ids. Prefer fetching only the ids you need.
- **Zhuyin symbol audio:** https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/index.html
  - 37 WAVs at `html_ch/audio/F1.WAV` … `F37.WAV`, plus `bopomofo_materials_20170213.zip` (3.9 MB)
  - audio, SVG and XML: **CC BY 4.0**; text: CC BY-ND 3.0 TW
- **Etiquette:** there's no published rate limit. Use the id map, throttle to about 1 request per second, and cache in `.cache/moe-audio/` (gitignored). The files are served immutable, so download each one only once.

### 7.3 What's inside the MOE files (important)
The files hold **more than the headword**:
- **Single characters:** 馬 is 9.1 s long. The bare syllable takes about 0–0.5 s, then the radical and stroke count follow.
- **Words:** 東西 is 16.7 s long. The headword comes first, then the definition, then an example sentence ("例如，我習慣睡前把明天要用的各項東西先準備好…").

How to handle this:
- At build time, find the **headword span** with ffmpeg `silencedetect`: the first speech segment up to the first pause of about ≥0.3 s (tune the threshold). Store `{start, end}` as metadata.
  - Use the ffmpeg from the `imageio-ffmpeg` pip package inside the venv, so there's no system install.
- **Play the span; never cut the file** (see §7.5).
  - For self-hosted files, decode with Web Audio and play `start(0, start, end - start)` for exact edges.
  - For streamed files, use the media fragment `#t=start,end`.
- **Whole-entry readings become free shadowing material.** Play the full file and show the 簡編本 entry text (definition plus example) from the official text download. Label it "MOE dictionary reading".
- Spot-check 20 random spans by ear in every `CHECK`.

### 7.4 Pitch contours
- **Model contours** are precomputed at build time for every headword span used in Tone Gym, tone pairs and contrasts:
  - Use `librosa.pyin` (ISC license; librosa 1.0 needs Python ≥3.12) or `praat-parselmouth` (GPL, fine as a build-only tool, and its exported JSON isn't bound by it).
  - Store the time-normalized F0 in semitones relative to the speaker's median, with voicing masks, in `docs/data/contours/`.
- **My contour** is computed live with pitchy 4.1.0:
  ```js
  const d = PitchDetector.forFloat32Array(2048);
  d.minVolumeDecibels = -40;
  const [hz, clarity] = d.findPitch(buf, ctx.sampleRate);
  ```
  - Feed it from `AnalyserNode.getFloatTimeDomainData`.
  - Drop frames with clarity below about 0.85, then normalize the same way as the model.
- Open-source references worth reading (don't copy GPL code): BYU-ODH/chinese-tone-webapp (GPL-3), Globexix/mandarin-tone-visualizer (MIT), ulisesrey/pitch_detector (MIT).

### 7.5 Licenses and attribution (must follow)
- **MOE 《國語辭典簡編本》 text and audio: CC BY-ND 3.0 TW.**
  - Use this attribution: 「中華民國教育部（Ministry of Education, R.O.C.）。《國語辭典簡編本》（版本編號：<version>）網址：http://dict.concised.moe.edu.tw/」
  - Keep the MOE 使用說明 intact and include it on the Credits page and with any redistributed data.
  - **Don't edit entry content or readings.** Format conversion is OK (the moedict-data README says MOE treats format conversion as allowed).
  - **Trimming audio may count as modification.** That's why the app ships whole files and plays spans.
- **MOE 《重編國語辭典修訂本》 data** (used for verification): follow its own license page. Record it in `content/sources.md`.
- **MOE 注音符號手冊 audio:** CC BY 4.0 (attribution).
- **TBCL / TOCFL lists:** "All rights reserved". Cache them only, publish only the fields the app needs, and credit NAER / SC-TOP (§8.7).
- **CC-CEDICT glosses:** CC BY-SA 4.0. The derived glosses file stays BY-SA, with attribution.
- moedict code: CC0. pitchy: MIT. Noto fonts: OFL.
- **TTS clips** are labelled with the engine and voice. Publishing edge-tts output is a terms-of-service grey area, so prefer gTTS output and runtime browser voices for anything published, and say so on the Credits page.
- The repo is public, so the build must check that every redistributed file has a license entry.

### 7.6 TTS (sentences only)
- **edge-tts** (LGPLv3; latest 7.2.8):
  - Taiwan voices: zh-TW-HsiaoChenNeural (F), zh-TW-HsiaoYuNeural (F), zh-TW-YunJheNeural (M).
  - `--rate` and `--pitch` work, but there's no custom SSML.
  - **As of 2026-10-10 it returns 403**: issue rany2/edge-tts#490 (Microsoft moved to api.msedgeservices.com), fix PR #491 not yet merged.
  - At SETUP, upgrade it in the venv and test one sentence. If it still fails, skip it.
- **gTTS** (MIT, 2.5.4) with `lang="zh-TW"` gives one female Taiwan voice, 24 kHz mp3, from an unofficial endpoint. This is the working default.
- **Runtime browser voices:**

  | Platform | zh-TW / cmn-TW voices |
  |---|---|
  | Edge | Microsoft HsiaoChen / HsiaoYu / YunJhe Online (Natural) |
  | Chrome desktop | Google 國語（臺灣） |
  | Windows (with the language pack) | Microsoft Yating / Hanhan / Zhiwei |
  | Apple | Meijia |
  | Android | cmn-TW-x-ctc / ctd / cte |

- **TTS misreads polyphones** (多音字) and lone characters, and can't produce the neutral tone or tone sandhi in isolation. Use it only for full sentences, and check every TTS sentence's Zhuyin with the verifier.
- **Audio format:** keep the MOE `.ogg` files and add an `.mp3` (mono, about 40 kbps) made by format conversion only, for Safari/iOS. Choose with `canPlayType`. Test on my phone (`PHONE` setting).
- **Size budget:** `docs/` under about 600 MB.
  - Self-host the core sets: syllables, tone pairs, contrasts, unit words and placement items.
  - Stream long-tail library audio straight from the moedict CDN with `<audio>` (playback only, no analysis), falling back to TTS when offline.

---

## 8. The plan: levels, hours, milestones

The plan follows the official Taiwan frameworks: **TBCL (臺灣華語文能力基準, NAER)** levels 1–7 for content, labelled with **TOCFL / CEFR** using the official 2021 mapping. All numbers below were checked on 2026-10-13.

### 8.1 Levels

| Phase | TBCL level | TOCFL / CEFR | New words (cumulative) | Characters per level | Grammar points |
|---|---|---|---|---|---|
| 0 Sound reset | runs alongside everything, weeks 1–4 | — | — | — | — |
| 1 Survival | L1 | 準備級一級 | 400 (≈400) | 246 | 15 |
| 1 Survival | L2 (end of L2 ≈ A1) | 準備級二級 → A1 | 406 (≈805) | 258 | 92 |
| 2 Daily life | L3 (end of L3 ≈ A2) | Band A 基礎級 · A2 | 463 (≈1,265) | 297 | 134 |
| 3 Independent | L4 | Band B 進階級 · B1 | 1,429 (≈2,685) | 499 | 149 |
| 4 Upper-intermediate | L5 (B2 sits between L5 and L6) | Band B 高階級 · B2 | 2,641 (≈5,320) | 600 | 106 |
| 5 Advanced | L6 | Band C 流利級 · C1 | 4,135 (≈9,470) | 600 | — |
| 5 Advanced | L7 | 精通級 · C2 | 4,978 (≈14,450) | 600 | — |

- TBCL levels 1–4 are each split into "N" and "N*" sub-bands. N* looks like the upper half of the level, but that's inferred, not official, so show it as "1 / 1+".
- Each phase in `plan.json` has can-do goals (e.g. Phase 2: order food and drinks, take transport, see a doctor, chat with neighbours about family and work), its units, its grammar points and its milestone check.
- The placement check (§5.7) decides my starting phase. I may already be past part of Phase 1 from my Anki decks.

### 8.2 Hours and pace (be honest with me)

**TOCFL estimates for learners outside Taiwan.** These are classroom hours; use them as a rough guide for self-study.

| Level | Hours |
|---|---|
| A1 | 240–480 |
| A2 | 480–720 |
| B1 | 720–960 |
| B2 | 960–1,920 |
| C1 | 1,920–3,840 |

For comparison, FSI rates Mandarin Category IV: about 2,200 class hours to reach professional level.

**Count all my study time,** not just the app. The Today page has a **"log outside time"** button for Anki, conversations, TV, podcasts and the like. Living in Taiwan, real conversations count.

**Pace to A2** (480–720 h). Show this on the Plan page, update it from my logged minutes, and suggest a change if I set a goal date that the pace can't reach:

| Study time | Time to A2 |
|---|---|
| 30 min/day × 6 days (~156 h/yr) | about 3–4.5 years |
| 1 h/day (~312 h/yr) | about 1.5–2.3 years |
| 10 h/week (~520 h/yr) | about 1–1.4 years |

### 8.3 Daily and weekly rhythm (scaled to `DAILY_MINUTES`, default 30)

**Daily**

| Minutes | Block |
|---|---|
| 10 (**15 during Phase 0**, **5 for maintenance** from Phase 4) | Pronunciation session (§6.7) |
| 12 | Current unit: new words and grammar in context, the dialogue and its tasks |
| 5 | Shadowing (§5.4) |
| 3 | Review library items marked "trouble", or the unit's speaking task |
| outside the app | ☐ Anki (my decks), plus optional logged native input |

**Weekly** (on my last study day)
- the weekly test: untrained voices, retention items at 1 and 4 weeks, and unit checks
- **a 1-minute recorded monologue** on the week's topic, saved so I can compare it with week 1 every month
- one short piece of writing, sent through `CORRECT`
- export my progress, then `WEEKLY`

**Monthly**
- a native check of my recordings (if `NATIVE_CHECKER` is set)
- a plan review (pace, goal date)

**Pace:** about 1–2 TBCL grammar points and 20–40 new words a week at 30 min/day. Scale this with `DAILY_MINUTES`, and never cut the pronunciation block to make room.

### 8.4 Level checks and TOCFL
- An **end-of-level check** unlocks once ≥90% of a level's units are done.
- **To pass:**
  - ≥80% on that level's listening and reading
  - ≥85% on the vocabulary sample
  - a pronunciation diagnostic with no "red" contrasts (from my self-check plus the native check)
- Use the **official free TOCFL mock tests** (https://tocfl.edu.tw/tocfl/index.php/exam/test) at the end of each phase.
- The real TOCFL exam costs money and is my decision. Mention it once at Phase 2 (Band A) and once at Phase 3/4 (Band B); don't push it.

### 8.5 Typing and handwriting
- **Zhuyin typing from week 1.** It forces the exact initial, final and tone, with no fuzzy matching, so it trains distinctions like ㄧㄣ/ㄧㄥ. Olle Linge (Hacking Chinese, 2024) recommends switching your phone keyboard to Zhuyin.
- **Layout:** 標準 and 大千 are the same layout ("Standard" on Windows). Tone keys: Space = T1, 6 = ˊ, 3 = ˇ, 4 = ˋ, 7 = ˙. The Lab's dictation keyboard uses this layout.
- **Setup steps to show me:**
  - **Windows 11:** Settings › Time & language › Language & region › Chinese (Traditional, Taiwan) › Microsoft Bopomofo (Standard).
  - **iOS:** Settings › General › Keyboard › Keyboards › Add › Chinese (Traditional) › Zhuyin.
  - **Android:** Gboard › Languages › Add keyboard › 中文（台灣）注音.
- Extra practice: i2bopomo.com (link only).
- **Handwriting is optional.** Recognizing characters comes first. Teach characters through radicals (the 214 Kangxi radicals that MOE uses) and components, with Taiwan stroke order (§5.8).

### 8.6 How `WEEKLY` adapts the plan
- A contrast or tone pair below 80% for 2 weeks becomes the **daily focus** until it reaches 85%.
- A unit quiz below 70% means review it before starting a new unit.
- Logged minutes below 60% of target for 2 weeks means **slowing the unit pace**, not skipping pronunciation, and telling me the new estimate.
- A retention check below 70% brings those items back into Today.
- After 8 weeks of pronunciation sessions, cut the pronunciation block to 5 minutes of maintenance **only if** all contrasts are ≥85% and the native check is clean.

### 8.7 Data for levels (licensing matters)
- **TBCL lists** come from NAER: https://coct.naer.edu.tw/page.jsp?ID=4. They are xlsx/ods files:

  | File | Contents |
  |---|---|
  | `14452詞語表202504.xlsx` | words with level, 情境 (theme), frequency, **zhuyin** and pinyin |
  | `漢字表_111-09-20.xlsx` | characters |
  | `語法點表_112-01-04.xlsx` | 496 grammar points (levels 1–5) with one Chinese example each |
  | 解詞造句 PDF | English and examples for words at levels 1–3 |

  The coct site says "All rights reserved". NAER's open-data declaration allows reuse with credit, but it's unclear whether that covers coct. So:
  - Download the files at build time into `.cache/` (gitignored), **never commit the raw files**, publish only the fields the app needs, and credit NAER on the Credits page.
  - Write **my own** English explanations for grammar.
  - Tell me if you think I should ask NAER for permission.
- **TOCFL 華語八千詞** (optional cross-check): https://tocfl.edu.tw/tocfl/assets/files/vocabulary/8000zhuyin_202409.zip. It has 7,517 words with zhuyin and base tones, and is "All rights reserved". Same rule: cache only, nothing committed.
- **English glosses:** CC-CEDICT (https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip, **CC BY-SA 4.0**, so the glosses file is BY-SA too). Keep its "Taiwan pr." and "(Tw)" notes as hints. **Never take Zhuyin from CC-CEDICT or pypinyin**: both use Mainland readings.
- **Pinyin ↔ Zhuyin:** use your own table of about 410 syllables, built and checked from TBCL's paired columns. No library.
- **opencc-js 1.4.2** (`cn → twp`, MIT/Apache-2.0): only at build time, and only if a source arrives in Simplified. Don't ship it.

---

## 9. Files, schemas and the build

### 9.1 Folder structure
```
mandarin-study/
  MASTER_PROMPT.md   PROGRESS.md   README.md   update-site.cmd   .gitignore
  .venv/             (gitignored)
  .cache/            (gitignored: moe-audio/, moe-data/, tts/)
  progress/          (gitignored: my progress exports for WEEKLY)
  tools/             build.py, verify.py, audio.py, contours.py, requirements.txt
  content/
    plan.json                     phases, levels, milestones, weekly focus
    sources.md                    every citation and license
    zhuyin/symbols.json           37 symbols (§6.1 fields + example words + MOE handbook WAV)
    zhuyin/contrasts.json         the 10 contrasts and their pairs (§6.2)
    tones/pairs.csv               tone-pair grid words (§6.4)
    tones/sandhi.json             rules + drill items
    tones/taiwan-readings.csv     §6.5
    units/L1-01.json …            one file per unit
    library/words.csv             word, zhuyin, en, pos, measure, tbcl_level, topic, note
    library/grammar.json          id, pattern, level, explanation_en, examples[] (zh, zhuyin, en)
    library/patterns.csv  library/phrasebook.csv  library/taiwan-vs-mainland.csv
    library/chengyu.csv   library/radicals.csv    library/my-mistakes.csv
    shadowing/sentences.csv       id, level, zh, zhuyin, en, focus, source
    reading/*.json                graded texts (Advanced)
    resources.json                external links by level (Advanced)
  docs/                           GENERATED: never edit by hand except js/css/html sources
    index.html  lab.html  tones.html  shadow.html  units.html  library.html  plan.html  advanced.html  settings.html
    css/  js/  data/  audio/  sw.js  manifest.webmanifest
```

### 9.2 Content rules (for you and every subagent)
- **Zhuyin format:** syllables separated by spaces, with the tone mark after the syllable and ˙ before neutral syllables (e.g. `ㄕㄨㄟˇ ㄍㄨㄛˇ`, `ㄓㄨㄛ ˙ㄗ`). Store the **base tone** (§6.4).
- Pinyin is derived by the build from a Zhuyin → pinyin table, never typed by hand.
- Vocabulary is tagged with its TBCL level. Topics and dialogues are set in Taiwan, with Taiwan vocabulary and natural Taiwan phrasing (the verified features in §5.8 item 4, such as 有 + verb and the particles 喔 / 啦 / 欸 / 齁), at the right register. Don't present the 給 passive as Taiwanese.
- Every example sentence gets an English translation, and every grammar point gets 3 or more examples.
- No invented cultural "facts". When unsure, leave it out.

### 9.3 The verifier (`tools/verify.py`, runs inside every build)
- **Reading sources, in order:** the TBCL word list's own Zhuyin column, then MOE 簡編本, then MOE 修訂本. If TBCL and MOE disagree, warn and prefer the reading that has MOE audio.
- It checks every word and sentence in `content/` against those sources. It segments sentences with the combined word list (longest match), then compares the Zhuyin syllable by syllable.
  - **Accept** the first-listed reading. Also accept listed 又音 / 語音 / 讀音, but log a warning with a ⚑ mark in the report.
  - **Fail** any syllable with no matching reading.
  - Check sandhi-marked text (if any) against the §6.4 rules.
- It writes `build-report.md`:
  - counts
  - failures with file and line
  - warnings
  - audio coverage: MOE / TTS / missing
  - total `docs/` size
- **The build fails if there are any failures.** Fix the content, never the verifier.

---

## 10. QA checklist (`CHECK`, and before every PUBLISH)
1. The build report shows 0 verifier failures, 0 missing audio and `docs/` within the size budget.
2. Every page loads in the built-in browser at **375 px (phone) and desktop** with no console errors.
3. Mic flows work in Chrome and Edge (and Safari if my phone is an iPhone): permission prompt, record, playback, pitch overlay and save to IndexedDB.
4. **Spot-listen:**
   - 20 random headword spans start and stop cleanly
   - all 20 tone-pair cells
   - 2 pairs from each contrast
   - 5 random syllable-grid cells across all tones
5. Tone ID drills draw **only** on MOE audio (assert this in code).
6. Offline mode works after one visit, and "Add to Home Screen" works.
7. Ruby and tone marks render correctly on Windows, Android and iOS. Text has `lang="zh-Hant-TW"`.
8. Export → reset → import gives back identical progress.
9. The Credits page lists every source and its license, plus the MOE 使用說明.
10. The **accessibility-review** (Design plugin) passes: contrast, focus order and labels on audio buttons.

---

## 11. Milestones (build in this order; track them in `PROGRESS.md`)

| # | Milestone | Done when |
|---|---|---|
| M1 | **SETUP + audio pipeline + Zhuyin Lab** (symbols, syllable grid, contrasts, dictation) | I can tap any syllable and hear correct MOE audio in all tones, and the contrast drills work |
| M2 | **Tone Gym** (ID, tone pairs, pitch mirror, sandhi, Taiwan readings) + Today (pronunciation block) | The pitch overlay works on my phone and laptop |
| M3 | **Shadowing** (player, protocol, MOE dictionary readings, native-check hand-off) | I can run a full 10-minute session |
| M4 | **Plan + placement check + Library** (seeded with TBCL levels 1–3, grammar, Taiwan vocab) | Placement gives me a level and a starting unit |
| M5 | **Units for my level and the next** (subagents, verified) | Units are released per the plan |
| M6 | **Advanced tracks + resources + immersion mode** | Links are checked and the reading ladder works |
| M7 | **Polish + accessibility + PUBLISH** (ask me first) | The live site works on my phone |

After M7, ongoing work is `WEEKLY`, `CONTENT` and `LEVEL-UP`.

---

## Appendix A: Key sources
- MOE 重編國語辭典修訂本: https://dict.revised.moe.edu.tw
- MOE 國語辭典簡編本 (sandhi rules page): https://dict.concised.moe.edu.tw/page.jsp?ID=55&la=1&powerMode=0
- MOE 國語注音符號手冊 (2017): https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/index.html
- MOE 簡編本 license PDF: https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/conciseddict_10312.pdf
- moedict: https://www.moedict.tw · data: https://github.com/g0v/moedict-data
- edge-tts 403 issue: https://github.com/rany2/edge-tts/issues/490
- Wikipedia (for IPA tables, with their cited sources): *Standard Chinese phonology*, *Bopomofo*, *Taiwanese Mandarin*
- Research: Wang et al. 1999 (doi:10.1121/1.428217) · Wang et al. 2003 (doi:10.1121/1.1531176) · Perrachione et al. 2011 (JASA) · Pelzl et al. 2019 (doi:10.1017/S0272263117000444) · Chun et al. 2015 (doi:10.1075/jslp.1.1.04chu) · Foote & McDonough 2017 (doi:10.1075/jslp.3.1.02foo) · Baese-Berk & Samuel 2016 (doi:10.1016/j.jml.2015.10.008) · Uchihara et al. 2024 (doi:10.1017/S0142716424000195) · Sakai & Moorman 2018 (doi:10.1017/S0142716417000418) · Lu, Chuang & Baayen 2025 (https://arxiv.org/html/2503.23163v1)
- TBCL (NAER) downloads: https://coct.naer.edu.tw/page.jsp?ID=4 · NAER open-data declaration: https://www.naer.edu.tw/PageDoc?fid=324
- TOCFL hours: https://tocfl.edu.tw/tocfl/index.php/test/reading/list/2 · TBCL↔TOCFL mapping: https://tocfl.edu.tw/assets/files/announcement/TOCFLandTBCL01.pdf · 8,000-word list: https://tocfl.edu.tw/tocfl/assets/files/vocabulary/8000zhuyin_202409.zip · mock tests: https://tocfl.edu.tw/tocfl/index.php/exam/test
- MOE dictionary data downloads (all dictionaries): https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html
- CC-CEDICT: https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip (CC BY-SA 4.0)
- MOE stroke order: https://stroke-order.learningweb.moe.edu.tw/ (BY-NC-ND, link only)
- Libraries: pitchy 4.1.0 (MIT) · Hanzi Writer 3.7.3 (MIT) · opencc-js 1.4.2 (MIT/Apache-2.0) · gTTS 2.5.4 (MIT) · edge-tts 7.2.8 (LGPLv3) · imageio-ffmpeg · librosa (ISC)
- Taiwan usage: Wikipedia *Taiwanese Mandarin*; moedict cross-strait entries (`https://www.moedict.tw/c/<word>`)
