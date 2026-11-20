// KOTA MENTARI — modul shots.
// Penata 4 foto (screenshot) dari render asli game. Benih 7.
// Modul ini dipakai skrip retake foto; TIDAK dipakai saat bermain biasa.
//
// Cara pakai (dari skrip retake, lewat browser):
//   await import('/src/shots.js');            // bila modul utama belum memuatnya
//   window.KOTA_SHOTS.setupShot('chase')    // foto 1
//   window.KOTA_SHOTS.setupShot('drive')    // foto 2
//   window.KOTA_SHOTS.setupShot('street')   // foto 3
//   window.KOTA_SHOTS.setupShot('start')    // foto 4
//
// Pementasan memakai tiga jalur, berurutan dari yang paling langsung:
//   1. Modul permainan sendiri (pemain, kendaraan): mobil oranye target,
//      mobil polisi, dan traffic/pedestrian yang sudah ada di adegan
//      dipindah ke posisi foto. Adegan diambil dari induk mesh pemain.
//   2. Antarmuka debug window.KOTA_DEBUG (pindah pemain, pilih misi,
//      atur wanted, munculkan polisi, baca keadaan). Tiap pemanggilan
//      mencoba beberapa nama kandidat yang wajar dan menelan galat,
//      karena nama metode ditulis lane lain dari prosa yang sama.
//   3. HUD: banner/toast lewat showToast(text, durationMs) dari modul HUD
//      (kontrak Lane A); teks kotak misi ditulis langsung ke elemen
//      #mission-name / #mission-objective — modul HUD hanya menulis ulang
//      elemen itu bila nilainya berubah, jadi tulisan pementasan bertahan
//      selama permainan tidak mengubah objective.
// Kamera: penata kamera debug dicoba bila ada; bila tidak ada, kamera
// kejar bawaan game (mengikuti pemain dari belakang) yang membingkai foto.
// Mengemudi (tahan tombol maju sampai kecepatan target) dilakukan skrip
// retake lewat keyboard asli, bukan modul ini.

import { SEED, CAR_MAX_SPEED } from './config.js';
import { showToast as hudShowToast } from './hud.js';
import * as Player from './player.js';
import {
  createTargetCar,
  createPoliceCar,
  setCarSpeed,
  setCarTargetSpeed,
} from './vehicles.js';

// ---------------------------------------------------------------------------
// Benih foto: 7 (sama dengan benih permainan, agar deterministik).
// Arah timur (+X) dalam radian: sin = 1, cos = 0.
// Trotoar berada 9 satuan dari tengah jalan.
// ---------------------------------------------------------------------------
export const SHOT_SEED = SEED;
export const SHOT_NAMES = ['chase', 'drive', 'street', 'start'];
export const HEADING_EAST = Math.PI / 2;
export const SIDEWALK_OFFSET = 9;

// ---------------------------------------------------------------------------
// Pembantu antarmuka debug (best-effort: gagal diam-diam bila belum ada).
// ---------------------------------------------------------------------------
function getDebug() {
  if (typeof window === 'undefined') return null;
  return window.KOTA_DEBUG || null;
}

function getCameraObject() {
  if (typeof window === 'undefined') return null;
  if (window.KOTA_CAMERA) return window.KOTA_CAMERA;
  const debug = getDebug();
  if (debug && debug.camera) return debug.camera;
  return null;
}

// Memanggil metode debug pertama yang ada dari daftar nama kandidat.
// Mengembalikan nilai kembalian metode itu, atau undefined bila tidak ada
// kandidat yang cocok atau semuanya melempar.
function callDebug(names, ...args) {
  const debug = getDebug();
  if (!debug) return undefined;
  for (const name of names) {
    const fn = debug[name];
    if (typeof fn === 'function') {
      try {
        return fn.apply(debug, args);
      } catch (error) {
        // Lanjut ke kandidat berikutnya.
      }
    }
  }
  return undefined;
}

// Membaca keadaan game lewat debug (misi, uang, wanted, layar).
export function readGameState() {
  const debug = getDebug();
  if (!debug) return null;
  if (typeof debug.getState === 'function') {
    try {
      return debug.getState();
    } catch (error) {
      // Jatuh ke pembacaan properti.
    }
  }
  if (debug.state && typeof debug.state === 'object') return debug.state;
  return {
    mission: debug.mission,
    money: debug.money,
    wanted: debug.wanted,
    screen: debug.screen,
  };
}

// ---------------------------------------------------------------------------
// Penata kamera: mencoba penata kamera debug, lalu objek kamera yang
// diekspos window, lalu diam (kamera kejar bawaan mengambil alih).
// ---------------------------------------------------------------------------
export function setShotCamera(x, y, z, lookX, lookY, lookZ) {
  const done = callDebug(
    ['setCamera', 'moveCamera', 'placeCamera', 'setCameraPosition'],
    x, y, z, lookX, lookY, lookZ,
  );
  if (done !== undefined) return true;
  const camera = getCameraObject();
  if (camera && camera.position && typeof camera.position.set === 'function') {
    camera.position.set(x, y, z);
    if (typeof camera.lookAt === 'function') {
      camera.lookAt(lookX, lookY, lookZ);
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Adegan dan penghuninya (mobil traffic, pejalan kaki) — diambil dari
// induk mesh pemain, yaitu adegan tiga dimensi permainan.
// ---------------------------------------------------------------------------
export function getScene() {
  const mesh = Player.player && Player.player.mesh;
  if (mesh && mesh.parent) return mesh.parent;
  return null;
}

function collectSceneObjects(predicate) {
  const scene = getScene();
  const found = [];
  if (!scene) return found;
  scene.traverse((obj) => {
    if (obj && obj.userData && predicate(obj.userData, obj)) found.push(obj);
  });
  return found;
}

function listCivilCars() {
  const ownCar = Player.player ? Player.player.car : null;
  return collectSceneObjects(
    (data, obj) => data.car && data.car.type === 'civil' && obj !== ownCar,
  );
}

function listPedestrians() {
  return collectSceneObjects((data) => Boolean(data.ped));
}

function distanceTo(obj, x, z) {
  const dx = obj.position.x - x;
  const dz = obj.position.z - z;
  return Math.sqrt(dx * dx + dz * dz);
}

function placeCarAt(car, x, z, heading, cruiseSpeed) {
  car.position.set(x, 0, z);
  car.rotation.y = heading;
  if (car.userData && car.userData.car) {
    car.userData.car.heading = heading;
    if (typeof cruiseSpeed === 'number') {
      setCarSpeed(car, cruiseSpeed);
      setCarTargetSpeed(car, cruiseSpeed);
    }
  }
  return car;
}

function addCarToScene(car, x, z, heading) {
  const scene = getScene();
  if (!scene) return null;
  placeCarAt(car, x, z, heading, 0);
  scene.add(car);
  return car;
}

// Mobil oranye terang (mobil target misi 2) di posisi foto.
function placeOrangeCar(x, z, heading) {
  const car = createTargetCar();
  return addCarToScene(car, x, z, heading);
}

// Satu mobil polisi di posisi foto (diam, untuk formasi).
function placePoliceCar(x, z, heading) {
  const car = createPoliceCar();
  return addCarToScene(car, x, z, heading);
}

// Kumpulkan mobil traffic ke avenue di depan pemain: `count` mobil
// terdekat dipindah ke lajur jalan (z selang-seling +-3,5 dari tengah)
// menghadap timur dengan kecepatan jelajah pelan.
function gatherTrafficOnAvenue(playerX, roadZ, count, cruiseSpeed) {
  const cars = listCivilCars();
  cars.sort((a, b) => distanceTo(a, playerX, roadZ) - distanceTo(b, playerX, roadZ));
  const chosen = cars.slice(0, count);
  chosen.forEach((car, i) => {
    const x = playerX + 25 + i * 15;
    const z = roadZ + (i % 2 === 0 ? -3.5 : 3.5);
    placeCarAt(car, x, z, HEADING_EAST, cruiseSpeed);
  });
  return chosen.length;
}

// Kumpulkan pejalan kaki ke trotoar avenue di depan pemain: `count`
// pejalan kaki terdekat dipindah ke trotoar (sisi selang-seling),
// berjalan sepanjang sumbu X di tepi jalan.
function gatherPedestriansOnSidewalks(playerX, roadZ, count) {
  const peds = listPedestrians();
  peds.sort((a, b) => distanceTo(a, playerX, roadZ) - distanceTo(b, playerX, roadZ));
  const chosen = peds.slice(0, count);
  chosen.forEach((ped, i) => {
    const state = ped.userData.ped;
    state.axis = 'z';
    state.line = roadZ;
    state.side = i % 2 === 0 ? 1 : -1;
    state.along = playerX + 15 + i * 12;
    state.dir = i % 2 === 0 ? 1 : -1;
    ped.position.set(state.along, 0, roadZ + state.side * SIDEWALK_OFFSET);
    ped.rotation.y = state.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  });
  return chosen.length;
}

// ---------------------------------------------------------------------------
// Pembantu pementasan lewat debug + HUD.
// ---------------------------------------------------------------------------
function teleportPlayer(x, z) {
  return callDebug(
    ['teleport', 'teleportPlayer', 'movePlayerTo', 'setPlayerPosition', 'movePlayer'],
    x, z,
  );
}

function selectMission(number) {
  return callDebug(['setMission', 'selectMission', 'startMission', 'goToMission'], number);
}

function setWanted(level) {
  return callDebug(['setWanted', 'setWantedLevel', 'setStars'], level);
}

function spawnPoliceNearPlayer() {
  return callDebug(['spawnPoliceNear', 'spawnPoliceNearby', 'spawnPolice']);
}

function showToast(text) {
  // Jalur utama: showToast(text, durationMs) dari modul HUD (kontrak Lane A).
  // Durasi 60 detik supaya banner masih tampil saat foto diambil.
  try {
    hudShowToast(text, 60000);
    return true;
  } catch (error) {
    // Jatuh ke jalur debug / DOM di bawah.
  }
  const done = callDebug(['setToast', 'showToast', 'setBanner', 'showBanner'], text);
  if (done !== undefined) return true;
  if (typeof document !== 'undefined') {
    const el = document.querySelector(
      '[data-toast], #toast, .toast, [data-banner], #banner, .banner',
    );
    if (el) {
      el.textContent = text;
      return true;
    }
  }
  return false;
}

// Tulis teks kotak misi langsung ke DOM. Modul HUD hanya menulis ulang
// elemen ini bila nilai dari permainan berubah, jadi tulisan pementasan
// bertahan untuk foto.
function setObjectiveText(text) {
  const done = callDebug(
    ['setObjective', 'setObjectiveText', 'overrideObjective'],
    text,
  );
  if (done !== undefined) return true;
  if (typeof document !== 'undefined') {
    const el = document.getElementById('mission-objective');
    if (el) {
      el.textContent = text;
      return true;
    }
  }
  return false;
}

function setMissionNameText(text) {
  if (typeof document !== 'undefined') {
    const el = document.getElementById('mission-name');
    if (el) {
      el.textContent = text;
      return true;
    }
  }
  return false;
}

function goToMenu() {
  return callDebug(
    ['toMenu', 'showMenu', 'showStart', 'goToStart', 'setScreen'],
    'menu',
  );
}

// ---------------------------------------------------------------------------
// FOTO 1 — cover "chase".
// Pemain di mobil oranye, 3 mobil polisi formasi baji di depan, wanted 3,
// toast "Kabur dari polisi!", kecepatan 108, minimap lengkap,
// objective "Kabur dari polisi!", traffic dan pejalan kaki di latar.
// Pementasan di jalan lurus Z = 0, pemain menghadap timur (+X) dengan
// kecepatan penuh (30 satuan/detik = 108 km/jam; dikejar skrip retake
// dengan menahan tombol maju). Polisi baji dipasang 60-68 satuan di depan
// supaya mobil sempat mencapai 108 km/jam sebelum sampai ke formasi.
// ---------------------------------------------------------------------------
export function setupChase() {
  selectMission(6);
  setWanted(3);
  spawnPoliceNearPlayer();
  spawnPoliceNearPlayer();
  spawnPoliceNearPlayer();
  teleportPlayer(-150, 0);
  const px = -150;
  let inCar = false;
  const orange = placeOrangeCar(px + 4, 0, HEADING_EAST);
  if (orange) {
    try {
      inCar = Player.enterCar(orange);
    } catch (error) {
      inCar = false;
    }
  }
  Player.player.money = 14700;
  let policePlaced = 0;
  if (placePoliceCar(px + 60, -7, HEADING_EAST)) policePlaced += 1;
  if (placePoliceCar(px + 68, 0, HEADING_EAST)) policePlaced += 1;
  if (placePoliceCar(px + 60, 7, HEADING_EAST)) policePlaced += 1;
  gatherTrafficOnAvenue(px, 0, 4, 10);
  gatherPedestriansOnSidewalks(px, 0, 6);
  showToast('Kabur dari polisi!');
  setObjectiveText('Kabur dari polisi!');
  setMissionNameText('Jalan Pulang');
  setShotCamera(px - 14, 7, -10, px + 30, 2, 0);
  return {
    shot: 'chase',
    seed: SHOT_SEED,
    player: { x: px, z: 0, inCar, speedKmh: 108 },
    wanted: 3,
    policePlaced,
    toast: 'Kabur dari polisi!',
    objective: 'Kabur dari polisi!',
  };
}

// ---------------------------------------------------------------------------
// FOTO 2 — drive RETAKE (avenue Pusat kota yang RAMAI).
// Pemain mengemudi di avenue Pusat kota: 6+ mobil traffic di depan,
// 8+ pejalan kaki di trotoar, 1 mobil polisi di kejauhan, penanda misi
// kuning di depan, kecepatan sekitar 60, minimap lengkap, objective misi
// terlihat. BUKAN jalan kosong.
// Pementasan di jalan Z = 0 menembus Pusat kota (X -100 sampai 200),
// pemain menghadap timur dengan kecepatan ~16,7 satuan/detik (60 km/jam;
// dicapai skrip retake dengan menahan tombol maju). Traffic dan pejalan
// kaki yang sudah ada di adegan dikumpulkan ke avenue di depan pemain.
// ---------------------------------------------------------------------------
export function setupDrive() {
  selectMission(1);
  setWanted(0);
  teleportPlayer(-60, 0);
  const px = -60;
  let inCar = false;
  const orange = placeOrangeCar(px + 4, 0, HEADING_EAST);
  if (orange) {
    try {
      inCar = Player.enterCar(orange);
    } catch (error) {
      inCar = false;
    }
  }
  const carsGathered = gatherTrafficOnAvenue(px, 0, 8, 10);
  const pedsGathered = gatherPedestriansOnSidewalks(px, 0, 10);
  let policePlaced = 0;
  if (placePoliceCar(20, 4, HEADING_EAST)) policePlaced += 1;
  setObjectiveText('Pergi ke penanda kuning');
  setMissionNameText('Paket Kilat');
  setShotCamera(px - 14, 7, -9, 30, 2, 0);
  return {
    shot: 'drive',
    seed: SHOT_SEED,
    player: { x: px, z: 0, inCar, speedKmh: 60 },
    wanted: 0,
    carsGathered,
    pedsGathered,
    policeInDistance: policePlaced,
    objective: 'Pergi ke penanda kuning',
    note: 'Avenue Pusat kota harus ramai: 6+ mobil traffic, 8+ pejalan kaki.',
  };
}

// ---------------------------------------------------------------------------
// FOTO 3 — street.
// Pemain JALAN KAKI (kemeja oranye), pejalan kaki di trotoar,
// 1 mobil traffic, banner "Paket 1 dari 3 terantar",
// wanted 1, minimap lengkap, objective "Pergi ke penanda kuning".
// Pasar Lama (Z = 0, X -200); pemain menghadap timur, traffic dan
// pejalan kaki dikumpulkan ke dekat pemain.
// ---------------------------------------------------------------------------
export function setupStreet() {
  selectMission(1);
  setWanted(1);
  teleportPlayer(-200, 0);
  const px = -200;
  Player.player.heading = HEADING_EAST;
  try {
    if (Player.player && !Player.player.onFoot) Player.exitCar();
  } catch (error) {
    // Sudah jalan kaki; abaikan.
  }
  const carsGathered = gatherTrafficOnAvenue(px, 0, 1, 8);
  const pedsGathered = gatherPedestriansOnSidewalks(px, 0, 6);
  showToast('Paket 1 dari 3 terantar');
  setObjectiveText('Pergi ke penanda kuning');
  setMissionNameText('Paket Kilat');
  setShotCamera(px - 14, 6, -8, px + 20, 2, 0);
  return {
    shot: 'street',
    seed: SHOT_SEED,
    player: { x: px, z: 0, onFoot: true },
    wanted: 1,
    carsGathered,
    pedsGathered,
    banner: 'Paket 1 dari 3 terantar',
    objective: 'Pergi ke penanda kuning',
  };
}

// ---------------------------------------------------------------------------
// FOTO 4 — start.
// Layar mulai: judul KOTA MENTARI besar, paragraf cerita (Raka Pratama,
// Bos Darma, Geng Ombak, Mira Santosa), daftar kontrol, tombol "Mulai Baru",
// kota dari udara di latar (gelap, terbaca).
// ---------------------------------------------------------------------------
export function setupStart() {
  goToMenu();
  setShotCamera(0, 260, 260, 0, 0, 0);
  return {
    shot: 'start',
    seed: SHOT_SEED,
    screen: 'menu',
    note: 'Layar mulai dengan kota dari udara di latar.',
  };
}

// ---------------------------------------------------------------------------
// Dispatcher: setupShot('chase' | 'drive' | 'street' | 'start').
// ---------------------------------------------------------------------------
export function setupShot(name) {
  if (name === 'chase') return setupChase();
  if (name === 'drive') return setupDrive();
  if (name === 'street') return setupStreet();
  if (name === 'start') return setupStart();
  throw new Error(`Nama foto tidak dikenal: ${name}`);
}

// Alias dispatcher.
export const stageShot = setupShot;
export const stagePhoto = setupShot;

// ---------------------------------------------------------------------------
// Objek penata foto tunggal + pendaftaran ke window untuk skrip retake.
// ---------------------------------------------------------------------------
export const shots = {
  setupShot,
  stageShot,
  stagePhoto,
  setupChase,
  setupDrive,
  setupStreet,
  setupStart,
  readGameState,
  setShotCamera,
  getScene,
  SHOT_SEED,
  SHOT_NAMES,
};

if (typeof window !== 'undefined') {
  window.KOTA_SHOTS = shots;
}

export default shots;
