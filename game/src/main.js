// MARISOL BAY - boot, renderer, sky, fixed-timestep loop.

import * as THREE from 'three';
import { WORLD, SPAWN, SKY, CAMERA, PLAYER, DEFAULTS } from './config.js';
import { buildWorld } from './world.js';
import { buildPlayer } from './player.js';
import { buildCamera } from './camera.js';
import { buildInput } from './input.js';
import { spawnParkedCars, Vehicle } from './vehicle.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';

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

const playerColliders = [];
const carObstacles = parkedCars.map((car) => ({ x: car.x, z: car.z }));

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

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
  get driving() {
    return driving;
  },
  shot: shot || DEFAULTS.shot,
  ready: false,
};

for (const el of ['hud', 'minimap', 'objective', 'wanted', 'start']) {
  const node = document.getElementById(el);
  if (node) window.MARISOL[el] = node;
}

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
const hudRoot = window.MARISOL.hud || null;
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
  const hw = car.car.width / 2;
  const hl = car.car.length / 2;
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
  const side = car.car.width / 2 + 1.15;
  const back = car.car.length / 2 + 1.1;
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

function syncCarObstacles() {
  for (let i = 0; i < carObstacles.length; i++) {
    carObstacles[i].x = parkedCars[i].x;
    carObstacles[i].z = parkedCars[i].z;
  }
}

function updateCameraTarget(dt) {
  if (driving) {
    if (!input.dragging) {
      let diff = driving.heading + Math.PI - cam.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cam.yaw += diff * Math.min(1, dt * 3.5);
    }
    cam.update(dt, driving.group.position, sampleGround);
  } else {
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
}

const FIXED_STEP = 1 / 60;
const MAX_STEPS = 5;
let accumulator = 0;
let last = performance.now() / 1000;
let frames = 0;
let elapsed = 0;

function step(dt) {
  const mouse = input.consumeMouse();
  if (mouse.dx !== 0 || mouse.dy !== 0) cam.applyOrbit(mouse.dx, mouse.dy);
  if (mouse.wheel !== 0) cam.applyZoom(mouse.wheel);

  const movement = input.readMovement();

  if (input.consumePress('interact')) {
    if (driving) exitCar();
    else {
      const car = nearestParkedCar();
      if (car) enterCar(car);
    }
  }

  if (driving) {
    driving.update(dt, driveInput(movement));
    syncCarObstacles();
  } else {
    player.update(dt, movement, cam.yaw, playerColliders);
  }

  traffic.update(dt, driving ? driving.group.position : player.position, carObstacles);
  pedestrians.update(dt);
  updateCameraTarget(dt);
  updateHud();
  world.update(dt);
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

  renderer.render(scene, camera);
  frames++;
  window.MARISOL.frames = frames;
  window.MARISOL.elapsed = elapsed;
  window.MARISOL.ready = true;
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
