// missions.js — Modul misi "KOTA MENTARI" (GTA6-01 v7, Lane C).
// Enam misi berurutan. Keadaan misi dibuat sekali oleh loop utama dan
// diteruskan state-first ke semua fungsi. Uang tinggal di pemain;
// konteks hanya cermin. Modul ini hanya men-spawn lewat konteks,
// tidak menggerakkan penyerang dan tidak membuat bentuk 3D apa pun.

export const MISSION_REWARDS = [500, 1200, 2000, 3000, 8000, 15000];
export const TOTAL_REWARD = 29700;

export const MISSIONS = [
  {
    id: 1,
    name: 'Paket Kilat',
    reward: 500,
    target: { x: 100, z: -300 },
    place: 'Menara',
    brief: 'Antar 3 paket ke penanda kuning di Menara.',
  },
  {
    id: 2,
    name: 'Mobil Pinjaman',
    reward: 1200,
    target: { x: 0, z: 400 },
    carSpot: { x: 100, z: 0 },
    place: 'Pesisir',
    brief: 'Curi mobil oranye di (100, 0), bawa ke Pesisir.',
  },
  {
    id: 3,
    name: 'Kejar Bayangan',
    reward: 2000,
    target: { x: 0, z: 400 },
    place: 'Pesisir',
    brief: 'Kejar target yang melarikan diri sampai ke Pesisir.',
  },
  {
    id: 4,
    name: 'Tolong Mira',
    reward: 3000,
    target: { x: -200, z: 100 },
    place: 'Pasar Lama',
    brief: 'Selamatkan Mira di (-200, 100) dari 3 penyerang Geng Ombak.',
  },
  {
    id: 5,
    name: 'Brankas Pelabuhan',
    reward: 8000,
    target: { x: 400, z: 300 },
    place: 'Pelabuhan',
    brief: 'Ambil brankas di Pelabuhan (400, 300).',
  },
  {
    id: 6,
    name: 'Jalan Pulang',
    reward: 15000,
    target: { x: 470, z: 350 },
    place: 'Pelabuhan',
    brief: 'Kabur ke kapal di (470, 350).',
  },
];

const DELIVERY_RADIUS = 14;
const DELIVERY_LEAVE_RADIUS = 17;
const ARRIVE_RADIUS = 14;
const CATCH_RADIUS = 5;
const PESISIR = { x: 0, z: 400 };
const PESISIR_CATCH_RADIUS = 80;
const CHASE_SPAWN_MIN_DISTANCE = 80;
const CHASE_FLEE_SPEED = 7.5;
const MAP_BOUND = 470;

function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function showToast(ctx, text) {
  if (ctx && typeof ctx.showToast === 'function') {
    ctx.showToast(text);
  }
}

function addMoneyToPlayer(state, ctx, amount) {
  // Uang kanonis tinggal di player.uang (updatePlayer tiap frame menimpa
  // player.money = player.uang). Menambah hanya ke money akan terhapus
  // di frame berikutnya, jadi hadiah misi tidak pernah sampai.
  if (ctx && ctx.player && typeof ctx.player.uang === 'number') {
    ctx.player.uang += amount;
    ctx.player.money = ctx.player.uang;
  } else if (ctx && ctx.player && typeof ctx.player.money === 'number') {
    ctx.player.money += amount;
  }
  if (ctx && 'money' in ctx && ctx.player) {
    ctx.money = ctx.player.uang || ctx.player.money || 0;
  }
  state.totalEarned += amount;
}

export function createMissionState() {
  return {
    current: 0,
    completed: false,
    started: false,
    delivered: 0,
    leftZone: true,
    carStolen: false,
    enemiesDefeated: 0,
    enemiesNeeded: 3,
    targetCaught: false,
    totalEarned: 0,
  };
}

export function getCurrentMission(state) {
  if (!state || state.completed || state.current >= MISSIONS.length) return null;
  return MISSIONS[state.current];
}

export function isAllMissionsComplete(state) {
  return !!state && state.completed === true;
}

// Titik spawn target kejar yang JAUH dari pemain: 120 unit ke arah
// Pesisir dari posisi pemain, supaya kejar-kejaran benar-benar terjadi.
function farChaseSpawnPoint(player) {
  let dx = PESISIR.x - player.x;
  let dz = PESISIR.z - player.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1) {
    dx = -0.6;
    dz = -0.8;
  } else {
    dx /= len;
    dz /= len;
  }
  return {
    x: clamp(player.x + dx * 120, -MAP_BOUND, MAP_BOUND),
    z: clamp(player.z + dz * 120, -MAP_BOUND, MAP_BOUND),
  };
}

export function startMission(state, ctx) {
  if (!state || state.completed) return;
  state.started = true;
  const mission = MISSIONS[state.current];
  const player = ctx && ctx.player;
  if (state.current === 0) {
    state.delivered = 0;
    state.leftZone = true;
  } else if (state.current === 1) {
    state.carStolen = false;
    if (ctx && typeof ctx.spawnMissionCar === 'function') {
      ctx.spawnMissionCar(100, 0, 'orange');
    }
  } else if (state.current === 2) {
    state.targetCaught = false;
    if (ctx && typeof ctx.spawnChaseTarget === 'function') {
      ctx.spawnChaseTarget();
    }
    // PERBAIKAN v7: target WAJIB jauh dari pemain dan BELUM tertangkap.
    // Apa pun yang dilakukan pemicu spawn, perbaiki di sini: bila tidak
    // ada target, buat satu; bila terlalu dekat, pindahkan jauh; bila
    // statusnya sudah tertangkap, kembalikan ke belum tertangkap.
    if (ctx) {
      if (!ctx.chaseTarget) {
        const spot = player ? farChaseSpawnPoint(player) : { x: -150, z: -200 };
        ctx.chaseTarget = { x: spot.x, z: spot.z, caught: false };
      } else {
        ctx.chaseTarget.caught = false;
        if (player) {
          const d = dist2d(player.x, player.z, ctx.chaseTarget.x, ctx.chaseTarget.z);
          if (d < CHASE_SPAWN_MIN_DISTANCE) {
            const spot = farChaseSpawnPoint(player);
            ctx.chaseTarget.x = spot.x;
            ctx.chaseTarget.z = spot.z;
          }
        }
      }
    }
  } else if (state.current === 3) {
    state.enemiesDefeated = 0;
    state.enemiesNeeded = 3;
    if (ctx && typeof ctx.spawnAttackers === 'function') {
      ctx.spawnAttackers(-200, 100, 3);
    }
  }
  showToast(ctx, `Misi ${mission.id}: ${mission.name} — ${mission.brief}`);
}

export function resetCurrentMission(state, ctx) {
  if (!state || state.completed) return;
  state.delivered = 0;
  state.leftZone = true;
  state.carStolen = false;
  state.enemiesDefeated = 0;
  state.targetCaught = false;
  state.started = false;
  startMission(state, ctx);
}

export function completeMission(state, ctx) {
  const mission = getCurrentMission(state);
  if (!mission) return;
  addMoneyToPlayer(state, ctx, mission.reward);
  showToast(ctx, `Misi selesai: ${mission.name} (+${mission.reward})`);
  state.current += 1;
  state.started = false;
  if (state.current >= MISSIONS.length) {
    state.completed = true;
  } else {
    startMission(state, ctx);
  }
}

export function onCarStolen(state, ctx) {
  if (!state || state.completed || state.current !== 1) return;
  state.carStolen = true;
  showToast(ctx, 'Mobil dicuri! Bawa ke Pesisir (0, 400).');
}

export function onEnemyDefeated(state, ctx) {
  if (!state || state.completed || state.current !== 3) return;
  state.enemiesDefeated += 1;
  showToast(ctx, `Penyerang dikalahkan (${state.enemiesDefeated}/3).`);
  if (state.enemiesDefeated >= state.enemiesNeeded) {
    completeMission(state, ctx);
  }
}

export function onPackageDelivered(state, ctx) {
  if (!state || state.completed || state.current !== 0) return;
  state.delivered += 1;
  state.leftZone = false;
  showToast(ctx, `Paket ${state.delivered} dari 3 terantar`);
  if (state.delivered >= 3) {
    completeMission(state, ctx);
  }
}

export function getObjectiveText(state, ctx) {
  if (!state) return '';
  if (state.completed) return 'Semua misi selesai — TAMAT';
  const mission = MISSIONS[state.current];
  if (!mission) return '';
  if (state.current === 0) {
    return `Paket Kilat: Antar paket ke Menara (100, -300) — Paket ${state.delivered} dari 3 terantar`;
  }
  if (state.current === 1) {
    return state.carStolen
      ? 'Mobil Pinjaman: Bawa mobil curian ke Pesisir (0, 400)'
      : 'Mobil Pinjaman: Curi mobil oranye di (100, 0)';
  }
  if (state.current === 2) {
    return 'Kejar Bayangan: Tangkap target yang melarikan diri di dekat Pesisir';
  }
  if (state.current === 3) {
    return `Tolong Mira: Kalahkan penyerang Geng Ombak (${state.enemiesDefeated}/3) di (-200, 100)`;
  }
  if (state.current === 4) {
    return 'Brankas Pelabuhan: Ambil brankas di Pelabuhan (400, 300)';
  }
  return 'Jalan Pulang: Kabur ke kapal di (470, 350)';
}

export function getActiveMarker(state, ctx) {
  if (!state || state.completed) return null;
  if (state.current === 0) return { x: 100, z: -300 };
  if (state.current === 1) {
    return state.carStolen ? { x: 0, z: 400 } : { x: 100, z: 0 };
  }
  if (state.current === 2) {
    const t = ctx && ctx.chaseTarget;
    if (t && typeof t.x === 'number' && typeof t.z === 'number') {
      return { x: t.x, z: t.z };
    }
    return { x: 0, z: 400 };
  }
  if (state.current === 3) return { x: -200, z: 100 };
  if (state.current === 4) return { x: 400, z: 300 };
  if (state.current === 5) return { x: 470, z: 350 };
  return null;
}

export function updateMissions(state, dt, ctx) {
  if (!state || state.completed) return;
  if (!state.started) startMission(state, ctx);
  const player = ctx && ctx.player;
  if (!player) return;
  const step = typeof dt === 'number' && dt > 0 ? dt : 0;

  if (state.current === 0) {
    const d = dist2d(player.x, player.z, 100, -300);
    if (d > DELIVERY_LEAVE_RADIUS) {
      state.leftZone = true;
    } else if (d < DELIVERY_RADIUS && state.leftZone) {
      onPackageDelivered(state, ctx);
    }
    return;
  }

  if (state.current === 1) {
    if (!state.carStolen) return;
    const driving = typeof player.inCar === 'undefined' ? true : !!player.inCar;
    if (driving && dist2d(player.x, player.z, 0, 400) < ARRIVE_RADIUS) {
      completeMission(state, ctx);
    }
    return;
  }

  if (state.current === 2) {
    const target = ctx && ctx.chaseTarget;
    if (!target) {
      startMission(state, ctx);
      return;
    }
    if (target.caught) return;
    // Target MELARIKAN DIRI: menjauh dari pemain, bias ke arah Pesisir
    // supaya kejar-kejaran berakhir di dekat Pesisir.
    let ax = target.x - player.x;
    let az = target.z - player.z;
    const awayLen = Math.sqrt(ax * ax + az * az) || 1;
    ax /= awayLen;
    az /= awayLen;
    let px = PESISIR.x - target.x;
    let pz = PESISIR.z - target.z;
    const pLen = Math.sqrt(px * px + pz * pz) || 1;
    px /= pLen;
    pz /= pLen;
    let fx = ax * 0.7 + px * 0.5;
    let fz = az * 0.7 + pz * 0.5;
    const fLen = Math.sqrt(fx * fx + fz * fz) || 1;
    fx /= fLen;
    fz /= fLen;
    target.x = clamp(target.x + fx * CHASE_FLEE_SPEED * step, -MAP_BOUND, MAP_BOUND);
    target.z = clamp(target.z + fz * CHASE_FLEE_SPEED * step, -MAP_BOUND, MAP_BOUND);

    const catchDist = dist2d(player.x, player.z, target.x, target.z);
    if (catchDist < CATCH_RADIUS) {
      const nearPesisir = dist2d(target.x, target.z, PESISIR.x, PESISIR.z) < PESISIR_CATCH_RADIUS;
      if (nearPesisir) {
        target.caught = true;
        state.targetCaught = true;
        completeMission(state, ctx);
      } else {
        // Tertangkap jauh dari Pesisir: target lolos dengan loncatan kabur.
        target.x = clamp(target.x + ax * 15, -MAP_BOUND, MAP_BOUND);
        target.z = clamp(target.z + az * 15, -MAP_BOUND, MAP_BOUND);
      }
    }
    return;
  }

  if (state.current === 3) {
    if (state.enemiesDefeated >= state.enemiesNeeded) {
      completeMission(state, ctx);
    }
    return;
  }

  if (state.current === 4) {
    if (dist2d(player.x, player.z, 400, 300) < ARRIVE_RADIUS) {
      completeMission(state, ctx);
    }
    return;
  }

  if (state.current === 5) {
    if (dist2d(player.x, player.z, 470, 350) < ARRIVE_RADIUS) {
      completeMission(state, ctx);
    }
  }
}
