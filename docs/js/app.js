// Shared helpers for every page: layout, storage, Zhuyin ruby, audio (MOE spans, handbook, TTS, browser voice),
// recording to IndexedDB, and live pitch via pitchy. No framework, no bundler.

const NAV = [
  { id: "home", href: "index.html", ico: "☀", zh: "今天", en: "Today" },
  { id: "lab", href: "lab.html", ico: "ㄅ", zh: "注音", en: "Zhuyin Lab" },
  { id: "tones", href: "tones.html", ico: "ˇ", zh: "聲調", en: "Tone Gym" },
  { id: "shadow", href: "shadow.html", ico: "⟲", zh: "跟讀", en: "Shadowing" },
  { id: "units", href: "units.html", ico: "課", zh: "課程", en: "Units" },
  { id: "library", href: "library.html", ico: "庫", zh: "資料庫", en: "Library" },
  { id: "plan", href: "plan.html", ico: "計", zh: "計畫", en: "Plan" },
  { id: "advanced", href: "advanced.html", ico: "進", zh: "進階", en: "Advanced" },
  { id: "settings", href: "settings.html", ico: "設", zh: "設定", en: "Settings" },
];
const PRIMARY = ["home", "lab", "tones", "shadow"];
export const BUILT = ["home", "lab", "tones"]; // pages that exist so far (others show "coming soon")

// ---------- tiny DOM builder: h("div", {class: "x", onclick}, "text", child)
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k.startsWith("aria-") && typeof v === "boolean") { el.setAttribute(k, String(v)); continue; } // ARIA wants "true"/"false"
    if (v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export function clear(el) { el.replaceChildren(); return el; }

// ---------- layout
const SOON = "尚未建置 coming soon";
const soonText = () => ["（", h("span", { lang: "zh-Hant-TW" }, "尚未建置"), " ", h("span", { lang: "en" }, "coming soon"), "）"];
const soonNote = () => h("span", { class: "muted small" }, "　", soonText());
// A NAV entry as a link, or, for a page not built yet, a disabled link with no href (same as the home page cards).
function navLink(n, active, kids, note) {
  if (!BUILT.includes(n.id)) return h("a", { role: "link", "aria-disabled": "true", class: "soon", title: SOON }, kids, note || h("span", { class: "sr-only" }, soonText()));
  return h("a", { href: n.href, class: n.id === active ? "active" : "", "aria-current": n.id === active ? "page" : null }, kids);
}
export function mountShell(active) {
  const label = n => [h("span", { lang: "zh-Hant-TW" }, n.zh), " ", h("span", { class: "en", lang: "en" }, n.en)];
  const top = h("header", { class: "topbar" },
    h("div", { class: "topbar-inner" },
      h("a", { class: "brand", href: "index.html", lang: "zh-Hant-TW" }, h("span", { class: "brand-mark", "aria-hidden": "true" }, "ㄅ"), "國語自學"),
      h("nav", { class: "topnav", "aria-label": "Main" }, NAV.map(n => navLink(n, active, label(n))))));
  const more = NAV.filter(n => !PRIMARY.includes(n.id));
  const moreBtn = h("button", { type: "button", class: more.some(n => n.id === active) ? "active" : "", "aria-haspopup": "true", "aria-expanded": "false",
    onclick: () => openMore(more, active, moreBtn) }, h("span", { class: "ico", "aria-hidden": "true" }, "⋯"), "更多");
  const bar = h("nav", { class: "tabbar", "aria-label": "Main" },
    NAV.filter(n => PRIMARY.includes(n.id)).map(n => navLink(n, active, [h("span", { class: "ico", "aria-hidden": "true" }, n.ico), n.zh])), moreBtn);
  document.body.prepend(top);
  document.body.append(bar);
}
function openMore(items, active, btn) {
  const esc = e => { if (e.key === "Escape") close(); };
  const close = () => { sheet.remove(); back.remove(); document.removeEventListener("keydown", esc); btn.setAttribute("aria-expanded", "false"); btn.focus(); };
  const back = h("div", { class: "backdrop", onclick: close });
  const sheet = h("div", { class: "more-sheet", role: "dialog", "aria-label": "更多 More pages", tabindex: "-1" },
    items.map(n => navLink(n, active, [h("span", { lang: "zh-Hant-TW" }, n.zh), " ", h("span", { lang: "en" }, n.en)], soonNote())));
  document.body.append(back, sheet);
  btn.setAttribute("aria-expanded", "true");
  (sheet.querySelector("a[href]") || sheet).focus(); // unbuilt entries are not focusable
  document.addEventListener("keydown", esc);
}

export function toast(msg, ms = 2400) {
  const t = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- storage (never throws)
const PREFIX = "gy.";
export const store = {
  get(key, fallback = null) {
    try { const raw = localStorage.getItem(PREFIX + key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* private mode */ } },
  remove(key) { try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ } },
  keys() { try { return Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).map(k => k.slice(PREFIX.length)); } catch { return []; } },
};
export const settings = () => ({ ruby: "always", pinyin: false, english: true, sandhi: false, toneColours: false, speed: 1, dailyMinutes: 30, ...store.get("settings", {}) });
export function setSetting(k, v) { store.set("settings", { ...settings(), [k]: v }); }

// The day the learner first opened the app (YYYY-MM-DD): Phase 0 "sound reset" runs its first 4 weeks (§8.1, §8.3).
export function startDate() {
  let d = store.get("startDate");
  if (!d) { d = today(); store.set("startDate", d); }
  return d;
}
export function daysSinceStart() {
  const [y, m, d] = startDate().split("-").map(Number);
  const now = new Date();
  return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y, m - 1, d)) / 86400000);
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// minutes studied per day per block, for the streak and weekly export
export function logMinutes(block, minutes) {
  const days = store.get("days", {});
  const day = days[today()] || {};
  day[block] = Math.round(((day[block] || 0) + minutes) * 10) / 10;
  days[today()] = day;
  store.set("days", days);
}
export function streak() {
  const days = store.get("days", {});
  const active = key => days[key] && Object.values(days[key]).some(v => v > 0);
  const d = new Date();
  const key = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  if (!active(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (active(key(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- data
const cache = {};
export function loadJSON(name) {
  if (!cache[name]) cache[name] = fetch(`data/${name}.json`, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); });
  return cache[name];
}
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ---------- Zhuyin helpers (mirror tools/moe.py)
export const TONE_MARKS = "ˊˇˋ˙";
export const INITIALS = [..."ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ"];
export const MEDIALS = [..."ㄧㄨㄩ"];
export const FINALS = [..."ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ"];
export const syllables = z => z.trim().split(/\s+/).filter(Boolean);
export const toneOf = s => s.startsWith("˙") ? 5 : ({ "ˊ": 2, "ˇ": 3, "ˋ": 4 })[s.at(-1)] || 1;
export const baseOf = s => s.replace(/^˙/, "").replace(/[ˊˇˋ]$/, "");
export const withTone = (b, t) => t === 5 ? "˙" + b : b + ["", "", "ˊ", "ˇ", "ˋ"][t];
export const TONE_NAMES = { 1: "一聲", 2: "二聲", 3: "三聲", 4: "四聲", 5: "輕聲" };
export const TONE_GLYPH = { 1: "ˉ", 2: "ˊ", 3: "ˇ", 4: "ˋ", 5: "˙" };

// English text whose Zhuyin/Chinese runs stay lang="zh-Hant-TW" (ground rule 2).
const ZH_RUN = /([\p{sc=Han}\p{sc=Bopomofo}ˇˊˋ˙]+(?:\s+[\p{sc=Han}\p{sc=Bopomofo}ˇˊˋ˙]+)*)/u;
export const enText = (text, attrs = {}) => h("span", { lang: "en", ...attrs }, String(text).split(ZH_RUN).map((part, i) => i % 2 ? h("span", { lang: "zh-Hant-TW" }, part) : part));
// "中文 English" label: the Chinese stays in the page language, the English gets lang="en". Spread it: h("p", {}, ...bi(a, b))
export const bi = (zh, en) => [zh, " ", enText(en)];

// <ruby>字<rt>ㄗˋ</rt></ruby> per character; zhuyin has one syllable per Chinese character.
// spoken: the same word with tone sandhi applied (from the build). When the "show sandhi" setting is on (or
// opts.sandhi is true), each syllable whose spoken tone differs shows the spoken form, marked with class "sandhi"
// and the written (base) form in its title (§6.4: store the base tone, overlay the spoken one).
export function ruby(zh, zhuyin, { cls = "zh", spoken = null, sandhi = null } = {}) {
  const el = h("span", { class: cls, lang: "zh-Hant-TW" });
  const syls = zhuyin ? syllables(zhuyin) : [];
  const chars = [...zh];
  const cjk = chars.filter(c => /[㐀-鿿豈-﫿]/.test(c));
  if (!syls.length || cjk.length !== syls.length) { el.textContent = zh; return el; }
  const said = spoken && (sandhi ?? settings().sandhi) ? syllables(spoken) : null;
  let i = 0;
  for (const c of chars) {
    if (/[㐀-鿿豈-﫿]/.test(c)) {
      const base = syls[i], alt = said && said[i] !== base ? said[i] : null;
      el.append(h("ruby", {}, c, h("rp", {}, "("), alt ? h("rt", { class: "sandhi", title: `寫作 written ${base}` }, alt) : h("rt", {}, base), h("rp", {}, ")")));
      i++;
    } else el.append(c);
  }
  return el;
}

// ---------- audio
let audioIndex = {};
const ready = loadJSON("audio").then(x => { audioIndex = x || {}; }).catch(() => {});
export const audioInfo = key => audioIndex[key];
let ctx = null;
export function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
const probe = document.createElement("audio");
const canOgg = !!probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') !== "";
export const moeUrl = id => `audio/moe/${id}.${canOgg ? "ogg" : "mp3"}`;
const buffers = new Map();
async function decode(url) {
  if (!buffers.has(url)) {
    buffers.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); }).then(b => audioContext().decodeAudioData(b))
      .catch(err => { buffers.delete(url); throw err; })); // a failed load (offline, 404) is retried next time
  }
  return buffers.get(url);
}
let current = null; // {stop()}
function stopPlayback() {
  if (current) { try { current.stop(); } catch { /* ignore */ } current = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
// Stop everything audible and release the microphone. Call it before removing a view (tab change, closing a detail).
export function stopAudio() {
  stopPlayback();
  stopRecorders();
}
// Play the headword span of an MOE clip with exact edges. Resolves when it ends.
export async function playMoe(id, { rate = 1, span = true } = {}) {
  await ready;
  const info = audioIndex[id];
  if (!info) throw new Error("no clip " + id);
  stopPlayback();
  const buf = await decode(moeUrl(id));
  const c = audioContext();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(c.destination);
  const start = span ? info.start : 0;
  const dur = span ? Math.max(0.05, info.end - info.start) : buf.duration;
  return new Promise(resolve => {
    src.onended = () => { if (current === me) current = null; resolve(); };
    const me = { stop: () => src.stop() };
    current = me;
    src.start(0, start, dur);
  });
}
export async function playFile(path, { rate = 1 } = {}) {
  stopPlayback();
  const a = new Audio(path);
  a.playbackRate = rate; a.preservesPitch = true;
  const me = { stop: () => a.pause() };
  current = me;
  return new Promise(resolve => { a.onended = a.onerror = () => { if (current === me) current = null; resolve(); }; a.play().catch(() => resolve()); });
}
function pickVoice() {
  const voices = speechSynthesis.getVoices().filter(v => /^(zh[-_](TW|Hant)|cmn[-_]TW)/i.test(v.lang) || /zh-TW|臺灣|台灣|Taiwan/i.test(v.name + v.lang));
  return voices.find(v => /natural|online|hsiao|yunjhe|meijia|google/i.test(v.name)) || voices[0] || null;
}
export const hasTwVoice = () => "speechSynthesis" in window && !!pickVoice();
export function speak(text, { rate = 0.9 } = {}) {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  stopPlayback();
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW"; u.rate = rate;
    const v = pickVoice(); if (v) u.voice = v;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
if ("speechSynthesis" in window) speechSynthesis.getVoices();

// One play button + its source badge. item: {id?, zh, audio?} — id = MOE clip, audio = "juyin:ㄅ" or a tts path.
export function playButton(item, { label = "🔊", rate = 1, badge = true, cls = "btn icon" } = {}) {
  const src = item.id ? "moe" : item.audio && audioIndex[item.audio] ? audioIndex[item.audio].src : item.audio?.startsWith("audio/tts/") ? "tts" : "voice";
  const names = { moe: "MOE human voice · 教育部真人發音", juyin: "MOE handbook · 教育部注音符號手冊", tts: "TTS (Google zh-TW)", voice: "Browser voice (no MOE clip)" };
  const btn = h("button", { class: cls, type: "button", title: names[src], "aria-label": `播放 Play ${item.zh || ""} — ${names[src]}`,
    onclick: async e => {
      e.stopPropagation();
      btn.classList.add("is-playing");
      try {
        if (item.id) await playMoe(item.id, { rate });
        else if (item.audio && audioIndex[item.audio]) await playFile(audioIndex[item.audio].path, { rate });
        else if (item.audio?.startsWith("audio/")) await playFile(item.audio, { rate });
        else await speak(item.zh, { rate: rate * 0.9 });
      } catch (err) { toast("無法播放 Could not play: " + (err.message || err)); }
      btn.classList.remove("is-playing");
    } }, label);
  if (!badge) return btn;
  const b = h("span", { class: "badge " + (src === "moe" || src === "juyin" ? "human" : src === "tts" ? "tts" : "none"), "aria-hidden": "true" },
    src === "moe" ? "MOE" : src === "juyin" ? "MOE 手冊" : src === "tts" ? "TTS" : "瀏覽器語音");
  return h("span", { class: "row", style: "gap:6px" }, btn, b);
}
export const sourceLabel = src => ({ moe: "MOE human voice", juyin: "MOE handbook", tts: "TTS", voice: "browser voice" })[src] || src;

// ---------- recordings (IndexedDB; nothing leaves the device)
export const canRecord = !!(navigator.mediaDevices && window.MediaRecorder);
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("guoyu", 1);
    req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains("rec")) d.createObjectStore("rec", { keyPath: "key" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function saveRecording(key, blob, meta = {}) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("rec", "readwrite");
    tx.objectStore("rec").put({ key, blob, ts: Date.now(), ...meta });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}
export async function loadRecording(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction("rec").objectStore("rec").get(key);
    req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
  });
}
export async function listRecordings() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction("rec").objectStore("rec").getAll();
    req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error);
  });
}

const liveRecorders = new Set(); // recorders holding the microphone (or waiting for permission)
export function stopRecorders() { for (const r of [...liveRecorders]) r.stop(); }

export class Recorder {
  // Records with MediaRecorder and, in parallel, streams samples to onFrame(Float32Array, sampleRate) for pitch.
  // Resolves true when recording started, false when stop() ran while the permission prompt was open.
  // onstopped(blob), if set, runs however the recording ends (own Stop button or stopRecorders()).
  get recording() { return !!this.rec; }
  async start({ onFrame } = {}) {
    liveRecorders.add(this);
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (err) { liveRecorders.delete(this); throw err; }
    if (!liveRecorders.has(this)) { stream.getTracks().forEach(t => t.stop()); return false; }
    this.stream = stream;
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.rec.start();
    this.t0 = performance.now();
    if (onFrame) {
      const c = audioContext();
      this.src = c.createMediaStreamSource(this.stream);
      this.an = c.createAnalyser();
      // window long enough for a low voice at the device rate: 2048 at 44.1/48 kHz, 4096 at 96 kHz ... (pitch.js frameSize)
      this.an.fftSize = Math.min(32768, 2048 * 2 ** Math.max(0, Math.round(Math.log2(c.sampleRate / 48000))));
      this.src.connect(this.an);
      const buf = new Float32Array(this.an.fftSize);
      const tick = () => { if (!this.rec || this.rec.state !== "recording") return; this.an.getFloatTimeDomainData(buf); onFrame(buf, c.sampleRate, (performance.now() - this.t0) / 1000); this.raf = requestAnimationFrame(tick); };
      this.raf = requestAnimationFrame(tick);
    }
    return true;
  }
  stop() {
    liveRecorders.delete(this);
    if (!this.rec) return Promise.resolve(null);
    return this.stopping ||= new Promise(resolve => {
      cancelAnimationFrame(this.raf);
      this.rec.onstop = () => {
        this.stream.getTracks().forEach(t => t.stop());
        try { this.src && this.src.disconnect(); } catch { /* ignore */ }
        const blob = new Blob(this.chunks, { type: this.rec.mimeType || "audio/webm" });
        this.rec = null; this.stopping = null;
        if (this.onstopped) this.onstopped(blob);
        resolve(blob);
      };
      this.rec.stop();
    });
  }
}

// Record / play-back pair with optional save key. Returns a <span class="rec">.
// A take cut short by stopAudio() (tab change, detail closed) or by the widget leaving the page is kept
// like one stopped with the button.
export function recordWidget({ key, label = "錄音 Record", onDone } = {}) {
  if (!canRecord) return h("span", { class: "muted small" }, h("span", { lang: "zh-Hant-TW" }, "此瀏覽器不能錄音"), " ", h("span", { lang: "en" }, "Recording not supported here"));
  const rec = new Recorder();
  let url = null, starting = false, watch = null;
  const play = h("button", { class: "btn small", type: "button", disabled: true, onclick: () => { if (url) playFile(url); } }, "▶ 我的 Mine");
  const btn = h("button", { class: "btn small", type: "button", "aria-pressed": "false", onclick: async () => {
    if (rec.recording) { rec.stop(); return; }
    if (starting) return; // permission prompt still open
    starting = true;
    watchDetach();
    try { if (await rec.start()) setRecording(true); else unwatch(); } catch { unwatch(); toast("需要麥克風權限 Microphone permission needed"); }
    starting = false;
  } }, label);
  const wrap = h("span", { class: "rec" }, btn, play);
  // From Record until the take ends: if a view is cleared without stopAudio(), the detached widget stops its own recorder.
  const unwatch = () => { if (watch) { watch.disconnect(); watch = null; } };
  const watchDetach = () => {
    if (watch || typeof MutationObserver === "undefined") return;
    watch = new MutationObserver(() => { if (!wrap.isConnected) { unwatch(); rec.stop(); } });
    watch.observe(document, { childList: true, subtree: true });
  };
  const setRecording = on => { btn.textContent = on ? "■ 停止 Stop" : label; btn.classList.toggle("recording", on); btn.setAttribute("aria-pressed", String(on)); };
  rec.onstopped = blob => {
    unwatch();
    setRecording(false);
    if (!blob.size) return;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob); play.disabled = false;
    if (key) saveRecording(key, blob).catch(() => {});
    onDone && onDone(blob, url);
  };
  if (key) loadRecording(key).then(r => { if (r && r.blob && !url) { url = URL.createObjectURL(r.blob); play.disabled = false; } }).catch(() => {});
  return wrap;
}

// ---------- time on page (minutes studied): only spans during which the tab was visible count
export function trackTime(block) {
  let last = performance.now(), wasVisible = document.visibilityState === "visible";
  const flush = () => {
    const now = performance.now();
    // A tick is 30 s; a longer visible span means the machine slept without a visibilitychange, so cap it.
    if (wasVisible) logMinutes(block, Math.min(now - last, 60000) / 60000);
    last = now;
    wasVisible = document.visibilityState === "visible";
  };
  setInterval(flush, 30000);
  document.addEventListener("visibilitychange", flush);
  window.addEventListener("pagehide", flush);
}
