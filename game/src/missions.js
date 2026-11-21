// KOTA MENTARI — game/src/missions.js
// Alur 6 misi berurutan: Paket Kilat, Mobil Pinjaman, Kejar Bayangan,
// Tolong Mira, Brankas Pelabuhan, Jalan Pulang. Total hadiah 29.700.
// Semua fungsi menerima keadaan misi sebagai argumen pertama (state-first).
// Keadaan dibuat sekali lewat createMissionState lalu diteruskan tiap panggil.
// Hadiah misi ditambah ke uang pemain (player.uang). Misi 4 hanya men-spawn
// penyerang; yang menggerakkan mereka adalah loop utama.

export const MISSION_REWARDS = [500, 1200, 2000, 3000, 8000, 15000];
export const TOTAL_REWARD = 29700;

export const MISSIONS = [
  {
    index: 0,
    name: 'Paket Kilat',
    briefing: 'Antar 3 paket ke penanda kuning di Menara (100, -300).',
    target: { x: 100, z: -300 },
    reward: 500,
  },
  {
    index: 1,
    name: 'Mobil Pinjaman',
    briefing: 'Curi mobil oranye di (100, 0), lalu bawa ke Pesisir (0, 400).',
    target: { x: 0, z: 400 },
    carSpawn: { x: 100, z: 0 },
    reward: 1200,
  },
  {
    index: 2,
    name: 'Kejar Bayangan',
    briefing: 'Kejar target yang melarikan diri sampai ke Pesisir.',
    target: { x: 0, z: 400 },
    reward: 2000,
  },
  {
    index: 3,
    name: 'Tolong Mira',
    briefing: 'Selamatkan Mira di (-200, 100) dari 3 penyerang Geng Ombak.',
    target: { x: -200, z: 100 },
    reward: 3000,
  },
  {
    index: 4,
    name: 'Brankas Pelabuhan',
    briefing: 'Berdiri di penanda brankas di Pelabuhan (400, 300) selama 5 detik.',
    target: { x: 400, z: 300 },
    reward: 8000,
  },
  {
    index: 5,
    name: 'Jalan Pulang',
    briefing: 'Kabur ke kapal di (470, 350). Jangan sampai tertangkap!',
    target: { x: 470, z: 350 },
    reward: 15000,
  },
];

const DELIVERY_RADIUS = 18;
const DELIVERY_COOLDOWN = 1.2;
const DELIVERY_DEBOUNCE = 0.5;
const MISSION2_ARRIVE_RADIUS = 20;
const CHASE_CATCH_DISTANCE = 10;
const CHASE_CATCH_HOLD = 3;
const CHASE_FAR_SPAWN = 120;
const CHASE_ADOPT_MIN_DISTANCE = 80;
const CHASE_PESISIR_GATE = 150;
const CHASE_FLEE_SPEED = 14;
const CHASE_SLOW_SPEED = 7;
const CHASE_SLOW_RADIUS = 70;
const MIRA_MEET_RADIUS = 40;
const ATTACKERS_NEEDED = 3;
const VAULT_RADIUS = 12;
const VAULT_HOLD = 5;
const SHIP_ARRIVE_RADIUS = 15;
const WORLD_BOUND = 480;
const PESISIR = { x: 0, z: 400 };

const CHASE_SPAWN_CANDIDATES = [
  { x: 320, z: -320 },
  { x: -350, z: -250 },
  { x: 380, z: 120 },
  { x: -320, z: 320 },
  { x: 250, z: 380 },
];

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

function toast(ctx, text) {
  try {
    if (ctx && typeof ctx.showToast === 'function') ctx.showToast(text);
  } catch (e) {
    // Toast bersifat opsional; kegagalannya tidak boleh menghentikan misi.
  }
}

function resetMissionProgress(state) {
  state.packagesDelivered = 0;
  state.packageCooldown = 0;
  state.lastDeliveryAt = -10;
  state.carStolen = false;
  state.chaseTarget = null;
  state.chaseSpawn = null;
  state.chaseCaught = false;
  state.chaseCloseTime = 0;
  state.attackersSpawned = false;
  state.enemiesDefeated = 0;
  state.standTime = 0;
}

export function createMissionState() {
  const state = {
    current: 0,
    completed: false,
    started: false,
    time: 0,
    packagesDelivered: 0,
    packageCooldown: 0,
    lastDeliveryAt: -10,
    carStolen: false,
    chaseTarget: null,
    chaseSpawn: null,
    chaseCaught: false,
    chaseCloseTime: 0,
    attackersSpawned: false,
    enemiesDefeated: 0,
    standTime: 0,
  };
  return state;
}

function pickChaseSpawn(state, ctx) {
  const pos = playerPos(ctx) || { x: 0, z: 0 };
  let best = null;
  let bestDist = -1;
  for (const c of CHASE_SPAWN_CANDIDATES) {
    const d = dist(c.x, c.z, pos.x, pos.z);
    if (d > bestDist) {
      bestDist = d;
      best = c;
    }
  }
  if (bestDist < CHASE_FAR_SPAWN) {
    // Titik kandidat terdekat pun terlalu dekat: dorong menjauh dari Pesisir.
    let dx = pos.x - PESISIR.x;
    let dz = pos.z - PESISIR.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    best = {
      x: Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, pos.x + dx * 180)),
      z: Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, pos.z + dz * 180)),
    };
  }
  state.chaseSpawn = { x: best.x, z: best.z };
  return state.chaseSpawn;
}

function adoptChaseTarget(state, ctx) {
  if (state.chaseTarget) return state.chaseTarget;
  const target = ctx && ctx.chaseTarget;
  if (!target) return null;
  state.chaseTarget = target;
  // Status awal WAJIB tidak tertangkap, apa pun yang dibawa loop utama.
  target.caught = false;
  state.chaseCaught = false;
  const pos = playerPos(ctx);
  if (pos && typeof target.x === 'number' && typeof target.z === 'number') {
    if (dist(target.x, target.z, pos.x, pos.z) < CHASE_ADOPT_MIN_DISTANCE) {
      // Ter-spawn terlalu dekat dari pemain: pindahkan ke titik jauh.
      const spawn = state.chaseSpawn || pickChaseSpawn(state, ctx);
      target.x = spawn.x;
      target.z = spawn.z;
    }
  }
  return target;
}

export function startMission(state, index, ctx) {
  if (!state) return;
  if (typeof index !== 'number' || index < 0 || index >= MISSIONS.length) return;
  state.current = index;
  state.started = true;
  resetMissionProgress(state);
  const mission = MISSIONS[index];
  if (index === 1) {
    // Misi 2: mobil oranye misi di-spawn lewat konteks game.
    try {
      if (ctx && typeof ctx.spawnMissionCar === 'function') {
        ctx.spawnMissionCar(100, 0, 'orange');
      }
    } catch (e) {
      // Spawn gagal ditangani loop utama; misi tetap menunggu mobil dicuri.
    }
  } else if (index === 2) {
    // Misi 3: target WAJIB ter-spawn JAUH dari pemain dan melarikan diri.
    pickChaseSpawn(state, ctx);
    try {
      if (ctx && typeof ctx.spawnChaseTarget === 'function') {
        ctx.spawnChaseTarget();
      }
    } catch (e) {
      // Spawn gagal ditangani loop utama; updateMissions mengadopsi nanti.
    }
    adoptChaseTarget(state, ctx);
  } else if (index === 3) {
    // Misi 4: spawn 3 penyerang di posisi Mira; loop utama yang menggerakkan.
    try {
      if (ctx && typeof ctx.spawnAttackers === 'function') {
        ctx.spawnAttackers(-200, 100, ATTACKERS_NEEDED);
        state.attackersSpawned = true;
      }
    } catch (e) {
      state.attackersSpawned = false;
    }
  } else if (index === 5) {
    // Misi 6: wanted naik ke 3 saat misi dimulai.
    try {
      if (ctx && typeof ctx.setWanted === 'function' && ctx.policeState) {
        ctx.setWanted(ctx.policeState, 3, ctx);
      } else if (ctx && ctx.policeState && typeof ctx.policeState.wanted === 'number') {
        ctx.policeState.wanted = 3;
        ctx.policeState.hideTimer = 0;
      }
    } catch (e) {
      // Wanted gagal dinaikkan; misi tetap berjalan.
    }
  }
  toast(ctx, 'Misi ' + (index + 1) + ': ' + mission.name + ' — ' + mission.briefing);
}

export function resetCurrentMission(state, ctx) {
  if (!state) return;
  if (state.completed) return;
  startMission(state, state.current, ctx);
}

export function completeMission(state, ctx) {
  if (!state || state.completed) return;
  const index = state.current;
  if (index < 0 || index >= MISSIONS.length) return;
  const reward = MISSION_REWARDS[index];
  const player = ctx && ctx.player;
  if (player) {
    player.uang = (typeof player.uang === 'number' ? player.uang : 0) + reward;
  }
  toast(ctx, 'Misi selesai! Hadiah +' + reward);
  try {
    if (ctx && typeof ctx.saveGame === 'function') ctx.saveGame();
  } catch (e) {
    // Gagal simpan tidak membatalkan hadiah misi.
  }
  state.current = index + 1;
  if (state.current >= MISSIONS.length) {
    state.completed = true;
    state.started = false;
    toast(ctx, 'TAMAT — Raka berhasil kabur dari Kota Mentari!');
    try {
      if (ctx && typeof ctx.onAllMissionsComplete === 'function') ctx.onAllMissionsComplete();
      else if (ctx && typeof ctx.onGameComplete === 'function') ctx.onGameComplete();
    } catch (e) {
      // Callback akhir bersifat opsional.
    }
    return;
  }
  startMission(state, state.current, ctx);
}

export function onCarStolen(state, ctx) {
  if (!state || state.completed || state.current !== 1) return;
  if (state.carStolen) return;
  state.carStolen = true;
  toast(ctx, 'Mobil oranye dicuri! Bawa ke Pesisir (0, 400).');
}

export function onEnemyDefeated(state, ctx) {
  if (!state || state.completed || state.current !== 3) return;
  state.enemiesDefeated += 1;
  toast(ctx, 'Penyerang dikalahkan ' + state.enemiesDefeated + '/' + ATTACKERS_NEEDED);
  if (state.enemiesDefeated >= ATTACKERS_NEEDED) {
    completeMission(state, ctx);
  }
}

export function onPackageDelivered(state, ctx) {
  if (!state || state.completed || state.current !== 0) return;
  // Anti ganda: abaikan panggilan yang terlalu rapat dengan antar sebelumnya.
  if (state.time - state.lastDeliveryAt < DELIVERY_DEBOUNCE) return;
  state.packagesDelivered += 1;
  state.lastDeliveryAt = state.time;
  toast(ctx, 'Paket ' + state.packagesDelivered + ' dari 3 terantar');
  if (state.packagesDelivered >= 3) {
    completeMission(state, ctx);
  }
}

function updateChaseTarget(state, dt, ctx) {
  const target = adoptChaseTarget(state, ctx);
  if (!target) return;
  const pos = playerPos(ctx);
  if (!pos) return;
  // Target MELARIKAN DIRI: menjauh dari pemain sambil menuju Pesisir.
  let awayX = target.x - pos.x;
  let awayZ = target.z - pos.z;
  const awayLen = Math.hypot(awayX, awayZ) || 1;
  awayX /= awayLen;
  awayZ /= awayLen;
  let toX = PESISIR.x - target.x;
  let toZ = PESISIR.z - target.z;
  const toLen = Math.hypot(toX, toZ) || 1;
  toX /= toLen;
  toZ /= toLen;
  // Sedikit goyangan menghindar supaya jalurnya tidak lurus membosankan.
  const wobble = Math.sin(state.time * 1.3) * 0.35;
  let dirX = toX * 0.7 + awayX * 0.6 + -toZ * wobble;
  let dirZ = toZ * 0.7 + awayZ * 0.6 + toX * wobble;
  const dirLen = Math.hypot(dirX, dirZ) || 1;
  dirX /= dirLen;
  dirZ /= dirLen;
  const distToPesisir = dist(target.x, target.z, PESISIR.x, PESISIR.z);
  const speed = distToPesisir < CHASE_SLOW_RADIUS ? CHASE_SLOW_SPEED : CHASE_FLEE_SPEED;
  target.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, target.x + dirX * speed * dt));
  target.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, target.z + dirZ * speed * dt));
  if (typeof target.angle === 'number') {
    target.angle = Math.atan2(dirX, dirZ);
  }
}

export function updateMissions(state, dt, ctx) {
  if (!state || state.completed) return;
  if (typeof dt !== 'number' || dt <= 0) dt = 0.016;
  state.time += dt;
  if (state.packageCooldown > 0) state.packageCooldown -= dt;
  const pos = playerPos(ctx);
  if (!pos) return;
  const index = state.current;
  if (index === 0) {
    // Misi 1: antar 3 paket ke Menara (100, -300).
    if (dist(pos.x, pos.z, 100, -300) <= DELIVERY_RADIUS && state.packageCooldown <= 0) {
      state.packageCooldown = DELIVERY_COOLDOWN;
      onPackageDelivered(state, ctx);
    }
    return;
  }
  if (index === 1) {
    // Misi 2: mobil curian dibawa ke Pesisir (0, 400).
    if (!state.carStolen) return;
    const player = ctx.player;
    const inCar =
      player.inCar !== undefined
        ? player.inCar
        : player.inVehicle !== undefined
          ? player.inVehicle
          : player.driving !== undefined
            ? player.driving
            : player.vehicle
              ? true
              : undefined;
    if (inCar === false) return;
    if (dist(pos.x, pos.z, 0, 400) <= MISSION2_ARRIVE_RADIUS) {
      completeMission(state, ctx);
    }
    return;
  }
  if (index === 2) {
    // Misi 3: kejar target sampai ke Pesisir; TIDAK BOLEH selesai instan.
    updateChaseTarget(state, dt, ctx);
    const target = state.chaseTarget;
    if (!target || typeof target.x !== 'number') return;
    if (state.chaseCaught) return;
    const d = dist(pos.x, pos.z, target.x, target.z);
    if (d < CHASE_CATCH_DISTANCE) {
      state.chaseCloseTime += dt;
    } else {
      state.chaseCloseTime = 0;
    }
    const targetToPesisir = dist(target.x, target.z, PESISIR.x, PESISIR.z);
    // Selesai hanya bila pemain menempel <10 selama 3 detik DAN target
    // sudah sampai di kawasan Pesisir — bukan di tengah jalan.
    if (state.chaseCloseTime >= CHASE_CATCH_HOLD && targetToPesisir <= CHASE_PESISIR_GATE) {
      state.chaseCaught = true;
      target.caught = true;
      toast(ctx, 'Target tertangkap di Pesisir!');
      completeMission(state, ctx);
    }
    return;
  }
  if (index === 3) {
    // Misi 4: temui Mira; penyerang di-spawn saat pemain mendekat bila
    // spawn di awal misi belum terjadi; modul ini TIDAK menggerakkan mereka.
    if (!state.attackersSpawned && dist(pos.x, pos.z, -200, 100) <= MIRA_MEET_RADIUS) {
      try {
        if (ctx && typeof ctx.spawnAttackers === 'function') {
          ctx.spawnAttackers(-200, 100, ATTACKERS_NEEDED);
          state.attackersSpawned = true;
        }
      } catch (e) {
        // Spawn gagal; coba lagi saat pemain tetap di dekat Mira.
      }
    }
    if (state.attackersSpawned && state.enemiesDefeated >= ATTACKERS_NEEDED) {
      completeMission(state, ctx);
    }
    return;
  }
  if (index === 4) {
    // Misi 5: berdiri di penanda brankas (400, 300) selama 5 detik.
    if (dist(pos.x, pos.z, 400, 300) <= VAULT_RADIUS) {
      state.standTime += dt;
      if (state.standTime >= VAULT_HOLD) {
        toast(ctx, 'Brankas Pelabuhan berhasil dibuka!');
        completeMission(state, ctx);
      }
    } else {
      state.standTime = 0;
    }
    return;
  }
  if (index === 5) {
    // Misi 6: kabur ke kapal (470, 350) -> TAMAT.
    if (dist(pos.x, pos.z, 470, 350) <= SHIP_ARRIVE_RADIUS) {
      completeMission(state, ctx);
    }
    return;
  }
}

export function getObjectiveText(state, ctx) {
  if (!state) return '';
  if (state.completed || state.current >= MISSIONS.length) {
    return 'Semua misi selesai!';
  }
  const index = state.current;
  if (index === 0) {
    return (
      'Paket Kilat — Antar paket ke Menara (100, -300): ' +
      state.packagesDelivered +
      '/3 terantar'
    );
  }
  if (index === 1) {
    return state.carStolen
      ? 'Mobil Pinjaman — Bawa mobil oranye ke Pesisir (0, 400)'
      : 'Mobil Pinjaman — Curi mobil oranye di (100, 0)';
  }
  if (index === 2) {
    return 'Kejar Bayangan — Kejar target sampai ke Pesisir, jangan sampai lolos!';
  }
  if (index === 3) {
    return (
      'Tolong Mira — Kalahkan penyerang Geng Ombak di (-200, 100): ' +
      state.enemiesDefeated +
      '/' +
      ATTACKERS_NEEDED
    );
  }
  if (index === 4) {
    return (
      'Brankas Pelabuhan — Berdiri di penanda (400, 300): ' +
      state.standTime.toFixed(1) +
      '/5 detik'
    );
  }
  if (index === 5) {
    return 'Jalan Pulang — Kabur ke kapal di (470, 350)!';
  }
  return '';
}

export function getActiveMarker(state, ctx) {
  if (!state) return null;
  if (state.completed || state.current >= MISSIONS.length) return null;
  const index = state.current;
  if (index === 0) return { x: 100, z: -300 };
  if (index === 1) {
    return state.carStolen ? { x: 0, z: 400 } : { x: 100, z: 0 };
  }
  if (index === 2) {
    const target = state.chaseTarget || (ctx && ctx.chaseTarget);
    if (target && typeof target.x === 'number' && typeof target.z === 'number') {
      return { x: target.x, z: target.z };
    }
    if (state.chaseSpawn) return { x: state.chaseSpawn.x, z: state.chaseSpawn.z };
    return { x: PESISIR.x, z: PESISIR.z };
  }
  if (index === 3) return { x: -200, z: 100 };
  if (index === 4) return { x: 400, z: 300 };
  if (index === 5) return { x: 470, z: 350 };
  return null;
}

export function getCurrentMission(state) {
  if (!state) return null;
  if (state.current < 0 || state.current >= MISSIONS.length) return null;
  return MISSIONS[state.current];
}

export function isAllMissionsComplete(state) {
  if (!state) return false;
  return state.completed === true || state.current >= MISSIONS.length;
}
