// KOTA MENTARI — modul input: keyboard dan mouse.
// Satu-satunya sumber status tombol untuk pemain, tempur, dan loop utama.
// Tombol: WASD jalan/mobil, Shift lari, E masuk/keluar/curi mobil,
// Space handbrake, F pukul, klik mouse tembak, 1/2 ganti senjata,
// P/Esc jeda, M bisu, Enter mulai.

const keysDown = new Map();
const keysPressed = new Set();
const mouseState = {
  x: 0,
  y: 0,
  button: -1,
  down: false,
  clicked: false,
  justClicked: false,
};
const lastClick = { x: 0, y: 0, button: 0, time: 0 };

let inputInitialized = false;

export const inputState = {
  keys: keysDown,
  pressed: keysPressed,
  mouse: mouseState,
  lastClick,
  get initialized() {
    return inputInitialized;
  },
};

function noteKeyDown(event) {
  const code = event.code || event.key || '';
  if (!code) return;
  if (code === 'Space' || code.indexOf('Arrow') === 0) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }
  if (!event.repeat) keysPressed.add(code);
  keysDown.set(code, true);
}

function noteKeyUp(event) {
  const code = event.code || event.key || '';
  if (!code) return;
  keysDown.delete(code);
}

function noteMouseDown(event) {
  mouseState.x = event.clientX || 0;
  mouseState.y = event.clientY || 0;
  mouseState.button = typeof event.button === 'number' ? event.button : 0;
  mouseState.down = true;
  mouseState.clicked = true;
  mouseState.justClicked = true;
  lastClick.x = mouseState.x;
  lastClick.y = mouseState.y;
  lastClick.button = mouseState.button;
  lastClick.time = Date.now();
}

function noteMouseUp(event) {
  mouseState.down = false;
  if (typeof event.button === 'number') mouseState.button = event.button;
}

function noteMouseMove(event) {
  mouseState.x = event.clientX || 0;
  mouseState.y = event.clientY || 0;
}

export function initInput() {
  if (inputInitialized) return inputState;
  inputInitialized = true;
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', noteKeyDown);
    window.addEventListener('keyup', noteKeyUp);
    window.addEventListener('mousedown', noteMouseDown);
    window.addEventListener('mouseup', noteMouseUp);
    window.addEventListener('mousemove', noteMouseMove);
    window.addEventListener('blur', () => {
      keysDown.clear();
      mouseState.down = false;
    });
  }
  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', noteKeyDown);
    document.addEventListener('keyup', noteKeyUp);
  }
  return inputState;
}

export function isInputInitialized() {
  return inputInitialized;
}

export function isDown(code) {
  return keysDown.has(code);
}

export function isPressed(code) {
  return keysPressed.has(code);
}

export function getLastClick() {
  return lastClick;
}

export function isMouseClicked() {
  return mouseState.justClicked;
}

export function getMouse() {
  return mouseState;
}

export function endFrameInput() {
  keysPressed.clear();
  mouseState.justClicked = false;
  mouseState.clicked = false;
}
