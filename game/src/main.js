// MARISOL BAY - boot, renderer, sky, fixed-timestep loop.

import * as THREE from 'three';
import { WORLD, SPAWN, SKY, CAMERA, PLAYER, DEFAULTS } from './config.js';
import { buildWorld } from './world.js';
import { buildPlayer } from './player.js';
import { buildCamera } from './camera.js';
import { buildInput } from './input.js';

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
  shot: shot || DEFAULTS.shot,
  ready: false,
};

for (const el of ['hud', 'minimap', 'objective', 'wanted', 'start']) {
  const node = document.getElementById(el);
  if (node) window.MARISOL[el] = node;
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
  player.update(dt, movement, cam.yaw, world.colliders);
  cam.update(dt, player.position, sampleGround);
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
