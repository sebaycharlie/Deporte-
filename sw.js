// Service Worker: permite usar la app sin internet e instalarla como app.
// Al publicar una nueva versión, cambia CACHE_VERSION para que los usuarios reciban la actualización.
const CACHE_VERSION = "fitpro-v2.0.0";
const APP_SHELL = [
    "./",
    "./index.html",
    "./css/app.css",
    "./js/data.js",
    "./js/app.js",
    "./vendor/chart.umd.min.js",
    "./manifest.webmanifest",
    "./icons/icon.svg",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);

    if (url.origin === self.location.origin) {
        // Archivos propios: red primero (para recibir actualizaciones), caché si no hay internet
        event.respondWith(
            fetch(req)
                .then((res) => {
                    if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
                    return res;
                })
                .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
        );
    } else if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
        // Fuentes: caché primero
        event.respondWith(
            caches.match(req).then((cached) => cached || fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
                return res;
            }).catch(() => cached))
        );
    }
});
