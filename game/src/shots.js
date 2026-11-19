// MARISOL BAY - screenshot staging (R10, re-authored from the R10 brief +
// top-1 study). Four shots in the winners' pattern: dense cover chase (dusk)
// + crowded on-foot (day) + night drive with roadblock + filled 3D garage.
// Every scene is staged from the live game state (real traffic, real police,
// real heli, real HUD) — no pasted images, no fake panels. applyShot returns
// the stage main.js drives each frame. All staged entities are re-pinned
// every tick (traffic / police / pedestrians keep driving otherwise), so the
// frame at screenshot time is exactly the staged frame. The player car is
// pinned too, with its speed readout held at the chase speed, so the framing
// never drifts while the car is "driving".

import * as THREE from 'three';

const IDLE = { forward: false, back: false, left: false, right: false, run: false, jump: false };
const CASH = 18450;

const SHOT_IDS = {
  cover: '01-cover-police-chase-day',
  foot: '02-on-foot-city-traffic',
  night: '03-driving-stolen-car',
  garage: '04-mission-night-turf',
};

// ------------------------------------------------------------------ helpers
function lam(hex, extra = {}) {
  return new THREE.MeshLambertMaterial({ color: hex, ...extra });
}
function basic(hex, extra = {}) {
  return new THREE.MeshBasicMaterial({ color: hex, ...extra });
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}
function setLight(ctx, o) {
  if (o.sun !== undefined) ctx.lights.sun.intensity = o.sun;
  if (o.sunColor !== undefined) ctx.lights.sun.color.setHex(o.sunColor);
  if (o.hemi !== undefined) ctx.lights.hemi.intensity = o.hemi;
  if (o.ambient !== undefined) ctx.lights.ambient.intensity = o.ambient;
  if (o.exposure !== undefined && ctx.renderer) ctx.renderer.toneMappingExposure = o.exposure;
  if (o.bg !== undefined && ctx.scene) ctx.scene.background = new THREE.Color(o.bg);
}
function pickPlayerCar(ctx) {
  const cars = ctx.parkedCars || [];
  for (const c of cars) if (c.color === 0xc8382a) return c;
  return cars[0];
}

// Re-pin staged entities every tick (they keep moving in the live sim).
function pinVehicles(list, slots) {
  const n = Math.min(list.length, slots.length);
  for (let i = 0; i < n; i++) list[i].setPose(slots[i].x, slots[i].z, slots[i].heading);
}
function pinCruisers(ctx, slots) {
  const crs = ctx.police.cruisers;
  const n = Math.min(crs.length, slots.length);
  for (let i = 0; i < n; i++) crs[i].vehicle.setPose(slots[i].x, slots[i].z, slots[i].heading);
}
function pinCops(ctx, slots) {
  const cops = ctx.police.cops;
  const n = Math.min(cops.length, slots.length);
  for (let i = 0; i < n; i++) {
    const c = cops[i];
    const s = slots[i];
    c.x = s.x;
    c.z = s.z;
    c.heading = s.yaw;
    c.group.position.set(s.x, 0, s.z);
    c.group.rotation.y = s.yaw;
  }
}
function pinPeds(ctx, slots) {
  const peds = ctx.pedestrians.peds;
  const n = Math.min(peds.length, slots.length);
  for (let i = 0; i < n; i++) {
    const p = peds[i];
    const s = slots[i];
    p.state = 'idle';
    p.x = s.x;
    p.z = s.z;
    p.homeX = s.x;
    p.homeZ = s.z;
    p.tx = s.x;
    p.tz = s.z;
    p.idleT = 9999;
    p.shiftT = 0;
    p.fleeT = 0;
    p.baseYaw = s.yaw;
    p.heading = s.yaw;
    p.yaw = s.yaw;
    p.lying = !!s.lying;
  }
}
function pinPlayerCar(ctx, car, x, z, heading, speed) {
  car.setPose(x, z, heading);
  car.speed = speed;
  car.vx = Math.sin(heading) * speed;
  car.vz = Math.cos(heading) * speed;
}

// ------------------------------------------------------------------ stage
function baseStage(ctx, opts = {}) {
  if (typeof document !== 'undefined' && document.body) document.body.classList.add('mb-shot');
  if (typeof window !== 'undefined') window.__shotReady = false;
  const stage = {
    movement: { ...IDLE },
    targetSpeed: opts.targetSpeed || 0,
    lockCamera: true,
    frames: 0,
    readyFrames: opts.readyFrames || 100,
    ready: false,
    tick() {
      stage.frames += 1;
      if (opts.onTick) opts.onTick(stage.frames);
      if (!stage.ready && stage.frames >= stage.readyFrames) {
        stage.ready = true;
        if (typeof window !== 'undefined') window.__shotReady = true;
      }
    },
  };
  return stage;
}

// ------------------------------------------------------------------ audit
// Frustum audit for the R10 tooling: counts staged entities actually inside
// the camera frame, plus the heli silhouette size as a fraction of frame
// height, plus the player position. Read by r10-tools/shoot.mjs.
function makeAudit(ctx, getItems) {
  const v = new THREE.Vector3();
  const proj = (x, y, z) => {
    v.set(x, y, z).project(ctx.camera);
    return { x: v.x, y: v.y, z: v.z, inside: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z > -1 && v.z < 1 };
  };
  return () => {
    const items = getItems();
    const counts = {};
    for (const it of items) {
      const p = proj(it.x, it.y === undefined ? 1 : it.y, it.z);
      if (p.inside) counts[it.kind] = (counts[it.kind] || 0) + 1;
    }
    let heli = { visible: false, hFrac: 0, wFrac: 0, cx: 0, cy: 0 };
    if (ctx.heli.visible) {
      const h = ctx.heli.group.position;
      const c = proj(h.x, h.y, h.z);
      let minX = 2; let maxX = -2; let minY = 2; let maxY = -2;
      for (const dx of [-4.4, 4.4]) {
        for (const dy of [-1.8, 1.8]) {
          for (const dz of [-3.4, 3.4]) {
            const p = proj(h.x + dx, h.y + dy, h.z + dz);
            if (p.z < -1 || p.z > 1) continue;
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
        }
      }
      heli = {
        visible: true,
        hFrac: maxY >= minY ? +((maxY - minY) / 2).toFixed(3) : 0,
        wFrac: maxX >= minX ? +((maxX - minX) / 2).toFixed(3) : 0,
        cx: +c.x.toFixed(2),
        cy: +c.y.toFixed(2),
      };
    }
    const pp = ctx.driving ? ctx.driving.group.position : ctx.player.position;
    return {
      counts,
      heli,
      player: { x: +pp.x.toFixed(1), z: +pp.z.toFixed(1) },
      camera: { x: +ctx.camera.position.x.toFixed(1), y: +ctx.camera.position.y.toFixed(1), z: +ctx.camera.position.z.toFixed(1) },
    };
  };
}

// ------------------------------------------------------------------ props
function buildStall(ctx, x, z, rotY, accent) {
  const g = new THREE.Group();
  const wood = lam(0x8a5a34);
  const accentMat = lam(accent);
  const white = lam(0xf2ead8);
  g.add(box(2.4, 0.9, 1.1, wood, 0, 0.45, 0));
  g.add(box(2.4, 0.08, 1.2, lam(0x6b4423), 0, 0.94, 0));
  g.add(box(0.5, 0.3, 0.4, lam(0xe05a3a), -0.7, 1.13, 0));
  g.add(box(0.4, 0.35, 0.4, lam(0x3f9c4a), 0, 1.15, 0.1));
  g.add(box(0.45, 0.28, 0.4, lam(0xe8b93c), 0.7, 1.12, -0.05));
  for (const sx of [-1.1, 1.1]) {
    for (const sz of [-0.5, 0.5]) g.add(cyl(0.04, 0.04, 2.1, lam(0x3a3f44), sx, 1.05, sz, 6));
  }
  for (let i = 0; i < 4; i++) {
    const s = box(0.62, 0.05, 1.5, i % 2 === 0 ? accentMat : white, -0.93 + i * 0.62, 2.12, 0);
    s.rotation.x = 0.18;
    g.add(s);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  ctx.scene.add(g);
  return g;
}
function buildCrates(ctx, x, z) {
  const g = new THREE.Group();
  const c1 = lam(0x9c7a4a);
  const c2 = lam(0x7a5c34);
  g.add(box(0.7, 0.7, 0.7, c1, 0, 0.35, 0));
  g.add(box(0.6, 0.6, 0.6, c2, 0.65, 0.3, 0.2));
  g.add(box(0.55, 0.55, 0.55, c1, 0.1, 1.0, 0.05));
  g.position.set(x, 0, z);
  ctx.scene.add(g);
  return g;
}
function buildRing(ctx, x, z, y) {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.18, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0x35d0d8 }),
  );
  m.position.set(x, y, z);
  ctx.scene.add(m);
  return m;
}
function buildBarrier(ctx, x, z) {
  const g = new THREE.Group();
  const orange = lam(0xff7a1a);
  const white = lam(0xf2f2f2);
  for (let i = 0; i < 6; i++) {
    g.add(box(1.2, 0.55, 0.25, i % 2 === 0 ? orange : white, -3 + i * 1.2, 0.62, 0));
  }
  g.add(box(0.25, 0.35, 0.5, lam(0x3a3f44), -2.6, 0.18, 0));
  g.add(box(0.25, 0.35, 0.5, lam(0x3a3f44), 2.6, 0.18, 0));
  g.position.set(x, 0, z);
  ctx.scene.add(g);
  return g;
}
function buildNeonSign(ctx, x, z, color) {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.08, 4.4, lam(0x3a3f44), 0, 2.2, 0, 6));
  g.add(box(1.7, 0.7, 0.12, new THREE.MeshBasicMaterial({ color }), 0, 4.4, 0));
  g.add(box(1.5, 0.5, 0.14, new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 4.4, 0));
  g.position.set(x, 0, z);
  ctx.scene.add(g);
  return g;
}
function buildGarageProps(ctx) {
  const g = new THREE.Group();
  g.add(box(22, 0.12, 16, lam(0x3a3d42), 40, 0.06, -160));
  g.add(box(0.25, 0.02, 14, lam(0xe8b93c), 33, 0.14, -160));
  g.add(box(0.25, 0.02, 14, lam(0xe8b93c), 47, 0.14, -160));
  // Freestanding neon strip on two poles behind the car (no solid wall:
  // the street + towers stay visible past the garage, like the R9 shot).
  const neon = box(6, 0.18, 0.1, new THREE.MeshBasicMaterial({ color: 0x35d0d8 }), 36, 4.2, -165);
  neon.rotation.y = 0.95;
  g.add(neon);
  for (const px of [33.2, 38.8]) {
    g.add(cyl(0.05, 0.05, 4.2, lam(0x3a3f44), px, 2.1, -165, 6));
  }
  // Tire stacks at the back of the bay.
  const tire = lam(0x1a1c1e);
  for (const [tx, tz] of [[36, -163.5], [38.5, -164.2]]) {
    for (let i = 0; i < 3; i++) g.add(cyl(0.55, 0.55, 0.35, tire, tx, 0.3 + i * 0.36, tz, 14));
  }
  // Oil drums.
  g.add(cyl(0.45, 0.45, 1.1, lam(0x8c2f26), 33, 0.55, -158.5, 12));
  g.add(cyl(0.45, 0.45, 1.1, lam(0x2f8f9c), 34.2, 0.55, -158.2, 12));
  const rack = new THREE.Group();
  rack.add(box(0.12, 2.2, 0.5, lam(0x4a4f55), -1.2, 1.1, 0));
  rack.add(box(0.12, 2.2, 0.5, lam(0x4a4f55), 1.2, 1.1, 0));
  for (const sy of [0.5, 1.1, 1.7]) rack.add(box(2.5, 0.08, 0.5, lam(0x6b5a44), 0, sy, 0));
  rack.add(box(0.7, 0.35, 0.4, lam(0x8c2f26), -0.6, 0.72, 0));
  rack.add(box(0.6, 0.3, 0.4, lam(0xe8b93c), 0.5, 0.7, 0));
  rack.add(box(0.5, 0.4, 0.35, lam(0x2f8f9c), 0, 1.35, 0));
  rack.add(box(0.8, 0.25, 0.4, lam(0x3f9c4a), -0.4, 1.88, 0));
  rack.position.set(31, 0, -163);
  rack.rotation.y = 0.95;
  g.add(rack);
  const bench = new THREE.Group();
  bench.add(box(2.6, 0.14, 1.0, lam(0x6b4423), 0, 0.95, 0));
  for (const [lx, lz] of [[-1.2, -0.4], [1.2, -0.4], [-1.2, 0.4], [1.2, 0.4]]) {
    bench.add(box(0.12, 0.95, 0.12, lam(0x4a4f55), lx, 0.48, lz));
  }
  bench.add(box(0.7, 0.4, 0.45, lam(0x8c2f26), -0.5, 1.22, 0));
  bench.add(box(0.4, 0.25, 0.3, lam(0xd8d4c6), 0.6, 1.15, 0.1));
  bench.position.set(46.5, 0, -165.5);
  bench.rotation.y = 0.95;
  g.add(bench);
  const liftY = lam(0xe8b93c);
  g.add(box(0.5, 2.4, 0.5, liftY, 40, 1.2, -161.7));
  g.add(box(0.5, 2.4, 0.5, liftY, 40, 1.2, -158.3));
  g.add(box(1.6, 0.18, 0.3, liftY, 40, 0.42, -161.7));
  g.add(box(1.6, 0.18, 0.3, liftY, 40, 0.42, -158.3));
  for (const [ox, oz, r] of [[38.5, -158.5, 0.7], [42, -161.5, 0.5], [39, -162.5, 0.45]]) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(r, 14), new THREE.MeshBasicMaterial({ color: 0x14161a }));
    s.rotation.x = -Math.PI / 2;
    s.position.set(ox, 0.14, oz);
    g.add(s);
  }
  for (const [lx, lz] of [[38, -158], [43, -162]]) {
    g.add(cyl(0.02, 0.02, 1.0, lam(0x222222), lx, 5.0, lz, 6));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    bulb.position.set(lx, 4.45, lz);
    g.add(bulb);
  }
  ctx.scene.add(g);
  return g;
}

// ------------------------------------------------------------------ shot 01
// COVER: dense downtown chase at dusk. Player coupe in the right lane,
// cruisers + traffic packed ahead, sidewalks full, big heli upper-left.
function shotCover(ctx) {
  const F = -60;
  const PX = 43.5;
  ctx.setTimeOfDay('dusk');
  setLight(ctx, { sun: 3.2, sunColor: 0xffc27a, hemi: 1.45, ambient: 0.6, exposure: 1.7, bg: 0x9a6f98 });
  ctx.cash = CASH;
  const car = pickPlayerCar(ctx);
  car.setPose(PX, F, 0);
  ctx.enterCar(car);
  ctx.police.setWanted(4);
  const cruiserSlots = [
    { x: 38.5, z: F + 2, heading: 0 },
    { x: 36.2, z: F + 14, heading: 0 },
    { x: 43.8, z: F + 26, heading: 0 },
    { x: 40, z: F + 38, heading: Math.PI },
  ];
  for (const s of cruiserSlots) ctx.police.cruisers.push(ctx.police.createCruiser(s));
  const copSlots = [
    { x: 31.5, z: F + 12, yaw: Math.PI },
    { x: 48.5, z: F + 26, yaw: Math.PI },
    // Overflow slots: extra foot cops the live sim spawns get pinned here
    // instead of wandering far away (keeps the police panel distances sane).
    { x: 31, z: F + 44, yaw: Math.PI },
    { x: 49, z: F + 36, yaw: Math.PI },
    { x: 31, z: F + 58, yaw: Math.PI },
  ];
  for (const s of copSlots.slice(0, 2)) ctx.police.cops.push(ctx.police.createCop(s));
  const trafficSlots = [
    { x: 43.5, z: F + 10, heading: 0 },
    { x: 36.2, z: F + 8, heading: Math.PI },
    { x: 36.2, z: F + 20, heading: Math.PI },
    { x: 24, z: -20, heading: Math.PI / 2 },
    { x: 34.8, z: F + 30, heading: 0 },
    { x: 45.6, z: F + 44, heading: Math.PI },
  ];
  const pedSlots = [
    { x: 31, z: F - 2, yaw: Math.PI },
    { x: 31, z: F + 10, yaw: Math.PI - 0.3 },
    { x: 31, z: F + 24, yaw: Math.PI + 0.3 },
    { x: 31, z: F + 38, yaw: Math.PI },
    { x: 31, z: F + 52, yaw: Math.PI - 0.2 },
    { x: 49, z: F + 4, yaw: Math.PI },
    { x: 49, z: F + 16, yaw: Math.PI + 0.3 },
    { x: 49, z: F + 30, yaw: Math.PI - 0.3 },
    { x: 49, z: F + 44, yaw: Math.PI },
    { x: 49, z: F + 58, yaw: Math.PI + 0.2 },
  ];
  pinVehicles(ctx.traffic.cars, trafficSlots);
  pinPeds(ctx, pedSlots);
  ctx.hud.setShotObjective('DOWNTOWN HEAT', 'LOSE THE PATROL ON THE DOWNTOWN STREETS', 'STAGE 1/2', 0);
  ctx.hud.setShotDialog('Mira Kesang', 'Crew · Driver', 'Four units on your tail, Milo — lose them through the towers, don\'t stop for anything.');
  ctx.cam.yaw = Math.PI;
  ctx.cam.setDistance(8.2);
  ctx.cam.setPitch(-0.12);
  const stage = baseStage(ctx, {
    targetSpeed: 13,
    onTick: () => {
      pinPlayerCar(ctx, car, PX, F, 0, 13);
      pinVehicles(ctx.traffic.cars, trafficSlots);
      pinCruisers(ctx, cruiserSlots);
      pinCops(ctx, copSlots);
      pinPeds(ctx, pedSlots);
      ctx.heli.placeForShot(car.group.position, 2.09, 13, 9.5, 0.02);
    },
  });
  if (typeof window !== 'undefined') {
    window.__r10audit = makeAudit(ctx, () => {
      const items = [{ kind: 'player', x: PX, y: 0.8, z: F }];
      for (const s of trafficSlots) items.push({ kind: 'car', x: s.x, y: 0.8, z: s.z });
      for (const s of cruiserSlots) items.push({ kind: 'cruiser', x: s.x, y: 0.8, z: s.z });
      for (const s of copSlots) items.push({ kind: 'cop', x: s.x, y: 1, z: s.z });
      for (const s of pedSlots) items.push({ kind: 'ped', x: s.x, y: 1, z: s.z });
      return items;
    });
  }
  return stage;
}

// ------------------------------------------------------------------ shot 02
// ON-FOOT: crowded downtown sidewalk at noon. Milo close over-shoulder,
// partner beside him, crowd + foot cops ahead, a fallen crew member, two
// market stalls, crates, traffic streaming past, muzzle flash.
function shotOnFoot(ctx) {
  ctx.setTimeOfDay('day');
  setLight(ctx, { sun: 2.5, hemi: 1.0, ambient: 0.45, exposure: 1.2 });
  ctx.cash = CASH;
  const MX = 43;
  const MZ = -38;
  ctx.player.setPosition(MX, ctx.sampleGround(MX, MZ), MZ);
  ctx.player.state.facing = 0;
  ctx.police.setWanted(2);
  const copSlots = [
    { x: 37, z: -26, yaw: Math.PI },
    { x: 46, z: -20, yaw: Math.PI },
    { x: 34, z: -30, yaw: Math.PI },
  ];
  for (const s of copSlots.slice(0, 2)) ctx.police.cops.push(ctx.police.createCop(s));
  // Overflow slots: cruisers the live sim spawns (wanted 2 allows 2) get
  // pinned into the frame instead of wandering far away.
  const cruiserSlots = [
    { x: 36.2, z: -22, heading: Math.PI },
    { x: 43.8, z: -18, heading: 0 },
  ];
  const trafficSlots = [
    { x: 36.2, z: -28, heading: Math.PI },
    { x: 43.8, z: -24, heading: 0 },
    { x: 36.2, z: -16, heading: Math.PI },
    { x: 43.8, z: -14, heading: 0 },
    { x: 36.2, z: -34, heading: Math.PI },
    { x: 43.8, z: -32, heading: 0 },
    { x: 34.8, z: -10, heading: 0 },
  ];
  const pedSlots = [
    { x: 40.2, z: -34, yaw: 0.2 },
    { x: 36, z: -32, yaw: Math.PI },
    { x: 45, z: -30, yaw: Math.PI - 0.4 },
    { x: 38, z: -26, yaw: Math.PI + 0.3 },
    { x: 49, z: -24, yaw: Math.PI },
    { x: 35, z: -22, yaw: -Math.PI / 2 },
    { x: 47, z: -20, yaw: Math.PI },
    { x: 41, z: -16, yaw: Math.PI - 0.5 },
    { x: 33, z: -18, yaw: Math.PI / 2 },
    { x: 50, z: -14, yaw: Math.PI },
    { x: 44, z: -12, yaw: Math.PI + 0.4 },
    { x: 42, z: -30, yaw: Math.PI / 2, lying: true },
  ];
  buildStall(ctx, 50, -26, Math.PI, 0x2fb6c9);
  buildStall(ctx, 30.5, -30, 0, 0xd9744f);
  buildCrates(ctx, 48.5, -32);
  buildCrates(ctx, 31.5, -16);
  pinVehicles(ctx.traffic.cars, trafficSlots);
  pinPeds(ctx, pedSlots);
  ctx.hud.setShotObjective('STREET SWEEP', 'CLEAR THE BLOCK — TAKE OUT THE CREW 1/5', 'STAGE 1/3', 0.2);
  ctx.hud.setShotDialog('Kiki', 'Crew · Lookout', 'Downtown at noon — everybody\'s out. Walk easy, Milo, the street\'s watching.');
  ctx.cam.yaw = Math.PI;
  ctx.cam.setDistance(4.6);
  ctx.cam.setPitch(0.15);
  const stage = baseStage(ctx, {
    targetSpeed: 0,
    onTick: (frames) => {
      pinVehicles(ctx.traffic.cars, trafficSlots);
      pinCruisers(ctx, cruiserSlots);
      pinCops(ctx, copSlots);
      pinPeds(ctx, pedSlots);
      const peds = ctx.pedestrians.peds;
      for (let i = 0; i < Math.min(peds.length, pedSlots.length); i++) {
        if (pedSlots[i].lying) peds[i].group.rotation.x = -1.35;
      }
      // Muzzle life is only 0.07–0.16 s, so fire almost every frame — a
      // fresh flash is always alive at screenshot time.
      if (frames % 2 === 0) ctx.effects.spawnBurst({ x: MX, y: 1.25, z: MZ + 1.5 }, 'muzzle', 12);
      if (frames % 12 === 0) ctx.effects.spawnBurst({ x: MX, y: 1.25, z: MZ + 1.5 }, 'sparks', 10);
    },
  });
  if (typeof window !== 'undefined') {
    window.__r10audit = makeAudit(ctx, () => {
      const items = [{ kind: 'player', x: MX, y: 1, z: MZ }];
      for (const s of trafficSlots) items.push({ kind: 'car', x: s.x, y: 0.8, z: s.z });
      for (const s of copSlots) items.push({ kind: 'cop', x: s.x, y: 1, z: s.z });
      for (const s of pedSlots) items.push({ kind: 'ped', x: s.x, y: 1, z: s.z });
      items.push({ kind: 'prop', x: 50, y: 1.2, z: -26 });
      items.push({ kind: 'prop', x: 30.5, y: 1.2, z: -30 });
      items.push({ kind: 'prop', x: 48.5, y: 0.5, z: -32 });
      items.push({ kind: 'prop', x: 31.5, y: 0.5, z: -16 });
      return items;
    });
  }
  return stage;
}

// ------------------------------------------------------------------ shot 03
// NIGHT DRIVE: coupe at speed down a packed avenue at night, roadblock
// ahead, checkpoint rings on the road, heli tracking from above, neon signs.
function shotNightDrive(ctx) {
  const F = -94;
  const PX = 103.5;
  ctx.setTimeOfDay('night');
  setLight(ctx, { sun: 0.9, sunColor: 0x9db8e8, hemi: 0.75, ambient: 0.45, exposure: 1.15 });
  ctx.cash = CASH;
  const car = pickPlayerCar(ctx);
  car.setPose(PX, F, 0);
  ctx.enterCar(car);
  ctx.police.setWanted(3);
  const cruiserSlots = [
    { x: 96.2, z: F + 28, heading: Math.PI },
    { x: 103.8, z: F + 28, heading: Math.PI },
    { x: 96.2, z: F + 2, heading: 0 },
  ];
  for (const s of cruiserSlots) ctx.police.cruisers.push(ctx.police.createCruiser(s));
  const copSlots = [
    { x: 91.5, z: F + 10, yaw: Math.PI },
    { x: 108.5, z: F + 22, yaw: Math.PI },
    // Overflow slots for extra foot cops the live sim spawns.
    { x: 91, z: F + 44, yaw: Math.PI },
    { x: 109, z: F + 40, yaw: Math.PI },
  ];
  for (const s of copSlots.slice(0, 2)) ctx.police.cops.push(ctx.police.createCop(s));
  const trafficSlots = [
    { x: 103.5, z: F + 14, heading: 0 },
    { x: 103.5, z: F + 18, heading: 0 },
    { x: 96.2, z: F + 8, heading: Math.PI },
    { x: 96.2, z: F + 22, heading: Math.PI },
    { x: 94.8, z: F + 16, heading: Math.PI },
  ];
  const pedSlots = [
    { x: 91, z: F + 6, yaw: Math.PI },
    { x: 91, z: F + 20, yaw: Math.PI - 0.3 },
    { x: 91, z: F + 36, yaw: Math.PI },
    { x: 109, z: F + 2, yaw: Math.PI },
    { x: 109, z: F + 16, yaw: Math.PI + 0.3 },
    { x: 109, z: F + 30, yaw: Math.PI - 0.3 },
  ];
  buildRing(ctx, 100, F + 12, 2.4);
  buildRing(ctx, 100, F + 20, 2.4);
  buildBarrier(ctx, 100, F + 26);
  buildNeonSign(ctx, 91.5, F + 28, 0xff5ad8);
  buildNeonSign(ctx, 108.5, F + 14, 0x35d0d8);
  pinVehicles(ctx.traffic.cars, trafficSlots);
  pinPeds(ctx, pedSlots);
  ctx.radio.nextStation(1);
  ctx.hud.setShotObjective('NIGHT RUNNER', 'HIT THE CHECKPOINTS — 2 DOWN, 3 TO GO', 'CHECKPOINT 2/5', 0.4);
  ctx.hud.setShotDialog('Lio', 'Crew · Mechanic', 'She\'s holding together — barely. Don\'t clip the cruisers, the suspension won\'t take it.');
  ctx.hud.setShotPopup('NEAR MISS +150');
  ctx.cam.yaw = Math.PI;
  ctx.cam.setDistance(8.0);
  ctx.cam.setPitch(-0.10);
  const stage = baseStage(ctx, {
    targetSpeed: 15,
    onTick: () => {
      pinPlayerCar(ctx, car, PX, F, 0, 15);
      pinVehicles(ctx.traffic.cars, trafficSlots);
      pinCruisers(ctx, cruiserSlots);
      pinCops(ctx, copSlots);
      pinPeds(ctx, pedSlots);
      ctx.heli.placeForShot(car.group.position, 1.5, 20, 12, 0.02);
    },
  });
  if (typeof window !== 'undefined') {
    window.__r10audit = makeAudit(ctx, () => {
      const items = [{ kind: 'player', x: PX, y: 0.8, z: F }];
      for (const s of trafficSlots) items.push({ kind: 'car', x: s.x, y: 0.8, z: s.z });
      for (const s of cruiserSlots) items.push({ kind: 'cruiser', x: s.x, y: 0.8, z: s.z });
      for (const s of copSlots) items.push({ kind: 'cop', x: s.x, y: 1, z: s.z });
      for (const s of pedSlots) items.push({ kind: 'ped', x: s.x, y: 1, z: s.z });
      items.push({ kind: 'ring', x: 100, y: 2.4, z: F + 12 });
      items.push({ kind: 'ring', x: 100, y: 2.4, z: F + 20 });
      items.push({ kind: 'prop', x: 100, y: 0.6, z: F + 32 });
      items.push({ kind: 'prop', x: 91.5, y: 4.4, z: F + 28 });
      items.push({ kind: 'prop', x: 108.5, y: 4.4, z: F + 14 });
      return items;
    });
  }
  return stage;
}

// ------------------------------------------------------------------ shot 04
// GARAGE: Hillside Garage menu screen. The coupe sits raised on the lift
// inside a filled 3D garage — tool rack, tire stacks, workbench, neon strip,
// hanging lamps, oil stains — with Milo standing by the car.
function shotGarage(ctx) {
  ctx.setTimeOfDay('night');
  setLight(ctx, { sun: 1.6, sunColor: 0xffd9a0, hemi: 1.3, ambient: 0.55, exposure: 1.6 });
  ctx.cash = CASH;
  const car = pickPlayerCar(ctx);
  car.setPose(40, -160, Math.PI / 2);
  // Milo stands camera-side of the car, 3 m to its right, so the coupe sits
  // left-of-centre in frame (clear of the upgrade panel) instead of buried
  // behind the car card.
  const MX = 42.96;
  const MZ = -161.56;
  ctx.player.setPosition(MX, ctx.sampleGround(MX, MZ), MZ);
  ctx.player.state.facing = -1.09;
  ctx.police.setWanted(0);
  buildGarageProps(ctx);
  buildCrates(ctx, 45, -157.5);
  const warm = new THREE.PointLight(0xffc37a, 120, 26, 1.8);
  warm.position.set(38, 4.4, -158);
  ctx.scene.add(warm);
  const cool = new THREE.PointLight(0x7fd8d0, 60, 20, 1.8);
  cool.position.set(43, 4.4, -163);
  ctx.scene.add(cool);
  const pedSlots = [{ x: 36.5, z: -163.5, yaw: -Math.PI / 2 + 0.3 }];
  pinPeds(ctx, pedSlots);
  ctx.hud.openGarage(CASH);
  ctx.cam.yaw = 0.95;
  ctx.cam.setDistance(6.5);
  ctx.cam.setPitch(0.14);
  const stage = baseStage(ctx, {
    targetSpeed: 0,
    onTick: () => {
      car.group.position.y = 0.45;
      pinPeds(ctx, pedSlots);
    },
  });
  if (typeof window !== 'undefined') {
    window.__r10audit = makeAudit(ctx, () => {
      const items = [
        { kind: 'player', x: 40, y: 0.8, z: -160 },
        { kind: 'ped', x: 36.5, y: 1, z: -163.5 },
        { kind: 'prop', x: 36, y: 4.2, z: -165 },
        { kind: 'prop', x: 36, y: 0.8, z: -163.5 },
        { kind: 'prop', x: 38.5, y: 0.8, z: -164.2 },
        { kind: 'prop', x: 31, y: 1.1, z: -163 },
        { kind: 'prop', x: 46.5, y: 1, z: -165.5 },
        { kind: 'prop', x: 40, y: 1.2, z: -161.7 },
        { kind: 'prop', x: 40, y: 1.2, z: -158.3 },
        { kind: 'prop', x: 33, y: 0.6, z: -158.5 },
        { kind: 'prop', x: 34.2, y: 0.6, z: -158.2 },
        { kind: 'prop', x: 45, y: 0.5, z: -157.5 },
      ];
      return items;
    });
  }
  return stage;
}

// ------------------------------------------------------------------ entry
export function applyShot(shot, ctx) {
  if (!ctx || typeof shot !== 'string') return null;
  if (shot === SHOT_IDS.cover) return shotCover(ctx);
  if (shot === SHOT_IDS.foot) return shotOnFoot(ctx);
  if (shot === SHOT_IDS.night) return shotNightDrive(ctx);
  if (shot === SHOT_IDS.garage) return shotGarage(ctx);
  return null;
}
