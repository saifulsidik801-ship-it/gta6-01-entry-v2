import * as THREE from 'three';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c6e8);
scene.fog = new THREE.Fog(0x87c6e8, 90, 240);

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
camera.position.set(16, 11, 26);
camera.lookAt(0, 2, 0);

scene.add(new THREE.HemisphereLight(0xbfe4ff, 0x8a7452, 0.85));

const sun = new THREE.DirectionalLight(0xffe6b8, 1.9);
sun.position.set(38, 52, 18);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshLambertMaterial({ color: 0x6f7d5a }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const blocks = [
  { x: -14, z: -8, w: 8, h: 12, d: 8, c: 0xd9c9ae },
  { x: 0, z: -16, w: 10, h: 20, d: 9, c: 0xc7b49a },
  { x: 15, z: -6, w: 7, h: 9, d: 11, c: 0xe2d3ba },
  { x: -6, z: 12, w: 9, h: 6, d: 7, c: 0xbfae95 },
  { x: 10, z: 16, w: 6, h: 15, d: 6, c: 0xd2c2a8 },
];

for (const b of blocks) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(b.w, b.h, b.d),
    new THREE.MeshLambertMaterial({ color: b.c }),
  );
  mesh.position.set(b.x, b.h / 2, b.z);
  scene.add(mesh);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

let angle = 0;

function frame() {
  angle += 0.0015;
  camera.position.x = Math.sin(angle) * 28;
  camera.position.z = Math.cos(angle) * 28;
  camera.lookAt(0, 4, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
