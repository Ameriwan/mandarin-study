// 設定 Settings and Credits (MASTER_PROMPT §5.9, §7.5; M6 design "Settings and Credits"): display switches, audio
// (voice for the browser-voice fallback, default speed, a 3-second mic test with level and a live pitch line), study
// time, the learner's data (export / import / reset) and the Credits & licenses page with the MOE 使用說明.
//
// Settings live in app.js `settings()` (localStorage "gy.settings"): ruby "always"|"new"|"off", pinyin, english,
// sandhi, toneColours, immersion (bool), voice (a speechSynthesis voice name, "" = automatic), speed (0.75|0.9|1),
// dailyMinutes, studyDays (1-7). The goal date is the Plan page's own key "gy.plan.goal" {date, band}. This page only
// writes a key when the learner changes it; app.js applies the settings on every page.
//
// Backups (§10 item 8: export -> reset -> import gives back identical progress). Two JSON files:
//   progress   {app: "guoyu", kind: "progress", version: 1, exported: ISO time,
//               localStorage: {"gy.<key>": raw stored string, ...}       every "gy." key, byte for byte
//               recordings: [{store, key, ts, bytes}]}                    what IndexedDB holds (list only)
//   recordings {app: "guoyu", kind: "recordings", version: 1, exported,
//               recordings: [{store, key, value}]}                         every record of every object store of the
//               "guoyu" database (app.js: store "rec", keyPath "key", {key, blob, ts, ...meta}); inside `value` a Blob
//               is {$blob: base64, type}, an ArrayBuffer {$bytes}, a typed array {$typed: "Float32Array", $bytes},
//               a Date {$date}; everything else is plain JSON.
// Import: merge (the file's items are written, same names take the file's version, everything else here stays) or
// replace (the imported parts become exactly the file's: extra items here are removed), always after a preview.
// Reset: removes every "gy." key and, if ticked, every recording; typed confirmation.
// The data functions take {ls, idb} (default: the page's localStorage and indexedDB) so they run in Node tests.
import { h, $, clear, mountShell, store, settings, setSetting, enText, bi, toast, ruby, today, audioContext, Recorder,
  canRecord, playFile, stopAudio, loadJSON } from "./app.js";
import * as App from "./app.js";
import { LivePitch } from "./pitch.js";

// ------------------------------------------------------------------ constants
export const FORMAT_VERSION = 1;
export const LS_PREFIX = "gy.";
const DB_NAME = "guoyu", REC_STORE = "rec"; // app.js db()
const MOE_LICENSE_TXT = "data/moe-license-concised.txt";
const MOE_LICENSE_PDF = "https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/conciseddict_10312.pdf";
// sample sentence for the preview, the voice test and the mic test (verify.check ok); spoken = 3+3 sandhi on 水果 (§6.4)
const SAMPLE = { zh: "我們去水果攤吧。", zhuyin: "ㄨㄛˇ ˙ㄇㄣ ㄑㄩˋ ㄕㄨㄟˇ ㄍㄨㄛˇ ㄊㄢ ˙ㄅㄚ", spoken: "ㄨㄛˇ ˙ㄇㄣ ㄑㄩˋ ㄕㄨㄟˊ ㄍㄨㄛˇ ㄊㄢ ˙ㄅㄚ",
  en: "Let's go to the fruit stand." };
const DEFAULTS = { immersion: false, voice: "", studyDays: 6 }; // the rest: app.js settings()
const S = () => ({ ...DEFAULTS, ...settings() });
const SPEEDS = [0.75, 0.9, 1];
const BANDS = [["A1", "A1"], ["A2", "Band A 基礎級 · A2"], ["B1", "Band B 進階級 · B1"], ["B2", "Band B 高階級 · B2"]]; // plan.js BANDS
const TW_VOICE = /^(zh[-_](TW|Hant)|cmn[-_]TW)/i; // app.js pickVoice

// ------------------------------------------------------------------ credits (content/sources.md, §7.5, M6 design)
const L = {
  byNd: ["CC BY-ND 3.0 TW", "https://creativecommons.org/licenses/by-nd/3.0/tw/"],
  by4: ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
  bySa4: ["CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"],
  cc0: ["CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"],
  arr: ["All rights reserved", null],
  mit: ["MIT", "https://opensource.org/license/mit"],
  ofl: ["SIL OFL 1.1", "https://openfontlicense.org/"],
  lgpl3: ["LGPL-3.0", "https://www.gnu.org/licenses/lgpl-3.0.html"],
  isc: ["ISC", "https://opensource.org/license/isc-license-txt"],
  bsd2: ["BSD-2-Clause", "https://opensource.org/license/bsd-2-clause"],
};
export const CONCISED_VERSION = "2014_20260929"; // from dict_concised_2014_20260929 (tools/entries.py version_of)
const moeAttr = (book, version, url) => `中華民國教育部（Ministry of Education, R.O.C.）。《${book}》（版本編號：${version}）網址：${url}`;
// Data and audio sources: every row of content/sources.md plus the MOE 成語典 (M6). published: what of it the site serves.
export const CREDITS = [
  { id: "moe-concised", zh: "教育部《國語辭典簡編本》", en: "MOE Concised Mandarin Dictionary: text and announcer audio",
    licenses: [L.byNd], url: "https://dict.concised.moe.edu.tw/",
    attribution: moeAttr("國語辭典簡編本", CONCISED_VERSION, "http://dict.concised.moe.edu.tw/"),
    useZh: "讀音、詞條文字（跟讀頁）和真人發音。音檔整個提供、播放時只選取片段，從不剪輯；文字只做格式轉換，不改內容。完整的使用說明在下面。",
    useEn: "Readings, entry texts (Shadowing page) and the human-voice recordings. Audio files are shipped whole and played as spans, never trimmed; text is format-converted only, never edited. The full terms of use are below." },
  { id: "moe-revised", zh: "教育部《重編國語辭典修訂本》", en: "MOE Revised Mandarin Dictionary",
    licenses: [L.byNd], url: "https://dict.revised.moe.edu.tw/",
    attribution: moeAttr("重編國語辭典修訂本", "2015_20260929", "https://dict.revised.moe.edu.tw/"),
    useZh: "只在建置時用來檢查注音（包括又音、語音、讀音）；網站不轉載它的內容。",
    useEn: "Used only by the build to check every Zhuyin reading (including 又音 / 語音 / 讀音); none of its content is published." },
  { id: "moe-idioms", zh: "教育部《成語典》", en: "MOE Dictionary of Chinese Idioms",
    licenses: [L.byNd], url: "https://dict.idioms.moe.edu.tw/",
    attribution: moeAttr("成語典", "2020_20260929", "https://dict.idioms.moe.edu.tw/"),
    useZh: "進階頁的成語典故和用法，照原文顯示，不改寫。", useEn: "Idiom stories and usage on the Advanced page, shown exactly as MOE wrote them." },
  { id: "moe-juyin", zh: "教育部《國語注音符號手冊》（2017）", en: "MOE Mandarin Phonetic Symbols Handbook (2017)",
    licenses: [["音檔、SVG、XML：CC BY 4.0", L.by4[1]], ["文字：CC BY-ND 3.0 TW", L.byNd[1]]],
    url: "https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/index.html",
    attribution: "中華民國教育部（Ministry of Education, R.O.C.）。《國語注音符號手冊》，CC BY 4.0",
    useZh: "注音實驗室的 37 個符號錄音。", useEn: "The 37 symbol recordings in the Zhuyin Lab." },
  { id: "moedict", zh: "萌典 moedict（g0v）", en: "moedict data conversion and audio mirror",
    licenses: [["程式 code: CC0", L.cc0[1]], ["教育部資料與音檔 MOE data and audio: CC BY-ND 3.0 TW", L.byNd[1]]],
    url: "https://github.com/g0v/moedict-data",
    useZh: "簡編本的音檔編號對照（g0v 轉換），音檔從萌典的 CDN 取得或串流。", useEn: "The 簡編本 audio-id map (converted by g0v); clips are fetched or streamed from the moedict CDN." },
  { id: "tbcl", zh: "國家教育研究院《臺灣華語文能力基準》（TBCL）", en: "NAER Taiwan Benchmarks for the Chinese Language",
    licenses: [L.arr], url: "https://coct.naer.edu.tw/",
    attribution: "國家教育研究院（NAER）《臺灣華語文能力基準》",
    useZh: "詞語、漢字和語法點的等級與注音欄。著作權保留（NAER 開放資料宣告允許註明出處後使用）；網站只發布需要的欄位。",
    useEn: "Levels and the Zhuyin column of the word, character and grammar lists. All rights reserved (NAER's open-data declaration allows reuse with credit); the site publishes only the fields it needs." },
  { id: "tocfl", zh: "國家華語測驗推動工作委員會《華語八千詞》", en: "SC-TOP TOCFL 8000 word list",
    licenses: [L.arr], url: "https://tocfl.edu.tw/",
    useZh: "只在建置時交叉檢查，不發布。", useEn: "Optional cross-check at build time only; not published." },
  { id: "cedict", zh: "CC-CEDICT（MDBG）", en: "CC-CEDICT English glosses",
    licenses: [L.bySa4], url: "https://www.mdbg.net/chinese/dictionary?page=cc-cedict",
    attribution: "English glosses from CC-CEDICT (MDBG), CC BY-SA 4.0",
    useZh: "資料庫的英文解釋；data/library-words.json 因此也以 CC BY-SA 4.0 分享。大陸讀音只拿來比較，從不當注音來源。",
    useEn: "English glosses in the Library, so data/library-words.json is shared under CC BY-SA 4.0 too. Its Mainland readings are used for comparison only, never as a Zhuyin source." },
];
// Software and fonts. where: "site" (runs in the page), "build" (used to make files, not shipped).
export const SOFTWARE = [
  { name: "pitchy 4.1.0", license: L.mit, url: "https://github.com/ianprime0509/pitchy", where: "site", zh: "即時音高", en: "live pitch" },
  { name: "fft.js 4.0.4", license: L.mit, url: "https://github.com/indutny/fft.js", where: "site", zh: "pitchy 用的 FFT", en: "FFT used by pitchy" },
  { name: "Noto Sans TC", license: L.ofl, url: "https://fonts.google.com/noto/specimen/Noto+Sans+TC", where: "site", zh: "字型（Google Fonts）", en: "font, via Google Fonts" },
  { name: "gTTS 2.5.4", license: L.mit, url: "https://github.com/pndurette/gTTS", where: "build", zh: "產生標示為 TTS 的句子音檔", en: "makes the sentence files labelled TTS" },
  { name: "edge-tts", license: L.lgpl3, url: "https://github.com/rany2/edge-tts", where: "build", zh: "測試過；輸出不發布", en: "tested; its output is not published" },
  { name: "librosa", license: L.isc, url: "https://librosa.org/", where: "build", zh: "示範音高曲線", en: "model pitch contours" },
  { name: "imageio-ffmpeg", license: L.bsd2, url: "https://github.com/imageio/imageio-ffmpeg", where: "build", zh: "ogg → mp3 格式轉換", en: "ogg → mp3 format conversion" },
  { name: "moedict code", license: L.cc0, url: "https://github.com/g0v/moedict-data", where: "build", zh: "萌典程式", en: "moedict tools" },
];

// ------------------------------------------------------------------ backup: encoding
const TYPED = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array };
const isBlob = v => typeof Blob !== "undefined" && v instanceof Blob;
export function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const blobBytes = async b => new Uint8Array(b.arrayBuffer ? await b.arrayBuffer() : await new Response(b).arrayBuffer());
// An IndexedDB value -> plain JSON (async: blobs are read).
export async function encodeValue(v) {
  if (isBlob(v)) return { $blob: toB64(await blobBytes(v)), type: v.type || "" };
  if (v instanceof ArrayBuffer) return { $bytes: toB64(new Uint8Array(v)) };
  if (ArrayBuffer.isView(v)) return { $typed: v.constructor.name, $bytes: toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  if (v instanceof Date) return { $date: v.toISOString() };
  if (Array.isArray(v)) return Promise.all(v.map(encodeValue));
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = await encodeValue(x);
    return o;
  }
  return v;
}
export function decodeValue(v) {
  if (Array.isArray(v)) return v.map(decodeValue);
  if (v && typeof v === "object") {
    if (typeof v.$blob === "string") return new Blob([fromB64(v.$blob)], { type: v.type || "" });
    if (typeof v.$bytes === "string") {
      const b = fromB64(v.$bytes);
      if (!v.$typed) return b.buffer;
      const C = TYPED[v.$typed];
      return C ? new C(b.buffer, 0, b.byteLength / C.BYTES_PER_ELEMENT) : b;
    }
    if (typeof v.$date === "string") return new Date(v.$date);
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = decodeValue(x);
    return o;
  }
  return v;
}
// A cheap fingerprint that is the same for a stored value and its encoded form when they match (blobs by type and size).
function fp(v) {
  const walk = x => {
    if (isBlob(x)) return ["blob", x.type || "", x.size];
    if (x instanceof ArrayBuffer) return ["bytes", x.byteLength];
    if (ArrayBuffer.isView(x)) return ["typed", x.constructor.name, x.byteLength];
    if (x instanceof Date) return ["date", x.toISOString()];
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      if (typeof x.$blob === "string") return ["blob", x.type || "", b64Size(x.$blob)];
      if (typeof x.$bytes === "string") return x.$typed ? ["typed", x.$typed, b64Size(x.$bytes)] : ["bytes", b64Size(x.$bytes)];
      if (typeof x.$date === "string") return ["date", x.$date];
      return Object.keys(x).sort().map(k => [k, walk(x[k])]);
    }
    return x;
  };
  return JSON.stringify(walk(v));
}
const b64Size = s => Math.floor((s.length * 3) / 4) - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0);
const valueBytes = v => isBlob(v) ? v.size : v && typeof v === "object" && !ArrayBuffer.isView(v) ? Object.values(v).reduce((s, x) => s + (isBlob(x) ? x.size : 0), 0) : 0;
const recId = (store, key) => `${store}\u0000${JSON.stringify(key)}`;

// ------------------------------------------------------------------ backup: storage access
const lsOf = ls => ls ?? globalThis.localStorage;
// every "gy." key with its raw stored string, sorted by key
export function snapshotLocal(ls) {
  const out = {};
  try {
    const s = lsOf(ls);
    if (!s) return out;
    const keys = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k != null && k.startsWith(LS_PREFIX)) keys.push(k); }
    for (const k of keys.sort()) { const v = s.getItem(k); if (v != null) out[k] = v; }
  } catch (err) { console.warn("localStorage not readable:", err); } // private mode, blocked storage
  return out;
}
// Opened without a version: whatever version app.js made; a database that does not exist yet is created exactly as
// app.js creates it (version 1, store "rec" with keyPath "key"). Closed after every use, so it never blocks an upgrade.
function openDb(idb) {
  const f = idb ?? globalThis.indexedDB;
  return new Promise((resolve, reject) => {
    if (!f) { reject(new Error("IndexedDB 不能用 IndexedDB is not available")); return; }
    const req = f.open(DB_NAME);
    req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(REC_STORE)) d.createObjectStore(REC_STORE, { keyPath: "key" }); };
    req.onsuccess = () => { const d = req.result; d.onversionchange = () => d.close(); resolve(d); };
    req.onerror = () => reject(req.error);
  });
}
const reqP = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const txDone = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error("transaction aborted")); });
// [{store, key, value}] for every record of every store, store by store in key order
export async function readDb(idb) {
  const d = await openDb(idb);
  try {
    const names = [...d.objectStoreNames];
    if (!names.length) return [];
    const tx = d.transaction(names, "readonly");
    const per = await Promise.all(names.map(async name => {
      const st = tx.objectStore(name);
      const [keys, values] = await Promise.all([reqP(st.getAllKeys()), reqP(st.getAll())]);
      return keys.map((key, i) => ({ store: name, key, value: values[i] }));
    }));
    return per.flat();
  } finally { d.close(); }
}
// clear: true (every store) or [store names]; puts: [{store, key, value}] with decoded values. Records for a store
// this database does not have are skipped (returned).
async function writeDb(idb, { clear: clr = [], puts = [] } = {}) {
  const d = await openDb(idb);
  try {
    const names = [...d.objectStoreNames];
    const clearList = clr === true ? names : clr.filter(n => names.includes(n));
    const ok = puts.filter(p => names.includes(p.store)), skipped = puts.filter(p => !names.includes(p.store));
    const touched = [...new Set([...clearList, ...ok.map(p => p.store)])];
    if (touched.length) {
      const tx = d.transaction(touched, "readwrite");
      const done = txDone(tx);
      for (const n of clearList) tx.objectStore(n).clear();
      for (const p of ok) { const st = tx.objectStore(p.store); if (st.keyPath != null) st.put(p.value); else st.put(p.value, p.key); }
      await done;
    }
    return skipped;
  } finally { d.close(); }
}

// ------------------------------------------------------------------ backup: export / parse / preview / apply / reset
const head = (kind, now) => ({ app: "guoyu", kind, version: FORMAT_VERSION, exported: (now || new Date()).toISOString() });
export async function exportProgress({ ls, idb, now } = {}) {
  let recs = [];
  try { recs = await readDb(idb); } catch (err) { console.warn("recordings not listed:", err); }
  return { ...head("progress", now), localStorage: snapshotLocal(ls),
    recordings: recs.map(r => ({ store: r.store, key: r.key, ts: r.value && typeof r.value.ts === "number" ? r.value.ts : null, bytes: valueBytes(r.value) })) };
}
export async function exportRecordings({ idb, now } = {}) {
  const recs = await readDb(idb);
  const out = [];
  for (const r of recs) out.push({ store: r.store, key: r.key, value: await encodeValue(r.value) });
  return { ...head("recordings", now), recordings: out };
}
const validKey = k => typeof k === "string" || (typeof k === "number" && Number.isFinite(k)) || (Array.isArray(k) && k.every(validKey));
// One backup file's text -> {kind, name, exported, local | recs, listed, skipped}; throws a bilingual Error.
export function parseBackup(text, name = "") {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error("不是 JSON 檔 Not a JSON file"); }
  if (!o || typeof o !== "object" || o.app !== "guoyu" || !["progress", "recordings"].includes(o.kind)) throw new Error("不是這個 App 的備份 Not a backup from this app");
  if (typeof o.version !== "number" || o.version < 1) throw new Error("備份格式看不懂 Unknown backup format");
  if (o.version > FORMAT_VERSION) throw new Error("這個備份來自較新的版本，請先更新 App This backup is from a newer version: update the app first");
  const res = { kind: o.kind, name, exported: typeof o.exported === "string" ? o.exported : null, skipped: 0 };
  if (o.kind === "progress") {
    if (!o.localStorage || typeof o.localStorage !== "object" || Array.isArray(o.localStorage)) throw new Error("進度檔沒有資料 The progress file has no data");
    res.local = {};
    for (const [k, v] of Object.entries(o.localStorage)) {
      if (k.startsWith(LS_PREFIX) && typeof v === "string") res.local[k] = v; else res.skipped++;
    }
    res.listed = (Array.isArray(o.recordings) ? o.recordings : []).filter(r => r && typeof r.store === "string" && validKey(r.key));
  } else {
    if (!Array.isArray(o.recordings)) throw new Error("錄音檔沒有資料 The recordings file has no data");
    res.recs = [];
    for (const r of o.recordings) {
      if (r && typeof r.store === "string" && validKey(r.key) && r.value !== undefined) res.recs.push({ store: r.store, key: r.key, value: r.value });
      else res.skipped++;
    }
  }
  return res;
}
function pickFiles(files) {
  const prog = files.filter(f => f.kind === "progress"), recs = files.filter(f => f.kind === "recordings");
  if (prog.length > 1 || recs.length > 1) throw new Error("一次只能匯入一個進度檔和一個錄音檔 Import at most one progress file and one recordings file at a time");
  return { prog: prog[0] || null, recf: recs[0] || null };
}
const count = rows => rows.reduce((c, r) => ((c[r.status] = (c[r.status] || 0) + 1), c), {});
// What an import would do. local / recs: {rows: [{key | store+key, status}], counts}; status new|changed|same|removed|
// skipped (a store this database does not have). missing: recordings the progress file lists that are not here
// (only when no recordings file comes with it).
export async function previewImport(files, mode = "merge", { ls, idb } = {}) {
  const { prog, recf } = pickFiles(files);
  const out = { mode, local: null, recs: null, missing: 0 };
  if (prog) {
    const here = snapshotLocal(ls);
    const rows = Object.entries(prog.local).map(([key, v]) => ({ key, status: !(key in here) ? "new" : here[key] === v ? "same" : "changed" }));
    if (mode === "replace") for (const key of Object.keys(here)) if (!(key in prog.local)) rows.push({ key, status: "removed" });
    out.local = { rows, counts: count(rows) };
  }
  if (recf || (prog && prog.listed.length)) {
    let here = [], stores = null;
    try { here = await readDb(idb); stores = new Set((await storeNames(idb))); } catch (err) { console.warn(err); }
    const byId = new Map(here.map(r => [recId(r.store, r.key), r]));
    if (recf) {
      const ids = new Set();
      const rows = recf.recs.map(r => {
        const id = recId(r.store, r.key), cur = byId.get(id);
        ids.add(id);
        const status = stores && !stores.has(r.store) ? "skipped" : !cur ? "new" : fp(cur.value) === fp(r.value) ? "same" : "changed";
        return { store: r.store, key: r.key, status };
      });
      if (mode === "replace") for (const r of here) if (!ids.has(recId(r.store, r.key))) rows.push({ store: r.store, key: r.key, status: "removed" });
      out.recs = { rows, counts: count(rows) };
    } else out.missing = prog.listed.filter(r => !byId.has(recId(r.store, r.key))).length;
  }
  return out;
}
async function storeNames(idb) { const d = await openDb(idb); try { return [...d.objectStoreNames]; } finally { d.close(); } }
// Apply an import. Returns {local: n written, removed, recs: n written, skipped}.
export async function applyImport(files, mode = "merge", { ls, idb } = {}) {
  const { prog, recf } = pickFiles(files);
  const res = { local: 0, removed: 0, recs: 0, skipped: 0 };
  if (recf) {
    const puts = recf.recs.map(r => ({ store: r.store, key: r.key, value: decodeValue(r.value) })); // decoded before the transaction
    const skipped = await writeDb(idb, { clear: mode === "replace" ? true : [], puts });
    res.recs = puts.length - skipped.length; res.skipped = skipped.length;
  }
  if (prog) {
    const s = lsOf(ls);
    if (mode === "replace") for (const k of Object.keys(snapshotLocal(s))) if (!(k in prog.local)) { s.removeItem(k); res.removed++; }
    for (const [k, v] of Object.entries(prog.local)) { s.setItem(k, v); res.local++; } // throws on a full quota: reported by the caller
  }
  return res;
}
export async function resetData({ ls, idb, recordings = false } = {}) {
  const s = lsOf(ls);
  const keys = Object.keys(snapshotLocal(s));
  for (const k of keys) s.removeItem(k);
  if (recordings) await writeDb(idb, { clear: true });
  return keys.length;
}

// ------------------------------------------------------------------ page
const app = typeof document !== "undefined" ? document.querySelector('main#app[data-page="settings"]') : null;
// boot() runs at the end of the module, once every const below exists

function boot() {
  mountShell("settings");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  applyImmersion();
  clear(app);
  app.append(h("div", { class: "page-head" }, h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "設定"), h("span", { class: "en", lang: "en" }, "Settings")),
    h("p", { class: "muted small", style: "margin:0" }, ...bi("顯示、聲音、學習時間、你的資料，還有資料來源與授權。改了馬上存在這個裝置上。",
      "Display, audio, study time, your data, and the sources and licenses. Changes are saved on this device at once."))));
  const TABS = [["settings", "設定", "Settings"], ["credits", "來源與授權", "Credits & licenses"]];
  const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "設定 Settings" });
  const panel = h("section", { role: "tabpanel", id: "st-panel", class: "st-panel", tabindex: "-1" });
  const show = id => {
    for (const b of tabs.children) { const on = b.dataset.id === id; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; }
    panel.setAttribute("aria-labelledby", `tab-${id}`);
    stopAudio();
    clear(panel);
    history.replaceState(null, "", "#" + id);
    (id === "credits" ? renderCredits : renderSettings)(panel);
  };
  for (const [id, zh, en] of TABS) tabs.append(h("button", { type: "button", role: "tab", id: `tab-${id}`, "aria-controls": "st-panel", "data-id": id,
    "aria-selected": "false", tabindex: "-1", onclick: () => show(id) }, zh, " ", h("span", { class: "muted small", lang: "en" }, en)));
  tabs.addEventListener("keydown", e => {
    const list = [...tabs.children], i = list.indexOf(e.target);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (i < 0 || j === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const b = list[(j + list.length) % list.length];
    b.focus(); b.click();
  });
  app.append(tabs, panel);
  show(location.hash === "#credits" ? "credits" : "settings");
  window.addEventListener("hashchange", () => { if (location.hash === "#credits" || location.hash === "#settings") show(location.hash.slice(1)); });
  window.addEventListener("pagehide", () => stopAudio());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") stopAudio(); });
}
function applyImmersion() { document.documentElement.classList.toggle("immersion", !!S().immersion); }

const section = (id, zh, en, ...kids) => h("section", { class: "st-section", "aria-labelledby": id },
  h("h2", { id }, zh, " ", h("span", { lang: "en" }, en)), ...kids);
const hint = (id, zh, en) => h("p", { id, class: "st-hint muted small" }, ...bi(zh, en));

function renderSettings(panel) {
  panel.append(
    section("st-display-h", "顯示", "Display", displayCard()),
    section("st-audio-h", "聲音", "Audio", audioCard()),
    section("st-study-h", "學習時間", "Study time", studyCard()),
    section("st-data-h", "你的資料", "Your data", dataCard(panel)));
}
const rerender = panel => { applyImmersion(); clear(panel); renderSettings(panel); };

// ---------- display
function levelNow() {
  try {
    if (typeof App.levelState === "function") {
      const s = App.levelState();
      const n = s && (typeof s.level === "number" ? s.level : parseInt(s.level, 10));
      if (n) return n;
    }
  } catch (err) { console.error(err); }
  const raw = store.get("level", null), p = store.get("plan.placement", null);
  return typeof raw === "number" ? raw : p && typeof p.level === "number" ? p.level : null;
}
function seg(labelId, options, current, onpick) {
  const g = h("div", { class: "seg st-seg", role: "group", "aria-labelledby": labelId });
  for (const [value, kids] of options) g.append(h("button", { type: "button", "aria-pressed": String(value === current), onclick: () => {
    for (const b of g.children) b.setAttribute("aria-pressed", String(b === btnOf(value)));
    onpick(value);
  } }, kids));
  const btnOf = v => g.children[options.findIndex(o => o[0] === v)];
  return g;
}
function toggle(key, zh, en, hintZh, hintEn, after) {
  const id = `st-${key}`, hid = `${id}-hint`;
  const input = h("input", { type: "checkbox", role: "switch", id, class: "st-switch", checked: !!S()[key], "aria-describedby": hintZh ? hid : null,
    onchange: () => { setSetting(key, input.checked); after && after(input.checked); } });
  return h("div", { class: "st-row" },
    h("div", { class: "st-row-text" }, h("label", { for: id, class: "st-name" }, ...bi(zh, en)), hintZh ? hint(hid, hintZh, hintEn) : null),
    input);
}
function displayCard() {
  const s = S();
  const preview = h("div", { class: "st-preview", "aria-live": "polite" });
  const drawPreview = () => {
    const c = S();
    const zh = c.ruby === "off" ? h("span", { class: "zh", lang: "zh-Hant-TW" }, SAMPLE.zh) : ruby(SAMPLE.zh, SAMPLE.zhuyin, { spoken: SAMPLE.spoken, sandhi: !!c.sandhi });
    preview.replaceChildren(...[h("p", { class: "st-preview-l small muted" }, ...bi("預覽", "Preview")), h("p", { class: "st-preview-zh" }, zh),
      c.english ? h("p", { class: "st-preview-en small", lang: "en" }, SAMPLE.en) : null,
      c.ruby === "new" ? h("p", { class: "small muted" }, ...bi("「只在新詞」：資料庫裡標成「認識」的詞不顯示注音；這句當作全是新詞。", "New words only: words marked known in the Library lose their Zhuyin; here every word counts as new.")) : null].filter(Boolean));
  };
  const lv = levelNow();
  const suggest = lv && lv >= 4 && !s.immersion
    ? h("p", { class: "st-suggest small" }, "✦ ", ...bi("你已經到 Band B 了：試試全中文介面吧。", "You've reached Band B: try the Chinese-only interface.")) : null;
  const card = h("div", { class: "card st-card" },
    h("div", { class: "st-row st-row-wide" },
      h("div", { class: "st-row-text" }, h("p", { id: "st-ruby-l", class: "st-name" }, ...bi("注音", "Zhuyin")),
        hint("st-ruby-hint", "注音在字的上面。「只在新詞」會拿掉資料庫裡標成「認識」的詞的注音。", "Zhuyin over the characters. “New words only” drops it on words you marked known in the Library.")),
      seg("st-ruby-l", [["always", bi("一直顯示", "Always")], ["new", bi("只在新詞", "New words only")], ["off", bi("關", "Off")]], s.ruby,
        v => { setSetting("ruby", v); drawPreview(); })),
    toggle("pinyin", "拼音", "Pinyin", "注音優先；拼音預設關閉。", "Zhuyin comes first; pinyin is off by default."),
    toggle("english", "英文翻譯", "English", "例句和對話的英文翻譯。", "English translations of examples and dialogues.", drawPreview),
    toggle("sandhi", "顯示變調", "Show tone sandhi", "在注音上標出實際說的聲調（例如 3+3 → 2+3）；寫的仍是本調。", "Shows the tone you actually say (e.g. 3+3 → 2+3); the written base tone stays in the tooltip.", drawPreview),
    toggle("toneColours", "聲調顏色", "Tone colours", "預設關閉。", "Off by default."),
    toggle("immersion", "全中文介面", "Immersion", "介面只顯示中文；學習內容的英文翻譯照上面的「英文翻譯」設定。", "The interface shows Chinese only; English translations in lessons follow the English switch above.",
      on => { applyImmersion(); if (suggest) suggest.hidden = on; }),
    suggest, preview);
  drawPreview();
  return card;
}

// ---------- audio
const twVoices = () => {
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices().filter(v => TW_VOICE.test(v.lang) || /zh-TW|臺灣|台灣|Taiwan/i.test(v.name + v.lang));
};
function audioCard() {
  const s = S();
  const sel = h("select", { id: "st-voice", class: "st-input", "aria-describedby": "st-voice-hint", onchange: () => setSetting("voice", sel.value) });
  const none = h("p", { class: "small st-warn", hidden: true }, ...bi("這個瀏覽器沒有臺灣華語的語音。網站上的 TTS 句子音檔還是可以播放。",
    "This browser has no Taiwan Mandarin voice. The site's TTS sentence files still play."));
  const fill = () => {
    const cur = S().voice || "", vs = twVoices();
    sel.replaceChildren(h("option", { value: "" }, "自動（最好的可用語音） Automatic"),
      ...vs.map(v => h("option", { value: v.name, selected: v.name === cur }, `${v.name} · ${v.lang}${v.localService === false ? " · online" : ""}`)));
    if (cur && !vs.some(v => v.name === cur)) sel.append(h("option", { value: cur, selected: true }, `${cur}（這個裝置沒有 not on this device）`));
    sel.value = cur;
    none.hidden = vs.length > 0;
  };
  fill();
  if (typeof speechSynthesis !== "undefined" && speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", fill);
  const tryBtn = h("button", { type: "button", class: "btn", "aria-label": `試聽 Try the voice: ${SAMPLE.zh} — 瀏覽器語音 Browser voice (TTS)`, disabled: typeof speechSynthesis === "undefined",
    onclick: () => {
      stopAudio();
      const u = new SpeechSynthesisUtterance(SAMPLE.zh);
      u.lang = "zh-TW"; u.rate = (S().speed || 1) * 0.9; // app.js plays the browser voice at 0.9 × the speed
      const v = twVoices().find(x => x.name === sel.value);
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } }, "▶ ", ...bi("試聽", "Try"));
  return h("div", { class: "card st-card" },
    h("div", { class: "st-row st-row-wide" },
      h("div", { class: "st-row-text" }, h("label", { for: "st-voice", class: "st-name" }, ...bi("瀏覽器語音", "Browser voice")),
        hint("st-voice-hint", "沒有教育部真人發音或 TTS 檔案時才用，一定標示「瀏覽器語音」。", "Used only when there is no MOE recording or TTS file, and always labelled “browser voice”.")),
      h("div", { class: "st-voice" }, sel, h("span", { class: "row", style: "gap:6px" }, tryBtn, h("span", { class: "badge tts", "aria-hidden": "true" }, "TTS")))),
    none,
    h("div", { class: "st-row st-row-wide" },
      h("div", { class: "st-row-text" }, h("p", { id: "st-speed-l", class: "st-name" }, ...bi("預設速度", "Default speed")),
        hint("st-speed-hint", "錄音和 TTS 一開始的播放速度。", "The speed recordings and TTS start at.")),
      seg("st-speed-l", SPEEDS.map(v => [v, `${v === 1 ? "1.0" : v}×`]), SPEEDS.includes(s.speed) ? s.speed : 1, v => setSetting("speed", v))),
    h("div", { class: "st-row st-row-wide st-row-mic" },
      h("div", { class: "st-row-text" }, h("p", { class: "st-name" }, ...bi("麥克風測試", "Mic test")),
        hint("st-mic-hint", "錄 3 秒、播回來，看音量和音高線。測試錄音不會儲存。", "Records 3 s, plays it back and shows the level and a live pitch line. The test take is not saved.")),
      micTest()));
}

// mic test: Recorder (app.js) feeds the level meter and LivePitch (pitch.js); the plot is 3 s × 60-500 Hz (log)
const MIC_S = 3, PW = 300, PH = 120, FMIN = 60, FMAX = 500;
const yOf = hz => PH - (Math.log(hz / FMIN) / Math.log(FMAX / FMIN)) * PH;
function plotSvg() {
  const grid = [100, 200, 400].map(hz => `<line x1="0" x2="${PW}" y1="${yOf(hz).toFixed(1)}" y2="${yOf(hz).toFixed(1)}" class="st-grid"/>` +
    `<text x="4" y="${(yOf(hz) - 3).toFixed(1)}" class="st-gridl">${hz} Hz</text>`).join("");
  return `<svg viewBox="0 0 ${PW} ${PH}" preserveAspectRatio="none" focusable="false">${grid}<path class="st-line" d=""/></svg>`;
}
function micTest() {
  const box = h("div", { class: "st-mic" });
  if (!canRecord) { box.append(h("p", { class: "muted small" }, ...bi("這個瀏覽器不能錄音。", "This browser can't record."))); return box; }
  const instr = h("p", { class: "st-mic-instr small" }, ...bi("按「測試」，然後用平常的聲音說：", "Press Test, then say in your normal voice:"));
  const status = h("p", { class: "st-mic-status small", "aria-live": "polite" });
  const prompt = h("p", { class: "st-mic-prompt" }, ruby(SAMPLE.zh, SAMPLE.zhuyin));
  const fill = h("i");
  const meter = h("div", { class: "st-meter", "aria-hidden": "true" }, fill);
  const plot = h("div", { class: "st-plot", "aria-hidden": "true", html: plotSvg() });
  const line = plot.querySelector(".st-line");
  let rec = null, url = null, timer = null;
  const again = h("button", { type: "button", class: "btn", disabled: true, onclick: () => { if (url) playFile(url); } }, "▶ ", ...bi("再聽一次", "Play again"));
  const go = h("button", { type: "button", class: "btn primary", "aria-pressed": "false", onclick: () => { if (rec) rec.stop(); else start(); } });
  const setGo = on => { go.replaceChildren(...(on ? ["■ ", ...bi("停止", "Stop")] : ["● ", ...bi("測試 3 秒", "Test 3 s")])); go.setAttribute("aria-pressed", String(on)); go.classList.toggle("recording", on); };
  setGo(false);
  const draw = frames => {
    let d = "", prev = null;
    for (const f of frames) {
      if (!f.hz || f.t < 0 || f.t > MIC_S + 0.5) { prev = null; continue; }
      const x = Math.min(PW, (f.t / MIC_S) * PW), y = Math.max(0, Math.min(PH, yOf(f.hz)));
      // a gap or a jump over 7 semitones (pitch.js MAX_JUMP: an octave error, not a voice) starts a new piece
      const join = prev && f.t - prev.t < 0.05 && Math.abs(12 * Math.log2(f.hz / prev.hz)) <= 7;
      d += `${join ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      prev = f;
    }
    line.setAttribute("d", d);
  };
  async function start() {
    stopAudio();
    audioContext(); // created or resumed inside the tap (iOS)
    const r = rec = new Recorder();
    let live = null, pitchOk = true;
    try { live = new LivePitch(); live.ready.catch(() => { pitchOk = false; }); } catch { pitchOk = false; }
    let peak = 0;
    fill.style.width = "0%"; line.setAttribute("d", "");
    setGo(true);
    status.replaceChildren(...bi("等麥克風…", "Waiting for the microphone…"));
    r.onstopped = blob => finish(blob, peak, live, pitchOk);
    let ok;
    try {
      ok = await r.start({ onFrame: (buf, sr, t) => {
        let sum = 0, pk = 0;
        for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); sum += a * a; if (a > pk) pk = a; }
        if (pk > peak) peak = pk;
        const db = 10 * Math.log10(sum / buf.length + 1e-12);
        fill.style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
        if (live) { try { live.push(buf, sr, t); draw(live.frames); } catch (err) { console.warn(err); live = null; } }
      } });
    } catch (err) {
      console.warn(err);
      rec = null; setGo(false);
      status.replaceChildren(...bi("需要麥克風權限：在瀏覽器的網址列允許麥克風，再試一次。", "Microphone permission needed: allow the microphone in the browser's address bar, then try again."));
      return;
    }
    if (!ok) { rec = null; setGo(false); status.replaceChildren(...bi("已取消。", "Cancelled.")); return; }
    status.replaceChildren(...bi("錄音中：說吧！", "Recording: speak now!"));
    timer = setTimeout(() => r.stop(), MIC_S * 1000);
  }
  function finish(blob, peak, live, pitchOk) {
    clearTimeout(timer);
    rec = null; setGo(false);
    fill.style.width = "0%";
    if (!blob || !blob.size) { status.replaceChildren(...bi("沒有錄到聲音。", "Nothing was recorded.")); return; }
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    again.disabled = false;
    const pdb = peak > 0 ? Math.round(20 * Math.log10(peak)) : -Infinity;
    const level = pdb < -40 ? bi("太小聲：靠近一點，或調高麥克風音量。", "Too quiet: move closer or turn the mic input up.")
      : pdb >= -1 ? bi("太大聲，聲音破了：離遠一點。", "Too loud, it clips: move back a little.") : bi("音量剛好。", "Level OK.");
    const hz = (live ? live.frames : []).filter(f => f.hz).map(f => f.hz).sort((a, b) => a - b);
    const pitchMsg = !pitchOk ? bi("音高線需要先連上網路一次（pitchy 從 CDN 載入，之後離線也能用）。", "The pitch line needs the internet once (pitchy loads from a CDN, then works offline).")
      : hz.length < 5 ? bi("沒有找到說話的音高：用平常的聲音說一整句。", "No voice pitch found: say a whole sentence in your normal voice.")
        : bi(`找到音高，中間值約 ${Math.round(hz[hz.length >> 1])} Hz。`, `Pitch found: median about ${Math.round(hz[hz.length >> 1])} Hz.`);
    status.replaceChildren(h("span", { class: "st-peak" }, `${Number.isFinite(pdb) ? pdb : "−∞"} dBFS`), " ", ...level, " ", ...pitchMsg);
    if (box.isConnected) playFile(url); // not after a tab change cut the take short
  }
  box.append(instr, prompt, h("div", { class: "row" }, go, again), h("p", { class: "st-meter-l small muted", "aria-hidden": "true" }, ...bi("音量", "Level")), meter,
    h("p", { class: "st-meter-l small muted", "aria-hidden": "true" }, ...bi("音高", "Pitch")), plot, status);
  return box;
}

// ---------- study time
function studyCard() {
  const s = S();
  const mins = h("input", { type: "number", id: "st-minutes", class: "st-input st-num", min: 5, max: 240, step: 5, inputmode: "numeric", value: s.dailyMinutes,
    "aria-describedby": "st-minutes-hint", onchange: () => {
      let n = Math.round(Number(mins.value));
      if (!Number.isFinite(n) || n < 5) n = 5;
      if (n > 240) n = 240;
      mins.value = n; setSetting("dailyMinutes", n);
    } });
  const days = h("select", { id: "st-days", class: "st-input", onchange: () => setSetting("studyDays", Number(days.value)) },
    [1, 2, 3, 4, 5, 6, 7].map(n => h("option", { value: n, selected: n === Number(s.studyDays) }, `${n}`)));
  const goal = { band: "B1", date: "", ...(store.get("plan.goal", {}) || {}) };
  const saveGoal = () => store.set("plan.goal", { ...(store.get("plan.goal", {}) || {}), date: dateIn.value, band: bandSel.value });
  const dateIn = h("input", { type: "date", id: "st-goal-date", class: "st-input", value: goal.date || "", min: today(), onchange: saveGoal });
  const bandSel = h("select", { id: "st-goal-band", class: "st-input", onchange: saveGoal }, BANDS.map(([id, label]) => h("option", { value: id, selected: id === goal.band }, label)));
  const field = (id, zh, en, input, extra) => h("div", { class: "st-field" }, h("label", { for: id, class: "st-name" }, ...bi(zh, en)), input, extra || null);
  return h("div", { class: "card st-card" },
    h("div", { class: "st-fields" },
      field("st-minutes", "每天分鐘", "Minutes a day", mins),
      field("st-days", "每週天數", "Study days a week", days),
      field("st-goal-band", "目標等級", "Goal band", bandSel),
      field("st-goal-date", "目標日期", "Goal date", dateIn)),
    hint("st-minutes-hint", "今天頁的每日安排和計畫頁的速度、目標日期都用這些數字。", "Today's routine and the Plan page's pace and goal date use these numbers."));
}

// ---------- data: export / import / reset
const fmtMB = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
function download(name, obj, pretty) {
  const blob = new Blob([JSON.stringify(obj, null, pretty ? 1 : 0)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const a = h("a", { href, download: name, hidden: true });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}
const STATUS = { new: ["新增", "new"], changed: ["更新", "changed"], same: ["相同", "same"], removed: ["刪除", "removed"], skipped: ["略過", "skipped"] };
const countLine = counts => {
  const ks = Object.keys(STATUS).filter(k => counts[k]);
  return ks.length ? ks.flatMap((k, i) => [i ? " · " : "", STATUS[k][0], " ", h("span", { lang: "en" }, STATUS[k][1]), ` ${counts[k]}`]) : ["—"];
};
function dataCard(panel) {
  const summary = h("p", { class: "small", "aria-live": "polite" }, "…");
  const out = h("div", { class: "st-out", "aria-live": "polite" });
  const expRec = h("button", { type: "button", class: "btn", disabled: true }, "⇩ ", ...bi("匯出錄音", "Export recordings"));
  let nLocal = 0, nRec = 0;
  const refresh = async () => {
    nLocal = Object.keys(snapshotLocal()).length;
    let bytes = 0;
    try { const recs = await readDb(); nRec = recs.length; bytes = recs.reduce((s, r) => s + valueBytes(r.value), 0); } catch (err) { console.warn(err); nRec = 0; }
    summary.replaceChildren(...bi(`這個裝置上有 ${nLocal} 項設定與進度、${nRec} 段錄音${nRec ? `（${fmtMB(bytes)}）` : ""}。`,
      `This device holds ${nLocal} progress items and ${nRec} recording${nRec === 1 ? "" : "s"}${nRec ? ` (${fmtMB(bytes)})` : ""}.`));
    expRec.disabled = !nRec;
    resetRecLabel.replaceChildren(...bi(`也刪除這個裝置上的 ${nRec} 段錄音`, `Also delete the ${nRec} recording${nRec === 1 ? "" : "s"} on this device`));
  };
  const expProg = h("button", { type: "button", class: "btn primary", onclick: async () => {
    try { download(`guoyu-progress-${today()}.json`, await exportProgress(), true); toast("已匯出進度 Progress exported"); }
    catch (err) { console.error(err); toast("匯出失敗 Export failed: " + (err.message || err)); }
  } }, "⇩ ", ...bi("匯出進度", "Export progress"));
  expRec.addEventListener("click", async () => {
    expRec.disabled = true;
    try { download(`guoyu-recordings-${today()}.json`, await exportRecordings()); toast("已匯出錄音 Recordings exported"); }
    catch (err) { console.error(err); toast("匯出失敗 Export failed: " + (err.message || err)); }
    expRec.disabled = !nRec;
  });

  // import: pick -> preview (mode) -> apply
  let files = [], mode = "merge";
  const fileIn = h("input", { type: "file", accept: ".json,application/json", multiple: true, hidden: true, onchange: () => readFiles() });
  const pick = h("button", { type: "button", class: "btn", onclick: () => fileIn.click() }, "⇧ ", ...bi("選擇備份檔…", "Choose backup files…"));
  const preview = h("div", { class: "st-import", hidden: true });
  async function readFiles() {
    files = []; const errors = [];
    for (const f of fileIn.files || []) {
      try { files.push(parseBackup(await f.text(), f.name)); } catch (err) { errors.push(h("li", {}, h("b", {}, f.name), "：", err.message)); }
    }
    fileIn.value = "";
    preview.hidden = false;
    clear(preview);
    if (errors.length) preview.append(h("ul", { class: "st-errors small", role: "alert" }, errors));
    if (files.length) await drawPreview();
  }
  async function drawPreview() {
    let p;
    try { p = await previewImport(files, mode); } catch (err) { preview.append(h("p", { class: "st-errors small", role: "alert" }, err.message)); return; }
    const body = h("div", { class: "st-import-body" });
    for (const f of files) body.append(h("p", { class: "small" }, h("b", {}, f.name || f.kind), " · ",
      f.kind === "progress" ? bi("進度", "progress") : bi("錄音", "recordings"), f.exported ? ` · ${f.exported.slice(0, 16).replace("T", " ")} UTC` : "",
      f.skipped ? h("span", { class: "muted" }, " · ", ...bi(`${f.skipped} 項看不懂、略過`, `${f.skipped} unreadable items skipped`)) : null));
    const list = (rows, label) => h("details", { class: "st-keys" }, h("summary", { class: "small" }, ...bi("看每一項", "Show each item")),
      h("ul", { class: "small" }, rows.map(r => h("li", { class: `st-k st-k-${r.status}` }, h("span", { class: "st-k-s" }, STATUS[r.status][0], " ", h("span", { lang: "en" }, STATUS[r.status][1])), " ", h("code", {}, label(r))))));
    if (p.local) body.append(h("p", {}, h("b", {}, ...bi("設定與進度", "Progress")), "：", ...countLine(p.local.counts)), list(p.local.rows, r => r.key.slice(LS_PREFIX.length)));
    if (p.recs) body.append(h("p", {}, h("b", {}, ...bi("錄音", "Recordings")), "：", ...countLine(p.recs.counts)), list(p.recs.rows, r => `${r.store} · ${typeof r.key === "string" ? r.key : JSON.stringify(r.key)}`));
    if (p.missing) body.append(h("p", { class: "small st-warn" }, ...bi(`進度檔列了 ${p.missing} 段這個裝置上沒有的錄音；一起匯入錄音檔，它們才會回來。`,
      `The progress file lists ${p.missing} recording${p.missing === 1 ? "" : "s"} that are not on this device; import the recordings file with it to bring them back.`)));
    const radio = (value, zh, en, dzh, den) => h("label", { class: "st-radio" },
      h("input", { type: "radio", name: "st-mode", value, checked: mode === value, onchange: () => { mode = value; redraw(); } }),
      h("span", {}, h("b", {}, ...bi(zh, en)), h("br"), h("span", { class: "small muted" }, ...bi(dzh, den))));
    const modes = h("fieldset", { class: "st-modes" }, h("legend", { class: "small" }, ...bi("匯入方式", "How to import")),
      radio("merge", "合併", "Merge", "檔案裡的項目寫進來，同名的用檔案的；這裡其他的保留。", "The file's items are written; where a name exists here, the file's version wins; everything else here stays."),
      radio("replace", "取代", "Replace", "匯入的部分完全換成檔案的內容：這裡多出來的會刪掉。", "The parts you import become exactly the file's: anything extra here is removed."));
    const apply = h("button", { type: "button", class: "btn primary", onclick: async () => {
      apply.disabled = true;
      try {
        const r = await applyImport(files, mode);
        files = []; preview.hidden = true; clear(preview);
        toast("已匯入 Imported");
        out.replaceChildren(h("p", { class: "feedback good" }, "✓ ", ...bi(`已匯入：${r.local} 項進度、${r.recs} 段錄音${r.removed ? `，刪除 ${r.removed} 項` : ""}${r.skipped ? `，略過 ${r.skipped} 段` : ""}。其他開著的分頁請重新整理。`,
          `Imported ${r.local} progress item${r.local === 1 ? "" : "s"} and ${r.recs} recording${r.recs === 1 ? "" : "s"}${r.removed ? `, removed ${r.removed}` : ""}${r.skipped ? `, skipped ${r.skipped}` : ""}. Reload any other open tabs of the app.`)));
        rerenderKeep(panel, out);
      } catch (err) {
        console.error(err); apply.disabled = false;
        out.replaceChildren(h("p", { class: "feedback bad", role: "alert" }, ...bi("匯入失敗：", "Import failed: "), err.message || String(err)));
      }
    } }, "⇧ ", ...bi("匯入", "Import"));
    const cancel = h("button", { type: "button", class: "btn", onclick: () => { files = []; preview.hidden = true; clear(preview); pick.focus(); } }, ...bi("取消", "Cancel"));
    const redraw = async () => { const keep = preview.querySelector("ul.st-errors"); clear(preview); if (keep) preview.append(keep); await drawPreview(); preview.querySelector(`input[value="${mode}"]`)?.focus(); };
    preview.append(h("h4", {}, ...bi("匯入前先看看", "Before you import")), body, modes, h("div", { class: "row" }, apply, cancel));
  }

  // reset: typed confirmation
  const resetRecs = h("input", { type: "checkbox", id: "st-reset-recs" });
  const resetRecLabel = h("span", {});
  const WORDS = ["重設", "reset"];
  const confirmIn = h("input", { type: "text", id: "st-reset-word", class: "st-input", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
    oninput: () => { resetBtn.disabled = !WORDS.includes(confirmIn.value.trim().toLowerCase()); } });
  const resetBtn = h("button", { type: "button", class: "btn st-danger-btn", disabled: true, onclick: async () => {
    resetBtn.disabled = true;
    try {
      stopAudio();
      const n = await resetData({ recordings: resetRecs.checked });
      toast("已重設 Reset done");
      out.replaceChildren(h("p", { class: "feedback good" }, "✓ ", ...bi(`已刪除 ${n} 項進度${resetRecs.checked ? "和所有錄音" : ""}。其他開著的分頁請重新整理。`,
        `Deleted ${n} progress items${resetRecs.checked ? " and every recording" : ""}. Reload any other open tabs of the app.`)));
      rerenderKeep(panel, out);
    } catch (err) {
      console.error(err);
      out.replaceChildren(h("p", { class: "feedback bad", role: "alert" }, ...bi("重設失敗：", "Reset failed: "), err.message || String(err)));
    }
  } }, ...bi("刪除我的進度", "Delete my progress"));
  const reset = h("details", { class: "st-reset" }, h("summary", {}, ...bi("重設所有進度", "Reset all progress")),
    h("p", { class: "small" }, ...bi("會刪除這個裝置上所有的設定、進度和學習時間，不能復原。先匯出一份備份。", "Deletes every setting, all progress and the study time on this device. It can't be undone: export a backup first.")),
    h("p", {}, h("label", { class: "st-check" }, resetRecs, resetRecLabel)),
    h("p", {}, h("label", { for: "st-reset-word", class: "small" }, ...bi("輸入「重設」或 RESET 確認：", "Type 重設 or RESET to confirm:")), h("br"), confirmIn),
    resetBtn);

  refresh();
  return h("div", { class: "card st-card st-data" },
    summary,
    h("h3", {}, ...bi("匯出", "Export")),
    h("p", { class: "small muted" }, ...bi("進度檔包含所有設定、進度和學習時間（還有錄音的清單）。錄音另外存成第二個檔，可能很大。檔案只會下載到你的裝置。",
      "The progress file holds every setting, all progress and the study time (plus a list of your recordings). The recordings go in a second file, which can be large. Files only download to your device.")),
    h("div", { class: "row" }, expProg, expRec),
    h("h3", {}, ...bi("匯入", "Import")),
    h("p", { class: "small muted" }, ...bi("可以一次選進度檔和錄音檔。匯入前會先給你看會改什麼。", "You can pick the progress file and the recordings file together. You see what will change before anything is written.")),
    h("div", { class: "row" }, pick, fileIn), preview, out,
    h("h3", {}, ...bi("重設", "Reset")), reset);
}
// re-render the settings after an import or reset (new values), keeping the result message and the Data section in view
function rerenderKeep(panel, msg) {
  rerender(panel);
  const out = panel.querySelector(".st-out");
  if (out) { out.replaceChildren(...[...msg.childNodes]); out.scrollIntoView({ block: "center" }); }
}

// ---------- credits
function licenseChips(list) {
  return list.map(([name, url]) => url ? h("a", { class: "st-chip", href: url, rel: "noopener" }, name) : h("span", { class: "st-chip st-chip-plain" }, name));
}
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
function renderCredits(panel) {
  const attrs = new Map();
  panel.append(
    h("p", { class: "small" }, ...bi("這個網站是免費的個人自學工具。下面是用到的每一個來源、它的授權和要求的出處標示。外部網站只放連結，不轉載內容。",
      "This site is a free personal study tool. Below is every source it uses, with its license and the attribution it requires. External sites are linked, never copied.")),
    section("st-src-h", "資料與音檔", "Data and audio",
      CREDITS.map(c => {
        const q = c.attribution ? h("blockquote", { class: "st-attr", lang: "zh-Hant-TW" }, c.attribution) : null;
        if (q) attrs.set(c.id, q);
        return h("article", { class: "card st-credit", "aria-labelledby": `cr-${c.id}` },
          h("h3", { id: `cr-${c.id}` }, h("span", { lang: "zh-Hant-TW" }, c.zh), " ", h("span", { class: "st-credit-en", lang: "en" }, c.en)),
          h("p", { class: "st-lic" }, ...licenseChips(c.licenses), c.url ? h("a", { href: c.url, rel: "noopener", class: "small" }, host(c.url)) : null),
          h("p", { class: "small" }, ...bi(c.useZh, c.useEn)),
          q ? h("p", { class: "st-attr-l small muted" }, ...bi("出處標示", "Attribution")) : null, q);
      })),
    section("st-moe-h", "教育部《國語辭典簡編本》公眾授權使用說明", "MOE terms of use (unmodified)",
      h("p", { class: "small muted" }, ...bi("依授權要求完整保留，一字不改。", "Kept complete and unmodified, as the license requires.")),
      moeTerms()),
    section("st-sw-h", "程式與字型", "Software and fonts",
      h("div", { class: "st-table-wrap" }, h("table", { class: "st-table" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, ...bi("名稱", "Name")), h("th", { scope: "col" }, ...bi("授權", "License")), h("th", { scope: "col" }, ...bi("用途", "Use")))),
        h("tbody", {}, SOFTWARE.map(s => h("tr", {},
          h("th", { scope: "row" }, h("a", { href: s.url, rel: "noopener" }, s.name)),
          h("td", {}, licenseChips([s.license])),
          h("td", {}, ...bi(s.zh, s.en), " ", h("span", { class: "muted" }, s.where === "site" ? bi("（網站上）", "(in the site)") : bi("（只在建置時）", "(build only)"))))))))),
    section("st-tts-h", "聲音標示", "Audio labels",
      h("p", { class: "small" }, ...bi("每段聲音都標示來源：教育部真人發音，或 TTS（合成語音）。聲調和音節練習只用真人發音。網站上的 TTS 句子音檔是 gTTS（Google 的 zh-TW 語音）做的；瀏覽器語音在你的裝置上即時產生，也會標示。edge-tts 的輸出不發布（它的服務條款不明確）。",
        "Every clip is labelled with its source: MOE human voice, or TTS. Tone and syllable drills use human audio only. The site's TTS sentence files are made with gTTS (Google's zh-TW voice); browser voices are generated on your device at runtime and are labelled too. edge-tts output is not published (its terms of service are a grey area)."))),
    section("st-link-h", "只放連結", "Linked, not copied",
      h("p", { class: "small" }, ...bi("進階頁連到國語日報、公視新聞網、小公視、TOCFL 模擬測驗、教育部筆順學習網（CC BY-NC-ND）、Chinese Grammar Wiki（CC BY-NC-SA）等網站。這些內容都不複製到這裡；每個連結都記錄檢查日期，沒驗證過的會標出來。",
        "The Advanced page links to 國語日報, 公視新聞網, 小公視, the TOCFL mock tests, the MOE stroke-order site (CC BY-NC-ND), the Chinese Grammar Wiki (CC BY-NC-SA) and others. None of their content is copied here; every link records when it was checked, and unverified ones are marked."))),
    section("st-priv-h", "隱私", "Privacy",
      h("p", { class: "small" }, ...bi("你的錄音和進度只存在這個裝置上（IndexedDB 和 localStorage），不會上傳到任何地方。",
        "Your recordings and progress stay on this device (IndexedDB and localStorage). Nothing is uploaded anywhere."))));
  // the attribution line the build wrote into the data (tones.json license), so text and version always match
  loadJSON("tones").then(d => { const a = d && d.license && d.license.attribution; if (a && attrs.get("moe-concised")) attrs.get("moe-concised").textContent = a; }).catch(() => {});
}
function moeTerms() {
  const pre = h("pre", { class: "st-license", lang: "zh-Hant-TW", tabindex: "0", "aria-label": "教育部使用說明 MOE terms of use" }, "載入中… Loading…");
  fetch(MOE_LICENSE_TXT, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
    .then(t => { pre.textContent = t; })
    .catch(() => {
      pre.replaceWith(h("p", { class: "st-warn small", role: "alert" }, ...bi("使用說明載入不了（離線？）。原文：", "The terms could not be loaded (offline?). The original: "),
        h("a", { href: MOE_LICENSE_PDF, rel: "noopener" }, "conciseddict_10312.pdf")));
    });
  return pre;
}

if (app) boot();
