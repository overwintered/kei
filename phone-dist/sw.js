const CACHE = "kei-muqvtdpk";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./","index.html","manifest.webmanifest","app.js?v=muqvtdpk","checkin.js?v=muqvtdpk","coach.js?v=muqvtdpk","glance.js?v=muqvtdpk","health.js?v=muqvtdpk","items.js?v=muqvtdpk","lines.js?v=muqvtdpk","memory.js?v=muqvtdpk","memui.js?v=muqvtdpk","phone-host.js?v=muqvtdpk","phone.css?v=muqvtdpk","planner.js?v=muqvtdpk","sprite.js?v=muqvtdpk","study.js?v=muqvtdpk","style.css?v=muqvtdpk","sync.js?v=muqvtdpk","config.js?v=muqvtdpk","assets/kei/base.webp","assets/kei/eyes-closed.webp","assets/kei/eyes-down.webp","assets/kei/eyes-side.webp","assets/kei/eyes-teary.webp","assets/kei/infected.webp","assets/kei/mouth-grin.webp","assets/kei/mouth-open.webp","assets/kei/mouth-smile.webp"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return; // supabase calls go straight to the network
  // the page itself: newest from the network when online (so updates arrive), cached copy offline
  if (e.request.mode === "navigate") return e.respondWith(fetch(e.request).catch(() => caches.match("index.html")));
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
