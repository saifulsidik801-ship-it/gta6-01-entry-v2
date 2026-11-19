// MARISOL BAY - police response: wanted heat 0-5, pursuit cruisers sharing the
// player Vehicle physics (so they collide with world.colliders), foot cops who
// chase and attempt arrests, flashing light bars and slow heat decay.

import * as THREE from 'three';
import { WORLD, SPAWN, clamp } from './config.js';
import { Vehicle } from './vehicle.js';

const LANE = WORLD.roadWidth / 2 - 2.2;
const SW_OFF = WORLD.roadWidth / 2 + WORLD.sidewalkWidth / 2;

const HEAT = {
  max: 5,
  decayDelay: 7,
  coldDelay: 16,
  hiddenDecay: 0.14,
  coldDecay: 0.05,
};

const COP = {
  radius: 0.5,
  speed: 4.7,
  speedPerStar: 0.5,
  arrestRange: 2.35,
  arrestTime: 2.0,
  downTime: 6,
  hp: 2,
};

function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function pointBlocked(colliders, x, z, r) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.height !== undefined && c.height < 0.35) continue;
    const nx = clamp(x, c.minX, c.maxX);
    const nz = clamp(z, c.minZ, c.maxZ);
    const dx = x - nx;
    const dz = z - nz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

function footprintClear(colliders, x, z, heading, r) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  for (let s = -1; s <= 1; s++) {
    if (pointBlocked(colliders, x + fx * s * 1.6, z + fz * s * 1.6, r || 1.45)) return false;
  }
  return true;
}

const GEO = { box: null };
const MATS = new Map();

function unitBox() {
  if (!GEO.box) GEO.box = new THREE.BoxGeometry(1, 1, 1);
  return GEO.box;
}

function sharedMat(key, params) {
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial(params);
    MATS.set(key, m);
  }
  return m;
}

function addBox(parent, material, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(unitBox(), material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function buildCopMesh(navy, darkNavy, skin, cap, badge) {
  const root = new THREE.Group();
  root.name = 'foot-cop';

  const body = new THREE.Group();
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  body.add(hips);

  addBox(hips, navy, 0.5, 0.62, 0.28, 0, 0.34, 0);
  addBox(hips, darkNavy, 0.54, 0.22, 0.31, 0, 0.3, 0);
  addBox(hips, badge, 0.11, 0.08, 0.03, -0.12, 0.5, 0.155);
  addBox(hips, badge, 0.08, 0.16, 0.4, 0.22, 0.3, 0.1);

  const head = new THREE.Group();
  head.position.y = 0.8;
  hips.add(head);
  addBox(head, skin, 0.25, 0.27, 0.24, 0, 0, 0);
  addBox(head, cap, 0.3, 0.11, 0.29, 0, 0.17, -0.01);
  addBox(head, cap, 0.3, 0.045, 0.16, 0, 0.13, 0.17);

  const armL = new THREE.Group();
  armL.position.set(-0.32, 0.58, 0);
  hips.add(armL);
  addBox(armL, navy, 0.12, 0.5, 0.14, 0, -0.25, 0);
  addBox(armL, skin, 0.11, 0.1, 0.12, 0, -0.54, 0);

  const armR = new THREE.Group();
  armR.position.set(0.32, 0.58, 0);
  hips.add(armR);
  addBox(armR, navy, 0.12, 0.5, 0.14, 0, -0.25, 0);
  addBox(armR, skin, 0.11, 0.1, 0.12, 0, -0.54, 0);

  const legL = new THREE.Group();
  legL.position.set(-0.12, 0.92, 0);
  root.add(legL);
  addBox(legL, darkNavy, 0.16, 0.84, 0.18, 0, -0.43, 0);
  addBox(legL, sharedMat('cop-shoe', { color: 0x14161a }), 0.17, 0.09, 0.27, 0, -0.86, 0.04);

  const legR = new THREE.Group();
  legR.position.set(0.12, 0.92, 0);
  root.add(legR);
  addBox(legR, darkNavy, 0.16, 0.84, 0.18, 0, -0.43, 0);
  addBox(legR, sharedMat('cop-shoe', { color: 0x14161a }), 0.17, 0.09, 0.27, 0, -0.86, 0.04);

  return { root, body, hips, head, armL, armR, legL, legR };
}

function nearestLine(lines, v) {
  let best = lines[0];
  let bestD = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const d = Math.abs(lines[i] - v);
    if (d < bestD) {
      bestD = d;
      best = lines[i];
    }
  }
  return best;
}

function nextLine(lines, v, dir) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const d = (lines[i] - v) * dir;
    if (d > 1 && d < bestD) {
      bestD = d;
      best = lines[i];
    }
  }
  return best;
}

export class Police {
  constructor(scene, world, getPlayerState) {
    this.scene = scene || null;
    this.world = world || null;
    this.colliders = world && Array.isArray(world.colliders) ? world.colliders : [];
    this.getPlayerState = typeof getPlayerState === 'function' ? getPlayerState : null;

    this.cruisers = [];
    this.cops = [];
    this.group = new THREE.Group();
    this.group.name = 'police-cops';
    if (scene && scene.add) scene.add(this.group);

    this.heat = 0;
    this.wanted = 0;
    this.crimeTimer = 0;
    this.lastReason = null;
    this.time = 0;
    this.cruiserTimer = 0;
    this.copTimer = 0;
    this.player = { x: SPAWN.x, z: SPAWN.z };
    this.playerDriving = false;

    this.onBusted = null;

    this.copMats = {
      navy: sharedMat('cop-navy', { color: 0x24344d }),
      darkNavy: sharedMat('cop-navy-dark', { color: 0x1a2637 }),
      skin: sharedMat('cop-skin', { color: 0xd0a072 }),
      cap: sharedMat('cop-cap', { color: 0x18243a }),
      badge: sharedMat('cop-badge', { color: 0xffd166, emissive: 0x6a4c00, emissiveIntensity: 0.6 }),
    };
  }

  // ------------------------------------------------------------------ wanted
  addHeat(amount, reason) {
    const add = typeof amount === 'number' && isFinite(amount) ? amount : 0;
    if (add <= 0) return this.wanted;
    this.heat = Math.min(HEAT.max, this.heat + add);
    this.crimeTimer = 0;
    if (reason) this.lastReason = reason;
    this.wanted = this.computeStars();
    return this.wanted;
  }

  setWanted(n) {
    const v = typeof n === 'number' && isFinite(n) ? n : 0;
    this.heat = clamp(v, 0, HEAT.max);
    this.crimeTimer = 0;
    this.wanted = this.computeStars();
    return this.wanted;
  }

  getWanted() {
    return this.wanted;
  }

  computeStars() {
    if (this.heat <= 0.0001) return 0;
    return Math.min(HEAT.max, Math.max(1, Math.ceil(this.heat - 0.0001)));
  }

  maxCruisers() {
    const s = this.wanted;
    if (s <= 0) return 0;
    if (s <= 2) return 2;
    return Math.min(5, s);
  }

  maxCops() {
    const s = this.wanted;
    if (s <= 0) return 0;
    if (s <= 2) return 3;
    return Math.min(6, s + 1);
  }

  // ----------------------------------------------------------------- spawning
  pickRoadSpawn(pos) {
    const colliders = this.colliders;
    for (let attempt = 0; attempt < 26; attempt++) {
      const axis = Math.random() < 0.5 ? 'z' : 'x';
      const lines = axis === 'z' ? WORLD.gridLinesX : WORLD.gridLinesZ;
      const line = lines[(Math.random() * lines.length) | 0];
      const sign = Math.random() < 0.5 ? -1 : 1;
      const distance = 52 + Math.random() * 68;

      let x;
      let z;
      let dir;
      let heading;

      if (axis === 'z') {
        z = clamp(pos.z + sign * distance, WORLD.minZ + 24, WORLD.maxZ - 24);
        dir = pos.z >= z ? 1 : -1;
        x = line + dir * LANE;
        heading = dir > 0 ? 0 : Math.PI;
      } else {
        x = clamp(pos.x + sign * distance, WORLD.minX + 24, WORLD.maxX - 24);
        dir = pos.x >= x ? 1 : -1;
        z = line - dir * LANE;
        heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }

      const dx = x - pos.x;
      const dz = z - pos.z;
      if (dx * dx + dz * dz < 34 * 34) continue;
      if (!footprintClear(colliders, x, z, heading)) continue;

      let clear = true;
      for (let i = 0; i < this.cruisers.length; i++) {
        const c = this.cruisers[i];
        if (Math.hypot(c.vehicle.x - x, c.vehicle.z - z) < 9) {
          clear = false;
          break;
        }
      }
      if (clear) return { x, z, heading };
    }
    return null;
  }

  pickCopSpawn(pos) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const axis = Math.random() < 0.5 ? 'z' : 'x';
      const lines = axis === 'z' ? WORLD.gridLinesX : WORLD.gridLinesZ;
      const line = lines[(Math.random() * lines.length) | 0];
      const side = Math.random() < 0.5 ? -1 : 1;
      const along = (axis === 'z' ? pos.z : pos.x) + (Math.random() - 0.5) * 60;

      let x;
      let z;
      if (axis === 'z') {
        x = line + side * SW_OFF;
        z = clamp(along, WORLD.minZ + 6, WORLD.maxZ - 6);
      } else {
        x = clamp(along, WORLD.minX + 6, WORLD.maxX - 6);
        z = line + side * SW_OFF;
      }

      const dx = x - pos.x;
      const dz = z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 18 * 18 || d2 > 46 * 46) continue;
      if (pointBlocked(this.colliders, x, z, 0.65)) continue;
      if (this.copNear(x, z, 2.4)) continue;
      return { x, z };
    }
    return null;
  }

  copNear(x, z, dist) {
    const d2 = dist * dist;
    for (let i = 0; i < this.cops.length; i++) {
      const c = this.cops[i];
      const dx = c.x - x;
      const dz = c.z - z;
      if (dx * dx + dz * dz < d2) return true;
    }
    return false;
  }

  createCruiser(spot) {
    const vehicle = new Vehicle(this.scene, this.world, {
      x: spot.x,
      z: spot.z,
      heading: spot.heading,
      type: 'sedan',
      color: 0xf4f1e6,
      parked: false,
    });
    vehicle.colliders = this.colliders;

    const g = vehicle.group;
    const w = vehicle.width;
    const len = vehicle.length;
    const black = sharedMat('police-black', { color: 0x171a1f });
    const trim = sharedMat('police-trim', { color: 0x2b3036 });

    addBox(g, black, 0.06, 0.44, 1.55, w / 2 + 0.03, 0.68, -0.1);
    addBox(g, black, 0.06, 0.44, 1.55, -w / 2 - 0.03, 0.68, -0.1);
    addBox(g, black, w * 0.9, 0.04, len * 0.26, 0, 0.945, len * 0.24);
    addBox(g, black, w * 0.9, 0.04, len * 0.2, 0, 0.945, -len * 0.32);
    addBox(g, trim, w * 0.78, 0.3, 0.14, 0, 0.52, len / 2 + 0.12);
    addBox(g, trim, w * 0.5, 0.06, 0.1, 0, 0.235, len / 2 + 0.12);
    addBox(g, trim, 1.08, 0.09, 0.34, 0, 1.6, -0.2);

    const redMat = new THREE.MeshLambertMaterial({
      color: 0x7a1010,
      emissive: 0xff1a1a,
      emissiveIntensity: 1.2,
    });
    const blueMat = new THREE.MeshLambertMaterial({
      color: 0x10207a,
      emissive: 0x1a3cff,
      emissiveIntensity: 0.2,
    });
    addBox(g, redMat, 0.44, 0.2, 0.27, -0.27, 1.72, -0.2);
    addBox(g, blueMat, 0.44, 0.2, 0.27, 0.27, 1.72, -0.2);

    return {
      vehicle,
      redMat,
      blueMat,
      stuck: 0,
      reverse: 0,
      ramCd: 0,
      seed: Math.random() * 10,
      path: [],
      pathIndex: 0,
      chaseTimer: 0,
      furrow: 0,
    };
  }

  // Cruisers must stay on the road grid: build a Manhattan route along the
  // road lines, then pure-pursuit the waypoints. Close in, they break off the
  // route and drive straight at the player to ram.
  buildRoute(cr, px, pz) {
    const v = cr.vehicle;
    const xs = WORLD.gridLinesX;
    const zs = WORLD.gridLinesZ;

    let x = nearestLine(xs, v.x);
    let z = nearestLine(zs, v.z);
    const tgtX = nearestLine(xs, px);
    const tgtZ = nearestLine(zs, pz);

    const pts = [];
    let guard = 0;
    while (Math.abs(tgtX - x) > 0.5 && guard++ < 12) {
      const next = nextLine(xs, x, tgtX > x ? 1 : -1);
      if (next === null) break;
      x = next;
      pts.push({ x, z });
    }
    guard = 0;
    while (Math.abs(tgtZ - z) > 0.5 && guard++ < 12) {
      const next = nextLine(zs, z, tgtZ > z ? 1 : -1);
      if (next === null) break;
      z = next;
      pts.push({ x, z });
    }

    // Only close the last stretch when the target is near this intersection,
    // so the car never cuts through a city block.
    const gapToTarget = Math.hypot(px - x, pz - z);
    if (gapToTarget < 16) pts.push({ x: px, z: pz });

    const clean = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.x < WORLD.minX + 8 || p.x > WORLD.maxX - 8) continue;
      if (p.z < WORLD.minZ + 8 || p.z > WORLD.maxZ - 8) continue;
      const last = clean[clean.length - 1];
      if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.z - p.z) < 0.5) continue;
      clean.push(p);
    }

    cr.path = clean;
    cr.pathIndex = 0;
  }

  createCop(spot) {
    const m = this.copMats;
    const parts = buildCopMesh(m.navy, m.darkNavy, m.skin, m.cap, m.badge);
    this.group.add(parts.root);

    const cop = {
      group: parts.root,
      body: parts.body,
      head: parts.head,
      armL: parts.armL,
      armR: parts.armR,
      legL: parts.legL,
      legR: parts.legR,
      x: spot.x,
      z: spot.z,
      heading: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      hp: COP.hp,
      down: 0,
      arrest: 0,
      stuck: 0,
      kx: 0,
      kz: 0,
      hurt: null,
    };

    cop.hurt = (damage, dirX, dirZ, knockback) => {
      if (cop.down > 0) return false;
      cop.hp -= damage;
      const kb = typeof knockback === 'number' ? knockback : 5.5;
      const d = Math.hypot(dirX, dirZ) || 1;
      cop.kx += (dirX / d) * kb;
      cop.kz += (dirZ / d) * kb;
      if (cop.hp <= 0) {
        cop.down = COP.downTime;
        cop.arrest = 0;
      }
      return true;
    };

    parts.root.position.set(cop.x, 0, cop.z);
    parts.root.rotation.y = cop.heading;
    return cop;
  }

  resetCop(cop, pos) {
    const spot = this.pickCopSpawn(pos);
    const px = spot ? spot.x : clamp(pos.x + 20, WORLD.minX + 4, WORLD.maxX - 4);
    const pz = spot ? spot.z : clamp(pos.z + 12, WORLD.minZ + 4, WORLD.maxZ - 4);
    cop.x = px;
    cop.z = pz;
    cop.hp = COP.hp;
    cop.down = 0;
    cop.arrest = 0;
    cop.stuck = 0;
    cop.kx = 0;
    cop.kz = 0;
    cop.group.rotation.z = 0;
    cop.group.position.set(px, 0, pz);
  }

  // ------------------------------------------------------------------ removal
  removeCruiser(cr) {
    if (this.scene && cr.vehicle.group) this.scene.remove(cr.vehicle.group);
    if (cr.redMat) cr.redMat.dispose();
    if (cr.blueMat) cr.blueMat.dispose();
  }

  removeCop(cop) {
    this.group.remove(cop.group);
  }

  clear() {
    for (let i = 0; i < this.cruisers.length; i++) this.removeCruiser(this.cruisers[i]);
    for (let i = 0; i < this.cops.length; i++) this.removeCop(this.cops[i]);
    this.cruisers.length = 0;
    this.cops.length = 0;
    this.cruiserTimer = 0;
    this.copTimer = 0;
  }

  busted() {
    this.heat = 0;
    this.crimeTimer = 0;
    this.wanted = 0;
    const cb = this.onBusted;
    if (typeof cb === 'function') cb({ fine: 250 });
    this.clear();
  }

  // ------------------------------------------------------------------- update
  update(dt) {
    const step = clamp(dt || 0, 0, 0.05);
    if (step <= 0) return;

    const ps = (this.getPlayerState && this.getPlayerState()) || {};
    const pos = ps.position || this.player || { x: SPAWN.x, z: SPAWN.z };
    this.player = pos;
    this.playerDriving = !!ps.driving;
    this.time += step;
    this.crimeTimer += step;

    this.decayHeat(step, pos);
    this.wanted = this.computeStars();

    this.despawn(step, pos);
    this.spawn(step, pos);

    for (let i = 0; i < this.cruisers.length; i++) {
      this.updateCruiser(this.cruisers[i], step, ps, pos);
    }
    for (let i = 0; i < this.cops.length; i++) {
      this.updateCop(this.cops[i], step, ps, pos);
    }
    this.flash(step);
  }

  nearestDistance(pos) {
    let best = Infinity;
    for (let i = 0; i < this.cruisers.length; i++) {
      const v = this.cruisers[i].vehicle;
      const d = Math.hypot(v.x - pos.x, v.z - pos.z);
      if (d < best) best = d;
    }
    for (let i = 0; i < this.cops.length; i++) {
      const c = this.cops[i];
      if (c.down > 0) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d < best) best = d;
    }
    return best;
  }

  decayHeat(step, pos) {
    if (this.heat <= 0) return;
    if (this.crimeTimer < HEAT.decayDelay) return;
    const near = this.nearestDistance(pos);
    let rate = 0;
    if (near > 55) rate = HEAT.hiddenDecay;
    else if (this.crimeTimer > HEAT.coldDelay) rate = HEAT.coldDecay;
    if (rate > 0) this.heat = Math.max(0, this.heat - rate * step);
  }

  despawn(step, pos) {
    const keepC = this.maxCruisers();
    const keepF = this.maxCops();

    while (this.cruisers.length > keepC) {
      let worst = -1;
      let far = -1;
      for (let i = 0; i < this.cruisers.length; i++) {
        const v = this.cruisers[i].vehicle;
        const d = Math.hypot(v.x - pos.x, v.z - pos.z);
        if (d > far) {
          far = d;
          worst = i;
        }
      }
      if (worst < 0) break;
      this.removeCruiser(this.cruisers[worst]);
      this.cruisers.splice(worst, 1);
    }

    while (this.cops.length > keepF) {
      let worst = -1;
      let far = -1;
      for (let i = 0; i < this.cops.length; i++) {
        const c = this.cops[i];
        const d = Math.hypot(c.x - pos.x, c.z - pos.z);
        if (d > far) {
          far = d;
          worst = i;
        }
      }
      if (worst < 0) break;
      this.removeCop(this.cops[worst]);
      this.cops.splice(worst, 1);
    }

    for (let i = this.cruisers.length - 1; i >= 0; i--) {
      const v = this.cruisers[i].vehicle;
      const d = Math.hypot(v.x - pos.x, v.z - pos.z);
      if (this.heat <= 0 && d > 70) {
        this.removeCruiser(this.cruisers[i]);
        this.cruisers.splice(i, 1);
      } else if (d > 320) {
        this.removeCruiser(this.cruisers[i]);
        this.cruisers.splice(i, 1);
      }
    }

    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (this.heat <= 0 && d > 55) {
        this.removeCop(c);
        this.cops.splice(i, 1);
      } else if (d > 190) {
        this.removeCop(c);
        this.cops.splice(i, 1);
      }
    }
  }

  spawn(step, pos) {
    this.cruiserTimer -= step;
    this.copTimer -= step;

    const cruiserGap = Math.max(1.0, 2.4 - this.wanted * 0.32);
    const copGap = Math.max(0.55, 1.5 - this.wanted * 0.18);

    if (this.cruisers.length < this.maxCruisers() && this.cruiserTimer <= 0) {
      const spot = this.pickRoadSpawn(pos);
      this.cruiserTimer = spot ? cruiserGap : 0.7;
      if (spot) this.cruisers.push(this.createCruiser(spot));
    }

    if (this.cops.length < this.maxCops() && this.copTimer <= 0) {
      const spot = this.pickCopSpawn(pos);
      this.copTimer = spot ? copGap : 0.5;
      if (spot) this.cops.push(this.createCop(spot));
    }
  }

  updateCruiser(cr, step, ps, pos) {
    const v = cr.vehicle;
    const px = pos.x;
    const pz = pos.z;
    const pcar = ps.driving && typeof ps.driving === 'object' ? ps.driving : null;

    const dx = px - v.x;
    const dz = pz - v.z;
    const dist = Math.hypot(dx, dz) || 0.001;

    let tx;
    let tz;
    let direct = false;

    if (this.wanted <= 0) {
      tx = v.x + (v.x - px) * 2;
      tz = v.z + (v.z - pz) * 2;
    } else {
      direct = dist < 34;
      if (pcar && this.wanted >= 4 && typeof pcar.heading === 'number') {
        const lead = clamp(Math.abs(pcar.speed || 0) * 0.8, 6, 18);
        tx = px + Math.sin(pcar.heading) * lead;
        tz = pz + Math.cos(pcar.heading) * lead;
      } else {
        tx = px;
        tz = pz;
      }

      cr.chaseTimer -= step;
      const waypoint = cr.path && cr.path[cr.pathIndex];
      if (waypoint) {
        const wd = Math.hypot(waypoint.x - v.x, waypoint.z - v.z);
        if (wd < 11) cr.pathIndex++;
      }
      if (cr.chaseTimer <= 0) {
        this.buildRoute(cr, tx, tz);
        cr.chaseTimer = 2.2;
      }

      if (!direct) {
        const wp = cr.path && cr.path[cr.pathIndex];
        if (wp) {
          tx = wp.x;
          tz = wp.z;
        }
      }
    }

    const desired = Math.atan2(tx - v.x, tz - v.z);
    const error = wrapAngle(desired - v.heading);
    const steer = clamp(error * 2.2, -1, 1);

    let targetSpeed = 15 + this.wanted * 1.7;
    if (this.wanted <= 0) targetSpeed = 12;
    if (pcar) {
      // Ramming: keep pushing in so the cruiser actually makes contact.
      if (dist < 14 && direct) targetSpeed = Math.min(targetSpeed, 10);
      if (dist < 7 && direct) targetSpeed = Math.min(targetSpeed, 6.5);
    } else {
      targetSpeed = Math.min(targetSpeed, 11);
      if (dist < 12 && direct) targetSpeed = Math.min(targetSpeed, 3.2);
      if (dist < 6 && direct) targetSpeed = Math.min(targetSpeed, 0.8);
    }
    if (Math.abs(error) > 0.9) targetSpeed = Math.min(targetSpeed, 5.5);

    cr.reverse = Math.max(0, cr.reverse - step);
    if (cr.reverse > 0) {
      v.update(step, { throttle: -0.75, steer: -steer, handbrake: false });
    } else {
      let throttle;
      if (v.speed < targetSpeed - 0.8) {
        throttle = clamp((targetSpeed - v.speed) * 0.2 + 0.25, 0, 1);
      } else if (v.speed > targetSpeed + 1.5) {
        throttle = clamp(-(v.speed - targetSpeed) * 0.25, -1, 0);
      } else {
        throttle = 0.1;
      }
      v.update(step, { throttle, steer, handbrake: false });
    }

    const wedged = Math.abs(v.speed) < 0.6 && targetSpeed > 2;
    if (wedged) cr.stuck += step;
    else cr.stuck = Math.max(0, cr.stuck - step * 2);
    if (cr.stuck > 2.6) {
      cr.reverse = 1.25;
      cr.stuck = 0;
      cr.chaseTimer = 0;
    }

    cr.ramCd = Math.max(0, cr.ramCd - step);
    if (
      pcar && this.wanted > 0 && cr.ramCd <= 0 && dist < 4.6 &&
      Math.abs(v.speed) > 1.5
    ) {
      const nx = dx / dist;
      const nz = dz / dist;
      pcar.vx = (pcar.vx || 0) + nx * 2.2;
      pcar.vz = (pcar.vz || 0) + nz * 2.2;
      v.vx *= 0.55;
      v.vz *= 0.55;
      cr.ramCd = 1.1;
    }
  }

  updateCop(cop, step, ps, pos) {
    if (cop.down > 0) {
      cop.down -= step;
      cop.group.rotation.z = 1.45;
      if (cop.down <= 0) this.resetCop(cop, pos);
      return;
    }

    const px = pos.x;
    const pz = pos.z;
    const dx = px - cop.x;
    const dz = pz - cop.z;
    const dist = Math.hypot(dx, dz) || 0.001;

    let moveX = 0;
    let moveZ = 0;
    const chasing = this.wanted > 0;

    if (chasing) {
      const speed = COP.speed + this.wanted * COP.speedPerStar;
      moveX = (dx / dist) * speed;
      moveZ = (dz / dist) * speed;
      if (dist < 1.5) {
        moveX *= 0.15;
        moveZ *= 0.15;
      }
    } else {
      moveX = -(dx / dist) * 2.4;
      moveZ = -(dz / dist) * 2.4;
    }

    if (chasing && !ps.driving && dist < COP.arrestRange && this.wanted > 0) {
      cop.arrest += step;
      if (cop.arrest >= COP.arrestTime) {
        cop.arrest = 0;
        this.busted();
        return;
      }
    } else {
      cop.arrest = Math.max(0, cop.arrest - step * 0.75);
    }

    moveX += cop.kx;
    moveZ += cop.kz;
    cop.kx *= Math.exp(-6 * step);
    cop.kz *= Math.exp(-6 * step);

    const beforeX = cop.x;
    const beforeZ = cop.z;

    const nx = cop.x + moveX * step;
    if (!pointBlocked(this.colliders, nx, cop.z, COP.radius)) cop.x = nx;
    const nz = cop.z + moveZ * step;
    if (!pointBlocked(this.colliders, cop.x, nz, COP.radius)) cop.z = nz;

    cop.x = clamp(cop.x, WORLD.minX + 2, WORLD.maxX - 2);
    cop.z = clamp(cop.z, WORLD.minZ + 2, WORLD.maxZ - 2);

    const movedX = cop.x - beforeX;
    const movedZ = cop.z - beforeZ;
    const moved = Math.hypot(movedX, movedZ);
    if (moved > 0.002) {
      const want = Math.atan2(movedX, movedZ);
      cop.heading += wrapAngle(want - cop.heading) * Math.min(1, step * 12);
    }
    cop.phase += moved * 4.6;

    if (chasing && moved < 0.004 && dist > 2.6) cop.stuck += step;
    else cop.stuck = Math.max(0, cop.stuck - step);
    if (cop.stuck > 3.2) {
      cop.stuck = 0;
      this.resetCop(cop, pos);
      return;
    }

    const swing = Math.sin(cop.phase);
    cop.legL.rotation.x = swing * 0.68;
    cop.legR.rotation.x = -swing * 0.68;
    const reach = cop.arrest > 0 ? -0.95 : 0;
    cop.armL.rotation.x = -swing * 0.55 + reach;
    cop.armR.rotation.x = swing * 0.55 + reach;
    cop.body.position.y = Math.abs(Math.cos(cop.phase)) * 0.03;

    cop.group.position.set(cop.x, 0, cop.z);
    cop.group.rotation.y = cop.heading;
  }

  flash() {
    for (let i = 0; i < this.cruisers.length; i++) {
      const cr = this.cruisers[i];
      const on = Math.sin(this.time * 9 + cr.seed) > 0;
      cr.redMat.emissiveIntensity = on ? 1.5 : 0.1;
      cr.blueMat.emissiveIntensity = on ? 0.1 : 1.5;
    }
  }

  dispose() {
    this.clear();
    if (this.group && this.scene) this.scene.remove(this.group);
  }
}
