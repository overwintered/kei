// Migraine tracker. Log one with taps only (severity, where, when it
// started, optional symptoms and meds), update it while it lasts, and tell
// him when it's over. While one is active he goes quiet: no sounds, no
// quizzes, check-ins, notes or chatter, and planning nudges pause. Alerts
// still show, silently, without escalating.

const Health = (() => {
  const LOCS = ["left side", "right side", "both sides", "forehead", "temples", "behind eyes", "top of head", "back of head", "neck"];
  const SYMS = ["aura", "nausea", "light hurts", "sound hurts", "dizzy"];
  const WHEN = [["just now", 0], ["~30m ago", 30], ["~1h ago", 60], ["2-3h ago", 150], ["since i woke up", "wake"], ["not sure", null], ["pick a time", "pick"]];
  const CHECK_EVERY = 2 * 3600e3;

  const h = () => (M.health ||= { migraines: [] });
  const active = () => h().migraines.find((x) => !x.end) || null;
  let form = null; // {sev, locs:Set, syms:Set, when, editing}

  const durText = (ms) => {
    const m = Math.max(1, Math.round(ms / 60_000));
    return m < 60 ? `${m} minute${m === 1 ? "" : "s"}` : fmtDur(m);
  };
  const lasted = (x, to = Date.now()) => `${x.startKnown ? "" : "at least "}${durText(to - x.start)}`;
  const peak = (x) => Math.max(x.severity || 0, ...(x.updates || []).map((u) => u.sev));

  // ------------------------------------------------------------- the form ---
  function open() {
    const cur = active();
    form = { sev: cur ? cur.updates?.at(-1)?.sev ?? cur.severity : null, locs: new Set(cur?.locations || []), syms: new Set(cur?.symptoms || []), when: cur ? "known" : null, editing: !!cur };
    expand({ fromUser: false });
    $("#mg-code").textContent = cur ? `ACTIVE ${lasted(cur).toUpperCase()} // STARTED ${fmtTime(new Date(cur.start)).toUpperCase()}` : `${selfLabel()} // TAP WHAT FITS`;
    $("#mg-when-sec").hidden = $("#mg-when").hidden = !!cur;
    $("#mg-time").hidden = true;
    $("#mg-meds").value = cur?.meds || "";
    $("#mg-save").textContent = cur ? "UPDATE" : "LOG IT";
    $("#mg-end").hidden = !cur;
    draw();
    $("#migraine").hidden = false;
    if (!cur) say(sl(L.MIGRAINE.ask), { mood: "sad", log: false });
  }
  function close() {
    form = null;
    $("#migraine").hidden = true;
  }
  function draw() {
    const chip = (group, v, on, label = v) => `<button type="button" class="chip ${on ? "solid" : ""}" data-${group}="${esc(String(v))}">${esc(label)}</button>`;
    $("#mg-sev").innerHTML = Array.from({ length: 10 }, (_, i) => chip("sev", i + 1, form.sev === i + 1)).join("");
    $("#mg-loc").innerHTML = LOCS.map((l) => chip("loc", l, form.locs.has(l))).join("");
    $("#mg-sym").innerHTML = SYMS.map((s) => chip("sym", s, form.syms.has(s))).join("");
    $("#mg-when").innerHTML = WHEN.map(([label, v]) => chip("when", label, form.when === label)).join("");
    $("#mg-save").disabled = !form.sev;
    fitAll();
  }

  function startTime() {
    const opt = WHEN.find(([l]) => l === form.when);
    if (!opt || opt[1] === null) return { start: Date.now(), known: false };
    if (opt[1] === "wake") return { start: Math.min(Date.now(), new Date(`${dayKey()}T${M.settings.wakeTime}`).getTime()), known: true };
    if (opt[1] === "pick") {
      const t = $("#mg-time").value;
      if (!t) return { start: Date.now(), known: false };
      let at = new Date(`${dayKey()}T${t}`).getTime();
      if (at > Date.now()) at -= 864e5; // a time "later today" means last night
      return { start: at, known: true };
    }
    return { start: Date.now() - opt[1] * 60_000, known: opt[1] > 0 || form.when === "just now" };
  }

  function submit() {
    if (!form?.sev) return;
    const cur = active();
    const meds = $("#mg-meds").value.trim().slice(0, 120);
    const sev = form.sev;
    if (cur) {
      if (form.sev !== (cur.updates?.at(-1)?.sev ?? cur.severity)) (cur.updates ||= []).push({ at: Date.now(), sev: form.sev });
      cur.locations = [...form.locs];
      cur.symptoms = [...form.syms];
      cur.meds = meds;
      save();
      close();
      say(sl(L.MIGRAINE.updated, { sev }), { mood: "sad" });
      return render();
    }
    const { start, known } = startTime();
    const x = { id: uid(), start, startKnown: known, severity: form.sev, locations: [...form.locs], symptoms: [...form.syms], meds, updates: [], end: null, lastCheck: Date.now() };
    h().migraines.push(x);
    save();
    close();
    if (Study.focusing()) Study.focusEnd(false);
    render();
    showMood("sad", 4000);
    say(sl(L.MIGRAINE.start), { mood: "sad" });
    if (sev >= 9) setTimeout(() => say(sl(L.MIGRAINE.severe), { mood: "nervous" }), 4500);
  }

  function end() {
    const cur = active();
    if (!cur) return say(sl(L.MIGRAINE.none), { mood: "shy" });
    cur.end = Date.now();
    save();
    close();
    render();
    feel(stage() >= 2 ? "touched" : "idle", 4000);
    say(sl(L.MIGRAINE.over, { dur: lasted(cur, cur.end) }), { mood: "happy" });
  }

  // ------------------------------------------------------------- status ---
  function render() {
    const cur = active();
    body.classList.toggle("migraine", !!cur);
    const el = $("#sb-migraine");
    el.hidden = !cur;
    if (cur) el.textContent = `MIGRAINE ${fmtDur(Math.max(1, Math.round((Date.now() - cur.start) / 60_000))).toUpperCase()}`;
  }

  // every couple of hours, if they're at the computer: still going?
  let lastIdleCheck = 0;
  async function tick() {
    const cur = active();
    render();
    if (!cur || isSleeping() || R.alert || R.cutscenePlaying || R.talking || !$("#migraine").hidden) return;
    if (Date.now() - cur.lastCheck < CHECK_EVERY || Date.now() - lastIdleCheck < 60_000) return;
    lastIdleCheck = Date.now();
    if ((await host.idleSeconds?.()) >= 120) return; // not at the computer; ask when they're back
    cur.lastCheck = Date.now();
    save();
    say(sl(L.MIGRAINE.check, { dur: lasted(cur) }), {
      mood: "sad",
      choices: [
        { label: "still here", fn: () => say(sl(L.MIGRAINE.still), { mood: "sad" }) },
        { label: "it's over", fn: end },
        { label: "update", fn: open },
      ],
    });
  }

  // chat: "i have a migraine", "migraine's gone", "it's a 7 now"
  function chat(text) {
    const s = text.toLowerCase();
    const cur = active();
    if (cur && /\b(gone|over|better now|went away|it'?s done|ended|finished|cleared)\b/.test(s) && /\b(migraine|head|it)\b/.test(s)) { end(); return true; }
    if (cur && /\b(\d{1,2})\s*(\/\s*10|out of 10)?\b/.test(s) && /\b(now|worse|better|severity|it'?s an?|at)\b/.test(s) && /\b(migraine|head|it'?s|now)\b/.test(s)) {
      const n = Number(s.match(/\b(\d{1,2})\b/)[1]);
      if (n >= 1 && n <= 10) { (cur.updates ||= []).push({ at: Date.now(), sev: n }); save(); say(sl(L.MIGRAINE.updated, { sev: n }), { mood: "sad" }); return true; }
    }
    if (!cur && /\b(migraine|my head (really )?(hurts|is killing me|is pounding))\b/.test(s) && !/\b(had|last week|yesterday|usually|tracker)\b/.test(s)) { open(); return true; }
    return false;
  }

  // ------------------------------------------------------------ context ---
  function promptLine() {
    const cur = active();
    const recent = h().migraines.filter((x) => x.start > Date.now() - 30 * 864e5);
    const out = [];
    if (cur) out.push(`the operator has a migraine right now (severity ${cur.updates?.at(-1)?.sev ?? cur.severity}/10${cur.locations.length ? `, ${cur.locations.join(", ")}` : ""}, ${lasted(cur)} so far). keep replies very short, soft and easy to read, put no pressure on tasks, and don't suggest screens or studying. when they say it's over, be glad and gentle.`);
    if (recent.length && !cur) out.push(`migraines in the last 30 days: ${recent.length}.`);
    return out.length ? `${out.join("\n")}\n` : "";
  }
  function daySummary(day = dayKey()) {
    return h().migraines.filter((x) => dayKey(new Date(x.start)) === day || (x.end && dayKey(new Date(x.end)) === day)).map((x) => ({ dur: lasted(x, x.end || Date.now()), sev: peak(x), ongoing: !x.end }));
  }

  // MEM > HEALTH
  function memHTML() {
    const list = h().migraines.slice().sort((a, b) => b.start - a.start);
    const last30 = list.filter((x) => x.start > Date.now() - 30 * 864e5 && x.end);
    const avg = (f) => (last30.length ? last30.reduce((n, x) => n + f(x), 0) / last30.length : 0);
    let html = `<div class="row"><button class="chip solid" data-act="mg-open">${active() ? "UPDATE / END" : "LOG A MIGRAINE"}</button></div>`;
    html += `<div class="tiny muted">tap-only logging. while one is active he goes quiet: no sounds, no quizzes, no chatter. you can also just tell him in TALK ("i have a migraine", "it's over").</div>`;
    if (last30.length) html += `<div class="mem-sec">LAST 30 DAYS</div><div class="mg-stats"><span><b>${last30.length}</b> migraine${last30.length === 1 ? "" : "s"}</span><span>avg <b>${fmtDur(Math.round(avg((x) => (x.end - x.start) / 60_000)))}</b></span><span>avg peak <b>${avg(peak).toFixed(1)}</b>/10</span></div>`;
    html += list.map((x) => `<div class="mem-row" data-id="${x.id}">
      <div class="mem-text">${new Date(x.start).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}, ${fmtTime(new Date(x.start))}${x.startKnown ? "" : " (start unsure)"} · <b>${x.end ? lasted(x, x.end) : `ongoing, ${lasted(x)}`}</b> · peak ${peak(x)}/10</div>
      <div class="mem-meta"><span>${esc([x.locations.join(", "), x.symptoms.join(", "), x.meds && `took: ${x.meds}`].filter(Boolean).join(" · ") || "no details")}</span>${x.end ? `<button class="chip" data-act="mg-del">DELETE</button>` : ""}</div></div>`).join("") || `<div class="muted tiny mem-empty">no migraines logged.</div>`;
    return html;
  }
  function memClick(act, id) {
    if (act === "mg-open") return open();
    if (act === "mg-del" && confirm("delete this migraine entry?")) { h().migraines = h().migraines.filter((x) => x.id !== id); save(); }
  }

  function wire() {
    $("#mg-form").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || !form) return;
      if (b.dataset.sev) form.sev = Number(b.dataset.sev);
      else if (b.dataset.loc) { const l = b.dataset.loc; form.locs.has(l) ? form.locs.delete(l) : form.locs.add(l); }
      else if (b.dataset.sym) { const s = b.dataset.sym; form.syms.has(s) ? form.syms.delete(s) : form.syms.add(s); }
      else if (b.dataset.when) { form.when = b.dataset.when; $("#mg-time").hidden = form.when !== "pick a time"; }
      else return;
      draw();
    });
    $("#mg-form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    $("#mg-close").addEventListener("click", close);
    $("#mg-end").addEventListener("click", end);
    $("#sb-migraine").addEventListener("click", open);
    render();
  }

  return { wire, tick, open, end, chat, active: () => !!active(), promptLine, daySummary, memHTML, memClick };
})();
