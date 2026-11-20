// KOTA MENTARI — sistem misi & cerita.
// Enam misi orisinal mengikuti perjalanan Raka Pratama, kurir Kota Mentari,
// dari paket pertama sampai pelayaran terakhirnya. Semua nama, dialog dan
// lokasi adalah fiksi orisinal; tidak ada kaitan dengan game lain.
//
// Kontrak: createMissions(world, scene, hooks) -> {
//   list, start(i), update(dt, ctx), currentObjective(), onComplete, onFail,
//   fail(reason), save(), load(data), marker, active, objectiveIndex
// }
// ctx yang masuk ke update(): { playerPos:{x,z}, playerInCar, wanted, enemiesAlive }
// hooks (opsional): { onSetWanted(n), onSpawnEnemies([{x,z,jacket}]), onMessage(text) }
// onComplete(index, reward) dan onFail(reason) adalah properti yang bisa
// di-assign oleh main.js; default-nya no-op sehingga aman dipanggil.
//
// v3: currentObjective() TIDAK PERNAH mengembalikan null saat ada misi yang
// bisa ditampilkan — teks objective selalu mencerminkan misi aktif saat ini,
// dan saat semua misi selesai ia mengembalikan "Semua misi selesai!".
// Sebelum v3, currentObjective() mengembalikan null begitu misi selesai
// (active = -1), sehingga main.js jatuh ke teks fallback generik yang basi
// dan tidak mencerminkan progres pemain.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Data misi
// ---------------------------------------------------------------------------

const REWARDS = [500, 1200, 2000, 3000, 8000, 15000];

function buildMissions(spawn) {
  const harbor = spawn.harbor || { x: -360, z: 0 };
  const hideout = spawn.hideout || { x: 300, z: 300 };
  // B-1 (v2): kapal HARUS di titik yang bisa dicapai jalan kaki — tepat di
  // koridor dermaga (x 396-524, z 344-356, lihat world.isBlocked). Posisi
  // lama (harbor.x-20, harbor.z+60) = (450,410) berada di luar batas dunia
  // yang bisa dilalui (|z|>396), jadi objektif tak pernah tercapai.
  // spawn.harbor dunia adalah (470, 350): kapal dan tas misi 5 sama-sama
  // di titik itu.
  const ship = { x: harbor.x, z: harbor.z };

  return [
    {
      id: 0,
      title: 'Paket Kilat',
      reward: REWARDS[0],
      wanted: 0,
      briefing:
        'Tujuan: antar tiga paket sebagai kurir lepas. Ambil paket di gudang ' +
        'Pasar Lama, lalu antar ke Warung Bu Sari di Menara, Toko Kelontong ' +
        'di Pesisir, dan Kios Pelabuhan. Hadiah: $500.',
      dialog: [
        { who: 'Mira', line: 'Raka, tiga paket, tiga alamat. Jangan sampai ada yang nyasar, ya.' },
        { who: 'Raka', line: 'Tenang. Kota ini sudah kuhafal sampai gang terkecilnya.' },
        { who: 'Mira', line: 'Ambil paketnya di gudang Pasar Lama, lalu ikuti panah kuningnya.' },
      ],
      objectives: [
        { text: 'Ambil paket di gudang Pasar Lama', pos: { x: -100, z: 100 }, radius: 6, type: 'reach' },
        { text: 'Antar paket ke Warung Bu Sari di Menara', pos: { x: 100, z: -100 }, radius: 6, type: 'deliver' },
        { text: 'Antar paket ke Toko Kelontong di Pesisir', pos: { x: 200, z: 200 }, radius: 6, type: 'deliver' },
        { text: 'Antar paket terakhir ke Kios Pelabuhan', pos: { x: -200, z: -200 }, radius: 6, type: 'deliver' },
      ],
    },
    {
      id: 1,
      title: 'Mobil Pinjaman',
      reward: REWARDS[1],
      wanted: 0,
      briefing:
        'Tujuan: "pinjam" mobil sport oranye yang terparkir di Menara, lalu ' +
        'bawa ke Bengkel Jaya di Pasar Lama untuk diganti pelatnya. Tekan E ' +
        'di dekat mobil target untuk masuk. Hadiah: $1200.',
      dialog: [
        { who: 'Mira', line: 'Bos Darma minta tolong. Ada mobil oranye terparkir di Menara.' },
        { who: 'Raka', line: 'Pinjam? Atau... pinjam selamanya?' },
        { who: 'Mira', line: 'Tekan E di dekat mobil untuk masuk. Jangan bikin ribut.' },
        { who: 'Raka', line: 'Bengkel Jaya, Pasar Lama. Mengerti.' },
      ],
      objectives: [
        { text: 'Ambil mobil target di parkiran Menara (tekan E di dekat mobil)', pos: { x: 200, z: -100 }, radius: 5, type: 'steal' },
        { text: 'Bawa mobil ke Bengkel Jaya di Pasar Lama', pos: { x: -100, z: 200 }, radius: 7, type: 'deliver', requiresCar: true },
      ],
    },
    {
      id: 2,
      title: 'Kejar Bayangan',
      reward: REWARDS[2],
      wanted: 2,
      briefing:
        'Tujuan: hilangkan wanted 2 bintang. Kamera pengawas merekam aksi ' +
        'Raka di Menara, jadi polisi Kota Mentari kini memburunya. Kabur, ' +
        'sembunyi di tempat persembunyian Bukit, dan tunggu sampai mereka ' +
        'kehilangan jejak (wanted kembali 0). Hadiah: $2000.',
      dialog: [
        { who: 'Mira', line: 'Raka, wajahmu terekam kamera! Polisi sudah menyebar.' },
        { who: 'Raka', line: 'Dua bintang? Baru pemanasan.' },
        { who: 'Mira', line: 'Jangan sok jago. Menghilang dulu sampai bintangnya padam.' },
      ],
      objectives: [
        { text: 'Kabur dari polisi! Hilangkan wanted sampai 0 bintang', pos: { x: hideout.x, z: hideout.z }, radius: 10, type: 'escape' },
      ],
    },
    {
      id: 3,
      title: 'Tolong Mira',
      reward: REWARDS[3],
      wanted: 0,
      briefing:
        'Tujuan: selamatkan Mira yang dicegat tiga anggota Geng Ombak di gang ' +
        'Pasar Lama. Temui Mira di gang itu, lalu kalahkan ketiga anggota ' +
        'geng tersebut. Hadiah: $3000.',
      dialog: [
        { who: 'Mira', line: 'Raka! Mereka mengepungku di gang Pasar Lama!' },
        { who: 'Raka', line: 'Tahan di sana, Mira. Aku datang.' },
        { who: 'Geng Ombak', line: 'Kurir kecil mau jadi pahlawan? Sini, kalau berani.' },
        { who: 'Raka', line: 'Kalian salah pilih orang untuk ditagih.' },
      ],
      // Posisi anggota Geng Ombak yang muncul saat objektif "defeat" aktif.
      enemies: [
        { x: -6, z: -206, jacket: 'purple' },
        { x: 6, z: -194, jacket: 'red' },
        { x: 0, z: -212, jacket: 'purple' },
      ],
      objectives: [
        { text: 'Temui Mira di gang Pasar Lama', pos: { x: 0, z: -200 }, radius: 6, type: 'reach' },
        { text: 'Kalahkan 3 anggota Geng Ombak!', pos: { x: 0, z: -200 }, radius: 14, type: 'defeat' },
      ],
    },
    {
      id: 4,
      title: 'Brankas Pelabuhan',
      reward: REWARDS[4],
      wanted: 4,
      briefing:
        'Tujuan: ambil tas berisi uang setoran Bos Darma di gudang pelabuhan ' +
        '(470, 350), lalu kabur ke tempat persembunyian di Bukit sebelum ' +
        'polisi menutup seluruh jalan keluar pelabuhan. Wanted 4 bintang ' +
        'aktif sejak misi dimulai. Hadiah: $8000.',
      dialog: [
        { who: 'Mira', line: 'Tasnya ada di gudang pelabuhan. Begitu kau ambil, alarm pasti bunyi.' },
        { who: 'Raka', line: 'Empat bintang. Aku pernah lolos dari yang lebih buruk.' },
        { who: 'Mira', line: 'Jangan lewat jalan besar. Tempat persembunyian di Bukit sudah siap.' },
      ],
      objectives: [
        { text: 'Ambil tas di gudang pelabuhan', pos: { x: harbor.x, z: harbor.z }, radius: 12, type: 'reach' },
        { text: 'Kabur ke tempat persembunyian di Bukit', pos: { x: hideout.x, z: hideout.z }, radius: 8, type: 'deliver' },
      ],
    },
    {
      id: 5,
      title: 'Jalan Pulang',
      reward: REWARDS[5],
      wanted: 5,
      briefing:
        'Tujuan: hilangkan wanted 5 bintang, lalu capai kapal terakhir di ' +
        'pelabuhan (470, 350) yang berlayar saat matahari terbenam. Seluruh ' +
        'Kota Mentari kini memburu Raka — kapal itu satu-satunya jalan ' +
        'keluar. Hadiah: $15000.',
      dialog: [
        { who: 'Mira', line: 'Ini terakhir kalinya, Raka. Kapal berlayar saat senja.' },
        { who: 'Raka', line: 'Lima bintang... dan satu kapal. Cukup adil.' },
        { who: 'Mira', line: 'Kalau kau berhasil... sampai jumpa di seberang, kurir.' },
        { who: 'Raka', line: 'Terima kasih, Kota Mentari. Sekarang aku pulang.' },
      ],
      objectives: [
        { text: 'Hilangkan wanted 5 bintang — bersembunyi sampai polisi pergi', pos: { x: hideout.x, z: hideout.z }, radius: 10, type: 'escape' },
        { text: 'Capai kapal di pelabuhan — tamat!', pos: { x: ship.x, z: ship.z }, radius: 12, type: 'reach' },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Marker 3D: pilar cahaya kuning + ring di tanah + panah melayang
// ---------------------------------------------------------------------------

function createMarker() {
  const group = new THREE.Group();
  group.visible = false;

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffd23f, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 30, 16, 1, true), beamMat,
  );
  beam.position.y = 15;
  group.add(beam);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd23f, transparent: true, opacity: 0.85,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  group.add(ring);

  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95 });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 12), arrowMat);
  arrow.rotation.x = Math.PI; // ujung mengarah ke bawah
  arrow.position.y = 8;
  group.add(arrow);

  group.userData = { beam, ring, arrow, beamMat, ringMat, arrowMat };
  return group;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMissions(world, scene, hooks) {
  const h = hooks || {};
  const spawn = (world && world.spawn) || {};
  const list = buildMissions(spawn);

  // Induk marker: scene bila diberikan, kalau tidak world.group (kontrak Lane A).
  const parent = scene || (world && world.group) || null;
  const marker = createMarker();
  if (parent) parent.add(marker);

  const state = {
    active: -1, // index misi yang sedang berjalan, -1 = belum mulai
    objectiveIndex: 0,
    completed: [], // index misi yang sudah selesai
    defeatArmed: false, // true setelah musuh objektif "defeat" di-spawn
    escapeArmed: false, // true setelah wanted misi "escape" aktif
    time: 0,
  };

  const api = {
    list,
    marker,
    onComplete: () => {},
    onFail: () => {},
    get active() { return state.active; },
    get objectiveIndex() { return state.objectiveIndex; },
    get completed() { return state.completed.slice(); },
    get finished() { return state.completed.length >= list.length; },
  };

  function currentMission() {
    return state.active >= 0 && state.active < list.length ? list[state.active] : null;
  }

  function currentObjectiveDef() {
    const m = currentMission();
    if (!m) return null;
    return m.objectives[state.objectiveIndex] || null;
  }

  // Misi berikutnya yang belum selesai (dipakai saat tidak ada misi aktif:
  // layar "complete" di antara dua misi, sebelum misi pertama dimulai).
  function nextMission() {
    for (let i = 0; i < list.length; i += 1) {
      if (!state.completed.includes(i)) return list[i];
    }
    return null;
  }

  function placeMarker(obj) {
    if (!obj) { marker.visible = false; return; }
    marker.visible = true;
    marker.position.set(obj.pos.x, 0, obj.pos.z);
  }

  function announce(text) {
    if (typeof h.onMessage === 'function') h.onMessage(text);
  }

  function applyMissionStartEffects(mission) {
    if (mission.wanted > 0 && typeof h.onSetWanted === 'function') {
      h.onSetWanted(mission.wanted);
      state.escapeArmed = true;
    }
  }

  api.start = function start(index) {
    if (index < 0 || index >= list.length) return false;
    const mission = list[index];
    state.active = index;
    state.objectiveIndex = 0;
    state.defeatArmed = false;
    state.escapeArmed = false;
    applyMissionStartEffects(mission);
    const obj = currentObjectiveDef();
    placeMarker(obj);
    announce(mission.title + ' — ' + mission.briefing);
    return true;
  };

  // Dipanggil main.js saat pemain tertangkap / mati: misi gagal, marker hilang.
  api.fail = function fail(reason) {
    marker.visible = false;
    const index = state.active;
    state.active = -1;
    state.objectiveIndex = 0;
    state.defeatArmed = false;
    state.escapeArmed = false;
    if (typeof api.onFail === 'function') api.onFail(reason || 'Misi gagal', index);
  };

  // v3: teks objective SELALU mencerminkan progres saat ini — tidak pernah
  // null saat ada yang bisa ditampilkan, tidak pernah basi:
  // - misi aktif -> objektif aktif misi itu;
  // - semua misi selesai -> "Semua misi selesai!";
  // - tidak ada misi aktif tapi masih ada misi tersisa (layar complete di
  //   antara misi, atau sebelum misi pertama) -> objektif pertama misi
  //   berikutnya, supaya HUD tidak menampilkan teks misi yang baru selesai.
  api.currentObjective = function currentObjective() {
    if (api.finished) return { text: 'Semua misi selesai!', pos: null };
    const obj = currentObjectiveDef();
    if (obj) return { text: obj.text, pos: { x: obj.pos.x, z: obj.pos.z } };
    const mission = currentMission();
    if (mission) return { text: mission.title, pos: null };
    const next = nextMission();
    if (next && next.objectives.length > 0) {
      const first = next.objectives[0];
      return { text: first.text, pos: { x: first.pos.x, z: first.pos.z } };
    }
    return { text: 'Semua misi selesai!', pos: null };
  };

  api.currentMission = function currentMissionInfo() {
    const m = currentMission();
    if (!m) return null;
    return {
      index: state.active, title: m.title, briefing: m.briefing,
      dialog: m.dialog, reward: m.reward, objectiveIndex: state.objectiveIndex,
      objectiveCount: m.objectives.length,
    };
  };

  function advanceObjective() {
    const mission = currentMission();
    if (!mission) return 'none';
    state.objectiveIndex += 1;
    state.defeatArmed = false;
    if (state.objectiveIndex >= mission.objectives.length) {
      // Misi selesai.
      const index = state.active;
      const reward = mission.reward;
      state.completed.push(index);
      state.active = -1;
      state.objectiveIndex = 0;
      marker.visible = false;
      announce('Misi selesai: ' + mission.title + ' (+$' + reward + ')');
      if (typeof api.onComplete === 'function') api.onComplete(index, reward);
      return 'complete';
    }
    const obj = currentObjectiveDef();
    placeMarker(obj);
    announce(obj.text);
    // Objektif "defeat": minta main.js memunculkan musuh dari combat.
    if (obj.type === 'defeat' && typeof h.onSpawnEnemies === 'function') {
      h.onSpawnEnemies((mission.enemies || []).map((e) => ({ ...e })));
      state.defeatArmed = true;
    }
    return 'objective';
  }

  function dist2D(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  api.update = function update(dt, ctx) {
    state.time += dt;
    // Animasi marker: denyut ring + panah melayang naik-turun.
    if (marker.visible) {
      const pulse = 1 + Math.sin(state.time * 3) * 0.12;
      marker.userData.ring.scale.set(pulse, pulse, 1);
      marker.userData.ringMat.opacity = 0.6 + Math.sin(state.time * 3) * 0.25;
      marker.userData.arrow.position.y = 8 + Math.sin(state.time * 2.2) * 0.8;
      marker.userData.arrow.rotation.y = state.time * 1.5;
    }

    const mission = currentMission();
    const obj = currentObjectiveDef();
    if (!mission || !obj || !ctx || !ctx.playerPos) return null;

    const d = dist2D(ctx.playerPos, obj.pos);
    const wanted = typeof ctx.wanted === 'number' ? ctx.wanted : 0;

    switch (obj.type) {
      case 'reach':
        if (d <= obj.radius) return advanceObjective();
        break;
      case 'deliver':
        // Antar: harus sampai di titik; bila butuh mobil, harus di dalam mobil.
        if (d <= obj.radius && (!obj.requiresCar || ctx.playerInCar)) return advanceObjective();
        break;
      case 'steal':
        // Curi: sampai di titik DAN sudah masuk ke mobil target (oranye).
        // ctx.targetCar = mobil target misi 2 (di-spawn main.js); bila
        // tidak ada (mis. save lama), fallback ke mobil apa pun.
        if (d <= obj.radius && ctx.playerInCar
          && (!ctx.targetCar || ctx.playerCar === ctx.targetCar)) return advanceObjective();
        break;
      case 'escape':
        // Kabur: selesai saat wanted benar-benar 0 (polisi kehilangan jejak).
        // escapeArmed mencegah misi langsung selesai bila wanted belum sempat naik.
        if (state.escapeArmed && wanted <= 0) return advanceObjective();
        if (!state.escapeArmed && wanted > 0) state.escapeArmed = true;
        break;
      case 'defeat':
        // Kalahkan: selesai saat semua musuh yang di-spawn sudah mati.
        if (state.defeatArmed && typeof ctx.enemiesAlive === 'number' && ctx.enemiesAlive <= 0) {
          return advanceObjective();
        }
        break;
      default:
        if (d <= obj.radius) return advanceObjective();
        break;
    }
    return null;
  };

  // Simpan / muat progresi (dipakai main.js bersama localStorage).
  api.save = function save() {
    return {
      active: state.active,
      objectiveIndex: state.objectiveIndex,
      completed: state.completed.slice(),
    };
  };

  api.load = function load(data) {
    if (!data) return false;
    state.completed = Array.isArray(data.completed) ? data.completed.slice() : [];
    if (typeof data.active === 'number' && data.active >= 0 && data.active < list.length) {
      api.start(data.active);
      state.objectiveIndex = Math.min(
        data.objectiveIndex || 0,
        list[data.active].objectives.length - 1,
      );
      placeMarker(currentObjectiveDef());
    }
    return true;
  };

  return api;
}
