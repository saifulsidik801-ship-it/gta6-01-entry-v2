// MARISOL BAY - radio (R9). Pure station/track state machine; the audio
// engine (audio.js) is driven through the optional adapter passed in, so
// this class works headless (screenshots) with no AudioContext at all.
// Default: first station, first track, paused. Audio never autoplays —
// play() only starts the engine after a user gesture created the context.

import { STATIONS } from './stations.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Radio {
  constructor(opts = {}) {
    this.audio = opts.audio || null;
    this.onTrackChange = typeof opts.onTrackChange === 'function' ? opts.onTrackChange : null;
    this.onStationChange = typeof opts.onStationChange === 'function' ? opts.onStationChange : null;
    this.stationIndex = 0;
    this.trackIndex = 0;
    this.elapsed = 0;
    this.playing = false;
    this.volume = 0.5;
    this.muted = false;
    this._savedVolume = 0.5;
  }

  get station() {
    return STATIONS[this.stationIndex];
  }

  get track() {
    const st = this.station;
    return st.tracks[this.trackIndex % st.tracks.length];
  }

  get isTalk() {
    return this.station.id === 'talk1047';
  }

  nowPlaying() {
    const st = this.station;
    const tr = this.track;
    return {
      stationId: st.id,
      station: st.name,
      fullName: st.fullName,
      freq: st.freq,
      genre: st.genre,
      color: st.color,
      title: tr.title,
      artist: tr.artist,
      durSec: tr.durSec,
      elapsedSec: Math.floor(this.elapsed),
      progress: tr.durSec > 0 ? clamp01(this.elapsed / tr.durSec) : 0,
      playing: this.playing,
      muted: this.muted,
      volume: this.volume,
    };
  }

  _applyAudio() {
    if (!this.audio || typeof this.audio.setMusic !== 'function') return;
    if (!this.playing) return;
    if (this.isTalk) {
      if (typeof this.audio.stopMusic === 'function') this.audio.stopMusic();
      return;
    }
    this.audio.setMusic(this.station.musicMode || 'day');
  }

  play() {
    if (!this.audio || !this.audio.ctx) return false;
    this.playing = true;
    this._applyAudio();
    return true;
  }

  pause() {
    this.playing = false;
    if (this.audio && typeof this.audio.stopMusic === 'function') this.audio.stopMusic();
  }

  toggle() {
    if (this.playing) {
      this.pause();
      return false;
    }
    return this.play();
  }

  nextStation(dir = 1) {
    const n = STATIONS.length;
    this.stationIndex = ((this.stationIndex + dir) % n + n) % n;
    this.trackIndex = 0;
    this.elapsed = 0;
    this._applyAudio();
    if (this.onStationChange) this.onStationChange(this.nowPlaying());
    if (this.onTrackChange) this.onTrackChange(this.nowPlaying());
  }

  nextTrack() {
    const st = this.station;
    this.trackIndex = (this.trackIndex + 1) % st.tracks.length;
    this.elapsed = 0;
    if (this.onTrackChange) this.onTrackChange(this.nowPlaying());
  }

  setVolume(v) {
    const n = typeof v === 'number' && isFinite(v) ? clamp01(v) : 0.5;
    this.volume = n;
    if (!this.muted && this.audio && typeof this.audio.setVolume === 'function') {
      this.audio.setVolume(n);
    }
  }

  setMuted(m) {
    const next = !!m;
    if (next === this.muted) return;
    this.muted = next;
    if (next) {
      this._savedVolume = this.volume;
      if (this.audio && typeof this.audio.setVolume === 'function') this.audio.setVolume(0);
    } else if (this.audio && typeof this.audio.setVolume === 'function') {
      this.audio.setVolume(this._savedVolume);
    }
  }

  update(dt) {
    if (!this.playing) return;
    const step = typeof dt === 'number' && dt > 0 ? dt : 0;
    this.elapsed += step;
    const tr = this.track;
    if (tr && this.elapsed >= tr.durSec) {
      this.nextTrack();
    }
  }
}
