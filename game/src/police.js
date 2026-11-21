// police.js — Modul polisi "KOTA MENTARI" (GTA6-01 v7, Lane C).
// Keadaan polisi dibuat sekali oleh loop utama dan diteruskan
// state-first ke semua fungsi. Wanted 0–5 bintang.
// TIDAK ADA findRoadPath di file ini: jalur hanya dari world.js
// (Lane B), diterima lewat konteks bila tersedia.
// Unit polisi TANPA mesh: daftar ini hanya posisi + sudut + status;
// loop utama yang menggambar mobil polisi putih + roadblock.

const WANTED_UNIT_COUNT = [0, 1, 2, 3, 4, 6];
const HIDE_DISTANCE = 50;
const HIDE_DECAY_SECONDS = 8;
const BUSTED_DISTANCE = 4;
const MAP_BOUND = 470;

// Offset spawn relatif terhadap pemain (kanan, maju) dalam satuan unit,
// dipakai berurutan supaya formasi bisa diprediksi (depan/belakang/samping).
const SPAWN_OFFSETS = [
  { right: 0, forward: -28 },
  { right: -14, forward: -24 },
  { right: 14, forward: -24 },
  { right: -20, forward: 30 },
  { right: 20, forward: 30 },
  { right: -28, forward: 0 },
  { right: 28, forward: 0 },
  { right: 0, forward: 34 },
];

function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampWanted(n) {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  return clamp(v, 0, 5);
}

export function createPoliceState() {
  return {
    wanted: 0,
    units: [],
    roadblocks: [],
    busted: false,
    hideTimer: 0,
  };
}

export function getWanted(state) {
  return state ? state.wanted : 0;
}

export function isBusted(state) {
  return !!state && state.busted === true;
}

export function getPoliceUnits(state) {
  return state ? state.units : [];
}

export function getRoadblocks(state) {
  return state ? state.roadblocks : [];
}

export function clearPolice(state) {
  if (!state) return;
  state.units = [];
  state.roadblocks = [];
  state.hideTimer = 0;
}

export function resetBusted(state) {
  if (!state) return;
  state.busted = false;
}

// Satu unit polisi: posisi + sudut + status saja, tanpa bentuk 3D.
function makeUnit(x, z, angle) {
  return {
    x,
    z,
    angle,
    speed: 0,
    status: 'chase',
    path: null,
    pathIndex: 0,
    repath: 0,
  };
}

// Menempatkan `count` unit pada offset yang DITENTUKAN relatif terhadap
// pemain (arah maju dari sinus/kosinus sudut pemain), sehingga unit
// berada dalam pandangan kamera kejar saat staging foto.
export function spawnPoliceNear(state, countOrCtx, maybeCtx) {
  if (!state) return [];
  let count;
  let ctx;
  if (typeof countOrCtx === 'number') {
    count = countOrCtx;
    ctx = maybeCtx;
  } else {
    ctx = countOrCtx;
    count = WANTED_UNIT_COUNT[state.wanted] - state.units.length;
  }
  const player = ctx && ctx.player;
  if (!player || count <= 0) return [];
  const heading = typeof player.angle === 'number' ? player.angle : 0;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const spawned = [];
  for (let i = 0; i < count; i += 1) {
    const off = SPAWN_OFFSETS[(state.units.length + i) % SPAWN_OFFSETS.length];
    const x = clamp(player.x + fx * off.forward + rx * off.right, -MAP_BOUND, MAP_BOUND);
    const z = clamp(player.z + fz * off.forward + rz * off.right, -MAP_BOUND, MAP_BOUND);
    const angle = Math.atan2(player.x - x, player.z - z);
    const unit = makeUnit(x, z, angle);
    state.units.push(unit);
    spawned.push(unit);
  }
  return spawned;
}

function syncUnits(state, ctx) {
  if (!state) return;
  const wanted = clampWanted(state.wanted);
  const desired = WANTED_UNIT_COUNT[wanted];
  if (state.units.length < desired) {
    spawnPoliceNear(state, desired - state.units.length, ctx);
  } else if (state.units.length > desired) {
    state.units.length = desired;
  }
  // Wanted 5: 1 roadblock di depan pemain. Di bawah 5: tidak ada.
  if (wanted === 5) {
    if (state.roadblocks.length === 0 && ctx && ctx.player) {
      const p = ctx.player;
      const heading = typeof p.angle === 'number' ? p.angle : 0;
      state.roadblocks.push({
        x: clamp(p.x + Math.sin(heading) * 35, -MAP_BOUND, MAP_BOUND),
        z: clamp(p.z + Math.cos(heading) * 35, -MAP_BOUND, MAP_BOUND),
        angle: heading,
        status: 'roadblock',
      });
    }
  } else {
    state.roadblocks = [];
  }
}

export function setWanted(state, n, ctx) {
  if (!state) return;
  state.wanted = clampWanted(n);
  if (state.wanted === 0) {
    state.hideTimer = 0;
  }
  if (ctx) syncUnits(state, ctx);
}

export function addWanted(state, n, ctx) {
  if (!state) return;
  setWanted(state, state.wanted + n, ctx);
}

// BUSTED: polisi menyentuh pemain (unit dalam jarak tangkap).
// Bisa terjadi di (0, 0): tidak ada syarat posisi khusus.
export function checkBusted(state, ctx) {
  if (!state || state.busted) return state ? state.busted : false;
  const player = ctx && ctx.player;
  if (!player) return false;
  for (const unit of state.units) {
    if (dist2d(unit.x, unit.z, player.x, player.z) < BUSTED_DISTANCE) {
      state.busted = true;
      if (ctx && typeof ctx.showToast === 'function') {
        ctx.showToast('BUSTED!');
      }
      return true;
    }
  }
  return false;
}

function moveUnitToward(unit, tx, tz, speed, dt) {
  const dx = tx - unit.x;
  const dz = tz - unit.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.01) return;
  const step = Math.min(d, speed * dt);
  unit.x += (dx / d) * step;
  unit.z += (dz / d) * step;
  unit.angle = Math.atan2(dx, dz);
  unit.speed = speed;
}

export function updatePolice(state, dt, ctx) {
  if (!state) return;
  const player = ctx && ctx.player;
  if (!player) return;
  const step = typeof dt === 'number' && dt > 0 ? dt : 0;

  syncUnits(state, ctx);

  if (state.busted) return;

  const speed = 10 + state.wanted * 1.5;
  const findRoadPath = ctx && typeof ctx.findRoadPath === 'function' ? ctx.findRoadPath : null;

  for (const unit of state.units) {
    if (findRoadPath) {
      unit.repath -= step;
      if (unit.repath <= 0 || !unit.path || unit.pathIndex >= unit.path.length) {
        try {
          const path = findRoadPath(
            { x: unit.x, z: unit.z },
            { x: player.x, z: player.z },
          );
          if (Array.isArray(path) && path.length > 0) {
            unit.path = path;
            unit.pathIndex = 0;
          } else {
            unit.path = null;
          }
        } catch (err) {
          unit.path = null;
        }
        unit.repath = 2.5;
      }
      if (unit.path && unit.pathIndex < unit.path.length) {
        const wp = unit.path[unit.pathIndex];
        if (dist2d(unit.x, unit.z, wp.x, wp.z) < 3) {
          unit.pathIndex += 1;
        } else {
          moveUnitToward(unit, wp.x, wp.z, speed, step);
          continue;
        }
      }
    }
    moveUnitToward(unit, player.x, player.z, speed, step);
  }

  // BUSTED saat unit menyentuh pemain.
  checkBusted(state, ctx);

  // Peluruhan wanted: pemain bersembunyi cukup lama — tidak ada unit
  // dalam jarak pandang — wanted turun 1 tiap 8 detik.
  if (state.wanted > 0) {
    let nearest = Infinity;
    for (const unit of state.units) {
      const d = dist2d(unit.x, unit.z, player.x, player.z);
      if (d < nearest) nearest = d;
    }
    if (state.units.length === 0 || nearest > HIDE_DISTANCE) {
      state.hideTimer += step;
      if (state.hideTimer >= HIDE_DECAY_SECONDS) {
        state.hideTimer = 0;
        setWanted(state, state.wanted - 1, ctx);
      }
    } else {
      state.hideTimer = 0;
    }
  } else {
    state.hideTimer = 0;
  }
}
