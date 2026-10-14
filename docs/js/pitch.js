// Pitch for the pitch mirror (MASTER_PROMPT §5.3 item 4, §7.4): the learner's F0 live with pitchy 4.1.0, the same
// detector over MOE clips, normalization that mirrors tools/contours.py (semitones re the speaker's own median,
// time-normalized over the voiced part, voicing mask), a score, and the SVG overlay of model and learner.
// Nothing here records or plays audio: app.js Recorder feeds LivePitch.push through Recorder.start({ onFrame }).
import { moeUrl, audioContext, loadJSON, toneOf } from "./app.js";

export const PITCHY_URL = "https://cdn.jsdelivr.net/npm/pitchy@4.1.0/+esm"; // pinned (MIT); sw.js keeps it for offline use
// Samples per analysis window: 2048 up to 48 kHz (42.7 ms there, 46.4 ms at 44.1 kHz; contours.py: 46.5 ms), doubled
// for each octave of sample rate above that (4096 at 88.2/96 kHz, 8192 at 176.4/192 kHz), so the window always holds
// two periods of a 70 Hz voice. The AudioContext runs at the output device's rate, which can be 192 kHz on Windows.
// app.js Recorder's AnalyserNode must use the same size (fftSize = frameSize(context.sampleRate); at most 32768) so
// live windows overlap at 60 Hz: with 2048 at 192 kHz every read loses samples, no live frame is voiced, the curve is
// not drawn while recording and the take never stops by itself (the score, from the decoded take, is unaffected).
export function frameSize(sampleRate) {
  const r = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate / 48000 : 1;
  return Math.min(32768, 2048 * 2 ** Math.max(0, Math.round(Math.log2(r))));
}
// minClarity/fmin/fmax: §7.4. minDb: level floor in true dBFS: a window whose RMS (before the low-pass) is below it is
// unvoiced and pitchy is not run. §7.4's "minVolumeDecibels = -40" did not do this: pitchy 4.1.0's setter takes
// 10^(dB/10) of the amplitude, so -40 there gated at -80 dBFS, and a faint mains or fan hum (-60..-75 dBFS) was
// tracked as a voice, scored ~97 against T1 models with nobody speaking, and kept the take from stopping. pitchy's own
// check stays off. -50 dBFS lies over such hums and well under speech: the 1,417 MOE clips' loudest frames are at
// -39..-11 dBFS (median -24), and the floor removes 0.2 % of their voiced frames that normalize()'s -30 dB gate keeps.
// relaxDb/relaxSpan/relaxS (analyzeSamples only, i.e. the scored take): a soft speaker's quieter frames (onsets, a
// creaky T3, a weaker syllable) fall under -50 dBFS while the loudest ones pass, and too few were left to score (the
// MOE clips played at a -45 dBFS peak: 17.5 % no score). Within relaxS of a window at or over minDb, the floor drops
// to the higher of minDb - relaxDb and the take's loudest window - relaxSpan (at a -30 dBFS peak or louder it stays
// -50), and a window under minDb keeps its pitch only when it continues a voice heard at minDb or over, its pitch
// moving at most relaxStep st per 10 ms. Nothing is relaxed when a window between the floors away from the voice is
// periodic (a hum), and a take with no window at -50 dBFS or over (a hum alone) stays unvoiced.
// lowpass: each window is low-passed at 600 Hz before pitchy, as contours.py does for the model (energy at 1-3 kHz
// formants makes the raw NSDF pick formant or tail-lag peaks). retry: when the full window gives nothing usable
// (creak, a pitch change inside the window, a sub-harmonic below fmin), pitchy runs again on its middle half. All
// 1,272 MOE clips with a model contour, scored against contours.json: 98 % >= 70 (median 97) with both; a sample of
// 121 without them: 55 %.
const DEFAULTS = { minClarity: 0.85, minDb: -50, relaxDb: 10, relaxSpan: 20, relaxS: 0.3, relaxStep: 1.5, fmin: 60, fmax: 500, lowpass: 600, retry: true };
// Clean-up, after tools/contours.py PARAMS: min_run 3 frames (of its 11.6 ms hop), max_jump_word 7 st, chains broken
// by gaps longer than max_gap (5 frames of 11.6 ms there), gate_db -30 (RMS gate re the loudest frame).
const MIN_RUN = 3, MAX_JUMP = 7, FOLD_TOL = 2, MAX_GAP_S = 0.07, REF_N = 3, GATE_DB = -30;
const MODEL_HOP = 256 / 22050; // contours.py hop in seconds (1026-sample frame × 0.25 at 22.05 kHz)
const RANGE = 12;             // overlay y scale: -12..+12 st around the speaker's median

// What the app teaches (§6.4): Taiwan targets, T3 as low 21.
export const CHAO = { 1: "44", 2: "35", 3: "21", 4: "51", 5: "˙" };
const SHAPE = { 1: "high level", 2: "rising", 3: "low", 4: "high falling", 5: "light" };

// ---------- pitchy (dynamic import, cached; a failed load is retried on the next call)
let pitchy = null, loading = null;
export async function loadPitchy() {
  loadSylIndex(); // for compare() without syllables (below); never fails
  if (pitchy) return pitchy;
  loading ||= import(PITCHY_URL).then(m => (pitchy = m), err => {
    loading = null;
    throw new Error("無法載入音高分析 Pitch tracker could not load: pitchy 4.1.0 needs the internet once (connect, then reload the page); after that it works offline. ("
      + (err && err.message || err) + ")", { cause: err });
  });
  return loading;
}

const detectors = new Map(); // window length -> PitchDetector (findPitch needs exactly that length)
function detector(len) {
  let d = detectors.get(len);
  if (!d) {
    d = pitchy.PitchDetector.forFloat32Array(len); // its volume check stays off (minVolumeAbsolute 0): see DEFAULTS
    detectors.set(len, d);
  }
  return d;
}
// One window -> {hz|null, clarity, db}. hz is null below the level floor (minDb unless given), below minClarity or
// outside fmin..fmax (§7.4).
const level = (x, n = x.length) => { let sum = 0; for (let i = 0; i < x.length; i++) sum += x[i] * x[i]; return Math.round(10 * Math.log10(sum / n + 1e-12) * 10) / 10; }; // RMS, dBFS
function measure(buf, sampleRate, o, floor = o.minDb) {
  const db = level(buf);
  if (db < floor) return { hz: null, clarity: 0, db };
  const x = o.lowpass ? lowpass(buf, sampleRate, o.lowpass) : buf;
  let [hz, clarity] = detector(x.length).findPitch(x, sampleRate);
  let ok = clarity >= o.minClarity && hz >= o.fmin && hz <= o.fmax;
  if (!ok && o.retry && x.length >= 1024) {
    const q = x.length >> 2, half = x.subarray(q, x.length - q);
    const [hz2, clarity2] = detector(half.length).findPitch(half, sampleRate);
    if (clarity2 >= o.minClarity && hz2 >= o.fmin && hz2 <= o.fmax) { hz = hz2; clarity = clarity2; ok = true; }
  }
  return { hz: ok ? hz : null, clarity, db };
}

// Zero-phase low-pass of one window: a 4th-order Butterworth (two biquads) run forwards and backwards, so the gain
// is 1/(1+(f/fc)^8) as in contours.py _lowpass. Each pass starts settled on its first sample (no DC step).
const scratch = new Map();
function lowpass(x, sr, fc) {
  let y = scratch.get(x.length);
  if (!y) { y = new Float32Array(x.length); scratch.set(x.length, y); }
  y.set(x);
  const w = 2 * Math.PI * Math.min(fc, sr * 0.45) / sr, cos = Math.cos(w), sin = Math.sin(w);
  for (const q of [0.5411961, 1.3065630]) {
    const alpha = sin / (2 * q), a0 = 1 + alpha;
    const b0 = (1 - cos) / 2 / a0, b1 = (1 - cos) / a0, a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
    for (const dir of [1, -1]) {
      const n = y.length;
      let i = dir > 0 ? 0 : n - 1;
      let x1 = y[i], x2 = y[i], y1 = y[i], y2 = y[i];
      for (let k = 0; k < n; k++, i += dir) {
        const xi = y[i], yi = b0 * xi + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = xi; y2 = y1; y1 = yi;
        y[i] = yi;
      }
    }
  }
  return y;
}

// ---------- live pitch
// Fed by Recorder.start({ onFrame: (buf, sr, t) => live.push(buf, sr, t) }): each call brings the analyser's latest
// window (fftSize samples), at the display rate (60 Hz, 120 Hz on some phones, less when the page is busy). Consecutive
// windows overlap, so push() finds the exact overlap and rebuilds the continuous signal, then measures it exactly as
// analyzeSamples does (frameSize(sr)-sample windows every hop s, whatever the analyser's window length). The cadence
// therefore does not change the contour: at 60 Hz with one window per call, creaky low T3s came out as isolated
// frames and were lost. When a call comes too late for
// its window to overlap the previous one, the samples in between were never seen: they count as silence at their
// place, and a window more than a quarter lost is unvoiced (after 1 s a new stretch starts). A call with no new
// samples adds nothing. An analyser window shorter than the time between calls (2048 samples at 192 kHz and 60 Hz)
// loses samples on every call, so no window is measured and normalize() gives null: drills.js then analyses the
// recorded take with analyzeSamples instead.
// Frames wait until pitchy has loaded (await loadPitchy() or live.ready before recording) and are measured then.
export class LivePitch {
  constructor({ minClarity = DEFAULTS.minClarity, minDb = DEFAULTS.minDb, fmin = DEFAULTS.fmin, fmax = DEFAULTS.fmax, hop = 0.01, ...more } = {}) {
    this.opts = { ...DEFAULTS, ...more, minClarity, minDb, fmin, fmax };
    this.hop = hop;
    this.reset();
    this.ready = loadPitchy();
    this.ready.catch(() => {}); // the caller reports a failed load (await ready / loadPitchy); no unhandled rejection
  }
  // frame: the latest samples (Float32Array), captured t seconds after the recording started (t = the end of the
  // window). Read now and not kept, so the caller may reuse the buffer. Appends {t: window centre, hz|null, clarity,
  // db} for every analysis window that is complete; returns the last one appended, or null.
  push(frame, sampleRate, t) {
    const n = frame.length;
    let add = n;
    if (this._prev && this._prev.length === n && this._sr === sampleRate) {
      const expected = Math.round((t - this._tPrev) * sampleRate);
      let d = overlapShift(this._prev, frame, expected);
      if (d === 0) return null; // the analyser has not moved on since the last call
      if (d < 0) {
        if (expected < n) d = Math.max(1, expected); // no exact overlap (a torn read?): trust the clock
        else if (expected - n <= sampleRate) { this._gap(expected - n); d = n; } // a stall: those samples are lost
        else { this._stretch(t, sampleRate, n); d = n; } // a long stall (page in the background): start again
      }
      add = d;
    } else this._stretch(t, sampleRate, n);
    if (!this._prev || this._prev.length !== n) this._prev = new Float32Array(n);
    this._prev.set(frame);
    this._tPrev = t;
    this._append(frame.subarray(n - add));
    return this._measure();
  }
  get frames() { return this._frames; }
  reset() {
    this._frames = [];
    this._prev = null;
    this._sr = 0;
  }
  // a new continuous stretch: its sample 0 is the first sample of this window
  _stretch(t, sr, n) {
    this._sr = sr;
    this._t0 = t - n / sr;
    this._step = Math.max(1, Math.round(this.hop * sr));
    this._frame = frameSize(sr);
    this._buf = new Float32Array(Math.max(4 * this._frame, n * 2));
    this._base = 0;  // stretch index of _buf[0]
    this._len = 0;   // samples held in _buf
    this._next = 0;  // stretch index of the next window centre
    this._gaps = []; // [from, to) stretch indices of samples that were never seen (zeros in _buf)
  }
  _gap(k) {
    const at = this._base + this._len;
    this._gaps.push([at, at + k]);
    this._append(new Float32Array(k));
  }
  _append(x) {
    if (this._len + x.length > this._buf.length) {
      const drop = Math.min(this._len, Math.max(0, this._next - this._frame / 2 - this._base)); // no window needs these any more
      const rest = this._len - drop;
      if (rest + x.length > this._buf.length) {
        const buf = new Float32Array(2 * (rest + x.length));
        buf.set(this._buf.subarray(drop, this._len));
        this._buf = buf;
      } else this._buf.copyWithin(0, drop, this._len);
      this._base += drop;
      this._len = rest;
    }
    this._buf.set(x, this._len);
    this._len += x.length;
  }
  _measure() {
    if (!pitchy) return null; // measured on a later call, once pitchy is there
    let last = null;
    const F = this._frame, win = new Float32Array(F);
    while (this._next + F / 2 <= this._base + this._len) {
      const from = this._next - F / 2, a = Math.max(from, this._base);
      this._gaps = this._gaps.filter(g => g[1] > from);
      const t = Math.round((this._t0 + this._next / this._sr) * 10000) / 10000;
      // lost samples are zeros at their true place, so the rest of the window keeps its timing; measure unless they
      // fill more than a quarter of it
      const lost = this._gaps.reduce((s, [g0, g1]) => s + Math.max(0, Math.min(g1, from + F) - Math.max(g0, from)), 0);
      if (lost > F / 4) last = { t, hz: null, clarity: 0, db: null };
      else {
        win.fill(0);
        win.set(this._buf.subarray(a - this._base, from + F - this._base), a - from);
        last = { t, ...measure(win, this._sr, this.opts) };
      }
      this._frames.push(last);
      this._next += this._step;
    }
    return last;
  }
}
// How far `cur` has moved on from `prev` (both the analyser's latest n samples): the shift d at which cur starts with
// prev's samples from d on, exactly (the analyser copies the same floats). Tried nearest the expected shift first;
// -1 when they do not overlap.
function overlapShift(prev, cur, expected) {
  const n = prev.length, probe = Math.min(32, n >> 2);
  const same = d => { for (let j = 0; j < probe; j++) if (prev[d + j] !== cur[j]) return false; return true; };
  const e = Math.min(Math.max(0, expected), n - probe);
  for (let k = 0; k <= n - probe; k++) {
    if (e + k <= n - probe && same(e + k)) return e + k;
    if (k && e - k >= 0 && same(e - k)) return e - k;
    if (e + k > n - probe && e - k < 0) break;
  }
  return -1;
}

// The same detector over a whole buffer: windows of frameSize(sampleRate) samples centred on 0, hop, 2·hop …
// (zero-padded at the edges, like librosa's centred frames in contours.py). t = window centre in seconds from the
// buffer start. The whole take is there, so the level floor is relaxed next to its loud windows (DEFAULTS).
export async function analyzeSamples(samples, sampleRate, { hop = 0.01, ...opts } = {}) {
  await loadPitchy();
  const o = { ...DEFAULTS, ...opts };
  const x = samples instanceof Float32Array ? samples : Float32Array.from(samples);
  const step = Math.max(1, Math.round(hop * sampleRate));
  const F = frameSize(sampleRate), buf = new Float32Array(F);
  const N = Math.floor(x.length / step) + 1, span = j => [Math.max(0, j * step - F / 2), Math.min(x.length, j * step + F / 2)];
  // each window's level first; windows within relaxS of one at or over minDb may go down to the relaxed floor
  const dbs = Array.from({ length: N }, (_, j) => { const [a, b] = span(j); return level(x.subarray(a, Math.max(a, b)), F); });
  const relaxed = Math.max(o.minDb - (o.relaxDb || 0), dbs.reduce((m, d) => Math.max(m, d), -Infinity) - (o.relaxSpan ?? Infinity));
  const near = new Uint8Array(N), reach = Math.round((o.relaxS || 0) / hop);
  const win = j => { const [a, b] = span(j), from = j * step - F / 2; buf.fill(0); if (b > a) buf.set(x.subarray(a, b), a - from); return buf; };
  if (relaxed < o.minDb) {
    dbs.forEach((db, j) => { if (db >= o.minDb) near.fill(1, Math.max(0, j - reach), Math.min(N, j + reach + 1)); });
    // a periodic sound between the two floors away from the voice (over 2 x relaxS from it) is a hum (or a voice in
    // the room): then the floor is not relaxed anywhere (up to 20 such windows are tried)
    const seeds = [];
    dbs.forEach((db, j) => { if (db >= o.minDb) seeds.push(j); });
    const far = [];
    let s = 0;
    dbs.forEach((db, j) => {
      while (s + 1 < seeds.length && seeds[s + 1] <= j) s++;
      const gap = Math.min(...[seeds[s], seeds[s + 1]].filter(i => i != null).map(i => Math.abs(i - j)));
      if (gap > 2 * reach && db >= relaxed && db < o.minDb) far.push(j);
    });
    let periodic = 0;
    for (let k = 0; k < far.length; k += Math.max(1, Math.ceil(far.length / 20))) if (measure(win(far[k]), sampleRate, o, relaxed).hz != null) periodic++;
    if (periodic >= 2) near.fill(0);
  }
  const frames = [];
  for (let j = 0; j < N; j++) frames.push({ t: j * step / sampleRate, ...measure(win(j), sampleRate, o, near[j] ? relaxed : o.minDb) });
  // a window under minDb keeps its pitch only as part of a voice heard at minDb or over: reached from such a window
  // through voiced neighbours whose pitch moves at most relaxStep st a hop (a hum next to the voice is not)
  const keep = frames.map(f => f.hz != null && f.db >= o.minDb);
  for (const dir of [1, -1]) for (let j = dir > 0 ? 1 : N - 2; j >= 0 && j < N; j += dir) {
    const f = frames[j], p = frames[j - dir];
    if (!keep[j] && f.hz != null && keep[j - dir] && Math.abs(12 * Math.log2(f.hz / p.hz)) <= o.relaxStep * hop / 0.01) keep[j] = true;
  }
  frames.forEach((f, j) => { if (!keep[j]) f.hz = null; });
  return frames;
}

// Decode an MOE clip at the AudioContext's rate (the same rate the microphone is analysed at), cut its headword span
// from audio.json and analyse it. Frame times are seconds of the file, like contours.py's t.
export async function analyzeClip(id, opts = {}) {
  const [index] = await Promise.all([loadJSON("audio"), loadPitchy()]);
  const info = index && index[id];
  if (!info || info.src !== "moe") throw new Error("no MOE clip " + id);
  const res = await fetch(moeUrl(id));
  if (!res.ok) throw new Error(`${moeUrl(id)}: ${res.status}`);
  const buf = await audioContext().decodeAudioData(await res.arrayBuffer());
  const sr = buf.sampleRate;
  let data = buf.getChannelData(0);
  if (buf.numberOfChannels > 1) { // mix down (MOE clips are mono)
    data = Float32Array.from(data);
    for (let ch = 1; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < data.length; i++) data[i] += d[i]; }
    for (let i = 0; i < data.length; i++) data[i] /= buf.numberOfChannels;
  }
  const a = Math.max(0, Math.round(info.start * sr)), b = Math.min(data.length, Math.round(info.end * sr));
  const span = data.slice(a, b);
  // contours.py: a third of the MOE files open with ~1 ms of junk samples, so the first 3 ms of a file are zeroed
  if (info.start < 0.003) span.fill(0, 0, Math.min(span.length, Math.round((0.003 - info.start) * sr)));
  const frames = await analyzeSamples(span, sr, opts);
  for (const f of frames) f.t = Math.round((f.t + a / sr) * 10000) / 10000;
  return frames;
}

// ---------- normalize: frames -> contour, the same shape and conventions as tools/contours.py (docs/data/contours.json)
// {st: n semitone values re the median of the voiced frames, v: n voicing flags (1 measured, 0 bridged gap),
//  hz: that median, t: [first voiced frame, last voiced frame + one hop] in the frames' time base, voiced: share of
//  voiced frames in that window}. null if fewer than 4 voiced frames survive the clean-up.
export function normalize(frames, { n = 40, gateDb = GATE_DB } = {}) {
  if (!frames || !frames.length) return null;
  const t = frames.map(f => f.t);
  let st = frames.map(f => f.hz > 0 ? 12 * Math.log2(f.hz) : NaN);
  // RMS gate re the loudest frame (contours.py gate_db), when the frames carry a level
  const dbs = frames.map(f => f.db).filter(Number.isFinite);
  if (dbs.length) {
    const top = Math.max(...dbs);
    st = st.map((x, i) => Number.isFinite(frames[i].db) && frames[i].db < top + gateDb ? NaN : x);
  }
  // contours.py's 3 frames are 3 × 11.6 ms; live frames come at the display rate (60 Hz: 2 frames, 120 Hz: 4)
  const steps = t.slice(1).map((x, i) => x - t[i]).filter(d => d > 0);
  const hop = steps.length ? med(steps) : 0;
  const minRun = hop ? Math.max(2, Math.round(MIN_RUN * MODEL_HOP / hop)) : MIN_RUN;
  st = dropShortRuns(st, minRun);
  st = foldOctaves(st, t, frames.map(f => f.clarity > 0 ? f.clarity : 1));
  st = dropShortRuns(st, minRun);
  const idx = [];
  st.forEach((x, i) => { if (!Number.isNaN(x)) idx.push(i); });
  if (idx.length < 4) return null;
  const i0 = idx[0], i1 = idx[idx.length - 1];
  const segT = t.slice(i0, i1 + 1);
  const segV = st.slice(i0, i1 + 1).map(x => !Number.isNaN(x));
  const vt = idx.map(i => t[i]), vhz = idx.map(i => 2 ** (st[i] / 12));
  const median = med(vhz);
  // gaps bridged linearly in Hz, then semitones (contours.py); "v" marks the bridged points
  const semis = segT.map(x => 12 * Math.log2(interp(x, vt, vhz) / median));
  const T0 = segT[0], T1 = segT[segT.length - 1];
  const out = { st: [], v: [] };
  for (let j = 0; j < n; j++) {
    const g = n > 1 ? T0 + (T1 - T0) * j / (n - 1) : T0;
    out.st.push(round(interp(g, segT, semis), 2));
    out.v.push(segV[roundHalfEven(fracIndex(g, segT))] ? 1 : 0);
  }
  return { st: out.st, v: out.v, hz: round(median, 1), t: [round(T0, 3), round(T1 + hop, 3)],
    voiced: round(segV.filter(Boolean).length / segV.length, 2) };
}

// Voiced runs shorter than n frames become unvoiced (contours.py _drop_short_runs).
function dropShortRuns(st, n) {
  const out = st.slice();
  for (let i = 0; i < out.length;) {
    if (Number.isNaN(out[i])) { i++; continue; }
    let j = i;
    while (j < out.length && !Number.isNaN(out[j])) j++;
    if (j - i < n) out.fill(NaN, i, j);
    i = j;
  }
  return out;
}

// Octave errors. Voiced frames no more than MAX_GAP_S apart form a chain; a chain is split into pieces wherever the
// pitch jumps more than MAX_JUMP st between neighbouring frames. Starting from the strongest piece (most clarity),
// each piece further out is compared with a running median of the REF_N accepted frames next to it: a jump of more
// than MAX_JUMP st that lies within FOLD_TOL st of a whole number of octaves is folded back; any other jump is a real
// step (a new syllable) and stays. Chains are not compared with each other, as in contours.py _continuity.
// One exception (integration check, M2): a piece more than an octave away from the accepted frames (no real step
// inside a 70 ms gap is that big) whose next piece sits an octave from it is itself the octave error, e.g. creak
// tracked at half f0 in the middle of a T4 fall (算 5688): it is shifted by that octave when that brings it within
// MAX_JUMP of the accepted frames, so the next piece is not folded onto it. Over the 1,417 MOE clips with a model
// contour this raised 12 scores (算 33 -> 99) and lowered none.
function foldOctaves(st, t, weight) {
  const out = st.slice();
  const chains = [];
  let cur = [];
  for (let i = 0; i < st.length; i++) {
    if (Number.isNaN(st[i])) continue;
    if (cur.length && t[i] - t[cur[cur.length - 1]] > MAX_GAP_S) { chains.push(cur); cur = []; }
    cur.push(i);
  }
  if (cur.length) chains.push(cur);
  for (const chain of chains) {
    const pieces = [[chain[0]]];
    for (let k = 1; k < chain.length; k++) {
      if (Math.abs(st[chain[k]] - st[chain[k - 1]]) > MAX_JUMP) pieces.push([]);
      pieces[pieces.length - 1].push(chain[k]);
    }
    if (pieces.length < 2) continue;
    const w = pieces.map(p => p.reduce((s, i) => s + weight[i], 0));
    const main = w.indexOf(Math.max(...w));
    for (const dir of [-1, 1]) {
      let edge = dir > 0 ? pieces[main].slice(-REF_N) : pieces[main].slice(0, REF_N);
      for (let k = main + dir; k >= 0 && k < pieces.length; k += dir) {
        const p = pieces[k];
        const jump = out[dir > 0 ? p[0] : p[p.length - 1]] - med(edge.map(i => out[i]));
        const oct = Math.round(jump / 12);
        if (Math.abs(jump) > MAX_JUMP && oct && Math.abs(jump - 12 * oct) <= FOLD_TOL) for (const i of p) out[i] -= 12 * oct;
        else if (Math.abs(jump) > 12 && pieces[k + dir]) {
          const q = pieces[k + dir];
          const j2 = out[dir > 0 ? q[0] : q[q.length - 1]] - out[dir > 0 ? p[p.length - 1] : p[0]];
          const o2 = Math.round(j2 / 12);
          if (o2 && Math.abs(j2 - 12 * o2) <= FOLD_TOL && Math.abs(jump + 12 * o2) <= MAX_JUMP) for (const i of p) out[i] += 12 * o2;
        }
        edge =dir > 0 ? [...edge, ...p].slice(-REF_N) : [...p, ...edge].slice(0, REF_N);
      }
    }
  }
  return out;
}

function med(a) {
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const roundHalfEven = x => { const f = Math.floor(x), r = x - f; return r > 0.5 || (r === 0.5 && f % 2) ? f + 1 : f; }; // Python round()
// np.interp: linear, clamped to the end values; xs ascending.
function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];
  let lo = 0, hi = last;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  return xs[hi] === xs[lo] ? ys[hi] : ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo]);
}
// Fractional frame index of time x (uniform frames: exactly contours.py's linspace grid position).
function fracIndex(x, xs) {
  const idx = xs.map((_, i) => i);
  return interp(x, xs, idx);
}

// ---------- the syllables behind a model contour
// id -> [{zhuyin, tone}] as said (spoken, else zhuyin) for tones.json's words, and (grid: syllables.json) its cells.
function saidById(tones, grid) {
  const said = {}, put = (id, z) => { if (id && z) said[id] ||= z.split(/\s+/).filter(Boolean).map(s => ({ zhuyin: s, tone: toneOf(s) })); };
  if (tones) for (const x of [...(tones.pairs || []), ...((tones.sandhi && tones.sandhi.items) || []), ...(tones.readings || []), ...(tones.id_pool || [])]) if (x) put(x.id, x.spoken || x.zhuyin);
  if (grid && grid.cells) for (const byTone of Object.values(grid.cells)) for (const [t, x] of Object.entries(byTone || {})) if (x && x.id && !said[x.id] && Number(t) >= 1 && Number(t) <= 5) said[x.id] = [{ zhuyin: "", tone: Number(t) }];
  return said;
}
// compare() without syllables looks the model up here: a contours.json entry (recognised by its contour, so a copy
// works too) -> its word's syllables from tones.json. loadPitchy() and the first such compare() ask for it, so it is
// there by the time a take is scored; until then (or for a model not in tones.json) the syllables are guessed.
let sylIndex = null, sylIndexP = null;
const contourKey = c => (Array.isArray(c.st) ? `${c.hz}|${c.st.join(",")}` : "");
function loadSylIndex() {
  return (sylIndexP ||= Promise.all([loadJSON("contours"), loadJSON("tones")]).then(([models, tones]) => {
    const said = saidById(tones), map = new Map();
    for (const [id, list] of Object.entries(said)) if (models && models[id] && Array.isArray(models[id].st)) map.set(contourKey(models[id]), list);
    return (sylIndex = map);
  }, () => { sylIndexP = null; return null; })); // offline: asked again next time
}

// ---------- compare: score a learner contour against the model
// compare(model, user, { syllables, align }) -> { score 0-100 | null, meanAbsSt, coverage, offset, scale, segments,
// reason? }. syllables: the word's syllables as said, [{zhuyin, tone}] like overlay()'s (or a list of tones, or just
// a count). Pass the list with tones: the score is per syllable, a neutral tone costs less, the tone rules below
// apply, and a T3 said as the taught low 21 or a T2 as a plain 35 is only scored fairly when the tone is known
// (without tones a 21 for a citation-T3 model scores ~0). Without syllables, a model that is a contours.json entry of
// a tones.json word gets that word's syllables (loadSylIndex, ready once loadPitchy() has run: every take waits for
// it); any other model gets a count guessed from its voicing gaps and no tones.
// segments: per syllable {score, slopeModel, slopeUser (st the pitch moves over the syllable: + rises, - falls; the
// learner's unscaled), meanAbsSt, from, to (the syllable's place on the model's time axis, 0..1), lowT3 (true when
// the T3 was scored as a low 21 without the rise)}. The word's score is its worst syllable's.
//
// No score (reason "too short/quiet") when the learner voiced under half of the model's voiced points (coverage),
// when the take's voiced span is under 40 % of the model's, or when it has under 70 ms of voicing per syllable.
// normalize() stretches every take over 40 points, so the span check is what catches a 60 ms "uh" or a hum burst.
//
// Syllables are split at the longest voicing gaps (the consonant between them; a gap far from the even split counts
// less, so a creaky T3 gap is not taken for it), else evenly with the 20 % next to the guessed boundary left out;
// the learner's take is split at its own gaps when the model was split at gaps and the take's gaps split it
// sensibly, else in the model's proportions. Points that jump > 6 st off their neighbours (tracker octave slips,
// creak), and in the take a fall faster than any voice (a creaky end tracked at a sub-harmonic), are dropped first
// (despike). align (default): the learner's line is scaled by sd(model)/sd(learner), clamped to
// 1/1.5..1.5 (speakers differ in range; learners often speak flatter), and shifted by the median difference (offset:
// each contour is relative to its own median, which moves between syllables with a few frames more or less of one).
// A syllable with a contour tone (T2, T4, neutral, or tone unknown) may sit up to 2.5 st off that offset (speakers
// and the taught Chao shapes differ in how far one syllable steps from the next); a T1 or T3 is a register and may
// not. A syllable then loses (st: semitones; "change" = Theil-Sen slope over the voiced part x its span; "drop" =
// from the highest point down to the lowest point inside the middle 80 %; "rise" = change from that low point on):
//  - 10 points per st of mean |Δ| (each point capped at 6 st), and
//  - a direction term, from the model syllable's own shape:
//    rises or falls (|change| >= 2.5 st): 9 points per st the learner's change falls short of 60 % of it, so a
//    level line for a rise or a T1 for a T4 costs ~30-60; level (|change| < 2.5, range < 3.5 st inside the middle
//    80 %): 12 points per st the learner's change exceeds 1.5 st or its range 3 st (a T2 or a T4 for a T1; for a
//    known T2 only a fall counts); dips or peaks (range exceeds |change| by >= 3 st, as in a citation T3): both sides of the turn must move the
//    model's way, 2 x 9 points per st short (a T2's shallow early dip for a T3's deep fall).
//  - with tones (what the app teaches, §6.4):
//    T1 (55): 12 points per st its rise exceeds 2.5 st (a T2 or a T3 for a T1);
//    T2 (35): 12 points per st its drop exceeds the model's by > 2.5 st (a T3 for a T2), and, where the model's T2
//    rises at all (> 1 st), 24 per st its rise stays under 2 st, scaled (a level line or a fall for a T2, also where
//    the model's T2 barely rises before the next syllable, as in 學生; MOE says some T2s level, as 休息's);
//    T3 (21, or the model's 214): a learner that does not rise again (rise < 2 st) loses 12 points per st its drop
//    exceeds 6 st, or, said like the model, the model's drop + 3 st: a deep fall without the rise is a T4 (51); said
//    like a model that rises again after its low point, 18 points per st its rise falls short of 60 % of the
//    model's (unless it was not voiced there: a creaky end the tracker lost);
//    neutral: only the distance term counts, at 0.6.
// T3 and T2 readings (§6.4), each tried and the best kept: a T3 also counts as a low 21 (the model held at its low
// point; the learner falls by 60 % of the model's fall to it, at most 3 st needed, 18 points per st short, and then
// neither rises > 1.5 st nor keeps falling > 3 st, 12 per st; in the last syllable the learner's own citation rise
// is cut off too; in a one-syllable word its drop may not exceed 6 st, as above, whatever the model does), and a T2
// as a plain 35 (the model's early dip filled; the learner rises by 60 % of the model's rise after the dip, 18 points
// per st short).
// Calibrated on docs/data/contours.json (M2 fix round 2; 1,417 MOE clips; the learner side is the same clips through
// this tracker, or other words' clips; tones passed; medians, share >= 70): own clip 98 (98.5 % >= 70; round 1
// 98.7 %, before M2 97.9 %); another word with the same tones: T1 96 (97 %), T2 91 (84 %), T3 89 (78 %), T4 91
// (94 %), the two-syllable patterns 84.5 (69 %; round 1 80, 65 %). Wrong tones: T2 for a T1 model 3 (11 %; round 1
// 40), T3 for T1 0, T4 for T1 0, T1 for T2 9.5, T3 for T2 23 (28 %), T4 for T2 0, T1 for T3 33, T2 for T3 29.5
// (29 %), T4 for T3 0 (14 %; round 1 59, 41 %: the rest are against the 11 % of T3 models that MOE recorded as a
// plain 7-14 st fall, the shape of a T4, where old scoring passed a T4 too), T1/T2 for T4 0, T3 for T4 34; T1+T1 for
// T4+T1 0, T1+T3 for T1+T2 0, every one-syllable T2<->T3 / T1<->T4 swap in a pair <= 42 (median 0, 4 % >= 70), a T4
// for one T3 in a pair 23-59 (35<-45: 72); a level line for a single T2 0 (round 1 42), T2+T1 33.5 (63.5), T2+neutral
// 21.5 (69). The taught shapes: a 21 falling 3-6 st 87-93 against the T3 models (a 10 st T4 fall 37, round 1 72), a
// plain 35 rise 87 against the T2 models, the Chao targets at 3 st a step against the two-syllable models 64-94
// (median 84.5). Learner-like versions of a right take (range x0.6 or x1.5, time warp, ±0.7 st noise) keep 95-98.
const CMP = {
  pts: 24, minFrac: 0.15, gapPull: 0.2, spike: 6, spikeR: 3, scale: 1.5, errW: 10, errCap: 6,
  moving: 2.5, frac: 0.6, dirW: 9, flatRange: 3.5, flatW: 12, flatChange: 1.5, flatSpread: 3, curve: 3, curveW: 2,
  inner: 0.1, light: 0.6, trim: 0.2, minSpan: 0.4, minVoicedS: 0.07,
  cutMin: 1, lateTurn: 0.45, lowW: 18, lowNeed: 3, lowSlack: 3, lowOver: 2, dipLate: 0.6, dipOver: 2.5,
  sylShift: 2.5, t1Rise: 2.5, t1W: 12, riseMin: 2, riseW: 24, lowMax: 6, t3W: 12, t3Over: 3, t3RiseW: 18,
  dive: 300, diveMin: 3, diveDt: 0.0125,
};
export function compare(model, user, { align = true, syllables = null } = {}) {
  const none = { score: null, meanAbsSt: null, coverage: 0, offset: 0, scale: 1, segments: [], reason: "too short/quiet" };
  if (!model || !user || !model.st || !user.st || !model.st.length || !user.st.length) return none;
  if (syllables == null) { if (sylIndex) syllables = sylIndex.get(contourKey(model)) || null; else loadSylIndex(); }
  model = withMask(model); user = withMask(user);
  const list = Array.isArray(syllables) ? syllables : null;
  // no syllables given: one more than the model's interior voicing gaps, at most 3 (right for 99 % of the one-syllable
  // and 80 % of the two-syllable models; pass the syllables)
  const K = Math.max(1, Math.round(list ? list.length : syllables == null ? 1 + Math.min(2, innerGaps(model.v).length) : Number(syllables) || 1));
  const tones = list ? list.map(x => (x && typeof x === "object" ? x.tone : x)) : [];
  // coverage on the model's grid, as before
  const n = model.st.length;
  const u40 = user.st.length === n ? user : resample(user, n);
  let mvN = 0, both = 0;
  for (let i = 0; i < n; i++) if (model.v[i]) { mvN++; if (u40.v[i]) both++; }
  const coverage = mvN ? both / mvN : 0;
  const span = c => (Array.isArray(c.t) && c.t[1] > c.t[0] ? c.t[1] - c.t[0] : null);
  const ms = span(model), us = span(user);
  const short = us != null && ((ms != null && us < CMP.minSpan * ms) || us * (Number.isFinite(user.voiced) ? user.voiced : 1) < CMP.minVoicedS * K);

  // syllable segments, CMP.pts points each at the same relative places in both contours
  const mc = despike(model), uc = despike(user, true), ug = despike(user); // ug: the take's own gaps, for the split
  const mGaps = sylRanges(mc.v, K), mr = mGaps || evenRanges(n, K), nu = uc.st.length, uGaps = mGaps && sylRanges(ug.v, K);
  const ur = uGaps || mr.map(([a, b]) => [a * (nu - 1) / Math.max(1, n - 1), b * (nu - 1) / Math.max(1, n - 1)]);
  // the model voiced through a boundary (voiced onsets: 詩人, 中文), so the even split is a guess: the 20 % of each
  // syllable next to it (the glide from one tone to the next) is left out
  const trim = mGaps ? 0 : CMP.trim, inside = ([a, b], k) => [k > 0 ? a + trim * (b - a) : a, k < K - 1 ? b - trim * (b - a) : b];
  const mxs = mc.st.map((_, i) => i), uxs = uc.st.map((_, i) => i);
  const segs = mr.map((r, k) => {
    const [a, b] = inside(r, k), [c, d] = inside(ur[k], k);
    return Array.from({ length: CMP.pts }, (_, j) => {
      const f = j / (CMP.pts - 1), xm = a + f * (b - a), xu = c + f * (d - c);
      return { f, m: interp(xm, mxs, mc.st), mv: !!mc.v[Math.round(xm)], u: interp(xu, uxs, uc.st), uv: !!uc.v[Math.round(xu)] };
    });
  });
  const from = mr.map(([a, b]) => [round(a / Math.max(1, n - 1), 3), round(b / Math.max(1, n - 1), 3)]);
  // What the app teaches (§6.4) next to what the MOE speaker says: a T3 is a low 21 (the citation rise is allowed at
  // the end, never required) and a T2 a plain rise 35 (Taiwan's early dip, 323, allowed). A T3 or T2 syllable whose
  // model has that rise or dip is also scored without it (lowCut, dipFill), and the better reading counts: the word's
  // score is the best over these choices (every combination for up to 5 such syllables, else one at a time).
  const cuts = segs.map((S, k) => (tones[k] === 3 ? lowCut(S, k === segs.length - 1) : tones[k] === 2 ? dipFill(S) : null));
  const which = cuts.map((c, k) => (c ? k : -1)).filter(k => k >= 0);
  const tryMask = mask => rate(segs.map((S, k) => { const b = which.indexOf(k); return b >= 0 && (mask >> b) & 1 ? cuts[k] : S; }), tones, from, align);
  const total = r => (r.score ?? -1) * 1e4 + r.segments.reduce((s, x) => s + (x.score ?? 0), 0); // worst syllable, then the rest
  let best = tryMask(0);
  if (which.length <= 5) for (let mask = 1; mask < 2 ** which.length; mask++) { const r = tryMask(mask); if (total(r) > total(best)) best = r; }
  else for (let b = 0, mask = 0; b < which.length; b++) { const r = tryMask(mask | (1 << b)); if (total(r) > total(best)) { best = r; mask |= 1 << b; } } // a sentence: one syllable at a time
  const out = { score: null, meanAbsSt: best.meanAbsSt, coverage: round(coverage, 2), offset: best.offset, scale: best.scale, segments: best.segments };
  if (coverage < 0.5 || short || best.n < 3) return { ...out, segments: [], reason: "too short/quiet" };
  if (best.score == null) return { ...out, reason: "too short/quiet" };
  return { ...out, score: best.score };
}
// A T3 syllable read as a low 21: its points with the model held at its low point (the lowest inside the middle 80 %)
// after it, and in the word's last syllable also the learner's own rise cut the same way (the rise is allowed there,
// §6.4), when the learner's low point lies past 45 % of the syllable after a fall of >= 3 st (a T2's early, shallow
// dip is not taken for it). null when neither rises > 1 st after its low point. .turn = the model's low point (0..1).
function lowCut(S, last) {
  const lowOf = (key, vk) => {
    const inner = S.filter(p => p[vk] && p.f >= CMP.inner && p.f <= 1 - CMP.inner);
    return inner.length < 3 ? null : inner.reduce((b, p) => (p[key] < b[key] ? p : b), inner[0]);
  };
  const rises = (lo, key, vk) => S.some(p => p[vk] && p.f > lo.f && p[key] > lo[key] + CMP.cutMin);
  const ml = lowOf("m", "mv");
  if (!ml) return null;
  const mCut = rises(ml, "m", "mv");
  let ul = last ? lowOf("u", "uv") : null;
  if (ul && !(ul.f >= CMP.lateTurn && rises(ul, "u", "uv") && Math.max(...S.filter(p => p.uv && p.f <= ul.f).map(p => p.u)) - ul.u >= CMP.lowNeed)) ul = null;
  if (!mCut && !ul) return null;
  const out = S.map(p => ({ ...p, m: mCut && p.f > ml.f ? Math.min(p.m, ml.m) : p.m, u: ul && p.f > ul.f ? Math.min(p.u, ul.u) : p.u }));
  out.turn = ml.f;
  out.userRose = !!ul;
  return out;
}
// A T2 read as the taught rise (35): the model's early dip (Taiwan 323, §6.4) filled, i.e. the model held at its low
// point before it, when that point lies in the first 60 % of the syllable after a fall of > 1 st. null otherwise.
function dipFill(S) {
  const inner = S.filter(p => p.mv && p.f >= CMP.inner && p.f <= 1 - CMP.inner);
  if (inner.length < 3) return null;
  const lo = inner.reduce((b, p) => (p.m < b.m ? p : b), inner[0]);
  if (lo.f > CMP.dipLate || !S.some(p => p.mv && p.f < lo.f && p.m > lo.m + CMP.cutMin)) return null;
  const out = S.map(p => (p.f < lo.f && p.m > lo.m ? { ...p, m: lo.m } : p));
  out.rise = lo.f;
  return out;
}
// Align the learner's points to the model's (scale, offset) and score each syllable (see compare). segs: per syllable
// CMP.pts points {f, m, mv, u, uv}; a list with .turn is a T3 held low (lowCut), one with .rise a T2 without its dip
// (dipFill). tones: per syllable, or [] when unknown.
function rate(segs, tones, from, align) {
  const M = [], U = [];
  for (const S of segs) for (const p of S) if (p.mv && p.uv) { M.push(p.m); U.push(p.u); }
  let scale = 1, offset = 0;
  if (align && M.length >= 3) {
    const mm = M.reduce((s, x) => s + x, 0) / M.length, mu = U.reduce((s, x) => s + x, 0) / U.length;
    const vm = M.reduce((s, x) => s + (x - mm) ** 2, 0), vu = U.reduce((s, x) => s + (x - mu) ** 2, 0);
    scale = clamp(vu > 1e-9 ? Math.sqrt(vm / vu) : CMP.scale, 1 / CMP.scale, CMP.scale);
    offset = med(M.map((x, i) => x - scale * U[i]));
  }
  const absd = M.map((x, i) => Math.abs(x - scale * U[i] - offset));
  const out = { score: null, n: M.length, meanAbsSt: absd.length ? round(absd.reduce((s, x) => s + x, 0) / absd.length, 2) : null,
    offset: round(offset, 2), scale: round(scale, 2), segments: [] };
  for (const [k, S] of segs.entries()) {
    const mS = S.filter(p => p.mv), uS = S.filter(p => p.uv), d = S.filter(p => p.mv && p.uv);
    const seg = { score: null, slopeModel: null, slopeUser: null, meanAbsSt: null, from: from[k][0], to: from[k][1] };
    if (S.turn != null) seg.lowT3 = true;
    out.segments.push(seg);
    if (mS.length < 3) continue; // the model has (almost) no pitch here: nothing to score
    // a contour tone (T2, T4, neutral, unknown) may sit up to sylShift st off the word's offset; a T1 or T3 is its
    // register (high, low), so it may not (a T4 said for a half-third 21 starts too high)
    const own = align && d.length && !(tones[k] === 1 || tones[k] === 3) ? clamp(med(d.map(p => p.m - scale * p.u)) - offset, -CMP.sylShift, CMP.sylShift) : 0;
    const err = d.length ? d.reduce((s, p) => s + Math.min(CMP.errCap, Math.abs(p.m - scale * p.u - offset - own)), 0) / d.length : null; // st
    const sm = change(mS, "m"), su = change(uS, "u");
    let dir = 0;
    if (sm != null && su != null) {
      const inner = mS.filter(p => p.f >= CMP.inner && p.f <= 1 - CMP.inner);
      const spread = (arr, key) => (arr.length ? Math.max(...arr.map(p => p[key])) - Math.min(...arr.map(p => p[key])) : 0);
      const rm = spread(inner, "m");
      const lack = (x, y) => Math.max(0, CMP.frac * Math.abs(x) - y * Math.sign(x)); // st short of 60 % of x, x's way
      if (S.turn != null) { // a T3 held low: falls, then neither rises nor keeps falling far after the model's low point
        const x = change(mS, "m", 0, S.turn), y2 = change(uS, "u", S.turn, 2);
        if (x != null && x < 0) dir += CMP.lowW * Math.max(0, Math.min(CMP.frac * -x, CMP.lowNeed) + scale * su)
          + CMP.flatW * Math.max(0, -su + x - CMP.lowOver);
        if (y2 != null) dir += CMP.flatW * Math.max(0, y2 - CMP.flatChange, -y2 - CMP.lowSlack);
      } else if (S.rise != null) { // a T2 without its dip: the learner rises by 60 % of the model's rise after the dip
        const x = change(mS, "m", S.rise, 2);
        if (x != null && x > 0) dir += CMP.lowW * lack(x, scale * su);
      } else if (rm - Math.abs(sm) >= CMP.curve) { // dips or peaks: the parts before and after the turn
        const dip = inner.reduce((b, p) => (p.m < b.m ? p : b), inner[0]), peak = inner.reduce((b, p) => (p.m > b.m ? p : b), inner[0]);
        const ends = (mS[0].m + mS[mS.length - 1].m) / 2, turn = ends - dip.m > peak.m - ends ? dip.f : peak.f;
        for (const [lo, hi] of [[0, turn], [turn, 2]]) {
          const x = change(mS, "m", lo, hi), y = change(uS, "u", lo, hi);
          if (x != null && y != null && Math.abs(x) >= CMP.moving) dir += CMP.curveW * CMP.dirW * lack(x, scale * y);
        }
      } else if (Math.abs(sm) >= CMP.moving) dir = CMP.dirW * lack(sm, scale * su); // rises or falls
      else if (rm < CMP.flatRange) { // level: the learner's change and spread, unscaled (a T2 may rise, as taught)
        const ru = spread(uS.filter(p => p.f >= CMP.inner && p.f <= 1 - CMP.inner), "u");
        dir = tones[k] === 2 ? CMP.flatW * Math.max(0, -su - CMP.flatChange) : CMP.flatW * Math.max(0, Math.abs(su) - CMP.flatChange, ru - CMP.flatSpread);
      } else for (const [lo, hi] of [[0, 0.5], [0.5, 2]]) { // a mild bend: each half
        const x = change(mS, "m", lo, hi), y = change(uS, "u", lo, hi);
        if (x != null && y != null && Math.abs(x) >= CMP.moving) dir += CMP.curveW * CMP.dirW * lack(x, scale * y);
      }
    }
    if (tones[k] === 3) {
      const ul = innerLow(uS, "u"), ur = (ul && change(uS, "u", ul.f, 2)) ?? 0; // the learner's rise after its low point
      // a fall that does not rise again is a low 21 only while it stays small (or no deeper than the model's own fall,
      // said like it): a deep one is a T4 (51)
      // (held low inside a longer word, the syllables around it give the height, and lowOver above bounds the fall)
      const allow = S.turn == null ? Math.max(CMP.lowMax, drop(mS, "m") + CMP.t3Over) : segs.length === 1 ? CMP.lowMax : Infinity;
      if (!S.userRose && scale * ur < CMP.riseMin) dir += CMP.t3W * Math.max(0, drop(uS, "u") - allow);
      // said like the model (not held low): where the model rises again after its low point (214), so does the learner,
      // when it was heard there (a creaky end the tracker lost is not a missing rise)
      const ml = S.turn == null && innerLow(mS, "m"), mr = ml ? change(mS, "m", ml.f, 2) : null;
      if (mr != null && mr > CMP.cutMin && uS.filter(p => p.f > ml.f).length >= 3) dir += CMP.t3RiseW * Math.max(0, CMP.frac * mr - scale * ur);
    }
    if (tones[k] === 1) { // a T1 (55) does not rise again from a low point (a T2, 35 or 323)
      const ul = innerLow(uS, "u"), ur = ul ? change(uS, "u", ul.f, 2) : null;
      if (ur != null) dir += CMP.t1W * Math.max(0, scale * ur - CMP.t1Rise);
    }
    if (tones[k] === 2) { // a T2, not a T3: the learner's fall into a low point is at most 2.5 st deeper than the model's
      dir += CMP.flatW * Math.max(0, drop(uS, "u") - drop(mS, "m") - CMP.dipOver);
      // and, where the model's T2 rises at all (> 1 st after its low point), it rises (§6.4: 35) by 2 st, however
      // little the model's syllable does before the next one
      const lo = innerLow(uS, "u"), ml = innerLow(mS, "m"), mr = ml ? change(mS, "m", ml.f, 2) : null;
      if (lo && mr != null && mr > CMP.cutMin) dir += CMP.riseW * Math.max(0, CMP.riseMin - scale * (change(uS, "u", lo.f, 2) ?? 0));
    }
    // a neutral tone is short and takes its shape from the syllable before: only the distance counts, at 0.6
    const w = tones[k] === 5 ? CMP.light : 1;
    if (tones[k] === 5) dir = 0;
    seg.score = err == null ? 0 : Math.max(0, Math.round(100 - w * (CMP.errW * err + dir)));
    seg.slopeModel = sm == null ? null : round(sm, 1);
    seg.slopeUser = su == null ? null : round(su, 1);
    seg.meanAbsSt = err == null ? null : round(err, 2);
  }
  const scored = out.segments.filter(s => s.score != null);
  if (scored.length) out.score = Math.min(...scored.map(s => s.score));
  return out;
}
// The lowest of the points inside the middle 80 % of the syllable (null if < 3), and how far the pitch falls into it
// from the highest point before it (st, >= 0).
function innerLow(pts, key) {
  const inner = pts.filter(p => p.f >= CMP.inner && p.f <= 1 - CMP.inner);
  return inner.length < 3 ? null : inner.reduce((b, p) => (p[key] < b[key] ? p : b), inner[0]);
}
function drop(pts, key) {
  const lo = innerLow(pts, key);
  return lo ? Math.max(...pts.filter(p => p.f <= lo.f).map(p => p[key])) - lo[key] : 0;
}
// How far the pitch moves over the points between lo and hi (fractions of the syllable): the Theil-Sen slope (the
// median of the pairwise slopes, so a few stray points do not tip it) times the span the points cover. null if < 3.
function change(pts, key, lo = 0, hi = 2) {
  const q = pts.filter(p => p.f >= lo && p.f < hi);
  if (q.length < 3) return null;
  const sl = [];
  for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) if (q[j].f !== q[i].f) sl.push((q[j][key] - q[i][key]) / (q[j].f - q[i].f));
  return sl.length ? med(sl) * (q[q.length - 1].f - q[0].f) : null;
}
// A voiced point more than CMP.spike st from the median of the voiced points within CMP.spikeR of it (itself left
// out) is unvoiced and bridged from its neighbours. dive (the learner's take): no voice falls faster than CMP.dive
// st/s (MOE models: at most 400 over 1,417, 99 % under 260; this tracker on the same clips: 85 over 300, mostly
// 1,000+), so a fall that fast is the tracker locking onto a sub-harmonic in creak (電腦's creaky T3 end: -9 then -19
// st). The points from there on that stay more than CMP.diveMin st under the point before it are unvoiced too.
function despike(c, dive = false) {
  const n = c.st.length, v = c.v.map(x => (x ? 1 : 0)), st = c.st.slice();
  for (let i = 0; i < n; i++) {
    if (!c.v[i]) continue;
    const w = [];
    for (let j = Math.max(0, i - CMP.spikeR); j <= Math.min(n - 1, i + CMP.spikeR); j++) if (j !== i && c.v[j]) w.push(c.st[j]);
    if (w.length >= 3 && Math.abs(c.st[i] - med(w)) > CMP.spike) v[i] = 0;
  }
  const dt = Array.isArray(c.t) && c.t[1] > c.t[0] && n > 1 ? (c.t[1] - c.t[0]) / (n - 1) : CMP.diveDt;
  for (let i = 1; dive && i < n; i++) {
    if (!(c.v[i] && c.v[i - 1] && c.st[i - 1] - c.st[i] > CMP.dive * dt)) continue;
    let j = i;
    while (j < n && c.v[j] && c.st[j] < c.st[i - 1] - CMP.diveMin) j++;
    v.fill(0, i, j);
    i = j;
  }
  const idx = [];
  v.forEach((x, i) => { if (x) idx.push(i); });
  if (idx.length < 2) return { st: c.st.slice(), v: c.v.map(x => (x ? 1 : 0)) };
  const ys = idx.map(i => st[i]);
  for (let i = 0; i < n; i++) if (!v[i] && c.v[i]) st[i] = interp(i, idx, ys);
  return { st, v };
}
// unvoiced runs [from, to) that do not touch either end
function innerGaps(v) {
  const out = [];
  for (let i = 0; i < v.length;) {
    if (v[i]) { i++; continue; }
    let j = i;
    while (j < v.length && !v[j]) j++;
    if (i > 0 && j < v.length) out.push([i, j]);
    i = j;
  }
  return out;
}
const evenRanges = (n, K) => Array.from({ length: K }, (_, k) => [k * (n - 1) / K, (k + 1) * (n - 1) / K]);
// K syllables [first, last] point index, split at K-1 interior voicing gaps (the gap belongs to neither syllable):
// the longest ones, each less 0.2 per point its centre lies from the even split. null when there are too few gaps or
// a syllable would keep under 15 % of the contour.
function sylRanges(v, K) {
  const n = v.length;
  if (K < 2) return evenRanges(n, 1);
  const gaps = innerGaps(v);
  if (gaps.length < K - 1) return null;
  const even = Array.from({ length: K - 1 }, (_, k) => (k + 1) * (n - 1) / K);
  const worth = ([a, b]) => b - a - CMP.gapPull * Math.min(...even.map(e => Math.abs((a + b - 1) / 2 - e)));
  const pick = gaps.slice().sort((x, y) => worth(y) - worth(x)).slice(0, K - 1).sort((x, y) => x[0] - y[0]);
  const out = [];
  let from = 0;
  for (const [a, b] of pick) { out.push([from, a - 1]); from = b; }
  out.push([from, n - 1]);
  return out.some(([a, b]) => b - a < CMP.minFrac * (n - 1)) ? null : out;
}
const withMask = c => c.v ? c : { ...c, v: c.st.map(() => 1) }; // a contour without a mask counts as all measured
function resample(c, n) {
  const m = c.st.length, xs = c.st.map((_, i) => i);
  const g = j => n > 1 ? j * (m - 1) / (n - 1) : 0;
  return { st: Array.from({ length: n }, (_, j) => interp(g(j), xs, c.st)), v: Array.from({ length: n }, (_, j) => c.v[roundHalfEven(g(j))]) };
}

// "falls 9 st", "rises 6 st", "stays level", "dips 4 st, then rises 3 st" — for screen readers and feedback text.
export function describeContour(c) {
  const pts = c && c.st ? c.st.filter((_, i) => !c.v || c.v[i]) : [];
  if (pts.length < 2) return "no pitch measured";
  const k = Math.max(1, Math.round(pts.length / 8));
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  const start = avg(pts.slice(0, k)), end = avg(pts.slice(-k));
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const r = x => Math.round(x);
  if (hi - lo < 2) return "stays level";
  if (start - lo >= 2 && end - lo >= 2) return `dips ${r(start - lo)} st, then rises ${r(end - lo)} st`;
  if (hi - start >= 2 && hi - end >= 2) return `rises ${r(hi - start)} st, then falls ${r(hi - end)} st`;
  const d = end - start;
  if (Math.abs(d) < 2) return "stays about level";
  return d > 0 ? `rises ${r(d)} st` : `falls ${r(-d)} st`;
}

// ---------- SVG
const NS = "http://www.w3.org/2000/svg";
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(typeof kid === "object" ? kid : document.createTextNode(String(kid)));
  return el;
}
const f1 = x => Math.round(x * 10) / 10;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
let uid = 0;

// Model and learner contours on one chart. y = semitones re each speaker's own median (-12..+12, widened when needed),
// x = normalized time. The model is a teal line inside a soft target band of ±band st; the learner is an ink line
// with a halo. Points where a speaker was not voiced (v=0, only bridged) are dashed. syllables: [{zhuyin, tone?}]
// split the time axis into equal segments labelled with the Zhuyin and the Chao numbers the app teaches.
// align (default, as in compare): the learner line is scaled and shifted by compare()'s scale and offset, so the
// chart shows what is scored.
export function overlay({ model, user = null, syllables = [], width = 340, height = 180, band = 2.5, align = true, range = null } = {}) {
  const id = `pitch-${++uid}`;
  const fix = c => c && c.st && c.st.length ? withMask(c) : null;
  model = fix(model); user = fix(user);
  if (align && model && user) {
    const c = compare(model, user, { syllables: syllables && syllables.length ? syllables : null });
    const k = c.scale || 1, shift = c.offset || 0;
    if (k !== 1 || shift) user = { ...user, st: user.st.map(x => k * x + shift) };
  }
  const syl = (syllables || []).map(x => ({ zhuyin: x.zhuyin || "", tone: CHAO[x.tone] ? x.tone : x.zhuyin ? toneOf(x.zhuyin) : 1 }));
  const padL = 32, padR = 8, padT = 24, padB = syl.length ? 40 : 8;
  const x0 = padL, x1 = width - padR, y0 = padT, y1 = height - padB;
  // y: ±12 st, widened to ±18 or ±24 when a measured point lies beyond (T4 falls reach 20 st; in 身體 the T3 sits
  // 15 st under the T1), so a deep fall is drawn and not flattened against the edge; beyond ±24 it is clamped
  const peak = Math.max(0, ...[model, user].filter(Boolean).flatMap(c => c.st.filter((_, i) => c.v[i])).map(Math.abs));
  const R = range || (peak > RANGE * 1.5 + 0.5 ? RANGE * 2 : peak > RANGE + 0.5 ? RANGE * 1.5 : RANGE);
  const Y = st => y0 + (R - clamp(st, -R, R)) / (2 * R) * (y1 - y0);
  const X = (i, n) => x0 + (n > 1 ? i / (n - 1) : 0.5) * (x1 - x0);
  const desc = [model ? `Model: ${describeContour(model)}` : "No model contour", user ? `you: ${describeContour(user)}` : null,
    syl.length ? `${syl.length} syllable${syl.length > 1 ? "s" : ""}: ${syl.map(x => `tone ${x.tone === 5 ? "neutral" : x.tone} (${x.tone === 5 ? "light" : CHAO[x.tone]})`).join(", ")}` : null,
  ].filter(Boolean).join("; ") + ".";
  const svg = s("svg", { xmlns: NS, class: "pitch-overlay", viewBox: `0 0 ${width} ${height}`, width, height, role: "img",
    "aria-labelledby": `${id}-t ${id}-d`, style: `display:block;width:100%;max-width:${width}px;height:auto`, "font-size": 11 },
  s("title", { id: `${id}-t`, lang: "en" }, model && user ? "Pitch: model and you" : user ? "Pitch: you" : "Pitch: model"),
  s("desc", { id: `${id}-d`, lang: "en" }, desc));

  // plot area and guides every 6 st (12 on the widest scale); 0 is the speaker's median
  svg.append(s("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 6, style: "fill:var(--surface-2,#f6f8fa);stroke:var(--line,#d6dce3)" }));
  const step = R > RANGE * 1.5 ? 12 : 6;
  for (let st = step * Math.floor((R - 0.01) / step); st > -R; st -= step) {
    svg.append(s("line", { x1: x0, x2: x1, y1: f1(Y(st)), y2: f1(Y(st)), "stroke-dasharray": st ? "2 4" : "6 4",
      style: `stroke:var(--${st ? "line" : "muted"},#8a94a3);stroke-width:1;opacity:${st ? 1 : 0.55}` }));
    svg.append(s("text", { x: x0 - 5, y: f1(Y(st) + 3.5), "text-anchor": "end", style: "fill:var(--muted,#5b6676)", "aria-hidden": "true" },
      st > 0 ? `+${st}` : st < 0 ? `−${-st}` : "0"));
  }
  svg.append(s("text", { x: x0 - 5, y: y0 + 9, "text-anchor": "end", style: "fill:var(--muted,#5b6676)", "font-size": 9, "aria-hidden": "true" }, "st"));

  // syllable segments: hairlines between them, Zhuyin and Chao numbers below
  if (syl.length) {
    const w = (x1 - x0) / syl.length;
    syl.forEach((x, k) => {
      if (k) svg.append(s("line", { x1: f1(x0 + k * w), x2: f1(x0 + k * w), y1: y0, y2: height - 4, style: "stroke:var(--line,#d6dce3);stroke-width:1" }));
      const cx = f1(x0 + (k + 0.5) * w);
      svg.append(s("text", { x: cx, y: y1 + 17, "text-anchor": "middle", lang: "zh-Hant-TW", "font-size": 14, style: "fill:var(--ink,#18212d)" }, x.zhuyin));
      const chao = x.tone === 5 ? "light" : w >= 110 ? `${CHAO[x.tone]} ${SHAPE[x.tone]}` : CHAO[x.tone];
      svg.append(s("text", { x: cx, y: y1 + 33, "text-anchor": "middle", lang: "en", style: "fill:var(--muted,#5b6676)" }, chao));
    });
  }

  // a contour as path pieces: voiced runs solid, unvoiced (bridged) runs dashed and joined to their neighbours
  const pts = c => c.st.map((v, i) => [f1(X(i, c.st.length)), f1(Y(v))]);
  const d = list => "M" + list.map(p => p.join(" ")).join("L");
  const runs = (c, solid, dashed, dot) => {
    const p = pts(c), n = p.length, g = s("g", {});
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && !!c.v[j + 1] === !!c.v[i]) j++;
      if (c.v[i]) g.append(j > i ? s("path", { d: d(p.slice(i, j + 1)), style: solid }) : s("circle", { cx: p[i][0], cy: p[i][1], r: 2.5, style: dot }));
      else if (n > 1) g.append(s("path", { d: d(p.slice(Math.max(0, i - 1), Math.min(n, j + 2))), style: dashed, "stroke-dasharray": "4 5" }));
      i = j + 1;
    }
    return g;
  };
  const line = "fill:none;stroke-linecap:round;stroke-linejoin:round;";
  if (model) {
    const p = model.st.map((v, i) => [f1(X(i, model.st.length)), v]);
    const up = p.map(([x, v]) => `${x} ${f1(Y(v + band))}`), down = p.map(([x, v]) => `${x} ${f1(Y(v - band))}`).reverse();
    svg.append(s("path", { d: `M${up.join("L")}L${down.join("L")}Z`, style: "fill:var(--accent,#1d6b73);opacity:.16;stroke:none" }));
    svg.append(runs(model, line + "stroke:var(--accent,#1d6b73);stroke-width:3.5", line + "stroke:var(--accent,#1d6b73);stroke-width:2;opacity:.75", "fill:var(--accent,#1d6b73)"));
  }
  if (user) {
    svg.append(runs(user, line + "stroke:var(--surface,#fff);stroke-width:6.5", line + "stroke:var(--surface,#fff);stroke-width:5", "fill:var(--surface,#fff)"));
    svg.append(runs(user, line + "stroke:var(--ink,#18212d);stroke-width:2.5", line + "stroke:var(--ink,#18212d);stroke-width:1.8;opacity:.8", "fill:var(--ink,#18212d)"));
  }

  // legend
  const key = (x, swatch, zh, en) => s("g", { "aria-hidden": "true" }, swatch(x),
    s("text", { x: x + 20, y: 15, style: "fill:var(--ink,#18212d)" }, s("tspan", { lang: "zh-Hant-TW" }, zh), s("tspan", { lang: "en", style: "fill:var(--muted,#5b6676)" }, " " + en)));
  const swLine = style => x => s("line", { x1: x, x2: x + 15, y1: 11, y2: 11, style: line + style });
  if (model) svg.append(key(x0, swLine("stroke:var(--accent,#1d6b73);stroke-width:3.5"), "示範", "Model"));
  if (user) svg.append(key(model ? x0 + 88 : x0, swLine("stroke:var(--ink,#18212d);stroke-width:2.5"), "我", "You"));
  if (model) {
    svg.append(s("g", { "aria-hidden": "true" },
      s("rect", { x: x1 - 92, y: 5, width: 15, height: 12, rx: 2, style: "fill:var(--accent,#1d6b73);opacity:.16" }),
      s("text", { x: x1 - 72, y: 15, style: "fill:var(--ink,#18212d)" }, s("tspan", { lang: "zh-Hant-TW" }, "目標"), s("tspan", { lang: "en", style: "fill:var(--muted,#5b6676)" }, ` ±${band} st`))));
  }
  return svg;
}

// The taught tone shape on the Chao 1-5 scale (T1 44, T2 35, T3 low 21, T4 51, neutral a light dot), drawn in
// currentColor between faint high and low guides. Decorative: the button or label next to it names the tone.
export function contourIcon(tone, { size = 28 } = {}) {
  const y = level => 24 - (level - 1) * 5; // Chao 5 -> y 4, Chao 1 -> y 24
  const shape = { 1: [4, 4], 2: [3, 5], 3: [2, 1], 4: [5, 1] }[tone];
  const guide = "stroke:currentColor;stroke-width:1;opacity:.25";
  return s("svg", { xmlns: NS, class: "contour-icon", viewBox: "0 0 28 28", width: size, height: size, "aria-hidden": "true", focusable: "false" },
    s("line", { x1: 3, x2: 25, y1: 4, y2: 4, style: guide }), s("line", { x1: 3, x2: 25, y1: 24, y2: 24, style: guide }),
    shape ? s("line", { x1: 5, x2: 23, y1: y(shape[0]), y2: y(shape[1]), style: "stroke:currentColor;stroke-width:3;stroke-linecap:round" })
      : s("circle", { cx: 14, cy: y(2), r: 3, style: "fill:currentColor" }));
}

// Integration check: each id's MOE clip through analyzeClip + normalize, scored against its model contour from
// contours.json (computed by a different tracker at build time), per syllable as the word is said (tones.json; the
// syllables.json cells give the tone of the other single syllables).
// -> [{id, score, meanAbsSt, coverage, segments, reason?}]
export async function selfTest(ids) {
  const [models, tones, grid] = await Promise.all([loadJSON("contours"), loadJSON("tones").catch(() => null), loadJSON("syllables").catch(() => null)]);
  const said = saidById(tones, grid);
  const out = [];
  for (const id of ids) {
    const model = models[id] || null;
    try {
      const user = normalize(await analyzeClip(id));
      const r = compare(model, user, { syllables: said[id] || 1 });
      out.push({ id, ...r, ...(model ? {} : { reason: "no model contour" }), ...(user ? {} : { reason: "no pitch measured" }) });
    } catch (err) {
      out.push({ id, score: null, meanAbsSt: null, coverage: 0, reason: String(err && err.message || err) });
    }
  }
  return out;
}
