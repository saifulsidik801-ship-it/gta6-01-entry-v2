// MARISOL BAY - police helicopter (R9).
// One low-poly air unit that spawns at wanted >= 3, orbits the player with
// a lagging searchlight, and leaves (with a 2 s hysteresis) when the heat
// drops. Numbers follow the tested heli/radio spec: orbit radius 26 m,
// height 20 m, 0.45 rad/s, bank 0.28 rad, spotlight #fff6c0.
// No allocations per frame: scratch vectors are reused.

import * as THREE from 'three';

export const HELI_CONFIG = {
  triggerWanted: 3,
  leaveDelaySec: 2.0,
  orbitRadius: 26,
  orbitHeight: 20,
  orbitSpeed: 0.45,
  arriveSpeed: 26,
  bankAngle: 0.28,
  rotorSpeed: 28,
  spotlight: {
    color: 0xfff6c0,
    intensity: 900,
    distance: 90,
    angle: 0.32,
    penumbra: 0.45,
    decay: 1.2,
  },
  groundPoolRadius: 5.5,
};

const DOWN = new THREE.Vector3(0, -1, 0);

function lam(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export class PoliceHeli {
  constructor(scene, config = HELI_CONFIG) {
    this.scene = scene || null;
    this.cfg = config;
    this.state = 'hidden';
    this.visible = false;
    this.angle = Math.PI * 0.75;
    this.orbitSpeed = config.orbitSpeed;
    this.leaveT = 0;
    this.time = 0;
    this.distance = 0;

    this._orbit = new THREE.Vector3();
    this._spotTarget = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    const white = lam(0xf2f4f6);
    const navy = lam(0x1d2f4d);
    const glass = lam(0x16283c);
    const dark = lam(0x3a4048);
    const yellow = lam(0xffc93c);

    const group = new THREE.Group();
    group.name = 'police-heli';
    // Nose faces +z.
    group.add(box(1.6, 1.5, 4.2, white, 0, 0, 0));
    group.add(box(1.62, 0.42, 4.0, navy, 0, -0.55, 0));
    group.add(box(1.4, 0.9, 1.8, glass, 0, 0.35, 1.35));
    group.add(box(0.5, 0.3, 0.7, white, 0, 0.1, 2.25));
    // Tail boom + fin.
    group.add(box(0.35, 0.35, 3.5, white, 0, 0.15, -3.6));
    group.add(box(0.35, 0.1, 3.4, navy, 0, -0.06, -3.6));
    group.add(box(0.12, 1.1, 0.9, navy, 0, 0.55, -5.2));
    // Skids.
    group.add(box(0.08, 0.08, 3.0, dark, -0.7, -0.95, 0.2));
    group.add(box(0.08, 0.08, 3.0, dark, 0.7, -0.95, 0.2));
    group.add(box(0.08, 0.5, 0.08, dark, -0.7, -0.7, 0.9));
    group.add(box(0.08, 0.5, 0.08, dark, 0.7, -0.7, 0.9));
    group.add(box(0.08, 0.5, 0.08, dark, -0.7, -0.7, -0.9));
    group.add(box(0.08, 0.5, 0.08, dark, 0.7, -0.7, -0.9));
    // Searchlight housing under the nose.
    group.add(box(0.35, 0.3, 0.35, dark, 0, -0.85, 1.9));

    // Rotor mast + main rotor (spins around Y) + blur disc.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), dark);
    mast.position.set(0, 0.95, 0);
    group.add(mast);
    const rotor = new THREE.Group();
    rotor.position.set(0, 1.22, 0);
    rotor.add(box(8.5, 0.06, 0.28, dark, 0, 0, 0));
    rotor.add(box(0.28, 0.06, 8.5, dark, 0, 0, 0));
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(4.25, 28),
      new THREE.MeshBasicMaterial({
        color: 0xdfe8ee, transparent: true, opacity: 0.1,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    rotor.add(disc);
    group.add(rotor);
    this.rotor = rotor;

    // Tail rotor (spins around X, disc in the YZ plane).
    const tailRotor = new THREE.Group();
    tailRotor.position.set(0.24, 0.35, -5.25);
    tailRotor.add(box(0.06, 1.2, 0.16, dark, 0, 0, 0));
    tailRotor.add(box(0.06, 0.16, 1.2, dark, 0, 0, 0));
    group.add(tailRotor);
    this.tailRotor = tailRotor;

    // Strobes (emissive only, no lights) + nav lights.
    this.strobeRed = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2a1e }),
    );
    this.strobeRed.position.set(-0.5, -0.75, -0.4);
    group.add(this.strobeRed);
    this.strobeBlue = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x2a6bff }),
    );
    this.strobeBlue.position.set(0.5, -0.75, -0.4);
    group.add(this.strobeBlue);
    const navL = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }),
    );
    navL.position.set(-0.82, -0.6, 0);
    group.add(navL);
    const navR = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0x44ff88 }),
    );
    navR.position.set(0.82, -0.6, 0);
    group.add(navR);
    // Yellow stripe decal on the fuselage side.
    group.add(box(1.62, 0.18, 2.4, yellow, 0, 0.15, -0.4));

    group.visible = false;
    if (scene && scene.add) scene.add(group);
    this.group = group;

    // Searchlight cone: cylinder geometry translated so its top (apex) sits
    // at the origin and it extends down -Y; scaled per frame to the target.
    const coneGeo = new THREE.CylinderGeometry(0.35, 4.6, 1, 20, 1, true);
    coneGeo.translate(0, -0.5, 0);
    this.cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: 0xfff6c0, transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.cone.visible = false;
    if (scene && scene.add) scene.add(this.cone);

    // Ground pool of light under the searchlight target.
    this.pool = new THREE.Mesh(
      new THREE.CircleGeometry(config.groundPoolRadius, 24),
      new THREE.MeshBasicMaterial({
        color: 0xfff6c0, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.06;
    this.pool.visible = false;
    if (scene && scene.add) scene.add(this.pool);

    // Real spotlight (one per heli, never casts shadows).
    const sp = config.spotlight;
    this.light = new THREE.SpotLight(sp.color, sp.intensity, sp.distance, sp.angle, sp.penumbra, sp.decay);
    this.light.castShadow = false;
    this.lightTarget = new THREE.Object3D();
    this.light.target = this.lightTarget;
    this.light.visible = false;
    if (scene && scene.add) {
      scene.add(this.light);
      scene.add(this.lightTarget);
    }
  }

  _setVisible(v) {
    this.visible = v;
    this.group.visible = v;
    this.cone.visible = v;
    this.pool.visible = v;
    this.light.visible = v;
  }

  spawn(playerPos) {
    if (this.state !== 'hidden' || !playerPos) return;
    // Appear far away and fly in — never pop in overhead.
    const a = this.angle;
    this.group.position.set(
      playerPos.x + Math.cos(a) * 120,
      60,
      playerPos.z + Math.sin(a) * 120,
    );
    this._spotTarget.set(playerPos.x, 0, playerPos.z);
    this.state = 'arriving';
    this.leaveT = 0;
    this._setVisible(true);
  }

  despawn() {
    if (this.state === 'hidden' || this.state === 'leaving') return;
    this.state = 'leaving';
    this.leaveT = 0;
  }

  // Snap the heli into a stable orbit slot for a screenshot: it stays there
  // (slow orbit) instead of flying in from 120 m away.
  placeForShot(playerPos, angle = -Math.PI / 2 + 0.35, radius = 34, height = 24, speed = 0.12) {
    if (!playerPos) return;
    this.angle = angle;
    this.orbitSpeed = speed;
    this._shotRadius = radius;
    this._shotHeight = height;
    this._orbit.set(
      playerPos.x + Math.cos(angle) * radius,
      height,
      playerPos.z + Math.sin(angle) * radius,
    );
    this.group.position.copy(this._orbit);
    this._spotTarget.set(playerPos.x, 0, playerPos.z);
    this.state = 'orbiting';
    this.leaveT = 0;
    this._setVisible(true);
  }

  update(dt, playerPos, wanted) {
    if (!playerPos) return;
    const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0;
    this.time += step;
    const cfg = this.cfg;

    if (this.state === 'hidden') {
      if (wanted >= cfg.triggerWanted) this.spawn(playerPos);
      return;
    }

    if (wanted >= cfg.triggerWanted) {
      this.leaveT = 0;
      if (this.state === 'leaving') this.state = 'orbiting';
    } else {
      this.leaveT += step;
      if (this.leaveT >= cfg.leaveDelaySec && this.state !== 'leaving') {
        this.state = 'leaving';
      }
    }

    // Orbit slot follows the player right now; the heli chases the slot.
    this.angle += this.orbitSpeed * step;
    const radius = this.state === 'orbiting' && this._shotRadius ? this._shotRadius : cfg.orbitRadius;
    const height = this.state === 'orbiting' && this._shotHeight ? this._shotHeight : cfg.orbitHeight;
    // Bob gently so the hover never reads as a statue.
    const bob = Math.sin(this.time * 2.1) * 1.2;
    const sway = Math.sin(this.time * 1.3) * 1.5;
    this._orbit.set(
      playerPos.x + Math.cos(this.angle) * (radius + sway),
      height + bob,
      playerPos.z + Math.sin(this.angle) * (radius + sway),
    );

    const pos = this.group.position;
    if (this.state === 'arriving') {
      this._tmp.copy(this._orbit).sub(pos);
      const d = this._tmp.length();
      if (d < 6) {
        this.state = 'orbiting';
      } else {
        this._tmp.normalize();
        const move = Math.min(d, cfg.arriveSpeed * step);
        pos.addScaledVector(this._tmp, move);
      }
    } else if (this.state === 'leaving') {
      pos.y += 26 * step;
      this._tmp.set(pos.x - playerPos.x, 0, pos.z - playerPos.z);
      if (this._tmp.lengthSq() < 1) this._tmp.set(1, 0, 0);
      this._tmp.normalize();
      pos.addScaledVector(this._tmp, 30 * step);
      if (pos.y > 90) {
        this.state = 'hidden';
        this._setVisible(false);
        return;
      }
    } else {
      // Orbiting: chase the slot with a lag so the follow reads as flight.
      pos.lerp(this._orbit, Math.min(1, step * 2.5));
    }

    // Face along the orbit tangent and bank into the turn.
    const tx = -Math.sin(this.angle);
    const tz = Math.cos(this.angle);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = Math.atan2(tx, tz);
    this.group.rotation.z = cfg.bankAngle;
    this.group.rotation.x = 0;

    // Rotors always spin while visible.
    this.rotor.rotation.y += cfg.rotorSpeed * step;
    this.tailRotor.rotation.x += cfg.rotorSpeed * 1.4 * step;

    // Strobes alternate red / blue.
    const phase = Math.sin(this.time * 6) > 0;
    this.strobeRed.material.color.setHex(phase ? 0xff2a1e : 0x551009);
    this.strobeBlue.material.color.setHex(phase ? 0x0a1a55 : 0x2a6bff);

    // Searchlight target lags the player — it chases, never snaps.
    this._spotTarget.lerp(this._tmp.set(playerPos.x, 0, playerPos.z), Math.min(1, step * 4));
    this.distance = Math.round(Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z));

    // Cone from the heli belly to the target.
    this._dir.copy(this._spotTarget).sub(pos);
    const len = Math.max(1, this._dir.length());
    this.cone.position.copy(pos);
    this.cone.position.y -= 0.9;
    this.cone.quaternion.setFromUnitVectors(DOWN, this._dir.normalize());
    this.cone.scale.set(1, len, 1);
    // Fade the cone out while leaving.
    this.cone.material.opacity = this.state === 'leaving' ? 0.03 : 0.07;

    // Pool of light on the ground under the target.
    this.pool.position.set(this._spotTarget.x, 0.06, this._spotTarget.z);
    this.pool.material.opacity = this.state === 'leaving' ? 0.12 : 0.35;

    // Real spotlight follows the same lagged target.
    this.light.position.copy(pos);
    this.light.position.y -= 0.9;
    this.lightTarget.position.copy(this._spotTarget);
  }

  dispose() {
    if (!this.scene) return;
    this.scene.remove(this.group);
    this.scene.remove(this.cone);
    this.scene.remove(this.pool);
    this.scene.remove(this.light);
    this.scene.remove(this.lightTarget);
  }
}
