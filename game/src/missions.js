// MARISOL BAY - turf spine: six district story jobs, the finale and side work.

import * as THREE from 'three';
import { WORLD, DISTRICTS } from './config.js';

const STASH_VALUE = 150;
const TAXI_BASE = 120;
const TRIAL_PAY = 250;
const TAXI_OFFER_EVERY = 50;
const TRIAL_OFFER_EVERY = 70;
const TAXI_PICKUP_WINDOW = 40;
const TRIAL_TIME_LIMIT = 40;
const TAXI_PICKUP_RADIUS = 6;
const TAXI_DROP_RADIUS = 7;
const TRIAL_RADIUS = 7;
const STASH_RADIUS = 3.5;

const districtByKey = {};
for (let i = 0; i < DISTRICTS.length; i++) {
  districtByKey[DISTRICTS[i].key] = DISTRICTS[i];
}

const STASHES = [
  { x: -178, z: 40, district: 'beachfront' },
  { x: -178, z: -20, district: 'beachfront' },
  { x: -80, z: 160, district: 'marina' },
  { x: -140, z: 160, district: 'marina' },
  { x: -140, z: -140, district: 'oldquarter' },
  { x: -20, z: -80, district: 'oldquarter' },
  { x: 40, z: -200, district: 'downtown' },
  { x: 100, z: -80, district: 'downtown' },
  { x: 160, z: 220, district: 'portside' },
  { x: 220, z: 160, district: 'portside' },
  { x: 100, z: 40, district: 'hillside' },
  { x: 160, z: 100, district: 'hillside' },
];

function wantedOf(missions) {
  try {
    const police = missions.opts.police;
    if (!police || typeof police.getWanted !== 'function') return 0;
    const n = Number(police.getWanted());
    return isFinite(n) ? n : 0;
  } catch (err) {
    return 0;
  }
}

function sceneScore(missions, m) {
  const base = m.base || { shots: 0, punch: 0, hitCop: 0, hitPed: 0 };
  const c = missions.counters;
  return (c.shots - base.shots) + (c.punch - base.punch) + (c.hitCop - base.hitCop) + (c.hitPed - base.hitPed);
}

const STORY = [
  {
    id: 'beachfront',
    district: 'beachfront',
    title: 'First Fare',
    reward: 300,
    stages: [
      {
        text: 'GET TO THE BEACHFRONT PICKUP',
        marker: { x: -178, z: 40 },
        radius: 7,
      },
      {
        text: 'DRIVE TO THE BEACHFRONT DROP-OFF',
        marker: { x: -140, z: -80 },
        radius: 7,
      },
    ],
  },
  {
    id: 'marina',
    district: 'marina',
    title: 'Marina Run',
    reward: 450,
    stages: [
      {
        text: 'REACH THE MARINA START',
        marker: { x: -80, z: 100 },
        radius: 8,
      },
      {
        text: 'REACH THE MARINA FINISH IN 75s',
        marker: { x: -20, z: 160 },
        radius: 8,
        limit: 75,
        failReason: 'Time expired',
      },
    ],
  },
  {
    id: 'oldquarter',
    district: 'oldquarter',
    title: 'Old Quarter Debt',
    reward: 500,
    stages: [
      {
        text: 'COLLECT THE CASH STASH 1/3',
        marker: { x: -80, z: -140 },
        radius: 6,
      },
      {
        text: 'COLLECT THE CASH STASH 2/3',
        marker: { x: -20, z: -140 },
        radius: 6,
      },
      {
        text: 'COLLECT THE CASH STASH 3/3',
        marker: { x: -80, z: -80 },
        radius: 6,
      },
    ],
  },
  {
    id: 'downtown',
    district: 'downtown',
    title: 'Downtown Heat',
    reward: 650,
    stages: [
      {
        text: 'CAUSE A SCENE \u2014 GET WANTED 2',
        marker: null,
        radius: 0,
        tick(missions, m, dt, dist) {
          if (wantedOf(missions) >= 2) return 'next';
          if (sceneScore(missions, m) >= 3) return 'next';
          if (m.stageTime > 45) return 'next';
          return 'hold';
        },
      },
      {
        text: 'REACH THE DOWNTOWN SAFE-HOUSE',
        marker: { x: 100, z: -140 },
        radius: 8,
      },
    ],
  },
  {
    id: 'portside',
    district: 'portside',
    title: 'Portside Nights',
    reward: 800,
    onStart(missions) {
      missions.tod('night');
      return undefined;
    },
    onEnd() {
      this.tod('day');
    },
    stages: [
      {
        text: 'REACH THE PORT DOCKS',
        marker: { x: 160, z: 160 },
        radius: 9,
      },
      {
        text: 'HOLD THE DOCKS 20s WITH HEAT',
        marker: { x: 160, z: 160 },
        radius: 11,
        tick(missions, m, dt, dist) {
          const wanted = wantedOf(missions);
          if (wanted >= 1 && dist <= 11) m.hold += dt;
          else m.hold = Math.max(0, m.hold - dt * 0.6);
          if (m.hold >= 20) return 'next';
          if (m.stageTime > 120) return 'next';
          return 'hold';
        },
      },
    ],
  },
  {
    id: 'hillside',
    district: 'hillside',
    title: 'Hillside Crown',
    reward: 1000,
    stages: [
      {
        text: 'HILLSIDE MARKER 1/3 \u2014 120s',
        marker: { x: 100, z: 100 },
        radius: 8,
        tick(missions, m) {
          if (m.totalTime >= 120) return 'fail';
          return null;
        },
        failReason: 'Out of time',
      },
      {
        text: 'HILLSIDE MARKER 2/3 \u2014 120s',
        marker: { x: 160, z: 100 },
        radius: 8,
        tick(missions, m) {
          if (m.totalTime >= 120) return 'fail';
          return null;
        },
        failReason: 'Out of time',
      },
      {
        text: 'HILLSIDE MARKER 3/3 \u2014 120s',
        marker: { x: 100, z: 40 },
        radius: 8,
        tick(missions, m) {
          if (m.totalTime >= 120) return 'fail';
          return null;
        },
        failReason: 'Out of time',
      },
    ],
  },
];

const FINALE = {
  id: 'finale',
  district: null,
  kind: 'finale',
  title: 'King of the Bay',
  reward: 1500,
  stages: [
    {
      text: 'REACH THE DOWNTOWN BEACON',
      marker: { x: 40, z: -80 },
      radius: 10,
    },
    {
      text: 'REACH THE MARINA BEACON',
      marker: { x: -80, z: 100 },
      radius: 10,
    },
    {
      text: 'SURVIVE 30s WITH WANTED 2',
      marker: null,
      radius: 0,
      failReason: 'You went down',
      tick(missions, m, dt) {
        const alive = missions.aliveState();
        if (alive === false) return 'fail';
        const wanted = wantedOf(missions);
        if (wanted >= 2) m.hold += dt;
        else m.hold = Math.max(0, m.hold - dt);
        if (m.hold >= 30) return 'next';
        if (m.stageTime > 120) return 'next';
        return 'hold';
      },
    },
  ],
};

function missionDef(id) {
  for (let i = 0; i < STORY.length; i++) if (STORY[i].id === id) return STORY[i];
  if (id === FINALE.id) return FINALE;
  return null;
}

function finiteNumber(v, fallback) {
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}

export class Missions {
  constructor(opts = {}) {
    this.opts = opts || {};
    this.world = this.opts.world || null;
    this.player = this.opts.player || null;

    this.onTimeOfDay = null;
    this.onEvent = null;

    this.done = new Set();
    this.districts = [];
    this.collected = new Set();
    this.taxiCount = 0;
    this.trialCount = 0;
    this.finaleDone = false;
    this.finaleUnlocked = false;

    this.active = null;
    this.side = null;
    this.marker = null;

    this.counters = { shots: 0, punch: 0, hitCop: 0, hitPed: 0 };
    this.taxiTimer = 0;
    this.trialTimer = 0;
    this.pulse = 0;
    this.beaconTime = 0;

    this.beacon = null;
    this.beaconRing = null;
    this.buildBeacon();
  }

  get isMissionActive() {
    return !!this.active;
  }

  buildBeacon() {
    try {
      const group = this.world && this.world.group;
      if (!group || !THREE) return;
      const root = new THREE.Group();
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.7, 9, 18, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffc95a,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      column.position.y = 4.5;
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 10, 8),
        new THREE.MeshBasicMaterial({
          color: 0xffe1a0,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
        }),
      );
      core.position.y = 5;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.7, 3.5, 24),
        new THREE.MeshBasicMaterial({
          color: 0xffd27a,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      root.add(column);
      root.add(core);
      root.add(ring);
      root.visible = false;
      group.add(root);
      this.beacon = root;
      this.beaconRing = ring;
    } catch (err) {
      this.beacon = null;
      this.beaconRing = null;
    }
  }

  emit(kind, data) {
    try {
      if (typeof this.onEvent === 'function') this.onEvent(kind, data);
    } catch (err) {
      /* hud callbacks are external */
    }
  }

  tod(mode) {
    try {
      if (typeof this.onTimeOfDay === 'function') this.onTimeOfDay(mode);
    } catch (err) {
      /* optional */
    }
  }

  addHeat(amount, reason) {
    try {
      const police = this.opts.police;
      if (police && typeof police.addHeat === 'function') police.addHeat(amount, reason);
    } catch (err) {
      /* optional */
    }
  }

  readCash() {
    return finiteNumber(this.opts.cash, 0);
  }

  addCash(amount) {
    try {
      this.opts.cash = this.readCash() + amount;
    } catch (err) {
      /* cash is a plain property on opts */
    }
  }

  drivingCar() {
    try {
      const fn = this.opts.driving;
      if (typeof fn !== 'function') return null;
      const car = fn();
      return car || null;
    } catch (err) {
      return null;
    }
  }

  playerPoint() {
    const car = this.drivingCar();
    if (car) {
      if (car.group && car.group.position) return car.group.position;
      if (typeof car.x === 'number' && typeof car.z === 'number') return { x: car.x, z: car.z };
    }
    const player = this.player;
    if (player && player.position) return player.position;
    return null;
  }

  aliveState() {
    try {
      const combat = this.opts.combat;
      if (!combat || !combat.state) return null;
      if (combat.state.alive === false) return false;
      const health = finiteNumber(combat.state.health, 100);
      return health > 0;
    } catch (err) {
      return null;
    }
  }

  districtName(key) {
    const d = districtByKey[key];
    return d ? d.name : key;
  }

  missionUnlocked(def) {
    if (!def) return false;
    if (def.kind === 'finale') return this.finaleUnlocked || this.districts.length >= 6;
    const index = STORY.indexOf(def);
    if (index <= 0) return true;
    const prev = STORY[index - 1];
    return this.districts.indexOf(prev.district) !== -1;
  }

  missionStatus(def) {
    if (this.done.has(def.id)) return 'done';
    if (this.active && this.active.id === def.id) return 'active';
    return this.missionUnlocked(def) ? 'available' : 'locked';
  }

  getMissions() {
    const list = [];
    for (let i = 0; i < STORY.length; i++) {
      const def = STORY[i];
      list.push({
        id: def.id,
        title: def.title,
        district: this.districtName(def.district),
        status: this.missionStatus(def),
      });
    }
    list.push({
      id: FINALE.id,
      title: FINALE.title,
      district: 'Marisol Bay',
      status: this.missionStatus(FINALE),
    });
    return list;
  }

  nextMission() {
    for (let i = 0; i < STORY.length; i++) {
      const def = STORY[i];
      if (this.done.has(def.id)) continue;
      if (!this.missionUnlocked(def)) continue;
      return { id: def.id, title: def.title };
    }
    if (!this.done.has(FINALE.id) && this.missionUnlocked(FINALE)) {
      return { id: FINALE.id, title: FINALE.title };
    }
    return null;
  }

  startMission(id) {
    const def = missionDef(id);
    if (!def) return false;
    if (this.done.has(def.id)) return false;
    if (this.active && this.active.id === def.id) return false;
    if (!this.missionUnlocked(def)) {
      this.emit('locked');
      return false;
    }
    this.begin(def, false);
    return true;
  }

  begin(def, silent) {
    try {
      this.side = null;
      this.marker = null;
      this.taxiTimer = 0;
      this.trialTimer = 0;
      this.active = {
        id: def.id,
        def,
        stage: 0,
        entered: false,
        stageTime: 0,
        totalTime: 0,
        hold: 0,
        base: {
          shots: this.counters.shots,
          punch: this.counters.punch,
          hitCop: this.counters.hitCop,
          hitPed: this.counters.hitPed,
        },
      };
      const first = def.stages[0];
      if (first && first.marker) this.marker = { x: first.marker.x, z: first.marker.z };
      if (!silent) this.emit('mission-start', { title: def.title });
      if (typeof def.onStart === 'function') def.onStart.call(this, this);
    } catch (err) {
      this.active = null;
    }
  }

  advance() {
    const m = this.active;
    if (!m) return;
    m.stage++;
    if (m.stage >= m.def.stages.length) {
      this.complete();
      return;
    }
    m.entered = false;
    m.stageTime = 0;
    m.hold = 0;
    const stage = m.def.stages[m.stage];
    this.marker = stage && stage.marker ? { x: stage.marker.x, z: stage.marker.z } : null;
    this.emit('mission-stage');
  }

  fail(reason) {
    const m = this.active;
    if (!m) return;
    const def = m.def;
    try {
      if (typeof def.onEnd === 'function') def.onEnd.call(this, false);
    } catch (err) {
      /* optional hook */
    }
    this.active = null;
    this.marker = null;
    this.emit('mission-fail', { reason: reason || 'Mission failed' });
  }

  complete() {
    const m = this.active;
    if (!m) return;
    const def = m.def;
    const reward = finiteNumber(def.reward, 0);
    this.addCash(reward);
    this.done.add(def.id);
    try {
      if (typeof def.onEnd === 'function') def.onEnd.call(this, true);
    } catch (err) {
      /* optional hook */
    }
    this.active = null;
    this.marker = null;
    if (def.kind === 'finale') {
      this.finaleDone = true;
      this.finaleUnlocked = true;
    } else if (def.district) {
      this.takeDistrict(def.district);
    }
    this.checkFinale();
    this.emit('mission-complete', { reward });
  }

  takeDistrict(key) {
    if (!districtByKey[key]) return;
    if (this.districts.indexOf(key) !== -1) return;
    this.districts.push(key);
    this.emit('district', { name: this.districtName(key) });
    this.addHeat(1, 'turf-takeover');
  }

  checkFinale() {
    if (this.finaleUnlocked) return;
    if (this.districts.length < 6) return;
    this.finaleUnlocked = true;
    this.emit('finale-unlocked');
  }

  update(dt) {
    const step = Math.max(0, Math.min(finiteNumber(dt, 0), 0.1));
    if (step <= 0) return;
    try {
      if (this.active) this.updateMission(step);
      else this.updateSide(step);
      this.updateStashes();
      this.updateBeacon(step);
    } catch (err) {
      /* never let mission logic break the frame */
    }
  }

  updateMission(dt) {
    const m = this.active;
    if (!m) return;
    const stage = m.def.stages[m.stage];
    if (!stage) {
      this.fail('Mission error');
      return;
    }
    if (!m.entered) {
      m.entered = true;
      m.stageTime = 0;
      m.hold = 0;
      if (typeof stage.enter === 'function') {
        try {
          stage.enter.call(this, m);
        } catch (err) {
          /* optional hook */
        }
      }
    }
    m.stageTime += dt;
    m.totalTime += dt;
    this.marker = stage.marker ? { x: stage.marker.x, z: stage.marker.z } : null;

    const point = this.playerPoint();
    let dist = Infinity;
    if (point && this.marker) {
      const dx = point.x - this.marker.x;
      const dz = point.z - this.marker.z;
      dist = Math.sqrt(dx * dx + dz * dz);
    }

    if (stage.limit && m.stageTime >= stage.limit) {
      this.fail(stage.failReason || 'Out of time');
      return;
    }

    let outcome = null;
    if (typeof stage.tick === 'function') {
      try {
        outcome = stage.tick.call(this, this, m, dt, dist);
      } catch (err) {
        outcome = null;
      }
    }

    if (outcome === 'fail') {
      this.fail(stage.failReason || 'Mission failed');
      return;
    }
    if (outcome === 'next') {
      this.advance();
      return;
    }
    if (outcome === 'hold') return;
    if (this.marker && dist <= finiteNumber(stage.radius, 6)) this.advance();
  }

  updateSide(dt) {
    if (this.active) return;
    if (this.side) {
      this.progressSide(dt);
      return;
    }
    const car = this.drivingCar();
    if (!car) return;
    this.taxiTimer += dt;
    this.trialTimer += dt;
    if (this.taxiTimer >= TAXI_OFFER_EVERY) {
      this.taxiTimer = 0;
      this.offerTaxi();
    } else if (this.trialTimer >= TRIAL_OFFER_EVERY) {
      this.trialTimer = 0;
      this.offerTrial();
    }
  }

  offerTaxi() {
    const pickup = this.roadPoint(150);
    if (!pickup) return;
    this.side = {
      kind: 'taxi',
      phase: 'pickup',
      marker: pickup,
      timer: 0,
      driven: 0,
      last: null,
      drop: null,
    };
    this.marker = { x: pickup.x, z: pickup.z };
    this.trialTimer = 0;
    this.emit('taxi-start');
  }

  offerTrial() {
    const point = this.roadPoint(140);
    if (!point) return;
    this.side = { kind: 'trial', marker: point, timer: 0 };
    this.marker = { x: point.x, z: point.z };
    this.taxiTimer = 0;
    this.emit('trial-start');
  }

  progressSide(dt) {
    const s = this.side;
    if (!s) return;
    s.timer += dt;
    this.marker = s.marker;

    const point = this.playerPoint();
    let dist = Infinity;
    if (point && s.marker) {
      const dx = point.x - s.marker.x;
      const dz = point.z - s.marker.z;
      dist = Math.sqrt(dx * dx + dz * dz);
    }

    if (s.kind === 'taxi') {
      if (s.phase === 'pickup') {
        if (point && dist <= TAXI_PICKUP_RADIUS) {
          const drop = this.roadPoint(160, point);
          s.phase = 'drop';
          s.timer = 0;
          s.driven = 0;
          s.last = { x: point.x, z: point.z };
          s.drop = drop || { x: point.x + 60, z: point.z };
          s.marker = s.drop;
          this.marker = s.marker;
          this.emit('taxi-pickup');
        } else if (s.timer >= TAXI_PICKUP_WINDOW) {
          this.side = null;
          this.marker = null;
        }
        return;
      }

      if (s.last && point) {
        const dx = point.x - s.last.x;
        const dz = point.z - s.last.z;
        s.driven += Math.sqrt(dx * dx + dz * dz);
      }
      if (point) s.last = { x: point.x, z: point.z };

      if (point && dist <= TAXI_DROP_RADIUS) {
        const raw = TAXI_BASE + s.driven * 2;
        const cash = Math.max(0, Math.round(raw / 10) * 10);
        this.addCash(cash);
        this.taxiCount++;
        this.side = null;
        this.marker = null;
        this.emit('taxi-complete', { cash });
      }
      return;
    }

    if (point && dist <= TRIAL_RADIUS) {
      this.addCash(TRIAL_PAY);
      this.trialCount++;
      this.side = null;
      this.marker = null;
      this.emit('trial-complete', { cash: TRIAL_PAY });
      return;
    }
    if (s.timer >= TRIAL_TIME_LIMIT) {
      this.side = null;
      this.marker = null;
      this.emit('trial-fail');
    }
  }

  roadPoint(maxDist, origin) {
    const base = origin || this.playerPoint();
    const xs = WORLD.gridLinesX || [];
    const zs = WORLD.gridLinesZ || [];
    const pool = [];
    for (let i = 0; i < xs.length; i++) {
      for (let k = 0; k < zs.length; k++) {
        const x = xs[i];
        const z = zs[k];
        if (!base) {
          pool.push({ x, z });
          continue;
        }
        const dx = x - base.x;
        const dz = z - base.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= 30 && d <= maxDist) pool.push({ x, z });
      }
    }
    if (!pool.length) {
      if (!xs.length || !zs.length) return null;
      const x = xs[Math.floor(xs.length / 2)];
      const z = zs[Math.floor(zs.length / 2)];
      return { x, z };
    }
    return pool[Math.floor(Math.random() * pool.length) % pool.length];
  }

  updateStashes() {
    if (this.collected.size >= STASHES.length) return;
    const point = this.playerPoint();
    if (!point) return;
    const r2 = STASH_RADIUS * STASH_RADIUS;
    for (let i = 0; i < STASHES.length; i++) {
      if (this.collected.has(i)) continue;
      const stash = STASHES[i];
      const dx = point.x - stash.x;
      const dz = point.z - stash.z;
      if (dx * dx + dz * dz > r2) continue;
      this.collected.add(i);
      this.addCash(STASH_VALUE);
      try {
        const effects = this.opts.effects;
        if (effects && typeof effects.spawnBurst === 'function') {
          effects.spawnBurst({ x: stash.x, y: 0.7, z: stash.z }, 'impact', 6);
        }
      } catch (err) {
        /* optional */
      }
      this.emit('collect', { total: this.collected.size });
    }
  }

  updateBeacon(dt) {
    const mk = this.marker;
    const beacon = this.beacon;
    if (beacon) {
      if (!mk) {
        if (beacon.visible) beacon.visible = false;
      } else {
        beacon.visible = true;
        beacon.position.set(mk.x, 0, mk.z);
        this.beaconTime += dt;
        const pulse = 1 + Math.sin(this.beaconTime * 4) * 0.16;
        if (this.beaconRing) this.beaconRing.scale.set(pulse, pulse, pulse);
      }
    }
    if (!mk) {
      this.pulse = 0;
      return;
    }
    this.pulse += dt;
    if (this.pulse < 0.5) return;
    this.pulse = 0;
    try {
      const effects = this.opts.effects;
      if (effects && typeof effects.spawnBurst === 'function') {
        effects.spawnBurst({ x: mk.x, y: 0.55, z: mk.z }, 'dust', 1);
      }
    } catch (err) {
      /* optional */
    }
  }

  notify(kind) {
    try {
      if (kind === 'shot') this.counters.shots++;
      else if (kind === 'punch') this.counters.punch++;
      else if (kind === 'hitCop') this.counters.hitCop++;
      else if (kind === 'hitPed') this.counters.hitPed++;
    } catch (err) {
      /* never throw */
    }
  }

  getCurrentObjective() {
    if (this.active) {
      const stage = this.active.def.stages[this.active.stage];
      return stage && typeof stage.text === 'string' ? stage.text : '';
    }
    if (this.side) {
      if (this.side.kind === 'taxi') {
        return this.side.phase === 'pickup' ? 'PICK UP THE TAXI FARE' : 'DRIVE THE FARE TO THE DROP-OFF';
      }
      return 'REACH THE TIME TRIAL MARKER';
    }
    return '';
  }

  getMarker() {
    if (!this.marker) return null;
    return { x: this.marker.x, z: this.marker.z };
  }

  getTurf() {
    const list = [];
    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      list.push({
        key: d.key,
        name: d.name,
        taken: this.districts.indexOf(d.key) !== -1,
      });
    }
    return {
      taken: this.districts.length,
      total: 6,
      finale: !!this.finaleDone,
      districts: list,
    };
  }

  turfCount() {
    return this.districts.length;
  }

  serialize() {
    return {
      version: 1,
      done: Array.from(this.done),
      districts: this.districts.slice(),
      stashes: Array.from(this.collected).sort((a, b) => a - b),
      taxi: this.taxiCount,
      trials: this.trialCount,
      finaleDone: !!this.finaleDone,
    };
  }

  apply(data) {
    if (!data || typeof data !== 'object') return;
    try {
      this.done = new Set();
      if (Array.isArray(data.done)) {
        for (let i = 0; i < data.done.length; i++) {
          const id = data.done[i];
          if (typeof id === 'string' && missionDef(id)) this.done.add(id);
        }
      }

      this.districts = [];
      if (Array.isArray(data.districts)) {
        for (let i = 0; i < data.districts.length; i++) {
          const key = data.districts[i];
          if (typeof key !== 'string') continue;
          if (!districtByKey[key]) continue;
          if (this.districts.indexOf(key) !== -1) continue;
          this.districts.push(key);
        }
      }

      this.collected = new Set();
      if (Array.isArray(data.stashes)) {
        for (let i = 0; i < data.stashes.length; i++) {
          const index = data.stashes[i];
          if (Number.isInteger(index) && index >= 0 && index < STASHES.length) this.collected.add(index);
        }
      }

      this.taxiCount = Math.max(0, Math.floor(finiteNumber(data.taxi, 0)));
      this.trialCount = Math.max(0, Math.floor(finiteNumber(data.trials, 0)));
      this.finaleDone = !!data.finaleDone;
      this.finaleUnlocked = this.finaleDone || this.districts.length >= 6;

      this.active = null;
      this.side = null;
      this.marker = null;
      this.taxiTimer = 0;
      this.trialTimer = 0;

      if (typeof data.active === 'string') {
        const def = missionDef(data.active);
        if (def && !this.done.has(def.id) && this.missionUnlocked(def)) {
          const taken = def.district ? this.districts.indexOf(def.district) !== -1 : false;
          if (!taken) this.begin(def, true);
        }
      }
    } catch (err) {
      /* ignore partial or malformed saves */
    }
  }
}
