// Modul player — keadaan dan gerak Raka Pratama di Kota Mentari.
// Jalan kaki (jalan 6, lari 10 dengan Shift), mengemudi mobil (sampai 30),
// masuk / keluar / curi mobil (tombol E), nyawa 100, uang, senjata aktif.
// Pemain jalan kaki memakai kemeja oranye dan celana gelap supaya mudah
// dikenali di jalan dan di foto.
//
// Kontrak kota (Lane B): tabrakan memakai isBlocked(world, x, z) dengan
// objek world dari buildCity; keadaan mobil tersimpan di userData mobil
// (heading, speed, targetSpeed, ...). Modul ini membaca dan menulis
// userData itu, dengan field polos sebagai cadangan bila ada.

import * as THREE from '../vendor/three.module.min.js';
import * as Config from './config.js';
import { isDown } from './input.js';
import { isBlocked } from './world.js';

// Angka-angka diambil dari modul config; nilai sesudah tanda ?? adalah
// angka desain bila config memakai nama lain.
const WALK_SPEED = Config.WALK_SPEED ?? 6;
const RUN_SPEED = Config.RUN_SPEED ?? 10;
const CAR_MAX_SPEED = Config.CAR_MAX_SPEED ?? 30;
const PLAYER_MAX_HEALTH = Config.PLAYER_MAX_HEALTH ?? Config.MAX_HEALTH ?? 100;
const MAP_LIMIT = Config.MAP_LIMIT ?? Config.MAP_HALF ?? 496;
const START_X = Config.PLAYER_START_X ?? -200;
const START_Z = Config.PLAYER_START_Z ?? 0;

// Jarak maksimum untuk meraih mobil dengan tombol E.
const ENTER_CAR_DISTANCE = 4.5;
// Kecepatan mundur jalan kaki.
const BACKWARD_SPEED = 3;
// Kecepatan mundur mobil.
const CAR_REVERSE_SPEED = 8;
// Percepatan mobil dan pengereman.
const CAR_ACCEL = 14;
const CAR_BRAKE = 26;
const CAR_DRAG = 6;
const HANDBRAKE_DECEL = 30;
// Kecepatan belok: jalan kaki dan mobil.
const WALK_TURN_SPEED = 2.8;
const CAR_STEER_SPEED = 1.9;

// Objek world dari buildCity (Lane B). Disetel modul utama lewat
// setPlayerWorld / createPlayer; dipakai pemeriksa tabrakan.
let playerWorld = null;

// Simpan objek world untuk pemeriksaan tabrakan. Kembalikan world itu.
export function setPlayerWorld(world) {
  playerWorld = world || null;
  return playerWorld;
}

export function getPlayerWorld() {
  return playerWorld;
}

// Keadaan pemain. Satu objek ini dibaca modul utama, tempur, misi,
// dan polisi — jangan mengganti nama fieldnya.
export const player = {
  // Posisi dunia (vektor tiga dimensi, Y selalu 0 di permukaan jalan).
  position: new THREE.Vector3(START_X, 0, START_Z),
  // Arah hadap dalam radian. Maju = (sin(heading), 0, cos(heading)).
  heading: 0,
  // Kecepatan saat ini dalam satuan per detik.
  speed: 0,
  // Nyawa penuh 100.
  health: PLAYER_MAX_HEALTH,
  maxHealth: PLAYER_MAX_HEALTH,
  // Uang yang dibawa; hadiah misi menambah angka ini.
  money: 0,
  // Senjata aktif: 'fists' (tinju) atau 'pistol'.
  weapon: 'fists',
  // True bila berjalan kaki, false bila sedang mengemudi.
  onFoot: true,
  // Mobil yang sedang dikemudikan, atau null bila jalan kaki.
  car: null,
  // True bila pemain sedang bergerak pada frame ini.
  moving: false,
  // Mesh tiga dimensi pemain (dibangun createPlayer).
  mesh: null,
  // Akumulator waktu untuk animasi langkah kaki.
  walkTime: 0,
};

function clampToMap(value) {
  if (value > MAP_LIMIT) return MAP_LIMIT;
  if (value < -MAP_LIMIT) return -MAP_LIMIT;
  return value;
}

function blockedAt(x, z) {
  if (!playerWorld) return false;
  try {
    return isBlocked(playerWorld, x, z);
  } catch (err) {
    // Bila pemeriksa kota belum siap, anggap titik bisa dilalui.
    return false;
  }
}

// Geser posisi dengan tabrakan: coba penuh, lalu geser sumbu X saja,
// lalu sumbu Z saja, supaya pemain meluncur di sepanjang dinding.
function moveWithCollision(pos, dx, dz) {
  const nx = clampToMap(pos.x + dx);
  const nz = clampToMap(pos.z + dz);
  if (!blockedAt(nx, nz)) {
    pos.x = nx;
    pos.z = nz;
    return true;
  }
  if (!blockedAt(nx, pos.z)) {
    pos.x = nx;
    return true;
  }
  if (!blockedAt(pos.x, nz)) {
    pos.z = nz;
    return true;
  }
  return false;
}

function forwardVector(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

function syncMesh() {
  if (!player.mesh) return;
  player.mesh.position.copy(player.position);
  player.mesh.rotation.y = player.heading;
}

// ---- Pembantu keadaan mobil (kontrak Lane B: userData) ----

// Objek tiga dimensi mobil: mobil itu sendiri bila ia grup adegan,
// atau field mesh-nya bila mobil dibungkus objek lain.
function carObject3D(car) {
  if (!car) return null;
  if (car.position && typeof car.position.x === 'number') return car;
  if (car.mesh) return car.mesh;
  return null;
}

// Posisi mobil sebagai vektor tiga dimensi, atau null.
function carPosition(car) {
  const obj = carObject3D(car);
  return obj ? obj.position : null;
}

// Baca arah hadap mobil: userData dulu, lalu penyimpanan kendaraan
// (userData.car.heading — dipakai modul vehicles dan pementasan foto),
// lalu field polos.
function getCarHeading(car) {
  if (car && car.userData && typeof car.userData.heading === 'number') return car.userData.heading;
  if (car && car.userData && car.userData.car && typeof car.userData.car.heading === 'number') return car.userData.car.heading;
  if (car && typeof car.heading === 'number') return car.heading;
  return 0;
}

// Tulis arah hadap mobil ke userData, penyimpanan kendaraan, dan field
// polos sekaligus supaya semua pembaca melihat nilai yang sama.
function setCarHeading(car, heading) {
  if (!car) return;
  if (car.userData) car.userData.heading = heading;
  if (car.userData && car.userData.car) car.userData.car.heading = heading;
  car.heading = heading;
}

// Baca kecepatan mobil: userData dulu, lalu field polos.
function getCarSpeed(car) {
  if (car && car.userData && typeof car.userData.speed === 'number') return car.userData.speed;
  if (car && typeof car.speed === 'number') return car.speed;
  return 0;
}

// Tulis kecepatan mobil ke userData dan field polos sekaligus.
function setCarSpeed(car, speed) {
  if (!car) return;
  if (car.userData) car.userData.speed = speed;
  car.speed = speed;
}

// Kecepatan maksimum mobil ini (mobil polisi lebih cepat dari biasa).
function getCarMaxSpeed(car) {
  if (car && car.userData && typeof car.userData.maxSpeed === 'number') return car.userData.maxSpeed;
  if (car && typeof car.maxSpeed === 'number') return car.maxSpeed;
  return CAR_MAX_SPEED;
}

// Samakan mesh mobil dengan posisi dan arah hadap pemain.
function syncCarMesh(car) {
  const obj = carObject3D(car);
  if (!obj) return;
  obj.position.set(player.position.x, 0, player.position.z);
  obj.rotation.y = getCarHeading(car);
}

// Bangun mesh pemain: kemeja oranye, celana gelap, kepala berkulit.
// Kaki dan lengan digerakkan sedikit saat berjalan (di updatePlayer).
// Parameter keempat adalah objek world dari buildCity (boleh kosong;
// bila ada, disimpan untuk pemeriksaan tabrakan).
export function createPlayer(scene, startX, startZ, world) {
  if (world) setPlayerWorld(world);
  const x = typeof startX === 'number' ? startX : START_X;
  const z = typeof startZ === 'number' ? startZ : START_Z;
  player.position.set(x, 0, z);
  player.heading = 0;
  player.speed = 0;
  player.health = PLAYER_MAX_HEALTH;
  player.maxHealth = PLAYER_MAX_HEALTH;
  player.money = 0;
  player.weapon = 'fists';
  player.onFoot = true;
  player.car = null;
  player.moving = false;
  player.walkTime = 0;

  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xff7b24, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.9 });

  // Badan: kemeja oranye.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.82, 0.42), orange);
  torso.position.y = 1.12;
  torso.name = 'torso';
  group.add(torso);

  // Kepala dan rambut.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.4), skin);
  head.position.y = 1.78;
  head.name = 'head';
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.42), hair);
  hairTop.position.y = 2.02;
  group.add(hairTop);

  // Lengan kemeja oranye di kiri dan kanan badan.
  const armGeo = new THREE.BoxGeometry(0.2, 0.72, 0.24);
  const armLeft = new THREE.Mesh(armGeo, orange);
  armLeft.position.set(-0.48, 1.12, 0);
  armLeft.name = 'armLeft';
  group.add(armLeft);
  const armRight = new THREE.Mesh(armGeo, orange);
  armRight.position.set(0.48, 1.12, 0);
  armRight.name = 'armRight';
  group.add(armRight);

  // Kaki: celana gelap.
  const legGeo = new THREE.BoxGeometry(0.28, 0.78, 0.32);
  const legLeft = new THREE.Mesh(legGeo, dark);
  legLeft.position.set(-0.18, 0.39, 0);
  legLeft.name = 'legLeft';
  group.add(legLeft);
  const legRight = new THREE.Mesh(legGeo, dark);
  legRight.position.set(0.18, 0.39, 0);
  legRight.name = 'legRight';
  group.add(legRight);

  group.position.copy(player.position);
  group.rotation.y = player.heading;
  if (scene && typeof scene.add === 'function') scene.add(group);
  player.mesh = group;
  return player;
}

// Gerak jalan kaki satu frame: W maju, S mundur, A/D memutar arah hadap,
// Shift lari. Kembalikan true bila pemain berpindah.
function updateOnFoot(dt) {
  const forward = isDown('w');
  const backward = isDown('s');
  const turnLeft = isDown('a');
  const turnRight = isDown('d');
  const running = isDown('shift');

  if (turnLeft) player.heading += WALK_TURN_SPEED * dt;
  if (turnRight) player.heading -= WALK_TURN_SPEED * dt;

  let targetSpeed = 0;
  if (forward) targetSpeed = running ? RUN_SPEED : WALK_SPEED;
  else if (backward) targetSpeed = -BACKWARD_SPEED;

  // Percepatan halus menuju kecepatan target.
  const blend = Math.min(1, dt * 10);
  player.speed += (targetSpeed - player.speed) * blend;
  if (Math.abs(player.speed) < 0.05) player.speed = 0;

  player.moving = player.speed !== 0;
  if (!player.moving) {
    syncMesh();
    return false;
  }

  const dir = forwardVector(player.heading);
  const dx = dir.x * player.speed * dt;
  const dz = dir.z * player.speed * dt;
  const moved = moveWithCollision(player.position, dx, dz);

  // Ayunan langkah kaki saat bergerak.
  player.walkTime += dt * Math.abs(player.speed);
  if (player.mesh) {
    const swing = Math.sin(player.walkTime * 2.2) * 0.45;
    const legLeft = player.mesh.getObjectByName('legLeft');
    const legRight = player.mesh.getObjectByName('legRight');
    const armLeft = player.mesh.getObjectByName('armLeft');
    const armRight = player.mesh.getObjectByName('armRight');
    if (legLeft) legLeft.rotation.x = swing;
    if (legRight) legRight.rotation.x = -swing;
    if (armLeft) armLeft.rotation.x = -swing * 0.7;
    if (armRight) armRight.rotation.x = swing * 0.7;
  }
  syncMesh();
  if (player.mesh) player.mesh.position.y = Math.abs(Math.sin(player.walkTime * 2.2)) * 0.04;
  return moved;
}

// Mengemudi satu frame: W gas, S rem / mundur, A/D setir,
// Space handbrake. Mobil yang dikemudikan ikut posisi pemain.
function updateDriving(dt) {
  const car = player.car;
  if (!car) {
    player.onFoot = true;
    return;
  }
  const accel = isDown('w');
  const brake = isDown('s');
  const steerLeft = isDown('a');
  const steerRight = isDown('d');
  const handbrake = isDown('space');

  let speed = getCarSpeed(car);
  const maxSpeed = getCarMaxSpeed(car);
  if (accel) {
    speed = Math.min(maxSpeed, speed + CAR_ACCEL * dt);
  } else if (brake) {
    if (speed > 0.5) speed = Math.max(0, speed - CAR_BRAKE * dt);
    else speed = Math.max(-CAR_REVERSE_SPEED, speed - CAR_ACCEL * 0.6 * dt);
  } else {
    // Gesekan jalan memperlambat mobil tanpa gas.
    const drag = CAR_DRAG * dt;
    if (speed > 0) speed = Math.max(0, speed - drag);
    else if (speed < 0) speed = Math.min(0, speed + drag);
  }
  if (handbrake) {
    const stop = HANDBRAKE_DECEL * dt;
    if (speed > 0) speed = Math.max(0, speed - stop);
    else if (speed < 0) speed = Math.min(0, speed + stop);
  }
  setCarSpeed(car, speed);

  // Setir hanya berpengaruh saat mobil bergerak; mundur membalik setir.
  const speedFactor = Math.min(1, Math.abs(speed) / 8);
  const steerDirection = speed >= 0 ? 1 : -1;
  let steer = 0;
  if (steerLeft) steer += 1;
  if (steerRight) steer -= 1;
  const heading = getCarHeading(car) + steer * CAR_STEER_SPEED * speedFactor * steerDirection * dt;
  setCarHeading(car, heading);
  player.heading = heading;

  const dir = forwardVector(heading);
  const dx = dir.x * speed * dt;
  const dz = dir.z * speed * dt;
  const carPos = carPosition(car);
  if (carPos) {
    const oldX = carPos.x;
    const oldZ = carPos.z;
    const moved = moveWithCollision(carPos, dx, dz);
    if (!moved) {
      // Menabrak dinding atau bangunan: mobil berhenti.
      setCarSpeed(car, 0);
      carPos.x = oldX;
      carPos.z = oldZ;
    }
    player.position.set(carPos.x, 0, carPos.z);
  }
  player.speed = getCarSpeed(car);
  player.moving = Math.abs(player.speed) > 0.1;
  syncCarMesh(car);
  syncMesh();
}

// Update pemain tiap frame. Dipanggil modul utama saat keadaan bermain.
// Bila sedang mengemudi, menggerakkan mobil; bila jalan kaki, berjalan.
export function updatePlayer(dt) {
  if (player.health <= 0) {
    player.speed = 0;
    player.moving = false;
    return;
  }
  if (player.onFoot || !player.car) updateOnFoot(dt);
  else updateDriving(dt);
}

// Cari mobil terdekat dari daftar dalam jarak tertentu. Mobil adalah
// grup adegan dengan userData (kontrak Lane B) atau objek berposisi.
// Kembalikan { car, distance } atau null bila tidak ada yang cukup dekat.
export function findNearestCar(cars, maxDistance) {
  const limit = typeof maxDistance === 'number' ? maxDistance : ENTER_CAR_DISTANCE;
  if (!Array.isArray(cars) || cars.length === 0) return null;
  let best = null;
  let bestDistance = limit;
  for (const car of cars) {
    if (!car) continue;
    const pos = carPosition(car);
    if (!pos || typeof pos.x !== 'number' || typeof pos.z !== 'number') continue;
    const dx = pos.x - player.position.x;
    const dz = pos.z - player.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = car;
    }
  }
  if (!best) return null;
  return { car: best, distance: bestDistance };
}

// Naik ke mobil: pemain bersembunyi, posisi mengikuti mobil.
export function enterCar(car) {
  if (!car || !player.onFoot) return false;
  player.car = car;
  player.onFoot = false;
  const pos = carPosition(car);
  if (pos) {
    player.position.set(pos.x, 0, pos.z);
    player.heading = getCarHeading(car);
  }
  player.speed = getCarSpeed(car);
  if (player.mesh) player.mesh.visible = false;
  return true;
}

// Turun dari mobil ke samping mobil. Bila sisi kanan terhalang, coba
// sisi kiri, lalu belakang mobil.
export function exitCar() {
  if (player.onFoot || !player.car) return false;
  const car = player.car;
  const heading = getCarHeading(car);
  const pos = carPosition(car);
  const baseX = pos ? pos.x : player.position.x;
  const baseZ = pos ? pos.z : player.position.z;
  const side = { x: Math.cos(heading), z: -Math.sin(heading) };
  const spots = [
    { x: baseX + side.x * 2.4, z: baseZ + side.z * 2.4 },
    { x: baseX - side.x * 2.4, z: baseZ - side.z * 2.4 },
    { x: baseX - Math.sin(heading) * 3, z: baseZ - Math.cos(heading) * 3 },
  ];
  let placed = false;
  for (const spot of spots) {
    if (!blockedAt(spot.x, spot.z)) {
      player.position.set(clampToMap(spot.x), 0, clampToMap(spot.z));
      placed = true;
      break;
    }
  }
  if (!placed) player.position.set(baseX, 0, baseZ);
  setCarSpeed(car, 0);
  player.car = null;
  player.onFoot = true;
  player.speed = 0;
  player.heading = heading;
  if (player.mesh) {
    player.mesh.visible = true;
    syncMesh();
  }
  return true;
}

// Curi mobil: naik ke mobil target lalu naikkan wanted +1 lewat modul
// polisi yang diberikan. Modul polisi boleh kosong — pencurian tetap
// terjadi, hanya wanted tidak naik.
export function stealCar(car, police) {
  if (!car) return false;
  const entered = enterCar(car);
  if (!entered) return false;
  if (police) {
    if (typeof police.addWanted === 'function') police.addWanted(1);
    else if (typeof police.increaseWanted === 'function') police.increaseWanted(1);
    else if (typeof police.wanted === 'number') police.wanted = Math.min(5, police.wanted + 1);
  }
  return true;
}

// Aksi tombol E: bila mengemudi, turun; bila jalan kaki dan ada mobil
// dekat, curi / naiki mobil itu. Kembalikan 'enter', 'exit', atau null.
export function tryEnterExitCar(cars, police) {
  if (!player.onFoot) return exitCar() ? 'exit' : null;
  const found = findNearestCar(cars, ENTER_CAR_DISTANCE);
  if (!found) return null;
  return stealCar(found.car, police) ? 'enter' : null;
}

// Kurangi nyawa pemain. Kembalikan true bila nyawa habis (mati).
export function damagePlayer(amount) {
  if (typeof amount !== 'number' || amount <= 0) return player.health <= 0;
  player.health = Math.max(0, player.health - amount);
  return player.health <= 0;
}

// Pulihkan nyawa, tidak melebihi maksimum.
export function healPlayer(amount) {
  if (typeof amount !== 'number' || amount <= 0) return player.health;
  player.health = Math.min(player.maxHealth, player.health + amount);
  return player.health;
}

// Tambah uang pemain (hadiah misi memakai ini).
export function addMoney(amount) {
  if (typeof amount !== 'number') return player.money;
  player.money += amount;
  return player.money;
}

// Ganti senjata aktif: 'fists' (tinju, tombol 1) atau 'pistol' (tombol 2).
export function setWeapon(name) {
  if (name === 'fists' || name === 'pistol') player.weapon = name;
  return player.weapon;
}

export function getWeapon() {
  return player.weapon;
}

// Pindahkan pemain ke koordinat (dipakai antarmuka debug). Bila sedang
// mengemudi, mobil ikut berpindah.
export function teleportPlayer(x, z) {
  const nx = clampToMap(typeof x === 'number' ? x : player.position.x);
  const nz = clampToMap(typeof z === 'number' ? z : player.position.z);
  player.position.set(nx, 0, nz);
  player.speed = 0;
  if (player.car) {
    const pos = carPosition(player.car);
    if (pos) pos.set(nx, 0, nz);
    setCarSpeed(player.car, 0);
    syncCarMesh(player.car);
  }
  syncMesh();
  return { x: player.position.x, z: player.position.z };
}

// Kembalikan pemain ke titik awal distrik Pasar Lama dengan nyawa penuh,
// keluar dari mobil bila sedang mengemudi.
export function resetPlayer(startX, startZ) {
  if (player.car) {
    setCarSpeed(player.car, 0);
    player.car = null;
  }
  player.onFoot = true;
  if (player.mesh) player.mesh.visible = true;
  player.health = player.maxHealth;
  player.speed = 0;
  player.walkTime = 0;
  teleportPlayer(
    typeof startX === 'number' ? startX : START_X,
    typeof startZ === 'number' ? startZ : START_Z,
  );
  return player;
}

// Kecepatan pemain dalam kilometer per jam untuk HUD.
export function getSpeedKmh() {
  return Math.abs(player.speed) * 3.6;
}

// Ringkasan keadaan pemain untuk debug dan HUD.
export function getPlayerState() {
  return {
    x: player.position.x,
    z: player.position.z,
    heading: player.heading,
    speed: player.speed,
    speedKmh: getSpeedKmh(),
    health: player.health,
    maxHealth: player.maxHealth,
    money: player.money,
    weapon: player.weapon,
    onFoot: player.onFoot,
    inCar: !player.onFoot,
  };
}
