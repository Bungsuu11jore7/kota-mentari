// KOTA MENTARI — vehicles.js
// Pembuat mobil: badan balok + kabin + roda hitam, warna bervariasi.
// Jenis: normal, polisi (hitam-putih + palang lampu), target (oranye terang).
import * as THREE from '../vendor/three.module.min.js';
import { findRoadPath, nearestRoad } from './world.js';

export const TARGET_COLOR = 0xff6a00;
export const POLICE_COLOR = 0xf5f5f5;

export const CAR_COLORS = [
  0xd32f2f, 0x1976d2, 0xfbc02d, 0x7b1fa2, 0x00796b,
  0xe0e0e0, 0x37474f, 0x8d6e63, 0x43a047, 0xfb8c00,
  0x5d4037, 0x00838f, 0xc0ca33, 0x6a1b9a, 0xad1457
];

const GLASS_COLOR = 0x16242e;
const WHEEL_COLOR = 0x111111;
const bodyGeo = new THREE.BoxGeometry(3.6, 0.9, 1.8);
const cabinGeo = new THREE.BoxGeometry(2.0, 0.75, 1.6);
const doorGeo = new THREE.BoxGeometry(1.6, 0.7, 1.84);
const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10);
const lightBarGeo = new THREE.BoxGeometry(0.5, 0.2, 0.55);
const headGeo = new THREE.BoxGeometry(0.1, 0.2, 0.3);
const tailGeo = new THREE.BoxGeometry(0.1, 0.2, 0.3);

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshLambertMaterial({ color: color }));
  }
  return matCache.get(color);
}

// Pembuat mobil. makeCar(warna, jenis) -> THREE.Group.
export function makeCar(color, type) {
  const kind = type || 'normal';
  let bodyColor = color;
  if (kind === 'target') bodyColor = TARGET_COLOR;
  if (kind === 'police') bodyColor = POLICE_COLOR;
  if (bodyColor === undefined || bodyColor === null) {
    bodyColor = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  }
  const group = new THREE.Group();

  const body = new THREE.Mesh(bodyGeo, mat(bodyColor));
  body.position.set(0, 0.55, 0);
  group.add(body);

  if (kind === 'police') {
    const doors = new THREE.Mesh(doorGeo, mat(0x111111));
    doors.position.set(0.1, 0.55, 0);
    group.add(doors);
  }

  const cabin = new THREE.Mesh(cabinGeo, mat(kind === 'police' ? 0x111111 : GLASS_COLOR));
  cabin.position.set(-0.2, 1.3, 0);
  group.add(cabin);

  if (kind === 'police') {
    const red = new THREE.Mesh(lightBarGeo, mat(0xd50000));
    red.position.set(-0.2, 1.78, -0.3);
    group.add(red);
    const blue = new THREE.Mesh(lightBarGeo, mat(0x0d47a1));
    blue.position.set(-0.2, 1.78, 0.3);
    group.add(blue);
  }

  const wheelMat = mat(WHEEL_COLOR);
  const wheelSpots = [
    [1.2, 0.85], [1.2, -0.85], [-1.2, 0.85], [-1.2, -0.85]
  ];
  for (let i = 0; i < wheelSpots.length; i++) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wheelSpots[i][0], 0.35, wheelSpots[i][1]);
    group.add(wheel);
  }

  const headMat = mat(0xfff9c4);
  for (let s = -1; s <= 1; s += 2) {
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(1.82, 0.6, 0.55 * s);
    group.add(head);
    const tail = new THREE.Mesh(tailGeo, mat(0xb71c1c));
    tail.position.set(-1.82, 0.6, 0.55 * s);
    group.add(tail);
  }

  group.userData.type = kind;
  group.userData.color = bodyColor;
  return group;
}

// Keadaan mobil: posisi, arah, kecepatan, jalur, status curian.
export function makeCarState(group, x, z, heading, speed) {
  return {
    group: group,
    mesh: group,
    x: x || 0,
    z: z || 0,
    heading: heading || 0,
    speed: speed || 0,
    type: (group.userData && group.userData.type) || 'normal',
    color: (group.userData && group.userData.color) || 0x999999,
    stolen: false,
    path: null,
    pathIndex: 0,
    target: null
  };
}

export const createCarState = makeCarState;

// Munculkan mobil di titik jalan valid. spawnCar(world, scene, jenis, warna, x, z).
export function spawnCar(world, scene, type, color, x, z, rngFn) {
  if (!world || !scene) {
    throw new Error('spawnCar membutuhkan world dan scene');
  }
  const rng = rngFn || Math.random;
  let px = x;
  let pz = z;
  if (px === undefined || px === null || pz === undefined || pz === null) {
    const spots = world.getValidSpawnPositions
      ? world.getValidSpawnPositions()
      : world.roadGraph.nodes;
    const spot = spots[Math.floor(rng() * spots.length)];
    px = spot.x;
    pz = spot.z;
  }
  const near = nearestRoad(world, px, pz);
  px = near.x;
  pz = near.z;
  const kind = type || 'normal';
  let carColor = color;
  if (carColor === undefined || carColor === null) {
    if (kind === 'target') carColor = TARGET_COLOR;
    else if (kind === 'police') carColor = POLICE_COLOR;
    else carColor = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
  }
  const group = makeCar(carColor, kind);
  const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const heading = headings[Math.floor(rng() * headings.length)];
  group.position.set(px, 0, pz);
  group.rotation.y = heading;
  scene.add(group);
  const car = makeCarState(group, px, pz, heading, 0);
  car.type = kind;
  return car;
}

// Gerakkan mobil sepanjang jalan menuju titik jalan berikutnya.
// Bila jalur habis, pilih tujuan simpul acak baru lewat graf jalan.
export function driveCar(car, dt, world, rngFn) {
  if (!car || !world) return;
  const rng = rngFn || Math.random;
  if (car.speed === 0 || car.speed === undefined || car.speed === null) {
    car.speed = 10;
  }
  if (!car.path || car.pathIndex >= car.path.length) {
    const nodes = world.roadGraph.nodes;
    const dest = nodes[Math.floor(rng() * nodes.length)];
    car.path = findRoadPath(world, car.x, car.z, dest.x, dest.z);
    car.pathIndex = 1;
    car.target = dest;
    if (!car.path || car.path.length < 2) return;
  }
  const wp = car.path[car.pathIndex];
  if (!wp) return;
  const dx = wp.x - car.x;
  const dz = wp.z - car.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.01) {
    car.pathIndex++;
    return;
  }
  const step = car.speed * dt;
  if (step >= dist) {
    car.x = wp.x;
    car.z = wp.z;
    car.pathIndex++;
  } else {
    car.x += (dx / dist) * step;
    car.z += (dz / dist) * step;
  }
  car.heading = Math.atan2(dx, dz);
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
}

export const updateCar = driveCar;
