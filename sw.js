// Aumenta la versione a ogni aggiornamento, così il telefono scarica i file nuovi
const CACHE = "giri-moto-v3";
const FILES = ["./", "index.html", "style.css", "app.js", "pois.js", "manifest.json", "icon.svg",
  "lib/leaflet.js", "lib/leaflet.css",
  "fonts/barlow-latin-400-normal.woff2", "fonts/barlow-latin-500-normal.woff2", "fonts/barlow-latin-600-normal.woff2",
  "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-700-normal.woff2", "fonts/barlow-condensed-latin-800-normal.woff2"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // mappe e percorsi sempre da internet
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
