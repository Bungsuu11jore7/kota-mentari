// KOTA MENTARI — audio.js
// Sintesis suara WebAudio tanpa berkas suara apa pun.
// Suara TIDAK PERNAH mulai sebelum gestur pertama pengguna: init() hanya
// dipanggil dari gestur (klik / tombol), dan semua pemutar diam bila
// audio belum di-init atau sedang bisu (tombol M).

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    engineFilter: null,
    sirenTimer: null,
    sirenOsc: null,
    sirenGain: null,
    ambientNodes: null,

    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") void this.ctx.resume();
        return true;
      }
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return false;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        return true;
      } catch (err) {
        return false;
      }
    },

    setMuted(muted) {
      this.muted = !!muted;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
      }
    },

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    },

    isMuted() {
      return this.muted;
    },

    ready() {
      return !!this.ctx && !this.muted && this.ctx.state === "running";
    },

    tone(freq, dur, type, vol, slideTo) {
      if (!this.ready()) return null;
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol || 0.2, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      return osc;
    },

    noise(dur, vol, filterFreq) {
      if (!this.ready()) return;
      const t0 = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = filterFreq || 1200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.3, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t0);
    },

    // Suara mesin: nada naik mengikuti kecepatan (speed01 = 0..1).
    startEngine() {
      if (!this.ctx || this.engineOsc) return;
      try {
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = "sawtooth";
        this.engineOsc.frequency.value = 55;
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = "lowpass";
        this.engineFilter.frequency.value = 420;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineOsc.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.master);
        this.engineOsc.start();
      } catch (err) {
        this.engineOsc = null;
      }
    },

    updateEngine(speed01) {
      if (!this.engineOsc || !this.ctx) return;
      const s = Math.max(0, Math.min(1, speed01 || 0));
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(55 + s * 165, t, 0.08);
      this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.03 + s * 0.06, t, 0.08);
    },

    stopEngine() {
      if (!this.engineOsc) return;
      try { this.engineOsc.stop(); } catch (err) { /* sudah berhenti */ }
      this.engineOsc = null;
      this.engineGain = null;
      this.engineFilter = null;
    },

    // Sirene dua nada (naik-turun) selama wanted > 0.
    startSiren() {
      if (!this.ctx || this.sirenOsc) return;
      try {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = "triangle";
        this.sirenOsc.frequency.value = 700;
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
        this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : 0.05, this.ctx.currentTime, 0.1);
        let high = false;
        this.sirenTimer = setInterval(() => {
          if (!this.sirenOsc || !this.ctx) return;
          high = !high;
          this.sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, this.ctx.currentTime, 0.05);
        }, 450);
      } catch (err) {
        this.sirenOsc = null;
      }
    },

    stopSiren() {
      if (this.sirenTimer) { clearInterval(this.sirenTimer); this.sirenTimer = null; }
      if (!this.sirenOsc) return;
      try { this.sirenOsc.stop(); } catch (err) { /* sudah berhenti */ }
      this.sirenOsc = null;
      this.sirenGain = null;
    },

    playShoot() {
      this.noise(0.14, 0.5, 2600);
      this.tone(180, 0.1, "square", 0.22, 60);
    },

    playPunch() {
      this.noise(0.1, 0.4, 500);
      this.tone(120, 0.09, "sine", 0.3, 55);
    },

    playPickup() {
      this.tone(660, 0.1, "sine", 0.22);
      setTimeout(() => this.tone(990, 0.14, "sine", 0.22), 90);
    },

    playMissionComplete() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        setTimeout(() => this.tone(freq, 0.22, "triangle", 0.25), i * 130);
      });
    },

    playWantedUp() {
      this.tone(220, 0.18, "sawtooth", 0.25, 330);
      setTimeout(() => this.tone(330, 0.18, "sawtooth", 0.25, 220), 160);
    },

    playBusted() {
      this.tone(392, 0.3, "sawtooth", 0.25, 196);
      setTimeout(() => this.tone(196, 0.5, "sawtooth", 0.25, 98), 280);
    },

    // Suasana latar lembut: pad senja pelan (dua osilator detune + LFO).
    startAmbient() {
      if (!this.ctx || this.ambientNodes) return;
      try {
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        gain.connect(this.master);
        gain.gain.setTargetAtTime(this.muted ? 0 : 0.035, this.ctx.currentTime, 1.5);
        const oscA = this.ctx.createOscillator();
        oscA.type = "sine";
        oscA.frequency.value = 110;
        const oscB = this.ctx.createOscillator();
        oscB.type = "sine";
        oscB.frequency.value = 164.8;
        const lfo = this.ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.08;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.012;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        oscA.connect(gain);
        oscB.connect(gain);
        oscA.start();
        oscB.start();
        lfo.start();
        this.ambientNodes = { gain, oscA, oscB, lfo };
      } catch (err) {
        this.ambientNodes = null;
      }
    },

    stopAmbient() {
      if (!this.ambientNodes) return;
      const nodes = this.ambientNodes;
      this.ambientNodes = null;
      try {
        nodes.oscA.stop();
        nodes.oscB.stop();
        nodes.lfo.stop();
      } catch (err) { /* sudah berhenti */ }
    },
  };
  return audio;
}

// ---- Singleton module-level (dipakai loop utama tanpa instance) ----
// Loop utama memanggil fungsi audio module-level (initAudio, playShoot,
// dst). Tanpa ini, pemanggilan audio diam-diam no-op karena createAudio
// hanya pabrik yang hasilnya dibuang. Satu instance bersama; init() tetap
// hanya jalan dari gestur pengguna (startGame).
const sharedAudio = createAudio();
export function initAudio() { return sharedAudio.init(); }
export function playShoot() { sharedAudio.playShoot(); }
export function playPunch() { sharedAudio.playPunch(); }
export function playPickup() { sharedAudio.playPickup(); }
export function playMissionComplete() { sharedAudio.playMissionComplete(); }
export function playWantedUp() { sharedAudio.playWantedUp(); }
export function playBusted() { sharedAudio.playBusted(); }
export function toggleMute() { return sharedAudio.toggleMute(); }
