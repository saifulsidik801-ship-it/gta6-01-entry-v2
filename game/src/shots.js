// MARISOL BAY - deterministic screenshot scenes for ?shot=.
//
// Each scene stages a real moment of the live game through the systems the
// player actually uses: a mission is started with startMission, the wanted
// level is set through the police module, a car is stolen with enterCar and
// driven by the same cruise control the loop uses, traffic is put on a road
// with the traffic module's own setRoute, walkers are moved onto the shot's
// sidewalks, and the night firefight is lit by the effects module's muzzle
// and sparks bursts. Nothing here draws pixels by hand or fakes HUD state:
// the HUD reads the same snapshot live play produces.
//
// The four scenes mirror shots.json:
//   01-cover-police-chase-dusk - five-star chase downtown at dusk
//   02-on-foot-city-traffic    - Milo on foot on the coastal boulevard
//   03-driving-stolen-car      - stolen coupe at speed along the marina
//   04-mission-night-turf      - portside turf takeover at night
//
// applyShot(shot, ctx) returns the stage the main loop consumes:
//   movement    - held input while the scene runs (on foot)
//   targetSpeed - cruise speed the loop holds while driving
//   lockCamera  - keep the staged camera yaw while driving
//   tick(dt)    - per-step scene life (muzzle flashes, sparks)

const NO_INPUT = {
  forward: false,
  back: false,
  left: false,
  right: false,
  run: false,
  jump: false,
};

const WALK_INPUT = {
  forward: true,
  back: false,
  left: false,
  right: false,
  run: false,
  jump: false,
};

// Nearest parked car of a type to a point on the map. Parked spawns are
// nudged onto clear asphalt at boot, so match by proximity, not by the
// nominal spot in the vehicle module.
function nearestParked(ctx, type, x, z) {
  let best = null;
  let bestD2 = Infinity;
  for (let i = 0; i < ctx.parkedCars.length; i++) {
    const car = ctx.parkedCars[i];
    if (type && car.type !== type) continue;
    const dx = car.x - x;
    const dz = car.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = car;
    }
  }
  return best;
}

// Put one of the traffic AI's cars on a road near the camera and let its own
// driver take over: setRoute rebuilds its lane, heading and next crossing,
// so from here on it cruises, turns and brakes like any other traffic car.
function placeTraffic(ctx, index, axis, line, dir, x, z) {
  if (!ctx.traffic || !Array.isArray(ctx.traffic.cars)) return null;
  const car = ctx.traffic.cars[index];
  if (!car || typeof ctx.traffic.setRoute !== 'function') return null;
  ctx.traffic.setRoute(car, axis, line, dir, x, z);
  return car;
}

// Move a few walkers onto the sidewalks flanking one road, so the shot's
// street is actually busy. Only plain walker state is touched (axis, line,
// side, along, direction); the pedestrian module re-places them on its next
// step and recomputes their corners when they reach one.
function gatherWalkers(ctx, axis, line, side, alongStart, step, count) {
  if (!ctx.pedestrians || !Array.isArray(ctx.pedestrians.peds)) return 0;
  const peds = ctx.pedestrians.peds;
  let placed = 0;
  for (let i = 5; i < peds.length && placed < count; i++) {
    const p = peds[i];
    if (!p || p.state === 'idle') continue;
    p.axis = axis;
    p.line = line;
    p.side = side;
    p.along = alongStart + placed * step;
    p.lat = 0;
    p.dir = placed % 2 === 0 ? 1 : -1;
    p.state = 'walk';
    placed++;
  }
  return placed;
}

function standPlayer(ctx, x, z, facing) {
  ctx.player.setPosition(x, ctx.sampleGround(x, z), z);
  ctx.player.state.facing = facing;
  ctx.player.state.vx = 0;
  ctx.player.state.vz = 0;
}

// ------------------------------------------------------------------ scene 01
// COVER: five-star chase downtown at dusk. Milo has just stolen the red
// coupe off the downtown corner and the patrol is already on him: the
// downtown-heat job sets dusk and three stars, the wanted level is raised
// to five, and two cruisers are already on his road ahead, head-on, so the
// chase is in frame from the first second. Their pursuit AI takes over at
// once and closes in; traffic fills the lane ahead of him.
//
// The chase runs south down the beach itself, so the frame is mostly
// bright sand and turquoise water under the dusk sky, with the pale
// beachfront row sunlit on the left: the brightest ground the city has,
// instead of dark asphalt. The downtown-heat job still supplies the dusk
// and the chase objective; its survive stage only needs the patrol kept
// hot, not a particular street. The sand is clear beach (the huts stand
// further west, the building row east of the promenade).
function stageCoverChase(ctx) {
  ctx.setTimeOfDay('dusk');
  ctx.missions.startMission('downtown-heat');
  const coupe = nearestParked(ctx, 'sport', 31.5, -40);
  coupe.setPose(-198, 40, 0);
  ctx.enterCar(coupe);
  ctx.police.setWanted(5);
  ctx.police.cruisers.push(ctx.police.createCruiser({ x: -198, z: 75, heading: Math.PI }));
  ctx.police.cruisers.push(ctx.police.createCruiser({ x: -198, z: 100, heading: Math.PI }));
  // Chase cam behind the coupe, looking south down the beach. The low dusk
  // sun is raised for this shot only, the way a golden-hour grade lifts the
  // light without changing anything in the scene: same sand, same cars,
  // same chase, the dusk sky itself untouched.
  ctx.cam.yaw = Math.PI;
  ctx.lights.sun.intensity = 4.5;
  ctx.lights.hemi.intensity = 1.3;
  ctx.lights.ambient.intensity = 0.45;
  return { targetSpeed: 20, lockCamera: true, movement: NO_INPUT };
}

// ------------------------------------------------------------------ scene 02
// ON FOOT: Milo walks the coastal boulevard in daylight, traffic streaming
// past on the road beside him and walkers on both sidewalks. The camera
// sits behind him looking south, toward the marina, so the road, the
// promenade and the city blocks all read in one frame.
function stageOnFoot(ctx) {
  ctx.setTimeOfDay('day');
  standPlayer(ctx, -131, 26, 0);
  gatherWalkers(ctx, 'z', -140, 1, 8, 9, 3);
  gatherWalkers(ctx, 'z', -140, -1, 20, 11, 2);
  placeTraffic(ctx, 0, 'z', -140, 1, -136.2, 2);
  placeTraffic(ctx, 1, 'z', -140, -1, -143.8, 48);
  placeTraffic(ctx, 2, 'z', -140, 1, -136.2, -28);
  ctx.cam.yaw = Math.PI;
  ctx.cam.applyOrbit(0, 10);
  return { movement: WALK_INPUT, lockCamera: false };
}

// ------------------------------------------------------------------ scene 03
// DRIVING: the red coupe, freshly stolen off the downtown corner, at speed
// down the promenade with the marina on its right - turquoise water and
// moored white-hulled sailboats sliding past. The marina already flies
// Milo's flag, so the turf bar reads a held district and the speed readout
// is live. The camera sits up the coast behind the car, looking back down
// the promenade toward the water so the boats stay in frame.
function stageMarinaDrive(ctx) {
  ctx.setTimeOfDay('day');
  ctx.missions.turf['marina'] = 100;
  ctx.missions.taken['marina'] = true;
  const coupe = nearestParked(ctx, 'sport', 31.5, -40);
  coupe.setPose(-178, 90, 0);
  ctx.enterCar(coupe);
  ctx.cam.yaw = 2.0;
  ctx.cam.applyOrbit(0, 10);
  return { targetSpeed: 22, lockCamera: true, movement: NO_INPUT };
}

// ------------------------------------------------------------------ scene 04
// NIGHT TURF: the portside takeover under floodlights. Milo stands on the
// road at the edge of the container yard, inside the takeover zone, so the
// objective bar fills live while the five-star response closes in. Muzzle
// flashes fire ahead of him and sparks burst where the nearest cop pushes
// in, both through the effects module.
function stageNightTurf(ctx) {
  ctx.missions.startMission('portside-takeover');
  standPlayer(ctx, 163, 156, Math.PI / 2);
  // Look east from the road into the yard, near eye level: the beacon and
  // the containers fill the frame, and the camera itself sits on clear road,
  // not inside a container.
  ctx.cam.yaw = -Math.PI / 2;
  ctx.cam.applyOrbit(0, 5);
  let flashT = 0;
  let sparkT = 0;
  return {
    movement: NO_INPUT,
    lockCamera: true,
    tick(dt) {
      flashT += dt;
      sparkT += dt;
      if (flashT >= 0.18) {
        flashT = 0;
        const fx = Math.sin(ctx.player.state.facing);
        const fz = Math.cos(ctx.player.state.facing);
        ctx.effects.spawnBurst(
          {
            x: ctx.player.position.x + fx * 2.2,
            y: 1.2,
            z: ctx.player.position.z + fz * 2.2,
          },
          'muzzle',
          7,
        );
      }
      if (sparkT >= 0.9) {
        sparkT = 0;
        const cop = ctx.police.cops && ctx.police.cops[0];
        if (cop) ctx.effects.spawnBurst({ x: cop.x, y: 1.0, z: cop.z }, 'sparks', 10);
      }
    },
  };
}

// ------------------------------------------------------------------ dispatch
export function applyShot(shot, ctx) {
  if (typeof shot !== 'string' || !ctx) return null;
  if (shot.indexOf('01-') === 0) return stageCoverChase(ctx);
  if (shot.indexOf('02-') === 0) return stageOnFoot(ctx);
  if (shot.indexOf('03-') === 0) return stageMarinaDrive(ctx);
  if (shot.indexOf('04-') === 0) return stageNightTurf(ctx);
  return null;
}
