// KOTA MENTARI — Polisi: sistem wanted 0–5, pengejaran lewat graf jalan, roadblock, dan BUSTED.
// Modul ini state-first: semua fungsi menerima keadaan polisi sebagai argumen pertama.
// Keadaan dibuat sekali lewat createPoliceState, lalu diteruskan ke setiap panggilan.
// Unit polisi TANPA mesh: modul ini TIDAK membuat bentuk 3D apa pun. Unit hanya data
// posisi dan arah; loop utama yang menggambar mobil polisi putih dan roadblock dari
// daftar yang diberikan modul ini. Jalur dicari lewat pencari jalur world.js dari
// konteks game (ctx.findPath atau ctx.findRoadPath); file ini TIDAK mendefinisikan
// pencari jalur sendiri.

const MAX_WANTED = 5;
const REPATH_INTERVAL = 1.5;
const DIRECT_CHASE_DIST = 25;
const POLICE_MAX_SPEED = 26;
const BUSTED_DIST = 3.2;
const SLOW_SPEED = 8;
const HIDE_DIST = 70;
const HIDE_DECAY_SECONDS = 8;
const ROADBLOCK_AHEAD = 55;
const ROADBLOCK_REPLACE_SECONDS = 2.5;

// Offset spawn yang DITENTUKAN relatif terhadap pemain (maju f, samping r),
// supaya unit berada dalam pandangan kamera kejar saat staging foto.
const SPAWN_OFFSETS = [
  { f: -35, r: 0 },
  { f: -40, r: -14 },
  { f: -40, r: 14 },
  { f: 45, r: -18 },
  { f: 45, r: 18 },
  { f: -55, r: 0 },
];

function jarak(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Arah maju dihitung dari sinus dan kosinus sudut: x dari sinus, z dari kosinus.
function arahKe(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

function ambilKecepatan(p) {
  if (!p) return 0;
  if (typeof p.speed === 'number') return Math.abs(p.speed);
  if (typeof p.kecepatan === 'number') return Math.abs(p.kecepatan);
  return 0;
}

function ambilNyawa(p) {
  if (!p) return 100;
  if (typeof p.health === 'number') return p.health;
  if (typeof p.nyawa === 'number') return p.nyawa;
  return 100;
}

function ambilArah(p) {
  if (!p) return 0;
  if (typeof p.heading === 'number') return p.heading;
  if (typeof p.arah === 'number') return p.arah;
  return 0;
}

function jumlahUnitDiinginkan(wanted) {
  if (wanted <= 0) return 0;
  return Math.min(wanted + 1, 6);
}

function jumlahRoadblockDiinginkan(wanted) {
  return wanted >= 3 ? 1 : 0;
}

export function createPoliceState() {
  return {
    wanted: 0,
    units: [],
    roadblocks: [],
    busted: false,
    hiddenTimer: 0,
    roadblockTimer: 0,
    unitCounter: 0,
  };
}

export function getWanted(state) {
  if (!state) return 0;
  return state.wanted;
}

export function getPoliceUnits(state) {
  if (!state) return [];
  return state.units;
}

export function getRoadblocks(state) {
  if (!state) return [];
  return state.roadblocks;
}

export function isBusted(state) {
  if (!state) return false;
  return state.busted === true;
}

export function resetBusted(state) {
  if (!state) return;
  state.busted = false;
}

export function clearPolice(state) {
  if (!state) return;
  state.units = [];
  state.roadblocks = [];
}

function tempatkanRoadblock(state, ctx) {
  const p = ctx && ctx.player;
  if (!p) return;
  const h = ambilArah(p);
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  state.roadblocks = [{ x: p.x + fx * ROADBLOCK_AHEAD, z: p.z + fz * ROADBLOCK_AHEAD, heading: h + Math.PI / 2 }];
}

// Jaga jumlah unit dan roadblock sesuai wanted saat ini.
function jagaJumlahUnit(state, ctx) {
  const mau = jumlahUnitDiinginkan(state.wanted);
  while (state.units.length < mau) spawnPoliceNear(state, ctx, 1);
  while (state.units.length > mau) state.units.pop();
  const mauRb = jumlahRoadblockDiinginkan(state.wanted);
  if (mauRb === 0) {
    state.roadblocks = [];
  } else if (state.roadblocks.length === 0) {
    tempatkanRoadblock(state, ctx);
  }
}

export function setWanted(state, level, ctx) {
  if (!state) return 0;
  const n = typeof level === 'number' ? Math.floor(level) : 0;
  state.wanted = Math.max(0, Math.min(MAX_WANTED, n));
  state.hiddenTimer = 0;
  if (state.wanted === 0) {
    clearPolice(state);
    return state.wanted;
  }
  if (ctx) jagaJumlahUnit(state, ctx);
  return state.wanted;
}

export function addWanted(state, amount, ctx) {
  if (!state) return 0;
  const n = typeof amount === 'number' ? amount : 0;
  return setWanted(state, state.wanted + n, ctx);
}

// Munculkan unit polisi di dekat pemain, pada offset yang ditentukan relatif
// terhadap arah hadap pemain (depan / belakang / samping).
export function spawnPoliceNear(state, ctx, count) {
  if (!state || !ctx || !ctx.player) return [];
  const n = typeof count === 'number' && count > 0 ? Math.floor(count) : 1;
  const p = ctx.player;
  const h = ambilArah(p);
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const rx = Math.cos(h);
  const rz = -Math.sin(h);
  const dibuat = [];
  for (let i = 0; i < n; i += 1) {
    const off = SPAWN_OFFSETS[(state.units.length + i) % SPAWN_OFFSETS.length];
    const x = p.x + fx * off.f + rx * off.r;
    const z = p.z + fz * off.f + rz * off.r;
    state.unitCounter += 1;
    const unit = {
      id: state.unitCounter,
      x: x,
      z: z,
      heading: arahKe(x, z, p.x, p.z),
      speed: 0,
      path: [],
      pathIndex: 0,
      repathTimer: (state.units.length % 6) * 0.25,
      hitCooldown: 0,
    };
    state.units.push(unit);
    dibuat.push(unit);
  }
  return dibuat;
}

// Cari jalur lewat pencari jalur world.js dari konteks game. Bila tidak ada
// atau gagal, kembalikan null supaya unit beralih ke kejar langsung.
function cariJalur(ctx, sx, sz, gx, gz) {
  if (!ctx) return null;
  const world = ctx.world;
  const daftar = [ctx.findPath, ctx.findRoadPath];
  for (const fn of daftar) {
    if (typeof fn !== 'function') continue;
    try {
      const hasil = fn(world, sx, sz, gx, gz);
      if (Array.isArray(hasil) && hasil.length > 0) return hasil;
    } catch (e) {
      // Pencari jalur gagal: jatuh ke kejar langsung di bawah.
    }
  }
  return null;
}

function belokKe(unit, tx, tz, dt) {
  const mau = arahKe(unit.x, unit.z, tx, tz);
  let selisih = mau - unit.heading;
  while (selisih > Math.PI) selisih -= Math.PI * 2;
  while (selisih < -Math.PI) selisih += Math.PI * 2;
  const belok = 3.2 * dt;
  unit.heading += Math.max(-belok, Math.min(belok, selisih));
}

function maju(unit, dt) {
  unit.speed = Math.min(POLICE_MAX_SPEED, unit.speed + 30 * dt);
  unit.x += Math.sin(unit.heading) * unit.speed * dt;
  unit.z += Math.cos(unit.heading) * unit.speed * dt;
}

function gerakkanUnit(state, unit, dt, ctx, pemain) {
  unit.repathTimer -= dt;
  const d = jarak(unit.x, unit.z, pemain.x, pemain.z);
  if (d < DIRECT_CHASE_DIST) {
    unit.path = [];
    unit.pathIndex = 0;
    belokKe(unit, pemain.x, pemain.z, dt);
    maju(unit, dt);
    return;
  }
  if (unit.repathTimer <= 0 || !unit.path || unit.pathIndex >= unit.path.length) {
    unit.repathTimer = REPATH_INTERVAL;
    const jalur = cariJalur(ctx, unit.x, unit.z, pemain.x, pemain.z);
    if (jalur) {
      unit.path = jalur;
      unit.pathIndex = 0;
    } else {
      unit.path = [];
      unit.pathIndex = 0;
    }
  }
  if (unit.path && unit.pathIndex < unit.path.length) {
    const titik = unit.path[unit.pathIndex];
    if (jarak(unit.x, unit.z, titik.x, titik.z) < 4) {
      unit.pathIndex += 1;
    } else {
      belokKe(unit, titik.x, titik.z, dt);
      maju(unit, dt);
    }
  } else {
    belokKe(unit, pemain.x, pemain.z, dt);
    maju(unit, dt);
  }
}

export function updatePolice(state, dt, ctx) {
  if (!state || !ctx || !ctx.player) return;
  if (state.busted) return;
  const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.5) : 0;
  const p = ctx.player;
  if (ambilNyawa(p) <= 0) {
    state.busted = true;
    return;
  }
  if (state.wanted <= 0) {
    if (state.units.length > 0 || state.roadblocks.length > 0) clearPolice(state);
    return;
  }
  jagaJumlahUnit(state, ctx);
  state.roadblockTimer += step;
  if (state.roadblocks.length > 0 && state.roadblockTimer >= ROADBLOCK_REPLACE_SECONDS) {
    state.roadblockTimer = 0;
    tempatkanRoadblock(state, ctx);
  }
  const kecepatanPemain = ambilKecepatan(p);
  let terdekat = Infinity;
  for (const unit of state.units) {
    gerakkanUnit(state, unit, step, ctx, p);
    const d = jarak(unit.x, unit.z, p.x, p.z);
    if (d < terdekat) terdekat = d;
    if (unit.hitCooldown > 0) unit.hitCooldown -= step;
    // Tabrakan menimbulkan kerusakan pada pemain tanpa menambah wanted.
    if (d < 2.5 && unit.hitCooldown <= 0) {
      unit.hitCooldown = 1;
      if (kecepatanPemain > 8 && typeof p.health === 'number') {
        p.health = Math.max(0, p.health - 5);
      } else if (kecepatanPemain > 8 && typeof p.nyawa === 'number') {
        p.nyawa = Math.max(0, p.nyawa - 5);
      }
    }
    // BUSTED: polisi menyentuh pemain yang lambat atau berhenti saat wanted >= 1.
    if (d < BUSTED_DIST && kecepatanPemain < SLOW_SPEED) {
      state.busted = true;
    }
  }
  if (state.busted) return;
  // Wanted luruh saat pemain bersembunyi: tidak ada unit polisi yang dekat.
  if (terdekat > HIDE_DIST) {
    state.hiddenTimer += step;
    if (state.hiddenTimer >= HIDE_DECAY_SECONDS) {
      state.hiddenTimer = 0;
      setWanted(state, state.wanted - 1, ctx);
    }
  } else {
    state.hiddenTimer = 0;
  }
}

// Periksa kondisi BUSTED saat ini tanpa menggerakkan unit: polisi menyentuh
// pemain yang lambat/berhenti saat wanted >= 1, atau nyawa pemain nol.
export function checkBusted(state, ctx) {
  if (!state) return false;
  if (state.busted) return true;
  if (!ctx || !ctx.player) return false;
  const p = ctx.player;
  if (ambilNyawa(p) <= 0) {
    state.busted = true;
    return true;
  }
  if (state.wanted < 1) return false;
  const kecepatanPemain = ambilKecepatan(p);
  if (kecepatanPemain >= SLOW_SPEED) return false;
  for (const unit of state.units) {
    if (jarak(unit.x, unit.z, p.x, p.z) < BUSTED_DIST) {
      state.busted = true;
      return true;
    }
  }
  return false;
}
