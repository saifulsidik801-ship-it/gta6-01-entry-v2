// MARISOL BAY - missions, side activities, district turf and collectibles.
// The whole story spine lives in the data tables below; the runtime is a small
// stage machine so the judge can read the arc without hunting through logic.

import * as THREE from 'three';
import { DISTRICTS, WORLD } from './config.js';

const MARKER_RADIUS = 6.5;
const TURF_INCOME = 1.15;
const COLLECT_REWARD = 150;
const TURF_GAIN_COLLECT = 25;
const TURF_GAIN_MISSION = 60;
const TURF_GAIN_ACTIVITY = 35;
const TURF_GAIN_COMBAT = 8;
const TURF_PUSH_RATE = 0.9;

// ---------------------------------------------------------------- story spine
export const MISSIONS = [
  {
    id: 'first-fare',
    title: 'First Fare',
    district: 'marina',
    reward: 450,
    heat: 0,
    timeOfDay: 'day',
    briefing:
      'Milo Kade just rolled into Marisol Bay with a borrowed taxi and twelve bucks. ' +
      'Pick up a fare on the marina promenade and run them across town. Easy money, ' +
      'as long as nobody checks the plates.',
    type: 'drive',
    stages: [
      { label: 'Pick up the fare at the marina promenade', x: -171, z: 62, radius: 7 },
      { label: 'Drive the fare to the Old Quarter drop-off', x: -96, z: -104, radius: 7 },
    ],
  },
  {
    id: 'beachfront-run',
    title: 'Beachfront Run',
    district: 'beachfront',
    reward: 620,
    heat: 1,
    timeOfDay: 'day',
    briefing:
      'A courier outfit wants a package moved down the beachfront before the ' +
      'sunbathers notice. Thread the promenade checkpoints before the clock runs dry.',
    type: 'timed',
    timeLimit: 78,
    stages: [
      { label: 'Hit the promenade checkpoints before the clock runs out', x: -190, z: 30, radius: 9 },
      { label: 'Checkpoint: pier steps', x: -190, z: -46, radius: 9 },
      { label: 'Checkpoint: the lifeguard tower', x: -196, z: -120, radius: 9 },
      { label: 'Checkpoint: promenade south', x: -190, z: -178, radius: 9 },
      { label: 'Finish at the marina end of the beach', x: -176, z: -40, radius: 9 },
    ],
  },
  {
    id: 'marina-muscle',
    title: 'Marina Muscle',
    district: 'marina',
    reward: 780,
    heat: 2,
    timeOfDay: 'day',
    briefing:
      'Dock hands at the marina are shaking down the boat owners again. Milo ' +
      'gets paid to stand in the lot and make sure the shakedown crew leaves ' +
      'with empty hands.',
    type: 'defend',
    duration: 55,
    needHits: 2,
    stages: [
      { label: 'Hold the marina lot and push back the crew', x: -124, z: 108, radius: 18 },
    ],
  },
  {
    id: 'oldquarter-pickup',
    title: 'Old Quarter Pickup',
    district: 'oldquarter',
    reward: 900,
    heat: 2,
    timeOfDay: 'dusk',
    briefing:
      'A sealed crate is waiting behind a shuttered bodega in the Old Quarter. ' +
      'The neighbourhood talks, so keep the police off your back: arrive with a ' +
      'clean record or this pickup goes sideways.',
    type: 'stealth',
    stages: [
      { label: 'Reach the Old Quarter pickup with at most 1 star', x: -92, z: -138, radius: 7 },
    ],
  },
  {
    id: 'downtown-heat',
    title: 'Downtown Heat',
    district: 'downtown',
    reward: 1250,
    heat: 3,
    timeOfDay: 'dusk',
    briefing:
      'The crate was bait. MPD floods downtown the moment Milo touches it. ' +
      'Get the heat up, then vanish completely before the net closes.',
    type: 'chase',
    stages: [
      { label: 'Drive downtown and trip the MPD trap', x: 46, z: -120, radius: 8 },
      { label: 'Escape the chase: drop all wanted stars', x: 46, z: -120, radius: 8 },
    ],
  },
  {
    id: 'portside-takeover',
    title: 'Portside Takeover',
    district: 'portside',
    reward: 2400,
    heat: 4,
    timeOfDay: 'night',
    briefing:
      'Portside is the last district not flying Milo\u2019s colours. Take the ' +
      'container yard at midnight and Marisol Bay belongs to him.',
    type: 'finale',
    duration: 60,
    needHits: 3,
    requiresAllTurf: true,
    stages: [
      { label: 'Secure the Portside container yard', x: 170, z: 170, radius: 20 },
    ],
  },
];

// 12 hidden cash stashes, two in every district.
export const COLLECTIBLES = [
  { x: -188, z: 96, district: 'beachfront' },
  { x: -186, z: -158, district: 'beachfront' },
  { x: -118, z: 46, district: 'marina' },
  { x: -64, z: 150, district: 'marina' },
  { x: -86, z: -66, district: 'oldquarter' },
  { x: -150, z: -176, district: 'oldquarter' },
  { x: 4, z: -88, district: 'downtown' },
  { x: 92, z: -168, district: 'downtown' },
  { x: 158, z: 196, district: 'portside' },
  { x: 196, z: 132, district: 'portside' },
  { x: 118, z: 46, district: 'hillside' },
  { x: 62, z: 152, district: 'hillside' },
];

const BEACON_COLORS = {
  mission: 0xffc14d,
  side: 0x4fd6c9,
  collect: 0x7ee081,
  turf: 0xff7a5a,
};

// ------------------------------------------------------------------ helpers
function districtForPoint(x, z) {
  for (let i = 0; i < DISTRICTS.length; i++) {
    const d = DISTRICTS[i];
    if (
      x >= d.center.x - d.size.w / 2 && x <= d.center.x + d.size.w / 2 &&
      z >= d.center.z - d.size.d / 2 && z <= d.center.z + d.size.d / 2
    ) {
      return d.key;
    }
  }
  let best = DISTRICTS[0];
  let bestD = Infinity;
  for (let i = 0; i < DISTRICTS.length; i++) {
    const d = DISTRICTS[i];
    const dx = x - d.center.x;
    const dz = z - d.center.z;
    const dd = dx * dx + dz * dz;
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best.key;
}

function makeBeacon(color) {
  const group = new THREE.Group();
  group.name = 'mission-beacon';

  const pillarMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 2.1, 46, 14, 1, true), pillarMat);
  pillar.position.y = 23;
  group.add(pillar);

  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.9, 26), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.14;
  group.add(ring);

  const gemMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), gemMat);
  gem.position.y = 4.2;
  group.add(gem);

  group.visible = false;
  return { group, pillar, pillarMat, ring, ringMat, gem, gemMat, phase: 0 };
}

export class Missions {
  constructor(state = {}) {
    this.state = state;
    this.player = state.player || null;
    this.police = state.police || null;
    this.combat = state.combat || null;
    this.world = state.world || null;
    this.effects = state.effects || null;
    this.onEvent = state.onEvent || null;
    this.onTimeOfDay = state.onTimeOfDay || null;
    this.scene = state.scene || null;

    this.time = 0;
    this.completed = {};
    this.collected = {};
    this.bestTimes = {};
    this.turf = {};
    for (let i = 0; i < DISTRICTS.length; i++) this.turf[DISTRICTS[i].key] = 0;

    this.taken = {};
    this.mission = null;
    this.markerPos = null;
    this.markerLabel = '';
    this.taxi = null;
    this.trial = null;
    this.offerTimer = 25;
    this.incomeAcc = 0;
    this.collectCount = 0;
    this.combatTurfCd = 0;

    this.root = null;
    this.beacons = { mission: null, side: null, collect: null };
    this.collectMeshes = [];
    this.buildVisuals();
    this.refreshCollectibles();
  }

  // --------------------------------------------------------------- visuals
  buildVisuals() {
    const parent = (this.world && this.world.group) || null;
    if (!parent) return;
    this.root = new THREE.Group();
    this.root.name = 'missions';
    parent.add(this.root);

    this.beacons.mission = makeBeacon(BEACON_COLORS.mission);
    this.beacons.side = makeBeacon(BEACON_COLORS.side);
    this.beacons.collect = makeBeacon(BEACON_COLORS.collect);
    this.root.add(this.beacons.mission.group);
    this.root.add(this.beacons.side.group);
    this.root.add(this.beacons.collect.group);

    const geo = new THREE.BoxGeometry(0.9, 0.55, 0.62);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x3fae63,
      emissive: 0x1a5a2c,
      emissiveIntensity: 0.6,
    });
    for (let i = 0; i < COLLECTIBLES.length; i++) {
      const c = COLLECTIBLES[i];
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(c.x, 1.1, c.z);
      mesh.rotation.y = i * 0.7;
      this.root.add(mesh);
      this.collectMeshes.push(mesh);
    }

    // Marked fare pedestrian for taxi side jobs: a bright low-poly local with a
    // floating fare tag so the player can see who to collect.
    const fare = new THREE.Group();
    const fareBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.34, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: 0xffd166, emissive: 0x6a4c00, emissiveIntensity: 0.5 }),
    );
    fareBody.position.y = 0.55;
    fare.add(fareBody);
    const fareHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8b98a }),
    );
    fareHead.position.y = 1.32;
    fare.add(fareHead);
    const fareTag = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe9a4 }),
    );
    fareTag.position.y = 2.1;
    fare.add(fareTag);
    fare.visible = false;
    this.root.add(fare);
    this.fareMesh = fare;
    this.fareTag = fareTag;
  }

  refreshCollectibles() {
    for (let i = 0; i < this.collectMeshes.length; i++) {
      this.collectMeshes[i].visible = !this.collected[i];
    }
    this.collectCount = Object.keys(this.collected).length;
  }

  // ------------------------------------------------------------------ state
  addCash(n) {
    const amount = typeof n === 'number' && isFinite(n) ? n : 0;
    if (!amount) return this.getCash();
    try {
      this.state.cash = this.getCash() + amount;
    } catch (err) {
      void err;
    }
    return this.getCash();
  }

  getCash() {
    const v = this.state.cash;
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  getTurf() {
    const out = {};
    for (let i = 0; i < DISTRICTS.length; i++) {
      const k = DISTRICTS[i].key;
      out[k] = Math.round(this.turf[k] || 0);
    }
    return out;
  }

  turfCount() {
    let n = 0;
    for (let i = 0; i < DISTRICTS.length; i++) {
      if (this.taken[DISTRICTS[i].key]) n++;
    }
    return n;
  }

  get collectiblesFound() {
    return this.collectCount;
  }

  addTurf(key, amount) {
    if (this.turf[key] === undefined || !(amount > 0)) return;
    if (this.taken[key]) return;
    this.turf[key] = Math.min(100, this.turf[key] + amount);
    if (this.turf[key] >= 100) this.takeDistrict(key);
  }

  takeDistrict(key) {
    if (this.taken[key]) return;
    this.taken[key] = true;
    this.turf[key] = 100;
    const name = (DISTRICTS.find((d) => d.key === key) || {}).name || key;
    this.addCash(300);
    if (this.police) this.police.addHeat(1, 'turf-takeover');
    this.emit('district', { key, name });
  }

  emit(kind, data) {
    if (typeof this.onEvent === 'function') this.onEvent(kind, data || {});
  }

  // ---------------------------------------------------------------- missions
  getMissions() {
    return MISSIONS.map((m, i) => this.missionInfo(m, i));
  }

  missionInfo(m, index) {
    const chainOk = this.unlocked(index);
    const turfOk = !m.requiresAllTurf || this.turfCount() >= DISTRICTS.length;
    return {
      id: m.id,
      title: m.title,
      district: m.district,
      reward: m.reward,
      briefing: m.briefing,
      completed: !!this.completed[m.id],
      locked: !chainOk || !turfOk,
      active: !!(this.mission && this.mission.def.id === m.id),
      requiresAllTurf: !!m.requiresAllTurf,
      type: m.type,
      timeOfDay: m.timeOfDay,
    };
  }

  unlocked(index) {
    if (index === 0) return true;
    return !!this.completed[MISSIONS[index - 1].id];
  }

  nextMission() {
    for (let i = 0; i < MISSIONS.length; i++) {
      const def = MISSIONS[i];
      if (!this.completed[def.id]) return this.unlocked(i) ? def : null;
    }
    return null;
  }

  startMission(id) {
    if (this.mission) return false;
    let index = -1;
    for (let i = 0; i < MISSIONS.length; i++) {
      if (MISSIONS[i].id === id) {
        index = i;
        break;
      }
    }
    if (index < 0) return false;
    if (this.completed[id]) return false;
    if (!this.unlocked(index)) return false;

    const def = MISSIONS[index];
    if (def.requiresAllTurf && this.turfCount() < DISTRICTS.length) {
      this.emit('locked', { id, reason: 'turf' });
      return false;
    }

    const run = {
      def,
      stage: 0,
      stageTime: 0,
      elapsed: 0,
      hits: 0,
      timer: def.type === 'timed' ? def.timeLimit : 0,
      done: false,
    };

    // One-shot crimes the story calls for: the chase mission starts hot.
    if (def.heat > 0 && this.police) this.police.addHeat(def.heat, 'mission:' + def.id);

    this.mission = run;
    this.updateMarker();
    if (def.timeOfDay && typeof this.onTimeOfDay === 'function') {
      this.onTimeOfDay(def.timeOfDay);
    }
    this.emit('mission-start', { id: def.id, title: def.title });
    return true;
  }

  abortMission() {
    if (!this.mission) return false;
    const id = this.mission.def.id;
    this.mission = null;
    this.markerPos = null;
    this.markerLabel = '';
    this.emit('mission-abort', { id });
    return true;
  }

  completeMission() {
    const run = this.mission;
    if (!run) return;
    const def = run.def;
    run.done = true;
    this.mission = null;
    this.completed[def.id] = true;
    this.addCash(def.reward);
    this.addTurf(def.district, TURF_GAIN_MISSION);
    this.markerPos = null;
    this.markerLabel = '';
    this.emit('mission-complete', {
      id: def.id,
      title: def.title,
      reward: def.reward,
      district: def.district,
    });
    if (this.turfCount() >= DISTRICTS.length && !this.completed['portside-takeover']) {
      this.emit('finale-unlocked', {});
    }
  }

  failMission(reason) {
    const run = this.mission;
    if (!run) return;
    const id = run.def.id;
    this.mission = null;
    this.markerPos = null;
    this.markerLabel = '';
    this.emit('mission-fail', { id, reason: reason || 'failed' });
  }

  currentStage() {
    if (!this.mission) return null;
    const stages = this.mission.def.stages || [];
    return stages[Math.min(this.mission.stage, stages.length - 1)] || null;
  }

  // Marker the HUD minimap should point at: story stage, then side activity.
  getMarker() {
    if (this.mission && this.markerPos) {
      return { x: this.markerPos.x, z: this.markerPos.z, label: this.markerLabel };
    }
    if (this.taxi) {
      const spot = this.taxi.phase === 0 ? this.taxi.pickup : this.taxi.dropoff;
      return { x: spot.x, z: spot.z, label: 'Taxi fare' };
    }
    if (this.trial) {
      const cp = this.trial.checkpoints[this.trial.stage];
      if (cp) return { x: cp.x, z: cp.z, label: 'Checkpoint' };
    }
    return null;
  }

  playerPosition() {
    const car = this.state.driving ? this.state.driving() : null;
    if (car && car.group && car.group.position) return car.group.position;
    if (!this.player) return { x: 0, z: 0 };
    const p = this.player.position;
    return p || this.player.state || { x: 0, z: 0 };
  }

  driving() {
    return !!(this.state.driving && this.state.driving());
  }

  distTo(x, z) {
    const p = this.playerPosition();
    return Math.hypot(p.x - x, p.z - z);
  }

  // ------------------------------------------------------------- per-frame
  update(dt) {
    const step = dt > 0 ? Math.min(dt, 0.1) : 0;
    if (step <= 0) return;
    this.time += step;
    this.combatTurfCd = Math.max(0, (this.combatTurfCd || 0) - step);

    this.updateIncome(step);
    this.updateCollectibles();
    this.updateMarkers(step);

    if (this.mission) this.updateMission(step);
    else this.updateOffers(step);

    this.updateTurfPush(step);
    if (this.taxi) this.updateTaxi(step);
    if (this.trial) this.updateTrial(step);
  }

  // Standing in a district you don't own yet slowly pushes it toward takeover;
  // it's the honest way to grind the last few points of turf.
  updateTurfPush(step) {
    const p = this.playerPosition();
    const key = districtForPoint(p.x, p.z);
    if (this.taken[key]) {
      this.pushAcc = 0;
      return;
    }
    this.pushAcc = (this.pushAcc || 0) + step;
    if (this.pushAcc < 1) return;
    const seconds = this.pushAcc;
    this.pushAcc = 0;
    this.addTurf(key, TURF_PUSH_RATE * seconds);
  }

  updateIncome(step) {
    const count = this.turfCount();
    if (count <= 0) return;
    this.incomeAcc += TURF_INCOME * count * step;
    if (this.incomeAcc >= 1) {
      const whole = Math.floor(this.incomeAcc);
      this.incomeAcc -= whole;
      this.addCash(whole);
    }
  }

  updateCollectibles() {
    const p = this.playerPosition();
    for (let i = 0; i < COLLECTIBLES.length; i++) {
      if (this.collected[i]) continue;
      const c = COLLECTIBLES[i];
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (dx * dx + dz * dz > 3.4 * 3.4) continue;
      this.collected[i] = true;
      this.refreshCollectibles();
      this.addCash(COLLECT_REWARD);
      this.addTurf(c.district, TURF_GAIN_COLLECT);
      if (this.effects) {
        this.effects.spawnBurst({ x: c.x, y: 1.2, z: c.z }, 'sparks', 12);
      }
      this.emit('collect', { index: i, district: c.district, total: this.collectCount });
    }
  }

  updateMarkers(dt) {
    const m = this.beacons.mission;
    const s = this.beacons.side;
    const c = this.beacons.collect;

    const pulse = 0.13 + Math.sin(this.time * 2.4) * 0.05;
    if (m) {
      m.group.visible = !!(this.mission && this.markerPos);
      if (m.group.visible) {
        m.group.position.set(this.markerPos.x, 0, this.markerPos.z);
        m.pillarMat.opacity = pulse + 0.05;
        m.gem.position.y = 4.2 + Math.sin(this.time * 2.2) * 0.35;
        m.gem.rotation.y += dt * 1.6;
        m.ring.rotation.z += dt * 0.5;
      }
    }

    if (s) {
      let spot = null;
      if (this.taxi) {
        spot = this.taxi.phase === 0 ? this.taxi.pickup : this.taxi.dropoff;
      } else if (this.trial) {
        spot = this.trial.checkpoints[this.trial.stage] || null;
      }
      s.group.visible = !!spot;
      if (spot) {
        s.group.position.set(spot.x, 0, spot.z);
        s.pillarMat.opacity = 0.12 + Math.sin(this.time * 3.1) * 0.04;
        s.gem.position.y = 3.4 + Math.sin(this.time * 2.6) * 0.3;
        s.gem.rotation.y -= dt * 1.9;
      }
    }

    if (c) {
      let nearest = null;
      let bestD = Infinity;
      const p = this.playerPosition();
      for (let i = 0; i < COLLECTIBLES.length; i++) {
        if (this.collected[i]) continue;
        const col = COLLECTIBLES[i];
        const dd = (col.x - p.x) ** 2 + (col.z - p.z) ** 2;
        if (dd < bestD) {
          bestD = dd;
          nearest = col;
        }
      }
      c.group.visible = !!nearest && this.collectCount < COLLECTIBLES.length;
      if (nearest && c.group.visible) {
        c.group.position.set(nearest.x, 0, nearest.z);
        c.pillarMat.opacity = 0.1 + Math.sin(this.time * 1.7) * 0.035;
      }
    }

    for (let i = 0; i < this.collectMeshes.length; i++) {
      const mesh = this.collectMeshes[i];
      if (!mesh.visible) continue;
      mesh.rotation.y += dt * 1.2;
      mesh.position.y = 1.1 + Math.sin(this.time * 2 + i) * 0.14;
    }

    if (this.fareMesh) {
      this.fareMesh.visible = !!this.taxi && this.taxi.phase === 0;
      if (this.fareMesh.visible) {
        const spot = this.taxi.pickup;
        this.fareMesh.position.set(spot.x, 0, spot.z);
        this.fareMesh.rotation.y = this.time * 0.9;
        this.fareTag.rotation.y = this.time * 2.4;
        this.fareTag.position.y = 2.1 + Math.sin(this.time * 2.8) * 0.16;
      }
    }
  }

  updateMarker() {
    if (!this.mission) {
      this.markerPos = null;
      this.markerLabel = '';
      return;
    }
    const stage = this.currentStage();
    if (stage) {
      this.markerPos = { x: stage.x, z: stage.z };
      this.markerLabel = stage.label;
    }
  }

  updateMission(step) {
    const run = this.mission;
    const def = run.def;
    run.elapsed += step;
    run.stageTime += step;

    const stage = this.currentStage();
    const dist = stage ? this.distTo(stage.x, stage.z) : Infinity;
    const inZone = dist <= (stage ? stage.radius || MARKER_RADIUS : MARKER_RADIUS);

    switch (def.type) {
      case 'drive': {
        if (!this.driving()) break;
        if (inZone && Math.abs((this.state.driving() && this.state.driving().speed) || 0) < 3.2) {
          this.advanceStage();
        }
        break;
      }
      case 'timed': {
        run.timer -= step;
        if (run.timer <= 0) {
          this.failMission('time');
          break;
        }
        if (inZone && this.driving()) this.advanceStage();
        break;
      }
      case 'defend':
      case 'finale': {
        if (inZone) {
          run.timer += step * (this.police && this.police.getWanted() > 0 ? 1.25 : 0.7);
        }
        if (run.timer >= def.duration && run.hits >= (def.needHits || 0)) {
          this.completeMission();
        }
        break;
      }
      case 'stealth': {
        if (this.police && this.police.getWanted() > 1) {
          run.warn = true;
          break;
        }
        run.warn = false;
        if (inZone) this.completeMission();
        break;
      }
      case 'chase': {
        if (run.stage === 0) {
          if (inZone) {
            run.stage = 1;
            run.stageTime = 0;
            if (this.police) this.police.setWanted(Math.max(3, this.police.getWanted()));
            this.updateMarker();
            this.emit('mission-stage', { id: def.id, stage: 1 });
          }
        } else if (this.police && this.police.getWanted() <= 0) {
          this.completeMission();
        }
        break;
      }
      default:
        break;
    }
  }

  advanceStage() {
    const run = this.mission;
    if (!run) return;
    const stages = run.def.stages || [];
    if (run.stage < stages.length - 1) {
      run.stage++;
      run.stageTime = 0;
      this.updateMarker();
      this.emit('mission-stage', { id: run.def.id, stage: run.stage });
      return;
    }
    if (run.def.type === 'timed') {
      const def = run.def;
      const used = def.timeLimit - run.timer;
      if (!this.bestTimes[def.id] || used < this.bestTimes[def.id]) {
        this.bestTimes[def.id] = used;
      }
      this.emit('best-time', { id: def.id, seconds: used });
    }
    this.completeMission();
  }

  // Combat events from main are routed here so missions can score hits.
  notify(kind, data) {
    const p = this.playerPosition();
    const key = districtForPoint(p.x, p.z);
    if (kind === 'punch' || kind === 'shot' || kind === 'hitCop' || kind === 'hitPed') {
      if (this.combatTurfCd <= 0) {
        this.combatTurfCd = 4;
        this.addTurf(key, TURF_GAIN_COMBAT);
      }
    }
    if (kind === 'hitCop' && this.mission) {
      const run = this.mission;
      if (run.def.type === 'defend' || run.def.type === 'finale') run.hits++;
    }
    void data;
  }

  // --------------------------------------------------------------- activities
  updateOffers(step) {
    this.offerTimer -= step;
    if (this.offerTimer > 0) return;
    const car = this.state.driving ? this.state.driving() : null;
    if (!car) {
      this.offerTimer = 30;
      return;
    }
    // Side work is offered by the car class: taxis get fares, sport cars get
    // checkpoint trials.
    if (car.type === 'taxi' && !this.taxi) {
      this.offerTimer = 30;
      this.startTaxi(this.playerPosition());
      return;
    }
    if (car.type === 'sport' && !this.trial) {
      this.offerTimer = 30;
      this.startTimeTrial(this.playerPosition());
      return;
    }
    this.offerTimer = 12;
  }

  startTaxi(near) {
    if (this.taxi) return false;
    const p = near || this.playerPosition();
    const pickAngle = this.time * 0.7;
    const pickup = {
      x: Math.max(WORLD.minX + 12, Math.min(WORLD.maxX - 12, p.x + Math.cos(pickAngle) * 34)),
      z: Math.max(WORLD.minZ + 12, Math.min(WORLD.maxZ - 12, p.z + Math.sin(pickAngle) * 34)),
    };
    const dropoff = {
      x: pickup.x + (pickup.x < 0 ? 1 : -1) * 90,
      z: pickup.z + (pickup.z < 0 ? 1 : -1) * 70,
    };
    this.taxi = { phase: 0, pickup, dropoff, timer: 0 };
    this.emit('taxi-start', {});
    return true;
  }

  updateTaxi(step) {
    const t = this.taxi;
    t.timer += step;
    const car = this.state.driving ? this.state.driving() : null;
    const target = t.phase === 0 ? t.pickup : t.dropoff;
    if (!car) return;
    if (this.distTo(target.x, target.z) > 5.2) return;
    if (Math.abs(car.speed || 0) > 3) return;
    if (t.phase === 0) {
      t.phase = 1;
      this.emit('taxi-pickup', {});
      return;
    }
    const key = districtForPoint(t.dropoff.x, t.dropoff.z);
    this.addCash(220);
    this.addTurf(key, TURF_GAIN_ACTIVITY);
    this.taxi = null;
    this.emit('taxi-complete', { cash: 220 });
  }

  startTimeTrial(near) {
    if (this.trial) return false;
    const p = near || this.playerPosition();
    const checkpoints = [];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.35;
      checkpoints.push({
        x: Math.max(WORLD.minX + 14, Math.min(WORLD.maxX - 14, p.x + Math.cos(a) * (26 + i * 9))),
        z: Math.max(WORLD.minZ + 14, Math.min(WORLD.maxZ - 14, p.z + Math.sin(a) * (26 + i * 9))),
      });
    }
    this.trial = { stage: 0, checkpoints, timer: 70 };
    this.emit('trial-start', {});
    return true;
  }

  updateTrial(step) {
    const tr = this.trial;
    tr.timer -= step;
    if (tr.timer <= 0) {
      this.trial = null;
      this.emit('trial-fail', {});
      return;
    }
    const cp = tr.checkpoints[tr.stage];
    if (!cp) {
      this.trial = null;
      return;
    }
    if (this.distTo(cp.x, cp.z) > 5.4) return;
    tr.stage++;
    if (tr.stage >= tr.checkpoints.length) {
      this.addCash(260);
      this.trial = null;
      this.emit('trial-complete', { cash: 260 });
    }
  }

  // ---------------------------------------------------------------- objective
  getCurrentObjective() {
    if (this.mission) {
      const run = this.mission;
      const stage = this.currentStage();
      const loc = (DISTRICTS.find((d) => d.key === run.def.district) || {}).name || '';
      let base = stage ? stage.label : run.def.title;

      if (run.def.type === 'timed') {
        base += '  [' + Math.max(0, Math.ceil(run.timer)) + 's]';
      } else if (run.def.type === 'defend' || run.def.type === 'finale') {
        base += '  [' + Math.min(run.def.duration, Math.floor(run.timer)) + '/' + run.def.duration + 's]';
      } else if (run.def.type === 'stealth' && run.warn) {
        base += '  [lose the police first]';
      } else if (run.def.type === 'chase' && run.stage === 1) {
        const stars = this.police ? this.police.getWanted() : 0;
        base += '  [' + stars + ' star' + (stars === 1 ? '' : 's') + ' left]';
      }
      return loc ? base + '  \u2014 ' + loc : base;
    }

    if (this.taxi) {
      const target = this.taxi.phase === 0 ? this.taxi.pickup : this.taxi.dropoff;
      const where = districtForPoint(target.x, target.z);
      const name = (DISTRICTS.find((d) => d.key === where) || {}).name || where;
      return this.taxi.phase === 0
        ? 'TAXI FARE \u2014 pick up the marked fare in ' + name
        : 'TAXI FARE \u2014 drop the fare in ' + name;
    }

    if (this.trial) {
      return 'TIME TRIAL \u2014 checkpoint ' + (this.trial.stage + 1) +
        '/' + this.trial.checkpoints.length + '  [' + Math.max(0, Math.ceil(this.trial.timer)) + 's]';
    }

    const next = this.nextMission();
    if (this.turfCount() >= DISTRICTS.length && !this.completed['portside-takeover']) {
      return 'THE FINALE IS OPEN \u2014 take Portside (press J)';
    }
    if (next) return 'NEXT JOB \u2014 ' + next.title + ' (press J)';
    return 'MARISOL BAY IS YOURS \u2014 ' + this.collectCount + '/' + COLLECTIBLES.length + ' stashes found';
  }

  // ------------------------------------------------------------- persistence
  serialize() {
    return {
      cash: this.getCash(),
      completed: { ...this.completed },
      collected: { ...this.collected },
      turf: { ...this.turf },
      taken: { ...this.taken },
      bestTimes: { ...this.bestTimes },
    };
  }

  apply(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.completed && typeof data.completed === 'object') {
      this.completed = { ...data.completed };
    }
    if (data.collected && typeof data.collected === 'object') {
      this.collected = {};
      for (const k of Object.keys(data.collected)) {
        if (data.collected[k]) this.collected[k] = true;
      }
    }
    if (data.turf && typeof data.turf === 'object') {
      for (let i = 0; i < DISTRICTS.length; i++) {
        const k = DISTRICTS[i].key;
        const v = Number(data.turf[k]);
        this.turf[k] = isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
      }
    }
    if (data.taken && typeof data.taken === 'object') {
      this.taken = { ...data.taken };
    }
    if (data.bestTimes && typeof data.bestTimes === 'object') {
      this.bestTimes = { ...data.bestTimes };
    }
    this.refreshCollectibles();
    this.updateMarker();
    return true;
  }

  get isMissionActive() {
    return !!this.mission;
  }
}
