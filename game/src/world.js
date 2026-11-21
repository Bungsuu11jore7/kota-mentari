// KOTA MENTARI — pembangun kota (Lane B, v12)
// Kota pesisir tropis fiktif: kisi jalan tiap 100, gedung balok, properti
// trotoar, laut di Pelabuhan dan Pesisir, kapal + koridor dermaga bersih.
import * as THREE from '../vendor/three.module.min.js';

// ---- Konstanta peta (dari dokumen desain) ----
export const MAP_MIN = -500;
export const MAP_MAX = 500;
export const ROAD_SPACING = 100;
export const ROAD_WIDTH = 14;
export const SIDEWALK_WIDTH = 4;
export const GRAPH_MIN = -400;
export const GRAPH_MAX = 400;
export const SHIP_X = 470;
export const SHIP_Z = 350;
export const SHIP_RADIUS = 12;
export const WORLD_SEED = 7;
export const SPAWN_LIMIT = 396;

// Koridor dermaga menuju kapal: x 300..480, z 340..360 — TIDAK BOLEH terhalang.
export const DOCK_CORRIDOR = { x0: 300, x1: 480, z0: 340, z1: 360 };

// ---- RNG berbiji (deterministik, benih 7) ----
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUILDING_COLORS = [
  0xd8c9a3, 0xb8b0a0, 0xc47f5a, 0x7fa8c9, 0x9fb4c7, 0xe0d6c0,
  0xa89f8d, 0xd9a066, 0x8fa3b8, 0xc9b8a3, 0x6f8fae, 0xe8e0cc,
];
const ROOF_COLORS = [0x5a4a3a, 0x6b6b6b, 0x8a5a3b, 0x4a5a6b];

function rectsOverlap(ax0, ax1, az0, az1, bx0, bx1, bz0, bz1) {
  return ax0 < bx1 && ax1 > bx0 && az0 < bz1 && az1 > bz0;
}

function corridorHit(x0, x1, z0, z1, margin) {
  const m = margin || 0;
  return rectsOverlap(
    x0, x1, z0, z1,
    DOCK_CORRIDOR.x0 - m, DOCK_CORRIDOR.x1 + m,
    DOCK_CORRIDOR.z0 - m, DOCK_CORRIDOR.z1 + m
  );
}

// ---- Pencari distrik ----
export function districtAt(x, z) {
  if (x >= 300) return 'Pelabuhan';
  if (z >= 300) return 'Pesisir';
  if (z <= -300) return 'Bukit';
  if (x <= -300) return 'Pasar Lama';
  if (Math.abs(x) <= 200 && Math.abs(z) <= 200) return 'Menara';
  if (x < -200) return 'Pasar Lama';
  if (z < -200) return 'Bukit';
  if (x > 200 && z > 200) return 'Pesisir';
  return 'Menara';
}

// ---- Graf jalan: simpul -400..400 tiap 100 (9x9 = 81), sisi 144 ----
// Sisi yang memotong koridor dermaga TIDAK dihapus dari graf (graf tetap
// 81 simpul / 144 sisi), melainkan dihindari saat cari jalur (findRoadPath)
// dan saat spawn mobil, supaya koridor tetap bersih.
export function buildRoadGraph() {
  const nodes = [];
  const indexOf = new Map();
  for (let gx = GRAPH_MIN; gx <= GRAPH_MAX; gx += ROAD_SPACING) {
    for (let gz = GRAPH_MIN; gz <= GRAPH_MAX; gz += ROAD_SPACING) {
      const id = nodes.length;
      nodes.push({ id, x: gx, z: gz });
      indexOf.set(gx + ',' + gz, id);
    }
  }
  const edges = [];
  const adjacency = nodes.map(() => []);
  function link(a, b) {
    edges.push({ a, b });
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  for (const n of nodes) {
    const right = indexOf.get((n.x + ROAD_SPACING) + ',' + n.z);
    const down = indexOf.get(n.x + ',' + (n.z + ROAD_SPACING));
    if (right !== undefined) link(n.id, right);
    if (down !== undefined) link(n.id, down);
  }
  return { nodes, edges, adjacency };
}

// Apakah ruas jalan lurus (x1,z1)-(x2,z2) memotong koridor dermaga?
export function edgeCrossesCorridor(x1, z1, x2, z2) {
  const x0 = Math.min(x1, x2);
  const x1m = Math.max(x1, x2);
  const z0 = Math.min(z1, z2);
  const z1m = Math.max(z1, z2);
  return corridorHit(x0, x1m, z0, z1m, 0);
}

export function nearestNodeId(graph, x, z) {
  const cx = Math.max(GRAPH_MIN, Math.min(GRAPH_MAX, Math.round(x / ROAD_SPACING) * ROAD_SPACING));
  const cz = Math.max(GRAPH_MIN, Math.min(GRAPH_MAX, Math.round(z / ROAD_SPACING) * ROAD_SPACING));
  let best = 0;
  let bestD = Infinity;
  for (const n of graph.nodes) {
    const d = (n.x - cx) * (n.x - cx) + (n.z - cz) * (n.z - cz);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

// ---- Pencari jalur (SATU-SATUNYA definisi; berbasis graf jalan) ----
export function findRoadPath(world, sx, sz, gx, gz) {
  if (!world || !world.graph || !world.graph.nodes || !world.graph.adjacency) {
    throw new Error('findRoadPath: world dengan graf jalan wajib diberikan');
  }
  const graph = world.graph;
  const start = nearestNodeId(graph, sx, sz);
  const goal = nearestNodeId(graph, gx, gz);
  if (start === goal) return [{ x: sx, z: sz }, { x: gx, z: gz }];
  // BFS
  const prev = new Array(graph.nodes.length).fill(-1);
  const seen = new Array(graph.nodes.length).fill(false);
  const queue = [start];
  seen[start] = true;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const nb of graph.adjacency[cur]) {
      if (seen[nb]) continue;
      // Jangan routing lewat koridor dermaga: koridor harus tetap bersih.
      const a = graph.nodes[cur];
      const b = graph.nodes[nb];
      if (edgeCrossesCorridor(a.x, a.z, b.x, b.z)) continue;
      seen[nb] = true;
      prev[nb] = cur;
      queue.push(nb);
    }
  }
  if (!seen[goal]) return [{ x: sx, z: sz }, { x: gx, z: gz }];
  const chain = [];
  let cur = goal;
  while (cur !== -1) {
    chain.unshift(graph.nodes[cur]);
    cur = prev[cur];
  }
  const out = [{ x: sx, z: sz }];
  for (const n of chain) out.push({ x: n.x, z: n.z });
  out.push({ x: gx, z: gz });
  return out;
}

// ---- Pemeriksa titik terhalang ----
export function isBlocked(world, x, z) {
  if (!world) throw new Error('isBlocked: world wajib diberikan');
  if (Math.abs(x) > MAP_MAX || Math.abs(z) > MAP_MAX) return true;
  for (const b of world.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + 1 && Math.abs(z - b.z) < b.d / 2 + 1) return true;
  }
  return false;
}

// ---- Titik jalan terdekat ----
export function nearestRoad(world, x, z) {
  const rx = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.round(x / ROAD_SPACING) * ROAD_SPACING));
  const rz = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.round(z / ROAD_SPACING) * ROAD_SPACING));
  const dx = Math.abs(x - rx);
  const dz = Math.abs(z - rz);
  if (dx <= dz) return { x: rx, z: Math.max(MAP_MIN, Math.min(MAP_MAX, z)) };
  return { x: Math.max(MAP_MIN, Math.min(MAP_MAX, x)), z: rz };
}

// ---- Posisi kapal ----
export function getShipPosition(world) {
  return { x: SHIP_X, z: SHIP_Z, radius: SHIP_RADIUS };
}

// ---- Pemeriksa koridor dermaga ----
export function isCorridorClear(world) {
  if (!world) throw new Error('isCorridorClear: world wajib diberikan');
  for (const b of world.buildings) {
    if (corridorHit(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, 1)) return false;
  }
  for (const p of world.props) {
    if (p.x > DOCK_CORRIDOR.x0 && p.x < DOCK_CORRIDOR.x1 &&
        p.z > DOCK_CORRIDOR.z0 && p.z < DOCK_CORRIDOR.z1) return false;
  }
  return true;
}

// ---- Daftar posisi spawn valid ----
export function getValidSpawns(world) {
  if (!world) throw new Error('getValidSpawns: world wajib diberikan');
  const out = [];
  for (let x = -SPAWN_LIMIT; x <= SPAWN_LIMIT; x += 20) {
    for (let z = -SPAWN_LIMIT; z <= SPAWN_LIMIT; z += 20) {
      if (isBlocked(world, x, z)) continue;
      if (x > DOCK_CORRIDOR.x0 && x < DOCK_CORRIDOR.x1 &&
          z > DOCK_CORRIDOR.z0 && z < DOCK_CORRIDOR.z1) continue;
      const dx = x - SHIP_X;
      const dz = z - SHIP_Z;
      if (dx * dx + dz * dz < (SHIP_RADIUS + 4) * (SHIP_RADIUS + 4)) continue;
      out.push({ x, z });
    }
  }
  return out;
}

// ---- Pembangun kota ----
// WAJIB menerima scene; tanpa scene gagal keras (tidak ada kota kosong diam-diam).
export function buildCity(scene, seed) {
  if (!scene || typeof scene.add !== 'function') {
    throw new Error('buildCity: scene wajib diberikan — kota tidak boleh dibangun tanpa scene');
  }
  const useSeed = seed === undefined ? WORLD_SEED : seed;
  const rng = mulberry32(useSeed);
  const graph = buildRoadGraph();

  const world = {
    seed: useSeed,
    scene,
    graph,
    buildings: [],
    props: [],
    counts: { buildings: 0, props: 0, meshes: 0, sceneChildren: 0 },
    isBlocked: (x, z) => isBlocked(world, x, z),
    nearestRoad: (x, z) => nearestRoad(world, x, z),
    getDistrict: (x, z) => districtAt(x, z),
    districtAt: (x, z) => districtAt(x, z),
    getShipPosition: () => getShipPosition(world),
    isCorridorClear: () => isCorridorClear(world),
    getValidSpawns: () => getValidSpawns(world),
    findRoadPath: (sx, sz, gx, gz) => findRoadPath(world, sx, sz, gx, gz),
  };

  let meshCount = 0;
  function add(mesh) {
    scene.add(mesh);
    meshCount += 1;
    return mesh;
  }
  function box(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    m.position.set(x, y, z);
    return add(m);
  }
  function flat(w, d, color, x, y, z) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshLambertMaterial({ color })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    return add(m);
  }

  // ---- Tanah rumput + laut ----
  flat(1200, 1200, 0x4d8f3f, 0, 0, 0); // rumput
  flat(220, 1200, 0x2e7fb8, 610, 0.04, 0); // laut timur (Pelabuhan)
  flat(1200, 220, 0x2e7fb8, 0, 0.04, 610); // laut selatan (Pesisir)
  flat(150, 120, 0x2e7fb8, 505, 0.05, 350); // teluk pelabuhan di sekitar kapal

  // ---- Jalan aspal + trotoar + garis kuning ----
  const roadLines = [];
  for (let c = MAP_MIN; c <= MAP_MAX; c += ROAD_SPACING) roadLines.push(c);
  for (const c of roadLines) {
    flat(ROAD_WIDTH, 1000, 0x2b2b2e, c, 0.06, 0); // jalan vertikal
    flat(1000, ROAD_WIDTH, 0x2b2b2e, 0, 0.06, c); // jalan horizontal
    // Trotoar di kedua sisi tiap jalan
    flat(SIDEWALK_WIDTH, 1000, 0x9a9a94, c - ROAD_WIDTH / 2 - SIDEWALK_WIDTH / 2, 0.07, 0);
    flat(SIDEWALK_WIDTH, 1000, 0x9a9a94, c + ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2, 0.07, 0);
    flat(1000, SIDEWALK_WIDTH, 0x9a9a94, 0, 0.07, c - ROAD_WIDTH / 2 - SIDEWALK_WIDTH / 2);
    flat(1000, SIDEWALK_WIDTH, 0x9a9a94, 0, 0.07, c + ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2);
    // Garis tengah kuning putus-putus
    for (let t = -475; t <= 475; t += 60) {
      flat(0.7, 7, 0xe8c832, c, 0.08, t);
      flat(7, 0.7, 0xe8c832, t, 0.08, c);
    }
  }

  // ---- Gedung balok ----
  const blockCenters = [];
  for (let bx = -450; bx <= 450; bx += ROAD_SPACING) {
    for (let bz = -450; bz <= 450; bz += ROAD_SPACING) blockCenters.push({ x: bx, z: bz });
  }
  for (const block of blockCenters) {
    // Blok yang dilewati koridor dermaga: tanpa gedung sama sekali.
    if (corridorHit(block.x - 50, block.x + 50, block.z - 50, block.z + 50, 0)) continue;
    const center = Math.abs(block.x) <= 150 && Math.abs(block.z) <= 150; // Menara
    const count = center ? 2 + Math.floor(rng() * 2) : (rng() < 0.72 ? 1 : 2);
    const placed = [];
    for (let i = 0; i < count; i++) {
      let w = 20;
      let d = 20;
      let h = 10;
      let x = block.x;
      let z = block.z;
      let tries = 0;
      let ok = false;
      while (tries < 12 && !ok) {
        tries += 1;
        w = 13 + rng() * 17;
        d = 13 + rng() * 17;
        h = center ? 24 + rng() * 46 : 8 + rng() * 22;
        x = block.x + (rng() * 2 - 1) * (39 - w / 2);
        z = block.z + (rng() * 2 - 1) * (39 - d / 2);
        ok = true;
        for (const p of placed) {
          if (Math.abs(x - p.x) < (w + p.w) / 2 + 3 && Math.abs(z - p.z) < (d + p.d) / 2 + 3) {
            ok = false;
            break;
          }
        }
        if (ok && corridorHit(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 2)) ok = false;
      }
      if (!ok) continue;
      const color = BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)];
      box(w, h, d, color, x, h / 2, z);
      // Atap datar sedikit lebih gelap
      box(w * 0.92, 0.6, d * 0.92, ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)], x, h + 0.3, z);
      placed.push({ x, z, w, d });
      world.buildings.push({ x, z, w, d, h, district: districtAt(x, z) });
    }
  }

  // ---- Properti trotoar: palem, lampu, hidran, peti, planter, bangku ----
  const PROP_KINDS = ['palm', 'lamp', 'hydrant', 'crate', 'planter', 'bench'];
  function addProp(kind, x, z) {
    if (corridorHit(x, x, z, z, 2)) return false;
    if (isBlocked(world, x, z)) return false;
    if (kind === 'palm') {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.4, 5, 6),
        new THREE.MeshLambertMaterial({ color: 0x7a5230 })
      );
      trunk.position.set(x, 2.5, z);
      add(trunk);
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(1.8, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x2f8f3a })
      );
      crown.position.set(x, 5.6, z);
      crown.scale.y = 0.55;
      add(crown);
    } else if (kind === 'lamp') {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 6, 6),
        new THREE.MeshLambertMaterial({ color: 0x3a3a3a })
      );
      pole.position.set(x, 3, z);
      add(pole);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xffe9a8 })
      );
      head.position.set(x, 6.1, z);
      add(head);
    } else if (kind === 'hydrant') {
      box(0.7, 1.1, 0.7, 0xc0392b, x, 0.55, z);
    } else if (kind === 'crate') {
      const s = 0.9 + rng() * 0.7;
      box(s, s, s, 0x9a7b4f, x, s / 2, z);
    } else if (kind === 'planter') {
      box(1.6, 0.7, 1.6, 0x8a6f4d, x, 0.35, z);
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x3a9e4f })
      );
      bush.position.set(x, 1.1, z);
      add(bush);
    } else {
      box(2.2, 0.5, 0.7, 0x7a5c38, x, 0.45, z);
    }
    world.props.push({ kind, x, z });
    return true;
  }
  for (const block of blockCenters) {
    if (corridorHit(block.x - 50, block.x + 50, block.z - 50, block.z + 50, 0)) continue;
    const n = 4 + Math.floor(rng() * 3); // 4-6 properti per blok
    for (let i = 0; i < n; i++) {
      const kind = PROP_KINDS[Math.floor(rng() * PROP_KINDS.length)];
      // Posisi di cincin trotoar: 39..43 dari pusat blok pada satu sumbu.
      const side = Math.floor(rng() * 4);
      const off = 39 + rng() * 4;
      const along = (rng() * 2 - 1) * 38;
      let x;
      let z;
      if (side === 0) { x = block.x - off; z = block.z + along; }
      else if (side === 1) { x = block.x + off; z = block.z + along; }
      else if (side === 2) { x = block.x + along; z = block.z - off; }
      else { x = block.x + along; z = block.z + off; }
      if (Math.abs(x) > 495 || Math.abs(z) > 495) continue;
      addProp(kind, x, z);
    }
  }

  // ---- Dermaga kayu + kapal ----
  box(150, 0.6, 12, 0x8a6f4d, 395, 0.3, 350); // dermaga (di dalam koridor)
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(26, 4, 9),
    new THREE.MeshLambertMaterial({ color: 0x37474f })
  );
  hull.position.y = 1.2;
  ship.add(hull);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(24, 1, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a6f4d })
  );
  deck.position.y = 3.6;
  ship.add(deck);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(8, 5, 6),
    new THREE.MeshLambertMaterial({ color: 0xf5f5f0 })
  );
  cabin.position.set(-6, 6.5, 0);
  ship.add(cabin);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 12, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a4a3a })
  );
  mast.position.set(6, 9, 0);
  ship.add(mast);
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.3, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0xe67e22 })
  );
  funnel.position.set(-1, 6, 0);
  ship.add(funnel);
  ship.position.set(SHIP_X, 0.4, SHIP_Z);
  scene.add(ship);
  meshCount += 5;

  world.counts = {
    buildings: world.buildings.length,
    props: world.props.length,
    meshes: meshCount,
    sceneChildren: scene.children.length,
  };
  world.ship = { x: SHIP_X, z: SHIP_Z, radius: SHIP_RADIUS };
  return world;
}

export default buildCity;
