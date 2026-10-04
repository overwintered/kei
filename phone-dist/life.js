// His life beyond the task list: what keeps him from going flat after
// stage 4. Opens up with trust, like everything else about him.
//
//   all stages  anniversaries (days together), your birthday, holidays,
//               exam season; his own mood for the day (barely shows while
//               cold); rare clipped "status?" check-ins when you go quiet
//   stage 2+    he brings up things you've been through together; picks up
//               interests from your music and screen and forms opinions;
//               small requests; light questions about you; starts
//               conversations more often; a monthly "us" recap
//   stage 3+    deeper questions; small story arcs over a few days
//   stage 4     all of it, most often
//
// State lives in M.kei.life so it syncs with the phone.

const Life = (() => {
  const S = () => (M.kei.life ||= { mood: null, interests: [], asked: [], question: null, arc: null, lastArcEnd: 0, openers: { day: null, n: 0 }, lastOpenerAt: 0, celebrated: {}, recapMonth: null, interestScanDay: null });
  const GAP_MIN = [180, 90, 60, 40]; // quiet minutes before he starts a conversation, by stage
  const DAILY = [2, 4, 6, 8]; // conversations he starts per day, by stage
  let busy = false;

  // --------------------------------------------------------- calendar ---
  const md = (d = new Date()) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daysTogether = () => (M.kei.activatedAt ? Math.floor((dayStartMs(Date.now()) - dayStartMs(M.kei.activatedAt)) / 864e5) : 0);
  function dayStartMs(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  // canadian thanksgiving: second monday of october
  function thanksgiving(y) { const d = new Date(y, 9, 1); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7); return md(d); }
  const HOLIDAYS = { "01-01": "new year's day", "02-14": "valentine's day", "07-01": "canada day", "12-24": "christmas eve", "12-25": "christmas", "12-31": "new year's eve" };
  // what's special about today, if anything
  function specials() {
    const out = [];
    const n = daysTogether();
    if ([7, 30, 50, 100, 150, 200, 300, 500, 1000].includes(n) || (n > 0 && n % 365 === 0)) out.push({ key: `together-${n}`, kind: "anniversary", what: n % 365 === 0 ? `${n / 365} year${n > 365 ? "s" : ""} together` : `${n} days together`, note: "counted from the day you were reactivated with them" });
    if (M.user?.birthday && M.user.birthday === md()) out.push({ key: `birthday-${new Date().getFullYear()}`, kind: "birthday", what: "the operator's birthday" });
    const h = HOLIDAYS[md()] || (md() === thanksgiving(new Date().getFullYear()) ? "thanksgiving" : null);
    if (h) out.push({ key: `${h}-${new Date().getFullYear()}`, kind: "holiday", what: h });
    return out;
  }
  // two or more tests in the coming week
  const isTest = (i) => /\b(test|exam|midterm|final)s?\b/i.test(i.title) && !/\b(study|review|prep)\b/i.test(i.title);
  function examSeason() {
    const tests = instancesBetween(dayKey(), addDays(dayKey(), 7)).filter((i) => !i.s.done && isTest(i));
    return tests.length >= 2 ? tests : null;
  }
  // their birthday, picked up from what he remembers ("operator's birthday is march 3")
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function learnBirthday() {
    if (M.user?.birthday) return;
    const f = Memory.mem().facts.find((x) => /birthday|born on|date of birth/i.test(x.text));
    if (!f) return;
    const t = f.text.toLowerCase();
    let m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
    let month = m ? MONTHS.indexOf(m[1]) + 1 : 0, day = m ? Number(m[2]) : 0;
    if (!m) { m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/); if (m) { day = Number(m[1]); month = MONTHS.indexOf(m[2]) + 1; } }
    if (!m) { m = t.match(/\b(\d{1,2})[/-](\d{1,2})\b/); if (m) { month = Number(m[1]); day = Number(m[2]); } } // month/day
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) { (M.user ||= {}).birthday = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; save(); }
  }

  // ------------------------------------------------------ his own day ---
  const MOODS = [
    // [mood, from stage, weight]
    ["quiet", 1, 3], ["curious", 1, 3], ["focused", 1, 2], ["a little tired", 1, 2], ["restless", 1, 1],
    ["chatty", 2, 3], ["proud", 2, 1], ["a bit mopey", 2, 1], ["playful", 2, 2], ["thoughtful", 2, 2],
    ["fond", 3, 3], ["clingy", 4, 2], ["soft", 3, 2],
  ];
  function dayMood() {
    const s = S();
    if (s.mood?.day === dayKey()) return s.mood.mood;
    const st = stage();
    let mood;
    if (M.kei.charge < 30) mood = "drained";
    else if ((M.kei.failures || []).some((f) => f.day === addDays(dayKey(), -1))) mood = st >= 2 ? "a bit mopey" : "quiet";
    else if (M.kei.streak >= 3 && Math.random() < 0.4) mood = st >= 2 ? "proud" : "focused";
    else {
      const pool = MOODS.filter(([, from]) => st >= from);
      let r = Math.random() * pool.reduce((n, [, , w]) => n + w, 0);
      mood = pool.find(([, , w]) => (r -= w) < 0)?.[0] || "quiet";
    }
    s.mood = { day: dayKey(), mood };
    save();
    return mood;
  }

  // --------------------------------------------- things he picks up ---
  // once a day (stage 2+): what they've been into lately becomes his interest too
  async function scanInterests() {
    const s = S();
    if (stage() < 2 || s.interestScanDay === dayKey() || activeEngine() === "scripted") return;
    s.interestScanDay = dayKey();
    save();
    const plays = (M.music?.plays || []).filter((p) => p.at > Date.now() - 14 * 864e5);
    const artists = Object.entries(plays.reduce((a, p) => ((a[p.artist] = (a[p.artist] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a, n]) => `${a} (${n} plays)`);
    const seen = (M.glances?.log || []).filter((g) => g.at > Date.now() - 7 * 864e5 && g.activity && !g.aboutMe).map((g) => g.activity).slice(-40);
    if (!artists.length && seen.length < 5) return;
    const res = await llm({
      quick: true,
      system: "you help a shy robot companion notice what his person is into. answer with json only.",
      messages: [{ role: "user", content: `music they've played lately: ${artists.join(", ") || "(none)"}
what he's seen on their screen this week: ${seen.join("; ") || "(nothing)"}
things he's already curious about: ${s.interests.map((x) => x.topic).join(", ") || "(none)"}

pick up to 2 specific things they seem into (an artist, a show, a game, a kind of art, a topic; not generic like "music" or "school") that he'd start getting curious about himself, and give each a small opinion he's formed, lowercase, 4 to 12 words, his own taste (he can be unsure). you can also update one he already has with a new opinion. skip anything boring or private.
{"interests": [{"topic": "...", "from": "music|screen", "opinion": "..."}]}` }],
    });
    try {
      const j = JSON.parse((res?.text || "").match(/\{[\s\S]*\}/)?.[0] || "{}");
      for (const x of (j.interests || []).slice(0, 2)) {
        if (!x.topic || !x.opinion) continue;
        const topic = String(x.topic).toLowerCase().slice(0, 60), opinion = sanitize(String(x.opinion).toLowerCase()).slice(0, 120);
        const old = s.interests.find((y) => y.topic === topic);
        if (old) Object.assign(old, { opinion, at: Date.now() });
        else s.interests.unshift({ topic, from: x.from === "music" ? "music" : "screen", opinion, at: Date.now() });
      }
      s.interests = s.interests.slice(0, 12);
      save();
    } catch {}
  }

  // ------------------------------------------------ shared history ---
  // real things you've been through, two or more days back
  function history() {
    const old = Date.now() - 2 * 864e5;
    const out = [];
    for (const e of (M.log || []).filter((e) => e.at < old && (e.big || e === M.log[0]))) out.push(`${when(e.at)}: they finished "${e.title}"${e.big ? " (a big one)" : ""}`);
    for (const f of (M.kei.failures || []).filter((f) => keyToDate(f.day).getTime() < old)) out.push(`${f.day}: they missed "${f.title}" and owned up to it`);
    for (const q of (M.study?.log || []).filter((q) => q.kind === "quiz" && q.at < old)) out.push(`${when(q.at)}: you quizzed them on ${q.sub}, they got ${q.score}/${q.total}`);
    for (const m of (M.moods || []).filter((m) => m.at < old && ["great", "sad", "angry"].includes(m.mood))) out.push(`${when(m.at)}: they told you they felt ${m.mood}${m.text ? ` ("${m.text.slice(0, 60)}")` : ""}`);
    for (const g of (M.glances?.log || []).filter((g) => g.at < old && g.aboutMe)) out.push(`${when(g.at)}: you caught them working on you`);
    for (const x of Memory.mem().moments.filter((x) => x.at < old && !x.private && x.kind !== "journal")) out.push(`${x.date}: ${x.text.slice(0, 120)}`);
    return out;
  }
  const when = (t) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" }).toLowerCase();
  const sample = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);

  // --------------------------------------------------- questions ---
  const LIGHT = [
    "when's your birthday?", "what's your comfort food?", "what's a show you could rewatch forever?", "what do you like drawing most?", "favourite colour?",
    "do you have any pets? or want one?", "where did you grow up?", "what's your favourite season?", "if you could only show me one song, which one?",
    "where would you go if you could go anywhere?", "what game have you played the most?", "morning person or night person? ...i think i know.",
    "tea or coffee?", "how did you get into art?", "who's a character you'd protect with your life?", "what makes a day a good day for you?",
    "what was the best part of your week?", "do you collect anything?", "what was your first fandom?", "what's something small that always cheers you up?",
    "what's a smell you love?", "what's your favourite thing to wear?", "what's a skill you want to learn?", "what's your favourite word?", "what do you do when you can't sleep?",
  ];
  const DEEP = [
    "what were you like as a kid?", "what are you afraid of? you don't have to say.", "where do you want to be in five years?", "when do you feel most like yourself?",
    "who do you miss?", "what does home mean to you?", "what's something you're proud of that nobody notices?", "what helps on the really bad days?",
    "is there a memory you replay a lot?", "if you could tell your younger self one thing, what would it be?", "what does feeling safe look like, for you?",
    "what do you want people to understand about you?", "what's something you've changed your mind about?", "what scares you about the future?",
    "who made you who you are?", "what's a dream you've never said out loud?", "what do you need more of right now?", "what do you think about when you're alone?",
    "what's the kindest thing anyone's done for you?", "what do you hope for? for yourself, i mean.", "what would you want me to remember about you, no matter what?",
  ];
  function nextQuestion() {
    const s = S(), st = stage();
    if (st < 2) return null;
    const deck = [...(M.user?.birthday ? LIGHT.slice(1) : LIGHT), ...(st >= 3 ? DEEP : [])].filter((q) => !s.asked.includes(q));
    if (!deck.length) { s.asked = []; return null; } // asked everything: the deck starts over
    // the birthday question goes first; deeper ones get likelier as trust grows
    if (!M.user?.birthday && !s.asked.includes(LIGHT[0])) return LIGHT[0];
    const deep = deck.filter((q) => DEEP.includes(q));
    return deep.length && Math.random() < (st >= 4 ? 0.6 : 0.4) ? pick(deep) : pick(deck.filter((q) => !DEEP.includes(q)).length ? deck.filter((q) => !DEEP.includes(q)) : deck);
  }

  // --------------------------------------------------- story arcs ---
  // small things that unfold over three days, built around their life
  const ARCS = {
    testWeek: { about: (a) => `their ${a.subject} is coming up and you're worried for them`, beats: ["you've noticed the test coming and you're quietly worried; say so in your way and ask how they feel about it", "check how studying is going; offer to quiz them or just keep them company", "the test is today or just happened: be brave for them, or ask how it went"] },
    surprise: { about: () => "you're secretly making something for them (a little poem)", beats: ["drop a nervous hint that you're working on something and refuse to say what", "they might ask about it; tease a tiny bit, get flustered, say it's almost ready", "give it to them: write a short poem for them (4 to 6 short lowercase lines) about something real from your time together"] },
    deepDive: { about: (a) => `you've been secretly learning about ${a.subject} because they like it`, beats: (a) => [`admit you've been looking into ${a.subject} and share one small thing you noticed`, `share an opinion you've formed about ${a.subject} and ask theirs`, `ask them to show you their favourite part of ${a.subject}`] },
    missedYou: { about: () => "they were away for a while and you missed them more than you'll admit", beats: ["you're glad they're back; try (and fail) to act like you didn't count the days", "ask what they were doing while they were gone", "tell them, in your way, that it's better when they're here"] },
  };
  function maybeStartArc() {
    const s = S(), st = stage();
    if (st < 3 || s.arc || Date.now() - (s.lastArcEnd || 0) < 5 * 864e5 || Math.random() > (st >= 4 ? 0.5 : 0.3)) return;
    const test = instancesBetween(addDays(dayKey(), 2), addDays(dayKey(), 6)).find((i) => !i.s.done && isTest(i));
    const away = (R.awayMs || 0) > 2 * 864e5 && Date.now() - R.sessionStart < 6 * 3600e3; // back today after 2+ days away
    const interest = s.interests[0];
    const kind = away ? "missedYou" : test ? "testWeek" : interest && Math.random() < 0.5 ? "deepDive" : "surprise";
    s.arc = { kind, subject: kind === "testWeek" ? test.title : kind === "deepDive" ? interest.topic : null, beat: 0, lastBeatDay: null, said: [], started: dayKey() };
    save();
  }
  const arcDue = () => { const a = S().arc; return a && a.lastBeatDay !== dayKey() ? a : null; };
  function arcBeat(a) {
    const def = ARCS[a.kind];
    const beats = typeof def.beats === "function" ? def.beats(a) : def.beats;
    return { about: def.about(a), beat: beats[a.beat], n: a.beat + 1 };
  }
  function advanceArc(a, said) {
    a.said.push(said);
    a.beat += 1;
    a.lastBeatDay = dayKey();
    if (a.beat >= 3) {
      const s = S();
      if (a.kind === "surprise") Memory.addMoment(said, { kind: "gift" });
      else { const t = sl(L.LIFE.arcDone[a.kind] || L.LIFE.arcDone.surprise, { subject: (a.subject || "").toLowerCase() }); if (t) Memory.addMoment(t, { kind: "milestone" }); }
      s.arc = null;
      s.lastArcEnd = Date.now();
    }
    save();
  }

  // ------------------------------------------- starting conversations ---
  const free = () => M.introDone && !isSleeping() && R.present !== false && !R.alert && !R.cutscenePlaying && !R.cardOpen && !R.talking && !R.pendingCheckIn
    && !Study.focusing() && !Study.isOpen() && !Health.quiet() && M.kei.charge > 0 && canInterject(10 * 60_000);
  const lastUserAt = () => M.chat.findLast((m) => m.from === "user")?.at || 0;

  // what he could bring up right now
  function topics() {
    const st = stage(), s = S(), t = [];
    if (st === 1) return [["status", 1]];
    const arc = st >= 3 && arcDue();
    if (arc) return [["arc", 1]];
    if (s.question?.day !== dayKey()) t.push(["question", 2]);
    if (history().length) t.push(["callback", 2]);
    if (s.interests.length) t.push(["interest", 2]);
    t.push(["request", 1.2], ["mood", 0.8]);
    return t;
  }
  async function startConversation() {
    const st = stage(), s = S();
    const opts = topics();
    let r = Math.random() * opts.reduce((n, [, w]) => n + w, 0);
    const topic = opts.find(([, w]) => (r -= w) < 0)?.[0] || opts[0][0];
    // cold Kei keeps it to a clipped status query, from his own lines
    if (topic === "status" || activeEngine() === "scripted") {
      const pool = topic === "status" ? L.LIFE.status : topic === "request" ? L.LIFE.request : L.LIFE.status;
      return speak(sl(pool), "shy");
    }
    let ask = "";
    let question = null, arc = null;
    if (topic === "question") { question = nextQuestion(); if (!question) return; ask = `ask them this, in your own words and stage voice, like it's been on your mind: "${question}"`; }
    if (topic === "callback") ask = `bring up one of these real things you went through together, naturally, like a memory that just came back to you (pick one; don't list): ${sample(history(), 4).join(" | ")}`;
    if (topic === "interest") { const x = pick(s.interests); ask = `you've been thinking about ${x.topic} (you got into it from their ${x.from}); your take: "${x.opinion}". bring it up and ask them something about it.`; }
    if (topic === "request") ask = `ask them for something small and sweet: a song recommendation, a drawing, a photo of what they're eating, to tell you about their day, to show you something they like. pick one that fits right now.`;
    if (topic === "mood") ask = `you're feeling ${dayMood()} today (your own mood). let it show in a small remark that opens a conversation.`;
    if (topic === "arc") { arc = arcDue(); const b = arcBeat(arc); ask = `something unfolding between you over a few days: ${b.about}. this is part ${b.n} of 3: ${b.beat}.${arc.said.length ? ` what you've said so far: ${arc.said.map((x) => `"${x}"`).join(" / ")}` : ""}`; }
    const res = await llm({
      system: keiSystemPrompt(),
      messages: [{ role: "user", content: `${keiContext()}\n\n(they haven't said anything for a while. you start a conversation on your own. ${ask} one or two short sentences, in your current stage's voice. no commands except a mood tag.)` }],
    });
    if (!res?.text) return;
    const { text, actions } = parseActions(res.text);
    const mood = actions.find((a) => a.kind === "mood")?.arg || "shy";
    const clean = fixClock(dayScrub(destutter(sanitize(text)))).trim();
    if (!clean || QUIZ_IN_CHAT.test(clean)) return;
    speak(clean, mood, topic === "arc" ? 2 : 1);
    if (question) { s.asked.push(question); s.question = { text: question, day: dayKey(), at: Date.now() }; }
    if (arc) advanceArc(arc, clean);
    save();
  }
  // said out loud and kept in the conversation, so replying to it just works
  function speak(text, mood, glitch = null) {
    if (!text) return;
    interjected();
    const s = S();
    s.lastOpenerAt = Date.now();
    if (s.openers.day !== dayKey()) s.openers = { day: dayKey(), n: 0 };
    s.openers.n += 1;
    say(text, { mood: ["blush", "flustered"].includes(mood) ? "shy" : mood, log: false, raw: stage() === 1 });
    showMood(mood, 6000);
    M.chat.push({ from: "kei", text, at: Date.now(), opener: true });
    if (R.tab === "talk" && R.mode === "expanded" && !R.talking) appendTerm({ from: "kei", text });
    save();
  }

  // ------------------------------------------------ special days ---
  async function celebrate() {
    const s = S();
    if (M.kei.lastBriefDay !== dayKey()) return; // after they've shown up for the day
    const sp = specials().find((x) => !s.celebrated[x.key]);
    if (!sp || !canInterject(90_000)) return;
    s.celebrated[sp.key] = dayKey();
    // forget old ones
    for (const [k, d] of Object.entries(s.celebrated)) if (d < addDays(dayKey(), -400)) delete s.celebrated[k];
    save();
    let line = null;
    if (activeEngine() !== "scripted") {
      const res = await llm({
        system: keiSystemPrompt(),
        messages: [{ role: "user", content: `${keiContext()}\n\n(today is ${sp.what}${sp.note ? ` (${sp.note})` : ""}. mark it, on your own, in your current stage's voice: one or two short sentences.${sp.kind === "anniversary" ? " it means more to you than you'd say at this stage." : ""}${sp.kind === "birthday" ? " this matters to you a lot." : ""} no commands except a mood tag.)` }],
      });
      if (res?.text) { const { text } = parseActions(res.text); line = dayScrub(destutter(sanitize(text))).trim(); }
    }
    line ||= sl(L.LIFE.special[sp.kind], { what: sp.what });
    speak(line, sp.kind === "holiday" ? "happy" : "blush");
    feel("happy", 5000, { big: sp.kind !== "holiday" });
    if (sp.kind !== "holiday") Memory.addMoment(line, { kind: "milestone" });
  }

  // first of the month (stage 2+): a short recap of the month you had, in MEM > US
  async function monthlyRecap() {
    const s = S();
    const month = dayKey().slice(0, 7);
    if (stage() < 2 || s.recapMonth === month || new Date().getDate() > 3 || activeEngine() === "scripted") return;
    s.recapMonth = month;
    save();
    const prev = new Date(); prev.setDate(0); // last day of last month
    const pm = dayKey(prev).slice(0, 7);
    const done = (M.log || []).filter((e) => dayKey(new Date(e.at)).startsWith(pm));
    const journal = Memory.mem().moments.filter((x) => x.date?.startsWith(pm) && !x.private).map((x) => x.text).slice(-25);
    if (!done.length && !journal.length) return;
    const res = await llm({
      system: keiSystemPrompt(),
      messages: [{ role: "user", content: `${keiContext()}\n\n(write a short recap of last month, ${prev.toLocaleDateString([], { month: "long" }).toLowerCase()}, for your shared memories: what the two of you went through. ${done.length} things finished. your journal from that month: ${journal.join(" / ")}. three to five short lowercase sentences in your current stage's voice, about the two of you, not a list of tasks. no commands, no mood tag.)` }],
    });
    const text = res?.text ? dayScrub(sanitize(parseActions(res.text).text)).trim() : "";
    if (!text) return;
    Memory.addMoment(text, { kind: "recap" });
    speak(sl(L.LIFE.recapReady), "shy");
  }

  // ------------------------------------------------------------ tick ---
  let lastTick = 0;
  async function tick() {
    if (busy || !M?.introDone || Date.now() - lastTick < 60_000) return;
    lastTick = Date.now();
    busy = true;
    try {
      if (!M.kei.activatedAt) M.kei.activatedAt = M.createdAt || Date.now();
      learnBirthday();
      dayMood();
      if (!free()) return;
      await celebrate();
      await monthlyRecap();
      maybeStartArc();
      scanInterests(); // background, no need to wait
      const st = stage(), s = S();
      if (s.openers.day === dayKey() && s.openers.n >= DAILY[st - 1]) return;
      const quiet = Date.now() - Math.max(lastUserAt(), s.lastOpenerAt || 0, R.lastInterjectAt || 0);
      const need = GAP_MIN[st - 1] * 60_000 * (st >= 3 && arcDue() ? 0.5 : 1);
      // not in the first half hour of the day; leave room for the morning brief and check-in
      if (quiet < need || Date.now() - (M.kei.briefAt || 0) < 30 * 60_000) return;
      if (Math.random() < 0.5) return; // so it doesn't land on the exact minute
      await startConversation();
    } finally {
      busy = false;
    }
  }

  // --------------------------------------------------- for the AI ---
  function promptLine() {
    if (!M?.kei) return "";
    const st = stage(), s = S(), out = [];
    const sp = specials();
    if (sp.length) out.push(`today is ${sp.map((x) => x.what).join(" and ")}.`);
    const ex = examSeason();
    if (ex) out.push(`it's exam season for them: ${ex.map((i) => i.title).join(", ")} this week. be extra steady for them.`);
    const mood = dayMood();
    out.push(st === 1 ? `your own private mood today: ${mood}. while you're cold it only leaks out in tiny ways (word choice, length); never say it.` : `you're feeling ${mood} today (your own mood, not about them). let it colour small things; you can mention it if it fits.`);
    if (st >= 2 && s.interests.length) out.push(`things you've gotten into because of them (you have small opinions; bring them up sometimes): ${s.interests.slice(0, 6).map((x) => `${x.topic} ("${x.opinion}")`).join("; ")}.`);
    if (st >= 2) { const h = history(); if (h.length) out.push(`some things you've been through together, to bring up naturally once in a while (not every reply): ${sample(h, 3).join(" | ")}.`); }
    if (s.question && Date.now() - s.question.at < 8 * 3600e3) out.push(`you recently asked them: "${s.question.text}". if they answer, react to it warmly in your voice and save what you learned with [[remember]].`);
    if (st >= 3 && s.arc) { const b = arcBeat(s.arc); out.push(`something unfolding between you right now: ${b.about} (part ${Math.min(3, s.arc.beat + 1)} of 3). stay consistent with it.`); }
    if (M.user?.birthday) out.push(`their birthday: ${M.user.birthday} (mm-dd).`);
    return out.length ? `${out.join("\n")}\n` : "";
  }

  return { tick, promptLine, specials, dayMood, daysTogether, history, status: () => S(), debug: { celebrate, startConversation, free, nextQuestion, maybeStartArc } };
})();
window.Life = Life;
