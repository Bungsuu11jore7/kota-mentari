// KOTA MENTARI — player.js
// Pemain: Raka Pratama, kurir. Jalan kaki (WASD + Shift lari), mengemudi,
// masuk / keluar / curi mobil (E), nyawa 100. Uang tinggal di pemain
// (field uang; money hanya cermin dengan nilai yang sama).

export function createPlayer() {
  return {
    name: 'Raka Pratama',
    x: 0,
    z: 0,
    angle: 0,
    heading: 0,
    speed: 0,
    speedKmh: 0,
    carSpeed: 0,
    health: 100,
    uang: 0,
    money: 0,
    inCar: false,
    vehicle: null,
    onFoot: true,
    running: false,
    dead: false,
    lastDamageAt: 0,
  };
}

export function addMoney(player, amount) {
  if (!player) return 0;
  player.uang = (player.uang || 0) + amount;
  player.money = player.uang;
  return player.uang;
}

export function damagePlayer(player, amount) {
  if (!player || player.dead) return;
  player.health = Math.max(0, (player.health || 100) - amount);
  player.lastDamageAt = Date.now();
  if (player.health <= 0) {
    player.dead = true;
  }
}

export function healPlayer(player, amount) {
  if (!player || player.dead) return;
  player.health = Math.min(100, (player.health || 0) + amount);
}

function keyHeld(input, codes) {
  if (!input) return false;
  if (input.keys && typeof input.keys.has === 'function') {
    return codes.some((c) => input.keys.has(c));
  }
  return codes.some((c) => input[c] === true);
}

function keyPressed(input, codes) {
  if (!input) return false;
  if (input.pressed && typeof input.pressed.has === 'function') {
    return codes.some((c) => input.pressed.has(c));
  }
  return false;
}

function listVehicles(ctx) {
  if (!ctx) return [];
  if (Array.isArray(ctx.vehicles)) return ctx.vehicles;
  if (ctx.world && Array.isArray(ctx.world.vehicles)) return ctx.world.vehicles;
  return [];
}

function raiseWanted(ctx, amount) {
  if (!ctx) return;
  try {
    if (typeof ctx.addWanted === 'function' && ctx.policeState) {
      ctx.addWanted(ctx.policeState, amount, ctx);
      return;
    }
  } catch (e) {
    // lanjut ke fallback langsung
  }
  if (ctx.policeState && typeof ctx.policeState.wanted === 'number') {
    ctx.policeState.wanted = Math.min(5, ctx.policeState.wanted + amount);
  }
}

function findNearestVehicle(ctx, x, z, maxDist) {
  const cars = listVehicles(ctx);
  let best = null;
  let bestDist = maxDist;
  for (const car of cars) {
    if (!car) continue;
    const dx = (car.x || 0) - x;
    const dz = (car.z || 0) - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  if (!best && ctx.missionCar) {
    const car = ctx.missionCar;
    const dx = (car.x || 0) - x;
    const dz = (car.z || 0) - z;
    if (Math.sqrt(dx * dx + dz * dz) < maxDist) best = car;
  }
  return best;
}

function readVehicleHeading(ctx, car) {
  if (!car) return 0;
  try {
    if (ctx && typeof ctx.getVehicleHeading === 'function') {
      const h = ctx.getVehicleHeading(car);
      if (typeof h === 'number') return h;
    }
  } catch (e) {
    // pakai field langsung
  }
  return typeof car.heading === 'number' ? car.heading : 0;
}

function writeVehicleHeading(ctx, car, heading) {
  if (!car) return;
  try {
    if (ctx && typeof ctx.setVehicleHeading === 'function') {
      ctx.setVehicleHeading(car, heading);
    }
  } catch (e) {
    // tetap tulis field langsung di bawah
  }
  car.heading = heading;
}

function enterVehicle(player, car, ctx) {
  player.inCar = true;
  player.onFoot = false;
  player.vehicle = car;
  car.driver = player;
  car.occupied = true;
  const heading = readVehicleHeading(ctx, car);
  player.angle = heading;
  player.heading = heading;
  player.x = car.x || 0;
  player.z = car.z || 0;
  player.carSpeed = typeof car.speed === 'number' ? car.speed : 0;
  if (!car.stolen && car.owner !== 'player') {
    car.stolen = true;
    raiseWanted(ctx, 1);
    if (ctx && typeof ctx.onCarStolen === 'function') {
      try {
        ctx.onCarStolen(car, ctx);
      } catch (e) {
        // misi tidak boleh gagal karena notifikasi curi mobil
      }
    }
    if (ctx && typeof ctx.showToast === 'function') {
      ctx.showToast('Mobil dicuri — wanted naik!');
    }
  }
}

function exitVehicle(player, ctx) {
  const car = player.vehicle;
  if (!car) {
    player.inCar = false;
    player.onFoot = true;
    return;
  }
  const heading = readVehicleHeading(ctx, car);
  player.angle = heading;
  player.heading = heading;
  // Keluar di samping mobil (tegak lurus arah maju).
  const sideX = Math.cos(heading);
  const sideZ = -Math.sin(heading);
  player.x = (car.x || 0) + sideX * 2.4;
  player.z = (car.z || 0) + sideZ * 2.4;
  player.inCar = false;
  player.onFoot = true;
  player.vehicle = null;
  player.carSpeed = 0;
  player.speed = 0;
  player.speedKmh = 0;
  car.driver = null;
  car.occupied = false;
}

function updateOnFoot(player, input, dt, ctx) {
  const turn = 2.4 * dt;
  if (keyHeld(input, ['KeyA', 'ArrowLeft'])) player.angle -= turn;
  if (keyHeld(input, ['KeyD', 'ArrowRight'])) player.angle += turn;
  player.heading = player.angle;
  const running = keyHeld(input, ['ShiftLeft', 'ShiftRight']);
  player.running = running;
  let fwd = 0;
  if (keyHeld(input, ['KeyW', 'ArrowUp'])) fwd += 1;
  if (keyHeld(input, ['KeyS', 'ArrowDown'])) fwd -= 0.6;
  const speed = fwd * (running ? 8 : 4.5);
  player.speed = speed;
  player.speedKmh = Math.abs(speed) * 3.6;
  // Arah maju: komponen x dari sinus sudut, komponen z dari kosinus sudut.
  const fx = Math.sin(player.angle);
  const fz = Math.cos(player.angle);
  player.x += fx * speed * dt;
  player.z += fz * speed * dt;
}

function updateInCar(player, input, dt, ctx) {
  const car = player.vehicle;
  if (!car) {
    player.inCar = false;
    player.onFoot = true;
    return;
  }
  let speed = player.carSpeed || 0;
  const accel = 14;
  if (keyHeld(input, ['KeyW', 'ArrowUp'])) speed += accel * dt;
  if (keyHeld(input, ['KeyS', 'ArrowDown'])) {
    speed -= (speed > 0.5 ? 22 : 9) * dt;
  }
  if (keyHeld(input, ['Space'])) speed -= Math.sign(speed) * 26 * dt;
  // Hambatan gelinding pelan.
  if (!keyHeld(input, ['KeyW', 'ArrowUp']) && !keyHeld(input, ['KeyS', 'ArrowDown'])) {
    speed -= Math.sign(speed) * 4 * dt;
    if (Math.abs(speed) < 0.3) speed = 0;
  }
  speed = Math.max(-8, Math.min(28, speed));
  const steerInput =
    (keyHeld(input, ['KeyD', 'ArrowRight']) ? 1 : 0) -
    (keyHeld(input, ['KeyA', 'ArrowLeft']) ? 1 : 0);
  const steerFactor = Math.max(0.25, Math.min(1, Math.abs(speed) / 12));
  player.angle += steerInput * 1.7 * steerFactor * dt * (speed < 0 ? -1 : 1);
  player.heading = player.angle;
  writeVehicleHeading(ctx, car, player.angle);
  const fx = Math.sin(player.angle);
  const fz = Math.cos(player.angle);
  car.x = (car.x || 0) + fx * speed * dt;
  car.z = (car.z || 0) + fz * speed * dt;
  car.speed = speed;
  player.x = car.x;
  player.z = car.z;
  player.carSpeed = speed;
  player.speed = speed;
  player.speedKmh = Math.abs(speed) * 3.6;
}

export function updatePlayer(player, input, dt, ctx) {
  if (!player) return;
  const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.05) : 1 / 60;
  const context = ctx || null;
  // Cermin uang: money selalu sama dengan uang.
  player.money = player.uang || 0;
  if (player.dead) return;
  if (keyPressed(input, ['KeyE'])) {
    if (player.inCar) {
      exitVehicle(player, context);
    } else {
      const car = findNearestVehicle(context, player.x, player.z, 4.5);
      if (car) enterVehicle(player, car, context);
    }
  }
  if (player.inCar) {
    updateInCar(player, input, step, context);
  } else {
    updateOnFoot(player, input, step, context);
  }
  // Regenerasi nyawa pelan bila sudah lama tidak diserang.
  if (!player.dead && player.health < 100 && Date.now() - (player.lastDamageAt || 0) > 8000) {
    player.health = Math.min(100, player.health + 2 * step);
  }
}

export function getPlayerState(player) {
  if (!player) return null;
  return {
    x: player.x || 0,
    z: player.z || 0,
    angle: player.angle || 0,
    heading: player.heading || player.angle || 0,
    speed: player.speed || 0,
    speedKmh: player.speedKmh || 0,
    health: player.health || 0,
    uang: player.uang || 0,
    money: player.money || player.uang || 0,
    inCar: !!player.inCar,
    vehicle: !!player.vehicle,
    running: !!player.running,
    dead: !!player.dead,
  };
}
