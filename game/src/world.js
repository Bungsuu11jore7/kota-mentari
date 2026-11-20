// Kota Mentari — world.js (Lane B, v4)
// Pembangun kota: kisi jalan, gedung, properti, kapal, graf jalan,
// pemeriksa titik terhalang, pencari distrik, dan posisi spawn valid.
// Semua angka mengikuti dokumen desain (00-design.md): peta -500..500,
// jalan tiap 100 satuan, lebar jalan 14, trotoar 4, kapal di (470, 350).
import * as THREE from '../vendor/three.module.min.js';

// ---------------------------------------------------------------------------
// Konstanta peta (dari dokumen desain — jangan diubah)
// ---------------------------------------------------------------------------
export const MAP_HALF = 500;
export const SPAWN_LIMIT = 396;
export const ROAD_SPACING = 100;
export const ROAD_WIDTH = 14;
export const SIDEWALK_WIDTH = 4;
export const ROAD_HALF = ROAD_WIDTH / 2;
export const SIDEWALK_OFFSET = ROAD_HALF + SIDEWALK_WIDTH / 2;
export const ROAD_LINES = [-400, -300, -200, -100, 0, 100, 200, 300, 400];
export const SEED = 7;

export const SHIP_POSITION = { x: 470, z: 350, radius: 12 };
// Koridor dermaga: jalan lurus menuju kapal, TIDAK BOLEH terhalang apa pun.
export const PIER_CORRIDOR = { minX: 380, maxX: 490, minZ: 338, maxZ: 362 };

export const DISTRICTS = [
  { name: 'Pelabuhan', minX: 300, maxX: 500, minZ: 200, maxZ: 500 },
  { name: 'Pasar Lama', minX: -300, maxX: -100, minZ: -100, maxZ: 100 },
  { name: 'Menara', minX: -100, maxX: 200, minZ: -400, maxZ: -200 },
  { name: 'Pesisir', minX: -300, maxX: 300, minZ: 350, maxZ: 500 },
  { name: 'Bukit', minX: 200, maxX: 500, minZ: -400, maxZ: -100 },
  { name: 'Pusat Kota', minX: -100, maxX: 200, minZ: -100, maxZ: 200 },
];

// Palet warna kota (senja tropis).
export const PALETTE = {
  grass: 0x4f8f3a,
  asphalt: 0x2b2b30,
  sidewalk: 0x9a9a92,
  roadLine: 0xf2c200,
  sea: 0x1e6f9e,
  pierWood: 0x8a6a3f,
  building: [0xd97b3f, 0xe8dcc0, 0x7a5fa0, 0x8a6a4f, 0x9a9a9a, 0xc96a4a],
  palmTrunk: 0x7a5230,
  palmLeaf: 0x2f7d32,
  lampPole: 0x333333,
  lampGlow: 0xffd27a,
  hydrant: 0xc0392b,
  crate: 0x8a6a3f,
  bench: 0x6a4a2f,
  planter: 0x3f5a2a,
  shipHull: 0x27408b,
  shipCabin: 0xf2f2f2,
};

// ---------------------------------------------------------------------------
// Generator acak berbiji (deterministik, benih 7) — dipakai kota & traffic
// ---------------------------------------------------------------------------
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function rngFloat(rng, min, max) {
  return min + rng() * (max - min);
}

export function rngPick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// ---------------------------------------------------------------------------
// Pembantu geometri kecil
// ---------------------------------------------------------------------------
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointInRect(x, z, rect) {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

function rectsOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function circleHitsRect(cx, cz, r, rect) {
  const nearestX = clamp(cx, rect.minX, rect.maxX);
  const nearestZ = clamp(cz, rect.minZ, rect.maxZ);
  const dx = cx - nearestX;
  const dz = cz - nearestZ;
  return dx * dx + dz * dz < r * r;
}

export function isInPierCorridor(x, z) {
  return pointInRect(x, z, PIER_CORRIDOR);
}

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

// ---------------------------------------------------------------------------
// Pembangun kota
// ---------------------------------------------------------------------------
// Membangun seluruh kota ke dalam adegan dan mengembalikan objek dunia:
// {
//   scene, blockers: [{x, z, r}], buildings: [{x, z, w, d, h, district}],
//   props: [{x, z, kind}], graph: { nodes, edges, adjacency },
//   ship: {x, z, radius}, spawnPositions: [{x, z}]
// }
export function buildCity(scene) {
  const rng = createRng(SEED);
  const world = {
    scene,
    blockers: [],
    buildings: [],
    props: [],
    graph: null,
    ship: { x: SHIP_POSITION.x, z: SHIP_POSITION.z, radius: SHIP_POSITION.radius },
    spawnPositions: [],
  };

  function addBlocker(x, z, r) {
    world.blockers.push({ x, z, r });
  }

  function addMesh(mesh, x, y, z) {
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }

  // --- Tanah rumput dasar (seluruh peta 1000 x 1000) ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2),
    lambert(PALETTE.grass)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Laut di tepi Pelabuhan (timur) dan Pesisir (selatan) ---
  const seaMat = lambert(PALETTE.sea);
  const seaEast = new THREE.Mesh(new THREE.PlaneGeometry(46, 320), seaMat);
  seaEast.rotation.x = -Math.PI / 2;
  addMesh(seaEast, 477, 0.08, 340);
  const seaSouth = new THREE.Mesh(new THREE.PlaneGeometry(620, 46), seaMat);
  seaSouth.rotation.x = -Math.PI / 2;
  addMesh(seaSouth, 0, 0.08, 477);

  // --- Jalan aspal gelap (membujur + melintang) dan trotoar ---
  const roadMat = lambert(PALETTE.asphalt);
  const walkMat = lambert(PALETTE.sidewalk);
  for (const c of ROAD_LINES) {
    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, MAP_HALF * 2), roadMat);
    roadV.rotation.x = -Math.PI / 2;
    addMesh(roadV, c, 0.02, 0);
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF * 2, ROAD_WIDTH), roadMat);
    roadH.rotation.x = -Math.PI / 2;
    addMesh(roadH, 0, 0.02, c);
    // Trotoar 4 satuan di tiap sisi jalan.
    for (const side of [-1, 1]) {
      const walkV = new THREE.Mesh(
        new THREE.PlaneGeometry(SIDEWALK_WIDTH, MAP_HALF * 2), walkMat);
      walkV.rotation.x = -Math.PI / 2;
      addMesh(walkV, c + side * SIDEWALK_OFFSET, 0.04, 0);
      const walkH = new THREE.Mesh(
        new THREE.PlaneGeometry(MAP_HALF * 2, SIDEWALK_WIDTH), walkMat);
      walkH.rotation.x = -Math.PI / 2;
      addMesh(walkH, 0, 0.04, c + side * SIDEWALK_OFFSET);
    }
  }

  // --- Garis tengah kuning putus-putus (satu InstancedMesh untuk semua jalan) ---
  const dashGeo = new THREE.BoxGeometry(0.5, 0.05, 5);
  const dashMat = lambert(PALETTE.roadLine);
  const dashSpots = [];
  for (const c of ROAD_LINES) {
    for (let t = -480; t <= 480; t += 12) {
      dashSpots.push({ x: c, z: t, vertical: true });
      dashSpots.push({ x: t, z: c, vertical: false });
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  const dummy = new THREE.Object3D();
  dashSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0.06, spot.z);
    dummy.rotation.set(0, spot.vertical ? 0 : Math.PI / 2, 0);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  });
  dashes.instanceMatrix.needsUpdate = true;
  scene.add(dashes);

  // --- Gedung: balok bervariasi per blok antar jalan ---
  // Pusat kota paling tinggi dan padat; Menara tinggi; Pesisir rendah.
  const buildingGeoCache = new Map();
  function buildingGeometry(w, h, d) {
    const key = w + 'x' + h + 'x' + d;
    if (!buildingGeoCache.has(key)) {
      buildingGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    }
    return buildingGeoCache.get(key);
  }

  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < ROAD_LINES.length - 1; j++) {
      const x0 = ROAD_LINES[i] + ROAD_HALF + SIDEWALK_WIDTH;
      const x1 = ROAD_LINES[i + 1] - ROAD_HALF - SIDEWALK_WIDTH;
      const z0 = ROAD_LINES[j] + ROAD_HALF + SIDEWALK_WIDTH;
      const z1 = ROAD_LINES[j + 1] - ROAD_HALF - SIDEWALK_WIDTH;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      // Blok di tepi laut timur/selatan dibiarkan kosong (pantai + dermaga).
      if (cx > 440 || cz > 440) continue;
      const district = districtAt(cx, cz);
      let count = 1 + Math.floor(rng() * 2);
      let minH = 8;
      let maxH = 26;
      if (district === 'Pusat Kota') {
        count = 3 + Math.floor(rng() * 2);
        minH = 25;
        maxH = 60;
      } else if (district === 'Menara') {
        count = 3;
        minH = 30;
        maxH = 55;
      } else if (district === 'Pesisir') {
        count = 1 + Math.floor(rng() * 2);
        minH = 6;
        maxH = 14;
      } else if (district === 'Pelabuhan') {
        count = 1 + Math.floor(rng() * 2);
        minH = 8;
        maxH = 18;
      }
      for (let k = 0; k < count; k++) {
        const w = rngFloat(rng, 12, 24);
        const d = rngFloat(rng, 12, 24);
        const h = rngFloat(rng, minH, maxH);
        const bx = rngFloat(rng, x0 + w / 2, x1 - w / 2);
        const bz = rngFloat(rng, z0 + d / 2, z1 - d / 2);
        // Gedung TIDAK BOLEH masuk koridor dermaga.
        const footprint = {
          minX: bx - w / 2, maxX: bx + w / 2,
          minZ: bz - d / 2, maxZ: bz + d / 2,
        };
        if (rectsOverlap(footprint, PIER_CORRIDOR)) continue;
        const color = rngPick(rng, PALETTE.building);
        const body = new THREE.Mesh(buildingGeometry(w, h, d), lambert(color));
        body.castShadow = true;
        addMesh(body, bx, h / 2, bz);
        // Atap datar sedikit lebih gelap.
        const roofColor = new THREE.Color(color).multiplyScalar(0.75).getHex();
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), lambert(roofColor));
        addMesh(roof, bx, h + 0.25, bz);
        world.buildings.push({ x: bx, z: bz, w, d, h, district });
        addBlocker(bx, bz, Math.hypot(w, d) / 2 + 1);
      }
    }
  }

  // --- Properti: palem, lampu, hidran, peti, planter, bangku ---
  // Pusat kota paling banyak properti; semua properti menjauhi koridor dermaga.
  function addPalm(x, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.35, 5, 6), lambert(PALETTE.palmTrunk));
    trunk.position.y = 2.5;
    group.add(trunk);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 2.4, 4), lambert(PALETTE.palmLeaf));
      const angle = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 0.9, 5.3, Math.sin(angle) * 0.9);
      leaf.rotation.z = Math.cos(angle) * 0.9;
      leaf.rotation.x = -Math.sin(angle) * 0.9;
      group.add(leaf);
    }
    group.position.set(x, 0, z);
    scene.add(group);
    world.props.push({ x, z, kind: 'palm' });
    addBlocker(x, z, 0.8);
  }

  function addLamp(x, z) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 4.2, 6), lambert(PALETTE.lampPole));
    pole.position.y = 2.1;
    group.add(pole);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshLambertMaterial({
        color: PALETTE.lampGlow, emissive: PALETTE.lampGlow, emissiveIntensity: 0.9,
      }));
    bulb.position.y = 4.4;
    group.add(bulb);
    group.position.set(x, 0, z);
    scene.add(group);
    world.props.push({ x, z, kind: 'lamp' });
    addBlocker(x, z, 0.5);
  }

  function addHydrant(x, z) {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 0.9, 8), lambert(PALETTE.hydrant));
    addMesh(body, x, 0.45, z);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6), lambert(PALETTE.hydrant));
    addMesh(cap, x, 0.95, z);
    world.props.push({ x, z, kind: 'hydrant' });
    addBlocker(x, z, 0.7);
  }

  function addCrate(x, z) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), lambert(PALETTE.crate));
    box.castShadow = true;
    addMesh(box, x, 0.6, z);
    world.props.push({ x, z, kind: 'crate' });
    addBlocker(x, z, 1.0);
  }

  function addPlanter(x, z) {
    const pot = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1), lambert(PALETTE.planter));
    addMesh(pot, x, 0.4, z);
    const bush = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.6, 0.8), lambert(PALETTE.palmLeaf));
    addMesh(bush, x, 1.0, z);
    world.props.push({ x, z, kind: 'planter' });
    addBlocker(x, z, 1.2);
  }

  function addBench(x, z) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 0.6), lambert(PALETTE.bench));
    addMesh(seat, x, 0.5, z);
    const legA = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.5), lambert(PALETTE.bench));
    addMesh(legA, x - 0.8, 0.25, z);
    const legB = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.5), lambert(PALETTE.bench));
    addMesh(legB, x + 0.8, 0.25, z);
    world.props.push({ x, z, kind: 'bench' });
    addBlocker(x, z, 1.0);
  }

  // Palem + lampu di sepanjang trotoar tiap jalan.
  for (const c of ROAD_LINES) {
    for (let t = -475; t <= 475; t += 50) {
      const jitter = rngFloat(rng, -8, 8);
      const along = clamp(t + jitter, -490, 490);
      for (const side of [-1, 1]) {
        if (rng() < 0.45) continue;
        const px = c + side * SIDEWALK_OFFSET;
        const pz = along;
        if (isInPierCorridor(px, pz) || isBlocked(world, px, pz)) continue;
        if (rng() < 0.55) addPalm(px, pz); else addLamp(px, pz);
        const qx = along;
        const qz = c + side * SIDEWALK_OFFSET;
        if (isInPierCorridor(qx, qz) || isBlocked(world, qx, qz)) continue;
        if (rng() < 0.55) addPalm(qx, qz); else addLamp(qx, qz);
      }
    }
  }

  // Hidran, peti, planter, bangku di dalam blok — Pusat kota paling banyak.
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < ROAD_LINES.length - 1; j++) {
      const x0 = ROAD_LINES[i] + ROAD_HALF + SIDEWALK_WIDTH + 2;
      const x1 = ROAD_LINES[i + 1] - ROAD_HALF - SIDEWALK_WIDTH - 2;
      const z0 = ROAD_LINES[j] + ROAD_HALF + SIDEWALK_WIDTH + 2;
      const z1 = ROAD_LINES[j + 1] - ROAD_HALF - SIDEWALK_WIDTH - 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (cx > 440 || cz > 440) continue;
      const district = districtAt(cx, cz);
      let attempts = 2 + Math.floor(rng() * 2);
      if (district === 'Pusat Kota') attempts += 3;
      if (district === 'Pasar Lama') attempts += 1;
      for (let k = 0; k < attempts; k++) {
        const px = rngFloat(rng, x0, x1);
        const pz = rngFloat(rng, z0, z1);
        if (isInPierCorridor(px, pz) || isBlocked(world, px, pz)) continue;
        const kind = rngPick(rng, ['hydrant', 'crate', 'planter', 'bench', 'crate', 'planter']);
        if (kind === 'hydrant') addHydrant(px, pz);
        else if (kind === 'crate') addCrate(px, pz);
        else if (kind === 'planter') addPlanter(px, pz);
        else addBench(px, pz);
      }
    }
  }

  // --- Dermaga + kapal di (470, 350) ---
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(84, 0.6, 12), lambert(PALETTE.pierWood));
  addMesh(pier, 441, 0.3, 350);
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(26, 5, 7), lambert(PALETTE.shipHull));
  hull.castShadow = true;
  addMesh(hull, SHIP_POSITION.x, 2.5, SHIP_POSITION.z);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(10, 4, 5), lambert(PALETTE.shipCabin));
  cabin.castShadow = true;
  addMesh(cabin, SHIP_POSITION.x - 3, 7, SHIP_POSITION.z);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 8, 6), lambert(PALETTE.lampPole));
  addMesh(mast, SHIP_POSITION.x + 6, 9, SHIP_POSITION.z);
  addBlocker(SHIP_POSITION.x, SHIP_POSITION.z, SHIP_POSITION.radius);

  // --- Graf jalan: simpul di tiap persimpangan, sisi antar simpul tetangga ---
  const nodes = [];
  const adjacency = [];
  for (let r = 0; r < ROAD_LINES.length; r++) {
    for (let c = 0; c < ROAD_LINES.length; c++) {
      const id = r * ROAD_LINES.length + c;
      nodes.push({ id, x: ROAD_LINES[c], z: ROAD_LINES[r] });
      adjacency.push([]);
    }
  }
  const edges = [];
  function link(a, b) {
    edges.push({ from: a, to: b });
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  const n = ROAD_LINES.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const id = r * n + c;
      if (c + 1 < n) link(id, id + 1);
      if (r + 1 < n) link(id, id + n);
    }
  }
  world.graph = { nodes, edges, adjacency };

  // --- Daftar posisi spawn valid: di jalan/trotoar, |x|,|z| <= 396,
  //     tidak di dalam bangunan, tidak di koridor dermaga ---
  const spawnSet = [];
  for (const c of ROAD_LINES) {
    for (let t = -390; t <= 390; t += 30) {
      const candidates = [
        { x: c, z: t },
        { x: t, z: c },
        { x: c + SIDEWALK_OFFSET, z: t },
        { x: c - SIDEWALK_OFFSET, z: t },
        { x: t, z: c + SIDEWALK_OFFSET },
        { x: t, z: c - SIDEWALK_OFFSET },
      ];
      for (const p of candidates) {
        if (Math.abs(p.x) > SPAWN_LIMIT || Math.abs(p.z) > SPAWN_LIMIT) continue;
        if (isInPierCorridor(p.x, p.z)) continue;
        if (isBlocked(world, p.x, p.z)) continue;
        spawnSet.push({ x: p.x, z: p.z });
      }
    }
  }
  world.spawnPositions = spawnSet;

  return world;
}

// ---------------------------------------------------------------------------
// Pemeriksa & pencari (dipakai modul player, traffic, police, missions)
// ---------------------------------------------------------------------------

// Benar bila titik (x, z) terhalang: di luar peta, atau di dalam gedung/properti.
export function isBlocked(world, x, z) {
  if (Math.abs(x) > MAP_HALF || Math.abs(z) > MAP_HALF) return true;
  for (const b of world.blockers) {
    const dx = x - b.x;
    const dz = z - b.z;
    if (dx * dx + dz * dz < b.r * b.r) return true;
  }
  return false;
}

// Titik terdekat pada garis tengah jalan dari posisi (x, z).
export function nearestRoad(world, x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const c of ROAD_LINES) {
    // Jalan membujur (X tetap) dan melintang (Z tetap).
    const candV = { x: c, z: clamp(z, -MAP_HALF, MAP_HALF) };
    const candH = { x: clamp(x, -MAP_HALF, MAP_HALF), z: c };
    for (const cand of [candV, candH]) {
      const dx = cand.x - x;
      const dz = cand.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
  }
  return { x: best.x, z: best.z, distance: bestDist };
}

// Nama distrik dari posisi; 'Luar Kota' bila di luar semua distrik.
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) {
      return d.name;
    }
  }
  return 'Luar Kota';
}

// Posisi kapal (salinan baru tiap panggilan).
export function getShipPosition() {
  return { x: SHIP_POSITION.x, z: SHIP_POSITION.z, radius: SHIP_POSITION.radius };
}

// Benar bila koridor dermaga bebas dari gedung/properti apa pun.
export function isPierCorridorClear(world) {
  for (const b of world.blockers) {
    if (circleHitsRect(b.x, b.z, b.r, PIER_CORRIDOR)) {
      // Kapal sendiri duduk di ujung koridor — bukan penghalang.
      const dx = b.x - SHIP_POSITION.x;
      const dz = b.z - SHIP_POSITION.z;
      if (Math.hypot(dx, dz) < SHIP_POSITION.radius + 1) continue;
      return false;
    }
  }
  for (const building of world.buildings) {
    const rect = {
      minX: building.x - building.w / 2, maxX: building.x + building.w / 2,
      minZ: building.z - building.d / 2, maxZ: building.z + building.d / 2,
    };
    if (rectsOverlap(rect, PIER_CORRIDOR)) return false;
  }
  return true;
}

// Daftar semua posisi spawn yang valid (salinan).
export function getValidSpawnPositions(world) {
  return world.spawnPositions.map((p) => ({ x: p.x, z: p.z }));
}
