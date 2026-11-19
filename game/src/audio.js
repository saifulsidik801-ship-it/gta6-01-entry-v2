// MARISOL BAY - procedural WebAudio: no audio assets, every sound is synthesised
// from oscillators and filtered noise. The context is only created after the
// first real user gesture, so nothing ever autoplays.

const MUSIC = {
  day: { root: 110, chord: [0, 4, 7, 11], bass: [0, 7, 5, 3], bpm: 84, wave: 'triangle' },
  dusk: { root: 98, chord: [0, 3, 7, 10], bass: [0, 5, 3, 7], bpm: 76, wave: 'sine' },
  night: { root: 82, chord: [0, 3, 7, 14], bass: [0, 7, 10, 5], bpm: 68, wave: 'sine' },
};

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function semis(root, n) {
  return root * Math.pow(2, n / 12);
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.volume = 0.7;
    this.muted = false;
    this.engine = null;
    this.siren = null;
    this.musicMode = null;
    this.musicTimer = null;
    this.nextBar = 0;
    this.bar = 0;
    this.armed = false;
    this._gesture = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch (err) {
      return null;
    }

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    this.noiseBuffer = this.buildNoise();
    this.buildEngine();

    if (this.musicMode) this.startMusic(this.musicMode);
    return this.ctx;
  }

  // Attach the one-shot gesture listeners that unlock audio.
  arm(target) {
    if (this.armed || typeof window === 'undefined') return;
    this.armed = true;
    const unlock = () => {
      this.init();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    void target;
  }

  buildNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  noiseBurst(dur, freq, q, gain, type) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type || 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q || 1;
    const env = this.ctx.createGain();
    const t = this.ctx.currentTime;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, gain, type, slideTo) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    const t = this.ctx.currentTime;
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- engine hum
  buildEngine() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 46;
    sub.type = 'square';
    sub.frequency.value = 23;
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = 6;
    gain.gain.value = 0;

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    sub.start();

    this.engine = { osc, sub, filter, gain };
  }

  setEngine(speed01) {
    if (!this.engine || !this.ctx) return;
    const v = Math.max(0, Math.min(1, speed01 || 0));
    const t = this.ctx.currentTime;
    const target = 0.05 + v * 0.5;
    this.engine.gain.gain.setTargetAtTime(target, t, 0.12);
    this.engine.osc.frequency.setTargetAtTime(42 + v * 118, t, 0.1);
    this.engine.sub.frequency.setTargetAtTime(21 + v * 58, t, 0.1);
    this.engine.filter.frequency.setTargetAtTime(300 + v * 900, t, 0.1);
  }

  playSkid() {
    this.noiseBurst(0.24, 1500, 3.2, 0.18, 'bandpass');
  }

  playShot() {
    this.noiseBurst(0.16, 900, 0.8, 0.42, 'highpass');
    this.tone(150, 0.1, 0.28, 'square', 55);
  }

  playPunch() {
    this.tone(96, 0.12, 0.4, 'sine', 42);
    this.noiseBurst(0.08, 320, 1.2, 0.22, 'lowpass');
  }

  playPickup() {
    this.tone(midiToFreq(76), 0.1, 0.16, 'triangle');
    setTimeout(() => this.tone(midiToFreq(83), 0.14, 0.16, 'triangle'), 70);
  }

  playJingle() {
    const notes = [72, 76, 79, 84];
    notes.forEach((n, i) => {
      setTimeout(() => this.tone(midiToFreq(n), 0.32, 0.2, 'triangle'), i * 110);
    });
  }

  playSiren(on) {
    if (!this.ctx) return;
    if (on && !this.siren) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 620;
      lfo.type = 'triangle';
      lfo.frequency.value = 1.6;
      lfoGain.gain.value = 240;
      gain.gain.value = 0.0001;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start();
      lfo.start();
      gain.gain.setTargetAtTime(0.06, ctx.currentTime, 0.2);
      this.siren = { osc, lfo, gain };
    } else if (!on && this.siren) {
      const s = this.siren;
      this.siren = null;
      if (this.ctx) s.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
      setTimeout(() => {
        try {
          s.osc.stop();
          s.lfo.stop();
        } catch (err) {
          void err;
        }
      }, 400);
    }
  }

  // ------------------------------------------------------------------- music
  setMusic(mode) {
    this.musicMode = mode || 'day';
    if (this.ctx) this.startMusic(this.musicMode);
  }

  startMusic(mode) {
    if (!this.ctx || !mode) return;
    this.stopMusic();
    this.musicTimer = setInterval(() => this.scheduleMusic(), 1000);
    this.nextBar = this.ctx.currentTime + 0.1;
    this.bar = 0;
    this.scheduleMusic();
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  scheduleMusic() {
    if (!this.ctx || !this.musicTimer) return;
    const preset = MUSIC[this.musicMode] || MUSIC.day;
    const beat = 60 / preset.bpm;
    const barLen = beat * 4;

    while (this.nextBar < this.ctx.currentTime + 2) {
      this.playBar(preset, this.bar, this.nextBar, barLen);
      this.nextBar += barLen;
      this.bar++;
    }
  }

  playBar(preset, bar, when, barLen) {
    const ctx = this.ctx;
    const chord = preset.chord.map((n) => semis(preset.root, n));

    for (let i = 0; i < chord.length; i++) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = preset.wave;
      osc.frequency.value = chord[i];
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(0.05, when + 0.4);
      env.gain.setTargetAtTime(0.0001, when + barLen * 0.7, 0.35);
      osc.connect(env);
      env.connect(this.musicGain);
      osc.start(when);
      osc.stop(when + barLen + 0.4);
    }

    const bassNote = semis(preset.root / 2, preset.bass[bar % preset.bass.length]);
    for (let b = 0; b < 4; b += 2) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = bassNote;
      const t = when + b * (barLen / 4);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.1, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0005, t + 0.45);
      osc.connect(env);
      env.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  }

  // ------------------------------------------------------------------ master
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, typeof v === 'number' ? v : 0.7));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.08,
      );
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.08,
      );
    }
    return this.muted;
  }
}
