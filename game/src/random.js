// KOTA MENTARI — modul random.
// Generator acak berbiji yang deterministik: benih sama selalu menghasilkan
// urutan bilangan yang sama. Dipakai untuk penempatan kota, traffic, dan
// staging foto (benih permainan: 7).

// ---------------------------------------------------------------------------
// Pembuat generator acak berbiji.
// Menerima satu angka benih, mengembalikan objek generator dengan metode:
//   next()           — bilangan desimal 0 (inklusif) sampai 1 (eksklusif)
//   float(min, max)  — bilangan desimal dalam rentang [min, max)
//   int(min, max)    — bilangan bulat dalam rentang [min, max] (inklusif)
//   pick(list)       — satu unsur acak dari daftar (daftar tidak diubah)
//   shuffle(list)    — salinan baru daftar dengan urutan diacak
//   range(min, max)  — alias float(min, max)
//   choice(list)     — alias pick(list)
// ---------------------------------------------------------------------------
export function createRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function float(min, max) {
    return min + next() * (max - min);
  }

  function int(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return lo + Math.floor(next() * (hi - lo + 1));
  }

  function pick(list) {
    if (!list || list.length === 0) return undefined;
    return list[Math.floor(next() * list.length)];
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  return {
    seed,
    next,
    float,
    range: float,
    int,
    integer: int,
    pick,
    choice: pick,
    shuffle,
  };
}

// Alias pembuat generator, untuk modul yang menyebutnya dengan nama lain.
export const makeRng = createRng;
export const seededRandom = createRng;
export const createSeededRandom = createRng;
export const createSeededRng = createRng;

// ---------------------------------------------------------------------------
// Pembantu mandiri yang menerima generator sebagai argumen pertama.
// Berguna bila modul lain sudah memegang satu generator bersama.
// ---------------------------------------------------------------------------
export function randomFloat(rng, min, max) {
  return rng.float(min, max);
}

export function randomInt(rng, min, max) {
  return rng.int(min, max);
}

export function randomPick(rng, list) {
  return rng.pick(list);
}

export function shuffleArray(rng, list) {
  return rng.shuffle(list);
}

// Alias pembantu mandiri.
export const randFloat = randomFloat;
export const randInt = randomInt;
export const randPick = randomPick;

// ---------------------------------------------------------------------------
// Generator bersama permainan (benih 7), siap pakai bila modul lain tidak
// butuh generator sendiri. Urutan pemakaiannya tetap deterministik selama
// pemakaian berurutan sama.
// ---------------------------------------------------------------------------
export const rng = createRng(7);
export const gameRng = rng;
export const defaultRng = rng;

export default createRng;
