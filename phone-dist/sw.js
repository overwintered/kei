const CACHE = "kei-murxkx9b";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./","index.html","manifest.webmanifest","app.js?v=murxkx9b","checkin.js?v=murxkx9b","coach.js?v=murxkx9b","external.js?v=murxkx9b","glance.js?v=murxkx9b","health.js?v=murxkx9b","items.js?v=murxkx9b","lines.js?v=murxkx9b","lore-engine.js?v=murxkx9b","lore.js?v=murxkx9b","memory.js?v=murxkx9b","memui.js?v=murxkx9b","music.js?v=murxkx9b","phone-host.js?v=murxkx9b","phone.css?v=murxkx9b","planner.js?v=murxkx9b","sprite.js?v=murxkx9b","study.js?v=murxkx9b","style.css?v=murxkx9b","sync.js?v=murxkx9b","config.js?v=murxkx9b","assets/kei/base.webp","assets/kei/eyes-closed.webp","assets/kei/eyes-down.webp","assets/kei/eyes-side.webp","assets/kei/eyes-teary.webp","assets/kei/infected.webp","assets/kei/mouth-grin.webp","assets/kei/mouth-open.webp","assets/kei/mouth-smile.webp"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return; // supabase calls go straight to the network
  // the page itself: newest from the network when online (so updates arrive), cached copy offline
  if (e.request.mode === "navigate") return e.respondWith(fetch(e.request).catch(() => caches.match("index.html")));
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
