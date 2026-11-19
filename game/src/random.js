// Random deterministik (mulberry32): seed yang sama selalu menghasilkan
// urutan yang sama, jadi staging screenshot (?shot= & ?seed=) bisa diulang
// persis dan kota yang dibangun selalu identik untuk satu seed.

export function createRandom(seed) {
  let a = seed | 0;

  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Bilangan acak dalam [a, b).
  function range(a, b) {
    return a + next() * (b - a);
  }

  // Satu elemen acak dari array (array tidak boleh kosong).
  function pick(arr) {
    return arr[Math.floor(next() * arr.length)];
  }

  return { next, range, pick };
}
