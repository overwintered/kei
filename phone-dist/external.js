// Mirror of TickTick (tasks) and Structured (schedule). Kei's TASKS and SCHED
// become read-only views of them; the only thing you do here is check things
// off, which is sent back. Runs on the Mac (it holds the sign-ins); the phone
// sees the same items through cloud sync, and its check-offs get pushed from
// the Mac on the next pass.
//
// Finishing a task in TickTick or Structured gives charge, trust and praise;
// deleting one just removes it quietly.

const External = (() => {
  const POLL = 2 * 60_000;
  const E = () => (M.ext ||= { tt: {}, st: {}, lastSync: 0, cleared: false });
  let busy = false;
  let status = null; // {ticktick:{app,connected}, structured:{connected}}
  let lastError = null;

  const on = () => !!(status?.ticktick.connected || status?.structured.connected);
  // read-only mode: connected here, or (on the phone) items that came from them
  const mirror = () => on() || M.items.some((it) => it.ext);
  const findExt = (source, key) => M.items.find((it) => it.ext?.source === source && it.ext.key === key);
  const pad2 = (n) => String(n).padStart(2, "0");
  const toLocalISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  // which of Kei's groups a TickTick list or a Structured block belongs to
  function groupFor(...texts) {
    const t = texts.filter(Boolean).join(" ").toLowerCase();
    if (/\banth/.test(t)) return { group: "uni", sub: "anth" };
    if (/\bpsyc|\bpsych/.test(t)) return { group: "uni", sub: "psyc" };
    if (/\bfa ?101\b|fine art/.test(t)) return { group: "uni", sub: "fa" };
    if (/overwintered|\bpost(ing)?\b|commission|art\b|draw/.test(t)) return { group: "overwintered", sub: null };
    if (/\buni\b|school|class|course|lecture|study|exam|essay/.test(t)) return { group: "uni", sub: null };
    if (/home|chore|house|clean|laundry|errand|personal|groceries/.test(t)) return { group: "home", sub: null };
    return { group: null, sub: null };
  }

  // ------------------------------------------------------------ ticktick ---
  // tasks are grouped by ticktick list; school is split by the ANTH / PSYC / FA tags
  const SKIP_LISTS = /shopping list|originals direct/i;
  const skipped = (t) => SKIP_LISTS.test(t.projectName || "");
  function ttGroup(t) {
    const list = (t.projectName || "").toLowerCase();
    const tags = (t.tags || []).map((x) => String(x).toLowerCase());
    if (list.includes("overwintered")) return { group: "overwintered", sub: null };
    if (list.includes("personal")) return { group: "home", sub: null };
    if (list.includes("school")) return { group: "uni", sub: ["anth", "psyc", "fa"].find((x) => tags.includes(x)) || null };
    return { group: null, sub: null }; // inbox and anything else
  }
  // kei's groups named and ordered like the ticktick lists
  function matchLists() {
    const names = { overwintered: "Overwintered", home: "Personal", uni: "School" };
    const subs = { anth: "ANTH", psyc: "PSYC", fa: "FA" };
    for (const g of M.groups) {
      if (names[g.id]) g.name = names[g.id];
      for (const x of g.subs || []) if (subs[x.id]) x.name = subs[x.id];
    }
    const order = ["overwintered", "home", "uni"];
    M.groups.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
  }
  function ttFields(t) {
    let due = null;
    if (t.dueDate) {
      const d = new Date(t.dueDate.replace(/(\.\d+)?([+-]\d{2})(\d{2})$/, "$1$2:$3"));
      due = t.isAllDay ? `${toLocalISO(d).slice(0, 10)}T23:59` : toLocalISO(d);
    }
    const g = ttGroup(t);
    return {
      title: t.title || "untitled",
      notes: [t.content, t.desc].filter(Boolean).join("\n").slice(0, 2000),
      due, date: null, start: null, duration: null, rec: null,
      group: g.group, sub: g.sub,
      size: t.priority >= 5 ? "big" : "small",
      subtasks: (t.items || []).map((x) => ({ id: x.id, title: x.title })),
    };
  }
  async function syncTickTick(silent) {
    const r = await host.ext.ttFetch();
    if (!r.ok) throw new Error(r.error);
    const now = new Set();
    matchLists();
    for (const t of r.value.tasks) {
      if (skipped(t)) continue;
      now.add(t.id);
      const f = ttFields(t);
      let it = findExt("tt", t.id);
      const prev = E().tt[t.id];
      if (!it) {
        it = newItem({ ...f, ext: { source: "tt", key: t.id, projectId: t.projectId, repeat: !!t.repeatFlag } });
        if (!silent) keiComment("add", instance(it, "*"));
      } else {
        // a repeating task moved to its next date: the last one was finished
        if (t.repeatFlag && prev?.due && f.due && f.due > prev.due) {
          const o = it.occ?.["*"] || {};
          if (!(o.done && it.ext.pushed)) credit(it); // finished in TickTick (not already credited here)
          it.occ = {}; it.ext.pushed = false;
        }
        if (f.due && it.due && f.due > it.due) for (const o of Object.values(it.occ || {})) Object.assign(o, { missed: false, missedDrain: false, reminded: false });
        Object.assign(it, f);
        it.ext.projectId = t.projectId;
      }
      // checklist ticks
      const o = stateOf(instance(it, "*"));
      o.subDone = Object.fromEntries((t.items || []).filter((x) => x.status === 1 || x.status === 2).map((x) => [x.id, true]));
      E().tt[t.id] = { projectId: t.projectId, due: f.due, title: f.title };
    }
    // gone from the open list: finished or deleted?
    for (const [id, info] of Object.entries(E().tt)) {
      if (now.has(id)) continue;
      const it = findExt("tt", id);
      const q = await host.ext.ttTask({ projectId: info.projectId, id });
      const state = q.ok ? q.value.state : "unknown";
      if (state === "unknown") continue; // try again next pass
      delete E().tt[id];
      if (!it) continue;
      if (state === "completed") {
        const inst = instance(it, "*");
        if (!inst.s.done) completeInstance(inst); // finished in TickTick: charge + praise
      } else {
        M.items = M.items.filter((x) => x !== it); // deleted, or in a list we don't show: quietly, no charge
      }
    }
  }

  // ---------------------------------------------------------- structured ---
  const stKey = (t) => t.id || `${t.recurring_id}|${t.day}`;
  const hm = (h) => `${pad2(Math.floor(h))}:${pad2(Math.round((h % 1) * 60) % 60)}`;
  function stFields(t) {
    const g = groupFor(t.title); // titles only: notes mention all sorts of things
    const timed = !t.is_all_day && t.start_time != null;
    // real classes come in from the calendar; plus anything that happens at a set time with other people
    const courseCode = /\b[A-Z]{2,5} ?\d{3}[A-Z]?\b/.test(t.title) || /^professor:/im.test(t.note || ""); // "ANTH 100: ...", "FA 101 (Tutorial)"
    const calendarOrClass = !!t.external_calendar_id || courseCode || /\b(lecture|tutorial|class|appointments?|doctor|dentist|meeting|exam|test|midterm|final|assessment|consultation|interview|evaluation)\b/i.test(t.title);
    return {
      title: t.title || "untitled",
      notes: t.note || "",
      date: t.day, start: timed ? hm(t.start_time) : null, duration: timed ? Math.max(5, t.duration || 30) : null,
      due: null, rec: null,
      group: g.group, sub: g.sub,
      fixed: timed && calendarOrClass, // classes and calendar events get the loud alert
      subtasks: (t.subtasks || []).map((x, i) => ({ id: x.id || `s${i}`, title: x.title || String(x) })),
    };
  }
  async function syncStructured(silent) {
    const from = addDays(dayKey(), -2), to = addDays(dayKey(), 14);
    // a few days at a time, so we stay under Structured's per-request cap
    const all = [];
    for (let d = from; d <= to; d = addDays(d, 4)) {
      const end = addDays(d, 3) < to ? addDays(d, 3) : to;
      const r = await host.ext.stFetch({ from: d, to: end, timezone: tz() });
      if (!r.ok) throw new Error(r.error);
      all.push(...r.value.tasks);
    }
    const seen = new Set();
    for (const t of all) {
      if (t.is_hidden || t.is_in_inbox) continue;
      const key = stKey(t);
      seen.add(key);
      const f = stFields(t);
      let it = findExt("st", key);
      if (!it) it = newItem({ ...f, ext: { source: "st", key, id: t.id, recurringId: t.recurring_id, day: t.day } });
      else Object.assign(it, f);
      const inst = instance(it, "*");
      if (t.completed_at && !inst.s.done) {
        if (silent || E().st[key]?.completed) Object.assign(stateOf(inst), { done: true, doneAt: new Date(t.completed_at).getTime() });
        else completeInstance(inst); // ticked in Structured: charge + praise
      }
      E().st[key] = { day: t.day, completed: !!t.completed_at };
    }
    // vanished inside the window we asked about: deleted
    for (const [key, info] of Object.entries(E().st)) {
      if (seen.has(key) || info.day < from || info.day > to) continue;
      delete E().st[key];
      const it = findExt("st", key);
      if (it && !it.occ?.["*"]?.done) M.items = M.items.filter((x) => x !== it);
    }
    // forget old days
    for (const [key, info] of Object.entries(E().st)) if (info.day < addDays(dayKey(), -30)) delete E().st[key];
  }

  // ------------------------------------------- check-offs made in Kei ---
  // (on this Mac, or on the phone and synced here) are sent back
  async function pushChecks() {
    for (const it of M.items) {
      if (!it.ext || it.ext.pushed) continue;
      const o = it.occ?.["*"];
      if (!o?.done || o.failed || o.lapsed) continue;
      let r;
      if (it.ext.source === "tt" && status.ticktick.connected) r = await host.ext.ttComplete({ projectId: it.ext.projectId, id: it.ext.key });
      else if (it.ext.source === "st" && status.structured.connected) r = await host.ext.stComplete({ id: it.ext.id, recurringId: it.ext.recurringId, day: it.ext.day });
      else continue;
      if (r?.ok) it.ext.pushed = true;
      else lastError = r?.error || "couldn't send a check-off";
    }
  }

  // a repeating TickTick task done elsewhere: the reward, without closing the item
  function credit(it) {
    const big = it.size === "big";
    addTrust(big ? 6 : 3);
    addCharge(big ? 20 : 8);
    afterCompletion({ big, title: it.title, kind: "task" });
  }

  // first time both are connected: Kei's own old items go (backed up first)
  async function clearLegacy() {
    if (E().cleared || !status.ticktick.connected || !status.structured.connected) return;
    const old = M.items.filter((it) => !it.ext);
    if (old.length) await host.backupItems?.(old);
    M.items = M.items.filter((it) => it.ext);
    E().cleared = true;
  }

  // old mirror items go once they're well in the past (the DONE list keeps its own record)
  function prune() {
    const cutoff = addDays(dayKey(), -14), ago = Date.now() - 14 * 864e5;
    M.items = M.items.filter((it) => {
      if (it.ext?.source === "st") return !(it.date && it.date < cutoff);
      if (it.ext?.source === "tt") { const o = it.occ?.["*"]; return !(o?.done && (o.doneAt || o.failedAt || 0) < ago && !E().tt[it.ext.key]); }
      return true;
    });
  }

  async function sync({ force = false } = {}) {
    if (busy || !host.ext) return;
    if (!force && Date.now() - E().lastSync < POLL) return;
    busy = true;
    try {
      status = await host.ext.status();
      if (!on()) return;
      const first = !E().lastSync;
      lastError = null;
      if (status.ticktick.connected) await syncTickTick(first).catch((e) => (lastError = `ticktick: ${e.message}`));
      if (status.structured.connected) await syncStructured(first).catch((e) => (lastError = `structured: ${e.message}`));
      await pushChecks();
      if (!lastError) await clearLegacy();
      prune();
      E().lastSync = Date.now();
      save();
      renderAll();
    } finally {
      busy = false;
      body.classList.toggle("mirror", mirror());
    }
  }

  async function refreshStatus() {
    if (!host.ext) return null;
    status = await host.ext.status();
    body.classList.toggle("mirror", mirror());
    return status;
  }

  // for the AI
  const promptLine = () => (mirror() ? "their tasks come from ticktick and their schedule from structured; you mirror them. you can't add, move or delete anything yourself: if they want something added or changed, tell them to do it in ticktick or structured. you can mark things done (that syncs back).\n" : "");

  return { mirror, sync, refreshStatus, on: () => on(), status: () => status, error: () => lastError, promptLine, lastSync: () => E().lastSync };
})();
window.External = External;
