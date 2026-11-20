// Kota Mentari — vehicles.js (Lane B, v4)
// Pembuat mobil (badan balok + kabin + roda hitam), keadaan mobil,
// pemuncul mobil di titik jalan, dan penggerak mobil sepanjang jalan.
// Kecepatan mengikuti dokumen desain: mobil biasa sampai 30,
// mobil polisi sampai 32.
import * as THREE from '../vendor/three.module.min.js';
import { ROAD_LINES, PIER_CORRIDOR } from './world.js';

// ---------------------------------------------------------------------------
// Konstanta kendaraan (dari dokumen desain)
// ---------------------------------------------------------------------------
export const MAX_CIVIL_SPEED = 30;
export const MAX_POLICE_SPEED = 32;
export const TARGET_COLOR = 0xff6a00; // oranye terang (mobil target misi 2)
export const POLICE_BODY_COLOR = 0xf2f2f2; // putih (polisi hitam-putih)

// Warna mobil traffic yang bervariasi.
export const TRAFFIC_COLORS = [
  0x2f6fd0, // biru
  0x2fae5f, // hijau
  0xf2c200, // kuning
  0xf2f2f2, // putih
  0x222222, // hitam
  0xd94f30, // merah bata
  0x7a4fd0, // ungu
];

const WHEEL_COLOR = 0x111111;
const WINDOW_COLOR = 0x223344;

// ---------------------------------------------------------------------------
// Pembuat mobil
// ---------------------------------------------------------------------------
// createCar(warna, jenis): jenis 'civil' | 'police' | 'target'.
// Mengembalikan THREE.Group; keadaan mobil tersimpan di group.userData.car:
// { type, color, heading, speed, targetSpeed, currentNode, nextNode, prevNode }.
// Arah maju mobil adalah +Z lokal; heading 0 berarti menghadap +Z.
export function createCar(color, type = 'civil') {
  const group = new THREE.Group();
  const bodyColor = type === 'target' ? TARGET_COLOR : color;
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const glassMat = new THREE.MeshLambertMaterial({ color: WINDOW_COLOR });

  // Badan balok.
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 4.4), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);

  // Kabin + kaca.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2), glassMat);
  cabin.position.set(0, 1.3, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 2.25), bodyMat);
  cabinRoof.position.set(0, 1.65, -0.2);
  group.add(cabinRoof);

  // Lampu depan (menyala) dan lampu belakang merah.
  const headMat = new THREE.MeshLambertMaterial({
    color: 0xfff2b0, emissive: 0xfff2b0, emissiveIntensity: 0.7,
  });
  const tailMat = new THREE.MeshLambertMaterial({
    color: 0xcc2222, emissive: 0xcc2222, emissiveIntensity: 0.5,
  });
  for (const side of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), headMat);
    head.position.set(side, 0.65, 2.22);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), tailMat);
    tail.position.set(side, 0.65, -2.22);
    group.add(tail);
  }

  // Roda hitam (4 buah).
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: WHEEL_COLOR });
  for (const wx of [-0.95, 0.95]) {
    for (const wz of [-1.45, 1.45]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.38, wz);
      group.add(wheel);
    }
  }

  if (type === 'police') {
    // Mobil polisi hitam-putih: kap dan bagasi hitam, palang lampu merah-biru.
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.0), darkMat);
    hood.position.set(0, 1.06, 1.6);
    group.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.9), darkMat);
    trunk.position.set(0, 1.06, -1.7);
    group.add(trunk);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.35), darkMat);
    barBase.position.set(0, 1.76, -0.2);
    group.add(barBase);
    const redLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 0.9 }));
    redLight.position.set(-0.32, 1.88, -0.2);
    group.add(redLight);
    const blueLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 0.9 }));
    blueLight.position.set(0.32, 1.88, -0.2);
    group.add(blueLight);
  }

  group.userData.car = {
    type,
    color: bodyColor,
    heading: 0,
    speed: 0,
    targetSpeed: type === 'police' ? 20 : 14,
    currentNode: -1,
    nextNode: -1,
    prevNode: -1,
  };
  return group;
}

// Jalan pintas: mobil polisi hitam-putih.
export function createPoliceCar() {
  return createCar(POLICE_BODY_COLOR, 'police');
}

// Jalan pintas: mobil target oranye terang (misi 2).
export function createTargetCar() {
  return createCar(TARGET_COLOR, 'target');
}

// ---------------------------------------------------------------------------
// Keadaan mobil
// ---------------------------------------------------------------------------
export function getCarState(car) {
  return car.userData.car;
}

export function getCarSpeed(car) {
  return car.userData.car.speed;
}

export function setCarTargetSpeed(car, speed) {
  const cap = car.userData.car.type === 'police' ? MAX_POLICE_SPEED : MAX_CIVIL_SPEED;
  car.userData.car.targetSpeed = Math.max(0, Math.min(cap, speed));
}

export function setCarSpeed(car, speed) {
  car.userData.car.speed = Math.max(0, speed);
}

// ---------------------------------------------------------------------------
// Pemuncul mobil di titik jalan
// ---------------------------------------------------------------------------
// Menempatkan mobil pada simpul jalan acak (di luar koridor dermaga bila
// diminta) dan mengarahkannya ke simpul tetangga. rng: fungsi () => [0,1).
function nodeInRect(node, rect) {
  return node.x >= rect.minX && node.x <= rect.maxX
    && node.z >= rect.minZ && node.z <= rect.maxZ;
}

export function spawnCarOnRoad(car, world, rng, avoidPierCorridor = true) {
  const random = rng || Math.random;
  const graph = world.graph;
  let candidates = graph.nodes;
  if (avoidPierCorridor) {
    candidates = graph.nodes.filter((node) => !nodeInRect(node, PIER_CORRIDOR));
  }
  if (candidates.length === 0) candidates = graph.nodes;
  const node = candidates[Math.floor(random() * candidates.length)];
  const state = car.userData.car;
  state.currentNode = node.id;
  state.prevNode = -1;
  car.position.set(node.x, 0, node.z);
  state.nextNode = chooseNextNode(world, state, random, avoidPierCorridor);
  const target = graph.nodes[state.nextNode];
  state.heading = Math.atan2(target.x - node.x, target.z - node.z);
  car.rotation.y = state.heading;
  state.speed = 0;
  state.targetSpeed = 12 + random() * 6;
  return car;
}

// ---------------------------------------------------------------------------
// Penggerak mobil sepanjang jalan
// ---------------------------------------------------------------------------
// Memajukan mobil menuju simpul berikutnya; di persimpangan memilih sisi
// jalan berikutnya secara acak (tidak putar balik bila ada pilihan lain).
// avoidRects: daftar persegi {minX,maxX,minZ,maxZ} yang tidak boleh dilalui.
function chooseNextNode(world, state, random, avoidPierCorridor = false, avoidRects = null) {
  const neighbors = world.graph.adjacency[state.currentNode] || [];
  let options = neighbors.filter((id) => id !== state.prevNode);
  if (avoidPierCorridor || avoidRects) {
    const rects = avoidRects ? avoidRects.slice() : [];
    if (avoidPierCorridor) rects.push(PIER_CORRIDOR);
    options = options.filter((id) => {
      const node = world.graph.nodes[id];
      return !rects.some((r) => nodeInRect(node, r));
    });
    if (options.length === 0) {
      options = neighbors.filter((id) => id !== state.prevNode);
    }
  }
  if (options.length === 0) options = neighbors;
  if (options.length === 0) return state.currentNode;
  return options[Math.floor(random() * options.length)];
}

export function driveCar(car, world, dt, rng = null, avoidRects = null) {
  const state = car.userData.car;
  const random = rng || Math.random;
  const graph = world.graph;
  if (state.currentNode < 0 || state.nextNode < 0) {
    spawnCarOnRoad(car, world, random);
    return;
  }
  // Percepat / perlambat menuju kecepatan target.
  const accel = 8;
  if (state.speed < state.targetSpeed) {
    state.speed = Math.min(state.targetSpeed, state.speed + accel * dt);
  } else if (state.speed > state.targetSpeed) {
    state.speed = Math.max(state.targetSpeed, state.speed - accel * 1.5 * dt);
  }
  const target = graph.nodes[state.nextNode];
  const dx = target.x - car.position.x;
  const dz = target.z - car.position.z;
  const dist = Math.hypot(dx, dz);
  const step = state.speed * dt;
  if (dist <= Math.max(1.2, step)) {
    // Tiba di persimpangan: lanjut ke sisi berikutnya.
    car.position.x = target.x;
    car.position.z = target.z;
    state.prevNode = state.currentNode;
    state.currentNode = state.nextNode;
    state.nextNode = chooseNextNode(world, state, random, false, avoidRects);
    const next = graph.nodes[state.nextNode];
    state.heading = Math.atan2(next.x - target.x, next.z - target.z);
    car.rotation.y = state.heading;
  } else {
    const nx = dx / dist;
    const nz = dz / dist;
    car.position.x += nx * step;
    car.position.z += nz * step;
    const wantedHeading = Math.atan2(nx, nz);
    // Putar halus menuju arah jalan (hindari lompatan sudut).
    let diff = wantedHeading - state.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.heading += diff * Math.min(1, dt * 8);
    car.rotation.y = state.heading;
  }
}
