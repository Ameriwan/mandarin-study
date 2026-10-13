# Build report - 2026-10-13

**Status:** built

## Verifier

- checked: 261
- failures: 0
- warnings: 1

- WARN `zhuyin/contrasts.json/contrasts[8]/sets[0][1]`: 樂 `ㄌㄜˋ` - matches 簡編本 alt reading, not the first-listed one

## Audio coverage

- MOE human clips: 249
- MOE handbook symbol clips: 37
- TTS clips: 0
- missing / failed: 1056 - 1306, 1350, 1475, 1488, 1501, 1560, 1583, 1585, 1593, 1595, 1630, 1634, 1679, 1694, 1732, 1792, 1973, 2034, 2225, 2236
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

- spans flagged for a listen (longer than expected): 2 - 0579, 1020

## Data

- syllable grid: 405 bases / 1222 toned syllables
- model contours: 219
- docs/ size: 52.3 MB (budget 600 MB)

## Log

```
Build 2026-10-13
Verifying content/ ...
Verifier: 261 Zhuyin strings checked, 0 failures, 1 warnings ⚑
  ⚑ zhuyin/contrasts.json/contrasts[8]/sets[0][1]: 樂 ㄌㄜˋ  — matches 簡編本 alt reading, not the first-listed one
Syllable grid: 405 bases, 1222 toned syllables with MOE audio
Audio ...
  audio: 1305 MOE clips wanted, 1056 not cached, downloading 0 this run (priority order)
    50/1305
    100/1305
    150/1305
    200/1305
    350/1305
  contours: 186 cached, 35 to compute
```
