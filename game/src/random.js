// KOTA MENTARI — generator acak berbiji (deterministik).
// Benih sama -> urutan sama, selalu. Semua keacakan dunia (gedung, traffic,
// pejalan kaki, warna mobil) memakai generator ini supaya kota identik
// setiap kali dimuat. Tidak ada Math.random di sini.

function mulberry32(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveNext(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return rng.next.bind(rng);
  throw new Error('RNG KOTA MENTARI: butuh generator dari createRng(benih)');
}

// Pembuat generator: menerima satu angka benih, mengembalikan objek dengan
// next() dan helper int/float/pick/shuffle yang memakai urutan yang sama.
export function createRng(seed) {
  const next = mulberry32(seed);
  const rng = {
    seed,
    next,
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    float(min, max) {
      return next() * (max - min) + min;
    },
    pick(list) {
      if (!list || list.length === 0) return undefined;
      return list[Math.floor(next() * list.length)];
    },
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
    // Mulai ulang urutan dari benih awal.
    reset() {
      const fresh = mulberry32(seed);
      rng.next = fresh;
    },
  };
  return rng;
}

// Bilangan bulat dalam rentang [min, max] (inklusif).
export function rngInt(rng, min, max) {
  const next = resolveNext(rng);
  return Math.floor(next() * (max - min + 1)) + min;
}

// Bilangan desimal dalam rentang [min, max).
export function rngFloat(rng, min, max) {
  const next = resolveNext(rng);
  return next() * (max - min) + min;
}

// Satu unsur acak dari daftar.
export function rngPick(rng, list) {
  if (!list || list.length === 0) return undefined;
  const next = resolveNext(rng);
  return list[Math.floor(next() * list.length)];
}

// Salinan daftar yang urutannya diacak (daftar asli tidak diubah).
export function rngShuffle(rng, list) {
  const next = resolveNext(rng);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// Benih dari teks (dipakai bila benih perlu diturunkan dari sebuah nama).
export function seedFromText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
