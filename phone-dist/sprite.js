// Kei's sprite: a paper doll built from the art in assets/kei/.
//
// base.webp is the neutral drawing. Every other face is made by pasting the
// eye region and/or mouth region from another drawing on top of it, so any
// eyes can be mixed with any mouth. Full-body states (infected) replace the
// whole image. All drawings share the same 2000x2000 framing.
//
// The SVG overlay adds what isn't drawn yet: blush, sweat, anger mark, gifts.

const Sprite = (() => {
  const SRC = 2000; // source canvas size
  const N = 1000; // working resolution
  const k = N / SRC;

  // where each swappable part lives on the 2000px canvas: [x0, y0, x1, y1]
  const REGIONS = {
    eyes: [600, 430, 1300, 690],
    mouth: [810, 815, 1140, 935],
  };

  // expression per emotional state. eyes: open | closed | down | side | teary
  // mouth: neutral | smile | grin. "open"/"neutral" come from base. The open
  // talking mouth (mouth-open) is flapped in while he speaks; alert flaps it
  // nonstop like yelling.
  const EXPR = {
    idle: { eyes: "open", mouth: "neutral" },
    happy: { eyes: "open", mouth: "grin" },
    flustered: { eyes: "down", mouth: "smile" },
    alert: { eyes: "open", mouth: "neutral", yell: true },
    mad: { eyes: "side", mouth: "neutral" },
    sad: { eyes: "teary", mouth: "neutral" },
    sleepy: { eyes: "closed", mouth: "neutral" },
    grumpy: { eyes: "side", mouth: "neutral" },
    uncomfortable: { eyes: "side", mouth: "neutral" },
  };
  const FULL = ["infected"]; // states drawn as a whole image
  // mouths that ease through each other instead of snapping (neutral -> smile -> grin)
  const MOUTH_LADDER = ["neutral", "smile", "grin"];

  // Ears are lifted out of the drawing and *bent* to move: the ear is redrawn
  // in thin vertical slices, each rotated about the pivot by an angle that
  // grows from 0 at the hinge to full at the outer edge (fade = [full, zero]
  // x positions). Neighbouring slices barely differ, so there's no seam.
  // poly = generous outline of the ear (the paper around it is transparent).
  const EARS = {
    l: { poly: [[620, 150], [120, 560], [120, 850], [470, 850], [560, 820], [615, 800], [600, 600], [595, 240]], fade: [460, 590], pivot: [600, 500] },
    r: { poly: [[1290, 150], [1420, 180], [1800, 520], [1800, 640], [1650, 645], [1480, 665], [1360, 668], [1300, 640], [1290, 400]], fade: [1480, 1340], pivot: [1320, 450] },
  };

  const imgs = {}; // part name -> HTMLImageElement
  const cache = {}; // composite key -> data URL
  let baseCanvas = null; // base drawing with the ears lifted out
  let baseAlpha = null;
  let headUrl = "";
  let baseEars = null; // {l, r} ear canvases
  const fullStates = {}; // name -> {url, alpha, ears}
  let state = "idle";
  let face = null; // {eyes, mouth, yell} chosen by the app; falls back to EXPR
  let blinking = false;
  let talking = false; // mouth currently open mid-word
  let shownMouth = "neutral";
  let mouthTimer = null;
  let yellTimer = null;
  let currentAlpha = null;

  const loadImg = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });

  // Remove the white paper background. Sketch lines have small gaps, so a
  // plain flood fill would leak into the hair and face. Instead: thicken the
  // ink by SEAL px to close the gaps, flood the paper from the edges, then
  // let the cleared area creep back SEAL px over paper to undo the thickening.
  const SEAL = 7;
  function cutout(img) {
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const o = c.getContext("2d", { willReadFrequently: true });
    o.drawImage(img, 0, 0, N, N);
    const data = o.getImageData(0, 0, N, N);
    const px = data.data;
    const NN = N * N;
    const paper = new Uint8Array(NN);
    for (let p = 0; p < NN; p++) {
      const i = p * 4;
      paper[p] = px[i + 3] < 20 || (px[i] > 238 && px[i + 1] > 238 && px[i + 2] > 238) ? 1 : 0;
    }
    // ink dilated by SEAL (separable square max filter)
    const rowD = new Uint8Array(NN);
    for (let y = 0; y < N; y++) {
      let last = -1e9;
      for (let x = 0; x < N; x++) { if (!paper[y * N + x]) last = x; if (x - last <= SEAL) rowD[y * N + x] = 1; }
      last = 1e9;
      for (let x = N - 1; x >= 0; x--) { if (!paper[y * N + x]) last = x; if (last - x <= SEAL) rowD[y * N + x] = 1; }
    }
    const ink = new Uint8Array(NN);
    for (let x = 0; x < N; x++) {
      let last = -1e9;
      for (let y = 0; y < N; y++) { if (rowD[y * N + x]) last = y; if (y - last <= SEAL) ink[y * N + x] = 1; }
      last = 1e9;
      for (let y = N - 1; y >= 0; y--) { if (rowD[y * N + x]) last = y; if (last - y <= SEAL) ink[y * N + x] = 1; }
    }
    // flood the background from the edges through non-ink pixels
    const clear = new Uint8Array(NN);
    let queue = [];
    for (let i = 0; i < N; i++) for (const p of [i, (N - 1) * N + i, i * N, i * N + N - 1]) if (!ink[p] && !clear[p]) { clear[p] = 1; queue.push(p); }
    const spread = (allowed) => {
      const next = [];
      for (const p of queue) {
        const x = p % N;
        for (const q of [x > 0 ? p - 1 : -1, x < N - 1 ? p + 1 : -1, p - N, p + N]) {
          if (q < 0 || q >= NN || clear[q] || !allowed(q)) continue;
          clear[q] = 1;
          next.push(q);
        }
      }
      queue = next;
    };
    while (queue.length) spread((q) => !ink[q]);
    // creep back over the paper hidden under the thickened ink
    queue = [];
    for (let p = 0; p < NN; p++) if (clear[p]) queue.push(p);
    for (let i = 0; i < SEAL + 1 && queue.length; i++) spread((q) => paper[q]);
    const alpha = new Uint8Array(NN);
    for (let p = 0; p < NN; p++) {
      if (clear[p]) px[p * 4 + 3] = 0;
      alpha[p] = px[p * 4 + 3];
    }
    // soften the cut edge: light pixels touching the background fade a little
    for (let p = N; p < NN - N; p++) {
      const i = p * 4;
      if (alpha[p] && px[i] > 225 && (clear[p - 1] || clear[p + 1] || clear[p - N] || clear[p + N])) px[i + 3] = 120;
    }
    o.putImageData(data, 0, 0);
    return { canvas: c, alpha };
  }

  // Split a full drawing into a body with the ears cut out and the two ear
  // layers (as canvases), so the ears can be bent separately.
  function splitEars(src) {
    const body = document.createElement("canvas");
    body.width = body.height = N;
    const b = body.getContext("2d");
    b.drawImage(src, 0, 0);
    const ears = {};
    for (const [side, def] of Object.entries(EARS)) {
      const path = new Path2D();
      def.poly.forEach(([x, y], i) => (i ? path.lineTo(x * k, y * k) : path.moveTo(x * k, y * k)));
      path.closePath();
      // the ear layer is a few px bigger than the hole it fills, so the two
      // anti-aliased cut edges overlap instead of leaving a hairline gap
      const ear = document.createElement("canvas");
      ear.width = ear.height = N;
      const e = ear.getContext("2d");
      const mask = document.createElement("canvas");
      mask.width = mask.height = N;
      const m = mask.getContext("2d");
      m.fillStyle = m.strokeStyle = "#000";
      m.lineWidth = 8 * k;
      m.lineJoin = "round";
      m.fill(path);
      m.stroke(path);
      e.drawImage(src, 0, 0);
      e.globalCompositeOperation = "destination-in";
      e.drawImage(mask, 0, 0);
      ears[side] = ear;
      b.save();
      b.globalCompositeOperation = "destination-out";
      b.fill(path);
      b.restore();
    }
    return { body, ears };
  }

  // --- ear motion: a little spring per ear, drawn into a canvas per figure
  const EAR_RES = 600; // ear layer resolution (shown at ~220px)
  const POSES = { neutral: 0, perked: 7, flattened: -5, up: 12, back: -8, flopped: -12 };
  const ear = { l: { a: 0, v: 0, target: 0 }, r: { a: 0, v: 0, target: 0 } };
  let earSrc = null; // {l, r} canvases currently in use
  let earAnim = null;
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  function drawEars() {
    if (!earSrc) return;
    const scale = EAR_RES / SRC;
    const out = document.createElement("canvas");
    out.width = out.height = EAR_RES;
    const g = out.getContext("2d");
    g.scale(scale, scale); // draw in 2000-space
    for (const side of ["l", "r"]) {
      const def = EARS[side];
      const [full, zero] = def.fade;
      const xs = def.poly.map((p) => p[0]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs);
      const [px, py] = def.pivot;
      const angle = (side === "l" ? ear.l.a : -ear.r.a) * (Math.PI / 180);
      // draw from the hinge outward; each slice also covers the slice before
      // it, so its anti-aliased inner edge lands on solid ear (no stripes)
      const STEP = 6;
      const outward = full < zero ? -1 : 1; // left ear grows toward smaller x
      const slice = (lead) => {
        const w = smooth((lead + (outward * STEP) / 2 - zero) / (full - zero));
        g.save();
        g.translate(px, py);
        g.rotate(angle * w);
        g.translate(-px, -py);
        g.beginPath();
        g.rect(Math.min(lead - outward * STEP, lead + outward * STEP), 0, STEP * 2, SRC);
        g.clip();
        g.drawImage(earSrc[side], 0, 0, SRC, SRC);
        g.restore();
      };
      if (outward < 0) for (let x = x1; x > x0 - STEP; x -= STEP) slice(x);
      else for (let x = x0; x < x1 + STEP; x += STEP) slice(x);
    }
    for (const c of document.querySelectorAll(".fig canvas.ears")) {
      const cg = c.getContext("2d");
      cg.clearRect(0, 0, EAR_RES, EAR_RES);
      cg.drawImage(out, 0, 0);
    }
  }

  function animateEars() {
    if (earAnim) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let moving = false;
      for (const e of [ear.l, ear.r]) {
        e.v += (180 * (e.target - e.a) - 16 * e.v) * dt; // spring toward the pose
        e.a += e.v * dt;
        if (Math.abs(e.target - e.a) > 0.05 || Math.abs(e.v) > 0.5) moving = true;
      }
      drawEars();
      earAnim = moving ? requestAnimationFrame(step) : null;
    };
    earAnim = requestAnimationFrame(step);
  }

  // earScale: how far his ears are willing to move (stiff while he's cold).
  // A flash briefly overrides the pose (pinned back when touched, perk on hello).
  let earScale = 1, poseName = "neutral", flash = null, flashTimer = null;
  function applyPose() {
    const t = (POSES[flash || poseName] ?? 0) * earScale;
    if (ear.l.target === t && ear.r.target === t) return;
    ear.l.target = ear.r.target = t;
    animateEars();
  }
  function earPose(name) {
    poseName = name;
    applyPose();
  }
  function earFlash(name, ms = 1500) {
    flash = name;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flash = null; applyPose(); }, ms);
    applyPose();
  }
  function setEarScale(v) {
    earScale = v;
    applyPose();
  }

  // A quick flick upward that springs back. side: "l" | "r" | "both"
  function twitch(side = "both", strength = 1) {
    for (const s of side === "both" ? ["l", "r"] : [side]) ear[s].v += (110 + Math.random() * 60) * strength * Math.max(0.5, earScale);
    animateEars();
  }

  async function init() {
    const parts = await window.keiHost.sprites();
    await Promise.all(Object.entries(parts).map(async ([name, src]) => (imgs[name] = await loadImg(src))));
    const base = cutout(imgs.base);
    headUrl = base.canvas.toDataURL("image/png"); // whole drawing, ears and all (small icons)
    const split = splitEars(base.canvas);
    baseCanvas = split.body;
    baseEars = split.ears;
    baseAlpha = base.alpha;
    for (const name of FULL) {
      if (!imgs[name]) continue;
      const r = cutout(imgs[name]);
      const sp = splitEars(r.canvas);
      fullStates[name] = { url: sp.body.toDataURL("image/png"), alpha: r.alpha, ears: sp.ears };
    }
    // sample skin tone from the cheek (used by CSS)
    const s = baseCanvas.getContext("2d").getImageData(Math.round(0.47 * N), Math.round(0.39 * N), 1, 1).data;
    document.documentElement.style.setProperty("--skin", `rgb(${s[0]},${s[1]},${s[2]})`);
    build(document.getElementById("body"));
    build(document.getElementById("head"));
    // warm the cache so the first emotion change doesn't stutter
    for (const e of Object.values(EXPR)) compose(e.eyes, e.mouth);
    compose("closed", "neutral");
    render();
  }

  function compose(eyes, mouth) {
    const key = `${eyes}|${mouth}`;
    if (cache[key]) return cache[key];
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d");
    g.drawImage(baseCanvas, 0, 0);
    const paste = (part, name) => {
      const img = imgs[`${part}-${name}`];
      if (!img) return;
      const [x0, y0, x1, y1] = REGIONS[part];
      // only paint where the base is solid, so no paper square shows around him
      g.globalCompositeOperation = "source-atop";
      g.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
      g.globalCompositeOperation = "source-over";
    };
    if (eyes !== "open") paste("eyes", eyes);
    if (mouth !== "neutral") paste("mouth", mouth);
    return (cache[key] = c.toDataURL("image/png"));
  }

  const overlaySVG = `
<svg class="fx" viewBox="0 0 2000 2000" aria-hidden="true">
  <g class="acc acc-scarf">
    <path d="M700 1040 Q960 1150 1230 1030 L1260 1120 Q960 1250 680 1130 Z" fill="var(--gift-a)" stroke="#111" stroke-width="8"/>
    <path d="M1080 1140 L1150 1420 L1060 1440 L1010 1160 Z" fill="var(--gift-a)" stroke="#111" stroke-width="8"/>
    <path d="M720 1085 Q960 1185 1230 1075" stroke="var(--gift-b)" stroke-width="14" fill="none"/>
  </g>
  <g class="acc acc-headset">
    <path d="M520 640 Q560 40 980 60 Q1420 60 1440 600" stroke="#1a1a1a" stroke-width="34" fill="none"/>
    <path d="M520 640 Q560 40 980 60 Q1420 60 1440 600" stroke="var(--gift-a)" stroke-width="10" fill="none"/>
    <rect x="470" y="580" width="110" height="170" rx="40" fill="#1a1a1a" stroke="var(--gift-a)" stroke-width="10"/>
    <rect x="1390" y="540" width="110" height="170" rx="40" fill="#1a1a1a" stroke="var(--gift-a)" stroke-width="10"/>
    <path d="M520 740 Q560 900 760 900" stroke="#1a1a1a" stroke-width="16" fill="none"/>
    <circle cx="770" cy="900" r="22" fill="var(--gift-a)"/>
  </g>
  <g class="acc acc-clip">
    <rect x="520" y="380" width="150" height="46" rx="10" transform="rotate(-28 595 403)" fill="var(--gift-a)" stroke="#111" stroke-width="8"/>
    <rect x="545" y="440" width="120" height="36" rx="10" transform="rotate(-28 605 458)" fill="var(--gift-b)" stroke="#111" stroke-width="8"/>
  </g>
  <g class="acc acc-ribbon">
    <path d="M1250 170 L1120 90 L1130 260 Z M1250 170 L1380 90 L1370 260 Z" fill="var(--gift-a)" stroke="#111" stroke-width="10"/>
    <circle cx="1250" cy="172" r="34" fill="var(--gift-b)" stroke="#111" stroke-width="10"/>
  </g>
  <g class="acc acc-pin">
    <polygon points="1300,1300 1360,1335 1360,1405 1300,1440 1240,1405 1240,1335" fill="var(--gift-a)" stroke="#111" stroke-width="10"/>
    <polygon points="1300,1335 1330,1352 1330,1388 1300,1405 1270,1388 1270,1352" fill="none" stroke="#111" stroke-width="6"/>
  </g>

  <g class="blush">
    <ellipse cx="745" cy="665" rx="110" ry="40"/>
    <ellipse cx="1165" cy="660" rx="110" ry="40"/>
    <path class="hatch" d="M690 680 l28 -38 M738 684 l28 -38 M786 684 l28 -38 M1110 676 l28 -38 M1158 680 l28 -38 M1206 680 l28 -38"/>
  </g>
  <g class="sweat">
    <path d="M1330 420 Q1360 480 1340 520 Q1300 540 1290 500 Q1295 460 1330 420 Z"/>
  </g>
  <g class="anger">
    <path d="M1300 300 l40 40 m40 -40 l-40 40 m-60 -10 l50 0 m30 0 l50 0" stroke-width="18"/>
  </g>
</svg>`;

  function build(host) {
    host.innerHTML = `<div class="fig"><img class="spr" draggable="false" alt="" />` +
      `<canvas class="ears" width="${EAR_RES}" height="${EAR_RES}"></canvas>` +
      `${overlaySVG}<div class="zzz"><i>z</i><i>z</i><i>Z</i></div></div>`;
  }

  function show(url, ears) {
    for (const img of document.querySelectorAll(".fig .spr")) if (img.src !== url) img.src = url;
    if (earSrc !== ears) { earSrc = ears; drawEars(); }
  }

  const cur = () => face || EXPR[state];

  function render() {
    if (!baseCanvas) return;
    if (fullStates[state]) {
      currentAlpha = fullStates[state].alpha;
      return show(fullStates[state].url, fullStates[state].ears);
    }
    const e = cur() || EXPR.idle;
    currentAlpha = baseAlpha;
    const mouth = talking && imgs["mouth-open"] ? "open" : shownMouth;
    show(compose(blinking && e.eyes !== "closed" ? "closed" : e.eyes, mouth), baseEars);
  }

  // Step the resting mouth toward the target one rung at a time
  // (neutral -> smile -> grin), so smiles grow and fade instead of popping.
  function easeMouth(target) {
    clearTimeout(mouthTimer);
    const from = MOUTH_LADDER.indexOf(shownMouth), to = MOUTH_LADDER.indexOf(target);
    if (from < 0 || to < 0 || Math.abs(to - from) <= 1) {
      shownMouth = target;
      return render();
    }
    shownMouth = MOUTH_LADDER[from + Math.sign(to - from)];
    render();
    mouthTimer = setTimeout(() => easeMouth(target), 130);
  }

  // face: optional {eyes, mouth, yell} to use instead of the default for this
  // state (the app picks plainer faces while he's still cold)
  function setState(emotion, faceOverride = null) {
    state = emotion;
    face = faceOverride;
    const e = cur();
    clearInterval(yellTimer);
    if (e?.yell) yellTimer = setInterval(() => { talking = !talking; render(); }, 150);
    else talking = false;
    if (e) easeMouth(e.mouth);
    else render();
  }

  // Open/close his mouth while text is being typed (1 8 1 8...).
  function mouth(open) {
    if (cur()?.yell || fullStates[state] || talking === open) return;
    talking = open;
    render();
  }

  // Close his eyes for a moment (only on faces with open eyes).
  function blink(ms = 140) {
    const e = cur();
    if (!e || e.eyes === "closed" || fullStates[state]) return;
    blinking = true;
    render();
    setTimeout(() => { blinking = false; render(); }, ms);
  }

  // Is this client point over an opaque pixel? Returns null or {x, y} in 0..1.
  function hit(figEl, clientX, clientY) {
    const img = figEl.querySelector(".spr");
    if (!img || !currentAlpha) return null;
    const r = img.getBoundingClientRect();
    const u = (clientX - r.left) / r.width;
    const v = (clientY - r.top) / r.height;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return null;
    return currentAlpha[Math.floor(v * N) * N + Math.floor(u * N)] > 40 ? { x: u, y: v } : null;
  }

  return { init, setState, blink, mouth, hit, earPose, earFlash, setEarScale, twitch, EARS, url: () => headUrl, EXPR };
})();
