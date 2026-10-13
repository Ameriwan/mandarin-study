"""Model pitch contours (MASTER_PROMPT §7.4), precomputed from the MOE headword spans.

Output per clip: F0 in semitones relative to the speaker's own median over the voiced part, time-normalized
to N points, plus the raw median in Hz and the voiced time window inside the span. The page computes the
learner's contour live with pitchy and normalizes it the same way, so voice height does not matter.

librosa.pyin with default parameters finds no voiced frames on the quiet 22 kHz MOE clips (checked 2026-10-13),
so the voicing decision here is: pyin with a finer pitch grid + an RMS gate + a short median filter.
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moe  # noqa: E402

CACHE_FILE = moe.CACHE / "moe-audio" / "contours.json"
N_POINTS = 40
FMIN, FMAX = 60, 500
HOP = 256


def contour(path, start, end):
    import librosa
    y, sr = librosa.load(str(path), sr=None, offset=max(0.0, start), duration=max(0.05, end - start))
    if len(y) < 2048:
        return None
    f0, vflag, vprob = librosa.pyin(y, fmin=FMIN, fmax=FMAX, sr=sr, frame_length=2048, hop_length=HOP,
                                    resolution=0.05, switch_prob=0.1, fill_na=np.nan)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    n = min(len(f0), len(rms))
    f0, vflag, rms = f0[:n], vflag[:n], rms[:n]
    gate = rms > 0.12 * rms.max()
    voiced = vflag & gate & ~np.isnan(f0) & (f0 > FMIN + 2) & (f0 < FMAX - 2)
    # drop isolated frames (median filter of 3)
    v = voiced.astype(int)
    smooth = np.array([v[max(0, i - 1):i + 2].sum() >= 2 for i in range(n)])
    voiced = voiced & smooth
    if voiced.sum() < 4:
        return None
    idx = np.where(voiced)[0]
    i0, i1 = idx[0], idx[-1]
    seg_f0 = f0[i0:i1 + 1].copy()
    seg_v = voiced[i0:i1 + 1]
    # interpolate short unvoiced gaps inside the voiced window
    xs = np.arange(len(seg_f0))
    seg_f0 = np.interp(xs, xs[seg_v], seg_f0[seg_v])
    median = float(np.median(seg_f0[seg_v]))
    st = 12 * np.log2(seg_f0 / median)
    pts = np.interp(np.linspace(0, len(st) - 1, N_POINTS), xs, st)
    t0 = start + i0 * HOP / sr
    t1 = start + (i1 + 1) * HOP / sr
    return {"st": [round(float(x), 2) for x in pts], "hz": round(median, 1), "t": [round(t0, 3), round(t1, 3)],
            "voiced": round(float(seg_v.mean()), 2)}


def load_cache():
    return json.load(open(CACHE_FILE, encoding="utf-8")) if CACHE_FILE.exists() else {}


def save_cache(c):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    json.dump(c, open(CACHE_FILE, "w", encoding="utf-8"), separators=(",", ":"), sort_keys=True)


def compute_all(audio_index, ids, log=print):
    """ids: MOE audio ids that need a model contour. Returns {id: contour} (cached by id + span)."""
    cache = load_cache()
    out, todo = {}, []
    for aid in ids:
        e = audio_index.get(aid)
        if not e or e.get("src") != "moe":
            continue
        key = f"{aid}:{e['start']}:{e['end']}"
        if key in cache:
            out[aid] = cache[key]
        else:
            todo.append((aid, key, e))
    log(f"  contours: {len(out)} cached, {len(todo)} to compute")
    for i, (aid, key, e) in enumerate(todo, 1):
        c = contour(moe.CACHE / "moe-audio" / f"{aid}.ogg", e["start"], e["end"])
        if c:
            cache[key] = c
            out[aid] = c
        if i % 100 == 0:
            save_cache(cache)
            log(f"    {i}/{len(todo)}")
    save_cache(cache)
    return out
