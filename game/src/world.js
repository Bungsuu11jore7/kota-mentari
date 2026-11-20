// KOTA MENTARI — kota pesisir tropis fiktif saat matahari terbenam.
// Grid 800x800: jalan tiap 100 unit, blok 80x80 di antaranya.
// Distrik: Menara (tengah, gedung tinggi), Pasar Lama (barat, rendah),
// Bukit (utara, sedang + palm), Pesisir (timur, pantai + laut),
// Pelabuhan (tenggara, dermaga + perahu).
//
// createWorld(seed) membangun seluruh kota sekali jalan dan mengembalikan
// grup three.js plus data yang dipakai lane lain (tabrakan, graf jalan,
// titik spawn). NOL shadow map di v1, NOL aset/network eksternal:
// marka jalan digambar lewat CanvasTexture yang dibuat di kode.
//
// v3 (Lane B): kota lebih padat — palm, lampu, hydrant, peti, planter dan
// bangku ditambah terutama di downtown/avenue dan sekitar Pelabuhan /
// Pasar Lama. Invarian v2 DIPERTAHANKAN PERSIS: logika isBlocked, spawn
// point, roadGraph, koridor dermaga (z 344-356 / x 396-524), aturan
// blocking |z|>396, titik kapal (470,350), dan semua nama distrik.

import * as THREE from 'three';
import {
  BLOCK,
  BUILDING_COLORS,
  COLORS,
  FOG,
  ROAD_GAP,
  ROAD_WIDTH,
  ROOF_COLORS,
  SIDEWALK_WIDTH,
  WORLD_HALF,
  WORLD_SIZE,
} from './config.js';
import { createRandom } from './random.js';

// Jalan membujur (avenue, sejajar sumbu z) dan melintang (street, sejajar
// sumbu x): -400, -300, ..., 400. Pusat blok ada di antaranya.
function roadLines() {
  const lines = [];
  for (let v = -WORLD_HALF; v <= WORLD_HALF; v += ROAD_GAP) lines.push(v);
  return lines;
}

export function createWorld(seed) {
  const rng = createRandom(seed);
  const group = new THREE.Group();
  group.name = 'KotaMentari';

  const avenues = roadLines();
  const streets = roadLines();
  const buildings = [];

  // --- material & geometri bersama (satu material per warna, satu geometri
  // unit yang di-scale) supaya draw call dan memori tetap ringan. ---
  const matCache = new Map();
  function mat(color) {
    if (!matCache.has(color)) {
      matCache.set(color, new THREE.MeshLambertMaterial({ color }));
    }
    return matCache.get(color);
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 6, 6);
  const crownGeo = new THREE.SphereGeometry(2.4, 8, 6);
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const lampGeo = new THREE.SphereGeometry(0.55, 8, 6);

  function addBox(color, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(unitBox, mat(color));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  // --- langit: warna senja + kabut (main.js tinggal pakai nilai ini). ---
  const sky = {
    background: COLORS.sky,
    fogColor: COLORS.fog,
    fogNear: FOG.near,
    fogFar: FOG.far,
  };

  // --- lampu: matahari rendah dari barat (oranye hangat) + cahaya langit. ---
  const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 0.9);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(COLORS.sun, 1.6);
  sun.position.set(-300, 120, 180);
  group.add(sun);

  // --- tanah dasar, pantai timur, dan laut di luar batas kota. ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    mat(COLORS.ground),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(100, WORLD_SIZE),
    mat(COLORS.sand),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(350, 0.01, 0);
  group.add(beach);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(320, WORLD_SIZE + 200),
    mat(COLORS.sea),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(560, -0.8, 0);
  group.add(sea);

  // --- tekstur jalan: aspal gelap + marka kuning putus-putus + tepi putih.
  // Satu tile = 14 unit (lebar jalan) x 28 unit (panjang): dash 12 unit,
  // celah 16 unit. Dua canvas terpisah (membujur & melintang) — JANGAN
  // pakai clone + rotation: rotasi menukar sumbu UV sehingga repeat.x
  // malah mengulang tile 28x MELEBAR jalan (garis rapat "lorik").
  // Noise hanya bintik halus alpha rendah, tanpa garis apa pun. ---
  const TILE_LEN = 28; // unit dunia per tile sepanjang jalan
  function drawRoadTile(ctx, w, h, horizontal) {
    // Aspal.
    ctx.fillStyle = '#33363e';
    ctx.fillRect(0, 0, w, h);
    // Noise sangat halus: bintik acak 1px, alpha rendah.
    const nRng = createRandom(1234);
    for (let i = 0; i < 260; i += 1) {
      const v = nRng.next();
      ctx.fillStyle = v < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(Math.floor(nRng.next() * w), Math.floor(nRng.next() * h), 1, 1);
    }
    // Tepi putih di kedua sisi lebar jalan + garis tengah kuning
    // putus-putus (satu dash per tile, membujur mengikuti jalan).
    ctx.fillStyle = '#d8d8d0';
    if (horizontal) {
      ctx.fillRect(0, 2, w, 3);
      ctx.fillRect(0, h - 5, w, 3);
      ctx.fillStyle = '#e8c33a';
      ctx.fillRect(0, h / 2 - 2, 110, 4);
    } else {
      ctx.fillRect(2, 0, 3, h);
      ctx.fillRect(w - 5, 0, 3, h);
      ctx.fillStyle = '#e8c33a';
      ctx.fillRect(w / 2 - 2, 0, 4, 110);
    }
  }
  function makeRoadTexture(horizontal) {
    const canvas = document.createElement('canvas');
    canvas.width = horizontal ? 256 : 128;
    canvas.height = horizontal ? 128 : 256;
    drawRoadTile(canvas.getContext('2d'), canvas.width, canvas.height, horizontal);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }
  const roadTex = makeRoadTexture(false);
  roadTex.repeat.set(1, WORLD_SIZE / TILE_LEN);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const streetTex = makeRoadTexture(true);
  streetTex.repeat.set(WORLD_SIZE / TILE_LEN, 1);
  const streetMat = new THREE.MeshLambertMaterial({ map: streetTex });
  const sidewalkMat = mat(COLORS.sidewalk);

  // Trotoar (lebar 20) di bawah aspal (lebar 14) untuk tiap ruas jalan.
  for (const x of avenues) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(SIDEWALK_WIDTH, WORLD_SIZE), sidewalkMat);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(x, 0.01, 0);
    group.add(walk);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, WORLD_SIZE), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.02, 0);
    group.add(road);
  }
  for (const z of streets) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, SIDEWALK_WIDTH), sidewalkMat);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(0, 0.01, z);
    group.add(walk);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, ROAD_WIDTH), streetMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, z);
    group.add(road);
  }

  // --- gedung: tiap blok 80x80 dibagi sel 2x2, tiap sel terisi boleh punya
  // satu gedung. Tinggi mengikuti distrik. ---
  function districtOf(cx, cz) {
    if (cx >= 300) return 'beach';
    if (cz >= 300 && cx >= 200) return 'harbor';
    if (Math.abs(cx) <= 150 && Math.abs(cz) <= 150) return 'downtown';
    if (cx < -200) return 'oldtown';
    if (cz < -250) return 'hills';
    return 'mid';
  }

  function heightFor(district) {
    if (district === 'downtown') return rng.range(30, 70);
    if (district === 'oldtown') return rng.range(8, 16);
    if (district === 'hills') return rng.range(12, 26);
    return rng.range(10, 28);
  }

  function addBuilding(cx, cz, w, d, h) {
    const wall = rng.pick(BUILDING_COLORS);
    const body = addBox(wall, w, h, d, cx, h / 2, cz);
    body.name = 'building';
    const roof = addBox(rng.pick(ROOF_COLORS), w + 1.5, 1.4, d + 1.5, cx, h + 0.7, cz);
    roof.name = 'roof';
    buildings.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      height: h,
    });
  }

  const blockCenters = [];
  for (let v = -WORLD_HALF + ROAD_GAP / 2; v < WORLD_HALF; v += ROAD_GAP) {
    blockCenters.push(v);
  }

  for (const cx of blockCenters) {
    for (const cz of blockCenters) {
      const district = districtOf(cx, cz);
      if (district === 'beach' || district === 'harbor') continue;
      // Satu blok jadi taman kota (palm + bangku) dekat hideout.
      if (cx === -250 && cz === 250) continue;

      if (district === 'downtown') {
        const w = rng.range(56, 68);
        addBuilding(cx, cz, w, w, heightFor(district));
        continue;
      }
      // Sel 2x2: tiap sel 34x34, gedung 24-32 lebarnya.
      const cells = [
        [-17, -17], [17, -17], [-17, 17], [17, 17],
      ];
      // Acak urutan sel, isi 1-3 sel.
      for (let i = cells.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng.next() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      const count = rng.pick([1, 2, 2, 3]);
      for (let i = 0; i < count; i += 1) {
        const [ox, oz] = cells[i];
        const w = rng.range(24, 32);
        const d = rng.range(24, 32);
        addBuilding(cx + ox, cz + oz, w, d, heightFor(district));
      }
    }
  }

  // --- taman kota di blok (-250, 250): palm + bangku. ---
  function addPalm(x, z) {
    const trunk = new THREE.Mesh(trunkGeo, mat(COLORS.palmTrunk));
    trunk.position.set(x, 3, z);
    trunk.rotation.z = rng.range(-0.08, 0.08);
    group.add(trunk);
    const crown = new THREE.Mesh(crownGeo, mat(COLORS.palmLeaf));
    crown.scale.set(1, 0.55, 1);
    crown.position.set(x, 6.4, z);
    group.add(crown);
  }
  function addBench(x, z, rotY) {
    const bench = addBox(COLORS.pierWood, 3, 0.4, 1, x, 0.5, z);
    bench.rotation.y = rotY;
  }
  // Kotak tanaman trotoar: bak kayu + rimbun hijau di atasnya.
  function addPlanter(x, z) {
    addBox(COLORS.pierWood, 2.6, 0.9, 1.4, x, 0.45, z);
    const bush = new THREE.Mesh(crownGeo, mat(COLORS.palmLeaf));
    bush.scale.set(0.55, 0.3, 0.35);
    bush.position.set(x, 1.2, z);
    group.add(bush);
  }
  // Lane B (v3): taman lebih rimbun — 14 palm (v2: 8) + 4 bangku (v2: 2).
  for (let i = 0; i < 14; i += 1) {
    addPalm(-250 + rng.range(-30, 30), 250 + rng.range(-30, 30));
  }
  addBench(-250, 232, 0);
  addBench(-268, 250, Math.PI / 2);
  addBench(-232, 250, Math.PI / 2);
  addBench(-250, 268, 0);

  // --- palm di sepanjang pantai + beberapa di trotoar. ---
  for (let z = -350; z <= 350; z += 50) {
    addPalm(330 + rng.range(-6, 6), z + rng.range(-10, 10));
    addPalm(372 + rng.range(-6, 6), z + 25 + rng.range(-8, 8));
  }
  // Lane B (v3): baris tengah pantai — 14 palm lagi di antara dua baris lama.
  for (let z = -325; z <= 325; z += 50) {
    addPalm(350 + rng.range(-6, 6), z + rng.range(-8, 8));
  }
  // Lane B (v3): palm trotoar acak 55 (v2: 30) supaya jalan terasa rindang.
  for (let i = 0; i < 55; i += 1) {
    const p = randomRoadPointInternal();
    const px = p.x + rng.pick([-11, 11]);
    const pz = p.z + rng.pick([-11, 11]);
    if (isBlocked(px, pz, 2)) continue;
    addPalm(px, pz);
  }
  // Lane B (v3): palm trotoar khusus downtown + Pasar Lama — satu palm di
  // tiap tengah blok (offset trotoar +-11, dicek isBlocked) di avenue
  // -300..200, jadi koridor Menara dan Pasar Lama rindang tanpa palm acak
  // yang menumpuk di satu ruas. 6 avenue x 6 tengah-blok = 36 palm.
  for (const av of [-300, -200, -100, 0, 100, 200]) {
    for (let k = 0; k < 6; k += 1) {
      const mz = -250 + k * 100;
      const side = k % 2 === 0 ? 11 : -11;
      if (isBlocked(av + side, mz, 2)) continue;
      addPalm(av + side, mz);
    }
  }

  // --- lampu jalan di sudut persimpangan (selang-seling). ---
  function addLamp(x, z) {
    const pole = new THREE.Mesh(poleGeo, mat(COLORS.lampPole));
    pole.position.set(x, 3.5, z);
    group.add(pole);
    const head = new THREE.Mesh(lampGeo, mat(COLORS.lampLight));
    head.position.set(x, 7.1, z);
    group.add(head);
  }
  // Lane S (v2): lampu di SEMUA persimpangan (v1: selang-seling).
  for (let ai = 0; ai < avenues.length; ai += 1) {
    for (let si = 0; si < streets.length; si += 1) {
      addLamp(avenues[ai] + 10, streets[si] + 10);
    }
  }
  // Lane B (v3): lampu tengah-blok di avenue downtown (-200..200) — satu
  // lampu per tengah blok supaya avenue Menara terang merata. 5 x 6 = 30.
  for (const av of [-200, -100, 0, 100, 200]) {
    for (let k = 0; k < 6; k += 1) {
      addLamp(av + 10, -250 + k * 100);
    }
  }
  // Lane B (v3): 4 lampu dermaga di tepi dek (z 344, x 415..505) — di luar
  // jalur jalan kaki tengah dek, menerangi koridor menuju kapal (470,350).
  for (const lx of [415, 445, 475, 505]) {
    addLamp(lx, 344);
  }

  // Lane B (v3): hydrant 30 (v2: 16) — tersebar di trotoar seluruh kota.
  for (let i = 0; i < 30; i += 1) {
    const p = randomRoadPointInternal();
    const x = p.x + rng.pick([-11, 11]);
    const z = p.z + rng.pick([-11, 11]);
    if (isBlocked(x, z, 2)) continue;
    const hyd = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 1.4, 8),
      mat(COLORS.hydrant),
    );
    hyd.position.set(x, 0.7, z);
    group.add(hyd);
  }
  // Lane B (v3): peti 26 (v2: 12) — 14 di gudang pelabuhan (area lama),
  // 6 di sisi dermaga (z 318-336 / 364-382, DI LUAR koridor z 344-356
  // supaya jalur ke kapal tetap lega), 6 di Pasar Lama (menjauhi titik
  // spawn -300,200 dan hideout -250,250).
  for (let i = 0; i < 14; i += 1) {
    addBox(COLORS.crate, rng.range(2, 3.5), rng.range(2, 3.5), rng.range(2, 3.5),
      250 + rng.range(-30, 30), 1.2, 350 + rng.range(-25, 25));
  }
  for (let i = 0; i < 6; i += 1) {
    const cz = i % 2 === 0 ? 318 + rng.range(0, 18) : 364 + rng.range(0, 18);
    addBox(COLORS.crate, rng.range(2, 3.5), rng.range(2, 3.5), rng.range(2, 3.5),
      410 + rng.range(0, 90), 1.2, cz);
  }
  for (let i = 0; i < 6; i += 1) {
    const cx = i % 2 === 0 ? -320 + rng.range(0, 40) : -270 + rng.range(0, 40);
    const cz = i % 2 === 0 ? 120 + rng.range(0, 50) : 272 + rng.range(0, 18);
    addBox(COLORS.crate, rng.range(2, 3.5), rng.range(2, 3.5), rng.range(2, 3.5),
      cx, 1.2, cz);
  }
  // Lane B (v3): planter trotoar 16 di tengah-blok avenue downtown — bak
  // kayu + rimbun, dicek isBlocked supaya tidak masuk gedung.
  for (const av of [-200, -100, 0, 100, 200]) {
    for (let k = 0; k < 6; k += 1) {
      if ((av + k) % 2 !== 0) continue;
      const mz = -250 + k * 100;
      const side = k % 2 === 0 ? -12 : 12;
      if (isBlocked(av + side, mz, 2)) continue;
      addPlanter(av + side, mz);
    }
  }
  // Lane B (v3): 4 bangku tambahan di trotoar downtown (tengah-blok).
  addBench(-100 + 12, -150, Math.PI / 2);
  addBench(0 - 12, -50, Math.PI / 2);
  addBench(100 + 12, 50, Math.PI / 2);
  addBench(200 - 12, 150, Math.PI / 2);

  // --- dermaga pelabuhan: dek kayu menjorok ke laut + satu perahu. ---
  // B-1/m-2 (v2): perahu HARUS di posisi kapal misi 6 (470,350) — tepat di
  // koridor dermaga yang bisa dicapai pemain. Posisi lama (480,330) tidak
  // cocok dengan objektif mana pun.
  for (let x = 400; x <= 520; x += 12) {
    addBox(COLORS.pierWood, 11, 0.8, 8, x, 0.4, 350);
  }
  addBox(COLORS.boatHull, 14, 2.5, 5, 470, 0.4, 350);
  addBox(COLORS.boatCabin, 6, 2.5, 4, 468, 2.8, 350);

  // --- graf jalan: simpul di tiap persimpangan, sisi ke tetangga. ---
  const nodes = [];
  const nodeIndex = new Map();
  for (const x of avenues) {
    for (const z of streets) {
      nodeIndex.set(`${x},${z}`, nodes.length);
      nodes.push({ x, z });
    }
  }
  const edges = [];
  const cols = streets.length;
  for (let ai = 0; ai < avenues.length; ai += 1) {
    for (let si = 0; si < streets.length; si += 1) {
      const idx = ai * cols + si;
      if (si + 1 < streets.length) edges.push({ a: idx, b: idx + 1 });
      if (ai + 1 < avenues.length) edges.push({ a: idx, b: idx + cols });
    }
  }
  const roadGraph = { nodes, edges };

  // --- titik spawn. ---
  const spawn = {
    // Raka mulai di jalan depan taman, Pasar Lama.
    player: { x: -300, z: 200 },
    // Mobil parkir di jalan sekitar titik mulai.
    cars: [
      { x: -300, z: 100, heading: 0 },
      { x: -200, z: 200, heading: Math.PI / 2 },
      { x: -300, z: 300, heading: Math.PI },
      { x: -100, z: 200, heading: -Math.PI / 2 },
    ],
    // Dermaga pelabuhan (misi akhir: sampai ke kapal).
    harbor: { x: 470, z: 350 },
    // Markas di taman Pasar Lama.
    hideout: { x: -250, z: 250 },
  };

  // --- helper tabrakan & jalan. ---
  function isBlocked(x, z, r) {
    // Batas dunia, kecuali koridor dermaga (z 344-356, x 396-524) yang
    // boleh dilalui pejalan kaki menuju perahu.
    const onPier = z >= 344 && z <= 356 && x > WORLD_HALF - 4 && x <= 524;
    if (Math.abs(z) > WORLD_HALF - 4) return true;
    if (!onPier && (x < -WORLD_HALF + 4 || x > WORLD_HALF - 4)) return true;
    if (x > 524) return true;
    for (const b of buildings) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) {
        return true;
      }
    }
    return false;
  }

  function nearestRoadPoint(x, z) {
    let ax = avenues[0];
    for (const v of avenues) if (Math.abs(v - x) < Math.abs(ax - x)) ax = v;
    let sz = streets[0];
    for (const v of streets) if (Math.abs(v - z) < Math.abs(sz - z)) sz = v;
    if (Math.abs(ax - x) <= Math.abs(sz - z)) return { x: ax, z };
    return { x, z: sz };
  }

  function randomRoadPointInternal() {
    if (rng.next() < 0.5) {
      return { x: rng.pick(avenues), z: rng.range(-380, 380) };
    }
    return { x: rng.range(-380, 380), z: rng.pick(streets) };
  }

  function randomRoadPoint(rngArg) {
    const r = rngArg || rng;
    // rngArg boleh fungsi acak mentah (mulberry32 ala police/traffic) atau
    // objek createRandom ({next, pick, range}): normalisasi ke ketiganya.
    const next = typeof r.next === 'function' ? () => r.next() : r;
    const pick = typeof r.pick === 'function'
      ? (arr) => r.pick(arr)
      : (arr) => arr[Math.floor(next() * arr.length)];
    const range = typeof r.range === 'function'
      ? (a, b) => r.range(a, b)
      : (a, b) => a + next() * (b - a);
    if (next() < 0.5) {
      return { x: pick(avenues), z: range(-380, 380) };
    }
    return { x: range(-380, 380), z: pick(streets) };
  }

  return {
    group,
    buildings,
    roads: { avenues, streets },
    roadGraph,
    spawn,
    isBlocked,
    nearestRoadPoint,
    randomRoadPoint,
    sky,
  };
}
