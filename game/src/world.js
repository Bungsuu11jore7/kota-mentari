// KOTA MENTARI — pembangun kota (Lane B, v9)
// Kota pesisir tropis fiktif: persegi -500..500, kisi jalan tiap 100,
// lebar jalan 14, trotoar 4, graf jalan 81 simpul / 144 sisi.
// PERBAIKAN WAJIB v9: buildCity WAJIB menerima scene dan menambahkan SEMUA
// mesh ke scene itu; bila scene tidak diberikan, WAJIB throw (tidak ada
// fallback diam-diam yang menghasilkan kota kosong).
import * as THREE from '../vendor/three.module.min.js';

// Angka-angka dunia (dari dokumen desain 00-design.md).
export const MAP_HALF = 500;
export const ROAD_SPACING = 100;
export const ROAD_WIDTH = 14;
export const SIDEWALK_WIDTH = 4;
export const WORLD_SEED = 7;
export const SHIP_X = 470;
export const SHIP_Z = 350;
export const SHIP_RADIUS = 12;
// Koridor dermaga menuju kapal: persegi yang WAJIB bersih dari gedung/properti.
export const DOCK_CORRIDOR = { x0: 370, x1: 500, z0: 315, z1: 385 };
export const ROAD_LINES = [-400, -300, -200, -100, 0, 100, 200, 300, 400];

// RNG berbiji deterministik (benih tetap 7) supaya kota sama antar muat.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function inCorridor(x, z, pad) {
  return (
    x >= DOCK_CORRIDOR.x0 - pad &&
    x <= DOCK_CORRIDOR.x1 + pad &&
    z >= DOCK_CORRIDOR.z0 - pad &&
    z <= DOCK_CORRIDOR.z1 + pad
  );
}

function rectHitsCorridor(x, z, hw, hd, pad) {
  return (
    x + hw >= DOCK_CORRIDOR.x0 - pad &&
    x - hw <= DOCK_CORRIDOR.x1 + pad &&
    z + hd >= DOCK_CORRIDOR.z0 - pad &&
    z - hd <= DOCK_CORRIDOR.z1 + pad
  );
}

// Graf jalan: simpul pada kisi -400..400 tiap 100 (9x9 = 81 simpul),
// sisi ke tetangga ortogonal (9 baris x 8 + 9 kolom x 8 = 144 sisi).
function buildRoadGraph() {
  const nodes = [];
  const indexOf = new Map();
  for (let iz = 0; iz < 9; iz++) {
    for (let ix = 0; ix < 9; ix++) {
      const x = -400 + ix * 100;
      const z = -400 + iz * 100;
      indexOf.set(ix + ',' + iz, nodes.length);
      nodes.push({ x, z, ix, iz });
    }
  }
  const edges = [];
  const adjacency = nodes.map(() => []);
  function link(a, b) {
    edges.push([a, b]);
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  for (let iz = 0; iz < 9; iz++) {
    for (let ix = 0; ix < 9; ix++) {
      const n = indexOf.get(ix + ',' + iz);
      if (ix < 8) link(n, indexOf.get(ix + 1 + ',' + iz));
      if (iz < 8) link(n, indexOf.get(ix + ',' + (iz + 1)));
    }
  }
  return { nodes, edges, adjacency };
}

export function getDistrict(world, x, z) {
  void world;
  if (x >= 300) return 'Pelabuhan';
  if (z >= 300) return 'Pesisir';
  if (Math.abs(x) <= 200 && Math.abs(z) <= 200) return 'Menara';
  if (x < -200 && z < -100) return 'Bukit';
  return 'Pasar Lama';
}

export function getShipPosition(world) {
  void world;
  return { x: SHIP_X, z: SHIP_Z, radius: SHIP_RADIUS };
}

export function isDockCorridorClear(world) {
  for (const b of world.buildings) {
    if (rectHitsCorridor(b.x, b.z, b.w / 2, b.d / 2, 0)) return false;
  }
  for (const p of world.props) {
    if (inCorridor(p.x, p.z, 0)) return false;
  }
  return true;
}

export function isBlocked(world, x, z) {
  if (Math.abs(x) > MAP_HALF - 2 || Math.abs(z) > MAP_HALF - 2) return true;
  for (const b of world.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + 1.5 && Math.abs(z - b.z) < b.d / 2 + 1.5) {
      return true;
    }
  }
  return false;
}

// Titik jalan terdekat: proyeksi ke garis jalan vertikal/horizontal terdekat.
export function nearestRoad(world, x, z) {
  void world;
  const snap = (v) => Math.max(-400, Math.min(400, Math.round(v / 100) * 100));
  const cx = snap(x);
  const cz = snap(z);
  if (Math.abs(x - cx) <= Math.abs(z - cz)) return { x: cx, z };
  return { x, z: cz };
}

// SATU-SATUNYA definisi pencari jalur: BFS di graf jalan internal.
// Tanda tangan BEKU: findRoadPath(world, sx, sz, gx, gz) -> [{x, z}, ...].
export function findRoadPath(world, sx, sz, gx, gz) {
  const toNode = (x, z) => {
    const ix = Math.max(0, Math.min(8, Math.round((x + 400) / 100)));
    const iz = Math.max(0, Math.min(8, Math.round((z + 400) / 100)));
    return iz * 9 + ix;
  };
  const start = toNode(sx, sz);
  const goal = toNode(gx, gz);
  const prev = new Array(world.nodes.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const nb of world.adjacency[cur]) {
      if (prev[nb] === -1) {
        prev[nb] = cur;
        queue.push(nb);
      }
    }
  }
  const path = [];
  if (prev[goal] === -1) return [{ x: sx, z: sz }, { x: gx, z: gz }];
  let cur = goal;
  const chain = [];
  while (cur !== start) {
    chain.push(world.nodes[cur]);
    cur = prev[cur];
  }
  chain.push(world.nodes[start]);
  chain.reverse();
  path.push({ x: sx, z: sz });
  for (const n of chain) path.push({ x: n.x, z: n.z });
  path.push({ x: gx, z: gz });
  return path;
}

// Daftar posisi spawn valid: titik di jalan, di dalam |x|,|z| <= 396,
// tidak di dalam bangunan, tidak di koridor dermaga.
export function getValidSpawnPositions(world, count) {
  const out = [];
  for (const line of ROAD_LINES) {
    for (let v = -400; v <= 400; v += 50) {
      const candidates = [
        { x: line, z: v },
        { x: v, z: line },
      ];
      for (const p of candidates) {
        if (Math.abs(p.x) > 396 || Math.abs(p.z) > 396) continue;
        if (inCorridor(p.x, p.z, 0)) continue;
        if (isBlocked(world, p.x, p.z)) continue;
        out.push({ x: p.x, z: p.z });
      }
    }
  }
  if (typeof count === 'number' && count >= 0) return out.slice(0, count);
  return out;
}

export function buildCity(scene, seed) {
  if (!scene || typeof scene.add !== 'function') {
    throw new Error('buildCity: scene wajib diberikan (KOTA MENTARI)');
  }
  const seedValue = typeof seed === 'number' ? seed : WORLD_SEED;
  const rng = mulberry32(seedValue);
  const graph = buildRoadGraph();

  const world = {
    seed: seedValue,
    buildings: [],
    props: [],
    nodes: graph.nodes,
    edges: graph.edges,
    adjacency: graph.adjacency,
    roadLines: ROAD_LINES.slice(),
    ship: { x: SHIP_X, z: SHIP_Z, radius: SHIP_RADIUS },
    meshCount: 0,
  };

  const addMesh = (mesh) => {
    scene.add(mesh);
    world.meshCount++;
    return mesh;
  };

  // --- Tanah rumput + laut di tepi Pelabuhan dan Pesisir ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2),
    new THREE.MeshLambertMaterial({ color: 0x4d7a3d })
  );
  ground.rotation.x = -Math.PI / 2;
  addMesh(ground);

  const seaMat = new THREE.MeshLambertMaterial({ color: 0x1e6f9e });
  const seaEast = new THREE.Mesh(new THREE.PlaneGeometry(70, MAP_HALF * 2), seaMat);
  seaEast.rotation.x = -Math.PI / 2;
  seaEast.position.set(465, 0.02, 0);
  addMesh(seaEast);
  const seaSouth = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF * 2, 70), seaMat);
  seaSouth.rotation.x = -Math.PI / 2;
  seaSouth.position.set(0, 0.02, 465);
  addMesh(seaSouth);

  // --- Jalan aspal gelap + garis tengah kuning putus-putus ---
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xe8c832 });
  for (const line of ROAD_LINES) {
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, MAP_HALF * 2), roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(line, 0.05, 0);
    addMesh(vRoad);
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF * 2, ROAD_WIDTH), roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.05, line);
    addMesh(hRoad);
    for (let v = -475; v <= 475; v += 50) {
      const dashV = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 6), dashMat);
      dashV.position.set(line, 0.08, v);
      addMesh(dashV);
      const dashH = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 1.2), dashMat);
      dashH.position.set(v, 0.08, line);
      addMesh(dashH);
    }
  }

  // --- Trotoar: slab per blok ---
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x9a9a92 });
  const blockSize = ROAD_SPACING - ROAD_WIDTH; // 86
  for (let bx = 0; bx < 8; bx++) {
    for (let bz = 0; bz < 8; bz++) {
      const cx = -400 + bx * 100 + 50;
      const cz = -400 + bz * 100 + 50;
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(blockSize, blockSize), sidewalkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(cx, 0.03, cz);
      addMesh(slab);
    }
  }

  // --- Gedung balok bervariasi; Menara (pusat) paling tinggi dan padat ---
  const wallColors = [0xd8cfc0, 0xc0c8d0, 0xe0b48f, 0x8fb8d8, 0xd8d8d8, 0xb8a88f, 0x9fb8a0];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a60 });
  for (let bx = 0; bx < 8; bx++) {
    for (let bz = 0; bz < 8; bz++) {
      const cx = -400 + bx * 100 + 50;
      const cz = -400 + bz * 100 + 50;
      const isCenter = Math.abs(cx) <= 200 && Math.abs(cz) <= 200;
      if (rng() < 0.1) continue; // taman / plaza kosong
      const n = 2 + (isCenter ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const w = 18 + rng() * 20;
        const d = 18 + rng() * 20;
        const ox = (rng() - 0.5) * (blockSize - w - 12);
        const oz = (rng() - 0.5) * (blockSize - d - 12);
        const x = cx + ox;
        const z = cz + oz;
        if (rectHitsCorridor(x, z, w / 2 + 2, d / 2 + 2, 0)) continue;
        const h = isCenter ? 25 + rng() * 45 : 8 + rng() * 22;
        const mat = new THREE.MeshLambertMaterial({ color: pick(rng, wallColors) });
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        body.position.set(x, h / 2, z);
        addMesh(body);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1, d + 1), roofMat);
        roof.position.set(x, h + 0.5, z);
        addMesh(roof);
        world.buildings.push({
          x, z, w, d, h,
          district: getDistrict(world, x, z),
        });
      }
    }
  }

  // --- Properti: palem, lampu, hidran, peti, planter, bangku ---
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b3a });
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x333338 });
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8 });
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
  const planterMat = new THREE.MeshLambertMaterial({ color: 0x6a6a60 });
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });

  function addProp(kind, x, z) {
    world.props.push({ kind, x, z });
  }

  // Lampu di tiap simpang (2 per simpang).
  for (const node of graph.nodes) {
    for (const [ox, oz] of [[9, 9], [-9, -9]]) {
      const x = node.x + ox;
      const z = node.z + oz;
      if (inCorridor(x, z, 0)) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampPoleMat);
      pole.position.set(x, 3, z);
      addMesh(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.4), lampHeadMat);
      head.position.set(x, 6.1, z);
      addMesh(head);
      addProp('lampu', x, z);
    }
  }

  // Palem di sepanjang trotoar jalan.
  for (const line of ROAD_LINES) {
    for (let v = -375; v <= 375; v += 75) {
      if (rng() < 0.35) continue;
      const spots = [
        { x: line + 9, z: v },
        { x: v, z: line + 9 },
      ];
      for (const s of spots) {
        if (Math.abs(s.x) > 430 || Math.abs(s.z) > 430) continue;
        if (inCorridor(s.x, s.z, 0)) continue;
        if (isBlocked(world, s.x, s.z)) continue;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 6), trunkMat);
        trunk.position.set(s.x, 2.5, s.z);
        addMesh(trunk);
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.5, 6), leafMat);
        leaves.position.set(s.x, 6, s.z);
        addMesh(leaves);
        addProp('palem', s.x, s.z);
      }
    }
  }

  // Hidran, peti, planter, bangku tersebar di trotoar.
  const scatterKinds = [
    { kind: 'hidran', mat: hydrantMat, geo: () => new THREE.BoxGeometry(0.8, 1.1, 0.8), y: 0.55, n: 40 },
    { kind: 'peti', mat: crateMat, geo: () => new THREE.BoxGeometry(1.4, 1.4, 1.4), y: 0.7, n: 60 },
    { kind: 'planter', mat: planterMat, geo: () => new THREE.BoxGeometry(2, 0.8, 2), y: 0.4, n: 50 },
    { kind: 'bangku', mat: benchMat, geo: () => new THREE.BoxGeometry(2.4, 0.5, 0.8), y: 0.6, n: 40 },
  ];
  for (const spec of scatterKinds) {
    let placed = 0;
    let tries = 0;
    while (placed < spec.n && tries < spec.n * 12) {
      tries++;
      const line = pick(rng, ROAD_LINES);
      const along = -400 + rng() * 800;
      const side = rng() < 0.5 ? 9 : -9;
      const horizontal = rng() < 0.5;
      const x = horizontal ? along : line + side;
      const z = horizontal ? line + side : along;
      if (Math.abs(x) > 430 || Math.abs(z) > 430) continue;
      if (inCorridor(x, z, 2)) continue;
      if (isBlocked(world, x, z)) continue;
      const mesh = new THREE.Mesh(spec.geo(), spec.mat);
      mesh.position.set(x, spec.y, z);
      addMesh(mesh);
      addProp(spec.kind, x, z);
      placed++;
    }
  }

  // --- Kapal di (470, 350) + dermaga ---
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 18), pierMat);
  pier.position.set(430, 0.5, 350);
  addMesh(pier);
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x37424e });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 12), hullMat);
  hull.position.set(SHIP_X, 2.5, SHIP_Z);
  addMesh(hull);
  const deckMat = new THREE.MeshLambertMaterial({ color: 0xd8d0c0 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 9), deckMat);
  deck.position.set(SHIP_X, 6, SHIP_Z);
  addMesh(deck);
  const mastMat = new THREE.MeshLambertMaterial({ color: 0x5a4a34 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 10, 6), mastMat);
  mast.position.set(SHIP_X - 4, 12, SHIP_Z);
  addMesh(mast);

  return world;
}

// Alias: nama lain pembangun kota.
export const buildWorld = buildCity;
