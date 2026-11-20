// hud.js — HUD dan semua layar menu KOTA MENTARI.
//
// Modul ini HANYA menampilkan. Ia tidak menghitung logika game apa pun:
// semua angka dan teks datang dari modul utama lewat updateHud dan lewat
// argumen layar. Teks objective selalu diambil dari modul misi saat ini
// (diteruskan modul utama), bukan disalin ke sini.
//
// KONTRAK DENGAN MODUL UTAMA (main.js):
//   initHud(callbacks) — dipanggil sekali saat game dimulai. callbacks:
//     onNewGame      — tombol "Mulai Baru" / tombol Enter di layar mulai
//     onContinue     — tombol "Lanjutkan" (simpanan ada)
//     onResume       — tombol "Lanjutkan Main" di layar jeda
//     onQuitToMenu   — tombol "Kembali ke Menu" (dari jeda / TAMAT / BUSTED)
//     onRetry        — tombol "Coba Lagi" di layar BUSTED
//     onPlayAgain    — tombol "Main Lagi" di layar TAMAT
//   updateHud(state) — dipanggil modul utama sekali tiap frame saat bermain.
//     state berisi:
//       health, maxHealth   — nyawa saat ini dan nyawa penuh
//       money               — uang pemain saat ini
//       weapon              — "tinju" atau "pistol"
//       wanted              — tingkat wanted 0 sampai 5
//       speedKmh            — kecepatan dalam kilometer per jam
//       playerX, playerZ    — posisi pemain di peta
//       playerAngle         — arah hadap pemain, radian; 0 = menghadap
//                             utara (Z negatif), positif memutar searah
//                             jarum jam bila dilihat dari atas
//       police              — daftar { x, z } posisi polisi
//       target              — { x, z } target misi saat ini, atau null
//       missionName         — nama misi saat ini
//       objective           — teks objective saat ini dari modul misi
//   showToast(text, durationMs) — banner kuning di tengah atas.
//   showStartScreen(hasSave)    — layar mulai; tombol Lanjutkan hanya
//                                 tampil bila hasSave benar.
//   showPauseScreen()           — layar jeda.
//   showCompleteScreen(finalMoney) — layar TAMAT. finalMoney adalah uang
//                                 akhir ASLI dari keadaan game (bukan nol).
//                                 Minimap disalin sekali dari keadaan
//                                 terakhir dan objective dikunci.
//   showBustedScreen()          — layar BUSTED.
//   hideAllScreens()            — sembunyikan semua layar, tampilkan HUD.
//
// Peta minimap memakai rentang dunia -500 sampai 500 pada X dan Z.

const WORLD_MIN = -500;
const WORLD_MAX = 500;
const WORLD_SIZE = WORLD_MAX - WORLD_MIN;
const COMPLETE_OBJECTIVE = "Semua misi selesai!";

// Elemen DOM — diisi sekali oleh initHud.
let el = null;

// Keadaan terakhir yang digambar, dipakai untuk cuplikan minimap TAMAT.
let lastState = null;

// Timer toast yang sedang berjalan, supaya toast baru menggantikan lama.
let toastTimer = null;

// Nilai terakhir yang sudah ditulis ke DOM, supaya update tiap frame
// tidak menulis ulang teks yang sama.
let lastWritten = {
  health: -1,
  money: -1,
  weapon: "",
  wanted: -1,
  speed: -1,
  missionName: "",
  objective: "",
};

function grabElements() {
  const byId = (id) => document.getElementById(id);
  return {
    hud: byId("hud"),
    healthFill: byId("health-bar-fill"),
    healthText: byId("health-text"),
    moneyText: byId("money-text"),
    weaponText: byId("weapon-text"),
    wantedStars: byId("wanted-stars"),
    speedText: byId("speed-text"),
    minimap: byId("minimap"),
    missionName: byId("mission-name"),
    missionObjective: byId("mission-objective"),
    toast: byId("toast"),
    startScreen: byId("start-screen"),
    pauseScreen: byId("pause-screen"),
    completeScreen: byId("complete-screen"),
    bustedScreen: byId("busted-screen"),
    btnNewGame: byId("btn-new-game"),
    btnContinue: byId("btn-continue"),
    btnResume: byId("btn-resume"),
    btnQuitToMenu: byId("btn-quit-to-menu"),
    btnPlayAgain: byId("btn-play-again"),
    btnCompleteMenu: byId("btn-complete-menu"),
    btnRetry: byId("btn-retry"),
    btnBustedMenu: byId("btn-busted-menu"),
    finalMoney: byId("final-money"),
    completeMinimap: byId("complete-minimap"),
    completeObjective: byId("complete-objective"),
  };
}

function hideScreen(node) {
  if (node) node.classList.remove("visible");
}

function showScreen(node) {
  if (node) node.classList.add("visible");
}

function hideAllScreensOnly() {
  hideScreen(el.startScreen);
  hideScreen(el.pauseScreen);
  hideScreen(el.completeScreen);
  hideScreen(el.bustedScreen);
}

function formatMoney(amount) {
  const value = Math.max(0, Math.floor(amount));
  return "$" + value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function weaponLabel(weapon) {
  if (weapon === "pistol") return "Pistol";
  return "Tinju";
}

// Mengubah peta dunia (X, Z) menjadi piksel kanvas minimap.
// Utara (Z kecil) di atas, timur (X besar) di kanan.
function worldToMap(x, z, size) {
  const px = ((x - WORLD_MIN) / WORLD_SIZE) * size;
  const py = ((z - WORLD_MIN) / WORLD_SIZE) * size;
  return { px, py };
}

function drawMinimapOnto(canvas, state) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width;

  // Latar gelap.
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#0c1420";
  ctx.fillRect(0, 0, size, size);

  // Garis kisi tiap 100 satuan dunia (jalan kota).
  const step = (100 / WORLD_SIZE) * size;
  ctx.strokeStyle = "rgba(120, 160, 200, 0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step; x < size; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
  }
  for (let y = step; y < size; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
  }
  ctx.stroke();

  // Batas peta.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  // Huruf N (utara) di sudut kiri atas.
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("N", 6, 4);

  if (!state) return;

  // Target misi: berlian kuning.
  if (state.target) {
    const t = worldToMap(state.target.x, state.target.z, size);
    const r = 7;
    ctx.fillStyle = "#ffd21f";
    ctx.strokeStyle = "#7a5c00";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(t.px, t.py - r);
    ctx.lineTo(t.px + r, t.py);
    ctx.lineTo(t.px, t.py + r);
    ctx.lineTo(t.px - r, t.py);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Polisi: titik merah.
  const police = state.police || [];
  ctx.fillStyle = "#ff3b30";
  for (let i = 0; i < police.length; i++) {
    const p = worldToMap(police[i].x, police[i].z, size);
    ctx.beginPath();
    ctx.arc(p.px, p.py, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pemain: panah putih menghadap arah hadapnya.
  if (typeof state.playerX === "number" && typeof state.playerZ === "number") {
    const p = worldToMap(state.playerX, state.playerZ, size);
    const angle = typeof state.playerAngle === "number" ? state.playerAngle : 0;
    ctx.save();
    ctx.translate(p.px, p.py);
    ctx.rotate(angle);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function updateStars(wanted) {
  if (!el.wantedStars) return;
  const level = Math.max(0, Math.min(5, Math.floor(wanted)));
  const stars = el.wantedStars.querySelectorAll(".star");
  for (let i = 0; i < stars.length; i++) {
    if (i < level) {
      stars[i].classList.add("lit");
    } else {
      stars[i].classList.remove("lit");
    }
  }
}

export function initHud(callbacks) {
  el = grabElements();
  const cb = callbacks || {};

  const wire = (button, handler) => {
    if (button && typeof handler === "function") {
      button.addEventListener("click", () => handler());
    }
  };

  wire(el.btnNewGame, cb.onNewGame);
  wire(el.btnContinue, cb.onContinue);
  wire(el.btnResume, cb.onResume);
  wire(el.btnQuitToMenu, cb.onQuitToMenu);
  wire(el.btnPlayAgain, cb.onPlayAgain);
  wire(el.btnCompleteMenu, cb.onQuitToMenu);
  wire(el.btnRetry, cb.onRetry);
  wire(el.btnBustedMenu, cb.onQuitToMenu);

  // Enter di layar mulai = mulai permainan baru.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (!el.startScreen || !el.startScreen.classList.contains("visible")) return;
    if (typeof cb.onNewGame === "function") cb.onNewGame();
  });

  // Awalan: HUD tersembunyi sampai permainan benar-benar dimulai.
  if (el.hud) el.hud.style.display = "none";
}

export function updateHud(state) {
  if (!el || !state) return;
  lastState = state;

  // Nyawa: lebar batang + angka. Di bawah 30 berubah merah.
  const maxHealth = state.maxHealth > 0 ? state.maxHealth : 100;
  const health = Math.max(0, Math.min(maxHealth, state.health));
  if (health !== lastWritten.health) {
    lastWritten.health = health;
    const pct = (health / maxHealth) * 100;
    if (el.healthFill) {
      el.healthFill.style.width = pct + "%";
      if (health < 30) {
        el.healthFill.classList.add("low");
      } else {
        el.healthFill.classList.remove("low");
      }
    }
    if (el.healthText) el.healthText.textContent = String(Math.ceil(health));
  }

  // Uang.
  const money = Math.floor(state.money || 0);
  if (money !== lastWritten.money) {
    lastWritten.money = money;
    if (el.moneyText) el.moneyText.textContent = formatMoney(money);
  }

  // Senjata aktif.
  const weapon = weaponLabel(state.weapon);
  if (weapon !== lastWritten.weapon) {
    lastWritten.weapon = weapon;
    if (el.weaponText) el.weaponText.textContent = weapon;
  }

  // Bintang wanted.
  const wanted = Math.max(0, Math.min(5, Math.floor(state.wanted || 0)));
  if (wanted !== lastWritten.wanted) {
    lastWritten.wanted = wanted;
    updateStars(wanted);
  }

  // Kecepatan.
  const speed = Math.max(0, Math.round(state.speedKmh || 0));
  if (speed !== lastWritten.speed) {
    lastWritten.speed = speed;
    if (el.speedText) el.speedText.textContent = String(speed);
  }

  // Kotak misi: nama dan objective SELALU dari keadaan yang diteruskan
  // (modul misi), tidak pernah dari teks yang disalin di sini.
  const missionName = state.missionName || "";
  if (missionName !== lastWritten.missionName) {
    lastWritten.missionName = missionName;
    if (el.missionName) el.missionName.textContent = missionName;
  }
  const objective = state.objective || "";
  if (objective !== lastWritten.objective) {
    lastWritten.objective = objective;
    if (el.missionObjective) el.missionObjective.textContent = objective;
  }

  // Minimap digambar ulang tiap frame.
  drawMinimapOnto(el.minimap, state);
}

export function showToast(text, durationMs) {
  if (!el || !el.toast) return;
  el.toast.textContent = text;
  el.toast.classList.add("visible");
  if (toastTimer !== null) clearTimeout(toastTimer);
  const duration = typeof durationMs === "number" ? durationMs : 3500;
  toastTimer = setTimeout(() => {
    if (el && el.toast) el.toast.classList.remove("visible");
    toastTimer = null;
  }, duration);
}

export function hideToast() {
  if (!el || !el.toast) return;
  if (toastTimer !== null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  el.toast.classList.remove("visible");
}

export function showStartScreen(hasSave) {
  if (!el) return;
  hideAllScreensOnly();
  hideToast();
  if (el.hud) el.hud.style.display = "none";
  if (el.btnContinue) {
    el.btnContinue.style.display = hasSave ? "" : "none";
  }
  showScreen(el.startScreen);
}

export function showPauseScreen() {
  if (!el) return;
  hideAllScreensOnly();
  showScreen(el.pauseScreen);
}

export function showCompleteScreen(finalMoney) {
  if (!el) return;
  hideAllScreensOnly();
  hideToast();
  if (el.hud) el.hud.style.display = "none";

  // UANG AKHIR ASLI dari keadaan game — diteruskan sebagai argumen,
  // tidak pernah nol dan tidak pernah dibaca dari tempat lain.
  const money = typeof finalMoney === "number" ? finalMoney : 0;
  if (el.finalMoney) el.finalMoney.textContent = formatMoney(money);

  // Objective dikunci: semua misi selesai.
  if (el.completeObjective) el.completeObjective.textContent = COMPLETE_OBJECTIVE;

  // Gambar minimap SEKALI dari keadaan terakhir. Salin langsung dari
  // kanvas minimap hidup (bingkai terakhir yang digambar updateHud).
  // Bila salinan gagal, gambar ulang dari keadaan terakhir yang disimpan.
  if (el.completeMinimap) {
    const ctx = el.completeMinimap.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, el.completeMinimap.width, el.completeMinimap.height);
      let copied = false;
      if (el.minimap) {
        try {
          ctx.drawImage(el.minimap, 0, 0);
          copied = true;
        } catch (err) {
          copied = false;
        }
      }
      if (!copied) {
        drawMinimapOnto(el.completeMinimap, lastState);
      }
    }
  }

  showScreen(el.completeScreen);
}

export function showBustedScreen() {
  if (!el) return;
  hideAllScreensOnly();
  hideToast();
  if (el.hud) el.hud.style.display = "none";
  showScreen(el.bustedScreen);
}

export function hideAllScreens() {
  if (!el) return;
  hideAllScreensOnly();
  if (el.hud) el.hud.style.display = "";
}
