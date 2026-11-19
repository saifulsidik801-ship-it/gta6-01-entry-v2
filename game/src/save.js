const STORAGE_KEY = 'marisol-bay-save-v1';

export class Save {
  constructor(key = STORAGE_KEY) {
    this.key = key;
    this.lastSaved = 0;
    this.check();
  }

  check() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        this.available = false;
        return false;
      }
      const probe = '__marisol_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      this.available = true;
      return true;
    } catch (err) {
      this.available = false;
      return false;
    }
  }

  save(state) {
    const payload = {
      version: 1,
      savedAt: Date.now(),
      state: state && typeof state === 'object' ? state : {},
    };
    try {
      window.localStorage.setItem(this.key, JSON.stringify(payload));
      this.lastSaved = payload.savedAt;
      this.available = true;
      return true;
    } catch (err) {
      this.available = false;
      return false;
    }
  }

  load() {
    try {
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.state && typeof parsed.state === 'object') return parsed.state;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  clear() {
    try {
      window.localStorage.removeItem(this.key);
      this.lastSaved = 0;
      return true;
    } catch (err) {
      return false;
    }
  }
}
