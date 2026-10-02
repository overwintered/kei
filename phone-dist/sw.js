const CACHE = "kei-muquu7z9";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./","index.html","manifest.webmanifest","app.js?v=muquu7z9","checkin.js?v=muquu7z9","coach.js?v=muquu7z9","glance.js?v=muquu7z9","health.js?v=muquu7z9","items.js?v=muquu7z9","lines.js?v=muquu7z9","memory.js?v=muquu7z9","memui.js?v=muquu7z9","phone-host.js?v=muquu7z9","phone.css?v=muquu7z9","planner.js?v=muquu7z9","sprite.js?v=muquu7z9","study.js?v=muquu7z9","style.css?v=muquu7z9","sync.js?v=muquu7z9","config.js?v=muquu7z9","assets/kei/base.webp","assets/kei/eyes-closed.webp","assets/kei/eyes-down.webp","assets/kei/eyes-side.webp","assets/kei/eyes-teary.webp","assets/kei/infected.webp","assets/kei/mouth-grin.webp","assets/kei/mouth-open.webp","assets/kei/mouth-smile.webp"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return; // supabase calls go straight to the network
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
