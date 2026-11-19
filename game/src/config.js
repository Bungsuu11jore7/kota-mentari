// KOTA MENTARI — semua konstanta dan tuning di satu tempat.
// Dunia: grid 800x800, jalan tiap 100 unit, blok 80x80, tanah y=0, sumbu y ke atas.
// Semua warna dan angka gameplay tinggal di sini supaya lane lain tidak
// mengarang angka sendiri.

export const WORLD_SIZE = 800;
export const WORLD_HALF = WORLD_SIZE / 2;
export const ROAD_GAP = 100;
export const BLOCK = 80;
export const ROAD_WIDTH = 14;
export const SIDEWALK_WIDTH = 20;

// Langkah simulasi tetap: 60 update per detik apa pun laju layarnya.
export const STEP = 1 / 60;

// ---------------------------------------------------------------------------
// Warna kota — senja tropis: langit oranye, aspal hangat, gedung pastel.
// ---------------------------------------------------------------------------
export const COLORS = {
  sky: 0xff8f4d,
  fog: 0xe8803f,
  sun: 0xffb36b,
  hemiSky: 0xffc08a,
  hemiGround: 0x6b4a2f,
  ground: 0x9c8a68,
  sand: 0xe0c188,
  sea: 0x2e7f9e,
  asphalt: 0x33363e,
  roadLine: 0xe8c33a,
  sidewalk: 0xa89a80,
  palmTrunk: 0x7a5a38,
  palmLeaf: 0x3f8f4a,
  lampPole: 0x2f333a,
  lampLight: 0xffd27a,
  pierWood: 0x8a6a42,
  boatHull: 0x37424e,
  boatCabin: 0xe8e2d2,
  hydrant: 0xc23b2e,
  crate: 0xa87c4a,
};

// Dinding gedung: pastel hangat + beberapa aksen dingin (Menara).
export const BUILDING_COLORS = [
  0xd9a05b, 0xc97b4a, 0xe0b184, 0xd97b6c, 0xe8dcc8,
  0x9fb4c0, 0x7a8ba0, 0xb8c4a8, 0x8f7ba8, 0x6b8e7a,
];

// Atap: genteng gelap / dak beton, selalu lebih gelap dari dinding.
export const ROOF_COLORS = [0x8a4a3a, 0x5a6b7a, 0x7a5a3a, 0x4a5a6b, 0x6b3a3a];

// Jarak pandang kabut senja (unit dunia).
export const FOG = { near: 420, far: 1250 };

// ---------------------------------------------------------------------------
// Tuning pemain (jalan kaki).
// ---------------------------------------------------------------------------
export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  radius: 0.9,
  health: 100,
};

// ---------------------------------------------------------------------------
// Tuning mobil (arcade: satuan unit/detik).
// ---------------------------------------------------------------------------
export const CAR = {
  maxSpeed: 38,
  reverseMax: 12,
  accel: 16,
  brake: 32,
  turnRate: 1.9,
  driftGrip: 0.86,
  health: 100,
  radius: 2.2,
};

// Mobil lalu lintas (traffic): kecepatan jelajah 8-14 unit/detik.
export const TRAFFIC = { minSpeed: 8, maxSpeed: 14, count: 14 };

// ---------------------------------------------------------------------------
// Wanted / polisi.
// ---------------------------------------------------------------------------
export const WANTED = {
  max: 5,
  decaySeconds: 20,
  copsBase: 2,
  bustSeconds: 3,
  // Uang awal dan hadiah misi (Rp disederhanakan jadi $).
  startMoney: 50,
};

// Kunci simpan/load di localStorage.
export const SAVE_KEY = 'mentari_save_v1';
