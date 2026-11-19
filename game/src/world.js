// MARISOL BAY - procedural city: road grid, six districts, beach, marina, portside, hills.

import * as THREE from 'three';
import {
  WORLD,
  DISTRICTS,
  ROAD_COLORS,
  SEED,
  makeRng,
  rngRange,
  rngInt,
  rngPick,
} from './config.js';

const G = {};

const PALM_SPACING = 17;

function geoms() {
  if (!G.box) {
    G.box = new THREE.BoxGeometry(1, 1, 1);
    G.plane = new THREE.PlaneGeometry(1, 1);
  }
  return G;
}

function canvasTexture(canvas, repeatX, repeatY) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function hex(value) {
  return '#' + value.toString(16).padStart(6, '0');
}

function makeFacadeCanvas(district, rng, variant) {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = hex(parseInt(district.palette[variant % district.palette.length], 16));
  ctx.fillRect(0, 0, S, S);

  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 4; i++) ctx.fillRect(rng() * S, 0, 1 + rng() * 4, S);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < 3; i++) ctx.fillRect(rng() * S, 0, 1 + rng() * 3, S);

  const glass = hex(district.windows);
  const lit = ['#ffe6b0', '#ffd79a', '#fff8e5', '#cfe6f4', '#ffe2c4'];
  const cols = 4;
  const rows = 4;
  const cw = S / cols;
  const ch = S / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() < 0.06) continue;
      const padX = cw * 0.2;
      const padY = ch * (variant % 2 === 0 ? 0.24 : 0.32);
      const x = c * cw + padX;
      const y = r * ch + padY;
      const w = cw - padX * 2;
      const h = ch - padY * 2;
      ctx.fillStyle = rng() < 0.22 ? lit[rngInt(rng, 0, lit.length - 1)] : glass;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, y + h * 0.68, w, h * 0.32);
      ctx.strokeStyle = 'rgba(255,255,255,0.26)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, r * ch, S, 1.5);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, S - 6, S, 6);
  return canvas;
}

function makeWaterCanvas() {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#46a8c6');
  grad.addColorStop(0.42, '#2e8cad');
  grad.addColorStop(0.78, '#227491');
  grad.addColorStop(1, '#3197b6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  const waveRng = makeRng(SEED ^ 0x51ed);
  for (let i = 0; i < 28; i++) {
    const y = rngRange(waveRng, 0, S);
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + (i % 6) * 0.02})`;
    ctx.lineWidth = 1 + (i % 3) * 0.8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= S; x += 8) {
      ctx.lineTo(x, y + Math.sin((x / S) * Math.PI * 4 + i) * 2.4);
    }
    ctx.stroke();
  }
  return canvas;
}

function makeInstanced(geometry, material, entries) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(entries.length, 1));
  const dummy = new THREE.Object3D();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    dummy.position.set(e.x, e.y, e.z);
    dummy.rotation.set(e.rx || 0, e.ry || 0, e.rz || 0);
    dummy.scale.set(e.sx ?? 1, e.sy ?? 1, e.sz ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = entries.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function buildWorld(scene) {
  const { box: unitBox, plane } = geoms();
  const rng = makeRng(SEED);

  const group = new THREE.Group();
  group.name = 'marisol-bay';
  scene.add(group);

  const colliders = [];
  const buildings = [];
  const boats = [];
  const disposables = [];
  const track = (item) => {
    disposables.push(item);
    return item;
  };

  const districtByKey = {};
  for (const d of DISTRICTS) districtByKey[d.key] = d;

  function districtForPoint(x, z) {
    for (const d of DISTRICTS) {
      if (
        x >= d.center.x - d.size.w / 2 &&
        x <= d.center.x + d.size.w / 2 &&
        z >= d.center.z - d.size.d / 2 &&
        z <= d.center.z + d.size.d / 2
      ) {
        return d;
      }
    }
    let best = DISTRICTS[0];
    let bestDist = Infinity;
    for (const d of DISTRICTS) {
      const dx = x - d.center.x;
      const dz = z - d.center.z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }

  const districtAt = (x, z) => districtForPoint(x, z).name;
  const districtByKeyLookup = (key) => districtByKey[key] || null;

  const LAND_X0 = WORLD.landEdgeX;
  const LAND_X1 = WORLD.maxX;
  const landWidth = LAND_X1 - LAND_X0;
  const landCenterX = (LAND_X0 + LAND_X1) / 2;

  // ------------------------------------------------------------------- terrain
  const ground = new THREE.Mesh(plane, track(new THREE.MeshLambertMaterial({ color: 0x9d9d88 })));
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set(landWidth, WORLD.size, 1);
  ground.position.set(landCenterX, 0, 0);
  group.add(ground);

  for (const d of DISTRICTS) {
    if (d.key === 'beachfront') continue;
    const patch = new THREE.Mesh(plane, track(new THREE.MeshLambertMaterial({ color: d.ground })));
    patch.rotation.x = -Math.PI / 2;
    patch.scale.set(d.size.w, d.size.d, 1);
    patch.position.set(d.center.x, 0.02, d.center.z);
    group.add(patch);
  }

  const sand = new THREE.Mesh(plane, track(new THREE.MeshLambertMaterial({ color: 0xeeddb6 })));
  sand.rotation.x = -Math.PI / 2;
  sand.scale.set(WORLD.sandWidth, WORLD.size, 1);
  sand.position.set(WORLD.sandCenterX, 0.08, 0);
  group.add(sand);

  const promenade = new THREE.Mesh(plane, track(new THREE.MeshLambertMaterial({ color: 0xd9cdb3 })));
  promenade.rotation.x = -Math.PI / 2;
  promenade.scale.set(WORLD.promenadeWidth, WORLD.size, 1);
  promenade.position.set(WORLD.promenadeX, 0.1, 0);
  group.add(promenade);

  const curb = new THREE.Mesh(unitBox, track(new THREE.MeshLambertMaterial({ color: 0xc0b7a0 })));
  curb.position.set(WORLD.promenadeX + WORLD.promenadeWidth / 2, 0.1, 0);
  curb.scale.set(0.5, 0.2, WORLD.size);
  group.add(curb);

  const foam = new THREE.Mesh(
    plane,
    track(new THREE.MeshBasicMaterial({ color: 0xedfbff, transparent: true, opacity: 0.5 })),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.scale.set(5, WORLD.size, 1);
  foam.position.set(LAND_X0 - 1.5, 0.1, 0);
  group.add(foam);

  const waterTex = track(canvasTexture(makeWaterCanvas(), 5, 40));
  const water = new THREE.Mesh(plane, track(new THREE.MeshLambertMaterial({ map: waterTex })));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(WORLD.waterWidth, WORLD.size + 80, 1);
  water.position.set(WORLD.waterCenterX, -0.34, 0);
  group.add(water);

  const deep = new THREE.Mesh(plane, track(new THREE.MeshBasicMaterial({ color: 0x155a74 })));
  deep.rotation.x = -Math.PI / 2;
  deep.scale.set(WORLD.waterWidth + 60, WORLD.size + 140, 1);
  deep.position.set(WORLD.waterCenterX - 30, -0.9, 0);
  group.add(deep);

  // --------------------------------------------------------------------- roads
  const asphaltMat = track(new THREE.MeshLambertMaterial({ color: ROAD_COLORS.asphalt }));
  const sidewalkMat = track(new THREE.MeshLambertMaterial({ color: ROAD_COLORS.sidewalk }));
  const lineMat = track(new THREE.MeshLambertMaterial({ color: ROAD_COLORS.line }));
  const crossMat = track(new THREE.MeshLambertMaterial({ color: ROAD_COLORS.crosswalk }));

  const xs = WORLD.gridLinesX;
  const zs = WORLD.gridLinesZ;
  const roadHalf = WORLD.roadWidth / 2;
  const swW = WORLD.sidewalkWidth;
  const swOff = roadHalf + swW / 2;
  const roadSpanX = WORLD.maxX - (WORLD.gridMinX - 20);
  const roadSpanZ = WORLD.size;
  const gridCenterX = (WORLD.gridMinX - 20 + WORLD.maxX) / 2;

  for (const gx of xs) {
    const strip = new THREE.Mesh(plane, asphaltMat);
    strip.rotation.x = -Math.PI / 2;
    strip.scale.set(WORLD.roadWidth, roadSpanZ, 1);
    strip.position.set(gx, 0.045, 0);
    group.add(strip);
  }
  for (const gz of zs) {
    const strip = new THREE.Mesh(plane, asphaltMat);
    strip.rotation.x = -Math.PI / 2;
    strip.scale.set(roadSpanX, WORLD.roadWidth, 1);
    strip.position.set(gridCenterX, 0.05, gz);
    group.add(strip);
  }

  const walkEntries = [];
  for (const gx of xs) {
    walkEntries.push({ x: gx - swOff, y: 0.08, z: 0, sx: swW, sy: 0.16, sz: WORLD.size });
    walkEntries.push({ x: gx + swOff, y: 0.08, z: 0, sx: swW, sy: 0.16, sz: WORLD.size });
  }
  for (const gz of zs) {
    walkEntries.push({ x: (WORLD.gridMinX - 20 + WORLD.maxX) / 2, y: 0.08, z: gz - swOff, sx: roadSpanX, sy: 0.16, sz: swW });
    walkEntries.push({ x: (WORLD.gridMinX - 20 + WORLD.maxX) / 2, y: 0.08, z: gz + swOff, sx: roadSpanX, sy: 0.16, sz: swW });
  }
  group.add(makeInstanced(track(new THREE.BoxGeometry(1, 1, 1)), sidewalkMat, walkEntries));

  const nearLine = (v, lines) => lines.some((o) => Math.abs(v - o) < roadHalf + 4.5);
  const dashEntries = [];
  for (const gx of xs) {
    for (let p = -WORLD.half + 6; p <= WORLD.half - 6; p += 7) {
      if (nearLine(p, zs)) continue;
      dashEntries.push({ x: gx, y: 0.07, z: p, sx: 0.22, sy: 0.03, sz: 2.9 });
    }
  }
  for (const gz of zs) {
    for (let p = WORLD.gridMinX - 14; p <= WORLD.maxX - 6; p += 7) {
      if (nearLine(p, xs)) continue;
      dashEntries.push({ x: p, y: 0.07, z: gz, sx: 2.9, sy: 0.03, sz: 0.22 });
    }
  }
  group.add(makeInstanced(track(new THREE.BoxGeometry(1, 1, 1)), lineMat, dashEntries));

  const crossEntries = [];
  for (const gx of xs) {
    for (const gz of zs) {
      for (let k = -2; k <= 2; k++) {
        const off = k * 1.9;
        crossEntries.push({ x: gx + off, y: 0.075, z: gz - roadHalf - 3.3, sx: 1.05, sy: 0.03, sz: 2.5 });
        crossEntries.push({ x: gx + off, y: 0.075, z: gz + roadHalf + 3.3, sx: 1.05, sy: 0.03, sz: 2.5 });
        crossEntries.push({ x: gx - roadHalf - 3.3, y: 0.075, z: gz + off, sx: 2.5, sy: 0.03, sz: 1.05 });
        crossEntries.push({ x: gx + roadHalf + 3.3, y: 0.075, z: gz + off, sx: 2.5, sy: 0.03, sz: 1.05 });
      }
    }
  }
  group.add(makeInstanced(track(new THREE.BoxGeometry(1, 1, 1)), crossMat, crossEntries));

  // ------------------------------------------------------------- facades cache
  const facadeCache = new Map();
  function facadeMaterial(district, variant, rx, ry) {
    const key = `${district.key}:${variant}:${rx}:${ry}`;
    let mat = facadeCache.get(key);
    if (!mat) {
      const tex = track(canvasTexture(makeFacadeCanvas(district, rng, variant), rx, ry));
      mat = track(new THREE.MeshLambertMaterial({ map: tex }));
      facadeCache.set(key, mat);
    }
    return mat;
  }

  const roofColor = {};
  for (const d of DISTRICTS) {
    roofColor[d.key] = new THREE.Color(d.accent).multiplyScalar(1.22).getHex();
  }

  const roofCapEntries = [];
  const crownEntries = [];
  const spireEntries = [];

  function addBuilding(x, z, w, d, h, district, baseY) {
    if (w < 4 || d < 4 || h < 3) return;
    if (x - w / 2 < LAND_X0 + 4 || x + w / 2 > WORLD.maxX - 2) return;
    if (Math.abs(z) > WORLD.half - 4) return;
    const variant = rngInt(rng, 0, 2);
    const rx = Math.max(1, Math.min(5, Math.round(w / 4.4)));
    const ry = Math.max(1, Math.min(26, Math.round(h / 3.8)));
    const body = new THREE.Mesh(unitBox, facadeMaterial(district, variant, rx, ry));
    body.position.set(x, baseY + h / 2, z);
    body.scale.set(w, h, d);
    group.add(body);

    roofCapEntries.push({
      x, y: baseY + h + 0.11, z, sx: w + 0.5, sy: 0.24, sz: d + 0.5, district: district.key,
    });

    if (h > 44) {
      const crownH = Math.min(9, 2.4 + h * 0.075);
      crownEntries.push({
        x, y: baseY + h + crownH / 2 + 0.2, z, sx: w * 0.58, sy: crownH, sz: d * 0.58, district: district.key,
      });
      spireEntries.push({
        x, y: baseY + h + crownH + 3.4, z, sx: 0.34, sy: 6.8, sz: 0.34,
      });
    }

    buildings.push({ x, z, w, d, h, district: district.name });
    colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      height: baseY + h,
      kind: 'building',
    });
  }

  const cellInner = WORLD.gridStep - WORLD.roadWidth - swW * 2;

  function nearRoad(x, z, pad) {
    for (const gx of xs) if (Math.abs(x - gx) < pad) return true;
    for (const gz of zs) if (Math.abs(z - gz) < pad) return true;
    return false;
  }

  // ---------------------------------------------------------- containers/cranes
  const containerBoxes = [];
  const craneMat = track(new THREE.MeshLambertMaterial({ color: 0xc4713a }));
  const craneDark = track(new THREE.MeshLambertMaterial({ color: 0x4a4f55 }));

  function addCrane(x, z) {
    const mastH = 28;
    const mast = new THREE.Mesh(unitBox, craneMat);
    mast.position.set(x, mastH / 2, z);
    mast.scale.set(2.4, mastH, 2.4);
    group.add(mast);
    const boom = new THREE.Mesh(unitBox, craneMat);
    boom.position.set(x + 8, mastH + 1.2, z);
    boom.scale.set(34, 1.5, 1.9);
    group.add(boom);
    const counter = new THREE.Mesh(unitBox, craneDark);
    counter.position.set(x - 8, mastH - 0.5, z);
    counter.scale.set(8, 2.6, 2.5);
    group.add(counter);
    colliders.push({
      minX: x - 1.8, maxX: x + 1.8,
      minZ: z - 1.8, maxZ: z + 1.8,
      height: mastH, kind: 'crane',
    });
  }

  function addContainerYard(cx, cz) {
    const cw = 6.1;
    const cd = 2.45;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        if (rng() < 0.3) continue;
        const bx = cx + (c - 1) * (cw + 1.9);
        const bz = cz + (r - 0.5) * (cd + 3.4);
        if (nearRoad(bx, bz, 6)) continue;
        const stack = rng() < 0.4 ? 2 : 1;
        const color = rngPick(rng, [0xb4552e, 0x2f6f8c, 0x3f7a4a, 0xb08a2e, 0x8c3b2e, 0x566573]);
        for (let s = 0; s < stack; s++) {
          containerBoxes.push({
            x: bx, y: 1.36 + s * 2.65, z: bz,
            sx: cw, sy: 2.55, sz: cd, color,
          });
        }
        colliders.push({
          minX: bx - cw / 2, maxX: bx + cw / 2,
          minZ: bz - cd / 2, maxZ: bz + cd / 2,
          height: stack * 2.6, kind: 'container',
        });
      }
    }
  }

  // -------------------------------------------------------------- city blocks
  const subCount = {
    downtown: 2,
    oldquarter: 2,
    marina: 3,
    portside: 1,
    hillside: 2,
    beachfront: 1,
  };

  const hillMat = track(new THREE.MeshLambertMaterial({ color: 0x8b9860 }));

  let built = 0;
  const MAX_BUILDINGS = 400;

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      const district = districtForPoint(cx, cz);
      if (!district) continue;
      if (district.key === 'beachfront') continue;

      let plateauY = 0;
      if (district.key === 'hillside') {
        plateauY = 1.2 + rng() * 4.2;
        const plate = new THREE.Mesh(unitBox, hillMat);
        plate.position.set(cx, plateauY / 2, cz);
        plate.scale.set(cellInner + 5, plateauY, cellInner + 5);
        group.add(plate);
        colliders.push({
          minX: cx - (cellInner + 5) / 2,
          maxX: cx + (cellInner + 5) / 2,
          minZ: cz - (cellInner + 5) / 2,
          maxZ: cz + (cellInner + 5) / 2,
          height: plateauY,
          kind: 'plateau',
        });
      }

      if (district.key === 'portside') {
        addContainerYard(cx, cz);
        if (rng() < 0.4) continue;
      }

      const sub = subCount[district.key] || 1;
      const span = (cellInner - 4) / sub;
      for (let sx = 0; sx < sub; sx++) {
        for (let sz = 0; sz < sub; sz++) {
          if (built >= MAX_BUILDINGS) break;
          if (rng() > district.density) continue;
          const bx = cx - cellInner / 2 + 2 + (sx + 0.5) * span;
          const bz = cz - cellInner / 2 + 2 + (sz + 0.5) * span;
          const w = rngRange(rng, span * 0.66, span * 0.96);
          const d = rngRange(rng, span * 0.66, span * 0.96);
          if (nearRoad(bx, bz, Math.max(w, d) / 2 + 3.2)) continue;
          const t = rng();
          const hMin = district.heights[0];
          const hMax = district.heights[1];
          let h = hMin + Math.pow(t, 1.6) * (hMax - hMin);
          if (district.key === 'downtown' && rng() < 0.2) h = Math.min(hMax * 1.1, h * 1.32);
          if (district.key === 'hillside') h = Math.min(h, 4.5 + rng() * 8);
          addBuilding(bx, bz, w, d, h, district, plateauY);
          built++;
        }
      }
    }
  }

  // ------------------------------------------------- beachfront strip buildings
  const beach = districtByKey.beachfront;
  const beachRowX = -161;
  for (let z = -214; z <= 214; z += 22) {
    if (z > 34 && z < 96) continue;
    if (rng() < 0.1) continue;
    const d = rngRange(rng, 15, 20);
    const h = rngRange(rng, 9, 24);
    addBuilding(beachRowX, z + rngRange(rng, -1.5, 1.5), 14, d, h, beach, 0);
  }

  // --------------------------------------------------------------- beach huts
  const hutMat = track(new THREE.MeshLambertMaterial({ color: 0xf8f3e5 }));
  const hutRoofMat = track(new THREE.MeshLambertMaterial({ color: 0xd9744f }));
  for (let z = -196; z <= 196; z += 56) {
    const x = WORLD.sandCenterX - 3;
    const body = new THREE.Mesh(unitBox, hutMat);
    body.position.set(x, 1.45, z);
    body.scale.set(4.4, 2.5, 4.4);
    group.add(body);
    const roof = new THREE.Mesh(unitBox, hutRoofMat);
    roof.position.set(x, 3.0, z);
    roof.scale.set(5.6, 0.5, 5.6);
    group.add(roof);
    colliders.push({
      minX: x - 2.2, maxX: x + 2.2,
      minZ: z - 2.2, maxZ: z + 2.2,
      height: 3.3, kind: 'hut',
    });
  }

  // ------------------------------------------------------------- roofs (batch)
  const roofGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const roofMat = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));

  function instancedTinted(entries, color) {
    if (entries.length === 0) return;
    const mesh = makeInstanced(roofGeo, roofMat, entries);
    const tmp = new THREE.Color(color);
    for (let i = 0; i < entries.length; i++) mesh.setColorAt(i, tmp);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  for (const d of DISTRICTS) {
    const caps = roofCapEntries.filter((e) => e.district === d.key);
    instancedTinted(caps, roofColor[d.key]);
    instancedTinted(crownEntries.filter((e) => e.district === d.key), roofColor[d.key]);
  }
  instancedTinted(spireEntries, 0x9aa5ad);

  // ------------------------------------------------------------ marina docks
  const dockMat = track(new THREE.MeshLambertMaterial({ color: 0xb08a5c }));
  const hullMats = [
    track(new THREE.MeshLambertMaterial({ color: 0xf8f5ec })),
    track(new THREE.MeshLambertMaterial({ color: 0xdfeaf0 })),
  ];
  const cabinMats = [
    track(new THREE.MeshLambertMaterial({ color: 0x2f7f96 })),
    track(new THREE.MeshLambertMaterial({ color: 0x9a5c3f })),
  ];

  for (let i = 0; i < 6; i++) {
    const z = 6 + i * 24;
    const dock = new THREE.Mesh(unitBox, dockMat);
    dock.position.set(LAND_X0 - 22, 0.42, z);
    dock.scale.set(46, 0.36, 4.2);
    group.add(dock);

    for (let p = 0; p < 6; p++) {
      const post = new THREE.Mesh(unitBox, dockMat);
      post.position.set(LAND_X0 - 2 - p * 7.6, 0.72, z + 2.0);
      post.scale.set(0.42, 1.45, 0.42);
      group.add(post);
    }

    const boat = new THREE.Group();
    const hull = new THREE.Mesh(unitBox, hullMats[i % 2]);
    hull.position.y = 0.6;
    hull.scale.set(10.5, 1.8, 3.4);
    boat.add(hull);
    const bow = new THREE.Mesh(unitBox, hullMats[i % 2]);
    bow.position.set(5.6, 0.82, 0);
    bow.scale.set(2.2, 1.15, 2.3);
    boat.add(bow);
    const cabin = new THREE.Mesh(unitBox, cabinMats[i % 2]);
    cabin.position.set(-1.4, 2.1, 0);
    cabin.scale.set(4.2, 1.5, 2.7);
    boat.add(cabin);
    const mast = new THREE.Mesh(unitBox, cabinMats[i % 2]);
    mast.position.set(3.4, 3.5, 0);
    mast.scale.set(0.2, 4.6, 0.2);
    boat.add(mast);
    boat.position.set(LAND_X0 - 15, -0.1, z + 5.2);
    boat.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.05;
    group.add(boat);
    boats.push({ mesh: boat, baseY: boat.position.y, phase: i * 1.9 });
  }

  addCrane(96, 190);
  addCrane(150, 190);

  if (containerBoxes.length > 0) {
    const mesh = makeInstanced(track(new THREE.BoxGeometry(1, 1, 1)),
      track(new THREE.MeshLambertMaterial({ color: 0xffffff })), containerBoxes);
    const tmp = new THREE.Color();
    for (let i = 0; i < containerBoxes.length; i++) {
      tmp.setHex(containerBoxes[i].color);
      mesh.setColorAt(i, tmp);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  // ------------------------------------------------------------------ palms
  const trunkGeo = track(new THREE.CylinderGeometry(0.22, 0.34, 1, 6));
  const frondGeo = track(new THREE.ConeGeometry(1, 1, 6));
  const trunkMat = track(new THREE.MeshLambertMaterial({ color: 0x8a6a45 }));
  const frondMat = track(new THREE.MeshLambertMaterial({ color: 0x3f8047 }));

  const trunkEntries = [];
  const frondEntries = [];
  const palmSpots = [];
  for (let z = -214; z <= 214; z += PALM_SPACING) {
    palmSpots.push({ x: WORLD.promenadeX - WORLD.promenadeWidth / 2 + 1.4, z: z + rngRange(rng, -1.4, 1.4) });
    if (rng() < 0.6) {
      palmSpots.push({ x: WORLD.sandCenterX + rngRange(rng, -6, 5), z: z + 8 + rngRange(rng, -2, 2) });
    }
    if (rng() < 0.32) {
      palmSpots.push({ x: WORLD.promenadeX + WORLD.promenadeWidth / 2 - 2.0, z: z + 5 });
    }
  }
  for (const spot of palmSpots) {
    const h = rngRange(rng, 5.2, 9.2);
    const lean = rngRange(rng, -0.06, 0.06);
    trunkEntries.push({ x: spot.x, y: h / 2, z: spot.z, sx: 1, sy: h, sz: 1, rz: lean });
    for (let f = 0; f < 5; f++) {
      const ang = (f / 5) * Math.PI * 2 + rngRange(rng, -0.25, 0.25);
      frondEntries.push({
        x: spot.x + Math.cos(ang) * 1.15 + lean * h,
        y: h + 0.14,
        z: spot.z + Math.sin(ang) * 1.15,
        sx: 1.45, sy: 0.4, sz: 2.6,
        rx: 0.5, ry: ang,
      });
    }
  }
  group.add(makeInstanced(trunkGeo, trunkMat, trunkEntries));
  group.add(makeInstanced(frondGeo, frondMat, frondEntries));

  // ------------------------------------------------------------ street lamps
  const poleGeo = track(new THREE.CylinderGeometry(0.1, 0.14, 1, 6));
  const poleMat = track(new THREE.MeshLambertMaterial({ color: 0x5b6066 }));
  const lampMat = track(new THREE.MeshLambertMaterial({ color: 0xfff3c8, emissive: 0x2c2410 }));
  const lampPoles = [];
  const lampHeads = [];

  for (const gx of xs) {
    for (let p = -WORLD.half + 20; p <= WORLD.half - 20; p += 36) {
      if (nearLine(p, zs)) continue;
      lampPoles.push({ x: gx - swOff, y: 3.2, z: p, sx: 1, sy: 6.4, sz: 1 });
      lampHeads.push({ x: gx - swOff + 0.62, y: 6.3, z: p, sx: 1.35, sy: 0.24, sz: 0.44 });
    }
  }
  for (const gz of zs) {
    for (let p = WORLD.gridMinX - 12; p <= WORLD.maxX - 12; p += 36) {
      if (nearLine(p, xs)) continue;
      lampPoles.push({ x: p, y: 3.2, z: gz + swOff, sx: 1, sy: 6.4, sz: 1 });
      lampHeads.push({ x: p + 0.62, y: 6.3, z: gz + swOff, sx: 0.44, sy: 0.24, sz: 1.35 });
    }
  }
  group.add(makeInstanced(poleGeo, poleMat, lampPoles));
  group.add(makeInstanced(track(new THREE.BoxGeometry(1, 1, 1)), lampMat, lampHeads));

  // ----------------------------------------------------------- benches/hydrants
  const benchGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const benchWood = track(new THREE.MeshLambertMaterial({ color: 0x9a6a44 }));
  const benchMetal = track(new THREE.MeshLambertMaterial({ color: 0x4d5358 }));
  const seats = [];
  const backs = [];
  const legs = [];
  for (let z = -200; z <= 200; z += 24) {
    const bx = WORLD.promenadeX + 4.2;
    seats.push({ x: bx, y: 0.6, z, sx: 0.8, sy: 0.16, sz: 2.3 });
    backs.push({ x: bx + 0.33, y: 0.92, z, sx: 0.14, sy: 0.58, sz: 2.3 });
    legs.push({ x: bx, y: 0.3, z: z - 0.85, sx: 0.66, sy: 0.58, sz: 0.14 });
    legs.push({ x: bx, y: 0.3, z: z + 0.85, sx: 0.66, sy: 0.58, sz: 0.14 });
  }
  group.add(makeInstanced(benchGeo, benchWood, seats));
  group.add(makeInstanced(benchGeo, benchWood, backs));
  group.add(makeInstanced(benchGeo, benchMetal, legs));

  const hydrantGeo = track(new THREE.CylinderGeometry(0.28, 0.32, 1, 8));
  const hydrantMat = track(new THREE.MeshLambertMaterial({ color: 0xc0392b }));
  const hydrants = [];
  for (const gx of xs) {
    for (const gz of zs) {
      if (rng() < 0.45) continue;
      hydrants.push({
        x: gx + swOff + 0.7, y: 0.45, z: gz - swOff - 0.7,
        sx: 1, sy: 0.9, sz: 1,
      });
    }
  }
  group.add(makeInstanced(hydrantGeo, hydrantMat, hydrants));

  // ---------------------------------------------------------- traffic lights
  const tlPoleGeo = track(new THREE.CylinderGeometry(0.12, 0.16, 1, 6));
  const tlBoxGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const tlPoleMat = track(new THREE.MeshLambertMaterial({ color: 0x3a3f45 }));
  const tlBoxMat = track(new THREE.MeshLambertMaterial({ color: 0x22262a }));
  const tlPoles = [];
  const tlBoxes = [];
  for (const gx of xs) {
    for (const gz of zs) {
      if (rng() < 0.3) continue;
      tlPoles.push({ x: gx - swOff + 0.7, y: 2.6, z: gz - swOff + 0.7, sx: 1, sy: 5.2, sz: 1 });
      tlBoxes.push({ x: gx - swOff + 0.7, y: 5.3, z: gz - swOff + 1.05, sx: 0.4, sy: 1.1, sz: 0.3 });
      tlPoles.push({ x: gx + swOff - 0.7, y: 2.6, z: gz + swOff - 0.7, sx: 1, sy: 5.2, sz: 1 });
      tlBoxes.push({ x: gx + swOff - 0.7, y: 5.3, z: gz + swOff - 1.05, sx: 0.4, sy: 1.1, sz: 0.3 });
    }
  }
  group.add(makeInstanced(tlPoleGeo, tlPoleMat, tlPoles));
  group.add(makeInstanced(tlBoxGeo, tlBoxMat, tlBoxes));

  // ------------------------------------------------------------------ animation
  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    waterTex.offset.x = (elapsed * 0.01) % 1;
    waterTex.offset.y = (elapsed * 0.005) % 1;
    water.position.y = -0.34 + Math.sin(elapsed * 0.55) * 0.045;
    for (const b of boats) {
      b.mesh.position.y = b.baseY + Math.sin(elapsed * 0.85 + b.phase) * 0.15;
      b.mesh.rotation.z = Math.sin(elapsed * 0.65 + b.phase) * 0.028;
    }
  }

  function dispose() {
    scene.remove(group);
    for (const item of disposables) {
      if (item && item.dispose) item.dispose();
    }
  }

  return {
    group,
    colliders,
    buildings,
    boats,
    water,
    districtAt,
    districtByKey: districtByKeyLookup,
    districts: DISTRICTS,
    update,
    dispose,
  };
}
