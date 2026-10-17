// 今天 Today (home), M2 (MASTER_PROMPT §5.1, §6.7, §8.2, §8.3, §8.6; M2 design §6): the header (streak, minutes this
// week, level, phase, next milestone), the daily routine scaled to settings().dailyMinutes, the pronunciation block
// run here as a timed four-step session (listening first, speaking after: Baese-Berk & Samuel 2016), "log outside
// time" and the page map.
// Minutes: the session logs its own visible time as block "pron" (logMinutes) at every step end, when the tab hides
// and when it ends. This page never calls trackTime, so nothing is counted twice. Outside time is "outside:<kind>".
// Done for today depends on the work, not on the button that ended a step or the run: the block is done when the
// steps that had something to practise got at least 80% of their planned minutes. A step whose planned work was all
// done counts its whole box (every trial answered, a take on every mirror word, a shadowing run with a recording),
// a step with some practice counts the visible time spent in it (up to its box), a step with none counts nothing.
// This is read from the drill's result (n, items, runs, recorded), never from `stopped`, so the drill's own Finish,
// the runner's Skip / Next step and End early give the same verdict for the same work; completing every step is
// always "done".
// Audio: tone and syllable drills play MOE human recordings only (ground rule 5, §10 item 5). loadData keeps only
// items with an MOE clip in audio.json, and drills.js asserts the same rule on its input (assertMoeOnly); if that
// assertion throws, the step shows the error and the session moves on.
// M3: the Shadowing block (§5.4, §8.3: 5 min at 30 min/day) runs the guided protocol (drills.js shadowLine,
// protocol "full", played through player.js) on today's line from shadowing.json for its time box. It logs its
// visible time as block "shadow" and one entry in "shadow.sessions" (drills.js logShadowSession, kind "today", the
// Shadowing page's record shape); its own "done for today" needs a full run and 80% of the box in visible time. The
// routine card shows the weekly dose next to it (drills.js shadowDose: shadowing minutes this week, Monday to today
// as on the Shadowing page, and sessions of 10+ min against 4 × 10 min, §6.7).
// ?fast=1 (testing only, M3 design §6) divides every time box on this page by 20.
import { h, $, clear, mountShell, store, streak, loadJSON, BUILT, settings, daysSinceStart, today, logMinutes,
  audioContext, enText, bi, ruby, syllables, baseOf, withTone, canRecord } from "./app.js";
import { contrastDrill, pairIdDrill, mirrorDrill, shadowLine, weakestContrast, weightedPairs, contrastStats,
  recentAccuracy, stopAll, shadowRatings, ratedOn, shadowDose, logShadowSession } from "./drills.js";

mountShell("home");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

const en = (text, attrs) => enText(text, attrs); // English runs inside the zh-Hant-TW page
// {"YYYY-MM-DD": {anki: bool, pron: {done, minutes, at, steps: [...]}, shadow: {done, minutes, at, runs, key, ...}}}
const ROUTINE_KEY = "today.routine";
const FAST = (() => { try { return new URLSearchParams(location.search).get("fast") === "1" ? 20 : 1; } catch { return 1; } })();
const PHASE0_DAYS = 28;              // Phase 0 "sound reset": the first 4 weeks (§8.1, §8.3)
const STEPS = [                      // §6.7, in this order: the listening steps never ask to speak
  { key: "listen", zh: "聽辨", en: "Listening ID", short: "Listen", speak: false },
  { key: "pairs", zh: "雙字聲調", en: "Tone-pair ID", short: "Pairs", speak: false },
  { key: "mirror", zh: "鏡子", en: "Production: pitch mirror", short: "Mirror", speak: true },
  { key: "shadow", zh: "跟讀", en: "Shadowing", short: "Shadow", speak: true },
];
const STEP_MIN = { phase0: [4, 3, 5, 3], after: [3, 2, 3, 2] }; // minutes at 30 min/day: 15 in Phase 0, 10 after
const DONE_SHARE = 0.8;              // share of the planned minutes that makes the block done for today
// The guided shadowing protocol (§5.4) that drills.js shadowLine runs with protocol "full". The step names are the
// Shadowing page's (shadow.js STEPS, each step's title), so the same step reads the same on both pages.
const PROTOCOL = [["聽三次", "Listen ×3"], ["小聲跟著哼兩次", "Mumble along ×2"], ["看著稿子跟讀兩次", "Shadow with the script ×2"],
  ["不看稿跟讀兩次", "Shadow blind ×2"], ["錄音，和原音比較", "Record and compare"], ["自己評分", "Rate yourself"]];
const RATING_NAMES = { clear: ["清楚", "clear"], ok: ["還好", "OK"], again: ["再練", "again"] };
const OUTSIDE = [["anki", "Anki", "Anki"], ["conversation", "對話", "conversation"], ["tv", "電視／影片", "TV/video"],
  ["podcast", "Podcast", "Podcast"], ["reading", "閱讀", "reading"], ["other", "其他", "other"]];
const PAGES = [
  ["lab.html", "注音", "Zhuyin Lab", "symbols, every syllable in every tone, contrasts, dictation"],
  ["tones.html", "聲調", "Tone Gym", "tone ID, tone pairs, pitch mirror, sandhi, Taiwan readings"],
  ["shadow.html", "跟讀", "Shadowing", "player + guided protocol"],
  ["units.html", "課程", "Units", "dialogues set in Pingtung, by TBCL level"],
  ["library.html", "資料庫", "Library", "words, grammar, patterns, Taiwan usage, my notes"],
  ["plan.html", "計畫", "Plan", "roadmap, placement check, pace"],
  ["advanced.html", "進階", "Advanced", "reading and listening ladders, TOCFL prep"],
  ["settings.html", "設定", "Settings", "display, export/import, credits"],
];

const half = x => Math.round(x * 2) / 2;
const fmtMin = m => String(half(m));
const tenths = (x, f = Math.round) => f(Math.round(x * 1000) / 100) / 10; // to 0.1 (the inner round drops float noise)
const mmss = sec => { const s = Math.max(0, Math.ceil(sec - 0.001)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const pct = x => `${Math.round(100 * Math.min(1, Math.max(0, x)))}%`;
const smooth = () => (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Day of the year (0-365): today's contrast and shadowing line rotate with it.
function dayOfYear() {
  const d = new Date();
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 86400000);
}

// ------------------------------------------------------------------ stored state
const routineLog = () => store.get(ROUTINE_KEY, {}) || {};
const todayEntry = () => routineLog()[today()] || {};
function saveDay(patch) {
  const all = routineLog(), d = today();
  all[d] = { ...(all[d] || {}), ...patch };
  const keys = Object.keys(all).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete all[k]; // keep about four months
  store.set(ROUTINE_KEY, all);
}
// Minutes in the last 7 days: in the app, and logged outside it.
function weekStats() {
  const days = store.get("days", {}) || {};
  const d = new Date();
  let app = 0, outside = 0;
  for (let i = 0; i < 7; i++) {
    for (const [k, v] of Object.entries(days[dateKey(d)] || {})) {
      if (k.startsWith("outside:")) outside += Number(v) || 0; else app += Number(v) || 0;
    }
    d.setDate(d.getDate() - 1);
  }
  app = Math.max(0, app); outside = Math.max(0, outside);
  return { app: Math.round(app), outside: Math.round(outside), total: Math.round(app + outside) };
}
// Take back one outside-time entry (the Undo after logging), on the day it was logged.
function unlog({ date, block, minutes }) {
  const days = store.get("days", {}) || {};
  const day = days[date];
  if (!day || !(block in day)) return;
  const v = Math.round(((Number(day[block]) || 0) - minutes) * 10) / 10;
  if (v > 0) day[block] = v; else delete day[block];
  if (!Object.keys(day).length) delete days[date];
  store.set("days", days);
}

// ------------------------------------------------------------------ the plan (§8.3, scaled to dailyMinutes)
// Pronunciation is never cut (§8.3): in Phase 0 its 5 extra minutes come out of the current-unit box, so the
// boxes still add up to the daily minutes (§5.1).
function routinePlan() {
  const daily = Math.min(240, Math.max(5, Number(settings().dailyMinutes) || 30));
  const f = daily / 30;
  const days = Math.max(0, daysSinceStart());
  const phase0 = days < PHASE0_DAYS;
  const steps = (phase0 ? STEP_MIN.phase0 : STEP_MIN.after).map(m => Math.max(1, half(m * f)));
  const pron = steps.reduce((a, b) => a + b, 0);
  const shadow = half(5 * f), review = half(3 * f);
  const unit = Math.max(0, half(daily - pron - shadow - review));
  return { daily, phase0, week: Math.min(4, Math.floor(days / 7) + 1), steps, pron, unit, shadow, review };
}

async function loadData() {
  const [contrasts, tones, meta, audio, shadowing] = await Promise.all([
    loadJSON("contrasts").catch(() => []), loadJSON("tones").catch(() => null), loadJSON("meta").catch(() => null),
    loadJSON("audio").catch(() => ({})), loadJSON("shadowing").catch(() => null)]);
  // MOE only (ground rule 5): a word counts when audio.json has an MOE clip for its id. A clip that failed to
  // download, or was deferred by --max-new, leaves the id in tones.json with no audio.json entry.
  const moe = id => !!(id && audio && audio[id] && audio[id].src === "moe");
  let pairs = tones && Array.isArray(tones.pairs) && tones.pairs.length ? tones.pairs : null;
  if (!pairs) pairs = await loadJSON("pairs").catch(() => []); // before the M2 build: the 20 core words of M1
  const sandhi = tones && tones.sandhi && typeof tones.sandhi === "object" ? tones.sandhi : { rules: [], items: [] };
  // A shadowing line plays its MOE clip, else its labelled TTS file (drills.js lineSource).
  const playable = it => moe(it.id) || !!(it.audio && (audio[it.audio] || String(it.audio).startsWith("audio/")));
  return {
    contrasts: (Array.isArray(contrasts) ? contrasts : []).filter(c => c && c.id).sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .map(c => ({ ...c, sets: (c.sets || []).map(set => (set || []).filter(w => w && moe(w.id))) })),
    pairs: (Array.isArray(pairs) ? pairs : []).filter(p => p && p.zhuyin && moe(p.id)),
    sandhi: {
      rules: Array.isArray(sandhi.rules) ? sandhi.rules : [],
      items: (Array.isArray(sandhi.items) ? sandhi.items : []).filter(it => it && (it.kind === "sentence" ? playable(it) : moe(it.id))),
    },
    // shadowing.json (M3): sentences with their TTS file (`audio` is a docs path, null when TTS failed)
    sentences: (shadowing && Array.isArray(shadowing.sentences) ? shadowing.sentences : [])
      .filter(s => s && s.id && s.zh && s.zhuyin && typeof s.audio === "string" && s.audio),
    meta,
  };
}

// Today's contrast: the daily focus (§8.6: a contrast enters it below 80% recent accuracy, with at least 5 recent
// trials, and stays until it reaches 85%; drills.js keeps that state and weakestContrast returns the focus contrast
// with the lowest accuracy), else a day-of-year rotation through the ten (§6.2).
function todaysContrast(contrasts) {
  const usable = contrasts.filter(c => c && (c.sets || []).some(set => (set || []).filter(w => w && w.id).length >= 2));
  if (!usable.length) return null;
  const weak = weakestContrast(usable);
  const contrast = weak || usable[dayOfYear() % usable.length];
  return { contrast, weak: !!weak, acc: recentAccuracy(contrastStats()[contrast.id]) };
}
// Today's shadowing line: a sandhi sentence with audio, rotating daily. Before the build has any, a sandhi word with
// an MOE clip, else the 3+3 tone-pair word (MOE audio, so the overlay can show).
function todaysLine(sandhi, pairs) {
  const rules = Object.fromEntries(sandhi.rules.filter(r => r && r.id).map(r => [r.id, r]));
  const lines = sandhi.items.filter(it => it && it.kind === "sentence" && it.zh && (it.id || it.audio));
  if (lines.length) { const item = lines[dayOfYear() % lines.length]; return { item, rule: rules[item.rule] || null, sentence: true }; }
  const words = sandhi.items.filter(it => it && it.kind !== "sentence" && it.id && it.zh && !it.no_change && it.rule !== "half3");
  if (words.length) { const item = words[dayOfYear() % words.length]; return { item, rule: rules[item.rule] || null, sentence: false }; }
  const p = pairs.find(x => Number(x.t1) === 3 && Number(x.t2) === 3);
  if (!p) return null;
  const syl = syllables(p.zhuyin);
  const spoken = p.spoken || (syl.length === 2 ? `${withTone(baseOf(syl[0]), 2)} ${syl[1]}` : null); // 3+3 -> 2+3 (§6.4)
  return { item: { ...p, spoken }, rule: { id: "3+3", zh: "三聲連讀", en: "3+3 -> 2+3" }, sentence: false };
}
// Today's line for the Shadowing block (§5.1: from the plan and my weak spots): a sentence of the shadowing bank.
// The line practised today stays today; else a line I rated 再練 again on an earlier day comes back (the oldest
// rating first); else a day-of-year rotation through the lines not rated 清楚 clear in the last two weeks. Before
// the M3 build (no shadowing.json): a sandhi sentence with audio, keyed by its text. The rotation skips the line the
// pronunciation session shadows today (`avoid`, its text) when there is another.
function todaysShadow(sentences, sandhi, avoid = null) {
  const asItem = x => ({ zh: x.zh, zhuyin: x.zhuyin, spoken: x.spoken || null, en: x.en || "", audio: x.audio,
    dur: Number(x.dur) > 0 ? Number(x.dur) : null, key: x.id, focus: x.focus || "", level: x.level || "" });
  if (sentences.length) {
    const kept = (todayEntry().shadow || {}).key;
    const same = kept && sentences.find(x => x.id === kept);
    if (same) return { item: asItem(same), again: false };
    const rated = shadowRatings(), t = today(); // "shadow.lines", shared with the Shadowing page
    const r = x => rated[x.id] || null;
    const on = x => ratedOn(r(x));
    const again = sentences.filter(x => r(x) && r(x).rating === "again" && on(x) && on(x) < t)
      .sort((a, b) => on(a).localeCompare(on(b)));
    if (again.length) return { item: asItem(again[0]), again: true };
    const since = dateKey(new Date(Date.now() - 14 * 86400000));
    const fresh = sentences.filter(x => !(r(x) && r(x).rating === "clear" && on(x) >= since));
    const pool = fresh.length ? fresh : sentences;
    const other = pool.filter(x => x.zh !== avoid);
    const use = other.length ? other : pool;
    return { item: asItem(use[dayOfYear() % use.length]), again: false };
  }
  const all = sandhi.items.filter(x => x && x.kind === "sentence" && x.zh && x.zhuyin && x.audio);
  const lines = all.filter(x => x.zh !== avoid).length ? all.filter(x => x.zh !== avoid) : all;
  if (!lines.length) return null;
  const x = lines[dayOfYear() % lines.length];
  return { item: { zh: x.zh, zhuyin: x.zhuyin, spoken: x.spoken || null, en: x.en || "", audio: x.audio, dur: null,
    key: `sandhi:${x.zh}`, focus: x.rule || "", level: "" }, again: false };
}
// A shadowing line's focus (sentences.csv `focus`): a sandhi rule or a contrast, by name; null when unknown.
function focusName(id) {
  if (!id || !ui.data) return null;
  const rule = ui.data.sandhi.rules.find(r => r && r.id === id);
  if (rule) return ruleName(rule);
  const c = ui.data.contrasts.find(x => x && x.id === id);
  return c ? [h("span", { lang: "zh-Hant-TW" }, c.zh)] : null;
}
// A sandhi rule's name: its zh name plus English (sandhi.json gives only "一"/"不" as the en of those two rules).
const RULE_EN = { "3+3": "3+3 → 2+3", half3: "half-third", yi: "tone change of 一", bu: "tone change of 不" };
const ruleName = r => {
  if (!r) return null;
  const e = /[A-Za-z]/.test(r.en || "") ? String(r.en).replace("->", "→") : RULE_EN[r.id] || r.en || r.id || "";
  return [h("span", { lang: "zh-Hant-TW" }, r.zh || ""), " ", en(e)];
};
// The work in a step's drill result, read the same way whether the drill ended itself or was stopped:
// worked (any practice), complete (the step's planned work all done; st.goal is set when the drill starts) and seen
// (the drill showed anything at all: a drill that ends by itself having shown nothing had nothing to practise).
// listen, pairs: answers; complete when every planned trial was answered.
// mirror: words with a take (or, without a microphone, words listened to and repeated); complete when every word
//   has one. Pressing Next through the words without recording is no practice.
// shadow: a protocol run or a take; complete with a recording. A run alone is not, since a run can be all skips;
//   in a browser that cannot record at all, a run is the whole protocol. A shadowing run without a take still
//   counts the time spent in it, and a step that used its whole box counts in full (see judge()).
function stepWork(st, r) {
  r = r || {};
  if (st.key === "mirror") {
    const items = Array.isArray(r.items) ? r.items : [];
    const did = items.filter(x => x && (r.scored === false || (x.tries || 0) > 0)).length;
    return { worked: did > 0, complete: did > 0 && did >= (st.goal || 1), seen: items.length > 0 };
  }
  if (st.key === "shadow") {
    const runs = r.runs || 0;
    return { worked: runs > 0 || !!r.recorded, complete: !!r.recorded || (runs > 0 && !canRecord), seen: runs > 0 || !!r.recorded };
  }
  const n = r.n || 0;
  return { worked: n > 0, complete: n > 0 && n >= (st.goal || 1), seen: n > 0 };
}

// ------------------------------------------------------------------ page
const ui = { plan: null, picks: null, data: null, running: false, rest: [], els: {} };

async function render() {
  const app = $("#app");
  const data = await loadData();
  ui.data = data;
  ui.plan = routinePlan();
  const line = todaysLine(data.sandhi, data.pairs);
  ui.picks = { contrast: todaysContrast(data.contrasts), line, shadow: todaysShadow(data.sentences, data.sandhi, line && line.item.zh) };
  const { plan } = ui;
  const weekDots = h("span", { class: "week-dots", "aria-hidden": "true" }, [1, 2, 3, 4].map(w => h("i", { class: w <= plan.week ? "on" : "" })));
  const phase = plan.phase0
    ? [h("span", {}, "第 0 階段・聲音重置 "), en(`Phase 0 · sound reset, week ${plan.week} of 4`), weekDots]
    : [h("span", {}, "第 1 階段 "), en("Phase 1")];
  ui.els.stats = h("div", { class: "card" });
  ui.els.session = h("section", { class: "card session", id: "session", "aria-labelledby": "session-title" });
  ui.els.shadow = h("section", { class: "card session shadow-block", id: "shadowing", "aria-labelledby": "shadow-title" });
  ui.els.routine = h("section", { class: "card routine-card", "aria-labelledby": "routine-title" });
  ui.els.outside = h("section", { class: "card outside-card", "aria-labelledby": "outside-title" });
  const pages = h("section", { class: "today-pages", "aria-labelledby": "pages-title" },
    h("h2", { id: "pages-title" }, "所有頁面 ", en("All pages")),
    h("div", { class: "home-nav compact" }, PAGES.map(([href, zh, enName, d]) => {
      const built = BUILT.includes(href.replace(".html", ""));
      // unbuilt pages: a disabled link with no href, like the top nav and the 更多 sheet
      return h("a", { href: built ? href : null, class: built ? "" : "soon", role: built ? null : "link", "aria-disabled": built ? null : "true" },
        h("span", { class: "t" }, h("span", { lang: "zh-Hant-TW" }, zh), " ", h("span", { class: "muted", style: "font-size:14px", lang: "en" }, enName)),
        h("span", { class: "d" }, built ? en(d) : ["尚未建置 ", en("coming soon")]));
    })));
  const meta = data.meta && data.meta.counts
    ? h("p", { class: "muted small", style: "margin-top:16px" }, "資料建置 ", en(`data built ${data.meta.built} · ${data.meta.counts.moe_clips} MOE human clips · ${data.meta.counts.syllables} syllables`))
    : null;
  ui.rest = [ui.els.shadow, ui.els.routine, ui.els.outside, pages, meta].filter(Boolean);
  clear(app).append(
    h("div", { class: "page-head" }, h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "今天"), h("span", { class: "en", lang: "en" }, "Today")),
      h("p", { class: "today-phase" }, phase),
      FAST > 1 ? h("p", { class: "muted small", role: "note" }, "測試模式：計時 ÷20 ", en("Test mode (?fast=1): every time box ÷20")) : ""),
    ui.els.stats, ui.els.session, ...ui.rest);
  paintStats();
  startCard();
  shadowCard();
  paintRoutine();
  outsideCard();
}

function paintStats() {
  const w = weekStats();
  const level = store.get("level", null);
  const stat = (zh, enK, v, cls = "v", extra = null) => h("div", { class: "stat" }, h("span", { class: "k" }, zh, " ", en(enK)), h("span", { class: cls }, v), extra);
  clear(ui.els.stats).append(h("div", { class: "today-stats" },
    stat("連續", "streak", [streak(), h("small", {}, " 天 ", en("days"))]),
    stat("本週", "this week", [w.total, h("small", {}, " 分鐘 ", en("min"))], "v",
      w.outside ? h("span", { class: "x" }, en("App"), ` ${w.app} · 課外 `, en("outside"), ` ${w.outside}`) : null),
    stat("程度", "level", level != null ? String(level) : ["未測 ", en("not placed yet")], level != null ? "v" : "v t"),
    stat("里程碑", "next milestone", ["程度測驗 ", en("Placement check")], "v t")));
}

// ------------------------------------------------------------------ the pronunciation session: start card
function stepDetail(st) {
  const { picks, data } = ui;
  if (st.key === "listen") {
    const p = picks.contrast;
    if (!p) return [h("span", {}, "還沒有對比資料 ", en("no contrast data yet"))];
    return [h("span", { lang: "zh-Hant-TW" }, p.contrast.zh),
      p.weak ? h("span", {}, "每日重點 ", en(`daily focus, ${p.acc}%`)) : h("span", {}, "今天輪到 ", en("today's turn"))];
  }
  if (st.key === "pairs") {
    return data.pairs.length ? [h("span", {}, "弱的組合優先 ", en("weak patterns first"))]
      : [h("span", {}, "還沒有雙字詞音檔 ", en("no two-syllable clips yet"))];
  }
  if (st.key === "mirror") return [h("span", {}, "比較音高曲線 ", en("compare pitch curves"))];
  const line = picks.line;
  if (!line) return [h("span", {}, "還沒有跟讀句子 ", en("no shadowing line yet"))];
  return [h("span", { lang: "zh-Hant-TW" }, line.item.zh), line.rule ? h("span", {}, ruleName(line.rule)) : null,
    line.sentence ? null : h("span", {}, "（", en("no sandhi sentence built yet: a word instead"), "）")];
}
const modeTag = st => (st.speak ? h("span", { class: "mode-tag speak" }, "說 ", en("speak")) : h("span", { class: "mode-tag" }, "聽 ", en("listen")));

function startCard() {
  const { plan } = ui;
  const card = clear(ui.els.session);
  card.classList.remove("running");
  const done = todayEntry().pron;
  card.append(h("div", { class: "session-head" },
    h("h2", { id: "session-title", tabindex: "-1" }, "發音練習 ", en("Pronunciation")),
    h("span", { class: "session-mins" }, `${fmtMin(plan.pron)} 分鐘 `, en("min"))));
  // Done today: the summary and a quieter "Practise again". Otherwise: Start first (it is used every day), then
  // what the four steps are today.
  if (done && done.done) {
    card.append(summaryView(done, { compact: true }),
      h("button", { type: "button", class: "btn session-start", onclick: runSession }, "↻ ", ...bi("再練一次", "Practise again")));
  } else {
    card.append(h("button", { type: "button", class: "btn primary session-start", onclick: runSession }, "▶ ", ...bi("開始", "Start")),
      h("ol", { class: "session-steps" }, STEPS.map((st, i) => h("li", {},
        h("span", { class: "step-num", "aria-hidden": "true" }, i + 1),
        h("span", { class: "step-name" }, h("span", { class: "sr-only" }, `${i + 1}. `), st.zh, " ", en(st.en, { class: "muted small" })),
        h("span", { class: "step-min" }, `${fmtMin(plan.steps[i])} 分 `, en("min")),
        h("span", { class: "step-detail" }, stepDetail(st), modeTag(st))))));
  }
  card.append(h("p", { class: "muted small session-note" }, "先聽後說：步驟 1–2 只用聽的，3–4 才開口。錄音只存在這台裝置。",
    en(" Listen first: steps 1–2 never ask you to speak; you speak in 3–4. Recordings stay on this device.")));
}

// ------------------------------------------------------------------ the session runner
// A step's state and credit (seconds toward the plan) once its drill has a result, from the work in it and the
// visible time spent in it, never from which button ended it:
//   some practice: credit = its whole box when complete, else the time spent (up to the box); "done" (the ✓) when
//     that is the whole box (complete, or the box used up), else "partial";
//   no practice: "error" when the drill reported an error (shadowing audio that could not play), "na" when the drill
//     ended by itself having shown nothing (no data), else "skipped"; credit 0.
// "na" and "error" (also set by failStep) leave the plan.
function judge(st) {
  const r = st.result || {};
  const w = stepWork(st, r);
  if (!w.worked) {
    st.state = r.error ? "error" : !r.stopped && !w.seen ? "na" : "skipped";
    st.credit = 0;
    return st;
  }
  const full = w.complete || st.spent >= st.sec - 1; // 1 s: the drill's own clock and this one tick apart
  st.credit = full ? st.sec : Math.min(st.sec, st.spent);
  st.state = full ? "done" : "partial";
  return st;
}
// How much of the block was practised: the credit of every step that had something to practise.
function blockCredit(steps) {
  let planned = 0, got = 0;
  for (const st of steps) {
    if (st.state === "na" || st.state === "error") continue;
    planned += st.sec;
    got += st.credit || 0;
  }
  return { planned, got };
}
// drills.js assertMoeOnly throws when a tone drill is given an item without an MOE human clip (ground rule 5):
// "<drill>: not MOE human audio (§10 item 5): …", or "… cannot check the MOE-only rule" before audio.json loads.
const isMoeError = err => !!err && /not MOE human audio|MOE-only rule|§10 item 5/.test(String(err.message || ""));
function stepError(err, last) {
  return h("div", { class: "session-error", role: "alert" },
    h("p", {}, ...(isMoeError(err)
      ? bi("這一步沒有開始：聲調練習只用教育部真人發音，但有一個詞沒有這種音檔。", "This step did not start: tone drills use MOE human recordings only, and an item has no MOE clip.")
      : bi("這一步出了錯，沒有開始。", "This step hit an error and did not start."))),
    h("p", { class: "muted small" }, ...(last ? bi("可以直接完成練習。", "You can finish the session now.") : bi("可以直接到下一步。", "You can go straight on to the next step."))),
    h("p", { class: "session-error-msg" }, en(String((err && err.message) || err))));
}
const STATE_SR = { now: ["進行中", "current"], done: ["完成", "done"], partial: ["部分完成", "partly done"], skipped: ["跳過", "skipped"],
  na: ["沒有資料", "no data"], error: ["出錯", "error"] };

function runSession() {
  if (ui.running) return;
  try { audioContext(); } catch { /* no Web Audio */ } // unlock audio inside the tap (iOS): the first item plays later
  // Today's contrast is picked again: a session that just ended may have changed the daily focus.
  ui.picks = { ...ui.picks, contrast: todaysContrast(ui.data.contrasts) };
  const { plan, picks, data } = ui;
  ui.running = true;
  for (const el of ui.rest) el.hidden = true;
  const card = clear(ui.els.session);
  card.classList.add("running");
  // spent: visible seconds while the step was running (before its result); goal: its planned work (trials or mirror
  // words, set by launch); credit: seconds toward the plan (judge). All three are for "done for today".
  const steps = STEPS.map((d, i) => ({ ...d, sec: plan.steps[i] * 60 / FAST, t0: 0, spent: 0, goal: 0, credit: 0, result: null, state: "todo" }));
  const total = steps.reduce((a, s) => a + s.sec, 0);
  const t0 = performance.now();
  let cur = -1, ctl = null, ended = false, timeUpSaid = false;

  // Visible time only (a phone locked mid-session does not count; a span over 15 s between ticks is a sleep).
  const time = { last: t0, visible: document.visibilityState === "visible", pending: 0, total: 0 };
  const tick = () => {
    const now = performance.now(), dt = now - time.last;
    time.last = now;
    if (time.visible && dt < 15000) {
      time.pending += dt; time.total += dt;
      const st = steps[cur];
      if (st && st.state === "now" && !ended) st.spent += dt / 1000;
    }
    time.visible = document.visibilityState === "visible";
  };
  // Logged in pieces of at least 6 s (logMinutes keeps 0.1 min); a smaller rest carries over to the next flush.
  // final: the page may be going away (hidden, closed) or the session ends, so log any whole second left.
  const flush = (final = false) => {
    tick();
    if (time.pending >= (final ? 1000 : 6000)) { logMinutes("pron", time.pending / 60000); time.pending = 0; }
  };
  const flushAll = () => flush(true);
  const onVis = () => { if (document.visibilityState === "hidden") flushAll(); else tick(); };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", flushAll);

  const bars = steps.map(() => h("i"));
  const pills = steps.map((st, i) => h("li", { class: "step-pill" },
    h("span", { class: "step-bar", "aria-hidden": "true" }, bars[i]),
    h("span", { class: "lbl" }, h("b", {}, i + 1), " ", st.zh, h("span", { class: "tick", "aria-hidden": "true" })),
    h("span", { class: "short", lang: "en" }, st.short),
    h("span", { class: "sr-only st" })));
  const title = h("h2", { id: "session-title", tabindex: "-1" });
  const timeLeft = h("b");
  const timer = h("span", { class: "drill-timer", role: "timer" }, h("span", { class: "sr-only" }, "這一步剩下 ", en("time left in this step"), " "), timeLeft);
  const sub = h("p", { class: "step-sub" });
  const timeupNote = h("p", { class: "timeup-note", hidden: true }, "時間到：做完這一題，這一步就結束。", en(" Time's up: this step ends after the current item."));
  const overallText = h("span");
  const overallBar = h("div", { class: "progress", "aria-hidden": "true" }, h("i", { style: "width:0%" }));
  const live = h("p", { class: "sr-only", "aria-live": "polite" });
  const stage = h("div", { class: "session-stage" });
  const nextBtn = h("button", { type: "button", class: "btn", onclick: () => next() });
  // Ends the session before its last step; on the last step nextBtn ends it ("完成練習 Finish session", see setNext).
  const stopBtn = h("button", { type: "button", class: "btn", onclick: () => stop() }, "■ ", ...bi("提早結束", "End early"));
  card.append(h("span", { id: "step-pills-label", class: "sr-only" }, "步驟 ", en("Steps")),
    h("ol", { class: "step-pills", "aria-labelledby": "step-pills-label" }, pills),
    h("div", { class: "step-head" }, title, timer), sub, timeupNote,
    h("div", { class: "session-overall" }, overallText, overallBar), live, stage,
    h("div", { class: "session-foot" }, nextBtn, stopBtn));

  function paintPills() {
    steps.forEach((st, i) => {
      const li = pills[i];
      li.className = `step-pill ${st.state}`;
      if (i === cur && !ended) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      li.querySelector(".tick").textContent = st.state === "done" ? " ✓" : ""; // the tick only for a step run to its end
      const s = STATE_SR[st.state];
      li.querySelector(".st").replaceChildren(...(s ? [`：${s[0]} `, en(s[1])] : []));
    });
  }
  function paint() {
    if (ended) return;
    tick();
    const now = performance.now();
    overallText.replaceChildren("總計 ", en("total"), ` ${mmss((now - t0) / 1000)} / ${mmss(total)}`);
    overallBar.firstChild.style.width = pct((now - t0) / 1000 / total);
    // a step cut short fills as far as its credit (the time spent in it)
    steps.forEach((st, i) => {
      bars[i].style.width = st.state === "todo" ? "0%" : st.state === "now" ? pct((now - st.t0) / 1000 / st.sec)
        : st.state === "partial" ? pct(Math.max(0.05, st.credit / st.sec)) : "100%";
    });
    const st = steps[cur];
    if (!st || st.state !== "now") { timer.hidden = true; timeupNote.hidden = true; return; }
    const left = st.sec - (now - st.t0) / 1000;
    timer.hidden = false;
    timer.classList.toggle("low", left <= 30);
    timeLeft.textContent = mmss(left);
    if (left <= 0 && !timeUpSaid) {
      timeUpSaid = true;
      timeupNote.hidden = false;
      live.replaceChildren("時間到：做完這一題，這一步就結束。", en(" Time's up: this step ends after the current item."));
    }
  }
  const timerId = setInterval(paint, 250);

  // Action names follow drills.js: there "下一題 Next" moves to the next trial and "完成 Finish" ends the drill, which
  // in this runner ends the step. Here "下一步 Next step" moves the session on, and the button that ends the whole
  // session names it ("完成練習 Finish session"), so it never shares a label with a drill's own Finish on screen.
  function setNext(ready) {
    const last = cur >= steps.length - 1;
    nextBtn.className = ready ? "btn primary" : "btn";
    nextBtn.replaceChildren(...(ready ? (last ? ["✓ ", ...bi("完成練習", "Finish session")] : [...bi("下一步", "Next step"), " →"])
      : ["⏭ ", ...bi(last ? "跳過並完成練習" : "跳過這一步", last ? "Skip and finish session" : "Skip this step")]));
    stopBtn.hidden = last; // on the last step the button above already ends the session
  }
  function intro(st) {
    if (st.key === "listen") {
      const p = picks.contrast;
      return p ? ["今天的對比 ", en("Today's contrast"), "：", h("span", { lang: "zh-Hant-TW" }, p.contrast.zh),
        p.weak ? ["・每日重點 ", en(`daily focus, ${p.acc}%`)] : null, "　只用聽的。", en(" Listening only.")] : [];
    }
    if (st.key === "pairs") return ["聽雙字詞，選它的聲調組合。只用聽的。", en(" Hear a word, choose its tone pattern. Listening only.")];
    if (st.key === "mirror") return ["現在開口：聽示範，錄自己的，比較曲線。", en(" Now you speak: listen, record yourself, compare the curves.")];
    const line = picks.line;
    return line && line.rule ? ["今天的變調 ", en("Today's sandhi"), "：", ruleName(line.rule)] : [];
  }
  // One step's drill, timed to the step. onDone runs synchronously inside ctl.stop(), so a skip records its result.
  // pairIdDrill and mirrorDrill assert MOE-only input themselves (drills.js assertMoeOnly); loadData already keeps
  // only words with an MOE clip, so the assertion firing means a bug, shown by failStep. A failed check throws from
  // the drill call when audio.json is already in (caught in startStep), else the drill's `done` rejects.
  // st.goal: the step's planned work, what "complete" means in stepWork (trials answered, mirror words with a take).
  function launch(st, host) {
    const common = { timeLimit: st.sec, again: false, onDone: res => stepDone(st, res) };
    if (st.key === "listen") {
      if (!picks.contrast) return null;
      st.goal = Math.max(8, Math.round(st.sec / 7));
      return contrastDrill(host, picks.contrast.contrast, { ...common, voiceNote: true, n: st.goal });
    }
    if (st.key === "pairs") {
      if (!data.pairs.length) return null;
      st.goal = Math.max(6, Math.round(st.sec / 10));
      return pairIdDrill(host, data.pairs, { ...common, n: st.goal });
    }
    if (st.key === "mirror") {
      const items = weightedPairs(data.pairs, Math.max(3, Math.round(st.sec / 30)));
      st.goal = items.length;
      return items.length ? mirrorDrill(host, items, common) : null;
    }
    if (st.key === "shadow") { st.goal = 1; return picks.line ? shadowLine(host, picks.line.item, common) : null; }
    return null;
  }
  function startStep(i) {
    tick(); // time up to here belongs to the step before
    cur = i;
    const st = steps[i];
    st.state = "now"; st.t0 = performance.now();
    timeUpSaid = false; timeupNote.hidden = true;
    title.replaceChildren(h("span", { class: "of" }, `${i + 1}／${steps.length}　`), st.zh, " ", en(st.en, { class: "muted small" }));
    sub.replaceChildren(...[intro(st)].flat(Infinity).filter(k => k != null && k !== false)); // intro nests arrays and nulls
    setNext(false);
    clear(stage);
    const host = h("div");
    stage.append(host);
    let c = null, err = null;
    try { c = launch(st, host); } catch (e) { err = e; }
    ctl = c;
    if (err) failStep(st, err);
    else if (!c) {
      st.state = "na";
      stage.append(h("p", { class: "session-empty" }, "這一步還沒有可以練習的資料。", en(" Nothing to practise in this step yet.")));
      setNext(true);
    } else if (c.done && typeof c.done.then === "function") c.done.then(null, e => failStep(st, e));
    paintPills();
    paint();
    card.scrollIntoView({ block: "start", behavior: smooth() });
    title.focus({ preventScroll: true });
  }
  // A drill that threw or rejected (above all drills.js assertMoeOnly): the step shows why, records nothing more
  // and the session can go on.
  function failStep(st, err) {
    console.error(err);
    if (ended || st.result) return false;
    tick();
    st.state = "error"; st.result = { error: String((err && err.message) || err) };
    if (steps[cur] === st) {
      const c = ctl;
      ctl = null;
      if (c) { try { c.stop(); } catch { /* already over */ } } // its onDone finds st.result set and does nothing
      clear(stage).append(stepError(err, cur >= steps.length - 1));
      setNext(true);
      const n = cur + 1;
      live.replaceChildren(`第 ${n} 步沒有開始。`, en(` Step ${n} did not start.`));
    }
    paintPills();
    paint();
    return true;
  }
  // The drill's result: the state and credit come from judge() (the work and the time, not the button). A drill
  // that ended by itself leaves the step on screen with Next step / Finish session ready; a skip or stop goes on.
  function stepDone(st, res) {
    if (st.result) return;
    tick(); // the last moments of the step count as time spent in it
    st.result = res || {};
    judge(st);
    if (steps[cur] === st) ctl = null;
    flush();
    paintPills();
    paint();
    if (ended || st.result.stopped || steps[cur] !== st) return;
    setNext(true);
    const n = steps.indexOf(st) + 1;
    const say = {
      done: [`第 ${n} 步完成。`, ` Step ${n} done.`],
      partial: [`第 ${n} 步結束，做了一部分。`, ` Step ${n} over, partly done.`],
      skipped: [`第 ${n} 步結束，沒有練習到。`, ` Step ${n} over, nothing practised.`],
      na: [`第 ${n} 步沒有可以練習的資料。`, ` Step ${n} had nothing to practise.`],
      error: st.result.error === "audio" ? [`第 ${n} 步無法播放音檔。`, ` Step ${n}: the audio could not play.`] : [`第 ${n} 步出錯。`, ` Step ${n} hit an error.`],
    }[st.state] || [`第 ${n} 步結束。`, ` Step ${n} over.`];
    live.replaceChildren(say[0], en(say[1]));
    nextBtn.focus({ preventScroll: true });
  }
  function next() {
    if (ended) return;
    const st = steps[cur];
    if (ctl && st && !st.result) ctl.stop(); // -> stepDone(st, {stopped: true}) right away
    ctl = null;
    if (cur + 1 < steps.length) startStep(cur + 1); else finish(false);
  }
  function stop() {
    if (ended) return;
    const st = steps[cur];
    // Early: a step not reached yet, or the current one still running. After the last step has ended it is a finish.
    const early = steps.some(s => s.state === "todo") || !!(st && st.state === "now" && !st.result);
    if (ctl && st && !st.result) ctl.stop();
    ctl = null;
    finish(early);
  }
  function finish(early) {
    if (ended) return;
    flush(true);
    ended = true;
    clearInterval(timerId);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", flushAll);
    stopAll(); // app.js audio and recordings, and the shadowing step's player (player.js)
    // a step still running whose drill never reported (it had not finished loading) ends with nothing in it
    for (const st of steps) if (st.state === "now" && !st.result) { st.result = { stopped: true }; judge(st); }
    // Done for today depends on the work (see the top of the file), not on the button that ended the run.
    const credit = blockCredit(steps);
    const done = credit.planned > 0 && credit.got >= DONE_SHARE * credit.planned - 0.001;
    // credit is rounded down, so a run short of 80% never shows as reaching it
    const summary = { done, early: !done && early, minutes: Math.round(time.total / 6000) / 10, at: Date.now(),
      credit: tenths(credit.got / 60, Math.floor), planned: tenths(credit.planned / 60), steps: steps.map(summarize) };
    const prev = todayEntry().pron;
    if (done || !(prev && prev.done)) saveDay({ pron: summary }); // a later run that falls short keeps today's "done"
    ui.running = false;
    for (const el of ui.rest) el.hidden = false;
    clear(card);
    card.classList.remove("running");
    // the blocks in order (§5.1): the Shadowing block comes next while it is not done today
    const nextShadow = ui.picks.shadow && !(todayEntry().shadow || {}).done
      ? h("button", { type: "button", class: "btn primary", onclick: runShadow }, ...bi("接著跟讀", "Next: Shadowing"), ` ${fmtMin(plan.shadow)} 分 `, en("min"), " →") : null;
    card.append(summaryView(summary, { compact: false }),
      h("div", { class: "row" }, nextShadow, h("button", { type: "button", class: "btn", onclick: runSession }, "↻ ", ...bi("再練一次", "Practise again"))));
    paintStats();
    shadowCard();
    paintRoutine();
    card.scrollIntoView({ block: "start", behavior: smooth() });
    $("#session-title").focus({ preventScroll: true });
  }
  function summarize(st) {
    const r = st.result || {};
    const tries = Array.isArray(r.items) ? r.items.reduce((a, x) => a + (x.tries || 0), 0) : 0;
    return { key: st.key, state: st.state === "now" ? "partial" : st.state, n: r.n || 0, correct: r.correct || 0,
      accuracy: r.accuracy ?? null, best: r.best ?? null, tries, runs: r.runs || 0, recorded: !!r.recorded,
      unscored: r.scored === false, // mirror without a microphone: listen and repeat
      seen: Array.isArray(r.items) ? r.items.length : 0,
      error: st.state === "error" ? (r.error === "audio" ? "audio" : "error") : null,
      spent: Math.round(st.spent), credit: Math.round(st.credit || 0), planned: st.sec,
      contrast: st.key === "listen" && picks.contrast ? picks.contrast.contrast.zh : null,
      line: st.key === "shadow" && picks.line ? picks.line.item.zh : null };
  }
  startStep(0);
}

// One line per step: accuracy for the listening steps, the best mirror score, whether a shadowing take was made.
function summaryView(sum, { compact }) {
  const steps = Array.isArray(sum.steps) ? sum.steps : [];
  const head = sum.done ? ["✓ ", "今天的發音練習完成 ", en("Pronunciation done for today")]
    : sum.early ? ["練習提早結束 ", en("Session ended early")] : ["練習結束 ", en("Session over")];
  const val = s => {
    const none = (zh, e) => h("span", { class: "summary-val none" }, zh, " ", en(e));
    if (s.state === "todo") return none("沒做到", "not reached");
    if (s.state === "na") return none("沒有資料", "no data");
    if (s.state === "error") return s.error === "audio" ? none("無法播放", "audio could not play") : none("出錯", "error");
    const quiet = (...kids) => h("span", { class: "muted", style: "font-weight:400" }, ...kids);
    if (s.key === "listen" || s.key === "pairs") return s.n ? h("span", { class: "summary-val" }, `${s.correct}/${s.n}（${s.accuracy ?? Math.round(100 * s.correct / s.n)}%）`) : none("跳過", "skipped");
    if (s.key === "mirror") {
      if (s.best != null) return h("span", { class: "summary-val" }, "最高 ", en("best"), ` ${s.best}`, quiet(` · ${s.tries || s.n} 次 `, en("takes")));
      if (s.unscored && s.seen) return h("span", { class: "summary-val" }, `跟著說 ${s.seen} 個 `, en(`${s.seen} repeated, no score`));
      if (s.n || s.tries) return none("錄了，沒有分數", "recorded, no score");
      return s.seen ? none("沒有錄音", "no takes") : none("跳過", "skipped");
    }
    if (s.recorded) return h("span", { class: "summary-val" }, "錄了一次 ", en("recorded"));
    if (s.runs) return h("span", { class: "summary-val" }, `做了 ${s.runs} 輪 `, en(s.runs === 1 ? "1 run" : `${s.runs} runs`), quiet("，沒有錄音 ", en("no take")));
    return none("跳過", "skipped");
  };
  const list = h("ul", { class: "summary-list" }, steps.map((s, i) => {
    const def = STEPS.find(d => d.key === s.key) || { zh: s.key, en: "" };
    const what = s.contrast || s.line;
    return h("li", {}, h("span", { class: "step-num", "aria-hidden": "true" }, i + 1),
      h("span", {}, def.zh, " ", en(def.en, { class: "muted small" }),
        s.state === "partial" ? h("span", { class: "muted small" }, "（部分 ", en("partly"), "）") : null,
        what ? h("span", { class: "summary-what", lang: "zh-Hant-TW" }, what) : null),
      val(s));
  }));
  if (compact) {
    return h("div", {}, h("p", { class: "session-done" }, "✓ 今天已完成 ", en(sum.minutes > 0 ? `Done today · ${sum.minutes} min` : "Done today")), list);
  }
  // Not done: say how far the run got and what "done" takes, so the verdict never looks arbitrary. This is the
  // credit toward the plan (a step done in full counts its whole box), not the minutes logged above. The credit is
  // stored rounded down to 0.1 min and the 80% mark is rounded up, so a run short of 80% never reads as reaching it.
  const got = String(sum.credit || 0), plannedMin = fmtMin(sum.planned), need = String(tenths(DONE_SHARE * sum.planned, Math.ceil));
  const rule = sum.done || sum.planned == null ? null
    : sum.planned > 0
      ? h("p", { class: "summary-rule" }, `這次做到計畫 ${plannedMin} 分鐘裡的 ${got} 分鐘（做完的步驟算整段，做了一部分的算花的時間）。做到 ${need} 分鐘（八成），今天才算完成。`,
        en(` Covered ${got} of the ${plannedMin} planned minutes (a step done in full counts its whole box, a step done in part the time spent in it). The block counts as done at ${need} min (80%).`))
      : h("p", { class: "summary-rule" }, "這次沒有可以練習的步驟，所以不算完成。", en(" No step had anything to practise, so nothing counts as done."));
  return h("div", { class: "session-summary" },
    h("h2", { id: "session-title", tabindex: "-1" }, head),
    h("p", { class: "summary-meta" }, ...(sum.minutes > 0 ? [`${sum.minutes} 分鐘，已記入今天的時間。`, en(` ${sum.minutes} min, added to today's minutes.`)]
      : ["不到 0.1 分鐘，沒有記入時間。", en(" Under 0.1 min, so no time was logged.")])), // only visible time counts
    rule, list);
}

// ------------------------------------------------------------------ the Shadowing block (§5.4, §8.3; M3)
// Today's line with its source, Zhuyin (the sandhi overlay follows the setting) and English.
function linePreview(line) {
  const it = line.item;
  const focus = focusName(it.focus);
  return h("div", { class: "shadow-today" },
    h("p", { class: "k" }, "今天的句子 ", en("Today's line"),
      line.again ? h("span", { class: "again-tag" }, "再練 ", en("again")) : null),
    h("p", { class: "shadow-today-line" }, ruby(it.zh, it.zhuyin, { cls: "", spoken: it.spoken })),
    h("p", { class: "shadow-today-meta" },
      h("span", { class: "badge tts", title: "TTS (Google zh-TW)" }, "TTS"), " ", en("Google zh-TW", { class: "muted small" }),
      it.en ? [" · ", en(it.en)] : null,
      focus ? [" · 重點 ", en("focus"), "：", focus] : null));
}
function protocolList() {
  return [h("span", { id: "shadow-plan-label", class: "sr-only" }, "步驟 ", en("Steps")),
    h("ol", { class: "shadow-plan", "aria-labelledby": "shadow-plan-label" },
      PROTOCOL.map(([zh, e]) => h("li", {}, h("span", {}, zh), " ", en(e, { class: "muted" }))))];
}
// The block's card when it is not running: today's line, Start (the next thing to do once the pronunciation block is
// done, so it is the primary button then) and the protocol, or today's result and "Practise again".
function shadowCard() {
  const { plan } = ui;
  const card = clear(ui.els.shadow);
  card.classList.remove("running");
  const line = ui.picks.shadow;
  const entry = todayEntry();
  card.append(h("div", { class: "session-head" },
    h("h2", { id: "shadow-title", tabindex: "-1" }, "跟讀 ", en("Shadowing")),
    h("span", { class: "session-mins" }, `${fmtMin(plan.shadow)} 分鐘 `, en("min"))));
  if (!line) {
    card.append(h("p", { class: "muted" }, "還沒有跟讀句子。", en(" No shadowing lines built yet.")));
    return;
  }
  card.append(linePreview(line));
  if (entry.shadow && entry.shadow.done) {
    card.append(shadowSummary(entry.shadow, { compact: true }),
      h("button", { type: "button", class: "btn shadow-start", onclick: runShadow }, "↻ ", ...bi("再練一次", "Practise again")));
  } else {
    const next = !!(entry.pron && entry.pron.done);
    card.append(h("button", { type: "button", class: `btn shadow-start${next ? " primary" : ""}`, onclick: runShadow }, "▶ ", ...bi("開始跟讀", "Start shadowing")),
      ...protocolList());
  }
  card.append(h("p", { class: "muted small session-note" }, "同一句練 " + fmtMin(plan.shadow) + " 分鐘：先聽，再跟著說，最後錄音和自評。錄音只存在這台裝置。",
    en(` One line for ${fmtMin(plan.shadow)} min: listen, shadow, then record and rate yourself. Recordings stay on this device.`)));
}

// Runs the block: the guided protocol on today's line (drills.js shadowLine, protocol "full") for the block's time
// box, with a countdown. Visible time only is logged ("shadow"), in pieces of at least 30 s and the rest at the end,
// like the pronunciation session. Done for today: a full run (or a take) and 80% of the box in visible time.
function runShadow() {
  if (ui.running) return;
  const line = ui.picks.shadow;
  if (!line) return;
  try { audioContext(); } catch { /* no Web Audio */ } // unlock audio inside the tap (iOS)
  ui.running = true;
  const sec = ui.plan.shadow * 60 / FAST;
  const others = [ui.els.session, ...ui.rest.filter(el => el !== ui.els.shadow)];
  for (const el of others) el.hidden = true;
  const card = clear(ui.els.shadow);
  card.classList.add("running");
  const t0 = performance.now();
  let ctl = null, ended = false, result = null, spent = 0, timeUpSaid = false;
  const time = { last: t0, visible: document.visibilityState === "visible", pending: 0, total: 0 };
  const tick = () => {
    const now = performance.now(), dt = now - time.last;
    time.last = now;
    if (time.visible && dt < 15000) { time.pending += dt; time.total += dt; if (!result && !ended) spent += dt / 1000; }
    time.visible = document.visibilityState === "visible";
  };
  const flush = (final = false) => {
    tick();
    if (time.pending >= (final ? 1000 : 30000)) { logMinutes("shadow", time.pending / 60000); time.pending = 0; }
  };
  const flushAll = () => flush(true);
  const onVis = () => { if (document.visibilityState === "hidden") flushAll(); else tick(); };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", flushAll);

  const focus = focusName(line.item.focus);
  const title = h("h2", { id: "shadow-title", tabindex: "-1" }, "跟讀 ", en("Shadowing", { class: "muted small" }));
  const timeLeft = h("b");
  const timer = h("span", { class: "drill-timer", role: "timer" }, h("span", { class: "sr-only" }, "剩下 ", en("time left"), " "), timeLeft);
  const sub = h("p", { class: "step-sub" }, "同一句，照步驟做。", en(" One line, step by step."), focus ? ["　重點 ", en("focus"), "：", focus] : null);
  const timeupNote = h("p", { class: "timeup-note", hidden: true }, "時間到：做完這一輪就結束。", en(" Time's up: the block ends after this run."));
  const overallText = h("span");
  const overallBar = h("div", { class: "progress", "aria-hidden": "true" }, h("i", { style: "width:0%" }));
  const live = h("p", { class: "sr-only", "aria-live": "polite" });
  const host = h("div");
  const endBtn = h("button", { type: "button", class: "btn", onclick: () => finish() });
  card.append(h("div", { class: "step-head" }, title, timer), sub, timeupNote,
    h("div", { class: "session-overall" }, overallText, overallBar), live, h("div", { class: "session-stage" }, host),
    h("div", { class: "session-foot" }, endBtn));

  // End early while the box is running; Finish once the time is up or the drill is over.
  function setEnd() {
    const over = !!result || (performance.now() - t0) / 1000 >= sec;
    endBtn.className = result ? "btn primary" : "btn";
    endBtn.replaceChildren(...(over ? ["✓ ", ...bi("完成跟讀", "Finish shadowing")] : ["■ ", ...bi("提早結束", "End early")]));
  }
  function paint() {
    if (ended) return;
    flush();
    const el = (performance.now() - t0) / 1000;
    overallText.replaceChildren("總計 ", en("total"), ` ${mmss(el)} / ${mmss(sec)}`);
    overallBar.firstChild.style.width = pct(el / sec);
    const left = sec - el;
    timer.hidden = !!result;
    timer.classList.toggle("low", left <= 30);
    timeLeft.textContent = mmss(left);
    if (left <= 0 && !timeUpSaid && !result) {
      timeUpSaid = true;
      timeupNote.hidden = false;
      live.replaceChildren("時間到：做完這一輪就結束。", en(" Time's up: the block ends after this run."));
    }
    if (result) timeupNote.hidden = true;
    setEnd();
  }
  // The drill's result. A drill that ended by itself (time up after a run, or audio that could not play) stays on
  // screen with Finish ready; a stop goes straight on.
  function drillDone(res) {
    if (result) return;
    tick();
    result = res || {};
    ctl = null;
    if (ended || result.stopped) return;
    paint();
    live.replaceChildren(...(result.error === "audio" ? ["無法播放這一句。", en(" The line could not play.")] : ["跟讀結束。", en(" Shadowing over.")]));
    endBtn.focus({ preventScroll: true });
  }
  function finish() {
    if (ended) return;
    if (ctl && !result) ctl.stop(); // -> drillDone({stopped: true, ...the work so far}) right away
    ctl = null;
    flush(true);
    ended = true;
    clearInterval(timerId);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", flushAll);
    stopAll();
    const r = result || { stopped: true };
    const worked = (r.runs || 0) > 0 || !!r.recorded;
    const credit = worked ? Math.min(sec, spent) : 0;
    const done = worked && credit >= DONE_SHARE * sec - 1; // 1 s: the drill's clock and this one tick apart
    const minutes = Math.round(time.total / 6000) / 10;
    const summary = { done, early: !done && spent < sec - 1, minutes, at: Date.now(), runs: r.runs || 0, recorded: !!r.recorded,
      rating: r.rating || null, error: r.error === "audio" ? "audio" : null, key: line.item.key, line: line.item.zh,
      credit: tenths(credit / 60, Math.floor), planned: tenths(sec / 60) };
    const prev = todayEntry().shadow;
    if (done || !(prev && prev.done)) saveDay({ shadow: summary }); // a later run that falls short keeps today's "done"
    if (minutes > 0) {
      logShadowSession(minutes, { kind: "today", key: line.item.key, planned: tenths(sec / 60), lines: 1, takes: r.recorded ? 1 : 0,
        rating: r.rating || null, ...(FAST > 1 ? { fast: true } : {}) });
    }
    ui.running = false;
    for (const el of others) el.hidden = false;
    clear(card);
    card.classList.remove("running");
    card.append(shadowSummary(summary, { compact: false }), doseLine(),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn shadow-start", onclick: runShadow }, "↻ ", ...bi("再練一次", "Practise again"))));
    paintStats();
    startCard();
    paintRoutine();
    card.scrollIntoView({ block: "start", behavior: smooth() });
    $("#shadow-title").focus({ preventScroll: true });
  }

  const timerId = setInterval(paint, 250);
  try {
    ctl = shadowLine(host, line.item, { protocol: "full", timeLimit: sec, again: false, saveKey: line.item.key, onDone: drillDone });
  } catch (err) { // not expected: shadowLine reports a missing file in its own view
    console.error(err);
    result = { error: "error" };
    host.append(h("p", { class: "session-error", role: "alert" }, "跟讀沒有開始。", en(` Shadowing did not start: ${String((err && err.message) || err)}`)));
  }
  paint();
  card.scrollIntoView({ block: "start", behavior: smooth() });
  title.focus({ preventScroll: true });
}

// The block's result: the line, runs, the take, the self-rating; why it is not done yet when it is not.
function shadowSummary(sum, { compact }) {
  const none = (zh, e) => h("span", { class: "summary-val none" }, zh, " ", en(e));
  const val = (...kids) => h("span", { class: "summary-val" }, ...kids);
  const rated = RATING_NAMES[sum.rating];
  const rows = [
    ["輪數", "runs", sum.error === "audio" ? none("無法播放", "audio could not play")
      : sum.runs ? val(`${sum.runs} 輪 `, en(sum.runs === 1 ? "1 run" : `${sum.runs} runs`)) : none("沒做完一輪", "no full run")],
    ["錄音", "take", sum.recorded ? val("錄了 ", en("recorded")) : none("沒有錄音", "no take")],
    ["自評", "self-rating", rated ? val(rated[0], " ", en(rated[1])) : none("沒有", "none")],
  ];
  const list = h("ul", { class: "summary-list shadow-sum" }, rows.map(([zh, e, v]) => h("li", {}, h("span", {}, zh, " ", en(e, { class: "muted small" })), v)));
  if (compact) {
    return h("div", {}, h("p", { class: "session-done" }, "✓ 今天已完成 ", en(sum.minutes > 0 ? `Done today · ${sum.minutes} min` : "Done today")), list);
  }
  const head = sum.done ? ["✓ ", "今天的跟讀完成 ", en("Shadowing done for today")]
    : sum.early ? ["跟讀提早結束 ", en("Shadowing ended early")] : ["跟讀結束 ", en("Shadowing over")];
  const got = String(sum.credit || 0), planned = String(sum.planned), need = String(tenths(DONE_SHARE * sum.planned, Math.ceil));
  const rule = sum.done ? null : h("p", { class: "summary-rule" },
    `這次做到 ${planned} 分鐘裡的 ${got} 分鐘。至少做完一輪、做到 ${need} 分鐘（八成），今天才算完成。`,
    en(` Covered ${got} of ${planned} min. The block counts as done with at least one full run and ${need} min (80%).`));
  return h("div", { class: "session-summary" },
    h("h2", { id: "shadow-title", tabindex: "-1" }, head),
    sum.line ? h("p", { class: "summary-what shadow-sum-line", lang: "zh-Hant-TW" }, sum.line) : null,
    h("p", { class: "summary-meta" }, ...(sum.minutes > 0 ? [`${sum.minutes} 分鐘，已記入今天的時間。`, en(` ${sum.minutes} min, added to today's minutes.`)]
      : ["不到 0.1 分鐘，沒有記入時間。", en(" Under 0.1 min, so no time was logged.")])),
    rule, list);
}

// The weekly shadowing dose (§6.7: at least 4 × 10 min a week, with self-recording), next to the routine.
// Minutes as logged (0.1 min) below 10, whole minutes from 10.
const fmtDose = m => String(m < 10 ? Math.round(m * 10) / 10 : Math.round(m));
function doseLine() {
  const d = shadowDose();
  return h("p", { class: "muted small dose-inline" }, `本週跟讀 ${fmtDose(d.minutes)} / ${d.goalMinutes} 分鐘・10 分鐘以上 ${d.sessions} / ${d.goalSessions} 次。`,
    en(` This week: ${fmtDose(d.minutes)} of ${d.goalMinutes} min, ${d.sessions} of ${d.goalSessions} sessions of 10+ min.`));
}
function doseBox() {
  const { plan } = ui;
  const d = shadowDose();
  const dots = Array.from({ length: d.goalSessions }, (_, i) => h("i", { class: i < d.sessions ? "on" : "" }));
  const note = d.met ? ["✓ 這週的量做到了。", en(" This week's dose is done.")]
    : ["每週至少 4 次、每次 10 分鐘，並且錄音。", en(" The dose: at least 4 × 10 min a week, with self-recording (Foote & McDonough 2017)."),
      plan.shadow < 10 ? [` 今天的 ${fmtMin(plan.shadow)} 分鐘算進分鐘；完整的 10 分鐘練習在跟讀頁。`,
        en(` Today's ${fmtMin(plan.shadow)}-min block adds minutes; a full 10-min session is on the Shadowing page.`)] : null];
  return h("div", { class: "dose", role: "group", "aria-labelledby": "dose-title" },
    h("div", { class: "dose-head" },
      h("h3", { id: "dose-title" }, "本週跟讀 ", en("Shadowing this week")),
      BUILT.includes("shadow") ? h("a", { href: "shadow.html", class: "btn small dose-link" }, "跟讀頁 ", en("Shadowing page"), " →") : null),
    h("div", { class: "dose-row" }, h("span", { class: "k" }, "分鐘 ", en("minutes")),
      h("span", { class: "dose-bar", "aria-hidden": "true" }, h("i", { style: `width:${pct(d.minutes / d.goalMinutes)}` })),
      h("span", { class: "v" }, `${fmtDose(d.minutes)} / ${d.goalMinutes}`)),
    h("div", { class: "dose-row" }, h("span", { class: "k" }, "10 分鐘以上 ", en("sessions of 10+ min")),
      h("span", { class: "dose-dots", "aria-hidden": "true" }, dots),
      h("span", { class: "v" }, `${d.sessions} / ${d.goalSessions}`)),
    h("p", { class: "muted small dose-note" }, note));
}

// ------------------------------------------------------------------ the routine (§8.3)
function paintRoutine() {
  const { plan } = ui;
  const entry = todayEntry();
  // A block's Start goes up to its card and focuses that card's start button.
  const toCard = (card, sel) => () => {
    const b = card.querySelector(sel);
    card.scrollIntoView({ block: "start", behavior: smooth() });
    if (b) b.focus({ preventScroll: true });
  };
  const blocks = [
    { key: "pron", min: plan.pron, zh: "發音", en: "Pronunciation", done: !!(entry.pron && entry.pron.done), go: toCard(ui.els.session, ".session-start") },
    { key: "unit", min: plan.unit, zh: "單元", en: "Current unit", soon: true },
    { key: "shadow", min: plan.shadow, zh: "跟讀", en: "Shadowing", done: !!(entry.shadow && entry.shadow.done), go: toCard(ui.els.shadow, ".shadow-start"),
      none: !ui.picks.shadow },
    { key: "review", min: plan.review, zh: "複習", en: "Review", soon: true },
  ].filter(b => b.min > 0);
  const anki = h("input", { type: "checkbox", checked: !!entry.anki, onchange: e => saveDay({ anki: e.target.checked }) });
  // Rows without a control on the right let their name span both columns; a row's own control sits under its name.
  const rows = blocks.map(b => h("li", { class: b.soon ? "soon wide" : "" },
    h("span", { class: "rt-min" }, `${fmtMin(b.min)} 分`),
    h("span", { class: "rt-name" }, b.zh, " ", en(b.en, { class: "muted" }),
      b.soon ? h("span", { class: "rt-soon" }, "尚未建置 ", en("coming soon")) : null),
    b.soon ? null
      : b.done ? h("span", { class: "rt-status ok" }, "✓ 完成 ", en("done"))
        : b.none ? h("span", { class: "rt-status" }, "沒有資料 ", en("no data"))
          : h("button", { type: "button", class: "btn small", "aria-label": `開始 Start ↑ ${b.zh} ${b.en}`, onclick: b.go }, ...bi("開始", "Start"), " ↑")));
  rows.push(
    h("li", { class: "wide" }, h("span", { class: "rt-min" }, "課外"),
      h("label", { class: "check rt-name" }, anki, h("span", {}, en("Anki"), "（我的牌組）", en("my decks", { class: "muted" }))),
      h("button", { type: "button", class: "btn small rt-act", onclick: () => openOutside("anki") }, "＋ ", ...bi("記錄時間", "Log Anki time"))),
    h("li", { class: "wide" }, h("span", { class: "rt-min" }, "選做"),
      h("span", { class: "rt-name" }, "母語聽力 ", en("native listening (optional)", { class: "muted" })),
      h("button", { type: "button", class: "btn small rt-act", onclick: () => openOutside("tv") }, "＋ ", ...bi("記錄時間", "Log listening time"))));
  clear(ui.els.routine).append(
    h("div", { class: "session-head" }, h("h2", { id: "routine-title", style: "margin:0;font-size:19px" }, "今天的計畫 ", en("Today's routine")),
      h("span", { class: "session-mins" }, `${fmtMin(plan.daily)} 分鐘 `, en("min"))),
    h("div", { class: "timebar", "aria-hidden": "true" }, blocks.map(b => h("i", { class: `${b.soon ? "soon" : b.key}${b.done ? " done" : ""}`, style: `flex:${b.min}` }))),
    h("ul", { class: "routine" }, rows),
    plan.phase0 ? h("p", { class: "muted small", style: "margin:8px 0 0" }, "聲音重置期間發音多 5 分鐘，從單元時間撥出。", en(" During the sound reset, pronunciation gets 5 more minutes, taken from the unit box.")) : "", // "" not null: append() would print "null"
    doseBox());
}

// ------------------------------------------------------------------ outside time (§8.2)
let openOutside = () => {};
function outsideCard() {
  const sec = clear(ui.els.outside);
  const status = h("p", { class: "outside-status", "aria-live": "polite" });
  const todayLine = h("p", { class: "outside-today" });
  const minutes = h("input", { type: "number", id: "outside-min", inputmode: "numeric", min: "1", max: "600", step: "1", placeholder: "30", required: true });
  const radios = OUTSIDE.map(([k, zh, e], i) => h("label", { class: "chip" },
    h("input", { type: "radio", name: "outside-kind", value: k, checked: i === 0 }),
    h("span", {}, zh === e ? h("span", { lang: "en" }, e) : [zh, " ", en(e, { class: "muted small" })])));
  // The number is the visible label; the unit is screen-reader text, so the English keeps lang="en".
  const presets = [10, 15, 30, 60].map(m => h("button", { type: "button", class: "btn small preset", onclick: () => { minutes.value = String(m); minutes.focus(); } },
    m, h("span", { class: "sr-only" }, " 分鐘 ", en("minutes"))));
  const form = h("form", { class: "outside-form", id: "outside-form", hidden: true, novalidate: true, onsubmit: e => { e.preventDefault(); submit(); } },
    h("fieldset", {}, h("legend", {}, "種類 ", en("Kind")), h("div", { class: "chips" }, radios)),
    h("div", {}, h("label", { class: "lab", for: "outside-min" }, "分鐘 ", en("Minutes")), h("div", { class: "min-row" }, minutes, presets)),
    h("div", { class: "row" }, h("button", { type: "submit", class: "btn primary" }, ...bi("記錄", "Log")),
      h("button", { type: "button", class: "btn", onclick: () => setOpen(false) }, ...bi("取消", "Cancel"))));
  const toggle = h("button", { type: "button", class: "btn", "aria-expanded": "false", "aria-controls": "outside-form", onclick: () => setOpen(form.hidden) },
    "＋ ", ...bi("記錄課外時間", "Log outside time"));
  function setOpen(on) {
    form.hidden = !on;
    toggle.setAttribute("aria-expanded", String(on));
    if (on) { minutes.focus({ preventScroll: true }); form.scrollIntoView({ block: "nearest", behavior: smooth() }); }
  }
  function paintToday() {
    const day = (store.get("days", {}) || {})[today()] || {};
    const parts = OUTSIDE.map(([k, zh, e]) => [k, zh, e, Number(day[`outside:${k}`]) || 0]).filter(x => x[3] > 0);
    todayLine.replaceChildren(...(parts.length ? ["今天課外 ", en("Outside today"), "：",
      ...parts.flatMap(([, zh, e, m], i) => [i ? "・" : "", zh === e ? en(e) : zh, ` ${Math.round(m)} 分`])] : []));
  }
  function submit() {
    const m = Math.round(Number(minutes.value));
    if (!(m >= 1 && m <= 600)) {
      status.className = "outside-status bad";
      status.replaceChildren("請輸入 1 到 600 分鐘。", en(" Enter 1 to 600 minutes."));
      minutes.focus();
      return;
    }
    const kind = (radios.map(l => l.querySelector("input")).find(r => r.checked) || {}).value || "other";
    const entry = { date: today(), block: `outside:${kind}`, minutes: m };
    logMinutes(entry.block, m);
    const [, zh, e] = OUTSIDE.find(o => o[0] === kind) || OUTSIDE[OUTSIDE.length - 1];
    const undo = h("button", { type: "button", class: "btn small", onclick: () => {
      unlog(entry);
      status.className = "outside-status";
      status.replaceChildren("已復原。", en(" Undone."));
      paintStats(); paintToday();
      toggle.focus();
    } }, ...bi("復原", "Undo"));
    status.className = "outside-status";
    // Anki and Podcast have no Chinese name: the English sentence names them, so the Chinese part stops at the minutes
    status.replaceChildren(`已記錄 ${m} 分鐘${zh === e ? "" : `・${zh}`} `, en(`Logged ${m} min of ${e}.`), " ", undo);
    minutes.value = "";
    setOpen(false);
    paintStats(); paintToday();
    toggle.focus({ preventScroll: true });
  }
  openOutside = kind => {
    const r = radios.map(l => l.querySelector("input")).find(x => x.value === kind);
    if (r) r.checked = true;
    setOpen(true);
  };
  sec.append(h("div", { class: "outside-head" }, h("h2", { id: "outside-title" }, "課外時間 ", en("Outside time")), toggle),
    h("p", { class: "muted small", style: "margin:6px 0 0" }, en("Anki"), "、對話、電視、", en("Podcast"), " 都算，會加進本週分鐘。", en(" Anki, conversations, TV, podcasts: it all counts toward this week's minutes.")),
    form, status, todayLine);
  paintToday();
}

render().catch(err => { console.error(err); $("#app").append(h("p", { class: "feedback bad" }, "載入失敗 ", en(`Could not load: ${String(err && err.message || err)}`))); });
