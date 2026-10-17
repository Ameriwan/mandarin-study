// 進階 Advanced (MASTER_PROMPT §5.8, §8.3–§8.5; M6 design "Tracks"). Eight tracks, each a ladder whose steps open by
// the learner's TBCL level, plus the immersion explainer and the Zhuyin typing setup (§8.5):
//   reading     graded texts: (1) Zhuyin on every word, (2) Zhuyin only on words not marked "known" in the Library
//               (library.js statusOf), (3) no Zhuyin, tap a word to look it up (library.js findEntry / entryHref,
//               library.html?q=), (4) MOE dictionary readings (Shadowing page), (5) authentic text links, (6) TOCFL mock
//   listening   unit dialogues, MOE readings at full speed, 小公視, Talk Talk Mandarin, 公視新聞, and "real Taiwan speech"
//               (§6.6 colloquial features to understand, not copy; no synthetic audio of them)
//   grammar     TBCL grammar by level from the Library (levels 1–3 written, 4–5 "coming with LEVEL-UP"), Chinese
//               Grammar Wiki links (CC BY-NC-SA, Simplified: link only)
//   taiwan      links into the Library's Taiwan-vs-Mainland and Taiwan readings collections
//   characters  the 214 Kangxi radicals and the TBCL character list per level, each character linked to the MOE
//               stroke-order page (BY-NC-ND: link only; no Hanzi Writer)
//   output      journal prompts (typed, "copy for CORRECT"), the monthly 1-minute monologue, Pingtung role-plays
//   register    (Band B+) 書面語/口語 pairs, news vocabulary, letter and LINE models, 成語 from the MOE 成語典 (CC BY-ND:
//               shown unmodified, with attribution)
//   tocfl       official mock tests by band with a timer; the real exam mentioned once at Band A and once at Band B
//
// Level: app.js levelState() when it exists ({level} or a number), else store "level" (set by the Plan page, as
// plan.js levelInfo() reads it). No level = unplaced: every step is open and labelled with its level.
//
// Data (all optional; a missing file shows a notice for its part): docs/data/reading.json, advanced.json,
// chengyu.json, resources.json, characters.json (the build writes them), shadowing.json (count of MOE readings).
// The readers below accept several shapes (see norm* and the field lists in each); the exact names are in the report.
// Every external URL is taken from resources.json when it lists it ({url, verified, checked, status}); a link the
// file does not list, or lists with verified false, is shown marked "未驗證 unverified".
//
// Stored (app.js store, prefix "gy."):
//   adv.showAll   true: open the steps above the learner's level too
//   adv.readMode  1 | 2 | 3 (reading ladder step used in the reader)
//   adv.read      {textId: {date, mode}}  texts marked as read
//   adv.journal   {promptId: {text, date}}  journal drafts
//   adv.timer     {total (s), endAt (ms) | null, left (s)}  the TOCFL timer, kept across reloads
//   adv.examNote  {A: date, B: date}  the "real exam" note dismissed per band
// Recordings (IndexedDB via app.js saveRecording): "monologue:<YYYY-MM>" {blob, ts, date, month, topic, dur}.
import { h, clear, mountShell, store, loadJSON, ruby, playButton, playFile, stopAudio, settings, enText, toast, today,
  logMinutes, trackTime, syllables, Recorder, canRecord, saveRecording, listRecordings } from "./app.js";
import * as App from "./app.js";
import { loadLibrary, findEntry, resolve, statusOf, setStatus, entryHref, zhuyinKey, STATUSES } from "./library.js";

// ------------------------------------------------------------------ constants
// §8.1: TBCL level -> TOCFL / CEFR label
export const BANDS = { 1: ["準備級一級", "Novice 1"], 2: ["準備級二級", "Novice 2 · A1"], 3: ["基礎級", "Band A · A2"],
  4: ["進階級", "Band B · B1"], 5: ["高階級", "Band B · B2"], 6: ["流利級", "Band C · C1"], 7: ["精通級", "C2"] };
const CEFR = { A1: 2, A2: 3, B1: 4, B2: 5, C1: 6, C2: 7 };
const ZH_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7 };
const GRAMMAR_COUNT = { 1: 15, 2: 92, 3: 134, 4: 149, 5: 106 }; // §8.1
const GRAMMAR_WRITTEN = 3;  // levels 1–3 are written; 4–5 come with LEVEL-UP
const REGISTER_LEVEL = 4;   // Band B+
const MONOLOGUE_S = 60;
const HAN1 = /[㐀-鿿豈-﫿]/; // the same test as app.js ruby()
const HAN = /\p{sc=Han}/u;
const STROKE = c => `https://stroke-order.learningweb.moe.edu.tw/searchW.jsp?WORD=${encodeURIComponent(c)}`;

// External links the tracks use. url: the fallback when resources.json does not list it (from the spec; shown as
// unverified). ids / match: how a resources.json entry is recognised (its id, or a substring of its url or title).
export const LINKS = {
  mdnkids: { url: "https://www.mdnkids.com/news.asp", zh: "國語日報", en: "Mandarin Daily News", band: "A2–B2", level: 3,
    ids: ["mdnkids", "guoyu-ribao", "mandarin-daily-news"], match: ["mdnkids"] },
  ptsNews: { url: "https://news.pts.org.tw", zh: "公視新聞網", en: "PTS News", band: "B2+", level: 5,
    ids: ["pts-news", "ptsnews", "pts_news"], match: ["news.pts.org.tw"] },
  ptsVideo: { url: "https://news.pts.org.tw/video", zh: "公視新聞影音", en: "PTS News video", band: "B2+", level: 5,
    ids: ["pts-news-video", "ptsnews-video", "pts-video"], match: ["news.pts.org.tw/video"] },
  ptsKids: { url: null, zh: "小公視", en: "PTS children's channel", band: "A2–B1", level: 3,
    ids: ["pts-kids", "ptskids", "xiao-gongshi"], match: ["小公視", "kids.pts"] },
  talktalk: { url: "https://linktr.ee/ttmctw", zh: "說說話 Talk Talk Mandarin", en: "podcast with Taiwanese hosts (transcripts)", band: "B1+", level: 4,
    ids: ["talk-talk-mandarin", "talktalk", "ttmctw"], match: ["ttmctw", "talk talk mandarin", "talktalkmandarin"] },
  legitMando: { url: "https://www.taiwanplus.com/shows/mandarin-learning/all/523/legit-mando", zh: "TaiwanPlus Legit Mando", en: "short skits on everyday Taiwan phrases",
    band: "A1–A2", level: 1, ids: ["legit-mando", "legitmando", "taiwanplus-legit-mando"], match: ["legit-mando", "legit mando"] },
  tocfl: { url: "https://tocfl.edu.tw/tocfl/index.php/exam/test", zh: "華語文能力測驗 模擬試題", en: "TOCFL official mock tests", level: 1,
    ids: ["tocfl", "tocfl-mock", "tocfl-mock-tests"], match: ["tocfl.edu.tw"] },
  cgw: { url: "https://resources.allsetlearning.com/chinese/grammar/", zh: "Chinese Grammar Wiki", en: "(Simplified; CC BY-NC-SA, link only)", level: 1,
    ids: ["chinese-grammar-wiki", "cgw", "allset"], match: ["allsetlearning.com/chinese/grammar"] },
  stroke: { url: "https://stroke-order.learningweb.moe.edu.tw/", zh: "教育部《常用國字標準字體筆順學習網》", en: "MOE stroke order", level: 1,
    ids: ["moe-stroke-order", "stroke-order", "stroke"], match: ["stroke-order.learningweb"] },
  i2bopomo: { url: "https://i2bopomo.com/", zh: "i2bopomo", en: "Zhuyin typing practice", level: 1, ids: ["i2bopomo"], match: ["i2bopomo"] },
  idioms: { url: "https://dict.idioms.moe.edu.tw/", zh: "教育部《成語典》", en: "MOE Dictionary of Chinese Idioms", level: 4,
    ids: ["moe-idioms", "chengyu", "idioms"], match: ["dict.idioms.moe"] },
};

// ------------------------------------------------------------------ small helpers (pure)
const arr = x => (Array.isArray(x) ? x : []);
const str = x => (x == null ? "" : Array.isArray(x) ? x.filter(v => v != null && v !== "").join("；") : typeof x === "object" ? "" : String(x));
const isObj = x => !!x && typeof x === "object" && !Array.isArray(x);
export function firstKey(o, ...keys) {
  if (!isObj(o)) return [null, undefined];
  for (const k of keys) { const v = o[k]; if (v != null && v !== "") return [k, v]; }
  return [null, undefined];
}
export const first = (o, ...keys) => firstKey(o, ...keys)[1];
const isZy = s => /[ㄅ-ㄯ]/.test(String(s || "")) && /^[ㄅ-ㄯㆠ-ㆿˉˊˇˋ˙\s]+$/.test(String(s || "").trim());
const cjkOf = s => [...String(s)].filter(c => HAN1.test(c)).join("");

// A TBCL level 1–7 from a number, "第3級", "L3", "3*", "Level 3", a CEFR code ("A2", "B2+", "A2–B2" → the lower end),
// "Band A/B/C", "準備級一級", or an object {level | tbcl | n | min}. null when none.
export function levelNum(x) {
  if (x == null || x === "") return null;
  if (typeof x === "number") return x >= 1 && x <= 7 ? Math.floor(x) : null;
  if (Array.isArray(x)) return x.map(levelNum).filter(Boolean).sort((a, b) => a - b)[0] || null;
  if (typeof x === "object") return levelNum(x.level ?? x.tbcl ?? x.n ?? x.min ?? null);
  const s = String(x);
  const c = s.match(/(?:^|[^A-Za-z])([ABCabc])\s*([12])(?![0-9])/);
  if (c) return CEFR[c[1].toUpperCase() + c[2]];
  const b = s.match(/band\s*([ABC])/i);
  if (b) return { A: 3, B: 4, C: 6 }[b[1].toUpperCase()];
  const z = s.match(/準備級\s*([一二])級?/);
  if (z) return ZH_NUM[z[1]];
  const d = s.match(/(\d)/);
  if (d) return Number(d[1]) >= 1 && Number(d[1]) <= 7 ? Number(d[1]) : null;
  const k = s.match(/第?([一二三四五六七])級/);
  return k ? ZH_NUM[k[1]] : null;
}

// The learner's level (1–7) or null when unplaced.
export function learnerLevel(app = App, st = store) {
  try {
    if (typeof app.levelState === "function") {
      const s = app.levelState();
      return typeof s === "number" ? levelNum(s) : levelNum(s && (s.level ?? s.tbcl ?? null));
    }
  } catch (err) { console.error(err); }
  const raw = st.get("level", null);
  return levelNum(isObj(raw) ? raw.level ?? raw.tbcl : raw);
}

// Is a step that starts at level `min` open for a learner at level L? {open, locked, n}
export function gate(min, L, all = false) {
  const n = levelNum(min) || 1;
  if (L == null || n <= L) return { open: true, locked: false, n };
  return { open: !!all, locked: true, n };
}

export const normUrl = u => String(u || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

const TRACK_ALIASES = {
  reading: ["read", "reading-ladder", "閱讀"], listening: ["listen", "聽力", "audio", "podcast", "video"], grammar: ["語法"],
  taiwan: ["taiwan-usage", "usage", "臺灣用法", "台灣用法"], characters: ["chars", "character", "漢字", "stroke", "stroke-order", "radicals"],
  output: ["writing", "speaking", "writing-speaking", "寫與說"], register: ["idioms", "chengyu", "成語", "語體"],
  tocfl: ["test", "exam", "mock", "華測", "tocfl-prep"], immersion: [], typing: ["keyboard", "打字", "ime", "zhuyin-typing"],
};
export function normTrack(t) {
  const s = String(t ?? "").toLowerCase().trim().replace(/[\s_]+/g, "-");
  if (!s) return "";
  for (const [k, list] of Object.entries(TRACK_ALIASES)) if (s === k || list.includes(s) || s.startsWith(k)) return k;
  return "";
}

// resources.json: an array, {resources | links | items | entries: [...]}, or {<track>: [...]}. Each entry:
// {id, url | href, zh | title_zh | title | name, en | title_en, track | tracks | category | section | tags,
//  level_min | level | band | levels, verified, checked, status | http_status, note | note_en, license}
export function normResources(raw) {
  const out = [];
  const add = (r, hint) => {
    if (!isObj(r)) return;
    const url = str(first(r, "url", "href", "link"));
    if (!/^https?:\/\//i.test(url)) return;
    const tr = [first(r, "track", "tracks", "category", "section", "tags", "group"), hint].flat(2).map(normTrack).filter(Boolean);
    out.push({ id: str(first(r, "id", "key", "slug")), url, zh: str(first(r, "zh", "title_zh", "name_zh", "title", "name")), en: str(first(r, "en", "title_en", "name_en")),
      tracks: [...new Set(tr)], level: levelNum(first(r, "level_min", "level", "min_level", "levels", "band", "cefr")), band: str(first(r, "band", "cefr", "levels")),
      verified: r.verified === true, checked: str(first(r, "checked", "checked_at", "last_checked", "date")),
      status: str(first(r, "status", "http_status", "http", "code")), note: str(first(r, "note_en", "note", "description", "desc")), license: str(r.license),
      grammar: str(first(r, "grammar", "grammar_id", "point")), used: false });
  };
  if (Array.isArray(raw)) raw.forEach(r => add(r));
  else if (isObj(raw)) {
    const list = first(raw, "resources", "links", "items", "entries");
    if (Array.isArray(list)) list.forEach(r => add(r));
    else for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v)) v.forEach(r => add(r, k));
      else if (isObj(v) && first(v, "url", "href")) add({ id: k, ...v });
    }
  }
  return out;
}

// One LINKS spec with its resources.json entry (by id, exact url, a match substring, then a url prefix).
export function linkFor(spec, resources) {
  const ids = arr(spec.ids).map(s => s.toLowerCase());
  const nu = spec.url ? normUrl(spec.url) : "";
  const hay = r => `${normUrl(r.url)} ${r.zh} ${r.en}`.toLowerCase();
  const hit = resources.find(r => r.id && ids.includes(r.id.toLowerCase()))
    || (nu && resources.find(r => normUrl(r.url) === nu))
    || arr(spec.match).map(m => resources.find(r => hay(r).includes(m.toLowerCase()))).find(Boolean)
    || (nu && resources.find(r => { const ru = normUrl(r.url); return ru && (nu.startsWith(ru + "/") || ru.startsWith(nu + "/")); }));
  if (!hit) return { ...spec, verified: false, listed: false };
  hit.used = true;
  return { ...spec, url: hit.url, zh: spec.zh || hit.zh, en: spec.en || hit.en, verified: hit.verified, checked: hit.checked, status: hit.status,
    note: hit.note, listed: true };
}

// ---------- reading.json
// An array of texts, {texts | items | readings: [...]}, or {"L1": [...], ...}. A text: {id, level | lv | tbcl,
// title | title_zh, title_zhuyin, title_en, audio, topic, vocab | new_words | words: [{zh, zhuyin, en}],
// questions: [{zh | question_zh | q, zhuyin, en | question_en, options | options_zh, options_en, answer (0-based or the
// option text)}], and the body: paragraphs | sentences | lines | body | content | text}. The body is a string (with the
// text's zhuyin), an array of sentences ({zh, zhuyin, spoken, en, audio, tokens?, para?}), or an array of paragraphs
// (each an array of sentences or {sentences | lines: [...]}). tokens (optional): the sentence split into words.
export function normWord(x) {
  if (typeof x === "string") return { zh: x, zhuyin: "", en: "" };
  if (Array.isArray(x)) return { zh: str(x[0]), zhuyin: str(x[1]), en: str(x[2]) };
  if (!isObj(x)) return { zh: "", zhuyin: "", en: "" };
  return { zh: str(first(x, "zh", "w", "word", "text")), zhuyin: str(first(x, "zhuyin", "z")), spoken: x.spoken && isZy(x.spoken) ? str(x.spoken) : null,
    en: str(first(x, "en", "english", "gloss")), level: levelNum(first(x, "level", "lv")), audio: first(x, "audio", "tts") || null };
}
export function normSent(s) {
  if (typeof s === "string") return s.trim() ? { zh: s, zhuyin: "", spoken: null, en: "", audio: null, tokens: null } : null;
  if (!isObj(s)) return null;
  const zh = str(first(s, "zh", "text", "sentence", "line"));
  if (!zh) return null;
  return { zh, zhuyin: str(first(s, "zhuyin", "z")), spoken: s.spoken ? str(s.spoken) : null, en: str(first(s, "en", "english", "translation")),
    audio: first(s, "audio", "tts", "path") || null, tokens: arr(first(s, "tokens", "segs", "seg", "words")), para: first(s, "para", "p", "paragraph"),
    pinyin: str(s.pinyin), role: str(first(s, "speaker", "role", "who", "name")) };
}
function normQ(q) {
  if (!isObj(q)) return null;
  const zh = str(first(q, "zh", "question_zh", "q", "question"));
  const en = str(first(q, "en", "question_en", "q_en"));
  const ozh = arr(first(q, "options_zh", "options", "choices"));
  const oen = arr(q.options_en);
  const n = Math.max(ozh.length, oen.length);
  const options = Array.from({ length: n }, (_, i) => {
    const o = ozh[i];
    return isObj(o) ? { zh: str(first(o, "zh", "text")), zhuyin: str(o.zhuyin), en: str(o.en ?? oen[i]) } : { zh: isZy(o) ? "" : str(o), zhuyin: "", en: str(oen[i] ?? "") };
  }).map(o => (!o.zh && /\p{sc=Han}/u.test(o.en) ? { ...o, zh: o.en, en: "" } : o));
  let answer = q.answer ?? q.correct;
  if (typeof answer === "string" && !/^\d+$/.test(answer)) {
    const a = answer.trim();
    answer = /^[A-Da-d]$/.test(a) ? a.toUpperCase().charCodeAt(0) - 65 : options.findIndex(o => o.zh === a || o.en === a);
  } else answer = Number(answer);
  if ((!zh && !en) || n < 2 || !(answer >= 0 && answer < n)) return null;
  return { zh, zhuyin: str(first(q, "zhuyin", "question_zhuyin")), en, options, answer };
}
function normText(x, hint, i) {
  const [bodyKey, body] = firstKey(x, "paragraphs", "paras", "sentences", "lines", "body", "content", "text", "zh");
  const paras = [];
  if (typeof body === "string") {
    const s = normSent({ zh: body, zhuyin: x.zhuyin, spoken: x.spoken, en: x.en, audio: null });
    if (s) paras.push([s]);
  } else if (Array.isArray(body)) {
    const loose = [];
    for (const p of body) {
      const inner = Array.isArray(p) ? p : isObj(p) && !first(p, "zh", "text") ? arr(first(p, "sentences", "lines")) : null;
      if (inner) { const ss = inner.map(normSent).filter(Boolean); if (ss.length) paras.push(ss); continue; }
      const s = normSent(p);
      if (s) loose.push(s);
    }
    if (loose.length) {
      if (loose.some(s => s.para != null)) {
        const groups = new Map();
        for (const s of loose) { const k = String(s.para ?? ""); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
        paras.push(...groups.values());
      } else if (/^para/.test(bodyKey)) loose.forEach(s => paras.push([s]));
      else paras.push(loose);
    }
  }
  if (!paras.length) return null;
  const t = first(x, "title_zh", "title", "zh_title", "name");
  const tObj = isObj(t) ? t : {};
  return { id: str(x.id ?? `t${i + 1}`), level: levelNum(first(x, "level", "lv", "tbcl")) ?? levelNum(hint),
    title: str(isObj(t) ? first(tObj, "zh", "title") : t) || paras[0][0].zh.slice(0, 12), titleZy: str(first(x, "title_zhuyin") ?? tObj.zhuyin),
    titleEn: str(first(x, "title_en", "en_title") ?? tObj.en), audio: first(x, "audio", "tts") || null, topic: str(first(x, "topic_zh", "topic")),
    topicEn: str(first(x, "topic_en")), words: arr(first(x, "vocab", "new_words", "glossary", "words")).map(normWord).filter(w => w.zh),
    questions: arr(first(x, "questions", "qs", "quiz")).map(normQ).filter(Boolean), paras };
}
export function normTexts(raw) {
  const out = [];
  const visit = (x, hint, depth) => {
    if (depth > 4) return;
    if (Array.isArray(x)) { x.forEach(t => visit(t, hint, depth + 1)); return; }
    if (!isObj(x)) return;
    if (firstKey(x, "paragraphs", "paras", "sentences", "lines", "body", "content")[0] || ((typeof x.text === "string" || (typeof x.zh === "string" && x.zhuyin)) && (x.title || x.title_zh))) {
      const t = normText(x, hint, out.length);
      if (t) out.push(t);
      return;
    }
    for (const [k, v] of Object.entries(x)) if (v && typeof v === "object") visit(v, levelNum(k) && !/^(id|audio)$/i.test(k) ? k : hint, depth + 1);
  };
  visit(raw, null, 0);
  const seen = new Set();
  for (const t of out) { while (seen.has(t.id)) t.id += "+"; seen.add(t.id); }
  return out;
}

// Split a sentence into words: its own tokens when they cover its characters, else longest match (2–maxLen
// characters) against `dict` inside each run of Han characters. Each Han token gets its share of the sentence's
// Zhuyin (and spoken form) when the syllable count matches. [{zh, han, zhuyin, spoken}]
export function segment(sent, dict = new Set(), maxLen = 6) {
  const chars = [...sent.zh];
  const han = chars.map(c => HAN1.test(c));
  const nCjk = han.filter(Boolean).length;
  const syls = sent.zhuyin ? syllables(sent.zhuyin) : [];
  const said = sent.spoken ? syllables(sent.spoken) : [];
  const zyOk = syls.length === nCjk && nCjk > 0, spOk = zyOk && said.length === nCjk;
  const lens = tokenLens(sent.tokens, chars.filter((c, i) => han[i]).join(""));
  const out = [];
  let i = 0, k = 0, li = 0;
  while (i < chars.length) {
    if (!han[i]) {
      let j = i;
      while (j < chars.length && !han[j]) j++;
      out.push({ zh: chars.slice(i, j).join(""), han: false, zhuyin: "", spoken: null });
      i = j;
      continue;
    }
    let n = 1;
    if (lens) n = lens[li++] || 1;
    else {
      let end = i;
      while (end < chars.length && han[end]) end++;
      for (let m = Math.min(maxLen, end - i); m >= 2; m--) if (dict.has(chars.slice(i, i + m).join(""))) { n = m; break; }
    }
    let j = i;
    while (j < i + n && j < chars.length && han[j]) j++;
    if (lens && j - i < n) lens.splice(li, 0, n - (j - i)); // a token that ran into punctuation continues after it
    out.push({ zh: chars.slice(i, j).join(""), han: true, zhuyin: zyOk ? syls.slice(k, k + j - i).join(" ") : "", spoken: spOk ? said.slice(k, k + j - i).join(" ") : null });
    k += j - i;
    i = j;
  }
  return out;
}
function tokenLens(tokens, cjk) {
  if (!Array.isArray(tokens) || !tokens.length) return null;
  const tz = tokens.map(t => (typeof t === "string" ? t : Array.isArray(t) ? str(t[0]) : isObj(t) ? str(first(t, "zh", "w", "word", "text")) : ""));
  if (cjkOf(tz.join("")) !== cjk) return null;
  return tz.map(t => [...cjkOf(t)].length).filter(n => n > 0);
}
// Headwords of two or more characters (Library words, Taiwan usage, measure words, Taiwan readings) plus extra words.
export function wordDict(lib, extra = []) {
  const s = new Set();
  for (const t of ["word", "taiwan", "measure", "reading"]) for (const e of (lib && lib.byType && lib.byType[t]) || []) if ([...e.zh].length >= 2) s.add(e.zh);
  for (const w of extra) if (w && w.zh && [...w.zh].length >= 2 && HAN.test(w.zh)) s.add(w.zh);
  return s;
}
// The Library entry for a word (homographs told apart by Zhuyin), or null.
export function libEntry(lib, zh, zhuyin = "") {
  if (!lib || !lib.lookup) return null;
  for (const t of ["word", "taiwan", "measure", "reading"]) { const e = resolve(lib.lookup, t, zh, zh, zhuyin); if (e) return e; }
  return null;
}

// ---------- advanced.json (content/advanced/prompts.json + register.json, as the build merges them)
// Lists are found by key anywhere in the first levels of the file; a list may be keyed by level ({"1": [...]}).
//   journal:   journal | journal_prompts | writing_prompts           [{id, level, zh | prompt_zh | prompt, zhuyin, en | prompt_en, hints | words}]
//   monologue: monologue | monologues | monologue_topics | topics    [{id, level, zh, zhuyin, en}]
//   roleplays: roleplays | role_plays | roleplay | scripts           [{id, level, title_zh | title | zh, title_en | en, setting | situation, roles,
//                                                                     lines | dialogue | script: [{speaker | role, zh, zhuyin, spoken, en, audio}]}]
//   pairs:     pairs | register_pairs | written_spoken               [{written | formal, written_zhuyin, spoken | colloquial, spoken_zhuyin, en, note,
//                                                                     example | examples: [{zh, zhuyin, en}]}]
//   news:      news | news_vocab | news_vocabulary                   [{zh, zhuyin, en, level}]
//   models:    models | model_texts | letter | formal_letter | line | line_message   {kind, title_zh, title_en, lines | body: [...], note}
const listish = v => Array.isArray(v) || (isObj(v) && Object.keys(v).length > 0 && Object.values(v).every(Array.isArray));
export function deepFind(root, keys, accept = listish, maxDepth = 3) {
  const want = keys.map(k => k.toLowerCase());
  const q = [[root, 0]];
  while (q.length) {
    const [o, d] = q.shift();
    if (!isObj(o)) continue;
    for (const k of want) for (const [kk, v] of Object.entries(o)) if (kk.toLowerCase() === k && v != null && accept(v)) return v;
    if (d < maxDepth) for (const v of Object.values(o)) if (isObj(v)) q.push([v, d + 1]);
  }
  return null;
}
export function flatLevels(v) {
  if (Array.isArray(v)) return v;
  if (isObj(v)) return Object.entries(v).flatMap(([k, x]) => arr(x).map(i => (isObj(i) ? { level: k, ...i } : { level: k, zh: String(i) })));
  return [];
}
const zhPart = x => (isObj(x) ? { zh: str(first(x, "zh", "text")), zhuyin: str(x.zhuyin), en: str(x.en) } : isZy(x) ? null : { zh: str(x), zhuyin: "", en: "" });
function normPrompt(p, i, prefix) {
  if (typeof p === "string") p = { zh: p };
  if (!isObj(p)) return null;
  const zh = str(first(p, "zh", "prompt_zh", "prompt", "topic_zh", "topic", "text", "title_zh"));
  const en = str(first(p, "en", "prompt_en", "topic_en", "title_en"));
  if (!zh && !en) return null;
  return { id: str(p.id ?? `${prefix}${i + 1}`), level: levelNum(first(p, "level", "lv")), zh, zhuyin: str(first(p, "zhuyin", "prompt_zhuyin")), spoken: p.spoken ? str(p.spoken) : null,
    en, hints: arr(first(p, "hints", "useful", "useful_words", "vocab", "words")).map(normWord).filter(w => w.zh), tip: str(first(p, "tip_en", "tip", "note_en", "note")) };
}
function normRoleplay(r, i) {
  if (!isObj(r)) return null;
  const lines = arr(first(r, "lines", "dialogue", "script", "turns")).map(normSent).filter(Boolean);
  if (!lines.length) return null;
  const roles = arr(r.roles).map(x => (isObj(x) ? str(first(x, "zh", "name", "role", "id")) : str(x))).filter(Boolean);
  for (const l of lines) if (l.role && !roles.includes(l.role)) roles.push(l.role);
  const set = first(r, "setting", "situation", "context", "scene");
  return { id: str(r.id ?? `rp${i + 1}`), level: levelNum(first(r, "level", "lv")), zh: str(first(r, "title_zh", "title", "zh")), en: str(first(r, "title_en", "en")),
    zhuyin: str(first(r, "title_zhuyin")), setting: isObj(set) ? str(first(set, "en", "zh")) : str(set), settingEn: str(first(r, "setting_en", "situation_en")),
    roles, lines };
}
function normPair(p) {
  if (!isObj(p)) return null;
  const w = first(p, "written", "formal", "書面語", "written_zh", "shumianyu"), wz = first(p, "written_zhuyin", "formal_zhuyin");
  const sRaw = first(p, "colloquial", "口語", "spoken_zh", "informal", "kouyu");
  const s = sRaw ?? (p.spoken != null && !isZy(p.spoken) ? p.spoken : null);
  const sz = first(p, "spoken_zhuyin", "colloquial_zhuyin", "informal_zhuyin");
  const W = zhPart(w), C = zhPart(s);
  if (!W || !C || !W.zh || !C.zh) return null;
  if (wz) W.zhuyin = str(wz);
  if (sz) C.zhuyin = str(sz);
  const ex = [first(p, "examples", "example")].flat().filter(Boolean).map(normSent).filter(Boolean);
  return { written: W, spoken: C, en: str(first(p, "en", "meaning", "gloss")), note: str(first(p, "note_en", "note")), examples: ex, level: levelNum(p.level) };
}
function normModel(m, kindHint, i) {
  if (!isObj(m)) return null;
  const [, body] = firstKey(m, "lines", "body", "sentences", "paragraphs", "text", "content");
  const lines = (typeof body === "string" ? [{ zh: body, zhuyin: m.zhuyin, en: m.en }] : arr(body).flat()).map(normSent).filter(Boolean);
  if (!lines.length) return null;
  const kind = str(first(m, "kind", "type")) || kindHint || "";
  return { id: str(m.id ?? `m${i + 1}`), kind: /line/i.test(kind) ? "line" : /letter|信/.test(kind) ? "letter" : kind, zh: str(first(m, "title_zh", "title", "zh_title")),
    en: str(first(m, "title_en", "en_title")), note: str(first(m, "note_en", "note")), lines };
}
export function normAdvanced(raw) {
  const r = isObj(raw) ? raw : {};
  const list = keys => flatLevels(deepFind(r, keys));
  const models = list(["models", "model_texts", "templates"]).map((m, i) => normModel(m, "", i));
  for (const [keys, kind] of [[["letter", "formal_letter", "formalletter"], "letter"], [["line", "line_message", "linemessage", "line_messages"], "line"]]) {
    const v = deepFind(r, keys, x => isObj(x) || Array.isArray(x));
    for (const m of (Array.isArray(v) ? v : v ? [v] : [])) models.push(normModel(m, kind, models.length));
  }
  return {
    journal: list(["journal", "journal_prompts", "journalprompts", "writing_prompts", "writing"]).map((p, i) => normPrompt(p, i, "j")).filter(Boolean),
    monologue: list(["monologue", "monologues", "monologue_topics", "monologuetopics", "topics"]).map((p, i) => normPrompt(p, i, "m")).filter(Boolean),
    roleplays: list(["roleplays", "role_plays", "roleplay", "role_play", "role-plays", "scripts", "roleplay_scripts"]).map(normRoleplay).filter(Boolean),
    pairs: list(["pairs", "register_pairs", "written_spoken", "written_vs_spoken", "書面語"]).map(normPair).filter(Boolean),
    news: list(["news", "news_vocab", "news_vocabulary", "newsvocab"]).map(normWord).filter(w => w.zh),
    models: models.filter(Boolean),
  };
}

// ---------- chengyu.json: [...] or {items | idioms | chengyu | entries: [...], attribution | credit, license, version, url}.
// An idiom: {zh | idiom | 成語, zhuyin | 注音, level, url, and the MOE fields as given (English or Chinese keys)}. The
// fields are shown as they are (CC BY-ND: unmodified), each under its MOE heading.
export const CY_FIELDS = [
  [["meaning", "definition", "釋義", "解釋"], "釋義", "Meaning"],
  [["story", "allusion", "典故說明", "典故"], "典故說明", "The story"],
  [["source_text", "source", "origin", "典源"], "典源", "Source text"],
  [["usage", "semantics", "用法說明", "語義說明"], "語義說明", "Usage"],
  [["usage_type", "usage_category", "category", "使用類別"], "使用類別", "Used for"],
  [["examples", "example", "例句"], "例句", "Examples"],
  [["quotes", "citations", "書證"], "書證", "Citations"],
  [["synonyms", "近義", "近義成語"], "近義", "Similar idioms"],
  [["antonyms", "反義", "反義成語"], "反義", "Opposite idioms"],
  [["distinction", "identification", "辨識", "辨正"], "辨識", "Telling them apart"],
];
export function normChengyu(raw) {
  const items = Array.isArray(raw) ? raw : arr(first(raw, "items", "idioms", "chengyu", "entries", "list"));
  const meta = isObj(raw) ? raw : {};
  return {
    attribution: str(first(meta, "attribution", "credit", "attribution_zh")), license: str(first(meta, "license", "licence")), version: str(meta.version),
    items: items.map((x, i) => {
      if (!isObj(x)) return null;
      const zh = str(first(x, "zh", "idiom", "成語", "word", "title"));
      if (!zh) return null;
      const fields = CY_FIELDS.map(([keys, zhL, enL]) => {
        const v = first(x, ...keys);
        const parts = (Array.isArray(v) ? v : v == null ? [] : [v]).map(p => (isObj(p) ? str(first(p, "zh", "text")) : str(p))).filter(s => s.trim());
        return parts.length ? { zh: zhL, en: enL, parts } : null;
      }).filter(Boolean);
      return { id: str(x.id ?? i), zh, zhuyin: str(first(x, "zhuyin", "注音")), level: levelNum(first(x, "level", "lv", "tbcl")), url: str(first(x, "url", "link", "href")), fields };
    }).filter(Boolean),
  };
}

// ---------- characters.json
//   levels: {"1": "字字…" | ["字", …]} | [{level, chars}] | [{char | c | zh, level}]   (under levels | chars | characters | by_level | tbcl)
//   radicals: [{radical | r | char | zh, n | number | no | id, meaning | en, name | name_zh, strokes, chars | common | examples (string or array), zhuyin}]
export function normCharacters(raw) {
  const levels = new Map();
  const put = (n, cs) => {
    if (!n) return;
    if (!levels.has(n)) levels.set(n, []);
    const L = levels.get(n);
    for (const c of (Array.isArray(cs) ? cs.map(x => (isObj(x) ? str(first(x, "char", "c", "zh")) : str(x))).join("") : str(cs))) if (HAN.test(c) && !L.includes(c)) L.push(c);
  };
  const src = Array.isArray(raw) ? raw : first(raw, "levels", "chars", "characters", "by_level", "tbcl", "hanzi");
  if (Array.isArray(src)) {
    for (const x of src) {
      if (!isObj(x)) continue;
      const cs = first(x, "chars", "characters", "list");
      if (cs != null) put(levelNum(first(x, "level", "lv", "n")), cs);
      else put(levelNum(first(x, "level", "lv")), first(x, "char", "c", "zh"));
    }
  } else if (isObj(src)) for (const [k, v] of Object.entries(src)) put(levelNum(k), v);
  const radicals = arr(first(raw, "radicals", "kangxi", "部首")).map((r, i) => {
    if (typeof r === "string") r = { radical: r };
    if (!isObj(r)) return null;
    const rad = str(first(r, "radical", "r", "char", "zh", "bushou"));
    if (!rad) return null;
    const ex = first(r, "chars", "common", "examples", "common_chars", "example_chars");
    return { n: Number(first(r, "n", "number", "no", "id", "kangxi")) || i + 1, radical: rad, meaning: str(first(r, "meaning", "en", "meaning_en", "gloss")),
      name: str(first(r, "name", "name_zh", "zh_name")), zhuyin: str(r.zhuyin), strokes: Number(first(r, "strokes", "stroke", "stroke_count")) || null,
      chars: [...(Array.isArray(ex) ? ex.map(x => (isObj(x) ? str(first(x, "char", "zh")) : str(x))).join("") : str(ex))].filter(c => HAN.test(c)) };
  }).filter(Boolean);
  return { levels: [...levels.entries()].sort((a, b) => a[0] - b[0]), radicals };
}

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
// The band whose mock tests fit a level (TOCFL bands, §8.1 / §8.4)
export const mockBand = L => (L == null ? null : L <= 2 ? "N" : L === 3 ? "A" : L <= 5 ? "B" : "C");
// The real-exam note shows once at Band A (level 3) and once at Band B (levels 4–5), until dismissed.
export const examNoteBand = (L, dismissed = {}) => { const b = L === 3 ? "A" : L === 4 || L === 5 ? "B" : null; return b && !dismissed[b] ? b : null; };

// ------------------------------------------------------------------ page
const app = typeof document !== "undefined" ? document.querySelector('#app[data-page="advanced"]') : null;
const S = { L: null, all: false, tab: "reading", d: null, links: {}, extras: [], resMissing: true, libP: null };
const TABS = [["reading", "閱讀", "Reading"], ["listening", "聽力", "Listening"], ["grammar", "語法", "Grammar"], ["taiwan", "臺灣用法", "Taiwan usage"],
  ["characters", "漢字", "Characters"], ["output", "寫與說", "Writing & speaking"], ["register", "語體與成語", "Register & idioms"], ["tocfl", "華測", "TOCFL"],
  ["immersion", "沉浸", "Immersion"], ["typing", "注音打字", "Zhuyin typing"]];
let panel = null, tabsEl = null;
let leave = null; // the open view's cleanup (timers)

// Element.append prints null as "null": drop empty kids first (h() already does this for its own kids)
const put = (el, ...kids) => { el.append(...kids.flat(Infinity).filter(k => k != null && k !== false && k !== "")); return el; };
const showEn = () => settings().english !== false;
// A learning-content translation (follows the English setting; immersion mode leaves it alone: class "tr")
const tr = (text, cls = "") => (text && showEn() ? enText(text, { class: `tr lc-en ${cls}`.trim() }) : null);
// Chinese with Zhuyin as the display setting says ("off" = no ruby; "always" and "new words" = ruby here).
function zhRun(zh, zhuyin, spoken = null, cls = "adv-zh") {
  if (!zh) return null;
  if (!zhuyin || settings().ruby === "off" || settings().ruby === false) return h("span", { class: cls, lang: "zh-Hant-TW" }, zh);
  return ruby(zh, zhuyin, { cls, spoken });
}
// "中文 English" interface text
const t2 = (zh, en, attrs = {}) => h("span", attrs, zh, " ", enText(en));
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";
const lib = () => (S.libP ||= loadLibrary().catch(err => { console.error(err); return null; }));
const notice = (zh, en, role = "note") => h("p", { class: "adv-notice", role }, zh, " ", enText(en));
const lockIcon = () => {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("width", "14"); svg.setAttribute("height", "14"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "adv-lock-ico");
  svg.innerHTML = '<rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/>';
  return svg;
};
function levelTag(n, { from = true, band = "" } = {}) {
  if (!n) return null;
  return h("span", { class: "adv-lv" }, from ? `第${n}級起` : `第${n}級`, " ", enText(band || (from ? `level ${n}+` : `level ${n}`), { class: "adv-lv-en" }));
}
function lockNote(g, tag = "p") {
  return h(tag, { class: "adv-lock" }, lockIcon(), ` 第 ${g.n} 級打開，你現在學第 ${S.L} 級。`,
    enText(` Opens at TBCL level ${g.n} (${BANDS[g.n][1]}); you are studying level ${S.L}.`));
}
// One ladder step: number, title, level, then the body (a node or a function) or why it is locked.
function rung(zh, en, min, body, { band = "" } = {}) {
  const g = gate(min, S.L, S.all);
  return h("li", { class: `adv-rung${g.locked ? (g.open ? " is-ahead" : " is-locked") : ""}` },
    h("div", { class: "adv-rung-head" }, h("h3", {}, zh, " ", enText(en, { class: "adv-rung-en" })), levelTag(g.n, { band }),
      g.locked && g.open ? h("span", { class: "adv-ahead" }, "超前 ", enText("ahead")) : null),
    g.open ? (typeof body === "function" ? body() : body) : lockNote(g));
}
const ladder = (label, ...rungs) => h("ol", { class: "adv-ladder", "aria-label": label }, rungs);
const section = (zh, en, ...kids) => h("section", { class: "adv-sec" }, h("h2", {}, zh, " ", enText(en, { class: "adv-h-en" })), kids);
const lede = (zh, en) => h("p", { class: "adv-lede" }, zh, " ", enText(en, { class: "muted" }));
const inner = (href, zh, en) => h("a", { href, class: "adv-in" }, zh, " ", enText(en), h("span", { "aria-hidden": "true" }, " →"));

function checkBadge(L) {
  if (L.verified) return h("span", { class: "adv-chk ok" }, "✓ 已檢查", enText(` checked${L.checked ? " " + L.checked : ""}${L.status ? ` · HTTP ${L.status}` : ""}`));
  return h("span", { class: "adv-chk no" }, "未驗證", enText(" unverified"));
}
const labelRun = s => (HAN.test(s) ? h("span", { lang: "zh-Hant-TW" }, s) : enText(s));
// A proper name (a site or show): class "adv-name" so immersion mode keeps it even when it is Latin script.
const nameRun = s => h("span", { class: "adv-name", lang: HAN.test(s) ? "zh-Hant-TW" : "en" }, s);
// An external link (new tab) with its check status, or a "no link yet" line. gated: a link above the learner's level
// shows its name and why it is locked instead.
function ext(L, { gated = false } = {}) {
  if (!L) return null;
  const name = L.zh || L.en || normUrl(L.url).split("/")[0];
  const sub = L.zh && L.en ? [" ", enText(L.en, { class: "muted" })] : null;
  const band = L.band ? h("span", { class: "adv-lv" }, L.band) : null;
  if (!L.url) return h("span", { class: "adv-ext" }, nameRun(name), sub, " ", band, " ",
    h("span", { class: "adv-chk no" }, "還沒有連結", enText(" no link yet: resources.json does not list it")));
  const g = gated ? gate(L.level, S.L, S.all) : { open: true };
  if (!g.open) return h("span", { class: "adv-ext" }, nameRun(name), sub, " ", band, lockNote(g, "span"));
  return h("span", { class: "adv-ext" },
    h("a", { href: L.url, target: "_blank", rel: "noopener noreferrer" }, nameRun(name), sub,
      h("span", { class: "sr-only" }, "（另開分頁 opens in a new tab）"), h("span", { "aria-hidden": "true" }, " ↗")),
    " ", band, " ", checkBadge(L), L.note ? h("span", { class: "adv-ext-note small muted" }, enText(L.note)) : null);
}
const extList = links => h("ul", { class: "adv-links" }, links.filter(Boolean).map(L => h("li", {}, ext(L, { gated: true }))));
// resources.json entries for a track that no step uses
function extras(track) {
  const xs = S.extras.filter(r => r.tracks.includes(track));
  if (!xs.length) return null;
  return section("更多連結", "More links", extList(xs.map(r => ({ ...r, band: r.band && !/^\d$/.test(r.band) ? r.band : "" }))));
}
function switchBtn(zh, en, on, onChange) {
  const b = h("button", { type: "button", role: "switch", class: "adv-switch", "aria-checked": String(on), onclick: () => {
    const v = b.getAttribute("aria-checked") !== "true";
    b.setAttribute("aria-checked", String(v));
    onChange(v);
  } }, h("span", { class: "adv-switch-track", "aria-hidden": "true" }, h("span", { class: "adv-switch-knob" })), h("span", {}, zh, " ", enText(en)));
  return b;
}
async function copyText(text, area) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  try {
    const t = area || h("textarea", { class: "sr-only", "aria-hidden": "true" }, text);
    if (!area) document.body.append(t);
    const keep = area ? area.value : null;
    if (area) area.value = text;
    t.select();
    const ok = document.execCommand("copy");
    if (area) area.value = keep; else t.remove();
    return ok;
  } catch { return false; }
}

async function boot() {
  mountShell("advanced");
  trackTime("advanced");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  S.L = learnerLevel();
  S.all = !!store.get("adv.showAll", false);
  const names = ["reading", "advanced", "chengyu", "resources", "characters", "shadowing"];
  const [reading, advanced, chengyu, resources, characters, shadowing] = await Promise.all(names.map(n => loadJSON(n).catch(() => null)));
  const res = normResources(resources);
  S.resMissing = resources == null;
  S.d = { texts: normTexts(reading), noReading: reading == null, adv: normAdvanced(advanced), noAdv: advanced == null,
    cy: normChengyu(chengyu), noCy: chengyu == null, chars: normCharacters(characters), noChars: characters == null,
    moeN: shadowing ? arr(shadowing.readings).length : null };
  S.links = Object.fromEntries(Object.entries(LINKS).map(([k, spec]) => [k, linkFor(spec, res)]));
  S.extras = res.filter(r => !r.used && !r.grammar);
  S.gram = new Map(res.filter(r => r.grammar).map(r => [r.grammar, r.url])); // per-point Chinese Grammar Wiki pages

  clear(app);
  app.append(h("div", { class: "page-head" },
    h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "進階"), h("span", { class: "en", lang: "en" }, "Advanced")),
    h("p", { class: "muted small adv-intro" }, "八條路線，每一條都是一道梯子，跟著你的程度一階一階打開。外面的網站只放連結，不複製內容。",
      enText(" Eight tracks, each a ladder that opens step by step with your level. Outside sites are linked, never copied.")),
    levelBox(),
    S.resMissing ? notice("連結清單還沒建置：下面的外部連結都還沒檢查過。", "The link list (resources.json) isn't built yet: the outside links below are not checked yet.", "status") : null));
  tabsEl = h("div", { class: "tabs adv-tabs", role: "tablist", "aria-label": "進階路線 Advanced tracks" });
  panel = h("section", { role: "tabpanel", id: "adv-panel", class: "adv-panel", tabindex: "-1" });
  for (const [id, zh, en] of TABS) {
    tabsEl.append(h("button", { type: "button", role: "tab", id: `tab-${id}`, "aria-controls": "adv-panel", "data-id": id, "aria-selected": "false", tabindex: "-1",
      onclick: () => show(id) }, zh, " ", h("span", { class: "muted small", lang: "en" }, en)));
  }
  tabsEl.addEventListener("keydown", e => {
    const list = [...tabsEl.children];
    const i = list.indexOf(e.target);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (i < 0 || j === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const b = list[(j + list.length) % list.length];
    b.focus();
    show(b.dataset.id);
  });
  app.append(tabsEl, panel);
  const start = decodeURIComponent(location.hash.slice(1));
  show(TABS.some(t => t[0] === start) ? start : "reading");
  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (TABS.some(t => t[0] === id) && id !== S.tab) show(id);
  });
  window.addEventListener("pagehide", () => { leave?.(); stopAudio(); });
}

function levelBox() {
  const box = h("div", { class: "adv-level" });
  if (S.L) {
    box.append(h("p", {}, `你現在學第 ${S.L} 級（${BANDS[S.L][0]}）。`, enText(` You are studying TBCL level ${S.L} (${BANDS[S.L][1]}). `), h("a", { href: "plan.html" }, "計畫 ", enText("Plan"))),
      switchBtn("顯示所有級別", "Show all levels", S.all, v => { S.all = v; store.set("adv.showAll", v); show(S.tab); }));
  } else {
    box.append(h("p", {}, "還沒做程度測驗，所以每一階都打開，並標出它的級別。", enText(" No placement yet, so every step is open and labelled with its level. "),
      h("a", { href: "plan.html#placement" }, "做程度測驗 ", enText("Take the placement check"))));
  }
  return box;
}

function show(id) {
  S.tab = id;
  for (const b of tabsEl.children) {
    const on = b.dataset.id === id;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  panel.setAttribute("aria-labelledby", `tab-${id}`);
  leave?.();
  leave = null;
  stopAudio();
  clear(panel);
  if (location.hash.slice(1) !== id) history.replaceState(null, "", location.pathname + location.search + "#" + id);
  const views = { reading: viewReading, listening: viewListening, grammar: viewGrammar, taiwan: viewTaiwan, characters: viewCharacters,
    output: viewOutput, register: viewRegister, tocfl: viewTocfl, immersion: viewImmersion, typing: viewTyping };
  try { views[id](panel); } catch (err) { console.error(err); panel.append(h("p", { class: "feedback bad" }, "這一頁出錯了。 ", enText(`Something went wrong: ${err.message}`))); }
}

// ================================================================== 1. reading ladder
const MODES = [[1, "全部注音", "Zhuyin on every word"], [2, "只標生詞", "Zhuyin on words not known"], [3, "不標注音，點詞查", "No Zhuyin, tap to look up"]];
// The stored step, or the highest open step below it
const readMode = () => { let m = Number(store.get("adv.readMode", 1)); if (![1, 2, 3].includes(m)) m = 1; while (m > 1 && !gate(m, S.L, S.all).open) m--; return m; };
const readLog = () => { const m = store.get("adv.read", {}); return isObj(m) ? m : {}; };

function viewReading(p) {
  const L = S.links;
  put(p, lede("從有注音的分級短文，一步一步讀到真的臺灣報紙。", "From graded texts with Zhuyin, step by step to real Taiwan newspapers."),
    ladder("閱讀梯子 Reading ladder",
      rung("分級短文：全部注音", "Graded texts, Zhuyin on every word", 1, () => h("p", {}, "下面的短文用第一階打開。", enText(" Open a text below in step 1."))),
      rung("同樣的短文：只標生詞", "The same texts, Zhuyin only on words you haven't marked known", 2,
        () => h("p", {}, "在資料庫標「會了」的詞就不標注音。", enText(" Words marked “known” in the Library lose their Zhuyin. "), inner("library.html", "資料庫", "Library"))),
      rung("不標注音，點詞查", "No Zhuyin: tap a word to look it up", 3, () => h("p", {}, "點一個詞，就看到它的注音、意思和資料庫的詞條。", enText(" Tap a word to see its Zhuyin, meaning and Library entry."))),
      rung("教育部辭典的朗讀", "MOE dictionary entry texts", 3, () => h("p", {}, "教育部《國語辭典簡編本》的詞條全文，真人朗讀。",
        enText(` Whole MOE dictionary entries read by a human voice${S.d.moeN ? ` (${S.d.moeN} readings)` : ""}. `), inner("shadow.html#moe", "跟讀：教育部朗讀", "Shadowing: MOE readings"))),
      rung("真的文章", "Authentic text", 3, () => h("div", {},
        h("p", {}, "國語日報的網路文章是全文繁體字，但網路上沒有注音，所以把不會的詞貼到資料庫查。",
          enText(" 國語日報's web articles are free and in full Traditional characters but have no Zhuyin online: paste words you don't know into the Library search.")),
        extList([L.mdnkids, L.ptsNews]))),
      rung("華測模擬閱讀", "TOCFL mock reading", 3, () => h("p", {}, ext(L.tocfl), " ", h("a", { href: "#tocfl" }, "計時器 ", enText("Timer")))),
    ),
    textsSection(), extras("reading"));
}

function textsSection() {
  const sec = section("分級短文", "Graded texts");
  const texts = S.d.texts;
  if (!texts.length) {
    sec.append(notice("分級短文還沒建置。", S.d.noReading ? "The graded texts (docs/data/reading.json) aren't built yet." : "reading.json has no texts the page can read.", "status"));
    return sec;
  }
  sec.append(modeSwitch(() => {}));
  const log = readLog();
  const levels = [...new Set(texts.map(t => t.level || 0))].sort((a, b) => (a || 99) - (b || 99));
  for (const n of levels) {
    const g = gate(n || 1, S.L, S.all);
    const list = texts.filter(t => (t.level || 0) === n);
    sec.append(h("h3", { class: "adv-sub" }, n ? `第 ${n} 級` : "其他", " ", enText(n ? `Level ${n} · ${BANDS[n][1]}` : "Other"), h("span", { class: "muted small" }, ` · ${list.length}`)));
    if (!g.open) { sec.append(lockNote(g)); continue; }
    sec.append(h("ul", { class: "adv-cards" }, list.map(t => h("li", {},
      h("button", { type: "button", class: "adv-card", "data-id": String(t.id), onclick: () => openText(t) },
        h("span", { class: "adv-card-t", lang: "zh-Hant-TW" }, t.title), t.titleEn && showEn() ? enText(t.titleEn, { class: "tr lc-en adv-card-en" }) : null,
        h("span", { class: "adv-card-meta small muted" }, `${t.paras.flat().length} 句`, enText(` sentences`),
          log[t.id] ? [" · ", h("span", { class: "adv-done" }, "✓ 讀過", enText(` read ${log[t.id].date || ""}`))] : null))))));
  }
  return sec;
}
// The step buttons update themselves in place (focus stays on the pressed one), then onChange(step).
function modeSwitch(onChange) {
  const cur = readMode();
  const group = h("div", { class: "adv-modes", role: "group", "aria-label": "閱讀梯子的階 Reading ladder step" },
    MODES.map(([m, zh, en]) => {
      const g = gate(m, S.L, S.all);
      return h("button", { type: "button", class: "adv-mode", "aria-pressed": String(m === cur), disabled: !g.open, "data-m": String(m),
        title: g.open ? null : `第 ${m} 級打開 Opens at level ${m}`, onclick: () => {
          store.set("adv.readMode", m);
          for (const b of group.children) b.setAttribute("aria-pressed", String(b.dataset.m === String(m)));
          onChange(m);
        } },
        h("span", { class: "adv-mode-n", "aria-hidden": "true" }, String(m)), h("span", {}, zh, " ", enText(en, { class: "adv-mode-en" })),
        g.open ? null : h("span", { class: "sr-only" }, `（第 ${m} 級打開 opens at level ${m}）`));
    }));
  return group;
}

function openText(t) {
  leave?.();
  stopAudio();
  clear(panel);
  const back = h("button", { type: "button", class: "btn small adv-back", onclick: () => {
    show("reading");
    (panel.querySelector(`.adv-card[data-id="${CSS.escape(String(t.id))}"]`) || panel).focus({ preventScroll: false });
  } }, "← 全部短文 ", enText("All texts"));
  const body = h("div", { class: "adv-text", lang: "zh-Hant-TW" });
  const look = h("div", { class: "adv-look", "aria-live": "polite" });
  const modes = modeSwitch(() => { look.replaceChildren(); draw(); });
  let seq = 0;
  const draw = async () => {
    const mode = readMode(), me = ++seq;
    let L = null;
    if (mode > 1) {
      if (!S.libReady) body.replaceChildren(h("p", { class: "muted small" }, "載入資料庫… ", enText("Loading the Library…")));
      L = await lib();
      S.libReady = true;
      if (!body.isConnected || me !== seq) return;
    }
    const dict = wordDict(L, t.words);
    const noLib = mode > 1 && (!L || L.missing.has("word"));
    const nodes = t.paras.map((ss, pi) => h("p", { class: "adv-para" }, ss.map((s, si) => sentenceEl(s, mode, noLib ? null : L, dict,
      (tok, k) => lookUp(tok, look, mode, draw, () => body.querySelector(`.adv-w[data-k="${k}"]`)), `${pi}.${si}`))));
    body.replaceChildren(...(noLib ? [notice("資料庫還沒建置：分不出會的詞，查詞只連到搜尋。", "The Library isn't built: known words can't be told apart, and look-up links to a search.", "status")] : []), ...nodes);
  };
  const log = readLog()[t.id];
  const done = h("button", { type: "button", class: "btn", "aria-pressed": String(!!log), onclick: () => {
    const m = readLog();
    if (m[t.id]) delete m[t.id]; else m[t.id] = { date: today(), mode: readMode() };
    store.set("adv.read", m);
    done.setAttribute("aria-pressed", String(!!m[t.id]));
    done.replaceChildren(...doneLabel(!!m[t.id]));
  } }, ...doneLabel(!!log));
  const sents = t.paras.flat();
  panel.append(back,
    h("article", { class: "adv-reader" },
      h("header", { class: "adv-reader-head" },
        h("h2", {}, zhRun(t.title, t.titleZy, null, "adv-title")), t.titleEn ? tr(t.titleEn, "adv-reader-en") : null,
        h("p", { class: "row small muted" }, t.level ? levelTag(t.level, { from: false, band: BANDS[t.level][1] }) : null, t.topic ? labelRun(t.topic) : null,
          t.audio ? playButton({ zh: t.title, audio: t.audio }, { label: "▶ 全文", cls: "btn small" }) : null)),
      modes, body, look,
      h("details", { class: "adv-details" }, h("summary", {}, showEn() ? t2("逐句聽和翻譯", "Sentence by sentence: audio and English") : t2("逐句聽", "Sentence by sentence")),
        h("ol", { class: "adv-sents" }, sents.map(s => h("li", {}, playButton({ zh: s.zh, audio: s.audio }, { label: "▶", badge: true, cls: "btn icon small" }),
          h("span", {}, zhRun(s.zh, s.zhuyin, s.spoken), tr(s.en, "adv-sent-en")))))),
      t.words.length ? h("details", { class: "adv-details" }, h("summary", {}, t2("生詞", "New words")),
        h("ul", { class: "adv-words" }, t.words.map(w => h("li", {}, zhRun(w.zh, w.zhuyin, w.spoken), " ", tr(w.en))))) : null,
      t.questions.length ? quiz(t.questions) : null,
      h("p", { class: "row" }, done)));
  draw();
  panel.focus({ preventScroll: true });
  panel.scrollIntoView({ block: "start" });
}
const doneLabel = on => (on ? ["✓ 讀過了 ", enText("Read")] : ["讀完了 ", enText("Mark as read")]);

// Step 1: ruby on the whole sentence (whatever the display setting: this step is about ruby). Steps 2 and 3: one
// button per word; step 2 gives ruby to every word that is not "known" in the Library (all words when L is null).
export function wordKnown(L, tok) {
  const e = L ? libEntry(L, tok.zh, tok.zhuyin) : null;
  return !!e && statusOf(e) === "known";
}
function sentenceEl(s, mode, L, dict, onTap, at = "") {
  if (mode === 1) return h("span", { class: "adv-s" }, ruby(s.zh, s.zhuyin, { cls: "adv-s-r", spoken: s.spoken }));
  return h("span", { class: "adv-s" }, segment(s, dict).map((tok, ti) => {
    if (!tok.han) return tok.zh;
    const zy = mode === 2 && tok.zhuyin && !wordKnown(L, tok);
    const k = `${at}.${ti}`;
    return h("button", { type: "button", class: "adv-w", "data-k": k, onclick: () => onTap(tok, k) }, zy ? ruby(tok.zh, tok.zhuyin, { cls: "adv-w-r", spoken: tok.spoken }) : tok.zh);
  }));
}

// opener: the word button that asked (found again after a redraw); closing the card gives it focus back.
async function lookUp(tok, look, mode, redraw, opener = () => null) {
  look.replaceChildren(h("p", { class: "muted small" }, "查詢中… ", enText("Looking up…")));
  let e = null;
  try {
    for (const t of ["word", "taiwan", "measure", "reading"]) {
      e = (tok.zhuyin && await findEntry(t, `${tok.zh}|${zhuyinKey(tok.zhuyin)}`)) || await findEntry(t, tok.zh);
      if (e) break;
    }
  } catch { e = null; }
  if (!look.isConnected) return;
  const href = e ? entryHref(e) : `library.html?q=${encodeURIComponent(tok.zh)}`;
  const statusRow = e ? h("div", { class: "adv-status", role: "group", "aria-label": "狀態 Status" }, STATUSES.map(([s, zh, en]) =>
    h("button", { type: "button", class: "adv-st", "aria-pressed": String(statusOf(e) === s), onclick: ev => {
      setStatus(e, s);
      for (const b of ev.currentTarget.parentNode.children) b.setAttribute("aria-pressed", String(b === ev.currentTarget));
      if (mode === 2) redraw();
    } }, zh, " ", enText(en, { class: "adv-st-en" })))) : null;
  const close = () => { look.replaceChildren(); (opener() || panel).focus({ preventScroll: true }); };
  look.replaceChildren(h("div", { class: "adv-look-card", onkeydown: ev => { if (ev.key === "Escape") { ev.preventDefault(); close(); } } },
    h("div", { class: "adv-look-head" }, ruby(tok.zh, tok.zhuyin || (e && e.zhuyin) || "", { cls: "adv-look-w", spoken: tok.spoken }),
      e && e.level ? h("span", { class: "adv-lv" }, `第${e.level}級`) : null,
      h("button", { type: "button", class: "btn icon small adv-look-x", "aria-label": "關閉 Close", onclick: close }, "✕")),
    e && e.en ? h("p", { class: "adv-look-en" }, enText(e.en, { class: "tr" })) : null, // a look-up asks for the meaning: shown even with English off ("tr", not "lc-en")
    e && settings().pinyin && e.pinyin && e.pinyin[0] ? h("p", { class: "small muted", lang: "zh-Latn-pinyin" }, e.pinyin[0]) : null,
    e ? null : h("p", { class: "small muted" }, "資料庫裡沒有這個詞。", enText(" This word isn't in the Library: search for it there.")),
    statusRow,
    h("a", { class: "btn small", href }, e ? "在資料庫打開 " : "在資料庫搜尋 ", enText(e ? "Open in the Library" : "Search the Library"))));
}

function quiz(qs) {
  return section("理解問題", "Questions", qs.map(q => {
    const fb = h("p", { class: "feedback", "aria-live": "polite", tabindex: "-1" });
    const opts = h("div", { class: "adv-opts", role: "group", "aria-label": q.zh || q.en }, q.options.map((o, oi) =>
      h("button", { type: "button", class: "choice adv-opt", onclick: ev => {
        const ok = oi === q.answer;
        ev.currentTarget.classList.add(ok ? "correct" : "wrong");
        if (ok) for (const b of opts.children) b.disabled = true;
        fb.className = `feedback ${ok ? "good" : "bad"}`;
        fb.replaceChildren(...(ok ? ["對了！", enText(" Correct.")] : ["再想想。", enText(" Not quite: try again.")]));
        if (ok) fb.focus({ preventScroll: true });
      } }, o.zh ? zhRun(o.zh, o.zhuyin) : null, o.en ? (o.zh ? tr(o.en, "adv-opt-en") : enText(o.en, { class: "tr lc-en" })) : null)));
    return h("div", { class: "adv-q" }, h("p", {}, q.zh ? zhRun(q.zh, q.zhuyin) : null, q.en ? [" ", q.zh ? tr(q.en) : enText(q.en, { class: "tr" })] : null), opts, fb);
  }));
}

// ================================================================== 2. listening ladder
// §6.6 colloquial Taiwan features: understand them, produce the standard. Written in base tones (verified).
const REAL_SPEECH = [
  { zh: "是不是", zhuyin: "ㄕˋ ㄅㄨˋ ㄕˋ", f: "捲舌音變平舌音", fe: "Retroflex → dental", hear: "ㄓㄔㄕ often come out as ㄗㄘㄙ: 是 can sound like ㄙˋ. Some speakers over-correct the other way too." },
  { zh: "吃飯", zhuyin: "ㄔ ㄈㄢˋ", f: "ㄔ → ㄘ，ㄈ 變軟", fe: "ㄔ → ㄘ, a soft ㄈ", hear: "吃 can sound like ㄘ, and ㄈ like [ɸ] (both lips) or [h]." },
  { zh: "很熱", zhuyin: "ㄏㄣˇ ㄖㄜˋ", f: "ㄖ 的變體", fe: "ㄖ variants", hear: "ㄖ can come out as [z] or [l]: 熱 like [zɤ] or [lɤ]." },
  { zh: "英文", zhuyin: "ㄧㄥ ㄨㄣˊ", f: "ㄣ、ㄥ 不分", fe: "ㄣ and ㄥ merge", hear: "ㄧㄥ often merges into ㄧㄣ: 英 can sound like 因." },
  { zh: "風", zhuyin: "ㄈㄥ", f: "唇音後的 ㄥ", fe: "ㄥ after a lip consonant", hear: "After ㄅㄆㄇㄈ, ㄥ becomes [oŋ]: 風 sounds like “fong”." },
  { zh: "去", zhuyin: "ㄑㄩˋ", f: "ㄩ → ㄧ", fe: "ㄩ → ㄧ", hear: "ㄩ can lose its rounding: 去 can sound like ㄑㄧˋ." },
  { zh: "對", zhuyin: "ㄉㄨㄟˋ", f: "ㄟ、ㄨㄟ 變平", fe: "ㄟ and ㄨㄟ flatten", hear: "The glide of ㄟ drops to a flat [e]: 對 closer to [tue]." },
  { zh: "二十", zhuyin: "ㄦˋ ㄕˊ", f: "ㄦ 比較輕", fe: "A lighter ㄦ", hear: "ㄦ is said lighter, and adding 兒 (-r) to words is rare in Taiwan." },
  { zh: "東西", zhuyin: "ㄉㄨㄥ ˙ㄒㄧ", f: "輕聲比較少", fe: "Fewer neutral tones", hear: "Many speakers give 西 a full first tone instead of the neutral tone." },
  { zh: "很好", zhuyin: "ㄏㄣˇ ㄏㄠˇ", f: "三聲不上揚", fe: "No final rise on T3", hear: "A third tone at the end often stays low, with no rise." },
  { zh: "廣播", zhuyin: "ㄍㄨㄤˇ ㄅㄛˋ", f: "ㄅㄛ → ㄅㄨㄛ", fe: "ㄅㄛ → ㄅㄨㄛ", hear: "ㄅㄛ is said as ㄅㄨㄛ." },
];
function viewListening(p) {
  const L = S.links;
  put(p, lede("先聽慢的、清楚的，再聽真的臺灣人說話。", "Clear, careful speech first, then real Taiwan speech."),
    ladder("聽力梯子 Listening ladder",
      rung("單元對話", "Unit dialogues", 1, () => h("div", {}, h("p", {}, inner("units.html", "課程", "Units"), " ", h("span", { class: "muted small" }, "每個單元的對話。", enText(" The dialogue of each unit."))),
        h("p", {}, "初學者也可以看：", enText(" Beginner listening as well: "), ext(L.legitMando)),
        h("p", { class: "small muted" }, "繁體字幕；連結前先看字幕和集數日期。", enText(" Traditional on-screen text; check the subtitles and episode dates.")))),
      rung("教育部朗讀（原速）", "MOE dictionary readings at full speed", 2, () => h("p", {}, "用 1.0× 聽整條朗讀，不放慢。", enText(" Listen to whole readings at 1.0×, not slowed down. "), inner("shadow.html#moe", "跟讀：教育部朗讀", "Shadowing: MOE readings"))),
      rung("小公視", "PTS children's channel", 3, () => extList([L.ptsKids]), { band: "A2–B1" }),
      rung("說說話 Talk Talk Mandarin", "Podcast with Taiwanese hosts", 4, () => extList([L.talktalk]), { band: "B1+" }),
      rung("公視新聞影片", "PTS news video", 5, () => extList([L.ptsVideo]), { band: "B2+" }),
      rung("真的臺灣口語", "Real Taiwan speech", 3, realSpeech)),
    extras("listening"));
}
function realSpeech() {
  return h("div", { class: "adv-real" },
    h("p", {}, "臺灣人日常說話常有這些特點。要聽得懂，但自己說標準音。",
      enText(" Everyday Taiwan speech often has these features. Learn to understand them, but say the standard yourself.")),
    h("p", { class: "small muted" }, "這裡沒有合成語音：語音合成做不出這些特點。去下面的真人節目裡聽。",
      enText(" No synthetic audio here: TTS can't produce these honestly. Listen for them in the native shows below.")),
    h("div", { class: "adv-table-wrap" }, h("table", { class: "adv-table" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "標準 ", enText("Standard")), h("th", { scope: "col" }, "特點 ", enText("Feature")), h("th", { scope: "col" }, "你可能聽到 ", enText("What you may hear")))),
      h("tbody", {}, REAL_SPEECH.map(r => h("tr", {}, h("td", {}, ruby(r.zh, r.zhuyin, { cls: "adv-zh" })), h("td", {}, h("span", { lang: "zh-Hant-TW" }, r.f), h("br"), enText(r.fe, { class: "muted small lc-en" })),
        h("td", {}, enText(r.hear, { class: "tr" }))))))),
    h("p", { class: "small" }, "在這裡聽得到：", enText(" Hear them in: "), [S.links.talktalk, S.links.ptsVideo, S.links.ptsKids].filter(x => x && x.url).map((x, i) => [i ? " · " : "",
      h("a", { href: x.url, target: "_blank", rel: "noopener noreferrer" }, nameRun(x.zh), h("span", { class: "sr-only" }, "（另開分頁 opens in a new tab）"), h("span", { "aria-hidden": "true" }, " ↗"))])));
}

// ================================================================== 3. grammar depth
function viewGrammar(p) {
  put(p, lede("TBCL 語法點，按級別排。第 1–3 級已經寫好，第 4–5 級在 LEVEL-UP 時寫。", "TBCL grammar points by level. Levels 1–3 are written; levels 4–5 come with LEVEL-UP."),
    h("p", { class: "small" }, "想看更多解釋：", enText(" For more explanation: "), ext(S.links.cgw)),
    h("p", { class: "small muted" }, "Chinese Grammar Wiki 是簡體字、CC BY-NC-SA：只連結，不複製。", enText(" Chinese Grammar Wiki is Simplified and CC BY-NC-SA: linked only, never copied.")));
  const box = h("div", { class: "adv-grammar" }, h("p", { class: "muted small" }, "載入資料庫… ", enText("Loading the Library…")));
  put(p, box, extras("grammar"));
  const cgwFor = S.gram || new Map();
  lib().then(L => {
    if (!box.isConnected) return;
    const list = (L && L.byType && L.byType.grammar) || [];
    box.replaceChildren();
    if (!list.length) box.append(notice("語法資料還沒建置。", "The Library's grammar data (docs/data/grammar.json) isn't built yet.", "status"));
    for (let n = 1; n <= 5; n++) {
      const g = gate(n, S.L, S.all);
      const pts = list.filter(e => levelNum(e.level) === n);
      const det = h("details", { class: "adv-details adv-glevel", open: S.L ? n === S.L : n === 1 },
        h("summary", {}, `第 ${n} 級`, " ", enText(`Level ${n} · ${BANDS[n][1]}`), h("span", { class: "muted small" }, n <= GRAMMAR_WRITTEN ? ` · ${pts.length} / ${GRAMMAR_COUNT[n]}` : ` · ${GRAMMAR_COUNT[n]}`),
          g.locked ? h("span", { class: "adv-chk no" }, g.open ? "超前" : "未開", enText(g.open ? " ahead" : " locked")) : null));
      if (!g.open) det.append(lockNote(g));
      else if (n > GRAMMAR_WRITTEN && !pts.length) det.append(h("p", { class: "muted" }, `${GRAMMAR_COUNT[n]} 個語法點，LEVEL-UP 時寫。`, enText(` ${GRAMMAR_COUNT[n]} points, coming with LEVEL-UP.`)));
      else if (!pts.length) det.append(h("p", { class: "muted small" }, "這一級的語法點還沒建置。", enText(" This level's points aren't built yet.")));
      else det.append(h("ul", { class: "adv-glist" }, pts.map(e => {
        const r = e.raw || {};
        const cgw = str(first(r, "cgw", "cgw_url", "grammar_wiki")) || cgwFor.get(e.key) || cgwFor.get(String(r.id || ""));
        return h("li", {}, h("a", { href: entryHref(e) }, h("span", { lang: "zh-Hant-TW", class: "adv-g-zh" }, e.zh), r.title_en ? [" ", tr(r.title_en)] : null),
          r.structure ? h("span", { class: "adv-g-st small muted", lang: "zh-Hant-TW" }, ` ${r.structure}`) : null,
          cgw ? h("a", { class: "adv-g-cgw small", href: cgw, target: "_blank", rel: "noopener noreferrer", "aria-label": `Chinese Grammar Wiki: ${e.zh}（另開分頁 opens in a new tab）` }, "CGW ↗") : null);
      })));
      box.append(det);
    }
  });
}

// ================================================================== 4. Taiwan usage
function viewTaiwan(p) {
  put(p, lede("臺灣的說法和讀音，都在資料庫裡。", "Taiwan words and readings live in the Library."));
  const counts = h("span", {});
  put(p, ladder("臺灣用法 Taiwan usage",
    rung("臺灣用語和大陸用語", "Taiwan vs Mainland words", 1, () => h("p", {}, inner("library.html#taiwan", "資料庫：臺灣用語", "Library: Taiwan vs Mainland"),
      " ", h("span", { class: "small muted" }, "計程車／出租車、捷運／地鐵、軟體／軟件……", enText(" taxi, metro, software …")))),
    rung("臺灣讀音", "Taiwan readings", 1, () => h("p", {}, inner("library.html#readings", "資料庫：臺灣讀音", "Library: Taiwan readings"), " · ", inner("tones.html#readings", "聲調館：讀音", "Tone Gym: readings"))),
    rung("臺灣的語法特點", "Taiwan grammar features", 2, () => h("div", {},
      h("ul", { class: "adv-feat" },
        h("li", {}, h("span", { lang: "zh-Hant-TW" }, "有 + 動詞"), " ", enText("for a completed action", { class: "muted lc-en" })),
        h("li", {}, h("span", { lang: "zh-Hant-TW" }, "會"), " ", enText("meaning “will”", { class: "muted lc-en" })),
        h("li", {}, h("span", { lang: "zh-Hant-TW" }, "會不會 + 形容詞"), " ", enText("in questions", { class: "muted lc-en" })),
        h("li", {}, h("span", { lang: "zh-Hant-TW" }, "幫忙 + 受詞"), " ", enText("with an object", { class: "muted lc-en" })),
        h("li", {}, h("span", { lang: "zh-Hant-TW" }, "啦、齁、喔、欸"), " ", enText("particles", { class: "muted lc-en" })),
        h("li", {}, h("span", { lang: "zh-Hant-TW" }, "不錯吃"))),
      h("p", { class: "small muted" }, "「給」的被動句是大陸的說法，不是臺灣的特點。", enText(" The 給 passive is the Mainland pattern, not a Taiwan feature.", { class: "lc-en" })),
      h("p", {}, inner("library.html#grammar", "資料庫：語法", "Library: grammar"))))), counts, extras("taiwan"));
  lib().then(L => {
    if (!L || !counts.isConnected) return;
    const n = t => (L.byType[t] || []).length;
    counts.replaceChildren(h("p", { class: "small muted" }, `資料庫有 ${n("taiwan")} 組臺灣用語、${n("reading")} 個臺灣讀音。`, enText(` The Library has ${n("taiwan")} Taiwan-vs-Mainland pairs and ${n("reading")} Taiwan readings.`)));
  });
}

// ================================================================== 5. characters
const charLink = c => h("a", { class: "adv-char", href: STROKE(c), target: "_blank", rel: "noopener noreferrer", lang: "zh-Hant-TW", "aria-label": `${c} 筆順 stroke order（另開分頁 opens in a new tab）` }, c);
function viewCharacters(p) {
  const C = S.d.chars;
  put(p, lede("先認字，再寫字（寫字可以不做）。用部首和部件學字，筆順照臺灣教育部。", "Recognising characters comes first; handwriting is optional. Learn characters through radicals and components, with Taiwan (MOE) stroke order."),
    h("p", { class: "small" }, "點一個字看教育部的筆順動畫：", enText(" Tap a character for the MOE stroke-order animation: "), ext(S.links.stroke)),
    h("p", { class: "small muted" }, "筆順動畫是 CC BY-NC-ND，只連結。這裡不用 Hanzi Writer（它是大陸筆順）。",
      enText(" The animations are CC BY-NC-ND: linked only. No Hanzi Writer here (it uses Mainland stroke order).")),
    S.d.noChars ? notice("字表和部首還沒建置。", "The character lists and radicals (docs/data/characters.json) aren't built yet.", "status") : null,
    ladder("漢字梯子 Characters ladder",
      rung("214 個部首", "The 214 Kangxi radicals (as MOE uses them)", 1, () => radicals(C.radicals)),
      ...[1, 2, 3, 4, 5, 6, 7].filter(n => C.levels.some(([k]) => k === n)).map(n => {
        const cs = C.levels.find(([k]) => k === n)[1];
        return rung(`第 ${n} 級的字`, `Level ${n} characters (${cs.length})`, n, () => h("details", { class: "adv-details", open: n === S.L },
          h("summary", {}, `${cs.length} 個字 `, enText(`${cs.length} characters`)), h("div", { class: "adv-chars" }, cs.map(charLink))));
      })),
    extras("characters"));
}
function radicals(list) {
  if (!list.length) return h("p", { class: "muted small" }, "部首表還沒建置。", enText(" The radical table isn't built yet."));
  const q = h("input", { type: "search", class: "adv-input", id: "adv-rad-q", placeholder: "人 · water · 7", autocomplete: "off" });
  const grid = h("ul", { class: "adv-rads" });
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    const hit = r => !s || r.radical.includes(s) || r.chars.includes(s) || r.meaning.toLowerCase().includes(s) || r.name.includes(s) || String(r.n) === s || String(r.strokes) === s;
    grid.replaceChildren(...list.filter(hit).map(r => h("li", { class: "adv-rad" },
      h("span", { class: "adv-rad-n small muted" }, String(r.n)), charLink(r.radical),
      h("span", { class: "adv-rad-m" }, r.name ? h("span", { lang: "zh-Hant-TW" }, r.name, " ") : null, r.meaning ? tr(r.meaning) : null, r.strokes ? h("span", { class: "muted small" }, ` · ${r.strokes} 畫`) : null),
      r.chars.length ? h("span", { class: "adv-rad-c" }, r.chars.slice(0, 8).map(charLink)) : null)));
  };
  q.addEventListener("input", draw);
  draw();
  return h("details", { class: "adv-details" }, h("summary", {}, `${list.length} 個部首 `, enText(`${list.length} radicals`)),
    h("label", { for: "adv-rad-q", class: "small" }, "找部首 ", enText("Find a radical")), q, grid);
}

// ================================================================== 6. writing and speaking output
function viewOutput(p) {
  const A = S.d.adv;
  put(p, lede("寫和說：每天的小日記、每個月的一分鐘獨白、屏東生活的角色扮演。", "Writing and speaking: short journal entries, a 1-minute monologue every month, and Pingtung role-plays."),
    S.d.noAdv ? notice("日記題目和角色扮演還沒建置。", "The journal prompts and role-plays (docs/data/advanced.json) aren't built yet.", "status") : null,
    ladder("寫與說 Writing and speaking",
      rung("每月一分鐘獨白", "The monthly 1-minute monologue", 1, () => monologue(A.monologue)),
      rung("日記題目", "Journal prompts", 1, () => journal(A.journal)),
      rung("角色扮演：屏東", "Role-plays: Pingtung", 1, () => roleplays(A.roleplays))),
    extras("output"));
}

function byLevel(items, render, { emptyZh, emptyEn }) {
  if (!items.length) return h("p", { class: "muted small" }, emptyZh, enText(` ${emptyEn}`));
  const levels = [...new Set(items.map(x => x.level || 0))].sort((a, b) => (a || 99) - (b || 99));
  const openN = (S.L ? levels.filter(k => k && k <= S.L).pop() : null) ?? levels[0]; // the learner's level (or the nearest below) starts open
  return h("div", {}, levels.map(n => {
    const g = gate(n || 1, S.L, S.all);
    const xs = items.filter(x => (x.level || 0) === n);
    return h("details", { class: "adv-details", open: g.open && n === openN },
      h("summary", {}, n ? `第 ${n} 級 ` : "其他 ", enText(n ? `Level ${n}` : "Other"), h("span", { class: "muted small" }, ` · ${xs.length}`),
        g.locked ? h("span", { class: "adv-chk no" }, g.open ? "超前" : "未開", enText(g.open ? " ahead" : " locked")) : null),
      g.open ? xs.map(render) : lockNote(g));
  }));
}

function journal(list) {
  const drafts = () => { const m = store.get("adv.journal", {}); return isObj(m) ? m : {}; };
  return h("div", {},
    h("p", { class: "small" }, "用注音輸入法打字，寫好後按「複製給 CORRECT」，貼給 Claude 改。", enText(" Type with a Zhuyin keyboard, then “Copy for CORRECT” and paste it to Claude to correct. "), h("a", { href: "#typing" }, "注音打字 ", enText("Zhuyin typing"))),
    byLevel(list, pr => {
      const id = `adv-j-${pr.id}`;
      const saved = drafts()[pr.id];
      const area = h("textarea", { id, class: "adv-area", lang: "zh-Hant-TW", rows: "4", placeholder: "在這裡寫……" });
      area.value = saved ? saved.text || "" : "";
      const count = h("span", { class: "small muted", "aria-live": "off" });
      const n = () => count.replaceChildren(`${[...area.value].filter(c => HAN.test(c)).length} 字`, enText(" characters"));
      let timer = 0;
      area.addEventListener("input", () => {
        n();
        clearTimeout(timer);
        timer = setTimeout(() => {
          const m = drafts();
          if (area.value.trim()) m[pr.id] = { text: area.value, date: today() }; else delete m[pr.id];
          store.set("adv.journal", m);
        }, 400);
      });
      n();
      const copy = h("button", { type: "button", class: "btn small", onclick: async () => {
        if (!area.value.trim()) { toast("先寫一點東西 Write something first"); return; }
        const text = `CORRECT\n題目 Prompt: ${pr.zh}${pr.en ? ` (${pr.en})` : ""}\n\n${area.value.trim()}\n`;
        toast((await copyText(text)) ? "已複製，貼給 Claude Copied: paste it to Claude" : "無法複製 Could not copy: select the text yourself");
      } }, "複製給 CORRECT ", enText("Copy for CORRECT"));
      return h("div", { class: "adv-item adv-prompt" },
        h("label", { for: id, class: "adv-prompt-q" }, zhRun(pr.zh, pr.zhuyin, pr.spoken), pr.en ? [" ", tr(pr.en)] : null),
        pr.hints.length ? h("p", { class: "adv-hints small" }, "可以用：", enText(" Useful: ", { class: "muted" }), pr.hints.map((w, i) => [i ? "、" : "", zhRun(w.zh, w.zhuyin, w.spoken), w.en ? [" ", tr(`(${w.en})`, "muted")] : null])) : null,
        pr.tip ? h("p", { class: "small muted" }, labelRun(pr.tip)) : null,
        area, h("div", { class: "row" }, copy, count));
    }, { emptyZh: "還沒有日記題目。", emptyEn: "No journal prompts yet." }));
}

function monologue(topics) {
  const key = `monologue:${monthKey()}`;
  const box = h("div", { class: "adv-mono" });
  const status = h("p", { class: "adv-mono-status", "aria-live": "polite" });
  const avail = topics.filter(t => gate(t.level || 1, S.L, S.all).open);
  const pool = avail.length ? avail : topics;
  const d = new Date();
  let ti = pool.length ? (d.getFullYear() * 12 + d.getMonth()) % pool.length : 0;
  const topicEl = h("div", { class: "adv-mono-topic" });
  const drawTopic = () => {
    const t = pool[ti];
    topicEl.replaceChildren();
    put(topicEl, t ? [h("p", { class: "small muted" }, "這個月的題目 ", enText("This month's topic")), h("p", { class: "adv-mono-q" }, zhRun(t.zh, t.zhuyin, t.spoken), t.en ? [" ", tr(t.en)] : null),
      pool.length > 1 ? h("button", { type: "button", class: "btn small", onclick: () => { ti = (ti + 1) % pool.length; drawTopic(); topicEl.querySelector("button")?.focus(); } }, "換一個 ", enText("Another topic")) : null]
      : [h("p", {}, "說一分鐘：你這個月做了什麼？", enText(" Talk for one minute: what did you do this month?"))]);
  };
  drawTopic();
  const clock = h("span", { class: "adv-clock", role: "timer", "aria-live": "off" }, "1:00");
  const takes = h("div", { class: "adv-mono-takes" });
  const rec = canRecord ? new Recorder() : null;
  let tick = 0, t0 = 0;
  const fmt = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const btn = h("button", { type: "button", class: "btn primary", "aria-pressed": "false", disabled: !canRecord, onclick: async () => {
    if (rec.recording) { rec.stop(); return; }
    try {
      if (!(await rec.start())) return;
    } catch { toast("需要麥克風權限 Microphone permission needed"); return; }
    t0 = performance.now();
    setRec(true);
    status.replaceChildren("錄音中，一分鐘後自動停。", enText(" Recording: it stops by itself after one minute."));
    tick = setInterval(() => {
      const left = MONOLOGUE_S - (performance.now() - t0) / 1000;
      clock.textContent = fmt(Math.max(0, left));
      if (left <= 0) rec.stop();
    }, 250);
  } }, "● 錄音 ", enText("Record"));
  const setRec = on => {
    btn.setAttribute("aria-pressed", String(on));
    btn.classList.toggle("recording", on);
    btn.replaceChildren(...(on ? ["■ 停止 ", enText("Stop")] : ["● 錄音 ", enText("Record")]));
  };
  if (rec) rec.onstopped = blob => {
    clearInterval(tick);
    setRec(false);
    clock.textContent = "1:00";
    const dur = Math.min(MONOLOGUE_S, Math.round((performance.now() - t0) / 100) / 10);
    if (!blob || !blob.size) return;
    // a take cut off after a few seconds (tab change, a slip) must not replace this month's real one
    if (dur < 5) { status.replaceChildren("太短了，沒有存。", enText(" Too short: not saved.")); return; }
    const t = pool[ti];
    saveRecording(key, blob, { date: today(), month: monthKey(), topic: t ? t.zh : "", dur })
      .then(() => { status.replaceChildren(`存好了（${dur} 秒）。`, enText(` Saved (${dur} s).`)); drawTakes(); })
      .catch(() => status.replaceChildren("存不起來。", enText(" Could not save the recording.")));
  };
  const urls = new Map(); // recording key -> object URL, revoked when the view closes
  const urlOf = r => { if (!urls.has(r.key + r.ts)) urls.set(r.key + r.ts, URL.createObjectURL(r.blob)); return urls.get(r.key + r.ts); };
  leave = () => { clearInterval(tick); if (rec && rec.recording) rec.stop(); for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); };
  const take = (r, zh, en) => {
    const b = h("button", { type: "button", class: "btn", "aria-label": `播放 Play ${zh} ${en} ${r.date || r.month || ""}`, onclick: () => playFile(urlOf(r)) }, "▶ ", zh, en ? [" ", enText(en)] : null);
    return h("div", { class: "adv-take" }, b, h("span", { class: "small muted" }, r.date || r.month || "", r.dur ? ` · ${r.dur} s` : "", r.topic ? [" · ", h("span", { lang: "zh-Hant-TW" }, r.topic)] : null));
  };
  async function drawTakes() {
    let all = [];
    try { all = (await listRecordings()).filter(r => String(r.key).startsWith("monologue:") && r.blob).sort((a, b) => String(a.key).localeCompare(String(b.key))); } catch { all = []; }
    if (!takes.isConnected && !box.isConnected) return;
    const cur = all.find(r => r.key === key), w1 = all[0];
    takes.replaceChildren();
    put(takes,
      h("div", { class: "adv-pair" },
        cur ? take(cur, "這個月", "This month") : h("p", { class: "muted small" }, "這個月還沒錄。", enText(" Nothing recorded this month yet.")),
        w1 && w1 !== cur ? take(w1, "第一次", "Week 1") : null),
      all.length > 2 ? h("details", { class: "adv-details" }, h("summary", {}, `全部 ${all.length} 個月 `, enText(`All ${all.length} months`)),
        all.map(r => take(r, String(r.key).slice(10), ""))) : null);
  }
  box.append(h("p", { class: "small" }, "每個月錄一次，跟第一次比一比。錄音只存在這台裝置。", enText(" Record once a month and compare with your first one. Recordings stay on this device.")),
    topicEl, canRecord ? h("div", { class: "row" }, btn, clock) : h("p", { class: "muted small" }, "這個瀏覽器不能錄音。", enText(" Recording isn't supported in this browser.")),
    status, takes);
  drawTakes();
  return box;
}

function roleplays(list) {
  return h("div", {},
    h("p", { class: "small" }, "選你演的角色，你的台詞會先藏起來。每句都有語音（TTS，有標示）。", enText(" Pick your role and your lines are hidden first. Every line has audio (TTS, labelled).")),
    byLevel(list, rp => {
      const lines = h("ol", { class: "adv-lines" });
      let mine = "";
      const draw = () => lines.replaceChildren(...rp.lines.map(l => {
        const hide = mine && l.role === mine;
        const zh = h("span", { class: "adv-line-zh" }, hide ? h("button", { type: "button", class: "btn small", onclick: ev => {
          const shown = h("span", { class: "adv-shown", tabindex: "-1" }, zhRun(l.zh, l.zhuyin, l.spoken));
          ev.currentTarget.replaceWith(shown);
          shown.focus();
        } }, "輪到你，說完再看 ", enText("Your line: say it, then show")) : zhRun(l.zh, l.zhuyin, l.spoken));
        return h("li", { class: `adv-line${hide ? " is-mine" : ""}` }, l.role ? h("span", { class: "adv-role", lang: HAN.test(l.role) ? "zh-Hant-TW" : "en" }, l.role) : null,
          h("div", { class: "adv-line-body" }, zh, tr(l.en, "adv-line-en")), playButton({ zh: l.zh, audio: l.audio }, { cls: "btn icon small" }));
      }));
      const pick = rp.roles.length > 1 ? h("div", { class: "adv-modes", role: "group", "aria-label": "我演 I play" },
        [["", "都不演", "Just read"], ...rp.roles.map(r => [r, r, ""])].map(([v, zh, en]) => h("button", { type: "button", class: "adv-mode", "aria-pressed": String(v === mine),
          onclick: ev => { mine = v; for (const b of ev.currentTarget.parentNode.children) b.setAttribute("aria-pressed", String(b === ev.currentTarget)); draw(); } },
          labelRun(zh), en ? [" ", enText(en)] : null))) : null;
      draw();
      return h("details", { class: "adv-details adv-rp" }, h("summary", {}, zhRun(rp.zh || rp.en, rp.zh ? rp.zhuyin : ""), rp.zh && rp.en ? [" ", tr(rp.en)] : null),
        rp.setting ? h("p", { class: "small muted" }, labelRun(rp.setting), rp.settingEn ? [" ", tr(rp.settingEn)] : null) : null,
        pick ? h("p", { class: "small" }, "我演 ", enText("I play")) : null, pick, lines);
    }, { emptyZh: "還沒有角色扮演。", emptyEn: "No role-plays yet." }));
}

// ================================================================== 7. register and idioms (Band B+)
function viewRegister(p) {
  const A = S.d.adv, C = S.d.cy;
  const g = gate(REGISTER_LEVEL, S.L, S.all);
  put(p, lede("書面語和口語、新聞詞彙、正式的信和 LINE 訊息、成語。Band B 開始。", "Written vs spoken register, news vocabulary, a formal letter and a LINE message, and 成語. From Band B."));
  if (!g.open) { put(p, lockNote(g)); return; }
  if (S.d.noAdv) put(p, notice("語體資料還沒建置。", "The register data (docs/data/advanced.json) isn't built yet.", "status"));
  put(p, ladder("語體與成語 Register and idioms",
    rung("書面語和口語", "Written vs spoken", REGISTER_LEVEL, () => pairsTable(A.pairs)),
    rung("新聞詞彙", "News vocabulary", REGISTER_LEVEL, () => A.news.length ? h("ul", { class: "adv-words adv-cols" }, A.news.map(w => h("li", {}, zhRun(w.zh, w.zhuyin, w.spoken), " ", tr(w.en))))
      : h("p", { class: "muted small" }, "還沒有新聞詞彙。", enText(" No news vocabulary yet."))),
    rung("正式的信和 LINE 訊息", "A formal letter and a LINE message", REGISTER_LEVEL, () => models(A.models)),
    rung("成語", "Idioms (成語)", REGISTER_LEVEL, () => chengyu(C))), extras("register"));
}
function pairsTable(pairs) {
  if (!pairs.length) return h("p", { class: "muted small" }, "還沒有書面語和口語的對照。", enText(" No written/spoken pairs yet."));
  return h("div", { class: "adv-table-wrap" }, h("table", { class: "adv-table" },
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "書面語 ", enText("Written")), h("th", { scope: "col" }, "口語 ", enText("Spoken")), showEn() ? h("th", { scope: "col" }, "英文 ", enText("English")) : null)),
    h("tbody", {}, pairs.map(pr => [h("tr", {}, h("td", {}, zhRun(pr.written.zh, pr.written.zhuyin)), h("td", {}, zhRun(pr.spoken.zh, pr.spoken.zhuyin)), showEn() ? h("td", {}, tr(pr.en), pr.note ? h("span", { class: "small muted" }, " ", labelRun(pr.note)) : null) : null),
      pr.examples.length ? h("tr", { class: "adv-ex-row" }, h("td", { colspan: showEn() ? "3" : "2" }, pr.examples.map(s => h("p", { class: "small" }, zhRun(s.zh, s.zhuyin, s.spoken), " ", tr(s.en))))) : null]))));
}
function models(list) {
  if (!list.length) return h("p", { class: "muted small" }, "還沒有範例。", enText(" No model texts yet."));
  return h("div", {}, list.map(m => h("details", { class: "adv-details" },
    h("summary", {}, m.kind === "line" ? "LINE 訊息 " : m.kind === "letter" ? "正式的信 " : "", m.zh ? h("span", { lang: "zh-Hant-TW" }, m.zh) : null, m.en ? [" ", tr(m.en)] : null),
    m.note ? h("p", { class: "small muted" }, labelRun(m.note)) : null,
    h("div", { class: `adv-model adv-model-${m.kind || "text"}` }, m.lines.map(l => h("p", {}, zhRun(l.zh, l.zhuyin, l.spoken), l.audio ? [" ", playButton({ zh: l.zh, audio: l.audio }, { cls: "btn icon small" })] : null, tr(l.en, "adv-line-en")))))));
}
function chengyu(C) {
  const credit = h("p", { class: "small muted adv-credit" }, C.attribution ? h("span", { lang: "zh-Hant-TW" }, C.attribution)
    : ["中華民國教育部（Ministry of Education, R.O.C.）。《成語典》。", " "], " ", enText(C.license || "CC BY-ND 3.0 TW"), ". ",
    enText("Shown unmodified."), " ", ext(S.links.idioms));
  if (!C.items.length) return h("div", {}, h("p", { class: "muted small" }, "成語還沒建置。", enText(" The idioms (docs/data/chengyu.json) aren't built yet.")), credit);
  return h("div", {}, credit, byLevel(C.items, it => h("details", { class: "adv-details adv-cy" },
    h("summary", {}, zhRun(it.zh, it.zhuyin, null, "adv-cy-zh")),
    it.fields.map(f => h("div", { class: "adv-cy-f" }, h("h4", {}, f.zh, " ", enText(f.en, { class: "muted" })), f.parts.map(t => h("p", { lang: "zh-Hant-TW" }, t)))),
    it.url ? h("p", { class: "small" }, h("a", { href: it.url, target: "_blank", rel: "noopener noreferrer" }, "教育部《成語典》這一條 ", enText("This entry in the MOE dictionary"), h("span", { class: "sr-only" }, "（另開分頁 opens in a new tab）"), " ↗")) : null),
  { emptyZh: "", emptyEn: "" }));
}

// ================================================================== 8. TOCFL preparation
const BAND_ROWS = [["N", "準備級", "Novice", "1–2"], ["A", "入門級、基礎級", "Band A (A1–A2)", "2–3"], ["B", "進階級、高階級", "Band B (B1–B2)", "4–5"], ["C", "流利級、精通級", "Band C (C1–C2)", "6–7"]];
function viewTocfl(p) {
  const L = S.L, mine = mockBand(L);
  put(p, lede("每一個階段結束，做一次官方的免費模擬試題。", "At the end of each phase, take the official free mock test."),
    h("p", {}, ext(S.links.tocfl)),
    h("div", { class: "adv-table-wrap" }, h("table", { class: "adv-table" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "等級 ", enText("Band")), h("th", { scope: "col" }, "TBCL"), h("th", { scope: "col" }, ""))),
      h("tbody", {}, BAND_ROWS.map(([b, zh, en, lv]) => h("tr", { class: b === mine ? "is-mine" : "" }, h("td", {}, h("span", { lang: "zh-Hant-TW" }, zh), " ", enText(en, { class: "muted" })),
        h("td", {}, `第 ${lv} 級`), h("td", {}, b === mine ? h("b", {}, "你的 ", enText("yours")) : "")))))),
    timer(), examNote(), extras("tocfl"));
}
function timer() {
  const saved = store.get("adv.timer", null);
  const st = isObj(saved) && saved.total > 0 ? { total: saved.total, endAt: saved.endAt || null, left: saved.left ?? saved.total } : { total: 3600, endAt: null, left: 3600 };
  const mins = h("input", { type: "number", id: "adv-t-min", class: "adv-input adv-num", min: "1", max: "240", step: "1", value: String(Math.round(st.total / 60)), inputmode: "numeric" });
  const clock = h("span", { class: "adv-clock big", role: "timer", "aria-live": "off" });
  const say = h("p", { class: "small", "aria-live": "polite" });
  const go = h("button", { type: "button", class: "btn primary" });
  const reset = h("button", { type: "button", class: "btn", onclick: () => { logHidden(); st.endAt = null; st.left = st.total = Math.max(60, Math.round(Number(mins.value) || 60) * 60); save(); draw(); say.replaceChildren("已重設。", enText(" Reset.")); } }, "重設 ", enText("Reset"));
  let iv = 0, hiddenAt = null, warned = false;
  const left = () => (st.endAt ? Math.max(0, (st.endAt - Date.now()) / 1000) : st.left);
  const fmt = s => { s = Math.ceil(s); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return `${hh ? hh + ":" + String(mm).padStart(2, "0") : mm}:${String(ss).padStart(2, "0")}`; };
  const save = () => store.set("adv.timer", { total: st.total, endAt: st.endAt, left: st.left });
  // Minutes on the external test (this page hidden) count as study time; visible time is counted by trackTime.
  const logHidden = () => { if (hiddenAt != null && st.endAt) { logMinutes("tocfl", Math.min(Date.now() - hiddenAt, st.total * 1000) / 60000); } hiddenAt = document.visibilityState === "hidden" && st.endAt ? Date.now() : null; };
  const onVis = () => logHidden();
  document.addEventListener("visibilitychange", onVis);
  const draw = () => {
    const s = left();
    clock.textContent = fmt(s);
    go.replaceChildren(...(st.endAt ? ["暫停 ", enText("Pause")] : s < st.total && s > 0 ? ["繼續 ", enText("Resume")] : ["開始 ", enText("Start")]));
    mins.disabled = !!st.endAt;
    if (st.endAt && s <= 300 && !warned && s > 0) { warned = true; say.replaceChildren("剩五分鐘。", enText(" Five minutes left.")); }
    if (st.endAt && s <= 0) {
      logHidden();
      st.endAt = null; st.left = 0; save();
      say.replaceChildren("時間到！", enText(" Time's up!"));
      toast("時間到 Time's up");
      draw();
    }
  };
  go.addEventListener("click", () => {
    if (st.endAt) { logHidden(); st.left = left(); st.endAt = null; say.replaceChildren("暫停了。", enText(" Paused.")); }
    else {
      if (st.left <= 0 || st.left >= st.total) st.left = st.total = Math.max(60, Math.round(Number(mins.value) || 60) * 60);
      st.endAt = Date.now() + st.left * 1000; warned = st.left <= 300;
      say.replaceChildren("開始計時。", enText(" Timer started: open the mock test."));
    }
    save(); draw();
  });
  mins.addEventListener("change", () => { if (!st.endAt) { st.left = st.total = Math.max(60, Math.round(Number(mins.value) || 60) * 60); save(); draw(); } });
  iv = setInterval(draw, 500);
  const prev = leave;
  leave = () => { prev?.(); clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  draw();
  return section("計時器", "Timer",
    h("p", { class: "small muted" }, "設定模擬試題寫的時間，按開始，再在另一個分頁做題。", enText(" Set the time the mock test states, press Start, then do the test in its own tab.")),
    h("div", { class: "row adv-timer" }, h("label", { for: "adv-t-min" }, "分鐘 ", enText("Minutes")), mins, clock),
    h("div", { class: "row" }, go, reset), say);
}
function examNote() {
  const dis = store.get("adv.examNote", {}) || {};
  const b = examNoteBand(S.L, dis);
  if (!b) return null;
  const box = h("p", { class: "adv-notice" }, "真正的華語文能力測驗要付報名費，考不考由你決定。", enText(" The real TOCFL exam costs money; whether to take it is your call. "),
    h("button", { type: "button", class: "btn small", onclick: () => {
      store.set("adv.examNote", { ...dis, [b]: today() });
      const next = [...panel.querySelectorAll(FOCUSABLE)].find(x => !box.contains(x) && box.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
      box.remove();
      (next || panel).focus({ preventScroll: true });
    } }, "知道了 ", enText("Got it")));
  return box;
}

// ================================================================== 9. immersion
function viewImmersion(p) {
  const on = !!settings().immersion;
  put(p, lede("沉浸模式：介面只用中文。學習內容的英文翻譯照「英文」開關，不受影響。", "Immersion mode: a Chinese-only interface. The English translations of learning content follow the separate English switch."),
    h("p", {}, "現在：", on ? h("b", {}, "開 ", enText("On")) : h("b", {}, "關 ", enText("Off")), " · ", inner("settings.html", "到設定切換", "Switch it in Settings")),
    S.L && S.L >= 4 && !on ? h("p", { class: "adv-notice" }, "你到 Band B 了，可以試試沉浸模式。", enText(" You've reached Band B: a good time to try immersion mode.")) : null,
    h("p", { class: "small muted" }, "每個按鈕和連結在沉浸模式下都還看得到中文名稱。", enText(" Every button and link keeps a visible Chinese name in immersion mode.")));
}

// ================================================================== §8.5 Zhuyin typing
function viewTyping(p) {
  const step = (zh, en, path) => h("li", {}, h("b", {}, zh, " ", enText(en)), h("br"), enText(path, { class: "tr adv-path" }));
  put(p, lede("第一週就開始用注音打字：它要你打對聲母、韻母和聲調，沒有模糊的空間，像 ㄧㄣ／ㄧㄥ 這種分別就練到了。",
    "Type with Zhuyin from week 1: it forces the exact initial, final and tone, with no fuzzy matching, so it trains distinctions like ㄧㄣ/ㄧㄥ."),
    section("鍵盤排列", "Layout",
      h("p", {}, "標準和大千是同一種排列（Windows 叫 Standard）。", enText(" 標準 and 大千 are the same layout (“Standard” on Windows).")),
      h("ul", { class: "adv-keys" }, [["Space", "一聲", "T1"], ["6", "ˊ", "T2"], ["3", "ˇ", "T3"], ["4", "ˋ", "T4"], ["7", "˙", "neutral"]].map(([k, zh, en]) =>
        h("li", {}, h("kbd", {}, k), " ", h("span", { lang: "zh-Hant-TW" }, zh), " ", enText(en, { class: "muted" })))),
      h("p", {}, inner("lab.html#dictation", "注音館：聽寫鍵盤用一樣的排列", "Zhuyin Lab: the dictation keyboard uses this layout"))),
    section("設定", "Setup",
      h("ol", { class: "adv-steps" },
        step("Windows 11", "", "Settings › Time & language › Language & region › Chinese (Traditional, Taiwan) › Microsoft Bopomofo (Standard)"),
        step("iPhone / iOS", "", "Settings › General › Keyboard › Keyboards › Add › Chinese (Traditional) › Zhuyin"),
        step("Android", "", "Gboard › Languages › Add keyboard › 中文（台灣）注音"))),
    section("多練習", "Extra practice", h("p", {}, ext(S.links.i2bopomo))),
    h("p", { class: "small muted" }, "手寫可以不做；先認字。", enText(" Handwriting is optional: recognition comes first. "), h("a", { href: "#characters" }, "漢字 ", enText("Characters"))),
    extras("typing"));
}

if (app) boot().catch(err => { console.error(err); app.append(h("p", { class: "feedback bad" }, "載入失敗 ", enText(`Could not load the Advanced page: ${err.message}`))); });
