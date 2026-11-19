// MARISOL BAY - localStorage persistence for turf progress and options.

const SAVE_KEY = 'marisol-bay-save-v1';

function storage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage;
  } catch (err) {
    return null;
  }
}

export class Save {
  constructor() {
    this.key = SAVE_KEY;
  }

  load() {
    const store = storage();
    if (!store) return null;
    try {
      const raw = store.getItem(this.key);
      if (typeof raw !== 'string' || !raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  save(data) {
    const store = storage();
    if (!store) return false;
    try {
      const raw = JSON.stringify(data);
      if (typeof raw !== 'string') return false;
      store.setItem(this.key, raw);
      return true;
    } catch (err) {
      return false;
    }
  }

  clear() {
    const store = storage();
    if (!store) return false;
    try {
      store.removeItem(this.key);
      return true;
    } catch (err) {
      return false;
    }
  }
}
