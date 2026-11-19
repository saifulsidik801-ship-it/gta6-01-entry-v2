const clamp01 = (value, fallback) => {
  const n = typeof value === 'number' && isFinite(value) ? value : fallback;
  if (!(n > 0)) return 0;
  return n > 1 ? 1 : n;
};

const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

const MUSIC = {
  day: {
    bpm: 96,
    hold: 4,
    wave: 'triangle',
    peak: 0.2,
    attack: 0.5,
    release: 0.8,
    detune: 4,
    cutoff: 5200,
    length: 0.96,
    bass: 0.14,
    bassEvery: 2,
    bassLen: 0.4,
    chords: [
      [60, 64, 67, 71],
      [65, 69, 72, 76],
      [57, 60, 64, 67],
      [55, 59, 62, 65],
    ],
  },
  dusk: {
    bpm: 66,
    hold: 4,
    wave: 'triangle',
    peak: 0.18,
    attack: 0.95,
    release: 1.2,
    detune: 6,
    cutoff: 2100,
    length: 0.98,
    bass: 0.12,
    bassEvery: 4,
    bassLen: 1.1,
    chords: [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [50, 53, 57, 60],
      [55, 59, 62, 65],
    ],
  },
  night: {
    bpm: 50,
    hold: 8,
    wave: 'sine',
    peak: 0.2,
    attack: 1.6,
    release: 2.0,
    detune: 0,
    cutoff: 1500,
    length: 1.0,
    bass: 0.06,
    bassEvery: 8,
    bassLen: 2.4,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
      [52, 55, 59],
    ],
  },
};

const MASTER_CAP = 0.8;
const MUSIC_LEVEL = 0.12;
const SILENCE = 0.0001;

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.muted = false;
    this._noiseBuf = null;
    this._armed = false;
    this._armHandler = null;
    this._bed = null;
    this._engine = null;
    this._siren = null;
    this._lastSkid = -1;
  }

  arm() {
    if (this._armed) return;
    this._armed = true;
    try {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      const kick = () => {
        this._disarm();
        this.init();
      };
      this._armHandler = kick;
      const opts = { once: true, passive: true };
      window.addEventListener('pointerdown', kick, opts);
      window.addEventListener('keydown', kick, opts);
      window.addEventListener('touchstart', kick, opts);
    } catch {
      this._armHandler = null;
    }
  }

  _disarm() {
    const handler = this._armHandler;
    if (!handler) return;
    this._armHandler = null;
    try {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    } catch {
      return;
    }
  }

  init() {
    try {
      if (!this.ctx) {
        const Ctor =
          typeof window !== 'undefined'
            ? window.AudioContext || window.webkitAudioContext
            : typeof AudioContext !== 'undefined'
              ? AudioContext
              : null;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (!this.master) {
        const master = this.ctx.createGain();
        master.gain.value = this.muted ? SILENCE : Math.max(SILENCE, this.volume * MASTER_CAP);
        master.connect(this.ctx.destination);
        this.master = master;
      }
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        const pending = this.ctx.resume();
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      }
      this._noise();
    } catch {
      return;
    }
  }

  _ready() {
    if (!this.ctx) return null;
    if (!this.master) this.init();
    if (!this.master) return null;
    if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      try {
        const pending = this.ctx.resume();
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  _noise() {
    if (this._noiseBuf || !this.ctx) return this._noiseBuf;
    try {
      const ctx = this.ctx;
      const rate = ctx.sampleRate || 44100;
      const length = Math.max(1, Math.floor(rate));
      const buffer = ctx.createBuffer(1, length, rate);
      const data = buffer.getChannelData(0);
      let seed = 1337;
      for (let i = 0; i < length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed / 4294967296) * 2 - 1;
      }
      this._noiseBuf = buffer;
    } catch {
      this._noiseBuf = null;
    }
    return this._noiseBuf;
  }

  _track(bed, osc, gain) {
    bed.nodes.add(osc);
    osc.onended = () => {
      bed.nodes.delete(osc);
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        return;
      }
    };
  }

  _padNote(bed, midi, when, duration, cfg, index) {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = cfg.wave;
      osc.frequency.setValueAtTime(midiFreq(midi), when);
      if (cfg.detune && typeof osc.detune !== 'undefined') {
        osc.detune.setValueAtTime(index % 2 === 0 ? -cfg.detune : cfg.detune, when);
      }
      const attack = Math.min(cfg.attack, duration * 0.5);
      const release = Math.min(cfg.release, duration * 0.7);
      gain.gain.setValueAtTime(SILENCE, when);
      gain.gain.linearRampToValueAtTime(cfg.peak, when + attack);
      gain.gain.setValueAtTime(cfg.peak, Math.max(when + attack + 0.02, when + duration - release));
      gain.gain.exponentialRampToValueAtTime(SILENCE, when + duration);
      osc.connect(gain);
      gain.connect(bed.filter);
      osc.start(when);
      osc.stop(when + duration + 0.05);
      this._track(bed, osc, gain);
    } catch {
      return;
    }
  }

  _bassNote(bed, midi, when, span, cfg) {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(midiFreq(midi), when);
      const life = Math.max(0.2, Math.min(cfg.bassLen || 0.5, span * 0.9));
      gain.gain.setValueAtTime(SILENCE, when);
      gain.gain.linearRampToValueAtTime(cfg.bass, when + 0.03);
      gain.gain.exponentialRampToValueAtTime(SILENCE, when + life);
      osc.connect(gain);
      gain.connect(bed.filter);
      osc.start(when);
      osc.stop(when + life + 0.05);
      this._track(bed, osc, gain);
    } catch {
      return;
    }
  }

  _pump(bed) {
    const ctx = this.ctx;
    if (!ctx || !bed || bed.dead) return;
    const cfg = bed.cfg;
    const stepSeconds = 60 / cfg.bpm;
    const cycle = cfg.chords.length * cfg.hold;
    const horizon = ctx.currentTime + 0.8;
    let guard = 0;
    while (bed.next < horizon && guard < 24) {
      guard += 1;
      const step = bed.step;
      const chord = cfg.chords[Math.floor(step / cfg.hold) % cfg.chords.length];
      const when = bed.next;
      if (step % cfg.hold === 0) {
        const duration = cfg.hold * stepSeconds * cfg.length;
        for (let i = 0; i < chord.length; i++) {
          this._padNote(bed, chord[i], when, duration, cfg, i);
        }
      }
      if (cfg.bass > 0) {
        const every = Math.max(1, cfg.bassEvery);
        if (step % every === 0) {
          this._bassNote(bed, chord[0] - 12, when, cfg.hold * stepSeconds, cfg);
        }
      }
      bed.next += stepSeconds;
      bed.step = (step + 1) % cycle;
    }
  }

  _startBed(mode) {
    const ctx = this.ctx;
    const cfg = MUSIC[mode] || MUSIC.day;
    const bed = {
      mode: MUSIC[mode] ? mode : 'day',
      cfg,
      filter: null,
      gain: null,
      timer: 0,
      next: 0,
      step: 0,
      dead: false,
      nodes: new Set(),
    };
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cfg.cutoff;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SILENCE, t);
    gain.gain.linearRampToValueAtTime(MUSIC_LEVEL, t + 1.6);
    filter.connect(gain);
    gain.connect(this.master);
    bed.filter = filter;
    bed.gain = gain;
    bed.next = t + 0.08;
    bed.step = 0;
    bed.timer = setInterval(() => this._pump(bed), 250);
    this._pump(bed);
    return bed;
  }

  _stopBed(bed, fade) {
    if (!bed || bed.dead) return;
    bed.dead = true;
    clearInterval(bed.timer);
    const ctx = this.ctx;
    const span = fade || 1.2;
    if (ctx) {
      const t = ctx.currentTime;
      try {
        const param = bed.gain.gain;
        if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t);
        else param.cancelScheduledValues(t);
        param.linearRampToValueAtTime(SILENCE, t + span);
      } catch {
        try {
          bed.gain.gain.value = SILENCE;
        } catch {
          bed.gain = null;
        }
      }
    }
    const nodes = bed.nodes;
    bed.nodes = new Set();
    setTimeout(() => {
      nodes.forEach((osc) => {
        try {
          osc.stop();
        } catch {
          return;
        }
      });
      if (!bed.gain) return;
      try {
        bed.filter.disconnect();
        bed.gain.disconnect();
      } catch {
        return;
      }
    }, span * 1000 + 140);
  }

  setMusic(mode) {
    if (!this.ctx) return;
    if (!this.master) this.init();
    if (!this.ctx || !this.master) return;
    const key = MUSIC[mode] ? mode : 'day';
    if (this._bed && !this._bed.dead && this._bed.mode === key) return;
    const previous = this._bed;
    try {
      this._bed = this._startBed(key);
    } catch {
      this._bed = previous;
      return;
    }
    if (previous) this._stopBed(previous, 1.8);
  }

  _tone(freq, when, duration, type, amp) {
    if (!this.ctx || !this.master) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(Math.max(20, freq), when);
      const life = Math.max(0.05, duration);
      gain.gain.setValueAtTime(SILENCE, when);
      gain.gain.linearRampToValueAtTime(Math.max(0.0002, amp), when + 0.014);
      gain.gain.exponentialRampToValueAtTime(SILENCE, when + life);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(when);
      osc.stop(when + life + 0.04);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          return;
        }
      };
    } catch {
      return;
    }
  }

  _thump(from, to, duration, amp) {
    if (!this.ctx || !this.master) return;
    try {
      const t = this.ctx.currentTime + 0.005;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
      gain.gain.setValueAtTime(SILENCE, t);
      gain.gain.linearRampToValueAtTime(amp, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(SILENCE, t + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + duration + 0.03);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          return;
        }
      };
    } catch {
      return;
    }
  }

  playJingle() {
    const ctx = this._ready();
    if (!ctx) return;
    const notes = [72, 76, 79, 84, 88];
    const start = ctx.currentTime + 0.02;
    for (let i = 0; i < notes.length; i++) {
      const when = start + i * 0.095;
      const freq = midiFreq(notes[i]);
      this._tone(freq, when, 0.5, 'triangle', 0.14);
      this._tone(freq * 2, when, 0.22, 'sine', 0.045);
    }
    this._tone(midiFreq(84), start + notes.length * 0.095, 0.95, 'triangle', 0.1);
  }

  playPickup() {
    const ctx = this._ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    this._tone(880, t, 0.1, 'sine', 0.16);
    this._tone(1320, t + 0.07, 0.16, 'sine', 0.13);
  }

  playShot() {
    const ctx = this._ready();
    const buffer = this._noise();
    if (!ctx || !buffer || !this.master) return;
    const t = ctx.currentTime;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 1.1;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 140;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.setValueAtTime(4200, t);
      low.frequency.exponentialRampToValueAtTime(420, t + 0.22);
      low.Q.value = 0.9;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(SILENCE, t);
      gain.gain.linearRampToValueAtTime(0.42, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(SILENCE, t + 0.24);
      src.connect(high);
      high.connect(low);
      low.connect(gain);
      gain.connect(this.master);
      src.start(t, 0, 0.26);
      src.onended = () => {
        try {
          src.disconnect();
          high.disconnect();
          low.disconnect();
          gain.disconnect();
        } catch {
          return;
        }
      };
    } catch {
      return;
    }
    this._thump(150, 46, 0.2, 0.3);
  }

  playPunch() {
    const ctx = this._ready();
    if (!ctx) return;
    this._thump(160, 60, 0.12, 0.4);
  }

  playSkid() {
    const ctx = this._ready();
    const buffer = this._noise();
    if (!ctx || !buffer || !this.master) return;
    const t = ctx.currentTime;
    if (t - this._lastSkid < 0.09) return;
    this._lastSkid = t;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 1.6;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(1900, t);
      band.frequency.exponentialRampToValueAtTime(1250, t + 0.16);
      band.Q.value = 1.4;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(SILENCE, t);
      gain.gain.linearRampToValueAtTime(0.075, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(SILENCE, t + 0.17);
      src.connect(band);
      band.connect(gain);
      gain.connect(this.master);
      src.start(t, (t * 7.3) % 0.5, 0.2);
      src.onended = () => {
        try {
          src.disconnect();
          band.disconnect();
          gain.disconnect();
        } catch {
          return;
        }
      };
    } catch {
      return;
    }
  }

  _buildEngine() {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 38;
    const oscB = ctx.createOscillator();
    oscB.type = 'sawtooth';
    oscB.frequency.value = 39.5;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscA.start();
    oscB.start();
    return { oscA, oscB, filter, gain };
  }

  setEngine(level) {
    const ctx = this._ready();
    if (!ctx || !this.master) return;
    const lv = clamp01(level, 0);
    if (!this._engine) {
      if (lv <= 0.001) return;
      try {
        this._engine = this._buildEngine();
      } catch {
        this._engine = null;
        return;
      }
    }
    const engine = this._engine;
    if (!engine) return;
    const t = ctx.currentTime;
    const loud = lv <= 0.001 ? SILENCE : 0.1 + lv * 0.14;
    const freq = 38 + lv * 165;
    try {
      engine.gain.gain.setTargetAtTime(loud, t, 0.08);
      engine.oscA.frequency.setTargetAtTime(freq, t, 0.1);
      engine.oscB.frequency.setTargetAtTime(freq * 1.0125 + 1.5, t, 0.1);
      engine.filter.frequency.setTargetAtTime(320 + lv * 1500, t, 0.12);
      engine.filter.Q.setTargetAtTime(1.1, t, 0.2);
    } catch {
      return;
    }
  }

  playSiren(on) {
    const ctx = this._ready();
    if (!ctx) return;
    const want = !!on && !this.muted;
    if (want) {
      if (this._siren) return;
      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, t);
        gain.gain.setValueAtTime(SILENCE, t);
        gain.gain.linearRampToValueAtTime(0.05, t + 0.25);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(t);
        const siren = { osc, gain, hi: false, timer: 0 };
        siren.timer = setInterval(() => {
          if (this._siren !== siren || !this.ctx) return;
          siren.hi = !siren.hi;
          const freq = siren.hi ? 950 : 700;
          try {
            siren.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
          } catch {
            return;
          }
        }, 430);
        this._siren = siren;
      } catch {
        this._siren = null;
      }
      return;
    }
    const siren = this._siren;
    if (!siren) return;
    this._siren = null;
    clearInterval(siren.timer);
    try {
      const t = ctx.currentTime;
      const param = siren.gain.gain;
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t);
      else param.cancelScheduledValues(t);
      param.linearRampToValueAtTime(SILENCE, t + 0.2);
    } catch {
      try {
        siren.gain.gain.value = SILENCE;
      } catch {
        return;
      }
    }
    setTimeout(() => {
      try {
        siren.osc.stop();
      } catch {
        return;
      }
      try {
        siren.osc.disconnect();
        siren.gain.disconnect();
      } catch {
        return;
      }
    }, 280);
  }

  setVolume(value) {
    this.volume = clamp01(value, this.volume);
    this._applyMaster();
  }

  _applyMaster() {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? SILENCE : Math.max(SILENCE, this.volume * MASTER_CAP);
    try {
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    } catch {
      try {
        this.master.gain.value = target;
      } catch {
        return;
      }
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this._applyMaster();
    return this.muted;
  }
}
