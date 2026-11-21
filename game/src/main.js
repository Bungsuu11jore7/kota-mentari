// KOTA MENTARI — main.js
// Loop utama + konteks tunggal game. Pemilik: konteks, keadaan misi/polisi,
// fungsi mulai tunggal, kamera enam angka, gambar polisi, hook debug,
// save/load, dan semua perbaikan integrasi (state-first, uang di pemain,
// HUD tiap frame, input sekali, penyerang misi 4 digerakkan di sini).
// Target mobil misi 2 dideklarasikan di atas sebelum dipakai (hindari TDZ).

let THREE = null;
let worldModule = null;
let missionsModule = null;
let policeModule = null;
let trafficModule = null;
let vehiclesModule = null;
let hudModule = null;
let audioModule = null;

let buildCityFn = null;
let findRoadPathFn = null;
let createMissionStateFn = null;
let updateMissionsFn = null;
let getCurrentMissionFn = null;
let getActiveMarkerFn = null;
let onEnemyDefeatedFn = null;
let onCarStolenFn = null;
let resetMissionStateFn = null;
let createPoliceStateFn = null;
let updatePoliceFn = null;
let addWantedFn = null;
let setWantedFn = null;
let createTrafficStateFn = null;
let updateTrafficFn = null;
let getVehicleHeadingFn = null;
let setVehicleHeadingFn = null;
let createVehicleFn = null;
let initHUDFn = null;
let drawHUDFn = null;
let showScreenFn = null;
let showToastFn = null;

let ctx = null;
let ctxCreated = false;
let booted = false;
let pendingStart = false;
let inputReady = false;
let lastFrameTime = 0;
let orbitAngle = 0;
let lastMissionIndex = -1;
let spawnedForMission = -1;

// Target mobil misi 2 — dideklarasikan di atas, sebelum dipakai di mana pun.
let missionCar = null;
let targetCar = null;
let chaseTarget = null;

let renderer = null;
let camera = null;
let scene = null;
let playerMesh = null;
let missionCarMesh = null;
let chaseTargetMesh = null;
let roadblockMesh = null;
let policeMeshes = [];
let attackerMeshes = [];
let bulletMeshes = [];

const SAVE_KEY = 'kota-mentari-save-v1';
const CITY_BOUND = 450;

function pick(mod, names) {
  if (!mod) return null;
  for (const name of names) {
    if (typeof mod[name] === 'function') return mod[name];
  }
  return null;
}

function clampNumber(value, min, max) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, n));
}

// ---------------------------------------------------------------------------
// Fallback misi (dipakai hanya bila modul misi tidak bisa dimuat / tidak
// menyediakan fungsi yang dibutuhkan). Enam misi berurutan, uang kumulatif
// 500 -> 29.700.
// ---------------------------------------------------------------------------
const MISSION_DEFS = [
  { name: 'Paket Kilat', objective: 'Antar 3 paket ke Menara (100, -300)', target: { x: 100, z: -300 }, reward: 500 },
  { name: 'Mobil Pinjaman', objective: 'Curi mobil oranye di (100, 0), bawa ke Pesisir (0, 400)', target: { x: 0, z: 400 }, reward: 1200 },
  { name: 'Kejar Bayangan', objective: 'Kejar target sampai ke Pesisir (0, 400)', target: { x: 0, z: 400 }, reward: 2000 },
  { name: 'Tolong Mira', objective: 'Selamatkan Mira di (-200, 100) dari 3 penyerang', target: { x: -200, z: 100 }, reward: 3000 },
  { name: 'Brankas Pelabuhan', objective: 'Ambil brankas di Pelabuhan (400, 300)', target: { x: 400, z: 300 }, reward: 8000 },
  { name: 'Jalan Pulang', objective: 'Kabur ke kapal di (470, 350)', target: { x: 470, z: 350 }, reward: 15000 },
];

export function fallbackCreateMissionState() {
  return {
    current: 0,
    delivered: 0,
    deliverCooldown: 0,
    needsLeave: false,
    attackersDefeated: 0,
    chaseCaught: false,
    completed: [false, false, false, false, false, false],
    finished: false,
  };
}

export function fallbackGetCurrentMission(state) {
  const s = state || fallbackCreateMissionState();
  const idx = clampNumber(s.current || 0, 0, MISSION_DEFS.length - 1);
  const def = MISSION_DEFS[idx];
  return { index: idx, name: def.name, objective: def.objective, target: def.target, reward: def.reward };
}

export function fallbackGetActiveMarker(state, context) {
  const s = state || fallbackCreateMissionState();
  const idx = clampNumber(s.current || 0, 0, MISSION_DEFS.length - 1);
  if (idx === 1) {
    const car = context && context.missionCar;
    if (car && !(context.player && context.player.inCar)) return { x: car.x || 100, z: car.z || 0 };
    return { x: 0, z: 400 };
  }
  if (idx === 2) {
    const t = context && context.chaseTarget;
    if (t && !t.caught) return { x: t.x || 0, z: t.z || 0 };
    return { x: 0, z: 400 };
  }
  return { x: MISSION_DEFS[idx].target.x, z: MISSION_DEFS[idx].target.z };
}

function fallbackGiveReward(state, context, idx) {
  const def = MISSION_DEFS[idx];
  state.completed[idx] = true;
  if (context && context.player) {
    context.player.uang = (context.player.uang || 0) + def.reward;
    context.player.money = context.player.uang;
    if (typeof context.money !== 'undefined') context.money = context.player.uang;
  }
  if (context && typeof context.showToast === 'function') {
    context.showToast('Misi selesai: ' + def.name + ' (+' + def.reward + ')');
  }
  state.current = Math.min(idx + 1, MISSION_DEFS.length);
  if (state.current >= MISSION_DEFS.length) state.finished = true;
}

export function fallbackUpdateMissions(state, dt, context) {
  const s = state || fallbackCreateMissionState();
  if (!context || !context.player || s.finished) return s;
  const player = context.player;
  const idx = clampNumber(s.current || 0, 0, MISSION_DEFS.length - 1);
  const distTo = (x, z) => {
    const dx = (player.x || 0) - x;
    const dz = (player.z || 0) - z;
    return Math.sqrt(dx * dx + dz * dz);
  };
  if (idx === 0) {
    if ((s.deliverCooldown || 0) > 0) s.deliverCooldown -= dt;
    const d = distTo(100, -300);
    if (d > 25) s.needsLeave = false;
    if (!s.needsLeave && d < 14 && (s.deliverCooldown || 0) <= 0) {
      s.delivered = (s.delivered || 0) + 1;
      s.needsLeave = true;
      s.deliverCooldown = 1.0;
      if (context.showToast) {
        context.showToast('Paket ' + s.delivered + ' dari 3 terantar');
      }
      if (s.delivered >= 3) fallbackGiveReward(s, context, 0);
    }
  } else if (idx === 1) {
    const car = context.missionCar;
    if (car && player.inCar && player.vehicle === car && distTo(0, 400) < 16) {
      fallbackGiveReward(s, context, 1);
    }
  } else if (idx === 2) {
    const t = context.chaseTarget;
    if (t && !t.caught && distTo(t.x || 0, t.z || 0) < 8) {
      t.caught = true;
      s.chaseCaught = true;
      fallbackGiveReward(s, context, 2);
    }
  } else if (idx === 3) {
    const defeated = (context.attackers || []).filter((a) => a && a.alive === false).length;
    if (defeated >= 3 || (s.attackersDefeated || 0) >= 3) {
      fallbackGiveReward(s, context, 3);
    }
  } else if (idx === 4) {
    if (distTo(400, 300) < 14) fallbackGiveReward(s, context, 4);
  } else if (idx === 5) {
    if (distTo(470, 350) < 16) fallbackGiveReward(s, context, 5);
  }
  return s;
}

export function fallbackOnEnemyDefeated(state, attacker, context) {
  const s = state || fallbackCreateMissionState();
  s.attackersDefeated = (s.attackersDefeated || 0) + 1;
  return s;
}

export function fallbackOnCarStolen(state, context) {
  const s = state || fallbackCreateMissionState();
  s.carStolen = true;
  return s;
}

export function fallbackResetMissionState(state) {
  const s = state || fallbackCreateMissionState();
  s.current = 0;
  s.delivered = 0;
  // JANGAN paksa bentuk fallback (completed array) ke state modul asli:
  // updateMissions modul asli menguji `state.completed` sebagai boolean,
  // array truthy membuat updateMissions langsung return dan misi macet.
  // State modul asli di-reset ke bentuk awalnya; state fallback ke bentuknya.
  if (Array.isArray(s.completed)) {
    s.deliverCooldown = 0;
    s.needsLeave = false;
    s.attackersDefeated = 0;
    s.chaseCaught = false;
    s.completed = [false, false, false, false, false, false];
    s.finished = false;
  } else {
    s.completed = false;
    s.started = false;
    s.leftZone = true;
    s.carStolen = false;
    s.enemiesDefeated = 0;
    s.enemiesNeeded = 3;
    s.targetCaught = false;
    s.totalEarned = 0;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Fallback polisi (dipakai hanya bila modul polisi tidak menyediakan fungsi).
// Wanted 0-5, unit mengejar pemain, BUSTED saat unit menyentuh pemain.
// ---------------------------------------------------------------------------
export function fallbackCreatePoliceState() {
  return { wanted: 0, units: [], busted: false, roadblock: false, hideTimer: 0 };
}

export function fallbackAddWanted(state, amount, context) {
  const s = state || fallbackCreatePoliceState();
  s.wanted = clampNumber((s.wanted || 0) + amount, 0, 5);
  return s.wanted;
}

export function fallbackSetWanted(state, amount, context) {
  const s = state || fallbackCreatePoliceState();
  s.wanted = clampNumber(amount, 0, 5);
  if (s.wanted === 0) {
    s.units = [];
    s.roadblock = false;
  }
  return s.wanted;
}

export function fallbackUpdatePolice(state, dt, context) {
  const s = state || fallbackCreatePoliceState();
  if (!context || !context.player) return s;
  const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.05) : 1 / 60;
  const player = context.player;
  const wantCount = s.wanted >= 5 ? 6 : s.wanted >= 4 ? 4 : s.wanted >= 3 ? 3 : s.wanted >= 2 ? 2 : s.wanted >= 1 ? 1 : 0;
  s.roadblock = s.wanted >= 5;
  const offsets = [
    [0, -14], [10, 10], [-10, 10], [14, -6], [-14, -6], [0, 16],
  ];
  while (s.units.length < wantCount) {
    const i = s.units.length;
    const off = offsets[i % offsets.length];
    s.units.push({
      id: 'polisi-' + i + '-' + Date.now(),
      x: (player.x || 0) + off[0],
      z: (player.z || 0) + off[1],
      heading: 0,
      speed: 0,
      health: 100,
      alive: true,
    });
  }
  if (s.units.length > wantCount) s.units.length = wantCount;
  const speed = 11 + (s.wanted || 0) * 1.5;
  for (const u of s.units) {
    if (!u || u.alive === false) continue;
    const dx = (player.x || 0) - (u.x || 0);
    const dz = (player.z || 0) - (u.z || 0);
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.01) {
      u.x += (dx / dist) * speed * step;
      u.z += (dz / dist) * speed * step;
      u.heading = Math.atan2(dx, dz);
    }
    if (dist < 2.5 && (s.wanted || 0) >= 2 && !player.inCar) {
      s.busted = true;
    }
  }
  if (wantCount === 0) {
    s.hideTimer += step;
    if (s.hideTimer > 20 && s.wanted > 0) s.wanted = 0;
  } else {
    s.hideTimer = 0;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Fallback traffic / dunia / HUD / audio (noop aman bila modul tidak ada).
// ---------------------------------------------------------------------------
export function fallbackCreateTrafficState() {
  return { cars: [], pedestrians: [] };
}

export function fallbackUpdateTraffic(state, dt, world, context) {
  return state || fallbackCreateTrafficState();
}

export function fallbackFindRoadPath(start, end) {
  const a = start || { x: 0, z: 0 };
  const b = end || { x: 0, z: 0 };
  return [{ x: a.x || 0, z: a.z || 0 }, { x: b.x || 0, z: b.z || 0 }];
}

export function computeChaseSpawn(playerX, playerZ) {
  const px = playerX || 0;
  const pz = playerZ || 0;
  const offsets = [
    [120, 0], [-120, 0], [0, 120], [0, -120],
    [90, 90], [-90, -90], [90, -90], [-90, 90],
    [150, 60], [-150, -60],
  ];
  for (const off of offsets) {
    const x = Math.max(-CITY_BOUND, Math.min(CITY_BOUND, px + off[0]));
    const z = Math.max(-CITY_BOUND, Math.min(CITY_BOUND, pz + off[1]));
    const dx = x - px;
    const dz = z - pz;
    if (Math.sqrt(dx * dx + dz * dz) >= 90) return { x, z };
  }
  return {
    x: Math.max(-CITY_BOUND, Math.min(CITY_BOUND, px + 120)),
    z: Math.max(-CITY_BOUND, Math.min(CITY_BOUND, pz + 120)),
  };
}

// ---------------------------------------------------------------------------
// Konteks tunggal — dibuat SEKALI.
// ---------------------------------------------------------------------------
function normalizeColor(color) {
  if (typeof color !== 'string') return '#ff8c1a';
  const c = color.toLowerCase().trim();
  if (c === 'oranye' || c === 'orange' || c === 'jingga') return '#ff8c1a';
  return color;
}

function spawnMissionCarImpl(x, z, color) {
  const car = {
    x: typeof x === 'number' ? x : 100,
    z: typeof z === 'number' ? z : 0,
    heading: 0,
    speed: 0,
    color: normalizeColor(color),
    missionCar: true,
    owner: 'other',
    stolen: false,
    occupied: false,
    driver: null,
  };
  if (createVehicleFn) {
    try {
      const made = createVehicleFn(car.x, car.z, car.color);
      if (made && typeof made === 'object') {
        Object.assign(car, made);
        car.x = typeof x === 'number' ? x : car.x;
        car.z = typeof z === 'number' ? z : car.z;
        car.color = normalizeColor(color);
        car.missionCar = true;
      }
    } catch (e) {
      // pakai objek mobil lokal
    }
  }
  missionCar = car;
  targetCar = car;
  if (ctx) {
    ctx.missionCar = car;
    ctx.targetCar = car;
    if (ctx.world) {
      if (!Array.isArray(ctx.world.vehicles)) ctx.world.vehicles = [];
      if (!ctx.world.vehicles.includes(car)) ctx.world.vehicles.push(car);
    }
    if (!Array.isArray(ctx.vehicles)) ctx.vehicles = ctx.world ? ctx.world.vehicles || [] : [];
    if (ctx.world && Array.isArray(ctx.world.vehicles) && !ctx.world.vehicles.includes(car)) {
      ctx.world.vehicles.push(car);
    }
  }
  syncMissionCarMesh();
  return car;
}

function spawnChaseTargetImpl() {
  const player = ctx ? ctx.player : null;
  const px = player ? player.x || 0 : 0;
  const pz = player ? player.z || 0 : 0;
  // Target HARUS jauh dari pemain dan awalnya belum tertangkap.
  const spot = computeChaseSpawn(px, pz);
  chaseTarget = {
    x: spot.x,
    z: spot.z,
    caught: false,
    speed: 7,
    health: 100,
    alive: true,
  };
  if (ctx) ctx.chaseTarget = chaseTarget;
  syncChaseTargetMesh();
  return chaseTarget;
}

function spawnAttackersImpl(x, z, count) {
  const n = typeof count === 'number' && count > 0 ? Math.floor(count) : 3;
  const cx = typeof x === 'number' ? x : -200;
  const cz = typeof z === 'number' ? z : 100;
  const list = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    list.push({
      id: 'penyerang-' + i,
      x: cx + Math.cos(a) * 3,
      z: cz + Math.sin(a) * 3,
      heading: 0,
      speed: 3.2,
      health: 100,
      alive: true,
    });
  }
  if (ctx) {
    ctx.attackers = list;
    if (ctx.missionState) ctx.missionState.attackers = list;
  }
  syncAttackerMeshes();
  return list;
}

function showToastImpl(message) {
  if (!ctx) return;
  const text = String(message || '');
  ctx.toast = text;
  ctx.toastUntil = Date.now() + 2600;
  if (showToastFn) {
    try {
      showToastFn(text);
      return;
    } catch (e) {
      // lanjut ke fallback DOM
    }
  }
  if (typeof document !== 'undefined') {
    const el = document.getElementById('toast');
    if (el) el.textContent = text;
  }
}

function addWantedImpl(policeState, amount, context) {
  const state = policeState || (ctx ? ctx.policeState : null);
  const c = context || ctx;
  if (addWantedFn && state) {
    try {
      return addWantedFn(state, amount, c);
    } catch (e) {
      // fallback langsung
    }
  }
  if (state && typeof state.wanted === 'number') {
    state.wanted = clampNumber(state.wanted + amount, 0, 5);
    return state.wanted;
  }
  return 0;
}

function setWantedImpl(policeState, amount, context) {
  const state = policeState || (ctx ? ctx.policeState : null);
  const c = context || ctx;
  if (setWantedFn && state) {
    try {
      return setWantedFn(state, amount, c);
    } catch (e) {
      // fallback langsung
    }
  }
  if (state) {
    state.wanted = clampNumber(amount, 0, 5);
    if (state.wanted === 0 && Array.isArray(state.units)) state.units = [];
    return state.wanted;
  }
  return 0;
}

function getVehicleHeadingImpl(car) {
  if (!car) return 0;
  if (getVehicleHeadingFn) {
    try {
      const h = getVehicleHeadingFn(car);
      if (typeof h === 'number') return h;
    } catch (e) {
      // pakai field langsung
    }
  }
  return typeof car.heading === 'number' ? car.heading : 0;
}

function setVehicleHeadingImpl(car, heading) {
  if (!car) return;
  if (setVehicleHeadingFn) {
    try {
      setVehicleHeadingFn(car, heading);
    } catch (e) {
      // tetap tulis field langsung
    }
  }
  car.heading = heading;
}

function getActiveMarkerImpl() {
  if (!ctx || !ctx.missionState) return { x: 100, z: -300 };
  if (getActiveMarkerFn) {
    try {
      const m = getActiveMarkerFn(ctx.missionState, ctx);
      if (m && typeof m.x === 'number' && typeof m.z === 'number') return { x: m.x, z: m.z };
    } catch (e) {
      // fallback di bawah
    }
  }
  return fallbackGetActiveMarker(ctx.missionState, ctx);
}

function onEnemyDefeatedImpl(attacker, context) {
  const c = context || ctx;
  if (!c || !c.missionState) return;
  if (onEnemyDefeatedFn) {
    // Modul misi: onEnemyDefeated(state, ctx) — DUA argumen. Mengirim
    // attacker sebagai argumen ke-2 membuat ctx = attacker di dalam modul,
    // sehingga completeMission gagal menambah hadiah (ctx.player undefined)
    // walau misi tetap lanjut. Kirim (state, ctx) saja.
    try {
      onEnemyDefeatedFn(c.missionState, c);
      return;
    } catch (e) {
      // fallback di bawah
    }
  }
  fallbackOnEnemyDefeated(c.missionState, attacker, c);
}

function onCarStolenImpl(car, context) {
  const c = context || ctx;
  if (!c || !c.missionState) return;
  if (onCarStolenFn) {
    try {
      onCarStolenFn(c.missionState, c);
      return;
    } catch (e) {
      // fallback di bawah
    }
  }
  fallbackOnCarStolen(c.missionState, c);
  showToastImpl('Mobil dicuri! Bawa ke Pesisir (0, 400).');
}

function createContext() {
  if (ctx) return ctx;
  const player = (createPlayerLocal || fallbackCreatePlayer)();
  const missionState = createMissionStateFn
    ? createMissionStateFn()
    : fallbackCreateMissionState();
  const policeState = createPoliceStateFn
    ? createPoliceStateFn()
    : fallbackCreatePoliceState();
  const combatState = (createCombatStateLocal || fallbackCreateCombatState)();
  const trafficState = createTrafficStateFn
    ? safeCreateTraffic()
    : fallbackCreateTrafficState();
  const world = ctxWorldPlaceholder();
  ctx = {
    player,
    world,
    missionState,
    policeState,
    combatState,
    trafficState,
    camera: null,
    renderer: null,
    scene: null,
    hud: null,
    audio: null,
    input: null,
    inputState: null,
    money: 0,
    toast: '',
    toastUntil: 0,
    screen: 'start',
    started: false,
    paused: false,
    busted: false,
    completed: false,
    muted: false,
    missionCar: null,
    targetCar: null,
    chaseTarget: null,
    attackers: [],
    vehicles: [],
    findRoadPath: findRoadPathFn || fallbackFindRoadPath,
    showToast: showToastImpl,
    spawnMissionCar: spawnMissionCarImpl,
    spawnChaseTarget: spawnChaseTargetImpl,
    spawnAttackers: spawnAttackersImpl,
    addWanted: addWantedImpl,
    setWanted: setWantedImpl,
    getVehicleHeading: getVehicleHeadingImpl,
    setVehicleHeading: setVehicleHeadingImpl,
    getActiveMarker: getActiveMarkerImpl,
    onEnemyDefeated: onEnemyDefeatedImpl,
    onCarStolen: onCarStolenImpl,
  };
  ctxCreated = true;
  return ctx;
}

function ctxWorldPlaceholder() {
  return { vehicles: [], pedestrians: [], roads: [], buildings: [] };
}

function safeCreateTraffic() {
  try {
    if (ctx && ctx.world) return createTrafficStateFn(ctx.world, ctx);
    return createTrafficStateFn();
  } catch (e) {
    try {
      return createTrafficStateFn();
    } catch (e2) {
      return fallbackCreateTrafficState();
    }
  }
}

// Impor lokal statis-dingin: main.js memuat player/combat/input secara
// dinamis saat boot supaya game tetap bisa jalan bila satu modul telat;
// fungsi-fungsi ini diisi dari modul tersebut, dengan fallback lokal bila
// modul belum termuat (dipakai smoke test Node).
let createPlayerLocal = null;
let updatePlayerLocal = null;
let createCombatStateLocal = null;
let updateCombatLocal = null;
let initInputLocal = null;
let getInputStateLocal = null;
let clearFrameInputLocal = null;

function fallbackCreatePlayer() {
  return {
    name: 'Raka Pratama', x: 0, z: 0, angle: 0, heading: 0, speed: 0,
    speedKmh: 0, carSpeed: 0, health: 100, uang: 0, money: 0,
    inCar: false, vehicle: null, onFoot: true, running: false,
    dead: false, lastDamageAt: 0,
  };
}

function fallbackCreateCombatState() {
  return {
    weapon: 1, bullets: [], punchCooldown: 0, shootCooldown: 0,
    attackCooldown: 0, kills: 0, enemiesDefeated: 0, shotsFired: 0,
    punchesThrown: 0,
  };
}

// ---------------------------------------------------------------------------
// Kamera — HANYA enam angka. Pembaruan di loop dibungkus penjaga.
// ---------------------------------------------------------------------------
export function setCamera(eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
  if (!THREE || !camera) return false;
  const eye = new THREE.Vector3(eyeX, eyeY, eyeZ);
  const look = new THREE.Vector3(lookX, lookY, lookZ);
  camera.position.copy(eye);
  camera.lookAt(look);
  return true;
}

function updateCameraGuarded() {
  try {
    if (!ctx || !ctx.player || !THREE || !camera) return;
    const p = ctx.player;
    if (ctx.screen === 'start' || !ctx.started) {
      orbitAngle += 0.0006;
      const r = 130;
      setCamera(
        Math.sin(orbitAngle) * r, 62, Math.cos(orbitAngle) * r,
        0, 8, 0,
      );
      return;
    }
    const fx = Math.sin(p.angle || 0);
    const fz = Math.cos(p.angle || 0);
    const dist = p.inCar ? 10 : 7.5;
    const height = p.inCar ? 4.6 : 3.6;
    setCamera(
      (p.x || 0) - fx * dist, height, (p.z || 0) - fz * dist,
      (p.x || 0) + fx * 6, 1.6, (p.z || 0) + fz * 6,
    );
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Kamera gagal, render tetap jalan:', e && e.message ? e.message : e);
    }
  }
}

// ---------------------------------------------------------------------------
// Mesh: pemain, mobil misi, target kejar, penyerang, polisi, peluru.
// Polisi TANPA mesh dari modulnya — loop utama yang menggambar di sini.
// ---------------------------------------------------------------------------
function makeBoxMesh(w, h, d, color) {
  if (!THREE || !scene) return null;
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  scene.add(mesh);
  return mesh;
}

function makeCarMesh(color) {
  if (!THREE || !scene) return null;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.7, 4.2),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x222831 }),
  );
  cabin.position.set(0, 1.15, -0.2);
  group.add(cabin);
  scene.add(group);
  return group;
}

function makePersonMesh(shirtColor) {
  if (!THREE || !scene) return null;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.1, 0.4),
    new THREE.MeshLambertMaterial({ color: shirtColor }),
  );
  body.position.y = 0.95;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.45, 0.45),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  );
  head.position.y = 1.75;
  group.add(head);
  scene.add(group);
  return group;
}

function syncPlayerMesh() {
  if (!THREE || !scene || !ctx || !ctx.player) return;
  if (!playerMesh) playerMesh = makePersonMesh(0xff8c1a);
  if (!playerMesh) return;
  const p = ctx.player;
  playerMesh.position.set(p.x || 0, 0, p.z || 0);
  playerMesh.rotation.y = p.angle || 0;
  playerMesh.visible = !p.inCar;
}

function syncMissionCarMesh() {
  if (!THREE || !scene) return;
  if (missionCar && !missionCarMesh) {
    missionCarMesh = makeCarMesh(0xff8c1a);
  }
  if (missionCarMesh) {
    missionCarMesh.visible = !!missionCar;
    if (missionCar) {
      missionCarMesh.position.set(missionCar.x || 0, 0, missionCar.z || 0);
      missionCarMesh.rotation.y = missionCar.heading || 0;
    }
  }
}

function syncChaseTargetMesh() {
  if (!THREE || !scene) return;
  if (chaseTarget && !chaseTargetMesh) {
    chaseTargetMesh = makeCarMesh(0xcc2222);
  }
  if (chaseTargetMesh) {
    chaseTargetMesh.visible = !!chaseTarget && !chaseTarget.caught;
    if (chaseTarget) {
      chaseTargetMesh.position.set(chaseTarget.x || 0, 0, chaseTarget.z || 0);
      chaseTargetMesh.rotation.y = chaseTarget.heading || 0;
    }
  }
}

function syncAttackerMeshes() {
  if (!THREE || !scene || !ctx) return;
  const list = ctx.attackers || [];
  while (attackerMeshes.length < list.length) {
    const m = makePersonMesh(0xcc2222);
    if (!m) break;
    attackerMeshes.push(m);
  }
  for (let i = 0; i < attackerMeshes.length; i += 1) {
    const mesh = attackerMeshes[i];
    const a = list[i];
    if (!a || a.alive === false) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.position.set(a.x || 0, 0, a.z || 0);
    mesh.rotation.y = a.heading || 0;
  }
}

function syncPoliceMeshes() {
  if (!THREE || !scene || !ctx || !ctx.policeState) return;
  const units = ctx.policeState.units || ctx.policeState.police || [];
  while (policeMeshes.length < units.length) {
    const m = makeCarMesh(0xffffff);
    if (!m) break;
    policeMeshes.push(m);
  }
  for (let i = 0; i < policeMeshes.length; i += 1) {
    const mesh = policeMeshes[i];
    const u = units[i];
    if (!u || u.alive === false) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.position.set(u.x || 0, 0, u.z || 0);
    mesh.rotation.y = u.heading || 0;
  }
  if (ctx.policeState.roadblock) {
    if (!roadblockMesh) roadblockMesh = makeBoxMesh(8, 1.2, 0.6, 0xffcc00);
    if (roadblockMesh) {
      const p = ctx.player;
      const fx = Math.sin(p.angle || 0);
      const fz = Math.cos(p.angle || 0);
      roadblockMesh.visible = true;
      roadblockMesh.position.set((p.x || 0) + fx * 18, 0.6, (p.z || 0) + fz * 18);
      roadblockMesh.rotation.y = p.angle || 0;
    }
  } else if (roadblockMesh) {
    roadblockMesh.visible = false;
  }
}

function syncBulletMeshes() {
  if (!THREE || !scene || !ctx || !ctx.combatState) return;
  const bullets = ctx.combatState.bullets || [];
  while (bulletMeshes.length < bullets.length) {
    const m = makeBoxMesh(0.25, 0.25, 0.25, 0xffdd33);
    if (!m) break;
    bulletMeshes.push(m);
  }
  for (let i = 0; i < bulletMeshes.length; i += 1) {
    const mesh = bulletMeshes[i];
    const b = bullets[i];
    if (!b) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.position.set(b.x || 0, 0.8, b.z || 0);
  }
}

function syncAllMeshes() {
  syncPlayerMesh();
  syncMissionCarMesh();
  syncChaseTargetMesh();
  syncAttackerMeshes();
  syncPoliceMeshes();
  syncBulletMeshes();
}

// ---------------------------------------------------------------------------
// Manajer layar + HUD tiap frame.
// ---------------------------------------------------------------------------
const SCREEN_IDS = {
  start: 'screen-start',
  pause: 'screen-pause',
  complete: 'screen-gameover',
  busted: 'screen-busted',
};

function fallbackShowScreen(name) {
  if (typeof document === 'undefined') return;
  for (const key of Object.keys(SCREEN_IDS)) {
    const el = document.getElementById(SCREEN_IDS[key]);
    if (el) el.style.display = key === name ? 'flex' : 'none';
  }
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = name === 'game' ? 'block' : 'none';
}

function showScreenImpl(name) {
  if (ctx) ctx.screen = name;
  if (showScreenFn) {
    try {
      showScreenFn(name);
      return;
    } catch (e) {
      // jatuh ke fallback DOM
    }
  }
  try {
    fallbackShowScreen(name);
  } catch (e) {
    // layar tetap dicatat di ctx.screen
  }
}

function currentMissionObject() {
  if (!ctx || !ctx.missionState) return null;
  if (getCurrentMissionFn) {
    try {
      const m = getCurrentMissionFn(ctx.missionState);
      if (m && typeof m === 'object') return m;
    } catch (e) {
      // fallback di bawah
    }
  }
  return fallbackGetCurrentMission(ctx.missionState);
}

function drawHUDSnapshot() {
  if (!ctx || !ctx.player) return;
  const p = ctx.player;
  const policeUnits =
    (ctx.policeState && (ctx.policeState.units || ctx.policeState.police)) || [];
  const kmh = Math.round(Math.abs(p.speedKmh || p.speed * 3.6 || 0));
  const mission = currentMissionObject();
  const snapshot = {
    pemain: p,
    player: p,
    sudutPemain: p.angle || 0,
    playerAngle: p.angle || 0,
    sudut: p.angle || 0,
    polisi: policeUnits,
    police: policeUnits,
    keadaanPolisi: ctx.policeState,
    policeState: ctx.policeState,
    keadaanMisi: ctx.missionState,
    missionState: ctx.missionState,
    kecepatanKmh: kmh,
    speedKmh: kmh,
    kecepatan: kmh,
    toast: ctx.toast || '',
    uang: p.uang || 0,
    money: p.uang || 0,
    nyawa: p.health || 0,
    health: p.health || 0,
    wanted: (ctx.policeState && ctx.policeState.wanted) || 0,
    objective: (mission && mission.objective) || '',
    mission: mission || null,
    screen: ctx.screen,
    started: ctx.started,
  };
  if (drawHUDFn) {
    try {
      drawHUDFn(snapshot);
      return;
    } catch (e) {
      // jatuh ke fallback DOM
    }
  }
  if (typeof document !== 'undefined') {
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    };
    setText('hud-speed', kmh + ' km/jam');
    setText('hud-money', '$' + (p.uang || 0));
    setText('hud-health', Math.round(p.health || 0));
    setText('hud-wanted', '★'.repeat((ctx.policeState && ctx.policeState.wanted) || 0));
    setText('hud-objective', snapshot.objective);
    setText('hud-toast', ctx.toast || '');
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = ctx.screen === 'game' ? 'block' : 'none';
  }
}

// ---------------------------------------------------------------------------
// Alur mulai tunggal, jeda, BUSTED, TAMAT, save/load, teleport, debug.
// ---------------------------------------------------------------------------
function resetGameState(fullReset) {
  if (!ctx) return;
  const p = ctx.player;
  p.x = 0;
  p.z = 0;
  p.angle = 0;
  p.heading = 0;
  p.speed = 0;
  p.carSpeed = 0;
  p.speedKmh = 0;
  p.health = 100;
  p.dead = false;
  p.inCar = false;
  p.vehicle = null;
  p.onFoot = true;
  if (fullReset) {
    p.uang = 0;
    p.money = 0;
    ctx.money = 0;
    if (resetMissionStateFn) {
      try {
        resetMissionStateFn(ctx.missionState);
      } catch (e) {
        fallbackResetMissionState(ctx.missionState);
      }
    } else {
      fallbackResetMissionState(ctx.missionState);
    }
  }
  if (ctx.policeState) {
    ctx.policeState.wanted = 0;
    if (Array.isArray(ctx.policeState.units)) ctx.policeState.units = [];
    if (Array.isArray(ctx.policeState.police)) ctx.policeState.police = [];
    ctx.policeState.busted = false;
    ctx.policeState.roadblock = false;
  }
  if (createCombatStateLocal) ctx.combatState = createCombatStateLocal();
  missionCar = null;
  targetCar = null;
  chaseTarget = null;
  ctx.missionCar = null;
  ctx.targetCar = null;
  ctx.chaseTarget = null;
  ctx.attackers = [];
  if (ctx.missionState) ctx.missionState.attackers = [];
  ctx.busted = false;
  ctx.completed = false;
  lastMissionIndex = -1;
  spawnedForMission = -1;
}

export function startGame() {
  if (!ctx) {
    pendingStart = true;
    return false;
  }
  if (ctx.busted) {
    restartMission();
    return true;
  }
  resetGameState(true);
  ctx.started = true;
  ctx.paused = false;
  showScreenImpl('game');
  showToastImpl('Misi 1: Paket Kilat — antar 3 paket ke Menara');
  return true;
}

export function restartMission() {
  if (!ctx) return false;
  const p = ctx.player;
  p.x = 0;
  p.z = 0;
  p.angle = 0;
  p.heading = 0;
  p.speed = 0;
  p.carSpeed = 0;
  p.health = 100;
  p.dead = false;
  p.inCar = false;
  p.vehicle = null;
  p.onFoot = true;
  if (ctx.policeState) {
    ctx.policeState.wanted = 0;
    if (Array.isArray(ctx.policeState.units)) ctx.policeState.units = [];
    ctx.policeState.busted = false;
    ctx.policeState.roadblock = false;
  }
  ctx.busted = false;
  ctx.paused = false;
  ctx.started = true;
  showScreenImpl('game');
  const mission = currentMissionObject();
  showToastImpl('Misi diulang: ' + ((mission && mission.name) || ''));
  return true;
}

export function togglePause() {
  if (!ctx || !ctx.started) return false;
  if (ctx.screen === 'busted' || ctx.screen === 'complete') return false;
  ctx.paused = !ctx.paused;
  showScreenImpl(ctx.paused ? 'pause' : 'game');
  return ctx.paused;
}

export function toggleMute() {
  if (!ctx) return false;
  ctx.muted = !ctx.muted;
  try {
    if (ctx.audio && typeof ctx.audio.setMuted === 'function') {
      ctx.audio.setMuted(ctx.muted);
    } else if (ctx.audio) {
      ctx.audio.muted = ctx.muted;
    }
  } catch (e) {
    // audio opsional
  }
  return ctx.muted;
}

export function triggerBusted() {
  if (!ctx || ctx.busted) return false;
  ctx.busted = true;
  ctx.paused = true;
  showScreenImpl('busted');
  showToastImpl('BUSTED — polisi menangkapmu!');
  try {
    if (ctx.audio && typeof ctx.audio.play === 'function') ctx.audio.play('busted');
  } catch (e) {
    // audio opsional
  }
  return true;
}

function completeGame() {
  if (!ctx || ctx.completed) return;
  ctx.completed = true;
  showScreenImpl('complete');
  showToastImpl('TAMAT — Raka pulang dengan 29.700!');
  try {
    if (ctx.audio && typeof ctx.audio.play === 'function') ctx.audio.play('complete');
  } catch (e) {
    // audio opsional
  }
}

export function saveGame() {
  if (!ctx || typeof localStorage === 'undefined') return false;
  try {
    const data = {
      uang: ctx.player.uang || 0,
      mission: (ctx.missionState && ctx.missionState.current) || 0,
      x: ctx.player.x || 0,
      z: ctx.player.z || 0,
      wanted: (ctx.policeState && ctx.policeState.wanted) || 0,
      health: ctx.player.health || 100,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  if (!ctx || typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return false;
    ctx.player.uang = typeof data.uang === 'number' ? data.uang : 0;
    ctx.player.money = ctx.player.uang;
    ctx.money = ctx.player.uang;
    ctx.player.x = typeof data.x === 'number' ? data.x : 0;
    ctx.player.z = typeof data.z === 'number' ? data.z : 0;
    ctx.player.health = typeof data.health === 'number' ? data.health : 100;
    setMissionInternal(typeof data.mission === 'number' ? data.mission : 0);
    setWantedImpl(ctx.policeState, typeof data.wanted === 'number' ? data.wanted : 0, ctx);
    return true;
  } catch (e) {
    return false;
  }
}

function setMissionInternal(n) {
  if (!ctx || !ctx.missionState) return;
  const idx = clampNumber(n, 0, MISSION_DEFS.length - 1);
  ctx.missionState.current = idx;
  ctx.missionState.delivered = 0;
  ctx.missionState.attackersDefeated = 0;
  ctx.missionState.chaseCaught = false;
  ctx.missionState.finished = false;
  missionCar = null;
  targetCar = null;
  chaseTarget = null;
  ctx.missionCar = null;
  ctx.targetCar = null;
  ctx.chaseTarget = null;
  ctx.attackers = [];
  lastMissionIndex = -1;
  spawnedForMission = -1;
  ensureMissionSpawns();
}

function ensureMissionSpawns() {
  if (!ctx || !ctx.missionState) return;
  const idx = clampNumber(ctx.missionState.current || 0, 0, MISSION_DEFS.length - 1);
  if (idx === 1 && !missionCar) {
    spawnMissionCarImpl(100, 0, 'oranye');
  } else if (idx === 2 && !chaseTarget) {
    spawnChaseTargetImpl();
  } else if (idx === 3) {
    const list = ctx.attackers || [];
    const alive = list.filter((a) => a && a.alive !== false).length;
    if (alive === 0) spawnAttackersImpl(-200, 100, 3);
  }
  spawnedForMission = idx;
}

function moveChaseTarget(dt) {
  const t = chaseTarget;
  const p = ctx ? ctx.player : null;
  if (!t || t.caught || !p) return;
  const dx = (t.x || 0) - (p.x || 0);
  const dz = (t.z || 0) - (p.z || 0);
  const distPlayer = Math.sqrt(dx * dx + dz * dz);
  if (distPlayer < 8) {
    t.caught = true;
    if (ctx.missionState) ctx.missionState.chaseCaught = true;
    return;
  }
  // Melarikan diri: menjauh dari pemain + menuju Pesisir (0, 400).
  const awayX = distPlayer > 0.01 ? dx / distPlayer : 0;
  const awayZ = distPlayer > 0.01 ? dz / distPlayer : 1;
  const destX = 0 - (t.x || 0);
  const destZ = 400 - (t.z || 0);
  const distDest = Math.sqrt(destX * destX + destZ * destZ);
  const destNX = distDest > 0.01 ? destX / distDest : 0;
  const destNZ = distDest > 0.01 ? destZ / distDest : 0;
  let mx = awayX * 0.65 + destNX * 0.35;
  let mz = awayZ * 0.65 + destNZ * 0.35;
  const ml = Math.sqrt(mx * mx + mz * mz);
  if (ml > 0.01) {
    mx /= ml;
    mz /= ml;
  }
  t.x = clampNumber((t.x || 0) + mx * 7 * dt, -CITY_BOUND, CITY_BOUND);
  t.z = clampNumber((t.z || 0) + mz * 7 * dt, -CITY_BOUND, CITY_BOUND);
  t.heading = Math.atan2(mx, mz);
}

function moveAttackers(dt) {
  const p = ctx ? ctx.player : null;
  if (!p) return;
  const list = ctx.attackers || [];
  for (const a of list) {
    if (!a || a.alive === false) continue;
    const dx = (p.x || 0) - (a.x || 0);
    const dz = (p.z || 0) - (a.z || 0);
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 1.8 && dist > 0.01) {
      a.x += (dx / dist) * 3.2 * dt;
      a.z += (dz / dist) * 3.2 * dt;
      a.heading = Math.atan2(dx, dz);
    }
  }
}

export function getContext() {
  return ctx;
}

export function getState() {
  if (!ctx) return null;
  const p = ctx.player;
  const mission = currentMissionObject();
  return {
    x: p.x || 0,
    z: p.z || 0,
    angle: p.angle || 0,
    uang: p.uang || 0,
    money: p.uang || 0,
    mission: (ctx.missionState && ctx.missionState.current) || 0,
    missionName: (mission && mission.name) || '',
    objective: (mission && mission.objective) || '',
    wanted: (ctx.policeState && ctx.policeState.wanted) || 0,
    health: p.health || 0,
    speedKmh: Math.round(Math.abs(p.speedKmh || 0)),
    speed: p.speed || 0,
    screen: ctx.screen,
    started: ctx.started,
    paused: ctx.paused,
    busted: ctx.busted,
    completed: ctx.completed,
    chaseTarget: ctx.chaseTarget
      ? { x: ctx.chaseTarget.x, z: ctx.chaseTarget.z, caught: !!ctx.chaseTarget.caught }
      : null,
    attackersAlive: (ctx.attackers || []).filter((a) => a && a.alive !== false).length,
  };
}

function teleportImpl(x, z) {
  if (!ctx) return null;
  const nx = typeof x === 'number' ? x : 0;
  const nz = typeof z === 'number' ? z : 0;
  ctx.player.x = nx;
  ctx.player.z = nz;
  if (ctx.player.inCar && ctx.player.vehicle) {
    ctx.player.vehicle.x = nx;
    ctx.player.vehicle.z = nz;
  }
  return { x: nx, z: nz };
}

function setupDebug() {
  if (typeof window === 'undefined') return;
  const debug = {
    teleport: teleportImpl,
    teleportTo: teleportImpl,
    getMarker: getActiveMarkerImpl,
    getActiveMarker: getActiveMarkerImpl,
    marker: getActiveMarkerImpl,
    setMission: setMissionInternal,
    setMoney: (n) => {
      if (!ctx) return;
      ctx.player.uang = n;
      ctx.player.money = n;
      ctx.money = n;
    },
    setUang: (n) => {
      if (!ctx) return;
      ctx.player.uang = n;
      ctx.player.money = n;
      ctx.money = n;
    },
    setWanted: (n) => setWantedImpl(ctx ? ctx.policeState : null, n, ctx),
    spawnMissionCar: spawnMissionCarImpl,
    spawnChaseTarget: spawnChaseTargetImpl,
    spawnAttackers: spawnAttackersImpl,
    triggerBusted,
    busted: triggerBusted,
    getState,
    state: getState,
    getStatus: getState,
    save: saveGame,
    saveGame,
    load: loadGame,
    loadGame,
    start: startGame,
    startGame,
    restartMission,
    togglePause,
    pause: togglePause,
    getContext,
  };
  window.KOTA_DEBUG = debug;
  window.KOTA_CTX = ctx;
}

// ---------------------------------------------------------------------------
// Loop utama: input -> pemain -> traffic -> misi -> polisi -> tempur ->
// kamera -> HUD tiap frame -> render.
// ---------------------------------------------------------------------------
function tick(dt) {
  if (!ctx) return;
  const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.05) : 1 / 60;
  let inputState = null;
  if (getInputStateLocal) {
    try {
      inputState = getInputStateLocal();
    } catch (e) {
      inputState = null;
    }
  }
  ctx.inputState = inputState;
  if (inputState) {
    const pressed = inputState.pressed;
    const hasPressed = (code) =>
      pressed && typeof pressed.has === 'function' ? pressed.has(code) : !!inputState[code];
    if (hasPressed('KeyP') || hasPressed('Escape')) togglePause();
    if (hasPressed('KeyM')) toggleMute();
  }
  if (ctx.started && !ctx.paused) {
    if (updatePlayerLocal) {
      try {
        updatePlayerLocal(ctx.player, inputState, step, ctx);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('updatePlayer gagal:', e);
      }
    }
    if (updateTrafficFn && ctx.trafficState) {
      try {
        updateTrafficFn(ctx.trafficState, step, ctx.world, ctx);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('updateTraffic gagal:', e);
      }
    }
    if (updateMissionsFn && ctx.missionState) {
      try {
        updateMissionsFn(ctx.missionState, step, ctx);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('updateMissions gagal:', e);
      }
    } else if (ctx.missionState) {
      try {
        fallbackUpdateMissions(ctx.missionState, step, ctx);
      } catch (e) {
        // misi fallback tidak boleh mematikan loop
      }
    }
    ensureMissionSpawns();
    try {
      moveChaseTarget(step);
    } catch (e) {
      // target kejar tidak boleh mematikan loop
    }
    try {
      moveAttackers(step);
    } catch (e) {
      // penyerang tidak boleh mematikan loop
    }
    if (updatePoliceFn && ctx.policeState) {
      try {
        updatePoliceFn(ctx.policeState, step, ctx);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('updatePolice gagal:', e);
      }
    } else if (ctx.policeState) {
      try {
        fallbackUpdatePolice(ctx.policeState, step, ctx);
      } catch (e) {
        // polisi fallback tidak boleh mematikan loop
      }
    }
    if (updateCombatLocal && ctx.combatState) {
      try {
        updateCombatLocal(ctx.combatState, step, ctx);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('updateCombat gagal:', e);
      }
    }
    if (ctx.player) ctx.money = ctx.player.uang || 0;
    if (ctx.missionState && ctx.missionState.current !== lastMissionIndex) {
      lastMissionIndex = ctx.missionState.current;
    }
    if (
      (ctx.policeState && ctx.policeState.busted) ||
      (ctx.player && ctx.player.dead)
    ) {
      triggerBusted();
    } else if (
      ctx.missionState &&
      (ctx.missionState.finished || ctx.missionState.current >= MISSION_DEFS.length)
    ) {
      completeGame();
    }
  }
  updateCameraGuarded();
  try {
    syncAllMeshes();
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('sync mesh gagal:', e);
  }
  drawHUDSnapshot();
  if (renderer && scene && camera) {
    try {
      renderer.render(scene, camera);
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('render gagal:', e);
    }
  }
  if (clearFrameInputLocal) {
    try {
      clearFrameInputLocal();
    } catch (e) {
      // abaikan
    }
  }
}

function frame(now) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(frame);
  }
  const t = typeof now === 'number' ? now : 0;
  const dt = lastFrameTime > 0 ? (t - lastFrameTime) / 1000 : 1 / 60;
  lastFrameTime = t;
  try {
    tick(dt);
  } catch (e) {
    if (typeof console !== 'undefined') console.error('Loop utama gagal:', e);
  }
}

// ---------------------------------------------------------------------------
// Boot: muat modul lane lain secara dinamis (dengan fallback), bangun kota,
// buat konteks SEKALI, inisialisasi HUD + input SEKALI, jalan loop.
// ---------------------------------------------------------------------------
async function loadModuleOrNull(path) {
  try {
    return await import(path);
  } catch (e) {
    return null;
  }
}

async function boot() {
  if (booted) return;
  booted = true;
  if (typeof document === 'undefined') return;
  try {
    const threeMod = await loadModuleOrNull('three');
    if (threeMod) {
      THREE = threeMod.Vector3 ? threeMod : threeMod.default || null;
    }
    if (!THREE) {
      const vendorMod = await loadModuleOrNull('../vendor/three.module.min.js');
      if (vendorMod) THREE = vendorMod.Vector3 ? vendorMod : vendorMod.default || null;
    }
  } catch (e) {
    THREE = null;
  }
  const [worldMod, missionsMod, policeMod, trafficMod, vehiclesMod, hudMod, audioMod, playerMod, combatMod, inputMod] =
    await Promise.all([
      loadModuleOrNull('./world.js'),
      loadModuleOrNull('./missions.js'),
      loadModuleOrNull('./police.js'),
      loadModuleOrNull('./traffic.js'),
      loadModuleOrNull('./vehicles.js'),
      loadModuleOrNull('./hud.js'),
      loadModuleOrNull('./audio.js'),
      loadModuleOrNull('./player.js'),
      loadModuleOrNull('./combat.js'),
      loadModuleOrNull('./input.js'),
    ]);
  worldModule = worldMod;
  missionsModule = missionsMod;
  policeModule = policeMod;
  trafficModule = trafficMod;
  vehiclesModule = vehiclesMod;
  hudModule = hudMod;
  audioModule = audioMod;

  buildCityFn = pick(worldModule, ['buildCity', 'build', 'createCity']);
  findRoadPathFn = pick(worldModule, ['findRoadPath', 'findPath']);
  createMissionStateFn = pick(missionsModule, ['createMissionState', 'createMissions', 'initMissions', 'newMissionState']);
  updateMissionsFn = pick(missionsModule, ['updateMissions', 'updateMission', 'update']);
  getCurrentMissionFn = pick(missionsModule, ['getCurrentMission', 'currentMission', 'getMission']);
  getActiveMarkerFn = pick(missionsModule, ['getActiveMarker', 'getMarker', 'activeMarker']);
  onEnemyDefeatedFn = pick(missionsModule, ['onEnemyDefeated', 'enemyDefeated']);
  onCarStolenFn = pick(missionsModule, ['onCarStolen', 'carStolen']);
  resetMissionStateFn = pick(missionsModule, ['resetMissionState', 'resetMissions', 'reset']);
  createPoliceStateFn = pick(policeModule, ['createPoliceState', 'createPolice', 'initPolice']);
  updatePoliceFn = pick(policeModule, ['updatePolice', 'update']);
  addWantedFn = pick(policeModule, ['addWanted', 'increaseWanted', 'raiseWanted']);
  setWantedFn = pick(policeModule, ['setWanted', 'setWantedLevel']);
  createTrafficStateFn = pick(trafficModule, ['createTrafficState', 'createTraffic', 'initTraffic']);
  updateTrafficFn = pick(trafficModule, ['updateTraffic', 'update']);
  getVehicleHeadingFn = pick(vehiclesModule, ['getVehicleHeading', 'getHeading']);
  setVehicleHeadingFn = pick(vehiclesModule, ['setVehicleHeading', 'setHeading']);
  createVehicleFn = pick(vehiclesModule, ['createVehicle', 'spawnVehicle', 'makeVehicle']);
  initHUDFn = pick(hudModule, ['initHUD', 'init', 'initializeHUD']);
  drawHUDFn = pick(hudModule, ['drawHUD', 'draw', 'updateHUD', 'renderHUD']);
  showScreenFn = pick(hudModule, ['showScreen', 'setScreen', 'switchScreen', 'show']);
  showToastFn = pick(hudModule, ['showToast', 'toast', 'showNotification']);

  createPlayerLocal = (playerMod && playerMod.createPlayer) || fallbackCreatePlayer;
  updatePlayerLocal = (playerMod && playerMod.updatePlayer) || null;
  createCombatStateLocal = (combatMod && combatMod.createCombatState) || fallbackCreateCombatState;
  updateCombatLocal = (combatMod && combatMod.updateCombat) || null;
  initInputLocal = (inputMod && inputMod.initInput) || null;
  getInputStateLocal = (inputMod && inputMod.getInputState) || null;
  clearFrameInputLocal = (inputMod && inputMod.clearFrameInput) || null;

  // Renderer memakai kanvas placeholder #game-canvas yang sudah ada.
  let canvas = null;
  try {
    canvas = document.getElementById('game-canvas');
  } catch (e) {
    canvas = null;
  }
  scene = null;
  if (THREE) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas || undefined, antialias: true });
      if (renderer.setSize) {
        renderer.setSize(window.innerWidth || 1280, window.innerHeight || 720);
      }
      if (renderer.setPixelRatio && window.devicePixelRatio) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      }
      if (!canvas && renderer.domElement) {
        renderer.domElement.id = 'game-canvas';
        document.body.appendChild(renderer.domElement);
      }
    } catch (e) {
      renderer = null;
    }
    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x87b5d6);
      camera = new THREE.PerspectiveCamera(
        70,
        (window.innerWidth || 1280) / (window.innerHeight || 720),
        0.1,
        1500,
      );
      const ambient = new THREE.AmbientLight(0xfff2dd, 0.85);
      scene.add(ambient);
      const sun = new THREE.DirectionalLight(0xffe0b3, 1.1);
      sun.position.set(120, 180, 60);
      scene.add(sun);
    } catch (e) {
      scene = null;
      camera = null;
    }
  }

  // Bangun kota sekali; hasilnya disimpan di konteks sebagai dunia.
  let worldResult = null;
  if (buildCityFn) {
    try {
      worldResult = buildCityFn(scene);
    } catch (e) {
      try {
        worldResult = buildCityFn(scene);
      } catch (e2) {
        worldResult = null;
      }
    }
  }
  if (worldResult) {
    if (worldResult.isScene) {
      scene = worldResult;
    } else if (worldResult.scene) {
      scene = worldResult.scene;
    }
  }

  createContext();
  ctx.scene = scene;
  ctx.camera = camera;
  ctx.renderer = renderer;
  if (worldResult && typeof worldResult === 'object' && !worldResult.isScene) {
    ctx.world = worldResult;
  }
  if (!ctx.world) ctx.world = ctxWorldPlaceholder();
  if (!Array.isArray(ctx.world.vehicles)) ctx.world.vehicles = [];
  if (!Array.isArray(ctx.world.pedestrians)) ctx.world.pedestrians = [];
  ctx.vehicles = ctx.world.vehicles;
  // Traffic dibuat ulang dengan dunia + scene asli: saat boot, trafficState
  // dibuat sebelum dunia ada sehingga jatuh ke fallback kosong (0 mobil).
  if (createTrafficStateFn && ctx.trafficState && Array.isArray(ctx.trafficState.cars) && ctx.trafficState.cars.length === 0) {
    try { ctx.trafficState = createTrafficStateFn(ctx.world, scene); } catch (e) { /* tetap fallback kosong */ }
  }
  ctx.findRoadPath = findRoadPathFn || fallbackFindRoadPath;
  if (scene && !scene.userData) scene.userData = {};

  // Audio: bungkus modul audio (bila ada) jadi objek ctx.audio.
  const audioPlayFn = pick(audioModule, ['playSound', 'play', 'playEffect']);
  const audioMuteFn = pick(audioModule, ['setMuted', 'mute', 'setMute']);
  const audioInitFn = pick(audioModule, ['initAudio', 'init', 'createAudio']);
  if (audioInitFn) {
    try {
      audioInitFn();
    } catch (e) {
      // audio opsional
    }
  }
  ctx.audio = {
    muted: false,
    play(name) {
      if (this.muted) return;
      if (audioPlayFn) {
        try {
          audioPlayFn(name);
        } catch (e) {
          // abaikan
        }
      }
    },
    setMuted(m) {
      this.muted = !!m;
      if (audioMuteFn) {
        try {
          audioMuteFn(!!m);
        } catch (e) {
          // abaikan
        }
      }
    },
  };

  if (initHUDFn) {
    try {
      initHUDFn(startGame);
    } catch (e) {
      try {
        initHUDFn({ onStart: startGame });
      } catch (e2) {
        // HUD fallback DOM tetap jalan
      }
    }
  }
  if (!inputReady && initInputLocal) {
    try {
      initInputLocal({
        onStart: startGame,
        isStartScreen: () =>
          !ctx || ctx.screen === 'start' || ctx.screen === 'busted' || ctx.screen === 'complete',
      });
      inputReady = true;
    } catch (e) {
      // keyboard tetap bisa dibaca bila modul input gagal? tidak — catat saja
      if (typeof console !== 'undefined') console.warn('initInput gagal:', e);
    }
  }
  showScreenImpl('start');
  setupDebug();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      if (!camera || !renderer) return;
      try {
        camera.aspect = (window.innerWidth || 1280) / (window.innerHeight || 720);
        camera.updateProjectionMatrix();
        if (renderer.setSize) renderer.setSize(window.innerWidth, window.innerHeight);
      } catch (e) {
        // abaikan
      }
    });
  }
  lastFrameTime = typeof performance !== 'undefined' ? performance.now() : 0;
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(frame);
  }
  if (pendingStart) {
    pendingStart = false;
    startGame();
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

export const laneDFallbacks = {
  createMissionState: fallbackCreateMissionState,
  updateMissions: fallbackUpdateMissions,
  getCurrentMission: fallbackGetCurrentMission,
  getActiveMarker: fallbackGetActiveMarker,
  onEnemyDefeated: fallbackOnEnemyDefeated,
  onCarStolen: fallbackOnCarStolen,
  resetMissionState: fallbackResetMissionState,
  createPoliceState: fallbackCreatePoliceState,
  updatePolice: fallbackUpdatePolice,
  addWanted: fallbackAddWanted,
  setWanted: fallbackSetWanted,
  createTrafficState: fallbackCreateTrafficState,
  updateTraffic: fallbackUpdateTraffic,
  findRoadPath: fallbackFindRoadPath,
  computeChaseSpawn,
  createPlayer: fallbackCreatePlayer,
  createCombatState: fallbackCreateCombatState,
};
