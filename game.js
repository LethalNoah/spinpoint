"use strict";

// ---------- Config ----------
const TOTAL_ROUNDS = 10;
// Trivia is the main event: a correct answer banks the full base points.
// The map phase adds a geo bonus on top — substantial, but never required.
const TIER_POINTS = { 1: 100, 2: 150, 3: 200 };  // banked by a correct answer, by difficulty
const geoMax = tier => TIER_POINTS[tier] / 2;    // max geo bonus (+50% of base)
const FULL_BONUS_KM = 300;    // within this distance the geo bonus is maxed
const ZERO_BONUS_KM = 6000;   // at/after this distance the geo bonus is zero
const MAP_SECONDS = 20;       // countdown for the map phase
const STREAK_STEP = 0.1;      // each consecutive correct answer past the first adds +10%
const STREAK_CAP = 1.5;

// Difficulty ramp: rounds 1-3 easy, 4-7 medium, 8-10 hard
function difficultyForRound(r) { return r <= 3 ? 1 : r <= 7 ? 2 : 3; }
const DIFF_LABEL = { 1: "★ EASY", 2: "★★ MEDIUM", 3: "★★★ HARD" };
const DIFF_SECONDS = { 1: 20, 2: 15, 3: 12 }; // question timer shrinks as stakes rise

// Map projection bounds (crop empty polar ocean for a bigger playable area)
const LAT_TOP = 85, LAT_BOTTOM = -60;
const PROJ_W = 1000;
const PROJ_H = PROJ_W * (LAT_TOP - LAT_BOTTOM) / 360;

// ---------- State ----------
const state = {
  round: 0,
  score: 0,
  streak: 0,
  mode: "free",         // "free" | "daily" (challenge links are seeded free runs)
  gameId: "",
  seed: 0,
  rng: Math.random,     // seeded PRNG for the run; same seed -> same genres & questions
  genre: null,
  genreBag: [],         // shuffled genres; refilled when empty -> no clumpy repeats
  question: null,
  answeredCorrect: false,
  guess: null,          // {lat, lon}
  locked: false,
  history: [],
  decks: {},            // per genre+difficulty shuffled question queues
};

// FNV-1a hash -> 32-bit seed, so a date string yields everyone the same daily run
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function utcDay() { return new Date().toISOString().slice(0, 10); }

// Deterministic PRNG so a challenge link replays the exact same run
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Incoming challenge from a share link: ?c=<seed36>&n=<name>&s=<score>
let activeChallenge = (() => {
  const p = new URLSearchParams(location.search);
  if (!p.get("c")) return null;
  const seed = parseInt(p.get("c"), 36);
  if (!Number.isFinite(seed)) return null;
  return {
    seed,
    name: (p.get("n") || "A rival").slice(0, 16),
    score: Math.max(0, parseInt(p.get("s"), 10) || 0),
  };
})();

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const screens = ["screen-start", "screen-wheel", "screen-question", "screen-map", "screen-end", "screen-boards", "screen-profile"];
function show(id) {
  screens.forEach(s => $(s).classList.toggle("hidden", s !== id));
  const noHud = ["screen-start", "screen-boards", "screen-profile"].includes(id);
  $("hud").classList.toggle("hidden", noHud);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
// 1.0 for a pin within FULL_BONUS_KM, fading linearly to 0 at ZERO_BONUS_KM
function proximity(km) {
  if (km <= FULL_BONUS_KM) return 1;
  if (km >= ZERO_BONUS_KM) return 0;
  return 1 - (km - FULL_BONUS_KM) / (ZERO_BONUS_KM - FULL_BONUS_KM);
}
function streakMult() {
  return state.streak >= 2 ? Math.min(STREAK_CAP, 1 + STREAK_STEP * (state.streak - 1)) : 1;
}

// HUD score counts up instead of snapping — small dopamine, big difference
let displayedScore = 0;
function updateRound() {
  $("hud-round").textContent = `${Math.min(state.round, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}`;
}
function animateScore() {
  const from = displayedScore, to = state.score;
  if (from === to) return;
  const el = $("hud-score");
  el.classList.remove("bump");
  void el.offsetWidth; // restart animation
  el.classList.add("bump");
  const t0 = performance.now(), dur = 650;
  (function step(now) {
    const t = Math.min(1, (now - t0) / dur);
    displayedScore = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    el.textContent = displayedScore;
    if (t < 1) requestAnimationFrame(step);
  })(t0);
}
function updateStreakHud() {
  const badge = $("hud-streak");
  if (state.streak >= 2) {
    badge.classList.remove("hidden");
    $("hud-streak-n").textContent = `×${state.streak}`;
    badge.style.animation = "none";
    void badge.offsetWidth;
    badge.style.animation = "";
  } else {
    badge.classList.add("hidden");
  }
}

// Big in-your-face burst on the question card when a streak builds
function streakBurst(n) {
  const card = document.querySelector(".q-card");
  const el = document.createElement("div");
  el.className = "streak-burst";
  el.textContent = `🔥 ${n} IN A ROW! ×${streakMult().toFixed(1)} BONUS`;
  card.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// ---------- Tiny synth sounds ----------
let audioCtx = null;
// Browsers start audio suspended until a user gesture — unlock on any interaction
function ensureAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) { /* no audio */ }
}
document.addEventListener("pointerdown", ensureAudio, true);
document.addEventListener("keydown", ensureAudio, true);

function beep(freq, dur = 0.1, type = "sine", gain = 0.15, when = 0) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + when;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t); o.stop(t + dur);
  } catch (e) { /* audio unsupported — silent game is fine */ }
}
const sfx = {
  tick: () => beep(900, 0.03, "square", 0.05),
  // clock ticks: soft each second, sharp double-tick when time is nearly out
  tock: () => beep(740, 0.045, "square", 0.07),
  tockUrgent: () => { beep(1250, 0.07, "square", 0.16); beep(620, 0.05, "square", 0.1, 0.03); },
  correct: () => { beep(523, 0.12); beep(659, 0.12, "sine", 0.15, 0.1); beep(784, 0.2, "sine", 0.15, 0.2); },
  wrong: () => beep(140, 0.4, "sawtooth", 0.12),
  pin: () => beep(660, 0.08, "triangle", 0.12),
  reveal: () => { beep(440, 0.1, "triangle"); beep(880, 0.25, "triangle", 0.12, 0.1); },
  bullseye: () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.22, "triangle", 0.16, i * 0.07)),
  streak: n => { for (let i = 0; i < Math.min(n, 6); i++) beep(600 + i * 120, 0.07, "square", 0.09, i * 0.06); },
};

// ---------- Wheel ----------
const wheelCanvas = $("wheel");
const wctx = wheelCanvas.getContext("2d");
let wheelAngle = 0;         // current rotation (radians)
let spinning = false;
const SEG = 2 * Math.PI / GENRES.length;

function drawWheel() {
  const W = wheelCanvas.width, R = W / 2;
  wctx.clearRect(0, 0, W, W);
  wctx.save();
  wctx.translate(R, R);
  wctx.rotate(wheelAngle);
  GENRES.forEach((g, i) => {
    const a0 = i * SEG, a1 = a0 + SEG;
    wctx.beginPath();
    wctx.moveTo(0, 0);
    wctx.arc(0, 0, R - 8, a0, a1);
    wctx.closePath();
    wctx.fillStyle = g.color;
    wctx.fill();
    wctx.strokeStyle = "rgba(255,255,255,.85)";
    wctx.lineWidth = 4;
    wctx.stroke();
    // label
    wctx.save();
    wctx.rotate(a0 + SEG / 2);
    wctx.textAlign = "right";
    wctx.fillStyle = "#fff";
    wctx.font = "700 30px 'Segoe UI', sans-serif";
    wctx.shadowColor = "rgba(0,0,0,.45)";
    wctx.shadowBlur = 6;
    wctx.fillText(g.icon + "  " + g.name, R - 34, 11);
    wctx.restore();
  });
  // rim
  wctx.beginPath();
  wctx.arc(0, 0, R - 6, 0, 2 * Math.PI);
  wctx.strokeStyle = "#fff";
  wctx.lineWidth = 8;
  wctx.stroke();
  wctx.restore();
}

// Draw a genre from the shuffled bag: every genre appears once before any repeats
function drawGenreFromBag() {
  if (state.genreBag.length === 0) state.genreBag = shuffle(GENRES.map((_, i) => i));
  return state.genreBag.pop();
}

function spinWheel() {
  if (spinning) return;
  spinning = true;
  $("btn-spin").disabled = true;
  $("wheel-heading").textContent = "Spinning…";

  const targetIdx = drawGenreFromBag();
  // Pointer is at the top (-90°). Land the middle of the target segment under it.
  const current = wheelAngle % (2 * Math.PI);
  const desired = -Math.PI / 2 - (targetIdx * SEG + SEG / 2);
  let delta = desired - current;
  delta -= Math.ceil(delta / (2 * Math.PI)) * 2 * Math.PI; // normalize to (-2pi, 0]
  const total = delta + 2 * Math.PI * (4 + Math.floor(Math.random() * 3)); // extra revolutions
  const start = wheelAngle, dur = 3600, t0 = performance.now();
  let lastSeg = -1;

  (function frame(now) {
    const t = Math.min(1, (now - t0) / dur);
    const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
    wheelAngle = start + total * ease;
    drawWheel();
    const seg = Math.floor(wheelAngle / SEG);
    if (seg !== lastSeg) { sfx.tick(); lastSeg = seg; }
    if (t < 1) { requestAnimationFrame(frame); return; }
    spinning = false;
    const g = GENRES[targetIdx];
    state.genre = g;
    $("wheel-heading").innerHTML =
      `You got <span style="color:${g.color}">${g.icon} ${g.name}</span>!`;
    setTimeout(() => askQuestion(g), 1100);
  })(t0);
}

// ---------- Question ----------
let timerRaf = null, timerDeadline = 0, answered = false;

function nextQuestion(genreName, tier) {
  const key = `${genreName}|${tier}`;
  if (!state.decks[key] || state.decks[key].length === 0) {
    state.decks[key] = shuffle(QUESTIONS[genreName].filter(q => q.d === tier));
  }
  return state.decks[key].pop();
}

function askQuestion(genre) {
  const tier = difficultyForRound(state.round);
  const q = nextQuestion(genre.name, tier);
  state.question = q;
  answered = false;

  const chip = $("q-genre");
  chip.textContent = `${genre.icon} ${genre.name}`;
  chip.style.background = genre.color;
  $("q-diff").textContent = DIFF_LABEL[tier];
  $("q-text").textContent = q.q;

  const box = $("q-choices");
  box.innerHTML = "";
  q.c.forEach((choice, i) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = choice;
    b.addEventListener("click", () => answerQuestion(i));
    box.appendChild(b);
  });

  show("screen-question");
  const seconds = DIFF_SECONDS[tier];
  timerDeadline = performance.now() + seconds * 1000;
  let lastTickSec = -1;
  (function tickTimer(now) {
    const left = Math.max(0, timerDeadline - now);
    $("timer-bar").style.width = (left / (seconds * 1000) * 100) + "%";
    $("timer-bar").style.background = left < 5000 ? "var(--bad)" : "var(--accent)";
    const sec = Math.ceil(left / 1000);
    if (sec !== lastTickSec) {
      lastTickSec = sec;
      left < 5000 ? sfx.tockUrgent() : sfx.tock();
    }
    if (answered) return;
    if (left <= 0) { answerQuestion(-1); return; }
    timerRaf = requestAnimationFrame(tickTimer);
  })(performance.now());
}

function answerQuestion(idx) {
  if (answered) return;
  answered = true;
  cancelAnimationFrame(timerRaf);
  const q = state.question;
  state.answeredCorrect = idx === q.a;

  const buttons = [...$("q-choices").children];
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === q.a) b.classList.add("correct");
    else if (i === idx) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  if (state.answeredCorrect) {
    state.streak++;
    sfx.correct();
    if (state.streak >= 2) { sfx.streak(state.streak); streakBurst(state.streak); }
  } else {
    state.streak = 0;
    sfx.wrong();
    const card = document.querySelector(".q-card");
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
  }
  updateStreakHud();
  setTimeout(startMapPhase, 1400);
}

// ---------- Map ----------
const mapCanvas = $("map");
const mctx = mapCanvas.getContext("2d");
const fxCanvas = $("fx");
const fctx = fxCanvas.getContext("2d");
let landPath = null;         // Path2D fallback in projection coords
let view = { zoom: 1, ox: 0, oy: 0 };   // screen = proj * scale() + o
let baseScale = 1, cw = 0, ch = 0, dpr = 1;
let dragging = false, dragMoved = false, dragStart = null;
let revealed = false;

// Satellite basemap: NASA Blue Marble (topography + bathymetry, naturally label-free).
// Pre-cropped to the projection's lat range and mipmapped so per-frame drawing
// only touches roughly screen-sized pixel counts.
const satImg = new Image();
let satReady = false;
let satMips = []; // sorted small -> large, each a canvas spanning exactly PROJ bounds
satImg.onload = () => {
  const srcY = (90 - LAT_TOP) / 180 * satImg.naturalHeight;
  const srcH = (LAT_TOP - LAT_BOTTOM) / 180 * satImg.naturalHeight;
  satMips = [1350, 2700, 5400].map(w => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = Math.round(w * srcH / satImg.naturalWidth);
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(satImg, 0, srcY, satImg.naturalWidth, srcH, 0, 0, c.width, c.height);
    return c;
  });
  satReady = true;
  if (!$("screen-map").classList.contains("hidden")) drawMap();
};
satImg.src = "world-topo.jpg";

function projX(lon) { return (lon + 180) / 360 * PROJ_W; }
function projY(lat) { return (LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM) * PROJ_H; }
function scale() { return baseScale * view.zoom; }
function toScreen(lat, lon) { return [projX(lon) * scale() + view.ox, projY(lat) * scale() + view.oy]; }
function toWorld(sx, sy) {
  const px = (sx - view.ox) / scale(), py = (sy - view.oy) / scale();
  return { lon: px / PROJ_W * 360 - 180, lat: LAT_TOP - py / PROJ_H * (LAT_TOP - LAT_BOTTOM) };
}

function buildLandPath() {
  landPath = new Path2D();
  for (const f of LAND_GEOJSON.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        ring.forEach(([lon, lat], i) => {
          const x = projX(lon), y = projY(lat);
          i === 0 ? landPath.moveTo(x, y) : landPath.lineTo(x, y);
        });
        landPath.closePath();
      }
    }
  }
}

function sizeMap() {
  const wrap = mapCanvas.parentElement;
  dpr = window.devicePixelRatio || 1;
  cw = wrap.clientWidth; ch = wrap.clientHeight;
  mapCanvas.width = cw * dpr;
  mapCanvas.height = ch * dpr;
  fxCanvas.width = cw * dpr;
  fxCanvas.height = ch * dpr;
  baseScale = Math.min(cw / PROJ_W, ch / PROJ_H);
}

function resetView() {
  view.zoom = 1;
  view.ox = (cw - PROJ_W * baseScale) / 2;
  view.oy = (ch - PROJ_H * baseScale) / 2;
}

function clampView() {
  const w = PROJ_W * scale(), h = PROJ_H * scale();
  view.ox = w <= cw ? (cw - w) / 2 : Math.min(0, Math.max(cw - w, view.ox));
  view.oy = h <= ch ? (ch - h) / 2 : Math.min(0, Math.max(ch - h, view.oy));
}

// Current UI scale factor (rem-based), so canvas-drawn things match the CSS scale
function uiK() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
}

function drawPin(x, y, color) {
  const k = uiK();
  mctx.beginPath();
  mctx.moveTo(x, y);
  mctx.lineTo(x - 9 * k, y - 20 * k);
  mctx.arc(x, y - 22 * k, 9.5 * k, Math.PI * 0.8, Math.PI * 0.2);
  mctx.closePath();
  mctx.fillStyle = color;
  mctx.fill();
  mctx.strokeStyle = "rgba(0,0,0,.4)";
  mctx.lineWidth = 1.5 * k;
  mctx.stroke();
  mctx.beginPath();
  mctx.arc(x, y - 22 * k, 3.6 * k, 0, 2 * Math.PI);
  mctx.fillStyle = "#fff";
  mctx.fill();
}

function easeOutBounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

function drawMap() {
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.fillStyle = "#04070d";
  mctx.fillRect(0, 0, cw, ch);

  mctx.save();
  mctx.transform(scale(), 0, 0, scale(), view.ox, view.oy);
  if (satReady) {
    // Pick the smallest mip that still covers the on-screen resolution,
    // and only draw the visible slice of the world.
    const needPx = scale() * dpr * PROJ_W;
    const mip = satMips.find(m => m.width >= needPx) || satMips[satMips.length - 1];
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const x0 = clamp((0 - view.ox) / scale(), 0, PROJ_W);
    const x1 = clamp((cw - view.ox) / scale(), 0, PROJ_W);
    const y0 = clamp((0 - view.oy) / scale(), 0, PROJ_H);
    const y1 = clamp((ch - view.oy) / scale(), 0, PROJ_H);
    mctx.drawImage(mip,
      x0 / PROJ_W * mip.width, y0 / PROJ_H * mip.height,
      (x1 - x0) / PROJ_W * mip.width, (y1 - y0) / PROJ_H * mip.height,
      x0, y0, x1 - x0, y1 - y0);
  } else {
    // Vector fallback while the image loads (or offline)
    mctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--ocean");
    mctx.fillRect(0, 0, PROJ_W, PROJ_H);
    mctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--land");
    mctx.fill(landPath);
  }
  mctx.restore();

  // guess pin
  if (state.guess) {
    let [gx, gy] = toScreen(state.guess.lat, state.guess.lon);
    // drop-in bounce right after placement
    if (!revealed) {
      const dt = performance.now() - pinDropT0;
      if (dt < 500) gy -= (1 - easeOutBounce(Math.min(1, dt / 500))) * 60 * uiK();
    }
    if (revealed) {
      const q = state.question;
      const [ax, ay] = toScreen(q.lat, q.lon);
      mctx.setLineDash([7, 6]);
      mctx.beginPath();
      mctx.moveTo(gx, gy);
      mctx.lineTo(ax, ay);
      mctx.strokeStyle = "rgba(255,210,61,.9)";
      mctx.lineWidth = 2;
      mctx.stroke();
      mctx.setLineDash([]);
      drawPin(ax, ay, "#43b649");
      const k = uiK();
      mctx.font = `700 ${Math.round(14 * k)}px 'Segoe UI', sans-serif`;
      mctx.textAlign = "center";
      mctx.fillStyle = "#fff";
      mctx.shadowColor = "rgba(0,0,0,.8)";
      mctx.shadowBlur = 5;
      mctx.fillText(q.city, ax, ay - 40 * k);
      mctx.shadowBlur = 0;
    }
    drawPin(gx, gy, "#e5533d");
  }
}

// ---------- Pin placement FX: drop bounce + sonar ripples until confirmed ----------
let pinDropT0 = 0, rippleRaf = null;

function startPinFx() {
  pinDropT0 = performance.now();
  cancelAnimationFrame(rippleRaf);
  (function loop(now) {
    if (!state.guess || state.locked || revealed) {
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.clearRect(0, 0, cw, ch);
      return;
    }
    // redraw the map during the drop bounce so the pin animates
    if (now - pinDropT0 < 550) drawMap();
    const [gx, gy] = toScreen(state.guess.lat, state.guess.lon);
    const k = uiK();
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.clearRect(0, 0, cw, ch);
    for (let i = 0; i < 2; i++) {
      const t = ((now - pinDropT0 + i * 600) % 1200) / 1200;
      fctx.beginPath();
      fctx.arc(gx, gy, (8 + t * 42) * k, 0, 2 * Math.PI);
      fctx.strokeStyle = `rgba(229,83,61,${(1 - t) * 0.65})`;
      fctx.lineWidth = (2.5 * (1 - t) + 0.5) * k;
      fctx.stroke();
    }
    rippleRaf = requestAnimationFrame(loop);
  })(performance.now());
}

// ---------- Map countdown ----------
let mapTimerRaf = null, mapDeadline = 0;

function startMapTimer() {
  mapDeadline = performance.now() + MAP_SECONDS * 1000;
  const wrap = $("map-wrap"), bar = $("map-timer-bar");
  let lastBeatSec = -1;
  (function tickMap(now) {
    if (state.locked) { wrap.classList.remove("urgent"); return; }
    const left = Math.max(0, mapDeadline - now);
    bar.style.width = (left / (MAP_SECONDS * 1000) * 100) + "%";
    bar.classList.toggle("low", left < 6000);
    wrap.classList.toggle("urgent", left < 6000);
    if (left < 6000) {
      const sec = Math.ceil(left / 1000);
      if (sec !== lastBeatSec) { sfx.tockUrgent(); lastBeatSec = sec; }
    }
    if (left <= 0) {
      wrap.classList.remove("urgent");
      state.guess ? confirmGuess() : timeUpNoPin();
      return;
    }
    mapTimerRaf = requestAnimationFrame(tickMap);
  })(performance.now());
}

function stopMapTimer() {
  cancelAnimationFrame(mapTimerRaf);
  $("map-wrap").classList.remove("urgent");
}

function startMapPhase() {
  state.guess = null;
  state.locked = false;
  revealed = false;

  $("map-city").textContent = state.question.city;
  const stake = $("map-stake");
  const tier = state.question.d;
  if (state.answeredCorrect) {
    stake.textContent = `✔ Correct! ${TIER_POINTS[tier]} pts banked — pin close for up to +${geoMax(tier)} bonus`;
    stake.className = "map-stake staked";
  } else {
    stake.textContent = `✘ Wrong — a close pin still earns up to +${geoMax(tier)}`;
    stake.className = "map-stake rescue";
  }
  $("btn-confirm").classList.add("hidden");
  $("result-panel").classList.add("hidden");
  $("splash").classList.add("hidden");
  $("map-hint").classList.remove("hidden");
  $("map-timer-bar").style.width = "100%";
  $("map-timer-bar").classList.remove("low");

  show("screen-map");
  sizeMap();
  resetView();
  drawMap();
  startMapTimer();
}

// Map interactions: tap/click = pin, drag = pan, wheel or pinch = zoom
const MAP_MAX_ZOOM = 20;
const mapTouches = new Map();   // active pointers, for pinch
let pinchDist = 0;

function applyMapZoom(factor, mx, my) {
  const newZoom = Math.min(MAP_MAX_ZOOM, Math.max(1, view.zoom * factor));
  const f = newZoom / view.zoom;
  view.ox = mx - (mx - view.ox) * f;
  view.oy = my - (my - view.oy) * f;
  view.zoom = newZoom;
  clampView();
  drawMap();
}

mapCanvas.addEventListener("pointerdown", e => {
  mapTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { mapCanvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic/stale pointer */ }
  if (mapTouches.size === 2) {
    // second finger: this gesture is a pinch, never a pin drop
    dragging = false;
    dragMoved = true;
    const [a, b] = [...mapTouches.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  } else if (mapTouches.size === 1) {
    dragging = true;
    dragMoved = false;
    dragStart = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
  }
});
mapCanvas.addEventListener("pointermove", e => {
  if (!mapTouches.has(e.pointerId)) return;
  mapTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (mapTouches.size === 2) {
    const [a, b] = [...mapTouches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0 && d > 0) {
      const rect = mapCanvas.getBoundingClientRect();
      applyMapZoom(d / pinchDist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
    }
    pinchDist = d;
    return;
  }
  if (!dragging) return;
  const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
  if (Math.abs(dx) + Math.abs(dy) > 5) dragMoved = true;
  if (dragMoved) {
    mapCanvas.classList.add("grabbing");
    view.ox = dragStart.ox + dx;
    view.oy = dragStart.oy + dy;
    clampView();
    drawMap();
  }
});
function mapPointerEnd(e) {
  mapTouches.delete(e.pointerId);
  pinchDist = 0;
  if (!dragging && mapTouches.size > 0) return;
  const wasDragging = dragging;
  dragging = false;
  mapCanvas.classList.remove("grabbing");
  if (e.type === "pointercancel") return;
  if (!wasDragging || dragMoved || revealed || state.locked) return;
  // a clean tap/click: drop the pin
  const rect = mapCanvas.getBoundingClientRect();
  const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
  if (w.lat > LAT_TOP || w.lat < LAT_BOTTOM || w.lon < -180 || w.lon > 180) return;
  state.guess = w;
  sfx.pin();
  $("btn-confirm").classList.remove("hidden");
  $("map-hint").classList.add("hidden");
  drawMap();
  startPinFx();
}
mapCanvas.addEventListener("pointerup", mapPointerEnd);
mapCanvas.addEventListener("pointercancel", mapPointerEnd);
mapCanvas.addEventListener("wheel", e => {
  e.preventDefault();
  const rect = mapCanvas.getBoundingClientRect();
  applyMapZoom(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });
window.addEventListener("resize", () => {
  if ($("screen-map").classList.contains("hidden")) return;
  const before = view.zoom;
  sizeMap();
  view.zoom = before;
  clampView();
  drawMap();
});

// ---------- FX: confetti + floating points + splash ----------
let confettiRaf = null;
function burstConfetti(sx, sy, big) {
  const colors = ["#ffd23d", "#e5533d", "#43b649", "#3d9be5", "#a04de5", "#ffffff"];
  const n = big ? 120 : 60;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * 2 * Math.PI, sp = 3 + Math.random() * (big ? 9 : 6);
    parts.push({
      x: sx, y: sy,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 3,
      w: 4 + Math.random() * 5, h: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 70 + Math.random() * 40,
    });
  }
  cancelAnimationFrame(confettiRaf);
  (function step() {
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.clearRect(0, 0, cw, ch);
    let alive = false;
    for (const p of parts) {
      if (p.life <= 0) continue;
      alive = true;
      p.life--;
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.18; p.vx *= 0.99;
      p.rot += p.vr;
      fctx.save();
      fctx.translate(p.x, p.y);
      fctx.rotate(p.rot);
      fctx.globalAlpha = Math.min(1, p.life / 30);
      fctx.fillStyle = p.color;
      fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      fctx.restore();
    }
    if (alive) confettiRaf = requestAnimationFrame(step);
    else fctx.clearRect(0, 0, cw, ch);
  })();
}

function floatPoints(sx, sy, text) {
  const el = document.createElement("div");
  el.className = "float-pts";
  el.textContent = text;
  el.style.left = sx + "px";
  el.style.top = (sy - 30) + "px";
  $("map-wrap").appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

function showSplash(text, color) {
  const s = $("splash");
  s.textContent = text;
  s.style.color = color;
  s.classList.remove("hidden");
  s.style.animation = "none";
  void s.offsetWidth;
  s.style.animation = "";
}

// Fit the view so both the guess and the true city are visible
function fitToReveal() {
  const q = state.question;
  const xs = [projX(state.guess.lon), projX(q.lon)];
  const ys = [projY(state.guess.lat), projY(q.lat)];
  const pad = 120 / baseScale; // proj-space padding around the pins
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const fit = Math.min(cw / (maxX - minX), ch / (maxY - minY));
  view.zoom = Math.min(6, Math.max(1, fit / baseScale));
  view.ox = cw / 2 - (minX + maxX) / 2 * scale();
  view.oy = ch / 2 - (minY + maxY) / 2 * scale();
  clampView();
}

// ---------- Reveal & scoring ----------
function confirmGuess() {
  if (!state.guess || state.locked) return;
  state.locked = true;
  revealed = true;
  stopMapTimer();
  $("btn-confirm").classList.add("hidden");

  const q = state.question;
  const km = haversineKm(state.guess.lat, state.guess.lon, q.lat, q.lon);
  const p = proximity(km);
  const geoBonus = Math.round(geoMax(q.d) * p);
  const base = state.answeredCorrect ? TIER_POINTS[q.d] : 0;
  const sMult = state.answeredCorrect ? streakMult() : 1;
  const points = Math.round((base + geoBonus) * sMult);
  state.score += points;
  state.history.push({
    genre: state.genre, city: q.city, correct: state.answeredCorrect,
    km: Math.round(km), points,
  });
  recordPin({
    game_id: state.gameId, genre: state.genre.name, city: q.city,
    alat: q.lat, alon: q.lon,
    glat: +state.guess.lat.toFixed(3), glon: +state.guess.lon.toFixed(3),
    km: Math.round(km), correct: state.answeredCorrect, points,
  });

  $("res-dist").textContent = `${Math.round(km).toLocaleString()} km`;
  $("res-mult").textContent = `+${geoBonus} / ${geoMax(q.d)}`;
  const streakRow = $("res-streak-row");
  if (sMult > 1) {
    streakRow.classList.remove("hidden");
    $("res-streak").textContent = `×${sMult.toFixed(1)}`;
  } else {
    streakRow.classList.add("hidden");
  }
  $("res-points").textContent = `+${points}`;
  $("btn-next").textContent = state.round >= TOTAL_ROUNDS ? "See final score" : "Next round";
  $("result-panel").classList.remove("hidden");

  fitToReveal();
  drawMap();

  const [ax, ay] = toScreen(q.lat, q.lon);
  if (p === 1 && state.answeredCorrect) {
    showSplash("🎯 BULLSEYE!", "#ffd23d");
    burstConfetti(ax, ay, true);
    sfx.bullseye();
  } else if (p === 1) {
    showSplash("🎯 PERFECT PIN!", "#7fe086");
    burstConfetti(ax, ay, false);
    sfx.reveal();
  } else if (state.answeredCorrect && p >= 0.5) {
    showSplash("🔥 SO CLOSE!", "#7fe086");
    burstConfetti(ax, ay, false);
    sfx.reveal();
  } else {
    sfx.reveal();
  }
  floatPoints(...toScreen(state.guess.lat, state.guess.lon), `+${points}`);
  animateScore();
}

function timeUpNoPin() {
  state.locked = true;
  revealed = false;
  stopMapTimer();
  $("btn-confirm").classList.add("hidden");
  const q = state.question;
  state.history.push({
    genre: state.genre, city: q.city, correct: state.answeredCorrect,
    km: null, points: 0,
  });
  showSplash("⏰ TIME'S UP!", "#e5533d");
  sfx.wrong();
  $("res-dist").textContent = "no pin!";
  $("res-mult").textContent = "—";
  $("res-streak-row").classList.add("hidden");
  $("res-points").textContent = "+0";
  $("btn-next").textContent = state.round >= TOTAL_ROUNDS ? "See final score" : "Next round";
  $("result-panel").classList.remove("hidden");
}

function nextRound() {
  if (state.round >= TOTAL_ROUNDS) { endGame(); return; }
  state.round++;
  updateRound();
  const tier = difficultyForRound(state.round);
  $("wheel-heading").textContent = `Round ${state.round} · ${DIFF_LABEL[tier]} · Spin!`;
  $("btn-spin").disabled = false;
  show("screen-wheel");
  drawWheel();
}

// End-screen XP panel: bar fills from where you were to where you are now,
// with a level-up celebration when a boundary is crossed
function renderXpPanel(oldInfo, newInfo, gained, doubled) {
  $("xp-badge").innerHTML = badgeSVG(newInfo.level, 58);
  $("xp-gained").innerHTML = `+${gained} XP` + (doubled ? ` <span class="xp-double">🌍 DAILY ×2</span>` : "");
  $("xp-label").textContent = `Level ${newInfo.level} · ${newInfo.into}/${newInfo.need} XP`;
  const bar = $("xp-bar");
  const leveled = newInfo.level > oldInfo.level;
  const lu = $("level-up");
  lu.classList.add("hidden");
  bar.style.transition = "none";
  bar.style.width = (oldInfo.into / oldInfo.need * 100) + "%";
  void bar.offsetWidth;
  bar.style.transition = "width .9s ease-out";
  if (leveled) {
    bar.style.width = "100%";
    setTimeout(() => {
      bar.style.transition = "none";
      bar.style.width = "0%";
      void bar.offsetWidth;
      bar.style.transition = "width .7s ease-out";
      bar.style.width = (newInfo.into / newInfo.need * 100) + "%";
      const t = badgeTier(newInfo.level);
      const newTier = badgeTier(newInfo.level).min > badgeTier(oldInfo.level).min;
      lu.textContent = newTier
        ? `⬆️ LEVEL ${newInfo.level} — ${t.name.toUpperCase()} BADGE UNLOCKED!`
        : `⬆️ LEVEL ${newInfo.level}!`;
      lu.classList.remove("hidden");
      $("xp-badge").classList.remove("badge-pop");
      void $("xp-badge").offsetWidth;
      $("xp-badge").classList.add("badge-pop");
      sfx.bullseye();
    }, 1000);
  } else {
    setTimeout(() => { bar.style.width = (newInfo.into / newInfo.need * 100) + "%"; }, 60);
  }
}

// Has this name already submitted a daily score today (from any device)?
async function hasDailyEntry(day, name) {
  if (!backendReady() || !name) return false;
  try {
    const res = await fetch(
      `${BACKEND.url}/rest/v1/scores?day=eq.${day}&name=eq.${encodeURIComponent(name)}&select=id&limit=1`,
      { headers: backendHeaders() });
    if (!res.ok) return false;
    return (await res.json()).length > 0;
  } catch (e) { return false; }
}

async function endGame() {
  $("end-score").textContent = state.score.toLocaleString();

  // XP: flat completion award + score bonus; the FIRST daily of the day pays
  // double — checked against the server so a second device can't double-dip.
  let firstDaily = state.mode === "daily" && localStorage.getItem("sp-daily-" + utcDay()) === null;
  if (firstDaily) firstDaily = !(await hasDailyEntry(utcDay(), store.getName()));
  state.firstDaily = firstDaily;
  const doubled = state.mode === "daily" && firstDaily;
  const gainedXP = (GAME_XP + Math.round(state.score / 10)) * (doubled ? 2 : 1);
  const newTotal = await awardXP(gainedXP);
  const oldInfo = levelInfo(Math.max(0, newTotal - gainedXP));
  const newInfo = levelInfo(newTotal);
  renderXpPanel(oldInfo, newInfo, gainedXP, doubled);

  // record the run and show where it landed
  const prevBest = store.getScores()[0]?.score ?? 0;
  const entry = {
    name: store.getName() || "Explorer",
    score: state.score,
    date: new Date().toISOString().slice(0, 10),
  };
  const rank = store.saveScore(entry);
  // daily replays don't count anywhere global, so don't crown them either
  const replayRun = state.mode === "daily" && !state.firstDaily;
  const isNewBest = state.score > 0 && state.score > prevBest && !replayRun;
  $("new-best").classList.toggle("hidden", !isNewBest);
  if (isNewBest) sfx.bullseye();
  renderLeaderboard(rank);

  // daily runs: submit once per device per day, then show the global board
  if (state.mode === "daily") {
    const day = utcDay();
    if (localStorage.getItem("sp-daily-" + day) === null) {
      localStorage.setItem("sp-daily-" + day, state.score);
    }
    if (state.firstDaily) {
      submitDailyScore(day, entry.name, state.score)
        .then(() => renderDailyBoard(day, entry.name, state.score));
    } else {
      renderDailyBoard(day, entry.name, state.score);
    }
    updateDailyButton();
  } else {
    $("daily-board").classList.add("hidden");
  }

  // head-to-head verdict when this run came from a challenge link
  const cr = $("challenge-result");
  if (activeChallenge) {
    const won = state.score > activeChallenge.score;
    const tied = state.score === activeChallenge.score;
    cr.classList.remove("hidden", "won", "lost");
    cr.classList.add(won ? "won" : "lost");
    cr.textContent = tied
      ? `⚔️ Dead heat with ${activeChallenge.name} — ${state.score.toLocaleString()} apiece!`
      : won
        ? `⚔️ You beat ${activeChallenge.name}! ${state.score.toLocaleString()} vs ${activeChallenge.score.toLocaleString()}`
        : `😤 ${activeChallenge.name} wins — ${activeChallenge.score.toLocaleString()} vs your ${state.score.toLocaleString()}`;
    if (won) sfx.bullseye();
    // challenge consumed — "Play again" rolls a fresh seed
    activeChallenge = null;
    history.replaceState(null, "", location.pathname);
    $("btn-start").textContent = "Play";
  } else {
    cr.classList.add("hidden");
  }

  let max = 0;
  for (let r = 1; r <= TOTAL_ROUNDS; r++) {
    const t = difficultyForRound(r);
    max += TIER_POINTS[t] + geoMax(t);
  }
  const pct = state.score / max;
  $("end-verdict").textContent =
    pct > 0.8 ? "🌍 World-class! Carmen Sandiego is taking notes." :
    pct > 0.6 ? "✈️ Impressive — you clearly own a passport." :
    pct > 0.4 ? "🗺️ Solid! A few cities drifted, but the world is big." :
    pct > 0.2 ? "🧭 Getting there — the compass spins, but so do you." :
    "🌑 The world remains a mystery. Perfect excuse to travel!";
  const rows = $("end-rows");
  rows.innerHTML = "";
  state.history.forEach((h, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i + 1}</td><td>${h.genre.icon} ${h.genre.name}</td><td>${h.city}</td>` +
      `<td class="${h.correct ? "good" : "bad"}">${h.correct ? "✔" : "✘"}</td>` +
      `<td>${h.km === null ? "—" : h.km.toLocaleString() + " km"}</td><td class="pts">+${h.points}</td>`;
    rows.appendChild(tr);
  });
  show("screen-end");
}

// ---------- Global daily leaderboard (Supabase REST; no-ops until config.js is filled) ----------
const backendReady = () => typeof BACKEND !== "undefined" && BACKEND.url && BACKEND.anonKey;
const backendHeaders = () => {
  const h = { apikey: BACKEND.anonKey, "Content-Type": "application/json" };
  // legacy anon keys are JWTs and also go in the Authorization header;
  // new publishable keys (sb_publishable_...) must NOT — apikey alone is correct
  if (BACKEND.anonKey.startsWith("eyJ")) h.Authorization = `Bearer ${BACKEND.anonKey}`;
  return h;
};

async function submitDailyScore(day, name, score) {
  if (!backendReady()) return false;
  try {
    const res = await fetch(`${BACKEND.url}/rest/v1/scores`, {
      method: "POST",
      headers: { ...backendHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ day, name, score }),
    });
    return res.ok;
  } catch (e) { return false; }
}

async function fetchDailyTop(day) {
  if (!backendReady()) return null;
  try {
    const res = await fetch(
      `${BACKEND.url}/rest/v1/scores?day=eq.${day}&select=name,score&order=score.desc&limit=40`,
      { headers: backendHeaders() });
    if (!res.ok) return null;
    // one row per name (best score) — guards against multi-device double submits
    const seen = new Set(), out = [];
    for (const r of await res.json()) {
      if (seen.has(r.name)) continue;
      seen.add(r.name);
      out.push(r);
      if (out.length === 10) break;
    }
    return out;
  } catch (e) { return null; }
}

async function renderDailyBoard(day, myName, myScore) {
  const box = $("daily-board");
  box.classList.remove("hidden");
  $("daily-title").textContent = `🌍 Daily Top 10 · ${day}`;
  const rows = $("daily-rows");
  if (!backendReady()) {
    rows.innerHTML = `<tr><td colspan="3" style="color:var(--muted)">Global board not set up yet — score saved on this device. (See SETUP.md)</td></tr>`;
    return;
  }
  rows.innerHTML = `<tr><td colspan="3" style="color:var(--muted)">Loading…</td></tr>`;
  const top = await fetchDailyTop(day);
  if (!top) {
    rows.innerHTML = `<tr><td colspan="3" style="color:var(--muted)">Couldn't reach the leaderboard — try again later.</td></tr>`;
    return;
  }
  const levels = await fetchLevels(top.map(r => r.name));
  rows.innerHTML = "";
  top.forEach((s, i) => {
    const tr = document.createElement("tr");
    if (s.name === myName && s.score === myScore) tr.className = "me";
    const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
    tr.innerHTML = `<td>${medal}</td><td>${nameCellHTML(s.name, levels)}</td>` +
      `<td style="text-align:right;font-weight:700;color:var(--accent)">${(+s.score).toLocaleString()}</td>`;
    rows.appendChild(tr);
  });
  if (top.length === 0) rows.innerHTML = `<tr><td colspan="3" style="color:var(--muted)">First finisher today — that's you!</td></tr>`;
}

// ---------- Player identity & scores (local-first; swap these four functions
// for API calls when a backend exists) ----------
const store = {
  getName() { return localStorage.getItem("sp-name") || ""; },
  setName(v) { localStorage.setItem("sp-name", v); },
  getScores() {
    try { return JSON.parse(localStorage.getItem("sp-scores")) || []; }
    catch (e) { return []; }
  },
  saveScore(entry) {
    const scores = this.getScores();
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, 10);
    localStorage.setItem("sp-scores", JSON.stringify(top));
    return top.indexOf(entry); // rank in top 10, or -1 if it didn't make it
  },
};

async function renderLeaderboard(highlightRank) {
  const rows = $("lb-rows");
  rows.innerHTML = "";
  const scores = store.getScores();
  if (scores.length === 0) {
    rows.innerHTML = `<tr><td colspan="4" style="color:var(--muted)">No scores yet — be the first!</td></tr>`;
    return;
  }
  const levels = await fetchLevels([...new Set(scores.map(s => s.name))]);
  rows.innerHTML = "";
  scores.forEach((s, i) => {
    const tr = document.createElement("tr");
    if (i === highlightRank) tr.className = "me";
    const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
    tr.innerHTML = `<td>${medal}</td><td>${nameCellHTML(s.name, levels)}</td>` +
      `<td class="lb-date">${s.date}</td><td>${s.score.toLocaleString()}</td>`;
    rows.appendChild(tr);
  });
}

function startGame(mode) {
  state.mode = mode === "daily" ? "daily" : "free";
  state.round = 0;
  state.score = 0;
  state.streak = 0;
  state.history = [];
  state.decks = {};
  state.genreBag = [];
  // daily = everyone shares today's seed; challenge links replay the challenger's
  // exact run; otherwise roll a fresh seed
  state.seed = state.mode === "daily" ? hashSeed("spinpoint-" + utcDay())
    : activeChallenge ? activeChallenge.seed
    : (Math.random() * 2 ** 31) | 0;
  state.rng = mulberry32(state.seed);
  state.gameId = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  displayedScore = 0;
  $("hud-score").textContent = "0";
  updateStreakHud();
  updateRound();
  nextRound();
}

// ---------- XP & levels ----------
// Flat XP for finishing plus a score bonus; the daily's first run pays double.
const GAME_XP = 50;
const xpNeedFor = lvl => 250 + (lvl - 1) * 75;   // XP to go from lvl -> lvl+1
function levelInfo(totalXp) {
  let level = 1, into = totalXp;
  while (into >= xpNeedFor(level)) { into -= xpNeedFor(level); level++; }
  return { level, into, need: xpNeedFor(level) };
}
const getXP = () => parseInt(localStorage.getItem("sp-xp"), 10) || 0;
const setXP = v => localStorage.setItem("sp-xp", v);

// Add XP atomically on the server (multi-device safe) and mirror the total
// locally. Falls back to local-only when offline or unnamed.
async function awardXP(gained) {
  const name = store.getName();
  if (backendReady() && name) {
    try {
      const res = await fetch(`${BACKEND.url}/rest/v1/rpc/add_xp`, {
        method: "POST",
        headers: backendHeaders(),
        body: JSON.stringify({ p_name: name, p_gained: gained }),
      });
      if (res.ok) {
        const total = await res.json();
        setXP(total);
        return total;
      }
    } catch (e) { /* fall through to local */ }
  }
  setXP(getXP() + gained);
  return getXP();
}

// Reconcile this device with the server: pull down a bigger server total
// (played elsewhere), or push up local surplus (played offline).
async function syncXP() {
  const name = store.getName();
  if (!backendReady() || !name) return;
  try {
    const res = await fetch(
      `${BACKEND.url}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=xp`,
      { headers: backendHeaders() });
    if (!res.ok) return;
    const rows = await res.json();
    const server = rows[0]?.xp ?? 0;
    const local = getXP();
    if (local > server) await awardXP(local - server);
    else setXP(server);
    updateHomeBadge();
  } catch (e) { /* offline is fine */ }
}

async function fetchLevels(names) {
  if (!backendReady() || names.length === 0) return {};
  try {
    const list = "(" + names.map(n => quoted(n)).join(",") + ")";
    const res = await fetch(
      `${BACKEND.url}/rest/v1/players?name=in.${encodeURIComponent(list)}&select=name,xp`,
      { headers: backendHeaders() });
    if (!res.ok) return {};
    const out = {};
    for (const r of await res.json()) out[r.name] = levelInfo(r.xp).level;
    return out;
  } catch (e) { return {}; }
}

// Badge: an SVG medallion that levels up with you. Star pips fill in each level;
// every 5 levels the material itself changes.
const BADGE_TIERS = [
  { min: 30, name: "Diamond",  c1: "#7e8fd4", c2: "#e8fbff", ring: "#c8f4ff", glow: "rgba(174,242,255,.5)" },
  { min: 25, name: "Ruby",     c1: "#8f1430", c2: "#ff5a72", ring: "#e5324b", glow: "rgba(229,50,75,.45)" },
  { min: 20, name: "Sapphire", c1: "#1a3e8f", c2: "#7fb0ff", ring: "#4f8ef7", glow: "rgba(79,142,247,.45)" },
  { min: 15, name: "Emerald",  c1: "#0e6b3a", c2: "#69f0a8", ring: "#3ddc84", glow: "rgba(61,220,132,.45)" },
  { min: 10, name: "Gold",     c1: "#9a7000", c2: "#ffe066", ring: "#ffd700", glow: "rgba(255,215,0,.4)" },
  { min: 5,  name: "Silver",   c1: "#6f7d8e", c2: "#e6edf5", ring: "#c3ceda", glow: null },
  { min: 1,  name: "Bronze",   c1: "#7a4419", c2: "#d99a5b", ring: "#b06f33", glow: null },
];
const badgeTier = level => BADGE_TIERS.find(t => level >= t.min) || BADGE_TIERS[BADGE_TIERS.length - 1];

function badgeSVG(level, px = 48) {
  const t = badgeTier(level);
  const pips = Math.min(4, Math.max(0, (level - t.min) % 5));
  const uid = "bd" + Math.random().toString(36).slice(2, 8);
  const stars = Array.from({ length: 4 }, (_, i) =>
    `<circle cx="${32 + i * 12}" cy="89" r="3.2" fill="${i < pips ? "#fff" : "rgba(0,0,0,.4)"}"/>`).join("");
  const glow = t.glow ? `<ellipse cx="50" cy="55" rx="49" ry="53" fill="${t.glow}"/>` : "";
  return `<svg viewBox="0 0 100 110" width="${px}" height="${Math.round(px * 1.1)}" xmlns="http://www.w3.org/2000/svg" aria-label="Level ${level} ${t.name} badge">
${glow}<defs><linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c2}"/><stop offset="1" stop-color="${t.c1}"/></linearGradient></defs>
<polygon points="50,4 93,29 93,81 50,106 7,81 7,29" fill="url(#${uid})" stroke="${t.ring}" stroke-width="4" stroke-linejoin="round"/>
<polygon points="50,14 84,34 84,76 50,96 16,76 16,34" fill="rgba(0,0,0,.3)"/>
<text x="50" y="${level >= 100 ? 60 : 63}" text-anchor="middle" font-size="${level >= 100 ? 24 : 32}" font-weight="900" fill="#fff" font-family="Segoe UI, sans-serif">${level}</text>
${stars}</svg>`;
}

function updateHomeBadge() {
  const info = levelInfo(getXP());
  const t = badgeTier(info.level);
  $("home-badge").innerHTML = badgeSVG(info.level, 44) +
    `<span class="home-badge-label">Level ${info.level} · ${t.name}<br>` +
    `<span class="home-badge-xp">${info.into}/${info.need} XP</span></span>`;
}

// ---------- Pins: every guessed round, kept locally and (when possible) globally ----------
function getLocalPins() {
  try { return JSON.parse(localStorage.getItem("sp-pins")) || []; }
  catch (e) { return []; }
}
function recordPin(pin) {
  const pins = getLocalPins();
  pins.push(pin);
  localStorage.setItem("sp-pins", JSON.stringify(pins.slice(-1000)));
  const name = store.getName();
  if (backendReady() && name) {
    fetch(`${BACKEND.url}/rest/v1/pins`, {
      method: "POST",
      headers: { ...backendHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ ...pin, name }),
    }).catch(() => {});
  }
}
async function fetchPins(name) {
  if (!backendReady()) return null;
  try {
    const res = await fetch(
      `${BACKEND.url}/rest/v1/pins?name=eq.${encodeURIComponent(name)}&select=game_id,genre,city,alat,alon,glat,glon,km,correct,points&order=created_at.desc&limit=1000`,
      { headers: backendHeaders() });
    return res.ok ? await res.json() : null;
  } catch (e) { return null; }
}

// ---------- Friends ----------
// With a backend: friendships are mutual server-side pairs — one accepted invite
// links both people. Without one: a local list of names, as before.
const cleanName = n => n.replace(/["(),]/g, "").trim().slice(0, 16);
const quoted = n => `"${cleanName(n)}"`;

function getLocalFriends() {
  try { return JSON.parse(localStorage.getItem("sp-friends")) || []; }
  catch (e) { return []; }
}
function setLocalFriends(f) { localStorage.setItem("sp-friends", JSON.stringify(f)); }

async function fetchFriends() {
  const me = store.getName();
  if (!backendReady() || !me) return getLocalFriends();
  try {
    const q = encodeURIComponent(`(a.eq.${quoted(me)},b.eq.${quoted(me)})`);
    const res = await fetch(`${BACKEND.url}/rest/v1/friendships?or=${q}&select=a,b`,
      { headers: backendHeaders() });
    if (!res.ok) return getLocalFriends();
    const rows = await res.json();
    return [...new Set(rows.map(r => r.a === me ? r.b : r.a))];
  } catch (e) { return getLocalFriends(); }
}

async function addFriendship(other) {
  const me = store.getName();
  other = cleanName(other);
  if (!other || other === me) return false;
  if (!backendReady() || !me) {
    const f = getLocalFriends();
    if (!f.includes(other)) { f.push(other); setLocalFriends(f); }
    return true;
  }
  const [a, b] = me < other ? [me, other] : [other, me];
  try {
    const res = await fetch(`${BACKEND.url}/rest/v1/friendships?on_conflict=a,b`, {
      method: "POST",
      headers: { ...backendHeaders(), Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify({ a, b }),
    });
    return res.ok;
  } catch (e) { return false; }
}

async function removeFriendship(other) {
  const me = store.getName();
  other = cleanName(other);
  if (!backendReady() || !me) {
    setLocalFriends(getLocalFriends().filter(n => n !== other));
    return;
  }
  const [a, b] = me < other ? [me, other] : [other, me];
  try {
    await fetch(`${BACKEND.url}/rest/v1/friendships?a=eq.${encodeURIComponent(a)}&b=eq.${encodeURIComponent(b)}`,
      { method: "DELETE", headers: backendHeaders() });
  } catch (e) { /* ignore */ }
}

// One-time migration: old local one-way follows become mutual server friendships
async function migrateLocalFriends() {
  const local = getLocalFriends();
  if (!backendReady() || !store.getName() || local.length === 0) return;
  for (const n of local) await addFriendship(n);
  localStorage.removeItem("sp-friends");
}

// Invite links: ?f=<name> — one click and the opener adds you, no typing
function inviteUrl() {
  return `${location.origin}${location.pathname}?f=${encodeURIComponent(store.getName())}`;
}

async function copyLink(url, btn, okText, failPromptLabel, restoreText) {
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = okText;
    setTimeout(() => { btn.textContent = restoreText; }, 2500);
  } catch (e) {
    window.prompt(failPromptLabel, url);
  }
}

const friendInvite = (() => {
  const p = new URLSearchParams(location.search);
  const n = p.get("f");
  if (!n) return null;
  // strip only the f param; challenge params (c/n/s) stay untouched
  p.delete("f");
  const qs = p.toString();
  history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  return n.trim().slice(0, 16) || null;
})();

function showFriendRequest() {
  if (!friendInvite) return;
  const box = $("friend-request");
  const safe = friendInvite.replace(/</g, "&lt;");
  box.classList.remove("hidden");
  if (friendInvite === store.getName()) {
    box.innerHTML = `🫂 That's your own invite link — send it to someone else!`;
    return;
  }
  const hint = `<div id="friend-name-hint" class="banner-hint hidden">Pick your explorer name below first, then hit Add!</div>`;
  box.innerHTML = `🫂 <b>${safe}</b> wants to be friends! ` +
    `<div class="banner-actions">` +
    `<button id="btn-friend-yes" class="btn-big btn-small">Add ${safe}</button>` +
    `<button id="btn-friend-no" class="btn-big btn-daily btn-small">No thanks</button></div>` + hint;
  $("btn-friend-yes").addEventListener("click", async () => {
    if (backendReady() && !store.getName()) {
      // a mutual friendship needs a name on both ends
      $("friend-name-hint").classList.remove("hidden");
      $("name-input").focus();
      return;
    }
    const ok = await addFriendship(friendInvite);
    box.innerHTML = ok && backendReady()
      ? `✔ You and <b>${safe}</b> are now friends — both sides, no link back needed!`
      : ok
        ? `✔ <b>${safe}</b> added to your local list!`
        : `Couldn't reach the server — try again in a moment.`;
  });
  $("btn-friend-no").addEventListener("click", () => box.classList.add("hidden"));
}

async function fetchFriendsToday(day, names) {
  if (!backendReady() || names.length === 0) return null;
  try {
    const list = "(" + names.map(n => `"${n.replace(/"/g, "")}"`).join(",") + ")";
    const res = await fetch(
      `${BACKEND.url}/rest/v1/scores?day=eq.${day}&name=in.${encodeURIComponent(list)}&select=name,score&order=score.desc`,
      { headers: backendHeaders() });
    return res.ok ? await res.json() : null;
  } catch (e) { return null; }
}

// One name cell everywhere: badge + name + level, so rank is always on display
function nameCellHTML(name, levels) {
  const lvl = levels?.[name];
  const badge = lvl ? `<span class="mini-badge">${badgeSVG(lvl, 22)}</span>` : "";
  const tag = lvl ? ` <span class="chip-lvl">Lv ${lvl}</span>` : "";
  return `${badge}${String(name).replace(/</g, "&lt;")}${tag}`;
}

function fillBoardRows(tbody, rows, emptyMsg, levels) {
  tbody.innerHTML = "";
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--muted)">${emptyMsg}</td></tr>`;
    return;
  }
  rows.forEach((s, i) => {
    const tr = document.createElement("tr");
    const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
    tr.innerHTML = `<td>${medal}</td><td>${nameCellHTML(s.name, levels)}</td>` +
      `<td style="text-align:right;font-weight:700;color:var(--accent)">${(+s.score).toLocaleString()}</td>`;
    tbody.appendChild(tr);
  });
}

function renderFriendChips(friends, levels = {}) {
  const box = $("friend-list");
  box.innerHTML = "";
  friends.forEach(name => {
    const chip = document.createElement("span");
    chip.className = "friend-chip";
    const lvl = levels[name];
    const badge = lvl ? `<span class="mini-badge">${badgeSVG(lvl, 20)}</span>` : "";
    chip.innerHTML = `${badge}${name.replace(/</g, "&lt;")}` +
      (lvl ? ` <span class="chip-lvl">Lv ${lvl}</span>` : "") +
      ` <button class="chip-x" title="Remove friend">✕</button>`;
    chip.querySelector(".chip-x").addEventListener("click", async () => {
      await removeFriendship(name);
      openBoards(); // refresh
    });
    box.appendChild(chip);
  });
}

async function openBoards() {
  show("screen-boards");
  const day = utcDay();
  // your own standing, front and center
  const meBox = $("boards-me");
  const myName = store.getName();
  if (myName) {
    const info = levelInfo(getXP());
    const t = badgeTier(info.level);
    meBox.classList.remove("hidden");
    meBox.innerHTML = badgeSVG(info.level, 52) +
      `<div class="boards-me-info"><b>${myName.replace(/</g, "&lt;")}</b>` +
      `<span>Level ${info.level} · ${t.name} · ${info.into}/${info.need} XP</span></div>`;
  } else {
    meBox.classList.add("hidden");
  }
  $("boards-daily-title").textContent = `🌍 Daily Top 10 · ${day}`;
  fillBoardRows($("boards-local-rows"), store.getScores(),
    "No games on this device yet.");
  await migrateLocalFriends();
  const friends = await fetchFriends();
  renderFriendChips(friends);
  if (!backendReady()) {
    fillBoardRows($("boards-daily-rows"), null, "Global board not configured.");
    fillBoardRows($("friends-rows"), null, "Global board not configured.");
    return;
  }
  $("boards-daily-rows").innerHTML = `<tr><td style="color:var(--muted)">Loading…</td></tr>`;
  $("friends-rows").innerHTML = friends.length
    ? `<tr><td style="color:var(--muted)">Loading…</td></tr>` : "";
  const [top, friendRows] = await Promise.all([
    fetchDailyTop(day),
    fetchFriendsToday(day, friends),
  ]);
  // one levels lookup covering every name on this screen
  const names = [...new Set([
    ...friends,
    ...(top || []).map(r => r.name),
    ...(friendRows || []).map(r => r.name),
    ...store.getScores().map(s => s.name),
  ])];
  const levels = await fetchLevels(names);
  renderFriendChips(friends, levels);
  fillBoardRows($("boards-local-rows"), store.getScores(), "No games on this device yet.", levels);
  fillBoardRows($("boards-daily-rows"), top,
    top === null ? "Couldn't reach the leaderboard." : "Nobody has played today's daily yet — go be first!", levels);
  fillBoardRows($("friends-rows"), friendRows,
    friends.length === 0 ? "Add friends by their explorer name (or send an invite link) to see their daily scores."
      : "None of your friends have played today's daily yet.", levels);
}

async function addFriend() {
  const input = $("friend-input");
  const name = cleanName(input.value);
  if (!name) return;
  if (backendReady() && !store.getName()) {
    input.value = "";
    input.placeholder = "Set your explorer name first!";
    return;
  }
  await addFriendship(name);
  input.value = "";
  openBoards();
}

// ---------- Profile: journey map + stats, for me or a friend ----------
const jCanvas = $("journey");
const jctx = jCanvas.getContext("2d");
let jview = { zoom: 1, ox: 0, oy: 0 };
let jcw = 0, jch = 0;
let jDrag = null;
let profilePins = [];

function jScale() { return jview.zoom * Math.min(jcw / PROJ_W, jch / PROJ_H); }
function jToScreen(lat, lon) { return [projX(lon) * jScale() + jview.ox, projY(lat) * jScale() + jview.oy]; }

function sizeJourney() {
  const wrap = jCanvas.parentElement;
  const d = window.devicePixelRatio || 1;
  jcw = wrap.clientWidth; jch = wrap.clientHeight;
  jCanvas.width = jcw * d;
  jCanvas.height = jch * d;
}
function resetJourneyView() {
  jview.zoom = 1;
  const s = jScale();
  jview.ox = (jcw - PROJ_W * s) / 2;
  jview.oy = (jch - PROJ_H * s) / 2;
}
function clampJourney() {
  const w = PROJ_W * jScale(), h = PROJ_H * jScale();
  jview.ox = w <= jcw ? (jcw - w) / 2 : Math.min(0, Math.max(jcw - w, jview.ox));
  jview.oy = h <= jch ? (jch - h) / 2 : Math.min(0, Math.max(jch - h, jview.oy));
}

function drawJourney() {
  const d = window.devicePixelRatio || 1;
  jctx.setTransform(d, 0, 0, d, 0, 0);
  jctx.fillStyle = "#04070d";
  jctx.fillRect(0, 0, jcw, jch);
  jctx.save();
  jctx.transform(jScale(), 0, 0, jScale(), jview.ox, jview.oy);
  if (satReady) {
    const needPx = jScale() * d * PROJ_W;
    const mip = satMips.find(m => m.width >= needPx) || satMips[satMips.length - 1];
    jctx.drawImage(mip, 0, 0, mip.width, mip.height, 0, 0, PROJ_W, PROJ_H);
    jctx.fillStyle = "rgba(4,7,13,.35)"; // dim so pins pop
    jctx.fillRect(0, 0, PROJ_W, PROJ_H);
  } else {
    jctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--land");
    jctx.fill(landPath);
  }
  jctx.restore();

  const k = uiK();
  for (const p of profilePins) {
    const [gx, gy] = jToScreen(p.glat, p.glon);
    const [ax, ay] = jToScreen(p.alat, p.alon);
    jctx.setLineDash([4, 4]);
    jctx.beginPath();
    jctx.moveTo(gx, gy);
    jctx.lineTo(ax, ay);
    jctx.strokeStyle = p.correct ? "rgba(255,210,61,.5)" : "rgba(229,83,61,.45)";
    jctx.lineWidth = 1.2 * k;
    jctx.stroke();
    jctx.setLineDash([]);
    jctx.beginPath();
    jctx.arc(gx, gy, 2.6 * k, 0, 2 * Math.PI);
    jctx.fillStyle = "#e5533d";
    jctx.fill();
    jctx.beginPath();
    jctx.arc(ax, ay, 3.4 * k, 0, 2 * Math.PI);
    jctx.fillStyle = "#43b649";
    jctx.fill();
    jctx.strokeStyle = "rgba(0,0,0,.5)";
    jctx.lineWidth = 1;
    jctx.stroke();
  }
}

const jTouches = new Map();
let jPinchDist = 0;

function applyJourneyZoom(factor, mx, my) {
  const newZoom = Math.min(MAP_MAX_ZOOM, Math.max(1, jview.zoom * factor));
  const f = newZoom / jview.zoom;
  jview.ox = mx - (mx - jview.ox) * f;
  jview.oy = my - (my - jview.oy) * f;
  jview.zoom = newZoom;
  clampJourney();
  drawJourney();
}

jCanvas.addEventListener("pointerdown", e => {
  jTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { jCanvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic/stale pointer */ }
  if (jTouches.size === 2) {
    jDrag = null;
    const [a, b] = [...jTouches.values()];
    jPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  } else if (jTouches.size === 1) {
    jDrag = { x: e.clientX, y: e.clientY, ox: jview.ox, oy: jview.oy };
  }
});
jCanvas.addEventListener("pointermove", e => {
  if (!jTouches.has(e.pointerId)) return;
  jTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (jTouches.size === 2) {
    const [a, b] = [...jTouches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (jPinchDist > 0 && d > 0) {
      const rect = jCanvas.getBoundingClientRect();
      applyJourneyZoom(d / jPinchDist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
    }
    jPinchDist = d;
    return;
  }
  if (!jDrag) return;
  jview.ox = jDrag.ox + e.clientX - jDrag.x;
  jview.oy = jDrag.oy + e.clientY - jDrag.y;
  clampJourney();
  drawJourney();
});
function jPointerEnd(e) {
  jTouches.delete(e.pointerId);
  jPinchDist = 0;
  jDrag = null;
}
jCanvas.addEventListener("pointerup", jPointerEnd);
jCanvas.addEventListener("pointercancel", jPointerEnd);
jCanvas.addEventListener("wheel", e => {
  e.preventDefault();
  const rect = jCanvas.getBoundingClientRect();
  applyJourneyZoom(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });

function computeStats(pins) {
  const games = new Set(pins.map(p => p.game_id)).size;
  const rounds = pins.length;
  const correct = pins.filter(p => p.correct).length;
  const totalPts = pins.reduce((s, p) => s + (p.points || 0), 0);
  const avgKm = rounds ? Math.round(pins.reduce((s, p) => s + p.km, 0) / rounds) : 0;
  const byGenre = {};
  for (const p of pins) {
    const g = byGenre[p.genre] = byGenre[p.genre] || { rounds: 0, correct: 0, km: 0, pts: 0 };
    g.rounds++; g.correct += p.correct ? 1 : 0; g.km += p.km; g.pts += p.points || 0;
  }
  const rows = Object.entries(byGenre).map(([genre, g]) => ({
    genre, rounds: g.rounds,
    pct: Math.round(g.correct / g.rounds * 100),
    avgKm: Math.round(g.km / g.rounds),
    pts: g.pts,
  })).sort((x, y) => y.pct - x.pct || y.pts - x.pts);
  return { games, rounds, correct, totalPts, avgKm, rows };
}

function renderStats(pins) {
  const box = $("profile-stats");
  if (pins.length === 0) {
    box.innerHTML = `<p class="stats-empty">No pins yet — play some rounds and the map fills in!</p>`;
    return;
  }
  const s = computeStats(pins);
  const best = s.rows[0], worst = s.rows[s.rows.length - 1];
  const icon = g => (GENRES.find(x => x.name === g) || {}).icon || "";
  let html = `<div class="stat-tiles">` +
    `<div class="stat-tile"><b>${s.games}</b><span>games</span></div>` +
    `<div class="stat-tile"><b>${s.rounds}</b><span>rounds</span></div>` +
    `<div class="stat-tile"><b>${Math.round(s.correct / s.rounds * 100)}%</b><span>trivia correct</span></div>` +
    `<div class="stat-tile"><b>${s.avgKm.toLocaleString()}</b><span>avg km off</span></div>` +
    `<div class="stat-tile"><b>${s.totalPts.toLocaleString()}</b><span>total points</span></div>` +
    `</div>`;
  if (s.rows.length > 1) {
    html += `<p class="stat-verdict">Best category: <b>${icon(best.genre)} ${best.genre}</b> (${best.pct}%) · ` +
      `Needs work: <b>${icon(worst.genre)} ${worst.genre}</b> (${worst.pct}%)</p>`;
  }
  html += `<table class="end-table"><thead><tr><th>Genre</th><th>Rounds</th><th>Correct</th><th>Avg dist</th><th>Pts</th></tr></thead><tbody>`;
  for (const r of s.rows) {
    html += `<tr><td>${icon(r.genre)} ${r.genre}</td><td>${r.rounds}</td><td>${r.pct}%</td>` +
      `<td>${r.avgKm.toLocaleString()} km</td><td class="pts">${r.pts.toLocaleString()}</td></tr>`;
  }
  html += `</tbody></table>`;
  box.innerHTML = html;
}

async function loadProfile(name, isMe) {
  const chips = [...document.querySelectorAll("#profile-chips .p-chip")];
  chips.forEach(c => c.classList.toggle("active", c.dataset.name === (isMe ? "" : name)));
  $("profile-stats").innerHTML = `<p class="stats-empty">Loading…</p>`;
  profilePins = [];
  drawJourney();
  // badge for whoever we're viewing
  const badgeBox = $("profile-badge");
  if (isMe) {
    const info = levelInfo(getXP());
    badgeBox.innerHTML = badgeSVG(info.level, 40) + `<span>Lv ${info.level}</span>`;
  } else {
    badgeBox.innerHTML = "";
    fetchLevels([name]).then(l => {
      if (l[name]) badgeBox.innerHTML = badgeSVG(l[name], 40) + `<span>Lv ${l[name]}</span>`;
    });
  }
  let pins = null;
  if (isMe) {
    pins = (backendReady() && store.getName()) ? await fetchPins(store.getName()) : null;
    if (!pins || pins.length === 0) {
      const local = getLocalPins();
      if (local.length > (pins || []).length) pins = local;
    }
  } else {
    pins = await fetchPins(name);
  }
  profilePins = pins || [];
  drawJourney();
  renderStats(profilePins);
}

// Map and stats are alternate views — one at a time keeps the screen clean
function setProfileView(v) {
  $("tab-map").classList.toggle("active", v === "map");
  $("tab-stats").classList.toggle("active", v === "stats");
  $("journey-wrap").classList.toggle("hidden", v !== "map");
  $("profile-scroll").classList.toggle("hidden", v !== "stats");
  if (v === "map") {
    sizeJourney();
    clampJourney();
    drawJourney();
  }
}

async function openProfile() {
  show("screen-profile");
  setProfileView("map");
  resetJourneyView();
  drawJourney();
  const friends = await fetchFriends();
  const box = $("profile-chips");
  box.innerHTML = "";
  const mkChip = (label, name, isMe) => {
    const b = document.createElement("button");
    b.className = "p-chip";
    b.dataset.name = isMe ? "" : name;
    b.textContent = label;
    b.addEventListener("click", () => loadProfile(name, isMe));
    box.appendChild(b);
  };
  mkChip("Me", store.getName(), true);
  friends.forEach(f => mkChip(f, f, false));
  loadProfile(store.getName(), true);
}

// ---------- Challenge sharing ----------
function challengeUrl() {
  const name = encodeURIComponent(store.getName() || "Explorer");
  return `${location.origin}${location.pathname}?c=${state.seed.toString(36)}&n=${name}&s=${state.score}`;
}

function shareChallenge() {
  copyLink(challengeUrl(), $("btn-share"),
    "✔ Link copied — send it!", "Copy your challenge link:", "⚔️ Challenge a friend");
}

function shareInvite() {
  const btn = $("btn-invite");
  if (!store.getName()) {
    btn.textContent = "Set your explorer name on the home screen first!";
    setTimeout(() => { btn.textContent = "🔗 Copy invite link"; }, 2500);
    return;
  }
  copyLink(inviteUrl(), btn,
    "✔ Copied — friends click it to add you!", "Copy your invite link:", "🔗 Copy invite link");
}

// ---------- Wire up ----------
const nameInput = $("name-input");
nameInput.value = store.getName();
nameInput.addEventListener("input", () => store.setName(nameInput.value.trim()));
// typing an existing name = signing in on this device: pull that name's XP
nameInput.addEventListener("change", syncXP);
nameInput.addEventListener("keydown", e => { if (e.key === "Enter") startGame(); });

// Daily button reflects whether today's run was already submitted
function updateDailyButton() {
  const played = localStorage.getItem("sp-daily-" + utcDay());
  const date = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  $("btn-daily").innerHTML = played !== null
    ? `🌍 Daily · ${date} — done: <b>${(+played).toLocaleString()}</b> <span class="daily-note">(replays don't submit)</span>`
    : `🌍 Daily Challenge · ${date}`;
}

$("btn-start").addEventListener("click", () => startGame("free"));
$("btn-again").addEventListener("click", () => startGame(state.mode));
$("btn-daily").addEventListener("click", () => startGame("daily"));
$("btn-boards").addEventListener("click", openBoards);
$("btn-boards-back").addEventListener("click", () => { updateDailyButton(); show("screen-start"); });
$("btn-home").addEventListener("click", () => { updateDailyButton(); show("screen-start"); });
$("btn-add-friend").addEventListener("click", addFriend);
$("friend-input").addEventListener("keydown", e => { if (e.key === "Enter") addFriend(); });
$("btn-invite").addEventListener("click", shareInvite);
$("btn-profile").addEventListener("click", openProfile);
$("btn-profile-back").addEventListener("click", () => { updateDailyButton(); show("screen-start"); });
$("tab-map").addEventListener("click", () => setProfileView("map"));
$("tab-stats").addEventListener("click", () => setProfileView("stats"));
window.addEventListener("resize", () => {
  if ($("screen-profile").classList.contains("hidden")) return;
  if ($("journey-wrap").classList.contains("hidden")) return;
  sizeJourney();
  clampJourney();
  drawJourney();
});
$("btn-home").addEventListener("click", updateHomeBadge);
$("btn-boards-back").addEventListener("click", updateHomeBadge);
$("btn-profile-back").addEventListener("click", updateHomeBadge);
showFriendRequest();
updateDailyButton();
updateHomeBadge();
syncXP(); // returning player on a new device? pull their progress down
$("btn-spin").addEventListener("click", spinWheel);
$("btn-confirm").addEventListener("click", confirmGuess);
$("btn-next").addEventListener("click", nextRound);
$("btn-share").addEventListener("click", shareChallenge);

// Incoming challenge? Show who threw down the gauntlet on the start screen
if (activeChallenge) {
  const b = $("challenge-banner");
  b.classList.remove("hidden");
  b.innerHTML = `⚔️ <b>${activeChallenge.name.replace(/</g, "&lt;")}</b> challenged you!` +
    ` Beat <b>${activeChallenge.score.toLocaleString()}</b> on their exact run.`;
  $("btn-start").textContent = "Accept Challenge";
}

buildLandPath();
drawWheel();
