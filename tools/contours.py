"""Model pitch contours (MASTER_PROMPT §7.4), precomputed from the MOE headword spans.

Output per clip, time-normalized to N_POINTS over the voiced window [t0, t1] inside the span:
  st      F0 in semitones relative to the speaker's own median over the voiced frames
  v       per-point voicing mask (1 = measured, 0 = inside an unvoiced gap, where st is only interpolated)
  hz      that median in Hz;  t: [t0, t1] in seconds of the file;  voiced: share of voiced frames in [t0, t1]
The page computes the learner's contour live with pitchy and normalizes it the same way, so voice height does
not matter; it should skip or dash the v=0 points and leave them out of any distance score.

Why not pyin (which §7.4 names): on the MOE clips most energy sits in the 1-3 kHz formants, so YIN's difference
function is noisy on the raw signal, pyin's voicing flag drops T4 falls and T3 dips, and its 60-500 Hz search
keeps octave errors (QA 2026-10-13). Here, the same YIN measure done by hand: low-pass at 600 Hz, CMNDF on 46 ms
frames, every CMNDF trough as a pitch candidate, and a Viterbi path that pays for pitch jumps and for voicing
switches. Voicing = periodicity weighed against the frame's low-band level (a loud frame is a vowel, so calling
it unvoiced costs more; in a word each syllable is measured against its own peak), inside an RMS gate. Then an
octave-continuity rule. There is no floor relative to the median: real T4 falls reach 20 st and a T3 in a
word can sit 15 st under a T1 (身體), both checked against the harmonic spacing in the spectrum.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402

CACHE_FILE = moe.CACHE / "moe-audio" / "contours-v2.json"
N_POINTS = 40
PARAMS = {  # every value goes into the cache key; bump "algo" when the code changes what it computes
    "algo": "cmndf-viterbi-4",  # 3: _trim_creak_tail (quiet upturns; any upturn ending a single T4)
                                # 4: words keep a syllable that follows a consonant gap (_continuity word_*)
    "fmin": 60, "fmax": 500,        # search range in Hz
    "frame_s": 0.0465, "hop": 0.25,  # analysis frame in seconds, hop as a share of it
    "click_s": 0.003,               # zeroed at the start of each file (see contour)
    "lowpass": 600,                 # Hz; f0 periodicity shows only below F1 (most energy sits at 1-3 kHz)
    "gate_db": -30,                 # RMS gate relative to the loudest frame of the span
    "unvoiced": 0.9,                # cost of calling the loudest frame unvoiced (a voiced frame costs its CMNDF),
    "unvoiced_db": 0.025,           # less this much per dB that a frame's level below 600 Hz is under the top,
    "unvoiced_min": 0.2,            # down to this: loud low-band energy is a vowel, quiet tails are mostly creak
    "word_ref_s": 0.12,             # words: that level is relative to the loudest frame within +- this many s
    "switch": 0.4,                  # cost of a voiced <-> unvoiced switch
    "jump": 0.1, "free_st": 2.0,    # cost per semitone of frame-to-frame change beyond free_st
    "octave": 0.04,                 # cost per octave below fmax (breaks ties against sub-harmonics)
    "min_run": 3,                   # shortest voiced run kept, in frames
    "max_gap": 5,                   # octave-continuity rule (_continuity): a pitch jump across <= max_gap frames
    "max_jump": 5, "max_jump_word": 7,  # larger than this many st (words: allows a voiced consonant between
    "fold_tol": 1.5,                # syllables) is folded back if within fold_tol st of an octave, else dropped
    "break_st": 8, "break_share": 0.3,  # unless it is a strong piece close by (a creak break, see _continuity)
    "word_gap": 3, "word_piece": 6, "word_share": 0.05,  # words: or a new syllable after a gap (see _continuity)
    "tail_db": -15, "tail_rise": 2.0,   # _trim_creak_tail: a tail quieter than this that rises this many st is cut
    "n_points": N_POINTS,
}
PARAMS_TAG = hashlib.sha1(json.dumps(PARAMS, sort_keys=True).encode()).hexdigest()[:8]
P = PARAMS


def _cmndf(y, frame, hop, lag_min, lag_max):
    """YIN cumulative mean normalized difference, shape (lags lag_min..lag_max, frames), frames centered."""
    import librosa
    fr = librosa.util.frame(np.pad(y, frame // 2), frame_length=frame, hop_length=hop)
    acf = librosa.autocorrelate(fr, max_size=lag_max + 1, axis=0)
    energy = np.cumsum(fr ** 2, axis=0)
    d = np.zeros((lag_max + 1, fr.shape[1]))
    d[1:] = 2 * (acf[:1] - acf[1:]) - energy[:lag_max]
    mean = np.cumsum(d[1:], axis=0) / np.arange(1, lag_max + 1)[:, None]
    return d[lag_min:] / (mean[lag_min - 1:] + 1e-12)


def _candidates(col, lag_min, sr, keep=6):
    """Pitch candidates of one frame: the deepest CMNDF troughs -> (hz, cost)."""
    k = np.where((col[1:-1] < col[:-2]) & (col[1:-1] <= col[2:]))[0] + 1
    k = k[np.argsort(col[k])][:keep]
    a, b, c = col[k - 1], col[k], col[k + 1]
    den = a - 2 * b + c
    shift = np.where(den > 0, 0.5 * (a - c) / np.where(den > 0, den, 1), 0)
    hz = sr / (lag_min + k + shift)
    return hz, b + P["octave"] * np.log2(P["fmax"] / hz)


def _viterbi(cands, allowed, unvoiced):
    """Cheapest path through [unvoiced] + candidates per frame, starting and ending unvoiced (a span is cut at
    silence or a consonant, so voicing at its edges pays a switch too). Returns f0 per frame, nan = unvoiced."""
    total, st_prev, back = None, None, []
    for (hz, cost), ok, u in zip(cands, allowed, unvoiced):
        st = 12 * np.log2(hz)
        emit = np.concatenate([[u], cost if ok else np.full(len(cost), np.inf)])
        if total is None:
            total = emit + _edge(len(emit))
            back.append(np.zeros(len(emit), int))
        else:
            trans = np.full((len(total), len(emit)), P["switch"])
            trans[0, 0] = 0
            trans[1:, 1:] = P["jump"] * np.maximum(0, np.abs(st_prev[:, None] - st[None, :]) - P["free_st"])
            step = total[:, None] + trans
            back.append(step.argmin(axis=0))
            total = step.min(axis=0) + emit
        st_prev = st
    path = [int((total + _edge(len(total))).argmin())]
    for b in back[:0:-1]:
        path.append(int(b[path[-1]]))
    path.reverse()
    return np.array([cands[j][0][s - 1] if s else np.nan for j, s in enumerate(path)])


def _edge(n):
    """Cost of being in each state ([unvoiced] + candidates) at a span edge."""
    return np.concatenate([[0.0], np.full(n - 1, P["switch"])])


def _drop_short_runs(voiced, n):
    """Voicing mask without the voiced runs shorter than n frames."""
    out = voiced.copy()
    i = 0
    while i < len(out):
        if out[i]:
            j = i
            while j < len(out) and out[j]:
                j += 1
            if j - i < n:
                out[i:j] = False
            i = j
        else:
            i += 1
    return out


def _raw_track(y, sr, syllables=1):
    """Viterbi pitch per frame before clean-up: (f0 Hz or nan, level in dB re the loudest frame, hop)."""
    import librosa
    frame = 2 * int(round(P["frame_s"] * sr / 2))
    hop = int(frame * P["hop"])
    lag_min, lag_max = int(sr // P["fmax"]), min(int(np.ceil(sr / P["fmin"])), frame - 1)
    low = _lowpass(y, sr)
    cm = _cmndf(low, frame, hop, lag_min, lag_max)
    rms, low_rms = (librosa.feature.rms(y=x, frame_length=frame, hop_length=hop)[0][:cm.shape[1]] for x in (y, low))
    # a quiet second syllable is measured against its own loudest frame, not against the first syllable
    half = int(P["word_ref_s"] * sr / hop) if syllables > 1 else len(low_rms)
    ref = np.lib.stride_tricks.sliding_window_view(np.pad(low_rms, half, mode="edge"), 2 * half + 1).max(axis=1)
    unvoiced = np.maximum(P["unvoiced"] + P["unvoiced_db"] * _db(low_rms, ref), P["unvoiced_min"])
    db = _db(rms, rms.max())
    f0 = _viterbi([_candidates(cm[:, j], lag_min, sr) for j in range(len(db))], db > P["gate_db"], unvoiced)
    return f0, db, hop


def _db(x, ref):
    return 20 * np.log10(x / (ref + 1e-12) + 1e-12)


def _lowpass(y, sr):
    """Zero-phase low-pass with the gain of a 4th-order Butterworth run forwards and backwards, done by FFT
    (zero-padded by 0.1 s so the ends do not wrap)."""
    n = len(y) + sr // 10
    f = np.fft.rfftfreq(n, 1 / sr)
    return np.fft.irfft(np.fft.rfft(y, n) / (1 + (f / P["lowpass"]) ** 8), n)[:len(y)]


def _continuity(f0, db, max_jump, word=False):
    """Octave-continuity rule. Voiced frames less than max_gap frames apart form a chain, split into pieces
    wherever the pitch jumps by more than max_jump st. The piece with the most energy is kept; walking outwards,
    a piece one octave off is folded back, a strong piece (break_share of the main piece's energy) at most
    break_st away is kept as it is (creak at a T3 turning point breaks the pitch, e.g. 只 4253, 臉 1995), and
    anything else is dropped with the rest of the chain on that side. On the MOE clips those other jumps are
    creak or an F1 harmonic in a quiet tail (checked against the harmonic spacing in the spectrum), so folding
    them would invent pitch.
    In a word (word=True) a piece that starts after an unvoiced gap of at least word_gap frames and lasts at least
    word_piece frames is the next syllable after a consonant, and a big step there is real (T1 -> T3 in 中午,
    T2 -> T4 in 一共 said ㄧˊ, T4 -> T1 in 麵包): it is kept, unless it carries under word_share of the main piece's
    energy. Before this rule those three model contours lost a whole syllable (integration check, M2)."""
    out, st = f0.copy(), 12 * np.log2(f0)
    idx = np.where(~np.isnan(f0))[0]
    for chain in np.split(idx, np.where(np.diff(idx) > P["max_gap"] + 1)[0] + 1):
        pieces = np.split(chain, np.where(np.abs(np.diff(st[chain])) > max_jump)[0] + 1)
        energy = [np.sum(10 ** (db[p] / 10)) for p in pieces]
        a = int(np.argmax(energy))
        for step in (-1, 1):
            ref, k = pieces[a], a + step
            while 0 <= k < len(pieces):
                p = pieces[k]
                jump = st[p[-1]] - st[ref[0]] if step < 0 else st[p[0]] - st[ref[-1]]
                gap = ref[0] - p[-1] - 1 if step < 0 else p[0] - ref[-1] - 1  # unvoiced frames between them
                octs = round(jump / 12)
                syllable = (word and gap >= P["word_gap"] and len(p) >= P["word_piece"]
                            and energy[k] >= P["word_share"] * energy[a])
                if abs(jump) > max_jump and octs and abs(jump - 12 * octs) <= P["fold_tol"]:
                    out[p] /= 2.0 ** octs
                    st[p] -= 12 * octs
                elif abs(jump) > max_jump and not syllable and not (abs(jump) <= P["break_st"]
                                                                    and energy[k] >= P["break_share"] * energy[a]):
                    for q in (pieces[k:] if step > 0 else pieces[:k + 1]):
                        out[q] = np.nan
                    break
                ref, k = p, k + step
    return out


def _trim_creak_tail(f0, db, tone=None):
    """Cut a quiet tail that turns upward. As a T4 (and some T3s) decays into creak, the tracker can lock onto a
    harmonic of the creak and draw a rise at the very end (院 6563, 見 3292). Real rises (T2, a full T3) are
    sung at vowel level, so only frames below tail_db re the loudest frame are considered: if the pitch there
    climbs more than tail_rise st above the lowest point it reached, everything after that low point goes.
    For a single T4 syllable the whole last 40 % counts as tail, whatever its level."""
    idx = np.where(~np.isnan(f0))[0]
    if len(idx) < 6:
        return f0
    st = 12 * np.log2(f0[idx])
    k = len(idx)
    while k > 0 and db[idx[k - 1]] < P["tail_db"]:
        k -= 1
    tail = np.arange(k, len(idx))
    if tone == 4:  # a T4 is high falling (§6.4): it never ends in a rise, at any level, in its last 40 %
        tail = np.arange(min(k, int(len(idx) * 0.6)), len(idx))
    if len(tail) < 2:
        return f0
    low = tail[int(np.argmin(st[tail]))]
    if st[tail[-1]] - st[low] > P["tail_rise"]:
        f0 = f0.copy()
        f0[idx[low + 1:]] = np.nan
    return f0


def track(y, sr, syllables=1, tone=None):
    """Frame-level pitch: (f0 Hz with nan where unvoiced, hop in samples)."""
    f0, db, hop = _raw_track(y, sr, syllables)
    f0[~_drop_short_runs(~np.isnan(f0), P["min_run"])] = np.nan
    f0 = _continuity(f0, db, P["max_jump"] if syllables == 1 else P["max_jump_word"], word=syllables > 1)
    f0[~_drop_short_runs(~np.isnan(f0), P["min_run"])] = np.nan
    f0 = _trim_creak_tail(f0, db, tone if syllables == 1 else None)
    return f0, hop


def contour(path, start, end, syllables=1, tone=None):
    import librosa
    y, sr = librosa.load(str(path), sr=None, offset=max(0.0, start), duration=max(0.05, end - start))
    if len(y) < 2048:
        return None
    if start < P["click_s"]:  # a third of the MOE files open with ~1 ms of junk samples (up to 0.8), which would
        y[:int((P["click_s"] - max(0.0, start)) * sr)] = 0  # be the loudest frame that all levels are measured on
    f0, hop = track(y, sr, syllables, tone)
    voiced = ~np.isnan(f0)
    if voiced.sum() < 4:
        return None
    idx = np.where(voiced)[0]
    i0, i1 = int(idx[0]), int(idx[-1])
    seg_f0, seg_v = f0[i0:i1 + 1], voiced[i0:i1 + 1]
    xs = np.arange(len(seg_f0))
    median = float(np.median(seg_f0[seg_v]))
    st = 12 * np.log2(np.interp(xs, xs[seg_v], seg_f0[seg_v]) / median)  # gaps bridged; "v" marks them
    grid = np.linspace(0, len(st) - 1, N_POINTS)
    t0 = start + i0 * hop / sr
    t1 = min(end, start + (i1 + 1) * hop / sr)
    return {"st": [round(float(x), 2) for x in np.interp(grid, xs, st)],
            "v": [int(seg_v[int(round(g))]) for g in grid],
            "hz": round(median, 1), "t": [round(t0, 3), round(t1, 3)], "voiced": round(float(seg_v.mean()), 2)}


def check(c, e, tone=None, syllables=1):
    """Sanity flags for one contour against its span entry and, for a single syllable, its tone. Thresholds sit
    just past what verified clips reach (QA 2026-10-13: T4 falls to 20.7 st and T1 medians to 396 Hz are real)."""
    flags = []
    if syllables > 1 and (c["t"][1] - c["t"][0]) < 0.45 * (e["end"] - e["start"]):
        flags.append("short")  # a syllable missing (one syllable's coverage mostly reflects its voiceless initial)
    if not 90 <= c["hz"] <= 400:
        flags.append("median")
    if max(c["st"]) - min(c["st"]) > 21:
        flags.append("range")  # so far only creak to ~80 Hz after a T4 fall (處 4823, real f0 but extreme)
    if tone == 4 and np.mean(c["st"][:5]) - np.mean(c["st"][-5:]) < 2:
        flags.append("T4-no-fall")
    return flags


def load_cache():
    return json.load(open(CACHE_FILE, encoding="utf-8")) if CACHE_FILE.exists() else {}


def save_cache(c):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    c = {k: v for k, v in c.items() if k.endswith(":" + PARAMS_TAG)}  # entries from older parameters go
    json.dump(c, open(CACHE_FILE, "w", encoding="utf-8"), separators=(",", ":"), sort_keys=True)


def compute_all(audio_index, ids, log=print):
    """ids: MOE audio ids that need a model contour. Returns {id: contour}.

    Cached by id + span + analysis parameters; a span with no usable pitch is cached as null and left out."""
    cache = load_cache()
    out, todo = {}, []
    for aid in ids:
        e = audio_index.get(aid)
        if not e or e.get("src") != "moe":
            continue
        key = f"{aid}:{e['start']}:{e['end']}:{PARAMS_TAG}"
        if key in cache:
            if cache[key]:
                out[aid] = cache[key]
        else:
            todo.append((aid, key, e))
    log(f"  contours: {len(out)} cached, {len(todo)} to compute")
    rd = readings_by_id()
    for i, (aid, key, e) in enumerate(todo, 1):
        word = rd.get(aid, ("?", ""))[0]
        z = rd.get(aid, ("?", ""))[1]
        c = contour(moe.CACHE / "moe-audio" / f"{aid}.ogg", e["start"], e["end"], len(word),
                    moe.tone(z) if len(word) == 1 and z else None)
        cache[key] = c
        if c:
            out[aid] = c
        if i % 100 == 0:
            save_cache(cache)
            log(f"    {i}/{len(todo)}")
    save_cache(cache)
    failed = [a for a in ids if a not in out and (audio_index.get(a) or {}).get("src") == "moe"]
    if failed:
        log(f"  contours: no usable pitch for {len(failed)}: {' '.join(failed[:10])}")
    flagged = {}
    for a, c in out.items():
        word, z = rd.get(a, ("", ""))
        for f in check(c, audio_index[a], moe.tone(z) if len(word) == 1 and z else None, len(word)):
            flagged.setdefault(f, []).append(a)
    for f, ids_f in sorted(flagged.items()):
        log(f"  contours flagged {f}: {len(ids_f)} (e.g. {' '.join(ids_f[:8])})")
    return out


def readings_by_id():
    """{MOE audio id: (word, squashed zhuyin)}; the word length is the syllable count."""
    return {aid: (word, z) for word, zs in moe.audio_map().items() for z, aid in zs.items()}
