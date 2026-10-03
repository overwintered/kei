const CACHE = "kei-murzhqop";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./","index.html","manifest.webmanifest","app.js?v=murzhqop","checkin.js?v=murzhqop","coach.js?v=murzhqop","external.js?v=murzhqop","glance.js?v=murzhqop","health.js?v=murzhqop","items.js?v=murzhqop","life.js?v=murzhqop","lines.js?v=murzhqop","lore-engine.js?v=murzhqop","lore.js?v=murzhqop","memory.js?v=murzhqop","memui.js?v=murzhqop","music.js?v=murzhqop","phone-host.js?v=murzhqop","phone.css?v=murzhqop","planner.js?v=murzhqop","sprite.js?v=murzhqop","study.js?v=murzhqop","style.css?v=murzhqop","sync.js?v=murzhqop","config.js?v=murzhqop","assets/kei/base.webp","assets/kei/eyes-closed.webp","assets/kei/eyes-down.webp","assets/kei/eyes-side.webp","assets/kei/eyes-teary.webp","assets/kei/infected.webp","assets/kei/mouth-grin.webp","assets/kei/mouth-open.webp","assets/kei/mouth-smile.webp"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return; // supabase calls go straight to the network
  // the page itself: newest from the network when online (so updates arrive), cached copy offline
  if (e.request.mode === "navigate") return e.respondWith(fetch(e.request).catch(() => caches.match("index.html")));
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
