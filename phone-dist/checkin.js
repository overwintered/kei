// Mood check-ins and the notes he leaves you.
//
// Check-ins: every hour while you're up and at the computer (worded for the
// morning, noon, afternoon or evening), once at night, and whenever you start
// a session (opening him, or coming back after 30+ minutes away). One answer
// covers anything due within the hour. Skipping is fine; he lets it go.
// What you say shapes his tone for a few hours, goes in his journal, and is
// shown in MEM > MOOD.
//
// Notes (stage 3+): at most one a day, a short note left on his panel.

const CheckIn = (() => {
  const MOODS = ["great", "okay", "tired", "stressed", "sad", "angry"];
  const EXPIRE = 10 * 60_000;
  const ci = () => (M.kei.checkIns?.day === dayKey() ? M.kei.checkIns : (M.kei.checkIns = { day: dayKey(), slots: {}, lastAt: M.kei.checkIns?.lastAt || 0 }));
  const moods = () => (M.moods ||= []);
  let awaySince = 0;
  let sessionAt = 0; // a session check-in waiting for him to be free
  let lastIdleCheck = 0;
  let lastIdle = 0; // seconds since they last touched the computer

  // which slot is due now, if any
  function dueSlot() {
    const m = nowMin();
    const wake = hm2min(M.settings.wakeTime), wind = hm2min(M.settings.windDownTime);
    const s = ci().slots;
    // the morning one follows the brief, whenever they turned up for it
    if (!s.morning && M.kei.lastBriefDay === dayKey() && Date.now() - (M.kei.briefAt || 0) < 3 * 3600e3) return "morning";
    if (!s.noon && m >= 12 * 60 && m < 14 * 60 + 30) return "noon";
    if (!s.night && m >= wind && M.kei.lastSummaryDay === dayKey() && !isSleeping()) return "night";
    // every hour in between, once their day has started (the morning brief) and while they're at the computer
    if (M.kei.lastBriefDay === dayKey() && m < wind && !isSleeping() && lastIdle < 120 && Date.now() - ci().lastAt >= 60 * 60_000)
      return m < 12 * 60 ? "morning" : m < 14 * 60 + 30 ? "noon" : m < 17 * 60 ? "afternoon" : "evening";
    return null;
  }

  function ask(slot) {
    const c = ci();
    // answered (or asked) within the hour: that counts for this slot too
    if (Date.now() - c.lastAt < 60 * 60_000) { if (slot !== "session") { c.slots[slot] = true; save(); } return; }
    if (!canInterject(90_000)) return; // something else was just said; ask in a moment
    interjected();
    if (slot !== "session") c.slots[slot] = true;
    c.lastAt = Date.now();
    R.pendingCheckIn = { slot, at: Date.now() };
    save();
    feel(stage() >= 3 ? "happy" : "idle", 3000);
    say(sl(L.CHECKIN.ask[slot]), {
      mood: "shy",
      choices: [...MOODS.map((m) => ({ label: m, fn: () => answer(m) })), { label: "migraine", fn: () => { record("migraine"); Health.open(); } }, { label: "other...", fn: typeIt }],
    });
  }

  function record(mood, text = "") {
    const slot = R.pendingCheckIn?.slot || "session";
    R.pendingCheckIn = null;
    moods().push({ at: Date.now(), day: dayKey(), slot, mood, text: String(text).slice(0, 300) });
    if (moods().length > 600) M.moods = moods().slice(-600);
    M.kei.moodTone = { mood, until: Date.now() + 4 * 3600e3, followed: false };
    capped("checkin", 1, 4);
    save();
    if (R.mode === "expanded" && R.tab === "mem") MemUI.render();
  }

  function answer(mood) {
    if (!R.pendingCheckIn) R.pendingCheckIn = { slot: "session", at: Date.now() };
    record(mood);
    const face = { great: "happy", okay: "idle", tired: "wistful", stressed: "nervous", sad: "sad", angry: "pout" }[mood];
    showMood(face, 4000);
    say(sl(L.CHECKIN.reply[mood]), { mood: mood === "great" ? "happy" : mood === "okay" ? "happy" : mood === "angry" ? "pout" : "sad" });
  }

  // "other...": they type it in TALK; the next message is their answer
  function typeIt() {
    R.pendingMoodText = R.pendingCheckIn?.slot || "session";
    expand({ fromUser: false });
    switchTab("talk");
    say(sl(L.CHECKIN.typeIt), { mood: "shy", log: false });
  }
  // called by handleUserText; returns true when the message was a check-in answer
  function takeText(text) {
    if (!R.pendingMoodText) return false;
    R.pendingCheckIn = { slot: R.pendingMoodText, at: Date.now() };
    R.pendingMoodText = null;
    const t = text.toLowerCase();
    const guess = /\b(great|amazing|good|happy|excited)\b/.test(t) ? "great" : /\b(tired|sleepy|exhausted|drained)\b/.test(t) ? "tired" : /\b(stress|anxious|overwhelm|panic)/.test(t) ? "stressed" : /\b(angry|mad|pissed|furious|annoyed|irritated|frustrat|livid|rage)/.test(t) ? "angry" : /\b(sad|down|lonely|bad|awful|cry)/.test(t) ? "sad" : "other";
    record(guess, text);
    return true;
  }

  function expire() {
    const p = R.pendingCheckIn;
    if (!p || Date.now() - p.at < EXPIRE) return;
    R.pendingCheckIn = null;
    host.idleSeconds?.().then((idle) => { if (idle < 120 && !R.alert && !Study.focusing()) say(sl(L.CHECKIN.skipped), { mood: "shy" }); });
  }

  // a gentle follow-up later in the day (idle chatter calls this)
  function followUp() {
    const t = M.kei.moodTone;
    if (!t || t.followed || Date.now() > t.until || !L.CHECKIN.followUp[t.mood]) return null;
    if (Date.now() - (moods().at(-1)?.at || 0) < 90 * 60_000) return null;
    t.followed = true;
    save();
    return sl(L.CHECKIN.followUp[t.mood]);
  }
  // tired, stressed or sad: planning nudges ease off a little for a few hours
  const gentle = () => { const t = M.kei.moodTone; return !!t && Date.now() < t.until && ["tired", "stressed", "sad", "angry"].includes(t.mood); };

  function free() {
    return M.introDone && !R.alert && !R.cutscenePlaying && !R.cardOpen && !R.talking && !R.pendingCheckIn && !R.pendingMoodText && !Study.focusing() && !Study.isOpen() && !R.focusBreak;
  }

  async function tick() {
    expire();
    // a new session: back after 45+ minutes away from the computer
    if (Date.now() - lastIdleCheck > 30_000 && host.idleSeconds) {
      lastIdleCheck = Date.now();
      const idle = await host.idleSeconds();
      lastIdle = idle;
      if (idle >= 30 * 60) awaySince ||= Date.now() - idle * 1000;
      else if (awaySince && idle < 30) { awaySince = 0; sessionAt = Date.now() + 4000; }
    }
    if (sessionAt && Date.now() >= sessionAt && !isSleeping() && free()) { sessionAt = 0; return ask(dueSlot() || "session"); }
    if (sessionAt && Date.now() - sessionAt > 30 * 60_000) sessionAt = 0; // too late now
    if (isSleeping() && dueSlot() !== "night") return;
    const slot = dueSlot();
    if (slot && free()) ask(slot);
  }

  // opening him counts as a new session
  function onBoot() {
    if (M.introDone && !isSleeping()) sessionAt = Date.now() + 9000;
  }

  // ------------------------------------------------------------- context ---
  function today(day = dayKey()) {
    return moods().filter((m) => m.day === day);
  }
  function promptLine() {
    const list = today();
    if (!list.length) return "";
    return `the operator's mood check-ins today: ${list.map((m) => `${m.slot} ${m.mood}${m.text ? ` ("${m.text}")` : ""}`).join("; ")}. let it shape your tone (gentler if they're low), without bringing it up every time.`;
  }

  return { tick, onBoot, ask, answer, takeText, followUp, gentle, today, promptLine, MOODS };
})();

const Notes = (() => {
  // decide once a day whether (and when) he leaves a note
  function plan() {
    const today = dayKey();
    if (M.kei.noteDay === today) return;
    M.kei.noteDay = today;
    const from = Math.max(hm2min(M.settings.wakeTime) + 120, 13 * 60), to = hm2min(M.settings.windDownTime) - 30;
    M.kei.noteAt = Math.random() < 0.65 && to > from ? new Date(`${today}T${min2hm(Math.round(from + Math.random() * (to - from)))}`).getTime() : null;
    save();
  }

  // "operator hates early mornings" -> "you hate early mornings"
  const unS = (v) => (v === "is" ? "are" : v === "was" ? "were" : v === "has" ? "have" : v === "does" ? "do" : /ies$/.test(v) ? v.slice(0, -3) + "y" : /(ch|sh|ss|x|zz|o)es$/.test(v) ? v.slice(0, -2) : /[^s]s$/.test(v) ? v.slice(0, -1) : v);
  const asYou = (t) => t.replace(/\boperator's\b/gi, "your").replace(/\b(?:the )?operator\b(\s+)(\w+)/gi, (_, sp, v) => `you${sp}${unS(v.toLowerCase())}`).replace(/\b(?:the )?operator\b/gi, "you").replace(/\.$/, "");

  async function write() {
    let text = null;
    if (activeEngine() !== "scripted") {
      const res = await llm({
        quick: true,
        system: keiSystemPrompt(),
        messages: [{ role: "user", content: `${keiContext()}\n\nyou're leaving a short note on your panel for the operator to find. write it: 1 to 3 short sentences, under 40 words, about something real (something from <memory>, today, or what's coming up), in your current stage's voice. no greeting line, no sign-off, no tags.` }],
      });
      if (res?.text) text = sanitize(res.text.replace(/\[\[[^\]]*\]\]/g, "")).slice(0, 300);
    }
    if (!text) {
      const soon = instancesBetween(dayKey(), addDays(dayKey(), 3)).filter((i) => !i.s.done && (i.due || i.item.fixed) && (i.dueAt || i.slotAt) > Date.now())[0];
      const facts = Memory.mem().facts.filter((f) => !f.private && f.kind !== "instruction");
      const r = Math.random();
      if (soon && r < 0.35) text = sl(L.NOTES.task, { task: soon.title.toLowerCase() });
      else if (facts.length && r < 0.6) text = sl(L.NOTES.fact, { fact: asYou(facts[Math.floor(Math.random() * facts.length)].text.toLowerCase()) });
      else text = sl(L.NOTES.plain);
    }
    if (!text) return;
    Memory.addMoment(text, { kind: "note" });
    const show = () => { expand({ fromUser: false }); openCard("note", "A NOTE", `FROM ${selfLabel()} // ${new Date().toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase()}`, `<div class="say note kei-voice">${fmt(text)}</div>`); };
    sfx.chime();
    feel("flustered", 3000, { blush: true });
    say(sl(L.NOTES.found), { mood: "shy", choices: [{ label: "read it", fn: show }] });
  }

  function tick() {
    if (stage() < 3 || !M.introDone) return;
    plan();
    const at = M.kei.noteAt;
    if (!at || Date.now() < at || isSleeping() || R.alert || R.cutscenePlaying || R.cardOpen || R.talking || R.pendingCheckIn || Study.focusing() || Study.isOpen()) return;
    M.kei.noteAt = null;
    save();
    write();
  }

  return { tick, write };
})();
window.CheckIn = CheckIn;
window.Notes = Notes;
