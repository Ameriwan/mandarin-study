// 練習 Drills (M2 design §4): reusable drills for the Tone Gym, the Today session and the Zhuyin Lab.
//
// Every drill renders into `container` and returns a controller { stop(), done }. `done` resolves with a result
// { drill, n, correct, accuracy, seconds, stopped, timeUp, ... } when the drill ends: n trials done, `timeLimit`
// seconds elapsed at the end of a trial (checked when the learner moves on, never in the middle of a trial), or
// stop(). Ending calls stopAll() (stopAudio() and the players). A drill whose view is cleared without stop() notices
// within half a second and ends quietly (no stopAll() then: the next view may already be playing or recording; its
// own players stop as their owner leaves the page). A tone drill given an item without an MOE clip fails instead:
// the call throws, or `done` rejects (see checkMoe), and onDone is not called.
// Options every drill takes: { timeLimit = null, onDone, again, actions, focus }. onDone(result) runs when a run ends.
// `again`: the end card offers "Another round" (a fresh run in the same place with the same options, so onDone
// fires again); it defaults to true for untimed drills and false for timed ones (a session runner moves on).
// `actions`: extra nodes for the end card, or a function returning them (called once per run).
//
// `focus`: true makes the first trial focus its first control (Play again, or the mirror's Model). Without it the
// first trial takes focus only when nothing has it (the button that started the drill was removed); later trials
// always focus it, and the end card focuses its heading, so keyboard focus never falls to <body>. A trial that moves
// focus plays its clip a moment later (firstPlay), so a screen reader does not read the button over it.
//
// Audio: tone and syllable drills use MOE human audio only (ground rule 5); TTS appears only for whole sentences in
// shadowLine, always labelled. QA §10 item 5: toneIdDrill, pairIdDrill and mirrorDrill assertMoeOnly() their input
// (callers pass only items with an MOE clip in audio.json; the Tone Gym and Today filter on it), and a failed check
// makes the drill fail (see checkMoe). contrastDrill keeps only the words with an MOE clip (the Lab passes the raw
// contrasts.json). Every tone or syllable clip a drill plays goes through playTone, which refuses anything not MOE.
// shadowLine plays through player.js (an <audio> element, so slowed playback keeps its pitch, M3); app.js
// stopAudio() cannot reach those players, so "stop everything" here is stopAll(): stopAudio() plus stopPlayers().
// Listening drills never ask to speak; the speaking drills (mirrorDrill, shadowLine) are separate blocks (§6.7,
// Baese-Berk & Samuel 2016). Stats live in localStorage via `store` (app.js).
import { h, clear, store, loadJSON, shuffle, pick, ruby, playButton, playMoe, playFile, stopAudio, toast, today, audioContext, settings,
  Recorder, canRecord, saveRecording, loadRecording, syllables, toneOf, baseOf, withTone, TONE_NAMES, enText, bi } from "./app.js";
import * as pitch from "./pitch.js";
import { ShadowPlayer, stopPlayers, RATES } from "./player.js";

// Stops everything audible: app.js playback and recordings, and every player.js player.
export function stopAll() { stopAudio(); stopPlayers(); }

const KEYS = { contrasts: "lab.contrasts", focus: "focus.contrasts", confusion: "tones.confusion", weak: "tones.weak", pairs: "tones.pairs", mirror: "tones.mirror" };
const MOE_NAME = "MOE human voice · 教育部真人發音";
const TONE_EXAMPLE_ZH = { 1: "媽", 2: "麻", 3: "馬", 4: "罵" }; // the characters of tones.json tone_examples
const PARTNER = { 1: 4, 4: 1, 2: 3, 3: 2 }; // the confusable pairs T1/T4 and T2/T3 get double weight (§5.3, §6.7)
const MIN_RECENT = 5; // a contrast needs this many recent trials before it can join the daily focus
const FOCUS_IN = 80, FOCUS_OUT = 85; // daily focus (§8.6): joins below 80% recent accuracy, stays until 85%
const ONE_VOICE_BELOW = 70; // adaptive variability (§6.7, Perrachione): one voice per round below 70%, mixed above
const DEFAULT_VOICE = "moe-announcer"; // audio.json "voice" of the MOE clips: the only human voice so far
const SKIP = Symbol("skip"), END = Symbol("end");

// ------------------------------------------------------------------ MOE-only rule (QA §10 item 5)
// audio.json, loaded once. The tone drills wait for it, then check their input against it before drawing.
let AUDIO = null;
const audioP = loadJSON("audio").catch(() => ({})).then(a => (AUDIO = a || {}));
const isMoe = (id, audio = AUDIO) => !!(id && audio && audio[id] && audio[id].src === "moe");
const moeItems = list => list.filter(x => x && isMoe(x.id));
// Throws unless every item has an id whose audio.json entry is an MOE human clip. Call it once audio.json has
// loaded, or pass the index as `audio` (it defaults to the one this module loaded).
export function assertMoeOnly(items, where = "drill", audio = AUDIO) {
  if (!audio) throw new Error(`${where}: audio.json is not loaded yet, cannot check the MOE-only rule`);
  const bad = (items || []).filter(x => !isMoe(x && x.id, audio));
  if (bad.length) throw new Error(`${where}: not MOE human audio (§10 item 5): ${bad.slice(0, 5).map(x => (x && (x.zh || x.id)) || String(x)).join(", ")}`);
  return items;
}
// A tone drill's input check. The callers filter on audio.json, so a failure is a bug: the drill says so in its
// view, records nothing, and fails. The drill call itself throws when audio.json was already loaded (the check
// runs during the call), else `done` rejects with the same error.
function checkMoe(s, stage, items, where) {
  try { return assertMoeOnly(items, where); } catch (err) {
    console.error(err);
    clear(stage).append(h("div", { class: "drill-error", role: "alert" },
      h("p", {}, ...bi("這個練習沒有開始：聲調練習只用教育部真人發音，但有一個項目沒有這種音檔。", "This drill did not start: tone drills use MOE human recordings only, and an item has no MOE clip.")),
      h("p", { class: "muted small", lang: "en" }, String(err.message || err))));
    s.fail(err);
    throw err;
  }
}
// Plays an MOE clip in a tone or syllable drill; anything else is refused (and logged), never played.
function playTone(id) {
  if (!isMoe(id)) { console.error(`not an MOE clip: ${id}`); noClip(); return Promise.resolve(); }
  return playMoe(id).catch(noClip);
}
// Runs start() once audio.json is in: during the call when it already is (an error thrown by start() then leaves
// the drill call), else after a loading line in `stage` (`done` carries the error then, see checkMoe).
function whenAudio(s, stage, start) {
  if (AUDIO) { start(); return; }
  stage.append(h("p", { class: "muted small" }, "載入中… ", enText("Loading…")));
  audioP.then(() => {
    if (!s.alive()) return;
    clear(stage);
    try { start(); } catch (err) { if (!s.over) { console.error(err); s.fail(err); } } // checkMoe has failed it already
  });
}
const focusLost = () => { const a = document.activeElement; return !a || a === document.body || a.isConnected === false; };
// A trial's first play. A trial that has just moved focus (to its Play again or Model button, whose name is only the
// visible words) waits SETTLE_MS, so a screen reader reads that name before the clip, not over it. `still()` says
// whether the play is still wanted then (not pressed meanwhile, the trial still on screen).
const SETTLE_MS = 900;
function firstPlay(s, moved, still, play) {
  if (!moved) { play(); return; }
  s.sleep(SETTLE_MS).then(ok => { if (ok && still()) play(); });
}

// ------------------------------------------------------------------ shared plumbing
function session(container, kind, opts = {}) {
  const { timeLimit = null, onDone = null } = opts;
  const root = h("div", { class: `drill drill-${kind}` });
  if (opts.__replace && opts.__replace.parentNode) opts.__replace.replaceWith(root); // "Another round": same place
  else container.append(root);
  const t0 = performance.now();
  let over = false, seen = root.isConnected, resolveDone, rejectDone;
  const done = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });
  done.catch(() => {}); // a failed drill whose caller never got the controller (the call threw) is not an unhandled rejection
  const hooks = new Set();
  const elapsed = () => (performance.now() - t0) / 1000;
  const watch = setInterval(() => {
    if (root.isConnected) seen = true;
    else if (seen) end({ stopped: true }, { quiet: true }); // the view was cleared without stop()
  }, 400);
  const s = {
    root, done, n: 0, correct: 0, extra: {}, timeLimit, elapsed,
    timeUp: () => timeLimit != null && elapsed() >= timeLimit,
    alive: () => !over && (root.isConnected || !seen),
    get over() { return over; },
    onEnd(fn) { if (over) { fn(); return () => {}; } hooks.add(fn); return () => hooks.delete(fn); },
    sleep(ms) {
      return new Promise(res => {
        if (over) { res(false); return; }
        let id = null;
        const off = s.onEnd(() => { clearTimeout(id); res(false); });
        id = setTimeout(() => { off(); res(true); }, ms);
      });
    },
    end,
    endSoon: (extra, flags) => setTimeout(() => end(extra, flags), 0), // never resolve before the caller has the controller
    // Ends the run as an error: hooks run and audio stops as in end(), but nothing is reported to onDone and `done` rejects.
    fail(err) {
      if (over) return;
      over = true;
      clearInterval(watch);
      for (const fn of [...hooks]) { try { fn(); } catch (e) { console.error(e); } }
      hooks.clear();
      stopAll();
      rejectDone(err);
    },
  };
  function end(extra = {}, { quiet = false } = {}) {
    if (over) return;
    over = true;
    clearInterval(watch);
    for (const fn of [...hooks]) { try { fn(); } catch (err) { console.error(err); } }
    hooks.clear();
    if (!quiet) stopAll();
    const result = { drill: kind, n: s.n, correct: s.correct, accuracy: s.n ? Math.round(100 * s.correct / s.n) : null,
      seconds: Math.round(elapsed()), stopped: false, timeUp: s.timeUp(), ...s.extra, ...extra };
    resolveDone(result);
    if (onDone) { try { onDone(result); } catch (err) { console.error(err); } }
  }
  s.ctl = { stop: () => end({ stopped: true }), done };
  return s;
}

// The end-of-run card: a title, a few lines, "Another round" (see `again` above) and the caller's actions.
// The Next/Finish button that ended the run goes with the trial view, so focus moves to the card's heading.
function endCard(s, target, opts, restart, title, lines = []) {
  const again = opts.again ?? opts.timeLimit == null;
  const extra = typeof opts.actions === "function" ? opts.actions() : opts.actions || [];
  const first = again ? h("button", { type: "button", class: "btn primary", onclick: () => { stopAll(); restart(); } }, ...bi("再一輪", "Another round")) : null;
  const head = h("h3", { tabindex: "-1" }, title);
  const card = h("div", { class: "card drill-summary" }, head, lines, h("div", { class: "row drill-actions" }, first, extra));
  const had = target.contains(document.activeElement);
  clear(target).append(card);
  if (had || focusLost()) head.focus({ preventScroll: true });
  return card;
}

const progressBar = () => h("div", { class: "progress drill-progress" }, h("i", { style: "width:0%" }));
const setProgress = (bar, x) => { bar.firstChild.style.width = `${Math.round(100 * Math.min(1, Math.max(0, x)))}%`; };
const moeBadge = () => h("span", { class: "badge human", title: MOE_NAME }, "MOE");
const icon = (t, size = 30) => { try { return pitch.contourIcon(t, { size }); } catch (err) { console.error(err); return null; } };
const noClip = () => toast("音檔尚未建置 clip not built yet");
const toneLabel = t => (t === 5 ? "輕" : String(t));
const toneEn = t => (t === 5 ? "neutral" : `tone ${t}`);

function weightedPick(list, weight) {
  const ws = list.map(x => Math.max(0, Number(weight(x)) || 0));
  const sum = ws.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return pick(list);
  let r = Math.random() * sum;
  for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r < 0) return list[i]; }
  return list[list.length - 1];
}
const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise(r => setTimeout(() => r(fallback), ms))]);

// Digit keys 1..4 answer the current trial while focus is inside the drill.
function digitKeys(root, handler) {
  root.addEventListener("keydown", e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.target && e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    const d = Number(e.key);
    if (!(d >= 1 && d <= 4) || !handler(d)) return;
    e.preventDefault();
  });
}

// ------------------------------------------------------------------ stats
export const contrastStats = () => store.get(KEYS.contrasts, {});
export function recentAccuracy(s) {
  return s && s.recent && s.recent.length ? Math.round(100 * s.recent.reduce((a, b) => a + b, 0) / s.recent.length) : null;
}
function recordContrastTrial(id, ok) {
  const all = contrastStats(); const s = all[id] || { n: 0, correct: 0, recent: [], days: {} };
  s.n++; if (ok) s.correct++;
  s.recent = [...s.recent, ok ? 1 : 0].slice(-30);
  const d = today(); s.days[d] = s.days[d] || { n: 0, correct: 0 }; s.days[d].n++; if (ok) s.days[d].correct++;
  all[id] = s; store.set(KEYS.contrasts, all);
}
// The daily focus (§8.6), "focus.contrasts": {"<id>": {since: "YYYY-MM-DD"}}. A contrast joins it when its recent
// accuracy (the last 30 trials) is below 80% with at least MIN_RECENT recent trials, and stays in it until its recent
// accuracy reaches 85%. The rule is applied whenever a contrast round ends and whenever the focus is read.
function syncFocus(stats = contrastStats()) {
  const f = store.get(KEYS.focus, {}) || {};
  let changed = false;
  for (const [id, st] of Object.entries(stats || {})) {
    const acc = recentAccuracy(st), k = st && st.recent ? st.recent.length : 0;
    if (f[id]) { if (acc != null && acc >= FOCUS_OUT) { delete f[id]; changed = true; } }
    else if (k >= MIN_RECENT && acc != null && acc < FOCUS_IN) { f[id] = { since: today() }; changed = true; }
  }
  for (const id of Object.keys(f)) if (!stats || !stats[id]) { delete f[id]; changed = true; } // its stats were reset
  if (changed) store.set(KEYS.focus, f);
  return f;
}
export const focusContrasts = () => syncFocus();
// The contrast in the daily focus with the lowest recent accuracy (Today's listening step), else null. A focus
// contrast with no recent trials yet (the placement check adds the ✗ contrasts that way) comes first.
export function weakestContrast(contrasts) {
  const stats = contrastStats(), f = syncFocus(stats);
  let worst = null, low = Infinity;
  for (const c of contrasts || []) {
    if (!c || !f[c.id]) continue;
    const acc = recentAccuracy(stats[c.id]);
    const rank = acc == null ? -1 : acc;
    if (rank < low) { worst = c; low = rank; }
  }
  return worst;
}
// The end card's daily-focus lines: where this contrast stands now, and the rule itself.
function focusLines(id, wasIn) {
  const stats = contrastStats(), f = syncFocus(stats);
  const st = stats[id], acc = recentAccuracy(st), k = st && st.recent ? st.recent.length : 0;
  const status = f[id] ? bi(`在每日重點裡（${f[id].since} 起）。`, `In your daily focus (since ${f[id].since}).`)
    : wasIn ? bi("到了 85%，離開每日重點。", "Reached 85%: out of the daily focus.")
    : bi("不在每日重點裡。", "Not in the daily focus.");
  return [
    h("p", { class: "small" }, ...status, ...(acc != null ? [" ", ...bi(`最近 ${k} 題 ${acc}%。`, `Recent accuracy ${acc}% (last ${k}).`)] : [])),
    h("p", { class: "muted small" }, ...bi("最近正確率低於 80%（至少 5 題）的對比會加入每日重點，到 85% 才離開；「今天」練重點裡最弱的一組。",
      "A contrast joins the daily focus when its recent accuracy is below 80% (at least 5 recent trials) and stays until it reaches 85%; Today drills the weakest one in focus.")),
  ];
}

// "tones.confusion": {"<heard tone>": {"<answered tone>": count}}, tones 1-4 only.
export const confusion = () => store.get(KEYS.confusion, {});
function addConfusion(truth, answered) {
  if (!(truth >= 1 && truth <= 4 && answered >= 1 && answered <= 4)) return;
  const c = confusion();
  const row = c[truth] || (c[truth] = {});
  row[answered] = (row[answered] || 0) + 1;
  store.set(KEYS.confusion, c);
}
// "tones.weak": {"<tone>": {since, from}}: tones the Plan page's placement diagnostic found weak (M4 design §4.3).
// setWeakTones replaces the set (a new placement's diagnostic supersedes the last); the matrix above stays the
// learner's own Tone ID answers.
export const weakTones = () => { const w = store.get(KEYS.weak, {}); return w && typeof w === "object" ? w : {}; };
export function setWeakTones(tones, from = "placement", day = today()) {
  const out = {};
  for (const t of [].concat(tones || []).map(Number)) if (t >= 1 && t <= 4) out[t] = { since: day, from };
  store.set(KEYS.weak, out);
  return Object.keys(out).map(Number);
}
const WEAK_BONUS = 1.5, WEAK_FADE = 20; // a weak tone's prior, gone once 20 of its Tone ID answers are in
// Draw weight per tone 1-4: 1 plus its error rates (smoothed), errors within T1/T4 and T2/T3 counted double, and
// half weight for being the answer given to another tone (a confusion goes both ways). A weak tone from placement
// adds a prior (half of it to its partner tone) that fades as that tone's own answers come in.
export function toneWeights(c = confusion(), weak = weakTones()) {
  const heard = t => Object.values(c[t] || {}).reduce((x, y) => x + (Number(y) || 0), 0);
  const rate = (t, a) => (Number((c[t] || {})[a]) || 0) / (heard(t) + 3);
  const prior = t => (weak && weak[t] ? WEAK_BONUS * Math.max(0, 1 - heard(t) / WEAK_FADE) : 0);
  const w = {};
  for (let t = 1; t <= 4; t++) {
    let x = 1 + prior(t) + 0.5 * prior(PARTNER[t]);
    for (let a = 1; a <= 4; a++) if (a !== t) x += 3 * (PARTNER[t] === a ? 2 : 1) * (rate(t, a) + 0.5 * rate(a, t));
    w[t] = x;
  }
  return w;
}

// "tones.pairs": {"<t1><t2>": {n, correct, recent: [0/1 x 30]}}, keyed by the written (MOE base) tones.
export const pairStats = () => store.get(KEYS.pairs, {});
function recordPair(cell, ok) {
  const all = pairStats();
  const e = all[cell] || { n: 0, correct: 0, recent: [] };
  e.n++; if (ok) e.correct++;
  e.recent = [...(e.recent || []), ok ? 1 : 0].slice(-30);
  all[cell] = e; store.set(KEYS.pairs, all);
}
function cellWeight(stats, cell, tw) {
  const r = (stats[cell] && stats[cell].recent) || [];
  const acc = (r.reduce((a, b) => a + b, 0) + 1) / (r.length + 2); // no data -> 0.5
  const a = Number(cell[0]), b = Number(cell[1]);
  return 1 + 4 * (1 - acc) + 0.5 * (((tw[a] || 1) - 1) + ((tw[b] || 1) - 1));
}

// "tones.mirror": {"<id>": {best, n, last}}.
export const mirrorStats = () => store.get(KEYS.mirror, {});
function recordMirror(id, score) {
  const all = mirrorStats();
  const e = all[id] || { best: null, n: 0, last: null };
  e.n++; e.last = score;
  if (score != null && (e.best == null || score > e.best)) e.best = score;
  all[id] = e; store.set(KEYS.mirror, all);
  return e;
}

// Written (base) and heard (spoken) tones of a two-syllable word. Without a build-computed `spoken`, only the
// 3+3 rule is applied (it holds for every word).
const heardOf = p => (p[0] === 3 && p[1] === 3 ? [2, 3] : p.slice()); // 3+3 is always said 2+3 in Taiwan (§6.4)
function pairTones(p) {
  const w = syllables(p.zhuyin || "").map(toneOf);
  const written = [Number(p.t1) || w[0], Number(p.t2) || w[1]];
  const sp = p.spoken ? syllables(p.spoken).map(toneOf) : [];
  return { written, heard: sp.length === 2 ? sp : heardOf(written) };
}
const patKey = p => `${p[0]}${p[1]}`;

// k items from `pairs` (with an MOE clip) for production, drawn toward the cells the learner identifies worst and
// the words whose best mirror score is low. For the "Produce" block and the Today production step.
export function weightedPairs(pairs, k = 6) {
  const stats = pairStats(), tw = toneWeights(), ms = mirrorStats();
  const pool = (pairs || []).filter(p => p && p.id && (!AUDIO || isMoe(p.id))); // MOE clips only; mirrorDrill asserts it
  const ws = pool.map(p => {
    const best = ms[p.id] && ms[p.id].best;
    return cellWeight(stats, patKey(pairTones(p).written), tw) * (1 + (best == null ? 0.5 : (100 - best) / 100));
  });
  const out = [], used = new Set();
  while (out.length < k && used.size < pool.length) {
    const i = weightedPick(pool.map((_, j) => j).filter(j => !used.has(j)), j => ws[j]);
    used.add(i); out.push(pool[i]);
  }
  return out;
}

// ------------------------------------------------------------------ 1. contrast drill (moved from lab.js startDrill)
// Listening only: hear a word, choose it from its set; immediate feedback, then every choice replays (A/B compare).
// Extra option `voiceNote`: say under the progress bar that there is one human voice so far (Today passes it; the
// Lab's contrast list says it once for all contrasts). Words carry `spoken` (the build's sandhi form), shown on the
// choices when the "show sandhi" setting is on.
export function contrastDrill(container, contrast, opts = {}) {
  const { n = 10 } = opts;
  const c = contrast || {};
  const s = session(container, "contrast", opts);
  s.extra.contrast = c.id;
  const restart = () => contrastDrill(container, contrast, { ...opts, __replace: s.root });
  const prog = h("div", { class: "progress", style: "margin:10px 0" }, h("i", { style: "width:0%" }));
  const stage = h("div");
  if (opts.voiceNote) s.root.append(voiceNote());
  s.root.append(prog, stage);
  const said = w => (w.spoken && settings().sandhi && syllables(w.spoken).length === syllables(w.zhuyin).length ? w.spoken : w.zhuyin);
  let sets = [], wasIn = false, first = true;
  s.onEnd(() => { syncFocus(); }); // the daily-focus rule runs at the end of every round, stopped ones too
  whenAudio(s, stage, () => {
    // a word whose MOE clip is missing (failed or deferred download) drops out of its set; the Lab passes raw data
    const all = (c.sets || []).map(set => moeItems(set || [])).filter(set => set.length >= 2);
    if (!all.length) { stage.append(h("p", {}, ...bi("這組還沒有可用的音檔。", "No clips built for this contrast yet."))); s.endSoon(); return; }
    sets = oneVoiceSets(all, recentAccuracy(contrastStats()[c.id]));
    s.extra.voices = new Set(sets.flat().map(w => voiceOf(w.id))).size;
    wasIn = !!focusContrasts()[c.id];
    trial();
  });
  return s.ctl;

  function finish() {
    setProgress(prog, 1);
    const N = s.n, acc = N ? Math.round(100 * s.correct / N) : 0;
    endCard(s, stage, opts, restart, ["本輪 ", enText("This round"), ` ${s.correct}/${N}（${acc}%）`], focusLines(c.id, wasIn));
    s.end();
  }
  function trial() {
    clear(stage);
    setProgress(prog, s.n / n);
    const set = pick(sets);
    const target = pick(set);
    const options = shuffle(set);
    let answered = false, played = false;
    const playTarget = () => { played = true; return playTone(target.id); };
    // the name is the visible words only: focus lands here as the trial starts (the source is the MOE badge beside it)
    const play = h("button", { type: "button", class: "btn primary drill-play", "aria-label": "再聽一次 Play again", onclick: playTarget }, "🔊 ", ...bi("再聽一次", "Play again"));
    const fb = h("p", { class: "feedback", "aria-live": "polite" });
    const choices = h("div", { class: "choices" });
    const next = h("button", { type: "button", class: "btn", disabled: true, onclick: () => { if (s.n >= n || s.timeUp()) finish(); else trial(); } }, ...bi("下一題", "Next →"));
    for (const w of options) {
      const name = `${w.zh} ${said(w)}, ${w.en}`;
      const b = h("button", { type: "button", class: "choice", lang: "zh-Hant-TW", "aria-label": name, onclick: () => {
        if (answered) { playTone(w.id); return; }
        answered = true;
        const ok = w === target;
        s.n++; if (ok) s.correct++;
        recordContrastTrial(c.id, ok);
        b.classList.add(ok ? "correct" : "wrong");
        for (const cb of choices.children) {
          const right = cb._w === target;
          if (right) cb.classList.add("correct");
          cb.append(h("span", { class: "small muted", style: "display:block;margin-top:6px" }, "🔊 ", ...bi("比較", "compare")));
          cb.setAttribute("aria-label", `${cb._name}${right ? " — 正確 right answer" : cb === b ? " — 你選的 your choice" : ""}. 比較 compare: 播放 play ${cb._w.zh}`);
        }
        fb.replaceChildren(...(ok ? ["對了 ✓ ", enText("Correct.")] : [`不對 ✗ — 正確是 ${target.zh} ${said(target)}。`, enText(` It was ${target.zh} (${target.en}).`)]));
        fb.className = "feedback " + (ok ? "good" : "bad");
        play.setAttribute("aria-label", `再聽一次 Play again: ${target.zh} — ${MOE_NAME}`);
        if (s.n >= n || s.timeUp()) next.replaceChildren(...bi("完成", "Finish"));
        next.disabled = false; next.classList.add("primary"); next.focus();
      } }, ruby(w.zh, w.zhuyin, { cls: "zh", spoken: w.spoken }), h("span", { class: "en lc-en", lang: "en" }, w.en));
      b._w = w; b._name = name;
      choices.append(b);
    }
    stage.append(h("p", { class: "muted small" }, `第 ${s.n + 1} / ${n} 題 · 聽到哪一個？`, enText("Which one did you hear?")),
      h("div", { class: "drill-top" }, play, moeBadge()), choices, fb, h("div", { class: "row" }, next));
    const moved = !first || opts.focus || focusLost();
    if (moved) play.focus({ preventScroll: true }); // never leave focus on <body>
    first = false;
    firstPlay(s, moved, () => !played && !answered && play.isConnected, playTarget);
  }
}

// Adaptive variability (§6.7, Perrachione): while a contrast's recent accuracy is under 70% (or unknown) a round keeps
// to one voice, the one most of its words are recorded in; from 70% all voices are mixed. A clip's voice is its
// audio.json "voice" (the MOE announcer when absent). Only one human voice exists so far, so every round is
// single-voice; a second voice in the build makes this switch take effect.
const voiceOf = id => (AUDIO && AUDIO[id] && AUDIO[id].voice) || DEFAULT_VOICE;
function oneVoiceSets(sets, acc) {
  if (acc != null && acc >= ONE_VOICE_BELOW) return sets;
  const count = new Map();
  for (const w of sets.flat()) count.set(voiceOf(w.id), (count.get(voiceOf(w.id)) || 0) + 1);
  if (count.size < 2) return sets;
  const voice = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const one = sets.map(set => set.filter(w => voiceOf(w.id) === voice)).filter(set => set.length >= 2);
  return one.length ? one : sets;
}
const voiceNote = () => h("p", { class: "muted small drill-voice-note", role: "note" },
  ...bi("目前只有一位真人聲音（教育部播音員）；有更多臺灣錄音後，正確率超過 70% 會混合不同的聲音。",
    "One human voice so far (the MOE announcer). When more Taiwan recordings exist, voices are mixed once you pass 70%."));

// ------------------------------------------------------------------ 2. tone identification on single syllables
// pool: id_pool entries {zh, zhuyin, tone 1-4, id}. Extra option `examples` = tone_examples (else from tones.json).
export function toneIdDrill(container, pool, opts = {}) {
  const { n = 15 } = opts;
  const s = session(container, "tone-id", opts);
  const restart = () => toneIdDrill(container, pool, { ...opts, __replace: s.root });
  let items = [];
  const byTone = { 1: [], 2: [], 3: [], 4: [] }, bySyl = new Map();
  const prog = progressBar();
  const stage = h("div");
  s.root.append(prog, stage);
  let examples = opts.examples || null;
  if (!examples) loadJSON("tones").then(t => { examples = (t && t.tone_examples) || null; }).catch(() => {});
  const round = {}; // this run: "heard>answered" -> count
  const recent = [];
  let cur = null, first = true;
  digitKeys(s.root, d => cur ? (cur.press(d), true) : false);
  whenAudio(s, stage, () => {
    items = (pool || []).filter(p => p && p.zhuyin && p.tone >= 1 && p.tone <= 4);
    checkMoe(s, stage, items, "toneIdDrill");
    if (!items.length) { stage.append(h("p", {}, ...bi("還沒有可用的單音節音檔。", "No single-syllable MOE clips built yet."))); s.endSoon(); return; }
    for (const p of items) {
      byTone[p.tone].push(p);
      const k = `${baseOf(p.zhuyin)}|${p.tone}`;
      if (!bySyl.has(k)) bySyl.set(k, p);
    }
    trial();
  });
  return s.ctl;

  // The same syllable in tone t (A/B compare), else the tone's MOE example (媽 麻 馬 罵).
  function exampleFor(base, t) {
    const same = bySyl.get(`${base}|${t}`);
    if (same) return same;
    const id = examples && (examples[t] || examples[String(t)]);
    if (!id || !isMoe(id)) return null;
    // tone_examples are 媽 麻 馬 罵 (tools/build.py TONE_EXAMPLES); 罵 is not in the TBCL ≤ 3 pool
    return items.find(p => p.id === id) || { id, zh: TONE_EXAMPLE_ZH[t] || `${TONE_NAMES[t]}例字`, zhuyin: "" };
  }
  function nextItem() {
    const w = toneWeights();
    const t = weightedPick([1, 2, 3, 4].filter(x => byTone[x].length), x => w[x]);
    const fresh = byTone[t].filter(p => !recent.includes(p.id));
    const item = pick(fresh.length ? fresh : byTone[t]);
    recent.push(item.id); if (recent.length > 8) recent.shift();
    return item;
  }
  function finish() {
    setProgress(prog, 1);
    cur = null;
    const acc = s.n ? Math.round(100 * s.correct / s.n) : 0;
    const worst = Object.entries(round).sort((a, b) => b[1] - a[1])[0];
    const lines = [];
    if (worst) {
      const [ht, at] = worst[0].split(">").map(Number);
      lines.push(h("p", { class: "small" }, `最常混淆：聽到${TONE_NAMES[ht]}，選了${TONE_NAMES[at]}（${worst[1]} 次）。`, enText(`Most confused: heard tone ${ht}, chose tone ${at} (×${worst[1]}).`)));
    }
    lines.push(h("p", { class: "muted small" }, ...(acc >= 85 ? bi("很好。", "Well done.") : bi("常錯的聲調會更常出現。", "The tones you miss come up more often."))));
    endCard(s, stage, opts, restart, ["本輪 ", enText("This round"), ` ${s.correct}/${s.n}（${acc}%）`], lines);
    s.end({ confusions: round });
  }
  function trial() {
    clear(stage);
    setProgress(prog, s.n / n);
    const item = nextItem();
    const base = baseOf(item.zhuyin);
    let answered = false, played = false;
    const playTarget = () => { played = true; return playTone(item.id); };
    const play = h("button", { type: "button", class: "btn primary drill-play", "aria-label": "再聽一次 Play again", onclick: playTarget }, "🔊 ", ...bi("再聽一次", "Play again"));
    const fb = h("p", { class: "feedback", "aria-live": "polite" });
    const reveal = h("div", { class: "drill-reveal" });
    const choices = h("div", { class: "tone-choices", role: "group", "aria-label": "選聲調 Choose the tone" });
    const next = h("button", { type: "button", class: "btn", disabled: true, onclick: () => { if (s.n >= n || s.timeUp()) finish(); else trial(); } }, ...bi("下一題", "Next →"));
    const buttons = {}, names = {};
    const compare = t => { const ex = t === item.tone ? item : exampleFor(base, t); if (ex) playTone(ex.id); };
    const answer = t => {
      if (answered) return;
      answered = true;
      const ok = t === item.tone;
      s.n++; if (ok) s.correct++;
      addConfusion(item.tone, t);
      if (!ok) round[`${item.tone}>${t}`] = (round[`${item.tone}>${t}`] || 0) + 1;
      buttons[t].classList.add(ok ? "correct" : "wrong");
      buttons[item.tone].classList.add("correct");
      // After the answer a choice plays its tone (A/B compare): its name says so, and which one was right or chosen.
      for (const [tt, b] of Object.entries(buttons)) {
        const k = Number(tt), ex = k === item.tone ? item : exampleFor(base, k);
        const state = k === item.tone ? " — 正確 right answer" : k === t ? " — 你選的 your choice" : "";
        if (ex) b.append(h("span", { class: "compare-hint" }, "🔊 ", ...bi("比較", "compare")));
        b.setAttribute("aria-label", `${names[k]}${state}${ex ? `. 比較 compare: 播放 play ${ex.zh}` : ""}`);
      }
      fb.replaceChildren(...(ok ? ["對了 ✓ ", enText(`Correct: tone ${item.tone}.`)]
        : [`不對 ✗ 是${TONE_NAMES[item.tone]}，你選了${TONE_NAMES[t]}。`, enText(` It was tone ${item.tone}; you chose tone ${t}.`)]));
      fb.className = "feedback " + (ok ? "good" : "bad");
      play.setAttribute("aria-label", `再聽一次 Play again: ${item.zh} ${item.zhuyin} — ${MOE_NAME}`);
      const ex = ok ? null : exampleFor(base, t);
      // the accessible names start with the visible label (WCAG 2.5.3), then the word and the source
      const heard = playButton(item, { label: ["▶ ", ...bi("聽到的", "Heard")], cls: "btn small", badge: false });
      heard.setAttribute("aria-label", `聽到的 Heard: ${item.zh} ${item.zhuyin} — ${MOE_NAME}`);
      const mine = ex ? playButton(ex, { label: ["▶ ", ...bi("你選的", "Your choice"), " ", h("span", { lang: "zh-Hant-TW" }, ex.zh)], cls: "btn small", badge: false }) : null;
      if (mine) mine.setAttribute("aria-label", `你選的 Your choice ${ex.zh}${ex.zhuyin ? ` ${ex.zhuyin}` : ""} — ${MOE_NAME}`);
      reveal.append(h("span", { class: "big-zh" }, ruby(item.zh, item.zhuyin, { cls: "" })), heard, mine || ""); // "" not null: append() would print "null"
      if (s.n >= n || s.timeUp()) next.replaceChildren(...bi("完成", "Finish"));
      next.disabled = false; next.classList.add("primary"); next.focus();
    };
    for (const t of [1, 2, 3, 4]) {
      const syl = withTone(base, t);
      names[t] = `${TONE_NAMES[t]} ${syl}, tone ${t} (${pitch.CHAO[t]})`;
      const b = h("button", { type: "button", class: "tone-choice", "aria-label": names[t], onclick: () => (answered ? compare(t) : answer(t)) },
        h("span", { class: "key-hint", "aria-hidden": "true" }, t),
        h("span", { class: "tone-icon", "aria-hidden": "true" }, icon(t, 34)),
        h("span", { class: "tone-syl", lang: "zh-Hant-TW" }, syl),
        h("span", { class: "tone-name" }, h("span", { lang: "zh-Hant-TW" }, TONE_NAMES[t]), " ", pitch.CHAO[t]));
      buttons[t] = b;
      choices.append(b);
    }
    cur = { press: d => (answered ? compare(d) : answer(d)) };
    stage.append(h("p", { class: "muted small drill-meta" }, `第 ${s.n + 1} / ${n} 題 · 聽到第幾聲？`, enText("Which tone did you hear?")),
      h("div", { class: "drill-top" }, play, moeBadge()), choices, fb, reveal, h("div", { class: "row" }, next));
    const moved = !first || opts.focus || focusLost();
    if (moved) play.focus({ preventScroll: true }); // never leave focus on <body>
    first = false;
    firstPlay(s, moved, () => !played && !answered && play.isConnected, playTarget);
  }
}

// ------------------------------------------------------------------ 3. tone-pair identification (two-syllable words)
// pairs: tones.json "pairs" {t1, t2, zh, zhuyin, spoken, en, note, core, id}. The answer is the written (MOE base)
// pattern. A word said differently (3+3 -> 2+3, 一/不) shows "said …" on its option, and no two options sound the
// same (no plain 2+3 next to a 3+3 word, and never both 2+3 and "3+3 said 2+3").
export function pairIdDrill(container, pairs, opts = {}) {
  const { n = 12 } = opts;
  const s = session(container, "pair-id", opts);
  const restart = () => pairIdDrill(container, pairs, { ...opts, __replace: s.root });
  const byCell = new Map();
  const prog = progressBar();
  const stage = h("div");
  s.root.append(prog, stage);
  const round = {}; // this run: cell -> {n, correct}
  const recent = [];
  let cur = null, first = true;
  digitKeys(s.root, d => cur ? cur.press(d) : false);
  whenAudio(s, stage, () => {
    const items = (pairs || []).filter(p => p && syllables(p.zhuyin || "").length === 2)
      .map(p => ({ p, ...pairTones(p) })).filter(x => x.written[0] >= 1 && x.written[0] <= 4 && x.written[1] >= 1 && x.written[1] <= 5);
    checkMoe(s, stage, items.map(x => x.p), "pairIdDrill");
    if (!items.length) { stage.append(h("p", {}, ...bi("還沒有可用的雙字詞音檔。", "No two-syllable MOE clips built yet."))); s.endSoon(); return; }
    for (const x of items) { const k = patKey(x.written); if (!byCell.has(k)) byCell.set(k, []); byCell.get(k).push(x); }
    trial();
  });
  return s.ctl;

  function nextItem() {
    const stats = pairStats(), tw = toneWeights();
    const cell = weightedPick([...byCell.keys()], k => cellWeight(stats, k, tw));
    const list = byCell.get(cell);
    const fresh = list.filter(x => !recent.includes(x.p.id));
    const item = pick(fresh.length ? fresh : list);
    recent.push(item.p.id); if (recent.length > 6) recent.shift();
    return item;
  }
  // Another word with written pattern pat (core words first), for A/B compare after the answer.
  function exampleFor(pat, not) {
    const list = (byCell.get(patKey(pat)) || []).filter(x => x !== not);
    return (list.find(x => x.p.core) || list[0] || null);
  }
  function finish() {
    setProgress(prog, 1);
    cur = null;
    const acc = s.n ? Math.round(100 * s.correct / s.n) : 0;
    const cells = Object.entries(round).sort((a, b) => a[1].correct / a[1].n - b[1].correct / b[1].n);
    const lines = [];
    if (cells.length && cells[0][1].correct < cells[0][1].n) {
      const [k, r] = cells[0];
      lines.push(h("p", { class: "small" }, `最弱：${toneLabel(Number(k[0]))} + ${toneLabel(Number(k[1]))}（${r.correct}/${r.n}）。`,
        enText(`Weakest: ${toneEn(Number(k[0]))} + ${toneEn(Number(k[1]))} (${r.correct}/${r.n}).`)));
    }
    lines.push(h("p", { class: "muted small" }, ...(acc >= 85 ? bi("很好。", "Well done.") : bi("弱的組合會更常出現。", "Weak pairs come up more often."))));
    endCard(s, stage, opts, restart, ["本輪 ", enText("This round"), ` ${s.correct}/${s.n}（${acc}%）`], lines);
    s.end({ cells: round });
  }
  function trial() {
    clear(stage);
    setProgress(prog, s.n / n);
    const item = nextItem(), w = item.p;
    const cell = patKey(item.written);
    const options = patternOptions(item.written, item.heard);
    let answered = false, played = false;
    const playTarget = () => { played = true; return playTone(w.id); };
    const play = h("button", { type: "button", class: "btn primary drill-play", "aria-label": "再聽一次 Play again", onclick: playTarget }, "🔊 ", ...bi("再聽一次", "Play again"));
    const fb = h("p", { class: "feedback", "aria-live": "polite" });
    const reveal = h("div", { class: "drill-reveal" });
    const choices = h("div", { class: "pattern-choices", role: "group", "aria-label": "選聲調組合 Choose the tone pattern" });
    const next = h("button", { type: "button", class: "btn", disabled: true, onclick: () => { if (s.n >= n || s.timeUp()) finish(); else trial(); } }, ...bi("下一題", "Next →"));
    const isRight = p => patKey(p) === cell;
    const saidOf = p => (isRight(p) ? item.heard : heardOf(p));
    const compare = p => { const ex = isRight(p) ? item : exampleFor(p, item); if (ex) playTone(ex.p.id); };
    const answer = (p, b) => {
      if (answered) return;
      answered = true;
      const ok = isRight(p);
      s.n++; if (ok) s.correct++;
      recordPair(cell, ok);
      const r = round[cell] || (round[cell] = { n: 0, correct: 0 }); r.n++; if (ok) r.correct++;
      // The confusion matrix, per syllable: rows are the tones heard, columns the tones the chosen option is SAID with
      // ("3 + 3 said 2 + 3" answers 2 + 3). Syllables the word itself says differently (sandhi) are left out.
      const said = saidOf(p);
      for (let i = 0; i < 2; i++) if (item.written[i] === item.heard[i]) addConfusion(item.heard[i], said[i]);
      b.classList.add(ok ? "correct" : "wrong");
      for (const cb of choices.children) {
        const right = isRight(cb._p), ex = right ? item : exampleFor(cb._p, item);
        if (right) cb.classList.add("correct");
        if (ex) cb.append(h("span", { class: "compare-hint" }, "🔊 ", ...bi("比較", "compare")));
        cb.setAttribute("aria-label", `${cb._name}${right ? " — 正確 right answer" : cb === b ? " — 你選的 your choice" : ""}${ex ? `. 比較 compare: 播放 play ${ex.p.zh}` : ""}`);
      }
      const right = `${toneLabel(item.written[0])} + ${toneLabel(item.written[1])}`;
      fb.replaceChildren(...(ok ? ["對了 ✓ ", enText(`Correct: ${toneEn(item.written[0])} + ${toneEn(item.written[1])}.`)]
        : [`不對 ✗ 是 ${right}。`, enText(` It was ${toneEn(item.written[0])} + ${toneEn(item.written[1])}.`)]));
      fb.className = "feedback " + (ok ? "good" : "bad");
      play.setAttribute("aria-label", `再聽一次 Play again: ${w.zh} ${w.zhuyin} — ${MOE_NAME}`);
      const sandhi = patKey(item.heard) !== cell;
      reveal.append(h("span", { class: "big-zh" }, ruby(w.zh, w.zhuyin, { cls: "", spoken: w.spoken })),
        h("span", { class: "drill-gloss" }, w.en ? enText(w.en, { class: "lc-en" }) : null,
          sandhi ? h("span", { class: "small muted", style: "display:block" }, `變調：寫作 ${right}，說成 ${toneLabel(item.heard[0])} + ${toneLabel(item.heard[1])}。`,
            enText(`Sandhi: written ${item.written.join("+")}, said ${item.heard.join("+")}.`)) : null,
          w.note ? h("span", { class: "small muted", style: "display:block" }, enText(w.note)) : null),
        playButton({ id: w.id, zh: w.zh }, { label: ["▶ ", h("span", { lang: "zh-Hant-TW" }, w.zh)], cls: "btn small", badge: false }));
      if (s.n >= n || s.timeUp()) next.replaceChildren(...bi("完成", "Finish"));
      next.disabled = false; next.classList.add("primary"); next.focus();
    };
    options.forEach((p, i) => {
      const said = saidOf(p);
      const differs = patKey(said) !== patKey(p);
      const name = `${toneLabel(p[0])} + ${toneLabel(p[1])}: ${TONE_NAMES[p[0]]} + ${TONE_NAMES[p[1]]}, ${toneEn(p[0])} + ${toneEn(p[1])}${differs ? `, 說成 said ${toneEn(said[0])} + ${toneEn(said[1])}` : ""}`;
      const b = h("button", { type: "button", class: "pattern-choice", "aria-label": name,
        onclick: () => (answered ? compare(p) : answer(p, b)) },
        h("span", { class: "key-hint", "aria-hidden": "true" }, i + 1),
        h("span", { class: "pattern-icons", "aria-hidden": "true" }, icon(p[0], 28), icon(p[1], 28)),
        h("span", { class: "pattern-nums" }, `${toneLabel(p[0])} + ${toneLabel(p[1])}`),
        differs ? h("span", { class: "pattern-said" }, `說成 ${toneLabel(said[0])} + ${toneLabel(said[1])} `, enText("said")) : null);
      b._p = p; b._name = name;
      choices.append(b);
    });
    cur = { press: d => { const b = choices.children[d - 1]; if (!b) return false; if (answered) compare(b._p); else answer(b._p, b); return true; } };
    stage.append(h("p", { class: "muted small drill-meta" }, `第 ${s.n + 1} / ${n} 題 · 聽到哪個聲調組合？`, enText("Which tone pattern did you hear?")),
      h("div", { class: "drill-top" }, play, moeBadge()), choices, fb, reveal, h("div", { class: "row" }, next));
    const moved = !first || opts.focus || focusLost();
    if (moved) play.focus({ preventScroll: true }); // never leave focus on <body>
    first = false;
    firstPlay(s, moved, () => !played && !answered && play.isConnected, playTarget);
  }
}

// The right pattern plus 3 confusable ones: T2<->T3 and T1<->T4 swapped in either or both syllables first, then
// any other tone in one syllable. No two options sound the same: a candidate said like the right one (`heard`) or
// like an option already taken (3+3 is said 2+3, §6.4) is left out, and the next candidate fills its place.
const SWAP = { 1: 4, 4: 1, 2: 3, 3: 2 };
export function patternOptions(written, heard = written) {
  const [a, b] = written;
  const taken = new Set([patKey(written)]), sounds = new Set([patKey(heard)]);
  const bad = p => taken.has(patKey(p)) || sounds.has(patKey(heardOf(p))) || !(p[0] >= 1 && p[0] <= 4 && p[1] >= 1 && p[1] <= 5);
  const swaps = [];
  if (SWAP[a]) swaps.push([SWAP[a], b]);
  if (SWAP[b]) swaps.push([a, SWAP[b]]);
  if (SWAP[a] && SWAP[b]) swaps.push([SWAP[a], SWAP[b]]);
  const fill = [];
  for (let x = 1; x <= 4; x++) if (x !== a) fill.push([x, b]);
  for (let y = 1; y <= 5; y++) if (y !== b) fill.push([a, y]);
  const out = [written.slice()];
  for (const p of [...shuffle(swaps), ...shuffle(fill)]) {
    if (out.length >= 4) break;
    if (bad(p)) continue;
    taken.add(patKey(p)); sounds.add(patKey(heardOf(p)));
    out.push(p);
  }
  return shuffle(out);
}

// ------------------------------------------------------------------ microphone takes (mirror and shadowing)
let pitchyP = null;
function pitchReady() { // true once pitchy has loaded; false offline (retried on the next take)
  return (pitchyP ||= pitch.loadPitchy().then(() => true, err => { console.warn(err); pitchyP = null; return false; }));
}
const lastVoiced = frames => { let count = 0, t = null; for (const f of frames) if (f.hz) { count++; t = f.t; } return { count, t }; };

// One take: start() asks for the microphone (call it from the Record button), stop() ends it, cancel() drops it.
// Live frames feed a pitch.LivePitch once pitchy is loaded. A take ends on stop(), after limitSec, or `silence`
// seconds after the voice stops once some speech was heard. onTake({blob, live, seconds}) runs however it ends,
// unless it was cancelled or the drill is gone. onState(recording) keeps the button in step.
function takeRecorder(s, { limitSec = 4, silence = 0.8, onState = () => {}, onLive = null, onTake = () => {}, onError = () => {} }) {
  let rec = null, starting = false, cancelled = false, timers = [], t0 = 0;
  const clearTimers = () => { for (const t of timers) { clearTimeout(t); clearInterval(t); } timers = []; };
  s.onEnd(clearTimers);
  return {
    get busy() { return !!rec || starting; },
    async start() {
      if (rec || starting) return;
      starting = true; cancelled = false;
      onState(true);
      stopAll(); // the model must not play into the take, and only one recorder holds the microphone
      const ok = await withTimeout(pitchReady(), 3000, false);
      if (cancelled || !s.alive()) { starting = false; onState(false); return; } // Stop pressed while pitchy loaded
      let live = null;
      if (ok) { try { live = new pitch.LivePitch(); } catch (err) { console.error(err); } }
      const r = new Recorder();
      r.onstopped = blob => {
        if (rec === r) rec = null;
        clearTimers();
        onState(false);
        if (cancelled || !s.alive() || !blob || !blob.size) return;
        onTake({ blob, live, seconds: (performance.now() - t0) / 1000 });
      };
      rec = r;
      let started = false;
      try { started = await r.start(live ? { onFrame: (buf, sr, t) => { try { live.push(buf, sr, t); } catch { /* keep recording */ } } } : {}); }
      catch (err) { if (rec === r) rec = null; starting = false; onState(false); onError(err); return; }
      starting = false;
      if (!started) { if (rec === r) rec = null; onState(false); return; } // stopped while the permission prompt was open
      if (!s.alive()) { cancelled = true; r.stop(); return; }
      t0 = performance.now();
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
    cancel() { cancelled = true; if (rec) rec.stop(); },
  };
}
// The learner's contour for the score and the final overlay: the recorded take, decoded and run through the detector,
// because it has every sample. The live frames only draw the curve while recording: a page that redraws slowly
// (below about 23 reads a second) loses samples between analyser reads and bends that curve. They are used only
// when the take cannot be decoded.
async function userContour(take) {
  if (!(await pitchReady())) return null;
  try {
    const buf = await audioContext().decodeAudioData(await take.blob.arrayBuffer());
    return pitch.normalize(await pitch.analyzeSamples(buf.getChannelData(0), buf.sampleRate));
  } catch (err) { console.warn("take not decodable, using the live frames", err); }
  try { return take.live ? pitch.normalize(take.live.frames) : null; } catch (err) { console.error(err); return null; }
}
// Plays a recorded take through a fresh object URL, revoked when it ends or when the next take plays, so a replay
// button keeps working however long it stays on screen (a URL kept for later is dead once revoked).
let blobUrl = null;
async function playBlob(blob) {
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  const url = blobUrl = URL.createObjectURL(blob);
  try { await playFile(url); } finally { if (blobUrl === url) { URL.revokeObjectURL(url); blobUrl = null; } }
}
function drawOverlay(box, { model = null, user = null, syllables: syls = [] }) {
  const width = Math.round(Math.min(560, Math.max(280, (box.clientWidth || 342) - 2)));
  const height = Math.round(Math.min(240, Math.max(180, width * 0.52)));
  try { clear(box).append(pitch.overlay({ model, user, syllables: syls, width, height })); }
  catch (err) { console.error(err); clear(box).append(h("p", { class: "muted small" }, ...bi("無法畫出音高曲線。", "Could not draw the pitch curve."))); }
}
const describe = c => { try { return c && pitch.describeContour ? pitch.describeContour(c) : ""; } catch { return ""; } };
const sylsOf = (zhuyin, spoken) => {
  const said = spoken && syllables(spoken).length === syllables(zhuyin).length ? spoken : zhuyin;
  return { said, list: syllables(said).map(z => ({ zhuyin: z, tone: toneOf(z) })) };
};
function micMessage(why) {
  return h("p", { class: "small mirror-nomic", role: "note" },
    why === "denied" ? "沒有麥克風權限。" : "這裡不能錄音。", "先聽示範，再大聲跟著說幾次；不評分。",
    enText(` ${why === "denied" ? "Microphone permission was refused" : "Recording isn't available in this browser"}: listen to the model and say it aloud a few times. No score.`));
}

// ------------------------------------------------------------------ 4. pitch mirror (speaking block)
// items: [{zh, zhuyin, spoken?, id, en?}]. Play the model (MOE span), record, compare the curves, keep the best take.
export function mirrorDrill(container, items, opts = {}) {
  const s = session(container, "mirror", opts);
  const restart = () => mirrorDrill(container, items, { ...opts, __replace: s.root });
  const list = (items || []).filter(it => it && it.zh && it.zhuyin);
  const ran = []; // this run, per item: {id, zh, best, last, tries}
  let k = 0, noMic = canRecord ? "" : "unsupported", data = null, item = null;
  const stage = h("div", { class: "mirror" }, h("p", { class: "muted small" }, "載入中… ", enText("Loading…")));
  s.root.append(stage);
  if (AUDIO) checkMoe(s, stage, list, "mirrorDrill"); // audio.json is in: a failed check throws from this call
  pitchReady(); // start loading pitchy now; the first take waits for it at most 3 s
  Promise.all([loadJSON("contours").catch(() => ({})), audioP]).then(([contours, audio]) => {
    if (!s.alive()) return;
    data = { contours: contours || {}, audio: audio || {} };
    try { checkMoe(s, stage, list, "mirrorDrill"); } catch { return; } // `done` has rejected
    if (!list.length) { clear(stage).append(h("p", {}, ...bi("沒有可以練習的詞。", "No words with an MOE clip to practise."))); s.endSoon(); return; }
    show();
  });

  // The run's result so far. Kept in s.extra after every word and take, so a stop() mid-run (the Today session's
  // "Next step", a tab change) still reports the takes and the best score, not just the end card's finish().
  const summary = () => {
    const scored = ran.filter(r => r.best != null);
    return { best: scored.length ? Math.max(...scored.map(r => r.best)) : null, items: ran.map(r => ({ ...r })), scored: !noMic, accuracy: null };
  };
  const sync = () => { Object.assign(s.extra, summary()); };

  function finish() {
    if (item) item.leave();
    const { best } = summary();
    const all = mirrorStats();
    const lines = [h("ul", { class: "list-plain drill-scores" }, ran.map(r => h("li", {},
      h("span", { lang: "zh-Hant-TW", class: "zh" }, r.zh),
      h("span", { class: "small", style: "margin-left:auto" }, r.best != null ? ["本輪 ", enText("this round"), ` ${r.best}`] : h("span", { class: "muted" }, "—"),
        all[r.id] && all[r.id].best != null ? h("span", { class: "muted" }, " · 最佳 ", enText("best"), ` ${all[r.id].best}`) : null))))];
    endCard(s, stage, opts, restart, ["鏡子 ", enText("Pitch mirror"), best != null ? ` · 最高 ${best}` : ""], lines);
    s.end(summary());
  }
  function advance() {
    k++;
    if (k >= list.length || s.timeUp()) finish(); else show();
  }

  function show() {
    if (item) item.leave();
    clear(stage);
    const it = list[k];
    const { said, list: syls } = sylsOf(it.zhuyin, it.spoken);
    const model = data.contours[it.id] || null;
    const info = data.audio[it.id];
    const spanLen = info && info.end > info.start ? info.end - info.start : 0.8;
    const limitSec = Math.max(2.5, 2.5 * spanLen + 1); // time to react, then a slower take than the model
    const row = ran.find(r => r.id === it.id) || ran[ran.push({ id: it.id, zh: it.zh, best: null, last: null, tries: 0 }) - 1];
    sync();
    let take = null, hadTake = false;
    const isLast = () => k + 1 >= list.length || s.timeUp();
    const box = h("div", { class: "overlay-box" });
    const scoreBox = h("div", { class: "mirror-score", "aria-live": "polite" });
    // shown in scoreBox's place while recording, and not live: words spoken now would land in the take (the screen
    // reader hears the result once the take ends)
    const recNote = h("div", { class: "mirror-score", style: "display:none" },
      h("span", { class: "muted" }, "錄音中…說完會自動停止。", enText(" Recording… it stops by itself when you finish.")));
    const shapeLine = h("p", { class: "muted small mirror-shape" });
    // the name is the visible words only: focus lands here as the word starts (the source is the MOE badge in the row)
    let modelPlayed = false;
    const modelBtn = h("button", { type: "button", class: "btn", "aria-label": "示範 Model", onclick: () => playModel() }, "▶ ", ...bi("示範", "Model"));
    // Record turns into Stop while recording: the label carries the state (no aria-pressed on a button whose label changes)
    const recBtn = h("button", { type: "button", class: "btn primary rec-btn", onclick: () => (tr.busy ? tr.stop() : tr.start()) });
    const mineBtn = h("button", { type: "button", class: "btn", disabled: true, "aria-label": `我的 Mine: ${it.zh} — my recording`, onclick: () => { if (take) playBlob(take.blob); } }, "▶ ", ...bi("我的", "Mine"));
    const bestBtn = h("button", { type: "button", class: "btn", disabled: !(mirrorStats()[it.id] && mirrorStats()[it.id].best != null),
      "aria-label": `最佳 My best: ${it.zh} — my best recording`, onclick: () => playBest() }, "▶ ", ...bi("最佳", "My best"));
    const next = h("button", { type: "button", class: "btn", onclick: () => { tr.cancel(); advance(); } });
    const setNext = () => next.replaceChildren(...(isLast() ? bi("完成", "Finish") : bi("下一題", "Next →"))); // the same words in every drill
    const setRec = on => {
      recBtn.classList.toggle("recording", on);
      recBtn.replaceChildren(...(on ? [h("span", { class: "rec-dot", "aria-hidden": "true" }), " ", ...bi("停止", "Stop")]
        : hadTake ? ["↻ ", ...bi("再試", "Try again")] : ["● ", ...bi("錄音", "Record")]));
      modelBtn.disabled = on;
      scoreBox.classList.toggle("sr-only", on); // out of sight, but kept in the accessibility tree: a live region
      recNote.style.display = on ? "" : "none"; // that leaves it (display:none) may not speak when it comes back
    };
    const tr = takeRecorder(s, { limitSec, silence: 0.8, onState: setRec,
      onLive: frames => { let u = null; try { u = pitch.normalize(frames); } catch { /* not enough yet */ } if (u) drawOverlay(box, { model, user: u, syllables: syls }); },
      onTake: t => onTake(t), onError: err => micFailed(err) });
    function playModel() { if (tr.busy) return; modelPlayed = true; playTone(it.id); }
    async function playBest() {
      try {
        const r = await loadRecording(`mirror:${it.id}`);
        if (!r || !r.blob) { toast("還沒有最佳錄音 No best take yet"); return; }
        await playBlob(r.blob);
      } catch { toast("無法播放 Could not play"); }
    }
    function micFailed(err) {
      noMic = err && (err.name === "NotAllowedError" || err.name === "SecurityError") ? "denied" : "error";
      toast("需要麥克風權限 Microphone permission needed");
      show(); // the same word again, in listen-and-repeat mode
    }
    async function onTake(t) {
      hadTake = true; setRec(false);
      take = { blob: t.blob };
      mineBtn.disabled = false;
      scoreBox.replaceChildren(h("span", { class: "muted" }, "分析中… ", enText("Analysing…")));
      const user = await userContour(t);
      if (!s.alive()) return;
      if (!user) {
        const online = await pitchReady();
        // still a take: the learner practised it, so it counts for Today's step even without a score
        s.n++; row.tries++; row.last = null; sync();
        scoreBox.replaceChildren(h("span", {}, ...(online ? ["沒聽清楚：太短或太小聲。再試一次，靠近麥克風。", enText(" Too short or too quiet: try again, closer to the microphone.")]
          : ["音高分析要先連上網路一次；可以先比較錄音。", enText(" Pitch analysis needs the internet once; you can still compare the recordings.")])));
        drawOverlay(box, { model, syllables: syls });
        return;
      }
      drawOverlay(box, { model, user, syllables: syls });
      const cmp = model ? pitch.compare(model, user, { syllables: syls }) : null;
      const score = cmp && Number.isFinite(cmp.score) ? cmp.score : null;
      const prev = mirrorStats()[it.id];
      const prevBest = prev && prev.best != null ? prev.best : null;
      recordMirror(it.id, score);
      s.n++;
      row.tries++; row.last = score;
      if (score != null && (row.best == null || score > row.best)) row.best = score;
      sync();
      if (score != null && (prevBest == null || score > prevBest)) {
        saveRecording(`mirror:${it.id}`, t.blob, { score }).then(() => { bestBtn.disabled = false; }).catch(() => {});
      }
      const gap = cmp && Number.isFinite(cmp.meanAbsSt) ? cmp.meanAbsSt : null;
      scoreBox.replaceChildren(...(score != null
        ? [h("span", { class: "num" }, score), h("span", { class: "of" }, "/100"), " ",
          h("span", { class: "small" }, gap != null ? [`平均差 ${gap.toFixed(1)} 半音 `, enText(`mean gap ${gap.toFixed(1)} st`)] : null,
            prevBest != null && score > prevBest ? [" · 新的最佳 ", enText("new best")] : prevBest != null ? [" · 最佳 ", enText("best"), ` ${prevBest}`] : null)]
        : [h("span", {}, model ? ["沒辦法評分：", enText(cmp && cmp.reason === "too short/quiet" ? "too short or too quiet; say the whole word." : (cmp && cmp.reason) || "no score.")]
          : ["這個詞沒有示範曲線，不評分。", enText(" No model contour for this word, so no score.")])]));
      const m = describe(model), u = describe(user);
      shapeLine.replaceChildren(m || u ? enText(`${m ? `Model ${m}` : ""}${m && u ? "; " : ""}${u ? `you ${u}` : ""}.`) : "");
      setNext();
    }
    item = { leave: () => { tr.cancel(); } };

    const prev = mirrorStats()[it.id];
    scoreBox.append(prev && prev.best != null ? h("span", { class: "muted small" }, `最佳 `, enText("best"), ` ${prev.best} · ${prev.n} 次 `, enText("tries")) : "");
    setRec(false); setNext();
    stage.append(
      h("p", { class: "muted small drill-meta" }, `第 ${k + 1} / ${list.length} 題 · 先聽示範，再錄自己的，比較曲線。`, enText("Listen, record yourself, compare the curves.")),
      h("div", { class: "mirror-word" }, h("span", { class: "big-zh" }, ruby(it.zh, it.zhuyin, { cls: "", spoken: it.spoken, sandhi: true })),
        it.en ? enText(it.en, { class: "muted lc-en" }) : null),
      said !== it.zhuyin ? h("p", { class: "small mirror-sandhi" }, `變調：寫作 ${it.zhuyin}，說成 ${said}。`, enText(` Tone sandhi: written ${it.zhuyin}, said ${said}.`)) : "",
      box, shapeLine,
      ...(noMic ? [micMessage(noMic)] : [scoreBox, recNote]),
      h("div", { class: "mirror-controls" }, modelBtn, noMic ? null : [recBtn, mineBtn, bestBtn], moeBadge()),
      h("div", { class: "row drill-actions" }, next));
    drawOverlay(box, { model, syllables: syls });
    shapeLine.replaceChildren(model && describe(model) ? enText(`Model ${describe(model)}.`) : "");
    const moved = k > 0 || opts.focus || focusLost();
    if (moved) modelBtn.focus({ preventScroll: true }); // never leave focus on <body>
    firstPlay(s, moved, () => !modelPlayed && !hadTake && modelBtn.isConnected, playModel);
  }
  return s.ctl;
}

// ------------------------------------------------------------------ 5. shadowing one line (speaking block)
// item: {zh, zhuyin, spoken?, en?, id? (MOE clip), audio? (audio.json key of a TTS file, or its path), dur? (its
// length in seconds), start?, end? (a range of the MOE file instead of its headword span, e.g. a dictionary-reading
// segment), model? (that range's contour; else contours.json[id]), label? (the source label, e.g. "MOE dictionary
// reading"), key? (the line key for saved takes and ratings)}.
// Playback goes through player.js (an <audio> element), so slowed playback keeps its pitch; the speed control
// 0.75 / 0.9 / 1.0 applies at once, also in the middle of a play. Playing never ends a take (keepMic).
// opts.protocol:
//   "short" (default; Today's pronunciation step, as in M2): listen ×3 with a pause of 1.2× the line's length to
//     repeat it, say it with the audio ×2, record once and listen back.
//   "full" (the guided protocol of §5.4; Today's Shadowing block): listen ×3 → mumble along ×2 → shadow with the
//     script ×2 → shadow blind (text hidden) ×2 → record and compare (my take, then the original) → self-rate
//     (清楚 clear / 還好 OK / 再練 again).
// opts.saveKey (default item.key): the take is saved as "shadow:<key>" with {zh, zhuyin, spoken, line, title, src,
//   model, rating} (the Shadowing page's fields), saved again once rated; the rating goes to "shadow.lines"
//   (rateShadowLine). Without a key nothing is stored. opts.rate: the starting speed (one of RATES; default: Settings › Default speed, else 1.0).
// No score for sentences; the pitch overlay appears only for an MOE clip with a model contour, and a line without
// one says why (a TTS voice's intonation is not a model, §6.3). "Skip this part" skips the rest of the current part.
// A timed run (timeLimit) with time left offers another round or Finish after each run, and ends by itself when the
// time is up between runs. The result adds {runs, recorded, rating, rate}.
const RATINGS = [["clear", "清楚", "clear"], ["ok", "還好", "OK"], ["again", "再練", "again"]];
export function shadowLine(container, item, opts = {}) {
  const s = session(container, "shadow", opts);
  const restart = () => shadowLine(container, item, { ...opts, __replace: s.root });
  const it = item || {};
  const full = opts.protocol === "full";
  const key = opts.saveKey ?? it.key ?? null;
  let rate = [opts.rate, settings().speed, 1].map(Number).find(r => RATES.includes(r));
  let runs = 0, recorded = false, rating = null, running = false, skip = false, take = null, recBusy = false;
  let noMic = canRecord ? "" : "unsupported";
  const waiters = new Set();
  s.root.append(h("p", { class: "muted small" }, "載入中… ", enText("Loading…")));
  Promise.all([loadJSON("audio").catch(() => ({})), it.id && !it.model ? loadJSON("contours").catch(() => ({})) : Promise.resolve({})]).then(([audio, contours]) => {
    if (!s.alive()) return;
    clear(s.root);
    build(audio || {}, contours || {});
  });
  return s.ctl;

  // Resolves with p's value, or SKIP (skip button) or END (drill over), whichever comes first.
  function race(p) {
    return new Promise(res => {
      let settled = false, off = null;
      const fin = v => { if (settled) return; settled = true; waiters.delete(fin); if (off) off(); res(v); };
      waiters.add(fin);
      off = s.onEnd(() => fin(END));
      Promise.resolve(p).then(v => fin(v), () => fin(undefined));
    });
  }

  function build(audio, contours) {
    const src = lineSource(it, audio);
    if (!src) { s.root.append(h("p", {}, ...bi("這一句還沒有音檔。", "No audio built for this line yet."))); s.endSoon({ runs: 0, recorded: false }); return; }
    const model = src.kind === "moe" ? it.model || contours[it.id] || null : null;
    const { list: syls } = sylsOf(it.zhuyin || "", it.spoken);
    const player = src.player(rate).bind(s.root); // stops by itself when this drill's view leaves the page
    let mine = null, compareBtns = [], lastErr = null, focusAgain = false;
    s.extra.rate = rate;
    // full: the Shadowing page's six steps under the same names (shadow.js STEPS titles, home.js PROTOCOL)
    const PARTS = full ? [
      { zh: "聽三次", en: "Listen ×3", n: 3, gap: () => 0.8, play: i => [`聽 ${i + 1}/3：只要聽。`, `Listen ${i + 1}/3: just listen.`] },
      { zh: "小聲跟著哼兩次", en: "Mumble along ×2", n: 2, gap: () => 0.8,
        play: i => [`小聲跟著哼 ${i + 1}/2：跟上節奏和音高，字不必清楚。`, `Mumble along ${i + 1}/2: follow the rhythm and the melody; the words can be blurry.`] },
      { zh: "看著稿子跟讀兩次", en: "Shadow with the script ×2", n: 2, gap: () => 0.8,
        play: i => [`看著稿子跟讀 ${i + 1}/2：和聲音同時說出來。`, `Shadow with the script ${i + 1}/2: say it out loud with the audio.`] },
      { zh: "不看稿跟讀兩次", en: "Shadow blind ×2", n: 2, gap: () => 0.8, blind: true,
        play: i => [`不看稿跟讀 ${i + 1}/2：文字先藏起來。`, `Shadow blind ${i + 1}/2: the text is hidden.`] },
      { zh: "錄音，和原音比較", en: "Record and compare", record: true },
      { zh: "自己評分", en: "Rate yourself", rate: true },
    ] : [
      { zh: "聽三次，停頓時跟著說", en: "Listen ×3, repeat in the pause", n: 3, gap: d => 1.2 * d, bar: true,
        play: i => [`聽 ${i + 1}/3`, `Listen ${i + 1}/3`], pause: ["換你：在停頓時跟著說。", "Your turn: say it in the pause."] },
      { zh: "跟著聲音一起說兩次", en: "Say it with the audio ×2", n: 2, gap: () => 0.7,
        play: i => [`一起說 ${i + 1}/2：跟著聲音同時說。`, `Say it with the audio ${i + 1}/2.`] },
      { zh: "錄一次，聽自己的", en: "Record once, listen back", record: true },
    ];
    const speedBtns = RATES.map(r => h("button", { type: "button", "aria-pressed": String(r === rate), "data-rate": String(r),
      onclick: () => setRate(r) }, `${r === 1 ? "1.0" : r}×`));
    const steps = PARTS.map(p => h("li", {}, h("span", {}, p.zh, " ", enText(p.en, { class: "muted" }))));
    // what the drill is doing, visible only: a counter per play and a cue per pause would talk over the audio. The
    // screen reader hears `live` (say() below) once per part, and only while nothing plays or records.
    const status = h("p", { class: "drill-status" });
    const live = h("p", { class: "sr-only", "aria-live": "polite" });
    const bar = h("div", { class: "pause-bar", "aria-hidden": "true" });
    const controls = h("div", { class: "row shadow-controls" });
    // skips the rest of the current part only ("Next step" is the Today session's own button)
    const skipBtn = h("button", { type: "button", class: "btn small", onclick: () => { skip = true; stopAll(); for (const f of [...waiters]) f(SKIP); } }, "⏭ ", ...bi("跳過這段", "Skip this part"));
    const againBox = h("span", { class: "row" }); // "Another round" / "Finish" when a timed run has time left
    const box = h("div", { class: "overlay-box", hidden: true });
    const noOverlay = h("p", { class: "muted small shadow-nooverlay", hidden: true }, ...(src.kind === "tts"
      ? bi("TTS 句子不畫音高曲線：合成語音的語調不能當示範，用耳朵比較。", "No pitch overlay for a TTS line: a synthetic voice's intonation is not a model (§6.3), so compare by ear.")
      : bi("這一句沒有示範曲線，用耳朵比較。", "No model contour for this line: compare by ear.")));
    const endBox = h("div");
    const lineEl = h("p", { class: "shadow-line" }, ruby(it.zh || "", it.zhuyin || "", { cls: "", spoken: it.spoken, sandhi: true }));
    const enEl = it.en ? h("p", { class: "muted small" }, enText(it.en, { class: "lc-en" })) : null;
    // the blind part hides the line; this keeps its place so nothing below jumps
    const hiddenEl = h("p", { class: "muted shadow-hidden", hidden: true, style: "min-height:56px;margin:4px 0 2px" },
      "（文字藏起來了：只靠耳朵跟讀）", enText(" Text hidden: shadow by ear."));
    // Shows exactly `nodes` in the controls row. A control that stays keeps its place and its focus; when the focused
    // one goes, focus moves to the first new control instead of falling to <body>.
    function setControls(...nodes) {
      const had = controls.contains(document.activeElement);
      for (const c of [...controls.childNodes]) if (!nodes.includes(c)) c.remove();
      for (const nd of nodes) if (nd.parentNode !== controls) controls.append(nd);
      if (had && !controls.contains(document.activeElement) || focusLost()) { const f = nodes.find(x => x && x.focus); if (f) f.focus({ preventScroll: true }); }
    }
    s.root.append(
      h("div", { class: "shadow-src" }, h("span", { class: `badge ${src.kind === "moe" ? "human" : "tts"}` }, src.badge), h("span", { class: "muted small", lang: "en" }, src.label),
        h("span", { class: "seg", role: "group", "aria-label": "速度 Speed", style: "margin-left:auto" }, speedBtns)),
      lineEl, hiddenEl, enEl || "",
      h("ol", { class: "shadow-steps" }, steps), status, bar, controls, box, noOverlay, endBox, live);
    // show(): the status line only. say(): the status line, and the screen reader once nothing plays or records (the
    // words wait in `held`; what is said in one go, e.g. a part's end and the next part's start, is read together).
    const show = (zh, en) => status.replaceChildren(zh, " ", enText(en));
    const held = [];
    const busy = () => player.state !== "idle" || !!(mine && mine.state !== "idle") || recBusy;
    function say(zh, en) {
      show(zh, en);
      held.push(...(held.length ? [" "] : []), zh, " ", enText(en));
      setTimeout(sayHeld, 0);
    }
    function sayHeld() {
      if (!live.isConnected || busy() || !held.length) return; // (an ended drill's last words still count)
      live.replaceChildren(...held.splice(0));
    }
    const releaseOnIdle = p => p.addEventListener("state", () => { if (p.state === "idle") setTimeout(sayHeld, 0); });
    releaseOnIdle(player);
    const markStep = i => steps.forEach((li, j) => {
      li.className = j < i ? "done" : j === i ? "current" : "";
      if (j === i) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    const showText = on => {
      if (!on) { // the note takes the hidden text's height, so nothing below moves
        const px = (lineEl.offsetHeight || 0) + ((enEl && enEl.offsetHeight) || 0);
        if (px > 0) hiddenEl.style.minHeight = `${px}px`;
      }
      lineEl.hidden = !on; if (enEl) enEl.hidden = !on; hiddenEl.hidden = on;
    };
    function setRate(r) {
      rate = player.setRate(r);
      s.extra.rate = rate;
      for (const b of speedBtns) b.setAttribute("aria-pressed", String(Number(b.dataset.rate) === rate));
    }
    // The line's length in media seconds (known once the file has loaded; before that the build's dur or span).
    const lineLen = () => { const L = player.length; return Number.isFinite(L) && L > 0 ? L : src.len; };
    const guardMs = () => Math.round(1000 * ((lineLen() || 20) / rate + 3)); // a play that never reports its end
    // a play's promise -> "ended" | "stopped" | the error (NotAllowedError: autoplay held back; NetworkError, MediaError)
    const outcome = p => Promise.resolve(p).then(ok => (ok ? "ended" : "stopped"), err => err || new Error("play failed"));
    const quietOthers = () => { if (!recBusy) stopAudio(); }; // app.js playback elsewhere stops; never a take in progress

    // One play of the line. Resolves with its length at this speed in seconds (a pause is sized on it), 0 when
    // skipped, or null when the drill ended or the audio failed (lastErr says why).
    async function playOnce() {
      quietOthers();
      const t = performance.now();
      const v = await race(Promise.race([outcome(player.play()), s.sleep(guardMs()).then(() => "guard")]));
      if (v === END) { player.stop(); return null; }
      if (v === SKIP) { player.stop(); return 0; }
      if (v === "guard") player.stop();
      if (v instanceof Error) {
        if (v.name === "NotAllowedError") return tapToPlay(); // autoplay held back (iOS): the next play needs a tap
        lastErr = v;
        return null;
      }
      const L = lineLen();
      return L ? L / rate : (performance.now() - t) / 1000;
    }
    async function tapToPlay() {
      say("點一下播放。", "Tap to play (the browser held back autoplay).");
      let tapped, played = null;
      const tap = new Promise(r => { tapped = r; });
      const btn = h("button", { type: "button", class: "btn primary", "aria-label": `播放 Play: ${it.zh} — ${src.label}`, onclick: () => { played = outcome(player.play()); tapped(true); } }, "▶ ", ...bi("播放", "Play"));
      controls.prepend(btn);
      btn.focus({ preventScroll: true });
      const v = await race(tap);
      const had = document.activeElement === btn;
      btn.remove();
      if (had && skipBtn.isConnected) skipBtn.focus({ preventScroll: true });
      if (v === END) return null;
      if (v === SKIP) return 0;
      const t = performance.now();
      const w = await race(Promise.race([played, s.sleep(guardMs()).then(() => "guard")]));
      if (w === END) { player.stop(); return null; }
      if (w === SKIP) { player.stop(); return 0; }
      if (w === "guard") player.stop();
      if (w instanceof Error) { lastErr = w; return null; } // even a tap could not play it
      const L = lineLen();
      return L ? L / rate : (performance.now() - t) / 1000;
    }
    async function pauseFor(sec) {
      const fill = h("i", { style: `transition:width ${sec.toFixed(2)}s linear;width:0%` });
      clear(bar).append(fill);
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = "100%"; }));
      const v = await race(s.sleep(Math.round(sec * 1000)));
      clear(bar);
      return v;
    }
    function failed() {
      if (!s.alive()) return;
      running = false;
      if (lastErr) console.warn(lastErr);
      showText(true);
      say("無法播放這一句（離線或沒有音檔）。", "Could not play this line (offline, or the audio is missing).");
      setControls();
      endCard(s, endBox, opts, restart, ["跟讀 ", enText("Shadowing")], []);
      s.end({ runs, recorded, error: "audio" });
    }
    // The file loads before the first play, so the plays (and their guard) time the line itself. False when the
    // drill ended or the file could not load (failed() has run).
    async function loadLine() {
      show("載入中…", "Loading…");
      const v = await race(player.load().then(() => "ok", err => err || new Error("load failed")));
      if (v === END) return false;
      if (v instanceof Error) { lastErr = v; failed(); return false; }
      return true; // loaded, or a skip while loading (that skips the first part)
    }
    // A part (PARTS[k]) that plays the line p.n times, each followed by a pause of p.gap(seconds of the play). The
    // counter per play and the cue per pause are visual only; the part is announced once, at its end, with the part
    // that follows (as on the Shadowing page). Before a next looping part there is a short breath, so those words
    // are not read over its first play.
    async function playPart(p, k) {
      setControls(skipBtn); // the same button stays (and keeps its focus) from part to part
      if (p.blind) showText(false);
      try {
        for (let i = 0; i < p.n; i++) {
          show(...p.play(i));
          const d = await playOnce();
          if (d == null) { failed(); return false; }
          if (skip) break;
          if (p.pause) show(...p.pause);
          const sec = p.gap(d);
          if (p.bar) await pauseFor(sec); else await race(s.sleep(Math.round(sec * 1000)));
          if (!s.alive()) return false;
          if (skip) break;
        }
      } finally { if (p.blind) showText(true); }
      const nx = PARTS[k + 1], loopNext = !!(nx && nx.n);
      say(`${skip ? `步驟 ${k + 1}「${p.zh}」跳過了。` : `✓ 步驟 ${k + 1}「${p.zh}」完成。`}${loopNext ? `下一步：${nx.zh}。` : ""}`,
        `Step ${k + 1}, ${p.en}, ${skip ? "skipped" : "done"}.${loopNext ? ` Next: ${nx.en}.` : ""}`);
      skip = false;
      if (loopNext) { await race(s.sleep(2000)); if (!s.alive()) return false; }
      skip = false;
      return true;
    }

    // My take, saved under the line key (again once it is rated), with the fields the Shadowing page's native check
    // reads (shadow.js saveTake): the text, the line key, the source and the model to play next to it.
    function saveTake() {
      if (!key || !take) return;
      const meta = { zh: it.zh || "", zhuyin: it.zhuyin || "", spoken: it.spoken || null, line: key, title: it.title || it.zh || "",
        src: src.kind, model: src.kind === "moe" ? { src: "moe", id: it.id, start: src.start, end: src.end } : { src: "tts", path: src.path }, rating };
      saveRecording(`shadow:${key}`, take.blob, meta).catch(err => console.warn("take not saved", err));
    }
    function playMine() { if (!mine || recBusy) return; quietOthers(); mine.play().catch(() => toast("無法播放 Could not play")); }
    function playOriginal() { if (recBusy) return; quietOthers(); player.play().catch(() => toast("無法播放 Could not play")); }
    // A quiet part: named as it starts (the looping part before it did not name it). The instruction is the Shadowing
    // page's record step (shadow.js STEPS): on your own, no audio; the take stops by itself after the line.
    async function recordStep(k) {
      take = null; compareBtns = [];
      const p = PARTS[k];
      if (noMic) {
        compareBtns = [micMessage(noMic)]; controls.append(...compareBtns);
        say(`步驟 ${k + 1}「${p.zh}」：這裡沒辦法錄音。`, `Step ${k + 1}, ${p.en}: no recording here.`);
        await race(s.sleep(1500)); return;
      }
      say(`步驟 ${k + 1}：${p.zh}。按「錄音」，自己說一次（不放原音），說完會自動停止，也可以按「停止」。`,
        `Step ${k + 1}: ${p.en}. Tap Record and say the line on your own (no audio); it stops when you finish, or tap Stop.`);
      let gotTake;
      const takeP = new Promise(r => { gotTake = r; });
      const len = lineLen() || 3;
      const tr = takeRecorder(s, { limitSec: Math.max(4, 2 * len / rate + 2), silence: 1.2,
        onState: on => { // Record turns into Stop while recording: the label carries the state (no aria-pressed)
          recBusy = on;
          recBtn.classList.toggle("recording", on);
          recBtn.replaceChildren(...(on ? [h("span", { class: "rec-dot", "aria-hidden": "true" }), " ", ...bi("停止", "Stop")] : ["● ", ...bi("錄音", "Record")]));
          if (on) show("錄音中…", "Recording…"); // visual: words now would land in the take
          else setTimeout(sayHeld, 0);
        },
        onTake: t => gotTake(t),
        onError: err => { noMic = err && (err.name === "NotAllowedError" || err.name === "SecurityError") ? "denied" : "error"; toast("需要麥克風權限 Microphone permission needed"); gotTake(null); } });
      const recBtn = h("button", { type: "button", class: "btn primary rec-btn", onclick: () => (tr.busy ? tr.stop() : tr.start()) }, "● ", ...bi("錄音", "Record"));
      const skipRec = h("button", { type: "button", class: "btn", onclick: () => { tr.cancel(); gotTake(SKIP); } }, ...bi("略過錄音", "Skip recording"));
      setControls(recBtn, skipRec);
      recBtn.focus({ preventScroll: true });
      const t = await race(takeP);
      if (t === END || !s.alive()) return;
      if (!t || t === SKIP) { compareBtns = noMic ? [micMessage(noMic)] : []; setControls(...compareBtns); return; }
      recorded = true; s.extra.recorded = true; // s.extra: a stop() (the session's "Next step") reports it too
      take = { blob: t.blob };
      saveTake();
      if (mine) mine.dispose();
      mine = new ShadowPlayer({ src: t.blob, keepMic: true }).bind(s.root); // Mine still plays after the drill has finished
      releaseOnIdle(mine);
      // visual while the take (and in full, the original) plays; the screen reader hears it once they are done
      const cmp = full ? ["先聽自己的，再聽原音，比較一下。", "Your take first, then the original: compare them."]
        : ["聽聽自己的，再和原音比較。", "Listen to yourself, then compare with the original."];
      show(...cmp);
      compareBtns = [
        h("button", { type: "button", class: "btn", "aria-label": `我的 Mine: ${it.zh} — my recording`, onclick: () => playMine() }, "▶ ", ...bi("我的", "Mine")),
        h("button", { type: "button", class: "btn", "aria-label": `原音 Original: ${it.zh} — ${src.label}`, onclick: () => playOriginal() }, "▶ ", ...bi("原音", "Original"))];
      setControls(...compareBtns);
      const userP = model ? userContour(t) : null; // analysed while my take plays
      await race(Promise.race([outcome(mine.play()), s.sleep(Math.round(1000 * (t.seconds + 1.5)))]));
      if (!s.alive()) return;
      if (model) { box.hidden = false; drawOverlay(box, { model, user: await userP, syllables: syls }); }
      else noOverlay.hidden = false;
      if (!s.alive()) return;
      if (!full) { say(...cmp); return; } // (full: the rate step that follows says it)
      await race(Promise.race([outcome(player.play()), s.sleep(guardMs())])); // then the original, to compare
      if (!s.alive()) return;
      player.stop();
    }
    async function rateStep(k) {
      const cmp = compareBtns.length > 1; // a take: Mine and Original are there
      say(`步驟 ${k + 1}：${PARTS[k].zh}。這一輪跟讀得怎麼樣？${cmp ? "可以再按「我的」和「原音」比較。" : ""}`,
        `Step ${k + 1}: ${PARTS[k].en}. How did this run go?${cmp ? " Mine and Original play them again to compare." : ""}`);
      let chosen;
      const choice = new Promise(r => { chosen = r; });
      const btns = RATINGS.map(([v, zh, e]) => h("button", { type: "button", class: "btn", "data-rating": v, onclick: () => chosen(v) }, zh, " ", enText(e)));
      const group = h("span", { class: "row shadow-rate", role: "group", "aria-label": "自評 Rate yourself" }, btns);
      setControls(...compareBtns, group, skipBtn);
      if (!compareBtns.some(b => b === document.activeElement)) btns[0].focus({ preventScroll: true });
      const v = await race(choice);
      if (v === END || !s.alive()) return;
      focusAgain = group.contains(document.activeElement);
      setControls(...compareBtns);
      if (typeof v !== "string") return; // skipped
      rating = v; s.extra.rating = v;
      if (key) rateShadowLine(key, v, it.zh || "");
      saveTake();
      const [, zh, e] = RATINGS.find(x => x[0] === v);
      say(`記下了：${zh}。`, `Noted: ${e}.`);
    }

    async function protocol() {
      if (running || !s.alive()) return;
      running = true; skip = false; focusAgain = false;
      clear(endBox); clear(againBox); setControls(skipBtn);
      box.hidden = true; noOverlay.hidden = true; // the last run's comparison goes with its take
      // the first part is named as the run starts (later ones at the end of the part before), with a breath (spent
      // loading the file) so the words come before its first play
      const loaded = loadLine();
      say(`步驟 1：${PARTS[0].zh}。`, `Step 1: ${PARTS[0].en}.`);
      const [ok] = await Promise.all([loaded, race(s.sleep(1500))]);
      if (!ok) return;
      for (let k = 0; k < PARTS.length; k++) {
        const p = PARTS[k];
        markStep(k);
        if (p.record) await recordStep(k);
        else if (p.rate) await rateStep(k);
        else if (!(await playPart(p, k))) return;
        if (!s.alive()) return;
        skip = false;
      }
      markStep(PARTS.length);
      runs++; s.extra.runs = runs;
      running = false;
      // Timed (a session step) with time left: offer another run; it ends by itself when the time is up.
      if (s.timeLimit != null && !s.timeUp()) {
        if (!rating || !full) say("還有時間：再一輪，或完成。", "Time left: another round, or finish.");
        const again = h("button", { type: "button", class: "btn primary", onclick: () => protocol() }, ...bi("再一輪", "Another round"));
        againBox.replaceChildren(again, h("button", { type: "button", class: "btn", onclick: () => finish() }, ...bi("完成", "Finish")));
        const lost = focusLost() || focusAgain;
        controls.append(againBox);
        if (lost) again.focus({ preventScroll: true });
        s.sleep(Math.max(0, s.timeLimit - s.elapsed()) * 1000).then(ok => { if (ok && s.alive() && !running) finish(); });
        return;
      }
      finish();
    }
    function finish() {
      if (!s.alive()) return;
      againBox.remove(); // its two buttons do nothing once the drill is over; Mine and Original stay
      say("完成。", "Finished.");
      const rated = rating ? RATINGS.find(x => x[0] === rating) : null;
      endCard(s, endBox, opts, restart, ["跟讀完成 ", enText("Shadowing done")], [
        rated ? h("p", { class: "small" }, `自評：${rated[1]} `, enText(`You rated it: ${rated[2]}.`)) : null,
        h("p", { class: "muted small" }, ...bi(recorded ? "可以再聽自己的錄音。" : "下次試著錄一次。", recorded ? "You can replay your take above." : "Next time, try recording once."))]);
      s.end({ runs, recorded, rating, rate }, { quiet: true }); // quiet: the learner may still be listening to the take
    }
    protocol();
  }
}

// Where a shadowing line's audio comes from: its MOE clip (the headword span in audio.json, or item.start–item.end of
// the file), else its TTS file, labelled. player(rate) makes the line's ShadowPlayer; keepMic: playing never ends a
// take (a take stops the players itself, takeRecorder).
function lineSource(item, audio) {
  if (item.id && audio[item.id]) {
    const info = audio[item.id];
    const range = item.start != null || item.end != null;
    const start = range ? Math.max(0, Number(item.start) || 0) : Number(info.start) || 0;
    const end = range ? (item.end == null ? null : Number(item.end)) : info.end > info.start ? Number(info.end) : null;
    const dur = Number(info.dur) > 0 ? Number(info.dur) : null;
    const len = end != null ? end - start : dur ? dur - start : null;
    return { kind: "moe", badge: "MOE", label: item.label || "MOE human voice", len, start, end, path: null,
      player: rate => new ShadowPlayer({ id: item.id, start, end, rate, dur, keepMic: true }) };
  }
  const key = item.audio;
  const e = key && audio[key];
  const path = (e && e.path) || (typeof key === "string" && key.startsWith("audio/") ? key : null);
  if (!path) return null;
  return { kind: "tts", badge: "TTS", label: (e && e.label) || "TTS (Google zh-TW)", len: Number(item.dur) > 0 ? Number(item.dur) : null, path,
    player: rate => new ShadowPlayer({ src: path, rate, keepMic: true }) };
}

// ------------------------------------------------------------------ shadowing: self-ratings and the weekly dose
// The same records as the Shadowing page (js/shadow.js), so both pages read one history:
// "shadow.lines": {"<line key>": {n, last (ms), rating: "clear" | "ok" | "again" | null, zh}}: each line's last
//   self-rating (the guided protocol's last step). Today brings a line rated 再練 again back first.
// "shadow.sessions": [{ts, date, minutes, planned, lines, takes, ratings: {clear, ok, again}, kind, dose, fast?}]:
//   one entry per session (kind "timed" / "line" from the Shadowing page, "today" from Today's block); dose is true
//   for a session of at least 10 minutes with a take (countsForDose below, the same rule as shadow.js). Shadowing
//   minutes themselves are app.js logMinutes("shadow", m) in "days".
// Line keys: a sentence id ("s001"), "moe:<audio id>:<segment>", … (shadow.js); Today's fallback "sandhi:<zh>".
// The weekly dose (§6.7, Foote & McDonough 2017): at least 4 sessions of 10 minutes a week, with self-recording;
// weeks start on Monday, as on the Shadowing page.
export const SHADOW_DOSE = { sessions: 4, minutes: 10 };
const SHADOW_KEYS = { lines: "shadow.lines", sessions: "shadow.sessions" };
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const shadowRatings = () => store.get(SHADOW_KEYS.lines, {}) || {};
// The day (YYYY-MM-DD) of a line's last rating, or "".
export const ratedOn = e => (e && Number(e.last) > 0 ? dayKey(new Date(Number(e.last))) : (e && e.date) || "");
export function rateShadowLine(key, rating, zh = "") {
  if (!key || !RATINGS.some(r => r[0] === rating)) return null;
  const all = shadowRatings();
  const e = { n: ((all[key] && all[key].n) || 0) + 1, last: Date.now(), rating, zh: zh || (all[key] && all[key].zh) || "" };
  all[key] = e;
  store.set(SHADOW_KEYS.lines, all);
  return e;
}
export const shadowSessions = () => { const v = store.get(SHADOW_KEYS.sessions, []); return Array.isArray(v) ? v.filter(x => x && typeof x === "object") : []; };
// One session of `minutes` (visible time, rounded to 0.1) today. extra: {kind ("today"), planned, lines, takes,
// rating (one self-rating) or ratings ({clear, ok, again}), key, fast}. Keeps the last 300 entries, as shadow.js does.
export function logShadowSession(minutes, extra = {}) {
  const m = Math.round((Number(minutes) || 0) * 10) / 10;
  if (!(m > 0)) return null;
  const { rating, ...rest } = extra;
  const ratings = { clear: 0, ok: 0, again: 0, ...(extra.ratings || {}) };
  if (rating && rating in ratings) ratings[rating]++;
  const e = { kind: "today", planned: null, lines: 1, takes: 0, ...rest, ratings, ts: Date.now(), date: today(), minutes: m };
  e.dose = m >= SHADOW_DOSE.minutes && Number(e.takes) > 0; // §6.7: 10 minutes with self-recording, as shadow.js saveRecord
  const all = [...shadowSessions(), e].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  store.set(SHADOW_KEYS.sessions, all.slice(-300));
  return e;
}
// A session counts toward the weekly dose when it ran 10 minutes or more with self-recording (a take): its dose flag
// (an entry without one: 10+ minutes) and takes > 0. The same rule as shadow.js countsForDose, so an older record
// {dose: true, takes: 0} counts on neither page.
export const countsForDose = x => !!x && (typeof x.dose === "boolean" ? x.dose : Number(x.minutes) >= SHADOW_DOSE.minutes) && Number(x.takes) > 0;
// This week (Monday to today): shadowing minutes and the sessions that count toward the dose (countsForDose), against
// 4 × 10 min.
export function shadowDose(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const keys = [];
  for (const d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) keys.push(dayKey(d));
  const log = store.get("days", {}) || {};
  const minutes = keys.reduce((a, k) => a + Math.max(0, Number((log[k] || {}).shadow) || 0), 0);
  const inWeek = new Set(keys);
  const list = shadowSessions().filter(x => inWeek.has(x.date));
  const counted = list.filter(countsForDose).length;
  return { minutes: Math.round(minutes * 10) / 10, sessions: counted, all: list.length, days: keys.length,
    goalSessions: SHADOW_DOSE.sessions, goalMinutes: SHADOW_DOSE.sessions * SHADOW_DOSE.minutes, met: counted >= SHADOW_DOSE.sessions };
}
