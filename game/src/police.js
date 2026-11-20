// KOTA MENTARI — Modul polisi (Lane C, v4)
//
// Wanted 0-5 bintang, pengejaran lewat graf jalan, roadblock, BUSTED,
// dan peluruhan wanted saat pemain bersembunyi. Semua angka mengikuti
// dokumen desain.
//
// Nama-nama Lane B yang dipakai di sini, persis seperti kontrak:
//   - createPoliceCar (vehicles): mobil polisi untuk tiap satuan dan
//     tiap mobil roadblock. Kecepatan batas pakai MAX_POLICE_SPEED
//     (vehicles) = 32. driveCar TIDAK dipakai: itu pengemudi ambient
//     yang mengikuti jalan, sedangkan polisi butuh kemudi kejar-kejaran
//     ke arah pemain, jadi modul ini mengemudikan sendiri.
//   - nearestRoad (world): menjepit titik ke jalan terdekat saat
//     memunculkan polisi debug. Rute kejar-kejaran memakai graf jalan
//     world.graph (nodes/edges/adjacency) bila tersedia, dengan BFS
//     kisi jalan internal sebagai cadangan (kisi yang sama: jalan tiap
//     100 satuan, -400 sampai 400).
//   - spawnCarOnRoad TIDAK dipakai: ia menaruh mobil di posisi acak,
//     sedangkan spawn polisi harus berjarak 60-110 dari pemain.
//   - game.world (dari buildCity) dan game.scene (adegan) diteruskan
//     lewat objek game; bila tidak ada, modul tetap berjalan sebagai
//     data posisi saja (mesh null).
//
// Kontrak dengan lane lain (modul utama, player, HUD):
//   - Modul utama membuat keadaan lewat createPoliceState, memanggil
//     updatePolice tiap frame, dan memeriksa isBusted tiap frame.
//   - Modul player memanggil addWanted saat mencuri mobil (+1), menyerang
//     orang (+1), atau menembak polisi (+1); modul misi memanggil
//     setWanted(3) saat misi 6 dimulai.
//   - HUD membaca getWanted untuk bintang dan getPoliceUnits untuk
//     titik merah di minimap.
import { createPoliceCar, MAX_POLICE_SPEED } from './vehicles.js';
import { nearestRoad } from './world.js';

//   - Objek game yang diteruskan ke fungsi-fungsi di sini berbentuk:
//       game.player : { x, z, angle, speed, health, inCar }
//       game.world : dunia dari buildCity (opsional; dipakai untuk graf
//         jalan dan nearestRoad)
//       game.scene : adegan tiga dimensi (opsional; mesh polisi
//         ditambahkan/dihapus di sini bila ada)
//       game.showToast(teks) : tampilkan banner kuning (opsional)
//       game.damagePlayer(jumlah) : kurangi nyawa pemain (opsional;
//         bila tidak ada, nyawa diubah langsung di game.player.health)
//       game.audio : { playWantedSting() } (opsional)
//       game.createPoliceCarMesh(unit) : buat mesh mobil polisi (opsional,
//         cadangan bila createPoliceCar tidak memberi mesh)
//       game.createRoadblockMesh(car) : buat mesh mobil roadblock
//         (opsional, cadangan)
//       game.removeMesh(mesh) : hapus mesh dari adegan (opsional)
//       game.random() : bilangan acak 0-1 (opsional; bila tidak ada,
//         dipakai Math.random)
//       game.onBusted() : dipanggil sekali saat BUSTED terpicu (opsional)
//   - Arah hadap memakai konvensi: vektor maju = (sin(sudut), cos(sudut))
//     pada sumbu (x, z). Sudut 0 berarti menghadap ke +Z.

// ---------------------------------------------------------------------------
// Konstanta polisi (dari dokumen desain)
// ---------------------------------------------------------------------------

export const MAX_WANTED = 5;
export const MIN_WANTED = 0;

// Kecepatan mobil polisi sampai 32 (mobil biasa sampai 30) — dari
// modul vehicles (MAX_POLICE_SPEED), bukan angka tebakan sendiri.
export const POLICE_MAX_SPEED = MAX_POLICE_SPEED;
export const POLICE_ACCEL = 14;
export const POLICE_BRAKE = 22;

// Hitung ulang rute tiap 1,5 detik.
export const REPATH_INTERVAL = 1.5;

// Kejar langsung (tanpa graf jalan) bila jarak di bawah 25 satuan.
export const DIRECT_CHASE_DISTANCE = 25;

// BUSTED: polisi menyentuh pemain yang lambat/berhenti saat wanted >= 1.
export const BUST_DISTANCE = 3.5;
export const BUST_MAX_PLAYER_SPEED = 3;

// Tabrakan polisi menimbulkan kerusakan (6 nyawa) tanpa menambah wanted.
export const COLLISION_DISTANCE = 3.2;
export const COLLISION_DAMAGE = 6;
export const COLLISION_COOLDOWN = 0.6;

// Roadblock muncul saat wanted minimal 3.
export const ROADBLOCK_MIN_WANTED = 3;

// Peluruhan wanted: bila polisi terdekat lebih dari 80 satuan jauhnya,
// tiap 5 detik wanted turun satu tingkat.
export const HIDE_DISTANCE = 80;
export const DECAY_SECONDS = 5;

// Jarak muncul satuan polisi dari pemain (di persimpangan jalan).
export const SPAWN_DISTANCE_MIN = 60;
export const SPAWN_DISTANCE_MAX = 110;

// Satuan yang terlalu jauh dari pemain dilepas (bukan dimunculkan ulang
// di dekat pemain — kalau tidak, pemain tidak pernah bisa bersembunyi
// dan wanted tidak pernah luruh).
export const DESPAWN_DISTANCE = 260;

// Jejak masih "panas" selama 8 detik sejak kejahatan terakhir: selama
// itu satuan baru terus dimunculkan di dekat pemain. Setelah jejak dingin
// dan tidak ada satuan di dekat pemain, tidak ada satuan baru — pemain
// yang berhasil menjauh bisa bersembunyi dan wanted meluruh.
export const HOT_CHASE_SECONDS = 8;

// Jumlah satuan polisi terbanyak di jalan.
export const MAX_UNITS = 6;

// ---------------------------------------------------------------------------
// Graf jalan (dari dokumen desain: jalan tiap 100 satuan, -400 sampai 400)
// ---------------------------------------------------------------------------

const ROAD_LINES = [-400, -300, -200, -100, 0, 100, 200, 300, 400];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function nearestRoadCoord(value) {
  const v = clamp(value, -400, 400);
  let best = ROAD_LINES[0];
  let bestDist = Math.abs(v - best);
  for (let i = 1; i < ROAD_LINES.length; i++) {
    const d = Math.abs(v - ROAD_LINES[i]);
    if (d < bestDist) {
      bestDist = d;
      best = ROAD_LINES[i];
    }
  }
  return best;
}

function nearestIntersection(x, z) {
  return { x: nearestRoadCoord(x), z: nearestRoadCoord(z) };
}

// Pencari rute BFS di atas persimpangan jalan. Mengembalikan daftar titik
// jalan dari dekat posisi awal menuju dekat posisi tujuan (titik awal tidak
// termasuk). Bila modul world menyediakan pencari rute sendiri, modul utama
// boleh meneruskannya lewat game.findRoadPath — bila tidak ada, BFS ini
// yang dipakai.
export function findRoadPath(fromX, fromZ, toX, toZ) {
  const start = nearestIntersection(fromX, fromZ);
  const goal = nearestIntersection(toX, toZ);
  const key = function (x, z) {
    return x + ',' + z;
  };
  if (start.x === goal.x && start.z === goal.z) {
    return [{ x: goal.x, z: goal.z }];
  }

  const queue = [start];
  const cameFrom = {};
  cameFrom[key(start.x, start.z)] = null;
  const visited = {};
  visited[key(start.x, start.z)] = true;

  while (queue.length > 0) {
    const node = queue.shift();
    if (node.x === goal.x && node.z === goal.z) break;
    const neighbours = [
      { x: node.x + 100, z: node.z },
      { x: node.x - 100, z: node.z },
      { x: node.x, z: node.z + 100 },
      { x: node.x, z: node.z - 100 },
    ];
    for (let i = 0; i < neighbours.length; i++) {
      const n = neighbours[i];
      if (n.x < -400 || n.x > 400 || n.z < -400 || n.z > 400) continue;
      const k = key(n.x, n.z);
      if (visited[k]) continue;
      visited[k] = true;
      cameFrom[k] = node;
      queue.push(n);
    }
  }

  // Susun ulang rute dari tujuan ke awal.
  const path = [];
  let node = goal;
  let guard = 0;
  while (node && guard < 200) {
    path.unshift({ x: node.x, z: node.z });
    node = cameFrom[key(node.x, node.z)];
    guard += 1;
  }
  // Bila tujuan tidak tercapai (seharusnya tidak terjadi di kisi penuh),
  // kembalikan garis lurus ke tujuan.
  if (path.length === 0 || path[0].x !== start.x || path[0].z !== start.z) {
    return [{ x: goal.x, z: goal.z }];
  }
  // Buang titik awal: satuan sudah berada di sana.
  path.shift();
  return path;
}

// Rute lewat graf jalan dunia (world.graph berisi nodes/edges/adjacency).
// Bentuk simpul dan adjacency bisa bermacam-macam, jadi dibaca secara
// defensif: simpul boleh {x, z} atau [x, z] atau {id, x, z}; adjacency
// boleh larik per indeks atau peta id -> daftar tetangga; tetangga boleh
// nomor (id/indeks) atau objek simpul. Mengembalikan daftar titik {x, z}
// atau null bila graf tidak bisa dipakai — pemanggil lalu memakai BFS
// kisi internal di atas.
function pathFromWorldGraph(world, fromX, fromZ, toX, toZ) {
  try {
    const graph = world && world.graph;
    if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
      return null;
    }
    const nodes = graph.nodes;
    const nodePos = function (n) {
      if (Array.isArray(n)) return { x: n[0], z: n[1] };
      return { x: n.x, z: n.z };
    };
    const indexOfId = function (id) {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i] && nodes[i].id === id) return i;
      }
      return -1;
    };
    const nearestIndex = function (x, z) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        const p = nodePos(nodes[i]);
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    };
    const neighboursOf = function (idx) {
      const adj = graph.adjacency;
      let list = null;
      if (Array.isArray(adj)) {
        list = adj[idx];
      } else if (adj && typeof adj === 'object') {
        const node = nodes[idx];
        const key = node && node.id !== undefined ? node.id : idx;
        if (adj[key] !== undefined) list = adj[key];
        else if (adj[String(key)] !== undefined) list = adj[String(key)];
      }
      if (!Array.isArray(list)) return [];
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        let n = -1;
        if (typeof entry === 'number') {
          n = indexOfId(entry);
          if (n < 0) n = entry;
        } else if (entry && typeof entry === 'object') {
          if (entry.id !== undefined) n = indexOfId(entry.id);
          if (n < 0 && entry.x !== undefined) {
            for (let j = 0; j < nodes.length; j++) {
              const p = nodePos(nodes[j]);
              if (p.x === entry.x && p.z === entry.z) {
                n = j;
                break;
              }
            }
          }
        }
        if (n >= 0 && n < nodes.length) out.push(n);
      }
      return out;
    };

    const start = nearestIndex(fromX, fromZ);
    const goal = nearestIndex(toX, toZ);
    const prev = new Array(nodes.length).fill(-1);
    const seen = new Array(nodes.length).fill(false);
    const queue = [start];
    seen[start] = true;
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === goal) break;
      const nb = neighboursOf(cur);
      for (let i = 0; i < nb.length; i++) {
        if (!seen[nb[i]]) {
          seen[nb[i]] = true;
          prev[nb[i]] = cur;
          queue.push(nb[i]);
        }
      }
    }
    if (!seen[goal]) return null;
    const path = [];
    let cur = goal;
    let guard = 0;
    while (cur !== -1 && cur !== start && guard < 1000) {
      path.unshift(nodePos(nodes[cur]));
      cur = prev[cur];
      guard += 1;
    }
    if (path.length === 0) path.push(nodePos(nodes[goal]));
    return path;
  } catch (e) {
    return null;
  }
}

// Jepit satu titik ke jalan terdekat memakai nearestRoad (world) bila
// dunia tersedia; bila tidak, pakai persimpangan kisi internal.
function resolveRoadPoint(world, x, z) {
  if (world) {
    try {
      const p = nearestRoad(world, x, z);
      if (p) {
        if (typeof p.x === 'number' && typeof p.z === 'number') {
          return { x: p.x, z: p.z };
        }
        if (Array.isArray(p) && p.length >= 2) {
          return { x: p[0], z: p[1] };
        }
      }
    } catch (e) {
      // Jatuh ke persimpangan kisi internal di bawah.
    }
  }
  return nearestIntersection(x, z);
}

function angleDifference(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function random01(game) {
  if (game && typeof game.random === 'function') return game.random();
  return Math.random();
}

// ---------------------------------------------------------------------------
// Keadaan polisi
// ---------------------------------------------------------------------------

export function createPoliceState() {
  return {
    // Tingkat wanted, 0 sampai 5.
    wanted: 0,
    // Satuan polisi aktif di jalan.
    units: [],
    // Kelompok roadblock aktif (masing-masing berisi daftar mobil).
    roadblocks: [],
    // Benar bila BUSTED sudah terpicu (sekali saja per penangkapan).
    busted: false,
    // Jam internal (detik sejak keadaan dibuat) untuk peluruhan dan jeda.
    time: 0,
    // Waktu kejahatan terakhir (jam internal) — peluruhan hanya jalan bila
    // sudah lama tidak ada kejahatan baru.
    lastCrimeAt: -100,
    // Penghitung peluruhan: berapa detik pemain sudah bersembunyi.
    hideTimer: 0,
    // Penghitung kemunculan satuan bertahap.
    spawnTimer: 0,
    // Nomor urut satuan berikutnya.
    nextUnitId: 1,
  };
}

// Tingkat wanted saat ini (0-5).
export function getWanted(state) {
  return state ? state.wanted : 0;
}

// Benar bila BUSTED sudah terpicu.
export function isBusted(state) {
  return !!state && state.busted === true;
}

// Daftar satuan polisi aktif (untuk titik merah di minimap dan gambar).
export function getPoliceUnits(state) {
  return state ? state.units : [];
}

// Daftar kelompok roadblock aktif (untuk gambar dan tabrakan).
export function getRoadblocks(state) {
  return state ? state.roadblocks : [];
}

// Jarak ke satuan polisi terdekat, atau tak hingga bila tidak ada polisi.
export function getNearestPoliceDistance(state, game) {
  if (!state || state.units.length === 0 || !game || !game.player) {
    return Infinity;
  }
  let best = Infinity;
  for (let i = 0; i < state.units.length; i++) {
    const u = state.units[i];
    const dx = u.x - game.player.x;
    const dz = u.z - game.player.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Wanted naik / turun
// ---------------------------------------------------------------------------

// Atur wanted ke tingkat tertentu (0-5). Dipakai misi 6 (langsung 3) dan
// antarmuka debug playtest.
export function setWanted(state, level, game) {
  if (!state) return 0;
  const old = state.wanted;
  const next = clamp(Math.round(level), MIN_WANTED, MAX_WANTED);
  state.wanted = next;
  if (next > old) {
    state.lastCrimeAt = state.time;
    state.hideTimer = 0;
    stingWanted(game);
    if (game && typeof game.showToast === 'function') {
      game.showToast('Kabur dari polisi!');
    }
  }
  if (next === 0) {
    clearPolice(state, game);
  }
  return state.wanted;
}

// Tambah wanted sejumlah tertentu (mencuri mobil +1, menyerang orang +1,
// menembak polisi +1). Tidak pernah melewati 5.
export function addWanted(state, amount, game) {
  if (!state) return 0;
  if (!amount || amount <= 0) return state.wanted;
  return setWanted(state, state.wanted + amount, game);
}

function stingWanted(game) {
  if (game && game.audio && typeof game.audio.playWantedSting === 'function') {
    game.audio.playWantedSting();
  } else if (game && typeof game.playWantedSting === 'function') {
    game.playWantedSting();
  }
}

// ---------------------------------------------------------------------------
// Pemunculan satuan polisi
// ---------------------------------------------------------------------------

// Cari satu persimpangan jalan yang jaraknya dari pemain berada di antara
// 60 dan 110 satuan. Bila tidak ketemu setelah beberapa coba, pakai
// persimpangan terdekat yang jaraknya minimal 60.
function pickSpawnPoint(game) {
  const player = game.player;
  let fallback = null;
  let fallbackDist = -1;
  for (let attempt = 0; attempt < 24; attempt++) {
    const ix = ROAD_LINES[Math.floor(random01(game) * ROAD_LINES.length)];
    const iz = ROAD_LINES[Math.floor(random01(game) * ROAD_LINES.length)];
    const dx = ix - player.x;
    const dz = iz - player.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= SPAWN_DISTANCE_MIN && dist <= SPAWN_DISTANCE_MAX) {
      return { x: ix, z: iz };
    }
    if (dist >= SPAWN_DISTANCE_MIN && dist > fallbackDist) {
      fallback = { x: ix, z: iz };
      fallbackDist = dist;
    }
  }
  if (fallback) return fallback;
  const near = nearestIntersection(player.x + 80, player.z);
  return { x: near.x, z: near.z };
}

// Buat mesh mobil polisi lewat createPoliceCar (vehicles). Bila gagal,
// pakai hook game.createPoliceCarMesh; bila itu pun tidak ada, satuan
// tetap dilacak sebagai data posisi saja (mesh null). Mesh yang berhasil
// dibuat ditambahkan ke game.scene bila ada.
function attachMesh(game, unit) {
  unit.mesh = null;
  try {
    const car = createPoliceCar();
    if (car) unit.mesh = car;
  } catch (e) {
    unit.mesh = null;
  }
  if (!unit.mesh && game && typeof game.createPoliceCarMesh === 'function') {
    try {
      unit.mesh = game.createPoliceCarMesh(unit) || null;
    } catch (e) {
      unit.mesh = null;
    }
  }
  if (unit.mesh && game && game.scene && typeof game.scene.add === 'function') {
    try {
      game.scene.add(unit.mesh);
    } catch (e) {
      // Abaikan: modul utama yang menambahkan mesh tetap jalan.
    }
  }
  if (unit.mesh) syncUnitMesh(unit);
}

function detachMesh(game, unit) {
  if (!unit.mesh) return;
  if (game && typeof game.removeMesh === 'function') {
    try {
      game.removeMesh(unit.mesh);
    } catch (e) {
      // Abaikan: mesh sudah tidak ada tidak masalah.
    }
  } else if (game && game.scene && typeof game.scene.remove === 'function') {
    try {
      game.scene.remove(unit.mesh);
    } catch (e) {
      // Abaikan.
    }
  }
  unit.mesh = null;
}

function spawnUnit(state, game, x, z) {
  const unit = {
    id: state.nextUnitId,
    type: 'police',
    x: x,
    z: z,
    angle: 0,
    speed: 0,
    // Rute lewat graf jalan (daftar titik persimpangan).
    path: [],
    pathIndex: 0,
    // Hitung ulang rute tiap 1,5 detik.
    repathTimer: 0,
    // Waktu terakhir unit ini menabrak pemain (jam internal).
    lastHitTime: -100,
    mesh: null,
  };
  state.nextUnitId += 1;
  unit.angle = Math.atan2(game.player.x - x, game.player.z - z);
  attachMesh(game, unit);
  state.units.push(unit);
  return unit;
}

// Munculkan satu satuan polisi di dekat koordinat yang diminta (untuk
// antarmuka debug playtest). Titik dijepit ke jalan lewat nearestRoad
// (world). Wanted dinaikkan ke minimal 1 bila masih 0.
export function spawnPoliceNear(state, game, x, z) {
  if (!state || !game || !game.player) return null;
  if (state.wanted < 1) setWanted(state, 1, game);
  const point = resolveRoadPoint(game.world, x, z);
  return spawnUnit(state, game, point.x, point.z);
}

// Jumlah satuan yang seharusnya ada: wanted + 1, maksimal 6. Wanted 0
// berarti tidak ada polisi.
function targetUnitCount(state) {
  if (state.wanted <= 0) return 0;
  return Math.min(state.wanted + 1, MAX_UNITS);
}

function ensureUnitCount(state, dt, game) {
  const target = targetUnitCount(state);
  // Tambah satuan satu per satu (paling cepat satu tiap 0,4 detik) supaya
  // tidak muncul bergerombol sekaligus — TETAPI hanya bila jejak masih
  // panas (baru ada kejahatan) atau ada satuan yang masih dekat dengan
  // pemain. Bila jejak sudah dingin dan polisi sudah jauh, tidak ada
  // satuan baru: pemain yang berhasil menjauh bisa bersembunyi.
  const hot =
    state.time - state.lastCrimeAt < HOT_CHASE_SECONDS ||
    getNearestPoliceDistance(state, game) < 200;
  state.spawnTimer -= dt;
  while (state.units.length < target && hot && state.spawnTimer <= 0) {
    const point = pickSpawnPoint(game);
    spawnUnit(state, game, point.x, point.z);
    state.spawnTimer = 0.4;
    if (state.units.length >= target) break;
  }
  // Kurangi kelebihan: hapus satuan yang paling jauh dari pemain dulu.
  while (state.units.length > target) {
    let farthest = 0;
    let farthestDist = -1;
    for (let i = 0; i < state.units.length; i++) {
      const u = state.units[i];
      const dx = u.x - game.player.x;
      const dz = u.z - game.player.z;
      const d = dx * dx + dz * dz;
      if (d > farthestDist) {
        farthestDist = d;
        farthest = i;
      }
    }
    const removed = state.units.splice(farthest, 1)[0];
    detachMesh(game, removed);
  }
}

// ---------------------------------------------------------------------------
// Roadblock (wanted minimal 3)
// ---------------------------------------------------------------------------

function attachRoadblockMesh(game, car) {
  car.mesh = null;
  try {
    const policeCar = createPoliceCar();
    if (policeCar) car.mesh = policeCar;
  } catch (e) {
    car.mesh = null;
  }
  if (!car.mesh && game && typeof game.createRoadblockMesh === 'function') {
    try {
      car.mesh = game.createRoadblockMesh(car) || null;
    } catch (e) {
      car.mesh = null;
    }
  }
  if (car.mesh && game && game.scene && typeof game.scene.add === 'function') {
    try {
      game.scene.add(car.mesh);
    } catch (e) {
      // Abaikan.
    }
  }
  if (car.mesh) {
    if (car.mesh.position && typeof car.mesh.position.set === 'function') {
      car.mesh.position.set(car.x, 0, car.z);
    }
    if (typeof car.mesh.rotation !== 'undefined') {
      car.mesh.rotation.y = car.angle;
    }
  }
}

function detachRoadblockMesh(game, car) {
  if (!car.mesh) return;
  if (game && typeof game.removeMesh === 'function') {
    try {
      game.removeMesh(car.mesh);
    } catch (e) {
      // Abaikan.
    }
  } else if (game && game.scene && typeof game.scene.remove === 'function') {
    try {
      game.scene.remove(car.mesh);
    } catch (e) {
      // Abaikan.
    }
  }
  car.mesh = null;
}

// Letakkan satu kelompok roadblock: 3 mobil polisi melintang di jalan,
// 45 satuan di depan arah hadap pemain.
function placeRoadblock(state, game) {
  const player = game.player;
  const heading = player.angle || 0;

  // Jepit arah hadap ke sumbu jalan terdekat (utara/selatan/timur/barat).
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  let dirX = 0;
  let dirZ = 0;
  if (Math.abs(sinH) >= Math.abs(cosH)) {
    dirX = sinH >= 0 ? 1 : -1;
    dirZ = 0;
  } else {
    dirX = 0;
    dirZ = cosH >= 0 ? 1 : -1;
  }

  // Pusat roadblock 45 satuan di depan pemain, dijepit ke garis jalan.
  let centerX = player.x + dirX * 45;
  let centerZ = player.z + dirZ * 45;
  if (dirX !== 0) {
    centerZ = nearestRoadCoord(centerZ);
    centerX = clamp(centerX, -400, 400);
  } else {
    centerX = nearestRoadCoord(centerX);
    centerZ = clamp(centerZ, -400, 400);
  }

  // Arah melintang jalan (tegak lurus arah jalan).
  const perpX = -dirZ;
  const perpZ = dirX;
  const carAngle = Math.atan2(perpX, perpZ);

  const cars = [];
  const offsets = [-7, 0, 7];
  for (let i = 0; i < offsets.length; i++) {
    const car = {
      x: centerX + perpX * offsets[i],
      z: centerZ + perpZ * offsets[i],
      angle: carAngle,
      lastHitTime: -100,
      mesh: null,
    };
    attachRoadblockMesh(game, car);
    cars.push(car);
  }

  state.roadblocks.push({
    x: centerX,
    z: centerZ,
    angle: carAngle,
    cars: cars,
    // Letakkan ulang bila pemain sudah jauh atau tiap 8 detik.
    repositionTimer: 8,
  });
}

function clearRoadblocks(state, game) {
  for (let i = 0; i < state.roadblocks.length; i++) {
    const group = state.roadblocks[i];
    for (let j = 0; j < group.cars.length; j++) {
      detachRoadblockMesh(game, group.cars[j]);
    }
  }
  state.roadblocks = [];
}

function updateRoadblocks(state, dt, game) {
  if (state.wanted < ROADBLOCK_MIN_WANTED) {
    if (state.roadblocks.length > 0) clearRoadblocks(state, game);
    return;
  }
  if (state.roadblocks.length === 0) {
    placeRoadblock(state, game);
    return;
  }
  const group = state.roadblocks[0];
  group.repositionTimer -= dt;
  const dx = group.x - game.player.x;
  const dz = group.z - game.player.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (group.repositionTimer <= 0 || dist > 90) {
    clearRoadblocks(state, game);
    placeRoadblock(state, game);
  }
}

// Hapus semua satuan polisi dan roadblock (saat wanted jadi 0, saat
// tertangkap, atau saat misi diatur ulang).
export function clearPolice(state, game) {
  if (!state) return;
  for (let i = 0; i < state.units.length; i++) {
    detachMesh(game, state.units[i]);
  }
  state.units = [];
  clearRoadblocks(state, game);
  state.hideTimer = 0;
}

// ---------------------------------------------------------------------------
// Pergerakan satuan polisi
// ---------------------------------------------------------------------------

function repathUnit(unit, game) {
  let path = null;
  if (game && typeof game.findRoadPath === 'function') {
    try {
      path = game.findRoadPath(unit.x, unit.z, game.player.x, game.player.z);
    } catch (e) {
      path = null;
    }
  }
  // Rute lewat graf jalan dunia (world.graph) bila tersedia.
  if (!path && game && game.world) {
    path = pathFromWorldGraph(
      game.world,
      unit.x,
      unit.z,
      game.player.x,
      game.player.z
    );
  }
  // Cadangan: BFS kisi jalan internal (jalan tiap 100 satuan).
  if (!path) path = findRoadPath(unit.x, unit.z, game.player.x, game.player.z);
  unit.path = path || [];
  unit.pathIndex = 0;
  unit.repathTimer = REPATH_INTERVAL;
}

// Gerakkan satu satuan polisi selama dt detik menuju titik target.
// Kecepatan dibatasi 32; belokan dibatasi supaya tidak berputar instan.
function moveUnitToward(unit, dt, targetX, targetZ, playerSpeed) {
  const dx = targetX - unit.x;
  const dz = targetZ - unit.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.5) return;

  const desired = Math.atan2(dx, dz);
  const diff = angleDifference(desired, unit.angle);
  const turnRate = 2.8;
  const turn = clamp(diff, -turnRate * dt, turnRate * dt);
  unit.angle += turn;

  // Pelan saat belok tajam; pelan saat sudah sangat dekat dengan pemain
  // supaya bisa menempel tanpa melesat lewat.
  let targetSpeed = POLICE_MAX_SPEED;
  if (Math.abs(diff) > 0.9) targetSpeed = 12;
  else if (dist < 8) targetSpeed = Math.min(POLICE_MAX_SPEED, playerSpeed + 4);

  if (unit.speed < targetSpeed) {
    unit.speed = Math.min(targetSpeed, unit.speed + POLICE_ACCEL * dt);
  } else if (unit.speed > targetSpeed) {
    unit.speed = Math.max(targetSpeed, unit.speed - POLICE_BRAKE * dt);
  }

  unit.x += Math.sin(unit.angle) * unit.speed * dt;
  unit.z += Math.cos(unit.angle) * unit.speed * dt;
  unit.x = clamp(unit.x, -500, 500);
  unit.z = clamp(unit.z, -500, 500);
}

function syncUnitMesh(unit) {
  if (!unit.mesh) return;
  if (unit.mesh.position && typeof unit.mesh.position.set === 'function') {
    unit.mesh.position.set(unit.x, 0, unit.z);
  }
  if (typeof unit.mesh.rotation !== 'undefined') {
    unit.mesh.rotation.y = unit.angle;
  }
}

function updateUnit(state, unit, dt, game) {
  const player = game.player;
  const dx = player.x - unit.x;
  const dz = player.z - unit.z;
  const distToPlayer = Math.sqrt(dx * dx + dz * dz);

  // Satuan yang terlalu jauh dilepas oleh updatePolice (lihat di sana),
  // bukan dimunculkan ulang di dekat pemain.

  // Hitung ulang rute tiap 1,5 detik.
  unit.repathTimer -= dt;
  if (unit.repathTimer <= 0) repathUnit(unit, game);

  // Kejar langsung bila jarak di bawah 25; kalau tidak, ikuti graf jalan.
  if (distToPlayer < DIRECT_CHASE_DISTANCE) {
    moveUnitToward(unit, dt, player.x, player.z, player.speed || 0);
  } else if (unit.path && unit.pathIndex < unit.path.length) {
    const waypoint = unit.path[unit.pathIndex];
    const wdx = waypoint.x - unit.x;
    const wdz = waypoint.z - unit.z;
    const wdist = Math.sqrt(wdx * wdx + wdz * wdz);
    if (wdist < 5) {
      unit.pathIndex += 1;
    } else {
      moveUnitToward(unit, dt, waypoint.x, waypoint.z, player.speed || 0);
    }
  } else {
    moveUnitToward(unit, dt, player.x, player.z, player.speed || 0);
  }

  syncUnitMesh(unit);
}

// ---------------------------------------------------------------------------
// Tabrakan dan BUSTED
// ---------------------------------------------------------------------------

function damagePlayer(game, amount) {
  if (!game || !game.player) return;
  if (typeof game.damagePlayer === 'function') {
    game.damagePlayer(amount);
  } else {
    game.player.health = Math.max(
      0,
      (game.player.health || 0) - amount
    );
  }
}

// Tabrakan menimbulkan kerusakan TANPA menambah wanted. Dipanggil untuk
// tiap satuan polisi dan tiap mobil roadblock yang menyentuh pemain.
function checkCollisions(state, dt, game) {
  const player = game.player;
  const now = state.time;

  for (let i = 0; i < state.units.length; i++) {
    const unit = state.units[i];
    const dx = unit.x - player.x;
    const dz = unit.z - player.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < COLLISION_DISTANCE && now - unit.lastHitTime > COLLISION_COOLDOWN) {
      unit.lastHitTime = now;
      unit.speed *= 0.4;
      damagePlayer(game, COLLISION_DAMAGE);
      if (game && typeof game.onPoliceCollision === 'function') {
        game.onPoliceCollision(unit);
      }
    }
  }

  for (let i = 0; i < state.roadblocks.length; i++) {
    const group = state.roadblocks[i];
    for (let j = 0; j < group.cars.length; j++) {
      const car = group.cars[j];
      const dx = car.x - player.x;
      const dz = car.z - player.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < COLLISION_DISTANCE && now - car.lastHitTime > COLLISION_COOLDOWN) {
        car.lastHitTime = now;
        damagePlayer(game, COLLISION_DAMAGE);
      }
    }
  }
}

// Pemicu BUSTED: polisi menyentuh pemain yang lambat/berhenti saat wanted
// minimal 1, atau nyawa pemain nol. Mengembalikan benar bila BUSTED terpicu
// pada pemeriksaan ini (atau sudah terpicu sebelumnya).
export function checkBusted(state, game) {
  if (!state || !game || !game.player) return false;
  if (state.busted) return true;

  // Nyawa nol berarti tertangkap.
  if ((game.player.health || 0) <= 0) {
    triggerBusted(state, game);
    return true;
  }

  if (state.wanted < 1) return false;

  const playerSpeed = Math.abs(game.player.speed || 0);
  if (playerSpeed >= BUST_MAX_PLAYER_SPEED) return false;

  const nearest = getNearestPoliceDistance(state, game);
  if (nearest < BUST_DISTANCE) {
    triggerBusted(state, game);
    return true;
  }
  return false;
}

function triggerBusted(state, game) {
  if (state.busted) return;
  state.busted = true;
  if (game && typeof game.onBusted === 'function') game.onBusted();
}

// Atur ulang penanda BUSTED (dipakai saat coba lagi dari layar BUSTED).
export function resetBusted(state) {
  if (!state) return;
  state.busted = false;
}

// ---------------------------------------------------------------------------
// Peluruhan wanted saat bersembunyi
// ---------------------------------------------------------------------------

// Wanted berkurang saat pemain bersembunyi: jauh dari polisi (lebih dari
// 80 satuan) dan di luar pandangan mereka, tiap 5 detik turun satu tingkat.
// Tidak berkurang bila baru saja ada kejahatan.
function updateDecay(state, dt, game) {
  if (state.wanted <= 0) {
    state.hideTimer = 0;
    return;
  }
  if (state.time - state.lastCrimeAt < DECAY_SECONDS) {
    state.hideTimer = 0;
    return;
  }
  const nearest = getNearestPoliceDistance(state, game);
  if (nearest > HIDE_DISTANCE) {
    state.hideTimer += dt;
    if (state.hideTimer >= DECAY_SECONDS) {
      state.hideTimer = 0;
      state.wanted = Math.max(0, state.wanted - 1);
      if (state.wanted === 0) clearPolice(state, game);
    }
  } else {
    state.hideTimer = 0;
  }
}

// ---------------------------------------------------------------------------
// Update utama — dipanggil modul utama tiap frame
// ---------------------------------------------------------------------------

export function updatePolice(state, dt, game) {
  if (!state || !game || !game.player) return;
  if (!dt || dt <= 0) return;

  state.time += dt;

  // Bila sudah BUSTED, polisi berhenti mengejar.
  if (state.busted) return;

  ensureUnitCount(state, dt, game);
  updateRoadblocks(state, dt, game);

  // Gerakkan satuan; satuan yang sudah lebih dari 260 satuan jauhnya
  // dilepas (pemain berhasil menjauh — jejak dingin, wanted bisa meluruh).
  for (let i = state.units.length - 1; i >= 0; i--) {
    const unit = state.units[i];
    const dx = unit.x - game.player.x;
    const dz = unit.z - game.player.z;
    if (Math.sqrt(dx * dx + dz * dz) > DESPAWN_DISTANCE) {
      detachMesh(game, unit);
      state.units.splice(i, 1);
      continue;
    }
    updateUnit(state, unit, dt, game);
  }

  checkCollisions(state, dt, game);
  updateDecay(state, dt, game);
  checkBusted(state, game);
}
