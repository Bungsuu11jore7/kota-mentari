// KOTA MENTARI — modul utama: perender, kamera, lampu, mesin keadaan,
// loop update lalu render, perangkai semua modul, simpan/muat,
// dan antarmuka debug KOTA_DEBUG.
// Kota pesisir tropis fiktif: Pelabuhan, Pasar Lama, Menara, Pesisir, Bukit.
// Protagonis Raka Pratama, fixer Mira Santosa, antagonis Bos Darma.

import * as THREE from '../vendor/three.module.min.js';
import * as WorldMod from './world.js';
import * as TrafficMod from './traffic.js';
import * as VehiclesMod from './vehicles.js';
import * as MissionsMod from './missions.js';
import * as PoliceMod from './police.js';
import * as HudMod from './hud.js';
import * as AudioMod from './audio.js';
import * as ConfigMod from './config.js';
import {
  createPlayer,
  updatePlayer,
  getCarHeading,
  setCarHeading,
  buildPlayerMesh,
  addMoney,
  damagePlayer,
  resetPlayer,
} from './player.js';
import { createCombatState, updateCombat, setWeapon } from './combat.js';
import { initInput, isDown, isPressed, endFrameInput, isInputInitialized } from './input.js';

function resolveFn(ns, names) {
  if (!ns) return null;
  for (const name of names) {
    if (typeof ns[name] === 'function') return ns[name];
  }
  if (ns.default && typeof ns.default === 'object') {
    for (const name of names) {
      if (typeof ns.default[name] === 'function') return ns.default[name];
    }
  }
  return null;
}

function cfgVal(names, fallback) {
  const sources = [ConfigMod, ConfigMod.default, ConfigMod.CONFIG, ConfigMod.GameConfig];
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const name of names) {
      const value = src[name];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return fallback;
}

const SAVE_KEY = cfgVal(['SAVE_KEY', 'saveKey', 'SAVE_KEY_NAME'], 'kota-mentari-save');
const ATTACKER_SPEED = cfgVal(['ATTACKER_SPEED', 'attackerSpeed'], 3.2);
const CHASE_SPEED = cfgVal(['CHASE_SPEED', 'chaseSpeed', 'CHASE_TARGET_SPEED'], 13);
const CHASE_SPAWN_DISTANCE = cfgVal(['CHASE_SPAWN_DISTANCE', 'chaseSpawnDistance'], 120);
const MISSION_CAR_X = 100;
const MISSION_CAR_Z = 0;
const MIRA_X = -200;
const MIRA_Z = 100;
const SHIP_X = 470;
const SHIP_Z = 350;

function clampNumber(value, low, high) {
  const num = typeof value === 'number' ? value : 0;
  if (num < low) return low;
  if (num > high) return high;
  return num;
}

// ---------------------------------------------------------------------------
// Keadaan modul utama. Variabel mobil target misi diberi nilai di sini,
// sebelum ada kode apa pun yang membacanya.
// ---------------------------------------------------------------------------
let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let world = null;
let trafficState = null;
let player = null;
let missionState = null;
let policeState = null;
let combatState = null;
let gameCtx = null;
let missionCar = null;
let chaseTarget = null;
let attackers = [];
let gameScreen = 'menu';
let booted = false;
let inputReady = false;
let hudReady = false;
let loopRunning = false;
let lastTime = 0;
let lastMissionIndex = 0;
let lastWanted = 0;
let missionCarSpawned = false;
let chaseSpawned = false;
let attackersSpawned = false;
let carStolenFlag = false;
let completedShown = false;
let menuOrbitAngle = 0;
const policeMeshes = new Map();
const roadblockMeshes = new Map();
const defeatedCounted = new Set();

// ---------------------------------------------------------------------------
// Audio: semua pemanggilan dijaga supaya bunyi yang hilang tidak mematikan game.
// ---------------------------------------------------------------------------
function audioCall(names, ...args) {
  const fn = resolveFn(AudioMod, names);
  if (!fn) return;
  try {
    fn(...args);
  } catch (err) {
    // Bunyi opsional; lanjutkan game.
  }
}

function audioInit() {
  audioCall(['initAudio', 'init', 'createAudio', 'setupAudio']);
}

function audioShoot() {
  audioCall(['playShoot', 'playShot', 'shoot', 'playGunshot']);
}

function audioPunch() {
  audioCall(['playPunch', 'punch', 'playHit']);
}

function audioPickup() {
  audioCall(['playPickup', 'pickup', 'playCollect']);
}

function audioFanfare() {
  audioCall(['playFanfare', 'fanfare', 'playMissionComplete', 'playComplete']);
}

function audioWanted() {
  audioCall(['playWanted', 'wantedUp', 'playWantedUp']);
}

function audioBusted() {
  audioCall(['playBusted', 'busted']);
}

function audioToggleMute() {
  const fn = resolveFn(AudioMod, ['toggleMute', 'setMuted', 'toggleMuted', 'mute']);
  if (!fn) return;
  try {
    fn();
  } catch (err) {
    // Abaikan.
  }
}

// ---------------------------------------------------------------------------
// Kamera: helper HANYA menerima ENAM ANGKA (posisi mata x/y/z + titik
// yang dilihat x/y/z). Nama fungsi ini sama dengan yang diekspos ke
// KOTA_DEBUG, supaya penata foto memanggil nama yang sama.
// ---------------------------------------------------------------------------
export function setCamera(eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
  const nums = [eyeX, eyeY, eyeZ, lookX, lookY, lookZ];
  for (const num of nums) {
    if (typeof num !== 'number' || !Number.isFinite(num)) {
      throw new TypeError('setCamera hanya menerima enam angka');
    }
  }
  if (!camera) throw new Error('setCamera: kamera belum dibuat');
  camera.position.set(eyeX, eyeY, eyeZ);
  camera.lookAt(lookX, lookY, lookZ);
  return camera;
}

function updateChaseCamera() {
  if (!camera || !player) return;
  // Arah maju: komponen x dari sinus sudut, komponen z dari kosinus sudut.
  const forwardX = Math.sin(player.angle);
  const forwardZ = Math.cos(player.angle);
  const back = player.inCar ? 11 : 8;
  const height = player.inCar ? 4.5 : 3.6;
  const eyeX = player.x - forwardX * back;
  const eyeY = height;
  const eyeZ = player.z - forwardZ * back;
  const lookX = player.x + forwardX * 7;
  const lookY = 1.6;
  const lookZ = player.z + forwardZ * 7;
  setCamera(eyeX, eyeY, eyeZ, lookX, lookY, lookZ);
}

function updateMenuCamera(dt) {
  if (!camera) return;
  menuOrbitAngle += dt * 0.05;
  const radius = 320;
  const eyeX = Math.cos(menuOrbitAngle) * radius;
  const eyeY = 190;
  const eyeZ = Math.sin(menuOrbitAngle) * radius;
  setCamera(eyeX, eyeY, eyeZ, 0, 0, 0);
}

function updateCameraGuarded() {
  try {
    if (gameScreen === 'playing' || gameScreen === 'paused') updateChaseCamera();
    else if (gameScreen === 'menu') updateMenuCamera(0.016);
  } catch (err) {
    // Gagal kamera tidak boleh membekukan render; catat lalu lanjut.
    if (typeof console !== 'undefined' && console.warn) console.warn('Kamera gagal:', err);
  }
}

// ---------------------------------------------------------------------------
// Cari jalur: wrapper atas findRoadPath world.js, PERSIS
// (world, a.x, a.z, b.x, b.z). Gagal -> [a, b].
// ---------------------------------------------------------------------------
function findRoadPath(a, b, c, d, e) {
  // Bentuk 5-argumen gaya world.js (world, sx, sz, gx, gz) — dipakai modul
  // polisi lewat konteks (ctx.findPath / ctx.findRoadPath). Terjemahkan ke
  // titik awal/tujuan, lalu panggil pencari jalur world.js secara langsung.
  if (
    a && typeof a === 'object' && typeof b === 'number' && typeof c === 'number' &&
    typeof d === 'number' && typeof e === 'number'
  ) {
    const start5 = { x: b, z: c };
    const goal5 = { x: d, z: e };
    try {
      const fn5 = resolveFn(WorldMod, ['findRoadPath']);
      if (fn5) {
        const points5 = fn5(a, b, c, d, e);
        if (Array.isArray(points5) && points5.length > 0) return points5;
      }
    } catch (err) {
      // Jatuh ke garis lurus.
    }
    return [start5, goal5];
  }
  const start = a || { x: 0, z: 0 };
  const goal = b || { x: 0, z: 0 };
  try {
    const fn = resolveFn(WorldMod, ['findRoadPath']);
    if (fn && world) {
      const points = fn(world, start.x, start.z, goal.x, goal.z);
      if (Array.isArray(points) && points.length > 0) return points;
    }
  } catch (err) {
    // Jatuh ke garis lurus.
  }
  return [start, goal];
}

// ---------------------------------------------------------------------------
// Bangun kota + traffic. Pembangun kota SELALU dipanggil dengan scene.
// State traffic HANYA dibuat SETELAH world ter-set; bila pembuatan
// pertama jatuh ke fallback kosong, buat ulang setelah world siap.
// ---------------------------------------------------------------------------
function buildWorldAndTraffic() {
  const buildCity = resolveFn(WorldMod, [
    'buildCity',
    'createCity',
    'buildWorld',
    'createWorld',
    'generateCity',
  ]);
  if (!buildCity) throw new Error('KOTA MENTARI: pembangun kota tidak ditemukan di world.js');
  const built = buildCity(scene);
  world = built && typeof built === 'object' ? built : { scene };
  if (!world.scene) world.scene = scene;
  const children = scene ? scene.children.length : 0;
  if (children < 100) {
    throw new Error('KOTA MENTARI: kota kosong, scene children ' + children);
  }
  const createTraffic = resolveFn(TrafficMod, [
    'createTraffic',
    'buildTraffic',
    'createTrafficState',
    'initTraffic',
  ]);
  if (!createTraffic) throw new Error('KOTA MENTARI: pembuat traffic tidak ditemukan di traffic.js');
  trafficState = createTraffic(world, scene);
  let cars = countTrafficCars();
  let peds = countTrafficPeds();
  if (cars === 0 || peds === 0) {
    // Pembuatan pertama jatuh ke fallback kosong: buat ulang setelah world siap.
    trafficState = createTraffic(world, scene);
    cars = countTrafficCars();
    peds = countTrafficPeds();
  }
  if (cars === 0 || peds === 0) {
    throw new Error('KOTA MENTARI: traffic kosong (' + cars + ' mobil, ' + peds + ' pejalan kaki)');
  }
}

function countTrafficCars() {
  if (!trafficState) return 0;
  if (Array.isArray(trafficState.cars)) return trafficState.cars.length;
  if (Array.isArray(trafficState.vehicles)) return trafficState.vehicles.length;
  return 0;
}

function countTrafficPeds() {
  if (!trafficState) return 0;
  if (Array.isArray(trafficState.pedestrians)) return trafficState.pedestrians.length;
  if (Array.isArray(trafficState.peds)) return trafficState.peds.length;
  if (Array.isArray(trafficState.walkers)) return trafficState.walkers.length;
  return 0;
}

function trafficCarList() {
  if (!trafficState) return [];
  if (Array.isArray(trafficState.cars)) return trafficState.cars;
  if (Array.isArray(trafficState.vehicles)) return trafficState.vehicles;
  return [];
}

// ---------------------------------------------------------------------------
// Mesh mobil sederhana (cadangan bila modul vehicles tidak menyediakan).
// ---------------------------------------------------------------------------
function buildSimpleCarMesh(colorHex, withLightBar) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2a33 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.2), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassMat);
  cabin.position.set(0, 1.15, -0.2);
  group.add(cabin);
  const wheelGeo = new THREE.BoxGeometry(0.35, 0.7, 0.7);
  const wheelPos = [[-0.95, 0.35, 1.35], [0.95, 0.35, 1.35], [-0.95, 0.35, -1.35], [0.95, 0.35, -1.35]];
  for (const pos of wheelPos) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(pos[0], pos[1], pos[2]);
    group.add(wheel);
  }
  if (withLightBar) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2244ff }),
    );
    bar.position.set(0, 1.55, -0.2);
    group.add(bar);
  }
  group.traverse((child) => {
    if (child && child.isMesh) child.castShadow = true;
  });
  return group;
}

function buildAttackerMesh() {
  const group = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: 0x7a1f2b });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c22 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a06f });
  function box(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  box(0.32, 0.72, 0.28, dark, -0.18, 0.36, 0);
  box(0.32, 0.72, 0.28, dark, 0.18, 0.36, 0);
  box(0.72, 0.88, 0.4, coat, 0, 1.16, 0);
  box(0.2, 0.74, 0.22, coat, -0.48, 1.14, 0);
  box(0.2, 0.74, 0.22, coat, 0.48, 1.14, 0);
  box(0.4, 0.44, 0.38, skin, 0, 1.84, 0);
  group.traverse((child) => {
    if (child && child.isMesh) child.castShadow = true;
  });
  return group;
}

function buildRoadblockMesh() {
  const group = new THREE.Group();
  const stripeA = new THREE.MeshStandardMaterial({ color: 0xff5533 });
  const stripeB = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 0.3), stripeA);
  bar.position.y = 0.9;
  group.add(bar);
  const bar2 = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 0.3), stripeB);
  bar2.position.y = 0.45;
  group.add(bar2);
  const legGeo = new THREE.BoxGeometry(0.3, 0.9, 0.8);
  for (const x of [-2.2, 2.2]) {
    const leg = new THREE.Mesh(legGeo, stripeB);
    leg.position.set(x, 0.45, 0);
    group.add(leg);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Spawn entitas misi (dipanggil modul misi lewat konteks, atau loop utama
// saat mendeteksi misi aktif berubah).
// ---------------------------------------------------------------------------
function makeVehicleMesh(color, kind) {
  const makeCar = resolveFn(VehiclesMod, ['createCar', 'makeCar', 'buildCar', 'createVehicle', 'spawnCar']);
  if (makeCar) {
    try {
      const made = makeCar(color, kind || 'car');
      if (made) return made;
    } catch (err) {
      // Coba tanpa jenis.
    }
    try {
      const made = makeCar(color);
      if (made) return made;
    } catch (err) {
      // Jatuh ke mesh sederhana.
    }
  }
  return null;
}

function spawnMissionCar(x, z, color) {
  if (missionCar) return missionCar;
  const spawnX = typeof x === 'number' ? x : MISSION_CAR_X;
  const spawnZ = typeof z === 'number' ? z : MISSION_CAR_Z;
  const paint = color || 'orange';
  const made = makeVehicleMesh(paint, 'mission');
  let car = null;
  if (made && (made.isMesh || made.isGroup || made.isObject3D || made.position)) {
    car = { x: spawnX, z: spawnZ, heading: 0, speed: 0, mesh: made, isMissionCar: true };
  } else if (made && typeof made === 'object') {
    car = made;
    car.x = spawnX;
    car.z = spawnZ;
    car.heading = typeof car.heading === 'number' ? car.heading : 0;
    car.speed = 0;
    car.isMissionCar = true;
  } else {
    car = {
      x: spawnX,
      z: spawnZ,
      heading: 0,
      speed: 0,
      mesh: buildSimpleCarMesh(0xff7a1a, false),
      isMissionCar: true,
    };
  }
  car.stolen = false;
  car.color = paint;
  if (car.mesh) {
    car.mesh.position.set(spawnX, 0, spawnZ);
    car.mesh.rotation.y = car.heading || 0;
    if (scene) scene.add(car.mesh);
  }
  missionCar = car;
  missionCarSpawned = true;
  if (gameCtx && Array.isArray(gameCtx.cars) && !gameCtx.cars.includes(car)) {
    gameCtx.cars.push(car);
  }
  return car;
}

function spawnChaseTarget() {
  if (chaseTarget) return chaseTarget;
  const px = player ? player.x : 0;
  const pz = player ? player.z : 0;
  // Arah spawn menjauhi pusat kota melewati pemain. Bila panjang arah
  // kurang dari 1 (pemain di pusat), pakai arah default (x=1, z=0)
  // supaya target tidak ter-spawn tepat di posisi pemain dan diam.
  let dirX = px;
  let dirZ = pz;
  let len = Math.hypot(dirX, dirZ);
  if (len < 1) {
    dirX = 1;
    dirZ = 0;
    len = 1;
  }
  dirX /= len;
  dirZ /= len;
  let spawnX = px + dirX * CHASE_SPAWN_DISTANCE;
  let spawnZ = pz + dirZ * CHASE_SPAWN_DISTANCE;
  spawnX = clampNumber(spawnX, -380, 380);
  spawnZ = clampNumber(spawnZ, -380, 380);
  // Pastikan spawn cukup jauh dari pemain: bila hasil clamp (pemain di
  // tepi peta, misal usai misi 2 di Pesisir) terlalu dekat, putar arah
  // spawn sampai ketemu titik yang jauh dari pemain.
  if (Math.hypot(spawnX - px, spawnZ - pz) < 60) {
    let bestX = spawnX;
    let bestZ = spawnZ;
    let bestDist = Math.hypot(spawnX - px, spawnZ - pz);
    const baseAngle = Math.atan2(dirZ, dirX);
    for (let k = 1; k <= 8; k += 1) {
      const angle = baseAngle + (k * Math.PI) / 4;
      const candX = clampNumber(px + Math.cos(angle) * CHASE_SPAWN_DISTANCE, -380, 380);
      const candZ = clampNumber(pz + Math.sin(angle) * CHASE_SPAWN_DISTANCE, -380, 380);
      const candDist = Math.hypot(candX - px, candZ - pz);
      if (candDist > bestDist) {
        bestDist = candDist;
        bestX = candX;
        bestZ = candZ;
      }
      if (candDist >= CHASE_SPAWN_DISTANCE * 0.9) break;
    }
    spawnX = bestX;
    spawnZ = bestZ;
  }
  if (world && typeof world.isBlocked === 'function') {
    for (let turn = 0; turn < 8; turn += 1) {
      let blocked = false;
      try {
        blocked = !!world.isBlocked(spawnX, spawnZ);
      } catch (err) {
        blocked = false;
      }
      if (!blocked) break;
      const angle = Math.atan2(dirZ, dirX) + Math.PI / 4;
      dirX = Math.cos(angle);
      dirZ = Math.sin(angle);
      spawnX = clampNumber(px + dirX * CHASE_SPAWN_DISTANCE, -380, 380);
      spawnZ = clampNumber(pz + dirZ * CHASE_SPAWN_DISTANCE, -380, 380);
    }
  }
  const made = makeVehicleMesh('red', 'chase');
  let target = null;
  if (made && (made.isMesh || made.isGroup || made.isObject3D || made.position)) {
    target = { x: spawnX, z: spawnZ, heading: 0, speed: 0, mesh: made, caught: false };
  } else if (made && typeof made === 'object') {
    target = made;
    target.x = spawnX;
    target.z = spawnZ;
    target.heading = typeof target.heading === 'number' ? target.heading : 0;
    target.speed = 0;
    target.caught = false;
  } else {
    target = {
      x: spawnX,
      z: spawnZ,
      heading: 0,
      speed: 0,
      mesh: buildSimpleCarMesh(0xdd2222, false),
      caught: false,
    };
  }
  target.caught = false;
  if (target.mesh) {
    target.mesh.position.set(spawnX, 0, spawnZ);
    if (scene) scene.add(target.mesh);
  }
  chaseTarget = target;
  chaseSpawned = true;
  if (gameCtx && Array.isArray(gameCtx.cars) && !gameCtx.cars.includes(target)) {
    gameCtx.cars.push(target);
  }
  return target;
}

function spawnAttackers(x, z, count) {
  if (attackersSpawned && attackers.length > 0) return attackers;
  const baseX = typeof x === 'number' ? x : MIRA_X;
  const baseZ = typeof z === 'number' ? z : MIRA_Z;
  const total = typeof count === 'number' && count > 0 ? Math.floor(count) : 3;
  const list = [];
  for (let i = 0; i < total; i += 1) {
    const ax = baseX + (i - 1) * 3;
    const az = baseZ + (i % 2 === 0 ? 2 : -2);
    const attacker = { x: ax, z: az, health: 100, dead: false, counted: false, mesh: buildAttackerMesh() };
    attacker.mesh.position.set(ax, 0, az);
    if (scene) scene.add(attacker.mesh);
    list.push(attacker);
    attackers.push(attacker);
  }
  attackersSpawned = true;
  if (gameCtx) gameCtx.enemies = attackers;
  return list;
}

function clearMissionEntities() {
  if (player && player.inCar && player.car === missionCar) {
    player.inCar = false;
    player.car = null;
  }
  if (missionCar && missionCar.mesh && scene) scene.remove(missionCar.mesh);
  if (chaseTarget && chaseTarget.mesh && scene) scene.remove(chaseTarget.mesh);
  for (const attacker of attackers) {
    if (attacker.mesh && scene) scene.remove(attacker.mesh);
  }
  for (const mesh of policeMeshes.values()) {
    if (scene) scene.remove(mesh);
  }
  policeMeshes.clear();
  for (const mesh of roadblockMeshes.values()) {
    if (scene) scene.remove(mesh);
  }
  roadblockMeshes.clear();
  missionCar = null;
  chaseTarget = null;
  attackers = [];
  missionCarSpawned = false;
  chaseSpawned = false;
  attackersSpawned = false;
  carStolenFlag = false;
  defeatedCounted.clear();
  if (gameCtx) {
    gameCtx.enemies = attackers;
    gameCtx.cars = trafficCarList().slice();
  }
}

// ---------------------------------------------------------------------------
// Keadaan misi + polisi: dibuat SEKALI saat game dimulai, diteruskan ke
// SEMUA panggilan modul misi/polisi.
// ---------------------------------------------------------------------------
function ensureGameStates() {
  if (!missionState) {
    const createMissionState = resolveFn(MissionsMod, ['createMissionState']);
    if (!createMissionState) throw new Error('KOTA MENTARI: createMissionState tidak ditemukan di missions.js');
    missionState = createMissionState();
  }
  if (!policeState) {
    const createPoliceState = resolveFn(PoliceMod, ['createPoliceState']);
    if (!createPoliceState) throw new Error('KOTA MENTARI: createPoliceState tidak ditemukan di police.js');
    policeState = createPoliceState();
  }
  if (!combatState) combatState = createCombatState();
}

function getWantedValue() {
  if (!policeState) return 0;
  const getWanted = resolveFn(PoliceMod, ['getWanted']);
  if (getWanted) {
    try {
      const value = getWanted(policeState);
      if (typeof value === 'number') return value;
    } catch (err) {
      // Jatuh ke field.
    }
  }
  return typeof policeState.wanted === 'number' ? policeState.wanted : 0;
}

function addWantedToState(amount) {
  if (!policeState) return 0;
  const addWanted = resolveFn(PoliceMod, ['addWanted']);
  if (addWanted) {
    try {
      addWanted(policeState, amount, gameCtx);
    } catch (err) {
      try {
        addWanted(policeState, amount);
      } catch (err2) {
        // Abaikan.
      }
    }
  }
  return getWantedValue();
}

function setWantedOnState(amount) {
  if (!policeState) return 0;
  const setWanted = resolveFn(PoliceMod, ['setWanted']);
  if (setWanted) {
    try {
      setWanted(policeState, amount, gameCtx);
    } catch (err) {
      try {
        setWanted(policeState, amount);
      } catch (err2) {
        // Abaikan.
      }
    }
  } else if (typeof policeState.wanted === 'number') {
    policeState.wanted = clampNumber(amount, 0, 5);
  }
  return getWantedValue();
}

// Penambah wanted di konteks adalah wrapper SATU argumen (jumlah saja).
function buildGameContext() {
  const ctx = {
    player,
    pemain: player,
    world,
    dunia: world,
    scene,
    adegan: scene,
    camera,
    renderer,
    missionState,
    policeState,
    combat: combatState,
    traffic: trafficState,
    findRoadPath,
    findPath: findRoadPath,
    saveGame,
    addWanted: (amount) => addWantedToState(amount),
    setWanted: (amount) => setWantedOnState(amount),
    getWanted: () => getWantedValue(),
    showToast: (text) => showToast(text),
    spawnMissionCar: (x, z, color) => spawnMissionCar(x, z, color),
    spawnChaseTarget: () => spawnChaseTarget(),
    spawnAttackers: (x, z, count) => spawnAttackers(x, z, count),
    onEnemyDefeated: (enemy) => handleEnemyDefeated(enemy),
    getActiveMarker: () => getActiveMarkerSafe(),
    playShoot: () => audioShoot(),
    playPunch: () => audioPunch(),
    playPickup: () => audioPickup(),
    cars: trafficCarList().slice(),
    enemies: attackers,
    police: [],
  };
  return ctx;
}

function getActiveMarkerSafe() {
  const getMarker = resolveFn(MissionsMod, ['getActiveMarker']);
  if (getMarker && missionState) {
    try {
      const marker = getMarker(missionState, gameCtx);
      if (marker && typeof marker.x === 'number' && typeof marker.z === 'number') return marker;
    } catch (err) {
      // Coba tanpa konteks.
    }
    try {
      const marker = getMarker(missionState);
      if (marker && typeof marker.x === 'number' && typeof marker.z === 'number') return marker;
    } catch (err) {
      // Jatuh ke target misi.
    }
  }
  const missions = MissionsMod.MISSIONS;
  if (Array.isArray(missions) && missionState && typeof missionState.current === 'number') {
    const entry = missions[missionState.current];
    if (entry && entry.target) return entry.target;
    if (entry && typeof entry.x === 'number') return { x: entry.x, z: entry.z };
  }
  return { x: 100, z: -300 };
}

function getObjectiveTextSafe() {
  const getText = resolveFn(MissionsMod, ['getObjectiveText']);
  if (getText && missionState) {
    try {
      const text = getText(missionState, gameCtx);
      if (typeof text === 'string' && text.length > 0) return text;
    } catch (err) {
      // Coba tanpa konteks.
    }
    try {
      const text = getText(missionState);
      if (typeof text === 'string' && text.length > 0) return text;
    } catch (err) {
      // Jatuh ke nama misi.
    }
  }
  const mission = getCurrentMissionSafe();
  if (mission && mission.name) return mission.name;
  if (missionState && typeof missionState.current === 'number') {
    return 'Misi ' + (missionState.current + 1) + ' dari 6';
  }
  return 'Misi 1 dari 6';
}

function getCurrentMissionSafe() {
  const getMission = resolveFn(MissionsMod, ['getCurrentMission']);
  if (getMission && missionState) {
    try {
      const mission = getMission(missionState);
      if (mission) return mission;
    } catch (err) {
      // Jatuh ke daftar.
    }
  }
  const missions = MissionsMod.MISSIONS;
  if (Array.isArray(missions) && missionState && typeof missionState.current === 'number') {
    return missions[missionState.current] || null;
  }
  return null;
}

function handleEnemyDefeated(enemy) {
  if (!enemy) return;
  if (enemy.counted === true || defeatedCounted.has(enemy)) return;
  enemy.counted = true;
  defeatedCounted.add(enemy);
  const onDefeated = resolveFn(MissionsMod, ['onEnemyDefeated']);
  if (onDefeated && missionState) {
    try {
      onDefeated(missionState, gameCtx);
      return;
    } catch (err) {
      // Coba tanpa konteks.
    }
    try {
      onDefeated(missionState);
    } catch (err) {
      // Handler misi gagal tidak boleh mematikan game.
    }
  }
}

// ---------------------------------------------------------------------------
// Simpan / muat (kunci kota-mentari-save).
// ---------------------------------------------------------------------------
function saveGame() {
  if (!player) return false;
  try {
    const store = typeof localStorage !== 'undefined' ? localStorage : null;
    if (!store) return false;
    const data = {
      uang: player.uang,
      money: player.uang,
      mission: missionState ? missionState.current : 0,
      x: player.x,
      z: player.z,
      wanted: getWantedValue(),
      health: player.health,
    };
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

function loadGame() {
  try {
    const store = typeof localStorage !== 'undefined' ? localStorage : null;
    if (!store) return null;
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (err) {
    return null;
  }
}

function hasSave() {
  return loadGame() !== null;
}

// ---------------------------------------------------------------------------
// HUD module-level: dipanggil TANPA argumen hud.
// Layar 'menu' main.js dipetakan ke 'start' HUD.
// ---------------------------------------------------------------------------
function showGameScreen(name, data) {
  const showScreen = resolveFn(HudMod, ['showScreen']);
  if (!showScreen) return;
  const hudName = name === 'menu' ? 'start' : name;
  try {
    showScreen(hudName, data);
  } catch (err) {
    // Layar gagal tampil tidak boleh mematikan loop.
  }
}

function showToast(text) {
  const fn = resolveFn(HudMod, ['showToast']);
  if (!fn) return;
  try {
    fn(text);
  } catch (err) {
    // Abaikan.
  }
}

function drawHudFrame() {
  const drawHud = resolveFn(HudMod, ['drawHud']);
  if (!drawHud || !player) return;
  const policeUnits = getPoliceUnitsSafe();
  const snapshot = {
    player,
    playerAngle: player.angle,
    police: policeUnits,
    policeState,
    missionState,
    mission: getCurrentMissionSafe(),
    marker: getActiveMarkerSafe(),
    objective: getObjectiveTextSafe(),
    speedKmh: Math.abs(player.speed || 0) * 3.6,
    speed: player.speed || 0,
    money: player.uang,
    uang: player.uang,
    health: player.health,
    wanted: getWantedValue(),
    weapon: player.weapon,
    screen: gameScreen,
    toast: null,
  };
  try {
    drawHud(snapshot);
  } catch (err) {
    // Gambar HUD gagal tidak boleh membekukan render.
  }
}

function getPoliceUnitsSafe() {
  if (!policeState) return [];
  const getUnits = resolveFn(PoliceMod, ['getPoliceUnits']);
  if (getUnits) {
    try {
      const units = getUnits(policeState);
      if (Array.isArray(units)) return units;
    } catch (err) {
      // Jatuh ke field.
    }
  }
  if (Array.isArray(policeState.units)) return policeState.units;
  return [];
}

function getRoadblocksSafe() {
  if (!policeState) return [];
  const getBlocks = resolveFn(PoliceMod, ['getRoadblocks']);
  if (getBlocks) {
    try {
      const blocks = getBlocks(policeState);
      if (Array.isArray(blocks)) return blocks;
    } catch (err) {
      // Jatuh ke field.
    }
  }
  if (Array.isArray(policeState.roadblocks)) return policeState.roadblocks;
  return [];
}

// ---------------------------------------------------------------------------
// Alur game: SATU fungsi mulai dipakai tombol "Mulai Baru" DAN Enter.
// ---------------------------------------------------------------------------
function startGame() {
  ensureGameStates();
  clearMissionEntities();
  resetPlayer(player, 0, 0);
  if (policeState) {
    const clearPolice = resolveFn(PoliceMod, ['clearPolice']);
    if (clearPolice) {
      try {
        clearPolice(policeState);
      } catch (err) {
        // Abaikan.
      }
    }
    const resetBusted = resolveFn(PoliceMod, ['resetBusted']);
    if (resetBusted) {
      try {
        resetBusted(policeState);
      } catch (err) {
        // Abaikan.
      }
    }
    setWantedOnState(0);
  }
  missionState.current = 0;
  missionState.completed = false;
  lastMissionIndex = 0;
  lastWanted = 0;
  completedShown = false;
  gameCtx = buildGameContext();
  const startMission = resolveFn(MissionsMod, ['startMission']);
  if (startMission) {
    try {
      startMission(missionState, gameCtx);
    } catch (err) {
      try {
        startMission(missionState);
      } catch (err2) {
        // Misi gagal mulai tidak boleh mematikan game.
      }
    }
  }
  gameScreen = 'playing';
  showGameScreen('playing');
  const mission = getCurrentMissionSafe();
  showToast(mission && mission.briefing ? mission.briefing : 'Misi 1: Paket Kilat — antar 3 paket ke Menara.');
  audioInit();
  if (!loopRunning) startLoop();
}

function continueGame() {
  const saved = loadGame();
  if (!saved) {
    startGame();
    return;
  }
  ensureGameStates();
  clearMissionEntities();
  resetPlayer(player, typeof saved.x === 'number' ? saved.x : 0, typeof saved.z === 'number' ? saved.z : 0);
  player.uang = typeof saved.uang === 'number' ? saved.uang : (typeof saved.money === 'number' ? saved.money : 0);
  if (typeof saved.health === 'number') player.health = clampNumber(saved.health, 1, player.maxHealth);
  if (policeState) {
    const resetBusted = resolveFn(PoliceMod, ['resetBusted']);
    if (resetBusted) {
      try {
        resetBusted(policeState);
      } catch (err) {
        // Abaikan.
      }
    }
    setWantedOnState(typeof saved.wanted === 'number' ? saved.wanted : 0);
  }
  const missionIndex = clampNumber(typeof saved.mission === 'number' ? saved.mission : 0, 0, 5);
  missionState.current = missionIndex;
  lastMissionIndex = missionIndex;
  lastWanted = getWantedValue();
  completedShown = false;
  gameCtx = buildGameContext();
  const startMission = resolveFn(MissionsMod, ['startMission']);
  if (startMission) {
    try {
      startMission(missionState, gameCtx);
    } catch (err) {
      try {
        startMission(missionState);
      } catch (err2) {
        // Abaikan.
      }
    }
  }
  gameScreen = 'playing';
  showGameScreen('playing');
  showToast('Lanjutan dimuat: misi ' + (missionIndex + 1) + ' dari 6.');
  audioInit();
  if (!loopRunning) startLoop();
}

function retryMission() {
  if (!missionState) {
    startGame();
    return;
  }
  ensureGameStates();
  const active = clampNumber(missionState.current, 0, 5);
  const saved = loadGame();
  const uangSebelumReset = player ? player.uang : 0;
  clearMissionEntities();
  resetPlayer(player, 0, 0);
  player.uang = saved && typeof saved.uang === 'number' ? saved.uang : (saved && typeof saved.money === 'number' ? saved.money : uangSebelumReset);
  if (policeState) {
    const resetBusted = resolveFn(PoliceMod, ['resetBusted']);
    if (resetBusted) {
      try {
        resetBusted(policeState);
      } catch (err) {
        // Abaikan.
      }
    }
    setWantedOnState(0);
  }
  missionState.current = active;
  lastMissionIndex = active;
  lastWanted = 0;
  completedShown = false;
  gameCtx = buildGameContext();
  const resetCurrent = resolveFn(MissionsMod, ['resetCurrentMission']);
  if (resetCurrent) {
    try {
      resetCurrent(missionState, gameCtx);
    } catch (err) {
      try {
        resetCurrent(missionState);
      } catch (err2) {
        // Abaikan.
      }
    }
  }
  const startMission = resolveFn(MissionsMod, ['startMission']);
  if (startMission) {
    try {
      startMission(missionState, gameCtx);
    } catch (err) {
      try {
        startMission(missionState);
      } catch (err2) {
        // Abaikan.
      }
    }
  }
  gameScreen = 'playing';
  showGameScreen('playing');
  showToast('Misi ' + (active + 1) + ' diulang dari awal.');
  if (!loopRunning) startLoop();
}

function quitToMenu() {
  saveGame();
  gameScreen = 'menu';
  showGameScreen('menu');
}

function pauseGame() {
  if (gameScreen !== 'playing') return;
  gameScreen = 'paused';
  showGameScreen('paused');
}

function resumeGame() {
  if (gameScreen !== 'paused') return;
  gameScreen = 'playing';
  showGameScreen('playing');
}

function triggerBusted() {
  if (gameScreen === 'busted') return;
  gameScreen = 'busted';
  showGameScreen('busted');
  audioBusted();
  saveGame();
}

function completeGame() {
  if (completedShown) return;
  completedShown = true;
  gameScreen = 'complete';
  saveGame();
  showGameScreen('complete', { money: player ? player.uang : 0, uang: player ? player.uang : 0 });
  audioFanfare();
}

// ---------------------------------------------------------------------------
// Sinkron mesh polisi + roadblock dari daftar unit modul polisi
// (unit polisi TANPA mesh — loop utama yang menggambar).
// ---------------------------------------------------------------------------
function syncPoliceMeshes() {
  if (!scene || !policeState) return;
  const units = getPoliceUnitsSafe();
  const seen = new Set();
  for (const unit of units) {
    if (!unit || unit.dead) continue;
    seen.add(unit);
    let mesh = policeMeshes.get(unit);
    if (!mesh) {
      const made = makeVehicleMesh('white', 'police');
      if (made && (made.isMesh || made.isGroup || made.isObject3D || made.position)) {
        mesh = made;
      } else if (made && typeof made === 'object' && made.mesh) {
        mesh = made.mesh;
      } else {
        mesh = buildSimpleCarMesh(0xffffff, true);
      }
      scene.add(mesh);
      policeMeshes.set(unit, mesh);
    }
    const ux = typeof unit.x === 'number' ? unit.x : 0;
    const uz = typeof unit.z === 'number' ? unit.z : 0;
    mesh.position.set(ux, 0, uz);
    mesh.rotation.y = typeof unit.heading === 'number' ? unit.heading : (typeof unit.angle === 'number' ? unit.angle : 0);
  }
  for (const [unit, mesh] of policeMeshes) {
    if (!seen.has(unit)) {
      scene.remove(mesh);
      policeMeshes.delete(unit);
    }
  }
  const blocks = getRoadblocksSafe();
  const seenBlocks = new Set();
  for (const block of blocks) {
    if (!block) continue;
    seenBlocks.add(block);
    let mesh = roadblockMeshes.get(block);
    if (!mesh) {
      mesh = buildRoadblockMesh();
      scene.add(mesh);
      roadblockMeshes.set(block, mesh);
    }
    const bx = typeof block.x === 'number' ? block.x : 0;
    const bz = typeof block.z === 'number' ? block.z : 0;
    mesh.position.set(bx, 0, bz);
    mesh.rotation.y = typeof block.heading === 'number' ? block.heading : (typeof block.angle === 'number' ? block.angle : 0);
  }
  for (const [block, mesh] of roadblockMeshes) {
    if (!seenBlocks.has(block)) {
      scene.remove(mesh);
      roadblockMeshes.delete(block);
    }
  }
}

// ---------------------------------------------------------------------------
// Update per frame (hanya saat bermain).
// ---------------------------------------------------------------------------
function updateChaseTarget(dt) {
  if (!chaseTarget || chaseTarget.caught) return;
  if (!player) return;
  const dx = chaseTarget.x - player.x;
  const dz = chaseTarget.z - player.z;
  const dist = Math.hypot(dx, dz);
  let moveX = 0;
  let moveZ = 0;
  if (dist > 0.01) {
    moveX += (dx / dist) * 0.7;
    moveZ += (dz / dist) * 0.7;
  }
  const goalX = SHIP_X - chaseTarget.x;
  const goalZ = 400 - chaseTarget.z;
  const goalDist = Math.hypot(goalX, goalZ);
  if (goalDist > 1) {
    moveX += (goalX / goalDist) * 0.5;
    moveZ += (goalZ / goalDist) * 0.5;
  }
  const moveLen = Math.hypot(moveX, moveZ);
  if (moveLen < 0.01) {
    moveX = 1;
    moveZ = 0;
  } else {
    moveX /= moveLen;
    moveZ /= moveLen;
  }
  chaseTarget.x = clampNumber(chaseTarget.x + moveX * CHASE_SPEED * dt, -480, 480);
  chaseTarget.z = clampNumber(chaseTarget.z + moveZ * CHASE_SPEED * dt, -480, 480);
  chaseTarget.heading = Math.atan2(moveX, moveZ);
  if (chaseTarget.mesh) {
    chaseTarget.mesh.position.set(chaseTarget.x, 0, chaseTarget.z);
    chaseTarget.mesh.rotation.y = chaseTarget.heading;
  }
}

function updateAttackers(dt) {
  if (!player) return;
  for (const attacker of attackers) {
    if (!attacker || attacker.dead) continue;
    // Penyerang misi 4 digerakkan HANYA oleh loop utama (3,2 unit/detik).
    const dx = player.x - attacker.x;
    const dz = player.z - attacker.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1.4 && dist > 0.01) {
      const step = ATTACKER_SPEED * dt;
      attacker.x += (dx / dist) * step;
      attacker.z += (dz / dist) * step;
    }
    if (dist < 1.8) {
      const died = damagePlayer(player, 8 * dt);
      if (died) {
        triggerBusted();
        return;
      }
    }
    if (attacker.mesh) {
      attacker.mesh.position.set(attacker.x, 0, attacker.z);
      if (dist > 0.01) attacker.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }
}

function update(dt) {
  if (!player || !gameCtx) return;
  if (isPressed('KeyM')) audioToggleMute();
  if (isPressed('KeyP') || isPressed('Escape')) {
    if (gameScreen === 'playing') pauseGame();
    else if (gameScreen === 'paused') resumeGame();
    return;
  }
  if (isPressed('Enter') && gameScreen === 'menu') {
    startGame();
    return;
  }
  updatePlayer(player, dt, world, gameCtx);
  if (trafficState) {
    const updateTraffic = resolveFn(TrafficMod, ['updateTraffic']);
    if (updateTraffic) {
      try {
        updateTraffic(trafficState, dt, world, gameCtx);
      } catch (err) {
        // Traffic gagal tidak boleh mematikan loop.
      }
    }
  }
  if (gameCtx) {
    gameCtx.cars = trafficCarList().slice();
    if (missionCar && !gameCtx.cars.includes(missionCar)) gameCtx.cars.push(missionCar);
    if (chaseTarget && !gameCtx.cars.includes(chaseTarget)) gameCtx.cars.push(chaseTarget);
    gameCtx.enemies = attackers;
    gameCtx.police = getPoliceUnitsSafe();
  }
  if (missionState) {
    const updateMissions = resolveFn(MissionsMod, ['updateMissions']);
    if (updateMissions) {
      try {
        updateMissions(missionState, dt, gameCtx);
      } catch (err) {
        // Misi gagal tidak boleh mematikan loop.
      }
    }
    if (missionState.current === 1 && !missionCarSpawned) spawnMissionCar(MISSION_CAR_X, MISSION_CAR_Z, 'orange');
    if (missionState.current === 2 && !chaseSpawned) spawnChaseTarget();
    if (missionState.current === 3 && !attackersSpawned) spawnAttackers(MIRA_X, MIRA_Z, 3);
    // Hook misi 2: pemain di mobil misi -> mobil dicuri.
    if (missionState.current === 1 && !carStolenFlag && player.inCar && player.car && player.car === missionCar) {
      carStolenFlag = true;
      const onCarStolen = resolveFn(MissionsMod, ['onCarStolen']);
      if (onCarStolen) {
        try {
          onCarStolen(missionState, gameCtx);
        } catch (err) {
          try {
            onCarStolen(missionState);
          } catch (err2) {
            // Abaikan.
          }
        }
      }
    }
    if (typeof missionState.current === 'number' && missionState.current > lastMissionIndex) {
      lastMissionIndex = missionState.current;
      audioFanfare();
      audioPickup();
      saveGame();
    }
    const isComplete = resolveFn(MissionsMod, ['isAllMissionsComplete']);
    let allDone = false;
    if (isComplete) {
      try {
        allDone = !!isComplete(missionState);
      } catch (err) {
        allDone = false;
      }
    }
    if (!allDone && typeof missionState.current === 'number') {
      allDone = missionState.current >= 6;
    }
    if (allDone) {
      completeGame();
      return;
    }
  }
  if (policeState) {
    const updatePolice = resolveFn(PoliceMod, ['updatePolice']);
    if (updatePolice) {
      try {
        updatePolice(policeState, dt, gameCtx);
      } catch (err) {
        // Polisi gagal tidak boleh mematikan loop.
      }
    }
    const wanted = getWantedValue();
    if (wanted > lastWanted) audioWanted();
    lastWanted = wanted;
    syncPoliceMeshes();
    const checkBusted = resolveFn(PoliceMod, ['checkBusted', 'isBusted']);
    if (checkBusted) {
      let busted = false;
      try {
        busted = !!checkBusted(policeState, gameCtx);
      } catch (err) {
        try {
          busted = !!checkBusted(policeState);
        } catch (err2) {
          busted = false;
        }
      }
      if (busted) {
        triggerBusted();
        return;
      }
    }
  }
  if (combatState) {
    updateCombat(combatState, dt, player, gameCtx);
    // Sinkron senjata: field senjata pemain mengikuti keadaan tempur.
    if (player.weapon !== combatState.weapon) player.weapon = combatState.weapon;
  }
  updateChaseTarget(dt);
  updateAttackers(dt);
  if (player.health <= 0 && gameScreen === 'playing') {
    triggerBusted();
  }
}

// ---------------------------------------------------------------------------
// Loop utama + boot.
// ---------------------------------------------------------------------------
function frame(now) {
  if (!loopRunning) return;
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);
  const current = typeof now === 'number' ? now : 0;
  const dt = clampNumber((current - lastTime) / 1000, 0.001, 0.05);
  lastTime = current;
  // Layar jeda tidak menjalankan update(), jadi tombol keyboard untuk
  // lanjut (P/Esc/Enter) ditangani di sini. screenAwal mencegah tombol
  // yang baru saja menjeda game di frame ini langsung melanjutkannya lagi.
  const screenAwal = gameScreen;
  try {
    if (gameScreen === 'playing') update(dt);
    else if (gameScreen === 'menu') updateMenuCamera(dt);
    if (screenAwal === 'paused' && (isPressed('KeyP') || isPressed('Escape'))) resumeGame();
    if (isPressed('Enter')) {
      if (gameScreen === 'menu') startGame();
      else if (gameScreen === 'busted') retryMission();
      else if (gameScreen === 'complete') startGame();
      else if (screenAwal === 'paused') resumeGame();
    }
    updateCameraGuarded();
    drawHudFrame();
    if (renderer) renderer.render(scene, camera);
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('KOTA MENTARI frame error:', err);
  }
  endFrameInput();
}

function startLoop() {
  if (loopRunning) return;
  loopRunning = true;
  lastTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(frame);
  }
}

function stepFrame(dt) {
  const step = typeof dt === 'number' && dt > 0 ? dt : 0.016;
  const screenAwal = gameScreen;
  try {
    if (gameScreen === 'playing') update(step);
    else if (gameScreen === 'menu') updateMenuCamera(step);
    if (screenAwal === 'paused' && (isPressed('KeyP') || isPressed('Escape'))) resumeGame();
    updateCameraGuarded();
    drawHudFrame();
    if (renderer) renderer.render(scene, camera);
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('KOTA MENTARI step error:', err);
  }
  endFrameInput();
}

function createDummyRenderer() {
  return {
    render() {},
    setSize() {},
    setPixelRatio() {},
    domElement: canvas,
    shadowMap: {},
  };
}

function boot() {
  if (booted) return;
  booted = true;
  if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') {
    throw new Error('KOTA MENTARI: document tidak tersedia');
  }
  canvas = document.getElementById('game-canvas');
  if (!canvas) throw new Error('KOTA MENTARI: kanvas game-canvas tidak ditemukan');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1, 2));
    renderer.setSize(typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280, typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 720);
    if (renderer.shadowMap) renderer.shadowMap.enabled = true;
  } catch (err) {
    renderer = createDummyRenderer();
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffc27d);
  scene.fog = new THREE.Fog(0xffcf9e, 150, 800);
  camera = new THREE.PerspectiveCamera(
    62,
    (typeof window !== 'undefined' && window.innerWidth && window.innerHeight ? window.innerWidth / window.innerHeight : 1280 / 720),
    0.1,
    2000,
  );
  camera.position.set(0, 190, 320);
  camera.lookAt(0, 0, 0);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.set(-200, 55, 80);
  scene.add(sun);
  const sky = new THREE.HemisphereLight(0xffd9a0, 0x3a4a5a, 0.9);
  scene.add(sky);
  const fill = new THREE.AmbientLight(0xffe0b8, 0.35);
  scene.add(fill);
  buildWorldAndTraffic();
  player = createPlayer(0, 0);
  const playerMesh = buildPlayerMesh(THREE);
  if (playerMesh) {
    player.mesh = playerMesh;
    playerMesh.position.set(player.x, 0, player.z);
    scene.add(playerMesh);
  }
  ensureGameStates();
  gameCtx = buildGameContext();
  if (!inputReady) {
    initInput();
    inputReady = isInputInitialized();
  }
  const initHud = resolveFn(HudMod, ['initHud']);
  if (!initHud) throw new Error('KOTA MENTARI: initHud tidak ditemukan di hud.js');
  if (!hudReady) {
    initHud({
      onStart: () => startGame(),
      onContinue: () => continueGame(),
      onResume: () => resumeGame(),
      onRetry: () => retryMission(),
      onPlayAgain: () => startGame(),
      onQuitToMenu: () => quitToMenu(),
    });
    hudReady = true;
  }
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', () => {
      if (!renderer || !camera) return;
      const width = window.innerWidth || 1280;
      const height = window.innerHeight || 720;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (typeof renderer.setSize === 'function') renderer.setSize(width, height);
    });
  }
  showGameScreen('menu');
  startLoop();
}

// ---------------------------------------------------------------------------
// Antarmuka debug global KOTA_DEBUG.
// ---------------------------------------------------------------------------
function getState() {
  return {
    screen: gameScreen,
    x: player ? player.x : 0,
    y: player ? player.y : 0,
    z: player ? player.z : 0,
    angle: player ? player.angle : 0,
    playerAngle: player ? player.angle : 0,
    speed: player ? player.speed : 0,
    speedKmh: player ? Math.abs(player.speed || 0) * 3.6 : 0,
    uang: player ? player.uang : 0,
    money: player ? player.uang : 0,
    health: player ? player.health : 0,
    weapon: player ? player.weapon : 'Tinju',
    inCar: player ? !!player.inCar : false,
    mission: missionState ? missionState.current : 0,
    missionName: (getCurrentMissionSafe() && getCurrentMissionSafe().name) || '',
    objective: getObjectiveTextSafe(),
    marker: getActiveMarkerSafe(),
    wanted: getWantedValue(),
    police: getPoliceUnitsSafe(),
    busted: gameScreen === 'busted',
    sceneChildren: scene ? scene.children.length : 0,
    trafficCars: countTrafficCars(),
    trafficPeds: countTrafficPeds(),
    hasSave: hasSave(),
    inputReady,
    hudReady,
  };
}

function setupDebug() {
  const scope = typeof window !== 'undefined' ? window : globalThis;
  scope.KOTA_DEBUG = {
    startGame,
    continueGame,
    retryMission,
    quitToMenu,
    pauseGame,
    resumeGame,
    triggerBusted,
    saveGame,
    loadGame,
    hasSave,
    getState,
    setCamera,
    teleport: (x, z) => {
      if (!player) return null;
      player.x = typeof x === 'number' ? x : player.x;
      player.z = typeof z === 'number' ? z : player.z;
      if (player.mesh) player.mesh.position.set(player.x, 0, player.z);
      return { x: player.x, z: player.z };
    },
    getActiveMarker: () => getActiveMarkerSafe(),
    setMission: (index) => {
      ensureGameStates();
      const target = clampNumber(typeof index === 'number' ? index : 0, 0, 5);
      clearMissionEntities();
      missionState.current = target;
      lastMissionIndex = target;
      gameCtx = buildGameContext();
      const startMission = resolveFn(MissionsMod, ['startMission']);
      if (startMission) {
        try {
          startMission(missionState, gameCtx);
        } catch (err) {
          try {
            startMission(missionState);
          } catch (err2) {
            // Abaikan.
          }
        }
      }
      if (gameScreen !== 'playing') {
        gameScreen = 'playing';
        showGameScreen('playing');
      }
      return missionState.current;
    },
    setMoney: (amount) => {
      if (!player) return 0;
      player.uang = typeof amount === 'number' ? amount : 0;
      return player.uang;
    },
    setUang: (amount) => {
      if (!player) return 0;
      player.uang = typeof amount === 'number' ? amount : 0;
      return player.uang;
    },
    setWanted: (amount) => setWantedOnState(amount),
    addWanted: (amount) => addWantedToState(amount),
    spawnPoliceNear: () => {
      if (!policeState) return [];
      const spawn = resolveFn(PoliceMod, ['spawnPoliceNear']);
      if (!spawn) return getPoliceUnitsSafe();
      try {
        spawn(policeState, gameCtx);
      } catch (err) {
        try {
          spawn(policeState);
        } catch (err2) {
          // Abaikan.
        }
      }
      return getPoliceUnitsSafe();
    },
    spawnMissionCar: (x, z, color) => spawnMissionCar(x, z, color),
    spawnChaseTarget: () => spawnChaseTarget(),
    spawnAttackers: (x, z, count) => spawnAttackers(x, z, count),
    clearMissionEntities,
    step: (dt) => stepFrame(dt),
  };
  // Alias nama yang dipakai penata foto (shots.js): spawnPolice /
  // spawnPoliceNearPlayer sama dengan spawnPoliceNear.
  scope.KOTA_DEBUG.spawnPolice = scope.KOTA_DEBUG.spawnPoliceNear;
  scope.KOTA_DEBUG.spawnPoliceNearPlayer = scope.KOTA_DEBUG.spawnPoliceNear;
}

setupDebug();

try {
  if (typeof document !== 'undefined' && document && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        boot();
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) console.error('KOTA MENTARI boot error:', err);
      }
    });
  } else {
    boot();
  }
} catch (err) {
  if (typeof console !== 'undefined' && console.error) console.error('KOTA MENTARI boot error:', err);
}
