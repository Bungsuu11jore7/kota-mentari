// KOTA MENTARI — pembuat mobil (Lane B, v12)
// Mobil balok: badan + kabin + 4 roda hitam. Polisi hitam-putih berpalang
// lampu; mobil target oranye terang. Arah maju mengikuti (sin, cos) sudut.
import * as THREE from '../vendor/three.module.min.js';
import { findRoadPath, nearestNodeId, edgeCrossesCorridor } from './world.js';

export const TARGET_COLOR = 0xff7f00; // oranye terang (mobil target misi)
export const POLICE_BODY = 0xf5f5f5;
export const POLICE_TRIM = 0x141414;

const BODY_COLORS = [
  0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0x8e44ad,
  0xe67e22, 0xecf0f1, 0x2c3e50, 0x16a085, 0xd35400, 0x7f8c8d,
];

export function randomBodyColor(rng) {
  const r = rng || Math.random;
  return BODY_COLORS[Math.floor(r() * BODY_COLORS.length)];
}

// ---- Pembuat mobil: createCar(color, type) ----
// type: 'sedan' | 'police' | 'target' | 'taxi' | 'truck'
export function createCar(color, type) {
  const kind = type || 'sedan';
  let bodyColor = color === undefined ? randomBodyColor() : color;
  if (kind === 'police') bodyColor = POLICE_BODY;
  if (kind === 'target') bodyColor = TARGET_COLOR;

  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

  // Badan (panjang di sumbu z: maju = +z saat heading 0)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 4.4), bodyMat);
  body.position.y = 0.75;
  group.add(body);

  // Kabin kaca
  const cabinColor = kind === 'police' ? POLICE_TRIM : 0x1a2733;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.8, 2.2),
    new THREE.MeshLambertMaterial({ color: cabinColor })
  );
  cabin.position.set(0, 1.55, -0.2);
  group.add(cabin);

  // Roda hitam (4)
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelSpots = [
    [-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5],
  ];
  for (const [wx, wz] of wheelSpots) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
  }

  if (kind === 'police') {
    // Panel hitam di kap depan + bagasi
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.12, 1.0),
      new THREE.MeshLambertMaterial({ color: POLICE_TRIM })
    );
    hood.position.set(0, 1.22, 1.6);
    group.add(hood);
    const trunk = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.12, 0.9),
      new THREE.MeshLambertMaterial({ color: POLICE_TRIM })
    );
    trunk.position.set(0, 1.22, -1.7);
    group.add(trunk);
    // Palang lampu merah-biru di atap kabin
    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    barBase.position.set(0, 2.05, -0.2);
    group.add(barBase);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.22, 0.42),
      new THREE.MeshLambertMaterial({ color: 0xff2222 })
    );
    red.position.set(-0.35, 2.05, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.22, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x2244ff })
    );
    blue.position.set(0.35, 2.05, -0.2);
    group.add(blue);
  }

  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.25, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xf1c40f })
    );
    sign.position.set(0, 2.05, -0.2);
    group.add(sign);
  }

  group.userData.type = kind;
  group.userData.color = bodyColor;
  return group;
}

// ---- Keadaan mobil ----
export function createCarState(mesh, x, z, heading, speed) {
  return {
    mesh: mesh || null,
    x: x || 0,
    z: z || 0,
    heading: heading || 0,
    speed: speed || 0,
    stolen: false,
    type: (mesh && mesh.userData && mesh.userData.type) || 'sedan',
    color: (mesh && mesh.userData && mesh.userData.color) || 0xc0392b,
    path: null,
    pathIndex: 0,
  };
}

export function syncCarMesh(state) {
  if (!state.mesh) return;
  state.mesh.position.set(state.x, 0, state.z);
  state.mesh.rotation.y = state.heading;
}

// ---- Pemuncul mobil di titik jalan ----
export function spawnCarOnRoad(world, scene, color, type, rng) {
  if (!world || !world.graph) throw new Error('spawnCarOnRoad: world dengan graf jalan wajib diberikan');
  if (!scene || typeof scene.add !== 'function') {
    throw new Error('spawnCarOnRoad: scene wajib diberikan');
  }
  const r = rng || Math.random;
  const graph = world.graph;
  let edge = null;
  let tries = 0;
  while (tries < 60) {
    tries += 1;
    const e = graph.edges[Math.floor(r() * graph.edges.length)];
    const a = graph.nodes[e.a];
    const b = graph.nodes[e.b];
    if (edgeCrossesCorridor(a.x, a.z, b.x, b.z)) continue;
    edge = e;
    break;
  }
  if (!edge) throw new Error('spawnCarOnRoad: tidak ada ruas jalan valid');
  const a = graph.nodes[edge.a];
  const b = graph.nodes[edge.b];
  const t = 0.15 + r() * 0.7;
  const x = a.x + (b.x - a.x) * t;
  const z = a.z + (b.z - a.z) * t;
  const heading = Math.atan2(b.x - a.x, b.z - a.z);
  const mesh = createCar(color, type);
  scene.add(mesh);
  const state = createCarState(mesh, x, z, heading, 6 + r() * 5);
  state.fromNode = edge.a;
  state.toNode = edge.b;
  syncCarMesh(state);
  return state;
}

// ---- Penggerak mobil sepanjang jalan ----
export function driveCarAlongRoad(state, dt, world) {
  if (!state || !world || !world.graph) return;
  if (state.stolen === true) return; // mobil curian dikemudikan pemain
  const step = state.speed * dt;
  if (!state.path || state.pathIndex >= state.path.length) {
    // Pilih tujuan simpul acak, cari jalur lewat graf jalan.
    const graph = world.graph;
    const dest = graph.nodes[Math.floor(Math.random() * graph.nodes.length)];
    const path = findRoadPath(world, state.x, state.z, dest.x, dest.z);
    if (!path || path.length < 2) return;
    state.path = path;
    state.pathIndex = 1;
  }
  const target = state.path[state.pathIndex];
  const dx = target.x - state.x;
  const dz = target.z - state.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= Math.max(step, 0.5)) {
    state.x = target.x;
    state.z = target.z;
    state.pathIndex += 1;
  } else {
    const nx = dx / dist;
    const nz = dz / dist;
    state.x += nx * step;
    state.z += nz * step;
    state.heading = Math.atan2(nx, nz);
  }
  syncCarMesh(state);
}

export default createCar;
