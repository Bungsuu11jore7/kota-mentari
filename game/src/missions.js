// KOTA MENTARI — game/src/missions.js
// Alur 6 misi berurutan: Raka Pratama, kurir Kota Mentari.
// State-first: semua fungsi menerima keadaan misi sebagai argumen pertama.
// Keadaan dibuat sekali lewat createMissionState lalu diteruskan tiap panggil.

export const MISSIONS = [
  {
    id: 0,
    name: 'Paket Kilat',
    briefing: 'Antar 3 paket ke Menara. Penanda kuning menunggu di ujung jalan.',
    target: { x: 100, z: -300 },
    reward: 500,
  },
  {
    id: 1,
    name: 'Mobil Pinjaman',
    briefing: 'Curi mobil oranye di dekat persimpangan, lalu bawa ke Pesisir.',
    target: { x: 0, z: 400 },
    carSpawn: { x: 100, z: 0, color: 'orange' },
    reward: 1200,
  },
  {
    id: 2,
    name: 'Kejar Bayangan',
    briefing: 'Kejar target yang melarikan diri sampai ke Pesisir. Jangan sampai lolos.',
    target: { x: 0, z: 400 },
    reward: 2000,
  },
  {
    id: 3,
    name: 'Tolong Mira',
    briefing: 'Selamatkan Mira dari 3 penyerang Geng Ombak di Pasar Lama.',
    target: { x: -200, z: 100 },
    attackers: 3,
    reward: 3000,
  },
  {
    id: 4,
    name: 'Brankas Pelabuhan',
    briefing: 'Ambil isi brankas di Pelabuhan. Bertahan di penanda 5 detik.',
    target: { x: 400, z: 300 },
    holdSeconds: 5,
    reward: 8000,
  },
  {
    id: 5,
    name: 'Jalan Pulang',
    briefing: 'Kabur ke kapal di ujung dermaga. Semua mata mengawasimu sekarang.',
    target: { x: 470, z: 350 },
    reward: 15000,
  },
];

export const MISSION_REWARDS = MISSIONS.map((m) => m.reward);
export const TOTAL_REWARD = MISSION_REWARDS.reduce((a, b) => a + b, 0);

// Radius antar / tiba yang longgar supaya kedatangan ke titik target selalu terpicu.
const ARRIVE_RADIUS = 10;
const PACKAGE_RADIUS = 9;
const CHASE_CATCH_RADIUS = 10;
const CHASE_CATCH_SECONDS = 3;
const PACKAGE_INTERVAL = 1.2;

export function createMissionState() {
  return {
    current: 0,
    started: false,
    completed: false,
    spawnedFor: -1,
    packagesDelivered: 0,
    packageTimer: 0,
    carStolen: false,
    chaseTarget: null,
    chaseNearTimer: 0,
    attackersDefeated: 0,
    attackersTotal: 0,
    safeTimer: 0,
    pendingComplete: false,
    completedMissions: [],
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

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function toast(ctx, text) {
  if (ctx && typeof ctx.showToast === 'function') ctx.showToast(text);
}

function addPlayerMoney(ctx, amount) {
  const p = ctx && ctx.player;
  if (!p) return;
  p.uang = (typeof p.uang === 'number' ? p.uang : 0) + amount;
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

export function startMission(state, index, ctx) {
  if (!state) return;
  const i = typeof index === 'number' ? index : state.current;
  if (i < 0 || i >= MISSIONS.length) return;
  const mission = MISSIONS[i];
  // Spawn hanya sekali per misi: bila misi ini sudah di-spawn, jangan
  // sentuh progresnya (panggilan startMission kedua harus no-op).
  if (state.spawnedFor === i) {
    toast(ctx, mission.name + ': ' + mission.briefing);
    return;
  }
  state.current = i;
  state.started = true;
  state.pendingComplete = false;
  state.packagesDelivered = 0;
  state.packageTimer = 0;
  state.carStolen = false;
  state.chaseTarget = null;
  state.chaseNearTimer = 0;
  state.attackersDefeated = 0;
  state.attackersTotal = 0;
  state.safeTimer = 0;
  state.spawnedFor = i;
  if (ctx) {
    if (i === 1 && typeof ctx.spawnMissionCar === 'function') {
      ctx.spawnMissionCar(100, 0, 'orange');
    }
    if (i === 2 && typeof ctx.spawnChaseTarget === 'function') {
      const target = ctx.spawnChaseTarget();
      if (target) {
        // Target kejar WAJIB jauh dari pemain dan belum tertangkap saat spawn.
        target.caught = false;
        state.chaseTarget = target;
      }
    }
    if (i === 3 && typeof ctx.spawnAttackers === 'function') {
      ctx.spawnAttackers(-200, 100, 3);
      state.attackersTotal = 3;
    }
    if (i === 5) {
      // Wanted naik ke 3 saat misi terakhir dimulai.
      if (ctx.policeState && typeof ctx.setWanted === 'function') {
        ctx.setWanted(ctx.policeState, 3, ctx);
      } else if (ctx.policeState) {
        ctx.policeState.wanted = 3;
      }
    }
  }
  toast(ctx, 'Misi ' + (i + 1) + ': ' + mission.name + ' — ' + mission.briefing);
}

export function resetCurrentMission(state, ctx) {
  if (!state) return;
  state.spawnedFor = -1;
  state.pendingComplete = false;
  startMission(state, state.current, ctx);
}

export function completeMission(state, ctx) {
  if (!state) return;
  if (isAllMissionsComplete(state)) return;
  const mission = MISSIONS[state.current];
  if (!mission) return;
  addPlayerMoney(ctx, mission.reward);
  state.completedMissions.push(mission.id);
  toast(ctx, 'Misi selesai: ' + mission.name + ' +$' + mission.reward);
  if (ctx && typeof ctx.saveGame === 'function') ctx.saveGame();
  state.current += 1;
  state.spawnedFor = -1;
  if (state.current >= MISSIONS.length) {
    state.completed = true;
    toast(ctx, 'TAMAT — Raka berhasil pulang. Total hadiah $' + TOTAL_REWARD);
    if (ctx && typeof ctx.onAllMissionsComplete === 'function') ctx.onAllMissionsComplete();
    return;
  }
  startMission(state, state.current, ctx);
}

export function onCarStolen(state, ctx) {
  if (!state) return;
  state.carStolen = true;
  toast(ctx, 'Mobil didapat! Bawa ke Pesisir.');
  // Mencuri mobil menaikkan wanted.
  if (ctx && ctx.policeState && typeof ctx.addWanted === 'function') {
    ctx.addWanted(1);
  }
}

export function onEnemyDefeated(state, ctx) {
  if (!state) return;
  if (state.current !== 3) return;
  state.attackersDefeated += 1;
  toast(ctx, 'Penyerang dilumpuhkan (' + state.attackersDefeated + '/3)');
  if (state.attackersDefeated >= 3) {
    if (ctx) completeMission(state, ctx);
    else state.pendingComplete = true;
  }
}

export function onPackageDelivered(state, ctx) {
  if (!state) return;
  if (state.current !== 0) return;
  if (state.packagesDelivered >= 3) return;
  state.packagesDelivered += 1;
  toast(ctx, 'Paket ' + state.packagesDelivered + ' dari 3 terantar');
  if (state.packagesDelivered >= 3) {
    if (ctx) completeMission(state, ctx);
    else state.pendingComplete = true;
  }
}

export function getObjectiveText(state, ctx) {
  if (!state) return '';
  if (isAllMissionsComplete(state)) return 'Semua misi selesai!';
  const mission = MISSIONS[state.current];
  if (!mission) return 'Semua misi selesai!';
  switch (state.current) {
    case 0:
      return 'Paket Kilat: antar paket ' + (state.packagesDelivered + 1) + ' dari 3 ke Menara';
    case 1:
      return state.carStolen
        ? 'Mobil Pinjaman: bawa mobil oranye ke Pesisir'
        : 'Mobil Pinjaman: curi mobil oranye di (100, 0)';
    case 2:
      return 'Kejar Bayangan: kejar target sampai ke Pesisir';
    case 3:
      return 'Tolong Mira: kalahkan penyerang Geng Ombak (' + state.attackersDefeated + '/3)';
    case 4:
      return state.safeTimer > 0
        ? 'Brankas Pelabuhan: bertahan di penanda (' + state.safeTimer.toFixed(1) + ' dtk)'
        : 'Brankas Pelabuhan: berdiri di penanda Pelabuhan 5 detik';
    case 5:
      return 'Jalan Pulang: kabur ke kapal di (470, 350)';
    default:
      return mission.name;
  }
}

export function getActiveMarker(state, ctx) {
  if (!state) return null;
  if (isAllMissionsComplete(state)) return null;
  const mission = MISSIONS[state.current];
  if (!mission) return null;
  // Misi 3: penanda mengikuti posisi target yang melarikan diri.
  if (state.current === 2 && state.chaseTarget) {
    const t = state.chaseTarget;
    const v = t.pos || t.position;
    const x = typeof t.x === 'number' ? t.x : v ? v.x : mission.target.x;
    const z = typeof t.z === 'number' ? t.z : v ? v.z : mission.target.z;
    return { x, z, label: mission.name };
  }
  return { x: mission.target.x, z: mission.target.z, label: mission.name };
}

export function updateMissions(state, dt, ctx) {
  if (!state || !ctx) return;
  if (isAllMissionsComplete(state)) return;
  if (!state.started) startMission(state, state.current, ctx);
  if (state.pendingComplete) {
    state.pendingComplete = false;
    completeMission(state, ctx);
    return;
  }
  const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0;
  const pos = playerPos(ctx);
  if (!pos) return;
  const mission = MISSIONS[state.current];
  if (!mission) return;

  if (state.current === 0) {
    // Antar 3 paket ke titik yang sama, satu per satu dengan jeda.
    if (dist2(pos.x, pos.z, mission.target.x, mission.target.z) <= PACKAGE_RADIUS * PACKAGE_RADIUS) {
      state.packageTimer += step;
      if (state.packageTimer >= PACKAGE_INTERVAL) {
        state.packageTimer = 0;
        onPackageDelivered(state, ctx);
      }
    } else {
      state.packageTimer = 0;
    }
    return;
  }

  if (state.current === 1) {
    if (!state.carStolen) return;
    if (dist2(pos.x, pos.z, mission.target.x, mission.target.z) <= ARRIVE_RADIUS * ARRIVE_RADIUS) {
      completeMission(state, ctx);
    }
    return;
  }

  if (state.current === 2) {
    // Target kejar: spawn jauh, melarikan diri; misi TIDAK selesai instan.
    let target = state.chaseTarget;
    if (!target && typeof ctx.spawnChaseTarget === 'function') {
      target = ctx.spawnChaseTarget();
      if (target) {
        target.caught = false;
        state.chaseTarget = target;
      }
    }
    if (!target) return;
    if (target.caught === true) {
      completeMission(state, ctx);
      return;
    }
    const v = target.pos || target.position;
    const tx = typeof target.x === 'number' ? target.x : v ? v.x : null;
    const tz = typeof target.z === 'number' ? target.z : v ? v.z : null;
    if (tx === null || tz === null) return;
    // Target harus dikejar sampai dekat selama 3 detik berturut-turut.
    if (dist2(pos.x, pos.z, tx, tz) <= CHASE_CATCH_RADIUS * CHASE_CATCH_RADIUS) {
      state.chaseNearTimer += step;
      if (state.chaseNearTimer >= CHASE_CATCH_SECONDS) {
        target.caught = true;
        state.chaseTarget = target;
        completeMission(state, ctx);
      }
    } else {
      state.chaseNearTimer = 0;
    }
    return;
  }

  if (state.current === 3) {
    // Misi 4 selesai lewat onEnemyDefeated (3 penyerang kalah).
    if (state.attackersTotal > 0 && state.attackersDefeated >= state.attackersTotal) {
      completeMission(state, ctx);
    }
    return;
  }

  if (state.current === 4) {
    const busted = ctx.busted === true || (ctx.policeState && ctx.policeState.busted === true);
    if (busted) {
      state.safeTimer = 0;
      return;
    }
    if (dist2(pos.x, pos.z, mission.target.x, mission.target.z) <= ARRIVE_RADIUS * ARRIVE_RADIUS) {
      state.safeTimer += step;
      if (state.safeTimer >= mission.holdSeconds) {
        state.safeTimer = 0;
        completeMission(state, ctx);
      }
    } else {
      state.safeTimer = 0;
    }
    return;
  }

  if (state.current === 5) {
    if (dist2(pos.x, pos.z, mission.target.x, mission.target.z) <= ARRIVE_RADIUS * ARRIVE_RADIUS) {
      completeMission(state, ctx);
    }
  }
}
