// Phone (PWA) stand-in for the Electron bridge. Replaces dev-host.js in the
// phone build (scripts/build-phone.js).
//
// - memory lives in localStorage and syncs through Supabase (src/sync.js)
// - the first time, you sign in; he arrives with everything from the Mac
// - talking goes through the "kei-ai" Supabase edge function, which holds the
//   Mistral key (keys never live in a public web page)
// - no screen glances, no file parsing, no desktop window tricks
(() => {
  const CFG = window.KEI_CLOUD; // {url, anonKey} from config.js
  const KEY = "kei-memory";
  const SESSION = "kei-session";
  const noop = () => {};
  document.documentElement.dataset.platform = "phone";
  document.addEventListener("DOMContentLoaded", () => (document.body.dataset.platform = "phone"));

  let lastInput = Date.now();
  for (const ev of ["touchstart", "keydown", "mousedown", "scroll"]) window.addEventListener(ev, () => (lastInput = Date.now()), { passive: true });

  // ------------------------------------------------------------- auth ---
  const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION)); } catch { return null; } };
  const setSession = (s) => localStorage.setItem(SESSION, JSON.stringify(s));
  async function authCall(grant, body) {
    const res = await fetch(`${CFG.url}/auth/v1/token?grant_type=${grant}`, { method: "POST", headers: { apikey: CFG.anonKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error_description || j.msg || j.message || `sign in failed (${res.status})`);
    const s = { token: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000, userId: j.user.id, email: j.user.email };
    setSession(s);
    return s;
  }
  async function token() {
    let s = getSession();
    if (!s) return null;
    if (Date.now() > s.expiresAt - 60_000) {
      try { s = await authCall("refresh_token", { refresh_token: s.refresh }); } catch (e) { if (navigator.onLine) { localStorage.removeItem(SESSION); } return null; }
    }
    return s;
  }
  const conn = async () => { const s = await token(); return s ? { url: CFG.url, anonKey: CFG.anonKey, token: s.token, userId: s.userId } : null; };

  // a terminal-style sign-in screen, shown until signed in
  function signIn() {
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.id = "phone-signin";
      el.innerHTML = `<form class="card-sheet mono">
        <div class="eva big">UNIT 01: KE1</div>
        <div class="tiny muted">REMOTE LINK // sign in with the account you linked on the mac</div>
        <input name="email" type="email" placeholder="email" autocomplete="username" required />
        <input name="password" type="password" placeholder="password" autocomplete="current-password" required />
        <button class="chip solid">CONNECT</button>
        <div class="tiny muted" id="signin-status"></div></form>`;
      const mount = () => document.body.append(el);
      document.body ? mount() : document.addEventListener("DOMContentLoaded", mount);
      el.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = e.target;
        const st = el.querySelector("#signin-status");
        st.textContent = "connecting...";
        try {
          await authCall("password", { email: f.email.value.trim(), password: f.password.value });
          st.textContent = "linked. loading his memory...";
          resolve();
          el.remove();
        } catch (err) {
          st.textContent = String(err.message || err);
        }
      });
    });
  }

  // first open on this phone: his memory comes down from the cloud
  async function fromCloud() {
    const c = await conn();
    const all = [];
    for (let seq = 0; ;) {
      const res = await fetch(`${c.url}/rest/v1/kei_records?select=key,doc,ts,seq&seq=gt.${seq}&order=seq.asc&limit=1000`, { headers: { apikey: c.anonKey, Authorization: `Bearer ${c.token}` } });
      if (!res.ok) throw new Error(`load failed (${res.status})`);
      const rows = await res.json();
      all.push(...rows);
      if (rows.length < 1000) break;
      seq = rows[rows.length - 1].seq;
    }
    if (!all.length) return null;
    const recs = Object.fromEntries(all.filter((r) => !r.doc._del).map((r) => [r.key, r.doc]));
    return Sync._internals.fromRecords(recs, {});
  }

  // ------------------------------------------------------------- AI ---
  async function ai({ system, messages, quick }) {
    const c = await conn();
    if (!c) return { error: "auth" };
    try {
      const res = await fetch(`${c.url}/functions/v1/kei-ai`, {
        method: "POST",
        headers: { apikey: c.anonKey, Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ system, messages, quick }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { error: j.error || (res.status === 404 ? "the kei-ai function isn't deployed yet" : `http ${res.status}`) };
      return j;
    } catch {
      return { error: "offline" };
    }
  }

  const toDataURL = async (url) => {
    const blob = await (await fetch(url)).blob();
    return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  };

  window.keiHost = {
    load: async () => {
      if (!getSession()) await signIn();
      try { const local = JSON.parse(localStorage.getItem(KEY)); if (local) return local; } catch {}
      try { return await fromCloud(); } catch { return null; }
    },
    save: async (doc) => { try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch {} },
    exportMemory: async (doc) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
      a.download = `kei-memory-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      return true;
    },
    importMemory: async () => null,
    importDocs: async () => [], // add files on the mac
    sprites: async () => {
      const names = ["base", "eyes-closed", "eyes-down", "eyes-side", "eyes-teary", "mouth-smile", "mouth-grin", "mouth-open", "infected"];
      const parts = {};
      await Promise.all(names.map(async (n) => (parts[n] = await toDataURL(`assets/kei/${n}.webp`))));
      return parts;
    },
    idleSeconds: async () => (document.visibilityState === "visible" ? Math.floor((Date.now() - lastInput) / 1000) : 9999),
    glance: async () => ({ skip: "phone" }),
    nowPlaying: async () => ({ state: "off" }),
    glancePermission: async () => "phone",
    usage: async () => ({ month: "", cost: 0, calls: 0, models: {} }),
    setMode: noop, setIgnoreMouse: noop, moveBy: noop, dragEnd: noop, focus: noop, attention: () => navigator.vibrate?.(200), resetPosition: noop, onCmd: noop,
    notify: ({ title, body }) => { if (window.Notification?.permission === "granted") navigator.serviceWorker?.ready.then((r) => r.showNotification(title, { body, icon: "icon-192.png" })); },
    setLoginItem: async () => ({ applied: false }),
    // one AI route on the phone: the kei-ai function (mistral)
    mistralHasKey: async () => true,
    mistralSetKey: async () => true,
    mistralChat: ai,
    mistralTest: async () => ai({ system: "reply with only the word: online", messages: [{ role: "user", content: "status check" }] }),
    geminiHasKey: async () => false, geminiSetKey: async () => false, geminiChat: async () => ({ error: "nokey" }), geminiTest: async () => ({ error: "phone uses mistral" }),
    claudeHasKey: async () => false, claudeSetKey: async () => false, claudeChat: async () => ({ error: "nokey" }), claudeTest: async () => ({ error: "phone uses mistral" }),
    cloudStatus: async () => { const s = getSession(); return s ? { linked: true, email: s.email, url: CFG.url } : { linked: false }; },
    cloudLink: async () => ({ ok: false, error: "sign in on the phone's start screen" }),
    cloudUnlink: async () => { localStorage.removeItem(SESSION); localStorage.removeItem(KEY); Sync.reset(); location.reload(); },
    cloudSession: async () => { const c = await conn(); return c ? { ok: true, value: c } : { ok: false, error: "signed out" }; },
  };

  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(noop));
})();
