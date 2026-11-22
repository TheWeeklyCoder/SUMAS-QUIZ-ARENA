// Service worker: makes the app shell work offline. Firestore does its own offline caching.
// Bump VERSION whenever you deploy changes, so installed apps pick up the new files.
const VERSION = "sumas-v24";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/styles.css", "content/quotes.json",
  "fonts/poppins-regular.woff", "fonts/poppins-medium.woff", "fonts/poppins-bold.woff", "fonts/naira-regular.woff", "fonts/naira-medium.woff", "fonts/naira-bold.woff",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "js/errors.js", "js/notify.js", "js/version.js", "js/update.js", "js/whatsnew.js", "js/lib/levels.js", "js/lib/releases.js", "js/pages/level.js", "js/pages/admin-update.js", "js/affiliate.js", "js/lib/affiliate.js", "js/pages/affiliate.js", "js/pages/admin-affiliates.js", "js/pages/privacy.js", "js/email.js", "js/pdfreader.js", "js/pdfoffline.js", "js/install.js", "js/lib/installrules.js", "js/lib/library.js", "js/lib/revenue.js", "js/lib/sponsors.js", "js/pages/library.js", "js/pages/admin-library.js", "js/pages/admin-revenue.js", "js/pages/admin-sponsors.js", "js/pages/admin-email.js",
  "js/app.js", "js/auth.js", "js/cache.js", "js/config.js", "js/data.js", "js/firebase-config.js", "js/firebase.js", "js/imagetools.js",
  "js/net.js", "js/activity.js", "js/sessionlog.js", "js/theme.js", "js/router.js", "js/state.js", "js/terms.js", "js/ui.js", "js/tour.js", "js/avatars.js", "js/pages/admin-avatars.js", "js/pages/admin-quotes.js", "js/pages/admin-manual.js", "js/qview.js", "js/sound.js", "js/share.js", "js/lib/symbols.js", "js/pages/admin-sets.js",
  "js/lib/analyse.js", "js/lib/tournament.js", "js/lib/lobby.js", "js/lib/stats.js", "js/lib/parse.js", "js/lib/plans.js", "js/lib/quiz.js", "js/lib/util.js",
  "js/pages/admin.js", "js/pages/admin-images.js", "js/pages/admin-tools.js", "js/pages/admin-phase3.js", "js/pages/tournaments.js", "js/pages/matches.js", "js/pages/admin-lobbies.js", "js/pages/playengine.js", "js/pages/store.js", "js/pages/leaderboard.js", "js/pages/arena.js", "js/pages/auth.js", "js/pages/home.js", "js/pages/onboarding.js",
  "js/pages/plans.js", "js/pages/practice.js", "js/pages/profile.js", "js/pages/progress.js", "js/pages/quiz.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

// Tapping a phone notification opens (or focuses) the app on the match or tournament it was about.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate?.(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && !k.startsWith("sumas-pdf-")).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const cacheable = (url) => url.origin === location.origin || url.href.startsWith("https://www.gstatic.com/firebasejs/") || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

// Stale-while-revalidate for our files and the pinned Firebase SDK. Never touch API calls.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!cacheable(url)) return;
  if (url.origin === location.origin && url.pathname.includes("/js/vendor/pdfjs/")) {   // pdf.js: kept in its own cache so offline reading survives app updates
    e.respondWith((async () => {
      const lib = await caches.open("sumas-pdf-lib");
      const hit = await lib.match(req); if (hit) return hit;
      try { const res = await fetch(req); if (res && res.ok) lib.put(req, res.clone()); return res; } catch { return Response.error(); }
    })());
    return;
  }
  if (/\.pdf$/i.test(url.pathname) || req.headers.has("range")) return;   // study-library PDFs are never stored in the app cache (access is checked in the app)
  if (url.pathname.endsWith("/js/version.js") && url.searchParams.has("cb")) return;   // the "is a newer build online?" check must hit the network
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === "navigate") return (await cache.match("index.html")) || (await cache.match("./")) || Response.error();
    return Response.error();
  })());
});
