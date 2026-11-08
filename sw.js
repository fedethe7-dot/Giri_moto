const CACHE = "giri-moto-v2";
const FILES = ["./", "index.html", "style.css", "app.js", "pois.js", "manifest.json", "icon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // mappe e percorsi sempre da internet
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
