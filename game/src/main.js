// Modul utama — Kota Mentari.
// Perender dan kamera dan lampu senja, mesin keadaan (menu, bermain,
// jeda, selesai, tertangkap), loop update lalu render, perangkai semua
// modul, simpan dan muat, antarmuka debug window KOTA_DEBUG.
//
// Kontrak yang dipakai persis di sini:
// - HUD (Lane A): initHud, updateHud, showToast, showStartScreen,
//   showPauseScreen, showCompleteScreen, showBustedScreen,
//   hideAllScreens.
// - Kota (Lane B): buildCity, isBlocked, nearestRoad, districtAt,
//   getShipPosition, isPierCorridorClear, getValidSpawnPositions,
//   createRng, rngPick, MAP_HALF,
//   ROAD_LINES, ROAD_WIDTH, SIDEWALK_OFFSET, SHIP_POSITION,
//   PIER_CORRIDOR, DISTRICTS, PALETTE, SEED; vehicles createCar,
//   createTargetCar, spawnCarOnRoad, driveCar,
//   getCarState, getCarSpeed, setCarTargetSpeed, setCarSpeed,
//   TRAFFIC_COLORS, TARGET_COLOR, MAX_CIVIL_SPEED, MAX_POLICE_SPEED;
//   traffic createTraffic, updateTraffic, countActive,
//   countActiveDetailed, removeCar, removePedestrian, createPedestrian,
//   placePedestrianOnSidewalk, TRAFFIC_CAR_COUNT, PEDESTRIAN_COUNT.
// - Misi dan polisi (Lane C, kontrak TETAP): createMissionState,
//   startMission(state, index0, game), updateMissions(state, dt, game),
//   getObjectiveText(state), getCurrentMission(state),
//   getCurrentMissionIndex(state), isAllMissionsComplete(state),
//   getActiveMarker(state, game), onCarStolen(state, game, car),
//   onEnemyDefeated(state, game, enemy), createPoliceState,
//   setWanted(state, level, game), addWanted(state, amount, game),
//   getWanted(state), getPoliceUnits(state), isBusted(state),
//   checkBusted(state, game), resetBusted(state),
//   spawnPoliceNear(state, game, x, z), updatePolice(state, dt, game).
//   Kedua modul membaca game.player DATAR {x, z, angle, speed, health,
//   money, inCar} — disediakan di sini lewat playerProxy.
// - Audio (Lane E): initAudio, playAmbient, playEngine(km/jam),
//   stopEngine, playSiren, stopSiren, playFanfare, playWantedSting,
//   playPickup, setMuted.
// - Input (Lane D): initInput WAJIB dipanggil sekali di init().

import * as THREE from '../vendor/three.module.min.js';
import * as Config from './config.js';
import * as AudioSys from './audio.js';
import * as Input from './input.js';
import {
  buildCity,
  nearestRoad,
  districtAt,
  getShipPosition,
  isPierCorridorClear,
  getValidSpawnPositions,
  createRng,
  rngPick,
  MAP_HALF,
  SHIP_POSITION,
  SEED,
} from './world.js';
import {
  createCar,
  createTargetCar,
  spawnCarOnRoad,
  driveCar,
  setCarTargetSpeed,
  MAX_CIVIL_SPEED,
  MAX_POLICE_SPEED,
} from './vehicles.js';
import {
  createTraffic,
  updateTraffic,
  countActive,
  removeCar,
} from './traffic.js';
import * as Player from './player.js';
import * as Combat from './combat.js';
import * as Police from './police.js';
import * as Missions from './missions.js';
import {
  initHud,
  updateHud,
  showToast,
  showStartScreen,
  showPauseScreen,
  showCompleteScreen,
  showBustedScreen,
  hideAllScreens,
} from './hud.js';

// ---- Konstanta ----

// Kunci simpanan lokal: berisi nomor misi berikutnya dan jumlah uang.
const SAVE_KEY = Config.SAVE_KEY ?? 'kota-mentari-save';
// Titik awal pemain di distrik Pasar Lama (persimpangan jalan).
const START_X = -200;
const START_Z = 0;
// Jumlah misi dalam game.
const MISSION_COUNT = 6;
// Jarak sirene polisi terdengar.
const SIREN_DISTANCE = 45;

// ---- Keadaan game ----

// Layar: 'menu', 'playing', 'paused', 'finished', 'busted'.
let screen = 'menu';

const game = {
  screen: 'menu',
  mission: 1,
  money: 0,
  wanted: 0,
  muted: false,
  startedAt: 0,
  finishedAt: 0,
  version: 'kota-mentari-v4-lane-d',
};

// ---- Keadaan misi + polisi (kontrak Lane C) ----

// Keadaan misi dan polisi dibuat sekali di sini dan diteruskan sebagai
// argumen pertama ke semua fungsi Lane C (state dulu, baru data lain).
const missionState = Missions.createMissionState();
const policeState = Police.createPoliceState();

// Tampilan DATAR pemain untuk modul misi/polisi: mereka membaca
// player.x / player.z / player.angle / player.speed / player.health /
// player.money / player.inCar — semuanya dibaca langsung dari pemain
// (posisi hidup di player.position, bukan field x/z).
const playerProxy = {
  get x() {
    return Player.player.position.x;
  },
  get z() {
    return Player.player.position.z;
  },
  get angle() {
    return Player.player.heading;
  },
  get heading() {
    return Player.player.heading;
  },
  get speed() {
    return Player.player.speed;
  },
  get health() {
    return Player.player.health;
  },
  set health(value) {
    Player.player.health = value;
  },
  get money() {
    return Player.player.money;
  },
  set money(value) {
    Player.player.money = value;
  },
  get inCar() {
    return !Player.player.onFoot;
  },
  get onFoot() {
    return Player.player.onFoot;
  },
};

// Adaptor kecil untuk pencurian / tempur: modul player dan combat
// memanggil police.addWanted(jumlah) dengan satu argumen.
const policeAdapter = {
  addWanted(amount) {
    return Police.addWanted(policeState, amount, gameCtx);
  },
};

// Mobil target misi 2 (oranye, terparkir di Pusat kota), mobil target
// misi 3 (yang melarikan diri), dan penyerang misi 4.
let targetCar = null;
let chaseTargetCar = null;
const chaseTarget = { x: 0, z: 0 };
let attackers = [];
let countedDefeated = new Set();
let attackerSeq = 0;

// Objek game yang diteruskan ke modul misi dan polisi: berisi pemain
// datar, dunia, adegan, dan semua callback yang mereka harapkan.
const gameCtx = {
  player: playerProxy,
  get world() {
    return world;
  },
  get scene() {
    return scene;
  },
  get chaseTarget() {
    return chaseTargetCar ? chaseTarget : null;
  },
  showToast(text) {
    showToast(text, 4000);
  },
  saveGame,
  addMoney(amount) {
    return Player.addMoney(amount);
  },
  setWanted(level) {
    return setWantedLevel(level);
  },
  damagePlayer(amount) {
    return Player.damagePlayer(amount);
  },
  onBusted() {
    bustGame();
  },
  onAllMissionsComplete() {
    finishGame();
  },
  onMissionStart() {
    // Misi baru sudah diumumkan lewat toast briefing modul misi.
  },
  spawnChaseTarget,
  spawnAttackers,
  audio: AudioSys,
  random() {
    return rng ? rng() : Math.random();
  },
};

// ---- Aktor misi yang dibuat modul utama ----

// Mobil target misi 3: muncul di jalan dekat pemain, lalu melarikan diri
// mengikuti graf jalan. Posisi datarnya (chaseTarget) dibaca misi 3.
function spawnChaseTarget() {
  if (chaseTargetCar) {
    try {
      if (chaseTargetCar.parent) chaseTargetCar.parent.remove(chaseTargetCar);
    } catch (err) {
      // Abaikan.
    }
    chaseTargetCar = null;
  }
  try {
    const car = createCar(0x7a1fa2, 'civil');
    spawnCarOnRoad(car, world, rng, true);
    // Pindah ke jalan dekat pemain supaya kejar-kejaran langsung terasa.
    const px = Player.player.position.x;
    const pz = Player.player.position.z;
    const road = nearestRoad(world, px + 60, pz);
    if (road && typeof road.x === 'number' && typeof road.z === 'number') {
      car.position.set(road.x, 0, road.z);
    }
    setCarTargetSpeed(car, 14);
    scene.add(car);
    chaseTargetCar = car;
    chaseTarget.x = car.position.x;
    chaseTarget.z = car.position.z;
    return car;
  } catch (err) {
    return null;
  }
}

// Penyerang misi 4: sosok sederhana di dekat Mira. Mereka diam di tempat
// (menjaga Mira); pemain mengalahkan mereka dengan pukul / tembak.
function buildAttackerMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.4, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x8a1f2d }),
  );
  body.position.y = 1.0;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xd9a066 }),
  );
  head.position.y = 2.0;
  group.add(body);
  group.add(head);
  return group;
}

function spawnAttackers(count, x, z) {
  clearAttackers();
  const n = typeof count === 'number' ? count : 3;
  for (let i = 0; i < n; i++) {
    const mesh = buildAttackerMesh();
    const ax = x + (i - 1) * 4;
    const az = z + 6;
    mesh.position.set(ax, 0, az);
    scene.add(mesh);
    attackerSeq += 1;
    attackers.push({
      id: attackerSeq,
      x: ax,
      z: az,
      health: 100,
      alive: true,
      mesh,
      type: 'attacker',
    });
  }
  return attackers;
}

function clearAttackers() {
  for (const enemy of attackers) {
    try {
      if (enemy.mesh && enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);
    } catch (err) {
      // Abaikan.
    }
  }
  attackers = [];
  countedDefeated = new Set();
}

// Lepas aktor misi (target kejar + penyerang) saat permainan baru / menu.
function clearMissionActors() {
  if (chaseTargetCar) {
    try {
      if (chaseTargetCar.parent) chaseTargetCar.parent.remove(chaseTargetCar);
    } catch (err) {
      // Abaikan.
    }
    chaseTargetCar = null;
  }
  clearAttackers();
}

// ---- Perender, adegan, kamera, lampu ----

let renderer = null;
let scene = null;
let camera = null;
let clock = null;
let world = null;
let traffic = null;
let rng = null;

// Sudut kamera udara di menu.
let menuAngle = 0.6;
// Posisi kamera yang dihaluskan tiap frame.
const cameraTarget = new THREE.Vector3(0, 180, 260);
const cameraLookAt = new THREE.Vector3(0, 0, 0);
// Keadaan audio terakhir (supaya sirene tidak dipanggil berulang).
let sirenOn = false;
let lastWanted = 0;
let lastMissionSeen = 1;
let engineStarted = false;

function setupRenderer() {
  // Pakai kanvas placeholder yang sudah ada di halaman (#game-canvas):
  // membuat kanvas baru dan menempelkannya setelah placeholder membuat
  // kanvas WebGL jatuh di bawah viewport (layar hitam).
  const placeholder = document.getElementById('game-canvas');
  renderer = placeholder
    ? new THREE.WebGLRenderer({ antialias: true, canvas: placeholder })
    : new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (!placeholder) {
    const host =
      document.getElementById('game-container') ||
      document.getElementById('app') ||
      document.body;
    host.appendChild(renderer.domElement);
  }
}

function setupScene() {
  scene = new THREE.Scene();
  // Langit senja oranye dengan kabut tipis.
  scene.background = new THREE.Color(0xff8f4d);
  scene.fog = new THREE.Fog(0xffb37a, 120, 850);

  // Cahaya langit hangat dan cahaya tanah keunguan.
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x3a2a4a, 0.9);
  scene.add(hemi);

  // Matahari senja rendah dari barat: cahaya hangat bersudut kecil.
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.set(-180, 60, -120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  scene.add(sun.target);
}

function setupCamera() {
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000,
  );
  camera.position.set(0, 180, 260);
  camera.lookAt(0, 0, 0);
}

// ---- Simpan dan muat ----

// Simpan nomor misi BERIKUTNYA (dari keadaan misi, bukan cache) dan uang.
function saveGame() {
  try {
    const data = {
      nextMission: getCurrentMissionNumber(),
      money: Player.player.money,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    game.money = data.money;
    game.mission = data.nextMission;
    return true;
  } catch (err) {
    return false;
  }
}

// Muat simpanan lokal. Kembalikan { nextMission, money } atau null.
function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.nextMission !== 'number' || typeof data.money !== 'number') return null;
    return data;
  } catch (err) {
    return null;
  }
}

function hasSave() {
  return loadGame() !== null;
}

// ---- Pembantu misi (kontrak Lane C, state dulu) ----

// Nomor misi saat ini, 1 sampai 6; 7 bila semua misi selesai.
function getCurrentMissionNumber() {
  return Missions.getCurrentMissionIndex(missionState) + 1;
}

function getMissionName() {
  const mission = Missions.getCurrentMission(missionState);
  return mission ? mission.name : 'Semua misi selesai';
}

function getObjectiveText() {
  return Missions.getObjectiveText(missionState);
}

function getTargetPosition() {
  return Missions.getActiveMarker(missionState, gameCtx);
}

function getMissionEnemies() {
  return attackers;
}

function getMissionTargetCar() {
  return targetCar;
}

// Mulai misi nomor n (1-based: misi 1 = indeks 0).
function startMissionNumber(n) {
  const index = Math.max(0, Math.min(MISSION_COUNT - 1, Math.round(n) - 1));
  if (index !== 3) clearAttackers();
  Missions.startMission(missionState, index, gameCtx);
  game.mission = index + 1;
  lastMissionSeen = index + 1;
}

function isMissionsComplete() {
  return Missions.isAllMissionsComplete(missionState);
}

function updateMissions(dt) {
  Missions.updateMissions(missionState, dt, gameCtx);
}

// ---- Pembantu polisi (kontrak Lane C, state dulu) ----

function getWanted() {
  return Police.getWanted(policeState);
}

function setWantedLevel(n) {
  const level = Math.max(0, Math.min(5, Math.round(n)));
  Police.setWanted(policeState, level, gameCtx);
  game.wanted = level;
  lastWanted = level;
  return level;
}

function getPoliceUnits() {
  return Police.getPoliceUnits(policeState);
}

function getPolicePositions() {
  const positions = [];
  for (const unit of getPoliceUnits()) {
    if (!unit) continue;
    if (unit.position && typeof unit.position.x === 'number') {
      positions.push({ x: unit.position.x, z: unit.position.z });
    } else if (typeof unit.x === 'number' && typeof unit.z === 'number') {
      positions.push({ x: unit.x, z: unit.z });
    } else if (unit.mesh && unit.mesh.position) {
      positions.push({ x: unit.mesh.position.x, z: unit.mesh.position.z });
    } else if (unit.userData && unit.userData.position) {
      positions.push({ x: unit.userData.position.x, z: unit.userData.position.z });
    }
  }
  return positions;
}

function isBustedFlag() {
  return Police.isBusted(policeState);
}

function updatePolice(dt) {
  Police.updatePolice(policeState, dt, gameCtx);
}

// ---- Pembantu audio (kontrak Lane E) ----

function initAudioOnce() {
  try {
    AudioSys.initAudio();
  } catch (err) {
    // Suara tidak boleh menghentikan game.
  }
  try {
    AudioSys.playAmbient();
  } catch (err) {
    // Abaikan.
  }
}

function updateEngineSound() {
  // playEngine menerima kilometer per jam (0-108), bukan 0-1.
  try {
    AudioSys.playEngine(Math.abs(Player.player.speed) * 3.6);
    engineStarted = true;
  } catch (err) {
    // Suara tidak boleh menghentikan game.
  }
}

function updateSirenSound() {
  const near = getPolicePositions().some((pos) => {
    const dx = pos.x - Player.player.position.x;
    const dz = pos.z - Player.player.position.z;
    return Math.sqrt(dx * dx + dz * dz) < SIREN_DISTANCE;
  });
  if (near !== sirenOn) {
    sirenOn = near;
    try {
      if (near) AudioSys.playSiren();
      else AudioSys.stopSiren();
    } catch (err) {
      // Suara tidak boleh menghentikan game.
    }
  }
}

function stopEngineSound() {
  try {
    AudioSys.stopEngine();
  } catch (err) {
    // Abaikan.
  }
  engineStarted = false;
}

function toggleMute() {
  game.muted = !game.muted;
  try {
    AudioSys.setMuted(game.muted);
  } catch (err) {
    // Abaikan.
  }
}

// ---- Kamera ----

// Arah hadap pemain diubah ke konvensi HUD: nol berarti utara,
// positif searah jarum jam bila dilihat dari atas.
function toHudHeading(heading) {
  const twoPi = Math.PI * 2;
  return (((Math.PI - heading) % twoPi) + twoPi) % twoPi;
}

function updateChaseCamera(dt) {
  const player = Player.player;
  const heading = player.heading || 0;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const distance = player.onFoot ? 10 : 13;
  const height = player.onFoot ? 4.5 : 5.5;
  const desiredX = player.position.x - forwardX * distance;
  const desiredZ = player.position.z - forwardZ * distance;
  const blend = 1 - Math.exp(-5 * dt);
  cameraTarget.x += (desiredX - cameraTarget.x) * blend;
  cameraTarget.y += (height - cameraTarget.y) * blend;
  cameraTarget.z += (desiredZ - cameraTarget.z) * blend;
  camera.position.copy(cameraTarget);
  cameraLookAt.set(
    player.position.x + forwardX * 8,
    1.5,
    player.position.z + forwardZ * 8,
  );
  camera.lookAt(cameraLookAt);
}

function updateMenuCamera(dt) {
  menuAngle += dt * 0.05;
  const radius = 280;
  const height = 190;
  const x = Math.sin(menuAngle) * radius;
  const z = Math.cos(menuAngle) * radius;
  const blend = 1 - Math.exp(-2 * dt);
  cameraTarget.x += (x - cameraTarget.x) * blend;
  cameraTarget.y += (height - cameraTarget.y) * blend;
  cameraTarget.z += (z - cameraTarget.z) * blend;
  camera.position.copy(cameraTarget);
  cameraLookAt.set(0, 0, 0);
  camera.lookAt(cameraLookAt);
}

// ---- HUD ----

function buildHudState() {
  return {
    health: Player.player.health,
    maxHealth: Player.player.maxHealth,
    money: Player.player.money,
    weapon: Player.player.weapon,
    wanted: getWanted(),
    speedKmh: Math.abs(Player.player.speed) * 3.6,
    playerX: Player.player.position.x,
    playerZ: Player.player.position.z,
    playerAngle: toHudHeading(Player.player.heading),
    police: getPolicePositions(),
    target: getTargetPosition(),
    missionName: getMissionName(),
    objective: getObjectiveText(),
  };
}

// ---- Alur keadaan ----

function setScreen(next) {
  screen = next;
  game.screen = next;
}

function startNewGame() {
  hideAllScreens();
  clearMissionActors();
  Player.resetPlayer(START_X, START_Z);
  Player.player.money = 0;
  setWantedLevel(0);
  game.money = 0;
  game.startedAt = Date.now();
  game.finishedAt = 0;
  startMissionNumber(1);
  setScreen('playing');
  showToast('Misi: ' + getMissionName() + ' — ' + getObjectiveText(), 4000);
}

function continueGame() {
  const save = loadGame();
  if (!save) {
    startNewGame();
    return;
  }
  hideAllScreens();
  Player.resetPlayer(START_X, START_Z);
  Player.player.money = save.money;
  game.money = save.money;
  if (save.nextMission > MISSION_COUNT) {
    // Simpanan sudah menamatkan game: tampilkan layar TAMAT.
    setScreen('finished');
    game.finishedAt = Date.now();
    showCompleteScreen(save.money);
    return;
  }
  setWantedLevel(0);
  startMissionNumber(save.nextMission);
  setScreen('playing');
  showToast('Misi: ' + getMissionName() + ' — ' + getObjectiveText(), 4000);
}

function pauseGame() {
  if (screen !== 'playing') return;
  setScreen('paused');
  showPauseScreen();
}

function resumeGame() {
  if (screen !== 'paused') return;
  hideAllScreens();
  setScreen('playing');
}

function quitToMenu() {
  hideAllScreens();
  clearMissionActors();
  setWantedLevel(0);
  Player.resetPlayer(START_X, START_Z);
  setScreen('menu');
  showStartScreen(hasSave());
}

function retryAfterBusted() {
  hideAllScreens();
  Police.resetBusted(policeState);
  Player.resetPlayer(START_X, START_Z);
  setWantedLevel(0);
  startMissionNumber(game.mission);
  setScreen('playing');
  showToast('Misi: ' + getMissionName() + ' — ' + getObjectiveText(), 4000);
}

function playAgainAfterComplete() {
  startNewGame();
}

function finishGame() {
  if (screen !== 'playing') return;
  setScreen('finished');
  game.finishedAt = Date.now();
  game.money = Player.player.money;
  saveGame();
  stopEngineSound();
  try {
    AudioSys.playFanfare();
  } catch (err) {
    // Abaikan.
  }
  // Teruskan uang akhir ASLI (bukan nol) ke layar TAMAT.
  showCompleteScreen(Player.player.money);
}

function bustGame() {
  if (screen !== 'playing') return;
  setScreen('busted');
  stopEngineSound();
  showBustedScreen();
}

// ---- Mobil di dekat pemain (untuk tombol E) ----

function getNearbyCars() {
  const cars = [];
  if (traffic && Array.isArray(traffic.cars)) cars.push(...traffic.cars);
  const targetCar = getMissionTargetCar();
  if (targetCar && !cars.includes(targetCar)) cars.push(targetCar);
  return cars;
}

function handleEnterExitCar() {
  const cars = getNearbyCars();
  const action = Player.tryEnterExitCar(cars, policeAdapter);
  if (action !== 'enter') return;
  const car = Player.player.car;
  if (!car) return;
  // Tandai mobil curian supaya traffic tidak lagi mengemudikannya.
  if (car.userData) car.userData.stolen = true;
  car.stolen = true;
  // Beri tahu misi 2 bila mobil oranye target yang dicuri.
  if (car === targetCar) {
    Missions.onCarStolen(missionState, gameCtx, car);
  }
  // Mobil traffic yang dicuri keluar dari populasi traffic; mobil
  // target misi bukan milik traffic, jadi jangan dihapus dari sana.
  const missionTargetCar = getMissionTargetCar();
  if (car !== missionTargetCar && traffic) {
    try {
      removeCar(traffic, car);
    } catch (err) {
      try {
        removeCar(car);
      } catch (err2) {
        // Abaikan bila traffic tidak menyediakan penghapus.
      }
    }
  }
}

// ---- Update tiap frame saat bermain ----

function updatePlaying(dt) {
  // Tombol E: masuk / keluar / curi mobil.
  if (Input.justPressed('e')) handleEnterExitCar();

  Player.updatePlayer(dt);

  Combat.updateCombat(dt, Player.player, {
    enemies: getMissionEnemies(),
    policeUnits: getPoliceUnits(),
    audio: AudioSys,
    police: policeAdapter,
  });

  // Penyerang misi 4 yang baru kalah: beri tahu modul misi (sekali saja).
  for (const enemy of attackers) {
    if (enemy.alive === false && !countedDefeated.has(enemy.id)) {
      countedDefeated.add(enemy.id);
      Missions.onEnemyDefeated(missionState, gameCtx, enemy);
    }
  }

  // Mobil target misi 3 melarikan diri mengikuti graf jalan; posisi
  // datarnya dibaca modul misi tiap frame.
  if (chaseTargetCar) {
    try {
      driveCar(chaseTargetCar, world, dt, rng);
      chaseTarget.x = chaseTargetCar.position.x;
      chaseTarget.z = chaseTargetCar.position.z;
    } catch (err) {
      // Abaikan; target tetap di posisi terakhir.
    }
  }

  if (traffic) updateTraffic(traffic, dt);
  updatePolice(dt);
  updateMissions(dt);

  // Pantau pergantian misi: simpan tiap misi selesai, beri toast
  // untuk misi baru, dan tamatkan game bila semua misi selesai.
  const current = getCurrentMissionNumber();
  if (current !== lastMissionSeen) {
    game.mission = current;
    if (current > lastMissionSeen && current <= MISSION_COUNT) {
      saveGame();
      showToast('Misi: ' + getMissionName() + ' — ' + getObjectiveText(), 4000);
    }
    lastMissionSeen = current;
  }
  if (isMissionsComplete()) {
    finishGame();
    return;
  }

  // Pantau wanted naik (toast + sengatan sudah dilakukan modul polisi
  // saat setWanted; di sini hanya sinkronkan cache).
  const wanted = getWanted();
  game.wanted = wanted;
  lastWanted = wanted;

  // Pemicu BUSTED: nyawa habis, atau polisi menandai tertangkap.
  if (Player.player.health <= 0 || isBustedFlag()) {
    bustGame();
    return;
  }

  updateEngineSound();
  updateSirenSound();
  updateChaseCamera(dt);
  updateHud(buildHudState());
}

// ---- Loop utama ----

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Jeda (P / Esc) dan bisu (M) berlaku di semua layar.
  if (Input.justPressed('p') || Input.justPressed('escape')) {
    if (screen === 'playing') pauseGame();
    else if (screen === 'paused') resumeGame();
  }
  if (Input.justPressed('m')) toggleMute();

  if (screen === 'playing') {
    updatePlaying(dt);
  } else if (screen === 'menu') {
    // Kota tetap hidup di latar layar mulai.
    if (traffic) updateTraffic(traffic, dt);
    updateMenuCamera(dt);
    Input.discardClick();
  } else if (screen === 'paused' || screen === 'finished' || screen === 'busted') {
    updateChaseCamera(dt);
  }

  renderer.render(scene, camera);
  Input.updateInput();
}

// ---- Antarmuka debug (KOTA_DEBUG) ----

function debugTeleport(x, z) {
  const nx = typeof x === 'number' ? x : Player.player.position.x;
  const nz = typeof z === 'number' ? z : Player.player.position.z;
  // Jepit ke jalan terdekat bila ada, supaya tidak mendarat di gedung.
  let targetX = nx;
  let targetZ = nz;
  if (world) {
    try {
      const road = nearestRoad(world, nx, nz);
      if (road && typeof road.x === 'number' && typeof road.z === 'number') {
        const dx = road.x - nx;
        const dz = road.z - nz;
        if (Math.sqrt(dx * dx + dz * dz) > 30) {
          targetX = nx;
          targetZ = nz;
        }
      }
    } catch (err) {
      // Abaikan; teleport tetap jalan.
    }
  }
  Player.teleportPlayer(targetX, targetZ);
  return Player.getPlayerState();
}

function debugSetMission(n) {
  const mission = Math.max(1, Math.min(MISSION_COUNT, Math.round(n) || 1));
  startMissionNumber(mission);
  return debugGetState();
}

function debugSetWanted(n) {
  setWantedLevel(n);
  return debugGetState();
}

function debugSpawnPoliceNear() {
  const player = Player.player;
  try {
    const unit = Police.spawnPoliceNear(
      policeState,
      gameCtx,
      player.position.x,
      player.position.z,
    );
    if (unit) return getPoliceUnits().length;
  } catch (err) {
    // Abaikan; kembalikan jumlah saat ini.
  }
  return getPoliceUnits().length;
}

function debugSetHeading(heading) {
  if (typeof heading === 'number') Player.player.heading = heading;
  return Player.player.heading;
}

function debugGetState() {
  const district = (() => {
    try {
      return districtAt(Player.player.position.x, Player.player.position.z);
    } catch (err) {
      return null;
    }
  })();
  return {
    mission: getCurrentMissionNumber(),
    money: Player.player.money,
    wanted: getWanted(),
    screen,
    playerX: Player.player.position.x,
    playerZ: Player.player.position.z,
    health: Player.player.health,
    objective: getObjectiveText(),
    district,
    inCar: !Player.player.onFoot,
    speedKmh: Math.abs(Player.player.speed) * 3.6,
    police: getPoliceUnits().length,
    chaseTarget: chaseTargetCar
      ? { x: chaseTarget.x, z: chaseTarget.z }
      : null,
    attackers: attackers
      .filter((enemy) => enemy.alive)
      .map((enemy) => ({ x: enemy.x, z: enemy.z })),
  };
}

function setupDebug() {
  window.KOTA_DEBUG = {
    teleport: debugTeleport,
    teleportPlayer: debugTeleport,
    setMission: debugSetMission,
    setWanted: debugSetWanted,
    setHeading: debugSetHeading,
    spawnPoliceNear: debugSpawnPoliceNear,
    spawnPolice: debugSpawnPoliceNear,
    getState: debugGetState,
    version: 'kota-mentari-v4-lane-d',
  };
}

// ---- Inisialisasi ----

function init() {
  // Keyboard/mouse TIDAK aktif sebelum ini dipanggil.
  Input.initInput();
  rng = createRng(SEED ?? 7);
  setupRenderer();
  setupScene();
  setupCamera();
  clock = new THREE.Clock();

  // Bangun kota, buat traffic, siapkan pemain.
  world = buildCity(scene);
  Player.setPlayerWorld(world);
  const startSpot = pickStartSpot();
  Player.createPlayer(scene, startSpot.x, startSpot.z, world);
  traffic = createTraffic(scene, world);

  // Mobil oranye target misi 2 terparkir di Pusat kota (100, 0).
  try {
    targetCar = createTargetCar();
    targetCar.position.set(100, 0, 0);
    targetCar.rotation.y = Math.PI / 2;
    if (targetCar.userData && targetCar.userData.car) {
      targetCar.userData.car.heading = Math.PI / 2;
    }
    scene.add(targetCar);
  } catch (err) {
    targetCar = null;
  }

  // Koridor dermaga wajib kosong untuk misi 6; beri peringatan bila tidak.
  try {
    if (!isPierCorridorClear(world)) {
      console.warn('Koridor dermaga terhalang.');
    }
  } catch (err) {
    // Abaikan.
  }

  // HUD dengan enam penangan (dua penamaan tiap penangan supaya cocok
  // dengan nama apa pun yang dipakai modul HUD).
  initHud({
    onNewGame: startNewGame,
    newGame: startNewGame,
    onContinue: continueGame,
    continueGame,
    onResume: resumeGame,
    resume: resumeGame,
    onQuitToMenu: quitToMenu,
    quitToMenu,
    onRetry: retryAfterBusted,
    retry: retryAfterBusted,
    onPlayAgain: playAgainAfterComplete,
    playAgain: playAgainAfterComplete,
  });

  // Suara mulai hanya setelah gestur pertama pengguna.
  window.addEventListener('pointerdown', initAudioOnce, { once: true });
  window.addEventListener('keydown', initAudioOnce, { once: true });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  setupDebug();
  setScreen('menu');
  showStartScreen(hasSave());
  animate();
}

// Pilih titik awal: persimpangan Pasar Lama, atau posisi spawn valid
// pertama bila titik itu tidak tersedia.
function pickStartSpot() {
  try {
    const spots = getValidSpawnPositions(world);
    if (Array.isArray(spots) && spots.length > 0) {
      const near = spots.find((s) => {
        const sx = typeof s.x === 'number' ? s.x : s.position?.x;
        const sz = typeof s.z === 'number' ? s.z : s.position?.z;
        return (
          typeof sx === 'number' &&
          typeof sz === 'number' &&
          Math.abs(sx - START_X) < 40 &&
          Math.abs(sz - START_Z) < 40
        );
      });
      const chosen = near || spots[0];
      const cx = typeof chosen.x === 'number' ? chosen.x : chosen.position?.x;
      const cz = typeof chosen.z === 'number' ? chosen.z : chosen.position?.z;
      if (typeof cx === 'number' && typeof cz === 'number') return { x: cx, z: cz };
    }
  } catch (err) {
    // Abaikan; pakai titik awal tetap.
  }
  return { x: START_X, z: START_Z };
}

// Kapal dan konstanta peta dipakai ulang di tempat lain bila perlu.
export function getShip() {
  try {
    return getShipPosition();
  } catch (err) {
    return SHIP_POSITION ?? { x: 470, z: 350 };
  }
}

export function getWorld() {
  return world;
}

export function getTraffic() {
  return traffic;
}

export function getScreen() {
  return screen;
}

export function getGameState() {
  return {
    screen,
    mission: getCurrentMissionNumber(),
    money: Player.player.money,
    wanted: getWanted(),
    health: Player.player.health,
  };
}

export { saveGame, loadGame };

// Jalankan saat DOM siap.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
