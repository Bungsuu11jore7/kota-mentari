// KOTA MENTARI — config.js
// Semua konstanta game. Modul ini HANYA berisi nilai, TIDAK ada logika.

export const CONFIG = {
  // Identitas kota.
  GAME_TITLE: "KOTA MENTARI",
  SAVE_KEY: "kota-mentari-save",
  RANDOM_SEED: 7,

  // Ukuran peta (satuan dunia). Jalan membentuk kisi 9 x 9.
  MAP_SIZE: 1000,
  MAP_HALF: 500,
  GRID_COUNT: 9,
  GRID_SPACING: 100,
  GRID_MIN: -400,
  GRID_MAX: 400,
  ROAD_WIDTH: 14,
  SIDEWALK_WIDTH: 4,

  // Graf jalan (kisi 9 x 9: 81 simpul, 144 sisi).
  ROAD_NODES: 81,
  ROAD_EDGES: 144,

  // Distrik beserta persegi panjangnya (xMin, xMax, zMin, zMax).
  DISTRICTS: {
    PELABUHAN: { name: "Pelabuhan", xMin: 250, xMax: 500, zMin: 200, zMax: 500 },
    PASAR_LAMA: { name: "Pasar Lama", xMin: -500, xMax: -100, zMin: -100, zMax: 300 },
    MENARA: { name: "Menara", xMin: -100, xMax: 300, zMin: -400, zMax: -100 },
    PESISIR: { name: "Pesisir", xMin: -200, xMax: 250, zMin: 300, zMax: 500 },
    BUKIT: { name: "Bukit", xMin: -500, xMax: -100, zMin: -400, zMax: -100 },
  },

  // Kapal misi 6 (kabur dari kota).
  SHIP: { x: 470, z: 350, radius: 12 },

  // Misi 1-6: hadiah tiap misi dan uang kumulatif.
  MISSION_REWARDS: [500, 1200, 2000, 3000, 8000, 15000],
  MISSION_CUMULATIVE: [500, 1700, 3700, 6700, 14700, 29700],
  MISSION_COUNT: 6,

  // Titik target tiap misi (x, z).
  MISSION_TARGETS: [
    { x: 100, z: -300 },
    { x: 0, z: 400 },
    { x: 0, z: 400 },
    { x: -200, z: 100 },
    { x: 400, z: 300 },
    { x: 470, z: 350 },
  ],
  MISSION_CAR_SPAWN: { x: 100, z: 0 },
  MIRA_POSITION: { x: -200, z: 100 },
  MIRA_ATTACKERS: 3,
  DELIVERY_RADIUS: 18,
  DELIVERY_COUNT: 3,

  // Traffic dan pejalan kaki.
  TRAFFIC_CARS: 28,
  TRAFFIC_PEDESTRIANS: 45,

  // Kecepatan (satuan dunia per detik).
  WALK_SPEED: 6,
  RUN_SPEED: 10,
  DRIVE_MAX_SPEED: 30,
  DRIVE_ACCEL: 14,
  DRIVE_BRAKE: 22,
  CHASE_TARGET_SPEED: 16,
  ATTACKER_SPEED: 3.2,
  // 1 satuan/detik = 3,6 km/jam (30 satuan/detik = 108 km/jam).
  KMH_PER_UNIT: 3.6,

  // Pemain.
  PLAYER_HEALTH: 100,
  PLAYER_START: { x: 0, z: 0, angle: 0 },

  // Wanted 0-5.
  WANTED_MAX: 5,
  WANTED_DECAY_SECONDS: 30,
  WANTED_POLICE_AT_5: 6,
  WANTED_ROADBLOCK_AT_5: 1,
  BUSTED_DISTANCE: 2.5,

  // Kamera.
  CAMERA_CHASE_HEIGHT: 5,
  CAMERA_CHASE_DISTANCE: 12,

  // Palet warna (hex).
  COLORS: {
    BUILDING: 0x8a7f72,
    BUILDING_WINDOWS: 0xffe9a8,
    BUILDINGS: [0x8a7f72, 0x7d7468, 0x96897a, 0x6e6a72, 0xa08b6d, 0x5f6e7a],
    ROAD: 0x3a3a40,
    ROAD_LINE: 0xf5e9c8,
    SIDEWALK: 0x9a938a,
    GRASS: 0x4a7c43,
    SEA: 0x1e6f8e,
    SAND: 0xd9c08a,
    SKY_SUNSET: 0xff9a56,
    SKY_TOP: 0x2e4a7a,
    FOG: 0xe8a06a,
    SUN: 0xffd27a,
    CAR_PLAYER: 0xff7a1a,
    CAR_TRAFFIC: [0xc23b2e, 0x2e6fc2, 0x3fae5a, 0xe8c832, 0x8e44ad, 0xd8d8d8, 0x222222],
    CAR_POLICE: 0xffffff,
    POLICE_LIGHT_RED: 0xff2222,
    POLICE_LIGHT_BLUE: 0x2244ff,
    PLAYER_SHIRT: 0xff7a1a,
    PLAYER_PANTS: 0x22222e,
    PEDESTRIAN: [0xe86a6a, 0x6aa8e8, 0x7ed07e, 0xe8d06a, 0xc06ae8, 0x6ad8d0],
    MARKER: 0xffd21a,
    SHIP: 0xe8e0d0,
  },
};
