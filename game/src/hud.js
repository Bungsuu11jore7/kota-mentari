// KOTA MENTARI — modul HUD (layar, panel status, minimap, toast).
// API module-level (BEKU): initHud, showScreen, drawHud, showToast,
// clearToasts, getCurrentScreen. HUD hanya menampilkan — tanpa logika game.

const SAVE_KEY = "kota-mentari-save";
const TOAST_MS = 3200;
const WORLD_EXTENT = 550;
const SCREEN_IDS = {
  start: "screen-start",
  paused: "screen-paused",
  complete: "screen-complete",
  busted: "screen-busted",
};

let currentScreen = "start";
let callbacks = {};
let hudReady = false;
let lastMoney = 0;
let lastSnapshot = null;
const toastTimers = [];

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function formatMoney(value) {
  return "$" + Math.floor(Number(value) || 0).toLocaleString("id-ID");
}

function weaponLabel(value) {
  const map = { fist: "Tinju", tinju: "Tinju", pistol: "Pistol" };
  if (typeof value === "string" && value.length > 0) {
    const key = value.toLowerCase();
    if (map[key]) return map[key];
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return "Tinju";
}

function posOf(unit) {
  if (!unit) return null;
  if (Number.isFinite(unit.x) && Number.isFinite(unit.z)) {
    return { x: unit.x, z: unit.z };
  }
  const p = unit.position || unit.pos;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
    return { x: p.x, z: p.z };
  }
  return null;
}

// Misi aktif — SELALU dibaca segar dari keadaan misi saat itu (tanpa cache).
function activeMission(state) {
  if (!state || typeof state !== "object") return null;
  if (typeof state.getActiveMission === "function") {
    try {
      const m = state.getActiveMission();
      if (m) return m;
    } catch (err) {
      // Misi tidak tersedia — jatuh ke bentuk keadaan lain di bawah.
    }
  }
  if (state.activeMission) return state.activeMission;
  if (Array.isArray(state.missions) && Number.isInteger(state.current)) {
    return state.missions[state.current] || null;
  }
  if (state.current && typeof state.current === "object") return state.current;
  return null;
}

function missionTitle(state) {
  const m = activeMission(state);
  if (m) {
    if (typeof m === "string") return m;
    if (typeof m.title === "string") return m.title;
    if (typeof m.name === "string") return m.name;
  }
  if (state && typeof state.title === "string") return state.title;
  return "Misi";
}

function missionObjective(state) {
  const m = activeMission(state);
  if (m) {
    if (typeof m === "string") return m;
    if (typeof m.objective === "string") return m.objective;
    if (typeof m.text === "string") return m.text;
    if (typeof m.description === "string") return m.description;
    if (typeof m.title === "string") return m.title;
    if (typeof m.name === "string") return m.name;
  }
  if (state && typeof state.objective === "string") return state.objective;
  return "Selesaikan misi di Kota Mentari.";
}

function markerOf(snapshot) {
  const fromState = (state) => {
    if (!state || typeof state !== "object") return null;
    if (state.marker) return posOf(state.marker);
    if (state.target) return posOf(state.target);
    const m = activeMission(state);
    if (m && typeof m === "object") {
      if (m.target) return posOf(m.target);
      if (m.marker) return posOf(m.marker);
      if (m.position) return posOf(m.position);
      if (Number.isFinite(m.x) && Number.isFinite(m.z)) return { x: m.x, z: m.z };
    }
    return null;
  };
  return (
    posOf(snapshot.marker) ||
    posOf(snapshot.target) ||
    fromState(snapshot.missionState) ||
    fromState(snapshot.missions) ||
    null
  );
}

function drawMinimap(canvas, snapshot) {
  if (!canvas || !snapshot) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0d1b12";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  const step = w / 8;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(w, i * step);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("N", w / 2 - 4, 13);
  const toMap = (x, z) => [
    ((x + WORLD_EXTENT) / (2 * WORLD_EXTENT)) * w,
    ((z + WORLD_EXTENT) / (2 * WORLD_EXTENT)) * h,
  ];
  const marker = markerOf(snapshot);
  if (marker) {
    const [mx, my] = toMap(marker.x, marker.z);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(mx, my - 6);
    ctx.lineTo(mx + 6, my);
    ctx.lineTo(mx, my + 6);
    ctx.lineTo(mx - 6, my);
    ctx.closePath();
    ctx.fill();
  }
  const police = snapshot.police || snapshot.policeState?.units || [];
  if (Array.isArray(police)) {
    ctx.fillStyle = "#ff4d4d";
    for (const unit of police) {
      const p = posOf(unit);
      if (!p) continue;
      const [px, py] = toMap(p.x, p.z);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const playerPos = posOf(snapshot.player);
  if (playerPos) {
    const [px, py] = toMap(playerPos.x, playerPos.z);
    const angle = Number(snapshot.playerAngle) || 0;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - angle);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function paintStars(wanted) {
  const box = el("wanted-stars");
  if (!box) return;
  const stars = box.children;
  for (let i = 0; i < stars.length; i++) {
    if (i < wanted) stars[i].classList.add("on");
    else stars[i].classList.remove("on");
  }
}

function refreshContinueButton() {
  const btn = el("btn-continue");
  if (!btn) return;
  let hasSave = false;
  try {
    hasSave = window.localStorage.getItem(SAVE_KEY) !== null;
  } catch (err) {
    hasSave = false;
  }
  btn.style.display = hasSave ? "" : "none";
}

function fillCompleteScreen(data) {
  const money =
    data?.uang ?? data?.money ?? data?.finalMoney ?? lastMoney ?? 0;
  setText("final-money", formatMoney(money));
  setText("complete-objective", "Semua misi selesai!");
  drawMinimap(el("complete-minimap"), lastSnapshot);
}

function showScreen(name, data) {
  if (!SCREEN_IDS[name] && name !== "playing") return;
  currentScreen = name;
  const hud = el("hud");
  for (const [key, id] of Object.entries(SCREEN_IDS)) {
    const node = el(id);
    if (node) node.style.display = key === name ? "flex" : "none";
  }
  if (hud) hud.style.display = name === "playing" ? "block" : "none";
  if (name === "start") refreshContinueButton();
  if (name === "complete") fillCompleteScreen(data);
}

function drawHud(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  lastSnapshot = snapshot;
  const hud = el("hud");
  if (hud && currentScreen === "playing") hud.style.display = "block";
  const player = snapshot.player || {};
  const money =
    player.uang ?? player.money ?? snapshot.uang ?? snapshot.money ?? lastMoney;
  lastMoney = Number(money) || 0;
  setText("money-value", Math.floor(lastMoney).toLocaleString("id-ID"));
  const health = clampNumber(
    player.nyawa ?? player.health ?? snapshot.health ?? 100,
    0,
    100,
  );
  const fill = el("health-fill");
  if (fill) fill.style.width = health + "%";
  setText("health-text", String(Math.round(health)));
  setText(
    "weapon-name",
    weaponLabel(player.weapon ?? player.senjata ?? snapshot.weapon),
  );
  const wanted = Math.round(
    clampNumber(
      snapshot.policeState?.wanted ??
        snapshot.policeState?.level ??
        snapshot.wanted ??
        0,
      0,
      5,
    ),
  );
  paintStars(wanted);
  const speed = snapshot.speedKmh ?? snapshot.speed ?? player.speedKmh ?? 0;
  setText("speed-value", String(Math.max(0, Math.round(Number(speed) || 0))));
  setText("mission-title", (snapshot.mission && snapshot.mission.name) || missionTitle(snapshot.missionState));
  setText("mission-objective", (typeof snapshot.objective === "string" && snapshot.objective) || missionObjective(snapshot.missionState));
  drawMinimap(el("minimap"), snapshot);
}

function showToast(text) {
  if (text === undefined || text === null) return;
  const box = el("toast-container");
  if (!box) return;
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = String(text);
  box.appendChild(node);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  const timer = setTimeout(() => {
    node.remove();
  }, TOAST_MS);
  toastTimers.push(timer);
}

function clearToasts() {
  const box = el("toast-container");
  if (box) box.innerHTML = "";
  for (const timer of toastTimers) clearTimeout(timer);
  toastTimers.length = 0;
}

function getCurrentScreen() {
  return currentScreen;
}

function bind(id, handler) {
  const node = el(id);
  if (node) node.addEventListener("click", handler);
}

function initHud(cb) {
  callbacks = cb || {};
  if (hudReady) return;
  hudReady = true;
  bind("btn-start", () => callbacks.onStart?.());
  bind("btn-continue", () => callbacks.onContinue?.());
  bind("btn-resume", () => callbacks.onResume?.());
  bind("btn-retry", () => callbacks.onRetry?.());
  bind("btn-play-again", () => callbacks.onPlayAgain?.());
  bind("btn-quit-paused", () => callbacks.onQuitToMenu?.());
  bind("btn-quit-busted", () => callbacks.onQuitToMenu?.());
  bind("btn-quit-complete", () => callbacks.onQuitToMenu?.());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && currentScreen === "start") {
      callbacks.onStart?.();
    }
  });
  refreshContinueButton();
}

export { initHud, showScreen, drawHud, showToast, clearToasts, getCurrentScreen };
