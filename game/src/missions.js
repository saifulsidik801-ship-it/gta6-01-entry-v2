import { DISTRICTS, WORLD, clamp } from './config.js';

const DISTRICT_KEYS = ['beachfront', 'marina', 'oldquarter', 'downtown', 'portside', 'hillside'];

function districtByKey(key) {
  return DISTRICTS.find((d) => d.key === key) || DISTRICTS[0];
}

const cx = (key) => districtByKey(key).center.x;
const cz = (key) => districtByKey(key).center.z;

function at(key, dx, dz) {
  return {
    x: clamp(cx(key) + dx, WORLD.minX + 5, WORLD.maxX - 5),
    z: clamp(cz(key) + dz, WORLD.minZ + 5, WORLD.maxZ - 5)
  };
}

function markerAt(key, dx, dz, label) {
  const p = at(key, dx, dz);
  return { x: p.x, z: p.z, label };
}

const MISSIONS = [
  {
    id: 'first-fare',
    title: 'FIRST FARE',
    district: 'beachfront',
    tone: 'day',
    reward: 400,
    stages: [
      { label: 'Pick up the fare', type: 'goto', marker: markerAt('beachfront', 18, -12, 'Fare pickup') },
      { label: 'Drop them off', type: 'goto', marker: markerAt('beachfront', -22, 16, 'Drop-off') }
    ]
  },
  {
    id: 'harbour-run',
    title: 'HARBOUR RUN',
    district: 'marina',
    tone: 'dusk',
    reward: 700,
    timer: 90,
    stages: [
      { label: 'Run the first delivery', type: 'timer', marker: markerAt('marina', 20, -15, 'Delivery 1') },
      { label: 'Run the second delivery', type: 'timer', marker: markerAt('marina', -20, 18, 'Delivery 2') }
    ]
  },
  {
    id: 'old-town-stashes',
    title: 'OLD TOWN STASHES',
    district: 'oldquarter',
    tone: 'day',
    reward: 800,
    stages: [
      { label: 'Stash 1', type: 'goto', marker: markerAt('oldquarter', 16, -14, 'Stash 1') },
      { label: 'Stash 2', type: 'goto', marker: markerAt('oldquarter', -18, -10, 'Stash 2') },
      { label: 'Stash 3', type: 'goto', marker: markerAt('oldquarter', 9, 19, 'Stash 3') }
    ]
  },
  {
    id: 'tail-the-courier',
    title: 'TAIL THE COURIER',
    district: 'downtown',
    tone: 'dusk',
    reward: 1000,
    surviveAfter: 30,
    stages: [
      { label: 'Follow the courier', type: 'goto', marker: markerAt('downtown', 22, -14, 'Waypoint 1') },
      { label: 'Keep following', type: 'goto', marker: markerAt('downtown', -20, 12, 'Waypoint 2') },
      { label: 'Corner the courier', type: 'survive', marker: markerAt('downtown', 14, 20, 'Waypoint 3') }
    ]
  },
  {
    id: 'dockyard-brawl',
    title: 'DOCKYARD BRAWL',
    district: 'portside',
    tone: 'night',
    reward: 1200,
    stages: [
      { label: 'Fight off the dock crew', type: 'combat', need: 6 },
      { label: 'Reach the exit', type: 'goto', marker: markerAt('portside', -20, 16, 'Exit') }
    ]
  },
  {
    id: 'hill-climb',
    title: 'HILL CLIMB',
    district: 'hillside',
    tone: 'night',
    reward: 1500,
    timer: 75,
    stages: [
      { label: 'Hill marker 1', type: 'timer', marker: markerAt('hillside', 18, -16, 'Hill 1') },
      { label: 'Hill marker 2', type: 'timer', marker: markerAt('hillside', -16, 14, 'Hill 2') },
      { label: 'Hill marker 3', type: 'timer', marker: markerAt('hillside', 6, 22, 'Hill 3') }
    ]
  },
  {
    id: 'take-marisol-bay',
    title: 'TAKE MARISOL BAY',
    district: 'beachfront',
    tone: 'dusk',
    reward: 5000,
    finale: true,
    stages: [
      { label: 'Claim all six districts', type: 'finale-tour' },
      { label: 'Survive the heat', type: 'survive', needHeat: 2, duration: 45 }
    ]
  }
];

const FINALE_ID = 'take-marisol-bay';
const OFFER_COOLDOWN = 20;
const STASH_REWARD = 150;
const TAXI_MIN = 120;
const TAXI_MAX = 250;
const TRIAL_REWARD = 300;
const TRIAL_TIME = 45;

export class Missions {
  constructor(opts) {
    this._opts = opts || {};
    this.player = this._opts.player;
    this.police = this._opts.police;
    this.combat = this._opts.combat;
    this.world = this._opts.world;
    this.effects = this._opts.effects;
    this.driving = this._opts.driving || (() => null);

    this.onTimeOfDay = null;
    this.onEvent = null;

    this.missionStates = {};
    for (const m of MISSIONS) {
      this.missionStates[m.id] = m.finale ? 'locked' : 'available';
    }

    this.taken = [];
    this.collectibles = [];
    this.collected = [];
    this.taxiBest = 0;
    this.trialBest = 0;

    this.currentId = null;
    this.stageIndex = 0;
    this.stageProgress = 0;
    this.timer = 0;
    this.surviveTimer = 0;
    this.finaleVisits = [];

    this.offerCooldown = OFFER_COOLDOWN;

    this.taxi = null;
    this.trial = null;

    this._buildStashes();
  }

  _buildStashes() {
    this.stashes = [];
    let idx = 0;
    for (const key of DISTRICT_KEYS) {
      for (const [dx, dz] of [[18, 12], [-18, -12]]) {
        const p = at(key, dx, dz);
        this.stashes.push({ index: idx++, x: p.x, z: p.z, district: key });
      }
    }
  }

  get isMissionActive() {
    return this.currentId !== null;
  }

  _mission(id) {
    return MISSIONS.find((m) => m.id === id) || null;
  }

  nextMission() {
    for (const m of MISSIONS) {
      if (m.finale) continue;
      const st = this.missionStates[m.id];
      if (st === 'done' || st === 'active') continue;
      return { id: m.id, title: m.title, district: m.district };
    }
    if (this.taken.length >= 6 && this.missionStates[FINALE_ID] === 'available') {
      const f = this._mission(FINALE_ID);
      return { id: f.id, title: f.title, district: f.district };
    }
    return null;
  }

  startMission(id) {
    const m = this._mission(id);
    if (!m) return false;
    if (this.currentId) return false;
    const st = this.missionStates[id];
    if (st === 'done' || st === 'active') return false;

    if (m.finale && this.taken.length < 6) {
      this._emit('locked');
      return false;
    }
    if (m.finale && this.taken.length >= 6 && st === 'locked') {
      this.missionStates[id] = 'available';
    }
    if (this.missionStates[id] === 'locked') {
      this._emit('locked');
      return false;
    }

    this.currentId = id;
    this.missionStates[id] = 'active';
    this.stageIndex = 0;
    this.stageProgress = 0;
    this.surviveTimer = 0;
    this.finaleVisits = [];
    this.timer = m.timer || 0;

    if (m.tone && typeof this.onTimeOfDay === 'function') this.onTimeOfDay(m.tone);
    this._emit('mission-start', { title: m.title });
    this._emit('mission-stage', { index: 0, label: m.stages[0].label });
    return true;
  }

  _playerXZ() {
    const car = this.driving();
    if (car) return { x: car.x, z: car.z };
    if (this.player && this.player.position) {
      return { x: this.player.position.x, z: this.player.position.z };
    }
    return { x: 0, z: 0 };
  }

  _dist(ax, az, bx, bz) {
    const dx = ax - bx;
    const dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  _reachRadius() {
    return this.driving() ? 6 : 4;
  }

  _reached(marker) {
    if (!marker) return false;
    const p = this._playerXZ();
    return this._dist(p.x, p.z, marker.x, marker.z) < this._reachRadius();
  }

  _emit(kind, data) {
    if (typeof this.onEvent === 'function') this.onEvent(kind, data);
  }

  _districtName(key) {
    const d = districtByKey(key);
    return d ? d.name : key;
  }

  _setStage(i) {
    const m = this._mission(this.currentId);
    if (!m || !m.stages[i]) return;
    this.stageIndex = i;
    this.stageProgress = 0;
    this.surviveTimer = 0;
    this._emit('mission-stage', { index: i, label: m.stages[i].label });
  }

  _addCash(v) {
    const cur = typeof this._opts.cash === 'number' ? this._opts.cash : 0;
    this._opts.cash = Math.max(0, cur + v);
  }

  _completeMission() {
    const m = this._mission(this.currentId);
    if (!m) return;
    this.missionStates[m.id] = 'done';
    this._addCash(m.reward);
    if (!m.finale && this.taken.indexOf(m.district) === -1) {
      this.taken.push(m.district);
    }
    this.currentId = null;
    this.stageIndex = 0;
    this.stageProgress = 0;
    this.timer = 0;
    this.surviveTimer = 0;
    this.offerCooldown = OFFER_COOLDOWN;

    if (typeof this.police?.addHeat === 'function') this.police.addHeat(1, 'turf-takeover');
    if (typeof this.effects?.spawnBurst === 'function') {
      const p = this._playerXZ();
      this.effects.spawnBurst({ x: p.x, y: 1, z: p.z }, 'impact', 18);
    }

    this._emit('mission-complete', { reward: m.reward });
    this._emit('district', { name: this._districtName(m.district) });

    if (!m.finale && this.taken.length >= 6 && this.missionStates[FINALE_ID] === 'locked') {
      this.missionStates[FINALE_ID] = 'available';
      this._emit('finale-unlocked');
    }

    if (typeof this.onTimeOfDay === 'function') this.onTimeOfDay('day');
  }

  _failMission(reason) {
    const m = this._mission(this.currentId);
    if (!m) return;
    this.missionStates[m.id] = 'available';
    this.currentId = null;
    this.stageIndex = 0;
    this.stageProgress = 0;
    this.timer = 0;
    this.surviveTimer = 0;
    this.finaleVisits = [];
    this.offerCooldown = OFFER_COOLDOWN;
    this._emit('mission-fail', { reason: reason || 'mission failed' });
  }

  notify(kind) {
    if (!this.currentId) return;
    const m = this._mission(this.currentId);
    if (!m) return;
    const stage = m.stages[this.stageIndex];
    if (!stage || stage.type !== 'combat') return;
    if (kind === 'punch' || kind === 'shot' || kind === 'hitCop' || kind === 'hitPed') {
      this.stageProgress++;
      if (this.stageProgress >= (stage.need || 6)) {
        if (this.stageIndex + 1 < m.stages.length) {
          this._setStage(this.stageIndex + 1);
        } else {
          this._completeMission();
        }
      }
    }
  }

  update(dt) {
    const delta = typeof dt === 'number' && dt > 0 ? dt : 0;

    this._updateCollectibles();

    if (this.currentId) {
      this._updateMission(delta);
      return;
    }

    if (this.offerCooldown > 0) this.offerCooldown -= delta;

    this._updateTaxi(delta);
    this._updateTrial(delta);
  }

  _updateCollectibles() {
    const p = this._playerXZ();
    for (const s of this.stashes) {
      if (this.collected.indexOf(s.index) !== -1) continue;
      if (this._dist(p.x, p.z, s.x, s.z) < 3) {
        this.collected.push(s.index);
        this._addCash(STASH_REWARD);
        this._emit('collect', { total: this.collected.length });
        if (typeof this.effects?.spawnBurst === 'function') {
          this.effects.spawnBurst({ x: s.x, y: 1, z: s.z }, 'dust', 10);
        }
      }
    }
  }

  _updateMission(dt) {
    const m = this._mission(this.currentId);
    if (!m) return;

    if (this.combat && this.combat.state && this.combat.state.health <= 0) {
      this._failMission('You were taken down');
      return;
    }

    const stage = m.stages[this.stageIndex];
    if (!stage) return;

    if (m.timer) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this._failMission('Out of time');
        return;
      }
    }

    if (m.finale) {
      this._updateFinale(dt);
      return;
    }

    if (stage.type === 'goto' || stage.type === 'timer') {
      if (this._reached(stage.marker)) {
        if (stage.type === 'goto' && m.district === 'oldquarter') {
          if (typeof this.police?.addHeat === 'function') this.police.addHeat(1, 'stash');
        }
        if (this.stageIndex + 1 < m.stages.length) {
          this._setStage(this.stageIndex + 1);
        } else {
          this._completeMission();
        }
      }
      return;
    }

    if (stage.type === 'survive') {
      const arrived = this._reached(stage.marker);
      if (arrived || this.stageProgress > 0) {
        this.stageProgress = 1;
        const wanted = typeof this.police?.getWanted === 'function' ? this.police.getWanted() : 0;
        if (wanted <= 0) {
          this._completeMission();
          return;
        }
        this.surviveTimer += dt;
        if (this.surviveTimer >= (m.surviveAfter || 30)) {
          this._completeMission();
        }
      }
      return;
    }

    if (stage.type === 'combat') {
      if (this.stageProgress >= (stage.need || 6)) {
        if (this.stageIndex + 1 < m.stages.length) {
          this._setStage(this.stageIndex + 1);
        } else {
          this._completeMission();
        }
      }
    }
  }

  _updateFinale(dt) {
    const m = this._mission(this.currentId);
    if (!m) return;

    if (this.stageIndex === 0) {
      const p = this._playerXZ();
      for (const key of DISTRICT_KEYS) {
        if (this.finaleVisits.indexOf(key) !== -1) continue;
        if (this._dist(p.x, p.z, cx(key), cz(key)) < 8) {
          this.finaleVisits.push(key);
          if (this.finaleVisits.length >= 6) {
            this._setStage(1);
          }
        }
      }
      return;
    }

    if (this.stageIndex === 1) {
      const wanted = typeof this.police?.getWanted === 'function' ? this.police.getWanted() : 0;
      if (wanted >= (m.stages[1].needHeat || 2)) {
        this.surviveTimer += dt;
        if (this.surviveTimer >= (m.stages[1].duration || 45)) {
          this._completeMission();
        }
      }
    }
  }

  _updateTaxi(dt) {
    if (this.taxi) {
      const p = this._playerXZ();
      const target = this.taxi.phase === 'pickup' ? this.taxi.pickup : this.taxi.dropoff;
      if (this._dist(p.x, p.z, target.x, target.z) < this._reachRadius()) {
        if (this.taxi.phase === 'pickup') {
          this.taxi.phase = 'dropoff';
          this._emit('taxi-pickup');
        } else {
          const d = this._dist(
            this.taxi.pickup.x,
            this.taxi.pickup.z,
            this.taxi.dropoff.x,
            this.taxi.dropoff.z
          );
          const pay = clamp(TAXI_MIN + 10 * Math.round(d / 10), TAXI_MIN, TAXI_MAX);
          this._addCash(pay);
          if (pay > this.taxiBest) this.taxiBest = pay;
          this.taxi = null;
          this.offerCooldown = OFFER_COOLDOWN;
          this._emit('taxi-complete', { cash: pay });
        }
      }
      return;
    }

    if (this.offerCooldown > 0) return;
    if (this.trial) return;
    this._seed = (this._seed || 7) + 1;
    const r = (this._seed * 9301 + 49297) % 233280 / 233280;
    this._taxiClock = (this._taxiClock || 0) + dt;
    if (this._taxiClock < 1.5) return;
    this._taxiClock = 0;
    const key = DISTRICT_KEYS[Math.floor(r * DISTRICT_KEYS.length) % DISTRICT_KEYS.length];
    const bearing = r * Math.PI * 2;
    const far = 25 + r * 35;
    const p = this._playerXZ();
    const pickup = {
      x: clamp(p.x + Math.cos(bearing) * far, WORLD.minX + 5, WORLD.maxX - 5),
      z: clamp(p.z + Math.sin(bearing) * far, WORLD.minZ + 5, WORLD.maxZ - 5),
      label: 'Taxi fare'
    };
    const drop = at(key, 20 - r * 40, -18 + r * 36);
    this.taxi = { phase: 'pickup', pickup, dropoff: { x: drop.x, z: drop.z, label: 'Drop-off' } };
    this._emit('taxi-start');
  }

  _updateTrial(dt) {
    if (this.trial) {
      this.trial.timer -= dt;
      if (this.trial.timer <= 0) {
        this.trial = null;
        this.offerCooldown = OFFER_COOLDOWN;
        this._emit('trial-fail');
        return;
      }
      const p = this._playerXZ();
      const target = this.trial.markers[this.trial.index];
      if (this._dist(p.x, p.z, target.x, target.z) < this._reachRadius()) {
        this.trial.index++;
        if (this.trial.index >= this.trial.markers.length) {
          this._addCash(TRIAL_REWARD);
          this.trialBest = Math.max(this.trialBest, TRIAL_REWARD);
          this.trial = null;
          this.offerCooldown = OFFER_COOLDOWN;
          this._emit('trial-complete', { cash: TRIAL_REWARD });
        }
      }
      return;
    }

    if (this.taxi) return;
    if (this.offerCooldown > 0) return;
    this._trialClock = (this._trialClock || 0) + dt;
    if (this._trialClock < 3) return;
    this._trialClock = 0;
    this._seed = (this._seed || 11) + 3;
    const r = (this._seed * 9301 + 49297) % 233280 / 233280;
    const key = DISTRICT_KEYS[Math.floor(r * DISTRICT_KEYS.length) % DISTRICT_KEYS.length];
    const p = this._playerXZ();
    const markers = [0, 1].map((i) => {
      const a = r * Math.PI * 2 + i * 2.1;
      return {
        x: clamp(p.x + Math.cos(a) * (30 + i * 12), WORLD.minX + 5, WORLD.maxX - 5),
        z: clamp(p.z + Math.sin(a) * (30 + i * 12), WORLD.minZ + 5, WORLD.maxZ - 5),
        label: `Trial ${i + 1}`
      };
    });
    this.trial = { markers, index: 0, timer: TRIAL_TIME, district: key };
    this._emit('trial-start');
  }

  getCurrentObjective() {
    if (this.currentId) {
      const m = this._mission(this.currentId);
      const stage = m && m.stages[this.stageIndex];
      if (!stage) return 'Finish the job';
      let text = stage.label;
      if (m.timer) text += ` (${Math.max(0, Math.ceil(this.timer))}s)`;
      if (stage.type === 'combat') text += ` ${this.stageProgress}/${stage.need || 6}`;
      return text;
    }
    if (this.taxi) {
      return this.taxi.phase === 'pickup' ? 'Taxi: pick up the fare' : 'Taxi: drop the fare';
    }
    if (this.trial) {
      return `Time trial: marker ${this.trial.index + 1}/${this.trial.markers.length} (${Math.max(0, Math.ceil(this.trial.timer))}s)`;
    }
    return 'Press J to start the next job';
  }

  getTurf() {
    return { taken: this.taken.length, total: 6, takenKeys: this.taken.slice() };
  }

  turfCount() {
    return this.taken.length;
  }

  getMarker() {
    if (this.currentId) {
      const m = this._mission(this.currentId);
      const stage = m && m.stages[this.stageIndex];
      if (stage && stage.marker) return { x: stage.marker.x, z: stage.marker.z, label: stage.marker.label };
      if (m && m.finale && this.stageIndex === 0) {
        const key = DISTRICT_KEYS.find((k) => this.finaleVisits.indexOf(k) === -1) || DISTRICT_KEYS[0];
        return { x: cx(key), z: cz(key), label: 'District' };
      }
      return null;
    }
    if (this.taxi) {
      const t = this.taxi.phase === 'pickup' ? this.taxi.pickup : this.taxi.dropoff;
      return { x: t.x, z: t.z, label: t.label };
    }
    if (this.trial) {
      const t = this.trial.markers[this.trial.index];
      return t ? { x: t.x, z: t.z, label: t.label } : null;
    }
    return null;
  }

  getMissions() {
    return MISSIONS.map((m) => ({
      id: m.id,
      title: m.title,
      district: m.district,
      status: this.missionStates[m.id] || 'locked',
      reward: m.reward
    }));
  }

  serialize() {
    return {
      states: Object.assign({}, this.missionStates),
      taken: this.taken.slice(),
      collectibles: this.collected.slice(),
      taxiBest: this.taxiBest,
      trialBest: this.trialBest,
      currentId: this.currentId,
      stageIndex: this.stageIndex
    };
  }

  apply(data) {
    if (!data || typeof data !== 'object') return;
    try {
      if (data.states && typeof data.states === 'object') {
        for (const id of Object.keys(this.missionStates)) {
          const s = data.states[id];
          if (s === 'locked' || s === 'available' || s === 'active' || s === 'done') {
            this.missionStates[id] = s;
          }
        }
      }
      if (Array.isArray(data.taken)) {
        this.taken = data.taken.filter((k) => DISTRICT_KEYS.indexOf(k) !== -1);
      }
      if (Array.isArray(data.collectibles)) {
        this.collected = data.collectibles.filter((i) => typeof i === 'number' && i >= 0 && i < 12);
      }
      if (typeof data.taxiBest === 'number') this.taxiBest = data.taxiBest;
      if (typeof data.trialBest === 'number') this.trialBest = data.trialBest;

      if (this.taken.length >= 6 && this.missionStates[FINALE_ID] === 'locked') {
        this.missionStates[FINALE_ID] = 'available';
      }

      if (typeof data.currentId === 'string' && this._mission(data.currentId)) {
        const m = this._mission(data.currentId);
        if (this.missionStates[m.id] === 'active') {
          this.currentId = m.id;
          this.stageIndex = clamp(Number(data.stageIndex) || 0, 0, m.stages.length - 1);
          this.timer = m.timer || 0;
        } else {
          this.currentId = null;
          this.stageIndex = 0;
        }
      } else {
        this.currentId = null;
        this.stageIndex = 0;
      }
    } catch (e) {
      this.currentId = null;
      this.stageIndex = 0;
    }
  }
}
