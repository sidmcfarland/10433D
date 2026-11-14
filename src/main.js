import * as THREE from '../vendor/three.module.min.js';
import { buildCity } from './city.js';
import { Tilt } from './tilt.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const FOG = new THREE.Color(0x0a0618);
const scene = new THREE.Scene();
scene.background = FOG;

// --- The "portal": the phone screen is a window in the helicopter floor. ---
// heli: moves/yaws over the city. rig: window frame, looking straight down.
const ALTITUDE = 170;      // window plane height above street
const WINDOW_HALF = 80;    // half of the window's shorter side, world units
const EYE_DIST = 2.6;      // eye distance from window, in WINDOW_HALF units
const heli = new THREE.Group();
const rig = new THREE.Group();
rig.rotation.x = -Math.PI / 2;
rig.position.y = ALTITUDE;
heli.add(rig);
scene.add(heli);

const camera = new THREE.PerspectiveCamera();
camera.matrixAutoUpdate = true;
rig.add(camera);

const city = buildCity(THREE, FOG, ALTITUDE);
scene.add(city.group);
heli.add(city.rain);

let hw = WINDOW_HALF, hh = WINDOW_HALF;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const a = w / h;
  if (a < 1) { hw = WINDOW_HALF; hh = WINDOW_HALF / a; }
  else { hh = WINDOW_HALF; hw = WINDOW_HALF * a; }
}
window.addEventListener('resize', resize);
resize();

// Off-axis (asymmetric) frustum through the fixed window rectangle.
function updatePortal(ex, ey, ez) {
  const n = 4, f = 4000, k = n / ez;
  camera.position.set(ex, ey, ez);
  camera.projectionMatrix.makePerspective(
    (-hw - ex) * k, (hw - ex) * k, (hh - ey) * k, (-hh - ey) * k, n, f);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

const tilt = new Tilt(THREE, canvas);
const modeEl = document.getElementById('mode');
const startEl = document.getElementById('start');
startEl.addEventListener('click', async () => {
  startEl.classList.add('off');
  await tilt.enableGyro();
}, { once: true });

const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  // Slow patrol orbit so the world is alive.
  const R = 260, w = 0.035;
  heli.position.set(Math.cos(t * w) * R, 0, Math.sin(t * w) * R);
  heli.rotation.y = -t * w;

  tilt.update(dt, t);
  const d = EYE_DIST * WINDOW_HALF;
  updatePortal(tilt.x * d, tilt.y * d, d);
  modeEl.textContent = tilt.mode;

  city.update(t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Debug hook for automated checks.
window.__game = { tilt, camera };
