// KOTA MENTARI — traffic.js
// Populasi kota: 28 mobil + 45 pejalan kaki, digerakkan tiap frame.
// Mobil mengikuti jalan, pejalan kaki berjalan di trotoar.
import * as THREE from '../vendor/three.module.min.js';
import { makeCar, spawnCar, driveCar, CAR_COLORS } from './vehicles.js';
import { createSeededRng } from './world.js';

export const TRAFFIC_CAR_COUNT = 28;
export const TRAFFIC_PED_COUNT = 45;
export const WORLD_SEED = 7;

const SHIRT_COLORS = [
  0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa,
  0xfb8c00, 0x00acc1, 0xec407a, 0x7cb342, 0x5e35b1,
  0xf4511e, 0x3949ab, 0x00897b, 0xd81b60, 0x9e9e9e
];
const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const PANTS_COLOR = 0x37474f;

const pedBodyGeo = new THREE.BoxGeometry(0.55, 0.95, 0.35);
const pedLegsGeo = new THREE.BoxGeometry(0.5, 0.5, 0.3);
const pedHeadGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);

const pedMatCache = new Map();
function pedMat(color) {
  if (!pedMatCache.has(color)) {
    pedMatCache.set(color, new THREE.MeshLambertMaterial({ color: color }));
  }
  return pedMatCache.get(color);
}

function makePedestrian(rng) {
  const group = new THREE.Group();
  const shirt = SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)];
  const skin = SKIN_COLORS[Math.floor(rng() * SKIN_COLORS.length)];
  const legs = new THREE.Mesh(pedLegsGeo, pedMat(PANTS_COLOR));
  legs.position.set(0, 0.25, 0);
  group.add(legs);
  const body = new THREE.Mesh(pedBodyGeo, pedMat(shirt));
  body.position.set(0, 0.95, 0);
  group.add(body);
  const head = new THREE.Mesh(pedHeadGeo, pedMat(skin));
  head.position.set(0, 1.6, 0);
  group.add(head);
  group.userData.kind = 'pedestrian';
  return group;
}

function farEnough(list, x, z, minDist) {
  for (let i = 0; i < list.length; i++) {
    const dx = list[i].x - x;
    const dz = list[i].z - z;
    if (dx * dx + dz * dz < minDist * minDist) return false;
  }
  return true;
}

// Pembuat state traffic. WAJIB menerima world dan scene, dan membangun
// 28 mobil + 45 pejalan kaki NYATA. Tanpa world/scene: gagal keras (throw)
// — tidak ada fallback kosong diam-diam.
export function createTraffic(world, scene, seed) {
  if (!world || !scene) {
    throw new Error('createTraffic membutuhkan world dan scene');
  }
  const rng = createSeededRng(seed === undefined ? WORLD_SEED : seed);
  const cars = [];
  const pedestrians = [];
  const spots = world.getValidSpawnPositions();

  // 28 mobil: 2 polisi + 26 mobil biasa, jarak spawn minimal 18.
  for (let i = 0; i < TRAFFIC_CAR_COUNT; i++) {
    const type = i < 2 ? 'police' : 'normal';
    let car = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const spot = spots[Math.floor(rng() * spots.length)];
      if (!farEnough(cars, spot.x, spot.z, 18)) continue;
      const color = type === 'police'
        ? 0xf5f5f5
        : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      car = spawnCar(world, scene, type, color, spot.x, spot.z, rng);
      break;
    }
    if (!car) {
      const spot = spots[Math.floor(rng() * spots.length)];
      car = spawnCar(world, scene, type, null, spot.x, spot.z, rng);
    }
    car.speed = 8 + rng() * 6;
    cars.push(car);
  }

  // 45 pejalan kaki di trotoar: 9 satuan dari garis tengah jalan.
  const roadLines = [-400, -300, -200, -100, 0, 100, 200, 300, 400];
  for (let i = 0; i < TRAFFIC_PED_COUNT; i++) {
    let ped = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const vertical = rng() < 0.5;
      const line = roadLines[Math.floor(rng() * roadLines.length)];
      const off = rng() < 0.5 ? -9 : 9;
      const along = -390 + rng() * 780;
      const x = vertical ? line + off : along;
      const z = vertical ? along : line + off;
      if (Math.abs(x) > 396 || Math.abs(z) > 396) continue;
      if (world.isBlocked && world.isBlocked(x, z)) continue;
      if (!farEnough(pedestrians, x, z, 6)) continue;
      const group = makePedestrian(rng);
      const dir = rng() < 0.5 ? 1 : -1;
      let heading;
      if (vertical) heading = dir > 0 ? 0 : Math.PI;
      else heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.position.set(x, 0, z);
      group.rotation.y = heading;
      scene.add(group);
      ped = {
        group: group,
        mesh: group,
        x: x,
        z: z,
        heading: heading,
        speed: 1.2 + rng() * 0.8,
        axis: vertical ? 'z' : 'x',
        line: line,
        offset: off,
        dir: dir
      };
      break;
    }
    if (!ped) {
      const group = makePedestrian(rng);
      group.position.set(0, 0, 9);
      scene.add(group);
      ped = {
        group: group, mesh: group, x: 0, z: 9, heading: 0,
        speed: 1.5, axis: 'z', line: 0, offset: 9, dir: 1
      };
    }
    pedestrians.push(ped);
  }

  return {
    world: world,
    scene: scene,
    cars: cars,
    pedestrians: pedestrians,
    seed: seed === undefined ? WORLD_SEED : seed
  };
}

export const createTrafficState = createTraffic;

// Gerakkan semua traffic tiap frame: mobil ikuti jalan, pejalan kaki di trotoar.
// Mobil dengan stolen === true DILEWATI (dikemudikan pemain).
// updateTraffic(state, dt, world, ctx).
export function updateTraffic(state, dt, world, ctx) {
  if (!state) return;
  const w = world || state.world;
  const step = dt === undefined || dt === null ? 0.016 : dt;
  for (let i = 0; i < state.cars.length; i++) {
    const car = state.cars[i];
    if (car.stolen === true) continue;
    driveCar(car, step, w);
  }
  for (let i = 0; i < state.pedestrians.length; i++) {
    const ped = state.pedestrians[i];
    const move = ped.speed * step * ped.dir;
    if (ped.axis === 'z') {
      ped.z += move;
      if (ped.z > 395 || ped.z < -395) {
        ped.dir *= -1;
        ped.z = ped.z > 395 ? 395 : -395;
        ped.heading = ped.dir > 0 ? 0 : Math.PI;
      }
    } else {
      ped.x += move;
      if (ped.x > 395 || ped.x < -395) {
        ped.dir *= -1;
        ped.x = ped.x > 395 ? 395 : -395;
        ped.heading = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    ped.group.position.set(ped.x, 0, ped.z);
    ped.group.rotation.y = ped.heading;
  }
}

// Penghitung jumlah aktif.
export function getActiveCounts(state) {
  if (!state) return { cars: 0, pedestrians: 0, trafficCars: 0, trafficPeds: 0 };
  const cars = state.cars ? state.cars.length : 0;
  const pedestrians = state.pedestrians ? state.pedestrians.length : 0;
  return { cars: cars, pedestrians: pedestrians, trafficCars: cars, trafficPeds: pedestrians };
}

export const countTraffic = getActiveCounts;
export const getTrafficCounts = getActiveCounts;
