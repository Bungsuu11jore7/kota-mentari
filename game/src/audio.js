// KOTA MENTARI — semua bunyi disintesis WebAudio, tanpa file suara.
// Bila WebAudio tidak tersedia, modul ini diam-diam nonaktif:
// game TIDAK BOLEH berhenti hanya karena audio gagal.

let audioCtx = null;
let masterGain = null;
let muted = false;
let musicTimer = null;
let musicStep = 0;
let initialized = false;

// Nada latar pelan: bass rendah + petik jarang, berulang tiap 8 langkah.
const MUSIC_BASS = [55, 55, 65.41, 49];
const MUSIC_PLUCK = [220, 0, 261.63, 0, 329.63, 0, 293.66, 0];

function ensureContext() {
  if (audioCtx) return audioCtx;
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    audioCtx = new AudioCtx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.5;
    masterGain.connect(audioCtx.destination);
  } catch (err) {
    audioCtx = null;
    masterGain = null;
  }
  return audioCtx;
}

// Inisialisasi sekali; aman dipanggil berulang. Mengembalikan true bila audio hidup.
export function initAudio() {
  if (initialized && audioCtx) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return true;
  }
  initialized = true;
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return !!ctx;
}

function tone(freq, duration, type, volume, delay, slideTo) {
  if (!audioCtx || !masterGain || muted) return;
  try {
    const start = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume || 0.2, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  } catch (err) {
    // Bunyi gagal: game tetap jalan.
  }
}

function noiseBurst(duration, volume, delay) {
  if (!audioCtx || !masterGain || muted) return;
  try {
    const start = audioCtx.currentTime + (delay || 0);
    const length = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume || 0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain);
    gain.connect(masterGain);
    source.start(start);
  } catch (err) {
    // Bunyi gagal: game tetap jalan.
  }
}

// Bunyi tembak: letupan pendek + nada turun.
export function playShoot() {
  noiseBurst(0.12, 0.25, 0);
  tone(180, 0.08, 'square', 0.1, 0, 60);
}

// Bunyi pukul: debuk rendah.
export function playPunch() {
  tone(90, 0.15, 'sine', 0.3, 0, 45);
}

// Bunyi ambil paket: dua nada naik.
export function playPickup() {
  tone(660, 0.12, 'sine', 0.2, 0, null);
  tone(880, 0.18, 'sine', 0.2, 0.09, null);
}

// Bunyi naik wanted: sirene dua nada, dua kali.
export function playWantedUp() {
  tone(520, 0.16, 'square', 0.1, 0, null);
  tone(780, 0.16, 'square', 0.1, 0.16, null);
  tone(520, 0.16, 'square', 0.1, 0.32, null);
}

// Bunyi TAMAT: arpeggio naik.
export function playWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => tone(freq, 0.22, 'sine', 0.2, i * 0.12, null));
}

// Bunyi BUSTED: tiga nada turun.
export function playBusted() {
  const notes = [329.63, 261.63, 196];
  notes.forEach((freq, i) => tone(freq, 0.25, 'triangle', 0.22, i * 0.18, null));
}

function scheduleMusicStep() {
  if (!audioCtx || muted) return;
  const bass = MUSIC_BASS[musicStep % MUSIC_BASS.length];
  const pluck = MUSIC_PLUCK[musicStep % MUSIC_PLUCK.length];
  tone(bass, 0.45, 'sine', 0.06, 0, null);
  if (pluck) tone(pluck, 0.3, 'triangle', 0.04, 0, null);
  musicStep += 1;
}

// Musik latar pelan, berulang. Aman dipanggil berulang.
export function startMusic() {
  if (musicTimer !== null) return;
  if (!initAudio()) return;
  if (typeof window === 'undefined') return;
  musicTimer = window.setInterval(scheduleMusicStep, 500);
}

export function stopMusic() {
  if (musicTimer === null) return;
  if (typeof window !== 'undefined') {
    window.clearInterval(musicTimer);
  }
  musicTimer = null;
}

// Mute (tombol M): mematikan semua bunyi.
export function setMute(value) {
  muted = !!value;
  if (masterGain && audioCtx) {
    try {
      masterGain.gain.value = muted ? 0 : 0.5;
    } catch (err) {
      // Abaikan: status mute tetap tersimpan.
    }
  }
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  setMute(!muted);
  return muted;
}
