// MARISOL BAY - HUD: wanted stars, cash, health, ammo, speed, mission text, turf
// bars and a live bright street-map minimap drawn on the existing #minimap canvas.

import { DISTRICTS, WORLD } from './config.js';

const MAP_PAD = 8;
const MAP_RATE = 10;
const STYLE_ID = 'marisol-hud-style';

function el(tag, parent, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function style() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
    #hud .mb-panel { position: absolute; pointer-events: none; }
    #hud .mb-topleft { left: 24px; top: 20px; display: flex; flex-direction: column; gap: 7px; }
    #hud .mb-cash { font: 700 26px/1 "Trebuchet MS","Segoe UI",sans-serif; color: #9ff2a8;
      text-shadow: 0 2px 8px rgba(0,0,0,0.7), 0 0 14px rgba(80,220,120,0.35); letter-spacing: 0.04em; }
    #hud .mb-sub { font: 600 11px/1.3 "Trebuchet MS","Segoe UI",sans-serif; letter-spacing: 0.16em;
      text-transform: uppercase; color: #ffd9a4; opacity: 0.85; }
    #hud .mb-healthwrap { width: 190px; height: 11px; border-radius: 6px;
      background: rgba(6,12,18,0.6); border: 1px solid rgba(255,246,229,0.28); overflow: hidden; }
    #hud .mb-health { height: 100%; width: 100%; border-radius: 5px;
      background: linear-gradient(90deg,#39c46b,#8ee06a); transition: width 0.15s linear; }
    #hud .mb-health.low { background: linear-gradient(90deg,#d63b2f,#ff7a4d); }
    #hud .mb-row { display: flex; align-items: center; gap: 10px; }
    #hud .mb-ammo { font: 700 13px/1 "Trebuchet MS","Segoe UI",sans-serif; color: #ffe9c9;
      letter-spacing: 0.08em; }
    #hud .mb-speed { position: absolute; right: 232px; bottom: 26px; text-align: right;
      font: 700 24px/1 "Trebuchet MS","Segoe UI",sans-serif; color: #f4f7ff;
      text-shadow: 0 2px 10px rgba(0,0,0,0.7); letter-spacing: 0.02em; }
    #hud .mb-speed small { font-size: 12px; letter-spacing: 0.18em; opacity: 0.75; }
    #hud .mb-turf { position: absolute; right: 18px; bottom: 236px; width: 190px;
      display: flex; flex-direction: column; gap: 3px; }
    #hud .mb-turftitle { font: 700 10px/1.2 "Trebuchet MS","Segoe UI",sans-serif;
      letter-spacing: 0.16em; text-transform: uppercase; color: #ffcf9b; opacity: 0.9;
      margin-bottom: 2px; }
    #hud .mb-bar { position: relative; height: 7px; border-radius: 4px;
      background: rgba(8,14,20,0.55); border: 1px solid rgba(255,246,229,0.16); overflow: hidden; }
    #hud .mb-bar i { position: absolute; inset: 0 auto 0 0; border-radius: 3px;
      background: linear-gradient(90deg,#2f8f9c,#63d6b0); }
    #hud .mb-bar.taken i { background: linear-gradient(90deg,#ffc14d,#ff8a4d); }
    #hud .mb-barlabel { font: 600 9px/1.1 "Trebuchet MS","Segoe UI",sans-serif;
      letter-spacing: 0.1em; text-transform: uppercase; color: #dfe8ef; opacity: 0.72; }
    #hud .mb-toast { position: absolute; left: 50%; top: 74px; transform: translateX(-50%);
      padding: 9px 20px; border-radius: 8px; background: rgba(10,18,26,0.68);
      border: 1px solid rgba(255,193,77,0.4); color: #ffe9c9;
      font: 700 14px/1.2 "Trebuchet MS","Segoe UI",sans-serif; letter-spacing: 0.1em;
      text-transform: uppercase; opacity: 0; transition: opacity 0.35s ease; max-width: 70vw;
      text-align: center; }
    #hud .mb-toast.on { opacity: 1; }
    #objective { left: 26px; top: 138px; max-width: 460px; }
    #objective .mb-objtitle { color: #ffd166; }
    #minimap { width: 132px; height: 132px; }
    #hud .mb-start { position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; background: rgba(6,11,17,0.72);
      pointer-events: auto; z-index: 8; text-align: center; }
    #start.mb-start { position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; pointer-events: auto; z-index: 8;
      text-align: center; }
    #hud .mb-start.hidden, #hud .mb-pause.hidden, #start.mb-start.hidden { display: none; }
    .mb-logo { font: 700 62px/1 "Trebuchet MS","Segoe UI",sans-serif; letter-spacing: 0.2em;
      color: #fff6e5; text-shadow: 0 4px 30px rgba(255,128,52,0.55), 0 2px 3px rgba(0,0,0,0.7);
      margin-bottom: 6px; }
    .mb-tagline { font: 600 12px/1.4 "Trebuchet MS","Segoe UI",sans-serif;
      letter-spacing: 0.3em; color: #ffcf9b; text-transform: uppercase; margin-bottom: 26px; }
    .mb-play { padding: 13px 34px; border-radius: 9px; cursor: pointer;
      border: 1px solid rgba(255,193,77,0.65); background: rgba(255,150,60,0.16);
      color: #fff1d8; font: 700 15px/1 "Trebuchet MS","Segoe UI",sans-serif;
      letter-spacing: 0.22em; text-transform: uppercase; }
    .mb-play:hover { background: rgba(255,150,60,0.3); }
    .mb-controls { margin-top: 22px; font: 500 12px/1.9 "Trebuchet MS","Segoe UI",sans-serif;
      color: #dfe8ef; opacity: 0.85; letter-spacing: 0.04em; }
    .mb-controls b { color: #ffd166; font-weight: 700; }
    .mb-note { position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%);
      max-width: 640px; font: 400 11px/1.6 "Trebuchet MS","Segoe UI",sans-serif;
      color: #9fb2c0; letter-spacing: 0.03em; text-align: center; padding: 0 18px; }
    #hud .mb-pause { position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; background: rgba(6,11,17,0.62);
      pointer-events: auto; z-index: 7; }
    #hud .mb-pause h2 { font: 700 34px/1 "Trebuchet MS","Segoe UI",sans-serif;
      letter-spacing: 0.24em; color: #fff6e5; margin-bottom: 12px; }
    #hud .mb-pause p { font: 500 13px/1.6 "Trebuchet MS","Segoe UI",sans-serif;
      color: #cfe0ea; letter-spacing: 0.08em; }
    #hud .mb-missions { position: absolute; right: 18px; top: 60px; width: 250px;
      display: none; flex-direction: column; gap: 4px; }
    #hud .mb-missions.on { display: flex; }
    #hud .mb-mtitle { font: 700 11px/1.2 "Trebuchet MS","Segoe UI",sans-serif;
      letter-spacing: 0.18em; text-transform: uppercase; color: #ffcf9b; margin-bottom: 4px; }
    #hud .mb-mission { display: flex; justify-content: space-between; gap: 8px;
      font: 500 10px/1.35 "Trebuchet MS","Segoe UI",sans-serif; color: #dfe8ef;
      background: rgba(8,14,20,0.5); border: 1px solid rgba(255,246,229,0.12);
      border-radius: 5px; padding: 4px 7px; opacity: 0.85; }
    #hud .mb-mission.done { color: #9ff2a8; }
    #hud .mb-mission.locked { opacity: 0.4; }
    #hud .mb-mission b { color: #ffd166; font-weight: 600; }
  `;
  const node = document.createElement('style');
  node.id = STYLE_ID;
  node.textContent = css;
  document.head.appendChild(node);
}

export class HUD {
  constructor(opts = {}) {
    this.root = document.getElementById('hud');
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.id = 'hud';
      document.body.appendChild(this.root);
    }
    style();
    this.onStart = opts.onStart || null;
    this.onPauseToggle = opts.onPauseToggle || null;
    this.playing = false;
    this.paused = false;
    this.started = false;

    this.objNode = document.getElementById('objective');
    this.startNode = document.getElementById('start');
    if (this.startNode) {
      this.startNode.innerHTML = '';
      this.startNode.style.display = 'none';
    }

    this.minimap = document.getElementById('minimap');
    this.map = null;
    this.mapCtx = null;
    this.mapClock = 0;
    this.mapDirty = true;
    this.mapVisible = true;

    this.buildTopLeft();
    this.buildTurf();
    this.buildSpeed();
    this.buildMap();
    this.buildOverlays();
    this.buildToast();
    this.buildMissions();

    this.lastObj = null;
    this.lastCash = null;
    this.lastHealth = null;
    this.lastAmmo = null;
    this.lastWanted = null;
  }

  buildTopLeft() {
    const left = el('div', this.root, 'mb-panel mb-topleft');
    this.cashNode = el('div', left, 'mb-cash', '$0');
    this.districtNode = el('div', left, 'mb-sub', 'BEACHFRONT');

    const healthRow = el('div', left, 'mb-row');
    const hw = el('div', healthRow, 'mb-healthwrap');
    this.healthBar = el('div', hw, 'mb-health');
    this.ammoNode = el('div', healthRow, 'mb-ammo', '12 / 12');

    this.starsNode = el('div', left, 'mb-sub mb-stars', '');
    this.starsNode.style.fontSize = '17px';
    this.starsNode.style.letterSpacing = '0.22em';
    this.starsNode.style.color = '#ffd166';
  }

  buildTurf() {
    this.turfBox = el('div', this.root, 'mb-panel mb-turf');
    this.turfTitle = el('div', this.turfBox, 'mb-turftitle', 'TURF 0/6');
    this.turfBars = [];
    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      const label = el('div', this.turfBox, 'mb-barlabel', d.name);
      const bar = el('div', this.turfBox, 'mb-bar');
      const fill = el('i', bar);
      fill.style.width = '0%';
      this.turfBars.push({ key: d.key, bar, fill, label, value: -1 });
    }
  }

  buildSpeed() {
    this.speedNode = el('div', this.root, 'mb-speed');
    this.speedNode.innerHTML = '0 <small>KM/H</small>';
  }

  buildMap() {
    const size = 206;
    let canvas = this.minimap;
    if (!canvas || canvas.tagName !== 'CANVAS') {
      canvas = document.createElement('canvas');
      canvas.id = 'minimap';
    }
    canvas.width = size;
    canvas.height = size;
    canvas.style.position = 'fixed';
    canvas.style.right = '18px';
    canvas.style.bottom = '18px';
    canvas.style.left = '';
    canvas.style.top = '';
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.style.borderRadius = '10px';
    canvas.style.background = '#e8eef1';
    canvas.style.border = '1px solid rgba(255,246,229,0.35)';
    canvas.style.boxShadow = '0 6px 26px rgba(0,0,0,0.5)';
    canvas.style.zIndex = '5';
    if (!canvas.parentNode) document.body.appendChild(canvas);

    this.map = canvas;
    this.minimap = canvas;
    this.mapCtx = canvas.getContext('2d');
    this.mapSize = size;
  }

  buildOverlays() {
    const host = this.startNode || this.root;
    if (this.startNode) {
      this.startNode.style.display = 'flex';
      this.startNode.style.position = 'fixed';
      this.startNode.style.inset = '0';
      this.startNode.style.zIndex = '8';
      this.startNode.style.background = 'rgba(6,11,17,0.72)';
      this.startNode.style.flexDirection = 'column';
      this.startNode.style.alignItems = 'center';
      this.startNode.style.justifyContent = 'center';
      this.startNode.style.textAlign = 'center';
    }
    this.startOverlay = this.startNode || el('div', this.root, 'mb-start');
    if (this.startNode) this.startOverlay.classList.add('mb-start');
    el('div', host, 'mb-logo', 'MARISOL BAY');
    el('div', host, 'mb-tagline', 'A sun-soaked coastal city');
    const btn = el('button', host, 'mb-play', 'CLICK TO PLAY');
    btn.addEventListener('click', () => this.begin());
    el('div', host, 'mb-controls').innerHTML =
      '<b>WASD</b> move / drive &nbsp; <b>Shift</b> run &nbsp; <b>Space</b> handbrake / jump<br>' +
      '<b>E</b> enter / exit car &nbsp; <b>F</b> punch &nbsp; <b>G</b> / click shoot<br>' +
      '<b>J</b> start next mission &nbsp; <b>H</b> job list &nbsp; <b>M</b> mute &nbsp; <b>Esc / P</b> pause';
    el('div', host, 'mb-note',
      'An original fan-style open-world driving game built for the make.fun bounty. ' +
      'All geometry, city layout and sound are procedurally generated at runtime \u2014 no external assets.');

    this.pauseOverlay = el('div', this.root, 'mb-pause hidden');
    el('h2', this.pauseOverlay, 'PAUSED');
    el('p', this.pauseOverlay, '', 'Press Esc or P to resume');

    this.missionsBox = el('div', this.root, 'mb-panel mb-missions');
    el('div', this.missionsBox, 'mb-mtitle', 'STORY JOBS');
  }

  buildToast() {
    this.toastNode = el('div', this.root, 'mb-toast');
    this.toastTimer = 0;
  }

  buildMissions() {
    this.missionRowNodes = [];
  }

  setMissions(list) {
    if (!list || !this.missionsBox) return;
    if (this.missionRowNodes.length === list.length) {
      for (let i = 0; i < list.length; i++) {
        const row = this.missionRowNodes[i];
        const m = list[i];
        const cls = 'mb-mission' + (m.completed ? ' done' : '') + (m.locked ? ' locked' : '');
        if (row.className !== cls) row.className = cls;
        const text = (i + 1) + '. ' + m.title + (m.completed ? ' \u2713' : m.locked ? ' \u2014' : '');
        if (row.firstChild && row.firstChild.textContent !== text) row.firstChild.textContent = text;
      }
      return;
    }
    for (const row of this.missionRowNodes) this.missionsBox.removeChild(row);
    this.missionRowNodes = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const row = el('div', this.missionsBox,
        'mb-mission' + (m.completed ? ' done' : '') + (m.locked ? ' locked' : ''));
      el('span', row, '', (i + 1) + '. ' + m.title +
        (m.completed ? ' \u2713' : m.locked ? ' \u2014' : ''));
      el('b', row, '', '$' + m.reward);
      this.missionRowNodes.push(row);
    }
  }

  toggleMissions() {
    if (!this.missionsBox) return false;
    this.missionsBox.classList.toggle('on');
    return this.missionsBox.classList.contains('on');
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.playing = true;
    this.paused = false;
    this.startOverlay.classList.add('hidden');
    this.startOverlay.style.display = 'none';
    this.pauseOverlay.classList.add('hidden');
    if (typeof this.onStart === 'function') this.onStart();
  }

  setPaused(on) {
    this.paused = !!on;
    if (!this.pauseOverlay) return;
    this.pauseOverlay.classList.toggle('hidden', !this.paused);
  }

  toast(text, seconds = 4) {
    if (!this.toastNode) return;
    this.toastNode.textContent = text;
    this.toastNode.classList.add('on');
    this.toastTimer = seconds;
  }

  setMinimap(on) {
    this.mapVisible = !!on;
    if (this.map) this.map.style.display = this.mapVisible ? 'block' : 'none';
    if (this.turfBox) this.turfBox.style.display = this.mapVisible ? 'flex' : 'none';
    this.mapDirty = true;
  }

  // ----------------------------------------------------------------- update
  update(dt, snapshot) {
    const s = snapshot || {};
    const step = dt > 0 ? Math.min(dt, 0.25) : 0;

    if (this.toastTimer > 0) {
      this.toastTimer -= step;
      if (this.toastTimer <= 0 && this.toastNode) this.toastNode.classList.remove('on');
    }

    const cash = Math.round(s.cash || 0);
    if (cash !== this.lastCash) {
      this.lastCash = cash;
      this.cashNode.textContent = '$' + cash.toLocaleString('en-US');
    }

    const health = Math.max(0, Math.min(100, s.health === undefined ? 100 : s.health));
    const hp = Math.round(health);
    if (hp !== this.lastHealth) {
      this.lastHealth = hp;
      this.healthBar.style.width = hp + '%';
      this.healthBar.classList.toggle('low', hp < 34);
    }

    const ammo = s.ammo === undefined ? 0 : s.ammo;
    if (ammo !== this.lastAmmo) {
      this.lastAmmo = ammo;
      this.ammoNode.textContent = ammo + ' / 12';
    }

    const stars = Math.max(0, Math.min(5, s.wanted || 0));
    if (stars !== this.lastWanted) {
      this.lastWanted = stars;
      this.starsNode.textContent = '\u2605'.repeat(stars) + '\u2606'.repeat(5 - stars);
      this.starsNode.style.color = stars >= 4 ? '#ff6b5a' : '#ffd166';
      this.starsNode.style.opacity = stars > 0 ? '1' : '0.35';
    }

    if (s.driving) {
      const kmh = Math.round(Math.abs(s.speed || 0) * 3.6);
      if (this.speedNode.textContent.indexOf(String(kmh) + ' ') !== 0) {
        this.speedNode.innerHTML = kmh + ' <small>KM/H</small>';
      }
      this.speedNode.style.display = 'block';
    } else {
      this.speedNode.style.display = 'none';
    }

    if (s.district && this.districtNode.textContent !== s.district.toUpperCase()) {
      this.districtNode.textContent = s.district.toUpperCase();
    }

    const objective = s.objective || '';
    if (this.objNode && objective !== this.lastObj) {
      this.lastObj = objective;
      this.objNode.textContent = objective;
    }

    this.updateTurf(s.turf, s.districtsTaken);
    if (s.missions) this.setMissions(s.missions);

    this.mapClock += step;
    if (this.mapVisible && (this.mapDirty || this.mapClock >= 1 / MAP_RATE)) {
      this.mapClock = 0;
      this.mapDirty = false;
      this.drawMap(s);
    }
  }

  updateTurf(turf, takenCount) {
    if (!turf) return;
    let count = takenCount || 0;
    for (let i = 0; i < this.turfBars.length; i++) {
      const entry = this.turfBars[i];
      const value = Math.round(turf[entry.key] || 0);
      if (value !== entry.value) {
        entry.value = value;
        entry.fill.style.width = value + '%';
        entry.bar.classList.toggle('taken', value >= 100);
      }
    }
    const text = 'TURF ' + count + '/' + DISTRICTS.length;
    if (this.turfTitle.textContent !== text) this.turfTitle.textContent = text;
  }

  // ----------------------------------------------------------------- minimap
  drawMap(s) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const size = this.mapSize;
    const pad = MAP_PAD;
    const span = size - pad * 2;
    const worldW = WORLD.maxX - WORLD.minX;
    const worldH = WORLD.maxZ - WORLD.minZ;
    const sx = span / worldW;
    const sz = span / worldH;
    const scale = Math.min(sx, sz);
    const offX = pad + (span - worldW * scale) / 2;
    const offZ = pad + (span - worldH * scale) / 2;

    const toX = (x) => offX + (x - WORLD.minX) * scale;
    const toY = (z) => offZ + (z - WORLD.minZ) * scale;

    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = '#e8eef1';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#cbd9dd';
    ctx.fillRect(toX(WORLD.landEdgeX - 2), 0, Math.max(0, toX(WORLD.minX) - toX(WORLD.landEdgeX - 2)), size);
    ctx.fillStyle = '#a8d4e2';
    ctx.fillRect(0, 0, Math.max(0, toX(WORLD.landEdgeX - 2)), size);

    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      const x0 = toX(d.center.x - d.size.w / 2);
      const z0 = toY(d.center.z - d.size.d / 2);
      const x1 = toX(d.center.x + d.size.w / 2);
      const z1 = toY(d.center.z + d.size.d / 2);
      const taken = s.turf && (s.turf[d.key] || 0) >= 100;
      ctx.fillStyle = taken ? 'rgba(255,176,94,0.26)' : 'rgba(120,150,160,0.16)';
      ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
      ctx.strokeStyle = taken ? 'rgba(255,150,70,0.65)' : 'rgba(90,120,132,0.32)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, z0 + 0.5, x1 - x0 - 1, z1 - z0 - 1);
    }

    const drawRoads = () => {
      ctx.beginPath();
      for (let i = 0; i < WORLD.gridLinesX.length; i++) {
        const x = toX(WORLD.gridLinesX[i]);
        ctx.moveTo(x, toY(WORLD.minZ + 4));
        ctx.lineTo(x, toY(WORLD.maxZ - 4));
      }
      for (let i = 0; i < WORLD.gridLinesZ.length; i++) {
        const y = toY(WORLD.gridLinesZ[i]);
        ctx.moveTo(toX(WORLD.gridLinesX[0] - 18), y);
        ctx.lineTo(toX(WORLD.maxX - 4), y);
      }
      ctx.stroke();
    };

    ctx.strokeStyle = 'rgba(116,140,150,0.55)';
    const roadPx = Math.max(2.6, WORLD.roadWidth * scale);
    ctx.lineCap = 'butt';
    ctx.lineWidth = roadPx + 1.8;
    drawRoads();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = roadPx;
    drawRoads();

    ctx.strokeStyle = 'rgba(196,214,220,0.9)';
    ctx.lineWidth = Math.max(0.6, roadPx * 0.18);
    ctx.setLineDash([3, 4]);
    drawRoads();
    ctx.setLineDash([]);

    const traffic = s.trafficPositions || [];
    ctx.fillStyle = 'rgba(70,96,112,0.72)';
    for (let i = 0; i < traffic.length; i++) {
      const t = traffic[i];
      ctx.beginPath();
      ctx.arc(toX(t.x), toY(t.z), 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    const police = s.policePositions || [];
    for (let i = 0; i < police.length; i++) {
      const p = police[i];
      ctx.fillStyle = i % 2 === 0 ? '#e03b3b' : '#2f6dff';
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.z), 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    if (s.missionMarker) {
      const mx = toX(s.missionMarker.x);
      const my = toY(s.missionMarker.z);
      const pulse = 5 + Math.sin(Date.now() / 260) * 1.4;
      ctx.fillStyle = '#ffb020';
      ctx.strokeStyle = '#7a4400';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse - 2);
      ctx.lineTo(mx + pulse, my + pulse);
      ctx.lineTo(mx - pulse, my + pulse);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const pp = s.playerPos || { x: 0, z: 0 };
    const px = toX(pp.x);
    const py = toY(pp.z);
    const heading = s.heading || 0;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-heading);
    ctx.fillStyle = '#1f8ea8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -7.5);
    ctx.lineTo(5.4, 6);
    ctx.lineTo(0, 3.2);
    ctx.lineTo(-5.4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#22303c';
    ctx.font = '700 10px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.fillText('N', size - 16, 15);
    ctx.beginPath();
    ctx.fillStyle = '#22303c';
    ctx.moveTo(size - 12, 19);
    ctx.lineTo(size - 15, 26);
    ctx.lineTo(size - 9, 26);
    ctx.closePath();
    ctx.fill();
  }
}
