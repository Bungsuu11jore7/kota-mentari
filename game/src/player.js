// KOTA MENTARI — modul pemain: Raka Pratama, kurir kota.
// Keadaan: jalan kaki atau di mobil, posisi, arah, kecepatan, nyawa,
// uang, senjata tinju/pistol. Kemeja oranye, celana gelap.
// Jalan kaki 6 (lari 10 dengan Shift), mengemudi sampai 30.
// E masuk/keluar/curi mobil (curi menaikkan wanted +1).
// Uang tinggal di field uang; money adalah alias dari uang.

import * as ConfigMod from './config.js';
import { isDown, isPressed } from './input.js';

function cfgVal(names, fallback) {
  const sources = [ConfigMod, ConfigMod.default, ConfigMod.CONFIG, ConfigMod.GameConfig];
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const name of names) {
      const value = src[name];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
  }
  return fallback;
}

const WALK_SPEED = cfgVal(['WALK_SPEED', 'walkSpeed', 'PLAYER_WALK_SPEED'], 6);
const RUN_SPEED = cfgVal(['RUN_SPEED', 'runSpeed', 'PLAYER_RUN_SPEED'], 10);
const DRIVE_MAX_SPEED = cfgVal(['DRIVE_MAX_SPEED', 'driveMaxSpeed', 'MAX_DRIVE_SPEED'], 30);
const DRIVE_REVERSE_SPEED = cfgVal(['DRIVE_REVERSE_SPEED', 'driveReverseSpeed'], 8);
const DRIVE_ACCEL = cfgVal(['DRIVE_ACCEL', 'driveAccel', 'CAR_ACCEL'], 16);
const TURN_SPEED = cfgVal(['TURN_SPEED', 'turnSpeed', 'PLAYER_TURN_SPEED'], 2.4);
const PLAYER_HEALTH = cfgVal(['PLAYER_HEALTH', 'playerHealth', 'MAX_HEALTH'], 100);
const ENTER_RADIUS = cfgVal(['ENTER_RADIUS', 'enterRadius', 'CAR_ENTER_RADIUS'], 4.5);
const WORLD_LIMIT = cfgVal(['WORLD_LIMIT', 'worldLimit', 'MAP_LIMIT', 'MAP_SIZE'], 490);

export function createPlayer(spawnX, spawnZ) {
  const startX = typeof spawnX === 'number' ? spawnX : 0;
  const startZ = typeof spawnZ === 'number' ? spawnZ : 0;
  const player = {
    x: startX,
    y: 0,
    z: startZ,
    angle: 0,
    speed: 0,
    health: PLAYER_HEALTH,
    maxHealth: PLAYER_HEALTH,
    uang: 0,
    weapon: 'Tinju',
    inCar: false,
    car: null,
    carHeading: 0,
    mesh: null,
  };
  Object.defineProperty(player, 'money', {
    get() {
      return player.uang;
    },
    set(value) {
      player.uang = value;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(player, 'heading', {
    get() {
      return player.angle;
    },
    set(value) {
      player.angle = value;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(player, 'position', {
    get() {
      return { x: player.x, y: player.y, z: player.z };
    },
    enumerable: true,
    configurable: true,
  });
  return player;
}

export function getCarHeading(player) {
  if (!player) return 0;
  if (player.car && typeof player.car.heading === 'number') return player.car.heading;
  return player.carHeading || 0;
}

export function setCarHeading(player, heading) {
  if (!player) return 0;
  const value = typeof heading === 'number' ? heading : 0;
  player.carHeading = value;
  if (player.car) player.car.heading = value;
  player.angle = value;
  return value;
}

export function addMoney(player, amount) {
  if (!player) return 0;
  const value = typeof amount === 'number' ? amount : 0;
  player.uang += value;
  return player.uang;
}

export function damagePlayer(player, amount) {
  if (!player) return false;
  const value = typeof amount === 'number' ? amount : 0;
  player.health = Math.max(0, player.health - value);
  return player.health <= 0;
}

export function healPlayer(player, amount) {
  if (!player) return 0;
  player.health = Math.min(player.maxHealth, player.health + (amount || 0));
  return player.health;
}

export function resetPlayer(player, spawnX, spawnZ) {
  if (!player) return null;
  player.x = typeof spawnX === 'number' ? spawnX : 0;
  player.y = 0;
  player.z = typeof spawnZ === 'number' ? spawnZ : 0;
  player.angle = 0;
  player.speed = 0;
  player.health = player.maxHealth;
  player.uang = 0;
  player.weapon = 'Tinju';
  player.inCar = false;
  player.car = null;
  player.carHeading = 0;
  if (player.mesh) {
    player.mesh.visible = true;
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = 0;
  }
  return player;
}

function isBlockedAt(world, x, z) {
  if (!world || typeof world.isBlocked !== 'function') return false;
  try {
    return !!world.isBlocked(x, z);
  } catch (err) {
    return false;
  }
}

function nearestCar(player, cars) {
  if (!Array.isArray(cars) || cars.length === 0) return null;
  let best = null;
  let bestDist = ENTER_RADIUS;
  for (const car of cars) {
    if (!car) continue;
    const cx = typeof car.x === 'number' ? car.x : 0;
    const cz = typeof car.z === 'number' ? car.z : 0;
    const dist = Math.hypot(player.x - cx, player.z - cz);
    if (dist <= bestDist) {
      bestDist = dist;
      best = car;
    }
  }
  return best;
}

export function enterCar(player, car, ctx) {
  if (!player || !car) return false;
  const wasStolen = car.stolen === true;
  setCarHeading(player, typeof car.heading === 'number' ? car.heading : player.angle);
  player.inCar = true;
  player.car = car;
  player.speed = 0;
  car.stolen = true;
  car.driver = player;
  if (player.mesh) player.mesh.visible = false;
  if (!wasStolen && ctx && typeof ctx.addWanted === 'function') {
    try {
      ctx.addWanted(1);
    } catch (err) {
      // Wanted naik sekali per mobil; kegagalan di sini tidak boleh mematikan gerak.
    }
  }
  if (!wasStolen && ctx && typeof ctx.showToast === 'function') {
    try {
      ctx.showToast('Mobil dicuri! Polisi mengejarmu.');
    } catch (err) {
      // Toast tidak boleh mematikan gerak.
    }
  }
  return true;
}

export function exitCar(player, ctx) {
  if (!player || !player.inCar) return false;
  const car = player.car;
  const heading = getCarHeading(player);
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  const baseX = car ? car.x : player.x;
  const baseZ = car ? car.z : player.z;
  player.x = baseX + rightX * 2.4;
  player.z = baseZ + rightZ * 2.4;
  player.angle = heading;
  player.speed = 0;
  player.inCar = false;
  player.car = null;
  if (player.mesh) {
    player.mesh.visible = true;
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.angle;
  }
  if (ctx && typeof ctx.onExitCar === 'function') {
    try {
      ctx.onExitCar(car);
    } catch (err) {
      // Abaikan.
    }
  }
  return true;
}

export function stealCar(player, car, ctx) {
  return enterCar(player, car, ctx);
}

function updateOnFoot(player, dt, world) {
  let turn = 0;
  if (isDown('KeyA')) turn += 1;
  if (isDown('KeyD')) turn -= 1;
  player.angle += turn * TURN_SPEED * dt;
  let move = 0;
  if (isDown('KeyW')) move += 1;
  if (isDown('KeyS')) move -= 0.6;
  const running = isDown('ShiftLeft') || isDown('ShiftRight');
  const topSpeed = running ? RUN_SPEED : WALK_SPEED;
  const targetSpeed = move * topSpeed;
  const blend = Math.min(1, dt * 10);
  player.speed += (targetSpeed - player.speed) * blend;
  if (Math.abs(player.speed) < 0.01) player.speed = 0;
  // Arah maju: komponen x dari sinus sudut, komponen z dari kosinus sudut.
  const forwardX = Math.sin(player.angle);
  const forwardZ = Math.cos(player.angle);
  const nextX = player.x + forwardX * player.speed * dt;
  const nextZ = player.z + forwardZ * player.speed * dt;
  const clampedX = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nextX));
  const clampedZ = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nextZ));
  if (!isBlockedAt(world, clampedX, clampedZ)) {
    player.x = clampedX;
    player.z = clampedZ;
  } else if (!isBlockedAt(world, clampedX, player.z)) {
    player.x = clampedX;
  } else if (!isBlockedAt(world, player.x, clampedZ)) {
    player.z = clampedZ;
  } else {
    player.speed = 0;
  }
  if (player.mesh) {
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.angle;
    player.mesh.visible = true;
  }
}

function updateDriving(player, dt, world) {
  const car = player.car;
  let throttle = 0;
  if (isDown('KeyW')) throttle += 1;
  if (isDown('KeyS')) throttle -= 1;
  player.speed += throttle * DRIVE_ACCEL * dt;
  if (isDown('Space')) {
    player.speed *= Math.max(0, 1 - 6 * dt);
    if (Math.abs(player.speed) < 0.2) player.speed = 0;
  }
  if (throttle === 0) {
    player.speed *= Math.max(0, 1 - 0.5 * dt);
    if (Math.abs(player.speed) < 0.05) player.speed = 0;
  }
  if (player.speed > DRIVE_MAX_SPEED) player.speed = DRIVE_MAX_SPEED;
  if (player.speed < -DRIVE_REVERSE_SPEED) player.speed = -DRIVE_REVERSE_SPEED;
  let steer = 0;
  if (isDown('KeyA')) steer += 1;
  if (isDown('KeyD')) steer -= 1;
  const steerPower = Math.min(1, Math.abs(player.speed) / 8);
  const direction = player.speed >= 0 ? 1 : -1;
  const heading = getCarHeading(player) + steer * TURN_SPEED * 0.85 * steerPower * direction * dt;
  setCarHeading(player, heading);
  // Arah maju: komponen x dari sinus sudut, komponen z dari kosinus sudut.
  const forwardX = Math.sin(player.angle);
  const forwardZ = Math.cos(player.angle);
  const nextX = player.x + forwardX * player.speed * dt;
  const nextZ = player.z + forwardZ * player.speed * dt;
  const clampedX = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nextX));
  const clampedZ = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nextZ));
  if (!isBlockedAt(world, clampedX, clampedZ)) {
    player.x = clampedX;
    player.z = clampedZ;
  } else {
    player.speed = 0;
  }
  if (car) {
    car.x = player.x;
    car.z = player.z;
    car.heading = player.angle;
    car.speed = player.speed;
    if (car.mesh) {
      car.mesh.position.set(player.x, 0, player.z);
      car.mesh.rotation.y = player.angle;
    }
  }
  if (player.mesh) player.mesh.visible = false;
}

export function updatePlayer(player, dt, world, ctx) {
  if (!player || !dt || dt <= 0) return player;
  if (isPressed('KeyE')) {
    if (player.inCar) {
      exitCar(player, ctx);
    } else {
      const cars = (ctx && Array.isArray(ctx.cars)) ? ctx.cars : [];
      const car = nearestCar(player, cars);
      if (car) enterCar(player, car, ctx);
    }
  }
  if (player.inCar) {
    updateDriving(player, dt, world);
  } else {
    updateOnFoot(player, dt, world);
  }
  return player;
}

export function buildPlayerMesh(three) {
  if (!three || typeof three.Group !== 'function') return null;
  const group = new three.Group();
  const orange = 0xff7a1a;
  const dark = 0x232a33;
  const skin = 0xe8b98a;
  function box(w, h, d, color, x, y, z) {
    const mesh = new three.Mesh(
      new three.BoxGeometry(w, h, d),
      new three.MeshStandardMaterial({ color }),
    );
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  box(0.34, 0.78, 0.3, dark, -0.2, 0.39, 0);
  box(0.34, 0.78, 0.3, dark, 0.2, 0.39, 0);
  box(0.78, 0.92, 0.42, orange, 0, 1.24, 0);
  box(0.22, 0.8, 0.24, orange, -0.52, 1.22, 0);
  box(0.22, 0.8, 0.24, orange, 0.52, 1.22, 0);
  box(0.42, 0.46, 0.4, skin, 0, 1.95, 0);
  box(0.46, 0.14, 0.44, 0x1a1a1a, 0, 2.2, 0);
  group.traverse((child) => {
    if (child && child.isMesh) child.castShadow = true;
  });
  return group;
}
