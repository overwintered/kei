// Now playing (Spotify on this Mac). While a song plays and his panel is
// open: tiny bouncing bars + a slow-scrolling title in the status bar, his
// ears bob, faint notes drift up. All of it is CSS transforms/opacity (cheap,
// GPU-composited) and stops entirely when he's collapsed or the music pauses.
// Spotify is asked every 5s with the panel open, every 15s collapsed.
//
// Now and then, when the song changes, he says something about it.

const Music = (() => {
  const m = () => (M.music ||= { plays: [], lastCommentAt: 0 });
  // how long he leaves between remarks, by stage
  const GAP = [45, 35, 25, 20].map((x) => x * 60_000);
  let now = { state: "off" };
  let lastKey = "";
  let lastPoll = 0;
  let busy = false;

  const key = (t) => (t?.track ? `${t.track}|${t.artist}` : "");
  const playing = () => now.state === "playing";

  // an occasional little ear flick to the music (the spring sleeps between flicks)
  let flickTimer = null;
  function flicks(on) {
    if (on && !flickTimer) flickTimer = setInterval(() => { if (playing() && R.mode === "expanded" && !document.hidden) Sprite.twitch(Math.random() < 0.5 ? "l" : "r", 0.35); }, 3800 + Math.random() * 1500);
    if (!on && flickTimer) { clearInterval(flickTimer); flickTimer = null; }
  }

  const layout = () => fitStatusbar();

  function render() {
    const on = playing() && R.mode === "expanded";
    body.classList.toggle("music", on);
    flicks(on);
    const el = $("#sb-music");
    if (!el) return;
    el.hidden = !playing();
    if (!playing()) return layout();
    const t = `${now.track.toLowerCase()} — ${now.artist.toLowerCase()}`;
    const span = $(".mq-t", el);
    if (span.textContent !== t) {
      span.textContent = t;
      el.title = `${now.track} — ${now.artist}${now.album ? ` (${now.album})` : ""}`;
      // only scroll when the title doesn't fit
      requestAnimationFrame(layout);
    }
  }

  async function poll() {
    if (busy || !host.nowPlaying) return;
    const gap = R.mode === "expanded" ? 5000 : 15000;
    if (Date.now() - lastPoll < gap) return;
    busy = true;
    lastPoll = Date.now();
    try {
      now = (await host.nowPlaying()) || { state: "off" };
    } catch {
      now = { state: "off" };
    }
    busy = false;
    render();
    const k = key(now);
    if (playing() && k && k !== lastKey) {
      lastKey = k;
      changed();
    }
  }

  // a new song started
  function changed() {
    const p = m().plays;
    p.push({ at: Date.now(), track: now.track, artist: now.artist });
    if (p.length > 600) m().plays = p.slice(-600);
    save();
    const today = p.filter((x) => dayKey(new Date(x.at)) === dayKey() && x.track === now.track && x.artist === now.artist).length;
    const repeat = today >= 3 && !m().repeatNoted?.[`${dayKey()}|${key(now)}`];
    if (!quietNow()) return;
    if (!repeat && Date.now() - (m().lastCommentAt || 0) < GAP[stage() - 1]) return;
    if (!repeat && Math.random() < 0.5) return; // not every eligible song either
    if (repeat) (m().repeatNoted ||= {})[`${dayKey()}|${key(now)}`] = true;
    m().lastCommentAt = Date.now();
    save();
    comment(today);
  }
  // he only talks over music when nothing else is going on
  const quietNow = () => M.introDone && !isSleeping() && !R.alert && !R.cutscenePlaying && !R.talking && !Study.focusing() && !Study.isOpen() && !Health.quiet() && R.present !== false && canInterject(90_000);

  async function comment(timesToday) {
    interjected();
    const t = { song: now.track.toLowerCase(), artist: now.artist.toLowerCase() };
    let text = null;
    if (activeEngine() !== "scripted") {
      const res = await llm({
        quick: true,
        system: keiSystemPrompt(),
        messages: [{ role: "user", content: `${keiContext()}\n\nthey just started playing "${now.track}" by ${now.artist}${now.album ? ` (from ${now.album})` : ""} on spotify${timesToday >= 3 ? ` (${timesToday} plays today)` : ""}. their recent music: ${recent().join("; ") || "nothing yet"}.\nsay one short line about it, out loud, in your current stage's voice. you know a lot of music; say something real about the song or artist if you can (or about it being on repeat). no tags.` }],
      });
      if (res?.text) text = sanitize(res.text.replace(/\[\[[^\]]*\]\]/g, "")).slice(0, 200);
    }
    if (!text) text = sl(timesToday >= 3 ? L.MUSIC.repeat : L.MUSIC.comment, { ...t, n: timesToday });
    feel(stage() >= 2 ? "happy" : "idle", 3500);
    say(text, { mood: "happy", raw: !!text });
  }

  const recent = () => [...new Set(m().plays.slice(-12).map((x) => `${x.track} by ${x.artist}`))].slice(-6);
  // for the AI: what they're listening to, and their taste lately
  function promptLine() {
    const p = m().plays.filter((x) => x.at > Date.now() - 14 * 864e5);
    if (!p.length && !playing()) return "";
    const top = Object.entries(p.reduce((a, x) => ((a[x.artist] = (a[x.artist] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a);
    return `${playing() ? `playing right now on spotify: "${now.track}" by ${now.artist}${now.album ? `, from "${now.album}"` : ""}. that's all you know about it: don't invent track numbers, other songs, albums or facts about the artist.\n` : ""}${top.length ? `artists they've played most lately: ${top.join(", ")}.\n` : ""}`;
  }

  // collapsing/expanding switches the animations off/on without waiting for a poll
  const sync = () => { render(); requestAnimationFrame(layout); };

  return { poll, sync, layout, promptLine, now: () => now };
})();
window.Music = Music;
