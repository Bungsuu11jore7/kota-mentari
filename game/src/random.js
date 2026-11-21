// KOTA MENTARI — RNG berbiji tetap.
// Diberi benih yang sama, urutan angka yang dihasilkan SELALU sama,
// supaya kota yang dibangun identik antar muat.
// Benih dunia: 7.

export const WORLD_SEED = 7;

// Generator mulberry32: kecil, cepat, deterministik.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Membuat satu RNG berbiji dengan fungsi acak dasar.
export function createRng(seed) {
  const next = mulberry32(seed);
  return {
    // Angka 0 (inklusif) sampai 1 (eksklusif).
    next() {
      return next();
    },
    // Bilangan bulat dalam rentang min..max (inklusif di kedua ujung).
    int(min, max) {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    // Angka desimal dalam rentang min (inklusif) sampai max (eksklusif).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Satu elemen acak dari daftar (daftar tidak diubah).
    pick(list) {
      if (!list || list.length === 0) return undefined;
      return list[Math.floor(next() * list.length)];
    },
    // Benar dengan peluang p (0..1).
    chance(p) {
      return next() < p;
    },
    // Salinan acak dari daftar (daftar asli tidak diubah).
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
}

// Alias: nama lain untuk pembuat RNG berbiji yang sama.
export const createSeededRng = createRng;

// Satu instans bersama berbiji 7 untuk hal-hal kecil yang butuh acak cepat.
// Modul yang membangun kota sebaiknya membuat instans sendiri dari benih 7
// supaya urutannya tidak tergantung pada pemakaian instans bersama ini.
export const rng = createRng(WORLD_SEED);
