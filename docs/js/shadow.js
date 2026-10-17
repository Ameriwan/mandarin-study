// 跟讀 Shadowing (MASTER_PROMPT §5.4, §6.7, §7.3, §7.5, §7.6; M3 design §4). Five tabs on one panel, as in the Tone Gym:
//  1. 練習 Session: the guided protocol on one chosen line or on an auto-picked set for a timed session (5 / 10 / 15
//     min): listen ×3 → mumble along ×2 → shadow with the script ×2 → shadow blind ×2 → record and compare → self-rate.
//     Each step loops the player by itself; the learner moves on with Next. The session countdown counts visible,
//     unpaused time; when it runs out the session ends after the current line.
//  2. 句庫 Sentence bank: the TTS sentences by level (filter level / focus / search) and the MOE dictionary readings by
//     topic, each with the player and "practise this".
//  3. 教育部朗讀 MOE readings: the whole entry, its text unmodified apart from format conversion (§7.5), the attribution,
//     the player over the whole file with segment chips and A–B.
//  4. 母語者檢查 Native check: the NATIVE_CHECKER hand-off screen (Chinese first, big buttons) over the saved
//     recordings; marks go to store "native.checks".
//  5. 本週 This week: minutes and sessions against the dose (at least 4 × 10 min a week with self-recording, Foote &
//     McDonough 2017).
// Audio: sentences are TTS (labelled "TTS (Google zh-TW)", §7.6), readings are MOE whole-entry files played whole or by
// range, never cut (§7.3, §7.5; labelled "MOE dictionary reading"). Only MOE segments with a model contour get the pitch
// overlay; TTS intonation is not a model (§6.3). Recordings stay on the device (IndexedDB).
//
// Stored (localStorage via app.js store, prefix "gy."):
//   shadow.prefs     {minutes, level, rate, text, zhuyin, en, reading}
//   shadow.lines     {lineKey: {n, last (ms), rating: "clear" | "ok" | "again", zh}}
//   shadow.sessions  [{ts, date, minutes, planned, lines, takes, ratings, kind: "timed" | "line", dose, fast?}]
//                    dose: true when the session ran at least 10 minutes AND has a take (§6.7, Foote & McDonough
//                    2017: 4 × 10 min a week with self-recording); only those count toward the weekly dose
//   native.checks    [{key, take, date, ts, zh, zhuyin, kind, marks: [{syl, said, zh, sound, tone}]}]
//                    take: the ts of the recording the checker heard (a newer take of the same key is unchecked; a
//                    check saved without it counts for a take older than the check)
//   days[date].shadow  minutes (app.js logMinutes("shadow", m)): the session's own visible time, and outside a
//                    session the page's active time (input or playback in the last 2 minutes; not the native check)
// Recordings (IndexedDB via app.js saveRecording): "shadow:<line key>" with {ts, zh, zhuyin, spoken, line, title, src,
//   model, rating}; ts is when the take was made (kept when the rating is saved onto it). Line keys: a sentence id ("s001"); an MOE segment "moe:<audio id>:<segment index>"; a whole MOE
//   entry "moe:<audio id>"; an A–B part "moe:<audio id>@<start>-<end>".
// ?fast=1 (testing only): every protocol timer (the session length, the pauses of the loops) is divided by 20, and the
//   session's minutes are counted ×20 (simulated), so a full 10-minute session runs in 30 s and counts as one.
import { h, $, clear, mountShell, store, loadJSON, shuffle, pick, ruby, settings, setSetting, syllables, toneOf, baseOf, INITIALS,
  TONE_NAMES, enText, bi, toast, today, logMinutes, stopAudio, Recorder, canRecord, saveRecording, listRecordings, audioContext,
  playMoe, playFile, speak } from "./app.js";
import { ShadowPlayer, playerControls, stopPlayers, RATES } from "./player.js";
import { loadPitchy, LivePitch, analyzeSamples, normalize, compare, overlay, describeContour } from "./pitch.js";

mountShell("shadow");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

const FAST = (() => { try { return new URLSearchParams(location.search).get("fast") === "1" ? 20 : 1; } catch { return 1; } })();
const TABS = [["session", "練習", "Session"], ["bank", "句庫", "Sentence bank"], ["moe", "教育部朗讀", "MOE readings"],
  ["native", "母語者檢查", "Native check"], ["week", "本週", "This week"]];
const KEY = { prefs: "shadow.prefs", lines: "shadow.lines", sessions: "shadow.sessions", checks: "native.checks" };
const DOSE = { sessions: 4, minutes: 10 };    // §6.7: at least 4 × 10 min a week, with self-recording
const DURATIONS = [5, 10, 15];
const LEVELS = [["all", "全部", "All"], ["1", "第1級", "L1"], ["2", "第2級", "L2"], ["3", "第3級", "L3"]];
const SRC = {
  tts: { badge: "TTS", cls: "tts", label: "TTS (Google zh-TW)" },
  moe: { badge: "MOE", cls: "human", label: "MOE dictionary reading" },
  voice: { badge: "瀏覽器語音", cls: "none", label: "Browser voice (no TTS file)" },
};
const LICENSE = "CC BY-ND 3.0 TW";
const RATINGS = [["clear", "清楚", "clear", "說得清楚自然", "easy and clear"], ["ok", "還好", "OK", "大致可以", "mostly fine"],
  ["again", "再練", "again", "要再練", "needs more work"]];
const SANDHI_FOCUS = { "3+3": ["三聲連讀", "3+3 sandhi"], half3: ["半三聲", "half-third tone"], yi: ["「一」的變調", "tone sandhi of 一"],
  bu: ["「不」的變調", "tone sandhi of 不"], neutral: ["輕聲", "neutral tone"], tones: ["聲調", "tones"] };
const CHUNK = { min: 0.8, max: 3.5 }; // seconds: MOE segments the auto-picked set uses (3.5 = the build's contour limit)
const CJK = /[㐀-鿿豈-﫿]/;
const en = (text, attrs) => enText(text, attrs);
const arr = x => (Array.isArray(x) ? x : []);
const fin = x => (typeof x === "number" && Number.isFinite(x) ? x : null);
const round1 = x => Math.round(x * 10) / 10;
const mmss = sec => { const s = Math.max(0, Math.ceil(sec - 0.001)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const pct = x => `${(100 * Math.min(1, Math.max(0, x))).toFixed(1)}%`;
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const levelNum = lv => { const m = /(\d)/.exec(String(lv || "")); return m ? m[1] : ""; };
const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise(r => setTimeout(() => r(fallback), ms))]);
const smooth = () => (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
const focusLost = () => { const a = document.activeElement; return !a || a === document.body || !a.isConnected; };
// replaceChildren for nested arrays with null / false holes (h() flattens its children; the DOM method does not)
const put = (el, ...kids) => { el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false)); return el; };

// ------------------------------------------------------------------ preferences and stats
const prefs = () => ({ minutes: 10, level: "all", rate: 1, text: true, zhuyin: true, en: true, reading: null, ...(store.get(KEY.prefs, {}) || {}) });
const setPref = (k, v) => store.set(KEY.prefs, { ...prefs(), [k]: v });
const lineStats = () => store.get(KEY.lines, {}) || {};
function recordLineStat(line, rating) {
  const all = lineStats();
  const s = all[line.key] || { n: 0 };
  all[line.key] = { n: (s.n || 0) + 1, last: Date.now(), rating, zh: line.zh };
  store.set(KEY.lines, all);
}
const sessionLog = () => arr(store.get(KEY.sessions, []));
// One record per session (keyed by its start time): saved when it ends and, while it runs, when the page is hidden.
function upsertSession(rec) {
  const all = sessionLog().filter(x => x && x.ts !== rec.ts);
  all.push(rec);
  all.sort((a, b) => a.ts - b.ts);
  store.set(KEY.sessions, all.slice(-300));
}
function dropSession(ts) { store.set(KEY.sessions, sessionLog().filter(x => x && x.ts !== ts)); }

// Monday-based weeks (the dose is per week). offset 0 = this week.
function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function weekInfo(offset = 0) {
  const start = weekStart();
  start.setDate(start.getDate() - 7 * offset);
  const keys = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return dateKey(d); });
  const days = store.get("days", {}) || {};
  const minutes = keys.reduce((s, k) => s + (Number(days[k] && days[k].shadow) || 0), 0);
  const ss = sessionLog().filter(x => x && keys.includes(x.date));
  return { start, keys, minutes: round1(minutes), sessions: ss, dose: ss.filter(countsForDose).length, fast: ss.filter(x => x.fast).length };
}
// §6.7: a session counts toward the weekly dose when it ran 10 minutes or more with self-recording (a take). The
// takes test also covers records written before that rule (and the Today block's, which carry takes too).
const countsForDose = x => !!x && (typeof x.dose === "boolean" ? x.dose : Number(x.minutes) >= DOSE.minutes) && Number(x.takes) > 0;

// ------------------------------------------------------------------ time on the page (outside a session)
// Visible time counts while the learner is active (a tap or key in the last 2 minutes, or a player playing). A running
// session logs its own time instead, and the native check (someone else using the screen) does not count.
const pageClock = { last: performance.now(), lastInput: performance.now(), pending: 0, wasActive: false, paused: false, off: false };
const playing = new Set();
function watchPlaying(p) {
  p.addEventListener("state", () => { if (p.state === "idle") playing.delete(p); else playing.add(p); });
  return p;
}
function pageActive(now) {
  return !pageClock.paused && !pageClock.off && document.visibilityState === "visible" && (now - pageClock.lastInput < 120000 || playing.size > 0);
}
function pageTick(final = false) {
  const now = performance.now(), dt = now - pageClock.last;
  if (pageClock.wasActive && dt < 60000) pageClock.pending += dt;
  pageClock.last = now;
  pageClock.wasActive = pageActive(now);
  if (pageClock.pending >= (final ? 1000 : 6000)) { logMinutes("shadow", pageClock.pending / 60000); pageClock.pending = 0; }
}
setInterval(pageTick, 15000);
for (const t of ["pointerdown", "keydown"]) document.addEventListener(t, () => { pageClock.lastInput = performance.now(); pageTick(); }, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => pageTick(true));
window.addEventListener("pagehide", () => pageTick(true));

// ------------------------------------------------------------------ data
let data = null; // {missing, fallback, sentences: [line], readings: [reading], attribution, contrasts}
const DEFAULT_ATTRIBUTION = "中華民國教育部（Ministry of Education, R.O.C.）。《國語辭典簡編本》網址：http://dict.concised.moe.edu.tw/";

function sentenceLine(s) {
  const path = typeof s.audio === "string" && s.audio ? s.audio : null;
  return { key: String(s.id), type: "sentence", src: path ? "tts" : "voice", path, zh: s.zh, zhuyin: s.zhuyin, spoken: s.spoken || null,
    en: s.en || "", level: s.level || "", focus: s.focus || "", len: fin(Number(s.dur)) && s.dur > 0 ? s.dur : null,
    fileDur: fin(Number(s.dur)), start: 0, end: null, contour: null };
}
function normReading(r) {
  const segments = arr(r.segments).filter(x => Array.isArray(x) && fin(x[0]) != null && fin(x[1]) != null && x[1] > x[0]);
  return { zh: r.zh, zhuyin: r.zhuyin || "", spoken: r.spoken || null, level: r.level || "", topic: r.topic || "", id: String(r.id),
    text: String(r.text || ""), dur: Number(r.dur), segments, contours: r.contours && typeof r.contours === "object" ? r.contours : {} };
}
// A protocol line from an MOE reading: segment k, the whole entry (k null), or an A–B part (range).
function readingLine(r, k = null, range = null) {
  let start = 0, end = null, key = `moe:${r.id}`;
  if (range) { [start, end] = range; key = `moe:${r.id}@${start.toFixed(2)}-${end.toFixed(2)}`; k = null; }
  else if (k != null && r.segments[k]) { [start, end] = r.segments[k]; key = `moe:${r.id}:${k}`; }
  else k = null;
  const len = (end ?? r.dur) - start;
  return { key, type: "moe", src: "moe", id: r.id, reading: r, seg: k, start, end, len: len > 0 ? len : null, fileDur: r.dur,
    zh: r.zh, zhuyin: r.zhuyin, spoken: r.spoken, en: "", level: r.level, focus: "", contour: k != null ? r.contours[String(k)] || null : null };
}
// The segments the auto-picked set may use: after the headword, 0.8–3.5 s, with a model contour.
const chunkLines = r => r.segments.map((s, k) => ({ s, k })).filter(({ s, k }) => k > 0 && s[1] - s[0] >= CHUNK.min && s[1] - s[0] <= CHUNK.max && r.contours[String(k)])
  .map(({ k }) => readingLine(r, k));
const lineTitle = line => (line.type === "moe" ? `${line.zh} · ${line.seg != null ? `片段 ${line.seg + 1}` : line.end != null ? "A–B" : "全文"}` : line.zh);
const lineTitleEn = line => (line.type === "moe" ? (line.seg != null ? `segment ${line.seg + 1}` : line.end != null ? "A–B part" : "whole entry") : "");

async function loadData() {
  const [shadow, contrasts] = await Promise.all([
    loadJSON("shadowing").catch(err => { console.warn("shadowing.json not available:", err.message); return null; }),
    loadJSON("contrasts").catch(() => [])]);
  const out = { missing: !shadow, fallback: false, contrasts: arr(contrasts), attribution: (shadow && shadow.attribution) || DEFAULT_ATTRIBUTION,
    sentences: arr(shadow && shadow.sentences).filter(s => s && s.id != null && s.zh && s.zhuyin).map(sentenceLine),
    readings: arr(shadow && shadow.readings).filter(r => r && r.id && r.zh && Number(r.dur) > 0).map(normReading) };
  if (!shadow) {
    // Before the M3 build: the M2 sandhi sentences (TTS, labelled) keep the protocol and the bank usable.
    const tones = await loadJSON("tones").catch(() => null);
    out.sentences = arr(tones && tones.sandhi && tones.sandhi.items).filter(e => e && e.kind === "sentence" && e.zh && e.zhuyin && e.audio)
      .map((e, i) => sentenceLine({ ...e, id: `sandhi-${i + 1}`, level: "", focus: e.rule || "", dur: null }));
    out.fallback = out.sentences.length > 0;
  }
  return out;
}
function focusName(id) {
  const c = data.contrasts.find(x => x && x.id === id);
  if (c) return [c.zh, c.en];
  return SANDHI_FOCUS[id] || [id, id];
}

// ------------------------------------------------------------------ players
// A sentence without a TTS file: the browser's zh-TW voice behind the same small interface as ShadowPlayer
// (play, loop, stop, setRate, state, dispose), labelled "Browser voice".
class VoicePlayer extends EventTarget {
  constructor(text, rate = 1) { super(); this.text = text; this._rate = rate; this._state = "idle"; this._run = null; this._wall = 0; this._wake = null; this._t = null; }
  get state() { return this._state; }
  get rate() { return this._rate; }
  get preservesPitch() { return true; }
  setRate(r) { this._rate = r; return r; }
  _set(s) { if (s !== this._state) { this._state = s; this.dispatchEvent(new Event("state")); } }
  _begin() { this.stop(); stopPlayers(); const run = { cancelled: false }; this._run = run; return run; }
  _end(run) { if (this._run === run) { this._run = null; this._set("idle"); } }
  async _say(run) {
    if (!("speechSynthesis" in window)) throw Object.assign(new Error("此瀏覽器沒有語音 No speech synthesis here"), { name: "MediaError" });
    this._set("playing");
    const t = performance.now();
    await speak(this.text, { rate: 0.9 * this._rate });
    if (run.cancelled) return false;
    this._wall = (performance.now() - t) / 1000;
    if (this._wall < 0.2) throw Object.assign(new Error("瀏覽器語音沒有播放 The browser voice did not play"), { name: "MediaError" });
    return true;
  }
  async play() { const run = this._begin(); try { return await this._say(run); } finally { this._end(run); } }
  async loop(times = 3, { gap = 1.2, onEach = null, gapAfterLast = true } = {}) {
    const run = this._begin();
    let plays = 0;
    try {
      for (let i = 0; i < times && !run.cancelled; i++) {
        if (onEach) onEach({ index: i, times, phase: "play" });
        if (!(await this._say(run))) break;
        plays++;
        if (i + 1 >= times && !gapAfterLast) break;
        const sec = gap * this._wall;
        this._set("gap");
        if (onEach) onEach({ index: i, times, phase: "gap", seconds: sec });
        const ok = await new Promise(res => { this._wake = res; this._t = setTimeout(() => res(true), sec * 1000); });
        this._wake = null;
        if (!ok) break;
      }
      return { completed: !run.cancelled && plays === times, plays };
    } finally { this._end(run); }
  }
  stop() {
    if (this._run) this._run.cancelled = true;
    this._run = null;
    clearTimeout(this._t);
    if (this._wake) { const w = this._wake; this._wake = null; w(false); }
    try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch { /* ignore */ }
    this._set("idle");
  }
  dispose() { this.stop(); }
}
function makePlayer(line, owner = null) {
  const rate = prefs().rate;
  const p = line.src === "voice" ? new VoicePlayer(line.zh, rate)
    : new ShadowPlayer({ src: line.src === "tts" ? line.path : null, id: line.src === "moe" ? line.id : null, start: line.start || 0,
      end: line.end ?? null, dur: line.fileDur ?? null, rate, owner });
  return watchPlaying(p);
}

// ------------------------------------------------------------------ shared bits
const srcBadge = (src, { label = true } = {}) => {
  const s = SRC[src] || SRC.voice;
  return h("span", { class: "sh-srcbadge" }, h("span", { class: `badge ${s.cls}`, title: s.label }, s.badge),
    label ? h("span", { class: "sh-srclabel", lang: "en" }, s.label) : h("span", { class: "sr-only", lang: "en" }, s.label));
};
const lineRuby = (line, { zhuyin = prefs().zhuyin, cls = "" } = {}) => ruby(line.zh, zhuyin ? line.zhuyin : "", { cls, spoken: line.spoken });
const notice = (zh, enS, role = "note") => h("p", { class: "sh-notice", role }, zh, " ", en(enS));
// "Show sandhi" (§5 display toggles): the spoken tone over the written one, wherever ruby() draws Zhuyin.
function sandhiSwitch(onChange) {
  const on = () => !!settings().sandhi;
  const btn = h("button", { type: "button", role: "switch", class: "sh-switch", "aria-checked": String(on()), onclick: () => {
    setSetting("sandhi", !on());
    btn.setAttribute("aria-checked", String(on()));
    onChange();
  } }, h("span", { class: "sh-switch-track", "aria-hidden": "true" }, h("span", { class: "sh-switch-knob" })), h("span", {}, "變調 ", h("span", { lang: "en" }, "Sandhi")));
  return btn;
}
// A pref switch (文字 / 注音 / 英文).
function prefSwitch(key, zh, enS, onChange) {
  const btn = h("button", { type: "button", role: "switch", class: "sh-switch", "aria-checked": String(!!prefs()[key]), onclick: () => {
    setPref(key, !prefs()[key]);
    btn.setAttribute("aria-checked", String(!!prefs()[key]));
    onChange();
  } }, h("span", { class: "sh-switch-track", "aria-hidden": "true" }, h("span", { class: "sh-switch-knob" })), h("span", {}, zh, " ", h("span", { lang: "en" }, enS)));
  return btn;
}
// The pitch overlay sized to its box (as drills.js does).
function drawOverlay(box, { model = null, user = null, syllables: syls = [] }) {
  const width = Math.round(Math.min(560, Math.max(280, (box.clientWidth || 342) - 2)));
  const height = Math.round(Math.min(240, Math.max(180, width * 0.52)));
  try { clear(box).append(overlay({ model, user, syllables: syls, width, height })); }
  catch (err) { console.error(err); clear(box).append(h("p", { class: "muted small" }, ...bi("無法畫出音高曲線。", "Could not draw the pitch curve."))); }
}
// What compare() and the overlay get as syllables: the headword's for segment 0; for any other chunk nothing (null),
// so compare() splits it at the model's own voicing gaps (one more than its interior gaps, at most 3). The chunk is
// not aligned to text, and the build's length estimate (about 4 a second) splits short chunks inside a syllable:
// the MOE clip of 水果 segment 2 scored 0 against its own model with 3, and 90 with null.
function sylInfo(line) {
  if (line.type !== "moe" || line.seg !== 0) return { list: [], count: null };
  const z = line.spoken && syllables(line.spoken).length === syllables(line.zhuyin).length ? line.spoken : line.zhuyin;
  const list = syllables(z).map(s => ({ zhuyin: s, tone: toneOf(s) }));
  return { list, count: list };
}
async function userContour(blob, live, n) {
  const ok = await loadPitchy().then(() => true, () => false);
  if (!ok) return null;
  try {
    const buf = await audioContext().decodeAudioData(await blob.arrayBuffer());
    const c = normalize(await analyzeSamples(buf.getChannelData(0), buf.sampleRate), { n });
    if (c) return c;
  } catch (err) { console.warn("take not decodable, using the live frames", err); }
  try { return live ? normalize(live.frames, { n }) : null; } catch (err) { console.error(err); return null; }
}
const modelMeta = line => (line.src === "tts" ? { src: "tts", path: line.path } : line.src === "moe" ? { src: "moe", id: line.id, start: line.start, end: line.end }
  : { src: "voice", text: line.zh });
// The take of a line, one per line (the newest). zhuyin only when the take is the written text (a sentence, a headword
// segment): the native check then marks it syllable by syllable; otherwise as one whole take. ts: when the take was
// made (meta overrides saveRecording's own Date.now()), so saving the rating onto it later keeps the take's identity:
// a native check names the take it heard by this ts.
function saveTake(line, blob, rating, ts) {
  const aligned = line.type === "sentence" || line.seg === 0;
  return saveRecording(`shadow:${line.key}`, blob, { zh: line.zh, zhuyin: aligned ? line.zhuyin : "", spoken: aligned ? line.spoken : null,
    line: line.key, title: lineTitle(line), src: line.src, model: modelMeta(line), rating, ...(fin(ts) != null ? { ts } : {}) }).catch(err => { console.error(err); toast("無法儲存錄音 Could not save the recording"); });
}

// ------------------------------------------------------------------ page and tabs
const app = $("#app");
let teardown = [];   // the current view's clean-up functions
let run = null;      // the running protocol {stop(quiet)}
let pending = null;  // a line chosen in the bank or the MOE tab, waiting on the Session tab
const bankState = { q: "", level: "all", focus: "", open: null };

function leaveView() {
  if (run) run.stop(true);
  for (const f of teardown.splice(0)) { try { f(); } catch (err) { console.error(err); } }
  stopPlayers();
  stopAudio();
}

async function main() {
  data = await loadData();
  clear(app);
  app.append(h("div", { class: "page-head" },
    h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "跟讀"), h("span", { class: "en", lang: "en" }, "Shadowing")),
    h("p", { class: "muted small sh-lede" }, "聽，跟著說，錄下來比較。每週至少 4 次、每次 10 分鐘，要錄音。",
      en("Listen, speak along, record and compare. At least 4 × 10 minutes a week, with a recording (Foote & McDonough 2017)."))));
  if (FAST > 1) app.append(notice("測試模式：所有計時除以 20，時間以 ×20 計算。", "Test mode (?fast=1): every protocol timer is divided by 20 and session minutes count ×20. For testing only.", "status"));
  if (data.missing) {
    app.append(notice("跟讀資料還沒建置。", data.fallback
      ? "Shadowing data (docs/data/shadowing.json) isn't built yet: run tools/build.py. Until then the sandhi sentences of the Tone Gym stand in."
      : "Shadowing data (docs/data/shadowing.json) isn't built yet: run tools/build.py.", "status"));
  }
  const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "跟讀 Shadowing" });
  const panel = h("section", { role: "tabpanel", id: "shadow-panel", class: "sh-panel", tabindex: "0" });
  const show = id => {
    for (const b of tabs.children) {
      const on = b.dataset.id === id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      // at 375 px the tab row scrolls sideways: bring the chosen tab into it (the row only, never the page)
      if (on) {
        const tr = tabs.getBoundingClientRect(), br = b.getBoundingClientRect();
        if (br.left < tr.left || br.right > tr.right) tabs.scrollLeft += br.left - tr.left - (tr.width - br.width) / 2;
      }
    }
    panel.setAttribute("aria-labelledby", `tab-${id}`);
    leaveView();
    clear(panel);
    // the new state first, then the tick: it credits the time so far under the old state and starts the new one
    pageClock.off = id === "native"; // a checker is using the screen
    pageTick();
    if (location.hash.slice(1) !== id) history.replaceState(null, "", location.pathname + location.search + "#" + id);
    ({ session: renderSession, bank: renderBank, moe: renderMoe, native: renderNative, week: renderWeek })[id](panel);
  };
  // from a button inside the panel (practise this, a reading chip): the view focuses its own control, else its tab
  ui.show = id => { show(id); const b = tabs.querySelector(`[data-id="${id}"]`); if (b && focusLost()) b.focus({ preventScroll: true }); };
  for (const [id, zh, enS] of TABS) {
    tabs.append(h("button", { type: "button", role: "tab", id: `tab-${id}`, "aria-controls": "shadow-panel", "data-id": id, "aria-selected": "false", tabindex: "-1", onclick: () => show(id) },
      zh, " ", h("span", { class: "muted small", lang: "en" }, enS)));
  }
  tabs.addEventListener("keydown", e => {
    const list = [...tabs.children];
    const i = list.indexOf(e.target);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (i < 0 || j === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const b = list[(j + list.length) % list.length];
    b.focus();
    show(b.dataset.id);
  });
  app.append(tabs, panel);
  const start = location.hash.slice(1);
  show(TABS.some(x => x[0] === start) ? start : "session");
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    const tab = TABS.some(x => x[0] === id) && tabs.querySelector(`[data-id="${id}"]`);
    if (!tab || tab.getAttribute("aria-selected") === "true") return;
    show(id);
    if (focusLost()) tab.focus();
  });
}
const ui = { show: null };
function practise(line) { pending = line; ui.show("session"); }

// ------------------------------------------------------------------ 1. 練習 Session: start card
function renderSession(panel) {
  const p = prefs();
  const lines = data.sentences.length + data.readings.length;
  const card = h("section", { class: "card sh-start", "aria-labelledby": "sh-start-h" });
  panel.append(card);
  card.append(h("h2", { id: "sh-start-h", tabindex: "-1" }, "引導跟讀 ", en("Guided shadowing", { class: "muted" })),
    h("ol", { class: "sh-overview" }, STEPS.map((st, i) => h("li", {}, h("span", { class: "n", "aria-hidden": "true" }, i + 1), h("span", {}, st.title[0]), " ", en(st.title[1], { class: "muted" })))));
  if (!lines) { card.append(notice("還沒有跟讀句子。", "No shadowing lines yet: run tools/build.py.")); return; }
  const chosen = pending;
  pending = null;
  if (chosen) {
    card.append(h("div", { class: "sh-chosen" },
      h("p", { class: "small muted sh-chosen-lbl" }, "選好的句子 ", en("Chosen line")),
      h("p", { class: "sh-chosen-line" }, lineRuby(chosen, { cls: "" }), chosen.type === "moe" ? h("span", { class: "small muted" }, ` · ${lineTitle(chosen).split(" · ")[1]} `, en(lineTitleEn(chosen))) : null),
      chosen.en ? h("p", { class: "small muted" }, en(chosen.en)) : null, srcBadge(chosen.src),
      h("div", { class: "row sh-chosen-btns" },
        h("button", { type: "button", class: "btn primary", onclick: () => startProtocol(panel, { first: [chosen], single: true }) }, "▶ ", ...bi("只練這一句", "Practise this line")),
        h("button", { type: "button", class: "btn", onclick: () => startProtocol(panel, { first: [chosen], minutes: prefs().minutes, level: prefs().level }) },
          "▶ ", ...bi("計時練習，從這句開始", "Timed session starting here")))));
  }
  const durSeg = h("div", { class: "seg", role: "group", "aria-label": "時間 Length" }, DURATIONS.map(m => h("button", { type: "button", "aria-pressed": String(m === p.minutes),
    "data-m": String(m), onclick: () => { setPref("minutes", m); paintChoice(); } }, `${m} `, h("span", { lang: "en" }, "min"))));
  const levelSeg = h("div", { class: "seg", role: "group", "aria-label": "程度 Level" }, LEVELS.map(([id, zh, enS]) => h("button", { type: "button", "aria-pressed": String(id === p.level),
    "data-l": id, onclick: () => { setPref("level", id); paintChoice(); } }, zh, id === "all" ? [" ", h("span", { lang: "en" }, enS)] : null)));
  const startBtn = h("button", { type: "button", class: "btn primary sh-go", onclick: () => startProtocol(panel, { minutes: prefs().minutes, level: prefs().level }) });
  const countLine = h("p", { class: "small muted", "aria-live": "polite" });
  function paintChoice() {
    const q = prefs();
    for (const b of durSeg.children) b.setAttribute("aria-pressed", String(Number(b.dataset.m) === q.minutes));
    for (const b of levelSeg.children) b.setAttribute("aria-pressed", String(b.dataset.l === q.level));
    startBtn.replaceChildren("▶ 開始 ", en("Start"), ` · ${q.minutes} 分鐘`);
    startBtn.setAttribute("aria-label", `開始 ${q.minutes} 分鐘跟讀 Start a ${q.minutes}-minute session`);
    // the pool the auto-picked set draws from (autoQueue itself stops at about 80 lines and goes round again)
    const inLevel = l => q.level === "all" || levelNum(l.level) === q.level;
    const nS = data.sentences.filter(inLevel).length, nC = data.readings.filter(r => inLevel(r) && chunkLines(r).length).length;
    const n = nS + nC;
    startBtn.disabled = !n;
    put(countLine, n ? [`${nS} 句 TTS 句子，夾著 ${nC} 條教育部真人朗讀的片段。`, en(` ${nS} TTS sentences, with chunks of ${nC} MOE human-voice readings in between.`)]
      : ["這個程度還沒有句子。", en(" No lines at this level yet.")]);
  }
  card.append(h("div", { class: "sh-choices" },
    h("div", { class: "sh-choice" }, h("span", { class: "sh-choice-lbl" }, "時間 ", en("Length")), durSeg),
    h("div", { class: "sh-choice" }, h("span", { class: "sh-choice-lbl" }, "程度 ", en("Level")), levelSeg)),
  startBtn, countLine);
  paintChoice();
  const w = weekInfo(0);
  card.append(h("p", { class: "small sh-dose-line" }, doseDots(w.dose), " ", `本週 ${w.dose}/${DOSE.sessions} 次 10 分鐘跟讀（含錄音） · ${Math.round(w.minutes)} 分鐘`,
    en(` This week: ${w.dose} of ${DOSE.sessions} ten-minute sessions with a recording · ${Math.round(w.minutes)} min`)),
  ...(canRecord ? [] : [notice("這個瀏覽器不能錄音，所以這裡的練習不算進每週份量（要自己錄音）。",
    "This browser can't record, so sessions here don't count toward the weekly dose (it needs self-recording).")]),
  h("p", { class: "small muted" }, "按下開始後，聲音會自動播放；每一步做完按「下一步」。錄音只存在這台裝置。",
    en("After Start the audio plays by itself; press Next after each step. Recordings stay on this device.")));
  if (chosen) card.querySelector(".sh-chosen .btn.primary").focus({ preventScroll: true });
}
function doseDots(n) {
  return h("span", { class: "sh-dots", "aria-hidden": "true" }, Array.from({ length: DOSE.sessions }, (_, i) => h("i", { class: i < n ? "on" : "" })));
}

// The auto-picked set: lines rated "again" first, then never practised, then "OK", then "clear" (oldest first within
// each, random within ties); one MOE chunk (human voice, with a pitch overlay) after every two sentences.
function autoQueue(level = "all", skip = []) {
  const stats = lineStats();
  const inLevel = l => level === "all" || levelNum(l.level) === level;
  const order = list => shuffle(list).map((l, i) => {
    const s = stats[l.key];
    return { l, i, p: !s ? 1 : s.rating === "again" ? 0 : s.rating === "ok" ? 2 : s.rating === "clear" ? 3 : 1, t: s ? s.last || 0 : 0 };
  }).sort((a, b) => a.p - b.p || a.t - b.t || a.i - b.i).map(x => x.l);
  const sents = order(data.sentences.filter(l => inLevel(l) && !skip.includes(l.key)));
  const chunks = order(data.readings.filter(r => level === "all" || levelNum(r.level) === level)
    .map(r => { const c = chunkLines(r).filter(l => !skip.includes(l.key)); return c.length ? pick(c) : null; }).filter(Boolean));
  const out = [];
  let i = 0, j = 0;
  while ((i < sents.length || j < chunks.length) && out.length < 80) {
    for (let k = 0; k < 2 && i < sents.length; k++) out.push(sents[i++]);
    if (j < chunks.length) out.push(chunks[j++]);
  }
  return out;
}

// ------------------------------------------------------------------ 1. the guided protocol (§5.4)
const STEPS = [
  { key: "listen", n: 3, gap: 1.2, text: "peek", zh: "聽", en: "Listen", title: ["聽三次", "Listen ×3"],
    tip: ["先只用耳朵聽：注意聲調、停頓和語氣。每次播完會停一下，在心裡跟著唸。", "Just listen: tones, pauses, melody. After each play there is a pause to echo it in your head."] },
  { key: "mumble", n: 2, gap: 0.6, text: "peek", zh: "哼", en: "Mumble", title: ["小聲跟著哼兩次", "Mumble along ×2"],
    tip: ["跟著聲音小聲地哼，抓住節奏和音高，字不必每個都清楚。", "Mumble quietly with the audio: catch the rhythm and pitch, not every sound."] },
  { key: "script", n: 2, gap: 0.6, text: "show", zh: "看稿", en: "Script", title: ["看著稿子跟讀兩次", "Shadow with the script ×2"],
    tip: ["看著文字，跟著聲音同時說出來，大約慢半拍。", "Read along and speak with the audio, about half a beat behind."] },
  { key: "blind", n: 2, gap: 0.6, text: "hide", zh: "不看稿", en: "Blind", title: ["不看稿跟讀兩次", "Shadow blind ×2"],
    tip: ["文字藏起來了：只靠耳朵，跟著聲音說。", "The text is hidden: shadow by ear alone."] },
  { key: "record", text: "show", zh: "錄音", en: "Record", title: ["錄音，和原音比較", "Record and compare"],
    tip: ["按「錄音」，自己說一次（不放原音），說完會自動停止。再聽自己的，和原音比一比。", "Tap Record and say the line on your own (no audio); it stops when you finish. Then compare yours with the original."] },
  { key: "rate", text: "show", zh: "自評", en: "Rate", title: ["自己評分", "Rate yourself"],
    tip: ["這一句說得怎麼樣？選「再練」的句子會更早再出現。", "How did it go? Lines you mark “again” come back sooner."] },
];

// opts: first (lines to do first), single (just first[0], untimed), minutes (timed session), level (auto-pick).
function startProtocol(panel, { first = [], single = false, minutes = null, level = "all" } = {}) {
  if (run) run.stop(true);
  stopPlayers(); stopAudio();
  try { audioContext(); } catch { /* no Web Audio: the overlay is skipped */ }
  const queue = single ? first.slice(0, 1) : [...first, ...autoQueue(level, first.map(l => l.key))];
  if (!queue.length) { toast("沒有可以練習的句子 No lines to practise"); return; }
  const totalReal = !single && minutes ? (minutes * 60) / FAST : null; // real seconds
  const S = { i: -1, line: null, player: null, next: null, step: 0, token: 0, take: null, mine: null, tk: null, ended: false, paused: false,
    timeUp: false, peek: false, done: [], takes: 0, ratings: { clear: 0, ok: 0, again: 0 }, ts: Date.now(), date: today(), noMic: canRecord ? "" : "unsupported",
    said: -1, held: [], timeUpNote: false, afterTake: null };
  const clock = { last: performance.now(), elapsed: 0, pending: 0, visible: document.visibilityState === "visible" };
  // the session logs its own time: pause the page clock first, then tick (it credits the page time up to the tap and
  // not the session's first seconds, which the session clock counts)
  pageClock.paused = true;
  pageTick();

  // ---- DOM
  clear(panel);
  const root = h("div", { class: "sh-run" + (single ? " single" : "") });
  const title = h("h2", { class: "sh-run-title", tabindex: "-1" });
  const timeEl = h("b");
  const timer = h("span", { class: "drill-timer sh-timer", role: "timer" },
    h("span", { class: "sh-timer-lbl" }, totalReal ? "剩下" : "已練", " ", h("span", { class: "sr-only", lang: "en" }, totalReal ? "time left" : "time practised")), timeEl);
  const pauseBtn = h("button", { type: "button", class: "btn small sh-pause", onclick: () => togglePause() });
  const overall = h("div", { class: "progress sh-overall", "aria-hidden": "true", hidden: !totalReal }, h("i", { style: "width:0%" }));
  const timeupNote = h("p", { class: "sh-timeup", hidden: true }, "時間到：做完這一句就結束。", en(" Time's up: the session ends after this line."));
  const srcRow = h("div", { class: "sh-src" });
  const textIn = h("div", { class: "sh-text-in" });
  const hiddenMsg = h("p", { class: "sh-hidden-msg" }, "文字藏起來了 ", en("Text hidden"));
  const peekBtn = h("button", { type: "button", class: "btn small sh-peek", onclick: () => { S.peek = !S.peek; paintText(); } });
  const textBox = h("div", { class: "sh-text" }, textIn, hiddenMsg);
  const stepItems = STEPS.map((st, i) => h("li", {}, h("span", { class: "n", "aria-hidden": "true" }, i + 1),
    h("span", { class: "zh" }, st.zh), h("span", { class: "en", lang: "en" }, st.en), h("span", { class: "sr-only st" })));
  const stepRail = h("ol", { class: "sh-steps", "aria-label": "步驟 Steps" }, stepItems);
  const stepHead = h("h3", { class: "sh-step-title" });
  const stepTip = h("p", { class: "sh-step-tip" });
  // what the step is doing, visible only: the per-play and per-pause counters would talk over the model; the
  // screen reader hears `live` (say() below), which waits until nothing plays
  const status = h("p", { class: "sh-status" });
  const gapBar = h("div", { class: "pause-bar sh-gap", "aria-hidden": "true" });
  const stepCtl = h("div", { class: "sh-step-ctl" });
  const nextBtn = h("button", { type: "button", class: "btn sh-next", onclick: () => nextStep() });
  const againBtn = h("button", { type: "button", class: "btn", onclick: () => againStep() }, "↻ ", ...bi("再一次", "Again"));
  const skipBtn = h("button", { type: "button", class: "btn", hidden: single, onclick: () => { resume(false); nextLine(); } }, "⏭ ", ...bi("換一句", "Skip line"));
  const endBtn = h("button", { type: "button", class: "btn", onclick: () => finish(false) }, "■ ", ...bi("結束", "End"));
  const live = h("p", { class: "sr-only", "aria-live": "polite" });
  const rate0 = prefs().rate;
  const speedBtns = RATES.map(r => h("button", { type: "button", "aria-pressed": String(Math.abs(r - rate0) < 0.001), "data-rate": String(r), onclick: () => setRate(r) }, `${r === 1 ? "1.0" : r}×`));
  root.append(
    h("div", { class: "sh-run-head" }, title, h("div", { class: "sh-run-head-r" }, timer, pauseBtn)),
    overall, timeupNote,
    h("div", { class: "card sh-line" }, srcRow, textBox, h("div", { class: "sh-line-foot" }, peekBtn,
      h("span", { class: "seg sh-speed", role: "group", "aria-label": "速度 Speed" }, speedBtns))),
    stepRail,
    h("section", { class: "card sh-stepbox", "aria-labelledby": "sh-step-h" }, stepHead, stepTip, status, gapBar, stepCtl),
    h("div", { class: "sh-foot" }, nextBtn, againBtn, skipBtn, endBtn), live);
  stepHead.id = "sh-step-h";
  panel.append(root);

  // ---- the screen-reader voice
  // `live` speaks only while nothing plays and no take records, so it never covers the model (or lands in a take):
  // say() holds its words until then. Each step is announced once: a looping step at its own end, together with the
  // step that Next leads to (the next one then starts silently); a quiet step (record, rate) as it starts unless the
  // step before already named it. The play / pause counters stay visual. Time's up waits for the next quiet moment.
  const busy = () => !!((S.player && S.player.state !== "idle") || (S.mine && S.mine.state !== "idle") || (S.tk && S.tk.busy));
  function say(...parts) { S.held.push(...(S.held.length ? [" "] : []), ...parts); sayHeld(); }
  function sayHeld() {
    if (S.ended || busy()) return;
    const parts = S.held.splice(0);
    if (S.timeUpNote) { S.timeUpNote = false; parts.push(...(parts.length ? [" "] : []), "時間到：做完這一句就結束。", en(" Time's up: the session ends after this line.")); }
    if (parts.length) live.replaceChildren(...parts);
  }
  const heard = new WeakSet();
  // a player going idle releases what was held (in a task: a step's own end message, written right after, comes first)
  const releaseOnIdle = p => {
    if (p && !heard.has(p)) { heard.add(p); p.addEventListener("state", () => { if (p.state === "idle") setTimeout(sayHeld, 0); }); }
    return p;
  };

  // ---- time
  function tick() {
    const now = performance.now(), dt = now - clock.last;
    clock.last = now;
    if (clock.visible && !S.paused && !S.ended && dt < 15000) { clock.elapsed += dt; clock.pending += dt; }
    clock.visible = document.visibilityState === "visible";
  }
  // Logged in pieces (logMinutes keeps 0.1 min); final: the page may be going away, so log any whole second left.
  function flush(final = false) {
    tick();
    const ms = clock.pending * FAST;
    if (ms >= (final ? 1000 : 6000)) { logMinutes("shadow", ms / 60000); clock.pending = 0; }
  }
  const simMinutes = () => round1((clock.elapsed * FAST) / 60000);
  function paint() {
    if (S.ended) return;
    tick();
    if (totalReal) {
      const left = Math.max(0, totalReal - clock.elapsed / 1000);
      timeEl.textContent = mmss(left * FAST);
      timer.classList.toggle("low", left * FAST <= 60);
      overall.firstChild.style.width = pct(clock.elapsed / 1000 / totalReal);
      if (left <= 0 && !S.timeUp) {
        S.timeUp = true;
        timeupNote.hidden = false;
        S.timeUpNote = true; // said now if all is quiet, else at the next quiet moment
        sayHeld();
        if (STEPS[S.step].key === "rate") setNext(false); // its label becomes "Finish without rating"
      }
    } else timeEl.textContent = mmss((clock.elapsed / 1000) * FAST);
    if (clock.pending * FAST >= 30000) flush();
  }
  const timerId = setInterval(paint, 250);
  const onVis = () => { if (document.visibilityState === "hidden") { flush(true); saveRecord(); } else tick(); };
  const onHide = () => { flush(true); saveRecord(); };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", onHide);

  // ---- the line
  function drawSource() {
    const line = S.line;
    put(srcRow, srcBadge(line.src),
      line.type === "moe" ? h("span", { class: "small muted sh-part" }, lineTitle(line).split(" · ")[1], " ", en(`${lineTitleEn(line)}${line.len ? ` · ${line.len.toFixed(1)} s` : ""}`)) : null,
      line.focus ? h("span", { class: "small muted sh-part" }, "練習重點 ", focusName(line.focus)[0], " ", en(`focus: ${focusName(line.focus)[1]}`)) : null);
  }
  function drawText() {
    const line = S.line, p = prefs();
    clear(textIn);
    textIn.append(h("p", { class: "sh-big" }, lineRuby(line, { zhuyin: p.zhuyin })));
    if (line.en && p.en) textIn.append(h("p", { class: "sh-en" }, en(line.en)));
    if (line.type === "moe" && line.seg !== 0) {
      // the script of a chunk is the entry text: the chunks are cut at pauses and do not line up with it exactly
      textIn.append(h("div", { class: "sh-script", lang: "zh-Hant-TW" }, line.reading.text.split("\n").map(t => h("p", {}, t))),
        h("p", { class: "small muted sh-script-note" }, "這一段是上面文字的一部分（依停頓切開，不一定完全對齊）。", en("This chunk is part of the text above (cut at pauses, so not aligned exactly).")));
    }
  }
  function paintText() {
    const st = STEPS[S.step];
    const hide = st.text === "hide" || (st.text === "peek" && !S.peek);
    textBox.classList.toggle("is-hidden", hide);
    hiddenMsg.hidden = !hide;
    peekBtn.hidden = st.text !== "peek";
    peekBtn.replaceChildren(...(S.peek ? ["🙈 ", ...bi("藏起文字", "Hide text")] : ["👁 ", ...bi("顯示文字", "Show text")]));
    peekBtn.setAttribute("aria-pressed", String(S.peek));
  }
  function paintSteps() {
    stepItems.forEach((li, i) => {
      li.className = i < S.step ? "done" : i === S.step ? "current" : "";
      if (i === S.step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      li.querySelector(".st").textContent = i < S.step ? "（完成 done）" : "";
    });
  }
  function paintPause() {
    pauseBtn.replaceChildren(...(S.paused ? ["▶ ", ...bi("繼續", "Resume")] : ["⏸ ", ...bi("暫停", "Pause")]));
    root.classList.toggle("paused", S.paused);
  }
  function setRate(r) {
    setPref("rate", r);
    for (const b of speedBtns) b.setAttribute("aria-pressed", String(Math.abs(Number(b.dataset.rate) - r) < 0.001));
    if (S.player) S.player.setRate(r);
    if (S.next) S.next.p.setRate(r);
  }
  function setNext(ready) {
    const st = STEPS[S.step];
    const lastLine = single || S.timeUp;
    const label = st.key === "rate" ? (lastLine ? ["✓ ", ...bi("完成，不評分", "Finish without rating")] : [...bi("不評分，下一句", "Next line, no rating"), " →"])
      : st.key === "record" ? [...bi("下一步：自評", "Next: rate"), " →"] : [...bi("下一步", "Next step"), " →"];
    nextBtn.replaceChildren(...label);
    nextBtn.className = "btn sh-next" + (ready ? " primary" : "");
  }
  // Stops whatever the current step is doing (the loop, a take playback); keepTake: a take in progress ends and is kept.
  function hush({ keepTake = false } = {}) {
    S.token++;
    S.held.length = 0; // words held for the step that is ending (the time's-up note stays)
    S.afterTake = null;
    if (S.player) S.player.stop();
    if (S.mine) S.mine.stop();
    if (S.tk) { if (keepTake) S.tk.stop(); else S.tk.cancel(); }
    clear(gapBar);
  }
  function resume(rerun = true) {
    if (!S.paused) return;
    S.paused = false;
    paintPause();
    if (rerun) runStep();
  }
  function togglePause() {
    if (S.ended) return;
    if (S.paused) { resume(true); return; }
    S.paused = true;
    hush({ keepTake: true });
    paintPause();
    status.replaceChildren("已暫停。", en(" Paused: the clock has stopped."));
    say("已暫停。", en(" Paused: the clock has stopped."));
  }
  function nextStep() {
    if (S.ended) return;
    const st = STEPS[S.step];
    if (st.key === "rate") { rate(null); return; }
    hush({ keepTake: true });
    S.paused = false; paintPause();
    S.step++;
    runStep();
  }
  function againStep() {
    if (S.ended) return;
    hush();
    S.paused = false; paintPause();
    runStep();
  }
  function runStep() {
    if (S.ended) return;
    const st = STEPS[S.step];
    const token = ++S.token;
    const hadFocus = stepCtl.contains(document.activeElement);
    paintSteps(); paintText();
    stepHead.replaceChildren(h("span", { class: "of" }, `${S.step + 1}／${STEPS.length}　`), st.title[0], " ", en(st.title[1], { class: "muted" }));
    stepTip.replaceChildren(st.tip[0], " ", en(st.tip[1], { class: "muted" }));
    clear(stepCtl); clear(gapBar); status.replaceChildren();
    // a looping step starts its audio now, so it is announced at its end (see say()); a quiet step now, once
    if (!st.n && S.said !== S.step) {
      say(`步驟 ${S.step + 1}：${st.title[0]}。`, en(` Step ${S.step + 1}: ${st.title[1]}.`),
        ...(st.key === "rate" ? (single || S.timeUp ? [" 評好就結束。", en(" Then the session ends.")]
          : [` 評好以後換下一句，從「${STEPS[0].title[0]}」開始。`, en(` Then the next line starts with ${STEPS[0].title[1]}.`)]) : []));
    }
    S.said = S.step;
    setNext(false);
    againBtn.hidden = !st.n;
    if (hadFocus || focusLost()) nextBtn.focus({ preventScroll: true });
    if (S.paused) { status.replaceChildren("已暫停。", en(" Paused.")); return; }
    if (st.n) loopStep(st, token);
    else if (st.key === "record") recordStep(token);
    else rateStep(hadFocus || document.activeElement === nextBtn);
  }

  // ---- steps 1-4: the player loops by itself
  async function loopStep(st, token) {
    const p = S.player;
    let res;
    try {
      res = await p.loop(st.n, { gap: st.gap / FAST, gapAfterLast: false, onEach: info => { if (token === S.token) onEach(st, info); } });
    } catch (err) {
      if (token === S.token && !S.ended) playFailed(err, token);
      return;
    }
    if (token !== S.token || S.ended) return;
    clear(gapBar);
    if (res.completed) {
      status.replaceChildren("✓ ", `${st.n} 次完成。按「下一步」。`, en(` Done ×${st.n}. Press Next step.`));
      // the one announcement of this step, and of the next (Next then starts it without a word over its audio)
      const nx = STEPS[S.step + 1];
      say(`✓ 步驟 ${S.step + 1}「${st.title[0]}」完成。`, nx ? `下一步：${nx.title[0]}。` : "",
        en(` Step ${S.step + 1}, ${st.title[1]}, done.${nx ? ` Next: ${nx.title[1]}.` : ""}`));
      if (nx) S.said = S.step + 1;
      setNext(true);
      const a = document.activeElement;
      if (focusLost() || a === nextBtn || a === againBtn || stepCtl.contains(a)) nextBtn.focus({ preventScroll: true });
    } else {
      status.replaceChildren("停了。", en(" Stopped: press Again to replay this step, or Next step."));
      say(`步驟 ${S.step + 1}「${st.title[0]}」停了。`, en(` Step ${S.step + 1}, ${st.title[1]}, stopped: press Again to replay it, or Next step.`));
    }
  }
  // visual only (status is not a live region): a counter per play and a cue per pause would talk over the audio
  function onEach(st, { index, times, phase, seconds }) {
    if (phase === "play") {
      clear(gapBar);
      status.replaceChildren("▶ ", `第 ${index + 1}／${times} 次`, en(` Play ${index + 1} of ${times}`));
      return;
    }
    status.replaceChildren(...(st.key === "listen" ? ["停一下：在心裡跟著唸。", en(" Pause: echo it in your head.")] : ["停一下，準備下一次。", en(" Pause, then again.")]));
    const fill = h("i", { style: `transition:width ${Math.max(0, seconds).toFixed(2)}s linear;width:0%` });
    clear(gapBar).append(fill);
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = "100%"; }));
  }
  function playFailed(err, token) {
    clear(gapBar);
    if (err && err.name === "NotAllowedError") {
      status.replaceChildren("瀏覽器擋住了自動播放：請按「播放」。", en(" The browser held back autoplay: press Play."));
      say("瀏覽器擋住了自動播放：請按「播放」。", en(" The browser held back autoplay: press Play."));
      const b = h("button", { type: "button", class: "btn primary", onclick: () => { if (token === S.token) runStep(); } }, "▶ ", ...bi("播放", "Play"));
      stepCtl.replaceChildren(b);
      b.focus({ preventScroll: true });
      return;
    }
    status.replaceChildren("無法播放這一句（離線，或沒有音檔）。", en(" Could not play this line (offline, or the audio is missing)."));
    say("無法播放這一句（離線，或沒有音檔）。", en(" Could not play this line (offline, or the audio is missing)."));
    if (!single) { skipBtn.classList.add("primary"); skipBtn.focus({ preventScroll: true }); }
  }

  // ---- step 5: record and compare
  function recordStep(token) {
    const line = S.line;
    if (S.noMic) {
      stepCtl.append(micNote(S.noMic));
      status.replaceChildren("沒辦法錄音：大聲說幾次，再進行自評。", en(" No recording here: say it aloud a few times, then rate yourself."));
      say("沒辦法錄音：大聲說幾次，再進行自評。", en(" No recording here: say it aloud a few times, then rate yourself."));
      setNext(true);
      return;
    }
    const model = line.contour || null;
    const syl = sylInfo(line);
    const recBtn = h("button", { type: "button", class: "btn primary rec-btn", onclick: () => (S.tk && S.tk.busy ? S.tk.stop() : startTake()) });
    const modelBtn = h("button", { type: "button", class: "btn", "aria-label": `原音 Original: ${lineTitle(line)} — ${SRC[line.src].label}`, onclick: () => playModel() }, "▶ ", ...bi("原音", "Original"));
    const mineBtn = h("button", { type: "button", class: "btn", disabled: !(S.take && S.take.line === line.key), "aria-label": `我的 Mine: ${lineTitle(line)} — my recording`, onclick: () => playMine() }, "▶ ", ...bi("我的", "Mine"));
    const scoreBox = h("div", { class: "mirror-score sh-score" }); // said through say(), after the take has played back
    const shape = h("p", { class: "muted small mirror-shape" });
    const ovBox = model ? h("div", { class: "overlay-box" }) : null;
    put(stepCtl, h("div", { class: "sh-rec-row" }, recBtn, modelBtn, mineBtn), scoreBox, ovBox, model ? shape : null,
      model ? (line.seg === 0 ? null : h("p", { class: "small muted" }, "片段的音節數是估計的，分數只是參考。", en("The chunk's syllable count is an estimate, so the score is a rough guide.")))
        : h("p", { class: "small muted sh-note" }, ...(line.src === "moe"
          ? bi("這一段沒有示範音高曲線（太長或量不到音高），請用耳朵比較。", "No model pitch curve for this part (too long, or no pitch measured): compare by ear.")
          : bi("合成語音（TTS）的語調不能當示範，所以這裡不畫音高曲線：請用耳朵比較兩個錄音。", "TTS intonation is not a model to copy, so there is no pitch curve here: compare the two by ear."))));
    if (ovBox) {
      drawOverlay(ovBox, { model, syllables: syl.list });
      const m = safeDescribe(model);
      shape.replaceChildren(m ? en(`Model ${m}.`) : "");
    }
    const setRec = on => {
      recBtn.classList.toggle("recording", on);
      recBtn.replaceChildren(...(on ? [h("span", { class: "rec-dot", "aria-hidden": "true" }), " ", ...bi("停止", "Stop")]
        : S.take && S.take.line === line.key ? ["↻ ", ...bi("再錄", "Record again")] : ["● ", ...bi("錄音", "Record")]));
      // nothing plays during a take: Original and Mine wait (playing would also end the take)
      modelBtn.disabled = on;
      mineBtn.disabled = on || !(S.take && S.take.line === line.key);
      if (on) {
        // visible only: a screen reader's speech would land in the take (and its level would end the take early)
        status.replaceChildren("錄音中…說完會自動停止。", en(" Recording… it stops by itself when you finish."));
        if (ovBox) { scoreBox.replaceChildren(); drawOverlay(ovBox, { model, syllables: syl.list }); } // a new take: the old curve goes
      }
    };
    setRec(false);
    status.replaceChildren("按「錄音」，自己說一次。", en(" Tap Record and say the line once on your own."));
    if (focusLost() || document.activeElement === nextBtn) recBtn.focus({ preventScroll: true });

    function playModel() {
      if (S.tk && S.tk.busy) return;
      S.player.play().catch(err => {
        if (err && err.name !== "NotAllowedError") { status.replaceChildren("無法播放原音。", en(" Could not play the original.")); say("無法播放原音。", en(" Could not play the original.")); }
      });
    }
    function playMine() {
      if (!(S.take && S.take.line === line.key)) return;
      if (S.tk && S.tk.busy) return; // a take is recording: playing would end it
      if (S.mine) S.mine.dispose();
      // keepMic: playing a take never stops a recorder (as in drills.js and the native check)
      S.mine = releaseOnIdle(watchPlaying(new ShadowPlayer({ src: S.take.blob, owner: root, keepMic: true })));
      S.mine.play().catch(() => { status.replaceChildren("無法播放錄音。", en(" Could not play the recording.")); say("無法播放錄音。", en(" Could not play the recording.")); });
    }
    async function startTake() {
      if (S.tk && S.tk.busy) return;
      if (S.mine) S.mine.stop();
      S.player.stop();
      const tk = S.tk = takeController(line, {
        // a take that ended releases what say() held, and tells the rate step (Next during the take) whether it came;
        // onTake runs right after onState(false), so the check waits a microtask
        onState: on => { setRec(on); if (!on) { queueMicrotask(() => { if (S.afterTake) S.afterTake(); }); setTimeout(sayHeld, 0); } },
        // the learner's curve while recording (LivePitch frames); the take is analysed again in full when it ends
        onLive: model ? frames => {
          if (token !== S.token || S.tk !== tk) return;
          let u = null;
          try { u = normalize(frames, { n: model.st.length }); } catch { /* not enough frames yet */ }
          if (u) drawOverlay(ovBox, { model, user: u, syllables: syl.list });
        } : null,
        onTake: (blob, liveP) => onTake(blob, liveP, tk),
        onError: err => {
          S.noMic = err && (err.name === "NotAllowedError" || err.name === "SecurityError") ? "denied" : "error";
          toast("需要麥克風權限 Microphone permission needed");
          if (token !== S.token) return;
          // the Record button (focused: it was just pressed) goes: focus moves to Next, and the reason is said
          clear(stepCtl).append(micNote(S.noMic));
          setNext(true);
          status.replaceChildren("沒辦法錄音：大聲說幾次，再進行自評。", en(" No recording here: say it aloud a few times, then rate yourself."));
          say(S.noMic === "denied" ? "沒有麥克風權限。" : "沒辦法錄音。", "大聲說幾次，再按「下一步：自評」。",
            en(` ${S.noMic === "denied" ? "Microphone permission was refused" : "Recording didn't start"}: say it aloud a few times, then press Next: rate.`));
          if (focusLost()) nextBtn.focus({ preventScroll: true });
        },
      });
      tk.start();
    }
    async function onTake(blob, liveP, tk) {
      if (S.ended || S.line !== line) return;
      S.take = { line: line.key, blob, ts: Date.now() };
      S.takes++;
      saveTake(line, blob, null, S.take.ts);
      if (token !== S.token || S.tk !== tk) return; // the step moved on (Next during the take): kept, not shown
      setRec(false);
      mineBtn.disabled = false;
      setNext(true);
      status.replaceChildren("聽聽自己的，再和原音比一比。", en(" Listen to yourself, then compare with the original."));
      playMine();
      // held while the take plays back
      say("錄好了。可以再聽「我的」和「原音」，或按「下一步：自評」。", en(" Take recorded. Compare Mine with the Original, or press Next: rate."));
      if (!model) return;
      scoreBox.replaceChildren(h("span", { class: "muted" }, "分析中… ", en("Analysing…")));
      const user = await userContour(blob, liveP, model.st.length);
      if (token !== S.token || S.ended) return;
      if (!user) {
        const online = await loadPitchy().then(() => true, () => false);
        const msg = () => (online ? bi("沒聽清楚：太短或太小聲。可以再錄一次。", "Too short or too quiet: record again if you like.")
          : bi("音高分析要先連上網路一次；可以先用耳朵比較。", "Pitch analysis needs the internet once; compare by ear for now."));
        if (token !== S.token || S.ended) return;
        scoreBox.replaceChildren(h("span", {}, ...msg()));
        say(...msg());
        return;
      }
      drawOverlay(ovBox, { model, user, syllables: syl.list });
      let cmp = null;
      try { cmp = compare(model, user, { syllables: syl.count }); } catch (err) { console.error(err); }
      const score = cmp && Number.isFinite(cmp.score) ? cmp.score : null;
      const gap = cmp && Number.isFinite(cmp.meanAbsSt) ? cmp.meanAbsSt : null;
      scoreBox.replaceChildren(...(score != null
        ? [h("span", { class: "num" }, score), h("span", { class: "of" }, "/100"), " ",
          h("span", { class: "small" }, "音高相似度", gap != null ? `・平均差 ${gap.toFixed(1)} 半音 ` : " ", en(`pitch match${gap != null ? `, mean gap ${gap.toFixed(1)} st` : ""}`))]
        : [h("span", {}, "沒辦法評分：", en(cmp && cmp.reason === "too short/quiet" ? "too short or too quiet; say the whole part." : (cmp && cmp.reason) || "no score."))]));
      if (score != null) say(`音高相似度 ${score}/100${gap != null ? `，平均差 ${gap.toFixed(1)} 半音` : ""}。`, en(` Pitch match ${score} of 100${gap != null ? `, mean gap ${gap.toFixed(1)} semitones` : ""}.`));
      else say("沒辦法評分。", en(` No score: ${cmp && cmp.reason === "too short/quiet" ? "too short or too quiet; say the whole part." : (cmp && cmp.reason) || "no score."}`));
      // the model's shape only: over a whole take the learner's line often ends in a tracker tail, and "you dip
      // 22 st" next to a 98 would read as a contradiction; the overlay shows the learner's curve
    }
  }
  function micNote(why) {
    return h("p", { class: "small mirror-nomic", role: "note" }, why === "denied" ? "沒有麥克風權限。" : "這裡不能錄音。", "大聲跟著說幾次，再自評。",
      en(` ${why === "denied" ? "Microphone permission was refused" : "Recording isn't available in this browser"}: say it aloud a few times, then rate yourself.`));
  }

  // ---- step 6: self-rate
  function rateStep(focusFirst) {
    status.replaceChildren();
    const btns = RATINGS.map(([k, zh, enS, hzh, hen]) => h("button", { type: "button", class: `sh-rate sh-rate-${k}`, onclick: () => rate(k) },
      h("span", { class: "sh-rate-zh" }, zh), h("span", { class: "sh-rate-en", lang: "en" }, enS), h("span", { class: "sh-rate-hint" }, hzh, " ", en(hen))));
    // "No take": only once no take is on its way. Next during a take ends it, and the recorder hands the take over a
    // moment later; the note waits for it (S.afterTake runs when the take controller is done).
    const noTake = h("p", { class: "small muted", hidden: true }, "這一句沒有錄音。", en(" No take for this line."));
    stepCtl.append(h("div", { class: "sh-rates", role: "group", "aria-label": "自評 Rate yourself" }, btns), noTake);
    const token = S.token;
    const check = () => { noTake.hidden = !!(S.take && S.take.line === S.line.key) || !!S.noMic || !!(S.tk && S.tk.busy); };
    check();
    S.afterTake = () => { if (token === S.token && noTake.isConnected) check(); };
    if (focusFirst) btns[0].focus({ preventScroll: true });
  }
  function rate(r) {
    if (S.ended) return;
    const line = S.line;
    const took = !!(S.take && S.take.line === line.key);
    if (r) {
      S.ratings[r]++;
      recordLineStat(line, r);
      if (took) saveTake(line, S.take.blob, r, S.take.ts);
    }
    S.done.push({ key: line.key, zh: line.zh, title: lineTitle(line), rating: r, took });
    saveRecord();
    nextLine();
  }

  // ---- lines
  function nextLine() {
    if (S.ended) return;
    hush();
    if (single && S.i >= 0) { finish(false); return; }
    if (S.timeUp) { finish(false); return; }
    if (S.player) { playing.delete(S.player); S.player.dispose(); }
    S.player = null;
    S.i++;
    if (S.i >= queue.length && !single) queue.push(...autoQueue(level)); // a small bank: go round again
    const line = queue[S.i];
    if (!line) { finish(false); return; }
    S.line = line;
    S.player = S.next && S.next.key === line.key ? S.next.p : makePlayer(line, root);
    if (S.next && S.next.p !== S.player) S.next.p.dispose();
    S.next = null;
    const nx = queue[S.i + 1];
    if (nx && !single) S.next = { key: nx.key, p: makePlayer(nx, root) }; // loaded ahead, so its first play starts inside the tap
    S.step = 0;
    S.said = -1;
    releaseOnIdle(S.player);
    S.paused = false; paintPause();
    skipBtn.classList.remove("primary");
    // never the line's text here: it would show through the steps that hide it
    put(title, single ? ["跟讀 ", en("Shadowing", { class: "muted" })] : [`第 ${S.done.length + 1} 句 `, en(`Line ${S.done.length + 1}`, { class: "muted" })]);
    drawSource(); drawText();
    const lost = focusLost() || stepCtl.contains(document.activeElement);
    runStep();
    if (lost) title.focus({ preventScroll: true });
  }

  // ---- end
  function saveRecord() {
    const minutesDone = simMinutes();
    if (minutesDone < 0.5 && !S.done.length && !S.takes) { dropSession(S.ts); return null; }
    // §6.7 (Foote & McDonough 2017): the weekly dose is 10-minute sessions with self-recording, so a take is needed too
    const rec = { ts: S.ts, date: S.date, minutes: minutesDone, planned: single ? null : minutes, lines: S.done.length, takes: S.takes,
      ratings: { ...S.ratings }, kind: single ? "line" : "timed", dose: minutesDone >= DOSE.minutes && S.takes > 0 };
    if (FAST > 1) rec.fast = true;
    upsertSession(rec);
    return rec;
  }
  function finish(quiet) {
    if (S.ended) return;
    flush(true);
    S.ended = true;
    S.token++;
    clearInterval(timerId);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onHide);
    if (S.tk) S.tk.cancel();
    for (const p of [S.player, S.next && S.next.p, S.mine]) if (p) { playing.delete(p); p.dispose(); }
    stopPlayers();
    pageClock.paused = false;
    pageClock.last = performance.now();
    pageClock.wasActive = pageActive(pageClock.last); // the page's own time runs again from here (the summary)
    const rec = saveRecord();
    if (run === ctl) run = null;
    if (quiet || !root.isConnected) return;
    stopAudio();
    summary(panel, rec, { single, line: S.line });
  }
  const ctl = { stop: quiet => finish(!!quiet) };
  run = ctl;
  paintPause();
  paint();
  nextLine();
  root.scrollIntoView({ block: "start", behavior: smooth() });
  title.focus({ preventScroll: true });
}
const safeDescribe = c => { try { return c ? describeContour(c) : ""; } catch { return ""; } };

// One take: start() asks for the microphone (from the Record button), stop() ends and keeps it, cancel() drops it.
// It stops by itself after a limit (twice the line plus 2 s) or once the voice has gone quiet for a while.
// MOE lines with a model contour also feed a LivePitch (the take is analysed again in full afterwards).
function takeController(line, { onState, onTake, onError, onLive = null }) {
  let rec = null, starting = false, cancelled = false, timers = [];
  const clearTimers = () => { for (const t of timers) { clearTimeout(t); clearInterval(t); } timers = []; };
  return {
    get busy() { return !!rec || starting; },
    async start() {
      if (rec || starting) return;
      starting = true; cancelled = false;
      onState(true);
      stopPlayers();
      stopAudio(); // nothing plays into the take, and only one recorder holds the microphone
      let live = null;
      if (line.contour) {
        const ok = await withTimeout(loadPitchy().then(() => true, () => false), 3000, false);
        if (cancelled) { starting = false; onState(false); return; }
        if (ok) { try { live = new LivePitch(); } catch (err) { console.error(err); } }
      }
      const r = new Recorder();
      const len = line.len || 3, rate = prefs().rate || 1;
      const quiet = len > 6 ? 2.2 : 1.3;               // a whole entry has its own pauses
      const vad = { loud: 0, lastLoud: null, lastT: null };
      r.onstopped = blob => {
        if (rec === r) rec = null;
        clearTimers();
        onState(false);
        if (cancelled || !blob || !blob.size) return;
        onTake(blob, live);
      };
      rec = r;
      let started = false;
      try {
        started = await r.start({ onFrame: (buf, sr, t) => {
          if (live) { try { live.push(buf, sr, t); } catch { /* keep recording */ } }
          // a simple level gate: speech heard for 0.3 s, then quiet for `quiet` s -> the take ends
          let sum = 0;
          for (let i = 0; i < buf.length; i += 4) sum += buf[i] * buf[i];
          const db = 10 * Math.log10(sum / Math.ceil(buf.length / 4) + 1e-12);
          if (vad.lastT != null && db > -42) { vad.loud += t - vad.lastT; vad.lastLoud = t; }
          vad.lastT = t;
          if (vad.loud >= 0.3 && vad.lastLoud != null && t - vad.lastLoud >= quiet && rec === r) r.stop();
        } });
      } catch (err) { if (rec === r) rec = null; starting = false; onState(false); onError(err); return; }
      starting = false;
      if (!started) { if (rec === r) rec = null; onState(false); return; }
      if (cancelled) { r.stop(); return; }
      timers.push(setTimeout(() => { if (rec === r) r.stop(); }, Math.round(1000 * Math.max(4, (2 * len) / rate + 2))));
      if (live && onLive) timers.push(setInterval(() => { if (rec === r) { try { onLive(live.frames); } catch (err) { console.error(err); } } }, 200));
    },
    stop() { if (rec) rec.stop(); else if (starting) cancelled = true; },
    cancel() { cancelled = true; clearTimers(); if (rec) rec.stop(); },
  };
}

function summary(panel, rec, { single, line }) {
  clear(panel);
  const w = weekInfo(0);
  const lines = rec ? rec.lines : 0;
  const card = h("section", { class: "card sh-summary", "aria-labelledby": "sh-sum-h" });
  const head = h("h2", { id: "sh-sum-h", tabindex: "-1" }, ...(rec && rec.lines ? ["✓ ", "跟讀完成 ", en("Shadowing done", { class: "muted" })] : ["練習結束 ", en("Session over", { class: "muted" })]));
  card.append(head);
  if (!rec) card.append(h("p", { class: "muted" }, "這次太短，沒有記錄。", en(" Too short to be recorded.")));
  else {
    const r = rec.ratings || {};
    card.append(h("dl", { class: "sh-sum-kv" },
      h("dt", {}, "時間 ", en("Time")), h("dd", {}, `${rec.minutes} 分鐘 `, en(`${rec.minutes} min${rec.fast ? " (simulated, ?fast=1)" : ""}`)),
      h("dt", {}, "句子 ", en("Lines")), h("dd", {}, String(lines)),
      h("dt", {}, "錄音 ", en("Takes")), h("dd", {}, String(rec.takes)),
      h("dt", {}, "自評 ", en("Ratings")), h("dd", {}, `清楚 ${r.clear || 0} · 還好 ${r.ok || 0} · 再練 ${r.again || 0}`)));
    // the dose (§6.7): 10 minutes or more with self-recording; say which part was missing
    const why = rec.dose ? ["這次算一次。", ` This one counts: ${w.dose} of ${DOSE.sessions} this week.`]
      : rec.minutes < DOSE.minutes ? [`不到 ${DOSE.minutes} 分鐘，這次不算進每週次數。`, ` Under ${DOSE.minutes} minutes, so it doesn't count toward the weekly dose: ${w.dose} of ${DOSE.sessions} this week.`]
      : [`${canRecord ? "這次沒有錄音" : "這個瀏覽器不能錄音"}，所以不算進每週次數（要 ${DOSE.minutes} 分鐘，並且自己錄音）。`,
        ` ${canRecord ? "No recording this time" : "This browser can't record"}, so it doesn't count toward the weekly dose (${DOSE.minutes} minutes with self-recording): ${w.dose} of ${DOSE.sessions} this week.`];
    card.append(h("p", { class: "sh-dose-line" }, doseDots(w.dose), " ", `${why[0]}本週 ${w.dose}/${DOSE.sessions} 次。`, en(why[1])));
  }
  card.append(h("div", { class: "row sh-sum-btns" },
    single && line ? h("button", { type: "button", class: "btn primary", onclick: () => startProtocol(panel, { first: [line], single: true }) }, "↻ ", ...bi("再練這一句", "This line again")) : null,
    h("button", { type: "button", class: single ? "btn" : "btn primary", onclick: () => { clear(panel); renderSession(panel); $("#sh-start-h", panel)?.focus({ preventScroll: true }); } },
      "▶ ", ...bi(single ? "計時練習" : "再練一輪", single ? "Timed session" : "New session")),
    h("button", { type: "button", class: "btn", onclick: () => ui.show("week") }, ...bi("看本週", "This week"))));
  panel.append(card);
  card.scrollIntoView({ block: "start", behavior: smooth() });
  head.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ 2. 句庫 Sentence bank
function matches(line, q) {
  const s = q.replace(/\s+/g, "");
  if (!s) return true;
  if (line.zh.includes(s)) return true;
  if (/[ㄅ-ㄯ]/.test(s)) {
    const z = String(line.zhuyin || "").replace(/\s+/g, "");
    return /[ˊˇˋ˙]/.test(s) ? z.includes(s) : z.replace(/[ˊˇˋ˙]/g, "").includes(s);
  }
  return /[a-z]/i.test(s) && String(line.en || "").toLowerCase().includes(q.trim().toLowerCase());
}
function renderBank(panel) {
  if (!data.sentences.length && !data.readings.length) { panel.append(notice("還沒有跟讀句子。", "No shadowing lines yet: run tools/build.py.")); return; }
  panel.append(h("p", { class: "muted small sh-lede" }, "點一句打開播放器：可以放慢、重複、設定 A–B。每一句都標出聲音來源。",
    en("Tap a line to open the player: slow it down, loop it, set A–B. Every line shows where its audio comes from.")));
  const input = h("input", { type: "search", class: "sh-search", lang: "zh-Hant-TW", value: bankState.q, autocomplete: "off", spellcheck: "false",
    placeholder: "早餐 · ㄗㄠˇ · breakfast", "aria-label": "搜尋：漢字、注音或英文 Search by characters, Zhuyin or English" });
  const levelSeg = h("div", { class: "seg", role: "group", "aria-label": "程度 Level" }, LEVELS.map(([id, zh, enS]) => h("button", { type: "button", "data-l": id, "aria-pressed": "false",
    onclick: () => { bankState.level = id; draw(); } }, zh, id === "all" ? [" ", h("span", { lang: "en" }, enS)] : null)));
  const focuses = [...new Set(data.sentences.map(l => l.focus).filter(Boolean))];
  const focusSel = h("select", { class: "sh-select", "aria-label": "練習重點 Focus" },
    h("option", { value: "" }, "全部重點 All focuses"),
    focuses.map(f => { const [zh, enS] = focusName(f); return h("option", { value: f, selected: f === bankState.focus }, `${zh} · ${enS}`); }));
  focusSel.addEventListener("change", () => { bankState.focus = focusSel.value; draw(); });
  const toggles = h("div", { class: "sh-toggles", role: "group", "aria-label": "顯示 Display" },
    prefSwitch("zhuyin", "注音", "Zhuyin", () => draw()), prefSwitch("en", "英文", "English", () => draw()), sandhiSwitch(() => draw()));
  const count = h("p", { class: "small muted sh-count", "aria-live": "polite" });
  const list = h("div", { class: "sh-bank" });
  const readBox = h("section", { class: "sh-bank-readings", "aria-labelledby": "sh-rd-h" });
  input.addEventListener("input", () => { bankState.q = input.value; bankState.open = null; draw(); });
  panel.append(h("div", { class: "sh-filters" }, input, h("div", { class: "row sh-filter-row" }, levelSeg, focuses.length ? focusSel : null)), toggles, count, list, readBox);
  let openPlayer = null;
  const closeOpen = () => { if (openPlayer) { playing.delete(openPlayer); openPlayer.dispose(); openPlayer = null; } };
  teardown.push(closeOpen);

  function draw() {
    for (const b of levelSeg.children) b.setAttribute("aria-pressed", String(b.dataset.l === bankState.level));
    const q = bankState.q.trim();
    const sents = data.sentences.filter(l => (bankState.level === "all" || levelNum(l.level) === bankState.level) && (!bankState.focus || l.focus === bankState.focus) && matches(l, q));
    const reads = bankState.focus ? [] : data.readings.filter(r => (bankState.level === "all" || levelNum(r.level) === bankState.level) && matches({ zh: r.zh, zhuyin: r.zhuyin, en: r.topic }, q));
    count.replaceChildren(`${sents.length} 句 · ${reads.length} 條教育部朗讀`, en(` ${sents.length} sentence${sents.length === 1 ? "" : "s"} · ${reads.length} MOE reading${reads.length === 1 ? "" : "s"}`));
    closeOpen();
    clear(list);
    const groups = new Map();
    for (const l of sents) { const k = levelNum(l.level) ? `第${levelNum(l.level)}級` : "其他"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
    for (const [k, ls] of [...groups.entries()].sort()) {
      list.append(h("h2", { class: "sh-group-h" }, k, k === "其他" ? [" ", en("Other")] : [" ", en(`Level ${k.replace(/\D/g, "")}`, { class: "muted" })]),
        h("ul", { class: "sh-rows" }, ls.map(l => bankRow(l))));
    }
    if (!sents.length) list.append(h("p", { class: "muted" }, "沒有符合的句子。", en(" No sentences match.")));
    clear(readBox);
    if (reads.length) {
      readBox.append(h("h2", { id: "sh-rd-h", class: "sh-group-h" }, "教育部朗讀 ", en("MOE dictionary readings", { class: "muted" })),
        h("p", { class: "small muted" }, "教育部辭典的整條朗讀（詞、解釋、例句），真人發音。點一個詞打開。", en("Whole dictionary entries (word, definition, example) read by the MOE announcer. Tap one to open it.")));
      const topics = new Map();
      for (const r of reads) { const t = r.topic || "其他"; if (!topics.has(t)) topics.set(t, []); topics.get(t).push(r); }
      for (const [t, rs] of topics) {
        readBox.append(h("h3", { class: "sh-topic-h" }, enText(t)), h("ul", { class: "sh-chips" }, rs.map(r => h("li", {},
          h("button", { type: "button", class: "sh-chip", "aria-label": `${r.zh} ${r.zhuyin}, ${Math.round(r.dur)} s — MOE dictionary reading. 打開 Open`,
            onclick: () => { setPref("reading", r.id); ui.show("moe"); } },
          h("span", { class: "sh-chip-zh" }, ruby(r.zh, prefs().zhuyin ? r.zhuyin : "", { cls: "", spoken: r.spoken })), h("span", { class: "sh-chip-meta" }, `${Math.round(r.dur)} s`),
          h("span", { class: "badge human", "aria-hidden": "true", title: SRC.moe.label }, "MOE"))))));
      }
    }
  }
  function bankRow(l) {
    const st = lineStats()[l.key];
    const detail = h("div", { class: "sh-detail", hidden: true, id: `sh-d-${l.key}` });
    const btn = h("button", { type: "button", class: "sh-row-btn", "aria-expanded": "false", "aria-controls": `sh-d-${l.key}`, onclick: () => toggle(),
      "aria-label": `${l.zh}${l.en ? `, ${l.en}` : ""} — ${SRC[l.src].label}${st && st.rating ? `; last rated ${st.rating}` : ""}` },
      h("span", { class: "sh-row-zh" }, lineRuby(l)),
      prefs().en && l.en ? h("span", { class: "sh-row-en", lang: "en" }, l.en) : null,
      h("span", { class: "sh-row-close", "aria-hidden": "true" }, "▲ 收起 ", h("span", { lang: "en" }, "Close")), // open: the detail shows the text
      h("span", { class: "sh-row-meta" }, srcBadge(l.src, { label: false }),
        st && st.rating ? h("span", { class: `sh-pill r-${st.rating}` }, RATINGS.find(x => x[0] === st.rating)[1], h("span", { class: "sr-only", lang: "en" }, ` last rated ${st.rating}`)) : null));
    const li = h("li", { class: "sh-row" }, btn, detail);
    function toggle() {
      const open = btn.getAttribute("aria-expanded") === "true";
      for (const b of list.querySelectorAll('.sh-row-btn[aria-expanded="true"]')) { b.setAttribute("aria-expanded", "false"); const d = b.nextElementSibling; if (d) { clear(d); d.hidden = true; } }
      closeOpen();
      bankState.open = open ? null : l.key;
      if (open) return;
      btn.setAttribute("aria-expanded", "true");
      detail.hidden = false;
      lineDetail(detail, l);
    }
    if (bankState.open === l.key) queueMicrotask(() => toggle());
    return li;
  }
  function lineDetail(box, l) {
    const textBox = h("div", { class: "sh-detail-text" });
    const drawText = () => {
      const p = prefs();
      put(textBox, p.text ? h("p", { class: "sh-big" }, lineRuby(l, { zhuyin: p.zhuyin })) : h("p", { class: "sh-hidden-msg" }, "文字藏起來了 ", en("Text hidden")),
        p.en && l.en ? h("p", { class: "sh-en" }, en(l.en)) : null);
    };
    drawText();
    box.append(h("div", { class: "sh-detail-top" }, srcBadge(l.src),
      l.focus ? h("span", { class: "small muted" }, "練習重點 ", focusName(l.focus)[0], " ", en(`focus: ${focusName(l.focus)[1]}`)) : null,
      h("div", { class: "sh-toggles" }, prefSwitch("text", "文字", "Text", drawText))), textBox);
    if (l.src === "voice") {
      box.append(h("p", { class: "small muted" }, "這一句還沒有 TTS 音檔，用瀏覽器的語音（標示「瀏覽器語音」）。", en("No TTS file for this line yet: the browser's voice plays it (labelled).")),
        h("button", { type: "button", class: "btn", onclick: () => { stopPlayers(); speak(l.zh, { rate: 0.9 * prefs().rate }); } }, "▶ ", ...bi("播放", "Play")));
    } else {
      const p = makePlayer(l, box);
      openPlayer = p;
      p.addEventListener("rate", () => setPref("rate", p.rate));
      box.append(playerControls(p, { label: `${l.zh} — ${SRC[l.src].label}`, scope: box }));
    }
    box.append(h("div", { class: "row sh-detail-btns" }, h("button", { type: "button", class: "btn primary", onclick: () => practise(l) }, "● ", ...bi("練這一句", "Practise this"))));
  }
  draw();
}

// ------------------------------------------------------------------ 3. 教育部朗讀 MOE readings
function renderMoe(panel) {
  if (!data.readings.length) { panel.append(notice("還沒有教育部朗讀。", "No MOE dictionary readings yet: run tools/build.py.")); return; }
  panel.append(h("p", { class: "muted small sh-lede" }, "《國語辭典簡編本》整條詞條的真人朗讀：詞、解釋、例句。整個檔案照原樣播放，可以用片段或 A–B 重複其中一段。",
    en("Whole entries of the MOE Concise Dictionary read by its announcer: word, definition, example. The file plays as it is; loop any chunk or an A–B part.")));
  const byTopic = new Map();
  for (const r of data.readings) { const t = r.topic || "其他"; if (!byTopic.has(t)) byTopic.set(t, []); byTopic.get(t).push(r); }
  const order = [...byTopic.values()].flat();
  let cur = order.find(r => r.id === prefs().reading) || order[0];
  const sel = h("select", { class: "sh-select sh-reading-sel", "aria-label": "選一個詞條 Choose an entry" },
    [...byTopic.entries()].map(([t, rs]) => h("optgroup", { label: t }, rs.map(r => h("option", { value: r.id, selected: r === cur }, `${r.zh}　${r.zhuyin}`)))));
  const prev = h("button", { type: "button", class: "btn icon", "aria-label": "上一個 Previous entry", onclick: () => go(-1) }, "◀");
  const next = h("button", { type: "button", class: "btn icon", "aria-label": "下一個 Next entry", onclick: () => go(1) }, "▶");
  const view = h("div", { class: "sh-reading" });
  sel.addEventListener("change", () => { const r = order.find(x => x.id === sel.value); if (r) open(r); });
  panel.append(h("div", { class: "row sh-reading-nav" }, prev, sel, next), view);
  let player = null;
  const close = () => { if (player) { playing.delete(player); player.dispose(); player = null; } };
  teardown.push(close);
  function go(d) { const i = order.indexOf(cur); open(order[(i + d + order.length) % order.length]); }
  function open(r) {
    cur = r;
    setPref("reading", r.id);
    sel.value = r.id;
    close();
    stopAudio();
    clear(view);
    readingView(view, r);
  }
  function readingView(box, r) {
    const p = player = makePlayer(readingLine(r), box);
    p.addEventListener("rate", () => setPref("rate", p.rate));
    const bar = playerControls(p, { segments: r.segments, label: `${r.zh} — MOE dictionary reading`, scope: box });
    // not a live region (a chip press rewrites it just as the chip's audio starts): the practise button reads it
    const partLbl = h("span", { class: "small muted", id: "sh-part-lbl" });
    const part = () => {
      const s = p.start, e = p.end;
      const k = r.segments.findIndex(([a, b]) => Math.abs(a - s) < 0.011 && e != null && Math.abs(b - e) < 0.011);
      if (k >= 0) return { line: readingLine(r, k), zh: `片段 ${k + 1}`, en: `segment ${k + 1}` };
      if (s < 0.011 && e == null) return { line: readingLine(r), zh: "全文", en: "whole entry" };
      const end = e ?? r.dur;
      return { line: readingLine(r, null, [s, end]), zh: `A–B ${s.toFixed(1)}–${end.toFixed(1)} s`, en: "A–B part" };
    };
    const paintPart = () => { const x = part(); partLbl.replaceChildren("要練的：", x.zh, " ", en(`to practise: ${x.en}${x.line.contour ? " (with a pitch curve)" : ""}`)); };
    p.addEventListener("range", paintPart);
    const textLines = r.text ? r.text.split("\n") : [];
    box.append(
      h("div", { class: "sh-reading-head" },
        h("p", { class: "sh-reading-word" }, ruby(r.zh, r.zhuyin, { cls: "", spoken: r.spoken })),
        h("p", { class: "small muted sh-reading-meta" }, [r.level, r.topic].filter(Boolean).join(" · "), r.level || r.topic ? " · " : "", `${r.dur.toFixed(1)} s`),
        srcBadge("moe")),
      textLines.length ? h("div", { class: "sh-entry", lang: "zh-Hant-TW" }, textLines.map(t => h("p", {}, t)))
        : h("p", { class: "muted small" }, "沒有詞條文字。", en(" No entry text.")),
      h("p", { class: "sh-attr small" }, h("span", { lang: "zh-Hant-TW" }, data.attribution), " ", h("span", { lang: "en" }, `(${LICENSE}; text and audio unmodified, format conversion only)`)),
      bar,
      h("p", { class: "small muted" }, "片段是依停頓自動切開的，和上面的文字不一定完全對齊。", en("The chunks are cut at the pauses, so they don't line up exactly with the text.")),
      h("div", { class: "row sh-detail-btns" }, h("button", { type: "button", class: "btn primary", "aria-describedby": "sh-part-lbl", onclick: () => practise(part().line) }, "● ", ...bi("練這一段", "Practise this part")), partLbl));
    paintPart();
  }
  open(cur);
}

// ------------------------------------------------------------------ 4. 母語者檢查 Native check (for NATIVE_CHECKER)
const KINDS = { shadow: ["跟讀", "shadowing"], mirror: ["鏡子", "pitch mirror"], syl: ["音節", "syllable"], sym: ["注音符號", "Zhuyin symbol"] };
const nativeState = { filter: "todo" };
async function nativeLookup() {
  const [tones, grid, audio, shadow] = await Promise.all([loadJSON("tones").catch(() => null), loadJSON("syllables").catch(() => null),
    loadJSON("audio").catch(() => ({})), loadJSON("shadowing").catch(() => null)]);
  const byId = new Map();
  const add = x => { if (x && x.id && x.zh && !byId.has(String(x.id))) byId.set(String(x.id), { zh: x.zh, zhuyin: x.zhuyin || "", spoken: x.spoken || null }); };
  if (tones) { arr(tones.pairs).forEach(add); arr(tones.sandhi && tones.sandhi.items).forEach(add); arr(tones.readings).forEach(add); arr(tones.id_pool).forEach(add); }
  arr(shadow && shadow.readings).forEach(add);
  const cells = (grid && grid.cells) || {};
  for (const [base, tonesOf] of Object.entries(cells)) for (const [t, c] of Object.entries(tonesOf || {})) {
    if (c && c.id && !byId.has(String(c.id))) byId.set(String(c.id), { zh: c.zh, zhuyin: Number(t) === 5 ? "˙" + base : base + ["", "", "ˊ", "ˇ", "ˋ"][Number(t)], spoken: null });
  }
  return { byId, cells, audio: audio || {} };
}
function describeRec(r, L) {
  const i = r.key.indexOf(":");
  const kind = r.key.slice(0, i), rest = r.key.slice(i + 1);
  const base = { key: r.key, ts: r.ts || 0, kind, blob: r.blob };
  if (kind === "shadow") {
    return { ...base, zh: r.zh || r.title || rest, zhuyin: r.zhuyin || "", spoken: r.spoken || null, title: r.title || r.zh || rest, model: r.model || null, whole: !r.zhuyin };
  }
  if (kind === "mirror") {
    const w = L.byId.get(rest);
    return { ...base, zh: w ? w.zh : rest, zhuyin: w ? w.zhuyin : "", spoken: w ? w.spoken : null, title: w ? w.zh : rest, model: { src: "span", id: rest }, whole: !w };
  }
  if (kind === "syl") {
    const c = (L.cells[baseOf(rest)] || {})[String(toneOf(rest))];
    return { ...base, zh: c ? c.zh : "", zhuyin: rest, spoken: null, title: c ? `${c.zh} ${rest}` : rest, model: c ? { src: "span", id: c.id } : null };
  }
  const a = L.audio[`juyin:${rest}`];
  return { ...base, zh: rest, zhuyin: rest, spoken: null, title: rest, symbol: true, model: a && a.path ? { src: "file", path: a.path } : null };
}
// The marks rows of a recording: one per syllable of its text, or one for the whole take when the text is not aligned.
function markRows(item) {
  if (item.symbol) return [{ syl: item.zhuyin, said: item.zhuyin, zh: item.zh, symbol: true }];
  if (item.whole || !item.zhuyin) return [{ syl: "", said: "", zh: "", whole: true }];
  const syls = syllables(item.zhuyin);
  const said = item.spoken && syllables(item.spoken).length === syls.length ? syllables(item.spoken) : syls;
  const chars = [...(item.zh || "")].filter(c => CJK.test(c));
  return syls.map((s, i) => ({ syl: s, said: said[i], zh: chars.length === syls.length ? chars[i] : "" }));
}
const checksAll = () => arr(store.get(KEY.checks, []));
function sylParts(syl) {
  const b = baseOf(syl || "");
  const i = INITIALS.includes(b[0]) ? b[0] : "";
  return { i, f: b.slice(i.length) };
}
// Most-missed initials, finals and tones over every check: a "sound" ✗ counts against the syllable's initial and its
// final (the checker marks the syllable, not its parts), a "tone" ✗ against the tone it should have been said with.
function nativeSummary(checks) {
  const ini = {}, fn = {}, tn = {};
  const add = (map, k, miss) => { if (!k) return; const e = map[k] || (map[k] = { n: 0, miss: 0 }); e.n++; if (miss) e.miss++; };
  for (const c of checks) for (const m of arr(c && c.marks)) {
    if (!m || !m.syl || m.whole) continue;
    if (m.sound === true || m.sound === false) { const { i, f } = sylParts(m.syl); add(ini, i, m.sound === false); add(fn, f, m.sound === false); }
    if (m.tone === true || m.tone === false) add(tn, String(toneOf(m.said || m.syl)), m.tone === false);
  }
  const top = map => Object.entries(map).filter(([, e]) => e.miss > 0).sort((a, b) => b[1].miss - a[1].miss || b[1].miss / b[1].n - a[1].miss / a[1].n).slice(0, 5);
  return { ini: top(ini), fin: top(fn), tone: top(tn) };
}
async function renderNative(panel) {
  panel.append(h("div", { class: "sh-native-intro" },
    h("h2", { class: "sh-native-h" }, "請幫我聽聽看"),
    h("p", { class: "sh-native-lede" }, "這些是我的錄音。請一個字一個字聽：發音對不對？聲調對不對？對就按 ✓，不對就按 ✗。"),
    h("p", { class: "small muted" }, en("Native check: hand this screen to a Taiwanese friend. They play each recording and tap ✓ / ✗ for the sound and the tone of every syllable. The marks go into your weak-spot data on this device."))));
  const box = h("div", { class: "sh-native" }, h("p", { class: "muted" }, "載入中… ", en("Loading…")));
  panel.append(box);
  let recs = null, L = null;
  try { [recs, L] = await Promise.all([listRecordings(), nativeLookup()]); } catch (err) { console.error(err); }
  if (!box.isConnected) return;
  if (!recs || !L) { clear(box).append(notice("無法讀取錄音。", "Couldn't read the recordings on this device (IndexedDB unavailable).")); return; }
  const items = recs.filter(r => r && r.blob && /^(shadow|mirror|syl|sym):/.test(r.key)).map(r => describeRec(r, L)).sort((a, b) => b.ts - a.ts);
  nativeList(box, items, L);
}
// How many checks heard the recording now stored under it.key. A key holds only its newest take, so a check counts
// when it names this take (c.take === it.ts); a check saved before takes were named counts when it is newer than the take.
function checksOfTake(checks) {
  const byKey = new Map();
  for (const c of checks) if (c && c.key) { if (!byKey.has(c.key)) byKey.set(c.key, []); byKey.get(c.key).push(c); }
  return it => (byKey.get(it.key) || []).filter(c => (c.take != null ? c.take === it.ts : (Number(c.ts) || 0) >= it.ts)).length;
}
function nativeList(box, items, L) {
  clear(box);
  const checks = checksAll();
  const nChecks = checksOfTake(checks);
  const checked = new Map(items.map(it => [it, nChecks(it)]));
  if (!items.length) {
    box.append(notice("還沒有錄音。", "No recordings yet: record in a shadowing session, the pitch mirror (Tone Gym) or the Zhuyin Lab first."));
  } else {
    const seg = h("div", { class: "seg sh-native-seg", role: "group", "aria-label": "顯示 Show" },
      [["todo", "還沒檢查", "Not checked"], ["all", "全部", "All"]].map(([id, zh, enS]) => h("button", { type: "button", "aria-pressed": String(nativeState.filter === id),
        onclick: () => { nativeState.filter = id; nativeList(box, items, L); } }, zh, " ", h("span", { lang: "en" }, enS))));
    const shown = items.filter(it => nativeState.filter === "all" || !checked.get(it));
    box.append(h("div", { class: "row sh-native-bar" }, seg, h("span", { class: "small muted" }, `${shown.length} / ${items.length} 個錄音 `, en("recordings"))));
    if (!shown.length) box.append(h("p", { class: "sh-native-done" }, "✓ 全部都檢查過了，謝謝！", en(" All checked. Thank you!")));
    box.append(h("ul", { class: "sh-native-list" }, shown.map(it => {
      const n = checked.get(it) || 0;
      const [kzh, ken] = KINDS[it.kind] || [it.kind, it.kind];
      return h("li", {}, h("button", { type: "button", class: "sh-native-item", onclick: () => nativeCheck(box, items, L, it) },
        h("span", { class: "sh-native-zh", lang: "zh-Hant-TW" }, it.symbol ? it.zh : it.zhuyin && !it.whole ? ruby(it.zh, it.zhuyin, { cls: "", spoken: it.spoken, sandhi: true }) : it.title),
        h("span", { class: "sh-native-meta" }, kzh, " ", h("span", { lang: "en", class: "muted" }, ken), " · ", new Date(it.ts).toLocaleDateString("zh-TW"),
          n ? h("span", { class: "sh-pill r-clear" }, `已檢查 ${n} 次`, h("span", { class: "sr-only", lang: "en" }, ` checked ${n}×`)) : null)));
    })));
  }
  // the summary: what the checker heard wrong most often
  const sum = nativeSummary(checks);
  const col = (zh, enS, rows, name) => h("div", { class: "sh-miss-col" }, h("h3", {}, zh, " ", en(enS, { class: "muted" })),
    rows.length ? h("ul", { class: "list-plain sh-miss" }, rows.map(([k, e]) => h("li", {}, h("span", { class: "sh-miss-k", lang: "zh-Hant-TW" }, name(k)),
      h("span", { class: "sh-miss-n" }, `${e.miss}/${e.n}`, h("span", { class: "sr-only", lang: "en" }, ` missed ${e.miss} of ${e.n}`)))))
      : h("p", { class: "small muted" }, "—"));
  box.append(h("section", { class: "sh-native-sum", "aria-labelledby": "sh-ns-h" },
    h("h2", { id: "sh-ns-h" }, "最常錯的 ", en("Most missed", { class: "muted" })),
    checks.length ? h("p", { class: "small muted" }, `共 ${checks.length} 次檢查。`, en(` ${checks.length} check${checks.length === 1 ? "" : "s"} so far. A sound ✗ counts against the syllable's initial and final.`))
      : h("p", { class: "small muted" }, "還沒有檢查紀錄。", en(" No checks yet.")),
    h("div", { class: "sh-miss-cols" }, col("聲母", "Initials", sum.ini, k => k), col("韻母", "Finals", sum.fin, k => k), col("聲調", "Tones", sum.tone, k => TONE_NAMES[k] || k))));
}
function nativeCheck(box, items, L, it) {
  stopPlayers(); stopAudio();
  clear(box);
  const rows = markRows(it);
  const marks = rows.map(() => ({ sound: null, tone: null }));
  let recPlayer = null, modelPlayer = null;
  const closePlayers = () => { for (const p of [recPlayer, modelPlayer]) if (p) { playing.delete(p); p.dispose(); } recPlayer = modelPlayer = null; };
  teardown.push(closePlayers);
  const playRec = () => {
    stopPlayers(); stopAudio();
    if (!recPlayer) recPlayer = watchPlaying(new ShadowPlayer({ src: it.blob, owner: box, keepMic: true }));
    recPlayer.play().catch(() => toast("無法播放 Could not play"));
  };
  const playModel = () => {
    const m = it.model;
    stopPlayers(); stopAudio();
    if (!m) return;
    if (m.src === "span") { playMoe(m.id).catch(() => toast("無法播放 Could not play")); return; }
    if (m.src === "file") { playFile(m.path); return; }
    if (m.src === "voice") { speak(m.text || it.zh); return; }
    if (!modelPlayer) modelPlayer = watchPlaying(new ShadowPlayer({ src: m.src === "tts" ? m.path : null, id: m.src === "moe" ? m.id : null, start: m.start || 0, end: m.end ?? null, owner: box, keepMic: true }));
    modelPlayer.play().catch(() => toast("無法播放 Could not play"));
  };
  const [kzh, ken] = KINDS[it.kind] || [it.kind, it.kind];
  const idx = items.indexOf(it);
  const msg = h("p", { class: "sh-native-msg", "aria-live": "polite" });
  const head = h("h2", { class: "sh-native-h", tabindex: "-1" }, `錄音 ${idx + 1}／${items.length}　`, h("span", { class: "muted small" }, kzh, " ", en(ken)));
  const word = it.symbol ? h("span", { lang: "zh-Hant-TW" }, it.zh) : it.zhuyin && !it.whole ? ruby(it.zh, it.zhuyin, { cls: "", spoken: it.spoken, sandhi: true }) : h("span", { lang: "zh-Hant-TW" }, it.title);
  const toggles = [];
  const rowEls = rows.map((r, i) => {
    const pair = what => {
      const yes = h("button", { type: "button", class: "sh-mark yes", "aria-pressed": "false", onclick: () => set(i, what, true) }, "✓", h("span", { class: "sr-only" }, what === "sound" ? "發音正確 sound right" : "聲調正確 tone right"));
      const no = h("button", { type: "button", class: "sh-mark no", "aria-pressed": "false", onclick: () => set(i, what, false) }, "✗", h("span", { class: "sr-only" }, what === "sound" ? "發音不對 sound wrong" : "聲調不對 tone wrong"));
      toggles.push({ i, what, yes, no });
      return h("div", { class: "sh-mark-pair", role: "group", "aria-label": `${r.whole ? "整段" : r.zh || r.syl} ${what === "sound" ? "發音 sound" : "聲調 tone"}` },
        h("span", { class: "sh-mark-lbl" }, what === "sound" ? "發音" : "聲調"), yes, no);
    };
    return h("li", { class: "sh-mark-row" },
      h("span", { class: "sh-mark-syl", lang: "zh-Hant-TW" }, r.whole ? h("span", {}, "整段", h("span", { class: "small muted", lang: "en" }, " whole take"))
        : [r.zh && !r.symbol ? h("span", { class: "sh-mark-zh" }, r.zh) : null, h("span", { class: "sh-mark-z" }, r.said && r.said !== r.syl ? r.said : r.syl)]),
      pair("sound"), r.symbol ? null : pair("tone"));
  });
  function set(i, what, v) {
    marks[i][what] = marks[i][what] === v ? null : v;
    paint();
  }
  function paint() {
    for (const t of toggles) {
      const v = marks[t.i][t.what];
      t.yes.setAttribute("aria-pressed", String(v === true));
      t.no.setAttribute("aria-pressed", String(v === false));
    }
  }
  const allOk = h("button", { type: "button", class: "btn sh-native-allok", onclick: () => { marks.forEach((m, i) => { m.sound = true; if (!rows[i].symbol) m.tone = true; }); paint(); } }, "✓ 全部正確 ", en("All correct"));
  const save = h("button", { type: "button", class: "btn primary sh-native-save", onclick: () => doSave() }, "儲存，下一個 ", en("Save, next"));
  const skip = h("button", { type: "button", class: "btn sh-native-big", onclick: () => goNext() }, "跳過 ", en("Skip"));
  const back = h("button", { type: "button", class: "btn sh-native-big", onclick: () => { closePlayers(); nativeList(box, items, L); } }, "← 回列表 ", en("Back to the list"));
  box.append(head,
    h("p", { class: "sh-native-word" }, word),
    h("div", { class: "sh-native-play" },
      h("button", { type: "button", class: "btn primary sh-native-big", "aria-label": `播放錄音 Play the recording: ${it.title}`, onclick: playRec }, "▶ 聽錄音 ", en("Recording")),
      h("button", { type: "button", class: "btn sh-native-big", disabled: !it.model, "aria-label": `播放示範 Play the model: ${it.title}`, onclick: playModel }, "▶ 聽示範 ", en(it.model ? "Model" : "No model"))),
    h("p", { class: "small muted" }, rows.length > 1 ? "每個字：發音、聲調各按一下。沒把握可以不按。" : "整段聽起來：發音、聲調對嗎？", " ",
      en(rows.length > 1 ? "Each syllable: tap sound and tone. Leave it blank if unsure." : "The whole take: are the sounds and tones right?")),
    h("ol", { class: "sh-marks" }, rowEls),
    h("div", { class: "row sh-native-foot" }, allOk, save, skip, back), msg);
  paint();
  head.focus({ preventScroll: true });
  head.scrollIntoView({ block: "start", behavior: smooth() });
  playRec();
  function doSave() {
    if (!marks.some(m => m.sound != null || m.tone != null)) { msg.replaceChildren("請至少按一個 ✓ 或 ✗。", en(" Tap at least one ✓ or ✗.")); return; }
    const all = checksAll();
    all.push({ key: it.key, take: it.ts, date: today(), ts: Date.now(), zh: it.zh, zhuyin: it.zhuyin, kind: it.kind,
      marks: rows.map((r, i) => ({ syl: r.syl, said: r.said || r.syl, zh: r.zh || "", sound: marks[i].sound, tone: r.symbol ? null : marks[i].tone, ...(r.whole ? { whole: true } : {}) })) });
    store.set(KEY.checks, all.slice(-1000));
    toast("已儲存，謝謝！ Saved");
    goNext();
  }
  function goNext() {
    closePlayers();
    const nChecks = checksOfTake(checksAll());
    const after = items.slice(idx + 1).concat(items.slice(0, idx));
    const nx = after.find(x => nativeState.filter === "all" || !nChecks(x));
    if (nx && nx !== it) nativeCheck(box, items, L, nx); else { nativeList(box, items, L); $(".sh-native-bar button", box)?.focus({ preventScroll: true }); }
  }
}

// ------------------------------------------------------------------ 5. 本週 This week
function renderWeek(panel) {
  const weeks = [0, 1, 2, 3].map(weekInfo);
  const w = weeks[0];
  const md = d => `${d.getMonth() + 1}/${d.getDate()}`;
  const hero = h("section", { class: "card sh-week-hero", "aria-labelledby": "sh-wk-h" },
    h("h2", { id: "sh-wk-h" }, "本週 ", en(`This week (from ${md(w.start)})`, { class: "muted" })),
    h("div", { class: "sh-week-stats" },
      h("div", { class: "sh-stat" }, h("span", { class: "sh-stat-lbl" }, "10 分鐘跟讀（含錄音） ", en("10-min sessions with a recording")),
        h("span", { class: "sh-stat-val" }, `${w.dose}`, h("span", { class: "of" }, ` / ${DOSE.sessions}`)), doseDots(w.dose)),
      h("div", { class: "sh-stat" }, h("span", { class: "sh-stat-lbl" }, "跟讀時間 ", en("Minutes")),
        h("span", { class: "sh-stat-val" }, `${Math.round(w.minutes)}`, h("span", { class: "of" }, " 分鐘")))),
    h("p", { class: "small" }, w.dose >= DOSE.sessions ? ["✓ 本週的份量完成了。", en(" This week's dose is done.")]
      : [`還差 ${DOSE.sessions - w.dose} 次 10 分鐘（含錄音）。`, en(` ${DOSE.sessions - w.dose} more ten-minute session${DOSE.sessions - w.dose === 1 ? "" : "s"} (with a recording) to go.`)]),
    h("p", { class: "small muted" }, "研究（Foote & McDonough 2017）：每週至少 4 次、每次 10 分鐘、有自己錄音的跟讀，8 週後說得更清楚、更流利。",
      en("Foote & McDonough 2017: 8 weeks of shadowing, at least 4 × 10 min a week with self-recording, improved comprehensibility and fluency.")),
    w.fast ? h("p", { class: "small muted" }, `其中 ${w.fast} 次是測試模式。`, en(` ${w.fast} of these are ?fast=1 test sessions.`)) : null);
  // last 4 weeks: one column per week (minutes), with the dose (4 × 10 = 40 min) as a reference line
  const target = DOSE.sessions * DOSE.minutes;
  const max = Math.max(target, ...weeks.map(x => x.minutes)) * 1.12;
  const cols = weeks.slice().reverse().map((x, i, all) => {
    const label = i === all.length - 1 ? "本週" : md(x.start);
    const desc = `${md(x.start)} 那週：${Math.round(x.minutes)} 分鐘，${x.sessions.length} 次，${x.dose} 次達 10 分鐘並有錄音 — week of ${md(x.start)}: ${Math.round(x.minutes)} min, ${x.sessions.length} session${x.sessions.length === 1 ? "" : "s"}, ${x.dose} of 10 min or more with a recording`;
    return h("li", { class: "sh-col" + (i === all.length - 1 ? " now" : ""), tabindex: "0", title: desc, "aria-label": desc },
      h("span", { class: "sh-col-plot", "aria-hidden": "true" },
        h("span", { class: "sh-col-target", style: `bottom:${pct(target / max)}` }, i === 0 ? h("span", {}, `目標 ${target} 分`) : null),
        h("span", { class: "sh-col-bar", style: `height:${pct(x.minutes / max)}` }),
        h("span", { class: "sh-col-val", style: `bottom:${pct(x.minutes / max)}` }, String(Math.round(x.minutes)))),
      h("span", { class: "sh-col-lbl", "aria-hidden": "true" }, label),
      h("span", { class: "sh-col-n", "aria-hidden": "true" }, `${x.dose}/${DOSE.sessions} 次`));
  });
  const chart = h("section", { class: "card sh-week-chart", "aria-labelledby": "sh-wc-h" },
    h("h2", { id: "sh-wc-h" }, "最近 4 週 ", en("Last 4 weeks: minutes of shadowing", { class: "muted" })),
    h("ol", { class: "sh-cols", "aria-label": "每週分鐘數 Minutes per week" }, cols),
    h("p", { class: "small muted" }, `柱子：每週跟讀分鐘數；橫線：目標 ${target} 分鐘（4 × 10）；下面：達 10 分鐘、有錄音的次數。`,
      en(`Bars: minutes per week; line: the ${target}-minute dose (4 × 10); below: sessions of 10 minutes or more with a recording.`)));
  const recent = sessionLog().slice(-8).reverse();
  const list = h("section", { class: "sh-week-list", "aria-labelledby": "sh-wl-h" },
    h("h2", { id: "sh-wl-h" }, "最近的練習 ", en("Recent sessions", { class: "muted" })),
    recent.length ? h("ul", { class: "list-plain" }, recent.map(s => h("li", {},
      h("span", {}, s.date), h("span", { class: "muted small" }, `${s.minutes} 分鐘 · ${s.lines} 句 · 錄音 ${s.takes}`, en(` ${s.minutes} min · ${s.lines} line${s.lines === 1 ? "" : "s"} · ${s.takes} take${s.takes === 1 ? "" : "s"}`)),
      countsForDose(s) ? h("span", { class: "sh-pill r-clear", style: "margin-left:auto" }, "✓ 10 分鐘＋錄音", h("span", { class: "sr-only", lang: "en" }, " counts toward the dose")) : null,
      s.fast ? h("span", { class: "sh-pill" }, "test") : null)))
      : h("p", { class: "muted small" }, "還沒有練習紀錄。", en(" No sessions yet.")));
  panel.append(hero, chart, list,
    h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => ui.show("session") }, "▶ ", ...bi("開始練習", "Start a session"))));
}

main().catch(err => { app.append(h("p", { class: "feedback bad" }, "載入失敗 Could not load data: ", err.message)); console.error(err); });
