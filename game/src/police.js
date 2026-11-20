// police.js — Polisi "KOTA MENTARI".
// Wanted 0–5 bintang. Mobil polisi hitam-putih + light bar merah/biru
// berkedip + sirene (callback). AI kejar pemain, menabrak = damage.
// Bersembunyi (semua polisi >100 unit selama 12 dtk) = wanted -1.
// Polisi menyentuh pemain jalan kaki 3 dtk = 'busted'.
// three.js r170, orisinal, nol aset/network eksternal.
//
// v3: roadblock — saat wanted >= 3, separuh polisi (indeks ganjil) tidak
// lagi mengekor dari belakang, melainkan memotong jalan: mereka menuju
// titik potong di DEPAN arah gerak pemain (prediksi posisi dari kecepatan
// pemain), lalu menahan posisi di sana menghadap ke arah pemain datang.
// Polisi lain tetap mengejar seperti biasa, jadi pemain dijepit dari
// depan dan belakang. Kecepatan dasar tidak berubah: roadblock hanya
// mengubah TARGET navigasi, bukan angka kecepatan.

import * as THREE from 'three';
import { createCar, updateCar } from './vehicles.js';

const MAX_WANTED = 5;
const HIDE_DISTANCE = 100; // M-5 (v2): jarak aman 150 -> 100 — kabur harus mungkin
const HIDE_TIME = 12; // M-5 (v2): bersembunyi 20 dtk -> 12 dtk sampai wanted turun 1
const BUST_DISTANCE = 3.5; // jarak sentuh polisi -> pemain jalan kaki
const BUST_TIME = 3; // detik sentuh sampai 'busted'
const RAM_DISTANCE = 3.4; // jarak tabrak polisi -> mobil pemain
const SPAWN_MIN_DIST = 55; // spawn polisi minimal sejauh ini dari pemain
const SIREN_INTERVAL = 1.4; // detik antar panggilan onSiren

// --- Roadblock (v3) ---
const ROADBLOCK_MIN_WANTED = 3; // roadblock aktif mulai wanted 3
const ROADBLOCK_LEAD_TIME = 2.2; // detik ke depan untuk titik potong
const ROADBLOCK_LEAD_MIN = 20; // jarak potong minimum dari pemain (unit)
const ROADBLOCK_LEAD_MAX = 70; // jarak potong maksimum dari pemain (unit)
const ROADBLOCK_HOLD_DIST = 9; // sudah sampai di titik potong: tahan posisi
const ROADBLOCK_MIN_SPEED = 4; // pemain dianggap bergerak di atas ini (unit/dtk)

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

// RNG kecil mandiri (mulberry32).
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

// Ambil {x, z} dari berbagai bentuk titik jalan:
// {x, z} | Vector3 | [x, z] | { position: {x, z} }.
function pointXZ(p) {
  if (!p) return null;
  if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
  if (Array.isArray(p) && typeof p[0] === 'number') return { x: p[0], z: p[1] };
  if (p.position && typeof p.position.x === 'number') return { x: p.position.x, z: p.position.z };
  return null;
}

// --- Navigasi roadGraph (M-6, v2) ---
// Polisi lama mengejar lurus (atan2 ke pemain) tanpa pathfinding, lalu
// macet di gedung karena updateCar berhenti saat isBlocked. Sekarang polisi
// mengejar lewat node jalan (BFS di roadGraph, hitung ulang tiap 1,5 dtk),
// baru kejar langsung bila sudah dekat (<25 unit). Node pinggir (|x|=400
// atau |z|=400) dikecualikan: isBlocked menolak |x|>396, jadi mobil tak
// bisa melaju di avenue terluar — graf navigasi memakai grid dalam 7x7.
let navWorld = null;
let navAdj = null;
let navNodes = null;

function buildNavGraph(worldObj) {
  if (worldObj === navWorld && navAdj) return true;
  const graph = worldObj && worldObj.roadGraph;
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return false;
  navWorld = worldObj;
  navNodes = graph.nodes;
  navAdj = new Map();
  for (let i = 0; i < navNodes.length; i += 1) navAdj.set(i, []);
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  for (const e of edges) {
    const a = Array.isArray(e) ? e[0] : e.a;
    const b = Array.isArray(e) ? e[1] : e.b;
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    if (!navAdj.has(a) || !navAdj.has(b)) continue;
    navAdj.get(a).push(b);
    navAdj.get(b).push(a);
  }
  return true;
}

function nearestNavNode(x, z) {
  if (!navNodes) return -1;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < navNodes.length; i += 1) {
    const n = navNodes[i];
    if (Math.abs(n.x) > 300 || Math.abs(n.z) > 300) continue; // grid dalam saja
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// BFS node awal -> node tujuan; kembalikan daftar titik {x,z} (tanpa titik awal).
function bfsPath(fromIdx, toIdx) {
  if (fromIdx < 0 || toIdx < 0 || !navAdj) return [];
  if (fromIdx === toIdx) return [];
  const prev = new Map([[fromIdx, -1]]);
  const queue = [fromIdx];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === toIdx) break;
    for (const nb of navAdj.get(cur) || []) {
      if (!prev.has(nb)) {
        prev.set(nb, cur);
        queue.push(nb);
      }
    }
  }
  if (!prev.has(toIdx)) return [];
  const path = [];
  let cur = toIdx;
  while (cur !== -1 && cur !== fromIdx) {
    path.unshift(navNodes[cur]);
    cur = prev.get(cur);
  }
  return path;
}
function buildCopCar(scene, x, z, heading) {
  const car = createCar(scene, {
    color: 0x14161c,
    x,
    z,
    heading,
    maxSpeed: 38,
    accel: 24,
    health: 120,
  });

  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  // Pintu putih di kedua sisi body.
  const doorGeo = new THREE.BoxGeometry(1.9, 0.5, 0.06);
  for (const zSide of [1.02, -1.02]) {
    const door = new THREE.Mesh(doorGeo, white);
    door.position.set(-0.1, 0.68, zSide);
    car.group.add(door);
  }
  // Atap putih.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.6), white);
  roof.position.set(-0.25, 1.42, 0);
  car.group.add(roof);

  // Light bar: alas + lampu merah (kiri) + biru (kanan), emissive.
  const barBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 1.5),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  barBase.position.set(-0.25, 1.52, 0);
  car.group.add(barBase);
  const redMat = new THREE.MeshLambertMaterial({
    color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0,
  });
  const blueMat = new THREE.MeshLambertMaterial({
    color: 0x000055, emissive: 0x2244ff, emissiveIntensity: 0,
  });
  const lampGeo = new THREE.BoxGeometry(0.4, 0.22, 0.6);
  const redLamp = new THREE.Mesh(lampGeo, redMat);
  redLamp.position.set(-0.25, 1.66, 0.38);
  car.group.add(redLamp);
  const blueLamp = new THREE.Mesh(lampGeo, blueMat);
  blueLamp.position.set(-0.25, 1.66, -0.38);
  car.group.add(blueLamp);

  return { car, redMat, blueMat };
}

/**
 * Buat sistem polisi.
 * createPolice(scene, world, opts?) -> {
 *   wanted, setWanted(n), addHeat(n), getWanted(),
 *   update(dt, playerPos, playerInCar, world, playerCar?) -> 'busted' | null,
 *   cops: [] }
 * opts opsional: { onSiren(), onBusted(), onRam(info) }.
 * playerPos: Vector3 (atau {x, z}); playerCar: objek car pemain bila
 *   sedang mengemudi (untuk damage tabrakan + patokan kecepatan).
 */
export function createPolice(scene, world, opts = {}) {
  const rng = mulberry32(4242);
  const cops = [];
  let wanted = 0;
  let heat = 0; // akumulasi pecahan bintang dari addHeat
  let hideTimer = 0;
  let bustTimer = 0;
  let spawnTimer = 0;
  let sirenTimer = 0;
  let blinkPhase = 0;
  // v3 (roadblock): estimasi kecepatan pemain dari selisih posisi antar
  // frame — update() hanya menerima playerPos, tanpa vektor kecepatan.
  let prevPlayerPos = null;
  let playerVel = { x: 0, z: 0 };

  const onSiren = typeof opts.onSiren === 'function' ? opts.onSiren : null;
  const onBusted = typeof opts.onBusted === 'function' ? opts.onBusted : null;
  const onRam = typeof opts.onRam === 'function' ? opts.onRam : null;

  function getWanted() {
    return wanted;
  }

  function setWanted(n) {
    wanted = clamp(Math.round(n) || 0, 0, MAX_WANTED);
    heat = 0;
    hideTimer = 0;
    bustTimer = 0;
    if (wanted === 0) removeAllCops();
  }

  function addHeat(n) {
    if (wanted >= MAX_WANTED) return;
    heat += n || 0;
    while (heat >= 1 && wanted < MAX_WANTED) {
      wanted += 1;
      heat -= 1;
    }
  }

  function removeCop(cop) {
    scene.remove(cop.car.group);
    const i = cops.indexOf(cop);
    if (i >= 0) cops.splice(i, 1);
  }

  function removeAllCops() {
    while (cops.length > 0) removeCop(cops[0]);
  }

  // Cari titik spawn: jalan terdekat pemain, tapi cukup jauh.
  // Bila terlalu dekat / tidak ada, coba randomRoadPoint sampai jauh.
  function findSpawnPoint(playerPos) {
    let best = null;
    if (world && typeof world.nearestRoadPoint === 'function') {
      best = pointXZ(world.nearestRoadPoint(playerPos.x, playerPos.z));
    }
    if (best && dist2(best.x, best.z, playerPos.x, playerPos.z) >= SPAWN_MIN_DIST * SPAWN_MIN_DIST) {
      return best;
    }
    if (world && typeof world.randomRoadPoint === 'function') {
      for (let tries = 0; tries < 10; tries += 1) {
        const p = pointXZ(world.randomRoadPoint(rng));
        if (p && dist2(p.x, p.z, playerPos.x, playerPos.z) >= SPAWN_MIN_DIST * SPAWN_MIN_DIST) {
          return p;
        }
        if (p) best = p;
      }
    }
    // Fallback terakhir: titik terdekat apa adanya, digeser menjauh.
    if (best) {
      const dx = best.x - playerPos.x;
      const dz = best.z - playerPos.z;
      const len = Math.hypot(dx, dz) || 1;
      return {
        x: clamp(playerPos.x + (dx / len) * SPAWN_MIN_DIST, -390, 390),
        z: clamp(playerPos.z + (dz / len) * SPAWN_MIN_DIST, -390, 390),
      };
    }
    return { x: clamp(playerPos.x + SPAWN_MIN_DIST, -390, 390), z: playerPos.z };
  }

  function spawnCop(playerPos) {
    const p = findSpawnPoint(playerPos);
    const heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    const built = buildCopCar(scene, p.x, p.z, heading);
    const cop = {
      car: built.car,
      // Alias supaya HUD/minimap/shots bisa baca cop.pos / cop.group langsung.
      pos: built.car.pos,
      group: built.car.group,
      redMat: built.redMat,
      blueMat: built.blueMat,
      ramCooldown: 0,
      // M-6 (v2): state navigasi roadGraph.
      navPath: [], // waypoint {x,z} menuju pemain
      navRepath: 0, // detik sampai hitung ulang jalur
      // v3: peran roadblock — true bila polisi ini memotong jalan di depan
      // pemain, false bila mengejar dari belakang seperti biasa.
      roadblock: false,
    };
    cops.push(cop);
    return cop;
  }

  /**
   * Satu langkah AI polisi. Mengembalikan 'busted' saat pemain jalan kaki
   * disentuh polisi selama 3 detik berturut-turut, selain itu null.
   */
  function update(dt, playerPos, playerInCar, worldArg, playerCar) {
    dt = Math.min(dt, 0.05);
    const worldObj = worldArg || world;
    blinkPhase += dt;

    // Jumlah polisi yang diinginkan: 0 bila wanted 0, else 2 + wanted.
    const desired = wanted === 0 ? 0 : Math.min(2 + wanted, 7);

    // Spawn bertahap (maks 1 per 0.8 dtk) supaya tidak muncul bergerombol.
    spawnTimer -= dt;
    if (cops.length < desired && spawnTimer <= 0 && playerPos) {
      spawnCop(playerPos);
      spawnTimer = 0.8;
    }
    // Kurangi kelebihan polisi (saat wanted turun).
    while (cops.length > desired) {
      removeCop(cops[cops.length - 1]);
    }

    // Light bar berkedip: merah/biru bergantian tiap 0.25 dtk.
    const redOn = Math.floor(blinkPhase / 0.25) % 2 === 0;
    for (const cop of cops) {
      cop.redMat.emissiveIntensity = redOn ? 1.6 : 0.05;
      cop.blueMat.emissiveIntensity = redOn ? 0.05 : 1.6;
    }

    // Sirene berkala selama pengejaran.
    if (wanted > 0 && cops.length > 0 && onSiren) {
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = SIREN_INTERVAL;
        try {
          onSiren();
        } catch (e) {
          // Callback audio tidak boleh mematikan AI.
        }
      }
    }

    if (!playerPos) return null;

    // --- v3: estimasi kecepatan pemain + titik potong roadblock ---
    // Kecepatan dihaluskan (lerp) supaya satu frame lompat (mis. reset
    // posisi) tidak melempar titik potong ke ujung kota; besarnya di-cap
    // 40 unit/dtk, di atas kecepatan mobil mana pun di game ini.
    if (dt > 0 && prevPlayerPos) {
      const rawVx = (playerPos.x - prevPlayerPos.x) / dt;
      const rawVz = (playerPos.z - prevPlayerPos.z) / dt;
      playerVel.x += (rawVx - playerVel.x) * 0.35;
      playerVel.z += (rawVz - playerVel.z) * 0.35;
      const speed = Math.hypot(playerVel.x, playerVel.z);
      if (speed > 40) {
        playerVel.x = (playerVel.x / speed) * 40;
        playerVel.z = (playerVel.z / speed) * 40;
      }
    }
    prevPlayerPos = { x: playerPos.x, z: playerPos.z };
    // Titik potong: posisi pemain + arah gerak * jarak tempuh ~2,2 dtk ke
    // depan (dibatasi 20-70 unit). Pemain diam / pelan -> titik potong =
    // posisi pemain sendiri, jadi roadblock mendekat seperti pengejar biasa.
    const playerSpeed = Math.hypot(playerVel.x, playerVel.z);
    let intercept = { x: playerPos.x, z: playerPos.z };
    if (wanted >= ROADBLOCK_MIN_WANTED && playerSpeed > ROADBLOCK_MIN_SPEED) {
      const lead = clamp(playerSpeed * ROADBLOCK_LEAD_TIME, ROADBLOCK_LEAD_MIN, ROADBLOCK_LEAD_MAX);
      intercept = {
        x: playerPos.x + (playerVel.x / playerSpeed) * lead,
        z: playerPos.z + (playerVel.z / playerSpeed) * lead,
      };
    }

    // --- Bersembunyi: semua polisi >150 unit -> wanted turun 1 per 20 dtk.
    let nearestDist2 = Infinity;
    for (const cop of cops) {
      nearestDist2 = Math.min(nearestDist2, dist2(cop.car.pos.x, cop.car.pos.z, playerPos.x, playerPos.z));
    }
    if (wanted > 0 && cops.length > 0 && nearestDist2 > HIDE_DISTANCE * HIDE_DISTANCE) {
      hideTimer += dt;
      if (hideTimer >= HIDE_TIME) {
        wanted = Math.max(0, wanted - 1);
        heat = 0;
        hideTimer = 0;
        if (wanted === 0) removeAllCops();
      }
    } else {
      hideTimer = 0;
    }

    // --- AI kejar + tabrak + busted ---
    const playerMax = playerCar && playerCar.maxSpeed ? playerCar.maxSpeed : 30;
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      const cop = cops[i];
      const car = cop.car;
      cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);

      // M-5 (v2): kecepatan polisi DI BAWAH mobil pemain di SEMUA wanted,
      // supaya kabur selalu mungkin tapi tetap tegang: playerMax-2+0,5*wanted,
      // di-cap playerMax-1. wanted 2: 33 vs 34; wanted 5: 33 vs 34 (bukan
      // 34,5 — rumus tanpa cap membuat wanted 5 mustahil kabur). Rumus lama
      // (playerMax*(1+0,04*wanted)+1,5) SELALU lebih cepat (wanted 2: 38,2).
      // Ketegangan datang dari jumlah polisi (2+wanted) + akselerasi
      // mereka yang lebih tinggi, bukan dari kecepatan puncak.
      car.maxSpeed = Math.min(playerMax - 1, playerMax - 2 + wanted * 0.5);
      car.accel = 22 + wanted;

      const dx = playerPos.x - car.pos.x;
      const dz = playerPos.z - car.pos.z;
      const d = Math.hypot(dx, dz);

      // v3 (roadblock): saat wanted >= 3, polisi berindeks ganjil
      // memotong jalan ke titik potong di depan pemain; indeks genap tetap
      // mengejar pemain dari belakang. Peran yang berubah membatalkan
      // jalur BFS lama supaya polisi langsung menghitung rute ke target
      // barunya, bukan melanjutkan waypoint ke target lama.
      const isBlocker = wanted >= ROADBLOCK_MIN_WANTED && i % 2 === 1;
      if (cop.roadblock !== isBlocker) {
        cop.roadblock = isBlocker;
        cop.navPath = [];
        cop.navRepath = 0;
      }
      const targetX = isBlocker ? intercept.x : playerPos.x;
      const targetZ = isBlocker ? intercept.z : playerPos.z;
      const dTarget = Math.hypot(targetX - car.pos.x, targetZ - car.pos.z);

      // M-6 (v2): navigasi via roadGraph. Dekat (<25 unit) kejar langsung;
      // jauh: ikuti waypoint BFS (hitung ulang tiap 1,5 dtk), lewati
      // waypoint yang sudah dicapai (<10 unit). Tanpa graf, fallback kejar
      // lurus seperti dulu. Roadblock memakai mesin yang sama, hanya
      // targetnya titik potong, bukan posisi pemain.
      let tx = targetX;
      let tz = targetZ;
      if (dTarget >= 25 && buildNavGraph(worldObj)) {
        cop.navRepath -= dt;
        if (cop.navRepath <= 0 || cop.navPath.length === 0) {
          const from = nearestNavNode(car.pos.x, car.pos.z);
          const to = nearestNavNode(targetX, targetZ);
          cop.navPath = bfsPath(from, to);
          cop.navRepath = 1.5;
        }
        while (cop.navPath.length > 0) {
          const wp = cop.navPath[0];
          if (Math.hypot(wp.x - car.pos.x, wp.z - car.pos.z) < 10) cop.navPath.shift();
          else break;
        }
        if (cop.navPath.length > 0) {
          tx = cop.navPath[0].x;
          tz = cop.navPath[0].z;
        }
      }

      // Roadblock yang sudah sampai di titik potong menahan posisi dan
      // menghadap ke arah pemain datang — tembok hidup di depan jalan,
      // bukan pengejar yang lewat begitu saja.
      const holding = isBlocker && dTarget < ROADBLOCK_HOLD_DIST;
      const desiredHeading = holding
        ? Math.atan2(playerPos.x - car.pos.x, playerPos.z - car.pos.z)
        : Math.atan2(tx - car.pos.x, tz - car.pos.z);
      const turn = clamp(angleDiff(desiredHeading, car.heading), -1, 1);

      // Dekat pemain jalan kaki: pelankan supaya bisa "menangkap", dan
      // berhenti total bila sudah menempel (d < 5) agar timer busted
      // bisa terakumulasi — bukan lewat begitu saja.
      const veryCloseOnFoot = !playerInCar && d < 5;
      const closeOnFoot = !playerInCar && d < 12;
      const throttle = holding || veryCloseOnFoot
        ? 0
        : closeOnFoot ? clamp((6 - car.speed) / 6, 0, 1) : 1;
      updateCar(car, { throttle, steer: turn, brake: holding || veryCloseOnFoot }, dt, worldObj);

      // Polisi hancur (health habis karena tabrakan) -> hilang dari jalan.
      if (car.health <= 0) {
        removeCop(cop);
        continue;
      }

      // Tabrak mobil pemain: damage saja (M-5 v2: TIDAK BOLEH menaikkan
      // wanted — tabrakan yang menaikkan wanted membuat kabur mustahil:
      // makin lama kabur, makin tinggi wanted). Sekali per 2 dtk per polisi.
      if (playerInCar && playerCar && d < RAM_DISTANCE && cop.ramCooldown <= 0) {
        cop.ramCooldown = 2;
        const impact = Math.abs(car.speed) + Math.abs(playerCar.speed);
        const damage = clamp(impact * 0.35, 3, 12);
        playerCar.health = Math.max(0, playerCar.health - damage);
        car.speed *= 0.4;
        if (onRam) {
          try {
            onRam({ damage, cop: car, playerCar });
          } catch (e) {
            // Callback UI tidak boleh mematikan AI.
          }
        }
      }

      // Tertangkap: polisi menyentuh pemain jalan kaki.
      if (!playerInCar && d < BUST_DISTANCE) {
        bustTimer += dt;
        if (bustTimer >= BUST_TIME) {
          bustTimer = 0;
          if (onBusted) {
            try {
              onBusted();
            } catch (e) {
              // Abaikan.
            }
          }
          return 'busted';
        }
      }
    }
    // Jauh dari semua polisi -> timer tangkap meluruh.
    if (playerInCar || nearestDist2 > BUST_DISTANCE * BUST_DISTANCE) {
      bustTimer = Math.max(0, bustTimer - dt * 2);
    }

    return null;
  }

  // `wanted` diekspos sebagai getter supaya police.wanted selalu
  // mencerminkan nilai terbaru (bukan snapshot 0 saat createPolice).
  return {
    get wanted() {
      return wanted;
    },
    setWanted,
    addHeat,
    getWanted,
    update,
    cops,
  };
}
