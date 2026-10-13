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
export const BUILT = ["home", "lab"]; // pages that exist so far (others show "coming soon")

// ---------- tiny DOM builder: h("div", {class: "x", onclick}, "text", child)
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
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
export function mountShell(active) {
  const link = n => h("a", { href: n.href, class: (n.id === active ? "active" : "") + (BUILT.includes(n.id) ? "" : " soon") }, h("span", { lang: "zh-Hant-TW" }, n.zh), " ", h("span", { class: "en" }, n.en));
  const top = h("header", { class: "topbar" },
    h("div", { class: "topbar-inner" },
      h("a", { class: "brand", href: "index.html", lang: "zh-Hant-TW" }, h("span", { class: "brand-mark", "aria-hidden": "true" }, "ㄅ"), "國語自學"),
      h("nav", { class: "topnav", "aria-label": "Main" }, NAV.map(link))));
  const more = NAV.filter(n => !PRIMARY.includes(n.id));
  const moreBtn = h("button", { type: "button", class: more.some(n => n.id === active) ? "active" : "", "aria-haspopup": "true", "aria-expanded": "false",
    onclick: () => openMore(more, active, moreBtn) }, h("span", { class: "ico", "aria-hidden": "true" }, "⋯"), "更多");
  const bar = h("nav", { class: "tabbar", "aria-label": "Main" },
    NAV.filter(n => PRIMARY.includes(n.id)).map(n => h("a", { href: n.href, class: n.id === active ? "active" : "" },
      h("span", { class: "ico", "aria-hidden": "true" }, n.ico), n.zh)), moreBtn);
  document.body.prepend(top);
  document.body.append(bar);
}
function openMore(items, active, btn) {
  const close = () => { sheet.remove(); back.remove(); btn.setAttribute("aria-expanded", "false"); btn.focus(); };
  const back = h("div", { class: "backdrop", onclick: close });
  const sheet = h("div", { class: "more-sheet", role: "dialog", "aria-label": "更多 More pages" },
    items.map(n => h("a", { href: n.href, class: n.id === active ? "active" : "" }, `${n.zh} ${n.en}`, BUILT.includes(n.id) ? "" : h("span", { class: "muted small" }, "　（尚未建置 coming soon）"))));
  document.body.append(back, sheet);
  btn.setAttribute("aria-expanded", "true");
  sheet.querySelector("a").focus();
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
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
export const settings = () => ({ ruby: "always", pinyin: false, english: true, sandhi: false, toneColours: false, speed: 1, ...store.get("settings", {}) });
export function setSetting(k, v) { store.set("settings", { ...settings(), [k]: v }); }

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

// <ruby>字<rt>ㄗˋ</rt></ruby> per character; zhuyin has one syllable per Chinese character.
export function ruby(zh, zhuyin, { cls = "zh" } = {}) {
  const el = h("span", { class: cls, lang: "zh-Hant-TW" });
  const syls = zhuyin ? syllables(zhuyin) : [];
  const chars = [...zh];
  const cjk = chars.filter(c => /[㐀-鿿豈-﫿]/.test(c));
  if (!syls.length || cjk.length !== syls.length) { el.textContent = zh; return el; }
  let i = 0;
  for (const c of chars) {
    if (/[㐀-鿿豈-﫿]/.test(c)) {
      el.append(h("ruby", {}, c, h("rp", {}, "("), h("rt", {}, syls[i++]), h("rp", {}, ")")));
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
    buffers.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); }).then(b => audioContext().decodeAudioData(b)));
  }
  return buffers.get(url);
}
let current = null; // {stop()}
export function stopAudio() {
  if (current) { try { current.stop(); } catch { /* ignore */ } current = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
// Play the headword span of an MOE clip with exact edges. Resolves when it ends.
export async function playMoe(id, { rate = 1, span = true } = {}) {
  await ready;
  const info = audioIndex[id];
  if (!info) throw new Error("no clip " + id);
  stopAudio();
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
  stopAudio();
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
  stopAudio();
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

export class Recorder {
  // Records with MediaRecorder and, in parallel, streams samples to onFrame(Float32Array, sampleRate) for pitch.
  async start({ onFrame } = {}) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.rec.start();
    this.t0 = performance.now();
    if (onFrame) {
      const c = audioContext();
      this.src = c.createMediaStreamSource(this.stream);
      this.an = c.createAnalyser(); this.an.fftSize = 2048;
      this.src.connect(this.an);
      const buf = new Float32Array(this.an.fftSize);
      const tick = () => { if (!this.rec || this.rec.state !== "recording") return; this.an.getFloatTimeDomainData(buf); onFrame(buf, c.sampleRate, (performance.now() - this.t0) / 1000); this.raf = requestAnimationFrame(tick); };
      this.raf = requestAnimationFrame(tick);
    }
  }
  stop() {
    return new Promise(resolve => {
      if (!this.rec) return resolve(null);
      cancelAnimationFrame(this.raf);
      this.rec.onstop = () => {
        this.stream.getTracks().forEach(t => t.stop());
        try { this.src && this.src.disconnect(); } catch { /* ignore */ }
        const blob = new Blob(this.chunks, { type: this.rec.mimeType || "audio/webm" });
        this.rec = null;
        resolve(blob);
      };
      this.rec.stop();
    });
  }
}

// Record / play-back pair with optional save key. Returns a <span class="rec">.
export function recordWidget({ key, label = "錄音 Record", onDone } = {}) {
  if (!canRecord) return h("span", { class: "muted small" }, "此瀏覽器不能錄音 Recording not supported here");
  const rec = new Recorder();
  let blob = null, url = null, recording = false;
  const play = h("button", { class: "btn small", type: "button", disabled: true, onclick: () => { if (url) playFile(url); } }, "▶ 我的 Mine");
  const btn = h("button", { class: "btn small", type: "button", "aria-pressed": "false", onclick: async () => {
    if (!recording) {
      try { await rec.start(); } catch { toast("需要麥克風權限 Microphone permission needed"); return; }
      recording = true; btn.textContent = "■ 停止 Stop"; btn.classList.add("recording"); btn.setAttribute("aria-pressed", "true");
    } else {
      blob = await rec.stop(); recording = false;
      btn.textContent = label; btn.classList.remove("recording"); btn.setAttribute("aria-pressed", "false");
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob); play.disabled = false;
      if (key) saveRecording(key, blob).catch(() => {});
      onDone && onDone(blob, url);
    }
  } }, label);
  if (key) loadRecording(key).then(r => { if (r && r.blob) { blob = r.blob; url = URL.createObjectURL(blob); play.disabled = false; } }).catch(() => {});
  return h("span", { class: "rec" }, btn, play);
}

// ---------- time on page (minutes studied), flushed while the tab is visible
export function trackTime(block) {
  let last = performance.now();
  const flush = () => {
    const now = performance.now();
    if (document.visibilityState === "visible") logMinutes(block, (now - last) / 60000);
    last = now;
  };
  setInterval(flush, 30000);
  document.addEventListener("visibilitychange", flush);
  window.addEventListener("pagehide", flush);
}
