# Build report - 2026-10-13

**Status:** built

## Verifier

- checked: 261
- failures: 0
- warnings: 6

- WARN `zhuyin/contrasts.json/contrasts[8]/sets[0][1]`: 樂 `ㄌㄜˋ` - matches 簡編本 alt reading, not the first-listed one
- WARN `zhuyin/symbols.json/symbols[0]/examples[2]`: 便當 `ㄅㄧㄢˋ ㄉㄤ` - matches TBCL, but MOE writes ㄅㄧㄢˋ ˙ㄉㄤ; store the base tone (§6.4)
- WARN `zhuyin/symbols.json/symbols[4]/examples[1]`: 東西 `ㄉㄨㄥ ˙ㄒㄧ` - matches TBCL, but MOE writes ㄉㄨㄥ ㄒㄧ; store the base tone (§6.4)
- WARN `zhuyin/symbols.json/symbols[32]/examples[1]`: 便當 `ㄅㄧㄢˋ ㄉㄤ` - matches TBCL, but MOE writes ㄅㄧㄢˋ ˙ㄉㄤ; store the base tone (§6.4)
- WARN `zhuyin/symbols.json/symbols[34]/examples[0]`: 便當 `ㄅㄧㄢˋ ㄉㄤ` - matches TBCL, but MOE writes ㄅㄧㄢˋ ˙ㄉㄤ; store the base tone (§6.4)
- WARN `zhuyin/symbols.json/symbols[35]/examples[2]`: 東西 `ㄉㄨㄥ ˙ㄒㄧ` - matches TBCL, but MOE writes ㄉㄨㄥ ㄒㄧ; store the base tone (§6.4)

## Audio coverage

- MOE human clips: 2
- MOE handbook symbol clips: 37
- TTS clips: 0
- missing / failed: 1307 - 0001, 0012, 0015, 0018, 001800001, 0023, 0030, 0034, 0053, 0055, 0059, 0060, 0061, 0065, 0069, 0077, 0082, 0089, 0095, 0100
- content words without an exact-reading MOE clip (browser voice, labelled): 40
  - 粗布 ㄘㄨ ㄅㄨˋ
  - 人民 ㄖㄣˊ ㄇㄧㄣˊ
  - 人名 ㄖㄣˊ ㄇㄧㄥˊ
  - 擔心 ㄉㄢ ㄒㄧㄣ
  - 兔子 ㄊㄨˋ ˙ㄗ
  - 圖書 ㄊㄨˊ ㄕㄨ
  - 擔心 ㄉㄢ ㄒㄧㄣ
  - 中國 ㄓㄨㄥ ㄍㄨㄛˊ
  - 明天 ㄇㄧㄥˊ ㄊㄧㄢ
  - 蘋果 ㄆㄧㄥˊ ㄍㄨㄛˇ
  - 不要 ㄅㄨˋ ㄧㄠˋ
  - 便當 ㄅㄧㄢˋ ㄉㄤ
  - 朋友 ㄆㄥˊ ㄧㄡˇ
  - 蘋果 ㄆㄧㄥˊ ㄍㄨㄛˇ
  - 媽媽 ㄇㄚ ˙ㄇㄚ
  - 沒有 ㄇㄟˊ ㄧㄡˇ
  - 明天 ㄇㄧㄥˊ ㄊㄧㄢ
  - 吃飯 ㄔ ㄈㄢˋ
  - 法國 ㄈㄚˇ ㄍㄨㄛˊ
  - 天氣 ㄊㄧㄢ ㄑㄧˋ
  - 捷運 ㄐㄧㄝˊ ㄩㄣˋ
  - 謝謝 ㄒㄧㄝˋ ˙ㄒㄧㄝ
  - 中國 ㄓㄨㄥ ㄍㄨㄛˊ
  - 知道 ㄓ ㄉㄠˋ
  - 吃飯 ㄔ ㄈㄢˋ
  - 手機 ㄕㄡˇ ㄐㄧ
  - 日本 ㄖˋ ㄅㄣˇ
  - 認識 ㄖㄣˋ ˙ㄕ
  - 廁所 ㄘㄜˋ ㄙㄨㄛˇ
  - 臺灣 ㄊㄞˊ ㄨㄢ
  - 媽媽 ㄇㄚ ˙ㄇㄚ
  - 謝謝 ㄒㄧㄝˋ ˙ㄒㄧㄝ
  - 沒有 ㄇㄟˊ ㄧㄡˇ
  - 朋友 ㄆㄥˊ ㄧㄡˇ
  - 手機 ㄕㄡˇ ㄐㄧ
  - 吃飯 ㄔ ㄈㄢˋ
  - 便當 ㄅㄧㄢˋ ㄉㄤ
  - 認識 ㄖㄣˋ ˙ㄕ
  - 便當 ㄅㄧㄢˋ ㄉㄤ
  - 朋友 ㄆㄥˊ ㄧㄡˇ

## Data

- syllable grid: 405 bases / 1222 toned syllables
- model contours: 0
- docs/ size: 0.5 MB (budget 600 MB)

## Log

```
Build 2026-10-13
Verifying content/ ...
Verifier: 261 Zhuyin strings checked, 0 failures, 6 warnings ⚑
  ⚑ zhuyin/contrasts.json/contrasts[8]/sets[0][1]: 樂 ㄌㄜˋ  — matches 簡編本 alt reading, not the first-listed one
  ⚑ zhuyin/symbols.json/symbols[0]/examples[2]: 便當 ㄅㄧㄢˋ ㄉㄤ  — matches TBCL, but MOE writes ㄅㄧㄢˋ ˙ㄉㄤ; store the base tone (§6.4)
  ⚑ zhuyin/symbols.json/symbols[4]/examples[1]: 東西 ㄉㄨㄥ ˙ㄒㄧ  — matches TBCL, but MOE writes ㄉㄨㄥ ㄒㄧ; store the base tone (§6.4)
  ⚑ zhuyin/symbols.json/symbols[32]/examples[1]: 便當 ㄅㄧㄢˋ ㄉㄤ  — matches TBCL, but MOE writes ㄅㄧㄢˋ ˙ㄉㄤ; store the base tone (§6.4)
  ⚑ zhuyin/symbols.json/symbols[34]/examples[0]: 便當 ㄅㄧㄢˋ ㄉㄤ  — matches TBCL, but MOE writes ㄅㄧㄢˋ ˙ㄉㄤ; store the base tone (§6.4)
  ⚑ zhuyin/symbols.json/symbols[35]/examples[2]: 東西 ㄉㄨㄥ ˙ㄒㄧ  — matches TBCL, but MOE writes ㄉㄨㄥ ㄒㄧ; store the base tone (§6.4)
Syllable grid: 405 bases, 1222 toned syllables with MOE audio
Audio ...
  audio: 1307 MOE clips not cached (--no-audio); they will be missing
  audio: 1309 MOE clips wanted, 1307 to download
```
