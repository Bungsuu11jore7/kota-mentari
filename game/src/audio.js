// KOTA MENTARI — audio sintesis WebAudio, tanpa berkas suara.
// Semua bunyi dibuat dari osilator + noise di sini. AudioContext HANYA
// dibuat saat init() dipanggil dari gestur pertama pengguna (klik / tombol);
// sebelum itu tidak ada suara apa pun. Mute lewat tombol M.

// Pabrik audio. Satu instance dipakai loop utama.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenTimer = null;
  let sirenOsc = null;
  let sirenGain = null;
  let ambientNodes = null;

  // Dipanggil sekali pada gestur pertama pengguna. Aman dipanggil berulang.
  function init() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    startAmbient();
    return true;
  }

  function ready() {
    return !!ctx && !muted && ctx.state === "running";
  }

  // Suasana latar lembut: pad dua nada rendah + LFO pelan.
  function startAmbient() {
    if (!ctx || ambientNodes) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.value = 110;
    const oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.value = 164.81;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(master);
    oscA.start();
    oscB.start();
    lfo.start();
    ambientNodes = { gain, oscA, oscB, lfo };
  }

  // Nada pendek (osilator + envelope).
  function blip(type, freqStart, freqEnd, dur, vol) {
    if (!ready()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Desis pendek (noise) untuk tembakan / pukulan.
  function noiseBurst(dur, vol, filterFreq) {
    if (!ready()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  // Suara mesin: nada naik dengan kecepatan (0..1). Panggil tiap frame.
  function setEngine(speed01, driving) {
    if (!ctx) return;
    const on = driving && !muted && ctx.state === "running";
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = "sawtooth";
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = "lowpass";
      engineFilter.frequency.value = 900;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    if (!on) {
      if (engineGain) engineGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.1);
      return;
    }
    const s = Math.max(0, Math.min(1, speed01));
    engineOsc.frequency.setTargetAtTime(55 + s * 190, ctx.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(0.05 + s * 0.09, ctx.currentTime, 0.08);
  }

  // Sirene dua nada (polisi). Berhenti lewat stopSiren().
  function startSiren() {
    if (!ctx || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = "square";
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = muted ? 0 : 0.045;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    let high = false;
    sirenTimer = window.setInterval(() => {
      if (!sirenOsc) return;
      high = !high;
      sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, ctx.currentTime, 0.05);
    }, 450);
  }

  function stopSiren() {
    if (sirenTimer) {
      window.clearInterval(sirenTimer);
      sirenTimer = null;
    }
    if (sirenOsc) {
      try { sirenOsc.stop(); } catch (err) { /* sudah berhenti */ }
      sirenOsc.disconnect();
      sirenOsc = null;
    }
    if (sirenGain) {
      sirenGain.disconnect();
      sirenGain = null;
    }
  }

  // Tembakan: dentum noise + nada turun cepat.
  function shot() {
    noiseBurst(0.16, 0.5, 1800);
    blip("square", 320, 60, 0.14, 0.25);
  }

  // Pukulan: thud pendek.
  function punch() {
    noiseBurst(0.09, 0.4, 500);
    blip("sine", 140, 55, 0.12, 0.4);
  }

  // Ambil barang / paket: dua nada naik.
  function pickup() {
    blip("sine", 660, 660, 0.09, 0.3);
    window.setTimeout(() => blip("sine", 880, 880, 0.12, 0.3), 90);
  }

  // Fanfare misi selesai: arpeggio naik.
  function fanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      window.setTimeout(() => blip("triangle", f, f, 0.22, 0.35), i * 130);
    });
  }

  // Sengatan wanted naik: nada peringatan dua kali.
  function wantedUp() {
    blip("sawtooth", 440, 440, 0.12, 0.25);
    window.setTimeout(() => blip("sawtooth", 440, 440, 0.12, 0.25), 160);
  }

  // Bunyi TAMAT: fanfare panjang. Bunyi BUSTED: nada turun.
  function complete() {
    fanfare();
  }

  function busted() {
    blip("sawtooth", 330, 110, 0.7, 0.3);
  }

  // Mute (tombol M). Mengembalikan status mute baru.
  function setMuted(m) {
    muted = !!m;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
    if (muted) stopSiren();
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  function isMuted() {
    return muted;
  }

  return {
    init,
    setEngine,
    startSiren,
    stopSiren,
    shot,
    punch,
    pickup,
    fanfare,
    wantedUp,
    complete,
    busted,
    setMuted,
    toggleMute,
    isMuted,
  };
}
