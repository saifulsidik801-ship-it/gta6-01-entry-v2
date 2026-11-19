// MARISOL BAY - deterministic screenshot staging for the four shots.json scenes.
//
// applyShot(name, ctx) runs before the first rendered frame and drives the real
// game objects (police cruisers, foot cops, traffic, pedestrians, missions, HUD);
// nothing here is an overlay. Every placement is fixed or seeded from config's
// mulberry32 so the same URL always renders the same frame.

import { DISTRICTS, WORLD, SEED, mulberry32 } from './config.js';

const LANE = WORLD.roadWidth / 2 - 2.2;

const idleMovement = () => ({
  forward: false, back: false, left: false, right: false, run: false, jump: false,
});

function hashName(name) {
  let h = SEED >>> 0;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

function takeCar(ctx, type) {
  const list = ctx.parkedCars || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].type === type) return list[i];
  }
  return list[0] || null;
}

function enterStolen(ctx, car, x, z, heading, speed) {
  if (!car) return null;
  car.setPose(x, z, heading);
  car.parked = false;
  car.handbrake = false;
  ctx.enterCar(car);
  car.vx = Math.sin(heading) * speed;
  car.vz = Math.cos(heading) * speed;
  car.speed = speed;
  car.group.position.set(x, 0, z);
  car.group.rotation.y = heading;
  if (car.car && car.car.setSpeedVisuals) car.car.setSpeedVisuals(speed, 0, 1 / 60);
  return car;
}

function addCruiser(ctx, x, z, heading) {
  const cr = ctx.police.createCruiser({ x, z, heading });
  ctx.police.cruisers.push(cr);
  return cr;
}

function addCop(ctx, x, z, heading) {
  const cop = ctx.police.createCop({ x, z });
  cop.x = x;
  cop.z = z;
  cop.heading = heading;
  cop.phase = 0;
  cop.group.position.set(x, 0, z);
  cop.group.rotation.y = heading;
  ctx.police.cops.push(cop);
  return cop;
}

// axis 'z' is a road running along Z with fixed x = line; axis 'x' the reverse.
// dir picks the right-hand lane exactly like traffic.js does.
function laneAt(axis, line, dir) {
  const off = axis === 'z' ? (dir > 0 ? LANE : -LANE) : (dir > 0 ? -LANE : LANE);
  return line + off;
}

function slotPoint(spec) {
  const axis = spec[0];
  const line = spec[1];
  const dir = spec[2];
  const along = spec[3];
  const lane = laneAt(axis, line, dir);
  return {
    axis,
    line,
    dir,
    x: axis === 'z' ? lane : along,
    z: axis === 'z' ? along : lane,
  };
}

function setTraffic(ctx, specs) {
  const cars = ctx.traffic.cars;
  for (let i = 0; i < cars.length; i++) {
    const spec = specs[i % specs.length];
    if (!spec) continue;
    const p = slotPoint(spec);
    ctx.traffic.setRoute(cars[i], p.axis, p.line, p.dir, p.x, p.z);
  }
}

// Traffic keeps driving (the AI is the real one); a car that has driven out of
// the shot is recycled onto its staged lane slot, exactly like the game's own
// far-away respawn, so the street always reads as a live stream.
function keepTraffic(ctx, specs, anchor, radius = 70) {
  return () => {
    const cars = ctx.traffic.cars;
    const cx = anchor ? anchor.x : (ctx.car ? ctx.car.group.position.x : ctx.player.position.x);
    const cz = anchor ? anchor.z : (ctx.car ? ctx.car.group.position.z : ctx.player.position.z);
    for (let i = 0; i < cars.length; i++) {
      const spec = specs[i % specs.length];
      if (!spec) continue;
      const dx = cars[i].x - cx;
      const dz = cars[i].z - cz;
      if (dx * dx + dz * dz < radius * radius) continue;
      const p = slotPoint(spec);
      ctx.traffic.setRoute(cars[i], p.axis, p.line, p.dir, p.x, p.z);
    }
  };
}

function stagePed(ped, x, z, yaw) {
  ped.state = 'idle';
  ped.x = x;
  ped.z = z;
  ped.homeX = x;
  ped.homeZ = z;
  ped.tx = x;
  ped.tz = z;
  ped.idleT = 999;
  ped.shiftT = 0;
  ped.sway = 0;
  ped.fleeT = 0;
  ped.baseYaw = yaw;
  ped.heading = yaw;
  ped.yaw = yaw;
  ped.group.position.set(x, 0, z);
  ped.group.rotation.y = yaw;
}

function tuneLights(ctx, opts) {
  const L = ctx.lights;
  if (!L) return;
  if (opts.hemi !== undefined) L.hemi.intensity = opts.hemi;
  if (opts.sun !== undefined) L.sun.intensity = opts.sun;
  if (opts.ambient !== undefined) L.ambient.intensity = opts.ambient;
  if (opts.exposure !== undefined) ctx.renderer.toneMappingExposure = opts.exposure;
  if (opts.background !== undefined) ctx.scene.background.setHex(opts.background);
  if (opts.fog !== undefined && ctx.scene.fog) ctx.scene.fog.color.setHex(opts.fog);
  if (opts.sunPos) L.sun.position.set(opts.sunPos[0], opts.sunPos[1], opts.sunPos[2]);
}

function frameCamera(ctx, yaw, pitch, zoom) {
  const cam = ctx.cam;
  const sens = ctx.config.CAMERA.sensitivity;
  cam.applyOrbit((cam.yaw - yaw) / sens, (pitch - cam.pitch) / sens);
  if (zoom) cam.applyZoom(zoom);
}

function placeOnFoot(ctx, x, z, facing) {
  ctx.player.root.visible = true;
  ctx.player.setPosition(x, ctx.sampleGround(x, z), z);
  ctx.player.state.facing = facing;
  ctx.player.state.vx = 0;
  ctx.player.state.vz = 0;
  ctx.player.state.speed = 0;
  ctx.player.root.rotation.y = facing;
}

function compose(...fns) {
  const list = fns.filter(Boolean);
  return (dt) => {
    for (let i = 0; i < list.length; i++) list[i](dt);
  };
}

function wrapPi(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

// Keep the shot's hero car rolling down its lane: physics still drives it, but
// a police ram, a curb nudge or the world edge is corrected back onto the lane
// (and back to the anchor stretch) so the framing stays composed.
function holdLane(car, anchor, laneX, laneHeading) {
  return () => {
    if (!car) return;
    const speed = Math.abs(car.speed) || 12;
    const dz = (car.z - anchor.z) * Math.cos(laneHeading);
    const drift = (car.x - laneX) * Math.cos(laneHeading) - (car.z - anchor.z) * Math.sin(laneHeading);
    if (Math.abs(dz) > 42) {
      car.setPose(anchor.x, anchor.z, laneHeading);
      car.vx = Math.sin(laneHeading) * speed;
      car.vz = Math.cos(laneHeading) * speed;
      car.speed = speed;
      return;
    }
    if (Math.abs(drift) > 0.9) {
      car.x = laneX + Math.sign(drift) * 0.6;
      car.group.position.x = car.x;
      if (Math.abs(drift) > 3) {
        car.vx = Math.sin(car.heading) * speed;
        car.vz = Math.cos(car.heading) * speed;
      }
    }
    const dh = wrapPi(car.heading - laneHeading);
    if (Math.abs(dh) > 0.06) {
      car.heading = laneHeading + Math.sign(dh) * 0.03;
      car.group.rotation.y = car.heading;
    }
    if (Math.abs(car.speed) > 1 && Math.abs(car.speed) < 4) {
      car.speed = Math.sign(car.speed) * 9;
      car.vx = Math.sin(car.heading) * car.speed;
      car.vz = Math.cos(car.heading) * car.speed;
    }
  };
}

// Police stay in a tight band behind the hero car.
function holdEscort(car, cruisers, gaps) {
  return () => {
    if (!car) return;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (let i = 0; i < cruisers.length; i++) {
      const v = cruisers[i].vehicle;
      const gap = gaps[i] || 12 + i * 11;
      const dx = v.x - car.x;
      const dz = v.z - car.z;
      const along = dx * fx + dz * fz;
      const lateral = Math.abs(dx * fz - dz * fx);
      if (along < -gap - 14 || along > -gap + 16 || lateral > 9) {
        const back = -gap;
        const side = (i % 2 === 0 ? -1 : 1) * (1.2 + i * 1.9);
        const x = car.x + fx * back + fz * side;
        const z = car.z + fz * back - fx * side;
        v.setPose(x, z, car.heading);
        v.vx = fx * 15;
        v.vz = fz * 15;
        v.speed = 15;
      }
    }
  };
}

// Keep the police escort parked inside the shot's framing while the real
// cruiser physics keeps running (they still chase, ram and flash).
function holdCruisers(cruisers, anchors) {
  return () => {
    for (let i = 0; i < cruisers.length; i++) {
      const v = cruisers[i].vehicle;
      const a = anchors[i];
      if (!a) continue;
      const dx = v.x - a.x;
      const dz = v.z - a.z;
      if (dx * dx + dz * dz > 100) {
        const h = a.heading || 0;
        v.setPose(a.x, a.z, h);
        v.vx = Math.sin(h) * 8;
        v.vz = Math.cos(h) * 8;
        v.speed = 8;
      }
    }
  };
}

// Foot cops hold fixed marks around the player and never reach arrest range.
function holdMarks(player, cops, marks) {
  return (dt) => {
    const p = player.position;
    for (let i = 0; i < cops.length; i++) {
      const cop = cops[i];
      const mark = marks[i % marks.length];
      const tx = p.x + mark[0];
      const tz = p.z + mark[1];
      const dx = cop.x - tx;
      const dz = cop.z - tz;
      if (dx * dx + dz * dz > 6.25 || cop.down > 0 || cop.hp <= 0) {
        cop.x = tx;
        cop.z = tz;
        cop.down = 0;
        cop.hp = 2;
        cop.stuck = 0;
        cop.kx = 0;
        cop.kz = 0;
        cop.group.position.set(cop.x, 0, cop.z);
      }
      cop.arrest = 0;
      cop.heading = Math.atan2(p.x - cop.x, p.z - cop.z);
      cop.group.rotation.y = cop.heading;
      cop.body.position.y = 0;
      cop.legL.rotation.x = 0;
      cop.legR.rotation.x = 0;
      cop.armL.rotation.x = -0.5 + Math.sin(cop.phase) * 0.1;
      cop.armR.rotation.x = -0.4 + Math.cos(cop.phase) * 0.1;
      cop.phase += dt * 2;
    }
  };
}

// ---------------------------------------------------------------- 01 cover
function coverChase(ctx) {
  ctx.setTimeOfDay('dusk');
  ctx.missions.completed = {
    'first-fare': true,
    'beachfront-run': true,
    'marina-muscle': true,
    'oldquarter-pickup': true,
  };
  ctx.missions.startMission('downtown-heat');

  tuneLights(ctx, {
    hemi: 2.6,
    sun: 3.9,
    ambient: 0.85,
    exposure: 1.55,
    background: 0xa8bade,
    fog: 0xf8dbb8,
    sunPos: [90, 120, 210],
  });

  const car = takeCar(ctx, 'sedan');
  ctx.car = car;
  const anchor = { x: 36.2, z: -70 };
  enterStolen(ctx, car, anchor.x, anchor.z, Math.PI, 13);
  ctx.police.setWanted(3);

  const c1 = addCruiser(ctx, 40.4, -61, Math.PI);
  const c2 = addCruiser(ctx, 35.9, -52, Math.PI);
  const c3 = addCruiser(ctx, 40.3, -42, Math.PI);

  const cops = [
    addCop(ctx, 50.5, -58, Math.PI * 0.55),
    addCop(ctx, 24.2, -44, -Math.PI * 0.6),
    addCop(ctx, 51.0, -84, Math.PI * 0.4),
    addCop(ctx, 23.6, -94, -Math.PI * 0.4),
  ];

  const traffic = [
    ['x', -80, 1, -160], ['x', -80, 1, -100], ['x', -80, 1, -40], ['x', -80, 1, 20],
    ['x', -20, -1, -180], ['x', -20, -1, -100], ['x', -20, -1, -20],
    ['x', 100, -1, -200], ['x', 100, -1, -120], ['x', 100, -1, -40],
    ['x', 100, 1, 40], ['x', -20, 1, 80],
    ['z', 160, 1, -120], ['z', 160, -1, -40],
  ];
  setTraffic(ctx, traffic);

  frameCamera(ctx, -2.62, 0.18, 0.2);
  return {
    targetSpeed: 13,
    lockCamera: true,
    tick: compose(
      holdLane(car, anchor, 36.2, Math.PI),
      holdEscort(car, [c1, c2, c3], [9, 18, 28]),
      keepTraffic(ctx, traffic, { x: 36, z: -60 }, 80),
      () => {
        for (let i = 0; i < cops.length; i++) cops[i].arrest = 0;
      },
    ),
  };
}

// ------------------------------------------------------------ 02 on foot
function onFootTraffic(ctx) {
  ctx.setTimeOfDay('day');
  tuneLights(ctx, {
    hemi: 0.95,
    sun: 2.2,
    ambient: 0.38,
    exposure: 1.04,
    background: 0x4fa4dc,
    fog: 0xc4e2ee,
    sunPos: [-70, 120, 90],
  });

  placeOnFoot(ctx, -131, 26, Math.PI);

  const peds = ctx.pedestrians.peds;
  const spots = [
    [-132.2, 16, -Math.PI / 2],
    [-129.4, 8, -Math.PI / 2],
    [-133.0, -3, -Math.PI / 2],
    [-130.2, -14, Math.PI / 2],
    [-127.6, 32, -Math.PI / 2],
  ];
  let cursor = 0;
  for (let i = 0; i < peds.length && cursor < spots.length; i++) {
    if (peds[i].state !== 'idle') continue;
    const s = spots[cursor++];
    stagePed(peds[i], s[0], s[1], s[2]);
  }

  const traffic = [
    ['z', -140, 1, -22], ['z', -140, 1, 26], ['z', -140, 1, 74],
    ['z', -140, -1, 54], ['z', -140, -1, 6], ['z', -140, -1, -42], ['z', -140, -1, -94],
    ['x', -20, 1, -178], ['x', -20, 1, -118], ['x', -20, 1, -58],
    ['x', 100, -1, -190], ['x', 100, -1, -130], ['x', 100, -1, -70], ['x', 100, -1, -12],
  ];
  setTraffic(ctx, traffic);

  frameCamera(ctx, 0, 0.3, -0.04);
  return {
    targetSpeed: 0,
    lockCamera: true,
    tick: keepTraffic(ctx, traffic),
  };
}

// -------------------------------------------------------- 03 stolen coupe
function stolenCoupe(ctx) {
  ctx.setTimeOfDay('day');
  tuneLights(ctx, {
    hemi: 0.95,
    sun: 2.2,
    ambient: 0.38,
    exposure: 1.04,
    background: 0x4fa4dc,
    fog: 0xc4e2ee,
    sunPos: [-90, 120, 60],
  });

  const keys = DISTRICTS.map((d) => d.key);
  ctx.missions.turf = {};
  ctx.missions.taken = {};
  for (let i = 0; i < keys.length; i++) {
    ctx.missions.turf[keys[i]] = 0;
    ctx.missions.taken[keys[i]] = false;
  }
  ctx.missions.turf.marina = 72;
  ctx.missions.turf.beachfront = 58;
  ctx.missions.turf.downtown = 34;
  ctx.missions.turf.oldquarter = 100;
  ctx.missions.taken.oldquarter = true;
  ctx.cash = 2450;

  const car = takeCar(ctx, 'sport');
  ctx.car = car;
  const anchor = { x: -136.2, z: 20 };
  enterStolen(ctx, car, anchor.x, anchor.z, 0, 19);
  ctx.police.setWanted(0);
  ctx.police.clear();

  const traffic = [
    ['z', -140, 1, 120], ['z', -140, 1, 168], ['z', -140, 1, 214],
    ['z', -140, -1, 60], ['z', -140, -1, 100], ['z', -140, -1, 146], ['z', -140, -1, 196],
    ['x', -80, 1, -60], ['x', -80, 1, 20], ['x', -80, 1, 90],
    ['x', 100, -1, -120], ['x', 100, -1, -60], ['x', 100, -1, 0],
    ['x', 40, 1, -30],
  ];
  setTraffic(ctx, traffic);

  frameCamera(ctx, Math.PI, 0.27, -0.08);
  return {
    targetSpeed: 19,
    lockCamera: true,
    tick: compose(
      holdLane(car, anchor, -136.2, 0),
      keepTraffic(ctx, traffic),
      () => {
        if (ctx.police.getWanted() !== 0) {
          ctx.police.setWanted(0);
          ctx.police.clear();
        }
      },
    ),
  };
}

// ------------------------------------------------------ 04 night takeover
function nightTurf(ctx) {
  ctx.setTimeOfDay('night');

  const keys = DISTRICTS.map((d) => d.key);
  ctx.missions.turf = {};
  ctx.missions.taken = {};
  for (let i = 0; i < keys.length; i++) {
    ctx.missions.turf[keys[i]] = 100;
    ctx.missions.taken[keys[i]] = true;
  }
  ctx.missions.completed = {
    'first-fare': true,
    'beachfront-run': true,
    'marina-muscle': true,
    'oldquarter-pickup': true,
    'downtown-heat': true,
  };
  ctx.cash = 6400;
  ctx.missions.startMission('portside-takeover');

  tuneLights(ctx, {
    hemi: 1.15,
    sun: 1.1,
    ambient: 0.46,
    exposure: 1.35,
    background: 0x0c1526,
    fog: 0x26344f,
    sunPos: [60, 90, -140],
  });

  placeOnFoot(ctx, 172, 149, 0);

  const cops = [
    addCop(ctx, 174.5, 155, Math.PI),
    addCop(ctx, 169.0, 158, Math.PI),
    addCop(ctx, 176.0, 162, Math.PI),
    addCop(ctx, 167.5, 154, Math.PI),
    addCop(ctx, 173.0, 168, Math.PI),
    addCop(ctx, 170.5, 172, Math.PI),
  ];
  const marks = [
    [2.5, 6], [-3.0, 9], [4.0, 12], [-4.5, 5], [1.0, 15], [-1.5, 19],
  ];

  addCruiser(ctx, 163.8, 178, 0);
  addCruiser(ctx, 156.2, 170, Math.PI);
  addCruiser(ctx, 163.8, 196, 0);
  addCruiser(ctx, 156.2, 190, Math.PI);
  addCruiser(ctx, 163.8, 214, 0);
  const anchors = [
    { x: 163.8, z: 178, heading: 0 },
    { x: 156.2, z: 170, heading: Math.PI },
    { x: 163.8, z: 196, heading: 0 },
    { x: 156.2, z: 190, heading: Math.PI },
    { x: 163.8, z: 214, heading: 0 },
  ];

  const traffic = [
    ['z', 160, 1, 118], ['z', 160, 1, 202],
    ['z', 160, -1, 138], ['z', 160, -1, 222],
    ['x', 160, 1, 98], ['x', 160, 1, 58],
    ['x', 160, -1, 118], ['x', 160, -1, 198],
    ['x', 100, 1, 78], ['x', 100, 1, 138], ['x', 100, 1, 198],
    ['x', 100, -1, 58], ['x', 100, -1, 118],
  ];
  setTraffic(ctx, traffic);

  frameCamera(ctx, Math.PI, 0.22, -0.12);

  const rng = mulberry32(hashName('04-mission-night-turf'));
  let flashT = 0;
  let shotT = 0.3;
  const gunfire = (dt) => {
    flashT -= dt;
    shotT -= dt;
    const s = ctx.combat.state;
    s.health = 100;
    s.damageT = 99;
    if (flashT <= 0) {
      flashT = 0.1;
      const aim = ctx.cam.yaw + Math.PI;
      const fx = Math.sin(aim);
      const fz = Math.cos(aim);
      const p = ctx.player.position;
      const jitter = (rng() - 0.5) * 0.18;
      ctx.effects.spawnBurst(
        { x: p.x + fx * 0.8 + jitter, y: 1.25, z: p.z + fz * 0.8 },
        'muzzle',
        7,
      );
      ctx.effects.spawnBurst(
        { x: p.x + fx * 1.3, y: 1.2, z: p.z + fz * 1.3 },
        'sparks',
        4,
      );
    }
    if (shotT <= 0) {
      shotT = 0.95;
      s.ammo = 12;
      s.shotCd = 0;
      s.reloading = false;
      ctx.combat.shoot({
        position: ctx.player.position,
        driving: false,
        camYaw: ctx.cam.yaw,
        facing: ctx.player.state.facing,
      }, ctx.police);
    }
  };

  return {
    targetSpeed: 0,
    lockCamera: true,
    tick: compose(
      holdMarks(ctx.player, cops, marks),
      holdCruisers(ctx.police.cruisers, anchors),
      gunfire,
      keepTraffic(ctx, traffic),
    ),
  };
}

const SCENES = {
  '01-cover-police-chase-dusk': coverChase,
  '02-on-foot-city-traffic': onFootTraffic,
  '03-driving-stolen-car': stolenCoupe,
  '04-mission-night-turf': nightTurf,
};

export const SHOT_NAMES = Object.keys(SCENES);

export function applyShot(name, ctx) {
  const build = SCENES[name];
  if (!build || !ctx) return null;
  const state = build(ctx) || {};
  return {
    name,
    lockCamera: !!state.lockCamera,
    targetSpeed: state.targetSpeed || 0,
    tick: state.tick || null,
    get movement() {
      return idleMovement();
    },
  };
}
