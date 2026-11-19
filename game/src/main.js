// MARISOL BAY - boot, renderer, sky, fixed-timestep loop.

import * as THREE from 'three';
import { WORLD, SPAWN, SKY, CAMERA, PLAYER, DEFAULTS, TURF, TURF_INCOME_TICK, TURF_INCOME_PER_TICK } from './config.js';
import { buildWorld } from './world.js';
import { buildPlayer } from './player.js';
import { buildCamera } from './camera.js';
import { buildInput } from './input.js';
import { spawnParkedCars, Vehicle } from './vehicle.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Save } from './save.js';
import { Audio } from './audio.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
const sky = SKY.day;
scene.background = new THREE.Color(sky.top);
scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);

const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);

const hemi = new THREE.HemisphereLight(sky.hemiSky, sky.hemiGround, sky.hemiIntensity);
scene.add(hemi);

const sun = new THREE.DirectionalLight(sky.sun, sky.sunIntensity);
sun.position.set(-90, 120, 60);
sun.target.position.set(0, 0, 0);
scene.add(sun);
scene.add(sun.target);

const ambient = new THREE.AmbientLight(0xbcd6e8, 0.35);
scene.add(ambient);

const world = buildWorld(scene);
const player = buildPlayer(scene, SPAWN);
const input = buildInput(canvas);
const cam = buildCamera(camera, canvas);

const parkedCars = spawnParkedCars(scene, world);
const traffic = new Traffic(scene, world);
const pedestrians = new Pedestrians(scene, world);

let driving = null;
let cash = 1200;

const playerSnapshot = () => ({
  position: driving ? driving.group.position : player.position,
  driving: driving || false,
  speed: driving ? driving.speed : player.state.speed,
  heading: driving ? driving.heading : player.state.facing,
  facing: player.state.facing,
  camYaw: cam.yaw,
  vx: driving ? driving.vx : player.state.vx,
  vz: driving ? driving.vz : player.state.vz,
});

const effects = new Effects(scene);
const combat = new Combat(scene, pedestrians, effects);
const police = new Police(scene, world, playerSnapshot);

const playerColliders = [];
const carObstacles = parkedCars.map((car) => ({ x: car.x, z: car.z }));

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

// ------------------------------------------------------------------ time of day
const TOD_SUN_POS = {
  day: { x: -90, y: 120, z: 60 },
  dusk: { x: -170, y: 42, z: 120 },
  night: { x: 60, y: 90, z: -140 },
};

let timeOfDay = DEFAULTS.timeOfDay || 'day';

function setTimeOfDay(mode) {
  const key = SKY[mode] ? mode : 'day';
  const preset = SKY[key];
  timeOfDay = key;
  scene.background = new THREE.Color(preset.top);
  if (scene.fog) {
    scene.fog.color.setHex(preset.fog);
    scene.fog.near = preset.fogNear;
    scene.fog.far = preset.fogFar;
  } else {
    scene.fog = new THREE.Fog(preset.fog, preset.fogNear, preset.fogFar);
  }
  hemi.color.setHex(preset.hemiSky);
  hemi.groundColor.setHex(preset.hemiGround);
  hemi.intensity = preset.hemiIntensity;
  sun.color.setHex(preset.sun);
  sun.intensity = preset.sunIntensity;
  const pos = TOD_SUN_POS[key] || TOD_SUN_POS.day;
  sun.position.set(pos.x, pos.y, pos.z);
  ambient.intensity = key === 'night' ? 0.16 : key === 'dusk' ? 0.26 : 0.35;
  if (renderer) renderer.toneMappingExposure = key === 'night' ? 0.95 : 1.0;
  return key;
}

const save = new Save();
const audio = new Audio();

const missions = new Missions({
  player,
  police,
  combat,
  world,
  effects,
  get cash() {
    return cash;
  },
  set cash(v) {
    cash = v;
  },
  driving: () => driving,
});

let paused = false;
let hud = null;

missions.onTimeOfDay = (mode) => setTimeOfDay(mode);
missions.onEvent = (kind, data) => {
  if (!hud) return;
  switch (kind) {
    case 'mission-start': {
      if (audio.ctx) audio.setMusic(timeOfDay);
      hud.toast('MISSION \u2014 ' + data.title, 3.4);
      break;
    }
    case 'mission-stage':
      hud.toast('NEW OBJECTIVE', 2.2);
      break;
    case 'mission-complete':
      hud.toast('MISSION COMPLETE  +$' + data.reward, 4.5);
      audio.playJingle();
      autosave();
      break;
    case 'mission-fail':
      hud.toast('MISSION FAILED \u2014 ' + data.reason, 3.5);
      break;
    case 'locked':
      hud.toast('FINISH THE OTHER DISTRICTS FIRST', 3.2);
      break;
    case 'finale-unlocked':
      hud.toast('ALL SIX DISTRICTS TAKEN \u2014 THE FINALE IS OPEN', 5);
      audio.playJingle();
      break;
    case 'collect':
      hud.toast('CASH STASH ' + data.total + '/12  +$150', 3);
      audio.playPickup();
      break;
    case 'district':
      hud.toast(data.name.toUpperCase() + ' TAKEN OVER', 4);
      break;
    case 'taxi-start':
      hud.toast('TAXI FARE OFFERED', 3);
      break;
    case 'taxi-pickup':
      hud.toast('FARE PICKED UP \u2014 DRIVE TO THE DROP-OFF', 3.2);
      break;
    case 'taxi-complete':
      hud.toast('FARE PAID  +$' + data.cash, 3.2);
      audio.playPickup();
      break;
    case 'trial-start':
      hud.toast('TIME TRIAL STARTED', 3);
      break;
    case 'trial-complete':
      hud.toast('TIME TRIAL WON  +$' + data.cash, 3.4);
      audio.playJingle();
      break;
    case 'trial-fail':
      hud.toast('TIME TRIAL EXPIRED', 3);
      break;
    default:
      break;
  }
};

hud = new HUD({
  onStart: () => {
    input.setEnabled(true);
    combat._clickQueued = false;
    if (typeof combat._keyG === 'boolean') combat._keyG = false;
    audio.init();
    audio.setMusic(timeOfDay);
  },
  onPauseToggle: () => {
    paused = !paused;
    hud.setPaused(paused);
  },
});

function autosave() {
  const data = missions.serialize();
  data.cash = cash;
  data.settings = {
    volume: audio.volume,
    muted: audio.muted,
    minimap: hud.mapVisible,
  };
  save.save(data);
}

function applySave(data) {
  if (!data || typeof data !== 'object') return false;
  missions.apply(data);
  if (typeof data.cash === 'number' && isFinite(data.cash)) cash = data.cash;
  if (data.settings) {
    if (typeof data.settings.volume === 'number') audio.setVolume(data.settings.volume);
    if (data.settings.minimap === false) hud.setMinimap(false);
  }
  setTimeOfDay(timeOfDay);
  return true;
}

const loaded = save.load();
if (loaded) applySave(loaded);

window.MARISOL = {
  scene,
  renderer,
  camera,
  player,
  world,
  config: { WORLD, SPAWN, SKY, CAMERA, PLAYER },
  input,
  cam,
  Vehicle,
  parkedCars,
  traffic,
  pedestrians,
  police,
  combat,
  effects,
  missions,
  hud,
  save,
  audio,
  setTimeOfDay,
  lights: { hemi, sun, ambient },
  get timeOfDay() {
    return timeOfDay;
  },
  get driving() {
    return driving;
  },
  get cash() {
    return cash;
  },
  set cash(v) {
    cash = typeof v === 'number' && isFinite(v) ? v : cash;
  },
  get paused() {
    return paused;
  },
  shot: shot || DEFAULTS.shot,
  shotStage: null,
  ready: false,
  version: 'r4b',
};

window.MARISOL.dom = {};
for (const el of ['hud', 'minimap', 'objective', 'start']) {
  const node = document.getElementById(el);
  if (node) window.MARISOL.dom[el] = node;
}
window.MARISOL.hudRoot = document.getElementById('hud');
window.MARISOL.minimap = document.getElementById('minimap');
window.MARISOL.objective = document.getElementById('objective');
window.MARISOL.start = document.getElementById('start');

const hint = document.createElement('div');
hint.style.position = 'absolute';
hint.style.left = '50%';
hint.style.bottom = '92px';
hint.style.transform = 'translateX(-50%)';
hint.style.padding = '6px 14px';
hint.style.borderRadius = '6px';
hint.style.background = 'rgba(10, 18, 26, 0.42)';
hint.style.border = '1px solid rgba(255, 246, 229, 0.22)';
hint.style.font = '600 13px/1.3 "Trebuchet MS", "Segoe UI", sans-serif';
hint.style.letterSpacing = '0.08em';
hint.style.color = '#ffe9c9';
hint.style.textShadow = '0 1px 1px rgba(0, 0, 0, 0.6)';
hint.style.whiteSpace = 'nowrap';
hint.style.display = 'none';
const hudRoot = (hud && hud.root) || null;
if (hudRoot) hudRoot.appendChild(hint);

let hintText = null;

function setHint(text) {
  if (text === hintText) return;
  hintText = text;
  hint.textContent = text;
  hint.style.display = text ? 'block' : 'none';
}

function sampleGround(x, z) {
  let best = 0;
  const colliders = world.colliders;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.kind === 'building') continue;
    if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && c.height > best) {
      best = c.height;
    }
  }
  return best;
}

function carBox(car) {
  const spec = car.car || {};
  const width = typeof car.width === 'number' ? car.width : spec.width;
  const length = typeof car.length === 'number' ? car.length : spec.length;
  const hw = width / 2;
  const hl = length / 2;
  const c = Math.abs(Math.cos(car.heading));
  const s = Math.abs(Math.sin(car.heading));
  const ex = c * hw + s * hl;
  const ez = s * hw + c * hl;
  return {
    minX: car.x - ex,
    maxX: car.x + ex,
    minZ: car.z - ez,
    maxZ: car.z + ez,
    height: 1.35,
    kind: 'parked-car',
  };
}

function rebuildPlayerColliders() {
  playerColliders.length = 0;
  const base = world.colliders;
  for (let i = 0; i < base.length; i++) playerColliders.push(base[i]);
  for (let i = 0; i < parkedCars.length; i++) {
    const car = parkedCars[i];
    if (car === driving) continue;
    playerColliders.push(carBox(car));
  }
}

function nearestParkedCar() {
  const px = player.position.x;
  const pz = player.position.z;
  let best = null;
  let bestD2 = 3.5 * 3.5;
  for (let i = 0; i < parkedCars.length; i++) {
    const car = parkedCars[i];
    const dx = car.x - px;
    const dz = car.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = car;
    }
  }
  return best;
}

function enterCar(car) {
  driving = car;
  car.parked = false;
  car.handbrake = false;
  player.root.visible = false;
  car.colliders = world.colliders.slice();
  for (let i = 0; i < parkedCars.length; i++) {
    if (parkedCars[i] === car) continue;
    car.colliders.push(carBox(parkedCars[i]));
  }
  rebuildPlayerColliders();
  police.addHeat(1, 'grand-theft-auto');
}

function exitCar() {
  const car = driving;
  if (!car) return;
  driving = null;
  car.colliders = world.colliders;
  car.setPose(car.x, car.z, car.heading);
  car.parked = true;
  car.handbrake = true;
  rebuildPlayerColliders();

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  const side = (car.width || car.car.width) / 2 + 1.15;
  const back = (car.length || car.car.length) / 2 + 1.1;
  const candidates = [
    [car.x + rx * side, car.z + rz * side],
    [car.x - rx * side, car.z - rz * side],
    [car.x - fx * back, car.z - fz * back],
    [car.x + fx * back, car.z + fz * back],
  ];
  let px = candidates[0][0];
  let pz = candidates[0][1];
  for (let i = 0; i < candidates.length; i++) {
    const cx = candidates[i][0];
    const cz = candidates[i][1];
    let free = cx > WORLD.minX + 1.5 && cx < WORLD.maxX - 1.5;
    free = free && cz > WORLD.minZ + 1.5 && cz < WORLD.maxZ - 1.5;
    if (free) {
      const r = PLAYER.radius + 0.15;
      for (let k = 0; k < playerColliders.length; k++) {
        const c = playerColliders[k];
        if (cx > c.minX - r && cx < c.maxX + r && cz > c.minZ - r && cz < c.maxZ + r) {
          free = false;
          break;
        }
      }
    }
    if (free) {
      px = cx;
      pz = cz;
      break;
    }
  }
  player.setPosition(px, sampleGround(px, pz), pz);
  player.state.facing = car.heading;
  player.root.visible = true;
  cam.yaw = car.heading + Math.PI;
}

rebuildPlayerColliders();

cam.yaw = -Math.PI * 0.5;
cam.snap(player.position, sampleGround);

let shotStage = null;

function buildShotContext() {
  return {
    scene,
    renderer,
    camera,
    cam,
    player,
    world,
    input,
    parkedCars,
    traffic,
    pedestrians,
    police,
    combat,
    effects,
    missions,
    hud,
    config: { WORLD, SPAWN, SKY, CAMERA, PLAYER },
    setTimeOfDay,
    enterCar,
    sampleGround,
    lights: { hemi, sun, ambient },
    get driving() {
      return driving;
    },
    get cash() {
      return cash;
    },
    set cash(v) {
      cash = typeof v === 'number' && isFinite(v) ? v : cash;
    },
  };
}

function stageShot() {
  if (!shot) return false;
  const ctx = buildShotContext();
  shotStage = applyShot(shot, ctx);
  if (!shotStage) return false;
  window.MARISOL.shotStage = shotStage;

  hud.started = true;
  hud.playing = true;
  hud.paused = false;
  if (hud.startOverlay) {
    hud.startOverlay.classList.add('hidden');
    hud.startOverlay.style.display = 'none';
  }
  input.setEnabled(true);
  combat._clickQueued = false;
  if (typeof combat._keyG === 'boolean') combat._keyG = false;

  rebuildPlayerColliders();
  cam.snap(driving ? driving.group.position : player.position, sampleGround);
  updateCameraTarget(0.016);
  updateHud();
  hud.update(0.016, buildHudSnapshot());
  return true;
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = h > 0 ? w / h : 1;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

function driveInput(movement) {
  const throttle = (movement.forward ? 1 : 0) - (movement.back ? 1 : 0);
  const steer = (movement.right ? 1 : 0) - (movement.left ? 1 : 0);
  const handbrake = movement.jump;
  return { throttle, steer, handbrake };
}

function shotDriveInput() {
  const target = (shotStage && shotStage.targetSpeed) || 0;
  const speed = driving ? driving.speed : 0;
  let throttle;
  if (speed < target - 0.8) throttle = Math.min(1, (target - speed) * 0.22 + 0.3);
  else if (speed > target + 1.2) throttle = Math.max(-1, -(speed - target) * 0.25);
  else throttle = 0.12;
  return { throttle, steer: 0, handbrake: false };
}

function syncCarObstacles() {
  for (let i = 0; i < carObstacles.length; i++) {
    carObstacles[i].x = parkedCars[i].x;
    carObstacles[i].z = parkedCars[i].z;
  }
}

function updateCameraTarget(dt) {
  if (driving) {
    if (!input.dragging && !(shotStage && shotStage.lockCamera)) {
      let diff = driving.heading + Math.PI - cam.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cam.yaw += diff * Math.min(1, dt * 3.5);
    }
    if (typeof cam.setShoulder === 'function') cam.setShoulder(0);
    cam.update(dt, driving.group.position, sampleGround);
  } else {
    const shoulder = shotStage ? 0 : CAMERA.shoulderOffset || 0;
    if (typeof cam.setShoulder === 'function') cam.setShoulder(shoulder);
    cam.update(dt, player.position, sampleGround);
  }
}

function updateHud() {
  if (driving) {
    const kmh = Math.round(Math.abs(driving.speed) * 3.6);
    setHint('E - Exit car    ' + kmh + ' km/h');
  } else {
    setHint(nearestParkedCar() ? 'E - Enter car' : '');
  }
  updateTurfIncome();
}

// The turf income ticker lives outside #hud so it survives HUD re-renders: it simply
// reports what the owned districts pay per tick and the current district count.
const turfIncomeEl = document.getElementById('turf-income');
let turfIncomeText = '';

function updateTurfIncome() {
  if (!turfIncomeEl) return;
  const owned = missions.turfCount();
  const perTick = owned * TURF_INCOME_PER_TICK;
  const text = '$' + perTick + ' / ' + TURF_INCOME_TICK + 's  \u00b7  ' + owned + '/' + TURF.districtCount;
  if (text === turfIncomeText) return;
  turfIncomeText = text;
  const cashEl = turfIncomeEl.querySelector('.turf-cash');
  if (cashEl) cashEl.textContent = text;
  else turfIncomeEl.textContent = text;
}

function districtNameAt(x, z) {
  return world.districtAt(x, z) || '';
}

function buildHudSnapshot() {
  const pos = driving ? driving.group.position : player.position;
  const heading = driving ? driving.heading : player.state.facing;
  const speed = driving ? driving.speed : player.state.speed;

  const policePositions = [];
  for (let i = 0; i < police.cruisers.length; i++) {
    policePositions.push({ x: police.cruisers[i].vehicle.x, z: police.cruisers[i].vehicle.z });
  }
  for (let i = 0; i < police.cops.length; i++) {
    policePositions.push({ x: police.cops[i].x, z: police.cops[i].z });
  }

  const trafficPositions = [];
  for (let i = 0; i < traffic.cars.length; i++) {
    trafficPositions.push({ x: traffic.cars[i].x, z: traffic.cars[i].z });
  }

  return {
    wanted: police.getWanted(),
    cash,
    health: combat.state.health,
    ammo: combat.state.ammo,
    speed,
    driving: !!driving,
    objective: missions.getCurrentObjective(),
    turf: missions.getTurf(),
    districtsTaken: missions.turfCount(),
    playerPos: { x: pos.x, z: pos.z },
    heading,
    missionMarker: missions.getMarker(),
    policePositions,
    trafficPositions,
    district: districtNameAt(pos.x, pos.z),
    missions: missions.getMissions(),
  };
}

function respawnPlayer(options = {}) {
  const car = driving;
  if (car) {
    driving = null;
    car.colliders = world.colliders;
    car.setPose(car.x, car.z, car.heading);
    car.parked = true;
    car.handbrake = true;
  }
  player.root.visible = true;
  player.setPosition(SPAWN.x, sampleGround(SPAWN.x, SPAWN.z), SPAWN.z);
  player.state.facing = SPAWN.facing;
  player.state.vx = 0;
  player.state.vz = 0;
  combat.state.health = 100;
  combat.state.damageT = 99;
  rebuildPlayerColliders();
  cam.yaw = SPAWN.facing + Math.PI;
  cam.snap(player.position, sampleGround);
  if (options.clearWanted) {
    police.setWanted(0);
    police.clear();
  }
}

police.onBusted = ({ fine = 0 } = {}) => {
  cash = Math.max(0, cash - (fine || 0));
  respawnPlayer();
};

combat.onDeath = ({ cash: loss = 0 } = {}) => {
  cash = Math.max(0, cash - (loss || 0));
  respawnPlayer({ clearWanted: true });
};

combat.onShoot = () => {
  police.addHeat(1, 'shooting');
  audio.playShot();
  missions.notify('shot');
};

combat.onPunch = (hit) => {
  if (hit) {
    audio.playPunch();
    missions.notify('punch');
  }
};

combat.onHitCop = () => {
  police.addHeat(1, 'assaulting-officer');
  missions.notify('hitCop');
};

combat.onHitPed = () => {
  police.addHeat(1, 'assault');
  missions.notify('hitPed');
};

let effectsTimer = 0;
let exhaustTimer = 0;
let skidTimer = 0;
let wasGrounded = true;

function updateEffects(dt, movement) {
  effectsTimer += dt;

  if (driving) {
    if (driving.collided && effectsTimer > 0.35) {
      effectsTimer = 0;
      effects.spawnBurst(
        { x: driving.x, y: 0.7, z: driving.z }, 'impact', 8,
      );
    }

    exhaustTimer += dt;
    if (exhaustTimer > 0.16) {
      exhaustTimer = 0;
      const fx = Math.sin(driving.heading);
      const fz = Math.cos(driving.heading);
      const back = (driving.length || 4.6) / 2;
      effects.spawnBurst(
        { x: driving.x - fx * back, y: 0.45, z: driving.z - fz * back },
        'exhaust', 1,
      );
    }

    skidTimer += dt;
    const sliding = movement.jump || Math.abs(driving.steerVisual) > 0.75;
    if (sliding && Math.abs(driving.speed) > 7 && skidTimer > 0.07) {
      skidTimer = 0;
      audio.playSkid();
      const side = (driving.width || 1.92) / 2;
      const rx = Math.cos(driving.heading);
      const rz = -Math.sin(driving.heading);
      effects.spawnBurst(
        { x: driving.x - rx * side, y: 0.15, z: driving.z - rz * side }, 'skid', 1,
      );
      effects.spawnBurst(
        { x: driving.x + rx * side, y: 0.15, z: driving.z + rz * side }, 'skid', 1,
      );
    }
  } else {
    const grounded = player.state.grounded;
    if (grounded && !wasGrounded) {
      effects.spawnBurst(
        { x: player.position.x, y: 0.14, z: player.position.z }, 'dust', 8,
      );
    }
    wasGrounded = grounded;
  }

  effects.update(dt);
}

let crimeTick = 0;

function updateCrime(dt) {
  crimeTick += dt;
  if (crimeTick < 0.12) return;
  const elapsedTick = crimeTick;
  crimeTick = 0;

  const peds = pedestrians.peds;
  for (let i = 0; i < traffic.cars.length; i++) {
    const car = traffic.cars[i];
    if (car.heatCd > 0) car.heatCd = Math.max(0, car.heatCd - elapsedTick);
  }
  for (let i = 0; i < peds.length; i++) {
    if (peds[i].heatCd > 0) peds[i].heatCd = Math.max(0, peds[i].heatCd - elapsedTick);
  }

  if (!driving || Math.abs(driving.speed) < 4) return;

  const dx0 = driving.x;
  const dz0 = driving.z;
  const speed = Math.abs(driving.speed);

  for (let i = 0; i < traffic.cars.length; i++) {
    const other = traffic.cars[i];
    if (other.heatCd > 0) continue;
    const dx = other.x - dx0;
    const dz = other.z - dz0;
    if (dx * dx + dz * dz > 4.2 * 4.2) continue;
    other.heatCd = 4;
    police.addHeat(1, 'traffic-impact');
    effects.spawnBurst({ x: other.x, y: 0.8, z: other.z }, 'impact', 6);
  }

  for (let i = 0; i < peds.length; i++) {
    const ped = peds[i];
    if (ped.heatCd > 0) continue;
    const dx = ped.x - dx0;
    const dz = ped.z - dz0;
    if (dx * dx + dz * dz > 2.6 * 2.6) continue;
    ped.heatCd = 4;
    police.addHeat(1, 'hit-pedestrian');
    if (pedestrians.scare) pedestrians.scare(ped.x, ped.z, 14, 3);
    if (speed > 6) {
      effects.spawnBurst({ x: ped.x, y: 1.0, z: ped.z }, 'dust', 6);
    }
  }
}

const FIXED_STEP = 1 / 60;
const MAX_STEPS = 5;
let accumulator = 0;
let last = performance.now() / 1000;
let frames = 0;
let elapsed = 0;
let autosaveTimer = 0;

function startNextMission() {
  if (missions.isMissionActive) return;
  const next = missions.nextMission();
  if (!next) {
    hud.toast('ALL STORY JOBS COMPLETE', 3);
    return;
  }
  if (missions.startMission(next.id)) {
    hud.toast('BRIEFING \u2014 ' + next.title, 3.2);
  }
}

function step(dt) {
  const active = hud.started && !paused;

  const mouse = input.consumeMouse();
  if (active && !shotStage) {
    if (mouse.dx !== 0 || mouse.dy !== 0) cam.applyOrbit(mouse.dx, mouse.dy);
    if (mouse.wheel !== 0) cam.applyZoom(mouse.wheel);
  }

  const movement = active
    ? (shotStage ? shotStage.movement : input.readMovement())
    : { forward: false, back: false, left: false, right: false, run: false, jump: false };

  if (active && !shotStage && input.consumePress('interact')) {
    if (driving) exitCar();
    else {
      const car = nearestParkedCar();
      if (car) enterCar(car);
    }
  }

  if (active) {
    if (driving) {
      driving.update(dt, shotStage ? shotDriveInput() : driveInput(movement));
      syncCarObstacles();
    } else {
      player.update(dt, movement, cam.yaw, playerColliders);
    }
  }

  traffic.update(dt, driving ? driving.group.position : player.position, carObstacles);
  pedestrians.update(dt);

  const snapshot = playerSnapshot();
  if (active) combat.update(dt, input, snapshot, police);
  police.update(dt);
  if (active) {
    updateCrime(dt);
    missions.update(dt);
  }
  if (shotStage && shotStage.tick) shotStage.tick(dt);
  updateEffects(dt, movement);

  updateCameraTarget(dt);
  updateHud();
  world.update(dt);

  hud.update(dt, buildHudSnapshot());
}

function frame() {
  const now = performance.now() / 1000;
  let delta = now - last;
  last = now;
  if (delta > 0.25) delta = 0.25;
  elapsed += delta;

  accumulator += delta;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < MAX_STEPS) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps++;
  }
  if (steps === MAX_STEPS) accumulator = 0;

  if (hud.started && !paused) {
    const speed = driving ? Math.abs(driving.speed) : 0;
    const maxSpeed = 28;
    audio.setEngine(driving ? Math.min(1, speed / maxSpeed) : 0);
    audio.playSiren(police.getWanted() > 0 && !audio.muted);
    autosaveTimer += delta;
    if (autosaveTimer >= 30) {
      autosaveTimer = 0;
      if (!shot) autosave();
    }
  } else {
    audio.setEngine(0);
  }

  renderer.render(scene, camera);
  frames++;
  window.MARISOL.frames = frames;
  window.MARISOL.elapsed = elapsed;
  window.MARISOL.ready = true;
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyM') {
    audio.toggleMute();
    hud.toast(audio.muted ? 'AUDIO MUTED' : 'AUDIO ON', 1.6);
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!hud.started) return;
    paused = !paused;
    hud.setPaused(paused);
    if (paused) autosave();
  } else if (e.code === 'KeyJ') {
    if (!hud.started) return;
    startNextMission();
  } else if (e.code === 'KeyH') {
    hud.toggleMissions();
  } else if (e.code === 'Tab') {
    e.preventDefault();
    const pos = driving ? driving.group.position : player.position;
    hud.toast((world.districtAt(pos.x, pos.z) || 'MARISOL BAY').toUpperCase(), 1.8);
  } else if (e.code === 'KeyC') {
    if (!driving) return;
    if (typeof audio.playHorn === 'function') audio.playHorn();
    else if (typeof audio.playPickup === 'function') audio.playPickup();
  }
});

audio.arm();
input.setEnabled(false);

// Drop into the pause menu whenever the tab loses focus, so a stray keypress or a
// minimised window cannot keep Milo walking into traffic. Screenshot scenes and the
// un-started start screen are left alone, and focus return never auto-resumes.
function pauseForFocusLoss() {
  if (shot || shotStage) return;
  if (!hud || !hud.started) return;
  if (paused) return;
  paused = true;
  hud.setPaused(true);
  autosave();
}

window.addEventListener('blur', pauseForFocusLoss);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForFocusLoss();
});

if (shot) {
  try {
    if (!stageShot()) console.warn('shot: unknown scene "' + shot + '"');
  } catch (err) {
    console.error('shot: staging failed', err);
  }
}

requestAnimationFrame(frame);
