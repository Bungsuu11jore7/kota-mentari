// KOTA MENTARI — modul HUD (tampilan layar + minimap + toast).
// API module-level: initHud, showScreen, drawHud, showToast, clearToasts,
// getCurrentScreen. Nama layar: 'start' | 'playing' | 'paused' | 'complete' | 'busted'.
// Teks objective SELALU dibaca dari keadaan misi aktif pada tiap frame —
// tidak pernah di-cache sekali di awal.

const SAVE_KEY = "kota-mentari-save";
const WORLD_HALF = 520;

let callbacks = null;
let currentScreen = "start";
let lastSnapshot = null;
let toastTimer = null;
const toastQueue = [];

const $ = (id) => document.getElementById(id);

function screenEl(name) {
  if (name === "start") return $("screen-start");
  if (name === "paused") return $("screen-paused");
  if (name === "complete") return $("screen-complete");
  if (name === "busted") return $("screen-busted");
  return null;
}

function hideAllScreens() {
  for (const name of ["start", "paused", "complete", "busted"]) {
    const el = screenEl(name);
    if (el) el.classList.add("hidden");
  }
  const hud = $("hud");
  if (hud) hud.classList.add("hidden");
}

// SATU fungsi manajer layar: sembunyikan SEMUA elemen dulu, baru tampilkan yang diminta.
export function showScreen(name, data) {
  currentScreen = name;
  hideAllScreens();
  if (name === "playing") {
    const hud = $("hud");
    if (hud) hud.classList.remove("hidden");
    return;
  }
  const el = screenEl(name);
  if (!el) return;
  if (name === "start") {
    const cont = $("btn-continue");
    let hasSave = false;
    try { hasSave = !!localStorage.getItem(SAVE_KEY); } catch (_e) { hasSave = false; }
    if (cont) cont.classList.toggle("hidden", !hasSave);
  }
  if (name === "complete") {
    const money = (data && (data.uang ?? data.money)) ??
      (lastSnapshot && lastSnapshot.player && (lastSnapshot.player.uang ?? lastSnapshot.player.money)) ?? 0;
    const moneyEl = $("complete-money");
    if (moneyEl) moneyEl.textContent = "$" + Math.floor(money).toLocaleString("en-US");
    const objEl = $("complete-objective");
    if (objEl) objEl.textContent = "Semua misi selesai!";
    drawCompleteMinimap();
  }
  el.classList.remove("hidden");
}

export function getCurrentScreen() {
  return currentScreen;
}

export function initHud(cb) {
  callbacks = cb || {};
  const bind = (id, fn) => {
    const el = $(id);
    if (el && typeof fn === "function") el.addEventListener("click", fn);
  };
  bind("btn-start", () => callbacks.onStart && callbacks.onStart());
  bind("btn-continue", () => callbacks.onContinue && callbacks.onContinue());
  bind("btn-resume", () => callbacks.onResume && callbacks.onResume());
  bind("btn-retry", () => callbacks.onRetry && callbacks.onRetry());
  bind("btn-play-again", () => callbacks.onPlayAgain && callbacks.onPlayAgain());
  bind("btn-quit-pause", () => callbacks.onQuitToMenu && callbacks.onQuitToMenu());
  bind("btn-quit-busted", () => callbacks.onQuitToMenu && callbacks.onQuitToMenu());
  bind("btn-quit-complete", () => callbacks.onQuitToMenu && callbacks.onQuitToMenu());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && currentScreen === "start" && callbacks.onStart) {
      callbacks.onStart();
    }
  });
  showScreen("start");
}

// ---- Objective: dibaca segar dari keadaan misi aktif SETIAP frame ----
function missionObjectOf(snapshot) {
  if (!snapshot) return null;
  const ms = snapshot.missionState ?? snapshot.mission ?? snapshot.state?.mission ?? null;
  if (!ms) return null;
  if (typeof ms === "object" && Array.isArray(ms.missions)) {
    const idx = typeof ms.current === "number" ? ms.current : 0;
    return ms.missions[idx] || ms.missions[0] || null;
  }
  if (typeof ms === "object" && (ms.objective || ms.text || ms.title || ms.name)) return ms;
  if (typeof ms === "object" && ms.currentMission) return ms.currentMission;
  if (typeof ms === "object" && typeof ms.current === "number" && Array.isArray(snapshot.missions)) {
    return snapshot.missions[ms.current] || null;
  }
  return null;
}

function objectiveTextOf(snapshot) {
  if (!snapshot) return "Mulai petualanganmu di Kota Mentari.";
  if (typeof snapshot.objective === "string" && snapshot.objective) return snapshot.objective;
  const m = missionObjectOf(snapshot);
  if (m) {
    if (typeof m.objective === "string" && m.objective) return m.objective;
    if (typeof m.text === "string" && m.text) return m.text;
    if (typeof m.description === "string" && m.description) return m.description;
    if (typeof m.title === "string" && m.title) return m.title;
    if (typeof m.name === "string" && m.name) return m.name;
  }
  const ms = snapshot.missionState;
  if (ms && typeof ms.objectiveText === "string" && ms.objectiveText) return ms.objectiveText;
  if (ms && typeof ms.current === "number") {
    const names = ["Paket Kilat", "Mobil Pinjaman", "Kejar Bayangan", "Tolong Mira", "Brankas Pelabuhan", "Jalan Pulang"];
    return names[ms.current] || "Selesaikan misi.";
  }
  return "Selesaikan misi.";
}

function missionTitleOf(snapshot) {
  const m = missionObjectOf(snapshot);
  if (m && typeof m.title === "string" && m.title) return m.title.toUpperCase();
  if (m && typeof m.name === "string" && m.name) return m.name.toUpperCase();
  const ms = snapshot.missionState;
  if (ms && typeof ms.current === "number") {
    const names = ["Paket Kilat", "Mobil Pinjaman", "Kejar Bayangan", "Tolong Mira", "Brankas Pelabuhan", "Jalan Pulang"];
    return (names[ms.current] || "MISI").toUpperCase();
  }
  return "MISI";
}

function markerOf(snapshot) {
  if (!snapshot) return null;
  if (snapshot.marker && typeof snapshot.marker.x === "number") return snapshot.marker;
  if (snapshot.target && typeof snapshot.target.x === "number") return snapshot.target;
  const ms = snapshot.missionState ?? snapshot.mission ?? null;
  if (ms && ms.marker && typeof ms.marker.x === "number") return ms.marker;
  const m = missionObjectOf(snapshot);
  if (m && m.marker && typeof m.marker.x === "number") return m.marker;
  if (m && typeof m.x === "number" && typeof m.z === "number") return m;
  return null;
}

function drawMinimapOn(canvas, snapshot) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#0a1420";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo((w / 6) * i, 0); ctx.lineTo((w / 6) * i, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, (h / 6) * i); ctx.lineTo(w, (h / 6) * i); ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N", w / 2, 15);
  const toMap = (x, z) => [
    ((x + WORLD_HALF) / (WORLD_HALF * 2)) * w,
    ((z + WORLD_HALF) / (WORLD_HALF * 2)) * h,
  ];
  const marker = markerOf(snapshot);
  if (marker) {
    const [mx, my] = toMap(marker.x, marker.z);
    ctx.fillStyle = "#ffd75e";
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }
  const police = snapshot.police || snapshot.policeState?.units || [];
  if (Array.isArray(police)) {
    ctx.fillStyle = "#ff4444";
    for (const u of police) {
      if (!u || typeof u.x !== "number") continue;
      const [px, py] = toMap(u.x, u.z ?? 0);
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
  const player = snapshot.player;
  if (player && typeof player.x === "number") {
    const [px, py] = toMap(player.x, player.z ?? 0);
    const angle = typeof snapshot.playerAngle === "number" ? snapshot.playerAngle : 0;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawCompleteMinimap() {
  drawMinimapOn($("complete-minimap"), lastSnapshot || {});
}

// ---- Toast: antrean dengan pewaktu sendiri, render langsung ----
function renderToasts() {
  const box = $("toast-container");
  if (!box) return;
  box.innerHTML = "";
  for (const text of toastQueue) {
    const div = document.createElement("div");
    div.className = "toast";
    div.textContent = text;
    box.appendChild(div);
  }
}

function scheduleToastClear() {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastQueue.shift();
    renderToasts();
    if (toastQueue.length > 0) scheduleToastClear();
  }, 3500);
}

export function showToast(text) {
  if (!text) return;
  toastQueue.push(String(text));
  if (toastQueue.length > 3) toastQueue.shift();
  renderToasts();
  scheduleToastClear();
}

export function clearToasts() {
  toastQueue.length = 0;
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  renderToasts();
}

// ---- Gambar HUD tiap frame: perbarui SEMUA elemen ----
export function drawHud(snapshot) {
  if (!snapshot) return;
  lastSnapshot = snapshot;
  if (currentScreen !== "playing") return;
  const hud = $("hud");
  if (hud) hud.classList.remove("hidden");

  const player = snapshot.player || {};
  const speed = snapshot.speedKmh ?? snapshot.speed ?? 0;
  const speedEl = $("speed");
  if (speedEl) speedEl.innerHTML = Math.round(speed) + " <small>km/jam</small>";

  const money = player.uang ?? player.money ?? snapshot.uang ?? snapshot.money ?? 0;
  const moneyEl = $("money");
  if (moneyEl) moneyEl.textContent = "$" + Math.floor(money).toLocaleString("en-US");

  const health = player.health ?? player.nyawa ?? 100;
  const maxHealth = player.maxHealth ?? player.maxNyawa ?? 100;
  const fill = $("health-fill");
  if (fill) fill.style.width = Math.max(0, Math.min(100, (health / maxHealth) * 100)) + "%";

  const weapon = player.weapon ?? player.senjata ?? "Tinju";
  const weaponEl = $("weapon");
  if (weaponEl) weaponEl.textContent = weapon;

  const wanted = snapshot.policeState?.wanted ?? snapshot.wanted ?? 0;
  const stars = document.querySelectorAll("#wanted .star");
  stars.forEach((star) => {
    const n = Number(star.getAttribute("data-star"));
    star.classList.toggle("lit", n <= wanted);
  });

  // Objective dibaca segar dari misi aktif setiap frame — tanpa cache.
  const titleEl = $("mission-title");
  if (titleEl) titleEl.textContent = missionTitleOf(snapshot);
  const textEl = $("mission-text");
  if (textEl) textEl.textContent = objectiveTextOf(snapshot);

  drawMinimapOn($("minimap"), snapshot);

  if (typeof snapshot.toast === "string" && snapshot.toast) showToast(snapshot.toast);
}
