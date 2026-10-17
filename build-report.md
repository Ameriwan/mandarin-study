# Build report - 2026-10-17

**Status:** built

## Verifier

- checked: 3466
- failures: 0
- warnings: 37

- WARN `library/grammar/L1.json[10]/examples[3]`: 這台二手機車兩萬八千塊。 `ㄓㄜˋ ㄊㄞˊ ㄦˋ ㄕㄡˇ ㄐㄧ ㄔㄜ ㄌㄧㄤˇ ㄨㄢˋ ㄅㄚ ㄑㄧㄢ ㄎㄨㄞˋ` - 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/grammar/L1.json[11]/examples[1]`: 他家有兩台機車。 `ㄊㄚ ㄐㄧㄚ ㄧㄡˇ ㄌㄧㄤˇ ㄊㄞˊ ㄐㄧ ㄔㄜ` - 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/grammar/L2a.json[0]/examples[1]`: 我想買一台新機車。 `ㄨㄛˇ ㄒㄧㄤˇ ㄇㄞˇ ㄧ ㄊㄞˊ ㄒㄧㄣ ㄐㄧ ㄔㄜ` - 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/grammar/L2a.json[32]/examples[2]`: 這台洗衣機怎麼用？ `ㄓㄜˋ ㄊㄞˊ ㄒㄧˇ ㄧ ㄐㄧ ㄗㄣˇ ˙ㄇㄜ ㄩㄥˋ` - 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/grammar/L2b.json[26]/examples[1]`: 我等公車等了二十多分鐘。 `ㄨㄛˇ ㄉㄥˇ ㄍㄨㄥ ㄔㄜ ㄉㄥˇ ˙ㄌㄜ ㄦˋ ㄕˊ ㄉㄨㄛ ㄈㄣ ㄓㄨㄥ` - 多分鐘: word-level mismatch (多分 ㄉㄨㄛ ㄈㄣ: no listed reading matches: ㄉㄨㄛ ㄈㄣˋ); read as 多|分鐘
- WARN `library/grammar/L2b.json[26]/mistake/right`: 我等了二十多分鐘。 `ㄨㄛˇ ㄉㄥˇ ˙ㄌㄜ ㄦˋ ㄕˊ ㄉㄨㄛ ㄈㄣ ㄓㄨㄥ` - 多分鐘: word-level mismatch (多分 ㄉㄨㄛ ㄈㄣ: no listed reading matches: ㄉㄨㄛ ㄈㄣˋ); read as 多|分鐘
- WARN `library/grammar/L3a.json[8]/mistake/right`: 我幫你叫一台計程車。 `ㄨㄛˇ ㄅㄤ ㄋㄧˇ ㄐㄧㄠˋ ㄧ ㄊㄞˊ ㄐㄧˋ ㄔㄥˊ ㄔㄜ` - 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/grammar/L3a.json[17]/examples[2]`: 這台機車不但很舊，還常常壞。 `ㄓㄜˋ ㄊㄞˊ ㄐㄧ ㄔㄜ ㄅㄨˋ ㄉㄢˋ ㄏㄣˇ ㄐㄧㄡˋ ㄏㄞˊ ㄔㄤˊ ㄔㄤˊ ㄏㄨㄞˋ` - 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/grammar/L3a.json[27]/examples[2]`: 便當快要賣完了，你要不要先買？ `ㄅㄧㄢˋ ㄉㄤ ㄎㄨㄞˋ ㄧㄠˋ ㄇㄞˋ ㄨㄢˊ ˙ㄌㄜ ㄋㄧˇ ㄧㄠˋ ㄅㄨˋ ㄧㄠˋ ㄒㄧㄢ ㄇㄞˇ` - 完了: matches 簡編本 later 多音 reading, not the first-listed ㄨㄢˊ ㄌㄧㄠˇ
- WARN `library/grammar/L3a.json[43]/examples[2]`: 他高高興興地回家了。 `ㄊㄚ ㄍㄠ ㄍㄠ ㄒㄧㄥˋ ㄒㄧㄥˋ ˙ㄉㄜ ㄏㄨㄟˊ ㄐㄧㄚ ˙ㄌㄜ` - 高高興興: full tone for ˙: 修訂本 writes ㄍㄠ ˙ㄍㄠ ㄒㄧㄥˋ ㄒㄧㄥˋ; spell it as MOE does, with base tones (§6.4)
- WARN `library/grammar/L3a.json[48]/examples[1]`: 欸，你是不是瘦了？ `ㄟˋ ㄋㄧˇ ㄕˋ ㄅㄨˋ ㄕˋ ㄕㄡˋ ˙ㄌㄜ` - 欸: matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
- WARN `library/grammar/L3a.json[54]/examples[1]`: 便當賣完了？那我們去吃麵好了。 `ㄅㄧㄢˋ ㄉㄤ ㄇㄞˋ ㄨㄢˊ ˙ㄌㄜ ㄋㄚˋ ㄨㄛˇ ˙ㄇㄣ ㄑㄩˋ ㄔ ㄇㄧㄢˋ ㄏㄠˇ ˙ㄌㄜ` - 完了: matches 簡編本 later 多音 reading, not the first-listed ㄨㄢˊ ㄌㄧㄠˇ
- WARN `library/grammar/L3b.json[18]/examples[0]`: 這件事很簡單，我一個人做得了。 `ㄓㄜˋ ㄐㄧㄢˋ ㄕˋ ㄏㄣˇ ㄐㄧㄢˇ ㄉㄢ ㄨㄛˇ ㄧ ˙ㄍㄜ ㄖㄣˊ ㄗㄨㄛˋ ˙ㄉㄜ ㄌㄧㄠˇ` - 做得了: matches 修訂本 later 多音 reading, not the first-listed ㄗㄨㄛˋ ㄉㄜˊ ˙ㄌㄜ
- WARN `library/grammar/L3b.json[20]/examples[0]`: 這台車坐得下五個人嗎？ `ㄓㄜˋ ㄊㄞˊ ㄔㄜ ㄗㄨㄛˋ ˙ㄉㄜ ㄒㄧㄚˋ ㄨˇ ㄍㄜˋ ㄖㄣˊ ˙ㄇㄚ` - 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/grammar/L3b.json[37]/examples[1]`: 這本小說你看完了嗎？ `ㄓㄜˋ ㄅㄣˇ ㄒㄧㄠˇ ㄕㄨㄛ ㄋㄧˇ ㄎㄢˋ ㄨㄢˊ ˙ㄌㄜ ˙ㄇㄚ` - 完了: matches 簡編本 later 多音 reading, not the first-listed ㄨㄢˊ ㄌㄧㄠˇ
- WARN `library/grammar/L3c.json[5]/mistake/right`: 我看不出來他生氣了。 `ㄨㄛˇ ㄎㄢˋ ㄅㄨˋ ㄔㄨ ㄌㄞˊ ㄊㄚ ㄕㄥ ㄑㄧˋ ˙ㄌㄜ` - 看不出: full tone for ˙: 修訂本 writes ㄎㄢˋ ˙ㄅㄨ ㄔㄨ; spell it as MOE does, with base tones (§6.4)
- WARN `library/measure-words.csv:8`: 台 `ㄊㄞˊ` - matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/measure-words.csv:8 example_zh`: 我買了一台二手機車。 `ㄨㄛˇ ㄇㄞˇ ˙ㄌㄜ ㄧ ㄊㄞˊ ㄦˋ ㄕㄡˇ ㄐㄧ ㄔㄜ` - 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/phrasebook.csv:42`: 這台公車可以刷一卡通嗎？ `ㄓㄜˋ ㄊㄞˊ ㄍㄨㄥ ㄔㄜ ㄎㄜˇ ㄧˇ ㄕㄨㄚ ㄧ ㄎㄚˇ ㄊㄨㄥ ˙ㄇㄚ` - 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/phrasebook.csv:78`: 什麼時候可以看房子？ `ㄕㄣˊ ˙ㄇㄜ ㄕˊ ㄏㄡˋ ㄎㄜˇ ㄧˇ ㄎㄢˋ ㄈㄤˊ ˙ㄗ` - 看房子: matches 修訂本 later 多音 reading, not the first-listed ㄎㄢ ㄈㄤˊ ˙ㄗ
- WARN `library/taiwan-vs-mainland.csv:11 taiwan`: 高麗菜 `ㄍㄠ ㄌㄧˊ ㄘㄞˋ` - matches TBCL, but 修訂本 writes ㄍㄠ ㄌㄧˋ ㄘㄞˋ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
- WARN `library/taiwan-vs-mainland.csv:34 taiwan`: 欸 `ㄟˋ` - matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
- WARN `library/taiwan-vs-mainland.csv:34 example_zh`: 欸，你的手機掉了。 `ㄟˋ ㄋㄧˇ ˙ㄉㄜ ㄕㄡˇ ㄐㄧ ㄉㄧㄠˋ ˙ㄌㄜ` - 欸: matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
- WARN `shadowing/sentences.csv:60`: 欸，你的錢包掉了！ `ㄟˋ ㄋㄧˇ ˙ㄉㄜ ㄑㄧㄢˊ ㄅㄠ ㄉㄧㄠˋ ˙ㄌㄜ` - 欸: matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
- WARN `units/L1-04.json/dialogue[6]`: 阿明，你要不要喝？ `ㄚ ㄇㄧㄥˊ ㄋㄧˇ ㄧㄠˋ ㄅㄨˋ ㄧㄠˋ ㄏㄜ` - 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
- WARN `units/L1-05.json/dialogue[0]`: 阿芳，現在幾點？ `ㄚ ㄈㄤ ㄒㄧㄢˋ ㄗㄞˋ ㄐㄧˇ ㄉㄧㄢˇ` - 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
- WARN `units/L1-06.json/dialogue[13]`: 哇，這個臭豆腐不錯吃欸！ `ㄨㄚ ㄓㄜˋ ˙ㄍㄜ ㄔㄡˋ ㄉㄡˋ ㄈㄨˇ ㄅㄨˋ ㄘㄨㄛˋ ㄔ ㄟˋ` - 欸: matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
- WARN `units/L1-06.json/shadowing[7]`: 這個臭豆腐不錯吃欸！ `ㄓㄜˋ ˙ㄍㄜ ㄔㄡˋ ㄉㄡˋ ㄈㄨˇ ㄅㄨˋ ㄘㄨㄛˋ ㄔ ㄟˋ` - 欸: matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
- WARN `units/L2-02.json/dialogue[0]`: 阿傑，我明天想去高雄。坐火車還是騎機車比較好？ `ㄚ ㄐㄧㄝˊ ㄨㄛˇ ㄇㄧㄥˊ ㄊㄧㄢ ㄒㄧㄤˇ ㄑㄩˋ ㄍㄠ ㄒㄩㄥˊ ㄗㄨㄛˋ ㄏㄨㄛˇ ㄔㄜ ㄏㄞˊ ㄕˋ ㄑㄧˊ ㄐㄧ ㄔㄜ ㄅㄧˇ ㄐㄧㄠˋ ㄏㄠˇ` - 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
- WARN `units/L2-06.json/writing/model_zh`: 阿傑，不好意思，你剛剛打給我的時候，我在上課，沒聽到。你找我有什麼事嗎？我五點下課，一下課就打給你。如果很急，可以先傳LINE給我喔！ `ㄚ ㄐㄧㄝˊ ㄅㄨˋ ㄏㄠˇ ㄧˋ ˙ㄙ ㄋㄧˇ ㄍㄤ ㄍㄤ ㄉㄚˇ ㄍㄟˇ ㄨㄛˇ ˙ㄉㄜ ㄕˊ ㄏㄡˋ ㄨㄛˇ ㄗㄞˋ ㄕㄤˋ ㄎㄜˋ ㄇㄟˊ ㄊㄧㄥ ㄉㄠˋ ㄋㄧˇ ㄓㄠˇ ㄨㄛˇ ㄧㄡˇ ㄕㄣˊ ˙ㄇㄜ ㄕˋ ˙ㄇㄚ ㄨㄛˇ ㄨˇ ㄉㄧㄢˇ ㄒㄧㄚˋ ㄎㄜˋ ㄧ ㄒㄧㄚˋ ㄎㄜˋ ㄐㄧㄡˋ ㄉㄚˇ ㄍㄟˇ ㄋㄧˇ ㄖㄨˊ ㄍㄨㄛˇ ㄏㄣˇ ㄐㄧˊ ㄎㄜˇ ㄧˇ ㄒㄧㄢ ㄔㄨㄢˊ ㄍㄟˇ ㄨㄛˇ ㄛ` - 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
- WARN `units/L2-07.json/dialogue[1]`: 陳小姐好！對，我是馬克。這是我的朋友阿芳。 `ㄔㄣˊ ㄒㄧㄠˇ ㄐㄧㄝˇ ㄏㄠˇ ㄉㄨㄟˋ ㄨㄛˇ ㄕˋ ㄇㄚˇ ㄎㄜˋ ㄓㄜˋ ㄕˋ ㄨㄛˇ ˙ㄉㄜ ㄆㄥˊ ㄧㄡˇ ㄚ ㄈㄤ` - 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
- WARN `units/L2-07.json/writing/model_zh`: 阿芳，謝謝你今天跟我去看房子！那間套房又大又乾淨，晚上也不會很吵。房租一個月五千二，水費房東付，電費我自己付。押金是兩個月。我下個月一號搬進去，你有空來我家玩喔！ `ㄚ ㄈㄤ ㄒㄧㄝˋ ˙ㄒㄧㄝ ㄋㄧˇ ㄐㄧㄣ ㄊㄧㄢ ㄍㄣ ㄨㄛˇ ㄑㄩˋ ㄎㄢˋ ㄈㄤˊ ˙ㄗ ㄋㄚˋ ㄐㄧㄢ ㄊㄠˋ ㄈㄤˊ ㄧㄡˋ ㄉㄚˋ ㄧㄡˋ ㄍㄢ ㄐㄧㄥˋ ㄨㄢˇ ㄕㄤˋ ㄧㄝˇ ㄅㄨˋ ㄏㄨㄟˋ ㄏㄣˇ ㄔㄠˇ ㄈㄤˊ ㄗㄨ ㄧ ˙ㄍㄜ ㄩㄝˋ ㄨˇ ㄑㄧㄢ ㄦˋ ㄕㄨㄟˇ ㄈㄟˋ ㄈㄤˊ ㄉㄨㄥ ㄈㄨˋ ㄉㄧㄢˋ ㄈㄟˋ ㄨㄛˇ ㄗˋ ㄐㄧˇ ㄈㄨˋ ㄧㄚ ㄐㄧㄣ ㄕˋ ㄌㄧㄤˇ ˙ㄍㄜ ㄩㄝˋ ㄨㄛˇ ㄒㄧㄚˋ ˙ㄍㄜ ㄩㄝˋ ㄧ ㄏㄠˋ ㄅㄢ ㄐㄧㄣˋ ㄑㄩˋ ㄋㄧˇ ㄧㄡˇ ㄎㄨㄥˋ ㄌㄞˊ ㄨㄛˇ ㄐㄧㄚ ㄨㄢˊ ㄛ` - 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ; 看房子: matches 修訂本 later 多音 reading, not the first-listed ㄎㄢ ㄈㄤˊ ˙ㄗ
- WARN `units/L2-08.json/dialogue[0]`: 馬克、阿傑，你們有看新聞嗎？颱風明天就要來了喔！ `ㄇㄚˇ ㄎㄜˋ ㄚ ㄐㄧㄝˊ ㄋㄧˇ ˙ㄇㄣ ㄧㄡˇ ㄎㄢˋ ㄒㄧㄣ ㄨㄣˊ ˙ㄇㄚ ㄊㄞˊ ㄈㄥ ㄇㄧㄥˊ ㄊㄧㄢ ㄐㄧㄡˋ ㄧㄠˋ ㄌㄞˊ ˙ㄌㄜ ㄛ` - 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
- WARN `units/L2-08.json/dialogue[12]`: 好，謝謝阿姨！阿傑，我們現在就去超市吧。 `ㄏㄠˇ ㄒㄧㄝˋ ˙ㄒㄧㄝ ㄚ ㄧˊ ㄚ ㄐㄧㄝˊ ㄨㄛˇ ˙ㄇㄣ ㄒㄧㄢˋ ㄗㄞˋ ㄐㄧㄡˋ ㄑㄩˋ ㄔㄠ ㄕˋ ˙ㄅㄚ` - 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
- WARN `units/L2-08.json/dialogue[13]`: 快去吧！晚一點，泡麵和青菜可能都賣完了。 `ㄎㄨㄞˋ ㄑㄩˋ ˙ㄅㄚ ㄨㄢˇ ㄧ ㄉㄧㄢˇ ㄆㄠˋ ㄇㄧㄢˋ ㄏㄜˊ ㄑㄧㄥ ㄘㄞˋ ㄎㄜˇ ㄋㄥˊ ㄉㄡ ㄇㄞˋ ㄨㄢˊ ˙ㄌㄜ` - 完了: matches 簡編本 later 多音 reading, not the first-listed ㄨㄢˊ ㄌㄧㄠˇ
- WARN `units/L2-08.json/shadowing[6]`: 晚一點，泡麵和青菜可能都賣完了。 `ㄨㄢˇ ㄧ ㄉㄧㄢˇ ㄆㄠˋ ㄇㄧㄢˋ ㄏㄜˊ ㄑㄧㄥ ㄘㄞˋ ㄎㄜˇ ㄋㄥˊ ㄉㄡ ㄇㄞˋ ㄨㄢˊ ˙ㄌㄜ` - 完了: matches 簡編本 later 多音 reading, not the first-listed ㄨㄢˊ ㄌㄧㄠˇ
- WARN `zhuyin/contrasts.json/contrasts[8]/sets[0][1]`: 樂 `ㄌㄜˋ` - matches 簡編本 later 多音 reading, not the first-listed ㄩㄝˋ

## Audio coverage

- MOE human clips: 1483
- MOE handbook symbol clips: 37
- TTS clips: 1953
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
  - 便當 ㄅㄧㄢˋ ㄉㄤ
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
- docs/ size: 411.9 MB (budget 600 MB)

## MOE clips not playable (id published as null: the pages use the labelled browser voice)

- self-hosted clips not published (404 on the moedict CDN / download failed / not downloaded yet): 5
  - 裳 5082 (404 on the moedict CDN)
  - 呀 5964 (404 on the moedict CDN)
  - 哩 1854 (404 on the moedict CDN)
  - 氌 2110 (404 on the moedict CDN)
  - 湳 1624 (404 on the moedict CDN)
- streamed entries whose clip is missing on the CDN (404) or failed to download: 13
  - 門 0660 (404 on the moedict CDN)
  - 呀 5964 (404 on the moedict CDN)
  - 妳 1640 (404 on the moedict CDN)
  - 可愛 250800040 (404 on the moedict CDN)
  - 華語 284700012 (404 on the moedict CDN)
  - 老闆娘 179200009 (404 on the moedict CDN)
  - 老板娘 179200007 (404 on the moedict CDN)
  - 電池 120900099 (404 on the moedict CDN)
  - 成人 478200034 (404 on the moedict CDN)
  - 自殺 530000103 (404 on the moedict CDN)
  - 原子筆 655100044 (404 on the moedict CDN)
  - L1-03 老闆娘 179200009 (404 on the moedict CDN)
  - L2-06 可愛 250800040 (404 on the moedict CDN)

## Licenses (§7.5)

- published files and audio folders checked against build.py PUBLISHED and content/sources.md: 32, problems: 0

## Shadowing (shadowing.json, M3)

- sentences: 102 (by level: {'第1級': 28, '第2級': 38, '第3級': 36}); without TTS audio: 0
- sentence focus values: {'3+3': 11, 'yi': 9, 'aspiration': 9, 'bu': 8, 'r-l': 7, 'half3': 7, 'neutral': 7, 'j-zh-z': 6, 'q-ch-c': 6, 'an-ang': 6, 'yu-i-u': 6, 'en-eng': 5, 'e-uo-a': 5, 'x-sh-s': 5, 'tones': 5}
- MOE dictionary readings: 111, 9.57-24.94 s (median 13.54 s)
- reading segments: 538, with a model contour: 386 (segments <= 3.5 s)
- shadowing audio in docs/: 15.6 MB
- notes: 1
-   - 36 of 311 connected-speech segment contours failed the sanity gate (contours.span_gate: jump 28, range 12, voiced 1), not published (no overlay on those lines)

## Library and placement (M4)

- library words: 2889 rows / 2847 TBCL forms (第1級-第4*級); with an exact-reading MOE clip 2404, with a measured span 2404, without an English gloss 5
- readings: 58 TBCL readings respelled as MOE spells them (sandhi / neutral tone, or TBCL and MOE disagree and MOE agrees with itself or has the audio, §9.3), 21 kept with a ⚑, 2 TBCL readings failing the verifier left out, 3 words with MOE's reading only, 3 words dropped
- grammar points 241, patterns 60, measure words 40, Taiwan-usage rows 34, phrases 120
- placement: 80 questions, 28 diagnostic words, 40 level-5 words
- sentences with TTS audio: 1354 / 1354 (the rest: browser voice, labelled)
- dropped (3): 接着 ㄐㄧㄝ ˙ㄓㄜ; 差一點 ㄔㄚ ㄧˋ ㄉㄧㄢ; 沒(有)用 (not all Chinese characters)
- tbcl_fail (2): 接着 ㄐㄧㄝ ˙ㄓㄜ (TBCL only; per character: 着 ˙ㄓㄜ: not in any source); 差一點 ㄔㄚ ㄧˋ ㄉㄧㄢ (TBCL only; per character: 點 ㄉㄧㄢ: no listed reading matches: ㄉㄧㄢˇ)
- respelled (58): 一起 ㄧˋ ㄑㄧˇ -> ㄧ ㄑㄧˇ; 不錯 ㄅㄨˊ ㄘㄨㄛˋ -> ㄅㄨˋ ㄘㄨㄛˋ; 為什麼 ㄨㄟˋ ㄕㄣˊ ˙ㄇㄛ -> ㄨㄟˋ ㄕㄣˊ ˙ㄇㄜ; 一點 ㄧˋ ㄉㄧㄢˇ -> ㄧ ㄉㄧㄢˇ; 一點點 ㄧˋ ㄉㄧㄢˇ ㄉㄧㄢˇ -> ㄧ ㄉㄧㄢˇ ㄉㄧㄢˇ; 一點兒 ㄧˋ ㄉㄧㄢˇ ㄦ -> ㄧ ㄉㄧㄢˇ ㄦ; 一定 ㄧˊ ㄉㄧㄥˋ -> ㄧ ㄉㄧㄥˋ; 一共 ㄧˊ ㄍㄨㄥˋ -> ㄧ ㄍㄨㄥˋ; 一些 ㄧˋ ㄒㄧㄝ -> ㄧ ㄒㄧㄝ; 一樣 ㄧˊ ㄧㄤˋ -> ㄧ ㄧㄤˋ; 有一點 ㄧㄡˇ ㄧˋ ㄉㄧㄢˇ -> ㄧㄡˇ ㄧ ㄉㄧㄢˇ (TBCL only); 有時候 ㄧㄡˇ ㄕˊ ㄏㄡˋ -> ㄧㄡˇ ㄕˊ ˙ㄏㄡ; 不過 ㄅㄨˊ ㄍㄨㄛˋ -> ㄅㄨˋ ㄍㄨㄛˋ; 一半 ㄧˊ ㄅㄢˋ -> ㄧ ㄅㄢˋ; 一下子 ㄧˊ ㄒㄧㄚˋ ˙ㄗ -> ㄧ ㄒㄧㄚˋ ˙ㄗ; 一下 ㄧˊ ㄒㄧㄚˋ -> ㄧ ㄒㄧㄚˋ; 一直 ㄧˋ ㄓˊ -> ㄧ ㄓˊ; 不見了 ㄅㄨˊ ㄐㄧㄢˋ ˙ㄌㄜ -> ㄅㄨˋ ㄐㄧㄢˋ ˙ㄌㄜ (TBCL only); 不客氣 ㄅㄨˊ ㄎㄜˋ ㄑㄧˋ -> ㄅㄨˋ ㄎㄜˋ ㄑㄧˋ; 喂 ㄨㄟˊ -> ㄨㄟˋ; 一會 ㄧˋ ㄏㄨㄟˇ -> ㄧ ㄏㄨㄟˇ; 一會兒 ㄧˋ ㄏㄨㄟˇ ㄦ -> ㄧ ㄏㄨㄟˇ ㄦ; 一塊 ㄧˊ ㄎㄨㄞˋ -> ㄧ ㄎㄨㄞˋ; 一塊兒 ㄧˊ ㄎㄨㄞˋ ㄦ -> ㄧ ㄎㄨㄞˋ ㄦ; 不必 ㄅㄨˊ ㄅㄧˋ -> ㄅㄨˋ ㄅㄧˋ; 不但 ㄅㄨˊ ㄉㄢˋ -> ㄅㄨˋ ㄉㄢˋ; 不用 ㄅㄨˊ ㄩㄥˋ -> ㄅㄨˋ ㄩㄥˋ; 留下 ㄌㄧㄡˊ ㄒㄧㄚˋ -> ㄌㄧㄡˊ ˙ㄒㄧㄚ; 一般 ㄧˋ ㄅㄢ -> ㄧ ㄅㄢ; 一切 ㄧˊ ㄑㄧㄝˋ -> ㄧ ㄑㄧㄝˋ; 做生意 ㄗㄨㄛˋ ㄕㄥ ㄧˋ -> ㄗㄨㄛˋ ㄕㄥ ˙ㄧ; 阿嬤 ㄚ ˙ㄇㄚ -> ㄚ ㄇㄚ (TBCL only); 阿媽 ㄚ ˙ㄇㄚ -> ㄚ ㄇㄚ; 哎呀 ㄞ ˙ㄧㄚ -> ㄞ ㄧㄚ; 不斷 ㄅㄨˊ ㄉㄨㄢˋ -> ㄅㄨˋ ㄉㄨㄢˋ; 不論 ㄅㄨˊ ㄌㄨㄣˋ -> ㄅㄨˋ ㄌㄨㄣˋ; 噢 ˙ㄛ -> ㄛ; 一邊 ㄧˋ ㄅㄧㄢ -> ㄧ ㄅㄧㄢ; 一同 ㄧˋ ㄊㄨㄥˊ -> ㄧ ㄊㄨㄥˊ; 主角 ㄓㄨˇ ㄐㄧㄠˇ -> ㄓㄨˇ ㄐㄩㄝˊ …
- kept_warn (21): 和 ㄏㄢˋ (matches TBCL, but 簡編本 lists it only as a 語音 reading (first-listed ㄏㄜˊ); the app teaches the first-listed reading); 哪兒 ㄋㄚˇ ㄦ (TBCL only; 兒: matches 簡編本 later 多音 reading, not the first-listed ㄦˊ); 台灣 ㄊㄞˊ ㄨㄢ (TBCL only; 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 台灣人 ㄊㄞˊ ㄨㄢ ㄖㄣˊ (TBCL only; 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 小孩子 ㄒㄧㄠˇ ㄏㄞˊ ˙ㄗ (TBCL only; 子: matches 簡編本 later 多音 reading, not the first-listed ㄗˇ); 台 ㄊㄞˊ (matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 不見了 ㄅㄨˋ ㄐㄧㄢˋ ˙ㄌㄜ (TBCL only; 了: matches 簡編本 later 多音 reading, not the first-listed ㄌㄧㄠˇ); 台語 ㄊㄞˊ ㄩˇ (TBCL only; 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 除了 ㄔㄨˊ ˙ㄌㄜ (TBCL only; 了: matches 簡編本 later 多音 reading, not the first-listed ㄌㄧㄠˇ); 月台 ㄩㄝˋ ㄊㄞˊ (TBCL only; 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 阿嬤 ㄚ ㄇㄚ (TBCL only; 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ); 高麗菜 ㄍㄠ ㄌㄧˊ ㄘㄞˋ (matches TBCL, but 修訂本 writes ㄍㄠ ㄌㄧˋ ㄘㄞˋ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 櫃台 ㄍㄨㄟˋ ㄊㄞˊ (TBCL only; 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 手指頭 ㄕㄡˇ ㄓˇ ˙ㄊㄡ (TBCL only; 頭: matches 簡編本 later 多音 reading, not the first-listed ㄊㄡˊ); 舞台 ㄨˇ ㄊㄞˊ (TBCL only; 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 新台幣 ㄒㄧㄣ ㄊㄞˊ ㄅㄧˋ (TBCL only; 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 台幣 ㄊㄞˊ ㄅㄧˋ (TBCL only; 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 待會 ㄉㄞˋ ㄏㄨㄟˇ (TBCL only; 會: matches 簡編本 later 多音 reading, not the first-listed ㄏㄨㄟˋ); 待會兒 ㄉㄞˋ ㄏㄨㄟˇ ㄦ (TBCL only; 會: matches 簡編本 later 多音 reading, not the first-listed ㄏㄨㄟˋ; 兒: matches 簡編本 later 多音 reading, not the first-listed ㄦˊ); 電視台 ㄉㄧㄢˋ ㄕˋ ㄊㄞˊ (TBCL only; 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)); 陽台 ㄧㄤˊ ㄊㄞˊ (TBCL only; 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3))
- no_gloss (5): 臺灣人 ㄊㄞˊ ㄨㄢ ㄖㄣˊ; 台灣人 ㄊㄞˊ ㄨㄢ ㄖㄣˊ; 巷口 ㄒㄧㄤˋ ㄎㄡˇ; 中文系 ㄓㄨㄥ ㄨㄣˊ ㄒㄧˋ; 扣子 ㄎㄡˋ ˙ㄗ

## Units, plan, reading, advanced (M5, M6)

- units: 16 (L1-01, L1-02, L1-03, L1-04, L1-05, L1-06, L1-07, L1-08, L2-01, L2-02, L2-03, L2-04, L2-05, L2-06, L2-07, L2-08); dialogue + shadowing lines 338, with TTS audio 338; vocabulary 305, with an exact-reading MOE clip 252, with a measured span 252
- plan.json released units: 16
- reading: 16 texts, 196 sentences, with TTS audio 196
- advanced: 30 journal prompts, 12 monologue topics, 6 role-plays (78 lines, with TTS audio 78), 40 register pairs, 60 news words
- chengyu: 60 idioms (MOE 成語典, unmodified); resources: 28 links; characters: 3133 TBCL characters, 214 radicals
- resources notes (1): 1 links not verified (shown marked): legit-mando

## Log

```
Build 2026-10-17
Verifying content/ ...
Verifier: 3466 Zhuyin strings checked, 0 failures, 37 warnings ⚑
  ⚑ library/grammar/L1.json[10]/examples[3]: 這台二手機車兩萬八千塊。 ㄓㄜˋ ㄊㄞˊ ㄦˋ ㄕㄡˇ ㄐㄧ ㄔㄜ ㄌㄧㄤˇ ㄨㄢˋ ㄅㄚ ㄑㄧㄢ ㄎㄨㄞˋ  — 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/grammar/L1.json[11]/examples[1]: 他家有兩台機車。 ㄊㄚ ㄐㄧㄚ ㄧㄡˇ ㄌㄧㄤˇ ㄊㄞˊ ㄐㄧ ㄔㄜ  — 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/grammar/L2a.json[0]/examples[1]: 我想買一台新機車。 ㄨㄛˇ ㄒㄧㄤˇ ㄇㄞˇ ㄧ ㄊㄞˊ ㄒㄧㄣ ㄐㄧ ㄔㄜ  — 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/grammar/L2a.json[32]/examples[2]: 這台洗衣機怎麼用？ ㄓㄜˋ ㄊㄞˊ ㄒㄧˇ ㄧ ㄐㄧ ㄗㄣˇ ˙ㄇㄜ ㄩㄥˋ  — 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/grammar/L2b.json[26]/examples[1]: 我等公車等了二十多分鐘。 ㄨㄛˇ ㄉㄥˇ ㄍㄨㄥ ㄔㄜ ㄉㄥˇ ˙ㄌㄜ ㄦˋ ㄕˊ ㄉㄨㄛ ㄈㄣ ㄓㄨㄥ  — 多分鐘: word-level mismatch (多分 ㄉㄨㄛ ㄈㄣ: no listed reading matches: ㄉㄨㄛ ㄈㄣˋ); read as 多|分鐘
  ⚑ library/grammar/L2b.json[26]/mistake/right: 我等了二十多分鐘。 ㄨㄛˇ ㄉㄥˇ ˙ㄌㄜ ㄦˋ ㄕˊ ㄉㄨㄛ ㄈㄣ ㄓㄨㄥ  — 多分鐘: word-level mismatch (多分 ㄉㄨㄛ ㄈㄣ: no listed reading matches: ㄉㄨㄛ ㄈㄣˋ); read as 多|分鐘
  ⚑ library/grammar/L3a.json[8]/mistake/right: 我幫你叫一台計程車。 ㄨㄛˇ ㄅㄤ ㄋㄧˇ ㄐㄧㄠˋ ㄧ ㄊㄞˊ ㄐㄧˋ ㄔㄥˊ ㄔㄜ  — 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/grammar/L3a.json[17]/examples[2]: 這台機車不但很舊，還常常壞。 ㄓㄜˋ ㄊㄞˊ ㄐㄧ ㄔㄜ ㄅㄨˋ ㄉㄢˋ ㄏㄣˇ ㄐㄧㄡˋ ㄏㄞˊ ㄔㄤˊ ㄔㄤˊ ㄏㄨㄞˋ  — 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/grammar/L3a.json[27]/examples[2]: 便當快要賣完了，你要不要先買？ ㄅㄧㄢˋ ㄉㄤ ㄎㄨㄞˋ ㄧㄠˋ ㄇㄞˋ ㄨㄢˊ ˙ㄌㄜ ㄋㄧˇ ㄧㄠˋ ㄅㄨˋ ㄧㄠˋ ㄒㄧㄢ ㄇㄞˇ  — 完了: matches 簡編本 later 多音 reading, not the first-listed ㄨㄢˊ ㄌㄧㄠˇ
  ⚑ library/grammar/L3a.json[43]/examples[2]: 他高高興興地回家了。 ㄊㄚ ㄍㄠ ㄍㄠ ㄒㄧㄥˋ ㄒㄧㄥˋ ˙ㄉㄜ ㄏㄨㄟˊ ㄐㄧㄚ ˙ㄌㄜ  — 高高興興: full tone for ˙: 修訂本 writes ㄍㄠ ˙ㄍㄠ ㄒㄧㄥˋ ㄒㄧㄥˋ; spell it as MOE does, with base tones (§6.4)
  ⚑ library/grammar/L3a.json[48]/examples[1]: 欸，你是不是瘦了？ ㄟˋ ㄋㄧˇ ㄕˋ ㄅㄨˋ ㄕˋ ㄕㄡˋ ˙ㄌㄜ  — 欸: matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
  ⚑ library/grammar/L3a.json[54]/examples[1]: 便當賣完了？那我們去吃麵好了。 ㄅㄧㄢˋ ㄉㄤ ㄇㄞˋ ㄨㄢˊ ˙ㄌㄜ ㄋㄚˋ ㄨㄛˇ ˙ㄇㄣ ㄑㄩˋ ㄔ ㄇㄧㄢˋ ㄏㄠˇ ˙ㄌㄜ  — 完了: matches 簡編本 later 多音 reading, not the first-listed ㄨㄢˊ ㄌㄧㄠˇ
  ⚑ library/grammar/L3b.json[18]/examples[0]: 這件事很簡單，我一個人做得了。 ㄓㄜˋ ㄐㄧㄢˋ ㄕˋ ㄏㄣˇ ㄐㄧㄢˇ ㄉㄢ ㄨㄛˇ ㄧ ˙ㄍㄜ ㄖㄣˊ ㄗㄨㄛˋ ˙ㄉㄜ ㄌㄧㄠˇ  — 做得了: matches 修訂本 later 多音 reading, not the first-listed ㄗㄨㄛˋ ㄉㄜˊ ˙ㄌㄜ
  ⚑ library/grammar/L3b.json[20]/examples[0]: 這台車坐得下五個人嗎？ ㄓㄜˋ ㄊㄞˊ ㄔㄜ ㄗㄨㄛˋ ˙ㄉㄜ ㄒㄧㄚˋ ㄨˇ ㄍㄜˋ ㄖㄣˊ ˙ㄇㄚ  — 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/grammar/L3b.json[37]/examples[1]: 這本小說你看完了嗎？ ㄓㄜˋ ㄅㄣˇ ㄒㄧㄠˇ ㄕㄨㄛ ㄋㄧˇ ㄎㄢˋ ㄨㄢˊ ˙ㄌㄜ ˙ㄇㄚ  — 完了: matches 簡編本 later 多音 reading, not the first-listed ㄨㄢˊ ㄌㄧㄠˇ
  ⚑ library/grammar/L3c.json[5]/mistake/right: 我看不出來他生氣了。 ㄨㄛˇ ㄎㄢˋ ㄅㄨˋ ㄔㄨ ㄌㄞˊ ㄊㄚ ㄕㄥ ㄑㄧˋ ˙ㄌㄜ  — 看不出: full tone for ˙: 修訂本 writes ㄎㄢˋ ˙ㄅㄨ ㄔㄨ; spell it as MOE does, with base tones (§6.4)
  ⚑ library/measure-words.csv:8: 台 ㄊㄞˊ  — matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/measure-words.csv:8 example_zh: 我買了一台二手機車。 ㄨㄛˇ ㄇㄞˇ ˙ㄌㄜ ㄧ ㄊㄞˊ ㄦˋ ㄕㄡˇ ㄐㄧ ㄔㄜ  — 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/phrasebook.csv:42: 這台公車可以刷一卡通嗎？ ㄓㄜˋ ㄊㄞˊ ㄍㄨㄥ ㄔㄜ ㄎㄜˇ ㄧˇ ㄕㄨㄚ ㄧ ㄎㄚˇ ㄊㄨㄥ ˙ㄇㄚ  — 台: matches TBCL, but 修訂本 writes ㄊㄞ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/phrasebook.csv:78: 什麼時候可以看房子？ ㄕㄣˊ ˙ㄇㄜ ㄕˊ ㄏㄡˋ ㄎㄜˇ ㄧˇ ㄎㄢˋ ㄈㄤˊ ˙ㄗ  — 看房子: matches 修訂本 later 多音 reading, not the first-listed ㄎㄢ ㄈㄤˊ ˙ㄗ
  ⚑ library/taiwan-vs-mainland.csv:11 taiwan: 高麗菜 ㄍㄠ ㄌㄧˊ ㄘㄞˋ  — matches TBCL, but 修訂本 writes ㄍㄠ ㄌㄧˋ ㄘㄞˋ; TBCL and MOE disagree, prefer the one with MOE audio (§9.3)
  ⚑ library/taiwan-vs-mainland.csv:34 taiwan: 欸 ㄟˋ  — matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
  ⚑ library/taiwan-vs-mainland.csv:34 example_zh: 欸，你的手機掉了。 ㄟˋ ㄋㄧˇ ˙ㄉㄜ ㄕㄡˇ ㄐㄧ ㄉㄧㄠˋ ˙ㄌㄜ  — 欸: matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
  ⚑ shadowing/sentences.csv:60: 欸，你的錢包掉了！ ㄟˋ ㄋㄧˇ ˙ㄉㄜ ㄑㄧㄢˊ ㄅㄠ ㄉㄧㄠˋ ˙ㄌㄜ  — 欸: matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
  ⚑ units/L1-04.json/dialogue[6]: 阿明，你要不要喝？ ㄚ ㄇㄧㄥˊ ㄋㄧˇ ㄧㄠˋ ㄅㄨˋ ㄧㄠˋ ㄏㄜ  — 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
  ⚑ units/L1-05.json/dialogue[0]: 阿芳，現在幾點？ ㄚ ㄈㄤ ㄒㄧㄢˋ ㄗㄞˋ ㄐㄧˇ ㄉㄧㄢˇ  — 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
  ⚑ units/L1-06.json/dialogue[13]: 哇，這個臭豆腐不錯吃欸！ ㄨㄚ ㄓㄜˋ ˙ㄍㄜ ㄔㄡˋ ㄉㄡˋ ㄈㄨˇ ㄅㄨˋ ㄘㄨㄛˋ ㄔ ㄟˋ  — 欸: matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
  ⚑ units/L1-06.json/shadowing[7]: 這個臭豆腐不錯吃欸！ ㄓㄜˋ ˙ㄍㄜ ㄔㄡˋ ㄉㄡˋ ㄈㄨˇ ㄅㄨˋ ㄘㄨㄛˋ ㄔ ㄟˋ  — 欸: matches 簡編本 later 多音 reading, not the first-listed ㄞˇ
  ⚑ units/L2-02.json/dialogue[0]: 阿傑，我明天想去高雄。坐火車還是騎機車比較好？ ㄚ ㄐㄧㄝˊ ㄨㄛˇ ㄇㄧㄥˊ ㄊㄧㄢ ㄒㄧㄤˇ ㄑㄩˋ ㄍㄠ ㄒㄩㄥˊ ㄗㄨㄛˋ ㄏㄨㄛˇ ㄔㄜ ㄏㄞˊ ㄕˋ ㄑㄧˊ ㄐㄧ ㄔㄜ ㄅㄧˇ ㄐㄧㄠˋ ㄏㄠˇ  — 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
  ⚑ units/L2-06.json/writing/model_zh: 阿傑，不好意思，你剛剛打給我的時候，我在上課，沒聽到。你找我有什麼事嗎？我五點下課，一下課就打給你。如果很急，可以先傳LINE給我喔！ ㄚ ㄐㄧㄝˊ ㄅㄨˋ ㄏㄠˇ ㄧˋ ˙ㄙ ㄋㄧˇ ㄍㄤ ㄍㄤ ㄉㄚˇ ㄍㄟˇ ㄨㄛˇ ˙ㄉㄜ ㄕˊ ㄏㄡˋ ㄨㄛˇ ㄗㄞˋ ㄕㄤˋ ㄎㄜˋ ㄇㄟˊ ㄊㄧㄥ ㄉㄠˋ ㄋㄧˇ ㄓㄠˇ ㄨㄛˇ ㄧㄡˇ ㄕㄣˊ ˙ㄇㄜ ㄕˋ ˙ㄇㄚ ㄨㄛˇ ㄨˇ ㄉㄧㄢˇ ㄒㄧㄚˋ ㄎㄜˋ ㄧ ㄒㄧㄚˋ ㄎㄜˋ ㄐㄧㄡˋ ㄉㄚˇ ㄍㄟˇ ㄋㄧˇ ㄖㄨˊ ㄍㄨㄛˇ ㄏㄣˇ ㄐㄧˊ ㄎㄜˇ ㄧˇ ㄒㄧㄢ ㄔㄨㄢˊ ㄍㄟˇ ㄨㄛˇ ㄛ  — 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
  ⚑ units/L2-07.json/dialogue[1]: 陳小姐好！對，我是馬克。這是我的朋友阿芳。 ㄔㄣˊ ㄒㄧㄠˇ ㄐㄧㄝˇ ㄏㄠˇ ㄉㄨㄟˋ ㄨㄛˇ ㄕˋ ㄇㄚˇ ㄎㄜˋ ㄓㄜˋ ㄕˋ ㄨㄛˇ ˙ㄉㄜ ㄆㄥˊ ㄧㄡˇ ㄚ ㄈㄤ  — 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
  ⚑ units/L2-07.json/writing/model_zh: 阿芳，謝謝你今天跟我去看房子！那間套房又大又乾淨，晚上也不會很吵。房租一個月五千二，水費房東付，電費我自己付。押金是兩個月。我下個月一號搬進去，你有空來我家玩喔！ ㄚ ㄈㄤ ㄒㄧㄝˋ ˙ㄒㄧㄝ ㄋㄧˇ ㄐㄧㄣ ㄊㄧㄢ ㄍㄣ ㄨㄛˇ ㄑㄩˋ ㄎㄢˋ ㄈㄤˊ ˙ㄗ ㄋㄚˋ ㄐㄧㄢ ㄊㄠˋ ㄈㄤˊ ㄧㄡˋ ㄉㄚˋ ㄧㄡˋ ㄍㄢ ㄐㄧㄥˋ ㄨㄢˇ ㄕㄤˋ ㄧㄝˇ ㄅㄨˋ ㄏㄨㄟˋ ㄏㄣˇ ㄔㄠˇ ㄈㄤˊ ㄗㄨ ㄧ ˙ㄍㄜ ㄩㄝˋ ㄨˇ ㄑㄧㄢ ㄦˋ ㄕㄨㄟˇ ㄈㄟˋ ㄈㄤˊ ㄉㄨㄥ ㄈㄨˋ ㄉㄧㄢˋ ㄈㄟˋ ㄨㄛˇ ㄗˋ ㄐㄧˇ ㄈㄨˋ ㄧㄚ ㄐㄧㄣ ㄕˋ ㄌㄧㄤˇ ˙ㄍㄜ ㄩㄝˋ ㄨㄛˇ ㄒㄧㄚˋ ˙ㄍㄜ ㄩㄝˋ ㄧ ㄏㄠˋ ㄅㄢ ㄐㄧㄣˋ ㄑㄩˋ ㄋㄧˇ ㄧㄡˇ ㄎㄨㄥˋ ㄌㄞˊ ㄨㄛˇ ㄐㄧㄚ ㄨㄢˊ ㄛ  — 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ; 看房子: matches 修訂本 later 多音 reading, not the first-listed ㄎㄢ ㄈㄤˊ ˙ㄗ
  ⚑ units/L2-08.json/dialogue[0]: 馬克、阿傑，你們有看新聞嗎？颱風明天就要來了喔！ ㄇㄚˇ ㄎㄜˋ ㄚ ㄐㄧㄝˊ ㄋㄧˇ ˙ㄇㄣ ㄧㄡˇ ㄎㄢˋ ㄒㄧㄣ ㄨㄣˊ ˙ㄇㄚ ㄊㄞˊ ㄈㄥ ㄇㄧㄥˊ ㄊㄧㄢ ㄐㄧㄡˋ ㄧㄠˋ ㄌㄞˊ ˙ㄌㄜ ㄛ  — 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
  ⚑ units/L2-08.json/dialogue[12]: 好，謝謝阿姨！阿傑，我們現在就去超市吧。 ㄏㄠˇ ㄒㄧㄝˋ ˙ㄒㄧㄝ ㄚ ㄧˊ ㄚ ㄐㄧㄝˊ ㄨㄛˇ ˙ㄇㄣ ㄒㄧㄢˋ ㄗㄞˋ ㄐㄧㄡˋ ㄑㄩˋ ㄔㄠ ㄕˋ ˙ㄅㄚ  — 阿: matches 簡編本 later 多音 reading, not the first-listed ㄜ
  ⚑ units/L2-08.json/dialogue[13]: 快去吧！晚一點，泡麵和青菜可能都賣完了。 ㄎㄨㄞˋ ㄑㄩˋ ˙ㄅㄚ ㄨㄢˇ ㄧ ㄉㄧㄢˇ ㄆㄠˋ ㄇㄧㄢˋ ㄏㄜˊ ㄑㄧㄥ ㄘㄞˋ ㄎㄜˇ ㄋㄥˊ ㄉㄡ ㄇㄞˋ ㄨㄢˊ ˙ㄌㄜ  — 完了: matches 簡編本 later 多音 reading, not the first-listed ㄨㄢˊ ㄌㄧㄠˇ
  ⚑ units/L2-08.json/shadowing[6]: 晚一點，泡麵和青菜可能都賣完了。 ㄨㄢˇ ㄧ ㄉㄧㄢˇ ㄆㄠˋ ㄇㄧㄢˋ ㄏㄜˊ ㄑㄧㄥ ㄘㄞˋ ㄎㄜˇ ㄋㄥˊ ㄉㄡ ㄇㄞˋ ㄨㄢˊ ˙ㄌㄜ  — 完了: matches 簡編本 later 多音 reading, not the first-listed ㄨㄢˊ ㄌㄧㄠˇ
  ⚑ zhuyin/contrasts.json/contrasts[8]/sets[0][1]: 樂 ㄌㄜˋ  — matches 簡編本 later 多音 reading, not the first-listed ㄩㄝˋ
Tone Gym content (spoken forms, §6.4) ...
  pairs 119 (20 core), sandhi items 85, readings 38, sandhi failures 0
Shadowing content (M3) ...
  sentences 102, MOE readings 111
Library and placement (M4) ...
  library: 2889 words (2847 TBCL forms 第1級-第4*級), 241 grammar points, 60 patterns, 40 measure words, 34 Taiwan-usage rows, 120 phrases; placement 80 questions, 28 diagnostic words, 40 level-5 words
  library words: respelled 58, kept_warn 21, tbcl_fail 2, moe_only 3, dropped 3, no_gloss 5
Units, plan, reading, advanced (M5, M6) ...
  units: 16 (L1-01, L1-02, L1-03, L1-04, L1-05, L1-06, L1-07, L1-08, L2-01, L2-02, L2-03, L2-04, L2-05, L2-06, L2-07, L2-08); dialogue + shadowing lines 338, with TTS audio 338; vocabulary 305, with an exact-reading MOE clip 254, with a measured span 252
  plan.json released units: 16
  reading: 16 texts, 196 sentences, with TTS audio 196
  advanced: 30 journal prompts, 12 monologue topics, 6 role-plays (78 lines, with TTS audio 78), 40 register pairs, 60 news words
  chengyu: 60 idioms (MOE 成語典, unmodified); resources: 28 links; characters: 3133 TBCL characters, 214 radicals
Syllable grid: 405 bases, 1222 toned syllables with MOE audio
Audio ...
  audio: 1489 MOE clips wanted, 6 not cached (0 known to be missing on the CDN), downloading 6 this run (priority order)
    50/1489
    100/1489
    150/1489
    200/1489
    250/1489
    300/1489
    350/1489
    400/1489
    450/1489
    500/1489
    550/1489
    600/1489
    650/1489
    700/1489
    750/1489
    800/1489
    850/1489
    900/1489
    950/1489
    1000/1489
    1050/1489
    1100/1489
    1150/1489
    1200/1489
    1250/1489
    1300/1489
    1350/1489
    1400/1489
    1450/1489
    TTS requested 50 (0 failed)
  TTS: 1953 sentences, 1902 cached, 51 requested (0 failed), 0 left for a later build (--max-tts / rate limit / --no-audio)
  ! MOE clips not published, id set to null (browser voice, labelled): 5 self-hosted, 2 streamed entries (see the report)
  span contours: 422 cached, 0 to compute
  36 of 311 connected-speech segment contours failed the sanity gate (contours.span_gate: jump 28, range 12, voiced 1), not published (no overlay on those lines); e.g. 牛奶:2 牛奶:4 飲料:2 飲料:3 開車:4 醫生:2 休息:2 生病:2
  shadowing: 102 sentences (102 with TTS), 111 MOE readings, 538 segments, 386/422 segment contours
  ⚑ 36 of 311 connected-speech segment contours failed the sanity gate (contours.span_gate: jump 28, range 12, voiced 1), not published (no overlay on those lines)
  contours: 1434 cached, 0 to compute
  contours flagged T4-no-fall: 1 (e.g. 4983)
  contours flagged range: 6 (e.g. 028500347 080500057 1706 4823 566500012 583700066)
  sandhi clips that do not say the taught tone (kept for display, left out of the check and mirror): 10: 一天 一=ㄧˋ heard level; 一些 一=ㄧˋ heard level; 一般 一=ㄧˋ heard level; 一時 一=ㄧˋ heard level; 一起 一=ㄧˋ heard level; 一點 一=ㄧˋ heard level; 統一 一=ㄧ heard rise; 撐不住 不=ㄅㄨˊ heard fall; 行不通 不=ㄅㄨˋ heard level; 小不點 不=ㄅㄨˋ heard level
Tone ID pool: 527 single syllables (TBCL ≤ 第3*級, first-listed reading that the TBCL word list gives the character, tone 1-4, clip + contour)
  Tone ID uses another character than the grid for 4 syllables: ㄇㄛˋ 沒→末, ㄉㄧˋ 的→弟, ㄍㄜˋ 個→各, ㄐㄧˇ 給→幾
  ! 6 wanted clips are missing: 0660, 5964, 5082, 1854, 1624, 2110
docs/ size: 411.9 MB (budget 600 MB; shadowing audio 15.6 MB)
Site data written.
Library word audio: headword spans of the streamed MOE clips ...
  streamed clips: 2467 wanted, 2458 spans known, 0 measured from the cache, 0 known to be missing on the CDN (404), 9 not cached, downloading 9 this run
    streamed clips: 9/9 fetched (0 failed, 9 404)
  streamed clips: 0 spans measured this run (0 downloaded, 9 failed, 9 missing on the CDN); 2490 streamed entries have a span; 13 streamed entries published without a clip (id null, browser voice); 0 clips still to fetch (rerun the build)
Done.
```
