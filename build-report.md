# Build report - 2026-10-13

**Status:** built

## Verifier

- checked: 261
- failures: 0
- warnings: 1

- WARN `zhuyin/contrasts.json/contrasts[8]/sets[0][1]`: 樂 `ㄌㄜˋ` - matches 簡編本 later 多音 reading, not the first-listed ㄩㄝˋ

## Audio coverage

- MOE human clips: 1300
- MOE handbook symbol clips: 37
- TTS clips: 0
- missing / failed: 5 - 5964, 5082, 1854, 1624, 2110
- content words without an exact-reading MOE clip (browser voice, labelled): 25
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

- spans flagged for a listen (outside the expected length): 0

## Data

- syllable grid: 405 bases / 1222 toned syllables
- model contours: 1272
- docs/ size: 317.1 MB (budget 600 MB)

## Log

```
Build 2026-10-13
Verifying content/ ...
Verifier: 261 Zhuyin strings checked, 0 failures, 1 warnings ⚑
  ⚑ zhuyin/contrasts.json/contrasts[8]/sets[0][1]: 樂 ㄌㄜˋ  — matches 簡編本 later 多音 reading, not the first-listed ㄩㄝˋ
Syllable grid: 405 bases, 1222 toned syllables with MOE audio
Audio ...
  audio: 1305 MOE clips wanted, 5 not cached, downloading 0 this run (priority order)
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
    700/1305
    750/1305
    800/1305
    850/1305
    900/1305
    950/1305
    1000/1305
    1050/1305
    1100/1305
    1150/1305
    1200/1305
    1250/1305
    1300/1305
  contours: 1272 cached, 0 to compute
  contours flagged T4-no-fall: 1 (e.g. 4983)
  contours flagged range: 2 (e.g. 1706 4823)
docs/ size: 317.1 MB (budget 600 MB)
  ! 5 wanted clips are missing: 5964, 5082, 1854, 1624, 2110
Done.
```
