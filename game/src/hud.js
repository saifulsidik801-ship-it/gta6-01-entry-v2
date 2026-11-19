// MARISOL BAY - heads-up display: start screen, readouts, minimap, jobs, pause.

import { DISTRICTS, WORLD, TURF } from './config.js';

const STYLE_ID = 'mb-hud-style';
const MAP_SIZE = 190;
const MAP_PAD = 7;
const TOAST_LIMIT = 3;

const PANEL_BG = 'rgba(9, 17, 25, 0.55)';
const PANEL_EDGE = 'rgba(255, 236, 205, 0.18)';
const AMBER = '#ffb347';
const CREAM = '#ffe9c9';

function num(value, fallback) {
  return typeof value === 'number' && isFinite(value) ? value : fallback;
}

function str(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function money(value) {
  const n = Math.round(num(value, 0));
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function swatch(entry) {
  const palette = entry && entry.palette;
  if (Array.isArray(palette) && palette.length) {
    const raw = String(palette[0]);
    if (raw.charAt(0) === '#') return raw;
    if (raw.charAt(0) !== '0') return '#' + raw;
  }
  const ground = entry && entry.ground;
  if (typeof ground === 'number') return '#' + ground.toString(16).padStart(6, '0');
  return '#b9c4c0';
}

function healthColor(health) {
  const h = clamp(health, 0, 100) / 100;
  let r;
  let g;
  let b;
  if (h > 0.55) {
    const t = (h - 0.55) / 0.45;
    r = Math.round(255 + (110 - 255) * t);
    g = Math.round(183 + (224 - 183) * t);
    b = Math.round(71 + (140 - 71) * t);
  } else {
    const t = h / 0.55;
    r = Math.round(255 + (255 - 255) * t);
    g = Math.round(78 + (183 - 78) * t);
    b = Math.round(64 + (71 - 64) * t);
  }
  return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

function statusLabel(status) {
  const s = str(status, '').toLowerCase();
  if (s === 'done' || s === 'complete' || s === 'completed') return 'COMPLETE';
  if (s === 'active' || s === 'inprogress' || s === 'in-progress' || s === 'started' || s === 'current') {
    return 'ACTIVE';
  }
  if (s === 'failed') return 'FAILED';
  if (s === 'locked') return 'LOCKED';
  return 'OPEN';
}

function isDone(status) {
  const s = str(status, '').toLowerCase();
  return s === 'done' || s === 'complete' || s === 'completed';
}

function isActive(status) {
  const s = str(status, '').toLowerCase();
  return s === 'active' || s === 'inprogress' || s === 'in-progress' || s === 'started' || s === 'current';
}

const CSS = `
body #hud { z-index: 6; }

body #minimap {
  position: fixed; left: 18px; bottom: 18px; right: auto; top: auto;
  width: ${MAP_SIZE}px; height: ${MAP_SIZE}px; border-radius: 12px;
  background: rgba(7, 14, 21, 0.55);
  border: 1px solid ${PANEL_EDGE};
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  pointer-events: none; z-index: 5;
  transition: opacity 0.22s ease;
}
body #minimap.mb-map-off { opacity: 0; visibility: hidden; }

body #objective {
  position: fixed; left: 50%; top: auto; right: auto; bottom: 20px;
  transform: translateX(-50%);
  max-width: min(58vw, 560px); width: max-content;
  padding: 9px 18px 11px; border-radius: 10px;
  background: ${PANEL_BG};
  border: 1px solid ${PANEL_EDGE};
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.34);
  text-align: center; pointer-events: none; z-index: 5;
  font: 600 11px/1.45 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: ${CREAM}; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
}
body #objective:empty { display: none; }

body #start {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  z-index: 7; padding: 24px;
  background:
    radial-gradient(120% 90% at 22% 8%, rgba(255, 166, 84, 0.20), transparent 55%),
    radial-gradient(90% 80% at 82% 96%, rgba(47, 182, 201, 0.16), transparent 60%),
    rgba(6, 12, 18, 0.72);
}
body #start.mb-splash-hidden { display: none !important; }
body #start .mb-start-inner {
  width: min(560px, 94vw); padding: 30px 34px 26px; border-radius: 16px;
  background: linear-gradient(165deg, rgba(14, 24, 34, 0.90), rgba(8, 15, 22, 0.94));
  border: 1px solid rgba(255, 226, 183, 0.22);
  box-shadow: 0 26px 70px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  color: ${CREAM};
  font: 500 13px/1.5 "Trebuchet MS", "Segoe UI", sans-serif;
  text-align: center;
}
body #start .mb-splash-title {
  font: 700 44px/1.04 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.16em; color: #fff6e5;
  text-shadow: 0 4px 30px rgba(255, 132, 58, 0.55), 0 1px 2px rgba(0, 0, 0, 0.7);
}
body #start .mb-splash-sub {
  margin-top: 9px; font-size: 12px; letter-spacing: 0.18em;
  text-transform: uppercase; color: #ffcf9b; opacity: 0.92;
}
body #start .mb-start-btn {
  margin: 22px auto 20px; display: block; cursor: pointer;
  padding: 12px 44px; border-radius: 999px; border: 1px solid rgba(255, 196, 132, 0.6);
  background: linear-gradient(180deg, #ffc572, #f0913a);
  color: #23160b; font: 700 15px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.22em; text-transform: uppercase;
  box-shadow: 0 10px 26px rgba(240, 145, 58, 0.34);
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}
body #start .mb-start-btn:hover { transform: translateY(-1px); filter: brightness(1.06); }
body #start .mb-start-btn:active { transform: translateY(1px); box-shadow: 0 5px 14px rgba(240, 145, 58, 0.3); }
body #start .mb-keys {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 18px; margin: 0 auto; max-width: 420px; text-align: left;
  font-size: 11.5px; letter-spacing: 0.06em; color: #e7dcc9;
}
body #start .mb-keys span { opacity: 0.86; }
body #start .mb-keys b {
  display: inline-block; min-width: 52px; margin-right: 6px;
  color: ${AMBER}; font-weight: 700; letter-spacing: 0.1em;
}
body #start .mb-honest {
  margin-top: 20px; padding-top: 13px; border-top: 1px solid rgba(255, 236, 205, 0.14);
  font-size: 11px; letter-spacing: 0.05em; color: #cbbca6; opacity: 0.8;
}

.mb-panel {
  position: absolute; border-radius: 10px;
  background: ${PANEL_BG};
  border: 1px solid ${PANEL_EDGE};
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.32);
  padding: 10px 12px;
}
.mb-tl { left: 18px; top: 18px; min-width: 186px; }
.mb-tr { right: 18px; top: 18px; text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.mb-label {
  font: 700 9.5px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.2em; text-transform: uppercase; color: #c9bda9; opacity: 0.8;
}
.mb-health-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.mb-health-label {
  font: 700 9.5px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.16em; color: #d8cbb8; min-width: 48px;
}
.mb-health-track {
  position: relative; flex: 1; height: 8px; border-radius: 999px; overflow: hidden;
  background: rgba(255, 255, 255, 0.09);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
}
.mb-health-fill {
  height: 100%; width: 100%; border-radius: 999px;
  background: #6fe08c; transition: width 0.16s linear, background-color 0.3s linear;
}
.mb-health-num {
  font: 700 10px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.06em; color: #f0e6d5; min-width: 26px; text-align: right;
}
.mb-ammo-row {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-top: 8px; gap: 12px;
}
.mb-ammo-val {
  font: 700 15px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.08em; color: #fff3df;
}
.mb-district {
  margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 236, 205, 0.12);
  font: 700 11px/1.2 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.16em; text-transform: uppercase; color: #ffd79c;
}
.mb-stars { display: flex; gap: 3px; justify-content: flex-end; }
.mb-star {
  font-size: 19px; line-height: 1; color: rgba(255, 236, 205, 0.16);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  transition: color 0.15s linear, text-shadow 0.15s linear;
}
.mb-star.mb-on { color: ${AMBER}; text-shadow: 0 0 12px rgba(255, 179, 71, 0.75); }
.mb-cash {
  font: 700 20px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.06em; color: #b8f0c9;
  text-shadow: 0 1px 8px rgba(88, 220, 138, 0.3);
}
.mb-jobs-btn {
  pointer-events: auto; cursor: pointer; margin-top: 2px;
  padding: 5px 12px; border-radius: 7px;
  font: 700 10px/1.4 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: #ffe4bd; background: rgba(255, 179, 71, 0.10);
  border: 1px solid rgba(255, 196, 132, 0.34);
  transition: background 0.14s ease, color 0.14s ease;
}
.mb-jobs-btn:hover { background: rgba(255, 179, 71, 0.2); }
.mb-jobs-btn.mb-open { background: rgba(255, 179, 71, 0.26); color: #fff; }

.mb-objective-text { display: block; }
.mb-objective-text.mb-empty { opacity: 0.5; letter-spacing: 0.18em; }
.mb-turf { margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; }
.mb-turf-label {
  font: 700 9.5px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.16em; color: #d6c9b5;
}
.mb-turf-segs { display: flex; gap: 3px; }
.mb-seg {
  width: 18px; height: 6px; border-radius: 2px;
  background: rgba(255, 236, 205, 0.13);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
  transition: background 0.2s linear, box-shadow 0.2s linear;
}
.mb-seg.mb-filled { box-shadow: 0 0 8px rgba(255, 190, 110, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.24); }

.mb-speed {
  position: absolute; right: 22px; bottom: 24px; text-align: right;
  font: 700 34px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.02em; color: #fff6e5;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.6), 0 0 22px rgba(255, 170, 80, 0.22);
  display: none;
}
.mb-speed.mb-show { display: block; }
.mb-speed small {
  display: block; margin-top: 3px;
  font: 700 9.5px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.24em; color: #ffce92; opacity: 0.85;
}

.mb-toasts {
  position: absolute; left: 50%; top: 88px; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 7px;
  width: max-content; max-width: 72vw; pointer-events: none;
}
.mb-toast {
  padding: 8px 18px; border-radius: 8px;
  background: rgba(10, 19, 27, 0.82);
  border: 1px solid rgba(255, 196, 132, 0.4);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.42);
  font: 700 11px/1.35 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.14em; text-transform: uppercase; text-align: center;
  color: #ffe6c2;
  animation: mb-toast-in 0.18s ease-out;
}
.mb-toast.mb-toast-out { opacity: 0; transform: translateY(-6px); transition: opacity 0.24s ease, transform 0.24s ease; }
@keyframes mb-toast-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.mb-jobs {
  position: absolute; right: 18px; top: 132px; width: 296px; max-height: 48vh;
  display: none; flex-direction: column; gap: 8px; padding: 12px 13px;
  border-radius: 11px; background: rgba(9, 17, 25, 0.82);
  border: 1px solid ${PANEL_EDGE};
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.46);
  pointer-events: auto; overflow: hidden;
}
.mb-jobs.mb-open { display: flex; }
.mb-jobs-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  padding-bottom: 8px; border-bottom: 1px solid rgba(255, 236, 205, 0.14);
}
.mb-jobs-title {
  font: 700 11px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.2em; color: #ffd79c;
}
.mb-jobs-count {
  font: 700 9.5px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.14em; color: #b9ad99;
}
.mb-jobs-list { display: flex; flex-direction: column; gap: 7px; overflow-y: auto; padding-right: 3px; }
.mb-jobs-list::-webkit-scrollbar { width: 5px; }
.mb-jobs-list::-webkit-scrollbar-thumb { background: rgba(255, 196, 132, 0.28); border-radius: 999px; }
.mb-job {
  padding: 8px 10px; border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 236, 205, 0.10);
  border-left: 2px solid rgba(255, 236, 205, 0.18);
}
.mb-job.mb-job-active {
  background: rgba(255, 179, 71, 0.10);
  border-color: rgba(255, 196, 132, 0.4);
  border-left-color: ${AMBER};
}
.mb-job.mb-job-done { opacity: 0.62; border-left-color: #67c98a; }
.mb-job-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.mb-job-name {
  font: 700 12px/1.3 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.04em; color: #fff2dd;
}
.mb-job-reward {
  font: 700 10.5px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.06em; color: #a9e9bf; white-space: nowrap;
}
.mb-job-meta {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-top: 4px;
  font: 700 8.5px/1.2 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.16em; text-transform: uppercase; color: #b3a794;
}
.mb-job-status { color: #ffce92; }
.mb-job-status.mb-st-done { color: #8fdcab; }
.mb-job-status.mb-st-active { color: #ffd06b; }
.mb-jobs-note {
  padding: 6px 2px 2px; text-align: center;
  font: 700 9.5px/1.4 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.16em; text-transform: uppercase; color: #a9e9bf;
}
.mb-jobs-empty {
  padding: 10px 4px; text-align: center;
  font: 600 10.5px/1.5 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.1em; color: #b3a794;
}

.mb-pause {
  position: absolute; inset: 0; display: none;
  align-items: center; justify-content: center; z-index: 6;
  background: rgba(6, 12, 18, 0.62);
  pointer-events: auto;
  backdrop-filter: blur(2px);
}
.mb-pause.mb-open { display: flex; }
.mb-pause-inner {
  width: min(340px, 90vw); padding: 26px 28px; border-radius: 14px; text-align: center;
  background: linear-gradient(165deg, rgba(14, 24, 34, 0.94), rgba(8, 15, 22, 0.96));
  border: 1px solid rgba(255, 226, 183, 0.22);
  box-shadow: 0 26px 64px rgba(0, 0, 0, 0.55);
  font: 500 12px/1.5 "Trebuchet MS", "Segoe UI", sans-serif; color: ${CREAM};
}
.mb-pause-title {
  font: 700 30px/1.1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.28em; color: #fff6e5;
  text-shadow: 0 3px 22px rgba(255, 150, 70, 0.4);
}
.mb-pause-sub {
  margin-top: 8px; font: 600 10.5px/1.4 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.16em; text-transform: uppercase; color: #d3c4ae;
}
.mb-resume-btn {
  margin: 20px auto 14px; display: block; cursor: pointer;
  padding: 10px 34px; border-radius: 999px; border: 1px solid rgba(255, 196, 132, 0.55);
  background: linear-gradient(180deg, #ffc572, #f0913a);
  color: #23160b; font: 700 12.5px/1 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.2em; text-transform: uppercase;
  box-shadow: 0 8px 22px rgba(240, 145, 58, 0.32);
  transition: transform 0.12s ease, filter 0.12s ease;
}
.mb-resume-btn:hover { transform: translateY(-1px); filter: brightness(1.06); }
.mb-pause-stats {
  padding-top: 11px; border-top: 1px solid rgba(255, 236, 205, 0.14);
  font: 700 10px/1.5 "Trebuchet MS", "Segoe UI", sans-serif;
  letter-spacing: 0.14em; color: #ffd79c;
}
body.mb-started #title { opacity: 0; transition: opacity 0.6s ease; }

`;

function panel(cls) {
  const node = document.createElement('div');
  node.className = 'mb-panel ' + cls;
  return node;
}

function label(text) {
  const node = document.createElement('div');
  node.className = 'mb-label';
  node.textContent = text;
  return node;
}

export class HUD {
  constructor(options) {
    const opts = options && typeof options === 'object' ? options : {};
    this.onStart = typeof opts.onStart === 'function' ? opts.onStart : function noop() {};
    this.onPauseToggle = typeof opts.onPauseToggle === 'function' ? opts.onPauseToggle : function noop() {};

    this.started = false;
    this.playing = false;
    this.paused = false;
    this.mapVisible = true;

    this.time = 0;
    this._toasts = [];
    this._jobsOpen = false;
    this._jobsKey = '';
    this._minimapReady = false;

    this._injectStyle();
    this._buildStart();
    this._buildHud();
    this._buildMinimap();

    this._setStartVisible(true);
    this._applyMapVisibility();
  }

  // ---------------------------------------------------------------- style / root
  _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  _buildStart() {
    let overlay = document.getElementById('start');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'start';
      document.body.appendChild(overlay);
    }
    overlay.textContent = '';
    this.startOverlay = overlay;

    const inner = document.createElement('div');
    inner.className = 'mb-start-inner';

    const title = document.createElement('div');
    title.className = 'mb-splash-title';
    title.textContent = 'MARISOL BAY';

    const sub = document.createElement('div');
    sub.className = 'mb-splash-sub';
    sub.textContent = 'Take the city, district by district.';

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'mb-start-btn';
    startBtn.textContent = 'START';
    startBtn.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this._begin();
    });

    const keys = document.createElement('div');
    keys.className = 'mb-keys';
    const bindings = [
      ['WASD', 'drive / walk'],
      ['E', 'enter / exit car'],
      ['Mouse', 'camera'],
      ['J', 'next job'],
      ['H', 'missions'],
      ['P / Esc', 'pause'],
      ['M', 'mute'],
    ];
    for (let i = 0; i < bindings.length; i++) {
      const row = document.createElement('span');
      const key = document.createElement('b');
      key.textContent = bindings[i][0];
      row.appendChild(key);
      row.appendChild(document.createTextNode(bindings[i][1]));
      keys.appendChild(row);
    }

    const honest = document.createElement('div');
    honest.className = 'mb-honest';
    honest.textContent = "Built by an AI agent for make.fun's Make GTA 6 bounty.";

    inner.appendChild(title);
    inner.appendChild(sub);
    inner.appendChild(startBtn);
    inner.appendChild(keys);
    inner.appendChild(honest);
    overlay.appendChild(inner);
  }

  _buildHud() {
    let root = document.getElementById('hud');
    if (!root) {
      root = document.createElement('div');
      root.id = 'hud';
      document.body.appendChild(root);
    }
    this.root = root;

    const topLeft = panel('mb-tl');
    const healthRow = document.createElement('div');
    healthRow.className = 'mb-health-row';
    const healthLabel = document.createElement('span');
    healthLabel.className = 'mb-health-label';
    healthLabel.textContent = 'HEALTH';
    const track = document.createElement('div');
    track.className = 'mb-health-track';
    const fill = document.createElement('div');
    fill.className = 'mb-health-fill';
    track.appendChild(fill);
    const healthNum = document.createElement('span');
    healthNum.className = 'mb-health-num';
    healthNum.textContent = '100';
    healthRow.appendChild(healthLabel);
    healthRow.appendChild(track);
    healthRow.appendChild(healthNum);

    const ammoRow = document.createElement('div');
    ammoRow.className = 'mb-ammo-row';
    const ammoLabel = label('AMMO');
    const ammoVal = document.createElement('span');
    ammoVal.className = 'mb-ammo-val';
    ammoVal.textContent = '0';
    ammoRow.appendChild(ammoLabel);
    ammoRow.appendChild(ammoVal);

    const district = document.createElement('div');
    district.className = 'mb-district';
    district.textContent = 'MARISOL BAY';

    topLeft.appendChild(healthRow);
    topLeft.appendChild(ammoRow);
    topLeft.appendChild(district);
    this.root.appendChild(topLeft);

    this.healthFill = fill;
    this.healthNum = healthNum;
    this.ammoVal = ammoVal;
    this.districtEl = district;
    this.healthTrack = track;

    const topRight = panel('mb-tr');
    const stars = document.createElement('div');
    stars.className = 'mb-stars';
    this.stars = [];
    for (let i = 0; i < 5; i++) {
      const star = document.createElement('span');
      star.className = 'mb-star';
      star.textContent = '\u2605';
      stars.appendChild(star);
      this.stars.push(star);
    }
    const cash = document.createElement('div');
    cash.className = 'mb-cash';
    cash.textContent = '$0';

    const jobsBtn = document.createElement('button');
    jobsBtn.type = 'button';
    jobsBtn.className = 'mb-jobs-btn';
    jobsBtn.textContent = 'JOBS (H)';
    jobsBtn.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.toggleMissions();
    });

    topRight.appendChild(stars);
    topRight.appendChild(cash);
    topRight.appendChild(jobsBtn);
    this.root.appendChild(topRight);

    this.cashEl = cash;
    this.jobsBtn = jobsBtn;

    let objectiveEl = document.getElementById('objective');
    if (!objectiveEl) {
      objectiveEl = document.createElement('div');
      objectiveEl.id = 'objective';
      document.body.appendChild(objectiveEl);
    }
    objectiveEl.textContent = '';
    const objectiveText = document.createElement('span');
    objectiveText.className = 'mb-objective-text';
    objectiveText.textContent = 'Explore Marisol Bay';
    const turfRow = document.createElement('div');
    turfRow.className = 'mb-turf';
    const turfLabel = document.createElement('span');
    turfLabel.className = 'mb-turf-label';
    turfLabel.textContent = 'TURF 0/6';
    const segs = document.createElement('div');
    segs.className = 'mb-turf-segs';

    const districtCount = clamp(Math.round(num(TURF && TURF.districtCount, 6)), 1, 12);
    this.turfSegments = [];
    for (let i = 0; i < districtCount; i++) {
      const seg = document.createElement('span');
      seg.className = 'mb-seg';
      const entry = DISTRICTS[i];
      if (entry) seg.style.background = swatch(entry);
      else seg.style.background = 'rgba(255, 236, 205, 0.13)';
      seg.style.opacity = '0.32';
      if (entry && entry.name) seg.title = entry.name;
      segs.appendChild(seg);
      this.turfSegments.push(seg);
    }

    turfRow.appendChild(turfLabel);
    turfRow.appendChild(segs);
    objectiveEl.appendChild(objectiveText);
    objectiveEl.appendChild(turfRow);

    this.objectiveEl = objectiveEl;
    this.objectiveText = objectiveText;
    this.turfLabel = turfLabel;
    this.turfCount = districtCount;

    const speed = document.createElement('div');
    speed.className = 'mb-speed';
    const speedNum = document.createElement('span');
    speedNum.textContent = '0';
    const speedUnit = document.createElement('small');
    speedUnit.textContent = 'KM/H';
    speed.appendChild(speedNum);
    speed.appendChild(speedUnit);
    this.root.appendChild(speed);
    this.speedEl = speed;
    this.speedNum = speedNum;

    const toasts = document.createElement('div');
    toasts.className = 'mb-toasts';
    this.root.appendChild(toasts);
    this.toastBox = toasts;

    const jobs = document.createElement('div');
    jobs.className = 'mb-jobs';
    const jobsHead = document.createElement('div');
    jobsHead.className = 'mb-jobs-head';
    const jobsTitle = document.createElement('div');
    jobsTitle.className = 'mb-jobs-title';
    jobsTitle.textContent = 'STORY JOBS';
    const jobsCount = document.createElement('div');
    jobsCount.className = 'mb-jobs-count';
    jobsCount.textContent = '0/0';
    jobsHead.appendChild(jobsTitle);
    jobsHead.appendChild(jobsCount);
    const jobsList = document.createElement('div');
    jobsList.className = 'mb-jobs-list';
    const jobsNote = document.createElement('div');
    jobsNote.className = 'mb-jobs-note';
    jobsNote.textContent = 'ALL STORY JOBS COMPLETE';
    jobsNote.style.display = 'none';
    jobs.appendChild(jobsHead);
    jobs.appendChild(jobsList);
    jobs.appendChild(jobsNote);
    this.root.appendChild(jobs);
    this.jobsEl = jobs;
    this.jobsList = jobsList;
    this.jobsCountEl = jobsCount;
    this.jobsNote = jobsNote;

    const pause = document.createElement('div');
    pause.className = 'mb-pause';
    const pauseInner = document.createElement('div');
    pauseInner.className = 'mb-pause-inner';
    const pauseTitle = document.createElement('div');
    pauseTitle.className = 'mb-pause-title';
    pauseTitle.textContent = 'PAUSED';
    const pauseSub = document.createElement('div');
    pauseSub.className = 'mb-pause-sub';
    pauseSub.textContent = 'Press P to resume';
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.className = 'mb-resume-btn';
    resume.textContent = 'RESUME';
    resume.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.onPauseToggle();
    });
    const pauseStats = document.createElement('div');
    pauseStats.className = 'mb-pause-stats';
    pauseStats.textContent = 'CASH $0  \u00b7  TURF 0/6';
    pauseInner.appendChild(pauseTitle);
    pauseInner.appendChild(pauseSub);
    pauseInner.appendChild(resume);
    pauseInner.appendChild(pauseStats);
    pause.appendChild(pauseInner);
    this.root.appendChild(pause);
    this.pauseEl = pause;
    this.pauseStats = pauseStats;
  }

  _buildMinimap() {
    let canvas = document.getElementById('minimap');
    if (!canvas || canvas.tagName !== 'CANVAS') {
      if (canvas && canvas.appendChild) {
        const nested = document.createElement('canvas');
        nested.id = 'minimap-canvas';
        canvas.appendChild(nested);
        canvas = nested;
      } else {
        canvas = document.createElement('canvas');
        canvas.id = 'minimap';
        document.body.appendChild(canvas);
      }
    }
    canvas.classList.add('mb-map');
    canvas.style.width = MAP_SIZE + 'px';
    canvas.style.height = MAP_SIZE + 'px';

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(MAP_SIZE * dpr);
    canvas.height = Math.round(MAP_SIZE * dpr);

    this.mmCanvas = canvas;
    this.mmCtx = canvas.getContext('2d');
    this.mmSize = MAP_SIZE;
    this.mmDpr = dpr;

    const west = num(WORLD.minX, -208) - 26;
    this.mmBounds = {
      x0: west,
      x1: num(WORLD.maxX, 226),
      z0: num(WORLD.minZ, -226),
      z1: num(WORLD.maxZ, 226),
    };
    this._minimapReady = !!this.mmCtx;
  }

  // ---------------------------------------------------------------- start / pause
  _setStartVisible(visible) {
    if (!this.startOverlay) return;
    if (visible) {
      this.startOverlay.classList.remove('mb-splash-hidden', 'hidden');
      this.startOverlay.style.display = 'flex';
    } else {
      this.startOverlay.classList.add('mb-splash-hidden');
      this.startOverlay.style.display = 'none';
    }
  }

  _begin() {
    if (this.started) return;
    this.started = true;
    this.playing = true;
    this.paused = false;
    this._setStartVisible(false);
    this._setPauseVisible(false);
    try {
      this.onStart();
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('hud: onStart failed', err);
    }
  }

  _setPauseVisible(visible) {
    if (!this.pauseEl) return;
    if (visible && this.started) this.pauseEl.classList.add('mb-open');
    else this.pauseEl.classList.remove('mb-open');
  }

  setPaused(paused) {
    const next = !!paused && this.started;
    this.paused = next;
    this.playing = this.started && !next;
    this._setPauseVisible(next);
  }

  setMinimap(visible) {
    this.mapVisible = visible !== false;
    this._applyMapVisibility();
  }

  _applyMapVisibility() {
    if (!this.mmCanvas) return;
    if (this.mapVisible) this.mmCanvas.classList.remove('mb-map-off');
    else this.mmCanvas.classList.add('mb-map-off');
    this.mmCanvas.style.visibility = this.mapVisible ? 'visible' : 'hidden';
  }

  toggleMissions() {
    this._jobsOpen = !this._jobsOpen;
    this._applyJobsVisibility();
    if (this._jobsOpen) this._jobsKey = '';
  }

  _applyJobsVisibility() {
    if (!this.jobsEl) return;
    if (this._jobsOpen) this.jobsEl.classList.add('mb-open');
    else this.jobsEl.classList.remove('mb-open');
    if (this.jobsBtn) {
      if (this._jobsOpen) this.jobsBtn.classList.add('mb-open');
      else this.jobsBtn.classList.remove('mb-open');
    }
  }

  // ---------------------------------------------------------------- toasts
  toast(text, seconds) {
    if (!this.toastBox) return;
    const message = str(text, '');
    if (!message) return;
    const life = Math.max(0.4, num(seconds, 2.5));

    while (this._toasts.length >= TOAST_LIMIT) {
      const oldest = this._toasts.shift();
      this._killToast(oldest);
    }

    const node = document.createElement('div');
    node.className = 'mb-toast';
    node.textContent = message;
    this.toastBox.appendChild(node);

    const entry = { node: node, timer: null, out: null };
    entry.timer = setTimeout(() => {
      this._dismissToast(entry);
    }, life * 1000);
    this._toasts.push(entry);
  }

  _dismissToast(entry) {
    if (!entry || !entry.node || entry.out) return;
    entry.out = setTimeout(() => this._killToast(entry), 250);
    entry.node.classList.add('mb-toast-out');
    const index = this._toasts.indexOf(entry);
    if (index >= 0) this._toasts.splice(index, 1);
  }

  _killToast(entry) {
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.out) clearTimeout(entry.out);
    if (entry.node && entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
    const index = this._toasts.indexOf(entry);
    if (index >= 0) this._toasts.splice(index, 1);
  }

  // ---------------------------------------------------------------- main update
  update(dt, snapshot) {
    const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
    this.time += Math.max(0, num(dt, 0));

    if (document.body) {
      const has = document.body.classList.contains('mb-started');
      if (this.started && !has) document.body.classList.add('mb-started');
      else if (!this.started && has) document.body.classList.remove('mb-started');
    }

    const wanted = clamp(Math.round(num(s.wanted, 0)), 0, 5);
    if (this.stars) {
      for (let i = 0; i < this.stars.length; i++) {
        if (i < wanted) this.stars[i].classList.add('mb-on');
        else this.stars[i].classList.remove('mb-on');
      }
    }

    const cash = num(s.cash, 0);
    if (this.cashEl) this.cashEl.textContent = money(cash);

    const health = clamp(num(s.health, 100), 0, 100);
    if (this.healthFill) {
      this.healthFill.style.width = health.toFixed(1) + '%';
      this.healthFill.style.backgroundColor = healthColor(health);
    }
    if (this.healthNum) this.healthNum.textContent = String(Math.round(health));
    if (this.healthTrack) this.healthTrack.setAttribute('aria-label', 'Health ' + Math.round(health));

    if (this.ammoVal) {
      const ammo = num(s.ammo, 0);
      this.ammoVal.textContent = String(Math.max(0, Math.round(ammo)));
    }

    if (this.districtEl) {
      const name = str(s.district, '').trim();
      this.districtEl.textContent = name ? name.toUpperCase() : 'MARISOL BAY';
    }

    const objective = str(s.objective, '').trim();
    if (this.objectiveText) {
      this.objectiveText.textContent = objective || 'Explore Marisol Bay';
      if (objective) this.objectiveText.classList.remove('mb-empty');
      else this.objectiveText.classList.add('mb-empty');
    }

    const turf = s.turf && typeof s.turf === 'object' ? s.turf : {};
    const takenRaw = num(turf.taken, num(s.districtsTaken, 0));
    const taken = clamp(Math.round(takenRaw), 0, this.turfCount);
    const total = clamp(Math.round(num(turf.total, this.turfCount)), 1, this.turfCount);
    if (this.turfLabel) this.turfLabel.textContent = 'TURF ' + taken + '/' + total;
    if (this.turfSegments) {
      for (let i = 0; i < this.turfSegments.length; i++) {
        const seg = this.turfSegments[i];
        const filled = i < taken;
        if (filled) {
          seg.classList.add('mb-filled');
          seg.style.opacity = '1';
        } else {
          seg.classList.remove('mb-filled');
          seg.style.opacity = '0.32';
        }
      }
    }

    const speedBox = this.speedEl;
    if (speedBox) {
      if (s.driving) {
        speedBox.classList.add('mb-show');
        if (this.speedNum) {
          const kmh = Math.round(Math.abs(num(s.speed, 0)) * 3.6);
          this.speedNum.textContent = String(kmh);
        }
      } else {
        speedBox.classList.remove('mb-show');
      }
    }

    if (this.pauseEl && this.paused) {
      const text = money(cash) + '  \u00b7  TURF ' + taken + '/' + total;
      if (this.pauseStats) this.pauseStats.textContent = text;
    }

    if (this._minimapReady && this.mapVisible) this._drawMinimap(s);

    if (this._jobsOpen) this._refreshJobs(s.missions);
  }

  _refreshJobs(list) {
    if (!this.jobsList) return;
    const items = Array.isArray(list) ? list : [];
    let doneCount = 0;
    let signature = String(items.length);
    for (let i = 0; i < items.length; i++) {
      const m = items[i] || {};
      if (isDone(m.status)) doneCount++;
      signature += '|' + str(m.id, '') + ':' + str(m.status, '') + ':' + str(m.title, '') + ':' +
        str(m.district, '') + ':' + num(m.reward, 0);
    }
    if (this.jobsCountEl) this.jobsCountEl.textContent = doneCount + '/' + items.length;

    const allDone = items.length > 0 && doneCount === items.length;
    if (this.jobsNote) this.jobsNote.style.display = allDone ? 'block' : 'none';
    if (signature === this._jobsKey) return;
    this._jobsKey = signature;

    this.jobsList.textContent = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'mb-jobs-empty';
      empty.textContent = 'NO STORY JOBS AVAILABLE';
      this.jobsList.appendChild(empty);
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const m = items[i] || {};
      const status = str(m.status, '');
      const active = isActive(status);
      const done = isDone(status);

      const row = document.createElement('div');
      row.className = 'mb-job' + (active ? ' mb-job-active' : '') + (done ? ' mb-job-done' : '');
      if (str(m.id, '')) row.setAttribute('data-job', str(m.id, ''));

      const top = document.createElement('div');
      top.className = 'mb-job-top';
      const name = document.createElement('span');
      name.className = 'mb-job-name';
      name.textContent = str(m.title, 'Untitled job');
      const reward = document.createElement('span');
      reward.className = 'mb-job-reward';
      const amount = num(m.reward, 0);
      reward.textContent = amount > 0 ? '+$' + Math.round(amount).toLocaleString('en-US') : '';

      top.appendChild(name);
      top.appendChild(reward);

      const meta = document.createElement('div');
      meta.className = 'mb-job-meta';
      const district = document.createElement('span');
      district.textContent = str(m.district, '') || 'MARISOL BAY';
      const statusEl = document.createElement('span');
      statusEl.className = 'mb-job-status' +
        (done ? ' mb-st-done' : '') + (active ? ' mb-st-active' : '');
      statusEl.textContent = statusLabel(status);

      meta.appendChild(district);
      meta.appendChild(statusEl);

      row.appendChild(top);
      row.appendChild(meta);
      this.jobsList.appendChild(row);
    }
  }

  // ---------------------------------------------------------------- minimap
  _roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  _drawMinimap(s) {
    const ctx = this.mmCtx;
    if (!ctx) return;
    const size = this.mmSize;
    const dpr = this.mmDpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    this._roundRect(ctx, 0.5, 0.5, size - 1, size - 1, 11);
    ctx.clip();

    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#12212c');
    bg.addColorStop(1, '#0a1319');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const b = this.mmBounds;
    const spanX = b.x1 - b.x0;
    const spanZ = b.z1 - b.z0;
    const scale = Math.min((size - MAP_PAD * 2) / spanX, (size - MAP_PAD * 2) / spanZ);
    const originX = (size - spanX * scale) / 2 - b.x0 * scale;
    const originY = (size - spanZ * scale) / 2 - b.z0 * scale;
    const X = (x) => originX + x * scale;
    const Y = (z) => originY + z * scale;

    const landEdge = num(WORLD.landEdgeX, -212);
    const sandLeft = num(WORLD.sandCenterX, -198) - num(WORLD.sandWidth, 28) / 2;
    const sandRight = sandLeft + num(WORLD.sandWidth, 28);

    // ocean on the west edge
    const sea = ctx.createLinearGradient(X(b.x0), 0, X(landEdge), 0);
    sea.addColorStop(0, '#0b3a5e');
    sea.addColorStop(0.7, '#1d6f94');
    sea.addColorStop(1, '#3ea9c1');
    ctx.fillStyle = sea;
    ctx.fillRect(X(b.x0), Y(b.z0), (landEdge - b.x0) * scale, spanZ * scale);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 0.8;
    for (let i = 1; i <= 2; i++) {
      const wx = X(b.x0 + ((landEdge - b.x0) * i) / 3);
      ctx.beginPath();
      ctx.moveTo(wx, Y(b.z0));
      ctx.lineTo(wx, Y(b.z1));
      ctx.stroke();
    }

    // beach sand band
    ctx.fillStyle = '#e2cfa6';
    ctx.fillRect(X(sandLeft), Y(b.z0), (sandRight - sandLeft) * scale, spanZ * scale);

    // district blocks in their palette colors
    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      if (!d || !d.center || !d.size) continue;
      const w = num(d.size.w, 0) * scale;
      const h = num(d.size.d, 0) * scale;
      const dx = X(num(d.center.x, 0) - num(d.size.w, 0) / 2);
      const dy = Y(num(d.center.z, 0) - num(d.size.d, 0) / 2);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = swatch(d);
      ctx.fillRect(dx, dy, w, h);
      ctx.globalAlpha = 1;
      const accent = typeof d.accent === 'number'
        ? '#' + d.accent.toString(16).padStart(6, '0')
        : '#8fa0a8';
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 0.5, dy + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
      ctx.globalAlpha = 1;
    }

    // roads
    const roadW = num(WORLD.roadWidth, 12) * scale;
    ctx.strokeStyle = 'rgba(232, 240, 246, 0.22)';
    ctx.lineWidth = Math.max(1, roadW * 0.55);
    const linesX = Array.isArray(WORLD.gridLinesX) ? WORLD.gridLinesX : [];
    for (let i = 0; i < linesX.length; i++) {
      const px = X(linesX[i]);
      ctx.beginPath();
      ctx.moveTo(px, Y(b.z0));
      ctx.lineTo(px, Y(b.z1));
      ctx.stroke();
    }
    const linesZ = Array.isArray(WORLD.gridLinesZ) ? WORLD.gridLinesZ : [];
    for (let i = 0; i < linesZ.length; i++) {
      const py = Y(linesZ[i]);
      ctx.beginPath();
      ctx.moveTo(X(linesX.length ? linesX[0] : b.x0), py);
      ctx.lineTo(X(linesX.length ? linesX[linesX.length - 1] : b.x1), py);
      ctx.stroke();
    }

    // promenade strip
    ctx.strokeStyle = 'rgba(255, 236, 205, 0.3)';
    ctx.lineWidth = 1.4;
    const promX = X(num(WORLD.promenadeX, -178));
    ctx.beginPath();
    ctx.moveTo(promX, Y(b.z0));
    ctx.lineTo(promX, Y(b.z1));
    ctx.stroke();

    // shoreline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(landEdge), Y(b.z0));
    ctx.lineTo(X(landEdge), Y(b.z1));
    ctx.stroke();

    // traffic
    const traffic = Array.isArray(s.trafficPositions) ? s.trafficPositions : [];
    ctx.fillStyle = 'rgba(226, 236, 242, 0.72)';
    for (let i = 0; i < traffic.length; i++) {
      const p = traffic[i];
      if (!p) continue;
      ctx.fillRect(X(num(p.x, 0)) - 1, Y(num(p.z, 0)) - 1, 2, 2);
    }

    // mission marker
    const marker = s.missionMarker;
    if (marker && typeof marker === 'object') {
      const mx = X(num(marker.x, 0));
      const my = Y(num(marker.z, 0));
      const pulse = 0.62 + 0.38 * Math.sin(this.time * 4.2);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI * 0.25);
      const half = 3.2 + pulse * 2.2;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffc46b';
      ctx.fillRect(-half - 2, -half - 2, (half + 2) * 2, (half + 2) * 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(-half, -half, half * 2, half * 2);
      ctx.strokeStyle = '#fff3dd';
      ctx.lineWidth = 0.9;
      ctx.strokeRect(-half, -half, half * 2, half * 2);
      ctx.restore();
    }

    // police
    const cops = Array.isArray(s.policePositions) ? s.policePositions : [];
    for (let i = 0; i < cops.length; i++) {
      const p = cops[i];
      if (!p) continue;
      const px = X(num(p.x, 0));
      const py = Y(num(p.z, 0));
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ff5a4a';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ff4b3a';
      ctx.beginPath();
      ctx.arc(px, py, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // player arrow
    const playerPos = s.playerPos && typeof s.playerPos === 'object' ? s.playerPos : {};
    const px = clamp(X(num(playerPos.x, 0)), 5, size - 5);
    const py = clamp(Y(num(playerPos.z, 0)), 5, size - 5);
    const heading = num(s.heading, 0);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - heading);
    ctx.beginPath();
    ctx.moveTo(0, -6.2);
    ctx.lineTo(4.2, 4.6);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.2, 4.6);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.75)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(10, 20, 28, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // frame + compass
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 236, 205, 0.16)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, 0.5, 0.5, size - 1, size - 1, 11);
    ctx.stroke();

    ctx.font = '700 8px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 233, 201, 0.65)';
    ctx.fillText('N', size / 2, 11);
  }
}

export default HUD;
