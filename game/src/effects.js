// MARISOL BAY - pooled particle effects: skid puffs, exhaust smoke, muzzle
// flash, sparks, landing dust and collision impacts. One THREE.Points object,
// no textures, hard cap on live points so the sim never grows unbounded.

import * as THREE from 'three';

const MAX_POINTS = 600;

const PRESETS = {
  skid: {
    count: 2,
    life: [0.35, 0.8],
    speed: [0.4, 1.3],
    lift: [0.15, 0.7],
    spread: 1.7,
    gravity: -0.5,
    drag: 2.2,
    colors: [0xd8d4c6, 0xc3bfb0, 0xb3ae9f],
  },
  exhaust: {
    count: 1,
    life: [0.55, 1.15],
    speed: [0.15, 0.5],
    lift: [0.4, 1.1],
    spread: 0.5,
    gravity: 0.5,
    drag: 1.1,
    colors: [0x9aa1a6, 0xb4b9bc, 0x8b9296],
  },
  muzzle: {
    count: 7,
    life: [0.07, 0.16],
    speed: [3.5, 9],
    lift: [0.3, 1.4],
    spread: 0.55,
    gravity: 0,
    drag: 7,
    colors: [0xfff3ba, 0xffd257, 0xff9d2e],
  },
  sparks: {
    count: 10,
    life: [0.16, 0.4],
    speed: [4, 11],
    lift: [0.8, 4.2],
    spread: 1.0,
    gravity: -13,
    drag: 0.8,
    colors: [0xffd27a, 0xffa63c, 0xfff3c4],
  },
  impact: {
    count: 12,
    life: [0.22, 0.5],
    speed: [3, 9],
    lift: [1.0, 3.8],
    spread: 1.3,
    gravity: -11,
    drag: 1.2,
    colors: [0xffd98a, 0xffb347, 0xe8e4d8],
  },
  dust: {
    count: 9,
    life: [0.4, 0.9],
    speed: [0.7, 2.4],
    lift: [0.3, 1.4],
    spread: 1.6,
    gravity: -0.7,
    drag: 2.0,
    colors: [0xd9cfb8, 0xc2b699, 0xe4ddcb],
  },
};

function rand(range) {
  return range[0] + Math.random() * (range[1] - range[0]);
}

export class Effects {
  constructor(scene, opts = {}) {
    const requested = opts.max === undefined ? MAX_POINTS : opts.max | 0;
    this.max = Math.max(60, Math.min(MAX_POINTS, requested));
    this.scene = scene || null;

    const n = this.max;
    this.positions = new Float32Array(n * 3);
    this.baseColors = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    this.velocities = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.gravity = new Float32Array(n);
    this.drag = new Float32Array(n);

    for (let i = 0; i < n; i++) this.positions[i * 3 + 1] = -400;

    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('color', this.colorAttr);

    this.material = new THREE.PointsMaterial({
      size: 0.56,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'effects';
    this.points.frustumCulled = false;
    if (scene && scene.add) scene.add(this.points);

    this.cursor = 0;
    this.live = 0;
    this.time = 0;
    this._color = new THREE.Color();
  }

  spawnBurst(pos, type = 'dust', count) {
    const preset = typeof type === 'string' ? PRESETS[type] || PRESETS.dust : type;
    if (!preset) return 0;

    const px = pos ? pos.x || 0 : 0;
    const py = pos && typeof pos.y === 'number' ? pos.y : 0.55;
    const pz = pos ? pos.z || 0 : 0;
    const n = Math.max(1, Math.min(48, count || preset.count || 1));

    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = i * 3;

      const ang = Math.random() * Math.PI * 2;
      const outward = Math.random() * rand(preset.speed);

      this.positions[i3] = px + (Math.random() - 0.5) * 0.3;
      this.positions[i3 + 1] = py + (Math.random() - 0.5) * 0.3;
      this.positions[i3 + 2] = pz + (Math.random() - 0.5) * 0.3;

      this.velocities[i3] = Math.cos(ang) * outward * (preset.spread || 1);
      this.velocities[i3 + 1] = rand(preset.lift);
      this.velocities[i3 + 2] = Math.sin(ang) * outward * (preset.spread || 1);

      const life = rand(preset.life);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.gravity[i] = preset.gravity || 0;
      this.drag[i] = preset.drag || 0;

      const palette = preset.colors;
      const hex = palette[(Math.random() * palette.length) | 0];
      this._color.setHex(hex);
      const tint = 0.85 + Math.random() * 0.3;
      this.baseColors[i3] = Math.min(1, this._color.r * tint);
      this.baseColors[i3 + 1] = Math.min(1, this._color.g * tint);
      this.baseColors[i3 + 2] = Math.min(1, this._color.b * tint);
      this.colors[i3] = this.baseColors[i3];
      this.colors[i3 + 1] = this.baseColors[i3 + 1];
      this.colors[i3 + 2] = this.baseColors[i3 + 2];
    }

    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    return n;
  }

  update(dt) {
    const step = dt > 0 ? Math.min(dt, 0.1) : 0;
    if (step <= 0) return;
    this.time += step;

    let live = 0;
    for (let i = 0; i < this.max; i++) {
      const life = this.life[i];
      if (life <= 0) continue;
      const i3 = i * 3;
      const next = life - step;

      if (next <= 0) {
        this.life[i] = 0;
        this.positions[i3 + 1] = -400;
        continue;
      }

      this.life[i] = next;
      live++;

      const drag = Math.exp(-this.drag[i] * step);
      this.velocities[i3] *= drag;
      this.velocities[i3 + 2] *= drag;
      this.velocities[i3 + 1] = this.velocities[i3 + 1] * drag + this.gravity[i] * step;

      this.positions[i3] += this.velocities[i3] * step;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * step;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * step;

      const fade = 0.3 + (next / this.maxLife[i]) * 0.7;
      this.colors[i3] = this.baseColors[i3] * fade;
      this.colors[i3 + 1] = this.baseColors[i3 + 1] * fade;
      this.colors[i3 + 2] = this.baseColors[i3 + 2] * fade;
    }

    this.live = live;
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.max; i++) {
      this.life[i] = 0;
      this.positions[i * 3 + 1] = -400;
    }
    this.live = 0;
    this.positionAttr.needsUpdate = true;
  }
}
