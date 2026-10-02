// Planning coach. Kei estimates how long things will take (padded for your
// pace), notices deadlines and tests coming up without enough time booked,
// and nudges you more often and more urgently as they get closer. He can find
// real free slots on your timeline and book work sessions; sessions are linked
// to their deadline through `planFor`, so booked time counts.

const Coach = (() => {
  const MAX_SESSION = 120; // longer work gets split across sessions
  const MIN_SESSION = 30;

  // -------------------------------------------------------- estimating ---
  // Base minutes for someone working at a normal pace, from what the task is.
  function heuristicMinutes(inst) {
    const it = inst.item;
    const t = `${inst.title} ${inst.label || ""}`.toLowerCase();
    const pct = Number((t.match(/(\d{1,2})\s*%/) || [])[1]) || 0;
    if (/\b(test|exam|midterm|final)\b/.test(t)) return pct >= 30 ? 300 : pct >= 20 ? 180 : pct ? 150 : 120;
    if (/\bquiz\b/.test(t)) return 45;
    if (/\blc\b|learningcurve/.test(t)) return 30 + 10 * Math.max(0, (t.match(/\d+/g) || []).length - 1);
    if (/\b(email|form|upload|check|unsubscribe|sign up|call|book|schedule|decide|order)\b/.test(t)) return 15;
    if (/\b(essay|paper|report|review|reflection|assignment|project|presentation|portfolio|research)\b/.test(t))
      return pct >= 20 ? 300 : pct >= 10 ? 180 : it.size === "big" ? 180 : 120;
    return it.size === "big" ? 120 : 45;
  }
  const pace = () => Number(M.settings.pace) || 1.5;
  // minutes you'll actually need: your estimate if you set one, else his
  function baseMinutes(inst) {
    const it = inst.item;
    return Number(it.estimate) || Number(it.estimateAI) || heuristicMinutes(inst);
  }
  const roundQ = (m) => Math.max(15, Math.round(m / 15) * 15);
  const neededMinutes = (inst) => roundQ(baseMinutes(inst) * pace());

  // With an AI engine, ask once per task for a better base estimate.
  const asked = new Set();
  async function refineEstimate(inst) {
    const it = inst.item;
    if (it.estimate || it.estimateAI || asked.has(it.id) || activeEngine() === "scripted") return;
    asked.add(it.id);
    const res = await llm({
      quick: true,
      system: "you estimate how long university and life tasks take for a typical student working at a normal pace. answer with json only.",
      messages: [{ role: "user", content: `task: "${inst.title}" (${groupLabel(it)})${it.notes ? `. notes: ${it.notes}` : ""}${it.subtasks.length ? `. subtasks: ${it.subtasks.map((s) => s.title).join(", ")}` : ""}.\nreply as {"minutes": <number>, "why": "<under 12 words>"}` }],
    });
    const m = Number((res?.text || "").match(/"minutes"\s*:\s*(\d+)/)?.[1]);
    if (m >= 5 && m <= 1200) {
      it.estimateAI = m;
      it.estimateWhy = (res.text.match(/"why"\s*:\s*"([^"]{0,120})"/) || [])[1] || "";
      save();
    }
  }

  // --------------------------------------------------- what needs time ---
  // anything with a deadline (or a test day) that takes real time
  function prepKind(inst) {
    if (inst.s.done || inst.s.lapsed || inst.item.optional) return null;
    if (inst.slotAt && /\b(test|exam|midterm|final)\b/i.test(inst.label || inst.title)) return "test";
    if (inst.dueAt && (inst.item.size === "big" || neededMinutes(inst) >= 60)) return "work";
    return null;
  }
  const targetAt = (inst) => inst.dueAt || inst.slotAt;

  // booked time that still counts: sessions in the future, or ones you did
  function bookedMinutes(inst) {
    const key = instKey(inst);
    const now = Date.now();
    return M.items.filter((it) => it.planFor === key).reduce((sum, it) => {
      const i = instance(it, "*");
      const end = (i.slotAt || 0) + (i.duration || 0) * 60_000;
      return sum + (i.s.done || end > now ? i.duration || 0 : 0);
    }, 0);
  }
  const remainingMinutes = (inst) => Math.max(0, neededMinutes(inst) - bookedMinutes(inst));

  // how urgent: 0 (a few days out) .. 4 (hours left)
  function urgency(inst) {
    const h = (targetAt(inst) - Date.now()) / 3600e3;
    // big jobs get urgent sooner: compare time left with the work left
    const work = remainingMinutes(inst) / 60;
    const eff = h - work * 2;
    return eff <= 2 ? 4 : eff <= 8 ? 3 : eff <= 24 ? 2 : eff <= 72 ? 1 : 0;
  }
  // minutes between nudges at each level, scaled by the intensity slider
  const GAP = [24 * 60, 6 * 60, 2 * 60, 45, 15];
  // eases off a little for a few hours when they said they're tired, stressed or sad (urgent ones barely change)
  const gapMs = (lvl) => GAP[lvl] * 60_000 * (1.5 - M.settings.intensity / 100) * (window.CheckIn?.gentle() && lvl < 3 ? 1.5 : 1);
  // start caring this many days ahead (more for bigger jobs), scaled by intensity
  const leadMs = (inst) => (2 + Math.min(4, neededMinutes(inst) / 90)) * 864e5 * (0.7 + (M.settings.intensity / 100) * 0.6);

  function needsTime() {
    const now = Date.now();
    const today = dayKey();
    return instancesBetween(today, addDays(today, 10))
      .filter((i) => {
        const at = targetAt(i);
        if (!prepKind(i) || !at || at <= now || at - now > leadMs(i)) return false;
        if (remainingMinutes(i) < MIN_SESSION) return false;
        if (i.s.planSnoozeUntil > now) return false;
        // "i've got it" only quiets him until things get more urgent
        return i.s.planDismissLevel == null || urgency(i) > i.s.planDismissLevel;
      })
      .sort((a, b) => urgency(b) - urgency(a) || targetAt(a) - targetAt(b));
  }

  // ------------------------------------------------------------- slots ---
  // "in 3 days" / "tomorrow" / "today" / "in 5 hours"
  function untilText(at) {
    const h = (at - Date.now()) / 3600e3;
    if (h < 1) return `in ${Math.max(1, Math.round(h * 60))} minutes`;
    if (h < 12) return `in ${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"}`;
    const n = Math.round((keyToDate(dayKey(new Date(at))) - keyToDate(dayKey())) / 864e5);
    return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
  }
  // "3 days" / "5 hours" / "40 minutes"
  function leftText(at) {
    const h = (at - Date.now()) / 3600e3;
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} minutes`;
    if (h < 36) return `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"}`;
    return `${Math.round(h / 24)} days`;
  }
  const durText = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);

  function freeWindows(day, { from = null, to = null } = {}) {
    const wake = hm2min(M.settings.wakeTime);
    const wind = hm2min(M.settings.windDownTime);
    let start = Math.max(wake, from ?? 0);
    const end = Math.min(wind > wake ? wind : 24 * 60 - 1, to ?? 24 * 60);
    if (day === dayKey()) start = Math.max(start, Math.ceil((nowMin() + 10) / 15) * 15);
    const busy = instancesOn(day)
      .filter((i) => i.start && !i.s.done)
      .map((i) => [hm2min(i.start) - 10, hm2min(i.start) + (i.duration || 30) + 10])
      .sort((a, b) => a[0] - b[0]);
    const out = [];
    let cur = start;
    for (const [s, e] of busy) {
      if (s > cur && s <= end) out.push([cur, Math.min(s, end)]);
      cur = Math.max(cur, e);
    }
    if (cur < end) out.push([cur, end]);
    return out.filter(([s, e]) => e - s >= MIN_SESSION);
  }

  // Find sessions adding up to `minutes` before the deadline. Prefers one
  // session per day; takes a shorter one if that's all that fits.
  function planSessions(inst, minutes, afterAt = 0) {
    const deadline = targetAt(inst);
    const count = Math.ceil(minutes / MAX_SESSION);
    const each = roundQ(minutes / count);
    const sessions = [];
    let left = minutes;
    let from = afterAt;
    for (let i = 0, d = dayKey(); i < 14 && left >= MIN_SESSION; i++, d = addDays(d, 1)) {
      const dayStart = new Date(`${d}T00:00`).getTime();
      if (dayStart > deadline) break;
      const lastMin = dayKey(new Date(deadline)) === d ? Math.floor((deadline - dayStart) / 60_000) - 30 : null;
      const firstMin = from > dayStart ? Math.ceil((from - dayStart) / 60_000 / 15) * 15 : null;
      const want = Math.min(each, left);
      const wins = freeWindows(d, { from: firstMin, to: lastMin }).map(([s, e]) => [Math.ceil(s / 15) * 15, e]);
      const fit = wins.find(([s, e]) => e - s >= want) || wins.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
      if (!fit) continue;
      const len = Math.min(want, Math.floor((fit[1] - fit[0]) / 15) * 15);
      if (len < MIN_SESSION) continue;
      sessions.push({ date: d, start: min2hm(fit[0]), minutes: len, at: dayStart + fit[0] * 60_000 });
      left -= len;
    }
    return { sessions, short: Math.max(0, left) };
  }

  function sessionText(s) {
    const day = s.date === dayKey() ? "today" : s.date === addDays(dayKey(), 1) ? "tomorrow" : keyToDate(s.date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toLowerCase();
    const t = (m) => new Date(`2000-01-01T${min2hm(m)}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
    const st = hm2min(s.start);
    return `${day} ${t(st)} to ${t(st + s.minutes)}`;
  }

  const vars = (inst) => ({
    task: inst.title.toLowerCase(),
    when: untilText(targetAt(inst)),
    left: leftText(targetAt(inst)),
    num: pad(inst.item.num),
    need: durText(remainingMinutes(inst)),
  });

  // ----------------------------------------------------------- talking ---
  async function aiNudge(inst, lvl) {
    if (activeEngine() === "scripted") return null;
    const kind = prepKind(inst);
    const res = await llm({
      quick: true,
      system: keiSystemPrompt(),
      messages: [{
        role: "user",
        content: `${keiContext()}\n\n${kind === "test" ? `test: ${inst.title}` : `TASK_${pad(inst.item.num)} "${inst.title}"`} is ${leftText(targetAt(inst))} away. it needs about ${durText(neededMinutes(inst))} (already padded because the operator works slower than average; mention that gently if it fits). booked so far: ${durText(bookedMinutes(inst))}. urgency ${lvl} of 4 (0 = a few days out, 4 = hours left and no time booked). in one or two short sentences, nudge them to schedule time for it and offer to find a slot. match your urgency to the level. no tags.`,
      }],
    });
    return res?.text ? sanitize(res.text.replace(/\[\[[^\]]*\]\]/g, "")).slice(0, 260) : null;
  }

  async function nudge(inst) {
    const lvl = urgency(inst);
    stateOf(inst).planNudgedAt = Date.now();
    save();
    await refineEstimate(inst);
    const pools = prepKind(inst) === "test" ? L.PLAN.test : L.PLAN.urgency;
    const line = (await aiNudge(inst, lvl)) || sl(pools[lvl], vars(inst));
    feel(lvl >= 3 ? (stage() === 1 ? "idle" : "flustered") : stage() === 1 ? "idle" : stage() === 2 ? "flustered" : "happy", 4000);
    if (lvl >= 3) twitchEars("both", 1.5);
    sfx.nudge();
    if (lvl >= 4) host.attention();
    say(line, {
      raw: activeEngine() !== "scripted",
      mood: lvl >= 3 ? "sad" : "shy",
      choices: [
        { label: "FIND TIME", fn: () => propose(inst) },
        { label: "I'VE GOT IT", fn: () => dismiss(inst) },
        { label: lvl >= 3 ? "LATER" : "TOMORROW", fn: () => later(inst) },
      ],
    });
  }

  function propose(inst, afterAt = 0) {
    const need = remainingMinutes(inst) || neededMinutes(inst);
    const { sessions, short } = planSessions(inst, need, afterAt);
    if (!sessions.length) {
      return say(sl(L.PLAN.noSlot, vars(inst)), { mood: "sad", choices: [{ label: "OPEN SCHEDULE", fn: () => { expand(); switchTab("schedule"); } }] });
    }
    const list = sessions.map(sessionText).join(", ");
    const v = { ...vars(inst), slot: list, need: durText(need), pace: pace() > 1 ? `${pace()}x` : "" };
    let line = sl(sessions.length > 1 ? L.PLAN.proposeSplit : L.PLAN.propose, v);
    if (pace() > 1 && Math.random() < 0.6) line += ` ${sl(L.PLAN.paceNote, v)}`;
    if (short) line += ` ${sl(L.PLAN.short, { ...v, short: durText(short) })}`;
    say(line, {
      mood: "shy",
      choices: [
        { label: sessions.length > 1 ? "BOOK THEM" : "YES", fn: () => schedule(inst, sessions) },
        { label: "OTHER TIMES", fn: () => propose(inst, sessions[0].at + sessions[0].minutes * 60_000) },
        { label: "NO", fn: () => dismiss(inst) },
      ],
    });
  }

  function schedule(inst, sessions) {
    const kind = prepKind(inst);
    for (const [n, s] of sessions.entries()) {
      newItem({
        title: `${kind === "test" ? "study for" : "work on"} ${inst.title}${sessions.length > 1 ? ` (${n + 1}/${sessions.length})` : ""}`,
        group: inst.item.group,
        sub: inst.item.sub,
        date: s.date,
        start: s.start,
        duration: s.minutes,
        icon: "pen",
        planFor: instKey(inst),
        notes: `time for TASK_${pad(inst.item.num)}${inst.due ? `, due ${fmtDue(inst.due)}` : ""}.`,
      });
    }
    save();
    renderAll();
    feel("happy", 3000);
    sfx.chime();
    say(sl(L.PLAN.scheduled, { ...vars(inst), slot: sessions.map(sessionText).join(", ") }));
  }

  function dismiss(inst) {
    stateOf(inst).planDismissLevel = urgency(inst);
    save();
    say(sl(L.PLAN.dismiss, vars(inst)), { mood: "shy" });
  }

  function later(inst) {
    const lvl = urgency(inst);
    let until;
    if (lvl >= 3) until = Date.now() + gapMs(lvl) * 2;
    else {
      const t = keyToDate(addDays(dayKey(), 1));
      const [h, m] = M.settings.wakeTime.split(":").map(Number);
      t.setHours(h, m + 30);
      until = Math.min(t.getTime(), targetAt(inst) - 12 * 3600e3); // never past the last day
    }
    stateOf(inst).planSnoozeUntil = until;
    save();
    say(sl(L.PLAN.later, vars(inst)), { mood: "shy" });
  }

  // ------------------------------------------------------------- clock ---
  // the most urgent thing that's due for a nudge; never two within 10 min
  let lastAny = Date.now() - 8 * 60_000;
  function tick() {
    if (!M?.introDone || R.alert || R.cutscenePlaying || isSleeping() || inQuiet() || M.kei.charge <= 0 || Study.focusing() || Study.isOpen() || Health.active()) return;
    const now = Date.now();
    if (now - lastAny < 10 * 60_000) return;
    const inst = needsTime().find((i) => now - (i.s.planNudgedAt || 0) >= gapMs(urgency(i)));
    if (!inst) return;
    lastAny = now;
    nudge(inst);
  }

  return { tick, needsTime, freeWindows, planSessions, propose, schedule, nudge, untilText, leftText, prepKind, neededMinutes, remainingMinutes, bookedMinutes, urgency, heuristicMinutes, durText };
})();
