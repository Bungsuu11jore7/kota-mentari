// KOTA MENTARI — random.js
// Generator acak berbiji (deterministik): benih sama -> urutan sama.
// Dipakai penempatan dunia dan traffic supaya kota identik antar muat.

export function createRng(seed) {
  let state = (seed >>> 0) || 1;
  return {
    seed,
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function rngFloat(rng, min, max) {
  return min + rng.next() * (max - min);
}

export function rngInt(rng, min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return lo + Math.floor(rng.next() * (hi - lo + 1));
}

export function rngPick(rng, list) {
  if (!list || list.length === 0) return undefined;
  return list[Math.floor(rng.next() * list.length)];
}

export function rngShuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
