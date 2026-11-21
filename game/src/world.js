// KOTA MENTARI — world.js
// Pembangun kota pesisir tropis: kisi jalan, gedung, properti, laut, dan kapal.
// Semua keacakan memakai RNG berbiji tetap (benih 7) supaya kota deterministik.
import * as THREE from '../vendor/three.module.min.js';

export const WORLD_SEED = 7;
export const CITY_BOUNDS = 500;
export const ROAD_SPACING = 100;
export const ROAD_WIDTH = 14;
export const SIDEWALK_WIDTH = 4;
export const SHIP_POSITION = { x: 470, z: 350, radius: 12 };
export const DOCK_CORRIDOR = { minX: 380, maxX: 500, minZ: 325, maxZ: 375 };

const ROAD_COORDS = [-400, -300, -200, -100, 0, 100, 200, 300, 400];

// RNG berbiji (mulberry32) — deterministik antar muat.
export function createSeededRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Distrik dari posisi. Menerima (x, z) atau (world, x, z).
export function districtAt(a, b, c) {
  let x;
  let z;
  if (typeof a === 'object' && a !== null) {
    x = b;
    z = c;
  } else {
    x = a;
    z = b;
  }
  if (x >= 300 && z >= 100) return 'Pelabuhan';
  if (z >= 300) return 'Pesisir';
  if (x <= -200 && z >= -150) return 'Pasar Lama';
  if (z <= -150 && x < 0) return 'Bukit';
  return 'Menara';
}

export function getShipPosition() {
  return { x: SHIP_POSITION.x, z: SHIP_POSITION.z, radius: SHIP_POSITION.radius };
}

function inSea(x, z) {
  if (x >= 455 && z >= 200) return true;
  if (z >= 455) return true;
  return false;
}

function onPier(x, z) {
  return x >= 380 && x <= 485 && z >= 344 && z <= 356;
}

function inDockCorridor(x, z) {
  return (
    x >= DOCK_CORRIDOR.minX && x <= DOCK_CORRIDOR.maxX &&
    z >= DOCK_CORRIDOR.minZ && z <= DOCK_CORRIDOR.maxZ
  );
}

// Graf jalan: simpul di tiap persimpangan kisi (-400..400 tiap 100).
function buildRoadGraph() {
  const nodes = [];
  const nodeId = new Map();
  for (let iz = 0; iz < 9; iz++) {
    for (let ix = 0; ix < 9; ix++) {
      const x = ROAD_COORDS[ix];
      const z = ROAD_COORDS[iz];
      nodeId.set(ix + ',' + iz, nodes.length);
      nodes.push({ x: x, z: z, ix: ix, iz: iz });
    }
  }
  const edges = [];
  const adjacency = nodes.map(function () { return []; });
  function link(ix1, iz1, ix2, iz2) {
    const a = nodeId.get(ix1 + ',' + iz1);
    const b = nodeId.get(ix2 + ',' + iz2);
    edges.push({ a: a, b: b });
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  for (let iz = 0; iz < 9; iz++) {
    for (let ix = 0; ix < 9; ix++) {
      if (ix < 8) link(ix, iz, ix + 1, iz);
      if (iz < 8) link(ix, iz, ix, iz + 1);
    }
  }
  return { nodes: nodes, edges: edges, adjacency: adjacency };
}

function nearestNodeId(graph, x, z) {
  const ix = clamp(Math.round(x / 100) + 4, 0, 8);
  const iz = clamp(Math.round(z / 100) + 4, 0, 8);
  return iz * 9 + ix;
}

// SATU-SATUNYA definisi pencari jalur: BFS di atas graf jalan internal.
// findRoadPath(world, sx, sz, gx, gz) -> array titik {x, z}.
export function findRoadPath(world, sx, sz, gx, gz) {
  const graph = world.roadGraph;
  const startId = nearestNodeId(graph, sx, sz);
  const goalId = nearestNodeId(graph, gx, gz);
  const start = { x: sx, z: sz };
  const goal = { x: gx, z: gz };
  if (startId === goalId) return [start, goal];
  const prev = new Array(graph.nodes.length).fill(-1);
  const queue = [startId];
  prev[startId] = startId;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goalId) break;
    const neighbours = graph.adjacency[cur];
    for (let i = 0; i < neighbours.length; i++) {
      const nb = neighbours[i];
      if (prev[nb] === -1) {
        prev[nb] = cur;
        queue.push(nb);
      }
    }
  }
  if (prev[goalId] === -1) return [start, goal];
  const chain = [];
  let cur = goalId;
  while (cur !== startId) {
    chain.push(graph.nodes[cur]);
    cur = prev[cur];
  }
  chain.push(graph.nodes[startId]);
  chain.reverse();
  const path = [start];
  for (let i = 0; i < chain.length; i++) {
    const p = { x: chain[i].x, z: chain[i].z };
    const last = path[path.length - 1];
    if (last.x !== p.x || last.z !== p.z) path.push(p);
  }
  const last = path[path.length - 1];
  if (last.x !== goal.x || last.z !== goal.z) path.push(goal);
  return path;
}

// Titik jalan terdekat: titik terdekat pada garis tengah jalan.
export function nearestRoad(world, x, z) {
  const vx = clamp(Math.round(x / 100) * 100, -400, 400);
  const hz = clamp(Math.round(z / 100) * 100, -400, 400);
  if (Math.abs(x - vx) <= Math.abs(z - hz)) {
    return { x: vx, z: clamp(z, -400, 400) };
  }
  return { x: clamp(x, -400, 400), z: hz };
}

// Apakah titik terhalang (di dalam bangunan / di luar kota / di laut).
export function isBlocked(world, x, z) {
  if (Math.abs(x) > CITY_BOUNDS || Math.abs(z) > CITY_BOUNDS) return true;
  if (onPier(x, z)) return false;
  if (inSea(x, z)) return true;
  const buildings = world.buildings;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (Math.abs(x - b.x) <= b.w / 2 + 1.5 && Math.abs(z - b.z) <= b.d / 2 + 1.5) {
      return true;
    }
  }
  return false;
}

// Koridor dermaga menuju kapal harus bersih dari bangunan dan properti.
export function isDockCorridorClear(world) {
  for (let i = 0; i < world.buildings.length; i++) {
    const b = world.buildings[i];
    if (
      b.x + b.w / 2 >= DOCK_CORRIDOR.minX - 2 && b.x - b.w / 2 <= DOCK_CORRIDOR.maxX + 2 &&
      b.z + b.d / 2 >= DOCK_CORRIDOR.minZ - 2 && b.z - b.d / 2 <= DOCK_CORRIDOR.maxZ + 2
    ) {
      return false;
    }
  }
  for (let i = 0; i < world.props.length; i++) {
    const p = world.props[i];
    if (inDockCorridor(p.x, p.z)) return false;
  }
  return true;
}

// Posisi spawn valid: simpul jalan + titik tengah sisi, |x|,|z| <= 396,
// tidak di dalam bangunan, tidak di koridor dermaga.
export function getValidSpawnPositions(world) {
  const out = [];
  const graph = world.roadGraph;
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    if (Math.abs(n.x) <= 396 && Math.abs(n.z) <= 396 && !inDockCorridor(n.x, n.z)) {
      out.push({ x: n.x, z: n.z });
    }
  }
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    const a = graph.nodes[e.a];
    const b = graph.nodes[e.b];
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    if (Math.abs(mx) <= 396 && Math.abs(mz) <= 396 && !inDockCorridor(mx, mz)) {
      out.push({ x: mx, z: mz });
    }
  }
  return out;
}

const DISTRICT_COLORS = {
  Menara: [0xe8e0cc, 0xcfd8dc, 0x90a4ae, 0xfff3e0, 0xb0bec5, 0xffe0b2],
  Pelabuhan: [0x8d6e63, 0xa1887f, 0x78909c, 0xbcaaa4, 0x6d4c41],
  'Pasar Lama': [0xffcc80, 0xef9a9a, 0xfff59d, 0xa5d6a7, 0xce93d8, 0xffab91],
  Pesisir: [0xffffff, 0xffe0b2, 0x80deea, 0xfff9c4, 0xb2ebf2],
  Bukit: [0xa5d6a7, 0xc8e6c9, 0xd7ccc8, 0xffe0b2, 0xeeeeee]
};

function buildingHeight(rng, district) {
  if (district === 'Menara') return 22 + rng() * 36;
  if (district === 'Pelabuhan') return 10 + rng() * 14;
  if (district === 'Pasar Lama') return 8 + rng() * 10;
  if (district === 'Pesisir') return 8 + rng() * 12;
  return 6 + rng() * 8;
}

// Pembangun kota. WAJIB menerima scene dan menambahkan SEMUA mesh ke scene itu.
// Tanpa scene: gagal keras (throw) — tidak ada kota kosong diam-diam.
export function buildCity(scene, seed) {
  if (!scene || typeof scene.add !== 'function') {
    throw new Error('buildCity membutuhkan scene: panggil buildCity(scene)');
  }
  const rng = createSeededRng(seed === undefined ? WORLD_SEED : seed);
  const roadGraph = buildRoadGraph();
  const buildings = [];
  const props = [];

  const matCache = new Map();
  function mat(color) {
    if (!matCache.has(color)) {
      matCache.set(color, new THREE.MeshLambertMaterial({ color: color }));
    }
    return matCache.get(color);
  }
  function boxMesh(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }

  // Tanah rumput.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    mat(0x58a447)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  scene.add(ground);

  // Laut di tepi Pelabuhan (timur) dan Pesisir (selatan).
  const seaMat = mat(0x1e7fa8);
  const seaEast = new THREE.Mesh(new THREE.PlaneGeometry(45, 300), seaMat);
  seaEast.rotation.x = -Math.PI / 2;
  seaEast.position.set(477.5, 0.02, 350);
  scene.add(seaEast);
  const seaSouth = new THREE.Mesh(new THREE.PlaneGeometry(1000, 45), seaMat);
  seaSouth.rotation.x = -Math.PI / 2;
  seaSouth.position.set(0, 0.02, 477.5);
  scene.add(seaSouth);

  // Jalan aspal gelap: 9 vertikal + 9 horizontal.
  const roadMat = mat(0x2e2e33);
  for (let i = 0; i < ROAD_COORDS.length; i++) {
    const c = ROAD_COORDS[i];
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 1000), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.05, 0);
    scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(1000, ROAD_WIDTH), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.05, c);
    scene.add(h);
  }

  // Garis tengah kuning putus-putus di tiap jalan (tiap 60 satuan).
  const dashGeo = new THREE.BoxGeometry(0.6, 0.1, 4);
  const dashMat = mat(0xd8b400);
  for (let i = 0; i < ROAD_COORDS.length; i++) {
    const c = ROAD_COORDS[i];
    for (let p = -480; p <= 480; p += 60) {
      const dv = new THREE.Mesh(dashGeo, dashMat);
      dv.position.set(c, 0.1, p);
      scene.add(dv);
      const dh = new THREE.Mesh(dashGeo, dashMat);
      dh.rotation.y = Math.PI / 2;
      dh.position.set(p, 0.1, c);
      scene.add(dh);
    }
  }

  // Blok kota 10x10: trotoar (atau pasir di tepi laut / dermaga).
  function blockIsBuildable(ix, iz) {
    if (iz === 9) return false;
    if (ix === 9 && iz >= 7) return false;
    return true;
  }
  for (let iz = 0; iz < 10; iz++) {
    for (let ix = 0; ix < 10; ix++) {
      const cx = -450 + ix * 100;
      const cz = -450 + iz * 100;
      const buildable = blockIsBuildable(ix, iz);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(86, 86),
        mat(buildable ? 0xb8b0a0 : 0xd9c28a)
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(cx, 0.07, cz);
      scene.add(plane);
    }
  }

  // Gedung balok bervariasi; Pusat kota (Menara) tertinggi dan terpadat.
  for (let iz = 0; iz < 10; iz++) {
    for (let ix = 0; ix < 10; ix++) {
      if (!blockIsBuildable(ix, iz)) continue;
      const cx = -450 + ix * 100;
      const cz = -450 + iz * 100;
      const district = districtAt(cx, cz);
      let count;
      if (district === 'Menara') {
        count = 2 + (rng() < 0.1 ? 1 : 0);
      } else {
        count = 1 + (rng() < 0.1 ? 1 : 0);
      }
      const cells = [
        { ox: -19.5, oz: -19.5 },
        { ox: 19.5, oz: -19.5 },
        { ox: -19.5, oz: 19.5 },
        { ox: 19.5, oz: 19.5 }
      ];
      // Acak urutan sel.
      for (let s = cells.length - 1; s > 0; s--) {
        const j = Math.floor(rng() * (s + 1));
        const tmp = cells[s];
        cells[s] = cells[j];
        cells[j] = tmp;
      }
      for (let n = 0; n < count; n++) {
        const cell = count === 1 ? { ox: 0, oz: 0 } : cells[n];
        const w = count === 1 ? 26 + rng() * 18 : 14 + rng() * 12;
        const d = count === 1 ? 26 + rng() * 18 : 14 + rng() * 12;
        const h = buildingHeight(rng, district);
        const color = pick(rng, DISTRICT_COLORS[district]);
        const bx = cx + cell.ox;
        const bz = cz + cell.oz;
        boxMesh(w, h, d, color, bx, h / 2, bz);
        if (h >= 30) {
          boxMesh(w * 0.5, 1.5, d * 0.5, 0x616161, bx, h + 0.75, bz);
        }
        buildings.push({ x: bx, z: bz, w: w, d: d, h: h, district: district, color: color });
      }
    }
  }

  // Properti di trotoar: palem, lampu, hidran, peti, planter, bangku.
  // Menara paling banyak.
  const trunkMat = mat(0x6d4c41);
  const leafMat = mat(0x2e7d32);
  const poleMat = mat(0x455a64);
  const lampHeadMat = mat(0xffe082);
  const hydrantMat = mat(0xc62828);
  const crateMat = mat(0x8d6e63);
  const planterMat = mat(0x4e342e);
  const plantMat = mat(0x43a047);
  const benchMat = mat(0x795548);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 4, 6);
  const leafGeo = new THREE.ConeGeometry(2, 1.4, 6);
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 5, 6);
  const lampHeadGeo = new THREE.BoxGeometry(0.9, 0.3, 0.3);
  const hydrantGeo = new THREE.BoxGeometry(0.5, 0.9, 0.5);
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const planterGeo = new THREE.BoxGeometry(1.6, 0.6, 0.8);
  const plantGeo = new THREE.BoxGeometry(1.4, 0.45, 0.6);
  const benchSeatGeo = new THREE.BoxGeometry(1.8, 0.15, 0.6);
  const propKinds = ['palm', 'palm', 'palm', 'lamp', 'lamp', 'hydrant', 'crate', 'crate', 'planter', 'bench', 'bench'];

  function addProp(kind, x, z) {
    const g = new THREE.Group();
    if (kind === 'palm') {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(0, 2, 0);
      g.add(trunk);
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.set(0, 4.5, 0);
      g.add(leaves);
    } else if (kind === 'lamp') {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(0, 2.5, 0);
      g.add(pole);
      const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
      head.position.set(0, 5, 0);
      g.add(head);
    } else if (kind === 'hydrant') {
      const body = new THREE.Mesh(hydrantGeo, hydrantMat);
      body.position.set(0, 0.45, 0);
      g.add(body);
    } else if (kind === 'crate') {
      const crate = new THREE.Mesh(crateGeo, crateMat);
      crate.position.set(0, 0.5, 0);
      g.add(crate);
    } else if (kind === 'planter') {
      const box = new THREE.Mesh(planterGeo, planterMat);
      box.position.set(0, 0.3, 0);
      g.add(box);
      const plant = new THREE.Mesh(plantGeo, plantMat);
      plant.position.set(0, 0.8, 0);
      g.add(plant);
    } else {
      const seat = new THREE.Mesh(benchSeatGeo, benchMat);
      seat.position.set(0, 0.45, 0);
      g.add(seat);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rng() * Math.PI * 2;
    scene.add(g);
    props.push({ x: x, z: z, kind: kind });
  }

  for (let iz = 0; iz < 10; iz++) {
    for (let ix = 0; ix < 10; ix++) {
      if (!blockIsBuildable(ix, iz)) continue;
      const cx = -450 + ix * 100;
      const cz = -450 + iz * 100;
      const district = districtAt(cx, cz);
      const count = district === 'Menara' ? 7 : 4 + (rng() < 0.5 ? 1 : 0);
      for (let n = 0; n < count; n++) {
        const side = Math.floor(rng() * 4);
        const along = -36 + rng() * 72;
        const off = 41 + rng() * 7;
        let px;
        let pz;
        if (side === 0) { px = cx + along; pz = cz - off; }
        else if (side === 1) { px = cx + along; pz = cz + off; }
        else if (side === 2) { px = cx - off; pz = cz + along; }
        else { px = cx + off; pz = cz + along; }
        if (Math.abs(px) > 495 || Math.abs(pz) > 495) continue;
        if (inDockCorridor(px, pz)) continue;
        addProp(pick(rng, propKinds), px, pz);
      }
    }
  }

  // Dermaga kayu menuju kapal (lantai yang bisa dilewati, bukan penghalang).
  const pier = new THREE.Mesh(new THREE.BoxGeometry(90, 0.4, 12), mat(0x8d6e63));
  pier.position.set(425, 0.2, 350);
  scene.add(pier);

  // Kapal di (470, 350), radius 12.
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 9), mat(0x37474f));
  hull.position.set(0, 2, 0);
  ship.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 0.5, 8), mat(0x8d6e63));
  deck.position.set(0, 4.2, 0);
  ship.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), mat(0xf5f5f5));
  cabin.position.set(-4, 6.5, 0);
  ship.add(cabin);
  const funnel = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), mat(0xe65100));
  funnel.position.set(4, 7, 0);
  ship.add(funnel);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 6), mat(0x455a64));
  mast.position.set(9, 8, 0);
  ship.add(mast);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 7), mat(0x37474f));
  bow.position.set(14, 1.5, 0);
  ship.add(bow);
  ship.position.set(SHIP_POSITION.x, 0, SHIP_POSITION.z);
  scene.add(ship);

  const world = {
    seed: seed === undefined ? WORLD_SEED : seed,
    bounds: CITY_BOUNDS,
    roadWidth: ROAD_WIDTH,
    sidewalkWidth: SIDEWALK_WIDTH,
    roadGraph: roadGraph,
    nodes: roadGraph.nodes,
    edges: roadGraph.edges,
    buildings: buildings,
    props: props,
    ship: { x: SHIP_POSITION.x, z: SHIP_POSITION.z, radius: SHIP_POSITION.radius },
    scene: scene,
    counts: {
      buildings: buildings.length,
      props: props.length,
      nodes: roadGraph.nodes.length,
      edges: roadGraph.edges.length
    }
  };
  world.isBlocked = function (x, z) { return isBlocked(world, x, z); };
  world.nearestRoad = function (x, z) { return nearestRoad(world, x, z); };
  world.districtAt = function (x, z) { return districtAt(x, z); };
  world.findRoadPath = function (sx, sz, gx, gz) {
    return findRoadPath(world, sx, sz, gx, gz);
  };
  world.getShipPosition = function () { return getShipPosition(); };
  world.isDockCorridorClear = function () { return isDockCorridorClear(world); };
  world.getValidSpawnPositions = function () { return getValidSpawnPositions(world); };
  return world;
}

export const createCity = buildCity;
export const buildWorld = buildCity;
