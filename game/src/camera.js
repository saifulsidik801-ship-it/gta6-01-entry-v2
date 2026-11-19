// MARISOL BAY - third-person orbit follow camera with smooth trailing.

import * as THREE from 'three';
import { CAMERA } from './config.js';

export function buildCamera(camera, domElement) {
  let yaw = Math.PI * 0.5;
  let pitch = CAMERA.pitch;
  let distance = CAMERA.distance;

  const wantedPos = new THREE.Vector3();
  const wantedTarget = new THREE.Vector3();
  const smoothTarget = new THREE.Vector3();
  const smoothPos = new THREE.Vector3();

  let initialised = false;

  function applyOrbit(dx, dy) {
    yaw -= dx * CAMERA.sensitivity;
    pitch += dy * CAMERA.sensitivity;
    if (pitch < CAMERA.minPitch) pitch = CAMERA.minPitch;
    if (pitch > CAMERA.maxPitch) pitch = CAMERA.maxPitch;
    yaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  }

  function applyZoom(steps) {
    if (!Number.isFinite(steps) || steps === 0) return;
    distance *= Math.pow(CAMERA.zoomStep, steps);
    distance = Math.max(CAMERA.minDistance, Math.min(CAMERA.maxDistance, distance));
  }

  function update(dt, target, sampleGround) {
    const groundY = sampleGround ? sampleGround(target.x, target.z) : 0;

    wantedTarget.set(target.x, target.y + CAMERA.targetHeight, target.z);

    const cosPitch = Math.cos(pitch);
    const offsetX = Math.sin(yaw) * cosPitch * distance;
    const offsetZ = Math.cos(yaw) * cosPitch * distance;
    const offsetY = Math.sin(pitch) * distance + 1.15;

    wantedPos.set(
      wantedTarget.x + offsetX,
      wantedTarget.y + offsetY,
      wantedTarget.z + offsetZ,
    );

    const floor = groundY + CAMERA.groundClearance;
    if (wantedPos.y < floor) wantedPos.y = floor;

    if (!initialised) {
      smoothTarget.copy(wantedTarget);
      smoothPos.copy(wantedPos);
      initialised = true;
    } else {
      const k = 1 - Math.exp(-CAMERA.lerp * dt);
      smoothTarget.lerp(wantedTarget, k);
      smoothPos.lerp(wantedPos, k);
      if (smoothPos.y < floor) smoothPos.y = floor;
    }

    camera.position.copy(smoothPos);
    camera.lookAt(smoothTarget);
  }

  function snap(target, sampleGround) {
    initialised = false;
    update(0.016, target, sampleGround);
  }

  function reset() {
    pitch = CAMERA.pitch;
    distance = CAMERA.distance;
  }

  return {
    update,
    snap,
    reset,
    applyOrbit,
    applyZoom,
    get yaw() {
      return yaw;
    },
    set yaw(v) {
      yaw = v;
    },
    get pitch() {
      return pitch;
    },
    get distance() {
      return distance;
    },
    camera,
    domElement,
  };
}
