// KOTA MENTARI — input.js
// Menangkap keyboard + mouse untuk game. Dipanggil SEKALI oleh main.js.
// Modul ini TIDAK menggerakkan pemain langsung; loop utama membaca status
// tombol tiap frame lewat getInputState().

let inputInitialized = false;
let inputHandlers = {};
const heldKeys = new Set();
const pressedKeys = new Set();
let mouseHeld = false;
let mouseClickedFlag = false;
let mouseX = 0;
let mouseY = 0;

const PREVENT_DEFAULT_CODES = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
]);

function onKeyDown(event) {
  if (!event || !event.code) return;
  if (PREVENT_DEFAULT_CODES.has(event.code)) {
    event.preventDefault();
  }
  heldKeys.add(event.code);
  if (!event.repeat) {
    pressedKeys.add(event.code);
  }
  if (event.code === 'Enter' && inputHandlers.onStart) {
    const allow =
      typeof inputHandlers.isStartScreen !== 'function' ||
      inputHandlers.isStartScreen();
    if (allow) {
      inputHandlers.onStart();
    }
  }
}

function onKeyUp(event) {
  if (!event || !event.code) return;
  heldKeys.delete(event.code);
}

function onMouseDown(event) {
  mouseHeld = true;
  mouseClickedFlag = true;
  if (event) {
    mouseX = event.clientX || 0;
    mouseY = event.clientY || 0;
  }
}

function onMouseUp() {
  mouseHeld = false;
}

function onBlur() {
  heldKeys.clear();
  mouseHeld = false;
}

function onContextMenu(event) {
  if (event) event.preventDefault();
}

export function initInput(handlers) {
  if (inputInitialized) return getInputState();
  inputInitialized = true;
  inputHandlers = handlers || {};
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('contextmenu', onContextMenu);
  }
  return getInputState();
}

export function isInputInitialized() {
  return inputInitialized;
}

export function isKeyDown(code) {
  return heldKeys.has(code);
}

export function wasPressed(code) {
  return pressedKeys.has(code);
}

export function getInputState() {
  return {
    keys: heldKeys,
    pressed: pressedKeys,
    mouseDown: mouseHeld,
    mouseClicked: mouseClickedFlag,
    mouseX,
    mouseY,
    forward: heldKeys.has('KeyW') || heldKeys.has('ArrowUp'),
    back: heldKeys.has('KeyS') || heldKeys.has('ArrowDown'),
    left: heldKeys.has('KeyA') || heldKeys.has('ArrowLeft'),
    right: heldKeys.has('KeyD') || heldKeys.has('ArrowRight'),
    run: heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight'),
    handbrake: heldKeys.has('Space'),
    interact: pressedKeys.has('KeyE'),
    punch: pressedKeys.has('KeyF'),
    pause: pressedKeys.has('KeyP') || pressedKeys.has('Escape'),
    mute: pressedKeys.has('KeyM'),
    weaponFists: pressedKeys.has('Digit1'),
    weaponPistol: pressedKeys.has('Digit2'),
    enter: pressedKeys.has('Enter'),
  };
}

export function clearFrameInput() {
  pressedKeys.clear();
  mouseClickedFlag = false;
}
