// KOTA MENTARI — modul HUD (module-level, tanpa objek hud).
// Menampilkan nyawa, uang, senjata, bintang wanted, kecepatan, minimap,
// kotak misi, toast, dan layar mulai / jeda / TAMAT / BUSTED.
// API BEKU: initHud, showScreen, drawHud, showToast, clearToasts,
// getCurrentScreen. Layar: 'start' | 'playing' | 'paused' | 'complete'
// | 'busted'. HUD hanya menampilkan — tidak menghitung logika game.

const SAVE_KEY = 'kota-mentari-save';
const WORLD_EXTENT = 600; // dunia dipetakan dari -600..600 ke minimap
const TOAST_MS = 3500;

let currentScreen = 'start';
let callbacks = {};
let toastTimers = [];
let lastSnapshot = null;
let lastMoney = 0;
let lastObjective = '';
let lastMissionTitle = '';
let hudReady = false;

// ---------- util ----------

function $(id) {
  return document.getElementById(id);
}

function formatMoney(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return '$' + v.toLocaleString('id-ID');
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Ambil posisi {x, z} dari berbagai bentuk objek (pemain, polisi, target).
function posOf(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (typeof obj.x === 'number' && typeof obj.z === 'number') {
    return { x: obj.x, z: obj.z };
  }
  if (obj.position && typeof obj.position.x === 'number' && typeof obj.position.z === 'number') {
    return { x: obj.position.x, z: obj.position.z };
  }
  if (obj.pos && typeof obj.pos.x === 'number' && typeof obj.pos.z === 'number') {
    return { x: obj.pos.x, z: obj.pos.z };
  }
  return null;
}

// ---------- misi aktif: objective SELALU dari keadaan misi saat ini ----------

function currentMission(state) {
  if (!state || typeof state !== 'object') return null;
  if (typeof state.getCurrentMission === 'function') {
    try {
      const m = state.getCurrentMission();
      if (m) return m;
    } catch (e) { /* abaikan, lanjut ke bentuk lain */ }
  }
  if (state.active && typeof state.active === 'object') return state.active;
  if (state.currentMission && typeof state.currentMission === 'object') return state.currentMission;
  if (Array.isArray(state.missions)) {
    const idx = typeof state.current === 'number' ? state.current : 0;
    return state.missions[idx] || state.missions[0] || null;
  }
  if (state.mission && typeof state.mission === 'object') return state.mission;
  return state;
}

function missionText(state) {
  const m = currentMission(state);
  let title = '';
  let objective = '';
  if (m) {
    title = m.name || m.title || m.nama || '';
    objective = m.objective || m.text || m.description || m.deskripsi || m.hint || '';
  }
  if (!objective && state && typeof state === 'object') {
    objective = state.objective || state.text || state.currentObjective || '';
  }
  if (!title && state && typeof state === 'object') {
    title = state.title || state.name || '';
  }
  return { title, objective };
}

function missionTarget(state) {
  const m = currentMission(state);
  const candidates = [
    m && m.marker, m && m.target, m && m.activeMarker,
    state && state.marker, state && state.target, state && state.activeMarker,
    m,
  ];
  for (const c of candidates) {
    const p = posOf(c);
    if (p) return p;
  }
  if (m && typeof m.targetX === 'number' && typeof m.targetZ === 'number') {
    return { x: m.targetX, z: m.targetZ };
  }
  return null;
}

// ---------- minimap ----------

function drawMinimap(canvas, snapshot) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const scale = w / (WORLD_EXTENT * 2);

  // Latar gelap.
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a1622';
  ctx.fillRect(0, 0, w, h);

  // Garis kisi.
  ctx.strokeStyle = 'rgba(120, 180, 220, 0.18)';
  ctx.lineWidth = 1;
  const step = 100 * scale;
  for (let gx = cx % step; gx < w; gx += step) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
  }
  for (let gy = cy % step; gy < h; gy += step) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
  }

  // Bingkai + huruf N (utara di atas).
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('N', cx, 4);

  if (!snapshot) return;
  const toMap = (p) => ({ x: cx + p.x * scale, y: cy + p.z * scale });

  // Target misi: berlian kuning.
  const missionState = snapshot.missionState || snapshot.mission || snapshot.keadaanMisi || snapshot.missions || null;
  const target = missionTarget(missionState);
  if (target) {
    const t = toMap(target);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 6);
    ctx.lineTo(t.x + 6, t.y);
    ctx.lineTo(t.x, t.y + 6);
    ctx.lineTo(t.x - 6, t.y);
    ctx.closePath();
    ctx.fill();
  }

  // Polisi: titik merah.
  const police = snapshot.police || [];
  if (Array.isArray(police)) {
    ctx.fillStyle = '#ff3b30';
    for (const unit of police) {
      const p = posOf(unit);
      if (!p) continue;
      const m = toMap(p);
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Pemain: panah putih, diputar mengikuti playerAngle.
  // Heading: x dari sinus sudut, z dari kosinus sudut.
  const player = snapshot.player || snapshot.pemain || null;
  const pPos = posOf(player);
  if (pPos) {
    const m = toMap(pPos);
    const angle = typeof snapshot.playerAngle === 'number' ? snapshot.playerAngle : 0;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.PI - angle);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ---------- toast ----------

function renderToast(text) {
  const box = $('toast-container');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = String(text);
  box.appendChild(el);
  while (box.children.length > 3) {
    box.removeChild(box.firstChild);
  }
  const timer = window.setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, TOAST_MS);
  toastTimers.push(timer);
}

export function showToast(text) {
  if (text === undefined || text === null || String(text).length === 0) return;
  renderToast(text);
}

export function clearToasts() {
  for (const t of toastTimers) window.clearTimeout(t);
  toastTimers = [];
  const box = $('toast-container');
  if (box) box.innerHTML = '';
}

// ---------- manajer layar: sembunyikan SEMUA, baru tampilkan yang diminta ----------

const SCREEN_IDS = {
  start: 'screen-start',
  paused: 'screen-paused',
  complete: 'screen-complete',
  busted: 'screen-busted',
};

export function showScreen(name, data) {
  const hud = $('hud');
  for (const key of Object.keys(SCREEN_IDS)) {
    const el = $(SCREEN_IDS[key]);
    if (el) el.classList.add('hidden');
  }
  if (hud) hud.classList.add('hidden');

  currentScreen = name;

  if (name === 'playing') {
    if (hud) hud.classList.remove('hidden');
    return;
  }

  const id = SCREEN_IDS[name];
  if (id) {
    const el = $(id);
    if (el) el.classList.remove('hidden');
  }

  if (name === 'start') {
    // Tombol Lanjutkan hanya bila ada simpanan.
    const btn = $('btn-continue');
    if (btn) {
      let hasSave = false;
      try { hasSave = !!window.localStorage.getItem(SAVE_KEY); } catch (e) { hasSave = false; }
      btn.classList.toggle('hidden', !hasSave);
    }
  }

  if (name === 'complete') {
    // UANG AKHIR ASLI dari keadaan game — jangan pernah nol bila game menyimpan uang.
    const money = (data && (data.money ?? data.uang ?? data.finalMoney))
      ?? lastMoney ?? 0;
    const el = $('complete-money');
    if (el) el.textContent = formatMoney(money);
    const obj = $('complete-objective');
    if (obj) obj.textContent = 'Semua misi selesai!';
    // Gambar minimap sekali dari keadaan terakhir.
    drawMinimap($('complete-minimap'), lastSnapshot);
  }
}

export function getCurrentScreen() {
  return currentScreen;
}

// ---------- gambar HUD tiap frame ----------

export function drawHud(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;
  lastSnapshot = snapshot;

  const player = snapshot.player || snapshot.pemain || {};
  const police = snapshot.police || [];
  const missionState = snapshot.missionState || snapshot.mission || snapshot.keadaanMisi || snapshot.missions || null;
  const policeState = snapshot.policeState || snapshot.keadaanPolisi || null;

  // Uang: field pemain adalah `uang`; `money` alias.
  const money = player.uang ?? player.money ?? snapshot.uang ?? snapshot.money ?? 0;
  lastMoney = money;

  // Nyawa 0..100.
  const health = clamp(Number(player.health ?? player.nyawa ?? player.hp ?? 100), 0, 100);

  // Senjata: nama atau nomor (1 tinju, 2 pistol).
  let weapon = player.weapon ?? player.senjata ?? snapshot.weapon ?? 'Tinju';
  if (typeof weapon === 'number') weapon = weapon === 2 ? 'Pistol' : 'Tinju';
  if (typeof weapon === 'string') {
    const w = weapon.toLowerCase();
    if (w === 'fist' || w === '1') weapon = 'Tinju';
    else if (w === 'pistol' || w === 'gun' || w === '2') weapon = 'Pistol';
  }

  // Kecepatan km/jam.
  const speed = Math.round(Number(
    snapshot.speedKmh ?? snapshot.speed ?? snapshot.kecepatan
    ?? player.speedKmh ?? player.speed ?? 0,
  ) || 0);

  // Wanted 0..5 bintang.
  const wanted = clamp(Math.round(Number(
    snapshot.wanted ?? (policeState && policeState.wanted)
    ?? player.wanted ?? 0,
  ) || 0), 0, 5);

  // Teks objective SELALU dari keadaan misi aktif saat ini.
  // Loop utama menitipkan teks objective ASLI (dari getObjectiveText)
  // di snapshot — pakai itu dulu; missionText hanya cadangan bila
  // snapshot tidak membawanya (objek misi tidak punya field objective).
  const snapObjective =
    typeof snapshot.objective === 'string' && snapshot.objective ? snapshot.objective : '';
  const snapTitle =
    typeof snapshot.missionTitle === 'string' && snapshot.missionTitle
      ? snapshot.missionTitle
      : '';
  const { title, objective } = missionText(missionState);
  if (snapTitle || title) lastMissionTitle = snapTitle || title;
  if (snapObjective || objective) lastObjective = snapObjective || objective;

  // --- tulis ke DOM ---
  const moneyEl = $('hud-money');
  if (moneyEl) moneyEl.textContent = formatMoney(money);

  const healthFill = $('health-fill');
  if (healthFill) healthFill.style.width = health + '%';
  const healthText = $('hud-health-text');
  if (healthText) healthText.textContent = Math.round(health);

  const weaponEl = $('hud-weapon');
  if (weaponEl) weaponEl.textContent = String(weapon);

  const starsEl = $('hud-stars');
  if (starsEl) {
    const stars = starsEl.querySelectorAll('.star');
    stars.forEach((s, i) => {
      s.classList.toggle('lit', i < wanted);
      s.textContent = i < wanted ? '★' : '☆';
    });
  }

  const speedEl = $('hud-speed');
  if (speedEl) speedEl.textContent = speed + ' km/j';

  const missionTitleEl = $('mission-title');
  if (missionTitleEl) missionTitleEl.textContent = lastMissionTitle || 'Misi';
  const missionObjEl = $('mission-objective');
  if (missionObjEl) missionObjEl.textContent = lastObjective || 'Jelajahi Kota Mentari.';

  // Toast dari cuplikan (bila loop utama menitipkan teks toast).
  if (snapshot.toast) showToast(snapshot.toast);

  // Minimap tiap frame.
  drawMinimap($('hud-minimap'), snapshot);

  // HUD terlihat jika dan hanya jika layar aktif adalah layar bermain.
  const hud = $('hud');
  if (hud && currentScreen === 'playing') hud.classList.remove('hidden');
}

// ---------- inisialisasi ----------

export function initHud(cb) {
  callbacks = cb || {};
  if (hudReady) return;
  hudReady = true;

  const bind = (id, fn) => {
    const el = $(id);
    if (el && typeof fn === 'function') el.addEventListener('click', fn);
  };

  // Tombol mulai HARUS memanggil onStart() tanpa argumen: addEventListener
  // meneruskan MouseEvent (dengan .x/.y = posisi klik) yang akan dibaca
  // startGame sebagai data save bila diteruskan mentah-mentah.
  bind('btn-start', () => {
    if (typeof callbacks.onStart === 'function') callbacks.onStart();
  });
  bind('btn-continue', callbacks.onContinue);
  bind('btn-resume', callbacks.onResume);
  bind('btn-retry', callbacks.onRetry);
  bind('btn-play-again', callbacks.onPlayAgain);
  bind('btn-quit-pause', callbacks.onQuitToMenu);
  bind('btn-quit-busted', callbacks.onQuitToMenu);
  bind('btn-quit-complete', callbacks.onQuitToMenu);

  // Enter mulai dari layar awal — memanggil fungsi mulai yang sama
  // dengan tombol Mulai Baru (lewat onStart).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentScreen === 'start' && typeof callbacks.onStart === 'function') {
      callbacks.onStart();
    }
  });

  showScreen('start');
}
