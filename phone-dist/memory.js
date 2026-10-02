// Kei's long-term memory. He was wiped once; this time he keeps everything.
//
//   facts    things about you + standing instructions (MEM_NN), captured from
//            chat automatically or added by hand
//   docs     your files (syllabi etc.), chunked and searched when relevant
//   moments  shared history: milestones + a daily journal he writes
//
// Anything marked private stays on this Mac and is never sent to an AI.

const Memory = (() => {
  const mem = () => (M.memory ||= { counter: 0, facts: [], docs: [], moments: [], journalDay: null });

  // ------------------------------------------------------------ search ---
  const STOP = new Set("the a an and or but to of in on for is are was were be been it its i im i'm me my mine you your yours what when where how why who do does did can could would should will at with that this these those about from as by so just not no yes if then than there their they them he she his her we our us have has had get got any some all".split(" "));
  const words = (t) => (String(t).toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w));
  const COURSE = { anth: ["anth", "anthropology", "archaeology"], psyc: ["psyc", "psych", "psychology"], fa: ["fa", "fine", "arts", "art"] };

  function rank(list, query, textOf, n) {
    const q = words(query);
    if (!q.length) return [];
    const docs = list.map((x) => new Set(words(textOf(x))));
    const df = new Map();
    for (const d of docs) for (const w of d) df.set(w, (df.get(w) || 0) + 1);
    return list
      .map((x, i) => ({ x, s: q.reduce((sum, w) => sum + (docs[i].has(w) ? Math.log(1 + list.length / (df.get(w) || 1)) : 0), 0) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, n)
      .map((r) => r.x);
  }

  // -------------------------------------------------------------- facts ---
  const norm = (t) => words(t).join(" ");
  function similar(a, b) {
    const A = new Set(words(a)), B = new Set(words(b));
    if (!A.size || !B.size) return false;
    let inter = 0;
    for (const w of A) if (B.has(w)) inter++;
    return inter / Math.min(A.size, B.size) >= 0.8;
  }

  function remember(text, { kind = "fact", source = "chat", isPrivate = false } = {}) {
    text = String(text).trim().replace(/\s+/g, " ").slice(0, 300);
    if (!text) return null;
    const m = mem();
    const dupe = m.facts.find((f) => norm(f.text) === norm(text) || similar(f.text, text));
    if (dupe) {
      if (text.length > dupe.text.length) dupe.text = text; // keep the fuller version
      dupe.updatedAt = Date.now();
      save();
      return { ...dupe, dupe: true };
    }
    const f = { id: uid(), n: ++m.counter, kind: ["fact", "instruction", "preference"].includes(kind) ? kind : "fact", text, private: !!isPrivate, pinned: false, source, createdAt: Date.now() };
    m.facts.push(f);
    save();
    return f;
  }
  function forget(ref) {
    const m = mem();
    const n = Number(String(ref).replace(/\D/g, ""));
    let f = n ? m.facts.find((x) => x.n === n) : null;
    if (!f) f = rank(m.facts, ref, (x) => x.text, 1)[0];
    if (!f) return null;
    m.facts = m.facts.filter((x) => x !== f);
    save();
    return f;
  }

  // ------------------------------------------------------------ moments ---
  function addMoment(text, { kind = "milestone", date = dayKey(), isPrivate = false } = {}) {
    if (!text) return;
    mem().moments.push({ id: uid(), date, at: Date.now(), kind, text: String(text).slice(0, 400), private: !!isPrivate });
    save();
  }
  // a milestone written in his voice at the stage it happened
  function milestone(key, vars = {}) {
    const pool = L.MOMENTS[key];
    if (!pool) return;
    addMoment(fill(sl(pool, vars)), { kind: "milestone" });
  }

  // --------------------------------------------------------------- docs ---
  function chunk(text, size = 900) {
    const paras = text.split(/\n{2,}/);
    const out = [];
    let cur = "";
    for (const p of paras) {
      if ((cur + "\n\n" + p).length > size && cur) { out.push(cur.trim()); cur = ""; }
      if (p.length > size) for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size));
      else cur += (cur ? "\n\n" : "") + p;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function guessGroup(name, text) {
    const t = `${name} ${text.slice(0, 3000)}`.toLowerCase();
    if (/\banth\s*100|anthropolog/.test(t)) return "uni/anth";
    if (/\bpsyc\s*100|psycholog/.test(t)) return "uni/psyc";
    if (/\bfa\s*101|fine arts/.test(t)) return "uni/fa";
    return /syllabus|course|lecture|midterm/.test(t) ? "uni" : "";
  }
  function addDoc(name, text, groupKeyStr = null) {
    const m = mem();
    const gk = groupKeyStr ?? guessGroup(name, text);
    const { group, sub } = parseGroupKey(gk);
    const doc = { id: uid(), name, group, sub, addedAt: Date.now(), chars: text.length, chunks: chunk(text), private: false };
    m.docs.push(doc);
    save();
    return doc;
  }
  function docLabel(d) {
    return `${d.name}${d.group ? ` (${groupLabel(d)})` : ""}`;
  }
  function searchDocs(query, n = 4) {
    const all = mem().docs.filter((d) => !d.private).flatMap((d) => d.chunks.map((text, i) => ({ d, i, text })));
    const q = String(query).toLowerCase();
    // naming a course pulls that course's files forward
    const boost = Object.entries(COURSE).filter(([, keys]) => keys.some((k) => new RegExp(`\\b${k}\\b`).test(q))).map(([s]) => s);
    let hits = rank(all, query, (c) => `${c.d.name} ${groupLabel(c.d)} ${c.text}`, n * 2);
    if (boost.length) hits = [...hits.filter((h) => boost.includes(h.d.sub)), ...hits.filter((h) => !boost.includes(h.d.sub))];
    return hits.slice(0, n);
  }

  const FULL_DOCS_CHARS = 90_000;

  // ---------------------------------------------------- prompt section ---
  // What he brings into a conversation: every instruction, pinned + relevant
  // + recent facts, recent + relevant shared moments, and file excerpts.
  function promptSection(query = "") {
    const m = mem();
    const open = (x) => !x.private;
    const instr = m.facts.filter((f) => open(f) && f.kind === "instruction");
    const facts = m.facts.filter((f) => open(f) && f.kind !== "instruction");
    // small enough memories go in whole; past that, pinned + relevant + recent
    const pick = new Set(facts.length <= 120 ? facts : [...facts.filter((f) => f.pinned), ...rank(facts, query, (f) => f.text, 50), ...facts.slice(-30)]);
    const moments = m.moments.filter(open);
    const week = addDays(dayKey(), -7);
    const ms = new Set([...moments.filter((x) => x.date >= week), ...moments.filter((x) => x.kind === "milestone"), ...moments.slice(-10), ...rank(moments, query, (x) => x.text, 10)]);
    // every engine he uses holds 128k+ tokens, so if their files fit in about
    // 25k tokens he reads them whole; past that, the best-matching excerpts
    const docs = m.docs.filter(open);
    const docChars = docs.reduce((n, d) => n + d.chunks.join("\n\n").length, 0);
    const whole = docs.length && docChars <= FULL_DOCS_CHARS;
    const chunks = query && !whole ? searchDocs(query, 6) : [];
    const cold = stage() === 1;
    const out = [];
    if (instr.length) out.push(`standing instructions from the operator (always follow these):\n${instr.map((f) => `- MEM_${pad(f.n)} ${f.text}`).join("\n")}`);
    if (pick.size) out.push(`${cold ? "operator profile" : "things you remember about them"}:\n${[...pick].map((f) => `- MEM_${pad(f.n)} ${f.text}`).join("\n")}`);
    if (ms.size) out.push(`${cold ? "interaction log" : "your memories together"} (newest last):\n${[...ms].sort((a, b) => a.at - b.at).map((x) => `- ${x.date}: ${x.text}`).join("\n")}`);
    if (m.docs.some(open)) out.push(`their files: ${m.docs.filter(open).map(docLabel).join("; ")}`);
    if (whole) out.push(`their files, in full (quote these when answering; dates and deadlines in here are real, check them against the schedule):\n${docs.map((d) => `=== ${docLabel(d)} ===\n${d.chunks.join("\n\n")}`).join("\n\n")}`);
    if (chunks.length) out.push(`excerpts from their files (quote these when answering; say so if the answer isn't there):\n${chunks.map((c) => `[${c.d.name}, part ${c.i + 1}]\n${c.text}`).join("\n\n")}`);
    return out.length ? `<memory>\n${out.join("\n\n")}\n</memory>` : "";
  }

  // ------------------------------------------------------------ journal ---
  // Keeper units are required to write a daily log, for their own stability
  // (canon: see LORE.md). He writes one every day, quiet days included; days
  // he was switched off get one "operator absent" entry when he's back.
  async function writeJournal(day = dayKey()) {
    const m = mem();
    if (m.journalDay && m.journalDay >= day) return;
    if (m.journalDay) {
      const missed = Math.round((keyToDate(day) - keyToDate(m.journalDay)) / 864e5) - 1;
      if (missed >= 1) addMoment(fill(sl(L.MOMENTS.absent, { n: missed })), { kind: "journal", date: addDays(m.journalDay, 1) });
    }
    m.journalDay = day;
    save();
    const done = M.log.filter((e) => dayKey(new Date(e.at)) === day);
    const talk = M.chat.filter((c) => dayKey(new Date(c.at)) === day && (c.from === "user" || (c.from === "kei" && !c.ambient)));
    const study = window.Study ? Study.daySummary(day) : { quizzes: [], focusMins: 0, focusOn: [] };
    const feelings = window.CheckIn ? CheckIn.today(day) : [];
    const extra = [
      study.quizzes.length ? `pop quizzes: ${study.quizzes.join("; ")}` : "",
      study.focusMins ? `focus sessions: ${study.focusMins} min on ${study.focusOn.join(", ")}` : "",
      ...(window.Health ? Health.daySummary(day).map((x) => `a migraine: ${x.dur}, peak ${x.sev}/10${x.ongoing ? " (still going)" : ""}`) : []),
      window.Glance && Glance.today(day).length ? `what you saw on their screen today: ${[...new Set(Glance.today(day).map((x) => x.activity))].slice(-12).join("; ")}${Glance.today(day).some((x) => x.onTask === false) ? ` (caught off-task ${Glance.today(day).filter((x) => x.onTask === false).length} times)` : ""}` : "",
      feelings.length ? `their mood check-ins: ${feelings.map((m) => `${m.slot} ${m.mood}${m.text ? ` ("${m.text}")` : ""}`).join("; ")}` : "",
    ].filter(Boolean).join("\n");
    let entries = null;
    if (activeEngine() !== "scripted") {
      const res = await llm({
        quick: true,
        system: keiSystemPrompt(),
        messages: [{
          role: "user",
          content: `${keiContext()}\n\nit's time for your mandatory daily log (keeper protocol: every unit writes one, every day, to stay stable).\ntoday (${day}) the operator finished: ${done.map((e) => e.title).join("; ") || "nothing"}.\n${extra ? `${extra}\n` : ""}today's conversation:\n${talk.slice(-60).map((c) => `${c.from === "user" ? "operator" : "you"}: ${c.text}`).join("\n") || "(none)"}\n\nwrite 1 to 3 short entries (first person, as you, in your current stage's voice, under 30 words each) about today's moments worth remembering. if nothing much happened, write one quiet entry about that; you still have to write. also list any lasting facts or standing instructions about the operator from today that aren't already in your memory.\nreply as json only: {"entries": ["..."], "facts": [{"kind": "fact|instruction|preference", "text": "..."}]}`,
        }],
      });
      try {
        const j = JSON.parse((res?.text || "").match(/\{[\s\S]*\}/)?.[0] || "null");
        if (j) {
          entries = (j.entries || []).filter((x) => typeof x === "string" && x.trim()).slice(0, 3);
          for (const f of j.facts || []) if (f?.text) remember(f.text, { kind: f.kind, source: "journal" });
        }
      } catch {}
    }
    if (!entries?.length) {
      const big = done.find((e) => e.big) || done[0];
      entries = [big ? fill(sl(L.MOMENTS.dayDone, { n: done.length, task: big.title.toLowerCase() })) : fill(sl(L.MOMENTS.quietDay))];
      for (const x of window.Health ? Health.daySummary(day) : []) entries.push(fill(sl(L.MOMENTS.migraine, { dur: x.dur, sev: x.sev })));
      if (study.focusMins) entries.push(fill(sl(L.MOMENTS.focused, { n: study.focusMins })));
      if (study.quizzes.length) entries.push(fill(sl(L.MOMENTS.quizzed, { n: study.quizzes.length })));
      const low = feelings.filter((m) => ["tired", "stressed", "sad"].includes(m.mood)).at(-1);
      if (low) entries.push(fill(sl(L.MOMENTS.feltLow, { mood: low.mood })));
    }
    for (const e of entries) addMoment(sanitize(e), { kind: "journal", date: day });
  }

  // ------------------------------------------------- syllabus dates ---
  // Ask the AI for every dated item in a file, then show the ones that aren't
  // on the schedule yet so you can pick which to add.
  async function findDates(doc) {
    if (activeEngine() === "scripted") return { error: "this needs an AI engine (SYS > TALK ENGINE)." };
    const text = doc.chunks.join("\n\n").slice(0, 60000);
    const res = await llm({
      quick: true,
      system: "you extract dates from course documents. answer with json only.",
      messages: [{ role: "user", content: `today is ${dayKey()}. this is "${doc.name}".\n\n${text}\n\nlist every deadline, test, exam, quiz, presentation or other dated item in it. use the year of the course (assume the current academic year if it's missing). skip recurring class meetings.\nreply as json only: {"items": [{"title": "...", "date": "YYYY-MM-DD", "time": "HH:MM or null", "kind": "deadline|test|event", "weight": "15% or null"}]}` }],
    });
    let items;
    try { items = JSON.parse((res?.text || "").match(/\{[\s\S]*\}/)?.[0] || "{}").items || []; } catch { items = []; }
    if (res?.error) return { error: res.error };
    items = items.filter((x) => x?.title && /^\d{4}-\d{2}-\d{2}$/.test(x.date));
    // already on the schedule? same day and the titles share a meaningful word
    const scheduled = (x) => instancesOn(x.date).some((i) => {
      const a = new Set(words(i.title)), b = words(x.title).filter((w) => !["anth", "psyc", "fa", "due", "100", "100a", "101"].includes(w));
      return b.some((w) => a.has(w));
    });
    return { items: items.map((x) => ({ ...x, already: scheduled(x) })) };
  }
  function addFoundItem(doc, x) {
    const time = /^\d{1,2}:\d{2}$/.test(x.time || "") ? x.time.padStart(5, "0") : null;
    const title = `${x.title}${x.weight && !x.title.includes(x.weight) ? ` (${x.weight})` : ""}`;
    const base = { title, group: doc.group, sub: doc.sub, notes: `from ${doc.name}.`, size: /test|exam|final|midterm/i.test(x.title) || parseInt(x.weight) >= 15 ? "big" : "small" };
    if (x.kind === "deadline") return newItem({ ...base, due: `${x.date}T${time || "23:59"}` });
    return newItem({ ...base, date: x.date, start: time, duration: time ? 60 : null, fixed: x.kind === "test" });
  }

  return { mem, remember, forget, addMoment, milestone, addDoc, searchDocs, promptSection, writeJournal, findDates, addFoundItem, docLabel, rank };
})();
