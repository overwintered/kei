// MEM tab: what he remembers about you, your files, and your history together.
// Labels follow the relationship: a cold "profile" / "log" at first, "us" later.

const MemUI = (() => {
  let view = "facts";
  let editing = null; // fact id being edited

  const labels = () => {
    const st = stage();
    return { facts: st === 1 ? "PROFILE" : "ABOUT YOU", files: "FILES", us: st === 1 ? "LOG" : st === 2 ? "MEMORIES" : "US", mood: st === 1 ? "CONDITION" : "MOOD", health: "HEALTH", activity: st === 1 ? "ACTIVITY LOG" : "ACTIVITY" };
  };
  const when = (t) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
  const chip = (act, label, on = false) => `<button class="chip ${on ? "solid" : ""}" data-act="${act}">${label}</button>`;

  function render() {
    const lb = labels();
    $("#mem-sub").innerHTML = ["facts", "files", "us", "activity", "mood", "health"].map((v) => `<button class="chip ${v === view ? "solid" : ""}" data-view="${v}">${lb[v]}</button>`).join("");
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
    if (view === "files") {
      html += `<div class="row"><button class="chip solid" data-act="add-file">ADD FILE</button><button class="chip" data-act="paste">PASTE TEXT</button></div>`;
      html += `<div class="tiny muted">syllabi, course outlines, notes. pdf, word or text. read here on your mac; he searches them when you ask.</div>`;
      html += m.docs.slice().reverse().map((d) => `<div class="mem-row ${d.private ? "priv" : ""}" data-id="${d.id}">
        <div class="mem-text">${esc(d.name)}</div>
        <div class="mem-meta"><select data-act="group">${groupOptions().map(([v, l]) => `<option value="${v}" ${v === groupKey(d) ? "selected" : ""}>${esc(v ? l : "no group")}</option>`).join("")}</select>
        <span>${d.chunks.length} part${d.chunks.length === 1 ? "" : "s"} · ${when(d.addedAt)}</span></div>
        <div class="mem-meta">${chip("view", "VIEW")}${chip("dates", "FIND DATES")}${chip("private", "PRIVATE", d.private)}${chip("del", "DELETE")}</div></div>`).join("") || `<div class="muted tiny mem-empty">no files yet.</div>`;
      // DCS documents found through easter eggs
      const lore = M.kei.loreFiles || [];
      if (lore.length) html += `<div class="mem-sec">DCS ARCHIVE // ${lore.length}</div>` + lore.map((k) => `<div class="mem-row"><div class="mem-text">${esc(window.LORE.FILES[k].name)}</div><div class="mem-meta"><span>recovered</span><button class="chip" data-lorefile="${k}">VIEW</button></div></div>`).join("");
    }
    if (view === "us") {
      html += `<form id="mem-moment" class="row"><input name="text" placeholder="> add a memory of your own" autocomplete="off" /><button class="chip solid">ADD</button></form>`;
      const byDay = {};
      for (const x of m.moments.slice().sort((a, b) => b.at - a.at)) (byDay[x.date] ||= []).push(x);
      html += Object.entries(byDay).map(([d, list]) => `<div class="mem-sec">${keyToDate(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</div>` +
        list.map((x) => `<div class="mem-row ${x.private ? "priv" : ""}" data-id="${x.id}"><div class="mem-text ${x.kind === "you" ? "" : "kei-voice"}">${x.kind === "you" ? esc(x.text) : fmt(x.text)}</div>
          <div class="mem-meta"><span>${{ journal: "journal", you: "you added", note: "note for you" }[x.kind] || "milestone"}</span>${chip("private", "PRIVATE", x.private)}${chip("del", "DELETE")}</div></div>`).join("")).join("") ||
        `<div class="muted tiny mem-empty">${stage() === 1 ? "log empty." : "no memories yet. they'll come."}</div>`;
    }
    if (view === "mood") {
      html += `<div class="tiny muted">he asks every morning, at noon, at night, and when you start a session. it shapes his tone for a few hours and goes in his journal.</div>`;
      html += `<div class="row wrap">${CheckIn.MOODS.map((m) => chip(`mood-${m}`, m)).join("")}</div>`;
      const byDay = {};
      for (const x of (M.moods || []).slice().reverse()) (byDay[x.day] ||= []).push(x);
      html += Object.entries(byDay).slice(0, 30).map(([d, list]) => `<div class="mem-sec">${keyToDate(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</div>` +
        list.map((x) => `<div class="mood-row"><span class="slot">${esc(x.slot)}</span><span class="m">${esc(x.mood)}</span><span class="t">${esc(x.text || "")}</span></div>`).join("")).join("") ||
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
    render();
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
      `<div class="row end"><button class="chip solid" data-found-add="1">ADD SELECTED</button></div>`;
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
        return render();
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

  return { render, wire, addFiles, showDates };
})();
window.MemUI = MemUI;
