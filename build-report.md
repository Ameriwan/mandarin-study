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

- spans flagged for a listen (longer than expected): 2 - 3222, 1308

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
  audio: 1305 MOE clips wanted, 1056 not cached, downloading 400 this run (priority order)
    fetched 25/400
    fetched 50/400
    fetched 75/400
    fetched 100/400
    fetched 125/400
    fetched 150/400
    fetched 175/400
    fetched 200/400
    fetched 225/400
    fetched 250/400
    fetched 275/400
    fetched 300/400
    fetched 325/400
    fetched 350/400
    fetched 375/400
    fetched 400/400
    50/1305
    100/1305
    150/1305
    200/1305
    downloaded 25/400
    250/1305
    downloaded 50/400
    downloaded 75/400
    300/1305
    downloaded 100/400
    downloaded 125/400
    350/1305
    downloaded 150/400
    downloaded 175/400
    400/1305
    downloaded 200/400
    downloaded 225/400
    450/1305
    downloaded 250/400
    downloaded 275/400
    500/1305
    downloaded 300/400
    550/1305
    downloaded 325/400
    downloaded 350/400
    600/1305
    downloaded 375/400
    downloaded 400/400
  contours: 219 cached, 401 to compute
    100/401
    200/401
    300/401
    400/401
```
