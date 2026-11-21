// KOTA MENTARI — modul utama: renderer, kamera senja, mesin keadaan
// (menu / bermain / jeda / selesai / tertangkap), loop update-then-render,
// perangkai semua modul, simpan/muat, dan antarmuka debug KOTA_DEBUG.
// SATU fungsi mulai: tombol Mulai Baru dan Enter memanggil startGame.
// Pembangun kota SELALU dipanggil dengan scene; traffic dibuat HANYA
// setelah world siap (dibuat ulang bila jatuh ke fallback kosong).

import * as THREE from '../vendor/three.module.min.js';
import * as configMod from './config.js';
import * as worldMod from './world.js';
import * as trafficMod from './traffic.js';
import * as vehiclesMod from './vehicles.js';
import * as missionsMod from './missions.js';
import * as policeMod from './police.js';
import * as hudMod from './hud.js';
import * as audioMod from './audio.js';
import * as randomMod from './random.js';
import { createPlayer, updatePlayer, exitCar, buildPlayerMesh, damagePlayer } from './player.js';
import { createCombatState, updateCombat } from './combat.js';
import { initInput, isKeyDown, isPressed, clearPressed } from './input.js';

const SAVE_KEY = 'kota-mentari-save';
const MIRA_POS = { x: -200, z: 100 };
const PESISIR_POS = { x: 0, z: 400 };
const MISSION_CAR_POS = { x: 100, z: 0 };
const ATTACKER_SPEED = 3.2;
const CHASE_SPEED = 8;

const MISSION_MARKERS = [
  { x: 100, z: -300 },
  { x: 100, z: 0 },
  { x: 0, z: 400 },
  { x: -200, z: 100 },
  { x: 400, z: 300 },
  { x: 470, z: 350 },
];

const MISSION_OBJECTIVES = [
  'Antar 3 paket ke Menara.',
  'Curi mobil oranye di (100, 0), bawa ke Pesisir.',
  'Kejar target sampai ke Pesisir.',
  'Selamatkan Mira di (-200, 100) dari Geng Ombak.',
  'Ambil brankas di Pelabuhan.',
  'Kabur ke kapal di (470, 350).',
];

const SCREEN_TO_HUD = {
  menu: 'start',
  playing: 'playing',
  paused: 'paused',
  finished: 'complete',
  busted: 'busted',
};

const HUD_TO_SCREEN = {
  start: 'menu',
  menu: 'menu',
  hud: 'playing',
  playing: 'playing',
  pause: 'paused',
  paused: 'paused',
  complete: 'finished',
  finished: 'finished',
  busted: 'busted',
};

// ---------- util ----------

function cfgValue(names, fallback) {
  for (const name of names) {
    if (configMod && typeof configMod[name] !== 'undefined') return configMod[name];
    if (configMod && configMod.default && typeof configMod.default[name] !== 'undefined') {
      return configMod.default[name];
    }
  }
  return fallback;
}

const TOTAL_MISSIONS = cfgValue(['TOTAL_MISSIONS', 'missionCount', 'totalMissions'], 6);

function pickFn(mod, names, label, required) {
  const sources = [];
  if (mod) sources.push(mod);
  if (mod && mod.default && typeof mod.default === 'object') sources.push(mod.default);
  for (const source of sources) {
    for (const name of names) {
      if (typeof source[name] === 'function') return source[name];
    }
  }
  if (required) {
    throw new Error('KOTA MENTARI: ' + label + ' tidak ditemukan (dicari: ' + names.join(', ') + ')');
  }
  return null;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  try {
    if (randomMod) {
      if (typeof randomMod.createRng === 'function') return randomMod.createRng(seed);
      if (typeof randomMod.seededRandom === 'function') return randomMod.seededRandom(seed);
      if (typeof randomMod.mulberry32 === 'function') return randomMod.mulberry32(seed);
    }
  } catch (error) {
    // pakai RNG lokal berbiji tetap
  }
  return mulberry32(seed);
}

const rng = makeRng(7);

function colorHex(color) {
  if (typeof color === 'number') return color;
  const map = {
    orange: 0xff7a1a,
    white: 0xf2f2f2,
    red: 0xc22a2a,
    blue: 0x2a5ac2,
    green: 0x2a7a3a,
    yellow: 0xe8c832,
    black: 0x181818,
    grey: 0x888888,
    gray: 0x888888,
    pink: 0xe87aa8,
  };
  if (typeof color === 'string') {
    const key = color.toLowerCase();
    if (map[key]) return map[key];
    if (key[0] === '#') {
      const parsed = parseInt(key.slice(1), 16);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return 0xff7a1a;
}

// ---------- keadaan modul ----------

let booted = false;
let renderer = null;
let scene = null;
let camera = null;
let canvas = null;
let world = null;
let trafficState = null;
let player = null;
let playerMesh = null;
let combatState = null;
let missionState = null;
let policeState = null;
let ctx = null;
let screen = 'menu';
let inputReady = false;
let running = false;
let lastTime = 0;
let toastText = '';
let muted = false;
let menuAngle = 0;
let startedMission = -1;
let missionCar = null;
let chaseTarget = null;
let attackers = [];
let policeMeshes = new Map();
let cameraOverride = null;
let cameraOverrideUntil = 0;

// Fungsi modul lain yang diputuskan saat boot (gagal keras bila tak ada).
let buildCityFn = null;
let findRoadPathFn = null;
let createTrafficFn = null;
let updateTrafficFn = null;
let createMissionStateFn = null;
let startMissionFn = null;
let updateMissionsFn = null;
let getActiveMissionFn = null;
let getActiveMarkerFn = null;
let getObjectiveTextFn = null;
let createPoliceStateFn = null;
let updatePoliceFn = null;
let addWantedFn = null;
let setWantedFn = null;
let spawnPoliceFn = null;
let buildCarMeshFn = null;
let hudInitFn = null;
let hudShowScreenFn = null;
let hudDrawHudFn = null;
let hudShowToastFn = null;

// ---------- audio (opsional, dijaga) ----------

function playSound(name) {
  if (muted) return;
  try {
    if (audioMod && typeof audioMod.playSound === 'function') audioMod.playSound(name);
    else if (audioMod && typeof audioMod.play === 'function') audioMod.play(name);
  } catch (error) {
    // bunyi opsional: jangan jatuhkan game
  }
}

function toggleMute() {
  muted = !muted;
  try {
    if (audioMod && typeof audioMod.setMuted === 'function') audioMod.setMuted(muted);
    else if (audioMod && typeof audioMod.toggleMute === 'function') audioMod.toggleMute();
  } catch (error) {
    // abaikan
  }
  showToast(muted ? 'Suara dimatikan.' : 'Suara dinyalakan.');
  return muted;
}

// ---------- kamera: HANYA enam angka ----------

function applyCamera(eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
  camera.position.set(eyeX, eyeY, eyeZ);
  camera.lookAt(lookX, lookY, lookZ);
}

// Helper kamera internal — nama yang sama diekspos ke KOTA_DEBUG.
// HANYA menerima enam angka: posisi mata x/y/z + titik tatap x/y/z.
// Sekali dipanggil, kamera dikunci ke bingkai itu selama 3 detik supaya
// penata foto sempat menangkap gambar sebelum loop menggerakkan kamera.
export function setCamera(eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
  applyCamera(eyeX, eyeY, eyeZ, lookX, lookY, lookZ);
  cameraOverride = { eyeX, eyeY, eyeZ, lookX, lookY, lookZ };
  cameraOverrideUntil = performance.now() + 3000;
}

function clearCameraOverride() {
  cameraOverride = null;
  cameraOverrideUntil = 0;
}

function updateCamera() {
  if (!camera) return;
  if (cameraOverride && performance.now() < cameraOverrideUntil) {
    applyCamera(
      cameraOverride.eyeX,
      cameraOverride.eyeY,
      cameraOverride.eyeZ,
      cameraOverride.lookX,
      cameraOverride.lookY,
      cameraOverride.lookZ,
    );
    return;
  }
  cameraOverride = null;
  if (screen === 'menu') {
    menuAngle += 0.0006;
    const eyeX = Math.cos(menuAngle) * 170;
    const eyeZ = Math.sin(menuAngle) * 170;
    applyCamera(eyeX, 100, eyeZ, 0, 0, 0);
    return;
  }
  if (!player) return;
  const forwardX = Math.sin(player.angle);
  const forwardZ = Math.cos(player.angle);
  const back = player.inCar ? 10 : 6.5;
  const height = player.inCar ? 4.2 : 3.4;
  applyCamera(
    player.x - forwardX * back,
    height,
    player.z - forwardZ * back,
    player.x + forwardX * 6,
    1.6,
    player.z + forwardZ * 6,
  );
}

// ---------- HUD (API module-level, tanpa argumen hud) ----------

function showGameScreen(name, data) {
  const hudName = SCREEN_TO_HUD[name] || name;
  hudShowScreenFn(hudName, data);
}

function showToast(text) {
  toastText = text;
  hudShowToastFn(text);
}

function currentObjective() {
  // Teks objective ASLI dari modul misi (getObjectiveText) — bukan dari
  // field `objective` objek misi (yang tidak pernah ada).
  try {
    if (getObjectiveTextFn && missionState && ctx) {
      const text = getObjectiveTextFn(missionState, ctx);
      if (text) return text;
    }
  } catch (error) {
    // pakai teks cadangan di bawah
  }
  try {
    if (getActiveMissionFn && missionState && ctx) {
      const mission = getActiveMissionFn(missionState, ctx);
      if (mission) {
        return mission.objective || mission.text || mission.description || mission.title || mission.name || '';
      }
    }
  } catch (error) {
    // pakai teks cadangan di bawah
  }
  return MISSION_OBJECTIVES[getMissionIndex()] || '';
}

function currentMissionTitle() {
  try {
    if (getActiveMissionFn && missionState && ctx) {
      const mission = getActiveMissionFn(missionState, ctx);
      if (mission && mission.name) return mission.name;
    }
  } catch (error) {
    // pakai teks cadangan di bawah
  }
  return '';
}

function drawHudFrame() {
  if (!hudDrawHudFn || !player || !policeState || !missionState) return;
  const snapshot = {
    player,
    playerAngle: player.angle,
    police: policeState.units || [],
    policeState,
    missionState,
    speedKmh: Math.abs(player.speed || 0) * 3.6,
    speed: Math.abs(player.speed || 0) * 3.6,
    toast: toastText,
    screen,
    wanted: getWanted(),
    health: player.health,
    money: player.uang,
    uang: player.uang,
    objective: currentObjective(),
    missionTitle: currentMissionTitle(),
    marker: getActiveMarker(),
  };
  try {
    hudDrawHudFn(snapshot);
  } catch (error) {
    console.error('KOTA MENTARI: drawHud gagal', error);
  }
}

// ---------- simpan / muat ----------

function saveGame() {
  if (!player || !missionState) return null;
  const data = {
    version: 1,
    uang: player.uang,
    money: player.uang,
    mission: getMissionIndex(),
    nextMission: getMissionIndex() + 1,
    x: player.x,
    z: player.z,
    wanted: getWanted(),
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (error) {
    // penyimpanan tidak tersedia: game tetap jalan
  }
  return data;
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (error) {
    return null;
  }
}

// ---------- cari jalur (wrapper world, 5 argumen) ----------

function findRoadPath(a, b, c, d) {
  let from = a;
  let to = b;
  if (
    typeof a === 'number' &&
    typeof b === 'number' &&
    typeof c === 'number' &&
    typeof d === 'number'
  ) {
    from = { x: a, z: b };
    to = { x: c, z: d };
  }
  try {
    const points = findRoadPathFn(world, from.x, from.z, to.x, to.z);
    if (Array.isArray(points) && points.length > 0) return points;
  } catch (error) {
    // gagal: kembalikan garis lurus
  }
  return [from, to];
}

// ---------- wanted ----------

function getWanted() {
  if (!policeState) return 0;
  if (typeof policeState.wanted === 'number') return policeState.wanted;
  if (typeof policeState.stars === 'number') return policeState.stars;
  return 0;
}

function setWanted(value) {
  const clamped = Math.max(0, Math.min(5, value | 0));
  if (!policeState) return clamped;
  if (setWantedFn) {
    try {
      setWantedFn(policeState, clamped, ctx);
    } catch (error) {
      policeState.wanted = clamped;
    }
  }
  policeState.wanted = clamped;
  return clamped;
}

function addWanted(amount) {
  if (!policeState) return 0;
  if (addWantedFn) {
    try {
      addWantedFn(policeState, amount, ctx);
      return getWanted();
    } catch (error) {
      // jatuh ke set langsung di bawah
    }
  }
  return setWanted(getWanted() + amount);
}

function normalizePolice(state) {
  if (!state) return;
  if (!Array.isArray(state.units)) {
    state.units = state.officers || state.cops || [];
  }
  if (typeof state.wanted !== 'number') {
    state.wanted = typeof state.stars === 'number' ? state.stars : 0;
  }
}

// ---------- misi ----------

function getMissionIndex() {
  if (!missionState) return 0;
  if (typeof missionState.current === 'number') return missionState.current;
  if (typeof missionState.index === 'number') return missionState.index;
  return 0;
}

function setMissionIndex(index) {
  if (!missionState) return;
  missionState.current = index;
  missionState.index = index;
}

function getActiveMarker() {
  try {
    if (getActiveMarkerFn && missionState && ctx) {
      const marker = getActiveMarkerFn(missionState, ctx);
      if (marker && typeof marker.x === 'number' && typeof marker.z === 'number') {
        return { x: marker.x, z: marker.z };
      }
    }
  } catch (error) {
    // pakai penanda cadangan di bawah
  }
  const fallback = MISSION_MARKERS[getMissionIndex()] || { x: 100, z: -300 };
  return { x: fallback.x, z: fallback.z };
}

function startMissionAt(index) {
  startedMission = index;
  setMissionIndex(index);
  try {
    startMissionFn(missionState, index, ctx);
  } catch (error) {
    console.error('KOTA MENTARI: startMission gagal', error);
  }
  if (index === 1 && !missionCar) {
    spawnMissionCar(MISSION_CAR_POS.x, MISSION_CAR_POS.z, 'orange');
  }
  if (index === 2 && (!chaseTarget || chaseTarget.caught)) {
    spawnChaseTarget();
  }
  if (index === 3 && attackers.filter((attacker) => !attacker.dead).length === 0) {
    spawnAttackers(MIRA_POS.x, MIRA_POS.z, 3);
  }
}

// ---------- mesh: mobil, orang, polisi ----------

function buildCarMesh(color) {
  if (buildCarMeshFn) {
    try {
      const mesh = buildCarMeshFn(color);
      if (mesh) return mesh;
    } catch (error) {
      // pakai pembangun lokal di bawah
    }
  }
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex(color) });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.55, 4.2), paint);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.2), glass);
  cabin.position.set(0, 1.05, -0.2);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelSpots = [
    [-0.95, 1.35],
    [0.95, 1.35],
    [-0.95, -1.35],
    [0.95, -1.35],
  ];
  for (const spot of wheelSpots) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(spot[0], 0.36, spot[1]);
    group.add(wheel);
  }
  return group;
}

function buildPersonMesh(color) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: 0x22242e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5f });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.32), shirt);
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
  head.position.y = 1.6;
  group.add(head);
  const legLeft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.26), pants);
  legLeft.position.set(-0.15, 0.35, 0);
  group.add(legLeft);
  const legRight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.26), pants);
  legRight.position.set(0.15, 0.35, 0);
  group.add(legRight);
  return group;
}

function buildPoliceCarMesh() {
  const group = buildCarMesh('white');
  const red = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xd21f26 }),
  );
  red.position.set(-0.35, 1.38, -0.2);
  group.add(red);
  const blue = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x1f4fd2 }),
  );
  blue.position.set(0.35, 1.38, -0.2);
  group.add(blue);
  return group;
}

function buildRoadblockMesh() {
  const group = new THREE.Group();
  const orange = new THREE.MeshLambertMaterial({ color: 0xe8721a });
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22242e });
  const barTop = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.35, 0.25), orange);
  barTop.position.y = 1.05;
  group.add(barTop);
  const barMid = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.35, 0.25), white);
  barMid.position.y = 0.6;
  group.add(barMid);
  for (const legX of [-1.9, 1.9]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.6), dark);
    leg.position.set(legX, 0.6, 0);
    group.add(leg);
  }
  return group;
}

function clearPoliceMeshes() {
  for (const mesh of policeMeshes.values()) {
    scene.remove(mesh);
  }
  policeMeshes.clear();
}

// Unit polisi TANPA mesh di modul polisi: loop utama menggambar mobil
// polisi putih + roadblock dari daftar unit.
function syncPoliceMeshes() {
  if (!policeState || !Array.isArray(policeState.units)) return;
  const seen = new Set();
  for (const unit of policeState.units) {
    if (!unit || unit.disabled || unit.dead) continue;
    seen.add(unit);
    let mesh = policeMeshes.get(unit);
    if (!mesh) {
      mesh = unit.roadblock || unit.type === 'roadblock' ? buildRoadblockMesh() : buildPoliceCarMesh();
      scene.add(mesh);
      policeMeshes.set(unit, mesh);
    }
    mesh.position.set(unit.x || 0, 0, unit.z || 0);
    mesh.rotation.y = unit.angle ?? unit.heading ?? unit.rotation ?? 0;
    mesh.visible = true;
  }
  for (const entry of policeMeshes.entries()) {
    if (!seen.has(entry[0])) {
      scene.remove(entry[1]);
      policeMeshes.delete(entry[0]);
    }
  }
}

function syncCarMeshes() {
  if (missionCar && missionCar.mesh) {
    missionCar.mesh.position.set(missionCar.x, 0, missionCar.z);
    missionCar.mesh.rotation.y = missionCar.heading || 0;
  }
  if (player && player.car && player.car.mesh) {
    player.car.mesh.position.set(player.car.x, 0, player.car.z);
    player.car.mesh.rotation.y = player.car.heading || 0;
  }
}

// ---------- pemuncul (dipakai modul misi lewat konteks + KOTA_DEBUG) ----------

function allCars() {
  const list = [];
  if (trafficState && Array.isArray(trafficState.cars)) list.push(...trafficState.cars);
  if (missionCar) list.push(missionCar);
  return list;
}

function spawnMissionCar(x, z, color) {
  if (missionCar && missionCar.mesh) scene.remove(missionCar.mesh);
  const carColor = color || 'orange';
  const car = {
    x,
    z,
    heading: 0,
    speed: 0,
    color: carColor,
    mission: true,
    stolen: false,
    stolenByPlayer: false,
    driver: null,
    mesh: null,
  };
  car.mesh = buildCarMesh(carColor);
  car.mesh.position.set(x, 0, z);
  scene.add(car.mesh);
  missionCar = car;
  if (ctx) ctx.cars = allCars();
  return car;
}

function spawnChaseTarget() {
  const x = player ? player.x + 90 : 90;
  const z = player ? player.z - 80 : -80;
  if (chaseTarget && chaseTarget.mesh) scene.remove(chaseTarget.mesh);
  const mesh = buildPersonMesh(0x8a1f2d);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  chaseTarget = { x, z, angle: 0, caught: false, mesh };
  return chaseTarget;
}

function spawnAttackers(x, z, count) {
  const total = count || 3;
  for (const old of attackers) {
    if (old.mesh) scene.remove(old.mesh);
  }
  attackers.length = 0;
  for (let i = 0; i < total; i++) {
    const attacker = {
      x: x + i * 3,
      z: z + (i % 2) * 2,
      angle: 0,
      health: 100,
      speed: ATTACKER_SPEED,
      mesh: buildPersonMesh(0x2d3a4a),
    };
    attacker.mesh.position.set(attacker.x, 0, attacker.z);
    scene.add(attacker.mesh);
    attackers.push(attacker);
  }
  if (ctx) ctx.enemies = attackers;
  return attackers;
}

function spawnPoliceNearPlayer() {
  if (!ctx) startGame();
  setWanted(Math.max(1, getWanted()));
  if (spawnPoliceFn) {
    try {
      spawnPoliceFn(policeState, ctx);
      return policeState.units || [];
    } catch (error) {
      // buat manual di bawah
    }
  }
  if (!Array.isArray(policeState.units)) policeState.units = [];
  const offsets = [
    [12, 4],
    [-10, 8],
    [6, -12],
  ];
  for (const offset of offsets) {
    const jitterX = (rng() - 0.5) * 2;
    const jitterZ = (rng() - 0.5) * 2;
    policeState.units.push({
      x: player.x + offset[0] + jitterX,
      z: player.z + offset[1] + jitterZ,
      angle: Math.atan2(-offset[0], -offset[1]),
      heading: 0,
      health: 100,
      roadblock: false,
    });
  }
  return policeState.units;
}

// ---------- konteks game ----------

function buildContext() {
  return {
    player,
    world,
    scene,
    camera,
    renderer,
    missionState,
    policeState,
    traffic: trafficState,
    trafficState,
    cars: [],
    enemies: attackers,
    attackers,
    input: { isDown: isKeyDown, wasPressed: isPressed },
    addWanted: (amount) => addWanted(amount),
    addMoney: (amount) => {
      player.uang += amount;
      return player.uang;
    },
    addReward: (amount) => {
      player.uang += amount;
      return player.uang;
    },
    saveGame: () => saveGame(),
    showToast: (text) => showToast(text),
    findRoadPath: (a, b, c, d) => findRoadPath(a, b, c, d),
    findPath: (a, b, c, d) => findRoadPath(a, b, c, d),
    spawnMissionCar: (x, z, color) => spawnMissionCar(x, z, color),
    spawnChaseTarget: () => spawnChaseTarget(),
    spawnAttackers: (x, z, count) => spawnAttackers(x, z, count),
    // Misi 2: pencurian mobil memberi tahu modul misi (onCarStolen).
    onCarStolen: () => {
      try {
        if (missionsMod && typeof missionsMod.onCarStolen === 'function') {
          missionsMod.onCarStolen(missionState, ctx);
        }
      } catch (error) {
        // Gagal memberi tahu misi tidak boleh menggagalkan pencurian.
      }
    },
    // Misi 4: kematian penyerang memberi tahu modul misi (onEnemyDefeated).
    onEnemyDefeated: (enemy) => {
      try {
        if (missionsMod && typeof missionsMod.onEnemyDefeated === 'function') {
          missionsMod.onEnemyDefeated(missionState, ctx);
        }
      } catch (error) {
        // Gagal memberi tahu misi tidak boleh menggagalkan tempur.
      }
    },
    getActiveMarker: () => getActiveMarker(),
    triggerBusted: () => triggerBusted(),
    onBusted: () => triggerBusted(),
    playSound: (name) => playSound(name),
    audio: audioMod,
    getNearbyCar: (x, z, maxDistance) => {
      let best = null;
      let bestDist = maxDistance;
      for (const car of allCars()) {
        if (!car || car === player.car) continue;
        const dx = car.x - x;
        const dz = car.z - z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < bestDist) {
          bestDist = dist;
          best = car;
        }
      }
      return best;
    },
    get missionCar() {
      return missionCar;
    },
    get chaseTarget() {
      return chaseTarget;
    },
  };
}

// ---------- mesin keadaan ----------

// Save asli SELALU ditulis saveGame() dengan version: 1. Apa pun yang
// bukan itu — termasuk MouseEvent dari klik tombol (punya .x/.y numerik
// = posisi klik) — BUKAN save dan harus diabaikan: mulai dari nol.
function isValidSave(data) {
  return (
    !!data &&
    typeof data === 'object' &&
    data.version === 1 &&
    (typeof data.uang === 'number' || typeof data.money === 'number')
  );
}

// SATU fungsi mulai: tombol Mulai Baru dan Enter memanggil ini.
// saveData opsional: bila ada, muat save itu, bukan mulai dari nol.
function startGame(saveData) {
  if (!booted) boot();
  if (playerMesh) scene.remove(playerMesh);
  if (missionCar && missionCar.mesh) scene.remove(missionCar.mesh);
  missionCar = null;
  clearPoliceMeshes();
  player = createPlayer();
  playerMesh = buildPlayerMesh();
  player.mesh = playerMesh;
  scene.add(playerMesh);
  combatState = createCombatState();
  missionState = createMissionStateFn();
  policeState = createPoliceStateFn();
  normalizePolice(policeState);
  attackers = [];
  chaseTarget = null;
  startedMission = -1;
  toastText = '';
  ctx = buildContext();
  const save = isValidSave(saveData) ? saveData : null;
  if (save) {
    player.uang = typeof save.uang === 'number' ? save.uang : (save.money || 0);
    player.x = typeof save.x === 'number' ? save.x : 0;
    player.z = typeof save.z === 'number' ? save.z : 0;
    const missionIndex =
      typeof save.mission === 'number'
        ? save.mission
        : typeof save.nextMission === 'number'
          ? save.nextMission - 1
          : 0;
    setMissionIndex(missionIndex);
    setWanted(typeof save.wanted === 'number' ? save.wanted : 0);
  } else {
    player.x = 0;
    player.z = 0;
    player.angle = 0;
    setMissionIndex(0);
    setWanted(0);
  }
  screen = 'playing';
  showGameScreen('playing');
  startMissionAt(getMissionIndex());
  showToast(
    save
      ? 'Lanjutan dimuat. Selamat datang kembali di Kota Mentari.'
      : 'Misi 1: Paket Kilat — antar 3 paket ke Menara.',
  );
  try {
    if (audioMod && typeof audioMod.startMusic === 'function') audioMod.startMusic();
  } catch (error) {
    // abaikan
  }
  running = true;
  lastTime = performance.now();
}

// Muat save lalu main; tanpa save, mulai baru.
function continueGame() {
  const save = loadGame();
  startGame(save || undefined);
}

function retryMission() {
  if (!ctx) {
    startGame();
    return;
  }
  if (player.inCar) exitCar(player);
  player.health = player.maxHealth || 100;
  player.x = 0;
  player.z = 0;
  player.angle = 0;
  player.speed = 0;
  setWanted(0);
  if (policeState) {
    policeState.busted = false;
    if (Array.isArray(policeState.units)) policeState.units.length = 0;
  }
  clearPoliceMeshes();
  screen = 'playing';
  showGameScreen('playing');
  startMissionAt(getMissionIndex());
  showToast('Misi diulang dari awal.');
}

function quitToMenu() {
  saveGame();
  screen = 'menu';
  menuAngle = 0;
  showGameScreen('menu');
}

function playAgain() {
  startGame();
}

function pauseGame() {
  if (screen !== 'playing') return;
  screen = 'paused';
  showGameScreen('paused');
}

function resumeGame() {
  if (screen !== 'paused') return;
  screen = 'playing';
  showGameScreen('playing');
  lastTime = performance.now();
}

function triggerBusted() {
  if (!ctx) startGame();
  screen = 'busted';
  if (policeState) policeState.busted = true;
  playSound('busted');
  showGameScreen('busted');
  saveGame();
}

function finishGame() {
  if (screen === 'finished') return;
  screen = 'finished';
  playSound('complete');
  saveGame();
  // UANG AKHIR ASLI dikirim eksplisit ke layar TAMAT. Hadiah M6 (+15000)
  // sudah ditambahkan completeMission SEBELUM updateGame memanggil
  // finishGame, jadi player.uang di sini sudah termasuk hadiah itu.
  showGameScreen('finished', { money: player.uang });
  showToast('TAMAT — perjalanan Raka selesai. Uang: ' + player.uang + '.');
}

// ---------- gerak target kejar + penyerang (HANYA loop utama) ----------

function moveChaseTarget(dt) {
  const target = chaseTarget;
  if (!target || target.caught || !player) return;
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const distToPlayer = Math.sqrt(dx * dx + dz * dz);
  if (distToPlayer < 3.5) {
    target.caught = true;
    return;
  }
  const awayX = dx / (distToPlayer || 1);
  const awayZ = dz / (distToPlayer || 1);
  const destX = PESISIR_POS.x - target.x;
  const destZ = PESISIR_POS.z - target.z;
  const destDist = Math.sqrt(destX * destX + destZ * destZ) || 1;
  let dirX = awayX * 0.7 + (destX / destDist) * 0.6;
  let dirZ = awayZ * 0.7 + (destZ / destDist) * 0.6;
  const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
  dirX /= len;
  dirZ /= len;
  target.x += dirX * CHASE_SPEED * dt;
  target.z += dirZ * CHASE_SPEED * dt;
  target.angle = Math.atan2(dirX, dirZ);
  if (target.mesh) {
    target.mesh.position.set(target.x, 0, target.z);
    target.mesh.rotation.y = target.angle;
  }
}

function moveAttackers(dt) {
  for (const attacker of attackers) {
    if (!attacker || attacker.dead || !player) continue;
    const dxPlayer = player.x - attacker.x;
    const dzPlayer = player.z - attacker.z;
    const distPlayer = Math.sqrt(dxPlayer * dxPlayer + dzPlayer * dzPlayer);
    const goal = distPlayer < 25 ? player : MIRA_POS;
    const dx = goal.x - attacker.x;
    const dz = goal.z - attacker.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    if (dist < 1.8) {
      if (goal === player) damagePlayer(player, 12 * dt);
      continue;
    }
    attacker.x += (dx / dist) * ATTACKER_SPEED * dt;
    attacker.z += (dz / dist) * ATTACKER_SPEED * dt;
    attacker.angle = Math.atan2(dx / dist, dz / dist);
    if (attacker.mesh) {
      attacker.mesh.position.set(attacker.x, 0, attacker.z);
      attacker.mesh.rotation.y = attacker.angle;
    }
  }
}

// ---------- update ----------

function updateGame(dt) {
  if (isPressed('KeyM')) toggleMute();
  try {
    updatePlayer(player, dt, ctx);
  } catch (error) {
    console.error('KOTA MENTARI: updatePlayer gagal', error);
  }
  try {
    updateCombat(combatState, player, dt, ctx);
  } catch (error) {
    console.error('KOTA MENTARI: updateCombat gagal', error);
  }
  try {
    updateMissionsFn(missionState, dt, ctx);
  } catch (error) {
    console.error('KOTA MENTARI: updateMissions gagal', error);
  }
  try {
    updatePoliceFn(policeState, dt, ctx);
  } catch (error) {
    console.error('KOTA MENTARI: updatePolice gagal', error);
  }
  try {
    updateTrafficFn(trafficState, dt, world, ctx);
  } catch (error) {
    console.error('KOTA MENTARI: updateTraffic gagal', error);
  }
  moveChaseTarget(dt);
  moveAttackers(dt);
  const index = getMissionIndex();
  if (missionState.finished || index >= TOTAL_MISSIONS) {
    finishGame();
    return;
  }
  if (index !== startedMission) startMissionAt(index);
  if (policeState && policeState.busted) {
    triggerBusted();
    return;
  }
  if (player.health <= 0) {
    triggerBusted();
    return;
  }
  ctx.cars = allCars();
  syncCarMeshes();
  syncPoliceMeshes();
}

// ---------- loop ----------

function loop(timestamp) {
  requestAnimationFrame(loop);
  const now = timestamp || performance.now();
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  if (screen === 'menu' && isPressed('Enter')) {
    startGame();
  }
  if (
    (screen === 'playing' || screen === 'paused') &&
    (isPressed('KeyP') || isPressed('Escape'))
  ) {
    if (screen === 'playing') pauseGame();
    else resumeGame();
  }
  if (screen === 'playing' && ctx) {
    updateGame(dt);
  }
  try {
    updateCamera();
  } catch (error) {
    console.error('KOTA MENTARI: kamera gagal', error);
  }
  try {
    renderer.render(scene, camera);
  } catch (error) {
    console.error('KOTA MENTARI: render gagal', error);
  }
  if (ctx) drawHudFrame();
  clearPressed();
}

function onResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- traffic: buat SETELAH world, ulang bila kosong ----------

function normalizeTraffic(state) {
  if (!state) return null;
  if (!Array.isArray(state.cars)) {
    state.cars = state.vehicles || state.automobiles || [];
  }
  if (!Array.isArray(state.pedestrians)) {
    state.pedestrians = state.peds || state.walkers || [];
  }
  return state;
}

function trafficIsEmpty(state) {
  if (!state) return true;
  return (state.cars || []).length === 0 && (state.pedestrians || []).length === 0;
}

function createTrafficAfterWorld() {
  let state = normalizeTraffic(createTrafficFn(world, scene));
  if (trafficIsEmpty(state)) {
    // Pembuatan pertama jatuh ke fallback kosong: buat ulang setelah world siap.
    state = normalizeTraffic(createTrafficFn(world, scene));
  }
  if (trafficIsEmpty(state)) {
    throw new Error('KOTA MENTARI: traffic kosong setelah world siap');
  }
  return state;
}

// ---------- KOTA_DEBUG ----------

function getState() {
  const marker = getActiveMarker();
  const policeUnits = policeState && Array.isArray(policeState.units) ? policeState.units : [];
  const cars = trafficState && Array.isArray(trafficState.cars) ? trafficState.cars : [];
  const peds = trafficState && Array.isArray(trafficState.pedestrians) ? trafficState.pedestrians : [];
  return {
    screen,
    state: screen,
    sceneChildren: scene ? scene.children.length : 0,
    player: player
      ? {
          x: player.x,
          z: player.z,
          angle: player.angle,
          speedKmh: Math.abs(player.speed || 0) * 3.6,
          speed: player.speed || 0,
          health: player.health,
          uang: player.uang,
          money: player.uang,
          inCar: player.inCar,
          weapon: player.weapon,
        }
      : null,
    x: player ? player.x : 0,
    z: player ? player.z : 0,
    angle: player ? player.angle : 0,
    speedKmh: player ? Math.abs(player.speed || 0) * 3.6 : 0,
    police: policeUnits,
    policeUnits,
    traffic: { cars, pedestrians: peds, carsCount: cars.length, pedsCount: peds.length },
    trafficCars: cars.length,
    trafficPeds: peds.length,
    marker,
    mission: getMissionIndex(),
    missionCurrent: getMissionIndex(),
    nextMission: getMissionIndex() + 1,
    money: player ? player.uang : 0,
    uang: player ? player.uang : 0,
    wanted: getWanted(),
    health: player ? player.health : 0,
    objective: currentObjective(),
    toast: toastText,
    missionCar: missionCar ? { x: missionCar.x, z: missionCar.z } : null,
    chaseTarget: chaseTarget
      ? { x: chaseTarget.x, z: chaseTarget.z, caught: chaseTarget.caught }
      : null,
    attackers: attackers.filter((attacker) => !attacker.dead).length,
  };
}

function teleport(x, z) {
  if (!ctx) startGame();
  player.x = x;
  player.z = z;
  if (player.inCar && player.car) {
    player.car.x = x;
    player.car.z = z;
  }
  if (player.mesh) player.mesh.position.set(x, player.y || 0, z);
  return { x: player.x, z: player.z };
}

function setMission(index) {
  if (!ctx) startGame();
  const clamped = Math.max(0, Math.min(TOTAL_MISSIONS - 1, index | 0));
  setMissionIndex(clamped);
  if (screen !== 'playing') {
    screen = 'playing';
    showGameScreen('playing');
  }
  startMissionAt(clamped);
  return getMissionIndex();
}

function setMoney(amount) {
  if (!ctx) startGame();
  player.uang = amount;
  return player.uang;
}

function debugShowScreen(name, data) {
  const internal = HUD_TO_SCREEN[name] || 'menu';
  screen = internal;
  showGameScreen(internal, data);
  return screen;
}

function exposeDebug() {
  window.KOTA_DEBUG = {
    startGame,
    start: startGame,
    continueGame,
    retryMission,
    quitToMenu,
    playAgain,
    pauseGame,
    resumeGame,
    setCamera,
    setCameraPosition: setCamera,
    setCameraPose: setCamera,
    setView: setCamera,
    moveCamera: setCamera,
    clearCamera: clearCameraOverride,
    clearCameraOverride,
    teleport,
    teleportPlayer: teleport,
    getMarker: getActiveMarker,
    getActiveMarker,
    setMission,
    setMoney,
    setUang: setMoney,
    setWanted,
    spawnMissionCar,
    spawnChaseTarget,
    spawnAttackers,
    spawnPolice: spawnPoliceNearPlayer,
    spawnPoliceNearPlayer,
    triggerBusted,
    busted: triggerBusted,
    getState,
    getFullState: getState,
    getPlayer: () => player,
    getPlayerPosition: () => (player ? { x: player.x, z: player.z, angle: player.angle } : null),
    getMission: () => getMissionIndex(),
    getMoney: () => (player ? player.uang : 0),
    getWanted: () => getWanted(),
    getScreen: () => screen,
    getSceneChildren: () => (scene ? scene.children.length : 0),
    getTrafficCounts: () => ({
      cars: trafficState && Array.isArray(trafficState.cars) ? trafficState.cars.length : 0,
      pedestrians:
        trafficState && Array.isArray(trafficState.pedestrians)
          ? trafficState.pedestrians.length
          : 0,
    }),
    saveGame,
    save: saveGame,
    loadGame,
    load: loadGame,
    showScreen: debugShowScreen,
    showToast,
    isInputReady: () => inputReady,
  };
}

// ---------- boot ----------

function initInputOnce() {
  if (inputReady) return;
  inputReady = true;
  initInput();
}

function boot() {
  if (booted) return;
  booted = true;

  buildCityFn = pickFn(
    worldMod,
    ['buildCity', 'createCity', 'buildWorld', 'createWorld', 'buildCityFn', 'generateCity'],
    'pembangun kota',
    true,
  );
  findRoadPathFn = pickFn(worldMod, ['findRoadPath'], 'cari jalur world', true);
  createTrafficFn = pickFn(
    trafficMod,
    ['createTraffic', 'createTrafficState', 'buildTraffic', 'initTraffic', 'spawnTraffic'],
    'pembuat traffic',
    true,
  );
  updateTrafficFn = pickFn(trafficMod, ['updateTraffic', 'update'], 'update traffic', true);
  createMissionStateFn = pickFn(
    missionsMod,
    ['createMissionState', 'createMissions', 'newMissionState', 'initMissionState', 'createMission'],
    'pembuat keadaan misi',
    true,
  );
  startMissionFn = pickFn(
    missionsMod,
    ['startMission', 'beginMission', 'activateMission'],
    'pemulai misi',
    true,
  );
  updateMissionsFn = pickFn(
    missionsMod,
    ['updateMissions', 'updateMission', 'update'],
    'update misi',
    true,
  );
  getActiveMissionFn = pickFn(
    missionsMod,
    ['getActiveMission', 'activeMission', 'getCurrentMission', 'currentMission'],
    'pemberi misi aktif',
    false,
  );
  getActiveMarkerFn = pickFn(
    missionsMod,
    ['getActiveMarker', 'activeMarker', 'getMarker', 'getCurrentMarker', 'getMissionMarker'],
    'pemberi marker aktif',
    false,
  );
  getObjectiveTextFn = pickFn(
    missionsMod,
    ['getObjectiveText', 'objectiveText', 'getMissionObjective'],
    'pemberi teks objective',
    false,
  );
  createPoliceStateFn = pickFn(
    policeMod,
    ['createPoliceState', 'createPolice', 'newPoliceState', 'initPoliceState'],
    'pembuat keadaan polisi',
    true,
  );
  updatePoliceFn = pickFn(policeMod, ['updatePolice', 'update'], 'update polisi', true);
  addWantedFn = pickFn(policeMod, ['addWanted', 'increaseWanted', 'addStars'], 'penambah wanted', false);
  setWantedFn = pickFn(policeMod, ['setWanted'], 'pengatur wanted', false);
  spawnPoliceFn = pickFn(
    policeMod,
    ['spawnPolice', 'spawnUnit', 'spawnPoliceUnit'],
    'pemuncul polisi',
    false,
  );
  buildCarMeshFn = pickFn(
    vehiclesMod,
    ['createCarMesh', 'buildCarMesh', 'createCar', 'makeCar', 'buildCar', 'createVehicle'],
    'pembuat mesh mobil',
    false,
  );
  hudInitFn = pickFn(hudMod, ['initHud'], 'init HUD', true);
  hudShowScreenFn = pickFn(hudMod, ['showScreen'], 'manajer layar HUD', true);
  hudDrawHudFn = pickFn(hudMod, ['drawHud'], 'gambar HUD', true);
  hudShowToastFn = pickFn(hudMod, ['showToast'], 'tampil toast', true);

  canvas = document.getElementById('game-canvas');
  if (!canvas) throw new Error('KOTA MENTARI: kanvas game-canvas tidak ditemukan');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffb36b);
  scene.fog = new THREE.Fog(0xffc98a, 150, 600);

  camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    1200,
  );
  camera.position.set(0, 100, 170);
  camera.lookAt(0, 0, 0);

  const hemisphere = new THREE.HemisphereLight(0xffd9a0, 0x8a5a3b, 0.85);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xff9a3c, 1.5);
  sun.position.set(-120, 60, -80);
  sun.castShadow = true;
  scene.add(sun);

  hudInitFn({
    onStart: startGame,
    onContinue: continueGame,
    onResume: resumeGame,
    onRetry: retryMission,
    onPlayAgain: playAgain,
    onQuitToMenu: quitToMenu,
  });

  // Pembangun kota SELALU menerima scene — tanpa scene ia wajib gagal keras.
  world = buildCityFn(scene);
  if (!world) throw new Error('KOTA MENTARI: pembangun kota mengembalikan dunia kosong');

  // Traffic HANYA setelah world siap.
  trafficState = createTrafficAfterWorld();

  initInputOnce();

  try {
    if (audioMod && typeof audioMod.initAudio === 'function') audioMod.initAudio();
  } catch (error) {
    // audio opsional
  }

  exposeDebug();
  showGameScreen('menu');
  window.addEventListener('resize', onResize);
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else if (typeof document !== 'undefined') {
  boot();
}
