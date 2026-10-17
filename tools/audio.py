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
SPANS_FILE = MOE_CACHE / "spans-v4.json"   # v4: words need a >= 0.45 s pause (v3 cut 垃圾/私人 after one syllable)
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


def _silences(path, noise_db, min_pause):
    r = run_ffmpeg(["-i", str(path), "-af", f"silencedetect=noise={noise_db}dB:d={min_pause}", "-f", "null", "-"])
    text = r.stderr
    dur = 0.0
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", text)
    if m:
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", text)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", text)]
    sil = []
    for s0 in starts:
        e = next((x for x in ends if x > s0), dur)
        sil.append((s0, e))
    return dur, sil


THRESHOLDS = (-35, -30, -25, -40, -45, -50)
CHAR_PAUSE, WORD_PAUSE = 0.15, 0.45


def detect_span(path, nsyl=1, min_pause=None, pad=0.05):
    """Headword span (§7.3): speech from the start up to the first pause of >= min_pause seconds.

    Single characters: the announcer's pause after a lone syllable can be as short as ~0.2 s (知), so 0.15 s counts.
    Words: a quiet initial inside the word (垃圾 ㄙ, 私人 ㄖ, 喜歡 ㄏ) leaves a gap of up to ~0.3 s while the pause
    after the headword is ~1 s, so only >= 0.45 s counts and the lower bound is higher (0.22 s per syllable).
    MOE recordings vary a lot in level (叫 peaks near -38 dB, 懂 has breath noise near -28 dB in its first pause),
    so one threshold is not enough: thresholds are tried in order and the first that yields a plausible headword
    length (lower bound to 0.85 s per syllable + 0.3 s) wins. If none does, the -35 dB result is kept and flagged
    `check` (a word cut after its first syllable lands here as too short).
    """
    n = max(1, nsyl)
    if min_pause is None:
        min_pause = CHAR_PAUSE if n == 1 else WORD_PAUSE
    lo, hi = (0.18 if n == 1 else 0.22) * n, 0.85 * n + 0.3
    fallback = None
    for db in THRESHOLDS:
        dur, sil = _silences(path, db, min_pause)
        speech_start = 0.0
        if sil and sil[0][0] <= 0.05:  # file opens with silence
            speech_start = sil[0][1]
            sil = sil[1:]
        floor = speech_start + 0.15 * n
        speech_end = next((s0 for s0, _ in sil if s0 >= floor), dur)
        out = {"start": round(speech_start, 3), "end": round(min(dur, speech_end + pad), 3), "dur": round(dur, 2)}
        if lo <= out["end"] - out["start"] <= hi:
            if db != THRESHOLDS[0]:
                out["db"] = db
            return out
        if fallback is None:
            fallback = out
    fallback["check"] = True
    return fallback


SEGMENTS_FILE = MOE_CACHE / "segments-v1.json"
MIN_CHUNK = 0.12      # shorter "speech" between two pauses is a click or a breath, not a chunk
SEGMENT_PAD = 0.05    # seconds added before and after each chunk (never past the middle of a pause)
MIN_SPEECH_SHARE = 0.4


def load_segments():
    return json.load(open(SEGMENTS_FILE, encoding="utf-8")) if SEGMENTS_FILE.exists() else {}


def save_segments(segs):
    MOE_CACHE.mkdir(parents=True, exist_ok=True)
    json.dump(segs, open(SEGMENTS_FILE, "w", encoding="utf-8"), indent=0, sort_keys=True)


def _chunks(dur, sil):
    """Speech chunks between the silences: [(start, end)], blips under MIN_CHUNK dropped."""
    raw, t = [], 0.0
    for s0, s1 in sil:
        if s0 - t >= MIN_CHUNK:
            raw.append((t, s0))
        t = max(t, s1)
    if dur - t >= MIN_CHUNK:
        raw.append((t, dur))
    return raw


def _padded(raw, dur, pad=SEGMENT_PAD):
    """[[start, end]] (2 decimals): each chunk padded by `pad`, never past the middle of the pause on either side
    or the ends of the file."""
    out = []
    for i, (a, b) in enumerate(raw):
        lo = (raw[i - 1][1] + a) / 2 if i else 0.0
        hi = (b + raw[i + 1][0]) / 2 if i + 1 < len(raw) else dur
        out.append([round(max(lo, a - pad), 2), round(min(hi, b + pad), 2)])
    return out


def segment_info(path, min_pause=WORD_PAUSE, nsyl=None, cache=None):
    """detect_segments with its details: {"segments": [[start, end], ...], "dur": seconds, "db"?: threshold when
    not the first, "check"?: True when no threshold gave a plausible result}. Cached in SEGMENTS_FILE by file
    stem (the MOE audio id), min_pause and nsyl. Pass `cache` (load_segments()) to batch many files and save
    it yourself with save_segments; without it the cache file is read and written on each call."""
    own = cache is None
    if own:
        cache = load_segments()
    key = f"{Path(path).stem}:{min_pause}:{nsyl or 0}"
    if key not in cache:
        n = nsyl or 0
        lo, hi = (0.15 * n, 0.85 * n + 0.3) if n else (0.15, 3.0)
        fallback = None
        for db in THRESHOLDS:
            dur, sil = _silences(path, db, min_pause)
            raw = _chunks(dur, sil)
            out = {"segments": _padded(raw, dur), "dur": round(dur, 2)}
            speech = sum(e - s for s, e in raw)
            if (len(raw) >= 2 and lo <= raw[0][1] - raw[0][0] <= hi
                    and dur and speech / dur >= MIN_SPEECH_SHARE):
                if db != THRESHOLDS[0]:
                    out["db"] = db
                break
            if fallback is None:
                fallback = out
        else:
            out = {**fallback, "check": True}
        cache[key] = out
        if own:
            save_segments(cache)
    return cache[key]


def detect_segments(path, min_pause=WORD_PAUSE, nsyl=None, cache=None):
    """Speech chunks of a whole-entry MOE reading (§7.3: headword, definition(s), 「例如」, example sentence,
    about 1 s apart): [[start, end], ...] in seconds of the file, for numbered loopable segments (the file is
    never cut; the player plays a range). A chunk ends at a pause of >= min_pause s.

    Multi-threshold like detect_span: silencedetect at -35 dB first, then -30 / -25 / -40 / -45 / -50 dB, until the
    result is plausible: at least two chunks, the first one (the headword) 0.15-0.85 s per syllable + 0.3 s when
    `nsyl` is given, and speech in at least 40 % of the file. On 203 cached word clips -35 dB passes for all but a
    few quiet ones (餃子: its neutral 子 sits under -35 dB, so -40 dB is used). A short chunk can be real: the
    announcer reads a sense number (一、二、) with a ~0.5 s pause after it. Blips under MIN_CHUNK are dropped and each
    chunk gets SEGMENT_PAD s on both sides so a quiet initial (ㄒ, ㄕ) is not clipped. Cached (segment_info)."""
    return segment_info(path, min_pause, nsyl, cache)["segments"]


def publish_moe(aid, spans, nsyl=1):
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
        spans[aid] = detect_span(src, nsyl=nsyl)
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
        self.nsyl = {}
        self.juyin = set()
        self.tts = {}
        self.index = {}
        self.missing = []

    def want_moe(self, aid, priority=5, nsyl=1):
        """priority: 0 = content words (symbols, contrasts, pairs), 1.. = grid cells by TBCL level; lower downloads first.
        nsyl: syllables in the headword (sets the floor for the span detector)."""
        if aid:
            aid = str(aid)
            self.moe_ids.add(aid)
            self.priority[aid] = min(priority, self.priority.get(aid, 99))
            self.nsyl[aid] = max(nsyl, self.nsyl.get(aid, 1))
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
        # Prefetch with a few parallel connections: this network is latency-bound (~20-30 s per 30 KB clip),
        # so 3 workers still stay far below one request per second.
        if download and allowed:
            from concurrent.futures import ThreadPoolExecutor
            ordered = [a for a in todo if a in allowed]
            with ThreadPoolExecutor(max_workers=3) as ex:
                for n, _ in enumerate(ex.map(fetch_moe, ordered), 1):
                    if n % 25 == 0:
                        log(f"    fetched {n}/{len(ordered)}")
        done_new = 0
        for i, aid in enumerate(todo, 1):
            if aid in new and (not download or aid not in allowed):
                self.missing.append(aid)
                continue
            if aid in new:
                done_new += 1
                if done_new % 25 == 0:
                    log(f"    downloaded {done_new}/{len(allowed)}")
            entry = publish_moe(aid, spans, self.nsyl.get(aid, 1))
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
