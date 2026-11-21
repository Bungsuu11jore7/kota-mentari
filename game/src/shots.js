// KOTA MENTARI — penata 4 foto (staging screenshot 1280x720).
// Dipakai skrip retake SETELAH playtest; tidak dipakai saat bermain biasa.
// Staging memakai antarmuka debug (KOTA_DEBUG) + helper kamera ENAM ANGKA
// saja. Setiap penata foto WAJIB memverifikasi dulu sebelum menangkap:
// kota ter-render (sceneChildren ~960+), mobil pemain + polisi dalam
// pandangan kamera, traffic terlihat.
//
// PERBAIKAN v10 flag no.5 (ditulis sejak awal): tryCall aman bila
// uang/misi undefined — tidak pernah crash bila state belum siap; guard
// dengan nilai default yang aman.
// PERBAIKAN v10 flag no.6: setelah setWanted(3), teleport 25 m ke belakang
// (berlawanan haluan) supaya polisi jadi formasi intersep di depan, bukan
// menempel bumper; kuras antrean toast dulu sebelum memicu banner paket.

import {
  MISSION_CUMULATIVE,
  MISSION_TARGETS,
  SHIP,
  TRAFFIC,
} from "./config.js";

// ---------------------------------------------------------------------------
// tryCall: pemanggil aman. Bila fn bukan fungsi, undefined, atau throw,
// kembalikan fallback — JANGAN PERNAH crash (uang/misi boleh undefined).
// ---------------------------------------------------------------------------
export function tryCall(fn, fallback) {
  if (typeof fn !== "function") return fallback;
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch (err) {
    return fallback;
  }
}

// Coba beberapa nama method debug (nama persis boleh berbeda antar lane);
// kembalikan hasil pertama yang terdefinisi, atau undefined.
function callNamed(obj, names, ...args) {
  if (!obj) return undefined;
  for (const name of names) {
    const fn = obj[name];
    if (typeof fn !== "function") continue;
    try {
      const v = fn.apply(obj, args);
      if (v !== undefined && v !== null) return v;
      return v;
    } catch (err) {
      // Coba nama berikutnya.
    }
  }
  return undefined;
}

// Baca state lengkap dari debug, dengan default aman bila belum siap.
export function safeState(debug) {
  const raw = tryCall(
    () => callNamed(debug, ["getState", "getGameState", "state"]),
    null
  );
  const s = raw && typeof raw === "object" ? raw : {};
  if (!raw && debug && typeof debug.state === "object" && debug.state) {
    Object.assign(s, debug.state);
  }
  // Uang: field `uang` utama, `money` alias. Default aman 0.
  const uang = s.uang !== undefined && s.uang !== null
    ? s.uang
    : (s.money !== undefined && s.money !== null ? s.money : 0);
  // Misi: objek { current } atau angka. Default aman misi 0.
  let missionCurrent = 0;
  if (s.mission && typeof s.mission === "object" && s.mission.current !== undefined) {
    missionCurrent = s.mission.current;
  } else if (typeof s.mission === "number") {
    missionCurrent = s.mission;
  } else if (typeof s.currentMission === "number") {
    missionCurrent = s.currentMission;
  }
  return {
    raw: s,
    uang,
    money: uang,
    missionCurrent,
    wanted: s.wanted !== undefined && s.wanted !== null ? s.wanted : 0,
    player: s.player || s.playerPos || null,
    playerX: s.player && s.player.x !== undefined ? s.player.x : (s.playerX !== undefined ? s.playerX : 0),
    playerZ: s.player && s.player.z !== undefined ? s.player.z : (s.playerZ !== undefined ? s.playerZ : 0),
    heading: s.heading !== undefined ? s.heading : (s.player && s.player.heading !== undefined ? s.player.heading : 0),
    speedKmh: s.speedKmh !== undefined ? s.speedKmh : (s.speed !== undefined ? s.speed * 3.6 : 0),
    sceneChildren: s.sceneChildren !== undefined ? s.sceneChildren : (s.children !== undefined ? s.children : undefined),
    trafficCars: s.trafficCars !== undefined ? s.trafficCars : (s.traffic && s.traffic.cars ? s.traffic.cars.length : undefined),
    trafficPeds: s.trafficPeds !== undefined ? s.trafficPeds : (s.traffic && s.traffic.pedestrians ? s.traffic.pedestrians.length : undefined),
    police: s.police || (s.policeState && s.policeState.units) || [],
    screen: s.screen || s.currentScreen || undefined,
  };
}

// ---------------------------------------------------------------------------
// Verifikasi dunia sebelum menangkap gambar.
// Throw bila kota TIDAK ter-render (sceneChildren angka tapi < 900).
// Bila angka tidak tersedia di state, catat 'unknown' dan lanjut.
// ---------------------------------------------------------------------------
export function verifyWorld(debug) {
  const st = safeState(debug);
  const checks = {
    sceneChildren: st.sceneChildren,
    trafficCars: st.trafficCars,
    trafficPeds: st.trafficPeds,
    cityRendered: "unknown",
    trafficVisible: "unknown",
  };
  if (typeof st.sceneChildren === "number") {
    checks.cityRendered = st.sceneChildren >= 900;
    if (!checks.cityRendered) {
      throw new Error(`kota belum ter-render: sceneChildren=${st.sceneChildren} (butuh ~960+)`);
    }
  }
  if (typeof st.trafficCars === "number") {
    checks.trafficVisible = st.trafficCars >= 1;
    if (st.trafficCars < 1) throw new Error("traffic tidak terlihat: 0 mobil");
  }
  return checks;
}

// Apakah titik (x, y, z) berada dalam pandangan kamera (eye -> target)?
function pointInView(eye, target, px, py, pz, halfFovDeg) {
  const dx = target[0] - eye[0];
  const dy = target[1] - eye[1];
  const dz = target[2] - eye[2];
  const dLen = Math.hypot(dx, dy, dz) || 1;
  const vx = px - eye[0];
  const vy = py - eye[1];
  const vz = pz - eye[2];
  const vLen = Math.hypot(vx, vy, vz) || 1;
  const dot = (dx * vx + dy * vy + dz * vz) / (dLen * vLen);
  const cosHalf = Math.cos(((halfFovDeg || 35) * Math.PI) / 180);
  return dot > cosHalf;
}

// Arah maju dari heading: x dari sinus, z dari kosinus.
function forwardOf(heading) {
  return [Math.sin(heading), Math.cos(heading)];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setMoney(debug, value) {
  callNamed(debug, ["setMoney", "setUang"], value);
}

function setMission(debug, index) {
  callNamed(debug, ["setMission", "setCurrentMission"], index);
}

function setWanted(debug, level) {
  callNamed(debug, ["setWanted", "setWantedLevel"], level);
}

function teleport(debug, x, z, heading) {
  if (heading !== undefined) {
    const v = callNamed(debug, ["teleport", "teleportPlayer", "setPlayerPosition"], x, z, heading);
    if (v !== undefined) return v;
  }
  return callNamed(debug, ["teleport", "teleportPlayer", "setPlayerPosition"], x, z);
}

function showToast(debug, text) {
  callNamed(debug, ["showToast", "toast", "showBanner"], text);
}

function startGame(debug) {
  callNamed(debug, ["startGame", "start", "play"]);
}

function spawnMissionCar(debug, x, z, color) {
  const v = callNamed(debug, ["spawnMissionCar", "spawnCar"], x, z, color);
  if (v === undefined) {
    // Coba lagi dengan warna sebagai angka hex.
    callNamed(debug, ["spawnMissionCar", "spawnCar"], x, z, 0xff7a1a);
  }
}

// ---------------------------------------------------------------------------
// Foto 1 — chase: mobil oranye + 3 polisi formasi baji + wanted 3 +
// toast misi + kecepatan ~100 km/jam + minimap + objective + uang 14700.
// ---------------------------------------------------------------------------
export async function stageShot1(env) {
  const debug = env.debug;
  const setCamera = env.setCamera;
  startGame(debug);
  await sleep(600);
  setMission(debug, 4);
  setMoney(debug, MISSION_CUMULATIVE[4]);
  teleport(debug, MISSION_TARGETS.ORANGE_CAR.x, MISSION_TARGETS.ORANGE_CAR.z);
  await sleep(300);
  spawnMissionCar(debug, MISSION_TARGETS.ORANGE_CAR.x, MISSION_TARGETS.ORANGE_CAR.z, "orange");
  await sleep(300);
  await tryCall(() => env.pressKey("KeyE", 150), undefined);
  await sleep(400);
  setWanted(debug, 3);
  await sleep(800);
  // Trik staging: teleport 25 m ke belakang (berlawanan haluan) supaya
  // polisi jadi formasi intersep di depan, bukan menempel bumper.
  const st0 = safeState(debug);
  const fwd = forwardOf(st0.heading || 0);
  const backX = st0.playerX - fwd[0] * 25;
  const backZ = st0.playerZ - fwd[1] * 25;
  teleport(debug, backX, backZ);
  await sleep(300);
  // Gas sampai ~100 km/jam.
  await tryCall(() => env.pressKey("KeyW", 2400), undefined);
  await sleep(300);
  showToast(debug, "Misi: Brankas Pelabuhan — ambil brankas di Pelabuhan");
  const checks = verifyWorld(debug);
  const st = safeState(debug);
  const f = forwardOf(st.heading || 0);
  const px = st.playerX;
  const pz = st.playerZ;
  // Kamera dari depan-samping: mata di depan pemain, tatap ke belakang
  // melewati mobil pemain — polisi formasi baji di belakang ikut terbingkai.
  const eye = [px + f[0] * 22 + f[1] * 9, 7, pz + f[1] * 22 - f[0] * 9];
  const target = [px - f[0] * 10, 1.5, pz - f[1] * 10];
  const camera = [eye[0], eye[1], eye[2], target[0], target[1], target[2]];
  // Verifikasi: mobil pemain + polisi dalam pandangan kamera.
  const policeList = Array.isArray(st.police) ? st.police : [];
  const policeInView = policeList.filter((u) => {
    const ux = u.x !== undefined ? u.x : (u.pos ? u.pos.x : px);
    const uz = u.z !== undefined ? u.z : (u.pos ? u.pos.z : pz);
    return pointInView(eye, target, ux, 1.5, uz, 35);
  }).length;
  checks.playerInView = pointInView(eye, target, px, 1.5, pz, 35);
  checks.policeUnits = policeList.length;
  checks.policeInView = policeInView;
  checks.uang = st.uang;
  checks.wanted = st.wanted;
  checks.speedKmh = Math.round(st.speedKmh);
  setCamera(camera[0], camera[1], camera[2], camera[3], camera[4], camera[5]);
  await sleep(300);
  return { shot: 1, camera, checks };
}

// ---------------------------------------------------------------------------
// Foto 2 — drive: avenue Pusat kota RAMAI: 6+ mobil traffic, 8+ pejalan
// kaki di kedua trotoar, 1 mobil polisi di kejauhan, penanda misi di depan,
// ~60 km/jam.
// ---------------------------------------------------------------------------
export async function stageShot2(env) {
  const debug = env.debug;
  const setCamera = env.setCamera;
  startGame(debug);
  await sleep(600);
  setMission(debug, 0);
  setMoney(debug, MISSION_CUMULATIVE[0]);
  // Avenue Pusat kota: persimpangan tersibuk di tengah peta.
  teleport(debug, 0, 100);
  await sleep(300);
  spawnMissionCar(debug, 0, 100, "orange");
  await sleep(300);
  await tryCall(() => env.pressKey("KeyE", 150), undefined);
  await sleep(400);
  // Berkendara ke utara menuju penanda Menara (~60 km/jam).
  await tryCall(() => env.pressKey("KeyW", 1400), undefined);
  await sleep(300);
  showToast(debug, "Ikuti penanda kuning ke Menara");
  const checks = verifyWorld(debug);
  const st = safeState(debug);
  const f = forwardOf(st.heading || 0);
  const px = st.playerX;
  const pz = st.playerZ;
  // Kamera kejar di belakang mobil: avenue + traffic + pejalan kaki masuk frame.
  const eye = [px - f[0] * 11, 4.5, pz - f[1] * 11];
  const target = [px + f[0] * 18, 1.5, pz + f[1] * 18];
  const camera = [eye[0], eye[1], eye[2], target[0], target[1], target[2]];
  checks.playerInView = pointInView(eye, target, px, 1.5, pz, 35);
  checks.trafficCars = typeof st.trafficCars === "number" ? st.trafficCars : "unknown";
  checks.trafficPeds = typeof st.trafficPeds === "number" ? st.trafficPeds : "unknown";
  checks.speedKmh = Math.round(st.speedKmh);
  checks.marker = MISSION_TARGETS.PACKAGE_DROP;
  setCamera(camera[0], camera[1], camera[2], camera[3], camera[4], camera[5]);
  await sleep(300);
  return { shot: 2, camera, checks };
}

// ---------------------------------------------------------------------------
// Foto 3 — street: kamera RENDAH setinggi jalan di belakang pemain,
// pemain kemeja oranye BESAR di tengah frame menghadap timur,
// banner "Paket 1 dari 3 terantar", wanted 1.
// ---------------------------------------------------------------------------
export async function stageShot3(env) {
  const debug = env.debug;
  const setCamera = env.setCamera;
  startGame(debug);
  await sleep(600);
  setMission(debug, 0);
  setMoney(debug, MISSION_CUMULATIVE[0]);
  setWanted(debug, 1);
  // Jalan kaki di jalan kota, menghadap timur (heading = PI/2: x dari sinus).
  const east = Math.PI / 2;
  callNamed(debug, ["setHeading", "setPlayerHeading"], east);
  teleport(debug, 0, 50, east);
  await sleep(400);
  // Kuras antrean toast dulu sebelum memicu banner paket.
  await sleep(2600);
  showToast(debug, "Paket 1 dari 3 terantar");
  const checks = verifyWorld(debug);
  const st = safeState(debug);
  const heading = east;
  const f = forwardOf(heading);
  const px = st.playerX;
  const pz = st.playerZ;
  // Kamera rendah setinggi jalan, tepat di belakang pemain.
  const eye = [px - f[0] * 3.5, 1.7, pz - f[1] * 3.5];
  const target = [px + f[0] * 8, 1.3, pz + f[1] * 8];
  const camera = [eye[0], eye[1], eye[2], target[0], target[1], target[2]];
  checks.playerInView = pointInView(eye, target, px, 1.3, pz, 35);
  checks.banner = "Paket 1 dari 3 terantar";
  checks.wanted = st.wanted;
  setCamera(camera[0], camera[1], camera[2], camera[3], camera[4], camera[5]);
  await sleep(300);
  return { shot: 3, camera, checks };
}

// ---------------------------------------------------------------------------
// Foto 4 — start: layar mulai + kota dari udara (senja).
// ---------------------------------------------------------------------------
export async function stageShot4(env) {
  const debug = env.debug;
  const setCamera = env.setCamera;
  // Kembali ke layar mulai.
  const shown = callNamed(debug, ["showScreen", "setScreen"], "start");
  if (shown === undefined) {
    callNamed(debug, ["toMenu", "showStart", "goToStart"]);
  }
  await sleep(500);
  const checks = verifyWorld(debug);
  // Kamera udara: kota senja dari atas, menghadap pusat kota.
  const camera = [0, 240, 300, 0, 0, 0];
  setCamera(camera[0], camera[1], camera[2], camera[3], camera[4], camera[5]);
  await sleep(400);
  checks.screen = safeState(debug).screen;
  return { shot: 4, camera, checks };
}

// Dispatcher: stageShot(n, env). n = 1..4.
export async function stageShot(n, env) {
  if (n === 1) return stageShot1(env);
  if (n === 2) return stageShot2(env);
  if (n === 3) return stageShot3(env);
  if (n === 4) return stageShot4(env);
  throw new Error(`stageShot: nomor foto tidak dikenal: ${n}`);
}

// Kapal misi 6 (dipakai staging / verifikasi akhir).
export const SHIP_TARGET = SHIP;
export const TRAFFIC_TARGET = TRAFFIC;
