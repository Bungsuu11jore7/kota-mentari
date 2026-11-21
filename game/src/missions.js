// KOTA MENTARI — Misi: enam misi cerita Raka Pratama, dari kurir paket sampai kabur ke kapal.
// Modul ini state-first: semua fungsi menerima keadaan misi sebagai argumen pertama.
// Keadaan dibuat sekali lewat createMissionState, lalu diteruskan ke setiap panggilan.
// Hadiah misi ditambahkan ke uang pemain; penyelesaian misi disimpan lewat konteks game.
// Nomor misi 0-based: misi pertama = 0, misi terakhir = 5.

export const MISSION_REWARDS = [500, 1200, 2000, 3000, 8000, 15000];
export const TOTAL_REWARD = 29700;

export const MISSIONS = [
  {
    id: 0,
    name: 'Paket Kilat',
    briefing: 'Antar 3 paket ke Menara. Raka baru mulai shift kurirnya.',
    target: { x: 100, z: -300 },
    reward: 500,
  },
  {
    id: 1,
    name: 'Mobil Pinjaman',
    briefing: 'Curi mobil oranye di dekat Menara, lalu bawa ke Pesisir.',
    target: { x: 0, z: 400 },
    reward: 1200,
  },
  {
    id: 2,
    name: 'Kejar Bayangan',
    briefing: 'Kejar mobil target yang melarikan diri sampai ke Pesisir.',
    target: { x: 0, z: 400 },
    reward: 2000,
  },
  {
    id: 3,
    name: 'Tolong Mira',
    briefing: 'Selamatkan Mira di Pasar Lama dari 3 penyerang Geng Ombak.',
    target: { x: -200, z: 100 },
    reward: 3000,
  },
  {
    id: 4,
    name: 'Brankas Pelabuhan',
    briefing: 'Berdiri di penanda brankas Pelabuhan selama 5 detik.',
    target: { x: 400, z: 300 },
    reward: 8000,
  },
  {
    id: 5,
    name: 'Jalan Pulang',
    briefing: 'Kabur ke kapal di ujung dermaga. Jangan sampai tertangkap.',
    target: { x: 470, z: 350 },
    reward: 15000,
  },
];

// Titik-titik kunci kota (sama dengan dokumen desain).
const MENARA = { x: 100, z: -300 };
const MOBIL_ORANYE = { x: 100, z: 0 };
const PESISIR = { x: 0, z: 400 };
const MIRA = { x: -200, z: 100 };
const BRANKAS = { x: 400, z: 300 };
const KAPAL = { x: 470, z: 350 };

const RADIUS_ANTAR = 15;
const RADIUS_TIBA = 15;
const RADIUS_MIRA = 40;
const RADIUS_BRANKAS = 12;
const WAKTU_BRANKAS = 5;
const JARAK_TANGKAP = 10;
const WAKTU_TANGKAP = 3;
const JARAK_DEKAT = 30;
const JARAK_PESISIR = 150;

function jarak(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function posisiPemain(ctx) {
  const p = ctx && ctx.player;
  if (!p) return { x: 0, z: 0 };
  return { x: typeof p.x === 'number' ? p.x : 0, z: typeof p.z === 'number' ? p.z : 0 };
}

function sedangDiMobil(p) {
  if (!p) return false;
  return p.inCar === true || p.inVehicle === true || p.driving === true || p.inMissionCar === true;
}

// Panggil satu dari beberapa nama callback konteks yang mungkin; kembalikan hasil pertama yang ada.
function panggilKonteks(ctx, nama, argumen) {
  if (!ctx) return undefined;
  for (const n of nama) {
    if (typeof ctx[n] === 'function') return ctx[n].apply(ctx, argumen);
  }
  return undefined;
}

function tampilToast(ctx, teks) {
  panggilKonteks(ctx, ['showToast', 'toast'], [teks]);
}

function simpanGame(ctx) {
  panggilKonteks(ctx, ['saveGame', 'save'], []);
}

function tambahUangPemain(pemain, jumlah) {
  if (!pemain) return;
  if (typeof pemain.uang === 'number') pemain.uang += jumlah;
  else if (typeof pemain.money === 'number') pemain.money += jumlah;
  else pemain.uang = jumlah;
}

// Naikkan wanted ke 3 saat misi terakhir dimulai.
// PENTING: penambah/pengatur wanted di konteks hanya menerima SATU argumen (jumlahnya),
// karena wrapper di loop utama hanya meneruskan satu argumen jumlah. Memanggil dengan
// tiga argumen (keadaan, jumlah, konteks) menghasilkan wanted yang tidak berubah.
function naikkanWantedKeTiga(ctx) {
  if (!ctx) return;
  if (typeof ctx.setWanted === 'function') {
    ctx.setWanted(3);
    return;
  }
  if (typeof ctx.getWanted === 'function' && typeof ctx.addWanted === 'function') {
    const sekarang = ctx.getWanted();
    const dasar = typeof sekarang === 'number' ? sekarang : 0;
    const selisih = 3 - dasar;
    if (selisih > 0) ctx.addWanted(selisih);
    return;
  }
  if (typeof ctx.addWanted === 'function') ctx.addWanted(3);
}

export function createMissionState() {
  return {
    current: 0,
    started: false,
    completed: false,
    packagesDelivered: 0,
    packageCooldown: 0,
    carStolen: false,
    carSpawned: false,
    target: null,
    targetSpawned: false,
    chaseSpawn: null,
    chaseElapsed: 0,
    chaseTime: 0,
    everClose: false,
    enemiesDefeated: 0,
    attackersSpawned: false,
    miraVisited: false,
    vaultTimer: 0,
  };
}

function resetKemajuanMisi(state) {
  state.completed = false;
  state.packagesDelivered = 0;
  state.packageCooldown = 0;
  state.carStolen = false;
  state.carSpawned = false;
  state.target = null;
  state.targetSpawned = false;
  state.chaseSpawn = null;
  state.chaseElapsed = 0;
  state.chaseTime = 0;
  state.everClose = false;
  state.enemiesDefeated = 0;
  state.attackersSpawned = false;
  state.miraVisited = false;
  state.vaultTimer = 0;
}

// Mulai misi aktif. TIDAK ada early-return sebelum blok spawn per misi: setiap
// pemanggilan harus menjalankan penyiapan misinya (spawn mobil, target, penyerang,
// atau naik wanted) sebelum menampilkan briefing.
export function startMission(state, ctx) {
  const mission = MISSIONS[state.current];
  if (!mission) {
    state.completed = true;
    state.started = false;
    return;
  }
  resetKemajuanMisi(state);
  state.started = true;
  const idx = state.current;
  if (idx === 1) {
    if (!state.carSpawned) {
      panggilKonteks(ctx, ['spawnMissionCar', 'spawnCar', 'spawnMissionVehicle'], [MOBIL_ORANYE.x, MOBIL_ORANYE.z, 'orange']);
      state.carSpawned = true;
    }
  } else if (idx === 2) {
    if (!state.targetSpawned) {
      let t = panggilKonteks(ctx, ['spawnChaseTarget', 'spawnTarget', 'spawnChaseCar'], []);
      if (!t && ctx) t = ctx.chaseTarget || ctx.target || null;
      if (t && typeof t.x === 'number' && typeof t.z === 'number') {
        t.caught = false;
        state.target = t;
        state.chaseSpawn = { x: t.x, z: t.z };
      }
      state.targetSpawned = true;
    }
  } else if (idx === 3) {
    if (!state.attackersSpawned) {
      panggilKonteks(ctx, ['spawnAttackers', 'spawnEnemies'], [MIRA.x, MIRA.z, 3]);
      state.attackersSpawned = true;
    }
  } else if (idx === 5) {
    naikkanWantedKeTiga(ctx);
  }
  tampilToast(ctx, 'Misi: ' + mission.name + ' — ' + mission.briefing);
}

// Ulangi misi aktif dari awal (dipakai saat BUSTED lalu coba lagi).
export function resetCurrentMission(state, ctx) {
  state.carSpawned = false;
  state.targetSpawned = false;
  state.attackersSpawned = false;
  state.target = null;
  startMission(state, ctx);
}

// Selesaikan misi aktif: beri hadiah ke uang pemain, simpan, lanjut ke misi berikut.
export function completeMission(state, ctx) {
  const mission = MISSIONS[state.current];
  if (!mission) return;
  const reward = mission.reward;
  if (ctx && ctx.player) tambahUangPemain(ctx.player, reward);
  tampilToast(ctx, 'Misi selesai: ' + mission.name + ' +$' + reward);
  simpanGame(ctx);
  state.current += 1;
  if (state.current >= MISSIONS.length) {
    state.completed = true;
    state.started = false;
    tampilToast(ctx, 'Semua misi selesai! Raka bebas.');
    simpanGame(ctx);
    return;
  }
  startMission(state, ctx);
}

// Misi 1: satu paket terantar. Dijaga cooldown supaya tiga paket tidak terantar
// sekaligus saat pemain berdiri di penanda; paket berikut butuh jeda singkat.
export function onPackageDelivered(state, ctx) {
  if (!state || state.completed || state.current !== 0) return;
  if (state.packageCooldown > 0) return;
  if (state.packagesDelivered >= 3) return;
  state.packagesDelivered += 1;
  state.packageCooldown = 2.5;
  tampilToast(ctx, 'Paket ' + state.packagesDelivered + ' dari 3 terantar');
  if (state.packagesDelivered >= 3) completeMission(state, ctx);
}

// Misi 2: mobil oranye berhasil dicuri.
export function onCarStolen(state, ctx) {
  if (!state || state.completed || state.current !== 1) return;
  if (state.carStolen) return;
  state.carStolen = true;
  tampilToast(ctx, 'Mobil curian didapat! Bawa ke Pesisir.');
}

// Misi 4: satu penyerang Geng Ombak dilumpuhkan.
export function onEnemyDefeated(state, ctx) {
  if (!state || state.completed || state.current !== 3) return;
  if (state.enemiesDefeated >= 3) return;
  state.enemiesDefeated += 1;
  tampilToast(ctx, 'Penyerang dilumpuhkan (' + state.enemiesDefeated + '/3)');
}

// Misi 3: kejar target. Misi TIDAK boleh selesai sebelum kejar-kejaran sungguhan:
// pemain harus pernah mendekat, bertahan dalam 10 meter selama 3 detik, misi sudah
// berjalan minimal 5 detik, target sudah benar-benar bergerak menjauh dari titik
// spawn (atau sudah sampai dekat Pesisir), DAN target tertangkap atau sudah dekat
// Pesisir. Target yang ter-spawn menempel pemain dengan status sudah tertangkap
// tidak bisa menyelesaikan misi secara instan karena syarat-syarat ini.
function updateKejaran(state, dt, ctx, p) {
  const t = state.target;
  if (!t) {
    if (!state.targetSpawned) {
      let dibuat = panggilKonteks(ctx, ['spawnChaseTarget', 'spawnTarget', 'spawnChaseCar'], []);
      if (!dibuat && ctx) dibuat = ctx.chaseTarget || ctx.target || null;
      if (dibuat && typeof dibuat.x === 'number' && typeof dibuat.z === 'number') {
        dibuat.caught = false;
        state.target = dibuat;
        state.chaseSpawn = { x: dibuat.x, z: dibuat.z };
      }
      state.targetSpawned = true;
    }
    return;
  }
  state.chaseElapsed += dt;
  const d = jarak(p.x, p.z, t.x, t.z);
  const dPesisir = jarak(t.x, t.z, PESISIR.x, PESISIR.z);
  if (d < JARAK_DEKAT) state.everClose = true;
  if (d < JARAK_TANGKAP) state.chaseTime += dt;
  else state.chaseTime = 0;
  // Tertangkap: pemain menempel target (<10 m) selama 3 detik berturut-turut.
  if (state.chaseTime >= WAKTU_TANGKAP) t.caught = true;
  const bergerak = state.chaseSpawn ? jarak(t.x, t.z, state.chaseSpawn.x, state.chaseSpawn.z) : 0;
  const dekatPesisir = dPesisir < JARAK_PESISIR;
  const kejarSungguhan =
    state.everClose &&
    state.chaseTime >= WAKTU_TANGKAP &&
    state.chaseElapsed >= 5 &&
    (bergerak > 25 || dekatPesisir);
  const tertangkap = t.caught === true;
  if (kejarSungguhan && (tertangkap || dekatPesisir)) completeMission(state, ctx);
}

export function updateMissions(state, dt, ctx) {
  if (!state || state.completed) return;
  if (!ctx || !ctx.player) return;
  const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.5) : 0;
  if (state.packageCooldown > 0) state.packageCooldown -= step;
  const p = posisiPemain(ctx);
  const idx = state.current;
  if (idx === 0) {
    if (jarak(p.x, p.z, MENARA.x, MENARA.z) < RADIUS_ANTAR) onPackageDelivered(state, ctx);
  } else if (idx === 1) {
    if (state.carStolen && sedangDiMobil(ctx.player) && jarak(p.x, p.z, PESISIR.x, PESISIR.z) < RADIUS_TIBA) {
      completeMission(state, ctx);
    }
  } else if (idx === 2) {
    updateKejaran(state, step, ctx, p);
  } else if (idx === 3) {
    if (jarak(p.x, p.z, MIRA.x, MIRA.z) < RADIUS_MIRA) state.miraVisited = true;
    if (state.enemiesDefeated >= 3 && state.miraVisited) completeMission(state, ctx);
  } else if (idx === 4) {
    if (jarak(p.x, p.z, BRANKAS.x, BRANKAS.z) < RADIUS_BRANKAS) {
      state.vaultTimer += step;
      if (state.vaultTimer >= WAKTU_BRANKAS) completeMission(state, ctx);
    } else {
      state.vaultTimer = 0;
    }
  } else if (idx === 5) {
    if (jarak(p.x, p.z, KAPAL.x, KAPAL.z) < RADIUS_TIBA) completeMission(state, ctx);
  }
}

// Teks objective SELALU diambil dari keadaan misi saat ini.
export function getObjectiveText(state, ctx) {
  if (!state || state.completed || state.current >= MISSIONS.length) return 'Semua misi selesai!';
  const idx = state.current;
  if (idx === 0) return 'Antar paket ' + (state.packagesDelivered + 1) + ' dari 3 ke Menara';
  if (idx === 1) {
    return state.carStolen ? 'Bawa mobil curian ke Pesisir' : 'Curi mobil oranye di (100, 0)';
  }
  if (idx === 2) return 'Kejar target sampai ke Pesisir';
  if (idx === 3) {
    return state.enemiesDefeated >= 3
      ? 'Temui Mira di Pasar Lama'
      : 'Kalahkan penyerang Geng Ombak (' + state.enemiesDefeated + '/3)';
  }
  if (idx === 4) {
    return 'Tahan posisi di Brankas Pelabuhan (' + Math.max(0, Math.ceil(WAKTU_BRANKAS - state.vaultTimer)) + ' dtk)';
  }
  if (idx === 5) return 'Kabur ke kapal di Pelabuhan (470, 350)';
  return 'Semua misi selesai!';
}

export function getActiveMarker(state, ctx) {
  if (!state || state.completed || state.current >= MISSIONS.length) return null;
  const idx = state.current;
  if (idx === 0) return { x: MENARA.x, z: MENARA.z };
  if (idx === 1) {
    return state.carStolen ? { x: PESISIR.x, z: PESISIR.z } : { x: MOBIL_ORANYE.x, z: MOBIL_ORANYE.z };
  }
  if (idx === 2) {
    if (state.target) return { x: state.target.x, z: state.target.z };
    return { x: PESISIR.x, z: PESISIR.z };
  }
  if (idx === 3) return { x: MIRA.x, z: MIRA.z };
  if (idx === 4) return { x: BRANKAS.x, z: BRANKAS.z };
  return { x: KAPAL.x, z: KAPAL.z };
}

export function getCurrentMission(state) {
  if (!state || state.current >= MISSIONS.length) return null;
  return MISSIONS[state.current];
}

export function isAllMissionsComplete(state) {
  if (!state) return false;
  return state.completed === true || state.current >= MISSIONS.length;
}
