// KOTA MENTARI — pengelola traffic (Lane B, v12)
// 28 mobil + 45 pejalan kaki. Mobil mengikuti jalan, pejalan kaki berjalan
// di trotoar. Dibuat SETELAH world siap; tanpa world/scene gagal keras.
import * as THREE from '../vendor/three.module.min.js';
import { createCar, createCarState, spawnCarOnRoad, driveCarAlongRoad, randomBodyColor } from './vehicles.js';
import { mulberry32, DOCK_CORRIDOR } from './world.js';

export const TRAFFIC_CARS = 28;
export const TRAFFIC_PEDS = 45;

const PED_SHIRTS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0xecf0f1, 0x34495e, 0xfd79a8,
];
const PED_SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

function inCorridor(x, z) {
  return x > DOCK_CORRIDOR.x0 && x < DOCK_CORRIDOR.x1 &&
    z > DOCK_CORRIDOR.z0 && z < DOCK_CORRIDOR.z1;
}

// ---- Pembuat sosok pejalan kaki kecil ----
export function createPedestrian(color, skin) {
  const group = new THREE.Group();
  const shirt = color === undefined
    ? PED_SHIRTS[Math.floor(Math.random() * PED_SHIRTS.length)]
    : color;
  const skinColor = skin === undefined
    ? PED_SKINS[Math.floor(Math.random() * PED_SKINS.length)]
    : skin;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.95, 0.32),
    new THREE.MeshLambertMaterial({ color: shirt })
  );
  body.position.y = 0.78;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 8, 6),
    new THREE.MeshLambertMaterial({ color: skinColor })
  );
  head.position.y = 1.5;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  for (const lx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.2), legMat);
    leg.position.set(lx, 0.18, 0);
    group.add(leg);
  }
  group.userData.type = 'pedestrian';
  return group;
}

// ---- Pembuat state traffic ----
// WAJIB menerima world dan scene; tanpa keduanya gagal keras — TIDAK BOLEH
// mengembalikan fallback kosong {cars: [], pedestrians: []} diam-diam.
export function createTraffic(world, scene, seed) {
  if (!world || !world.graph) {
    throw new Error('createTraffic: world dengan graf jalan wajib diberikan — traffic tidak boleh dibuat sebelum world siap');
  }
  if (!scene || typeof scene.add !== 'function') {
    throw new Error('createTraffic: scene wajib diberikan — traffic tidak boleh dibuat tanpa scene');
  }
  const rng = mulberry32(seed === undefined ? 7 : seed);
  const state = { world, scene, cars: [], pedestrians: [] };

  // ---- 28 mobil ----
  let guard = 0;
  while (state.cars.length < TRAFFIC_CARS && guard < 3000) {
    guard += 1;
    const type = rng() < 0.08 ? 'taxi' : 'sedan';
    const car = spawnCarOnRoad(world, scene, randomBodyColor(rng), type, rng);
    if (inCorridor(car.x, car.z)) {
      scene.remove(car.mesh);
      continue;
    }
    let crowded = false;
    for (const other of state.cars) {
      if (Math.hypot(other.x - car.x, other.z - car.z) < 14) {
        crowded = true;
        break;
      }
    }
    if (crowded) {
      scene.remove(car.mesh);
      continue;
    }
    car.speed = 6 + rng() * 6;
    state.cars.push(car);
  }
  if (state.cars.length < TRAFFIC_CARS) {
    throw new Error('createTraffic: gagal membangun 28 mobil (hanya ' + state.cars.length + ')');
  }

  // ---- 45 pejalan kaki di trotoar ----
  guard = 0;
  while (state.pedestrians.length < TRAFFIC_PEDS && guard < 6000) {
    guard += 1;
    const vertical = rng() < 0.5;
    const line = (Math.floor(rng() * 11) - 5) * 100; // garis jalan -500..500
    const along = (rng() * 2 - 1) * 480;
    const side = (rng() < 0.5 ? -1 : 1) * (9 + rng() * 2); // trotoar: 9..11 dari as jalan
    const x = vertical ? line + side : along;
    const z = vertical ? along : line + side;
    if (Math.abs(x) > 495 || Math.abs(z) > 495) continue;
    if (inCorridor(x, z)) continue;
    if (world.isBlocked && world.isBlocked(x, z)) continue;
    let crowded = false;
    for (const other of state.pedestrians) {
      if (Math.hypot(other.x - x, other.z - z) < 4) {
        crowded = true;
        break;
      }
    }
    if (crowded) continue;
    const mesh = createPedestrian();
    scene.add(mesh);
    // Arah jalan sepanjang trotoar; maju = (sin, cos) heading.
    const heading = vertical ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const ped = {
      mesh,
      x,
      z,
      heading,
      speed: 1 + rng() * 1.4,
      vertical,
      line,
    };
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    state.pedestrians.push(ped);
  }
  if (state.pedestrians.length < TRAFFIC_PEDS) {
    throw new Error('createTraffic: gagal membangun 45 pejalan kaki (hanya ' + state.pedestrians.length + ')');
  }

  return state;
}

// ---- Penghitung aktif ----
export function countTraffic(state) {
  if (!state) return { cars: 0, pedestrians: 0, total: 0 };
  const cars = state.cars ? state.cars.length : 0;
  const pedestrians = state.pedestrians ? state.pedestrians.length : 0;
  return { cars, pedestrians, total: cars + pedestrians };
}
export function getActiveCounts(state) {
  return countTraffic(state);
}
export function countActiveTraffic(state) {
  return countTraffic(state);
}

// ---- Update tiap frame: updateTraffic(state, dt, world, ctx) ----
export function updateTraffic(state, dt, world, ctx) {
  if (!state) throw new Error('updateTraffic: state traffic wajib diberikan');
  const w = world || state.world;
  if (!w) throw new Error('updateTraffic: world wajib diberikan');
  const step = dt || 0;

  // Mobil: lewati mobil curian (stolen === true dikemudikan pemain).
  for (const car of state.cars) {
    if (car.stolen === true) continue;
    driveCarAlongRoad(car, step, w);
  }

  // Pejalan kaki: jalan di trotoar, putar balik di ujung jalan.
  for (const ped of state.pedestrians) {
    const fx = Math.sin(ped.heading);
    const fz = Math.cos(ped.heading);
    let nx = ped.x + fx * ped.speed * step;
    let nz = ped.z + fz * ped.speed * step;
    // Tetap di trotoar: jarak dari as jalan harus 8..12.
    const across = ped.vertical ? Math.abs(nx - ped.line) : Math.abs(nz - ped.line);
    const along = ped.vertical ? nz : nx;
    let turn = false;
    if (across < 8 || across > 12) turn = true;
    if (Math.abs(along) > 490) turn = true;
    if (w.isBlocked && w.isBlocked(nx, nz)) turn = true;
    if (inCorridor(nx, nz)) turn = true;
    if (turn) {
      ped.heading += Math.PI; // putar balik
      nx = ped.x;
      nz = ped.z;
    }
    ped.x = nx;
    ped.z = nz;
    if (ped.mesh) {
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
  }
}

export default createTraffic;
