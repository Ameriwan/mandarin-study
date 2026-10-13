// 注音 Zhuyin Lab: symbol chart, syllable grid, contrast drills (HVPT), dictation with the standard Zhuyin keyboard,
// and mouth guides. Tone/syllable audio here is MOE human audio only (MASTER_PROMPT §5.2, §7).
import { h, $, clear, mountShell, toast, store, loadJSON, shuffle, pick, ruby, playButton, playMoe, stopAudio, audioInfo,
  recordWidget, syllables, toneOf, baseOf, withTone, TONE_NAMES, TONE_GLYPH, INITIALS, trackTime } from "./app.js";

mountShell("lab");
trackTime("lab");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

const TABS = [["chart", "符號表", "Symbols"], ["grid", "音節表", "Syllables"], ["contrasts", "對比練習", "Contrasts"], ["dictation", "聽寫", "Dictation"], ["mouth", "口型", "Mouth"]];
const app = $("#app");
let data = {};

async function main() {
  const [symbols, grid, contrasts, audio] = await Promise.all([loadJSON("symbols"), loadJSON("syllables"), loadJSON("contrasts"), loadJSON("audio")]);
  data = { symbols, grid, contrasts, audio };
  clear(app);
  app.append(h("div", { class: "page-head" }, h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "注音實驗室"), h("span", { class: "en" }, "Zhuyin Lab")),
    h("p", { class: "muted small", style: "margin:0" }, "符號、音節、聲調的聲音都是教育部真人錄音（標示 MOE）。Symbol, syllable and tone audio here is MOE human audio; nothing synthetic.")));
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const panel = h("section", { role: "tabpanel" });
  const show = id => {
    for (const b of tabs.children) b.setAttribute("aria-selected", b.dataset.id === id ? "true" : "false");
    stopAudio();
    clear(panel);
    history.replaceState(null, "", "#" + id);
    ({ chart: renderChart, grid: renderGrid, contrasts: renderContrasts, dictation: renderDictation, mouth: renderMouth })[id](panel);
  };
  for (const [id, zh, en] of TABS) tabs.append(h("button", { type: "button", role: "tab", "data-id": id, "aria-selected": "false", onclick: () => show(id) }, zh, " ", h("span", { class: "muted small" }, en)));
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
    panel.append(h("div", { class: "chart-group" }, h("h3", {}, h("span", { lang: "zh-Hant-TW" }, g.zh), h("span", { class: "en" }, g.en)), chart, detail));
  }
}

function symbolDetail(s) {
  const d = h("div", { class: "detail", lang: "zh-Hant-TW" });
  d.append(h("div", { class: "head" }, h("span", { class: "glyph" }, s.symbol), h("span", { class: "ipa" }, "[", s.ipa, "]"),
    h("span", { style: "margin-left:auto" }, playButton({ audio: s.audio, zh: s.symbol }, { label: "🔊 符號" }))));
  const kv = h("dl", { class: "kv", lang: "en" });
  kv.append(h("dt", {}, "怎麼發 How"), h("dd", {}, s.how));
  if (s.error) kv.append(h("dt", {}, "常見錯誤 Typical error"), h("dd", {}, s.error));
  if (s.notes) kv.append(h("dt", {}, "注意 Note"), h("dd", {}, s.notes));
  d.append(kv);
  const ex = h("div", { class: "examples" });
  for (const e of s.examples) {
    ex.append(h("div", { class: "example" }, ruby(e.zh, e.zhuyin), h("span", { class: "en", lang: "en" }, e.en), playButton(e)));
  }
  d.append(h("h3", { style: "margin-top:14px" }, "例詞 Examples"), ex);
  d.append(h("div", { class: "row", style: "margin-top:12px" }, h("span", { class: "muted small" }, "先聽符號，再錄自己的：Listen, then record yourself:"), recordWidget({ key: `sym:${s.symbol}` })));
  return d;
}

// ------------------------------------------------------------------ 2. syllable grid
function renderGrid(panel) {
  const { grid } = data;
  const cells = grid.cells;
  const finals = grid.finals;
  const initials = grid.initials;
  const sel = h("div");
  const toneRow = h("div");
  const mode = store.get("lab.gridMode", "picker");
  const seg = h("div", { class: "seg", role: "group", "aria-label": "view" },
    h("button", { type: "button", "aria-pressed": mode === "picker", onclick: () => { store.set("lab.gridMode", "picker"); renderGrid(clear(panel)); } }, "挑選 Pick"),
    h("button", { type: "button", "aria-pressed": mode === "table", onclick: () => { store.set("lab.gridMode", "table"); renderGrid(clear(panel)); } }, "表格 Table"));
  panel.append(h("div", { class: "row", style: "justify-content:space-between" },
    h("p", { class: "muted small", style: "margin:0;max-width:60ch" }, `${grid.counts.toned} 個有聲音節 syllable-tone combinations with an MOE recording. 點一格，再點聲調。Tap a syllable, then a tone. Grey = no common character.`), seg));

  const showTones = base => {
    clear(toneRow);
    const cell = cells[base] || {};
    toneRow.append(h("h3", { style: "margin-top:14px" }, h("span", { class: "zhuyin", lang: "zh-Hant-TW", style: "font-size:26px" }, base)));
    const row = h("div", { class: "tone-row" });
    for (let t = 1; t <= 5; t++) {
      const c = cell[String(t)];
      const syl = withTone(base, t);
      if (!c) { row.append(h("div", { class: "tone-cell empty", "aria-disabled": "true" }, h("span", { class: "t" }, syl), h("span", { class: "c" }, "—"), h("span", { class: "l" }, t === 5 ? "無常用輕聲" : "無常用字"))); continue; }
      const btn = h("button", { type: "button", class: "tone-cell", lang: "zh-Hant-TW", "aria-label": `${syl} ${c.zh} ${TONE_NAMES[t]} MOE`, onclick: async () => {
        btn.classList.add("is-playing");
        try { await playMoe(c.id); } catch { toast("還沒有這個音檔 clip not built yet"); }
        btn.classList.remove("is-playing");
        detail(base, t, c);
      } }, h("span", { class: "t" }, syl), h("span", { class: "c" }, c.zh), h("span", { class: "l" }, TONE_NAMES[t], c.level ? ` · ${c.level.replace("第", "L").replace("級", "")}` : ""));
      row.append(btn);
    }
    toneRow.append(row, h("p", { class: "muted small", style: "margin:8px 0 0" }, "每格播放該字的教育部真人錄音（只播詞頭）。Each cell plays the MOE announcer saying that character (headword span only)."));
    const detailBox = h("div");
    toneRow.append(detailBox);
    function detail(base, t, c) {
      clear(detailBox);
      const syl = withTone(base, t);
      detailBox.append(h("div", { class: "card", style: "margin-top:12px" },
        h("div", { class: "row" }, h("span", { class: "big-zh", lang: "zh-Hant-TW" }, ruby(c.zh, syl, { cls: "" })), playButton({ id: c.id, zh: c.zh }),
          h("span", { class: "muted small" }, c.alts?.length ? "其他字 also: " + c.alts.join("、") : "")),
        h("div", { class: "row", style: "margin-top:8px" }, h("span", { class: "muted small" }, "跟著說，錄下來比較 Say it after the model, record and compare:"), recordWidget({ key: `syl:${syl}` }))));
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
        tr.append(h("td", {}, h("button", { type: "button", "aria-label": base, "aria-pressed": "false", onclick: e => { table.querySelectorAll("[aria-pressed='true']").forEach(b => b.setAttribute("aria-pressed", "false")); e.currentTarget.setAttribute("aria-pressed", "true"); showTones(base); } }, base)));
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
    clear(tiles); clear(toneRow);
    for (const f of finals) {
      const base = ini + f;
      if (!base) continue;
      const c = cells[base];
      const n = c ? Object.keys(c).length : 0;
      tiles.append(h("button", { type: "button", class: "sym", disabled: !c, lang: "zh-Hant-TW", "aria-label": `${base}${c ? "" : " 無常用字"}`, style: n ? "" : "opacity:.35",
        onclick: () => { tiles.querySelectorAll("[aria-pressed='true']").forEach(b => b.setAttribute("aria-pressed", "false")); showTones(base); },
        "aria-pressed": "false" }, h("span", { class: "glyph", style: "font-size:24px" }, base), h("span", { class: "ipa" }, n ? `${n} 聲` : "—")));
    }
  };
  for (const ini of initials) chips.append(h("button", { type: "button", class: "btn small", "data-ini": ini, "aria-pressed": "false", lang: "zh-Hant-TW", onclick: () => pickIni(ini) }, ini || "∅ 零聲母"));
  panel.append(chips, tiles, toneRow);
  pickIni(initials.includes(currentIni) ? currentIni : "ㄇ");
}

// ------------------------------------------------------------------ 3. contrast drills (listening only; feedback + A/B replay)
const STATS_KEY = "lab.contrasts";
const statsAll = () => store.get(STATS_KEY, {});
function statFor(id) { const s = statsAll()[id] || { n: 0, correct: 0, recent: [], days: {} }; return s; }
function recordTrial(id, ok) {
  const all = statsAll(); const s = all[id] || { n: 0, correct: 0, recent: [], days: {} };
  s.n++; if (ok) s.correct++;
  s.recent = [...s.recent, ok ? 1 : 0].slice(-30);
  const d = new Date().toISOString().slice(0, 10); s.days[d] = s.days[d] || { n: 0, correct: 0 }; s.days[d].n++; if (ok) s.days[d].correct++;
  all[id] = s; store.set(STATS_KEY, all);
}
export function recentAccuracy(s) { return s.recent.length ? Math.round(100 * s.recent.reduce((a, b) => a + b, 0) / s.recent.length) : null; }

function renderContrasts(panel) {
  const { contrasts } = data;
  panel.append(h("p", { class: "muted small" }, "聽一個詞，選你聽到的。只用聽的，不要跟著唸（聽與說分開練習，Baese-Berk & Samuel 2016）。Listen and choose; immediate feedback with A/B replay. Keep this block listening-only. Weak contrasts come back automatically."));
  const list = h("div", { class: "contrast-list" });
  for (const c of contrasts) {
    const s = statFor(c.id); const acc = recentAccuracy(s);
    const playable = c.sets.map(set => set.filter(w => w.id)).filter(set => set.length >= 2);
    list.append(h("div", { class: "card", style: "padding:8px 12px" }, h("button", { type: "button", class: "btn", style: "border:0;background:none;padding:8px 0", onclick: () => startDrill(panel, c, playable),
      "aria-label": `${c.rank}. ${c.zh} ${c.en}, accuracy ${acc == null ? "none yet" : acc + "%"}` },
      h("span", {}, h("span", { class: "muted" }, c.rank, ". "), h("span", { lang: "zh-Hant-TW", style: "font-size:19px" }, c.zh), " ", h("span", { class: "muted small" }, c.en)),
      h("span", { class: "small", style: acc != null && acc < 80 ? "color:var(--bad)" : "" }, acc == null ? "尚未練習" : `${acc}%`, h("span", { class: "muted" }, s.n ? ` · ${s.n} 題` : "")))));
  }
  panel.append(list, h("p", { class: "muted small" }, "目前只有一位教育部播音員的聲音；多聲音（HVPT）會在有更多真人語料時加入。Only one Taiwan voice (the MOE announcer) exists so far; more voices are added when accuracy passes ~70% and more human audio is available."));
}

function startDrill(panel, c, sets) {
  clear(panel);
  const N = 10;
  let i = 0, correct = 0;
  const head = h("div", { class: "row", style: "justify-content:space-between" }, h("h2", { style: "margin:0" }, h("span", { lang: "zh-Hant-TW" }, c.zh), " ", h("span", { class: "muted small" }, c.en)),
    h("button", { type: "button", class: "btn small", onclick: () => { stopAudio(); renderContrasts(clear(panel)); } }, "← 回列表 Back"));
  const prog = h("div", { class: "progress", style: "margin:10px 0" }, h("i", { style: "width:0%" }));
  const stage = h("div");
  panel.append(head, prog, stage);
  if (!sets.length) { stage.append(h("p", {}, "這組還沒有可用的音檔。No clips built for this contrast yet.")); return; }

  function trial() {
    clear(stage);
    if (i >= N) {
      const acc = Math.round(100 * correct / N);
      stage.append(h("div", { class: "card" }, h("h3", {}, `本輪 ${correct}/${N}（${acc}%）`), h("p", { class: "muted small" }, acc >= 85 ? "很好。Keep it in rotation." : "低於 85%：Today 會把它排進每日練習。Below 85%: this contrast joins your daily focus."),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => { i = 0; correct = 0; trial(); } }, "再一輪 Another round"), h("button", { type: "button", class: "btn", onclick: () => renderContrasts(clear(panel)) }, "回列表 Back"))));
      return;
    }
    prog.firstChild.style.width = `${100 * i / N}%`;
    const set = pick(sets);
    const target = pick(set);
    const options = shuffle(set);
    let answered = false;
    const play = h("button", { type: "button", class: "btn primary", onclick: () => playMoe(target.id).catch(() => toast("音檔尚未建置 clip not built yet")) }, "🔊 再聽一次 Play again");
    const fb = h("p", { class: "feedback", "aria-live": "polite" });
    const choices = h("div", { class: "choices" });
    const next = h("button", { type: "button", class: "btn", disabled: true, onclick: () => { i++; trial(); } }, "下一題 Next →");
    for (const w of options) {
      const b = h("button", { type: "button", class: "choice", lang: "zh-Hant-TW", "aria-label": `${w.zh} ${w.zhuyin}, ${w.en}`, onclick: () => {
        if (answered) { playMoe(w.id); return; }
        answered = true;
        const ok = w === target;
        if (ok) correct++;
        recordTrial(c.id, ok);
        b.classList.add(ok ? "correct" : "wrong");
        for (const cb of choices.children) { if (cb._w === target) cb.classList.add("correct"); cb.append(h("span", { class: "small muted", style: "display:block;margin-top:6px" }, "🔊 比較 compare")); }
        fb.textContent = ok ? "對了 ✓ Correct" : `不對 ✗ — 正確是 ${target.zh} ${target.zhuyin}`;
        fb.className = "feedback " + (ok ? "good" : "bad");
        next.disabled = false; next.classList.add("primary"); next.focus();
      } }, h("span", { class: "zh" }, h("ruby", {}, w.zh, h("rt", {}, w.zhuyin))), h("span", { class: "en", lang: "en" }, w.en));
      b._w = w;
      choices.append(b);
    }
    stage.append(h("p", { class: "muted small" }, `第 ${i + 1} / ${N} 題 · 聽到哪一個？Which one did you hear?`), play, choices, fb, h("div", { class: "row" }, next));
    playMoe(target.id).catch(() => toast("音檔尚未建置 clip not built yet"));
  }
  trial();
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
  const sylItems = [];
  for (const [base, cell] of Object.entries(grid.cells)) for (const [t, c] of Object.entries(cell)) sylItems.push({ zh: c.zh, zhuyin: withTone(base, Number(t)), id: c.id });
  const wordItems = contrasts.flatMap(c => c.sets.flat()).filter(w => w.id && syllables(w.zhuyin).length >= 2);
  let mode = store.get("lab.dictMode", "syl");
  const stats = store.get(DICT_KEY, { n: 0, correct: 0, parts: {} });
  const seg = h("div", { class: "seg" },
    h("button", { type: "button", "aria-pressed": mode === "syl", onclick: () => { mode = "syl"; store.set("lab.dictMode", mode); renderDictation(clear(panel)); } }, "單音節 Syllables"),
    h("button", { type: "button", "aria-pressed": mode === "word", onclick: () => { mode = "word"; store.set("lab.dictMode", mode); renderDictation(clear(panel)); } }, "詞 Words"));
  panel.append(h("div", { class: "row", style: "justify-content:space-between" }, h("p", { class: "muted small", style: "margin:0;max-width:56ch" }, "聽，然後用標準注音鍵盤打出注音和聲調（空白鍵＝一聲，6 ˊ 3 ˇ 4 ˋ 7 ˙）。Hear it, type the Zhuyin and tone. Physical keys follow the standard layout."), seg),
    h("p", { class: "stat-row" }, h("span", {}, "累計 ", h("b", {}, stats.n), " 題"), h("span", {}, "正確 ", h("b", {}, stats.n ? Math.round(100 * stats.correct / stats.n) : 0, "%")),
      Object.keys(stats.parts).length ? h("span", {}, "常錯 weak: ", h("b", {}, Object.entries(stats.parts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ×${v}`).join("、"))) : null));
  const stage = h("div");
  panel.append(stage);

  let item, typed = [], buf = "", answered = false;
  const target = h("div", { class: "dict-target", lang: "zh-Hant-TW", "aria-live": "polite" });
  const fb = h("p", { class: "feedback" });
  const playBtn = h("button", { type: "button", class: "btn primary", onclick: () => playMoe(item.id).catch(() => toast("音檔尚未建置 clip not built yet")) }, "🔊 聽 Play");
  const nextBtn = h("button", { type: "button", class: "btn", onclick: newItem }, "下一題 Next →");
  const showBtn = h("button", { type: "button", class: "btn small", onclick: () => { fb.textContent = `${item.zh} ${item.zhuyin}`; fb.className = "feedback muted"; } }, "看答案 Show");

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
    fb.textContent = ok ? `對了 ✓ ${item.zh}` : `${item.zh} ${item.zhuyin} — 紅色是錯的部分 red = what differs`;
    fb.className = "feedback " + (ok ? "good" : "bad");
    nextBtn.classList.add("primary"); nextBtn.focus();
  }
  function newItem() {
    item = pick(mode === "syl" ? sylItems : wordItems);
    typed = []; buf = ""; answered = false; fb.textContent = ""; fb.className = "feedback"; nextBtn.classList.remove("primary");
    draw();
    playMoe(item.id).catch(() => toast("音檔尚未建置 clip not built yet"));
  }
  const kbd = h("div", { class: "kbd", "aria-label": "標準注音鍵盤 Standard Zhuyin keyboard" });
  KEY_ROWS.forEach((row, r) => kbd.append(h("div", { class: `kbd-row r${r + 1}` }, row.map(([k, z]) => h("button", { type: "button", class: "key" + ("ˊˇˋ˙".includes(z) ? " tone" : ""), lang: "zh-Hant-TW", "aria-label": z, onclick: () => input(z) }, z, h("small", {}, k))))));
  kbd.append(h("div", { class: "kbd-bottom" }, h("button", { type: "button", class: "key", onclick: backspace, "aria-label": "刪除 Backspace" }, "⌫"),
    h("button", { type: "button", class: "key tone", onclick: () => input(" ") }, "一聲 ␣ Tone 1 / next syllable"), h("button", { type: "button", class: "key", onclick: check }, "檢查 ↵")));
  stage.append(h("div", { class: "row" }, playBtn, showBtn, nextBtn), target, fb, kbd);
  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey || !panel.isConnected) { if (!panel.isConnected) document.removeEventListener("keydown", onKey); return; }
    if (e.key === "Enter") { e.preventDefault(); answered ? newItem() : check(); return; }
    if (e.key === "Backspace") { e.preventDefault(); backspace(); return; }
    if (e.key === " ") { e.preventDefault(); input(" "); return; }
    const z = KEYMAP[e.key.toLowerCase()];
    if (z) { e.preventDefault(); input(z); }
  };
  document.addEventListener("keydown", onKey);
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
  for (const f of figs) grid.append(h("figure", { html: mouthSVG(f) }, h("figcaption", {}, h("b", { lang: "zh-Hant-TW" }, f.zh), " — ", h("span", { lang: "en" }, f.en))));
  panel.append(grid);
}

main().catch(err => { app.append(h("p", { class: "feedback bad" }, "載入失敗 Could not load data: ", err.message)); console.error(err); });
