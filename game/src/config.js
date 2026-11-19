// MARISOL BAY - global tuning constants, world layout and deterministic RNG.

export const SEED = 0x4d415249;

export const SAVE_KEY = 'marisol-bay-save-v1';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const makeRng = (seed) => mulberry32(seed);

export function rngRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function rngInt(rng, min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

export function rngPick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export const WORLD = {
  size: 460,
  half: 230,
  roadWidth: 12,
  gridMinX: -140,
  gridMinZ: -200,
  gridStep: 60,
  gridCols: 7,
  gridRows: 8,
  sidewalkWidth: 6,
  landEdgeX: -212,
  sandCenterX: -198,
  sandWidth: 28,
  promenadeX: -178,
  promenadeWidth: 12,
  waterCenterX: -312,
  waterWidth: 200,
  minX: -208,
  maxX: 226,
  minZ: -226,
  maxZ: 226,
};

WORLD.gridLinesX = (() => {
  const lines = [];
  for (let i = 0; i < WORLD.gridCols; i++) lines.push(WORLD.gridMinX + i * WORLD.gridStep);
  return lines;
})();

WORLD.gridLinesZ = (() => {
  const lines = [];
  for (let i = 0; i < WORLD.gridRows; i++) lines.push(WORLD.gridMinZ + i * WORLD.gridStep);
  return lines;
})();

export const SPAWN = { x: -170, z: 40, facing: Math.PI * 0.5 };

export const DISTRICTS = [
  {
    key: 'beachfront',
    name: 'Beachfront',
    center: { x: -199, z: 0 },
    size: { w: 26, d: 460 },
    heights: [8, 22],
    density: 0.7,
    ground: 0xe6d6b2,
    palette: ['f4e7cf', 'ffd9b8', 'f6c9a8', 'e9dfc4', 'ffe9d2'],
    accent: 0x2fb6c9,
    windows: 0x3a5a72,
  },
  {
    key: 'marina',
    name: 'Marina',
    center: { x: -103, z: 105 },
    size: { w: 166, d: 250 },
    heights: [9, 32],
    density: 0.92,
    ground: 0xa8a89c,
    palette: ['f7f4ec', 'dff0ee', 'bfe3e0', 'f0e6d6', 'cfe4f2'],
    accent: 0x1c8a9c,
    windows: 0x2f5566,
  },
  {
    key: 'oldquarter',
    name: 'Old Quarter',
    center: { x: -103, z: -125 },
    size: { w: 166, d: 210 },
    heights: [9, 28],
    density: 0.95,
    ground: 0xa2927c,
    palette: ['e8c9a0', 'd9a97f', 'f0dcb8', 'c98f6c', 'e3b98f', 'bf7d63'],
    accent: 0x8c3b2e,
    windows: 0x4a3a2a,
  },
  {
    key: 'downtown',
    name: 'Downtown',
    center: { x: 45, z: -125 },
    size: { w: 130, d: 210 },
    heights: [24, 108],
    density: 0.96,
    ground: 0x9a9c98,
    palette: ['cfd6d8', 'a9b7bd', 'e2ddd2', '8fa0a8', 'd7cbbb', 'b9c4c0'],
    accent: 0x2a6f8e,
    windows: 0x2b3f52,
  },
  {
    key: 'portside',
    name: 'Portside',
    center: { x: 170, z: 170 },
    size: { w: 120, d: 120 },
    heights: [10, 26],
    density: 0.42,
    ground: 0x8b8a80,
    palette: ['9aa0a2', 'b2a48f', '8d9096', 'c0b6a2', 'a38f7a'],
    accent: 0xb4552e,
    windows: 0x35414a,
  },
  {
    key: 'hillside',
    name: 'Hillside',
    center: { x: 105, z: 105 },
    size: { w: 250, d: 250 },
    heights: [5, 16],
    density: 0.68,
    ground: 0x93a06a,
    palette: ['f1e4cd', 'e8cfae', 'd9c4a3', 'f3d9c0'],
    accent: 0x3f7a4a,
    windows: 0x3d4d3a,
  },
];

export const PLAYER = {
  walkSpeed: 6.0,
  runSpeed: 11.2,
  accel: 48,
  decel: 34,
  jumpSpeed: 7.4,
  gravity: 23,
  radius: 0.45,
  height: 1.85,
  stepHeight: 0.4,
};

export const CAMERA = {
  fov: 58,
  near: 0.1,
  far: 720,
  distance: 9.2,
  minDistance: 4.2,
  maxDistance: 22,
  targetHeight: 1.62,
  pitch: 0.33,
  minPitch: -0.36,
  maxPitch: 1.08,
  sensitivity: 0.0052,
  zoomStep: 1.25,
  lerp: 9,
  groundClearance: 0.7,
};

export const SKY = {
  day: {
    top: 0x4fa4dc,
    horizon: 0xd9ecf5,
    fog: 0xc4e2ee,
    fogNear: 130,
    fogFar: 620,
    sun: 0xfff2d0,
    sunIntensity: 2.1,
    hemiSky: 0xbfe4ff,
    hemiGround: 0x9d8a63,
    hemiIntensity: 0.85,
  },
  dusk: {
    top: 0x2f3f6e,
    horizon: 0xffb077,
    fog: 0xd18a63,
    fogNear: 100,
    fogFar: 520,
    sun: 0xffb27a,
    sunIntensity: 1.7,
    hemiSky: 0x6d7fb5,
    hemiGround: 0x6b4a3a,
    hemiIntensity: 0.7,
  },
  night: {
    top: 0x0c1526,
    horizon: 0x22304a,
    fog: 0x1a2436,
    fogNear: 80,
    fogFar: 400,
    sun: 0x8fa6d8,
    sunIntensity: 0.55,
    hemiSky: 0x32456b,
    hemiGround: 0x1d2230,
    hemiIntensity: 0.5,
  },
};

export const TIME_OF_DAY = {
  day: 'day',
  dusk: 'dusk',
  night: 'night',
};

export const ROAD_COLORS = {
  asphalt: 0x3c3f44,
  line: 0xf2e6c4,
  sidewalk: 0xb9b5aa,
  crosswalk: 0xeee9dc,
};

export const DEFAULTS = {
  shot: null,
  timeOfDay: 'day',
};
