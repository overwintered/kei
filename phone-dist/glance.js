// Screen glances. Every 10 minutes (every 5 while you're meant to be working)
// he looks at your screen and maybe says something about it. While you should
// be working, he checks whether you are, and gets more annoyed each time he
// catches you off-task (never cruel, and it never costs trust).
//
// Only through Mistral (paid): screenshots never go to the free Gemini tier.
// Skipped when a password manager or banking/payment page is in front (checked
// on this Mac before anything is captured), and during sleep, quiet hours,
// migraines, alerts, or while you're away from the computer.

const Glance = (() => {
  const NORMAL = 10 * 60_000, WORKING = 5 * 60_000;
  // how long he waits between remarks when nothing's wrong, by stage
  const CHATTY = [60, 40, 25, 18].map((m) => m * 60_000);
  let busy = false;
  let lastLookAt = 0;
  let lastSaidAt = 0;
  let offStreak = 0;
  let lastActivity = "";
  let lastSkip = null;

  const g = () => (M.glances ||= { on: true, pausedUntil: 0, log: [] });
  const paused = () => !g().on || Date.now() < (g().pausedUntil || 0);

  // what they're meant to be doing right now, if anything
  function expected() {
    const f = M.study?.focus;
    if (f) return { title: f.title, why: "focus session" };
    const now = Date.now();
    const block = instancesOn(dayKey()).find((i) => i.slotAt && !i.s.done && !i.item.fixed && now >= i.slotAt && now < i.slotAt + (i.duration || 30) * 60_000 && !/\b(break|lunch|dinner|rest|nap|free)\b/i.test(i.title));
    return block ? { title: block.title, why: "scheduled block" } : null;
  }

  function prompt(task) {
    const st = stage();
    const recent = g().log.slice(-4).map((x) => `${new Date(x.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ${x.activity}${x.onTask === false ? " (off task)" : ""}`).join("; ");
    const soon = instancesBetween(dayKey(), addDays(dayKey(), 4)).filter((i) => !i.s.done && i.due && i.dueAt > Date.now()).sort((a, b) => a.dueAt - b.dueAt).slice(0, 3).map((i) => `${i.title} (due ${fmtDue(i.due)})`).join("; ");
    return `this is a screenshot of the operator's screen right now. you glance at it every few minutes. the small robot boy in a corner of the screen is you; ignore yourself.
now: ${new Date().toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}. ${isSleeping() ? "it's past their bedtime." : ""}
${task ? `they're supposed to be working on: "${task.title}" (${task.why}). decide whether what's on screen is that work (research, notes, writing, course sites, docs, and their art if the task is art all count; music players in the background are fine). ${offStreak ? `you've already caught them off-task ${offStreak} time(s) in a row; be more annoyed this time (pouty, exasperated, never cruel, never insulting).` : "if they're off-task, be a little annoyed and tell them to get back to it."}` : "they're not scheduled to work on anything right now, so don't nag; just notice what they're doing."}
${soon ? `coming up: ${soon}.` : ""}
${recent ? `what you saw on earlier glances: ${recent}.` : ""}
${M.health?.migraines?.some((x) => !x.end) ? "they have a migraine right now; if anything, tell them to rest their eyes." : ""}
${CheckIn.today().length ? `how they said they feel today: ${CheckIn.today().map((m) => m.mood).join(", ")}.` : ""}
reply as json only:
{"activity": "what they're doing, neutral, 4 to 10 words", "on_task": ${task ? "true or false" : "null"}, "private": true if the screen shows passwords, bank or card details, medical records or private messages, "say": "one short line you'd say out loud about it, in your current stage's voice (${["cold: clinical status report, address them as operator", "warming: shy, a little curious", "attached: warm, curious, chatty", "devoted: affectionate, a bit clingy and teasing"][st - 1]}). empty string if it isn't worth a comment", "mood": "idle|happy|blush|flustered|nervous|sad|wistful|touched|pout|shocked"}
don't describe private details in "activity" or "say". never read out names, messages or numbers from the screen.`;
  }

  async function look() {
    if (busy) return;
    busy = true;
    lastLookAt = Date.now();
    const task = expected();
    body.classList.add("glancing");
    try {
      const res = await host.glance({ system: keiSystemPrompt(), prompt: prompt(task) });
      if (res.skip) { lastSkip = { why: res.skip, at: Date.now() }; return; }
      lastSkip = null;
      let j;
      try { j = JSON.parse(res.text.match(/\{[\s\S]*\}/)?.[0] || "null"); } catch { j = null; }
      if (!j || j.private) return;
      const onTask = task ? j.on_task !== false : null;
      g().log.push({ at: Date.now(), activity: sanitize(String(j.activity || "")).slice(0, 80), onTask, app: res.app, task: task?.title || null });
      g().log = g().log.slice(-300);
      save();
      react(j, task, onTask);
    } finally {
      busy = false;
      setTimeout(() => body.classList.remove("glancing"), 1200);
    }
  }

  function react(j, task, onTask) {
    const said = sanitize(String(j.say || "")).replace(/\[\[[^\]]*\]\]/g, "").trim();
    const mood = String(j.mood || "idle").toLowerCase();
    if (task && onTask === false) {
      offStreak++;
      if (!said) return;
      lastSaidAt = Date.now();
      showMood(offStreak >= 2 ? "pout" : mood === "idle" ? "pout" : mood, 6000);
      twitchEars("both", 1 + Math.min(offStreak, 3) * 0.3);
      if (offStreak >= 2) sfx.nudge();
      return say(said, { mood: "pout", raw: true });
    }
    if (task && onTask && offStreak) {
      // back to work after being caught
      offStreak = 0;
      lastSaidAt = Date.now();
      showMood(stage() >= 2 ? "happy" : "idle", 4000);
      return say(sl(L.GLANCE.backOnTask, { task: task.title.toLowerCase() }), { mood: "happy" });
    }
    offStreak = 0;
    // otherwise only now and then, and when what they're doing has changed
    const changed = j.activity && j.activity !== lastActivity;
    lastActivity = j.activity || lastActivity;
    if (!said || !changed || Date.now() - lastSaidAt < CHATTY[stage() - 1]) return;
    lastSaidAt = Date.now();
    if (mood !== "idle") showMood(mood, 4000);
    say(said, { mood: ["pout", "sad", "wistful"].includes(mood) ? "sad" : "happy", raw: true });
  }

  let lastIdleCheck = 0;
  async function tick() {
    if (paused() || busy || !M.introDone || !R.hasMistral) return;
    const gap = expected() ? WORKING : NORMAL;
    if (Date.now() - lastLookAt < gap) return;
    if (isSleeping() || inQuiet() || R.alert || R.cutscenePlaying || R.talking || Health.active() || Study.isOpen()) return;
    if (Date.now() - lastIdleCheck < 30_000) return;
    lastIdleCheck = Date.now();
    if ((await host.idleSeconds?.()) >= 120) return; // not at the computer
    look();
  }

  function pause(ms = 3600e3) {
    g().pausedUntil = Date.now() + ms;
    save();
    say(sl(L.GLANCE.paused), { mood: "shy" });
    renderSys();
  }

  // for SYS
  async function status() {
    const perm = await host.glancePermission?.();
    const last = g().log.at(-1);
    const why = { permission: "macOS hasn't given him screen access yet: System Settings > Privacy & Security > Screen Recording, turn on Electron (or Kei), then restart him", private: "skipped: something private was in front", "browser-unreadable": "skipped: couldn't read the browser tab (allow the automation prompt so he can check it isn't a bank page)", frontmost: "skipped: couldn't tell which app was in front (allow the System Events prompt)", mistral: "skipped: the mistral key isn't active (check the plan)", nokey: "needs a mistral key", error: "mistral didn't answer" };
    return [
      !R.hasMistral ? "needs a working mistral key (screenshots only go to mistral, never the free gemini tier)." : "",
      paused() ? (g().on ? `paused until ${fmtTime(new Date(g().pausedUntil))}.` : "off.") : `on: every ${expected() ? 5 : 10} minutes${expected() ? " (you're meant to be working)" : ""}.`,
      perm && perm !== "granted" && perm !== "preview" ? `screen access: ${perm}.` : "",
      lastSkip ? `last glance ${why[lastSkip.why] || lastSkip.why}.` : last ? `last glance ${fmtTime(new Date(last.at))}: ${last.activity}${last.onTask === false ? " (off task)" : ""}.` : "",
    ].filter(Boolean).join(" ");
  }

  // for the AI and his journal: what he saw today
  function today(day = dayKey()) {
    return g().log.filter((x) => dayKey(new Date(x.at)) === day);
  }
  function promptLine() {
    const list = today().slice(-8);
    if (!list.length) return "";
    return `what you've seen on their screen today (your glances): ${list.map((x) => `${new Date(x.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ${x.activity}${x.onTask === false ? " (off task)" : ""}`).join("; ")}.\n`;
  }

  return { tick, look, pause, status, today, promptLine, paused, setOn: (on) => { g().on = on; g().pausedUntil = 0; save(); } };
})();
