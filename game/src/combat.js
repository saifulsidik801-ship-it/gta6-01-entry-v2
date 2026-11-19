// MARISOL BAY - on-foot combat: melee punch, hitscan pistol with spread and
// ammo/reload, player health with slow regen. Police and pedestrians are
// passed in by main; damage events are surfaced through optional callbacks.

import { clamp } from './config.js';

const PUNCH = {
  range: 2.5,
  cooldown: 0.42,
  damage: 1,
  knockback: 6.5,
};

const PISTOL = {
  range: 36,
  spread: 0.045,
  cooldown: 0.24,
  damage: 1,
  mag: 12,
  reload: 1.15,
  knockback: 3.2,
};

const HEALTH = {
  max: 100,
  regenDelay: 5.5,
  regenRate: 7,
  ramDamage: 7,
};

function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function aimAngle(playerState) {
  if (!playerState) return 0;
  if (typeof playerState.camYaw === 'number') return playerState.camYaw;
  if (typeof playerState.facing === 'number') return playerState.facing;
  if (typeof playerState.heading === 'number') return playerState.heading;
  return 0;
}

export class Combat {
  constructor(scene, pedestrians, effects) {
    this.scene = scene || null;
    this.pedestrians = pedestrians || null;
    this.effects = effects || null;

    this.state = {
      ammo: PISTOL.mag,
      health: HEALTH.max,
      reloading: false,
      punchCd: 0,
      shotCd: 0,
      reloadT: 0,
      damageT: 99,
      alive: true,
    };

    this.reloading = false;
    this.onShoot = null;
    this.onPunch = null;
    this.onHitPed = null;
    this.onHitCop = null;
    this.onDamage = null;
    this.onDeath = null;

    this.time = 0;
    this.clicks = 0;
    this._keyG = false;
    this._clickQueued = false;
    this._downX = 0;
    this._downY = 0;
    this._downT = 0;
    this._onKey = (e) => {
      if (e.code === 'KeyG' && !e.repeat) this._keyG = true;
    };
    this._onDown = (e) => {
      if (e.button !== 0) return;
      this._downX = e.clientX;
      this._downY = e.clientY;
      this._downT = performance.now();
    };
    this._onUp = (e) => {
      if (e.button !== 0) return;
      const moved = Math.hypot(e.clientX - this._downX, e.clientY - this._downY);
      if (moved < 6 && performance.now() - this._downT < 350) this._clickQueued = true;
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('pointerdown', this._onDown);
      window.addEventListener('pointerup', this._onUp);
    }
  }

  fire(police) {
    const st = this.state;
    if (st.reloading || st.shotCd > 0 || !st.alive) return false;
    if (st.ammo <= 0) {
      this.beginReload();
      return false;
    }
    st.ammo -= 1;
    st.shotCd = PISTOL.cooldown;
    return true;
  }

  beginReload() {
    const st = this.state;
    if (st.reloading || st.ammo >= PISTOL.mag) return;
    st.reloading = true;
    st.reloadT = PISTOL.reload;
  }

  finishReload() {
    const st = this.state;
    st.reloading = false;
    st.reloadT = 0;
    st.ammo = PISTOL.mag;
  }

  damagePlayer(amount, reason) {
    const st = this.state;
    if (!st.alive || amount <= 0) return;
    st.health = Math.max(0, st.health - amount);
    st.damageT = 0;
    if (typeof this.onDamage === 'function') this.onDamage(amount, reason);
    if (st.health <= 0) this.die();
  }

  die() {
    const st = this.state;
    if (!st.alive) return;
    st.alive = false;
    st.health = 0;
    st.ammo = PISTOL.mag;
    st.reloading = false;
    st.reloadT = 0;
    st.punchCd = 0;
    st.shotCd = 0;
    if (typeof this.onDeath === 'function') this.onDeath({ cash: 150 });
    st.alive = true;
    st.health = HEALTH.max;
    st.damageT = 99;
  }

  // ------------------------------------------------------------------- melee
  punch(playerState, police) {
    if (this.state.punchCd > 0 || !this.state.alive) return false;
    this.state.punchCd = PUNCH.cooldown;

    const px = playerState.position.x;
    const pz = playerState.position.z;
    const aim = aimAngle(playerState);
    const fx = Math.sin(aim);
    const fz = Math.cos(aim);

    let best = null;
    let bestD = PUNCH.range;

    if (police && police.cops) {
      for (let i = 0; i < police.cops.length; i++) {
        const cop = police.cops[i];
        if (cop.down > 0) continue;
        const dx = cop.x - px;
        const dz = cop.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > bestD) continue;
        const facing = (dx * fx + dz * fz) / (d || 1);
        if (facing < 0.15) continue;
        bestD = d;
        best = { kind: 'cop', target: cop, dx, dz, d };
      }
    }

    if (this.pedestrians && this.pedestrians.peds) {
      const peds = this.pedestrians.peds;
      for (let i = 0; i < peds.length; i++) {
        const ped = peds[i];
        const dx = ped.x - px;
        const dz = ped.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > bestD) continue;
        const facing = (dx * fx + dz * fz) / (d || 1);
        if (facing < 0.15) continue;
        bestD = d;
        best = { kind: 'ped', target: ped, dx, dz, d };
      }
    }

    if (best) {
      if (best.kind === 'cop' && typeof best.target.hurt === 'function') {
        best.target.hurt(PUNCH.damage, best.dx, best.dz, PUNCH.knockback);
        if (typeof this.onHitCop === 'function') this.onHitCop(best.target);
      } else if (best.kind === 'ped') {
        if (this.pedestrians.scare) {
          this.pedestrians.scare(best.target.x, best.target.z, 6, 1.6);
        }
        if (this.pedestrians.knock) {
          this.pedestrians.knock(best.target, best.dx, best.dz, 1.0);
        }
        if (typeof this.onHitPed === 'function') this.onHitPed(best.target);
      }
      if (this.effects) {
        this.effects.spawnBurst(
          { x: px + fx * 0.9, y: 1.1, z: pz + fz * 0.9 },
          'dust',
          5,
        );
      }
    }

    if (typeof this.onPunch === 'function') this.onPunch(!!best);
    return true;
  }

  // ------------------------------------------------------------------ ranged
  shoot(playerState, police) {
    if (!this.fire(police)) return false;

    const st = this.state;
    const px = playerState.position.x;
    const pz = playerState.position.z;
    const aim = aimAngle(playerState) + (Math.random() - 0.5) * PISTOL.spread * 2;
    const fx = Math.sin(aim);
    const fz = Math.cos(aim);
    const eyeY = 1.25;

    if (this.effects) {
      this.effects.spawnBurst(
        { x: px + fx * 0.7, y: eyeY, z: pz + fz * 0.7 },
        'muzzle',
        7,
      );
      this.effects.spawnBurst(
        { x: px + fx * 1.1, y: eyeY, z: pz + fz * 1.1 },
        'sparks',
        4,
      );
    }

    let best = null;
    let bestT = PISTOL.range;

    const consider = (x, z, radius) => {
      const ox = x - px;
      const oz = z - pz;
      const t = ox * fx + oz * fz;
      if (t <= 0 || t >= bestT) return null;
      const perp = Math.abs(ox * fz - oz * fx);
      if (perp > radius + t * PISTOL.spread) return null;
      return t;
    };

    if (police && police.cops) {
      for (let i = 0; i < police.cops.length; i++) {
        const cop = police.cops[i];
        if (cop.down > 0) continue;
        const t = consider(cop.x, cop.z, 0.6);
        if (t !== null) {
          bestT = t;
          best = { kind: 'cop', target: cop };
        }
      }
    }

    if (this.pedestrians && this.pedestrians.peds) {
      const peds = this.pedestrians.peds;
      for (let i = 0; i < peds.length; i++) {
        const ped = peds[i];
        const t = consider(ped.x, ped.z, 0.55);
        if (t !== null) {
          bestT = t;
          best = { kind: 'ped', target: ped };
        }
      }
    }

    if (best) {
      if (best.kind === 'cop' && typeof best.target.hurt === 'function') {
        best.target.hurt(PISTOL.damage, fx, fz, PISTOL.knockback);
        if (typeof this.onHitCop === 'function') this.onHitCop(best.target);
      } else if (best.kind === 'ped') {
        if (this.pedestrians.scare) {
          this.pedestrians.scare(best.target.x, best.target.z, 12, 2.6);
        }
        if (typeof this.onHitPed === 'function') this.onHitPed(best.target);
      }
      if (this.effects) {
        this.effects.spawnBurst(
          { x: px + fx * bestT, y: 1.1, z: pz + fz * bestT },
          'impact',
          8,
        );
      }
    }

    if (typeof this.onShoot === 'function') this.onShoot(!!best);
    return true;
  }

  // ------------------------------------------------------------------ update
  update(dt, input, playerState, police) {
    const step = clamp(dt || 0, 0, 0.05);
    if (step <= 0 || !playerState) return this.state;
    const st = this.state;
    this.time += step;

    st.punchCd = Math.max(0, st.punchCd - step);
    st.shotCd = Math.max(0, st.shotCd - step);
    st.damageT += step;

    if (st.reloading) {
      st.reloadT -= step;
      if (st.reloadT <= 0) this.finishReload();
    }

    if (st.ammo <= 0 && !st.reloading) this.beginReload();

    if (input) {
      if (input.consumePress && input.consumePress('action')) {
        if (!playerState.driving) this.punch(playerState, police);
      }
      if (input.consumePress && input.consumePress('reset')) {
        this.beginReload();
      }

      const dragging = !!(input.mouse && input.mouse.dragging);
      void dragging;

      let wantShoot = this._clickQueued;
      this._clickQueued = false;
      if (this._keyG) {
        wantShoot = true;
        this._keyG = false;
      }

      if (wantShoot && !playerState.driving) {
        this.shoot(playerState, police);
        this.clicks++;
      }
    }

    this.applyRamDamage(playerState, police, step);

    if (st.damageT > HEALTH.regenDelay && st.health < HEALTH.max) {
      st.health = Math.min(HEALTH.max, st.health + HEALTH.regenRate * step);
    }

    return st;
  }

  applyRamDamage(playerState, police, step) {
    if (!police || !police.cruisers || playerState.driving) return;
    const px = playerState.position.x;
    const pz = playerState.position.z;

    for (let i = 0; i < police.cruisers.length; i++) {
      const v = police.cruisers[i].vehicle;
      const d = Math.hypot(v.x - px, v.z - pz);
      if (d < 3.4 && Math.abs(v.speed) > 6) {
        this.damagePlayer(HEALTH.ramDamage * step * 6, 'rammed');
        break;
      }
    }
  }

  dispose() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);
  }
}
