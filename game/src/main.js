// KOTA MENTARI — modul utama: renderer, kamera, lampu, mesin keadaan,
// loop, perangkai semua modul, simpan/muat, antarmuka debug KOTA_DEBUG.
// Kota pesisir tropis fiktif; semua nama, karakter, dan cerita orisinal.
import * as THREE from '../vendor/three.module.min.js';
import * as WorldMod from './world.js';
import * as TrafficMod from './traffic.js';
import * as MissionsMod from './missions.js';
import * as PoliceMod from './police.js';
import * as HudMod from './hud.js';
import * as ConfigMod from './config.js';
import * as AudioMod from './audio.js';
import { createPlayer, updatePlayer } from './player.js';
import { createCombatState, updateCombat, addReward, damagePlayer } from './combat.js';
import { initInput, isKeyPressed, clearPressed } from './input.js';

// ---- Resolusi fungsi modul lain (nama BEKU dari spek; gagal keras bila
// ---- tidak ada, supaya ketahuan di smoke test, bukan di foto).
function need(mod, names, label) {
  for (const n of names) {
    if (typeof mod[n] === 'function') return mod[n];
  }
  throw new Error('KOTA MENTARI: ' + label + ' tidak ditemukan (' + names.join('/') + ')');
}
const buildCity = need(WorldMod, ['buildCity'], 'world.buildCity');
const findRoadPathFn = need(WorldMod, ['findRoadPath'], 'world.findRoadPath');
const createTraffic = need(TrafficMod, ['createTraffic', 'create', 'initTraffic'], 'traffic.createTraffic');
const updateTraffic = need(TrafficMod, ['updateTraffic', 'update'], 'traffic.updateTraffic');
const createMissionState = need(MissionsMod, ['createMissionState', 'createState', 'create'], 'missions.createMissionState');
const startMission = need(MissionsMod, ['startMission', 'start', 'beginMission'], 'missions.startMission');
const updateMissions = need(MissionsMod, ['updateMissions', 'updateMission', 'update'], 'missions.updateMissions');
const getActiveMission = need(MissionsMod, ['getActiveMission', 'getCurrentMission', 'activeMission'], 'missions.getActiveMission');
const getActiveMarker = need(MissionsMod, ['getActiveMarker', 'getMarker', 'activeMarker'], 'missions.getActiveMarker');
const getObjectiveText = need(MissionsMod, ['getObjectiveText'], 'missions.getObjectiveText');
const createPoliceState = need(PoliceMod, ['createPoliceState', 'createState', 'create'], 'police.createPoliceState');
const updatePolice = need(PoliceMod, ['updatePolice', 'update'], 'police.updatePolice');
const addWantedFn = need(PoliceMod, ['addWanted', 'add', 'increaseWanted'], 'police.addWanted');
const initHud = need(HudMod, ['initHud'], 'hud.initHud');
const showScreen = need(HudMod, ['showScreen'], 'hud.showScreen');
const drawHud = need(HudMod, ['drawHud'], 'hud.drawHud');
const showToast = need(HudMod, ['showToast'], 'hud.showToast');

const CONFIG = ConfigMod.CONFIG || ConfigMod.default || {};
const createAudioFn = AudioMod.createAudio || AudioMod.create || null;

const SAVE_KEY = 'kota-mentari-save';
const CHASE_DIST = 9.5;
const TOTAL_MISSIONS = 6;

let booted = false;
let renderer = null;
let scene = null;
let camera = null;
let canvas = null;
let world = null;
let traffic = null;
let player = null;
let combatState = null;
let missionState = null;
let policeState = null;
let audio = null;
let ctx = null;
let screen = 'menu';
let inputInitialized = false;
let loopRunning = false;
let rafId = 0;
let lastT = 0;
let menuTime = 0;
let muted = false;
let freeCamera = null;
let missionCar = null;
let chaseTarget = null;
let attackers = [];
let playerMesh = null;
const policeMeshByUnit = new Map();

// ---- Pembangun mesh sederhana (kotak) untuk pemain, mobil, polisi.
function makeBox(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.castShadow = true;
  return m;
}

function buildCarMesh(colorHex) {
  const g = new THREE.Group();
  const body = makeBox(1.9, 0.62, 4.1, colorHex);
  body.position.y = 0.55;
  g.add(body);
  const cabin = makeBox(1.6, 0.55, 2.0, 0x222831);
  cabin.position.set(0, 1.05, -0.2);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const spots = [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]];
  for (const spot of spots) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(spot[0], 0.36, spot[1]);
    g.add(w);
  }
  return g;
}

function buildPersonMesh(shirtColor, pantsColor) {
  const g = new THREE.Group();
  const torso = makeBox(0.62, 0.72, 0.34, shirtColor);
  torso.position.y = 1.05;
  g.add(torso);
  const legs = makeBox(0.5, 0.75, 0.3, pantsColor);
  legs.position.y = 0.38;
  g.add(legs);
  const head = makeBox(0.34, 0.34, 0.34, 0xd9a066);
  head.position.y = 1.62;
  g.add(head);
  return g;
}

function buildPoliceCarMesh() {
  const g = buildCarMesh(0xf2f2f2);
  const barR = makeBox(0.5, 0.14, 0.3, 0xff2222);
  barR.position.set(-0.35, 1.4, -0.2);
  g.add(barR);
  const barB = makeBox(0.5, 0.14, 0.3, 0x2244ff);
  barB.position.set(0.35, 1.4, -0.2);
  g.add(barB);
  return g;
}

function buildRoadblockMesh() {
  const g = new THREE.Group();
  const base = makeBox(3.4, 0.9, 0.5, 0xff7f00);
  base.position.y = 0.45;
  g.add(base);
  const stripe = makeBox(3.4, 0.22, 0.52, 0xffffff);
  stripe.position.y = 0.78;
  g.add(stripe);
  return g;
}

function colorToHex(color) {
  if (typeof color === 'number') return color;
  if (typeof color === 'string') {
    const names = {
      orange: 0xff7f00, red: 0xdd2222, blue: 0x2266dd, white: 0xf2f2f2,
      yellow: 0xffcc22, black: 0x1a1a1a, green: 0x22aa55, silver: 0xbbbbbb,
    };
    if (names[color.toLowerCase()]) return names[color.toLowerCase()];
    if (color.charAt(0) === '#') {
      const n = parseInt(color.slice(1), 16);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0xff7f00;
}

// ---- Renderer (jatuh ke stub tanpa WebGL supaya boot headless tetap jalan).
function createRenderer(canvasEl) {
  try {
    const r = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    r.setSize(canvasEl.clientWidth || 1280, canvasEl.clientHeight || 720, false);
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    return r;
  } catch (err) {
    return {
      render() {},
      setSize() {},
      setPixelRatio() {},
      domElement: canvasEl,
      shadowMap: {},
    };
  }
}

// ---- Kamera: helper enam angka. SATU-SATUNYA cara mengatur kamera dari
// ---- luar; penata foto memanggil fungsi ini dengan nama yang sama.
export function setCamera(eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
  if (!camera) throw new Error('KOTA MENTARI: kamera belum siap');
  freeCamera = { eyeX, eyeY, eyeZ, lookX, lookY, lookZ };
  camera.position.set(eyeX, eyeY, eyeZ);
  camera.lookAt(lookX, lookY, lookZ);
  return true;
}

function applyCamera(eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
  camera.position.set(eyeX, eyeY, eyeZ);
  camera.lookAt(lookX, lookY, lookZ);
}

function updateChaseCamera() {
  if (freeCamera) {
    applyCamera(freeCamera.eyeX, freeCamera.eyeY, freeCamera.eyeZ,
      freeCamera.lookX, freeCamera.lookY, freeCamera.lookZ);
    return;
  }
  const fx = Math.sin(player.angle);
  const fz = Math.cos(player.angle);
  const ex = player.x - fx * CHASE_DIST;
  const ez = player.z - fz * CHASE_DIST;
  const ey = 4.2 + Math.abs(player.speed) * 0.03;
  applyCamera(ex, ey, ez, player.x + fx * 6, 1.6, player.z + fz * 6);
}

function updateMenuCamera(dt) {
  menuTime += dt;
  const a = menuTime * 0.05;
  if (freeCamera) {
    applyCamera(freeCamera.eyeX, freeCamera.eyeY, freeCamera.eyeZ,
      freeCamera.lookX, freeCamera.lookY, freeCamera.lookZ);
    return;
  }
  applyCamera(Math.sin(a) * 210, 150, Math.cos(a) * 210, 0, 0, 0);
}

// ---- Cari jalur: wrapper world.findRoadPath(world, a.x, a.z, b.x, b.z);
// ---- gagal -> garis lurus [a, b].
function findRoadPathSafe(a, b) {
  try {
    const pts = findRoadPathFn(world, a.x, a.z, b.x, b.z);
    if (Array.isArray(pts) && pts.length > 0) return pts;
  } catch (err) { /* jatuh ke garis lurus */ }
  return [{ x: a.x, z: a.z }, { x: b.x, z: b.z }];
}

function addWantedSafe(n) {
  if (!policeState) return 0;
  try {
    addWantedFn(policeState, n, ctx);
  } catch (err) {
    if (typeof policeState.wanted === 'number') {
      policeState.wanted = Math.max(0, Math.min(5, policeState.wanted + n));
    }
  }
  if (typeof policeState.wanted !== 'number') policeState.wanted = 0;
  return policeState.wanted;
}

function playSound(name) {
  if (!audio) return;
  try {
    if (typeof audio[name] === 'function') audio[name]();
    else if (typeof audio.playSound === 'function') audio.playSound(name);
    else if (typeof audio.play === 'function') audio.play(name);
  } catch (err) { /* abaikan */ }
}

function toggleMute() {
  muted = !muted;
  if (audio) {
    try {
      if (typeof audio.setMuted === 'function') audio.setMuted(muted);
      else if (typeof audio.muted !== 'undefined') audio.muted = muted;
    } catch (err) { /* abaikan */ }
  }
  return muted;
}

function getEnemies() {
  const list = [];
  for (const a of attackers) {
    if (!a.dead) list.push(a);
  }
  const units = policeState && Array.isArray(policeState.units) ? policeState.units : [];
  for (const u of units) {
    list.push({
      kind: 'police',
      x: typeof u.x === 'number' ? u.x : (u.position ? u.position.x : 0),
      z: typeof u.z === 'number' ? u.z : (u.position ? u.position.z : 0),
      health: typeof u.health === 'number' ? u.health : 100,
      ref: u,
    });
  }
  return list;
}

// ---- Spawn entitas misi (dipanggil modul misi lewat konteks, dan debug).
function spawnMissionCar(x, z, color) {
  if (missionCar && missionCar.mesh) scene.remove(missionCar.mesh);
  const hex = colorToHex(color);
  const mesh = buildCarMesh(hex);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  missionCar = {
    x, z, angle: 0, color: hex, stolen: false,
    mission: true, kind: 'mission', mesh,
  };
  return missionCar;
}

function spawnChaseTarget() {
  // JAUH dari pemain dan melarikan diri ke arah Pesisir (0, 400).
  const px = player ? player.x : 0;
  const pz = player ? player.z : 0;
  let dx = 0 - px;
  let dz = 400 - pz;
  if (Math.hypot(dx, dz) < 1) { dx = 1; dz = 0; }
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const dist = 130;
  const tx = px + dx * dist;
  const tz = pz + dz * dist;
  if (chaseTarget && chaseTarget.mesh) scene.remove(chaseTarget.mesh);
  const mesh = buildCarMesh(0xdd2222);
  mesh.position.set(tx, 0, tz);
  scene.add(mesh);
  chaseTarget = {
    x: tx, z: tz, angle: Math.atan2(dx, dz),
    caught: false, speed: 9, kind: 'chase', mesh,
  };
  return chaseTarget;
}

function spawnAttackers(x, z, n) {
  const made = [];
  for (let i = 0; i < n; i++) {
    const ax = x + (i - (n - 1) / 2) * 2.5;
    const az = z + (i % 2) * 1.5;
    const mesh = buildPersonMesh(0x8a2f2f, 0x1c1c22);
    mesh.position.set(ax, 0, az);
    scene.add(mesh);
    const a = { x: ax, z: az, angle: 0, health: 100, dead: false, kind: 'attacker', mesh };
    attackers.push(a);
    made.push(a);
  }
  return made;
}

function clearMissionEntities() {
  if (missionCar && missionCar.mesh) scene.remove(missionCar.mesh);
  missionCar = null;
  if (chaseTarget && chaseTarget.mesh) scene.remove(chaseTarget.mesh);
  chaseTarget = null;
  for (const a of attackers) {
    if (a.mesh) scene.remove(a.mesh);
  }
  attackers = [];
  for (const mesh of policeMeshByUnit.values()) scene.remove(mesh);
  policeMeshByUnit.clear();
  // Entitas misi sudah dibersihkan: izinkan startMission spawn ulang.
  if (missionState) missionState.spawnedFor = -1;
}

// ---- Simpan / muat (kunci kota-mentari-save).
export function saveGame() {
  try {
    const data = {
      uang: player.uang,
      mission: missionState ? missionState.current : 0,
      x: player.x,
      z: player.z,
      wanted: policeState && typeof policeState.wanted === 'number' ? policeState.wanted : 0,
      health: player.health,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

function loadGameData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function loadGame() {
  const data = loadGameData();
  if (!data) return null;
  continueGame();
  return data;
}

// ---- Mesin keadaan: menu, bermain, jeda, selesai, tertangkap.
export function startGame(saved) {
  if (!booted) bootGame();
  player.x = saved && typeof saved.x === 'number' ? saved.x : 0;
  player.z = saved && typeof saved.z === 'number' ? saved.z : 0;
  player.angle = 0;
  player.speed = 0;
  player.health = 100;
  player.uang = saved && typeof saved.uang === 'number' ? saved.uang : 0;
  player.weapon = 'fists';
  player.inCar = false;
  player.car = null;
  if (policeState) {
    if (typeof policeState.wanted === 'number') {
      policeState.wanted = saved && typeof saved.wanted === 'number' ? saved.wanted : 0;
    }
    if (Array.isArray(policeState.units)) policeState.units.length = 0;
    if (typeof policeState.busted !== 'undefined') policeState.busted = false;
  }
  clearMissionEntities();
  if (missionState && typeof missionState.current === 'number') {
    missionState.current = saved && typeof saved.mission === 'number' ? saved.mission : 0;
  }
  startMission(missionState, missionState.current || 0, ctx);
  freeCamera = null;
  screen = 'playing';
  showScreen('playing');
  ensureLoop();
  return true;
}

export function continueGame() {
  const saved = loadGameData();
  if (!saved) {
    startGame();
    return false;
  }
  startGame(saved);
  return true;
}

export function retryMission() {
  if (!booted) bootGame();
  player.health = 100;
  player.speed = 0;
  player.inCar = false;
  player.car = null;
  if (policeState) {
    if (typeof policeState.wanted === 'number') policeState.wanted = 0;
    if (Array.isArray(policeState.units)) policeState.units.length = 0;
    if (typeof policeState.busted !== 'undefined') policeState.busted = false;
  }
  const idx = missionState && typeof missionState.current === 'number' ? missionState.current : 0;
  startMission(missionState, idx, ctx);
  freeCamera = null;
  screen = 'playing';
  showScreen('playing');
  ensureLoop();
  return true;
}

export function resumeGame() {
  if (!booted) return false;
  screen = 'playing';
  showScreen('playing');
  ensureLoop();
  return true;
}

export function pauseGame() {
  if (screen !== 'playing') return false;
  screen = 'paused';
  showScreen('paused');
  return true;
}

export function quitToMenu() {
  if (!booted) return false;
  saveGame();
  screen = 'menu';
  freeCamera = null;
  showScreen('start');
  ensureLoop();
  return true;
}

export function triggerBusted() {
  if (!booted || screen === 'busted' || screen === 'complete') return false;
  screen = 'busted';
  playSound('busted');
  try { showScreen('busted'); } catch (err) { /* abaikan */ }
  return true;
}

function completeGame() {
  screen = 'complete';
  playSound('complete');
  saveGame();
  try { showScreen('complete'); } catch (err) { /* abaikan */ }
}

// ---- Konteks game tunggal: diteruskan ke semua modul.
function buildContext() {
  ctx = {
    player,
    world,
    scene,
    camera,
    renderer,
    traffic,
    missionState,
    policeState,
    audio,
    config: CONFIG,
    findRoadPath: (a, b) => findRoadPathSafe(a, b),
    findPath: (a, b) => findRoadPathSafe(a, b),
    saveGame,
    addWanted: (n) => addWantedSafe(n),
    getWanted: () => (policeState && typeof policeState.wanted === 'number' ? policeState.wanted : 0),
    spawnMissionCar,
    spawnChaseTarget,
    spawnAttackers,
    showToast: (t) => {
      try { showToast(t); } catch (err) { /* abaikan */ }
    },
    getEnemies,
    addReward: (amount) => addReward(player, amount),
    playSound,
    onEnemyDefeated: () => { playSound('defeat'); try { MissionsMod.onEnemyDefeated(missionState, ctx); } catch (err) { /* abaikan */ } },
    onBusted: () => triggerBusted(),
    onMissionComplete: () => { saveGame(); },
    getMissionCar: () => missionCar,
    getChaseTarget: () => chaseTarget,
    getAttackers: () => attackers,
    setCamera,
  };
}

// ---- Gambar mobil polisi putih + roadblock dari daftar unit polisi
// ---- (unit polisi sendiri TANPA mesh).
function syncPoliceMeshes() {
  const units = policeState && Array.isArray(policeState.units) ? policeState.units : [];
  const seen = new Set();
  for (const u of units) {
    seen.add(u);
    let mesh = policeMeshByUnit.get(u);
    const isRoadblock = u.roadblock === true || u.type === 'roadblock';
    if (!mesh) {
      mesh = isRoadblock ? buildRoadblockMesh() : buildPoliceCarMesh();
      scene.add(mesh);
      policeMeshByUnit.set(u, mesh);
    }
    const ux = typeof u.x === 'number' ? u.x : (u.position ? u.position.x : 0);
    const uz = typeof u.z === 'number' ? u.z : (u.position ? u.position.z : 0);
    const ua = typeof u.angle === 'number' ? u.angle : (typeof u.heading === 'number' ? u.heading : 0);
    mesh.position.set(ux, 0, uz);
    mesh.rotation.y = ua;
  }
  for (const [unit, mesh] of policeMeshByUnit) {
    if (!seen.has(unit)) {
      scene.remove(mesh);
      policeMeshByUnit.delete(unit);
    }
  }
}

function buildSnapshot() {
  let mission = null;
  let marker = null;
  let objective = '';
  try { mission = getActiveMission(missionState); } catch (err) { /* abaikan */ }
  try { marker = getActiveMarker(missionState, ctx); } catch (err) { /* abaikan */ }
  try { objective = getObjectiveText(missionState, ctx); } catch (err) { /* abaikan */ }
  return {
    player,
    playerAngle: player ? player.angle : 0,
    police: policeState && Array.isArray(policeState.units) ? policeState.units : [],
    policeState,
    missionState,
    mission,
    marker,
    objective,
    speedKmh: player ? Math.abs(player.speed) * 3.6 : 0,
    speed: player ? Math.abs(player.speed) * 3.6 : 0,
    toast: null,
    wanted: policeState && typeof policeState.wanted === 'number' ? policeState.wanted : 0,
    money: player ? player.uang : 0,
    health: player ? player.health : 100,
    screen,
  };
}

function render() {
  if (playerMesh) {
    playerMesh.visible = !player.inCar;
    playerMesh.position.set(player.x, 0, player.z);
    playerMesh.rotation.y = player.angle;
  }
  if (player.inCar && player.car) {
    const mesh = player.car.mesh || player.car.model || player.car.object || null;
    if (mesh) {
      mesh.position.set(player.car.x, 0, player.car.z);
      mesh.rotation.y = player.car.angle || 0;
    }
  }
  if (missionCar && missionCar.mesh) {
    missionCar.mesh.position.set(missionCar.x, 0, missionCar.z);
    missionCar.mesh.rotation.y = missionCar.angle || 0;
  }
  syncPoliceMeshes();
  try {
    renderer.render(scene, camera);
  } catch (err) {
    console.warn('KOTA MENTARI: render gagal', err);
  }
}

function update(dt) {
  if (isKeyPressed('KeyP') || isKeyPressed('Escape')) {
    pauseGame();
    return;
  }
  if (isKeyPressed('KeyM')) toggleMute();
  updatePlayer(player, dt, ctx);
  // Misi 2: masuk mobil oranye misi menandai mobil dicuri.
  if (missionState && missionState.current === 1 && !missionState.carStolen && player.inCar && player.car === missionCar) {
    try { MissionsMod.onCarStolen(missionState, ctx); } catch (err) { /* abaikan */ }
  }
  updateCombat(combatState, player, dt, ctx);
  if (player && combatState) player.weapon = combatState.weapon === 'pistol' ? 'Pistol' : 'Tinju';
  const before = missionState ? missionState.current : 0;
  updateMissions(missionState, dt, ctx);
  const after = missionState ? missionState.current : 0;
  if (after !== before) {
    saveGame();
    if (after >= TOTAL_MISSIONS) {
      completeGame();
      return;
    }
  }
  // Jaring pengaman: mobil oranye misi 2 di (100, 0) saat misi 2 dimulai.
  if (after === 1 && !missionCar) spawnMissionCar(100, 0, 'orange');
  updatePolice(policeState, dt, ctx);
  if (policeState && policeState.busted) {
    triggerBusted();
    return;
  }
  // BUSTED: polisi menyentuh pemain jalan kaki saat wanted > 0.
  if (!player.inCar && (policeState.wanted || 0) > 0) {
    const units = policeState.units || [];
    for (const u of units) {
      const ux = typeof u.x === 'number' ? u.x : (u.position ? u.position.x : 1e9);
      const uz = typeof u.z === 'number' ? u.z : (u.position ? u.position.z : 1e9);
      if (Math.hypot(ux - player.x, uz - player.z) < 2.0) {
        triggerBusted();
        return;
      }
    }
  }
  // Traffic (modul traffic melewati mobil curian).
  updateTraffic(traffic, dt, world, ctx);
  // Target kejar melarikan diri: menjauh dari pemain.
  if (chaseTarget && !chaseTarget.caught) {
    const dx = chaseTarget.x - player.x;
    const dz = chaseTarget.z - player.z;
    const len = Math.hypot(dx, dz) || 1;
    const sp = chaseTarget.speed || 9;
    chaseTarget.x += (dx / len) * sp * dt;
    chaseTarget.z += (dz / len) * sp * dt;
    chaseTarget.angle = Math.atan2(dx / len, dz / len);
    if (chaseTarget.mesh) {
      chaseTarget.mesh.position.set(chaseTarget.x, 0, chaseTarget.z);
      chaseTarget.mesh.rotation.y = chaseTarget.angle;
    }
  }
  // Penyerang misi 4 HANYA digerakkan loop utama: 3,2 unit/detik.
  for (const a of attackers) {
    if (a.dead) continue;
    const dx = player.x - a.x;
    const dz = player.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len > 1.4) {
      a.x += (dx / len) * 3.2 * dt;
      a.z += (dz / len) * 3.2 * dt;
      a.angle = Math.atan2(dx / len, dz / len);
    }
    if (len < 1.8) damagePlayer(player, 14 * dt);
    if (a.mesh) {
      a.mesh.position.set(a.x, 0, a.z);
      a.mesh.rotation.y = a.angle;
    }
  }
  for (let i = attackers.length - 1; i >= 0; i--) {
    if (attackers[i].dead) {
      if (attackers[i].mesh) scene.remove(attackers[i].mesh);
      attackers.splice(i, 1);
    }
  }
  if (player.health <= 0) {
    triggerBusted();
    return;
  }
  // Kamera di loop dibungkus penjaga: gagal kamera tidak membekukan render.
  try {
    updateChaseCamera();
  } catch (err) {
    console.warn('KOTA MENTARI: kamera gagal', err);
  }
}

function loop(t) {
  const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
  lastT = t;
  if (screen === 'menu') {
    if (isKeyPressed('Enter')) startGame();
    else updateMenuCamera(dt);
  } else if (screen === 'paused') {
    if (isKeyPressed('KeyP') || isKeyPressed('Escape') || isKeyPressed('Enter')) resumeGame();
  } else if (screen === 'playing') {
    update(dt);
  }
  render();
  try {
    drawHud(buildSnapshot());
  } catch (err) { /* HUD tidak boleh mematikan loop */ }
  clearPressed();
  // Loop berhenti saat TAMAT / BUSTED (layar overlay tampil).
  if (screen === 'complete' || screen === 'busted') {
    loopRunning = false;
    return;
  }
  rafId = requestAnimationFrame(loop);
}

function ensureLoop() {
  if (!loopRunning) {
    loopRunning = true;
    lastT = 0;
    rafId = requestAnimationFrame(loop);
  }
}

// ---- Antarmuka debug KOTA_DEBUG (lengkap, BEKU).
function getState() {
  let marker = null;
  try { marker = getActiveMarker(missionState, ctx); } catch (err) { /* abaikan */ }
  return {
    x: player.x,
    z: player.z,
    angle: player.angle,
    speed: player.speed,
    speedKmh: Math.abs(player.speed) * 3.6,
    uang: player.uang,
    money: player.uang,
    mission: missionState ? missionState.current : 0,
    wanted: policeState && typeof policeState.wanted === 'number' ? policeState.wanted : 0,
    health: player.health,
    inCar: player.inCar,
    weapon: player.weapon,
    screen,
    marker,
    trafficCars: traffic && Array.isArray(traffic.cars) ? traffic.cars.length : 0,
    trafficPeds: traffic && Array.isArray(traffic.pedestrians) ? traffic.pedestrians.length : 0,
    sceneChildren: scene ? scene.children.length : 0,
    policeUnits: policeState && Array.isArray(policeState.units) ? policeState.units.length : 0,
  };
}

function exposeDebug() {
  window.KOTA_DEBUG = {
    teleport(x, z) {
      player.x = x;
      player.z = z;
      if (player.car) {
        player.car.x = x;
        player.car.z = z;
      }
      return { x: player.x, z: player.z };
    },
    getActiveMarker() {
      try { return getActiveMarker(missionState, ctx); } catch (err) { return null; }
    },
    getMarker() {
      try { return getActiveMarker(missionState, ctx); } catch (err) { return null; }
    },
    setMission(n) {
      const idx = Math.max(0, Math.min(TOTAL_MISSIONS - 1, Math.floor(n)));
      if (missionState) missionState.current = idx;
      startMission(missionState, idx, ctx);
      if (idx === 1 && !missionCar) spawnMissionCar(100, 0, 'orange');
      return missionState.current;
    },
    setMoney(n) {
      player.uang = Math.max(0, Math.floor(n));
      return player.uang;
    },
    setWanted(n) {
      const target = Math.max(0, Math.min(5, Math.floor(n)));
      const cur = policeState && typeof policeState.wanted === 'number' ? policeState.wanted : 0;
      addWantedSafe(target - cur);
      if (policeState && typeof policeState.wanted === 'number' && policeState.wanted !== target) {
        policeState.wanted = target;
      }
      return policeState.wanted;
    },
    spawnMissionCar,
    spawnChaseTarget,
    spawnAttackers,
    triggerBusted,
    getState,
    saveGame,
    loadGame,
    save: saveGame,
    load: loadGame,
    startGame,
    continueGame,
    retryMission,
    quitToMenu,
    setCamera,
    releaseCamera() {
      freeCamera = null;
      return true;
    },
    getMission() {
      return missionState ? missionState.current : 0;
    },
    getMoney() {
      return player.uang;
    },
    getWanted() {
      return policeState && typeof policeState.wanted === 'number' ? policeState.wanted : 0;
    },
    getScreen() {
      return screen;
    },
  };
}

// ---- Boot: perender + kota (DENGAN scene) + traffic (SETELAH world).
export function bootGame() {
  if (booted) return true;
  booted = true;
  canvas = document.getElementById('game-canvas');
  if (!canvas) throw new Error('KOTA MENTARI: kanvas #game-canvas tidak ada');
  renderer = createRenderer(canvas);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xff9e57);
  scene.fog = new THREE.Fog(0xffc98a, 140, 750);
  camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.1, 2500);
  camera.position.set(0, 160, 220);
  camera.lookAt(0, 0, 0);
  // Matahari senja rendah + kabut tipis.
  const sun = new THREE.DirectionalLight(0xffb36b, 1.7);
  sun.position.set(-220, 70, 140);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffe2bb, 0.6));
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x3a5a3a, 0.5));
  // Bangun kota — SELALU teruskan scene sebagai argumen.
  world = buildCity(scene);
  if (!world) throw new Error('KOTA MENTARI: buildCity mengembalikan world kosong');
  // Traffic HANYA setelah world ter-set; bila jatuh ke fallback kosong,
  // buat ulang setelah world siap.
  traffic = createTraffic(world, scene);
  if (!traffic || !Array.isArray(traffic.cars) || traffic.cars.length === 0) {
    traffic = createTraffic(world, scene);
  }
  if (!traffic || !Array.isArray(traffic.cars) || traffic.cars.length === 0) {
    throw new Error('KOTA MENTARI: traffic kosong setelah world siap');
  }
  player = createPlayer();
  combatState = createCombatState();
  missionState = createMissionState();
  policeState = createPoliceState();
  if (createAudioFn) {
    try { audio = createAudioFn(); } catch (err) { audio = null; }
  }
  buildContext();
  playerMesh = buildPersonMesh(0xff7f00, 0x23232b);
  scene.add(playerMesh);
  initHud({
    onStart: () => startGame(),
    onContinue: () => continueGame(),
    onResume: () => resumeGame(),
    onRetry: () => retryMission(),
    onPlayAgain: () => startGame(),
    onQuitToMenu: () => quitToMenu(),
  });
  if (!inputInitialized) {
    initInput();
    inputInitialized = true;
  }
  try {
    window.addEventListener('resize', () => {
      try {
        const w = canvas.clientWidth || 1280;
        const h = canvas.clientHeight || 720;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      } catch (err) { /* abaikan */ }
    });
  } catch (err) { /* abaikan */ }
  showScreen('start');
  exposeDebug();
  ensureLoop();
  return true;
}

// Jalan otomatis saat halaman siap.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try { bootGame(); } catch (err) { console.error('KOTA MENTARI: boot gagal', err); }
    });
  } else {
    try { bootGame(); } catch (err) { console.error('KOTA MENTARI: boot gagal', err); }
  }
}
