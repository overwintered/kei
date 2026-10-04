const CACHE = "kei-muuf8mt1";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./","index.html","manifest.webmanifest","app.js?v=muuf8mt1","checkin.js?v=muuf8mt1","coach.js?v=muuf8mt1","external.js?v=muuf8mt1","glance.js?v=muuf8mt1","health.js?v=muuf8mt1","items.js?v=muuf8mt1","life.js?v=muuf8mt1","lines.js?v=muuf8mt1","lore-engine.js?v=muuf8mt1","lore.js?v=muuf8mt1","memory.js?v=muuf8mt1","memui.js?v=muuf8mt1","music.js?v=muuf8mt1","phone-host.js?v=muuf8mt1","phone.css?v=muuf8mt1","planner.js?v=muuf8mt1","sprite.js?v=muuf8mt1","study.js?v=muuf8mt1","style.css?v=muuf8mt1","sync.js?v=muuf8mt1","config.js?v=muuf8mt1","assets/kei/base.webp","assets/kei/eyes-closed.webp","assets/kei/eyes-down.webp","assets/kei/eyes-side.webp","assets/kei/eyes-teary.webp","assets/kei/infected.webp","assets/kei/mouth-grin.webp","assets/kei/mouth-open.webp","assets/kei/mouth-smile.webp"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return; // supabase calls go straight to the network
  // the page itself: newest from the network when online (so updates arrive), cached copy offline
  if (e.request.mode === "navigate") return e.respondWith(fetch(e.request).catch(() => caches.match("index.html")));
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
