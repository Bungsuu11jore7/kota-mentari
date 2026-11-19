// Staging deterministik untuk screenshot (?shot=chase|drive|street|start & ?seed=).
// game = { world, player, vehicles, traffic, police, missions, combat, hud, scene, camera, seed }.

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

  // Sebarkan traffic agar terlihat di frame.
  if (game.traffic && game.traffic.cars) {
    game.traffic.cars.forEach((tc, i) => {
      const p = roadPoint(game.world, point.x + (i % 3) * 30 - 30, point.z + 60 + i * 22);
      const pos = tc.pos || (tc.car && tc.car.pos) || (tc.group && tc.group.position);
      if (pos) pos.set(p.x, 0, p.z);
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
  game.player.heading = Math.PI * 0.75;
  game.player.group.rotation.y = game.player.heading;
  game.player.health = 100;
  if (game.police && typeof game.police.setWanted === 'function') game.police.setWanted(1);
  else if (game.police) game.police.wanted = 1;
  spawnCopsForShot(game, null, 40); // titik merah polisi di minimap (2 dtk: belum sampai ke pemain)

  // Pejalan kaki di dekat pemain.
  if (game.traffic && game.traffic.peds) {
    game.traffic.peds.slice(0, 6).forEach((ped, i) => {
      const pos = ped.pos || (ped.group && ped.group.position);
      if (pos) pos.set(point.x + 6 + (i % 3) * 5, 0, point.z + 10 + Math.floor(i / 3) * 8);
    });
  }

  const marker = { x: point.x + 45, z: point.z - 30 };
  if (game.missions && typeof game.missions.currentObjective === 'function') {
    const obj = game.missions.currentObjective();
    if (obj && obj.pos) {
      marker.x = obj.pos.x;
      marker.z = obj.pos.z;
    }
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
