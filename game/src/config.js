// KOTA MENTARI — konstanta game (nilai saja, tanpa logika).
// Kota pesisir tropis fiktif: Pelabuhan, Pasar Lama, Menara, Pesisir, Bukit.
// Protagonis Raka Pratama, fixer Mira Santosa, antagonis Bos Darma + Geng Ombak.
// Semua angka di sini dipakai bersama oleh modul dunia, traffic, misi, polisi,
// HUD, audio, dan penata foto. Benih acak tetap 7 supaya kota deterministik.

// Benih acak dunia (tetap — kota sama di setiap muat).
export const SEED = 7;

// Kunci simpan di localStorage.
export const SAVE_KEY = "kota-mentari-save";

// Ukuran peta (meter). Pusat kota di (0, 0).
export const MAP = {
  SIZE: 1000,
  HALF_SIZE: 500,
  MIN_X: -500,
  MAX_X: 500,
  MIN_Z: -500,
  MAX_Z: 500,
};

// Kisi jalan: 9 x 9 simpul = 81 simpul, 144 sisi. Jalan tiap 100 meter.
export const ROAD_GRID = {
  COUNT: 9,
  SPACING: 100,
  MIN: -400,
  MAX: 400,
  NODES: 81,
  EDGES: 144,
  ROAD_WIDTH: 12,
  SIDEWALK_WIDTH: 4,
};

// Distrik beserta persegi panjangnya (xMin, zMin, xMax, zMax).
export const DISTRICTS = [
  { name: "Menara", xMin: -150, zMin: -500, xMax: 250, zMax: -150 },
  { name: "Bukit", xMin: -500, zMin: -500, xMax: -150, zMax: -150 },
  { name: "Pasar Lama", xMin: -500, zMin: -150, xMax: -100, zMax: 150 },
  { name: "Pesisir", xMin: -100, zMin: 150, xMax: 250, zMax: 500 },
  { name: "Pelabuhan", xMin: 250, zMin: 150, xMax: 500, zMax: 500 },
];

// Jumlah isi kota (target bangun).
export const CITY = {
  BUILDINGS_MIN: 126,
  BUILDINGS_MAX: 147,
  BUILDINGS_TARGET: 143,
  PROPS_MIN: 420,
  PROPS_MAX: 547,
};

// Traffic aktif.
export const TRAFFIC = {
  CARS: 28,
  PEDESTRIANS: 45,
};

// Hadiah misi 1-6 (0-based) dan uang kumulatif setelah tiap misi.
export const MISSION_REWARDS = [500, 1200, 2000, 3000, 8000, 15000];
export const MISSION_CUMULATIVE = [500, 1700, 3700, 6700, 14700, 29700];
export const MISSION_NAMES = [
  "Paket Kilat",
  "Mobil Pinjaman",
  "Kejar Bayangan",
  "Tolong Mira",
  "Brankas Pelabuhan",
  "Jalan Pulang",
];

// Titik-titik misi (x, z).
export const MISSION_TARGETS = {
  // Misi 1: antar 3 paket ke penanda kuning di Menara.
  PACKAGE_DROP: { x: 100, z: -300 },
  PACKAGE_RADIUS: 14,
  // Misi 2: mobil oranye ter-spawn di sini, bawa ke Pesisir.
  ORANGE_CAR: { x: 100, z: 0 },
  MISSION2_DELIVER: { x: 0, z: 400 },
  // Misi 3: target kejar melarikan diri sampai ke Pesisir.
  CHASE_GOAL: { x: 0, z: 400 },
  // Misi 4: selamatkan Mira dari 3 penyerang Geng Ombak.
  MIRA: { x: -200, z: 100 },
  ATTACKERS: 3,
  // Misi 5: ambil brankas di Pelabuhan.
  SAFE: { x: 400, z: 300 },
  // Misi 6: kabur ke kapal.
  SHIP: { x: 470, z: 350, RADIUS: 12 },
};

// Kapal misi 6 (duplikat ringkas dari MISSION_TARGETS.SHIP).
export const SHIP = { X: 470, Z: 350, RADIUS: 12 };

// Kecepatan (meter/detik).
export const SPEED = {
  WALK: 5,
  RUN: 9,
  CAR_MAX: 42,
  CAR_ACCEL: 14,
  CAR_BRAKE: 26,
  CAR_REVERSE: 12,
  CAR_TURN: 2.2,
  CHASE_TARGET: 11,
  ATTACKER: 3.2,
  POLICE_CAR: 38,
};

// Sistem wanted (0-5 bintang).
export const WANTED = {
  MAX: 5,
  DECAY_SECONDS: 20,
  POLICE_AT_MAX: 6,
  ROADBLOCK_AT_MAX: 1,
  STEAL_CAR: 2,
  ATTACK: 1,
  SHOOT_NEAR_POLICE: 1,
};

// Pemain.
export const PLAYER = {
  START_X: 0,
  START_Z: 0,
  HEALTH_MAX: 100,
  MONEY_START: 0,
};

// Kamera.
export const CAMERA = {
  CHASE_DISTANCE: 11,
  CHASE_HEIGHT: 4.5,
  STREET_DISTANCE: 3.5,
  STREET_HEIGHT: 1.7,
  AERIAL_HEIGHT: 240,
};

// Foto (1280x720, masing-masing <= 256 KiB).
export const SHOTS = {
  WIDTH: 1280,
  HEIGHT: 720,
  MAX_BYTES: 262144,
  COUNT: 4,
};

// Palet warna kota senja (hex).
export const PALETTE = {
  BUILDING: 0xd8c9a8,
  BUILDING_ALT: 0xc9b48a,
  BUILDING_GLASS: 0x7fb2d9,
  ROAD: 0x3a3f46,
  ROAD_LINE: 0xf5e9c8,
  SIDEWALK: 0x9a938a,
  GRASS: 0x4f8f4a,
  SEA: 0x1e6f8e,
  SAND: 0xe8d9a8,
  SKY_DUSK: 0xff9a5c,
  SKY_TOP: 0x2e4a7a,
  CAR: 0xff7a1a,
  CAR_TRAFFIC: 0xcccccc,
  CAR_TRAFFIC_RED: 0xc0392b,
  POLICE: 0xffffff,
  POLICE_LIGHT_RED: 0xff2222,
  POLICE_LIGHT_BLUE: 0x2244ff,
  PLAYER_SHIRT: 0xff7a1a,
  PLAYER_SKIN: 0xc98d64,
  PEDESTRIAN: 0x7a86c8,
  MARKER: 0xffd21a,
};
