// MARISOL BAY - versioned localStorage persistence.
//
// The game hands us a plain snapshot (mission progress from missions.serialize(),
// plus cash and settings). We never persist the live game object: only that
// snapshot is walked, sanitised to plain JSON, and stored under a namespaced key.
// Reading back is defensive - a bad, old or corrupted record can only ever
// produce "no save" (null), so the caller keeps running on its fresh defaults.

import { SAVE_KEY } from './config.js';

export const SAVE_VERSION = 1;

const MAX_CASH = 9999999;
const MAX_PLAYTIME = 1000 * 60 * 60 * 24 * 30; // 30 days, in ms
const MAX_JSON_BYTES = 65536;
const MAX_DEPTH = 6;
const MAX_ARRAY = 512;
const MAX_KEYS = 64;
const MAX_KEY_LEN = 64;
const MAX_STRING = 240;
const CASH_DEFAULT = 1200;
const VOLUME_DEFAULT = 0.7;

const CORE_KEYS = ['version', 'updated', 'ts', 'playtime', 'cash', 'settings'];
const RESERVED = new Set(CORE_KEYS.concat(['v', 'savedAt', 'saved_at', 'playTime', 'money', 'options']));
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

// Documented progress fields, capped to the shape of the actual game so a
// hand-edited or truncated record cannot smuggle in nonsense.
const ARRAY_CAPS = {
  turf: 6,
  districts: 6,
  taken: 6,
  missions: 7,
  completed: 7,
  story: 7,
  collectibles: 12,
  collected: 12,
  stashes: 12,
  trials: 8,
  fares: 999,
};
const NUMBER_LIMITS = {
  kills: 999999,
  chases: 999999,
  chasesSurvived: 999999,
  taxiFares: 999999,
  fares: 999999,
  deaths: 999999,
  missionId: 999,
  currentMission: 999,
  heat: 5,
  stars: 5,
};

const isNum = (v) => typeof v === 'number' && isFinite(v);

function num(value, fallback, min, max) {
  if (!isNum(value)) return fallback;
  return value < min ? min : value > max ? max : value;
}

function int(value, fallback, min, max) {
  return Math.round(num(value, fallback, min, max));
}

function isDomNode(value) {
  return !!value && typeof value === 'object' && typeof value.nodeType === 'number';
}

// Convert anything into plain JSON data: functions, DOM nodes, map/set and
// cycles are dropped rather than serialised; sizes are bounded at every level.
function plain(value, depth, seen) {
  if (value === null) return null;
  const type = typeof value;

  if (type === 'number') return isNum(value) ? value : undefined;
  if (type === 'boolean') return value;
  if (type === 'string') {
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value;
  }
  if (type !== 'object') return undefined;

  if (isDomNode(value)) return undefined;
  if (depth >= MAX_DEPTH) return undefined;
  if (seen.has(value)) return undefined;

  seen.add(value);
  let out;

  if (Array.isArray(value)) {
    out = [];
    const count = Math.min(value.length, MAX_ARRAY);
    for (let i = 0; i < count; i++) {
      const item = plain(value[i], depth + 1, seen);
      out.push(item === undefined ? null : item);
    }
  } else {
    out = {};
    const keys = Object.keys(value);
    const count = Math.min(keys.length, MAX_KEYS);
    for (let i = 0; i < count; i++) {
      const key = keys[i];
      if (UNSAFE.has(key)) continue;
      if (key.length === 0 || key.length > MAX_KEY_LEN) continue;
      const item = plain(value[key], depth + 1, seen);
      if (item !== undefined) out[key] = item;
    }
  }

  seen.delete(value);
  return out;
}

function cleanSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    volume: num(src.volume, VOLUME_DEFAULT, 0, 1),
    muted: typeof src.muted === 'boolean' ? src.muted : false,
    minimap: typeof src.minimap === 'boolean' ? src.minimap : true,
  };
}

function clampAliases(state) {
  for (const key of Object.keys(ARRAY_CAPS)) {
    const value = state[key];
    if (Array.isArray(value) && value.length > ARRAY_CAPS[key]) {
      state[key] = value.slice(0, ARRAY_CAPS[key]);
    }
  }
  for (const key of Object.keys(NUMBER_LIMITS)) {
    const value = state[key];
    if (isNum(value)) state[key] = num(value, 0, -1, NUMBER_LIMITS[key]);
  }
  if (state.playtime !== undefined) {
    state.playtime = num(state.playtime, 0, 0, MAX_PLAYTIME);
  }
  if (state.taxi && typeof state.taxi === 'object' && isNum(state.taxi.fares)) {
    state.taxi.fares = int(state.taxi.fares, 0, 0, 999999);
  }
  const times = state.trialTimes || state.trials;
  if (times && typeof times === 'object' && !Array.isArray(times)) {
    for (const key of Object.keys(times)) {
      const value = times[key];
      if (isNum(value)) times[key] = num(value, 0, 0, 86400);
      else delete times[key];
    }
  }
  return state;
}

// Older records: no version stamp (legacy flat object) or v0 naming.
function migrate(doc, from) {
  const out = { ...doc };
  if (from < 1) {
    if (!isNum(out.version) && isNum(out.v)) out.version = out.v;
    if (!isNum(out.ts) && isNum(out.savedAt)) out.ts = out.savedAt;
    if (!isNum(out.playtime)) out.playtime = isNum(out.playTime) ? out.playTime : 0;
    if (out.cash == null && isNum(out.money)) out.cash = out.money;
    if (!out.settings && out.options) out.settings = out.options;
  }
  out.version = SAVE_VERSION;
  return out;
}

function storage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const store = window.localStorage;
    const probe = SAVE_KEY + ':probe';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch (err) {
    return null;
  }
}

export class Save {
  constructor(key = SAVE_KEY) {
    this.key = key;
    this.store = storage();
    this.memory = null;
    this.playtime = 0;
    this.lastSaveAt = Date.now();
    this.lastError = null;
  }

  hasSave() {
    const raw = this._read();
    if (!raw) return false;
    try {
      const doc = JSON.parse(raw);
      return !!doc && typeof doc === 'object' && !Array.isArray(doc);
    } catch (err) {
      return false;
    }
  }

  // Returns a sanitised snapshot, or null when there is nothing usable to load.
  load() {
    const raw = this._read();
    if (raw == null || raw === '') return null;

    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (err) {
      this.lastError = 'corrupt';
      this._remove();
      return null;
    }

    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      this.lastError = 'shape';
      this._remove();
      return null;
    }

    let version = isNum(doc.version) ? Math.floor(doc.version) : isNum(doc.v) ? Math.floor(doc.v) : 0;
    if (version > SAVE_VERSION) {
      this.lastError = 'version';
      return null; // newer build wrote this: leave the record alone
    }
    if (version < SAVE_VERSION) doc = migrate(doc, version);

    const payload = plain(doc, 0, new WeakSet()) || {};
    const state = {
      version: SAVE_VERSION,
      cash: num(payload.cash, CASH_DEFAULT, 0, MAX_CASH),
      settings: cleanSettings(payload.settings),
      playtime: int(payload.playtime, 0, 0, MAX_PLAYTIME),
    };

    for (const key of Object.keys(payload)) {
      if (RESERVED.has(key) || UNSAFE.has(key)) continue;
      state[key] = payload[key];
    }

    this.playtime = state.playtime;
    this.lastSaveAt = Date.now();
    this.lastError = null;
    return clampAliases(state);
  }

  // Persist a snapshot: mission progress, cash, settings. Whitelisted + bounded.
  save(state) {
    const snap = state && typeof state === 'object' ? state : {};
    const now = Date.now();
    this._accrue(now);

    const doc = {
      version: SAVE_VERSION,
      updated: new Date(now).toISOString(),
      ts: now,
      playtime: int(this.playtime, 0, 0, MAX_PLAYTIME),
      cash: int(snap.cash, 0, 0, MAX_CASH),
      settings: cleanSettings(snap.settings),
    };

    const payload = plain(snap, 0, new WeakSet()) || {};
    for (const key of Object.keys(payload)) {
      if (RESERVED.has(key) || UNSAFE.has(key)) continue;
      doc[key] = payload[key];
    }

    let json;
    try {
      json = JSON.stringify(doc);
    } catch (err) {
      this.lastError = 'encode';
      return false;
    }

    if (json.length > MAX_JSON_BYTES) {
      const keys = Object.keys(doc).reverse();
      for (let i = 0; i < keys.length; i++) {
        if (CORE_KEYS.indexOf(keys[i]) !== -1) continue;
        delete doc[keys[i]];
        json = JSON.stringify(doc);
        if (json.length <= MAX_JSON_BYTES) break;
      }
    }

    const ok = this._write(json);
    if (ok) this.lastError = null;
    return ok;
  }

  // Same record, for callers that want a named autosave hook.
  autosave(state) {
    return this.save(state);
  }

  clearSave() {
    this.playtime = 0;
    this.lastSaveAt = Date.now();
    this._remove();
    return true;
  }

  reset() {
    return this.clearSave();
  }

  _accrue(now) {
    const delta = now - this.lastSaveAt;
    if (delta > 0 && delta < 1000 * 60 * 5) this.playtime += delta;
    this.playtime = num(this.playtime, 0, 0, MAX_PLAYTIME);
    this.lastSaveAt = now;
  }

  _read() {
    if (this.store) {
      try {
        return this.store.getItem(this.key);
      } catch (err) {
        this.store = null;
      }
    }
    return this.memory;
  }

  _write(json) {
    this.memory = json;
    if (this.store) {
      try {
        this.store.setItem(this.key, json);
        return true;
      } catch (err) {
        this.lastError = 'storage';
        this.store = null;
      }
    }
    return this.memory === json;
  }

  _remove() {
    this.memory = null;
    if (!this.store) return;
    try {
      this.store.removeItem(this.key);
    } catch (err) {
      this.store = null;
    }
  }
}

export default Save;
