// vehicles.js — Model dan perilaku mobil Kota Mentari.
// Mobil pemain dan mobil traffic memakai bentuk yang sama: bodi, kabin,
// roda berputar, lampu. Mobil oranye misi 2 hanyalah mobil biasa dengan
// warna oranye — tidak ada model khusus.
// Konvensi heading (BEKU, dari dokumen desain): arah maju = (sin h, cos h)
// pada bidang x/z; rotasi mesh memakai rotation.y = heading.
import * as THREE from '../vendor/three.module.min.js';

export const CAR_LENGTH = 4.2;
export const CAR_WIDTH = 2.0;
export const MAX_SPEED = 38;
export const MAX_REVERSE_SPEED = 10;
export const ACCEL = 14;
export const BRAKE = 26;
export const DRAG = 0.35;

const materialCache = new Map();
function mat(color) {
  let m = materialCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    materialCache.set(color, m);
  }
  return m;
}

// Membuat satu mobil. color: warna bodi (hex). scene boleh null (logika
// saja, tanpa mesh — dipakai smoke test). Mengembalikan objek mobil.
export function createCar(color, x, z, heading, scene) {
  const car = {
    color,
    x,
    z,
    heading: heading ?? 0,
    speed: 0,
    steer: 0,
    mesh: null,
    wheels: [],
    frontWheels: [],
  };
  const group = new THREE.Group();
  // Bodi + kabin kaca.
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.7, CAR_LENGTH), mat(color));
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_WIDTH - 0.3, 0.55, 2.0),
    mat(0x1c2833),
  );
  cabin.position.set(0, 1.25, -0.25);
  group.add(cabin);
  // Lampu depan (putih) dan belakang (merah).
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const sx of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    lamp.position.set(sx, 0.7, CAR_LENGTH / 2 + 0.01);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f });
  for (const sx of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    lamp.position.set(sx, 0.7, -CAR_LENGTH / 2 - 0.01);
    group.add(lamp);
  }
  // Roda: silinder dengan sumbu sepanjang x.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = mat(0x1a1a1a);
  const wheelSpots = [
    [-0.95, 1.35, true],
    [0.95, 1.35, true],
    [-0.95, -1.35, false],
    [0.95, -1.35, false],
  ];
  for (const [wx, wz, front] of wheelSpots) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    pivot.add(wheel);
    group.add(pivot);
    car.wheels.push({ pivot, mesh: wheel });
    if (front) car.frontWheels.push(pivot);
  }
  group.position.set(x, 0, z);
  group.rotation.y = car.heading;
  car.mesh = group;
  if (scene && typeof scene.add === 'function') scene.add(group);
  return car;
}

// Menyelaraskan mesh dengan keadaan logika mobil.
export function syncCarMesh(car) {
  if (!car.mesh) return;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = (car.speed * 0.016) / 0.36;
  for (const w of car.wheels) w.mesh.rotation.x += spin;
  const steerAngle = car.steer * 0.38;
  for (const p of car.frontWheels) p.rotation.y = steerAngle;
}

// Baca / tulis heading mobil.
export function getHeading(car) {
  return car.heading;
}
export function setHeading(car, heading) {
  car.heading = heading;
  syncCarMesh(car);
}

// Sinkron heading antara pemain dan mobilnya (kontrak BEKU):
// saat pemain masuk mobil, heading mobil = heading pemain;
// saat keluar, heading pemain = heading mobil.
export function matchCarHeadingToPlayer(car, player) {
  setHeading(car, player.heading);
}
export function matchPlayerHeadingToCar(player, car) {
  player.heading = car.heading;
}

// Gerak mobil: controls = { throttle: -1..1, steer: -1..1, handbrake: bool }.
// world (opsional) dipakai untuk tabrakan gedung; otherCars (opsional,
// array mobil) untuk tabrakan antar mobil. dt dalam detik.
export function updateCar(car, controls, dt, world, otherCars) {
  const step = Math.min(Math.max(dt, 0), 0.05);
  const throttle = controls?.throttle ?? 0;
  const steer = controls?.steer ?? 0;
  const handbrake = controls?.handbrake ?? false;
  car.steer = steer;

  if (handbrake) {
    car.speed -= Math.sign(car.speed) * BRAKE * step;
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  } else if (throttle !== 0) {
    car.speed += throttle * ACCEL * step;
  } else {
    // Melambat sendiri saat gas dilepas.
    const decel = 6 * step;
    if (Math.abs(car.speed) <= decel) car.speed = 0;
    else car.speed -= Math.sign(car.speed) * decel;
  }
  // Hambatan udara ringan.
  car.speed -= car.speed * DRAG * step;
  if (car.speed > MAX_SPEED) car.speed = MAX_SPEED;
  if (car.speed < -MAX_REVERSE_SPEED) car.speed = -MAX_REVERSE_SPEED;

  // Belok: makin cepat makin besar pengaruh setir; handbrake mempertajam.
  const steerPower = handbrake ? 2.6 : 1.9;
  car.heading += steer * steerPower * (car.speed / 10) * step;

  const nx = car.x + Math.sin(car.heading) * car.speed * step;
  const nz = car.z + Math.cos(car.heading) * car.speed * step;

  // Tabrakan gedung: berhenti di tempat, tidak menembus.
  if (world && typeof world.collidesBuilding === 'function') {
    if (world.collidesBuilding(nx, nz, 1.6)) {
      car.speed *= -0.2;
      syncCarMesh(car);
      return car;
    }
  }
  // Tabrakan antar mobil: melambat, tidak menembus.
  if (otherCars) {
    for (const other of otherCars) {
      if (other === car) continue;
      const dx = nx - other.x;
      const dz = nz - other.z;
      if (dx * dx + dz * dz < 4.4 * 4.4) {
        car.speed *= 0.4;
        syncCarMesh(car);
        return car;
      }
    }
  }
  car.x = nx;
  car.z = nz;
  syncCarMesh(car);
  return car;
}

// Alias nama gerak yang lugas.
export const driveCar = updateCar;

// Kecepatan dalam km/jam (untuk HUD).
export function carSpeedKmh(car) {
  return Math.abs(car.speed) * 3.6;
}
