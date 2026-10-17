// 跟讀播放器 Shadowing player (MASTER_PROMPT §5.4, M3 design §3). An <audio>-element player, not Web Audio, because
// slowed playback must keep the pitch (preservesPitch, with the webkit/moz fallbacks). It plays a range [start, end)
// of one file and stops on the range end within a few ms: requestAnimationFrame polls currentTime, a timer aims at
// the last frame, and timeupdate takes over while the tab is hidden (rAF does not run then). loop() repeats the range
// with a silent pause of 1.2 x the played length (§5.4); A–B and segment ranges are just ranges.
//
// Files: a string src is played as given, except that an .ogg URL becomes its .mp3 twin when app.js moeUrl() would
// choose mp3 (same canPlayType test); { id } plays the MOE file moeUrl(id); a Blob (a recording) plays as it is. The
// file is fetched once and played from a blob: URL, so seeking works on any server (python http.server ignores Range
// requests, and Chrome then cannot seek: currentTime snaps back to 0) and offline through the service worker. An .ogg
// that fails to load or decode falls back to its .mp3 twin once. A finished play seeks back to its start at once
// (Chrome needs ~0.3 s to seek an Ogg file), so a loop's next play starts on time; stop() keeps the position.
//
// Stopping: play() and loop() stop every other ShadowPlayer and then call app.js stopAudio() (which also ends a
// recording; keepMic: true stops other players and speech only). app.js stopAudio() cannot reach a ShadowPlayer, so
// a page calls stopPlayers() (or player.stop()) next to stopAudio() in its teardown. A player whose owner element
// (bind(el), or the control bar of playerControls) leaves the page stops by itself within 0.4 s. If app.js ever
// exports onStopAudio(fn), every player registers with it and stopAudio() stops players too.
import { h, bi, enText, stopAudio, moeUrl } from "./app.js";
import * as app from "./app.js";

export const RATES = [0.75, 0.9, 1];   // the speed control (§5.4)
export const LOOPS = [1, 3, 5];        // loop ×N
export const GAP = 1.2;                // the pause after each play of a loop, × the played length (§5.4)
export const MIN_RANGE = 0.12;         // seconds: the shortest range (A–B closer than this is refused)
const END_EARLY = 0.006;               // wall seconds: a play ends once its end is closer than this
const FINE = 0.3;                      // wall seconds: inside this a timer aims at the exact end (rAF is ~16 ms)
const WATCH_MS = 400;                  // owner / control-bar detach check

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const raf = f => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(f) : setTimeout(f, 16));
const caf = id => (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id));
const fin = x => (typeof x === "number" && Number.isFinite(x) ? x : null);
const r3 = x => Math.round(x * 1000) / 1000;

// ------------------------------------------------------------------ pure helpers (tested in Node)
// [start, end] of a requested range inside a file of `dur` seconds (null/NaN when not known yet). end null = to the
// end of the file; an end at or past the file end becomes null too (the media "ended" event closes that play).
export function normalizeRange(start, end, dur = null) {
  const d = fin(dur) != null && dur > 0 ? dur : null;
  let s = Math.max(0, fin(Number(start)) ?? 0);
  let e = end == null ? null : fin(Number(end));
  if (e != null && e < s) [s, e] = [Math.max(0, e), s];
  if (d != null) {
    s = Math.min(s, Math.max(0, d - MIN_RANGE));
    if (e != null && e >= d - 0.001) e = null;
  }
  if (e != null && e - s < MIN_RANGE) e = d != null && s + MIN_RANGE >= d ? null : s + MIN_RANGE;
  return [r3(s), e == null ? null : r3(e)];
}
// Seconds of silence after one play of `len` media seconds at `rate`: factor × the time that play took.
export function gapSeconds(len, rate = 1, factor = GAP) {
  return fin(len) != null && len > 0 && rate > 0 && factor > 0 ? factor * len / rate : 0;
}
export const clampRate = r => { const x = Number(r); return Number.isFinite(x) && x > 0 ? Math.min(2, Math.max(0.5, x)) : 1; };

const OGG = /\.ogg(?=$|[?#])/i;
const canOgg = () => OGG.test(moeUrl("0")); // app.js's own choice (canPlayType on an <audio>)
const pickUrl = url => (OGG.test(url) && !canOgg() ? url.replace(OGG, ".mp3") : url);
const mp3Twin = url => (OGG.test(url) ? url.replace(OGG, ".mp3") : null);

// Keep the pitch when slowed: the standard property, else the prefixed one this engine has.
function keepPitch(a) {
  if ("preservesPitch" in a) a.preservesPitch = true;
  else if ("webkitPreservesPitch" in a) a.webkitPreservesPitch = true;
  else if ("mozPreservesPitch" in a) a.mozPreservesPitch = true;
  else a.preservesPitch = true; // unknown engine: harmless
}
export const keepsPitch = a => !!(a && ("preservesPitch" in a ? a.preservesPitch : "webkitPreservesPitch" in a ? a.webkitPreservesPitch : a.mozPreservesPitch));

function mediaError(a, url) {
  const code = a.error && a.error.code;
  const err = new Error(`無法播放 Could not play the audio${code ? ` (media error ${code})` : ""}: ${url || ""}`);
  err.name = "MediaError";
  return err;
}
// Resolves once the element knows its duration; rejects on a load/decode error.
function waitMeta(a, url) {
  if (a.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ok = () => { off(); resolve(); };
    const bad = () => { off(); reject(mediaError(a, url)); };
    const off = () => { a.removeEventListener("loadedmetadata", ok); a.removeEventListener("error", bad); };
    a.addEventListener("loadedmetadata", ok);
    a.addEventListener("error", bad);
  });
}

// ------------------------------------------------------------------ who is playing
const live = new Set(); // players playing, loading or in a loop's pause
let silencing = 0;      // > 0 while a player silences the others (its own stopAudio() call must not stop it)
// Stops every player (except `except`). Pages call it next to app.js stopAudio() before clearing a view.
export function stopPlayers(except = null) { for (const p of [...live]) if (p !== except) p.stop(); }
if (typeof app.onStopAudio === "function") app.onStopAudio(() => { if (!silencing) stopPlayers(); });
function silenceOthers(me) {
  stopPlayers(me);
  silencing++;
  try {
    if (me.keepMic) { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }
    else stopAudio();
  } catch (err) { console.error(err); } finally { silencing--; }
}

// One interval for detach checks (owners of live players, control bars); it runs only while there is something to watch.
const bars = new Set();
let watchTimer = null;
function sweep() {
  for (const p of [...live]) {
    for (const [el, seen] of p._owners) {
      if (el.isConnected) { if (!seen) p._owners.set(el, true); }
      else if (seen) { p.stop(); break; }
    }
  }
  for (const c of [...bars]) c.sweep();
  if (!live.size && !bars.size) { clearInterval(watchTimer); watchTimer = null; }
}
function ensureWatch() { if (!watchTimer) watchTimer = setInterval(sweep, WATCH_MS); }

const finalizer = typeof FinalizationRegistry === "function" ? new FinalizationRegistry(u => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }) : null;

// ------------------------------------------------------------------ the player
// Events (player.addEventListener): "state" (player.state changed: idle | loading | playing | gap), "rate", "range"
// (also once the duration is known), "error" (player.error). play() resolves true when it reached the range end and
// false when it was stopped; it rejects when the file cannot load or the browser refused to play (err.name
// "NotAllowedError": autoplay without a tap). loop() resolves { completed, plays }.
export class ShadowPlayer extends EventTarget {
  constructor({ src = null, id = null, start = 0, end = null, rate = 1, dur = null, owner = null, keepMic = false, preload = true } = {}) {
    super();
    if (src == null && id == null) throw new TypeError("ShadowPlayer: src or id is required");
    this.keepMic = !!keepMic;
    this.error = null;
    this._blob = typeof Blob !== "undefined" && src instanceof Blob ? src : null;
    this._url = this._blob ? null : pickUrl(src != null ? String(src) : moeUrl(id));
    this._durHint = fin(Number(dur));
    this._rate = clampRate(rate);
    [this._start, this._end] = normalizeRange(start, end, this._durHint);
    this._state = "idle";
    this._owners = new Map(); // element -> seen connected
    this._run = null; this._pending = null; this._playing = false;
    this._raf = null; this._timer = null; this._gapTimer = null; this._gapWake = null;
    this._ready = false; this._loadP = null; this._objUrl = null; this._fellBack = false; this._disposed = false;
    this._t0 = 0; this._lastWall = null;
    const a = this._a = new Audio();
    a.preload = "auto";
    keepPitch(a);
    a.defaultPlaybackRate = a.playbackRate = this._rate;
    this._tick = this._tick.bind(this);
    this._check = this._check.bind(this);
    a.addEventListener("timeupdate", this._check);
    a.addEventListener("ended", () => { if (this._playing) this._finish(); });
    // A pause nobody here asked for (OS media keys, headphones unplugged, another tab) stops the run. The media end
    // (end null) fires pause before ended: that one finishes the play instead.
    a.addEventListener("pause", () => {
      if (!this._playing || !a.paused) return; // our own pause (already not playing), or a stale event after a replay
      if (a.ended) this._finish(); else this.stop();
    });
    a.addEventListener("error", () => { if (this._pending && this._ready) this._fail(mediaError(a, this._url)); });
    a.addEventListener("loadedmetadata", () => {
      const [s, e] = normalizeRange(this._start, this._end, a.duration);
      if (s !== this._start || e !== this._end) { this._start = s; this._end = e; }
      this._emit("range");
    });
    if (owner) this.bind(owner);
    if (preload) this.load().catch(() => {}); // play() reports a failure
  }

  // ---- state
  get audio() { return this._a; }            // the <audio> element (acceptance check: player.audio.preservesPitch)
  get url() { return this._url; }
  get state() { return this._state; }
  get playing() { return this._state !== "idle"; }
  get rate() { return this._rate; }
  get start() { return this._start; }
  get end() { return this._end; }            // null = to the end of the file
  get duration() { const d = this._a.duration; return Number.isFinite(d) && d > 0 ? d : this._durHint ?? NaN; }
  get position() { return this._ready ? this._a.currentTime : this._start; }
  get length() { return (this._end ?? this.duration) - this._start; } // range length in media seconds (NaN: unknown)
  get preservesPitch() { return keepsPitch(this._a); }

  // ---- loading
  load() {
    if (this._ready) return Promise.resolve();
    if (this._loadP) return this._loadP;
    const p = this._loadP = this._attachWithFallback().then(() => { this._ready = true; this._rewind(); },
      err => { if (this._loadP === p) this._loadP = null; throw err; }); // a failed load (offline, 404) is retried next play
    p.catch(() => {});
    return p;
  }
  async _attachWithFallback() {
    for (;;) {
      try { await this._attach(); return; } catch (err) {
        const twin = !this._blob && !this._fellBack && !this._disposed && mp3Twin(this._url);
        if (!twin) throw err;
        this._fellBack = true;
        this._url = twin;
      }
    }
  }
  async _attach() {
    const a = this._a, url = this._url;
    let obj = null;
    if (this._blob) obj = URL.createObjectURL(this._blob);
    else if (/^(blob|data):/i.test(url)) { a.src = url; await waitMeta(a, url); return; }
    else if (typeof fetch === "function") {
      let res;
      try { res = await fetch(url); } catch (err) { throw Object.assign(new Error(`無法載入 Could not load (offline?): ${url}`), { name: "NetworkError", cause: err }); }
      if (!res.ok) throw Object.assign(new Error(`無法載入 Could not load (${res.status}): ${url}`), { name: "NetworkError" });
      obj = URL.createObjectURL(await res.blob());
    } else { a.src = url; await waitMeta(a, url); return; }
    if (this._disposed) { URL.revokeObjectURL(obj); throw new Error("player disposed"); }
    this._setObjUrl(obj);
    a.src = obj;
    await waitMeta(a, url);
  }
  _setObjUrl(obj) {
    if (this._objUrl) { try { URL.revokeObjectURL(this._objUrl); } catch { /* ignore */ } if (finalizer) finalizer.unregister(this); }
    this._objUrl = obj;
    if (obj && finalizer) finalizer.register(this, obj, this);
  }

  // ---- playing
  // Plays [start, end) once at the current rate. Resolves true at the range end, false when stopped.
  async play() {
    const run = this._begin();
    try { return await this._once(run); } finally { this._endRun(run); }
  }
  // play, silent pause (gap × the played length), repeat. times may be Infinity. stop() (or another player) cancels.
  // onEach({ index, times, phase: "play" | "gap", seconds }) runs as each play and each pause starts.
  async loop(times = 3, { gap = GAP, onEach = null, gapAfterLast = true } = {}) {
    const n = times === Infinity ? Infinity : Math.max(1, Math.floor(Number(times) || 1));
    const run = this._begin();
    const each = info => { if (onEach) { try { onEach(info); } catch (err) { console.error(err); } } };
    let plays = 0;
    try {
      for (let i = 0; i < n && !run.cancelled; i++) {
        each({ index: i, times: n, phase: "play" });
        if (!(await this._once(run)) || run.cancelled) break;
        plays++;
        if (i + 1 >= n && !gapAfterLast) break;
        const len = fin(this.length) != null && this.length > 0 ? this.length : (this._lastWall || 0) * this._rate;
        const sec = gapSeconds(len, this._rate, gap);
        if (sec <= 0) continue;
        this._setState("gap");
        each({ index: i, times: n, phase: "gap", seconds: sec });
        if (!(await this._sleep(sec, run))) break;
      }
      return { completed: !run.cancelled && plays === n, plays };
    } finally { this._endRun(run); }
  }
  stop() {
    const run = this._run;
    if (run) run.cancelled = true;
    this._run = null;
    if (this._gapWake) this._gapWake(false);
    const pend = this._pending;
    this._pending = null;
    this._stopClock();
    this._playing = false;
    if (!this._a.paused) { try { this._a.pause(); } catch { /* ignore */ } }
    live.delete(this);
    this._setState("idle");
    if (pend) pend.resolve(false);
  }
  setRate(r) {
    const v = clampRate(r);
    if (v === this._rate) return v;
    this._rate = v;
    const a = this._a;
    keepPitch(a);
    a.defaultPlaybackRate = v; a.playbackRate = v;
    if (this._playing) this._check(); // re-aims the end timer at the new rate
    this._emit("rate");
    return v;
  }
  // A–B or a segment. During a play: a position before the new start jumps to it; one at or past the new end ends
  // that play (a loop then pauses and repeats the new range).
  setRange(start = 0, end = null) {
    [this._start, this._end] = normalizeRange(start, end, this._ready ? this._a.duration : this._durHint);
    if (this._playing && this._ready) {
      const a = this._a;
      if (!a.seeking && a.currentTime < this._start - 0.01) this._seek(this._start);
      this._check();
    } else this._rewind(); // idle: be at the new start before the next play
    this._emit("range");
  }
  // Stop when `el` (a view, a card) leaves the page: checked every 0.4 s while playing.
  bind(el) { if (el) { this._owners.set(el, !!el.isConnected); ensureWatch(); } return this; }
  unbind(el) { this._owners.delete(el); return this; }
  dispose() {
    this.stop();
    this._disposed = true;
    this._owners.clear();
    const a = this._a;
    a.removeAttribute("src");
    try { a.load(); } catch { /* ignore */ }
    this._setObjUrl(null);
    this._ready = false; this._loadP = null;
  }

  // ---- internals
  _emit(type) { this.dispatchEvent(new Event(type)); }
  _setState(s) { if (s !== this._state) { this._state = s; this._emit("state"); } }
  _begin() {
    this.stop(); // a new play or loop replaces this player's current one
    const run = { cancelled: false };
    this._run = run;
    this.error = null;
    live.add(this);
    for (const el of this._owners.keys()) if (el.isConnected) this._owners.set(el, true);
    ensureWatch();
    silenceOthers(this);
    return run;
  }
  _endRun(run) {
    if (this._run !== run) return; // stopped, or replaced by a newer run (which owns the state now)
    this._run = null;
    live.delete(this);
    this._setState("idle");
  }
  async _once(run) {
    if (!this._ready) {
      this._setState("loading");
      try { await this.load(); } catch (err) {
        if (run.cancelled) return false;
        this.error = err; this._emit("error");
        throw err;
      }
      if (run.cancelled) return false;
    }
    return new Promise((resolve, reject) => {
      if (run.cancelled) { resolve(false); return; }
      const a = this._a;
      this._pending = { resolve, reject, run };
      this._playing = true;
      this._t0 = now();
      keepPitch(a);
      a.defaultPlaybackRate = this._rate; a.playbackRate = this._rate;
      this._seek(this._start);
      this._setState("playing");
      let p;
      try { p = a.play(); } catch (err) { p = Promise.reject(err); }
      if (p && typeof p.then === "function") p.catch(err => { if (this._pending && this._pending.run === run) this._fail(err); });
      this._raf = raf(this._tick);
    });
  }
  _tick() {
    this._raf = null;
    if (!this._playing) return;
    this._check();
    if (this._playing) this._raf = raf(this._tick);
  }
  // The end check (rAF, timeupdate, the fine timer): ends the play on the range end, and inside the last FINE
  // seconds aims a timer at it, so the stop lands within a few ms of the end instead of up to a frame late.
  _check() {
    if (!this._playing) return;
    const a = this._a;
    if (a.seeking || this._end == null) return; // end null: the media "ended" event finishes the play
    const left = (this._end - a.currentTime) / (a.playbackRate || 1);
    if (left <= END_EARLY) { this._finish(); return; }
    if (left <= FINE) {
      clearTimeout(this._timer);
      this._timer = setTimeout(this._check, Math.max(1, left * 1000 - 1));
    }
  }
  _finish() {
    const pend = this._pending;
    this._pending = null;
    this._stopClock();
    this._playing = false;
    try { this._a.pause(); } catch { /* ignore */ }
    this._lastWall = (now() - this._t0) / 1000;
    this._rewind();
    if (pend) pend.resolve(true);
  }
  // Seeks unless the element is already at t or on its way there. Chrome takes ~0.3 s to seek an Ogg file, so a
  // finished play seeks back to its start at once (during a loop's pause) and the next play starts without a wait.
  _seek(t) {
    const a = this._a;
    if (a.seeking ? this._seekTarget === t : Math.abs(a.currentTime - t) < 0.002) return;
    this._seekTarget = t;
    try { a.currentTime = t; } catch { /* not seekable yet: plays from where it is */ }
  }
  _rewind() { if (this._ready && !this._playing) this._seek(this._start); }
  _fail(err) {
    const pend = this._pending;
    this._pending = null;
    this._stopClock();
    this._playing = false;
    try { this._a.pause(); } catch { /* ignore */ }
    this.error = err;
    this._emit("error");
    if (pend) pend.reject(err);
  }
  _stopClock() {
    if (this._raf != null) { caf(this._raf); this._raf = null; }
    clearTimeout(this._timer); this._timer = null;
  }
  _sleep(sec, run) {
    return new Promise(resolve => {
      if (run.cancelled) { resolve(false); return; }
      const done = ok => { clearTimeout(this._gapTimer); this._gapTimer = null; this._gapWake = null; resolve(ok); };
      this._gapWake = done;
      this._gapTimer = setTimeout(() => done(true), Math.round(sec * 1000));
    });
  }
}

// ------------------------------------------------------------------ the shared control bar
const CSS = `
.player{display:grid;gap:8px;margin:8px 0}
.player-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px}
.player-group{display:inline-flex;align-items:center;gap:6px}
.player-group>.lbl{font-size:13px;color:var(--muted)}
.player .seg button,.player .btn.small{min-height:var(--tap);min-width:var(--tap)}
.player .seg button{padding:6px 12px;font-variant-numeric:tabular-nums}
.player-play{min-width:132px}
.player-track{position:relative;height:10px;border-radius:5px;background:var(--line);overflow:hidden}
.player-range{position:absolute;top:0;bottom:0;background:var(--accent-soft);background:color-mix(in srgb,var(--accent) 38%,transparent)}
.player-head{position:absolute;top:0;bottom:0;width:3px;margin-left:-1px;background:var(--accent)}
.player-pause{height:4px;border-radius:2px;background:var(--line);overflow:hidden}
.player-pause:empty{visibility:hidden}
.player-pause>i{display:block;height:100%;width:0;background:var(--accent)}
.player-time{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums;margin-left:auto}
.player-ab{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.player-segs{display:flex;flex-wrap:wrap;gap:6px}
.player-segs .btn[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--ink);font-weight:500}
.player-status{min-height:1.4em;margin:0;font-size:14px}
.player-keys{margin:0;font-size:12.5px;color:var(--muted)}
@media (hover:none){.player-keys{display:none}}
@media (prefers-reduced-motion:reduce){.player-pause>i{transition:none!important;width:100%!important}}
`;
function injectCss() {
  if (typeof document === "undefined" || document.getElementById("player-css")) return;
  // first in <head>: style.css and a page's own stylesheet come later and can override these defaults
  document.head.prepend(h("style", { id: "player-css" }, CSS));
}

// Keys reach a bar when the focus is (1) in the bar, (2) in its scope (its card), or (3) on no control: the page body,
// or a focused element that is only a container or a text target, such as a tab panel with tabindex="0" (a click on
// plain text focuses it), a heading focused by script, or a chart column with a tooltip. In case 3 the bar is one of
// the shown bars inside the nearest such ancestor: the last one used, else the last one on the page. A focused
// control outside the bar and its scope (a link, a tab in the tab list, another card's button) keeps every key, and
// Space on any focused control keeps its native meaning (it presses the button). Text fields never see a shortcut.
const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
// What counts as a control: elements with a native key action, and the ARIA widget roles. A bare [tabindex] does not.
const CONTROL = "button, a[href], area[href], summary, input, select, textarea, audio[controls], video[controls], iframe, " +
  ["button", "link", "tab", "tablist", "checkbox", "radio", "switch", "menuitem", "menuitemcheckbox", "menuitemradio", "menu",
    "menubar", "option", "listbox", "combobox", "slider", "spinbutton", "scrollbar", "searchbox", "textbox", "treeitem",
    "tree", "grid", "gridcell", "treegrid"].map(r => `[role='${r}']`).join(", ");
const MODAL = "dialog, [role='dialog'], [role='alertdialog'], [aria-modal='true']";
let keysBound = false, lastBar = null;
// The bar a key goes to, or null. shown: the bars on screen; t: the focused element (null or body: nowhere).
function barFor(t, shown) {
  const pick = list => (list.includes(lastBar) ? lastBar : list.at(-1) || null);
  const atBody = !t || t === document.body || t === document.documentElement;
  if (atBody) return pick(shown);
  if (t.closest("[role='tablist'], [role='tab']")) return null; // a tab list's keys are its own (arrows, Space, Home …)
  const inBar = shown.find(x => x.el.contains(t));
  if (inBar) return inBar;
  // focus elsewhere in a bar's scope (its card): the bar with the innermost scope
  const scoped = shown.filter(x => x.scope && x.scope.contains(t))
    .sort((x, y) => (x.scope === y.scope ? 0 : x.scope.contains(y.scope) ? 1 : y.scope.contains(x.scope) ? -1 : 0))[0];
  if (scoped) return scoped;
  if (t.closest(CONTROL)) return null; // a control outside every bar keeps its keys
  // a non-control (a tab panel, a heading): the bars inside its nearest ancestor that has any, but never across a dialog
  for (let el = t; el && el !== document.documentElement; el = el.parentElement) {
    const inside = shown.filter(x => el.contains(x.el));
    if (inside.length) return pick(inside);
    if (el.matches(MODAL)) return null;
  }
  return pick(shown);
}
function onKey(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  const t = e.target instanceof Element ? e.target : null;
  if (t && (t.isContentEditable || t.closest(EDITABLE))) return;
  const c = barFor(t, [...bars].filter(x => x.visible()));
  if (!c) return;
  // Space on a focused control (a button, a link, a tab …) keeps its native meaning: it presses that control.
  if (e.key === " " && t && t !== document.body && t.closest(CONTROL)) return;
  if (c.key(e)) e.preventDefault();
}

// The control bar for a player: play/stop, speed 0.75 / 0.9 / 1.0, loop ×1 / ×3 / ×5 (pause 1.2 × the length),
// A / B from the current position, clear A–B, segment chips (片段 1, 2 …; a chip plays its chunk). Keys (focus in
// the bar, in `scope` (default: the bar's parent), or on no control around it, see barFor): Space play/stop, L loop
// count, A / B, [ ] segment.
// segments: [[start, end], …] in seconds. label: the word and source for the play button's aria-label ("東西 — MOE
// dictionary reading"). Returns the bar element; bar.destroy() undoes it (also done when the bar leaves the page).
export function playerControls(player, { segments = [], showAB = true, label = "", loops = LOOPS, rates = RATES, loop = 1, gap = GAP, scope = null } = {}) {
  injectCss();
  const segs = (segments || []).map(s => (Array.isArray(s) ? s : [s && s.start, s && s.end]))
    .filter(([s, e]) => fin(s) != null && fin(e) != null && e - s >= 0.05);
  const base0 = [player.start, player.end];
  let base = base0, seg = -1, A = null, B = null, loopN = loops.includes(loop) ? loop : loops[0], raf1 = null, seen = false, gone = false;
  const named = label ? `: ${label}` : "";

  // status: what the bar is doing, visible. live: what the screen reader hears. A loop's per-play and per-pause steps
  // ("Listen 2/3", "Your turn") are visual only, since they would talk over the audio; a loop is announced once, at
  // its end (the player is quiet then). Errors and the learner's own A / B / L changes are announced as they happen.
  const status = h("p", { class: "player-status" });
  const live = h("p", { class: "sr-only", "aria-live": "polite" });
  let phaseShown = false; // the status shows a loop step ("Listen 2/3", "Your turn"), cleared when the run ends
  const say = (zh, en, phase = false) => {
    status.replaceChildren(zh, " ", enText(en)); phaseShown = phase;
    if (!phase) live.replaceChildren(zh, " ", enText(en));
  };
  const playBtn = h("button", { type: "button", class: "btn primary player-play", onclick: () => toggle() });
  const rateBtns = rates.map(r => h("button", { type: "button", "data-rate": String(r), "aria-pressed": "false",
    onclick: () => { player.setRate(r); } }, `${r === 1 ? "1.0" : r}×`));
  const loopBtns = loops.map(n => h("button", { type: "button", "data-loop": String(n), "aria-pressed": "false",
    "aria-label": n === 1 ? "播放一次 Play once" : `重複 ${n} 次 Loop ${n} times, pause 1.2× the length after each`,
    onclick: () => setLoop(n) }, `×${n}`));
  const head = h("i", { class: "player-head", hidden: true });
  const rangeBar = h("span", { class: "player-range", hidden: true });
  const track = h("div", { class: "player-track", "aria-hidden": "true" }, rangeBar, head);
  const pauseBar = h("div", { class: "player-pause", "aria-hidden": "true" });
  const time = h("span", { class: "player-time" });
  const abText = h("span", { class: "player-ab" });
  const aBtn = h("button", { type: "button", class: "btn small", "aria-label": "設定 A 點 Set point A here (key A)", onclick: () => setA() }, "A");
  const bBtn = h("button", { type: "button", class: "btn small", "aria-label": "設定 B 點 Set point B here (key B)", onclick: () => setB() }, "B");
  const clearBtn = h("button", { type: "button", class: "btn small", onclick: () => clearAB() }, ...bi("清除 A–B", "Clear A–B"));
  const chips = segs.length ? [
    h("button", { type: "button", class: "btn small", "aria-pressed": "true", onclick: () => choose(-1) }, ...bi("全部", "Whole")),
    ...segs.map(([s, e], i) => h("button", { type: "button", class: "btn small", "aria-pressed": "false",
      "aria-label": `片段 ${i + 1} Segment ${i + 1}: ${s.toFixed(1)}–${e.toFixed(1)} s`, onclick: () => choose(i) }, `片段 ${i + 1}`)),
  ] : [];

  const el = h("div", { class: "player", role: "group", "aria-label": `跟讀播放器 Shadowing player${named}` },
    track, pauseBar,
    h("div", { class: "player-row" }, playBtn,
      h("span", { class: "player-group" }, h("span", { class: "lbl", "aria-hidden": "true" }, "速度"),
        h("span", { class: "seg", role: "group", "aria-label": "速度 Speed" }, rateBtns)),
      h("span", { class: "player-group" }, h("span", { class: "lbl", "aria-hidden": "true" }, "重複"),
        h("span", { class: "seg", role: "group", "aria-label": "重複 Loop" }, loopBtns)),
      time),
    showAB ? h("div", { class: "player-row", role: "group", "aria-label": "A–B 段落 A–B section" }, aBtn, bBtn, clearBtn, abText) : "",
    chips.length ? h("div", { class: "player-segs", role: "group", "aria-label": "片段 Segments" }, chips) : "",
    status, live,
    h("p", { class: "player-keys" }, "鍵盤 ", enText("Keys: Space play/stop · L loop count · A / B set points · [ ] previous / next segment")));

  // ---- behaviour
  function toggle() { if (player.state === "idle") start(); else player.stop(); }
  function start() {
    lastBar = ctl;
    const p = loopN > 1
      ? player.loop(loopN, { gap, onEach: ({ index, times, phase, seconds }) => {
        if (phase === "play") { say(`聽 ${index + 1}/${times}`, `Listen ${index + 1}/${times}`, true); pause(0); }
        else { say("換你說", `Your turn (${seconds.toFixed(1)} s)`, true); pause(seconds); }
      } })
      : player.play();
    Promise.resolve(p).then(res => {
      pause(0);
      if (!phaseShown || player.state !== "idle") return; // a newer run owns the status now
      // the loop's one announcement; a loop stopped (by the learner, or by another player) ends quietly
      if (res && res.completed) say(`✓ 重複 ${res.plays} 次完成。`, `Loop done: ${res.plays} plays.`);
      else { status.replaceChildren(); phaseShown = false; }
    }, err => {
      pause(0);
      if (err && err.name === "NotAllowedError") say("請按「播放」。", "Press Play (the browser held back autoplay).");
      else say("無法播放（離線或沒有音檔）。", "Could not play (offline, or the audio is missing).");
    });
  }
  function pause(sec) {
    if (!sec) { pauseBar.replaceChildren(); return; }
    const fill = h("i", { style: `transition:width ${sec.toFixed(2)}s linear` });
    pauseBar.replaceChildren(fill);
    raf(() => raf(() => { fill.style.width = "100%"; }));
  }
  function setLoop(n) {
    loopN = n;
    for (const b of loopBtns) b.setAttribute("aria-pressed", String(Number(b.dataset.loop) === n));
  }
  function apply() {
    const s = A ?? base[0];
    let e = B ?? base[1];
    if (e != null && e - s < MIN_RANGE) e = null; // A after the segment's end: play on to the file end
    player.setRange(s, e);
  }
  function setA() {
    const p = r3(player.position);
    if (B != null && B - p < MIN_RANGE) B = null;
    A = p;
    apply(); sayAB();
  }
  function setB() {
    const p = r3(player.position), s = A ?? base[0];
    if (p - s < MIN_RANGE) { say("B 要在 A 之後。", "B must come after A."); return; }
    B = p;
    apply(); sayAB();
  }
  function clearAB() {
    A = B = null;
    apply(); sayAB();
  }
  function sayAB() {
    if (A == null && B == null) say("A–B 已清除。", "A–B cleared.");
    else say(`A ${A == null ? "—" : A.toFixed(1)} → B ${B == null ? "—" : B.toFixed(1)}`, "seconds");
  }
  function choose(i, play = true) {
    seg = i; A = B = null;
    base = i < 0 ? base0 : segs[i];
    chips.forEach((c, j) => c.setAttribute("aria-pressed", String(j === i + 1)));
    apply();
    if (play) { player.stop(); start(); }
  }
  function step(d) {
    if (!segs.length) return;
    const n = segs.length;
    choose(seg < 0 ? (d > 0 ? 0 : n - 1) : (seg + d + n) % n);
  }

  // ---- drawing
  function draw() {
    const st = player.state, active = st !== "idle";
    playBtn.replaceChildren(...(active ? ["■ ", ...bi("停止", "Stop")] : ["▶ ", ...bi("播放", "Play")]));
    playBtn.setAttribute("aria-label", `${active ? "停止 Stop" : "播放 Play"}${named}`);
    playBtn.classList.toggle("is-playing", active);
    for (const b of rateBtns) b.setAttribute("aria-pressed", String(Math.abs(Number(b.dataset.rate) - player.rate) < 0.001));
    clearBtn.disabled = A == null && B == null;
    abText.textContent = A == null && B == null ? "" : `A ${A == null ? "—" : A.toFixed(1)} · B ${B == null ? "—" : B.toFixed(1)} s`;
    drawTime();
  }
  function drawTime() {
    const d = player.duration, pos = player.position;
    time.textContent = `${(fin(pos) ?? 0).toFixed(1)} / ${fin(d) != null ? d.toFixed(1) : "–"} s`;
    if (fin(d) == null) { head.hidden = rangeBar.hidden = true; return; }
    const pc = x => `${Math.max(0, Math.min(100, (100 * x) / d)).toFixed(2)}%`;
    const s = player.start, e = player.end ?? d;
    rangeBar.hidden = s <= 0.001 && e >= d - 0.001; // the whole file: no highlight
    rangeBar.style.left = pc(s); rangeBar.style.width = pc(e - s);
    head.hidden = false; head.style.left = pc(pos);
  }
  function frame() { raf1 = null; drawTime(); if (player.state !== "idle" && !gone) raf1 = raf(frame); }
  const onState = () => {
    draw();
    if (player.state !== "idle" && raf1 == null) raf1 = raf(frame);
    if (player.state === "idle") pause(0);
  };
  const onError = () => { if (player.error && player.error.name !== "NotAllowedError") say("無法播放（離線或沒有音檔）。", "Could not play (offline, or the audio is missing)."); };
  player.addEventListener("state", onState);
  player.addEventListener("rate", draw);
  player.addEventListener("range", draw);
  player.addEventListener("error", onError);
  player.bind(el);

  const ctl = {
    el, scope,
    visible: () => el.isConnected && el.getClientRects().length > 0,
    key(e) {
      if (e.repeat) return e.key === " "; // held keys: swallow Space's scrolling, do nothing else
      switch (e.key) {
        case " ": toggle(); return true;
        case "l": case "L": { const i = loops.indexOf(loopN); setLoop(loops[(i + 1) % loops.length]); say(`重複 ×${loopN}`, loopN === 1 ? "Play once" : `Loop ×${loopN}`); return true; }
        case "a": case "A": if (!showAB) return false; setA(); return true;
        case "b": case "B": if (!showAB) return false; setB(); return true;
        case "[": if (!segs.length) return false; step(-1); return true;
        case "]": if (!segs.length) return false; step(1); return true;
        default: return false;
      }
    },
    sweep() { if (el.isConnected) seen = true; else if (seen) destroy(); },
  };
  function destroy() {
    if (gone) return;
    gone = true;
    bars.delete(ctl);
    if (lastBar === ctl) lastBar = null;
    if (raf1 != null) { caf(raf1); raf1 = null; }
    player.removeEventListener("state", onState);
    player.removeEventListener("rate", draw);
    player.removeEventListener("range", draw);
    player.removeEventListener("error", onError);
    player.unbind(el);
    if (!el.isConnected) player.stop(); // its view went away
  }
  if (ctl.scope == null) Object.defineProperty(ctl, "scope", { get: () => el.parentElement });
  el.addEventListener("pointerdown", () => { lastBar = ctl; });
  el.addEventListener("focusin", () => { lastBar = ctl; });
  el.destroy = destroy;
  bars.add(ctl);
  lastBar = ctl;
  ensureWatch();
  if (!keysBound) { document.addEventListener("keydown", onKey); keysBound = true; }
  setLoop(loopN);
  draw();
  return el;
}
