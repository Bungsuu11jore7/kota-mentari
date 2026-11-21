// KOTA MENTARI — staging 4 adegan foto (bukan bagian loop game).
// Modul ini TIDAK diimpor main.js; dipakai skrip retake lewat window.KOTA_SHOTS.
// Semua pemanggilan kamera memakai ENAM ANGKA (mata x/y/z + tatap x/y/z).
// Setiap adegan memverifikasi posisi subjek SEBELUM foto diambil.

export const SHOT_NAMES = ['chase', 'drive', 'street', 'start'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function debugApi() {
  if (typeof window === 'undefined') return null;
  return window.KOTA_DEBUG || null;
}

function callDebug(name, ...args) {
  const api = debugApi();
  if (!api || typeof api[name] !== 'function') {
    return { ok: false, missing: name };
  }
  try {
    return { ok: true, value: api[name](...args) };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function readState() {
  const api = debugApi();
  if (!api || typeof api.getState !== 'function') return null;
  try {
    return api.getState();
  } catch (err) {
    return null;
  }
}

// Kamera: HANYA enam angka. Menolak apa pun selain angka berhingga.
export function setCamera6(eyeX, eyeY, eyeZ, targetX, targetY, targetZ) {
  const args = [eyeX, eyeY, eyeZ, targetX, targetY, targetZ];
  if (args.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    return { ok: false, error: 'kamera butuh enam angka' };
  }
  return callDebug('setCamera', eyeX, eyeY, eyeZ, targetX, targetY, targetZ);
}

// Normalisasi posisi ke { x, z }: menerima {x,z}, {x,y,z}, atau [x, z]/[x, y, z].
function asXZ(point) {
  if (!point) return null;
  if (Array.isArray(point)) {
    if (point.length >= 3) return { x: point[0], z: point[2] };
    if (point.length >= 2) return { x: point[0], z: point[1] };
    return null;
  }
  if (typeof point.x === 'number' && typeof point.z === 'number') {
    return { x: point.x, z: point.z };
  }
  if (typeof point.x === 'number' && typeof point.y === 'number') {
    return { x: point.x, z: point.y };
  }
  return null;
}

function statePlayer(state) {
  if (!state) return null;
  const p = state.player || state.playerState || state.pos || null;
  if (!p) return null;
  const xz = asXZ(p.position || p.pos || p);
  if (!xz) return null;
  return {
    x: xz.x,
    z: xz.z,
    heading: typeof p.heading === 'number' ? p.heading : (typeof p.angle === 'number' ? p.angle : 0),
    inCar: !!(p.inCar || p.driving || p.inVehicle),
    speedKmh: typeof p.speedKmh === 'number' ? p.speedKmh : (typeof state.speedKmh === 'number' ? state.speedKmh : 0),
  };
}

function stateList(state, keys) {
  if (!state) return [];
  for (const key of keys) {
    const list = state[key];
    if (Array.isArray(list)) return list;
  }
  return [];
}

function listPositions(items) {
  const out = [];
  for (const item of items) {
    const xz = asXZ(item.position || item.pos || item);
    if (xz) out.push(xz);
  }
  return out;
}

function activeMarker(state) {
  const api = debugApi();
  if (api && typeof api.getActiveMarker === 'function') {
    try {
      const marker = api.getActiveMarker();
      const xz = asXZ(marker);
      if (xz) return xz;
    } catch (err) {
      // Lanjut ke state.
    }
  }
  if (!state) return null;
  return asXZ(state.marker || state.activeMarker || state.target || null);
}

// Arah maju dari sudut: komponen x dari sinus, komponen z dari kosinus.
function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

// Cek satu titik dalam pandangan kamera: di depan mata, dalam sudut dan jarak wajar.
function inFrame(eye, target, point, maxAngleDeg, maxDist) {
  const fx = target.x - eye.x;
  const fy = (target.y || 0) - (eye.y || 0);
  const fz = target.z - eye.z;
  const flen = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (flen < 0.001) return false;
  const px = point.x - eye.x;
  const py = (point.y || 0) - (eye.y || 0);
  const pz = point.z - eye.z;
  const plen = Math.sqrt(px * px + py * py + pz * pz);
  if (plen < 0.5 || plen > (maxDist || 220)) return false;
  const dot = (fx * px + fy * py + fz * pz) / (flen * plen);
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  return angle <= (maxAngleDeg || 35);
}

function countInFrame(eye, target, points, maxAngleDeg, maxDist) {
  let count = 0;
  for (const point of points) {
    if (inFrame(eye, target, point, maxAngleDeg, maxDist)) count += 1;
  }
  return count;
}

function chaseCamera(player) {
  const forward = forwardOf(player.heading);
  const eye = {
    x: player.x - forward.x * 10,
    y: 4.5,
    z: player.z - forward.z * 10,
  };
  const target = {
    x: player.x + forward.x * 12,
    y: 1.5,
    z: player.z + forward.z * 12,
  };
  return { eye, target };
}

function streetCamera(player) {
  const forward = forwardOf(player.heading);
  const eye = {
    x: player.x - forward.x * 4.5,
    y: 1.7,
    z: player.z - forward.z * 4.5,
  };
  const target = {
    x: player.x + forward.x * 6,
    y: 1.5,
    z: player.z + forward.z * 6,
  };
  return { eye, target };
}

function driveCamera(player) {
  const forward = forwardOf(player.heading);
  const eye = {
    x: player.x - forward.x * 9,
    y: 4,
    z: player.z - forward.z * 9,
  };
  const target = {
    x: player.x + forward.x * 14,
    y: 1.5,
    z: player.z + forward.z * 14,
  };
  return { eye, target };
}

// Menyiapkan satu adegan: staging lewat antarmuka debug + kamera enam angka.
// Mengembalikan info verifikasi; ok:false berarti adegan BELUM siap difoto.
export async function setupShot(name) {
  if (!SHOT_NAMES.includes(name)) {
    return { shot: name, ok: false, error: `nama adegan tidak dikenal: ${name}` };
  }
  if (!debugApi()) {
    return { shot: name, ok: false, error: 'KOTA_DEBUG tidak tersedia' };
  }

  if (name === 'start') {
    const state = readState();
    const screen = state ? state.screen : null;
    const camera = setCamera6(140, 160, 240, 0, 0, -20);
    const startVisible = screen === 'start' || screen === 'menu' || screen === 'title' || screen === null;
    return {
      shot: name,
      ok: startVisible && camera.ok !== false,
      screen,
      camera,
      note: 'layar mulai + kota senja dari udara; pakai halaman baru bila game sudah mulai',
    };
  }

  let state = readState();
  if (!state || state.screen !== 'playing') {
    callDebug('startNew');
    await sleep(400);
    state = readState();
    if (!state || state.screen !== 'playing') {
      return { shot: name, ok: false, error: `game tidak masuk layar bermain (layar: ${state ? state.screen : 'tidak ada state'})` };
    }
  }

  if (name === 'chase') {
    // Uang staging 14.700 (seolah misi 5 selesai), wanted 3, misi kejar.
    callDebug('setMoney', 14700);
    callDebug('setMission', 3);
    callDebug('setWanted', 3);
    callDebug('spawnMissionCar', 100, 0, 'orange');
    callDebug('teleport', 96, 0);
    callDebug('spawnPoliceNear');
    await sleep(400);
    state = readState();
    const player = statePlayer(state);
    if (!player) {
      return { shot: name, ok: false, error: 'posisi pemain tidak terbaca setelah staging' };
    }
    const cam = chaseCamera(player);
    const camera = setCamera6(cam.eye.x, cam.eye.y, cam.eye.z, cam.target.x, cam.target.y, cam.target.z);
    const police = listPositions(stateList(state, ['police', 'policeUnits', 'units']));
    const policeInFrame = countInFrame(cam.eye, cam.target, police, 40, 220);
    return {
      shot: name,
      ok: camera.ok !== false && police.length >= 3,
      player,
      policeCount: police.length,
      policeInFrame,
      wanted: state.wanted,
      money: state.money,
      camera,
      note: 'masuk mobil oranye (tombol E) lalu mengemudi sampai sekitar 100 km/jam, verifikasi ulang sebelum foto',
    };
  }

  if (name === 'drive') {
    callDebug('setMission', 1);
    callDebug('setWanted', 1);
    callDebug('teleport', 0, 40);
    await sleep(400);
    state = readState();
    const player = statePlayer(state);
    if (!player) {
      return { shot: name, ok: false, error: 'posisi pemain tidak terbaca setelah staging' };
    }
    const cam = driveCamera(player);
    const camera = setCamera6(cam.eye.x, cam.eye.y, cam.eye.z, cam.target.x, cam.target.y, cam.target.z);
    const traffic = listPositions(stateList(state, ['traffic', 'trafficCars', 'cars']));
    const pedestrians = listPositions(stateList(state, ['pedestrians', 'peds']));
    const marker = activeMarker(state);
    return {
      shot: name,
      ok: camera.ok !== false && traffic.length >= 6 && pedestrians.length >= 8,
      player,
      trafficCount: traffic.length,
      trafficInFrame: countInFrame(cam.eye, cam.target, traffic, 40, 220),
      pedestrianCount: pedestrians.length,
      pedestrianInFrame: countInFrame(cam.eye, cam.target, pedestrians, 40, 220),
      marker,
      markerInFrame: marker ? inFrame(cam.eye, cam.target, marker, 40, 220) : false,
      camera,
      note: 'mengemudi sampai sekitar 60 km/jam, verifikasi ulang sebelum foto',
    };
  }

  // street: antar paket pertama dengan teleport ke titik antar, lalu kamera setinggi jalan.
  callDebug('setMission', 1);
  callDebug('teleport', 100, -300);
  await sleep(500);
  state = readState();
  const player = statePlayer(state);
  if (!player) {
    return { shot: name, ok: false, error: 'posisi pemain tidak terbaca setelah staging' };
  }
  callDebug('setHeading', player.heading);
  const cam = streetCamera(player);
  const camera = setCamera6(cam.eye.x, cam.eye.y, cam.eye.z, cam.target.x, cam.target.y, cam.target.z);
  const toast = state.toast || state.toastText || '';
  const traffic = listPositions(stateList(state, ['traffic', 'trafficCars', 'cars']));
  const pedestrians = listPositions(stateList(state, ['pedestrians', 'peds']));
  return {
    shot: name,
    ok: camera.ok !== false && String(toast).includes('Paket 1 dari 3'),
    player,
    toast,
    trafficInFrame: countInFrame(cam.eye, cam.target, traffic, 40, 220),
    pedestrianInFrame: countInFrame(cam.eye, cam.target, pedestrians, 40, 220),
    wanted: state.wanted,
    camera,
    note: 'banner "Paket 1 dari 3 terantar" harus terlihat; foto segera sebelum toast hilang',
  };
}

// Verifikasi ulang dari posisi HIDUP sesaat sebelum foto diambil.
// Mengarahkan ulang kamera (enam angka) mengikuti pemain, lalu memeriksa subjek.
export function verifyShot(name) {
  if (!SHOT_NAMES.includes(name)) {
    return { shot: name, ok: false, error: `nama adegan tidak dikenal: ${name}` };
  }
  const state = readState();
  if (!state) {
    return { shot: name, ok: false, error: 'state game tidak terbaca' };
  }

  if (name === 'start') {
    const screen = state.screen;
    const startVisible = screen === 'start' || screen === 'menu' || screen === 'title';
    const buttonPresent = typeof document !== 'undefined' && !!document.getElementById('btn-new-game');
    return { shot: name, ok: startVisible || buttonPresent, screen, buttonPresent };
  }

  const player = statePlayer(state);
  if (!player) {
    return { shot: name, ok: false, error: 'posisi pemain tidak terbaca' };
  }
  const police = listPositions(stateList(state, ['police', 'policeUnits', 'units']));
  const traffic = listPositions(stateList(state, ['traffic', 'trafficCars', 'cars']));
  const pedestrians = listPositions(stateList(state, ['pedestrians', 'peds']));
  const marker = activeMarker(state);
  const toast = state.toast || state.toastText || '';

  if (name === 'chase') {
    const cam = chaseCamera(player);
    const camera = setCamera6(cam.eye.x, cam.eye.y, cam.eye.z, cam.target.x, cam.target.y, cam.target.z);
    const policeInFrame = countInFrame(cam.eye, cam.target, police, 40, 220);
    const playerInFrame = inFrame(cam.eye, cam.target, player, 40, 220);
    const checks = {
      playerInFrame,
      playerInCar: player.inCar,
      policeInFrame,
      wanted: state.wanted,
      speedKmh: player.speedKmh,
      money: state.money,
    };
    return {
      shot: name,
      ok: camera.ok !== false && playerInFrame && player.inCar && policeInFrame >= 3 && (state.wanted || 0) >= 3,
      checks,
      camera,
    };
  }

  if (name === 'drive') {
    const cam = driveCamera(player);
    const camera = setCamera6(cam.eye.x, cam.eye.y, cam.eye.z, cam.target.x, cam.target.y, cam.target.z);
    const checks = {
      trafficInFrame: countInFrame(cam.eye, cam.target, traffic, 40, 220),
      pedestrianInFrame: countInFrame(cam.eye, cam.target, pedestrians, 40, 220),
      policeInFrame: countInFrame(cam.eye, cam.target, police, 40, 220),
      markerInFrame: marker ? inFrame(cam.eye, cam.target, marker, 40, 220) : false,
      speedKmh: player.speedKmh,
    };
    return {
      shot: name,
      ok: camera.ok !== false && checks.trafficInFrame >= 6 && checks.pedestrianInFrame >= 8 && checks.policeInFrame >= 1 && checks.markerInFrame,
      checks,
      camera,
    };
  }

  // street
  const cam = streetCamera(player);
  const camera = setCamera6(cam.eye.x, cam.eye.y, cam.eye.z, cam.target.x, cam.target.y, cam.target.z);
  const checks = {
    playerDistance: Math.sqrt((cam.eye.x - player.x) ** 2 + (cam.eye.z - player.z) ** 2),
    toast,
    bannerShown: String(toast).includes('Paket 1 dari 3'),
    trafficInFrame: countInFrame(cam.eye, cam.target, traffic, 40, 220),
    pedestrianInFrame: countInFrame(cam.eye, cam.target, pedestrians, 40, 220),
    wanted: state.wanted,
  };
  return {
    shot: name,
    ok: camera.ok !== false && checks.bannerShown && checks.trafficInFrame >= 1 && (state.wanted || 0) >= 1,
    checks,
    camera,
  };
}

if (typeof window !== 'undefined') {
  window.KOTA_SHOTS = { setupShot, verifyShot, SHOT_NAMES };
}
