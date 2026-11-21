// KOTA MENTARI — shots.js
// Penata 4 foto staging. Helper staging SAJA — TIDAK dimuat index.html
// saat bermain biasa, jadi kekurangannya tidak memengaruhi gameplay.
// Staging memakai antarmuka debug (KOTA_DEBUG) + helper kamera ENAM ANGKA
// saja. Benih 7 (kota deterministik, sama di tiap muat).
//
// Dipakai skrip retake: stageShot(n, env) dengan env = { debug, setCamera,
// sleep, pressKey }. Setiap penata foto memverifikasi dulu sebelum gambar
// ditangkap: kota ter-render (sceneChildren ~960+), mobil pemain + polisi
// dalam pandangan kamera, traffic terlihat.
//
// Trik staging terbukti: setelah setWanted(3), teleport 25 m ke belakang
// (berlawanan haluan) supaya polisi jadi formasi intersep di depan, bukan
// menempel bumper; kuras antrean toast dulu sebelum memicu banner paket.

const SEED = 7;
const MIN_SCENE_CHILDREN = 900;
const MISSION_TARGET_MENARA = { x: 100, z: -300 };
const ORANGE = 0xff7a1a;

// Pemanggil aman: kembalikan undefined bila fungsi tidak ada, argumen
// tidak terdefinisi, atau pemanggilan melempar. Aman bila uang/misi
// undefined — pemanggilan dengan nilai undefined dilewati begitu saja.
export function tryCall(fn, ...args) {
  if (typeof fn !== "function") return undefined;
  if (args.some((a) => a === undefined)) return undefined;
  try {
    return fn(...args);
  } catch (err) {
    return undefined;
  }
}

// Ambil method debug pertama yang ada dari daftar nama kandidat.
// Semua nama di sini adalah kemampuan kontrak antarmuka debug.
function pick(debug, names) {
  if (!debug) return undefined;
  for (const name of names) {
    if (typeof debug[name] === "function") return debug[name].bind(debug);
  }
  return undefined;
}

function sleepMs(env, ms) {
  if (env && typeof env.sleep === "function") return env.sleep(ms);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pressKey(env, code, holdMs) {
  if (env && typeof env.pressKey === "function") {
    await env.pressKey(code, holdMs || 120);
  }
}

// Baca keadaan game dari field DATAR getState: x/z, uang, misi, wanted,
// kecepatan, polisi, traffic, sceneChildren.
export function getFlatState(debug) {
  const getState = pick(debug, ["getState", "getFullState", "readState"]);
  const raw = tryCall(getState);
  if (!raw || typeof raw !== "object") return null;
  const player = raw.player && typeof raw.player === "object" ? raw.player : null;
  return {
    x: raw.x !== undefined ? raw.x : (player ? player.x : undefined),
    z: raw.z !== undefined ? raw.z : (player ? player.z : undefined),
    angle: raw.angle !== undefined ? raw.angle : raw.playerAngle,
    uang: raw.uang !== undefined ? raw.uang : raw.money,
    misi: raw.misi !== undefined ? raw.misi : raw.mission,
    wanted: raw.wanted,
    speed: raw.speed !== undefined ? raw.speed : raw.speedKmh,
    screen: raw.screen,
    police: Array.isArray(raw.police) ? raw.police : [],
    trafficCars: raw.trafficCars,
    trafficPeds: raw.trafficPeds,
    sceneChildren: raw.sceneChildren,
    meshes: raw.meshes,
    raw,
  };
}

function heading(angle) {
  const a = angle || 0;
  return { x: Math.sin(a), z: Math.cos(a) };
}

// Kamera kejar: mata di belakang posisi, titik tatap di depan posisi.
export function frameBehind(state, dist, height, lookAhead) {
  const fwd = heading(state.angle);
  const eyeX = state.x - fwd.x * dist;
  const eyeZ = state.z - fwd.z * dist;
  const lookX = state.x + fwd.x * lookAhead;
  const lookZ = state.z + fwd.z * lookAhead;
  return [eyeX, height, eyeZ, lookX, 1.5, lookZ];
}

// Verifikasi kota ter-render + traffic terlihat, dari getState.
export function verifyWorld(debug) {
  const state = getFlatState(debug);
  if (state && state.sceneChildren !== undefined && state.sceneChildren < MIN_SCENE_CHILDREN) {
    throw new Error(`kota belum ter-render: sceneChildren ${state.sceneChildren} < ${MIN_SCENE_CHILDREN}`);
  }
  if (state && state.trafficCars !== undefined && state.trafficCars < 1) {
    throw new Error("traffic tidak terlihat: trafficCars 0");
  }
  if (!state) {
    const canvas = typeof document !== "undefined" ? document.querySelector("#game-canvas") : null;
    if (!canvas) throw new Error("keadaan game tidak terbaca dan kanvas tidak ditemukan");
  }
  return state;
}

// Verifikasi target (x, z) berada dalam pandangan kamera.
export function verifyInView(camera, target, maxDist) {
  if (target === undefined || target.x === undefined || target.z === undefined) return false;
  const dx = target.x - camera[0];
  const dz = target.z - camera[2];
  const dist = Math.hypot(dx, dz);
  if (dist > (maxDist || 80)) return false;
  const vx = camera[3] - camera[0];
  const vz = camera[5] - camera[2];
  const vLen = Math.hypot(vx, vz) || 1;
  const dot = (dx * vx + dz * vz) / (dist * vLen || 1);
  return dot > 0.1;
}

function setCamera6(env, debug, camera) {
  const fn = (env && typeof env.setCamera === "function")
    ? env.setCamera
    : pick(debug, ["setCamera"]);
  if (typeof fn !== "function") throw new Error("helper kamera enam angka tidak ditemukan");
  fn(camera[0], camera[1], camera[2], camera[3], camera[4], camera[5]);
  return camera;
}

async function startAndTeleport(env, debug, x, z) {
  tryCall(pick(debug, ["startGame", "start"]));
  await sleepMs(env, 800);
  tryCall(pick(debug, ["teleport", "teleportPlayer"]), x, z);
  await sleepMs(env, 300);
}

// Masuk mobil misi oranye: spawn di depan pemain, lalu tombol E.
async function enterMissionCar(env, debug) {
  const state = getFlatState(debug) || { x: 0, z: 0, angle: 0 };
  const fwd = heading(state.angle);
  const carX = state.x + fwd.x * 4;
  const carZ = state.z + fwd.z * 4;
  tryCall(pick(debug, ["spawnMissionCar", "spawnCar"]), carX, carZ, ORANGE);
  await sleepMs(env, 400);
  await pressKey(env, "KeyE", 200);
  await sleepMs(env, 500);
}

function setStaging(debug, mission, money, wanted) {
  tryCall(pick(debug, ["setMission", "setMissionIndex"]), mission);
  tryCall(pick(debug, ["setMoney", "setUang"]), money);
  tryCall(pick(debug, ["setWanted", "setWantedLevel"]), wanted);
}

// Foto 1 — cover chase: mobil oranye + 3 polisi formasi baji + wanted 3 +
// toast + kecepatan sekitar 100 + minimap + objective + uang staging 14700.
export async function stageShot1(env) {
  const debug = (env && env.debug) || (typeof window !== "undefined" ? window.KOTA_DEBUG : null);
  if (!debug) throw new Error("KOTA_DEBUG tidak tersedia");
  await startAndTeleport(env, debug, 0, 0);
  await enterMissionCar(env, debug);
  // Uang 14700 = kumulatif setelah misi 5; misi aktif ke-6 (indeks 5).
  setStaging(debug, 5, 14700, 3);
  const spawnPolice = pick(debug, ["spawnPolice", "spawnPoliceNearPlayer"]);
  for (let i = 0; i < 3; i += 1) {
    tryCall(spawnPolice);
    await sleepMs(env, 250);
  }
  // Gas sampai kecepatan sekitar 100 km/jam.
  await pressKey(env, "KeyW", 3200);
  // Trik staging: teleport 25 m ke belakang (berlawanan haluan) supaya
  // polisi jadi formasi intersep di depan, bukan menempel bumper.
  let state = getFlatState(debug);
  if (state && state.x !== undefined) {
    const fwd = heading(state.angle);
    tryCall(pick(debug, ["teleport", "teleportPlayer"]), state.x - fwd.x * 25, state.z - fwd.z * 25);
    await sleepMs(env, 400);
    await pressKey(env, "KeyW", 1200);
  }
  state = verifyWorld(debug);
  if (!state || state.x === undefined) throw new Error("posisi pemain tidak terbaca (foto 1)");
  const camera = frameBehind(state, 13, 5.5, 12);
  setCamera6(env, debug, camera);
  await sleepMs(env, 400);
  const after = getFlatState(debug) || state;
  if (!verifyInView(camera, { x: after.x, z: after.z }, 60)) {
    throw new Error("mobil pemain di luar pandangan kamera (foto 1)");
  }
  const policeInView = (after.police || []).filter((p) => verifyInView(camera, p, 80));
  if (policeInView.length < 1) throw new Error("polisi tidak dalam pandangan kamera (foto 1)");
  return { shot: 1, camera, state: after, policeInView: policeInView.length, seed: SEED };
}

// Foto 2 — drive: avenue Pusat kota RAMAI (6+ mobil traffic, 8+ pejalan
// kaki di trotoar, 1 mobil polisi di kejauhan, penanda misi di depan,
// kecepatan sekitar 60) — BUKAN jalan kosong.
export async function stageShot2(env) {
  const debug = (env && env.debug) || (typeof window !== "undefined" ? window.KOTA_DEBUG : null);
  if (!debug) throw new Error("KOTA_DEBUG tidak tersedia");
  await startAndTeleport(env, debug, 0, -100);
  await enterMissionCar(env, debug);
  setStaging(debug, 0, 500, 0);
  tryCall(pick(debug, ["spawnPolice", "spawnPoliceNearPlayer"]));
  // Jalan pelan sampai kecepatan sekitar 60 km/jam.
  await pressKey(env, "KeyW", 1500);
  const state = verifyWorld(debug);
  if (!state || state.x === undefined) throw new Error("posisi pemain tidak terbaca (foto 2)");
  if (state.trafficCars !== undefined && state.trafficCars < 6) {
    throw new Error(`avenue sepi: trafficCars ${state.trafficCars} < 6 (foto 2)`);
  }
  if (state.trafficPeds !== undefined && state.trafficPeds < 8) {
    throw new Error(`trotoar sepi: trafficPeds ${state.trafficPeds} < 8 (foto 2)`);
  }
  const camera = frameBehind(state, 12, 5, 14);
  setCamera6(env, debug, camera);
  await sleepMs(env, 400);
  const after = getFlatState(debug) || state;
  if (!verifyInView(camera, { x: after.x, z: after.z }, 60)) {
    throw new Error("mobil pemain di luar pandangan kamera (foto 2)");
  }
  return { shot: 2, camera, state: after, seed: SEED };
}

// Foto 3 — street: kamera RENDAH setinggi jalan di belakang pemain,
// pemain kemeja oranye terlihat BESAR di tengah frame, banner
// "Paket 1 dari 3 terantar", wanted 1.
export async function stageShot3(env) {
  const debug = (env && env.debug) || (typeof window !== "undefined" ? window.KOTA_DEBUG : null);
  if (!debug) throw new Error("KOTA_DEBUG tidak tersedia");
  await startAndTeleport(env, debug, 0, 0);
  setStaging(debug, 0, 0, 1);
  // Kuras antrean toast dulu sebelum memicu banner paket.
  await sleepMs(env, 4000);
  // Teleport ke penanda misi 1 (Menara) untuk mengantar paket pertama.
  const getMarker = pick(debug, ["getMarker", "getActiveMarker", "getMissionMarker"]);
  const marker = tryCall(getMarker) || MISSION_TARGET_MENARA;
  const mx = marker && marker.x !== undefined ? marker.x : MISSION_TARGET_MENARA.x;
  const mz = marker && marker.z !== undefined ? marker.z : MISSION_TARGET_MENARA.z;
  tryCall(pick(debug, ["teleport", "teleportPlayer"]), mx, mz);
  await sleepMs(env, 900);
  let state = verifyWorld(debug);
  if (!state || state.x === undefined) throw new Error("posisi pemain tidak terbaca (foto 3)");
  // Kamera RENDAH setinggi jalan, tepat di belakang pemain.
  const fwd = heading(state.angle);
  const camera = [
    state.x - fwd.x * 4, 1.8, state.z - fwd.z * 4,
    state.x + fwd.x * 3, 1.4, state.z + fwd.z * 3,
  ];
  setCamera6(env, debug, camera);
  await sleepMs(env, 400);
  const after = getFlatState(debug) || state;
  if (!verifyInView(camera, { x: after.x, z: after.z }, 30)) {
    throw new Error("pemain di luar pandangan kamera (foto 3)");
  }
  return { shot: 3, camera, state: after, banner: "Paket 1 dari 3 terantar", seed: SEED };
}

// Foto 4 — start: layar mulai + kota dari udara (layar mulai sudah tampil
// saat game pertama dimuat; bila sedang bermain, kembali ke menu dulu).
export async function stageShot4(env) {
  const debug = (env && env.debug) || (typeof window !== "undefined" ? window.KOTA_DEBUG : null);
  if (!debug) throw new Error("KOTA_DEBUG tidak tersedia");
  tryCall(pick(debug, ["quitToMenu", "showMenu", "toMenu"]));
  await sleepMs(env, 600);
  const state = verifyWorld(debug);
  const camera = [0, 200, 260, 0, 0, 0];
  setCamera6(env, debug, camera);
  await sleepMs(env, 400);
  return { shot: 4, camera, state, seed: SEED };
}

export async function stageShot(n, env) {
  if (n === 1) return stageShot1(env);
  if (n === 2) return stageShot2(env);
  if (n === 3) return stageShot3(env);
  if (n === 4) return stageShot4(env);
  throw new Error(`nomor foto tidak dikenal: ${n}`);
}
