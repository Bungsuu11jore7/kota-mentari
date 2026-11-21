// KOTA MENTARI — pembuat mobil (Lane B, v9)
// Badan balok + kabin + roda hitam; warna bervariasi; mobil polisi
// hitam-putih dengan palang lampu; mobil target oranye terang.
import * as THREE from '../vendor/three.module.min.js';

// Warna cat mobil sipil yang bervariasi.
export const CAR_COLORS = [
  0xd23b2e, // merah
  0x2e6fd2, // biru
  0xe8c832, // kuning
  0x3aa655, // hijau
  0xdddddd, // putih
  0x222831, // hitam
  0x8a5a2b, // cokelat
  0x7a4fd0, // ungu
];
// Warna oranye terang mobil target misi (BEKU oleh dokumen desain).
export const TARGET_ORANGE = 0xff7a00;
export const POLICE_BODY = 0xf2f2f2;
export const POLICE_TRIM = 0x181818;

// Pembuat mobil: menerima warna dan jenis ('sedan' | 'police' | 'target').
// Mengembalikan THREE.Group yang siap ditambahkan ke scene.
export function createCar(color, type) {
  const kind = type || 'sedan';
  let paintColor = typeof color === 'number' ? color : CAR_COLORS[0];
  if (kind === 'target') paintColor = TARGET_ORANGE;
  if (kind === 'police') paintColor = POLICE_BODY;

  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: paintColor });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

  // Badan balok.
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.4), paint);
  body.position.y = 0.55;
  group.add(body);

  // Kabin.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 2.2), glass);
  cabin.position.set(0, 1.2, -0.2);
  group.add(cabin);

  // Roda hitam (4).
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  for (const [wx, wz] of [[-1.05, 1.4], [1.05, 1.4], [-1.05, -1.4], [1.05, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
  }

  if (kind === 'police') {
    // Trim hitam (kap + pintu) di atas badan putih.
    const trimMat = new THREE.MeshLambertMaterial({ color: POLICE_TRIM });
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 1.2), trimMat);
    hood.position.set(0, 0.95, 1.5);
    group.add(hood);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.3, 1.6), trimMat);
    stripe.position.set(0, 0.6, -0.2);
    group.add(stripe);
    // Palang lampu merah-biru di atap.
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.5), trimMat);
    barBase.position.set(0, 1.6, -0.2);
    group.add(barBase);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.3, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xff2222 })
    );
    red.position.set(-0.4, 1.75, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.3, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2244ff })
    );
    blue.position.set(0.4, 1.75, -0.2);
    group.add(blue);
  }

  group.userData.carType = kind;
  group.userData.carColor = paintColor;
  return group;
}

// Alias pembuat mobil.
export const createVehicle = createCar;
export const makeCar = createCar;

// Keadaan mobil: posisi, arah (heading), kecepatan, jalur, status curian.
// Arah maju mengikuti sinus/kosinus sudut: x = sin(heading), z = cos(heading).
export function createCarState(mesh, x, z, heading) {
  return {
    mesh,
    x: typeof x === 'number' ? x : 0,
    z: typeof z === 'number' ? z : 0,
    heading: typeof heading === 'number' ? heading : 0,
    speed: 0,
    path: null,
    pathIndex: 0,
    stolen: false,
    active: true,
  };
}

// Alias keadaan mobil.
export const makeCarState = createCarState;
export const createVehicleState = createCarState;

// Pemuncul mobil di titik jalan acak yang valid (bukan di dalam bangunan,
// bukan di koridor dermaga). Mengembalikan keadaan mobil lengkap.
export function spawnCarOnRoad(world, color, type) {
  if (!world || !Array.isArray(world.nodes)) {
    throw new Error('spawnCarOnRoad: world wajib diberikan (KOTA MENTARI)');
  }
  const node = world.nodes[Math.floor(Math.random() * world.nodes.length)];
  // Hindari koridor dermaga: simpul (400, 300)/(400, 400) dekat koridor
  // tetap aman karena koridor berada di z 315..385, x >= 370.
  let x = node.x;
  let z = node.z;
  if (x >= 370 && z >= 315 && z <= 385) {
    x = 300;
    z = 300;
  }
  const mesh = createCar(color, type);
  mesh.position.set(x, 0, z);
  const heading = Math.random() * Math.PI * 2;
  mesh.rotation.y = heading;
  const state = createCarState(mesh, x, z, heading);
  state.speed = 8 + Math.random() * 6;
  return state;
}

// Penggerak mobil sepanjang jalan: ikuti state.path (array {x, z}).
// Bila jalur habis, mobil berhenti di ujung (pemanggil memberi jalur baru).
export function driveCarAlongRoad(car, dt, world) {
  if (!car || !car.path || car.pathIndex >= car.path.length) return;
  const target = car.path[car.pathIndex];
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  const step = car.speed * dt;
  if (dist <= Math.max(step, 1)) {
    car.x = target.x;
    car.z = target.z;
    car.pathIndex++;
  } else {
    car.x += (dx / dist) * step;
    car.z += (dz / dist) * step;
    car.heading = Math.atan2(dx, dz);
  }
  if (car.mesh) {
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
  void world;
}

// Alias penggerak mobil.
export const driveCar = driveCarAlongRoad;
export const moveCarAlongRoad = driveCarAlongRoad;
