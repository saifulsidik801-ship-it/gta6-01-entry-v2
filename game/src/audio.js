// MARISOL BAY - procedural WebAudio: engine, siren, one-shots and a quiet
// lookahead music scheduler. No assets, no network; every call is safe.

const MUSIC_GAIN = 0.12;
const MUSIC_LOOKAHEAD = 0.5;
const MUSIC_TICK_MS = 200;

const MUSIC_MODES = {
  day: {
    step: 0.46,
    bass: [55.0, 82.41, 65.41, 73.42, 55.0, 82.41, 98.0, 73.42],
    pad: [
      [164.81, 207.65, 246.94],
      [196.0, 246.94, 293.66],
      [130.81, 164.81, 196.0],
      [146.83, 185.0, 220.0],
    ],
    padEvery: 4,
    padLevel: 0.5,
    bassLevel: 0.55,
  },
  dusk: {
    step: 0.6,
    bass: [49.0, 73.42, 58.27, 65.41, 49.0, 73.42, 87.31, 65.41],
    pad: [
      [146.83, 185.0, 220.0],
      [174.61, 220.0, 261.63],
      [116.54, 146.83, 174.61],
      [130.81, 164.81, 196.0],
    ],
    padEvery: 4,
    padLevel: 0.45,
    bassLevel: 0.5,
  },
  night: {
    step: 0.78,
    bass: [43.65, 65.41, 51.91, 58.27, 43.65, 0, 65.41, 0],
    pad: [
      [130.81, 155.56, 196.0],
      [146.83, 174.61, 220.0],
      [116.54, 138.59, 174.61],
      [130.81, 155.56, 196.0],
    ],
    padEvery: 8,
    padLevel: 0.34,
    bassLevel: 0.42,
  },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.muted = false;

    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engineGain = null;
    this.sirenGain = null;

    this._nodesBuilt = false;

    this._musicMode = null;
    this._musicTimer = null;
    this._musicStep = 0;
    this._musicNext = 0;

    this._engineOsc = null;
    this._engineFilter = null;
    this._engineLevel = 0;

    this._sirenOn = false;
    this._sirenTimer = null;
    this._sirenOsc = null;
    this._sirenHigh = false;

    this._noiseBuf = null;
  }

  // ------------------------------------------------------------------ setup
  arm() {
    try {
      if (this.ctx) return true;
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      return true;
    } catch (err) {
      this.ctx = null;
      this.master = null;
      return false;
    }
  }

  init() {
    try {
      if (!this.ctx && !this.arm()) return false;
      const ctx = this.ctx;
      if (!ctx) return false;
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      this._buildNodes();
      return !!this.master;
    } catch (err) {
      return false;
    }
  }

  _buildNodes() {
    const ctx = this.ctx;
    if (!ctx || this._nodesBuilt) return;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
    }
    this.master.gain.value = this.muted ? 0 : this.volume;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = MUSIC_GAIN;
    this.musicGain.connect(this.master);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.master);

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.sfxGain);

    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.sfxGain);

    this._nodesBuilt = true;
  }

  _applyVolume() {
    if (!this.master || !this.ctx) return;
    const v = this.muted ? 0 : this.volume;
    try {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    } catch (err) {
      this.master.gain.value = v;
    }
  }

  setVolume(v) {
    let n = Number(v);
    if (!Number.isFinite(n)) n = this.volume;
    if (n < 0) n = 0;
    if (n > 1) n = 1;
    this.volume = n;
    this._applyVolume();
    return this.volume;
  }

  toggleMute() {
    this.muted = !this.muted;
    this._applyVolume();
    return this.muted;
  }

  // ------------------------------------------------------------------ music
  setMusic(mode) {
    const key = MUSIC_MODES[mode] ? mode : 'day';
    if (this._musicMode === key && this._musicTimer) return;
    this._musicMode = key;
    if (!this.ctx || !this.musicGain) return;
    this._stopMusic();
    this._startMusic();
  }

  _startMusic() {
    if (!this.ctx || !this.musicGain) return;
    this._musicStep = 0;
    this._musicNext = this.ctx.currentTime + 0.08;
    this._musicTimer = setInterval(() => this._scheduleMusic(), MUSIC_TICK_MS);
  }

  _stopMusic() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  }

  _scheduleMusic() {
    if (!this.ctx || !this.musicGain) {
      this._stopMusic();
      return;
    }
    const spec = MUSIC_MODES[this._musicMode] || MUSIC_MODES.day;
    const now = this.ctx.currentTime;
    const horizon = now + MUSIC_LOOKAHEAD;
    let guard = 0;
    while (this._musicNext < horizon && guard < 8) {
      const when = Math.max(this._musicNext, now + 0.02);
      this._scheduleStep(spec, this._musicStep, when);
      this._musicStep += 1;
      this._musicNext = when + spec.step;
      guard += 1;
    }
  }

  _scheduleStep(spec, step, when) {
    const idx = step % spec.bass.length;
    const bass = spec.bass[idx];
    if (bass > 0) {
      this._tone(this.musicGain, bass, when, spec.step * 1.6, 0.42 * spec.bassLevel, 'triangle');
    }
    if (spec.padEvery > 0 && step % spec.padEvery === 0) {
      const chord = spec.pad[Math.floor(step / spec.padEvery) % spec.pad.length];
      const dur = spec.step * spec.padEvery * 0.95;
      for (let i = 0; i < chord.length; i++) {
        this._tone(this.musicGain, chord[i], when, dur, 0.13 * spec.padLevel, 'sine');
      }
    }
  }

  _tone(dest, freq, when, dur, peak, type) {
    const ctx = this.ctx;
    if (!ctx || !dest) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, when);
    const p = Math.max(0.0002, peak);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(p, when + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.08, dur));
    osc.connect(gain);
    gain.connect(dest);
    osc.start(when);
    osc.stop(when + Math.max(0.08, dur) + 0.03);
  }

  // ----------------------------------------------------------------- engine
  setEngine(level) {
    try {
      let n = Number(level);
      if (!Number.isFinite(n)) n = 0;
      if (n < 0) n = 0;
      if (n > 1) n = 1;
      this._engineLevel = n;
      if (!this.ctx || !this.engineGain) return;
      if (!this._engineOsc) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        filter.type = 'lowpass';
        filter.frequency.value = 520;
        filter.Q.value = 4;
        osc.connect(filter);
        filter.connect(this.engineGain);
        osc.frequency.value = 55 + n * 170;
        osc.start();
        this._engineOsc = osc;
        this._engineFilter = filter;
      }
      const now = this.ctx.currentTime;
      const targetFreq = 55 + n * 170;
      const targetGain = n * 0.1;
      this._engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.06);
      this._engineFilter.frequency.setTargetAtTime(420 + n * 620, now, 0.08);
      this.engineGain.gain.setTargetAtTime(targetGain, now, 0.06);
    } catch (err) {
      void err;
    }
  }

  // ------------------------------------------------------------------ siren
  playSiren(on) {
    const want = !!on;
    if (want === this._sirenOn) return;
    if (!this.ctx || !this.sirenGain) return;
    this._sirenOn = want;
    try {
      if (want) {
        if (!this._sirenOsc) {
          const ctx = this.ctx;
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = 700;
          osc.connect(this.sirenGain);
          osc.start();
          this._sirenOsc = osc;
        }
        this.sirenGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.05);
        this._sirenHigh = false;
        if (!this._sirenTimer) {
          this._sirenTimer = setInterval(() => {
            if (!this.ctx || !this._sirenOsc) return;
            this._sirenHigh = !this._sirenHigh;
            const f = this._sirenHigh ? 950 : 700;
            try {
              this._sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.04);
            } catch (err) {
              void err;
            }
          }, 450);
        }
      } else {
        this._haltSiren();
      }
    } catch (err) {
      void err;
    }
  }

  _haltSiren() {
    if (this._sirenTimer) {
      clearInterval(this._sirenTimer);
      this._sirenTimer = null;
    }
    if (this._sirenOsc && this.ctx) {
      try {
        this._sirenOsc.stop(this.ctx.currentTime + 0.05);
      } catch (err) {
        void err;
      }
    }
    if (this.sirenGain && this.ctx) {
      try {
        this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
      } catch (err) {
        this.sirenGain.gain.value = 0;
      }
    }
    this._sirenOsc = null;
    this._sirenHigh = false;
  }

  // ------------------------------------------------------------------ noise
  _noise() {
    if (!this.ctx) return null;
    if (this._noiseBuf) return this._noiseBuf;
    try {
      const rate = this.ctx.sampleRate || 44100;
      const len = Math.floor(rate * 0.5);
      const buf = this.ctx.createBuffer(1, len, rate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
      return buf;
    } catch (err) {
      return null;
    }
  }

  _noiseBurst(when, dur, peak, filterType, freq, q) {
    const ctx = this.ctx;
    const buf = this._noise();
    if (!ctx || !buf || !this.sfxGain) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = filterType || 'bandpass';
    filter.frequency.value = freq || 1200;
    filter.Q.value = q || 1;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  _ready() {
    return !!(this.ctx && this.sfxGain && !this.muted);
  }

  // --------------------------------------------------------------- one-shots
  playShot() {
    try {
      if (!this._ready()) return;
      const now = this.ctx.currentTime;
      this._noiseBurst(now, 0.16, 0.28, 'highpass', 900, 0.7);
      this._tone(this.sfxGain, 320, now, 0.07, 0.12, 'square');
      this._tone(this.sfxGain, 140, now + 0.01, 0.09, 0.08, 'sine');
    } catch (err) {
      void err;
    }
  }

  playPunch() {
    try {
      if (!this._ready()) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (err) {
      void err;
    }
  }

  playPickup() {
    try {
      if (!this._ready()) return;
      const now = this.ctx.currentTime;
      this._tone(this.sfxGain, 880, now, 0.09, 0.12, 'triangle');
      this._tone(this.sfxGain, 1320, now + 0.08, 0.12, 0.1, 'triangle');
    } catch (err) {
      void err;
    }
  }

  playJingle() {
    try {
      if (!this._ready()) return;
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < notes.length; i++) {
        this._tone(this.sfxGain, notes[i], now + i * 0.12, 0.22, 0.12, 'triangle');
      }
    } catch (err) {
      void err;
    }
  }

  playSkid() {
    try {
      if (!this._ready()) return;
      const now = this.ctx.currentTime;
      this._noiseBurst(now, 0.18, 0.1, 'bandpass', 1800, 1.4);
    } catch (err) {
      void err;
    }
  }
}
