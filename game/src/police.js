// KOTA MENTARI — game/src/police.js
// Sistem wanted 0–5 dan pengejaran polisi Kota Mentari.
// State-first: semua fungsi menerima keadaan polisi sebagai argumen pertama.
// Keadaan dibuat sekali lewat createPoliceState lalu diteruskan tiap panggil.
// Unit polisi TANPA mesh: modul ini tidak membuat bentuk 3D apa pun;
// loop utama menggambar mobil polisi putih + roadblock dari daftar unit.
// Jalur jalan HANYA dari world.js lewat ctx (findPath / findRoadPath) —
// file ini TIDAK mendefinisikan pencari jalur sendiri.

const MAX_WANTED = 5;
const REPATH_INTERVAL = 1.5;
const DIRECT_CHASE_RADIUS = 25;
const TOUCH_RADIUS = 3.5;
const BUST_RADIUS = 2.5;
const BUST_MAX_SPEED = 2;
const HIDE_RADIUS = 40;
const HIDE_SECONDS = 8;
const HIT_DAMAGE = 8;
const HIT_COOLDOWN = 1.0;

function wantedUnitCount(wanted) {
  if (wanted <= 0) return 0;
  if (wanted === 1) return 2;
  if (wanted === 2) return 3;
  if (wanted === 3) return 4;
  if (wanted === 4) return 5;
  return 6;
}

function wantedRoadblockCount(wanted) {
  if (wanted < 3) return 0;
  if (wanted >= 5) return 2;
  return 1;
}

function policeMaxSpeed(wanted) {
  return 17 + wanted * 1.5;
}

export function createPoliceState() {
  return {
    wanted: 0,
    units: [],
    roadblocks: [],
    busted: false,
    hiddenTimer: 0,
    repathTimer: 0,
    unitSeq: 0,
  };
}

function playerPos(ctx) {
  const p = ctx && ctx.player;
  if (!p) return null;
  if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
  const v = p.pos || p.position;
  if (v && typeof v.x === 'number' && typeof v.z === 'number') return { x: v.x, z: v.z };
  return null;
}

function playerAngle(ctx) {
  const p = ctx && ctx.player;
  if (!p) return 0;
  if (typeof p.angle === 'number') return p.angle;
  if (typeof p.heading === 'number') return p.heading;
  if (typeof p.rotation === 'number') return p.rotation;
  return 0;
}

function playerSpeed(ctx) {
  const p = ctx && ctx.player;
  if (!p) return 0;
  if (typeof p.speed === 'number') return Math.abs(p.speed);
  if (typeof p.vx === 'number' || typeof p.vz === 'number') {
    return Math.hypot(p.vx || 0, p.vz || 0);
  }
  const v = p.velocity || p.vel;
  if (v && (typeof v.x === 'number' || typeof v.z === 'number')) {
    return Math.hypot(v.x || 0, v.z || 0);
  }
  return 0;
}

function damagePlayer(ctx, amount) {
  const p = ctx && ctx.player;
  if (!p) return;
  if (typeof p.health === 'number') p.health = Math.max(0, p.health - amount);
  if (typeof p.nyawa === 'number') p.nyawa = Math.max(0, p.nyawa - amount);
  if (typeof p.hp === 'number') p.hp = Math.max(0, p.hp - amount);
}

function playerHealth(ctx) {
  const p = ctx && ctx.player;
  if (!p) return 100;
  if (typeof p.health === 'number') return p.health;
  if (typeof p.nyawa === 'number') return p.nyawa;
  if (typeof p.hp === 'number') return p.hp;
  return 100;
}

function findPath(ctx, sx, sz, gx, gz) {
  const world = ctx && ctx.world;
  const fn = ctx && (ctx.findPath || ctx.findRoadPath);
  if (typeof fn !== 'function') return null;
  try {
    const path = fn(world, sx, sz, gx, gz);
    if (Array.isArray(path) && path.length > 0) return path;
    return null;
  } catch (e) {
    return null;
  }
}

// Spawn satu unit pada offset yang ditentukan relatif terhadap pemain:
// bergiliran belakang / samping kiri / samping kanan / depan, supaya unit
// berada dalam pandangan kamera kejar saat staging.
export function spawnPoliceNear(state, ctx) {
  if (!state || !ctx) return null;
  const pos = playerPos(ctx);
  if (!pos) return null;
  const heading = playerAngle(ctx);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  // Samping kanan = (fz, -fx) untuk heading (sin, cos).
  const rx = fz;
  const rz = -fx;
  const slot = state.unitSeq % 4;
  state.unitSeq += 1;
  let ox = 0;
  let oz = 0;
  if (slot === 0) { ox = -fx * 32; oz = -fz * 32; }
  else if (slot === 1) { ox = rx * 26 - fx * 8; oz = rz * 26 - fz * 8; }
  else if (slot === 2) { ox = -rx * 26 - fx * 8; oz = -rz * 26 - fz * 8; }
  else { ox = fx * 30 + rx * 12; oz = fz * 30 + rz * 12; }
  const unit = {
    id: state.unitSeq,
    x: pos.x + ox,
    z: pos.z + oz,
    angle: Math.atan2(pos.x - (pos.x + ox), pos.z - (pos.z + oz)),
    speed: 0,
    path: null,
    pathIndex: 0,
    hitCooldown: 0,
  };
  state.units.push(unit);
  return unit;
}

function placeRoadblocks(state, ctx) {
  const pos = playerPos(ctx);
  if (!pos) return;
  const heading = playerAngle(ctx);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const want = wantedRoadblockCount(state.wanted);
  while (state.roadblocks.length < want) {
    const i = state.roadblocks.length;
    const ahead = 55 + i * 25;
    const side = i % 2 === 0 ? 0 : 14;
    state.roadblocks.push({
      x: pos.x + fx * ahead + fz * side,
      z: pos.z + fz * ahead - fx * side,
      angle: heading,
    });
  }
  if (state.roadblocks.length > want) {
    state.roadblocks.length = want;
  }
}

export function setWanted(state, level, ctx) {
  if (!state) return;
  const next = Math.max(0, Math.min(MAX_WANTED, Math.floor(level) || 0));
  const rose = next > state.wanted;
  state.wanted = next;
  if (next === 0) {
    clearPolice(state);
    state.hiddenTimer = 0;
    return;
  }
  if (rose && ctx) {
    // Tambah unit segera supaya respons polisi terasa saat wanted naik.
    while (state.units.length < wantedUnitCount(next)) {
      if (!spawnPoliceNear(state, ctx)) break;
    }
    placeRoadblocks(state, ctx);
  }
}

export function addWanted(state, amount, ctx) {
  if (!state) return;
  setWanted(state, state.wanted + (amount || 0), ctx);
}

export function getWanted(state) {
  if (!state) return 0;
  return state.wanted;
}

export function isBusted(state) {
  if (!state) return false;
  return state.busted === true;
}

export function checkBusted(state, ctx) {
  if (!state) return false;
  if (state.busted) return true;
  if (!ctx || state.wanted < 1) return false;
  const pos = playerPos(ctx);
  if (!pos) return false;
  const speed = playerSpeed(ctx);
  for (const u of state.units) {
    const d = Math.hypot(u.x - pos.x, u.z - pos.z);
    if (d <= BUST_RADIUS && speed <= BUST_MAX_SPEED) {
      state.busted = true;
      return true;
    }
  }
  if (playerHealth(ctx) <= 0) {
    state.busted = true;
    return true;
  }
  return false;
}

export function resetBusted(state) {
  if (!state) return;
  state.busted = false;
}

export function getPoliceUnits(state) {
  if (!state) return [];
  return state.units;
}

export function getRoadblocks(state) {
  if (!state) return [];
  return state.roadblocks;
}

export function clearPolice(state) {
  if (!state) return;
  state.units.length = 0;
  state.roadblocks.length = 0;
}

export function updatePolice(state, dt, ctx) {
  if (!state || !ctx) return;
  const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0;
  if (step <= 0) return;
  const pos = playerPos(ctx);
  if (!pos) return;
  if (state.busted) return;

  if (state.wanted <= 0) {
    if (state.units.length > 0 || state.roadblocks.length > 0) clearPolice(state);
    return;
  }

  // Jaga jumlah unit + roadblock sesuai wanted.
  while (state.units.length < wantedUnitCount(state.wanted)) {
    if (!spawnPoliceNear(state, ctx)) break;
  }
  if (state.units.length > wantedUnitCount(state.wanted)) {
    state.units.length = wantedUnitCount(state.wanted);
  }
  placeRoadblocks(state, ctx);

  // Hitung ulang rute tiap 1,5 detik lewat graf jalan (world.js via ctx).
  state.repathTimer += step;
  if (state.repathTimer >= REPATH_INTERVAL) {
    state.repathTimer = 0;
    for (const u of state.units) {
      const path = findPath(ctx, u.x, u.z, pos.x, pos.z);
      if (path) {
        u.path = path;
        u.pathIndex = 0;
      }
    }
  }

  const maxSpeed = policeMaxSpeed(state.wanted);
  let nearestDist = Infinity;

  for (const u of state.units) {
    if (u.hitCooldown > 0) u.hitCooldown -= step;
    const dx = pos.x - u.x;
    const dz = pos.z - u.z;
    const d = Math.hypot(dx, dz);
    if (d < nearestDist) nearestDist = d;

    // Kejar langsung bila jarak di bawah 25; kalau tidak, ikuti jalur jalan.
    let tx = pos.x;
    let tz = pos.z;
    if (d >= DIRECT_CHASE_RADIUS && u.path && u.path.length > 0) {
      while (u.pathIndex < u.path.length) {
        const wp = u.path[u.pathIndex];
        const wx = typeof wp.x === 'number' ? wp.x : wp[0];
        const wz = typeof wp.z === 'number' ? wp.z : wp[1];
        if (Math.hypot(wx - u.x, wz - u.z) < 4) u.pathIndex += 1;
        else break;
      }
      if (u.pathIndex < u.path.length) {
        const wp = u.path[u.pathIndex];
        tx = typeof wp.x === 'number' ? wp.x : wp[0];
        tz = typeof wp.z === 'number' ? wp.z : wp[1];
      }
    }

    const tdx = tx - u.x;
    const tdz = tz - u.z;
    const td = Math.hypot(tdx, tdz);
    if (td > 0.01) {
      const targetAngle = Math.atan2(tdx, tdz);
      let diff = targetAngle - u.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      u.angle += Math.max(-2.4 * step, Math.min(2.4 * step, diff));
      // Polisi melambat saat berbelok tajam, ngebut saat lurus.
      const align = Math.cos(diff);
      const speed = maxSpeed * (align > 0.6 ? 1 : 0.55);
      u.speed = speed;
      u.x += Math.sin(u.angle) * speed * step;
      u.z += Math.cos(u.angle) * speed * step;
    }

    // Tabrakan menimbulkan kerusakan (tanpa menambah wanted).
    const nd = Math.hypot(pos.x - u.x, pos.z - u.z);
    if (nd <= TOUCH_RADIUS && u.hitCooldown <= 0) {
      u.hitCooldown = HIT_COOLDOWN;
      damagePlayer(ctx, HIT_DAMAGE);
      if (ctx && typeof ctx.showToast === 'function') ctx.showToast('Tabrakan dengan polisi!');
    }
  }

  // BUSTED: polisi menyentuh pemain yang lambat/berhenti saat wanted >= 1,
  // atau nyawa pemain habis.
  if (checkBusted(state, ctx)) return;

  // Wanted luruh saat pemain bersembunyi: jauh dari semua unit polisi.
  if (nearestDist > HIDE_RADIUS) {
    state.hiddenTimer += step;
    if (state.hiddenTimer >= HIDE_SECONDS) {
      state.hiddenTimer = 0;
      setWanted(state, state.wanted - 1, ctx);
    }
  } else {
    state.hiddenTimer = 0;
  }
}
