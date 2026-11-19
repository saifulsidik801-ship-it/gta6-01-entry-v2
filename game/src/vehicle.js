// MARISOL BAY - vehicles: low-poly car builder, arcade driving physics, parked spawns.

import * as THREE from 'three';
import { WORLD, clamp } from './config.js';

const DRIVE = {
  accel: 14,
  brake: 30,
  reverseAccel: 9,
  maxForward: 28,
  maxReverse: 8,
  coastDrag: 1.8,
  coastDragSpeed: 0.2,
  handbrakeDecel: 26,
  grip: 9.5,
  slideGrip: 2.1,
  steerLow: 2.35,
  steerHigh: 1.05,
  steerGripSpeed: 5,
  wheelSteerMax: 0.55,
  radius: 1.6,
  bodyOffset: 1.55,
  bounce: 0.94,
};

const TYPES = {
  sedan: {
    color: 0xdfe3e8,
    width: 1.92,
    length: 4.6,
    bodyHeight: 0.62,
    clearance: 0.3,
    cabinLength: 2.2,
    cabinHeight: 0.62,
    cabinOffset: -0.2,
    wheelRadius: 0.38,
    wheelWidth: 0.3,
    axleOffset: 1.45,
  },
  taxi: {
    color: 0xf3c53c,
    width: 1.92,
    length: 4.6,
    bodyHeight: 0.62,
    clearance: 0.3,
    cabinLength: 2.2,
    cabinHeight: 0.62,
    cabinOffset: -0.2,
    wheelRadius: 0.38,
    wheelWidth: 0.3,
    axleOffset: 1.45,
    roofSign: true,
  },
  van: {
    color: 0xe4ddca,
    width: 2.06,
    length: 5.3,
    bodyHeight: 1.0,
    clearance: 0.32,
    cabinLength: 3.2,
    cabinHeight: 0.9,
    cabinOffset: -0.35,
    wheelRadius: 0.42,
    wheelWidth: 0.32,
    axleOffset: 1.7,
  },
  sport: {
    color: 0xcf3b2b,
    width: 2.0,
    length: 4.2,
    bodyHeight: 0.5,
    clearance: 0.24,
    cabinLength: 1.7,
    cabinHeight: 0.5,
    cabinOffset: -0.45,
    wheelRadius: 0.4,
    wheelWidth: 0.34,
    axleOffset: 1.35,
    spoiler: true,
  },
};

const GEO = { box: null, shadow: null, wheels: new Map() };
const MATS = new Map();

function unitBox() {
  if (!GEO.box) GEO.box = new THREE.BoxGeometry(1, 1, 1);
  return GEO.box;
}

function shadowGeometry() {
  if (!GEO.shadow) GEO.shadow = new THREE.CircleGeometry(1, 20);
  return GEO.shadow;
}

function wheelGeometry(radius, width) {
  const key = radius.toFixed(3) + ':' + width.toFixed(3);
  let geo = GEO.wheels.get(key);
  if (!geo) {
    geo = new THREE.CylinderGeometry(radius, radius, width, 12, 1);
    geo.rotateZ(Math.PI / 2);
    GEO.wheels.set(key, geo);
  }
  return geo;
}

function sharedMat(key, params) {
  let mat = MATS.get(key);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial(params);
    MATS.set(key, mat);
  }
  return mat;
}

function paintMat(color) {
  const hex = new THREE.Color(color).getHexString();
  return sharedMat('paint:' + hex, { color });
}

function glassMat() {
  return sharedMat('glass', { color: 0x20323e });
}

function trimMat() {
  return sharedMat('trim', { color: 0x2b3036 });
}

function tireMat() {
  return sharedMat('tire', { color: 0x16191d });
}

function hubMat() {
  return sharedMat('hub', { color: 0xb9bec2 });
}

function headlightMat() {
  return sharedMat('headlight', { color: 0xfff5cf, emissive: 0xffe9a4, emissiveIntensity: 0.95 });
}

function taillightMat() {
  return sharedMat('taillight', { color: 0xd12b24, emissive: 0xff2a1e, emissiveIntensity: 0.8 });
}

function plateMat() {
  return sharedMat('plate', { color: 0xe8e6da });
}

function shadowMat() {
  return sharedMat('shadow', { color: 0x1b1f1a, transparent: true, opacity: 0.3, depthWrite: false });
}

function addBox(parent, mat, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(unitBox(), mat);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function buildCar(scene, opts = {}) {
  const type = TYPES[opts.type] ? opts.type : 'sedan';
  const dims = TYPES[type];
  const paint = paintMat(opts.color !== undefined ? opts.color : dims.color);

  const group = new THREE.Group();
  group.name = 'car-' + type;
  if (scene && scene.add) scene.add(group);

  const w = dims.width;
  const len = dims.length;
  const bodyY = dims.clearance + dims.bodyHeight / 2;
  const bodyTop = dims.clearance + dims.bodyHeight;
  const cabinY = bodyTop + dims.cabinHeight / 2;
  const cabinTop = bodyTop + dims.cabinHeight;

  addBox(group, paint, w, dims.bodyHeight, len, 0, bodyY, 0);
  addBox(group, paint, w * 0.92, 0.14, len * 0.86, 0, bodyTop - 0.02, 0);

  addBox(group, trimMat(), w + 0.04, 0.18, 0.24, 0, dims.clearance + 0.1, len / 2 - 0.06);
  addBox(group, trimMat(), w + 0.04, 0.18, 0.24, 0, dims.clearance + 0.1, -len / 2 + 0.06);

  addBox(group, paint, w * 0.84, dims.cabinHeight, dims.cabinLength, 0, cabinY, dims.cabinOffset);
  addBox(group, paint, w * 0.7, 0.08, dims.cabinLength * 0.72, 0, cabinTop + 0.02, dims.cabinOffset);

  const glass = glassMat();
  const sideY = cabinY + dims.cabinHeight * 0.06;
  const sideH = dims.cabinHeight * 0.5;
  addBox(group, glass, 0.05, sideH, dims.cabinLength * 0.82, w * 0.425, sideY, dims.cabinOffset);
  addBox(group, glass, 0.05, sideH, dims.cabinLength * 0.82, -w * 0.425, sideY, dims.cabinOffset);
  addBox(
    group, glass, w * 0.64, dims.cabinHeight * 0.42, 0.05,
    0, sideY, dims.cabinOffset + dims.cabinLength / 2 + 0.02,
  );
  addBox(
    group, glass, w * 0.64, dims.cabinHeight * 0.42, 0.05,
    0, sideY, dims.cabinOffset - dims.cabinLength / 2 - 0.02,
  );

  const lightY = bodyY + dims.bodyHeight * 0.2;
  const head = headlightMat();
  const tail = taillightMat();
  addBox(group, head, 0.36, 0.16, 0.06, w * 0.32, lightY, len / 2 + 0.02);
  addBox(group, head, 0.36, 0.16, 0.06, -w * 0.32, lightY, len / 2 + 0.02);
  addBox(group, tail, 0.34, 0.14, 0.06, w * 0.32, lightY, -len / 2 - 0.02);
  addBox(group, tail, 0.34, 0.14, 0.06, -w * 0.32, lightY, -len / 2 - 0.02);
  addBox(group, plateMat(), 0.5, 0.16, 0.04, 0, dims.clearance + 0.22, -len / 2 - 0.05);

  if (dims.roofSign) {
    addBox(group, head, 0.5, 0.2, 0.28, 0, cabinTop + 0.16, dims.cabinOffset);
  }

  if (dims.spoiler) {
    addBox(group, trimMat(), 0.08, 0.26, 0.08, w * 0.34, bodyTop + 0.13, -len / 2 + 0.5);
    addBox(group, trimMat(), 0.08, 0.26, 0.08, -w * 0.34, bodyTop + 0.13, -len / 2 + 0.5);
    addBox(group, paint, w * 0.88, 0.07, 0.44, 0, bodyTop + 0.29, -len / 2 + 0.5);
  }

  const wheels = [];
  const frontWheels = [];
  const track = w / 2 - 0.06;
  const tire = tireMat();
  const hub = hubMat();

  function addWheel(x, z, steerable) {
    const pivot = new THREE.Group();
    pivot.position.set(x, dims.wheelRadius, z);
    group.add(pivot);

    const wheel = new THREE.Mesh(wheelGeometry(dims.wheelRadius, dims.wheelWidth), tire);
    pivot.add(wheel);
    wheel.add(new THREE.Mesh(wheelGeometry(dims.wheelRadius * 0.45, dims.wheelWidth + 0.04), hub));
    pivot.wheel = wheel;

    wheels.push(wheel);
    if (steerable) frontWheels.push(pivot);
    return wheel;
  }

  addWheel(track, dims.axleOffset, true);
  addWheel(-track, dims.axleOffset, true);
  addWheel(track, -dims.axleOffset, false);
  addWheel(-track, -dims.axleOffset, false);

  const shadow = new THREE.Mesh(shadowGeometry(), shadowMat());
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(w * 0.62, len * 0.45, 1);
  shadow.position.y = 0.035;
  group.add(shadow);

  let spin = 0;

  function setSpeedVisuals(speed, steer = 0, dt = 1 / 60) {
    spin += (speed * dt) / dims.wheelRadius;
    const angle = clamp(steer, -1, 1) * DRIVE.wheelSteerMax;
    for (let i = 0; i < frontWheels.length; i++) frontWheels[i].rotation.y = angle;
    for (let i = 0; i < wheels.length; i++) wheels[i].rotation.x = spin;
  }

  const x = opts.x || 0;
  const z = opts.z || 0;
  const heading = opts.heading || 0;
  group.position.set(x, 0, z);
  group.rotation.y = heading;

  return {
    group,
    wheels,
    frontWheels,
    setSpeedVisuals,
    type,
    color: new THREE.Color(opts.color !== undefined ? opts.color : dims.color).getHex(),
    width: w,
    length: len,
    wheelRadius: dims.wheelRadius,
    x,
    z,
    heading,
  };
}

export class Vehicle {
  constructor(scene, world, opts = {}) {
    this.scene = scene || null;
    this.world = world || null;
    this.colliders = world && Array.isArray(world.colliders) ? world.colliders : [];

    const built = buildCar(scene, opts);
    this.car = built;
    this.group = built.group;
    this.wheels = built.wheels;
    this.frontWheels = built.frontWheels;
    this.type = built.type;
    this.color = built.color;

    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.vx = 0;
    this.vz = 0;
    this.steerVisual = 0;
    this.collided = false;
    this.parked = !!opts.parked;
    this.handbrake = !!opts.handbrake || this.parked;

    this.setPose(this.x, this.z, this.heading);
  }

  setPose(x, z, heading) {
    this.x = x;
    this.z = z;
    if (heading !== undefined && heading !== null) this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.steerVisual = 0;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    this.car.setSpeedVisuals(0, 0, 0);
  }

  update(dt, input) {
    const step = clamp(dt || 0, 0, 0.05);
    if (step <= 0) return this;

    const drive = input || {};
    const throttle = clamp(drive.throttle || 0, -1, 1);
    const steer = clamp(drive.steer || 0, -1, 1);
    const handbrake = drive.handbrake !== undefined ? !!drive.handbrake : this.handbrake;
    this.handbrake = handbrake;

    let fwdX = Math.sin(this.heading);
    let fwdZ = Math.cos(this.heading);
    let rightX = Math.cos(this.heading);
    let rightZ = -Math.sin(this.heading);

    let long = this.vx * fwdX + this.vz * fwdZ;
    let lat = this.vx * rightX + this.vz * rightZ;

    if (throttle > 0) {
      if (long < 0) long = Math.min(0, long + DRIVE.brake * throttle * step);
      else long = Math.min(DRIVE.maxForward, long + DRIVE.accel * throttle * step);
    } else if (throttle < 0) {
      if (long > 0) long = Math.max(0, long + DRIVE.brake * throttle * step);
      else long = Math.max(-DRIVE.maxReverse, long + DRIVE.reverseAccel * throttle * step);
    } else {
      const decay = DRIVE.coastDrag + Math.abs(long) * DRIVE.coastDragSpeed;
      if (Math.abs(long) <= decay * step) long = 0;
      else long -= Math.sign(long) * decay * step;
    }

    if (handbrake) {
      const drop = DRIVE.handbrakeDecel * step;
      if (Math.abs(long) <= drop) long = 0;
      else long -= Math.sign(long) * drop;
    }

    const grip = handbrake ? DRIVE.slideGrip : DRIVE.grip;
    lat *= Math.exp(-grip * step);
    if (Math.abs(lat) < 0.02) lat = 0;

    const sp = Math.abs(long);
    if (sp > 0.08) {
      const load = Math.min(1, sp / DRIVE.steerGripSpeed);
      const high = Math.min(1, sp / DRIVE.maxForward);
      const rate = DRIVE.steerLow + (DRIVE.steerHigh - DRIVE.steerLow) * high;
      this.heading += steer * rate * load * (long < 0 ? -1 : 1) * step;
      this.heading = ((this.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    }

    fwdX = Math.sin(this.heading);
    fwdZ = Math.cos(this.heading);
    rightX = Math.cos(this.heading);
    rightZ = -Math.sin(this.heading);

    this.vx = fwdX * long + rightX * lat;
    this.vz = fwdZ * long + rightZ * lat;

    this.x += this.vx * step;
    this.z += this.vz * step;

    this.collided = this.resolveCollisions(fwdX, fwdZ);
    this.clampToWorld();

    this.speed = this.vx * fwdX + this.vz * fwdZ;

    this.steerVisual += (steer - this.steerVisual) * Math.min(1, step * 10);
    this.car.setSpeedVisuals(this.speed, this.steerVisual, step);

    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    return this;
  }

  clampToWorld() {
    const minX = WORLD.minX + 2;
    const maxX = WORLD.maxX - 2;
    const minZ = WORLD.minZ + 2;
    const maxZ = WORLD.maxZ - 2;

    if (this.x < minX) {
      this.x = minX;
      if (this.vx < 0) this.vx = 0;
    } else if (this.x > maxX) {
      this.x = maxX;
      if (this.vx > 0) this.vx = 0;
    }

    if (this.z < minZ) {
      this.z = minZ;
      if (this.vz < 0) this.vz = 0;
    } else if (this.z > maxZ) {
      this.z = maxZ;
      if (this.vz > 0) this.vz = 0;
    }
  }

  resolveCollisions(fwdX, fwdZ) {
    const colliders = this.colliders;
    if (!colliders || colliders.length === 0) return false;

    const R = DRIVE.radius;
    let hit = false;

    for (let pass = 0; pass < 2; pass++) {
      for (let s = -1; s <= 1; s++) {
        const off = s * DRIVE.bodyOffset;
        for (let i = 0; i < colliders.length; i++) {
          const c = colliders[i];
          if (c.height !== undefined && c.height < 0.35) continue;

          const px = this.x + fwdX * off;
          const pz = this.z + fwdZ * off;
          const nearX = clamp(px, c.minX, c.maxX);
          const nearZ = clamp(pz, c.minZ, c.maxZ);
          const dx = px - nearX;
          const dz = pz - nearZ;
          const d2 = dx * dx + dz * dz;
          if (d2 >= R * R) continue;

          let nx;
          let nz;
          let pen;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            nx = dx / d;
            nz = dz / d;
            pen = R - d;
          } else {
            const toMinX = px - c.minX + R;
            const toMaxX = c.maxX - px + R;
            const toMinZ = pz - c.minZ + R;
            const toMaxZ = c.maxZ - pz + R;
            const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
            if (m === toMinX) {
              nx = -1; nz = 0; pen = toMinX;
            } else if (m === toMaxX) {
              nx = 1; nz = 0; pen = toMaxX;
            } else if (m === toMinZ) {
              nx = 0; nz = -1; pen = toMinZ;
            } else {
              nx = 0; nz = 1; pen = toMaxZ;
            }
          }

          this.x += nx * pen;
          this.z += nz * pen;

          const vn = this.vx * nx + this.vz * nz;
          if (vn < 0) {
            this.vx -= vn * nx;
            this.vz -= vn * nz;
          }
          hit = true;
        }
      }
    }

    if (hit) {
      this.vx *= DRIVE.bounce;
      this.vz *= DRIVE.bounce;
    }
    return hit;
  }
}

function circleClear(colliders, x, z, r) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.height !== undefined && c.height < 0.35) continue;
    const nearX = clamp(x, c.minX, c.maxX);
    const nearZ = clamp(z, c.minZ, c.maxZ);
    const dx = x - nearX;
    const dz = z - nearZ;
    if (dx * dx + dz * dz < r * r) return false;
  }
  return true;
}

function footprintClear(colliders, x, z, heading) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  for (let s = -1; s <= 1; s++) {
    const off = s * DRIVE.bodyOffset;
    if (!circleClear(colliders, x + fx * off, z + fz * off, 1.7)) return false;
  }
  return true;
}

function findParkingSpot(world, spot) {
  const colliders = world && Array.isArray(world.colliders) ? world.colliders : [];
  const heading = spot.heading || 0;
  if (colliders.length === 0 || footprintClear(colliders, spot.x, spot.z, heading)) return spot;

  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const px = Math.cos(heading);
  const pz = -Math.sin(heading);

  for (let k = 2.5; k <= 20; k += 2.5) {
    for (const side of [1, -1]) {
      const x = spot.x + fx * k * side;
      const z = spot.z + fz * k * side;
      if (footprintClear(colliders, x, z, heading)) return { ...spot, x, z };
    }
  }

  for (let k = 2.5; k <= 12; k += 2.5) {
    for (const side of [1, -1]) {
      const x = spot.x + px * k * side;
      const z = spot.z + pz * k * side;
      if (footprintClear(colliders, x, z, heading)) return { ...spot, x, z };
    }
  }

  return spot;
}

export function spawnParkedCars(scene, world, spots = PARKED_SPOTS) {
  const list = Array.isArray(spots) ? spots : PARKED_SPOTS;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const spot = findParkingSpot(world, list[i]);
    const car = new Vehicle(scene, world, {
      x: spot.x,
      z: spot.z,
      heading: spot.heading || 0,
      type: spot.type || 'sedan',
      color: spot.color,
      parked: true,
    });
    car.speed = 0;
    car.handbrake = true;
    out.push(car);
  }
  return out;
}

export const PARKED_SPOTS = [
  { x: -131.5, z: -50, heading: 0, type: 'sedan', color: 0xe9e3d3 },
  { x: -131.5, z: 70, heading: Math.PI, type: 'taxi', color: 0xf3c53c },
  { x: 10, z: -87.5, heading: Math.PI / 2, type: 'van', color: 0xdad4c5 },
  { x: 31.5, z: -40, heading: 0, type: 'sport', color: 0xc8382a },
  { x: 31.5, z: -120, heading: Math.PI, type: 'sedan', color: 0x2f8f9c },
  { x: 10, z: 47.5, heading: -Math.PI / 2, type: 'sport', color: 0xe0d7c4 },
];
