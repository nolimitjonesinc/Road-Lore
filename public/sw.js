// Service worker — makes RoadLore installable, but always prefers the LATEST
// page from the network so a deploy shows up immediately. Cache is only a
// fallback for offline. Hardened so a failed fetch can never throw.
const SHELL = "roadlore-shell-v4";
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
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        } catch {
          return (
            (await caches.match("/")) ||
            (await caches.match(req)) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // Icons & manifest: network-first so a new deploy's artwork always wins.
  // Cache is only a fallback for offline. This stops a stale icon from sticking.
  const isIconish =
    /\.(png|ico|svg)$/i.test(url.pathname) ||
    url.pathname.endsWith(".webmanifest");

  if (isIconish) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        } catch {
          return (await caches.match(req)) || Response.error();
        }
      })()
    );
    return;
  }

  // Other static assets: cache-first, then network — never let a failure throw.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch {
        return Response.error();
      }
    })()
  );
});
