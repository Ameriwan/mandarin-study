"""Model pitch contours (MASTER_PROMPT §7.4), precomputed from the MOE headword spans.

Output per clip, time-normalized to N_POINTS (40; longer spans such as the M3 reading segments take more, see
points_for, and the page normalizes the learner's take to the same count) over the voiced window [t0, t1]:
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
# Connected-speech spans (M3: the segments of a whole-entry reading after the headword, compute_spans with
# span=True). The word rules of _continuity judge an octave by the step between two neighbouring pieces, which in a
# sentence is often a real one (a T4 that ends in creak at 110 Hz, then the next syllable at 230 Hz): there they
# folded real pitch an octave up or down, and a raw-track harmonic in a separate chain was never compared at all
# (QA M3: 拍照 031900008 seg 2, 公車 247200080 seg 2, 爺爺 597200001 seg 3, 爬山 029900005 seg 4 one octave too
# high against an independent pyin track, 錢包 367400001 seg 2 one too low; 孩子 270700003 seg 1, see _fold_chains).
# In a span, a fold must bring the piece closer to the span's own median level, and chains are compared too. Only
# span=True runs these rules; headword contours (compute_all) and segment 0 (the headword, word rules) are computed
# exactly as before. The values go into the span cache key (span_key), not into PARAMS_TAG. Checked on all 426
# segment contours of the first M3 build against pyin: voiced points within 1.5 st of it 13715 -> 13748 (of about
# 14030), points an octave above it 32 -> 3 (the 3 left: pyin halving creak), 13 contours changed, no headword one.
SPAN_PARAMS = {
    "rule": "span-octave-1",
    "fold_up": False,  # _continuity / _fold_chains: a piece is folded only when that brings its median closer to the
                       # span's median level, and never up: a piece an octave under its neighbour is creak or a low
                       # T3 that the tracker got right (爬山 seg 4 ends at 125 Hz, 錢包 367400001 seg 2 at 74-128 Hz,
                       # both confirmed by pyin; the word rules had folded them up)
    "chains": True,    # _fold_chains: the octave rule also between chains (pieces more than max_gap frames apart)
}
SPAN_TAG = hashlib.sha1(json.dumps(SPAN_PARAMS, sort_keys=True).encode()).hexdigest()[:6]
SP = SPAN_PARAMS


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


def _continuity(f0, db, max_jump, word=False, level=None):
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
    energy. Before this rule those three model contours lost a whole syllable (integration check, M2).
    level: the span's median level in st (span=True only, see SPAN_PARAMS): a piece is folded only under _closer
    (its median comes closer to the level, and without fold_up only down); else the step is judged as any other."""
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
                fold = abs(jump) > max_jump and octs and abs(jump - 12 * octs) <= P["fold_tol"]
                if fold and level is not None:
                    fold = _closer(float(np.median(st[p])), octs, level)
                if fold:
                    out[p] /= 2.0 ** octs
                    st[p] -= 12 * octs
                elif abs(jump) > max_jump and not syllable and not (abs(jump) <= P["break_st"]
                                                                    and energy[k] >= P["break_share"] * energy[a]):
                    for q in (pieces[k:] if step > 0 else pieces[:k + 1]):
                        out[q] = np.nan
                    break
                ref, k = p, k + step
    return out


def _level(f0):
    """A span's median level in st (over its voiced frames), or None when nothing is voiced."""
    v = ~np.isnan(f0)
    return float(np.median(12 * np.log2(f0[v]))) if v.any() else None


def _closer(median, octs, level):
    """span=True: may a piece with this median (st) be folded by octs octaves? Only when that brings it closer to
    the span's level, and only down unless SPAN_PARAMS fold_up."""
    return abs(median - 12 * octs - level) < abs(median - level) and (octs > 0 or SP["fold_up"])


def _fold_chains(f0, db, level):
    """span=True: the octave rule between chains (_continuity splits the voiced frames into chains wherever more
    than max_gap unvoiced frames pass, and compares pieces only inside a chain). A chain whose median sits an
    octave (within fold_tol) from the median of a neighbouring chain with more energy is folded, under _closer.
    After a consonant the tracker can lock onto the 2nd harmonic of a whole syllable: 孩子 270700003 seg 1 reads
    203 Hz, a gap, then 431 Hz, the same spectrum (a weak f0 under a strong 2nd harmonic) as the 子 of its
    headword, which the validated word contour has at 215 Hz."""
    out = f0.copy()
    idx = np.where(~np.isnan(f0))[0]
    if level is None or not len(idx):
        return out
    st = 12 * np.log2(f0)
    chains = np.split(idx, np.where(np.diff(idx) > P["max_gap"] + 1)[0] + 1)
    med = [float(np.median(st[c])) for c in chains]
    energy = [float(np.sum(10 ** (db[c] / 10))) for c in chains]
    for i, c in enumerate(chains):
        for j in (i - 1, i + 1):
            if 0 <= j < len(chains) and energy[j] > energy[i]:
                jump = med[i] - med[j]
                octs = round(jump / 12)
                if octs and abs(jump - 12 * octs) <= P["fold_tol"] and _closer(med[i], octs, level):
                    out[c] /= 2.0 ** octs
                    break
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


def track(y, sr, syllables=1, tone=None, span=False):
    """Frame-level pitch: (f0 Hz with nan where unvoiced, hop in samples). span=True: a stretch of connected speech
    (SPAN_PARAMS: octave folds judged against the span's median level, also between chains: _fold_chains)."""
    f0, db, hop = _raw_track(y, sr, syllables)
    f0[~_drop_short_runs(~np.isnan(f0), P["min_run"])] = np.nan
    level = _level(f0) if span else None
    f0 = _continuity(f0, db, P["max_jump"] if syllables == 1 else P["max_jump_word"], word=syllables > 1, level=level)
    if span and SP["chains"]:
        f0 = _fold_chains(f0, db, level)
    f0[~_drop_short_runs(~np.isnan(f0), P["min_run"])] = np.nan
    f0 = _trim_creak_tail(f0, db, tone if syllables == 1 else None)
    return f0, hop


def points_for(start, end, per_s=25, floor=N_POINTS):
    """Point count for a longer span (a segment of a whole-entry reading): about per_s per second, at least floor."""
    return max(floor, int(round(per_s * (end - start))))


def contour(path, start, end, syllables=1, tone=None, n_points=N_POINTS, span=False):
    """Model contour of [start, end) of the file, time-normalized to n_points (default N_POINTS: the headword
    spans of M1/M2). Any syllables > 1 runs the word rules (per-syllable level reference, larger allowed jumps);
    span=True adds the connected-speech rules (SPAN_PARAMS) for a stretch of sentence."""
    import librosa
    y, sr = librosa.load(str(path), sr=None, offset=max(0.0, start), duration=max(0.05, end - start))
    if len(y) < 2048:
        return None
    if start < P["click_s"]:  # a third of the MOE files open with ~1 ms of junk samples (up to 0.8), which would
        y[:int((P["click_s"] - max(0.0, start)) * sr)] = 0  # be the loudest frame that all levels are measured on
    f0, hop = track(y, sr, syllables, tone, span)
    voiced = ~np.isnan(f0)
    if voiced.sum() < 4:
        return None
    idx = np.where(voiced)[0]
    i0, i1 = int(idx[0]), int(idx[-1])
    seg_f0, seg_v = f0[i0:i1 + 1], voiced[i0:i1 + 1]
    xs = np.arange(len(seg_f0))
    median = float(np.median(seg_f0[seg_v]))
    st = 12 * np.log2(np.interp(xs, xs[seg_v], seg_f0[seg_v]) / median)  # gaps bridged; "v" marks them
    grid = np.linspace(0, len(st) - 1, n_points)
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


def cache_key(aid, start, end, n_points=N_POINTS, syllables=None, rule=None):
    """Contour cache key. A clip's headword span at N_POINTS keeps the key it always had (PARAMS_TAG already
    holds n_points 40; build.reuse_contours rebuilds that key); another point count, a syllable count given
    by the caller (a segment of a whole-entry reading) and a rule tag (span_key) go before the tag, so save_cache
    keeps them too."""
    extra = (("" if n_points == N_POINTS else f"n{n_points}:") + ("" if syllables is None else f"s{syllables}:")
             + ("" if rule is None else f"{rule}:"))
    return f"{aid}:{start}:{end}:{extra}{PARAMS_TAG}"


def span_key(aid, start, end, n_points, syllables, span=True):
    """Cache key of a compute_spans contour (build.reuse_span_contours rebuilds it): span=True adds the SPAN_TAG of
    the connected-speech rules; span=False (a headword segment, word rules) keeps the key it had before them."""
    return cache_key(aid, start, end, n_points, syllables, f"x{SPAN_TAG}" if span else None)


def _run(jobs, cache, log, what="contours"):
    """jobs: [(out key, cache key, aid, start, end, syllables, tone, n_points, span)] not in the cache -> computed,
    stored in `cache` (null when the span has no usable pitch). Returns {out key: contour} of the usable ones."""
    out = {}
    for i, (okey, ckey, aid, start, end, syl, tone, n, span) in enumerate(jobs, 1):
        c = contour(moe.CACHE / "moe-audio" / f"{aid}.ogg", start, end, syl, tone, n, span)
        cache[ckey] = c
        if c:
            out[okey] = c
        if i % 100 == 0:
            save_cache(cache)
            log(f"    {what} {i}/{len(jobs)}")
    save_cache(cache)
    return out


def compute_all(audio_index, ids, log=print, n_points=N_POINTS):
    """ids: MOE audio ids that need a model contour of their headword span. Returns {id: contour}.

    n_points: the point count, or a function (start, end) -> count (e.g. points_for). Cached by id + span +
    point count + analysis parameters; a span with no usable pitch is cached as null and left out."""
    cache = load_cache()
    out, todo = {}, []
    rd = readings_by_id()
    for aid in ids:
        e = audio_index.get(aid)
        if not e or e.get("src") != "moe":
            continue
        n = n_points(e["start"], e["end"]) if callable(n_points) else n_points
        key = cache_key(aid, e["start"], e["end"], n)
        if key in cache:
            if cache[key]:
                out[aid] = cache[key]
        else:
            word, z = rd.get(aid, ("?", ""))
            todo.append((aid, key, aid, e["start"], e["end"], len(word), moe.tone(z) if len(word) == 1 and z else None, n,
                         False))
    log(f"  contours: {len(out)} cached, {len(todo)} to compute")
    out.update(_run(todo, cache, log))
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


def compute_spans(spans, log=print, n_points=points_for):
    """Model contours of other spans of the MOE files than the headword (M3: the segments of a whole-entry
    reading). spans: {out key: (aid, start, end, syllables[, span])}: span (default True) runs the connected-speech
    rules (SPAN_PARAMS); False keeps the plain word rules (a headword segment, which then comes out the same as the
    headword span of contours.json). n_points: a count, or a function (start, end) -> count (default points_for:
    ~25 per second, at least N_POINTS). Returns {out key: contour}; a span with no usable pitch is cached as null
    and left out, and so is a contour that span_flags flags (logged; the page then skips that line). The syllable
    count and the rules are in the cache key (span_key), so the same span asked otherwise is computed again."""
    cache = load_cache()
    out, todo = {}, []
    for okey, (aid, start, end, syl, *rest) in spans.items():
        span = rest[0] if rest else True
        n = n_points(start, end) if callable(n_points) else n_points
        key = span_key(aid, start, end, n, syl, span)
        if key in cache:
            if cache[key]:
                out[okey] = cache[key]
        else:
            todo.append((okey, key, aid, start, end, syl, None, n, span))
    log(f"  span contours: {len(out)} cached, {len(todo)} to compute")
    out.update(_run(todo, cache, log, "span contours"))
    missing = [k for k in spans if k not in out]
    if missing:
        log(f"  span contours: no usable pitch for {len(missing)} spans")
    flagged = {}
    for k in list(out):
        for f in span_flags(out[k], spans[k][1], spans[k][2]):
            flagged.setdefault(f, []).append(k)
            out.pop(k, None)
    for f, ks in sorted(flagged.items()):
        log(f"  span contours flagged {f}, left out: {len(ks)} ({' '.join(map(str, ks[:8]))})")
    return {k: out[k] for k in spans if k in out}


def span_flags(c, start, end):
    """Why a compute_spans contour must not be published ([] = fine). Works on the contour alone, so
    build.reuse_span_contours applies it to contours computed before too.
      "median": check()'s flag, the span's median outside 90-400 Hz (a whole span off by an octave).
      "octave": a voiced point above fmax. The tracker never reports more than fmax, so only a piece folded up an
        octave gets there, which the span rules never do: it marks a contour of the word rules (拍照 031900008
        seg 2 at 734 Hz, 公車 247200080 seg 2 at 564 Hz, 工作 246600031 seg 4 at 506 Hz in the first M3 build).
    check()'s "range" flag is not a reason here (a headword segment keeps its word contour); for the
    connected-speech segments the build applies span_gate on top of this."""
    flags = [f for f in check(c, {"start": start, "end": end}) if f == "median"]
    if any(v and c["hz"] * 2 ** (s / 12) > 1.01 * P["fmax"] for s, v in zip(c["st"], c["v"])):
        flags.append("octave")
    return flags


# Publication gate for the connected-speech segment contours (span=True: the segments of a whole-entry reading after
# the headword). Two QA rounds of tracker rules still left wrong tails (拍照 031900008 seg 2 ends on 412 Hz where the
# voice is at ~210 Hz; 工作 246600031 seg 4 draws a T4 rising to 442 Hz behind an ~11 st dashed bridge), so a contour
# is published only if the finished contour looks sane; one that does not gets no overlay (the Shadowing page plays
# that line without one). Deliberately conservative: on the M3 data it holds back about 1 in 6 of these contours,
# most of them real creak dives after a fall or a jump out of creak, which a learner does not need drawn either.
SPAN_GATE = {
    "jump": 12.0,    # st between consecutive voiced points (an unvoiced bridge between them skipped): an octave
    "range": 21.0,   # st from the lowest to the highest voiced point (18 dropped real creaky T4 dips; 21 still drops 拍照:2)
    "voiced": 0.5,   # share of the contour's frames that are voiced
}


def span_gate(c):
    """Why a connected-speech segment contour fails the publication sanity check (SPAN_GATE), [] = publish.
    Works on the finished contour alone (no audio), so it applies to computed, cached and reused contours alike.
    Not for headword segments, headword or single-syllable contours (word rules, validated by the M2 sweep)."""
    st = [s for s, v in zip(c["st"], c["v"]) if v]
    if len(st) < 2:
        return ["voiced"]
    flags = []
    if any(abs(b - a) >= SPAN_GATE["jump"] for a, b in zip(st, st[1:])):
        flags.append("jump")
    if max(st) - min(st) > SPAN_GATE["range"]:
        flags.append("range")
    if c.get("voiced", 0) < SPAN_GATE["voiced"]:
        flags.append("voiced")
    return flags


def readings_by_id():
    """{MOE audio id: (word, squashed zhuyin)}; the word length is the syllable count."""
    return {aid: (word, z) for word, zs in moe.audio_map().items() for z, aid in zs.items()}
