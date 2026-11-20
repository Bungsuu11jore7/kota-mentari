// KOTA MENTARI — modul config.
// Modul ini HANYA berisi nilai (konstanta). Tidak ada logika di sini.
// Semua angka dan nama mengikuti dokumen desain v4.

// ---------------------------------------------------------------------------
// Peta: persegi dari -500 sampai 500 pada sumbu X dan sumbu Z.
// ---------------------------------------------------------------------------
export const MAP_MIN = -500;
export const MAP_MAX = 500;
export const MAP_SIZE = 1000;
export const MAP_HALF = 500;

// Batas spawn: pemain dan kendaraan tidak boleh muncul di luar batas ini.
export const SPAWN_LIMIT = 396;

// ---------------------------------------------------------------------------
// Kisi jalan: jalan membujur dan melintang tiap 100 satuan.
// ---------------------------------------------------------------------------
export const ROAD_SPACING = 100;
export const ROAD_LINES = [-400, -300, -200, -100, 0, 100, 200, 300, 400];
export const ROAD_WIDTH = 14;
export const SIDEWALK_WIDTH = 4;

// ---------------------------------------------------------------------------
// Distrik (persegi panjang dalam koordinat X dan Z).
// ---------------------------------------------------------------------------
export const DISTRICTS = [
  { name: 'Pelabuhan', xMin: 300, xMax: 500, zMin: 200, zMax: 500 },
  { name: 'Pasar Lama', xMin: -300, xMax: -100, zMin: -100, zMax: 100 },
  { name: 'Menara', xMin: -100, xMax: 200, zMin: -400, zMax: -200 },
  { name: 'Pesisir', xMin: -300, xMax: 300, zMin: 350, zMax: 500 },
  { name: 'Bukit', xMin: 200, xMax: 500, zMin: -400, zMax: -100 },
  { name: 'Pusat kota', xMin: -100, xMax: 200, zMin: -100, zMax: 200 },
];

export const DISTRICT_PELABUHAN = DISTRICTS[0];
export const DISTRICT_PASAR_LAMA = DISTRICTS[1];
export const DISTRICT_MENARA = DISTRICTS[2];
export const DISTRICT_PESISIR = DISTRICTS[3];
export const DISTRICT_BUKIT = DISTRICTS[4];
export const DISTRICT_PUSAT_KOTA = DISTRICTS[5];

// ---------------------------------------------------------------------------
// Kapal (misi 6 "Jalan Pulang") dan koridor dermaga.
// ---------------------------------------------------------------------------
export const SHIP_X = 470;
export const SHIP_Z = 350;
export const SHIP_POS = { x: 470, z: 350 };
export const SHIP_RADIUS = 12;

// ---------------------------------------------------------------------------
// Misi: hadiah berurutan (total 29700).
// ---------------------------------------------------------------------------
export const MISSION_REWARDS = [500, 1200, 2000, 3000, 8000, 15000];
export const TOTAL_REWARD = 29700;
export const MISSION_COUNT = 6;

// ---------------------------------------------------------------------------
// Pemain.
// ---------------------------------------------------------------------------
export const PLAYER_HEALTH = 100;
export const PLAYER_MAX_HEALTH = 100;
export const WALK_SPEED = 6;
export const RUN_SPEED = 10;

// ---------------------------------------------------------------------------
// Kendaraan.
// ---------------------------------------------------------------------------
export const CAR_MAX_SPEED = 30;
export const POLICE_MAX_SPEED = 32;

// Kecepatan dalam kilometer per jam yang tampil di HUD:
// 30 satuan per detik sama dengan 108 kilometer per jam.
export const SPEED_KMH_FACTOR = 3.6;

// ---------------------------------------------------------------------------
// Populasi traffic.
// ---------------------------------------------------------------------------
export const TRAFFIC_CAR_COUNT = 28;
export const PEDESTRIAN_COUNT = 45;

// ---------------------------------------------------------------------------
// Wanted (0 sampai 5 bintang).
// ---------------------------------------------------------------------------
export const MAX_WANTED = 5;
export const MIN_WANTED = 0;
export const POLICE_SPAWN_MIN_WANTED = 1;
export const ROADBLOCK_MIN_WANTED = 3;
export const POLICE_REPATH_INTERVAL = 1.5;
export const POLICE_CHASE_DIRECT_DISTANCE = 25;
export const MISSION_6_START_WANTED = 3;

// ---------------------------------------------------------------------------
// Penyimpanan lokal.
// ---------------------------------------------------------------------------
export const SAVE_KEY = 'kota-mentari-save';

// ---------------------------------------------------------------------------
// Benih acak permainan (dipakai kota, traffic, dan foto agar deterministik).
// ---------------------------------------------------------------------------
export const SEED = 7;
export const RANDOM_SEED = 7;

// ---------------------------------------------------------------------------
// Foto: lebar 1280, tinggi 720, kualitas JPEG 82, tiap berkas maks 256 KiB.
// ---------------------------------------------------------------------------
export const SCREENSHOT_WIDTH = 1280;
export const SCREENSHOT_HEIGHT = 720;
export const SCREENSHOT_QUALITY = 82;
export const SCREENSHOT_MAX_KIB = 256;

// ---------------------------------------------------------------------------
// Palet warna.
// ---------------------------------------------------------------------------
export const COLOR_BUILDINGS = [
  0xff8c42, 0xf7e6c4, 0x9b7ede, 0x8b5a2b, 0x9aa0a6,
];
export const BUILDING_COLORS = COLOR_BUILDINGS;

export const COLOR_ROAD = 0x2b2b30;
export const ROAD_COLOR = COLOR_ROAD;

export const COLOR_SIDEWALK = 0x8d8578;
export const SIDEWALK_COLOR = COLOR_SIDEWALK;

export const COLOR_GRASS = 0x4d8a3f;
export const GRASS_COLOR = COLOR_GRASS;

export const COLOR_SEA = 0x1f6fb2;
export const SEA_COLOR = COLOR_SEA;

export const COLOR_SKY_SUNSET = 0xff7e2e;
export const SKY_SUNSET_COLOR = COLOR_SKY_SUNSET;
export const COLOR_SKY = 0xff9a3d;
export const SKY_COLOR = COLOR_SKY;

export const COLOR_CARS = [
  0x2563eb, 0x16a34a, 0xeab308, 0xf5f5f5, 0x111111,
];
export const CAR_COLORS = COLOR_CARS;

export const COLOR_POLICE_BODY = 0xf5f5f5;
export const COLOR_POLICE_DOOR = 0x111111;
export const COLOR_POLICE_LIGHT_RED = 0xff0000;
export const COLOR_POLICE_LIGHT_BLUE = 0x0000ff;
export const POLICE_COLORS = [
  COLOR_POLICE_BODY, COLOR_POLICE_DOOR,
  COLOR_POLICE_LIGHT_RED, COLOR_POLICE_LIGHT_BLUE,
];

export const COLOR_PLAYER_SHIRT = 0xff7a1a;
export const COLOR_PLAYER_PANTS = 0x23232a;
export const PLAYER_COLORS = [COLOR_PLAYER_SHIRT, COLOR_PLAYER_PANTS];
export const PLAYER_SHIRT_COLOR = COLOR_PLAYER_SHIRT;
export const PLAYER_PANTS_COLOR = COLOR_PLAYER_PANTS;

export const COLOR_PEDESTRIANS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xecf0f1,
];
export const PEDESTRIAN_COLORS = COLOR_PEDESTRIANS;

export const COLOR_TARGET_CAR = 0xff7a1a;
export const TARGET_CAR_COLOR = COLOR_TARGET_CAR;

export const COLOR_MISSION_MARKER = 0xffd700;
export const MISSION_MARKER_COLOR = COLOR_MISSION_MARKER;

export const COLOR_SUN = 0xffb347;
export const SUN_COLOR = COLOR_SUN;

// ---------------------------------------------------------------------------
// Agregat: semua konstanta dalam satu objek, untuk modul yang butuh sekali
// impor. Nilai-nilainya sama persis dengan ekspor bernama di atas.
// ---------------------------------------------------------------------------
export const CONFIG = {
  MAP_MIN,
  MAP_MAX,
  MAP_SIZE,
  MAP_HALF,
  SPAWN_LIMIT,
  ROAD_SPACING,
  ROAD_LINES,
  ROAD_WIDTH,
  SIDEWALK_WIDTH,
  DISTRICTS,
  SHIP_X,
  SHIP_Z,
  SHIP_POS,
  SHIP_RADIUS,
  MISSION_REWARDS,
  TOTAL_REWARD,
  MISSION_COUNT,
  PLAYER_HEALTH,
  PLAYER_MAX_HEALTH,
  WALK_SPEED,
  RUN_SPEED,
  CAR_MAX_SPEED,
  POLICE_MAX_SPEED,
  SPEED_KMH_FACTOR,
  TRAFFIC_CAR_COUNT,
  PEDESTRIAN_COUNT,
  MAX_WANTED,
  MIN_WANTED,
  POLICE_SPAWN_MIN_WANTED,
  ROADBLOCK_MIN_WANTED,
  POLICE_REPATH_INTERVAL,
  POLICE_CHASE_DIRECT_DISTANCE,
  MISSION_6_START_WANTED,
  SAVE_KEY,
  SEED,
  RANDOM_SEED,
  SCREENSHOT_WIDTH,
  SCREENSHOT_HEIGHT,
  SCREENSHOT_QUALITY,
  SCREENSHOT_MAX_KIB,
  COLOR_BUILDINGS,
  BUILDING_COLORS,
  COLOR_ROAD,
  ROAD_COLOR,
  COLOR_SIDEWALK,
  SIDEWALK_COLOR,
  COLOR_GRASS,
  GRASS_COLOR,
  COLOR_SEA,
  SEA_COLOR,
  COLOR_SKY_SUNSET,
  SKY_SUNSET_COLOR,
  COLOR_SKY,
  SKY_COLOR,
  COLOR_CARS,
  CAR_COLORS,
  COLOR_POLICE_BODY,
  COLOR_POLICE_DOOR,
  COLOR_POLICE_LIGHT_RED,
  COLOR_POLICE_LIGHT_BLUE,
  POLICE_COLORS,
  COLOR_PLAYER_SHIRT,
  COLOR_PLAYER_PANTS,
  PLAYER_COLORS,
  PLAYER_SHIRT_COLOR,
  PLAYER_PANTS_COLOR,
  COLOR_PEDESTRIANS,
  PEDESTRIAN_COLORS,
  COLOR_TARGET_CAR,
  TARGET_CAR_COLOR,
  COLOR_MISSION_MARKER,
  MISSION_MARKER_COLOR,
  COLOR_SUN,
  SUN_COLOR,
};

export default CONFIG;
