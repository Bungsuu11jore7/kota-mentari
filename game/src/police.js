// KOTA MENTARI — game/src/police.js
// Sistem wanted 0-5, spawn + pengejaran polisi, roadblock, BUSTED,
// dan peluruhan wanted saat pemain bersembunyi.
// Unit polisi TANPA mesh: modul ini TIDAK membuat bentuk 3D apa pun.
// Loop utama yang menggambar mobil polisi + roadblock dari daftar unit.
// Semua fungsi menerima keadaan polisi sebagai argumen pertama (state-first).
// Keadaan dibuat sekali lewat createPoliceState lalu diteruskan tiap panggil.
// Jalur ditempuh lewat pencari jalur world.js yang diteruskan konteks game
// sebagai ctx.findPath — modul ini tidak mendefinisikan pencari jalur sendiri.

export const MAX_WANTED = 5;
export const DESIRED_UNITS = [0, 2, 3, 4, 5, 6];

const POLICE_BASE_SPEED = 14;
const POLICE_MAX_SPEED = 22;
const POLICE_SPEED_PER_STAR = 1.5;
const REPATH_INTERVAL = 1.5;
const DIRECT_CHASE_RADIUS = 25;
const BUST_RADIUS = 3.5;
const BUST_PLAYER_MAX_SPEED = 3;
const COLLISION_RADIUS = 4;
const COLLISION_DAMAGE = 5;
const HIT_COOLDOWN = 1;
const HIDE_DISTANCE = 90;
const HIDE_TIME_TO_DECAY = 8;
const SPAWN_DISTANCE = 50;
const ROADBLOCK_AHEAD = 70;
const WORLD_BOUND = 480;
const BUSTED_GRACE = 3;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function playerPos(ctx) {
  const p = ctx && ctx.player;
  if (!p) return null;
  if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
  if (p.position && typeof p.position.x === 'number') return { x: p.position.x, z: p.position.z };
  if (p.pos && typeof p.pos.x === 'number') return { x: p.pos.x, z: p.pos.z };
  return null;
}

function playerSpeed(ctx) {
  const p = ctx && ctx.player;
  if (!p) return 0;
  if (typeof p.speed === 'number') return p.speed;
  if (typeof p.speedKmh === 'number') return p.speedKmh / 3.6;
  return 0;
}

function playerAngle(ctx) {
  const p = ctx && ctx.player;
  if (!p) return 0;
  if (typeof p.angle === 'number') return p.angle;
  if (typeof p.heading === 'number') return p.heading;
  return 0;
}

function toast(ctx, text) {
  try {
    if (ctx && typeof ctx.showToast === 'function') ctx.showToast(text);
  } catch (e) {
    // Toast bersifat opsional.
  }
}

// Minta jalur dari konteks game (pencari jalur world.js). Mencoba dua bentuk
// argumen yang dipakai konteks, lalu menyerah ke garis lurus bila tidak ada.
function requestPath(ctx, sx, sz, gx, gz) {
  if (!ctx || typeof ctx.findPath !== 'function') return null;
  const attempts = [
    () => ctx.findPath(sx, sz, gx, gz),
    () => ctx.findPath(ctx.world, sx, sz, gx, gz),
  ];
  for (const attempt of attempts) {
    try {
      const path = attempt();
      if (Array.isArray(path) && path.length > 0) return path;
    } catch (e) {
      // Coba bentuk argumen berikutnya.
    }
  }
  return null;
}

export function createPoliceState() {
  return {
    wanted: 0,
    units: [],
    roadblocks: [],
    busted: false,
    hideTimer: 0,
    repathTimer: 0,
    spawnCycle: 0,
    graceTimer: 0,
    time: 0,
  };
}

export function getWanted(state) {
  if (!state) return 0;
  return state.wanted || 0;
}

export function isBusted(state) {
  if (!state) return false;
  return state.busted === true;
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
  state.units = [];
  state.roadblocks = [];
}

export function setWanted(state, level, ctx) {
  if (!state) return;
  const clamped = clamp(Math.round(level || 0), 0, MAX_WANTED);
  state.wanted = clamped;
  state.hideTimer = 0;
  if (clamped === 0) {
    clearPolice(state);
    return;
  }
  while (state.units.length > DESIRED_UNITS[clamped]) {
    state.units.pop();
  }
  if (clamped < 3) {
    state.roadblocks = [];
  }
}

export function addWanted(state, amount, ctx) {
  if (!state) return;
  const before = state.wanted || 0;
  setWanted(state, before + (amount || 0), ctx);
  if (state.wanted > before) {
    toast(ctx, 'Wanted naik ke ' + state.wanted + ' bintang!');
  }
}

export function spawnPoliceNear(state, ctx) {
  if (!state) return null;
  const pos = playerPos(ctx);
  if (!pos) return null;
  const angle = playerAngle(ctx);
  // Arah maju: komponen x dari sinus, komponen z dari kosinus.
  const hx = Math.sin(angle);
  const hz = Math.cos(angle);
  // Offset DITENTUKAN relatif terhadap pemain, bergiliran: depan, belakang,
  // samping kiri, samping kanan — supaya unit masuk pandangan kamera kejar.
  const cycle = state.spawnCycle % 4;
  state.spawnCycle += 1;
  const distance = SPAWN_DISTANCE + (state.spawnCycle % 3) * 5;
  let ox = 0;
  let oz = 0;
  if (cycle === 0) {
    ox = hx * distance;
    oz = hz * distance;
  } else if (cycle === 1) {
    ox = -hx * distance;
    oz = -hz * distance;
  } else if (cycle === 2) {
    ox = -hz * distance;
    oz = hx * distance;
  } else {
    ox = hz * distance;
    oz = -hx * distance;
  }
  const x = clamp(pos.x + ox, -WORLD_BOUND, WORLD_BOUND);
  const z = clamp(pos.z + oz, -WORLD_BOUND, WORLD_BOUND);
  const unit = {
    x,
    z,
    angle: Math.atan2(pos.x - x, pos.z - z),
    speed: 0,
    path: null,
    pathIndex: 0,
    hitCooldown: 0,
  };
  state.units.push(unit);
  return unit;
}

function addRoadblockAhead(state, ctx) {
  const pos = playerPos(ctx);
  if (!pos) return;
  const angle = playerAngle(ctx);
  const hx = Math.sin(angle);
  const hz = Math.cos(angle);
  state.roadblocks.push({
    x: clamp(pos.x + hx * ROADBLOCK_AHEAD, -WORLD_BOUND, WORLD_BOUND),
    z: clamp(pos.z + hz * ROADBLOCK_AHEAD, -WORLD_BOUND, WORLD_BOUND),
    angle,
  });
}

function repathUnit(state, unit, ctx) {
  const pos = playerPos(ctx);
  if (!pos) return;
  const path = requestPath(ctx, unit.x, unit.z, pos.x, pos.z);
  if (path) {
    unit.path = path;
    unit.pathIndex = 0;
  } else {
    // Tanpa jalur graf jalan: kejar lurus ke pemain.
    unit.path = [{ x: pos.x, z: pos.z }];
    unit.pathIndex = 0;
  }
}

export function checkBusted(state, ctx) {
  if (!state) return false;
  if (state.busted) return true;
  if (state.graceTimer > 0) return false;
  const player = ctx && ctx.player;
  if (!player) return false;
  const health = typeof player.health === 'number' ? player.health : 100;
  if (health <= 0) {
    state.busted = true;
    toast(ctx, 'BUSTED! Nyawamu habis.');
    try {
      if (ctx && typeof ctx.onBusted === 'function') ctx.onBusted();
    } catch (e) {
      // Callback BUSTED bersifat opsional.
    }
    return true;
  }
  if ((state.wanted || 0) < 1) return false;
  // BUSTED: polisi menyentuh pemain yang lambat/berhenti saat wanted >= 1.
  if (playerSpeed(ctx) >= BUST_PLAYER_MAX_SPEED) return false;
  const pos = playerPos(ctx);
  if (!pos) return false;
  for (const unit of state.units) {
    if (dist(unit.x, unit.z, pos.x, pos.z) < BUST_RADIUS) {
      state.busted = true;
      toast(ctx, 'BUSTED! Polisi menangkapmu.');
      try {
        if (ctx && typeof ctx.onBusted === 'function') ctx.onBusted();
      } catch (e) {
        // Callback BUSTED bersifat opsional.
      }
      return true;
    }
  }
  return false;
}

export function resetBusted(state) {
  if (!state) return;
  state.busted = false;
  state.units = [];
  state.roadblocks = [];
  state.hideTimer = 0;
  // Masa tenggang singkat supaya pemain tidak langsung tertangkap lagi.
  state.graceTimer = BUSTED_GRACE;
}

export function updatePolice(state, dt, ctx) {
  if (!state || state.busted) return;
  if (typeof dt !== 'number' || dt <= 0) dt = 0.016;
  state.time += dt;
  if (state.graceTimer > 0) state.graceTimer -= dt;
  const pos = playerPos(ctx);
  if (!pos) return;
  const wanted = clamp(state.wanted || 0, 0, MAX_WANTED);
  state.wanted = wanted;

  // Jumlah unit mengikuti wanted; wanted 5 memicu 6 unit.
  const desired = DESIRED_UNITS[wanted];
  if (state.graceTimer <= 0) {
    while (state.units.length < desired) {
      if (!spawnPoliceNear(state, ctx)) break;
    }
  }
  while (state.units.length > desired) {
    state.units.pop();
  }

  // Roadblock saat wanted minimal 3 (wanted 5: 6 unit + 1 roadblock).
  if (wanted >= 3 && state.roadblocks.length === 0) {
    addRoadblockAhead(state, ctx);
  } else if (wanted < 3 && state.roadblocks.length > 0) {
    state.roadblocks = [];
  }

  // Hitung ulang rute tiap 1,5 detik lewat graf jalan (ctx.findPath).
  state.repathTimer += dt;
  if (state.repathTimer >= REPATH_INTERVAL) {
    state.repathTimer = 0;
    for (const unit of state.units) {
      repathUnit(state, unit, ctx);
    }
  }

  const policeSpeed = Math.min(POLICE_BASE_SPEED + wanted * POLICE_SPEED_PER_STAR, POLICE_MAX_SPEED);
  for (const unit of state.units) {
    if (unit.hitCooldown > 0) unit.hitCooldown -= dt;
    const d = dist(unit.x, unit.z, pos.x, pos.z);
    let moveX = 0;
    let moveZ = 0;
    if (d < DIRECT_CHASE_RADIUS) {
      // Kejar langsung bila jarak di bawah 25.
      moveX = pos.x - unit.x;
      moveZ = pos.z - unit.z;
    } else {
      // Ikuti jalur graf jalan.
      if (!unit.path || unit.pathIndex >= unit.path.length) {
        repathUnit(state, unit, ctx);
      }
      const waypoint = unit.path && unit.path[unit.pathIndex];
      if (waypoint) {
        moveX = waypoint.x - unit.x;
        moveZ = waypoint.z - unit.z;
        if (Math.hypot(moveX, moveZ) < 5) {
          unit.pathIndex += 1;
          const next = unit.path[unit.pathIndex];
          if (next) {
            moveX = next.x - unit.x;
            moveZ = next.z - unit.z;
          } else {
            moveX = pos.x - unit.x;
            moveZ = pos.z - unit.z;
          }
        }
      } else {
        moveX = pos.x - unit.x;
        moveZ = pos.z - unit.z;
      }
    }
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 0.001) {
      moveX /= moveLen;
      moveZ /= moveLen;
      unit.x = clamp(unit.x + moveX * policeSpeed * dt, -WORLD_BOUND, WORLD_BOUND);
      unit.z = clamp(unit.z + moveZ * policeSpeed * dt, -WORLD_BOUND, WORLD_BOUND);
      unit.angle = Math.atan2(moveX, moveZ);
      unit.speed = policeSpeed;
    } else {
      unit.speed = 0;
    }
    // Tabrakan menimbulkan kerusakan TANPA menambah wanted.
    const afterD = dist(unit.x, unit.z, pos.x, pos.z);
    if (afterD < COLLISION_RADIUS && unit.hitCooldown <= 0) {
      const player = ctx.player;
      if (player && typeof player.health === 'number') {
        player.health = Math.max(0, player.health - COLLISION_DAMAGE);
      } else if (player) {
        player.health = 100 - COLLISION_DAMAGE;
      }
      unit.hitCooldown = HIT_COOLDOWN;
    }
  }

  // Peluruhan wanted: pemain bersembunyi (jauh dari polisi) cukup lama.
  if (wanted > 0) {
    let nearest = Infinity;
    for (const unit of state.units) {
      const d = dist(unit.x, unit.z, pos.x, pos.z);
      if (d < nearest) nearest = d;
    }
    if (nearest > HIDE_DISTANCE || state.units.length === 0) {
      state.hideTimer += dt;
    } else {
      state.hideTimer = 0;
    }
    if (state.hideTimer >= HIDE_TIME_TO_DECAY) {
      state.hideTimer = 0;
      setWanted(state, wanted - 1, ctx);
      toast(ctx, 'Polisi kehilangan jejakmu. Wanted turun ke ' + state.wanted + '.');
    }
  } else {
    state.hideTimer = 0;
  }

  checkBusted(state, ctx);
}
