// Input keyboard + mouse untuk Kota Mentari.
// Tanpa pointer lock: kamera third-person follow otomatis, mouse hanya untuk membidik.
export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, clicked: false };
  const edges = new Set();

  // Edge action yang dipetakan dari satu penekanan tombol.
  const ACTION_KEYS = {
    Enter: 'confirm',
    KeyE: 'enterCar',
    KeyF: 'punch',
    Digit1: 'weapon1',
    Digit2: 'weapon2',
    KeyP: 'pause',
    Escape: 'pause',
    KeyM: 'mute',
  };

  function onKeyDown(event) {
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    if (!event.repeat) {
      const action = ACTION_KEYS[event.code];
      if (action) edges.add(action);
    }
    keys.add(event.code);
    keys.add(event.key ? event.key.toLowerCase() : '');
  }

  function onKeyUp(event) {
    keys.delete(event.code);
    keys.delete(event.key ? event.key.toLowerCase() : '');
  }

  function updateMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.ndcX = (mouse.x / Math.max(1, rect.width)) * 2 - 1;
    mouse.ndcY = -(mouse.y / Math.max(1, rect.height)) * 2 + 1;
  }

  function onMouseDown(event) {
    updateMouse(event);
    mouse.clicked = true;
  }

  function onMouseMove(event) {
    updateMouse(event);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // Tombol yang dilepas saat tab tersembunyi tidak mengirim keyup: lepas semua saat blur.
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  // Ambil semua aksi sekali-tekan sejak pemanggilan terakhir, lalu kosongkan.
  // Dipanggil sekali per frame oleh main loop, hasilnya dibagikan ke semua sistem.
  function takeActions() {
    const actions = {
      confirm: edges.has('confirm'),
      enterCar: edges.has('enterCar'),
      punch: edges.has('punch'),
      weapon1: edges.has('weapon1'),
      weapon2: edges.has('weapon2'),
      pause: edges.has('pause'),
      mute: edges.has('mute'),
      shoot: mouse.clicked,
    };
    edges.clear();
    mouse.clicked = false;
    return actions;
  }

  return { keys, mouse, takeActions };
}
