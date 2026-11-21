// world.js — Kota Mentari: bangun kota, graf jalan, dan cari jalur.
// Kota pesisir tropis fiktif dengan lima distrik: Pelabuhan, Pasar Lama,
// Menara, Pesisir, dan Bukit. Semua keacakan memakai RNG berbiji tetap
// (benih 7) sehingga kota deterministik di setiap pemuatan.
import * as THREE from '../vendor/three.module.min.js';

// RNG berbiji sederhana (mulberry32). Ditulis di file ini supaya dunia
// tidak bergantung pada modul lain.
export function createSeededRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITY_SEED = 7;
export const GRID_MIN = -400;
export const GRID_MAX = 400;
export const GRID_STEP = 100;
export const GRID_N = 9;
export const ROAD_HALF_WIDTH = 7;

// Koordinat misi yang BEKU (dipakai modul lain, jangan digeser).
export const MISSION_POINTS = {
  menara: { x: 100, z: -300 },
  pesisir: { x: 0, z: 400 },
  mira: { x: -200, z: 100 },
  pelabuhan: { x: 400, z: 300 },
  kapal: { x: 470, z: 350 },
  mobilMisi2: { x: 100, z: 0 },
};

// Distrik berdasarkan posisi. Urutan penting: Pelabuhan dulu (timur),
// lalu Pesisir (selatan), Menara (utara), Pasar Lama (barat), Bukit.
export function districtAt(x, z) {
  if (x >= 300) return 'Pelabuhan';
  if (z >= 300) return 'Pesisir';
  if (z <= -200 && x >= -100) return 'Menara';
  if (x <= -200 && z >= -100 && z <= 300) return 'Pasar Lama';
  if (x <= -100 && z <= -200) return 'Bukit';
  return 'Pusat';
}

// Graf jalan: grid 9x9 = 81 simpul, sisi antar tetangga ortogonal = 144.
function buildRoadGraph() {
  const nodes = [];
  for (let r = 0; r < GRID_N; r++) {
    for (let c = 0; c < GRID_N; c++) {
      nodes.push({
        id: r * GRID_N + c,
        x: GRID_MIN + c * GRID_STEP,
        z: GRID_MIN + r * GRID_STEP,
        neighbors: [],
      });
    }
  }
  const edges = [];
  const addEdge = (a, b) => {
    const na = nodes[a];
    const nb = nodes[b];
    edges.push({
      a,
      b,
      ax: na.x,
      az: na.z,
      bx: nb.x,
      bz: nb.z,
      len: Math.hypot(nb.x - na.x, nb.z - na.z),
    });
    na.neighbors.push(b);
    nb.neighbors.push(a);
  };
  for (let r = 0; r < GRID_N; r++) {
    for (let c = 0; c < GRID_N; c++) {
      const id = r * GRID_N + c;
      if (c + 1 < GRID_N) addEdge(id, id + 1);
      if (r + 1 < GRID_N) addEdge(id, id + GRID_N);
    }
  }
  return { nodes, edges };
}

// Cache material per warna supaya tidak membuat ribuan material.
const materialCache = new Map();
function mat(color) {
  let m = materialCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    materialCache.set(color, m);
  }
  return m;
}

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  return mesh;
}

function addToScene(scene, obj) {
  if (scene && typeof scene.add === 'function') scene.add(obj);
}

// Membangun kota sekali dari benih tetap. Mengembalikan SATU objek dunia
// dengan field: buildings, roadNodes, roadEdges, validSpawns, props, ship,
// ditambah helper findRoadPath, nearestNode, isOnRoad, collidesBuilding,
// spawnPoint, dan districtAt.
export function buildCity(scene) {
  const rng = createSeededRng(CITY_SEED);
  const { nodes, edges } = buildRoadGraph();

  const world = {
    buildings: [],
    roadNodes: nodes,
    roadEdges: edges,
    validSpawns: [],
    props: [],
    ship: null,
    seed: CITY_SEED,
  };

  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // ---- Tanah, laut, pantai ----
  addToScene(scene, box(1300, 0.2, 1300, 0x86b364, 0, -0.1, 0));
  // Laut di timur (x > 480) dan selatan (z > 480).
  addToScene(scene, box(640, 0.1, 1300, 0x2e7f9e, 800, 0.02, 0));
  addToScene(scene, box(1100, 0.1, 640, 0x2e7f9e, -70, 0.02, 800));
  // Pantai pasir di tepi selatan kota (z 400..480).
  addToScene(scene, box(1080, 0.1, 80, 0xe0c98f, -60, 0.01, 440));

  // ---- Jalan + trotoar ----
  // Trotoar (lebih lebar, terang) di bawah aspal (sempit, gelap).
  for (const e of edges) {
    const alongX = e.az === e.bz;
    const mx = (e.ax + e.bx) / 2;
    const mz = (e.az + e.bz) / 2;
    if (alongX) {
      addToScene(scene, box(e.len + 16, 0.08, 24, 0x9a9a92, mx, 0.04, mz));
      addToScene(scene, box(e.len, 0.1, ROAD_HALF_WIDTH * 2, 0x3a3a40, mx, 0.08, mz));
    } else {
      addToScene(scene, box(24, 0.08, e.len + 16, 0x9a9a92, mx, 0.04, mz));
      addToScene(scene, box(ROAD_HALF_WIDTH * 2, 0.1, e.len, 0x3a3a40, mx, 0.08, mz));
    }
  }
  // Garis putus-putus di dua avenue utama (x = 0 dan z = 0).
  for (const e of edges) {
    const isAvenueX = e.ax === 0 && e.bx === 0;
    const isAvenueZ = e.az === 0 && e.bz === 0;
    if (!isAvenueX && !isAvenueZ) continue;
    const steps = Math.floor(e.len / 20);
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const dx = e.ax + (e.bx - e.ax) * t;
      const dz = e.az + (e.bz - e.az) * t;
      if (isAvenueX) addToScene(scene, box(0.4, 0.06, 6, 0xf2f2e8, dx, 0.14, dz));
      else addToScene(scene, box(6, 0.06, 0.4, 0xf2f2e8, dx, 0.14, dz));
    }
  }

  // ---- Gedung: 1-3 per blok (8x8 blok), tidak pernah menutupi jalan ----
  const PALETTES = {
    Menara: [0x8fa3b8, 0x6b7f95, 0xa8b8c8, 0x5d6d7e, 0xb0c4d8],
    Pelabuhan: [0xb08968, 0x9c7b54, 0x7d8a96, 0xa67c52],
    'Pasar Lama': [0xd9a441, 0xc96f4a, 0xe0b45c, 0xb85c38, 0xd98e32],
    Pesisir: [0xf2e3c6, 0xf7d9a0, 0xcfe8e0, 0xf2c9a0, 0xe8f0f2],
    Bukit: [0x9db08a, 0x8a9a7b, 0xb5a684, 0x7f8f6f],
    Pusat: [0xc9b8a3, 0xb8a88f, 0x9fb3c8, 0xd8cdb8, 0xa89a80],
  };
  const ROOF = 0x4a4640;

  function placeBuilding(cx, cz, w, d, h, district) {
    const color = pick(PALETTES[district]);
    const b = { x: cx, z: cz, w, d, h, district, color };
    const group = new THREE.Group();
    const body = box(w, h, d, color, 0, h / 2, 0);
    group.add(body);
    group.add(box(w * 0.9, 0.6, d * 0.9, ROOF, 0, h + 0.3, 0));
    group.position.set(cx, 0, cz);
    b.mesh = group;
    addToScene(scene, group);
    world.buildings.push(b);
    return b;
  }

  function districtSize(district) {
    switch (district) {
      case 'Menara': return { hMin: 25, hMax: 70, sMin: 20, sMax: 32 };
      case 'Pelabuhan': return { hMin: 8, hMax: 13, sMin: 34, sMax: 52 };
      case 'Pasar Lama': return { hMin: 6, hMax: 12, sMin: 14, sMax: 24 };
      case 'Pesisir': return { hMin: 5, hMax: 10, sMin: 16, sMax: 26 };
      case 'Bukit': return { hMin: 8, hMax: 18, sMin: 16, sMax: 28 };
      default: return { hMin: 10, hMax: 26, sMin: 18, sMax: 30 };
    }
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cx = GRID_MIN + 50 + c * GRID_STEP;
      const cz = GRID_MIN + 50 + r * GRID_STEP;
      const district = districtAt(cx, cz);
      const sz = districtSize(district);
      const roll = rng();
      const count = roll < 0.15 ? 1 : roll < 0.7 ? 2 : 3;
      const size = () => sz.sMin + rng() * (sz.sMax - sz.sMin);
      const height = () => sz.hMin + rng() * (sz.hMax - sz.hMin);
      const jitter = () => (rng() - 0.5) * 12;
      if (count === 1) {
        placeBuilding(cx + jitter(), cz + jitter(), size(), size(), height(), district);
      } else if (count === 2) {
        const alongX = rng() < 0.5;
        for (const s of [-17, 17]) {
          const w = size() * 0.62;
          const d = size() * 0.62;
          placeBuilding(
            alongX ? cx + s + jitter() * 0.4 : cx + jitter() * 0.4,
            alongX ? cz + jitter() * 0.4 : cz + s + jitter() * 0.4,
            w, d, height(), district,
          );
        }
      } else {
        const alongX = rng() < 0.5;
        for (const s of [-22, 0, 22]) {
          const w = size() * 0.52;
          const d = size() * 0.52;
          placeBuilding(
            alongX ? cx + s + jitter() * 0.3 : cx + jitter() * 0.3,
            alongX ? cz + jitter() * 0.3 : cz + s + jitter() * 0.3,
            w, d, height(), district,
          );
        }
      }
    }
  }

  // ---- Properti: lampu, palem, kios, kontainer, bangku, peti, hydrant ----
  // Koridor dermaga (x 395..485, z 318..382) WAJIB bersih: tidak ada
  // properti apa pun di dalam persegi itu kecuali permukaan dermaga.
  function inHarborCorridor(x, z) {
    return x >= 395 && x <= 485 && z >= 318 && z <= 382;
  }
  function addProp(type, x, z, obj) {
    if (inHarborCorridor(x, z)) return null;
    obj.position.set(x, obj.position.y, z);
    addToScene(scene, obj);
    const p = { type, x, z, mesh: obj };
    world.props.push(p);
    return p;
  }

  // Lampu jalan: 1 di tiap simpul + 1 lagi di simpul bernomor genap = 122.
  for (const n of nodes) {
    const spots = [[10, 10]];
    if (n.id % 2 === 0) spots.push([-10, -10]);
    for (const [ox, oz] of spots) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 5, 6),
        mat(0x3c3c40),
      );
      pole.position.y = 2.5;
      g.add(pole);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.35, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
      );
      head.position.y = 5.1;
      g.add(head);
      addProp('lamp', n.x + ox, n.z + oz, g);
    }
  }

  // Palem: tepi pantai + sebaran Bukit + plaza Menara = 73.
  const palmSpots = [];
  for (let x = -400; x <= 400; x += 40) palmSpots.push([x, 412]);
  for (let x = -380; x <= 380; x += 40) palmSpots.push([x, 438]);
  for (let i = 0; i < 24; i++) {
    palmSpots.push([-380 + rng() * 280, -380 + rng() * 180]);
  }
  for (let i = 0; i < 8; i++) {
    palmSpots.push([60 + rng() * 120, -340 + rng() * 80]);
  }
  for (const [px, pz] of palmSpots) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.34, 6, 6),
      mat(0x8a6b48),
    );
    trunk.position.y = 3;
    trunk.rotation.z = (rng() - 0.5) * 0.12;
    g.add(trunk);
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(2.1, 8, 6),
      mat(0x3f9e4d),
    );
    top.scale.y = 0.55;
    top.position.y = 6.4;
    g.add(top);
    addProp('palm', px, pz, g);
  }

  // Kios Pasar Lama (8 blok x 4) + Pusat (4 blok x 2) = 40.
  const kioskBlocks = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cx = GRID_MIN + 50 + c * GRID_STEP;
      const cz = GRID_MIN + 50 + r * GRID_STEP;
      if (districtAt(cx, cz) === 'Pasar Lama') kioskBlocks.push([cx, cz, 4]);
      else if (districtAt(cx, cz) === 'Pusat' && (r + c) % 3 === 0) kioskBlocks.push([cx, cz, 2]);
    }
  }
  for (const [cx, cz, n] of kioskBlocks) {
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      g.add(box(4, 2.6, 4, pick([0xd9a441, 0xc96f4a, 0x7fb069, 0xe07a5f]), 0, 1.3, 0));
      g.add(box(4.8, 0.35, 4.8, pick([0xb85c38, 0x3d6b4f, 0x8e44ad]), 0, 2.8, 0));
      addProp('kiosk', cx + (rng() - 0.5) * 50, cz + (rng() - 0.5) * 50, g);
    }
  }

  // Kontainer Pelabuhan: 8 blok x 5 + 12 di dermaga (di luar koridor) = 52.
  const CONTAINER_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xe67e22, 0x8e44ad];
  for (let r = 0; r < 8; r++) {
    const cx = 350;
    const cz = GRID_MIN + 50 + r * GRID_STEP;
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const color = pick(CONTAINER_COLORS);
      g.add(box(6, 2.6, 2.6, color, 0, 1.3, 0));
      if (rng() < 0.4) g.add(box(6, 2.6, 2.6, pick(CONTAINER_COLORS), 0, 3.9, 0));
      g.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
      addProp('container', cx + (rng() - 0.5) * 56, cz + (rng() - 0.5) * 56, g);
    }
  }
  for (let i = 0; i < 6; i++) addProp('container', 415 + rng() * 50, 250 + rng() * 45, box(6, 2.6, 2.6, pick(CONTAINER_COLORS), 0, 1.3, 0));
  for (let i = 0; i < 6; i++) addProp('container', 415 + rng() * 45, 405 + rng() * 30, box(6, 2.6, 2.6, pick(CONTAINER_COLORS), 0, 1.3, 0));

  // Bangku di trotoar (40): di sisi jalan, bukan di tengah jalan.
  for (let i = 0; i < 40; i++) {
    const alongX = rng() < 0.5;
    const line = -400 + Math.floor(rng() * 8) * 100;
    const along = -380 + rng() * 760;
    const off = rng() < 0.5 ? -10 : 10;
    const bench = box(2.2, 0.5, 0.9, 0x7a5230, 0, 0.55, 0);
    bench.rotation.y = alongX ? 0 : Math.PI / 2;
    if (alongX) addProp('bench', along, line + off, bench);
    else addProp('bench', line + off, along, bench);
  }

  // Peti kayu di trotoar (di luar koridor) = 60.
  for (let i = 0; i < 60; i++) {
    const e = edges[Math.floor(rng() * edges.length)];
    const t = rng();
    const px = e.ax + (e.bx - e.ax) * t;
    const pz = e.az + (e.bz - e.az) * t;
    const alongX = e.az === e.bz;
    const ox = alongX ? 0 : (rng() < 0.5 ? -10 : 10);
    const oz = alongX ? (rng() < 0.5 ? -10 : 10) : 0;
    const crate = box(1.2, 1.2, 1.2, 0xa97c50, 0, 0.6, 0);
    crate.rotation.y = rng() * Math.PI;
    addProp('crate', px + ox, pz + oz, crate);
  }

  // Bollard kuning di tepi jalan pesisir = 17, hydrant merah = 24.
  for (let x = -400; x <= 400; x += 50) {
    const bol = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1, 8), mat(0xf2c200));
    bol.position.y = 0.5;
    addProp('bollard', x, 418, bol);
  }
  for (let i = 0; i < 24; i++) {
    const e = edges[Math.floor(rng() * edges.length)];
    const t = rng();
    const px = e.ax + (e.bx - e.ax) * t;
    const pz = e.az + (e.bz - e.az) * t;
    const alongX = e.az === e.bz;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.9, 8), mat(0xc0392b));
    body.position.y = 0.45;
    g.add(body);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0x922b21));
    cap.position.y = 1.0;
    g.add(cap);
    addProp('hydrant', px + (alongX ? 0 : 10), pz + (alongX ? 10 : 0), g);
  }

  // ---- Dermaga + kapal misi 6 (470, 350) ----
  // Dermaga kayu dari tepi timur kota (x 400) sampai dekat kapal.
  addToScene(scene, box(78, 0.6, 30, 0x9a7b4f, 437, 0.3, 350));
  addToScene(scene, box(78, 0.15, 2, 0x6b5433, 437, 0.65, 336));
  addToScene(scene, box(78, 0.15, 2, 0x6b5433, 437, 0.65, 364));
  const shipGroup = new THREE.Group();
  shipGroup.add(box(30, 6, 10, 0x2c4a63, 0, 3, 0));
  shipGroup.add(box(28, 1, 9, 0x7d8a96, 0, 6.5, 0));
  shipGroup.add(box(8, 6, 7, 0xf2f2e8, -8, 9, 0));
  shipGroup.add(box(6, 2.6, 2.6, 0xc0392b, 6, 8.3, 0));
  shipGroup.add(box(6, 2.6, 2.6, 0x2980b9, 6, 8.3, -3));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 9, 6), mat(0x3c3c40));
  mast.position.set(12, 11, 0);
  shipGroup.add(mast);
  shipGroup.position.set(MISSION_POINTS.kapal.x, 0, MISSION_POINTS.kapal.z);
  addToScene(scene, shipGroup);
  world.ship = { x: MISSION_POINTS.kapal.x, z: MISSION_POINTS.kapal.z, mesh: shipGroup };

  // ---- Titik spawn valid: simpul + titik tengah sisi = 225 ----
  for (const n of nodes) world.validSpawns.push({ x: n.x, z: n.z });
  for (const e of edges) {
    world.validSpawns.push({ x: (e.ax + e.bx) / 2, z: (e.az + e.bz) / 2 });
  }

  // ---- Helper di objek dunia ----
  world.districtAt = (x, z) => districtAt(x, z);
  world.findRoadPath = (start, goal) => findRoadPath(world, start, goal);
  world.nearestNode = (x, z) => nearestNode(world, x, z);
  world.isOnRoad = (x, z) => isOnRoad(world, x, z);
  world.collidesBuilding = (x, z, radius) => collidesBuilding(world, x, z, radius);
  world.spawnPoint = (i) => spawnPoint(world, i);

  return world;
}

// Simpul jalan terdekat dari sebuah titik.
export function nearestNode(world, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const n of world.roadNodes) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

// Titik {x, z} boleh juga berupa [x, z].
function asPoint(p) {
  if (Array.isArray(p)) return { x: p[0], z: p[1] };
  return { x: p.x, z: p.z };
}

// SATU-SATUNYA definisi cari jalur di seluruh game (perbaikan v7).
// A* di atas graf jalan internal. Mengembalikan daftar titik jalan
// {x, z} dari simpul terdekat titik awal sampai ke titik tujuan.
export function findRoadPath(world, start, goal) {
  const s = asPoint(start);
  const g = asPoint(goal);
  const startNode = nearestNode(world, s.x, s.z);
  const goalNode = nearestNode(world, g.x, g.z);
  if (startNode.id === goalNode.id) {
    return [{ x: g.x, z: g.z }];
  }
  const nodes = world.roadNodes;
  const open = [startNode.id];
  const cameFrom = new Map();
  const gScore = new Map([[startNode.id, 0]]);
  const fScore = new Map([[startNode.id, Math.hypot(goalNode.x - startNode.x, goalNode.z - startNode.z)]]);
  const closed = new Set();
  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if ((fScore.get(open[i]) ?? Infinity) < (fScore.get(open[bestIdx]) ?? Infinity)) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0];
    if (current === goalNode.id) {
      const path = [];
      let cur = current;
      while (cur !== undefined) {
        const n = nodes[cur];
        path.unshift({ x: n.x, z: n.z });
        cur = cameFrom.get(cur);
      }
      if (Math.hypot(g.x - goalNode.x, g.z - goalNode.z) > 1) {
        path.push({ x: g.x, z: g.z });
      }
      return path;
    }
    closed.add(current);
    const curNode = nodes[current];
    for (const nb of curNode.neighbors) {
      if (closed.has(nb)) continue;
      const nNode = nodes[nb];
      const tentative = (gScore.get(current) ?? Infinity)
        + Math.hypot(nNode.x - curNode.x, nNode.z - curNode.z);
      if (tentative < (gScore.get(nb) ?? Infinity)) {
        cameFrom.set(nb, current);
        gScore.set(nb, tentative);
        fScore.set(
          nb,
          tentative + Math.hypot(goalNode.x - nNode.x, goalNode.z - nNode.z),
        );
        if (!open.includes(nb)) open.push(nb);
      }
    }
  }
  // Graf terhubung penuh; fallback: garis lurus ke tujuan.
  return [{ x: s.x, z: s.z }, { x: g.x, z: g.z }];
}

// Benar bila titik berada di atas jalan atau trotoar (<= 9 dari garis tengah).
export function isOnRoad(world, x, z) {
  for (const e of world.roadEdges) {
    const dx = e.bx - e.ax;
    const dz = e.bz - e.az;
    const lenSq = dx * dx + dz * dz;
    let t = ((x - e.ax) * dx + (z - e.az) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = e.ax + dx * t;
    const pz = e.az + dz * t;
    if (Math.hypot(x - px, z - pz) <= ROAD_HALF_WIDTH + 2) return true;
  }
  return false;
}

// Tabrakan AABB dengan gedung; mengembalikan gedung yang tertabrak atau null.
export function collidesBuilding(world, x, z, radius) {
  const r = radius ?? 1;
  for (const b of world.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) {
      return b;
    }
  }
  return null;
}

// Titik spawn ke-i (deterministik, membungkus).
export function spawnPoint(world, i) {
  const n = world.validSpawns.length;
  return world.validSpawns[((i % n) + n) % n];
}
