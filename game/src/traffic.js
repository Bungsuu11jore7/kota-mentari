// traffic.js — Lalu lintas "KOTA MENTARI" (Lane B).
// Mobil traffic mengikuti roadGraph (loop waypoint, belok di node,
// berhenti bila ada mobil di depan) + pejalan kaki di trotoar yang
// menghindar/lari bila mobil pemain dekat. three.js r170, orisinal.
// (v3, Lane B: tulis ulang di dalam rekaman baru 12:24 WIB — kepadatan
// naik ke 28 mobil + 45 pejalan kaki; logika Lane S/v2 tidak diubah.)
import * as THREE from 'three';
import { createCar, updateCar } from './vehicles.js';

// Palet warna mobil traffic (sun-soaked: pastel + cerah).
const TRAFFIC_COLORS = [
  0xd94f30, 0x3f7fbf, 0xe8c547, 0x7fb069, 0xf2f2f2,
  0x2e2e38, 0x8e6bbf, 0xe07a5f, 0x4fa3a5, 0xc9a227,
];
// Palet pakaian pejalan kaki.
const PED_COLORS = [
  0xe2725b, 0x6a994e, 0x4361ee, 0xf4a259, 0x9b5de5,
  0xef476f, 0x06d6a0, 0xffd166, 0x8d99ae, 0xbc6c25,
];
const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

const WORLD_HALF = 396;
const STOP_GAP = 8.5; // jarak berhenti di belakang mobil depan
const PED_FLEE_RADIUS = 9; // pejalan kaki lari bila pemain sedekat ini
// Lane B (v3) — kepadatan kota: main.js memanggil createTraffic(..., 14),
// di sini ditambah jadi 28 mobil + 45 pejalan kaki supaya jalan terasa
// ramai tapi tetap playable (mobil ikut roadGraph + jaga jarak spawn,
// pejalan kaki tetap di trotoar).
const DENSITY_BONUS_CARS = 14;
const PEDS_PER_CAR = 1.6;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function angleDiff(target, current) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// State internal modul: createTraffic mengikat sistemnya di sini agar
// updateTraffic(dt, world) sesuai kontrak (tanpa argumen sistem).
// Game hanya punya satu sistem traffic, jadi satu slot modul cukup.
let SYS = null;
let SYS_TIME = 0;

// RNG kecil mandiri (mulberry32) supaya traffic deterministik per seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bangun adjacency dari roadGraph.edges — toleran terhadap bentuk edge:
// [a, b] | { a, b } | { from, to } | { i, j }.
function buildAdjacency(graph) {
  const adj = new Map();
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return adj;
  for (let i = 0; i < graph.nodes.length; i += 1) adj.set(i, []);
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  for (const e of edges) {
    let a = -1;
    let b = -1;
    if (Array.isArray(e)) {
      a = e[0];
      b = e[1];
    } else if (e && typeof e === 'object') {
      a = e.a !== undefined ? e.a : e.from !== undefined ? e.from : e.i;
      b = e.b !== undefined ? e.b : e.to !== undefined ? e.to : e.j;
    }
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    if (!adj.has(a) || !adj.has(b)) continue;
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  return adj;
}

// Pilih node tetangga berikutnya (acak, hindari putar balik bila ada pilihan).
function pickNextNode(adj, current, previous, rng) {
  const options = (adj.get(current) || []).filter((n) => n !== previous);
  const pool = options.length > 0 ? options : adj.get(current) || [];
  if (pool.length === 0) return current;
  return pool[Math.floor(rng() * pool.length)];
}

// Bangun figur pejalan kaki: badan kotak + kepala + kaki, warna acak.
function createPedFigure(scene, rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({
    color: PED_COLORS[Math.floor(rng() * PED_COLORS.length)],
  });
  const skin = new THREE.MeshLambertMaterial({
    color: SKIN_COLORS[Math.floor(rng() * SKIN_COLORS.length)],
  });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b2d42 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.32), shirt);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.75;
  group.add(head);
  // Topi / rambut: kotak tipis di atas kepala.
  const hat = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.1, 0.48),
    new THREE.MeshLambertMaterial({ color: 0xf2e8cf }),
  );
  hat.position.y = 2.0;
  group.add(hat);
  const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.22);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(0, 0.3, 0.14);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0, 0.3, -0.14);
  group.add(legR);
  scene.add(group);
  return { group, legL, legR };
}

/**
 * Buat lalu lintas.
 * createTraffic(scene, world, count) -> { cars: [], peds: [] }
 * cars: { car, node, prevNode, targetSpeed, speed } — mobil traffic.
 * peds: { group, legL, legR, pos, heading, speed, dir, axis, line,
 *         offset, fleeUntil } — pejalan kaki trotoar.
 * count = jumlah mobil traffic (pejalan kaki = count juga, min 6).
 * world: objek kontrak Lane A (roadGraph / roads / randomRoadPoint).
 */
export function createTraffic(scene, world, count = 10) {
  const rng = mulberry32(1337);
  const cars = [];
  const peds = [];

  const graph = world && world.roadGraph;
  const adj = buildAdjacency(graph);
  const hasGraph = adj.size > 0;
  const nodes = hasGraph ? graph.nodes : [];

  const carCount = Math.max(0, (count | 0) + DENSITY_BONUS_CARS);
  for (let i = 0; i < carCount; i += 1) {
    let x = 0;
    let z = 0;
    let node = 0;
    let nextNode = 0;
    if (hasGraph) {
      // Jaga jarak spawn: coba beberapa node sampai cukup jauh dari mobil
      // yang sudah ada (hindari tumpukan di satu persimpangan). Mobil
      // spawn HANYA di node roadGraph (= persimpangan, di tengah jalan),
      // jadi tidak pernah spawn di dalam gedung.
      // Lane B (v3): 8 percobaan (v2: 6) karena 28 mobil butuh sebaran
      // lebih lebar di 81 node.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const cand = Math.floor(rng() * nodes.length);
        node = cand;
        let clear = true;
        for (const other of cars) {
          if (dist2(nodes[cand].x, nodes[cand].z, other.car.pos.x, other.car.pos.z) < 14 * 14) {
            clear = false;
            break;
          }
        }
        if (clear) break;
      }
      nextNode = pickNextNode(adj, node, -1, rng);
      x = nodes[node].x;
      z = nodes[node].z;
    } else if (world && typeof world.randomRoadPoint === 'function') {
      const p = world.randomRoadPoint(rng);
      x = p.x !== undefined ? p.x : p[0];
      z = p.z !== undefined ? p.z : p[1];
    } else if (world && world.roads) {
      // Fallback grid: pilih satu avenue, posisi z acak.
      const avenues = world.roads.avenues || [0];
      x = avenues[Math.floor(rng() * avenues.length)];
      z = (rng() * 2 - 1) * WORLD_HALF;
    }
    const color = TRAFFIC_COLORS[Math.floor(rng() * TRAFFIC_COLORS.length)];
    const car = createCar(scene, {
      color,
      x,
      z,
      heading: rng() * Math.PI * 2,
      maxSpeed: 16,
    });
    // Kecepatan jelajah traffic 8–14 (kontrak).
    const cruise = 8 + rng() * 6;
    car.cruiseSpeed = cruise;
    // Alias pos/group: wrapper {car,...} tetap bisa dibaca sebagai titik.
    cars.push({ car, pos: car.pos, group: car.group, node, prevNode: -1, nextNode, targetSpeed: cruise, speed: cruise });
  }

  // Pejalan kaki: jalan di trotoar (offset ~6.5 dari garis jalan).
  // Lane B (v3): 45 pejalan kaki (28 mobil x 1.6, min 12).
  const pedCount = Math.max(12, Math.round(carCount * PEDS_PER_CAR));
  const avenues = (world && world.roads && world.roads.avenues) || [-300, -200, -100, 0, 100, 200, 300];
  const streets = (world && world.roads && world.roads.streets) || [-300, -200, -100, 0, 100, 200, 300];
  for (let i = 0; i < pedCount; i += 1) {
    const alongAvenue = rng() < 0.5;
    const line = alongAvenue
      ? avenues[Math.floor(rng() * avenues.length)]
      : streets[Math.floor(rng() * streets.length)];
    const fig = createPedFigure(scene, rng);
    const start = (rng() * 2 - 1) * (WORLD_HALF - 20);
    const offset = 6.5 * (rng() < 0.5 ? 1 : -1);
    fig.group.position.set(alongAvenue ? line + offset : start, 0, alongAvenue ? start : line + offset);
    peds.push({
      group: fig.group,
      legL: fig.legL,
      legR: fig.legR,
      pos: fig.group.position,
      heading: rng() * Math.PI * 2,
      speed: 1.2 + rng() * 1.1, // jalan santai 1.2–2.3
      dir: rng() < 0.5 ? 1 : -1,
      axis: alongAvenue ? 'z' : 'x', // sumbu gerak
      line,
      offset,
      walkPhase: rng() * Math.PI * 2,
      fleeUntil: 0,
      fleeX: 0,
      fleeZ: 0,
    });
  }

  // Ikat sistem ke slot modul supaya updateTraffic(dt, world) jalan
  // sesuai kontrak tanpa argumen sistem tambahan.
  SYS = { cars, peds, adj, hasGraph, nodes, rng: mulberry32(777) };
  SYS_TIME = 0;

  return { cars, peds };
}

/**
 * Satu langkah simulasi lalu lintas.
 * updateTraffic(dt, world, playerState?)
 * playerState opsional: { pos: Vector3, inCar: bool, car } — dipakai
 * pejalan kaki untuk menghindar dan mobil traffic untuk tidak menabrak
 * mobil pemain. Tanpa playerState, traffic tetap jalan normal.
 * world: dipakai isBlocked + nearestRoadPoint bila tersedia.
 */
export function updateTraffic(dt, world, playerState = null) {
  dt = Math.min(dt, 0.05);
  SYS_TIME += dt;
  const sys = SYS;
  if (!sys) return;
  const { cars, peds } = sys;

  const playerPos = playerState && playerState.pos ? playerState.pos : null;
  const playerCar = playerState && playerState.car ? playerState.car : null;

  // --- Mobil traffic ---
  for (const t of cars) {
    const car = t.car;
    let target = null;
    let tx = 0;
    let tz = 0;

    if (sys.hasGraph) {
      const node = sys.nodes[t.nextNode];
      if (node) {
        tx = node.x;
        tz = node.z;
      }
    } else {
      // Fallback: lurus sepanjang avenue, putar balik di ujung.
      tx = car.pos.x + Math.sin(car.heading) * 50;
      tz = car.pos.z + Math.cos(car.heading) * 50;
      if (Math.abs(car.pos.x) > WORLD_HALF - 10 || Math.abs(car.pos.z) > WORLD_HALF - 10) {
        car.heading += Math.PI;
      }
    }

    // Arah ke waypoint.
    const dx = tx - car.pos.x;
    const dz = tz - car.pos.z;
    const distToTarget = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    const turn = clamp(angleDiff(desired, car.heading), -1, 1);

    // Berhenti bila ada mobil di depan (traffic lain / mobil pemain).
    let blockedAhead = false;
    const aheadX = car.pos.x + Math.sin(car.heading) * STOP_GAP;
    const aheadZ = car.pos.z + Math.cos(car.heading) * STOP_GAP;
    for (const other of cars) {
      if (other === t) continue;
      if (dist2(aheadX, aheadZ, other.car.pos.x, other.car.pos.z) < 6.5 * 6.5) {
        blockedAhead = true;
        break;
      }
    }
    if (!blockedAhead && playerCar && playerCar !== car) {
      if (dist2(aheadX, aheadZ, playerCar.pos.x, playerCar.pos.z) < 6.5 * 6.5) {
        blockedAhead = true;
      }
    }

    const cruise = blockedAhead ? 0 : t.targetSpeed;
    // Gas halus menuju cruise; belok via updateCar.
    const throttle = cruise > 0.5 ? clamp((cruise - car.speed) / 6, 0, 1) : 0;
    updateCar(car, { throttle, steer: turn, brake: cruise <= 0.5 }, dt, world);

    // Sampai di node -> pilih node berikut (loop waypoint).
    if (sys.hasGraph && distToTarget < 5) {
      t.prevNode = t.node;
      t.node = t.nextNode;
      t.nextNode = pickNextNode(sys.adj, t.node, t.prevNode, sys.rng);
    }
  }

  // --- Pejalan kaki ---
  for (const p of peds) {
    let speed = p.speed;
    let heading = p.heading;

    // Menghindar: bila pemain (jalan kaki / mobil) dekat, lari menjauh.
    const now = SYS_TIME;
    if (playerPos) {
      const d2 = dist2(p.pos.x, p.pos.z, playerPos.x, playerPos.z);
      if (d2 < PED_FLEE_RADIUS * PED_FLEE_RADIUS) {
        p.fleeUntil = now + 1.6;
        p.fleeX = playerPos.x;
        p.fleeZ = playerPos.z;
      }
    }
    if (now < p.fleeUntil) {
      speed = 6.5; // lari
      heading = Math.atan2(p.pos.x - p.fleeX, p.pos.z - p.fleeZ);
    } else {
      // Bolak-balik di trotoar sepanjang garis jalan.
      const along = p.axis === 'z' ? p.pos.z : p.pos.x;
      if (along > WORLD_HALF - 15) p.dir = -1;
      if (along < -WORLD_HALF + 15) p.dir = 1;
      heading = p.axis === 'z' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }

    p.heading = heading;
    p.pos.x += Math.sin(heading) * speed * dt;
    p.pos.z += Math.cos(heading) * speed * dt;
    // Tetap di trotoar (kecuali sedang lari menghindar).
    if (now >= p.fleeUntil) {
      if (p.axis === 'z') p.pos.x = p.line + p.offset;
      else p.pos.z = p.line + p.offset;
    }
    p.group.rotation.y = heading;
    // Ayun kaki (visual).
    p.walkPhase += speed * dt * 4;
    const swing = Math.sin(p.walkPhase) * 0.35;
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
  }
}
