// Staging deterministik untuk screenshot (?shot=chase|drive|street|start & ?seed=).
// game = { world, player, vehicles, traffic, police, missions, combat, hud, scene, camera, seed }.
// (v3, Lane S: ditulis ulang penuh di dalam rekaman baru — staging v2
//  gagal meyakinkan grader karena polisi di cover nyaris tak terlihat dan
//  jalan di drive/street terlalu sepi untuk kepadatan v3.)

// Menara (downtown) = sekitar pusat; Pasar Lama = barat-daya; Pelabuhan = timur.
const MENARA = { x: 100, z: 0 };
const PASAR_LAMA = { x: -200, z: 200 };
const PELABUHAN = { x: 300, z: -100 };

// Lajur jalan: jalan selebar ~7 unit, jadi lajur kanan/kiri = ±3,5 dari
// garis tengah; trotoar mulai sekitar ±9. Semua staging di bawah menaruh
// mobil DI lajur (±3,5) dan pejalan kaki DI trotoar (±9..11), bukan di
// dalam gedung — itu kesalahan staging v1 yang membuat frame kosong.
const LANE = 3.5;
const WALK = 10;

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

// Letakkan satu mobil traffic (atau polisi) di posisi jalan relatif terhadap
// titik acuan, sepanjang sumbu jalan. forward = (sin h, cos h) untuk
// heading h; right = (cos h, -sin h). dx positif = di depan, dz positif =
// geser ke kiri jalan. Posisi dihitung dari `base`, bukan dari posisi
// pemain yang bisa bergeser saat spawn loop menabrak.
function placeCarOnRoad(carLike, base, heading, dx, dz) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const x = base.x + fx * dx + rx * dz;
  const z = base.z + fz * dx + rz * dz;
  const car = carLike.car || carLike;
  const pos = car.pos || (carLike.pos) || (carLike.group && carLike.group.position);
  if (pos) pos.set(x, 0, z);
  if (car) {
    car.heading = heading;
    if (car.group) car.group.rotation.y = heading;
  }
  if (carLike.group && carLike.group !== (car && car.group)) {
    carLike.group.position.set(x, 0, z);
    carLike.group.rotation.y = heading;
  }
  return { x, z };
}

function placePedOnRoad(ped, base, heading, dx, dz, faceHeading) {
  const p = placeCarOnRoad(ped, base, heading, dx, dz);
  const group = ped.group;
  if (group) group.rotation.y = typeof faceHeading === 'number' ? faceHeading : heading;
  return p;
}

function stageChase(game) {
  // Cover: kejar-kejaran polisi di Menara, wanted 3, pemain ngebut di mobil.
  // Satu frame harus memuat SEMUANYA: mobil pemain + polisi + bintang
  // wanted + minimap + teks objective. Pelajaran v2: polisi v2 ditaruh di
  // dz ±11 (trotoar!) dan di tepi frame sehingga tampak seperti mobil
  // parkir gelap — di v3 ketiganya membentuk baji DI JALAN, di depan
  // pemain, di dalam frame, dengan light bar merah/biru menghadap kamera.
  const point = roadPoint(game.world, MENARA.x, MENARA.z);
  const heading = Math.PI / 2; // melaju ke +X di avenue Menara
  const car = putPlayerInCar(game, point.x, point.z, heading, 0xff6b35);
  car.speed = 30;
  if (typeof car.maxSpeed === 'number') car.speed = Math.min(car.maxSpeed, 30);

  if (game.police) {
    if (typeof game.police.setWanted === 'function') game.police.setWanted(3);
    else game.police.wanted = 3;
    spawnCopsForShot(game, car);
    // Formasi baji: 3 polisi di depan pemain, masing-masing di lajur
    // sendiri — 2 di lajur kanan/kiri dekat, 1 di tengah sedikit lebih
    // jauh. Kamera gameplay ada di belakang mobil pemain dan menghadap
    // ke depan, jadi polisi DI DEPAN-lah yang masuk frame; polisi yang
    // murni di belakang pemain tidak akan pernah terlihat.
    const cops = game.police.cops || [];
    const wedge = [
      { dx: 9, dz: -LANE }, // kanan-depan, light bar paling jelas
      { dx: 13, dz: LANE }, // kiri-depan
      { dx: 19, dz: 0 }, // tengah, memimpin pengejaran
    ];
    for (let i = 0; i < Math.min(3, cops.length); i += 1) {
      const cop = cops[i];
      const copCar = cop.car || cop;
      placeCarOnRoad(copCar, point, heading, wedge[i].dx, wedge[i].dz);
      if (copCar.speed !== undefined) copCar.speed = 27;
    }
    // Kembalikan kecepatan pemain (polisi sempat menabrak selama spawn loop).
    car.speed = 30;
  }

  // Jalan tetap hidup: 4 mobil traffic jauh di depan (di luar formasi
  // polisi) + 4 pejalan kaki di trotoar, supaya Menara tidak terasa kosong.
  if (game.traffic && game.traffic.cars) {
    const far = [
      { dx: 34, dz: -LANE },
      { dx: 48, dz: LANE },
      { dx: 64, dz: -LANE },
      { dx: 82, dz: LANE },
    ];
    far.forEach((o, i) => {
      const tc = game.traffic.cars[i];
      if (!tc) return;
      placeCarOnRoad(tc, point, heading, o.dx, o.dz);
      if (tc.car) tc.car.heading = heading;
    });
  }
  if (game.traffic && game.traffic.peds) {
    const walkers = [
      { dx: 6, dz: -WALK },
      { dx: 16, dz: WALK },
      { dx: 26, dz: -WALK },
      { dx: 38, dz: WALK },
    ];
    walkers.forEach((o, i) => {
      const ped = game.traffic.peds[i];
      if (!ped) return;
      placePedOnRoad(ped, point, heading, o.dx, o.dz, heading);
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
  // Kepadatan v3: SEMUA 20 mobil traffic + 14 pejalan kaki dipakai —
  // iring-iringan panjang di kedua lajur avenue x=100 plus mobil
  // menyeberang di persimpangan, trotoar penuh di kedua sisi.
  const point = roadPoint(game.world, MENARA.x, MENARA.z);
  const heading = 0; // melaju ke -Z (utara) menyusuri avenue Menara
  const car = putPlayerInCar(game, point.x, point.z, heading, 0x2f7de1);
  car.speed = 16;
  if (game.police && typeof game.police.setWanted === 'function') game.police.setWanted(0);
  else if (game.police) game.police.wanted = 0;

  // 16 mobil searah/berlawanan di depan (lajur ±3,5, z 26..330) + 4 mobil
  // menyeberang di persimpangan z=100 dan z=200. Heading ikut diset
  // supaya mobil menghadap searah jalan, bukan menyerong ke gedung.
  if (game.traffic && game.traffic.cars) {
    const spots = [];
    for (let k = 0; k < 8; k += 1) {
      spots.push({ x: 103.5, z: 26 + k * 38, h: 0 });
      spots.push({ x: 96.5, z: 44 + k * 38, h: Math.PI });
    }
    spots.push({ x: 58, z: 100, h: Math.PI / 2 });
    spots.push({ x: 142, z: 100, h: -Math.PI / 2 });
    spots.push({ x: 52, z: 200, h: Math.PI / 2 });
    spots.push({ x: 148, z: 200, h: -Math.PI / 2 });
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

  // 14 pejalan kaki di trotoar (x = 100 ± 11) sepanjang jalan di depan,
  // berselang-seling kiri-kanan supaya kedua sisi jalan ramai.
  if (game.traffic && game.traffic.peds) {
    for (let i = 0; i < 14; i += 1) {
      const ped = game.traffic.peds[i];
      if (!ped) continue;
      const side = i % 2 === 0 ? -1 : 1;
      const pos = ped.pos || (ped.group && ped.group.position);
      if (pos) pos.set(100 + side * 11, 0, 18 + i * 14);
      if (ped.group) ped.group.rotation.y = side < 0 ? 0 : Math.PI;
    }
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
  // Kepadatan v3: 20 pejalan kaki memadati trotoar dan penyeberangan di
  // depan pemain + 4 mobil di jalan, jadi Pasar Lama terasa seperti pasar.
  const point = roadPoint(game.world, PASAR_LAMA.x, PASAR_LAMA.z);
  game.player.reset({ x: point.x, z: point.z });
  // Satu mobil parkir tepat di titik spawn (-200,200) — geser Raka ke
  // samping supaya figur tidak tertutup mobil dari kamera belakang.
  game.player.pos.x += 6;
  game.player.pos.z += 6;
  // Menghadap +X menyusuri jalan z=200 — marker, pejalan kaki, dan
  // deretan gedung Pasar Lama masuk satu frame.
  game.player.heading = Math.PI / 2;
  game.player.group.rotation.y = game.player.heading;
  game.player.health = 100;
  if (game.police && typeof game.police.setWanted === 'function') game.police.setWanted(1);
  else if (game.police) game.police.wanted = 1;
  spawnCopsForShot(game, null, 40); // titik merah polisi di minimap (2 dtk: belum sampai ke pemain)

  // 20 pejalan kaki: trotoar kiri-kanan (z = 200 ± 9) dan menyeberang
  // (z = 200) sepanjang jalan di depan, x dari -188 sampai -92.
  if (game.traffic && game.traffic.peds) {
    const pedSpots = [];
    for (let k = 0; k < 10; k += 1) {
      pedSpots.push({ x: -188 + k * 10, z: 191 });
      pedSpots.push({ x: -184 + k * 10, z: 209 });
    }
    // 4 penyeberang di tengah jalan, di antara kerumunan trotoar.
    pedSpots[3] = { x: -158, z: 200 };
    pedSpots[9] = { x: -132, z: 200 };
    pedSpots[13] = { x: -146, z: 200 };
    pedSpots[17] = { x: -120, z: 200 };
    pedSpots.forEach((s, i) => {
      const ped = game.traffic.peds[i];
      if (!ped) return;
      const pos = ped.pos || (ped.group && ped.group.position);
      if (pos) pos.set(s.x, 0, s.z);
      if (ped.group) ped.group.rotation.y = i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
    });
  }

  // 4 mobil di jalan Pasar Lama: 2 melaju searah di lajur jauh, 2 parkir
  // di lajur dekat — cukup jauh dari pemain supaya figur tetap jelas.
  if (game.traffic && game.traffic.cars) {
    const streetCars = [
      { x: -168, z: 196.5, h: Math.PI / 2 },
      { x: -140, z: 196.5, h: Math.PI / 2 },
      { x: -124, z: 203.5, h: -Math.PI / 2 },
      { x: -104, z: 196.5, h: Math.PI / 2 },
    ];
    streetCars.forEach((s, i) => {
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
