// MARISOL BAY - staged screenshot scenes (R14).
//
// Four scenes, one per ?shot= key, each composed to match the top-ranked
// gta6-01 entries: a dusk police chase cover, an on-foot dusk gunfight, a
// full map + stats menu, and a real garage interior. Everything here is
// written fresh for R14: the 3D dressing (wedge cars, fires, spotlight
// cones, siren pools, sky dome, garage room) is built from THREE primitives
// and the HUD extras are plain DOM. No gameplay tuning is touched — the
// heli keeps its configured orbit (26 m / 20 m), the police sim runs as
// normal, and the staged units are only re-placed each frame so the still
// holds its composition.

import * as THREE from 'three';
import { Vehicle } from './vehicle.js';

const CASH = 18450;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function lam(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function basic(color, extra = {}) {
  return new THREE.MeshBasicMaterial({ color, ...extra });
}

function box(parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  if (ry) m.rotation.y = ry;
  if (rz) m.rotation.z = rz;
  parent.add(m);
  return m;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

// Small DOM extras that sit on top of the normal HUD (district chip, rank
// strip, condition bar, event banner, steal prompt). Positioned to clear
// every built-in HUD panel at 800x480; the shoot runner checks
// .mb-shot-extra for overlaps, so keep each rect clear of the others.
function addExtra(styles, text) {
  const n = el('div', 'mb-shot-extra', text || '');
  n.style.position = 'absolute';
  n.style.zIndex = '5';
  n.style.pointerEvents = 'none';
  n.style.background = 'rgba(9,16,24,0.66)';
  n.style.border = '1px solid rgba(255,246,229,0.16)';
  n.style.borderRadius = '5px';
  n.style.color = '#ffe9c9';
  n.style.font = '600 10px/1.4 "Trebuchet MS","Segoe UI",sans-serif';
  n.style.letterSpacing = '0.12em';
  n.style.textTransform = 'uppercase';
  n.style.padding = '4px 8px';
  n.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
  n.style.whiteSpace = 'nowrap';
  for (const k of Object.keys(styles)) n.style[k] = styles[k];
  document.getElementById('hud').appendChild(n);
  return n;
}

function addBarExtra(styles, label, pct, color) {
  const n = addExtra(styles, '');
  n.style.whiteSpace = 'normal';
  const lab = el('div', null, label);
  lab.style.fontWeight = '700';
  lab.style.color = '#ffd166';
  n.appendChild(lab);
  const bar = el('div');
  bar.style.height = '5px';
  bar.style.marginTop = '3px';
  bar.style.borderRadius = '3px';
  bar.style.background = 'rgba(255,246,229,0.16)';
  bar.style.overflow = 'hidden';
  const fill = el('div');
  fill.style.height = '100%';
  fill.style.width = pct + '%';
  fill.style.background = color || 'linear-gradient(90deg,#54d98c,#a8e05f)';
  bar.appendChild(fill);
  n.appendChild(bar);
  return n;
}

// ------------------------------------------------------------------ sky dome
// Painted dusk sky: gradient + soft cloud blobs baked into one canvas, on
// the inside of a big sphere so the horizon reads pink-orange instead of a
// flat background colour. Fog is off for the dome.
function buildSkyDome(scene, mode) {
  const W = 1024;
  const H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  if (mode === 'night') {
    grad.addColorStop(0, '#070d1d');
    grad.addColorStop(0.55, '#14233d');
    grad.addColorStop(0.8, '#2c3d5e');
    grad.addColorStop(1, '#4a5a7a');
  } else {
    grad.addColorStop(0, '#3a2c68');
    grad.addColorStop(0.38, '#6e4488');
    grad.addColorStop(0.58, '#b85a7a');
    grad.addColorStop(0.74, '#ff8f5e');
    grad.addColorStop(0.88, '#ffc98a');
    grad.addColorStop(1, '#ffe2b0');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Soft cloud blobs in the bright band.
  const rng = mulberry(H * 7 + W);
  for (let i = 0; i < 26; i++) {
    const cx = rng() * W;
    const cy = H * (0.42 + rng() * 0.38);
    const rw = 40 + rng() * 130;
    const rh = 6 + rng() * 16;
    const cg = g.createRadialGradient(cx, cy, 0, cx, cy, rw);
    const tint = mode === 'night' ? '120,140,190' : (rng() < 0.5 ? '255,190,150' : '255,220,200');
    cg.addColorStop(0, `rgba(${tint},${0.16 + rng() * 0.2})`);
    cg.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = cg;
    g.save();
    g.translate(cx, cy);
    g.scale(1, rh / rw);
    g.translate(-cx, -cy);
    g.beginPath();
    g.arc(cx, cy, rw, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // Low sun glow, ahead (east) so the chase drives into it.
  const sg = g.createRadialGradient(W * 0.62, H * 0.86, 0, W * 0.62, H * 0.86, 150);
  sg.addColorStop(0, 'rgba(255,244,200,0.95)');
  sg.addColorStop(0.25, 'rgba(255,200,130,0.55)');
  sg.addColorStop(1, 'rgba(255,200,130,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  dome.name = 'shot-sky-dome';
  scene.add(dome);
  return dome;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- wedge shaping
// Turns a box-built Vehicle into a wedge supercar silhouette: sloped hood,
// front splitter, side skirts, rear diffuser + exhausts, sloped fastback
// cover over the cabin, fender humps, and a full-width tail-light bar.
// Paint-matched parts only; no badges, no logos, no real-world marks.
function wedgeify(vehicle, paintHex) {
  const g = vehicle.group;
  const paint = lam(paintHex);
  const dark = lam(0x1c1f24);
  const w = vehicle.width;
  const len = vehicle.length;
  // Sloped hood: nose low, rising toward the windscreen.
  box(g, paint, w * 0.86, 0.1, 1.5, 0, 0.86, len / 2 - 0.55, -0.3, 0, 0);
  // Front splitter + lower air dam.
  box(g, dark, w + 0.08, 0.09, 0.5, 0, 0.26, len / 2 + 0.08);
  box(g, dark, w * 0.7, 0.16, 0.1, 0, 0.42, len / 2 + 0.06);
  // Side skirts.
  box(g, dark, 0.09, 0.14, len * 0.72, w / 2 + 0.02, 0.3, 0);
  box(g, dark, 0.09, 0.14, len * 0.72, -w / 2 - 0.02, 0.3, 0);
  // Sloped fastback cover: roof line dives to the tail.
  box(g, paint, w * 0.72, 0.09, 1.7, 0, 1.24, -len / 2 + 1.05, 0.34, 0, 0);
  // Rear diffuser + twin exhausts.
  box(g, dark, w * 0.86, 0.16, 0.42, 0, 0.3, -len / 2 - 0.04);
  const exhaustMat = lam(0x8f959b);
  for (const sx of [-0.3, 0.3]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10), exhaustMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx, 0.34, -len / 2 - 0.2);
    g.add(pipe);
  }
  // Fender humps over the front wheels.
  box(g, paint, 0.52, 0.1, 1.0, w * 0.36, 0.86, len / 2 - 1.35, -0.12, 0, 0);
  box(g, paint, 0.52, 0.1, 1.0, -w * 0.36, 0.86, len / 2 - 1.35, -0.12, 0, 0);
  // Full-width tail-light bar (emissive red).
  box(g, lam(0xd12b24, { emissive: 0xff2a1e, emissiveIntensity: 1.1 }),
    w * 0.88, 0.1, 0.06, 0, 0.72, -len / 2 - 0.05);
  // Headlight glow planes (additive, so the lamps read lit at dusk).
  const glowMat = basic(0xfff6c0, { transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const sx of [-0.32, 0.32]) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.3), glowMat);
    glow.position.set(sx * w, 0.62, len / 2 + 0.08);
    g.add(glow);
  }
  return g;
}

// Headlight beam: a wide additive cone from the car's nose to the road.
function headlightCone(car) {
  const geo = new THREE.CylinderGeometry(0.35, 2.6, 1, 12, 1, true);
  geo.translate(0, -0.5, 0);
  geo.rotateX(-Math.PI / 2 + 0.12);
  const cone = new THREE.Mesh(geo, basic(0xfff3c0, {
    transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  cone.scale.set(1, 1, 9);
  cone.position.set(0, 0.6, car.length / 2 + 0.4);
  car.group.add(cone);
  return cone;
}

// --------------------------------------------------------------------- fire
// Persistent fire + smoke + light (no expiry, unlike the particle bursts):
// three additive cones, dark smoke spheres that rise and loop, one warm
// point light. tick(dt) flickers the flames and recycles the smoke.
function makeFire(scene, x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.name = 'shot-fire';
  const flameCols = [0xffdd55, 0xff9d2e, 0xff5a1e];
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const h = (3.2 - i * 0.7) * scale;
    const r = (1.5 - i * 0.32) * scale;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 10),
      basic(flameCols[i], { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    cone.position.set((i - 1) * 0.5 * scale, h / 2 + 0.15, (i % 2 ? 0.4 : -0.3) * scale);
    group.add(cone);
    flames.push(cone);
  }
  const smokes = [];
  const smokeMat = basic(0x1a1a1e, { transparent: true, opacity: 0.5, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry((1.1 + i * 0.35) * scale, 10, 8), smokeMat.clone());
    s.material.opacity = 0.42 - i * 0.06;
    s.position.set((i - 1.5) * 0.7 * scale, (2.5 + i * 1.6) * scale, (i % 2 ? 0.5 : -0.4) * scale);
    s.userData.baseY = s.position.y;
    group.add(s);
    smokes.push(s);
  }
  const light = new THREE.PointLight(0xff8a2a, 140, 42, 1.8);
  light.position.set(0, 3 * scale, 0);
  group.add(light);
  scene.add(group);
  return {
    group,
    tick(dt, t) {
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const wob = 1 + Math.sin(t * 9 + i * 2.1) * 0.12;
        f.scale.set(wob, 1 + Math.sin(t * 12 + i * 1.7) * 0.14, wob);
        f.rotation.y = t * (0.4 + i * 0.2);
      }
      for (let i = 0; i < smokes.length; i++) {
        const s = smokes[i];
        s.position.y += dt * (0.7 + i * 0.12);
        s.position.x += Math.sin(t * 0.7 + i) * dt * 0.2;
        if (s.position.y > 11 * scale) s.position.y = s.userData.baseY;
      }
      light.intensity = 120 + Math.sin(t * 11) * 28 + Math.sin(t * 23) * 12;
    },
  };
}

// Wide additive cone between two points (heli spotlight, muzzle tracer
// uses a thin box instead). Built once, re-aimed in tick via lookAt math.
function aimCone(scene, from, to, topR, botR, color, opacity) {
  const geo = new THREE.CylinderGeometry(topR, botR, 1, 18, 1, true);
  geo.translate(0, -0.5, 0);
  const mesh = new THREE.Mesh(geo, basic(color, {
    transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.position.copy(from);
  scene.add(mesh);
  const down = V3(0, -1, 0);
  const dir = new THREE.Vector3();
  const api = {
    mesh,
    update(a, b) {
      dir.copy(b).sub(a);
      const len = Math.max(1, dir.length());
      mesh.position.copy(a);
      mesh.quaternion.setFromUnitVectors(down, dir.normalize());
      mesh.scale.set(1, len, 1);
    },
  };
  api.update(from, to);
  return api;
}

// Flat additive light pool on the road (siren wash / spotlight pool).
function makePool(scene, x, z, radius, color, opacity) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 26),
    basic(color, { transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.07, z);
  scene.add(m);
  return m;
}

// Red enemy marker: floating chevron cone + ground ring.
function makeEnemyMarker(scene, x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.7, 4),
    basic(0xff2a1e, { transparent: true, opacity: 0.95 }),
  );
  cone.rotation.x = Math.PI;
  cone.position.y = 2.5;
  group.add(cone);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.75, 20),
    basic(0xff2a1e, { transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.09;
  group.add(ring);
  scene.add(group);
  return {
    group,
    set(x2, z2) { group.position.set(x2, 0, z2); },
    tick(t) {
      cone.position.y = 2.5 + Math.sin(t * 3.2) * 0.12;
      cone.rotation.y = t * 1.5;
    },
  };
}

// ------------------------------------------------------------ shared staging
function markShotReady() {
  window.__shotReady = true;
}

function baseStage(ctx) {
  document.body.classList.add('mb-shot');
  ctx.cash = CASH;
  return { movement: { forward: false, back: false, left: false, right: false, run: false, jump: false } };
}

// Park a pedestrian as a standing extra at (x, z) facing (fx, fz).
function placePed(ped, x, z, fx, fz) {
  ped.state = 'idle';
  ped.idleT = 999;
  ped.fleeT = 0;
  ped.x = x;
  ped.z = z;
  ped.homeX = x;
  ped.homeZ = z;
  ped.speed = 0;
  ped.heading = Math.atan2(fx - x, fz - z);
  ped.yaw = ped.heading;
  ped.group.position.set(x, 0, z);
  ped.group.rotation.set(0, ped.heading, 0);
}

// Hold a staged ped exactly where it was put (the sim would otherwise walk
// it away). Called from tick, after the sim update.
function holdPed(ped) {
  ped.group.position.set(ped.x, 0, ped.z);
  if (ped.lying) {
    ped.group.rotation.set(-Math.PI / 2, ped.heading, 0);
  } else {
    ped.group.rotation.set(0, ped.heading, 0);
  }
}

// A police cruiser held in formation relative to the player car.
function stageCruiser(ctx, x, z, heading) {
  const cr = ctx.police.createCruiser({ x, z, heading });
  ctx.police.cruisers.push(cr);
  return cr;
}

function holdCruiser(cr, x, z, heading) {
  cr.vehicle.setPose(x, z, heading);
}

// Frustum audit for the shoot runner: which staged subjects are on screen
// and how tall the heli reads (fraction of frame height).
function auditFor(camera, points) {
  const v = new THREE.Vector3();
  const out = {};
  for (const key of Object.keys(points)) {
    const p = points[key];
    v.copy(p).project(camera);
    out[key] = Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1;
  }
  return out;
}

// ============================================================ SHOT 01: COVER
// Dusk chase down the Downtown avenue: wedge supercar, two cruisers
// flanking, big heli ahead with a wide spotlight cone, explosion ahead,
// siren pools on the asphalt, dense HUD.
function shotCover(ctx) {
  const stage = baseStage(ctx);
  ctx.setTimeOfDay('dusk');
  if (ctx.renderer) ctx.renderer.toneMappingExposure = 1.3;
  if (ctx.lights) {
    ctx.lights.sun.intensity = 2.2;
    ctx.lights.hemi.intensity = 1.35;
    ctx.lights.ambient.intensity = 0.32;
  }
  buildSkyDome(ctx.scene, 'dusk');

  const PX = 40;
  const PZ = -80;
  const HEAD = 0;

  // Player wedge supercar, driving north up the avenue.
  const car = new Vehicle(ctx.scene, ctx.world, {
    x: PX, z: PZ, heading: HEAD, type: 'sport', color: 0xd21f26, parked: false,
  });
  wedgeify(car, 0xd21f26);
  headlightCone(car);
  ctx.enterCar(car);
  car.vz = 18;
  stage.targetSpeed = 20;
  stage.lockCamera = true;
  ctx.cam.setDistance(7.5);
  // Pitch -0.34: camera low, view tilted up so the heli (orbiting high
  // ahead) lands fully inside the upper frame instead of clipping its rotor.
  ctx.cam.setPitch(-0.34);
  ctx.cam.yaw = Math.PI;

  // Wanted 4: heli + cruisers. Two cruisers are staged flanking the player;
  // the sim may add more further out, which only fattens the panel.
  ctx.police.setWanted(4);
  const cruiserL = stageCruiser(ctx, PX - 4.2, PZ + 5, HEAD);
  const cruiserR = stageCruiser(ctx, PX + 4.2, PZ + 9, HEAD);
  const sirenL = makePool(ctx.scene, PX - 4.2, PZ + 5, 4.6, 0x2a6bff, 0.3);
  const sirenR = makePool(ctx.scene, PX + 4.2, PZ + 9, 4.6, 0xff2a1e, 0.3);

  // Heli: configured orbit (26 m / 20 m), placed due north of the player so
  // it is centred horizontally and far enough (33 m) to sit inside the
  // upper frame; body scaled 1.7x for the still (visual only). Angle is
  // cos(x)/sin(z) in heli.js, so ~pi/2 is north; the 0.2 lead compensates
  // the 0.12 rad/s orbit advance before the still is captured.
  const playerPos = car.group.position;
  ctx.heli.placeForShot(playerPos, Math.PI / 2 - 0.2, 26, 20, 0.12);
  ctx.heli.group.scale.setScalar(1.7);
  const heliTop = V3(0, 0, 0);
  const roadTarget = V3(PX, 0, PZ + 16);
  const spotCone = aimCone(ctx.scene, heliTop, roadTarget, 0.7, 12, 0xfff6c0, 0.16);
  const spotPool = makePool(ctx.scene, PX, PZ + 16, 9, 0xfff6c0, 0.4);

  // Wreck + fire ahead on the road, and traffic packed around it.
  const wreck = new Vehicle(ctx.scene, ctx.world, {
    x: PX - 1.5, z: PZ + 28, heading: 0.4, type: 'sedan', color: 0x1c1c20, parked: true,
  });
  wreck.group.rotation.z = 0.12;
  const fire = makeFire(ctx.scene, PX - 1.5, PZ + 28, 1.4);
  const fireLight2 = new THREE.PointLight(0xff7a2a, 80, 30, 1.8);
  fireLight2.position.set(PX + 4, 3.5, PZ + 24);
  ctx.scene.add(fireLight2);

  const traffic = ctx.traffic.cars;
  const ahead = [
    { i: 0, x: PX - 2.2, z: PZ + 18 },
    { i: 1, x: PX + 2.4, z: PZ + 26 },
    { i: 2, x: PX - 2.0, z: PZ + 38 },
    { i: 3, x: PX + 2.2, z: PZ + 52 },
  ];
  for (const a of ahead) {
    const tc = traffic[a.i % traffic.length];
    if (tc) ctx.traffic.setRoute(tc, 'z', PX, 1, a.x, a.z);
  }
  const oncoming = traffic[4 % traffic.length];
  if (oncoming) ctx.traffic.setRoute(oncoming, 'z', PX, -1, PX + 2.4, PZ + 58);

  // Sidewalk crowd near the player.
  const peds = ctx.pedestrians.peds;
  const crowd = [
    { i: 0, x: PX - 9.5, z: PZ + 6, fx: PX, fz: PZ + 20 },
    { i: 1, x: PX + 9.5, z: PZ - 4, fx: PX, fz: PZ + 20 },
    { i: 2, x: PX - 9.5, z: PZ + 16, fx: PX, fz: PZ + 30 },
    { i: 3, x: PX + 9.5, z: PZ + 12, fx: PX, fz: PZ + 30 },
  ];
  const crowdPeds = [];
  for (const c of crowd) {
    const p = peds[c.i % peds.length];
    if (p) { placePed(p, c.x, c.z, c.fx, c.fz); crowdPeds.push(p); }
  }

  // HUD: mission + timer + rank strip, dialog, district chip, condition bar.
  ctx.hud.setShotObjective(
    'DOWNTOWN HEAT',
    'LOSE THE PATROL ON THE DOWNTOWN STREETS',
    'STAGE 3/4',
    0.75,
  );
  ctx.hud.setShotDialog(
    'MIRA KESANG', 'CREW · DRIVER',
    'Four units on your tail, Milo — lose them through the towers, don\'t stop for anything.',
  );
  ctx.hud.setShotRadio('BAY 98.5', 'Sunset Drive', 0.4);
  addExtra({ left: '28px', top: '112px' }, '◷ 2:29  ·  DAY 9  ·  18:40  ·  RANK B — FIXER  ·  3,900 / 5,200 RP');
  addBarExtra({ left: '28px', bottom: '170px', width: '212px' }, 'DOWNTOWN  ·  NEUTRAL 58', 58, 'linear-gradient(90deg,#7fd8d0,#a8e05f)');
  // Single-line text (no bar) so it fits the 31 px gap between the district
  // chip (ends ~310) and the health bar (starts ~341) on the left column.
  addExtra({ left: '28px', bottom: '146px', width: '150px' }, 'KITE COUPE  ·  CONDITION 84%');
  if (ctx.hud.el.dialog) {
    ctx.hud.el.dialog.style.left = '36%';
    ctx.hud.el.dialog.style.bottom = '4px';
  }

  let t = 0;
  let burstT = 0;
  stage.tick = (dt) => {
    t += dt;
    burstT += dt;
    const pp = car.group.position;
    // Hold the flanking formation as the car rolls forward.
    holdCruiser(cruiserL, pp.x - 4.2, pp.z + 5, HEAD);
    holdCruiser(cruiserR, pp.x + 4.2, pp.z + 9, HEAD);
    sirenL.position.set(pp.x - 4.2, 0.07, pp.z + 5);
    sirenR.position.set(pp.x + 4.2, 0.07, pp.z + 9);
    sirenL.material.opacity = 0.16 + 0.16 * (Math.sin(t * 7) > 0 ? 1 : 0);
    sirenR.material.opacity = 0.16 + 0.16 * (Math.sin(t * 7) > 0 ? 0 : 1);
    // Spotlight cone + pool follow the heli as it drifts.
    heliTop.copy(ctx.heli.group.position);
    heliTop.y -= 1;
    roadTarget.set(pp.x, 0, pp.z + 16);
    spotCone.update(heliTop, roadTarget);
    spotPool.position.set(pp.x, 0.07, pp.z + 16);
    spotPool.material.opacity = 0.34 + Math.sin(t * 2.2) * 0.06;
    // Fire keeps burning; sparks every half second.
    fire.tick(dt, t);
    if (burstT > 0.5) {
      burstT = 0;
      ctx.effects.spawnBurst({ x: pp.x - 1.5, y: 2.2, z: pp.z + 28 }, 'impact', 10);
      ctx.effects.spawnBurst({ x: pp.x - 1.5, y: 1.2, z: pp.z + 28 }, 'sparks', 8);
    }
    for (const p of crowdPeds) holdPed(p);
  };

  window.__r10audit = () => {
    const pp = car.group.position;
    const hp = ctx.heli.group.position;
    const top = V3(hp.x, hp.y + 2.2, hp.z).project(ctx.camera);
    const bot = V3(hp.x, hp.y - 1.6, hp.z).project(ctx.camera);
    return {
      shot: '01-cover',
      ...auditFor(ctx.camera, {
        playerCar: V3(pp.x, 1, pp.z),
        heli: V3(hp.x, hp.y, hp.z),
        cruiserL: V3(pp.x - 4.2, 1, pp.z + 5),
        cruiserR: V3(pp.x + 4.2, 1, pp.z + 9),
        fire: V3(pp.x - 1.5, 2, pp.z + 28),
      }),
      heliHeightFrac: Math.abs(top.y - bot.y) / 2,
    };
  };
  markShotReady();
  return stage;
}

// ====================================================== SHOT 02: ON FOOT
// Dusk gunfight on the avenue: Milo aiming (not walking), tracer + muzzle
// flash, four marked enemies, one downed, a burning van, panicking locals,
// SEARCHING banner + steal prompt. Police panel shrinks to a couple of
// units; no speed readout on foot. Chip reads DUSK.
function shotOnFoot(ctx) {
  const stage = baseStage(ctx);
  ctx.setTimeOfDay('dusk');
  if (ctx.renderer) ctx.renderer.toneMappingExposure = 1.25;
  if (ctx.lights) {
    ctx.lights.sun.intensity = 2.2;
    ctx.lights.hemi.intensity = 1.35;
    ctx.lights.ambient.intensity = 0.32;
  }
  buildSkyDome(ctx.scene, 'dusk');

  const PX = 40;
  const PZ = 20;
  const HEAD = 0; // facing +z, up the avenue

  // Milo on the road, facing the crew ahead.
  ctx.player.setPosition(PX, 0, PZ);
  ctx.player.state.facing = HEAD;
  ctx.player.root.rotation.y = HEAD;
  stage.lockCamera = true;
  ctx.cam.setDistance(6.2);
  ctx.cam.setPitch(0.12);
  ctx.cam.yaw = Math.PI;

  // Pistol in Milo's right hand (child of the elbow so it follows the aim).
  const gunMat = lam(0x1c1f24);
  const gun = new THREE.Group();
  box(gun, gunMat, 0.09, 0.14, 0.3, 0, -0.3, 0.14);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), gunMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, -0.27, 0.32);
  gun.add(barrel);
  ctx.player.parts.armR.elbow.add(gun);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.27, 0.46);
  gun.add(muzzle);

  // Muzzle flash cone at the barrel tip.
  const flashGeo = new THREE.ConeGeometry(0.22, 0.9, 8);
  flashGeo.translate(0, 0.45, 0);
  flashGeo.rotateX(Math.PI / 2);
  const flash = new THREE.Mesh(flashGeo, basic(0xfff3ba, {
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flash.position.set(0, -0.27, 0.5);
  gun.add(flash);

  // Four enemies on the road ahead, marked red; one already down.
  const peds = ctx.pedestrians.peds;
  const enemySpots = [
    { i: 0, x: PX - 3.4, z: PZ + 15 },
    { i: 1, x: PX + 0.6, z: PZ + 19 },
    { i: 2, x: PX + 4.2, z: PZ + 14 },
    { i: 3, x: PX - 1.2, z: PZ + 24 },
  ];
  const enemies = [];
  const markers = [];
  for (const s of enemySpots) {
    const p = peds[s.i % peds.length];
    if (!p) continue;
    placePed(p, s.x, s.z, PX, PZ);
    enemies.push(p);
    markers.push(makeEnemyMarker(ctx.scene, s.x, s.z));
  }
  // Downed crew member: lying flat with a dark pool beneath.
  const down = peds[4 % peds.length];
  let downed = null;
  if (down) {
    placePed(down, PX + 2.6, PZ + 11, PX, PZ);
    down.lying = true;
    downed = down;
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 18),
      basic(0x4a0d0d, { transparent: true, opacity: 0.55, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(PX + 2.6, 0.08, PZ + 11);
    ctx.scene.add(pool);
  }

  // Burning van ahead, tilted, with fire + smoke.
  const van = new Vehicle(ctx.scene, ctx.world, {
    x: PX - 4.5, z: PZ + 30, heading: 0.35, type: 'van', color: 0x232326, parked: true,
  });
  van.group.rotation.z = 0.1;
  const vanFire = makeFire(ctx.scene, PX - 4.5, PZ + 30, 1.25);
  // Warm street lamps along the avenue so the gunfight reads at dusk.
  for (const [lx, lz] of [[PX - 8, PZ + 10], [PX + 8, PZ + 26]]) {
    const lamp = new THREE.PointLight(0xffb060, 60, 24, 1.8);
    lamp.position.set(lx, 6, lz);
    ctx.scene.add(lamp);
  }

  // Tracer from Milo's muzzle to the nearest enemy.
  const tracerMat = basic(0xfff6c0, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracer = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1), tracerMat);
  ctx.scene.add(tracer);
  const aimTarget = enemies.length ? V3(enemies[0].x, 1.35, enemies[0].z) : V3(PX, 1.2, PZ + 16);
  const muzzleWorld = new THREE.Vector3();
  const tracerMid = new THREE.Vector3();

  // Panicking locals on the sidewalks: two frozen hands-up, the rest
  // scattered by scare() so they are mid-flee at capture.
  const panicSpots = [
    { i: 5, x: PX - 9.5, z: PZ + 8, fx: PX, fz: PZ + 20 },
    { i: 6, x: PX + 9.5, z: PZ + 6, fx: PX, fz: PZ + 20 },
  ];
  const panickers = [];
  for (const s of panicSpots) {
    const p = peds[s.i % peds.length];
    if (!p) continue;
    placePed(p, s.x, s.z, s.fx, s.fz);
    panickers.push(p);
  }
  ctx.pedestrians.scare(PX, PZ + 14, 18, 8);

  // A couple of stopped cars framing the fight.
  const traffic = ctx.traffic.cars;
  const t0 = traffic[0];
  if (t0) ctx.traffic.setRoute(t0, 'z', PX, 1, PX + 2.6, PZ + 34);
  const t1 = traffic[1];
  if (t1) ctx.traffic.setRoute(t1, 'z', PX, -1, PX - 2.6, PZ + 44);

  // Light police presence: 1 star, one cruiser far off, two foot cops held.
  ctx.police.setWanted(1);
  const farCruiser = stageCruiser(ctx, PX + 2.5, PZ + 121, Math.PI);
  const copA = ctx.police.createCop({ x: PX - 6, z: PZ + 21 });
  const copB = ctx.police.createCop({ x: PX + 7, z: PZ + 33 });
  ctx.police.cops.push(copA, copB);

  ctx.hud.setShotObjective(
    'STREET SWEEP',
    'CLEAR THE BLOCK — TAKE OUT THE CREW 1/5',
    'STAGE 2/3',
    0.66,
  );
  ctx.hud.setShotDialog(
    'KIKI', 'CREW · LOOKOUT',
    'Contact ahead, Milo — four hostiles on the block. Drop them and melt away.',
  );
  ctx.hud.setShotRadio('BAY 98.5', 'Sunset Drive', 0.4);
  addExtra({ left: '28px', top: '112px' }, 'DAY 9  ·  DUSK 18:46  ·  RANK 9 — WHEELMAN  ·  1,675 / 1,800 RP');
  addBarExtra({ left: '28px', bottom: '170px', width: '212px' }, 'DOWNTOWN  ·  NEUTRAL 58', 58, 'linear-gradient(90deg,#7fd8d0,#a8e05f)');
  addExtra({ left: '28px', bottom: '24px', width: '220px', background: 'rgba(60,20,8,0.72)', border: '1px solid rgba(255,180,80,0.5)', color: '#ffd166', fontWeight: '700' },
    'SEARCHING — ZONE 31 M · 11 S');
  addExtra({ left: '50%', bottom: '150px', transform: 'translateX(-50%)', background: 'rgba(9,16,24,0.78)', color: '#fff2dd' },
    'F — STEAL TAXI');

  const armR = ctx.player.parts.armR;
  const armL = ctx.player.parts.armL;
  const legL = ctx.player.parts.legL;
  const legR = ctx.player.parts.legR;
  const head = ctx.player.parts.head;
  let t = 0;
  let burstT = 0;
  stage.tick = (dt) => {
    t += dt;
    burstT += dt;
    // Aim pose, re-applied after the walk anim each frame.
    armR.shoulder.rotation.set(-1.45, 0, -0.12);
    armR.elbow.rotation.x = -0.12;
    armL.shoulder.rotation.set(-1.15, 0, 0.55);
    armL.elbow.rotation.x = -0.95;
    legL.hip.rotation.x = 0.18;
    legR.hip.rotation.x = -0.28;
    legL.knee.rotation.x = 0.2;
    legR.knee.rotation.x = 0.35;
    head.rotation.y = 0;
    // Tracer follows the muzzle to the lead enemy.
    muzzle.getWorldPosition(muzzleWorld);
    tracerMid.copy(muzzleWorld).add(aimTarget).multiplyScalar(0.5);
    tracer.position.copy(tracerMid);
    tracer.lookAt(aimTarget);
    tracer.scale.set(1, 1, muzzleWorld.distanceTo(aimTarget));
    // Muzzle flash flickers like a strobe.
    const on = Math.sin(t * 31) > -0.6;
    flash.visible = on;
    flash.scale.setScalar(on ? 0.8 + Math.random() * 0.5 : 0.01);
    flash.material.opacity = on ? 0.75 + Math.random() * 0.25 : 0;
    if (burstT > 0.4) {
      burstT = 0;
      ctx.effects.spawnBurst({ x: aimTarget.x, y: 1.3, z: aimTarget.z }, 'muzzle', 5);
      ctx.effects.spawnBurst({ x: PX - 4.5, y: 2.4, z: PZ + 30 }, 'impact', 8);
    }
    vanFire.tick(dt, t);
    for (const m of markers) m.tick(t);
    for (const p of enemies) holdPed(p);
    if (downed) holdPed(downed);
    for (const p of panickers) {
      holdPed(p);
      // Hands up: arms raised sideways.
      p.armL.rotation.set(0, 0, 2.4);
      p.armR.rotation.set(0, 0, -2.4);
    }
    holdCruiser(farCruiser, PX + 2.5, PZ + 121, Math.PI);
    // Cap the panel: 1 cruiser + 2 cops (the sim would add up to 2 + 3).
    while (ctx.police.cruisers.length > 1) {
      ctx.police.removeCruiser(ctx.police.cruisers[ctx.police.cruisers.length - 1]);
      ctx.police.cruisers.pop();
    }
    while (ctx.police.cops.length > 2) {
      ctx.police.removeCop(ctx.police.cops[ctx.police.cops.length - 1]);
      ctx.police.cops.pop();
    }
    for (const c of [copA, copB]) {
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = Math.atan2(PX - c.x, PZ - c.z);
    }
  };

  window.__r10audit = () => {
    const pp = ctx.player.position;
    return {
      shot: '02-onfoot',
      ...auditFor(ctx.camera, {
        milo: V3(pp.x, 1.4, pp.z),
        enemy0: enemies[0] ? V3(enemies[0].x, 1.4, enemies[0].z) : V3(PX, 1, PZ + 15),
        enemy1: enemies[1] ? V3(enemies[1].x, 1.4, enemies[1].z) : V3(PX, 1, PZ + 19),
        vanFire: V3(PX - 4.5, 2, PZ + 30),
        downed: downed ? V3(downed.x, 0.5, downed.z) : V3(PX, 0.5, PZ + 11),
      }),
    };
  };
  markShotReady();
  return stage;
}

// ====================================================== SHOT 03: MAP MENU
// Full map + stats screen (the biggest gap vs the top entries): big city
// map with six named districts + %, route, markers; completion ring +
// checklist + mission ratings on the left; rank + career + save slots on
// the right; control footer. A DOM overlay — zero empty space.
function shotMap(ctx) {
  const stage = baseStage(ctx);
  ctx.setTimeOfDay('dusk');

  const style = el('style');
  style.id = 'mb-shot-map-style';
  style.textContent = `
.mb-shot-map{position:fixed;inset:0;z-index:9;display:flex;flex-direction:column;
  background:#0b1118;color:#f2e6d3;
  font:500 12px/1.4 "Trebuchet MS","Segoe UI",sans-serif;padding:10px 14px 8px;}
.mb-map-head{display:flex;align-items:baseline;gap:16px;}
.mb-map-title{font:700 22px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.14em;color:#ffb347;
  white-space:nowrap;flex:0 0 auto;}
.mb-map-tabs{display:flex;gap:4px;margin-left:8px;}
.mb-map-tab{padding:4px 10px;border-radius:4px;font:700 10px/1 "Trebuchet MS","Segoe UI",sans-serif;
  letter-spacing:.14em;color:#c9d4da;background:rgba(255,246,229,0.06);}
.mb-map-tab.on{background:#ff8a2c;color:#20160c;}
.mb-map-cash{margin-left:auto;font:700 22px/1 "Trebuchet MS","Segoe UI",sans-serif;color:#3ddc5a;}
.mb-map-body{flex:1;display:grid;grid-template-columns:190px 1fr 210px;gap:12px;margin-top:8px;min-height:0;}
.mb-map-col{background:rgba(255,246,229,0.045);border:1px solid rgba(255,246,229,0.12);
  border-radius:8px;padding:10px 12px;overflow:hidden;}
.mb-map-ring{width:104px;height:104px;border-radius:50%;margin:2px auto 8px;position:relative;
  background:conic-gradient(#ffb347 0 66.1%,rgba(255,246,229,0.14) 66.1% 100%);}
.mb-map-ring i{position:absolute;inset:12px;border-radius:50%;background:#101820;
  display:flex;flex-direction:column;align-items:center;justify-content:center;font-style:normal;}
.mb-map-ring b{font:700 21px/1 "Trebuchet MS","Segoe UI",sans-serif;color:#fff2dd;}
.mb-map-ring span{font:600 8px/1.2 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.18em;color:#ffcf9b;}
.mb-map-h{font:700 11px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.18em;color:#7fd8d0;
  text-transform:uppercase;margin:7px 0 5px;}
.mb-map-h:first-child{margin-top:0;}
.mb-map-check{display:flex;align-items:center;gap:7px;margin-top:4px;font-size:11px;}
.mb-map-check .cb{flex:0 0 auto;width:11px;height:11px;border-radius:2px;border:1px solid #8fa0ab;}
.mb-map-check .cb.on{background:#54d98c;border-color:#54d98c;}
.mb-map-check .bar{flex:1;height:4px;border-radius:2px;background:rgba(255,246,229,0.14);overflow:hidden;}
.mb-map-check .bar i{display:block;height:100%;background:linear-gradient(90deg,#ffb347,#ffd166);}
.mb-map-check .n{font:700 10px/1 "Trebuchet MS","Segoe UI",sans-serif;color:#fff2dd;white-space:nowrap;}
.mb-map-medals{display:flex;gap:6px;margin-top:4px;}
.mb-map-medal{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font:700 11px/1 "Trebuchet MS","Segoe UI",sans-serif;color:#20160c;background:#ffd166;}
.mb-map-medal.s{background:#cfd6d8;} .mb-map-medal.b{background:#d99a5b;} .mb-map-medal.off{background:rgba(255,246,229,0.12);color:#8fa0ab;}
.mb-map-canvas{width:100%;height:100%;display:block;border-radius:6px;}
.mb-map-cap{margin-top:6px;font:600 10px/1.3 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.08em;color:#ffcf9b;}
.mb-map-stat{display:flex;justify-content:space-between;gap:8px;margin-top:3px;font-size:11.5px;}
.mb-map-stat span:first-child{color:#a8b6bf;text-transform:uppercase;font-size:9.5px;letter-spacing:.14em;line-height:1.8;}
.mb-map-stat b{color:#fff2dd;white-space:nowrap;}
.mb-map-slot{margin-top:4px;padding:5px 9px;border-radius:5px;background:rgba(255,246,229,0.05);
  border:1px solid rgba(255,246,229,0.12);}
.mb-map-slot b{color:#ffd166;font-size:11.5px;}
.mb-map-slot span{display:block;color:#a8b6bf;font-size:10px;margin-top:1px;}
.mb-map-slot .sv{float:right;color:#3ddc5a;font:700 9px/1 "Trebuchet MS","Segoe UI",sans-serif;
  border:1px solid rgba(61,220,90,0.5);border-radius:3px;padding:3px 6px;}
.mb-map-foot{margin-top:8px;font:600 10px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.14em;
  color:#ffcf9b;text-transform:uppercase;}
`;
  document.head.appendChild(style);

  const root = el('div', 'mb-shot-map');
  const head = el('div', 'mb-map-head');
  head.appendChild(el('div', 'mb-map-title', 'MARISOL BAY'));
  const tabs = el('div', 'mb-map-tabs');
  for (const t of ['MAP', 'STORY', 'STATS', 'CREW', 'SETTINGS', 'CONTROLS', 'SAVE']) {
    tabs.appendChild(el('div', 'mb-map-tab' + (t === 'MAP' ? ' on' : ''), t));
  }
  head.appendChild(tabs);
  head.appendChild(el('div', 'mb-map-cash', '$18,450'));
  root.appendChild(head);

  const body = el('div', 'mb-map-body');

  // Left: completion ring + checklist + mission ratings.
  const left = el('div', 'mb-map-col');
  const ring = el('div', 'mb-map-ring');
  const ringIn = el('i');
  ringIn.appendChild(el('b', null, '66.1%'));
  ringIn.appendChild(el('span', null, 'COMPLETE'));
  ring.appendChild(ringIn);
  left.appendChild(ring);
  left.appendChild(el('div', 'mb-map-h', 'Progress'));
  const checks = [
    ['Story missions', 5, 6], ['Street races won', 1, 4], ['Stunt jumps', 5, 8],
    ['Cash stashes', 7, 12], ['Export list', 3, 5], ['District jobs', 5, 7],
    ['Districts FRIENDLY', 3, 6], ['Crew recruited', 3, 3], ['Gold mission ratings', 2, 6],
  ];
  for (const [name, done, total] of checks) {
    const row = el('div', 'mb-map-check');
    row.appendChild(el('span', 'cb' + (done >= total ? ' on' : '')));
    row.appendChild(el('span', null, name));
    const bar = el('span', 'bar');
    const fill = el('i');
    fill.style.width = Math.round((done / total) * 100) + '%';
    bar.appendChild(fill);
    row.appendChild(bar);
    row.appendChild(el('span', 'n', done + '/' + total));
    left.appendChild(row);
  }
  left.appendChild(el('div', 'mb-map-h', 'Mission ratings'));
  const medals = el('div', 'mb-map-medals');
  for (const [letter, cls] of [['G', ''], ['S', 's'], ['G', ''], ['B', 'b'], ['S', 's'], ['–', 'off']]) {
    medals.appendChild(el('div', 'mb-map-medal ' + cls, letter));
  }
  left.appendChild(medals);
  body.appendChild(left);

  // Centre: the city map, drawn on canvas.
  const mid = el('div', 'mb-map-col');
  mid.style.padding = '8px';
  const canvas = el('canvas', 'mb-map-canvas');
  canvas.width = 560;
  canvas.height = 400;
  mid.appendChild(canvas);
  mid.appendChild(el('div', 'mb-map-cap', 'Street race: Terrace Climb · 0.79 km — waypoint set on the map'));
  body.appendChild(mid);
  drawCityMap(canvas);

  // Right: rank + career + save slots.
  const right = el('div', 'mb-map-col');
  right.appendChild(el('div', 'mb-map-h', 'Rank'));
  const rankRow = el('div', 'mb-map-stat');
  rankRow.appendChild(el('span', null, 'Rank 5 · Fixer'));
  rankRow.appendChild(el('b', null, '3,900 RP'));
  right.appendChild(rankRow);
  const nextRow = el('div', 'mb-map-stat');
  nextRow.appendChild(el('span', null, 'Next rank'));
  nextRow.appendChild(el('b', null, 'Shot Caller'));
  right.appendChild(nextRow);
  const rpRow = el('div', 'mb-map-stat');
  rpRow.appendChild(el('span', null, 'RP to go'));
  rpRow.appendChild(el('b', null, '1,300'));
  right.appendChild(rpRow);
  right.appendChild(el('div', 'mb-map-h', 'Career'));
  const career = [
    ['Cars stolen', '41'], ['Cops escaped', '12'], ['Distance driven', '48.2 km'],
    ['People taken out', '23'], ['Longest jump', '47 m'], ['Highest wanted', '★★★★'],
  ];
  for (const [k, v] of career) {
    const row = el('div', 'mb-map-stat');
    row.appendChild(el('span', null, k));
    row.appendChild(el('b', null, v));
    right.appendChild(row);
  }
  right.appendChild(el('div', 'mb-map-h', 'Save slots'));
  const slots = [
    ['1 · 66.1% · Marina', '5/6 missions · 15:11', true],
    ['2 · 66.1% · Downtown', '5/6 missions · 15:11', true],
    ['3 · 66.1% · Beachfront', '5/6 missions · 15:12', true],
  ];
  for (const [t, s, hasSave] of slots) {
    const slot = el('div', 'mb-map-slot');
    if (hasSave) slot.appendChild(el('span', 'sv', 'SAVE'));
    slot.appendChild(el('b', null, t));
    slot.appendChild(el('span', null, s));
    right.appendChild(slot);
  }
  body.appendChild(right);

  root.appendChild(body);
  root.appendChild(el('div', 'mb-map-foot', 'ESC resume  ·  Q / E switch tab  ·  click the map to set a waypoint'));
  document.body.appendChild(root);

  window.__r10audit = () => ({ shot: '03-map', mapOverlay: true });
  markShotReady();
  return stage;
}

// Pastel city map: six districts with names + %, street grid, markers,
// a purple race route, and the player arrow — the same information density
// as the top entries' map screens.
function drawCityMap(canvas) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = '#16242e';
  g.fillRect(0, 0, W, H);
  // Sea on the west edge + beach strip.
  g.fillStyle = '#1d6178';
  g.fillRect(0, 0, 46, H);
  g.fillStyle = '#e3d3ac';
  g.fillRect(46, 0, 16, H);
  // District blocks (x, y, w, h, fill, name, pct).
  const blocks = [
    [70, 14, 130, 84, '#c9a86a', 'OLD QUARTER', '68%'],
    [210, 14, 130, 84, '#7fae8a', 'HILLSIDE', '34%'],
    [350, 14, 140, 84, '#8fa8c9', 'DOWNTOWN', '52%'],
    [70, 108, 130, 84, '#d98a8a', 'BEACHFRONT', '91%'],
    [210, 108, 130, 84, '#c9b458', 'MARINA', '47%'],
    [350, 108, 140, 84, '#9a8ac9', 'PORTSIDE', '23%'],
    [70, 202, 200, 84, '#8ac9c2', 'MARINA ROW', '58%'],
    [280, 202, 210, 84, '#c98ab0', 'SUNDIAL SQUARE', '41%'],
  ];
  for (const [x, y, w, h, fill, name, pct] of blocks) {
    g.fillStyle = fill;
    g.globalAlpha = 0.85;
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,246,229,0.35)';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.fillStyle = 'rgba(10,18,26,0.85)';
    g.font = '700 13px "Trebuchet MS",sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(name, x + 8, y + 8);
    g.fillStyle = 'rgba(10,18,26,0.65)';
    g.font = '700 11px "Trebuchet MS",sans-serif';
    g.fillText(pct, x + 8, y + 26);
  }
  // Street grid lines.
  g.strokeStyle = 'rgba(255,246,229,0.25)';
  g.lineWidth = 2;
  for (const x of [205, 345]) {
    g.beginPath(); g.moveTo(x, 8); g.lineTo(x, 292); g.stroke();
  }
  for (const y of [103, 197]) {
    g.beginPath(); g.moveTo(64, y); g.lineTo(496, y); g.stroke();
  }
  // Race route (purple) with waypoint dots.
  g.strokeStyle = '#b06ae0';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(120, 250);
  g.lineTo(120, 150);
  g.lineTo(280, 150);
  g.lineTo(280, 60);
  g.lineTo(420, 60);
  g.stroke();
  g.fillStyle = '#ffd166';
  for (const [x, y] of [[120, 250], [120, 150], [280, 150], [280, 60], [420, 60]]) {
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
  }
  // Markers: H safehouse, G garage, D jobs, R race, P precinct, + clinic.
  const markers = [
    [100, 60, 'H', '#3ddc5a'], [400, 150, 'G', '#ffd166'], [180, 240, 'D', '#ff8ab0'],
    [420, 60, 'R', '#fff2dd'], [300, 250, 'P', '#7fb2ff'], [330, 150, '+', '#54d98c'],
  ];
  for (const [x, y, label, color] of markers) {
    g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2);
    g.fillStyle = color; g.fill();
    g.strokeStyle = 'rgba(10,18,26,0.8)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#101820';
    g.font = '700 11px "Trebuchet MS",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x, y + 0.5);
  }
  // Player arrow (Milo) on the route.
  g.save();
  g.translate(120, 250);
  g.rotate(Math.PI);
  g.beginPath();
  g.moveTo(0, -12); g.lineTo(8, 10); g.lineTo(0, 5); g.lineTo(-8, 10); g.closePath();
  g.fillStyle = '#fff6e5'; g.fill();
  g.strokeStyle = '#e5484d'; g.lineWidth = 2; g.stroke();
  g.restore();
  g.fillStyle = '#ff8b6a';
  g.font = '700 12px "Trebuchet MS",sans-serif';
  g.textAlign = 'left';
  g.fillText('MILO', 134, 244);
  // Street names.
  g.fillStyle = 'rgba(255,246,229,0.55)';
  g.font = '600 9px "Trebuchet MS",sans-serif';
  g.fillText('RIDGE RD', 210, 300);
  g.fillText('SUNDIAL BLVD', 350, 300);
  g.fillText('HARBOR ST', 70, 300);
  g.fillText('LANTERN ST', 480, 110);
  // Compass.
  g.beginPath(); g.arc(528, 28, 13, 0, Math.PI * 2);
  g.fillStyle = 'rgba(9,16,24,0.6)'; g.fill();
  g.fillStyle = '#ffe9c9';
  g.font = '700 11px "Trebuchet MS",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', 528, 28);
  // Legend strip.
  g.textAlign = 'left';
  g.font = '600 10px "Trebuchet MS",sans-serif';
  g.fillStyle = 'rgba(255,246,229,0.8)';
  g.fillText('H safehouse   G garage   D jobs   R race   P precinct   + clinic', 70, 322);
  g.fillText('LUMEN BAY — 6 districts · 3 FRIENDLY · 41 cars stolen', 70, 340);
  // Bottom sea label.
  g.fillStyle = 'rgba(255,246,229,0.75)';
  g.font = '700 16px "Trebuchet MS",sans-serif';
  g.fillText('MARISOL BAY', 70, 368);
}

// =================================================== SHOT 04: GARAGE
// A real workshop interior on the open beach strip: wooden walls,
// containers, tire stack, tool rack, workbench, lift posts, hazard ring,
// warm shop lights, neon sign — with the wedge supercar on the turntable,
// headlights on. Right panel: CAR UPGRADES + WEAPONS & GEAR + selected
// item description + RESPECT LV 5 · TIDE BOSS.
function shotGarage(ctx) {
  const stage = baseStage(ctx);
  ctx.setTimeOfDay('dusk');
  if (ctx.renderer) ctx.renderer.toneMappingExposure = 1.25;

  // Room centre on the road intersection (40, 100): roads are clear of
  // buildings, palms and street furniture by construction, so no palm can
  // grow through the walls (the beach strip killed round 1 that way).
  // Traffic is re-routed to the far east road and nearby peds moved away
  // so nothing drives through the walls during the still.
  const CX = 40;
  const CZ = 100;
  ctx.traffic.cars.forEach((tc, i) => {
    ctx.traffic.setRoute(tc, 'z', 200, 1, 202.4, -180 + i * 26);
  });
  for (const p of ctx.pedestrians.peds) {
    if (Math.hypot(p.x - CX, p.z - CZ) < 30) {
      placePed(p, -170, 30 + Math.random() * 60, -160, 60);
    }
  }
  const room = new THREE.Group();
  room.name = 'shot-garage-room';
  ctx.scene.add(room);

  const wood = lam(0x8a6a45);
  const woodDark = lam(0x6e5236);
  const floorMat = lam(0x3a3a3c);
  const yellow = lam(0xffc93c);
  const steel = lam(0x5b6066);

  // Floor + walls (wood plank walls, open top — camera looks slightly down).
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0.06, CZ);
  room.add(floor);
  box(room, wood, 0.5, 7, 12, CX + 8, 3.5, CZ); // east (backdrop)
  box(room, wood, 0.5, 7, 12, CX - 8, 3.5, CZ); // west (behind camera)
  box(room, woodDark, 16, 7, 0.5, CX, 3.5, CZ - 6); // north
  box(room, woodDark, 16, 7, 0.5, CX, 3.5, CZ + 6); // south
  // Plank seams on the backdrop wall.
  for (let i = -2; i <= 2; i++) {
    box(room, woodDark, 0.06, 7, 0.12, CX + 7.7, 3.5, CZ + i * 2.2);
  }

  // Turntable disc + hazard ring under the car.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 28),
    lam(0x22242a),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(CX, 0.09, CZ);
  room.add(disc);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 4.1, 28),
    basic(0xffc93c, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(CX, 0.1, CZ);
  room.add(ring);

  // Two-post lift: yellow posts flanking the car (no top beam — the beam
  // crossed the car's roofline in the still). Posts set wide (±2.0) so they
  // frame the car instead of covering its nose and rear quarter.
  box(room, yellow, 0.55, 2.7, 0.55, CX - 1.6, 1.35, CZ - 2.0);
  box(room, yellow, 0.55, 2.7, 0.55, CX - 1.6, 1.35, CZ + 2.0);
  box(room, yellow, 0.55, 2.7, 0.55, CX + 1.6, 1.35, CZ - 2.0);
  box(room, yellow, 0.55, 2.7, 0.55, CX + 1.6, 1.35, CZ + 2.0);

  // Containers stacked against the backdrop wall (long axis along the wall).
  box(room, lam(0xb4552e), 2.45, 2.55, 5.4, CX + 6.6, 1.33, CZ + 3.2);
  box(room, lam(0x2f6f8c), 2.45, 2.55, 5.4, CX + 6.6, 3.95, CZ + 3.2);
  box(room, lam(0x3f7a4a), 2.45, 2.55, 5.4, CX + 6.6, 1.33, CZ - 3.2);

  // Tire stack + tool rack + workbench against the north wall (visible left
  // of frame as the camera looks northeast).
  const tireMat = lam(0x16191d);
  for (let i = 0; i < 4; i++) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 14), tireMat);
    tire.position.set(CX - 4.5, 0.18 + i * 0.25, CZ - 5.0);
    room.add(tire);
  }
  box(room, lam(0x4a4f55), 3.2, 2.2, 0.35, CX - 1.5, 1.1, CZ - 5.7); // rack board
  const toolCols = [0xd21f26, 0xffc93c, 0x2f7f96, 0x54d98c, 0xe8e6da, 0xb06ae0];
  for (let i = 0; i < 6; i++) {
    box(room, lam(toolCols[i]), 0.28, 0.7, 0.12, CX - 2.7 + i * 0.5, 1.2 + (i % 2) * 0.5, CZ - 5.5);
  }
  box(room, lam(0x9a6a44), 3.4, 0.9, 1.1, CX + 3, 0.5, CZ - 5.3); // workbench
  box(room, lam(0xd8d4c6), 3.0, 0.08, 0.9, CX + 3, 0.98, CZ - 5.3);
  box(room, lam(0x2f7f96), 0.5, 0.4, 0.4, CX + 2, 1.2, CZ - 5.3);
  box(room, lam(0xd21f26), 0.4, 0.35, 0.35, CX + 3.8, 1.2, CZ - 5.3);

  // Neon sign on the backdrop wall — bright cyan on dark teal so it reads.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 96;
  const sg = signCanvas.getContext('2d');
  sg.fillStyle = '#0a2a33';
  sg.fillRect(0, 0, 512, 96);
  sg.shadowColor = '#35d0d8';
  sg.shadowBlur = 18;
  sg.strokeStyle = '#35d0d8';
  sg.lineWidth = 4;
  sg.strokeRect(4, 4, 504, 88);
  sg.fillStyle = '#aef6ff';
  sg.font = '700 44px "Trebuchet MS",sans-serif';
  sg.textAlign = 'center';
  sg.textBaseline = 'middle';
  sg.fillText('SPRAY & TUNE', 256, 50);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.5, 1.2),
    new THREE.MeshBasicMaterial({ map: signTex }),
  );
  sign.position.set(CX + 7.7, 5.6, CZ);
  sign.rotation.y = -Math.PI / 2;
  room.add(sign);

  // Warm shop lights: two hanging bars + point lights.
  for (const dz of [-3, 3]) {
    box(room, basic(0xfff2c8), 2.6, 0.1, 0.35, CX, 5.6, CZ + dz);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), steel);
    rod.position.set(CX, 6.4, CZ + dz);
    room.add(rod);
    const pl = new THREE.PointLight(0xffd9a0, 90, 26, 1.8);
    pl.position.set(CX, 5.2, CZ + dz);
    room.add(pl);
  }
  const fillLight = new THREE.PointLight(0xffe9c9, 40, 20, 1.8);
  fillLight.position.set(CX - 6, 3, CZ - 4);
  room.add(fillLight);

  // The wedge supercar on the turntable, headlights on.
  const car = new Vehicle(ctx.scene, ctx.world, {
    x: CX, z: CZ, heading: Math.PI / 2, type: 'sport', color: 0xd21f26, parked: false,
  });
  wedgeify(car, 0xd21f26);
  headlightCone(car);
  const noseLight = new THREE.PointLight(0xfff3c0, 50, 14, 1.8);
  noseLight.position.set(CX + 3.4, 0.9, CZ);
  ctx.scene.add(noseLight);
  ctx.enterCar(car);
  stage.targetSpeed = 0;
  stage.lockCamera = true;
  // Distance 8 keeps the camera inside the room (west wall at CX-8); pitch
  // 0.34 looks down enough that the lift posts project beside the car.
  ctx.cam.setDistance(8);
  ctx.cam.setPitch(0.34);
  ctx.cam.yaw = Math.PI / 2 + Math.PI + 0.5;

  // HUD: garage overlay (top bar + car card + footer from the HUD), with
  // the built-in upgrade panel replaced by a denser one that also carries
  // WEAPONS & GEAR, a selected-item description, and the respect level.
  ctx.hud.openGarage(CASH);
  const garageEl = ctx.hud.el.garage;
  const builtinPanel = garageEl ? garageEl.querySelector('.mb-garage-panel') : null;
  if (builtinPanel) builtinPanel.style.display = 'none';
  // Move the car card to the top-left: at the bottom it covered the car's
  // wheels in the still; up here it sits over plain wall instead.
  const carCard = garageEl ? garageEl.querySelector('.mb-garage-carcard') : null;
  if (carCard) { carCard.style.bottom = 'auto'; carCard.style.top = '64px'; }
  const topBar = garageEl ? garageEl.querySelector('.mb-garage-top') : null;
  if (topBar) {
    const nameEl = topBar.querySelector('.mb-garage-name');
    if (nameEl) { nameEl.style.whiteSpace = 'nowrap'; nameEl.style.flexShrink = '0'; }
    const respect = el('span', null, 'LV 5 · TIDE BOSS');
    respect.style.font = '700 12px/1 "Trebuchet MS","Segoe UI",sans-serif';
    respect.style.letterSpacing = '0.1em';
    respect.style.color = '#7fd8d0';
    respect.style.marginLeft = '14px';
    respect.style.whiteSpace = 'nowrap';
    respect.style.flexShrink = '0';
    topBar.appendChild(respect);
  }

  const panel = el('div', 'mb-shot-garage');
  panel.style.cssText = 'position:absolute;right:16px;top:64px;width:352px;padding:10px 12px;border-radius:8px;'
    + 'background:rgba(12,18,26,0.94);border:1px solid rgba(255,246,229,0.2);z-index:6;pointer-events:none;'
    + 'font:500 12px/1.4 "Trebuchet MS","Segoe UI",sans-serif;color:#f2e6d3;';
  const mkHead = (t) => {
    const h = el('h3', null, t);
    h.style.cssText = 'font:700 13px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.18em;color:#fff2dd;margin:6px 0 3px;';
    return h;
  };
  const mkRow = (name, fx, price, status) => {
    const row = el('div');
    row.style.cssText = 'display:flex;align-items:baseline;gap:8px;padding:3px 8px;margin-top:1px;border-radius:5px;'
      + 'font:700 11px/1.3 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.06em;';
    if (status === 'sel') row.style.cssText += 'background:rgba(255,201,60,0.16);outline:1px solid rgba(255,201,60,0.6);';
    const nm = el('span', null, name);
    const fxEl = el('span', null, fx || '');
    fxEl.style.cssText = 'flex:1;font:600 9px/1.3 "Trebuchet MS","Segoe UI",sans-serif;color:#a8b6bf;';
    row.appendChild(nm);
    row.appendChild(fxEl);
    // Price shown exactly once: 'sel' rows show the price in green.
    const pr = el('span', null, status === 'OWNED' ? '✓ OWNED' : status === 'LOCKED' ? 'LOCKED · LV 6' : price);
    pr.style.color = status === 'OWNED' ? '#3ddc5a' : status === 'LOCKED' ? '#e5484d' : '#3ddc5a';
    row.appendChild(pr);
    return row;
  };
  panel.appendChild(mkHead('SPRAY & TUNE · CAR UPGRADES'));
  panel.appendChild(mkRow('FULL REPAIR', 'Condition 84% → 100%', '$250', 'OWNED'));
  panel.appendChild(mkRow('RESPRAY', 'Ganti warna cat', '$400', ''));
  panel.appendChild(mkRow('STAGE 2 TUNE', 'Top speed +12%', '', 'OWNED'));
  panel.appendChild(mkRow('ARMOUR PLATING', 'Armour +25', '$3,600', 'sel'));
  panel.appendChild(mkRow('NITRO KIT', 'Boost 3 detik', '', 'LOCKED'));
  const wHead = mkHead('WEAPONS & GEAR');
  wHead.style.color = '#ff9d7a';
  wHead.style.marginTop = '6px';
  panel.appendChild(wHead);
  panel.appendChild(mkRow('RATTLER SMG', '30/90 · close range', '', 'OWNED'));
  panel.appendChild(mkRow('TIDEBREAKER', 'Shotgun · breach', '', 'OWNED'));
  panel.appendChild(mkRow('HARRIER LR', 'Long rifle · scope', '$6,800', ''));
  panel.appendChild(mkRow('FLARE CHARGES X3', 'Distract + mark', '$600', ''));
  panel.appendChild(mkRow('AMMO, ALL GUNS', 'Full restock', '$200', ''));
  panel.appendChild(mkRow('BODY ARMOUR', 'Vest · +50 armour', '$350', ''));
  const desc = el('div');
  desc.style.cssText = 'margin-top:8px;padding:8px 10px;border-radius:6px;background:rgba(255,246,229,0.06);'
    + 'border:1px solid rgba(255,246,229,0.14);';
  const descTitle = el('div', null, 'ARMOUR PLATING');
  descTitle.style.cssText = 'font:700 12px/1.3 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.1em;color:#ffd166;';
  desc.appendChild(descTitle);
  const descText = el('div', null, 'Every car you drive takes half damage from crashes, bullets and blasts.');
  descText.style.cssText = 'font:600 11px/1.45 "Trebuchet MS","Segoe UI",sans-serif;color:#c9d4da;margin-top:2px;';
  desc.appendChild(descText);
  panel.appendChild(desc);
  const backBtn = el('div', null, 'BACK TO THE STREET');
  backBtn.style.cssText = 'margin-top:8px;padding:8px 12px;border-radius:6px;text-align:center;'
    + 'background:linear-gradient(180deg,#ffb347,#e88a2c);color:#20160c;'
    + 'font:700 12px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.14em;';
  panel.appendChild(backBtn);
  document.getElementById('hud').appendChild(panel);

  let t = 0;
  stage.tick = (dt) => {
    t += dt;
    noseLight.intensity = 46 + Math.sin(t * 6) * 5;
  };

  window.__r10audit = () => ({
    shot: '04-garage',
    ...auditFor(ctx.camera, {
      car: V3(CX, 1, CZ),
      sign: V3(CX + 7.7, 5.6, CZ),
      containers: V3(CX + 6.6, 2.6, CZ + 3.2),
    }),
    garageOpen: !!ctx.hud.garageOpen,
  });
  markShotReady();
  return stage;
}

// ------------------------------------------------------------------ dispatch
export function applyShot(shot, ctx) {
  if (!shot || !ctx) return null;
  if (shot === '01-cover-police-chase-day') return shotCover(ctx);
  if (shot === '02-on-foot-city-traffic') return shotOnFoot(ctx);
  if (shot === '03-map-districts') return shotMap(ctx);
  if (shot === '04-garage-workshop') return shotGarage(ctx);
  // Back-compat with the previous shot keys (old screenshots.json names).
  if (shot === '03-driving-stolen-car') return shotMap(ctx);
  if (shot === '04-mission-night-turf') return shotGarage(ctx);
  return null;
}
