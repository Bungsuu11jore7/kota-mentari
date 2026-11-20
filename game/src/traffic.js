// Kota Mentari — traffic.js (Lane B, v4)
// Pengelola populasi: 28 mobil dan 45 pejalan kaki (dari dokumen desain).
// Mobil mengikuti jalan lewat graf; pejalan kaki berjalan di trotoar.
// Aturan jarak spawn: mobil dan pejalan kaki tidak menumpuk di satu titik,
// tidak muncul di dalam bangunan, tidak muncul di koridor dermaga.
import * as THREE from '../vendor/three.module.min.js';
import {
  ROAD_LINES, ROAD_WIDTH, SIDEWALK_WIDTH, SIDEWALK_OFFSET, SEED,
  PIER_CORRIDOR, isBlocked, isInPierCorridor, createRng, rngPick, rngFloat,
} from './world.js';
import { createCar, spawnCarOnRoad, driveCar, TRAFFIC_COLORS } from './vehicles.js';

// ---------------------------------------------------------------------------
// Konstanta populasi (dari dokumen desain)
// ---------------------------------------------------------------------------
export const TRAFFIC_CAR_COUNT = 28;
export const PEDESTRIAN_COUNT = 45;
export const MIN_CAR_SPAWN_DISTANCE = 18;
export const MIN_PED_SPAWN_DISTANCE = 6;
export const PED_MIN_SPEED = 1.2;
export const PED_MAX_SPEED = 2.4;

// Warna baju pejalan kaki yang bervariasi.
const PED_SHIRT_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6,
  0xe67e22, 0x1abc9c, 0xecf0f1, 0x34495e, 0xfd79a8,
];
const PED_SKIN_COLORS = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf2c89b];

// ---------------------------------------------------------------------------
// Pejalan kaki: sosok kecil berbadan warna + kepala
// ---------------------------------------------------------------------------
// Keadaan pejalan kaki di group.userData.ped:
// { axis: 'x'|'z' (garis jalan yang diikuti), line (koordinat garis jalan),
//   along (posisi sepanjang jalan), dir (+1/-1), side (+1/-1 sisi trotoar),
//   speed, phase (untuk ayunan langkah) }.
export function createPedestrian(color) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color });
  const skinMat = new THREE.MeshLambertMaterial({
    color: PED_SKIN_COLORS[Math.floor(Math.random() * PED_SKIN_COLORS.length)],
  });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.35), shirtMat);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  for (const side of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.2), pantsMat);
    leg.position.set(side, 0.25, 0);
    group.add(leg);
  }

  group.userData.ped = {
    axis: 'x',
    line: 0,
    along: 0,
    dir: 1,
    side: 1,
    speed: 1.8,
    phase: 0,
  };
  return group;
}

// Menempatkan pejalan kaki di trotoar (sisi jalan, offset 9 dari tengah).
export function placePedestrianOnSidewalk(ped, world, rng) {
  const random = rng || Math.random;
  const state = ped.userData.ped;
  state.axis = random() < 0.5 ? 'x' : 'z';
  state.line = ROAD_LINES[Math.floor(random() * ROAD_LINES.length)];
  state.along = rngFloat(random, -390, 390);
  state.dir = random() < 0.5 ? 1 : -1;
  state.side = random() < 0.5 ? 1 : -1;
  state.speed = rngFloat(random, PED_MIN_SPEED, PED_MAX_SPEED);
  syncPedestrianPosition(ped);
  return ped;
}

function syncPedestrianPosition(ped) {
  const state = ped.userData.ped;
  if (state.axis === 'x') {
    ped.position.set(state.line + state.side * SIDEWALK_OFFSET, 0, state.along);
    ped.rotation.y = state.dir > 0 ? 0 : Math.PI;
  } else {
    ped.position.set(state.along, 0, state.line + state.side * SIDEWALK_OFFSET);
    ped.rotation.y = state.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}

// Satu langkah pejalan kaki: maju di trotoar, putar balik di ujung peta,
// kadang belok ke jalan tegak lurus di persimpangan.
function walkPedestrian(ped, dt, rng) {
  const state = ped.userData.ped;
  const random = rng || Math.random;
  state.along += state.dir * state.speed * dt;
  if (state.along > 492) {
    state.along = 492;
    state.dir = -1;
  } else if (state.along < -492) {
    state.along = -492;
    state.dir = 1;
  }
  // Di dekat persimpangan (kelipatan 100), kadang belok ke jalan lain.
  const nearestLine = Math.round(state.along / 100) * 100;
  if (Math.abs(state.along - nearestLine) < 1.5 && random() < dt * 0.6) {
    const oldLine = state.line;
    state.line = nearestLine;
    state.along = oldLine;
    state.axis = state.axis === 'x' ? 'z' : 'x';
    state.dir = random() < 0.5 ? 1 : -1;
    state.side = random() < 0.5 ? 1 : -1;
  }
  // Ayunan langkah kecil.
  state.phase += dt * state.speed * 4;
  ped.position.y = Math.abs(Math.sin(state.phase)) * 0.06;
  syncPedestrianPosition(ped);
  ped.position.y = Math.abs(Math.sin(state.phase)) * 0.06;
}

// ---------------------------------------------------------------------------
// Pembuat populasi
// ---------------------------------------------------------------------------
// createTraffic(scene, world): membuat 28 mobil + 45 pejalan kaki dengan
// aturan jarak spawn, lalu mengembalikan objek traffic:
// { scene, world, cars, pedestrians, rng }.
export function createTraffic(scene, world) {
  const rng = createRng(SEED);
  const traffic = { scene, world, cars: [], pedestrians: [], rng };

  // --- 28 mobil traffic di jalan (jaga jarak antar mobil) ---
  for (let i = 0; i < TRAFFIC_CAR_COUNT; i++) {
    const car = createCar(rngPick(rng, TRAFFIC_COLORS), 'civil');
    let placed = false;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      spawnCarOnRoad(car, world, rng, true);
      let tooClose = false;
      for (const other of traffic.cars) {
        const dx = car.position.x - other.position.x;
        const dz = car.position.z - other.position.z;
        if (dx * dx + dz * dz < MIN_CAR_SPAWN_DISTANCE * MIN_CAR_SPAWN_DISTANCE) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) placed = true;
    }
    scene.add(car);
    traffic.cars.push(car);
  }

  // --- 45 pejalan kaki di trotoar (jaga jarak, hindari bangunan + dermaga) ---
  for (let i = 0; i < PEDESTRIAN_COUNT; i++) {
    const ped = createPedestrian(rngPick(rng, PED_SHIRT_COLORS));
    let placed = false;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      placePedestrianOnSidewalk(ped, world, rng);
      const x = ped.position.x;
      const z = ped.position.z;
      if (isInPierCorridor(x, z)) continue;
      if (isBlocked(world, x, z)) continue;
      let tooClose = false;
      for (const other of traffic.pedestrians) {
        const dx = x - other.position.x;
        const dz = z - other.position.z;
        if (dx * dx + dz * dz < MIN_PED_SPAWN_DISTANCE * MIN_PED_SPAWN_DISTANCE) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) placed = true;
    }
    scene.add(ped);
    traffic.pedestrians.push(ped);
  }

  return traffic;
}

// ---------------------------------------------------------------------------
// Penggerak & penghitung
// ---------------------------------------------------------------------------
// Menggerakkan semua traffic tiap frame: mobil mengikuti jalan,
// pejalan kaki berjalan di trotoar. Mobil traffic tidak masuk koridor dermaga.
export function updateTraffic(traffic, dt) {
  const safeDt = Math.min(dt, 0.05);
  for (const car of traffic.cars) {
    driveCar(car, traffic.world, safeDt, traffic.rng, [PIER_CORRIDOR]);
  }
  for (const ped of traffic.pedestrians) {
    walkPedestrian(ped, safeDt, traffic.rng);
  }
}

// Jumlah traffic yang masih aktif (masih ada di adegan).
export function countActive(traffic) {
  let total = 0;
  for (const car of traffic.cars) {
    if (car.parent) total++;
  }
  for (const ped of traffic.pedestrians) {
    if (ped.parent) total++;
  }
  return total;
}

export function countActiveDetailed(traffic) {
  let cars = 0;
  let pedestrians = 0;
  for (const car of traffic.cars) {
    if (car.parent) cars++;
  }
  for (const ped of traffic.pedestrians) {
    if (ped.parent) pedestrians++;
  }
  return { cars, pedestrians, total: cars + pedestrians };
}

// Melepas satu mobil/pejalan kaki dari adegan (tidak aktif lagi).
export function removeCar(traffic, car) {
  if (car.parent) car.parent.remove(car);
}

export function removePedestrian(traffic, ped) {
  if (ped.parent) ped.parent.remove(ped);
}
