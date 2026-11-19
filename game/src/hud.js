// MARISOL BAY - HUD: wanted stars, cash, vitals, turf, objective, minimap,
// toasts, job list, start screen and pause menu. DOM + canvas 2D only.

import { WORLD, DISTRICTS } from './config.js';

const MM_SIZE = 132;
const MM_COLORS = ['#6d9184', '#4f7f8c', '#8a7658', '#5a7392', '#8a6250', '#6b7d4e'];

const CONTROLS = [
  ['WASD', 'MOVE / DRIVE'],
  ['SHIFT', 'RUN'],
  ['SPACE', 'JUMP / HANDBRAKE'],
  ['MOUSE DRAG', 'LOOK / AIM'],
  ['E', 'ENTER / EXIT CAR'],
  ['F / CLICK', 'FIGHT / SHOOT'],
  ['J', 'NEXT JOB'],
  ['H', 'JOB LIST'],
  ['P', 'PAUSE'],
  ['M', 'MUTE'],
];

function makeEl(tag, className, parent) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (parent) parent.appendChild(el);
  return el;
}

function fmtMoney(value) {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-US');
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'complete' || s === 'completed' || s === 'done') return 'DONE';
  if (s === 'active' || s === 'in-progress' || s === 'inprogress') return 'ACTIVE';
  if (s === 'available' || s === 'open' || s === 'ready') return 'OPEN';
  if (s === 'locked') return 'LOCKED';
  return s ? s.toUpperCase() : '';
}

export class HUD {
  constructor({ onStart, onPauseToggle } = {}) {
    this.onStart = typeof onStart === 'function' ? onStart : () => {};
    this.onPauseToggle = typeof onPauseToggle === 'function' ? onPauseToggle : () => {};

    this.root = document.getElementById('hud');
    this.startOverlay = document.getElementById('start');
    this.objectiveEl = document.getElementById('objective');
    this.canvas = document.getElementById('minimap');
    this.mapVisible = true;

    this.started = false;
    this.playing = false;
    this.paused = false;
    this.missionsVisible = false;

    this.time = 0;
    this.toastTimer = 0;
    this._text = Object.create(null);
    this._turfSig = '';
    this._missionsSig = '';
    this._hp = -1;
    this._speedOn = null;
    this.ctx2d = null;

    this._distRects = [];
    this._gridX = [];
    this._gridZ = [];
    this._buildMapGeometry();

    this._injectStyle();
    this._buildHud();
    this._buildStart();
    this._bindEvents();
  }

  // ---------------------------------------------------------------- geometry
  _buildMapGeometry() {
    const worldW = WORLD.maxX - WORLD.minX;
    const worldH = WORLD.maxZ - WORLD.minZ;
    this._sx = MM_SIZE / (worldW || 1);
    this._sz = MM_SIZE / (worldH || 1);

    this._distRects = DISTRICTS.map((d, i) => {
      const w = d.size.w * this._sx;
      const h = d.size.d * this._sz;
      return {
        x: this._mx(d.center.x) - w / 2,
        y: this._my(d.center.z) - h / 2,
        w,
        h,
        color: MM_COLORS[i % MM_COLORS.length],
      };
    });

    const gx = WORLD.gridLinesX || [];
    for (let i = 0; i < gx.length; i++) this._gridX.push(this._mx(gx[i]));
    const gz = WORLD.gridLinesZ || [];
    for (let i = 0; i < gz.length; i++) this._gridZ.push(this._my(gz[i]));
  }

  _mx(x) {
    return (x - WORLD.minX) * this._sx;
  }

  _my(z) {
    return (z - WORLD.minZ) * this._sz;
  }

  // ------------------------------------------------------------------- style
  _injectStyle() {
    if (document.getElementById('msb-hud-style')) return;
    const style = document.createElement('style');
    style.id = 'msb-hud-style';
    style.textContent = `
      #hud .msb-panel {
        background: rgba(10, 18, 26, 0.58);
        border: 1px solid rgba(255, 246, 229, 0.18);
        border-radius: 8px;
        color: #ffe9c9;
        font: 600 12px/1.35 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.1em;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
        padding: 6px 10px;
      }
      #hud .msb-topright {
        position: absolute; right: 18px; top: 16px;
        display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
      }
      #hud .msb-stars { display: flex; gap: 3px; font-size: 20px; line-height: 1; }
      #hud .msb-star { color: rgba(255, 246, 229, 0.16); transition: color 120ms linear; }
      #hud .msb-star.on {
        color: #ffd166;
        text-shadow: 0 0 8px rgba(255, 190, 72, 0.75), 0 1px 2px rgba(0, 0, 0, 0.7);
      }
      #hud .msb-cash {
        font: 700 21px/1.2 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.05em; color: #ffe9c9;
      }
      #hud .msb-turf { display: flex; gap: 4px; align-items: center; }
      #hud .msb-turf-label { opacity: 0.7; font-size: 10px; letter-spacing: 0.14em; }
      #hud .msb-pip {
        width: 12px; height: 12px; border-radius: 2px;
        background: rgba(255, 246, 229, 0.12);
        border: 1px solid rgba(255, 246, 229, 0.28);
      }
      #hud .msb-pip.on { background: #ffd166; border-color: #ffd166; }
      #hud .msb-pip.finale { width: 16px; border-color: rgba(255, 209, 102, 0.6); }
      #hud .msb-pip.finale.on { background: #ff9d4d; border-color: #ff9d4d; }
      #hud .msb-vitals {
        position: absolute; left: 28px; bottom: 112px;
        display: flex; align-items: center; gap: 10px;
      }
      #hud .msb-hp {
        width: 148px; height: 10px; border-radius: 5px;
        background: rgba(8, 14, 20, 0.7);
        border: 1px solid rgba(255, 246, 229, 0.22);
        overflow: hidden;
      }
      #hud .msb-hpfill {
        height: 100%; width: 100%; border-radius: 4px;
        background: linear-gradient(90deg, #7fd6a1, #b9e88f);
        transition: width 120ms linear, background 200ms linear;
      }
      #hud .msb-hpfill.low { background: linear-gradient(90deg, #de5b4a, #ff9d4d); }
      #hud .msb-ammo { font-size: 12px; color: #ffe9c9; letter-spacing: 0.12em; }
      #hud .msb-speed {
        position: absolute; right: 18px; bottom: 162px;
        text-align: right; min-width: 92px;
        font: 700 17px/1.2 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.08em;
      }
      #hud .msb-speed small { display: block; font-size: 9px; opacity: 0.65; letter-spacing: 0.18em; }
      #hud .msb-toast {
        position: absolute; left: 50%; top: 68px; transform: translateX(-50%);
        max-width: 620px; text-align: center; display: none;
        font: 700 13px/1.4 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: #fff3dd;
        background: rgba(10, 18, 26, 0.72);
        border: 1px solid rgba(255, 209, 102, 0.4);
        border-radius: 7px; padding: 8px 16px;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
        white-space: nowrap;
      }
      #hud .msb-pause {
        position: absolute; inset: 0; display: none;
        align-items: center; justify-content: center;
        background: rgba(6, 11, 16, 0.66);
        pointer-events: auto;
      }
      #hud .msb-pause-card {
        width: 360px; padding: 24px 26px; border-radius: 12px;
        background: rgba(12, 21, 29, 0.92);
        border: 1px solid rgba(255, 246, 229, 0.2);
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
        text-align: center;
      }
      #hud .msb-pause-title {
        font: 700 22px/1.2 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.24em; color: #ffe9c9; margin-bottom: 4px;
      }
      #hud .msb-pause-sub {
        font: 400 11px/1.4 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.14em; color: #ffcf9b; opacity: 0.8; margin-bottom: 16px;
      }
      #hud .msb-keys {
        display: grid; grid-template-columns: 92px 1fr; gap: 6px 10px;
        text-align: left; font-size: 11px; letter-spacing: 0.08em;
        color: #efe4d2; margin-bottom: 18px;
      }
      #hud .msb-keys b { color: #ffd166; font-weight: 700; }
      #hud .msb-btn {
        pointer-events: auto; cursor: pointer;
        font: 700 13px/1 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: #10171f; background: #ffd166;
        border: 0; border-radius: 6px; padding: 12px 26px;
        box-shadow: 0 6px 22px rgba(255, 186, 64, 0.28);
      }
      #hud .msb-btn:hover { background: #ffe9a8; }
      #hud .msb-missions {
        position: absolute; left: 28px; top: 76px; width: 306px;
        display: none; pointer-events: auto;
        max-height: 52vh; overflow: auto;
      }
      #hud .msb-missions h3 {
        font: 700 12px/1 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.24em; color: #ffd166; margin-bottom: 8px;
      }
      #hud .msb-job {
        display: flex; justify-content: space-between; gap: 10px;
        padding: 4px 0; border-top: 1px solid rgba(255, 246, 229, 0.1);
        font-size: 11px; letter-spacing: 0.05em;
      }
      #hud .msb-job:first-of-type { border-top: 0; }
      #hud .msb-job span { opacity: 0.7; white-space: nowrap; }
      #hud .msb-job em { font-style: normal; color: #ffcf9b; white-space: nowrap; }
      #hud .msb-job.done em { color: #8fd8a4; }
      #hud .msb-job.active em { color: #ffd166; }
      #hud .msb-job.locked { opacity: 0.5; }

      #start.msb-start { pointer-events: auto; }
      #start .msb-start-card {
        width: min(640px, 86vw); text-align: center;
        padding: 34px 42px; border-radius: 16px;
        background: rgba(10, 18, 26, 0.72);
        border: 1px solid rgba(255, 246, 229, 0.22);
        box-shadow: 0 26px 90px rgba(0, 0, 0, 0.6);
        color: #f6efe2;
      }
      #start .msb-start-title {
        font: 700 52px/1 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.24em; color: #fff6e5;
        text-shadow: 0 2px 24px rgba(255, 128, 52, 0.55), 0 2px 3px rgba(0, 0, 0, 0.6);
        margin-bottom: 10px;
      }
      #start .msb-start-sub {
        font: 600 13px/1.4 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.16em; text-transform: uppercase; color: #ffcf9b;
        margin-bottom: 14px;
      }
      #start .msb-start-note {
        font: 400 11px/1.6 "Trebuchet MS", "Segoe UI", sans-serif;
        color: #d8cbb6; opacity: 0.85; margin-bottom: 20px;
      }
      #start .msb-keys {
        display: grid; grid-template-columns: 116px 1fr; gap: 6px 12px;
        text-align: left; font-size: 11px; letter-spacing: 0.08em;
        color: #efe4d2; margin: 0 auto 22px; max-width: 420px;
      }
      #start .msb-keys b { color: #ffd166; font-weight: 700; }
      #start .msb-btn {
        pointer-events: auto; cursor: pointer;
        font: 700 14px/1 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.24em; text-transform: uppercase;
        color: #10171f; background: #ffd166;
        border: 0; border-radius: 7px; padding: 14px 40px;
        box-shadow: 0 8px 30px rgba(255, 186, 64, 0.3);
      }
      #start .msb-btn:hover { background: #ffe9a8; }
      #start .msb-start-hint {
        margin-top: 12px; font: 400 10px/1.4 "Trebuchet MS", "Segoe UI", sans-serif;
        letter-spacing: 0.16em; color: #b9c4c0; opacity: 0.75;
      }
      #start.hidden { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // --------------------------------------------------------------------- DOM
  _buildHud() {
    if (!this.root) return;
    const root = this.root;

    const topRight = makeEl('div', 'msb-topright', root);

    this.starsEl = makeEl('div', 'msb-stars', topRight);
    this._starEls = [];
    for (let i = 0; i < 5; i++) {
      const star = makeEl('span', 'msb-star', this.starsEl);
      star.textContent = '\u2605';
      this._starEls.push(star);
    }

    this.cashEl = makeEl('div', 'msb-cash', topRight);
    this.cashEl.textContent = fmtMoney(0);

    const turfPanel = makeEl('div', 'msb-panel msb-turf', topRight);
    const turfLabel = makeEl('span', 'msb-turf-label', turfPanel);
    turfLabel.textContent = 'TURF';
    this._turfPips = [];
    for (let i = 0; i < 6; i++) this._turfPips.push(makeEl('span', 'msb-pip', turfPanel));
    this._turfPips.push(makeEl('span', 'msb-pip finale', turfPanel));

    const vitals = makeEl('div', 'msb-vitals', root);
    const hp = makeEl('div', 'msb-hp', vitals);
    this.hpFill = makeEl('div', 'msb-hpfill', hp);
    this.ammoEl = makeEl('div', 'msb-ammo', vitals);
    this.ammoEl.textContent = 'AMMO 0';

    this.speedEl = makeEl('div', 'msb-panel msb-speed', root);
    this.speedEl.style.display = 'none';
    this.speedVal = makeEl('div', '', this.speedEl);
    const speedUnit = makeEl('small', '', this.speedEl);
    speedUnit.textContent = 'KM/H';

    this.toastEl = makeEl('div', 'msb-toast', root);

    this.pauseEl = makeEl('div', 'msb-pause', root);
    const card = makeEl('div', 'msb-pause-card', this.pauseEl);
    const pTitle = makeEl('div', 'msb-pause-title', card);
    pTitle.textContent = 'PAUSED';
    const pSub = makeEl('div', 'msb-pause-sub', card);
    pSub.textContent = 'MARISOL BAY \u2014 MILO KADE';
    const keys = makeEl('div', 'msb-keys', card);
    for (let i = 0; i < CONTROLS.length; i++) {
      const label = makeEl('b', '', keys);
      label.textContent = CONTROLS[i][0];
      const desc = makeEl('span', '', keys);
      desc.textContent = CONTROLS[i][1];
    }
    this.resumeBtn = makeEl('button', 'msb-btn', card);
    this.resumeBtn.type = 'button';
    this.resumeBtn.textContent = 'RESUME';

    this.missionsEl = makeEl('div', 'msb-panel msb-missions', root);
    const mTitle = makeEl('h3', '', this.missionsEl);
    mTitle.textContent = 'JOBS';
    this.jobsEl = makeEl('div', '', this.missionsEl);

    if (this.canvas) {
      this.ctx2d = this.canvas.getContext('2d');
      this.canvas.style.display = 'block';
    }
  }

  _buildStart() {
    const overlay = this.startOverlay;
    if (!overlay) return;
    overlay.innerHTML = '';
    overlay.classList.add('msb-start');
    overlay.style.display = 'flex';

    const card = makeEl('div', 'msb-start-card', overlay);
    const title = makeEl('div', 'msb-start-title', card);
    title.textContent = 'MARISOL BAY';
    const sub = makeEl('div', 'msb-start-sub', card);
    sub.textContent = 'Take the city, district by district';
    const note = makeEl('div', 'msb-start-note', card);
    note.textContent = 'An original fan-style open-world game built by an AI agent for make.fun \u2014 no Rockstar assets.';

    const keys = makeEl('div', 'msb-keys', card);
    for (let i = 0; i < CONTROLS.length; i++) {
      const label = makeEl('b', '', keys);
      label.textContent = CONTROLS[i][0];
      const desc = makeEl('span', '', keys);
      desc.textContent = CONTROLS[i][1];
    }

    this.startBtn = makeEl('button', 'msb-btn', card);
    this.startBtn.type = 'button';
    this.startBtn.textContent = 'START';

    const hint = makeEl('div', 'msb-start-hint', card);
    hint.textContent = 'OR PRESS ENTER';
  }

  _bindEvents() {
    if (this.startBtn) {
      this.startBtn.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        this._start();
      });
    }
    if (this.resumeBtn) {
      this.resumeBtn.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        this.onPauseToggle();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (this.started) return;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this._start();
      }
    });
  }

  _hideStart() {
    if (!this.startOverlay) return;
    this.startOverlay.classList.add('hidden');
    this.startOverlay.style.display = 'none';
  }

  _start() {
    const wasStarted = this.started;
    this.started = true;
    this.playing = true;
    this.paused = false;
    this._hideStart();
    this._pauseShown = false;
    if (this.pauseEl) this.pauseEl.style.display = 'none';
    if (!wasStarted) this.onStart();
  }

  // ------------------------------------------------------------------ public
  toast(text, seconds) {
    if (!this.toastEl) return;
    const msg = String(text == null ? '' : text);
    const dur = Number.isFinite(seconds) ? seconds : 2.5;
    this.toastEl.textContent = msg;
    this.toastEl.style.display = msg ? 'block' : 'none';
    this.toastTimer = msg ? Math.max(0.2, dur) : 0;
    if (!msg) this._text.toast = '';
  }

  setPaused(value) {
    this.paused = !!value;
    if (this.pauseEl) {
      this._pauseShown = this.paused;
      this.pauseEl.style.display = this.paused ? 'flex' : 'none';
    }
  }

  setMinimap(value) {
    this.mapVisible = !!value;
    if (this.canvas) this.canvas.style.display = this.mapVisible ? 'block' : 'none';
  }

  toggleMissions() {
    this.missionsVisible = !this.missionsVisible;
    if (!this.missionsEl) return;
    this.missionsEl.style.display = this.missionsVisible ? 'block' : 'none';
    if (this.missionsVisible) this._missionsSig = '';
  }

  update(dt, snapshot) {
    const step = Number.isFinite(dt) ? dt : 0;
    this.time += step;

    if (this.toastTimer > 0) {
      this.toastTimer -= step;
      if (this.toastTimer <= 0) {
        this.toastTimer = 0;
        if (this.toastEl) this.toastEl.style.display = 'none';
      }
    }

    if (this.pauseEl && this._pauseShown !== this.paused) {
      this._pauseShown = this.paused;
      this.pauseEl.style.display = this.paused ? 'flex' : 'none';
    }

    if (!snapshot) return;

    this._renderWanted(snapshot.wanted);
    this._renderCash(snapshot.cash);
    this._renderVitals(snapshot.health, snapshot.ammo);
    this._renderSpeed(snapshot.speed, snapshot.driving);
    this._renderTurf(snapshot.turf, snapshot.districtsTaken);
    this._renderObjective(snapshot.objective, snapshot.district);

    if (this.missionsVisible) this._renderMissions(snapshot.missions);
    if (this.mapVisible) this._drawMinimap(snapshot);
  }

  // ----------------------------------------------------------------- render
  _renderWanted(wanted) {
    const n = Math.max(0, Math.min(5, Math.round(Number(wanted) || 0)));
    if (this._text.wanted === n) return;
    this._text.wanted = n;
    for (let i = 0; i < this._starEls.length; i++) {
      this._starEls[i].classList.toggle('on', i < n);
    }
  }

  _renderCash(cash) {
    const text = fmtMoney(cash);
    if (this._text.cash === text) return;
    this._text.cash = text;
    if (this.cashEl) this.cashEl.textContent = text;
  }

  _renderVitals(health, ammo) {
    const hp = Math.max(0, Math.min(100, Number(health) || 0));
    const pct = Math.round(hp);
    if (this._hp !== pct) {
      this._hp = pct;
      if (this.hpFill) {
        this.hpFill.style.width = pct + '%';
        this.hpFill.classList.toggle('low', pct <= 30);
      }
    }
    const ammoText = 'AMMO ' + Math.max(0, Math.round(Number(ammo) || 0));
    if (this._text.ammo !== ammoText) {
      this._text.ammo = ammoText;
      if (this.ammoEl) this.ammoEl.textContent = ammoText;
    }
  }

  _renderSpeed(speed, driving) {
    const on = !!driving;
    if (this._speedOn !== on) {
      this._speedOn = on;
      if (this.speedEl) this.speedEl.style.display = on ? 'block' : 'none';
      if (!on) this._text.speed = '';
    }
    if (!on) return;
    const kmh = Math.round(Math.abs(Number(speed) || 0) * 3.6);
    if (this._text.speed === kmh) return;
    this._text.speed = kmh;
    if (this.speedVal) this.speedVal.textContent = kmh;
  }

  _renderTurf(turf, districtsTaken) {
    let sig = '';
    const pips = this._turfPips;
    if (turf && Array.isArray(turf.districts)) {
      for (let i = 0; i < turf.districts.length && i < 6; i++) {
        sig += turf.districts[i] && turf.districts[i].taken ? '1' : '0';
      }
      for (let i = (turf.districts.length || 0); i < 6; i++) sig += '0';
      sig += turf.finale ? '1' : '0';
    } else {
      const taken = Math.max(0, Math.min(6, Math.round(Number(districtsTaken) || 0)));
      for (let i = 0; i < 6; i++) sig += i < taken ? '1' : '0';
      sig += '0';
    }
    if (this._turfSig === sig) return;
    this._turfSig = sig;
    for (let i = 0; i < pips.length && i < sig.length; i++) {
      pips[i].classList.toggle('on', sig.charAt(i) === '1');
    }
  }

  _renderObjective(objective, district) {
    let text = objective ? String(objective) : '';
    if (!text) {
      const place = district ? String(district) : '';
      text = place ? place + ' \u2014 PRESS J FOR THE NEXT JOB' : 'PRESS J FOR THE NEXT JOB';
    }
    if (this._text.objective === text) return;
    this._text.objective = text;
    if (this.objectiveEl) this.objectiveEl.textContent = text;
  }

  _renderMissions(missions) {
    const list = Array.isArray(missions) ? missions : [];
    let sig = '';
    for (let i = 0; i < list.length; i++) {
      const m = list[i] || {};
      sig += (m.id || '') + '|' + (m.status || '') + '|' + (m.title || '') + ';';
    }
    if (this._missionsSig === sig) return;
    this._missionsSig = sig;

    if (!this.jobsEl) return;
    this.jobsEl.textContent = '';
    for (let i = 0; i < list.length; i++) {
      const m = list[i] || {};
      const status = statusLabel(m.status);
      const row = makeEl('div', 'msb-job', this.jobsEl);
      if (status === 'DONE') row.classList.add('done');
      else if (status === 'ACTIVE') row.classList.add('active');
      else if (status === 'LOCKED') row.classList.add('locked');
      const name = makeEl('div', '', row);
      name.textContent = m.title ? String(m.title) : 'Untitled job';
      const tag = makeEl('em', '', row);
      tag.textContent = status;
    }
    if (!list.length) {
      const empty = makeEl('div', 'msb-job', this.jobsEl);
      const name = makeEl('div', '', empty);
      name.textContent = 'No jobs on the board';
    }
  }

  // ---------------------------------------------------------------- minimap
  _drawMinimap(snapshot) {
    const ctx = this.ctx2d;
    if (!ctx) return;

    ctx.clearRect(0, 0, MM_SIZE, MM_SIZE);
    ctx.fillStyle = 'rgba(9, 16, 23, 0.82)';
    ctx.fillRect(0, 0, MM_SIZE, MM_SIZE);

    for (let i = 0; i < this._distRects.length; i++) {
      const r = this._distRects[i];
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(255, 246, 229, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < this._gridX.length; i++) {
      const x = Math.round(this._gridX[i]) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, MM_SIZE);
    }
    for (let i = 0; i < this._gridZ.length; i++) {
      const y = Math.round(this._gridZ[i]) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(MM_SIZE, y);
    }
    ctx.stroke();

    if (snapshot.missionMarker) {
      const mx = this._mx(snapshot.missionMarker.x);
      const my = this._my(snapshot.missionMarker.z);
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 4);
      const size = 4.5 + pulse * 2;
      ctx.save();
      ctx.globalAlpha = 0.4 + pulse * 0.55;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(mx, my - size);
      ctx.lineTo(mx + size, my);
      ctx.lineTo(mx, my + size);
      ctx.lineTo(mx - size, my);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const traffic = snapshot.trafficPositions;
    if (Array.isArray(traffic)) {
      ctx.fillStyle = 'rgba(216, 226, 230, 0.55)';
      for (let i = 0; i < traffic.length; i++) {
        const p = traffic[i];
        if (!p) continue;
        ctx.fillRect(this._mx(p.x) - 1, this._my(p.z) - 1, 2, 2);
      }
    }

    const police = snapshot.policePositions;
    if (Array.isArray(police)) {
      ctx.fillStyle = '#ff4b3e';
      for (let i = 0; i < police.length; i++) {
        const p = police[i];
        if (!p) continue;
        const x = this._mx(p.x);
        const y = this._my(p.z);
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const pos = snapshot.playerPos || { x: 0, z: 0 };
    const px = this._mx(pos.x);
    const py = this._my(pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-(Number(snapshot.heading) || 0));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, 6.5);
    ctx.lineTo(-4.2, -4.6);
    ctx.lineTo(0, -2.2);
    ctx.lineTo(4.2, -4.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 246, 229, 0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, MM_SIZE - 1, MM_SIZE - 1);
  }
}
