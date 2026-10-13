// Service worker: app shell cached on install, data network-first, audio cached on first play (cache-first).
const VERSION = "v4";
const SHELL = `shell-${VERSION}`, DATA = `data-${VERSION}`;
const AUDIO = "audio-v1"; // not tied to VERSION: clip URLs never change content (§7.2), so played clips survive app updates
const SHELL_FILES = ["./", "./index.html", "./lab.html", "./css/style.css", "./js/app.js", "./js/lab.js", "./js/home.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, DATA, AUDIO].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
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
