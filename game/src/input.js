// KOTA MENTARI — modul input: keyboard dan mouse.
// Satu-satunya modul yang mendaftarkan listener DOM. initInput hanya
// boleh jalan sekali selama game hidup (dijaga flag initialized).

const keysDown = {};
const justPressed = new Set();
const mouse = { x: 0, y: 0, clicked: false, clickX: 0, clickY: 0, button: 0 };
let initialized = false;

function storeKey(code, key) {
  if (code) keysDown[code] = true;
  if (key && key.length === 1) keysDown[key.toLowerCase()] = true;
}

function dropKey(code, key) {
  if (code) delete keysDown[code];
  if (key && key.length === 1) delete keysDown[key.toLowerCase()];
}

function markPressed(code, key) {
  if (code) justPressed.add(code);
  if (key && key.length === 1) justPressed.add(key.toLowerCase());
}

// Daftarkan semua listener keyboard dan mouse. Aman dipanggil berkali-kali:
// panggilan kedua dan seterusnya tidak mendaftarkan listener baru.
export function initInput() {
  if (initialized) return;
  initialized = true;

  window.addEventListener('keydown', (event) => {
    storeKey(event.code, event.key);
    if (!event.repeat) markPressed(event.code, event.key);
    if (
      event.code === 'Space' ||
      event.code === 'ArrowUp' ||
      event.code === 'ArrowDown' ||
      event.code === 'ArrowLeft' ||
      event.code === 'ArrowRight'
    ) {
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    dropKey(event.code, event.key);
  });

  window.addEventListener('blur', () => {
    for (const code of Object.keys(keysDown)) delete keysDown[code];
  });

  window.addEventListener('mousedown', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.clickX = event.clientX;
    mouse.clickY = event.clientY;
    mouse.button = event.button;
    mouse.clicked = true;
    justPressed.add('MouseClick');
    justPressed.add('Mouse' + event.button);
  });

  window.addEventListener('mouseup', () => {
    mouse.clicked = false;
  });

  window.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
}

// Apakah input sudah diinisialisasi (untuk smoke test dan debug).
export function isInputReady() {
  return initialized;
}

// Apakah tombol sedang ditekan. Terima kode tombol ('KeyW', 'Space',
// 'ShiftLeft', 'Escape') maupun huruf ('w', 'e').
export function isKeyDown(code) {
  if (!code) return false;
  if (keysDown[code]) return true;
  return !!keysDown[String(code).toLowerCase()];
}

// Apakah tombol baru saja ditekan sejak frame terakhir dibersihkan.
// Dipakai untuk aksi sekali tekan: E, F, 1, 2, P, Esc, M, Enter.
export function isPressed(code) {
  if (!code) return false;
  if (justPressed.has(code)) return true;
  return justPressed.has(String(code).toLowerCase());
}

// Alias yang dipakai beberapa modul: nama pendek pemeriksa tekan-baru.
export function wasPressed(code) {
  return isPressed(code);
}

// Ambil klik mouse terakhir (sekali pakai): kembalikan {x, y, button}
// atau null bila tidak ada klik baru sejak pemanggilan terakhir.
export function consumeClick() {
  if (!mouse.clicked && !justPressed.has('MouseClick')) return null;
  justPressed.delete('MouseClick');
  mouse.clicked = false;
  return { x: mouse.clickX, y: mouse.clickY, button: mouse.button };
}

// Apakah ada klik mouse yang belum dikonsumsi (tanpa mengonsumsinya).
export function hasClick() {
  return mouse.clicked || justPressed.has('MouseClick');
}

// Posisi mouse terakhir (tanpa mengonsumsi klik).
export function getMouse() {
  return { x: mouse.x, y: mouse.y, clicked: mouse.clicked };
}

// Bersihkan semua tekan-baru. Dipanggil loop utama di akhir tiap frame.
export function clearPressed() {
  justPressed.clear();
}

// Peta tombol yang sedang ditekan (baca saja, untuk debug).
export const keys = keysDown;

// Keadaan mouse (baca saja, untuk debug).
export const mouseState = mouse;
