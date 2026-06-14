// Service worker — makes RoadLore installable, but always prefers the LATEST
// page from the network so a redesign/deploy shows up immediately. The cache
// is only a fallback for when you're offline.
const SHELL = "roadlore-shell-v2";
const ASSETS = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never touch the story/voice APIs — always live.
  if (url.pathname.startsWith("/api/")) return;
  if (req.method !== "GET") return;

  const isPageNav =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isPageNav) {
    // Network-first: always try to fetch the freshest page; fall back to cache
    // only if the network is unavailable (offline).
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((m) => m || caches.match(req)))
    );
    return;
  }

  // Static assets: cache-first is fine.
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
