"""Audio pipeline (MASTER_PROMPT §7): MOE human recordings, the 37 handbook symbol recordings, and gTTS sentences.

MOE files are shipped whole (CC BY-ND 3.0 TW: never trimmed). The headword span {start, end} is found at build
time with ffmpeg silencedetect and the page plays only that span. An .mp3 twin (format conversion only, mono
~40 kbps) is added for Safari/iOS, chosen by canPlayType at runtime.
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402

MOE_CACHE = moe.CACHE / "moe-audio"
JUYIN_CACHE = moe.CACHE / "moe-juyin"
TTS_CACHE = moe.CACHE / "tts"
SPANS_FILE = MOE_CACHE / "spans.json"
OUT = moe.DOCS / "audio"
CDN = "https://r2-assets.moedict.tw/audio/a/{id}.ogg"
UA = "Mozilla/5.0 (mandarin-study build; personal study project; ~1 request/s)"
TTS_LANG = "zh-TW"
TTS_LABEL = "TTS (Google zh-TW)"

# Handbook WAV order confirmed from the MOE handbook index.html (2026-10-13):
# F1..F21 = ㄅ..ㄙ, F22..F34 = ㄚ..ㄦ, F35..F37 = ㄧ ㄨ ㄩ
JUYIN_ORDER = moe.INITIALS + moe.FINALS + moe.MEDIALS
JUYIN_INDEX = {s: i + 1 for i, s in enumerate(JUYIN_ORDER)}

_last_fetch = 0.0


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run_ffmpeg(args):
    return subprocess.run([ffmpeg(), "-hide_banner", "-nostdin", "-y", *args], capture_output=True, text=True,
                          encoding="utf-8", errors="replace")


def fetch_moe(aid):
    """Download one MOE ogg into the cache (throttled, resumable across builds). Returns the path or None."""
    global _last_fetch
    MOE_CACHE.mkdir(parents=True, exist_ok=True)
    dest = MOE_CACHE / f"{aid}.ogg"
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    for attempt in range(4):
        wait = 1.0 - (time.time() - _last_fetch)
        if wait > 0:
            time.sleep(wait)
        _last_fetch = time.time()
        try:
            req = urllib.request.Request(CDN.format(id=aid), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if data[:4] == b"OggS" and len(data) > 1000:
                dest.write_bytes(data)
                return dest
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def load_spans():
    return json.load(open(SPANS_FILE, encoding="utf-8")) if SPANS_FILE.exists() else {}


def save_spans(spans):
    json.dump(spans, open(SPANS_FILE, "w", encoding="utf-8"), indent=0, sort_keys=True)


def detect_span(path, noise_db=-35, min_pause=0.3, pad=0.05):
    """Headword span (§7.3): the first speech segment, up to the first pause of >= min_pause seconds."""
    r = run_ffmpeg(["-i", str(path), "-af", f"silencedetect=noise={noise_db}dB:d={min_pause}", "-f", "null", "-"])
    text = r.stderr
    dur = 0.0
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", text)
    if m:
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", text)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", text)]
    silences = []
    for s in starts:
        e = next((x for x in ends if x > s), dur)
        silences.append((s, e))
    speech_start = 0.0
    if silences and silences[0][0] <= 0.05:  # file opens with silence
        speech_start = silences[0][1]
        silences = silences[1:]
    speech_end = silences[0][0] if silences else dur
    end = min(dur, speech_end + pad)
    return {"start": round(speech_start, 3), "end": round(end, 3), "dur": round(dur, 2)}


def publish_moe(aid, spans):
    """Cache -> docs/audio/moe/<id>.ogg + .mp3, and compute the span once. Returns the audio.json entry or None."""
    src = fetch_moe(aid)
    if not src:
        return None
    out = OUT / "moe"
    out.mkdir(parents=True, exist_ok=True)
    ogg, mp3 = out / f"{aid}.ogg", out / f"{aid}.mp3"
    if not ogg.exists() or ogg.stat().st_size != src.stat().st_size:
        shutil.copyfile(src, ogg)
    if not mp3.exists() or mp3.stat().st_size < 500:
        run_ffmpeg(["-i", str(src), "-vn", "-ac", "1", "-ar", "22050", "-codec:a", "libmp3lame", "-b:a", "40k", str(mp3)])
    if aid not in spans:
        spans[aid] = detect_span(src)
    return {"src": "moe", **spans[aid]}


def publish_juyin(symbol):
    """Handbook WAV (CC BY 4.0) -> docs/audio/juyin/F<n>.mp3 (format conversion only)."""
    n = JUYIN_INDEX[symbol]
    src = JUYIN_CACHE / f"F{n}.WAV"
    if not src.exists():
        return None
    out = OUT / "juyin"
    out.mkdir(parents=True, exist_ok=True)
    mp3 = out / f"F{n}.mp3"
    if not mp3.exists() or mp3.stat().st_size < 500:
        run_ffmpeg(["-i", str(src), "-vn", "-ac", "1", "-ar", "22050", "-codec:a", "libmp3lame", "-b:a", "48k", str(mp3)])
    return f"audio/juyin/F{n}.mp3"


def tts_name(text):
    return "tts_" + hashlib.sha1(moe.norm(text).encode("utf-8")).hexdigest()[:12] + ".mp3"


def publish_tts(text, enabled=True):
    """gTTS zh-TW sentence audio (sentences only, §7.6). Returns the docs path or None."""
    TTS_CACHE.mkdir(parents=True, exist_ok=True)
    name = tts_name(text)
    cached = TTS_CACHE / name
    if not cached.exists() or cached.stat().st_size < 500:
        if not enabled:
            return None
        try:
            from gtts import gTTS
            gTTS(text, lang=TTS_LANG).save(str(cached))
        except Exception:
            return None
    out = OUT / "tts"
    out.mkdir(parents=True, exist_ok=True)
    dest = out / name
    if not dest.exists():
        shutil.copyfile(cached, dest)
    return f"audio/tts/{name}"


class AudioBank:
    """Collects everything the pages need, then publishes it. index: key -> entry for docs/data/audio.json."""

    def __init__(self):
        self.moe_ids = set()
        self.priority = {}
        self.juyin = set()
        self.tts = {}
        self.index = {}
        self.missing = []

    def want_moe(self, aid, priority=5):
        """priority: 0 = content words (symbols, contrasts, pairs), 1.. = grid cells by TBCL level; lower downloads first."""
        if aid:
            aid = str(aid)
            self.moe_ids.add(aid)
            self.priority[aid] = min(priority, self.priority.get(aid, 99))
        return aid

    def want_juyin(self, symbol):
        self.juyin.add(symbol)

    def want_tts(self, text):
        self.tts[moe.norm(text)] = text
        return tts_name(text)

    def render(self, download=True, max_new=None, log=print):
        spans = load_spans()
        todo = sorted(self.moe_ids, key=lambda a: (self.priority.get(a, 99), a))
        new = [a for a in todo if not (MOE_CACHE / f"{a}.ogg").exists()]
        if new and not download:
            log(f"  audio: {len(new)} MOE clips not cached (--no-audio); they will be missing")
        allowed = set(new if max_new is None else new[:max_new])
        log(f"  audio: {len(todo)} MOE clips wanted, {len(new)} not cached, downloading {len(allowed) if download else 0} this run (priority order)")
        done_new = 0
        for i, aid in enumerate(todo, 1):
            if aid in new and (not download or aid not in allowed):
                self.missing.append(aid)
                continue
            if aid in new:
                done_new += 1
                if done_new % 25 == 0:
                    log(f"    downloaded {done_new}/{len(allowed)}")
            entry = publish_moe(aid, spans)
            if entry:
                self.index[aid] = entry
            else:
                self.missing.append(aid)
            if i % 50 == 0:
                save_spans(spans)
                log(f"    {i}/{len(todo)}")
        save_spans(spans)
        for s in sorted(self.juyin, key=lambda x: JUYIN_INDEX[x]):
            p = publish_juyin(s)
            if p:
                self.index[f"juyin:{s}"] = {"src": "juyin", "path": p}
            else:
                self.missing.append(f"juyin:{s}")
        for key, text in self.tts.items():
            p = publish_tts(text, enabled=download)
            if p:
                self.index[tts_name(text)] = {"src": "tts", "path": p, "label": TTS_LABEL}
            else:
                self.missing.append(f"tts:{text[:20]}")
        return self.index
