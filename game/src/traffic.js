// KOTA MENTARI — pengelola traffic (Lane B, v9)
// 28 mobil + 45 pejalan kaki, digerakkan tiap frame.
// PERBAIKAN WAJIB v9: createTraffic WAJIB menerima world dan scene dan
// membangun 28 mobil + 45 pejalan kaki NYATA; bila dipanggil tanpa
// world/scene WAJIB throw — TIDAK BOLEH mengembalikan fallback kosong.
// PERBAIKAN WAJIB v9: updateTraffic WAJIB melewati mobil stolen === true.
import * as THREE from '../vendor/three.module.min.js';
import { createCar, createCarState, CAR_COLORS, TARGET_ORANGE } from './vehicles.js';
import { findRoadPath, nearestRoad, isBlocked } from './world.js';

// Jumlah traffic aktif (dari dokumen desain 00-design.md).
export const TRAFFIC_CAR_COUNT = 28;
export const TRAFFIC_PED_COUNT = 45;
export const CAR_COUNT = TRAFFIC_CAR_COUNT;
export const PED_COUNT = TRAFFIC_PED_COUNT;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inDockCorridor(x, z) {
  return x >= 370 && x <= 500 && z >= 315 && z <= 385;
}

// Pembuat state traffic: membangun 28 mobil + 45 pejalan kaki NYATA dan
// menambahkan semua mesh-nya ke scene. WAJIB dipanggil SETELAH world siap.
export function createTraffic(world, scene) {
  if (!world || !scene || typeof scene.add !== 'function') {
    throw new Error('createTraffic: world dan scene wajib diberikan (KOTA MENTARI)');
  }
  if (!Array.isArray(world.nodes) || !Array.isArray(world.roadLines)) {
    throw new Error('createTraffic: world tidak lengkap (KOTA MENTARI)');
  }
  const rng = mulberry32(7);
  const cars = [];
  const pedestrians = [];

  // --- 28 mobil di jalan, tersebar (tidak menumpuk di satu titik) ---
  const usedSpots = [];
  const farEnough = (x, z) => {
    for (const s of usedSpots) {
      if (Math.hypot(x - s.x, z - s.z) < 25) return false;
    }
    return true;
  };
  let guard = 0;
  while (cars.length < TRAFFIC_CAR_COUNT && guard < 4000) {
    guard++;
    const node = world.nodes[Math.floor(rng() * world.nodes.length)];
    const along = (rng() - 0.5) * 90;
    const horizontal = rng() < 0.5;
    const x = horizontal ? node.x + along : node.x;
    const z = horizontal ? node.z : node.z + along;
    if (Math.abs(x) > 396 || Math.abs(z) > 396) continue;
    if (inDockCorridor(x, z)) continue;
    if (isBlocked(world, x, z)) continue;
    if (!farEnough(x, z)) continue;
    usedSpots.push({ x, z });
    const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    const mesh = createCar(color, 'sedan');
    const heading = horizontal ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : rng() < 0.5 ? 0 : Math.PI;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = createCarState(mesh, x, z, heading);
    car.speed = 8 + rng() * 7;
    car.stolen = false;
    car.active = true;
    // Tujuan acak + jalur jalan dari posisi saat ini.
    const dest = world.nodes[Math.floor(rng() * world.nodes.length)];
    car.path = findRoadPath(world, x, z, dest.x, dest.z);
    car.pathIndex = 0;
    cars.push(car);
  }
  if (cars.length !== TRAFFIC_CAR_COUNT) {
    throw new Error('createTraffic: gagal membangun 28 mobil (KOTA MENTARI)');
  }

  // --- 45 pejalan kaki di trotoar (offset 9 dari garis jalan) ---
  const pedColors = [0xe86a4a, 0x4a7de8, 0x4ae87a, 0xe8d84a, 0x9a4ae8, 0xe84a9a, 0x4ad8e8, 0xd8d8d8];
  const usedPedSpots = [];
  const pedFarEnough = (x, z) => {
    for (const s of usedPedSpots) {
      if (Math.hypot(x - s.x, z - s.z) < 8) return false;
    }
    return true;
  };
  guard = 0;
  while (pedestrians.length < TRAFFIC_PED_COUNT && guard < 4000) {
    guard++;
    const line = world.roadLines[Math.floor(rng() * world.roadLines.length)];
    const along = -380 + rng() * 760;
    const side = rng() < 0.5 ? 9 : -9;
    const horizontal = rng() < 0.5;
    const x = horizontal ? along : line + side;
    const z = horizontal ? line + side : along;
    if (Math.abs(x) > 396 || Math.abs(z) > 396) continue;
    if (inDockCorridor(x, z)) continue;
    if (isBlocked(world, x, z)) continue;
    if (!pedFarEnough(x, z)) continue;
    usedPedSpots.push({ x, z });

    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({
      color: pedColors[Math.floor(rng() * pedColors.length)],
    });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.32), shirt);
    body.position.y = 0.85;
    group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
    head.position.y = 1.55;
    group.add(head);
    group.position.set(x, 0, z);
    scene.add(group);

    const dir = rng() < 0.5 ? 1 : -1;
    pedestrians.push({
      mesh: group,
      x,
      z,
      horizontal,
      line,
      side,
      dir,
      speed: 1.2 + rng() * 0.8,
      active: true,
    });
  }
  if (pedestrians.length !== TRAFFIC_PED_COUNT) {
    throw new Error('createTraffic: gagal membangun 45 pejalan kaki (KOTA MENTARI)');
  }

  return { world, scene, cars, pedestrians };
}

// Alias pembuat state traffic.
export const createTrafficState = createTraffic;
export const buildTraffic = createTraffic;

// Gerakkan semua traffic tiap frame.
// Tanda tangan state-first: updateTraffic(state, dt, world, ctx).
// Mobil dengan stolen === true DILEWATI (dikemudikan pemain).
export function updateTraffic(state, dt, world, ctx) {
  if (!state || !Array.isArray(state.cars) || !Array.isArray(state.pedestrians)) {
    throw new Error('updateTraffic: state traffic tidak valid (KOTA MENTARI)');
  }
  const w = world || state.world;
  if (!w) throw new Error('updateTraffic: world wajib tersedia (KOTA MENTARI)');
  void ctx;
  const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0.016;

  for (const car of state.cars) {
    if (car.stolen === true) continue; // mobil curian dikemudikan pemain
    if (!car.active) continue;
    if (!car.path || car.pathIndex >= car.path.length) {
      // Tujuan baru acak, jalur baru dari posisi saat ini.
      const dest = w.nodes[Math.floor(Math.random() * w.nodes.length)];
      car.path = findRoadPath(w, car.x, car.z, dest.x, dest.z);
      car.pathIndex = 0;
      if (!car.path || car.path.length === 0) continue;
    }
    const target = car.path[car.pathIndex];
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    const move = car.speed * step;
    if (dist <= Math.max(move, 1)) {
      car.x = target.x;
      car.z = target.z;
      car.pathIndex++;
    } else {
      car.x += (dx / dist) * move;
      car.z += (dz / dist) * move;
      car.heading = Math.atan2(dx, dz);
    }
    if (car.mesh) {
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
  }

  for (const ped of state.pedestrians) {
    if (!ped.active) continue;
    const move = ped.speed * step * ped.dir;
    if (ped.horizontal) {
      ped.x += move;
      if (ped.x > 390 || ped.x < -390) ped.dir *= -1;
      ped.x = Math.max(-390, Math.min(390, ped.x));
    } else {
      ped.z += move;
      if (ped.z > 390 || ped.z < -390) ped.dir *= -1;
      ped.z = Math.max(-390, Math.min(390, ped.z));
    }
    if (ped.mesh) {
      ped.mesh.position.set(ped.x, 0, ped.z);
      // Hadap sesuai arah jalan.
      ped.mesh.rotation.y = ped.horizontal
        ? ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2
        : ped.dir > 0 ? 0 : Math.PI;
    }
  }
}

// Penghitung jumlah aktif.
export function countActiveCars(state) {
  if (!state || !Array.isArray(state.cars)) return 0;
  return state.cars.filter((c) => c.active !== false).length;
}

export function countActivePedestrians(state) {
  if (!state || !Array.isArray(state.pedestrians)) return 0;
  return state.pedestrians.filter((p) => p.active !== false).length;
}

export function getActiveCounts(state) {
  const cars = countActiveCars(state);
  const pedestrians = countActivePedestrians(state);
  return { cars, pedestrians, total: cars + pedestrians };
}

// Alias penghitung.
export const countActive = getActiveCounts;
export const getTrafficCounts = getActiveCounts;

// Bantuan: posisi spawn mobil target misi 2 (oranye terang di 100, 0).
export function spawnTargetCar(world, scene) {
  if (!world || !scene || typeof scene.add !== 'function') {
    throw new Error('spawnTargetCar: world dan scene wajib diberikan (KOTA MENTARI)');
  }
  const mesh = createCar(TARGET_ORANGE, 'target');
  mesh.position.set(100, 0, 0);
  scene.add(mesh);
  const car = createCarState(mesh, 100, 0, 0);
  car.speed = 0;
  return car;
}
