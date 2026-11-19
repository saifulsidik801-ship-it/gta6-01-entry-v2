// MARISOL BAY - persistent save slot in localStorage.
// Everything here is best-effort: a broken or missing store must never throw
// into the game loop, so every storage touch is guarded.

import { SAVE_KEY } from './config.js';

const VERSION = 1;

function storage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch (err) {
    // Access itself can throw in locked-down browsers.
  }
  return null;
}

function isPlainRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class Save {
  constructor() {}

  // Persist a snapshot. Returns true when the write landed, false otherwise.
  save(data) {
    try {
      if (!isPlainRecord(data)) return false;

      const payload = Object.assign({}, data, {
        version: VERSION,
        savedAt: new Date().toISOString(),
      });

      let text;
      try {
        text = JSON.stringify(payload);
      } catch (err) {
        return false; // circular or otherwise not JSON-safe
      }
      if (typeof text !== 'string') return false;

      const store = storage();
      if (!store) return false;
      store.setItem(SAVE_KEY, text);
      return true;
    } catch (err) {
      return false;
    }
  }

  // Returns the stored object for a compatible save, null for anything else.
  load() {
    try {
      const store = storage();
      if (!store) return null;

      const text = store.getItem(SAVE_KEY);
      if (typeof text !== 'string' || text.length === 0) return null;

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        return null; // corrupt payload
      }

      if (!isPlainRecord(parsed)) return null;
      if (parsed.version !== VERSION) return null;

      return parsed;
    } catch (err) {
      return null;
    }
  }

  // Drop the slot; silently ignores an unavailable store.
  clear() {
    try {
      const store = storage();
      if (!store) return;
      store.removeItem(SAVE_KEY);
    } catch (err) {
      // Nothing sensible to do here.
    }
  }
}
