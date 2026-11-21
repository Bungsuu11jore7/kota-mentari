// KOTA MENTARI — generator acak berbiji (deterministik).
// Benih sama selalu menghasilkan urutan yang sama, supaya kota dan
// penempatan traffic identik di setiap muat. Dipakai modul dunia dan traffic.

// Pembuat generator dari satu angka benih.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;

  // Bilangan desimal berikutnya dalam [0, 1).
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,

    // Bilangan bulat dalam [min, max] (inklusif).
    int(min, max) {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },

    // Bilangan desimal dalam [min, max).
    float(min, max) {
      return min + next() * (max - min);
    },

    // Satu unsur acak dari daftar (daftar tidak diubah).
    pick(list) {
      if (!list || list.length === 0) return undefined;
      return list[Math.floor(next() * list.length)];
    },

    // Salinan daftar dengan urutan teracak (daftar asli tidak diubah).
    shuffle(list) {
      const arr = list.slice();
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },
  };
}

// Generator default dunia: benih tetap 7.
export function makeWorldRng() {
  return makeRng(7);
}
