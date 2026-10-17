// Service worker: app shell cached on install, data network-first, audio cached on first play (cache-first),
// the pinned pitch library cached on install or first use (cache-first).
const VERSION = "v6";
const SHELL = `shell-${VERSION}`, DATA = `data-${VERSION}`;
const AUDIO = "audio-v1"; // not tied to VERSION: clip URLs never change content (§7.2), so played clips survive app updates
const LIB = "lib-v1";     // not tied to VERSION either: the URLs below are pinned to exact versions and never change
// pitchy 4.1.0 (js/pitch.js imports its +esm build) and the fft.js 4.0.4 build that module imports in turn
const LIB_PREFIXES = ["https://cdn.jsdelivr.net/npm/pitchy@4.1.0/", "https://cdn.jsdelivr.net/npm/fft.js@4.0.4/"];
const LIB_WARM = ["https://cdn.jsdelivr.net/npm/pitchy@4.1.0/+esm", "https://cdn.jsdelivr.net/npm/fft.js@4.0.4/+esm"];
const SHELL_FILES = ["./", "./index.html", "./lab.html", "./tones.html", "./shadow.html", "./css/style.css", "./css/drills.css", "./css/tones.css",
  "./css/today.css", "./css/shadow.css", "./js/app.js", "./js/lab.js", "./js/home.js", "./js/tones.js", "./js/pitch.js", "./js/drills.js",
  "./js/player.js", "./js/shadow.js",
  "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(Promise.all([
    caches.open(SHELL).then(c => c.addAll(SHELL_FILES)),
    warmLib(), // best effort: the pitch mirror then works offline even if it was never opened online
  ]).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, DATA, AUDIO, LIB].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {
    if (LIB_PREFIXES.some(p => e.request.url.startsWith(p))) e.respondWith(lib(e.request));
    return;
  }
  if (url.pathname.includes("/audio/")) {
    e.respondWith(audio(e.request));
    return;
  }
  if (url.pathname.includes("/data/")) {
    e.respondWith(caches.open(DATA).then(async c => {
      try { const res = await fetch(e.request, { cache: "no-cache" }); if (res.ok) c.put(e.request, res.clone()); return res; }
      catch { return (await c.match(e.request)) || Response.error(); }
    }));
    return;
  }
  // app shell: network first (so updates arrive immediately), cache fallback when offline
  e.respondWith(caches.open(SHELL).then(async c => {
    try { const res = await fetch(e.request, { cache: "no-cache" }); if (res.ok) c.put(e.request, res.clone()); return res; }
    catch { return (await c.match(e.request, { ignoreSearch: true })) || Response.error(); }
  }));
});

// Pinned library files: cache first, keyed by URL. Only a complete 200 is stored (the module import is a CORS
// request, so its response is readable); an error, or a miss while offline, goes back to the page as it is.
async function lib(req) {
  const c = await caches.open(LIB);
  const hit = await c.match(req.url, { ignoreVary: true });
  if (hit) return hit;
  let res;
  try { res = await fetch(req); } catch { return Response.error(); } // offline and never loaded
  if (res.status === 200) await c.put(req.url, res.clone()).catch(() => {}); // quota full: still use it
  return res;
}
function warmLib() {
  return caches.open(LIB).then(c => Promise.all(LIB_WARM.map(async u => {
    if (await c.match(u, { ignoreVary: true })) return;
    const res = await fetch(u, { mode: "cors" });
    if (res.status === 200) await c.put(u, res);
  }))).catch(() => {}); // offline at install: the first online use fills the cache instead
}

// <audio> requests carry a Range header and the server answers 206, which the Cache API refuses to store.
// So always fetch and cache the whole file (200, keyed by URL) and cut the requested range out of it.
async function audio(req) {
  const c = await caches.open(AUDIO);
  let res = await c.match(req.url);
  if (!res) {
    try { res = await fetch(req.url); } catch { return Response.error(); } // offline and never played
    if (res.status !== 200) return res;
    await c.put(req.url, res.clone()).catch(() => {}); // quota full: still play it
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get("range") || "").trim());
  return m ? partial(res, m) : res; // no (or a multi-part) Range: the whole file as 200
}
async function partial(res, [, from, to]) {
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  let start = NaN, end = size - 1;
  if (from) { start = Number(from); if (to) end = Math.min(Number(to), size - 1); }
  else if (to) start = Math.max(0, size - Number(to)); // "bytes=-500": the last 500 bytes
  if (!(start <= end)) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    "Content-Type": res.headers.get("Content-Type") || "audio/mpeg", "Content-Range": `bytes ${start}-${end}/${size}`,
    "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" } });
}
