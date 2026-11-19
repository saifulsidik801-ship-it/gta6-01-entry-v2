// MARISOL BAY - traffic: AI cars cruising the road grid, keeping right-hand
// lanes and turning at crossings. Every car is a full Vehicle driven by
// throttle/steer so it shares the same physics and wheel animation as the player.

import { Vehicle, buildCar } from './vehicle.js';
import { WORLD, clamp } from './config.js';

const LANE = WORLD.roadWidth / 2 - 2.2;

const CRUISE_MIN = 10;
const CRUISE_MAX = 14;
const TURN_SPEED = 6.2;
const TURN_WINDOW = 17;
const SLOW_WINDOW = 27;
const SLOW_SPEED = 8.6;

const SCAN_TRAFFIC = 9;
const SCAN_PLAYER = 8;
const SCAN_OBSTACLE = 8;
const SCAN_SIDE = 2.6;
const SEPARATION = 4;
const U_TURN_COOLDOWN = 2.5;
const STUCK_LIMIT = 5;

const DESPAWN_RANGE = 260;
const SPAWN_MIN = 60;
const SPAWN_MAX = 120;
const SPAWN_MIN_DIST = 45;

const ROAD_X0 = WORLD.gridMinX - 14;
const ROAD_X1 = WORLD.maxX - 10;
const ROAD_Z0 = -WORLD.half + 14;
const ROAD_Z1 = WORLD.half - 14;

const TYPES = ['sedan', 'taxi', 'van', 'sport'];
const PAINT = [
  0xe9e3d3, 0x2f8f9c, 0xb4b9be, 0xd9c4a3, 0xc8382a, 0x3d6b8f,
  0xe0d7c4, 0x8a9a6b, 0x2f6f5e, 0xa8763f, 0xcfd6d8, 0x7b4a3a,
];

function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function makeRandom(seed) {
  let s = seed >>> 0;
  return function random() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Heading along a road line: axis 'x' travels on a road with fixed z.
function baseHeading(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

// Right-hand traffic: the lane sits a fixed distance right of the line centre.
function laneCoord(line, axis, dir) {
  if (axis === 'x') return line + (dir > 0 ? -LANE : LANE);
  return line + (dir > 0 ? LANE : -LANE);
}

function aheadOf(x, z, heading, tx, tz, reach, side) {
  const dx = tx - x;
  const dz = tz - z;
  if (dx * dx + dz * dz < 2.25) return true;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const proj = dx * fx + dz * fz;
  if (proj <= 0.2 || proj > reach) return false;
  return Math.abs(dx * fz - dz * fx) <= side;
}

function carDims(types) {
  const map = {};
  for (let i = 0; i < types.length; i++) {
    try {
      const built = buildCar(null, { type: types[i] });
      map[types[i]] = { length: built.length, width: built.width };
    } catch (err) {
      map[types[i]] = { length: 4.6, width: 1.9 };
    }
  }
  return map;
}

export class Traffic {
  constructor(scene, world, opts = {}) {
    this.scene = scene || null;
    this.world = world || null;
    this.count = Math.max(1, Math.floor(opts.count === undefined ? 14 : opts.count));
    this.random = makeRandom(opts.seed === undefined ? 0x51c7a3 : opts.seed);
    this.roadsX = WORLD.gridLinesX.slice();
    this.roadsZ = WORLD.gridLinesZ.slice();

    this.specs = carDims(TYPES);
    this.types = TYPES.filter((t) => this.specs[t] !== undefined);
    if (this.types.length === 0) this.types = ['sedan'];

    this.cars = [];
    const start = opts.playerPos || { x: WORLD.gridLinesX[3] || 0, z: 0 };
    for (let i = 0; i < this.count; i++) {
      this.cars.push(this.createCar(i, start));
    }
  }

  createCar(index, playerPos) {
    const type = this.types[Math.floor(this.random() * this.types.length) % this.types.length];
    const color = type === 'taxi'
      ? 0xf3c53c
      : PAINT[Math.floor(this.random() * PAINT.length) % PAINT.length];
    const spec = this.specs[type] || { length: 4.6, width: 1.9 };

    const car = new Vehicle(this.scene, this.world, {
      x: 0,
      z: 0,
      heading: 0,
      type,
      color,
      parked: false,
    });

    car.ai = {
      id: index,
      axis: 'x',
      line: 0,
      dir: 1,
      lane: 0,
      cruise: CRUISE_MIN + this.random() * (CRUISE_MAX - CRUISE_MIN),
      turnSpeed: TURN_SPEED + this.random() * 0.9,
      reach: SCAN_TRAFFIC + Math.max(0, spec.length - 4.6) * 0.55,
      crossing: null,
      path: null,
      route: null,
      throttle: 0.2,
      blocked: false,
      stuck: 0,
      uturnCooldown: 0,
    };

    this.placeOnRoad(car, playerPos || { x: 0, z: 0 });
    return car;
  }

  // Drop a car onto a lane at (x, z) and rebuild its route state.
  setRoute(car, axis, line, dir, x, z) {
    const ai = car.ai;
    ai.axis = axis;
    ai.line = line;
    ai.dir = dir;
    ai.lane = laneCoord(line, axis, dir);
    ai.path = null;
    ai.route = null;
    ai.throttle = 0.2;
    ai.stuck = 0;
    ai.uturnCooldown = 0;
    ai.blocked = false;
    car.setPose(x, z, baseHeading(axis, dir));
    const along = axis === 'x' ? x : z;
    ai.crossing = this.nextCrossing(axis, along - dir * 2, dir);
  }

  placeOnRoad(car, playerPos) {
    const spot = this.pickSpawn(playerPos, car);
    this.setRoute(car, spot.axis, spot.line, spot.dir, spot.x, spot.z);
    return spot;
  }

  nextCrossing(axis, along, dir) {
    const lines = axis === 'x' ? this.roadsX : this.roadsZ;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < lines.length; i++) {
      const d = (lines[i] - along) * dir;
      if (d > 1 && d < bestDist) {
        bestDist = d;
        best = lines[i];
      }
    }
    return best;
  }

  hasCrossingAfter(axis, dir, value) {
    const lines = axis === 'x' ? this.roadsX : this.roadsZ;
    for (let i = 0; i < lines.length; i++) {
      if ((lines[i] - value) * dir > 1) return true;
    }
    return false;
  }

  // A random lane point 60-120 units from the player, preferred to be clear.
  pickSpawn(playerPos, ignore) {
    const px = playerPos && typeof playerPos.x === 'number' ? playerPos.x : 0;
    const pz = playerPos && typeof playerPos.z === 'number' ? playerPos.z : 0;
    const midIndex = Math.max(0, Math.min(this.roadsX.length - 1, 3));
    const fallback = {
      x: px + SPAWN_MIN, z: pz, axis: 'z', line: this.roadsX[midIndex], dir: 1,
    };
    let best = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 20; attempt++) {
      const axis = this.random() < 0.5 ? 'x' : 'z';
      const dir = this.random() < 0.5 ? 1 : -1;
      const lines = axis === 'x' ? this.roadsZ : this.roadsX;
      const line = lines[Math.min(lines.length - 1, Math.floor(this.random() * lines.length))];
      const distance = SPAWN_MIN + this.random() * (SPAWN_MAX - SPAWN_MIN);
      const perp = laneCoord(line, axis, dir);

      let x;
      let z;
      if (axis === 'x') {
        x = clamp(px + dir * distance, this.roadsX[0] + 10, this.roadsX[this.roadsX.length - 1] - 10);
        z = perp;
      } else {
        x = perp;
        z = clamp(pz + dir * distance, this.roadsZ[0] + 10, this.roadsZ[this.roadsZ.length - 1] - 10);
      }

      const d = Math.hypot(x - px, z - pz);
      if (d < SPAWN_MIN_DIST) continue;

      let score = Math.min(d, 150);
      for (let i = 0; i < this.cars.length; i++) {
        const other = this.cars[i];
        if (other === ignore) continue;
        const gap = Math.hypot(other.x - x, other.z - z);
        if (gap < 12) score -= (12 - gap) * 14;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, axis, line, dir };
      }
    }

    return best || fallback;
  }

  // Two waypoints: the lane corner inside the crossing, then a point on the new lane.
  turnPath(ai, crossing, side) {
    const base = baseHeading(ai.axis, ai.dir);
    const fx = Math.sin(base);
    const fz = Math.cos(base);
    let nx;
    let nz;
    if (side === 'right') {
      nx = fz;
      nz = -fx;
    } else {
      nx = -fz;
      nz = fx;
    }

    const axis = Math.abs(nx) > 0.5 ? 'x' : 'z';
    const dir = axis === 'x' ? (nx > 0 ? 1 : -1) : (nz > 0 ? 1 : -1);
    const lane = laneCoord(crossing, axis, dir);

    const corner = axis === 'z'
      ? { x: lane, z: ai.lane }
      : { x: ai.lane, z: lane };

    // Keep the exit point inside the drivable road box: at grid edges the raw
    // 18-unit exit can land past the asphalt, which wedges the car.
    let exit;
    if (axis === 'x') {
      const ex = clamp(corner.x + dir * 18, ROAD_X0, ROAD_X1);
      exit = { x: ex, z: corner.z };
    } else {
      const ez = clamp(corner.z + dir * 18, ROAD_Z0, ROAD_Z1);
      exit = { x: corner.x, z: ez };
    }

    ai.route = { axis, line: crossing, dir, lane };
    return [corner, exit];
  }

  scan(car, px, pz, obstacles) {
    const ai = car.ai;
    ai.blocked = false;

    if (px !== null && aheadOf(car.x, car.z, car.heading, px, pz, SCAN_PLAYER, 3.0)) {
      ai.blocked = true;
    }

    if (obstacles) {
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (!o || typeof o.x !== 'number' || typeof o.z !== 'number') continue;
        if (aheadOf(car.x, car.z, car.heading, o.x, o.z, SCAN_OBSTACLE, 2.8)) {
          ai.blocked = true;
          break;
        }
      }
    }
  }

  // Pairwise: the car behind brakes when the gap closes, so queues form cleanly.
  separate() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        if (aheadOf(a.x, a.z, a.heading, b.x, b.z, a.ai.reach, SCAN_SIDE)) a.ai.blocked = true;
        if (aheadOf(b.x, b.z, b.heading, a.x, a.z, b.ai.reach, SCAN_SIDE)) b.ai.blocked = true;
        if (dx * dx + dz * dz >= SEPARATION * SEPARATION) continue;

        const fa = dx * Math.sin(a.heading) + dz * Math.cos(a.heading);
        const fb = -(dx * Math.sin(b.heading) + dz * Math.cos(b.heading));
        if (fa > 0.2) a.ai.blocked = true;
        if (fb > 0.2) b.ai.blocked = true;
      }
    }
  }

  // Decide the next crossing: straight, left or right, plus lane waypoints.
  plan(car) {
    const ai = car.ai;
    const along = ai.axis === 'x' ? car.x : car.z;

    if (ai.crossing === null) {
      ai.crossing = this.nextCrossing(ai.axis, along - ai.dir * 2, ai.dir);
    }
    if (ai.crossing === null) {
      // Dead end: no crossing ahead. Once the car is actually at the end of its
      // road line (and the cooldown has expired) swing it around onto the
      // opposite lane so it stops wedging in the junction behind it.
      const lines = ai.axis === 'x' ? this.roadsX : this.roadsZ;
      const endLine = ai.dir > 0 ? lines[lines.length - 1] : lines[0];
      const toEnd = (endLine - along) * ai.dir;
      if (toEnd <= 15 && ai.uturnCooldown <= 0) {
        ai.dir = -ai.dir;
        ai.lane = laneCoord(ai.line, ai.axis, ai.dir);
        ai.path = null;
        ai.route = null;
        ai.crossing = this.nextCrossing(ai.axis, along, ai.dir);
        ai.uturnCooldown = U_TURN_COOLDOWN;
        ai.stuck = 0;
      }
      return;
    }

    const remaining = (ai.crossing - along) * ai.dir;
    if (remaining < -3) {
      ai.crossing = this.nextCrossing(ai.axis, along, ai.dir);
      return;
    }
    if (remaining >= TURN_WINDOW) return;

    const lastOne = !this.hasCrossingAfter(ai.axis, ai.dir, ai.crossing);
    const roll = this.random();
    let side = null;
    if (!lastOne && roll < 0.5) side = null;
    else if (roll < (lastOne ? 0.5 : 0.75)) side = 'left';
    else side = 'right';

    if (side) {
      ai.path = this.turnPath(ai, ai.crossing, side);
    } else {
      ai.crossing = this.nextCrossing(ai.axis, ai.crossing + ai.dir * 2, ai.dir);
    }
  }

  drive(car) {
    const ai = car.ai;

    if (ai.path) {
      while (ai.path.length > 0) {
        const wp = ai.path[0];
        const dx = wp.x - car.x;
        const dz = wp.z - car.z;
        const dist = Math.hypot(dx, dz);
        const proj = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
        if (dist < 4.5 || (proj < -2 && dist < 10)) ai.path.shift();
        else break;
      }

      if (ai.path.length === 0) {
        const route = ai.route;
        if (route) {
          ai.axis = route.axis;
          ai.line = route.line;
          ai.dir = route.dir;
          ai.lane = route.lane;
        }
        ai.path = null;
        ai.route = null;
        const along = ai.axis === 'x' ? car.x : car.z;
        ai.crossing = this.nextCrossing(ai.axis, along, ai.dir);
      }
    } else {
      this.plan(car);
    }

    const along = ai.axis === 'x' ? car.x : car.z;
    let desired;
    let targetSpeed = ai.cruise;

    if (ai.path) {
      const wp = ai.path[0];
      desired = Math.atan2(wp.x - car.x, wp.z - car.z);
      targetSpeed = Math.min(targetSpeed, ai.turnSpeed);
    } else {
      const base = baseHeading(ai.axis, ai.dir);
      const perp = ai.axis === 'x' ? car.z : car.x;
      const rPerp = ai.axis === 'x' ? -Math.sin(base) : Math.cos(base);
      const correction = clamp((ai.lane - perp) * 0.09, -0.5, 0.5) * (rPerp > 0 ? 1 : -1);
      desired = base + correction;

      if (ai.crossing !== null && (ai.crossing - along) * ai.dir < SLOW_WINDOW) {
        targetSpeed = Math.min(targetSpeed, SLOW_SPEED);
      }
    }

    const error = wrapAngle(desired - car.heading);
    const steer = clamp(error * 2.1, -1, 1);
    if (Math.abs(error) > 0.7) targetSpeed = Math.min(targetSpeed, 4.6);
    if (ai.blocked) targetSpeed = 0;

    const speed = car.speed;
    let throttle = 0;
    let handbrake = false;

    if (targetSpeed < 0.4) {
      throttle = speed > 0.3 ? -1 : 0;
      if (speed < 0.1) handbrake = true;
    } else if (speed < targetSpeed - 0.6) {
      throttle = clamp((targetSpeed - speed) * 0.24 + 0.18, 0, 1);
    } else if (speed > targetSpeed + 1.2) {
      throttle = clamp(-(speed - targetSpeed) * 0.22, -1, 0);
    } else {
      throttle = 0.12;
    }

    ai.throttle = throttle;
    return { throttle, steer, handbrake };
  }

  respawn(car, playerPos) {
    const spot = this.pickSpawn(playerPos, car);
    this.setRoute(car, spot.axis, spot.line, spot.dir, spot.x, spot.z);
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
  }

  update(dt, playerPos, obstacles) {
    const px = playerPos && typeof playerPos.x === 'number' ? playerPos.x : null;
    const pz = playerPos && typeof playerPos.z === 'number' ? playerPos.z : null;
    const auto = px === null || pz === null;

    if (auto) {
      for (let i = 0; i < this.cars.length; i++) this.scan(this.cars[i], null, null, obstacles);
    } else {
      for (let i = 0; i < this.cars.length; i++) this.scan(this.cars[i], px, pz, obstacles);
      this.separate();
    }

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const input = this.drive(car);
      car.update(dt, input);

      const ai = car.ai;
      ai.uturnCooldown = Math.max(0, ai.uturnCooldown - (dt || 0));
      // A wedge: the car is commanding throttle but not moving. Waiting in a
      // queue (handbrake, throttle ~0) is normal and must not count as stuck.
      const wedged = Math.abs(ai.throttle) > 0.35 && Math.abs(car.speed) < 0.6;
      if (wedged) ai.stuck += dt || 0;
      else if (Math.abs(car.speed) > 1.2) ai.stuck = Math.max(0, ai.stuck - (dt || 0) * 2);

      if (ai.stuck > STUCK_LIMIT) {
        this.respawn(car, playerPos);
        ai.stuck = 0;
        ai.uturnCooldown = 0;
        continue;
      }

      if (px !== null && pz !== null) {
        const dx = car.x - px;
        const dz = car.z - pz;
        if (dx * dx + dz * dz > DESPAWN_RANGE * DESPAWN_RANGE) {
          this.respawn(car, playerPos);
        }
      }
    }

    return this.cars;
  }
}
