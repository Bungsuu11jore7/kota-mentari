// traffic.js — Lalu lintas Kota Mentari: 28 mobil + 45 pejalan kaki aktif.
// Mobil mengikuti graf jalan simpul-ke-simpul; pejalan kaki berjalan di
// trotoar, menyeberang sesekali, dan menghindar saat mobil pemain mendekat.
// Jumlah aktif dipertahankan selama bermain (graf tertutup, tidak ada yang
// keluar kota). Urutan update BEKU (state-first): keadaan, delta waktu,
// dunia, konteks.
import * as THREE from '../vendor/three.module.min.js';
import { createCar, syncCarMesh } from './vehicles.js';
import { createSeededRng } from './world.js';

export const TRAFFIC_CAR_COUNT = 28;
export const PEDESTRIAN_COUNT = 45;

const CAR_COLORS = [
  0xd21f1f, 0x2e6fd8, 0xf2f2e8, 0x3c3c40, 0x27ae60,
  0xf2c200, 0x8e44ad, 0x16a085, 0x7f8c8d, 0xe67e22,
];
const SHIRT_COLORS = [
  0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6,
  0xfd79a8, 0x00cec9, 0xfdcb6e, 0x6c5ce7, 0xffffff,
];
const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

function nodeEdges(world) {
  const map = new Map();
  world.roadNodes.forEach((n) => map.set(n.id, []));
  world.roadEdges.forEach((e, i) => {
    map.get(e.a).push(i);
    map.get(e.b).push(i);
  });
  return map;
}

function edgeEnds(world, edgeIdx) {
  const e = world.roadEdges[edgeIdx];
  return { a: world.roadNodes[e.a], b: world.roadNodes[e.b] };
}

// Membuat keadaan traffic. world dari buildCity; scene boleh null
// (logika saja tanpa mesh — dipakai smoke test).
export function createTrafficState(world, scene) {
  const rng = createSeededRng(7);
  const edgesByNode = nodeEdges(world);
  const state = {
    world,
    cars: [],
    peds: [],
    edgesByNode,
    rng,
  };

  for (let i = 0; i < TRAFFIC_CAR_COUNT; i++) {
    const node = world.roadNodes[Math.floor(rng() * world.roadNodes.length)];
    const nextId = node.neighbors[Math.floor(rng() * node.neighbors.length)];
    const next = world.roadNodes[nextId];
    const maxSpeed = 7 + rng() * 6;
    const t = rng();
    const dx = next.x - node.x;
    const dz = next.z - node.z;
    const len = Math.hypot(dx, dz);
    const car = {
      id: i,
      node: node.id,
      next: nextId,
      t,
      speed: maxSpeed * (0.5 + rng() * 0.5),
      maxSpeed,
      color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
      x: node.x + dx * t,
      z: node.z + dz * t,
      heading: Math.atan2(dx, dz),
      mesh: null,
      active: true,
    };
    // Offset lajur kanan (+3.2 dari garis tengah).
    const px = -dz / len;
    const pz = dx / len;
    car.x += px * 3.2;
    car.z += pz * 3.2;
    car.meshCar = createCar(car.color, car.x, car.z, car.heading, scene);
    car.mesh = car.meshCar.mesh;
    state.cars.push(car);
  }

  for (let i = 0; i < PEDESTRIAN_COUNT; i++) {
    const edgeIdx = Math.floor(rng() * world.roadEdges.length);
    const { a, b } = edgeEnds(world, edgeIdx);
    const ped = {
      id: i,
      edge: edgeIdx,
      t: rng(),
      dir: rng() < 0.5 ? 1 : -1,
      side: rng() < 0.5 ? 1 : -1,
      speed: 0.8 + rng() * 0.8,
      x: a.x + (b.x - a.x) * 0.5,
      z: a.z + (b.z - a.z) * 0.5,
      heading: 0,
      state: 'walk',
      crossT: 0,
      shirt: SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)],
      skin: SKIN_COLORS[Math.floor(rng() * SKIN_COLORS.length)],
      mesh: null,
      active: true,
    };
    ped.mesh = createPedestrianMesh(ped, scene);
    state.peds.push(ped);
  }
  return state;
}

function createPedestrianMesh(ped, scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.3, 1.05, 8),
    new THREE.MeshLambertMaterial({ color: ped.shirt }),
  );
  body.position.y = 0.95;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: ped.skin }),
  );
  head.position.y = 1.68;
  group.add(head);
  group.position.set(ped.x, 0, ped.z);
  if (scene && typeof scene.add === 'function') scene.add(group);
  return group;
}

function updateTrafficCar(state, car, dt, world, ctx) {
  const from = world.roadNodes[car.node];
  const to = world.roadNodes[car.next];
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;

  // Kecepatan yang diinginkan: melambat bila ada mobil di depan.
  let desired = car.maxSpeed;
  for (const other of state.cars) {
    if (other === car || !other.active) continue;
    const ox = other.x - car.x;
    const oz = other.z - car.z;
    const dist = Math.hypot(ox, oz);
    if (dist > 14 || dist < 0.01) continue;
    const ahead = (ox * ux + oz * uz) / dist;
    if (ahead > 0.6) {
      if (dist < 6) desired = 0;
      else desired = Math.min(desired, other.speed);
    }
  }
  // Melambat bila mobil pemain tepat di depan.
  const player = ctx?.player;
  if (player && player.inCar) {
    const ox = player.x - car.x;
    const oz = player.z - car.z;
    const dist = Math.hypot(ox, oz);
    if (dist < 12 && dist > 0.01) {
      const ahead = (ox * ux + oz * uz) / dist;
      if (ahead > 0.6) desired = dist < 6 ? 0 : Math.min(desired, 3);
    }
  }
  car.speed += (desired - car.speed) * Math.min(1, 3 * dt);

  car.t += (car.speed * dt) / len;
  if (car.t >= 1) {
    // Sampai di simpul: pilih sisi berikutnya (hindari putar balik).
    const arrived = car.next;
    const node = world.roadNodes[arrived];
    const choices = node.neighbors.filter((n) => n !== car.node);
    const nextId = choices.length > 0
      ? choices[Math.floor(state.rng() * choices.length)]
      : node.neighbors[0];
    car.node = arrived;
    car.next = nextId;
    car.t = 0;
  }
  const fromNow = world.roadNodes[car.node];
  const toNow = world.roadNodes[car.next];
  const ndx = toNow.x - fromNow.x;
  const ndz = toNow.z - fromNow.z;
  const nlen = Math.hypot(ndx, ndz) || 1;
  const px = -ndz / nlen;
  const pz = ndx / nlen;
  car.x = fromNow.x + ndx * car.t + px * 3.2;
  car.z = fromNow.z + ndz * car.t + pz * 3.2;
  car.heading = Math.atan2(ndx, ndz);
  if (car.meshCar) {
    car.meshCar.x = car.x;
    car.meshCar.z = car.z;
    car.meshCar.heading = car.heading;
    car.meshCar.speed = car.speed;
    car.meshCar.steer = 0;
    syncCarMesh(car.meshCar);
  }
}

function updatePedestrian(state, ped, dt, world, ctx) {
  const edge = world.roadEdges[ped.edge];
  const a = world.roadNodes[edge.a];
  const b = world.roadNodes[edge.b];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  // Trotoar: 10 dari garis tengah jalan.
  const px = -uz * ped.side * 10;
  const pz = ux * ped.side * 10;

  if (ped.state === 'cross') {
    ped.crossT += dt / 2.2;
    if (ped.crossT >= 1) {
      ped.crossT = 0;
      ped.state = 'walk';
      ped.side = -ped.side;
    }
    const s = ped.side * (1 - ped.crossT * 2);
    ped.x = a.x + dx * ped.t - uz * s * 10;
    ped.z = a.z + dz * ped.t + ux * s * 10;
    ped.heading = Math.atan2(-uz * Math.sign(ped.side), ux * Math.sign(ped.side));
  } else {
    ped.t += (ped.dir * ped.speed * dt) / len;
    if (ped.t >= 1 || ped.t <= 0) {
      // Ujung trotoar: belok ke sisi yang terhubung di simpul itu.
      const endNode = ped.t >= 1 ? edge.b : edge.a;
      const options = state.edgesByNode.get(endNode) ?? [];
      const nextEdge = options.length > 0
        ? options[Math.floor(state.rng() * options.length)]
        : ped.edge;
      const ne = world.roadEdges[nextEdge];
      ped.edge = nextEdge;
      if (ne.a === endNode) {
        ped.t = 0;
        ped.dir = 1;
      } else {
        ped.t = 1;
        ped.dir = -1;
      }
    }
    // Sesekali menyeberang jalan.
    if (state.rng() < dt * 0.02) ped.state = 'cross';
    ped.x = a.x + dx * ped.t + px;
    ped.z = a.z + dz * ped.t + pz;
    ped.heading = Math.atan2(ux * ped.dir, uz * ped.dir);
  }

  // Menghindar saat mobil pemain mendekat.
  const player = ctx?.player;
  if (player && player.inCar) {
    const ox = ped.x - player.x;
    const oz = ped.z - player.z;
    const dist = Math.hypot(ox, oz);
    if (dist < 7 && dist > 0.01) {
      ped.x += (ox / dist) * 2.8 * dt;
      ped.z += (oz / dist) * 2.8 * dt;
      ped.heading = Math.atan2(ox / dist, oz / dist);
    }
  }
  if (ped.mesh) {
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}

// Update tiap frame. Urutan BEKU: keadaan, delta waktu, dunia, konteks.
export function updateTraffic(state, dt, world, ctx) {
  const step = Math.min(Math.max(dt ?? 0.016, 0), 0.05);
  const w = world ?? state.world;
  for (const car of state.cars) {
    if (car.active) updateTrafficCar(state, car, step, w, ctx);
  }
  for (const ped of state.peds) {
    if (ped.active) updatePedestrian(state, ped, step, w, ctx);
  }
  return state;
}

// Daftar mobil / pejalan kaki aktif (untuk HUD, minimap, tabrakan).
export function getTrafficCars(state) {
  return state.cars.filter((c) => c.active);
}
export function getPedestrians(state) {
  return state.peds.filter((p) => p.active);
}
export function getActiveCounts(state) {
  return { cars: getTrafficCars(state).length, peds: getPedestrians(state).length };
}
