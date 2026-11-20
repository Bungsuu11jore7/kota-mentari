// Boot Kota Mentari: bangun dunia + semua sistem, lalu loop fixed-step 1/60.
// ?seed=N menetapkan seed dunia. ?shot=chase|drive|street|start (&seed=N) men-stage
// satu scene, me-render 2 frame, lalu set window.__shotReady untuk screenshot.
// Save/load localStorage key 'mentari_save_v1' { mission, money, best }.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createCar, updateCar, enterCar, exitCar } from './vehicles.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const SAVE_KEY = 'mentari_save_v1';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

// --- Scene, kamera, cahaya (senja tropis) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xff9a52);
scene.fog = new THREE.Fog(0xff9a52, 260, 700);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 140, 260);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const sun = new THREE.DirectionalLight(0xffb347, 1.6);
sun.position.set(-180, 120, 260);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffd9a0, 0x2a4d6e, 0.9));
const amb = new THREE.AmbientLight(0xffe0b3, 0.35);
scene.add(amb);

// --- Dunia + sistem ---
const world = createWorld(seed);
scene.add(world.group);
// Terapkan langit senja dari world.sky (Lane A): background + kabut.
if (world.sky) {
  scene.background = new THREE.Color(world.sky.background);
  scene.fog = new THREE.Fog(world.sky.fogColor, world.sky.fogNear, world.sky.fogFar);
}
const vehicles = { createCar, updateCar, enterCar, exitCar, cars: [] };
const player = createPlayer(scene, world.spawn ? world.spawn.player : { x: 0, z: 50 });
const traffic = createTraffic(scene, world, 14);
const police = createPolice(scene, world);
const missions = createMissions(world, scene, {
  onSetWanted: (n) => police.setWanted(n),
  onSpawnEnemies: (list) => list.forEach((e) => combat.spawnEnemy(e.x, e.z, e)),
  onMessage: (t) => hud.showMessage(t),
});
const combat = createCombat(scene);
// M-2 (v2): damage musuh HARUS mengurangi health pemain. combat.damagePlayer
// hanya mengurangi combat.playerHealth internal — teruskan ke player.damage()
// supaya HUD ❤ turun dan health 0 benar-benar game over.
combat.onPlayerHit = (hp, n) => { player.damage(n); };
const hud = createHUD();
const audio = createAudio();
const input = createInput(canvas);
hud.setWorld(world);

// Mobil parkir di sekitar spawn yang bisa dicuri pemain.
const parkedSpots = world.spawn && world.spawn.cars ? world.spawn.cars : [
  { x: 8, z: 44, heading: 0 },
  { x: -12, z: 64, heading: Math.PI },
];
for (const spot of parkedSpots) {
  const car = createCar(scene, { color: 0x9aa5b1, x: spot.x, z: spot.z, heading: spot.heading || 0 });
  vehicles.cars.push(car);
}

// m-1 (v2): SATU mobil target oranye untuk misi 2 "Mobil Pinjaman" —
// di-spawn di (200,-100) saat misi 2 dimulai, dan dipakai ulang bila misi
// diulang (dipindah kembali + diperbaiki) supaya tidak menumpuk mobil.
let targetCar = null;
function ensureTargetCar() {
  if (targetCar) {
    targetCar.pos.set(200, 0, -100);
    targetCar.heading = 0;
    targetCar.speed = 0;
    targetCar.slide = 0;
    targetCar.health = targetCar.maxHealth || 100;
    targetCar.group.rotation.y = 0;
    return targetCar;
  }
  targetCar = createCar(scene, { color: 0xff7a00, x: 200, z: -100, heading: 0 });
  vehicles.cars.push(targetCar);
  return targetCar;
}

// --- Save / load ---
function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage bisa mati (private window): progres hanya bertahan kunjungan ini.
  }
}

let save = readSave();
let missionIndex = save && Number.isInteger(save.mission) ? save.mission : 0;
// Jangan biarkan save lama / save tamat menunjuk misi di luar range.
const MISSION_TOTAL = missions.list ? missions.list.length : 6;
if (missionIndex < 0) missionIndex = 0;
if (missionIndex > MISSION_TOTAL) missionIndex = MISSION_TOTAL;
let best = save && typeof save.best === 'number' ? save.best : 0;
if (save && typeof save.money === 'number') player.money = save.money;

function persist() {
  if (player.money > best) best = player.money;
  writeSave({ mission: missionIndex, money: player.money, best });
}

// --- Status layar ---
let screen = 'title'; // title | play | paused | over | busted | complete | finished
let muted = false;
const raycaster = new THREE.Raycaster();

function announce(message) {
  if (status) status.textContent = message;
}

function currentObjectiveText() {
  if (missions && typeof missions.currentObjective === 'function') {
    const obj = missions.currentObjective();
    if (obj) return obj.text || obj.title || '';
  }
  return 'Pergi ke penanda kuning';
}

function markerPos() {
  if (missions && typeof missions.currentObjective === 'function') {
    const obj = missions.currentObjective();
    if (obj && obj.pos) return { x: obj.pos.x, z: obj.pos.z };
  }
  return null;
}

function hudState() {
  return {
    health: player.health,
    money: player.money,
    wanted: police.wanted || 0,
    speed: player.inCar && player.car ? Math.abs(player.car.speed || 0) : 0,
    objective: currentObjectiveText(),
    playerPos: player.pos,
    playerHeading: player.heading,
    cops: (police.cops || []).map((cop) => {
      const p = (cop.car && cop.car.pos) || cop.pos || (cop.group && cop.group.position) || { x: 0, z: 0 };
      return { x: p.x, z: p.z };
    }),
    marker: markerPos(),
    inCar: player.inCar,
    weapon: player.weapon,
  };
}

function startMission(index) {
  missionIndex = index;
  if (missions && typeof missions.start === 'function') missions.start(index);
  // m-1 (v2): misi 2 butuh mobil target oranye yang jelas di (200,-100).
  if (index === 1) ensureTargetCar();
  hud.showObjective(currentObjectiveText());
  hud.showMessage(missions.list && missions.list[index] ? missions.list[index].title : 'Misi dimulai');
  announce(`Misi ${index + 1}: ${currentObjectiveText()}`);
}

function backToTitle() {
  screen = 'title';
  save = readSave();
  hud.setStart(!!save);
  announce('Kota Mentari. Tekan Enter untuk mulai.');
}

function newGame() {
  missionIndex = 0;
  player.money = 0;
  player.reset(world.spawn ? world.spawn.player : { x: 0, z: 50 });
  combat.playerHealth = 100; // sinkron dengan player.health (M-2)
  if (police && typeof police.setWanted === 'function') police.setWanted(0);
  else if (police) police.wanted = 0;
  screen = 'play';
  hud.showScreen('play');
  startMission(0);
  audio.startMusic();
  audio.click();
  persist();
}

function continueGame() {
  // B-2/M-4 (v2): save dari game yang sudah TAMAT (mission == jumlah misi)
  // tidak boleh startMission di luar range — tampilkan layar TAMAT.
  if (missionIndex >= MISSION_TOTAL) {
    screen = 'finished';
    hud.showFinished({ money: player.money, completed: MISSION_TOTAL, total: MISSION_TOTAL });
    announce('Game sudah tamat.');
    return;
  }
  player.reset(world.spawn ? world.spawn.player : { x: 0, z: 50 });
  combat.playerHealth = 100; // sinkron dengan player.health (M-2)
  if (police && typeof police.setWanted === 'function') police.setWanted(0);
  else if (police) police.wanted = 0;
  screen = 'play';
  hud.showScreen('play');
  startMission(missionIndex);
  audio.startMusic();
  audio.click();
}

function gameOver(reason) {
  screen = 'over';
  persist();
  audio.siren(false);
  audio.engine(0);
  hud.showOver(reason);
  announce(`Game over. ${reason || ''}`);
}

function busted() {
  screen = 'busted';
  persist();
  audio.siren(false);
  audio.engine(0);
  hud.showBusted();
  announce('Busted. Polisi menangkap Raka.');
}

// Callback misi dari lane C. onComplete(index, reward) — argumen pertama
// adalah INDEX misi (bukan objek misi), sesuai missions.js.
if (missions) {
  missions.onComplete = (index, reward) => {
    const mission = missions.list && typeof index === 'number' ? missions.list[index] : null;
    const prize = typeof reward === 'number' ? reward : (mission && mission.reward) || 500;
    player.addMoney(prize);
    audio.jingle();
    audio.pickup();
    // M-4 (v2): naikkan missionIndex ke misi BERIKUTNYA (capped di jumlah
    // misi) SEBELUM persist, supaya Continue lanjut ke misi yang benar
    // (bukan mengulang misi yang baru selesai).
    missionIndex = Math.min(index + 1, MISSION_TOTAL);
    persist();
    // B-2 (v2): misi terakhir selesai -> layar TAMAT. Enter/tombol di
    // layar complete lama mengulang misi 6; sekarang tidak ada lagi jalur
    // yang memanggil startMission(5) setelah tamat.
    if (index >= MISSION_TOTAL - 1) {
      screen = 'finished';
      hud.showFinished({ money: player.money, completed: MISSION_TOTAL, total: MISSION_TOTAL });
      announce('Tamat! Raka berhasil pulang.');
      return;
    }
    hud.showComplete(mission ? mission.title : 'MISI SELESAI', prize);
    screen = 'complete';
    announce(`Misi selesai. Hadiah $${prize}.`);
  };
  missions.onFail = () => {
    gameOver('Misi gagal.');
  };
}

// Tombol overlay.
hud.handlers.onNew = newGame;
hud.handlers.onContinue = continueGame;
hud.handlers.onResume = () => {
  screen = 'play';
  hud.showScreen('play');
  audio.click();
};
hud.handlers.onRestart = newGame;
hud.handlers.onNext = () => {
  // M-4 (v2): missionIndex SUDAH menunjuk misi berikutnya (dinaikkan di
  // onComplete sebelum persist) — jangan +1 lagi, nanti satu misi terlewat.
  if (missionIndex >= MISSION_TOTAL) {
    screen = 'finished';
    hud.showFinished({ money: player.money, completed: MISSION_TOTAL, total: MISSION_TOTAL });
    return;
  }
  screen = 'play';
  hud.showScreen('play');
  startMission(missionIndex);
  persist();
};
hud.handlers.onFinishedTitle = backToTitle;
hud.handlers.onFinishedNew = newGame;

// --- Satu langkah simulasi ---
function step() {
  if (screen !== 'play') return;
  const actions = input.takeActions();

  if (actions.pause) {
    screen = 'paused';
    hud.showScreen('paused');
    announce('Jeda.');
    return;
  }
  if (actions.mute) {
    muted = !muted;
    audio.setMuted(muted);
  }
  if (actions.weapon1) player.weapon = 'fists';
  if (actions.weapon2) player.weapon = 'pistol';

  player.update(STEP, input, world, vehicles, actions, vehicles.cars);

  // Tembak: raycast dari kamera lewat posisi mouse.
  if (actions.shoot && player.weapon === 'pistol' && !player.inCar) {
    raycaster.setFromCamera({ x: input.mouse.ndcX, y: input.mouse.ndcY }, camera);
    combat.shoot(raycaster.ray.origin, raycaster.ray.direction);
    audio.shot();
  }
  if (actions.punch && !player.inCar) {
    // combat.punch(playerPos, playerHeading) — bukan musuh target.
    const hit = combat.punch(player.pos, player.heading);
    if (hit) audio.punch();
  }

  if (traffic && typeof updateTraffic === 'function') updateTraffic(STEP, world);
  else if (traffic && typeof traffic.update === 'function') traffic.update(STEP, world);
  let policeResult = null;
  if (police && typeof police.update === 'function') {
    policeResult = police.update(STEP, player.pos, player.inCar, world, player.car);
  }
  if (missions && typeof missions.update === 'function') {
    missions.update(STEP, {
      playerPos: player.pos,
      playerInCar: player.inCar,
      playerCar: player.car, // m-1: identitas mobil yang dikendarai
      targetCar, // m-1: mobil target oranye misi 2 (null di misi lain)
      money: player.money,
      health: player.health,
      wanted: police.wanted || 0,
      enemiesAlive: combat && typeof combat.aliveCount === 'function' ? combat.aliveCount() : 0,
    });
  }
  if (combat && typeof combat.update === 'function') combat.update(STEP, player.pos);

  // Audio mengikuti keadaan.
  const speed01 = player.inCar && player.car && player.car.maxSpeed
    ? Math.abs(player.car.speed || 0) / player.car.maxSpeed
    : 0;
  audio.engine(player.inCar ? Math.max(0.08, speed01) : 0);
  audio.siren((police.wanted || 0) > 0);

  // Kalah / tertangkap. police.update mengembalikan 'busted' (bukan
  // properti police.busted): gagalkan misi aktif lalu tampilkan overlay.
  if (player.health <= 0) {
    gameOver('Raka tumbang.');
    return;
  }
  if (policeResult === 'busted') {
    if (missions && typeof missions.fail === 'function') missions.fail('Tertangkap polisi.');
    busted();
    return;
  }

  player.updateCamera(camera, STEP);
  hud.update(hudState());
}

// --- Mode screenshot ---
function runShot(name) {
  const game = {
    world, player, vehicles, traffic, police, missions, combat, hud, scene, camera, seed,
    _cars: vehicles.cars,
  };
  const staged = stageShot(name, game);
  screen = staged.screen === 'title' ? 'title' : 'play';
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// --- Loop game ---
function runGame() {
  let accumulator = 0;
  let last = performance.now();
  hud.setStart(!!save);
  announce('Kota Mentari. Tekan Enter untuk mulai.');

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // Aksi global di luar langkah simulasi (menu / jeda / selesai).
    if (screen !== 'play') {
      const actions = input.takeActions();
      if (actions.mute) {
        muted = !muted;
        audio.setMuted(muted);
      }
      if (actions.confirm) {
        if (screen === 'title') newGame();
        else if (screen === 'paused') {
          screen = 'play';
          hud.showScreen('play');
        } else if (screen === 'complete') hud.handlers.onNext();
        else if (screen === 'finished') backToTitle();
        else if (screen === 'over' || screen === 'busted') newGame();
      } else if (actions.pause && screen === 'paused') {
        screen = 'play';
        hud.showScreen('play');
      }
      if (screen === 'title') {
        // Orbit pelan di atas kota sebagai latar start screen.
        const t = now / 1000;
        camera.position.set(Math.sin(t * 0.05) * 240, 150, Math.cos(t * 0.05) * 240);
        camera.lookAt(0, 10, 0);
      }
      accumulator = 0;
      renderer.render(scene, camera);
      return;
    }

    while (accumulator >= STEP) {
      step();
      accumulator -= STEP;
      if (screen !== 'play') break;
    }
    renderer.render(scene, camera);
  }

  // Jeda otomatis saat tab disembunyikan.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      hud.showScreen('paused');
      announce('Jeda.');
    }
  });

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
