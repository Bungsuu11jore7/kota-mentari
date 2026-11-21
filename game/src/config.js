// KOTA MENTARI — semua konstanta game.
// Modul ini HANYA berisi nilai, tanpa logika: ubah angka di sini dan
// seluruh kota mengikutinya. Tidak ada fungsi, tidak ada percabangan.

export const CONFIG = {
  title: 'KOTA MENTARI',
  city: 'Kota Mentari',
  seed: 7,
  saveKey: 'kota-mentari-save',

  // Dunia: peta persegi, laut di timur dan selatan, kota di tengah.
  world: {
    size: 1000,
    halfSize: 500,
    groundY: 0,
    seaLevel: -0.5,
    beachWidth: 24,
  },

  // Kisi jalan: 9 x 9 simpul = 81 simpul, 144 sisi, jarak antar simpul 100.
  roads: {
    gridCount: 9,
    gridSpacing: 100,
    gridMin: -400,
    gridMax: 400,
    nodeCount: 81,
    edgeCount: 144,
    roadWidth: 10,
    sidewalkWidth: 3,
    lineDash: 6,
  },

  // Distrik beserta persegi panjangnya (x0, z0, x1, z1).
  districts: {
    pelabuhan: { name: 'Pelabuhan', x0: 300, z0: 200, x1: 500, z1: 500 },
    pasarLama: { name: 'Pasar Lama', x0: -400, z0: -100, x1: -100, z1: 200 },
    menara: { name: 'Menara', x0: -100, z0: -500, x1: 300, z1: -200 },
    pesisir: { name: 'Pesisir', x0: -100, z0: 300, x1: 300, z1: 500 },
    bukit: { name: 'Bukit', x0: -500, z0: -500, x1: -100, z1: -100 },
  },

  // Gedung: 126-147 gedung, target 143 seperti kota acuan.
  buildings: {
    min: 126,
    max: 147,
    target: 143,
    minHeight: 8,
    maxHeight: 60,
    minFootprint: 12,
    maxFootprint: 30,
    minGapFromRoad: 9,
  },

  // Kapal misi 6 (Jalan Pulang): titik kabur di ujung dermaga Pelabuhan.
  ship: { x: 470, z: 350, radius: 12 },

  // Misi 1-6, berurutan. Hadiah kumulatif: 500, 1700, 3700, 6700, 14700, 29700.
  missions: [
    {
      id: 1, key: 'paket-kilat', name: 'Paket Kilat', reward: 500, total: 500,
      target: { x: 100, z: -300 }, district: 'Menara', packages: 3,
      objective: 'Antar 3 paket ke penanda kuning di Menara',
    },
    {
      id: 2, key: 'mobil-pinjaman', name: 'Mobil Pinjaman', reward: 1200, total: 1700,
      carSpawn: { x: 100, z: 0 }, target: { x: 0, z: 400 }, district: 'Pesisir',
      objective: 'Curi mobil oranye di (100, 0), bawa ke Pesisir',
    },
    {
      id: 3, key: 'kejar-bayangan', name: 'Kejar Bayangan', reward: 2000, total: 3700,
      target: { x: 0, z: 400 }, district: 'Pesisir',
      objective: 'Kejar target yang melarikan diri sampai ke Pesisir',
    },
    {
      id: 4, key: 'tolong-mira', name: 'Tolong Mira', reward: 3000, total: 6700,
      target: { x: -200, z: 100 }, district: 'Pasar Lama', attackers: 3,
      objective: 'Selamatkan Mira di Pasar Lama dari 3 penyerang Geng Ombak',
    },
    {
      id: 5, key: 'brankas-pelabuhan', name: 'Brankas Pelabuhan', reward: 8000, total: 14700,
      target: { x: 400, z: 300 }, district: 'Pelabuhan',
      objective: 'Ambil brankas di Pelabuhan',
    },
    {
      id: 6, key: 'jalan-pulang', name: 'Jalan Pulang', reward: 15000, total: 29700,
      target: { x: 470, z: 350 }, district: 'Pelabuhan',
      objective: 'Kabur ke kapal di ujung dermaga Pelabuhan',
    },
  ],

  // Traffic aktif: 28 mobil, 45 pejalan kaki.
  traffic: {
    cars: 28,
    pedestrians: 45,
    carSpeedMin: 8,
    carSpeedMax: 14,
    pedSpeedMin: 1.2,
    pedSpeedMax: 2.4,
    spawnRoadMargin: 4,
  },

  // Kecepatan dalam meter per detik (km/jam = m/detik x 3,6).
  speeds: {
    playerWalk: 5,
    playerRun: 9,
    carMax: 42,
    carAccel: 12,
    carBrake: 28,
    carReverseMax: 10,
    policeMax: 46,
    chaseTarget: 15,
    attacker: 3.2,
    turnRate: 2.4,
  },

  // Pemain: Raka Pratama, kurir 28 tahun, kemeja oranye.
  player: {
    startX: 0,
    startZ: 0,
    startAngle: 0,
    health: 100,
    maxHealth: 100,
    startMoney: 0,
    punchDamage: 10,
    pistolDamage: 25,
    pistolAmmo: 12,
  },

  // Sistem wanted 0-5 bintang.
  wanted: {
    maxStars: 5,
    decaySeconds: 25,
    hideSeconds: 20,
    stealStars: 2,
    attackStars: 1,
    shootNearPoliceStars: 1,
    policeByStars: [0, 1, 2, 3, 4, 6],
    roadblockAtStars: 5,
    bustedDistance: 2.5,
    spawnDistance: 40,
    chaseDistance: 120,
  },

  // Kamera: helper kamera hanya menerima enam angka (mata x/y/z + tatap x/y/z).
  camera: {
    chaseDistance: 13,
    chaseHeight: 4.5,
    chaseLookAhead: 12,
    driveDistance: 12,
    driveHeight: 4,
    driveLookAhead: 20,
    walkDistance: 3.4,
    walkHeight: 1.7,
    walkLookHeight: 1.3,
    aerialEye: [60, 200, 280],
    aerialTarget: [0, 0, -20],
    fov: 60,
  },

  // Palet warna kota senja (nilai hex).
  palette: {
    skyTop: 0x274b7a,
    skyHorizon: 0xff9a56,
    sun: 0xffd27a,
    fog: 0xf0a266,
    sea: 0x2e7f9e,
    sand: 0xe0c98f,
    grass: 0x5f8f4a,
    road: 0x3a3a40,
    roadLine: 0xf2e6a0,
    sidewalk: 0x9a9a94,
    buildingRoof: 0x6b5a49,
    glass: 0x7fb2d9,
    building: [0xd9c7a7, 0xc9b18c, 0xb59a7a, 0x9c8a7a, 0x7f8ea3, 0xe8dcc3, 0xa8b8c8],
    carOrange: 0xff7a1a,
    carColors: [0xff7a1a, 0xd21f2b, 0x2456c9, 0xf2c200, 0xf2f2f2, 0x1c1c22, 0x2e8b57, 0x7a4a9e],
    policeCar: 0xffffff,
    policeLightRed: 0xff2222,
    policeLightBlue: 0x2266ff,
    playerShirt: 0xff7a1a,
    playerPants: 0x2b3a55,
    playerSkin: 0xc98d64,
    playerHair: 0x1c1410,
    pedestrian: [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e],
    marker: 0xffd21f,
    markerRing: 0xffe95e,
    ship: 0xe8e2d4,
    shipAccent: 0x1f4e79,
  },

  // Kontrol keyboard (nama kode tombol).
  controls: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    run: 'ShiftLeft',
    enterCar: 'KeyE',
    handbrake: 'Space',
    punch: 'KeyF',
    weaponFist: 'Digit1',
    weaponPistol: 'Digit2',
    pause: 'KeyP',
    pauseAlt: 'Escape',
    mute: 'KeyM',
    start: 'Enter',
  },

  // Cerita: semua nama asli, bukan dari game komersial mana pun.
  story: {
    protagonist: 'Raka Pratama',
    protagonistAge: 28,
    protagonistJob: 'kurir',
    fixer: 'Mira Santosa',
    antagonist: 'Bos Darma',
    gang: 'Geng Ombak',
    intro: 'Raka Pratama, kurir 28 tahun di Kota Mentari, menerima paket terakhir hari itu — dan paket itu mengubah segalanya.',
  },

  // HUD dan layar.
  hud: {
    minimapSize: 160,
    toastSeconds: 4,
    screens: ['start', 'playing', 'pause', 'complete', 'busted'],
  },

  // Audio: volume dan nada dasar (sintesis WebAudio, tanpa berkas suara).
  audio: {
    masterVolume: 0.5,
    engineBaseHz: 55,
    engineTopHz: 220,
    sirenHz: [700, 950],
    ambientVolume: 0.05,
  },

  // Foto: 4 screenshot 1280x720, masing-masing paling besar 256 KiB.
  screenshots: {
    width: 1280,
    height: 720,
    maxBytes: 262144,
    names: ['1-chase', '2-drive', '3-street', '4-start'],
  },

  // Uang staging foto kejar-kejaran (kumulatif setelah misi 5).
  stagingMoneyChase: 14700,
};

export const SEED = CONFIG.seed;
export const SAVE_KEY = CONFIG.saveKey;
export const MISSIONS = CONFIG.missions;
export const DISTRICTS = CONFIG.districts;
export const PALETTE = CONFIG.palette;
export const SHIP = CONFIG.ship;
export const TRAFFIC = CONFIG.traffic;
