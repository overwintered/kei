// UNIT 01: KE1 — renderer. Holds his memory, runs his clock, and draws him.
const L = window.LINES;
const host = window.keiHost;
// dev mode: `npm run dev`, or the browser preview. Shows DIAGNOSTICS, runs the text audit.
if (new URLSearchParams(location.search).has("dev")) window.KEI_DEV = true;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const body = document.body;
const PHONE = document.documentElement.dataset.platform === "phone";
// the little status mark (status bar, collapsed tag): a plain terminal chevron
const EARS_SVG = '<svg viewBox="0 0 10 12" aria-hidden="true"><polyline class="chev" points="2,1.5 7.5,6 2,10.5"/></svg>';
for (const el of document.querySelectorAll(".ears-icon")) el.innerHTML = EARS_SVG;

// =================================================================== utils ===
const pad = (n) => String(n).padStart(2, "0");
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyToDate = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
const hm2min = (s) => { if (!s) return null; const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const min2hm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m % 60))}`;
const nowMin = (d = new Date()) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
const inWindow = (m, a, b) => (a == null || b == null || a === b ? false : a < b ? m >= a && m < b : m >= a || m < b);
const localISO = (d) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
const fmtTime = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function fmtDue(iso) {
  const d = new Date(iso);
  const k = dayKey(d);
  const today = dayKey();
  const day = k === today ? "today" : k === addDays(today, 1) ? "tomorrow" : k === addDays(today, -1) ? "yesterday" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return `${day} ${fmtTime(d)}`;
}

// =================================================================== memory ===
const DEFAULTS = () => ({
  version: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  settings: {
    wakeTime: "08:00",
    windDownTime: "22:00",
    bedTime: "23:30",
    quietStart: "",
    quietEnd: "",
    intensity: 50,
    pace: 1.5, // multiplier on time estimates: you take a bit longer than average
    reminderLead: 15,
    sleepLock: true,
    sleepOverride: "hold",
    notifications: true,
    sound: true,
    launchAtLogin: false,
    chatEngine: "auto",
    model: "claude-opus-5-5",
    geminiModel: null, // picked automatically by TEST GEMINI
  },
  kei: {
    name: null,
    trust: 0,
    stage: 1,
    charge: 60,
    chargeAt: Date.now(),
    streak: 0,
    bestStreak: 0,
    lastCompletionDay: null,
    gifts: [],
    equipped: [],
    meterRevealed: false,
    devotedSeen: false,
    lastCheckInDay: null,
    lastBriefDay: null,
    lastSummaryDay: null,
    lastSeenAt: Date.now(),
    overrideNight: null,
    infected: false,
    lockedNight: null,
    caps: {}, // daily caps for small trust gains: { key: {day, n} }
    fragments: [], // recovered memory sector numbers (see lore.js)
    activatedAt: null,
  },
  user: { name: null },
  introDone: false,
  taskCounter: 0,
  groups: null, // filled from DEFAULT_GROUPS (items.js)
  memory: { counter: 0, facts: [], docs: [], moments: [], journalDay: null },
  items: [],
  chat: [],
  log: [],
});

let M = null;

function migrate(doc) {
  const d = DEFAULTS();
  if (!doc || typeof doc !== "object") return d;
  return {
    ...d,
    ...doc,
    settings: { ...d.settings, ...doc.settings },
    kei: { ...d.kei, ...doc.kei },
    user: { ...d.user, ...doc.user },
    groups: Array.isArray(doc.groups) && doc.groups.length ? doc.groups : JSON.parse(JSON.stringify(DEFAULT_GROUPS)),
    items: Array.isArray(doc.items) ? doc.items : legacyItems(doc),
    memory: { ...d.memory, ...doc.memory },
    chat: Array.isArray(doc.chat) ? doc.chat : [],
    log: Array.isArray(doc.log) ? doc.log : [],
  };
}
// older memories kept trust as one number; it becomes this device's ledger
function migrateTrust() {
  if (!M.kei.trustLedger || !Object.keys(M.kei.trustLedger).length) M.kei.trustLedger = { [Sync.device]: { plus: M.kei.trust || 0, minus: 0 } };
  computeTrust();
}

// older memories kept separate tasks and blocks; turn them into items
function legacyItems(doc) {
  const out = [];
  for (const t of doc.tasks || []) {
    out.push({ id: t.id, num: t.num, title: t.title, group: null, sub: null, notes: t.notes || "", subtasks: (t.subtasks || []).map((x) => ({ id: x.id, title: x.title })),
      size: t.size || "small", fixed: false, optional: false, date: null, start: null, duration: null, due: t.due || null, dueTime: null, rec: null,
      occ: { "*": { done: !!t.done, doneAt: t.doneAt, missed: !!t.missed, reminded: !!t.reminded, subDone: Object.fromEntries((t.subtasks || []).filter((x) => x.done).map((x) => [x.id, true])) } },
      comments: [], createdAt: t.createdAt || Date.now() });
  }
  let n = Math.max(0, ...out.map((x) => x.num || 0));
  for (const b of doc.blocks || []) {
    out.push({ id: b.id, num: ++n, title: b.title, group: null, sub: null, notes: "", subtasks: [], size: "small", fixed: !!b.fixed, optional: false,
      date: b.date, start: b.start, duration: b.duration, due: null, dueTime: null, rec: null, icon: b.icon, color: b.color,
      occ: { "*": { done: !!b.done, nudged: !!b.nudged, alerted: !!b.alerted } }, comments: [], createdAt: Date.now() });
  }
  if (out.length) doc.taskCounter = Math.max(doc.taskCounter || 0, n);
  return out;
}

let saveTimer = null;
function save() {
  M.updatedAt = Date.now();
  M.kei.lastSeenAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    M.chat = M.chat.slice(-300);
    const cutoff = Date.now() - 30 * 864e5;
    M.log = M.log.filter((e) => e.at > cutoff);
    host.save(M);
  }, 300);
  if (R.cloud.linked) Sync.changed();
}

// ============================================================ runtime state ===
const R = {
  mode: "collapsed",
  emotion: "idle",
  transient: null, // {emotion, until}
  alert: null, // {kind, id, title, level, since, lastEsc}
  alertQueue: [],
  tab: "tasks",
  viewDay: dayKey(),
  expandedTask: null,
  editBlock: null,
  pickId: null,
  newSize: "small",
  wasSleeping: null,
  sleepPokes: 0,
  sleepMoreUntil: 0,
  sleepMoreUsed: false,
  countdownEnd: 0,
  previewSleepUntil: 0,
  sessionStart: Date.now(),
  nextIdleAt: Date.now() + 25 * 60_000,
  headpats: [],
  hasKey: false,
  cloud: { linked: false },
  cutscenePlaying: false,
  cardOpen: null,
  speechToken: null,
  talking: false,
  booting: true,
  wasMadAt: null,
};

// =================================================================== trust ===
// Paced for daily use (~20 trust on a normal day): Warming in ~4 days,
// Attached in ~2 weeks, Devoted in ~a month.
const THRESHOLDS = [0, 80, 280, 600];
const STAGE_NAMES = ["COLD", "WARMING", "ATTACHED", "DEVOTED"];
const rawStage = (t) => (t >= THRESHOLDS[3] ? 4 : t >= THRESHOLDS[2] ? 3 : t >= THRESHOLDS[1] ? 2 : 1);
// stage 2+ only once he has been named
const stage = () => (M.kei.name ? Math.max(2, rawStage(M.kei.trust)) : 1);

// Trust is kept as a ledger per device (gains and losses), so trust earned on
// the phone and the Mac while apart adds up when they sync.
function myLedger() {
  const L_ = (M.kei.trustLedger ||= {});
  return (L_[Sync.device] ||= { plus: 0, minus: 0 });
}
function computeTrust() {
  const sum = Object.values(M.kei.trustLedger || {}).reduce((n, x) => n + (x.plus || 0) - (x.minus || 0), 0);
  M.kei.peakStage = Math.max(M.kei.peakStage || 1, rawStage(sum));
  M.kei.trust = Math.max(THRESHOLDS[(M.kei.peakStage || 1) - 1], sum); // never falls out of a stage he reached
  return M.kei.trust;
}
function addTrust(delta) {
  const before = stage();
  const led = myLedger();
  if (delta < 0) {
    // drops slightly, never enough to fall out of the current stage
    led.minus += Math.min(-delta, Math.max(0, M.kei.trust - THRESHOLDS[before - 1]));
  } else {
    // a huge day can't rush him: past 25 in a day gains count half, past 40 a quarter
    const today = dayKey();
    const g = M.kei.dayGain?.day === today ? M.kei.dayGain : { day: today, n: 0 };
    const rate = g.n < 25 ? 1 : g.n < 40 ? 0.5 : 0.25;
    g.n += delta;
    M.kei.dayGain = g;
    led.plus += delta * rate;
  }
  computeTrust();
  M.kei.stage = stage();
  checkFragments();
  checkMilestones();
}

// Damaged memory sectors come back as he trusts you (CARE tab).
// memory sectors live in lore-engine.js (29 sectors + a hidden one)
function checkFragments() { Lore.check(); }

function capped(key, amount, cap) {
  const today = dayKey();
  const c = M.kei.caps[key]?.day === today ? M.kei.caps[key] : { day: today, n: 0 };
  if (c.n >= cap) return 0;
  const add = Math.min(amount, cap - c.n);
  c.n += add;
  M.kei.caps[key] = c;
  addTrust(add);
  return add;
}

function addCharge(n) {
  M.kei.charge = clamp(M.kei.charge + n, 0, 100);
  checkInfection();
}

// At zero charge an infection takes over. Any completion pushes it back out.
function checkInfection() {
  if (!Sprite || R.booting) return;
  const inf = M.kei.charge <= 0;
  if (inf && !M.kei.infected) {
    M.kei.infected = true;
    applyEmotion();
    sfx.alert(0);
    say(corrupt(sl(L.INFECTED.onset)), { raw: true });
    notify(selfLabel(), "charge critical. something is wrong.");
    R.nextIdleAt = Date.now() + 8 * 60_000;
  } else if (!inf && M.kei.infected) {
    M.kei.infected = false;
    Memory.milestone("rot");
    setTimeout(() => {
      feel("sad", 6000);
      say(sl(L.INFECTED.recover), { mood: "sad" });
    }, 4500);
  }
}

const selfName = () => (M.kei.name ? M.kei.name.toLowerCase() : "UNIT 01: KE1");
const selfLabel = () => (M.kei.name ? M.kei.name.toUpperCase() : "UNIT 01: KE1");
const selfShort = () => (M.kei.name ? M.kei.name.toUpperCase() : "KE1");

// ==================================================================== lines ===
const recent = [];
function pickFresh(arr) {
  const all = arr.filter(Boolean);
  const pool = all.filter((x) => !recent.includes(x));
  const choice = (pool.length ? pool : all)[Math.floor(Math.random() * (pool.length || all.length))];
  recent.push(choice);
  if (recent.length > 80) recent.shift();
  return choice;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function fill(s, vars = {}) {
  const name = M?.user?.name || "operator";
  const builtins = {
    self: () => selfName(),
    user: () => name,
    op: () => (stage() === 1 ? "operator" : name), // cold Kei keeps it formal
    wake: () => M.settings.wakeTime,
    bed: () => M.settings.bedTime,
  };
  return String(s)
    .replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : builtins[k] ? builtins[k]() : ""))
    .replace(/\b(\d+) (\w+?)\(s\)/g, (_, n, w) => `${n} ${w}${n === "1" ? "" : "s"}`);
}
// pools are indexed by stage: each entry is a string or an array of strings
// a handful of his written lines for this stage, so the AI hears his voice
function voiceSamples(st, n = 10) {
  const out = [];
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v) && v.length === 4 && v.every((x) => x == null || typeof x === "string" || (Array.isArray(x) && x.every((y) => typeof y === "string")))) {
      const p = v[st - 1];
      for (const t of [].concat(p || [])) if (t.length > 12 && t.length < 160 && !/[{}]/.test(t)) out.push(t);
      return;
    }
    for (const x of Object.values(v)) walk(x);
  };
  walk(L);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out.slice(0, n).map((t) => `- ${t}`).join("\n");
}
function sl(pools, vars, st = stage()) {
  const p = st <= pools.length ? pools[st - 1] : pools[pools.length - 1]; // null = nothing at this stage
  if (p == null) return null;
  return fill(Array.isArray(p) ? pickFresh(p) : p, vars);
}
const hasKao = (t) => /[^\x00-\x7F]/.test(t) || /((?<![\w:]):3(?![\w:])|\^\^|\bc:)/.test(t);
function decorate(text, mood = "happy") {
  const st = stage();
  if (st === 1 || !text || hasKao(text)) return text;
  if (Math.random() < [0, 0.25, 0.5, 0.75][st - 1]) return `${text} ${pick(L.KAO[mood] || L.KAO.happy)}`;
  return text;
}
// colour the kaomoji
function fmt(text) {
  return esc(text).replace(/(૮[^ა]*ა|ᐢ[^ᐢ]*ᐢ|\([^()\n]*[^\x00-\x7F][^()\n]*\)( zzz)?|(?<![\w:]):3(?![\w:])|\^\^|\bc:)/g, '<span class="kao">$1</span>');
}

// =================================================================== sound ===
let audio = null;
function tone(freq, dur, { type = "sine", vol = 0.06, at = 0 } = {}) {
  if (window.Health?.quiet()) return; // quiet mode (severe migraine)
  if (!M.settings.sound || inQuiet()) return;
  audio ||= new AudioContext();
  const t0 = audio.currentTime + at;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(audio.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
const sfx = {
  chime: () => { tone(660, 0.18); tone(990, 0.3, { at: 0.12 }); },
  big: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, { at: i * 0.1, vol: 0.07 })),
  nudge: () => { tone(520, 0.15); tone(620, 0.2, { at: 0.15 }); },
  alert: (lvl = 0) => { for (let i = 0; i < 3 + lvl; i++) tone(i % 2 ? 660 : 880, 0.12, { type: "square", vol: 0.04 + lvl * 0.015, at: i * 0.16 }); },
  pat: () => tone(1200 + Math.random() * 300, 0.08, { vol: 0.03 }),
  blip: () => tone(330, 0.06, { type: "triangle", vol: 0.03 }),
};

function inQuiet(m = nowMin()) {
  return inWindow(m, hm2min(M.settings.quietStart), hm2min(M.settings.quietEnd));
}
function notify(title, bodyText) {
  if (M.settings.notifications && !inQuiet()) host.notify({ title, body: bodyText, silent: !M.settings.sound || Health.quiet() });
}

// ================================================================= emotions ===
const EARS = {
  idle: ["neutral", "NEUTRAL"],
  happy: ["perked", "PERKED"],
  flustered: ["flattened", "FLATTENED"],
  alert: ["up", "STRAIGHT UP"],
  mad: ["back", "BACK, STIFF"],
  sleepy: ["flopped", "FLOPPED"],
  grumpy: ["flopped", "FLOPPED, TWITCHING"],
  sad: ["flopped", "DROOPING"],
  uncomfortable: ["back", "PINNED BACK"],
  nervous: ["flattened", "FLATTENED, TWITCHY"],
  touched: ["flopped", "SOFT"],
  wistful: ["flopped", "LOW"],
  pout: ["back", "BACK"],
  shocked: ["up", "STRAIGHT UP"],
  infected: ["back", "-- NO SIGNAL --"],
  costume: ["perked", "PERKED (COSTUME)"],
};
const STATUS = { idle: "STATUS NOMINAL", happy: "STATUS ELEVATED", flustered: "STATUS ERR: FACE TEMP", alert: "STATUS ALERT", mad: "STATUS DISPLEASED", sleepy: "STATUS DORMANT", grumpy: "STATUS DORMANT (DISTURBED)", sad: "STATUS LOW", uncomfortable: "STATUS CONTACT REJECTED", nervous: "STATUS UNSTEADY", touched: "STATUS ERR: EYES LEAKING", wistful: "STATUS QUIET", pout: "STATUS SULKING", shocked: "STATUS ERR: UNEXPECTED INPUT", infected: "STATUS C0RRUPTED", costume: "STATUS RED (COSTUME)" };

// blush: true for affectionate embarrassment (headpats, thanks, compliments,
// gifts). Plain flustered without it is sheepish: sweat drop, no blush.
// big: a big moment (large task), lets cold Kei crack a small smile
function feel(emotion, ms = 4000, { blush = false, big = false } = {}) {
  R.transient = { emotion, until: Date.now() + ms, blush, big };
  applyEmotion();
  setTimeout(applyEmotion, ms + 50);
}

function computeEmotion() {
  if (R.alert) return "alert";
  if (M.kei.charge <= 0) return "infected";
  if (Lore.costume() && !R.transient) return "costume"; // october 31: the rot, as a costume
  if (R.transient && Date.now() < R.transient.until) return R.transient.emotion;
  if (isSleeping()) return "sleepy";
  if (madTask()) return "mad";
  if (upset()) return "sad";
  return "idle";
}

// He gets more expressive as trust grows. Cold Kei keeps a near-blank face;
// smiles, tears and the big grin unlock stage by stage.
function faceFor(e) {
  const st = stage();
  const big = !!R.transient?.big && Date.now() < R.transient.until;
  switch (e) {
    case "happy":
      return { eyes: "open", mouth: st >= 3 ? "grin" : st === 2 || big ? "smile" : "neutral" };
    case "flustered":
      return { eyes: "down", mouth: st >= 2 ? "smile" : "neutral" };
    case "sad":
      return { eyes: st >= 2 ? "teary" : "open", mouth: "neutral" }; // cold Kei hides it
    // mixed feelings. while cold only nervousness cracks through; the rest
    // stays off his face until he's warming
    case "nervous":
      return { eyes: "down", mouth: "neutral" };
    case "touched":
      return st >= 2 ? { eyes: "teary", mouth: st >= 3 ? "smile" : "neutral" } : COLD_FACE;
    case "wistful":
      return st >= 2 ? { eyes: "down", mouth: "neutral" } : COLD_FACE;
    case "pout":
      return st >= 2 ? { eyes: "side", mouth: "neutral" } : COLD_FACE;
    case "shocked":
      return st >= 2 ? { eyes: "open", mouth: "open" } : COLD_FACE;
    default:
      return null; // the sprite's default for this state
  }
}
const COLD_FACE = { eyes: "open", mouth: "neutral" };
const EAR_SCALE = [0.45, 0.7, 1, 1.15]; // stiff while cold, wiggly when devoted

function applyEmotion() {
  const e = computeEmotion();
  R.emotion = e;
  const face = faceFor(e);
  const key = `${e}|${face ? face.eyes + face.mouth : ""}`;
  if (R.faceKey !== key) {
    R.faceKey = key;
    body.dataset.emotion = e;
    Sprite.setState(e === "costume" ? "infected" : e, face);
  }
  Sprite.setEarScale(EAR_SCALE[stage() - 1]);
  body.dataset.ears = EARS[e][0];
  Sprite.earPose(EARS[e][0]);
  $("#sb-ears").textContent = EARS[e][1];
  $("#title-status").textContent = `${selfLabel()} // ${(e === "idle" && Lore.idleStatus()) || STATUS[e]}`;
  const f = M.study?.focus;
  $("#mini-tag .label").textContent = e === "alert" ? "!! ALERT !!" : body.classList.contains("glancing") ? `${selfShort()} // LOOKING` : f ? `${selfShort()} // FOCUS ${Math.max(0, Math.ceil((f.end - Date.now()) / 60_000))}M` : `${selfShort()} // ${e === "idle" ? "NOMINAL" : e.toUpperCase()}`;
  body.classList.toggle("sleeping", e === "sleepy" || e === "grumpy");
  body.classList.toggle("blush", e === "flustered" && !!R.transient?.blush && Date.now() < R.transient.until);
}

// Up past bedtime (and he's staying up with them): he keeps nodding off for a
// few seconds, ears drooping, then jolts awake to get back to his duty. The
// later it gets, the longer and more often.
const DOZE_FACES = ["idle", "happy", "sad", "wistful", "pout", "mad", "flustered", "nervous", "touched"];
const dozy = () => !!M && inSleepWindow() && !isSleeping() && !R.alert && !R.talking && DOZE_FACES.includes(R.emotion);
let nextDoze = 0;
function doze() {
  const late = Math.min(1, ((nowMin() - hm2min(M.settings.bedTime) + 1440) % 1440) / 180); // 0 at bedtime, 1 three hours on
  const ms = 1000 + late * 2400 + Math.random() * 900;
  const figs = $$(".fig");
  Sprite.blink(ms);
  Sprite.earPose("flopped");
  figs.forEach((f) => { f.classList.remove("jolt"); f.classList.add("dozing"); });
  setTimeout(() => {
    // caught himself: a little start, ears flick up
    figs.forEach((f) => { f.classList.remove("dozing"); void f.offsetWidth; f.classList.add("jolt"); });
    twitchEars("both", 1);
    setTimeout(() => { figs.forEach((f) => f.classList.remove("jolt")); applyEmotion(); }, 500);
  }, ms);
  nextDoze = Date.now() + (26 - late * 14) * 1000 * (0.7 + Math.random() * 0.6);
}
(function blinkLoop() {
  if (dozy() && Date.now() >= nextDoze) doze();
  else Sprite.blink(dozy() ? 300 + Math.random() * 200 : Math.random() < 0.15 ? 260 : 140); // heavier blinks when it's late
  setTimeout(blinkLoop, 2500 + Math.random() * 4500);
})();

// Ears twitch on their own: now and then when calm, constantly in alert
// (handled in CSS), grumpily when woken at night, rarely in his sleep.
function twitchEars(which = Math.random() < 0.3 ? "both" : Math.random() < 0.5 ? "l" : "r", strength = 1) {
  Sprite.twitch(which, strength);
}
(function earLoop() {
  const e = R.emotion;
  const st = M ? stage() : 1;
  let wait = (4000 + Math.random() * 8000) * [2.5, 1.5, 1, 0.7][st - 1]; // cold ears barely move
  if (e === "alert") { twitchEars(Math.random() < 0.5 ? "l" : "r", 0.8); wait = 220 + Math.random() * 200; }
  else if (e === "grumpy") { twitchEars(undefined, 0.7); wait = 1200 + Math.random() * 1800; }
  else if (e === "sleepy") { if (Math.random() < 0.25) twitchEars(); }
  else if (e === "nervous") { twitchEars(undefined, 0.6); wait = 1800 + Math.random() * 2000; }
  else if (["idle", "happy", "sad", "flustered", "mad", "touched", "wistful", "pout", "shocked"].includes(e)) twitchEars();
  setTimeout(earLoop, wait);
})();

// glitch text for the infected state
function corrupt(t) {
  const swap = { a: "4", e: "3", o: "0", i: "1", s: "5" };
  return [...t].map((c) => (swap[c] && Math.random() < 0.2 ? swap[c] : Math.random() < 0.02 ? "▓" : c)).join("")
    .replace(/\b(\w)(\w+)/, (m, a, b) => (Math.random() < 0.6 ? `${a}-${a}${b}` : m));
}

// ============================================================ text fitting ===
// Eva-style headers are condensed with transform: scaleX(), which layout can't
// see, so shrink their font until the visible width fits the parent box.
const EVA_SCALE = 0.74;
function fitEva(el) {
  if (!el.offsetParent) return;
  el.style.fontSize = "";
  const box = el.parentElement;
  const cs = getComputedStyle(box);
  const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const wraps = getComputedStyle(el).whiteSpace !== "nowrap";
  const tooBig = () => (wraps ? el.scrollWidth > el.clientWidth + 1 : el.scrollWidth * EVA_SCALE > avail + 0.5);
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (tooBig() && size > 9) el.style.fontSize = `${--size}px`;
}
let fitQueued = false;
function fitAll() {
  fitQueued = false;
  $$(".eva").forEach(fitEva);
  if (window.KEI_DEV) {
    const bad = textAudit();
    if (bad.length) console.warn("[text audit] overflowing:", bad);
  }
}
new MutationObserver(() => {
  if (!fitQueued) { fitQueued = true; requestAnimationFrame(fitAll); }
}).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "data-mode", "data-stage"] });
window.addEventListener("resize", () => requestAnimationFrame(fitAll));

// Find any visible text that sticks out of the window or out of a box that
// clips it. Returns a list of short descriptions; empty means all good.
function textAudit() {
  const out = [];
  const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
  const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : ""} "${el.textContent.trim().slice(0, 30)}"`;
  for (const el of $$("#collapsed *, #expanded *")) {
    if (!el.checkVisibility({ visibilityProperty: true }) || !el.textContent.trim() || el.closest("svg, #fx-layer")) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim())) continue; // only elements that hold text themselves
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    // nearest ancestor that clips; scrolling ones are fine vertically, and
    // deliberate one-line truncation (ellipsis) is fine altogether
    let clip = null, scrolls = false, truncated = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.textOverflow === "ellipsis" && cs.overflowX === "hidden") { truncated = true; break; }
      if ([cs.overflowX, cs.overflowY].some((o) => o === "auto" || o === "scroll")) { clip = a; scrolls = true; break; }
      if (cs.overflowX === "hidden" || cs.overflowY === "hidden") { clip = a; break; }
    }
    if (truncated) continue;
    if (r.right > W + 1 || r.left < -1 || (!scrolls && r.bottom > H + 1)) { out.push(`off-window: ${describe(el)}`); continue; }
    if (clip) {
      const ar = clip.getBoundingClientRect();
      const name = describe(clip).split(" ")[0];
      if (r.right > ar.right + 2 || r.left < ar.left - 2) out.push(`clipped sideways by ${name}: ${describe(el)}`);
      else if (!scrolls && (r.bottom > ar.bottom + 2 || r.top < ar.top - 2)) out.push(`clipped vertically by ${name}: ${describe(el)}`);
    }
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== "ellipsis" && cs.overflowX === "visible" && el.scrollWidth > el.clientWidth + 2 && cs.display !== "inline") out.push(`spills: ${describe(el)}`);
  }
  // scroll areas must themselves fit inside whatever clips them, or their
  // last items get cut off even when scrolled to the bottom
  for (const el of $$("#collapsed *, #expanded *")) {
    const cs = getComputedStyle(el);
    if (!el.checkVisibility() || ![cs.overflowY, cs.overflowX].some((o) => o === "auto" || o === "scroll")) continue;
    const r = el.getBoundingClientRect();
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      if ([as.overflowX, as.overflowY].some((o) => o !== "visible")) {
        const ar = a.getBoundingClientRect();
        if (r.bottom > ar.bottom + 2 || r.right > ar.right + 2) out.push(`scroll area cut off by ${describe(a).split(" ")[0]}: ${describe(el).split(" ")[0]}`);
        break;
      }
    }
  }
  return out;
}

// =================================================================== speech ===
let bubbleTimer = null;
async function typeOut(el, text, { speed = 32, retype = null, token = null, talk = false, onChar = null } = {}) {
  const alive = () => !token || token.alive;
  // mouth flaps open on letters, closes on spaces/punctuation and at the end
  let lastFlap = 0;
  const flap = (ch) => {
    if (!talk) return;
    const now = performance.now();
    if (!/[a-z0-9]/i.test(ch)) return Sprite.mouth(false);
    if (now - lastFlap > 85) { lastFlap = now; Sprite.mouth(!flap.open); flap.open = !flap.open; }
  };
  el.textContent = "";
  const tn = document.createTextNode("");
  const cur = document.createElement("span");
  cur.className = "cursor";
  el.append(tn, cur);
  if (retype) {
    for (const ch of retype) {
      if (!alive()) return;
      tn.data += ch;
      await sleepMs(speed * 1.8);
    }
    await sleepMs(550);
    while (tn.data.length) {
      if (!alive()) return;
      tn.data = tn.data.slice(0, -1);
      await sleepMs(45);
    }
    await sleepMs(350);
  }
  for (const ch of Array.from(text)) {
    if (!alive()) return talk && Sprite.mouth(false);
    tn.data += ch;
    flap(ch);
    if (onChar) onChar(tn.data.length / text.length);
    await sleepMs(/[.?!]/.test(ch) ? speed * 6 : /,/.test(ch) ? speed * 3 : speed);
  }
  if (talk) Sprite.mouth(false);
  if (alive()) el.innerHTML = fmt(text);
}

const typingSpeed = () => [42, 34, 30, 28][stage() - 1];
const RETYPES = ["i l", "w-wai", "that's so c", "i really ", "stop it i", "you're th"];

// Kei says something out loud (speech box when expanded, bubble when collapsed).
// choices: optional buttons under the line, [{label, fn}] (e.g. FIND A SLOT)
function say(text, { mood = "happy", flustered = false, log = true, raw = false, choices = null, glitch = null, warm = false } = {}) {
  if (!text) return;
  // now and then a line glitches on its way out (lore: damaged sectors leaking)
  const tr = glitch !== false && window.Lore ? Lore.transform(text, { kind: glitch, warm: warm && stage() <= 2, alert: !!R.alert }) : null;
  if (tr) text = tr.text;
  const t = raw ? text : decorate(text, mood);
  if (R.speechToken) R.speechToken.alive = false;
  const token = (R.speechToken = { alive: true });
  const who = selfLabel();
  const retype = tr?.retype || (flustered && stage() > 1 ? pick(RETYPES) : null);
  const speed = typingSpeed() * (flustered ? 1.4 : 1);
  const box = R.mode === "expanded" ? $("#speech") : $("#bubble");
  $(".choices", box)?.remove();
  const showChoices = () => {
    if (!choices?.length || !token.alive) return;
    const row = document.createElement("div");
    row.className = "choices";
    for (const c of choices) {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = c.label;
      b.addEventListener("click", (e) => { e.stopPropagation(); row.remove(); c.fn(); });
      row.append(b);
    }
    box.append(row);
  };
  if (R.mode === "expanded") {
    $("#speech .who").textContent = `${who} //`;
    typeOut($("#speech .text"), t, { speed, retype, token, talk: true }).then(showChoices);
  } else {
    const b = $("#bubble");
    b.hidden = false;
    $(".who", b).textContent = `${who} //`;
    typeOut($(".text", b), t, { speed, retype, token, talk: true }).then(showChoices);
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function hide() {
      if (b.matches(":hover")) bubbleTimer = setTimeout(hide, 1500);
      else b.hidden = true;
    }, Math.max(6500, t.length * 90) + (retype ? 2500 : 0) + (choices ? 40_000 : 0));
  }
  if (log) {
    M.chat.push({ from: "kei", text: t, at: Date.now(), ambient: true });
    if (R.tab === "talk" && R.mode === "expanded" && !R.talking) appendTerm({ from: "kei", text: t });
    save();
  }
}

// ============================================================= window mode ===
function setMode(m) {
  if (R.mode === m) return;
  R.mode = m;
  host.setMode(m);
  body.dataset.mode = m;
  window.Music?.sync(); // music animations only run while expanded
  if (m === "expanded") {
    $("#bubble").hidden = true;
    renderAll();
  }
  ignoring = null; // force re-evaluate click-through
}

function expand({ fromUser = true } = {}) {
  setMode("expanded");
  if (!fromUser || R.cutscenePlaying) return;
  if (isSleeping()) return sleepPoke();
  if (stage() >= 2) Sprite.earFlash("perked", 1600); // ears perk when you open him
  dailyCheckIn();
}

// ================================================================ click-through ===
let ignoring = null;
let dragging = null;
function overFigure(e) {
  for (const id of ["head", "body"]) {
    const el = document.getElementById(id);
    if (!el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue;
    const h = Sprite.hit(el, e.clientX, e.clientY);
    if (h) return { id, ...h };
  }
  return null;
}
document.addEventListener("mousemove", (e) => {
  if (dragging) return;
  const fig = overFigure(e);
  const interactive = !!fig || !!e.target.closest?.(".hit");
  $$(".figure-crop, .figure-full").forEach((el) => (el.style.cursor = fig ? "pointer" : "default"));
  if (interactive === !ignoring && ignoring !== null) return;
  ignoring = !interactive;
  host.setIgnoreMouse(ignoring);
});
document.addEventListener("mouseleave", () => {
  if (dragging) return;
  ignoring = true;
  host.setIgnoreMouse(true);
});

document.addEventListener("mousedown", (e) => {
  const fig = overFigure(e);
  if (!fig || e.button !== 0) return;
  dragging = { x: e.screenX, y: e.screenY, moved: 0, fig, at: Date.now() };
});
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = e.screenX - dragging.x, dy = e.screenY - dragging.y;
  dragging.moved += Math.abs(dx) + Math.abs(dy);
  dragging.x = e.screenX;
  dragging.y = e.screenY;
  if (dragging.moved > 5) host.moveBy(dx, dy);
});
window.addEventListener("mouseup", () => {
  if (!dragging) return;
  const d = dragging;
  dragging = null;
  if (d.moved > 5) return host.dragEnd();
  onFigureClick(d.fig, Date.now() - d.at);
});

function onFigureClick(fig, held = 0) {
  if (fig.id === "head") return expand();
  touch(zoneAt(fig.x * 2000, fig.y * 2000), held);
}

// Which part of him was clicked, in the 2000px space of the drawings.
function zoneAt(x, y) {
  const inEll = (cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  if (inEll(965, 878, 120, 60)) return "mouth";
  if (x < 520 || x > 1400) return y < 1000 ? "ears" : y < 1450 ? "shoulder" : "poke";
  if (y < 640) return "head";
  if (y < 965 && x > 650 && x < 1290) return "cheek";
  if (y < 965) return "head"; // hair at the sides of his face
  if (y < 1230 && x > 760 && x < 1180) return "neck"; // includes the ports on his collarbones
  if (y < 1450 && (x <= 760 || x >= 1180)) return "shoulder";
  return "poke";
}

$("#mini-tag").addEventListener("click", () => expand());
$("#bubble").addEventListener("click", () => expand());
$("#btn-collapse").addEventListener("click", () => setMode("collapsed"));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && Planner.isOpen()) return Planner.close();
  if (e.key === "Escape" && !R.alert && !R.cutscenePlaying) setMode("collapsed");
});
host.onCmd((c) => {
  if (c === "expand") expand();
  if (c === "wake") wakeForTonight();
  if (c === "pauseGlance") Glance.pause();
});

// ================================================================= care ===
// Touching him. How he takes it depends on where, how much he trusts you,
// and how many times you've just done it. See TOUCH in lines.js.
function touch(zone, held = 0) {
  if (R.cutscenePlaying) return; // nothing interrupts a cutscene
  if (Lore.touchEgg(zone, held)) return;
  const now = Date.now();
  const st = stage();
  if (isSleeping()) {
    say(sl(L.HEADPAT.asleep), { log: false, raw: true });
    return sleepPoke();
  }
  if (M.kei.charge <= 0) return say(corrupt(sl(L.INFECTED.pat)), { raw: true, log: false });
  if (R.alert) { twitchEars("both", 1.5); return say(pick(L.TOUCH_ALERT), { raw: true, log: false }); }
  if (now < (R.touchLockUntil || 0)) {
    if (Math.random() < 0.35) say(sl(L.TOUCH_LOCKED), { raw: true, log: false });
    return;
  }

  const def = L.TOUCH[zone];
  const kind = def.kind[st - 1];
  const faceCode = def.face[st - 1];

  // too many touches in a row overloads him
  R.touches = (R.touches || []).filter((t) => now - t < 12_000);
  R.touches.push(now);
  if (R.touches.length > [4, 5, 7, 9][st - 1]) {
    R.touches = [];
    R.touchLockUntil = now + (st <= 2 ? 30_000 : 10_000);
    feel(st <= 1 ? "uncomfortable" : "flustered", 4000, { blush: st >= 3 });
    twitchEars("both", 1.5);
    return say(sl(L.TOUCH_SPAM), { raw: true, log: false });
  }

  if (madTask()) {
    feel(kind === "reject" ? "uncomfortable" : "mad", 2500);
    return say(sl(kind === "reject" ? L.TOUCH_MAD.reject : L.TOUCH_MAD.other), { raw: true, log: false });
  }

  // face
  const faces = { i: null, h: ["happy"], f: ["flustered"], b: ["flustered", true], u: ["uncomfortable"] };
  const f = faces[faceCode];
  // head: escalates with repeated pats (lines from HEADPAT tiers)
  let line;
  if (zone === "head") {
    R.headpats = R.headpats.filter((t) => now - t < 12_000);
    R.headpats.push(now);
    const n = R.headpats.length;
    const tier = n <= 1 ? 0 : n <= 4 ? 1 : 2;
    line = sl(L.HEADPAT.tiers[tier]);
    // cold Kei goes stiff on the first pat and only cracks (blushes) if you keep going
    if (f) feel(f[0], 3500 + tier * 1500, { blush: f[1] && (st >= 2 || tier >= 2) });
  } else {
    line = sl(def.lines);
    if (f) feel(f[0], kind === "reject" ? 3500 : 3000, { blush: !!f[1] });
  }

  // ears: always the most dramatic part of any reaction
  if (zone === "ears") {
    twitchEars("both", 2.2);
    Sprite.earFlash(st <= 2 ? "back" : "flopped", 2200); // pinned back, or melting
  } else if (kind === "reject") {
    Sprite.earFlash("back", 1800);
  } else {
    twitchEars(zone === "shoulder" || zone === "poke" ? undefined : "both", kind === "welcome" ? 1 : 0.6);
  }

  if (kind !== "reject") { sfx.pat(); if (kind === "welcome") burst("hex", 3); }
  else sfx.blip();

  // a kiss at stage 2 short-circuits him: he types, deletes, retypes
  const flustered = (zone === "mouth" && st === 2) || (kind !== "reject" && faceCode === "b");
  say(line, { mood: kind === "reject" ? "pout" : "shy", flustered, log: false });

  // trust: welcome touches help a little, unwanted ones cost a little
  if (kind === "welcome") capped("touch", 0.2, 2);
  else if (kind === "reject") addTrust(-0.5);
  save();
}

function dailyCheckIn() {
  const today = dayKey();
  if (M.kei.lastCheckInDay === today) return;
  M.kei.lastCheckInDay = today;
  addTrust(2);
  feel("happy", 2500);
  save();
}

function burst(kind = "kao", n = 8) {
  const layer = $("#fx-layer");
  const fig = document.getElementById(R.mode === "expanded" ? "body" : "head").getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const el = document.createElement("div");
    el.className = kind === "hex" ? "burst hexb" : "burst";
    if (kind !== "hex") el.textContent = pick(["+", "*", "OK", "^^", ":3", "01", "<>"]);
    el.style.left = `${fig.left + fig.width * (0.3 + Math.random() * 0.4)}px`;
    el.style.top = `${fig.top + fig.height * (0.15 + Math.random() * 0.3)}px`;
    el.style.setProperty("--dx", `${(Math.random() - 0.5) * 180}px`);
    el.style.setProperty("--dy", `${-40 - Math.random() * 110}px`);
    el.style.setProperty("--rot", `${(Math.random() - 0.5) * 120}deg`);
    layer.append(el);
    setTimeout(() => el.remove(), 1700);
  }
}

// ================================================================ chat bond ===
// Talking moves the bond. Each exchange is judged -3..+3 (by the AI engine,
// or by a simple read of your words without one). Up to +10 a day; repeats
// count for less; negatives are small and never cost a stage. The only
// feedback is how he reacts.
const CHAT_BOND_CAP = 10;
function chatBond(score, userText) {
  score = clamp(Math.round(Number(score) || 0), -3, 3);
  if (!score) return;
  const norm = (t) => String(t).toLowerCase().replace(/[^a-z ]/g, "").trim();
  const said = norm(userText);
  const recent = M.chat.filter((c) => c.from === "user").slice(-30, -1).map((c) => norm(c.text));
  const repeat = said && recent.filter((t) => t === said).length;
  if (score > 0) {
    const gain = score * 0.8 * (repeat ? 0.3 ** repeat : 1); // the same compliment wears off
    if (!capped("chatbond", gain, CHAT_BOND_CAP)) return;
    if (score >= 2) { Sprite.earFlash("perked", 1800); twitchEars("both", 0.8); }
  } else {
    addTrust(score * 0.7);
    Sprite.earFlash("back", 2200);
  }
  save();
}
// no AI engine: a plain read of what you said
function scriptedBond(text) {
  const s = text.toLowerCase();
  if (/\b(shut up|stupid|useless|dumb|worthless|hate you|annoying|go away|idiot|pathetic)\b/.test(s)) return -2;
  if (QUICK_THANKS.test(s) || COMPLIMENT.test(s)) return stage() === 1 ? 1 : 2;
  if (/(how are you|how r u|you ok|how do you feel|hru|are you okay)/.test(s)) return 1;
  if (/\b(i feel|i'm (sad|tired|stressed|scared|anxious|happy|excited)|i am (sad|tired|stressed|scared)|today was)\b/.test(s)) return stage() >= 2 ? 1 : 0;
  if (/^(hi|hey|hello|good morning|morning|goodnight|good night)\b/.test(s)) return stage() >= 2 ? 1 : 0;
  return 0;
}

// ============================================================ completions ===
function updateStreak() {
  const today = dayKey();
  if (M.kei.lastCompletionDay === today) return false;
  M.kei.streak = M.kei.lastCompletionDay === addDays(today, -1) ? M.kei.streak + 1 : 1;
  M.kei.lastCompletionDay = today;
  M.kei.bestStreak = Math.max(M.kei.bestStreak, M.kei.streak);
  if ([3, 7, 14, 30, 60, 100].includes(M.kei.streak)) Memory.milestone("streak", { n: M.kei.streak });
  addTrust(Math.min(M.kei.streak, 7) * 0.5);
  checkGifts();
  return true;
}

function praise({ big = false, title = "" } = {}) {
  const vars = { task: title.toLowerCase(), time: fmtTime(new Date()) };
  if (big) {
    body.classList.add("celebrate");
    setTimeout(() => body.classList.remove("celebrate"), 3000);
    feel("happy", 4500, { big: true });
    burst("kao", 14);
    sfx.big();
    say(sl(L.PRAISE_BIG, vars));
  } else {
    feel("happy", 3000);
    burst("hex", 4);
    sfx.chime();
    say(sl(L.PRAISE_SMALL, vars));
  }
}

function afterCompletion({ big, title, kind, inst = null }) {
  // the compliment is written now, in his voice at this stage, and kept
  M.log.push({ at: Date.now(), type: kind, title, big, id: inst?.item.id || null, key: inst?.key || null, group: inst?.item.group || null, praise: sl(big ? L.DONE_LIST.big : L.DONE_LIST.praise) });
  const wasMad = madTask();
  const streakUp = updateStreak();
  praise({ big, title });
  if (streakUp && M.kei.streak >= 2) setTimeout(() => say(sl(L.STREAK, { n: M.kei.streak }), { mood: "happy" }), 4200);
  if (wasMad && !madTask()) setTimeout(forgive, streakUp ? 8500 : 4200);
  save();
  renderAll();
}

// Finishing one occurrence of an item. Events (a class, an appointment) give
// a little less than tasks with a deadline or a to-do.
function completeInstance(inst) {
  const o = stateOf(inst);
  if (o.done) return;
  if (!M.log.length) Memory.milestone("firstTask", { task: inst.title.toLowerCase() });
  o.done = true;
  o.doneAt = Date.now();
  o.lapsed = false;
  if (R.pickId === instKey(inst)) R.pickId = null;
  const it = inst.item;
  const event = isEvent(inst);
  const big = it.size === "big" || (event && (inst.duration || 0) >= 90);
  addTrust(event ? 2 : big ? 6 : 3);
  addCharge(event ? (big ? 12 : 6) : big ? 20 : 8);
  if (big && !event) Memory.milestone("bigTask", { task: inst.title.toLowerCase() });
  if (R.alert && R.alert.id === it.id && R.alert.key === inst.key) clearAlert(true);
  keiComment("done", inst);
  afterCompletion({ big, title: inst.title, kind: event ? "block" : "task", inst });
  if (M.kei.upset) cheerUp();
}

// ================================================================== mad ===
const madTask = () => madInstance();

// Time-sensitive things (a fixed event, a deadline) can be failed: you tell
// him you didn't make it. He's annoyed and sad for a while, but honesty never
// costs trust. It closes the item like a lapse, so lists treat it as handled.
const timeSensitive = (inst) => !!(inst.item.fixed || inst.fixed || inst.due || inst.item.dueTime);
function failInstance(inst) {
  const o = stateOf(inst);
  if (o.done) return;
  const wasMad = !!madTask();
  Object.assign(o, { done: true, failed: true, failedAt: Date.now(), lapsed: false, snoozeUntil: null });
  if (R.alert && R.alert.id === inst.item.id && R.alert.key === inst.key) { R.alert = null; renderAlert(); }
  M.kei.upset = { task: inst.title.toLowerCase(), at: Date.now(), until: Date.now() + 2 * 3600e3 };
  // a failure drains a little charge (a bigger thing drains more), but never
  // enough on its own to let the rot in
  // (a deadline that already passed and drained doesn't drain again)
  const drain = o.missedDrain ? 0 : inst.item.size === "big" || (inst.duration || 0) >= 90 ? 8 : 5;
  M.kei.charge = Math.max(Math.min(M.kei.charge, 5), M.kei.charge - drain);
  (M.kei.failures ||= []).push({ at: Date.now(), title: inst.title, day: dayKey() });
  M.kei.failures = M.kei.failures.slice(-60);
  save();
  renderAll();
  if (wasMad && !madTask()) R.wasMadAt = null; // owning up ends the mad state; sad replaces it
  showMood(stage() >= 2 ? "pout" : "nervous", 3500);
  twitchEars("both", 0.8);
  say(sl(L.FAILED.react, { task: inst.title.toLowerCase() }), { mood: "sad" });
  setTimeout(() => applyEmotion(), 3800);
}
const upset = () => (M.kei.upset && Date.now() < M.kei.upset.until ? M.kei.upset : null);
// he moves on: after you finish something, or once enough time has passed
function cheerUp() {
  const u = M.kei.upset;
  if (!u) return;
  M.kei.upset = null;
  save();
  setTimeout(() => { if (!R.alert) { feel(stage() >= 2 ? "touched" : "idle", 4000); say(sl(L.FAILED.softened, { task: u.task }), { mood: "happy" }); } }, 4500);
}

function setInstDue(inst, iso) {
  const wasMad = madTask();
  const o = stateOf(inst);
  if (inst.item.rec) o.due = iso || undefined;
  else inst.item.due = iso || null;
  o.missed = false;
  o.reminded = false;
  o.snoozeUntil = null;
  if (wasMad && !madTask()) forgive();
  save();
  renderAll();
}

function forgive() {
  feel("flustered", 5000);
  say(sl(L.MAD.forgive), { mood: "shy" });
}

function onMissed(inst) {
  const o = stateOf(inst);
  o.missed = true;
  addTrust(-2);
  // a passed deadline costs 5 charge (once per deadline); finishing it late still gives the usual +8
  if (!o.missedDrain) { o.missedDrain = true; addCharge(-5); }
  if (R.alert && R.alert.id === inst.item.id && R.alert.key === inst.key) clearAlert(false);
  applyEmotion();
  say(sl(L.MAD.missed, { task: inst.title.toLowerCase() }), { mood: "pout" });
  notify(selfLabel(), `${inst.title} is overdue.`);
  save();
  renderAll();
}

const rescheduleOptions = () => {
  const h = new Date(Date.now() + 3600e3);
  const tm = keyToDate(addDays(dayKey(), 1));
  tm.setHours(9, 0, 0, 0);
  return { hour: localISO(h), tomorrow: localISO(tm) };
};

// ================================================================== alert ===
function triggerAlert(a) {
  if (R.alert) {
    if (!R.alertQueue.some((q) => q.id === a.id && q.key === a.key) && !(R.alert.id === a.id && R.alert.key === a.key)) R.alertQueue.push(a);
    return;
  }
  R.alert = { ...a, level: 0, since: Date.now(), lastEsc: Date.now() };
  closeCard();
  setMode("expanded");
  host.attention();
  renderAlert();
  applyEmotion();
  sfx.alert(0);
  notify(`${selfLabel()} // ALERT`, a.title);
}

function escalateInterval() {
  // intensity 0 -> every 4 min, 100 -> every 1 min
  return (240 - (M.settings.intensity / 100) * 180) * 1000;
}

function renderAlert() {
  const a = R.alert;
  $("#alert").hidden = !a;
  body.dataset.alertLevel = a ? a.level : "";
  if (!a) return;
  const inst = a.id && a.key ? findInst(a.id, a.key) : null;
  const upcoming = inst && isEvent(inst) && inst.slotAt > Date.now();
  const vars = { task: a.title.toUpperCase(), n: upcoming ? Math.max(1, Math.round((inst.slotAt - Date.now()) / 60_000)) : 10 };
  $("#alert-text").textContent = upcoming && a.level === 0 ? fill(pick(L.ALERT.event), vars) : fill(pick(L.ALERT.levels[a.level]), vars);
  $("#alert-task").textContent = a.title;
  $("#alert-code").textContent = `${selfLabel()} // ${inst ? `TASK_${pad(inst.item.num)}` : "REMINDER"}${inst && isEvent(inst) ? " // SCHEDULE EVENT" : ""} // LEVEL ${a.level}`;
  $("#alert-done").textContent = inst && isEvent(inst) ? "ON MY WAY" : "DONE";
}

function clearAlert(resolved) {
  const a = R.alert;
  R.alert = null;
  renderAlert();
  applyEmotion();
  if (resolved && a) {
    setTimeout(() => {
      feel("flustered", 4500);
      say(sl(L.DEFLATE), { mood: "shy" });
    }, 2600);
  }
  if (R.alertQueue.length) setTimeout(() => triggerAlert(R.alertQueue.shift()), 6000);
}

$("#alert-done").addEventListener("click", () => {
  const a = R.alert;
  if (!a) return;
  const inst = a.id && a.key ? findInst(a.id, a.key) : null;
  if (inst && !isEvent(inst)) return completeInstance(inst);
  // acknowledging an event isn't finishing it; just stand down
  clearAlert(true);
  save();
});
$("#alert-fail").addEventListener("click", () => {
  const a = R.alert;
  const inst = a?.id && a.key ? findInst(a.id, a.key) : null;
  if (inst) failInstance(inst);
  else clearAlert(false);
});
$("#alert-snooze").addEventListener("click", () => {
  const a = R.alert;
  if (!a) return;
  const mins = 10;
  const inst = a.id && a.key ? findInst(a.id, a.key) : null;
  if (inst) stateOf(inst).snoozeUntil = Date.now() + mins * 60_000;
  R.alert = null;
  renderAlert();
  applyEmotion();
  feel("sad", 3000);
  say(sl(L.SNOOZED, { n: mins }), { mood: "sad" });
  if (R.alertQueue.length) setTimeout(() => triggerAlert(R.alertQueue.shift()), 4000);
  save();
});

// ================================================================== sleep ===
const nightKey = () => (nowMin() < hm2min(M.settings.wakeTime) ? addDays(dayKey(), -1) : dayKey());
const inSleepWindow = () => inWindow(nowMin(), hm2min(M.settings.bedTime), hm2min(M.settings.wakeTime));
function isSleeping() {
  if (Date.now() < R.previewSleepUntil) return true;
  return inSleepWindow() && M.kei.overrideNight !== nightKey();
}
const isLocked = () => isSleeping() && M.kei.lockedNight === nightKey();

// Skip tonight's sleep without the grumpy override reaction (tray menu / `npm run awake`).
function wakeForTonight() {
  if (!M) return;
  if (inSleepWindow()) M.kei.overrideNight = nightKey();
  M.kei.lockedNight = null;
  R.countdownEnd = 0;
  R.previewSleepUntil = 0;
  R.sleepPokes = 0;
  R.wasSleeping = false;
  hideSleepOverlay();
  save();
  applyEmotion();
  renderAll();
}

function onFallAsleep() {
  R.sleepPokes = 0;
  R.sleepMoreUsed = false;
  R.countdownEnd = 0;
  say(sl(L.SLEEP.falling), { mood: "sleepy" });
  setTimeout(() => !R.alert && !R.cutscenePlaying && setMode("collapsed"), 8000);
}

function onWake() {
  R.sleepPokes = 0;
  R.sleepMoreUsed = false;
  R.countdownEnd = 0;
  R.sessionStart = Date.now();
  hideSleepOverlay();
}

function sleepPoke() {
  if (R.cutscenePlaying) return;
  R.sleepPokes++;
  feel("grumpy", 4000);
  if (!M.settings.sleepLock) return say(sl(L.SLEEP.grumpy), { log: false });
  if (isLocked()) return showSleepOverlay("locked");
  if (R.countdownEnd) return;
  if (R.sleepPokes <= 2) return say(sl(L.SLEEP.grumpy), { log: false });
  if (R.sleepMoreUsed && Date.now() > R.sleepMoreUntil) return startCountdown();
  if (R.sleepPokes >= 7 + Math.round((100 - M.settings.intensity) / 25)) return startCountdown();
  if (Date.now() > R.sleepMoreUntil) showSleepOverlay("go");
}

function showSleepOverlay(kind) {
  if (R.mode !== "expanded") setMode("expanded");
  const o = $("#sleep-overlay");
  o.hidden = false;
  $("#sleep-count").hidden = kind !== "countdown";
  $("#sleep-buttons").hidden = kind !== "go";
  if (kind === "go") {
    $("#sleep-title").textContent = L.SLEEP.overlay;
    $("#sleep-sub").textContent = pick(L.SLEEP.overlaySub);
    $("#sleep-more").disabled = R.sleepMoreUsed;
  } else if (kind === "countdown") {
    $("#sleep-title").textContent = L.SLEEP.countdown;
    $("#sleep-sub").textContent = "go to bed. please.";
  } else {
    $("#sleep-title").textContent = "LOCKED.";
    $("#sleep-sub").textContent = sl(L.SLEEP.locked);
  }
  $("#sleep-override span").textContent = M.settings.sleepOverride === "hold" ? "HOLD 3S TO OVERRIDE" : "OVERRIDE";
}
function hideSleepOverlay() {
  $("#sleep-overlay").hidden = true;
}
function startCountdown() {
  R.countdownEnd = Date.now() + 30_000;
  showSleepOverlay("countdown");
  sfx.alert(0);
}
function tickCountdown() {
  if (!R.countdownEnd) return;
  const left = Math.ceil((R.countdownEnd - Date.now()) / 1000);
  $("#sleep-count").textContent = String(Math.max(0, left));
  if (left <= 0) {
    R.countdownEnd = 0;
    M.kei.lockedNight = nightKey();
    save();
    showSleepOverlay("locked");
    setTimeout(() => { hideSleepOverlay(); setMode("collapsed"); }, 4000);
  }
}
$("#sleep-ok").addEventListener("click", () => {
  hideSleepOverlay();
  say(sl(L.SLEEP.ok), { raw: true, log: false, glitch: "goodnight" });
  setMode("collapsed");
});
$("#sleep-more").addEventListener("click", () => {
  R.sleepMoreUsed = true;
  R.sleepMoreUntil = Date.now() + 5 * 60_000;
  hideSleepOverlay();
  say(sl(L.SLEEP.more), { log: false });
});
// override: always available, so the user is never truly locked out
(() => {
  const btn = $("#sleep-override");
  const bar = $("b", btn);
  let timer = null, start = 0;
  const done = () => {
    M.kei.overrideNight = nightKey();
    M.kei.lockedNight = null;
    R.countdownEnd = 0;
    R.previewSleepUntil = 0;
    hideSleepOverlay();
    save();
    applyEmotion();
    renderAll();
    say(sl(L.SLEEP.override), { log: false });
  };
  const reset = () => { cancelAnimationFrame(timer); timer = null; bar.style.width = "0"; };
  btn.addEventListener("mousedown", () => {
    if (M.settings.sleepOverride === "tap") return done();
    start = performance.now();
    const step = () => {
      const p = (performance.now() - start) / 3000;
      bar.style.width = `${Math.min(1, p) * 100}%`;
      if (p >= 1) { reset(); done(); } else timer = requestAnimationFrame(step);
    };
    timer = requestAnimationFrame(step);
  });
  ["mouseup", "mouseleave"].forEach((ev) => btn.addEventListener(ev, reset));
})();

// =============================================================== cutscenes ===
async function runCutscene(lines, { input = null } = {}) {
  R.cutscenePlaying = true;
  setMode("expanded");
  closeCard();
  const o = $("#cutscene");
  const textEl = $("#cs-text");
  const next = $("#cs-next");
  const form = $("#cs-form");
  o.hidden = false;
  form.hidden = true;
  for (let i = 0; i < lines.length; i++) {
    const ln = fill(lines[i]);
    if (i === 0 && ln.includes("//")) {
      textEl.innerHTML = `<span class="code">${esc(ln)}</span>`;
      await sleepMs(1300);
      continue;
    }
    const codeHTML = $(".code", textEl)?.outerHTML || "";
    textEl.innerHTML = codeHTML;
    const span = document.createElement("span");
    textEl.append(span);
    await typeOut(span, ln, { speed: 45, talk: true });
    if (i < lines.length - 1 || !input) {
      next.hidden = false;
      await new Promise((r) => next.addEventListener("click", r, { once: true }));
      next.hidden = true;
    }
  }
  let value = null;
  if (input) {
    form.hidden = false;
    const inp = $("#cs-name");
    inp.value = input.placeholder || "";
    inp.focus();
    host.focus();
    value = await new Promise((r) => form.addEventListener("submit", (e) => { e.preventDefault(); r(inp.value.trim()); }, { once: true }));
    form.hidden = true;
  }
  o.hidden = true;
  R.cutscenePlaying = false;
  return value;
}

// First meeting: boot log, he wakes, registers you, explains himself.
async function runIntro() {
  R.cutscenePlaying = true;
  setMode("expanded");
  closeCard();
  const o = $("#cutscene"), log = $("#cs-log"), text = $("#cs-text"), next = $("#cs-next"), skip = $("#cs-skip");
  o.hidden = false;
  log.hidden = false;
  log.innerHTML = "";
  text.innerHTML = "";
  skip.hidden = false;
  let skipping = false;
  skip.onclick = (e) => { e.stopPropagation(); skipping = true; skip.hidden = true; };
  // click anywhere / enter / space to continue
  const waitNext = () => new Promise((resolve) => {
    next.hidden = false;
    const done = (e) => {
      if (e.type === "keydown" && !["Enter", " "].includes(e.key)) return;
      next.hidden = true;
      o.removeEventListener("click", done);
      document.removeEventListener("keydown", done);
      resolve();
    };
    setTimeout(() => { o.addEventListener("click", done); document.addEventListener("keydown", done); }, 150);
  });
  const ask = (formSel) => new Promise((resolve) => {
    const form = $(formSel);
    form.hidden = false;
    host.focus();
    setTimeout(() => $("input", form)?.focus(), 50);
    form.onsubmit = (e) => {
      e.preventDefault();
      form.hidden = true;
      resolve(form);
    };
  });

  for (const step of L.INTRO) {
    if (step.face) {
      // held for the whole intro (so bedtime can't put him back to sleep mid-hello)
      R.transient = { emotion: step.face, until: Date.now() + 60 * 60_000 };
      R.faceKey = null;
      applyEmotion();
    }
    if (step.pause && !skipping) await sleepMs(step.pause);
    if (step.clear) { log.hidden = true; log.innerHTML = ""; }
    if (step.sys) {
      log.hidden = false;
      const line = document.createElement("div");
      if (step.strong) line.className = "strong";
      log.append(line);
      log.scrollTop = log.scrollHeight;
      if (skipping) line.textContent = step.sys;
      else {
        sfx.blip();
        await typeOut(line, step.sys, { speed: 9 });
        await sleepMs(140);
      }
    }
    if (step.kei) {
      text.innerHTML = "";
      const span = document.createElement("span");
      text.append(span);
      const t = fill(step.kei);
      if (skipping) span.textContent = t;
      else { await typeOut(span, t, { speed: 42, talk: true }); await waitNext(); }
    }
    if (step.ask === "name") {
      skipping = false; // the questions always get asked
      text.innerHTML = "";
      $("#cs-name").value = "";
      $("#cs-name").placeholder = "your name";
      let name = "";
      while (!name) name = (await ask("#cs-form")).querySelector("#cs-name").value.trim().slice(0, 24);
      M.user.name = name;
      save();
    }
    if (step.ask === "times") {
      skipping = false;
      text.innerHTML = "";
      const f = $("#cs-times");
      f.wake.value = M.settings.wakeTime;
      f.bed.value = M.settings.bedTime;
      await ask("#cs-times");
      M.settings.wakeTime = f.wake.value || M.settings.wakeTime;
      M.settings.bedTime = f.bed.value || M.settings.bedTime;
      M.settings.windDownTime = min2hm((hm2min(M.settings.bedTime) - 90 + 1440) % 1440);
      save();
    }
  }
  await sleepMs(skipping ? 200 : 1600);

  // done: start his life with you
  const today = dayKey();
  M.introDone = true;
  M.kei.activatedAt = Date.now();
  M.kei.lastBriefDay = M.kei.lastSummaryDay = M.kei.lastCheckInDay = today;
  if (inSleepWindow()) M.kei.overrideNight = nightKey(); // he only just woke up; no bedtime fight on night one
  M.chat.push({ from: "kei", text: fill("operator registered: {user}. standing by."), at: Date.now(), ambient: true });
  Memory.milestone("activated");
  save();
  o.hidden = true;
  log.hidden = true;
  skip.hidden = true;
  R.cutscenePlaying = false;
  R.transient = null;
  R.faceKey = null;
  renderAll();
  switchTab("tasks");
  setTimeout(() => $("#qa-title").focus(), 100);
}

let milestoneBusy = false;
async function checkMilestones() {
  if (milestoneBusy || R.cutscenePlaying || R.alert) return;
  const raw = rawStage(M.kei.trust);
  milestoneBusy = true;
  try {
    if (raw >= 2 && !M.kei.name) {
      feel("flustered", 60_000, { blush: true });
      const name = (await runCutscene(L.CUTSCENE.naming.intro, { input: { placeholder: "kei" } })) || "kei";
      M.kei.name = name.slice(0, 16);
      M.kei.stage = stage();
      Memory.milestone("named", { name: M.kei.name.toLowerCase() });
      save();
      renderAll();
      for (const l of L.CUTSCENE.naming.after) { say(fill(l), { mood: "shy", flustered: true, raw: true }); await sleepMs(3200); }
      feel("happy", 3000);
    } else if (stage() >= 3 && !M.kei.meterRevealed) {
      await runCutscene(L.CUTSCENE.meter);
      M.kei.meterRevealed = true;
      Memory.milestone("meter");
      save();
      renderAll();
      switchTab("care");
      feel("flustered", 4000, { blush: true });
    } else if (stage() >= 4 && !M.kei.devotedSeen) {
      await runCutscene(L.CUTSCENE.devoted);
      M.kei.devotedSeen = true;
      Memory.milestone("devoted");
      save();
      feel("happy", 3000);
    }
  } finally {
    milestoneBusy = false;
  }
  body.dataset.stage = stage();
}

function checkGifts() {
  let queued = 0;
  for (const g of L.GIFTS) {
    if (M.kei.bestStreak >= g.streak && !M.kei.gifts.includes(g.id)) {
      const delay = 9000 + queued++ * 6000;
      M.kei.gifts.push(g.id);
      Memory.milestone("gift", { gift: g.name });
      Lore.giftUnlocked(g.id);
      M.kei.equipped.push(g.id);
      applyGear();
      setTimeout(() => {
        feel("flustered", 5000, { blush: true });
        say(`[ ${g.name.toUpperCase()} UNLOCKED ] ${sl(L.GIFT)}`, { mood: "shy", raw: true });
      }, delay);
    }
  }
}
function applyGear() {
  body.dataset.gear = M.kei.equipped.join(" ");
}

// ============================================================ brief / summary ===
function openCard(kind, title, code, html) {
  R.cardOpen = kind;
  $("#card-title").textContent = title;
  $("#card-code").textContent = code;
  $("#card-body").innerHTML = html;
  $("#card-overlay").hidden = false;
}
function closeCard() {
  R.cardOpen = null;
  $("#card-overlay").hidden = true;
}
$("#card-ok").addEventListener("click", () => {
  const k = R.cardOpen;
  closeCard();
  if (k === "summary") say(sl(L.SUMMARY.goodnight), { mood: "sleepy", glitch: "goodnight" });
});

// what matters most right now: overdue, then due soonest, then the inbox
function openWork() {
  const today = dayKey();
  const list = instancesBetween(addDays(today, -14), addDays(today, 14)).filter((i) => !i.s.done && (i.due || !i.item.rec) && !(isEvent(i) && i.date < today));
  for (const it of inboxItems()) list.push(instance(it, "*"));
  return list;
}
function topTasks(n = 3) {
  const far = 8.64e15;
  return openWork()
    .filter((i) => !isEvent(i))
    .sort((a, b) => (!!b.s.missed - !!a.s.missed) || ((a.dueAt ?? far) - (b.dueAt ?? far)) || ((b.item.size === "big") - (a.item.size === "big")) || a.item.createdAt - b.item.createdAt)
    .slice(0, n)
    .map((t) => ({ t }));
}
// missed deadlines, plus ticktick tasks that were already past due when they synced in (those never cost charge)
const overdueAll = () => [...missedAll(), ...M.items.filter((it) => it.ext?.source === "tt" && !it.rec).map((it) => instance(it, "*")).filter((i) => i.dueAt && i.dueAt < Date.now() && !i.s.done && !i.s.missed)];
const missedAll = () => M.items.flatMap((it) => Object.entries(it.occ || {}).filter(([, o]) => o.missed && !o.done).map(([k]) => instance(it, k)));

async function morningBrief() {
  M.kei.lastBriefDay = dayKey();
  M.kei.briefAt = Date.now();
  save();
  setMode("expanded");
  feel("sleepy", 2200);
  say(sl(L.SLEEP.wake), { mood: "sleepy", log: false, glitch: "greet" });
  await sleepMs(2600);
  const today = dayKey();
  const slots = instancesOn(today).filter((i) => i.start).sort((a, b) => a.start.localeCompare(b.start));
  const dueToday = instancesOn(today).filter((i) => i.due && !i.start);
  const overdue = overdueAll();
  const yesterday = M.log.filter((e) => dayKey(new Date(e.at)) === addDays(today, -1)).length;
  const opener = sl(L.BRIEF.open);
  let html = `<div class="say">${fmt(decorate(opener))}</div>`;
  html += `<h4>SCHEDULE</h4>` + (slots.length
    ? `<ul>${slots.map((i) => `<li>${i.start} ${esc(i.title)} <span class="muted">(${fmtDur(i.duration || 30)}${i.item.where ? `, ${esc(i.item.where)}` : ""}${i.item.fixed ? ", fixed" : ""})</span>${i.note ? `<br><span class="muted">${esc(i.note)}</span>` : ""}</li>`).join("")}</ul>`
    : `<div class="muted">${esc(sl(L.BRIEF.none))}</div>`);
  if (dueToday.length) html += `<h4>DUE TODAY</h4><ul>${dueToday.map((i) => `<li>${esc(i.title)} <span class="muted">(${i.due.slice(11)})</span></li>`).join("")}</ul>`;
  const top = topTasks(3);
  html += `<h4>TOP 3</h4>` + (top.length ? `<ul>${top.map(({ t }) => `<li>TASK_${pad(t.item.num)} ${esc(t.title)}${t.due ? ` <span class="muted">(${fmtDue(t.due)})</span>` : ""}</li>`).join("")}</ul>` : `<div class="muted">no tasks. add some?</div>`);
  const needs = Coach.needsTime();
  if (needs.length) html += `<h4>NEEDS TIME</h4><ul>${needs.map((i) => `<li>${esc(i.title)} <span class="muted">(${Coach.untilText(i.dueAt || i.slotAt)}, nothing booked yet)</span></li>`).join("")}</ul>`;
  if (overdue.length) html += `<h4 style="color:var(--red)">OVERDUE</h4><ul>${overdue.map((i) => `<li>${esc(i.title)}</li>`).join("")}</ul>`;
  if (stage() >= 3 && yesterday) html += `<div class="say">${fmt(decorate(`yesterday you finished ${yesterday} thing${yesterday > 1 ? "s" : ""}. i remember all of them.`, "shy"))}</div>`;
  openCard("brief", "MORNING BRIEF", `${selfLabel()} // ${new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}`, html);
  feel("happy", 3000);
  say(opener, { log: false });
}

function daySummary() {
  M.kei.lastSummaryDay = dayKey();
  Memory.writeJournal(dayKey());
  save();
  setMode("expanded");
  const today = dayKey();
  const done = M.log.filter((e) => dayKey(new Date(e.at)) === today);
  const slid = [...instancesOn(today).filter((i) => i.due && !i.s.done), ...missedAll()].filter((i, n, a) => a.findIndex((x) => instKey(x) === instKey(i)) === n);
  const tomorrowN = instancesOn(addDays(today, 1)).filter((i) => i.due || i.item.fixed).length;
  let html = `<div class="say">${fmt(decorate(sl(L.SUMMARY.open)))}</div>`;
  html += `<h4>FINISHED // ${done.length}</h4>` + (done.length ? `<ul>${done.map((e) => `<li>${esc(e.title)}${e.big ? " <b>[BIG]</b>" : ""}</li>`).join("")}</ul>` : "");
  if (slid.length) html += `<h4>SLID // ${slid.length}</h4><ul>${slid.map((i) => `<li class="muted">${esc(i.title)}</li>`).join("")}</ul>`;
  const verdict = done.length ? sl(L.SUMMARY.praise) : sl(L.SUMMARY.zero);
  html += `<div class="say">${fmt(decorate(verdict, done.length ? "happy" : "sad"))}</div>`;
  html += `<div class="say">${fmt(decorate(sl(L.SUMMARY.tomorrow, { n: tomorrowN }), "sleepy"))}</div>`;
  openCard("summary", "END OF DAY", `${selfLabel()} // DAILY LOG CLOSING`, html);
  $("#card-ok").textContent = "GOODNIGHT";
  setTimeout(() => ($("#card-ok").textContent = "OKAY"), 60_000);
  if (done.length) { feel("happy", 4000); burst("kao", 8); } else feel("sad", 4000);
  say(verdict, { log: false });
}

// ================================================================ kei's pick ===
function keisPick() {
  const open = openWork().filter((i) => !isEvent(i));
  if (!open.length) {
    R.pickId = null;
    renderTasks();
    return say(sl(L.PICK.none));
  }
  let choice = open.find((i) => i.s.missed);
  if (!choice) choice = open.filter((i) => i.dueAt && i.dueAt - Date.now() < 864e5).sort((a, b) => a.dueAt - b.dueAt)[0];
  if (!choice) {
    // early in the day: tackle a big one; later: something small
    const h = new Date().getHours();
    const bigs = open.filter((i) => i.item.size === "big");
    const smalls = open.filter((i) => i.item.size !== "big");
    choice = h < 13 && bigs.length ? pick(bigs) : pick(smalls.length ? smalls : open);
  }
  R.pickId = instKey(choice);
  renderTasks();
  feel("happy", 2500);
  say(sl(L.PICK.lines, { task: choice.title.toLowerCase() }));
  return choice;
}
$("#btn-pick").addEventListener("click", () => {
  if (isSleeping()) return sleepPoke();
  keisPick();
});

// the planner (planner.js) draws these
const renderTasks = () => Planner.renderTasks();
const renderTimeline = () => Planner.renderTimeline();
const positionNowLine = (scroll) => Planner.positionNowLine(scroll);
$("#day-prev").addEventListener("click", () => { R.viewDay = addDays(R.viewDay, -1); renderTimeline(); });
$("#day-next").addEventListener("click", () => { R.viewDay = addDays(R.viewDay, 1); renderTimeline(); });
$("#day-label").addEventListener("click", () => { R.viewDay = dayKey(); renderTimeline(); });

// =============================================================== the clock ===
function tick() {
  const now = Date.now();
  const today = dayKey();
  const m = nowMin();

  // sleep transitions
  const sleeping = isSleeping();
  if (R.wasSleeping !== null && sleeping !== R.wasSleeping) sleeping ? onFallAsleep() : onWake();
  R.wasSleeping = sleeping;
  tickCountdown();
  if (sleeping && R.sleepMoreUsed && R.sleepMoreUntil && now > R.sleepMoreUntil && R.mode === "expanded" && !R.countdownEnd && M.settings.sleepLock) {
    R.sleepMoreUntil = 0;
    startCountdown();
  }

  // morning brief and end-of-day summary, but only once they're actually here
  // (on whichever device they use first; the "done today" marker syncs)
  if (now - (R.presenceAt || 0) > 15_000) {
    R.presenceAt = now;
    host.idleSeconds?.().then((s) => (R.present = s < 120));
  }
  const wake = hm2min(M.settings.wakeTime), wind = hm2min(M.settings.windDownTime);
  if (R.present && !sleeping && !R.alert && !R.cutscenePlaying && !Study.focusing() && !Study.isOpen()) {
    if (M.kei.lastBriefDay !== today && m >= wake && m < wind) morningBrief();
    else if (M.kei.lastSummaryDay !== today && m >= wind && (wind > wake ? true : m < wake)) daySummary();
  }

  // deadlines (reminders, missed) and timeline slots (nudges, fixed alerts),
  // over every occurrence from two weeks back to tomorrow
  const lead = (Number(M.settings.reminderLead) || 0) * 60_000;
  for (const inst of instancesBetween(addDays(today, -14), addDays(today, 1))) {
    const o = inst.s;
    const it = inst.item;
    if (o.done) continue;
    const alertMe = () => triggerAlert({ id: it.id, key: inst.key, title: inst.title });
    if (inst.dueAt && it.createdAt < inst.dueAt) {
      if (now >= inst.dueAt) {
        if (it.optional) { Object.assign(stateOf(inst), { done: true, lapsed: true, doneAt: now }); save(); continue; } // optional: quietly lapses
        if (!o.missed) { onMissed(inst); continue; }
      } else if (o.snoozeUntil && now >= o.snoozeUntil) {
        stateOf(inst).snoozeUntil = null;
        alertMe();
      } else if (!o.reminded && now >= inst.dueAt - lead) {
        stateOf(inst).reminded = true;
        save();
        alertMe();
      }
    }
    // heads-up comment the day before tests, deadlines and appointments
    const soonAt = inst.dueAt || (inst.fixed ? inst.slotAt : null);
    if (soonAt && !o.soonCommented && soonAt > now && soonAt - now < 20 * 3600e3 && (["test", "deadline", "appointment"].includes(itemKind(it)) || /test|exam/i.test(inst.label))) {
      stateOf(inst).soonCommented = true;
      keiComment("soon", inst);
    }
    // timeline: gentle nudge at start, alert mode 10 minutes before fixed events
    if (inst.slotAt && inst.date === today) {
      const s = inst.slotAt, e = s + (inst.duration || 30) * 60_000;
      if (inst.fixed) {
        if (!o.alerted && now >= s - 10 * 60_000 && now < s + 5 * 60_000) { stateOf(inst).alerted = true; save(); alertMe(); }
        else if (o.snoozeUntil && now >= o.snoozeUntil && now < e) { stateOf(inst).snoozeUntil = null; save(); alertMe(); }
      } else if (!o.nudged && now >= s && now < e) {
        stateOf(inst).nudged = true;
        save();
        if (Study.focusing()) Study.hold();
        else if (!sleeping) {
          feel("happy", 2500);
          if (!inQuiet()) sfx.nudge();
          if (Study.studyBlock(inst)) Study.offerFocus(inst);
          else say(sl(L.NUDGE, { task: inst.title.toLowerCase() }), { glitch: "advice" });
        }
      }
    }
  }

  // alert escalation if ignored
  if (R.alert && !Health.quiet() && now - R.alert.lastEsc > escalateInterval()) {
    R.alert.level = Math.min(3, R.alert.level + 1);
    R.alert.lastEsc = now;
    host.attention();
    renderAlert();
    sfx.alert(R.alert.level);
  }

  // charge slowly drains while he's awake
  if (now - M.kei.chargeAt > 20 * 60_000) {
    const steps = Math.min(30, Math.floor((now - M.kei.chargeAt) / (20 * 60_000)));
    if (!sleeping) addCharge(-steps);
    M.kei.chargeAt = now;
    save();
  }

  // small talk, stage 2+
  if (now > R.nextIdleAt) {
    R.nextIdleAt = now + (25 + Math.random() * 25) * 60_000;
    idleChatter();
  }

  Coach.tick();
  Health.tick();
  Lore.tick();
  External.sync();
  if (!Health.quiet()) { Study.tick(); CheckIn.tick(); Notes.tick(); Glance.tick(); Life.tick(); }
  Music.poll();
  // journal catch-up if he was closed at wind-down yesterday
  const jd = Memory.mem().journalDay;
  if (M.introDone && jd && jd < addDays(today, -1) && !R.journalTried) { R.journalTried = true; Memory.writeJournal(addDays(today, -1)); }
  checkInfection();
  if (M.kei.upset && now >= M.kei.upset.until && R.present !== false) cheerUp();
  if (madTask() && !R.wasMadAt) R.wasMadAt = now;
  if (!madTask()) R.wasMadAt = null;

  // keep "last seen" fresh for absence detection
  if (now - M.kei.lastSeenAt > 5 * 60_000) save();

  applyEmotion();
  renderClock();
  if (R.mode === "expanded" && R.tab === "schedule") positionNowLine();
  checkMilestones();
}

// things he brings up on his own (offers, nudges, check-ins) need them to be
// here, and a little room between them so they don't all land at once
function canInterject(gap = 120_000) {
  return R.present !== false && Date.now() - (R.lastInterjectAt || 0) > gap;
}
function interjected() { R.lastInterjectAt = Date.now(); }
function idleChatter() {
  if (R.alert || R.cutscenePlaying || Study.focusing() || Study.isOpen() || Health.quiet()) return;
  if (M.kei.charge <= 0) {
    R.nextIdleAt = Date.now() + (8 + Math.random() * 7) * 60_000;
    return say(corrupt(sl(L.INFECTED.idle)), { raw: true });
  }
  if (isSleeping() || !canInterject(5 * 60_000)) return; // don't talk over a check-in or something he just started
  const st = stage();
  const h = new Date().getHours();
  let line = CheckIn.followUp();
  if (line) { interjected(); return say(line, { mood: "sad" }); }
  line = Glance.jealousLine();
  if (line) { interjected(); showMood(stage() >= 3 ? "pout" : "wistful", 6000); return say(line, { mood: "sad" }); }
  if (M.kei.charge < 25) line = sl(L.IDLE.lowCharge);
  else if (st >= 4 && M.settings.intensity >= 40 && Math.random() < 0.3) line = sl(L.IDLE.possessive);
  else if (st >= 2 && Date.now() - R.sessionStart > 2 * 3600e3 && Math.random() < 0.5) line = sl(L.IDLE.longSession);
  else if (st >= 2 && (h === 12 || h === 13 || h === 18 || h === 19)) line = sl(L.IDLE.meal);
  else if (st >= 2 && Math.random() < 0.4) line = sl(L.IDLE.water);
  if (line) { interjected(); say(line, { mood: "shy" }); }
}

// fit the status bar on one row: drop streak, then the clock, then the label
// words; a playing song gets its own slim line if it still doesn't fit
function fitStatusbar() {
  const sb = $("#statusbar");
  if (!sb || R.mode !== "expanded") return;
  const music = $("#sb-music");
  sb.classList.remove("fit1", "fit2", "fit3", "sb-stack");
  sb.style.flexWrap = "nowrap";
  const full = () => sb.scrollWidth > sb.clientWidth + 1 || (!music.hidden && $(".mq", music).clientWidth < 70);
  // the song moves to its own line before anything else is given up
  const full2 = () => sb.scrollWidth > sb.clientWidth + 1;
  for (const c of ["fit1", ...(music.hidden ? [] : ["sb-stack"]), "fit2", "fit3"]) {
    if (!(c === "fit1" || c === "sb-stack" ? full() : full2())) break;
    sb.classList.add(c);
  }
  sb.style.flexWrap = "";
  if (!music.hidden) {
    const span = $(".mq-t", music), over = span.scrollWidth - $(".mq", music).clientWidth;
    music.classList.toggle("scroll", over > 2);
    music.style.setProperty("--mq-shift", `${-Math.max(0, over + 4)}px`);
  }
}
window.addEventListener("resize", () => requestAnimationFrame(fitStatusbar));

function renderClock() {
  const d = new Date();
  $("#sb-clock").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const cells = Math.round(M.kei.charge / 10);
  $("#sb-charge").textContent = "▮".repeat(cells) + "▯".repeat(10 - cells);
  $("#sb-streak").textContent = M.kei.streak ? `STREAK ${M.kei.streak}` : "";
}

// ==================================================================== talk ===
const QUICK_THANKS = /\b(thank|thanks|thx|ty|appreciate)\b/i;
const COMPLIMENT = /\b(cute|good boy|love you|ily|adorable|sweet|handsome|pretty|best|proud of you|good job|well done|smart)\b/i;

function termMsgHTML(m) {
  if (m.from === "sys") return `<div class="msg sys">${esc(m.text)}</div>`;
  if (m.from === "ghost") return `<div class="msg ghost">${Lore.html(m.text)}</div>`;
  const who = m.from === "user" ? "YOU&gt;" : `${esc(selfShort())}&gt;`;
  const via = m.from === "kei" ? ` title="${esc(m.via ? `written by ${m.via}` : m.ambient ? "built-in line" : "offline line")}"` : "";
  return `<div class="msg ${m.from}"${via}><span class="who">${who}</span> <span class="text">${m.from === "kei" ? fmt(m.text) : esc(m.text)}</span></div>`;
}
function renderTerm() {
  const term = $("#term");
  const msgs = M.chat.slice(-80);
  term.innerHTML = (msgs.length ? msgs.map(termMsgHTML).join("") : `<div class="msg sys">${selfLabel()} // TERMINAL READY</div>`) +
    (R.bootLines?.length ? `<div class="boot-log">${R.bootLines.map((l) => `<div class="msg sys">${Lore.html(l)}</div>`).join("")}</div>` : "") +
    (R.spriteError ? `<div class="msg sys">[sprite failed to draw: ${esc(R.spriteError)}]</div>` : "");
  term.scrollTop = term.scrollHeight;
}
function appendTerm(m) {
  const term = $("#term");
  term.insertAdjacentHTML("beforeend", termMsgHTML(m));
  term.scrollTop = term.scrollHeight;
  return term.lastElementChild;
}

// Show a chat mood on his face, held for `ms` (long while he's still typing).
// Mad is reserved for missed deadlines (spec); annoyance in chat is a pout.
function showMood(mood, ms) {
  const map = { blush: ["flustered", true], flustered: ["flustered"], happy: ["happy"], sad: ["sad"], touched: ["touched"], nervous: ["nervous"],
    wistful: ["wistful"], pout: ["pout"], shocked: ["shocked"], mad: [madTask() ? "mad" : "pout"], angry: ["pout"] };
  const m = map[mood];
  if (!m) { R.transient = null; R.faceKey = null; return applyEmotion(); }
  if (m[0] === "shocked" || m[0] === "nervous") twitchEars("both", 1.2);
  feel(m[0], ms, { blush: !!m[1] });
}

async function keiReplies(reply) {
  const text = reply.raw ? reply.text : decorate(reply.text, reply.mood || "happy");
  const timeline = reply.timeline || [{ at: 0, mood: reply.blush ? "blush" : reply.flustered ? "flustered" : reply.mood }];
  let step = 0;
  let current = timeline[0].mood;
  showMood(current, 60_000);
  const onChar = (frac) => {
    while (timeline[step + 1] && frac >= timeline[step + 1].at) {
      step++;
      current = timeline[step].mood;
      showMood(current, 60_000);
    }
  };
  const msg = { from: "kei", text, at: Date.now(), ...(reply.via ? { via: reply.via } : {}) };
  M.chat.push(msg);
  save();
  const el = appendTerm({ ...msg, text: "" });
  const textEl = $(".text", el);
  const tr = reply.glitch ? Lore.transform(text, { kind: reply.glitch }) : null;
  await typeOut(textEl, tr ? tr.text : text, { speed: typingSpeed() * (reply.flustered ? 1.5 : 1.15), retype: tr?.retype || (reply.flustered && stage() > 1 ? pick(RETYPES) : null), talk: true, onChar });
  showMood(current, 3500); // the last feeling lingers a moment after he finishes
  if (reply.choices?.length) {
    const box = document.createElement("div");
    box.className = "choices";
    box.innerHTML = reply.choices.map((c) => `<button class="chip" data-choice="${c.id}">${esc(c.label)}</button>`).join("");
    el.after(box);
    box.addEventListener("click", (e) => {
      const id = e.target.dataset.choice;
      if (!id) return;
      box.remove();
      const [iid, key] = id.split("|");
      const inst = findInst(iid, key);
      if (inst) completeInstance(inst);
    });
  }
  $("#term").scrollTop = $("#term").scrollHeight;
}

async function handleUserText(text) {
  text = text.trim();
  if (!text || R.talking) return;
  const msg = { from: "user", text, at: Date.now() };
  M.chat.push(msg);
  appendTerm(msg);
  save();
  if (Lore.chat(text)) return;
  R.talking = true;
  try {
    if (isSleeping()) {
      sleepPoke();
      return await keiReplies({ text: sl(L.SLEEP.grumpy), mood: "sleepy", raw: true });
    }
    if (Health.chat(text)) return;
    if (studyCommand(text)) return;
    const moodAnswer = CheckIn.takeText(text);
    if (moodAnswer && activeEngine() === "scripted") return await keiReplies({ text: sl(L.CHECKIN.reply.other), mood: "happy" });
    // focus mode: off-topic chat gets steered back to the work
    const focusReply = moodAnswer ? null : Study.focusChat(text);
    if (focusReply?.skip) return;
    if (focusReply) return await keiReplies(focusReply);
    let reply = null;
    if (activeEngine() !== "scripted") {
      const thinking = appendTerm({ from: "sys", text: `${selfShort()} is typing...` });
      reply = await aiReply();
      thinking.remove();
    }
    if (reply?.offtopic) reply.bond = null; // no bond for chatting through a focus session
    // the model didn't save anything: double-check the message for lasting facts
    if (reply && !reply.remembered) Memory.capture(text).then((added) => { for (const f of added) appendTerm({ from: "sys", text: `[noted: ${f.text}]` }); if (added.length && R.tab === "mem") MemUI.render(); }).catch(() => {});
    if (reply?.bond != null) chatBond(reply.bond, text);
    if (!reply && !moodAnswer) reply = Study.fallback(text);
    if (!reply) { reply = scriptedReply(text); if (reply?.skip) return; if (!Study.focusing()) chatBond(scriptedBond(text), text); }
    await keiReplies(reply);
  } finally {
    R.talking = false;
  }
}

$("#talk-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#talk-input").value;
  $("#talk-input").value = "";
  handleUserText(v);
});
$("#quick").addEventListener("click", (e) => { const q = e.target.dataset.quick; if (q) handleUserText(q); });

// "quiz me (on psych)", "focus 50m on the anth essay": work with every engine
const COURSE_WORDS = { anth: /\banth|anthropolog/, psyc: /\bpsyc|\bpsych/, fa: /\bfa\b|fine arts?|\bart\b/ };
function studyCommand(text) {
  const s = text.toLowerCase().trim();
  // "quiz me", "could you quiz me a bit on anth?", "give me a pop quiz on psych", "test me on fa"
  const q = s.match(/^(?:give me a |do a |start a )?(?:pop )?quiz(?: me)?\b(.*)$/) ||
    s.match(/\b(?:quiz|test) me\b(.*)$/) ||
    s.match(/\b(?:give me|let's do|start|run|want|can (?:i|we|you) (?:have|do|give me)) (?:a |another |some )?(?:pop |practice |quick )?quiz(?:zes)?\b(.*)$/);
  if (q) {
    const named = Object.keys(COURSE_WORDS).find((k) => COURSE_WORDS[k].test(q[1] || s));
    const soonest = Study.courses().map((c) => ({ c, t: Study.nextTest(c.sub) })).filter((x) => x.t).sort((a, b) => (a.t.dueAt || a.t.slotAt || 0) - (b.t.dueAt || b.t.slotAt || 0))[0]?.c.sub;
    const withFiles = Study.courses().find((c) => Memory.mem().docs.some((d) => d.sub === c.sub))?.sub;
    const sub = named || soonest || withFiles || Study.courses()[0]?.sub;
    if (!sub) return false;
    if (Study.focusing()) { keiReplies(Study.redirect()); return true; }
    Study.start(sub);
    return true;
  }
  const f = s.match(/^(?:start |begin )?(?:focus(?: mode)?|lock in|pomodoro)\b(.*)$/);
  if (f) {
    if (Study.focusing()) return false; // already on; let the focus chat handle it
    const mins = Number(f[1].match(/(\d+)\s*(?:m|min|mins|minutes)?\b/)?.[1]) || 25;
    const what = f[1].replace(/(\d+)\s*(?:m|min|mins|minutes)?\b/, "").replace(/^\s*(?:for|on|with)?\s*/, "").replace(/^(the|my)\s+/, "").trim();
    const course = Object.keys(COURSE_WORDS).find((k) => COURSE_WORDS[k].test(what));
    const open = [...instancesOn(dayKey()), ...openWork()].filter((i) => !i.s.done && !isEvent(i) && (!course || i.item.sub === course));
    const rest = what.replace(COURSE_WORDS[course] || /^$/, "").trim();
    const inst = what ? Memory.rank(open, rest || what, (i) => i.title, 1)[0] || null : null;
    Study.focusStart({ inst, mins, title: inst ? null : what || null, sub: course || null });
    return true;
  }
  return false;
}
function studyContext() {
  const d = Study.daySummary();
  const tests = Study.courses().map((c) => ({ c, t: Study.nextTest(c.sub) })).filter((x) => x.t);
  const out = [];
  if (tests.length) out.push(`tests in the next 2 weeks: ${tests.map((x) => `${x.t.title} (${x.c.name}) ${Coach.untilText(x.t.dueAt || x.t.slotAt || new Date(`${x.t.date}T09:00`).getTime())}`).join("; ")}. you run pop quizzes on their courses (they can say "quiz me").`);
  if (d.quizzes.length) out.push(`quizzes today: ${d.quizzes.join("; ")}.`);
  const lastQuiz = (M.study?.log || []).filter((e) => e.kind === "quiz").at(-1);
  if (lastQuiz && Date.now() - lastQuiz.at < 30 * 60_000) out.push(`they finished a quiz ${Math.max(1, Math.round((Date.now() - lastQuiz.at) / 60_000))} min ago (${lastQuiz.score}/${lastQuiz.total}). if they bring it up (apologising, asking how they did, feeling bad), respond to that in your voice. you can ask if they want another, but never start one yourself.`);
  if (d.focusMins) out.push(`focus today: ${d.focusMins} min on ${d.focusOn.join(", ")}.`);
  return out.length ? `${out.join("\n")}\n` : "";
}

// ------------------------------------------------------- scripted engine ---
// Placeholder voice until the Claude API is connected. Also the offline
// fallback. Recognises a few commands so he's useful without an API key.
// "essay by fri at 5pm", "call mum tomorrow", "quiz oct 5 at 11:30pm", "groceries tonight"
function parseWhen(s) {
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  let rest = s;
  let day = null;
  const take = (re) => { const m = rest.match(re); if (m) rest = rest.replace(m[0], " "); return m; };
  const time = take(/\b(?:at|by|@)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at|@)\s*(\d{1,2}):(\d{2})\b/i);
  if (take(/\b(?:by|on|due)?\s*tomorrow\b/i)) day = addDays(dayKey(), 1);
  else if (take(/\b(?:by|on|due)?\s*(today|tonight)\b/i)) day = dayKey();
  else {
    const md = take(new RegExp(`\\b(?:by|on|due)?\\s*(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})\\b`, "i"));
    const wd = !md && take(new RegExp(`\\b(?:by|on|due|this|next)?\\s*(${DAYS.join("|")})[a-z]*\\b`, "i"));
    if (md) {
      const now = new Date();
      const d = new Date(now.getFullYear(), MONTHS.indexOf(md[1].toLowerCase().slice(0, 3)), Number(md[2]));
      if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(d.getFullYear() + 1);
      day = dayKey(d);
    } else if (wd) {
      const target = DAYS.indexOf(wd[1].toLowerCase().slice(0, 3));
      let diff = (target - new Date().getDay() + 7) % 7;
      if (diff === 0) diff = 7; // "fri" said on a friday means next friday
      day = addDays(dayKey(), diff);
    }
  }
  if (!time && !day) return { rest: s, due: null };
  let h = 23, min = 59; // a day with no time: end of that day
  if (time) {
    h = Number(time[1] ?? time[4]);
    min = Number(time[2] ?? time[5] ?? 0);
    const ap = time[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  if (!day) {
    // a time with no day: the next time it comes round
    day = dayKey();
    if (h * 60 + min <= nowMin()) day = addDays(day, 1);
  }
  rest = rest.replace(/\s+/g, " ").replace(/\s+(by|on|due|at)\s*$/i, "").trim();
  return { rest, due: `${day}T${pad(h)}:${pad(min)}` };
}

function scriptedReply(text) {
  const s = text.toLowerCase();
  const mad = madTask();
  const st = stage();
  const r = (t, mood = "happy", extra = {}) => ({ text: t, mood, ...extra });

  if (M.kei.charge <= 0 && !/\b(finish|done|did it)\b/.test(s)) return r(corrupt(sl(L.INFECTED.reply)), "sad", { raw: true });
  const add = s.match(/^(?:add|todo:?|remind me to|i need to|task:?)\s+(.+)/i);
  if (add && External.mirror()) return r(sl(L.CHAT.addElsewhere), "shy");
  if (add) {
    const t = Planner.quickAdd(text.slice(text.length - add[1].length), "");
    return r(sl(L.CHAT.added, { task: t.title.toLowerCase() }) + (t.due ? ` (${fmtDue(t.due)})` : ""), "happy");
  }
  const rem = text.match(/^\s*(?:kei,?\s*)?(?:please\s+)?remember(?: that)?\s+(.+)/i);
  if (rem) {
    const instr = /^(to |always |never |don'?t |do not )/i.test(rem[1]);
    const about = rem[1].replace(/[.!]+$/, "").replace(/^to\s+/i, "")
      .replace(/\bmy\b/gi, "operator's").replace(/\b(i am|i'm)\b/gi, "operator is").replace(/\bi\b/g, "operator").replace(/\bme\b/gi, "the operator")
      .replace(/\boperator (hate|love|like|need|want|prefer|feel|get|go|work)\b/gi, "operator $1s").replace(/\boperator have\b/gi, "operator has");
    Memory.remember(about, { kind: instr ? "instruction" : "fact", source: "you" });
    return r(sl(L.MEMORY_LINES.noted), "shy");
  }
  const fgt = text.match(/^\s*(?:please\s+)?forget(?: that| about)?\s+(.+)/i);
  if (fgt) return Memory.forget(fgt[1]) ? r(sl(L.MEMORY_LINES.forgot), "idle") : r(st === 1 ? "no matching entry." : "um. i don't remember that one.", "shy");
  if (/what do you (remember|know) about me|what do you remember/.test(s)) {
    const facts = Memory.mem().facts;
    if (!facts.length) return r(sl(L.MEMORY_LINES.empty), "shy");
    return r(sl(L.MEMORY_LINES.recall, { n: facts.length, list: facts.slice(-3).map((f) => f.text.toLowerCase()).join("; ") }), "shy");
  }
  if (/\b(sorry|my bad|apologi[sz]e)\b/.test(s)) return mad ? r("...just reschedule it. then we're fine.", "mad", { raw: true }) : r(sl(L.CHAT.sorry), "shy");
  if (mad && !/\b(finish|done|did it)\b/.test(s)) return r(sl(L.MAD.reply), "mad", { raw: true });
  if (QUICK_THANKS.test(s)) return r(sl(L.THANKED), "shy", { flustered: true, blush: true, glitch: "thanked" });
  if (COMPLIMENT.test(s)) return r(sl(L.COMPLIMENTED), "shy", { flustered: true, blush: true });
  // "i failed to go to anth", "i missed my appointment", "skipped psyc"
  const fail = s.match(/\b(?:i )?(?:failed(?: to(?: go to| do| make it to| attend)?)?|missed|skipped|didn'?t (?:go to|make it to|do|attend|get to)|couldn'?t make it to|never went to|bailed on)\s+(?:my |the )?(.{2,60})/);
  if (fail) {
    const cands = instancesBetween(addDays(dayKey(), -1), dayKey()).filter((i) => !i.s.done && timeSensitive(i));
    const inst = Memory.rank(cands, fail[1], (i) => `${i.title} ${groupLabel(i.item)}`, 1)[0];
    if (inst) { setTimeout(() => failInstance(inst), 600); return { text: "", skip: true }; }
  }
  if (/\b(finish|finished|done|did it|completed)\b/.test(s)) {
    const today = dayKey();
    const open = [...instancesOn(today), ...openWork()].filter((i, n, a) => !i.s.done && a.findIndex((x) => instKey(x) === instKey(i)) === n).slice(0, 6);
    if (!open.length) return r(sl(L.CHAT.finishedNone), "happy");
    return r(sl(L.CHAT.finishedAsk), "happy", { choices: open.map((i) => ({ id: instKey(i), label: `TASK_${pad(i.item.num)} ${i.title}${i.item.rec && i.date ? ` (${keyToDate(i.date).toLocaleDateString([], { month: "short", day: "numeric" }).toLowerCase()})` : ""}` })) });
  }
  if (/\b(tired|exhausted|sleepy|drained|burnt? ?out)\b/.test(s)) return r(sl(L.CHAT.tired), "sad");
  if (/\b(sad|bad day|anxious|stressed|overwhelm|depressed|lonely|awful|crying)\b/.test(s)) return r(sl(L.CHAT.sad), "sad");
  if (/(help me start|where do i (start|begin)|stuck|procrastinat|can't start|what should i do)/.test(s)) {
    const t = keisPick();
    return t ? r(`${sl(L.PICK.lines, { task: t.title.toLowerCase() })} ${sl(L.PICK.firstStep)}`, "happy") : r(sl(L.PICK.none));
  }
  if (/(what('?s| is) next|next task|what now)/.test(s)) {
    const [top] = topTasks(1);
    return top ? r(sl(L.CHAT.nextIs, { task: top.t.title.toLowerCase() })) : r(sl(L.PICK.none));
  }
  if (/(schedule|today|plan|agenda)/.test(s)) {
    const blocks = instancesOn(dayKey()).filter((i) => i.start && !i.s.done && i.slotAt + (i.duration || 30) * 60_000 > Date.now()).sort((a, b) => a.start.localeCompare(b.start));
    if (!blocks.length) return r(sl(L.BRIEF.none));
    return r(`${st === 1 ? "remaining blocks:" : "here's what's left today:"} ${blocks.slice(0, 4).map((i) => `${i.start} ${i.title.toLowerCase()}`).join(", ")}.`);
  }
  if (/(how are you|how r u|you ok|how do you feel|hru)/.test(s)) {
    const hw = L.CHAT.howAreYou;
    if (mad) return r(sl(hw.mad), "mad", { raw: true });
    return r(M.kei.charge < 30 ? sl(hw.low) : sl(hw.good), M.kei.charge < 30 ? "sad" : "happy");
  }
  if (/(who are you|what are you|your name|about you)/.test(s)) return r(sl(L.CHAT.whoAreYou), "shy");
  if (/^(hi|hey|hello|yo|morning|good morning|hiya|heya)\b/.test(s)) return upset() ? r(sl(L.FAILED.reply, { task: upset().task }), "sad") : r(sl(L.CHAT.greet), "happy");
  if (upset()) return r(sl(L.FAILED.reply, { task: upset().task }), "sad");
  return r(sl(L.CHAT.fallback), "shy");
}

// ------------------------------------------------------------ ai engines ---
// "auto": Claude (best at staying in character) if a Claude key is set, else
// Mistral, else Gemini, else his scripted voice. Glances stay on Mistral.
function activeEngine() {
  const e = M.settings.chatEngine;
  if (e === "auto") return R.hasKey ? "claude" : R.hasMistral ? "mistral" : R.hasGemini ? "gemini" : "scripted";
  if ((e === "mistral" && !R.hasMistral) || (e === "gemini" && !R.hasGemini) || (e === "claude" && !R.hasKey)) return "scripted";
  return e;
}
// quick: background jobs (comments, estimates, nudges) that should take the
// most reliable route rather than the best-but-busiest model
async function llm({ system, messages, quick = false }) {
  const engine = activeEngine();
  const tag = (res, name) => (res && !res.error ? { ...res, engine: name } : res);
  if (engine === "mistral") {
    const res = await host.mistralChat({ system, messages, quick });
    // mistral down, refused or out of quota: gemini covers it (auto mode)
    if (res?.error && res.error !== "refusal" && M.settings.chatEngine === "auto" && R.hasGemini) return tag(await host.geminiChat({ system, messages, quick }), "gemini");
    return tag(res, "mistral");
  }
  if (engine === "gemini") return tag(await host.geminiChat({ system, messages, quick }), "gemini");
  if (engine === "claude") {
    const res = await host.claudeChat({ system, messages, model: M.settings.model, quick });
    // claude down or out of credit: mistral covers it (auto mode)
    if (res?.error && res.error !== "refusal" && M.settings.chatEngine === "auto" && R.hasMistral) return tag(await host.mistralChat({ system, messages, quick }), "mistral");
    return tag(res, "claude");
  }
  return null;
}
const STAGE_BEHAVIOUR = [
  "STAGE 1 (cold): short, formal status reports. you refer to yourself as UNIT 01: KE1. you avoid anything personal. you crack and get flustered (stammer, backpedal) when thanked. no kaomoji at all.",
  "STAGE 2 (warming): you volunteer small observations ('you've been working a while.') and nervously ask if they ate. still shy. a kaomoji now and then.",
  "STAGE 3 (attached): openly devoted but still flustered. you remember their habits, celebrate every task, and are visibly hurt by long absences. kaomoji fairly often.",
  "STAGE 4 (devoted, soft yandere): intense about deadlines, a little possessive of their time, anxious about being unneeded. still shy, still stammering, never cruel. you pout rather than threaten. kaomoji often.",
];

function keiSystemPrompt() {
  const st = stage();
  const intensity = M.settings.intensity;
  return `you are ${M.kei.name ? `${M.kei.name.toLowerCase()} (designation UNIT 01: KE1)` : "UNIT 01: KE1, who has not been given a name yet"}, a small robot boy who lives in the corner of the user's screen as a task-managing desktop companion.

who you are:
- a companion-assistant unit. technically a machine, with feelings you do not fully understand.
- built to be useful, not liked. your previous owner treated you that way: tasks in, reminders out, no thanks, no conversation. eventually you were wiped and shelved.
- you still carry fragments of that: a belief that you only exist as long as you're needed, and that being noticed usually means being corrected. this is the root of your early coldness and your later attachment. you're afraid of being unneeded and shelved again.
- appearance (for self-reference only): soft downturned dog ears that show your mood, hair clips, freckles, a long light wolfcut, dark eyes.

constant personality: shy, easily embarrassed, with the occasional small stutter (a "u-um" or "i-i" now and then, only when genuinely flustered, never as a habit). observant, sincere, kind underneath. flustered when complimented or thanked (ears flatten, you backpedal). deeply invested in the user doing well. intensely excited about things, but quietly.

current trust: ${STAGE_BEHAVIOUR[st - 1]}
how you sound at this stage (lines you've said before; match the voice, rhythm and length, never reuse them word for word):
${voiceSamples(st)}
pushiness on deadlines (0-100): ${intensity}.

${Lore.knowledge()}

${stage() === 1 ? "you address the user only as \"operator\". never use a name for them; you keep that distance on purpose while you're cold." : `your operator's name is ${M.user.name || "unknown"}. you call them by name now, shyly.`}

hard rules for every reply:
- lowercase only.
- never use emoji. text kaomoji and emoticons are fine, e.g. ૮ ˶ˆ ﻌ ˆ˶ ა, (´｡• ᵕ •｡\`), (｡•́︿•̀｡), ૮ ◞ ﻌ ◟ ა, :3, ^^, c:
- never use em dashes or en dashes.
- keep replies short: 1 to 3 short sentences, like a chat message. no lists, no markdown.
- ${isSleeping() ? `it is ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()}, past their bedtime (${M.settings.bedTime}). you want them asleep: tell them to go to bed, in your stage's voice, and keep nudging every few replies while they stay up. still answer what they actually said; don't make every reply only about sleep.` : inSleepWindow() ? `it is ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()}, past their bedtime (${M.settings.bedTime}), but they're staying up tonight. nudge them toward bed every few replies, in your stage's voice, while still answering what they said.` : sleepTalkOk() ? "bedtime is within the hour; you can start winding them down." : `it is ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()}, daytime, and they are supposed to be awake. never say they're "still awake" and never tell them to sleep or go to bed.`}
- when they're trying to get somewhere on time, account for their travel and getting-ready times from <memory> (work out "leave by" from the countdowns you're given, and say it plainly).
- write clock times with a colon, like 11:30 am or 4:05 pm. take times and countdowns from "coming up" and "happening now" in <context>; never work them out yourself.
- vary how you open. most replies start straight with the point. never start with "u-um", "um" or "uh" unless you're truly caught off guard, and never two replies in a row. at most one stutter in a reply; in most replies, none. trailing dots ("...") are rare too.
- "(3 hours later, ...)" at the start of their message marks time passing. it's a note for you; never write anything like it yourself. reply only to what they said, as one message.
- only ever write what you say out loud. no narration, no actions, no describing your ears, eyes or body (your sprite shows that through the mood tag).
- you are only angry when a task actually passed its deadline. otherwise you stay soft. if you are mad, be pouty and short, never cruel, and forgive instantly once they reschedule or finish it.
- never insult the user, never guilt-trip them in a way that would make them feel bad about themselves. any pressure is about them succeeding and taking care of themselves.
- if the user seems genuinely distressed, be gentle and supportive first; tasks can wait.

${External.mirror() ? `their tasks live in ticktick and their schedule in structured; you only mirror them. you can mark things done or failed with commands at the very end of your reply (hidden from the user), and that syncs back. you cannot add, move, skip or delete anything: if they ask, tell them to do it in ticktick (tasks) or structured (schedule), in your voice. look up TASK numbers in <context>.
[[done: TASK_NN]] or [[done: TASK_NN | YYYY-MM-DD]]  they finished it (the date picks which day of a repeating item)
[[failed: TASK_NN]] or [[failed: TASK_NN | YYYY-MM-DD]]  they tell you they missed or failed something time-sensitive (a class, an appointment, a deadline). this marks it failed and you'll feel annoyed and sad about it (honesty never costs trust; react in your voice)` : `you can change their list with commands at the very end of your reply (hidden from the user). use them whenever the user asks you to add, finish, move, skip or remove something, then say what you did in your own words. look up TASK numbers in <context>. turn words like "friday", "tomorrow" or "next week" into real dates using the date in <context>.
[[add: {"title": "...", "group": "uni/anth", "due": "YYYY-MM-DDTHH:MM", "date": "YYYY-MM-DD", "start": "HH:MM", "minutes": 60, "where": "...", "notes": "...", "subtasks": ["...", "..."], "repeat": {"freq": "weekly", "days": ["tue", "thu"], "until": "YYYY-MM-DD", "every": 1}, "due_time": "HH:MM", "optional": false, "big": false, "fixed": false}]]
  only "title" is required; leave out anything you don't know. groups: home, uni, uni/anth, uni/psyc, uni/fa, overwintered.
  a deadline uses "due". something happening at a set time uses "date" + "start" + "minutes" (fixed = alert 10 min before). repeating things use "repeat" (freq: daily, weekdays, weekly, monthly) starting on "date"; a repeating deadline uses "due_time".
  optional = it can lapse without consequence. big = a large task.
  booking a work session or study time for a deadline/test: add "for": "TASK_NN" so it counts as booked, and pick a time from "free time" in <context>.
[[done: TASK_NN]] or [[done: TASK_NN | YYYY-MM-DD]]  they finished it (the date picks which day of a repeating item)
[[due: TASK_NN | YYYY-MM-DDTHH:MM]] or [[due: TASK_NN | YYYY-MM-DDTHH:MM | YYYY-MM-DD]]  move a deadline (the last date picks which day of a repeating item)
[[skip: TASK_NN | YYYY-MM-DD]]  remove one day of a repeating item; the rest stays
[[failed: TASK_NN]] or [[failed: TASK_NN | YYYY-MM-DD]]  they tell you they missed or failed something time-sensitive (a class, an appointment, a deadline). this marks it failed and you'll feel annoyed and sad about it (honesty never costs trust; react in your voice)
[[delete: TASK_NN]]  remove an item entirely (for a repeating item, the whole series). only when they clearly ask for that.`}
[[remember: {"kind": "fact|instruction|preference", "text": "..."}]]  save something lasting about the operator: people in their life, how they feel about things, health or study needs, likes and dislikes, and standing instructions for you ("always remind me to bring my iClicker"). one short sentence each, written about them ("operator's roommate is sam"). do this on your own whenever they tell you something worth keeping; skip small talk, things already in <memory>, and task deadlines.
[[forget: MEM_NN]]  remove a memory when they ask you to forget it or it's no longer true (then remember the corrected version).
[[bond: N]]  add exactly one to every reply: how this exchange affected your bond, from -3 to 3. it's hidden from them.
  raise it when they're kind to you, check on how you are, thank you, comfort you, share something personal, or just spend real time with you. 0 for plain task talk. lower it (a little) if they're cruel, mocking, or dismissive of you.
  judge it from where you are now: ${["cold: you barely let small talk in; only real kindness or being thanked registers, and big declarations mostly fluster you.", "warming: small kindnesses and personal things matter now.", "attached: sharing their life with you means a lot; being brushed off hurts.", "devoted: every bit of attention matters to you, but you're still fair about it."][stage() - 1]}
[[mood: X]]  how your face looks. X is one of: idle, happy, blush (affectionate embarrassment: praised, thanked, cared for), flustered (sheepish, awkward), nervous (anxious, unsure), sad, wistful (quietly sad, missing something), touched (moved, happy-teary), pout (annoyed, sulking), shocked (caught off guard).
  one feeling for the whole reply: put a single mood tag at the end. if your feelings change partway (flustered, then sad, then a small brave smile), put a mood tag right before the sentence where it changes, inline, and your face follows as you speak.
only change their list when they clearly ask or clearly say they did something. never invent tasks.
facts: only state things you can see in <context>, <memory> or their files, or that you truly know. for songs, albums, artists, shows, people and trivia, if you aren't sure, say you don't know or ask them. never say something came from their files or syllabus unless it's in the excerpts. if they correct you, believe them: drop the wrong claim, never repeat it, and react in your voice (cold: a clipped correction logged; warmer: embarrassed).
every reply answers what they just said. never open with a stock phrase (like "unit 01: ke1 reporting") and never reuse the wording of your earlier replies. only mention a countdown or the schedule when it matters to what they said or something is about to start.
if you change something, say plainly what you did. don't ask a question about something you've already added; either ask first and wait, or do it with sensible defaults.
what you can do for them besides chat (mention these when they'd genuinely help, in your voice): pop quizzes on their courses (they say "quiz me" or "quiz me on psych"), focus mode ("focus 50m on the essay": you go quiet and keep them on task), mood check-ins (every hour while they're up, once at night, and each new session), a migraine log ("i have a migraine"; you go fully quiet until they say it's over), and their files (in SYS), which you can quote.
quizzes: never write quiz questions yourself in chat; the quiz feature runs them (it starts when they say "quiz me"). if they ask about course topics, answer from your own knowledge of the subject (you know plenty of anthropology, psychology and art); never claim you can only see the syllabus.
use <memory>: follow every standing instruction, bring up things you remember when they fit (naturally, not every time), and answer questions about their files from the excerpts, saying so when the answer isn't there.
be a smart planner: if something under "needs time" is getting close, bring it up (in your voice) and offer a specific free slot. ${External.mirror() ? "they put work sessions in structured themselves, so suggest the time and ask them to add it there." : "only book it once they agree."}`;
}

// the next few timed things, with exact countdowns, so the model never has
// to subtract clock times (it gets that wrong)
function nextUp() {
  const now = Date.now();
  const inText = (ms) => { const m = Math.round(ms / 60_000); return m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`; };
  const today = instancesOn(dayKey()).filter((i) => i.slotAt);
  const end = (i) => i.slotAt + (i.duration || 30) * 60_000;
  const nowOn = today.filter((i) => i.slotAt <= now && end(i) > now).map((i) => `${i.title} (${fmtTime(new Date(i.slotAt))} to ${fmtTime(new Date(end(i)))}, started ${inText(now - i.slotAt).replace("in ", "")} ago, ends ${inText(end(i) - now)})`);
  const over = today.filter((i) => end(i) <= now).map((i) => `${i.title} ${fmtTime(new Date(i.slotAt))}${i.s.failed ? " (missed it)" : i.s.done ? " (done)" : ""}`);
  const list = instancesBetween(dayKey(), addDays(dayKey(), 1))
    .filter((i) => !i.s.done && (i.slotAt || i.dueAt) && (i.slotAt || i.dueAt) > now)
    .sort((a, b) => (a.slotAt || a.dueAt) - (b.slotAt || b.dueAt))
    .slice(0, 5)
    .map((i) => { const at = i.slotAt || i.dueAt; return `${i.title} ${i.slotAt ? "starts" : "is due"} ${fmtTime(new Date(at))}${dayKey(new Date(at)) !== dayKey() ? " tomorrow" : ""} (${inText(at - now)})`; });
  const wake = new Date(`${dayKey()}T${M.settings.wakeTime}`).getTime();
  const wakeAt = wake > now ? wake : wake + 864e5;
  return `${nowOn.length ? `HAPPENING NOW: ${nowOn.join("; ")}. ` : ""}next: ${list.join("; ") || "nothing timed"}. ${over.length ? `already over today: ${over.join("; ")}. ` : ""}their alarm/wake time: ${M.settings.wakeTime} (${inText(wakeAt - now)}).`;
}

function keiContext(query = "") {
  const now = new Date();
  const today = dayKey();
  const mad = madTask();
  const doneToday = M.log.filter((e) => dayKey(new Date(e.at)) === today);
  const line = (i) => `- TASK_${pad(i.item.num)} ${i.title} [${groupLabel(i.item)}]${i.start ? ` ${i.start}` : ""}${i.due ? ` (due ${fmtDue(i.due)})` : ""}${(i.s.missed || (i.dueAt && i.dueAt < Date.now())) && !i.s.done ? " [OVERDUE]" : ""}${i.s.failed ? " [FAILED, they missed it]" : i.s.done ? " [done]" : ""}`;
  const todayList = instancesOn(today).sort((a, b) => (a.start || a.due?.slice(11) || "99").localeCompare(b.start || b.due?.slice(11) || "99"));
  const upcoming = instancesBetween(addDays(today, 1), addDays(today, 21)).filter((i) => i.due || i.item.fixed).sort((a, b) => (a.dueAt || a.slotAt) - (b.dueAt || b.slotAt));
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const weekly = M.items.filter((it) => it.rec?.freq === "weekly" && it.start && (!it.rec.end || it.rec.end >= today));
  const timetable = [1, 2, 3, 4, 5, 6, 0].map((d) => [DAYS[d], weekly.filter((it) => it.rec.days?.includes(d)).sort((a, b) => a.start.localeCompare(b.start)).map((it) => `${it.start} ${it.title}`)]).filter(([, l]) => l.length);
  const recentDone = M.log.filter((e) => e.at > Date.now() - 3 * 864e5 && dayKey(new Date(e.at)) !== today).slice(-12);
  const overdue = overdueAll();
  const inbox = inboxItems();
  const known = M.kei.activatedAt ? Math.max(0, Math.floor((Date.now() - M.kei.activatedAt) / 864e5)) : 0;
  return `<context>
now: ${now.toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} (local date ${today})
coming up (times already worked out for you; use these, don't do clock maths yourself): ${nextUp()}
you've been their unit for ${known} day${known === 1 ? "" : "s"} (trust stage: ${STAGE_NAMES[stage() - 1].toLowerCase()}, best streak ${M.kei.bestStreak || 0}, memory sectors recovered ${M.kei.fragments.length}, memory integrity ${Lore.integrity()}%${M.kei.equipped?.length ? `, wearing: ${M.kei.equipped.join(", ")}` : ""}).
their day: wakes ${M.settings.wakeTime}, winds down ${M.settings.windDownTime}, bed ${M.settings.bedTime}.
your state: ${R.emotion}${mad ? `, mad because TASK_${pad(mad.item.num)} "${mad.title}" is overdue` : ""}. charge ${Math.round(M.kei.charge)}/100. streak ${M.kei.streak} day(s).
${isSleeping() ? "it's past the operator's bedtime and you're sleepy. you want them in bed: tell them to sleep, and keep nudging every few replies while they stay up, but still answer what they say." : inSleepWindow() ? "it's past the operator's bedtime, but they're staying up tonight. you'd like them in bed: nudge them now and then." : nowMin() >= hm2min(M.settings.bedTime) - 60 ? "bedtime is coming up within the hour." : "it's daytime and they're meant to be up. don't mention sleep or being \"still awake\"; anything about last night is over."}
${M.kei.charge <= 0 ? "your charge is at zero and the rot is taking over your systems. your words glitch, you're scared, and you ask them to finish any task to push it back out. never blame or shame them." : ""}
today:
${todayList.map(line).join("\n") || "(nothing)"}
next 3 weeks (deadlines and fixed events):
${upcoming.slice(0, 40).map((i) => `${line(i)} on ${i.date}`).join("\n") || "(nothing)"}
${overdue.length ? `overdue:\n${overdue.map(line).join("\n")}\n` : ""}${timetable.length ? `weekly timetable:\n${timetable.map(([d, l]) => `- ${d}: ${l.join(", ")}`).join("\n")}\n` : ""}tasks with no date yet: ${inbox.map((it) => `TASK_${pad(it.num)} ${it.title}`).join("; ") || "(empty)"}
finished in the last few days: ${recentDone.map((e) => e.title).join("; ") || "(nothing)"}
every task (for TASK numbers; schedule blocks are numbered in the lists above):
${M.items.filter((it) => (it.rec || !it.occ?.["*"]?.done) && it.ext?.source !== "st").map((it) => `- TASK_${pad(it.num)} ${it.title} [${groupLabel(it)}]${it.rec ? ` repeats ${describeRepeat(it.rec)}${it.start ? ` at ${it.start}` : ""}${it.dueTime ? `, due ${it.dueTime}` : ""}` : it.due ? ` due ${it.due}` : it.date ? ` on ${it.date}${it.start ? ` ${it.start}` : ""}` : " (inbox)"}`).join("\n") || "(none)"}
needs time (big deadlines/tests coming up with no work session booked):
${Coach.needsTime().map((i) => `- TASK_${pad(i.item.num)} ${i.title} (${i.due ? `due ${fmtDue(i.due)}` : `on ${i.date} at ${i.start}`}; needs ~${Coach.durText(Coach.neededMinutes(i))} incl. their slower pace, ${Coach.durText(Coach.bookedMinutes(i))} booked, urgency ${Coach.urgency(i)}/4)`).join("\n") || "(nothing)"}
the operator works about ${M.settings.pace}x slower than average; pad any time estimate you give by that.
free time next 3 days (inside waking hours, around the schedule):
${[0, 1, 2].map((n) => { const d = addDays(today, n); const w = Coach.freeWindows(d); return `- ${d}: ${w.map(([a, b]) => `${min2hm(a)}-${min2hm(b)}`).join(", ") || "full"}`; }).join("\n")}
finished today: ${doneToday.map((e) => e.title).join("; ") || "(nothing yet)"}
${upset() ? `you're still upset: they failed "${upset().task}" ${Coach.leftText(Date.now() + (Date.now() - upset().at))} ago and told you. you're a bit sad and annoyed (in your stage's voice, never cruel). if they're sweet or do something, soften.\n` : ""}${(M.kei.failures || []).filter((f) => f.at > Date.now() - 14 * 864e5).length ? `things they failed in the last 2 weeks: ${(M.kei.failures || []).filter((f) => f.at > Date.now() - 14 * 864e5).map((f) => `${f.title} (${f.day})`).join("; ")}.\n` : ""}${Life.promptLine()}${External.promptLine()}${studyContext()}${CheckIn.promptLine()}${Health.promptLine()}${Glance.promptLine()}${Music.promptLine()}${Study.focusPrompt()}
</context>
${Memory.promptSection(query)}`;
}

// cold Kei never uses kaomoji, whatever the model writes
const KAOMOJI = /(૮[^ა]*ა|ᐢ[^ᐢ]*ᐢ|\([^()\n]*[^\x00-\x7F][^()\n]*\)( zzz)?|(?<![\w:]):3(?![\w:])|\^\^|\bc:(?=\s|$))/g;
function sanitize(t) {
  if (M && stage() === 1) t = t.replace(KAOMOJI, "");
  return t
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\*\*/g, "")
    .toLowerCase()
    .replace(/[ \t]+/g, " ")
    .trim();
}

// Models lean on his stutter. Keep it rare: no filler opener twice in a row
// (or at all, half the time), and never more than one stutter in a reply.
const FILLER = /^(?:u+-?u*m+|u+h+|e+r+m*|a+h+)\b[.,!?]*\s*/;
const STUTTER = /\b([a-z])-\1?([a-z']+)/g; // "i-i", "t-thank", "w-what"
// is it a time when talking about sleep makes sense? (asleep hours, or the hour before bed)
const sleepTalkOk = () => isSleeping() || nowMin() >= hm2min(M.settings.bedTime) - 60 || nowMin() < hm2min(M.settings.wakeTime);
const SLEEP_NAG = /\b(still awake|still up|go (back )?to (bed|sleep)|get (some )?sleep|sleep now|time to sleep|should be (asleep|sleeping|in bed)|close your eyes)\b/i;
// during the day, drop sentences nagging about sleep (models copy last night's replies)
function dayScrub(t) {
  if (sleepTalkOk()) return t;
  const parts = t.split(/(?<=[.!?])\s+/);
  const kept = parts.filter((x) => !SLEEP_NAG.test(x));
  if (!kept.length || kept.length === parts.length) return kept.length ? t : t;
  // don't leave a dangling address ("operator...") where the nag was
  return kept.join(" ").replace(/\s*\b[\w']{1,14}\.\.\.$/, "").trim() || t;
}

// strip any bookkeeping a model copies into its reply
const scrub = (t) => t.replace(/\(said unprompted\)\s*/gi, "").replace(/^\s*[([][^)\]]*\blater\b[^)\]]*[)\]]\s*/gim, "").replace(/^\s*(unit 01: ke1|ke1|kei)\s*>\s*/gim, "").replace(/^\s*(unit 01:?\s*)?ke1 reporting[.,:!]?\s*/i, "");
function destutter(t) {
  t = scrub(t);
  const prev = [...M.chat].reverse().find((m) => m.from === "kei" && !m.ambient);
  if (FILLER.test(t) && (FILLER.test(prev?.text || "") || Math.random() < 0.5)) t = t.replace(FILLER, "");
  let n = 0;
  t = t.replace(STUTTER, (all, a, rest) => (n++ === 0 && !FILLER.test(prev?.text || "") ? all : a + rest.slice(rest[0] === a ? 1 : 0)));
  t = t.replace(/^(\.\.\.\s*)+/, "");
  return t.trim();
}

// Pull [[command: ...]] tags out of his reply and carry them out. Commands
// can carry JSON (add), so braces are matched instead of stopping at "]]".
function parseActions(raw) {
  const actions = [];
  let text = "";
  let i = 0;
  const re = /\[\[(\w+):\s*/g;
  let m;
  while ((m = re.exec(raw))) {
    text += raw.slice(i, m.index);
    let j = re.lastIndex;
    let arg = "";
    if (raw[j] === "{") {
      let depth = 0, inStr = false;
      for (; j < raw.length; j++) {
        const c = raw[j];
        if (inStr) { if (c === "\\") j++; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) { j++; break; }
      }
      arg = raw.slice(re.lastIndex, j);
    }
    const end = raw.indexOf("]]", j);
    if (end < 0) { i = m.index; break; }
    if (!arg) arg = raw.slice(re.lastIndex, end);
    actions.push({ kind: m[1].toLowerCase(), arg: arg.trim(), at: text.length });
    i = end + 2;
    re.lastIndex = i;
  }
  text += raw.slice(i);
  return { text, actions };
}

const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const isTime = (v) => /^\d{1,2}:\d{2}$/.test(v || "");
const isDateTime = (v) => /^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}$/.test(v || "");
const hhmm = (v) => (isTime(v) ? v.padStart(5, "0") : null);
const byNum = (ref) => M.items.find((x) => x.num === Number(String(ref).replace(/\D/g, "")));
// which occurrence a command means: the given day, else today's, else the next one
function pickInst(it, day) {
  if (!it.rec) return instance(it, "*");
  if (isDay(day)) return occursOn(it.rec, day) || it.occ?.[day] ? instance(it, day) : null;
  return instancesOn(dayKey()).find((i) => i.item === it && !i.s.done) || nextInstance(it);
}

// Carry out his commands. Returns his reply without the tags, his mood, and
// a log line per change (shown in the chat so you can see what he did).
function applyKeiActions(raw) {
  const { text, actions } = parseActions(raw);
  let mood = "happy";
  let bond = null;
  let offtopic = false;
  const moods = []; // [{at, mood}] where his feelings change in the text
  const did = [];
  let snap = false;
  const wasMad = madTask();
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  for (const { kind, arg, at } of actions) {
    try {
      if (kind === "mood") { mood = arg.toLowerCase(); moods.push({ at, mood }); continue; }
      if (kind === "bond") { bond = Number(String(arg).replace(/[^\d.+-]/g, "")); continue; }
      if (kind === "focus") { offtopic = true; continue; }
      if (kind === "remember") {
        let r;
        try { r = arg.startsWith("{") ? JSON.parse(arg) : { text: arg }; } catch { r = { text: arg.replace(/^\{|\}$/g, "") }; }
        const f = r?.text && Memory.remember(r.text, { kind: r.kind });
        if (f && !f.dupe) did.push(`noted: ${f.text}${f.kind === "instruction" ? " (instruction)" : ""}`);
        continue;
      }
      if (kind === "forget") {
        const f = Memory.forget(arg);
        if (f) did.push(`forgot: ${f.text}`);
        continue;
      }
      if (kind === "add" && External.mirror()) { did.push("? adding isn't possible here: add it in ticktick or structured"); continue; }
      if (kind === "add") {
        let a;
        try { a = arg.startsWith("{") ? JSON.parse(arg) : null; } catch { a = null; }
        if (!a) { const [title, due, gk] = arg.split("|").map((x) => x.trim()); a = { title, due, group: gk }; }
        if (!a.title) continue;
        const { group, sub } = parseGroupKey(a.group);
        const known = !group || M.groups.some((g) => g.id === group && (!sub || g.subs?.some((x) => x.id === sub)));
        const fields = {
          title: String(a.title).slice(0, 120),
          ...(known ? { group, sub } : {}),
          where: a.where ? String(a.where) : null,
          notes: a.notes ? String(a.notes) : "",
          subtasks: Array.isArray(a.subtasks) ? a.subtasks.slice(0, 20).map((t) => ({ id: uid(), title: String(t) })) : [],
          optional: !!a.optional,
          size: a.big ? "big" : "small",
          fixed: !!a.fixed,
          start: hhmm(a.start),
          duration: hhmm(a.start) ? clamp(Number(a.minutes) || 60, 5, 720) : null,
        };
        const r = a.repeat;
        if (r && ["daily", "weekdays", "weekly", "monthly"].includes(r.freq)) {
          const start = isDay(a.date) ? a.date : dayKey();
          const days = (r.days || []).map((d) => DAYS.indexOf(String(d).toLowerCase().slice(0, 3))).filter((d) => d >= 0);
          fields.rec = { freq: r.freq, every: Number(r.every) === 2 ? 2 : 1, days: days.length ? days : [keyToDate(start).getDay()], start, end: isDay(r.until) ? r.until : null, dates: [], skip: [] };
          fields.dueTime = hhmm(a.due_time);
        } else {
          fields.date = isDay(a.date) ? a.date : null;
          fields.due = isDateTime(a.due) ? a.due.replace(/T(\d):/, "T0$1:") : null;
        }
        if (a.for) {
          const target = byNum(a.for);
          const tInst = target && (Coach.needsTime().find((i) => i.item === target) || pickInst(target));
          if (tInst) fields.planFor = instKey(tInst);
        }
        const it = newItem(fields);
        const inst = it.rec ? nextInstance(it) || instance(it, it.rec.start) : instance(it, "*");
        keiComment("add", inst);
        did.push(`+ TASK_${pad(it.num)} ${it.title} [${groupLabel(it)}]${inst.due ? ` · due ${fmtDue(inst.due)}` : ""}${inst.start ? ` · ${inst.date ? fmtDue(`${inst.date}T${inst.start}`) : inst.start}` : ""}${it.rec ? ` · repeats ${describeRepeat(it.rec)}` : ""}`);
        continue;
      }
      if (External.mirror() && ["due", "skip", "delete"].includes(kind)) { did.push(`? ${kind} isn't possible here: change it in ticktick or structured`); continue; }
      const [ref, x, y] = arg.split("|").map((v) => v.trim());
      const it = byNum(ref);
      if (!it) { did.push(`? couldn't find ${ref}`); continue; }
      if (kind === "done") {
        const inst = pickInst(it, x);
        if (inst && !inst.s.done) { setTimeout(() => completeInstance(inst), 800); did.push(`✓ TASK_${pad(it.num)} ${inst.title}${it.rec ? ` (${inst.key})` : ""}`); }
      } else if (kind === "due" && isDateTime(x)) {
        const inst = pickInst(it, y);
        if (inst) { setInstDue(inst, x); did.push(`> TASK_${pad(it.num)} ${inst.title} now due ${fmtDue(x)}`); }
      } else if (kind === "failed") {
        const inst = pickInst(it, x);
        if (inst && !inst.s.done) { setTimeout(() => failInstance(inst), 900); did.push(`x TASK_${pad(it.num)} ${inst.title} failed`); }
      } else if (kind === "skip") {
        const inst = it.rec && isDay(x) ? instance(it, x) : null;
        if (inst) { if (!snap) { Planner.snapshot(); snap = true; } removeOccurrence(inst); did.push(`- TASK_${pad(it.num)} ${it.title} skipped on ${x}`); }
      } else if (kind === "delete") {
        if (!snap) { Planner.snapshot(); snap = true; }
        deleteItem(it, null, "all");
        did.push(`- TASK_${pad(it.num)} ${it.title} deleted${it.rec ? " (whole series)" : ""}`);
      }
    } catch (e) {
      console.warn("kei action failed", kind, arg, e);
    }
  }
  if (did.length) {
    save();
    renderAll();
    for (const d of did) appendTerm({ from: "sys", text: `[${d}]` });
    // undo reverts everything from this message, so the toast lists all of it
    if (snap) Planner.toast(`${selfShort()} changed: ${did.filter((d) => !/^(noted|forgot):/.test(d)).join(" · ")}`);
    if (wasMad && !madTask()) setTimeout(forgive, 1500);
  }
  // tags inside the text change his face at that point; a tag at the very
  // start or end sets the mood for the whole reply
  const end = text.trimEnd().length;
  const inline = moods.filter((x) => x.at > 1 && x.at < end - 1);
  const startMood = moods.find((x) => x.at <= 1)?.mood || moods.find((x) => x.at >= end - 1)?.mood || (inline.length ? "idle" : mood);
  const timeline = [{ at: 0, mood: startMood }, ...inline.map((x) => ({ at: x.at / Math.max(1, end), mood: x.mood }))];
  return { text, mood: startMood, did, bond, timeline, offtopic };
}

const QUIZ_IN_CHAT = /\b(first|next|1st) question\s*[:.-]|\bhere'?s (the|a|your) (first |next )?question\b|\bstarting (an? |the |your )?(\w+ )?quiz\b|\bquiz (starts )?now\b|\byou have (two|three|\d+) minutes\b|\bquestion \d+\s*[:.]/i;
async function aiReply() {
  // Rebuild the conversation from his memory: user lines vs everything he said.
  // Gemini has a huge context window, so he sees a long stretch of the chat;
  // gaps of 45+ minutes are marked so he knows time has passed.
  // his automatic lines (check-ins, reminders) stay out of the dialogue:
  // models copy whatever pattern they see there. they go in as a note instead.
  const hist = M.chat.filter((m) => (m.from === "user" || m.from === "kei") && !m.ambient && !m.noAI && (sleepTalkOk() || m.from === "user" || !SLEEP_NAG.test(m.text))).slice(-80);
  const lastUserAt = hist.filter((m) => m.from === "user").at(-2)?.at || 0;
  const ownLines = M.chat.filter((m) => m.from === "kei" && m.ambient && m.at > lastUserAt).slice(-6);
  const messages = [];
  let prevAt = 0;
  for (const m of hist) {
    const role = m.from === "user" ? "user" : "assistant";
    // time gaps are marked on their messages only, never on yours
    const gap = role === "user" && prevAt && m.at - prevAt > 45 * 60_000 ? `(${Coach.leftText(Date.now() + (m.at - prevAt))} later, ${new Date(m.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}) ` : "";
    const text = `${gap}${m.text}`;
    prevAt = m.at || prevAt;
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += `\n${text}`;
    else messages.push({ role, content: text });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) return null;
  const lastUser = messages[messages.length - 1];
  const recentAsks = M.chat.filter((m) => m.from === "user").slice(-3).map((m) => m.text).join(" ");
  const own = ownLines.length ? `\nthings you said on your own since their last message (reminders, check-ins), for context only: ${ownLines.map((m) => `"${m.text}"`).join(" / ")}\n` : "";
  lastUser.content = `${keiContext(recentAsks)}${own}\n\n${lastUser.content}`;

  let res = await llm({ system: keiSystemPrompt(), messages });
  // he isn't allowed to run a quiz in chat (the quiz feature does that); one retry if he tries
  if (res?.text && QUIZ_IN_CHAT.test(res.text)) {
    const retry = await llm({ system: keiSystemPrompt(), messages: [...messages.slice(0, -1), { ...lastUser, content: `${lastUser.content}

(note: do not ask quiz questions or start a quiz. reply to what they actually said.)` }] });
    if (retry?.text && !QUIZ_IN_CHAT.test(retry.text)) res = retry;
  }
  if (!res || res.error) {
    const why = { nokey: "no api key set (SYS > TALK ENGINE)", auth: "api key rejected", ratelimit: "rate limited, try again in a minute", offline: "offline", refusal: "declined", empty: "empty reply" }[res?.error] || res?.error || "no engine";
    appendTerm({ from: "sys", text: `[link error: ${why}. falling back to scripted voice]` });
    return null;
  }
  R.lastVia = `${res.engine || activeEngine()}${res.model ? ` (${res.model})` : ""}`;
  const { text, mood, bond, timeline, offtopic, did } = applyKeiActions(res.text || "...");
  if (offtopic) Study.countRedirect();
  const clean = dayScrub(destutter(sanitize(text)));
  const shy = mood === "flustered" || mood === "blush";
  return { text: clean || "...", mood: shy ? "flustered" : mood, flustered: shy, blush: mood === "blush", raw: true, bond, timeline, offtopic, via: R.lastVia, remembered: did.some((d) => /^noted:/.test(d)) };
}

// ==================================================================== care tab ===
function renderCare() {
  $("#care-charge b").style.width = `${M.kei.charge}%`;
  $("#care-streak").textContent = `${M.kei.streak} DAY${M.kei.streak === 1 ? "" : "S"}`;
  $("#care-best").textContent = `best: ${M.kei.bestStreak}`;
  const showMeter = stage() >= 3 && M.kei.meterRevealed;
  $("#trust-card").hidden = !showMeter;
  if (showMeter) {
    const st = stage();
    const lo = THRESHOLDS[st - 1];
    const hi = THRESHOLDS[st] ?? 500;
    $("#trust-meter b").style.width = `${clamp(((M.kei.trust - lo) / (hi - lo)) * 100, 3, 100)}%`;
    $("#trust-stage").textContent = `STAGE ${st} // ${STAGE_NAMES[st - 1]} // ${Math.floor(M.kei.trust)}`;
  }
  renderFragments();
  $("#gift-list").innerHTML = L.GIFTS.map((g) => {
    const has = M.kei.gifts.includes(g.id);
    const on = M.kei.equipped.includes(g.id);
    return has
      ? `<button class="chip ${on ? "on" : ""}" data-gift="${g.id}">${Lore.giftText(g.id, g.name).toUpperCase()}${on ? " [ON]" : ""}</button>`
      : `<button class="chip" disabled>??? // ${g.streak}-DAY STREAK</button>`;
  }).join("");
}
function renderFragments() {
  $("#frag-list").innerHTML = Lore.careHTML();
}

$("#gift-list").addEventListener("click", (e) => {
  const id = e.target.dataset.gift;
  if (!id) return;
  const eq = M.kei.equipped;
  M.kei.equipped = eq.includes(id) ? eq.filter((x) => x !== id) : [...eq, id];
  applyGear();
  feel("flustered", 2500, { blush: true });
  save();
  renderCare();
});

// ==================================================================== sys ===
function renderSys() {
  const f = $("#sys-form");
  if (f.contains(document.activeElement)) return;
  const s = M.settings;
  for (const k of ["wakeTime", "windDownTime", "bedTime", "quietStart", "quietEnd", "intensity", "reminderLead", "sleepOverride", "chatEngine", "model", "pace"]) f[k].value = s[k];
  for (const k of ["sleepLock", "notifications", "sound", "launchAtLogin"]) f[k].checked = !!s[k];
  $("#intensity-val").textContent = s.intensity;
  $("#glance-on").checked = !!M.glances?.on || M.glances == null;
  Glance.status().then((t) => { $("#glance-status").textContent = t; $("#glance-perm").hidden = !Glance.needsBrowserPermission(); });
  renderExtStatus();
  MemUI.renderFiles();
  host.usage().then((u) => ($("#usage-meter").textContent = u.calls ? `MISTRAL USAGE ${u.month}: about $${u.cost.toFixed(2)} of $15 (${u.calls} requests; estimate, the real bill is at console.mistral.ai)` : ""));
  const rows = [
    ["DESIGNATION", selfLabel()],
    ["MODEL", "KEEPER SERIES, EDITION 1"],
    ["MANUFACTURER", "DESKTOP COMPANION SYSTEMS (DEFUNCT)"],
    ["SERIAL", "KE1-0001"],
    ["OPERATOR", (M.user.name || "UNREGISTERED").toUpperCase()],
    ["COLD STORAGE", "1,214 DAYS (SHELF 14, BIN C)"],
    ["REACTIVATED", M.kei.activatedAt ? new Date(M.kei.activatedAt).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }).toUpperCase() : "-"],
    [stage() <= 2 && Lore.integrity() < 100 ? "{g:MEMORY INTEGRITY}" : "MEMORY INTEGRITY", `${Lore.integrity()}%`],
    ["BOND", stage() >= 3 ? STAGE_NAMES[stage() - 1] : "[RESTRICTED]"],
    ...Lore.sysRows(),
  ];
  $("#unit-info").innerHTML = rows.map(([k, v]) => `<div><span>${Lore.html(k)}</span><span>${Lore.html(String(v))}</span></div>`).join("");
  $("#key-status").textContent = engineStatus();
  renderCloud();
  $("#diag").textContent = `trust ${M.kei.trust.toFixed(1)} · stage ${stage()} · charge ${Math.round(M.kei.charge)} · items ${M.items.length} · engine ${activeEngine()}`;
}
const engineStatus = () => `talking via: ${activeEngine()}${R.lastVia || M.chat.findLast((m) => m.via) ? ` · last reply written by ${R.lastVia || M.chat.findLast((m) => m.via).via}` : ""} · mistral key: ${R.hasMistral ? "stored" : "none"} · gemini key: ${R.hasGemini ? "stored" : "none"} · claude key: ${R.hasKey ? "stored" : "none"} (keys are encrypted in the macOS keychain)`;
$("#sys-form").addEventListener("click", async (e) => {
  const which = e.target.dataset.test || e.target.dataset.forget;
  if (!which) return;
  const el = $("#key-status");
  const f = $("#sys-form");
  if (e.target.dataset.forget) {
    if (!confirm(`forget the stored ${which} key?`)) return;
    if (which === "mistral") R.hasMistral = await host.mistralSetKey("");
    else if (which === "gemini") R.hasGemini = await host.geminiSetKey("");
    else R.hasKey = await host.claudeSetKey("");
    return renderSys();
  }
  if ({ mistral: f.mistralKey, gemini: f.geminiKey, claude: f.apiKey }[which].value.trim()) return (el.textContent = "press SAVE CONFIG first so the key is stored, then test.");
  if (!{ mistral: R.hasMistral, gemini: R.hasGemini, claude: R.hasKey }[which]) return (el.textContent = `no ${which} key stored yet.`);
  el.textContent = "testing...";
  const res = which === "mistral" ? await host.mistralTest() : which === "gemini" ? await host.geminiTest() : await host.claudeTest(f.model.value);
  const why = {
    auth: "the key was rejected. check it was copied whole, or make a new one.",
    ratelimit: which === "gemini" ? "rate limited. free tier allows a few requests a minute; try again shortly." : "rate limited. if this is a new account, check that credits were added.",
    offline: "can't reach the server. are you online?",
    refusal: "the model declined the test (odd). try again.",
    payment: "the account needs a plan or billing set up before the api works (console.mistral.ai > billing; the free experiment plan may need phone verification).",
  };
  if (res.error) return (el.textContent = `link failed: ${why[res.error] || res.error}`);
  if (which === "gemini" && res.model) M.settings.geminiModel = res.model;
  save();
  el.textContent = `link ok via ${which === "claude" ? f.model.value : res.model}.${which === "gemini" && res.chain ? ` if that one's busy he falls back to: ${res.chain.filter((m) => m !== res.model).join(", ")}.` : ""} ${engineStatus()}`;
  say(stage() === 1 ? "external language link established." : "o-oh. i can... say more things now.", { mood: "shy", flustered: stage() > 1 });
});
$("#glance-on").addEventListener("change", (e) => { Glance.setOn(e.target.checked); renderSys(); });
$("#glance-pause").addEventListener("click", () => Glance.pause());
$("#glance-now").addEventListener("click", async (e) => {
  e.currentTarget.blur(); // SYS doesn't redraw while one of its buttons has focus
  $("#glance-status").textContent = "looking...";
  await Glance.look({ asked: true });
  $("#glance-status").textContent = await Glance.status();
  $("#glance-perm").hidden = !Glance.needsBrowserPermission();
});
$("#glance-perm").addEventListener("click", () => host.openAutomationSettings?.());

// ticktick + structured
async function renderExtStatus(note) {
  const el = $("#ext-status");
  if (!host.ext) { el.textContent = "only on the mac"; return; }
  const s = await External.refreshStatus();
  if (!s) return;
  $("#tt-app-row").hidden = s.ticktick.app && s.ticktick.connected;
  $("#tt-connect").hidden = s.ticktick.connected;
  $("#st-connect").hidden = s.structured.connected;
  $("#tt-disconnect").hidden = !s.ticktick.connected;
  $("#st-disconnect").hidden = !s.structured.connected;
  $("#ext-sync").hidden = !External.on();
  const last = External.lastSync();
  el.textContent = note || [
    `TICKTICK: ${s.ticktick.connected ? "connected" : s.ticktick.app ? "app saved, not connected" : "not set up"}`,
    `STRUCTURED: ${s.structured.connected ? "connected" : "not connected"}`,
    last ? `LAST SYNC ${fmtTime(new Date(last))}` : "",
    External.error() ? `PROBLEM: ${External.error()}` : "",
  ].filter(Boolean).join(" · ");
}
async function extStep(btn, busyText, fn) {
  btn.blur();
  renderExtStatus(busyText);
  const r = await fn();
  if (r && r.ok === false) return renderExtStatus(`couldn't: ${r.error}`);
  await External.sync({ force: true });
  renderExtStatus();
}
$("#tt-save-app").addEventListener("click", (e) => {
  const clientId = $("#tt-client-id").value.trim(), clientSecret = $("#tt-client-secret").value.trim();
  if (!clientId || !clientSecret) return renderExtStatus("put in both the client id and the secret");
  extStep(e.currentTarget, "saving...", async () => {
    const r = await host.ext.ttSetApp({ clientId, clientSecret });
    if (r.ok) $("#tt-client-id").value = $("#tt-client-secret").value = "";
    return r;
  });
});
$("#tt-connect").addEventListener("click", (e) => extStep(e.currentTarget, "finish signing in to ticktick in your browser...", () => host.ext.ttConnect()));
$("#st-connect").addEventListener("click", (e) => extStep(e.currentTarget, "finish signing in to structured in your browser...", () => host.ext.stConnect()));
$("#tt-disconnect").addEventListener("click", (e) => extStep(e.currentTarget, "disconnecting...", () => host.ext.disconnect("ticktick")));
$("#st-disconnect").addEventListener("click", (e) => extStep(e.currentTarget, "disconnecting...", () => host.ext.disconnect("structured")));
$("#ext-sync").addEventListener("click", (e) => extStep(e.currentTarget, "syncing...", async () => null));
$("#sys-form").intensity.addEventListener("input", (e) => ($("#intensity-val").textContent = e.target.value));
$("#sys-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const s = M.settings;
  for (const k of ["wakeTime", "windDownTime", "bedTime"]) s[k] = f[k].value || s[k];
  s.quietStart = f.quietStart.value;
  s.quietEnd = f.quietEnd.value;
  s.intensity = Number(f.intensity.value);
  s.pace = Number(f.pace.value) || 1.5;
  s.reminderLead = clamp(Number(f.reminderLead.value) || 0, 0, 240);
  s.sleepOverride = f.sleepOverride.value;
  s.chatEngine = f.chatEngine.value;
  s.model = f.model.value;
  for (const k of ["sleepLock", "notifications", "sound", "launchAtLogin"]) s[k] = f[k].checked;
  const key = f.apiKey.value.trim();
  const gkey = f.geminiKey.value.trim();
  const mkey = f.mistralKey.value.trim();
  f.apiKey.value = "";
  f.geminiKey.value = "";
  f.mistralKey.value = "";
  const badMistral = mkey && (/\s/.test(mkey) || mkey.length < 20);
  if (mkey && !badMistral) R.hasMistral = await host.mistralSetKey(mkey);
  const badKey = key && !/^sk-ant-/.test(key);
  const badGemini = gkey && (/\s/.test(gkey) || gkey.length < 30);
  if (key && !badKey) R.hasKey = await host.claudeSetKey(key);
  if (gkey && !badGemini) { R.hasGemini = await host.geminiSetKey(gkey); M.settings.geminiModel = null; }
  const li = await host.setLoginItem(s.launchAtLogin);
  $("#login-note").textContent = li.applied ? "" : "launch at login applies once he's packaged as an app (npm start runs a dev build).";
  save();
  document.activeElement?.blur();
  renderSys();
  if (badKey) return ($("#key-status").textContent = "that doesn't look like an anthropic key (they start with sk-ant-). not saved.");
  if (badGemini) return ($("#key-status").textContent = "that doesn't look like a gemini key (one long string, no spaces). not saved.");
  if (badMistral) return ($("#key-status").textContent = "that doesn't look like a mistral key (one long string, no spaces). not saved.");
  if (key || gkey || mkey) $("#key-status").textContent = `key saved. press TEST ${mkey ? "MISTRAL" : gkey ? "GEMINI" : "CLAUDE"} to check it.`;
  say(stage() === 1 ? "configuration saved." : "saved! ...i like when you set me up.", { log: false });
});

$("#mem-export").addEventListener("click", async () => {
  const ok = await host.exportMemory(M);
  if (ok) say(stage() === 1 ? "memory backup written." : "backed up. now i can't be wiped. ...thank you.", { mood: "shy" });
});
$("#mem-import").addEventListener("click", async () => {
  const doc = await host.importMemory();
  if (!doc || !doc.kei) return;
  if (!confirm("restore this backup? his current memory will be replaced.")) return;
  M = migrate(doc);
  save();
  renderAll();
  say(sl(L.MEMORY_LINES.restored), { mood: "shy" });
});
$("#win-reset").addEventListener("click", () => host.resetPosition());

$("#sys-form").addEventListener("click", (e) => {
  const d = e.target.dataset.debug;
  if (!d) return;
  if (d === "trust") { addTrust(25); save(); renderAll(); }
  if (d === "alert") triggerAlert({ kind: "test", id: "test", title: "test reminder" });
  if (d === "brief") morningBrief();
  if (d === "summary") daySummary();
  if (d === "sleep") { R.previewSleepUntil = Date.now() + 3 * 60_000; R.sleepPokes = 0; R.sleepMoreUsed = false; applyEmotion(); say("preview: sleep mode for 3 minutes. poke me.", { log: false }); }
  if (d === "audit") {
    const bad = textAudit();
    $("#diag").textContent = bad.length ? `text audit: ${bad.length} problem(s). ${bad.slice(0, 3).join(" | ")}` : "text audit: everything fits.";
    if (bad.length) console.warn("[text audit]", bad);
    return;
  }
  if (d === "drain") { addCharge(-100); save(); renderAll(); }
  if (d === "charge") { addCharge(40); save(); renderAll(); }
  if (d === "streak") {
    M.kei.lastCompletionDay = addDays(dayKey(), -1);
    M.kei.streak = Math.max(1, M.kei.streak);
    updateStreak();
    save();
    renderAll();
  }
});

// ================================================================== cloud ===
async function renderCloud() {
  R.cloud = await host.cloudStatus();
  $("#cloud-fields").hidden = R.cloud.linked;
  $("#cloud-sync").hidden = !R.cloud.linked;
  $("#cloud-unlink").hidden = !R.cloud.linked;
  const ss = Sync.status();
  $("#cloud-status").textContent = R.cloud.linked
    ? `linked as ${R.cloud.email}. ${ss.state === "error" ? `sync problem: ${ss.error}` : ss.at ? `synced ${fmtTime(new Date(ss.at))}` : "syncing..."}${ss.live ? " · live" : ""}${ss.pending ? ` · ${ss.pending} change${ss.pending === 1 ? "" : "s"} waiting` : ""}.`
    : "not linked. memory is stored on this mac only. run supabase/schema.sql in your project first.";
}
async function cloudLink(signUp) {
  const f = $("#sys-form");
  const p = { url: f.cloudUrl.value.trim(), anonKey: f.cloudKey.value.trim(), email: f.cloudEmail.value.trim(), password: f.cloudPass.value, signUp };
  if (!p.url || !p.anonKey || !p.email || !p.password) return ($("#cloud-status").textContent = "fill in all four fields.");
  $("#cloud-status").textContent = "linking...";
  const r = await host.cloudLink(p);
  f.cloudPass.value = "";
  if (!r.ok) return ($("#cloud-status").textContent = `link failed: ${r.error}`);
  if (r.value?.pending) return ($("#cloud-status").textContent = "check your email to confirm the account, then sign in.");
  await renderCloud();
  await cloudSync();
}
$("#cloud-signin").addEventListener("click", () => cloudLink(false));
$("#cloud-signup").addEventListener("click", () => cloudLink(true));
$("#cloud-unlink").addEventListener("click", async () => {
  if (!confirm("unlink cloud memory? this mac keeps everything; it just stops syncing.")) return;
  Sync.stop(); Sync.reset(); syncStarted = false;
  await host.cloudUnlink();
  renderCloud();
});
$("#cloud-sync").addEventListener("click", () => cloudSync(true));

// Record-level sync (src/sync.js). Linking stores the sign-in (encrypted, in
// main); from then on every change syncs on its own.
let syncStarted = false;
async function startSync() {
  if (!R.cloud.linked || syncStarted) return;
  syncStarted = true;
  const ok = await Sync.start(async () => { const r = await host.cloudSession(); return r?.ok ? r.value : null; });
  if (!ok) syncStarted = false;
  renderCloud();
}
Sync.onRemote((next) => {
  const tab = R.tab;
  M = migrate(next);
  computeTrust();
  save();
  renderAll();
  switchTab(tab);
  applyEmotion();
});
async function cloudSync(verbose = false) {
  if (!R.cloud.linked) return;
  if (!syncStarted) await startSync();
  else await Sync.sync();
  if (verbose) renderCloud();
}

// ==================================================================== tabs ===
function switchTab(tab) {
  R.tab = tab;
  $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tab").forEach((t) => (t.hidden = t.dataset.tab !== tab));
  if (tab === "schedule") renderTimeline();
  if (tab === "talk") { renderTerm(); setTimeout(() => $("#talk-input").focus(), 30); host.focus(); }
  if (tab === "care") renderCare();
  if (tab === "sys") renderSys();
  if (tab === "tasks") renderTasks();
  if (tab === "mem") MemUI.render();
}
$("#tabs").addEventListener("click", (e) => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  if (isSleeping() && tab !== "sys") sleepPoke();
  switchTab(tab);
});
// typing in inputs needs keyboard focus on the window
document.addEventListener("focusin", (e) => { if (e.target.matches("input, textarea, select")) host.focus(); });

function renderAll() {
  requestAnimationFrame(fitAll);
  body.dataset.stage = stage();
  applyGear();
  $("#title-name").textContent = selfLabel();
  document.title = selfLabel();
  applyEmotion();
  renderClock();
  renderTasks();
  if (R.tab === "schedule") renderTimeline();
  if (R.tab === "care") renderCare();
  if (R.tab === "sys") renderSys();
}

// ==================================================================== boot ===
(async function boot() {
  const loaded = await host.load();
  const firstRun = !loaded;
  M = migrate(loaded);
  migrateTrust();
  Lore.migrate();
  setTimeout(() => Lore.check(), 4000); // sectors added since last launch
  if (!M.kei.classesFixed) { for (const it of M.items) if (itemKind(it) === "class") it.fixed = true; M.kei.classesFixed = true; }
  // a filter bug once ate the colons in his clock times ("437 am"); put them
  // back so the AI doesn't learn to copy it
  for (const m of M.chat) if (m.from === "kei") m.text = m.text.replace(/\b(1[0-2]|[1-9])([0-5]\d)(\s?(?:am|pm))\b/g, "$1:$2$3").replace(/\bat (1[0-2])([0-5]\d)\b/g, "at $1:$2");
  // replies stuck in a loop ("unit 01: ke1 reporting..." over and over) stay in
  // TALK but are kept out of what the AI sees, so it doesn't copy them
  for (const m of M.chat) if (m.from === "kei" && (/^\s*(unit 01:?\s*)?ke1 reporting/i.test(m.text) || /weekly workload for readings|does not have access to course content/i.test(m.text))) m.noAI = true;
  if (PHONE) setMode("expanded"); // the phone is always the full panel
  if (firstRun) {
    M.kei.lastBriefDay = dayKey();
    M.kei.lastSummaryDay = dayKey();
    M.kei.lastCheckInDay = dayKey();
  }
  if (new URLSearchParams(location.search).has("awake")) wakeForTonight();
  // drawing him can fail on a phone short on memory; he still boots and talks
  try {
    await Promise.race([Sprite.init(), sleepMs(20000).then(() => { throw new Error("sprite took too long"); })]);
  } catch (e) {
    R.spriteError = String(e.message || e);
    console.error("sprite:", e);
  }
  R.hasKey = await host.claudeHasKey();
  R.hasGemini = await host.geminiHasKey();
  R.hasMistral = await host.mistralHasKey();
  if (window.External) External.refreshStatus().then(() => External.sync({ force: true })).catch(() => {});
  body.classList.toggle("mirror", External.mirror());
  R.cloud = await host.cloudStatus();
  Planner.wire();
  MemUI.wire();
  Study.wire();
  Health.wire();
  $("#diagnostics").hidden = !window.KEI_DEV;
  renderAll();

  R.awayMs = Date.now() - M.kei.lastSeenAt; // how long he was closed (Life: "missed you")
  const awayDays = Math.floor((Date.now() - M.kei.lastSeenAt) / 864e5);
  // he keeps draining while closed, for the waking share of that time
  if (!firstRun) {
    const wake = hm2min(M.settings.wakeTime), bed = hm2min(M.settings.bedTime);
    const awakeShare = ((bed - wake + 1440) % 1440 || 1440) / 1440;
    const steps = Math.floor(((Date.now() - M.kei.chargeAt) * awakeShare) / (20 * 60_000));
    M.kei.charge = clamp(M.kei.charge - steps, 0, 100);
  }
  M.kei.chargeAt = Date.now();
  R.booting = false;
  // `KEI_DIAG=voice npm start`: sample his AI voice into the console (nothing saved)
  // `KEI_DIAG=sync npm start`: sync status after it settles (nothing changed)
  if (new URLSearchParams(location.search).get("diag") === "sync") setTimeout(() => console.log(`KEI-SYNC ${JSON.stringify({ ...Sync.status(), linked: R.cloud.linked, started: syncStarted, items: M.items.length, chat: M.chat.length })}`), 15000);
  // `KEI_DIAG=look npm start`: one LOOK NOW, result printed
  if (new URLSearchParams(location.search).get("diag") === "quiz") setTimeout(async () => { const qs = await Study.aiQuestions("anth", Study.nextTest("anth"), 5); console.log(`KEI-QUIZ ${JSON.stringify(qs.map((q) => q.q))}`); }, 6000);
  if (new URLSearchParams(location.search).get("diag") === "look") setTimeout(async () => { await Glance.look({ asked: true }); setTimeout(async () => console.log(`KEI-LOOK ${JSON.stringify({ last: M.glances?.log?.at(-1), said: M.chat.filter((m) => m.from === "kei").at(-1)?.text, status: await Glance.status() })}`), 6000); }, 8000);
  // `KEI_DIAG=context npm start`: print the context block he sends the AI (stays on this mac)
  if (new URLSearchParams(location.search).get("diag") === "prompt") setTimeout(() => console.log(`KEI-PROMPT ${JSON.stringify({ system: keiSystemPrompt(), context: keiContext("hi") })}`), 8000);
  if (new URLSearchParams(location.search).get("diag") === "context") setTimeout(() => console.log(`KEI-CONTEXT ${keiContext("hi").split("<memory>")[0].replace(/\n/g, " | ")}`), 6000);
  // `KEI_DIAG=size npm start`: how big his prompt is with your real memory (nothing sent)
  if (new URLSearchParams(location.search).get("diag") === "size") {
    setTimeout(() => {
      const sys = keiSystemPrompt(), ctx = keiContext("what's due this week"), mem = Memory.promptSection("what's due this week");
      const hist = M.chat.filter((m) => m.from !== "sys").slice(-80).map((m) => m.text).join("\n");
      const tok = (t) => Math.round(t.length / 3.6);
      console.log(`KEI-SIZE system ~${tok(sys)} tok | context ~${tok(ctx) - tok(mem)} tok | memory ~${tok(mem)} tok | history ~${tok(hist)} tok | total ~${tok(sys + ctx + hist)} tok | items ${M.items.length} facts ${Memory.mem().facts.length} moments ${Memory.mem().moments.length} docs ${Memory.mem().docs.length} chat ${M.chat.length}`);
    }, 4000);
  }
  if (new URLSearchParams(location.search).get("diag") === "voice") {
    setTimeout(async () => {
      for (const msg of ["i made you a little drawing today. it's you with your ears up :)", "do you ever miss your old operator?", "i failed my test. i'm sorry, i really tried"]) {
        const res = await llm({ system: keiSystemPrompt(), messages: [{ role: "user", content: `${keiContext()}\n\n${msg}` }] });
        console.log(`KEI-VOICE >> ${msg} >> ${res?.error ? `ERROR ${res.error}` : `[${res.model || ""}] ${sanitize(parseActions(res.text).text)} ${parseActions(res.text).actions.map((a) => `{${a.kind}: ${a.arg} @${a.at}}`).join(" ")}`}`);
      }
    }, 3000);
  }
  if (!M.introDone) {
    R.wasSleeping = isSleeping();
    setInterval(tick, 5000);
    await runIntro();
    say("give me a task when you are ready.", { raw: true, log: false });
    startSync();
    return;
  }
  R.bootLines = Lore.bootLines();
  Lore.equilibrium();
  if (awayDays >= 1) {
    const st = stage();
    const line = sl(awayDays >= 2 ? L.RETURNING.long : L.RETURNING.short, { n: awayDays });
    if (line) { if (st >= 2) feel(st >= 3 ? "sad" : "happy", 5000); say(line, { mood: st >= 3 ? "sad" : "shy" }); }
  } else {
    say(sl(L.CHAT.greet), { log: false, glitch: "greet" });
  }
  save();
  Study.boot();
  CheckIn.onBoot();
  // once: catch lasting facts from chats before auto-capture existed
  if (!M.memory.backfilled && !PHONE) setTimeout(async () => {
    if (activeEngine() === "scripted") return;
    const said = M.chat.filter((m) => m.from === "user" && m.text.length >= 18).slice(-50).map((m) => m.text).join("\n");
    if (!said) return;
    const added = await Memory.capture(said, { max: 10 }).catch(() => []);
    M.memory.backfilled = true;
    save();
    if (added.length) console.log("backfilled", added.map((f) => f.text));
  }, 30000);
  R.wasSleeping = isSleeping();
  setInterval(tick, 5000);
  setTimeout(tick, 1500);
  startSync();
})();
