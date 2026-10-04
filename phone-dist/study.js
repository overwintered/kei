// Study: pop quizzes and focus mode.
//
// Quizzes come from your course files (MEM > FILES) and, with an AI engine,
// whatever the course covers. He quizzes now and then, and more often on a
// subject the closer its test gets. Missed questions come back later.
//
// Focus mode: a timed session on one thing. He goes quiet, holds everything
// that isn't urgent, and steers off-topic chat back to the work.

const Study = (() => {
  const st = () => (M.study ||= { lastQuiz: {}, lastOffer: 0, deferUntil: 0, missed: [], log: [], focus: null });
  const now = () => Date.now();
  let quiz = null; // the quiz on screen: {sub, course, test, qs, i, score, answered}
  let busy = false;
  let lastIdleCheck = 0;

  // ------------------------------------------------------------ courses ---
  const courses = () => (M.groups.find((g) => g.id === "uni")?.subs || []).map((s) => ({ sub: s.id, name: s.name }));
  const courseName = (sub) => courses().find((c) => c.sub === sub)?.name.toLowerCase() || sub;
  const docsFor = (sub) => Memory.mem().docs.filter((d) => !d.private && d.sub === sub);
  // offline he can only quiz from files with enough real content in them
  const hasMaterial = (sub) => activeEngine() !== "scripted" || clozeQuestions(sub, 3).length >= 3;
  const isTest = (inst) => itemKind(inst.item) === "test" || /\b(test|exam|quiz|midterm|final)\b/i.test(inst.title);
  const isBig = (inst) => inst.item.size === "big" || /\b(midterm|final|exam)\b/i.test(inst.title);
  const testName = (inst) => inst.title.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase(); // "anth reading quiz: wk 5"
  const whenAt = (inst) => inst.dueAt || inst.slotAt || (inst.date ? new Date(`${inst.date}T09:00`).getTime() : null);

  function nextTest(sub) {
    const today = dayKey();
    return instancesBetween(today, addDays(today, 14))
      .filter((i) => i.item.sub === sub && isTest(i) && !i.s.done && whenAt(i) > now())
      .sort((a, b) => whenAt(a) - whenAt(b))[0] || null;
  }

  // how long to wait between quizzes on a subject, by how close its test is
  function gapFor(sub) {
    const t = nextTest(sub);
    if (!t) return 72 * 3600e3;
    const h = (whenAt(t) - now()) / 3600e3;
    if (isBig(t)) return (h <= 24 ? 3 : h <= 48 ? 4 : h <= 6 * 24 ? 10 : 20) * 3600e3;
    return (h <= 36 ? 8 : 72) * 3600e3; // small weekly quizzes only nudge it a little
  }
  const crunch = () => courses().some((c) => { const t = nextTest(c.sub); return t && isBig(t) && whenAt(t) - now() < 48 * 3600e3; });

  // the subject most overdue for a quiz, or null
  function dueSubject() {
    let best = null;
    for (const c of courses()) {
      if (!hasMaterial(c.sub)) continue;
      const over = now() - (st().lastQuiz[c.sub] || 0) - gapFor(c.sub);
      if (over >= 0 && (!best || over > best.over)) best = { ...c, over };
    }
    return best;
  }

  // is he free to start something? (no alert, no sleep, not mid-conversation...)
  function free() {
    return M.introDone && !isSleeping() && !R.alert && !R.cutscenePlaying && !R.cardOpen && !R.talking && !quiz && !focusing() && !R.focusBreak && !R.pendingCheckIn && !inQuiet();
  }

  // ------------------------------------------------------------- offers ---
  function maybeOffer() {
    const s = st();
    const m = nowMin();
    if (m < hm2min(M.settings.wakeTime) + 60 || m >= hm2min(M.settings.windDownTime)) return;
    if (now() < s.deferUntil) return;
    if (now() - s.lastOffer < (crunch() ? 90 : 180) * 60_000) return;
    const c = dueSubject();
    if (!c || !canInterject()) return;
    interjected();
    s.lastOffer = now();
    save();
    offer(c.sub);
  }

  function offer(sub) {
    const t = nextTest(sub);
    const course = courseName(sub);
    const vars = { course, test: t ? testName(t) : "", when: t ? Coach.untilText(whenAt(t)) : "" };
    const pool = !t || (whenAt(t) - now()) / 3600e3 > 14 * 24 ? L.QUIZ.offer : vars.when === "today" || vars.when.startsWith("in ") && /hour|minute/.test(vars.when) ? L.QUIZ.testDay : L.QUIZ.offerTest;
    feel("happy", 3000);
    sfx.nudge();
    say(sl(pool, vars), {
      mood: "happy",
      choices: [
        { label: "quiz me", fn: () => start(sub) },
        { label: "later", fn: () => later(sub) },
      ],
    });
  }

  function later(sub) {
    const t = nextTest(sub);
    const soon = t && whenAt(t) - now() < 48 * 3600e3;
    st().deferUntil = now() + (soon ? 60 : 120) * 60_000;
    save();
    say(sl(soon ? L.QUIZ.laterTest : L.QUIZ.later, { test: t ? testName(t) : "", when: t ? Coach.untilText(whenAt(t)) : "" }), { mood: soon ? "pout" : "happy" });
    if (soon) showMood("pout", 3000);
  }

  // ---------------------------------------------------------- questions ---
  const clean = (t) => String(t ?? "").replace(/\s*[—–]\s*/g, ", ").trim();
  function valid(q) {
    if (!q || typeof q.q !== "string" || !q.q.trim()) return false;
    if (q.type === "short") return typeof q.answer === "string" && q.answer.trim();
    return Array.isArray(q.choices) && q.choices.length >= 3 && q.choices.length <= 5 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length;
  }
  function normalise(q) {
    const out = { type: q.type === "short" ? "short" : "mc", q: clean(q.q), why: clean(q.why || "") };
    if (out.type === "short") out.answer = clean(q.answer);
    else { out.choices = q.choices.map(clean); out.answer = q.answer; }
    return out;
  }

  function excerpts(sub, test) {
    const docs = docsFor(sub);
    if (!docs.length) return [];
    const hits = test ? Memory.searchDocs(`${courseName(sub)} ${test.title}`, 3).filter((h) => h.d.sub === sub) : [];
    const all = docs.flatMap((d) => d.chunks.map((text, i) => ({ d, i, text })));
    const picks = [...hits];
    while (picks.length < 4 && picks.length < all.length) {
      const c = all[Math.floor(Math.random() * all.length)];
      if (!picks.includes(c)) picks.push(c);
    }
    return picks;
  }

  // questions about the course instead of its subject get thrown out
  const LOGISTICS = /\b(syllabus|brightspace|crowdmark|due date|deadline|weekly workload|hours? per week|grading|grade weight|worth \d+|office hours|late penalt|grace period|submit(ted)? (via|on)|course outline|instructor'?s? email|% of (the |your )?(final )?grade)\b/i;
  async function aiQuestions(sub, test, n) {
    const ex = excerpts(sub, test);
    const notes = M.items.filter((it) => it.sub === sub && it.notes).map((it) => `${it.title}: ${it.notes}`).slice(0, 8);
    const res = await llm({
      quick: true,
      system: "you write short, fair study quiz questions for a university student. answer with json only.",
      messages: [{
        role: "user",
        content: `course: ${courses().find((c) => c.sub === sub)?.name || sub} (intro university level). today is ${dayKey()}.${test ? `\nupcoming: ${test.title} on ${test.date}. focus on what it will likely cover.` : ""}
${ex.length ? `their course files (mostly syllabi):\n${ex.map((c) => `[${c.d.name}]\n${c.text}`).join("\n\n").slice(0, 7000)}\n\nuse these files ONLY to work out which topics, chapters and readings they're studying right now (around today's date) and what the upcoming test covers. then write questions about the actual subject matter of those topics: concepts, definitions, theories, key people, examples, the way the course's instructor would. never ask about the syllabus itself: no dates, deadlines, due dates, grading weights, policies, office hours, schedules or course logistics.` : "no course files were provided. ask about core concepts an intro course like this covers in its first weeks."}
${notes.length ? `their schedule notes for this course (only hints about which topics are current; ignore every date, deadline and platform in them):\n${notes.join("\n")}` : ""}

write ${n} questions. mostly multiple choice with 4 options; at most one short-answer question whose answer is 1 to 4 words. vary the topics. no trick questions. each gets a one-line explanation under 20 words.
first decide the 3 to 6 subject-matter topics they're on right now (e.g. "kinship and descent", "classical conditioning"), then write every question about those topics, using what you know about the subject.
reply as json only: {"topics": ["..."], "questions": [{"type": "mc", "q": "...", "choices": ["...", "...", "...", "..."], "answer": 0, "why": "..."}, {"type": "short", "q": "...", "answer": "...", "why": "..."}]}`,
      }],
    });
    try {
      const j = JSON.parse((res?.text || "").match(/\{[\s\S]*\}/)?.[0] || "{}");
      return (j.questions || []).filter(valid).filter((q) => !LOGISTICS.test([q.q, ...(q.choices || [])].join(" "))).map(normalise).slice(0, n);
    } catch {
      return [];
    }
  }

  // offline: fill-in-the-blank from sentences in their files
  const STOPW = new Set("because between through without within during before after should would could their there these those which while where about other another being having".split(" "));
  function clozeQuestions(sub, n) {
    const text = docsFor(sub).flatMap((d) => d.chunks).join("\n");
    // skip syllabus logistics: dates, grading, deadlines, policies
    const ADMIN = /\d|%|\b(due|deadline|late|grade|grading|marks?|office hours|email|policy|policies|syllabus|attendance|submit|submission|extension|quiz|exam|midterm|final|assignment|week|tutorial|lecture|room|instructor|professor|ta)\b/i;
    const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 50 && s.length <= 220 && !/@|https?:/.test(s) && !ADMIN.test(s));
    const freq = new Map();
    for (const w of text.toLowerCase().match(/[a-z][a-z-]{5,}/g) || []) if (!STOPW.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
    const terms = [...freq.entries()].filter(([, c]) => c >= 2).map(([w]) => w);
    if (terms.length < 4) return [];
    const out = [];
    const used = new Set(); // one question per answer word
    for (const s of sentences.sort(() => Math.random() - 0.5)) {
      if (out.length >= n) break;
      const cand = (s.toLowerCase().match(/[a-z][a-z-]{5,}/g) || []).filter((w) => terms.includes(w) && !used.has(w));
      if (!cand.length) continue;
      const word = cand.sort((a, b) => b.length - a.length)[0];
      const others = terms.filter((t) => t !== word).sort(() => Math.random() - 0.5).slice(0, 3);
      if (others.length < 3) continue;
      used.add(word);
      const choices = [word, ...others].sort(() => Math.random() - 0.5);
      out.push({ type: "mc", q: s.replace(new RegExp(`\\b${word}\\b`, "gi"), "_____"), choices, answer: choices.indexOf(word), why: "" });
    }
    return out;
  }

  // ---------------------------------------------------------------- quiz ---
  async function start(sub) {
    if (quiz || busy) return;
    busy = true;
    const test = nextTest(sub);
    const s = st();
    s.lastQuiz[sub] = now();
    save();
    expand({ fromUser: false });
    say(sl(L.QUIZ.thinking), { log: false });
    // one missed question comes back, then fresh ones
    const back = s.missed.filter((m) => m.sub === sub).sort((a, b) => a.at - b.at).slice(0, 1).map((m) => ({ ...m.q, back: true }));
    let fresh = [];
    if (activeEngine() !== "scripted") fresh = await aiQuestions(sub, test, 3 - back.length);
    if (fresh.length < 3 - back.length) fresh = [...fresh, ...clozeQuestions(sub, 3 - back.length - fresh.length)];
    busy = false;
    const qs = [...back, ...fresh].slice(0, 3);
    if (!qs.length) return say(sl(L.QUIZ.none), { mood: "sad" });
    quiz = { sub, course: courses().find((c) => c.sub === sub)?.name || sub, test, qs, i: 0, score: 0, answered: false, wrong: [] };
    render();
  }

  function render() {
    const q = quiz.qs[quiz.i];
    $("#quiz").hidden = false;
    $("#quiz-title").textContent = "POP QUIZ";
    $("#quiz-code").textContent = `${quiz.course.toUpperCase()}${quiz.test ? ` // ${quiz.test.title.toUpperCase()} ${Coach.untilText(whenAt(quiz.test)).toUpperCase()}` : ""}${q.back ? " // REVIEW" : ""}`;
    $("#quiz-prog").textContent = `${quiz.i + 1} / ${quiz.qs.length}`;
    $("#quiz-q").textContent = q.q;
    $("#quiz-why").hidden = true;
    $("#quiz-next").hidden = true;
    $("#quiz-choices").innerHTML = q.type === "mc" ? q.choices.map((c, i) => `<button type="button" class="chip quiz-choice" data-i="${i}"><b>${"ABCDE"[i]}</b> ${esc(c)}</button>`).join("") : "";
    $("#quiz-form").hidden = q.type !== "short";
    if (q.type === "short") { $("#quiz-input").value = ""; setTimeout(() => $("#quiz-input").focus(), 30); host.focus(); }
    fitAll();
  }

  async function answer(given) {
    if (!quiz || quiz.answered) return;
    const q = quiz.qs[quiz.i];
    quiz.answered = true;
    let right;
    if (q.type === "mc") {
      right = given === q.answer;
      $$("#quiz-choices .quiz-choice").forEach((b) => {
        const i = Number(b.dataset.i);
        b.disabled = true;
        b.classList.toggle("right", i === q.answer);
        b.classList.toggle("wrong", i === given && !right);
      });
    } else {
      $("#quiz-form").hidden = true;
      right = await gradeShort(q, given);
    }
    const shown = q.type === "mc" ? q.choices[q.answer] : q.answer;
    const s = st();
    if (right) {
      quiz.score++;
      if (q.back) s.missed = s.missed.filter((m) => m.q.q !== q.q);
      capped("quiz", 1, 6);
      feel("happy", 2500);
      sfx.chime();
      say(sl(L.QUIZ.right), { mood: "happy" });
    } else {
      quiz.wrong.push(q.q);
      if (!s.missed.some((m) => m.q.q === q.q)) s.missed.push({ sub: quiz.sub, q: { type: q.type, q: q.q, choices: q.choices, answer: q.answer, why: q.why }, at: now() });
      s.missed = s.missed.slice(-60);
      showMood("pout", 3500);
      say(sl(L.QUIZ.wrong, { answer: shown.toLowerCase() }), { mood: "pout", raw: stage() === 1 });
    }
    save();
    if (q.why) { $("#quiz-why").textContent = q.why; $("#quiz-why").hidden = false; }
    $("#quiz-next").textContent = quiz.i + 1 < quiz.qs.length ? "NEXT" : "FINISH";
    $("#quiz-next").hidden = false;
    fitAll();
  }

  async function gradeShort(q, given) {
    const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
    const a = norm(q.answer), g = new Set(norm(given));
    const overlap = a.length ? a.filter((w) => g.has(w) || [...g].some((x) => x.startsWith(w.slice(0, 5)))).length / a.length : 0;
    if (overlap >= 0.6) return true;
    if (activeEngine() === "scripted" || !String(given).trim()) return false;
    const res = await llm({ quick: true, system: "you grade one quiz answer. answer with json only.", messages: [{ role: "user", content: `question: ${q.q}\nexpected answer: ${q.answer}\nstudent answered: ${given}\nis the student's answer correct (same meaning, minor spelling mistakes are fine)? reply as json only: {"correct": true|false}` }] });
    try { return !!JSON.parse((res?.text || "").match(/\{[\s\S]*\}/)?.[0] || "{}").correct; } catch { return false; }
  }

  function next() {
    if (!quiz) return;
    if (quiz.i + 1 < quiz.qs.length) { quiz.i++; quiz.answered = false; return render(); }
    finish();
  }

  function finish() {
    const { score, qs, sub, wrong } = quiz;
    const total = qs.length;
    close();
    const s = st();
    s.log.push({ kind: "quiz", at: now(), sub, score, total, missed: wrong });
    s.log = s.log.slice(-300);
    addCharge(2);
    if (score === total) { capped("quizPerfect", 3, 6); feel("happy", 5000, { big: true }); sfx.big(); }
    save();
    const pool = score === total ? L.QUIZ.perfect : score >= total - 1 && total >= 3 ? L.QUIZ.good : L.QUIZ.low;
    say(sl(pool, { score, total }), { mood: score === total ? "happy" : score >= total - 1 ? "happy" : "pout" });
    if (score < total - 1) showMood("pout", 3000);
  }

  function quit() {
    if (!quiz) return;
    close();
    say(sl(L.QUIZ.quit), { mood: "sad" });
  }
  function close() {
    quiz = null;
    $("#quiz").hidden = true;
  }


  // -------------------------------------------------------------- focus ---
  const focusing = () => !!st().focus;
  const fmtLeft = (ms) => { const m = Math.max(0, Math.ceil(ms / 60_000)); return `${m} minute${m === 1 ? "" : "s"}`; };

  function focusStart({ inst = null, mins = 25, title = null, sub = null } = {}) {
    if (focusing()) return;
    mins = clamp(Math.round(mins) || 25, 5, 180);
    const it = inst?.item;
    st().focus = { title: (title || inst?.title || "work").toLowerCase(), itemId: it?.id || null, key: inst?.key || null, group: it?.group || (sub ? "uni" : null), sub: it?.sub || sub || null, start: now(), end: now() + mins * 60_000, mins, redirects: 0, idleWarned: false, held: 0 };
    R.focusBreak = null;
    save();
    body.classList.add("focusing");
    feel("happy", 2500);
    say(sl(L.FOCUS.start, { mins, task: st().focus.title }), { mood: "happy" });
    renderFocus();
  }

  function focusEnd(full) {
    const f = st().focus;
    if (!f) return;
    st().focus = null;
    body.classList.remove("focusing");
    const mins = full ? f.mins : Math.max(0, Math.round((now() - f.start) / 60_000));
    const s = st();
    s.log.push({ kind: "focus", at: now(), mins, title: f.title, sub: f.sub, full });
    s.log = s.log.slice(-300);
    if (mins >= 5) { capped("focus", full ? 3 : 1, 6); addCharge(full ? 5 : 1); }
    save();
    renderFocus();
    const inst = f.itemId ? findInst(f.itemId, f.key) : null;
    const held = f.held ? ` ${sl(L.FOCUS.heldBack, { n: f.held })}` : "";
    if (!full) return say(sl(L.FOCUS.quit, { mins }) + held, { mood: "sad" });
    sfx.big();
    feel("happy", 5000, { big: true });
    const choices = [
      ...(inst && !inst.s.done ? [{ label: "mark it done", fn: () => completeInstance(inst) }] : []),
      { label: "5 min break", fn: () => focusBreak(f) },
      { label: "another round", fn: () => focusStart({ inst, mins: f.mins, title: f.title }) },
    ];
    say(sl(L.FOCUS.done, { mins, task: f.title }) + held, { mood: "happy", choices });
  }

  function focusBreak(f) {
    R.focusBreak = { until: now() + 5 * 60_000, last: f };
    say(sl(L.FOCUS.breakStart), { mood: "happy" });
  }

  function renderFocus() {
    const f = st().focus;
    const el = $("#sb-focus");
    if (!el) return;
    el.textContent = f ? `FOCUS ${Math.max(0, Math.ceil((f.end - now()) / 60_000))}M` : "FOCUS";
    el.classList.toggle("on", !!f);
  }

  // chat while focusing: is this about the work?
  function onTopic(text) {
    const f = st().focus;
    const it = f.itemId ? M.items.find((x) => x.id === f.itemId) : null;
    const pool = [f.title, it?.notes, ...(it?.subtasks || []).map((x) => x.title || x.text || x), f.sub ? courseName(f.sub) : "", ...(f.sub ? docsFor(f.sub).map((d) => d.name) : [])].filter(Boolean).join(" ");
    const keys = new Set((pool.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !["the", "and", "for", "with", "work"].includes(w)));
    const said = String(text).toLowerCase();
    if ((said.match(/[a-z0-9]{3,}/g) || []).some((w) => keys.has(w))) return true;
    if (f.sub && docsFor(f.sub).length && /\?|^(what|who|how|why|define|explain)\b/.test(said) && fromNotes(text)) return true; // a question their notes answer
    return /\b(stuck|help me|how do i|define|explain|what does .+ mean|cite|citation|sources?|outline|thesis|paragraph|draft|study|notes|readings?|chapter|formula|word count|essay|assignment|homework|due)\b/.test(said);
  }
  // returns a scripted reply object when focus mode handles the message, else null
  function focusChat(text) {
    const f = st().focus;
    if (!f) return null;
    const s = text.toLowerCase();
    if (/\b(stop|end|quit|cancel|exit)\b.*\b(focus|session)\b|^(stop|stop focus|end focus)$/.test(s)) { setTimeout(() => focusEnd(false), 50); return { text: "", skip: true }; }
    if (/(how (long|much)( time)?|time left|minutes left)/.test(s)) return { text: sl(L.FOCUS.left, { left: fmtLeft(f.end - now()) }), mood: "happy" };
    // with an AI engine the AI judges what's on-topic (see focusPrompt)
    if (activeEngine() !== "scripted") return null;
    if (!onTopic(text)) return redirect();
    // offline and on-topic: answer from their notes if possible
    const hit = fromNotes(text);
    if (hit) return { text: sl(L.FOCUS.fromNotes, { doc: hit.doc, quote: hit.quote }), mood: "happy" };
    return { text: sl(L.FOCUS.onTopicHint, { task: f.title }), mood: "happy" };
  }
  // the sentence in their files that best matches a question
  function fromNotes(text) {
    const f = st().focus;
    const q = (String(text).toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !["what", "about", "again", "does", "mean", "explain", "define", "that", "this", "with", "there", "their"].includes(w));
    if (!q.length) return null;
    let best = null;
    for (const d of Memory.mem().docs.filter((x) => !x.private && (!f?.sub || x.sub === f.sub))) {
      for (const sent of d.chunks.join("\n").split(/(?<=[.!?])\s+|\n+/)) {
        const low = sent.toLowerCase();
        const score = q.filter((w) => low.includes(w)).length;
        if (score && sent.length < 260 && (!best || score > best.score)) best = { score, doc: d.name.replace(/\.[a-z]+$/i, "").toLowerCase(), quote: sent.trim().replace(/\.$/, "").toLowerCase() };
      }
    }
    return best;
  }
  // the AI didn't answer: fall back to the keyword check
  const fallback = (text) => (focusing() && !onTopic(text) ? redirect() : null);
  function redirect() {
    const f = st().focus;
    const tier = Math.min(2, f.redirects++);
    save();
    return { text: sl(L.FOCUS.redirect[tier], { task: f.title, left: fmtLeft(f.end - now()) }), mood: tier ? "pout" : "flustered", offtopic: true };
  }
  function focusPrompt() {
    const f = st().focus;
    if (!f) return "";
    return `\nFOCUS SESSION: the operator is in a focus session on "${f.title}" (${fmtLeft(f.end - now())} left). if their message is about that work or something it raises, help them properly and briefly. if it's off-topic, reply with one short line steering them back to work in your stage's voice and don't engage the topic${f.redirects ? ` (they've drifted ${f.redirects} time(s) already, so be firmer)` : ""}; then add [[focus: off]].`;
  }
  function countRedirect() {
    const f = st().focus;
    if (f) { f.redirects++; save(); }
  }
  const hold = () => { const f = st().focus; if (f) { f.held++; save(); } };

  // ---------------------------------------------------------------- tick ---
  async function tick() {
    const f = st().focus;
    if (f) {
      if (now() >= f.end) return focusEnd(true);
      renderFocus();
      if (now() - lastIdleCheck > 30_000) {
        lastIdleCheck = now();
        const idle = await host.idleSeconds?.();
        if (idle >= 300 && !f.idleWarned) { f.idleWarned = true; save(); say(sl(L.FOCUS.idle, { task: f.title }), { mood: "nervous" }); twitchEars("both", 1.2); }
        else if (idle < 60 && f.idleWarned) { f.idleWarned = false; save(); }
      }
      return;
    }
    if (R.focusBreak && now() >= R.focusBreak.until) {
      const last = R.focusBreak.last;
      R.focusBreak = null;
      const inst = last.itemId ? findInst(last.itemId, last.key) : null;
      sfx.nudge();
      return say(sl(L.FOCUS.breakOver), { mood: "happy", choices: [{ label: "another round", fn: () => focusStart({ inst, mins: last.mins, title: last.title }) }, { label: "done for now", fn: () => {} }] });
    }
    if (free()) maybeOffer();
  }

  // a scheduled study / assignment block just started: offer focus instead of a plain nudge
  function offerFocus(inst) {
    const mins = clamp(inst.duration || 25, 15, 90);
    say(sl(L.FOCUS.offer, { task: inst.title.toLowerCase(), mins }), {
      mood: "happy",
      choices: [{ label: `focus ${mins}m`, fn: () => focusStart({ inst, mins }) }, { label: "not now", fn: () => {} }],
    });
  }
  const studyBlock = (inst) => !inst.item.fixed && itemKind(inst.item) !== "class" && (inst.item.group === "uni" || !!inst.item.planFor || ["test", "deadline"].includes(itemKind(inst.item)) || /\b(study|review|homework|essay|assignment|readings?)\b/i.test(inst.title));

  function wire() {
    $("#quiz-choices").addEventListener("click", (e) => {
      const b = e.target.closest(".quiz-choice");
      if (b) answer(Number(b.dataset.i));
    });
    $("#quiz-form").addEventListener("submit", (e) => { e.preventDefault(); answer($("#quiz-input").value); });
    $("#quiz-next").addEventListener("click", next);
    $("#quiz-quit").addEventListener("click", quit);
    $("#sb-focus").addEventListener("click", () => {
      if (focusing()) {
        say(sl(L.FOCUS.left, { left: fmtLeft(st().focus.end - now()) }), { choices: [{ label: "stop focus", fn: () => focusEnd(false) }, { label: "keep going", fn: () => {} }] });
      } else {
        focusStart({ inst: topTasks(1)[0]?.t || null, mins: 25 });
      }
    });
  }

  // restored after a restart
  function boot() {
    const f = st().focus;
    if (!f) return renderFocus();
    if (now() >= f.end) return focusEnd(true);
    body.classList.add("focusing");
    renderFocus();
  }

  // for the journal and the AI: what happened today
  function daySummary(day = dayKey()) {
    const log = st().log.filter((e) => dayKey(new Date(e.at)) === day);
    const qz = log.filter((e) => e.kind === "quiz").map((e) => `${courseName(e.sub)} quiz ${e.score}/${e.total}${e.missed?.length ? ` (missed: ${e.missed.join("; ")})` : ""}`);
    const fc = log.filter((e) => e.kind === "focus");
    const mins = fc.reduce((n, e) => n + e.mins, 0);
    return { quizzes: qz, focusMins: mins, focusOn: [...new Set(fc.map((e) => e.title))] };
  }

  return { aiQuestions, wire, tick, boot, start, offer, focusing, focusStart, focusEnd, focusChat, fallback, focusPrompt, countRedirect, redirect, hold, offerFocus, studyBlock, daySummary, nextTest, courses, isOpen: () => !!quiz, free };
})();
window.Study = Study;
