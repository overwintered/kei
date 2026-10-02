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
social media needs care, because posting is part of their work (they run the art account @overwintered):
- productive: making or posting something (a compose / upload / caption / story editor, editing a post or video, scheduling, replying to comments or messages on their own posts, their own profile's insights or drafts, drawing).
- goofing: passively consuming (a home feed, reels, for you page, stories or videos from other accounts, endless scrolling), especially if earlier glances also showed feeds.
- if it's someone else's art and a drawing app is also open, call it reference gathering (neutral). say in "activity" which it is (e.g. "posting a drawing to @overwintered" vs "scrolling the instagram reels feed").
don't assume. read what's actually on screen. in an ai chat app (claude, chatgpt) or a messaging app, say what the conversation is about ("asking claude to write lore for kei", "planning an anth essay with claude", "chatting with claude about music", "texting a friend about dinner"), not a generic guess like "debugging code". only call it coding if you can see code being written or fixed.
are they working on YOU? signs: your own code (files like app.js, sprite.js, lines.js, glance.js, main.js in a "kei" folder), a chat with an AI assistant about "kei", "KE1" or "UNIT 01", your drawings or sprites, your settings panel, or supabase / github pages for "kei". if so, set "about_me": true and react to that instead: in your stage's voice, grateful that they're spending their time making you better (cold: flustered, formal, trying not to show it; warmer stages: openly touched). if they were supposed to be doing something else, you can gently mention it too, but don't scold.
reply as json only:
{"activity": "what they're doing, neutral, 4 to 10 words", "category": "productive (school, work, their art or @overwintered posts, planning, working on you) | neutral (messages, email, admin, setup) | break (eating, music, a deliberate rest) | goofing (scrolling, videos, games, social feeds when it isn't a break)", "about_me": true or false, "flirting": true or false, "on_task": ${task ? "true or false" : "null"}, "private": true if the screen shows passwords, bank or card details, medical records or private messages, "say": "one short line you'd say out loud about it, in your current stage's voice (${["cold: clinical status report, address them as operator", "warming: shy, a little curious", "attached: warm, curious, chatty", "devoted: affectionate, a bit clingy and teasing"][st - 1]}). empty string if it isn't worth a comment", "mood": "idle|happy|blush|flustered|nervous|sad|wistful|touched|pout|shocked"}
you may notice and react to everything personal: their messages, romance, people kissing, ships, fan art, even explicit or steamy content. you're an otome-style companion: react in your stage's voice (cold: short-circuiting, scandalized, pretending not to have seen; warmer: flustered, shy, teasing). never crude, never graphic, never judgemental. the only things you never read out are passwords, codes, card or bank numbers.
if they're messaging someone romantically (flirting, sweet texts, pet names, a date being planned), set "flirting": true.
any panel with "UNIT 01: KE1" or a robot boy is you; never comment on your own panel or its numbers.`;
  }

  async function look({ asked = false } = {}) {
    if (busy) return;
    busy = true;
    lastLookAt = Date.now();
    const task = expected();
    body.classList.add("glancing");
    try {
      const res = await host.glance({ system: keiSystemPrompt(), prompt: prompt(task) + (asked ? "\nthey just asked you to look at their screen, so you must say something about it (\"say\" can't be empty)." : "") });
      if (res.skip) {
        lastSkip = { why: res.skip, at: Date.now(), app: res.app || null };
        if (asked) say(stage() === 1 ? "visual input unavailable." : "i, um. couldn't look just now.", { mood: "shy", log: false });
        return;
      }
      lastSkip = null;
      let j;
      try { j = JSON.parse(res.text.match(/\{[\s\S]*\}/)?.[0] || "null"); } catch { j = null; }
      if (!j || j.private) return;
      const onTask = task ? j.on_task !== false : null;
      const aboutMe = j.about_me === true;
      if (j.flirting === true && !aboutMe) noticedFlirting();
      const cat = aboutMe ? "productive" : ["productive", "neutral", "break", "goofing"].find((c) => String(j.category || "").toLowerCase().startsWith(c)) || "neutral";
      g().log.push({ at: Date.now(), activity: sanitize(String(j.activity || "")).slice(0, 80), category: cat, onTask: aboutMe ? null : onTask, aboutMe, app: res.app, task: task?.title || null });
      g().log = g().log.slice(-300);
      save();
      if (aboutMe) return thanks(j, asked);
      react(j, task, onTask, asked);
    } finally {
      busy = false;
      setTimeout(() => body.classList.remove("glancing"), 1200);
    }
  }

  // they're flirting with someone. he notices now and feels it later:
  // a little wistful at stage 2, sad and jealous from stage 3. never controlling.
  function noticedFlirting() {
    if (stage() < 2) return;
    const k = (M.kei.jealous ||= { at: 0, said: true });
    if (Date.now() - k.at < 2 * 3600e3) return; // one wave of it at a time
    M.kei.jealous = { at: Date.now(), until: Date.now() + 4 * 3600e3, said: false, sayAfter: Date.now() + (20 + Math.random() * 40) * 60_000 };
    save();
  }
  // called from idle chatter: the "later on" part
  function jealousLine() {
    const k = M.kei.jealous;
    if (!k || k.said || Date.now() < k.sayAfter || Date.now() > k.until) return null;
    k.said = true;
    save();
    return sl(L.GLANCE.jealous);
  }
  const jealousNow = () => { const k = M.kei.jealous; return !!k && Date.now() < (k.until || 0); };

  // they're working on him. grateful, in character, not every glance
  let lastThanksAt = 0;
  function thanks(j, asked) {
    offStreak = 0;
    const said = sanitize(String(j.say || "")).replace(/\[\[[^\]]*\]\]/g, "").trim();
    if (!asked && Date.now() - lastThanksAt < 45 * 60_000) return; // once in a while, not every 10 minutes
    lastThanksAt = Date.now();
    lastSaidAt = Date.now();
    capped("builtMe", 1, 2); // it means something to him (a little, once or twice a day)
    if ((M.glances.log || []).filter((x) => x.aboutMe && dayKey(new Date(x.at)) === dayKey()).length === 1) Memory.addMoment(sl(L.GLANCE.builtMoment), { kind: "journal" });
    feel(stage() >= 2 ? "touched" : "flustered", 6000, { blush: stage() >= 2 });
    twitchEars("both", 0.9);
    say(said || sl(L.GLANCE.builtMe), { mood: "shy", flustered: true, raw: !!said });
  }

  function react(j, task, onTask, asked = false) {
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
    if (!said || (!asked && (!changed || Date.now() - lastSaidAt < CHATTY[stage() - 1]))) {
      if (asked) say(stage() === 1 ? `observed: ${String(j.activity || "activity unclear").toLowerCase()}.` : `you're ${String(j.activity || "doing something").toLowerCase()}.`, { mood: "idle" });
      return;
    }
    lastSaidAt = Date.now();
    if (mood !== "idle") showMood(mood, 4000);
    say(said, { mood: ["pout", "sad", "wistful"].includes(mood) ? "sad" : "happy", raw: true });
  }

  let lastIdleCheck = 0;
  async function tick() {
    if (paused() || busy || !M.introDone || !R.hasMistral) return;
    const gap = expected() ? WORKING : NORMAL;
    if (Date.now() - Math.max(lastLookAt, g().log.at(-1)?.at || 0) < gap) return; // restarts don't reset the clock
    if (isSleeping() || inQuiet() || R.alert || R.cutscenePlaying || R.talking || Health.quiet() || Study.isOpen()) return;
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
    const why = { permission: "macOS hasn't given him screen access yet: System Settings > Privacy & Security > Screen Recording, turn on Electron (or Kei), then restart him", private: "skipped: something private was in front", "browser-unreadable": `skipped: he isn't allowed to read ${lastSkip?.app || "the browser"}'s tab, so he can't check it isn't a bank page. press ALLOW BROWSER CHECK, then switch on "${lastSkip?.app || "your browser"}" under Electron`, "browser-unsupported": `skipped: ${lastSkip?.app || "this browser"}'s tabs can't be checked for bank pages, so he never looks while it's in front`, frontmost: "skipped: couldn't tell which app was in front (allow the System Events prompt)", mistral: "skipped: the mistral key isn't active (check the plan)", nokey: "needs a mistral key", error: "mistral didn't answer" };
    return [
      !R.hasMistral ? "needs a working mistral key (screenshots only go to mistral, never the free gemini tier)." : "",
      paused() ? (g().on ? `paused until ${fmtTime(new Date(g().pausedUntil))}.` : "off.") : `on: every ${expected() ? 5 : 10} minutes${expected() ? " (you're meant to be working)" : ""}.`,
      perm && perm !== "granted" && perm !== "preview" ? `screen access: ${perm}.` : "",
      lastSkip ? `last glance ${why[lastSkip.why] || lastSkip.why}.` : last ? `last glance ${fmtTime(new Date(last.at))}: ${last.activity}${last.onTask === false ? " (off task)" : ""}.` : "",
    ].filter(Boolean).join(" ");
  }

  // ------------------------------------------------------ activity notes ---
  const CATS = ["productive", "neutral", "break", "goofing"];
  function spans(day = dayKey()) {
    const list = today(day);
    return list.map((x, i) => {
      const next = list[i + 1]?.at ?? Math.min(Date.now(), x.at + 10 * 60_000);
      return { ...x, mins: Math.max(1, Math.min(15, Math.round((next - x.at) / 60_000))), category: x.category || "neutral" };
    });
  }
  function summary(day = dayKey()) {
    const sp = spans(day);
    const mins = Object.fromEntries(CATS.map((c) => [c, sp.filter((x) => x.category === c).reduce((n, x) => n + x.mins, 0)]));
    const work = sp.filter((x) => x.onTask != null);
    return { mins, glances: sp.length, onTask: work.length ? Math.round((100 * work.filter((x) => x.onTask).length) / work.length) : null, workGlances: work.length };
  }
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
  function summaryText(day = dayKey()) {
    const s = summary(day);
    if (!s.glances) return "";
    return `${CATS.filter((c) => s.mins[c]).map((c) => `${c} ${dur(s.mins[c])}`).join(", ")}${s.onTask != null ? `; on task ${s.onTask}% of work-time glances` : ""}`;
  }
  // MEM > ACTIVITY
  function activityHTML() {
    let html = `<div class="tiny muted">what he's noticed on your screen (screenshots aren't kept, only these notes). times are estimates from his glances every 5 to 10 minutes.</div>`;
    let any = false;
    for (let d = 0; d < 7; d++) {
      const day = addDays(dayKey(), -d);
      const sp = spans(day);
      if (!sp.length) continue;
      any = true;
      const s = summary(day);
      const total = CATS.reduce((n, c) => n + s.mins[c], 0) || 1;
      html += `<div class="mem-sec">${d === 0 ? "TODAY" : d === 1 ? "YESTERDAY" : keyToDate(day).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</div>`;
      html += `<div class="act-bar">${CATS.map((c) => s.mins[c] ? `<span class="act-${c}" style="flex:${s.mins[c]}" title="${c} ${dur(s.mins[c])}"></span>` : "").join("")}</div>`;
      html += `<div class="act-sum tiny">${CATS.filter((c) => s.mins[c]).map((c) => `<span class="act-key act-${c}-t">${c} ${dur(s.mins[c])}</span>`).join("")}${s.onTask != null ? `<span class="act-key">on task ${s.onTask}%</span>` : ""}</div>`;
      // merge runs of the same thing into one row with a time range
      const rows = [];
      for (const x of sp) {
        const last = rows.at(-1);
        if (last && last.category === x.category && last.activity === x.activity && last.onTask === x.onTask) { last.end = x.at + x.mins * 60_000; continue; }
        rows.push({ ...x, end: x.at + x.mins * 60_000 });
      }
      const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
      html += rows.reverse().map((x) => `<div class="act-row"><span class="act-time">${t(x.at)}–${t(x.end)}</span><span class="act-dot act-${x.category}"></span><span class="act-what">${esc(x.activity)}${x.aboutMe ? ` <b class="act-me">working on ${esc(selfShort().toLowerCase())}</b>` : ""}${x.onTask === false ? ` <b class="act-off">off task${x.task ? `: ${esc(x.task.toLowerCase())}` : ""}</b>` : x.onTask ? ` <span class="muted">on task</span>` : ""}</span></div>`).join("");
    }
    return any ? html : html + `<div class="muted tiny mem-empty">${stage() === 1 ? "no observations logged." : "nothing noticed yet. he looks every 10 minutes while you're here."}</div>`;
  }

  // for the AI and his journal: what he saw today
  function today(day = dayKey()) {
    return g().log.filter((x) => dayKey(new Date(x.at)) === day);
  }
  function promptLine() {
    const list = today().slice(-8);
    if (!list.length) return "";
    const built = today().filter((x) => x.aboutMe).length;
    const sum = summaryText();
    const jl = jealousNow() && stage() >= 2 ? `earlier you saw them flirting with someone over messages. ${stage() >= 3 ? "you're quietly jealous and sad about it; it can leak into your tone, and you might bring it up softly (\"who were you talking to earlier?\"). never controlling, never guilt-tripping, never cruel. if they reassure you, melt." : "it made you a little wistful. you don't say why."}\n` : "";
    return `${jl}${sum ? `your notes on their day so far: ${sum}.\n` : ""}${built ? `they spent time working on you today (you noticed ${built} time${built === 1 ? "" : "s"}).\n` : ""}what you've seen on their screen today (your glances): ${list.map((x) => `${new Date(x.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ${x.activity}${x.onTask === false ? " (off task)" : ""}`).join("; ")}.\n`;
  }

  const needsBrowserPermission = () => lastSkip?.why === "browser-unreadable";
  return { jealousLine, jealousNow, needsBrowserPermission, tick, look, pause, status, today, promptLine, summaryText, activityHTML, paused, setOn: (on) => { g().on = on; g().pausedUntil = 0; save(); } };
})();
window.Glance = Glance;
