// KOTA MENTARI — penata 4 foto (staging screenshot).
// Dipakai skrip retake foto, BUKAN saat bermain biasa. Setiap penata foto
// memakai antarmuka debug (KOTA_DEBUG) dan helper kamera ENAM ANGKA saja
// (posisi mata x/y/z + titik tatap x/y/z), lalu MEMVERIFIKASI dulu sebelum
// menangkap gambar: kota ter-render, mobil pemain + polisi dalam pandangan
// kamera, traffic terlihat. Bila verifikasi gagal keras, penata melempar
// error supaya skrip retake tahu staging mana yang rusak.
// Benih penata foto: 7.

import { CONFIG } from './config.js';

export const STAGE_SEED = 7;
export const SHOT_NAMES = ['chase', 'drive', 'street', 'start'];

// ---------------------------------------------------------------------------
// Util kecil
// ---------------------------------------------------------------------------

function sleepDefault(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Panggil method debug pertama yang ada dari daftar nama kandidat.
function callFirst(obj, names, ...args) {
  if (!obj) return undefined;
  for (const name of names) {
    const fn = obj[name];
    if (typeof fn === 'function') {
      try {
        return fn.apply(obj, args);
      } catch (err) {
        return undefined;
      }
    }
  }
  return undefined;
}

// Sama, tapi tanpa menelan error pemanggil bila method-nya memang ada.
function callStrict(obj, names, ...args) {
  if (!obj) return undefined;
  for (const name of names) {
    const fn = obj[name];
    if (typeof fn === 'function') return fn.apply(obj, args);
  }
  return undefined;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Arah maju dari sudut: komponen x dari sinus, komponen z dari kosinus.
function forwardFromAngle(angle) {
  return { x: Math.sin(angle), z: Math.cos(angle) };
}

function norm3(x, y, z) {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

// Apakah titik berada dalam pandangan kamera (di depan, cukup dekat)?
function pointInView(eye, target, point, maxDist) {
  const f = norm3(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
  const vx = point.x - eye[0];
  const vy = (point.y == null ? 0 : point.y) - eye[1];
  const vz = point.z - eye[2];
  const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (dist > (maxDist || 300) || dist < 0.5) return false;
  const dot = (vx * f.x + vy * f.y + vz * f.z) / dist;
  return dot > 0.45;
}

// ---------------------------------------------------------------------------
// Membaca keadaan game lewat antarmuka debug (toleran terhadap bentuk state)
// ---------------------------------------------------------------------------

function readState(debug) {
  const raw = callFirst(debug, ['getState', 'state', 'getDebugState', 'snapshot']);
  if (raw && typeof raw === 'object') return raw;
  return {};
}

function statePlayer(state) {
  const p = state.player || state.pemain || {};
  return {
    x: num(p.x != null ? p.x : p.pos && p.pos.x, 0),
    z: num(p.z != null ? p.z : p.pos && p.pos.z, 0),
    angle: num(p.angle != null ? p.angle : p.heading, 0),
    speedKmh: num(
      p.speedKmh != null ? p.speedKmh : p.speed != null ? p.speed * 3.6 : p.speedKmh,
      0,
    ),
    inCar: !!(p.inCar || p.driving || p.vehicle),
  };
}

function statePolice(state) {
  const raw = state.police;
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.units) ? raw.units : [];
  return list.map((u) => ({
    x: num(u.x != null ? u.x : u.pos && u.pos.x, NaN),
    z: num(u.z != null ? u.z : u.pos && u.pos.z, NaN),
  })).filter((u) => Number.isFinite(u.x) && Number.isFinite(u.z));
}

function stateTraffic(state) {
  const raw = state.traffic || {};
  const carsRaw = Array.isArray(raw.cars) ? raw.cars : Array.isArray(state.trafficCars) ? state.trafficCars : null;
  const pedsRaw = Array.isArray(raw.pedestrians) ? raw.pedestrians : Array.isArray(state.trafficPeds) ? state.trafficPeds : null;
  const toPoints = (arr) => (arr || []).map((u) => ({
    x: num(u.x != null ? u.x : u.pos && u.pos.x, NaN),
    z: num(u.z != null ? u.z : u.pos && u.pos.z, NaN),
    color: u.color || u.colour || null,
  })).filter((u) => Number.isFinite(u.x) && Number.isFinite(u.z));
  return {
    cars: toPoints(carsRaw),
    pedestrians: toPoints(pedsRaw),
    carCount: num(
      state.trafficCars != null && !Array.isArray(state.trafficCars) ? state.trafficCars : raw.carCount,
      carsRaw ? carsRaw.length : NaN,
    ),
    pedCount: num(
      state.trafficPeds != null && !Array.isArray(state.trafficPeds) ? state.trafficPeds : raw.pedCount,
      pedsRaw ? pedsRaw.length : NaN,
    ),
  };
}

function stateSceneChildren(state, debug) {
  const direct = num(state.sceneChildren, NaN);
  if (Number.isFinite(direct)) return direct;
  const fromWorld = num(state.world && state.world.sceneChildren, NaN);
  if (Number.isFinite(fromWorld)) return fromWorld;
  const viaDebug = num(callFirst(debug, ['getSceneChildren', 'sceneChildren']), NaN);
  if (Number.isFinite(viaDebug)) return viaDebug;
  const info = callFirst(debug, ['getSceneInfo']);
  if (info && typeof info === 'object') return num(info.sceneChildren, NaN);
  return NaN;
}

function stateMarker(state, debug) {
  const m = state.marker || state.activeMarker || null;
  if (m && Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.z))) {
    return { x: Number(m.x), z: Number(m.z) };
  }
  const viaDebug = callFirst(debug, ['getMarker', 'getActiveMarker']);
  if (viaDebug && Number.isFinite(Number(viaDebug.x))) {
    return { x: Number(viaDebug.x), z: Number(viaDebug.z) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verifikasi dunia sebelum menangkap gambar
// ---------------------------------------------------------------------------

function verifyWorld(env, need) {
  const { debug } = env;
  const state = readState(debug);
  const player = statePlayer(state);
  const police = statePolice(state);
  const traffic = stateTraffic(state);
  const sceneChildren = stateSceneChildren(state, debug);
  const checks = {
    sceneChildren: Number.isFinite(sceneChildren) ? sceneChildren : 'unknown',
    trafficCars: Number.isFinite(traffic.carCount) ? traffic.carCount : traffic.cars.length || 'unknown',
    trafficPeds: Number.isFinite(traffic.pedCount) ? traffic.pedCount : traffic.pedestrians.length || 'unknown',
    policeUnits: police.length,
    playerX: player.x,
    playerZ: player.z,
    speedKmh: player.speedKmh,
    money: num(state.money != null ? state.money : state.uang != null ? state.uang : player.uang, NaN),
    wanted: num(state.wanted != null ? state.wanted : state.police && state.police.wanted, NaN),
    mission: num(state.mission != null ? state.mission : state.currentMission != null ? state.currentMission : state.current, NaN),
  };
  const failures = [];
  // Kota HARUS ter-render: ~960+ simpul scene, bukan 3 (langit kosong).
  if (Number.isFinite(sceneChildren) && sceneChildren < 900) {
    failures.push(`kota tidak ter-render: sceneChildren ${sceneChildren} (< 900)`);
  }
  if (need.minTrafficCars != null) {
    const total = Number.isFinite(traffic.carCount) ? traffic.carCount : traffic.cars.length;
    if (Number.isFinite(total) && total < need.minTrafficCars) {
      failures.push(`traffic mobil ${total} (< ${need.minTrafficCars})`);
    }
  }
  if (need.minTrafficPeds != null) {
    const total = Number.isFinite(traffic.pedCount) ? traffic.pedCount : traffic.pedestrians.length;
    if (Number.isFinite(total) && total < need.minTrafficPeds) {
      failures.push(`pejalan kaki ${total} (< ${need.minTrafficPeds})`);
    }
  }
  if (need.minPolice != null && police.length < need.minPolice) {
    failures.push(`polisi ${police.length} (< ${need.minPolice})`);
  }
  if (failures.length > 0) {
    const err = new Error(`verifikasi foto gagal: ${failures.join('; ')}`);
    err.checks = checks;
    throw err;
  }
  return { state, player, police, traffic, sceneChildren, checks };
}

function verifyInView(eye, target, points, minCount, label) {
  if (!points || points.length === 0) return { count: 0, note: `${label}: posisi tidak tersedia di state` };
  const visible = points.filter((p) => pointInView(eye, target, p));
  if (visible.length < minCount) {
    throw new Error(`verifikasi foto gagal: ${label} terlihat ${visible.length} (< ${minCount})`);
  }
  return { count: visible.length, note: `${label} terlihat ${visible.length}` };
}

async function showToast(env, text) {
  const { debug } = env;
  const shown = callFirst(debug, ['showToast', 'toast']);
  if (shown !== undefined) return true;
  try {
    const hud = await import('./hud.js');
    if (hud && typeof hud.showToast === 'function') {
      hud.showToast(text);
      return true;
    }
  } catch (err) { /* HUD tidak menyediakan showToast */ }
  return false;
}

function pressKeyFn(env) {
  return typeof env.pressKey === 'function' ? env.pressKey : null;
}

async function startGame(env) {
  const { debug } = env;
  callFirst(debug, ['startGame', 'start', 'beginGame']);
  const pressKey = pressKeyFn(env);
  if (pressKey) {
    try { await pressKey('Enter', 120); } catch (err) { /* abaikan */ }
  }
  await (env.sleep || sleepDefault)(600);
}

function setMission(env, index) {
  callFirst(env.debug, ['setMission', 'setMissionIndex', 'setCurrentMission'], index);
}

function setMoney(env, value) {
  callFirst(env.debug, ['setMoney', 'setUang'], value);
}

function setWanted(env, stars) {
  callFirst(env.debug, ['setWanted', 'setWantedLevel'], stars);
}

function teleport(env, x, z, angle) {
  if (angle != null) {
    callFirst(env.debug, ['setPlayerAngle', 'setAngle'], angle);
  }
  callFirst(env.debug, ['teleport', 'warpTo', 'setPlayerPosition'], x, z);
  if (angle != null) {
    // Coba juga teleport 3 argumen (x, z, sudut) bila didukung.
    callFirst(env.debug, ['teleport'], x, z, angle);
  }
}

// ---------------------------------------------------------------------------
// Foto 1 — chase: kejar-kejaran, mobil oranye + 3 polisi formasi baji
// ---------------------------------------------------------------------------

export async function stageChase(env) {
  const sleep = env.sleep || sleepDefault;
  const pressKey = pressKeyFn(env);
  await startGame(env);
  setMission(env, 5);
  setMoney(env, CONFIG.stagingMoneyChase);
  setWanted(env, 3);
  // Mobil misi oranye di (100, 0); pemain teleport ke sampingnya lalu masuk.
  callFirst(env.debug, ['spawnMissionCar', 'spawnCar'], 100, 0, 'orange');
  teleport(env, 96, 2);
  await sleep(400);
  if (pressKey) {
    await pressKey('KeyE', 150);
    await sleep(600);
    // Gas sampai sekitar 100 km/jam.
    await pressKey('KeyW', 2600);
  }
  // Beri waktu polisi mendekat membentuk formasi baji di belakang pemain.
  await sleep(1200);
  const v = verifyWorld(env, { minTrafficCars: 1, minPolice: 3 });
  const fwd = forwardFromAngle(v.player.angle);
  const eye = [
    v.player.x - fwd.x * 26,
    7,
    v.player.z - fwd.z * 26,
  ];
  const target = [
    v.player.x + fwd.x * 6,
    1,
    v.player.z + fwd.z * 6,
  ];
  verifyInView(eye, target, [{ x: v.player.x, z: v.player.z }], 1, 'mobil pemain');
  verifyInView(eye, target, v.police, 3, 'polisi');
  await showToast(env, 'Misi 6: Jalan Pulang — kabur ke kapal di Pelabuhan!');
  const speed = v.checks.speedKmh;
  return {
    shot: 1,
    name: 'chase',
    camera: [...eye, ...target],
    verified: v.checks,
    speedKmh: speed,
    money: CONFIG.stagingMoneyChase,
    wanted: 3,
    note: `kejar-kejaran, kecepatan ${Number.isFinite(speed) ? Math.round(speed) : '?'} km/jam, 3 polisi di belakang`,
  };
}

// ---------------------------------------------------------------------------
// Foto 2 — drive: avenue RAMAI, 6+ mobil, 8+ pejalan kaki, 1 polisi jauh
// ---------------------------------------------------------------------------

export async function stageDrive(env) {
  const sleep = env.sleep || sleepDefault;
  const pressKey = pressKeyFn(env);
  await startGame(env);
  setMission(env, 0);
  setMoney(env, 500);
  setWanted(env, 1);
  // Avenue utara di x=100 menuju penanda Menara (100, -300); hadap utara.
  callFirst(env.debug, ['spawnMissionCar', 'spawnCar'], 100, 62, 'orange');
  teleport(env, 100, 58, Math.PI);
  await sleep(400);
  if (pressKey) {
    await pressKey('KeyE', 150);
    await sleep(600);
    // Gas secukupnya: sekitar 60 km/jam.
    await pressKey('KeyW', 1400);
  }
  await sleep(900);
  const v = verifyWorld(env, { minTrafficCars: 6, minTrafficPeds: 8, minPolice: 1 });
  const fwd = forwardFromAngle(v.player.angle);
  const eye = [
    v.player.x - fwd.x * 12,
    4,
    v.player.z - fwd.z * 12,
  ];
  const target = [
    v.player.x + fwd.x * 20,
    1,
    v.player.z + fwd.z * 20,
  ];
  verifyInView(eye, target, [{ x: v.player.x, z: v.player.z }], 1, 'mobil pemain');
  const trafficSeen = verifyInView(eye, target, v.traffic.cars, 6, 'mobil traffic');
  const pedsSeen = verifyInView(eye, target, v.traffic.pedestrians, 8, 'pejalan kaki');
  const policeSeen = verifyInView(eye, target, v.police, 1, 'polisi');
  const marker = stateMarker(v.state, env.debug);
  let markerAhead = null;
  if (marker) {
    const f = forwardFromAngle(v.player.angle);
    const dx = marker.x - v.player.x;
    const dz = marker.z - v.player.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    markerAhead = (dx * f.x + dz * f.z) / len > 0.8;
    if (!markerAhead) throw new Error('verifikasi foto gagal: penanda misi tidak di depan');
  }
  await showToast(env, 'Misi 1: Paket Kilat — antar paket ke Menara');
  const speed = v.checks.speedKmh;
  return {
    shot: 2,
    name: 'drive',
    camera: [...eye, ...target],
    verified: v.checks,
    trafficSeen: trafficSeen.count,
    pedsSeen: pedsSeen.count,
    policeSeen: policeSeen.count,
    markerAhead: marker ? !!markerAhead : 'unknown',
    speedKmh: speed,
    note: `avenue ramai: ${trafficSeen.count} mobil + ${pedsSeen.count} pejalan kaki terlihat, kecepatan ${Number.isFinite(speed) ? Math.round(speed) : '?'} km/jam`,
  };
}

// ---------------------------------------------------------------------------
// Foto 3 — street: jalan kaki, kamera RENDAH di belakang pemain
// ---------------------------------------------------------------------------

export async function stageStreet(env) {
  const sleep = env.sleep || sleepDefault;
  await startGame(env);
  setMission(env, 0);
  setMoney(env, 0);
  setWanted(env, 1);
  // Jalan kaki di persimpangan (0, 0), menghadap timur (sudut PI/2).
  teleport(env, 0, 0, Math.PI / 2);
  await sleep(700);
  const v = verifyWorld(env, { minTrafficCars: 1, minTrafficPeds: 2, minPolice: 1 });
  const fwd = forwardFromAngle(v.player.angle);
  // Kamera RENDAH setinggi jalan, tepat di belakang pemain: pemain BESAR
  // di tengah frame, bukan kamera udara dari atas.
  const eye = [
    v.player.x - fwd.x * 3.4,
    1.7,
    v.player.z - fwd.z * 3.4,
  ];
  const target = [
    v.player.x + fwd.x * 3,
    1.3,
    v.player.z + fwd.z * 3,
  ];
  verifyInView(eye, target, [{ x: v.player.x, z: v.player.z }], 1, 'pemain');
  const trafficSeen = verifyInView(eye, target, v.traffic.cars, 1, 'mobil traffic');
  const pedsSeen = verifyInView(eye, target, v.traffic.pedestrians, 2, 'pejalan kaki');
  const redAhead = v.traffic.cars.find((c) => {
    if (!c.color) return false;
    const s = String(c.color).toLowerCase();
    return s.includes('red') || s.includes('merah') || s === '#d21f2b' || s === '0xd21f2b';
  });
  await showToast(env, 'Paket 1 dari 3 terantar');
  return {
    shot: 3,
    name: 'street',
    camera: [...eye, ...target],
    verified: v.checks,
    trafficSeen: trafficSeen.count,
    pedsSeen: pedsSeen.count,
    redCarAhead: !!redAhead,
    banner: 'Paket 1 dari 3 terantar',
    wanted: 1,
    note: 'jalan kaki, kamera rendah di belakang pemain, banner paket tampil',
  };
}

// ---------------------------------------------------------------------------
// Foto 4 — start: layar mulai + kota dari udara (senja)
// ---------------------------------------------------------------------------

export async function stageStart(env) {
  const sleep = env.sleep || sleepDefault;
  // Kembali ke layar mulai (bukan layar bermain).
  const shown = callFirst(env.debug, ['showScreen', 'showStart', 'toMenu', 'quitToMenu'], 'start');
  if (shown === undefined) {
    callFirst(env.debug, ['showScreen'], 'menu');
  }
  await sleep(700);
  const v = verifyWorld(env, {});
  const cam = CONFIG.camera;
  const eye = cam.aerialEye.slice();
  const target = cam.aerialTarget.slice();
  // Layar mulai harus menampilkan judul + tombol Mulai Baru.
  let startVisible = 'unknown';
  try {
    if (typeof document !== 'undefined' && document.body) {
      const text = document.body.innerText || '';
      startVisible = text.includes('Mulai Baru') && text.includes(CONFIG.title);
    }
  } catch (err) { /* dokumen tidak tersedia */ }
  if (startVisible === false) {
    throw new Error('verifikasi foto gagal: layar mulai tidak menampilkan judul + tombol Mulai Baru');
  }
  return {
    shot: 4,
    name: 'start',
    camera: [...eye, ...target],
    verified: v.checks,
    startVisible,
    note: 'layar mulai + kota senja dari udara',
  };
}

// ---------------------------------------------------------------------------
// Dispatcher: dipakai skrip retake (stageShot(n, env))
// ---------------------------------------------------------------------------

export async function stageShot(n, env) {
  const shot = Number(n);
  if (!env || !env.debug || typeof env.setCamera !== 'function') {
    throw new Error('stageShot butuh env { debug, setCamera, sleep?, pressKey? }');
  }
  if (!env.sleep) env.sleep = sleepDefault;
  let report;
  if (shot === 1) report = await stageChase(env);
  else if (shot === 2) report = await stageDrive(env);
  else if (shot === 3) report = await stageStreet(env);
  else if (shot === 4) report = await stageStart(env);
  else throw new Error(`stageShot: nomor foto tidak dikenal: ${n}`);
  // Terapkan kamera hasil staging lewat helper enam angka.
  const c = report.camera;
  env.setCamera(c[0], c[1], c[2], c[3], c[4], c[5]);
  report.seed = STAGE_SEED;
  return report;
}
