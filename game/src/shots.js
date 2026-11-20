// Staging deterministik untuk screenshot (?shot=chase|drive|street|start & ?seed=).
// game = { world, player, vehicles, traffic, police, missions, combat, hud, scene, camera, seed }.
// (v2, Lane F: sentuh-ulang re-witness rekaman baru 04:06 WIB — staging
// Lane S tidak diubah.)

// Menara (downtown) = sekitar pusat; Pasar Lama = barat-daya; Pelabuhan = timur.
const MENARA = { x: 100, z: 0 };
const PASAR_LAMA = { x: -200, z: 200 };
const PELABUHAN = { x: 300, z: -100 };

function roadPoint(world, x, z) {
  if (world && typeof world.nearestRoadPoint === 'function') {
    const p = world.nearestRoadPoint(x, z);
    if (p) return { x: p.x, z: p.z };
  }
  return { x, z };
}

function copsPositions(police) {
  if (!police || !police.cops) return [];
  return police.cops.map((cop) => {
    const p = (cop.car && cop.car.pos) || cop.pos || (cop.group && cop.group.position) || { x: 0, z: 0 };
    return { x: p.x, z: p.z };
  });
}

// Paksa polisi muncul: setWanted hanya menaikkan bintang, spawn terjadi di
// police.update (maks 1 per 0,8 dtk). Di mode shot tidak ada loop game,
// jadi jalankan update beberapa detik secara sinkron sebelum staging.
function spawnCopsForShot(game, playerCar, steps) {
  if (!game.police || typeof game.police.update !== 'function') return;
  const n = typeof steps === 'number' ? steps : 80;
  for (let i = 0; i < n; i += 1) {
    game.police.update(0.05, game.player.pos, !!playerCar, game.world, playerCar || undefined);
  }
}

function snapCamera(player, camera) {
  player.updateCamera(camera, 1);
  player.updateCamera(camera, 1);
}

function putPlayerInCar(game, x, z, heading, color) {
  const point = roadPoint(game.world, x, z);
  const car = game.vehicles.createCar(game.scene, {
    color: color || 0xff6b35,
    x: point.x,
    z: point.z,
    heading,
  });
  game.vehicles.enterCar(game.player, car);
  game.player.inCar = true;
  game.player.car = car;
  game.player.heading = heading;
  game.player.pos.copy(car.pos);
  if (game._cars) game._cars.push(car);
  return car;
}

function stageChase(game) {
  // Cover: kejar-kejaran polisi di Menara, wanted 3, pemain ngebut di mobil.
  const point = roadPoint(game.world, MENARA.x, MENARA.z);
  const heading = Math.PI / 2; // melaju ke +X di avenue Menara
  const car = putPlayerInCar(game, point.x, point.z, heading, 0xff6b35);
  car.speed = 30;
  if (typeof car.maxSpeed === 'number') car.speed = Math.min(car.maxSpeed, 30);

  if (game.police) {
    if (typeof game.police.setWanted === 'function') game.police.setWanted(3);
    else game.police.wanted = 3;
    spawnCopsForShot(game, car);
    // Formasi kejar-kejaran: 1 di belakang pemain (iring-iringan, minimap),
    // 2 mengepung dari sisi depan-kiri/kanan supaya lampu merah/biru
    // terlihat di frame — kamera gameplay ada di belakang mobil pemain,
    // jadi polisi yang murni di belakang tidak masuk frame.
    const cops = game.police.cops || [];
    const offsets = [
      { dx: -14, dz: -4 },
      { dx: 10, dz: 11 },
      { dx: 18, dz: -11 },
    ];
    for (let i = 0; i < Math.min(3, cops.length); i += 1) {
      const cop = cops[i];
      const copCar = cop.car || cop;
      // Posisi: di belakang sepanjang sumbu jalan + geser lateral.
      // forward = (sin h, cos h); right = (cos h, -sin h); dx negatif = jarak ke belakang.
      const bx = point.x - Math.sin(heading) * -offsets[i].dx + Math.cos(heading) * offsets[i].dz;
      const bz = point.z - Math.cos(heading) * -offsets[i].dx - Math.sin(heading) * offsets[i].dz;
      if (copCar.pos) {
        copCar.pos.set(bx, 0, bz);
        copCar.heading = heading;
        copCar.speed = 27;
      }
      if (copCar.group) {
        copCar.group.position.set(bx, 0, bz);
        copCar.group.rotation.y = heading;
      }
    }
    // Kembalikan kecepatan pemain (polisi sempat menabrak selama spawn loop).
    car.speed = 30;
  }

  // Lane S (v2): 2 mobil traffic di latar jauh, searah di depan pemain,
  // supaya jalan tidak kosong — jauh dari formasi polisi, tidak mengganggu.
  if (game.traffic && game.traffic.cars) {
    const bg = [
      { dx: 55, dz: -3.5 },
      { dx: 85, dz: 3.5 },
    ];
    bg.forEach((o, i) => {
      const tc = game.traffic.cars[i];
      if (!tc) return;
      const pos = tc.pos || (tc.car && tc.car.pos) || (tc.group && tc.group.position);
      if (pos) pos.set(point.x + o.dx, 0, point.z + o.dz);
      if (tc.car) {
        tc.car.heading = heading;
        if (tc.car.group) tc.car.group.rotation.y = heading;
      }
    });
  }

  game.hud.showScreen('play');
  game.hud.update({
    health: 86,
    money: game.player.money || 1250,
    wanted: 3,
    speed: car.speed,
    objective: 'Kabur dari polisi!',
    playerPos: game.player.pos,
    playerHeading: game.player.heading,
    cops: copsPositions(game.police),
    marker: { x: point.x + 220, z: point.z },
    inCar: true,
    weapon: game.player.weapon,
  });
  game.hud.showMessage('Kabur dari polisi!');
  snapCamera(game.player, game.camera);
  return { screen: 'play' };
}

function stageDrive(game) {
  // Mengemudi di downtown saat senja, traffic di sekitar, gedung Menara.
  const point = roadPoint(game.world, MENARA.x, MENARA.z);
  const heading = 0;
  const car = putPlayerInCar(game, point.x, point.z, heading, 0x2f7de1);
  car.speed = 16;
  if (game.police && typeof game.police.setWanted === 'function') game.police.setWanted(0);
  else if (game.police) game.police.wanted = 0;

  // Sebarkan traffic agar terlihat di frame (Lane S v2): semua mobil DI
  // ATAS jalan yang sama (avenue x=100, lajur ±3.5) — v1 menyebar ke
  // x=70/130 yang justru di dalam gedung sehingga tak terlihat.
  // 8 mobil searah/berlawanan di depan + 2 menyeberang di persimpangan
  // z=100. Heading ikut diset supaya mobil menghadap searah jalan.
  if (game.traffic && game.traffic.cars) {
    const spots = [
      { x: 103.5, z: 26, h: 0 },
      { x: 96.5, z: 42, h: Math.PI },
      { x: 103.5, z: 60, h: 0 },
      { x: 96.5, z: 82, h: Math.PI },
      { x: 103.5, z: 108, h: 0 },
      { x: 96.5, z: 138, h: Math.PI },
      { x: 103.5, z: 172, h: 0 },
      { x: 96.5, z: 210, h: Math.PI },
      { x: 58, z: 100, h: Math.PI / 2 },
      { x: 142, z: 100, h: -Math.PI / 2 },
    ];
    spots.forEach((s, i) => {
      const tc = game.traffic.cars[i];
      if (!tc) return;
      const pos = tc.pos || (tc.car && tc.car.pos) || (tc.group && tc.group.position);
      if (pos) pos.set(s.x, 0, s.z);
      if (tc.car) {
        tc.car.heading = s.h;
        if (tc.car.group) tc.car.group.rotation.y = s.h;
      }
    });
  }

  // Pejalan kaki di trotoar (x = 100 ± 11) sepanjang jalan di depan.
  if (game.traffic && game.traffic.peds) {
    const pedSpots = [
      { x: 89, z: 18 }, { x: 111, z: 30 }, { x: 89, z: 48 },
      { x: 111, z: 66 }, { x: 89, z: 84 }, { x: 111, z: 100 },
    ];
    pedSpots.forEach((s, i) => {
      const ped = game.traffic.peds[i];
      if (!ped) return;
      const pos = ped.pos || (ped.group && ped.group.position);
      if (pos) pos.set(s.x, 0, s.z);
      if (ped.group) ped.group.rotation.y = i % 2 === 0 ? 0 : Math.PI;
    });
  }

  game.hud.showScreen('play');
  game.hud.update({
    health: 100,
    money: game.player.money || 1250,
    wanted: 0,
    speed: car.speed,
    objective: 'Antar paket ke Menara',
    playerPos: game.player.pos,
    playerHeading: game.player.heading,
    cops: [],
    marker: { x: point.x, z: point.z + 160 },
    inCar: true,
    weapon: game.player.weapon,
  });
  snapCamera(game.player, game.camera);
  return { screen: 'play' };
}

function stageStreet(game) {
  // Jalan kaki di Pasar Lama: pejalan kaki + marker misi kuning + HUD lengkap.
  const point = roadPoint(game.world, PASAR_LAMA.x, PASAR_LAMA.z);
  game.player.reset({ x: point.x, z: point.z });
  // Satu mobil parkir tepat di titik spawn (-200,200) — geser Raka ke
  // samping supaya figur tidak tertutup mobil dari kamera belakang.
  game.player.pos.x += 6;
  game.player.pos.z += 6;
  // Lane S (v2): menghadap +X menyusuri jalan z=200 — marker, pejalan
  // kaki, dan deretan gedung Pasar Lama masuk satu frame (v1 diagonal
  // 0.75π membuat marker jatuh di luar jalan / luar frame).
  game.player.heading = Math.PI / 2;
  game.player.group.rotation.y = game.player.heading;
  game.player.health = 100;
  if (game.police && typeof game.police.setWanted === 'function') game.police.setWanted(1);
  else if (game.police) game.police.wanted = 1;
  spawnCopsForShot(game, null, 40); // titik merah polisi di minimap (2 dtk: belum sampai ke pemain)

  // Pejalan kaki di frame (Lane S v2): 10 pejalan kaki di trotoar
  // kiri-kanan (z = 200 ± 9) dan menyeberang, sepanjang jalan di depan.
  if (game.traffic && game.traffic.peds) {
    const pedSpots = [
      { x: -182, z: 191 }, { x: -176, z: 209 }, { x: -170, z: 200 },
      { x: -164, z: 191 }, { x: -158, z: 209 }, { x: -150, z: 191 },
      { x: -144, z: 200 }, { x: -138, z: 209 }, { x: -186, z: 200 },
      { x: -132, z: 191 },
    ];
    pedSpots.forEach((s, i) => {
      const ped = game.traffic.peds[i];
      if (!ped) return;
      const pos = ped.pos || (ped.group && ped.group.position);
      if (pos) pos.set(s.x, 0, s.z);
      if (ped.group) ped.group.rotation.y = i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
    });
  }

  // Marker misi 3D: di mode shot missions.start() tidak pernah jalan,
  // jadi beam kuning tidak terlihat di v1 — tampilkan langsung di titik
  // yang sama dengan marker minimap (tengah jalan di depan pemain).
  const marker = { x: -150, z: 200 };
  if (game.missions && game.missions.marker) {
    game.missions.marker.visible = true;
    game.missions.marker.position.set(marker.x, 0, marker.z);
  }

  game.hud.showScreen('play');
  game.hud.update({
    health: 100,
    money: game.player.money || 850,
    wanted: 1,
    speed: 0,
    objective: 'Pergi ke penanda kuning',
    playerPos: game.player.pos,
    playerHeading: game.player.heading,
    cops: copsPositions(game.police),
    marker,
    inCar: false,
    weapon: game.player.weapon,
  });
  game.hud.showMessage('Misi: Paket Kilat — antar 3 paket');
  snapCamera(game.player, game.camera);
  return { screen: 'play' };
}

function stageStart(game) {
  // Start screen di atas kota: kamera tinggi memandang Menara saat senja.
  const point = roadPoint(game.world, MENARA.x, MENARA.z);
  game.player.reset({ x: point.x, z: point.z + 40 });
  game.hud.setStart(false);
  game.camera.position.set(point.x + 120, 130, point.z + 190);
  game.camera.lookAt(point.x, 20, point.z);
  return { screen: 'title' };
}

export function stageShot(name, game) {
  if (!game || !game.player || !game.hud || !game.camera) return { screen: 'title' };
  if (game.hud.setWorld && game.world) game.hud.setWorld(game.world);
  switch (name) {
    case 'chase':
      return stageChase(game);
    case 'drive':
      return stageDrive(game);
    case 'street':
      return stageStreet(game);
    case 'start':
      return stageStart(game);
    default:
      return stageStart(game);
  }
}

// Dipakai main.js untuk penanda misi di minimap (ekspor kecil, bukan bagian kontrak shot).
export const SHOT_DISTRICTS = { MENARA, PASAR_LAMA, PELABUHAN };
