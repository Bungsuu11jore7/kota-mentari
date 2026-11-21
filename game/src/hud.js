// KOTA MENTARI — HUD: manajer layar, nilai game, minimap, dan toast.
// Modul ini hanya menyentuh DOM. Ia tidak membaca variabel global game:
// semua keadaan masuk lewat argumen (cuplikan) di setiap pemanggilan.

const MISSIONS = [
  { title: "Paket Kilat", text: "Antar 3 paket ke penanda kuning di Menara." },
  { title: "Mobil Pinjaman", text: "Curi mobil oranye di (100, 0), lalu bawa ke Pesisir." },
  { title: "Kejar Bayangan", text: "Kejar target yang melarikan diri sampai ke Pesisir." },
  { title: "Tolong Mira", text: "Selamatkan Mira di (-200, 100) dari 3 penyerang." },
  { title: "Brankas Pelabuhan", text: "Ambil brankas di Pelabuhan (400, 300)." },
  { title: "Jalan Pulang", text: "Kabur ke kapal di dermaga (470, 350)." },
];

const SCREEN_IDS = ["screen-start", "screen-pause", "screen-gameover", "screen-busted"];
const TOAST_MS = 3200;
const WORLD_MIN = -550;
const WORLD_MAX = 550;

const elCache = {};
let startCallback = null;
let currentScreen = "start";
let toastQueue = [];
let toastTimer = null;
let lastToastText = "";
let minimapCtx = null;

function getEl(id) {
  if (elCache[id]) return elCache[id];
  if (typeof document === "undefined") return null;
  const found = document.getElementById(id);
  if (found) elCache[id] = found;
  return found;
}

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function asNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampInt(value, min, max) {
  const n = Math.round(asNumber(value, min));
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function posOf(thing) {
  if (!thing || typeof thing !== "object") return null;
  if (typeof thing.x === "number" && typeof thing.z === "number") {
    return { x: thing.x, z: thing.z };
  }
  const inner = thing.position || thing.pos;
  if (inner && typeof inner.x === "number" && typeof inner.z === "number") {
    return { x: inner.x, z: inner.z };
  }
  return null;
}

function formatMoney(value) {
  const n = Math.floor(asNumber(value, 0));
  return n.toLocaleString("id-ID");
}

function playerHeadingOf(snapshot, player) {
  const fromSnap = pick(snapshot, ["sudutPemain", "sudut pemain", "heading", "sudut", "angle", "playerHeading"]);
  if (typeof fromSnap === "number") return fromSnap;
  if (player) {
    const fromPlayer = pick(player, ["heading", "angle", "sudut", "rotationY"]);
    if (typeof fromPlayer === "number") return fromPlayer;
  }
  return 0;
}

function missionIndexOf(missionState) {
  if (!missionState || typeof missionState !== "object") return -1;
  const direct = pick(missionState, ["current", "mission", "index", "nomor"]);
  if (typeof direct === "number") return direct;
  return -1;
}

function objectiveOf(missionState) {
  const fallback = { title: "KOTA MENTARI", text: "Jelajahi kota, cari penanda misi berikutnya." };
  if (!missionState || typeof missionState !== "object") return fallback;
  const active = pick(missionState, ["active", "mission"]);
  if (active && typeof active === "object") {
    const name = pick(active, ["nama", "name", "title", "judul"]);
    const desc = pick(active, ["objective", "text", "deskripsi", "description", "tujuan"]);
    if (typeof name === "string" || typeof desc === "string") {
      return {
        title: typeof name === "string" && name ? name : fallback.title,
        text: typeof desc === "string" && desc ? desc : "",
      };
    }
  }
  const directText = pick(missionState, ["objective", "text", "deskripsi", "description", "tujuan"]);
  const idx = missionIndexOf(missionState);
  if (typeof directText === "string" && directText) {
    const title = idx >= 0 && idx < MISSIONS.length ? MISSIONS[idx].title : fallback.title;
    return { title: title, text: directText };
  }
  if (idx >= 0 && idx < MISSIONS.length) {
    let text = MISSIONS[idx].text;
    const done = pick(missionState, ["terantar", "delivered", "paketTerantar", "done", "count", "selesai"]);
    const total = pick(missionState, ["total", "target", "targetCount", "jumlah"]);
    if (typeof done === "number" && typeof total === "number") {
      text += " (" + done + " dari " + total + " terantar)";
    }
    return { title: MISSIONS[idx].title, text: text };
  }
  return fallback;
}

// Manajer layar: satu-satunya jalan ganti layar. Selalu sembunyikan semua
// layar dulu, baru tampilkan yang diminta.
export function hideScreens() {
  hideToast();
  for (const id of SCREEN_IDS) {
    const node = getEl(id);
    if (node) node.style.display = "none";
  }
  const hud = getEl("hud");
  if (hud) hud.style.display = "none";
  currentScreen = "none";
}

function showOnly(id) {
  hideScreens();
  const node = getEl(id);
  if (node) node.style.display = "flex";
  currentScreen = id;
}

export function showStart() {
  showOnly("screen-start");
}

export function showPause() {
  showOnly("screen-pause");
}

export function showGameOver(statsText) {
  showOnly("screen-gameover");
  if (typeof statsText === "string") {
    const stats = getEl("gameover-stats");
    if (stats) stats.textContent = statsText;
  }
}

export function showBusted(statsText) {
  showOnly("screen-busted");
  if (typeof statsText === "string") {
    const stats = getEl("busted-stats");
    if (stats) stats.textContent = statsText;
  }
}

// Toast: antrean dengan pewaktu sendiri. showToast langsung merender,
// tanpa menunggu misi atau frame berikutnya.
function renderToast() {
  const toast = getEl("toast");
  if (!toast) return;
  if (toastQueue.length === 0) {
    toast.style.display = "none";
    toast.textContent = "";
    return;
  }
  toast.textContent = toastQueue[0];
  toast.style.display = "block";
}

function scheduleToast() {
  if (toastTimer !== null) return;
  toastTimer = setTimeout(function () {
    toastTimer = null;
    toastQueue.shift();
    renderToast();
    if (toastQueue.length > 0) scheduleToast();
  }, TOAST_MS);
}

export function showToast(message) {
  if (typeof message !== "string" || message.length === 0) return;
  toastQueue.push(message);
  renderToast();
  scheduleToast();
}

export function hideToast() {
  toastQueue = [];
  if (toastTimer !== null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  const toast = getEl("toast");
  if (toast) {
    toast.style.display = "none";
    toast.textContent = "";
  }
}

function minimapPoint(x, z, size) {
  const span = WORLD_MAX - WORLD_MIN;
  const cx = ((x - WORLD_MIN) / span) * size;
  const cy = ((z - WORLD_MIN) / span) * size;
  return {
    x: Math.max(0, Math.min(size, cx)),
    y: Math.max(0, Math.min(size, cy)),
  };
}

export function drawMinimap(snapshot) {
  const canvas = getEl("minimap");
  if (!canvas || typeof canvas.getContext !== "function") return;
  if (!minimapCtx) minimapCtx = canvas.getContext("2d");
  const ctx = minimapCtx;
  if (!ctx) return;
  const snap = snapshot || {};
  const size = canvas.width || 160;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#10222e";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  for (let w = WORLD_MIN; w <= WORLD_MAX; w += 100) {
    const px = minimapPoint(w, 0, size).x;
    const pz = minimapPoint(0, w, size).y;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pz);
    ctx.lineTo(size, pz);
    ctx.stroke();
  }
  const missionState = pick(snap, ["keadaanMisi", "keadaan misi", "missionState", "misi"]);
  const markerRaw = missionState
    ? pick(missionState, ["marker", "target", "targetPos", "posisi", "position", "pos"])
    : pick(snap, ["marker"]);
  const marker = posOf(markerRaw);
  if (marker) {
    const p = minimapPoint(marker.x, marker.z, size);
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 6);
    ctx.lineTo(p.x + 6, p.y);
    ctx.lineTo(p.x, p.y + 6);
    ctx.lineTo(p.x - 6, p.y);
    ctx.closePath();
    ctx.fill();
  }
  const policeState = pick(snap, ["keadaanPolisi", "keadaan polisi", "policeState"]);
  const policeRaw = pick(snap, ["polisi", "police"]);
  let units = [];
  if (policeState) {
    const fromState = pick(policeState, ["units", "polisi", "members", "cars"]);
    if (Array.isArray(fromState)) units = fromState;
  }
  if (units.length === 0 && Array.isArray(policeRaw)) units = policeRaw;
  if (Array.isArray(units)) {
    ctx.fillStyle = "#ff3b30";
    for (const unit of units) {
      const up = posOf(unit);
      if (!up) continue;
      const p = minimapPoint(up.x, up.z, size);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const player = pick(snap, ["pemain", "player"]);
  const pp = posOf(player);
  if (pp) {
    const heading = playerHeadingOf(snap, player);
    const p = minimapPoint(pp.x, pp.z, size);
    const dx = Math.sin(heading);
    const dz = Math.cos(heading);
    const tipX = p.x + dx * 9;
    const tipY = p.y + dz * 9;
    const baseX = p.x - dx * 6;
    const baseY = p.y - dz * 6;
    const perpX = dz;
    const perpY = -dx;
    ctx.fillStyle = "#ff8c1a";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + perpX * 5, baseY + perpY * 5);
    ctx.lineTo(baseX - perpX * 5, baseY - perpY * 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Dipanggil tiap frame oleh loop utama dengan satu cuplikan game lengkap.
// Memperbarui SEMUA nilai (kecepatan, uang, nyawa, wanted, objective,
// minimap, toast) dan membuat HUD terlihat saat layar bermain.
export function drawHUD(snapshot) {
  const snap = snapshot || {};
  const hud = getEl("hud");
  // HUD hanya di layar bermain; drawHUD dipanggil tiap frame, jadi tanpa
  // gate ini HUD menutupi layar mulai/jeda/BUSTED/TAMAT.
  if (hud) hud.style.display = snap.screen === "game" ? "flex" : "none";
  currentScreen = "play";
  const player = pick(snap, ["pemain", "player"]) || {};
  const policeState = pick(snap, ["keadaanPolisi", "keadaan polisi", "policeState"]) || {};
  const policeRaw = pick(snap, ["polisi", "police"]);
  const missionState = pick(snap, ["keadaanMisi", "keadaan misi", "missionState", "misi"]);

  const speedFallback = asNumber(pick(player, ["kecepatan", "speed"]), 0);
  const speed = asNumber(pick(snap, ["kecepatanKmh", "kecepatan km/jam", "kecepatan", "speedKmh", "speed"]), speedFallback);
  const speedNode = getEl("hud-speed-value");
  if (speedNode) speedNode.textContent = String(Math.max(0, Math.round(speed)));

  const money = asNumber(pick(player, ["uang", "money"]), 0);
  const moneyNode = getEl("hud-money");
  if (moneyNode) moneyNode.textContent = formatMoney(money);

  const health = clampInt(pick(player, ["nyawa", "health", "hp"]), 0, 100);
  const healthNode = getEl("hud-health");
  if (healthNode) healthNode.textContent = String(health);
  const healthBar = getEl("hud-health-bar");
  if (healthBar) healthBar.style.width = health + "%";

  const wantedRaw = pick(policeState, ["wanted", "bintang", "level"]);
  const wantedFromPolice = wantedRaw !== undefined ? wantedRaw : pick(policeRaw, ["wanted", "bintang", "level"]);
  const wantedValue = wantedFromPolice !== undefined ? wantedFromPolice : pick(snap, ["wanted"]);
  const wanted = clampInt(wantedValue, 0, 5);
  const wantedNode = getEl("hud-wanted");
  if (wantedNode) wantedNode.textContent = "★".repeat(wanted) + "☆".repeat(5 - wanted);

  const objective = objectiveOf(missionState);
  const titleNode = getEl("hud-objective-title");
  if (titleNode) titleNode.textContent = objective.title;
  const textNode = getEl("hud-objective-text");
  if (textNode) textNode.textContent = objective.text;

  drawMinimap(snap);

  const toastText = pick(snap, ["toast"]);
  if (typeof toastText === "string" && toastText.length > 0 && toastText !== lastToastText) {
    lastToastText = toastText;
    showToast(toastText);
  }
}

export function initHUD(onStart) {
  if (typeof onStart === "function") startCallback = onStart;
  const button = getEl("btn-start");
  if (button && typeof button.addEventListener === "function") {
    button.addEventListener("click", function () {
      if (typeof startCallback === "function") startCallback();
    });
  }
  showStart();
}
