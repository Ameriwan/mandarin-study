# Build report - 2026-10-13

**Status:** built

## Verifier

- checked: 261
- failures: 0
- warnings: 1

- WARN `zhuyin/contrasts.json/contrasts[8]/sets[0][1]`: 樂 `ㄌㄜˋ` - matches 簡編本 alt reading, not the first-listed one

## Audio coverage

- MOE human clips: 1299
- MOE handbook symbol clips: 37
- TTS clips: 0
- missing / failed: 6 - 5964, 5082, 1854, 1624, 2110, 2169
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
- model contours: 1248
- docs/ size: 313.9 MB (budget 600 MB)

## Log

```
Build 2026-10-13
Verifying content/ ...
Verifier: 261 Zhuyin strings checked, 0 failures, 1 warnings ⚑
  ⚑ zhuyin/contrasts.json/contrasts[8]/sets[0][1]: 樂 ㄌㄜˋ  — matches 簡編本 alt reading, not the first-listed one
Syllable grid: 405 bases, 1222 toned syllables with MOE audio
Audio ...
  audio: 1305 MOE clips wanted, 657 not cached, downloading 657 this run (priority order)
    fetched 25/657
    fetched 50/657
    fetched 75/657
    fetched 100/657
    fetched 125/657
    fetched 150/657
    fetched 175/657
    fetched 200/657
    fetched 225/657
    fetched 250/657
    fetched 275/657
    fetched 300/657
    fetched 325/657
    fetched 350/657
    fetched 375/657
    fetched 400/657
    fetched 425/657
    fetched 450/657
    fetched 475/657
    fetched 500/657
    fetched 525/657
    fetched 550/657
    fetched 575/657
    fetched 600/657
    fetched 625/657
    fetched 650/657
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
    650/1305
    downloaded 25/657
    downloaded 50/657
    700/1305
    downloaded 75/657
    downloaded 100/657
    750/1305
    downloaded 125/657
    downloaded 150/657
    800/1305
    downloaded 175/657
    downloaded 200/657
    850/1305
    downloaded 225/657
    downloaded 250/657
    900/1305
    downloaded 275/657
    downloaded 300/657
    950/1305
    downloaded 325/657
    downloaded 350/657
    1000/1305
    downloaded 375/657
    downloaded 400/657
    1050/1305
    downloaded 425/657
    downloaded 450/657
    1100/1305
    downloaded 475/657
    downloaded 500/657
    1150/1305
    downloaded 525/657
    downloaded 550/657
    1200/1305
    downloaded 575/657
    downloaded 600/657
    1250/1305
    downloaded 625/657
    downloaded 650/657
    1300/1305
  contours: 615 cached, 656 to compute
    100/656
    200/656
    300/656
    400/656
    500/656
    600/656
```
