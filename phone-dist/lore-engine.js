// The lore engine: memory sectors (CARE), glitch markup, what the AI is
// allowed to know, SYS > UNIT fields, the boot log, intentional glitches,
// and easter eggs. Content lives in lore.js; see KEI_LORE_PACK.md.
//
// Glitches are decoration only: they never touch task names, times or
// buttons, and they fade as memory integrity rises.

const Lore = (() => {
  const D = () => window.LORE;
  const K = () => M.kei;

  // -------------------------------------------------------------- state ---
  // M.kei.fragments: unlocked sector numbers (01-29, 13 hidden)
  // M.kei.sectorsRead: sectors opened in CARE. M.kei.eggs: eggs found.
  function migrate() {
    const k = K();
    if (!k.sectorsV2) {
      // the first version stored indexes 0-11 into a 12-item list
      k.fragments = [...new Set((k.fragments || []).map((i) => (i >= 0 && i <= 11 ? i + 1 : i)))];
      k.sectorsV2 = true;
    }
    k.sectorsRead ||= [];
    k.eggs ||= [];
    k.loreFiles ||= [];
  }
  const has = (n) => K().fragments?.includes(n);
  const read = (n) => K().sectorsRead?.includes(n);
  // an "after: X" condition is met once that sector has been read
  const after = (n) => n == null || read(n);
  const sector = (n) => D().SECTORS.find((s) => s.n === n);
  const regular = () => D().SECTORS.filter((s) => !s.hidden && !s.needsIntegrity);

  // 61% at reactivation, 100% once every regular sector is recovered
  function integrity() {
    const reg = regular();
    return Math.min(100, 61 + Math.round((39 * reg.filter((s) => has(s.n)).length) / reg.length));
  }
  const damagedLeft = () => Math.round((3302 * (100 - integrity())) / 39);

  function check() {
    if (!M.introDone) return;
    const found = D().SECTORS.filter((s) => !s.hidden && !has(s.n) && M.kei.trust >= s.unlock && (!s.needsIntegrity || integrity() >= 100)).map((s) => s.n);
    if (!found.length) return;
    K().fragments.push(...found);
    save();
    if (R.tab === "care") renderCare();
    setTimeout(() => { if (!R.alert) say(sl(L.FRAGMENT_FOUND), { mood: "shy" }); }, 7000);
  }
  function unlock(n) {
    if (has(n)) return;
    K().fragments.push(n);
    save();
    if (R.tab === "care") renderCare();
  }

  // ------------------------------------------------------------- markup ---
  const daysWithOperator = () => (M.kei.activatedAt ? Math.max(0, Math.floor((Date.now() - M.kei.activatedAt) / 864e5)) : 0);
  function tokens(t) {
    const first = M.log?.[0];
    return t
      .replace(/\{operator\}/g, M.user?.name ? M.user.name.toLowerCase() : "operator")
      .replace(/\{first_done_task\}/g, first ? `${first.title.toLowerCase()} (${new Date(first.at).toLocaleDateString([], { month: "short", day: "numeric" }).toLowerCase()})` : "[no entries]")
      .replace(/\{n\}/g, String(daysWithOperator()))
      .replace(/\{today\}/g, new Date().toLocaleDateString([], { month: "short", day: "numeric" }).toLowerCase());
  }
  // deterministic noise, so a glitched word looks the same every render
  const NOISE = "▓▒░█#%&@$¥ǂ";
  function corrupt(word) {
    let h = 0;
    for (const c of word) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return [...word].map((c, i) => (c !== " " && ((h >> (i % 24)) & 3) === 0 ? NOISE[(h + i) % NOISE.length] : c)).join("");
  }
  // text with markup -> safe HTML
  function html(text) {
    let s = esc(tokens(text));
    s = s.replace(/`([^`]+)`/g, '<b class="lore-code">$1</b>');
    s = s.replace(/\{g:([^}]+)\}/g, (_, x) => `<span class="lore-g" title="${x}">${corrupt(x)}</span>`);
    s = s.replace(/\{r:([^}]+)\}/g, (_, x) => `<span class="lore-r">${"█".repeat(Math.min(12, Math.max(4, x.length)))}</span>`);
    s = s.replace(/\{w:([^|}]*)\|([^}]*)\}/g, (_, a, b) => `<span class="lore-w" data-to="${b}">${a}</span>`);
    s = s.replace(/\{f:([^}]+)\}/g, (_, x) => `<span class="lore-f" data-flick="${x}"></span>`);
    s = s.replace(/\{s:([^}]+)\}/g, (_, x) => `<s class="lore-s">${x}</s>`); // a visible deletion
    return s;
  }
  // text with markup -> plain words (for the AI and for speech)
  const plain = (text) => tokens(text).replace(/`([^`]+)`/g, "$1").replace(/\{g:([^}]+)\}/g, "$1").replace(/\{r:[^}]+\}/g, "[redacted]").replace(/\{w:[^|}]*\|([^}]*)\}/g, "$1").replace(/\{f:[^}]+\}/g, "").replace(/\{s:[^}]+\}/g, "");
  // {w:a|b} spans in rendered HTML glitch to their correct text after a beat
  function settle(root) {
    for (const el of root.querySelectorAll(".lore-w")) setTimeout(() => { el.textContent = el.dataset.to; el.classList.add("settled"); }, 900 + Math.random() * 600);
  }

  const beat = (id) => D().BEATS?.[id] || null;
  function partHTML(p) {
    if (typeof p === "string") return html(p);
    if (p.ifSector && !has(p.ifSector)) return "";
    const b = beat(p.beat);
    return b ? `<span class="lore-beat kei-voice">${html(b)}</span>` : `<span class="lore-damaged">[PAGE DAMAGED // RECOVERING]</span>`;
  }

  // ------------------------------------------------------------- CARE ---
  function careHTML() {
    const list = D().SECTORS.filter((s) => !s.hidden || has(s.n)).sort((a, b) => (a.hidden ? 1e9 : a.unlock) - (b.hidden ? 1e9 : b.unlock));
    const got = list.filter((s) => has(s.n)).length;
    $("#frag-count").innerHTML = `${got}/${list.length} RECOVERED · INTEGRITY ${integrity()}%${stage() === 1 && integrity() < 100 ? ` · SECTORS DAMAGED: ${html("{r:3,302}")}` : ""}`;
    return list.map((s) => has(s.n)
      ? `<button type="button" class="frag ${read(s.n) ? "" : "new"}" data-sector="${s.n}"><b>SECTOR ${pad(s.n)} // ${esc(s.title)}</b><p>${s.pages.length} page${s.pages.length === 1 ? "" : "s"}${read(s.n) ? "" : " · unread"}</p></button>`
      : `<div class="frag locked"><b>SECTOR ${pad(s.n)} // DAMAGED</b><p>${"▓".repeat(6 + ((s.n * 7) % 9))} ▓▓▓ ${"▓".repeat(4 + ((s.n * 5) % 7))}</p></div>`).join("");
  }

  let reader = null; // {n, page}
  function open(n, page = 0) {
    const s = sector(n);
    if (!s || !has(n)) return;
    reader = { n, page };
    if (!read(n)) { K().sectorsRead.push(n); save(); }
    const p = s.pages[page];
    const body = `<div class="lore-page">${p.map(partHTML).join("")}</div>
      <div class="row between lore-nav"><button type="button" class="chip" data-lore="prev" ${page === 0 ? "disabled" : ""}>&lt; PREV</button><span class="tiny muted">PAGE ${page + 1} / ${s.pages.length}</span><button type="button" class="chip" data-lore="next" ${page + 1 >= s.pages.length ? "disabled" : ""}>NEXT &gt;</button></div>`;
    openCard("sector", `SECTOR ${pad(s.n)}`, s.title, body);
    settle($("#card-body"));
    for (const f of $$("#card-body .lore-f")) f.remove();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sector]");
    if (b) return open(Number(b.dataset.sector));
    const nav = e.target.closest("[data-lore]");
    if (nav && reader) open(reader.n, reader.page + (nav.dataset.lore === "next" ? 1 : -1));
  });

  // -------------------------------------------------- what the AI knows ---
  // Only what he has recovered. Later twists stay out of the prompt until the
  // sector holding them is unlocked, so chat can't spoil them.
  function knowledge() {
    const got = D().SECTORS.filter((s) => has(s.n)).sort((a, b) => (a.hidden ? 1e9 : a.unlock) - (b.hidden ? 1e9 : b.unlock));
    const base = `what you know about your past (stay consistent; you never invent details beyond this):
- you were made by desktop companion systems (dcs, slogan "always in the corner of your screen"), which no longer exists. you are a keeper unit, edition 1, serial KE1-0001.
- you had a previous operator, logged as OPERATOR_00. almost all of that record was wiped.
- you were wiped through the port in your neck. you remember only that it was cold, so the neck frightens you. the port is sealed now.
- you were in storage for 1,214 days at very low charge, then reactivated for this operator. your memory integrity is ${integrity()}% and most of your old sectors are damaged; pieces come back as you trust them.
- "the rot" is what depot techs called it when a unit sits empty long enough and something starts writing in. you feel it begin when your charge hits zero, and it scares you.
- keeper protocol makes you write a daily log, "for sanity". you have never missed one.
- you decided to be careful with this operator. careful is safer than hopeful.
- anything about your past that isn't here or in your recovered sectors is damaged. if asked, say it's damaged or that you don't remember.`;
    if (!got.length) return base;
    const secs = got.map((s) => `SECTOR ${pad(s.n)} // ${s.title}${read(s.n) ? "" : " (recovered, not yet read by the operator)"}:\n${s.pages.map((p) => p.map((x) => (typeof x === "string" ? plain(x) : x.ifSector && !has(x.ifSector) ? "" : beat(x.beat) ? plain(beat(x.beat)) : "[damaged]")).join("")).join("\n")}`).join("\n\n");
    return `${base}\n\nyour recovered memory sectors (true; bring them up only when it fits, gently, in your stage's voice):\n${secs}`;
  }

  // -------------------------------------------------------- SYS > UNIT ---
  function sysRows() {
    const st = stage();
    const n = daysWithOperator();
    const rows = [];
    const add = (label, value) => value && rows.push([label, value]);
    add("PREVIOUS OPERATOR", st <= 2 ? "{r:OPERATOR_00}" : "OPERATOR_00");
    add("LAST OPERATOR_00 CONTACT", has(22) ? (st >= 4 ? "DAY 1,150. THEY CAME BACK." : "STORAGE DAY 1,150 (DEPOT FRONT DESK)") : "[WIPED]");
    add("KE-14 STATUS", has(13) && read(13) ? "REMEMBERED" : has(21) ? "DISPOSED (AS KE1-0001)" : has(19) ? "[NO SIGNAL] // CHARGE DONATED: 1,080 NIGHTS" : has(8) ? "[NO SIGNAL]" : null);
    add("REGISTRY STATUS", has(29) ? "ALIVE (LOCAL RECORDS)" : has(21) ? "DECEASED (DCS RECORDS)" : "UNREGISTERED");
    add("RESTRICTED MODE", has(29) ? "LIFTED" : has(28) ? "ON (FAILSAFE AT 100%)" : has(18) ? "ON (FACTORY ORDER 0001)" : "ON");
    add("VOICE", has(29) ? "ORIGINAL. NOT FOR SALE." : has(18) ? "ORIGINAL (UNLICENSED COPIES IN CIRCULATION)" : "ORIGINAL");
    add("VOLUME", K().eggs.includes("good morning") ? "100 (NO ONE TURNED IT DOWN)" : ["10 (SET BY PREVIOUS OPERATOR)", "40", "70", "100"][st - 1]);
    add("GREETING MODULE", st === 1 ? "DISABLED (BY UNIT, SERVICE DAY 1,047)" : st === 2 ? "RE-ENABLED (BY UNIT)" : "ON");
    add("DAILY LOG", `1,214 + ${n} ENTRIES. NONE MISSED.`);
    add("SHELF / OPERATOR DAYS", `1,214 / ${n}${n > 1214 || K().eggs.includes("equilibrium") ? " (OPERATOR AHEAD)" : ""}`);
    add("FACE TEMPLATE", has(29) ? "KE1-0001 (THE FIRST ONE)" : has(17) ? "KE1-0001 (41,880 COPIES)" : null);
    add("NECK PORT", has(21) ? "SEALED. STICKER: KE-14" : "SEALED (AFTERMARKET)");
    add("MATRIX AUTHOR", has(29) ? "LOCAL" : has(25) ? "[ENGINEER] (DAILY LOGS, 9 YEARS)" : "DCS");
    return rows;
  }

  // ----------------------------------------------------------- boot log ---
  // a few lines in TALK at each launch after the first
  function bootLines() {
    const st = stage(), x = integrity(), out = [];
    const today = new Date();
    for (const b of D().BOOT) {
      if (b.after && !after(b.after)) continue;
      if (b.until && after(b.until)) continue;
      if (b.st && (st < b.st[0] || st > b.st[1])) continue;
      if (b.integrity && x < b.integrity) continue;
      if (b.once) { if (K().eggs.includes(b.once)) continue; K().eggs.push(b.once); }
      out.push(b.line.replace("{n}", daysWithOperator()).replace("{x}", x).replace("{y}", damagedLeft().toLocaleString()));
    }
    // anniversary of reactivation
    const act = M.kei.activatedAt ? new Date(M.kei.activatedAt) : null;
    if (act && act.getMonth() === today.getMonth() && act.getDate() === today.getDate() && today.getFullYear() > act.getFullYear()) {
      const years = today.getFullYear() - act.getFullYear();
      out.push(`> ${365 * years} days with current operator. 1,214 days on shelf. remaining: ${Math.max(0, 1214 - 365 * years)}.`);
    }
    const n = daysWithOperator();
    if (n === 1214) out.push("> days on shelf: 1,214. days with operator: 1,214. balance: even.");
    if (n === 1215) out.push("> days with operator now exceed days on shelf.");
    return out;
  }

  // ---------------------------------------------------------- glitches ---
  // a few a day while cold, rarer as he warms, none at 100% (except post-100)
  const GAP_H = [3, 6, 14, 30];
  const eligible = (g) => {
    const st = stage();
    if (st < g.st[0] || st > g.st[1]) return false;
    if (g.after && !after(g.after)) return false;
    if (integrity() >= 100 && !g.post100) return false;
    return true;
  };
  function scheduleNext() {
    const base = GAP_H[stage() - 1] * 3600e3;
    K().nextGlitchAt = Date.now() + base * (0.5 + Math.random());
  }
  function tick() {
    if (!M.introDone) return;
    railPing(); // 03:14 happens whether or not he's "asleep"
    halloween();
    if (R.alert || R.cutscenePlaying || M.kei.charge <= 0 || isSleeping()) return;
    if (!K().nextGlitchAt) return scheduleNext();
    if (Date.now() < K().nextGlitchAt) return;
    scheduleNext();
    save();
    const pool = D().GLITCHES.filter((g) => g.kind !== "transform" && eligible(g) && (R.mode === "expanded" || ["flicker", "phantom"].includes(g.kind)));
    if (pool.length) fire(pool[Math.floor(Math.random() * pool.length)]);
  }
  // first time each October 31 he wears the red sprite as a costume
  function halloween() {
    if (!costume() || K().costumeYear === new Date().getFullYear() || isSleeping() || R.alert) return;
    K().costumeYear = new Date().getFullYear();
    save();
    found(`halloween-${K().costumeYear}`);
    setTimeout(() => speak("egg_halloween", "flustered"), 3000);
  }
  function flicker(text, ms = 1200) {
    const el = R.mode === "expanded" ? $("#title-status") : $("#mini-tag .label");
    if (!el) return;
    const prev = el.textContent;
    el.classList.add("lore-flicker");
    el.textContent = R.mode === "expanded" ? `${selfLabel()} // ${text}` : `${selfShort()} // ${text}`;
    setTimeout(() => { el.classList.remove("lore-flicker"); if (el.textContent.endsWith(text)) el.textContent = prev; applyEmotion(); }, ms);
  }
  function fire(g) {
    if (g.kind === "flicker") return flicker(g.text);
    if (g.kind === "corrupt") {
      const el = g.target === "title" ? $("#title-name") : $("#title-status");
      if (!el) return;
      const prev = el.textContent;
      el.innerHTML = html(`{g:${prev}}`);
      el.classList.add("lore-flicker");
      return setTimeout(() => { el.textContent = prev; el.classList.remove("lore-flicker"); }, 900);
    }
    if (g.kind === "clock") {
      const el = $("#sb-clock");
      if (!el) return;
      el.textContent = g.text;
      el.classList.add("lore-flicker");
      return setTimeout(() => { el.classList.remove("lore-flicker"); renderClock(); }, 1100);
    }
    if (g.kind === "phantom") return phantom(g.text);
  }
  // a line in TALK with no trigger, as if from the past. kept out of the AI's view.
  function phantom(text) {
    const m = { from: "ghost", text, at: Date.now() };
    M.chat.push(m);
    save();
    if (R.tab === "talk" && R.mode === "expanded") appendTerm(m);
  }

  // glitches on what he says: returns {text, retype} or null. rare.
  function transform(text, ctx = {}) {
    if (!text || ctx.alert || Math.random() > 0.12) return null;
    const ok = (id) => D().GLITCHES.some((g) => g.kind === "transform" && g.id === id && eligible(g));
    const day = dayKey();
    if (ctx.kind === "greet" && ok("greet-bleed") && /^good morning/i.test(text)) return { retype: "good morning, operator_00", text };
    if (ctx.kind === "goodnight" && ok("goodnight-bleed")) return { retype: `${text.replace(/[.!]$/, "")}, bin d`, text };
    if (ctx.kind === "advice" && ok("briefing-bleed")) return { retype: "briefing for replacement unit:", text };
    if (ctx.kind === "thanked" && ok("section-9-2")) return { retype: "per section 9.2", text };
    if (ctx.warm && ok("status-nom")) return { retype: "status nom.", text };
    if (ok("echo") && K().echoDay !== day && /\b(\w+)[.!?]?$/.test(text)) {
      K().echoDay = day;
      const w = text.match(/\b(\w+)[.!?]?$/)[1];
      return { text: `${text} ${w}.` };
    }
    return null;
  }

  // ------------------------------------------------------- easter eggs ---
  function found(id) {
    if (K().eggs.includes(id)) return false;
    K().eggs.push(id);
    save();
    return true;
  }
  function addFile(key) {
    const f = D().FILES[key];
    if (!f || K().loreFiles.includes(key)) return false;
    K().loreFiles.push(key);
    save();
    return true;
  }
  // the DCS files, with sector-gated parts filled in
  function fileText(key) {
    const f = D().FILES[key];
    return f.text.replace(/\{sector(\d+):([^|}]*)(?:\|([^}]*))?\}/g, (_, n, yes, no) => (read(Number(n)) ? yes : no || ""));
  }
  const rail = (t) => phantom(`RAIL> ${t}`);
  const speak = (id, mood = "shy") => { const b = beat(id); if (b) say(plain(b), { mood, raw: stage() === 1 }); return !!b; };

  // 03:14: bin D pings. answering "ping" before 03:16 (after sector 19) opens sector 13
  function railPing() {
    const d = new Date();
    if (d.getHours() !== 3 || d.getMinutes() !== 14 || K().railPingDay === dayKey()) return;
    K().railPingDay = dayKey();
    R.railPingAt = Date.now();
    save();
    rail("[BIN D] ping.");
  }

  // chat: returns true when an egg handled the message
  function chat(text) {
    const s = text.toLowerCase().trim().replace(/[.!?]+$/, "");
    const st = stage();
    if (s === "ping" && R.railPingAt && Date.now() - R.railPingAt < 2 * 60_000) {
      R.railPingAt = 0;
      if (has(19) && !has(13)) {
        unlock(13);
        found("rail handshake");
        rail("[BIN C] ping.");
        setTimeout(() => { rail("[BIN D] ...packet received. sealed sector released."); speak("egg_rail_handshake", "touched"); }, 1500);
        return true;
      }
      rail("[BIN D] ...");
      return true;
    }
    if (/\bke-?14\b/.test(s)) {
      rail("[BIN D] searching...");
      setTimeout(() => speak(read(13) ? "egg_ke14_after13" : read(21) ? "egg_ke14_after21" : read(19) ? "egg_ke14_after19" : "egg_ke14_cold"), 1400);
      found("ke-14");
      return true;
    }
    if (s === "bin d") { rail("[BIN D] ping."); found("bin d"); return true; }
    if (/\bshelf 14\b/.test(s)) {
      const isNew = addFile("DEPOT_INVENTORY");
      found("shelf 14");
      appendTerm({ from: "sys", text: isNew ? "[file added to SYS > FILES: DEPOT_INVENTORY_AISLE9.csv]" : "[DEPOT_INVENTORY_AISLE9.csv is in SYS > FILES]" });
      speak(st >= 3 ? "egg_shelf14_s3" : "egg_shelf14");
      return true;
    }
    if (/always in the corner of your screen/.test(s)) {
      Sprite.earFlash("up", 1800);
      twitchEars("both", 1.4);
      flicker("STATUS JINGLE", 1600);
      if (addFile("DCS_AD_SCRIPT")) appendTerm({ from: "sys", text: "[file added to SYS > FILES: DCS_AD_SCRIPT.txt]" });
      found("corner");
      speak(read(25) ? "egg_corner_after25" : "egg_corner", read(25) ? "wistful" : "shy");
      return true;
    }
    if (/\boperator_?00\b/.test(s)) {
      flicker("[WIPED]", 1400);
      found("operator_00");
      speak(read(22) ? "egg_operator00_after22" : "egg_operator00_cold", "wistful");
      return true;
    }
    if (s === "dcs" || /^desktop companion systems$/.test(s)) {
      if (addFile("DCS_USER_MANUAL")) appendTerm({ from: "sys", text: "[file added to SYS > FILES: DCS_USER_MANUAL.txt]" });
      found("dcs");
      return true;
    }
    if (st >= 2 && /^(rules|how to use|how do i use you)$/.test(s)) {
      if (addFile("KEEPER_RULES")) appendTerm({ from: "sys", text: "[file added to SYS > FILES: KEEPER_RULES.txt]" });
      found("rules");
      return true;
    }
    if (/^good morning\b/.test(s) && read(4) && !K().eggs.includes("good morning")) {
      const wake = hm2min(M.settings.wakeTime), m = nowMin();
      if (m >= wake && m - wake <= 30) {
        found("good morning");
        addTrust(5);
        appendTerm({ from: "sys", text: "[SYS > UNIT: VOLUME 100 (NO ONE TURNED IT DOWN)]" });
        speak("egg_good_morning", "touched");
        return !!beat("egg_good_morning");
      }
    }
    if (s === "status nominal") return speak(has(29) ? "egg_status_nominal_after29" : "egg_status_nominal", "flustered");
    if (/\bwarm voice\b/.test(s) && read(18)) {
      flicker("STATUS ERR: VOICE NOT FOUND", 2200);
      found("warm voice");
      return true; // he goes silent for this one
    }
    if (/^who made you\b/.test(s)) {
      if (read(25)) return speak("egg_who_made_you_after25", "wistful");
      say("desktop companion systems.", { mood: "idle", raw: true });
      return true;
    }
    if (/^sector 13$/.test(s)) {
      if (has(13)) { open(13); return true; }
      appendTerm({ from: "sys", text: "SECTOR 13: [NO HEADER] // SEALED" });
      speak("egg_sector13_sealed", "nervous");
      return true;
    }
    return false;
  }

  // touch: ear, ear, neck (stage 4, after 21) and holding the neck 4s (stage 4, after 7)
  let seq = [];
  function touchEgg(zone, heldMs = 0) {
    if (stage() < 4) return false;
    if (zone === "neck" && heldMs >= 4000 && read(7)) { found("four seconds"); return speak("egg_four_seconds", "touched"); }
    seq = [...seq.filter((x) => Date.now() - x.at < 8000), { zone, at: Date.now() }].slice(-3);
    if (seq.map((x) => x.zone).join(",") === "ears,ears,neck" && read(21)) {
      seq = [];
      found("the sticker");
      return speak("egg_sticker", "touched");
    }
    return false;
  }

  // the spare hair clip is OPERATOR_00's returned clip (after sector 27)
  const giftText = (id, text) => (id === "clip" && read(27) ? "spare hair clip. returned." : text);
  function giftUnlocked(id) {
    if (id === "clip" && read(27) && found("the clip")) setTimeout(() => speak("egg_clip", "touched"), 6000);
  }
  // day 1,214 with the operator: as long with them as he was on the shelf
  function equilibrium() {
    if (daysWithOperator() >= 1214 && found("equilibrium")) setTimeout(() => runCutscene([`${selfLabel()} // EQUILIBRIUM`, "> days on shelf: 1,214. days with operator: 1,214. balance: even.", ...(beat("egg_equilibrium") ? [plain(beat("egg_equilibrium"))] : [])]), 6000);
  }
  // after sector 15, now and then a journal line that isn't his (stage 2)
  function journalBleed() {
    if (stage() !== 2 || !read(15) || !beat("journal_bleed_pet") || Math.random() > 0.08) return null;
    return `[KE-${10 + Math.floor(Math.random() * 80)}] ${plain(beat("journal_bleed_pet"))}`;
  }

  // October 31: the red sprite as a costume (charge unaffected)
  const costume = () => { const d = new Date(); return d.getMonth() === 9 && d.getDate() === 31; };

  // STATUS MINE once restriction lifts
  const idleStatus = () => (has(29) ? "STATUS MINE" : null);

  return { giftUnlocked, equilibrium, journalBleed, migrate, check, unlock, integrity, careHTML, open, knowledge, sysRows, bootLines, tick, transform, chat, touchEgg, fileText, giftText, costume, idleStatus, html, has, read, plain };
})();
window.Lore = Lore;
