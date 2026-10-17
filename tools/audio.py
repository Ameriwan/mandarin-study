"""Audio pipeline (MASTER_PROMPT §7): MOE human recordings, the 37 handbook symbol recordings, and gTTS sentences.

MOE files are shipped whole (CC BY-ND 3.0 TW: never trimmed). The headword span {start, end} is found at build
time with ffmpeg silencedetect and the page plays only that span. An .mp3 twin (format conversion only, mono
~40 kbps) is added for Safari/iOS, chosen by canPlayType at runtime.
Library word clips (M4) are not published: the page streams them from the moedict CDN, and the build downloads them
into the cache only to measure the headword span (span_only / stream_spans, publish_moe(publish=False)).
A clip the CDN answers 404 for is recorded (NOT_FOUND_FILE, known_missing) and not asked for again for a while; the
build publishes no such id, nor the id of a clip whose download failed (the page then uses the labelled browser voice).
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402

MOE_CACHE = moe.CACHE / "moe-audio"
JUYIN_CACHE = moe.CACHE / "moe-juyin"
TTS_CACHE = moe.CACHE / "tts"
SPANS_FILE = MOE_CACHE / "spans-v4.json"   # v4: words need a >= 0.45 s pause (v3 cut 垃圾/私人 after one syllable)
NOT_FOUND_FILE = MOE_CACHE / "not-found-v1.json"   # {id: date}: clips the moedict CDN answered 404 / 410 for
NOT_FOUND_RECHECK_DAYS = 30                        # such a clip is asked for again after this many days
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


_not_found = None
_not_found_lock = threading.Lock()


def not_found():
    """{MOE id: date} of the clips the moedict CDN answered 404 / 410 for (cached in NOT_FOUND_FILE)."""
    global _not_found
    if _not_found is None:
        try:
            with open(NOT_FOUND_FILE, encoding="utf-8") as f:
                _not_found = json.load(f)
        except (OSError, ValueError):
            _not_found = {}
    return _not_found


def _set_not_found(aid, missing):
    with _not_found_lock:
        nf = not_found()
        if missing:
            nf[str(aid)] = time.strftime("%Y-%m-%d")
        elif nf.pop(str(aid), None) is None:
            return
        MOE_CACHE.mkdir(parents=True, exist_ok=True)
        with open(NOT_FOUND_FILE, "w", encoding="utf-8") as f:
            json.dump(nf, f, indent=0, sort_keys=True)


def known_missing(aid):
    """True when the CDN answered 404 / 410 for clip `aid` less than NOT_FOUND_RECHECK_DAYS days ago (and the clip
    is not cached): fetch_moe does not ask again, and the build publishes the id nowhere."""
    d = not_found().get(str(aid))
    if not d or (MOE_CACHE / f"{aid}.ogg").exists():
        return False
    try:
        return time.time() - time.mktime(time.strptime(d, "%Y-%m-%d")) < NOT_FOUND_RECHECK_DAYS * 86400
    except ValueError:
        return False


def missing_clips():
    """{id: why} of the clips known to be missing on the CDN, for library.drop_clips / lessons.drop_clips."""
    return {a: "404 on the moedict CDN" for a in list(not_found()) if known_missing(a)}


def fetch_moe(aid):
    """Download one MOE ogg into the cache (throttled, resumable across builds). Returns the path or None.
    A 404 / 410 is recorded (known_missing) and not retried; other errors are retried a few times."""
    global _last_fetch
    MOE_CACHE.mkdir(parents=True, exist_ok=True)
    dest = MOE_CACHE / f"{aid}.ogg"
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    if known_missing(aid):
        return None
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
                _set_not_found(aid, False)
                return dest
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):   # the CDN has no such clip: permanent until the recheck
                _set_not_found(aid, True)
                return None
            time.sleep(2 * (attempt + 1))
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


def span_only(aid, spans, nsyl=1, download=True):
    """The cache-only path (publish=False, M4): a clip the page streams from the moedict CDN (Library words, §7.6
    size budget) is downloaded into .cache/moe-audio/ only to measure its headword span; nothing goes to docs/.
    Returns the span entry ({start, end, dur, ...}) or None when the clip is not cached and cannot be fetched."""
    aid = str(aid)
    if aid in spans:
        return spans[aid]
    src = MOE_CACHE / f"{aid}.ogg"
    if not (src.exists() and src.stat().st_size > 1000):
        src = fetch_moe(aid) if download else None
    if not src:
        return None
    spans[aid] = detect_span(src, nsyl=nsyl)
    return spans[aid]


def stream_spans(wanted, max_new=None, download=True, log=print, on_batch=None, batch=30):
    """Headword spans of streamed clips. `wanted`: {MOE id: syllables}, in priority order. Clips already in the
    cache are measured first (no network), then at most `max_new` are downloaded (3 parallel connections, each
    throttled like fetch_moe) in batches of `batch`; after each batch the span file is saved and on_batch(spans) is
    called, so an interrupted build keeps what it measured and the next build continues (resumable).
    Clips the CDN answered 404 for (now or within NOT_FOUND_RECHECK_DAYS, known_missing) are not asked for again.
    Returns {"measured", "downloaded", "failed", "left", "unavailable": [ids with a 404 on the CDN],
    "failed_ids": [ids whose download failed otherwise this run]}: the build publishes neither kind of id."""
    spans = load_spans()
    todo = [str(a) for a in wanted if str(a) not in spans]
    nsyl = {str(a): n for a, n in wanted.items()}
    cached = [a for a in todo if (MOE_CACHE / f"{a}.ogg").exists()]
    measured = sum(1 for a in cached if span_only(a, spans, nsyl[a], download=False))
    if cached:
        save_spans(spans)
        if on_batch:
            on_batch(spans)
    have = set(cached)
    unavailable = [a for a in todo if a not in have and known_missing(a)]
    have |= set(unavailable)
    new = [a for a in todo if a not in have]
    allowed = [] if not download else new if max_new is None else new[:max(0, max_new)]
    log(f"  streamed clips: {len(wanted)} wanted, {len(wanted) - len(todo)} spans known, {measured} measured from the "
        f"cache, {len(unavailable)} known to be missing on the CDN (404), {len(new)} not cached, downloading "
        f"{len(allowed)} this run")
    done, failed_ids, n_known = 0, [], len(unavailable)
    if allowed:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=3) as ex:
            for i in range(0, len(allowed), batch):
                chunk = allowed[i:i + batch]
                for aid, path in zip(chunk, ex.map(fetch_moe, chunk)):
                    if path:
                        spans[aid] = detect_span(path, nsyl=nsyl[aid])
                        done += 1
                    elif known_missing(aid):
                        unavailable.append(aid)
                    else:
                        failed_ids.append(aid)
                save_spans(spans)
                if on_batch:
                    on_batch(spans)
                log(f"    streamed clips: {i + len(chunk)}/{len(allowed)} fetched ({len(failed_ids)} failed, "
                    f"{len(unavailable) - n_known} 404)")
    new_404 = len(unavailable) - n_known
    return {"measured": measured + done, "downloaded": done, "failed": len(failed_ids) + new_404,
            "left": len(new) - done - new_404, "unavailable": unavailable, "failed_ids": failed_ids}


def publish_moe(aid, spans, nsyl=1, publish=True):
    """Cache -> docs/audio/moe/<id>.ogg + .mp3, and compute the span once. Returns the audio.json entry or None.
    publish=False: cache only (span_only), for clips the page streams; returns {"src": "stream", ...span}."""
    if not publish:
        e = span_only(aid, spans, nsyl)
        return {"src": "stream", **e} if e else None
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


def tts_cached(text):
    p = TTS_CACHE / tts_name(text)
    return p.exists() and p.stat().st_size >= 500


TTS_GAP = 1.0          # seconds between gTTS requests (about 1 request/s)
TTS_FAIL_STREAK = 8    # this many failures in a row = rate-limited: request no more TTS this build
_last_tts = 0.0


def publish_tts(text, enabled=True):
    """gTTS zh-TW sentence audio (sentences only, §7.6), throttled to TTS_GAP s between requests and cached.
    Returns the docs path or None."""
    global _last_tts
    TTS_CACHE.mkdir(parents=True, exist_ok=True)
    name = tts_name(text)
    cached = TTS_CACHE / name
    if not cached.exists() or cached.stat().st_size < 500:
        if not enabled:
            return None
        wait = TTS_GAP - (time.time() - _last_tts)
        if wait > 0:
            time.sleep(wait)
        _last_tts = time.time()
        try:
            from gtts import gTTS
            gTTS(text, lang=TTS_LANG).save(str(cached))
        except Exception:
            cached.unlink(missing_ok=True)
            return None
        if cached.stat().st_size < 500:
            cached.unlink(missing_ok=True)
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
        self.moe_missing = {}    # {MOE id: why} of the wanted MOE clips not published (404, failed, not downloaded yet)
        self.downloaded = 0      # new MOE clips this run (render), so a later cache-only step can share --max-new
        self.tts_stats = {}

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

    def render(self, download=True, max_new=None, log=print, max_tts=None):
        """Publish everything wanted. max_new caps new MOE downloads, max_tts new gTTS requests (in the order the
        sentences were wanted; the rest stay missing until a later build, and the pages fall back to a labelled
        browser voice). After TTS_FAIL_STREAK failures in a row (a rate limit) no more TTS is requested."""
        spans = load_spans()
        todo = sorted(self.moe_ids, key=lambda a: (self.priority.get(a, 99), a))
        new = [a for a in todo if not (MOE_CACHE / f"{a}.ogg").exists()]
        if new and not download:
            log(f"  audio: {len(new)} MOE clips not cached (--no-audio); they will be missing")
        gone = {a for a in new if known_missing(a)}   # 404 on the CDN lately: not asked for again (see known_missing)
        fetchable = [a for a in new if a not in gone]
        allowed = set(fetchable if max_new is None else fetchable[:max_new])
        self.downloaded = len(allowed) if download else 0
        log(f"  audio: {len(todo)} MOE clips wanted, {len(new)} not cached ({len(gone)} known to be missing on the CDN), "
            f"downloading {len(allowed) if download else 0} this run (priority order)")
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
                self.moe_missing[aid] = "404 on the moedict CDN" if aid in gone else "not downloaded yet"
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
                self.moe_missing[aid] = "404 on the moedict CDN" if known_missing(aid) else "download failed"
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
        st = {"wanted": len(self.tts), "cached": 0, "requested": 0, "failed": 0, "deferred": 0}
        streak = 0
        for key, text in self.tts.items():
            cached = tts_cached(text)
            ask = (not cached and download and (max_tts is None or st["requested"] < max_tts)
                   and streak < TTS_FAIL_STREAK)
            st["cached"] += cached
            st["requested"] += ask
            p = publish_tts(text, enabled=ask or cached)
            if ask:
                streak = 0 if p else streak + 1
                st["failed"] += not p
                if streak == TTS_FAIL_STREAK:
                    log(f"  TTS: {streak} failures in a row (rate limit?): no more requests this build")
                if st["requested"] % 50 == 0:
                    log(f"    TTS requested {st['requested']} ({st['failed']} failed)")
            elif not cached:
                st["deferred"] += 1
            if p:
                self.index[tts_name(text)] = {"src": "tts", "path": p, "label": TTS_LABEL}
            else:
                self.missing.append(f"tts:{text[:20]}")
        self.tts_stats = st
        log(f"  TTS: {st['wanted']} sentences, {st['cached']} cached, {st['requested']} requested "
            f"({st['failed']} failed), {st['deferred']} left for a later build (--max-tts / rate limit / --no-audio)")
        return self.index
