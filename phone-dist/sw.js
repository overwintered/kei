const CACHE = "kei-murz3wro";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./","index.html","manifest.webmanifest","app.js?v=murz3wro","checkin.js?v=murz3wro","coach.js?v=murz3wro","external.js?v=murz3wro","glance.js?v=murz3wro","health.js?v=murz3wro","items.js?v=murz3wro","life.js?v=murz3wro","lines.js?v=murz3wro","lore-engine.js?v=murz3wro","lore.js?v=murz3wro","memory.js?v=murz3wro","memui.js?v=murz3wro","music.js?v=murz3wro","phone-host.js?v=murz3wro","phone.css?v=murz3wro","planner.js?v=murz3wro","sprite.js?v=murz3wro","study.js?v=murz3wro","style.css?v=murz3wro","sync.js?v=murz3wro","config.js?v=murz3wro","assets/kei/base.webp","assets/kei/eyes-closed.webp","assets/kei/eyes-down.webp","assets/kei/eyes-side.webp","assets/kei/eyes-teary.webp","assets/kei/infected.webp","assets/kei/mouth-grin.webp","assets/kei/mouth-open.webp","assets/kei/mouth-smile.webp"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return; // supabase calls go straight to the network
  // the page itself: newest from the network when online (so updates arrive), cached copy offline
  if (e.request.mode === "navigate") return e.respondWith(fetch(e.request).catch(() => caches.match("index.html")));
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
