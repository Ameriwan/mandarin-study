"""Regression tests for moe.spoken() (tone sandhi, MASTER_PROMPT §6.4) and the M2 Tone Gym build functions.

    .venv\\Scripts\\python.exe tools\\test_spoken.py

Plain asserts; exits non-zero if any case fails. Needs the .cache/ data, nothing else: the build functions run
on small made-up content with a stub audio bank (no downloads, no TTS, no files written).
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402
import verify  # noqa: E402
import audio  # noqa: E402
import build  # noqa: E402

errors = []
checked = []   # (zh, base, spoken) of every spoken() case, for the cross-checks below


def same(zh, zhuyin, want, verify_it=True):
    """spoken(zh, zhuyin) must be `want` ('=' means unchanged)."""
    want = moe.norm(zhuyin) if want == "=" else want
    got = moe.spoken(zh, zhuyin)
    if got != want:
        errors.append(f"spoken({zh}, {zhuyin}) = {got}, want {want}")
    if verify_it:
        checked.append((zh, zhuyin, got))


def cases(block):
    """'zh base => spoken | ...'; spoken '=' means unchanged."""
    for item in block.split("|"):
        left, want = item.split("=>")
        zh, z = left.strip().split(" ", 1)
        same(zh, z.strip(), want.strip())


# ---- 3+3: every T3 of a run but the last becomes T2 (§6.4: every time in Taiwan)
cases("水果 ㄕㄨㄟˇ ㄍㄨㄛˇ => ㄕㄨㄟˊ ㄍㄨㄛˇ | 你好 ㄋㄧˇ ㄏㄠˇ => ㄋㄧˊ ㄏㄠˇ | 老鼠 ㄌㄠˇ ㄕㄨˇ => ㄌㄠˊ ㄕㄨˇ"
      "| 很好 ㄏㄣˇ ㄏㄠˇ => ㄏㄣˊ ㄏㄠˇ | 我也很好 ㄨㄛˇ ㄧㄝˇ ㄏㄣˇ ㄏㄠˇ => ㄨㄛˊ ㄧㄝˊ ㄏㄣˊ ㄏㄠˇ"
      "| 我也很好。 ㄨㄛˇ ㄧㄝˇ ㄏㄣˇ ㄏㄠˇ => ㄨㄛˊ ㄧㄝˊ ㄏㄣˊ ㄏㄠˇ"
      "| 展覽館 ㄓㄢˇ ㄌㄢˇ ㄍㄨㄢˇ => ㄓㄢˊ ㄌㄢˊ ㄍㄨㄢˇ"
      "| 展覽館很好 ㄓㄢˇ ㄌㄢˇ ㄍㄨㄢˇ ㄏㄣˇ ㄏㄠˇ => ㄓㄢˊ ㄌㄢˊ ㄍㄨㄢˊ ㄏㄣˊ ㄏㄠˇ"
      "| 展覽館在哪裡 ㄓㄢˇ ㄌㄢˇ ㄍㄨㄢˇ ㄗㄞˋ ㄋㄚˇ ㄌㄧˇ => ㄓㄢˊ ㄌㄢˊ ㄍㄨㄢˇ ㄗㄞˋ ㄋㄚˊ ㄌㄧˇ"
      "| 我想買水果 ㄨㄛˇ ㄒㄧㄤˇ ㄇㄞˇ ㄕㄨㄟˇ ㄍㄨㄛˇ => ㄨㄛˊ ㄒㄧㄤˊ ㄇㄞˊ ㄕㄨㄟˊ ㄍㄨㄛˇ"
      "| 我很喜歡 ㄨㄛˇ ㄏㄣˇ ㄒㄧˇ ㄏㄨㄢ => ㄨㄛˊ ㄏㄣˊ ㄒㄧˇ ㄏㄨㄢ"
      "| 小姐 ㄒㄧㄠˇ ㄐㄧㄝˇ => ㄒㄧㄠˊ ㄐㄧㄝˇ | 雨傘 ㄩˇ ㄙㄢˇ => ㄩˊ ㄙㄢˇ")
# runs are broken by punctuation (and by spaces or any non-Chinese character)
cases("好。好。 ㄏㄠˇ ㄏㄠˇ => = | 我想，你好。 ㄨㄛˇ ㄒㄧㄤˇ ㄋㄧˇ ㄏㄠˇ => ㄨㄛˊ ㄒㄧㄤˇ ㄋㄧˊ ㄏㄠˇ"
      "| 你好！你好？ ㄋㄧˇ ㄏㄠˇ ㄋㄧˇ ㄏㄠˇ => ㄋㄧˊ ㄏㄠˇ ㄋㄧˊ ㄏㄠˇ")
same("你好 你好", "ㄋㄧˇ ㄏㄠˇ ㄋㄧˇ ㄏㄠˇ", "ㄋㄧˊ ㄏㄠˇ ㄋㄧˊ ㄏㄠˇ")
# a neutral syllable or any other tone ends the run; half-third is not a written change
cases("椅子 ㄧˇ ˙ㄗ => = | 姐姐 ㄐㄧㄝˇ ˙ㄐㄧㄝ => = | 我們 ㄨㄛˇ ˙ㄇㄣ => = | 老師 ㄌㄠˇ ㄕ => = | 旅行 ㄌㄩˇ ㄒㄧㄥˊ => ="
      "| 考試 ㄎㄠˇ ㄕˋ => = | 好吃 ㄏㄠˇ ㄔ => = | 我 ㄨㄛˇ => = | 我是老師 ㄨㄛˇ ㄕˋ ㄌㄠˇ ㄕ => =")

# ---- 一: ㄧˊ before T4, ㄧˋ before T1/T2/T3; stays ㄧ as a number or ordinal
cases("一定 ㄧ ㄉㄧㄥˋ => ㄧˊ ㄉㄧㄥˋ | 一起 ㄧ ㄑㄧˇ => ㄧˋ ㄑㄧˇ | 一天 ㄧ ㄊㄧㄢ => ㄧˋ ㄊㄧㄢ"
      "| 一樣 ㄧ ㄧㄤˋ => ㄧˊ ㄧㄤˋ | 一年 ㄧ ㄋㄧㄢˊ => ㄧˋ ㄋㄧㄢˊ | 一直 ㄧ ㄓˊ => ㄧˋ ㄓˊ"
      "| 一下 ㄧ ㄒㄧㄚˋ => ㄧˊ ㄒㄧㄚˋ | 一些 ㄧ ㄒㄧㄝ => ㄧˋ ㄒㄧㄝ | 一點 ㄧ ㄉㄧㄢˇ => ㄧˋ ㄉㄧㄢˇ"
      "| 一點點 ㄧ ㄉㄧㄢˇ ㄉㄧㄢˇ => ㄧˋ ㄉㄧㄢˊ ㄉㄧㄢˇ")
# before a neutral syllable: that character's own full tone (個 ㄍㄜˋ -> T4)
cases("一個 ㄧ ˙ㄍㄜ => ㄧˊ ˙ㄍㄜ | 一個月 ㄧ ˙ㄍㄜ ㄩㄝˋ => ㄧˊ ˙ㄍㄜ ㄩㄝˋ"
      "| 我是一個學生。 ㄨㄛˇ ㄕˋ ㄧ ˙ㄍㄜ ㄒㄩㄝˊ ㄕㄥ => ㄨㄛˇ ㄕˋ ㄧˊ ˙ㄍㄜ ㄒㄩㄝˊ ㄕㄥ")
same("一呢", "ㄧ ˙ㄋㄜ", "=", verify_it=False)          # 呢 has no full-tone ㄋㄜ reading: 一 is left alone
# counting: 一 before 百 千 萬 changes like before a measure word; 一兩個 too
cases("一百 ㄧ ㄅㄞˇ => ㄧˋ ㄅㄞˇ | 一千 ㄧ ㄑㄧㄢ => ㄧˋ ㄑㄧㄢ | 一萬 ㄧ ㄨㄢˋ => ㄧˊ ㄨㄢˋ"
      "| 一百一 ㄧ ㄅㄞˇ ㄧ => ㄧˋ ㄅㄞˇ ㄧ | 一兩個 ㄧ ㄌㄧㄤˇ ˙ㄍㄜ => ㄧˋ ㄌㄧㄤˇ ˙ㄍㄜ")
# number / ordinal: 第一, after a numeral, before a digit, month / date / floor / grade, weekday, last
cases("第一 ㄉㄧˋ ㄧ => = | 第一次 ㄉㄧˋ ㄧ ㄘˋ => = | 第一名 ㄉㄧˋ ㄧ ㄇㄧㄥˊ => = | 十一 ㄕˊ ㄧ => ="
      "| 十一點 ㄕˊ ㄧ ㄉㄧㄢˇ => = | 二十一 ㄦˋ ㄕˊ ㄧ => = | 一月 ㄧ ㄩㄝˋ => = | 十一月 ㄕˊ ㄧ ㄩㄝˋ => ="
      "| 一月一號 ㄧ ㄩㄝˋ ㄧ ㄏㄠˋ => = | 一號 ㄧ ㄏㄠˋ => = | 一樓 ㄧ ㄌㄡˊ => = | 一年級 ㄧ ㄋㄧㄢˊ ㄐㄧˊ => ="
      "| 一九四九年 ㄧ ㄐㄧㄡˇ ㄙˋ ㄐㄧㄡˇ ㄋㄧㄢˊ => = | 一一 ㄧ ㄧ => = | 萬一 ㄨㄢˋ ㄧ => = | 統一 ㄊㄨㄥˇ ㄧ => ="
      "| 唯一 ㄨㄟˊ ㄧ => = | 一 ㄧ => = | 一。 ㄧ => = | 星期一 ㄒㄧㄥ ㄑㄧˊ ㄧ => ="
      "| 星期一早上 ㄒㄧㄥ ㄑㄧˊ ㄧ ㄗㄠˇ ㄕㄤˋ => = | 禮拜一 ㄌㄧˇ ㄅㄞˋ ㄧ => ="
      "| 週一到週五 ㄓㄡ ㄧ ㄉㄠˋ ㄓㄡ ㄨˇ => =")
# 同一 + a measure word: 一 counts before the measure word like 一個 (no MOE entry for 同一個; §6.4 numeral rule)
cases("同一個 ㄊㄨㄥˊ ㄧ ˙ㄍㄜ => ㄊㄨㄥˊ ㄧˊ ˙ㄍㄜ | 同一天 ㄊㄨㄥˊ ㄧ ㄊㄧㄢ => ㄊㄨㄥˊ ㄧˋ ㄊㄧㄢ | 同一 ㄊㄨㄥˊ ㄧ => =")
# 之一 "one of" before a word that greedy segmentation glues onto 一 (一說, 一名) still keeps 一
cases("原因之一說明 ㄩㄢˊ ㄧㄣ ㄓ ㄧ ㄕㄨㄛ ㄇㄧㄥˊ => = | 人之一生 ㄖㄣˊ ㄓ ㄧ ㄕㄥ => ㄖㄣˊ ㄓ ㄧˋ ㄕㄥ")
# ... but counting after a week word does change
cases("每週一次 ㄇㄟˇ ㄓㄡ ㄧ ㄘˋ => ㄇㄟˇ ㄓㄡ ㄧˊ ㄘˋ | 這週一定 ㄓㄜˋ ㄓㄡ ㄧ ㄉㄧㄥˋ => ㄓㄜˋ ㄓㄡ ㄧˊ ㄉㄧㄥˋ")
# word boundaries: a word ending in a numeral 一 keeps it with more syllables after it (統一 inside 統一發票 too),
# and so does 之一 "one of" (之 as its own word); not 總之 + 一定, not the idiom 付之一笑
cases("統一發票 ㄊㄨㄥˇ ㄧ ㄈㄚ ㄆㄧㄠˋ => = | 統一超商 ㄊㄨㄥˇ ㄧ ㄔㄠ ㄕㄤ => = | 唯一機會 ㄨㄟˊ ㄧ ㄐㄧ ㄏㄨㄟˋ => ="
      "| 單一窗口 ㄉㄢ ㄧ ㄔㄨㄤ ㄎㄡˇ => = | 萬一下雨 ㄨㄢˋ ㄧ ㄒㄧㄚˋ ㄩˇ => ="
      "| 統一的看法 ㄊㄨㄥˇ ㄧ ˙ㄉㄜ ㄎㄢˋ ㄈㄚˇ => = | 其中之一是 ㄑㄧˊ ㄓㄨㄥ ㄓ ㄧ ㄕˋ => ="
      "| 原因之一是 ㄩㄢˊ ㄧㄣ ㄓ ㄧ ㄕˋ => = | 三分之一 ㄙㄢ ㄈㄣ ㄓ ㄧ => ="
      "| 總之一定 ㄗㄨㄥˇ ㄓ ㄧ ㄉㄧㄥˋ => ㄗㄨㄥˇ ㄓ ㄧˊ ㄉㄧㄥˋ | 付之一笑 ㄈㄨˋ ㄓ ㄧ ㄒㄧㄠˋ => ㄈㄨˋ ㄓ ㄧˊ ㄒㄧㄠˋ"
      "| 總統一定會來 ㄗㄨㄥˇ ㄊㄨㄥˇ ㄧ ㄉㄧㄥˋ ㄏㄨㄟˋ ㄌㄞˊ => ㄗㄨㄥˊ ㄊㄨㄥˇ ㄧˊ ㄉㄧㄥˋ ㄏㄨㄟˋ ㄌㄞˊ")
# ... 之一 "one of" keeps it before an adverb too (之一就是: not the MOE word 一就), and so does a fraction
cases("原因之一就是 ㄩㄢˊ ㄧㄣ ㄓ ㄧ ㄐㄧㄡˋ ㄕˋ => = | 原因之一則是 ㄩㄢˊ ㄧㄣ ㄓ ㄧ ㄗㄜˊ ㄕˋ => ="
      "| 名言之一是 ㄇㄧㄥˊ ㄧㄢˊ ㄓ ㄧ ㄕˋ => = | 十分之一秒 ㄕˊ ㄈㄣ ㄓ ㄧ ㄇㄧㄠˇ => =")
# ... but 之 "it" after a one-character verb does not (MOE 付之一笑 (變) ㄧˊ), nor 之 before a word starting with 一
cases("使之一致 ㄕˇ ㄓ ㄧ ㄓˋ => ㄕˇ ㄓ ㄧˊ ㄓˋ | 與之一起 ㄩˇ ㄓ ㄧ ㄑㄧˇ => ㄩˇ ㄓ ㄧˋ ㄑㄧˇ"
      "| 為之一變 ㄨㄟˋ ㄓ ㄧ ㄅㄧㄢˋ => ㄨㄟˋ ㄓ ㄧˊ ㄅㄧㄢˋ"
      "| 精神為之一振 ㄐㄧㄥ ㄕㄣˊ ㄨㄟˋ ㄓ ㄧ ㄓㄣˋ => ㄐㄧㄥ ㄕㄣˊ ㄨㄟˋ ㄓ ㄧˊ ㄓㄣˋ"
      "| 眼睛為之一亮 ㄧㄢˇ ㄐㄧㄥ ㄨㄟˋ ㄓ ㄧ ㄌㄧㄤˋ => ㄧㄢˇ ㄐㄧㄥ ㄨㄟˋ ㄓ ㄧˊ ㄌㄧㄤˋ"
      "| 簡而言之一定 ㄐㄧㄢˇ ㄦˊ ㄧㄢˊ ㄓ ㄧ ㄉㄧㄥˋ => ㄐㄧㄢˇ ㄦˊ ㄧㄢˊ ㄓ ㄧˊ ㄉㄧㄥˋ"
      "| 人之一生 ㄖㄣˊ ㄓ ㄧ ㄕㄥ => ㄖㄣˊ ㄓ ㄧˋ ㄕㄥ")
# a 一 right after a word that ends in 一 (唯一, 統一, 萬一, 星期一) is no number: it changes
cases("唯一一次 ㄨㄟˊ ㄧ ㄧ ㄘˋ => ㄨㄟˊ ㄧ ㄧˊ ㄘˋ | 唯一一個 ㄨㄟˊ ㄧ ㄧ ˙ㄍㄜ => ㄨㄟˊ ㄧ ㄧˊ ˙ㄍㄜ"
      "| 統一一下 ㄊㄨㄥˇ ㄧ ㄧ ㄒㄧㄚˋ => ㄊㄨㄥˇ ㄧ ㄧˊ ㄒㄧㄚˋ | 萬一一定 ㄨㄢˋ ㄧ ㄧ ㄉㄧㄥˋ => ㄨㄢˋ ㄧ ㄧˊ ㄉㄧㄥˋ"
      "| 星期一一定 ㄒㄧㄥ ㄑㄧˊ ㄧ ㄧ ㄉㄧㄥˋ => ㄒㄧㄥ ㄑㄧˊ ㄧ ㄧˊ ㄉㄧㄥˋ | 週一一次 ㄓㄡ ㄧ ㄧ ㄘˋ => ㄓㄡ ㄧ ㄧˊ ㄘˋ"
      "| 第十一次 ㄉㄧˋ ㄕˊ ㄧ ㄘˋ => = | 一一列舉 ㄧ ㄧ ㄌㄧㄝˋ ㄐㄩˇ => =")
# ... but only those words: MOE's 不一 / 加一 (longest match takes them in 不一起, 再加一點) do not keep 一
cases("再加一點 ㄗㄞˋ ㄐㄧㄚ ㄧ ㄉㄧㄢˇ => ㄗㄞˋ ㄐㄧㄚ ㄧˋ ㄉㄧㄢˇ")
same("我們不一起去", "ㄨㄛˇ ˙ㄇㄣ ㄅㄨˋ ㄧ ㄑㄧˇ ㄑㄩˋ", "ㄨㄛˇ ˙ㄇㄣ ㄅㄨˋ ㄧˋ ㄑㄧˇ ㄑㄩˋ",
     verify_it=False)   # (not idempotent by nature: 不 before the said ㄧˋ would change again)
same("均一價", "ㄐㄩㄣ ㄧ ㄐㄧㄚˋ", "=", verify_it=False)      # Taiwan shop sign (均一 is an MOE word, 均一價 is not)
# a number needs a digit before 一: 千萬 "by all means" is no number, 三萬一千 / 二十一天 are
cases("千萬一定要小心 ㄑㄧㄢ ㄨㄢˋ ㄧ ㄉㄧㄥˋ ㄧㄠˋ ㄒㄧㄠˇ ㄒㄧㄣ => ㄑㄧㄢ ㄨㄢˋ ㄧˊ ㄉㄧㄥˋ ㄧㄠˋ ㄒㄧㄠˇ ㄒㄧㄣ"
      "| 千萬不要 ㄑㄧㄢ ㄨㄢˋ ㄅㄨˋ ㄧㄠˋ => ㄑㄧㄢ ㄨㄢˋ ㄅㄨˊ ㄧㄠˋ"
      "| 二十一天 ㄦˋ ㄕˊ ㄧ ㄊㄧㄢ => = | 三萬一千 ㄙㄢ ㄨㄢˋ ㄧ ㄑㄧㄢ => ="
      "| 一萬一千 ㄧ ㄨㄢˋ ㄧ ㄑㄧㄢ => ㄧˊ ㄨㄢˋ ㄧ ㄑㄧㄢ")
# ... but 百千萬億 not ending a word of their own are a number (MOE 修訂本 百一詩 ㄅㄞˇ ㄧ ㄕ, no 變),
# 百萬 + 一定 is not; and 一 before 百千萬億 changes after 之 too (百分之一百 "100%", like any 一百)
cases("百一詩 ㄅㄞˇ ㄧ ㄕ => = | 百萬一定 ㄅㄞˇ ㄨㄢˋ ㄧ ㄉㄧㄥˋ => ㄅㄞˇ ㄨㄢˋ ㄧˊ ㄉㄧㄥˋ"
      "| 百分之一百 ㄅㄞˇ ㄈㄣ ㄓ ㄧ ㄅㄞˇ => ㄅㄞˇ ㄈㄣ ㄓ ㄧˋ ㄅㄞˇ"
      "| 百分之一千 ㄅㄞˇ ㄈㄣ ㄓ ㄧ ㄑㄧㄢ => ㄅㄞˇ ㄈㄣ ㄓ ㄧˋ ㄑㄧㄢ"
      "| 他百分之一百同意 ㄊㄚ ㄅㄞˇ ㄈㄣ ㄓ ㄧ ㄅㄞˇ ㄊㄨㄥˊ ㄧˋ => ㄊㄚ ㄅㄞˇ ㄈㄣ ㄓ ㄧˋ ㄅㄞˇ ㄊㄨㄥˊ ㄧˋ"
      "| 千分之一 ㄑㄧㄢ ㄈㄣ ㄓ ㄧ => =")
# a neutral 一 (看一看), and ㄧ syllables of other characters, are left alone
same("看一看", "ㄎㄢˋ ˙ㄧ ㄎㄢˋ", "=", verify_it=False)   # (MOE has no entry; the ˙ㄧ spelling is made up)
cases("醫生 ㄧ ㄕㄥ => = | 衣服 ㄧ ˙ㄈㄨ => = | 一，二。 ㄧ ㄦˋ => =")
# 一 and 不 together: the next syllable's written tone decides
cases("不一定 ㄅㄨˋ ㄧ ㄉㄧㄥˋ => ㄅㄨˋ ㄧˊ ㄉㄧㄥˋ | 不一樣 ㄅㄨˋ ㄧ ㄧㄤˋ => ㄅㄨˋ ㄧˊ ㄧㄤˋ"
      "| 一不小心 ㄧ ㄅㄨˋ ㄒㄧㄠˇ ㄒㄧㄣ => ㄧˊ ㄅㄨˋ ㄒㄧㄠˇ ㄒㄧㄣ")
same("我想買一杯珍珠奶茶，半糖少冰。", "ㄨㄛˇ ㄒㄧㄤˇ ㄇㄞˇ ㄧ ㄅㄟ ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ ㄅㄢˋ ㄊㄤˊ ㄕㄠˇ ㄅㄧㄥ",
     "ㄨㄛˊ ㄒㄧㄤˊ ㄇㄞˇ ㄧˋ ㄅㄟ ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ ㄅㄢˋ ㄊㄤˊ ㄕㄠˇ ㄅㄧㄥ")

# ---- 不: ㄅㄨˊ before T4 (and before a neutral syllable whose full tone is T4); unchanged elsewhere
cases("不要 ㄅㄨˋ ㄧㄠˋ => ㄅㄨˊ ㄧㄠˋ | 不是 ㄅㄨˋ ㄕˋ => ㄅㄨˊ ㄕˋ | 不是 ㄅㄨˋ ˙ㄕ => ㄅㄨˊ ˙ㄕ"
      "| 不對 ㄅㄨˋ ㄉㄨㄟˋ => ㄅㄨˊ ㄉㄨㄟˋ | 不錯 ㄅㄨˋ ㄘㄨㄛˋ => ㄅㄨˊ ㄘㄨㄛˋ | 不會 ㄅㄨˋ ㄏㄨㄟˋ => ㄅㄨˊ ㄏㄨㄟˋ"
      "| 對不對 ㄉㄨㄟˋ ㄅㄨˋ ㄉㄨㄟˋ => ㄉㄨㄟˋ ㄅㄨˊ ㄉㄨㄟˋ | 要不要 ㄧㄠˋ ㄅㄨˋ ㄧㄠˋ => ㄧㄠˋ ㄅㄨˊ ㄧㄠˋ"
      "| 我不要珍珠。 ㄨㄛˇ ㄅㄨˋ ㄧㄠˋ ㄓㄣ ㄓㄨ => ㄨㄛˇ ㄅㄨˊ ㄧㄠˋ ㄓㄣ ㄓㄨ")
cases("不好 ㄅㄨˋ ㄏㄠˇ => = | 不來 ㄅㄨˋ ㄌㄞˊ => = | 不行 ㄅㄨˋ ㄒㄧㄥˊ => = | 不吃 ㄅㄨˋ ㄔ => ="
      "| 不 ㄅㄨˋ => = | 不，是。 ㄅㄨˋ ㄕˋ => = | 對不起 ㄉㄨㄟˋ ˙ㄅㄨ ㄑㄧˇ => ="
      "| 步驟 ㄅㄨˋ ㄗㄡˋ => = | 布丁 ㄅㄨˋ ㄉㄧㄥ => ="
      "| 我也不知道 ㄨㄛˇ ㄧㄝˇ ㄅㄨˋ ㄓ ㄉㄠˋ => ㄨㄛˊ ㄧㄝˇ ㄅㄨˋ ㄓ ㄉㄠˋ")
same("不了", "ㄅㄨˋ ˙ㄌㄜ", "=", verify_it=False)       # 了 has no full-tone ㄌㄜ reading: 不 is left alone

# ---- words with no change: the 20 §6.4 pair words (only 水果 changes) and other everyday words
CORE20 = ("飛機 中國 身體 音樂 桌子 明天 銀行 蘋果 學校 孩子 老師 旅行 水果 考試 椅子 汽車 大學 電腦 電話 爸爸").split()
pair_rows = moe.read_csv(moe.CONTENT / "tones" / "pairs.csv")   # content-pairs may be extending it: any 3/3 word
for r in pair_rows:                                             # is said 2+3, any other word unchanged
    if "一" in r["zh"] or "不" in r["zh"] or len(moe.syllables(r["zhuyin"])) != 2:
        continue                                                # (pair_warnings reports those)
    b = moe.syllables(r["zhuyin"])
    want = f"{moe.with_tone(moe.base(b[0]), 2)} {b[1]}" if [moe.tone(s) for s in b] == [3, 3] else "="
    same(r["zh"], r["zhuyin"], want, verify_it=r["zh"] in CORE20)
check_core = {r["zh"] for r in pair_rows} >= set(CORE20)
if not check_core:
    errors.append("pairs.csv lost some of the 20 §6.4 words")
cases("媽媽 ㄇㄚ ˙ㄇㄚ => = | 認識 ㄖㄣˋ ˙ㄕ => = | 頭髮 ㄊㄡˊ ㄈㄚˇ => = | 便當 ㄅㄧㄢˋ ㄉㄤ => ="
      "| 捷運 ㄐㄧㄝˊ ㄩㄣˋ => = | 機車 ㄐㄧ ㄔㄜ => =")

# ---- format: normalized output; a zh that does not match the syllables gets 3+3 only
same("水果", "  ㄕㄨㄟˇ   ㄍㄨㄛˇ ", "ㄕㄨㄟˊ ㄍㄨㄛˇ", verify_it=False)
same("桌子", "ㄓㄨㄛ ㄗ˙", "ㄓㄨㄛ ˙ㄗ", verify_it=False)                 # TBCL writes the ˙ after
same("ABC", "ㄕㄨㄟˇ ㄍㄨㄛˇ", "ㄕㄨㄟˊ ㄍㄨㄛˇ", verify_it=False)
same("一定好", "ㄧ ㄉㄧㄥˋ", "=", verify_it=False)                        # 3 characters, 2 syllables: no 一 rule
same("", "", "", verify_it=False)

# ---- cross-checks on every case above
for zh, base, said in checked:
    b, s = moe.syllables(base), moe.syllables(said)
    if len(b) != len(s) or any(moe.base(x) != moe.base(y) for x, y in zip(b, s)):
        errors.append(f"{zh}: spoken {said} changes more than tones of {base}")
    if moe.spoken(zh, said) != said:                       # idempotent: the spoken form has nothing left to change
        errors.append(f"{zh}: spoken() is not idempotent on {said}")
    st, why = verify.check(zh, base)                       # the test inputs are real MOE spellings
    if st == "fail":
        errors.append(f"test input {zh} {base} fails the verifier: {why}")
    if said != moe.norm(base):                              # and every change is a sandhi the verifier allows
        st, why = verify.check(zh, said)
        if st != "warn" or "sandhi" not in why:
            errors.append(f"{zh} spoken {said}: the verifier says {st} ({why}), want a sandhi warning")

# ---- MOE 簡編本 oracle: every 一/不 "(變)" form it prints must be what spoken() says (3+3 aside: never printed)
KNOWN = {  # idioms where 一 contrasts with another number and keeps or changes its tone by convention
    "說一不二": "一 stays before 不 (one vs two)", "一不做二不休": "一 stays before 不 (one vs two)",
    "一五一十": "both 一 change although a digit follows",
}


def mask_33(said, base):
    """Undo 3+3 changes (MOE never prints them) so only 一/不 are compared."""
    return " ".join(b if moe.tone(b) == 3 and moe.tone(s) == 2 else s
                    for s, b in zip(moe.syllables(said), moe.syllables(base)))


agree, compared, known_seen = 0, 0, set()
for word, entries in moe.readings()["concised"].items():
    chars = [c for c in word if moe._is_cjk(c)]
    for e in entries:
        v = e.get("v")
        if not v or v["type"] != "變":
            continue
        b, w = moe.syllables(e["z"]), moe.syllables(v["z"])
        if len(b) != len(w) or len(b) != len(chars):
            continue
        if not {chars[i] for i in range(len(b)) if b[i] != w[i]} <= {"一", "不"}:
            continue                                        # a 變 of something else (neutral tone, 兒化 ...)
        compared += 1
        got = mask_33(moe.spoken(word, e["z"]), e["z"])
        if got == " ".join(w):
            agree += 1
        elif word in KNOWN:
            known_seen.add(word)
        else:
            errors.append(f"MOE 簡編本 prints {word} {e['z']} as {v['z']}, spoken() says {got}")
if compared < 700:
    errors.append(f"only {compared} MOE 一/不 sandhi forms found (is .cache/moe-data/readings.json complete?)")
print(f"MOE 簡編本 一/不 sandhi forms: {agree}/{compared} agree, known idiom exceptions: {', '.join(sorted(known_seen))}")


# ---- build functions, with a stub audio bank and made-up content
class StubBank:
    """The AudioBank interface without any audio work."""

    def __init__(self):
        self.moe, self.tts, self.juyin = {}, {}, set()

    def want_moe(self, aid, priority=5, nsyl=1):
        if aid:
            aid = str(aid)
            self.moe[aid] = min(priority, self.moe.get(aid, 99))
        return aid

    def want_juyin(self, symbol):
        self.juyin.add(symbol)

    def want_tts(self, text):
        self.tts[moe.norm(text)] = text
        return audio.tts_name(text)


def check(cond, msg):
    if not cond:
        errors.append(msg)


bank = StubBank()
# pairs: with a core column; spoken, ints, id and level attached; cell mismatches reported
rows = [{"t1": "3", "t2": "3", "zh": "水果", "zhuyin": "ㄕㄨㄟˇ ㄍㄨㄛˇ", "en": "fruit", "note": "said 2+3", "core": "1"},
        {"t1": "1", "t2": "1", "zh": "飛機", "zhuyin": "ㄈㄟ ㄐㄧ", "en": "airplane", "note": "", "core": "1"},
        {"t1": "4", "t2": "1", "zh": "便當", "zhuyin": "ㄅㄧㄢˋ ㄉㄤ", "en": "lunch box", "note": "", "core": ""},
        {"t1": "1", "t2": "1", "zh": "機車", "zhuyin": "ㄐㄧ ㄔㄜ", "en": "scooter", "note": "", "core": ""},
        {"t1": "2", "t2": "4", "zh": "老師", "zhuyin": "ㄌㄠˇ ㄕ", "en": "teacher (wrong cell)", "note": "", "core": ""},
        {"t1": "1", "t2": "3", "zh": "一起", "zhuyin": "ㄧ ㄑㄧˇ", "en": "together (said 4+3)", "note": "", "core": ""}]
pairs = build.build_pairs(bank, rows)
check([p["core"] for p in pairs] == [True, True, False, False, False, False],
      f"pairs core flags: {[p['core'] for p in pairs]}")
check(pairs[0]["spoken"] == "ㄕㄨㄟˊ ㄍㄨㄛˇ" and pairs[1]["spoken"] == "ㄈㄟ ㄐㄧ", "pairs spoken")
check(pairs[0]["t1"] == 3 and isinstance(pairs[0]["t2"], int), "pairs t1/t2 are ints")
check(pairs[0]["id"] == moe.audio_id("水果", "ㄕㄨㄟˇ ㄍㄨㄛˇ") and pairs[0]["id"] in bank.moe, "pairs id from the MOE map")
check(bank.moe.get(pairs[0]["id"]) == 0, "pair clips are wanted at priority 0")
check(pairs[0].get("level") == moe.tbcl_words()["水果"]["level"], "pairs TBCL level")
check(set(pairs[0]) >= {"t1", "t2", "zh", "zhuyin", "spoken", "en", "note", "core", "id"}, f"pair keys {sorted(pairs[0])}")
warn = build.pair_warnings(pairs)
check(len(warn) == 2 and "老師" in warn[0] and "一起" in warn[1] and "ㄧˋ ㄑㄧˇ" in warn[1], f"pair_warnings: {warn}")
old = build.build_pairs(StubBank(), [{k: v for k, v in r.items() if k != "core"} for r in rows[:2]])
check(all(p["core"] for p in old), "without a core column every row is core (the M1 file)")
real = build.build_pairs(StubBank())                     # the real content/tones/pairs.csv, whatever its state
check(len(real) >= 20 and sum(p["core"] for p in real) == 20, f"real pairs.csv: {len(real)} rows, "
      f"{sum(p['core'] for p in real)} core (want the 20 §6.4 words)")

# sandhi: spoken forms, sentence TTS keys, and the build-failing checks
src = {"rules": [{"id": r} for r in ("3+3", "half3", "yi", "bu")], "items": [
    {"rule": "3+3", "kind": "word", "zh": "水果", "zhuyin": "ㄕㄨㄟˇ ㄍㄨㄛˇ", "en": "fruit"},
    {"rule": "half3", "kind": "word", "zh": "老師", "zhuyin": "ㄌㄠˇ ㄕ", "en": "teacher"},
    {"rule": "yi", "kind": "word", "zh": "一定", "zhuyin": "ㄧ ㄉㄧㄥˋ", "en": "certainly"},
    {"rule": "yi", "kind": "word", "zh": "第一", "zhuyin": "ㄉㄧˋ ㄧ", "en": "first", "no_change": True},
    {"rule": "yi", "kind": "word", "zh": "一月", "zhuyin": "ㄧ ㄩㄝˋ", "en": "January", "no_change": True},
    {"rule": "bu", "kind": "word", "zh": "不好", "zhuyin": "ㄅㄨˋ ㄏㄠˇ", "en": "not good", "no_change": True},
    {"rule": "bu", "kind": "sentence", "zh": "我不要珍珠。", "zhuyin": "ㄨㄛˇ ㄅㄨˋ ㄧㄠˋ ㄓㄣ ㄓㄨ", "en": "No pearls."}]}
bank = StubBank()
sandhi, problems = build.build_sandhi(bank, src)
items = sandhi["items"]
check(problems == [], f"good sandhi items reported problems: {problems}")
check(sandhi["rules"] == src["rules"], "sandhi rules pass through")
check([e["spoken"] for e in items] == ["ㄕㄨㄟˊ ㄍㄨㄛˇ", "ㄌㄠˇ ㄕ", "ㄧˊ ㄉㄧㄥˋ", "ㄉㄧˋ ㄧ", "ㄧ ㄩㄝˋ", "ㄅㄨˋ ㄏㄠˇ",
                                   "ㄨㄛˇ ㄅㄨˊ ㄧㄠˋ ㄓㄣ ㄓㄨ"], f"sandhi spoken: {[e['spoken'] for e in items]}")
check(items[3].get("no_change") is True and items[0]["rule"] == "3+3" and items[0]["en"] == "fruit", "item fields kept")
check(items[2]["id"] == moe.audio_id("一定", "ㄧ ㄉㄧㄥˋ") and items[2]["audio"] is None, "words: MOE id, no audio")
key = audio.tts_name("我不要珍珠。")
check(items[6]["audio"] == key and moe.norm("我不要珍珠。") in bank.tts, "sentences ask for gTTS")
check(len(bank.tts) == 1, "only sentences get TTS (never words: ground rule 5)")
build.finish_sandhi_audio(sandhi, {key: {"src": "tts", "path": f"audio/tts/{key}", "label": audio.TTS_LABEL}})
check(items[6]["audio"] == f"audio/tts/{key}" and items[2]["audio"] is None, "finish_sandhi_audio: key -> docs path")
s2, _ = build.build_sandhi(StubBank(), src)
build.finish_sandhi_audio(s2, {})
check(s2["items"][6]["audio"] is None, "a failed TTS leaves audio None (browser voice, labelled)")
bad = {"rules": src["rules"], "items": [
    {"rule": "3+3", "kind": "word", "zh": "老師", "zhuyin": "ㄌㄠˇ ㄕ"},                      # no 3+3 in it
    {"rule": "yi", "kind": "word", "zh": "第一", "zhuyin": "ㄉㄧˋ ㄧ"},                      # needs no_change
    {"rule": "yi", "kind": "word", "zh": "一定", "zhuyin": "ㄧ ㄉㄧㄥˋ", "no_change": True},  # it does change
    {"rule": "bu", "kind": "word", "zh": "不好", "zhuyin": "ㄅㄨˋ ㄏㄠˇ"},                   # 不 does not change
    {"rule": "yi", "kind": "sentence", "zh": "我很好。", "zhuyin": "ㄨㄛˇ ㄏㄣˇ ㄏㄠˇ"},     # changes, but not 一
    {"rule": "qiba", "kind": "word", "zh": "七月", "zhuyin": "ㄑㄧ ㄩㄝˋ"},                   # unknown rule
    {"rule": "half3", "kind": "word", "zh": "很好", "zhuyin": "ㄏㄣˇ ㄏㄠˇ", "no_change": True},
    {"rule": "half3", "kind": "word", "zh": "洗手", "zhuyin": "ㄒㄧˇ ㄕㄡˇ"},                # said 2+3: a 3+3 word
    {"rule": "half3", "kind": "word", "zh": "一起", "zhuyin": "ㄧ ㄑㄧˇ"},                    # changes (一), no half-third
    {"rule": "half3", "kind": "word", "zh": "早", "zhuyin": "ㄗㄠˇ"},                         # T3 with nothing after it
    {"rule": "half3", "kind": "word", "zh": "早", "zhuyin": "ㄗㄠˇ", "no_change": True},      # ... no_change or not
    {"rule": "half3", "kind": "sentence", "zh": "你好。", "zhuyin": "ㄋㄧˇ ㄏㄠˇ"},          # only a 3+3, no half-third
    {"rule": "half3", "kind": "word", "zh": "好，吃", "zhuyin": "ㄏㄠˇ ㄔ"}]}                 # half-third across a comma
_, problems = build.build_sandhi(StubBank(), bad)
check(len(problems) == len(bad["items"]), f"each bad sandhi item must be reported, got {len(problems)}: {problems}")
check(sum("not a written change" in p for p in problems) == 2 and "洗手" in next(
    (p for p in problems if "not a written change" in p), ""), f"half3 words that change name the rule: {problems}")
# half3 that holds: T3 before T1/T2/T4/neutral, unchanged; a sentence may also carry an incidental 3+3
half3_ok = {"rules": src["rules"], "items": [
    {"rule": "half3", "kind": "word", "zh": z, "zhuyin": y} for z, y in
    (("老師", "ㄌㄠˇ ㄕ"), ("旅行", "ㄌㄩˇ ㄒㄧㄥˊ"), ("考試", "ㄎㄠˇ ㄕˋ"), ("椅子", "ㄧˇ ˙ㄗ"))] + [
    {"rule": "half3", "kind": "word", "zh": "好吃", "zhuyin": "ㄏㄠˇ ㄔ", "no_change": True},
    {"rule": "half3", "kind": "sentence", "zh": "我很喜歡。", "zhuyin": "ㄨㄛˇ ㄏㄣˇ ㄒㄧˇ ㄏㄨㄢ"}]}
hs, problems = build.build_sandhi(StubBank(), half3_ok)
check(problems == [] and hs["items"][-1]["spoken"] == "ㄨㄛˊ ㄏㄣˊ ㄒㄧˇ ㄏㄨㄢ", f"good half3 items: {problems}")
p_nc = build.sandhi_problem({"rule": "half3", "kind": "sentence", "zh": "我很喜歡。", "zhuyin": "ㄨㄛˇ ㄏㄣˇ ㄒㄧˇ ㄏㄨㄢ",
                             "spoken": "ㄨㄛˊ ㄏㄣˊ ㄒㄧˇ ㄏㄨㄢ", "no_change": True})
check(p_nc and "no_change" in p_nc, f"a half3 sentence marked no_change may not carry a 3+3: {p_nc}")
check(build.syllable_runs("好，吃", 2) == [[0], [1]] and build.syllable_runs("ABC", 2) == [[0, 1]], "syllable_runs")
_, p0 = build.build_sandhi(StubBank(), {"items": [{"rule": "yi", "kind": "word", "zh": "一天", "zhuyin": "ㄧ ㄊㄧㄢ"}]})
check(p0 == [], "without a rules list the four §6.4 rule ids are known")
empty, p1 = build.build_sandhi(StubBank(), {})
check(empty == {"rules": [], "items": []} and p1 == [], "missing sandhi.json -> empty, no failure")

# readings
rd = build.build_readings(StubBank(), [
    {"zh": "垃圾", "zhuyin": "ㄌㄜˋ ㄙㄜˋ", "mainland": "lājī", "note": "", "type": "difference"},
    {"zh": "認識", "zhuyin": "ㄖㄣˋ ˙ㄕ", "mainland": "", "note": "", "type": "not_difference"}])
check([r["type"] for r in rd] == ["difference", "not_difference"] and rd[0]["mainland"] == "lājī", "readings fields")
check(rd[0]["id"] == moe.audio_id("垃圾", "ㄌㄜˋ ㄙㄜˋ") and rd[0]["spoken"] == "ㄌㄜˋ ㄙㄜˋ", "readings id and spoken")
check(isinstance(build.build_readings(StubBank()), list), "real taiwan-readings.csv (or none) loads")

# tone examples: 媽 麻 馬 罵
bank = StubBank()
te = build.build_tone_examples(bank)
check(te == {"1": "0527", "2": "0529", "3": "0534", "4": "0539"}, f"tone_examples {te}")
check(all(bank.moe.get(i) == 0 for i in te.values()), "tone examples wanted at priority 0")

# id_pool candidates (real data): TBCL 漢字表 ≤ 第3*級, first-listed reading, a reading the TBCL word list gives
# the character, tone 1-4. The grid's character often fails the last test (們 is ˙ㄇㄣ in TBCL, never ㄇㄣˊ).
bank = StubBank()
pc = build.id_pool_candidates(bank)
top = moe.level_rank(build.ID_POOL_MAX_LEVEL)
for syl, want in (("ㄇㄣˊ", "門"), ("ㄉㄧˋ", "弟"), ("ㄐㄧˇ", "幾"), ("ㄇㄛˋ", "末"), ("ㄍㄜˋ", "各"), ("ㄇㄚ", "媽")):
    got = [c["zh"] for c in pc.get(syl, [])]
    check(got[:1] == [want], f"id_pool candidates for {syl}: {got} (want {want} first)")
    check(bool(got) and bank.moe.get(pc[syl][0]["id"]) is not None, f"the first {syl} candidate's clip is wanted")
for syl, gone in (("ㄇㄣˊ", "們"), ("ㄉㄧˋ", "的"), ("ㄐㄧˇ", "給"), ("ㄇㄛˋ", "沒"), ("ㄉㄨ", "都"), ("ㄋㄧˊ", "呢"),
                  ("ㄨㄛˋ", "喔"), ("ㄇㄛˊ", "麼"), ("ㄆㄧㄣˊ", "蘋")):
    check(gone not in [c["zh"] for c in pc.get(syl, [])], f"{gone} {syl} is not a TBCL reading: out of the pool")
check(not any(moe.tone(s) == 5 for s in pc), "no neutral-tone syllable in the pool")
check(all(moe.level_rank(c["level"]) <= top and build.first_reading_is(c["zh"], s) and build.tbcl_lists_reading(c["zh"], s)
          for s, lst in pc.items() for c in lst), "every candidate passes the level / first / TBCL-reading filters")
check(len(bank.moe) == len(pc), f"one clip wanted per pool syllable, not {len(bank.moe)} for {len(pc)}")
check(build.tbcl_lists_reading("剛", "ㄍㄤ") and build.tbcl_lists_reading("门", "ㄇㄣˊ"),
      "an empty TBCL reading list (剛) or an unknown character counts as listed")
g0 = build.build_syllable_grid(StubBank())
if g0["cells"].get("ㄇㄣ", {}).get("2", {}).get("zh") == "們":
    check(any("們→門" in n for n in build.pool_notes([{"zh": "門", "zhuyin": "ㄇㄣˊ", "tone": 2}], g0)),
          "pool_notes names the syllables whose character differs from the grid's")

# build_id_pool: per syllable the first candidate with a published MOE clip and a model contour
cands = {
    "ㄇㄚ": [{"zh": "媽", "id": "0527", "level": "第1級"}],
    "ㄇㄚˇ": [{"zh": "馬", "id": "0534", "level": "第1*級"}],
    "ㄇㄣˊ": [{"zh": "門", "id": "x0", "level": "第1*級"},                      # no clip: falls to the next one
              {"zh": "瞞", "id": "x4", "level": "第3*級"}],
    "ㄅㄚ": [{"zh": "八", "id": "x1", "level": "第1級"}],                        # no contour
    "ㄅㄚˊ": [{"zh": "拔", "id": "x2", "level": "第3*級"}],                      # no clip
    "ㄅㄚˋ": [{"zh": "爸", "id": "x3", "level": "第1級"}]}                        # a TTS entry, not MOE
index = {i: {"src": "moe", "path": f"audio/moe/{i}.ogg", "start": 0, "end": 1} for i in ("0527", "0534", "x1", "x4")}
index["x3"] = {"src": "tts", "path": "audio/tts/x3.mp3"}
cont = {i: {"st": [0] * 40} for i in ("0527", "0534", "x0", "x2", "x3", "x4")}
pool = build.build_id_pool(cands, index, cont)
check([(p["zh"], p["zhuyin"], p["tone"], p["id"], p["level"]) for p in pool] ==
      [("媽", "ㄇㄚ", 1, "0527", "第1級"), ("馬", "ㄇㄚˇ", 3, "0534", "第1*級"), ("瞞", "ㄇㄣˊ", 2, "x4", "第3*級")],
      f"id_pool {pool}")
check(build.build_id_pool(cands, index, {}) == [], "no contours, no pool")
why = build.empty_pool_reason(cands, index, {}, True)
check("--no-contours" in why, f"an empty pool under --no-contours says why: {why}")
check("clip" in build.empty_pool_reason(cands, {}, cont, False), "an empty pool without clips says why")
tones = {"pairs": pairs, "sandhi": sandhi, "readings": rd, "tone_examples": te, "id_pool": pool}
ids = build.tones_ids(tones)
check(None not in ids and {"0527", pairs[0]["id"], items[2]["id"], rd[0]["id"]} <= ids, "tones_ids collects every id")

# --no-contours reuses contours computed before: the contour cache (current span + parameters), else the old file
cache = build.contours.load_cache()
hit = next(((k, v) for k, v in cache.items() if v and k.endswith(":" + build.contours.PARAMS_TAG)), None)
rindex = {"y1": {"src": "moe", "start": 0.1, "end": 0.5}, "y2": {"src": "moe", "start": 0.1, "end": 0.5},
          "y3": {"src": "tts", "path": "audio/tts/y3.mp3"}}
old_file = {"y1": {"st": [1] * 40}, "y3": {"st": [2] * 40}}
if hit:
    aid, start, end, _ = hit[0].split(":")
    rindex[aid] = {"src": "moe", "start": start, "end": end}          # the span as the cache key spells it
    old_file[aid] = {"st": [9] * 40}                                  # the cache wins over the old file
rc, n_old = build.reuse_contours(rindex, sorted(rindex), old=old_file)
check(rc.get("y1") == old_file["y1"] and "y2" not in rc and "y3" not in rc and n_old == 1,
      f"reuse_contours falls back to the old contours.json for MOE ids only: {sorted(rc)} ({n_old} from old)")
if hit:
    check(rc.get(aid) == hit[1], "reuse_contours takes the contour cache entry for the clip's current span")
else:
    print("  (no contour cache: the cache half of reuse_contours is not checked)")

# every MOE clip names its voice (one human voice so far)
vi = build.tag_voices({"0527": {"src": "moe", "path": "audio/moe/0527.ogg"}, "juyin:ㄅ": {"src": "juyin"},
                       "t.mp3": {"src": "tts", "label": "TTS"}})
check(vi["0527"].get("voice") == build.MOE_VOICE == "moe-announcer" and "voice" not in vi["juyin:ㄅ"]
      and "voice" not in vi["t.mp3"], f"tag_voices: {vi}")

# contrasts carry the spoken form of every word (the drill's ruby shows it with "show sandhi")
cs = build.build_contrasts(StubBank(), {"contrasts": [{"id": "t", "sets": [[
    {"zh": "水餃", "zhuyin": "ㄕㄨㄟˇ ㄐㄧㄠˇ"}, {"zh": "睡覺", "zhuyin": "ㄕㄨㄟˋ ㄐㄧㄠˋ"}]]}]})
check([w["spoken"] for w in cs[0]["sets"][0]] == ["ㄕㄨㄟˊ ㄐㄧㄠˇ", "ㄕㄨㄟˋ ㄐㄧㄠˋ"] and cs[0]["id"] == "t",
      f"contrast words get spoken: {cs}")
real_c = build.build_contrasts(StubBank())
check(all("spoken" in w for c in real_c for s in c["sets"] for w in s), "every real contrast word has spoken")

# the syllable grid carries the first flag (更 ㄍㄥ is first-listed, 更 ㄍㄥˋ is not)
g = build.build_syllable_grid(StubBank())
cells = g["cells"]
check(all(isinstance(c.get("first"), bool) for cell in cells.values() for c in cell.values()), "every cell has first")
check(cells["ㄇㄚ"]["1"]["first"] is True, "媽 ㄇㄚ is first-listed")
if cells.get("ㄍㄥ", {}).get("4", {}).get("zh") == "更":
    check(cells["ㄍㄥ"]["4"]["first"] is False, "更 ㄍㄥˋ is not 更's first-listed reading")
n_first = sum(c["first"] for cell in cells.values() for c in cell.values())
print(f"syllable grid: {sum(len(c) for c in cells.values())} cells, {n_first} first-listed")

# ---- the real content, if it exists yet (reported, not failed here: the build fails on it)
real_sandhi = moe.read_json(build.TONES_DIR / "sandhi.json", default=None)
if real_sandhi is not None:
    try:
        s, probs = build.build_sandhi(StubBank(), real_sandhi)
        print(f"content/tones/sandhi.json: {len(s['items'])} items, {len(probs)} spoken-form problems")
        for p in probs:
            print("  INFO", p)
    except Exception as ex:  # content mid-edit
        print(f"content/tones/sandhi.json could not be built: {ex!r}")

for e in errors:
    print("FAIL", e)
print(f"test_spoken: {len(checked)} spoken() cases cross-checked, {len(errors)} failing case(s)")
assert not errors, f"{len(errors)} spoken / tone-build regression(s)"
