const CACHE = "kei-murekdra";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./","index.html","manifest.webmanifest","app.js?v=murekdra","checkin.js?v=murekdra","coach.js?v=murekdra","glance.js?v=murekdra","health.js?v=murekdra","items.js?v=murekdra","lines.js?v=murekdra","memory.js?v=murekdra","memui.js?v=murekdra","music.js?v=murekdra","phone-host.js?v=murekdra","phone.css?v=murekdra","planner.js?v=murekdra","sprite.js?v=murekdra","study.js?v=murekdra","style.css?v=murekdra","sync.js?v=murekdra","config.js?v=murekdra","assets/kei/base.webp","assets/kei/eyes-closed.webp","assets/kei/eyes-down.webp","assets/kei/eyes-side.webp","assets/kei/eyes-teary.webp","assets/kei/infected.webp","assets/kei/mouth-grin.webp","assets/kei/mouth-open.webp","assets/kei/mouth-smile.webp"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return; // supabase calls go straight to the network
  // the page itself: newest from the network when online (so updates arrive), cached copy offline
  if (e.request.mode === "navigate") return e.respondWith(fetch(e.request).catch(() => caches.match("index.html")));
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
