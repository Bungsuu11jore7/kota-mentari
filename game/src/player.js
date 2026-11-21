// KOTA MENTARI — modul pemain: keadaan, gerak jalan kaki, mengemudi,
// masuk / keluar / curi mobil, dan sinkron arah mobil.
// Uang tinggal di field `uang`; `money` adalah alias getter/setter-nya.
// Arah maju: komponen x dari sinus sudut, komponen z dari kosinus sudut.

import * as THREE from '../vendor/three.module.min.js';
import * as configMod from './config.js';
import { isKeyDown, isPressed } from './input.js';

function cfgValue(names, fallback) {
  for (const name of names) {
    if (configMod && typeof configMod[name] !== 'undefined') return configMod[name];
    if (configMod && configMod.default && typeof configMod.default[name] !== 'undefined') {
      return configMod.default[name];
    }
  }
  return fallback;
}

const WALK_SPEED = cfgValue(['WALK_SPEED', 'walkSpeed', 'playerWalkSpeed'], 6);
const RUN_SPEED = cfgValue(['RUN_SPEED', 'runSpeed', 'playerRunSpeed'], 10);
const DRIVE_MAX_SPEED = cfgValue(['DRIVE_MAX_SPEED', 'driveMaxSpeed', 'maxDriveSpeed'], 30);
const DRIVE_REVERSE_SPEED = cfgValue(['DRIVE_REVERSE_SPEED', 'driveReverseSpeed'], 12);
const DRIVE_ACCEL = cfgValue(['DRIVE_ACCEL', 'driveAccel'], 14);
const TURN_RATE = cfgValue(['TURN_RATE', 'turnRate'], 2.4);
const DRIVE_TURN_RATE = cfgValue(['DRIVE_TURN_RATE', 'driveTurnRate'], 1.9);
const PLAYER_HEALTH = cfgValue(['PLAYER_HEALTH', 'playerHealth', 'maxHealth'], 100);
const ENTER_CAR_DISTANCE = cfgValue(['ENTER_CAR_DISTANCE', 'enterCarDistance'], 4.5);

// Buat keadaan pemain baru: jalan kaki, nyawa penuh, uang nol.
export function createPlayer() {
  const player = {
    x: 0,
    y: 0,
    z: 0,
    angle: 0,
    speed: 0,
    health: PLAYER_HEALTH,
    maxHealth: PLAYER_HEALTH,
    uang: 0,
    weapon: 'fists',
    inCar: false,
    car: null,
    carHeading: 0,
    mesh: null,
  };
  Object.defineProperty(player, 'money', {
    get() {
      return this.uang;
    },
    set(value) {
      this.uang = value;
    },
    enumerable: true,
    configurable: true,
  });
  return player;
}

// Arah mobil yang sedang dikemudikan pemain (atau arah mobil terakhir).
export function getCarHeading(player) {
  if (!player) return 0;
  if (player.car && typeof player.car.heading === 'number') return player.car.heading;
  return player.carHeading || 0;
}

// Atur arah mobil dan arah pemain sekaligus (selalu sinkron).
export function setCarHeading(player, heading) {
  if (!player) return;
  player.carHeading = heading;
  if (player.car) player.car.heading = heading;
  player.angle = heading;
}

// Cari mobil terdekat dari posisi pemain di dalam konteks.
function findNearbyCar(player, ctx, maxDistance) {
  if (!ctx) return null;
  if (typeof ctx.getNearbyCar === 'function') {
    return ctx.getNearbyCar(player.x, player.z, maxDistance);
  }
  const cars = ctx.cars || [];
  let best = null;
  let bestDist = maxDistance;
  for (const car of cars) {
    if (!car) continue;
    const dx = car.x - player.x;
    const dz = car.z - player.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) {
      bestDist = dist;
      best = car;
    }
  }
  return best;
}

// Masuk ke mobil: sinkronkan arah mobil dan arah pemain.
export function enterCar(player, car) {
  if (!player || !car) return false;
  player.inCar = true;
  player.car = car;
  car.driver = player;
  setCarHeading(player, typeof car.heading === 'number' ? car.heading : player.angle);
  player.speed = car.speed || 0;
  if (player.mesh) player.mesh.visible = false;
  return true;
}

// Keluar dari mobil: pemain berdiri di sisi mobil, arah tetap sinkron.
export function exitCar(player) {
  if (!player || !player.inCar) return false;
  const car = player.car;
  player.inCar = false;
  player.car = null;
  if (car) {
    car.driver = null;
    car.speed = 0;
    const sideX = Math.cos(player.angle);
    const sideZ = -Math.sin(player.angle);
    player.x = car.x + sideX * 2.6;
    player.z = car.z + sideZ * 2.6;
  }
  player.speed = 0;
  if (player.mesh) player.mesh.visible = true;
  return true;
}

// Curi mobil: tandai curian, naikkan wanted +1 lewat konteks, lalu masuk.
export function stealCar(player, car, ctx) {
  if (!player || !car) return false;
  const firstTheft = !car.stolenByPlayer;
  car.stolen = true;
  car.stolenByPlayer = true;
  if (firstTheft && ctx && typeof ctx.addWanted === 'function') {
    ctx.addWanted(1);
  }
  if (ctx && typeof ctx.showToast === 'function') {
    ctx.showToast('Mobil dicuri! Polisi mengejarmu.');
  }
  const entered = enterCar(player, car);
  // Beri tahu modul misi (Misi 2 menunggu onCarStolen); hook dijaga
  // di missions.js (hanya berlaku saat misi aktif adalah Misi 2).
  if (entered && ctx && typeof ctx.onCarStolen === 'function') {
    ctx.onCarStolen();
  }
  return entered;
}

// Kurangi nyawa pemain; kembalikan nyawa sisa.
export function damagePlayer(player, amount) {
  if (!player) return 0;
  player.health = Math.max(0, (player.health || 0) - amount);
  return player.health;
}

// Tambah nyawa pemain (tidak melebihi maksimum).
export function healPlayer(player, amount) {
  if (!player) return 0;
  player.health = Math.min(player.maxHealth || 100, (player.health || 0) + amount);
  return player.health;
}

export function isPlayerAlive(player) {
  return !!player && (player.health || 0) > 0;
}

function updateWalking(player, dt) {
  const running =
    isKeyDown('ShiftLeft') || isKeyDown('ShiftRight') || isKeyDown('Shift');
  const maxSpeed = running ? RUN_SPEED : WALK_SPEED;
  let move = 0;
  if (isKeyDown('KeyW') || isKeyDown('ArrowUp')) move += 1;
  if (isKeyDown('KeyS') || isKeyDown('ArrowDown')) move -= 1;
  let turn = 0;
  if (isKeyDown('KeyA') || isKeyDown('ArrowLeft')) turn += 1;
  if (isKeyDown('KeyD') || isKeyDown('ArrowRight')) turn -= 1;
  player.angle += turn * TURN_RATE * dt;
  const targetSpeed = move * maxSpeed;
  player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 10);
  player.x += Math.sin(player.angle) * player.speed * dt;
  player.z += Math.cos(player.angle) * player.speed * dt;
}

function updateDriving(player, dt) {
  const car = player.car;
  if (!car) {
    player.inCar = false;
    return;
  }
  let throttle = 0;
  if (isKeyDown('KeyW') || isKeyDown('ArrowUp')) throttle += 1;
  if (isKeyDown('KeyS') || isKeyDown('ArrowDown')) throttle -= 0.6;
  const handbrake = isKeyDown('Space');
  if (handbrake) {
    car.speed -= car.speed * Math.min(1, dt * 6);
    if (Math.abs(car.speed) < 0.2) car.speed = 0;
  } else {
    car.speed += throttle * DRIVE_ACCEL * dt;
    car.speed -= car.speed * dt * 0.35;
    if (car.speed > DRIVE_MAX_SPEED) car.speed = DRIVE_MAX_SPEED;
    if (car.speed < -DRIVE_REVERSE_SPEED) car.speed = -DRIVE_REVERSE_SPEED;
  }
  let steer = 0;
  if (isKeyDown('KeyA') || isKeyDown('ArrowLeft')) steer += 1;
  if (isKeyDown('KeyD') || isKeyDown('ArrowRight')) steer -= 1;
  const speedFactor = Math.min(1, Math.abs(car.speed) / 8);
  const direction = car.speed >= 0 ? 1 : -1;
  car.heading = (car.heading || 0) + steer * DRIVE_TURN_RATE * dt * speedFactor * direction;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  player.x = car.x;
  player.z = car.z;
  player.angle = car.heading;
  player.carHeading = car.heading;
  player.speed = car.speed;
}

function handleEnterExit(player, ctx) {
  if (!isPressed('KeyE') && !isPressed('e')) return;
  if (player.inCar) {
    exitCar(player);
    return;
  }
  const car = findNearbyCar(player, ctx, ENTER_CAR_DISTANCE);
  if (!car) {
    if (ctx && typeof ctx.showToast === 'function') {
      ctx.showToast('Tidak ada mobil di dekatmu.');
    }
    return;
  }
  if (car.stolenByPlayer || car.isPlayerCar) {
    enterCar(player, car);
  } else {
    stealCar(player, car, ctx);
  }
}

function syncPlayerMesh(player) {
  if (!player.mesh) return;
  player.mesh.visible = !player.inCar;
  if (player.inCar) return;
  player.mesh.position.set(player.x, player.y || 0, player.z);
  player.mesh.rotation.y = player.angle;
}

// Perbarui pemain tiap frame: jalan kaki atau mengemudi, plus tombol E.
export function updatePlayer(player, dt, ctx) {
  if (!player || !isPlayerAlive(player)) return;
  if (player.inCar && player.car) {
    updateDriving(player, dt);
  } else {
    updateWalking(player, dt);
  }
  handleEnterExit(player, ctx);
  syncPlayerMesh(player);
}

// Bentuk 3D pemain jalan kaki: kemeja oranye, celana gelap.
export function buildPlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5f });
  const shirt = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x22242e });
  const shoes = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.08;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skin);
  head.position.y = 1.66;
  group.add(head);

  const legLeft = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.28), pants);
  legLeft.position.set(-0.16, 0.36, 0);
  group.add(legLeft);

  const legRight = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.28), pants);
  legRight.position.set(0.16, 0.36, 0);
  group.add(legRight);

  const armLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armLeft.position.set(-0.42, 1.08, 0);
  group.add(armLeft);

  const armRight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armRight.position.set(0.42, 1.08, 0);
  group.add(armRight);

  const shoeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.4), shoes);
  shoeLeft.position.set(-0.16, 0.06, 0.04);
  group.add(shoeLeft);

  const shoeRight = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.4), shoes);
  shoeRight.position.set(0.16, 0.06, 0.04);
  group.add(shoeRight);

  return group;
}

// Alias nama pembangun mesh pemain.
export function createPlayerMesh() {
  return buildPlayerMesh();
}
