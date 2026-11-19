// police.js — Polisi "KOTA MENTARI" (gta6-01, Lane B).
// Wanted 0–5 bintang. Mobil polisi hitam-putih + light bar merah/biru
// berkedip + sirene (callback). AI kejar pemain, menabrak = damage.
// Bersembunyi (semua polisi >150 unit selama 20 dtk) = wanted -1.
// Polisi menyentuh pemain jalan kaki 3 dtk = 'busted'.
// three.js r170, orisinal, nol aset/network eksternal.
import * as THREE from 'three';
import { createCar, updateCar } from './vehicles.js';

const MAX_WANTED = 5;
const HIDE_DISTANCE = 150; // jarak aman: semua polisi lebih jauh dari ini
const HIDE_TIME = 20; // detik bersembunyi sampai wanted turun 1
const BUST_DISTANCE = 3.5; // jarak sentuh polisi -> pemain jalan kaki
const BUST_TIME = 3; // detik sentuh sampai 'busted'
const RAM_DISTANCE = 3.4; // jarak tabrak polisi -> mobil pemain
const SPAWN_MIN_DIST = 55; // spawn polisi minimal sejauh ini dari pemain
const SIREN_INTERVAL = 1.4; // detik antar panggilan onSiren

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

// Bangun satu mobil polisi: body hitam, pintu/atap putih, light bar.
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

      // Kecepatan polisi: sedikit di atas mobil pemain di wanted tinggi.
      car.maxSpeed = playerMax * (1 + 0.04 * wanted) + 1.5;
      car.accel = 24 + wanted * 1.5;

      const dx = playerPos.x - car.pos.x;
      const dz = playerPos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      const desiredHeading = Math.atan2(dx, dz);
      const turn = clamp(angleDiff(desiredHeading, car.heading), -1, 1);

      // Dekat pemain jalan kaki: pelankan supaya bisa "menangkap", dan
      // berhenti total bila sudah menempel (d < 5) agar timer busted
      // bisa terakumulasi — bukan lewat begitu saja.
      const veryCloseOnFoot = !playerInCar && d < 5;
      const closeOnFoot = !playerInCar && d < 12;
      const throttle = veryCloseOnFoot ? 0 : closeOnFoot ? clamp((6 - car.speed) / 6, 0, 1) : 1;
      updateCar(car, { throttle, steer: turn, brake: veryCloseOnFoot }, dt, worldObj);

      // Polisi hancur (health habis karena tabrakan) -> hilang dari jalan.
      if (car.health <= 0) {
        removeCop(cop);
        continue;
      }

      // Tabrak mobil pemain: damage + wanted naik (sekali per 2 dtk per polisi).
      if (playerInCar && playerCar && d < RAM_DISTANCE && cop.ramCooldown <= 0) {
        cop.ramCooldown = 2;
        const impact = Math.abs(car.speed) + Math.abs(playerCar.speed);
        const damage = clamp(impact * 0.35, 3, 12);
        playerCar.health = Math.max(0, playerCar.health - damage);
        car.speed *= 0.4;
        addHeat(0.25);
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
