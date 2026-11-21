// KOTA MENTARI — keadaan pemain Raka Pratama: jalan kaki, mengemudi,
// masuk/keluar mobil, curi mobil. Arah maju: x dari sinus sudut,
// z dari kosinus sudut. Uang tinggal di field uang; money adalah alias.
import * as ConfigMod from './config.js';
import { isKeyDown, isKeyPressed } from './input.js';

const CFG = ConfigMod.CONFIG || ConfigMod.default || {};
const WALK_SPEED = typeof CFG.walkSpeed === 'number' ? CFG.walkSpeed : 6;
const RUN_SPEED = typeof CFG.runSpeed === 'number' ? CFG.runSpeed : 10;
const DRIVE_MAX = typeof CFG.driveMaxSpeed === 'number' ? CFG.driveMaxSpeed : 30;
const DRIVE_ACCEL = typeof CFG.driveAccel === 'number' ? CFG.driveAccel : 14;
const WORLD_BOUND = 520;

export function createPlayer() {
  const player = {
    x: 0,
    z: 0,
    angle: 0,
    speed: 0,
    health: 100,
    uang: 0,
    weapon: 'fists',
    inCar: false,
    car: null,
    carHeading: 0,
    moving: false,
    running: false,
  };
  Object.defineProperty(player, 'money', {
    get() { return player.uang; },
    set(v) { player.uang = v; },
    enumerable: true,
    configurable: true,
  });
  return player;
}

export function addUang(player, amount) {
  player.uang += amount;
  return player.uang;
}

function clampToWorld(player) {
  if (player.x > WORLD_BOUND) player.x = WORLD_BOUND;
  if (player.x < -WORLD_BOUND) player.x = -WORLD_BOUND;
  if (player.z > WORLD_BOUND) player.z = WORLD_BOUND;
  if (player.z < -WORLD_BOUND) player.z = -WORLD_BOUND;
}

function carX(car) {
  if (typeof car.x === 'number') return car.x;
  if (car.position && typeof car.position.x === 'number') return car.position.x;
  return 0;
}

function carZ(car) {
  if (typeof car.z === 'number') return car.z;
  if (car.position && typeof car.position.z === 'number') return car.position.z;
  return 0;
}

function carAngleOf(car) {
  if (typeof car.angle === 'number') return car.angle;
  if (typeof car.heading === 'number') return car.heading;
  return 0;
}

export function getCarHeading(player) {
  if (player.car) return carAngleOf(player.car);
  return player.carHeading || 0;
}

export function setCarHeading(player, heading) {
  player.carHeading = heading;
  if (player.car) {
    player.car.angle = heading;
    player.car.heading = heading;
  }
  return heading;
}

function syncCarToPlayer(player) {
  const car = player.car;
  if (!car) return;
  car.x = player.x;
  car.z = player.z;
  car.angle = player.angle;
  car.heading = player.angle;
  if (car.position) {
    car.position.x = player.x;
    car.position.z = player.z;
  }
}

function collectCars(ctx) {
  const cars = [];
  if (ctx && ctx.traffic && Array.isArray(ctx.traffic.cars)) {
    for (const c of ctx.traffic.cars) cars.push(c);
  }
  if (ctx && typeof ctx.getMissionCar === 'function') {
    try {
      const mc = ctx.getMissionCar();
      if (mc) cars.push(mc);
    } catch (err) { /* abaikan */ }
  }
  if (ctx && typeof ctx.getCars === 'function') {
    try {
      const extra = ctx.getCars();
      if (Array.isArray(extra)) {
        for (const c of extra) cars.push(c);
      }
    } catch (err) { /* abaikan */ }
  }
  return cars;
}

function findNearestCar(player, ctx, radius) {
  let best = null;
  let bestD = Infinity;
  for (const car of collectCars(ctx)) {
    const dx = carX(car) - player.x;
    const dz = carZ(car) - player.z;
    const d = Math.hypot(dx, dz);
    if (d < radius && d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

export function enterCar(player, car, ctx) {
  if (!car) return false;
  if (!car.stolen) {
    car.stolen = true;
    if (ctx && typeof ctx.addWanted === 'function') {
      try { ctx.addWanted(1); } catch (err) { /* abaikan */ }
    }
    if (ctx && typeof ctx.showToast === 'function') {
      try { ctx.showToast('Mobil dicuri! Polisi waspada.'); } catch (err) { /* abaikan */ }
    }
  }
  player.inCar = true;
  player.car = car;
  player.angle = carAngleOf(car);
  player.carHeading = player.angle;
  setCarHeading(player, player.angle);
  player.x = carX(car);
  player.z = carZ(car);
  player.speed = 0;
  return true;
}

export function exitCar(player) {
  if (!player.inCar || !player.car) return false;
  const car = player.car;
  player.angle = carAngleOf(car);
  const cx = carX(car);
  const cz = carZ(car);
  // Turun di sisi mobil (tegak lurus arah maju).
  player.x = cx + Math.cos(player.angle) * 2.4;
  player.z = cz - Math.sin(player.angle) * 2.4;
  player.speed = 0;
  player.inCar = false;
  player.car = null;
  return true;
}

function updateDriving(player, dt, ctx) {
  const car = player.car;
  if (!car) {
    player.inCar = false;
    return;
  }
  const accel = (isKeyDown('KeyW') || isKeyDown('ArrowUp') ? 1 : 0)
    - (isKeyDown('KeyS') || isKeyDown('ArrowDown') ? 1 : 0);
  const steer = (isKeyDown('KeyA') || isKeyDown('ArrowLeft') ? 1 : 0)
    - (isKeyDown('KeyD') || isKeyDown('ArrowRight') ? 1 : 0);
  const handbrake = isKeyDown('Space');
  if (accel > 0) {
    player.speed += DRIVE_ACCEL * dt;
  } else if (accel < 0) {
    player.speed -= DRIVE_ACCEL * 0.7 * dt;
  } else {
    player.speed -= player.speed * 1.2 * dt;
  }
  if (handbrake) player.speed -= player.speed * 4 * dt;
  if (player.speed > DRIVE_MAX) player.speed = DRIVE_MAX;
  if (player.speed < -9) player.speed = -9;
  if (Math.abs(player.speed) < 0.05 && accel === 0) player.speed = 0;
  const dir = player.speed >= 0 ? 1 : -1;
  player.angle += steer * 1.9 * dt * Math.min(1, Math.abs(player.speed) / 8) * dir;
  player.carHeading = player.angle;
  player.x += Math.sin(player.angle) * player.speed * dt;
  player.z += Math.cos(player.angle) * player.speed * dt;
  clampToWorld(player);
  syncCarToPlayer(player);
  if (isKeyPressed('KeyE')) exitCar(player);
}

export function updatePlayer(player, dt, ctx) {
  if (!player || player.health <= 0) return;
  if (player.inCar) {
    updateDriving(player, dt, ctx);
    return;
  }
  const fwd = (isKeyDown('KeyW') || isKeyDown('ArrowUp') ? 1 : 0)
    - (isKeyDown('KeyS') || isKeyDown('ArrowDown') ? 0.6 : 0);
  const turn = (isKeyDown('KeyA') || isKeyDown('ArrowLeft') ? 1 : 0)
    - (isKeyDown('KeyD') || isKeyDown('ArrowRight') ? 1 : 0);
  const running = isKeyDown('ShiftLeft') || isKeyDown('ShiftRight');
  const target = running ? RUN_SPEED : WALK_SPEED;
  player.running = running && fwd !== 0;
  if (turn !== 0) player.angle += turn * 2.4 * dt;
  const sp = fwd !== 0 ? target * fwd : 0;
  player.speed += (sp - player.speed) * Math.min(1, dt * 10);
  player.moving = Math.abs(player.speed) > 0.3;
  player.x += Math.sin(player.angle) * player.speed * dt;
  player.z += Math.cos(player.angle) * player.speed * dt;
  clampToWorld(player);
  if (isKeyPressed('KeyE')) {
    const car = findNearestCar(player, ctx, 4);
    if (car) enterCar(player, car, ctx);
  }
}
