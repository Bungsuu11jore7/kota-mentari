// KOTA MENTARI — modul audio.
// Sintesis suara memakai WebAudio, TANPA berkas suara apa pun.
// Suara TIDAK BOLEH mulai sebelum gestur pertama pengguna: konteks audio
// hanya dibuat (dan dilanjutkan) di dalam initAudio(), yang dipanggil modul
// utama dari gestur (klik tombol mulai / tekan tombol). Tombol M membisukan
// semua suara lewat toggleMute() / setMuted().

let audioCtx = null;
let masterGain = null;
let muted = false;
let engineOsc = null;
let engineGain = null;
let engineFilter = null;
let sirenTimer = null;
let sirenHigh = false;
let ambientNodes = null;

// ---------------------------------------------------------------------------
// Penginisialisasi suara pada gestur pertama pengguna.
// Aman dipanggil berulang: panggilan kedua dan seterusnya tidak membuat
// konteks baru, hanya melanjutkan konteks yang tertunda.
// Mengembalikan true bila konteks audio berhasil disiapkan.
// ---------------------------------------------------------------------------
export function initAudio() {
  if (typeof window === 'undefined') return false;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.6;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return true;
}

// Alias penginisialisasi.
export const ensureAudio = initAudio;
export const initSound = initAudio;

// ---------------------------------------------------------------------------
// Pengatur bisu (tombol M). setMuted(true) mematikan semua suara,
// setMuted(false) menghidupkan kembali. toggleMute() membalik keadaan.
// ---------------------------------------------------------------------------
export function setMuted(value) {
  muted = Boolean(value);
  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(muted ? 0 : 0.6, audioCtx.currentTime, 0.02);
  }
  if (muted) {
    stopEngine();
    stopSiren();
  }
  return muted;
}

export function toggleMute() {
  return setMuted(!muted);
}

export function isMuted() {
  return muted;
}

// ---------------------------------------------------------------------------
// Pembantu internal: membuat osilator pendek dengan amplop naik-turun.
// Semua pemutar di bawah memakai pembantu ini, jadi tidak ada suara yang
// berbunyi bila konteks belum diinisialisasi atau sedang bisu.
// ---------------------------------------------------------------------------
function tone(options) {
  if (!audioCtx || !masterGain || muted) return null;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = options.type || 'sine';
  osc.frequency.setValueAtTime(options.frequency || 440, now);
  if (options.slideTo) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, options.slideTo),
      now + (options.duration || 0.2),
    );
  }
  const volume = options.volume == null ? 0.25 : options.volume;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + (options.duration || 0.2),
  );
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + (options.duration || 0.2) + 0.05);
  return osc;
}

function noiseBurst(duration, volume, filterFrequency) {
  if (!audioCtx || !masterGain || muted) return;
  const now = audioCtx.currentTime;
  const length = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFrequency || 1200;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume || 0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(now);
}

// ---------------------------------------------------------------------------
// Suara mesin: dengung kontinyu yang nadanya naik mengikuti kecepatan mobil.
// speedKmh 0 berarti diam (nada rendah), 108 berarti kecepatan penuh.
// Memanggil playEngine(0) atau stopEngine() menghentikan dengung.
// ---------------------------------------------------------------------------
export function playEngine(speedKmh) {
  if (!audioCtx || !masterGain || muted) return;
  const speed = Math.max(0, speedKmh || 0);
  if (speed <= 0.5) {
    stopEngine();
    return;
  }
  if (!engineOsc) {
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 700;
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0.0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);
    engineOsc.start();
  }
  const now = audioCtx.currentTime;
  const frequency = 55 + speed * 1.6;
  engineOsc.frequency.setTargetAtTime(frequency, now, 0.08);
  engineFilter.frequency.setTargetAtTime(500 + speed * 9, now, 0.08);
  engineGain.gain.setTargetAtTime(0.05 + speed * 0.0006, now, 0.1);
}

export function stopEngine() {
  if (engineOsc) {
    try {
      engineOsc.stop();
    } catch (error) {
      // Osilator sudah berhenti; abaikan.
    }
    engineOsc = null;
    engineGain = null;
    engineFilter = null;
  }
}

// Alias suara mesin.
export const updateEngineSound = playEngine;

// ---------------------------------------------------------------------------
// Sirene polisi: dua nada bergantian (tinggi-rendah) selama polisi dekat.
// playSiren() memulai pergantian; stopSiren() menghentikannya.
// ---------------------------------------------------------------------------
export function playSiren() {
  if (!audioCtx || !masterGain || muted) return;
  if (sirenTimer !== null) return;
  sirenHigh = false;
  sirenTimer = window.setInterval(() => {
    if (muted || !audioCtx) return;
    sirenHigh = !sirenHigh;
    tone({
      type: 'sine',
      frequency: sirenHigh ? 880 : 660,
      duration: 0.38,
      volume: 0.12,
    });
  }, 400);
}

export function stopSiren() {
  if (sirenTimer !== null) {
    window.clearInterval(sirenTimer);
    sirenTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Tembakan: letupan bising pendek.
// ---------------------------------------------------------------------------
export function playGunshot() {
  noiseBurst(0.12, 0.5, 2500);
  tone({ type: 'square', frequency: 180, slideTo: 60, duration: 0.1, volume: 0.2 });
}

// Alias tembakan.
export const playShot = playGunshot;
export const playShoot = playGunshot;

// ---------------------------------------------------------------------------
// Pukulan: bunyi gedebuk rendah.
// ---------------------------------------------------------------------------
export function playPunch() {
  noiseBurst(0.09, 0.4, 500);
  tone({ type: 'sine', frequency: 140, slideTo: 55, duration: 0.12, volume: 0.35 });
}

// ---------------------------------------------------------------------------
// Ambil barang: lonceng pendek dua nada naik.
// ---------------------------------------------------------------------------
export function playPickup() {
  tone({ type: 'sine', frequency: 880, duration: 0.09, volume: 0.25 });
  if (!audioCtx) return;
  window.setTimeout(() => {
    tone({ type: 'sine', frequency: 1318, duration: 0.14, volume: 0.25 });
  }, 90);
}

// ---------------------------------------------------------------------------
// Misi selesai: arpeggio fanfare naik (empat nada).
// ---------------------------------------------------------------------------
export function playMissionFanfare() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((frequency, index) => {
    window.setTimeout(() => {
      tone({ type: 'triangle', frequency, duration: 0.22, volume: 0.3 });
    }, index * 130);
  });
}

// Alias fanfare.
export const playFanfare = playMissionFanfare;
export const playMissionComplete = playMissionFanfare;

// ---------------------------------------------------------------------------
// Wanted naik: sengatan pendek bernada turun.
// ---------------------------------------------------------------------------
export function playWantedSting() {
  tone({ type: 'sawtooth', frequency: 220, slideTo: 110, duration: 0.35, volume: 0.3 });
  tone({ type: 'square', frequency: 440, slideTo: 220, duration: 0.25, volume: 0.12 });
}

// Alias sengatan wanted.
export const playWantedUp = playWantedSting;

// ---------------------------------------------------------------------------
// Suasana latar: pad lembut pelan (dua nada rendah berdenyut halus).
// Dimulai hanya setelah initAudio() dipanggil dari gestur pengguna.
// ---------------------------------------------------------------------------
export function playAmbient() {
  if (!audioCtx || !masterGain || muted) return;
  if (ambientNodes) return;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.04;
  gain.connect(masterGain);
  const oscA = audioCtx.createOscillator();
  oscA.type = 'sine';
  oscA.frequency.value = 110;
  const oscB = audioCtx.createOscillator();
  oscB.type = 'sine';
  oscB.frequency.value = 164.81;
  const lfo = audioCtx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.12;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  oscA.connect(gain);
  oscB.connect(gain);
  oscA.start();
  oscB.start();
  lfo.start();
  ambientNodes = { gain, oscA, oscB, lfo };
}

// Alias suasana latar.
export const startAmbient = playAmbient;

export function stopAmbient() {
  if (!ambientNodes) return;
  try {
    ambientNodes.oscA.stop();
    ambientNodes.oscB.stop();
    ambientNodes.lfo.stop();
  } catch (error) {
    // Osilator sudah berhenti; abaikan.
  }
  ambientNodes = null;
}

// ---------------------------------------------------------------------------
// Objek audio tunggal: semua fungsi di atas dalam satu pegangan, untuk
// modul utama yang memilih mengimpor satu nama.
// ---------------------------------------------------------------------------
export const audio = {
  initAudio,
  ensureAudio,
  setMuted,
  toggleMute,
  isMuted,
  playEngine,
  stopEngine,
  updateEngineSound,
  playSiren,
  stopSiren,
  playGunshot,
  playShot,
  playPunch,
  playPickup,
  playMissionFanfare,
  playFanfare,
  playWantedSting,
  playAmbient,
  startAmbient,
  stopAmbient,
};

export default audio;
