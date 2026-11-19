// MARISOL BAY - pedestrians: low-poly locals strolling the sidewalk grid that
// borders every road, plus a handful of idlers hanging around the marina
// promenade and the beach. Walkers follow the pavement, cross at intersections
// and turn onto the crossing sidewalk; they never leave the sidewalk band.

import * as THREE from 'three';
import { WORLD, DISTRICTS, SPAWN, makeRng, rngRange, rngPick } from './config.js';

const ROAD_HALF = WORLD.roadWidth / 2;
const SW_OFF = ROAD_HALF + WORLD.sidewalkWidth / 2;

// Along-axis travel limits. The horizontal pavements start east of the beach
// row of buildings, so walkers are kept clear of them.
const WALK_X0 = WORLD.gridMinX - SW_OFF;
const WALK_X1 = WORLD.maxX - 3;
const WALK_Z0 = WORLD.minZ + 3;
const WALK_Z1 = WORLD.maxZ - 3;

const STRIDE = 3.15;
const TURN_CHANCE = 0.42;
const SEP_DIST = 1.0;
const SEP_PUSH = 2.6;
const LAT_MIN = -1.8;
const LAT_MAX = 1.8;

const BEACH = DISTRICTS.find((d) => d.key === 'beachfront');
const MARINA = DISTRICTS.find((d) => d.key === 'marina');

const SHIRTS = [
  0xf2f0e6, 0x2f7f96, 0xd96a4a, 0x4a6d8c, 0xe8c86a,
  0x6a8f5c, 0xb4517a, 0x3b3f46, 0xdfa15c, 0x8fb7c9,
];
const PANTS = [0x2b3a4a, 0x4a4238, 0x6b6f76, 0x8f8574, 0x33383f, 0x5a6b7a];
const SKINS = [0xf1c9a5, 0xe0ac85, 0xc98d63, 0x9c6b48, 0x7a4f33, 0xf6d9bd];
const HAIRS = [0x2a2119, 0x4a3524, 0x6b4a2e, 0x1c1a18, 0x8a7355];

// ---------------------------------------------------------------- shared assets
const CACHE = { box: null, mats: new Map() };

function unitBox() {
  if (!CACHE.box) CACHE.box = new THREE.BoxGeometry(1, 1, 1);
  return CACHE.box;
}

function material(hex) {
  let m = CACHE.mats.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex });
    CACHE.mats.set(hex, m);
  }
  return m;
}

function block(w, h, d, hex) {
  const mesh = new THREE.Mesh(unitBox(), material(hex));
  mesh.scale.set(w, h, d);
  return mesh;
}

// Model is authored at ~1.8 units tall, then scaled to the ped's own height.
const BODY_H = 1.8;

function buildBody(rng) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const shirt = rngPick(rng, SHIRTS);
  const pants = rngPick(rng, PANTS);
  const skin = rngPick(rng, SKINS);
  const hair = rngPick(rng, HAIRS);

  const torso = block(0.44, 0.6, 0.26, shirt);
  torso.position.y = 1.19;
  body.add(torso);

  const hips = block(0.36, 0.14, 0.24, pants);
  hips.position.y = 0.9;
  body.add(hips);

  const neck = block(0.11, 0.07, 0.11, skin);
  neck.position.y = 1.53;
  body.add(neck);

  const head = new THREE.Group();
  head.position.y = 1.63;
  body.add(head);
  const skull = block(0.24, 0.25, 0.23, skin);
  head.add(skull);
  const hairCap = block(0.26, 0.08, 0.25, hair);
  hairCap.position.y = 0.14;
  head.add(hairCap);

  const armL = new THREE.Group();
  armL.position.set(-0.28, 1.46, 0);
  body.add(armL);
  const armLMesh = block(0.12, 0.58, 0.14, shirt);
  armLMesh.position.y = -0.29;
  armL.add(armLMesh);
  const handL = block(0.11, 0.1, 0.12, skin);
  handL.position.y = -0.62;
  armL.add(handL);

  const armR = new THREE.Group();
  armR.position.set(0.28, 1.46, 0);
  body.add(armR);
  const armRMesh = block(0.12, 0.58, 0.14, shirt);
  armRMesh.position.y = -0.29;
  armR.add(armRMesh);
  const handR = block(0.11, 0.1, 0.12, skin);
  handR.position.y = -0.62;
  armR.add(handR);

  const legL = new THREE.Group();
  legL.position.set(-0.1, 0.9, 0);
  root.add(legL);
  const legLMesh = block(0.16, 0.88, 0.18, pants);
  legLMesh.position.y = -0.44;
  legL.add(legLMesh);
  const shoeL = block(0.17, 0.08, 0.26, 0x2a2724);
  shoeL.position.set(0, -0.86, 0.03);
  legL.add(shoeL);

  const legR = new THREE.Group();
  legR.position.set(0.1, 0.9, 0);
  root.add(legR);
  const legRMesh = block(0.16, 0.88, 0.18, pants);
  legRMesh.position.y = -0.44;
  legR.add(legRMesh);
  const shoeR = block(0.17, 0.08, 0.26, 0x2a2724);
  shoeR.position.set(0, -0.86, 0.03);
  legR.add(shoeR);

  return { root, body, head, armL, armR, legL, legR };
}

// ------------------------------------------------------------------- geometry
function headingOf(p) {
  if (p.axis === 'x') return p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return p.dir > 0 ? 0 : Math.PI;
}

function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function place(p) {
  const perp = p.line + p.side * (SW_OFF + p.lat);
  if (p.axis === 'x') {
    p.x = p.along;
    p.z = perp;
  } else {
    p.x = perp;
    p.z = p.along;
  }
}

function blocked(colliders, x, z) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
  }
  return false;
}

function inIdleZone(x, z) {
  if (Math.abs(z) > WORLD.half - 8) return false;
  const promenade = Math.abs(x - WORLD.promenadeX) <= WORLD.promenadeWidth / 2 + 1.5;
  const sand = Math.abs(x - WORLD.sandCenterX) <= WORLD.sandWidth / 2 + 1.0;
  return promenade || sand;
}

function buildSidewalks() {
  const list = [];
  for (let i = 0; i < WORLD.gridLinesZ.length; i++) {
    const gz = WORLD.gridLinesZ[i];
    for (let s = -1; s <= 1; s += 2) {
      const z = gz + s * SW_OFF;
      if (z < WORLD.minZ + 2 || z > WORLD.maxZ - 2) continue;
      list.push({ axis: 'x', line: gz, side: s });
    }
  }
  for (let i = 0; i < WORLD.gridLinesX.length; i++) {
    const gx = WORLD.gridLinesX[i];
    for (let s = -1; s <= 1; s += 2) {
      const x = gx + s * SW_OFF;
      if (x < WORLD.minX + 2 || x > WORLD.maxX - 2) continue;
      list.push({ axis: 'z', line: gx, side: s });
    }
  }
  return list;
}

export class Pedestrians {
  constructor(scene, world, opts = {}) {
    this.scene = scene;
    this.world = world;
    this.colliders = (world && world.colliders) || [];
    this.count = Math.max(1, opts.count === undefined ? 24 : opts.count | 0);
    this.time = 0;

    this.rng = makeRng((opts.seed === undefined ? 0x9e3779b9 : opts.seed) >>> 0);
    this.sidewalks = buildSidewalks();

    this.group = new THREE.Group();
    this.group.name = 'pedestrians';
    scene.add(this.group);

    this.peds = [];
    this._build(opts);
  }

  // ------------------------------------------------------------------ spawning
  _build() {
    const rng = this.rng;
    const total = this.count;
    const idleCount = total >= 6 ? 5 : Math.min(total, Math.round(total * 0.25));

    for (let i = 0; i < total; i++) {
      const ped = this._makePed(rng);
      ped.index = i;
      if (i >= total - idleCount) this._initIdle(ped, rng, i);
      else this._initWalker(ped, rng, i);
      this.peds.push(ped);
      this.group.add(ped.group);
    }
  }

  _makePed(rng) {
    const height = rngRange(rng, 1.7, 1.9);
    const parts = buildBody(rng);
    parts.root.scale.setScalar(height / BODY_H);

    return {
      group: parts.root,
      body: parts.body,
      head: parts.head,
      armL: parts.armL,
      armR: parts.armR,
      legL: parts.legL,
      legR: parts.legR,
      height,
      index: 0,
      seed: rng() * 100,
      state: 'walk',
      x: 0,
      z: 0,
      heading: 0,
      yaw: 0,
      sway: 0,
      headYaw: 0,
      speed: rngRange(rng, 1.2, 2.0),
      phase: rng() * Math.PI * 2,
      lat: 0,
      slowT: 0,
      axis: 'x',
      line: 0,
      side: 1,
      dir: 1,
      along: 0,
      cornerLine: null,
      corner: Infinity,
      homeX: 0,
      homeZ: 0,
      tx: 0,
      tz: 0,
      idleT: 0,
      shiftT: 0,
      baseYaw: 0,
    };
  }

  _initWalker(p, rng, index) {
    const nearSpawn = index < 5;
    let spawnLine = SPAWN.z;
    let best = Infinity;
    for (let i = 0; i < WORLD.gridLinesZ.length; i++) {
      const d = Math.abs(WORLD.gridLinesZ[i] - SPAWN.z);
      if (d < best) {
        best = d;
        spawnLine = WORLD.gridLinesZ[i];
      }
    }
    for (let attempt = 0; attempt < 36; attempt++) {
      let sw;
      if (nearSpawn) {
        sw = { axis: 'x', line: spawnLine, side: index % 2 === 0 ? -1 : 1 };
      } else {
        sw = this.sidewalks[Math.floor(rng() * this.sidewalks.length) % this.sidewalks.length];
      }
      const lo = sw.axis === 'x' ? WALK_X0 : WALK_Z0;
      const hi = sw.axis === 'x' ? WALK_X1 : WALK_Z1;
      const along = nearSpawn
        ? Math.min(hi - 6, Math.max(lo + 6, SPAWN.x + 8 + index * 11 + rngRange(rng, -2.5, 2.5)))
        : rngRange(rng, lo + 8, hi - 8);
      const perp = sw.line + sw.side * SW_OFF;
      const x = sw.axis === 'x' ? along : perp;
      const z = sw.axis === 'x' ? perp : along;

      if (x < WORLD.minX + 1 || x > WORLD.maxX - 1) continue;
      if (z < WORLD.minZ + 1 || z > WORLD.maxZ - 1) continue;
      if (blocked(this.colliders, x, z)) continue;
      if (this._crowded(x, z, 3.2)) continue;

      p.state = 'walk';
      p.axis = sw.axis;
      p.line = sw.line;
      p.side = sw.side;
      p.dir = rng() < 0.5 ? -1 : 1;
      p.along = along;
      p.lat = 0;
      p.heading = headingOf(p);
      p.yaw = p.heading;
      place(p);
      this._nextCorner(p);

      // Don't start right on top of a crossing: step back so the first turn
      // is a real walk rather than a zero-distance snap.
      if (p.cornerLine !== null) {
        const gap = (p.corner - p.along) * p.dir;
        if (gap < 3) {
          const target = p.corner - p.dir * 3;
          const tlo = p.axis === 'x' ? WALK_X0 : WALK_Z0;
          const thi = p.axis === 'x' ? WALK_X1 : WALK_Z1;
          if (target > tlo + 1 && target < thi - 1) {
            const tx = p.axis === 'x' ? target : perp;
            const tz = p.axis === 'x' ? perp : target;
            if (!blocked(this.colliders, tx, tz)) {
              p.along = target;
              place(p);
            }
          }
        }
      }
      return;
    }
    this._initIdle(p, rng, index);
  }

  _crowded(x, z, minDist) {
    const m2 = minDist * minDist;
    for (let i = 0; i < this.peds.length; i++) {
      const o = this.peds[i];
      const dx = o.x - x;
      const dz = o.z - z;
      if (dx * dx + dz * dz < m2) return true;
    }
    return false;
  }

  _initIdle(p, rng, index) {
    const onSand = index % 2 === 0;
    let x;
    let z = 0;
    let ok = false;

    for (let attempt = 0; attempt < 40 && !ok; attempt++) {
      if (onSand) {
        x = WORLD.sandCenterX + 9 + rng() * 4;
      } else {
        x = WORLD.promenadeX + (rng() - 0.5) * (WORLD.promenadeWidth - 3.2);
      }
      const spread = MARINA ? MARINA.size.d * 0.42 : 90;
      z = rngRange(rng, -spread, spread);
      ok = inIdleZone(x, z) && !blocked(this.colliders, x, z) && !this._crowded(x, z, 2.4);
    }
    if (!ok) {
      x = WORLD.promenadeX;
      z = rngRange(rng, -40, 40);
    }

    p.state = 'idle';
    p.x = x;
    p.z = z;
    p.homeX = x;
    p.homeZ = z;
    p.tx = x;
    p.tz = z;
    p.idleT = rngRange(rng, 1, 8);
    p.shiftT = 0;
    p.baseYaw = BEACH && onSand ? -Math.PI / 2 : Math.PI / 2;
    p.heading = p.baseYaw;
    p.yaw = p.baseYaw;
    p.phase = rng() * Math.PI * 2;
  }

  // -------------------------------------------------------------- path helpers
  _nextCorner(p, from) {
    const start = from === undefined ? p.along : from;
    const lines = p.axis === 'x' ? WORLD.gridLinesX : WORLD.gridLinesZ;
    p.cornerLine = null;
    p.corner = p.dir > 0 ? Infinity : -Infinity;

    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      const c = L - p.dir * SW_OFF;
      if (p.dir > 0 ? c > start + 0.05 : c < start - 0.05) {
        if (p.cornerLine === null || (p.dir > 0 ? c < p.corner : c > p.corner)) {
          p.cornerLine = L;
          p.corner = c;
        }
      }
    }
  }

  _turnOk(axis, line, side, along) {
    const perp = line + side * SW_OFF;
    const x = axis === 'x' ? along : perp;
    const z = axis === 'x' ? perp : along;
    if (x < WORLD.minX + 1 || x > WORLD.maxX - 1) return false;
    if (z < WORLD.minZ + 1 || z > WORLD.maxZ - 1) return false;
    return !blocked(this.colliders, x, z);
  }

  _turn(p, rng) {
    const crossing = p.cornerLine;
    if (crossing === null) return false;
    const axis = p.axis === 'x' ? 'z' : 'x';
    const side = -p.dir;
    const along = p.line + p.side * (SW_OFF + p.lat);
    if (!this._turnOk(axis, crossing, side, along)) return false;

    p.axis = axis;
    p.line = crossing;
    p.side = side;
    p.along = along;
    p.lat = 0;
    p.dir = rng() < 0.5 ? -1 : 1;
    p.heading = headingOf(p);
    this._nextCorner(p);
    if (p.cornerLine === null) {
      p.dir = -p.dir;
      p.heading = headingOf(p);
      this._nextCorner(p);
    }
    return true;
  }

  _decide(p, rng, atBound) {
    if (p.cornerLine === null) {
      p.dir = -p.dir;
      p.heading = headingOf(p);
      this._nextCorner(p);
      return;
    }
    if (atBound || rng() < TURN_CHANCE) {
      if (this._turn(p, rng)) return;
      p.dir = -p.dir;
      p.heading = headingOf(p);
      this._nextCorner(p);
      return;
    }
    this._nextCorner(p, p.cornerLine + p.dir * 0.5);
  }

  // ------------------------------------------------------------------ per-frame
  _step(p, dt, rng) {
    const speed = p.slowT > 0 ? p.speed * 0.45 : p.speed;
    const prevAlong = p.along;
    const prevAxis = p.axis;
    p.phase += speed * dt * STRIDE;

    if (p.slowT <= 0 && p.lat !== 0) {
      p.lat *= 1 - Math.min(1, dt * 0.9);
      if (Math.abs(p.lat) < 0.02) p.lat = 0;
    }

    const lo = p.axis === 'x' ? WALK_X0 : WALK_Z0;
    const hi = p.axis === 'x' ? WALK_X1 : WALK_Z1;
    const along = p.along + p.dir * speed * dt;

    if (p.cornerLine !== null && (p.dir > 0 ? along >= p.corner : along <= p.corner)) {
      p.along = p.corner;
      this._decide(p, rng, false);
    } else if (along < lo || along > hi) {
      p.along = along < lo ? lo : hi;
      this._decide(p, rng, true);
    } else {
      p.along = along;
    }

    const perp = p.line + p.side * (SW_OFF + p.lat);
    const cx = p.axis === 'x' ? p.along : perp;
    const cz = p.axis === 'x' ? perp : p.along;
    if (blocked(this.colliders, cx, cz)) {
      if (p.axis === prevAxis) p.along = prevAlong;
      p.dir = -p.dir;
      p.heading = headingOf(p);
      this._nextCorner(p);
    }

    place(p);
    p.heading = headingOf(p);
  }

  _idle(p, dt) {
    const t = this.time;
    p.sway = Math.sin(t * 0.62 + p.seed) * 0.3;
    p.headYaw = Math.sin(t * 0.88 + p.seed * 2.1) * 0.42;

    if (p.shiftT > 0) {
      p.shiftT -= dt;
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.03) {
        const move = Math.min(d, 0.85 * dt);
        p.x += (dx / d) * move;
        p.z += (dz / d) * move;
        p.heading = Math.atan2(dx, dz);
        p.phase += move * 5.4;
      } else {
        p.heading = p.baseYaw;
      }
    } else {
      p.heading = p.baseYaw;
    }

    p.idleT -= dt;
    if (p.idleT <= 0) {
      p.idleT = 6 + this.rng() * 6;
      for (let attempt = 0; attempt < 10; attempt++) {
        const nx = p.homeX + (this.rng() - 0.5) * 5.5;
        const nz = p.homeZ + (this.rng() - 0.5) * 5.5;
        if (!inIdleZone(nx, nz)) continue;
        if (blocked(this.colliders, nx, nz)) continue;
        p.tx = nx;
        p.tz = nz;
        p.shiftT = 1.5;
        break;
      }
    }
  }

  _separate(dt) {
    const peds = this.peds;
    for (let i = 0; i < peds.length; i++) {
      const a = peds[i];
      for (let j = i + 1; j < peds.length; j++) {
        const b = peds[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > SEP_DIST * SEP_DIST || d2 < 1e-6) continue;

        const behind = dx * Math.sin(a.heading) + dz * Math.cos(a.heading) > 0 ? a : b;
        if (behind.state !== 'walk') continue;

        // The rear ped brakes and steps sideways, away from the ped ahead, so
        // they pass each other on the pavement instead of walking through.
        behind.slowT = Math.max(behind.slowT, 0.5);
        const rx = Math.cos(behind.heading);
        const rz = -Math.sin(behind.heading);
        const sx = behind === a ? dx : -dx;
        const sz = behind === a ? dz : -dz;
        const lateral = sx * rx + sz * rz;
        const side = Math.abs(lateral) > 0.08 ? (lateral > 0 ? -1 : 1) : (behind.index % 2 === 0 ? 1 : -1);
        const next = Math.max(LAT_MIN, Math.min(LAT_MAX, behind.lat + side * SEP_PUSH * dt));
        const perp = behind.line + behind.side * (SW_OFF + next);
        const nx = behind.axis === 'x' ? behind.along : perp;
        const nz = behind.axis === 'x' ? perp : behind.along;
        if (!blocked(this.colliders, nx, nz)) behind.lat = next;
        place(behind);
      }
    }
  }

  update(dt) {
    if (!(dt > 0)) return;
    this.time += dt;

    const peds = this.peds;
    const rng = this.rng;
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      if (p.slowT > 0) p.slowT -= dt;
      if (p.state === 'walk') this._step(p, dt, rng);
      else this._idle(p, dt);
    }

    this._separate(dt);

    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      const walking = p.state === 'walk' || p.shiftT > 0;
      const swing = Math.sin(p.phase);

      if (walking) {
        p.legL.rotation.x = swing * 0.62;
        p.legR.rotation.x = -swing * 0.62;
        p.armL.rotation.x = -swing * 0.5;
        p.armR.rotation.x = swing * 0.5;
        p.body.position.y = Math.abs(Math.cos(p.phase)) * 0.035;
        p.head.rotation.y = swing * 0.07;
      } else {
        p.legL.rotation.x *= 0.85;
        p.legR.rotation.x *= 0.85;
        p.armL.rotation.x = Math.sin(this.time * 0.9 + p.seed) * 0.05;
        p.armR.rotation.x = -Math.sin(this.time * 0.9 + p.seed) * 0.05;
        p.body.position.y = Math.sin(this.time * 1.05 + p.seed) * 0.012;
        p.head.rotation.y = p.headYaw;
      }

      p.yaw += wrapAngle(p.heading + p.sway - p.yaw) * Math.min(1, dt * 11);
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = p.yaw;
    }
  }

  dispose() {
    if (this.group && this.scene) this.scene.remove(this.group);
    this.peds.length = 0;
  }
}
