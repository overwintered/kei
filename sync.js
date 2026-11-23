// Sync: the same Kei on every device.
//
// His memory (M) is split into small records: one per task, per day of a
// repeating task, per chat message, fact, file, journal entry, mood, migraine,
// setting group... Every field of every record carries the time it was last
// edited. Changes are found by diffing against the last synced state (so the
// rest of the app just edits M and calls save() as usual), queued while
// offline, and pushed to Supabase, where kei_push() merges field by field: the
// later edit of each field wins, nothing else is lost. Devices pull whatever
// changed since they last looked, the moment Realtime says something did,
// whenever they come back online or to the foreground, and once a minute.
//
// Trust is a ledger per device (gains and losses only ever add up), so trust
// earned on two devices while apart is never lost in a merge.

const Sync = (() => {
  const LS = (k) => `kei-sync:${k}`;
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(LS(k))) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch {} };

  const device = lsGet("device", null) || (() => { const d = `${/iPhone|iPad|Android/.test(navigator.userAgent) ? "phone" : "mac"}-${Math.random().toString(36).slice(2, 8)}`; lsSet("device", d); return d; })();
  let shadow = lsGet("shadow", {}); // key -> {field: hash} as last synced
  let pending = lsGet("pending", {}); // key -> {field: ts} edited here, not yet pushed
  let lastSeq = lsGet("seq", 0);
  let conn = null; // {url, anonKey, token, userId}
  let getConn = null;
  let status = { state: "off", at: 0, error: null };
  let diffTimer = null, pushing = null, pulling = null;
  let ws = null, wsTimer = null, wsRef = 0;
  const listeners = [];

  // ----------------------------------------------------------- hashing ---
  function hash(v) {
    const s = JSON.stringify(v ?? null);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const short = (s) => hash(s).slice(0, 8);

  // ------------------------------------------------- M <-> records ---
  // fields that stay on this device
  const LOCAL_KEI = ["caps", "dayGain", "stage", "trust", "trustLedger"];
  const LOCAL_SETTINGS = ["launchAtLogin"];
  const omit = (o, keys) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !keys.includes(k)));
  const chatId = (m) => `${m.at}-${m.from}-${short(m.text)}`;

  function toRecords(M) {
    const r = {};
    const put = (key, doc) => (r[key] = JSON.parse(JSON.stringify(doc)));
    put("settings", omit(M.settings, LOCAL_SETTINGS));
    put("user", M.user || {});
    put("kei", omit(M.kei, LOCAL_KEI));
    put("groups", { list: M.groups });
    put("meta", { taskCounter: M.taskCounter, introDone: M.introDone, createdAt: M.createdAt });
    for (const [dev, v] of Object.entries(M.kei.trustLedger || {})) put(`trust:${dev}`, v); // each device only ever changes its own
    for (const it of M.items) {
      put(`item:${it.id}`, omit(it, ["occ"]));
      for (const [k, o] of Object.entries(it.occ || {})) put(`occ:${it.id}|${k}`, o);
    }
    for (const m of M.chat) put(`chat:${chatId(m)}`, m);
    for (const e of M.log) put(`log:${e.at}-${short(e.title || "")}`, e);
    const mem = M.memory || {};
    put("memmeta", { counter: mem.counter, journalDay: mem.journalDay });
    for (const f of mem.facts || []) put(`fact:${f.id}`, f);
    for (const d of mem.docs || []) put(`doc:${d.id}`, d);
    for (const x of mem.moments || []) put(`moment:${x.id}`, x);
    for (const x of M.moods || []) put(`mood:${x.at}`, x);
    for (const x of M.health?.migraines || []) put(`migraine:${x.id}`, x);
    if (M.glances) {
      put("glancecfg", omit(M.glances, ["log"]));
      for (const x of M.glances.log || []) put(`glance:${x.at}`, x);
    }
    if (M.study) {
      put("studymeta", omit(M.study, ["log", "missed"]));
      for (const x of M.study.log || []) put(`study:${x.at}-${x.kind}`, x);
      for (const x of M.study.missed || []) put(`missed:${short(x.q?.q || "")}`, x);
    }
    return r;
  }

  function fromRecords(r, base) {
    const get = (k) => r[k];
    const list = (prefix, sortBy) => Object.entries(r).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v).sort((a, b) => (a[sortBy] || 0) - (b[sortBy] || 0));
    const doc = { ...base };
    doc.settings = { ...(get("settings") || {}), ...Object.fromEntries(LOCAL_SETTINGS.map((k) => [k, base.settings?.[k]])) };
    doc.user = get("user") || {};
    doc.kei = { ...(get("kei") || {}), ...Object.fromEntries(LOCAL_KEI.map((k) => [k, base.kei?.[k]])) };
    doc.kei.trustLedger = { ...(base.kei?.trustLedger || {}) };
    for (const [k, v] of Object.entries(r)) if (k.startsWith("trust:")) doc.kei.trustLedger[k.slice(6)] = v;
    if (get("groups")?.list) doc.groups = get("groups").list;
    Object.assign(doc, get("meta") || {});
    const occ = {};
    for (const [k, v] of Object.entries(r)) if (k.startsWith("occ:")) { const [id, day] = k.slice(4).split("|"); (occ[id] ||= {})[day] = v; }
    doc.items = list("item:", "createdAt").map((it) => ({ ...it, occ: occ[it.id] || {} }));
    doc.chat = list("chat:", "at");
    doc.log = list("log:", "at");
    doc.memory = { ...(base.memory || {}), ...(get("memmeta") || {}), facts: list("fact:", "createdAt"), docs: list("doc:", "addedAt"), moments: list("moment:", "at") };
    doc.moods = list("mood:", "at");
    doc.health = { ...(base.health || {}), migraines: list("migraine:", "start") };
    if (get("glancecfg") || base.glances) doc.glances = { ...(get("glancecfg") || {}), log: list("glance:", "at") };
    if (get("studymeta") || base.study) doc.study = { ...(get("studymeta") || {}), log: list("study:", "at"), missed: list("missed:", "at") };
    return doc;
  }

  // after a merge: counters only go up, collected things only grow, and two
  // tasks made apart can't keep the same TASK number
  function fixups(doc, before) {
    const nums = new Map();
    let top = Math.max(doc.taskCounter || 0, before.taskCounter || 0, ...doc.items.map((i) => i.num || 0));
    for (const it of [...doc.items].sort((a, b) => a.createdAt - b.createdAt)) {
      if (nums.has(it.num)) it.num = ++top;
      nums.set(it.num, it.id);
    }
    doc.taskCounter = top;
    doc.memory.counter = Math.max(doc.memory.counter || 0, before.memory?.counter || 0, ...doc.memory.facts.map((f) => f.n || 0));
    doc.memory.journalDay = [doc.memory.journalDay, before.memory?.journalDay].filter(Boolean).sort().pop() || null;
    for (const k of ["fragments", "gifts", "sectorsRead", "eggs", "loreFiles"]) doc.kei[k] = [...new Set([...(before.kei?.[k] || []), ...(doc.kei[k] || [])])];
    for (const k of ["bestStreak", "peakStage"]) doc.kei[k] = Math.max(doc.kei[k] || 0, before.kei?.[k] || 0);
    doc.introDone = !!(doc.introDone || before.introDone);
    if (!doc.kei.name && before.kei?.name) doc.kei.name = before.kei.name;
    return doc;
  }

  // --------------------------------------------------- local changes ---
  // compare M with the last synced state; anything different was edited here
  const DEAD = hash(true), ALIVE = hash(false);
  function diff({ initial = false } = {}) {
    if (typeof M === "undefined" || !M) return false;
    const recs = toRecords(M);
    const now = initial ? 1 : Date.now(); // a first sync never overrides what's already in the cloud
    let changed = false;
    const mark = (key, f) => { (pending[key] ||= {})[f] = now; changed = true; };
    for (const [key, doc] of Object.entries(recs)) {
      const sh = (shadow[key] ||= {});
      if (sh._del !== ALIVE) { if (sh._del === DEAD || initial || !Object.keys(sh).length) mark(key, "_del"); sh._del = ALIVE; }
      for (const f of new Set([...Object.keys(doc), ...Object.keys(sh)])) {
        if (f === "_del") continue;
        const h = f in doc ? hash(doc[f]) : undefined;
        if (sh[f] === h) continue;
        mark(key, f);
        if (h === undefined) delete sh[f];
        else sh[f] = h;
      }
    }
    for (const key of Object.keys(shadow)) {
      if (recs[key] || shadow[key]._del === DEAD) continue;
      mark(key, "_del");
      shadow[key] = { _del: DEAD };
    }
    if (changed) { lsSet("shadow", shadow); lsSet("pending", pending); }
    return changed;
  }

  function changed() {
    if (!conn) return;
    clearTimeout(diffTimer);
    diffTimer = setTimeout(() => { if (diff()) push(); }, 1500);
  }

  // ----------------------------------------------------------- network ---
  const headers = () => ({ apikey: conn.anonKey, Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" });
  async function refresh() {
    conn = await getConn();
    return conn;
  }
  async function api(path, opts = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!conn || attempt) await refresh();
      if (!conn) throw new Error("not linked");
      const res = await fetch(`${conn.url}${path}`, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
      if (res.status === 401 && !attempt) continue;
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
      return res.status === 204 ? null : res.json();
    }
  }

  async function push() {
    if (!conn || pushing) return pushing;
    pushing = (async () => {
      try {
        const recs = toRecords(M);
        const keys = Object.keys(pending);
        for (let i = 0; i < keys.length; i += 200) {
          const batch = keys.slice(i, i + 200).map((key) => {
            const ts = { ...pending[key] };
            const cur = recs[key];
            const doc = {};
            for (const f of Object.keys(ts)) if (f !== "_del" && cur && f in cur) doc[f] = cur[f];
            if ("_del" in ts || !cur) { doc._del = !cur; ts._del ||= Date.now(); }
            return { key, doc, ts };
          });
          await api("/rest/v1/rpc/kei_push", { method: "POST", body: JSON.stringify({ recs: batch, dev: device }) });
          // only clear what was sent; edits made while this was in flight stay queued
          for (const b of batch) {
            const p = pending[b.key];
            if (!p) continue;
            for (const [f, t] of Object.entries(b.ts)) if (p[f] === t) delete p[f];
            if (!Object.keys(p).length) delete pending[b.key];
          }
          lsSet("pending", pending);
        }
        setStatus("ok");
      } catch (e) {
        setStatus("error", e);
      }
    })();
    // cleared after the fact: a push with nothing to send finishes before the assignment above
    const mine = pushing;
    mine.then(() => { if (pushing === mine) pushing = null; });
    return mine;
  }

  async function pull() {
    if (!conn || pulling) return pulling;
    pulling = (async () => {
      try {
        let got = [];
        for (;;) {
          const rows = await api(`/rest/v1/kei_records?select=key,doc,ts,seq&seq=gt.${lastSeq}&order=seq.asc&limit=1000`);
          got = got.concat(rows);
          if (rows.length) lastSeq = rows[rows.length - 1].seq;
          if (rows.length < 1000) break;
        }
        if (got.length) apply(got, { first: !Object.keys(shadow).length });
        lsSet("seq", lastSeq);
        setStatus("ok");
        return got.length;
      } catch (e) {
        setStatus("error", e);
        return 0;
      }
    })();
    const mine = pulling;
    mine.then(() => { if (pulling === mine) pulling = null; });
    return mine;
  }

  // fold remote records into M. a field edited here more recently than the
  // remote copy (still pending) keeps the local value and goes out next push
  function apply(rows, { first = false } = {}) {
    if (!first) diff(); // capture anything edited locally first (on a first sync, the cloud's copy comes first)
    const before = JSON.parse(JSON.stringify(M));
    const recs = toRecords(M);
    for (const { key, doc = {}, ts = {} } of rows) {
      const mine = pending[key] || {};
      const newestMine = Math.max(0, ...Object.values(mine));
      const sh = (shadow[key] ||= {});
      if (doc._del) {
        // deleted elsewhere. keep it only if it was edited here after that
        if (newestMine > (ts._del || 0)) { mine._del = Date.now(); pending[key] = mine; continue; }
        delete recs[key];
        delete pending[key];
        shadow[key] = { _del: DEAD };
        continue;
      }
      if ((mine._del || 0) > Math.max(0, ...Object.values(ts))) continue; // deleted here, after their edits
      const rec = { ...(recs[key] || {}) };
      for (const [f, t] of Object.entries(ts)) {
        if (f === "_del" || (mine[f] || 0) > t) continue;
        if (f in doc) { rec[f] = doc[f]; sh[f] = hash(doc[f]); }
        else { delete rec[f]; delete sh[f]; }
      }
      sh._del = ALIVE;
      recs[key] = rec;
    }
    lsSet("shadow", shadow);
    lsSet("pending", pending);
    const next = fixups(fromRecords(recs, M), before);
    for (const fn of listeners) fn(next, before);
  }

  // -------------------------------------------------------- realtime ---
  function listen() {
    if (!conn || ws) return;
    const url = `${conn.url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${conn.anonKey}&vsn=1.0.0`;
    try { ws = new WebSocket(url); } catch { return; }
    const send = (topic, event, payload) => ws?.readyState === 1 && ws.send(JSON.stringify({ topic, event, payload, ref: String(++wsRef) }));
    ws.onopen = () => {
      send("realtime:kei", "phx_join", { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [{ event: "*", schema: "public", table: "kei_records", filter: `user_id=eq.${conn.userId}` }] }, access_token: conn.token });
      clearInterval(wsTimer);
      wsTimer = setInterval(() => { send("phoenix", "heartbeat", {}); if (conn) send("realtime:kei", "access_token", { access_token: conn.token }); }, 25_000);
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.event === "postgres_changes" && m.payload?.data?.record?.device !== device) soon();
    };
    ws.onclose = () => { ws = null; clearInterval(wsTimer); if (conn) setTimeout(listen, 5000 + Math.random() * 5000); };
    ws.onerror = () => ws?.close();
  }
  let soonTimer = null;
  const soon = () => { clearTimeout(soonTimer); soonTimer = setTimeout(pull, 400); };

  // --------------------------------------------------------- lifecycle ---
  function setStatus(state, err = null) {
    status = { state, at: Date.now(), error: err ? String(err.message || err).slice(0, 160) : null };
  }

  async function sync() {
    if (!conn) return;
    diff();
    await push();
    await pull();
    if (Object.keys(pending).length) await push();
  }

  // getConnection: async () => ({url, anonKey, token, userId}) or null
  async function start(getConnection) {
    getConn = getConnection;
    if (!(await refresh())) return false;
    // first sync on this device: take what's in the cloud first, and offer
    // ours as "very old" edits so they only fill gaps
    const first = !Object.keys(shadow).length;
    if (first) {
      lastSeq = 0;
      const got = await pull();
      diff({ initial: got > 0 }); // cloud empty: this device's memory is the original
      await push();
    } else {
      await sync();
    }
    listen();
    setInterval(() => conn && sync(), 60_000);
    window.addEventListener("online", () => sync());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
    return true;
  }
  function stop() {
    conn = null;
    ws?.close();
    ws = null;
  }
  // forget the sync state (unlinking, or switching accounts)
  function reset() {
    shadow = {}; pending = {}; lastSeq = 0;
    lsSet("shadow", shadow); lsSet("pending", pending); lsSet("seq", 0);
  }

  return {
    start, stop, reset, sync, changed, pull, push,
    onRemote: (fn) => listeners.push(fn),
    status: () => ({ ...status, pending: Object.keys(pending).length, device, live: ws?.readyState === 1 }),
    device,
    _internals: { toRecords, fromRecords, fixups, hash },
    _pending: () => pending,
  };
})();
window.Sync = Sync;
