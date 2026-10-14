// 注音 Zhuyin Lab: symbol chart, syllable grid, contrast drills (HVPT), dictation with the standard Zhuyin keyboard,
// and mouth guides. Tone/syllable audio here is MOE human audio only (MASTER_PROMPT §5.2, §7).
import { h, $, clear, mountShell, toast, store, loadJSON, pick, ruby, playButton, playMoe, stopAudio, stopRecorders, audioInfo,
  recordWidget, syllables, toneOf, baseOf, withTone, TONE_NAMES, TONE_GLYPH, INITIALS, trackTime } from "./app.js";
import { contrastDrill, contrastStats, recentAccuracy, focusContrasts } from "./drills.js";

mountShell("lab");
trackTime("lab");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

const TABS = [["chart", "符號表", "Symbols"], ["grid", "音節表", "Syllables"], ["contrasts", "對比練習", "Contrasts"], ["dictation", "聽寫", "Dictation"], ["mouth", "口型", "Mouth"]];
const app = $("#app");
let data = {};
let teardown = null; // undoes the current view's document-level listeners

// Call before a view's panel is cleared: drops its listeners and stops audio and recording.
function leaveView() {
  teardown?.();
  teardown = null;
  stopAudio();
}

// English text whose Zhuyin/Chinese runs stay lang="zh-Hant-TW" (ground rule 2).
const ZH_RUN = /([\p{sc=Han}\p{sc=Bopomofo}ˇˊˋ˙]+(?:\s+[\p{sc=Han}\p{sc=Bopomofo}ˇˊˋ˙]+)*)/u;
const enText = (text, attrs = {}) => h("span", { lang: "en", ...attrs }, String(text).split(ZH_RUN).map((part, i) => i % 2 ? h("span", { lang: "zh-Hant-TW" }, part) : part));
// "中文 English" label: the Chinese stays in the page language, the English gets lang="en"
const bi = (zh, en) => [zh, " ", enText(en)];

async function main() {
  const [symbols, grid, contrasts, audio] = await Promise.all([loadJSON("symbols"), loadJSON("syllables"), loadJSON("contrasts"), loadJSON("audio")]);
  data = { symbols, grid, contrasts, audio };
  clear(app);
  app.append(h("div", { class: "page-head" }, h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "注音實驗室"), h("span", { class: "en", lang: "en" }, "Zhuyin Lab")),
    h("p", { class: "muted small", style: "margin:0" }, "符號、音節、聲調的聲音都是教育部真人錄音（標示 MOE）。", h("span", { lang: "en" }, "Symbol, syllable and tone audio here is MOE human audio; nothing synthetic."))));
  // ARIA tabs pattern: one shared panel, roving tabindex, arrows/Home/End move and activate.
  const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "注音實驗室 Zhuyin Lab" });
  const panel = h("section", { role: "tabpanel", id: "lab-panel", tabindex: "0" });
  const show = id => {
    for (const b of tabs.children) {
      const on = b.dataset.id === id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    panel.setAttribute("aria-labelledby", `tab-${id}`);
    leaveView();
    clear(panel);
    history.replaceState(null, "", "#" + id);
    ({ chart: renderChart, grid: renderGrid, contrasts: renderContrasts, dictation: renderDictation, mouth: renderMouth })[id](panel);
  };
  for (const [id, zh, en] of TABS) {
    tabs.append(h("button", { type: "button", role: "tab", id: `tab-${id}`, "aria-controls": "lab-panel", "data-id": id, "aria-selected": "false", tabindex: "-1", onclick: () => show(id) },
      zh, " ", h("span", { class: "muted small", lang: "en" }, en)));
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
  show(TABS.some(t => t[0] === start) ? start : "chart");
  window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (TABS.some(t => t[0] === id) && tabs.querySelector(`[data-id="${id}"]`).getAttribute("aria-selected") !== "true") show(id); });
}

// ------------------------------------------------------------------ 1. symbol chart
function renderChart(panel) {
  const { symbols } = data;
  const byId = Object.fromEntries(symbols.symbols.map(s => [s.symbol, s]));
  let open = null;
  for (const g of symbols.groups) {
    const detail = h("div");
    const chart = h("div", { class: "chart" });
    for (const sym of g.symbols) {
      const s = byId[sym];
      const btn = h("button", { type: "button", class: "sym", "aria-pressed": "false", "aria-label": `${s.symbol} ${s.ipa}`, lang: "zh-Hant-TW",
        onclick: () => {
          const same = open === btn;
          if (open) stopAudio(); // releases the open detail's audio and any recording in progress
          document.querySelectorAll(".sym[aria-pressed='true']").forEach(b => b.setAttribute("aria-pressed", "false"));
          document.querySelectorAll(".detail").forEach(d => d.remove());
          open = null;
          if (same) return;
          btn.setAttribute("aria-pressed", "true"); open = btn;
          detail.append(symbolDetail(s));
          detail.firstChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } }, h("span", { class: "glyph" }, s.symbol), h("span", { class: "ipa" }, s.ipa));
      chart.append(btn);
    }
    panel.append(h("div", { class: "chart-group" }, h("h3", {}, h("span", { lang: "zh-Hant-TW" }, g.zh), enText(g.en, { class: "en" })), chart, detail));
  }
}

function symbolDetail(s) {
  const d = h("div", { class: "detail", lang: "zh-Hant-TW" });
  d.append(h("div", { class: "head" }, h("span", { class: "glyph" }, s.symbol), h("span", { class: "ipa" }, "[", s.ipa, "]"),
    h("span", { style: "margin-left:auto" }, playButton({ audio: s.audio, zh: s.symbol }, { label: "🔊 符號" }))));
  // dt labels stay zh-Hant-TW (inherited) with an English half; empty fields render nothing.
  const kv = h("dl", { class: "kv" });
  for (const [key, zh, en] of [["how", "怎麼發", "How"], ["error", "常見錯誤", "Typical error"], ["notes", "注意", "Note"]]) {
    if (s[key]?.trim()) kv.append(h("dt", {}, zh, " ", h("span", { lang: "en" }, en)), h("dd", {}, enText(s[key])));
  }
  if (kv.children.length) d.append(kv);
  const ex = h("div", { class: "examples" });
  for (const e of s.examples) {
    ex.append(h("div", { class: "example" }, ruby(e.zh, e.zhuyin), h("span", { class: "en", lang: "en" }, e.en), playButton(e)));
  }
  d.append(h("h3", { style: "margin-top:14px" }, bi("例詞", "Examples")), ex);
  d.append(h("div", { class: "row", style: "margin-top:12px" }, h("span", { class: "muted small" }, ...bi("先聽符號，再錄自己的：", "Listen, then record yourself:")), recordWidget({ key: `sym:${s.symbol}` })));
  return d;
}

// ------------------------------------------------------------------ 2. syllable grid
// The build marks a tone cell common:false when no common character has that reading (§5.2: grey it out).
// Rare cells stay playable: grey text with a dashed border in every view. "No recording" is faded with "—"
// (or a hatched table cell) and solid, so the two states never look alike.
const isCommon = c => c.common !== false;
const hasCommon = cell => Object.values(cell).some(isCommon);
const RARE_STYLE = "color:var(--muted);border-style:dashed"; // .sym / .tone-cell keep their own border colour (hover, pressed)
const RARE_TABLE_STYLE = "color:var(--muted);border:1px dashed var(--muted)"; // table buttons have no border of their own

function renderGrid(panel) {
  const { grid } = data;
  const cells = grid.cells;
  const finals = grid.finals;
  const initials = grid.initials;
  const sel = h("div");
  const toneRow = h("div");
  const mode = store.get("lab.gridMode", "picker");
  const seg = h("div", { class: "seg", role: "group", "aria-label": "view" },
    h("button", { type: "button", "aria-pressed": String(mode === "picker"), onclick: () => { store.set("lab.gridMode", "picker"); leaveView(); renderGrid(clear(panel)); } }, "挑選 Pick"),
    h("button", { type: "button", "aria-pressed": String(mode === "table"), onclick: () => { store.set("lab.gridMode", "table"); leaveView(); renderGrid(clear(panel)); } }, "表格 Table"));
  panel.append(h("div", { class: "row", style: "justify-content:space-between" },
    h("p", { class: "muted small", style: "margin:0;max-width:60ch" }, `${grid.counts.toned} 個有聲音節 `, h("span", { lang: "en" }, "syllable-tone combinations with an MOE recording."),
      " 點一格，再點聲調。灰字虛線＝沒有常用字（仍可播放）；淡色「—」或斜線格＝沒有教育部錄音（不能播放）。",
      h("span", { lang: "en" }, "Tap a syllable, then a tone. Grey text, dashed border = no common character (still plays); faded — or hatched = no MOE recording (nothing to play).")), seg));

  const showTones = base => {
    stopAudio(); // the tone row about to go may hold a playing cell or a recording in progress
    clear(toneRow);
    const cell = cells[base] || {};
    toneRow.append(h("h3", { style: "margin-top:14px" }, h("span", { class: "zhuyin", lang: "zh-Hant-TW", style: "font-size:26px" }, base)));
    const row = h("div", { class: "tone-row" });
    for (let t = 1; t <= 5; t++) {
      const c = cell[String(t)];
      const syl = withTone(base, t);
      // No single-character MOE clip for this tone (the syllable may still be common, e.g. 個 ˙ㄍㄜ).
      if (!c) { row.append(h("div", { class: "tone-cell empty", style: "border-style:solid", "aria-disabled": "true" }, h("span", { class: "t" }, syl), h("span", { class: "c" }, "—"), h("span", { class: "l" }, "無錄音 ", h("span", { lang: "en" }, "no clip")))); continue; }
      const rare = !isCommon(c);
      const btn = h("button", { type: "button", class: "tone-cell", lang: "zh-Hant-TW", style: rare ? RARE_STYLE : null, "aria-label": `${syl} ${c.zh} ${TONE_NAMES[t]}${rare ? " 少用字 rare" : ""} MOE`, onclick: async () => {
        stopRecorders(); // end a take before the model plays, so it is not recorded into it
        btn.classList.add("is-playing");
        try { await playMoe(c.id); } catch { toast("還沒有這個音檔 clip not built yet"); }
        btn.classList.remove("is-playing");
        detail(base, t, c);
      } }, h("span", { class: "t" }, syl), h("span", { class: "c" }, c.zh), h("span", { class: "l" }, TONE_NAMES[t], c.level ? ` · ${c.level.replace("第", "L").replace("級", "")}` : "", rare ? " · 少用" : ""));
      row.append(btn);
    }
    toneRow.append(row, h("p", { class: "muted small", style: "margin:8px 0 0" }, ...bi("每格播放該字的教育部真人錄音（只播詞頭）。", "Each cell plays the MOE announcer saying that character (headword span only).")));
    const detailBox = h("div");
    toneRow.append(detailBox);
    function detail(base, t, c) {
      stopRecorders(); // not stopAudio(): a cell tapped meanwhile may already be playing
      clear(detailBox);
      const syl = withTone(base, t);
      detailBox.append(h("div", { class: "card", style: "margin-top:12px" },
        h("div", { class: "row" }, h("span", { class: "big-zh", lang: "zh-Hant-TW" }, ruby(c.zh, syl, { cls: "" })), playButton({ id: c.id, zh: c.zh }),
          h("span", { class: "muted small" }, c.alts?.length ? "其他字 also: " + c.alts.join("、") : "")),
        h("div", { class: "row", style: "margin-top:8px" }, h("span", { class: "muted small" }, ...bi("跟著說，錄下來比較", "Say it after the model, record and compare:")), recordWidget({ key: `syl:${syl}` }))));
    }
    toneRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  if (mode === "table") {
    const table = h("table", { class: "grid", lang: "zh-Hant-TW" });
    const head = h("tr", {}, h("th", { scope: "col" }, "聲母＼韻母"));
    for (const f of finals) head.append(h("th", { scope: "col" }, f || "ㄭ"));
    table.append(h("thead", {}, head));
    const body = h("tbody");
    for (const ini of initials) {
      const tr = h("tr", {}, h("td", { scope: "row" }, ini || "∅"));
      for (const f of finals) {
        const base = ini + f;
        if (!cells[base] || !base) { tr.append(h("td", { class: "empty" })); continue; }
        const rare = !hasCommon(cells[base]);
        tr.append(h("td", {}, h("button", { type: "button", "aria-label": base + (rare ? " 少用字 rare" : ""), style: rare ? RARE_TABLE_STYLE : null, "aria-pressed": "false", onclick: e => { table.querySelectorAll("[aria-pressed='true']").forEach(b => b.setAttribute("aria-pressed", "false")); e.currentTarget.setAttribute("aria-pressed", "true"); showTones(base); } }, base)));
      }
      body.append(tr);
    }
    table.append(body);
    panel.append(h("div", { class: "grid-wrap", style: "margin-top:12px" }, table), toneRow);
    return;
  }

  // picker: initial chips → final tiles → tones
  const chips = h("div", { class: "row", style: "margin:12px 0 8px;gap:6px", role: "group", "aria-label": "聲母 initial" });
  const tiles = h("div", { class: "chart", style: "grid-template-columns:repeat(auto-fill,minmax(64px,1fr))" });
  let currentIni = store.get("lab.gridIni", "ㄇ");
  const pickIni = ini => {
    currentIni = ini; store.set("lab.gridIni", ini);
    for (const b of chips.children) b.setAttribute("aria-pressed", b.dataset.ini === ini ? "true" : "false");
    stopAudio(); clear(tiles); clear(toneRow);
    for (const f of finals) {
      const base = ini + f;
      if (!base) continue;
      const c = cells[base];
      const n = c ? Object.keys(c).length : 0;
      const rare = n && !hasCommon(c);
      tiles.append(h("button", { type: "button", class: "sym", disabled: !c, lang: "zh-Hant-TW", "aria-label": `${base}${c ? (rare ? " 少用字 rare" : "") : " 無錄音 no MOE recording"}`, style: n ? (rare ? RARE_STYLE : "") : "opacity:.35",
        onclick: e => { tiles.querySelectorAll("[aria-pressed='true']").forEach(b => b.setAttribute("aria-pressed", "false")); e.currentTarget.setAttribute("aria-pressed", "true"); showTones(base); },
        "aria-pressed": "false" }, h("span", { class: "glyph", style: "font-size:24px" }, base), h("span", { class: "ipa" }, n ? `${n} 聲` : "—")));
    }
  };
  for (const ini of initials) chips.append(h("button", { type: "button", class: "btn small", "data-ini": ini, "aria-pressed": "false", lang: "zh-Hant-TW", onclick: () => pickIni(ini) }, ini || "∅ 零聲母"));
  panel.append(chips, tiles, toneRow);
  pickIni(initials.includes(currentIni) ? currentIni : "ㄇ");
}

// ------------------------------------------------------------------ 3. contrast drills (listening only; feedback + A/B replay)
// The drill itself is drills.js contrastDrill (shared with Today); its stats stay under "lab.contrasts".
const statFor = id => contrastStats()[id] || { n: 0, correct: 0, recent: [], days: {} };

// focusId: back from that contrast's drill, its row takes focus (the Back button that had it is gone).
function renderContrasts(panel, focusId = null) {
  const { contrasts } = data;
  panel.append(h("p", { class: "muted small" }, "聽一個詞，選你聽到的。只用聽的，不要跟著唸（聽與說分開練習，", enText("Baese-Berk & Samuel 2016"), "）。", enText("Listen and choose; immediate feedback with A/B replay. Keep this block listening-only. Weak contrasts come back automatically.")));
  const list = h("div", { class: "contrast-list" });
  const focus = focusContrasts(); // the daily focus (drills.js): joins below 80% recent accuracy, leaves at 85%
  for (const c of contrasts) {
    const s = statFor(c.id); const acc = recentAccuracy(s); const inFocus = !!focus[c.id];
    list.append(h("div", { class: "card", style: "padding:8px 12px" }, h("button", { type: "button", class: "btn", style: "border:0;background:none;padding:8px 0", "data-id": c.id, onclick: () => startDrill(panel, c),
      "aria-label": `${c.rank}. ${c.zh} ${c.en}, accuracy ${acc == null ? "none yet" : acc + "%"}${inFocus ? ", 每日重點 in the daily focus" : ""}` },
      h("span", {}, h("span", { class: "muted" }, c.rank, ". "), h("span", { lang: "zh-Hant-TW", style: "font-size:19px" }, c.zh), " ", enText(c.en, { class: "muted small" })),
      h("span", { class: inFocus ? "small contrast-focus" : "small" }, acc == null ? "尚未練習" : `${acc}%`, inFocus ? [" · 每日重點 ", enText("daily focus")] : "", h("span", { class: "muted" }, s.n ? ` · ${s.n} 題` : "")))));
  }
  panel.append(list,
    h("p", { class: "muted small" }, ...bi("最近正確率低於 80%（至少 5 題）的對比會加入每日重點，到 85% 才離開；「今天」練重點裡最弱的一組。", "A contrast joins the daily focus when its recent accuracy is below 80% (at least 5 recent trials) and stays until it reaches 85%; Today drills the weakest one in focus.")),
    // the same words as the drill's one-voice note (drills.js voiceNote, shown in Today's listening step)
    h("p", { class: "muted small" }, ...bi("目前只有一位真人聲音（教育部播音員）；有更多臺灣錄音後，正確率超過 70% 會混合不同的聲音。",
      "One human voice so far (the MOE announcer). When more Taiwan recordings exist, voices are mixed once you pass 70%.")));
  const row = focusId != null && [...list.querySelectorAll("button[data-id]")].find(b => b.dataset.id === String(focusId));
  if (row) row.focus();
}

// A contrast drill under its title and Back button. Leaving the tab (leaveView: stopAudio + clear) ends the drill:
// it notices its view is gone. The end card's "Another round" restarts it in place; "Back" returns to the list.
function startDrill(panel, c) {
  clear(panel);
  const backToList = () => { stopAudio(); renderContrasts(clear(panel), c.id); };
  const head = h("div", { class: "row", style: "justify-content:space-between" }, h("h2", { style: "margin:0" }, h("span", { lang: "zh-Hant-TW" }, c.zh), " ", enText(c.en, { class: "muted small" })),
    h("button", { type: "button", class: "btn", onclick: backToList }, "← ", ...bi("回列表", "Back"))); // a full-size target (44 px), like the end card's
  const box = h("div");
  panel.append(head, box);
  contrastDrill(box, c, { n: 10, again: true, actions: () => [h("button", { type: "button", class: "btn", onclick: backToList }, ...bi("回列表", "Back"))] });
}

// ------------------------------------------------------------------ 4. dictation with the standard Zhuyin keyboard
const KEY_ROWS = [
  [["1", "ㄅ"], ["2", "ㄉ"], ["3", "ˇ"], ["4", "ˋ"], ["5", "ㄓ"], ["6", "ˊ"], ["7", "˙"], ["8", "ㄚ"], ["9", "ㄞ"], ["0", "ㄢ"], ["-", "ㄦ"]],
  [["q", "ㄆ"], ["w", "ㄊ"], ["e", "ㄍ"], ["r", "ㄐ"], ["t", "ㄔ"], ["y", "ㄗ"], ["u", "ㄧ"], ["i", "ㄛ"], ["o", "ㄟ"], ["p", "ㄣ"]],
  [["a", "ㄇ"], ["s", "ㄋ"], ["d", "ㄎ"], ["f", "ㄑ"], ["g", "ㄕ"], ["h", "ㄘ"], ["j", "ㄨ"], ["k", "ㄜ"], ["l", "ㄠ"], [";", "ㄤ"]],
  [["z", "ㄈ"], ["x", "ㄌ"], ["c", "ㄏ"], ["v", "ㄒ"], ["b", "ㄖ"], ["n", "ㄙ"], ["m", "ㄩ"], [",", "ㄝ"], [".", "ㄡ"], ["/", "ㄥ"]],
];
const KEYMAP = Object.fromEntries(KEY_ROWS.flat());
const DICT_KEY = "lab.dictation";

function renderDictation(panel) {
  const { grid, contrasts } = data;
  const hasClip = id => !!(id && audioInfo(id)); // only items whose MOE clip was published
  const sylItems = [];
  for (const [base, cell] of Object.entries(grid.cells)) for (const [t, c] of Object.entries(cell)) if (hasClip(c.id)) sylItems.push({ zh: c.zh, zhuyin: withTone(base, Number(t)), id: c.id });
  const wordItems = contrasts.flatMap(c => c.sets.flat()).filter(w => hasClip(w.id) && syllables(w.zhuyin).length >= 2);
  const mode = store.get("lab.dictMode", "syl");
  const pool = mode === "word" ? wordItems : sylItems;
  const stats = store.get(DICT_KEY, { n: 0, correct: 0, parts: {} });
  const setMode = m => { store.set("lab.dictMode", m); leaveView(); renderDictation(clear(panel)); };
  const seg = h("div", { class: "seg" },
    h("button", { type: "button", "aria-pressed": String(mode !== "word"), onclick: () => setMode("syl") }, "單音節 Syllables"),
    h("button", { type: "button", "aria-pressed": String(mode === "word"), onclick: () => setMode("word") }, "詞 Words"));
  panel.append(h("div", { class: "row", style: "justify-content:space-between" }, h("p", { class: "muted small", style: "margin:0;max-width:56ch" }, "聽，然後用標準注音鍵盤打出注音和聲調（空白鍵＝一聲，6 ˊ 3 ˇ 4 ˋ 7 ˙）。", h("span", { lang: "en" }, "Hear it, type the Zhuyin and tone. Physical keys follow the standard layout.")), seg),
    h("p", { class: "stat-row" }, h("span", {}, "累計 ", h("b", {}, stats.n), " 題"), h("span", {}, "正確 ", h("b", {}, stats.n ? Math.round(100 * stats.correct / stats.n) : 0, "%")),
      Object.keys(stats.parts).length ? h("span", {}, "常錯 weak: ", h("b", {}, Object.entries(stats.parts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ×${v}`).join("、"))) : null));
  // The stage is the typing area: physical keys type while it (or the page body) has focus.
  // After a mouse/touch click on one of its buttons (detail > 0; keyboard clicks have 0) focus returns
  // to the stage, so Space and Enter keep typing instead of re-pressing that button.
  const stage = h("div", { tabindex: "0", role: "group", "aria-label": "聽寫作答 Dictation: type the Zhuyin, Enter to check",
    onclick: e => { if (e.detail && e.target.closest("button")) stage.focus({ preventScroll: true }); } });
  panel.append(stage);
  if (!pool.length) { stage.append(h("p", {}, ...bi("還沒有可用的音檔。", "No clips built yet."))); return; }

  let item, typed = [], buf = "", answered = false;
  const target = h("div", { class: "dict-target", lang: "zh-Hant-TW" });
  const fb = h("p", { class: "feedback", "aria-live": "polite", "aria-atomic": "true" }); // verdict and Show answer are announced; keystrokes are not
  const playBtn = h("button", { type: "button", class: "btn primary", onclick: () => playMoe(item.id).catch(() => toast("音檔尚未建置 clip not built yet")) }, "🔊 ", ...bi("播放", "Play"));
  const nextBtn = h("button", { type: "button", class: "btn", onclick: newItem }, ...bi("下一題", "Next →"));
  const showBtn = h("button", { type: "button", class: "btn small", onclick: () => { fb.textContent = `${item.zh} ${item.zhuyin}`; fb.className = "feedback muted"; } }, ...bi("看答案", "Show"));

  function draw() {
    clear(target);
    if (!answered) { target.textContent = [...typed, buf].join(" ") || " "; return; }
  }
  function input(ch) {
    if (answered) return;
    if ("ˊˇˋ".includes(ch)) { if (buf) { typed.push(buf + ch); buf = ""; } }
    else if (ch === "˙") { buf = buf.startsWith("˙") ? buf.slice(1) : "˙" + buf; if (buf.length > 1) { typed.push(buf); buf = ""; } }
    else if (ch === " ") { if (buf) { typed.push(buf); buf = ""; } }
    else buf += ch;
    draw();
  }
  function backspace() { if (answered) return; if (buf) buf = buf.slice(0, -1); else typed.pop(); draw(); }
  function check() {
    if (answered) return;
    if (buf) { typed.push(buf); buf = ""; }
    answered = true;
    const want = syllables(item.zhuyin);
    const got = typed.slice();
    let ok = true;
    const parts = {};
    clear(target);
    want.forEach((w, k) => {
      const g = got[k] || "";
      if (k) target.append(" ");
      const wb = baseOf(w), gb = baseOf(g), wt = toneOf(w), gt = toneOf(g || "ㄚ");
      if (g === w) { target.append(h("span", { class: "ok" }, w)); return; }
      ok = false;
      const span = h("span", { class: "miss", title: `你打的 you typed: ${g || "—"}` }, w, h("span", { class: "muted small" }, ` (${g || "—"})`));
      target.append(span);
      if (wb !== gb) {
        const [wi, wm, wf] = splitBase(wb), [gi, gm, gf] = splitBase(gb);
        if (wi !== gi) parts[`${wi || "∅"}≠${gi || "∅"}`] = 1;
        if (wm !== gm) parts[`${wm || "∅"}≠${gm || "∅"}`] = 1;
        if (wf !== gf) parts[`${wf || "∅"}≠${gf || "∅"}`] = 1;
      }
      if (wt !== gt) parts[`${TONE_GLYPH[wt]}≠${TONE_GLYPH[gt]}`] = 1;
    });
    if (got.length > want.length) ok = false;
    const s = store.get(DICT_KEY, { n: 0, correct: 0, parts: {} });
    s.n++; if (ok) s.correct++;
    for (const p of Object.keys(parts)) s.parts[p] = (s.parts[p] || 0) + 1;
    store.set(DICT_KEY, s);
    fb.textContent = ok ? `對了 ✓ ${item.zh} ${item.zhuyin}` : `不對 ✗ 正確是 ${item.zh} ${item.zhuyin} — 紅色是錯的部分 red = what differs`;
    fb.className = "feedback " + (ok ? "good" : "bad");
    nextBtn.classList.add("primary"); nextBtn.focus(); // text first, so the live region speaks after the focus change
  }
  function newItem() {
    item = pick(pool);
    typed = []; buf = ""; answered = false; fb.textContent = ""; fb.className = "feedback"; nextBtn.classList.remove("primary");
    draw();
    playMoe(item.id).catch(() => toast("音檔尚未建置 clip not built yet"));
  }
  const kbd = h("div", { class: "kbd", role: "group", "aria-label": "標準注音鍵盤 Standard Zhuyin keyboard" });
  KEY_ROWS.forEach((row, r) => kbd.append(h("div", { class: `kbd-row r${r + 1}` }, row.map(([k, z]) => h("button", { type: "button", class: "key" + ("ˊˇˋ˙".includes(z) ? " tone" : ""), lang: "zh-Hant-TW", "aria-label": z, onclick: () => input(z) }, z, h("small", {}, k))))));
  kbd.append(h("div", { class: "kbd-bottom" }, h("button", { type: "button", class: "key", onclick: backspace, "aria-label": "刪除 Backspace" }, "⌫"),
    h("button", { type: "button", class: "key tone", onclick: () => input(" ") }, "一聲 ␣ Tone 1 / next syllable"), h("button", { type: "button", class: "key", onclick: check }, "檢查 ↵")));
  stage.append(h("div", { class: "row" }, playBtn, showBtn, nextBtn), target, fb, kbd);
  // Physical keys. Enter/Space act only when the stage, the panel or the page body has focus, so a focused button keeps
  // its own Enter/Space. Zhuyin keys and Backspace typed on another lab control move focus to the stage first.
  // Nav bars, dialogs and text fields are never touched.
  const onKey = e => {
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    const free = el === stage || el === panel || el === document.body || el === document.documentElement;
    if (!free && (!app.contains(el) || el.closest("input, textarea, select, [contenteditable]"))) return;
    if (e.key === "Enter" || e.key === " ") {
      if (!free) return;
      e.preventDefault();
      if (e.key === " ") input(" "); else if (answered) newItem(); else check();
      return;
    }
    const z = e.key === "Backspace" ? e.key : KEYMAP[e.key?.toLowerCase()];
    if (!z) return;
    e.preventDefault();
    if (!free) stage.focus({ preventScroll: true });
    if (z === "Backspace") backspace(); else input(z);
  };
  teardown?.();
  document.addEventListener("keydown", onKey);
  teardown = () => document.removeEventListener("keydown", onKey);
  newItem();
}
function splitBase(b) {
  let i = 0, ini = "", med = "";
  if (b[0] && INITIALS.includes(b[0])) { ini = b[0]; i = 1; }
  if (b[i] && "ㄧㄨㄩ".includes(b[i])) { med = b[i]; i++; }
  return [ini, med, b.slice(i)];
}

// ------------------------------------------------------------------ 5. mouth guides (schematic side views)
function mouthSVG({ tongue, tip, lips = "neutral", mark }) {
  // Side view, facing left. Schematic: lips, teeth, alveolar ridge, hard palate, soft palate; tongue as a filled curve.
  const palate = "M60 70 C 90 40, 150 30, 210 42 C 240 48, 262 58, 272 72";
  const lipShape = lips === "round" ? "M38 92 C 30 100, 30 118, 38 126" : lips === "spread" ? "M34 100 C 28 106, 28 112, 34 118" : "M36 96 C 30 104, 30 116, 36 122";
  return `<svg viewBox="0 0 300 200" role="img" aria-label="mouth diagram" xmlns="http://www.w3.org/2000/svg">
  <path d="${palate}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path d="M272 72 C 282 90, 278 110, 268 118" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>
  <path d="M60 70 L 56 104" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path d="M62 150 L 60 118" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path d="${lipShape}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path d="${tongue}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>
  ${tip ? `<circle cx="${tip[0]}" cy="${tip[1]}" r="6" fill="var(--bad)"/>` : ""}
  <text x="70" y="36" font-size="11" fill="currentColor" opacity=".7">硬顎 hard palate</text>
  <text x="222" y="40" font-size="11" fill="currentColor" opacity=".7">軟顎 soft</text>
  <text x="40" y="146" font-size="11" fill="currentColor" opacity=".7">齒 teeth</text>
  ${mark ? `<text x="${mark[0]}" y="${mark[1]}" font-size="12" fill="var(--bad)">${mark[2]}</text>` : ""}
</svg>`;
}
function renderMouth(panel) {
  panel.append(h("p", { class: "muted small" }, "側面示意圖（簡化，不按比例）。紅點＝舌頭接觸或最接近的位置。Schematic side views; the red dot marks where the tongue touches or comes closest."));
  const figs = [
    { zh: "ㄐ ㄑ ㄒ", en: "tongue tip DOWN behind the lower teeth, blade up to the hard palate, lips spread", lips: "spread",
      tongue: "M70 150 C 72 128, 100 100, 130 72 C 170 60, 220 90, 260 140 L 265 165 L 72 165 Z", tip: [72, 148], mark: [120, 60, "舌面 blade ↑"] },
    { zh: "ㄓ ㄔ ㄕ ㄖ", en: "tongue tip UP, curled just behind the gum ridge; lips neutral", lips: "neutral",
      tongue: "M66 92 C 78 78, 96 96, 110 120 C 150 118, 210 110, 262 140 L 266 165 L 74 165 Z", tip: [72, 84], mark: [84, 62, "舌尖 tip ↑"] },
    { zh: "ㄗ ㄘ ㄙ", en: "tongue tip at the back of the upper teeth; a flat blade, lips neutral", lips: "neutral",
      tongue: "M62 104 C 80 100, 100 110, 120 122 C 170 118, 220 112, 262 142 L 266 165 L 70 165 Z", tip: [60, 102], mark: [76, 96, "舌尖 at teeth"] },
    { zh: "ㄩ", en: "tongue as for ㄧ (high, front), then ROUND the lips without moving the tongue", lips: "round",
      tongue: "M72 150 C 76 120, 110 86, 150 78 C 200 76, 240 104, 262 142 L 266 165 L 74 165 Z", tip: null, mark: [18, 160, "圓唇 round"] },
  ];
  const grid = h("div", { class: "mouth-grid" });
  for (const f of figs) grid.append(h("figure", { html: mouthSVG(f) }, h("figcaption", {}, h("b", { lang: "zh-Hant-TW" }, f.zh), " — ", enText(f.en))));
  panel.append(grid);
}

main().catch(err => { app.append(h("p", { class: "feedback bad" }, "載入失敗 Could not load data: ", err.message)); console.error(err); });
