// 計畫 Plan (MASTER_PROMPT §5.7, §8.1–§8.4; M4 design §4): the roadmap of §8.1 as a vertical path with the learner's
// position, logged hours against the §8.2 TOCFL estimates with an honest pace estimate and a goal date, the placement
// check (vocabulary sampling with a meaning check, listening and reading per level, the pronunciation diagnostic) and
// the level checks of §8.4.
//
// Store keys (app.js `store`, prefix "gy."):
//   plan.placement   the last placement result {kind, date, at, level, phase, levels: {n: {vocab, listening, reading}},
//                    diagnostic: {judged, perContrast, weakContrasts, red, perTone, weakTones, noMic}, startUnit,
//                    focus: "api"|"store"|"none"}
//   level            the TBCL level the learner studies now (a number 1-7): set by placement and by a passed check
//   plan.checks      {"<n>": the last level-check result of level n (same shape plus passed, practice)}
//   plan.history     [{date, kind, level, passed?, practice?}] (last 50)
//   plan.goal        {date: "YYYY-MM-DD", band: "A1"|"A2"|"B1"|"B2"}
//   plan.run.placement / plan.run.check   a check in progress (plain JSON), so it can be paused and resumed
//   focus.contrasts, lab.contrasts        weak contrasts go to the daily focus (drills.js has no setter: see addFocusContrasts)
//   tones.weak                            weak tones of the diagnostic (drills.js setWeakTones; toneWeights reads them)
// Settings read: dailyMinutes and studyDays (the weekly target and the goal-date advice).
// Listening and speaking stay separate blocks (§6.7): vocabulary → listening → reading → pronunciation. The diagnostic
// plays MOE human audio only (ground rule 5); listening items play MOE, TTS or the browser voice, always labelled.
import { h, $, clear, mountShell, store, loadJSON, ruby, playButton, playMoe, playFile, stopAudio, toast, today, logMinutes,
  settings, daysSinceStart, syllables, toneOf, enText, bi, audioContext, Recorder, canRecord, saveRecording, hasTwVoice } from "./app.js";
import * as App from "./app.js";
import * as pitch from "./pitch.js";
import * as drills from "./drills.js";

// ------------------------------------------------------------------ constants (§8.1, §8.2, §8.4)
const STUDY_DAYS = 6;          // §0 STUDY_DAYS_PER_WEEK (the default; Settings › Study days a week overrides it)
// Settings "studyDays" (1-7, saved by settings.js), else STUDY_DAYS.
export const studyDaysSetting = (s = settings()) => { const n = Math.round(Number(s && s.studyDays)); return n >= 1 && n <= 7 ? n : STUDY_DAYS; };
const PHASE0_DAYS = 28;        // Phase 0 sound reset: the first 4 weeks (§8.1)
const GOAL_LEVEL = 4;          // §0 GOAL: TOCFL Band B as fast as possible (Band B starts at TBCL 4, B1)
export const TH = { vocabPlace: 60, skillPlace: 50, vocabStop: 40, skillStop: 50, passVocab: 85, passSkill: 80 };
export const VOCAB_N = { placement: 10, check: 20 };   // words sampled per level
export const CHECK_N = { placement: 3, check: 5 };     // meaning checks per level (on "know" words)
const MOCK_URL = "https://tocfl.edu.tw/tocfl/index.php/exam/test";
const PHASES = { 0: ["發音重整", "Sound reset"], 1: ["生存", "Survival"], 2: ["日常生活", "Daily life"], 3: ["獨立", "Independent"],
  4: ["中高級", "Upper-intermediate"], 5: ["高級", "Advanced"] };
// §8.1, numbers as checked 2026-10-13. hours: the §8.2 TOCFL estimate of the band reached at the end of the level.
export const LEVELS = [
  { n: 1, phase: 1, band: "準備級一級", newW: 400, cumW: 400, chars: 246, grammar: 15 },
  { n: 2, phase: 1, band: "準備級二級 → A1", note: "End of Level 2 ≈ A1", newW: 406, cumW: 805, chars: 258, grammar: 92, hours: "A1" },
  { n: 3, phase: 2, band: "Band A 基礎級 · A2", note: "End of Level 3 ≈ A2", newW: 463, cumW: 1265, chars: 297, grammar: 134, hours: "A2" },
  { n: 4, phase: 3, band: "Band B 進階級 · B1", newW: 1429, cumW: 2685, chars: 499, grammar: 149, hours: "B1" },
  { n: 5, phase: 4, band: "Band B 高階級 · B2", note: "B2 sits between Level 5 and Level 6", newW: 2641, cumW: 5320, chars: 600, grammar: 106, hours: "B2" },
  { n: 6, phase: 5, band: "Band C 流利級 · C1", newW: 4135, cumW: 9470, chars: 600, grammar: null, hours: "C1" },
  { n: 7, phase: 5, band: "精通級 · C2", newW: 4978, cumW: 14450, chars: 600, grammar: null },
];
// §8.2 TOCFL estimates (classroom hours, learners outside Taiwan). level: the TBCL level whose end reaches the band.
export const BANDS = [
  { id: "A1", label: "A1", lo: 240, hi: 480, level: 2 },
  { id: "A2", label: "Band A 基礎級 · A2", lo: 480, hi: 720, level: 3 },
  { id: "B1", label: "Band B 進階級 · B1", lo: 720, hi: 960, level: 4 },
  { id: "B2", label: "Band B 高階級 · B2", lo: 960, hi: 1920, level: 5 },
  { id: "C1", label: "Band C 流利級 · C1", lo: 1920, hi: 3840, level: 6 },
];
const MOE_NAME = "MOE human voice · 教育部真人發音";

// ------------------------------------------------------------------ pure logic (exported for tests)
const arr = x => (Array.isArray(x) ? x : []);
const pct = x => Math.round(x * 100);
// "第1*級", "1*", "1+", 1, "L2" -> {n, star}; null when no level number is found
export function parseLevel(x) {
  if (x == null || x === "") return null;
  if (typeof x === "number") return Number.isFinite(x) && x >= 1 ? { n: Math.floor(x), star: x % 1 !== 0 } : null;
  const m = String(x).match(/(\d+)\s*([*+＊])?/);
  return m && Number(m[1]) >= 1 ? { n: Number(m[1]), star: !!m[2] } : null;
}
// The first English sense, short enough for an answer button (CC-CEDICT glosses: "to eat; to consume; CL:個|个[ge4]").
export function glossOf(en) {
  let s = Array.isArray(en) ? en.find(x => x != null && String(x).trim()) : en;
  if (s == null) return "";
  s = String(s).split(/\s*[;；]\s*/)[0].replace(/\bCL:\S*/g, "").replace(/\((?:Tw|Taiwan pr\.[^)]*)\)/gi, "").replace(/\s+/g, " ").trim();
  return s.length > 48 ? s.slice(0, 47).trimEnd() + "…" : s;
}
// library-words.json {w, z, p, lv, t, en, cl, id, s}, or a placement vocab_l5 entry ({zh, zhuyin, en} also accepted)
export function normWord(w) {
  if (!w || typeof w !== "object") return null;
  const zh = w.w ?? w.zh ?? w.word;
  if (!zh) return null;
  const lv = parseLevel(w.lv ?? w.level);
  return { zh: String(zh), zhuyin: String(w.z ?? w.zhuyin ?? ""), en: glossOf(w.en ?? w.gloss ?? w.english), n: lv ? lv.n : null, star: !!(lv && lv.star) };
}
// A placement question (content/placement/questions.json shape, plus the build's audio fields). The build may give
// the MOE clip as `id` (or audio_id / moe_id / audio.id) and a TTS file as a path (audio_path / path / tts / audio).
export function normQuestion(q) {
  if (!q || typeof q !== "object") return null;
  const lv = parseLevel(q.level ?? q.lv);
  const options = arr(q.options_en ?? q.options).map(String);
  const answer = Number(q.answer);
  if (!lv || (q.skill !== "listening" && q.skill !== "reading") || !q.zh || options.length < 2 || !(answer >= 0 && answer < options.length)) return null;
  const a = q.audio;
  const ao = a && typeof a === "object" ? a : {};
  const id = q.id ?? q.audio_id ?? q.moe_id ?? ao.id ?? null;
  const path = q.audio_path ?? q.path ?? q.tts ?? ao.path ?? ao.tts ?? (typeof a === "string" && a !== "tts" && !a.startsWith("moe:") ? a : null);
  return { n: lv.n, skill: q.skill, zh: String(q.zh), zhuyin: String(q.zhuyin || ""), spoken: q.spoken || null, question: String(q.question_en || ""),
    options, answer, en: String(q.en || ""), id: id != null ? String(id) : null, audio: path ? String(path) : null };
}
export function normDiag(d) {
  if (!d || !d.zh || !d.zhuyin) return null;
  return { zh: String(d.zh), zhuyin: String(d.zhuyin), spoken: d.spoken || null, en: String(d.en || ""), id: d.id != null ? String(d.id) : null,
    contrast: d.contrast || null, covers: arr(d.covers).map(String) };
}
// placement.json: {questions, diagnostic, vocab_l5}; a bare array is read as the questions
export function normPlacement(p) {
  const P = Array.isArray(p) ? { questions: p } : p || {};
  return {
    questions: arr(P.questions ?? P.items).map(normQuestion).filter(Boolean),
    diagnostic: arr(P.diagnostic).map(normDiag).filter(Boolean),
    vocabL5: arr(P.vocab_l5 ?? P.vocabL5).map(normWord).filter(Boolean).map(w => ({ ...w, n: 5, star: false })),
  };
}
export function wordsByLevel(words, l5 = []) {
  const m = new Map();
  for (const w of [...arr(words), ...arr(l5)]) {
    if (!w || !w.n || !w.zh) continue;
    if (!m.has(w.n)) m.set(w.n, []);
    const list = m.get(w.n);
    if (!list.some(x => x.zh === w.zh)) list.push(w);
  }
  return m;
}
export function shuffleR(a, rnd = Math.random) {
  const out = arr(a).slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
// k words from a level, half from N and half from N* when both halves have enough (TBCL splits levels 1-4)
export function sampleWords(pool, k, rnd = Math.random) {
  const all = arr(pool);
  const lo = all.filter(w => !w.star), hi = all.filter(w => w.star);
  if (lo.length >= Math.ceil(k / 2) && hi.length >= Math.floor(k / 2)) {
    return shuffleR([...shuffleR(lo, rnd).slice(0, Math.ceil(k / 2)), ...shuffleR(hi, rnd).slice(0, Math.floor(k / 2))], rnd);
  }
  return shuffleR(all, rnd).slice(0, k);
}
// A 4-option English meaning check: the word's gloss and three different glosses from `pool`. null if it can't be built.
export function meaningOptions(word, pool, rnd = Math.random) {
  const key = s => String(s).toLowerCase().replace(/^to\s+/, "").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const right = word && word.en;
  if (!right || !key(right)) return null;
  const rk = key(right);
  const seen = new Set([rk]), ds = [];
  for (const w of shuffleR(pool, rnd)) {
    if (!w || !w.en || w.zh === word.zh) continue;
    const k = key(w.en);
    if (!k || seen.has(k) || k.includes(rk) || rk.includes(k)) continue;
    seen.add(k); ds.push(w.en);
    if (ds.length === 3) break;
  }
  if (ds.length < 3) return null;
  const options = shuffleR([right, ...ds], rnd);
  return { options, answer: options.indexOf(right) };
}
// Vocabulary estimate of one level: claimed share × meaning-check accuracy (§5.7, M4 §4.3a), in %.
export function vocabEstimate(row) {
  if (!row || row.nodata || !arr(row.words).length) return null;
  const claimedN = arr(row.known).filter(Boolean).length;
  const done = arr(row.checks).filter(c => c && c.chosen != null);
  const right = done.filter(c => c.chosen === c.answer).length;
  const acc = done.length ? right / done.length : 1;
  return { n: row.words.length, claimedN, claimed: pct(claimedN / row.words.length), checked: done.length, right,
    accuracy: done.length ? pct(acc) : null, estimate: pct((claimedN / row.words.length) * acc) };
}
// Stop going up after two levels in a row below 40 %, or at a level with no data.
export function vocabStops(estimates) {
  const k = estimates.length, last = estimates[k - 1];
  if (last == null) return true;
  return k >= 2 && last < TH.vocabStop && estimates[k - 2] != null && estimates[k - 2] < TH.vocabStop;
}
// Listening or reading accuracy of one level. answers[i]: the chosen option, -1 "don't know" or a give-up (wrong),
// null skipped (could not play; not counted). Fewer than 3 counted answers is no data.
export function skillAcc(row) {
  if (!row || row.nodata || !arr(row.items).length) return null;
  let n = 0, correct = 0;
  arr(row.answers).forEach((a, i) => {
    if (a == null) return;
    n++;
    if (row.items[i] && a === row.items[i].answer) correct++;
  });
  return n >= 3 ? { n, correct, acc: pct(correct / n) } : null;
}
// Starting level = the highest level whose vocabulary estimate ≥ 60 % and listening and reading ≥ 50 %; else Level 1.
// (When the top vocabulary level misses listening or reading, the level below that passes all three is the start.)
export function placementLevel(levels) {
  let best = 0;
  for (const [k, r] of Object.entries(levels || {})) {
    const n = Number(k);
    if (r && r.vocab && r.vocab.estimate >= TH.vocabPlace && r.listening && r.listening.acc >= TH.skillPlace
      && r.reading && r.reading.acc >= TH.skillPlace && n > best) best = n;
  }
  return Math.max(1, best);
}
export const phaseOf = level => (level >= 6 ? 5 : level === 5 ? 4 : level === 4 ? 3 : level === 3 ? 2 : 1);
// Diagnostic marks -> contrasts and tones. A word's sound ✗ counts against its contrast (contrasts.json id); every
// tone ✗ counts against "tones" and against each written tone 1-4 of the word. A contrast with any ✗ is weak; red
// when at least half of its judged words have ✗ (§8.4 "no red contrast"). A tone is weak at ✗ on ≥ 1/3 of its words.
export function diagnosticSummary(items, marks, known = null) {
  const per = {}, tones = {};
  let judged = 0;
  const add = (id, bad) => { if (known && !known.has(id)) return; const e = per[id] || (per[id] = { n: 0, bad: 0 }); e.n++; if (bad) e.bad++; };
  arr(items).forEach((it, i) => {
    const m = marks && marks[i];
    if (!it || !m || m.skipped || (m.sound == null && m.tone == null)) return;
    judged++;
    if (it.contrast && it.contrast !== "tones" && m.sound != null) add(it.contrast, m.sound === false);
    if (m.tone != null) {
      add("tones", m.tone === false);
      for (const t of new Set(syllables(it.zhuyin).map(toneOf))) {
        if (t < 1 || t > 4) continue;
        const e = tones[t] || (tones[t] = { n: 0, bad: 0 });
        e.n++; if (m.tone === false) e.bad++;
      }
    }
  });
  for (const e of Object.values(per)) e.status = e.bad === 0 ? "green" : e.bad / e.n >= 0.5 ? "red" : "amber";
  const ids = Object.keys(per);
  return { judged, perContrast: per, perTone: tones,
    weakContrasts: ids.filter(id => per[id].bad > 0).sort((a, b) => per[b].bad / per[b].n - per[a].bad / per[a].n),
    red: ids.filter(id => per[id].status === "red"),
    weakTones: Object.keys(tones).map(Number).filter(t => tones[t].bad > 0 && tones[t].bad / tones[t].n >= 1 / 3).sort() };
}
// §8.4 pass: ≥ 85 % vocabulary, ≥ 80 % listening and reading, a diagnostic with no red contrast.
export function checkPassed(r, diag) {
  return !!(r && r.vocab && r.vocab.estimate >= TH.passVocab && r.listening && r.listening.acc >= TH.passSkill
    && r.reading && r.reading.acc >= TH.passSkill && diag && diag.judged > 0 && diag.red.length === 0);
}
// units-index.json (M5; shape not fixed yet): an array or {units: [...]}, each with an id, a level and a title.
const unitList = index => arr(Array.isArray(index) ? index : index && (index.units ?? index.items));
const unitLevel = u => { const p = parseLevel(u && (u.level ?? u.lv ?? u.tbcl)); return p ? p.n : null; };
export function firstUnit(index, level) {
  const u = unitList(index).find(x => x && x.id != null && unitLevel(x) === level);
  return u ? { id: String(u.id), title: String(u.title_zh ?? u.zh ?? u.title ?? u.id), en: String(u.title_en ?? u.en ?? "") } : null;
}
// Share of a level's units done (store "units.done": {"<unit id>": date}); null while there are no units (before M5).
export function unitsDoneShare(index, level, done) {
  const list = unitList(index).filter(u => u && u.id != null && unitLevel(u) === level);
  if (!list.length) return null;
  return list.filter(u => done && done[u.id]).length / list.length;
}

// ---- hours (store "days": {"YYYY-MM-DD": {"<block>": minutes, "outside:<kind>": minutes}})
export const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export function dayMinutes(day) {
  let app = 0, outside = 0;
  for (const [k, v] of Object.entries(day || {})) {
    const x = Number(v) || 0;
    if (k.startsWith("outside:")) outside += x; else app += x;
  }
  return { app: Math.max(0, app), outside: Math.max(0, outside) };
}
export function totals(days) {
  let app = 0, outside = 0;
  for (const day of Object.values(days || {})) { const m = dayMinutes(day); app += m.app; outside += m.outside; }
  return { app, outside, minutes: app + outside, hours: (app + outside) / 60 };
}
// The last `weeks` weeks (Monday to Sunday), oldest first; the last one is the current week, partial.
export function weekly(days, now = new Date(), weeks = 8) {
  const monday = addDays(midnight(now), -((now.getDay() + 6) % 7));
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(monday, -7 * i);
    let app = 0, outside = 0;
    for (let j = 0; j < 7; j++) { const m = dayMinutes((days || {})[dkey(addDays(start, j))]); app += m.app; outside += m.outside; }
    out.push({ start: dkey(start), hours: (app + outside) / 60, app: app / 60, outside: outside / 60, partial: i === 0 });
  }
  return out;
}
// Hours per week over the last 4 weeks (28 days to today), or over the days since the first logged day when that is
// shorter (at least 7), so a new learner's pace isn't diluted by weeks before they started.
export function pacePerWeek(days, now = new Date()) {
  const end = midnight(now);
  const keys = Object.keys(days || {}).filter(k => { const d = parseDay(k); return d && d <= end && (dayMinutes(days[k]).app + dayMinutes(days[k]).outside) > 0; }).sort();
  if (!keys.length) return 0;
  const since = Math.round((end - parseDay(keys[0])) / 86400000) + 1;
  const span = Math.max(7, Math.min(28, since));
  let min = 0;
  for (let j = 0; j < span; j++) { const m = dayMinutes(days[dkey(addDays(end, -j))]); min += m.app + m.outside; }
  return (min / 60) / (span / 7);
}
export function nextBand(level) {
  const lv = Number(level) || 1;
  return BANDS.find(b => b.level >= Math.max(2, lv)) || BANDS[BANDS.length - 1];
}
// When the band's low and high estimates are reached at this weekly pace (Dates), from the hours logged so far.
export function bandOutlook(totalH, perWeek, band, now = new Date()) {
  const remLo = Math.max(0, band.lo - totalH), remHi = Math.max(0, band.hi - totalH);
  const at = rem => (rem <= 0 ? midnight(now) : perWeek > 0 ? addDays(midnight(now), Math.ceil((rem / perWeek) * 7)) : null);
  return { reached: remHi <= 0, inRange: remLo <= 0 && remHi > 0, remLo, remHi, dateLo: at(remLo), dateHi: at(remHi) };
}
// Can the pace reach `band` by the goal date? needLo/needHi: minutes per study day (STUDY_DAYS a week) for the low and
// high estimate. status: "invalid" | "past" | "reached" | "nopace" | "ok" (even the high estimate) | "low" (only the
// low estimate) | "no".
export function goalAdvice(totalH, perWeek, band, goal, now = new Date(), studyDays = STUDY_DAYS) {
  const g = goal instanceof Date ? goal : parseDay(goal);
  if (!g || !band) return { status: "invalid" };
  const o = bandOutlook(totalH, perWeek, band, now);
  if (o.reached) return { status: "reached", ...o };
  const weeksLeft = (g - midnight(now)) / (7 * 86400000);
  if (weeksLeft <= 0) return { status: "past", ...o };
  const need = rem => Math.ceil((rem * 60) / (weeksLeft * studyDays));
  const base = { ...o, weeksLeft, needLo: need(o.remLo), needHi: need(o.remHi) };
  if (!(perWeek > 0)) return { status: "nopace", ...base };
  return { status: o.dateHi <= g ? "ok" : o.dateLo <= g ? "low" : "no", ...base };
}

// ---- the daily focus. drills.js keeps "focus.contrasts" ({"<id>": {since}}) and has no exported setter, so the
// weak contrasts are written in that format directly. Its syncFocus() drops a focus entry whose "lab.contrasts" stats
// are missing, so an empty stats entry (the same default lab.js shows) is added for a contrast never drilled. If
// drills.js gains a setter (addFocusContrasts / addToFocus / addFocusContrast), it is used instead.
export function addFocusContrasts(ids, { mod = drills, st = store, day = today() } = {}) {
  const list = [...new Set(arr(ids).filter(Boolean))];
  if (!list.length) return "none";
  for (const name of ["addFocusContrasts", "addToFocus", "addFocusContrast"]) {
    const fn = mod && mod[name];
    if (typeof fn !== "function") continue;
    try { if (name === "addFocusContrast") list.forEach(id => fn(id, "placement")); else fn(list, "placement"); return "api"; }
    catch (err) { console.error(err); }
  }
  const f = st.get("focus.contrasts", {}) || {}, stats = st.get("lab.contrasts", {}) || {};
  for (const id of list) {
    if (!f[id]) f[id] = { since: day, from: "placement" };
    if (!stats[id]) stats[id] = { n: 0, correct: 0, recent: [], days: {} };
  }
  st.set("lab.contrasts", stats);
  st.set("focus.contrasts", f);
  return "store";
}

// ---- a check in progress (plain JSON, saved after every answer)
export function newRun(kind, level = null, practice = false) {
  return { v: 1, kind, level, practice: !!practice, date: today(), started: Date.now(), showZhuyin: false,
    levels: kind === "check" ? [level] : [1, 2, 3, 4, 5], stage: "vocab",
    vocab: { li: 0, step: "claim", rows: {}, stoppedAt: null },
    listening: { li: 0, rows: {}, stoppedAt: null },
    reading: { li: 0, rows: {}, stoppedAt: null },
    diag: { i: 0, items: null, marks: [], noMic: canRecord ? "" : "unsupported" } };
}
const STAGES = ["vocab", "listening", "reading", "diag", "done"];
const curLevel = (run, part) => run.levels[run[part].li];
function vocabRow(run, n, D, rnd) {
  const rows = run.vocab.rows;
  if (!rows[n]) {
    const words = sampleWords(D.byLevel.get(n) || [], VOCAB_N[run.kind] || 10, rnd);
    rows[n] = words.length ? { words: words.map(w => ({ zh: w.zh, zhuyin: w.zhuyin, en: w.en })), known: words.map(() => false), checks: null, ci: 0 } : { nodata: true };
  }
  return rows[n];
}
function skillRow(run, skill, n, D, rnd) {
  const rows = run[skill].rows;
  if (!rows[n]) {
    const items = shuffleR(D.questions.filter(q => q.n === n && q.skill === skill), rnd);
    rows[n] = items.length ? { items, answers: [] } : { nodata: true };
  }
  return rows[n];
}
function finishVocabLevel(run) {
  const n = curLevel(run, "vocab");
  run.vocab.li++; run.vocab.step = "claim";
  if (run.kind !== "placement") return;
  const ests = run.levels.slice(0, run.vocab.li).map(k => { const e = vocabEstimate(run.vocab.rows[k]); return e ? e.estimate : null; });
  if (vocabStops(ests)) run.vocab.stoppedAt = n;
}
function finishSkillLevel(run, skill) {
  const n = curLevel(run, skill);
  const a = skillAcc(run[skill].rows[n]);
  run[skill].li++;
  if (run.kind === "placement" && (!a || a.acc < TH.skillStop)) run[skill].stoppedAt = n;
}
// Claims are in: meaning checks on up to CHECK_N "know" words that have a gloss.
export function submitClaims(run, D, rnd = Math.random) {
  const n = curLevel(run, "vocab"), row = run.vocab.rows[n];
  const pool = D.byLevel.get(n) || [];
  const wide = pool.length >= 8 ? pool : [...D.byLevel.values()].flat();
  const known = row.words.map((w, i) => (row.known[i] && w.en ? i : -1)).filter(i => i >= 0);
  row.checks = shuffleR(known, rnd).slice(0, CHECK_N[run.kind] || 3)
    .map(i => { const o = meaningOptions(row.words[i], wide, rnd); return o ? { i, ...o, chosen: null } : null; }).filter(Boolean);
  row.ci = 0;
  if (row.checks.length) run.vocab.step = "check"; else finishVocabLevel(run);
}
export function answerMeaning(run, choice) {
  const row = run.vocab.rows[curLevel(run, "vocab")];
  row.checks[row.ci].chosen = choice;
  row.ci++;
  if (row.ci >= row.checks.length) finishVocabLevel(run);
}
export function answerSkill(run, skill, choice) {
  const row = run[skill].rows[curLevel(run, skill)];
  row.answers.push(choice);
  if (row.answers.length >= row.items.length) finishSkillLevel(run, skill);
}
// "Too hard: stop this part here": the rest of the level counts as wrong, and the part ends.
export function giveUpSkill(run, skill) {
  const row = run[skill].rows[curLevel(run, skill)];
  while (row.answers.length < row.items.length) row.answers.push(-1);
  finishSkillLevel(run, skill);
  run[skill].stoppedAt = run[skill].stoppedAt ?? run.levels[run[skill].li - 1];
}
// Moves the run past levels without data and finished parts; computes the result when it reaches "done".
export function settle(run, D, rnd = Math.random) {
  for (let guard = 0; guard < 60; guard++) {
    const s = run.stage;
    if (s === "vocab" || s === "listening" || s === "reading") {
      const part = run[s];
      if (part.stoppedAt != null || part.li >= run.levels.length) { advanceStage(run, D); continue; }
      const row = s === "vocab" ? vocabRow(run, curLevel(run, s), D, rnd) : skillRow(run, s, curLevel(run, s), D, rnd);
      if (row.nodata) { if (s === "vocab") finishVocabLevel(run); else finishSkillLevel(run, s); continue; }
      return run;
    }
    if (s === "diag") {
      if (!run.diag.items) run.diag.items = D.diag.map(d => ({ ...d }));
      if (run.diag.i >= run.diag.items.length) { advanceStage(run, D); continue; }
      return run;
    }
    return run;
  }
  return run;
}
function advanceStage(run, D) {
  run.stage = STAGES[STAGES.indexOf(run.stage) + 1] || "done";
  if (run.stage === "done" && !run.result) run.result = computeResult(run, D);
}
export function computeResult(run, D) {
  const levels = {};
  for (const n of run.levels) {
    const r = { vocab: vocabEstimate(run.vocab.rows[n]), listening: skillAcc(run.listening.rows[n]), reading: skillAcc(run.reading.rows[n]) };
    if (r.vocab || r.listening || r.reading) levels[n] = r;
  }
  const diagnostic = { ...diagnosticSummary(run.diag.items || [], run.diag.marks, D.contrastIds && D.contrastIds.size ? D.contrastIds : null), noMic: run.diag.noMic || "" };
  const base = { kind: run.kind, date: today(), at: Date.now(), levels, diagnostic };
  if (run.kind === "check") {
    const n = run.level;
    return { ...base, level: n, practice: run.practice, passed: checkPassed(levels[n], diagnostic) };
  }
  const level = placementLevel(levels);
  return { ...base, level, phase: phaseOf(level), startUnit: firstUnit(D.units, level) };
}

// ------------------------------------------------------------------ page state
const app = typeof document !== "undefined" ? $("#app") : null;
let dataP = null;
let D = null;
let teardown = [];      // the current view's clean-up functions (takes, timers)
let viewToken = 0;      // bumped on every tab change: an async render that finds it changed stops
let showTab = null;
let lastAct = 0;        // the last answer, for the minutes logged by the checks

const stopAll = () => { if (typeof drills.stopAll === "function") drills.stopAll(); else stopAudio(); };
function leaveView() {
  for (const f of teardown.splice(0)) { try { f(); } catch (err) { console.error(err); } }
  stopAll();
}
// Minutes spent answering count as study time ("placement" block), at most 2 minutes per answer.
function logActive() {
  const now = Date.now();
  if (lastAct && now - lastAct > 0) logMinutes("placement", Math.min(now - lastAct, 120000) / 60000);
  lastAct = now;
}

export function levelInfo() {
  try {
    if (typeof App.levelState === "function") {
      const s = App.levelState();
      const n = s && (typeof s.level === "number" ? s.level : parseLevel(s.level)?.n);
      if (n) return { level: n, phase: s.phase ?? phaseOf(n), placedAt: s.placedAt ?? null };
    }
  } catch (err) { console.error(err); }
  const raw = store.get("level", null), p = store.get("plan.placement", null);
  const n = typeof raw === "number" ? raw : parseLevel(raw && typeof raw === "object" ? raw.level ?? raw.tbcl : raw)?.n ?? (p && p.level) ?? null;
  return n ? { level: n, phase: phaseOf(n), placedAt: p ? p.date : null } : null;
}

function data() {
  return (dataP ||= (async () => {
    const opt = name => loadJSON(name).catch(err => { console.warn(`${name}.json not available:`, err.message); return null; });
    const [placement, words, contrasts, contours, audio, units] = await Promise.all(
      [opt("placement"), opt("library-words"), opt("contrasts"), opt("contours"), opt("audio"), opt("units-index")]);
    const P = normPlacement(placement);
    const wl = arr(words && !Array.isArray(words) ? words.words ?? words.items : words).map(normWord).filter(w => w && w.n);
    const au = audio || {};
    const diag = P.diagnostic.filter(d => d.id && au[d.id] && au[d.id].src === "moe"); // MOE human audio only
    const cs = arr(contrasts);
    CONTRASTS = cs;
    return { missing: { placement: !placement || !P.questions.length, words: !wl.length }, questions: P.questions, diag,
      diagDropped: P.diagnostic.length - diag.length, byLevel: wordsByLevel(wl, P.vocabL5), contrasts: cs,
      contrastIds: new Set(cs.map(c => c && c.id).filter(Boolean)), contours: contours || {}, audio: au, units };
  })());
}
// contrasts.json (small) for the contrast names; the roadmap waits for it without loading the word list
let CONTRASTS = [], contrastsP = null;
const loadContrasts = () => (contrastsP ||= loadJSON("contrasts").then(arr, () => []).then(c => (CONTRASTS = c)));
const contrastName = id => { const c = CONTRASTS.find(x => x && x.id === id); return c ? [h("span", { lang: "zh-Hant-TW" }, c.zh), " ", enText(c.en)] : [id]; };
const notice = (zh, en, role = "note") => h("p", { class: "pl-notice", role }, zh, " ", enText(en));
// A table in its sideways-scrolling wrap: a focusable region (so the keyboard can scroll it), named by the table's caption.
let tableN = 0;
const tableWrap = (zh, en, table) => {
  const id = `pl-tbl-${++tableN}`;
  table.prepend(h("caption", { id, class: "sr-only" }, zh, " ", enText(en)));
  return h("div", { class: "pl-table-wrap", role: "region", tabindex: "0", "aria-labelledby": id }, table);
};
const fmtH = x => (x >= 100 ? String(Math.round(x)) : x >= 10 ? x.toFixed(0) : x.toFixed(1));
const monthEn = d => d.toLocaleDateString("en", { month: "short", year: "numeric" });
const monthZh = d => `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
const levelName = n => [`第 ${n} 級`, " ", enText(`TBCL Level ${n}`)];
const phaseName = p => [`第 ${p} 階段 ${PHASES[p][0]}`, " ", enText(`Phase ${p} · ${PHASES[p][1]}`)];

// ------------------------------------------------------------------ page and tabs
const TABS = [["roadmap", "路線圖", "Roadmap"], ["hours", "時數", "Hours"], ["placement", "程度測驗", "Placement"], ["checks", "等級檢查", "Level checks"]];
function boot() {
  mountShell("plan");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  clear(app);
  app.append(h("div", { class: "page-head" }, h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "計畫"), h("span", { class: "en", lang: "en" }, "Plan")),
    h("p", { class: "muted small", style: "margin:0" }, "你在哪裡、花了多少時間、下一步是什麼。數字照實算，不打折。",
      enText(" Where you are, the hours so far, and the next step. Honest numbers."))));
  // ARIA tabs (as in tones.js): one shared panel, roving tabindex, arrows/Home/End move and activate.
  const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "計畫 Plan" });
  const panel = h("section", { role: "tabpanel", id: "plan-panel", class: "pl-panel", tabindex: "-1" });
  const show = id => {
    for (const b of tabs.children) { const on = b.dataset.id === id; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; }
    panel.setAttribute("aria-labelledby", `tab-${id}`);
    leaveView();
    viewToken++;
    clear(panel);
    history.replaceState(null, "", "#" + id);
    return ({ roadmap: renderRoadmap, hours: renderHours, placement: renderPlacement, checks: renderChecks })[id](panel);
  };
  // focus: true = the tab; a selector = that control in the new panel once it has rendered (the tab when it is
  // missing or disabled), so focus never falls to <body> when the control that was used goes away.
  showTab = (id, focus = false) => {
    const done = Promise.resolve(show(id)), tok = viewToken, tab = tabs.querySelector(`[data-id="${id}"]`);
    if (focus === true) tab?.focus();
    else if (typeof focus === "string") done.catch(() => {}).then(() => {
      if (tok !== viewToken) return;
      const el = panel.querySelector(focus);
      (el && !el.disabled ? el : tab)?.focus();
    });
  };
  for (const [id, zh, en] of TABS) {
    tabs.append(h("button", { type: "button", role: "tab", id: `tab-${id}`, "aria-controls": "plan-panel", "data-id": id, "aria-selected": "false", tabindex: "-1", onclick: () => show(id) },
      zh, " ", h("span", { class: "muted small", lang: "en" }, en)));
  }
  tabs.addEventListener("keydown", e => {
    const list = [...tabs.children], i = list.indexOf(e.target);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (i < 0 || j === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const b = list[(j + list.length) % list.length];
    b.focus(); show(b.dataset.id);
  });
  app.append(tabs, panel);
  const start = location.hash.slice(1);
  show(TABS.some(x => x[0] === start) ? start : "roadmap");
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    const tab = TABS.some(x => x[0] === id) && tabs.querySelector(`[data-id="${id}"]`);
    if (tab && tab.getAttribute("aria-selected") !== "true") { show(id); if (!document.activeElement || document.activeElement === document.body) tab.focus(); }
  });
  window.addEventListener("pagehide", () => stopAll());
}

// ------------------------------------------------------------------ 1. 路線圖 Roadmap: the §8.1 table as a vertical path
function renderRoadmap(panel) {
  const L = levelInfo();
  const days = Math.max(0, daysSinceStart());
  const phase0 = days < PHASE0_DAYS;
  const pl = store.get("plan.placement", null);
  const head = h("section", { class: "pl-where card", "aria-labelledby": "pl-where-h" });
  if (L) {
    head.append(h("p", { class: "pl-kicker muted small" }, "你現在 ", enText("You are at")),
      h("h2", { id: "pl-where-h", class: "pl-where-h" }, ...levelName(L.level)),
      h("p", { class: "pl-where-sub" }, ...phaseName(phaseOf(L.level)), L.placedAt ? h("span", { class: "muted small" }, ` · 測驗 ${L.placedAt} `, enText("placed")) : null));
  } else {
    head.append(h("h2", { id: "pl-where-h", class: "pl-where-h" }, "還沒做程度測驗", " ", enText("Not placed yet")),
      h("p", {}, ...bi("先做程度測驗：大約 30–45 分鐘，可以隨時暫停。", "Take the placement check first: about 30–45 minutes, and you can pause any time.")),
      h("button", { type: "button", class: "btn primary", onclick: () => showTab("placement", true) }, "開始程度測驗 ", enText("Start the placement check")));
  }
  const nextLine = L
    ? [`第 ${L.level} 級檢查`, " ", enText(`Level ${L.level} check: unlocks when 90% of Level ${L.level}'s units are done`)]
    : ["程度測驗", " ", enText("The placement check")];
  head.append(h("dl", { class: "kv pl-where-kv" },
    h("dt", {}, "下一個里程碑 ", enText("Next milestone")), h("dd", {}, ...nextLine),
    h("dt", {}, "第 0 階段 ", enText("Phase 0")), h("dd", {}, phase0
      ? [`發音重整：第 ${Math.floor(days / 7) + 1} 週（共 4 週），和其他練習一起進行。`, " ", enText(`Sound reset: week ${Math.floor(days / 7) + 1} of 4, alongside everything else.`)]
      : ["前 4 週的發音重整已完成。", " ", enText("The 4-week sound reset is behind you.")]),
    h("dt", {}, "目標 ", enText("Goal")), h("dd", {}, "TOCFL Band B ", enText("(TBCL Level 4, B1) as fast as possible"))));
  if (pl && pl.diagnostic && arr(pl.diagnostic.weakContrasts).length) {
    const names = h("span");
    head.append(h("p", { class: "small muted", style: "margin:8px 0 0" }, "需要加強的對比 ", enText("Weak contrasts: "), names));
    loadContrasts().then(() => names.replaceChildren(...pl.diagnostic.weakContrasts.flatMap((id, i) => [i ? "、" : "", ...contrastName(id)])));
  }
  panel.append(head);

  const here = L ? L.level : 0;
  const path = h("ol", { class: "pl-path", "aria-label": "路線圖 Roadmap: phases and TBCL levels" });
  path.append(h("li", { class: `pl-node pl-node-zero ${phase0 ? "is-active" : "is-done"}${here ? " rail-on" : ""}` },
    h("span", { class: "pl-dot", "aria-hidden": "true" }),
    h("div", { class: "pl-node-body" },
      h("p", { class: "pl-node-kicker" }, ...phaseName(0)),
      h("h3", { class: "pl-node-h" }, "第 1–4 週 ", enText("Weeks 1–4, alongside everything")),
      h("p", { class: "small muted pl-node-note" }, ...bi("每天多 5 分鐘發音（15 分鐘），把聲調和難分的音重新打底。", "15 minutes of pronunciation a day instead of 10: tones and the hard contrasts, rebuilt.")),
      phase0 ? h("p", { class: "pl-goal" }, "進行中 ", enText("In progress, alongside")) : null)));
  for (const lv of LEVELS) {
    const band = lv.hours && BANDS.find(b => b.id === lv.hours);
    const state = here && lv.n < here ? "is-done" : lv.n === here ? "is-here" : "";
    const goal = lv.n === GOAL_LEVEL;
    const stat = (zh, en, v) => h("div", {}, h("dt", {}, zh, " ", enText(en)), h("dd", {}, v));
    path.append(h("li", { class: `pl-node ${state}${goal ? " is-goal" : ""}`, "aria-current": lv.n === here ? "step" : null },
      h("span", { class: "pl-dot", "aria-hidden": "true" }),
      h("div", { class: "pl-node-body" },
        h("p", { class: "pl-node-kicker" }, ...phaseName(lv.phase)),
        h("h3", { class: "pl-node-h" }, ...levelName(lv.n), h("span", { class: "pl-band" }, enText(lv.band))),
        lv.n === here ? h("p", { class: "pl-here" }, "你在這裡 ", enText("You are here")) : null,
        goal ? h("p", { class: "pl-goal" }, "目標 ", enText("Goal: TOCFL Band B starts here")) : null,
        h("dl", { class: "pl-stats" },
          stat("新詞", "New words", [lv.newW.toLocaleString("en"), h("span", { class: "muted" }, ` (≈${lv.cumW.toLocaleString("en")})`)]),
          stat("漢字", "Characters", lv.chars),
          stat("語法點", "Grammar", lv.grammar == null ? "—" : lv.grammar),
          band ? stat("時數", "Hours (TOCFL)", `${band.lo.toLocaleString("en")}–${band.hi.toLocaleString("en")}`) : null),
        lv.note ? h("p", { class: "small muted pl-node-note" }, enText(lv.note)) : null)));
  }
  panel.append(path,
    h("p", { class: "small muted pl-foot" }, ...bi("新詞後面括號裡是累計數。第 1–4 級各分成 N 和 N* 兩半，這裡寫成「1 / 1+」（推論，非官方）。時數是 TOCFL 對海外學習者的課堂時數估計，只當參考。",
      "New words: that level's words, with the running total in brackets. Levels 1–4 each split into N and N* halves, shown here as 1 / 1+ (inferred, not official). Hours: the TOCFL classroom estimate for learners outside Taiwan at the end of that level; a rough guide.")),
    h("p", { class: "small muted" }, enText("Sources: TBCL 臺灣華語文能力基準 (NAER) levels, the official 2021 TOCFL/CEFR mapping, TOCFL hour estimates; checked 2026-10-13.")));
}

// ------------------------------------------------------------------ 2. 時數 Hours
function renderHours(panel) {
  const days = store.get("days", {}) || {};
  const now = new Date();
  const t = totals(days), weeks = weekly(days, now, 8), perWeek = pacePerWeek(days, now);
  const studyDays = studyDaysSetting();
  const target = (settings().dailyMinutes * studyDays) / 60;
  const L = levelInfo();
  const tile = (zh, en, value, unit, sub) => h("div", { class: "pl-tile" }, h("p", { class: "pl-tile-l" }, zh, " ", enText(en)),
    h("p", { class: "pl-tile-v" }, value, h("small", {}, ` ${unit}`)), sub ? h("p", { class: "pl-tile-s muted small" }, sub) : null);
  panel.append(h("div", { class: "pl-tiles" },
    tile("總時數", "Logged", fmtH(t.hours), "h", [`App ${fmtH(t.app / 60)} · 課外 ${fmtH(t.outside / 60)}`]),
    tile("近 4 週", "Last 4 weeks", fmtH(perWeek), "h/週", enText("a week, average")),
    tile("目標", "Target", fmtH(target), "h/週", enText(`${settings().dailyMinutes} min × ${studyDays} days`))));

  // weekly bars (dataviz: one series, thin 4px-capped columns from one baseline, recessive target line, table view)
  const max = Math.max(target * 1.2, ...weeks.map(w => w.hours), 0.5);
  const label = w => (w.partial ? "本週" : `${Number(w.start.slice(5, 7))}/${Number(w.start.slice(8))}`);
  const weekEn = w => (w.partial ? "this week so far" : `week of ${parseDay(w.start).toLocaleDateString("en", { month: "short", day: "numeric" })}`);
  const readout = h("p", { class: "pl-readout small", "aria-hidden": "true" });
  const say = w => readout.replaceChildren(h("b", {}, `${fmtH(w.hours)} h`), " ", enText(`${weekEn(w)}`), h("span", { class: "muted" }, ` · app ${fmtH(w.app)} · outside ${fmtH(w.outside)}`));
  const best = weeks.reduce((a, w) => (w.hours > a.hours ? w : a), weeks[0]);
  const valText = w => `${weekEn(w)}: ${fmtH(w.hours)} hours (app ${fmtH(w.app)}, outside ${fmtH(w.outside)})`;
  // The whole plot is one slider (8 separate bar buttons can't each be 44 px wide on a phone): arrows / Home / End,
  // or a tap, drag or hover over a column, pick the week the readout shows. The table below has every number too.
  const bars = weeks.map(w => h("span", { class: "pl-bar" + (w.partial ? " is-partial" : ""), "aria-hidden": "true" },
    h("span", { class: "pl-bar-fill", style: `height:${(w.hours / max) * 100}%` }),
    (w === best && w.hours > 0) || w.partial ? h("span", { class: "pl-bar-val", style: `bottom:${(w.hours / max) * 100}%` }, fmtH(w.hours)) : null));
  let cur = -1;
  const pick = i => {
    i = Math.max(0, Math.min(weeks.length - 1, i));
    if (i === cur) return;
    cur = i;
    say(weeks[i]);
    bars.forEach((b, j) => b.classList.toggle("is-on", j === i));
    plot.setAttribute("aria-valuenow", String(i + 1));
    plot.setAttribute("aria-valuetext", valText(weeks[i]));
  };
  const colAt = e => { const r = plot.getBoundingClientRect(); return r.width > 0 ? Math.floor(((e.clientX - r.left) / r.width) * weeks.length) : cur; };
  const plot = h("div", { class: "pl-plot", role: "slider", tabindex: "0", "aria-labelledby": "pl-chart-h", "aria-orientation": "horizontal",
    "aria-valuemin": "1", "aria-valuemax": String(weeks.length),
    onpointerdown: e => pick(colAt(e)),
    onpointermove: e => { if (e.pointerType === "mouse" || e.buttons) pick(colAt(e)); },
    onkeydown: e => {
      const j = { ArrowLeft: cur - 1, ArrowDown: cur - 1, ArrowRight: cur + 1, ArrowUp: cur + 1, Home: 0, End: weeks.length - 1 }[e.key];
      if (j === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      pick(j);
    } },
    h("div", { class: "pl-target", style: `bottom:${(target / max) * 100}%`, "aria-hidden": "true" }),
    bars);
  const axis = h("div", { class: "pl-axis", "aria-hidden": "true" }, weeks.map(w => h("span", {}, label(w))));
  pick(weeks.length - 1);
  const table = h("table", { class: "pl-table" },
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "週 ", enText("Week of")), h("th", { scope: "col" }, enText("Hours")), h("th", { scope: "col" }, "App"), h("th", { scope: "col" }, "課外 ", enText("Outside")))),
    h("tbody", {}, weeks.map(w => h("tr", {}, h("th", { scope: "row" }, w.start, w.partial ? enText(" (so far)") : ""), h("td", {}, fmtH(w.hours)), h("td", {}, fmtH(w.app)), h("td", {}, fmtH(w.outside))))));
  panel.append(h("figure", { class: "pl-chart card", "aria-labelledby": "pl-chart-h" },
    h("figcaption", { id: "pl-chart-h", class: "pl-chart-h" }, "每週時數 ", enText("Hours per week, last 8 weeks")),
    plot, axis, readout,
    h("p", { class: "pl-legend small muted" }, h("span", { class: "pl-legend-line", "aria-hidden": "true" }), "目標 ", enText(`target ${fmtH(target)} h a week`),
      h("span", { class: "pl-legend-part", "aria-hidden": "true" }), "本週還沒過完 ", enText("this week, so far")),
    h("details", { class: "pl-details" }, h("summary", {}, "表格 ", enText("Table")), tableWrap("每週時數表", "Hours per week, table", table))));

  // against the §8.2 estimates: from the next band up to the goal band (B1)
  const nb = nextBand(L ? L.level : 1);
  const goalIdx = BANDS.findIndex(b => b.id === "B1");
  const from = BANDS.indexOf(nb);
  const rows = BANDS.slice(from, Math.max(from, goalIdx) + 1);
  const nw = s => h("span", { class: "pl-nw", lang: "en" }, s);
  // with no recent pace a band already entered has a start (today) but no end date
  const when = o => o.reached ? enText("reached") : o.inRange
    ? (o.dateHi ? [nw("in range now –"), " ", nw(monthEn(o.dateHi))] : [nw("in range now"), " ", enText("(no pace for the high end)")])
    : !o.dateLo || !o.dateHi ? enText("no pace yet") : [nw(`${monthEn(o.dateLo)} –`), " ", nw(monthEn(o.dateHi))];
  const sec = h("section", { class: "pl-section", "aria-labelledby": "pl-pace-h" },
    h("h2", { id: "pl-pace-h" }, "照目前的速度 ", enText("At this pace")),
    h("p", { class: "small" }, ...(perWeek > 0
      ? bi(`以近 4 週平均每週 ${fmtH(perWeek)} 小時計算，日期是 TOCFL 時數範圍的兩端。`, `At your last-4-weeks average of ${fmtH(perWeek)} h a week; the dates are the two ends of the TOCFL hour range.`)
      : t.hours > 0 ? bi("近 4 週沒有記錄到學習時間，所以算不出速度。", "No study time logged in the last 4 weeks, so there is no pace to project.")
      : bi("還沒有記錄到學習時間，所以算不出速度。", "No study time logged yet, so there is no pace to project."))),
    tableWrap("照目前的速度", "At this pace, table", h("table", { class: "pl-table" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "等級 ", enText("Band")), h("th", { scope: "col" }, "時數 ", enText("Hours")), h("th", { scope: "col" }, "還差 ", enText("To go")), h("th", { scope: "col" }, "大約 ", enText("Around")))),
      h("tbody", {}, rows.map(b => { const o = bandOutlook(t.hours, perWeek, b, now); return h("tr", {},
        h("th", { scope: "row" }, b.id, b.label !== b.id ? h("span", { class: "pl-sub" }, enText(b.label.replace(/ · .*$/, ""))) : null),
        h("td", { class: "pl-nw" }, `${b.lo}–${b.hi}`), h("td", { class: "pl-nw" }, o.reached ? "0" : `${fmtH(o.remLo)}–${fmtH(o.remHi)}`), h("td", {}, when(o))); })))),
    h("p", { class: "small muted" }, ...bi("這是 TOCFL 給海外學習者的課堂時數，只是粗略參考。只算在這裡記錄的時間（App 和課外）；開始用 App 以前學的不算，所以如果測驗把你放在第 1 級以上，這些日期偏保守。",
      "These are TOCFL's classroom hours for learners outside Taiwan: a rough guide. Only time logged here counts (app and outside time); study before you started isn't included, so if placement put you past Level 1, these dates are on the cautious side.")));
  panel.append(sec);

  // goal date (§8.2): if the pace can't reach it, say so and give the minutes a day needed
  const goal = { band: "B1", date: "", ...(store.get("plan.goal", {}) || {}) };
  const out = h("div", { class: "pl-goal-out", "aria-live": "polite" });
  const dateIn = h("input", { type: "date", id: "pl-goal-date", class: "pl-input", value: goal.date || "", min: today() });
  const bandSel = h("select", { id: "pl-goal-band", class: "pl-input" }, BANDS.slice(0, 4).map(b => h("option", { value: b.id, selected: b.id === goal.band }, b.label)));
  const update = () => {
    goal.date = dateIn.value; goal.band = bandSel.value;
    store.set("plan.goal", { date: goal.date, band: goal.band });
    const band = BANDS.find(b => b.id === goal.band) || BANDS[2];
    clear(out);
    if (!goal.date) { out.append(h("p", { class: "muted small" }, ...bi("選一個日期，看看目前的速度來不來得及。", "Pick a date to see whether this pace gets there."))); return; }
    const a = goalAdvice(t.hours, perWeek, band, goal.date, now, studyDays);
    const need = () => h("p", {}, ...bi(`需要每天 ${a.needLo}–${a.needHi} 分鐘（每週 ${studyDays} 天）。`, `That needs ${a.needLo}–${a.needHi} minutes a day, ${studyDays} days a week (low and high end of the estimate).`),
      a.needLo > 240 ? h("span", { class: "muted" }, " ", ...bi("一天超過 4 小時：考慮晚一點的日期。", "That's over 4 hours a day: consider a later date.")) : null);
    const msg = {
      invalid: () => [h("p", {}, ...bi("日期看不懂。", "That date can't be read."))],
      past: () => [h("p", {}, ...bi("這個日期已經過了。", "That date has passed."))],
      reached: () => [h("p", {}, ...bi("記錄的時數已經超過這個等級的估計。", "Your logged hours are already past this band's estimate."))],
      nopace: () => [h("p", {}, ...bi("還沒有速度可以比較。", "No pace yet to compare.")), need()],
      ok: () => [h("p", { class: "feedback good" }, "✓ ", ...bi("照目前的速度，連估計的上限都來得及。", "At this pace you get there even at the high end of the estimate."))],
      low: () => [h("p", { class: "pl-warn-t" }, "△ ", ...bi("只有在估計的下限才來得及。", "Only at the low end of the estimate.")), need()],
      no: () => [h("p", { class: "feedback bad" }, "✗ ", ...bi("目前的速度到不了。", "This pace can't reach it.")), need()],
    }[a.status]();
    out.append(...msg);
  };
  dateIn.addEventListener("change", update);
  bandSel.addEventListener("change", update);
  panel.append(h("section", { class: "pl-section card", "aria-labelledby": "pl-goalh" },
    h("h2", { id: "pl-goalh" }, "目標日期 ", enText("Goal date")),
    h("div", { class: "pl-form" },
      h("label", { for: "pl-goal-band" }, "等級 ", enText("Band")), bandSel,
      h("label", { for: "pl-goal-date" }, "日期 ", enText("Date")), dateIn),
    out));
  update();
}

// ------------------------------------------------------------------ 3. 程度測驗 Placement and 4. 等級檢查 Level checks
const RUN_KEY = kind => `plan.run.${kind}`;
const TAP_GUARD = 350; // ms after a step is drawn during which its answer buttons ignore clicks (runView ctx.act)
const DBL_GUARD = 1000; // ms after it during which they ignore a double click's later clicks (OS limits are under 1 s)
async function withData(panel) {
  const tok = viewToken;
  const wait = h("p", { class: "muted" }, "載入中… ", enText("Loading…"));
  panel.append(wait);
  try { D = await data(); } catch (err) { console.error(err); D = null; }
  if (tok !== viewToken) return false;
  wait.remove();
  if (!D) { panel.append(notice("資料載入失敗。", "The data could not be loaded.", "alert")); return false; }
  return true;
}
const missingNotes = () => [
  D.missing.placement ? notice("測驗題目還沒建置。", "The placement questions (docs/data/placement.json) aren't built yet: run tools/build.py.") : null,
  D.missing.words ? notice("詞表還沒建置。", "The word list (docs/data/library-words.json) isn't built yet: run tools/build.py.") : null,
  !D.missing.placement && !D.diag.length ? notice("發音診斷沒有可用的教育部錄音。", "No diagnostic word has an MOE clip yet, so the pronunciation part will be skipped.") : null,
].filter(Boolean);

async function renderPlacement(panel) {
  if (!(await withData(panel))) return;
  const saved = store.get(RUN_KEY("placement"), null);
  const last = store.get("plan.placement", null);
  panel.append(h("section", { class: "pl-section", "aria-labelledby": "pl-pl-h" },
    h("h2", { id: "pl-pl-h" }, "程度測驗 ", enText("Placement check")),
    h("p", {}, ...bi("自己做，不需要老師。三部分：", "Fully self-run, no teacher. Three parts:")),
    h("ol", { class: "pl-parts" },
      h("li", {}, ...bi("詞彙：每一級 10 個詞，選你認識的，再用 3 題意思確認（認識的比例 × 確認的正確率）。連續兩級低於 40% 就停。",
        "Vocabulary: 10 words per TBCL level; mark the ones you know, then 3 quick meaning checks catch over-claiming (estimate = claimed share × check accuracy). It stops after two levels in a row below 40%.")),
      h("li", {}, ...bi("聽力和閱讀：每一級 8 題；正確率低於 50% 就停在那一級。", "Listening, then reading: 8 questions per level; each part stops at the first level below 50%.")),
      h("li", {}, ...bi("發音診斷：聽教育部的示範，錄自己的，看音高曲線，自己判斷聲音和聲調對不對。", "Pronunciation: hear the MOE model, record yourself, look at the pitch curves, and judge the sound and the tone yourself."))),
    h("p", { class: "small muted" }, ...bi("大約 30–45 分鐘。可以隨時暫停，下次接著做。", "About 30–45 minutes. Pause any time and carry on later."))));
  panel.append(...missingNotes());
  const ready = !D.missing.placement && !D.missing.words;
  const start = () => { const run = newRun("placement"); runView(panel, run); };
  const actions = h("div", { class: "row pl-actions" });
  if (saved && saved.kind === "placement" && saved.stage !== "done") {
    actions.append(h("button", { type: "button", class: "btn primary", "data-resume": "", disabled: !ready, onclick: () => runView(panel, saved) }, "繼續 ", enText(`Resume (started ${saved.date})`)),
      h("button", { type: "button", class: "btn", disabled: !ready, onclick: () => { store.remove(RUN_KEY("placement")); start(); } }, "重新開始 ", enText("Start over")));
  } else {
    actions.append(h("button", { type: "button", class: "btn primary", disabled: !ready, onclick: start }, last ? "再做一次 " : "開始 ", enText(last ? "Run it again" : "Start")));
  }
  panel.append(actions);
  if (last) panel.append(h("h3", { class: "pl-sub-h" }, "上一次的結果 ", enText(`Last result (${last.date})`)), resultView(last));
}

async function renderChecks(panel) {
  if (!(await withData(panel))) return;
  const saved = store.get(RUN_KEY("check"), null);
  const checks = store.get("plan.checks", {}) || {};
  const L = levelInfo();
  const done = store.get("units.done", {}) || {};
  panel.append(h("section", { class: "pl-section", "aria-labelledby": "pl-ck-h" },
    h("h2", { id: "pl-ck-h" }, "等級檢查 ", enText("Level checks")),
    h("p", {}, ...bi("和程度測驗一樣的形式，只考一個等級：20 個詞（5 題意思確認）、那一級全部的聽力和閱讀題、完整的發音診斷。",
      "The placement format, one level only: 20 words with 5 meaning checks, all of that level's listening and reading questions, and the full pronunciation diagnostic.")),
    h("ul", { class: "pl-rules" },
      h("li", {}, ...bi(`通過：聽力和閱讀各 ≥ ${TH.passSkill}%，詞彙 ≥ ${TH.passVocab}%，發音診斷沒有紅色的對比。`, `Pass: listening and reading ≥ ${TH.passSkill}% each, vocabulary ≥ ${TH.passVocab}%, no red contrast in the diagnostic.`)),
      h("li", {}, ...bi("那一級的課程完成 90% 以後解鎖。在那之前可以練習，但不算數。", "Unlocks when 90% of the level's units are done. Before that you can do a practice run; it doesn't count."))),
    h("p", { class: "small" }, ...bi("每個階段結束時，也試試官方免費的 TOCFL 模擬試題：", "At the end of each phase, also try the official free TOCFL mock tests: "),
      h("a", { href: MOCK_URL, target: "_blank", rel: "noopener" }, enText("tocfl.edu.tw mock tests ↗")))));
  panel.append(...missingNotes());
  const ready = !D.missing.placement && !D.missing.words;
  if (saved && saved.kind === "check" && saved.stage !== "done") {
    panel.append(h("div", { class: "card pl-resume" }, h("p", {}, `第 ${saved.level} 級檢查進行中 `, enText(`A Level ${saved.level} check is in progress (started ${saved.date}${saved.practice ? ", practice" : ""}).`)),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", "data-resume": "", disabled: !ready, onclick: () => runView(panel, saved) }, "繼續 ", enText("Resume")),
        h("button", { type: "button", class: "btn", onclick: () => { store.remove(RUN_KEY("check")); showTab("checks", true); } }, "放棄 ", enText("Discard")))));
  }
  const list = h("div", { class: "pl-checks" });
  for (const n of [1, 2, 3, 4, 5]) {
    const share = unitsDoneShare(D.units, n, done);
    const unlocked = share != null && share >= 0.9;
    const r = checks[n];
    const lv = LEVELS[n - 1];
    const startCheck = practice => { store.remove(RUN_KEY("check")); runView(panel, newRun("check", n, practice)); };
    list.append(h("section", { class: "card pl-check" + (L && L.level === n ? " is-current" : ""), "aria-labelledby": `pl-ck-${n}` },
      h("h3", { id: `pl-ck-${n}`, class: "pl-check-h" }, ...levelName(n), h("span", { class: "pl-band" }, enText(lv.band))),
      h("p", { class: "small" }, unlocked ? ["🔓 ", ...bi("已解鎖。", "Unlocked.")]
        : ["🔒 ", ...(share == null ? bi("這一級的課程還沒寫好，所以還鎖著。", "Locked: this level's units aren't written yet.")
          : bi(`已完成 ${Math.round(share * 100)}% 的課程，要 90%。`, `${Math.round(share * 100)}% of the units done; 90% unlocks it.`))]),
      r ? h("p", { class: "small" }, r.passed ? h("span", { class: "feedback good" }, "✓ 通過 ", enText("Passed")) : h("span", {}, "未通過 ", enText("Not yet")),
        ` · ${r.date}`, r.practice ? h("span", { class: "muted" }, " · ", enText("practice")) : null) : null,
      n === 3 ? h("p", { class: "small muted" }, ...bi("到了 Band A：如果需要證書，可以考正式的 TOCFL。要付費，由你決定。", "Band A: the real TOCFL exam is an option if a certificate would help. It costs money; your call.")) : null,
      n === 4 ? h("p", { class: "small muted" }, ...bi("到了 Band B：正式的 TOCFL 考試是一個選擇，要不要考由你決定。", "Band B: the real TOCFL exam is an option here too. Entirely your decision.")) : null,
      h("div", { class: "row" }, unlocked
        ? h("button", { type: "button", class: "btn primary", disabled: !ready, onclick: () => startCheck(false) }, "開始檢查 ", enText("Start the check"))
        : h("button", { type: "button", class: "btn", disabled: !ready, onclick: () => startCheck(true) }, "練習一次 ", enText("Practice run (doesn't count)")),
      r ? h("button", { type: "button", class: "btn", onclick: e => { const box = e.currentTarget.closest(".pl-check"); const old = box.querySelector(".pl-result"); if (old) old.remove(); else box.append(resultView(r)); } }, "結果 ", enText("Result")) : null)));
  }
  panel.append(list);
}

// ---- the run view: one step at a time, saved after every answer
function runView(panel, run) {
  leaveView();
  clear(panel);
  const box = h("div", { class: "pl-run" });
  panel.append(box);
  let stepDown = [];
  const leaveStep = () => { for (const f of stepDown.splice(0)) { try { f(); } catch (err) { console.error(err); } } };
  teardown.push(leaveStep);
  if (!lastAct || Date.now() - lastAct > 120000) lastAct = Date.now();
  const save = () => { if (run.stage !== "done") store.set(RUN_KEY(run.kind), run); };
  // The next step is drawn in the same place at once, so a double click's (or double tap's) second click would answer
  // it unseen: a click (e) within TAP_GUARD ms of the step being drawn, or a second click within DBL_GUARD ms of it, is
  // dropped (only then: a quick second click on a word toggle well after the draw is a real "unmark").
  let drawnAt = 0;
  const ctx = {
    save,
    onDown: f => stepDown.push(f),
    early: e => !!e && performance.now() - drawnAt < (e.detail > 1 ? DBL_GUARD : TAP_GUARD),
    act(fn, e = null) { if (ctx.early(e)) return; logActive(); fn(); redraw(); },
    pause() { save(); showTab(run.kind === "check" ? "checks" : "placement", "[data-resume]"); },  // focus: its Resume button
  };
  function redraw() {
    settle(run, D);
    if (run.stage === "done") { store.remove(RUN_KEY(run.kind)); if (!run.applied) { applyResult(run); run.applied = true; } }
    else save();
    leaveStep();
    stopAll();
    clear(box);
    drawnAt = performance.now();
    if (run.stage === "done") {
      box.append(h("h2", { class: "pl-done-h", tabindex: "-1" }, run.kind === "check" ? `第 ${run.level} 級檢查完成 ` : "程度測驗完成 ",
        enText(run.kind === "check" ? `Level ${run.level} check done` : "Placement check done")), resultView(run.result, { fresh: true }),
      h("div", { class: "row pl-actions" }, h("button", { type: "button", class: "btn primary", onclick: e => ctx.early(e) || showTab("roadmap", true) }, "看路線圖 ", enText("See the roadmap")),
        h("button", { type: "button", class: "btn", onclick: e => ctx.early(e) || showTab(run.kind === "check" ? "checks" : "placement", true) }, "返回 ", enText("Back"))));
      box.querySelector(".pl-done-h").focus();
      return;
    }
    box.append(progressHead(run, ctx));
    const stage = h("div", { class: "pl-step" });
    box.append(stage);
    ({ vocab: drawVocab, listening: drawSkill, reading: drawSkill, diag: drawDiag })[run.stage](stage, run, ctx);
    const f = stage.querySelector("[data-focus]");
    if (f) f.focus();
  }
  redraw();
}
function progressHead(run, ctx) {
  const parts = [["vocab", "詞彙", "Vocabulary"], ["listening", "聽力", "Listening"], ["reading", "閱讀", "Reading"], ["diag", "發音", "Pronunciation"]];
  const i = parts.findIndex(p => p[0] === run.stage);
  return h("div", { class: "pl-run-head" },
    h("div", { class: "pl-run-top" },
      h("p", { class: "pl-run-title" }, run.kind === "check" ? [`第 ${run.level} 級檢查`, " ", enText(`Level ${run.level} check${run.practice ? " (practice)" : ""}`)] : ["程度測驗", " ", enText("Placement check")]),
      h("button", { type: "button", class: "btn small pl-pause", onclick: () => ctx.pause() }, "暫停 ", enText("Pause"))),
    h("ol", { class: "pl-steps" }, parts.map((p, j) => h("li", { class: j < i ? "done" : j === i ? "current" : "", "aria-current": j === i ? "step" : null },
      h("span", { class: "pl-step-n", "aria-hidden": "true" }, j < i ? "✓" : j + 1), h("span", {}, p[1], " ", h("span", { class: "en", lang: "en" }, p[2]))))));
}
function zhuyinToggle(run, target, ctx) {
  const b = h("button", { type: "button", class: "btn small pl-zy", "aria-pressed": String(!!run.showZhuyin), onclick: () => {
    run.showZhuyin = !run.showZhuyin; b.setAttribute("aria-pressed", String(run.showZhuyin));
    for (const t of [].concat(target)) t.classList.toggle("hide-ruby", !run.showZhuyin);
    ctx.save();
  } }, "注音 ", enText("Zhuyin"));
  for (const t of [].concat(target)) t.classList.toggle("hide-ruby", !run.showZhuyin);
  return b;
}
const optionButtons = (options, onPick, { dontKnow = true, skip = null } = {}) => h("div", { class: "pl-opts", role: "group", "aria-label": "選項 Options" },
  // the options are learning content (lc-en): immersion never hides them
  options.map((o, j) => h("button", { type: "button", class: "pl-opt", onclick: e => onPick(j, e) }, h("span", { class: "pl-opt-k", "aria-hidden": "true" }, "ABCDEFG"[j]), enText(o, { class: "lc-en" }))),
  dontKnow ? h("button", { type: "button", class: "pl-opt pl-opt-dk", onclick: e => onPick(-1, e) }, "不知道 ", enText("I don't know")) : null,
  skip ? h("button", { type: "button", class: "pl-opt pl-opt-dk", onclick: skip }, "播不出來，跳過 ", enText("Can't play it: skip (not counted)")) : null);

function drawVocab(stage, run, ctx) {
  const n = curLevel(run, "vocab"), row = run.vocab.rows[n];
  if (run.vocab.step === "check") {
    const c = row.checks[row.ci], w = row.words[c.i];
    const word = h("p", { class: "pl-big" }, ruby(w.zh, w.zhuyin, { cls: "" }));
    stage.append(h("p", { class: "muted small pl-meta" }, `第 ${n} 級 · 意思確認 ${row.ci + 1} / ${row.checks.length} `, enText(`Level ${n} · meaning check ${row.ci + 1} of ${row.checks.length}`)),
      h("h3", { class: "pl-q", tabindex: "-1", "data-focus": "" }, "這個詞是什麼意思？ ", enText("What does it mean?")),
      h("div", { class: "row pl-word-row" }, word, zhuyinToggle(run, word, ctx)),
      optionButtons(c.options, (j, e) => ctx.act(() => answerMeaning(run, j), e)));
    return;
  }
  const grid = h("div", { class: "pl-words" });
  const count = h("span", { class: "muted small", "aria-live": "polite" });
  const setCount = () => count.replaceChildren(`${row.known.filter(Boolean).length} / ${row.words.length} `, enText("marked"));
  row.words.forEach((w, i) => {
    const b = h("button", { type: "button", class: "pl-word", "aria-pressed": String(!!row.known[i]), onclick: e => {
      if (ctx.early(e)) return; // nor may it mark a word of a level just drawn
      row.known[i] = !row.known[i]; b.setAttribute("aria-pressed", String(row.known[i])); setCount(); ctx.save();
    } }, ruby(w.zh, w.zhuyin, { cls: "pl-word-zh" }), h("span", { class: "pl-word-mark", "aria-hidden": "true" }, "✓"));
    grid.append(b);
  });
  setCount();
  stage.append(h("p", { class: "muted small pl-meta" }, `第 ${n} 級 `, enText(`TBCL Level ${n} · ${row.words.length} words`)),
    h("h3", { class: "pl-q", tabindex: "-1", "data-focus": "" }, "你認識哪些詞？ ", enText("Which words do you know?")),
    h("p", { class: "small" }, ...bi("點你認識的詞：看到就說得出意思的。不確定就不要點。", "Tap each word you know: you could say what it means. If unsure, leave it.")),
    h("div", { class: "row pl-tools" }, zhuyinToggle(run, grid, ctx), count),
    grid,
    h("div", { class: "row pl-actions" }, h("button", { type: "button", class: "btn primary", onclick: e => ctx.act(() => submitClaims(run, D), e) }, "下一步 ", enText("Next"))));
}

function drawSkill(stage, run, ctx) {
  const skill = run.stage, n = curLevel(run, skill), row = run[skill].rows[n];
  const k = row.answers.length, q = row.items[k];
  const listening = skill === "listening";
  stage.append(h("p", { class: "muted small pl-meta" }, `第 ${n} 級 · ${k + 1} / ${row.items.length} `, enText(`Level ${n} · question ${k + 1} of ${row.items.length}`)));
  let play = null;
  if (listening) {
    const item = { id: q.id, zh: q.zh, audio: q.audio };
    play = playButton(item, { label: [h("span", { "aria-hidden": "true" }, "▶ "), "播放 ", enText("Play")], cls: "btn primary pl-play" });
    // named by its visible words: playButton's label names the text, which would give the answer away; the voice's
    // source stays in the title (its description)
    (play.querySelector("button") || play).removeAttribute("aria-label");
    stage.append(h("div", { class: "row pl-listen" }, play));
    const voiceOnly = !q.id && !q.audio;
    if (voiceOnly && !hasTwVoice()) stage.append(notice("這個瀏覽器沒有臺灣華語語音。", "This browser has no Taiwan Mandarin voice for this item: if you can't hear it, skip it (not counted)."));
  } else {
    const text = h("p", { class: "pl-reading" }, ruby(q.zh, q.zhuyin, { cls: "", spoken: q.spoken }));
    stage.append(h("div", { class: "pl-reading-box" }, text, h("div", { class: "row" }, zhuyinToggle(run, text, ctx))));
  }
  stage.append(h("h3", { class: "pl-q", tabindex: "-1", "data-focus": listening ? null : "" }, enText(q.question || (listening ? "What did you hear?" : "What does it say?"), { class: "lc-en" })),
    optionButtons(q.options, (j, e) => ctx.act(() => answerSkill(run, skill, j), e), { skip: listening ? e => ctx.act(() => answerSkill(run, skill, null), e) : null }),
    h("div", { class: "row pl-actions" }, h("button", { type: "button", class: "btn small pl-giveup", onclick: e => ctx.act(() => giveUpSkill(run, skill), e) },
      listening ? "太難了，結束聽力 " : "太難了，結束閱讀 ", enText(listening ? "Too hard: end the listening part" : "Too hard: end the reading part"))));
  if (listening && play) {
    const btn = play.querySelector("button") || play;
    btn.setAttribute("data-focus", "");
    // play once on arrival (unless played already), after the screen reader has said the focused button; Play again any time
    let played = false;
    btn.addEventListener("click", () => { played = true; }, { once: true });
    setTimeout(() => { if (btn.isConnected && !played) btn.click(); }, 900);
  }
}

// ---- the pronunciation diagnostic: MOE model, a take with live pitch (as drills.js mirrorDrill), self-check ✓/✗
let pitchyP = null;
const pitchReady = () => (pitchyP ||= pitch.loadPitchy().then(() => true, err => { console.warn(err); pitchyP = null; return false; }));
const withTimeout = (p, ms, v) => Promise.race([p, new Promise(r => setTimeout(() => r(v), ms))]);
const lastVoiced = frames => { let count = 0, t = null; for (const f of frames) if (f.hz) { count++; t = f.t; } return { count, t }; };
function makeTake({ limitSec = 4, silence = 0.8, onState, onLive, onTake, onError }) {
  let rec = null, starting = false, cancelled = false, timers = [];
  const clearT = () => { for (const t of timers) { clearTimeout(t); clearInterval(t); } timers = []; };
  return {
    get busy() { return !!rec || starting; },
    async start() {
      if (rec || starting) return;
      starting = true; cancelled = false; onState(true);
      stopAll(); // the model must not play into the take
      const ok = await withTimeout(pitchReady(), 3000, false);
      if (cancelled) { starting = false; onState(false); return; }
      let live = null;
      if (ok) { try { live = new pitch.LivePitch(); } catch (err) { console.error(err); } }
      const r = new Recorder();
      r.onstopped = blob => {
        if (rec === r) rec = null;
        clearT(); onState(false);
        if (cancelled || !blob || !blob.size) return;
        onTake({ blob, live });
      };
      rec = r;
      let started = false;
      try { started = await r.start(live ? { onFrame: (buf, sr, t) => { try { live.push(buf, sr, t); } catch { /* keep recording */ } } } : {}); }
      catch (err) { if (rec === r) rec = null; starting = false; onState(false); onError(err); return; }
      starting = false;
      if (!started) { if (rec === r) rec = null; onState(false); return; }
      if (cancelled) { r.stop(); return; }
      timers.push(setTimeout(() => r.stop(), Math.round(limitSec * 1000)));
      if (live) timers.push(setInterval(() => {
        if (rec !== r) return;
        const f = live.frames;
        if (onLive) { try { onLive(f); } catch (err) { console.error(err); } }
        const v = lastVoiced(f);
        if (v.count >= 6 && f.length && f[f.length - 1].t - v.t >= silence) r.stop();
      }, 150));
    },
    stop() { if (rec) rec.stop(); else if (starting) cancelled = true; },
    cancel() { cancelled = true; clearT(); if (rec) rec.stop(); },
  };
}
async function userContour(take) {
  if (!(await pitchReady())) return null;
  try {
    const buf = await audioContext().decodeAudioData(await take.blob.arrayBuffer());
    return pitch.normalize(await pitch.analyzeSamples(buf.getChannelData(0), buf.sampleRate));
  } catch (err) { console.warn("take not decodable, using the live frames", err); }
  try { return take.live ? pitch.normalize(take.live.frames) : null; } catch (err) { console.error(err); return null; }
}
function drawOverlay(box, { model = null, user = null, syllables: syls = [] }) {
  const width = Math.round(Math.min(560, Math.max(280, (box.clientWidth || 342) - 2)));
  const height = Math.round(Math.min(240, Math.max(180, width * 0.52)));
  try { clear(box).append(pitch.overlay({ model, user, syllables: syls, width, height })); }
  catch (err) { console.error(err); clear(box).append(h("p", { class: "muted small" }, ...bi("無法畫出音高曲線。", "Could not draw the pitch curve."))); }
}
const describe = c => { try { return c ? pitch.describeContour(c) : ""; } catch { return ""; } };
function sylsOf(it) {
  const said = it.spoken && syllables(it.spoken).length === syllables(it.zhuyin).length ? it.spoken : it.zhuyin;
  return { said, list: syllables(said).map(z => ({ zhuyin: z, tone: toneOf(z) })) };
}
let blobUrl = null;
async function playBlob(blob) {
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  const url = blobUrl = URL.createObjectURL(blob);
  try { await playFile(url); } finally { if (blobUrl === url) { URL.revokeObjectURL(url); blobUrl = null; } }
}

function drawDiag(stage, run, ctx) {
  const d = run.diag, it = d.items[d.i];
  const mark = d.marks[d.i] && !d.marks[d.i].skipped ? d.marks[d.i] : (d.marks[d.i] = { sound: null, tone: null, score: null });
  const model = D.contours[it.id] || null;
  const info = D.audio[it.id];
  const spanLen = info && info.end > info.start ? info.end - info.start : 0.8;
  const { said, list: syls } = sylsOf(it);
  const box = h("div", { class: "overlay-box" });
  const scoreBox = h("div", { class: "mirror-score", "aria-live": "polite" });
  const shapeLine = h("p", { class: "muted small mirror-shape" });
  const last = d.i + 1 >= d.items.length;
  let take = null, hadTake = false;
  const playModel = () => { if (tr && tr.busy) return; stopAll(); playMoe(it.id).catch(err => toast("無法播放 Could not play: " + (err.message || err))); };
  const modelBtn = h("button", { type: "button", class: "btn", "data-focus": "", "aria-label": `示範 Model: ${it.zh} — ${MOE_NAME}`, onclick: playModel }, "▶ ", ...bi("示範", "Model"));
  const recBtn = h("button", { type: "button", class: "btn primary rec-btn", onclick: () => (tr.busy ? tr.stop() : tr.start()) });
  const mineBtn = h("button", { type: "button", class: "btn", disabled: true, "aria-label": `我的 Mine: ${it.zh} — my recording`, onclick: () => { if (take) playBlob(take.blob); } }, "▶ ", ...bi("我的", "Mine"));
  let shown = null;
  const setRec = on => {
    recBtn.classList.toggle("recording", on);
    recBtn.replaceChildren(...(on ? [h("span", { class: "rec-dot", "aria-hidden": "true" }), " ", ...bi("停止", "Stop")]
      : hadTake ? ["↻ ", ...bi("再錄", "Record again")] : ["● ", ...bi("錄音", "Record")]));
    modelBtn.disabled = on;
    // visual only (aria-hidden in the live region): a screen reader saying it now would land in the take
    if (on) { shown = [...scoreBox.childNodes]; scoreBox.replaceChildren(h("span", { class: "muted", "aria-hidden": "true" }, "錄音中…說完會自動停止。", enText(" Recording… it stops by itself when you finish."))); }
    else if (shown) { scoreBox.replaceChildren(...shown); shown = null; }
  };
  const tr = d.noMic ? null : makeTake({ limitSec: Math.max(2.5, 2.5 * spanLen + 1), onState: setRec,
    onLive: frames => { let u = null; try { u = pitch.normalize(frames); } catch { /* not enough yet */ } if (u) drawOverlay(box, { model, user: u, syllables: syls }); },
    onTake: t => onTake(t),
    onError: err => {
      d.noMic = err && (err.name === "NotAllowedError" || err.name === "SecurityError") ? "denied" : "error";
      toast("需要麥克風權限 Microphone permission needed");
      ctx.act(() => {}); // the same word again, listen-only
    } });
  if (tr) ctx.onDown(() => tr.cancel());
  async function onTake(t) {
    hadTake = true; setRec(false);
    take = { blob: t.blob }; mineBtn.disabled = false;
    scoreBox.replaceChildren(h("span", { class: "muted" }, "分析中… ", enText("Analysing…")));
    const sinfo = D.audio[it.id] || {};
    saveRecording(`shadow:diag-${it.id}`, t.blob, { zh: it.zh, zhuyin: it.zhuyin, spoken: it.spoken || null, line: `diag-${it.id}`,
      title: `${it.zh}（程度測驗 placement）`, src: "moe", model: { src: "moe", id: it.id, start: sinfo.start, end: sinfo.end }, rating: null }).catch(() => {});
    const user = await userContour(t);
    if (!box.isConnected) return;
    if (!user) {
      scoreBox.replaceChildren(h("span", {}, "沒有分數：太短或太小聲，或還沒載入音高分析。", enText(" No score: too short or quiet, or the pitch analysis isn't loaded. Judge by listening.")));
      drawOverlay(box, { model, syllables: syls });
      return;
    }
    drawOverlay(box, { model, user, syllables: syls });
    const cmp = model ? pitch.compare(model, user, { syllables: syls }) : null;
    const score = cmp && Number.isFinite(cmp.score) ? cmp.score : null;
    mark.score = score; ctx.save();
    scoreBox.replaceChildren(...(score != null
      ? [h("span", { class: "num" }, score), h("span", { class: "of" }, "/100"), " ", h("span", { class: "small muted" }, "音高分數只是參考，聲調由你判斷。", enText(" The pitch score is a help for the tone; the judgement is yours."))]
      : [h("span", {}, "沒有分數。", enText(" No score for this take: judge by listening."))]));
    const m = describe(model), u = describe(user);
    shapeLine.replaceChildren(m || u ? enText(`${m ? `Model ${m}` : ""}${m && u ? "; " : ""}${u ? `you ${u}` : ""}.`) : "");
  }
  // self-check: sound and tone, ✓ or ✗ each
  const next = h("button", { type: "button", class: "btn primary", onclick: e => ctx.act(() => { d.i++; }, e) }, ...(last ? bi("完成", "Finish") : bi("下一個", "Next →")));
  const sync = () => { next.disabled = mark.sound == null || mark.tone == null; };
  const judge = (key, zh, en) => {
    const btns = [true, false].map(v => h("button", { type: "button", "aria-pressed": String(mark[key] === v), onclick: () => {
      mark[key] = v; btns.forEach((b, j) => b.setAttribute("aria-pressed", String(mark[key] === (j === 0)))); sync(); ctx.save();
    } }, v ? "✓ 對 " : "✗ 不對 ", enText(v ? "right" : "off")));
    return h("div", { class: "pl-judge", role: "group", "aria-label": `${zh} ${en}` }, h("span", { class: "pl-judge-l" }, zh, " ", enText(en)), h("div", { class: "seg" }, btns));
  };
  sync();
  stage.append(...[
    h("p", { class: "muted small pl-meta" }, `第 ${d.i + 1} / ${d.items.length} 個 `, enText(`Word ${d.i + 1} of ${d.items.length} · listen, ${d.noMic ? "say it aloud" : "record yourself"}, then judge it`)),
    h("div", { class: "mirror-word" }, h("span", { class: "big-zh" }, ruby(it.zh, it.zhuyin, { cls: "", spoken: it.spoken, sandhi: true })), it.en ? enText(it.en, { class: "muted lc-en" }) : null),
    said !== it.zhuyin ? h("p", { class: "small mirror-sandhi" }, `變調：寫作 ${it.zhuyin}，說成 ${said}。`, enText(` Tone sandhi: written ${it.zhuyin}, said ${said}.`)) : null,
    d.noMic ? null : box, d.noMic ? null : shapeLine,
    d.noMic ? h("p", { class: "small mirror-nomic", role: "note" }, d.noMic === "denied" ? "沒有麥克風權限。" : "這裡不能錄音。", "聽示範，大聲說幾次，再自己判斷。",
      enText(` ${d.noMic === "denied" ? "Microphone permission was refused" : "Recording isn't available here"}: listen to the model, say it aloud a few times, then judge yourself.`)) : scoreBox,
    h("div", { class: "mirror-controls" }, modelBtn, tr ? [recBtn, mineBtn] : null, h("span", { class: "badge human", title: MOE_NAME }, "MOE")),
    h("div", { class: "pl-judges" }, judge("sound", "聲母韻母", "Sounds (initial and final)"), judge("tone", "聲調", "Tone")),
    h("div", { class: "row pl-actions" }, next,
      h("button", { type: "button", class: "btn small", onclick: e => ctx.act(() => { d.marks[d.i] = { skipped: true }; d.i++; }, e) }, "略過 ", enText("Skip (not counted)"))),
    h("p", { class: "small muted" }, ...bi("你的錄音存在這台裝置上；之後可以在「跟讀」的母語者檢查請朋友聽。", "Your take stays on this device; later a Taiwanese friend can rate it in Shadowing → Native check."),
      " ", h("a", { href: "shadow.html#native" }, enText("Native check")))].filter(x => x != null));
  if (tr) setRec(false);
  if (!d.noMic) {
    drawOverlay(box, { model, syllables: syls });
    shapeLine.replaceChildren(model && describe(model) ? enText(`Model ${describe(model)}.`) : "");
  }
  setTimeout(() => { if (modelBtn.isConnected) playModel(); }, 250);
}

// ---- results
function applyResult(run) {
  const r = run.result;
  const hist = arr(store.get("plan.history", []));
  if (run.kind === "placement") {
    r.focus = addFocusContrasts(r.diagnostic.weakContrasts);
    // weak tones bias the Tone ID draw (drills.js toneWeights), replacing an earlier placement's; skipped diagnostic: kept
    if (r.diagnostic && r.diagnostic.judged > 0) {
      try { drills.setWeakTones(arr(r.diagnostic.weakTones), "placement"); } catch (err) { console.error(err); }
    }
    store.set("plan.placement", r);
    store.set("level", r.level);
    hist.push({ date: r.date, kind: "placement", level: r.level });
  } else {
    const checks = store.get("plan.checks", {}) || {};
    checks[r.level] = r;
    store.set("plan.checks", checks);
    if (r.passed && !r.practice) {
      const cur = levelInfo();
      store.set("level", Math.max(cur ? cur.level : 0, r.level + 1));
    }
    hist.push({ date: r.date, kind: "check", level: r.level, passed: r.passed, practice: r.practice });
  }
  store.set("plan.history", hist.slice(-50));
}
function resultView(r, { fresh = false } = {}) {
  const check = r.kind === "check";
  const th = check ? { v: TH.passVocab, s: TH.passSkill } : { v: TH.vocabPlace, s: TH.skillPlace };
  const cell = (val, need, sub) => val == null ? h("td", { class: "muted" }, "—")
    : h("td", { class: val >= need ? "pl-ok" : "" }, h("b", {}, `${val}%`), val >= need ? h("span", { class: "pl-tick" }, " ✓") : null, sub ? h("span", { class: "pl-sub" }, sub) : null);
  const rows = Object.entries(r.levels || {}).sort((a, b) => a[0] - b[0]).map(([n, x]) => h("tr", { class: !check && Number(n) === r.level ? "is-start" : "" },
    h("th", { scope: "row" }, `第 ${n} 級`),
    cell(x.vocab && x.vocab.estimate, th.v, x.vocab ? `${x.vocab.claimed}% × ${x.vocab.accuracy == null ? "—" : x.vocab.accuracy + "%"}` : ""),
    cell(x.listening && x.listening.acc, th.s, x.listening ? `${x.listening.correct}/${x.listening.n}` : ""),
    cell(x.reading && x.reading.acc, th.s, x.reading ? `${x.reading.correct}/${x.reading.n}` : "")));
  const dg = r.diagnostic || {};
  const out = h("div", { class: "pl-result card" });
  if (check) {
    out.append(h("p", { class: "pl-result-h" }, r.passed ? h("span", { class: "feedback good" }, "✓ 通過 ", enText(`Passed: Level ${r.level}`)) : h("span", {}, "還沒通過 ", enText(`Not passed yet: Level ${r.level}`)),
      r.practice ? h("span", { class: "muted small" }, " · ", enText("practice run, not counted")) : null));
    if (fresh && r.passed && !r.practice) out.append(h("p", {}, ...bi(`現在開始第 ${r.level + 1} 級。`, `You now study Level ${r.level + 1}.`)));
  } else {
    out.append(h("p", { class: "pl-result-h" }, `從第 ${r.level} 級開始 `, enText(`Start at TBCL Level ${r.level}`)),
      h("p", {}, ...phaseName(r.phase || phaseOf(r.level))),
      h("p", { class: "small" }, r.startUnit ? ["第一課 ", enText("First unit: "), h("a", { href: `units.html#${encodeURIComponent(r.startUnit.id)}` }, r.startUnit.title)]
        : bi(`第 ${r.level} 級的課程還沒寫好：先從這一級的詞和語法開始（在資料庫裡）。`, `Level ${r.level}'s units aren't written yet: start with its words and grammar in the Library.`),
        r.startUnit ? null : [" ", h("a", { href: "library.html" }, enText("Library"))]));
  }
  out.append(tableWrap("每一級的結果", "Results per level", h("table", { class: "pl-table pl-result-table" },
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "等級 ", enText("Level")), h("th", { scope: "col" }, "詞彙 ", enText("Vocab")),
      h("th", { scope: "col" }, "聽力 ", enText("Listening")), h("th", { scope: "col" }, "閱讀 ", enText("Reading")))),
    h("tbody", {}, rows.length ? rows : h("tr", {}, h("td", { colspan: "4", class: "muted" }, enText("No answers recorded.")))))),
  h("p", { class: "small muted" }, ...bi(check ? `✓ = 達到通過標準（詞彙 ${th.v}%、聽力和閱讀 ${th.s}%）。詞彙 = 認識的比例 × 確認的正確率。`
    : `✓ = 達到起點標準（詞彙 ${th.v}%、聽力和閱讀 ${th.s}%）。詞彙 = 認識的比例 × 確認的正確率。`,
  `✓ = meets the ${check ? "pass" : "starting"} threshold (vocabulary ${th.v}%, listening and reading ${th.s}%). Vocabulary = claimed share × meaning-check accuracy.`)));
  // diagnostic
  const per = dg.perContrast || {};
  const ids = Object.keys(per).filter(id => per[id].bad > 0);
  const dl = h("div", { class: "pl-diag" }, h("h4", {}, "發音診斷 ", enText(`Pronunciation diagnostic (${dg.judged || 0} words judged)`)));
  if (!dg.judged) dl.append(h("p", { class: "small muted" }, ...bi("沒有判斷任何詞。", "No words were judged.")));
  else if (!ids.length) dl.append(h("p", { class: "small" }, "✓ ", ...bi("每個對比都標了「對」。", "Every contrast marked right.")));
  else dl.append(h("ul", { class: "pl-contrasts" }, ids.map(id => h("li", {},
    h("span", { class: `pl-dotc is-${per[id].status}`, "aria-hidden": "true" }),
    h("span", {}, ...contrastName(id)),
    h("span", { class: "small muted" }, ` ${per[id].bad}/${per[id].n} ✗ · `, per[id].status === "red" ? ["紅 ", enText("red")] : ["黃 ", enText("weak")])))));
  if (arr(dg.weakTones).length) dl.append(h("p", { class: "small" }, "比較弱的聲調 ", enText("Weaker tones: "), dg.weakTones.map(t => `T${t}`).join(" · ")));
  if (!check && (r.focus === "store" || r.focus === "api")) dl.append(h("p", { class: "small muted" }, ...bi("這些對比已加入每日重點；「今天」和注音實驗室會多練。", "These contrasts were added to the daily focus: Today and the Zhuyin Lab drill them more.")));
  if (dg.noMic) dl.append(h("p", { class: "small muted" }, ...bi("沒有錄音：只靠聽和自己判斷。", "No recording: judged by listening only.")));
  out.append(dl);
  if (check && !r.passed) out.append(h("p", { class: "small" }, ...bi("沒過也沒關係：繼續上課，過幾週再試。", "Not yet is fine: keep going with the units and try again in a few weeks.")));
  return out;
}

if (app) boot();
