// Planner UI: the grouped task list (TASKS), the timeline (SCHED), and the
// item editor. Data lives in items.js; this file only draws and edits it.

const Planner = (() => {
  const ICON_SVG = {
    work: '<path d="M4 8h16v11H4z M9 8V5h6v3"/>',
    study: '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z M12 6v14"/>',
    food: '<path d="M7 3v8 M5 3v5a2 2 0 004 0V3 M7 11v10 M17 3c-2 2-2 6 0 8v10"/>',
    move: '<path d="M3 9v6 M6 7v10 M6 12h12 M18 7v10 M21 9v6"/>',
    rest: '<path d="M20 14A8 8 0 0110 4a8 8 0 1010 10z"/>',
    people: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/>',
    code: '<path d="M8 7l-5 5 5 5 M16 7l5 5-5 5"/>',
    home: '<path d="M3 11l9-7 9 7 M5 10v10h14V10"/>',
    star: '<path d="M12 3l2.8 6 6.2.6-4.7 4.2 1.4 6.2L12 17l-5.7 3 1.4-6.2L3 9.6 9.2 9z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16 M8 18v2 M16 18v2"/><circle cx="8" cy="15" r="0.6"/><circle cx="16" cy="15" r="0.6"/>',
    leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15z M5 19l8-8"/>',
    paw: '<circle cx="12" cy="15" r="3.5"/><circle cx="6" cy="10" r="1.6"/><circle cx="10" cy="6" r="1.6"/><circle cx="14" cy="6" r="1.6"/><circle cx="18" cy="10" r="1.6"/>',
    shirt: '<path d="M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3c0 2-2 3-4 3s-4-1-4-3z"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="0.6"/><circle cx="15" cy="15" r="0.6"/><circle cx="15" cy="9" r="0.6"/><circle cx="9" cy="15" r="0.6"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16z M14 6l3 3"/>',
  };
  const COLORS = ["#ff8c1a", "#ff2b2b", "#3dff8c", "#4fc3ff", "#c58cff", "#ff7fb0", "#ffd84a", "#a8a8a8"];
  const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_SVG[k] || ICON_SVG.star}</svg>`;

  let filter = "today";
  const collapsed = new Set();

  // -------------------------------------------------------------- rows ---
  const fmtDay = (d) => (d === dayKey() ? "today" : d === addDays(dayKey(), 1) ? "tomorrow" : keyToDate(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }));
  const slotText = (inst) => (inst.start ? `${inst.start}${inst.duration ? `-${min2hm(hm2min(inst.start) + inst.duration)}` : ""}` : "");

  function rowHTML(inst, { showDate = false } = {}) {
    const it = inst.item;
    const st = instStatus(inst);
    const o = inst.s;
    const cls = [o.done && "done", o.missed && !o.done && "overdue", R.pickId === instKey(inst) && "pick"].filter(Boolean).join(" ");
    const subs = it.subtasks.length ? `${it.subtasks.filter((x) => o.subDone?.[x.id]).length}/${it.subtasks.length} sub` : "";
    const nComments = (it.comments?.length || 0) + (o.comments?.length || 0);
    const meta = [
      showDate && inst.date && !(inst.due && inst.due.startsWith(inst.date) && !inst.start) ? fmtDay(inst.date) : "",
      slotText(inst),
      it.where || "",
      inst.due ? `<span class="${o.missed && !o.done ? "late" : ""}">due ${fmtDue(inst.due)}</span>` : "",
      it.rec ? `repeats ${describeRepeat(it.rec)}` : "",
      subs,
      it.optional ? "optional" : "",
      it.size === "big" ? "LARGE" : "",
      nComments ? `log ${nComments}` : "",
    ].filter(Boolean).join(" · ");
    return `<li class="${cls}" data-id="${it.id}" data-key="${inst.key}" style="--c:${itemColor(it)}">
      <div class="t-head"><span>TASK_${pad(it.num)}</span><span>//</span><span class="st">${st}</span>${R.pickId === instKey(inst) ? `<span class="badge">${selfShort()}'S PICK</span>` : ""}</div>
      <div class="t-main"><button class="box" data-act="toggle" title="complete"></button><span class="t-ico">${icon(itemIcon(it))}</span><span class="title" data-act="open">${esc(inst.title)}</span></div>
      ${meta ? `<div class="t-meta">${meta}</div>` : ""}
      ${inst.note ? `<div class="t-note">${esc(inst.note)}</div>` : ""}
    </li>`;
  }

  // group > subgroup buckets in the user's group order
  function grouped(insts, opts) {
    const buckets = [];
    const push = (key, label, color, list) => list.length && buckets.push({ key, label, color, list });
    for (const g of M.groups) {
      push(g.id, g.name, g.color, insts.filter((i) => i.item.group === g.id && !i.item.sub));
      for (const s of g.subs || []) push(`${g.id}/${s.id}`, `${g.name} / ${s.name}`, s.color, insts.filter((i) => i.item.group === g.id && i.item.sub === s.id));
    }
    push("", "inbox", "#a8a8a8", insts.filter((i) => !i.item.group || !M.groups.some((g) => g.id === i.item.group)));
    return buckets.map((b) => {
      const open = !collapsed.has(b.key);
      return `<li class="g-head ${open ? "" : "shut"}" data-group="${b.key}" style="--c:${b.color}"><span class="g-tri">${open ? "▾" : "▸"}</span><span class="g-name">${esc(b.label)}</span><b>${b.list.filter((i) => !i.s.done).length}</b></li>` +
        (open ? b.list.map((i) => rowHTML(i, opts)).join("") : "");
    }).join("");
  }

  const sortInst = (a, b) =>
    (!!a.s.done - !!b.s.done) || (!!b.s.missed - !!a.s.missed) ||
    ((a.date || "9") > (b.date || "9") ? 1 : (a.date || "9") < (b.date || "9") ? -1 : 0) ||
    ((a.start || a.due?.slice(11) || "99") > (b.start || b.due?.slice(11) || "99") ? 1 : -1);

  function listFor(f) {
    const today = dayKey();
    if (f === "today") {
      const list = instancesOn(today);
      // anything overdue from earlier days comes along
      for (const it of M.items) for (const [k, o] of Object.entries(it.occ || {})) if (o.missed && !o.done && !list.some((i) => i.item === it && i.key === k)) list.push(instance(it, k));
      return list.sort(sortInst);
    }
    if (f === "upcoming") return instancesBetween(addDays(today, 1), addDays(today, 21)).filter((i) => i.due || !i.item.rec).sort(sortInst);
    if (f === "inbox") return inboxItems().map((it) => instance(it, "*"));
    // all: each item once (its next occurrence), not finished one-offs
    return M.items.map((it) => nextInstance(it)).filter((i) => i && !i.s.done).sort(sortInst);
  }

  function renderTasks() {
    const list = listFor(filter);
    $$("#plan-filters [data-filter]").forEach((b) => b.classList.toggle("solid", b.dataset.filter === filter));
    const empty = { today: stage() === 1 ? "NOTHING TODAY // awaiting input." : "nothing today. a quiet day.", upcoming: "nothing coming up.", inbox: "inbox empty.", all: "no tasks yet." }[filter];
    let html = list.length ? grouped(list, { showDate: filter !== "today" }) : `<li class="muted mono tiny empty-row">${empty}</li>`;
    if (filter === "all") {
      const done = M.items.filter((it) => !it.rec && it.occ?.["*"]?.done).map((it) => instance(it, "*"));
      if (done.length) html += `<li class="g-head ${collapsed.has("__done") ? "shut" : ""}" data-group="__done" style="--c:var(--green)"><span class="g-tri">${collapsed.has("__done") ? "▸" : "▾"}</span><span class="g-name">archive</span><b>${done.length}</b></li>` + (collapsed.has("__done") ? "" : done.map((i) => rowHTML(i, { showDate: true })).join(""));
    }
    $("#plan-list").innerHTML = html;
    const open = list.filter((i) => !i.s.done).length;
    $("#task-count").textContent = `${open} OPEN`;
    $("#pick-label").textContent = `${selfShort()}'S PICK`;
    renderMadBanner();
  }

  // --------------------------------------------------------- timeline ---
  function renderTimeline() {
    const day = R.viewDay;
    const today = dayKey();
    $("#day-label").textContent = day === today ? "TODAY" : day === addDays(today, 1) ? "TOMORROW" : day === addDays(today, -1) ? "YESTERDAY" : keyToDate(day).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
    const all = instancesOn(day);
    const slots = all.filter((i) => i.start).sort((a, b) => a.start.localeCompare(b.start));
    // things on this day with no time slot: deadlines and all-day items
    const loose = all.filter((i) => !i.start).sort((a, b) => (a.due || "").localeCompare(b.due || ""));
    $("#day-strip").innerHTML = loose.map((i) =>
      `<button class="day-chip ${i.s.done ? "done" : ""}" data-id="${i.item.id}" data-key="${i.key}" style="--c:${itemColor(i.item)}">${i.due ? `<b>DUE ${i.due.slice(11)}</b> ` : ""}${esc(i.title)}</button>`).join("");

    const wake = hm2min(M.settings.wakeTime);
    let bed = hm2min(M.settings.bedTime);
    if (bed <= wake) bed = 24 * 60 - 1;
    const rows = [{ kind: "marker", at: wake, label: "RISE", icon: "sun" }];
    let cursor = Math.min(wake, slots.length ? hm2min(slots[0].start) : wake);
    for (const i of slots) {
      const s = hm2min(i.start), e = s + (i.duration || 30);
      if (s - cursor >= 10) rows.push({ kind: "gap", from: cursor, to: s });
      rows.push({ kind: "block", i, from: s, to: e });
      cursor = Math.max(cursor, e);
    }
    if (bed - cursor >= 10) rows.push({ kind: "gap", from: cursor, to: bed });
    rows.push({ kind: "marker", at: Math.max(bed, cursor), label: "SLEEP", icon: "rest" });
    rows.sort((a, b) => (a.from ?? a.at) - (b.from ?? b.at) || (a.kind === "marker" ? -1 : 1));

    const html = rows.map((r) => {
      if (r.kind === "marker") return `<div class="tl-row tl-marker" data-from="${r.at}" data-to="${r.at}" style="height:40px"><div class="tl-time"><b>${min2hm(r.at)}</b></div><div class="tl-rail"><div class="pill">${icon(r.icon)}</div></div><div class="tl-body">${r.label}</div><div></div></div>`;
      if (r.kind === "gap") return `<div class="tl-row tl-gap" data-from="${r.from}" data-to="${r.to}" style="height:${clamp((r.to - r.from) * 0.35, 26, 90)}px"><div class="tl-time"></div><div class="tl-rail"></div><div class="tl-body">free time · ${fmtDur(r.to - r.from)}</div><div></div></div>`;
      const i = r.i, it = i.item, dur = r.to - r.from;
      const h = clamp(dur * 0.9, 34, 170);
      const sub = [`${i.start} - ${min2hm(r.to)} (${fmtDur(dur)})`, it.where, i.fixed ? "FIXED" : "", it.rec ? "repeats" : ""].filter(Boolean).join(" · ");
      return `<div class="tl-row ${i.s.done ? "done" : ""} ${i.fixed ? "fixed" : ""}" data-id="${it.id}" data-key="${i.key}" data-from="${r.from}" data-to="${r.to}" style="--c:${itemColor(it)};min-height:${h + 6}px">
        <div class="tl-time"><b>${i.start}</b>${min2hm(r.to)}</div>
        <div class="tl-rail"><div class="pill" style="height:${h}px">${icon(itemIcon(it))}</div></div>
        <div class="tl-body" data-act="open"><div class="title" data-act="open">${esc(i.title)}</div><div class="sub" data-act="open">${esc(sub)}</div>${i.note ? `<div class="t-note" data-act="open">${esc(i.note)}</div>` : ""}</div>
        <button class="tl-check" data-act="done" title="complete"></button>
      </div>`;
    }).join("");
    const tl = $("#timeline");
    tl.innerHTML = (slots.length ? "" : `<div class="tl-empty">${stage() === 1 ? "no blocks scheduled." : "nothing planned yet."}</div>`) + html + (day === today ? `<div id="now-line"></div>` : "");
    positionNowLine(true);
  }

  function positionNowLine(scroll = false) {
    const line = $("#now-line");
    if (!line) return;
    const m = nowMin();
    const rows = $$("#timeline .tl-row");
    let y = null;
    for (const row of rows) {
      const from = +row.dataset.from, to = +row.dataset.to;
      if (to > from && m >= from && m < to) { y = row.offsetTop + ((m - from) / (to - from)) * row.offsetHeight; break; }
    }
    if (y == null) {
      const before = rows.filter((r) => +r.dataset.to <= m);
      const last = before[before.length - 1];
      y = last ? last.offsetTop + last.offsetHeight : rows[0]?.offsetTop || 0;
    }
    line.style.top = `${y}px`;

    line.dataset.t = min2hm(Math.floor(m));
    if (scroll) $("#timeline").scrollTop = Math.max(0, y - 120);
  }

  function renderMadBanner() {
    const inst = madInstance();
    const el = $("#mad-banner");
    el.hidden = !inst;
    if (!inst) return;
    const r = rescheduleOptions();
    el.innerHTML = `TASK_${pad(inst.item.num)} // OVERDUE // ${esc(inst.title)}
      <div class="row"><button class="chip" data-to="${r.hour}">RESCHEDULE +1H</button><button class="chip" data-to="${r.tomorrow}">TOMORROW 9:00</button><button class="chip solid green" data-done="1">DONE</button></div>`;
    el.dataset.id = inst.item.id;
    el.dataset.key = inst.key;
  }

  // ----------------------------------------------------------- editor ---
  let ed = null; // { item, key, isNew, pending }

  function open(item, key = null, isNew = false) {
    ed = { item, key: key ?? (item.rec ? item.rec.start : "*"), isNew };
    if (!isNew && item.rec && key === null) ed.key = nextInstance(item)?.key || item.rec.start;
    fillEditor();
    $("#editor").hidden = false;
    host.focus();
    setTimeout(() => $("#ed-form").title.focus(), 30);
  }
  function close() {
    ed = null;
    $("#editor").hidden = true;
    $("#ed-scope").hidden = true;
    renderAll();
  }
  const isOpen = () => !!ed;

  function fillEditor() {
    const f = $("#ed-form");
    const it = ed.item;
    const inst = instance(it, ed.key);
    $("#ed-code").textContent = ed.isNew ? "NEW TASK" : `TASK_${pad(it.num)} // ${instStatus(inst)}${it.rec ? ` // ${fmtDay(ed.key)}` : ""}`;
    f.title.value = it.title === "untitled" ? "" : it.title;
    f.group.innerHTML = groupOptions().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
    f.group.value = groupKey(it);
    f.where.value = it.where || "";
    f.date.value = it.rec ? it.rec.start || "" : it.date || "";
    f.start.value = it.start || "";
    f.duration.value = it.duration || "";
    f.due.value = it.due || "";
    f.dueTime.value = it.dueTime || "";
    f.freq.value = !it.rec ? "" : it.rec.freq === "weekly" && (it.rec.every || 1) === 2 ? "biweekly" : it.rec.freq;
    f.end.value = it.rec?.end || "";
    f.dates.value = (it.rec?.dates || []).join(", ");
    f.skip.value = (it.rec?.skip || []).join(", ");
    f.fixed.checked = it.rec && !ed.isNew ? inst.fixed : !!it.fixed;
    f.optional.checked = !!it.optional;
    f.big.checked = it.size === "big";
    f.notes.value = it.notes || "";
    f.estimate.value = it.estimate || "";
    const guess = it.estimateAI || Coach.heuristicMinutes(inst);
    f.estimate.placeholder = `his guess: ${guess}`;
    const eff = Math.max(15, Math.round(((Number(it.estimate) || guess) * (Number(M.settings.pace) || 1.5)) / 15) * 15);
    $("#ed-estimate-hint").textContent = `with your pace: about ${Coach.durText(eff)}${it.estimateWhy && !it.estimate ? ` (${it.estimateWhy})` : ""}. leave blank to use his guess.`;
    ed.days = new Set(it.rec?.days || (it.rec ? [] : []));
    ed.icon = it.icon;
    ed.color = it.color;
    f.occLabel.value = inst.label;
    f.occNote.value = inst.note;
    $("#ed-occ").hidden = !it.rec || ed.isNew;
    $("#ed-done").textContent = inst.s.done ? "UNDO" : "DONE";
    $("#ed-done").hidden = ed.isNew;
    $("#ed-delete").hidden = ed.isNew;
    $("#ed-skip").hidden = ed.isNew || !it.rec;
    $("#ed-focus").hidden = ed.isNew || inst.s.done || isEvent(inst);
    $("#ed-delete").textContent = it.rec && !ed.isNew ? "DELETE SERIES..." : "DELETE";
    syncRepeatFields();
    renderPickers();
    renderSubs();
    renderComments();
  }

  function syncRepeatFields() {
    const f = $("#ed-form");
    const v = f.freq.value;
    $("#ed-days").hidden = !(v === "weekly" || v === "biweekly");
    $("#ed-dates-row").hidden = v !== "dates";
    $("#ed-end-row").hidden = !v || v === "dates";
    $("#ed-skip-row").hidden = !v;
    $("#ed-due-row").hidden = !!v;
    $("#ed-duetime-row").hidden = !v;
    $("#ed-date-label").firstChild.textContent = v ? "STARTS " : "DATE ";
    $("#ed-days").innerHTML = DAY_NAMES.map((d, i) => `<button type="button" class="chip daychip ${ed.days.has(i) ? "solid" : ""}" data-day="${i}">${d.toUpperCase()}</button>`).join("");
  }

  function renderPickers() {
    const it = ed.item;
    $("#ed-icons").innerHTML = `<button type="button" class="iconopt ${!ed.icon ? "on" : ""}" data-icon="" title="group default">${icon(itemIcon({ ...it, icon: null }))}</button>` +
      Object.keys(ICON_SVG).map((k) => `<button type="button" class="iconopt ${ed.icon === k ? "on" : ""}" data-icon="${k}" title="${k}">${icon(k)}</button>`).join("");
    $("#ed-colors").innerHTML = `<button type="button" class="swatch group ${!ed.color ? "on" : ""}" data-color="" title="group colour" style="background:${itemColor({ ...it, color: null })}"></button>` +
      COLORS.map((c) => `<button type="button" class="swatch ${ed.color === c ? "on" : ""}" data-color="${c}" style="background:${c}"></button>`).join("");
  }

  function renderSubs() {
    const it = ed.item;
    const o = it.occ?.[ed.key] || {};
    $("#ed-subs").innerHTML = it.subtasks.map((s) => `<li class="${o.subDone?.[s.id] ? "sdone" : ""}" data-sub="${s.id}"><button type="button" class="box" data-act="sub-toggle"></button><span>${esc(s.title)}</span><button type="button" class="link" data-act="sub-del">x</button></li>`).join("") || `<li class="muted tiny">no subtasks.</li>`;
  }

  function renderComments() {
    if (!ed) return;
    const it = ed.item;
    const o = it.occ?.[ed.key] || {};
    const all = [...(it.comments || []), ...(o.comments || [])].sort((a, b) => a.at - b.at);
    $("#ed-comments").innerHTML = all.length
      ? all.map((c) => `<div class="cmt ${c.from}"><span class="who">${c.from === "kei" ? `${esc(selfShort())}&gt;` : "YOU&gt;"}</span> ${c.from === "kei" ? fmt(c.text) : esc(c.text)}<span class="when">${new Date(c.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span></div>`).join("")
      : `<div class="muted tiny">no log entries yet.</div>`;
  }

  // read the form into item fields
  function readForm() {
    const f = $("#ed-form");
    const { group, sub } = parseGroupKey(f.group.value);
    const freq = f.freq.value;
    const date = f.date.value || null;
    const list = (v) => v.split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
    let rec = null;
    if (freq) {
      const days = [...ed.days];
      rec = {
        freq: freq === "biweekly" ? "weekly" : freq,
        every: freq === "biweekly" ? 2 : 1,
        days: days.length ? days : date ? [keyToDate(date).getDay()] : [new Date().getDay()],
        start: date || dayKey(),
        end: f.end.value || null,
        dates: freq === "dates" ? list(f.dates.value) : [],
        skip: list(f.skip.value),
      };
      if (freq === "dates" && !date && rec.dates.length) rec.start = rec.dates.slice().sort()[0];
    }
    return {
      title: f.title.value.trim() || "untitled",
      group, sub,
      where: f.where.value.trim() || null,
      date: freq ? null : date,
      start: f.start.value || null,
      duration: f.start.value ? Number(f.duration.value) || 60 : null,
      due: freq ? null : f.due.value || null,
      dueTime: freq ? f.dueTime.value || null : null,
      rec,
      fixed: f.fixed.checked,
      optional: f.optional.checked,
      size: f.big.checked ? "big" : "small",
      icon: ed.icon || null,
      color: ed.color || null,
      notes: f.notes.value,
      estimate: Number(f.estimate.value) || null,
    };
  }
  const SERIES_KEYS = ["title", "group", "sub", "where", "start", "duration", "dueTime", "rec", "fixed", "optional", "size", "icon", "color", "notes", "estimate"];
  const seriesChanged = (it, fields) => SERIES_KEYS.some((k) => {
    if (k === "fixed") return fields.fixed !== instance(it, ed.key).fixed;
    return JSON.stringify(it[k] ?? null) !== JSON.stringify(fields[k] ?? null);
  });

  function resetDeadlineState(it) {
    for (const o of Object.values(it.occ || {})) { o.missed = false; o.reminded = false; o.snoozeUntil = null; }
  }

  function save(scope = null) {
    const it = ed.item;
    const fields = readForm();
    const f = $("#ed-form");
    const wasMad = madInstance();
    if (ed.isNew) {
      Object.assign(it, fields);
      if (!M.items.includes(it)) M.items.push(it);
      const inst = it.rec ? nextInstance(it) || instance(it, it.rec.start) : instance(it, "*");
      keiComment("add", inst);
      return finish(wasMad);
    }
    // per-day label / note on a recurring occurrence never need a scope
    if (it.rec) {
      const o = (it.occ ||= {})[ed.key] ||= {};
      o.label = f.occLabel.value.trim() || undefined;
      o.note = f.occNote.value.trim() || undefined;
    }
    if (it.rec && fields.rec && seriesChanged(it, fields) && !scope) {
      $("#ed-scope").hidden = false; // ask: this one / this and future / all
      return;
    }
    if (it.rec && scope === "this") {
      const o = it.occ[ed.key];
      if (fields.start !== it.start) o.start = fields.start;
      if (fields.duration !== it.duration) o.duration = fields.duration;
      if (fields.dueTime !== it.dueTime) o.due = fields.dueTime ? `${ed.key}T${fields.dueTime}` : null;
      if (fields.fixed !== !!it.fixed) o.fixed = fields.fixed;
      if (fields.title !== it.title) o.label = fields.title.startsWith(it.title) ? fields.title.slice(it.title.length).replace(/^[:\s]+/, "") : fields.title;
    } else if (it.rec && scope === "future" && ed.key > (it.rec.start || "")) {
      const copy = splitSeries(it, ed.key);
      Object.assign(copy, fields, { rec: { ...fields.rec, start: ed.key } });
    } else {
      if (it.due !== fields.due || it.dueTime !== fields.dueTime) resetDeadlineState(it);
      if (it.rec && !fields.rec) { it.occ = { "*": it.occ?.[ed.key] || {} }; fields.date ||= ed.key; }
      if (!it.rec && fields.rec) it.occ = {};
      Object.assign(it, fields);
    }
    finish(wasMad);
  }
  function finish(wasMad) {
    window.save();
    if (wasMad && !madInstance()) forgive();
    close();
  }

  function remove(scope = null) {
    const it = ed.item;
    if (it.rec && !scope) {
      $("#ed-scope").hidden = false;
      ed.pending = "delete";
      return;
    }
    if (!it.rec && !confirm(`delete "${it.title}"?`)) return;
    const wasMad = madInstance();
    snapshot();
    deleteItem(it, ed.key, scope || "all");
    if (R.alert && R.alert.id === it.id) clearAlert(false);
    finish(wasMad);
    toast(`deleted: ${it.title}${it.rec ? { this: " (that day)", future: " (from then on)", all: " (whole series)" }[scope] || "" : ""}`);
  }

  function quickAdd(title, gk) {
    if (!title.trim()) return;
    const { group, sub } = parseGroupKey(gk);
    const { rest, due } = parseWhen(title);
    const it = newItem({ title: rest.replace(/[.!]+$/, "") || title, group, sub, due });
    keiComment("add", instance(it, "*"));
    window.save();
    renderTasks();
    return it;
  }

  // ----------------------------------------------------------- events ---
  function fillGroupMenu() {
    $("#qa-group").innerHTML = groupOptions().map(([v, l]) => `<option value="${v}">${esc(v ? l : "inbox")}</option>`).join("");
  }

  function wire() {
    fillGroupMenu();
    $("#plan-filters").addEventListener("click", (e) => {
      const f = e.target.dataset.filter;
      if (f) { filter = f; renderTasks(); }
    });
    $("#quick-add").addEventListener("submit", (e) => {
      e.preventDefault();
      if (isSleeping() && !R.alert) sleepPoke();
      quickAdd($("#qa-title").value, $("#qa-group").value);
      $("#qa-title").value = "";
    });
    $("#qa-more").addEventListener("click", () => {
      const { group, sub } = parseGroupKey($("#qa-group").value);
      const it = { ...{ id: uid(), num: M.taskCounter + 1, title: $("#qa-title").value.trim() || "untitled", group, sub, subtasks: [], occ: {}, comments: [], size: "small", createdAt: Date.now() } };
      M.taskCounter++;
      $("#qa-title").value = "";
      open(it, "*", true);
    });

    const listClick = (e) => {
      const head = e.target.closest(".g-head");
      if (head) {
        const k = head.dataset.group;
        collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k);
        return renderTasks();
      }
      const li = e.target.closest("[data-id]");
      if (!li) return;
      const inst = findInst(li.dataset.id, li.dataset.key);
      if (!inst) return;
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "toggle" || act === "done") return toggleDone(inst);
      if (act === "open" || li.classList.contains("day-chip")) open(inst.item, inst.key);
    };
    $("#plan-list").addEventListener("click", listClick);
    $("#timeline").addEventListener("click", listClick);
    $("#day-strip").addEventListener("click", listClick);

    $("#btn-add-block").addEventListener("click", () => {
      const nm = Math.min(Math.ceil(nowMin() / 15) * 15, 23 * 60);
      const it = { id: uid(), num: ++M.taskCounter, title: "untitled", group: null, sub: null, date: R.viewDay, start: min2hm(nm), duration: 60, subtasks: [], occ: {}, comments: [], size: "small", createdAt: Date.now() };
      open(it, "*", true);
    });

    $("#mad-banner").addEventListener("click", (e) => {
      const el = $("#mad-banner");
      const inst = findInst(el.dataset.id, el.dataset.key);
      if (!inst) return;
      if (e.target.dataset.done) return completeInstance(inst);
      if ("to" in e.target.dataset) setInstDue(inst, e.target.dataset.to);
    });

    // editor
    const f = $("#ed-form");
    f.addEventListener("submit", (e) => { e.preventDefault(); save(); });
    $("#ed-close").addEventListener("click", close);
    f.freq.addEventListener("change", () => {
      if ((f.freq.value === "weekly" || f.freq.value === "biweekly") && !ed.days.size) ed.days.add(f.date.value ? keyToDate(f.date.value).getDay() : new Date().getDay());
      syncRepeatFields();
    });
    $("#ed-days").addEventListener("click", (e) => {
      const d = e.target.dataset.day;
      if (d == null) return;
      ed.days.has(+d) ? ed.days.delete(+d) : ed.days.add(+d);
      syncRepeatFields();
    });
    $("#ed-icons").addEventListener("click", (e) => { const b = e.target.closest("[data-icon]"); if (b) { ed.icon = b.dataset.icon || null; renderPickers(); } });
    $("#ed-colors").addEventListener("click", (e) => { const b = e.target.closest("[data-color]"); if (b) { ed.color = b.dataset.color || null; renderPickers(); } });
    $("#ed-subs").addEventListener("click", (e) => {
      const li = e.target.closest("[data-sub]");
      if (!li) return;
      const it = ed.item;
      const act = e.target.dataset.act;
      if (act === "sub-del") it.subtasks = it.subtasks.filter((s) => s.id !== li.dataset.sub);
      if (act === "sub-toggle") {
        const o = ((it.occ ||= {})[ed.key] ||= {});
        o.subDone ||= {};
        o.subDone[li.dataset.sub] = !o.subDone[li.dataset.sub];
        if (o.subDone[li.dataset.sub] && M.items.includes(it)) { addTrust(1); addCharge(3); sfx.chime(); feel("happy", 1500); }
      }
      window.save();
      renderSubs();
    });
    const addSub = () => {
      const v = $("#ed-sub-new").value.trim();
      if (!v) return;
      ed.item.subtasks.push({ id: uid(), title: v });
      $("#ed-sub-new").value = "";
      renderSubs();
    };
    $("#ed-sub-add").addEventListener("click", addSub);
    $("#ed-sub-new").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } });
    const addMine = () => {
      const v = $("#ed-comment").value.trim();
      if (!v) return;
      const it = ed.item;
      addComment(it.rec ? ((it.occ ||= {})[ed.key] ||= {}) : ((it.occ ||= {})["*"] ||= {}), v, "you");
      $("#ed-comment").value = "";
    };
    $("#ed-comment-add").addEventListener("click", addMine);
    $("#ed-comment").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addMine(); } });
    $("#ed-done").addEventListener("click", () => {
      const inst = instance(ed.item, ed.key);
      close();
      toggleDone(inst);
    });
    $("#ed-focus").addEventListener("click", () => {
      const inst = instance(ed.item, ed.key);
      close();
      setTimeout(() => Study.focusStart({ inst, mins: clamp(inst.duration || 25, 15, 90) }), 50);
    });
    $("#ed-delete").addEventListener("click", () => remove());
    $("#ed-skip").addEventListener("click", () => {
      const inst = instance(ed.item, ed.key);
      ed = null;
      $("#editor").hidden = true;
      removeInst(inst);
    });
    $("#toast-undo").addEventListener("click", undo);
    $("#ed-scope").addEventListener("click", (e) => {
      const s = e.target.dataset.scope;
      if (!s) return;
      $("#ed-scope").hidden = true;
      const pending = ed.pending;
      ed.pending = null;
      if (s === "cancel") return;
      pending === "delete" ? remove(s) : save(s);
    });
  }

  // ---------------------------------------------------- remove + undo ---
  let undoSnap = null, toastTimer = null;
  function snapshot() {
    undoSnap = JSON.stringify(M.items);
  }
  function toast(msg) {
    const t = $("#toast");
    $(".msg", t).textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 7000);
  }
  function undo() {
    if (!undoSnap) return;
    M.items = JSON.parse(undoSnap);
    undoSnap = null;
    $("#toast").hidden = true;
    window.save();
    renderAll();
  }
  // a recurring item loses just this day; a one-off item goes entirely
  function removeInst(inst) {
    const wasMad = madInstance();
    snapshot();
    const day = inst.item.rec ? ` (${fmtDay(inst.key)} only)` : "";
    removeOccurrence(inst);
    if (R.alert && R.alert.id === inst.item.id && R.alert.key === inst.key) clearAlert(false);
    window.save();
    if (wasMad && !madInstance()) forgive();
    renderAll();
    toast(`removed: ${inst.title}${day}`);
  }

  function toggleDone(inst) {
    if (inst.s.done) {
      const o = stateOf(inst);
      o.done = false;
      o.lapsed = false;
      window.save();
      return renderAll();
    }
    completeInstance(inst);
  }

  function refreshEditor() {
    if (ed) renderComments();
  }

  return { renderTasks, renderTimeline, positionNowLine, open, close, isOpen, wire, refreshEditor, icon, quickAdd, snapshot, toast, removeInst };
})();
window.Planner = Planner;
