// KOTA MENTARI — audio disintesis WebAudio, tanpa berkas suara.
// Semua bunyi dibuat dari osilator dan noise di sini: mesin, sirene,
// tembakan, pukulan, ambil barang, fanfare, sengatan wanted, latar lembut.
// Suara TIDAK PERNAH mulai sebelum gestur pengguna: AudioContext hanya
// dibuat saat init() dipanggil dari handler gestur (klik / tombol).
// Tombol M memanggil toggleMute().

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let unlocked = false;
  let engine = null;
  let siren = null;
  let ambient = null;

  // Buat konteks HANYA dari gestur pengguna. Dipanggil sekali; panggilan
  // berikutnya hanya melanjutkan konteks yang tertunda.
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      unlocked = true;
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      unlocked = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  function ready() {
    return unlocked && ctx !== null && ctx.state === 'running';
  }

  // Satu nada sederhana dengan selubung naik-turun.
  function tone(freq, dur, opts) {
    if (!ready()) return;
    const o = opts || {};
    const type = o.type || 'sine';
    const vol = o.volume == null ? 0.2 : o.volume;
    const when = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), when + dur);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(vol, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  // Ledakan noise pendek melalui filter (tembakan, pukulan, langkah keras).
  function noiseBurst(dur, opts) {
    if (!ready()) return;
    const o = opts || {};
    const vol = o.volume == null ? 0.3 : o.volume;
    const when = ctx.currentTime + (o.delay || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filterType || 'lowpass';
    filter.frequency.value = o.filterFreq || 1200;
    filter.Q.value = o.q || 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(when);
    src.stop(when + dur + 0.05);
  }

  function setMuted(value) {
    muted = !!value;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  // Mesin: dua osilator kontinyu lewat lowpass; nadanya naik dengan kecepatan.
  function startEngine() {
    if (!ready() || engine) return;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.value = 55;
    osc2.frequency.value = 28;
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    gain.gain.value = 0.0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc1.start();
    osc2.start();
    engine = { osc1, osc2, gain };
    setEngineSpeed(0);
  }

  function setEngineSpeed(kmh) {
    if (!engine || !ready()) return;
    const speed = Math.max(0, Math.min(160, kmh || 0));
    const freq = 55 + speed * 1.1;
    const vol = speed <= 1 ? 0.0 : 0.02 + (speed / 160) * 0.06;
    engine.osc1.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
    engine.osc2.frequency.setTargetAtTime(freq / 2, ctx.currentTime, 0.08);
    engine.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
  }

  function stopEngine() {
    if (!engine) return;
    try {
      engine.osc1.stop();
      engine.osc2.stop();
    } catch (err) { /* sudah berhenti */ }
    engine = null;
  }

  // Sirene dua nada (700 / 950 Hz) lewat LFO gelombang kotak.
  function startSiren() {
    if (!ready() || siren) return;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 825;
    lfo.type = 'square';
    lfo.frequency.value = 0.55;
    lfoGain.gain.value = 125;
    gain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    lfo.start();
    siren = { osc, lfo, gain };
  }

  function stopSiren() {
    if (!siren) return;
    try {
      siren.osc.stop();
      siren.lfo.stop();
    } catch (err) { /* sudah berhenti */ }
    siren = null;
  }

  // Latar lembut: pad dua nada detuned + LFO pelan pada gain.
  function startAmbient() {
    if (!ready() || ambient) return;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();
    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.value = 110;
    osc2.frequency.value = 164.81;
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.015;
    gain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(master);
    osc1.start();
    osc2.start();
    lfo.start();
    ambient = { osc1, osc2, lfo };
  }

  function stopAmbient() {
    if (!ambient) return;
    try {
      ambient.osc1.stop();
      ambient.osc2.stop();
      ambient.lfo.stop();
    } catch (err) { /* sudah berhenti */ }
    ambient = null;
  }

  return {
    init,
    isReady: ready,
    isMuted: () => muted,
    setMuted,
    toggleMute,

    // Suara sekali jalan (no-op sebelum gestur pertama).
    playClick() { tone(1000, 0.04, { type: 'square', volume: 0.08 }); },
    playShot() {
      noiseBurst(0.12, { volume: 0.4, filterType: 'highpass', filterFreq: 900 });
      tone(90, 0.14, { type: 'sine', volume: 0.35, slideTo: 45 });
    },
    playPunch() {
      noiseBurst(0.08, { volume: 0.3, filterType: 'lowpass', filterFreq: 400 });
      tone(120, 0.1, { type: 'sine', volume: 0.25, slideTo: 70 });
    },
    playPickup() {
      tone(880, 0.09, { type: 'sine', volume: 0.2 });
      tone(1318.5, 0.14, { type: 'sine', volume: 0.2, delay: 0.09 });
    },
    playFanfare() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone(f, 0.32, { type: 'triangle', volume: 0.22, delay: i * 0.12 }));
    },
    playWantedUp() {
      tone(220, 0.5, { type: 'sawtooth', volume: 0.16, slideTo: 110 });
      tone(233.08, 0.5, { type: 'sawtooth', volume: 0.1, slideTo: 116.5 });
    },
    playBusted() {
      const notes = [392, 311.13, 233.08, 155.56];
      notes.forEach((f, i) => tone(f, 0.3, { type: 'triangle', volume: 0.2, delay: i * 0.16 }));
    },
    playComplete() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => tone(f, 0.4, { type: 'triangle', volume: 0.2, delay: i * 0.11 }));
    },

    // Suara kontinyu.
    startEngine,
    setEngineSpeed,
    stopEngine,
    startSiren,
    stopSiren,
    startAmbient,
    stopAmbient,
  };
}
