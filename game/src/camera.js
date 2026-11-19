// MARISOL BAY - third-person orbit follow camera with smooth trailing.

import * as THREE from 'three';
import { CAMERA } from './config.js';

export function buildCamera(camera, domElement) {
  let yaw = Math.PI * 0.5;
  let pitch = CAMERA.pitch;
  let distance = CAMERA.distance;
  let shoulder = 0;
  let shoulderSmooth = 0;

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

  // On-foot shoulder framing: shifts the rig sideways without moving the aim point
  // fully, so Milo sits off-centre and the street ahead stays readable.
  function setShoulder(amount) {
    const v = Number.isFinite(amount) ? amount : 0;
    shoulder = Math.max(-2, Math.min(2, v));
  }

  function update(dt, target, sampleGround) {
    const groundY = sampleGround ? sampleGround(target.x, target.z) : 0;

    wantedTarget.set(target.x, target.y + CAMERA.targetHeight, target.z);

    // Ease the shoulder offset so entering/leaving a car does not jerk the frame.
    if (initialised) {
      shoulderSmooth += (shoulder - shoulderSmooth) * (1 - Math.exp(-CAMERA.shoulderLerp * dt));
    } else {
      shoulderSmooth = shoulder;
    }

    const cosPitch = Math.cos(pitch);
    const offsetX = Math.sin(yaw) * cosPitch * distance;
    const offsetZ = Math.cos(yaw) * cosPitch * distance;
    const offsetY = Math.sin(pitch) * distance + 1.15;

    // Camera-right vector for the shoulder framing (perpendicular to the orbit yaw).
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    wantedPos.set(
      wantedTarget.x + offsetX + rightX * shoulderSmooth,
      wantedTarget.y + offsetY,
      wantedTarget.z + offsetZ + rightZ * shoulderSmooth,
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
      // A respawn or vehicle teleport should not be smeared across the city.
      if (smoothPos.distanceTo(wantedPos) > CAMERA.snapDistance) {
        smoothPos.copy(wantedPos);
        smoothTarget.copy(wantedTarget);
      }
    }

    camera.position.copy(smoothPos);
    camera.lookAt(smoothTarget);
  }

  function snap(target, sampleGround) {
    initialised = false;
    update(0.016, target, sampleGround);
  }

  function setDistance(v) {
    if (!Number.isFinite(v)) return;
    distance = Math.max(CAMERA.minDistance, Math.min(CAMERA.maxDistance, v));
  }

  function setPitch(v) {
    if (!Number.isFinite(v)) return;
    pitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, v));
  }

  function reset() {
    pitch = CAMERA.pitch;
    distance = CAMERA.distance;
    shoulder = 0;
    shoulderSmooth = 0;
  }

  return {
    update,
    snap,
    reset,
    applyOrbit,
    applyZoom,
    setShoulder,
    setDistance,
    setPitch,
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
