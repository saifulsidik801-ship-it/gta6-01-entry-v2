// MARISOL BAY - procedural WebAudio: engine, siren, guns, melee, UI cues and a
// sun-soaked adaptive music loop. Every sound is synthesized at runtime (no
// samples, no files, no network). The AudioContext is created lazily on the
// first user gesture and every WebAudio call is guarded so the game still runs
// on machines without audio hardware.

const TUNE = {
  volume: 0.72,
  voiceLimit: 56,

  engineBase: 46,
  engineSpan: 122,
  engineCutoff: 320,
  engineCutoffSpan: 1650,

  sirenLow: 690,
  sirenHigh: 940,
  sirenPeriod: 0.46,
  sirenGain: 0.125,

  padVoices: 4,
  padGain: 0.085,
  padCutoff: 760,

  bpm: { day: 86, dusk: 78, night: 70 },
  bpmLift: 26,
  lookahead: 0.16,
  scheduleWindow: 0.2,
};

const PREFS_KEY = 'marisol-bay-audio-v1';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);
const mtof = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// root midi + upper-structure intervals, one entry per bar of the loop.
const CHORDS = {
  day: [
    [53, [0, 4, 7, 11]],
    [57, [0, 3, 7, 10]],
    [48, [0, 4, 7, 11]],
    [55, [0, 4, 7, 9]],
  ],
  dusk: [
    [50, [0, 3, 7, 10]],
    [55, [0, 4, 7, 11]],
    [48, [0, 3, 7, 10]],
    [53, [0, 4, 7, 11]],
  ],
  night: [
    [45, [0, 3, 7, 10]],
    [48, [0, 3, 7, 10]],
    [43, [0, 4, 7, 11]],
    [50, [0, 3, 7, 10]],
  ],
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.engineBus = null;
    this.sirenBus = null;
    this.limiter = null;

    this._volume = TUNE.volume;
    this._muted = false;
    this._armed = false;
    this._voices = 0;
    this._noiseBuf = null;

    this._engine = null;
    this._siren = null;
    this._music = null;

    this._engineLoad = 0;
    this._sirenActive = false;
    this._sirenPhase = 0;
    this._sirenNext = 0;
    this._wanted = 0;
    this._intensity = 0;
    this._lastPump = 0;
    this._lastSkid = 0;
    this._mode = 'day';

    this._readPrefs();
  }

  // ------------------------------------------------------------------ settings
  get volume() {
    return this._volume;
  }

  set volume(v) {
    this.setVolume(v);
  }

  get muted() {
    return this._muted;
  }

  set muted(v) {
    this.setMuted(v);
  }

  setVolume(v) {
    this._volume = clamp01(num(v, this._volume));
    this._applyGain();
    this._writePrefs();
    return this._volume;
  }

  setMuted(on) {
    this._muted = !!on;
    this._applyGain();
    this._writePrefs();
    return this._muted;
  }

  toggleMute() {
    return this.setMuted(!this._muted);
  }

  _applyGain() {
    if (!this.ctx || !this.master) return;
    const target = this._muted ? 0.0001 : Math.max(0.0001, this._volume);
    try {
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
    } catch (err) {
      this.master.gain.value = target;
    }
  }

  _readPrefs() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const pref = JSON.parse(raw);
      if (typeof pref.volume === 'number') this._volume = clamp01(pref.volume);
      if (typeof pref.muted === 'boolean') this._muted = pref.muted;
    } catch (err) {
      /* storage unavailable - keep defaults */
    }
  }

  _writePrefs() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ volume: this._volume, muted: this._muted }),
      );
    } catch (err) {
      /* storage unavailable - the save system persists settings separately */
    }
  }

  // ------------------------------------------------------------------ lifecycle
  arm() {
    if (typeof window === 'undefined' || this._armed) return this;
    if (typeof window.addEventListener !== 'function') return this;
    this._armed = true;
    const unlock = () => this._unlock();
    const events = ['pointerdown', 'mousedown', 'touchstart', 'keydown'];
    for (let i = 0; i < events.length; i++) {
      window.addEventListener(events[i], unlock, { passive: true });
    }
    return this;
  }

  _unlock() {
    if (!this.ctx) this.init();
    else this._resume();
  }

  _resume() {
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended' && this.ctx.resume) {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (err) {
      /* context may be closed */
    }
  }

  init() {
    if (this.ctx) {
      this._resume();
      return this.ctx;
    }
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    let ctx = null;
    try {
      ctx = new Ctor();
    } catch (err) {
      this.ctx = null;
      return null;
    }
    if (!ctx) return null;
    this.ctx = ctx;

    try {
      this.master = ctx.createGain();
      this.master.gain.value = this._muted ? 0.0001 : Math.max(0.0001, this._volume);

      if (ctx.createDynamicsCompressor) {
        this.limiter = ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -10;
        this.limiter.knee.value = 18;
        this.limiter.ratio.value = 6;
        this.limiter.attack.value = 0.004;
        this.limiter.release.value = 0.2;
        this.master.connect(this.limiter);
        this.limiter.connect(ctx.destination);
      } else {
        this.master.connect(ctx.destination);
      }

      this.sfxBus = this._bus(0.9);
      this.engineBus = this._bus(0.9);
      this.sirenBus = this._bus(0.9);
      this.musicBus = this._bus(0.0001);

      this._noiseBuf = this._makeNoise();
      this._buildEngine();
      this._buildSiren();
    } catch (err) {
      this.master = null;
      this.ctx = null;
      return null;
    }

    this._resume();
    this._lastPump = ctx.currentTime;
    if (this._mode) this.setMusic(this._mode);
    return this.ctx;
  }

  _bus(level) {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(this.master);
    return g;
  }

  _ready() {
    return !!(this.ctx && this.master && this.ctx.state !== 'closed');
  }

  _makeNoise() {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * 1.5));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.55 + white * 0.45;
      data[i] = last;
    }
    return buf;
  }

  _track(osc, nodes) {
    this._voices++;
    if (!osc) return;
    osc.onended = () => {
      this._voices = Math.max(0, this._voices - 1);
      try {
        osc.disconnect();
      } catch (err) {
        /* already gone */
      }
      for (let i = 0; i < nodes.length; i++) {
        try {
          nodes[i].disconnect();
        } catch (err) {
          /* already gone */
        }
      }
    };
  }

  // ------------------------------------------------------------------ primitives
  _tone(o) {
    if (!this._ready() || this._voices > TUNE.voiceLimit) return;
    const ctx = this.ctx;
    const t0 = Math.max(ctx.currentTime, num(o.at, ctx.currentTime)) + num(o.delay, 0);
    const dur = Math.max(0.02, num(o.dur, 0.18));
    const peak = Math.max(0.0002, num(o.gain, 0.1));
    const atk = Math.max(0.002, Math.min(dur * 0.5, num(o.attack, 0.008)));
    let osc;
    let gain;
    try {
      osc = ctx.createOscillator();
      gain = ctx.createGain();
    } catch (err) {
      return;
    }
    osc.type = o.type || 'sine';
    const f0 = Math.max(20, num(o.freq, 440));
    osc.frequency.setValueAtTime(f0, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(o.dest || this.sfxBus);
    try {
      osc.start(t0);
      osc.stop(t0 + dur + 0.06);
    } catch (err) {
      return;
    }
    this._track(osc, [gain]);
  }

  _noise(o) {
    if (!this._ready() || !this._noiseBuf || this._voices > TUNE.voiceLimit) return;
    const ctx = this.ctx;
    const t0 = Math.max(ctx.currentTime, num(o.at, ctx.currentTime)) + num(o.delay, 0);
    const dur = Math.max(0.02, num(o.dur, 0.1));
    const peak = Math.max(0.0002, num(o.gain, 0.1));
    const atk = Math.max(0.002, Math.min(dur * 0.5, num(o.attack, 0.004)));
    let src;
    let filter;
    let gain;
    try {
      src = ctx.createBufferSource();
      src.buffer = this._noiseBuf;
      filter = ctx.createBiquadFilter();
      gain = ctx.createGain();
    } catch (err) {
      return;
    }
    src.loop = true;
    const band = Math.max(40, num(o.freq, 1200));
    filter.type = o.filter || 'bandpass';
    filter.frequency.setValueAtTime(band, t0);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + dur);
    filter.Q.value = num(o.q, 1);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(o.dest || this.sfxBus);
    try {
      src.start(t0, Math.random() * 1.2);
      src.stop(t0 + dur + 0.04);
    } catch (err) {
      return;
    }
    this._track(src, [filter, gain]);
  }

  // ------------------------------------------------------------------ engine
  _buildEngine() {
    const ctx = this.ctx;
    if (!ctx) return null;
    let gain;
    let filter;
    try {
      gain = ctx.createGain();
      filter = ctx.createBiquadFilter();
    } catch (err) {
      return null;
    }
    gain.gain.value = 0.0001;
    filter.type = 'lowpass';
    filter.frequency.value = TUNE.engineCutoff;
    filter.Q.value = 2.4;

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'square';
    oscA.frequency.value = TUNE.engineBase;
    oscB.frequency.value = TUNE.engineBase * 0.5;

    const wobble = ctx.createOscillator();
    const wobbleAmt = ctx.createGain();
    wobble.type = 'sine';
    wobble.frequency.value = 6.5;
    wobbleAmt.gain.value = 2.5;
    wobble.connect(wobbleAmt);
    wobbleAmt.connect(oscA.detune);
    wobbleAmt.connect(oscB.detune);

    let roll = null;
    let rollGain = null;
    if (this._noiseBuf) {
      roll = ctx.createBufferSource();
      roll.buffer = this._noiseBuf;
      roll.loop = true;
      const rollFilter = ctx.createBiquadFilter();
      rollFilter.type = 'bandpass';
      rollFilter.frequency.value = 900;
      rollFilter.Q.value = 0.7;
      rollGain = ctx.createGain();
      rollGain.gain.value = 0.0001;
      roll.connect(rollFilter);
      rollFilter.connect(rollGain);
      rollGain.connect(this.engineBus);
      try {
        roll.start();
      } catch (err) {
        roll = null;
      }
    }

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(this.engineBus);
    try {
      oscA.start();
      oscB.start();
      wobble.start();
    } catch (err) {
      return null;
    }

    this._engine = { oscA, oscB, filter, gain, wobble, wobbleAmt, roll, rollGain };
    return this._engine;
  }

  setEngine(load) {
    this._engineLoad = clamp01(num(load, 0));
    const e = this._engine;
    if (!this._ready() || !e) {
      this._pump();
      return this;
    }
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const v = this._engineLoad;
    const target = v > 0.015 ? 0.045 + v * 0.135 : 0.0001;
    try {
      e.gain.gain.setTargetAtTime(target, t, 0.09);
      e.oscA.frequency.setTargetAtTime(TUNE.engineBase + v * TUNE.engineSpan, t, 0.07);
      e.oscB.frequency.setTargetAtTime(
        TUNE.engineBase * 0.5 + v * TUNE.engineSpan * 0.5,
        t,
        0.07,
      );
      e.filter.frequency.setTargetAtTime(
        TUNE.engineCutoff + v * TUNE.engineCutoffSpan,
        t,
        0.09,
      );
      e.wobble.frequency.setTargetAtTime(5.5 + v * 9, t, 0.2);
      if (e.rollGain) e.rollGain.gain.setTargetAtTime(v * 0.05, t, 0.15);
    } catch (err) {
      /* context went away mid-ramp */
    }
    this._pump();
    return this;
  }

  // ------------------------------------------------------------------ siren
  _buildSiren() {
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = TUNE.sirenLow;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(this.sirenBus);
      osc.start();
      this._siren = { osc, gain };
    } catch (err) {
      this._siren = null;
    }
    return this._siren;
  }

  playSiren(on) {
    const active = !!on && !this._muted;
    if (!this._ready() || !this._siren) {
      this._sirenActive = active;
      return this;
    }
    if (active !== this._sirenActive) {
      this._sirenActive = active;
      const t = this.ctx.currentTime;
      try {
        this._siren.gain.gain.setTargetAtTime(
          active ? TUNE.sirenGain : 0.0001,
          t,
          active ? 0.1 : 0.28,
        );
      } catch (err) {
        /* ignore */
      }
      this._sirenNext = t;
    }
    this._sirenTick();
    this._pump();
    return this;
  }

  _sirenTick() {
    const s = this._siren;
    if (!this._ready() || !s || !this._sirenActive) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this._sirenNext < t || this._sirenNext > t + 1) this._sirenNext = t + 0.04;
    let guard = 0;
    try {
      while (this._sirenNext < t + TUNE.scheduleWindow && guard++ < 6) {
        const high = this._sirenPhase % 2 === 0;
        s.osc.frequency.setTargetAtTime(
          high ? TUNE.sirenHigh : TUNE.sirenLow,
          this._sirenNext,
          0.035,
        );
        this._sirenPhase++;
        this._sirenNext += TUNE.sirenPeriod;
      }
    } catch (err) {
      /* ignore a dead context */
    }
  }

  // ------------------------------------------------------------------ sfx
  playShot() {
    if (!this._ready()) return this;
    const t = this.ctx.currentTime;
    this._noise({ at: t, dur: 0.11, freq: 2100, to: 420, q: 0.9, gain: 0.32, filter: 'bandpass' });
    this._noise({ at: t, dur: 0.05, freq: 5200, q: 0.6, gain: 0.14, filter: 'highpass' });
    this._tone({ at: t, freq: 128, to: 46, dur: 0.16, gain: 0.3, type: 'sine' });
    this._tone({ at: t, freq: 86, to: 38, dur: 0.22, gain: 0.18, type: 'triangle' });
    return this;
  }

  playPunch() {
    if (!this._ready()) return this;
    const t = this.ctx.currentTime;
    this._noise({ at: t, dur: 0.14, freq: 420, to: 180, q: 1.4, gain: 0.22, filter: 'lowpass' });
    this._tone({ at: t, freq: 168, to: 62, dur: 0.12, gain: 0.2, type: 'sine' });
    this._tone({ at: t, freq: 96, to: 48, dur: 0.18, gain: 0.14, type: 'triangle' });
    return this;
  }

  playSwing() {
    if (!this._ready()) return this;
    this._noise({ at: this.ctx.currentTime, dur: 0.16, freq: 900, to: 2600, q: 1.1, gain: 0.1 });
    return this;
  }

  playSkid() {
    if (!this._ready()) return this;
    const t = this.ctx.currentTime;
    if (t - this._lastSkid < 0.05) return this;
    this._lastSkid = t;
    this._noise({ at: t, dur: 0.3, freq: 2600, to: 820, q: 2.2, gain: 0.19 });
    this._noise({ at: t, dur: 0.22, freq: 4200, to: 1600, q: 1.4, gain: 0.07 });
    return this;
  }

  playCrash() {
    if (!this._ready()) return this;
    const t = this.ctx.currentTime;
    this._noise({ at: t, dur: 0.34, freq: 900, to: 140, q: 0.8, gain: 0.34, filter: 'lowpass' });
    this._tone({ at: t, freq: 92, to: 32, dur: 0.4, gain: 0.28, type: 'sine' });
    this._noise({ at: t + 0.03, dur: 0.12, freq: 3800, q: 0.9, gain: 0.12, filter: 'highpass' });
    return this;
  }

  playPickup() {
    if (!this._ready()) return this;
    const t = this.ctx.currentTime;
    this._tone({ at: t, freq: 880, dur: 0.14, gain: 0.16, type: 'triangle' });
    this._tone({ at: t + 0.07, freq: 1174.7, dur: 0.16, gain: 0.15, type: 'triangle' });
    this._tone({ at: t + 0.14, freq: 1568, dur: 0.22, gain: 0.13, type: 'sine' });
    return this;
  }

  playSparkle() {
    if (!this._ready()) return this;
    const t = this.ctx.currentTime;
    const notes = [1568, 1975.5, 2349.3, 2637];
    for (let i = 0; i < notes.length; i++) {
      this._tone({
        at: t + i * 0.045,
        freq: notes[i] * (1 + (Math.random() - 0.5) * 0.006),
        dur: 0.24,
        gain: 0.09 - i * 0.012,
        type: 'sine',
      });
    }
    this._noise({ at: t, dur: 0.28, freq: 6800, q: 1.6, gain: 0.05, filter: 'highpass' });
    return this;
  }

  playCash() {
    if (!this._ready()) return this;
    const t = this.ctx.currentTime;
    this._noise({ at: t, dur: 0.06, freq: 3400, q: 2, gain: 0.12, filter: 'highpass' });
    this._tone({ at: t, freq: 1046.5, dur: 0.1, gain: 0.13, type: 'square' });
    this._tone({ at: t + 0.06, freq: 1568, dur: 0.16, gain: 0.11, type: 'square' });
    this._tone({ at: t + 0.11, freq: 2093, dur: 0.2, gain: 0.08, type: 'triangle' });
    return this;
  }

  playClick() {
    if (!this._ready()) return this;
    const t = this.ctx.currentTime;
    this._tone({ at: t, freq: 760, dur: 0.05, gain: 0.09, type: 'square' });
    this._tone({ at: t, freq: 1520, dur: 0.04, gain: 0.05, type: 'sine' });
    return this;
  }

  playJingle() {
    if (!this._ready()) return this;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    this._tone({ at: t, freq: 130.81, dur: 1.4, gain: 0.1, type: 'triangle', attack: 0.06 });
    for (let i = 0; i < notes.length; i++) {
      this._tone({
        at: t + i * 0.13,
        freq: notes[i],
        dur: 0.38,
        gain: 0.17 - i * 0.012,
        type: 'triangle',
        attack: 0.01,
      });
      this._tone({ at: t + i * 0.13, freq: notes[i] * 2, dur: 0.26, gain: 0.05, type: 'sine' });
    }
    this._tone({ at: t + 0.52, freq: 1567.98, dur: 0.9, gain: 0.12, type: 'sine', attack: 0.02 });
    return this;
  }

  playFail() {
    if (!this._ready()) return this;
    const t = this.ctx.currentTime;
    this._tone({ at: t, freq: 196, to: 146.8, dur: 0.7, gain: 0.18, type: 'sawtooth', attack: 0.03 });
    this._tone({ at: t + 0.16, freq: 146.8, to: 98, dur: 0.9, gain: 0.16, type: 'triangle' });
    this._tone({ at: t, freq: 73.4, dur: 1.1, gain: 0.14, type: 'sine' });
    return this;
  }

  sfx(name) {
    switch (name) {
      case 'shot':
        return this.playShot();
      case 'punch':
        return this.playPunch();
      case 'swing':
        return this.playSwing();
      case 'skid':
        return this.playSkid();
      case 'crash':
        return this.playCrash();
      case 'pickup':
        return this.playPickup();
      case 'sparkle':
        return this.playSparkle();
      case 'cash':
        return this.playCash();
      case 'click':
        return this.playClick();
      case 'jingle':
        return this.playJingle();
      case 'fail':
        return this.playFail();
      default:
        return this;
    }
  }

  // ------------------------------------------------------------------ music
  setMusic(mode) {
    const key = CHORDS[mode] ? mode : 'day';
    this._mode = key;
    if (!this._ready()) return this;
    if (!this._music) this._startMusic();
    else this._music.table = this._chordTable(key);
    return this;
  }

  _chordTable(mode) {
    return CHORDS[mode] || CHORDS.day;
  }

  _startMusic() {
    if (!this._ready() || this._music) return;
    const ctx = this.ctx;
    const m = {
      step: 0,
      next: ctx.currentTime + 0.1,
      bpm: TUNE.bpm[this._mode] || TUNE.bpm.day,
      pads: [],
      table: this._chordTable(this._mode),
      chord: -1,
    };
    const table = m.table;

    for (let i = 0; i < table[0][1].length && i < TUNE.padVoices; i++) {
      let a;
      let b;
      let filter;
      let gain;
      try {
        a = ctx.createOscillator();
        b = ctx.createOscillator();
        filter = ctx.createBiquadFilter();
        gain = ctx.createGain();
      } catch (err) {
        break;
      }
      a.type = 'triangle';
      b.type = 'sawtooth';
      a.detune.value = -5 - i * 1.5;
      b.detune.value = 6 + i * 1.5;
      filter.type = 'lowpass';
      filter.frequency.value = TUNE.padCutoff;
      filter.Q.value = 0.6;
      gain.gain.value = 0.0001;
      a.connect(filter);
      b.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBus);
      try {
        a.start();
        b.start();
      } catch (err) {
        break;
      }
      m.pads.push({ a, b, filter, gain });
    }

    this._music = m;
    try {
      this.musicBus.gain.setTargetAtTime(0.9, ctx.currentTime, 0.9);
    } catch (err) {
      this.musicBus.gain.value = 0.9;
    }
    this._musicStep(m, ctx.currentTime);
  }

  _stopMusic() {
    const m = this._music;
    this._music = null;
    if (!m || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.musicBus) {
      try {
        this.musicBus.gain.setTargetAtTime(0.0001, t, 0.22);
      } catch (err) {
        /* ignore */
      }
    }
    for (let i = 0; i < m.pads.length; i++) {
      const p = m.pads[i];
      try {
        p.a.stop(t + 0.5);
        p.b.stop(t + 0.5);
      } catch (err) {
        /* already stopped */
      }
      p.a.onended = () => {
        try {
          p.a.disconnect();
          p.b.disconnect();
          p.filter.disconnect();
          p.gain.disconnect();
        } catch (err) {
          /* already gone */
        }
      };
    }
  }

  stopMusic() {
    this._stopMusic();
    return this;
  }

  _applyChord(m, chord, t) {
    const root = chord[0];
    const intervals = chord[1];
    for (let i = 0; i < m.pads.length; i++) {
      const p = m.pads[i];
      const midi = root + 12 + intervals[i % intervals.length];
      const freq = mtof(midi);
      try {
        p.a.frequency.setTargetAtTime(freq, t, 0.18);
        p.b.frequency.setTargetAtTime(freq * 1.0035, t, 0.18);
        p.filter.frequency.setTargetAtTime(
          TUNE.padCutoff + this._intensity * 1500,
          t,
          0.4,
        );
        p.gain.gain.setTargetAtTime(
          TUNE.padGain * (0.8 + this._intensity * 0.5),
          t,
          0.3,
        );
      } catch (err) {
        /* ignore */
      }
    }
  }

  _musicStep(m, t) {
    const table = m.table || CHORDS.day;
    const bar = Math.floor(m.step / 16);
    const slot = m.step % 16;
    const chord = table[bar % table.length];
    if (m.chord !== bar % table.length) {
      m.chord = bar % table.length;
      this._applyChord(m, chord, t);
    }

    const stepDur = 60 / Math.max(30, m.bpm) / 4;
    const inten = this._intensity;
    const root = chord[0];

    if (slot === 0 || slot === 6 || slot === 8 || (slot === 14 && inten > 0.45)) {
      const lift = slot === 6 || slot === 14 ? 7 : 0;
      this._tone({
        at: t,
        freq: mtof(root - 12 + lift),
        dur: stepDur * 1.7,
        gain: 0.1 + inten * 0.05,
        type: 'triangle',
        attack: 0.02,
        dest: this.musicBus,
      });
    }

    if (slot === 0 || slot === 8) {
      if (inten > 0.28) {
        this._tone({
          at: t,
          freq: 78,
          to: 42,
          dur: 0.17,
          gain: 0.06 + inten * 0.06,
          type: 'sine',
          dest: this.musicBus,
        });
      }
    }

    if (slot % 2 === 1) {
      this._noise({
        at: t,
        dur: 0.045,
        freq: 6400,
        q: 1.1,
        gain: 0.014 + inten * 0.03 + (slot % 4 === 3 ? 0.012 : 0),
        filter: 'highpass',
        dest: this.musicBus,
      });
    } else if (inten > 0.55 && slot !== 0 && slot !== 8) {
      this._noise({
        at: t,
        dur: 0.03,
        freq: 7800,
        q: 1.4,
        gain: 0.014,
        filter: 'highpass',
        dest: this.musicBus,
      });
    }

    if (inten < 0.55 && (slot === 4 || slot === 12) && Math.random() < 0.5) {
      const scale = [0, 2, 4, 7, 9, 12, 14, 16];
      const pick = scale[Math.floor(Math.random() * scale.length)];
      this._tone({
        at: t + 0.02,
        freq: mtof(root + 24 + pick),
        dur: 0.9,
        gain: 0.036,
        type: 'sine',
        attack: 0.03,
        dest: this.musicBus,
      });
    }
  }

  _scheduleMusic(now) {
    const m = this._music;
    if (!m) return;
    const baseBpm = TUNE.bpm[this._mode] || TUNE.bpm.day;
    const targetBpm = baseBpm + this._intensity * TUNE.bpmLift;
    m.bpm += (targetBpm - m.bpm) * 0.06;
    if (m.next < now - 0.4 || m.next > now + 2) m.next = now + 0.05;
    let guard = 0;
    while (m.next < now + TUNE.lookahead && guard++ < 32) {
      if (m.step >= 16 * 32) {
        m.step = 0;
        m.chord = -1;
      }
      this._musicStep(m, m.next);
      m.next += 60 / Math.max(30, m.bpm) / 4;
      m.step++;
      if (m.step % 16 === 0) {
        m.bpm += ((baseBpm + this._intensity * TUNE.bpmLift) - m.bpm) * 0.15;
      }
    }
  }

  // ------------------------------------------------------------------ frame hook
  // main.js calls setEngine()/playSiren() every frame; this pump keeps the music
  // grid and the intensity envelope moving even if only one of them is called.
  _pump() {
    if (!this._ready()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    let dt = now - this._lastPump;
    if (!(dt > 0) || dt > 0.25) dt = 1 / 60;
    this._lastPump = now;

    const wanted = clamp01(this._wanted / 5);
    const target = clamp01(
      this._engineLoad * 0.5 + (this._sirenActive ? 0.5 : 0) + wanted * 0.25 +
        (this._mode === 'night' ? 0.05 : 0),
    );
    this._intensity += (target - this._intensity) * Math.min(1, dt * 1.7);
    this._intensity = clamp01(this._intensity);
    if (this._music) this._scheduleMusic(now);
  }

  update(state) {
    if (!state) return this;
    if (typeof state.wanted === 'number') this._wanted = state.wanted;
    if (typeof state.speed === 'number') {
      const max = num(state.maxSpeed, 28);
      const driving = state.driving !== false;
      this.setEngine(driving ? clamp01(Math.abs(state.speed) / Math.max(1, max)) : 0);
    }
    if (typeof state.wanted === 'number') {
      this.playSiren(state.wanted > 0 && !this._muted);
    }
    return this;
  }

  dispose() {
    this._stopMusic();
    const e = this._engine;
    if (e) {
      try {
        e.oscA.stop();
        e.oscB.stop();
        e.wobble.stop();
        if (e.roll) e.roll.stop();
      } catch (err) {
        /* already stopped */
      }
      this._engine = null;
    }
    if (this._siren) {
      try {
        this._siren.osc.stop();
      } catch (err) {
        /* already stopped */
      }
      this._siren = null;
    }
    if (this.ctx && this.ctx.close) {
      try {
        const p = this.ctx.close();
        if (p && p.catch) p.catch(() => {});
      } catch (err) {
        /* ignore */
      }
    }
    this.ctx = null;
    this.master = null;
    this._voices = 0;
    return this;
  }
}
