// Semua suara sintetis WebAudio (oscillator + noise), tanpa file audio.
// AudioContext dibuat / di-resume pada interaksi pertama pengguna.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let musicTimer = 0;
  let musicStep = 0;
  let muted = false;
  let unlocked = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Mesin: sawtooth + lowpass, gain awal 0.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 500;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Sirene: sine dua nada, gain awal 0.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    unlocked = true;
    return true;
  }

  // Buka kunci audio pada interaksi pertama (gesture pengguna).
  window.addEventListener('pointerdown', ensure, { once: false });
  window.addEventListener('keydown', ensure, { once: false });

  function noiseBuffer(duration) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, duration, type, volume, when = 0) {
    if (!ctx || !unlocked) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ctx || !unlocked) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  // speed01: 0..1 — pitch + volume mesin mengikuti kecepatan mobil.
  function engine(speed01) {
    if (!ctx || !unlocked) return;
    const s = Math.max(0, Math.min(1, speed01 || 0));
    const now = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(55 + s * 170, now, 0.08);
    engineFilter.frequency.setTargetAtTime(400 + s * 900, now, 0.08);
    engineGain.gain.setTargetAtTime(s <= 0.01 ? 0 : 0.035 + s * 0.05, now, 0.1);
  }

  function siren(on) {
    if (!ctx || !unlocked) return;
    if (on && !sirenTimer) {
      sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.05);
      sirenTimer = window.setInterval(() => {
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 950 : 700;
      }, 380);
    } else if (!on && sirenTimer) {
      window.clearInterval(sirenTimer);
      sirenTimer = 0;
      sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    }
  }

  function shot() {
    noiseBurst(0.16, 0.5, 2600);
    blip(160, 0.08, 'square', 0.12);
  }

  function punch() {
    noiseBurst(0.09, 0.35, 500);
    blip(110, 0.1, 'sine', 0.25);
  }

  function pickup() {
    blip(660, 0.09, 'sine', 0.22);
    blip(990, 0.14, 'sine', 0.22, 0.09);
  }

  function jingle() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => blip(freq, 0.22, 'triangle', 0.22, i * 0.13));
  }

  function click() {
    ensure();
    blip(880, 0.05, 'square', 0.12);
  }

  function setMuted(value) {
    muted = !!value;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
  }

  // Musik: bassline loop sederhana (Am – F – C – G), triangle + ketukan noise pelan.
  function startMusic() {
    if (!ensure()) return;
    if (musicTimer) return;
    // Pola bass (Hz), 8 langkah per bar, 4 bar.
    const bass = [
      55, 0, 55, 0, 65.41, 0, 55, 0,
      43.65, 0, 43.65, 0, 55, 0, 49, 0,
      65.41, 0, 65.41, 0, 65.41, 0, 82.41, 0,
      49, 0, 49, 0, 55, 0, 49, 0,
    ];
    musicTimer = window.setInterval(() => {
      if (!ctx || !unlocked || muted) {
        musicStep = (musicStep + 1) % bass.length;
        return;
      }
      const freq = bass[musicStep];
      if (freq > 0) blip(freq, 0.22, 'triangle', 0.16);
      if (musicStep % 2 === 0) noiseBurst(0.03, 0.05, 6000);
      musicStep = (musicStep + 1) % bass.length;
    }, 230);
  }

  return { engine, siren, shot, punch, pickup, jingle, click, setMuted, startMusic };
}
