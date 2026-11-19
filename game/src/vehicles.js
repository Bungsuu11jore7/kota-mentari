// vehicles.js — Kendaraan "KOTA MENTARI" (gta6-01, Lane B).
// Mobil low-poly orisinal (body + kabin + 4 roda + lampu), fisika arcade:
// akselerasi, belok sebanding kecepatan, handbrake = drift, tabrak gedung =
// berhenti + damage. three.js r170, nol aset/network eksternal.
import * as THREE from 'three';

// Dimensi mobil (satuan dunia: 1 unit = 1 meter-ish, jalan tiap 100 unit).
const CAR_LENGTH = 4.4;
const CAR_WIDTH = 2.0;
const BODY_HEIGHT = 0.85;
const BODY_Y = 0.65; // pusat body di atas tanah (roda radius 0.42)
const CABIN_LENGTH = 2.2;
const CABIN_WIDTH = 1.7;
const CABIN_HEIGHT = 0.7;
const WHEEL_RADIUS = 0.42;
const WHEEL_WIDTH = 0.32;

// Batas dunia (kontrak: grid 800x800, pusat 0,0).
const WORLD_HALF = 396;

// Palet lampu.
const HEADLIGHT_COLOR = 0xfff6c8;
const TAILLIGHT_COLOR = 0xff2a22;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// Selisih sudut terpendek, hasil di [-PI, PI].
function angleDiff(target, current) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Bangun satu mobil low-poly dan tambahkan ke scene.
 * opts: { color, x, z, heading, maxSpeed, accel, health, onCollide }
 * heading: radian; arah maju = (sin h, 0, cos h), rotation.y = heading.
 * Mengembalikan car { group, pos, heading, speed, slide, maxSpeed, accel,
 *   health, maxHealth, wheels, onCollide, driver }.
 * pos adalah group.position (Vector3 yang sama) supaya selalu sinkron.
 */
export function createCar(scene, opts = {}) {
  const color = opts.color !== undefined ? opts.color : 0xc23b2e;
  const heading = opts.heading || 0;
  const group = new THREE.Group();
  group.position.set(opts.x || 0, 0, opts.z || 0);
  group.rotation.y = heading;

  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xb8bec6 });

  // Body utama.
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_LENGTH, BODY_HEIGHT, CAR_WIDTH), paint);
  body.position.y = BODY_Y;
  group.add(body);

  // Kabin (kaca) — sedikit ke belakang dari tengah.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(CABIN_LENGTH, CABIN_HEIGHT, CABIN_WIDTH), glass);
  cabin.position.set(-0.25, BODY_Y + BODY_HEIGHT / 2 + CABIN_HEIGHT / 2 - 0.05, 0);
  group.add(cabin);

  // Atap kabin sewarna body (tipis) supaya siluet lebih rapi.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(CABIN_LENGTH * 0.9, 0.08, CABIN_WIDTH * 0.92), paint);
  roof.position.set(-0.25, BODY_Y + BODY_HEIGHT / 2 + CABIN_HEIGHT - 0.02, 0);
  group.add(roof);

  // Bemper depan/belakang.
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, CAR_WIDTH * 0.96), chrome);
  bumperF.position.set(CAR_LENGTH / 2 + 0.05, 0.42, 0);
  group.add(bumperF);
  const bumperB = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, CAR_WIDTH * 0.96), chrome);
  bumperB.position.set(-CAR_LENGTH / 2 - 0.05, 0.42, 0);
  group.add(bumperB);

  // Lampu depan (emissive hangat) dan belakang (emissive merah).
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: HEADLIGHT_COLOR, emissiveIntensity: 0.9 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0x7a0d08, emissive: TAILLIGHT_COLOR, emissiveIntensity: 0.7 });
  const lampGeo = new THREE.BoxGeometry(0.12, 0.22, 0.42);
  for (const zSide of [-0.62, 0.62]) {
    const head = new THREE.Mesh(lampGeo, headMat);
    head.position.set(CAR_LENGTH / 2 + 0.02, 0.78, zSide);
    group.add(head);
    const tail = new THREE.Mesh(lampGeo, tailMat);
    tail.position.set(-CAR_LENGTH / 2 - 0.02, 0.78, zSide);
    group.add(tail);
  }

  // 4 roda: silinder diputar agar sumbunya sejajar sumbu Z mobil.
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 12);
  wheelGeo.rotateX(Math.PI / 2);
  const wheels = [];
  const wheelX = [CAR_LENGTH / 2 - 0.85, -CAR_LENGTH / 2 + 0.85];
  const wheelZ = [CAR_WIDTH / 2 - 0.05, -CAR_WIDTH / 2 + 0.05];
  for (const wx of wheelX) {
    for (const wz of wheelZ) {
      const wheel = new THREE.Mesh(wheelGeo, dark);
      wheel.position.set(wx, WHEEL_RADIUS, wz);
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  scene.add(group);

  const car = {
    group,
    pos: group.position, // Vector3 yang sama dengan group.position
    heading,
    speed: 0,
    slide: 0, // kecepatan lateral (drift), meluruh oleh grip
    maxSpeed: opts.maxSpeed || 34,
    accel: opts.accel || 20,
    health: opts.health !== undefined ? opts.health : 100,
    maxHealth: opts.health !== undefined ? opts.health : 100,
    wheels,
    onCollide: opts.onCollide || null,
    driver: null,
    // Dipakai traffic/polisi: kecepatan jelajah bila dikemudikan AI.
    cruiseSpeed: 0,
  };
  return car;
}

/**
 * Satu langkah fisika arcade.
 * input: { throttle (-1..1, + = gas), steer (-1..1, + = kiri),
 *          brake (bool), handbrake (bool, Space = drift) }
 * world: objek kontrak Lane A — dipakai isBlocked(x, z, r) bila ada.
 * Tabrakan gedung: mobil berhenti (pantul kecil), health berkurang
 * sebanding benturan, callback onCollide({ impact, car }) bila ada.
 */
export function updateCar(car, input = {}, dt = 1 / 60, world = null) {
  dt = Math.min(dt, 0.05);
  const throttle = clamp(input.throttle || 0, -1, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  const brake = !!input.brake;
  const handbrake = !!input.handbrake;

  const maxFwd = car.maxSpeed;
  const maxRev = -car.maxSpeed * 0.38;

  // --- Akselerasi / rem / drag ---
  if (brake) {
    // Rem: kecepatan menuju 0 dengan cepat.
    const decel = 34 * dt;
    car.speed = Math.abs(car.speed) <= decel ? 0 : car.speed - Math.sign(car.speed) * decel;
  } else if (throttle !== 0) {
    car.speed += throttle * car.accel * dt;
  }
  // Drag udara + rolling: selalu meluruhkan kecepatan.
  car.speed -= car.speed * (handbrake ? 1.1 : 0.45) * dt;
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, maxRev, maxFwd);

  // --- Belok: sebanding kecepatan (makin pelan makin susah belok) ---
  const speedFactor = clamp(Math.abs(car.speed) / 10, 0, 1);
  let turnRate = 2.3 * speedFactor;
  if (handbrake) turnRate *= 1.75; // handbrake = putaran lebih liar
  car.heading += steer * turnRate * Math.sign(car.speed || 1) * dt;

  // --- Drift: handbrake sambil belok membangun slide lateral ---
  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);
  if (handbrake && Math.abs(car.speed) > 4) {
    car.slide += steer * car.speed * 0.55 * dt;
    car.slide = clamp(car.slide, -9, 9);
  }
  // Grip: slide meluruh cepat tanpa handbrake, lambat saat handbrake.
  car.slide *= Math.max(0, 1 - (handbrake ? 1.4 : 5.0) * dt);

  // --- Pindah posisi ---
  let nx = car.pos.x + (forwardX * car.speed + rightX * car.slide) * dt;
  let nz = car.pos.z + (forwardZ * car.speed + rightZ * car.slide) * dt;

  // --- Tabrakan gedung / batas dunia ---
  let blocked = false;
  if (world && typeof world.isBlocked === 'function') {
    blocked = world.isBlocked(nx, nz, 2.3);
  }
  if (!blocked && (Math.abs(nx) > WORLD_HALF || Math.abs(nz) > WORLD_HALF)) {
    blocked = true;
  }
  if (blocked) {
    const impact = Math.abs(car.speed) + Math.abs(car.slide) * 0.5;
    if (impact > 3) {
      const damage = (impact - 3) * 0.9;
      car.health = Math.max(0, car.health - damage);
      if (car.onCollide) {
        try {
          car.onCollide({ impact, damage, car });
        } catch (e) {
          // Callback suara/UI tidak boleh mematikan fisika.
        }
      }
    }
    // Berhenti + pantul kecil ke arah datang.
    car.speed = -car.speed * 0.22;
    car.slide *= 0.3;
    nx = car.pos.x;
    nz = car.pos.z;
  }

  car.pos.x = nx;
  car.pos.z = nz;
  car.group.rotation.y = car.heading;

  // Putar roda sesuai kecepatan maju (visual saja).
  const spin = (car.speed * dt) / WHEEL_RADIUS;
  for (const wheel of car.wheels) {
    wheel.rotation.z += spin;
  }
}

/**
 * Pemain naik ke kursi pengemudi. player: objek Lane D
 * ({ pos: Vector3, group?: Object3D, inCar, car } — field opsional
 * ditangani defensif). Setelah ini player.inCar = car.
 */
export function enterCar(player, car) {
  if (!player || !car) return;
  player.inCar = car;
  player.car = car;
  car.driver = player;
  if (player.pos) {
    player.pos.copy(car.pos);
  }
  if (player.group) {
    player.group.visible = false;
  }
}

/**
 * Pemain keluar ke samping mobil (sisi kanan pengemudi). Setelah ini
 * player.inCar = null dan figur pemain terlihat lagi.
 */
export function exitCar(player, car) {
  if (!player || !car) return;
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);
  if (player.pos) {
    player.pos.set(car.pos.x + rightX * 3.0, 0, car.pos.z + rightZ * 3.0);
    if (player.group) {
      player.group.position.copy(player.pos);
    }
  }
  player.inCar = null;
  player.car = null;
  car.driver = null;
  car.speed = 0;
  if (player.group) {
    player.group.visible = true;
  }
}
