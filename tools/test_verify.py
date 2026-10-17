"""Regression tests for tools/verify.py and the TBCL / MOE readings in tools/moe.py (§6.4, §6.5, §9.3).

    .venv\Scripts\python.exe tools\test_verify.py

Plain asserts; exits non-zero if any case fails. Needs the .cache/ data, nothing else.
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402
import verify  # noqa: E402

errors = []


def expect(status, zh, zhuyin, has="", lacks=""):
    """check(zh, zhuyin) must return `status`; its reason must contain `has` and not contain `lacks`."""
    st, why = verify.check(zh, zhuyin)
    if st != status or has not in why or (lacks and lacks in why):
        errors.append(f"{zh} {zhuyin}: want {status} {has!r}, got {st} ({why})")


def cases(status, block, **kw):
    """Run expect() over 'word zhuyin|word zhuyin|…'."""
    for item in block.split("|"):
        zh, z = item.strip().split(" ", 1)
        expect(status, zh, z, **kw)


# ---- #1 a tone difference warns only in the §6.4 cases; any other wrong tone fails
cases("fail", "水果 ㄕㄨㄟˋ ㄍㄨㄛˊ|老師 ㄌㄠˊ ㄕˋ|中國 ㄓㄨㄥˋ ㄍㄨㄛˇ|電話 ㄉㄧㄢ ㄏㄨㄚ|媽媽 ㄇㄚˇ ㄇㄚˋ|飛機 ㄈㄟˊ ㄐㄧˇ"
               "|馬 ㄇㄚ|馬 ㄇㄚˋ|買 ㄇㄞˋ|水 ㄕㄨㄟ")
expect("fail", "老師說的話很清楚", "ㄌㄠˊ ㄕ ㄕㄨㄛ ˙ㄉㄜ ㄏㄨㄚˋ ㄏㄣˇ ㄑㄧㄥ ㄔㄨˋ")
expect("ok", "老師說的話很清楚", "ㄌㄠˇ ㄕ ㄕㄨㄛ ˙ㄉㄜ ㄏㄨㄚˋ ㄏㄣˇ ㄑㄧㄥ ㄔㄨˇ")
res = verify.Result()
verify.record(res, "test", "水果", "ㄕㄨㄟˋ ㄍㄨㄛˊ")
if res.ok():
    errors.append("a wrong tone must be a failure that stops the build (Result.ok() is True)")
# allowed §6.4 differences: warn
expect("warn", "水果", "ㄕㄨㄟˊ ㄍㄨㄛˇ", has="3+3")
expect("warn", "我想", "ㄨㄛˊ ㄒㄧㄤˇ", has="3+3")          # 3+3 across segments
expect("warn", "我很好", "ㄨㄛˇ ㄏㄣˊ ㄏㄠˇ", has="3+3")
expect("warn", "一個", "ㄧˊ ˙ㄍㄜ", has="一 sandhi")
expect("warn", "爸爸", "ㄅㄚˋ ㄅㄚˋ", has="full tone")       # full tone where MOE writes ˙: accepted for listening
expect("warn", "桌子", "ㄓㄨㄛ ㄗˇ", has="full tone")
expect("warn", "我媽媽很好。", "ㄨㄛˇ ㄇㄚ ㄇㄚ ㄏㄣˇ ㄏㄠˇ", has="full tone")
# ... but only the character's own full tone: ㄇㄚˋ is 罵, ㄗˋ no reading of 子, 識 is never ㄕˊ in Taiwan
cases("fail", "媽媽 ㄇㄚ ㄇㄚˋ|爸爸 ㄅㄚˋ ㄅㄚˊ|桌子 ㄓㄨㄛ ㄗˋ|認識 ㄖㄣˋ ㄕˊ")
expect("fail", "我媽媽很好。", "ㄨㄛˇ ㄇㄚ ㄇㄚˋ ㄏㄣˇ ㄏㄠˇ")
# 3+3 chains: the next syllable counts with its listed tone, inside a word and across words alike
expect("warn", "展覽館", "ㄓㄢˊ ㄌㄢˊ ㄍㄨㄢˇ", has="3+3")
expect("warn", "我很好", "ㄨㄛˊ ㄏㄣˊ ㄏㄠˇ", has="3+3")
expect("warn", "我也很好。", "ㄨㄛˊ ㄧㄝˊ ㄏㄣˊ ㄏㄠˇ", has="3+3")
cases("fail", "我很好 ㄨㄛˊ ㄏㄣˊ ㄏㄠˋ|我很 ㄨㄛˊ ㄏㄣˊ")
# sandhi in the wrong context, on the wrong character, or with nothing after it: fail
cases("fail", "一天 ㄧˊ ㄊㄧㄢ|一定 ㄧˋ ㄉㄧㄥˋ|一 ㄧˊ|醫生 ㄧˊ ㄕㄥ|不好 ㄅㄨˊ ㄏㄠˇ|我 ㄨㄛˊ|水 ㄕㄨㄟˊ")
# a neutral tone where MOE writes a full tone is the Mainland form (§6.4, §6.5): fail
cases("fail", "頭髮 ㄊㄡˊ ˙ㄈㄚ|休息 ㄒㄧㄡ ˙ㄒㄧ|知識 ㄓ ˙ㄕ")
# base 一/不 where TBCL prints the sandhi (word only in TBCL): ok
expect("ok", "不見了", "ㄅㄨˋ ㄐㄧㄢˋ ˙ㄌㄜ")

# ---- #2 TBCL readings that MOE lists only as a variant warn and name it; later 多音 senses stay ok
expect("warn", "一定", "ㄧˊ ㄉㄧㄥˋ", has="變")
expect("warn", "一起", "ㄧˋ ㄑㄧˇ", has="變")
expect("warn", "不錯", "ㄅㄨˊ ㄘㄨㄛˋ", has="變")
expect("warn", "我一定要去。", "ㄨㄛˇ ㄧˊ ㄉㄧㄥˋ ㄧㄠˋ ㄑㄩˋ", has="變")
expect("warn", "主角", "ㄓㄨˇ ㄐㄧㄠˇ", has="語音")
expect("warn", "和", "ㄏㄢˋ", has="語音")
cases("ok", "一定 ㄧ ㄉㄧㄥˋ|一起 ㄧ ㄑㄧˇ|不錯 ㄅㄨˋ ㄘㄨㄛˋ|主角 ㄓㄨˇ ㄐㄩㄝˊ|的 ˙ㄉㄜ|們 ˙ㄇㄣ|都 ㄉㄡ")
expect("ok", "我一定要去。", "ㄨㄛˇ ㄧ ㄉㄧㄥˋ ㄧㄠˋ ㄑㄩˋ")
expect("warn", "不要", "ㄅㄨˊ ㄧㄠˋ", has="變")
expect("ok", "不要", "ㄅㄨˋ ㄧㄠˋ")
expect("warn", "一天", "ㄧˋ ㄊㄧㄢ", has="變")
expect("warn", "綠", "ㄌㄨˋ", has="讀音")

# ---- #3 a wrongly segmented word gives up its tail to a word crossing its edge (會|計算), with a ⚑
expect("warn", "他會計算成本。", "ㄊㄚ ㄏㄨㄟˋ ㄐㄧˋ ㄙㄨㄢˋ ㄔㄥˊ ㄅㄣˇ", has="word-level mismatch")
expect("warn", "我們會計畫一下。", "ㄨㄛˇ ˙ㄇㄣ ㄏㄨㄟˋ ㄐㄧˋ ㄏㄨㄚˋ ㄧ ㄒㄧㄚˋ", has="read as 會|計畫")
expect("fail", "他會計算成本。", "ㄊㄚ ㄏㄨㄟˋ ㄐㄧ ㄙㄨㄢˋ ㄔㄥˊ ㄅㄣˇ")   # 計 ㄐㄧ is no reading at all
expect("fail", "會計", "ㄏㄨㄟˋ ㄐㄧˋ")                            # a word on its own is not re-segmented
expect("fail", "銀行", "ㄧㄣˊ ㄒㄧㄥˊ")
# a word misread inside a sentence still fails: nothing crosses its edge, so it is not taken apart
for zh, z in [("我去銀行。", "ㄨㄛˇ ㄑㄩˋ ㄧㄣˊ ㄒㄧㄥˊ"), ("他在銀行工作。", "ㄊㄚ ㄗㄞˋ ㄧㄣˊ ㄒㄧㄥˊ ㄍㄨㄥ ㄗㄨㄛˋ"),
              ("這很重要。", "ㄓㄜˋ ㄏㄣˇ ㄔㄨㄥˊ ㄧㄠˋ"), ("我覺得很重要。", "ㄨㄛˇ ㄐㄩㄝˊ ˙ㄉㄜ ㄏㄣˇ ㄔㄨㄥˊ ㄧㄠˋ"),
              ("我還是要去。", "ㄨㄛˇ ㄏㄨㄢˊ ㄕˋ ㄧㄠˋ ㄑㄩˋ"), ("我覺得很好。", "ㄨㄛˇ ㄐㄧㄠˋ ˙ㄉㄜ ㄏㄣˇ ㄏㄠˇ"),
              ("我喜歡音樂。", "ㄨㄛˇ ㄒㄧˇ ㄏㄨㄢ ㄧㄣ ㄌㄜˋ"), ("中國很大。", "ㄓㄨㄥˋ ㄍㄨㄛˊ ㄏㄣˇ ㄉㄚˋ"),
              ("今天星期幾？", "ㄐㄧㄣ ㄊㄧㄢ ㄒㄧㄥ ㄑㄧ ㄐㄧˇ")]:
    expect("fail", zh, z)
expect("ok", "今天星期幾？", "ㄐㄧㄣ ㄊㄧㄢ ㄒㄧㄥ ㄑㄧˊ ㄐㄧˇ")

# ---- #4 slash forms get their own reading; numbered rows (得1/得2/得3) are all TBCL readings
cases("ok", "這兒 ㄓㄜˋ ㄦ|哪兒 ㄋㄚˇ ㄦ|那兒 ㄋㄚˋ ㄦ|這裏 ㄓㄜˋ ㄌㄧˇ|小孩 ㄒㄧㄠˇ ㄏㄞˊ|小孩子 ㄒㄧㄠˇ ㄏㄞˊ ˙ㄗ"
             "|一點兒 ㄧ ㄉㄧㄢˇ ㄦ|有點兒 ㄧㄡˇ ㄉㄧㄢˇ ㄦ|差點 ㄔㄚ ㄉㄧㄢˇ|頸子 ㄐㄧㄥˇ ˙ㄗ|證券行 ㄓㄥˋ ㄑㄩㄢˋ ㄏㄤˊ"
             "|曾 ㄘㄥˊ|朝 ㄔㄠˊ|得 ㄉㄟˇ|長 ㄓㄤˇ|好 ㄏㄠˋ|種 ㄓㄨㄥˋ|重 ㄔㄨㄥˊ|中 ㄓㄨㄥˋ|當 ㄉㄤˋ|看 ㄎㄢ"
             "|人家 ㄖㄣˊ ˙ㄐㄧㄚ|同行 ㄊㄨㄥˊ ㄒㄧㄥˊ")
expect("ok", "這兒", "ㄓㄜˋㄦ")                                  # MOE's attached 兒化 spelling
expect("ok", "你在哪兒？", "ㄋㄧˇ ㄗㄞˋ ㄋㄚˇ ㄦ")
cases("fail", "那兒 ㄋㄚˋ ㄌㄧˇ|星期天 ㄒㄧㄥ ㄑㄧˊ ㄖˋ|一會兒 ㄧ ㄏㄨㄟˋ ㄦ")
T = moe.tbcl_words()
assert {"ㄉㄟˇ", "˙ㄉㄜ", "ㄉㄜˊ"} <= set(T["得"]["readings"]), T["得"]
assert T["這兒"]["readings"] == ["ㄓㄜˋ ㄦ"] and T["這裡"]["readings"] == ["ㄓㄜˋ ㄌㄧˇ"], (T["這兒"], T["這裡"])
assert T["那裡"]["readings"] == ["ㄋㄚˋ ㄌㄧˇ"] and T["那兒"]["readings"] == ["ㄋㄚˋ ㄦ"], (T["那裡"], T["那兒"])
assert T["剛"]["readings"] == [] and T["剛"]["level"], T["剛"]           # 剛剛/剛 → ㄍㄤ ㄍㄤ only fits 剛剛
assert moe.norm("ㄧ ㄉㄧㄢˇㄦ") == "ㄧ ㄉㄧㄢˇ ㄦ" and moe.norm("˙ㄦ") == "˙ㄦ" and moe.norm("ㄦˊ") == "ㄦˊ"
assert moe.tbcl_parts("ㄉㄧˊㄅㄨˊㄍㄨㄛˋ") == ["ㄉㄧˊ ㄅㄨˊ ㄍㄨㄛˋ"]
assert moe.tbcl_parts("(一)ㄉㄧˋ ㄉㄠˋ/(二)ㄉㄧˋ ˙ㄉㄠ") == ["ㄉㄧˋ ㄉㄠˋ", "ㄉㄧˋ ˙ㄉㄠ"]

# ---- #5 the TBCL-vs-MOE warning names the MOE reading it was compared with
expect("warn", "台", "ㄊㄞˊ", has="修訂本 writes ㄊㄞ;", lacks="ㄧˊ")
expect("warn", "我住在台北", "ㄨㄛˇ ㄓㄨˋ ㄗㄞˋ ㄊㄞˊ ㄅㄟˇ", has="修訂本 writes ㄊㄞ;", lacks="base tone")
expect("ok", "臺灣", "ㄊㄞˊ ㄨㄢ")

# ---- §6.4 the 20 tone-pair words, the full-tone list and the neutral-tone list
cases("ok", "飛機 ㄈㄟ ㄐㄧ|中國 ㄓㄨㄥ ㄍㄨㄛˊ|身體 ㄕㄣ ㄊㄧˇ|音樂 ㄧㄣ ㄩㄝˋ|桌子 ㄓㄨㄛ ˙ㄗ"
            "|明天 ㄇㄧㄥˊ ㄊㄧㄢ|銀行 ㄧㄣˊ ㄏㄤˊ|蘋果 ㄆㄧㄥˊ ㄍㄨㄛˇ|學校 ㄒㄩㄝˊ ㄒㄧㄠˋ|孩子 ㄏㄞˊ ˙ㄗ"
            "|老師 ㄌㄠˇ ㄕ|旅行 ㄌㄩˇ ㄒㄧㄥˊ|水果 ㄕㄨㄟˇ ㄍㄨㄛˇ|考試 ㄎㄠˇ ㄕˋ|椅子 ㄧˇ ˙ㄗ"
            "|汽車 ㄑㄧˋ ㄔㄜ|大學 ㄉㄚˋ ㄒㄩㄝˊ|電腦 ㄉㄧㄢˋ ㄋㄠˇ|電話 ㄉㄧㄢˋ ㄏㄨㄚˋ|爸爸 ㄅㄚˋ ˙ㄅㄚ")
cases("ok", "時候 ㄕˊ ㄏㄡˋ|喜歡 ㄒㄧˇ ㄏㄨㄢ|學生 ㄒㄩㄝˊ ㄕㄥ|先生 ㄒㄧㄢ ㄕㄥ|朋友 ㄆㄥˊ ㄧㄡˇ|聰明 ㄘㄨㄥ ㄇㄧㄥˊ"
            "|關係 ㄍㄨㄢ ㄒㄧˋ|事情 ㄕˋ ㄑㄧㄥˊ|清楚 ㄑㄧㄥ ㄔㄨˇ|眼睛 ㄧㄢˇ ㄐㄧㄥ|頭髮 ㄊㄡˊ ㄈㄚˇ|休息 ㄒㄧㄡ ㄒㄧˊ"
            "|消息 ㄒㄧㄠ ㄒㄧˊ|告訴 ㄍㄠˋ ㄙㄨˋ")
cases("ok", "認識 ㄖㄣˋ ˙ㄕ|漂亮 ㄆㄧㄠˋ ˙ㄌㄧㄤ|衣服 ㄧ ˙ㄈㄨ|舒服 ㄕㄨ ˙ㄈㄨ|麻煩 ㄇㄚˊ ˙ㄈㄢ|明白 ㄇㄧㄥˊ ˙ㄅㄞ"
            "|但是 ㄉㄢˋ ˙ㄕ|東西 ㄉㄨㄥ ˙ㄒㄧ")

# ---- §6.5 MOE readings pass; the Mainland readings written in Zhuyin fail
cases("ok", "垃圾 ㄌㄜˋ ㄙㄜˋ|星期 ㄒㄧㄥ ㄑㄧˊ|期待 ㄑㄧˊ ㄉㄞˋ|危險 ㄨㄟˊ ㄒㄧㄢˇ|微笑 ㄨㄟˊ ㄒㄧㄠˋ|頭髮 ㄊㄡˊ ㄈㄚˇ"
            "|研究 ㄧㄢˊ ㄐㄧㄡˋ|企業 ㄑㄧˋ ㄧㄝˋ|綜合 ㄗㄨㄥˋ ㄏㄜˊ|品質 ㄆㄧㄣˇ ㄓˊ|質量 ㄓˊ ㄌㄧㄤˋ|知識 ㄓ ㄕˋ"
            "|攻擊 ㄍㄨㄥ ㄐㄧˊ|可惜 ㄎㄜˇ ㄒㄧˊ|突然 ㄊㄨˊ ㄖㄢˊ|擁抱 ㄩㄥˇ ㄅㄠˋ|癌症 ㄧㄢˊ ㄓㄥˋ|暴露 ㄆㄨˋ ㄌㄨˋ"
            "|曝光 ㄆㄨˋ ㄍㄨㄤ|從容 ㄘㄨㄥ ㄖㄨㄥˊ|口吃 ㄎㄡˇ ㄐㄧˊ|暫時 ㄓㄢˋ ㄕˊ|發酵 ㄈㄚ ㄒㄧㄠˋ|攜帶 ㄒㄧ ㄉㄞˋ"
            "|蝸牛 ㄍㄨㄚ ㄋㄧㄡˊ|細菌 ㄒㄧˋ ㄐㄩㄣˋ|檔案 ㄉㄤˇ ㄢˋ|廣播 ㄍㄨㄤˇ ㄅㄛˋ|跌倒 ㄉㄧㄝˊ ㄉㄠˇ|夾克 ㄐㄧㄚˊ ㄎㄜˋ"
            "|和 ㄏㄜˊ|法國 ㄈㄚˇ ㄍㄨㄛˊ|血液 ㄒㄧㄝˇ ㄧㄝˋ|液體 ㄧㄝˋ ㄊㄧˇ|成熟 ㄔㄥˊ ㄕㄨˊ|亞洲 ㄧㄚˋ ㄓㄡ")
# (和 hé is ㄏㄜˊ on both sides; 癌症 ㄞˊ ㄓㄥˋ is the 簡編本's own first reading, so neither is tested here)
cases("fail", "垃圾 ㄌㄚ ㄐㄧ|星期 ㄒㄧㄥ ㄑㄧ|頭髮 ㄊㄡˊ ˙ㄈㄚ|研究 ㄧㄢˊ ㄐㄧㄡ|品質 ㄆㄧㄣˇ ㄓˋ"
              "|期待 ㄑㄧ ㄉㄞˋ|危險 ㄨㄟ ㄒㄧㄢˇ|微笑 ㄨㄟ ㄒㄧㄠˋ|企業 ㄑㄧˇ ㄧㄝˋ|綜合 ㄗㄨㄥ ㄏㄜˊ|質量 ㄓˋ ㄌㄧㄤˋ"
              "|知識 ㄓ ˙ㄕ|攻擊 ㄍㄨㄥ ㄐㄧ|可惜 ㄎㄜˇ ㄒㄧ|休息 ㄒㄧㄡ ˙ㄒㄧ|突然 ㄊㄨ ㄖㄢˊ|擁抱 ㄩㄥ ㄅㄠˋ"
              "|暴露 ㄅㄠˋ ㄌㄨˋ|曝光 ㄅㄠˋ ㄍㄨㄤ|從容 ㄘㄨㄥˊ ㄖㄨㄥˊ|口吃 ㄎㄡˇ ㄔ|暫時 ㄗㄢˋ ㄕˊ|發酵 ㄈㄚ ㄐㄧㄠˋ"
              "|攜帶 ㄒㄧㄝˊ ㄉㄞˋ|蝸牛 ㄨㄛ ㄋㄧㄡˊ|細菌 ㄒㄧˋ ㄐㄩㄣ|檔案 ㄉㄤˋ ㄢˋ|廣播 ㄍㄨㄤˇ ㄅㄛ|跌倒 ㄉㄧㄝ ㄉㄠˇ"
              "|夾克 ㄐㄧㄚ ㄎㄜˋ")

# ---- sentences
expect("ok", "你有看醫生嗎？", "ㄋㄧˇ ㄧㄡˇ ㄎㄢˋ ㄧ ㄕㄥ ˙ㄇㄚ")
expect("fail", "你有看醫生嗎？", "ㄋㄧˇ ㄧㄡˇ ㄎㄢˋ ㄧ ㄕㄥ")                   # 5 syllables for 6 characters
# realistic sentences (spelled as MOE does) pass
for zh, z in [("這個人很好。", "ㄓㄜˋ ˙ㄍㄜ ㄖㄣˊ ㄏㄣˇ ㄏㄠˇ"), ("我是一個學生。", "ㄨㄛˇ ㄕˋ ㄧ ˙ㄍㄜ ㄒㄩㄝˊ ㄕㄥ"),
              ("我們去吃飯吧！", "ㄨㄛˇ ˙ㄇㄣ ㄑㄩˋ ㄔ ㄈㄢˋ ˙ㄅㄚ"), ("你要不要喝茶？", "ㄋㄧˇ ㄧㄠˋ ㄅㄨˋ ㄧㄠˋ ㄏㄜ ㄔㄚˊ"),
              ("請問捷運站在哪裡？", "ㄑㄧㄥˇ ㄨㄣˋ ㄐㄧㄝˊ ㄩㄣˋ ㄓㄢˋ ㄗㄞˋ ㄋㄚˇ ㄌㄧˇ"),
              ("我想買一杯珍珠奶茶，半糖少冰。", "ㄨㄛˇ ㄒㄧㄤˇ ㄇㄞˇ ㄧ ㄅㄟ ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ ㄅㄢˋ ㄊㄤˊ ㄕㄠˇ ㄅㄧㄥ"),
              ("便利商店在前面。", "ㄅㄧㄢˋ ㄌㄧˋ ㄕㄤ ㄉㄧㄢˋ ㄗㄞˋ ㄑㄧㄢˊ ㄇㄧㄢˋ")]:
    expect("ok", zh, z)
expect("fail", "我在銀行工作。", "ㄨㄛˇ ㄗㄞˋ ㄧㄣˊ ㄒㄧㄥˊ ㄍㄨㄥ ㄗㄨㄛˋ")        # wrong reading of 行 inside a word
# 3+3 sandhi does not cross punctuation: a T3 written T2 before a comma or full stop fails
expect("fail", "好。好。", "ㄏㄠˊ ㄏㄠˇ")
expect("fail", "我想，好。", "ㄨㄛˇ ㄒㄧㄤˊ ㄏㄠˇ")
expect("warn", "我很好。", "ㄨㄛˇ ㄏㄣˊ ㄏㄠˇ")                                   # within a phrase it is sandhi, a ⚑

# ---- #6 (M4) a function word standing as its own segment in a sentence takes its listed neutral reading as ok
for zh, z in [("我吃了。", "ㄨㄛˇ ㄔ ˙ㄌㄜ"), ("他看著我。", "ㄊㄚ ㄎㄢˋ ˙ㄓㄜ ㄨㄛˇ"), ("門開著呢。", "ㄇㄣˊ ㄎㄞ ˙ㄓㄜ ˙ㄋㄜ"),
              ("我買了兩個包子。", "ㄨㄛˇ ㄇㄞˇ ˙ㄌㄜ ㄌㄧㄤˇ ˙ㄍㄜ ㄅㄠ ˙ㄗ"), ("我吃過了。", "ㄨㄛˇ ㄔ ㄍㄨㄛˋ ˙ㄌㄜ"),
              ("我吃了。", "ㄨㄛˇ ㄔ ㄌㄧㄠˇ"), ("他坐著。", "ㄊㄚ ㄗㄨㄛˋ ㄓㄨㄛˊ")]:
    expect("ok", zh, z)
for ch, z in verify.FUNCTION_WORDS.items():
    if verify.function_word_ok(ch, z) != (ch != "過"):
        errors.append(f"function_word_ok({ch}, {z}) should be {ch != '過'}")
expect("fail", "我去過。", "ㄨㄛˇ ㄑㄩˋ ˙ㄍㄨㄛ")       # 過 ˙ㄍㄨㄛ is listed by no source: still a failure
cases("fail", "我吃了。 ㄨㄛˇ ㄔ ˙ㄌㄧㄠ|他走了。 ㄊㄚ ㄗㄡˇ ˙ㄌㄚ")          # only the listed reading itself
expect("warn", "他很樂。", "ㄊㄚ ㄏㄣˇ ㄌㄜˋ", has="later 多音")    # any other later 多音 choice still warns
expect("warn", "了", "˙ㄌㄜ", has="later 多音")                  # a word on its own: the word rules, unchanged
expect("warn", "我買了一個便當。", "ㄨㄛˇ ㄇㄞˇ ˙ㄌㄜ ㄧ ˙ㄍㄜ ㄅㄧㄢˋ ㄉㄤˋ", has="便當")   # the 便當 ⚑ is kept

# ---- #7 (M4) every Zhuyin field shape is checked; a Zhuyin field with no Chinese text next to it fails
if verify.pairs_in({"zh": "", "zhuyin": "", "en": "", "example_zh": "", "example_zhuyin": "", "example_en": ""}) != [
        ("zh", "zhuyin"), ("example_zh", "example_zhuyin")]:
    errors.append("pairs_in: zh/zhuyin + example_zh/example_zhuyin")
if verify.pairs_in({"taiwan": "", "taiwan_zhuyin": "", "mainland": ""}) != [("taiwan", "taiwan_zhuyin")]:
    errors.append("pairs_in: taiwan/taiwan_zhuyin")
if verify.pairs_in({"wrong": "", "right": "", "right_zhuyin": ""}) != [("right", "right_zhuyin")]:
    errors.append("pairs_in: right/right_zhuyin")
if verify.pairs_in({"prompt_zh": "", "model_zh": "", "model_zhuyin": ""}) != [("model_zh", "model_zhuyin")]:
    errors.append("pairs_in: model_zh/model_zhuyin")
if verify.pairs_in({"written": "", "written_zhuyin": "", "spoken": "", "spoken_zhuyin": "", "en": ""}) != [
        ("written", "written_zhuyin"), ("spoken", "spoken_zhuyin")]:
    errors.append("pairs_in: written/written_zhuyin + spoken/spoken_zhuyin")
res = verify.Result()
verify.walk_json({"title": {"zh": "我住在屏東", "zhuyin": "ㄨㄛˇ ㄓㄨˋ ㄗㄞˋ ㄆㄧㄥˊ ㄉㄨㄥ"},
                  "pairs": [{"written": "於", "written_zhuyin": "ㄩˊ", "spoken": "在", "spoken_zhuyin": "ㄗㄞ"}]}, "r.json", res)
if res.checked != 3 or [f[0] for f in res.failures] != ["r.json/pairs[0]/spoken"]:
    errors.append(f"walk_json: title + written + spoken, want 3 checked and the spoken pair failing, got {res.checked} {res.failures}")
res = verify.Result()
verify.walk_json([{"examples": [{"zh": "我是學生。", "zhuyin": "ㄨㄛˇ ㄕˋ ㄒㄩㄝˊ ㄕㄥ"}],
                   "mistake": {"wrong": "她是很漂亮。", "right": "她很漂亮。", "right_zhuyin": "ㄊㄚ ㄏㄣˇ ㄆㄧㄠˋ ˙ㄌㄧㄤ"},
                   "writing": {"prompt_zh": "介紹你自己。", "model_zh": "水果", "model_zhuyin": "ㄕㄨㄟˋ ㄍㄨㄛˊ"}}], "g.json", res)
if res.checked != 3 or [f[0] for f in res.failures] != ["g.json[0]/writing/model_zh"]:
    errors.append(f"walk_json: want 3 checked and model_zh failing, got {res.checked} {res.failures}")
res = verify.Result()
verify.record_pairs(res, "m.csv:2", {"zh": "杯", "zhuyin": "ㄅㄟ", "example_zh": "我要一杯茶。",
                                     "example_zhuyin": "ㄨㄛˇ ㄧㄠˋ ㄧ ㄅㄟ ㄔㄚˋ"}, " ")
verify.record_pairs(res, "t.csv:3", {"taiwan": "捷運", "taiwan_zhuyin": "ㄐㄧㄝˊ ㄩㄣˋ", "mainland": "地鐵",
                                     "example_zh": "", "example_zhuyin": ""}, " ")
verify.record_pairs(res, "x.csv:4", {"idiom": "人山人海", "zhuyin": "ㄖㄣˊ ㄕㄢ ㄖㄣˊ ㄏㄞˇ"}, " ")
verify.record_pairs(res, "y.csv:5", {"answer_zhuyin": "ㄋㄧˇ ㄏㄠˇ", "answer": ""}, " ")
if res.checked != 5 or [f[0] for f in res.failures] != ["m.csv:2 example_zh", "y.csv:5 answer"]:
    errors.append(f"record_pairs: want 5 checked, example_zh and the lone answer_zhuyin failing, got "
                  f"{res.checked} {[f[:2] for f in res.failures]}")

# ---- #8 (M4) segmentation prefers core TBCL words and single characters to a rare word whose reading does not fit
for zh, z in [("我每天都喝咖啡。", "ㄨㄛˇ ㄇㄟˇ ㄊㄧㄢ ㄉㄡ ㄏㄜ ㄎㄚ ㄈㄟ"),            # not 我每|天都 ㄊㄧㄢ ㄉㄨ
              ("我要買這個。", "ㄨㄛˇ ㄧㄠˋ ㄇㄞˇ ㄓㄜˋ ˙ㄍㄜ"),                      # not 要買 ㄧㄠ ㄇㄞˇ
              ("他都會來。", "ㄊㄚ ㄉㄡ ㄏㄨㄟˋ ㄌㄞˊ"),                            # not 都會 ㄉㄨ ㄏㄨㄟˋ (TBCL 第7級)
              ("我們每天都會見面。", "ㄨㄛˇ ˙ㄇㄣ ㄇㄟˇ ㄊㄧㄢ ㄉㄡ ㄏㄨㄟˋ ㄐㄧㄢˋ ㄇㄧㄢˋ"),
              ("我要的是這個。", "ㄨㄛˇ ㄧㄠˋ ˙ㄉㄜ ㄕˋ ㄓㄜˋ ˙ㄍㄜ"),                  # not 的是 ㄉㄧˊ ㄕˋ
              ("我家裡有貓。", "ㄨㄛˇ ㄐㄧㄚ ˙ㄌㄧ ㄧㄡˇ ㄇㄠ"),                       # 我|家裡 as MOE writes 家裡
              ("我家裡有貓。", "ㄨㄛˇ ㄐㄧㄚ ㄌㄧˇ ㄧㄡˇ ㄇㄠ")]:                      # 我家|裡, unchanged
    expect("ok", zh, z)
expect("fail", "我去銀行。", "ㄨㄛˇ ㄑㄩˋ ㄧㄣˊ ㄒㄧㄥˊ", has="銀行")          # a core TBCL word is never split
expect("fail", "銀行在哪裡？", "ㄧㄣˊ ㄒㄧㄥˊ ㄗㄞˋ ㄋㄚˇ ㄌㄧˇ", has="銀行")
expect("fail", "他都會來。", "ㄊㄚ ㄉㄡ ㄏㄨㄟˊ ㄌㄞˊ", has="都會")             # still a wrong tone: the first reading's error
expect("fail", "我每天都喝咖啡。", "ㄨㄛˇ ㄇㄟˇ ㄊㄧㄢˊ ㄉㄡ ㄏㄜ ㄎㄚ ㄈㄟ")
expect("fail", "我要買這個。", "ㄨㄛˇ ㄧㄠˋ ㄇㄞˋ ㄓㄜˋ ˙ㄍㄜ")
expect("fail", "都會", "ㄉㄡ ㄏㄨㄟˋ")                                      # a word on its own is not re-segmented
expect("fail", "要買", "ㄧㄠˋ ㄇㄞˇ")
expect("warn", "我買了一個便當。", "ㄨㄛˇ ㄇㄞˇ ˙ㄌㄜ ㄧ ˙ㄍㄜ ㄅㄧㄢˋ ㄉㄤˋ", has="便當")   # 便當 is not split into 便|當
if not verify.core_word("銀行") or verify.core_word("都會") or verify.core_word("要買") or verify.core_word("會計"):
    errors.append("core_word: 銀行 (第2級) is core; 都會 (第7級), 會計 (第6級), 要買 (修訂本 only) are not")
if not (verify.tbcl_char_ok("都", "ㄉㄡ") and verify.tbcl_char_ok("的", "˙ㄉㄜ") and verify.tbcl_char_ok("了", "˙ㄌㄜ")
        and not verify.tbcl_char_ok("中", "ㄓㄨㄥˋ") and not verify.tbcl_char_ok("要", "ㄧㄠ")):
    errors.append("tbcl_char_ok: TBCL's first reading or a function-word reading only")
expect("fail", "中國很大。", "ㄓㄨㄥˋ ㄍㄨㄛˊ ㄏㄣˇ ㄉㄚˋ", has="中國")         # 中國 (修訂本 only) is not 中|國 with 中 ㄓㄨㄥˋ

for e in errors:
    print("FAIL", e)
print(f"test_verify: {len(errors)} failing case(s)")
assert not errors, f"{len(errors)} verifier regression(s)"
