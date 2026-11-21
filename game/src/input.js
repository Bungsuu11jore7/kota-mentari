// KOTA MENTARI — input: keyboard dan mouse.
// Satu-satunya modul yang menyentuh pendengar DOM. initInput dipanggil
// tepat satu kali oleh modul utama (dijaga flag di sini dan di sana).
const keysDown = new Set();
const keysPressed = new Set();
let lastClick = null;
let clickQueue = null;
let mouseX = 0;
let mouseY = 0;
let initialized = false;

export function initInput() {
  if (initialized) return true;
  initialized = true;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) {
      try { e.preventDefault(); } catch (err) { /* abaikan */ }
    }
    if (!e.repeat && !keysDown.has(e.code)) keysPressed.add(e.code);
    keysDown.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    keysDown.delete(e.code);
  });
  window.addEventListener('blur', () => {
    keysDown.clear();
  });
  const target = document.getElementById('game-canvas') || window;
  target.addEventListener('mousedown', (e) => {
    mouseX = e.clientX || 0;
    mouseY = e.clientY || 0;
    const click = { x: mouseX, y: mouseY, button: e.button || 0, time: Date.now() };
    lastClick = click;
    clickQueue = click;
  });
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX || 0;
    mouseY = e.clientY || 0;
  });
  window.addEventListener('contextmenu', (e) => {
    try { e.preventDefault(); } catch (err) { /* abaikan */ }
  });
  return true;
}

export function isKeyDown(code) {
  return keysDown.has(code);
}

export function isKeyPressed(code) {
  return keysPressed.has(code);
}

// Dipanggil modul utama di akhir tiap frame: tombol "baru ditekan" hanya
// berlaku satu frame.
export function clearPressed() {
  keysPressed.clear();
}

export function getLastClick() {
  return lastClick;
}

// Mengambil satu klik mouse yang belum dipakai (tembak), lalu mengosongkan
// antrean supaya satu klik tidak menembak dua kali.
export function consumeClick() {
  const click = clickQueue;
  clickQueue = null;
  return click;
}

export function getMouse() {
  return { x: mouseX, y: mouseY };
}

export function isInitialized() {
  return initialized;
}
