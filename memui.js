// MEM tab: what he remembers about you and your history together. (FILES is drawn into SYS from here too.)
// Labels follow the relationship: a cold "profile" / "log" at first, "us" later.

const MemUI = (() => {
  let view = "facts";
  let editing = null; // fact id being edited

  const labels = () => {
    const st = stage();
    return { facts: st === 1 ? "PROFILE" : "ABOUT YOU", files: "FILES", us: st === 1 ? "LOG" : st === 2 ? "MEMORIES" : "US", mood: st === 1 ? "CONDITION" : "MOOD", health: "HEALTH", activity: st === 1 ? "ACTIVITY LOG" : "ACTIVITY" };
  };
  const when = (t) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
  const chip = (act, label, on = false) => `<button type="button" class="chip ${on ? "solid" : ""}" data-act="${act}">${label}</button>`;

  // CONDITION as a line chart: great at the top, sad/angry at the bottom
  const LEVEL = { great: 4, okay: 3, tired: 2, stressed: 2, sad: 1, angry: 1 };
  const MOOD_COL = { great: "#7fd68a", okay: "var(--primary)", tired: "#8fb3ff", stressed: "#c79cff", sad: "#6b88ff", angry: "#ff5a4a" };
  // ranges: [key, label, how far back, tick spacing, how dots are grouped]
  // today and 3 days show every check-in; longer ranges average into buckets
  const RANGES = [
    ["today", "TODAY", null, 3 * 3600e3, null],
    ["3d", "3 DAYS", 3 * 864e5, 864e5, null],
    ["2w", "2 WEEKS", 14, 2 * 864e5, 1],
    ["1m", "MONTH", 30, 7 * 864e5, 3],
    ["6m", "6 MONTHS", 182, "month", 7],
    ["1y", "YEAR", 12, "month", "month"],
  ];
  let moodRange = "2w";
  const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  // bucket edges ending tonight: every n days, or calendar months
  function buckets(count, size) {
    const out = [];
    if (size === "month") {
      const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
      for (let i = 0; i < count; i++) { const e = new Date(d); e.setMonth(e.getMonth() + 1); out.unshift([d.getTime(), e.getTime()]); d.setMonth(d.getMonth() - 1); }
      return out;
    }
    let e = dayStart(Date.now()) + 864e5;
    const n = Math.ceil(count / size);
    for (let i = 0; i < n; i++) { const b = new Date(e); b.setDate(b.getDate() - size); out.unshift([b.getTime(), e]); e = b.getTime(); }
    return out;
  }
  function moodChart() {
    const W = 320, H = 160, L0 = 84, R0 = 10, T0 = 10, B0 = 22;
    const [key, , back, step, size] = RANGES.find((r) => r[0] === moodRange) || RANGES[2];
    const raw = size == null;
    const end = raw ? Date.now() : dayStart(Date.now()) + 864e5;
    const groups = raw ? null : buckets(back, size);
    const start = raw ? (back ? end - back : dayStart(end)) : groups[0][0];
    const all = (M.moods || []).filter((x) => LEVEL[x.mood] && x.at >= start && x.at < end).sort((a, b) => a.at - b.at);
    const X = (t) => L0 + ((t - start) / Math.max(1, end - start)) * (W - L0 - R0);
    const Y = (lv) => T0 + ((4 - lv) / 3) * (H - T0 - B0);
    const fmtD = (t, o) => new Date(t).toLocaleDateString([], o);

    // the dots: every check-in, or one per bucket
    let pts;
    if (raw) {
      pts = all.map((p) => ({ x: X(p.at), lv: LEVEL[p.mood], mood: p.mood, at: p.at,
        tip: `${new Date(p.at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${p.mood}${p.slot ? ` (${p.slot})` : ""}${p.text ? `: ${p.text}` : ""}` }));
    } else {
      pts = [];
      groups.forEach(([b, e], i) => {
        const inB = all.filter((p) => p.at >= b && p.at < e);
        if (!inB.length) return;
        const lvs = inB.map((p) => LEVEL[p.mood]);
        const avg = lvs.reduce((a, c) => a + c, 0) / lvs.length;
        // colour: the most common mood (ties go to the latest)
        const count = {};
        for (const p of inB) count[p.mood] = (count[p.mood] || 0) + 1;
        const top = Math.max(...Object.values(count));
        const mood = [...inB].reverse().find((p) => count[p.mood] === top).mood;
        const span = size === "month" ? fmtD(b, { month: "short", year: "numeric" })
          : size === 1 ? fmtD(b, { weekday: "short", month: "short", day: "numeric" })
          : `${fmtD(b, { month: "short", day: "numeric" })} to ${fmtD(e - 1, { month: "short", day: "numeric" })}`;
        pts.push({ x: X((b + e) / 2), lv: avg, lo: Math.min(...lvs), hi: Math.max(...lvs), mood, i,
          tip: `${span} · ${inB.length} check-in${inB.length > 1 ? "s" : ""}: ${inB.map((p) => p.mood).join(", ")}` });
      });
    }

    const rows = [[4, "GREAT"], [3, "OKAY"], [2, "TIRED/STRESSED"], [1, "SAD / ANGRY"]];
    let svg = rows.map(([lv, name]) => `<line x1="${L0}" x2="${W - R0}" y1="${Y(lv)}" y2="${Y(lv)}" class="mc-grid"/><text x="${L0 - 6}" y="${Y(lv) + 3}" class="mc-y">${name}</text>`).join("");
    // x-axis ticks
    const ticks = [];
    if (typeof step === "number") {
      const t0 = new Date(start);
      if (step < 864e5) t0.setHours(Math.ceil(t0.getHours() / 3) * 3, 0, 0, 0); else if (t0.getTime() !== dayStart(start)) t0.setHours(24, 0, 0, 0);
      for (let t = t0.getTime(); t < end; t += step) ticks.push(t);
    } else {
      const d = new Date(start); if (d.getDate() !== 1 || d.getHours()) { d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + 1); }
      for (; d.getTime() < end; d.setMonth(d.getMonth() + 1)) ticks.push(d.getTime());
    }
    let lastMonth = -1;
    for (const t of ticks) {
      const m = new Date(t).getMonth();
      const label = key === "today" ? new Date(t).toLocaleTimeString([], { hour: "numeric" })
        : key === "3d" ? fmtD(t, { weekday: "short" })
        : key === "2w" || key === "1m" ? (m !== lastMonth ? fmtD(t, { month: "short", day: "numeric" }) : String(new Date(t).getDate())) // month name only where it changes
        : fmtD(t, { month: "short" });
      // on the year view, month names sit under the middle of their month
      const lx = key === "1y" ? X(t + 15 * 864e5) : X(t);
      lastMonth = m;
      svg += `<line x1="${X(t)}" x2="${X(t)}" y1="${T0}" y2="${H - B0}" class="mc-tick"/><text x="${lx}" y="${H - 8}" class="mc-x">${label.toUpperCase()}</text>`;
    }
    // swings: a faint line from the lowest to the highest check-in in each bucket
    if (!raw) svg += pts.filter((p) => p.hi > p.lo).map((p) => `<line x1="${p.x.toFixed(1)}" x2="${p.x.toFixed(1)}" y1="${Y(p.hi)}" y2="${Y(p.lo)}" class="mc-span"/>`).join("");
    // the line: dashed where buckets in between have no check-ins
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      const gap = !raw && b.i - a.i > 1;
      svg += `<line x1="${a.x.toFixed(1)}" y1="${Y(a.lv).toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${Y(b.lv).toFixed(1)}" class="mc-line${gap ? " gap" : ""}"/>`;
    }
    svg += pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${Y(p.lv).toFixed(1)}" r="${raw && pts.length > 40 ? 2.4 : 3.6}" fill="${MOOD_COL[p.mood]}" class="mc-pt"><title>${esc(p.tip)}</title></circle>`).join("");
    // every-check-in views: a time on each dot, skipping only labels that would overlap
    if (raw) {
      let lastX = -99, lastLv = 0;
      for (const p of pts) {
        const d = new Date(p.at);
        const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M/i, (m, a) => a.toLowerCase());
        const label = key === "today" ? t : `${fmtD(p.at, { weekday: "short" }).slice(0, 2).toUpperCase()} ${t}`;
        const room = label.length * 3.2;
        if ((p.x - lastX < room && p.lv === lastLv) || p.x - lastX < room / 2) continue;
        const lx = Math.min(W - room / 2, Math.max(L0 + room / 2, p.x)); // keep it inside the chart
        svg += `<text x="${lx.toFixed(1)}" y="${p.lv === 4 ? Y(p.lv) + 11 : Y(p.lv) - 6}" class="mc-t">${label}</text>`;
        lastX = p.x; lastLv = p.lv;
      }
    }
    const ranges = `<label class="mc-range">SHOWING <select id="mood-range">${RANGES.map(([k, l]) => `<option value="${k}" ${k === moodRange ? "selected" : ""}>${l === "TODAY" ? "today" : `past ${l.toLowerCase()}`}</option>`).join("")}</select></label>`;
    const note = raw ? "" : `<div class="tiny muted mc-note">${{ 1: "each dot is a day's average", 3: "each dot averages 3 days", 7: "each dot averages a week", month: "each dot averages a month" }[size]}. the faint line shows that stretch's highest and lowest. hover a dot for its check-ins.</div>`;
    const empty = pts.length ? "" : `<text x="${(L0 + W) / 2}" y="${H / 2}" class="mc-empty">${stage() === 1 ? "NO DATA IN RANGE" : "no check-ins in this range"}</text>`;
    return `<div class="mood-chart">${ranges}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="mood over time">${svg}${empty}</svg>${note}</div>`;
  }

  // FILES lives in SYS: your course files plus anything recovered from the DCS archive
  function filesHTML() {
    const m = Memory.mem();
    let out = "";
      out += `<div class="row"><button type="button" class="chip solid" data-act="add-file">ADD FILE</button><button type="button" class="chip" data-act="paste">PASTE TEXT</button></div>`;
      out += `<div class="tiny muted">syllabi, course outlines, notes. pdf, word or text. read here on your mac; he searches them when you ask.</div>`;
      out += m.docs.slice().reverse().map((d) => `<div class="mem-row ${d.private ? "priv" : ""}" data-id="${d.id}">
        <div class="mem-text">${esc(d.name)}</div>
        <div class="mem-meta"><select data-act="group">${groupOptions().map(([v, l]) => `<option value="${v}" ${v === groupKey(d) ? "selected" : ""}>${esc(v ? l : "no group")}</option>`).join("")}</select>
        <span>${d.chunks.length} part${d.chunks.length === 1 ? "" : "s"} · ${when(d.addedAt)}</span></div>
        <div class="mem-meta">${chip("view", "VIEW")}${chip("dates", "FIND DATES")}${chip("private", "PRIVATE", d.private)}${chip("del", "DELETE")}</div></div>`).join("") || `<div class="muted tiny mem-empty">no files yet.</div>`;
      // DCS documents found through easter eggs
      const lore = M.kei.loreFiles || [];
      if (lore.length) out += `<div class="mem-sec">DCS ARCHIVE // ${lore.length}</div>` + lore.map((k) => `<div class="mem-row"><div class="mem-text">${esc(window.LORE.FILES[k].name)}</div><div class="mem-meta"><span>recovered</span><button type="button" class="chip" data-lorefile="${k}">VIEW</button></div></div>`).join("");
    return out;
  }
  function renderFiles() {
    const el = $("#sys-files");
    if (el) el.innerHTML = filesHTML();
  }

  function render() {
    if (view === "files") view = "facts"; // files moved to SYS
    const lb = labels();
    $("#mem-sub").innerHTML = ["facts", "us", "activity", "mood", "health"].map((v) => `<button class="chip ${v === view ? "solid" : ""}" data-view="${v}">${lb[v]}</button>`).join("");
    const m = Memory.mem();
    let html = "";
    if (view === "facts") {
      html += `<form id="mem-add" class="row"><input name="text" placeholder="> remember something" autocomplete="off" /><select name="kind"><option value="fact">fact</option><option value="preference">preference</option><option value="instruction">instruction</option></select><button class="chip solid">ADD</button></form>`;
      html += `<div class="tiny muted">he saves these from your chats too. instructions are always followed. PRIVATE ones never leave this mac.</div>`;
      for (const [kind, title] of [["instruction", "INSTRUCTIONS"], ["preference", "PREFERENCES"], ["fact", stage() === 1 ? "OPERATOR PROFILE" : "THINGS ABOUT YOU"]]) {
        const list = m.facts.filter((f) => f.kind === kind).sort((a, b) => b.pinned - a.pinned || b.createdAt - a.createdAt);
        if (!list.length) continue;
        html += `<div class="mem-sec">${title} // ${list.length}</div>`;
        html += list.map((f) => `<div class="mem-row ${f.private ? "priv" : ""}" data-id="${f.id}">
          ${editing === f.id ? `<input class="mem-edit" value="${esc(f.text)}" />` : `<div class="mem-text" data-act="edit">${esc(f.text)}</div>`}
          <div class="mem-meta"><span>MEM_${pad(f.n)} · ${f.source === "you" ? "you added" : "from chat"} · ${when(f.createdAt)}</span>
          ${chip("pin", f.pinned ? "PINNED" : "PIN", f.pinned)}${chip("private", "PRIVATE", f.private)}${chip("del", "DELETE")}</div></div>`).join("");
      }
      if (!m.facts.length) html += `<div class="muted tiny mem-empty">${sl(L.MEMORY_LINES.empty)}</div>`;
    }
    if (view === "us") {
      html += `<form id="mem-moment" class="row"><input name="text" placeholder="> add a memory of your own" autocomplete="off" /><button class="chip solid">ADD</button></form>`;
      const byDay = {};
      for (const x of m.moments.slice().sort((a, b) => b.at - a.at)) (byDay[x.date] ||= []).push(x);
      html += Object.entries(byDay).map(([d, list]) => `<div class="mem-sec">${keyToDate(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</div>` +
        list.map((x) => `<div class="mem-row ${x.private ? "priv" : ""}" data-id="${x.id}"><div class="mem-text ${x.kind === "you" ? "" : "kei-voice"}">${x.kind === "you" ? esc(x.text) : fmt(x.text)}</div>
          <div class="mem-meta"><span>${{ journal: "journal", you: "you added", note: "note for you", recap: "monthly recap", gift: "made for you" }[x.kind] || "milestone"}</span>${chip("private", "PRIVATE", x.private)}${chip("del", "DELETE")}</div></div>`).join("")).join("") ||
        `<div class="muted tiny mem-empty">${stage() === 1 ? "log empty." : "no memories yet. they'll come."}</div>`;
    }
    if (view === "mood") {
      html += `<div class="tiny muted">he asks every morning, at noon, at night, and when you start a session. it shapes his tone for a few hours and goes in his journal.</div>`;
      html += `<div class="row wrap">${CheckIn.MOODS.map((m) => chip(`mood-${m}`, m)).join("")}</div>`;
      html += moodChart();
      const byDay = {};
      for (const x of (M.moods || []).slice().reverse()) (byDay[x.day] ||= []).push(x);
      html += Object.entries(byDay).slice(0, 30).map(([d, list]) => `<div class="mem-sec">${keyToDate(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</div>` +
        list.map((x) => `<div class="mood-row"><span class="when">${new Date(x.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><span class="slot">${esc(x.slot)}</span><span class="m">${esc(x.mood)}</span><span class="t">${esc(x.text || "")}</span></div>`).join("")).join("") ||
        `<div class="muted tiny mem-empty">${stage() === 1 ? "no condition reports logged." : "no check-ins yet."}</div>`;
    }
    if (view === "health") html += Health.memHTML();
    if (view === "activity") html += Glance.activityHTML();
    $("#mem-body").innerHTML = html;
    $(".mem-edit")?.focus();
  }

  // --------------------------------------------------------- dialogs ---
  async function addFiles() {
    const files = await host.importDocs();
    for (const f of files || []) {
      if (f.error || !f.text?.trim()) { say(stage() === 1 ? `file unreadable: ${f.name}.` : `um. i couldn't read ${f.name}. ${f.error ? "" : "it looks empty."}`, { log: false }); continue; }
      const d = Memory.addDoc(f.name, f.text);
      say(sl(L.MEMORY_LINES.file, { name: f.name.toLowerCase() }), { mood: "shy" });
      if (/syllabus|outline|course/i.test(`${f.name} ${f.text.slice(0, 2000)}`) && activeEngine() !== "scripted") setTimeout(() => offerDates(d), 2500);
    }
    renderFiles();
  }

  function paste() {
    openCard("paste", "PASTE TEXT", `${selfLabel()} // FILE INPUT`,
      `<input id="paste-name" placeholder="name, e.g. ANTH 100 syllabus" /><textarea id="paste-text" rows="10" placeholder="paste the text here"></textarea><div class="row end"><button class="chip solid" data-paste-save="1">SAVE</button></div>`);
  }

  function view_(d) {
    openCard("doc", d.name.toUpperCase(), `${selfLabel()} // ${groupLabel(d).toUpperCase()}`, `<pre class="doc-text">${esc(d.chunks.join("\n\n"))}</pre>`);
  }

  // syllabus dates: offer to add what isn't scheduled yet
  function offerDates(d) {
    say(stage() === 1 ? `${d.name.toLowerCase()} contains dates. compare against schedule?` : `um. ${d.name.toLowerCase()} has dates in it. want me to check them against your schedule?`, {
      mood: "shy",
      choices: [{ label: "CHECK DATES", fn: () => showDates(d) }, { label: "NOT NOW", fn: () => {} }],
    });
  }
  async function showDates(d) {
    expand();
    openCard("dates", "DATES FOUND", `${selfLabel()} // ${d.name.toUpperCase()}`, `<div class="muted">reading ${esc(d.name)}...</div>`);
    const res = await Memory.findDates(d);
    if (res.error) return ($("#card-body").innerHTML = `<div class="muted">${esc(res.error)}</div>`);
    if (!res.items.length) return ($("#card-body").innerHTML = `<div class="muted">no dates found in it.</div>`);
    R.foundDates = { doc: d, items: res.items };
    const fresh = res.items.filter((x) => !x.already).length;
    $("#card-body").innerHTML = `<div class="say">${fmt(decorate(stage() === 1 ? `${res.items.length} dated items found. ${fresh} not on schedule.` : `i found ${res.items.length} dates. ${fresh} of them aren't on your schedule yet.`, "shy"))}</div>` +
      res.items.map((x, i) => `<label class="found ${x.already ? "already" : ""}"><input type="checkbox" data-found="${i}" ${x.already ? "" : "checked"} />
        <span><b>${esc(x.title)}</b>${x.weight ? ` (${esc(x.weight)})` : ""}<br><span class="muted">${keyToDate(x.date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}${x.time ? ` ${esc(x.time)}` : ""} · ${esc(x.kind || "")}${x.already ? " · already on your schedule" : ""}</span></span></label>`).join("") +
      (External.mirror() ? `<div class="tiny muted">your tasks live in ticktick and your schedule in structured, so add the ones you need there; he'll pick them up.</div>` : `<div class="row end"><button class="chip solid" data-found-add="1">ADD SELECTED</button></div>`);
  }

  // ---------------------------------------------------------- events ---
  function wire() {
    $("#mem-sub").addEventListener("click", (e) => {
      const v = e.target.dataset.view;
      if (v) { view = v; editing = null; render(); }
    });
    $("#mem-body").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const text = f.text.value.trim();
      if (!text) return;
      if (f.id === "mem-add") { Memory.remember(text, { kind: f.kind.value, source: "you" }); say(sl(L.MEMORY_LINES.noted), { mood: "shy", log: false }); }
      if (f.id === "mem-moment") Memory.addMoment(text, { kind: "you" });
      render();
    });
    $("#mem-body").addEventListener("change", (e) => { if (e.target.id === "mood-range") { moodRange = e.target.value; render(); } });
    $("#mem-body").addEventListener("click", (e) => {

      const lf = e.target.closest("[data-lorefile]")?.dataset.lorefile;
      if (lf) return openCard("lorefile", window.LORE.FILES[lf].name, "DCS ARCHIVE // RECOVERED", `<pre class="lore-file">${Lore.html(Lore.fileText(lf))}</pre>`);
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "add-file") return addFiles();
      if (act === "paste") return paste();
      // logging a mood by hand from MOOD
      if (act.startsWith("mg-")) { Health.memClick(act, e.target.closest(".mem-row")?.dataset.id); return render(); }
      if (act.startsWith("mood-")) { if (!R.pendingCheckIn) R.pendingCheckIn = { slot: "manual", at: Date.now() }; CheckIn.answer(act.slice(5)); return render(); }
      const row = e.target.closest(".mem-row");
      if (!row) return;
      const m = Memory.mem();
      const list = view === "facts" ? m.facts : view === "files" ? m.docs : m.moments;
      const x = list.find((y) => y.id === row.dataset.id);
      if (!x) return;
      if (act === "edit") { editing = x.id; return render(); }
      if (act === "pin") x.pinned = !x.pinned;
      if (act === "private") x.private = !x.private;
      if (act === "view") return view_(x);
      if (act === "dates") return showDates(x);
      if (act === "del") {
        if (!confirm(view === "files" ? `delete ${x.name}?` : "delete this memory?")) return;
        if (view === "facts") m.facts = m.facts.filter((y) => y !== x);
        if (view === "files") m.docs = m.docs.filter((y) => y !== x);
        if (view === "us") m.moments = m.moments.filter((y) => y !== x);
      }
      save();
      render();
    });
    $("#mem-body").addEventListener("change", (e) => {
      if (e.target.dataset.act !== "group") return;
      const d = Memory.mem().docs.find((y) => y.id === e.target.closest(".mem-row").dataset.id);
      Object.assign(d, parseGroupKey(e.target.value));
      save();
    });
    $("#mem-body").addEventListener("keydown", (e) => {
      if (!e.target.classList.contains("mem-edit")) return;
      if (e.key === "Escape") { editing = null; return render(); }
      if (e.key !== "Enter") return;
      const f = Memory.mem().facts.find((y) => y.id === editing);
      if (f && e.target.value.trim()) { f.text = e.target.value.trim(); f.updatedAt = Date.now(); save(); }
      editing = null;
      render();
    });
    // FILES (in SYS)
    $("#sys-files")?.addEventListener("click", (e) => {
      const lf = e.target.closest("[data-lorefile]")?.dataset.lorefile;
      if (lf) return openCard("lorefile", window.LORE.FILES[lf].name, "DCS ARCHIVE // RECOVERED", `<pre class="lore-file">${Lore.html(Lore.fileText(lf))}</pre>`);
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act || act === "group") return;
      e.target.blur(); // SYS doesn't redraw while one of its buttons has focus
      if (act === "add-file") return addFiles();
      if (act === "paste") return paste();
      const m = Memory.mem();
      const x = m.docs.find((y) => y.id === e.target.closest(".mem-row")?.dataset.id);
      if (!x) return;
      if (act === "private") x.private = !x.private;
      if (act === "view") return view_(x);
      if (act === "dates") return showDates(x);
      if (act === "del") { if (!confirm(`delete ${x.name}?`)) return; m.docs = m.docs.filter((y) => y !== x); }
      save();
      renderFiles();
    });
    $("#sys-files")?.addEventListener("change", (e) => {
      if (e.target.dataset.act !== "group") return;
      const d = Memory.mem().docs.find((y) => y.id === e.target.closest(".mem-row").dataset.id);
      Object.assign(d, parseGroupKey(e.target.value));
      save();
    });
    // buttons inside the shared card overlay (paste + found dates)
    $("#card-body").addEventListener("click", (e) => {
      if (e.target.dataset.pasteSave) {
        const name = $("#paste-name").value.trim() || "pasted notes";
        const text = $("#paste-text").value.trim();
        if (!text) return;
        const d = Memory.addDoc(name, text);
        closeCard();
        say(sl(L.MEMORY_LINES.file, { name: name.toLowerCase() }), { mood: "shy" });
        if (activeEngine() !== "scripted" && /\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(text)) setTimeout(() => offerDates(d), 2500);
        return renderFiles();
      }
      if (e.target.dataset.foundAdd && R.foundDates) {
        const { doc, items } = R.foundDates;
        const picked = $$("[data-found]", $("#card-body")).filter((c) => c.checked).map((c) => items[+c.dataset.found]);
        for (const x of picked) addFoundItem(doc, x);
        R.foundDates = null;
        closeCard();
        save();
        renderAll();
        say(stage() === 1 ? `${picked.length} item(s) added to schedule.` : `added ${picked.length}! they're on your schedule now.`, { mood: "happy" });
      }
    });
  }
  const addFoundItem = (doc, x) => Memory.addFoundItem(doc, x);

  return { render, renderFiles, wire, addFiles, showDates };
})();
window.MemUI = MemUI;
