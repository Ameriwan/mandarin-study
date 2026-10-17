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
// pages that exist so far (others show "coming soon")
export const BUILT = ["home", "lab", "tones", "shadow", "units", "library", "plan", "advanced", "settings"];

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
  document.documentElement.dataset.page = active; // style.css scopes the display settings by page (html[data-page])
  applyDisplay();
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
export const settings = () => ({ ruby: "always", pinyin: false, english: true, sandhi: false, toneColours: false, immersion: false, speed: 1,
  dailyMinutes: 30, ...store.get("settings", {}) });
export function setSetting(k, v) { store.set("settings", { ...settings(), [k]: v }); applyDisplay(); }
// Settings › Default speed (0.75 / 0.9 / 1.0): what playMoe, playFile, playButton and speak start at when the caller
// passes no rate (pages with their own speed control pass theirs, and start it from this).
export const defaultRate = (s = settings()) => { const r = Number(s && s.speed); return r >= 0.5 && r <= 2 ? r : 1; };

// ---------- display settings (§5 display rules, §5.9; M6 design): one place decides, every page follows.
// applyDisplay() runs when this module loads, in mountShell, after setSetting and when another tab changes the
// settings. It sets classes on <html> that style.css acts on:
//   immersion          Chinese-only interface: interface English runs ([lang="en"]) are hidden; learning-content
//                      translations stay and follow the English switch; a control never loses its visible name
//                      (keepNames below gives back the English of a control that has nothing else to show)
//   set-ruby-off/new   Zhuyin off / only on words not marked "known" in the Library, for every ruby() made with the
//                      setting (pages and widgets that run their own Zhuyin switch are exempt in style.css)
//   set-no-en          English translations of learning content hidden (pages with their own English switch read
//                      showEnglish() as its default)
//   set-pinyin         pinyin aids shown (off by default)
//   set-tone-colours   Zhuyin coloured by tone (off by default; ruby() tags every syllable t1..t5)
//   set-sandhi         the spoken-tone overlay is on (ruby() draws it)
// Zhuyin mode of the setting: "always" | "new" | "off" (older or page-local spellings are accepted).
export function rubyMode(s = settings()) {
  const r = String(s && s.ruby);
  if (s && s.ruby === false) return "off";
  if (/^(off|never|none|hide)$/i.test(r)) return "off";
  if (/^new/i.test(r)) return "new";
  return "always";
}
export const showEnglish = (s = settings()) => !s || s.english !== false;
export const showPinyin = (s = settings()) => !!(s && s.pinyin);
export function applyDisplay(s = settings()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement, mode = rubyMode(s);
  const set = (cls, on) => root.classList.toggle(cls, !!on);
  set("immersion", s.immersion);
  set("set-ruby-off", mode === "off");
  set("set-ruby-new", mode === "new");
  set("set-no-en", !showEnglish(s));
  set("set-pinyin", showPinyin(s));
  set("set-tone-colours", s.toneColours);
  set("set-sandhi", s.sandhi);
  if (s.immersion) startKeepNames(); else stopKeepNames();
}

// Immersion: hide interface English but never leave a control or a label without a visible name. A button, link,
// label, heading … whose visible text would be English only (an English-only answer option, "Anki", a link named by
// its site) keeps its English runs (class "imm-keep"). Runs on the page and on everything added later.
const NAMED = "button, a, label, summary, legend, caption, th, dt, h1, h2, h3, h4, [role=button], [role=link], [role=tab], [role=switch], "
  + "[role=checkbox], [role=radio], [role=menuitem], [role=option], [role=columnheader], [role=rowheader]";
// English that immersion leaves alone: kept names, and learning-content English (class "lc-en": translations, glosses,
// quiz questions and answer options, lesson explanations; older page classes below), which follows only the English
// switch. Keep this list in step with the immersion rule in style.css.
export const IMM_SHOWN = ".imm-keep, .lc-en, .adv-name, .gloss, .tr, .lib-gloss, .lib-row-en, .lib-ex-en, .tc-gloss, .tg-word-en, .sd-en, "
  + ".drill-gloss, .example > .en, .choice > .en, .un-line-en, .un-v-en, .un-g-en, .un-sh-en, .un-task-en, .sh-en, .sh-row-en";
const LETTER = /[\p{L}\p{N}]/u;
function hiddenInImmersion(node, stop) {
  for (let a = node; a && a !== stop; a = a.parentElement) {
    if (a.matches(".sr-only, [hidden]")) return true; // not visible in any mode
    if (a.matches('[lang="en"]') && !a.closest(IMM_SHOWN)) return true;
  }
  return false;
}
function keepName(el) {
  const self = el.matches('[lang="en"]'); // a control that is itself marked English (its whole name is English)
  if (!self && !el.querySelector('[lang="en"]')) return;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (LETTER.test(n.data) && !hiddenInImmersion(n.parentElement, el.parentElement)) return; // a visible name: fine
  }
  if (self) el.classList.add("imm-keep");
  for (const x of el.querySelectorAll('[lang="en"]')) if (!x.closest(".sr-only")) x.classList.add("imm-keep");
}
// The controls to check after nodes were added under `parent`: the control around them and the controls inside them.
function collectNamed(parent, added, into) {
  const t = parent && (parent.nodeType === 1 ? parent : parent.parentElement);
  const up = t && t.closest(NAMED);
  if (up) into.add(up);
  for (const n of added) {
    if (n.nodeType !== 1) continue;
    if (n.matches(NAMED)) into.add(n);
    for (const el of n.querySelectorAll(NAMED)) into.add(el);
  }
  return into;
}
let namesObserver = null;
function startKeepNames() {
  if (namesObserver || typeof MutationObserver === "undefined" || !document.body) return;
  for (const el of collectNamed(null, [document.body], new Set())) keepName(el);
  namesObserver = new MutationObserver(recs => {
    const todo = new Set();
    for (const r of recs) if (r.addedNodes.length) collectNamed(r.target, r.addedNodes, todo);
    for (const el of todo) if (el.isConnected) keepName(el);
  });
  namesObserver.observe(document.body, { childList: true, subtree: true });
}
function stopKeepNames() { if (namesObserver) { namesObserver.disconnect(); namesObserver = null; } }
if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("storage", e => { if (!e.key || e.key === PREFIX + "settings") applyDisplay(); });
  if (document.body) applyDisplay(); else document.addEventListener("DOMContentLoaded", () => applyDisplay());
}

// ---------- the learner's level and phase (§8.1, §8.3; M4 design §5)
// level: the TBCL level studied now, a number 1-7 (store "level", set by the Plan page's placement and passed level
// checks), else the last placement's (store "plan.placement".level); null when not placed yet.
// phase: 0 "sound reset" during the first 28 days (it runs alongside everything), then the phase of the level
// (§8.1: L1-2 → 1, L3 → 2, L4 → 3, L5 → 4, L6-7 → 5; 1 when not placed). levelPhase: the level's own phase.
// placedAt: the date of the last placement ("YYYY-MM-DD") or null. week: the Phase 0 week (1-4) or null.
export const PHASE0_DAYS = 28;
export const phaseOfLevel = n => (n >= 6 ? 5 : n === 5 ? 4 : n === 4 ? 3 : n === 3 ? 2 : 1);
export const PHASE_NAMES = { 0: ["聲音重置", "Sound reset"], 1: ["生存", "Survival"], 2: ["日常生活", "Daily life"], 3: ["獨立", "Independent"],
  4: ["中高級", "Upper-intermediate"], 5: ["高級", "Advanced"] };
const levelNumber = x => {
  if (x && typeof x === "object") return levelNumber(x.level ?? x.tbcl ?? null);
  if (typeof x === "number") return Number.isFinite(x) && x >= 1 && x <= 7 ? Math.floor(x) : null;
  const m = String(x ?? "").match(/[1-7]/);
  return m ? Number(m[0]) : null;
};
export function levelState() {
  const p = store.get("plan.placement", null);
  const placed = p && typeof p === "object" ? p : null;
  const level = levelNumber(store.get("level", null)) ?? levelNumber(placed && placed.level);
  const days = Math.max(0, daysSinceStart());
  const phase0 = days < PHASE0_DAYS;
  const levelPhase = level ? phaseOfLevel(level) : null;
  return { level, phase: phase0 ? 0 : levelPhase ?? 1, placedAt: placed && placed.date ? String(placed.date) : null,
    levelPhase, phase0, week: phase0 ? Math.floor(days / 7) + 1 : null };
}

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
// Display settings (applyDisplay above): every <ruby> carries the tone of the syllable it shows (t1..t5, for the tone
// colours option). mode: the Zhuyin mode; by default the learner's setting, applied through style.css (class "rb"),
// so a page or widget that runs its own Zhuyin switch can be exempted there. A caller may pass mode "always" (Zhuyin
// whatever the setting), "off" (plain characters) or "new" (no Zhuyin on words marked known in the Library).
const HAN = /[㐀-鿿豈-﫿]/;
export function ruby(zh, zhuyin, { cls = "zh", spoken = null, sandhi = null, mode = null } = {}) {
  const el = h("span", { class: cls, lang: "zh-Hant-TW" });
  zh = String(zh ?? "");
  const syls = zhuyin ? syllables(String(zhuyin)) : [];
  const chars = [...zh];
  const cjk = chars.filter(c => HAN.test(c));
  if (!syls.length || cjk.length !== syls.length || mode === "off") { el.textContent = zh; return el; }
  const said = spoken && (sandhi ?? settings().sandhi) ? syllables(String(spoken)) : null;
  const m = mode || rubyMode();
  const known = m === "new" ? knownMask(chars, syls) : null;
  if (!mode) el.classList.add("rb");
  else if (mode === "new") el.classList.add("rb-new");
  let i = 0;
  for (const c of chars) {
    if (HAN.test(c)) {
      const base = syls[i], alt = said && said[i] && said[i] !== base ? said[i] : null;
      const cl = [`t${toneOf(alt || base)}`, known && known[i] ? "rb-known" : ""].filter(Boolean).join(" ");
      el.append(h("ruby", { class: cl }, c, h("rp", {}, "("), alt ? h("rt", { class: "sandhi", title: `寫作 written ${base}` }, alt) : h("rt", {}, base), h("rp", {}, ")")));
      i++;
    } else el.append(c);
  }
  return el;
}

// Words marked "known" in the Library (store "lib.status", library.js: {"<type>:<key>": "known"}; a word's key is its
// characters, plus "|<Zhuyin without spaces>" for a homograph): characters -> the readings known ("" = any reading).
// Read again only when the stored text changes.
let knownCache = { raw: undefined, map: new Map() };
function knownWords() {
  let raw = null;
  try { raw = localStorage.getItem(PREFIX + "lib.status"); } catch { /* private mode */ }
  if (raw === knownCache.raw) return knownCache.map;
  const map = new Map();
  try {
    for (const [k, v] of Object.entries(JSON.parse(raw || "{}") || {})) {
      if (v !== "known") continue;
      const i = k.indexOf(":"), type = k.slice(0, i), key = k.slice(i + 1);
      if (i < 0 || !["word", "taiwan", "measure", "reading", "phrase"].includes(type)) continue;
      const j = key.indexOf("|"), w = j < 0 ? key : key.slice(0, j), reading = j < 0 ? "" : key.slice(j + 1);
      if (!w || ![...w].every(c => HAN.test(c))) continue;
      if (!map.has(w)) map.set(w, new Set());
      map.get(w).add(/^\d+$/.test(reading) ? "" : reading.replace(/[\sˉ]+/g, "")); // "|<n>" only tells two rows apart
    }
  } catch { /* not JSON: nothing known */ }
  knownCache = { raw, map };
  return map;
}
// One flag per Han character: inside a known word (longest match first, never across punctuation or Latin text; the
// word's reading is checked when its Library key has one).
function knownMask(chars, syls) {
  const map = knownWords();
  const mask = new Array(syls.length).fill(false);
  if (!map.size) return mask;
  const runs = [];
  let run = [], k = 0;
  for (const c of chars) {
    if (HAN.test(c)) run.push([c, k++]);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  for (const r of runs) {
    for (let a = 0; a < r.length;) {
      let len = Math.min(8, r.length - a);
      for (; len > 0; len--) {
        const readings = map.get(r.slice(a, a + len).map(x => x[0]).join(""));
        if (!readings) continue;
        if (readings.has("") || readings.has(syls.slice(r[a][1], r[a][1] + len).join(""))) break;
      }
      if (len > 0) { for (let b = a; b < a + len; b++) mask[r[b][1]] = true; a += len; } else a++;
    }
  }
  return mask;
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
// Decoded clips, most recently used last. A decoded clip is several MB, so only the last few are kept.
const buffers = new Map();
const MAX_BUFFERS = 6;
async function decode(url) {
  let p = buffers.get(url);
  if (p) { buffers.delete(url); buffers.set(url, p); return p; }
  p = fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); }).then(b => audioContext().decodeAudioData(b))
    .catch(err => { if (buffers.get(url) === p) buffers.delete(url); throw err; }); // a failed load (offline, 404) is retried next time
  buffers.set(url, p);
  while (buffers.size > MAX_BUFFERS) buffers.delete(buffers.keys().next().value);
  return p;
}
let current = null; // {stop()}
let playToken = 0; // bumped by every stop, so a clip still decoding when stopped never starts
function stopPlayback() {
  playToken++;
  if (current) { try { current.stop(); } catch { /* ignore */ } current = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
// Stop everything audible and release the microphone. Call it before removing a view (tab change, closing a detail).
export function stopAudio() {
  stopPlayback();
  stopRecorders();
}
// Play the headword span of an MOE clip with exact edges. Resolves when it ends. rate: Settings' default speed when
// not given; a slowed clip plays through an <audio> element so it keeps its pitch (a buffer source at another rate
// would shift the voice, and with it the tone's register).
export async function playMoe(id, { rate = defaultRate(), span = true } = {}) {
  await ready;
  const info = audioIndex[id];
  if (!info) throw new Error("no clip " + id);
  stopPlayback();
  if (Math.abs(rate - 1) > 0.001) return playSlowMoe(moeUrl(id), info, rate, span);
  const token = playToken;
  const buf = await decode(moeUrl(id));
  if (token !== playToken) return; // stopped (or another clip started) while decoding
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
function playSlowMoe(url, info, rate, span) {
  const a = new Audio(url);
  a.preload = "auto"; a.preservesPitch = true; a.playbackRate = rate;
  return new Promise(resolve => {
    let timer = null, over = false;
    const done = () => { if (over) return; over = true; clearTimeout(timer); a.pause(); if (current === me) current = null; resolve(); };
    const me = { stop: done };
    current = me;
    a.onended = a.onerror = done;
    const go = () => {
      if (over) return;
      if (span) a.currentTime = info.start;
      a.playbackRate = rate;
      a.play().then(() => {
        if (span && !over) timer = setTimeout(done, Math.max(50, ((info.end - info.start) / rate) * 1000));
      }).catch(done);
    };
    if (a.readyState >= 1) go(); else a.addEventListener("loadedmetadata", go, { once: true });
  });
}
// path: a file, or a blob: / data: URL (the learner's own take: it plays at 1× unless a rate is given)
export async function playFile(path, { rate = /^(blob|data):/.test(String(path)) ? 1 : defaultRate() } = {}) {
  stopPlayback();
  const a = new Audio(path);
  a.playbackRate = rate; a.preservesPitch = true;
  const me = { stop: () => a.pause() };
  current = me;
  return new Promise(resolve => { a.onended = a.onerror = () => { if (current === me) current = null; resolve(); }; a.play().catch(() => resolve()); });
}
// The Taiwan voice for TTS: Settings › Browser voice (a voice name) when this device has it, else the best guess.
function pickVoice() {
  const voices = speechSynthesis.getVoices().filter(v => /^(zh[-_](TW|Hant)|cmn[-_]TW)/i.test(v.lang) || /zh-TW|臺灣|台灣|Taiwan/i.test(v.name + v.lang));
  const want = settings().voice;
  return (want && voices.find(v => v.name === want)) || voices.find(v => /natural|online|hsiao|yunjhe|meijia|google/i.test(v.name)) || voices[0] || null;
}
export const hasTwVoice = () => "speechSynthesis" in window && !!pickVoice();
// The browser voice runs at 0.9 × the speed (it is fast at 1.0); rate defaults to 0.9 × Settings' default speed.
export function speak(text, { rate = 0.9 * defaultRate() } = {}) {
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
// rate: fixed by the caller, else Settings' default speed at the time of the click.
export function playButton(item, { label = "🔊", rate = null, badge = true, cls = "btn icon" } = {}) {
  const src = item.id ? "moe" : item.audio && audioIndex[item.audio] ? audioIndex[item.audio].src : item.audio?.startsWith("audio/tts/") ? "tts" : "voice";
  const names = { moe: "MOE human voice · 教育部真人發音", juyin: "MOE handbook · 教育部注音符號手冊", tts: "TTS (Google zh-TW)", voice: "Browser voice (no MOE clip)" };
  const btn = h("button", { class: cls, type: "button", title: names[src], "aria-label": `播放 Play ${item.zh || ""} — ${names[src]}`,
    onclick: async e => {
      e.stopPropagation();
      btn.classList.add("is-playing");
      const r = Number(rate) > 0 ? Number(rate) : defaultRate();
      try {
        if (item.id) await playMoe(item.id, { rate: r });
        else if (item.audio && audioIndex[item.audio]) await playFile(audioIndex[item.audio].path, { rate: r });
        else if (item.audio?.startsWith("audio/")) await playFile(item.audio, { rate: r });
        else await speak(item.zh, { rate: r * 0.9 });
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
    this.rec.onstop = () => this.finish(); // also when the recording ends by itself (mic unplugged, call, iOS interruption)
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
      this.resolveStop = resolve;
      cancelAnimationFrame(this.raf);
      if (this.rec.state !== "inactive") this.rec.stop(); // else its onstop is already on the way
    });
  }
  finish() {
    liveRecorders.delete(this);
    cancelAnimationFrame(this.raf);
    this.stream.getTracks().forEach(t => t.stop());
    try { this.src && this.src.disconnect(); } catch { /* ignore */ }
    const blob = new Blob(this.chunks, { type: this.rec.mimeType || "audio/webm" });
    const resolve = this.resolveStop;
    this.rec = null; this.stopping = null; this.resolveStop = null;
    if (this.onstopped) this.onstopped(blob);
    if (resolve) resolve(blob);
  }
}

// Record / play-back pair with optional save key. Returns a <span class="rec">.
// A take cut short by stopAudio() (tab change, detail closed) or by the widget leaving the page is kept
// like one stopped with the button.
// "● 錄音 Record" -> ["● 錄音", " ", <span lang="en">Record</span>]: the English part is interface English (immersion hides it)
const splitLabel = s => { const m = /^(.*\p{sc=Han}.*?)\s+([A-Za-z].*)$/u.exec(String(s)); return m ? [m[1], " ", enText(m[2])] : [String(s)]; };
export function recordWidget({ key, label = "錄音 Record", onDone } = {}) {
  if (!canRecord) return h("span", { class: "muted small" }, h("span", { lang: "zh-Hant-TW" }, "此瀏覽器不能錄音"), " ", h("span", { lang: "en" }, "Recording not supported here"));
  const rec = new Recorder();
  let url = null, starting = false, watch = null;
  const play = h("button", { class: "btn small", type: "button", disabled: true, onclick: () => { if (url) playFile(url); } }, ...splitLabel("▶ 我的 Mine"));
  const btn = h("button", { class: "btn small", type: "button", "aria-pressed": "false", onclick: async () => {
    if (rec.recording) { rec.stop(); return; }
    if (starting) return; // permission prompt still open
    starting = true;
    watchDetach();
    try { if (await rec.start()) setRecording(true); else unwatch(); } catch { unwatch(); toast("需要麥克風權限 Microphone permission needed"); }
    starting = false;
  } }, ...splitLabel(label));
  const wrap = h("span", { class: "rec" }, btn, play);
  // From Record until the take ends: if a view is cleared without stopAudio(), the detached widget stops its own recorder.
  const unwatch = () => { if (watch) { watch.disconnect(); watch = null; } };
  const watchDetach = () => {
    if (watch || typeof MutationObserver === "undefined") return;
    watch = new MutationObserver(() => { if (!wrap.isConnected) { unwatch(); rec.stop(); } });
    watch.observe(document, { childList: true, subtree: true });
  };
  const setRecording = on => { btn.replaceChildren(...splitLabel(on ? "■ 停止 Stop" : label)); btn.classList.toggle("recording", on); btn.setAttribute("aria-pressed", String(on)); };
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
