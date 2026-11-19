// MARISOL BAY - Milo Kade: articulated low-poly humanoid, movement, collision, animation.

import * as THREE from 'three';
import { PLAYER, WORLD, clamp } from './config.js';

const COLORS = {
  jacket: 0x1fa3a0,
  jacketDark: 0x14706f,
  shirt: 0xf2efe4,
  trousers: 0x2b3548,
  shoes: 0x1a1d24,
  skin: 0xc98b62,
  cap: 0xe8e2d2,
  capBrim: 0x2a6f8e,
  hair: 0x2a211c,
};

function box(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
}

function capsule(radius, length, color) {
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 4, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
}

export function buildPlayer(scene, spawn) {
  const root = new THREE.Group();
  root.name = 'milo-kade';
  scene.add(root);

  const body = new THREE.Group();
  root.add(body);

  const hipY = 0.94;
  const hips = new THREE.Group();
  hips.position.y = hipY;
  body.add(hips);

  const torso = box(0.62, 0.7, 0.36, COLORS.jacket);
  torso.position.y = 0.36;
  hips.add(torso);

  const shirtPanel = box(0.2, 0.56, 0.06, COLORS.shirt);
  shirtPanel.position.set(0, 0.38, 0.19);
  hips.add(shirtPanel);

  const collar = box(0.5, 0.1, 0.3, COLORS.jacketDark);
  collar.position.y = 0.74;
  hips.add(collar);

  const neck = capsule(0.09, 0.06, COLORS.skin);
  neck.position.y = 0.82;
  hips.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.94;
  hips.add(head);

  const skull = box(0.3, 0.32, 0.29, COLORS.skin);
  head.add(skull);

  const hair = box(0.32, 0.12, 0.31, COLORS.hair);
  hair.position.set(0, 0.17, -0.01);
  head.add(hair);

  const cap = box(0.36, 0.12, 0.35, COLORS.cap);
  cap.position.y = 0.24;
  head.add(cap);

  const brim = box(0.36, 0.045, 0.16, COLORS.capBrim);
  brim.position.set(0, 0.19, 0.24);
  head.add(brim);

  const brow = box(0.2, 0.05, 0.04, COLORS.hair);
  brow.position.set(0, 0.03, 0.15);
  head.add(brow);

  const armGeo = { upper: capsule(0.09, 0.24, COLORS.jacket), fore: capsule(0.075, 0.22, COLORS.jacketDark) };

  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.38, 0.66, 0);
    hips.add(shoulder);
    const upper = armGeo.upper.clone();
    upper.position.y = -0.17;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    shoulder.add(elbow);
    const fore = armGeo.fore.clone();
    fore.position.y = -0.14;
    elbow.add(fore);
    const hand = box(0.13, 0.15, 0.13, COLORS.skin);
    hand.position.y = -0.3;
    elbow.add(hand);
    return { shoulder, elbow };
  }

  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.17, 0, 0);
    hips.add(hip);
    const thigh = capsule(0.11, 0.3, COLORS.trousers);
    thigh.position.y = -0.24;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    hip.add(knee);
    const shin = capsule(0.095, 0.28, COLORS.trousers);
    shin.position.y = -0.22;
    knee.add(shin);
    const shoe = box(0.19, 0.12, 0.32, COLORS.shoes);
    shoe.position.set(0, -0.47, 0.05);
    knee.add(shoe);
    return { hip, knee };
  }

  const armL = makeArm(1);
  const armR = makeArm(-1);
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.52, 16),
    new THREE.MeshBasicMaterial({ color: 0x1b1f1a, transparent: true, opacity: 0.26 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  const state = {
    x: spawn.x,
    y: 0,
    z: spawn.z,
    vx: 0,
    vz: 0,
    vy: 0,
    facing: spawn.facing,
    grounded: true,
    speed: 0,
    phase: 0,
    running: false,
  };

  root.position.set(state.x, state.y, state.z);
  root.rotation.y = state.facing;

  const half = PLAYER.radius;

  function hitsCollider(x, z, feetY) {
    for (let i = 0; i < collidersRef.length; i++) {
      const c = collidersRef[i];
      if (feetY + 0.25 >= c.height) continue;
      if (c.height - feetY < PLAYER.stepHeight && c.height - feetY > -0.01) continue;
      if (x + half > c.minX && x - half < c.maxX && z + half > c.minZ && z - half < c.maxZ) {
        return c;
      }
    }
    return null;
  }

  let collidersRef = [];

  function resolveAxis(axis, delta) {
    if (delta === 0) return;
    const next = state[axis] + delta;
    const testX = axis === 'x' ? next : state.x;
    const testZ = axis === 'z' ? next : state.z;
    const hit = hitsCollider(testX, testZ, state.y);
    if (!hit) {
      state[axis] = next;
      return;
    }
    if (axis === 'x') {
      state.x = delta > 0 ? hit.minX - half : hit.maxX + half;
      state.vx = 0;
    } else {
      state.z = delta > 0 ? hit.minZ - half : hit.maxZ + half;
      state.vz = 0;
    }
  }

  function groundHeightAt(x, z, feetY) {
    let best = 0;
    for (let i = 0; i < collidersRef.length; i++) {
      const c = collidersRef[i];
      if (x + half * 0.7 > c.minX && x - half * 0.7 < c.maxX && z + half * 0.7 > c.minZ && z - half * 0.7 < c.maxZ) {
        if (c.height <= feetY + PLAYER.stepHeight + 0.06 && c.height > best) best = c.height;
      }
    }
    return best;
  }

  function update(dt, input, cameraYaw, colliders) {
    collidersRef = colliders || [];

    const forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    state.running = !!input.run;

    let dirX = 0;
    let dirZ = 0;
    if (forward !== 0 || strafe !== 0) {
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      dirX = -sin * forward + cos * strafe;
      dirZ = -cos * forward - sin * strafe;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;
    }

    const targetSpeed = state.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const desiredVX = dirX * targetSpeed;
    const desiredVZ = dirZ * targetSpeed;
    const rate = (dirX || dirZ) ? PLAYER.accel : PLAYER.decel;
    const t = Math.min(1, rate * dt / Math.max(0.001, targetSpeed));

    state.vx += (desiredVX - state.vx) * t;
    state.vz += (desiredVZ - state.vz) * t;

    if (Math.abs(state.vx) < 0.02) state.vx = 0;
    if (Math.abs(state.vz) < 0.02) state.vz = 0;

    if (input.jump && state.grounded) {
      state.vy = PLAYER.jumpSpeed;
      state.grounded = false;
    }

    state.vy -= PLAYER.gravity * dt;

    resolveAxis('x', state.vx * dt);
    resolveAxis('z', state.vz * dt);

    state.x = clamp(state.x, WORLD.minX, WORLD.half - 4);
    state.z = clamp(state.z, -WORLD.half + 4, WORLD.half - 4);

    state.y += state.vy * dt;
    const groundY = groundHeightAt(state.x, state.z, state.y);
    if (state.y <= groundY) {
      state.y = groundY;
      state.vy = 0;
      state.grounded = true;
    } else if (state.vy < 0 && state.y - groundY < 0.04) {
      state.y = groundY;
      state.vy = 0;
      state.grounded = true;
    } else {
      state.grounded = false;
    }

    state.speed = Math.hypot(state.vx, state.vz);

    if (state.speed > 0.4) {
      const want = Math.atan2(state.vx, state.vz);
      let diff = want - state.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.facing += diff * Math.min(1, dt * 13);
    }

    animate(dt);

    root.position.set(state.x, state.y, state.z);
    root.rotation.y = state.facing;
    shadow.position.y = 0.02;

    return state;
  }

  function animate(dt) {
    const moving = state.speed > 0.35;
    const stride = state.running ? 15.5 : 9.5;
    if (moving) state.phase += dt * stride;
    else state.phase += dt * 2.4;

    const amp = moving ? (state.running ? 1.0 : 0.62) * Math.min(1, state.speed / PLAYER.walkSpeed) : 0;
    const sw = Math.sin(state.phase);
    const sw2 = Math.cos(state.phase);

    if (!state.grounded) {
      legL.hip.rotation.x = -0.55;
      legR.hip.rotation.x = 0.35;
      legL.knee.rotation.x = 0.85;
      legR.knee.rotation.x = 0.35;
      armL.shoulder.rotation.x = 1.35;
      armR.shoulder.rotation.x = 1.25;
      armL.shoulder.rotation.z = 0.35;
      armR.shoulder.rotation.z = -0.35;
      armL.elbow.rotation.x = -0.7;
      armR.elbow.rotation.x = -0.7;
    } else {
      legL.hip.rotation.x = sw * 0.72 * amp;
      legR.hip.rotation.x = -sw * 0.72 * amp;
      legL.knee.rotation.x = Math.max(0, -sw) * 0.95 * amp;
      legR.knee.rotation.x = Math.max(0, sw) * 0.95 * amp;
      armL.shoulder.rotation.x = -sw * 0.62 * amp;
      armR.shoulder.rotation.x = sw * 0.62 * amp;
      armL.shoulder.rotation.z = 0.12 + amp * 0.06;
      armR.shoulder.rotation.z = -0.12 - amp * 0.06;
      armL.elbow.rotation.x = -0.2 - Math.max(0, sw) * 0.5 * amp;
      armR.elbow.rotation.x = -0.2 - Math.max(0, -sw) * 0.5 * amp;
    }

    const bob = moving ? Math.abs(sw2) * 0.035 * amp : Math.sin(state.phase) * 0.008;
    hips.position.y = hipY + bob;
    hips.rotation.z = -sw * 0.035 * amp;
    hips.rotation.y = sw * 0.06 * amp;
    head.rotation.y = -sw * 0.05 * amp;
  }

  function setPosition(x, y, z) {
    state.x = Number.isFinite(x) ? x : state.x;
    state.y = Number.isFinite(y) ? y : 0;
    state.z = Number.isFinite(z) ? z : state.z;
    state.vx = 0;
    state.vz = 0;
    state.vy = 0;
    root.position.set(state.x, state.y, state.z);
  }

  return {
    root,
    parts: { hips, head, armL, armR, legL, legR },
    state,
    update,
    setPosition,
    get position() {
      return root.position;
    },
    get facing() {
      return state.facing;
    },
    get speedKmh() {
      return Math.hypot(state.vx, state.vz) * 3.6;
    },
  };
}
