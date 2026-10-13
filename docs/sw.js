// Service worker: app shell cached on install, data network-first, audio cached on first play (cache-first).
const VERSION = "v3";
const SHELL = `shell-${VERSION}`, DATA = `data-${VERSION}`, AUDIO = `audio-${VERSION}`;
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
    e.respondWith(caches.open(AUDIO).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
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
