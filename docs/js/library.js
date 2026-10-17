// 資料庫 Library (MASTER_PROMPT §5.6, M4 design §3): one search over every collection (characters, Zhuyin with or
// without tones, pinyin with or without tones, English), browsing by collection with level / topic / type / status
// filters, and the entry view (ruby, audio, examples, grammar notes, my note, status, a "say it" recorder, dictionary
// links). Lists render in pages of 50, so ~3,500 words stay fast.
//
// Audio: a word plays its MOE clip: the self-hosted one when docs/data/audio.json has it, else STREAMED from the moedict
// CDN with a media fragment for the headword span (`#t=s,e`), or, before the span is measured, the file's first 1.2 s
// (cut by the page). Sentences play their TTS file (labelled TTS) or the browser voice (labelled). Nothing else.
//
// The data files are optional: a missing one shows a clear notice for its collection, and when search.json is missing
// the page builds the same index from the collections itself (pinyin then only for words).
// Other pages may import the helpers (loadLibrary, findEntry, statusOf, setStatus, entryHref, troubleEntries): the page
// itself boots only inside <main id="app" data-page="library">.
import { h, $, clear, mountShell, store, loadJSON, ruby, playButton, stopAudio, settings, setSetting, enText, bi,
  trackTime, toast, recordWidget, audioInfo } from "./app.js";

// ------------------------------------------------------------------ constants
export const TYPES = ["word", "grammar", "pattern", "phrase", "measure", "taiwan", "reading"]; // also the result group order
const INFO = {
  word: { zh: "詞", en: "Words", one: "Word", file: "library-words" },
  grammar: { zh: "語法", en: "Grammar", one: "Grammar point", file: "grammar" },
  pattern: { zh: "句型", en: "Patterns", one: "Sentence pattern", file: "patterns" },
  measure: { zh: "量詞", en: "Measure words", one: "Measure word", file: "measure-words" },
  taiwan: { zh: "臺灣用語", en: "Taiwan vs Mainland", one: "Taiwan usage", file: "taiwan-vs-mainland" },
  reading: { zh: "臺灣讀音", en: "Taiwan readings", one: "Taiwan reading", file: "tones" },
  phrase: { zh: "常用語", en: "Phrasebook", one: "Phrase", file: "phrasebook" },
};
const info = t => INFO[t] || { zh: t, en: t, one: t, file: t };
// [tab id, 中文, English, collection type]
const TABS = [["words", "詞", "Words", "word"], ["grammar", "語法", "Grammar", "grammar"], ["patterns", "句型", "Patterns", "pattern"],
  ["measure", "量詞", "Measure words", "measure"], ["taiwan", "臺灣用語", "Taiwan vs Mainland", "taiwan"],
  ["readings", "臺灣讀音", "Taiwan readings", "reading"], ["phrases", "常用語", "Phrasebook", "phrase"],
  ["notes", "我的筆記", "My notes", null], ["mistakes", "我的錯誤", "My mistakes", null]];
const tabType = id => (TABS.find(t => t[0] === id) || [])[3] || null;
export const STATUSES = [["new", "新", "New"], ["learning", "學習中", "Learning"], ["known", "會了", "Known"], ["trouble", "困難", "Trouble"]];
const STATUS_KEY = "lib.status"; // {"<type>:<key>": "learning" | "known" | "trouble"}; absent = new
const NOTES_KEY = "lib.notes";   // {"<type>:<key>": "text"}
const PAGE = 50;
const MOE_STREAM = "https://r2-assets.moedict.tw/audio/a/";
const UNSPANNED_MAX = 1.2; // s: a streamed clip whose headword span is not measured yet plays at most this long
const SEARCH_DELAY = 140;  // ms debounce
const MOE_NAME = "MOE human voice · 教育部真人發音";

// search.json types, whatever the build calls them
const TYPE_ALIASES = {
  word: ["w", "words", "vocab", "vocabulary", "library-words", "library_words", "lw", "tbcl"],
  grammar: ["g", "grammar-point", "grammar_point", "gp"],
  pattern: ["p", "patterns", "sentence-pattern", "frame"],
  measure: ["m", "mw", "cl", "measure-word", "measure-words", "measure_word", "measure_words", "measures", "classifier"],
  taiwan: ["t", "tw", "twm", "taiwan-vs-mainland", "taiwan_vs_mainland", "usage", "taiwan-usage", "vs"],
  reading: ["r", "readings", "taiwan-reading", "taiwan-readings", "taiwan_readings"],
  phrase: ["ph", "phrases", "phrasebook", "phrase-book"],
};
export function normType(t) {
  const s = String(t ?? "").toLowerCase().trim();
  for (const [k, list] of Object.entries(TYPE_ALIASES)) if (s === k || list.includes(s)) return k;
  return s || "other";
}

// ------------------------------------------------------------------ small helpers (pure)
const arr = x => (Array.isArray(x) ? x : []);
const str = x => (x == null ? "" : Array.isArray(x) ? x.filter(v => v != null && v !== "").join("; ") : String(x));
const listOf = (x, ...keys) => (Array.isArray(x) ? x : x && typeof x === "object" ? keys.map(k => x[k]).find(Array.isArray) || [] : []);
const HAN = /\p{sc=Han}/u;
const BOPO = /[ㄅ-ㄯㆠ-ㆿ]/;
export function levelOf(x) { const m = String(x ?? "").match(/(\d)\s*(\*)?/); return m ? m[1] + (m[2] ? "*" : "") : ""; }
export const levelRank = lv => (lv ? Number(lv[0]) * 2 + (lv.endsWith("*") ? 1 : 0) : 99);
const levelLabel = lv => (lv ? `第${lv}級` : "");
export const zhuyinKey = z => str(z).replace(/[\sˉ]+/g, "");
export const zhuyinBare = z => zhuyinKey(z).replace(/[ˊˇˋ˙]/g, "");
const splitTopics = t => (Array.isArray(t) ? t : str(t).split(/[、,;，；]/)).map(s => String(s).trim()).filter(Boolean);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- pinyin: "vowel + tone digit" keys (mǎshàng -> ma3sha4ng), so marks and numbers compare alike
const TONED = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", "ü": "ǖǘǚǜ" };
const MARK = {};
for (const [v, s] of Object.entries(TONED)) [...s].forEach((c, i) => { MARK[c] = (v === "ü" ? "u" : v) + (i + 1); });
// One numbered syllable chunk -> tone mark on the standard vowel (a/e first, then o of "ou", else the last vowel) of
// its last vowel cluster ("mashang3" marks the a of -ang). Tone 5/0 = neutral, no mark.
function markSyllable(syl, t) {
  const s = syl.replace(/u:|v/g, "ü");
  if (!(t >= 1 && t <= 4)) return s;
  const m = s.match(/[aeiouü]+(?=[^aeiouü]*$)/);
  if (!m) return s;
  const c = m[0];
  let i = c.search(/[ae]/);
  if (i < 0) i = c.includes("ou") ? c.indexOf("o") : c.length - 1;
  return s.slice(0, m.index + i) + TONED[c[i]][t - 1] + s.slice(m.index + i + 1);
}
export const numberedToMarked = s => String(s).replace(/([a-zü:]+)([0-5])/gi, (_, syl, t) => markSyllable(syl.toLowerCase(), Number(t)));
export function pinyinTonedKey(p) {
  let s = str(p).toLowerCase().normalize("NFC");
  if (/[0-5]/.test(s)) s = numberedToMarked(s);
  let out = "";
  for (const ch of s) out += MARK[ch] || (ch === "ü" || ch === "v" ? "u" : ch >= "a" && ch <= "z" ? ch : "");
  return out;
}
// A query key -> regex source: a vowel the learner gave no tone to may carry any tone.
export function pinyinPattern(key) {
  let out = "";
  for (let i = 0; i < key.length; i++) { out += key[i]; if ("aeiou".includes(key[i]) && !/[1-4]/.test(key[i + 1] || "")) out += "[1-4]?"; }
  return out;
}
// Zhuyin query with tone marks -> regex source over the toned, space-free reading: a syllable typed without a mark may
// carry any tone (tone 1 has none in Zhuyin), a neutral ˙ may precede any symbol.
export function zhuyinPattern(key) {
  const c = [...key];
  let out = "";
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if ("ˊˇˋ˙".includes(ch)) { out += ch; continue; }
    out += (c[i - 1] === "˙" ? "" : "˙?") + ch + ("ˊˇˋ".includes(c[i + 1] || "") ? "" : "[ˊˇˋ]?");
  }
  return out;
}

// ------------------------------------------------------------------ search
const PINYIN_LIKE = /^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü:'’\s0-5-]+$/i;
// -> null | {kind: "han", s} | {kind: "zhuyin", toned, s, full?, start?, any?} | {kind: "latin", en, py?}
export function parseQuery(raw) {
  const q = String(raw ?? "").normalize("NFC").trim();
  if (!q) return null;
  if (HAN.test(q)) {
    const s = q.replace(/[\s，。？！、,.?!；;：:「」]/g, "");
    return s ? { kind: "han", s } : null;
  }
  if (BOPO.test(q)) {
    const key = zhuyinKey(q).replace(/[^ㄅ-ㄯㆠ-ㆿˊˇˋ˙]/g, "");
    if (!/[ˊˇˋ˙]/.test(key)) return { kind: "zhuyin", toned: false, s: key };
    const src = zhuyinPattern(key);
    return { kind: "zhuyin", toned: true, s: zhuyinBare(key), full: new RegExp(`^${src}$`), start: new RegExp(`^${src}`), any: new RegExp(src) };
  }
  if (!/[a-zà-ɏ]/i.test(q)) return null;
  const lower = q.toLowerCase().replace(/\s+/g, " ");
  const out = { kind: "latin", en: enQuery(lower) };
  if (PINYIN_LIKE.test(q)) {
    const key = pinyinTonedKey(lower);
    const bare = key.replace(/[0-9]/g, "");
    if (bare) {
      const src = pinyinPattern(key);
      out.py = { toned: /[1-4]/.test(key), bare, full: new RegExp(`^${src}$`), start: new RegExp(`^${src}`), any: new RegExp(src) };
    }
  }
  return out;
}
function enQuery(lower) {
  const q = lower.replace(/^to /, "").trim();
  if (!q) return null;
  const e = escRe(q);
  return { q, word: new RegExp(`(^|[^a-z])${e}($|[^a-z])`), prefix: new RegExp(`(^|[^a-z])${e}`) };
}
// 0 = a whole sense, 1 = a whole word, 2 = a word start, 9 = no match
function enScore(en, r) {
  if (!r || !en || !r.prefix.test(en)) return 9;
  const senses = en.split(/[;,/|]/).map(s => s.replace(/\([^)]*\)/g, "").replace(/^\s*to\s+/, "").trim());
  if (senses.includes(r.q)) return 0;
  return r.word.test(en) ? 1 : 2;
}
function pinyinScore(it, py) {
  let best = 9;
  for (const k of it.pts) best = Math.min(best, py.full.test(k) ? 0 : py.start.test(k) ? 1 : py.bare.length >= 3 && py.any.test(k) ? 2 : 9);
  if (best < 9 || (it.pts.length && py.toned)) return best; // a toned query never matches a known reading of another tone
  for (const p of it.pns) {
    const s = p === py.bare ? 0 : p.startsWith(py.bare) ? 1 : py.bare.length >= 3 && p.includes(py.bare) ? 2 : 9;
    if (s < 9) best = Math.min(best, s + (py.toned ? 1 : 0)); // tones unknown for this entry: a weaker match
  }
  return best;
}
// 0 exact … 3 weak, 9 = no match
export function scoreItem(it, q) {
  if (q.kind === "han") {
    let best = 9;
    for (const z of it.zhs) best = Math.min(best, z === q.s ? 0 : z.startsWith(q.s) ? 1 : z.includes(q.s) ? 2 : 9);
    return best;
  }
  if (q.kind === "zhuyin") {
    if (!q.s || !it.zn) return 9;
    if (!q.toned) return it.zn === q.s ? 0 : it.zn.startsWith(q.s) ? 1 : it.zn.includes(q.s) ? 2 : 9;
    return q.full.test(it.z) ? 0 : q.start.test(it.z) ? 1 : q.any.test(it.z) ? 2 : 9;
  }
  let best = enScore(it.en, q.en);
  if (q.py) best = Math.min(best, pinyinScore(it, q.py));
  return best;
}
// Matching entries, best first: score, then TBCL level, then shorter headwords, then data order.
export function searchIndex(index, q) {
  if (!q) return [];
  const hits = [];
  for (const it of index) { const s = scoreItem(it, q); if (s < 9) hits.push([s, it]); }
  hits.sort((a, b) => a[0] - b[0] || levelRank(a[1].e.level) - levelRank(b[1].e.level) || a[1].e.zh.length - b[1].e.zh.length || a[1].i - b[1].i);
  return hits.map(x => x[1].e);
}

// ------------------------------------------------------------------ data: normalized entries
// entry: {type, key, zh (headword), zhuyin, spoken, en, level ("1".."4*"), topics[], pinyin[] (toned), alt[] (more Han
// strings to search), szy (Zhuyin to search when the headword has none), searchEn, raw}
function entry(type, raw, f) {
  return { type, key: "", zh: str(f.zh).trim(), zhuyin: str(f.zhuyin), spoken: f.spoken ? str(f.spoken) : null, en: str(f.en),
    level: levelOf(f.level), topics: splitTopics(f.topics), pinyin: arr(f.pinyin).map(str).filter(Boolean), alt: arr(f.alt).map(str).filter(Boolean),
    szy: str(f.szy), searchEn: str(f.searchEn), raw, k0: f.key == null || f.key === "" ? "" : String(f.key) };
}
export function normalize(type, r, i) {
  switch (type) {
    case "word": return entry(type, r, { zh: r.w ?? r.zh, zhuyin: r.z ?? r.zhuyin, spoken: r.spoken ?? r.sp, en: r.en, level: r.lv ?? r.level,
      topics: r.t ?? r.topic, pinyin: [r.p ?? r.pinyin], key: "" });
    case "grammar": return entry(type, r, { zh: r.pattern || r.title_zh || r.id, en: r.title_en, level: r.level, alt: [r.structure],
      searchEn: [r.title_en, r.structure].filter(Boolean).join(" | "),
      key: r.id || (r.tbcl != null ? `G${String(r.tbcl).padStart(3, "0")}` : `G-${i}`) });
    case "pattern": return entry(type, r, { zh: r.pattern || r.zh, zhuyin: r.pattern ? "" : r.zhuyin, spoken: r.pattern ? null : r.spoken,
      szy: r.zhuyin, en: r.en, level: r.level, topics: r.situation, alt: [r.zh], key: r.id ?? r.zh });
    case "measure": return entry(type, r, { zh: r.zh, zhuyin: r.zhuyin, en: r.en, level: r.level, alt: [r.example_zh],
      searchEn: [r.en, r.used_for].filter(Boolean).join(" | "), key: r.zh });
    case "taiwan": return entry(type, r, { zh: r.taiwan ?? r.zh, zhuyin: r.taiwan_zhuyin ?? r.zhuyin, spoken: r.spoken, en: r.en, level: r.level,
      topics: r.category, alt: [r.mainland, r.example_zh], key: r.taiwan ?? r.zh });
    case "reading": return entry(type, r, { zh: r.zh, zhuyin: r.zhuyin, spoken: r.spoken, en: r.en, level: r.level, pinyin: [r.mainland], key: r.zh });
    case "phrase": return entry(type, r, { zh: r.zh, zhuyin: r.zhuyin, spoken: r.spoken, en: r.en, level: r.level, topics: r.situation, key: r.id ?? r.zh });
    default: return entry(type, r, { zh: r.zh, zhuyin: r.zhuyin, en: r.en, level: r.level, key: r.id ?? r.key ?? r.zh });
  }
}
// Keys: words by their characters (+ "|reading" for a homograph), the rest by id or headword; always unique per type.
function assignKeys(list) {
  const count = new Map();
  for (const e of list) count.set(e.k0 || e.zh, (count.get(e.k0 || e.zh) || 0) + 1);
  const seen = new Set();
  list.forEach((e, i) => {
    let k = e.k0 || e.zh;
    if (count.get(k) > 1 && e.zhuyin) k = `${k}|${zhuyinKey(e.zhuyin)}`;
    if (seen.has(k)) k = `${k}|${i}`;
    seen.add(k);
    e.key = k;
    delete e.k0;
  });
}
function sortFor(type, list) {
  if (type === "word") return list.map((e, i) => [e, i]).sort((a, b) => levelRank(a[0].level) - levelRank(b[0].level) || a[1] - b[1]).map(x => x[0]);
  if (type === "grammar") return list.slice().sort((a, b) => (Number(a.raw.tbcl) || 1e9) - (Number(b.raw.tbcl) || 1e9) || levelRank(a.level) - levelRank(b.level));
  return list;
}
function addAliases(lookup, e) {
  let m = lookup.get(e.type);
  if (!m) lookup.set(e.type, m = new Map());
  const r = e.raw || {};
  const keys = new Set([e.key, e.zh, `${e.zh}|${zhuyinKey(e.zhuyin)}`, `${e.zh}|${e.zhuyin}`, r.id != null && e.type !== "word" ? String(r.id) : null]);
  for (const k of keys) if (k) { const a = m.get(k); if (a) { if (!a.includes(e)) a.push(e); } else m.set(k, [e]); }
}
export function resolve(lookup, type, key, zh = "", zhuyin = "") {
  const m = lookup.get(normType(type));
  if (!m) return null;
  const cands = m.get(String(key)) || (zh ? m.get(String(zh)) : null);
  if (!cands || !cands.length) return null;
  if (cands.length === 1) return cands[0];
  const exact = cands.find(e => e.key === String(key));
  if (exact) return exact;
  const zk = zhuyinKey(zhuyin);
  return cands.find(e => (!zh || e.zh === zh) && zhuyinKey(e.zhuyin) === zk) || cands.find(e => e.zh === zh) || cands[0];
}
function indexItem(e, i) {
  const pts = e.pinyin.map(pinyinTonedKey).filter(Boolean);
  const zy = e.zhuyin || e.szy;
  return { e, i, zhs: [e.zh, ...e.alt].filter(Boolean), z: zhuyinKey(zy), zn: zhuyinBare(zy), pts,
    pns: [...new Set(pts.map(k => k.replace(/[0-9]/g, "")))], en: (e.searchEn || e.en).toLowerCase() };
}
// raw: {word, grammar, pattern, measure, taiwan, reading, phrase} (each the parsed file or null); searchRows: search.json
export function assemble(raw, searchRows = null, mistakes = null) {
  const missing = new Set(), entries = [], byType = {}, lookup = new Map();
  for (const type of TYPES) {
    const src = raw[type];
    if (src == null) missing.add(type);
    const list = listOf(src, "entries", "items", "rows", "words", type).map((r, i) => (r && typeof r === "object" ? normalize(type, r, i) : null)).filter(e => e && e.zh);
    assignKeys(list);
    byType[type] = sortFor(type, list);
    entries.push(...byType[type]);
  }
  for (const e of entries) addAliases(lookup, e);
  const index = entries.map(indexItem);
  const itemOf = new Map(index.map(it => [it.e, it]));
  // search.json rows [type, key, zh, zhuyin, zhuyin_no_tones, pinyin_no_tones, english_lower]: add what the build knows
  // (pinyin of every entry); a row whose collection file is missing becomes a minimal entry of its own.
  for (const row of listOf(searchRows, "rows", "entries", "index")) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const [t, key, zh, zy, zyn, pyn, enl] = row;
    const type = normType(t);
    let e = resolve(lookup, type, key, str(zh), str(zy));
    if (!e) {
      e = { type, key: String(key ?? zh), zh: str(zh), zhuyin: str(zy), spoken: null, en: str(enl), level: "", topics: [], pinyin: [], alt: [], szy: "", searchEn: "", raw: null, stub: true };
      if (!e.zh) continue;
      entries.push(e);
      (byType[type] ||= []).push(e);
      addAliases(lookup, e);
      const it = indexItem(e, index.length);
      index.push(it);
      itemOf.set(e, it);
    }
    const it = itemOf.get(e);
    const pk = pyn ? pinyinTonedKey(pyn).replace(/[0-9]/g, "") : "";
    if (pk && !it.pns.includes(pk)) it.pns.push(pk);
    if (!it.en && enl) it.en = String(enl).toLowerCase();
    if (!it.zn && (zyn || zy)) { it.zn = zhuyinBare(zyn || zy); it.z = zhuyinKey(zy || zyn); }
    if (zh && !it.zhs.includes(String(zh))) it.zhs.push(String(zh));
  }
  return { entries, byType, lookup, index, missing, hasSearch: searchRows != null, mistakes: listOf(mistakes, "mistakes", "rows", "items"), pool: sentencePool(entries) };
}
// every example sentence in the Library, for a word's "examples" (TBCL's own examples are never published, §8.7)
function sentencePool(entries) {
  const out = [];
  const add = (x, from, p = "") => {
    const zh = str(x[p + "zh"]);
    if (zh) out.push({ zh, zhuyin: str(x[p + "zhuyin"]), spoken: x[p + "spoken"] || null, en: str(x[p + "en"]), audio: x[p + "audio"] || null, from });
  };
  for (const e of entries) {
    const r = e.raw;
    if (!r) continue;
    if (e.type === "grammar") arr(r.examples).forEach(x => x && add(x, e));
    else if (e.type === "pattern" || e.type === "phrase") add(r, e);
    else if (e.type === "measure" || e.type === "taiwan") add(r, e, "example_");
  }
  return out;
}
export function examplesFor(pool, e, n = 4) {
  if (!e.zh) return [];
  const seen = new Set();
  return pool.filter(s => s.from !== e && s.zh.includes(e.zh) && !seen.has(s.zh) && seen.add(s.zh)).sort((a, b) => a.zh.length - b.zh.length).slice(0, n);
}
// filters: {level, topic, type, status}; statusMap = the stored "lib.status"
export function passes(e, f, statusMap) {
  return (!f.level || e.level === f.level) && (!f.topic || e.topics.includes(f.topic)) && (!f.type || e.type === f.type)
    && (!f.status || statusOf(e, statusMap) === f.status);
}
// units-index.json (M5): {"<type>:<key>" | "<zh>": [unit id | {id, title}]}, at the top level or under entries/words/index
export function unitsFor(idx, e) {
  if (!idx || typeof idx !== "object") return [];
  const pools = [idx, idx.entries, idx.words, idx.index].filter(x => x && typeof x === "object" && !Array.isArray(x));
  for (const p of pools) {
    for (const k of [statusKey(e), `${e.type}:${e.zh}`, e.key, e.zh]) {
      const v = p[k];
      if (Array.isArray(v) && v.length) {
        return v.map(u => (u && typeof u === "object" ? { id: str(u.id ?? u.unit), title: str(u.title ?? u.zh ?? u.title_en ?? u.id) } : { id: str(u), title: str(u) }))
          .filter(u => u.id || u.title);
      }
    }
  }
  return [];
}

// ------------------------------------------------------------------ status, notes (localStorage via app.js store: "gy." prefix)
export const statusKey = e => `${e.type}:${e.key}`;
const statusMap = () => { const m = store.get(STATUS_KEY, {}); return m && typeof m === "object" ? m : {}; };
export function statusOf(e, map = statusMap()) { const s = map[statusKey(e)]; return STATUSES.some(x => x[0] === s) && s !== "new" ? s : "new"; }
export function setStatus(e, s) {
  const m = { ...statusMap() };
  if (!s || s === "new") delete m[statusKey(e)]; else m[statusKey(e)] = s;
  store.set(STATUS_KEY, m);
}
const notesMap = () => { const m = store.get(NOTES_KEY, {}); return m && typeof m === "object" ? m : {}; };
function saveNote(k, text) {
  const m = { ...notesMap() };
  if (String(text).trim()) m[k] = String(text); else delete m[k];
  store.set(NOTES_KEY, m);
}
export const entryHref = e => `library.html#e/${encodeURIComponent(e.type)}/${encodeURIComponent(e.key)}`;
const localHref = e => `#e/${encodeURIComponent(e.type)}/${encodeURIComponent(e.key)}`;
export function parseHash(hash) {
  const s = String(hash || "").replace(/^#/, "");
  const m = s.match(/^e\/([^/]+)\/(.+)$/);
  try {
    if (m) return { entry: { type: decodeURIComponent(m[1]), key: decodeURIComponent(m[2]) } };
    return { tab: decodeURIComponent(s) };
  } catch { return {}; }
}

let libPromise = null;
// All collections, the search index and the sentence pool (each file optional). Shared by every caller.
export function loadLibrary() {
  if (!libPromise) {
    const files = ["library-words", "grammar", "patterns", "measure-words", "taiwan-vs-mainland", "phrasebook", "tones", "search", "my-mistakes"];
    libPromise = Promise.all(files.map(f => loadJSON(f).catch(() => null))).then(([word, grammar, pattern, measure, taiwan, phrase, tones, search, mistakes]) =>
      assemble({ word, grammar, pattern, measure, taiwan, phrase, reading: tones ? listOf(tones.readings) : null }, search, mistakes));
  }
  return libPromise;
}
export async function findEntry(type, key) { const lib = await loadLibrary(); return resolve(lib.lookup, type, key); }
// Library items marked "trouble" (Today's Review block): [{type, key, zh, zhuyin, en, href}]
export async function troubleEntries() {
  const lib = await loadLibrary();
  const m = statusMap();
  return Object.keys(m).filter(k => m[k] === "trouble").map(k => {
    const i = k.indexOf(":");
    const e = resolve(lib.lookup, k.slice(0, i), k.slice(i + 1));
    return e ? { type: e.type, key: e.key, zh: e.zh, zhuyin: e.zhuyin, en: e.en, href: entryHref(e) } : null;
  }).filter(Boolean);
}

// ------------------------------------------------------------------ page state
const app = typeof document !== "undefined" ? document.querySelector('#app[data-page="library"]') : null;
let lib = null;
const state = { title: "", tab: "words", q: "", f: {}, shown: {}, view: "list", fromList: false, ret: null, lastKey: null };
let teardown = null; // the entry view's: saves a pending note
let els = {};        // the page's persistent elements
const filt = scope => (state.f[scope] ||= { level: "", topic: "", type: "", status: "" });
const scopeOf = () => (state.q.trim() ? "search" : state.tab);

// ------------------------------------------------------------------ streamed MOE audio (<audio> on the moedict CDN)
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
const sec2 = n => String(Math.round(n * 100) / 100);
function spanOf(s) {
  if (s && typeof s === "object" && !Array.isArray(s)) return spanOf([s.start, s.end]);
  if (!Array.isArray(s) || s.length < 2) return null;
  const a = Number(s[0]), b = Number(s[1]);
  return Number.isFinite(a) && Number.isFinite(b) && b > a && a >= 0 ? [a, b] : null;
}
export const streamUrl = (id, span) => `${MOE_STREAM}${encodeURIComponent(id)}.mp3${span ? `#t=${sec2(span[0])},${sec2(span[1])}` : ""}`;
function playStream(id, span) {
  stopAudio();
  stopStream();
  const a = new Audio(streamUrl(id, span));
  a.preload = "auto";
  const start = span ? span[0] : 0, end = span ? span[1] : UNSPANNED_MAX;
  return new Promise((resolve, reject) => {
    const me = { audio: a, raf: 0, timer: 0, done: resolve };
    stream = me;
    // the fragment's end is not honoured everywhere (iOS): the page cuts at the end itself
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
      me.timer = setTimeout(() => { if (stream === me) stopStream(); }, Math.max(0.2, end - Math.max(start, a.currentTime)) * 1000 + 120); // rAF sleeps in a hidden tab
    });
    a.addEventListener("timeupdate", () => { if (stream === me && a.currentTime >= end - 0.01) stopStream(); });
    a.addEventListener("ended", () => { if (stream === me) stopStream(); });
    a.addEventListener("error", () => { if (stream === me) { stream = null; reject(new Error("stream")); } });
    a.play().catch(err => { if (stream === me) { stream = null; reject(err); } });
  });
}
// The word's MOE clip: its own (words, readings), else the Library word with the same characters and reading.
function clipFor(e) {
  let id = null, span = null;
  if (e.raw && (e.type === "word" || e.type === "reading")) { id = e.raw.id || null; span = spanOf(e.raw.s); }
  if (!id && e.zh && e.zhuyin) {
    const zk = zhuyinKey(e.zhuyin);
    const w = (lib.lookup.get("word")?.get(e.zh) || []).find(x => zhuyinKey(x.zhuyin) === zk);
    if (w && w.raw) { id = w.raw.id || null; span = spanOf(w.raw.s); }
  }
  return { id: id ? String(id) : null, span };
}
// Play button for a word-like headword: self-hosted MOE, streamed MOE, or the browser voice (each labelled).
function wordAudio(e) {
  const { id, span } = clipFor(e);
  const local = id && audioInfo(id);
  if (local && local.src === "moe") return playButton({ id, zh: e.zh });
  if (!id) return playButton({ zh: e.zh });
  const name = span ? `${MOE_NAME} (streamed from moedict.tw)` : `${MOE_NAME} (streamed; first ${UNSPANNED_MAX} s, the word's exact span is not measured yet)`;
  const btn = h("button", { class: "btn icon lib-stream", type: "button", title: name, "aria-label": `播放 Play ${e.zh} — ${name}`,
    onclick: async ev => {
      ev.stopPropagation();
      btn.classList.add("is-playing");
      try { await playStream(id, span); } catch { toast("無法播放（離線？） Could not play the MOE clip (offline?)"); }
      btn.classList.remove("is-playing");
    } }, "🔊");
  return h("span", { class: "row", style: "gap:6px" }, btn, h("span", { class: "badge human", "aria-hidden": "true" }, "MOE"));
}
const sentenceAudio = (zh, audio) => playButton({ zh, audio: audio || null });

// ------------------------------------------------------------------ page
async function boot() {
  mountShell("library");
  state.title = document.title;
  trackTime("library");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  await loadJSON("audio").catch(() => null); // app.js's audio index (playButton labels) is ready after this
  lib = await loadLibrary();
  const params = new URLSearchParams(location.search);
  state.q = params.get("q") || "";

  clear(app);
  const allMissing = TYPES.filter(t => t !== "reading").every(t => lib.missing.has(t));
  app.append(...[h("div", { class: "page-head" },
    h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "資料庫"), h("span", { class: "en", lang: "en" }, "Library")),
    els.intro = h("p", { class: "muted small lib-lede" }, "TBCL 第 1–4* 級的詞、語法、句型、量詞、臺灣用語和常用語。可以用漢字、注音（打不打聲調都可以）、拼音或英文搜尋。",
      enText(" TBCL level 1–4* words, grammar, patterns, measure words, Taiwan usage and phrases. Search by characters, Zhuyin (with or without tones), pinyin or English."))),
  allMissing ? notice("資料庫的資料還沒建置。", "The Library data isn't built yet (docs/data/library-words.json, grammar.json …): run tools/build.py. My notes still work.", "status") : null].filter(Boolean));

  els.list = h("div", { class: "lib-listview" });
  els.entry = h("section", { class: "lib-entry", hidden: true, "aria-label": "詞條 Entry" });
  app.append(els.list, els.entry);
  buildSearch();
  els.filters = h("div", { class: "lib-filters", role: "group", "aria-label": "篩選 Filters" });
  els.browse = h("div", { class: "lib-browse" });
  els.results = h("section", { class: "lib-results", "aria-label": "搜尋結果 Search results", hidden: true });
  els.list.append(els.filters, els.browse, els.results);
  buildTabs();

  // a click on any button in the entry stops a streamed clip first (the stream's own button restarts it)
  els.entry.addEventListener("click", ev => { if (ev.target.closest("button") && !ev.target.closest(".lib-stream")) stopStream(); }, true);
  window.addEventListener("hashchange", () => route());
  window.addEventListener("pagehide", () => { teardown?.(); stopStream(); });
  document.addEventListener("keydown", ev => { // "/" jumps to the search box
    if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey || state.view !== "list") return;
    const t = ev.target;
    if (t instanceof Element && t.closest("input, textarea, select, [contenteditable]")) return;
    ev.preventDefault();
    els.q.focus();
  });
  route({ initial: true });
}
const notice = (zh, en, role = "note") => h("p", { class: "lib-notice", role }, zh, " ", enText(en));

// ---------- search box
function buildSearch() {
  const q = els.q = h("input", { type: "search", id: "lib-q", class: "lib-q", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
    enterkeyhint: "search", placeholder: "馬上 · ㄇㄚ · ma3 · horse", "aria-describedby": "lib-hint" });
  q.value = state.q;
  const clearBtn = els.clearQ = h("button", { type: "button", class: "lib-clear", "aria-label": "清除搜尋 Clear the search", hidden: !state.q,
    onclick: () => { q.value = ""; setQuery(""); q.focus(); } }, h("span", { "aria-hidden": "true" }, "✕"));
  els.hint = h("p", { id: "lib-hint", class: "lib-hint small muted" });
  els.count = h("p", { class: "lib-count small", "aria-live": "polite" });
  let timer = 0;
  q.addEventListener("input", () => { clearTimeout(timer); clearBtn.hidden = !q.value; timer = setTimeout(() => setQuery(q.value), SEARCH_DELAY); });
  q.addEventListener("keydown", ev => { if (ev.key === "Escape" && q.value) { ev.preventDefault(); q.value = ""; clearTimeout(timer); setQuery(""); } });
  els.list.append(h("form", { class: "lib-search", role: "search", onsubmit: ev => { ev.preventDefault(); clearTimeout(timer); setQuery(q.value); } },
    h("label", { for: "lib-q", class: "lib-search-label" }, "搜尋 ", h("span", { lang: "en", class: "muted" }, "Search")),
    h("div", { class: "lib-search-box" }, h("span", { class: "lib-search-ico", "aria-hidden": "true" }, "⌕"), q, clearBtn),
    els.hint, els.count));
  drawHint();
}
function drawHint() {
  const p = parseQuery(state.q);
  const say = (zh, en) => els.hint.replaceChildren(zh, " ", enText(en));
  if (!state.q.trim()) say("漢字、注音、拼音或英文都可以。按 / 開始搜尋。", "Characters, Zhuyin, pinyin or English. Press / to search.");
  else if (!p) say("請輸入漢字、注音、拼音或英文。", "Type characters, Zhuyin, pinyin or English.");
  else if (p.kind === "han") say("搜尋漢字", "Searching characters");
  else if (p.kind === "zhuyin") say(p.toned ? "注音（照你打的聲調）" : "注音（不分聲調）", p.toned ? "Zhuyin, with the tones you typed" : "Zhuyin, any tone");
  else if (p.py) say(p.py.toned ? "拼音（照你打的聲調）或英文" : "拼音（不分聲調）或英文", p.py.toned ? "Pinyin with the tones you typed, or English" : "Pinyin (any tone) or English");
  else say("英文", "English");
}
function setQuery(v) {
  const was = !!state.q.trim();
  state.q = v;
  els.clearQ.hidden = !v;
  for (const k of Object.keys(state.shown)) if (k.startsWith("search:")) delete state.shown[k];
  drawHint();
  const now = !!state.q.trim();
  if (was !== now) render(); else if (now) drawResults();
}

// ---------- tabs (ARIA tabs as in tones.js: one shared panel, roving tabindex, arrows / Home / End)
function buildTabs() {
  const tabs = els.tabs = h("div", { class: "tabs lib-tabs", role: "tablist", "aria-label": "資料庫 Library collections" });
  els.panel = h("section", { role: "tabpanel", id: "lib-panel", class: "lib-panel", tabindex: "-1" });
  for (const [id, zh, en, type] of TABS) {
    const n = type ? (lib.byType[type] || []).length : null;
    tabs.append(h("button", { type: "button", role: "tab", id: `tab-${id}`, "aria-controls": "lib-panel", "data-id": id, "aria-selected": "false", tabindex: "-1",
      onclick: () => selectTab(id) }, zh, " ", h("span", { class: "muted small", lang: "en" }, en), n ? h("span", { class: "lib-tab-n" }, ` ${n}`) : null));
  }
  tabs.addEventListener("keydown", ev => {
    const list = [...tabs.children];
    const i = list.indexOf(ev.target);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[ev.key];
    if (i < 0 || j === undefined || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    ev.preventDefault();
    const b = list[(j + list.length) % list.length];
    b.focus();
    selectTab(b.dataset.id);
  });
  els.browse.append(tabs, els.panel);
}
function selectTab(id, { draw = true } = {}) {
  if (!TABS.some(t => t[0] === id)) id = "words";
  state.tab = id;
  for (const b of els.tabs.children) {
    const on = b.dataset.id === id;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  els.panel.setAttribute("aria-labelledby", `tab-${id}`);
  if (location.hash !== "#" + id) history.replaceState(null, "", location.pathname + location.search + "#" + id);
  if (draw) render();
}

// ---------- routing: "#<tab>" lists, "#e/<type>/<key>" an entry
function route({ initial = false } = {}) {
  const r = parseHash(location.hash);
  if (r.entry) {
    if (state.view === "list") { state.ret = { y: window.scrollY }; state.fromList = !initial; }
    showEntry(r.entry.type, r.entry.key);
    return;
  }
  const wasEntry = state.view === "entry";
  if (wasEntry) leaveEntry();
  state.view = "list";
  document.title = state.title;
  els.entry.hidden = true;
  els.list.hidden = false;
  els.intro.hidden = false;
  selectTab(r.tab && TABS.some(t => t[0] === r.tab) ? r.tab : state.tab, { draw: false });
  render();
  if (wasEntry) {
    // back from an entry: the same place in the list, focus on the entry's row
    if (state.ret) window.scrollTo(0, state.ret.y);
    const row = [...(state.q.trim() ? els.results : els.panel).querySelectorAll("a.lib-row, a.lib-note-head")].find(a => a.dataset.k === state.lastKey);
    if (row) row.focus({ preventScroll: !!state.ret }); else els.panel.focus({ preventScroll: true });
  }
}
function render() {
  const searching = !!state.q.trim();
  els.browse.hidden = searching;
  els.results.hidden = !searching;
  drawFilters();
  if (searching) drawResults();
  else { els.count.replaceChildren(); drawPanel(); }
}

// ---------- filters: level, topic (TBCL 情境 / situation), type (search only), status
function drawFilters() {
  const scope = scopeOf();
  const searching = scope === "search";
  const type = searching ? null : tabType(state.tab);
  clear(els.filters);
  if (!searching && !type) { els.filters.hidden = true; return; }
  const pool = type ? lib.byType[type] || [] : lib.entries;
  if (!pool.length) { els.filters.hidden = true; return; }
  els.filters.hidden = false;
  const f = filt(scope);
  const levels = [...new Set(pool.map(e => e.level).filter(Boolean))].sort((a, b) => levelRank(a) - levelRank(b));
  const tc = new Map();
  for (const e of pool) for (const t of e.topics) tc.set(t, (tc.get(t) || 0) + 1);
  const topics = [...tc.keys()].sort((a, b) => a.localeCompare(b, "zh-Hant-TW"));
  const types = searching ? [...TYPES, ...Object.keys(lib.byType).filter(t => !TYPES.includes(t))].filter(t => (lib.byType[t] || []).length) : [];
  if (f.level && !levels.includes(f.level)) f.level = "";
  if (f.topic && !tc.has(f.topic)) f.topic = "";
  const select = (k, zh, en, opts) => {
    const s = h("select", { class: "lib-select", "data-k": k, onchange: () => {
      f[k] = s.value;
      if (searching) { for (const x of Object.keys(state.shown)) if (x.startsWith("search:")) delete state.shown[x]; drawResults(); }
      else { delete state.shown[state.tab]; drawPanel(); }
      clearBtn.hidden = !Object.values(f).some(Boolean);
    } }, h("option", { value: "" }, "全部 All"), opts.map(([v, label]) => h("option", { value: v, selected: f[k] === v }, label)));
    return h("label", { class: "lib-filter" }, h("span", { class: "lib-filter-l" }, zh, " ", h("span", { lang: "en" }, en)), s);
  };
  const clearBtn = h("button", { type: "button", class: "btn small lib-filter-clear", hidden: !Object.values(f).some(Boolean), onclick: () => {
    Object.assign(f, { level: "", topic: "", type: "", status: "" });
    drawFilters();
    if (searching) drawResults(); else { delete state.shown[state.tab]; drawPanel(); }
    els.filters.querySelector("select")?.focus();
  } }, ...bi("清除篩選", "Clear filters"));
  els.filters.append(...[
    levels.length ? select("level", "等級", "Level", levels.map(l => [l, levelLabel(l)])) : null,
    topics.length ? select("topic", "情境", "Topic", topics.map(t => [t, `${t}（${tc.get(t)}）`])) : null,
    types.length > 1 ? select("type", "類別", "Type", types.map(t => [t, `${info(t).zh} ${info(t).en}`])) : null,
    select("status", "狀態", "Status", STATUSES.map(([v, zh, en]) => [v, `${zh} ${en}`])),
    clearBtn].filter(Boolean));
}

// ---------- rows (one link per entry) and a paged list
const sentenceLike = e => e.type === "phrase" || e.type === "pattern" || e.type === "grammar" || [...e.zh].length > 6;
function rowHead(e) {
  if (e.type === "grammar" || (e.type === "pattern" && !e.zhuyin) || e.stub && !e.zhuyin) return h("span", { lang: "zh-Hant-TW" }, e.zh);
  return ruby(e.zh, e.zhuyin, { cls: "", spoken: e.spoken });
}
function rowBody(e) {
  const r = e.raw || {};
  const sub = [];
  if (e.type === "word" && settings().pinyin && e.pinyin[0]) sub.push(h("span", { lang: "zh-Latn-pinyin" }, e.pinyin[0]));
  if (e.type === "pattern" && r.zh && r.pattern) sub.push(h("span", { lang: "zh-Hant-TW" }, r.zh));
  if (e.type === "taiwan" && r.mainland) sub.push(h("span", {}, "大陸 ", h("span", { lang: "en" }, "Mainland"), " ", h("span", { lang: "zh-Hant-TW" }, r.mainland)));
  if (e.type === "reading" && r.mainland) sub.push(h("span", {}, "大陸 ", h("span", { lang: "en" }, "Mainland"), " ", h("span", { lang: "zh-Latn-pinyin" }, r.mainland)));
  if (e.type === "measure" && r.used_for) sub.push(enText(r.used_for));
  if (e.topics.length && e.type !== "taiwan") sub.push(h("span", { lang: "zh-Hant-TW" }, e.topics.join("、")));
  return [e.en ? enText(e.en, { class: "lib-row-en" }) : null,
    sub.length ? h("span", { class: "lib-row-sub" }, sub.map((x, i) => [i ? " · " : null, x])) : null];
}
const STATUS_NAME = Object.fromEntries(STATUSES.map(([id, zh, en]) => [id, `${zh} ${en}`]));
function row(e, sm) {
  const st = statusOf(e, sm);
  return h("li", {}, h("a", { class: "lib-row" + (sentenceLike(e) ? " sent" : ""), href: localHref(e), "data-k": statusKey(e) },
    h("span", { class: "lib-row-zh" }, rowHead(e)),
    h("span", { class: "lib-row-body" }, rowBody(e)),
    h("span", { class: "lib-row-side" },
      e.level ? h("span", { class: "lib-lv", title: `TBCL ${levelLabel(e.level)}` }, h("span", { "aria-hidden": "true" }, e.level), h("span", { class: "sr-only" }, ` ${levelLabel(e.level)}`)) : null,
      st !== "new" ? h("span", { class: `lib-st st-${st}`, title: STATUS_NAME[st] }, h("span", { class: "sr-only" }, ` ${STATUS_NAME[st]}`)) : null)));
}
// Renders items in pages of 50 into box, with "show more"; state.shown[key] keeps the count across redraws.
function pagedList(box, items, key, sm) {
  const ul = h("ul", { class: "lib-list" });
  const more = h("div", { class: "lib-more" });
  const draw = (focusFrom = -1) => {
    const n = Math.min(items.length, state.shown[key] || PAGE);
    for (let i = ul.children.length; i < n; i++) ul.append(row(items[i], sm));
    clear(more);
    if (n < items.length) {
      more.append(h("button", { type: "button", class: "btn", onclick: () => {
        const from = ul.children.length;
        state.shown[key] = (state.shown[key] || PAGE) + PAGE;
        draw(from);
      } }, ...bi(`再顯示 ${Math.min(PAGE, items.length - n)} 筆`, "Show more")), h("span", { class: "small muted" }, `${n} / ${items.length}`));
    }
    if (focusFrom >= 0) ul.children[focusFrom]?.querySelector("a")?.focus(); // the button is gone: the first new row
  };
  draw();
  box.append(ul, more);
}

// ---------- browse panel
function drawPanel() {
  const panel = clear(els.panel);
  const type = tabType(state.tab);
  if (state.tab === "notes") return drawNotes(panel);
  if (state.tab === "mistakes") return drawMistakes(panel);
  const all = lib.byType[type] || [];
  if (lib.missing.has(type) && !all.length) {
    panel.append(type === "reading"
      ? notice("臺灣讀音的資料還沒建置。", "Taiwan readings come from docs/data/tones.json, which isn't built yet: run tools/build.py.")
      : notice("這部分的資料還沒建置。", `This collection (docs/data/${info(type).file}.json) isn't built yet: run tools/build.py.`));
    return;
  }
  if (type === "reading") {
    panel.append(h("p", { class: "small lib-lede" }, "這些詞臺灣（教育部）和大陸讀音不同：學教育部的讀音。", enText(" These words are read differently in Taiwan (MOE) and on the Mainland: learn the MOE reading. "),
      h("a", { href: "tones.html#readings" }, "到聲調館練習 ", h("span", { lang: "en" }, "Practise in the Tone Gym"), " →")));
  }
  if (type === "taiwan") {
    panel.append(h("p", { class: "small muted lib-lede" }, "臺灣常用的說法和大陸說法對照。學左邊的。", enText(" Taiwan usage next to the Mainland word: learn the Taiwan one.")));
  }
  const f = filt(state.tab);
  const sm = statusMap();
  const items = all.filter(e => passes(e, f, sm));
  panel.append(h("p", { class: "small muted lib-total" }, `${items.length} 筆`, enText(` ${items.length} ${items.length === 1 ? "entry" : "entries"}${items.length !== all.length ? ` of ${all.length}` : ""}`)));
  if (!items.length) { panel.append(h("p", { class: "muted" }, ...bi("沒有符合篩選的項目。", "Nothing matches these filters."))); return; }
  pagedList(panel, items, state.tab, sm);
}

// ---------- search results, grouped by type
function drawResults() {
  const box = clear(els.results);
  const q = parseQuery(state.q);
  if (!q) { els.count.replaceChildren(); box.append(h("p", { class: "muted" }, ...bi("請輸入漢字、注音、拼音或英文。", "Type characters, Zhuyin, pinyin or English."))); return; }
  const f = filt("search");
  const sm = statusMap();
  const hits = searchIndex(lib.index, q).filter(e => passes(e, f, sm));
  els.count.replaceChildren(...(hits.length ? [`找到 ${hits.length} 筆`, enText(` ${hits.length} result${hits.length === 1 ? "" : "s"}`)] : bi("沒有結果", "No results")));
  if (!hits.length) {
    box.append(h("p", { class: "muted" }, "試試看不打聲調，或換英文。", enText(" Try without tones, or in English.")));
    if (!lib.hasSearch && q.kind === "latin") box.append(h("p", { class: "small muted" }, enText("(The search index docs/data/search.json isn't built yet, so only words have pinyin.)")));
    return;
  }
  const groups = new Map();
  for (const e of hits) { if (!groups.has(e.type)) groups.set(e.type, []); groups.get(e.type).push(e); }
  const order = [...TYPES, ...[...groups.keys()].filter(t => !TYPES.includes(t))];
  for (const t of order) {
    const list = groups.get(t);
    if (!list) continue;
    const id = `res-${t}`;
    const sec = h("section", { class: "lib-group", "aria-labelledby": id },
      h("h2", { id, class: "lib-group-h" }, h("span", { lang: "zh-Hant-TW" }, info(t).zh), " ", h("span", { lang: "en", class: "muted" }, info(t).en), h("span", { class: "lib-group-n" }, ` ${list.length}`)));
    pagedList(sec, list, `search:${t}`, sm);
    box.append(sec);
  }
}

// ---------- my notes, my mistakes
function drawNotes(panel) {
  const m = notesMap();
  const rows = Object.entries(m).filter(([, t]) => t && String(t).trim());
  panel.append(h("p", { class: "small muted lib-lede" }, "在任何詞條寫的筆記都會出現在這裡，只存在這台裝置。", enText(" Notes you write on any entry appear here. They stay on this device.")));
  if (!rows.length) { panel.append(h("p", { class: "muted" }, ...bi("還沒有筆記。打開一個詞條，寫下你的筆記。", "No notes yet. Open an entry and write one."))); return; }
  panel.append(h("ul", { class: "lib-notes" }, rows.map(([k, text]) => {
    const i = k.indexOf(":");
    const e = resolve(lib.lookup, k.slice(0, i), k.slice(i + 1));
    return h("li", { class: "lib-note-item" },
      e ? h("a", { class: "lib-note-head", href: localHref(e), "data-k": statusKey(e) }, rowHead(e), " ", h("span", { class: "small muted" }, info(e.type).zh))
        : h("span", { class: "lib-note-head muted", lang: "zh-Hant-TW" }, k.slice(i + 1)),
      h("p", { class: "lib-note-text" }, String(text)));
  })));
}
function drawMistakes(panel) {
  panel.append(h("p", { class: "small muted lib-lede" }, "跟老師或語伴練習時，用 CORRECT 記下的錯誤會出現在這裡。", enText(" Mistakes logged with CORRECT (content/library/my-mistakes.csv) appear here.")));
  const list = lib.mistakes.filter(m => m && (m.wrong || m.right));
  if (!list.length) { panel.append(h("p", { class: "muted" }, ...bi("還沒有錯誤紀錄。", "No mistakes logged yet."))); return; }
  const sorted = list.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  panel.append(h("ul", { class: "lib-mis" }, sorted.map(m => {
    const g = m.pattern_id ? resolve(lib.lookup, "grammar", m.pattern_id) : null;
    return h("li", { class: "lib-mis-item" },
      m.date ? h("span", { class: "small muted" }, String(m.date)) : null,
      mistakeBlock(m.wrong, m.right, m.right_zhuyin, m.why_en),
      g ? h("a", { class: "small", href: localHref(g) }, "語法 ", h("span", { lang: "en" }, "Grammar"), " ", g.zh) : m.pattern_id ? h("span", { class: "small muted" }, String(m.pattern_id)) : null);
  })));
}
function mistakeBlock(wrong, right, rightZhuyin, why) {
  return h("div", { class: "lib-mistake" },
    wrong ? h("p", { class: "lib-wrong" }, h("span", { class: "lib-mark", "aria-hidden": "true" }, "✗"), h("span", { class: "sr-only" }, "錯 wrong: "), h("span", { lang: "zh-Hant-TW" }, String(wrong))) : null,
    right ? h("p", { class: "lib-right" }, h("span", { class: "lib-mark", "aria-hidden": "true" }, "✓"), h("span", { class: "sr-only" }, "對 right: "), ruby(String(right), rightZhuyin || "", { cls: "" }),
      " ", sentenceAudio(String(right), null)) : null,
    why ? h("p", { class: "small" }, enText(why)) : null);
}

// ------------------------------------------------------------------ entry view
function leaveEntry() {
  teardown?.();
  teardown = null;
  stopStream();
  stopAudio();
}
function showEntry(type, key, { focus = null } = {}) {
  leaveEntry();
  state.view = "entry";
  els.list.hidden = true;
  els.intro.hidden = true;
  els.entry.hidden = false;
  const box = clear(els.entry);
  const e = resolve(lib.lookup, type, key);
  box.append(h("div", { class: "lib-entry-bar" }, h("button", { type: "button", class: "btn lib-back", onclick: goBack }, "← ", ...bi("返回", "Back"))));
  if (!e) {
    box.append(h("h2", { tabindex: "-1", class: "lib-missing-h" }, ...bi("找不到這個詞條", "Entry not found")),
      notice("可能資料還沒建置，或連結有誤。", `No ${info(normType(type)).one.toLowerCase()} “${key}” in the Library data.`));
    box.querySelector("h2").focus();
    return;
  }
  state.lastKey = statusKey(e);
  document.title = `${e.zh} · 資料庫 Library · 國語自學`;
  renderEntry(box, e);
  const target = focus ? box.querySelector(focus) : box.querySelector(".lib-head");
  (target || box).focus({ preventScroll: !!focus });
  if (!focus) window.scrollTo(0, 0);
}
function goBack() {
  if (state.fromList) history.back();
  else location.hash = "#" + state.tab;
}
const section = (id, zh, en, ...kids) => h("section", { class: "lib-sec", "aria-labelledby": id }, h("h3", { id }, zh, " ", enText(en, { class: "muted" })), ...kids);
function exampleList(e, list) {
  return h("ul", { class: "lib-ex" }, list.map(x => h("li", { class: "lib-ex-item" },
    h("span", { class: "lib-ex-zh" }, ruby(x.zh, x.zhuyin, { cls: "", spoken: x.spoken })),
    h("span", { class: "lib-ex-play" }, sentenceAudio(x.zh, x.audio)),
    x.en ? enText(x.en, { class: "lib-ex-en" }) : null,
    x.from && x.from !== e ? h("a", { class: "lib-ex-from small", href: localHref(x.from) }, info(x.from.type).zh, " ", h("span", { lang: "en" }, info(x.from.type).one), " · ", h("span", { lang: "zh-Hant-TW" }, x.from.zh)) : null)));
}
function renderEntry(box, e) {
  const r = e.raw || {};
  const k = statusKey(e);
  const wordLike = ["word", "measure", "taiwan", "reading"].includes(e.type) || (e.stub && [...e.zh].length <= 4);
  // examples on this entry
  let examples = [];
  if (e.type === "grammar") examples = arr(r.examples).filter(x => x && x.zh).map(x => ({ zh: str(x.zh), zhuyin: str(x.zhuyin), spoken: x.spoken || null, en: str(x.en), audio: x.audio || null }));
  else if (e.type === "pattern") examples = r.zh ? [{ zh: str(r.zh), zhuyin: str(r.zhuyin), spoken: r.spoken || null, en: str(r.en), audio: r.audio || null }] : [];
  else if ((e.type === "measure" || e.type === "taiwan") && r.example_zh) examples = [{ zh: str(r.example_zh), zhuyin: str(r.example_zhuyin), spoken: r.example_spoken || null, en: str(r.example_en), audio: r.example_audio || null }];
  const borrowed = e.type === "word" || (wordLike && !examples.length) ? examplesFor(lib.pool, e) : [];

  // the plate: kind, level seal, the headword with its ruby, pinyin and gloss, audio, status
  const head = h("h2", { class: "lib-head" + (sentenceLike(e) && e.type !== "grammar" ? " sent" : ""), id: "lib-head-id", tabindex: "-1" },
    e.type === "grammar" || (e.type === "pattern" && !e.zhuyin) ? h("span", { lang: "zh-Hant-TW" }, e.zh) : ruby(e.zh, e.zhuyin, { cls: "", spoken: e.spoken }));
  const sub = [];
  if (e.pinyin[0] && e.type === "word") sub.push(h("span", { class: "lib-py", lang: "zh-Latn-pinyin" }, e.pinyin[0]));
  if (e.type !== "pattern" && e.en) sub.push(enText(e.en, { class: "lib-gloss" }));
  const chips = [];
  for (const t of e.topics) chips.push(h("span", { class: "lib-chip", lang: "zh-Hant-TW", title: e.type === "word" ? "TBCL 情境 topic" : "情境 situation" }, t));
  if (e.type === "word") {
    const cls = (Array.isArray(r.cl) ? r.cl : str(r.cl).split(/[,，、;\s]+/)).map(String).filter(Boolean);
    for (const c of cls) {
      const m = resolve(lib.lookup, "measure", c);
      chips.push(m ? h("a", { class: "lib-chip lib-chip-link", href: localHref(m) }, "量詞 ", h("span", { lang: "en" }, "MW"), " ", h("span", { lang: "zh-Hant-TW" }, c))
        : h("span", { class: "lib-chip" }, "量詞 ", h("span", { lang: "en" }, "MW"), " ", h("span", { lang: "zh-Hant-TW" }, c)));
    }
  }
  const audio = wordLike ? wordAudio(e) : e.type === "phrase" ? sentenceAudio(e.zh, r.audio) : null;
  const live = h("p", { class: "sr-only", "aria-live": "polite" });
  const cur = statusOf(e);
  const seg = h("div", { class: "lib-status", role: "group", "aria-label": "狀態 Status" }, STATUSES.map(([id, zh, en]) => h("button", { type: "button", "data-s": id, "aria-pressed": String(cur === id),
    onclick: () => {
      setStatus(e, id);
      for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.s === id));
      live.replaceChildren(`已標記：${zh}`, enText(` Marked ${en.toLowerCase()}`));
    } }, h("span", { class: `lib-st st-${id}`, "aria-hidden": "true" }), h("span", { lang: "zh-Hant-TW" }, zh), " ", h("span", { lang: "en", class: "lib-status-en" }, en))));
  const sandhiShown = [e, ...examples, ...borrowed].some(x => x.spoken && zhuyinKey(x.spoken) !== zhuyinKey(x.zhuyin));
  box.append(h("article", { class: "lib-plate", "aria-labelledby": "lib-head-id" },
    h("div", { class: "lib-plate-top" },
      h("span", { class: "lib-kind" }, info(e.type).zh, " ", h("span", { lang: "en" }, info(e.type).one),
        e.type === "grammar" && r.tbcl != null ? h("span", { class: "muted" }, ` · TBCL #${r.tbcl}`) : null),
      e.level ? h("span", { class: "lib-seal", title: `TBCL ${levelLabel(e.level)}` }, h("span", { class: "lib-seal-k", "aria-hidden": "true" }, "TBCL"),
        h("span", { class: "lib-seal-n", "aria-hidden": "true" }, e.level), h("span", { class: "sr-only" }, `TBCL ${levelLabel(e.level)}`)) : null),
    head,
    sub.length ? h("p", { class: "lib-sub" }, sub.map((x, i) => [i ? h("span", { class: "lib-dot", "aria-hidden": "true" }, " · ") : null, x])) : null,
    chips.length ? h("div", { class: "lib-chips" }, chips) : null,
    h("div", { class: "lib-plate-actions" }, audio ? h("span", { class: "lib-audio" }, audio) : null, seg),
    sandhiShown ? sandhiSwitch(e) : null,
    live,
    e.stub ? h("p", { class: "small muted" }, enText("Only the search index has this entry; its collection file isn't built yet.")) : null));

  // type-specific body
  if (e.type === "grammar") {
    box.append(section("sec-exp", "說明", "Explanation",
      r.structure ? h("p", { class: "lib-structure" }, h("span", { class: "lib-structure-l" }, "結構 ", h("span", { lang: "en" }, "Structure")), h("span", { lang: "zh-Hant-TW" }, str(r.structure))) : null,
      r.explanation_en ? h("p", {}, enText(r.explanation_en)) : null));
    if (examples.length) box.append(section("sec-ex", "例句", "Examples", exampleList(e, examples)));
    const m = r.mistake;
    if (m && (m.wrong || m.right)) {
      const rz = m.right_zhuyin || (examples.find(x => x.zh === m.right) || {}).zhuyin || "";
      box.append(section("sec-mis", "常見錯誤", "Common mistake", mistakeBlock(m.wrong, m.right, rz, m.why_en)));
    }
    if (r.taiwan_note) box.append(section("sec-tw", "臺灣用法", "In Taiwan", h("p", {}, enText(r.taiwan_note))));
  } else if (e.type === "pattern") {
    if (examples.length) box.append(section("sec-ex", "例句", "Example", exampleList(e, examples)));
  } else if (e.type === "measure") {
    if (r.used_for) box.append(section("sec-use", "用於", "Used for", h("p", {}, enText(r.used_for))));
    if (examples.length) box.append(section("sec-ex", "例句", "Example", exampleList(e, examples)));
  } else if (e.type === "taiwan") {
    box.append(section("sec-vs", "臺灣和大陸", "Taiwan and Mainland", h("dl", { class: "kv lib-kv" },
      h("dt", {}, "臺灣 ", h("span", { lang: "en" }, "Taiwan")), h("dd", {}, ruby(e.zh, e.zhuyin, { cls: "", spoken: e.spoken }), " ", h("span", { class: "small muted" }, "學這個 ", h("span", { lang: "en" }, "learn this"))),
      r.mainland ? [h("dt", {}, "大陸 ", h("span", { lang: "en" }, "Mainland")), h("dd", { lang: "zh-Hant-TW" }, str(r.mainland))] : null),
    examples.length ? exampleList(e, examples) : null));
  } else if (e.type === "reading") {
    box.append(section("sec-rd", "讀音", "Readings", h("dl", { class: "kv lib-kv" },
      h("dt", {}, "教育部 ", h("span", { lang: "en" }, "MOE (Taiwan)")), h("dd", { class: "zhuyin", lang: "zh-Hant-TW" }, e.zhuyin),
      r.mainland ? [h("dt", {}, "大陸 ", h("span", { lang: "en" }, "Mainland")), h("dd", { lang: "zh-Latn-pinyin" }, str(r.mainland))] : null),
    r.note ? h("p", { class: "small" }, enText(r.note)) : null,
    h("p", { class: "small" }, h("a", { href: "tones.html#readings" }, "到聲調館練習臺灣讀音 ", h("span", { lang: "en" }, "Practise the Taiwan readings in the Tone Gym"), " →"))));
  } else if (e.type === "phrase" && r.note) {
    box.append(section("sec-note", "說明", "Note", h("p", {}, enText(r.note))));
  }
  if (borrowed.length) {
    box.append(section("sec-borrowed", "例句", "Examples", h("p", { class: "small muted" }, `資料庫裡有「${e.zh}」的句子。`, enText(` Sentences in the Library that contain ${e.zh}.`)), exampleList(e, borrowed)));
  }
  // cross links: a word that is also a Taiwan reading or a Taiwan-usage item
  if (e.type === "word" || e.type === "measure") {
    const links = ["reading", "taiwan"].map(t => resolve(lib.lookup, t, e.zh, e.zh, e.zhuyin)).filter(x => x && x.zh === e.zh);
    if (links.length) box.append(h("p", { class: "lib-cross small" }, links.map((x, i) => [i ? " · " : null,
      h("a", { href: localHref(x) }, info(x.type).zh, " ", h("span", { lang: "en" }, info(x.type).one), " →")])));
  }

  // my note
  const ta = h("textarea", { id: "lib-note", class: "lib-note", rows: "3", "aria-labelledby": "sec-note-h",
    placeholder: "在哪裡聽到、怎麼記… Where you heard it, a memory hook…" });
  ta.value = notesMap()[k] || "";
  const saved = h("span", { class: "small muted lib-saved", "aria-live": "polite" });
  let timer = 0;
  const save = () => { clearTimeout(timer); timer = 0; saveNote(k, ta.value); saved.replaceChildren("已儲存 ", h("span", { lang: "en" }, "Saved")); };
  ta.addEventListener("input", () => { clearTimeout(timer); saved.replaceChildren(); timer = setTimeout(save, 600); });
  ta.addEventListener("blur", () => { if (timer) save(); });
  teardown = () => { if (timer) save(); };
  box.append(section("sec-note-h", "我的筆記", "My note", ta, h("div", { class: "row lib-note-row" }, saved, h("span", { class: "small muted" }, "只存在這台裝置 ", h("span", { lang: "en" }, "Stays on this device")))));

  // say it: the model, then my take (kept in IndexedDB on this device)
  const model = wordLike ? wordAudio(e) : e.type === "phrase" ? sentenceAudio(e.zh, r.audio) : examples[0] ? sentenceAudio(examples[0].zh, examples[0].audio) : null;
  const sayWhat = !wordLike && e.type !== "phrase" && examples[0] ? h("p", { class: "lib-say-what" }, ruby(examples[0].zh, examples[0].zhuyin, { cls: "", spoken: examples[0].spoken })) : null;
  box.append(section("sec-say", "說說看", "Say it",
    h("p", { class: "small muted" }, "先聽示範，再錄自己的聲音比一比。", enText(" Hear the model, then record yourself and compare.")),
    sayWhat,
    h("div", { class: "row lib-say" }, model ? h("span", { class: "lib-say-model" }, model) : null, recordWidget({ key: `lib:${k}`, label: "● 錄音 Record" }))));

  // units it appears in (M5 hook: docs/data/units-index.json, when it exists)
  const units = h("div");
  box.append(units);
  loadJSON("units-index").then(idx => {
    const hits = unitsFor(idx, e);
    if (!hits.length || !units.isConnected) return;
    units.append(section("sec-units", "出現在", "Units it appears in", h("ul", { class: "lib-units" },
      hits.map(u => h("li", {}, h("a", { href: `units.html#${encodeURIComponent(u.id || u.title)}` }, h("span", { lang: "zh-Hant-TW" }, u.title || u.id)))))));
  }).catch(() => {});

  // dictionaries (word-like entries)
  if (wordLike) {
    const w = encodeURIComponent(e.zh);
    const ext = (href, zh, en) => h("a", { href, target: "_blank", rel: "noopener" }, zh, " ", h("span", { lang: "en", class: "muted" }, en), h("span", { class: "sr-only" }, " (opens in a new tab)"), h("span", { "aria-hidden": "true" }, " ↗"));
    const chars = [...new Set([...e.zh].filter(c => HAN.test(c)))];
    box.append(section("sec-dict", "查字典", "Dictionaries", h("ul", { class: "lib-links" },
      h("li", {}, ext(`https://dict.concised.moe.edu.tw/search.jsp?md=1&word=${w}`, "教育部《國語辭典簡編本》", "MOE Concise Dictionary")),
      h("li", {}, ext(`https://dict.revised.moe.edu.tw/search.jsp?md=1&word=${w}`, "教育部《重編國語辭典修訂本》", "MOE Revised Dictionary")),
      h("li", {}, ext(`https://www.moedict.tw/${w}`, "萌典", "moedict")),
      chars.length && chars.length <= 4 ? h("li", {}, "筆順 ", h("span", { lang: "en", class: "muted" }, "Stroke order"), " ",
        chars.map((c, i) => [i ? " · " : null, h("a", { href: `https://stroke-order.learningweb.moe.edu.tw/searchW.jsp?WORD=${encodeURIComponent(c)}`, target: "_blank", rel: "noopener", class: "lib-stroke",
          "aria-label": `${c} 筆順 stroke order (MOE, opens in a new tab)` }, h("span", { lang: "zh-Hant-TW" }, c), h("span", { "aria-hidden": "true" }, " ↗"))])) : null)));
  }
}
// "Show sandhi" (§5 display toggle, as on the Tone Gym): spoken tones over the written ones in every ruby.
function sandhiSwitch(e) {
  const on = !!settings().sandhi;
  return h("button", { type: "button", role: "switch", class: "lib-switch", "aria-checked": String(on), onclick: () => {
    setSetting("sandhi", !on);
    showEntry(e.type, e.key, { focus: ".lib-switch" });
  } }, h("span", { class: "lib-switch-track", "aria-hidden": "true" }, h("span", { class: "lib-switch-knob" })), h("span", {}, "顯示變調 ", h("span", { lang: "en" }, "Show sandhi")));
}

if (app) boot().catch(err => { console.error(err); app.append(h("p", { class: "feedback bad" }, "載入失敗 Could not load the Library: ", err.message)); });
