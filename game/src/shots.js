// MARISOL BAY - staged screenshot scenes (?shot=).
//
// Each scene sets up REAL game state (a live mission, a real wanted level,
// real police units, real traffic, a real driven/stolen car) and returns a
// stage object main.js consumes: targetSpeed (auto-drive speed while driving),
// lockCamera (keep the staged camera yaw), movement (on-foot input override)
// and tick(dt) (per-frame hook). Deterministic: fixed positions, fixed time
// of day, fixed wanted/mission state on every load. No DOM overlays, no
// composited images — the HUD in every shot is the live HUD.

export function applyShot(shot, ctx) {
  switch (shot) {
    case '01-cover-police-chase-dusk':
      return stageCover(ctx);
    case '02-on-foot-city-traffic':
      return stageBoulevard(ctx);
    case '03-driving-stolen-car':
      return stageMarinaDrive(ctx);
    case '04-mission-night-turf':
      return stageNightTurf(ctx);
    default:
      return null;
  }
}

// ------------------------------------------------------------------ helpers

function findParkedCar(parkedCars, type) {
  for (let i = 0; i < parkedCars.length; i++) {
    if (parkedCars[i].type === type) return parkedCars[i];
  }
  return parkedCars.length > 0 ? parkedCars[0] : null;
}

// Put one of the live traffic cars on a chosen lane. axis 'z' = road with a
// fixed x (gridLinesX value); axis 'x' = road with a fixed z (gridLinesZ).
function placeTraffic(traffic, index, axis, line, dir, x, z) {
  const car = traffic.cars[index % traffic.cars.length];
  if (!car) return null;
  traffic.setRoute(car, axis, line, dir, x, z);
  return car;
}

function placeCruiser(police, x, z, heading) {
  const cruiser = police.createCruiser({ x, z, heading });
  if (cruiser) police.cruisers.push(cruiser);
  return cruiser;
}

function placeCop(police, x, z) {
  const cop = police.createCop({ x, z });
  if (!cop) return null;
  cop.x = x;
  cop.z = z;
  cop.group.position.set(x, 0, z);
  police.cops.push(cop);
  return cop;
}

// Mark a district as already taken so the turf bar reads as lived-in.
function takeDistrict(missions, key) {
  if (!missions || !missions.turf || !missions.taken) return;
  missions.turf[key] = 100;
  missions.taken[key] = true;
}

function holdWanted(police, stars) {
  if (police.getWanted() < stars) police.setWanted(stars);
}

const IDLE_MOVEMENT = {
  forward: false,
  back: false,
  left: false,
  right: false,
  run: false,
  jump: false,
};

// ------------------------------------------------------- 01 - cover, dusk
//
// Milo flees downtown in a stolen red coupe at dusk, five wanted stars, a
// cruiser closing head-on up the same street and the Downtown Heat job live.
// Dusk staging is brightened (hemi/sun/ambient above the dusk preset) so the
// cover reads sun-soaked, not night: mean luminance must stay >= 0.45.
function stageCover(ctx) {
  ctx.missions.startMission('downtown-heat');
  ctx.setTimeOfDay('dusk');
  ctx.lights.hemi.intensity = 2.6;
  ctx.lights.sun.intensity = 5.0;
  ctx.lights.ambient.intensity = 1.2;
  // Warm sunset sky for the cover: the dusk preset's flat top is dark
  // blue, so stage a brighter rose horizon instead.
  ctx.scene.background.setHex(0xe8b89a);

  takeDistrict(ctx.missions, 'beachfront');

  const coupe = findParkedCar(ctx.parkedCars, 'sport');
  coupe.setPose(40, -100, 0);
  ctx.enterCar(coupe);
  ctx.police.setWanted(5);

  // Head-on cruiser up the same street, closing on Milo.
  placeCruiser(ctx.police, 40, -58, Math.PI);
  // Second cruiser joining the chase from the cross street behind.
  placeCruiser(ctx.police, 52, -122, 0);
  // Foot cops on the downtown sidewalks flanking the street.
  placeCop(ctx.police, 48, -88);
  placeCop(ctx.police, 32, -76);

  // Cross traffic and a car ahead on the same road.
  placeTraffic(ctx.traffic, 0, 'z', 40, 1, 43.8, -38);
  placeTraffic(ctx.traffic, 1, 'x', -80, 1, 8, -83.8);
  placeTraffic(ctx.traffic, 2, 'z', 100, -1, 96.2, -60);

  // Camera behind and slightly left of the coupe, looking up the street at
  // the oncoming cruiser and the downtown towers. Pitched nearly level so
  // the frame carries bright sky and lit facades instead of a foreground
  // full of dark asphalt.
  ctx.cam.reset();
  ctx.cam.yaw = Math.PI + 0.38;
  ctx.cam.applyOrbit(0, -35);
  ctx.cam.applyOrbit(0, 6);

  return {
    targetSpeed: 15,
    lockCamera: true,
    movement: { forward: true, back: false, left: false, right: false, run: false, jump: false },
    tick() {
      holdWanted(ctx.police, 5);
    },
  };
}

// ------------------------------------------- 02 - on foot, coastal boulevard
//
// Milo on foot on the sunlit promenade, walking north past the beachfront
// with traffic streaming on the coastal road beside him and pedestrians on
// the sidewalks. Beachfront Take job live.
function stageBoulevard(ctx) {
  ctx.missions.startMission('beachfront-run');
  ctx.setTimeOfDay('day');

  takeDistrict(ctx.missions, 'beachfront');

  const x = -178;
  const z = 90;
  ctx.player.setPosition(x, ctx.sampleGround(x, z), z);
  ctx.player.state.facing = Math.PI;
  ctx.player.root.rotation.y = Math.PI;

  // Streaming traffic on the coastal road (x = -140) and the next block in.
  placeTraffic(ctx.traffic, 0, 'z', -140, 1, -136.2, 6);
  placeTraffic(ctx.traffic, 1, 'z', -140, -1, -143.8, 34);
  placeTraffic(ctx.traffic, 2, 'z', -140, 1, -136.2, 78);
  placeTraffic(ctx.traffic, 3, 'x', 40, -1, -160, 36.2);
  placeTraffic(ctx.traffic, 4, 'z', -80, 1, -76.2, 20);

  // Camera behind Milo, looking north up the promenade: palms and sand on
  // the right, the road and traffic on the left.
  ctx.cam.reset();
  ctx.cam.yaw = 0;

  return {
    targetSpeed: 0,
    lockCamera: true,
    movement: { forward: true, back: false, left: false, right: false, run: false, jump: false },
  };
}

// ------------------------------------------- 03 - driving, marina, stolen coupe
//
// Milo behind the wheel of a freshly stolen red coupe at speed along the
// marina promenade, turquoise water and moored white-hulled sailboats to the
// left, Slip Fees job live, speed readout and turf bar on the HUD.
function stageMarinaDrive(ctx) {
  ctx.missions.startMission('marina-muscle');
  ctx.setTimeOfDay('day');

  takeDistrict(ctx.missions, 'beachfront');

  const coupe = findParkedCar(ctx.parkedCars, 'sport');
  coupe.setPose(-178, 40, 0);
  ctx.enterCar(coupe);

  // Traffic on the marina roads beside the promenade.
  placeTraffic(ctx.traffic, 0, 'z', -140, 1, -136.2, 66);
  placeTraffic(ctx.traffic, 1, 'z', -140, -1, -143.8, 96);
  placeTraffic(ctx.traffic, 2, 'x', 100, 1, -120, 96.2);
  placeTraffic(ctx.traffic, 3, 'z', -80, 1, -76.2, 120);

  // Camera south-east of the coupe, looking north-west across it: the
  // turquoise water and the moored white-hulled sailboats sit beyond the
  // car in the background instead of out at the frame edge.
  ctx.cam.reset();
  ctx.cam.yaw = Math.PI - 0.85;

  return {
    targetSpeed: 17,
    lockCamera: true,
    movement: { forward: true, back: false, left: false, right: false, run: false, jump: false },
  };
}

// ------------------------------------------- 04 - night turf takeover, portside
//
// Night in the port district: Milo holds the container yard while the
// Portside Takeover bar fills, five wanted stars, cops closing in, muzzle
// flashes from the live effects system every frame so a flash is always in
// the frame, and a cruiser's light bar flashing on the yard road.
function stageNightTurf(ctx) {
  ctx.missions.startMission('portside-takeover');
  ctx.setTimeOfDay('night');
  // Night staging is lifted just enough to read: containers, cranes and the
  // beacon stay visible instead of crushing to black.
  ctx.lights.ambient.intensity = 0.34;
  ctx.lights.hemi.intensity = 0.7;
  ctx.lights.sun.intensity = 0.7;

  takeDistrict(ctx.missions, 'beachfront');
  ctx.police.setWanted(5);

  // Milo stands near the edge of the takeover radius (170, 156, r 14),
  // facing the dock crew closing from the south-west. Standing at the edge
  // keeps the camera OUT of the orange beacon column (r ~12.6 around the
  // centre) so the frame stays night, not washed orange.
  const px = 178;
  const pz = 166;
  ctx.player.setPosition(px, ctx.sampleGround(px, pz), pz);
  const facing = Math.atan2(158 - px, 148 - pz);
  ctx.player.state.facing = facing;
  ctx.player.root.rotation.y = facing;

  // Dock crew closing on the yard, plus a cruiser on the yard road.
  placeCop(ctx.police, 158, 148);
  placeCop(ctx.police, 180, 150);
  placeCop(ctx.police, 164, 168);
  placeCruiser(ctx.police, 160, 186, 0);

  ctx.cam.reset();
  ctx.cam.yaw = facing + Math.PI;

  let sparkT = 0;
  return {
    targetSpeed: 0,
    lockCamera: true,
    movement: IDLE_MOVEMENT,
    tick(dt) {
      holdWanted(ctx.police, 5);

      // Hold the takeover bar mid-fill: the live HUD reads this progress
      // every frame, so the bar shows a takeover in progress, not done.
      const obj = ctx.missions.obj;
      if (obj && obj.o && obj.o.type === 'takeover') {
        if (obj.progress < 0.62) obj.progress = 0.62;
        else if (obj.progress > 0.62) obj.progress = 0.62;
      }

      // Muzzle flash at Milo's gun, every frame, so a live flash is always
      // in the frame; sparks and an impact burst by the nearest cop on a
      // slow cycle for the exchange of fire.
      const fx = Math.sin(facing);
      const fz = Math.cos(facing);
      ctx.effects.spawnBurst(
        { x: px + fx * 0.9, y: 1.25, z: pz + fz * 0.9 },
        'muzzle',
        7,
      );
      sparkT += dt || 0.016;
      if (sparkT > 0.45) {
        sparkT = 0;
        ctx.effects.spawnBurst(
          { x: px + fx * 1.4, y: 1.25, z: pz + fz * 1.4 },
          'sparks',
          6,
        );
        const cops = ctx.police.cops;
        if (cops.length > 0) {
          const cop = cops[0];
          ctx.effects.spawnBurst({ x: cop.x, y: 1.0, z: cop.z }, 'impact', 8);
        }
      }
    },
  };
}
