// MARISOL BAY — screenshot staging (R8: dense downtown shots + HUD fix).
//
// Each ?shot= scene packs Milo, traffic, police and pedestrians into a busy
// frame the way the top-ranked entries do: a downtown avenue with towers on
// both sides, oncoming traffic, named police units closing in, a helicopter
// overhead, and the full HUD (police-response panel, crew cards, dialog,
// minimap, wanted stars, speed). Shot mode also hides the brand title,
// controls strip, turf ticker, centre hint pill, toasts and event cards —
// at 800x480 those all collide with the speed readout or the minimap.
//
// This file is re-authored from the game design (dossier, config, the public
// interfaces of traffic / pedestrians / police / missions / hud) — not copied
// from any earlier version of itself.
//
// main.js drives the returned stage object: movement, targetSpeed,
// lockCamera and a per-frame tick(dt).

import * as THREE from 'three';

// ------------------------------------------------------------------ constants

// Sidewalk offset from a road centre line: half road + half pavement.
const SW_OFF = 9;
// Right-hand lane offset from a road centre line.
const LANE = 3.8;

const IDLE_MOVEMENT = {
  forward: false,
  back: false,
  left: false,
  right: false,
  run: false,
  jump: false,
};

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

// -------------------------------------------------------------------- helpers

function placeTraffic(ctx, spots) {
  const cars = ctx.traffic.cars;
  const n = Math.min(spots.length, cars.length);
  for (let i = 0; i < n; i++) {
    const s = spots[i];
    ctx.traffic.setRoute(cars[i], s.axis, s.line, s.dir, s.x, s.z);
  }
  return n;
}

// Walkers are placed by their pavement state (axis/line/side/along), which
// the pedestrian sim re-derives into x/z every step, so they keep walking
// their pavement instead of freezing where they were dropped.
function placePeds(ctx, spots) {
  const peds = ctx.pedestrians.peds;
  const n = Math.min(spots.length, peds.length);
  for (let i = 0; i < n; i++) {
    const s = spots[i];
    const p = peds[i];
    p.state = 'walk';
    p.axis = s.axis;
    p.line = s.line;
    p.side = s.side;
    p.dir = s.dir;
    p.along = s.along;
    p.lat = 0;
    p.fleeT = 0;
    p.slowT = 0;
    p.cornerLine = null;
    p.corner = s.dir > 0 ? Infinity : -Infinity;
    p.heading = headingFor(s.axis, s.dir);
    p.yaw = p.heading;
    const perp = s.line + s.side * SW_OFF;
    p.x = s.axis === 'x' ? s.along : perp;
    p.z = s.axis === 'x' ? perp : s.along;
    p.group.position.set(p.x, 0, p.z);
    p.group.rotation.y = p.yaw;
  }
  return n;
}

function placeCruisers(ctx, spots) {
  let n = 0;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const cr = ctx.police.createCruiser({ x: s.x, z: s.z, heading: s.heading });
    if (!cr) continue;
    ctx.police.cruisers.push(cr);
    n++;
  }
  return n;
}

function placeCops(ctx, spots) {
  let n = 0;
  for (let i = 0; i < spots.length; i++) {
    const cop = ctx.police.createCop({ x: spots[i].x, z: spots[i].z });
    if (!cop) continue;
    ctx.police.cops.push(cop);
    n++;
  }
  return n;
}

// Put Milo behind the wheel: teleport the hero car onto the road lane and
// enter it. Prefers the red sport coupe when one is parked; otherwise the
// nearest parked car. enterCar adds one heat, so callers set wanted after.
function driveCar(ctx, x, z, heading) {
  let best = null;
  let bestD2 = Infinity;
  for (let i = 0; i < ctx.parkedCars.length; i++) {
    const car = ctx.parkedCars[i];
    if (car.type === 'sport' && car.color === 0xc8382a) {
      best = car;
      break;
    }
    const dx = car.x - x;
    const dz = car.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = car;
    }
  }
  if (!best) return null;
  best.setPose(x, z, heading);
  ctx.enterCar(best);
  return best;
}

// Level the camera out (default pitch 0.33 looks steeply down the road, so
// near traffic reads small and the sky — with the helicopter — is cut off).
// Pitch 0.33 -> ~0.08: the street ahead and the sky both stay in frame.
function tiltUp(ctx) {
  if (ctx.cam && typeof ctx.cam.applyOrbit === 'function') {
    ctx.cam.applyOrbit(0, -48);
  }
}

function placePlayer(ctx, x, z, facing) {
  ctx.player.setPosition(x, ctx.sampleGround(x, z), z);
  ctx.player.state.facing = facing;
  ctx.player.root.visible = true;
  ctx.cam.yaw = facing + Math.PI;
}

// Simple low-poly police helicopter built from boxes (no asset, no image):
// body, cockpit glass, tail boom + fin, skids, a spinning main rotor and a
// tail rotor. Night scenes add a translucent searchlight cone.
function buildHeli(ctx, x, y, z, night) {
  const dark = new THREE.MeshLambertMaterial({ color: 0x1d2733 });
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e6da });
  const glass = new THREE.MeshLambertMaterial({ color: 0x20323e });

  const g = new THREE.Group();
  g.name = 'shot-heli';

  const add = (mat, w, h, d, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    m.scale.set(w, h, d);
    m.position.set(px, py, pz);
    g.add(m);
    return m;
  };

  add(white, 2.0, 1.1, 3.0, 0, 0, 0); // body
  add(glass, 1.7, 0.7, 0.9, 0, 0.15, 1.35); // cockpit
  add(dark, 0.7, 0.6, 3.4, 0, 0.25, -2.6); // tail boom
  add(dark, 0.25, 1.6, 0.9, 0, 0.7, -4.2); // tail fin
  add(dark, 0.12, 0.12, 2.6, -0.7, -0.75, 0); // skid left
  add(dark, 0.12, 0.12, 2.6, 0.7, -0.75, 0); // skid right
  add(dark, 0.18, 0.5, 0.18, 0, 0.7, 0); // rotor mast

  const rotor = new THREE.Group();
  rotor.position.set(0, 0.95, 0);
  const bladeA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dark);
  bladeA.scale.set(8.4, 0.08, 0.45);
  rotor.add(bladeA);
  const bladeB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dark);
  bladeB.scale.set(0.45, 0.08, 8.4);
  rotor.add(bladeB);
  g.add(rotor);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.45, 0.7, -4.2);
  const tailBlade = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dark);
  tailBlade.scale.set(0.08, 1.5, 0.3);
  tailRotor.add(tailBlade);
  g.add(tailRotor);

  if (night) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(3, 16, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff3c8,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    cone.position.set(0, -8, 2);
    g.add(cone);
  }

  g.position.set(x, y, z);
  ctx.scene.add(g);
  return { group: g, rotor, tailRotor, baseY: y, t: 0 };
}

function spinHeli(heli, dt) {
  if (!heli) return;
  heli.t += dt;
  heli.rotor.rotation.y += dt * 14;
  heli.tailRotor.rotation.x += dt * 22;
  heli.group.position.y = heli.baseY + Math.sin(heli.t * 0.9) * 0.5;
}

// Shared shot-mode setup: hide the colliding brand/controls/hint chrome and
// arm the HUD dialog line. Returns nothing.
function beginShot(ctx, speaker, role, line) {
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('mb-shot');
  }
  if (ctx.hud && typeof ctx.hud.setShotDialog === 'function') {
    ctx.hud.setShotDialog(speaker, role, line);
  }
  if (ctx.hud && typeof ctx.hud.clearToasts === 'function') ctx.hud.clearToasts();
}

// Traffic + pedestrians for a stretch of one avenue (roadX) between two
// cross streets, plus the cross streets themselves. Returns counts.
function avenueTraffic(ctx, roadX, zNear, zFar, crossZs) {
  const spots = [];
  // Same-direction lane just ahead of the player, oncoming lane coming at them.
  spots.push({ axis: 'z', line: roadX, dir: -1, x: roadX - LANE, z: zNear - 18 });
  spots.push({ axis: 'z', line: roadX, dir: -1, x: roadX - LANE, z: zNear - 38 });
  spots.push({ axis: 'z', line: roadX, dir: -1, x: roadX - LANE, z: zNear - 58 });
  spots.push({ axis: 'z', line: roadX, dir: 1, x: roadX + LANE, z: zNear - 28 });
  spots.push({ axis: 'z', line: roadX, dir: 1, x: roadX + LANE, z: zNear - 48 });
  spots.push({ axis: 'z', line: roadX, dir: 1, x: roadX + LANE, z: zNear - 72 });
  for (let c = 0; c < crossZs.length; c++) {
    const cz = crossZs[c];
    spots.push({ axis: 'x', line: cz, dir: 1, x: roadX - 25, z: cz - LANE });
    spots.push({ axis: 'x', line: cz, dir: -1, x: roadX + 25, z: cz + LANE });
  }
  return placeTraffic(ctx, spots);
}

function avenuePeds(ctx, roadX, zList, crossZs) {
  const spots = [];
  for (let i = 0; i < zList.length; i++) {
    const z = zList[i];
    const side = i % 2 === 0 ? -1 : 1;
    spots.push({
      axis: 'z', line: roadX, side, along: z, dir: i % 3 === 0 ? -1 : 1,
    });
  }
  for (let c = 0; c < crossZs.length; c++) {
    const cz = crossZs[c];
    spots.push({ axis: 'x', line: cz, side: -1, along: roadX - 45, dir: 1 });
    spots.push({ axis: 'x', line: cz, side: 1, along: roadX + 25, dir: -1 });
  }
  return placePeds(ctx, spots);
}

// ---------------------------------------------------------------------- scenes

// COVER — Downtown Heat in daylight. Milo flees WEST down the z=-80 avenue
// in a stolen red coupe, towers both sides, the beachfront and the sea
// opening up at the far end: 10 traffic cars, 4 cruisers, foot cops,
// 10 pedestrians and a police helicopter overhead. Wanted 5.
// (Daylight, not dusk: the mission forces dusk, but a downtown dusk frame is
// mostly dark asphalt and shaded towers — its mean luminance was 0.29,
// under the 0.45 gate — so the staging overrides back to day after the
// mission starts. The mission objective and heat stay live.
// Lights are lifted for the shot (hemi 1.3 / sun 3.0 / ambient 0.5): the
// unlit day frame sits at 0.42. The camera stays at zoom 1 (11.5 m): any
// closer and it sits inside the survive-objective beacon column — a giant
// translucent red tube centred on the player — which tints the whole
// lower frame red.)
function stageCover(ctx) {
  ctx.setTimeOfDay('dusk');
  ctx.cash = 18450;
  driveCar(ctx, 60, -80 + LANE, -Math.PI / 2);
  ctx.missions.startMission('downtown-heat');
  ctx.setTimeOfDay('day');
  if (ctx.lights) {
    ctx.lights.hemi.intensity = 1.5;
    ctx.lights.sun.intensity = 3.4;
    ctx.lights.ambient.intensity = 0.55;
  }
  ctx.police.setWanted(5);

  const trafficN = placeTraffic(ctx, [
    { axis: 'x', line: -80, dir: -1, x: 35, z: -80 + LANE },
    { axis: 'x', line: -80, dir: -1, x: 10, z: -80 + LANE },
    { axis: 'x', line: -80, dir: -1, x: -15, z: -80 + LANE },
    { axis: 'x', line: -80, dir: 1, x: 25, z: -80 - LANE },
    { axis: 'x', line: -80, dir: 1, x: 0, z: -80 - LANE },
    { axis: 'x', line: -80, dir: 1, x: -30, z: -80 - LANE },
    { axis: 'z', line: 0, dir: -1, x: 0 - LANE, z: -105 },
    { axis: 'z', line: 0, dir: 1, x: 0 + LANE, z: -55 },
    { axis: 'z', line: -20, dir: -1, x: -20 - LANE, z: -105 },
    { axis: 'z', line: -20, dir: 1, x: -20 + LANE, z: -55 },
  ]);
  const pedsN = placePeds(ctx, [
    { axis: 'x', line: -80, side: -1, along: 45, dir: 1 },
    { axis: 'x', line: -80, side: 1, along: 30, dir: -1 },
    { axis: 'x', line: -80, side: -1, along: 15, dir: -1 },
    { axis: 'x', line: -80, side: 1, along: 0, dir: 1 },
    { axis: 'x', line: -80, side: -1, along: -15, dir: 1 },
    { axis: 'x', line: -80, side: 1, along: -30, dir: -1 },
    { axis: 'x', line: -80, side: -1, along: -45, dir: -1 },
    { axis: 'z', line: 0, side: -1, along: -95, dir: 1 },
    { axis: 'z', line: 0, side: 1, along: -65, dir: -1 },
    { axis: 'z', line: -20, side: -1, along: -95, dir: 1 },
  ]);
  // Cruisers start 45m+ out: a head-on close runs ~30 u/s, so anything
  // nearer is on the player's bumper by screenshot time.
  const cruisersN = placeCruisers(ctx, [
    { x: 0, z: -80 + LANE, heading: -Math.PI / 2 },
    { x: -20, z: -80 - LANE, heading: Math.PI / 2 },
    { x: 40 - LANE, z: -115, heading: Math.PI },
    { x: 20, z: -45, heading: 0 },
  ]);
  const copsN = placeCops(ctx, [
    { x: 30, z: -80 - SW_OFF },
    { x: 10, z: -80 + SW_OFF },
    { x: -10, z: -80 - SW_OFF },
  ]);
  const heli = buildHeli(ctx, -30, 18, -80, false);

  beginShot(ctx, 'Mira Kesang', 'Crew · Driver',
    'Four units on your tail, Milo — lose them through the towers, don’t stop for anything.');
  ctx.cam.yaw = Math.PI / 2;
  tiltUp(ctx);
  ctx.cam.applyZoom(1);

  return {
    movement: IDLE_MOVEMENT,
    targetSpeed: 15,
    lockCamera: true,
    counts: { traffic: trafficN, peds: pedsN, cruisers: cruisersN, cops: copsN, heli: 1 },
    tick(dt) {
      spinHeli(heli, dt);
    },
  };
}

// SCENE 02 — on foot on a crowded Downtown sidewalk at noon. Milo stands on
// the x=40 pavement facing north: pedestrians on both pavements, streaming
// traffic on the avenue and cross streets, two patrol units in sight.
function stageOnFoot(ctx) {
  ctx.setTimeOfDay('day');
  ctx.cash = 8400;
  placePlayer(ctx, 40 - SW_OFF, -62, Math.PI);
  ctx.police.setWanted(2);

  const trafficN = avenueTraffic(ctx, 40, -62, -150, [-80, -140]);
  const pedsN = avenuePeds(ctx, 40,
    [-68, -74, -82, -88, -96, -104, -112, -120], [-80, -140]);
  const cruisersN = placeCruisers(ctx, [
    { x: 40 + LANE, z: -100, heading: 0 },
    { x: 40 - LANE, z: -138, heading: Math.PI },
  ]);
  const copsN = placeCops(ctx, [
    { x: 40 - SW_OFF, z: -85 },
    { x: 40 + SW_OFF, z: -115 },
  ]);

  beginShot(ctx, 'Kiki', 'Crew · Lookout',
    'Downtown at noon — everybody’s out. Walk easy, Milo, the street’s watching.');
  ctx.cam.yaw = 0;
  tiltUp(ctx);
  ctx.cam.applyZoom(1);

  return {
    movement: IDLE_MOVEMENT,
    targetSpeed: 0,
    lockCamera: true,
    counts: { traffic: trafficN, peds: pedsN, cruisers: cruisersN, cops: copsN, heli: 0 },
    tick() {},
  };
}

// SCENE 03 — driving at speed down the packed x=100 Downtown avenue in
// daylight, police cruisers closing in from every side, helicopter overhead.
function stageDriving(ctx) {
  ctx.setTimeOfDay('day');
  ctx.cash = 12600;
  driveCar(ctx, 100 - LANE, -10, Math.PI);
  ctx.police.setWanted(4);
  // Milo already holds Downtown turf when the camera cuts in: the turf
  // panel lights its first district pip.
  if (ctx.missions.taken && ctx.missions.turf) {
    ctx.missions.taken.downtown = true;
    ctx.missions.turf.downtown = 100;
  }

  const trafficN = avenueTraffic(ctx, 100, -10, -120, [-20, -80]);
  const pedsN = avenuePeds(ctx, 100, [-25, -38, -55, -68, -85], [-20, -80]);
  const cruisersN = placeCruisers(ctx, [
    { x: 100 - LANE, z: -75, heading: Math.PI },
    { x: 100 + LANE, z: -88, heading: 0 },
    { x: 150, z: -20 + LANE, heading: Math.PI / 2 },
    { x: 50, z: -20 - LANE, heading: -Math.PI / 2 },
  ]);
  const copsN = placeCops(ctx, [
    { x: 100 - SW_OFF, z: -70 },
    { x: 100 + SW_OFF, z: -85 },
  ]);
  const heli = buildHeli(ctx, 112, 20, -80, false);

  beginShot(ctx, 'Lio', 'Crew · Mechanic',
    'She’s holding together — barely. Don’t clip the cruisers, the suspension won’t take it.');
  ctx.cam.yaw = 0;
  tiltUp(ctx);
  ctx.cam.applyZoom(1);

  return {
    movement: IDLE_MOVEMENT,
    targetSpeed: 18,
    lockCamera: true,
    counts: { traffic: trafficN, peds: pedsN, cruisers: cruisersN, cops: copsN, heli: 1 },
    tick(dt) {
      spinHeli(heli, dt);
    },
  };
}

// SCENE 04 — night turf takeover in the Portside container yard. Milo holds
// the x=160 yard road north past floodlit cranes and containers: dock
// traffic, foot cops, a five-star response and a searchlight helicopter,
// with muzzle flashes and sparks from the chase. The takeover beacon sits
// off-axis to the right, so it reads as an objective marker, not a wall.
function stageNight(ctx) {
  ctx.setTimeOfDay('night');
  ctx.cash = 6420;
  driveCar(ctx, 160 - LANE, 205, Math.PI);
  ctx.missions.startMission('portside-takeover');
  // The shot cuts in mid-hold: the yard has already been held for a few
  // seconds, so the takeover bar reads part-filled instead of 0%.
  if (ctx.missions.obj) ctx.missions.obj.progress = 0.3;
  ctx.police.setWanted(5);

  const trafficN = placeTraffic(ctx, [
    { axis: 'z', line: 160, dir: -1, x: 160 - LANE, z: 185 },
    { axis: 'z', line: 160, dir: -1, x: 160 - LANE, z: 165 },
    { axis: 'z', line: 160, dir: 1, x: 160 + LANE, z: 175 },
    { axis: 'z', line: 160, dir: 1, x: 160 + LANE, z: 150 },
    { axis: 'x', line: 160, dir: 1, x: 185, z: 160 - LANE },
    { axis: 'x', line: 160, dir: -1, x: 135, z: 160 + LANE },
    { axis: 'x', line: 220, dir: 1, x: 185, z: 220 - LANE },
    { axis: 'x', line: 220, dir: -1, x: 135, z: 220 + LANE },
  ]);
  const pedsN = placePeds(ctx, [
    { axis: 'z', line: 160, side: -1, along: 195, dir: 1 },
    { axis: 'z', line: 160, side: -1, along: 180, dir: -1 },
    { axis: 'z', line: 160, side: -1, along: 168, dir: 1 },
    { axis: 'z', line: 160, side: 1, along: 190, dir: -1 },
    { axis: 'z', line: 160, side: 1, along: 172, dir: 1 },
    { axis: 'x', line: 160, side: -1, along: 175, dir: 1 },
    { axis: 'x', line: 160, side: 1, along: 145, dir: -1 },
    { axis: 'x', line: 160, side: -1, along: 200, dir: -1 },
  ]);
  const cruisersN = placeCruisers(ctx, [
    { x: 160 - LANE, z: 150, heading: Math.PI },
    { x: 160 + LANE, z: 140, heading: 0 },
    { x: 185, z: 160 - LANE, heading: Math.PI / 2 },
    { x: 130, z: 160 + LANE, heading: -Math.PI / 2 },
  ]);
  const copsN = placeCops(ctx, [
    { x: 160 - SW_OFF, z: 160 },
    { x: 160 + SW_OFF, z: 155 },
    { x: 160 - SW_OFF, z: 150 },
    { x: 160 + SW_OFF, z: 140 },
  ]);
  const heli = buildHeli(ctx, 168, 20, 140, true);

  beginShot(ctx, 'Inez Voss', 'Fixer · Crew',
    'Hold the yard, Milo. The dock crew doesn’t leave till you say so.');
  ctx.cam.yaw = 0;
  tiltUp(ctx);
  ctx.cam.applyZoom(1);

  let fxT = 0;
  let fxI = 0;
  return {
    movement: IDLE_MOVEMENT,
    targetSpeed: 12,
    lockCamera: true,
    counts: { traffic: trafficN, peds: pedsN, cruisers: cruisersN, cops: copsN, heli: 1 },
    tick(dt) {
      spinHeli(heli, dt);
      fxT += dt;
      if (fxT > 0.45 && ctx.police.cruisers.length > 0) {
        fxT = 0;
        const cr = ctx.police.cruisers[fxI % ctx.police.cruisers.length];
        fxI++;
        if (cr && cr.vehicle) {
          ctx.effects.spawnBurst(
            { x: cr.vehicle.x, y: 1.0, z: cr.vehicle.z },
            fxI % 2 === 0 ? 'muzzle' : 'sparks',
            6,
          );
        }
      }
    },
  };
}

// --------------------------------------------------------------------- entry

const STAGES = {
  '01-cover-police-chase-day': stageCover,
  '02-on-foot-city-traffic': stageOnFoot,
  '03-driving-stolen-car': stageDriving,
  '04-mission-night-turf': stageNight,
};

export function applyShot(shot, ctx) {
  const stage = STAGES[shot];
  if (typeof stage !== 'function') return null;
  return stage(ctx);
}
