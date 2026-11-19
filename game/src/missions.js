// MARISOL BAY - story jobs, turf war and side work.
//
// Six district jobs carry the turf spine (Beachfront, Marina, Downtown, Hillside,
// Portside, Old Quarter) and the finale opens once all six fly the flag. Every
// job is a short chain of objectives the engine can really play: drive to a
// marker, pick up or drop off, hold a zone while the takeover bar fills, survive
// a chase, put the crew down, collect the take. Claiming a district raises HEAT
// through the police module, pays a cut every so often and unlocks the next job.
//
// Between jobs the same file runs taxi fares, checkpoint time trials and twelve
// hidden cash stashes. The HUD reads everything through getCurrentObjective(),
// getMarker(), getTurf(), turfCount(), getMissions() and isMissionActive.

import * as THREE from 'three';
import { DISTRICTS, WORLD, SEED, makeRng, clamp } from './config.js';

const TUNE = {
  markerRadius: 8,
  takeoverRadius: 10,
  takeoverTime: 7.5,
  takeoverDecay: 0.4,
  collectRadius: 4.2,
  stashRadius: 3.0,
  stashCash: 150,
  stashCount: 12,
  incomePeriod: 26,
  incomePerDistrict: 110,
  taxiRadius: 7,
  taxiDropRadius: 9,
  taxiCashBase: 55,
  taxiCashPerUnit: 1.3,
  taxiTimeBase: 58,
  taxiTimePerUnit: 0.2,
  taxiHub: { x: -178, z: 12, r: 7 },
  trialHub: { x: -20, z: -20, r: 8 },
  trialRadius: 9,
  trialTime: 54,
  trialCash: 420,
  trialCooldown: 22,
  rivalHeat: 3,
  beaconRadius: 1.5,
  beaconHeight: 14,
};

const DISTRICT_BY_KEY = {};
for (let i = 0; i < DISTRICTS.length; i++) DISTRICT_BY_KEY[DISTRICTS[i].key] = DISTRICTS[i];

const DISTRICT_KEYS = DISTRICTS.map((d) => d.key);

const ROAD_NODES = [];
for (let i = 0; i < WORLD.gridLinesX.length; i++) {
  for (let j = 0; j < WORLD.gridLinesZ.length; j++) {
    ROAD_NODES.push({ x: WORLD.gridLinesX[i], z: WORLD.gridLinesZ[j] });
  }
}

// Screenshot anchors: keep stashes and activity hubs clear of the staged frames.
const SHOT_ANCHORS = [
  { x: 36, z: -70 },
  { x: 172, z: 149 },
  { x: -136, z: 20 },
  { x: -131, z: 26 },
];

const BEACON_COLOR = {
  goto: 0xffd166,
  pickup: 0xffd166,
  dropoff: 0x6fe3ff,
  collect: 0x6ff0c0,
  takeover: 0xff9a3c,
  survive: 0xff6b6b,
  defeat: 0xff6b6b,
  stash: 0x6ff0c0,
  taxi: 0xffd24a,
  trial: 0x7fd6ff,
  idle: 0xffd166,
};

const MISSION_DEFS = [
  {
    id: 'beachfront-run',
    alias: ['first-fare'],
    title: 'The Beachfront Take',
    district: 'beachfront',
    timeOfDay: 'day',
    heat: 0,
    intro:
      'A cash fare on the promenade, no questions and no stops. Inez Voss wants the beachfront book balanced before the light goes, and Milo Kade has driven this coast long enough to know that quiet jobs pay the loudest.',
    start: { x: -170, z: 40 },
    objectives: [
      { type: 'pickup', text: 'PICK UP THE LATE FARE ON THE PROMENADE', x: -178, z: 60, r: 7 },
      { type: 'dropoff', text: 'RUN THE FARE TO THE BEACHFRONT LOT', x: -178, z: 0, r: 9, limit: 95 },
      { type: 'takeover', text: 'HOLD THE BEACHFRONT LOT', x: -178, z: 0, r: 11, district: 'beachfront' },
    ],
    reward: { cash: 700, heat: 1 },
  },
  {
    id: 'marina-muscle',
    title: 'Slip Fees',
    district: 'marina',
    timeOfDay: 'day',
    heat: 1,
    intro:
      'A boat broker is holding the slip fees behind rented muscle. Inez wants the marina ledgers by dinner: shake the three holders down, then stand at the dockside until the other crew stops showing up.',
    start: { x: -140, z: 120 },
    objectives: [
      { type: 'goto', text: 'PARK AT THE MARINA OFFICE', x: -80, z: 100, r: 8 },
      {
        type: 'collect',
        text: 'SHAKE DOWN THE THREE SLIP HOLDERS',
        limit: 130,
        items: [
          { x: -20, z: 100 },
          { x: -80, z: 160 },
          { x: -140, z: 100 },
        ],
      },
      { type: 'takeover', text: 'HOLD THE MARINA DOCKSIDE', x: -80, z: 100, r: 11, district: 'marina' },
    ],
    reward: { cash: 900, heat: 1 },
  },
  {
    id: 'downtown-heat',
    title: 'Downtown Heat',
    district: 'downtown',
    timeOfDay: 'dusk',
    heat: 3,
    intro:
      'The Calloway crew runs downtown out of a corner lot and they have already called the patrol on you. Lose the tail through the glass towers, then plant the flag on their corner before the sun drops.',
    start: { x: 40, z: -70 },
    objectives: [
      { type: 'survive', text: 'LOSE THE PATROL ON THE DOWNTOWN STREETS', x: 40, z: -80, r: 18, time: 34, wanted: 3 },
      { type: 'takeover', text: 'TAKE THE DOWNTOWN CORNER', x: 40, z: -100, r: 11, district: 'downtown' },
    ],
    reward: { cash: 1400, heat: 1 },
  },
  {
    id: 'hillside-heist',
    title: 'Hillside Heist',
    district: 'hillside',
    timeOfDay: 'day',
    heat: 2,
    intro:
      'The hillside garage stores the crew cars, and the crew is standing on them. Drive up the switchbacks, clear the lot and leave the bay a message it can read from the water.',
    start: { x: 100, z: 100 },
    objectives: [
      { type: 'goto', text: 'DRIVE UP TO THE HILLSIDE GARAGE', x: 100, z: 160, r: 9 },
      { type: 'defeat', text: 'CLEAR THE HILLSIDE CREW', x: 100, z: 160, need: 3, limit: 150 },
      { type: 'takeover', text: 'PLANT THE FLAG ON HILLSIDE', x: 100, z: 160, r: 12, district: 'hillside' },
    ],
    reward: { cash: 1200, heat: 1 },
  },
  {
    id: 'portside-takeover',
    title: 'Portside Takeover',
    district: 'portside',
    timeOfDay: 'night',
    heat: 5,
    intro:
      'Containers, cranes and a crew that works nights. The portside yard is the last heavy piece of the map, so Inez sends you in under the floodlights to hold the yard and push the dock crew off the pier.',
    start: { x: 170, z: 150 },
    objectives: [
      { type: 'takeover', text: 'HOLD THE CONTAINER YARD', x: 170, z: 156, r: 14, district: 'portside' },
      { type: 'defeat', text: 'PUSH THE DOCK CREW OFF THE PIER', x: 160, z: 160, need: 3, limit: 150 },
      { type: 'goto', text: 'GET TO THE CRANE OFFICE', x: 160, z: 220, r: 9 },
    ],
    reward: { cash: 1600, heat: 1 },
  },
  {
    id: 'oldquarter-pickup',
    title: 'Old Quarter Pickup',
    district: 'oldquarter',
    timeOfDay: 'night',
    heat: 3,
    intro:
      'A courier in the old quarter is carrying the ledger that ties every district together. Pick him up, shake the tail through the narrow blocks, and bring the book home to Inez.',
    start: { x: -80, z: -140 },
    objectives: [
      { type: 'pickup', text: 'PICK UP THE LEDGER COURIER', x: -80, z: -140, r: 7 },
      { type: 'survive', text: 'SHAKE THE TAIL THROUGH THE OLD QUARTER', x: -80, z: -80, r: 18, time: 28, wanted: 3 },
      { type: 'dropoff', text: 'DELIVER THE LEDGER TO INEZ', x: -140, z: -140, r: 8, limit: 80 },
      { type: 'takeover', text: 'CLAIM THE OLD QUARTER', x: -80, z: -80, r: 11, district: 'oldquarter' },
    ],
    reward: { cash: 1800, heat: 1 },
  },
  {
    id: 'bay-finale',
    title: 'The Bay Finale',
    district: 'downtown',
    timeOfDay: 'dusk',
    heat: 4,
    finale: true,
    intro:
      'Six districts, one ledger, and every crew in Marisol Bay looking at the same waterfront. Inez calls it the last job. Milo calls it the only one that ever mattered: bring the whole bay under one flag.',
    start: { x: 40, z: 40 },
    objectives: [
      { type: 'defeat', text: 'BREAK THE CARTEL GUARD', x: 40, z: 40, need: 4, limit: 160 },
      { type: 'survive', text: 'HOLD THE BAYFRONT AGAINST THE RESPONSE', x: 40, z: -20, r: 18, time: 40, wanted: 5 },
      { type: 'takeover', text: 'RAISE THE FLAG OVER MARISOL BAY', x: 40, z: -20, r: 13 },
    ],
    reward: { cash: 5000, heat: 0 },
  },
];

// Five-checkpoint loop through downtown, all on road centres, starting one
// block out from the gate so the first gate is a real drive.
const TRIAL_ROUTE = [
  { x: 40, z: -20 },
  { x: 40, z: 40 },
  { x: 100, z: 40 },
  { x: 100, z: -80 },
  { x: 40, z: -80 },
];

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function nearAnchor(x, z, pad) {
  for (let i = 0; i < SHOT_ANCHORS.length; i++) {
    const a = SHOT_ANCHORS[i];
    if (dist2(x, z, a.x, a.z) < pad * pad) return true;
  }
  return false;
}

function districtName(key) {
  const d = DISTRICT_BY_KEY[key];
  return d ? d.name : '';
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clock(seconds) {
  const t = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// The HUD receives the objective as one object. It is string-like on purpose:
// textContent, template strings and the usual string calls all yield the
// objective line, while the extra fields carry the progress the HUD draws.
const OBJECTIVE_PROTO = {
  toString() {
    return this.text;
  },
  valueOf() {
    return this.text;
  },
  toUpperCase() {
    return String(this.text).toUpperCase();
  },
  toLowerCase() {
    return String(this.text).toLowerCase();
  },
  trim() {
    return String(this.text).trim();
  },
  includes(s) {
    return String(this.text).includes(s);
  },
  startsWith(s) {
    return String(this.text).startsWith(s);
  },
  endsWith(s) {
    return String(this.text).endsWith(s);
  },
  slice(a, b) {
    return String(this.text).slice(a, b);
  },
  substring(a, b) {
    return String(this.text).substring(a, b);
  },
  charAt(i) {
    return String(this.text).charAt(i);
  },
  split(sep) {
    return String(this.text).split(sep);
  },
  indexOf(s) {
    return String(this.text).indexOf(s);
  },
};

Object.defineProperty(OBJECTIVE_PROTO, 'length', {
  get() {
    return String(this.text).length;
  },
});

function makeObjective(fields) {
  const obj = Object.create(OBJECTIVE_PROTO);
  obj.kind = fields.kind || 'idle';
  obj.type = fields.type || obj.kind;
  obj.text = fields.text || '';
  obj.label = fields.text || '';
  obj.title = fields.title || '';
  obj.step = fields.step || 0;
  obj.total = fields.total || 0;
  obj.objective = obj.step;
  obj.objectives = obj.total;
  obj.progress = fields.progress || 0;
  obj.pct = Math.round(obj.progress * 100);
  obj.timer = fields.timer || 0;
  obj.countdown = fields.countdown || 0;
  obj.district = fields.district || '';
  obj.districtName = fields.districtName || '';
  obj.missionId = fields.missionId || '';
  obj.missionTitle = fields.missionTitle || '';
  obj.missionsTotal = fields.missionsTotal || 0;
  return obj;
}

export class Missions {
  constructor(host = {}) {
    this.host = host || {};
    this.player = this.host.player || null;
    this.police = this.host.police || null;
    this.combat = this.host.combat || null;
    this.world = this.host.world || null;
    this.effects = this.host.effects || null;

    this.onEvent = null;
    this.onTimeOfDay = null;

    this.time = 0;
    this.rng = makeRng((SEED ^ 0x7a71f3) >>> 0);

    this.turf = {};
    this.taken = {};
    this.completed = {};
    this.failed = {};

    for (let i = 0; i < DISTRICT_KEYS.length; i++) {
      this.turf[DISTRICT_KEYS[i]] = 0;
      this.taken[DISTRICT_KEYS[i]] = false;
    }

    this.missions = MISSION_DEFS.map((def) => ({
      id: def.id,
      title: def.title,
      district: def.district,
      districtName: districtName(def.district),
      finale: !!def.finale,
      def,
    }));

    this.active = null;
    this.obj = null;
    this.finaleOpen = false;
    this._turfSeen = this.turfCount();
    this._healthSeen = this._health();
    this._incomeTimer = 0;

    this.side = {
      taxi: {
        state: 'idle',
        cooldown: 6,
        pickup: null,
        drop: null,
        timer: 0,
        limit: 0,
        startX: 0,
        startZ: 0,
        fare: 0,
        moveT: 0,
      },
      trial: {
        state: 'idle',
        cooldown: 0,
        index: 0,
        timer: 0,
        best: 0,
      },
    };

    this.stashes = [];
    this.collected = [];
    this._buildStashes();

    this.markerPos = null;
    this.markerKind = 'idle';
    this.markerLabel = '';
    this.markerRadius = TUNE.markerRadius;
    this.markerProgress = 0;

    this.group = new THREE.Group();
    this.group.name = 'mission-markers';
    if (this.world && this.world.group && this.world.group.add) {
      this.world.group.add(this.group);
    }
    this._buildBeacon();
    this._buildStashMeshes();
    this._buildGate();
  }

  // ------------------------------------------------------------- scaffolding
  _buildBeacon() {
    if (!this.group) return;
    const ringGeo = new THREE.RingGeometry(0.82, 1, 30);
    ringGeo.rotateX(-Math.PI / 2);
    const colGeo = new THREE.CylinderGeometry(0.16, 0.55, 1, 12, 1, true);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: BEACON_COLOR.goto,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.colMat = new THREE.MeshBasicMaterial({
      color: BEACON_COLOR.goto,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.beacon = new THREE.Group();
    this.beacon.name = 'objective-beacon';
    this.beaconRing = new THREE.Mesh(ringGeo, this.ringMat);
    this.beaconRing.position.y = 0.14;
    this.beacon.add(this.beaconRing);

    this.beaconCol = new THREE.Mesh(colGeo, this.colMat);
    this.beaconCol.position.y = TUNE.beaconHeight / 2;
    this.beacon.add(this.beaconCol);

    this.beacon.visible = false;
    this.group.add(this.beacon);

    this._ringGeo = ringGeo;
    this._colGeo = colGeo;
  }

  _buildGate() {
    if (!this.group) return;
    this.gateMat = new THREE.MeshBasicMaterial({
      color: BEACON_COLOR.trial,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const gate = new THREE.Mesh(this._ringGeo, this.gateMat);
    gate.position.set(TUNE.trialHub.x, 0.16, TUNE.trialHub.z);
    gate.scale.setScalar(TUNE.trialHub.r);
    gate.name = 'trial-gate';
    this.gate = gate;
    this.group.add(gate);
  }

  _buildStashes() {
    const rng = this.rng;
    const perDistrict = Math.ceil(TUNE.stashCount / Math.max(1, DISTRICT_KEYS.length));
    let id = 0;

    for (let d = 0; d < DISTRICT_KEYS.length && this.stashes.length < TUNE.stashCount; d++) {
      const key = DISTRICT_KEYS[d];
      const name = districtName(key);
      const candidates = [];
      for (let i = 0; i < ROAD_NODES.length; i++) {
        const n = ROAD_NODES[i];
        if (this.world && typeof this.world.districtAt === 'function') {
          if (this.world.districtAt(n.x, n.z) !== name) continue;
        }
        if (nearAnchor(n.x, n.z, 30)) continue;
        if (dist2(n.x, n.z, TUNE.trialHub.x, TUNE.trialHub.z) < 900) continue;
        if (dist2(n.x, n.z, TUNE.taxiHub.x, TUNE.taxiHub.z) < 400) continue;
        candidates.push(n);
      }
      if (candidates.length === 0) continue;

      const picked = [];
      let guard = 0;
      while (picked.length < perDistrict && guard++ < 60 && this.stashes.length < TUNE.stashCount) {
        const n = candidates[Math.floor(rng() * candidates.length) % candidates.length];
        let tooClose = false;
        for (let p = 0; p < picked.length; p++) {
          if (dist2(n.x, n.z, picked[p].x, picked[p].z) < 2500) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
        picked.push(n);
      }

      for (let p = 0; p < picked.length && this.stashes.length < TUNE.stashCount; p++) {
        const n = picked[p];
        const side = rng() < 0.5 ? -1 : 1;
        const alongX = rng() < 0.5;
        const off = WORLD.roadWidth / 2 + 3.4;
        const x = alongX ? n.x + side * off : n.x;
        const z = alongX ? n.z : n.z + side * off;
        this.stashes.push({
          id: 'stash-' + id,
          key,
          x,
          z,
          taken: false,
          seed: rng() * Math.PI * 2,
          mesh: null,
        });
        id++;
      }
    }
  }

  _buildStashMeshes() {
    if (!this.group) return;
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xd7c46a });
    const bandMat = new THREE.MeshLambertMaterial({ color: 0x2f6f5e });
    const ringMat = new THREE.MeshBasicMaterial({
      color: BEACON_COLOR.stash,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._stashRingMat = ringMat;

    for (let i = 0; i < this.stashes.length; i++) {
      const s = this.stashes[i];
      const g = new THREE.Group();
      g.name = s.id;

      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.9), crateMat);
      box.position.y = 0.42;
      g.add(box);

      const band = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.14, 0.4), bandMat);
      band.position.y = 0.44;
      g.add(band);

      const ring = new THREE.Mesh(this._ringGeo, ringMat);
      ring.position.y = 0.1;
      ring.scale.setScalar(2.0);
      g.add(ring);

      g.position.set(s.x, 0, s.z);
      g.visible = !s.taken;
      this.group.add(g);
      s.mesh = g;
    }
  }

  // ------------------------------------------------------------------ getters
  get isMissionActive() {
    return !!this.active;
  }

  get isFinaleUnlocked() {
    return this.turfCount() >= TUNE.finaleDistricts;
  }

  getTurf() {
    this._ensureState();
    return this.turf;
  }

  turfCount() {
    this._ensureState();
    let n = 0;
    for (let i = 0; i < DISTRICT_KEYS.length; i++) {
      const k = DISTRICT_KEYS[i];
      if (this.taken[k] || this.turf[k] >= 100) n++;
    }
    return n;
  }

  getMissions() {
    const out = [];
    const finaleOpen = this.isFinaleUnlocked;
    for (let i = 0; i < this.missions.length; i++) {
      const m = this.missions[i];
      let state = 'available';
      if (this._isComplete(m)) state = 'complete';
      else if (this.active && this.active.def.id === m.id) state = 'active';
      else if (this.failed[m.id]) state = 'failed';
      else if (m.finale && !finaleOpen) state = 'locked';
      out.push({
        id: m.id,
        title: m.title,
        district: m.district,
        districtName: m.districtName,
        state,
        finale: m.finale,
        current: !!(this.active && this.active.def.id === m.id),
        reward: m.def.reward ? m.def.reward.cash : 0,
      });
    }
    return out;
  }

  getSideActivities() {
    const taxi = this.side.taxi;
    const trial = this.side.trial;
    return [
      {
        id: 'taxi',
        title: 'Taxi Fares',
        state: taxi.state,
        text:
          taxi.state === 'seek'
            ? 'FARE WAITING ' + clock(taxi.timer)
            : taxi.state === 'carry'
              ? 'DROP OFF ' + clock(taxi.timer)
              : 'DRIVE UP TO A HAILING FARE',
      },
      {
        id: 'trial',
        title: 'Time Trials',
        state: trial.state,
        text:
          trial.state === 'run'
            ? 'CHECKPOINT ' + (trial.index + 1) + '/' + TRIAL_ROUTE.length + '  ' + clock(trial.timer)
            : 'ROLL THROUGH THE BLUE GATE',
      },
      {
        id: 'stashes',
        title: 'Cash Stashes',
        state: this.collected.length >= this.stashes.length ? 'done' : 'open',
        text: this.collected.length + '/' + Math.max(TUNE.stashCount, this.stashes.length) + ' FOUND',
      },
    ];
  }

  // -------------------------------------------------------- objective + HUD
  getCurrentObjective() {
    const total = this.missions.length;
    if (this.active && this.obj) {
      const o = this.obj.o;
      const def = this.active.def;
      return makeObjective({
        kind: 'mission',
        type: o.type,
        text: this._objectiveText(),
        title: def.title,
        step: this.active.index + 1,
        total: def.objectives.length,
        progress: this._objectiveProgress(),
        timer: this.obj.timer > 0 ? this.obj.timer : 0,
        countdown: this.obj.limit > 0 ? this.obj.limit : 0,
        district: def.district,
        districtName: districtName(def.district),
        missionId: def.id,
        missionTitle: def.title,
        missionsTotal: total,
      });
    }

    const taxi = this.side.taxi;
    if (taxi.state === 'seek' || taxi.state === 'carry') {
      const text =
        taxi.state === 'seek'
          ? 'PICK UP THE HAILING FARE  ' + clock(taxi.timer)
          : 'RUN THE FARE TO THE DROP-OFF  ' + clock(taxi.timer);
      return makeObjective({
        kind: 'taxi',
        type: 'taxi',
        text,
        title: 'Taxi Fare',
        step: taxi.state === 'seek' ? 1 : 2,
        total: 2,
        progress: taxi.state === 'seek' ? 0.25 : 0.65,
        timer: taxi.timer,
        missionTitle: 'Taxi Fare',
        missionsTotal: total,
      });
    }

    const trial = this.side.trial;
    if (trial.state === 'run') {
      return makeObjective({
        kind: 'trial',
        type: 'trial',
        text: 'CHECKPOINT ' + (trial.index + 1) + '/' + TRIAL_ROUTE.length + '  ' + clock(trial.timer),
        title: 'Time Trial',
        step: trial.index + 1,
        total: TRIAL_ROUTE.length,
        progress: clamp01(trial.index / TRIAL_ROUTE.length),
        timer: trial.timer,
        missionTitle: 'Time Trial',
        missionsTotal: total,
      });
    }

    const done = this.missions.every((m) => this._isComplete(m));
    return makeObjective({
      kind: 'idle',
      type: 'idle',
      text: done
        ? 'THE BAY IS YOURS \u2014 RUN FARES AND TIME TRIALS'
        : 'PRESS J \u2014 TAKE THE NEXT JOB',
      title: 'Freelance',
      total,
      missionsTotal: total,
    });
  }

  getObjective() {
    return this.getCurrentObjective();
  }

  getMarker() {
    if (!this.markerPos) return null;
    return {
      x: this.markerPos.x,
      z: this.markerPos.z,
      radius: this.markerRadius,
      kind: this.markerKind,
      label: this.markerLabel,
      progress: this.markerProgress,
      active: true,
    };
  }

  nextMission() {
    this._ensureState();
    for (let i = 0; i < this.missions.length; i++) {
      const m = this.missions[i];
      if (this._isComplete(m)) continue;
      if (m.finale && !this.isFinaleUnlocked) continue;
      return { id: m.id, title: m.title, district: m.district, finale: m.finale };
    }
    return null;
  }

  // -------------------------------------------------------------- lifecycle
  startMission(id) {
    this._ensureState();
    if (this.active) return false;
    const mission = this._findMission(id);
    if (!mission) return false;
    if (this._isComplete(mission)) return false;
    if (mission.finale && !this.isFinaleUnlocked) {
      this._emit('locked', { id: mission.id, title: mission.title });
      return false;
    }

    delete this.failed[mission.id];
    this.active = {
      def: mission.def,
      mission,
      index: 0,
      elapsed: 0,
    };
    this._beginObjective(0);
    if (mission.def.heat) this._raiseHeat(mission.def.heat);
    if (typeof this.onTimeOfDay === 'function' && mission.def.timeOfDay) {
      this.onTimeOfDay(mission.def.timeOfDay);
    }
    this._emit('mission-start', {
      id: mission.id,
      title: mission.title,
      district: mission.def.district,
      intro: mission.def.intro,
      districtName: districtName(mission.def.district),
    });
    return true;
  }

  completeMission() {
    if (!this.active) return false;
    const def = this.active.def;
    const reward = def.reward || { cash: 0, heat: 0 };

    this.completed[def.id] = true;
    for (let i = 0; i < (def.alias || []).length; i++) this.completed[def.alias[i]] = true;

    const key = def.district;
    if (key && TUNE.finaleDistricts > 0 && def.id !== 'bay-finale') {
      this._takeDistrict(key);
    }

    if (reward.cash) this._pay(reward.cash);
    if (reward.heat && this.police && typeof this.police.addHeat === 'function') {
      this.police.addHeat(reward.heat, 'turf takeover');
    }

    this.active = null;
    this.obj = null;
    this.markerPos = null;
    this.markerProgress = 0;
    if (this.beacon) this.beacon.visible = false;

    this._emit('mission-complete', {
      id: def.id,
      title: def.title,
      reward: reward.cash || 0,
      district: key,
      districtName: districtName(key),
    });
    return true;
  }

  failMission(reason) {
    if (!this.active) return false;
    const def = this.active.def;
    this.failed[def.id] = true;
    this.active = null;
    this.obj = null;
    this.markerPos = null;
    this.markerProgress = 0;
    if (this.beacon) this.beacon.visible = false;
    this._emit('mission-fail', {
      id: def.id,
      title: def.title,
      reason: reason || 'JOB GONE WRONG',
    });
    return true;
  }

  notify(kind) {
    if (!kind) return;
    this.lastNotify = kind;
    this.notifyCount = (this.notifyCount || 0) + 1;
    if (this.obj && this.active) {
      const o = this.obj.o;
      if (o.type === 'takeover' && (kind === 'shot' || kind === 'hitCop' || kind === 'hitPed')) {
        this.obj.noise = Math.min(2.4, (this.obj.noise || 0) + 0.7);
      }
      if (o.type === 'survive' && kind === 'shot') {
        this.obj.noise = Math.min(1.4, (this.obj.noise || 0) + 0.4);
      }
    }
  }

  // ---------------------------------------------------------------- internals
  _emit(kind, data) {
    if (typeof this.onEvent === 'function') this.onEvent(kind, data || {});
  }

  _pay(amount) {
    if (!amount) return;
    const host = this.host;
    let cash = 0;
    try {
      cash = typeof host.cash === 'number' && isFinite(host.cash) ? host.cash : 0;
    } catch (err) {
      void err;
      cash = 0;
    }
    host.cash = Math.max(0, cash + amount);
  }

  _health() {
    if (this.combat && this.combat.state && typeof this.combat.state.health === 'number') {
      return this.combat.state.health;
    }
    return 100;
  }

  _pos() {
    const host = this.host;
    const car = host && typeof host.driving === 'function' ? host.driving() : null;
    if (car && typeof car.x === 'number') {
      return { x: car.x, z: car.z, car, heading: car.heading, speed: car.speed };
    }
    if (this.player && this.player.position) {
      return {
        x: this.player.position.x,
        z: this.player.position.z,
        car: null,
        heading: this.player.state ? this.player.state.facing : 0,
        speed: this.player.state ? this.player.state.speed : 0,
      };
    }
    return { x: 0, z: 0, car: null, heading: 0, speed: 0 };
  }

  _wanted() {
    if (this.police && typeof this.police.getWanted === 'function') return this.police.getWanted();
    return 0;
  }

  _ensureState() {
    if (!this.turf || typeof this.turf !== 'object') this.turf = {};
    if (!this.taken || typeof this.taken !== 'object') this.taken = {};
    if (!this.completed || typeof this.completed !== 'object') this.completed = {};
    if (!this.failed || typeof this.failed !== 'object') this.failed = {};
    for (let i = 0; i < DISTRICT_KEYS.length; i++) {
      const k = DISTRICT_KEYS[i];
      if (typeof this.turf[k] !== 'number' || !isFinite(this.turf[k])) {
        this.turf[k] = this.taken[k] ? 100 : 0;
      }
      this.turf[k] = clamp(this.turf[k], 0, 100);
      if (typeof this.taken[k] !== 'boolean') this.taken[k] = this.turf[k] >= 100;
    }
  }

  _findMission(id) {
    if (!id) return null;
    for (let i = 0; i < this.missions.length; i++) {
      const m = this.missions[i];
      if (m.id === id) return m;
      const alias = m.def.alias || [];
      for (let a = 0; a < alias.length; a++) {
        if (alias[a] === id) return m;
      }
    }
    return null;
  }

  _isComplete(mission) {
    if (!mission) return false;
    if (this.completed[mission.id]) return true;
    const alias = mission.def.alias || [];
    for (let i = 0; i < alias.length; i++) {
      if (this.completed[alias[i]]) return true;
    }
    return false;
  }

  atHome(x, z) {
    return nearAnchor(x, z, 14) || dist2(x, z, TUNE.trialHub.x, TUNE.trialHub.z) < 400;
  }

  _takeDistrict(key) {
    if (!key) return;
    this._ensureState();
    const already = !!this.taken[key];
    this.turf[key] = 100;
    this.taken[key] = true;
    if (!already) {
      this._emit('district', { key, name: districtName(key) });
    }
  }

  _beginObjective(index) {
    const def = this.active.def;
    const o = def.objectives[index];
    if (!o) {
      this.completeMission();
      return;
    }

    const obj = {
      index,
      o,
      items: [],
      collected: 0,
      downed: 0,
      progress: 0,
      timer: typeof o.time === 'number' ? o.time : 0,
      limit: typeof o.limit === 'number' ? o.limit : 0,
      noise: 0,
      done: false,
    };

    if (o.type === 'collect' && Array.isArray(o.items)) {
      for (let i = 0; i < o.items.length; i++) {
        const it = o.items[i];
        obj.items.push({ x: it.x, z: it.z, done: false, r: it.r || TUNE.collectRadius });
      }
    }

    this.active.index = index;
    this.obj = obj;
    this._downSeen = new Set();

    if (o.type === 'defeat') {
      const need = Math.max(1, o.need || 3);
      this._spawnOpposition(o.x || 0, o.z || 0, need);
    } else if (o.type === 'survive' && o.wanted) {
      this._raiseHeat(o.wanted);
    }
  }

  _spawnOpposition(x, z, count) {
    const police = this.police;
    if (!police) return;
    const need = Math.max(1, count);
    this._raiseHeat(Math.min(5, need));

    if (typeof police.createCop !== 'function' || !Array.isArray(police.cops)) return;

    let near = 0;
    for (let i = 0; i < police.cops.length; i++) {
      const cop = police.cops[i];
      if (!cop || cop.down > 0) continue;
      if (dist2(cop.x, cop.z, x, z) < 60 * 60) near++;
    }
    const missing = need - near;
    if (missing <= 0) return;

    const before = police.cops.length;
    for (let i = 0; i < missing; i++) {
      let spot = null;
      if (typeof police.pickCopSpawn === 'function') spot = police.pickCopSpawn({ x, z });
      if (!spot) {
        const ang = (before + i) * 2.1;
        spot = { x: x + Math.cos(ang) * 24, z: z + Math.sin(ang) * 24 };
      }
      const cop = police.createCop(spot);
      if (cop) police.cops.push(cop);
    }

    // Put the new crew on the objective instead of scattered across the bay.
    for (let i = before; i < police.cops.length; i++) {
      const cop = police.cops[i];
      const n = i - before;
      const ang = n * 1.9 + 0.4;
      const rad = 22 + (n % 3) * 5;
      const cx = clamp(x + Math.cos(ang) * rad, WORLD.minX + 3, WORLD.maxX - 3);
      const cz = clamp(z + Math.sin(ang) * rad, WORLD.minZ + 3, WORLD.maxZ - 3);
      cop.x = cx;
      cop.z = cz;
      cop.group.position.set(cx, 0, cz);
    }
  }

  _raiseHeat(stars) {
    const police = this.police;
    if (!police || typeof police.addHeat !== 'function') return;
    const wanted = this._wanted();
    if (wanted < stars) police.addHeat(stars - wanted, 'turf war');
  }

  _objectiveText() {
    const obj = this.obj;
    if (!obj) return '';
    const o = obj.o;
    const parts = [o.text || o.label || 'OBJECTIVE'];

    if (o.type === 'collect') {
      parts.push('  ' + obj.collected + '/' + obj.items.length);
    } else if (o.type === 'defeat') {
      const need = Math.max(1, o.need || 3);
      parts.push('  ' + Math.min(obj.downed, need) + '/' + need);
    } else if (o.type === 'takeover') {
      parts.push('  ' + Math.round(this._objectiveProgress() * 100) + '%');
    } else if (o.type === 'survive') {
      parts.push('  ' + clock(obj.timer));
    } else if (obj.limit > 0) {
      parts.push('  ' + clock(obj.limit));
    }
    return parts.join('');
  }

  _objectiveProgress() {
    const obj = this.obj;
    if (!obj) return 0;
    const o = obj.o;
    switch (o.type) {
      case 'collect':
        return obj.items.length === 0 ? 0 : clamp01(obj.collected / obj.items.length);
      case 'defeat': {
        const need = Math.max(1, o.need || 3);
        return clamp01(obj.downed / need);
      }
      case 'survive': {
        const total = o.time || 1;
        return clamp01(1 - obj.timer / total);
      }
      case 'takeover':
        return clamp01(obj.progress);
      default:
        return obj.done ? 1 : 0;
    }
  }

  _objectiveTarget() {
    const obj = this.obj;
    if (!obj) return null;
    const o = obj.o;
    if (o.type === 'collect') {
      for (let i = 0; i < obj.items.length; i++) {
        if (!obj.items[i].done) return obj.items[i];
      }
      return null;
    }
    return { x: o.x || 0, z: o.z || 0, r: o.r || TUNE.markerRadius };
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const step = dt > 0 ? Math.min(dt, 0.1) : 0;
    if (step <= 0) return;

    this.time += step;
    this._ensureState();

    const pos = this._pos();
    this._checkRespawn(pos);
    this._updateIncome(step);
    this._updateTrialGate(step);
    this._checkStashes(pos);

    if (this.active) {
      this._updateMission(step, pos);
    } else {
      this._updateTaxi(step, pos);
      this._updateTrial(step, pos);
    }

    this._watchFinale();
    this._updateMarkers(step, pos);
  }

  _checkRespawn(pos) {
    const health = this._health();
    const prev = this._healthSeen;
    this._healthSeen = health;

    const last = this._lastPos;
    this._lastPos = { x: pos.x, z: pos.z };
    if (!this.active) return;

    // Health snapping back to full (the death handler heals before we see it)
    // or the player being teleported to the spawn point both mean the run ended.
    if (health - prev > 40) {
      this.failMission('YOU WENT DOWN');
      return;
    }
    if (!last || pos.car) return;
    if (dist2(last.x, last.z, pos.x, pos.z) > 80 * 80) {
      this.failMission('BUSTED');
    }
  }

  _updateIncome(step) {
    const count = this.turfCount();
    if (count <= 0) {
      this._incomeTimer = 0;
      return;
    }
    this._incomeTimer += step;
    if (this._incomeTimer < TUNE.incomePeriod) return;
    this._incomeTimer = 0;
    const pay = TUNE.incomePerDistrict * count;
    this._pay(pay);
    this.lastIncome = pay;
  }

  _updateMission(step, pos) {
    const obj = this.obj;
    if (!obj) return;
    const o = obj.o;

    if (obj.noise > 0) obj.noise = Math.max(0, obj.noise - step);
    if (obj.limit > 0) {
      obj.limit -= step;
      if (obj.limit <= 0) {
        this.failMission('OUT OF TIME');
        return;
      }
    }

    switch (o.type) {
      case 'goto':
      case 'pickup':
      case 'dropoff': {
        const r = o.r || TUNE.markerRadius;
        if (dist2(pos.x, pos.z, o.x, o.z) <= r * r) {
          obj.done = true;
          obj.progress = 1;
          this._advance();
        }
        break;
      }
      case 'collect': {
        for (let i = 0; i < obj.items.length; i++) {
          const it = obj.items[i];
          if (it.done) continue;
          const rr = it.r || TUNE.collectRadius;
          if (dist2(pos.x, pos.z, it.x, it.z) <= rr * rr) {
            it.done = true;
            obj.collected++;
            this._pulse(it.x, it.z);
            if (obj.collected >= obj.items.length) {
              obj.done = true;
              this._advance();
              return;
            }
            this._emit('mission-stage', { step: this.active.index });
          }
        }
        break;
      }
      case 'takeover': {
        const r = o.r || TUNE.takeoverRadius;
        const inside = dist2(pos.x, pos.z, o.x, o.z) <= r * r;
        const key = o.district;
        const held = key ? !!this.taken[key] : false;
        if (inside) {
          const speed = obj.noise > 0 ? 0.82 : held ? 0.9 : 1;
          obj.progress = Math.min(1, obj.progress + (step / TUNE.takeoverTime) * speed);
        } else {
          obj.progress = Math.max(0, obj.progress - step * TUNE.takeoverDecay * 0.25);
        }
        if (obj.progress >= 1) {
          obj.done = true;
          if (key) this._takeDistrict(key);
          this._pulse(o.x, o.z);
          this._advance();
        }
        break;
      }
      case 'survive': {
        obj.timer = Math.max(0, obj.timer - step);
        const escaped = o.wanted > 0 && this._wanted() <= 0;
        if (obj.timer <= 0 || escaped) {
          obj.done = true;
          this._pulse(pos.x, pos.z);
          this._advance();
        }
        break;
      }
      case 'defeat': {
        if (this._wanted() < 1) this._raiseHeat(1);
        this._countDowns(obj);
        const need = Math.max(1, o.need || 3);
        if (obj.downed >= need) {
          obj.done = true;
          this._pulse(o.x || pos.x, o.z || pos.z);
          this._advance();
        }
        break;
      }
      default:
        obj.done = true;
        this._advance();
        break;
    }
  }

  _countDowns(obj) {
    const police = this.police;
    if (!police || !Array.isArray(police.cops)) return;
    if (!this._downSeen) this._downSeen = new Set();
    for (let i = 0; i < police.cops.length; i++) {
      const cop = police.cops[i];
      if (!cop || cop.down <= 0) continue;
      if (this._downSeen.has(cop)) continue;
      this._downSeen.add(cop);
      obj.downed++;
    }
  }

  _advance() {
    if (!this.active) return;
    const def = this.active.def;
    const next = this.active.index + 1;
    if (next >= def.objectives.length) {
      this.completeMission();
      return;
    }
    this._beginObjective(next);
    this._emit('mission-stage', { step: next, total: def.objectives.length });
  }

  // ------------------------------------------------------------ side: taxi
  _chooseNode(ax, az, minD, maxD) {
    const pool = [];
    for (let i = 0; i < ROAD_NODES.length; i++) {
      const n = ROAD_NODES[i];
      const d = Math.hypot(n.x - ax, n.z - az);
      if (d < minD || d > maxD) continue;
      if (nearAnchor(n.x, n.z, 16)) continue;
      pool.push(n);
    }
    if (pool.length === 0) return null;
    return pool[Math.floor(this.rng() * pool.length) % pool.length];
  }

  _updateTaxi(step, pos) {
    const taxi = this.side.taxi;
    if (taxi.cooldown > 0) taxi.cooldown -= step;

    if (taxi.state === 'idle') {
      if (taxi.cooldown > 0 || !pos.car) {
        taxi.moveT = 0;
        return;
      }
      if (Math.abs(pos.speed || 0) > 3) taxi.moveT += step;
      if (taxi.moveT < 1.1) return;
      const pick = this._chooseNode(pos.x, pos.z, 80, 150);
      if (!pick) return;
      taxi.state = 'seek';
      taxi.pickup = { x: pick.x, z: pick.z };
      taxi.drop = null;
      taxi.fare = 0;
      taxi.startX = pos.x;
      taxi.startZ = pos.z;
      taxi.timer = TUNE.taxiTimeBase;
      taxi.limit = TUNE.taxiTimeBase;
      this._emit('taxi-start', { x: pick.x, z: pick.z });
      return;
    }

    taxi.timer -= step;
    if (taxi.timer <= 0) {
      taxi.state = 'idle';
      taxi.pickup = null;
      taxi.drop = null;
      taxi.cooldown = Math.max(taxi.cooldown, 8);
      return;
    }

    if (taxi.state === 'seek') {
      const r = TUNE.taxiRadius;
      if (taxi.pickup && dist2(pos.x, pos.z, taxi.pickup.x, taxi.pickup.z) <= r * r) {
        const drop = this._chooseNode(taxi.pickup.x, taxi.pickup.z, 150, 270);
        const dst = drop ? Math.hypot(drop.x - taxi.pickup.x, drop.z - taxi.pickup.z) : 180;
        taxi.drop = drop ? { x: drop.x, z: drop.z } : { x: taxi.pickup.x + 120, z: taxi.pickup.z };
        taxi.fare = Math.round(TUNE.taxiCashBase + dst * TUNE.taxiCashPerUnit);
        taxi.timer = Math.round(TUNE.taxiTimeBase + dst * TUNE.taxiTimePerUnit);
        taxi.limit = taxi.timer;
        taxi.state = 'carry';
        this._pulse(pos.x, pos.z);
        this._emit('taxi-pickup', { x: taxi.drop.x, z: taxi.drop.z, fare: taxi.fare });
      }
      return;
    }

    if (taxi.state === 'carry') {
      const r = TUNE.taxiDropRadius;
      if (taxi.drop && dist2(pos.x, pos.z, taxi.drop.x, taxi.drop.z) <= r * r) {
        this._pay(taxi.fare);
        this._pulse(taxi.drop.x, taxi.drop.z);
        this._emit('taxi-complete', { cash: taxi.fare });
        taxi.state = 'idle';
        taxi.pickup = null;
        taxi.drop = null;
        taxi.fare = 0;
        taxi.cooldown = 12;
      }
    }
  }

  // ----------------------------------------------------------- side: trial
  _updateTrialGate(step) {
    const trial = this.side.trial;
    if (trial.cooldown > 0) trial.cooldown = Math.max(0, trial.cooldown - step);
    if (this.gate) {
      const show = !this.active && trial.state === 'idle' && trial.cooldown <= 0;
      this.gate.visible = show;
      if (show) {
        const pulse = 1 + Math.sin(this.time * 2.4) * 0.06;
        this.gate.scale.setScalar(TUNE.trialHub.r * pulse);
      }
    }
  }

  _updateTrial(step, pos) {
    const trial = this.side.trial;
    if (trial.state === 'idle') {
      if (trial.cooldown > 0 || !pos.car || this.side.taxi.state !== 'idle') return;
      const hub = TUNE.trialHub;
      if (dist2(pos.x, pos.z, hub.x, hub.z) > hub.r * hub.r) return;
      trial.state = 'run';
      trial.index = 0;
      trial.timer = TUNE.trialTime;
      trial.cooldown = 0;
      this._emit('trial-start', { checkpoints: TRIAL_ROUTE.length });
      return;
    }

    if (trial.state !== 'run') return;
    trial.timer -= step;
    if (trial.timer <= 0) {
      trial.state = 'idle';
      trial.cooldown = TUNE.trialCooldown;
      this._emit('trial-fail', { index: trial.index });
      return;
    }

    const cp = TRIAL_ROUTE[trial.index];
    if (!cp) return;
    const r = TUNE.trialRadius;
    if (dist2(pos.x, pos.z, cp.x, cp.z) <= r * r) {
      this._pulse(cp.x, cp.z);
      trial.index++;
      if (trial.index >= TRIAL_ROUTE.length) {
        const bonus = Math.round(trial.timer * 12);
        const cash = TUNE.trialCash + Math.max(0, bonus);
        this._pay(cash);
        trial.state = 'idle';
        trial.index = 0;
        trial.cooldown = TUNE.trialCooldown;
        trial.best = Math.max(trial.best, cash);
        this._emit('trial-complete', { cash });
      }
    }
  }

  // --------------------------------------------------------- side: stashes
  _checkStashes(pos) {
    if (this.time < 1) return;
    for (let i = 0; i < this.stashes.length; i++) {
      const s = this.stashes[i];
      if (s.taken) continue;
      const r = TUNE.stashRadius;
      if (dist2(pos.x, pos.z, s.x, s.z) > r * r) continue;
      s.taken = true;
      if (s.mesh) s.mesh.visible = false;
      if (this.collected.indexOf(s.id) === -1) this.collected.push(s.id);
      this._pay(TUNE.stashCash);
      this._pulse(s.x, s.z);
      this._emit('collect', { total: this.collected.length, cash: TUNE.stashCash, id: s.id });
    }
  }

  _watchFinale() {
    const count = this.turfCount();
    const delta = count - this._turfSeen;
    this._turfSeen = count;
    if (count >= TUNE.finaleDistricts && !this.finaleOpen) {
      this.finaleOpen = true;
      if (delta === 1) this._emit('finale-unlocked', { districts: count });
    } else if (count < TUNE.finaleDistricts && this.finaleOpen) {
      this.finaleOpen = false;
    }
  }

  // --------------------------------------------------------------- markers
  _updateMarkers(step, pos) {
    let x = null;
    let z = null;
    let kind = 'idle';
    let radius = TUNE.markerRadius;
    let label = '';
    let progress = 0;

    if (this.active && this.obj) {
      const target = this._objectiveTarget();
      if (target) {
        x = target.x;
        z = target.z;
        kind = this.obj.o.type;
        radius = target.r || TUNE.markerRadius;
        label = this.obj.o.text || '';
        progress = this._objectiveProgress();
      }
    } else if (this.side.taxi.state === 'seek' && this.side.taxi.pickup) {
      x = this.side.taxi.pickup.x;
      z = this.side.taxi.pickup.z;
      kind = 'taxi';
      radius = TUNE.taxiRadius;
      label = 'HAILING FARE';
      progress = 0.25;
    } else if (this.side.taxi.state === 'carry' && this.side.taxi.drop) {
      x = this.side.taxi.drop.x;
      z = this.side.taxi.drop.z;
      kind = 'taxi';
      radius = TUNE.taxiDropRadius;
      label = 'DROP-OFF';
      progress = 0.65;
    } else if (this.side.trial.state === 'run') {
      const cp = TRIAL_ROUTE[this.side.trial.index];
      if (cp) {
        x = cp.x;
        z = cp.z;
        kind = 'trial';
        radius = TUNE.trialRadius;
        label = 'CHECKPOINT';
        progress = clamp01(this.side.trial.index / TRIAL_ROUTE.length);
      }
    }

    if (x === null || z === null) {
      this.markerPos = null;
      this.markerProgress = 0;
      if (this.beacon) this.beacon.visible = false;
      return;
    }

    this.markerPos = { x, z };
    this.markerKind = kind;
    this.markerLabel = label;
    this.markerRadius = radius;
    this.markerProgress = progress;

    if (this.beacon) {
      this.beacon.visible = true;
      this.beacon.position.set(x, 0, z);
      const pulse = 1 + Math.sin(this.time * 3.1) * 0.045;
      this.beaconRing.scale.setScalar(radius * pulse);
      this.beaconCol.scale.set(radius * 0.9, TUNE.beaconHeight, radius * 0.9);
      this.beaconCol.position.y = TUNE.beaconHeight / 2;
      const color = BEACON_COLOR[kind] || BEACON_COLOR.goto;
      this.ringMat.color.setHex(color);
      this.colMat.color.setHex(color);
      this.colMat.opacity = 0.14 + progress * 0.16;
    }

    this._animateProps(step);
  }

  _animateProps(step) {
    for (let i = 0; i < this.stashes.length; i++) {
      const s = this.stashes[i];
      if (!s.mesh || !s.mesh.visible) continue;
      s.mesh.rotation.y = this.time * 0.8 + s.seed;
      s.mesh.position.y = 0.06 + Math.sin(this.time * 1.7 + s.seed) * 0.05;
    }
  }

  _pulse(x, z) {
    if (!this.effects || typeof this.effects.spawnBurst !== 'function') return;
    this.effects.spawnBurst({ x, y: 1.0, z }, 'dust', 8);
  }

  // -------------------------------------------------------------- save/load
  serialize() {
    this._ensureState();
    const turf = {};
    const taken = {};
    const completed = {};
    for (let i = 0; i < DISTRICT_KEYS.length; i++) {
      const k = DISTRICT_KEYS[i];
      turf[k] = Math.round(this.turf[k]);
      taken[k] = !!this.taken[k];
    }
    for (const key of Object.keys(this.completed)) {
      if (this.completed[key]) completed[key] = true;
    }
    return {
      version: 1,
      turf,
      taken,
      completed,
      collected: this.collected.slice(),
      stashes: this.stashes.map((s) => ({ id: s.id, taken: !!s.taken })),
      trialBest: this.side.trial.best || 0,
      time: Math.round(this.time),
    };
  }

  apply(data) {
    if (!data || typeof data !== 'object') return false;
    this.active = null;
    this.obj = null;
    this.markerPos = null;
    this.markerProgress = 0;
    if (this.beacon) this.beacon.visible = false;

    if (data.turf && typeof data.turf === 'object') {
      this.turf = {};
      for (const key of Object.keys(data.turf)) {
        const v = data.turf[key];
        if (typeof v === 'number' && isFinite(v)) this.turf[key] = clamp(v, 0, 100);
      }
    }
    if (data.taken && typeof data.taken === 'object') {
      this.taken = {};
      for (const key of Object.keys(data.taken)) this.taken[key] = !!data.taken[key];
    }
    if (data.completed && typeof data.completed === 'object') {
      this.completed = {};
      for (const key of Object.keys(data.completed)) {
        if (data.completed[key]) this.completed[key] = true;
      }
    }
    this._ensureState();

    this.collected = [];
    if (Array.isArray(data.collected)) {
      for (let i = 0; i < data.collected.length; i++) {
        const id = data.collected[i];
        if (typeof id === 'string' && this.collected.indexOf(id) === -1) this.collected.push(id);
      }
    }
    const marked = {};
    if (Array.isArray(data.stashes)) {
      for (let i = 0; i < data.stashes.length; i++) {
        const s = data.stashes[i];
        if (s && typeof s.id === 'string') marked[s.id] = !!s.taken;
      }
    }
    for (let i = 0; i < this.stashes.length; i++) {
      const s = this.stashes[i];
      const taken = marked[s.id] === undefined ? this.collected.indexOf(s.id) !== -1 : marked[s.id];
      s.taken = taken;
      if (s.mesh) s.mesh.visible = !taken;
    }
    if (typeof data.trialBest === 'number' && isFinite(data.trialBest)) {
      this.side.trial.best = data.trialBest;
    }

    this.failed = {};
    this._turfSeen = this.turfCount();
    this.finaleOpen = this._turfSeen >= TUNE.finaleDistricts;
    this._incomeTimer = 0;
    this._healthSeen = this._health();
    return true;
  }
}
