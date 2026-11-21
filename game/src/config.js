// KOTA MENTARI — satu tempat untuk semua konstanta game.
// Semua nama, karakter, distrik, dan cerita di game ini orisinal,
// tanpa nama atau aset dari game komersial mana pun.
// Bila angka di file ini berbeda dengan dokumen desain, dokumen desain yang menang.

export const GAME_TITLE = 'KOTA MENTARI';
export const GAME_SUBTITLE = 'Kota pesisir tropis — enam misi, satu jalan pulang.';

// Benih tetap: kota yang dibangun dari benih ini harus identik antar muat.
export const WORLD_SEED = 7;

// Kunci penyimpanan lokal untuk save/load.
export const SAVE_KEY = 'kota-mentari-save-v1';

// Ukuran dunia (meter). Kota membentang dari -500 sampai +500 di sumbu x dan z.
export const WORLD_HALF = 500;
export const WORLD_SIZE = 1000;

// Kecepatan dalam meter per detik. 1 m/detik = 3,6 km/jam.
export const MS_TO_KMH = 3.6;
export const WALK_SPEED = 5;
export const RUN_SPEED = 9;
export const CAR_TOP_SPEED = 42;
export const CAR_ACCEL = 14;
export const CAR_BRAKE = 30;
export const CAR_REVERSE_SPEED = 12;

// Jarak pemicu (meter).
export const DELIVERY_RADIUS = 12;
export const MARKER_RADIUS = 12;
export const PICKUP_RADIUS = 6;
export const ENTER_CAR_RADIUS = 6;
export const PUNCH_RANGE = 2.2;
export const SHOOT_RANGE = 60;

// Sistem wanted: 0 sampai 5 bintang.
export const MAX_WANTED = 5;
export const WANTED_STAR_CAR_THEFT = 2;
export const WANTED_STAR_ATTACK = 1;
export const WANTED_STAR_SHOOT_NEAR_POLICE = 1;
// Wanted meluruh satu bintang bila pemain bersembunyi cukup lama dari polisi.
export const WANTED_DECAY_HIDE_SECONDS = 20;
export const WANTED_DECAY_PER_SECOND = 0.05;
// Wanted 5 memicu 6 unit polisi + 1 roadblock.
export const WANTED_FIVE_UNITS = 6;
export const WANTED_FIVE_ROADBLOCKS = 1;

// Hadiah misi (satuan uang game), berurutan misi 1 sampai 6.
// Kumulatif: 500, 1.700, 3.700, 6.700, 14.700, 29.700.
export const MISSION_REWARDS = [500, 1200, 2000, 3000, 8000, 15000];
export const TOTAL_REWARD = 29700;

export const MISSION_NAMES = [
  'Paket Kilat',
  'Mobil Pinjaman',
  'Kejar Bayangan',
  'Tolong Mira',
  'Brankas Pelabuhan',
  'Jalan Pulang',
];

export const MISSION_OBJECTIVES = [
  'Antar 3 paket ke penanda kuning di Menara',
  'Bawa mobil oranye ke Pesisir',
  'Kejar target sampai ke Pesisir',
  'Selamatkan Mira dari 3 penyerang',
  'Ambil brankas di Pelabuhan',
  'Kabur ke kapal di ujung dermaga',
];

// Koordinat kunci misi (x, z).
export const MISSION_TARGETS = {
  // Misi 1: titik antar paket di Menara (tiga paket, titik yang sama).
  packageDrop: { x: 100, z: -300 },
  // Misi 2: mobil oranye ter-spawn di sini, diantar ke Pesisir.
  missionCar: { x: 100, z: 0 },
  missionCarColor: 'orange',
  missionCarDestination: { x: 0, z: 400 },
  // Misi 3: target kejar melarikan diri menuju Pesisir.
  chaseDestination: { x: 0, z: 400 },
  // Misi 4: Mira diserang 3 penyerang di sini.
  miraRescue: { x: -200, z: 100 },
  miraAttackers: 3,
  // Misi 5: brankas di Pelabuhan.
  safeSpot: { x: 400, z: 300 },
  // Misi 6: kapal kabur di ujung dermaga.
  shipSpot: { x: 470, z: 350 },
};

// Distrik kota.
export const DISTRICTS = ['Pelabuhan', 'Pasar Lama', 'Menara', 'Pesisir', 'Bukit'];

// Jumlah traffic dan pejalan kaki aktif.
export const TRAFFIC_CAR_COUNT = 28;
export const PEDESTRIAN_COUNT = 45;

// Graf jalan kota.
export const ROAD_NODE_COUNT = 81;
export const ROAD_EDGE_COUNT = 144;

// Posisi awal pemain.
export const PLAYER_START = { x: 0, z: 0, heading: 0 };
export const PLAYER_START_MONEY = 0;
export const PLAYER_MAX_HEALTH = 100;

// Warna identitas (hex tiga.js).
export const PLAYER_SHIRT_COLOR = 0xff7a1a;
export const PLAYER_CAR_COLOR = 0xff8c1a;
export const POLICE_CAR_COLOR = 0xffffff;
export const MARKER_COLOR = 0xffd21f;

// Kamera kejar: jarak dan tinggi relatif terhadap pemain/mobil.
export const CAMERA_CHASE_DISTANCE = 10;
export const CAMERA_CHASE_HEIGHT = 4.5;
export const CAMERA_STREET_DISTANCE = 4.5;
export const CAMERA_STREET_HEIGHT = 1.7;

// Kecepatan gerak penyerang misi 4 (unit per detik, digerakkan loop utama saja).
export const ATTACKER_SPEED = 3.2;

// Jarak pandang polisi untuk pengejaran (meter).
export const POLICE_CHASE_RANGE = 90;
export const POLICE_CATCH_DISTANCE = 2.5;
