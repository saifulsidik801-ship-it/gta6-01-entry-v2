// MARISOL BAY - screenshot staging (R9, re-authored from the R9 brief).
// Four shots in the winners' pattern: cover chase (dusk) + on-foot (day) +
// night drive + garage menu. Every scene is staged from the live game state
// (real traffic, real police, real heli, real HUD) — no pasted images, no
// fake panels. applyShot returns the stage main.js drives each frame.

import * as THREE from 'three';

const IDLE = { forward: false, back: false, left: false, right: false, run: false, jump: false };

function baseStage(ctx, opts) {
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('mb-shot');
  }
  if (typeof window !== 'undefined') window.__shotReady = false;
  const stage = {
    movement: opts.movement || { ...IDLE },
    targetSpeed: opts.targetSpeed || 0,
    lockCamera: true,
    frames: 0,
    readyFrames: opts.readyFrames || 90,
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

function duskBright(ctx) {
  ctx.setTimeOfDay('dusk');
  ctx.lights.hemi.intensity = 1.15;
  ctx.lights.ambient.intensity = 0.5;
  ctx.lights.sun.intensity = 2.4;
  if (ctx.renderer) ctx.renderer.toneMappingExposure = 1.35;
  // Push the fog out so the near road keeps its dark asphalt instead of
  // washing to the tan fog colour.
  if (ctx.scene.fog) {
    ctx.scene.fog.color.setHex(0xb06a52);
    ctx.scene.fog.near = 60;
    ctx.scene.fog.far = 220;
  }
  // Real sunset sky: the flat preset colour reads as night, not dusk.
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#4a3670');
  grad.addColorStop(0.35, '#7a4576');
  grad.addColorStop(0.6, '#c65f4e');
  grad.addColorStop(0.8, '#ff9d5c');
  grad.addColorStop(1, '#ffb077');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  ctx.scene.background = tex;
}

function nightBoost(ctx) {
  ctx.setTimeOfDay('night');
  ctx.lights.hemi.intensity = 0.62;
  ctx.lights.ambient.intensity = 0.22;
  ctx.lights.sun.intensity = 0.7;
  if (ctx.renderer) ctx.renderer.toneMappingExposure = 1.12;
}

// Put a traffic car on an exact lane and match its cruise to the player so
// the formation holds while the shot settles.
function stageCar(ctx, index, spec) {
  const t = ctx.traffic;
  let car = t.cars[index];
  if (!car) {
    car = t.createCar(t.cars.length, { x: spec.x, z: spec.z });
    t.cars.push(car);
  }
  t.setRoute(car, spec.axis, spec.line, spec.dir, spec.x, spec.z);
  if (spec.cruise) car.ai.cruise = spec.cruise;
  return car;
}

// Stand a pedestrian on a sidewalk. The stage tick re-pins staged peds every
// frame (pedestrian update would otherwise walk them away).
function stagePed(ctx, index, spec) {
  const p = ctx.pedestrians.peds[index];
  if (!p) return null;
  p.state = 'idle';
  p.x = spec.x;
  p.z = spec.z;
  p.homeX = spec.x;
  p.homeZ = spec.z;
  p.idleT = 999;
  p.group.position.set(spec.x, 0, spec.z);
  p.group.rotation.set(0, spec.facing || 0, 0);
  return p;
}

function pinPed(p, spec, fallen) {
  if (!p) return;
  if (fallen) {
    p.group.position.set(spec.x, 0.25, spec.z);
    p.group.rotation.set(-Math.PI / 2, spec.facing || 0, 0);
    return;
  }
  p.group.position.set(spec.x, 0, spec.z);
  p.group.rotation.set(0, spec.facing || 0, 0);
}

function propBox(ctx, w, h, d, color, x, y, z, ry = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  m.rotation.y = ry;
  ctx.scene.add(m);
  return m;
}

function propCyl(ctx, rTop, rBottom, h, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, h, 12),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  ctx.scene.add(m);
  return m;
}

// Nearest parked car to a point, preferring the red sport coupe (the one
// consistent identity car across the set) over any other sport or sedan.
function pickPlayerCar(ctx, x, z) {
  let best = null;
  let bestD = Infinity;
  let sport = null;
  let sportD = Infinity;
  let red = null;
  let redD = Infinity;
  for (let i = 0; i < ctx.parkedCars.length; i++) {
    const car = ctx.parkedCars[i];
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
    if (car.type === 'sport' && car.color === 0xc8382a && d < redD) {
      redD = d;
      red = car;
    }
    if (car.type === 'sport' && d < sportD) {
      sportD = d;
      sport = car;
    }
  }
  if (red && redD < 200) return red;
  if (sport && sportD < 140) return sport;
  return best;
}

function driveCar(ctx, x, z, heading) {
  const car = pickPlayerCar(ctx, x, z);
  if (!car) return null;
  ctx.enterCar(car);
  car.setPose(x, z, heading);
  return car;
}

// ------------------------------------------------------------------ shot 01
function shotCover(ctx) {
  duskBright(ctx);
  // Downtown avenue x=40, driving north (-z). Right lane x=43.
  const car = driveCar(ctx, 43, -80, Math.PI);
  if (car) {
    ctx.cam.setDistance(8.0);
    // Near-level camera: frame top reaches ~+25 deg so the heli above the
    // avenue is in shot (pitch 0.22 looked down and cut it off).
    ctx.cam.setPitch(-0.06);
    ctx.cam.yaw = 0;
  }
  ctx.police.setWanted(4);
  // Heli straight ahead over the road centreline (no canyon block).
  const pp = ctx.player.position;
  ctx.heli.placeForShot(pp, -Math.PI / 2, 38, 19, 0.1);

  // Traffic formation: 3 ahead, 2 oncoming, 1 behind, 2 on the cross street.
  const cars = [
    { axis: 'z', line: 40, dir: -1, x: 43, z: -102, cruise: 12 },
    { axis: 'z', line: 40, dir: -1, x: 43, z: -120, cruise: 12 },
    { axis: 'z', line: 40, dir: -1, x: 43, z: -142, cruise: 12 },
    { axis: 'z', line: 40, dir: 1, x: 37, z: -96, cruise: 9 },
    { axis: 'z', line: 40, dir: 1, x: 37, z: -122, cruise: 9 },
    { axis: 'z', line: 40, dir: -1, x: 43, z: -56, cruise: 12 },
    { axis: 'x', line: -20, dir: 1, x: 8, z: -23, cruise: 8 },
    { axis: 'x', line: -20, dir: -1, x: 72, z: -17, cruise: 8 },
  ];
  for (let i = 0; i < cars.length; i++) stageCar(ctx, i, cars[i]);

  // 8 pedestrians on both sidewalks, facing the road.
  const peds = [];
  const pedSpots = [
    { x: 31, z: -70, facing: Math.PI / 2 },
    { x: 31, z: -88, facing: Math.PI / 2 },
    { x: 31, z: -106, facing: Math.PI / 2 },
    { x: 31, z: -124, facing: Math.PI / 2 },
    { x: 49, z: -74, facing: -Math.PI / 2 },
    { x: 49, z: -92, facing: -Math.PI / 2 },
    { x: 49, z: -110, facing: -Math.PI / 2 },
    { x: 49, z: -128, facing: -Math.PI / 2 },
  ];
  for (let i = 0; i < pedSpots.length; i++) {
    const p = stagePed(ctx, i, pedSpots[i]);
    if (p) peds.push({ p, spec: pedSpots[i] });
  }

  ctx.cash = 18450;
  ctx.hud.setShotObjective(
    'DOWNTOWN HEAT',
    'LOSE THE PATROL ON THE DOWNTOWN STREETS',
    'STAGE 1/2 \u00B7 0/2',
    0,
  );
  ctx.hud.setShotDialog(
    'Mira Kesang',
    'Crew \u00B7 Driver',
    'Four units on your tail, Milo \u2014 lose them through the towers, don\u2019t stop for anything.',
  );
  ctx.radio.elapsed = 12;

  return baseStage(ctx, {
    targetSpeed: 12,
    readyFrames: 100,
    onTick(frame) {
      // Re-assert wanted 4: bumps from traffic contact push it to 5.
      if (frame > 40) ctx.police.setWanted(4);
      for (let i = 0; i < peds.length; i++) pinPed(peds[i].p, peds[i].spec, false);
    },
  });
}

// ------------------------------------------------------------------ shot 02
function shotOnFoot(ctx) {
  ctx.setTimeOfDay('day');
  if (ctx.renderer) ctx.renderer.toneMappingExposure = 1.0;
  // Over-shoulder close: Milo big in the lower centre, enemies ahead.
  // Facing 3/4 (PI - 0.35) so the aim pose reads from behind.
  const px = 49;
  const pz = -40;
  ctx.player.setPosition(px, ctx.sampleGround(px, pz), pz);
  ctx.player.state.facing = Math.PI - 0.35;
  ctx.player.root.visible = true;
  ctx.cam.setDistance(5.6);
  ctx.cam.setPitch(0.2);
  ctx.cam.yaw = -0.35;
  ctx.police.setWanted(2);

  // Partner one step behind-left, also aiming (not in the camera's face).
  const partner = stagePed(ctx, 0, { x: 45.5, z: -42, facing: Math.PI - 0.35 });
  // Enemies + crowd ahead of Milo, closer than R8 so they read as a crowd.
  const crowd = [
    { x: 40, z: -46, facing: 0 },
    { x: 44, z: -49, facing: 0 },
    { x: 48, z: -46, facing: 0 },
    { x: 42, z: -52, facing: 0 },
    { x: 47, z: -54, facing: 0 },
    { x: 38, z: -50, facing: 0 },
    { x: 52, z: -46, facing: 0 },
    { x: 34, z: -48, facing: 0 },
  ];
  const crowdPeds = [];
  for (let i = 0; i < crowd.length; i++) {
    const p = stagePed(ctx, 1 + i, crowd[i]);
    if (p) crowdPeds.push({ p, spec: crowd[i] });
  }
  // One body on the ground, mid-street, close enough to read.
  const fallenSpec = { x: 44, z: -48, facing: 0.6 };
  const fallen = stagePed(ctx, 10, fallenSpec);

  // Traffic on the avenue + one car on the cross street.
  stageCar(ctx, 0, { axis: 'z', line: 40, dir: -1, x: 43, z: -62, cruise: 8 });
  stageCar(ctx, 1, { axis: 'z', line: 40, dir: 1, x: 37, z: -76, cruise: 8 });
  stageCar(ctx, 2, { axis: 'x', line: -20, dir: 1, x: 20, z: -23, cruise: 8 });

  // Market props: a stall with a striped awning, crates, barrels.
  propBox(ctx, 2.6, 1.9, 2.0, 0x8c3b2e, 54, 0.95, -52, 0.15);
  propBox(ctx, 2.8, 0.18, 2.2, 0xff7a1a, 54, 2.0, -52, 0.15);
  propBox(ctx, 2.8, 0.18, 2.2, 0xfff2dd, 54, 2.18, -52, 0.15);
  propBox(ctx, 1.2, 1.2, 1.2, 0xb98a4a, 33, 0.6, -46, 0.4);
  propBox(ctx, 1.0, 1.0, 1.0, 0x9a6b3a, 33.8, 0.5, -47.2, 0.9);
  propCyl(ctx, 0.45, 0.45, 1.0, 0x2f7f96, 53, 0.5, -62);
  propCyl(ctx, 0.45, 0.45, 1.0, 0xd96a4a, 53.8, 0.5, -60.5);

  // Tracer beam from Milo's gun toward the crowd + a muzzle flash.
  const gun = new THREE.Vector3(px + 0.4, 1.35, pz - 1.1);
  const target = new THREE.Vector3(44, 1.2, -58);
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.07, 14),
    new THREE.MeshBasicMaterial({ color: 0xffe9a4, transparent: true, opacity: 0.9 }),
  );
  beam.position.copy(gun).lerp(target, 0.5);
  beam.lookAt(target);
  ctx.scene.add(beam);
  ctx.effects.spawnBurst({ x: gun.x, y: gun.y, z: gun.z }, 'impact', 10);

  ctx.cash = 8400;
  ctx.hud.setShotObjective(
    'STREET SWEEP',
    'CLEAR THE BLOCK \u2014 TAKE OUT THE CREW 1/5',
    'STAGE 2/3',
    0.33,
  );
  ctx.hud.setShotDialog(
    'Kiki',
    'Crew \u00B7 Lookout',
    'Downtown at noon \u2014 everybody\u2019s out. Walk easy, Milo, the street\u2019s watching.',
  );
  ctx.radio.elapsed = 20;

  const aimArms = () => {
    const parts = ctx.player.parts;
    if (!parts || !parts.armL || !parts.armL.shoulder) return;
    parts.armL.shoulder.rotation.x = 1.45;
    parts.armR.shoulder.rotation.x = 1.45;
    parts.armL.shoulder.rotation.z = 0.12;
    parts.armR.shoulder.rotation.z = -0.12;
    parts.armL.elbow.rotation.x = -0.15;
    parts.armR.elbow.rotation.x = -0.15;
    // Partner aims too (ped arm pivots, guarded — structure differs by build).
    if (partner && partner.armL && partner.armL.rotation) {
      partner.armL.rotation.x = 1.2;
      partner.armR.rotation.x = 1.2;
    } else if (partner && partner.armL && partner.armL.shoulder) {
      partner.armL.shoulder.rotation.x = 1.45;
      partner.armR.shoulder.rotation.x = 1.45;
    }
  };

  return baseStage(ctx, {
    movement: { ...IDLE },
    readyFrames: 90,
    onTick(frame) {
      aimArms();
      for (let i = 0; i < crowdPeds.length; i++) pinPed(crowdPeds[i].p, crowdPeds[i].spec, false);
      pinPed(partner, { x: 45.5, z: -42, facing: Math.PI - 0.35 }, false);
      pinPed(fallen, fallenSpec, true);
      if (frame === 30) {
        ctx.effects.spawnBurst({ x: gun.x, y: gun.y, z: gun.z }, 'impact', 8);
      }
    },
  });
}

// ------------------------------------------------------------------ shot 03
function shotNightDrive(ctx) {
  nightBoost(ctx);
  // Darker than the boost: the pale pavement was reading as day.
  ctx.lights.hemi.intensity = 0.5;
  if (ctx.renderer) ctx.renderer.toneMappingExposure = 1.0;
  // Downtown avenue x=100, driving north (-z).
  const car = driveCar(ctx, 103, -40, Math.PI);
  if (car) {
    ctx.cam.setDistance(7.5);
    ctx.cam.setPitch(0.26);
    ctx.cam.yaw = 0;
  }
  ctx.police.setWanted(3);
  const pp = ctx.player.position;
  // Heli straight ahead over the road centreline (no canyon block).
  ctx.heli.placeForShot(pp, -Math.PI / 2, 40, 20, 0.2);

  // Lead cars faster than the player (gap grows, no rear-end) and farther.
  // Oncoming car starts far north so it does not drive into the player's face.
  const cars = [
    { axis: 'z', line: 100, dir: -1, x: 103, z: -82, cruise: 17 },
    { axis: 'z', line: 100, dir: -1, x: 103, z: -112, cruise: 17 },
    { axis: 'z', line: 100, dir: 1, x: 97, z: -95, cruise: 9 },
    { axis: 'z', line: 100, dir: -1, x: 103, z: -16, cruise: 17 },
  ];
  for (let i = 0; i < cars.length; i++) stageCar(ctx, i, cars[i]);

  const pedSpots = [
    { x: 91, z: -52, facing: Math.PI / 2 },
    { x: 91, z: -78, facing: Math.PI / 2 },
    { x: 109, z: -58, facing: -Math.PI / 2 },
    { x: 109, z: -84, facing: -Math.PI / 2 },
  ];
  const peds = [];
  for (let i = 0; i < pedSpots.length; i++) {
    const p = stagePed(ctx, i, pedSpots[i]);
    if (p) peds.push({ p, spec: pedSpots[i] });
  }

  // Two checkpoint rings on the road ahead (far enough not to swallow the car).
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x35d0d8 });
  for (const z of [-78, -112]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.18, 10, 32), ringMat);
    ring.position.set(103, 2.2, z);
    ctx.scene.add(ring);
  }

  ctx.cash = 12600;
  ctx.hud.setShotObjective(
    'NIGHT RUNNER',
    'HIT THE CHECKPOINTS \u2014 2 DOWN, 3 TO GO',
    'CHECKPOINT 2/5',
    0.4,
  );
  ctx.hud.setShotDialog(
    'Lio',
    'Crew \u00B7 Mechanic',
    'She\u2019s holding together \u2014 barely. Don\u2019t clip the cruisers, the suspension won\u2019t take it.',
  );
  ctx.hud.setShotPopup('NEAR MISS +150');
  ctx.radio.nextStation(1);
  ctx.radio.elapsed = 8;

  return baseStage(ctx, {
    targetSpeed: 14,
    readyFrames: 100,
    onTick(frame) {
      if (frame > 40) ctx.police.setWanted(3);
      for (let i = 0; i < peds.length; i++) pinPed(peds[i].p, peds[i].spec, false);
    },
  });
}

// ------------------------------------------------------------------ shot 04
function shotGarage(ctx) {
  nightBoost(ctx);
  if (ctx.renderer) ctx.renderer.toneMappingExposure = 1.25;
  // The player's car (red sport), parked on a lift in front of the
  // Hillside Garage, raised onto the platform so it does not clip it.
  // Nose faces south (+z) so the camera south of it sees a front 3/4.
  // Setup sits west (x=36) so the car lands left of the garage panel.
  const car = pickPlayerCar(ctx, 36, 20);
  if (car) {
    car.setPose(36, 20, 0);
    car.group.position.y = 0.3;
    car.handbrake = true;
  }
  // Lift posts + platform under the car (length along z now).
  propBox(ctx, 0.5, 2.2, 0.5, 0xe8b93c, 34.2, 1.1, 17.6, 0);
  propBox(ctx, 0.5, 2.2, 0.5, 0xe8b93c, 34.2, 1.1, 22.4, 0);
  propBox(ctx, 0.5, 2.2, 0.5, 0xe8b93c, 37.8, 1.1, 17.6, 0);
  propBox(ctx, 0.5, 2.2, 0.5, 0xe8b93c, 37.8, 1.1, 22.4, 0);
  propBox(ctx, 3.4, 0.3, 5.2, 0x2b2e33, 36, 0.15, 20, 0);
  // Tool crates + barrels so the left half is not empty tarmac.
  propBox(ctx, 1.2, 1.0, 1.0, 0x8c2f26, 30.5, 0.5, 16.5, 0.3);
  propBox(ctx, 0.9, 0.9, 0.9, 0x5a6b7a, 30.6, 0.45, 23.5, 0.8);
  propCyl(ctx, 0.45, 0.45, 1.0, 0x2f7f96, 30.5, 0.5, 17.5);
  propCyl(ctx, 0.45, 0.45, 1.0, 0xd96a4a, 30.5, 0.5, 22.8);
  // Warm work light over the car.
  const lamp = new THREE.PointLight(0xffc98a, 150, 26, 1.6);
  lamp.position.set(36, 6, 20);
  ctx.scene.add(lamp);
  // Camera: front 3/4 view of the car (camera due south of the target,
  // looking north; car nose faces south toward the lens).
  // Player target sits southeast of the car so the car lands left of the
  // garage panel instead of behind it (target on the car-camera line
  // centres the car under the panel).
  const px = 40;
  const pz = 25;
  ctx.player.setPosition(px, ctx.sampleGround(px, pz), pz);
  ctx.player.root.visible = false;
  ctx.cam.setDistance(6.5);
  ctx.cam.setPitch(0.3);
  ctx.cam.yaw = 0;

  ctx.cash = 18450;
  ctx.hud.openGarage(18450);

  return baseStage(ctx, {
    movement: { ...IDLE },
    readyFrames: 70,
  });
}

// --------------------------------------------------------------------- entry
export function applyShot(name, ctx) {
  if (!ctx || !ctx.hud) return null;
  const key = String(name || '');
  if (key.startsWith('01')) return shotCover(ctx);
  if (key.startsWith('02')) return shotOnFoot(ctx);
  if (key.startsWith('03')) return shotNightDrive(ctx);
  if (key.startsWith('04')) return shotGarage(ctx);
  return null;
}
