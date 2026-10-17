// 聲調 Tone Gym (MASTER_PROMPT §5.3, M2 design §5): tone basics with the Taiwan targets, tone identification with a
// confusion matrix, the 20-word tone-pair grid (identify, then produce), the pitch mirror, the sandhi trainer and the
// Taiwan readings. Tone and syllable audio is MOE human audio only (ground rule 5); TTS appears only for whole sandhi
// sentences, always labelled. Listening blocks and speaking blocks stay separate (§6.7). The drills are drills.js, the
// contour drawing is pitch.js; this page lays them out and adds the sandhi listening check.
import { h, $, clear, mountShell, store, loadJSON, shuffle, pick, ruby, playButton, playMoe, stopAudio, stopRecorders,
  settings, setSetting, syllables, toneOf, baseOf, withTone, TONE_NAMES, enText, bi, trackTime, toast } from "./app.js";
import { overlay, contourIcon, CHAO } from "./pitch.js";
import { toneIdDrill, pairIdDrill, mirrorDrill, confusion, pairStats, mirrorStats, weightedPairs, recentAccuracy, assertMoeOnly } from "./drills.js";

mountShell("tones");
trackTime("tones");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

const TABS = [["basics", "基礎", "Basics"], ["id", "辨識", "Tone ID"], ["pairs", "雙字", "Tone pairs"], ["mirror", "鏡子", "Pitch mirror"],
  ["sandhi", "變調", "Sandhi"], ["readings", "臺灣讀音", "Taiwan readings"]];
const MOE_NAME = "MOE human voice · 教育部真人發音";
// 媽 麻 馬 罵: the MOE clip ids of §7.2, used only when docs/data/tones.json (whose tone_examples are these) is missing
const SPEC_EXAMPLES = { 1: "0527", 2: "0529", 3: "0534", 4: "0539" };
const EXAMPLE_WORDS = { 1: ["媽", "ㄇㄚ", "mom"], 2: ["麻", "ㄇㄚˊ", "hemp; numb"], 3: ["馬", "ㄇㄚˇ", "horse"], 4: ["罵", "ㄇㄚˋ", "to scold"] };
// What the app teaches (§6.4): T1 high and level, T2 rising (35), T3 low (21), T4 high falling; neutral 較輕短 (§6.1)
const SHAPE = { 1: ["高而平", "high and level"], 2: ["上升", "rising"], 3: ["低", "low"], 4: ["高降", "high falling"], 5: ["輕而短", "light and short"] };
const NOTES = {
  1: ["保持高而平。課本是 55，臺灣常說得稍低一點（44）。", "Keep it high and flat. The textbook says 55; Taiwan speech usually sits a little lower (44)."],
  2: ["臺灣口語常先往下一點再上升（323）；練習時唸乾淨的上升（35）。", "Taiwan speech often dips a little before it rises (323); practise a clean rise (35)."],
  3: ["教低的 21。這個「馬」是單獨唸的，所以最後會上揚；在詞和句子裡要保持低，不上揚（老師）。",
    "Taught as low (21). This 馬 is said on its own, so it rises at the end; inside words and phrases keep it low, with no rise (老師)."],
  4: ["從高處降下來（51）；臺灣常降到中間就停（52、53）。", "Start high and fall (51); Taiwan speech often stops a little higher (52 or 53)."],
  5: ["又輕又短（教育部：「較輕短」）。注音把 ˙ 寫在音節前面：˙ㄗ。", "Light and short (MOE: 較輕短). Zhuyin writes ˙ before the syllable: ˙ㄗ."],
};
// §6.4 table: textbook (Chao 1968), typical Taiwan speech (varies by speaker), what the app teaches
const TW_ROWS = [
  [1, "55", "44", ["高而平", "high and level"]],
  [2, "35", "323 (dips early, then rises)", ["上升（35）", "rising (35)"]],
  [3, "214", "21 / 31, low falling, often creaky; the final rise is rare",
    ["低（21）：只有單獨唸或在一個片語的最後才上揚。", "low (21). The rise is allowed only for a syllable on its own or at the end of a phrase."]],
  [4, "51", "52 / 53", ["高降", "high falling"]],
];
// §6.4 neutral tone in Taiwan, copied exactly
const MOE_FULL = [["時候", "ㄕˊ ㄏㄡˋ"], ["喜歡", "ㄒㄧˇ ㄏㄨㄢ"], ["學生", "ㄒㄩㄝˊ ㄕㄥ"], ["先生", "ㄒㄧㄢ ㄕㄥ"], ["朋友", "ㄆㄥˊ ㄧㄡˇ"],
  ["聰明", "ㄘㄨㄥ ㄇㄧㄥˊ"], ["關係", "ㄍㄨㄢ ㄒㄧˋ"], ["事情", "ㄕˋ ㄑㄧㄥˊ"], ["清楚", "ㄑㄧㄥ ㄔㄨˇ"], ["眼睛", "ㄧㄢˇ ㄐㄧㄥ"],
  ["頭髮", "ㄊㄡˊ ㄈㄚˇ"], ["休息", "ㄒㄧㄡ ㄒㄧˊ"], ["消息", "ㄒㄧㄠ ㄒㄧˊ"], ["告訴", "ㄍㄠˋ ㄙㄨˋ"]];
const MOE_NEUTRAL = [["認識", "ㄖㄣˋ ˙ㄕ"], ["漂亮", "ㄆㄧㄠˋ ˙ㄌㄧㄤ"], ["衣服", "ㄧ ˙ㄈㄨ"], ["舒服", "ㄕㄨ ˙ㄈㄨ"], ["麻煩", "ㄇㄚˊ ˙ㄈㄢ"],
  ["明白", "ㄇㄧㄥˊ ˙ㄅㄞ"], ["但是", "ㄉㄢˋ ˙ㄕ"]];
const RULE_SHORT = { "3+3": "3+3", half3: "半三聲", yi: "一", bu: "不" };
const CJK = /[㐀-鿿豈-﫿]/;
const CHECK_KEY = "tones.sandhiCheck"; // {"t3"|"yi"|"bu": {n, correct, recent: [0/1 x 30]}}

const app = $("#app");
let data = null;
let teardown = null;          // undoes the current view's document-level listeners
let redrawSandhi = null;      // the sandhi lists, redrawn when "show sandhi" changes
const running = new Set();    // drill controllers {stop(), done} on screen
const mirrorState = { group: "all", q: "", shown: 40 };

// ------------------------------------------------------------------ plumbing
function run(ctl) {
  if (!ctl) return ctl;
  running.add(ctl);
  Promise.resolve(ctl.done).finally(() => running.delete(ctl));
  return ctl;
}
function stopDrills() {
  for (const c of [...running]) { try { c.stop(); } catch (err) { console.error(err); } }
  running.clear();
}
// Call before a view's panel is cleared: drops its listeners, ends its drills, stops audio and recording.
function leaveView() {
  teardown?.();
  teardown = null;
  redrawSandhi = null;
  stopDrills();
  stopAudio();
}

// Focus (a11y). Starting, finishing or restarting a drill replaces the control that had focus (Start, a word tile,
// Next/Finish, Another round) and focus falls to <body>: the 1–4 keys (heard only inside a drill) stop working and a
// screen reader loses its place. focusDrill() puts focus on the drill's main control instead: Play again in a
// listening drill (so the keys work from the first trial), Model in the mirror, or an end card's heading (it reads
// the score). The drills are also started with { focus: true } (drills.js focuses their first trial itself, also
// after "Another round"); keepFocus() is the safety net whenever focus is lost that way inside the panel.
function drillTarget(scope) {
  const card = scope.querySelector(".drill-summary");
  if (card) {
    const head = card.querySelector("h2, h3");
    if (head && !head.hasAttribute("tabindex")) head.setAttribute("tabindex", "-1");
    return head || card.querySelector("button:not(:disabled)");
  }
  return scope.querySelector(".drill-play, .mirror-controls button:not(:disabled)");
}
let focusWanted = null; // {scope, from, until}: a drill still loading (the mirror loads its curves before its buttons)
function focusDrill(scope, fallback = null) {
  focusWanted = null;
  const t = drillTarget(scope);
  if (t) t.focus();
  else if (scope.querySelector(".drill")) focusWanted = { scope, from: document.activeElement, until: Date.now() + 5000 };
  else if (fallback) fallback.focus({ preventScroll: true });
}
function keepFocus(panel) {
  let last = null, lastInPanel = false;
  document.addEventListener("focusin", e => { last = e.target; lastInPanel = panel.contains(e.target); });
  new MutationObserver(() => {
    const a = document.activeElement, lost = !a || a === document.body;
    const w = focusWanted;
    if (w) {
      // the learner went somewhere else meanwhile (or the drill never drew a control): leave focus alone
      if (Date.now() > w.until || !w.scope.isConnected || !(lost || a === w.from)) focusWanted = null;
      else { const t = drillTarget(w.scope); if (t) { focusWanted = null; t.focus(); } return; }
    }
    if (lost && lastInPanel && last && !last.isConnected) focusDrill(panel, panel);
  }).observe(panel, { childList: true, subtree: true });
}

const arr = x => (Array.isArray(x) ? x : []);
const clipOf = id => (id && data.audio[id]) || null;
const hasClip = id => !!clipOf(id) && clipOf(id).src === "moe";
const modelOf = id => (id && data.contours[id]) || null;
const toneShort = t => (t === 5 ? "輕" : String(t));
const toneEn = t => (t === 5 ? "neutral" : `tone ${t}`);
const noClip = () => toast("音檔尚未建置 clip not built yet");
const moeBadge = () => h("span", { class: "badge human", title: MOE_NAME }, "MOE");
const icon = (t, size) => { try { return contourIcon(t, { size }); } catch (err) { console.error(err); return null; } };
const arrows = s => String(s || "").replace(/->/g, "→");
// Zhuyin as one nowrap span per syllable: a line may break between syllables, never before a tone mark.
const zy = z => syllables(z || "").map((s, i) => [i ? " " : null, h("span", { class: "syl" }, s)]);

// QA §10.5: the tone drills draw only on MOE human audio. Anything without a published MOE clip is dropped here,
// and the assertion guards the drill input against a non-MOE entry slipping through.
function moeOnly(list, what) {
  const out = arr(list).filter(x => x && hasClip(x.id));
  console.assert(out.every(x => clipOf(x.id).src === "moe"), `${what}: a tone drill item without MOE human audio`);
  return out;
}
// MOE play button with its source badge, or a plain "no clip" marker (never TTS for a word).
// compact: a narrow "—" (for table cells), with the words for screen readers.
function playMoeBtn(item, { compact = false, ...opts } = {}) {
  if (hasClip(item.id)) return playButton({ id: item.id, zh: item.zh }, opts);
  const title = "No MOE recording of this exact reading yet";
  if (compact) return h("span", { class: "tg-noclip", title }, h("span", { "aria-hidden": "true" }, "—"), h("span", { class: "sr-only" }, "無錄音 ", h("span", { lang: "en" }, "no clip")));
  return h("span", { class: "badge none", title }, "無錄音 ", h("span", { lang: "en" }, "no clip"));
}
const notBuilt = (zh = "這部分的資料還沒建置。", en = "This part's data isn't built yet (docs/data/tones.json): run tools/build.py.") =>
  h("p", { class: "tg-notice", role: "note" }, zh, " ", enText(en));
// Up to k items for a mirror round: never-practised first, then the lowest best scores; random within a tie.
function pickForPractice(list, k) {
  const ms = mirrorStats();
  return shuffle(list).map((x, i) => ({ x, i, b: ms[x.id] && ms[x.id].best != null ? ms[x.id].best : -1 }))
    .sort((a, b) => a.b - b.b || a.i - b.i).slice(0, k).map(o => o.x);
}

// ------------------------------------------------------------------ page
async function main() {
  const [tones, audio, contours] = await Promise.all([
    loadJSON("tones").catch(err => { console.warn("tones.json not available:", err.message); return null; }),
    loadJSON("audio").catch(() => ({})), loadJSON("contours").catch(() => ({}))]);
  let t = tones;
  if (!t) { // degrade: the M1 pairs.json (20 core words) keeps Basics and the pair grid usable
    const pairs = await loadJSON("pairs").catch(() => []);
    t = { pairs: arr(pairs).map(p => ({ ...p, core: true })), tone_examples: SPEC_EXAMPLES };
  }
  data = { missing: !tones, audio: audio || {}, contours: contours || {}, pool: arr(t.id_pool), pairs: arr(t.pairs),
    rules: arr(t.sandhi && t.sandhi.rules), items: arr(t.sandhi && t.sandhi.items), readings: arr(t.readings),
    examples: t.tone_examples || {} };
  // any tones.json word with a clip, by "zh|zhuyin" (gives the neutral-tone lists their audio where one exists)
  data.byWord = new Map();
  for (const e of [...data.pairs, ...data.items, ...data.readings]) if (e && hasClip(e.id)) data.byWord.set(`${e.zh}|${e.zhuyin}`, e);

  clear(app);
  app.append(h("div", { class: "page-head" }, h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "聲調館"), h("span", { class: "en", lang: "en" }, "Tone Gym")),
    h("p", { class: "muted small", style: "margin:0" }, "聲調和音節只用教育部真人錄音（標示 MOE）；只有整句才用合成語音（標示 TTS）。",
      enText("Tones and syllables use MOE human audio only; only whole sentences use TTS, always labelled."))));
  if (data.missing) {
    app.append(h("p", { class: "tg-notice", role: "status" }, "聲調資料還沒建置。",
      enText(" Tone data (docs/data/tones.json) isn't built yet: run tools/build.py. Basics and the 20 core tone-pair words still work.")));
  }
  // ARIA tabs pattern (as in lab.js): one shared panel, roving tabindex, arrows/Home/End move and activate.
  const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "聲調館 Tone Gym" });
  const panel = h("section", { role: "tabpanel", id: "tones-panel", class: "tg-panel", tabindex: "0" });
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
    ({ basics: renderBasics, id: renderToneId, pairs: renderPairs, mirror: renderMirror, sandhi: renderSandhi, readings: renderReadings })[id](panel);
  };
  for (const [id, zh, en] of TABS) {
    tabs.append(h("button", { type: "button", role: "tab", id: `tab-${id}`, "aria-controls": "tones-panel", "data-id": id, "aria-selected": "false", tabindex: "-1", onclick: () => show(id) },
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
  keepFocus(panel);
  const start = location.hash.slice(1);
  show(TABS.some(x => x[0] === start) ? start : "basics");
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    const tab = TABS.some(x => x[0] === id) && tabs.querySelector(`[data-id="${id}"]`);
    if (!tab || tab.getAttribute("aria-selected") === "true") return;
    show(id);
    // a link inside the panel (Readings → Basics) went with the old view: focus the tab it opened
    if (!document.activeElement || document.activeElement === document.body) tab.focus();
  });
}

// ------------------------------------------------------------------ 1. basics: the tone cards (the hero), §6.4 table, neutral tone
function renderBasics(panel) {
  panel.append(h("p", { class: "muted small tg-lede" }, "每張卡片：上方是要學的聲調形狀和趙元任五度數字（5 最高、1 最低），下方是教育部播音員實際的音高曲線。",
    enText("Each card: the shape to aim for and its Chao numbers (5 = high, 1 = low), then the MOE announcer's real pitch, in semitones around the speaker's own middle.")));
  const cards = h("div", { class: "tone-cards" });
  panel.append(cards);
  const plots = [];
  const exs = [1, 2, 3, 4].map(t => { const [zh, zhuyin, en] = EXAMPLE_WORDS[t]; return { zh, zhuyin, en, id: data.examples[t] || null }; });
  exs.push(neutralExample());
  const range = sharedRange(exs.map(ex => ex && modelOf(ex.id)));
  exs.forEach((ex, i) => cards.append(toneCard(i + 1, ex, plots, range)));
  // after the cards are in the page, so each overlay gets its real width; one plot height for all (the wide neutral
  // card too), so a semitone is the same number of pixels on every card
  const w1 = Math.round(Math.min(440, Math.max(260, cards.querySelector(".tc-plot")?.clientWidth || 320)));
  const height = Math.round(Math.min(200, Math.max(156, w1 * 0.5)));
  for (const draw of plots) draw(height);
  panel.append(taiwanTable(), neutralSection());
}

// The cards are compared side by side, so all their overlays share one vertical scale: the smallest of pitch.js's
// ±12 / ±18 / ±24 st that holds every card's measured model points (left alone, pitch.js would draw the deep fall of
// 罵 on ±18 and the rise of 麻 on ±12, and the fall would look a third flatter than it is next to the rise), at one
// plot height.
function sharedRange(models) {
  const peak = Math.max(0, ...models.filter(m => m && Array.isArray(m.st))
    .flatMap(m => m.st.filter((x, i) => Number.isFinite(x) && (!m.v || m.v[i])).map(Math.abs)));
  return [12, 18, 24].find(r => peak <= r + 0.5) || 24;
}

function toneCard(t, ex, plots, range = null) {
  const [szh, sen] = SHAPE[t];
  const headId = `tc-h-${t}`;
  const plot = h("div", { class: "tc-plot" });
  const card = h("article", { class: "tone-card" + (t === 5 ? " tone-card-neutral" : ""), "aria-labelledby": headId },
    h("div", { class: "tc-head" },
      h("span", { class: "tc-icon", "aria-hidden": "true" }, icon(t, 46)),
      h("div", { class: "tc-title" },
        h("h3", { id: headId }, h("span", { lang: "zh-Hant-TW" }, TONE_NAMES[t]), " ", h("span", { class: "tc-en", lang: "en" }, t === 5 ? "Neutral tone" : `Tone ${t}`)),
        h("p", { class: "tc-shape" }, h("span", { lang: "zh-Hant-TW" }, szh), " · ", h("span", { lang: "en" }, sen))),
      h("p", { class: "tc-chao" }, h("span", { class: "n", "aria-hidden": "true" }, t === 5 ? "˙" : CHAO[t]),
        h("span", { class: "l", lang: "en", "aria-hidden": "true" }, t === 5 ? "light" : "Chao"),
        h("span", { class: "sr-only", lang: "en" }, t === 5 ? "light, no fixed pitch number" : `Chao ${CHAO[t].split("").join(" ")}`))),
    plot,
    ex ? h("div", { class: "tc-ex" }, ruby(ex.zh, ex.zhuyin, { cls: "tc-zh" }), ex.en ? h("span", { class: "tc-gloss lc-en", lang: "en" }, ex.en) : null,
      h("span", { class: "tc-play" }, playMoeBtn(ex))) : null,
    h("p", { class: "tc-note" }, NOTES[t][0], " ", enText(NOTES[t][1], { class: "muted" })));
  plots.push((height = 167) => {
    const model = ex && modelOf(ex.id);
    if (!model) {
      plot.append(h("p", { class: "tc-noplot muted small" }, ...(ex && hasClip(ex.id) ? bi("這個錄音沒有示範曲線。", "No model curve for this clip.") : bi("還沒有這個錄音。", "This clip isn't built yet."))));
      return;
    }
    const w = Math.round(Math.min(t === 5 ? 560 : 440, Math.max(260, plot.clientWidth || 320)));
    const syls = syllables(ex.zhuyin).map(z => ({ zhuyin: z, tone: toneOf(z) }));
    try { plot.append(overlay({ model, syllables: syls, width: w, height, range })); }
    catch (err) { console.error(err); plot.append(h("p", { class: "tc-noplot muted small" }, ...bi("無法畫出音高曲線。", "Could not draw the pitch curve."))); }
  });
  return card;
}
// The neutral tone has no single-syllable clip: a two-syllable word ending in one (core first: 桌子).
function neutralExample() {
  const cands = data.pairs.filter(p => p && syllables(p.zhuyin || "").length === 2 && toneOf(syllables(p.zhuyin)[1]) === 5);
  const good = p => hasClip(p.id) && modelOf(p.id);
  const p = cands.find(x => x.core && good(x)) || cands.find(good) || cands.find(x => hasClip(x.id)) || cands[0];
  return p ? { zh: p.zh, zhuyin: p.zhuyin, en: p.en || "", id: p.id } : null;
}

function taiwanTable() {
  const th = (zh, en) => h("th", { scope: "col", role: "columnheader" }, zh, " ", h("span", { class: "en", lang: "en" }, en));
  const table = h("table", { class: "tg-table tw-table", role: "table" },
    h("caption", { class: "sr-only" }, "聲調：課本、臺灣常見、本站教的 ", h("span", { lang: "en" }, "Tones: textbook, typical Taiwan speech, what the app teaches")),
    h("thead", { role: "rowgroup" }, h("tr", { role: "row" }, th("聲調", "Tone"), th("課本", "Textbook (Chao 1968)"), th("臺灣常見 ⚠", "Typical Taiwan speech (varies by speaker)"), th("本站教", "What the app teaches"))),
    h("tbody", { role: "rowgroup" }, TW_ROWS.map(([t, book, tw, [tzh, ten]]) => h("tr", { role: "row", class: t === 3 ? "emph" : "" },
      h("th", { scope: "row", role: "rowheader" }, h("span", { class: "tw-ico", "aria-hidden": "true" }, icon(t, 22)), h("span", { lang: "zh-Hant-TW" }, TONE_NAMES[t]), " ", h("span", { class: "en", lang: "en" }, `T${t}`)),
      // one span per cell: on a phone the cell becomes a two-column grid (its data-label, then the value)
      h("td", { role: "cell", "data-label": "課本 Textbook", class: "num" }, h("span", {}, book)),
      h("td", { role: "cell", "data-label": "臺灣常見 Typical Taiwan" }, h("span", { lang: "en" }, tw)),
      h("td", { role: "cell", "data-label": "本站教 We teach" }, h("span", {}, t === 3 ? h("b", {}, tzh) : tzh, " ", enText(ten, { class: "muted" })))))));
  return h("section", { class: "tg-section", "aria-labelledby": "tw-h" },
    h("h2", { id: "tw-h" }, "課本和臺灣 ", enText("Textbook vs Taiwan")),
    h("div", { class: "tg-table-wrap" }, table),
    h("p", { class: "small muted tg-sources" }, enText("Sources: Kubler 1985 (T3 is [21] “in most situations”); Fon & Chiang 1999, JCL 27(1); Huang 2017, IJCL 4(2).")));
}

function neutralSection() {
  const li = (zh, en) => h("li", {}, zh, " ", enText(en, { class: "muted" }));
  const chips = list => h("ul", { class: "word-chips" }, list.map(([zh, z]) => {
    const e = data.byWord.get(`${zh}|${z}`);
    return h("li", {}, ruby(zh, z, { cls: "chip-zh" }), e ? playMoeBtn(e, { badge: false, cls: "btn icon small-icon" }) : null);
  }));
  return h("section", { class: "tg-section", "aria-labelledby": "neutral-h" },
    h("h2", { id: "neutral-h" }, "臺灣的輕聲 ", enText("The neutral tone in Taiwan")),
    h("ul", { class: "tg-bullets" },
      li("臺灣說輕聲比北京少。", "Taiwan speech uses it less than Beijing does."),
      li("「子」字尾和重疊的親屬稱呼（爸爸、媽媽）一定是輕聲。", "The suffix 子 and repeated kinship terms (爸爸, 媽媽) are always neutral.")),
    h("h3", {}, "教育部寫全調 ", enText("MOE writes a full tone", { class: "muted" })), chips(MOE_FULL),
    h("h3", {}, "教育部還是寫輕聲 ", enText("MOE still writes a neutral tone", { class: "muted" })), chips(MOE_NEUTRAL),
    h("p", { class: "small muted" }, "很多臺灣人把這些也唸成全調。", enText("Many Taiwanese speakers say these with full tones.")),
    h("p", { class: "tg-policy" }, h("b", {}, "本站做法 ", h("span", { lang: "en" }, "App policy")), "：照教育部的寫法；聽的時候也接受全調的唸法。",
      enText(" Spell words as MOE does, and accept the full-tone versions for listening.")));
}

// ------------------------------------------------------------------ 2. tone identification + confusion matrix (listening only)
function renderToneId(panel) {
  const pool = moeOnly(data.pool, "toneIdDrill");
  const stage = h("div", { class: "tg-stage" });
  const matrix = h("section", { class: "tg-section tg-matrix", "aria-labelledby": "cm-h" });
  panel.append(h("p", { class: "muted small tg-lede" }, "聽一個字，選它的聲調（也可以按 1–4）。只聽不說；你常混淆的聲調會更常出現。",
    enText("Hear one syllable and choose its tone (keys 1–4 work too). Listening only; the tones you confuse come up more often.")), stage, matrix);
  const start = () => {
    stopDrills();
    clear(stage);
    run(toneIdDrill(stage, pool, { n: 15, examples: data.examples, focus: true, onDone: () => drawMatrix(matrix) }));
    focusDrill(stage); // Start is gone: Play again takes focus, so 1–4 answer the first trial too
  };
  if (!pool.length) stage.append(notBuilt("還沒有單音節的教育部錄音。", "No single-syllable MOE clips yet (the Tone ID pool comes from docs/data/tones.json)."));
  else {
    stage.append(h("div", { class: "card tg-start" },
      h("p", {}, `${pool.length} 個常用字（TBCL 第 1–3 級），教育部真人發音。`, enText(` ${pool.length} common characters (TBCL levels 1–3), MOE human voice.`)),
      h("button", { type: "button", class: "btn primary", onclick: start }, "▶ ", ...bi("開始", "Start · 15"))));
  }
  drawMatrix(matrix);
}

// Rows = the tone heard, columns = the tone answered (drills.js "tones.confusion"), with the weakest pair called out.
function drawMatrix(box) {
  const c = confusion();
  const cell = (a, b) => Number(c[a] && c[a][b]) || 0;
  const rowTotal = a => [1, 2, 3, 4].reduce((s, b) => s + cell(a, b), 0);
  const total = [1, 2, 3, 4].reduce((s, a) => s + rowTotal(a), 0);
  clear(box).append(h("h2", { id: "cm-h" }, "混淆表 ", enText("Confusion matrix")));
  if (!total) { box.append(h("p", { class: "muted small" }, "還沒有作答紀錄。", enText("No answers yet: the table fills in as you play."))); return; }
  // The weakest pair: mix-ups either way over the answers to those two tones, smoothed (+4) so that one slip on a
  // tone heard twice does not outrank a pattern seen many times.
  let weak = null;
  for (const [a, b] of [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]) {
    const mix = cell(a, b) + cell(b, a), n = rowTotal(a) + rowTotal(b), score = mix / (n + 4);
    if (mix && n && (!weak || score > weak.score)) weak = { a, b, mix, n, rate: mix / n, score };
  }
  if (weak) {
    const pct = Math.round(100 * weak.rate);
    const classic = (weak.a === 1 && weak.b === 4) || (weak.a === 2 && weak.b === 3);
    box.append(h("p", { class: "tg-callout" }, h("span", { class: "tg-callout-icons", "aria-hidden": "true" }, icon(weak.a, 24), icon(weak.b, 24)),
      h("span", {}, h("b", {}, `最常混淆：${TONE_NAMES[weak.a]} ↔ ${TONE_NAMES[weak.b]}`), `（${weak.mix} 次，${pct}%）`,
        enText(` Weakest pair: tone ${weak.a} ↔ tone ${weak.b}, mixed up ${weak.mix} time${weak.mix > 1 ? "s" : ""} (${pct}% of those answers).${classic ? " It is one of the two classic pairs (T1/T4, T2/T3); the drill already gives it extra weight." : ""}`, { class: "muted" }))));
  } else box.append(h("p", { class: "tg-callout" }, "目前沒有混淆。", enText(" No confusions so far.", { class: "muted" })));
  const head = h("tr", {}, h("th", { scope: "col", class: "corner" }, h("span", { "aria-hidden": "true" }, "聽＼選"), h("span", { class: "sr-only", lang: "en" }, "heard tone, answered tone")));
  for (let b = 1; b <= 4; b++) head.append(h("th", { scope: "col" }, h("span", { class: "cm-ico", "aria-hidden": "true" }, icon(b, 18)), String(b), h("span", { class: "sr-only", lang: "en" }, ` answered tone ${b}`)));
  head.append(h("th", { scope: "col" }, "對 ", h("span", { lang: "en" }, "%")));
  const body = h("tbody");
  for (let a = 1; a <= 4; a++) {
    const n = rowTotal(a);
    const tr = h("tr", {}, h("th", { scope: "row" }, h("span", { class: "cm-ico", "aria-hidden": "true" }, icon(a, 18)), String(a), h("span", { class: "sr-only", lang: "en" }, ` heard tone ${a}`)));
    for (let b = 1; b <= 4; b++) {
      const v = cell(a, b), share = n ? v / n : 0;
      tr.append(h("td", { class: a === b ? "diag" : v >= 2 && share >= 0.15 ? "hot" : v ? "" : "zero" }, String(v)));
    }
    tr.append(h("td", { class: "acc" }, n ? `${Math.round(100 * cell(a, a) / n)}%` : "—"));
    body.append(tr);
  }
  box.append(h("div", { class: "tg-table-wrap" }, h("table", { class: "cm-table" },
    h("caption", { class: "sr-only" }, "混淆表：列是聽到的聲調，欄是選的聲調 ", h("span", { lang: "en" }, "Confusion matrix: rows are the tone heard, columns the tone answered")),
    h("thead", {}, head), body)),
  h("p", { class: "small muted" }, `共 ${total} 題。`, enText(` ${total} answers in all rounds. Rows: the tone you heard; columns: the tone you chose.`)));
}

// ------------------------------------------------------------------ 3. tone pairs: the 4x5 grid, then Identify, then Produce
function renderPairs(panel) {
  const core = new Map(); // "<t1><t2>" -> the §6.4 core word of that cell
  for (const p of data.pairs) if (p && p.core && !core.has(`${p.t1}${p.t2}`)) core.set(`${p.t1}${p.t2}`, p);
  const two = moeOnly(data.pairs.filter(p => p && syllables(p.zhuyin || "").length === 2), "pairIdDrill");
  const withModel = two.filter(p => modelOf(p.id));
  const producePool = withModel.length ? withModel : two;
  panel.append(h("p", { class: "muted small tg-lede" }, "20 個核心詞：點一下聽。百分比是你這個組合的辨識正確率（最近 30 題）。",
    enText("The 20 core words: tap one to hear it. The % is your identify accuracy for that tone pair (last 30 answers).")));
  const grid = h("div", { class: "tp-wrap" });
  const detail = h("div", { class: "tp-detail", "aria-live": "polite" });
  const drawGrid = () => { clear(grid).append(pairGrid(core, detail)); };
  drawGrid();
  panel.append(grid, detail);
  if (!core.size) grid.append(notBuilt());
  // two separate blocks, listening first, then speaking (§5.3 item 3, §6.7)
  panel.append(h("div", { class: "tg-blocks" },
    drillBlock({ kind: "listen", n: 1, zh: "辨識", en: "Identify", empty: !two.length,
      desc: ["聽一個詞，選它的聲調組合。只聽不說。", "Hear a word and choose its tone pattern. Listening only."],
      count: `${two.length}`, start: body => pairIdDrill(body, two, { n: 12, focus: true, onDone: drawGrid }) }),
    drillBlock({ kind: "speak", n: 2, zh: "發音", en: "Produce", empty: !producePool.length,
      desc: ["跟著示範說，比較音高曲線；會多練你最弱的組合。", "Say each word after the model and compare the pitch curves; weighted to your weakest cells."],
      count: `${producePool.length}`, start: body => mirrorDrill(body, weightedPairs(producePool, 6), { focus: true, onDone: drawGrid }) })));
}

function pairGrid(core, detail) {
  const stats = pairStats();
  const head = h("tr", {}, h("th", { scope: "col", class: "tp-corner" }, h("span", { "aria-hidden": "true" }, "1＼2"), h("span", { class: "sr-only", lang: "en" }, "first syllable, second syllable")));
  for (let b = 1; b <= 5; b++) {
    head.append(h("th", { scope: "col" }, h("span", { class: "tp-ico", "aria-hidden": "true" }, icon(b, 20)),
      h("span", { "aria-hidden": "true" }, "+", toneShort(b)), h("span", { class: "sr-only", lang: "en" }, `second syllable ${toneEn(b)}`)));
  }
  const showDetail = p => {
    const said = p.spoken && p.spoken !== p.zhuyin && syllables(p.spoken).length === syllables(p.zhuyin).length ? p.spoken : null;
    clear(detail).append(h("div", { class: "tp-detail-in" },
      h("span", { class: "big-zh" }, ruby(p.zh, p.zhuyin, { cls: "", spoken: p.spoken })),
      h("span", { class: "tp-detail-text" },
        h("span", { class: "tp-pat" }, `${toneShort(p.t1)} + ${toneShort(p.t2)}`), p.en ? [" ", enText(p.en, { class: "lc-en" })] : null,
        said ? h("span", { class: "small tp-said" }, `說成 ${said}`, enText(` said ${said}`)) : null,
        p.note && !said ? h("span", { class: "small muted" }, enText(p.note)) : null),
      playMoeBtn(p)));
  };
  const body = h("tbody");
  for (let a = 1; a <= 4; a++) {
    const tr = h("tr", {}, h("th", { scope: "row" }, h("span", { class: "tp-ico", "aria-hidden": "true" }, icon(a, 20)),
      h("span", { "aria-hidden": "true" }, String(a)), h("span", { class: "sr-only", lang: "en" }, `first syllable tone ${a}`)));
    for (let b = 1; b <= 5; b++) {
      const p = core.get(`${a}${b}`);
      if (!p) { tr.append(h("td", { class: "tp-empty" }, "—")); continue; }
      const st = stats[`${a}${b}`];
      const acc = recentAccuracy(st);
      const weak = acc != null && acc < 70 && st.recent.length >= 5;
      const clip = hasClip(p.id);
      const btn = h("button", { type: "button", class: "tp-cell" + (clip ? "" : " noclip") + (weak ? " weak" : ""),
        "aria-label": `${p.zh} ${p.zhuyin}${p.en ? ", " + p.en : ""}; ${toneEn(a)} + ${toneEn(b)}; ${acc == null ? "not identified yet" : `identify accuracy ${acc}%`} — ${clip ? MOE_NAME : "no MOE clip yet"}`,
        onclick: async () => {
          showDetail(p);
          if (!clip) return;
          stopRecorders(); // a take in progress ends before the model plays
          btn.classList.add("is-playing");
          try { await playMoe(p.id); } catch { noClip(); }
          btn.classList.remove("is-playing");
        } },
      h("span", { class: "tp-zh", lang: "zh-Hant-TW" }, p.zh),
      h("span", { class: "tp-z", lang: "zh-Hant-TW" }, zy(p.zhuyin)),
      h("span", { class: "tp-acc" }, acc == null ? "·" : `${acc}%`));
      tr.append(h("td", {}, btn));
    }
    body.append(tr);
  }
  return h("table", { class: "tp-grid" },
    h("caption", { class: "sr-only" }, "20 個核心雙字詞 ", h("span", { lang: "en" }, "The 20 core tone-pair words: rows are the first syllable's tone, columns the second's")),
    h("thead", {}, head), body);
}

// A practice block: its kind (listening or speaking), what it does, and Start. One drill runs at a time on the page.
function drillBlock({ kind, n, zh, en, desc, count, empty, start }) {
  const id = `blk-${kind}`;
  const body = h("div", { class: "tg-block-body" });
  const btn = h("button", { type: "button", class: "btn primary tg-block-start", disabled: empty, onclick: () => {
    stopDrills();
    stopAudio(); // also ends a take of a drill restarted from its end card ("Another round" runs are not tracked here)
    for (const b of document.querySelectorAll(".tg-block-body")) clear(b);
    for (const b of document.querySelectorAll(".tg-block-start")) b.replaceChildren("▶ ", ...bi("開始", "Start"));
    run(start(body));
    btn.replaceChildren("↻ ", ...bi("重新開始", "Restart"));
    focusDrill(body); // into the drill (the keys 1–4 are heard only there); the mirror's Model once it has loaded
  } }, "▶ ", ...bi("開始", "Start"));
  return h("section", { class: `card tg-block tg-block-${kind}`, "aria-labelledby": id },
    h("div", { class: "tg-block-head" },
      h("h2", { id }, h("span", { class: "tg-step", "aria-hidden": "true" }, n), h("span", { lang: "zh-Hant-TW" }, zh), " ", enText(en, { class: "muted" })),
      h("span", { class: `tg-kind ${kind}` }, kind === "listen" ? ["聽 ", h("span", { lang: "en" }, "Listening")] : ["說 ", h("span", { lang: "en" }, "Speaking")])),
    h("p", { class: "small" }, desc[0], " ", enText(desc[1], { class: "muted" })),
    empty ? h("p", { class: "small muted" }, ...bi("還沒有可用的教育部錄音。", "No MOE clips built yet.")) : null,
    h("div", { class: "row" }, btn, empty ? null : h("span", { class: "small muted" }, `${count} 個詞 `, enText("words"))),
    body);
}

// ------------------------------------------------------------------ 4. pitch mirror: pick any word, keep the best take
function mirrorItems() {
  const byId = new Map();
  const add = (x, group) => {
    if (!x || !hasClip(x.id) || !x.zh || !x.zhuyin) return;
    let it = byId.get(x.id);
    if (!it) { it = { zh: x.zh, zhuyin: x.zhuyin, spoken: x.spoken || null, en: x.en || "", id: x.id, groups: new Set() }; byId.set(x.id, it); }
    it.groups.add(group);
  };
  for (const p of data.pairs) add(p, "pairs");
  for (const e of data.items) if (e && e.kind !== "sentence") add(e, "sandhi");
  for (const s of data.pool) add(s, "syl");
  return [...byId.values()];
}
// Zhuyin search: without a tone mark it ignores tones (ㄇㄚ finds 媽 麻 馬 罵); with one it must match exactly.
// Characters match characters; Latin text matches the English gloss.
function matches(it, q) {
  const s = q.replace(/\s+/g, "");
  if (!s) return true;
  if (it.zh.includes(s)) return true;
  if (/[ㄅ-ㄯ]/.test(s)) {
    const z = it.zhuyin.replace(/\s+/g, "");
    return /[ˊˇˋ˙]/.test(s) ? z.includes(s) : z.replace(/[ˊˇˋ˙]/g, "").includes(s);
  }
  return /[a-z]/i.test(s) && it.en.toLowerCase().includes(q.trim().toLowerCase());
}

function renderMirror(panel) {
  const all = mirrorItems();
  const groups = [["all", "全部", "All"], ["pairs", "雙字", "Pairs"], ["sandhi", "變調", "Sandhi"], ["syl", "單字", "Syllables"]];
  panel.append(h("p", { class: "muted small tg-lede" }, "選一個詞：先聽示範，再錄自己的，比較兩條音高曲線。錄音只存在這台裝置。",
    enText("Pick a word: hear the model, record yourself, compare the two pitch curves. Your recordings stay on this device.")));
  if (!all.length) { panel.append(notBuilt("還沒有可以練習的詞。", "No words with an MOE clip yet.")); return; }
  const input = h("input", { type: "search", class: "tg-search", lang: "zh-Hant-TW", value: mirrorState.q, autocomplete: "off", spellcheck: "false",
    placeholder: "ㄇㄚ · 媽 · fruit", "aria-label": "搜尋：注音、漢字或英文 Search by Zhuyin, characters or English" });
  const seg = h("div", { class: "seg", role: "group", "aria-label": "類別 Group" });
  const count = h("p", { class: "small muted tg-count", "aria-live": "polite" });
  const list = h("ul", { class: "tg-words" });
  const more = h("div", { class: "row" });
  const practiseBtn = h("button", { type: "button", class: "btn", onclick: () => {
    const shown = filtered();
    const scorable = shown.filter(it => modelOf(it.id)); // a word without a model curve never gets a best score
    const pool = scorable.length ? scorable : shown;
    const k = Math.min(6, pool.length);
    if (k) practise(panel, pickForPractice(pool, k), ["練 ", `${k} 個`, " ", enText(`Practise ${k}`, { class: "muted" })]);
  } }, ...bi("隨機練 6 個", "Practise 6 of these"));
  const filtered = () => {
    const q = mirrorState.q.trim();
    const out = all.filter(it => (mirrorState.group === "all" || it.groups.has(mirrorState.group)) && matches(it, q));
    // words with a model curve (so a score) first; a search puts an exact character match, then shorter words, first
    const scored = it => (modelOf(it.id) ? 1 : 0);
    if (q) { const s = q.replace(/\s+/g, ""); out.sort((a, b) => (b.zh === s) - (a.zh === s) || a.zhuyin.length - b.zhuyin.length || scored(b) - scored(a)); }
    else out.sort((a, b) => scored(b) - scored(a));
    return out;
  };
  const draw = () => {
    const ms = mirrorStats();
    const items = filtered();
    for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.id === mirrorState.group));
    count.replaceChildren(`${items.length} 個詞`, enText(` ${items.length} word${items.length === 1 ? "" : "s"}`));
    practiseBtn.disabled = !items.length;
    clear(list);
    for (const it of items.slice(0, mirrorState.shown)) {
      const best = ms[it.id] && ms[it.id].best != null ? ms[it.id].best : null;
      const scored = !!modelOf(it.id);
      list.append(h("li", {}, h("button", { type: "button", class: "tg-word", "data-id": it.id,
        "aria-label": `${it.zh} ${it.zhuyin}${it.en ? ", " + it.en : ""}; ${best != null ? `best score ${best}` : "not practised yet"}${scored ? "" : "; no model curve, so no score"}. 練習 Practise`,
        onclick: () => practise(panel, [it], ["鏡子 ", enText("Pitch mirror", { class: "muted" })]) },
      h("span", { class: "tg-word-zh" }, ruby(it.zh, it.zhuyin, { cls: "", spoken: it.spoken })),
      it.en ? h("span", { class: "tg-word-en lc-en", lang: "en" }, it.en) : h("span", { class: "tg-word-en" }),
      h("span", { class: "tg-best" + (best != null ? "" : " none") }, best != null ? ["最佳 ", h("span", { lang: "en" }, "best"), " ", h("b", {}, best)] : scored ? "—" : ["不評分 ", h("span", { lang: "en" }, "no score")]))));
    }
    clear(more);
    if (items.length > mirrorState.shown) {
      more.append(h("button", { type: "button", class: "btn", onclick: () => {
        const from = mirrorState.shown;
        mirrorState.shown += 40;
        draw();
        const tile = list.children[from] && list.children[from].querySelector("button"); // this button is gone: focus the first new word
        if (tile) tile.focus();
      } }, ...bi(`再顯示 ${Math.min(40, items.length - mirrorState.shown)} 個`, "Show more")),
        h("span", { class: "small muted" }, `${mirrorState.shown} / ${items.length}`));
    }
  };
  for (const [id, zh, en] of groups) {
    const n = id === "all" ? all.length : all.filter(it => it.groups.has(id)).length;
    seg.append(h("button", { type: "button", "data-id": id, "aria-pressed": "false", disabled: !n, onclick: () => { mirrorState.group = id; mirrorState.shown = 40; draw(); } },
      zh, " ", h("span", { lang: "en", class: "seg-en" }, en), h("span", { class: "seg-n" }, ` ${n}`)));
  }
  input.addEventListener("input", () => { mirrorState.q = input.value; mirrorState.shown = 40; draw(); });
  panel.append(h("div", { class: "tg-search-row" }, input, seg), h("div", { class: "row tg-count-row" }, count, practiseBtn), list, more);
  draw();
}

// The mirror on one or a few words, under a Back button (the drill's end card has one too).
function practise(panel, items, title) {
  stopDrills();
  stopAudio();
  clear(panel);
  // Back to the list, focus on the word just practised (its tile shows the new best), else on the panel; not on the
  // search field, which would open the keyboard on a phone.
  const back = () => {
    stopDrills(); stopAudio(); clear(panel); renderMirror(panel);
    const tile = items.length === 1 ? [...panel.querySelectorAll(".tg-word")].find(b => b.dataset.id === items[0].id) : null;
    (tile || panel).focus({ preventScroll: !tile });
  };
  const backBtn = () => h("button", { type: "button", class: "btn", onclick: back }, "← ", ...bi("回列表", "Back to the list"));
  const box = h("div");
  panel.append(h("div", { class: "row tg-drill-head" }, h("h2", { class: "tg-drill-title" }, title), backBtn()), box);
  run(mirrorDrill(box, items, { actions: () => [backBtn()], focus: true, onDone: () => {} }));
  focusDrill(box); // the tile that had focus is gone: Model takes it once the drill has loaded
}

// ------------------------------------------------------------------ 5. sandhi: the four rules, the switch, a listening check, a mirror
function renderSandhi(panel) {
  if (!data.rules.length && !data.items.length) { panel.append(notBuilt()); return; }
  const rules = data.rules.length ? data.rules : [...new Set(data.items.map(e => e.rule))].map(id => ({ id, zh: RULE_SHORT[id] || id, en: id }));
  let cur = store.get("tones.sandhiRule", rules[0].id);
  if (!rules.some(r => r.id === cur)) cur = rules[0].id;
  const box = h("div", { class: "tg-rule" });
  const seg = h("div", { class: "seg tg-rule-seg", role: "group", "aria-label": "規則 Rule" });
  const draw = () => {
    for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.id === cur));
    stopDrills();
    stopAudio();
    ruleView(clear(box), rules.find(r => r.id === cur));
  };
  for (const r of rules) {
    seg.append(h("button", { type: "button", "data-id": r.id, "aria-pressed": "false", "aria-label": `${r.zh} ${arrows(r.en)}`, lang: "zh-Hant-TW",
      onclick: () => { cur = r.id; store.set("tones.sandhiRule", cur); draw(); } }, RULE_SHORT[r.id] || r.zh));
  }
  panel.append(h("div", { class: "tg-sandhi-bar" }, seg, sandhiSwitch(() => redrawSandhi && redrawSandhi())), box);
  draw();
}

// "Show sandhi" (§5 display toggles): the spoken tone over the written one, everywhere ruby() is used.
function sandhiSwitch(onChange) {
  const on = () => !!settings().sandhi;
  const btn = h("button", { type: "button", role: "switch", class: "tg-switch", "aria-checked": String(on()), onclick: () => {
    setSetting("sandhi", !on());
    btn.setAttribute("aria-checked", String(on()));
    onChange();
  } }, h("span", { class: "tg-switch-track", "aria-hidden": "true" }, h("span", { class: "tg-switch-knob" })), h("span", {}, "顯示變調 ", h("span", { lang: "en" }, "Show sandhi")));
  return btn;
}

// focusOn: "check" | "mirror", the action to focus (coming back from that drill)
function ruleView(box, rule, focusOn = null) {
  const words = data.items.filter(e => e.rule === rule.id && e.kind !== "sentence");
  const sents = data.items.filter(e => e.rule === rule.id && e.kind === "sentence");
  const checkPool = sandhiCheckPool(rule.id);
  const answers = new Set(checkPool.map(x => x.answer)).size;
  const checkOk = checkPool.length >= MIN_CHECK && answers >= 2;
  // the mirror: the rule's words with a model curve, and for 一 / 不 the other words that have the character
  const mirrorPool = moeOnly([...words, ...data.items.filter(e => e && e.rule !== rule.id && e.kind !== "sentence" && hasTarget(e, checkGroup(rule.id)))], "sandhi mirror")
    .filter((e, i, a) => modelOf(e.id) && a.findIndex(x => x.id === e.id) === i && !(e.said_ok || []).includes(false));
  const cs = store.get(CHECK_KEY, {})[checkGroup(rule.id)];
  const acc = recentAccuracy(cs);
  const lists = h("div");
  const drawLists = () => {
    const on = !!settings().sandhi;
    clear(lists);
    if (words.length) lists.append(h("h3", {}, "詞 ", enText("Words", { class: "muted" })), h("ul", { class: "sd-list" }, words.map(e => sdItem(e, on))));
    if (sents.length) {
      lists.append(h("h3", {}, "句子 ", enText("Sentences", { class: "muted" })),
        h("p", { class: "small muted" }, "句子用合成語音（標示 TTS）：聽和跟讀用，不拿來練聲調。", enText("Sentences use TTS (labelled): for listening and shadowing, never for tone drills.")),
        h("ul", { class: "sd-list sd-sents" }, sents.map(e => sdItem(e, on))));
    }
  };
  redrawSandhi = drawLists;
  let opened = null;
  const back = () => { stopDrills(); stopAudio(); ruleView(clear(box), rule, opened); };
  const backBtn = () => h("button", { type: "button", class: "btn", onclick: back }, "← ", ...bi("回規則", "Back to the rule"));
  const openDrill = (kind, title, factory) => {
    stopDrills();
    stopAudio();
    redrawSandhi = null;
    opened = kind;
    clear(box);
    const stage = h("div");
    box.append(h("div", { class: "row tg-drill-head" }, h("h2", { class: "tg-drill-title" }, title), backBtn()), stage);
    run(factory(stage));
    focusDrill(stage); // the button that opened it is gone
  };
  const t3 = checkGroup(rule.id) === "t3";
  const notes = []; // why an action is off
  if (!checkPool.length && !mirrorPool.length) notes.push(["這個規則的詞還沒有教育部錄音，所以還不能做聽力檢查和鏡子練習。", "No MOE clips for this rule's words yet, so no listening check or mirror."]);
  else {
    if (!checkPool.length) notes.push(["這個規則的詞還沒有教育部錄音，所以還不能做聽力檢查。", "No MOE clips for this rule's words yet, so no listening check."]);
    else if (!checkOk) {
      notes.push([`這個聽力檢查目前只有 ${checkPool.length} 個詞有教育部錄音${answers < 2 ? "，答案也都一樣" : ""}。至少要 ${MIN_CHECK} 個詞和兩種答案，不然光記順序就能答對，所以先不開放。`,
        `Only ${checkPool.length} words for this check have an MOE clip so far${answers < 2 ? ", all with the same answer" : ""}. It needs at least ${MIN_CHECK} words and two different answers, or the answers could be learnt from the order alone, so it stays off until then.`]);
    }
    if (!mirrorPool.length) notes.push(["這個規則的詞還沒有示範曲線，所以還不能做鏡子練習。", "No model curves for this rule's words yet, so no mirror."]);
  }
  box.append(
    // rule.en is "3+3 -> 2+3" / "Half-third", but just "一" / "不" for those two: give them an English name
    h("h2", { class: "sd-title" }, h("span", { lang: "zh-Hant-TW" }, rule.zh), " ",
      enText(/[A-Za-z0-9]/.test(rule.en || "") ? arrows(rule.en) : `Tone sandhi of ${rule.en || rule.id}`, { class: "muted" })),
    rule.explain_zh ? h("p", { lang: "zh-Hant-TW" }, rule.explain_zh) : "", // "" not null: append() would print "null"
    rule.explain_en ? h("p", { class: "muted" }, enText(rule.explain_en, { class: "lc-en" })) : "",
    h("div", { class: "row tg-rule-actions" },
      h("button", { type: "button", class: "btn", "data-drill": "check", disabled: !checkOk,
        onclick: () => openDrill("check", ["聽力檢查 ", enText("Listening check", { class: "muted" })], stage => sandhiCheck(stage, rule.id, checkPool, { actions: () => [backBtn()] })) },
      "▶ ", ...bi("聽力檢查", "Listening check"), acc != null ? h("span", { class: "tg-pill" }, `${acc}%`) : null),
      h("button", { type: "button", class: "btn", "data-drill": "mirror", disabled: !mirrorPool.length,
        onclick: () => openDrill("mirror", ["鏡子 ", enText("Pitch mirror", { class: "muted" })], stage => mirrorDrill(stage, pickForPractice(mirrorPool, 6), { actions: () => [backBtn()], focus: true })) },
      "● ", ...bi("鏡子練習", "Mirror (speaking)"))),
    ...notes.map(([zh, en]) => h("p", { class: "small muted tg-rule-hint" }, ...bi(zh, en))),
    h("p", { class: "small muted tg-rule-hint" }, ...(t3
      ? bi("聽力檢查把 3+3 和半三聲的詞混在一起：寫作三聲的第一個字，說成二聲還是三聲？", "The listening check mixes 3+3 and half-third words: is the written third tone said as tone 2 or tone 3?")
      : bi(`聽力檢查：聽詞，選「${rule.id === "yi" ? "一" : "不"}」說成第幾聲。`, `Listening check: hear the word, choose the tone ${rule.id === "yi" ? "一" : "不"} is said with.`))),
    lists);
  drawLists();
  const again = focusOn && box.querySelector(`[data-drill="${focusOn}"]`);
  if (again) (again.disabled ? box.querySelector(".sd-title") : again).focus(); // "Back" is gone: back where the learner left
}

function sdItem(e, sandhiOn) {
  const sent = e.kind === "sentence";
  const changes = !!e.spoken && e.spoken !== e.zhuyin;
  const tag = e.no_change ? h("span", { class: "sd-tag same" }, "不變 ", h("span", { lang: "en" }, "no change"))
    : changes ? h("span", { class: "sd-tag" }, "變調 ", h("span", { lang: "en" }, "sandhi")) : null;
  const play = sent && !hasClip(e.id) ? playButton({ audio: e.audio || null, zh: e.zh }) : playMoeBtn(e);
  // base vs spoken: the ruby shows one (the switch decides which), this line the other. A word gets its whole
  // Zhuyin; a sentence only the syllables that change (一 ㄧˊ), so the line stays short.
  const z = !changes ? null : sent ? changedSyllables(e, sandhiOn ? "base" : "said") : zy(sandhiOn ? e.zhuyin : e.spoken);
  const other = !z ? null : h("span", { class: "sd-other" + (sandhiOn ? "" : " said") },
    ...(sandhiOn ? ["寫作 ", h("span", { lang: "en" }, "written")] : ["說成 ", h("span", { lang: "en" }, "said")]), " ",
    h("span", { class: "zhuyin", lang: "zh-Hant-TW" }, z));
  return h("li", { class: "sd-item" + (sent ? " sd-sent" : "") },
    h("span", { class: "sd-zh" }, ruby(e.zh, e.zhuyin, { cls: "", spoken: e.spoken })),
    h("span", { class: "sd-meta" }, e.en ? enText(e.en, { class: "sd-en lc-en" }) : null, tag, other,
      (e.said_ok || []).includes(false) ? h("span", { class: "sd-clipnote small muted" },
        ...bi("教育部錄音這裡唸原調，所以不放進練習", "The MOE recording keeps the written tone here, so it is left out of the drills")) : null),
    h("span", { class: "sd-play" }, play));
}

// "一 ㄧˊ　一 ㄧˋ": each character whose spoken syllable differs from the written one, with its said (or written)
// form, as nowrap nodes; null if nothing differs.
function changedSyllables(e, which) {
  const base = syllables(e.zhuyin || ""), said = syllables(e.spoken || ""), chars = [...(e.zh || "")].filter(c => CJK.test(c));
  if (base.length !== said.length || chars.length !== base.length) return zy(which === "base" ? e.zhuyin : e.spoken);
  const out = base.map((b, i) => (b === said[i] ? null : `${chars[i]} ${which === "base" ? b : said[i]}`)).filter(Boolean);
  return out.length ? out.map((x, i) => [i ? "　" : null, h("span", { class: "syl" }, x)]) : null;
}

// ------------------------------------------------------------------ sandhi listening check (listening only, MOE audio only)
const checkGroup = id => (id === "3+3" || id === "half3" ? "t3" : id);
const TARGET = { yi: "一", bu: "不" };
const hasTarget = (e, g) => !!TARGET[g] && String(e.zh || "").includes(TARGET[g]);
// Fewer words than this, or a single answer, and the check could be passed from the order or the word alone: it stays off.
const MIN_CHECK = 4;
// Items: {e, i (the syllable asked about), base, said, answer (its spoken tone)}. 3+3 and half-third ask about the first
// syllable (a written tone 3: said 2 before another tone 3, else stays a low 3); 一 / 不 ask about that character, in
// the rule's own words and in any other clip-backed word that has it (不一樣, filed under 一, also asks how 不 is
// said there: it keeps ㄅㄨˋ before the 一). One item per clip.
function sandhiCheckPool(ruleId) {
  const g = checkGroup(ruleId);
  const out = [], seen = new Set();
  for (const e of data.items) {
    if (!e || e.kind === "sentence" || !hasClip(e.id) || seen.has(e.id)) continue;
    if (checkGroup(e.rule) !== g && !hasTarget(e, g)) continue;
    const base = syllables(e.zhuyin || ""), said = syllables(e.spoken || e.zhuyin || "");
    const chars = [...(e.zh || "")].filter(c => CJK.test(c));
    if (!base.length || said.length !== base.length || chars.length !== base.length) continue;
    const i = g === "t3" ? 0 : chars.indexOf(TARGET[g]);
    if (i < 0 || (g === "t3" && toneOf(base[0]) !== 3)) continue;
    const answer = toneOf(said[i]);
    if (answer < 1 || answer > 4) continue;
    if (e.said_ok && e.said_ok[i] === false) continue; // the MOE clip does not say the taught tone here (build check)
    seen.add(e.id);
    out.push({ e, i, base: base[i], said: said[i], answer });
  }
  return out;
}
// The next word: at random, and not the word just heard unless it is the only one with its answer (leaving it out
// would then give the next answer away). Never a fixed cycle: the old 3-back window made a 2-word pool alternate.
function nextCheckItem(pool, prev) {
  const rest = prev ? pool.filter(x => x !== prev) : pool;
  return pick(prev && rest.some(x => x.answer === prev.answer) ? rest : pool);
}
function recordCheck(group, ok) {
  const all = store.get(CHECK_KEY, {});
  const s = all[group] || { n: 0, correct: 0, recent: [] };
  s.n++; if (ok) s.correct++;
  s.recent = [...(s.recent || []), ok ? 1 : 0].slice(-30);
  all[group] = s;
  store.set(CHECK_KEY, all);
}
// Same controller shape as drills.js ({stop(), done}); stop() ends it and stops the audio.
function sandhiCheck(container, ruleId, pool, opts = {}) {
  const { n = 8, actions = () => [] } = opts;
  const g = checkGroup(ruleId);
  assertMoeOnly(pool.map(x => x.e), "sandhi check", data.audio); // QA §10 item 5: MOE human audio only
  const root = h("div", { class: "drill tg-check" });
  container.append(root);
  let over = false, k = 0, correct = 0, cur = null, resolveDone;
  const done = new Promise(r => { resolveDone = r; });
  const end = stopped => {
    if (over) return;
    over = true; cur = null;
    if (stopped) stopAudio();
    resolveDone({ drill: "sandhi-check", rule: ruleId, n: k, correct, accuracy: k ? Math.round(100 * correct / k) : null, stopped });
  };
  const prog = h("div", { class: "progress drill-progress" }, h("i", { style: "width:0%" }));
  const stage = h("div");
  root.append(prog, stage);
  root.addEventListener("keydown", e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || !cur) return;
    const d = Number(e.key);
    if (d >= 1 && d <= 4) { e.preventDefault(); cur(d); }
  });
  const target = TARGET[g];
  const question = g === "t3" ? ["第一個字寫作三聲，說成第幾聲？", "The first syllable is written tone 3. Which tone is it said with?"]
    : [`「${target}」在這裡說成第幾聲？`, `Which tone is ${target} said with here?`];
  let prev = null, first = true;

  function trial() {
    if (over) return;
    clear(stage);
    prog.firstChild.style.width = `${Math.round(100 * k / n)}%`;
    const item = prev = nextCheckItem(pool, prev);
    const { e } = item;
    const base = baseOf(item.base);
    let answered = false;
    const playIt = () => playMoe(e.id).catch(noClip);
    // Zhuyin hidden until the answer (the written tones would give the rule away): this is a listening check.
    const word = ruby(e.zh, e.zhuyin, { cls: "hide-ruby", sandhi: false });
    const rubies = word.querySelectorAll("ruby");
    if (rubies[item.i]) rubies[item.i].classList.add("tg-target");
    const fb = h("p", { class: "feedback", "aria-live": "polite" });
    const reveal = h("div", { class: "drill-reveal" });
    const choices = h("div", { class: "tone-choices", role: "group", "aria-label": "選聲調 Choose the tone" });
    const next = h("button", { type: "button", class: "btn", disabled: true, onclick: () => (k >= n ? finish() : trial()) }, ...bi("下一題", "Next →"));
    const play = h("button", { type: "button", class: "btn primary drill-play", "aria-label": `再聽一次 Play again: the test word — ${MOE_NAME}`, onclick: playIt }, "🔊 ", ...bi("再聽一次", "Play again"));
    const buttons = {};
    const answer = t => {
      if (answered) { playIt(); return; }
      answered = true;
      k++;
      const ok = t === item.answer;
      if (ok) correct++;
      recordCheck(g, ok);
      buttons[t].classList.add(ok ? "correct" : "wrong");
      buttons[item.answer].classList.add("correct");
      fb.replaceChildren(...(ok ? ["對了 ✓ ", enText("Correct.")] : [`不對 ✗ 是${TONE_NAMES[item.answer]}。`, enText(` It is tone ${item.answer}.`)]));
      fb.className = "feedback " + (ok ? "good" : "bad");
      play.setAttribute("aria-label", `再聽一次 Play again: ${e.zh} ${e.zhuyin} — ${MOE_NAME}`);
      reveal.append(h("span", { class: "big-zh" }, ruby(e.zh, e.zhuyin, { cls: "", spoken: e.spoken, sandhi: true })),
        h("span", { class: "drill-gloss" }, e.en ? enText(e.en, { class: "lc-en" }) : null,
          h("span", { class: "small", style: "display:block" }, ...(item.base === item.said
            ? [`不變：寫作、說成都是 ${item.base}。`, enText(` No change: written and said ${item.base}.`)]
            : [`寫作 ${item.base}，說成 ${item.said}。`, enText(` Written ${item.base}, said ${item.said}.`)]))));
      if (k >= n) next.replaceChildren(...bi("完成", "Finish"));
      next.disabled = false; next.classList.add("primary"); next.focus();
    };
    for (const t of [1, 2, 3, 4]) {
      const syl = withTone(base, t);
      const b = h("button", { type: "button", class: "tone-choice", "aria-label": `${TONE_NAMES[t]} ${syl}, tone ${t} (${CHAO[t]})`, onclick: () => answer(t) },
        h("span", { class: "key-hint", "aria-hidden": "true" }, t),
        h("span", { class: "tone-icon", "aria-hidden": "true" }, icon(t, 34)),
        h("span", { class: "tone-syl", lang: "zh-Hant-TW" }, syl),
        h("span", { class: "tone-name" }, h("span", { lang: "zh-Hant-TW" }, TONE_NAMES[t]), " ", CHAO[t]));
      buttons[t] = b;
      choices.append(b);
    }
    cur = answer;
    stage.append(h("p", { class: "muted small drill-meta" }, `第 ${k + 1} / ${n} 題 · ${question[0]}`, " ", enText(question[1])),
      h("div", { class: "tg-check-word" }, h("span", { class: "big-zh" }, word), e.en ? enText(e.en, { class: "muted small lc-en" }) : null),
      h("div", { class: "drill-top" }, play, moeBadge()), choices, fb, reveal, h("div", { class: "row" }, next));
    // also on the first trial (a check starts only from a button, which is gone now): the keys 1–4 work at once
    play.focus({ preventScroll: !first });
    first = false;
    playIt();
  }
  function finish() {
    cur = null;
    prog.firstChild.style.width = "100%";
    const acc = k ? Math.round(100 * correct / k) : 0;
    const head = h("h3", { tabindex: "-1" }, "本輪 ", enText("This round"), ` ${correct}/${k}（${acc}%）`);
    clear(stage).append(h("div", { class: "card drill-summary" }, head,
      h("p", { class: "muted small" }, ...(acc >= 85 ? bi("很好。", "Well done.") : bi("再聽一輪，注意後面那個字的聲調。", "Go again, and listen for the tone of the syllable that follows."))),
      h("div", { class: "row drill-actions" },
        h("button", { type: "button", class: "btn primary", onclick: () => { stopAudio(); root.remove(); run(sandhiCheck(container, ruleId, pool, opts)); } }, ...bi("再一輪", "Another round")),
        actions())));
    head.focus(); // Finish is gone: the score is read out, and Tab reaches "Another round"
    end(false);
  }
  if (!pool.length) { stage.append(h("p", {}, ...bi("沒有可用的錄音。", "No MOE clips for this check yet."))); setTimeout(() => end(false), 0); }
  else trial();
  return { stop: () => end(true), done };
}

// ------------------------------------------------------------------ 6. Taiwan (MOE) vs Mainland readings, §6.5
function renderReadings(panel) {
  if (!data.readings.length) { panel.append(notBuilt()); return; }
  const diff = data.readings.filter(r => r.type !== "not_difference");
  const same = data.readings.filter(r => r.type === "not_difference");
  panel.append(h("p", { class: "muted small tg-lede" }, "這些詞在臺灣（教育部）和大陸讀音不同。學教育部的讀音（第一個列出的讀音）。",
    enText("These words are read differently in Taiwan (MOE) and on the Mainland. Learn the MOE reading, the first-listed one.")));
  const th = (zh, en, cls = "") => h("th", { scope: "col", class: cls }, zh, " ", h("span", { class: "en", lang: "en" }, en));
  // A row's §6.5 note (the 又音 sentence, 和's 語音) goes on its own full-width line under the row, so the word
  // column stays narrow on a phone.
  const rows = diff.flatMap(r => [
    h("tr", { class: r.note ? "has-note" : "" },
      h("th", { scope: "row", class: "rd-word" }, h("span", { class: "rd-zh", lang: "zh-Hant-TW" }, r.zh)),
      h("td", { class: "rd-z zhuyin", lang: "zh-Hant-TW" }, zy(r.zhuyin)),
      h("td", { class: "rd-py", lang: "zh-Latn-pinyin" }, r.mainland || "—"),
      h("td", { class: "rd-play" }, playMoeBtn(r, { badge: false, compact: true }))),
    r.note ? h("tr", { class: "rd-note-row" }, h("td", { colspan: "4" }, h("span", { class: "sr-only", lang: "zh-Hant-TW" }, r.zh), " ", enText(r.note))) : null,
  ]).filter(Boolean);
  panel.append(h("div", { class: "tg-table-wrap" }, h("table", { class: "tg-table rd-table" },
    h("caption", { class: "sr-only" }, "臺灣與大陸讀音 ", h("span", { lang: "en" }, "Taiwan (MOE) and Mainland readings")),
    h("thead", {}, h("tr", {}, th("詞", "Word"), th("教育部", "MOE: teach this"), th("大陸", "Mainland"), th("錄音", "MOE", "rd-play"))),
    h("tbody", {}, rows))));
  // §6.5's 又音 sentence: the content puts it in the notes of the four words; say it here only if it is not there.
  if (!diff.some(r => /又音/.test(r.note || ""))) {
    panel.append(h("p", { class: "small muted" }, "有些字也有列出的又音（期 ㄑㄧ、微 ㄨㄟ、究 ㄐㄧㄡ、癌 ㄞˊ）。檢查程式接受，但這裡教第一個列出的讀音。",
      enText(" Some characters also have a listed 又音 (期 ㄑㄧ, 微 ㄨㄟ, 究 ㄐㄧㄡ, 癌 ㄞˊ). The verifier accepts these, but the app teaches the first-listed reading.")));
  }
  if (same.length) {
    panel.append(h("section", { class: "tg-section", "aria-labelledby": "nd-h" },
      h("h2", { id: "nd-h" }, "這些不是差異 ", enText("These are NOT differences", { class: "muted" })),
      h("p", { class: "small muted" }, "這些詞兩岸讀音一樣，不是差異：照教育部唸就對了。", enText("These are not Taiwan–Mainland differences: read them as MOE writes them.")),
      h("ul", { class: "sd-list" }, same.map(r => h("li", { class: "sd-item" },
        h("span", { class: "sd-zh" }, ruby(r.zh, r.zhuyin, { cls: "" })),
        h("span", { class: "sd-meta" }, r.note ? enText(r.note, { class: "sd-en lc-en" }) : null),
        h("span", { class: "sd-play" }, playMoeBtn(r)))))));
  }
  panel.append(h("p", { class: "small" }, h("a", { href: "#basics" }, "臺灣的輕聲 ", h("span", { lang: "en" }, "The neutral tone in Taiwan")), " → ", ...bi("在「基礎」。", "is on the Basics tab.")));
}

main().catch(err => { app.append(h("p", { class: "feedback bad" }, "載入失敗 Could not load data: ", err.message)); console.error(err); });
