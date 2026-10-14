# Build report - 2026-10-13

**Status:** built

## Verifier

- checked: 483
- failures: 0
- warnings: 1

- WARN `zhuyin/contrasts.json/contrasts[8]/sets[0][1]`: 樂 `ㄌㄜˋ` - matches 簡編本 later 多音 reading, not the first-listed ㄩㄝˋ

## Audio coverage

- MOE human clips: 1442
- MOE handbook symbol clips: 37
- TTS clips: 17
- missing / failed: 6 - 0660, 5964, 5082, 1854, 1624, 2110
- content words without an exact-reading MOE clip (browser voice, labelled): 46
  - 粗布 ㄘㄨ ㄅㄨˋ
  - 人民 ㄖㄣˊ ㄇㄧㄣˊ
  - 人名 ㄖㄣˊ ㄇㄧㄥˊ
  - 擔心 ㄉㄢ ㄒㄧㄣ
  - 兔子 ㄊㄨˋ ˙ㄗ
  - 圖書 ㄊㄨˊ ㄕㄨ
  - 中國 ㄓㄨㄥ ㄍㄨㄛˊ
  - 明天 ㄇㄧㄥˊ ㄊㄧㄢ
  - 蘋果 ㄆㄧㄥˊ ㄍㄨㄛˇ
  - 不要 ㄅㄨˋ ㄧㄠˋ
  - 便當 ㄅㄧㄢˋ ˙ㄉㄤ
  - 朋友 ㄆㄥˊ ㄧㄡˇ
  - 媽媽 ㄇㄚ ˙ㄇㄚ
  - 沒有 ㄇㄟˊ ㄧㄡˇ
  - 吃飯 ㄔ ㄈㄢˋ
  - 法國 ㄈㄚˇ ㄍㄨㄛˊ
  - 天氣 ㄊㄧㄢ ㄑㄧˋ
  - 捷運 ㄐㄧㄝˊ ㄩㄣˋ
  - 謝謝 ㄒㄧㄝˋ ˙ㄒㄧㄝ
  - 知道 ㄓ ㄉㄠˋ
  - 手機 ㄕㄡˇ ㄐㄧ
  - 日本 ㄖˋ ㄅㄣˇ
  - 認識 ㄖㄣˋ ˙ㄕ
  - 廁所 ㄘㄜˋ ㄙㄨㄛˇ
  - 臺灣 ㄊㄞˊ ㄨㄢ
  - 一個 ㄧ ˙ㄍㄜ
  - 十一 ㄕˊ ㄧ
  - 星期一 ㄒㄧㄥ ㄑㄧˊ ㄧ
  - 不是 ㄅㄨˋ ㄕˋ
  - 不會 ㄅㄨˋ ㄏㄨㄟˋ
  - 不對 ㄅㄨˋ ㄉㄨㄟˋ
  - 不錯 ㄅㄨˋ ㄘㄨㄛˋ
  - 不夠 ㄅㄨˋ ㄍㄡˋ
  - 不客氣 ㄅㄨˋ ㄎㄜˋ ㄑㄧˋ
  - 不好 ㄅㄨˋ ㄏㄠˇ
  - 不能 ㄅㄨˋ ㄋㄥˊ
  - 不多 ㄅㄨˋ ㄉㄨㄛ
  - 品質 ㄆㄧㄣˇ ㄓˊ
  - 突然 ㄊㄨˊ ㄖㄢˊ
  - 擁抱 ㄩㄥˇ ㄅㄠˋ
  - 癌症 ㄧㄢˊ ㄓㄥˋ
  - 暴露 ㄆㄨˋ ㄌㄨˋ
  - 曝光 ㄆㄨˋ ㄍㄨㄤ
  - 從容 ㄘㄨㄥ ㄖㄨㄥˊ
  - 成熟 ㄔㄥˊ ㄕㄨˊ
  - 亞洲 ㄧㄚˋ ㄓㄡ

- spans flagged for a listen (outside the expected length): 0

## Data

- syllable grid: 405 bases / 1222 toned syllables
- model contours: 1434
- Tone Gym (tones.json): id_pool 527, pairs 119 (20 core), sandhi items 85, readings 38
- Tone Gym ids without a model contour: 0
- sandhi sentences without TTS audio: 0
- docs/ size: 340.3 MB (budget 600 MB)

## Log

```
Build 2026-10-13
Verifying content/ ...
Verifier: 483 Zhuyin strings checked, 0 failures, 1 warnings ⚑
  ⚑ zhuyin/contrasts.json/contrasts[8]/sets[0][1]: 樂 ㄌㄜˋ  — matches 簡編本 later 多音 reading, not the first-listed ㄩㄝˋ
Tone Gym content (spoken forms, §6.4) ...
  pairs 119 (20 core), sandhi items 85, readings 38, sandhi failures 0
Syllable grid: 405 bases, 1222 toned syllables with MOE audio
Audio ...
  audio: 1448 MOE clips wanted, 6 not cached, downloading 6 this run (priority order)
    50/1448
    100/1448
    150/1448
    200/1448
    250/1448
    300/1448
    350/1448
    400/1448
    450/1448
    500/1448
    550/1448
    600/1448
    650/1448
    700/1448
    750/1448
    800/1448
    850/1448
    900/1448
    950/1448
    1000/1448
    1050/1448
    1100/1448
    1150/1448
    1200/1448
    1250/1448
    1300/1448
    1350/1448
    1400/1448
  contours: 1434 cached, 0 to compute
  contours flagged T4-no-fall: 1 (e.g. 4983)
  contours flagged range: 6 (e.g. 028500347 080500057 1706 4823 566500012 583700066)
  sandhi clips that do not say the taught tone (kept for display, left out of the check and mirror): 10: 一天 一=ㄧˋ heard level; 一些 一=ㄧˋ heard level; 一般 一=ㄧˋ heard level; 一時 一=ㄧˋ heard level; 一起 一=ㄧˋ heard level; 一點 一=ㄧˋ heard level; 統一 一=ㄧ heard rise; 撐不住 不=ㄅㄨˊ heard fall; 行不通 不=ㄅㄨˋ heard level; 小不點 不=ㄅㄨˋ heard level
Tone ID pool: 527 single syllables (TBCL ≤ 第3*級, first-listed reading that the TBCL word list gives the character, tone 1-4, clip + contour)
  Tone ID uses another character than the grid for 4 syllables: ㄇㄛˋ 沒→末, ㄉㄧˋ 的→弟, ㄍㄜˋ 個→各, ㄐㄧˇ 給→幾
docs/ size: 340.3 MB (budget 600 MB)
  ! 6 wanted clips are missing: 0660, 5964, 5082, 1854, 1624, 2110
Done.
```
