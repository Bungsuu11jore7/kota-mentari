// KOTA MENTARI — Modul misi (Lane C, v4)
//
// Alur 6 misi berurutan. Satu-satunya sumber kebenaran adalah dokumen
// desain: nama, urutan, hadiah, dan target misi di bawah ini PERSIS
// seperti yang tertulis di sana. Total hadiah 29700.
//
// Kontrak dengan lane lain (modul utama, player, combat, HUD):
//   - Nama Lane B yang dipakai di sini, persis seperti kontrak:
//     getShipPosition (world) untuk posisi kapal misi 6 — dipanggil
//     dengan game.world dari buildCity bila ada; bila dunia belum
//     tersedia atau panggilannya gagal, dipakai posisi kapal dari
//     dokumen desain (X 470, Z 350) sebagai cadangan. Koridor dermaga
//     dijamin bersih dari halangan oleh modul world, jadi kapal selalu
//     bisa dicapai.
//   - Modul utama membuat keadaan lewat createMissionState, memulai misi
//     lewat startMission, memanggil updateMissions tiap frame, dan membaca
//     teks objective lewat getObjectiveText untuk HUD.
//   - Modul player / combat memberi tahu kejadian lewat onCarStolen dan
//     onEnemyDefeated.
//   - Objek game yang diteruskan ke fungsi-fungsi di sini berbentuk:
//       game.player  : { x, z, speed, health, money, inCar }
//       game.chaseTarget : { x, z } | null  (mobil target misi 3)
//       game.showToast(teks) : tampilkan banner kuning (opsional)
//       game.saveGame() : simpan nomor misi berikut + uang (opsional)
//       game.addMoney(jumlah) : tambah uang pemain (opsional)
//       game.spawnChaseTarget() : munculkan mobil target misi 3 (opsional)
//       game.spawnAttackers(jumlah, x, z) : munculkan penyerang (opsional)
//       game.setWanted(tingkat) : atur wanted polisi (opsional)
//       game.audio : { playFanfare(), playPickup() } (opsional)
//       game.onAllMissionsComplete() : dipanggil saat misi 6 selesai,
//         modul utama lalu menampilkan layar TAMAT (opsional)
//   - Semua callback di atas opsional: bila tidak ada, modul ini tetap
//     berjalan (uang diubah langsung di game.player.money).

import { getShipPosition } from './world.js';

// ---------------------------------------------------------------------------
// Konstanta misi (dari dokumen desain)
// ---------------------------------------------------------------------------

// Posisi kapal di dermaga Pelabuhan (dokumen desain: X 470, Z 350).
export const SHIP_POSITION = { x: 470, z: 350 };
export const SHIP_RADIUS = 12;

// Jarak sentuh penanda misi.
export const MARKER_RADIUS = 6;

// Misi 3: jarak kejar di bawah 10 satuan, dipertahankan selama 3 detik.
export const CHASE_DISTANCE = 10;
export const CHASE_HOLD_SECONDS = 3;

// Misi 5: berdiri di penanda selama 5 detik tanpa tertangkap.
export const SAFE_HOLD_SECONDS = 5;

// Jumlah paket misi 1 dan jumlah penyerang misi 4.
export const PACKAGE_COUNT = 3;
export const ATTACKER_COUNT = 3;

// Total hadiah seluruh misi: 500+1200+2000+3000+8000+15000 = 29700.
export const TOTAL_REWARD = 29700;

// ---------------------------------------------------------------------------
// Daftar 6 misi (urutan, nama, briefing, target, hadiah — PERSIS desain)
// ---------------------------------------------------------------------------

export const MISSIONS = [
  {
    id: 1,
    name: 'Paket Kilat',
    briefing:
      'Raka harus mengantar 3 paket kilat untuk Bos Darma sebelum matahari terbenam.',
    reward: 500,
    // Tiga penanda kuning: dua di Pasar Lama / Pusat kota, terakhir di Menara.
    markers: [
      { x: -200, z: 0 },
      { x: 0, z: 100 },
      { x: 100, z: -300 },
    ],
  },
  {
    id: 2,
    name: 'Mobil Pinjaman',
    briefing:
      'Sebuah mobil oranye terparkir di Pusat kota. Pinjam sebentar — bawa ke Pesisir.',
    reward: 1200,
    // Mobil oranye terparkir di Pusat kota; penanda tujuan di Pesisir.
    parkedCar: { x: 100, z: 0 },
    dropMarker: { x: 0, z: 400 },
  },
  {
    id: 3,
    name: 'Kejar Bayangan',
    briefing:
      'Mobil target melarikan diri di jalan kota. Kejar sampai jarak di bawah 10 selama 3 detik.',
    reward: 2000,
  },
  {
    id: 4,
    name: 'Tolong Mira',
    briefing:
      'Temui Mira di Pasar Lama, lalu lindungi dia dari 3 penyerang Geng Ombak.',
    reward: 3000,
    // Mira menunggu di Pasar Lama.
    mira: { x: -200, z: 100 },
  },
  {
    id: 5,
    name: 'Brankas Pelabuhan',
    briefing:
      'Brankas berisi uang ada di Pelabuhan. Berdiri di penanda 5 detik tanpa tertangkap, lalu ambil isinya.',
    reward: 8000,
    // Penanda brankas di Pelabuhan.
    safe: { x: 400, z: 300 },
  },
  {
    id: 6,
    name: 'Jalan Pulang',
    briefing:
      'Kabur dari polisi dan naik kapal di dermaga. Ini jalan pulang Raka.',
    reward: 15000,
    // Kapal di dermaga (X 470, Z 350).
    ship: { x: 470, z: 350 },
  },
];

// Hadiah per misi, berurutan — sama dengan daftar di atas.
export const MISSION_REWARDS = [500, 1200, 2000, 3000, 8000, 15000];

// ---------------------------------------------------------------------------
// Keadaan misi
// ---------------------------------------------------------------------------

export function createMissionState() {
  return {
    // Nomor misi saat ini, 0 sampai 5. Nilai 6 berarti semua misi selesai.
    current: 0,
    // Benar bila keenam misi sudah selesai.
    finished: false,
    // Misi mana saja yang sudah selesai (per indeks 0-5).
    completed: [false, false, false, false, false, false],
    // Misi 1: jumlah paket yang sudah terantar (0-3) dan indeks penanda aktif.
    delivered: 0,
    markerIndex: 0,
    // Misi 2: benar bila mobil oranye target sudah dicuri.
    stolenCar: false,
    // Misi 3: berapa detik pemain sudah bertahan dekat dengan target.
    chaseTime: 0,
    // Misi 4: benar bila pemain sudah menemui Mira; jumlah penyerang kalah.
    metMira: false,
    attackersDefeated: 0,
    // Misi 5: berapa detik pemain sudah berdiri di penanda brankas.
    safeTime: 0,
    safeOpened: false,
    // Misi 6: posisi kapal yang dipakai (dari getShipPosition bila ada,
    // kalau tidak dari daftar misi). Diisi saat misi 6 dimulai.
    shipPos: null,
  };
}

// Misi yang sedang berjalan, atau null bila semua sudah selesai.
export function getCurrentMission(state) {
  if (!state || state.current >= MISSIONS.length) return null;
  return MISSIONS[state.current];
}

// Nomor misi saat ini (0-5), atau 6 bila semua selesai.
export function getCurrentMissionIndex(state) {
  return state ? state.current : 0;
}

// Benar bila keenam misi sudah selesai.
export function isAllMissionsComplete(state) {
  return !!state && (state.finished || state.current >= MISSIONS.length);
}

// ---------------------------------------------------------------------------
// Bantuan kecil
// ---------------------------------------------------------------------------

function distance2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function isNear(player, target, radius) {
  if (!player || !target) return false;
  return distance2D(player.x, player.z, target.x, target.z) <= radius;
}

function toast(game, text) {
  if (game && typeof game.showToast === 'function') game.showToast(text);
}

function playFanfare(game) {
  if (game && game.audio && typeof game.audio.playFanfare === 'function') {
    game.audio.playFanfare();
  } else if (game && typeof game.playFanfare === 'function') {
    game.playFanfare();
  }
}

function playPickup(game) {
  if (game && game.audio && typeof game.audio.playPickup === 'function') {
    game.audio.playPickup();
  } else if (game && typeof game.playPickup === 'function') {
    game.playPickup();
  }
}

// Ambil posisi kapal lewat getShipPosition (world). Dipanggil dengan
// game.world bila ada (bila tidak, tanpa argumen — argumen ekstra
// diabaikan bila fungsinya tidak memakainya). Bila gagal, kembalikan
// posisi kapal dari dokumen desain (X 470, Z 350).
function resolveShipPosition(game) {
  try {
    const world = game && game.world;
    const pos = world ? getShipPosition(world) : getShipPosition();
    if (pos && typeof pos.x === 'number' && typeof pos.z === 'number') {
      return { x: pos.x, z: pos.z };
    }
    if (Array.isArray(pos) && pos.length >= 2) {
      return { x: pos[0], z: pos[1] };
    }
  } catch (e) {
    // Jatuh ke cadangan di bawah.
  }
  return { x: SHIP_POSITION.x, z: SHIP_POSITION.z };
}

// ---------------------------------------------------------------------------
// Pemulai misi
// ---------------------------------------------------------------------------

// Mulai misi nomor index (0-5). Mengatur ulang kemajuan khusus misi itu,
// menampilkan briefing lewat toast, dan untuk misi 6 menaikkan wanted ke 3.
export function startMission(state, index, game) {
  if (!state) return null;
  if (index < 0 || index >= MISSIONS.length) return null;

  state.current = index;
  state.finished = false;

  // Atur ulang kemajuan khusus tiap misi.
  state.delivered = 0;
  state.markerIndex = 0;
  state.stolenCar = false;
  state.chaseTime = 0;
  state.metMira = false;
  state.attackersDefeated = 0;
  state.safeTime = 0;
  state.safeOpened = false;

  const mission = MISSIONS[index];

  // Misi 3: minta modul utama memunculkan mobil target yang melarikan diri.
  if (index === 2 && game && typeof game.spawnChaseTarget === 'function') {
    game.spawnChaseTarget();
  }

  // Misi 6: ambil posisi kapal dari dunia (getShipPosition) dan wanted
  // langsung naik ke 3 — polisi mengejar, roadblock muncul.
  if (index === 5) {
    state.shipPos = resolveShipPosition(game);
    if (game && typeof game.setWanted === 'function') {
      game.setWanted(3);
    }
  }

  toast(game, 'Misi: ' + mission.name + ' — ' + mission.briefing);
  if (game && typeof game.onMissionStart === 'function') {
    game.onMissionStart(mission);
  }
  return mission;
}

// Mulai ulang misi yang sedang berjalan (dipakai saat coba lagi dari BUSTED):
// kemajuan misi itu diatur ulang, nomor misi dan uang tetap.
export function resetCurrentMission(state, game) {
  if (!state) return null;
  if (state.current >= MISSIONS.length) return null;
  return startMission(state, state.current, game);
}

// ---------------------------------------------------------------------------
// Pemeriksa kemajuan — dipanggil modul utama tiap frame
// ---------------------------------------------------------------------------

export function updateMissions(state, dt, game) {
  if (!state || state.finished) return;
  if (state.current >= MISSIONS.length) return;
  if (!game || !game.player) return;
  if (!dt || dt <= 0) return;

  if (state.current === 0) updateMission1(state, game);
  else if (state.current === 1) updateMission2(state, game);
  else if (state.current === 2) updateMission3(state, dt, game);
  else if (state.current === 3) updateMission4(state, game);
  else if (state.current === 4) updateMission5(state, dt, game);
  else if (state.current === 5) updateMission6(state, game);
}

// Misi 1 "Paket Kilat": antar 3 paket. Sentuh tiap penanda kuning untuk
// mengantar satu paket; penanda terakhir ada di Menara.
function updateMission1(state, game) {
  const mission = MISSIONS[0];
  const marker = mission.markers[state.markerIndex];
  if (!marker) return;
  if (isNear(game.player, marker, MARKER_RADIUS)) {
    state.delivered += 1;
    state.markerIndex += 1;
    playPickup(game);
    if (state.delivered >= PACKAGE_COUNT) {
      completeMission(state, game);
    } else {
      toast(game, 'Paket ' + state.delivered + ' dari 3 terantar');
    }
  }
}

// Misi 2 "Mobil Pinjaman": curi mobil oranye, bawa ke penanda di Pesisir.
function updateMission2(state, game) {
  const mission = MISSIONS[1];
  const player = game.player;

  // Bila pemain sudah duduk di mobil target (diberi tahu lewat onCarStolen
  // atau lewat penanda di keadaan pemain), fase berubah jadi antar ke Pesisir.
  if (!state.stolenCar && (player.stolenTargetCar || player.inTargetCar)) {
    state.stolenCar = true;
    toast(game, 'Bawa mobil oranye ke Pesisir');
  }

  if (state.stolenCar && player.inCar) {
    if (isNear(player, mission.dropMarker, MARKER_RADIUS)) {
      completeMission(state, game);
    }
  }
}

// Misi 3 "Kejar Bayangan": dekati mobil target sampai jarak di bawah 10
// selama 3 detik berturut-turut. Bila menjauh, hitungan mengulang dari nol.
function updateMission3(state, dt, game) {
  const target =
    game.chaseTarget ||
    (typeof game.getChaseTarget === 'function' ? game.getChaseTarget() : null);
  if (!target) return;

  const dist = distance2D(game.player.x, game.player.z, target.x, target.z);
  if (dist < CHASE_DISTANCE) {
    state.chaseTime += dt;
    if (state.chaseTime >= CHASE_HOLD_SECONDS) {
      completeMission(state, game);
    }
  } else {
    state.chaseTime = 0;
  }
}

// Misi 4 "Tolong Mira": temui Mira di Pasar Lama, lalu kalahkan 3 penyerang
// Geng Ombak yang mendekat.
function updateMission4(state, game) {
  const mission = MISSIONS[3];

  if (!state.metMira) {
    if (isNear(game.player, mission.mira, MARKER_RADIUS)) {
      state.metMira = true;
      toast(game, 'Lindungi Mira dari Geng Ombak!');
      if (game && typeof game.spawnAttackers === 'function') {
        game.spawnAttackers(ATTACKER_COUNT, mission.mira.x, mission.mira.z);
      }
    }
    return;
  }

  if (state.attackersDefeated >= ATTACKER_COUNT) {
    completeMission(state, game);
  }
}

// Misi 5 "Brankas Pelabuhan": berdiri di penanda selama 5 detik tanpa
// tertangkap, lalu ambil isi brankas. Bila pergi dari penanda, hitungan
// mengulang dari nol.
function updateMission5(state, dt, game) {
  const mission = MISSIONS[4];
  if (isNear(game.player, mission.safe, MARKER_RADIUS)) {
    state.safeTime += dt;
    if (state.safeTime >= SAFE_HOLD_SECONDS) {
      state.safeOpened = true;
      playPickup(game);
      completeMission(state, game);
    }
  } else {
    state.safeTime = 0;
  }
}

// Misi 6 "Jalan Pulang": kabur ke kapal di dermaga (posisi dari
// getShipPosition; cadangan X 470, Z 350). Naik kapal berarti TAMAT.
function updateMission6(state, game) {
  const ship = state.shipPos || MISSIONS[5].ship;
  if (isNear(game.player, ship, SHIP_RADIUS)) {
    completeMission(state, game);
  }
}

// ---------------------------------------------------------------------------
// Penyelesai misi
// ---------------------------------------------------------------------------

// Selesaikan misi yang sedang berjalan: beri hadiah, simpan lewat modul
// utama, lanjut ke misi berikut (atau tandai semua selesai bila ini misi 6).
export function completeMission(state, game) {
  if (!state) return 0;
  if (state.current >= MISSIONS.length) return 0;

  const mission = MISSIONS[state.current];
  const reward = mission.reward;

  // Beri hadiah.
  if (game && typeof game.addMoney === 'function') {
    game.addMoney(reward);
  } else if (game && game.player) {
    game.player.money = (game.player.money || 0) + reward;
  }

  state.completed[state.current] = true;

  // Simpan nomor misi berikut + uang lewat modul utama.
  if (game && typeof game.saveGame === 'function') game.saveGame();

  playFanfare(game);
  toast(game, 'Misi selesai: ' + mission.name + ' (+$' + reward + ')');

  state.current += 1;

  if (state.current >= MISSIONS.length) {
    // Misi 6 selesai: naik kapal berarti TAMAT.
    state.finished = true;
    if (game && typeof game.onAllMissionsComplete === 'function') {
      game.onAllMissionsComplete();
    }
  } else {
    startMission(state, state.current, game);
  }

  return reward;
}

// ---------------------------------------------------------------------------
// Kejadian dari modul player / combat
// ---------------------------------------------------------------------------

// Dipanggil modul player saat pemain mencuri sebuah mobil. Bila misi 2
// sedang berjalan, fase berubah jadi antar mobil ke Pesisir.
export function onCarStolen(state, game, car) {
  if (!state || state.current !== 1) return;
  state.stolenCar = true;
  toast(game, 'Bawa mobil oranye ke Pesisir');
}

// Dipanggil modul combat saat seorang musuh kalah. Bila misi 4 sedang
// berjalan dan Mira sudah ditemui, hitung satu penyerang kalah.
export function onEnemyDefeated(state, game, enemy) {
  if (!state || state.current !== 3) return;
  if (!state.metMira) return;
  state.attackersDefeated += 1;
  if (state.attackersDefeated >= ATTACKER_COUNT) {
    completeMission(state, game);
  }
}

// Dipanggil modul player saat satu paket terantar lewat interaksi lain
// (bila penanda tidak dipakai). Biasanya updateMission1 sudah menangani ini.
export function onPackageDelivered(state, game) {
  if (!state || state.current !== 0) return;
  state.delivered += 1;
  state.markerIndex += 1;
  playPickup(game);
  if (state.delivered >= PACKAGE_COUNT) {
    completeMission(state, game);
  }
}

// ---------------------------------------------------------------------------
// Teks objective — SELALU aktual, dibaca HUD tiap frame
// ---------------------------------------------------------------------------

export function getObjectiveText(state) {
  if (!state) return 'Pergi ke penanda kuning';
  if (state.finished || state.current >= MISSIONS.length) {
    return 'Semua misi selesai!';
  }

  if (state.current === 0) {
    if (state.delivered <= 0) return 'Pergi ke penanda kuning';
    return 'Paket ' + state.delivered + ' dari 3 terantar';
  }

  if (state.current === 1) {
    if (!state.stolenCar) return 'Curi mobil oranye di Pusat kota';
    return 'Bawa mobil oranye ke Pesisir';
  }

  if (state.current === 2) {
    if (state.chaseTime > 0) return 'Tetap di dekat target!';
    return 'Kejar mobil target';
  }

  if (state.current === 3) {
    if (!state.metMira) return 'Temui Mira di Pasar Lama';
    return (
      'Kalahkan penyerang Geng Ombak (' +
      state.attackersDefeated +
      ' dari 3)'
    );
  }

  if (state.current === 4) {
    if (state.safeTime > 0) return 'Tetap di penanda untuk membuka brankas';
    return 'Pergi ke brankas di Pelabuhan';
  }

  if (state.current === 5) {
    return 'Kabur dari polisi!';
  }

  return 'Semua misi selesai!';
}

// ---------------------------------------------------------------------------
// Penanda aktif — untuk penanda kuning di dunia + berlian kuning di minimap
// ---------------------------------------------------------------------------

// Posisi target misi saat ini (satu titik), atau null bila tidak ada target
// tetap (misalnya misi 4 setelah Mira ditemui: targetnya para penyerang).
export function getActiveMarker(state, game) {
  if (!state) return null;
  if (state.finished || state.current >= MISSIONS.length) return null;

  if (state.current === 0) {
    const mission = MISSIONS[0];
    return mission.markers[state.markerIndex] || null;
  }
  if (state.current === 1) {
    const mission = MISSIONS[1];
    return state.stolenCar ? mission.dropMarker : mission.parkedCar;
  }
  if (state.current === 2) {
    const target =
      game &&
      (game.chaseTarget ||
        (typeof game.getChaseTarget === 'function'
          ? game.getChaseTarget()
          : null));
    return target ? { x: target.x, z: target.z } : null;
  }
  if (state.current === 3) {
    if (!state.metMira) return MISSIONS[3].mira;
    return null;
  }
  if (state.current === 4) {
    return MISSIONS[4].safe;
  }
  if (state.current === 5) {
    return state.shipPos || MISSIONS[5].ship;
  }
  return null;
}

// Semua posisi penanda misi 1 (untuk menggambar ketiganya sekaligus bila perlu).
export function getMission1Markers() {
  return MISSIONS[0].markers.map(function (m) {
    return { x: m.x, z: m.z };
  });
}
