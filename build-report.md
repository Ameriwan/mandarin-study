# Build report - 2026-10-13

**Status:** built

## Verifier

- checked: 261
- failures: 0
- warnings: 1

- WARN `zhuyin/contrasts.json/contrasts[8]/sets[0][1]`: 樂 `ㄌㄜˋ` - matches 簡編本 alt reading, not the first-listed one

## Audio coverage

- MOE human clips: 648
- MOE handbook symbol clips: 37
- TTS clips: 0
- missing / failed: 657 - 5964, 2153, 2230, 2334, 2672, 2716, 3142, 3506, 3594, 3597, 3598, 3675, 3767, 4398, 4414, 4484, 4516, 4642, 4989, 5060
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
  - 便當 ㄅㄧㄢˋ ˙ㄉㄤ
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
  - 便當 ㄅㄧㄢˋ ˙ㄉㄤ
  - 認識 ㄖㄣˋ ˙ㄕ
  - 便當 ㄅㄧㄢˋ ˙ㄉㄤ
  - 朋友 ㄆㄥˊ ㄧㄡˇ

- spans flagged for a listen (longer than expected): 0

## Data

- syllable grid: 405 bases / 1222 toned syllables
- model contours: 615
- docs/ size: 178.1 MB (budget 600 MB)

## Log

```
Build 2026-10-13
Verifying content/ ...
Verifier: 261 Zhuyin strings checked, 0 failures, 1 warnings ⚑
  ⚑ zhuyin/contrasts.json/contrasts[8]/sets[0][1]: 樂 ㄌㄜˋ  — matches 簡編本 alt reading, not the first-listed one
Syllable grid: 405 bases, 1222 toned syllables with MOE audio
Audio ...
  audio: 1305 MOE clips wanted, 657 not cached, downloading 0 this run (priority order)
    50/1305
    100/1305
    150/1305
    200/1305
    250/1305
    300/1305
    350/1305
    400/1305
    450/1305
    500/1305
    550/1305
    600/1305
  contours: 611 cached, 9 to compute
```
