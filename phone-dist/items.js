// Items: the one kind of thing Kei keeps, modelled on Structured. A task, a
// class, an appointment and an assignment are all items; what makes them
// different is which fields are filled in:
//
//   date              the day it lives on (null = inbox)
//   start + duration  a slot on the timeline
//   due / dueTime     a deadline (one-off ISO datetime / time on each occurrence)
//   rec               recurrence rule (null = one-off)
//
// Recurring items keep per-occurrence state in item.occ[dayKey]; one-off items
// use item.occ["*"]. State = done, missed, reminders, comments, subtask ticks,
// and per-day overrides (label, note, start, duration, due).

const DEFAULT_GROUPS = [
  { id: "home", name: "home", color: "#ffd84a", icon: "home" },
  { id: "uni", name: "uni", color: "#4fc3ff", icon: "study", subs: [
    { id: "anth", name: "ANTH 100", color: "#ff8c1a", icon: "study" },
    { id: "psyc", name: "PSYC 100A", color: "#4fc3ff", icon: "study" },
    { id: "fa", name: "FA 101", color: "#c58cff", icon: "star" },
  ] },
  { id: "overwintered", name: "overwintered", color: "#ff7fb0", icon: "star" },
];

const REPEAT_LABEL = { daily: "every day", weekdays: "weekdays", weekly: "weekly", monthly: "monthly", dates: "on set dates" };
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ------------------------------------------------------------- groups ---
function groupOf(item) {
  const g = M.groups.find((x) => x.id === item.group);
  const s = g?.subs?.find((x) => x.id === item.sub);
  return { g, s };
}
function groupLabel(item) {
  const { g, s } = groupOf(item);
  return g ? (s ? `${g.name} / ${s.name}` : g.name) : "inbox";
}
function itemColor(item) {
  const { g, s } = groupOf(item);
  return item.color || s?.color || g?.color || "#a8a8a8";
}
function itemIcon(item) {
  const { g, s } = groupOf(item);
  return item.icon || s?.icon || g?.icon || "star";
}
// "uni/anth" <-> {group, sub}
const groupKey = (item) => (item.group ? (item.sub ? `${item.group}/${item.sub}` : item.group) : "");
function parseGroupKey(k) {
  const [group = null, sub = null] = (k || "").split("/");
  return { group: group || null, sub: sub || null };
}
function groupOptions() {
  const out = [["", "inbox (no group)"]];
  for (const g of M.groups) {
    out.push([g.id, g.name]);
    for (const s of g.subs || []) out.push([`${g.id}/${s.id}`, `${g.name} / ${s.name}`]);
  }
  return out;
}

// --------------------------------------------------------- recurrence ---
const weekIndex = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  return Math.round(x.getTime() / (7 * 864e5));
};
function occursOn(rec, day) {
  if (!rec) return false;
  if (rec.start && day < rec.start) return false;
  if (rec.end && day > rec.end) return false;
  if (rec.skip?.includes(day)) return false;
  const d = keyToDate(day);
  const wd = d.getDay();
  switch (rec.freq) {
    case "daily": return true;
    case "weekdays": return wd >= 1 && wd <= 5;
    case "weekly":
      if (!(rec.days || []).includes(wd)) return false;
      return (rec.every || 1) === 1 || (weekIndex(d) - weekIndex(keyToDate(rec.start || day))) % rec.every === 0;
    case "monthly": return d.getDate() === keyToDate(rec.start || day).getDate();
    case "dates": return (rec.dates || []).includes(day);
    default: return false;
  }
}
function describeRepeat(rec) {
  if (!rec) return "";
  let s = REPEAT_LABEL[rec.freq] || "";
  if (rec.freq === "weekly") s = `${(rec.every || 1) > 1 ? `every ${rec.every} weeks` : "weekly"} on ${(rec.days || []).map((d) => DAY_NAMES[d]).join(", ")}`;
  if (rec.end) s += ` until ${keyToDate(rec.end).toLocaleDateString([], { month: "short", day: "numeric" })}`;
  return s;
}

// ---------------------------------------------------------- instances ---
// A concrete occurrence of an item, computed on demand (not stored).
function instance(item, key) {
  const o = item.occ?.[key] || {};
  const date = item.rec ? key : item.date || (item.due ? item.due.slice(0, 10) : null);
  const start = o.start ?? item.start ?? null;
  const duration = o.duration ?? item.duration ?? null;
  const due = o.due ?? (item.rec ? (item.dueTime ? `${key}T${item.dueTime}` : null) : item.due ?? null);
  return {
    item, key, date, start, duration, due,
    dueAt: due ? new Date(due).getTime() : null,
    slotAt: date && start ? new Date(`${date}T${start}`).getTime() : null,
    fixed: o.fixed ?? !!item.fixed, // a test day can be fixed even if the class isn't
    label: o.label || "",
    note: o.note || "",
    title: o.label ? `${item.title}: ${o.label}` : item.title,
    s: o, // read-only view; use stateOf() to write
  };
}
function stateOf(inst) {
  const it = inst.item;
  it.occ ||= {};
  return (it.occ[inst.key] ||= {});
}
const instKey = (inst) => `${inst.item.id}|${inst.key}`;
function findInst(id, key) {
  const it = M.items.find((x) => x.id === id);
  return it ? instance(it, key) : null;
}

// every instance whose date falls in [from, to] (day keys, inclusive)
function instancesBetween(from, to) {
  const out = [];
  for (const it of M.items) {
    if (it.rec) {
      for (let d = from; d <= to; d = addDays(d, 1)) if (occursOn(it.rec, d)) out.push(instance(it, d));
    } else {
      const inst = instance(it, "*");
      if (inst.date && inst.date >= from && inst.date <= to) out.push(inst);
    }
  }
  return out;
}
const instancesOn = (day) => instancesBetween(day, day);
const isEvent = (inst) => !!inst.start && !inst.due; // a slot with no deadline: a class, an appointment
const inboxItems = () => M.items.filter((it) => !it.rec && !it.date && !it.due && !it.occ?.["*"]?.done);

// overdue things (Mad), including missed recurring deadlines
function madInstance() {
  for (const it of M.items) {
    for (const [key, o] of Object.entries(it.occ || {})) if (o.missed && !o.done) return instance(it, key);
  }
  return null;
}

// the next thing to show for an item in lists (today's / next occurrence)
function nextInstance(it, from = dayKey()) {
  if (!it.rec) return instance(it, "*");
  for (let i = 0, d = from; i < 400; i++, d = addDays(d, 1)) {
    if (it.rec.end && d > it.rec.end) break;
    if (occursOn(it.rec, d) && !it.occ?.[d]?.done) return instance(it, d);
  }
  return null;
}

function instStatus(inst) {
  const o = inst.s;
  if (o.failed) return "FAILED";
  if (o.lapsed) return "LAPSED";
  if (o.done) return "COMPLETE";
  if (o.missed) return "OVERDUE";
  const now = Date.now();
  if (inst.slotAt && now >= inst.slotAt && now < inst.slotAt + (inst.duration || 0) * 60_000) return "NOW";
  if (inst.dueAt && inst.dueAt - now < 3600e3 && inst.dueAt > now) return "IMMINENT";
  return "PENDING";
}

// --------------------------------------------------------------- crud ---
function newItem(fields = {}) {
  const it = {
    id: uid(),
    num: ++M.taskCounter,
    title: "untitled",
    group: null, sub: null,
    icon: null, color: null,
    notes: "",
    subtasks: [],
    size: "small",
    fixed: false,
    optional: false,
    date: null, start: null, duration: null,
    due: null, dueTime: null,
    rec: null,
    occ: {},
    comments: [],
    createdAt: Date.now(),
    ...fields,
  };
  M.items.push(it);
  return it;
}

// Structured-style edit scopes for recurring items.
// "this": only this occurrence (stored as overrides), "future": split the
// series here, "all": edit the series itself.
function splitSeries(it, key) {
  const copy = JSON.parse(JSON.stringify(it));
  copy.id = uid();
  copy.createdAt = Date.now();
  copy.rec.start = key;
  copy.occ = {};
  copy.comments = [];
  for (const [k, o] of Object.entries(it.occ || {})) if (k >= key) { copy.occ[k] = o; delete it.occ[k]; }
  it.rec.end = addDays(key, -1);
  M.items.push(copy);
  return copy;
}
function deleteItem(it, key = null, scope = "all") {
  if (!it.rec || scope === "all") M.items = M.items.filter((x) => x !== it);
  else if (scope === "this") { (it.rec.skip ||= []).push(key); delete it.occ?.[key]; }
  else if (scope === "future") {
    it.rec.end = addDays(key, -1);
    for (const k of Object.keys(it.occ || {})) if (k >= key) delete it.occ[k];
    if (it.rec.start && it.rec.end < it.rec.start) M.items = M.items.filter((x) => x !== it);
  }
}

// Remove just this occurrence of a repeating item (the rest of the series is
// untouched), or the whole item if it's a one-off.
function removeOccurrence(inst) {
  const it = inst.item;
  if (it.rec) {
    (it.rec.skip ||= []).push(inst.key);
    delete it.occ?.[inst.key];
  } else {
    M.items = M.items.filter((x) => x !== it);
  }
}

// ------------------------------------------------------- what kind? ---
// Used to pick Kei's comment pool and to decide what's worth a heads-up.
function itemKind(it) {
  const t = it.title.toLowerCase();
  if (/\b(test|exam|quiz|midterm|final)\b/.test(t)) return "test";
  if (it.group === "overwintered") return "art";
  if (/\b(appointment|assessment|clinic|doctor|dentist|therapy|zoom)\b|adhd/.test(t)) return "appointment";
  if (it.due || it.dueTime) return "deadline";
  if (it.group === "uni" && it.start && it.rec) return "class";
  if (/\b(games?|circle|playtime|party|hangout|club|night)\b/.test(t)) return "social";
  return "chore";
}

// ------------------------------------------------------ kei's comments ---
// He comments when you add something, when it's coming up, and when you
// finish it. With an AI engine connected the comment is written live; else
// it comes from COMMENTS in lines.js.
const commentQueue = [];
let commentBusy = false;

function addComment(target, text, from = "kei", extra = {}) {
  (target.comments ||= []).push({ from, text, at: Date.now(), ...extra });
  save();
  if (window.Planner) Planner.refreshEditor();
}

async function keiComment(event, inst) {
  commentQueue.push({ event, inst });
  if (commentBusy) return;
  commentBusy = true;
  while (commentQueue.length) {
    const { event, inst } = commentQueue.shift();
    const kind = itemKind(inst.item);
    let text = null;
    if (activeEngine() !== "scripted") text = await aiComment(event, inst, kind);
    const ai = !!text;
    if (!text) text = decorate(sl(L.COMMENTS[event]?.[kind] || L.COMMENTS[event].chore, { task: inst.item.title.toLowerCase() }), "shy");
    // comments on adding go on the item; the rest go on that occurrence
    addComment(event === "add" ? inst.item : stateOf(inst), text, "kei", ai ? { ai: true } : {});
    await sleepMs(activeEngine() === "scripted" ? 50 : 4000); // stay inside free-tier rate limits
  }
  commentBusy = false;
}

async function aiComment(event, inst, kind) {
  const it = inst.item;
  const when = [inst.date && `on ${inst.date}`, inst.start && `at ${inst.start}`, inst.due && `due ${fmtDue(inst.due)}`].filter(Boolean).join(", ");
  const what = { add: "the operator just added this to your list", soon: "this is coming up soon", done: "the operator just finished this" }[event];
  const prompt = `${what}: "${inst.title}" (${groupLabel(it)}, ${kind}${when ? `, ${when}` : ""})${it.notes ? `. notes: ${it.notes}` : ""}${inst.note ? `. today: ${inst.note}` : ""}.
write the short comment you'd leave on it in your log: one sentence, under 20 words, in character for your current stage. no tags.`;
  const res = await llm({ quick: true, system: keiSystemPrompt(), messages: [{ role: "user", content: `${keiContext()}\n\n${prompt}` }] });
  if (!res?.text) return null;
  return sanitize(res.text.replace(/\[\[[^\]]*\]\]/g, "")).slice(0, 220) || null;
}
