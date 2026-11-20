// Modul input — keyboard dan mouse untuk Kota Mentari.
// Melacak tombol yang sedang ditekan, tombol yang baru saja ditekan pada
// frame ini, dan posisi klik mouse terakhir. Semua modul lain membaca
// keadaan input lewat fungsi-fungsi di sini, bukan lewat listener sendiri.

const KEY_ALIASES = {
  ' ': 'space',
  spacebar: 'space',
  esc: 'escape',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
};

function normalizeKey(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return '';
  const lower = raw.toLowerCase();
  return KEY_ALIASES[lower] || lower;
}

// Peta tombol yang sedang ditekan: nama tombol (huruf kecil) -> true.
// Tombol yang dipakai game: w, a, s, d, shift, e, space, f, 1, 2, p,
// escape, m. Tombol lain juga tercatat apa adanya bila ditekan.
export const keys = {};

// Kumpulan tombol yang baru saja ditekan pada frame berjalan. Dibersihkan
// tiap akhir frame oleh updateInput, yang dipanggil modul utama.
const justPressedKeys = new Set();

// Posisi klik mouse terakhir (koordinat layar, piksel) beserta tombolnya.
export const lastClick = { x: 0, y: 0, button: 0, time: 0 };

// True bila ada klik mouse yang belum dikonsumsi sejak frame sebelumnya.
let clickQueued = false;

// True bila ada klik mouse yang belum dikonsumsi pada frame ini.
let clickQueuedThisFrame = false;

function onKeyDown(event) {
  const key = normalizeKey(event.key);
  if (!key) return;
  if (!event.repeat) justPressedKeys.add(key);
  keys[key] = true;
  // Cegah halaman bergeser saat spasi atau panah ditekan selama bermain.
  if (key === 'space' || key === 'up' || key === 'down') {
    event.preventDefault();
  }
}

function onKeyUp(event) {
  const key = normalizeKey(event.key);
  if (!key) return;
  delete keys[key];
}

function onMouseDown(event) {
  lastClick.x = event.clientX;
  lastClick.y = event.clientY;
  lastClick.button = event.button;
  lastClick.time = Date.now();
  clickQueued = true;
  clickQueuedThisFrame = true;
}

function onBlur() {
  // Kehilangan fokus jendela: lepas semua tombol supaya pemain tidak
  // terus berjalan saat kembali.
  for (const key of Object.keys(keys)) delete keys[key];
  justPressedKeys.clear();
}

let listenersAttached = false;

// Pasang listener keyboard dan mouse pada jendela. Aman dipanggil
// berkali-kali; pemasangan kedua dan seterusnya tidak berpengaruh.
export function initInput() {
  if (listenersAttached) return;
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('blur', onBlur);
  listenersAttached = true;
}

// Pemeriksa tombol sedang ditekan. Terima nama tombol apa adanya
// ('w', 'shift', ' ', 'space', 'escape', 'esc', '1', 'f', ...).
export function isDown(key) {
  return keys[normalizeKey(key)] === true;
}

// Pemeriksa tombol baru saja ditekan pada frame ini. True hanya pada
// frame saat tombol ditekan pertama kali (bukan saat ditahan / repeat).
export function justPressed(key) {
  return justPressedKeys.has(normalizeKey(key));
}

// Ambil klik mouse yang menunggu, lalu tandai sudah dipakai. Kembalikan
// salinan posisi klik terakhir, atau null bila tidak ada klik baru.
export function consumeClick() {
  if (!clickQueued) return null;
  clickQueued = false;
  clickQueuedThisFrame = false;
  return { x: lastClick.x, y: lastClick.y, button: lastClick.button, time: lastClick.time };
}

// True bila ada klik mouse yang menunggu dikonsumsi.
export function hasClick() {
  return clickQueued;
}

// True bila klik terjadi tepat pada frame ini.
export function clickedThisFrame() {
  return clickQueuedThisFrame;
}

// Dipanggil modul utama di akhir tiap frame: membersihkan daftar tombol
// baru saja ditekan dan penanda klik frame ini, supaya justPressed hanya
// benar selama satu frame.
export function updateInput() {
  justPressedKeys.clear();
  clickQueuedThisFrame = false;
}

// Alias penanda akhir frame, untuk modul yang memakai nama ini.
export const endFrame = updateInput;
export const clearJustPressed = updateInput;

// Buang klik yang menunggu tanpa dipakai (misalnya klik di menu).
export function discardClick() {
  clickQueued = false;
  clickQueuedThisFrame = false;
}

// Pasang listener segera saat modul dimuat, supaya input sudah hidup
// sebelum modul utama sempat memanggil initInput.
initInput();
