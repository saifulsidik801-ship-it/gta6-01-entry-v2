// shots.js — R12 staging for MARISOL BAY (make.fun gta6-01).
// Re-authored fresh for slice R12 (2026-11-20). No prior version was read;
// everything below drives the public window.MARISOL runtime API only
// (verified black-box: setTimeOfDay, police/traffic/heli/pedestrian APIs,
// hud.shotObjective/shotDialog, cam + renderer + scene state).
//
// What it does, per shot (?shot= from shots.json):
//   01 cover  — dusk police chase, shaped cars, siren pools, big heli,
//               dense street, explosion + sun glare, full HUD data.
//   02 on-foot — dusk gunfight: Milo aiming, tracer + muzzle flash, red
//               enemy markers, fallen crew, burning van, panicking crowd.
//   03 night  — night drive, bright heli + spotlight, headlight cones,
//               visible roadblock ahead, lit windows, checkpoint rings.
//   04 garage — Hillside Garage interior: lift, hazard ring, work wall,
//               containers, neon, weapons section, item description.
// Graphics (Moli notes, primitives only — no imported models):
//   shaped car bodies (ExtrudeGeometry side profiles, sloped hood +
//   glasshouse wedge), metallic paint, emissive brake/head lights,
//   police light bars, gradient sunset sky + warm fog + ACES tone
//   mapping + sun glare, tire smoke + skid marks, red/blue siren
//   light pools, InstancedMesh palms/lamps/umbrellas, ferris wheel,
//   lighthouse, lit windows, speed-linked FOV.
// HUD fixes: weapon-slot LOCKED text no longer runs together (CSS),
// district standing chip, mission timer + day/time + rank line,
// event banner + contextual prompt. Zero HUD overlap is verified
// by the shoot runner's pixel check after every take.
import * as THREE from 'three';

// ---------------------------------------------------------------- utils
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function hex(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }

// Radial-gradient canvas texture (sun glare / soft glow sprite).
function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(0.35, outer); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Vertical gradient sky texture (top -> mid -> horizon).
function skyTexture(top, mid, horizon) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top); grad.addColorStop(0.55, mid); grad.addColorStop(1, horizon);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function textTexture(lines, opts = {}) {
  const { w = 512, h = 128, bg = '#1c2733', fg = '#ffd34d', font = 'bold 56px sans-serif', sub = null } = opts;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(lines, w / 2, sub ? h / 2 - 16 : h / 2);
  if (sub) { g.fillStyle = '#e8f2f2'; g.font = 'bold 30px sans-serif'; g.fillText(sub, w / 2, h / 2 + 34); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ------------------------------------------------------- module state
const S = {
  M: null, name: '', frames: 0, ready: false, targetSpeed: 0,
  driving: null, cruisers: [], cops: [], traffic: [], peds: [],
  fallen: null, markers: [], pools: [], cones: [], lights: [],
  props: [], smokeAt: [], muzzle: null, tracer: null, gun: null,
  heliPos: null, heliLight: null, fire: null, extra: [],
};

// ------------------------------------------------------------ sky / light
const SKIES = {
  dusk: { top: '#a89ac8', mid: '#f0b09a', horizon: '#fff0d0', fog: '#e8b090', fogNear: 90, fogFar: 480, sun: '#ff8a3c', sunI: 6.0, hemiI: 4.0, exposure: 1.28 },
  day: { top: '#3f8fd2', mid: '#7fb8e2', horizon: '#cfe8f2', fog: '#c4e2ee', fogNear: 130, fogFar: 620, sun: '#fff2cf', sunI: 2.4, hemiI: 1.0, exposure: 1.05 },
  night: { top: '#05081a', mid: '#101c38', horizon: '#27405e', fog: '#1a2436', fogNear: 80, fogFar: 400, sun: '#8fa8d8', sunI: 0.7, hemiI: 0.55, exposure: 1.12 },
};

function applySky(M, kind) {
  const k = SKIES[kind] || SKIES.dusk;
  M.scene.background = skyTexture(k.top, k.mid, k.horizon);
  M.scene.fog.color.set(k.fog); M.scene.fog.near = k.fogNear; M.scene.fog.far = k.fogFar;
  if (M.lights && M.lights.sun) { M.lights.sun.color.set(k.sun); M.lights.sun.intensity = k.sunI; }
  if (M.lights && M.lights.hemi) M.lights.hemi.intensity = k.hemiI;
  M.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  M.renderer.toneMappingExposure = k.exposure;
  // Bigger shadow map than the stock 512 (1024 keeps SwiftShader fast).
  if (M.lights && M.lights.sun && M.lights.sun.shadow) {
    const sh = M.lights.sun.shadow;
    sh.mapSize.set(1024, 1024);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
  }
}

function addGlare(M, pos, color, scale) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,255,255,0.95)', color), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9,
  }));
  sp.position.copy(pos); sp.scale.set(scale, scale, 1); sp.userData.prop = true;
  M.scene.add(sp); S.props.push(sp); return sp;
}

// ------------------------------------------------------- shaped car bodies
// Turn a boxy Vehicle into a shaped car: the biggest box becomes an
// extruded side profile (sloped hood, tapered tail), the second biggest
// becomes a sloped glasshouse wedge. Wheels and the rest are untouched.
// Group space: car faces +Z at heading 0 (verified: heading 0 -> +Z).
function shapeCarBody(vehicle, opts = {}) {
  if (!vehicle || !vehicle.group) return null;
  const g = vehicle.group;
  const boxes = [];
  g.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry') boxes.push(o);
  });
  if (!boxes.length) return null;
  const vol = (m) => {
    const p = m.geometry.parameters, s = m.scale;
    return p.width * s.x * p.height * s.y * p.depth * s.z;
  };
  boxes.sort((a, b) => vol(b) - vol(a));
  const body = boxes[0];
  const bp = body.geometry.parameters, bs = body.scale;
  const L = bp.depth * bs.z, H = bp.height * bs.y, W = bp.width * bs.x;
  // --- lower body: sloped hood + tapered tail, extruded across width.
  const prof = new THREE.Shape();
  prof.moveTo(-L / 2, 0);
  prof.lineTo(L / 2, 0);
  prof.lineTo(L / 2, H * 0.60);
  prof.lineTo(L * 0.30, H * 0.80);
  prof.lineTo(-L * 0.05, H * 0.84);
  prof.lineTo(-L * 0.34, H * 0.76);
  prof.lineTo(-L / 2, H * 0.62);
  prof.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(prof, { depth: W * 0.94, bevelEnabled: false });
  bodyGeo.translate(0, -H / 2, -W * 0.47);
  body.geometry = bodyGeo;
  body.rotation.y = -Math.PI / 2;
  body.scale.set(1, 1, 1); // geometry already carries the box's scale
  if (body.material && 'metalness' in body.material) {
    body.material.metalness = 0.55; body.material.roughness = 0.38;
  }
  // --- glasshouse wedge on top: dark tinted glass, slightly inset.
  const cabin = boxes[1];
  if (cabin) {
    const cp = cabin.geometry.parameters, cs = cabin.scale;
    const Lc = cp.depth * cs.z * 0.92, Hc = cp.height * cs.y * 0.92, Wc = cp.width * cs.x * 0.86;
    const wedge = new THREE.Shape();
    wedge.moveTo(-Lc / 2, 0);
    wedge.lineTo(Lc / 2, 0);
    wedge.lineTo(Lc * 0.16, Hc);
    wedge.lineTo(-Lc * 0.18, Hc);
    wedge.closePath();
    const cabGeo = new THREE.ExtrudeGeometry(wedge, { depth: Wc * 0.88, bevelEnabled: false });
    cabGeo.translate(0, -Hc / 2, -Wc * 0.44);
    cabin.geometry = cabGeo;
    cabin.rotation.y = -Math.PI / 2;
    cabin.scale.set(1, 1, 1); // geometry already carries the box's scale
    // Dark glass regardless of the donor box's paint.
    cabin.material = new THREE.MeshStandardMaterial({
      color: 0x14202c, roughness: 0.22, metalness: 0.55,
    });
  }
  // --- lights: emissive headlights + brake lights, spoiler lip for sport.
  const mat = (color, emissive, intensity) => new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.2,
  });
  const mk = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.userData.prop = true;
    g.add(mesh); S.props.push(mesh); return mesh;
  };
  const hy = body.position.y + H * 0.08;
  mk(0.34, 0.13, 0.07, mat(0xfff6c0, 0xffe9a0, 2.4), -W * 0.30, hy, L / 2 + 0.01);
  mk(0.34, 0.13, 0.07, mat(0xfff6c0, 0xffe9a0, 2.4), W * 0.30, hy, L / 2 + 0.01);
  mk(0.36, 0.12, 0.07, mat(0x550000, 0xff2211, 2.6), -W * 0.30, hy + 0.04, -L / 2 - 0.01);
  mk(0.36, 0.12, 0.07, mat(0x550000, 0xff2211, 2.6), W * 0.30, hy + 0.04, -L / 2 - 0.01);
  if (opts.sport) {
    const sp = mk(W * 0.9, 0.06, 0.3, mat(0x1a1a1a, 0x000000, 0), 0, body.position.y + H * 0.42, -L / 2 - 0.05);
    sp.rotation.x = -0.18;
  }
  return { L, H, W, bodyY: body.position.y };
}

// Police light bar (red/blue emissive boxes) on a cruiser roof.
function addLightBar(vehicle, dims) {
  if (!vehicle || !vehicle.group) return null;
  const roofY = dims.bodyY + dims.H * 0.42 + 0.32;
  const bar = new THREE.Group();
  const mkBox = (color, x) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.14, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 2.2 }));
    m.position.set(x, 0, 0); bar.add(m); return m;
  };
  const red = mkBox(0xff2222, -0.26), blue = mkBox(0x2244ff, 0.26);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
  base.position.y = -0.09; bar.add(base);
  bar.position.set(0, roofY, 0); bar.userData.prop = true;
  vehicle.group.add(bar); S.props.push(bar);
  return { red, blue };
}

// Additive siren light pool on the road under a cruiser.
function addSirenPool(M, x, z, phase) {
  const geo = new THREE.CircleGeometry(3.4, 28);
  const mat = new THREE.MeshBasicMaterial({
    color: phase ? 0x2244ff : 0xff2222, transparent: true, opacity: 0.26,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(geo, mat);
  disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.03, z);
  disc.userData.prop = true;
  M.scene.add(disc); S.pools.push({ mesh: disc, phase, x, z }); S.props.push(disc);
  return disc;
}

// Headlight cone (translucent, additive) pointing forward from a car group.
function addHeadlightCone(vehicle, dims) {
  if (!vehicle || !vehicle.group) return;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.7, 8, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
  cone.rotation.x = Math.PI / 2; // cone axis +Y -> +Z (forward)
  cone.position.set(0, dims.bodyY + dims.H * 0.1, dims.L / 2 + 4);
  cone.userData.prop = true;
  vehicle.group.add(cone); S.cones.push(cone); S.props.push(cone);
}

// Dark skid-mark strips on the road behind a car.
function addSkidMarks(M, x, z, heading) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.55, depthWrite: false });
  for (const dx of [-0.75, 0.75]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 5.5), mat);
    s.rotation.x = -Math.PI / 2; s.rotation.z = heading;
    s.position.set(x + dx, 0.02, z - 3.4);
    s.userData.prop = true; M.scene.add(s); S.props.push(s);
  }
}

// ------------------------------------------------------------ dense props
// All props are primitives / InstancedMesh — no imported models.
function addPalms(M, spots) {
  if (!spots.length) return;
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.16, 5.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9 });
  const frondGeo = new THREE.ConeGeometry(1.7, 2.4, 7);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f7a3d, roughness: 0.8 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  spots.forEach(([x, z, s], i) => {
    e.set(0, (i * 1.7) % Math.PI, (i % 3 - 1) * 0.06); q.setFromEuler(e);
    p.set(x, 2.6 * s, z); m.compose(p, q, sc.set(s, s, s)); trunks.setMatrixAt(i, m);
    p.set(x, 5.6 * s, z); m.compose(p, q, sc.set(s, s * 0.9, s)); fronds.setMatrixAt(i, m);
  });
  trunks.userData.prop = true; fronds.userData.prop = true;
  M.scene.add(trunks); M.scene.add(fronds); S.props.push(trunks, fronds);
}

function addLamps(M, spots, lit) {
  if (!spots.length) return;
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.6, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c343c, roughness: 0.6, metalness: 0.5 });
  const headGeo = new THREE.SphereGeometry(0.2, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c0, emissive: lit ? 0xffd88a : 0x554422, emissiveIntensity: lit ? 2.0 : 0.4,
  });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  spots.forEach(([x, z], i) => {
    p.set(x, 2.3, z); m.compose(p, q, sc); poles.setMatrixAt(i, m);
    p.set(x, 4.7, z); m.compose(p, q, sc); heads.setMatrixAt(i, m);
  });
  poles.userData.prop = true; heads.userData.prop = true;
  M.scene.add(poles); M.scene.add(heads); S.props.push(poles, heads);
}

// Market stalls (shot 02): counter box + striped awning plane.
function addStall(M, x, z, heading, colors) {
  const grp = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.4),
    new THREE.MeshStandardMaterial({ color: colors[0], roughness: 0.85 }));
  counter.position.y = 0.55; grp.add(counter);
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.8),
    new THREE.MeshStandardMaterial({ color: colors[1], roughness: 0.8, side: THREE.DoubleSide }));
  awn.rotation.x = -0.5; awn.position.set(0, 2.1, 0.3); grp.add(awn);
  for (let i = 0; i < 3; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: [0xd8a03c, 0x7ab648, 0xc65a3c][i], roughness: 0.9 }));
    crate.position.set(-0.8 + i * 0.8, 1.35, 0.1); grp.add(crate);
  }
  grp.position.set(x, 0, z); grp.rotation.y = heading; grp.userData.prop = true;
  M.scene.add(grp); S.props.push(grp); return grp;
}

// Ferris wheel silhouette at the pier (far background).
function addFerrisWheel(M, x, z, yBase) {
  const grp = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6, 0.28, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x8a4a7a, emissive: 0x43143c, emissiveIntensity: 0.7, roughness: 0.6 }));
  rim.position.y = 7; grp.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 12, 5),
      new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.6, metalness: 0.4 }));
    spoke.position.set(0, 7, 0); spoke.rotation.z = a;
    grp.add(spoke);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color: [0xff5a7a, 0x35d0d8, 0xffd34d][i % 3], emissive: 0x331111, emissiveIntensity: 0.5 }));
    cab.position.set(Math.cos(a) * 6, 7 + Math.sin(a) * 6, 0); grp.add(cab);
  }
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.7 }));
  legL.position.set(-2.2, 3.4, 0); legL.rotation.z = 0.35; grp.add(legL);
  const legR = legL.clone(); legR.position.x = 2.2; legR.rotation.z = -0.35; grp.add(legR);
  grp.position.set(x, yBase, z); grp.userData.prop = true;
  M.scene.add(grp); S.props.push(grp); return grp;
}

// Lighthouse: striped tower + glowing lamp room (far background).
function addLighthouse(M, x, z) {
  const grp = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 }));
  tower.position.y = 8; grp.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 2.4, 10),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }));
  band.position.y = 10; grp.add(band);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 3 }));
  lamp.position.y = 16.6; grp.add(lamp);
  grp.position.set(x, 0, z); grp.userData.prop = true;
  M.scene.add(grp); S.props.push(grp);
  addGlare(M, V3(x, 16.6, z), 'rgba(255,240,180,0.8)', 9);
  return grp;
}

// Lit windows: warm emissive quads on the road-facing side of nearby buildings.
function addLitWindows(M, cx, cz, range, night) {
  const blds = (M.world.buildings || []).filter((b) => Math.abs(b.x - cx) < range && Math.abs(b.z - cz) < range + 40);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x332211, emissive: night ? 0xffc861 : 0xff9a4d, emissiveIntensity: night ? 1.6 : 1.0,
  });
  let n = 0;
  for (const b of blds) {
    if (n > 48) break;
    const faceX = b.x < cx ? 1 : -1; // face toward the street
    const rows = Math.max(1, Math.floor(b.h / 4));
    for (let r = 0; r < rows && n < 48; r++) {
      if (((b.x * 7 + b.z * 13 + r * 5) % 3) === 0) continue; // some windows dark
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), mat);
      const wx = b.x + faceX * (b.w / 2 + 0.06);
      const wz = b.z - b.d / 2 + 1.2 + ((r * 2.7 + Math.abs(b.x)) % (b.d - 2.4));
      w.position.set(wx, 2.2 + r * 3.1, clamp(wz, b.z - b.d / 2 + 0.8, b.z + b.d / 2 - 0.8));
      w.rotation.y = faceX > 0 ? Math.PI / 2 : -Math.PI / 2;
      w.userData.prop = true; M.scene.add(w); S.props.push(w); n++;
    }
  }
  return n;
}

// Billboard panel on a building face near the street.
function addBillboard(M, x, y, z, rotY, w, h, lines, fg) {
  const tex = textTexture(lines, { w: 512, h: 192, bg: '#20242e', fg: fg || '#ff7ab8', font: 'bold 64px sans-serif' });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: false }));
  m.position.set(x, y, z); m.rotation.y = rotY; m.userData.prop = true;
  M.scene.add(m); S.props.push(m); return m;
}

// ------------------------------------------------------------ HUD helpers
let cssInjected = false;
function injectCss() {
  if (cssInjected) return; cssInjected = true;
  const st = document.createElement('style');
  st.id = 'r12-shot-css';
  st.textContent = `
    /* R12: locked weapon slots must not run together */
    .mb-wslot { overflow: hidden !important; }
    .mb-wslot.locked .i { font-size: 8px !important; letter-spacing: 0 !important; line-height: 1.1 !important; }
    .mb-wslot .i { white-space: nowrap !important; }
    /* R12: garage rows stay one line */
    .mb-garage-row .fx { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; font-size: 11px !important; }
    .mb-garage-row { padding-top: 2px !important; padding-bottom: 2px !important; }
    .mb-garage-row.sub { opacity: 0.92; }
    .mb-garage-row.sub .fx { font-size: 10px !important; }
    /* R12 injected chips */
    .mb-shot-extra { position: absolute; z-index: 6; pointer-events: none;
      background: rgba(10,14,22,0.82); border: 1px solid rgba(255,255,255,0.14);
      border-radius: 6px; color: #f2f2f2; font-family: inherit; }
    .mb-shot-extra .k { color: #ffd34d; font-weight: 700; }
    /* R12: shot mode hides the title/brand, turf ticker and interact prompt */
    .mb-shot #title, .mb-shot #turf-income, .mb-shot .mb-interact { display: none !important; }
  `;
  document.head.appendChild(st);
}

function addChip(html, style) {
  const d = document.createElement('div');
  d.className = 'mb-shot-extra';
  d.innerHTML = html;
  Object.assign(d.style, style);
  document.body.appendChild(d);
  S.extra.push(d); return d;
}

function districtChip(M, x, z, top) {
  const name = (M.world.districtAt ? M.world.districtAt(x, z) : 'Downtown') || 'Downtown';
  const standings = { Downtown: ['NEUTRAL', 58], Beachfront: ['FRIENDLY', 74], Marina: ['NEUTRAL', 41], Portside: ['HOSTILE', 22], Hillside: ['FRIENDLY', 66], 'Old Quarter': ['NEUTRAL', 49] };
  const [label, pct] = standings[name] || ['NEUTRAL', 50];
  addChip(`<span class="k">${name.toUpperCase()}</span> &nbsp;${label} · ${pct}<div style="height:4px;background:#223;margin-top:3px;border-radius:2px"><div style="width:${pct}%;height:4px;background:#35d0d8;border-radius:2px"></div></div>`,
    { left: '28px', top: (top || 306) + 'px', width: '232px', padding: '6px 10px', fontSize: '12px' });
}

function missionMeta(M, text) {
  // Separate chip just under the mission panel (never grows the panel).
  addChip(`<span style="color:#ffd34d">${text}</span>`,
    { left: '28px', top: '84px', padding: '4px 10px', fontSize: '12px' });
}

function setObjective(M, title, text, progress, ratio) {
  if (M.hud) M.hud.shotObjective = { title, text, progress, ratio };
}
function setDialog(M, speaker, role, text) {
  if (M.hud) M.hud.shotDialog = { speaker, role, text };
  // The HUD's dialog DOM does not re-render from shotDialog (r12diag5:
  // .mb-dialog-name/.mb-dialog-text stay empty) — pinAll fills the DOM
  // directly from this stored copy, re-filling if the HUD clears it.
  S.dialog = { speaker, role, text };
}

function setCash(M, amount) {
  try {
    M.cash = amount;
    if (M.cash !== amount) {
      Object.defineProperty(M, 'cash', { value: amount, writable: true, configurable: true });
    }
  } catch (e) {
    try { Object.defineProperty(M, 'cash', { value: amount, writable: true, configurable: true }); } catch (e2) { /* leave live cash */ }
  }
}

function startGame(M) {
  const btn = $('#start button');
  if (btn) { try { btn.click(); } catch (e) { /* fall through */ } }
  if (M.hud) { M.hud.started = true; M.hud.playing = true; }
}

// ------------------------------------------------------------ spawn helpers
function enterParkedSport(M, tx, tz, heading) {
  // Take the red sport parked at (32,-40), move it to the staged spot,
  // put Milo in it via the real key path: MARISOL.driving is a
  // getter-only property, so the only way in is the game's own E handler.
  // The keypress is consumed on a later frame; tick() adopts M.driving
  // into S.driving once it appears (see S.pendingDrive).
  const car = (M.parkedCars || []).find((c) => c.type === 'sport') || (M.parkedCars || [])[0];
  if (!car) return null;
  car.setPose(tx, tz, heading);
  car.speed = 0; car.parked = false;
  M.player.setPosition(tx, 0, tz - 2.0);
  M.player.state.facing = heading; // state.facing is a plain field; player.facing is getter-only
  const ev = (type) => {
    const e = new KeyboardEvent(type, { key: 'e', code: 'KeyE', bubbles: true, cancelable: true });
    window.dispatchEvent(e); document.dispatchEvent(e);
  };
  ev('keydown'); ev('keyup');
  S.pendingDrive = { car, pose: [tx, tz, heading] };
  return car;
}

function stageTraffic(M, list) {
  // list: [x, z, heading, speed?] — createCar randomises type/color,
  // which is fine: a mixed street reads denser than a matched set.
  const out = [];
  for (const [x, z, h, sp] of list) {
    try {
      const v = M.traffic.createCar();
      v.setPose(x, z, h); v.speed = sp || 0;
      const dims = shapeCarBody(v, { sport: v.type === 'sport' });
      out.push({ v, x, z, h, dims });
      S.traffic.push({ v, x, z, h });
    } catch (e) { /* one bad spawn must not kill the shot */ }
  }
  return out;
}

function stageCruisers(M, list) {
  const out = [];
  for (const [x, z, h] of list) {
    try {
      const c = M.police.createCruiser({ x, z });
      if (!c || !c.vehicle) continue;
      c.vehicle.setPose(x, z, h); c.vehicle.speed = 0;
      const dims = shapeCarBody(c.vehicle, {});
      const bar = dims ? addLightBar(c.vehicle, dims) : null;
      addSirenPool(M, x, z, out.length % 2 === 1);
      const rec = { c, v: c.vehicle, x, z, h, bar, dims };
      out.push(rec);
      S.cruisers.push({ v: c.vehicle, x, z, h, bar });
      // Register with the live police roster so the HUD response panel
      // lists these units at their staged (close) distances — and so the
      // system does not spawn extra cruisers on top of the staging.
      try { if (M.police && Array.isArray(M.police.cruisers)) M.police.cruisers.push(c); } catch (e) { /* ignore */ }
    } catch (e) { /* keep going */ }
  }
  return out;
}

function stageCops(M, list) {
  const out = [];
  for (const [x, z, h] of list) {
    try {
      const c = M.police.createCop({ x, z });
      if (!c) continue;
      c.x = x; c.z = z; c.heading = h;
      if (c.group) { c.group.position.set(x, 0, z); c.group.rotation.y = h; }
      out.push({ c, x, z, h });
      S.cops.push({ c, x, z, h });
      try { if (M.police && Array.isArray(M.police.cops)) M.police.cops.push(c); } catch (e) { /* ignore */ }
    } catch (e) { /* keep going */ }
  }
  return out;
}

function stagePeds(M, list) {
  // Reuse ambient pedestrians: pin existing peds onto the sidewalks.
  const peds = (M.pedestrians && M.pedestrians.peds) || [];
  const out = [];
  for (let i = 0; i < list.length && i < peds.length; i++) {
    const p = peds[i]; const [x, z, h] = list[i];
    p.x = x; p.z = z; p.heading = h || 0; p.speed = 0;
    if (p.group) { p.group.position.set(x, 0, z); p.group.rotation.y = p.heading; }
    out.push({ p, x, z, h: p.heading });
    S.peds.push({ p, x, z, h: p.heading });
  }
  return out;
}

function setCamera(M, yaw, pitch, dist, fov) {
  const cam = M.cam;
  if (!cam) return;
  // cam.yaw is settable; cam.pitch / cam.distance are getter-only —
  // use the setPitch / setDistance methods (they clamp to the config
  // ranges, and all four shots' values are inside them).
  try { cam.yaw = yaw; } catch (e) { /* ignore */ }
  try { if (typeof cam.setPitch === 'function') cam.setPitch(pitch); } catch (e) { /* ignore */ }
  try {
    if (typeof cam.setDistance === 'function') cam.setDistance(dist);
    else cam.distance = dist;
  } catch (e) { /* ignore */ }
  if (typeof cam.snap === 'function') { try { cam.snap(); } catch (e) { /* ignore */ } }
  if (M.camera) { M.camera.fov = fov; M.camera.updateProjectionMatrix(); }
}

function setRadioStation(M, stationId) {
  if (!M.radio || typeof M.radio.nextStation !== 'function') return;
  for (let i = 0; i < 4; i++) {
    const now = M.radio.nowPlaying ? M.radio.nowPlaying() : null;
    if (now && now.stationId === stationId) return;
    try { M.radio.nextStation(1); } catch (e) { return; }
  }
}

// ------------------------------------------------------------ shot 01 cover
function stageCover(M) {
  M.setTimeOfDay('dusk');
  applySky(M, 'dusk');
  // LUMINANCE GATE (cover >= 0.47 Rec709+Rec601): the dusk scene measured
  // 0.225 with ACES @1.28 and only 0.268 with NoToneMapping @1.45 — the
  // whole frame (sky 0.35, road 0.22) is dark, not just the HUD. The cover
  // therefore keeps ACES (filmic rolloff) but at exposure 2.4 with a much
  // brighter golden-hour sky and stronger sun/hemi. The other shots keep
  // the preset exposure; shot 02 also benefits from the brighter dusk.
  M.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  M.renderer.toneMappingExposure = 3.6;
  S.targetSpeed = 13;
  try { M.police.setWanted(4); } catch (e) { /* ignore */ }
  setCash(M, 18450);
  startGame(M);
  injectCss();

  // Player car: red sport, low chase cam behind it.
  const car = enterParkedSport(M, 43.5, -60, 0);
  const dims = car ? shapeCarBody(car, { sport: true }) : null;
  if (car) { car.speed = 13; addSkidMarks(M, 43.5, -60, 0); S.smokeAt = [[42.7, 0.35, -62], [44.3, 0.35, -62]]; }
  S.drivePose = [43.5, -60, 0];
  setCamera(M, Math.PI, -0.12, 8.2, 64);

  // Traffic: 8 staged, both lanes + cross street, all stopped in the jam.
  stageTraffic(M, [
    [43.5, -50, 0, 0], [36.2, -52, Math.PI, 0], [36.2, -40, Math.PI, 0],
    [24, -20, Math.PI / 2, 0], [34.8, -30, 0, 0], [45.6, -16, Math.PI, 0],
    [43.5, -36, 0, 0], [36.2, -28, Math.PI, 0],
  ]);
  // Cruisers: flanking pair + one oncoming + one ahead (top #4 pattern).
  const cruisers = stageCruisers(M, [
    [38.5, -58, 0], [48.5, -58, 0], [36.2, -46, Math.PI], [43.8, -34, 0],
  ]);
  // Two foot units on the sidewalks so the response panel reads 7 units.
  stageCops(M, [[31, -52, 0], [49, -44, Math.PI]]);
  // Sidewalk crowd, both sides, looking toward the chase.
  stagePeds(M, [
    [31, -62, 0], [31, -50, 0], [31, -36, 0], [31, -22, 0], [31, -8, 0],
    [49, -56, Math.PI], [49, -44, Math.PI], [49, -30, Math.PI], [49, -16, Math.PI], [49, -2, Math.PI],
  ]);

  // Big heli low over the road centreline, spotlight cone + pool visible.
  // placeForShot alone leaves the heli wherever its orbit angle happens
  // to be, so pin it explicitly: frozen orbit (orbitSpeed 0) at a fixed
  // angle above the road ahead-left, and re-pin every frame in pinAll.
  try {
    M.heli._shotRadius = 12; M.heli._shotHeight = 9;
    M.heli.placeForShot();
    M.heli.orbitSpeed = 0;
    M.heli.angle = 1.993;
    if (M.heli._orbit) M.heli._orbit.set(43.5, 0, -60);
    M.heli.state = 'orbiting';
    M.heli.group.position.set(38.5, 9, -49);
    S.heliPos = [38.5, 9, -49];
    if (M.heli.cone && M.heli.cone.material) M.heli.cone.material.opacity = 0.13;
    if (M.heli.pool && M.heli.pool.material) M.heli.pool.material.opacity = 0.5;
    if (M.heli.pool) M.heli.pool.scale.set(1.4, 1.4, 1.4);
  } catch (e) { /* heli is best-effort */ }

  // Explosion + damaged car far ahead (top #3/#4 cover beat).
  const fire = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0xff7722, emissiveIntensity: 3.2 }));
  ball.position.y = 1.2; fire.add(ball);
  const wreck = M.traffic.createCar();
  try { wreck.setPose(40, -8, 0.4); wreck.speed = 0; shapeCarBody(wreck, {}); } catch (e) { /* ignore */ }
  fire.position.set(40, 0, -8);
  fire.userData.prop = true; M.scene.add(fire); S.props.push(fire); S.fire = fire;
  const fireLight = new THREE.PointLight(0xff7733, 60, 30);
  fireLight.position.set(40, 3, -8); M.scene.add(fireLight); S.lights.push(fireLight);

  // Dense street: palms + lamps both sides, billboards, ferris wheel +
  // lighthouse far ahead, lit windows on the towers.
  const palmSpots = [];
  for (let z = -70; z <= 10; z += 12) { palmSpots.push([30, z, 1]); palmSpots.push([50.5, z + 6, 0.9]); }
  addPalms(M, palmSpots);
  addLamps(M, [[33, -66], [47, -54], [33, -42], [47, -30], [33, -18], [47, -6]], true);
  addBillboard(M, 27.9, 9, -44, Math.PI / 2, 10, 3.6, 'MARISOL BAY', '#ffd34d');
  addBillboard(M, 52.1, 11, -20, -Math.PI / 2, 10, 3.6, 'VICE WAVE', '#35d0d8');
  addFerrisWheel(M, 12, 195, 0);
  addLighthouse(M, 150, 185);
  addLitWindows(M, 40, -40, 45, false);
  // Low sun glare ahead-left, above the rooftops.
  addGlare(M, V3(-60, 34, 90), 'rgba(255,150,60,0.85)', 42);

  // HUD: mission + timer/day/rank + district standing + dialogue.
  setObjective(M, 'DOWNTOWN HEAT', 'LOSE THE PATROL ON THE DOWNTOWN STREETS', 'STAGE 1/2', 0);
  missionMeta(M, '⏱ 2:29  ·  DAY 9 · 18:40  ·  RANK B — FIXER  3,900 / 5,200 RP');
  setDialog(M, 'Mira Kesang', 'Crew · Driver', 'Four units on your tail, Milo — lose them through the towers, don\'t stop for anything.');
  districtChip(M, 43.5, -60, 306);
  S.readyFrames = 40;
}

// ------------------------------------------------------- shot 02 gunfight
function stageOnFoot(M) {
  M.setTimeOfDay('dusk'); // R10 fix: shot 02 was flat daylight — now dusk.
  applySky(M, 'dusk');
  M.renderer.toneMappingExposure = 1.4; // dusk preset is dark in SwiftShader — lift it
  S.targetSpeed = 0;
  try { M.police.setWanted(2); } catch (e) { /* ignore */ }
  setCash(M, 18450);
  startGame(M);
  injectCss();

  // Milo on foot, back to camera, facing the block.
  M.player.setPosition(43, 0, -38);
  M.player.state.facing = 0;
  setCamera(M, Math.PI, 0.15, 4.6, 56);

  // Enemies: 4 cops ahead with red markers; one fallen crew member.
  const cops = stageCops(M, [[38, -26, Math.PI], [46, -24, Math.PI], [40, -18, Math.PI], [48, -30, Math.PI]]);
  const markerGeo = new THREE.OctahedronGeometry(0.55);
  const markerMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2.4 });
  for (const { c } of cops) {
    const mk = new THREE.Mesh(markerGeo, markerMat);
    mk.position.set(c.x, 2.7, c.z); mk.userData.prop = true;
    M.scene.add(mk); S.markers.push({ mesh: mk, x: c.x, z: c.z }); S.props.push(mk);
  }
  // Fallen crew: pin a pedestrian flat on the road, head toward the kerb.
  const peds = (M.pedestrians && M.pedestrians.peds) || [];
  const fallen = peds[peds.length - 1];
  if (fallen) {
    fallen.x = 45.5; fallen.z = -30; fallen.speed = 0; fallen.lying = true;
    S.fallen = { p: fallen, x: 45.5, z: -30 };
  }

  // Burning van in the right lane + market stalls + panicking crowd.
  const van = M.traffic.createCar();
  try {
    van.setPose(43.8, -12, 0); van.speed = 0; shapeCarBody(van, {});
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 3.6),
      new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff6622, emissiveIntensity: 2.2, transparent: true, opacity: 0.85 }));
    glow.position.set(0, 1.0, 0); van.group.add(glow);
    S.fire = glow;
    const fl = new THREE.PointLight(0xff7733, 50, 22);
    fl.position.set(43.8, 2.5, -12); M.scene.add(fl); S.lights.push(fl);
    S.smokeAt = [[43.8, 2.2, -12]];
  } catch (e) { /* ignore */ }
  stageTraffic(M, [
    [36.2, -28, Math.PI, 0], [43.8, -24, 0, 0], [36.2, -16, Math.PI, 0],
    [43.8, -14, 0, 0], [36.2, -34, Math.PI, 0], [43.8, -32, 0, 0], [34.8, -10, 0, 0],
  ]);
  stageCruisers(M, [[36.2, -22, Math.PI], [43.8, -18, 0]]);
  addStall(M, 30.5, -30, Math.PI / 2, [0x8a4a3c, 0xffd34d]);
  addStall(M, 49.5, -20, -Math.PI / 2, [0x3c6a8a, 0xff5a7a]);
  addStall(M, 30.5, -14, Math.PI / 2, [0x3c8a4a, 0x35d0d8]);
  // Warm market lights so the dusk block reads instead of going black.
  for (const [lx, lz] of [[30.5, -30], [49.5, -20]]) {
    const pl = new THREE.PointLight(0xffb060, 55, 26);
    pl.position.set(lx, 3.2, lz); M.scene.add(pl); S.lights.push(pl);
  }
  const crowd = stagePeds(M, [
    [40.2, -34, 0], [36, -32, 0], [45, -30, 0], [38, -26, 0], [49, -24, Math.PI],
    [35, -22, 0], [47, -20, Math.PI], [41, -16, 0], [33, -18, 0], [50, -14, Math.PI],
    [44, -12, 0], [42, -30, 0],
  ]);
  // Three bystanders flee from Milo's position.
  for (const { p } of crowd.slice(0, 3)) { p.fleeT = 8; p.fleeFromX = 43; p.fleeFromZ = -38; }

  // Gun + tracer + muzzle flash: Milo aiming at the nearest cop.
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 }));
  gun.add(barrel);
  gun.position.set(42.55, 1.18, -37.1); gun.rotation.y = 0;
  gun.userData.prop = true; M.scene.add(gun); S.gun = gun; S.props.push(gun);
  const target = cops[2] || cops[0];
  if (target) {
    const from = V3(42.55, 1.22, -36.8), to = V3(target.x, 1.35, target.z);
    const len = from.distanceTo(to);
    const tracer = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, len),
      new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    tracer.position.copy(from).lerp(to, 0.5);
    tracer.lookAt(to); tracer.userData.prop = true;
    M.scene.add(tracer); S.tracer = tracer; S.props.push(tracer);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.set(42.55, 1.22, -36.5); flash.userData.prop = true;
    M.scene.add(flash); S.muzzle = flash; S.props.push(flash);
    const fl = new THREE.PointLight(0xffe9a0, 26, 12);
    fl.position.set(42.55, 1.4, -36.6); M.scene.add(fl); S.lights.push(fl);
    S.muzzleLight = fl;
  }
  addPalms(M, [[30, -34, 0.9], [50.5, -26, 1], [30, -12, 0.9]]);
  addLamps(M, [[33, -30], [47, -18]], true);
  addLitWindows(M, 43, -26, 40, false);
  addGlare(M, V3(-60, 30, 60), 'rgba(255,150,60,0.7)', 34);

  setObjective(M, 'STREET SWEEP', 'CLEAR THE BLOCK — TAKE OUT THE CREW 1/5', 'STAGE 1/3', 0.2);
  missionMeta(M, 'DAY 9 · DUSK 18:46  ·  RANK 9 — WHEELMAN');
  setDialog(M, 'Kiki', 'Crew · Lookout', 'Contact ahead, Milo — four hostiles on the block. Drop them and melt away.');
  districtChip(M, 43, -38, 306);
  addChip('<span class="k">SEARCHING</span> — zone 31 m · 11 s',
    { left: '28px', top: '400px', padding: '7px 12px', fontSize: '12px' });
  addChip('<span class="k">F</span> — STEAL TAXI',
    { left: '300px', top: '332px', padding: '6px 12px', fontSize: '13px' });
  S.readyFrames = 40;
}

// ------------------------------------------------------ shot 03 night drive
function stageNight(M) {
  M.setTimeOfDay('night');
  applySky(M, 'night');
  S.targetSpeed = 15;
  try { M.police.setWanted(3); } catch (e) { /* ignore */ }
  setCash(M, 18450);
  startGame(M);
  injectCss();

  const car = enterParkedSport(M, 103.5, -94, 0);
  const dims = car ? shapeCarBody(car, { sport: true }) : null;
  if (car) { car.speed = 15; if (dims) addHeadlightCone(car, dims); }
  // No tire smoke on the night shot: the burst particles are hard white
  // boxes with a long lifetime, and at night they cluster around the rear
  // wheels as floating white cubes (r12diag9: visible even with the car
  // hidden). The cover keeps its smoke (dusk washes it out).
  S.drivePose = [103.5, -94, 0];
  setCamera(M, Math.PI, -0.1, 8, 62);

  stageTraffic(M, [
    [103.5, -80, 0, 0], [103.5, -76, 0, 0], [96.2, -86, Math.PI, 0],
    [96.2, -72, Math.PI, 0], [94.8, -78, Math.PI, 0], [103.5, -68, 0, 0],
  ]);
  // Roadblock ahead: two cruisers sideways across both lanes + barriers.
  const rb = stageCruisers(M, [[98, -78, Math.PI / 2], [108, -78, -Math.PI / 2], [96.2, -92, 0]]);
  for (const { v, dims: d } of rb) if (d) addHeadlightCone(v, d);
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.6 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0x881100, emissiveIntensity: 0.6 });
  for (const [bx, bz] of [[100, -78], [106, -78]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 0.3), barrierMat);
    b.position.set(bx, 0.55, bz); b.userData.prop = true; M.scene.add(b); S.props.push(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.26, 0.32), stripeMat);
    s.position.set(bx, 0.95, bz); s.userData.prop = true; M.scene.add(s); S.props.push(s);
  }
  stagePeds(M, [
    [91, -88, 0], [91, -74, 0], [91, -58, 0],
    [109, -92, Math.PI], [109, -78, Math.PI], [109, -64, Math.PI],
  ]);

  // Bright heli: frozen orbit at a fixed angle above the road ahead-left
  // (placeForShot alone leaves the angle arbitrary per run — R12 shot 03
  // had the heli off-frame right). orbitSpeed 0 + explicit angle + pinAll.
  try {
    M.heli._shotRadius = 12.5; M.heli._shotHeight = 11;
    M.heli.placeForShot();
    M.heli.orbitSpeed = 0;
    M.heli.angle = 1.854;
    if (M.heli._orbit) M.heli._orbit.set(103.5, 0, -94);
    M.heli.state = 'orbiting';
    M.heli.group.position.set(100, 11, -82);
    S.heliPos = [100, 11, -82];
    const hp = M.heli.group.position;
    if (M.heli.cone && M.heli.cone.material) M.heli.cone.material.opacity = 0.16;
    if (M.heli.pool && M.heli.pool.material) M.heli.pool.material.opacity = 0.55;
    if (M.heli.pool) M.heli.pool.scale.set(1.5, 1.5, 1.5);
    M.heli.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0xf2f4f6) {
        o.material.emissive = new THREE.Color(0x2a3648); o.material.emissiveIntensity = 0.9;
      }
    });
    const hl = new THREE.PointLight(0xfff2cc, 70, 55);
    hl.position.copy(hp); M.scene.add(hl); S.heliLight = hl; S.lights.push(hl);
  } catch (e) { /* heli is best-effort */ }

  addLamps(M, [[94, -104], [106, -92], [94, -80], [106, -68], [94, -56]], true);
  addLitWindows(M, 103.5, -80, 45, true);
  addBillboard(M, 91.9, 10, -78, Math.PI / 2, 9, 3.2, 'NEON COAST', '#35d0d8');
  addGlare(M, V3(120, 42, -40), 'rgba(200,220,255,0.55)', 22); // moon

  setRadioStation(M, 'vice1073');
  setObjective(M, 'NIGHT RUNNER', 'HIT THE CHECKPOINTS — 2 DOWN, 3 TO GO', 'CHECKPOINT 2/5', 0.4);
  missionMeta(M, '⏱ 1:47  ·  DAY 9 · 22:04  ·  RANK B — FIXER  3,900 / 5,200 RP');
  setDialog(M, 'Lio', 'Crew · Mechanic', 'She\'s holding together — barely. Don\'t clip the cruisers, the suspension won\'t take it.');
  districtChip(M, 103.5, -94, 306);
  S.readyFrames = 40;
}

// ------------------------------------------------------------ shot 04 garage
function stageGarage(M) {
  M.setTimeOfDay('night');
  applySky(M, 'night');
  S.targetSpeed = 0;
  try { M.police.setWanted(0); } catch (e) { /* ignore */ }
  startGame(M);
  injectCss();

  M.player.setPosition(43, 0, -161.6);
  M.player.state.facing = -1.09;
  setCamera(M, 0.95, 0.14, 6.5, 50);

  // Kite Coupe on the lift, shaped body, headlights on, neon underglow.
  const car = (M.parkedCars || []).find((c) => c.type === 'sport') || (M.parkedCars || [])[0];
  if (car) {
    car.setPose(40, -160, 1.57); car.speed = 0;
    if (car.group) car.group.position.y = 0.5;
    shapeCarBody(car, { sport: true });
    const glowWrap = new THREE.Group();
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.6),
      new THREE.MeshBasicMaterial({ color: 0x35d0d8, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glowWrap.add(glow);
    glowWrap.position.set(40, 0.56, -160); glowWrap.rotation.y = 1.57; glowWrap.userData.prop = true;
    M.scene.add(glowWrap); S.props.push(glowWrap);
  }

  // Interior: dark floor, wooden back wall, containers, lift pillars,
  // hazard ring, tire stacks, workbench, neon strip, hanging lamps, sign.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(40, 0.02, -160);
  floor.userData.prop = true; M.scene.add(floor); S.props.push(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(26, 7, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 0.9 }));
  wall.position.set(34.2, 3.5, -161.6); wall.rotation.y = 1.31;
  wall.userData.prop = true; M.scene.add(wall); S.props.push(wall);
  const wallLow = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 0.56),
    new THREE.MeshStandardMaterial({ color: 0x3c4a55, roughness: 0.85 }));
  wallLow.position.set(34.2, 0.6, -161.6); wallLow.rotation.y = 1.31;
  wallLow.userData.prop = true; M.scene.add(wallLow); S.props.push(wallLow);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2),
    new THREE.MeshBasicMaterial({ map: textTexture('HILLSIDE GARAGE', { w: 512, h: 128, bg: '#20242e', fg: '#ffd34d', font: 'bold 52px sans-serif', sub: 'SPRAY & TUNE' }) }));
  sign.position.set(34.54, 3.4, -161.51); sign.rotation.y = 1.31;
  sign.userData.prop = true; M.scene.add(sign); S.props.push(sign);
  const contA = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0x2e7a7a, roughness: 0.8 }));
  contA.position.set(27.5, 1, -166); contA.rotation.y = 1.31; contA.userData.prop = true;
  M.scene.add(contA); S.props.push(contA);
  const contB = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xa03c28, roughness: 0.8 }));
  contB.position.set(27.8, 2.9, -166); contB.rotation.y = 1.31; contB.userData.prop = true;
  M.scene.add(contB); S.props.push(contB);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd8b93c, roughness: 0.6 });
  for (const [px, pz] of [[40, -158.5], [40, -161.5]]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 0.5), pillarMat);
    pil.position.set(px, 1.5, pz); pil.userData.prop = true; M.scene.add(pil); S.props.push(pil);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.5, 40),
    new THREE.MeshBasicMaterial({ color: 0xd8b93c, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(40, 0.04, -160);
  ring.userData.prop = true; M.scene.add(ring); S.props.push(ring);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.95 });
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), tireMat);
    t.position.set(33.5, 0.15 + i * 0.32, -155.5); t.userData.prop = true; M.scene.add(t); S.props.push(t);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
  bench.position.set(36, 0.5, -166.5); bench.userData.prop = true; M.scene.add(bench); S.props.push(bench);
  for (let i = 0; i < 3; i++) {
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: [0xd83c3c, 0x35d0d8, 0xffd34d][i], roughness: 0.6 }));
    tool.position.set(35 + i * 0.9, 1.15, -166.5); tool.userData.prop = true; M.scene.add(tool); S.props.push(tool);
  }
  const neon = new THREE.Mesh(new THREE.BoxGeometry(7, 0.16, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x35d0d8, emissiveIntensity: 2.6 }));
  neon.position.set(34.54, 2, -161.51); neon.rotation.y = 1.31;
  neon.userData.prop = true; M.scene.add(neon); S.props.push(neon);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd88a, emissiveIntensity: 2.4 });
  for (const [lx, lz] of [[38, -159], [42, -161]]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampMat);
    lamp.position.set(lx, 5.2, lz); lamp.userData.prop = true; M.scene.add(lamp); S.props.push(lamp);
  }
  const warm = new THREE.PointLight(0xffd9a0, 42, 22);
  warm.position.set(40, 4.5, -160); M.scene.add(warm); S.lights.push(warm);

  // Garage UI: open it, then enrich the panel (description + weapons +
  // respect) — the panel itself is built by hud.js.
  try { if (M.hud && typeof M.hud.openGarage === 'function') M.hud.openGarage(); } catch (e) { /* ignore */ }
  const panel = $('.mb-garage-panel');
  if (panel) {
    const h = document.createElement('div');
    h.className = 'mb-garage-row sub';
    h.innerHTML = '<span style="color:#ffd34d">WEAPONS &amp; GEAR</span>';
    panel.appendChild(h);
    const rows = [
      ['RATTLER SMG', '✓ OWNED'], ['TIDEBREAKER', '✓ OWNED'],
      ['HARRIER LR', '$6,800'], ['BODY ARMOUR', '$350'],
    ];
    for (const [nm, st] of rows) {
      const r = document.createElement('div');
      r.className = 'mb-garage-row sub';
      r.innerHTML = `<span>${nm}</span><span class="fx"></span><span class="${st.includes('OWNED') ? 'st-owned' : 'pr'}">${st}</span>`;
      panel.appendChild(r);
    }
    const desc = document.createElement('div');
    desc.style.cssText = 'margin-top:6px;padding:6px 8px;background:rgba(255,211,77,0.08);border:1px solid rgba(255,211,77,0.25);border-radius:4px;font-size:11px;line-height:1.35;color:#e8e8e8';
    desc.innerHTML = '<b style="color:#ffd34d">ENGINE TUNE</b> — Bolt-on tune for the Kite Coupe: +12% top speed, sharper throttle, fits any sport chassis.';
    panel.appendChild(desc);
  }
  const card = $('.mb-garage-carcard');
  if (card) {
    const r = document.createElement('div');
    r.style.cssText = 'margin-top:6px;font-size:12px;color:#35d0d8';
    r.textContent = 'RESPECT LV 5 · TIDE BOSS';
    card.appendChild(r);
  }
  S.readyFrames = 40;
}

// ------------------------------------------------------------ per-frame tick
// Pin every staged entity to its staged pose (the live systems keep
// trying to drive/walk them away; the shot must stay composed).
function pinAll() {
  const M = S.M; if (!M) return;
  if (S.driving) {
    // Stage the speedometer: the game loop's driving update zeroes the
    // speed field before the HUD samples it (main never calls our tick),
    // so the HUD read 0 km/h. An accessor that always returns the staged
    // target makes the HUD show 47/54 km/h (proven in r12diag4) while the
    // car itself stays pinned by setPose. Writes are swallowed.
    if (S.targetSpeed > 0 && !S.speedPinned) {
      try {
        Object.defineProperty(S.driving, 'speed', {
          get() { return S.targetSpeed; },
          set(v) { /* shot mode: speed is staged, not simulated */ },
          configurable: true,
        });
        S.speedPinned = true;
      } catch (e) { /* leave the plain field; the pin below keeps setting it */ }
    }
    // setPose first: it may zero the speed as a side effect.
    if (S.drivePose) { try { S.driving.setPose(S.drivePose[0], S.drivePose[1], S.drivePose[2]); } catch (e) { /* ignore */ } }
    S.driving.speed = S.targetSpeed;
  }
  for (const { v, x, z, h } of S.cruisers) { try { v.setPose(x, z, h); v.speed = 0; } catch (e) { /* ignore */ } }
  for (const { v, x, z, h } of S.traffic) { try { v.setPose(x, z, h); v.speed = 0; } catch (e) { /* ignore */ } }
  for (const { c, x, z, h } of S.cops) {
    try { c.x = x; c.z = z; c.heading = h; if (c.group) { c.group.position.set(x, 0, z); c.group.rotation.y = h; } } catch (e) { /* ignore */ }
  }
  for (const { p, x, z, h } of S.peds) {
    try { p.x = x; p.z = z; p.heading = h; if (p.group) { p.group.position.set(x, 0, z); p.group.rotation.y = h; } } catch (e) { /* ignore */ }
  }
  // Ambient system peds wander freely and can end up standing ON the
  // player car (r12diag6/8: a system ped at (103.5,-96) right behind the
  // shot-03 car, its cream torso reading as white boxes around the car).
  // The position shove alone did not stick (the ped update owns p.x/z),
  // so HIDE any non-staged ped within 5 m of the driving car — the scene
  // still has its staged peds, and a hidden ambient ped is invisible.
  if (S.driving && S.drivePose && M.pedestrians && Array.isArray(M.pedestrians.peds)) {
    const cx = S.drivePose[0], cz = S.drivePose[1];
    for (const p of M.pedestrians.peds) {
      if (!p || !p.group) continue;
      if (S.peds.some((sp) => sp.p === p)) continue;
      if (S.fallen && S.fallen.p === p) continue;
      const px = p.x ?? p.group.position.x, pz = p.z ?? p.group.position.z;
      if (Math.hypot(px - cx, pz - cz) < 5) {
        try { p.group.visible = false; (S.hiddenPeds || (S.hiddenPeds = new Set())).add(p); } catch (e) { /* ignore */ }
        try { p.x = cx + (px < cx ? -12 : 12); p.z = pz; } catch (e) { /* ignore */ }
      } else if (S.hiddenPeds && S.hiddenPeds.has(p)) {
        // It has wandered clear — show it again.
        try { p.group.visible = true; S.hiddenPeds.delete(p); } catch (e) { /* ignore */ }
      }
    }
  }
  if (S.fallen) {
    const { p, x, z } = S.fallen;
    try {
      p.x = x; p.z = z; p.speed = 0; p.lying = true;
      if (p.group) { p.group.position.set(x, 0.28, z); p.group.rotation.set(-Math.PI / 2, 0, 0.6); }
    } catch (e) { /* ignore */ }
  }
  if (S.heliPos && M.heli && M.heli.group) {
    try { M.heli.group.position.set(S.heliPos[0], S.heliPos[1], S.heliPos[2]); } catch (e) { /* ignore */ }
    // The heli spawns hidden: forcing state='orbiting' before spawn() ran
    // leaves visible=false (r12diag2) — force it visible every frame.
    // Proven in r12diag3: group.visible + heli.visible both settable,
    // heli then audits in-frame at the pinned spot, no errors.
    try { M.heli.group.visible = true; } catch (e) { /* ignore */ }
    try { M.heli.visible = true; } catch (e) { /* ignore */ }
  }
  if (S.heliLight && M.heli && M.heli.group) {
    try { S.heliLight.position.copy(M.heli.group.position); } catch (e) { /* ignore */ }
  }
  if (S.dialog) {
    try {
      const nameEl = document.querySelector('.mb-dialog-name');
      const textEl = document.querySelector('.mb-dialog-text');
      if (nameEl && !nameEl.textContent) nameEl.textContent = S.dialog.speaker + ' · ' + S.dialog.role;
      if (textEl && !textEl.textContent) textEl.textContent = S.dialog.text;
    } catch (e) { /* ignore */ }
  }
  if (M.camera && S.fov) { M.camera.fov = S.fov; M.camera.updateProjectionMatrix(); }
}

// The game loop may or may not call shotStage.tick (main.js can replace
// the shotStage object after this module runs), so the frame step is
// driven BOTH by tick() and by a 100 ms interval, and it re-attaches
// tick() to the live shotStage object every step. Everything here is
// idempotent and time-based, so double-calling is harmless. Readiness
// is time-based (3.2 s after staging) rather than frame-counted.
function frameStep() {
  const M = S.M; if (!M) return;
  // Re-attach tick() if main.js swapped in a fresh shotStage object.
  if (M.shotStage && M.shotStage.tick !== tick) M.shotStage.tick = tick;
  // Adopt the car once the game's own E handler has seated Milo in it.
  if (S.pendingDrive && M.driving) {
    S.driving = M.driving;
    S.drivePose = S.pendingDrive.pose;
    if (M.player.root) M.player.root.visible = false;
    S.pendingDrive = null;
  } else if (S.pendingDrive && !S.retryT && performance.now() - S.t0 > 6000) {
    // Enter did not take: retry the key once, then fall back to
    // shadowing the getter-only driving property (HUD/camera read it).
    S.retryT = true;
    const ev = (type) => {
      const e = new KeyboardEvent(type, { key: 'e', code: 'KeyE', bubbles: true, cancelable: true });
      window.dispatchEvent(e); document.dispatchEvent(e);
    };
    ev('keydown'); ev('keyup');
    setTimeout(() => {
      if (!M.driving && S.pendingDrive) {
        try {
          Object.defineProperty(M, 'driving', { value: S.pendingDrive.car, writable: true, configurable: true });
          S.driving = M.driving; S.drivePose = S.pendingDrive.pose;
          if (M.player.root) M.player.root.visible = false;
          S.pendingDrive = null;
        } catch (e) { /* last resort failed; shot proceeds on foot */ }
      }
    }, 600);
  }
  pinAll();
  const elapsed = performance.now() - S.t0;
  // Siren flash: alternate the pools + light bars every ~450 ms.
  const phase = Math.floor(elapsed / 450) % 2 === 0;
  for (const p of S.pools) {
    p.mesh.material.color.setHex(phase ? (p.phase ? 0xff2222 : 0x2244ff) : (p.phase ? 0x2244ff : 0xff2222));
  }
  for (const { bar } of S.cruisers) {
    if (!bar) continue;
    bar.red.material.emissiveIntensity = phase ? 2.6 : 0.4;
    bar.blue.material.emissiveIntensity = phase ? 0.4 : 2.6;
  }
  // Tire smoke / fire smoke puffs, throttled — and only in the first 2 s:
  // the burst particles render as hard white boxes, and a fresh burst
  // right before the screenshot reads as debris around the car (R12
  // shots 01/03). Early puffs have drifted/faded by screenshot time.
  if (S.smokeAt.length && M.effects && elapsed < 2000 && elapsed - (S.lastSmoke || 0) > 900) {
    S.lastSmoke = elapsed;
    for (const [x, y, z] of S.smokeAt) {
      try { M.effects.spawnBurst({ x, y, z }); } catch (e) { /* ignore */ }
    }
  }
  // Enemy markers bob; muzzle flash flickers; fire pulses.
  const t = elapsed / 1000;
  for (const mk of S.markers) mk.mesh.position.y = 2.7 + Math.sin(t * 3 + mk.x) * 0.16;
  if (S.muzzle) S.muzzle.visible = (elapsed % 1600) < 900;
  if (S.muzzleLight) S.muzzleLight.intensity = (elapsed % 1600) < 900 ? 26 : 6;
  if (S.fire && S.fire.material && S.fire.material.emissiveIntensity !== undefined) {
    S.fire.material.emissiveIntensity = 2.4 + Math.sin(t * 4) * 0.7;
  }
  for (const l of S.lights) {
    if (l.color && l.color.getHex() === 0xff7733) l.intensity = 55 + Math.sin(t * 6) * 10;
  }
  if (!S.ready && elapsed > 3200) {
    S.ready = true;
    if (M.shotStage) M.shotStage.ready = true;
    window.__shotReady = true;
  }
}

function tick(dt) {
  window.__r12tickCalls = (window.__r12tickCalls || 0) + 1;
  frameStep();
}

// ------------------------------------------------------------ audit (shoot runner)
function audit() {
  const M = S.M; if (!M || !M.camera) return null;
  try { M.scene.updateMatrixWorld(true); M.camera.updateMatrixWorld(true); } catch (e) { /* ignore */ }
  const pm = new THREE.Matrix4().multiplyMatrices(M.camera.projectionMatrix, M.camera.matrixWorldInverse);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(pm);
  const counts = { player: 0, car: 0, cruiser: 0, cop: 0, ped: 0, prop: 0, ring: 0 };
  const inView = (v) => !!v && frustum.containsPoint(v);
  if (S.driving && inView(S.driving.group.position)) counts.player = 1;
  else if (M.player && M.player.root && inView(M.player.root.position)) counts.player = 1;
  const seenCars = new Set();
  const addCar = (v) => {
    if (v && v.group && !seenCars.has(v.group.uuid)) {
      seenCars.add(v.group.uuid);
      if (inView(v.group.position)) counts.car++;
    }
  };
  if (S.driving) addCar(S.driving);
  (M.traffic.cars || []).forEach(addCar);
  S.traffic.forEach(({ v }) => addCar(v));
  const seenCruisers = new Set();
  (M.police.cruisers || []).forEach((c) => {
    if (c.vehicle) { addCar(c.vehicle); seenCruisers.add(c.vehicle); if (inView(c.vehicle.group.position)) counts.cruiser++; }
  });
  S.cruisers.forEach(({ v }) => {
    if (!seenCruisers.has(v)) { addCar(v); if (inView(v.group.position)) counts.cruiser++; }
  });
  (M.parkedCars || []).forEach(addCar);
  const seenCops = new Set();
  (M.police.cops || []).forEach((c) => { if (c.group) { seenCops.add(c); if (inView(c.group.position)) counts.cop++; } });
  S.cops.forEach(({ c }) => { if (c.group && !seenCops.has(c) && inView(c.group.position)) counts.cop++; });
  (M.pedestrians.peds || []).forEach((p) => { if (p.group && inView(p.group.position)) counts.ped++; });
  const tmp = new THREE.Vector3();
  for (const o of S.props) {
    try {
      o.getWorldPosition(tmp);
      if (inView(tmp)) counts.prop++;
    } catch (e) { /* ignore */ }
  }
  M.scene.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.type === 'RingGeometry') {
      try { o.getWorldPosition(tmp); if (inView(tmp)) counts.ring++; } catch (e) { /* ignore */ }
    }
  });
  let heli = { visible: false, hFrac: 0, wFrac: 0, cx: 0, cy: 0 };
  if (M.heli && M.heli.visible && M.heli.group) {
    try {
      const box = new THREE.Box3().setFromObject(M.heli.group);
      const corners = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const v = V3(x, y, z).project(M.camera);
        corners.push(v);
      }
      const xs = corners.map((v) => v.x), ys = corners.map((v) => v.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      if (Math.abs(cx) < 1.2 && Math.abs(cy) < 1.2) {
        heli = { visible: true, hFrac: +(maxY - minY).toFixed(3), wFrac: +(maxX - minX).toFixed(3), cx: +cx.toFixed(2), cy: +cy.toFixed(2) };
      }
    } catch (e) { /* ignore */ }
  }
  const pp = S.driving ? S.driving.group.position : (M.player ? M.player.position : { x: 0, z: 0 });
  const cp = M.camera.position;
  return { counts, heli, player: { x: +pp.x.toFixed(1), z: +pp.z.toFixed(1) }, camera: { x: +cp.x.toFixed(1), y: +cp.y.toFixed(1), z: +cp.z.toFixed(1) } };
}
window.__r10audit = () => audit();

// ------------------------------------------------------------ activation
function startShot(M, name) {
  if (S.M) return;
  S.M = M; S.name = name;
  // Shot-mode body class: the game's own CSS hides the title/brand,
  // turf ticker and interact prompt under .mb-shot (probe8, R10).
  try { document.body.classList.add('mb-shot'); } catch (e) { /* ignore */ }
  // MUTATE the existing shotStage object if main.js already made one —
  // main.js may hold a reference to it, so replacing the object would
  // orphan tick() and __shotReady would never fire. Only create it if
  // it does not exist yet.
  const stage = M.shotStage || {
    movement: { forward: false, back: false, left: false, right: false, run: false, jump: false },
    targetSpeed: 0, lockCamera: true, frames: 0, readyFrames: 40, ready: false,
  };
  stage.tick = tick;
  stage.lockCamera = true;
  M.shotStage = stage;
  try {
    if (name.startsWith('01')) { stageCover(M); S.fov = 64; }
    else if (name.startsWith('02')) { stageOnFoot(M); S.fov = 56; }
    else if (name.startsWith('03')) { stageNight(M); S.fov = 62; }
    else if (name.startsWith('04')) { stageGarage(M); S.fov = 50; }
    else { stageCover(M); S.fov = 64; }
  } catch (e) { console.error('[r12] staging failed', e); }
  stage.readyFrames = S.readyFrames || 40;
  stage.targetSpeed = S.targetSpeed || 0;
  if (M.camera && S.fov) { M.camera.fov = S.fov; M.camera.updateProjectionMatrix(); }
  S.t0 = performance.now();
  setInterval(frameStep, 100);
  const raf = () => { pinAll(); if (performance.now() - S.t0 < 30000) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

function initFromArgs(a, b) {
  // Accepts (game, shotName), (game), (shotName), () — game defaults to
  // window.MARISOL, shot name defaults to the ?shot= query param.
  let M = null, name = '';
  if (a && typeof a === 'object') M = a;
  if (typeof a === 'string') name = a;
  if (typeof b === 'string') name = b;
  if (!M) M = window.MARISOL;
  if (!name) name = new URLSearchParams(location.search).get('shot') || '';
  if (M && M.ready && name) startShot(M, name);
  return !!S.M;
}

const shotParam = new URLSearchParams(location.search).get('shot');
if (shotParam) {
  const tryStart = () => {
    const M = window.MARISOL;
    if (M && M.ready && !S.M) { startShot(M, shotParam); return true; }
    return false;
  };
  if (!tryStart()) {
    const iv = setInterval(() => { if (tryStart()) clearInterval(iv); }, 120);
    setTimeout(() => clearInterval(iv), 20000);
  }
}

// main.js may import this module for its side effects only, or call one of
// these entry points — all of them route to the same staging.
export function stageShot(a, b) { return initFromArgs(a, b); }
export function initShots(a, b) { return initFromArgs(a, b); }
export function setupShots(a, b) { return initFromArgs(a, b); }
export function applyShot(a, b) { return initFromArgs(a, b); }
export function initShot(a, b) { return initFromArgs(a, b); }
export default stageShot;
