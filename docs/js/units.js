// 課程 Units (MASTER_PROMPT §5.5, §8.6; M5 design "Build (units part) and page"): the units by TBCL level with their
// status, and one unit as a lesson page whose sections keep the spec's order: can-do goal → dialogue → vocabulary →
// grammar → pronunciation focus → shadowing → comprehension check → speaking task → writing task → culture note.
// The dialogue is the page's signature: one thread of clearly named speakers, every line playable on its own or all
// in a row with the line being heard marked, and switches for the text, the Zhuyin (all / only the unit's new words /
// off), the English and the app-wide "show sandhi" overlay.
//
// Audio (ground rule 5, every source labelled): dialogue and shadowing lines play their build TTS file through
// player.js (slowed playback keeps its pitch) or, without one, the browser voice; a vocabulary word plays its MOE clip,
// self-hosted when audio.json has it, else streamed from the moedict CDN with its headword span as the Library does
// (library.js), else nothing: a disabled button marked 無錄音 (a lone word or a neutral tone never goes to the browser
// voice, §7.6, §7.1). Listening (dialogue, comprehension, the contrast drill) and speaking
// (shadowing, the speaking task) are separate sections (§6.7).
//
// Store keys (app.js store, prefix "gy."):
//   units.status     {"<unit id>": "progress" | "done" | "review"}; absent = not started
//   units.done       {"<unit id>": "YYYY-MM-DD"}: the done units, kept in step with units.status (plan.js reads it)
//   units.quiz       {"<unit id>": {last, best, n, correct, date, tries}}: the comprehension check, in %
//   units.checklist  {"<unit id>": [bool …]}: the speaking task's self-rating checklist
//   units.writing    {"<unit id>": "text"}: the writing task's draft
//   units.prefs      {ruby: "all" | "new" | "off", en, text, rate, protocol}: the dialogue and shadowing switches
//   today.routine[date].unit  {done, minutes, planned, at, id}: written only on a timed visit (?min=N, from Today)
//   lib.status       the vocabulary statuses, through library.js setStatus (the Library's own key)
// Recordings stay in IndexedDB: "unit:<id>:speak" (speaking task), "shadow:unit:<id>:<i>" (drills.js shadowLine).
// §8.6: a comprehension check below 70 % marks the unit "review"; currentUnit() then keeps returning it (it is not
// done), so Today reviews it before a new unit starts.
//
// Data: docs/data/units.json (an array, {units: [...]}, or {"<id>": unit}), each unit as content/units/*.json plus
// the build's "audio" (TTS path or audio.json key) and "dur" on dialogue and shadowing lines, "spoken" (sandhi forms)
// and vocabulary "id" (MOE clip) and "s" ([start, end] headword span). Without units.json the list falls back to the
// unit list in units-index.json. docs/data/plan.json "released_units" (if present) limits the released units.
//
// Exports for other pages: currentUnit(level) (Today's Current-unit block), loadUnits(), unitStatus(id),
// setUnitStatus(id, s), unitHref(id, {minutes, section}), learnerLevel(), and the pure helpers the Node tests use.
// The page boots only inside <main id="app" data-page="units">: importing this module has no side effects.
import { h, clear, mountShell, store, loadJSON, ruby, playButton, speak, toast, today, settings, setSetting, enText, bi,
  trackTime, recordWidget, audioInfo, syllables, toneOf, TONE_NAMES } from "./app.js";
import { shadowLine, contrastDrill, contrastStats, recentAccuracy, stopAll } from "./drills.js";
import { ShadowPlayer, RATES } from "./player.js";
import { contourIcon } from "./pitch.js";

// ------------------------------------------------------------------ constants
export const QUIZ_PASS = 70; // §8.6: a unit quiz below 70 % means review the unit before starting a new one
export const UNIT_STATUSES = [["new", "未開始", "Not started"], ["progress", "進行中", "In progress"], ["done", "完成", "Done"],
  ["review", "需要複習", "Needs review"]];
const KEYS = { status: "units.status", done: "units.done", quiz: "units.quiz", checklist: "units.checklist", writing: "units.writing",
  prefs: "units.prefs", routine: "today.routine" };
const DONE_SHARE = 0.8;   // home.js: 80 % of a block's planned minutes makes it done for today
const LINE_GAP = 0.45;    // s of silence between two dialogue lines in "Play all" (at 1.0×)
const MOE_STREAM = "https://r2-assets.moedict.tw/audio/a/"; // library.js MOE_STREAM (the moedict CDN's MOE clips)
const UNSPANNED_MAX = 1.2; // s: a streamed clip whose headword span is not measured yet plays at most this long (library.js)
const MOE_NAME = "MOE human voice · 教育部真人發音";
const TTS_NAME = "TTS (Google zh-TW)";
const VOICE_NAME = "Browser voice (no recording built) · 瀏覽器語音";
const NO_CLIP = "無錄音 No MOE recording";
// [id, 中文, English]: the unit page's sections, in the spec's order (§5.5)
export const SECTIONS = [["goal", "目標", "Can-do"], ["dialogue", "對話", "Dialogue"], ["vocab", "生詞", "Vocabulary"], ["grammar", "語法", "Grammar"],
  ["pron", "發音", "Pronunciation"], ["shadow", "跟讀", "Shadowing"], ["check", "理解", "Comprehension"], ["speak", "說", "Speaking"],
  ["write", "寫", "Writing"], ["culture", "文化", "Culture"]];
// The standard (標準) Zhuyin layout of the Lab's dictation keyboard (lab.js KEY_ROWS; §8.5: Space = T1, 6 ˊ, 3 ˇ, 4 ˋ, 7 ˙)
const KEY_ROWS = [
  [["1", "ㄅ"], ["2", "ㄉ"], ["3", "ˇ"], ["4", "ˋ"], ["5", "ㄓ"], ["6", "ˊ"], ["7", "˙"], ["8", "ㄚ"], ["9", "ㄞ"], ["0", "ㄢ"], ["-", "ㄦ"]],
  [["q", "ㄆ"], ["w", "ㄊ"], ["e", "ㄍ"], ["r", "ㄐ"], ["t", "ㄔ"], ["y", "ㄗ"], ["u", "ㄧ"], ["i", "ㄛ"], ["o", "ㄟ"], ["p", "ㄣ"]],
  [["a", "ㄇ"], ["s", "ㄋ"], ["d", "ㄎ"], ["f", "ㄑ"], ["g", "ㄕ"], ["h", "ㄘ"], ["j", "ㄨ"], ["k", "ㄜ"], ["l", "ㄠ"], [";", "ㄤ"]],
  [["z", "ㄈ"], ["x", "ㄌ"], ["c", "ㄏ"], ["v", "ㄒ"], ["b", "ㄖ"], ["n", "ㄙ"], ["m", "ㄩ"], [",", "ㄝ"], [".", "ㄡ"], ["/", "ㄥ"]],
];
const KEYMAP = Object.fromEntries(KEY_ROWS.flat());
const TONE_KEY_NAMES = { "ˊ": "ˊ 二聲 tone 2", "ˇ": "ˇ 三聲 tone 3", "ˋ": "ˋ 四聲 tone 4", "˙": "˙ 輕聲 neutral tone" };
const POS = { n: "noun", v: "verb", adj: "adjective", adv: "adverb", m: "measure word", pron: "pronoun", conj: "conjunction", prep: "preposition",
  particle: "particle", phrase: "phrase", num: "number", interj: "interjection", vo: "verb + object", aux: "auxiliary", pn: "name" };
const CJK = /[㐀-鿿豈-﫿]/;          // app.js ruby(): one Zhuyin syllable per character in this range
const BOPO_END = /[ㄅ-ㄯ]+$/;     // the Zhuyin run at the end of a string (ㄅ … ㄯ)

// ------------------------------------------------------------------ pure helpers (tested in Node)
const arr = x => (Array.isArray(x) ? x : []);
const str = x => (x == null ? "" : String(x));
const obj = x => (x && typeof x === "object" && !Array.isArray(x) ? x : {});

// 1, "第1級", "第1*級", "1*", "L2", {level: 3} -> the level number; null when there is none
export function parseLevelN(x) {
  if (x == null || x === "") return null;
  if (typeof x === "number") return Number.isFinite(x) && x >= 1 ? Math.floor(x) : null;
  if (typeof x === "object") return parseLevelN(x.level ?? x.n ?? x.tbcl ?? null);
  const m = String(x).match(/(\d+)/);
  return m && Number(m[1]) >= 1 ? Number(m[1]) : null;
}
// A unit's level: its "level" field, else the number after "L" in its id ("L2-05" -> 2)
export const unitLevelN = u => (u ? parseLevelN(u.level ?? u.lv ?? u.tbcl ?? null) ?? parseLevelN((str(u.id).match(/^L(\d+)/i) || [])[1] ?? null) : null);
export const unitOrderN = u => (Number(u && u.order) > 0 ? Number(u.order) : Number((str(u && u.id).match(/-(\d+)$/) || [])[1]) || 0);
// units.json / units-index.json -> units sorted by level, then order; each gets _level and _order. Accepts an array,
// {units: [...]}, {items: [...]} or {"<id>": unit}; entries without an id are dropped, a repeated id keeps the first.
export function normUnits(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === "object") {
    list = Array.isArray(raw.units) ? raw.units : Array.isArray(raw.items) ? raw.items
      : Object.entries(raw).filter(([k, v]) => v && typeof v === "object" && !Array.isArray(v) && (v.id != null || /^L\d+-\d+$/i.test(k)))
        .map(([k, v]) => ({ id: k, ...v }));
  }
  const seen = new Set();
  const out = [];
  list.forEach((u, i) => {
    if (!u || typeof u !== "object" || u.id == null || str(u.id) === "" || seen.has(str(u.id))) return;
    seen.add(str(u.id));
    out.push({ ...u, id: str(u.id), _level: unitLevelN(u), _order: unitOrderN(u), _i: i });
  });
  return out.sort((a, b) => (a._level ?? 99) - (b._level ?? 99) || a._order - b._order || a._i - b._i);
}
// plan.json "released_units" -> a Set of ids, or null (no list: every unit is released)
export function releasedIds(plan) {
  const p = obj(plan);
  return Array.isArray(p.released_units) ? new Set(p.released_units.map(String)) : null;
}
export const isReleased = (id, released) => !released || released.has(String(id));
export function normStatus(v) {
  const s = v && typeof v === "object" ? v.status ?? v.s : v;
  return s === "progress" || s === "done" || s === "review" ? s : "new";
}
// The current unit of a level: the first released unit (by order) that is not done. A "review" unit is not done, so
// it stays current until it is (§8.6: review before starting a new unit). null when there is none.
export function pickCurrent(units, level, released = null, statuses = {}) {
  const n = parseLevelN(level);
  if (n == null) return null;
  return arr(units).find(u => u && u._level === n && isReleased(u.id, released) && normStatus(obj(statuses)[u.id]) !== "done") || null;
}
export const quizQuestions = u => arr(u && u.comprehension).filter(q => q && str(q.question_en).trim() && arr(q.options_en).length >= 2
  && Number.isInteger(Number(q.answer)) && Number(q.answer) >= 0 && Number(q.answer) < arr(q.options_en).length);
// answers[i]: the chosen option index or null. pass: at least QUIZ_PASS % right (exact, not the rounded pct).
export function scoreQuiz(questions, answers) {
  const qs = arr(questions);
  const results = qs.map((q, i) => {
    const a = answers ? answers[i] : null;
    return a == null || a === "" ? null : Number(a) === Number(q && q.answer);
  });
  const n = qs.length, answered = results.filter(r => r != null).length, correct = results.filter(r => r === true).length;
  return { n, answered, correct, complete: answered === n, pct: n ? Math.round(100 * correct / n) : null,
    pass: n > 0 && correct * 100 >= QUIZ_PASS * n, results };
}
// §8.6: a check below 70 % sends the unit to review; a pass takes a not-started or review unit to "in progress" (the
// learner marks it done), and a done unit stays done.
export function statusAfterQuiz(prev, pass) {
  const s = normStatus(prev);
  if (!pass) return "review";
  return s === "done" ? "done" : "progress";
}
export function hasSection(u, id) {
  const x = obj(u);
  switch (id) {
    case "goal": return !!str(x.can_do_en).trim();
    case "dialogue": return arr(x.dialogue).some(l => l && l.zh);
    case "vocab": return arr(x.vocab).some(v => v && v.zh);
    case "grammar": return arr(x.grammar).some(g => g && g.id);
    case "pron": { const p = obj(x.pronunciation); return !!(p.contrast || p.tone_pair || str(p.note_en).trim()); }
    case "shadow": return arr(x.shadowing).some(l => l && l.zh);
    case "check": return quizQuestions(x).length > 0;
    case "speak": { const s = obj(x.speaking); return !!(str(s.prompt_en).trim() || str(s.prompt_zh).trim()); }
    case "write": { const w = obj(x.writing); return !!(str(w.prompt_en).trim() || str(w.prompt_zh).trim()); }
    case "culture": return !!str(x.culture_en).trim();
    default: return false;
  }
}
// For "Zhuyin on new words only": one flag per Chinese character of zh, true where one of `words` (the unit's
// vocabulary) covers it. Longest word first, scanning left to right.
export function vocabMask(zh, words) {
  const chars = [...str(zh)];
  const list = [...new Set(arr(words).map(w => str(w).trim()).filter(Boolean))].map(w => [...w]).sort((a, b) => b.length - a.length);
  const mask = [];
  for (let p = 0; p < chars.length;) {
    if (!CJK.test(chars[p])) { p++; continue; }
    const w = list.find(wc => wc.every((c, j) => chars[p + j] === c));
    if (w) { for (let j = 0; j < w.length; j++) if (CJK.test(chars[p + j])) mask.push(true); p += w.length; }
    else { mask.push(false); p++; }
  }
  return mask;
}
// Does a word's written (MOE base) Zhuyin contain the tone pair "t1t2" on two neighbouring syllables? ("0" = neutral)
// With the build's `spoken` form, the two must also be said that way (一共 is written 1+4 but said 2+4), except for
// the pair 3+3, which is written 3+3 and always said 2+3 (§6.4).
const pairTones = pair => { const d = str(pair).replace(/\D/g, ""); return d.length === 2 ? [...d].map(x => (x === "0" ? 5 : Number(x))) : null; };
function pairAt(written, said, i, want) {
  if (written[i] !== want[0] || written[i + 1] !== want[1]) return false;
  if (!said || said.length !== written.length || (want[0] === 3 && want[1] === 3)) return true;
  return said[i] === want[0] && said[i + 1] === want[1];
}
export function hasTonePair(zhuyin, pair, spoken = null) {
  const want = pairTones(pair);
  if (!want) return false;
  const t = syllables(str(zhuyin)).map(toneOf), s = spoken ? syllables(str(spoken)).map(toneOf) : null;
  for (let i = 0; i + 1 < t.length; i++) if (pairAt(t, s, i, want)) return true;
  return false;
}
// Two neighbouring characters of the lines (no punctuation between them) whose written tones are the pair, first
// seen first, without repeats: for a tone pair the unit exercises in phrases (你好, 我買 for 3+3) rather than in a
// vocabulary word. -> [{zh, zhuyin, spoken}] (spoken: the build's sandhi form of the two, when the line has one)
export function pairBigrams(lines, pair, max = 6) {
  const want = pairTones(pair);
  if (!want) return [];
  const out = [], seen = new Set();
  for (const l of arr(lines)) {
    if (!l || !l.zh) continue;
    const chars = [...str(l.zh)], syls = syllables(str(l.zhuyin)), said = l.spoken ? syllables(str(l.spoken)) : [];
    const at = [];
    chars.forEach((c, i) => { if (CJK.test(c)) at.push(i); });
    if (at.length !== syls.length) continue;
    const wt = syls.map(toneOf), st = said.length === syls.length ? said.map(toneOf) : null;
    for (let k = 0; k + 1 < syls.length; k++) {
      if (at[k + 1] !== at[k] + 1 || !pairAt(wt, st, k, want)) continue;
      const zh = chars[at[k]] + chars[at[k + 1]];
      if (seen.has(zh)) continue;
      seen.add(zh);
      out.push({ zh, zhuyin: `${syls[k]} ${syls[k + 1]}`, spoken: said.length === syls.length ? `${said[k]} ${said[k + 1]}` : null });
      if (out.length >= max) return out;
    }
  }
  return out;
}
// The on-screen Zhuyin keyboard on a text box: the new value and caret after pressing `sym` with [start, end) selected.
// Taiwan style: ˊ ˇ ˋ follow the syllable and end it (a space after), ˙ goes before the syllable; Space (tone 1) ends a
// syllable; a tone key right after an ended syllable re-tones it; "Backspace" deletes the selection or one character.
export function zhuyinInsert(value, start, end, sym) {
  const v = str(value);
  const s = Math.max(0, Math.min(v.length, Number(start) || 0));
  const e = Math.max(s, Math.min(v.length, end == null ? s : Number(end) || 0));
  let before = v.slice(0, s);
  const after = v.slice(e);
  if (sym === "Backspace") {
    if (e > s) return { value: before + after, caret: s };
    const cps = [...before];
    cps.pop();
    before = cps.join("");
    return { value: before + after, caret: before.length };
  }
  const k = str(sym);
  if (k.length === 1 && "ˊˇˋ˙".includes(k)) {
    if (/[ˊˇˋ] $/.test(before)) before = before.slice(0, -2);              // re-tone: replace the tone just typed
    else if (/[ㄅ-ㄯ] $/.test(before)) before = before.slice(0, -1); // a syllable ended with Space (tone 1)
    if (k === "˙") {
      const m = before.match(BOPO_END);
      if (m) { const base = before.slice(0, before.length - m[0].length); before = (base.endsWith("˙") ? base : base + "˙") + m[0] + " "; }
      else before += "˙";
    } else before += k + " ";
  } else before += k;
  return { value: before + after, caret: before.length };
}
export function correctText(u, text) {
  const x = obj(u), w = obj(x.writing);
  const lv = x._level != null ? `第${x._level}級` : str(x.level);
  return ["CORRECT",
    `課程 Unit ${str(x.id)}｜${str(x.title_zh)} ${str(x.title_en)}${lv ? `（${lv}）` : ""}｜寫作 Writing task`,
    w.prompt_zh ? `題目：${str(w.prompt_zh)}` : null,
    w.prompt_en ? `Task: ${str(w.prompt_en)}` : null,
    "",
    "我寫的 My text:",
    str(text).trim()].filter(l => l != null).join("\n");
}
export const fmtClock = sec => { const s = Math.max(0, Math.ceil(Number(sec) - 0.001) || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
// A line's audio file: its "audio" as an audio.json key (-> that entry's path) or as a path under audio/; else null.
export function lineAudioPath(line, lookup = audioInfo) {
  const k = line && line.audio;
  if (!k || typeof k !== "string") return null;
  let e = null;
  try { e = lookup(k); } catch { e = null; }
  if (e && e.path) return String(e.path);
  return k.startsWith("audio/") ? k : null;
}
export function spanOf(s) {
  if (s && typeof s === "object" && !Array.isArray(s)) return spanOf([s.start, s.end]);
  if (!Array.isArray(s) || s.length < 2) return null;
  const a = Number(s[0]), b = Number(s[1]);
  return Number.isFinite(a) && Number.isFinite(b) && b > a && a >= 0 ? [a, b] : null;
}
const sec2 = n => String(Math.round(n * 100) / 100);
export const streamUrlOf = (id, span) => `${MOE_STREAM}${encodeURIComponent(id)}.mp3${span ? `#t=${sec2(span[0])},${sec2(span[1])}` : ""}`;
// "#L1-02/vocab" -> {id: "L1-02", section: "vocab"}
export function parseRoute(hash) {
  let s = String(hash || "").replace(/^#/, "");
  try { s = decodeURIComponent(s); } catch { /* keep it raw */ }
  const i = s.indexOf("/");
  return i < 0 ? { id: s, section: "" } : { id: s.slice(0, i), section: s.slice(i + 1) };
}
// Link to a unit: units.html?min=12#L1-02 opens it with a 12-minute unit timer (Today's Current-unit block).
export function unitHref(id, { minutes = null, section = "" } = {}) {
  const m = Number(minutes);
  return `units.html${m > 0 ? `?min=${Math.round(m * 10) / 10}` : ""}#${encodeURIComponent(str(id))}${section ? "/" + section : ""}`;
}

// ------------------------------------------------------------------ stored state
const mapOf = key => obj(store.get(key, {}));
export const statusMap = () => mapOf(KEYS.status);
export const unitStatus = id => normStatus(statusMap()[id]);
// Sets a unit's status ("new" removes it) and keeps units.done in step (a done unit keeps its first done date).
export function setUnitStatus(id, s) {
  const st = normStatus(s), key = str(id);
  const m = { ...statusMap() };
  if (st === "new") delete m[key]; else m[key] = st;
  store.set(KEYS.status, m);
  const done = { ...mapOf(KEYS.done) };
  if (st === "done") done[key] = done[key] || today(); else delete done[key];
  store.set(KEYS.done, done);
  return st;
}
export const quizRecord = id => obj(mapOf(KEYS.quiz)[id]);
function saveQuiz(id, r) {
  const m = { ...mapOf(KEYS.quiz) };
  const old = obj(m[id]);
  m[id] = { last: r.pct, best: Math.max(Number(old.best) || 0, r.pct), n: r.n, correct: r.correct, date: today(), tries: (Number(old.tries) || 0) + 1 };
  store.set(KEYS.quiz, m);
  return m[id];
}
function prefs() {
  const s = settings();
  const r = String(s.ruby ?? "always");
  const ruby0 = /off|never|none/i.test(r) ? "off" : /new/i.test(r) ? "new" : "all";
  // The dialogue starts at Settings › Default speed (when it is one of this page's speeds); a saved page pref wins.
  const rate0 = RATES.includes(Number(s.speed)) ? Number(s.speed) : 1;
  const p = { ruby: ruby0, en: s.english !== false, text: true, rate: rate0, protocol: "short", ...obj(store.get(KEYS.prefs, {})) };
  if (!["all", "new", "off"].includes(p.ruby)) p.ruby = ruby0;
  return p;
}
const setPref = (k, v) => store.set(KEYS.prefs, { ...obj(store.get(KEYS.prefs, {})), [k]: v });
// The TBCL level the learner studies now: plan.js "level" (a number 1-7), else the last placement's; null if neither.
export function learnerLevel() {
  const n = parseLevelN(store.get("level", null));
  if (n) return n;
  const p = store.get("plan.placement", null);
  return parseLevelN(p && typeof p === "object" ? p.level ?? null : null);
}
const routineToday = () => obj(obj(store.get(KEYS.routine, {}))[today()]);
function saveRoutineUnit(rec) {
  const all = { ...obj(store.get(KEYS.routine, {})) };
  const d = today(), day = obj(all[d]), old = obj(day.unit);
  all[d] = { ...day, unit: { ...old, ...rec, done: !!(old.done || rec.done) } };
  store.set(KEYS.routine, all);
}

// ------------------------------------------------------------------ data
let unitsP = null;
// {list (sorted), byId, missing (no units.json), partial (titles only, from units-index.json)}; shared by every caller
export function loadUnits() {
  return (unitsP ||= (async () => {
    const full = await loadJSON("units").catch(err => { console.warn("units.json not available:", err && err.message); return null; });
    let list = normUnits(full), partial = false;
    if (!list.length) {
      const idx = await loadJSON("units-index").catch(() => null);
      list = normUnits(Array.isArray(idx) ? idx : idx && typeof idx === "object" ? idx.units ?? idx.items ?? null : null);
      partial = list.length > 0;
    }
    return { list, byId: new Map(list.map(u => [u.id, u])), missing: !full, partial };
  })());
}
export function unitSummary(u, statuses = statusMap()) {
  return { id: u.id, level: u._level, levelLabel: str(u.level) || (u._level != null ? `第${u._level}級` : ""), order: u._order,
    title_zh: str(u.title_zh), title_en: str(u.title_en), topic: str(u.topic), can_do_en: str(u.can_do_en),
    status: normStatus(obj(statuses)[u.id]), href: unitHref(u.id) };
}
// Today: the current unit of `level` (a number, "第1級", "1*" …; default: the learner's level, else 1): the first
// released unit of that level that is not done. -> {id, level, levelLabel, order, title_zh, title_en, topic,
// can_do_en, status, href} or null (no units for the level yet, or all of its released units are done).
// Open it with a timer: unitHref(id, {minutes}).
export async function currentUnit(level = null) {
  const [units, plan] = await Promise.all([loadUnits(), loadJSON("plan").catch(() => null)]);
  const n = parseLevelN(level) ?? learnerLevel() ?? 1;
  const statuses = statusMap();
  const u = pickCurrent(units.list, n, releasedIds(plan), statuses);
  return u ? unitSummary(u, statuses) : null;
}

// ------------------------------------------------------------------ page plumbing
const app = typeof document !== "undefined" ? document.querySelector('#app[data-page="units"]') : null;
const PAGE_TITLE = "課程 Units · 國語自學";
let D = null;            // {list, byId, missing, partial, released}
let view = null;         // the unit on screen: {id, u, cleanup[], redraw: Set, painters: Set, stopDialogue()}
const running = new Set(); // drill controllers {stop(), done} on screen
const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const behavior = () => (reduceMotion() ? "auto" : "smooth");
const notice = (zh, en, role = "note") => h("p", { class: "un-notice", role }, zh, " ", enText(en));
const levelName = n => `第${n}級`;

function run(ctl) {
  if (!ctl) return ctl;
  running.add(ctl);
  Promise.resolve(ctl.done).catch(() => {}).finally(() => running.delete(ctl));
  return ctl;
}
// Before a view is replaced: its own cleanups (dialogue players, timer, pending draft), its drills, all audio.
function leaveView() {
  if (view) for (const f of view.cleanup.splice(0)) { try { f(); } catch (err) { console.error(err); } }
  view = null;
  for (const c of [...running]) { try { c.stop(); } catch (err) { console.error(err); } }
  running.clear();
  stopStream();
  stopAll();
}
const paintStatus = () => { if (view) for (const f of view.painters) f(); };
const redrawRuby = () => { if (view) for (const f of view.redraw) f(); };

// The Library module (vocabulary statuses, grammar titles), loaded on first use: Today imports this file without it.
let libP = null;
function library() {
  return (libP ||= import("./library.js").then(async m => ({ m, lib: await m.loadLibrary() }))
    .catch(err => { console.warn("Library not available:", err); libP = null; return null; }));
}

// ---------- streamed MOE clips (an <audio> on the moedict CDN, cut at the span end by the page, as in library.js)
let stream = null; // {audio, raf, timer, done}
function stopStream() {
  const s = stream;
  if (!s) return;
  stream = null;
  cancelAnimationFrame(s.raf);
  clearTimeout(s.timer);
  try { s.audio.pause(); } catch { /* ignore */ }
  s.done();
}
function playStream(id, span) {
  stopAll();
  stopStream();
  const a = new Audio(streamUrlOf(id, span));
  a.preload = "auto";
  const start = span ? span[0] : 0, end = span ? span[1] : UNSPANNED_MAX;
  return new Promise((resolve, reject) => {
    const me = { audio: a, raf: 0, timer: 0, done: resolve };
    stream = me;
    const tick = () => {
      if (stream !== me) return;
      if (a.currentTime >= end - 0.01 || a.ended) { stopStream(); return; }
      me.raf = requestAnimationFrame(tick);
    };
    a.addEventListener("loadedmetadata", () => { if (span && a.currentTime < start - 0.05) { try { a.currentTime = start; } catch { /* ignore */ } } });
    a.addEventListener("playing", () => {
      if (stream !== me) return;
      cancelAnimationFrame(me.raf); clearTimeout(me.timer);
      me.raf = requestAnimationFrame(tick);
      me.timer = setTimeout(() => { if (stream === me) stopStream(); }, Math.max(0.2, end - Math.max(start, a.currentTime)) * 1000 + 120);
    });
    a.addEventListener("timeupdate", () => { if (stream === me && a.currentTime >= end - 0.01) stopStream(); });
    a.addEventListener("ended", () => { if (stream === me) stopStream(); });
    a.addEventListener("error", () => { if (stream === me) { stream = null; reject(new Error("stream")); } });
    a.play().catch(err => { if (stream === me) { stream = null; reject(err); } });
  });
}
// A vocabulary word's play button: self-hosted MOE clip or streamed MOE clip (each labelled). A word with no MOE clip
// gets a disabled button and a 無錄音 note: the browser voice misreads lone words and cannot say the neutral tone (§7.6).
function vocabAudio(v) {
  const id = v.id != null && v.id !== "" ? String(v.id) : null;
  const local = id && audioInfo(id);
  if (local && local.src === "moe") return playButton({ id, zh: v.zh });
  if (!id) return h("span", { class: "row", style: "gap:6px" },
    h("button", { class: "btn icon", type: "button", disabled: true, title: NO_CLIP, "aria-label": `播放 Play ${v.zh} — ${NO_CLIP}` }, "🔊"),
    h("span", { class: "badge none un-noclip", "aria-hidden": "true" }, ...bi("無錄音", "no MOE recording")));
  const span = spanOf(v.s);
  const name = span ? `${MOE_NAME} (streamed from moedict.tw)` : `${MOE_NAME} (streamed; first ${UNSPANNED_MAX} s, the word's exact span is not measured yet)`;
  const btn = h("button", { class: "btn icon un-stream", type: "button", title: name, "aria-label": `播放 Play ${v.zh} — ${name}`,
    onclick: async ev => {
      ev.stopPropagation();
      btn.classList.add("is-playing");
      try { await playStream(id, span); } catch { toast("無法播放（離線？） Could not play the MOE clip (offline?)"); }
      btn.classList.remove("is-playing");
    } }, "🔊");
  return h("span", { class: "row", style: "gap:6px" }, btn, h("span", { class: "badge human", "aria-hidden": "true" }, "MOE"));
}
function sourceName(l) {
  const path = lineAudioPath(l);
  if (!path) return VOICE_NAME;
  const e = audioInfo(l.audio);
  return (e && e.label) || TTS_NAME;
}
// "TTS (Google zh-TW)" -> "Google zh-TW" (next to a TTS badge)
const voiceOf = label => str(label).replace(/^TTS\s*\(?\s*/i, "").replace(/\)\s*$/, "") || str(label);
// Ruby for a line in the current Zhuyin mode: "all", "new" (only on the unit's vocabulary) or "off".
function drawRuby(el, item, words, mode) {
  const r = ruby(str(item.zh), str(item.zhuyin), { cls: "", spoken: item.spoken || null });
  if (mode === "new") {
    const mask = vocabMask(item.zh, words);
    r.querySelectorAll("ruby").forEach((x, j) => { if (!mask[j]) x.classList.add("un-plain"); });
  }
  el.classList.toggle("hide-ruby", mode === "off");
  el.replaceChildren(r);
}
function switchBtn(zh, en, get, set) {
  const b = h("button", { type: "button", role: "switch", class: "un-switch", "aria-checked": String(!!get()), onclick: () => {
    set(!get());
    b.setAttribute("aria-checked", String(!!get()));
  } }, h("span", { class: "un-switch-track", "aria-hidden": "true" }, h("span", { class: "un-switch-knob" })), h("span", {}, zh, " ", h("span", { lang: "en" }, en)));
  return b;
}
function statusMark(st) {
  const [, zh, en] = UNIT_STATUSES.find(s => s[0] === st) || UNIT_STATUSES[0];
  return h("span", { class: `un-st-mark st-${st}` }, h("span", { class: `un-st un-st-${st}`, "aria-hidden": "true" }),
    h("span", {}, zh, " ", h("span", { class: "un-st-en", lang: "en" }, en)));
}
const chip = (text, title = null, cls = "") => h("span", { class: `un-chip${cls}`, title }, text);
function levelChip(level) {
  const n = parseLevelN(level);
  if (n == null) return null;
  const star = /\*|＊/.test(str(level));
  return chip(`第${n}${star ? "*" : ""}級`, `TBCL level ${n}${star ? "*" : ""}`, " un-lv");
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  try {
    const ta = h("textarea", { style: "position:fixed;top:0;left:0;opacity:0", "aria-hidden": "true", tabindex: "-1" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch { return false; }
}
function timedMinutes() {
  try { const m = Number(new URLSearchParams(location.search).get("min")); return m > 0 && m <= 180 ? m : null; } catch { return null; }
}

// ------------------------------------------------------------------ boot and routes
async function boot() {
  mountShell("units");
  trackTime("units");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  const [units, plan] = await Promise.all([loadUnits(), loadJSON("plan").catch(() => null), loadJSON("audio").catch(() => null)]);
  D = { ...units, released: releasedIds(plan) }; // (app.js's audio index, for the play buttons' labels, is ready now too)
  window.addEventListener("hashchange", () => route());
  window.addEventListener("pagehide", () => { if (view) for (const f of view.cleanup) { try { if (f.onHide) f.onHide(); } catch (err) { console.error(err); } } });
  route({ initial: true });
}
function route({ initial = false } = {}) {
  const { id, section } = parseRoute(location.hash);
  const u = id ? D.byId.get(id) : null;
  if (u) {
    if (view && view.id === u.id) { if (section) goSection(section); return; }
    leaveView();
    renderUnit(u, { section, initial });
    return;
  }
  const from = view ? view.id : null;
  if (!initial && !view && app.dataset.view === "list" && !id) return;
  leaveView();
  renderList({ from, unknown: id || null });
}
function goSection(id, { instant = false } = {}) {
  const sec = document.getElementById(`sec-${id}`);
  if (!sec) return;
  sec.scrollIntoView({ block: "start", behavior: instant ? "auto" : behavior() });
  const head = sec.querySelector("h2");
  if (head) head.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ the list, by level
function renderList({ from = null, unknown = null } = {}) {
  app.dataset.view = "list";
  document.title = PAGE_TITLE;
  clear(app);
  app.append(h("div", { class: "page-head" },
    h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "課程"), h("span", { class: "en", lang: "en" }, "Units")),
    h("p", { class: "muted small un-lede" }, "每一課是屏東生活裡的一個場景：對話、生詞、語法、發音重點、跟讀、理解、說和寫。",
      enText(" Each unit is one everyday situation in Pingtung: a dialogue, its words and grammar, a pronunciation focus, shadowing, a comprehension check, speaking and writing."))));
  if (unknown) app.append(notice(`找不到「${unknown}」這一課。`, "There is no such unit; here is the list.", "status"));
  if (!D.list.length) {
    app.append(notice("課程資料還沒建置。", "The units data (docs/data/units.json) isn't built yet: run tools/build.py.", "status"));
    return;
  }
  if (D.partial) app.append(notice("目前只有課名。", "Only the unit titles are built so far (units-index.json); the lessons arrive with docs/data/units.json."));
  const statuses = statusMap(), quiz = mapOf(KEYS.quiz);
  const placed = learnerLevel(), level = placed ?? 1;
  const cur = pickCurrent(D.list, level, D.released, statuses);
  if (cur) app.append(currentCard(cur, statuses, placed));
  else if (!D.list.some(u => u._level === level)) {
    app.append(notice(`第${level}級的課程還沒有。`, `There are no Level ${level} units yet: they come with LEVEL-UP. The units below are still open to you.`));
  } else app.append(notice(`第${level}級開放的課程都完成了。`, `Every released Level ${level} unit is done: the level check on the Plan page is next.`));
  const levels = [...new Set(D.list.map(u => u._level))].sort((a, b) => (a ?? 99) - (b ?? 99));
  for (const n of levels) {
    const us = D.list.filter(u => u._level === n);
    const done = us.filter(u => normStatus(statuses[u.id]) === "done").length;
    const hid = `un-lv-${n ?? "x"}`;
    app.append(h("section", { class: "un-level", "aria-labelledby": hid },
      h("div", { class: "un-level-head" },
        h("h2", { id: hid }, ...(n != null ? [levelName(n), " ", h("span", { class: "en", lang: "en" }, `Level ${n}`)] : ["其他 ", h("span", { class: "en", lang: "en" }, "Other")])),
        h("span", { class: "un-level-n" }, `${done} / ${us.length} 完成 `, h("span", { lang: "en" }, "done"))),
      h("div", { class: "progress un-level-bar", "aria-hidden": "true" }, h("i", { style: `width:${us.length ? Math.round(100 * done / us.length) : 0}%` })),
      h("ol", { class: "un-units" }, us.map(u => h("li", {}, unitRow(u, normStatus(statuses[u.id]), obj(quiz[u.id]), !!cur && cur.id === u.id))))));
  }
  if (from) {
    const a = [...app.querySelectorAll("a.un-row")].find(x => x.dataset.id === from);
    if (a) a.focus();
  }
}
function currentCard(u, statuses, placed) {
  const st = normStatus(statuses[u.id]);
  const [vz, ve] = st === "review" ? ["複習", "Review it"] : st === "progress" ? ["繼續", "Continue"] : ["開始", "Start"];
  return h("section", { class: "un-current", "aria-labelledby": "un-cur-k" },
    h("p", { class: "un-current-k", id: "un-cur-k" }, "目前這一課 ", enText("Current unit"), ` · ${levelName(u._level)}`,
      placed == null ? h("span", { class: "muted" }, "（", enText("not placed yet: starting at Level 1"), "）") : null),
    h("p", { class: "un-current-t" }, h("span", { lang: "zh-Hant-TW" }, str(u.title_zh) || u.id), " ", h("span", { class: "en", lang: "en" }, str(u.title_en))),
    u.can_do_en ? h("p", { class: "un-current-goal" }, enText(u.can_do_en, { class: "lc-en" })) : null,
    st === "review" ? h("p", { class: "un-current-note small" }, ...bi("上次理解測驗低於 70%：先複習這一課，再開始新的一課。", "The last comprehension check was below 70%: review this unit before starting a new one.")) : null,
    h("div", { class: "row" }, h("a", { class: "btn primary", href: `#${encodeURIComponent(u.id)}` }, ...bi(vz, ve), h("span", { "aria-hidden": "true" }, " →")), statusMark(st)));
}
// A unit's topic mixes Chinese and English ("夜市 and prices", "打招呼/自我介紹 (greetings, …)"): the English runs get
// lang="en" so immersion mode hides them; a topic with no Chinese at all is English as a whole. Capitals (ATM, LINE) stay.
export function topicRun(s) {
  s = str(s);
  if (!/\p{sc=Han}/u.test(s)) return enText(s);
  return h("span", { lang: "zh-Hant-TW" }, s.split(/(\(?[a-z][a-z ,&'/-]*[a-z]\)?)/).map((part, i) => (i % 2 ? h("span", { lang: "en" }, part) : part)));
}
function unitRow(u, st, q, current) {
  const rel = isReleased(u.id, D.released);
  const sub = [u.topic ? topicRun(u.topic) : null,
    q.last != null ? h("span", {}, "測驗 ", h("span", { lang: "en" }, "quiz"), ` ${q.last}%`) : null,
    current ? h("span", { class: "un-row-cur" }, "目前 ", h("span", { lang: "en" }, "current")) : null,
    !rel ? h("span", {}, "尚未開放 ", h("span", { lang: "en" }, "not released yet")) : null].filter(Boolean);
  return h("a", { class: `un-row${current ? " current" : ""}${rel ? "" : " unreleased"}`, href: `#${encodeURIComponent(u.id)}`, "data-id": u.id },
    h("span", { class: "un-row-n" }, h("span", { class: "sr-only" }, "第"), String(u._order || "·"), h("span", { class: "sr-only" }, "課 ")),
    h("span", { class: "un-row-body" },
      h("span", { class: "un-row-zh", lang: "zh-Hant-TW" }, str(u.title_zh) || u.id),
      u.title_en ? h("span", { class: "un-row-en", lang: "en" }, str(u.title_en)) : null,
      sub.length ? h("span", { class: "un-row-sub" }, sub.map((x, i) => [i ? " · " : null, x])) : null),
    statusMark(st));
}

// ------------------------------------------------------------------ one unit
function renderUnit(u, { section = "", initial = false } = {}) {
  app.dataset.view = "unit";
  document.title = `${str(u.title_zh) || u.id} · 課程 Units · 國語自學`;
  view = { id: u.id, u, cleanup: [], redraw: new Set(), painters: new Set(), stopDialogue: () => {} };
  clear(app);
  const present = SECTIONS.filter(([id]) => hasSection(u, id));
  const minutes = timedMinutes();
  if (minutes && unitStatus(u.id) === "new") setUnitStatus(u.id, "progress");
  const eyebrow = [u._level != null ? levelName(u._level) : null, u._order ? `第 ${u._order} 課` : null, str(u.topic) ? topicRun(u.topic) : null]
    .filter(Boolean).flatMap((x, i) => (i ? [" · ", x] : [x]));
  const head = h("header", { class: "un-head" },
    h("a", { class: "un-back", href: "#" }, h("span", { "aria-hidden": "true" }, "← "), ...bi("所有課程", "All units")),
    h("p", { class: "un-eyebrow" }, ...eyebrow, u._level != null ? ["｜", h("span", { class: "un-eyebrow-en", lang: "en" }, `Level ${u._level}${u._order ? `, Unit ${u._order}` : ""}`)] : null),
    h("h1", { id: "un-title", class: "un-title", tabindex: "-1" }, h("span", { lang: "zh-Hant-TW" }, str(u.title_zh) || u.id),
      u.title_en ? h("span", { class: "en", lang: "en" }, str(u.title_en)) : null),
    statusControl(u),
    !isReleased(u.id, D.released) ? notice("這一課還沒開放。", "This unit isn't released in your plan yet: you can still look ahead.") : null,
    minutes ? unitTimer(u, minutes) : null,
    present.length > 1 ? h("nav", { class: "un-toc", "aria-label": "這一課的內容 In this unit" },
      h("ol", {}, present.map(([id, zh, en], i) => h("li", {}, h("a", { href: `#${encodeURIComponent(u.id)}/${id}` },
        h("span", { class: "un-toc-n", "aria-hidden": "true" }, String(i + 1)), zh, h("span", { class: "un-toc-en", lang: "en" }, ` ${en}`)))))) : null);
  const root = h("article", { class: "un-unit", "aria-labelledby": "un-title" }, head);
  if (!present.length) root.append(notice("這一課的內容還沒建置。", "This unit's lesson isn't built yet (docs/data/units.json): run tools/build.py.", "status"));
  const builders = { goal: goalSection, dialogue: dialogueSection, vocab: vocabSection, grammar: grammarSection, pron: pronSection,
    shadow: shadowSection, check: checkSection, speak: speakSection, write: writeSection, culture: cultureSection };
  present.forEach(([id, zh, en], i) => {
    const sec = h("section", { class: `un-sec un-sec-${id}`, id: `sec-${id}`, "aria-labelledby": `h-${id}` },
      h("h2", { id: `h-${id}`, tabindex: "-1" }, h("span", { class: "un-sec-n", "aria-hidden": "true" }, String(i + 1)),
        h("span", {}, zh), h("span", { class: "en", lang: "en" }, en)));
    try { builders[id](sec, u); } catch (err) {
      console.error(err);
      sec.append(notice("這一段無法顯示。", `This section could not be shown: ${err && err.message ? err.message : err}`, "status"));
    }
    root.append(sec);
  });
  root.append(footer(u));
  // Any other button stops the dialogue and a streamed word (the dialogue's own controls and the stream button
  // excepted); the first real interaction marks a not-started unit "in progress".
  root.addEventListener("click", ev => {
    const t = ev.target instanceof Element ? ev.target.closest("button, input, select, summary, textarea") : null;
    if (!t) return;
    if (t.matches("button") && !t.closest(".un-dlg-zone") && view) view.stopDialogue();
    if (t.matches("button") && !t.closest(".un-stream")) stopStream();
    if (!t.closest(".un-status") && unitStatus(u.id) === "new") { setUnitStatus(u.id, "progress"); paintStatus(); }
  }, true);
  app.append(root);
  if (section && present.some(s => s[0] === section)) goSection(section, { instant: initial });
  else if (!initial) { window.scrollTo(0, 0); root.querySelector("#un-title").focus({ preventScroll: true }); }
}
// Four buttons, one pressed (the unit's status); every copy on the page repaints together.
function statusControl(u) {
  const box = h("div", { class: "un-status", role: "group", "aria-label": "這一課的狀態 Unit status" });
  for (const [k, zh, en] of UNIT_STATUSES) {
    box.append(h("button", { type: "button", "data-s": k, "aria-pressed": "false", onclick: () => {
      setUnitStatus(u.id, k);
      paintStatus();
      if (k === "done") toast("這一課完成了 ✓ Unit marked done");
    } }, h("span", { class: `un-st un-st-${k}`, "aria-hidden": "true" }), h("span", {}, zh), h("span", { class: "un-st-en", lang: "en" }, en)));
  }
  const paint = () => { const st = unitStatus(u.id); for (const b of box.children) b.setAttribute("aria-pressed", String(b.dataset.s === st)); };
  view.painters.add(paint);
  paint();
  return box;
}
function footer(u) {
  const i = D.list.indexOf(u);
  const next = D.list.slice(i + 1).find(x => x._level === u._level) || null;
  return h("footer", { class: "un-foot" },
    h("p", { class: "un-foot-k" }, "這一課做完了嗎？", enText(" Finished this unit? Mark it done, or Needs review to come back to it.")),
    statusControl(u),
    h("div", { class: "row un-foot-links" },
      next ? h("a", { class: "btn", href: `#${encodeURIComponent(next.id)}` }, ...bi("下一課", "Next unit"), "：", h("span", { lang: "zh-Hant-TW" }, str(next.title_zh) || next.id), h("span", { "aria-hidden": "true" }, " →")) : null,
      h("a", { class: "btn", href: "#" }, ...bi("所有課程", "All units"))));
}
// Today's unit block (?min=N): counts visible time down from N minutes; 80 % makes the block done (home.js rule).
function unitTimer(u, minutes) {
  const total = minutes * 60;
  const old = obj(routineToday().unit);
  let used = Math.max(0, Number(old.minutes) || 0) * 60, done = !!old.done, paused = false, finished = used >= total;
  let last = performance.now(), lastSave = last, wasVisible = document.visibilityState === "visible";
  const time = h("span", { class: "un-timer-t" });
  const bar = h("div", { class: "progress un-timer-bar", "aria-hidden": "true" }, h("i", { style: "width:0%" }));
  const live = h("span", { class: "sr-only", "aria-live": "polite" });
  const pauseBtn = h("button", { type: "button", class: "btn small", "aria-pressed": "false", onclick: () => {
    tick(); paused = !paused; pauseBtn.setAttribute("aria-pressed", String(paused)); paint();
  } }, ...bi("暫停", "Pause"));
  const box = h("div", { class: "un-timerbar", role: "group", "aria-label": "單元時間 Unit time" },
    h("span", { class: "un-timer-k" }, h("span", { "aria-hidden": "true" }, "⏱ "), "單元時間 ", enText("Unit time")),
    h("span", { role: "timer", class: "un-timer-v" }, time), pauseBtn,
    h("a", { class: "btn small", href: "index.html" }, ...bi("回到今天", "Back to Today")), bar, live);
  function paint() {
    const left = Math.max(0, total - used);
    time.replaceChildren(...[finished ? "✓ " : "", fmtClock(left), " ", h("span", { class: "muted small" }, finished ? "時間到 " : "剩下 ", enText(finished ? "time's up" : "left")),
      paused ? h("span", { class: "muted small" }, "（暫停 ", enText("paused"), "）") : ""]); // never null: replaceChildren would print it
    bar.firstChild.style.width = `${Math.round(100 * Math.min(1, used / total))}%`;
  }
  function save() { lastSave = performance.now(); saveRoutineUnit({ done, minutes: Math.round(used / 6) / 10, planned: minutes, at: Date.now(), id: u.id }); }
  function tick() {
    const now = performance.now();
    if (!paused && wasVisible) used += Math.min(now - last, 5000) / 1000; // a longer gap: the machine slept
    last = now;
    wasVisible = document.visibilityState === "visible";
    if (!done && used >= DONE_SHARE * total) { done = true; save(); }
    if (!finished && used >= total) {
      finished = true;
      live.replaceChildren("單元時間到。", enText(" Unit time is up."));
      toast("單元時間到 Unit time is up");
      save();
    }
    if (now - lastSave > 30000) save();
    paint();
  }
  const iv = setInterval(tick, 1000);
  document.addEventListener("visibilitychange", tick);
  const stop = () => { clearInterval(iv); document.removeEventListener("visibilitychange", tick); tick(); save(); };
  stop.onHide = () => { tick(); save(); };
  view.cleanup.push(stop);
  paint();
  return box;
}

// ---------- 1. can-do goal
function goalSection(sec, u) {
  sec.append(h("div", { class: "un-goal" }, h("p", { class: "un-goal-k" }, "學完這一課，", enText("after this unit:")), h("p", { class: "un-goal-t" }, enText(u.can_do_en, { class: "lc-en" }))));
}

// ---------- 2. dialogue (the signature): speakers on one thread, play all / per line, display switches
function dialogueSection(sec, u) {
  sec.classList.add("un-dlg-zone");
  const lines = arr(u.dialogue).filter(l => l && l.zh);
  const words = arr(u.vocab).map(v => v && v.zh).filter(Boolean);
  const speakers = [];
  for (const l of lines) { const s = str(l.speaker); if (!speakers.includes(s)) speakers.push(s); }
  let rate = RATES.includes(Number(prefs().rate)) ? Number(prefs().rate) : 1;
  const list = h("ol", { class: "un-dlg" });
  const players = new Map();
  let playing = null; // {cancelled, all, i, player, wake}
  const rows = lines.map((l, i) => {
    const who = str(l.speaker);
    const k = Math.max(0, speakers.indexOf(who)) % 3;
    const cont = i > 0 && str(lines[i - 1].speaker) === who;
    const zhEl = h("p", { class: "un-line-zh" });
    const draw = () => drawRuby(zhEl, l, words, prefs().ruby);
    view.redraw.add(draw);
    draw();
    const src = sourceName(l);
    const btn = h("button", { type: "button", class: "btn icon un-line-play", title: src,
      "aria-label": `播放第 ${i + 1} 句 Play line ${i + 1}: ${who ? who + "：" : ""}${l.zh} — ${src}`,
      onclick: () => (playing && !playing.all && playing.i === i ? stop() : playLines(i, i)) }, h("span", { "aria-hidden": "true" }, "▶"));
    return h("li", { class: `un-line sp${k}${cont ? " cont" : ""}` },
      h("span", { class: "un-avatar", "aria-hidden": "true" }, [...who][0] || "·"),
      h("div", { class: "un-say" }, h("p", { class: "un-who" }, who || "—"), zhEl, l.en ? h("p", { class: "un-line-en" }, enText(l.en, { class: "lc-en" })) : null),
      btn);
  });
  list.append(...rows);
  const p0 = prefs();
  list.classList.toggle("no-en", !p0.en);
  list.classList.toggle("no-text", !p0.text);

  const playAll = h("button", { type: "button", class: "btn primary un-playall", onclick: () => (playing && playing.all ? stop() : playLines(0, lines.length - 1)) });
  const paintAll = () => playAll.replaceChildren(...(playing && playing.all
    ? [h("span", { "aria-hidden": "true" }, "■ "), ...bi("停止", "Stop")] : [h("span", { "aria-hidden": "true" }, "▶ "), ...bi("全部播放", "Play all")]));
  paintAll();
  const speedBtns = RATES.map(r => h("button", { type: "button", "data-r": String(r), "aria-pressed": String(r === rate), onclick: () => {
    rate = r;
    setPref("rate", r);
    for (const b of speedBtns) b.setAttribute("aria-pressed", String(Number(b.dataset.r) === r));
    for (const p of players.values()) p.setRate(r);
  } }, `${r === 1 ? "1.0" : r}×`));
  const rubyBtns = [["all", "全部", "All"], ["new", "生詞", "New words"], ["off", "關", "Off"]].map(([k, zh, en]) => h("button", { type: "button", "data-k": k,
    "aria-pressed": String(p0.ruby === k), onclick: () => {
      setPref("ruby", k);
      for (const b of rubyBtns) b.setAttribute("aria-pressed", String(b.dataset.k === k));
      redrawRuby();
    } }, zh, " ", h("span", { lang: "en" }, en)));
  const nTts = lines.filter(l => lineAudioPath(l)).length;
  const firstTts = lines.find(l => lineAudioPath(l));
  const src = h("p", { class: "un-src small" },
    nTts ? [h("span", { class: "badge tts", title: sourceName(firstTts) }, "TTS"), " ", h("span", { lang: "en" }, voiceOf(sourceName(firstTts))),
      nTts < lines.length ? [" · ", h("span", { class: "badge none" }, "瀏覽器語音"), " ", enText(`${lines.length - nTts} line${lines.length - nTts > 1 ? "s" : ""} in the browser voice`)] : null]
      : [h("span", { class: "badge none" }, "瀏覽器語音"), " ", enText("No recordings built for this dialogue yet: the browser's zh-TW voice reads it.")]);
  const srcNote = h("p", { class: "un-src-note muted small" }, ...bi("合成語音：聽節奏和詞；聲調以教育部真人錄音為準。", "Synthetic voice: listen for rhythm and words; the MOE human recordings are the tone model."));
  sec.append(
    h("div", { class: "un-dlg-bar" }, playAll, h("span", { class: "seg", role: "group", "aria-label": "速度 Speed" }, speedBtns)),
    src, srcNote,
    h("div", { class: "un-dlg-opts" },
      switchBtn("文字", "Text", () => prefs().text, v => { setPref("text", v); list.classList.toggle("no-text", !v); }),
      switchBtn("英文", "English", () => prefs().en, v => { setPref("en", v); list.classList.toggle("no-en", !v); }),
      switchBtn("變調", "Sandhi", () => !!settings().sandhi, v => { setSetting("sandhi", v); redrawRuby(); }),
      h("span", { class: "un-ruby-opt" }, h("span", { class: "small muted", id: `un-zy-l` }, "注音 ", h("span", { lang: "en" }, "Zhuyin")),
        h("span", { class: "seg", role: "group", "aria-labelledby": "un-zy-l" }, rubyBtns))),
    list);

  async function playLines(from, to) {
    stop();
    stopStream();
    const me = { cancelled: false, all: to > from, i: from, player: null, wake: null };
    playing = me;
    paintAll();
    try {
      for (let i = from; i <= to && !me.cancelled; i++) {
        me.i = i;
        mark(i);
        if (me.all && i > from) rows[i].scrollIntoView({ block: "nearest", behavior: behavior() });
        if (me.all && i < to) playerFor(i + 1); // fetch the next line while this one plays
        const ok = await playOne(i, me);
        if (me.cancelled || ok === false) break; // stopped here, or by another player
        if (ok === null) { toast("無法播放（離線？） Could not play this line (offline?)"); break; }
        if (i < to) await pauseFor(LINE_GAP / rate, me);
      }
    } finally {
      if (playing === me) { playing = null; mark(-1); paintAll(); }
    }
  }
  function playerFor(i) {
    const l = lines[i], path = lineAudioPath(l);
    if (!path) return null;
    let p = players.get(i);
    if (!p) {
      p = new ShadowPlayer({ src: path, rate, dur: Number(l.dur) > 0 ? Number(l.dur) : null, owner: list });
      players.set(i, p);
    }
    return p;
  }
  async function playOne(i, me) {
    const p = playerFor(i);
    me.player = p;
    if (p) {
      p.setRate(rate);
      try { return await p.play(); } catch (err) { console.error(err); return null; }
    }
    await speak(lines[i].zh, { rate: 0.9 * rate });
    return true;
  }
  function pauseFor(sec, me) {
    return new Promise(res => { const t = setTimeout(res, sec * 1000); me.wake = () => { clearTimeout(t); res(); }; });
  }
  function stop() {
    const me = playing;
    if (!me) return;
    me.cancelled = true;
    playing = null;
    if (me.player) me.player.stop();
    else if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    if (me.wake) me.wake();
    mark(-1);
    paintAll();
  }
  function mark(i) {
    rows.forEach((r, j) => {
      const on = j === i;
      r.classList.toggle("is-current", on);
      if (on) r.setAttribute("aria-current", "true"); else r.removeAttribute("aria-current");
      r.querySelector(".un-line-play").classList.toggle("is-playing", on);
    });
  }
  view.stopDialogue = stop;
  view.cleanup.push(() => { stop(); for (const p of players.values()) p.dispose(); players.clear(); });
}

// ---------- 3. vocabulary: ruby, meaning, part of speech, measure word, TBCL level, audio, Library status
function vocabSection(sec, u) {
  const items = arr(u.vocab).filter(v => v && v.zh);
  const rows = [];
  let LIBX = null; // {m: the library.js module, lib: its data} once loaded
  const bulk = h("button", { type: "button", class: "btn small", disabled: true, onclick: () => {
    if (!LIBX) return;
    let n = 0;
    for (const r of rows) if (r.entry && LIBX.m.statusOf(r.entry) === "new") { LIBX.m.setStatus(r.entry, "learning"); r.sel.value = "learning"; n++; }
    toast(n ? `已把 ${n} 個詞設為學習中 ${n} word${n > 1 ? "s" : ""} marked Learning` : "沒有新的詞 No words left at New");
  } }, ...bi("全部設為學習中", "Mark all Learning"));
  sec.append(h("div", { class: "un-sec-bar" },
    h("p", { class: "muted small" }, `${items.length} 個詞。`, enText(" New in this unit. The status goes into your Library.")), bulk));
  const ul = h("ul", { class: "un-vocab" });
  for (const v of items) {
    const word = h("span", { class: "un-v-zh" });
    const draw = () => word.replaceChildren(ruby(str(v.zh), str(v.zhuyin), { cls: "", spoken: v.spoken || null }));
    view.redraw.add(draw);
    draw();
    // pinyin aid: style.css shows .py-aid only when the pinyin setting is on (off by default)
    const py = v.p ? h("span", { class: "py-aid small muted", lang: "zh-Latn-pinyin" }, " ", str(v.p)) : null;
    const cell = h("div", { class: "un-v-word" }, word, py);
    const sel = h("select", { class: "un-vstatus", "aria-label": `資料庫狀態 Library status: ${v.zh}`, disabled: true }, h("option", { value: "" }, "…"));
    const ms = (Array.isArray(v.measure) ? v.measure : [v.measure]).map(str).filter(Boolean);
    const meta = [v.pos ? chip(h("span", { lang: "en" }, POS[v.pos] || str(v.pos)), "part of speech 詞性") : null,
      ms.length ? chip(["量詞 ", ms.join("、")], "measure word 量詞") : null, levelChip(v.level)].filter(Boolean);
    ul.append(h("li", { class: "un-v" }, cell,
      h("div", { class: "un-v-body" }, v.en ? h("p", { class: "un-v-en" }, enText(v.en, { class: "lc-en" })) : null, h("div", { class: "un-v-meta" }, meta, sel)),
      h("div", { class: "un-v-play" }, vocabAudio(v))));
    rows.push({ v, sel, cell, word, py, entry: null });
  }
  sec.append(ul);
  library().then(L => {
    if (!sec.isConnected) return;
    if (!L) { for (const r of rows) r.sel.replaceChildren(h("option", { value: "" }, "—")); return; }
    LIBX = L;
    const { m, lib } = L;
    for (const r of rows) {
      const zk = m.zhuyinKey(r.v.zhuyin);
      const found = m.resolve(lib.lookup, "word", r.v.zh, r.v.zh, r.v.zhuyin);
      const same = found && (!found.zhuyin || m.zhuyinKey(found.zhuyin) === zk) ? found : null;
      // not in the Library (or only another reading): the key the Library would give this word, and what the unit
      // knows of it (library.js keeps it with the status: the word then reaches Today's Review and the Library)
      const v = r.v;
      r.entry = same || { type: "word", key: found ? `${v.zh}|${zk}` : v.zh, zh: v.zh, zhuyin: v.zhuyin,
        extra: { zh: str(v.zh), zhuyin: str(v.zhuyin), spoken: v.spoken || null, en: str(v.en), p: str(v.p), id: v.id || null, s: Array.isArray(v.s) ? v.s : null, unit: str(u.id) } };
      const st = m.statusOf(r.entry);
      if (!same && st !== "new") m.setStatus(r.entry, st); // a status saved before the word was kept: keep it now
      r.sel.replaceChildren(...m.STATUSES.map(([k, zh, en]) => h("option", { value: k }, `${zh} ${en}`)));
      r.sel.value = st;
      r.sel.disabled = false;
      r.sel.addEventListener("change", () => m.setStatus(r.entry, r.sel.value));
      if (same) r.cell.replaceChildren(h("a", { class: "un-v-link", href: m.entryHref(same), "aria-label": `${r.v.zh} — 在資料庫看 Open in the Library` }, r.word), r.py || "");
    }
    bulk.disabled = !rows.length;
  });
}

// ---------- 4. grammar: the unit's note, linked into the Library entry
function grammarSection(sec, u) {
  const ul = h("ul", { class: "un-gram" });
  const fills = [];
  for (const g of arr(u.grammar).filter(x => x && x.id)) {
    const id = String(g.id);
    const title = h("p", { class: "un-g-title" }, h("span", { class: "un-g-zh", lang: "en" }, id));
    const sub = h("p", { class: "un-g-sub" });
    const link = h("a", { class: "un-g-link", href: `library.html#e/grammar/${encodeURIComponent(id)}`, "aria-label": `${id} — 在資料庫看 Open in the Library` },
      ...bi("完整說明和例句", "Full notes and examples"), h("span", { "aria-hidden": "true" }, " →"));
    ul.append(h("li", { class: "un-g" }, title, sub, g.note_en ? h("p", { class: "un-g-note" }, enText(g.note_en, { class: "lc-en" })) : null, link));
    fills.push({ id, title, sub, link });
  }
  sec.append(ul);
  library().then(L => {
    if (!L || !sec.isConnected) return;
    for (const f of fills) {
      const e = L.m.resolve(L.lib.lookup, "grammar", f.id);
      if (!e) continue;
      f.title.replaceChildren(...[h("span", { class: "un-g-zh", lang: "zh-Hant-TW" }, e.zh), e.en ? h("span", { class: "un-g-en lc-en", lang: "en" }, e.en) : null,
        e.level ? levelChip(`第${e.level}級`) : null].filter(Boolean)); // replaceChildren would print a null
      const r = obj(e.raw);
      if (r.structure) f.sub.replaceChildren(h("span", { class: "un-g-k" }, "句型 ", h("span", { lang: "en" }, "Structure")), " ", enText(r.structure, { class: "lc-en" }));
      f.link.href = L.m.entryHref(e);
      f.link.setAttribute("aria-label", `${e.zh} — 在資料庫看 Open in the Library`);
    }
  });
}

// ---------- 5. pronunciation focus: the contrast (Lab) and the tone pair (Tone Gym); listening only here
function pronSection(sec, u) {
  const p = obj(u.pronunciation);
  if (str(p.note_en).trim()) sec.append(h("p", { class: "un-pron-note" }, enText(p.note_en, { class: "lc-en" })));
  const cards = h("div", { class: "un-pcards" });
  if (p.contrast) cards.append(contrastCard(String(p.contrast)));
  if (p.tone_pair) cards.append(pairCard(String(p.tone_pair), u));
  if (cards.children.length) sec.append(cards);
}
function contrastCard(id) {
  const name = h("p", { class: "un-pcard-big" }, h("span", { lang: "en" }, id));
  const acc = h("p", { class: "un-pcard-acc" });
  const host = h("div", { class: "un-drill-host" });
  let c = null, ctl = null;
  const start = h("button", { type: "button", class: "btn", disabled: true, onclick: () => openDrill() }, ...bi("在這裡練 10 題", "Practise 10 here"));
  const card = h("div", { class: "un-pcard" },
    h("p", { class: "un-pcard-k" }, "聽辨對比 ", enText("Listening contrast")), name, acc,
    h("div", { class: "row" }, start, h("a", { class: "btn", href: "lab.html#contrasts" }, ...bi("注音實驗室", "Zhuyin Lab"), h("span", { "aria-hidden": "true" }, " →"))),
    host);
  const paintAcc = () => {
    const a = recentAccuracy(contrastStats()[id]);
    acc.replaceChildren(...(a == null ? bi("還沒練過。", "Not practised yet.") : ["最近正確率 ", enText("recent accuracy"), ` ${a}%`]));
  };
  loadJSON("contrasts").then(list => {
    c = arr(list).find(x => x && x.id === id) || null;
    if (!c) { start.hidden = true; acc.replaceChildren(...bi("這個對比還沒建置。", "This contrast isn't in contrasts.json.")); return; }
    name.replaceChildren(h("span", { lang: "zh-Hant-TW" }, str(c.zh)), " ", enText(str(c.en), { class: "un-pcard-en lc-en" }));
    paintAcc();
    start.disabled = false;
  }).catch(() => { start.hidden = true; });
  function openDrill() {
    if (!c) return;
    start.hidden = true;
    const close = () => { if (ctl) { ctl.stop(); ctl = null; } clear(host); start.hidden = false; paintAcc(); start.focus(); };
    ctl = run(contrastDrill(host, c, { n: 10, again: true, focus: true, onDone: paintAcc,
      actions: () => [h("button", { type: "button", class: "btn", onclick: close }, ...bi("收起", "Close"))] }));
  }
  return card;
}
function pairCard(pair, u) {
  const d = str(pair).replace(/\D/g, "").slice(0, 2);
  const tones = [...d].map(x => (x === "0" ? 5 : Number(x)));
  const icons = h("span", { class: "un-icons", "aria-hidden": "true" }, tones.map(t => { try { return contourIcon(t, { size: 26 }); } catch { return null; } }));
  const inVocab = arr(u.vocab).filter(v => v && v.zh && hasTonePair(v.zhuyin, d, v.spoken || null)).slice(0, 8);
  const words = inVocab.length ? inVocab : pairBigrams(u.dialogue, d); // else where the dialogue says the pair (你好, 我買)
  const wordsEl = h("p", { class: "un-pairwords" });
  const draw = () => wordsEl.replaceChildren(h("span", { class: "un-pcard-k" }, ...(inVocab.length ? ["這一課的詞 ", enText("In this unit's words:")] : ["對話裡 ", enText("In the dialogue:")])),
    ...words.map(v => ruby(str(v.zh), str(v.zhuyin), { cls: "un-pairword", spoken: v.spoken || null })));
  if (words.length) { view.redraw.add(draw); draw(); }
  return h("div", { class: "un-pcard" },
    h("p", { class: "un-pcard-k" }, "雙字聲調 ", enText("Tone pair")),
    h("p", { class: "un-pcard-big" }, icons, " ", tones.join(" + "), " ", h("span", { class: "un-pcard-en" }, tones.map(t => TONE_NAMES[t] || t).join(" + "))),
    words.length ? wordsEl : null,
    h("div", { class: "row" }, h("a", { class: "btn", href: "tones.html#pairs" }, ...bi("聲調館：雙字", "Tone Gym pairs"), h("span", { "aria-hidden": "true" }, " →"))));
}

// ---------- 6. shadowing: drills.js shadowLine on any line (speaking block)
function shadowSection(sec, u) {
  const lines = arr(u.shadowing).filter(l => l && l.zh);
  const words = arr(u.vocab).map(v => v && v.zh).filter(Boolean);
  let protocol = prefs().protocol === "full" ? "full" : "short";
  const protoBtns = [["short", "短版", "Short"], ["full", "完整六步", "Full guided"]].map(([k, zh, en]) => h("button", { type: "button", "data-k": k,
    "aria-pressed": String(protocol === k), onclick: () => {
      protocol = k;
      setPref("protocol", k);
      for (const b of protoBtns) b.setAttribute("aria-pressed", String(b.dataset.k === k));
    } }, zh, " ", h("span", { lang: "en" }, en)));
  sec.append(h("p", { class: "muted small" }, ...bi("選一句：聽、跟著說、錄音再聽自己的。短版：聽三次（停頓時跟著說）、一起說兩次、錄一次。完整：跟讀頁的六個步驟。",
    "Pick a line: listen, speak along, record and listen back. Short: listen ×3 (repeat in the pause), say it with the audio ×2, record once. Full: the Shadowing page's six steps.")),
  h("div", { class: "row un-sh-opts" }, h("span", { class: "small muted", id: "un-proto-l" }, "步驟 ", h("span", { lang: "en" }, "Steps")),
    h("span", { class: "seg", role: "group", "aria-labelledby": "un-proto-l" }, protoBtns)));
  const ol = h("ol", { class: "un-shlist" });
  let open = null; // {i, ctl, host, btn}
  const label = on => (on ? [h("span", { "aria-hidden": "true" }, "▾ "), ...bi("收起", "Close")] : [h("span", { "aria-hidden": "true" }, "⟲ "), ...bi("跟讀", "Shadow")]);
  function close(refocus) {
    if (!open) return;
    const o = open;
    open = null;
    try { if (o.ctl) o.ctl.stop(); } catch (err) { console.error(err); }
    clear(o.host);
    o.btn.setAttribute("aria-expanded", "false");
    o.btn.replaceChildren(...label(false));
    if (refocus) o.btn.focus();
  }
  lines.forEach((l, i) => {
    const zhEl = h("p", { class: "un-sh-zh" });
    const draw = () => drawRuby(zhEl, l, words, prefs().ruby);
    view.redraw.add(draw);
    draw();
    const host = h("div", { class: "un-sh-host" });
    const btn = h("button", { type: "button", class: "btn small un-sh-btn", "aria-expanded": "false", "aria-label": `跟讀 Shadow: ${l.zh}`,
      onclick: () => (open && open.i === i ? close(true) : start()) }, ...label(false));
    function start() {
      close(false);
      const item = { zh: str(l.zh), zhuyin: str(l.zhuyin), spoken: l.spoken || null, en: str(l.en), audio: l.audio || null,
        dur: Number(l.dur) > 0 ? Number(l.dur) : null, key: `unit:${u.id}:${i}` };
      const ctl = run(shadowLine(host, item, { protocol, again: true, focus: true, saveKey: item.key,
        actions: () => [h("button", { type: "button", class: "btn", onclick: () => close(true) }, ...bi("收起", "Close"))] }));
      open = { i, ctl, host, btn };
      btn.setAttribute("aria-expanded", "true");
      btn.replaceChildren(...label(true));
    }
    ol.append(h("li", { class: "un-sh" }, h("div", { class: "un-sh-row" },
      h("div", { class: "un-sh-text" }, zhEl, l.en ? h("p", { class: "un-sh-en" }, enText(l.en, { class: "lc-en" })) : null), btn), host));
  });
  sec.append(ol, h("p", { class: "small un-sh-more" }, h("a", { href: "shadow.html" }, "跟讀頁 ", h("span", { lang: "en" }, "Shadowing page")), " ",
    enText("has the full player (A–B loop, loops, more lines).")));
  view.cleanup.push(() => close(false));
}

// ---------- 7. comprehension check (scored; §8.6: below 70 % → review)
function checkSection(sec, u) {
  const qs = quizQuestions(u);
  const last = h("p", { class: "muted small un-quiz-last" });
  const paintLast = r => last.replaceChildren(...(r && r.last != null ? ["上次 ", enText("last"), ` ${r.last}%`, " · 最好 ", enText("best"), ` ${r.best}%`] : []));
  paintLast(quizRecord(u.id));
  sec.append(h("p", { class: "muted small" }, ...bi("先聽對話（關掉「文字」就只靠耳朵），再回答。70% 以上算通過；低於 70% 先複習這一課，再開始新的一課。",
    "Listen to the dialogue first (turn Text off to answer by ear), then answer. 70% or more passes; below 70%, review this unit before starting a new one.")), last);
  const form = h("form", { class: "un-quiz", novalidate: true });
  const groups = qs.map((q, i) => {
    const opts = arr(q.options_en).map((o, j) => {
      const input = h("input", { type: "radio", name: `un-q${i}`, value: String(j) });
      const mark = h("span", { class: "un-opt-mark" });
      return { label: h("label", { class: "un-opt" }, input, h("span", { class: "un-opt-t" }, enText(o, { class: "lc-en tr" })), mark), input, mark };
    });
    const fs = h("fieldset", { class: "un-q" }, h("legend", {}, h("span", { class: "un-q-n" }, `${i + 1}.`), " ", enText(q.question_en, { class: "lc-en tr" })), opts.map(o => o.label));
    return { q, fs, opts };
  });
  const out = h("div", { class: "un-quiz-out", "aria-live": "polite" });
  const checkBtn = h("button", { type: "submit", class: "btn primary" }, ...bi("檢查", "Check"));
  const again = h("button", { type: "button", class: "btn", hidden: true, onclick: reset }, ...bi("再做一次", "Try again"));
  form.append(...groups.map(g => g.fs), h("div", { class: "row" }, checkBtn, again), out);
  form.addEventListener("submit", e => { e.preventDefault(); check(); });
  sec.append(form);

  function check() {
    const answers = groups.map(g => { const c = g.opts.findIndex(o => o.input.checked); return c < 0 ? null : c; });
    const r = scoreQuiz(groups.map(g => g.q), answers);
    if (!r.complete) {
      const k = r.n - r.answered;
      out.replaceChildren(h("p", { class: "feedback bad" }, `還有 ${k} 題沒回答。`, enText(` ${k} question${k > 1 ? "s" : ""} not answered yet.`)));
      const miss = groups.find((g, i) => answers[i] == null);
      if (miss) miss.opts[0].input.focus();
      return;
    }
    groups.forEach((g, i) => {
      const right = Number(g.q.answer);
      g.opts.forEach((o, j) => {
        o.input.disabled = true;
        const isRight = j === right, chosen = j === answers[i];
        o.label.classList.toggle("is-right", isRight);
        o.label.classList.toggle("is-wrong", chosen && !isRight);
        o.mark.replaceChildren(...(isRight && chosen ? ["✓ 對 ", enText("right")] : isRight ? ["✓ 答案 ", enText("answer")] : chosen ? ["✗ 你選的 ", enText("yours")] : []));
      });
    });
    paintLast(saveQuiz(u.id, r));
    const prev = unitStatus(u.id), next = statusAfterQuiz(prev, r.pass);
    if (next !== prev) setUnitStatus(u.id, next);
    paintStatus();
    out.replaceChildren(resultCard(u, r, next));
    checkBtn.hidden = true;
    again.hidden = false;
    again.focus();
  }
  function reset() {
    for (const g of groups) for (const o of g.opts) { o.input.disabled = false; o.input.checked = false; o.label.classList.remove("is-right", "is-wrong"); o.mark.replaceChildren(); }
    out.replaceChildren();
    checkBtn.hidden = false;
    again.hidden = true;
    if (groups[0]) groups[0].opts[0].input.focus();
  }
}
function resultCard(u, r, st) {
  const score = `${r.correct} / ${r.n}（${r.pct}%）`;
  if (r.pass) {
    const doneBtn = h("button", { type: "button", class: "btn small", onclick: () => {
      setUnitStatus(u.id, "done");
      paintStatus();
      const ok = h("span", { class: "feedback good", tabindex: "-1" }, "✓ 完成 ", enText("Done"));
      doneBtn.replaceWith(ok);
      ok.focus({ preventScroll: true }); // the button is gone: keep focus here, not on <body>
      toast("這一課完成了 ✓ Unit marked done");
    } }, ...bi("標成完成", "Mark the unit done"));
    return h("div", { class: "un-result pass" },
      h("p", { class: "un-result-h" }, h("span", { "aria-hidden": "true" }, "✓ "), score, " 通過 ", enText("Passed")),
      st === "done" ? h("p", {}, ...bi("這一課已經完成。", "This unit is done."))
        : h("p", { class: "row" }, h("span", {}, ...bi("說和寫也做完了，就把這一課標成完成。", "Once the speaking and writing are done too, mark the unit done.")), doneBtn));
  }
  return h("div", { class: "un-result fail" },
    h("p", { class: "un-result-h" }, score, " 低於 70% ", enText("Below 70%")),
    h("p", {}, ...bi("先複習這一課再開始新的一課：再聽一次對話、看一遍生詞，然後再做一次。這一課已標成「需要複習」。",
      "Review this unit before starting a new one: replay the dialogue, go over the words, then try again. The unit is now marked Needs review.")),
    h("p", {}, h("a", { href: `#${encodeURIComponent(u.id)}/dialogue` }, ...bi("回到對話", "Back to the dialogue"))));
}

// ---------- 8. speaking task: prompt, a recording, the self-rating checklist (speaking block)
function speakSection(sec, u) {
  const s = obj(u.speaking);
  const items = arr(s.checklist_en).map(str).filter(x => x.trim());
  sec.append(h("div", { class: "un-task" },
    s.prompt_zh ? h("p", { class: "un-task-zh", lang: "zh-Hant-TW" }, str(s.prompt_zh)) : null,
    s.prompt_en ? h("p", { class: "un-task-en" }, enText(s.prompt_en, { class: "lc-en" })) : null),
  h("p", { class: "muted small" }, ...bi("先想一想，再大聲說出來並錄音。聽自己的錄音，然後勾選做到的。錄音只存在這台裝置上。",
    "Plan it, say it out loud and record it. Listen back, then tick what you did. Recordings stay on this device.")),
  h("div", { class: "un-rec" }, recordWidget({ key: `unit:${u.id}:speak`, label: "● 錄音 Record" })));
  if (!items.length) return;
  const saved = arr(mapOf(KEYS.checklist)[u.id]);
  const sum = h("p", { class: "un-check-sum small", "aria-live": "polite" });
  const boxes = items.map((t, i) => h("input", { type: "checkbox", checked: !!saved[i] }));
  const paint = () => {
    const n = boxes.filter(b => b.checked).length;
    sum.replaceChildren(`${n} / ${items.length} `, enText(n === items.length ? "all done" : "done"));
  };
  for (const b of boxes) b.addEventListener("change", () => {
    const m = { ...mapOf(KEYS.checklist) };
    m[u.id] = boxes.map(x => x.checked);
    store.set(KEYS.checklist, m);
    paint();
  });
  sec.append(h("fieldset", { class: "un-checklist" }, h("legend", {}, "自我檢查 ", enText("Self-check")),
    h("ul", {}, items.map((t, i) => h("li", {}, h("label", { class: "un-check" }, boxes[i], h("span", {}, enText(t, { class: "lc-en tr" }))))))), sum);
  paint();
}

// ---------- 9. writing task: a draft box, the Lab's Zhuyin keyboard, "copy for CORRECT", the model answer
function writeSection(sec, u) {
  const w = obj(u.writing);
  sec.append(h("div", { class: "un-task" },
    w.prompt_zh ? h("p", { class: "un-task-zh", lang: "zh-Hant-TW" }, str(w.prompt_zh)) : null,
    w.prompt_en ? h("p", { class: "un-task-en" }, enText(w.prompt_en, { class: "lc-en" })) : null));
  const taId = `un-write-${u.id}`;
  const ta = h("textarea", { id: taId, class: "un-write", lang: "zh-Hant-TW", rows: "5", spellcheck: "false", autocomplete: "off", autocapitalize: "off" });
  ta.value = str(mapOf(KEYS.writing)[u.id]);
  const count = h("span", { class: "un-count" });
  const savedEl = h("span", { class: "un-saved small muted" });
  let timer = 0;
  const save = () => {
    timer = 0;
    const m = { ...mapOf(KEYS.writing) };
    if (ta.value.trim()) m[u.id] = ta.value; else delete m[u.id];
    store.set(KEYS.writing, m);
    savedEl.replaceChildren("已存 ", enText("saved"));
  };
  const paintCount = () => { count.textContent = `${[...ta.value.replace(/\s/g, "")].length} 字`; };
  const changed = () => { paintCount(); clearTimeout(timer); timer = setTimeout(save, 500); };
  ta.addEventListener("input", changed);
  const flush = () => { if (timer) { clearTimeout(timer); save(); } };
  flush.onHide = flush;
  view.cleanup.push(flush);
  paintCount();

  const { kbd, press } = zhuyinKeyboard(ta, changed);
  kbd.id = `un-kbd-${u.id}`;
  kbd.hidden = true;
  const kbdBtn = h("button", { type: "button", class: "btn", "aria-expanded": "false", "aria-controls": kbd.id, onclick: () => setKbd(kbd.hidden) },
    h("span", { "aria-hidden": "true" }, "ㄅ "), ...bi("注音鍵盤", "Zhuyin keyboard"));
  function setKbd(on) {
    kbd.hidden = !on;
    kbdBtn.setAttribute("aria-expanded", String(on));
    if (on) ta.setAttribute("inputmode", "none"); else ta.removeAttribute("inputmode"); // no system keyboard over ours
  }
  // With the on-screen keyboard open, physical keys type Zhuyin in the standard layout (a system IME is left alone).
  ta.addEventListener("keydown", e => {
    if (kbd.hidden || e.isComposing || e.keyCode === 229 || e.ctrlKey || e.metaKey || e.altKey) return;
    const z = e.key && e.key.length === 1 ? KEYMAP[e.key.toLowerCase()] : null;
    if (!z) return;
    e.preventDefault();
    press(z);
  });
  const copyBtn = h("button", { type: "button", class: "btn primary", onclick: async () => {
    if (!ta.value.trim()) { toast("先寫一點再複製 Write something first"); ta.focus(); return; }
    flush();
    const ok = await copyText(correctText(u, ta.value));
    toast(ok ? "已複製：貼給 Claude，用 CORRECT 批改 Copied: paste it to Claude with CORRECT" : "無法自動複製：請選取文字自己複製 Could not copy: select the text and copy it");
  } }, ...bi("複製給 CORRECT", "Copy for CORRECT"));
  sec.append(h("label", { class: "un-write-l", for: taId }, "我寫的 ", enText("My text")), ta,
    h("div", { class: "un-write-bar" }, copyBtn, kbdBtn, h("span", { class: "un-write-meta" }, count, savedEl)), kbd,
    h("details", { class: "un-more" }, h("summary", {}, "怎麼打中文？", enText(" How to type Chinese")),
      h("p", { class: "small" }, ...bi("最好用系統的注音輸入法（標準：空白鍵＝一聲，6 ˊ、3 ˇ、4 ˋ、7 ˙）。", "Best: your system's Zhuyin keyboard (Standard layout: Space = tone 1, 6 ˊ, 3 ˇ, 4 ˋ, 7 ˙).")),
      h("ul", { class: "small un-setup" },
        h("li", {}, enText("Windows 11: Settings › Time & language › Language & region › Chinese (Traditional, Taiwan) › Microsoft Bopomofo (Standard).")),
        h("li", {}, enText("iPhone: Settings › General › Keyboard › Keyboards › Add › Chinese (Traditional) › Zhuyin.")),
        h("li", {}, enText("Android: Gboard › Languages › Add keyboard › 中文（台灣）注音."))),
      h("p", { class: "small" }, ...bi("「注音鍵盤」打的是注音符號，不會變成漢字：還不會寫的字可以先用注音寫。",
        "The Zhuyin keyboard button types Zhuyin symbols, not characters: write a word you can't write yet in Zhuyin."))));
  if (w.model_zh) {
    const model = h("p", { class: "un-model" });
    const draw = () => model.replaceChildren(ruby(str(w.model_zh), str(w.model_zhuyin), { cls: "" }));
    view.redraw.add(draw);
    draw();
    sec.append(h("details", { class: "un-more" }, h("summary", {}, "看範例 ", enText("Model answer")),
      h("p", { class: "muted small" }, ...bi("先自己寫，再看。", "Write yours first, then look.")), model));
  }
}
// The Lab's standard Zhuyin keyboard on a text box (lab.js KEY_ROWS). Returns {kbd, press(sym)}.
function zhuyinKeyboard(ta, after) {
  const press = sym => {
    const r = zhuyinInsert(ta.value, ta.selectionStart, ta.selectionEnd, sym);
    ta.value = r.value;
    try { ta.setSelectionRange(r.caret, r.caret); } catch { /* not focusable yet */ }
    after();
  };
  const keep = e => e.preventDefault(); // a mouse press keeps focus and the caret in the text box
  const key = (label, sym, { cls = "", aria = null, hint = null } = {}) => h("button", { type: "button", class: `key${cls}`, lang: "zh-Hant-TW",
    "aria-label": aria || label, onmousedown: keep, onclick: () => press(sym) }, label, hint ? h("small", { "aria-hidden": "true" }, hint) : null);
  const kbd = h("div", { class: "kbd un-kbd", role: "group", "aria-label": "標準注音鍵盤 Standard Zhuyin keyboard" },
    KEY_ROWS.map((row, r) => h("div", { class: `kbd-row r${r + 1}` }, row.map(([k, z]) => key(z, z, { cls: "ˊˇˋ˙".includes(z) ? " tone" : "", aria: TONE_KEY_NAMES[z] || z, hint: k })))),
    h("div", { class: "kbd-bottom un-kbd-bottom" },
      key("⌫", "Backspace", { aria: "刪除 Backspace" }),
      key("一聲 ␣", " ", { cls: " tone", aria: "一聲，下一個音節 Tone 1 / next syllable" }),
      key("，", "，", { aria: "逗號 comma" }),
      key("。", "。", { aria: "句號 full stop" })));
  return { kbd, press };
}

// ---------- 10. culture note
function cultureSection(sec, u) {
  sec.append(h("div", { class: "un-culture" }, h("p", { class: "un-culture-k" }, "臺灣小知識 ", enText("Taiwan note")), h("p", {}, enText(u.culture_en, { class: "lc-en" }))));
}

if (app) boot().catch(err => { console.error(err); app.append(h("p", { class: "feedback bad" }, "載入失敗 Could not load the units: ", String(err && err.message || err))); });
