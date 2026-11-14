import * as THREE from '../vendor/three.module.min.js';
import { buildCity, PITCH, BLOCKS } from './city.js?v=6';
import { Tilt } from './tilt.js?v=6';
import { Suspect } from './car.js?v=6';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const FOG = new THREE.Color(0x0a0618);
const scene = new THREE.Scene();
scene.background = FOG;

// heli: the helicopter's position over the city. rig: legacy "portal" window frame (?portal=1).
const ALTITUDE = 170;      // portal window plane height above street
const WINDOW_HALF = 80;    // half of the window's shorter side, world units
const EYE_DIST = 2.6;      // eye distance from window, in WINDOW_HALF units
const EYE_HEIGHT = 215;    // 360-look mode: camera height above street
const heli = new THREE.Group();
const rig = new THREE.Group();
rig.rotation.x = -Math.PI / 2;
rig.position.y = ALTITUDE;
heli.add(rig);
scene.add(heli);

const camera = new THREE.PerspectiveCamera();
rig.add(camera);

const city = buildCity(THREE, FOG, ALTITUDE);
scene.add(city.group);
heli.add(city.rain);

const suspect = new Suspect(THREE, PITCH, (BLOCKS / 2 - 2) * PITCH);
scene.add(suspect.group);

let hw = WINDOW_HALF, hh = WINDOW_HALF;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const a = w / h;
  if (a < 1) { hw = WINDOW_HALF; hh = WINDOW_HALF / a; }
  else { hh = WINDOW_HALF; hw = WINDOW_HALF * a; }
  camera.aspect = a; camera.fov = a < 1 ? 75 : 55; camera.near = 2; camera.far = 6000;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// Off-axis (asymmetric) frustum through the fixed window rectangle.
function updatePortal(ex, ey, ez) {
  const n = 4, f = 4000, k = n / ez;
  camera.position.set(ex, ey, ez);
  camera.projectionMatrix.makePerspective(
    (-hw - ex) * k, (hw - ex) * k, (hh - ey) * k, (-hh - ey) * k, n, f);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

const tilt = new Tilt(THREE, canvas);
if (tilt.look) scene.add(camera);   // free camera, not tied to the window rig
resize();
const $ = (id) => document.getElementById(id);
const modeEl = $('mode'), startEl = $('start'), fillEl = $('fill'), statEl = $('stat'),
  arrowEl = $('arrow'), retEl = $('ret'), meterEl = $('meter');
startEl.addEventListener('click', async () => {
  startEl.classList.add('off');
  await tilt.enableGyro();
}, { once: true });

// --- Spotlight + visual contact ---
const lamp = city.U.uLamp.value, beam = city.U.uBeam.value;
const fwd = new THREE.Vector3(), toCar = new THREE.Vector3(), carPos = new THREE.Vector3(), ndc = new THREE.Vector3();
const heliQ = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
let heading = 0, turnRate = 0, heliSpeed = 0;   // heading 0 = facing -Z
heli.position.set(0, 0, 160);
const COS_HIT = Math.cos(5.2 * Math.PI / 180);
let contact = 0, lit = 0;

const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  suspect.update(dt, lit);
  carPos.set(suspect.x, 1.5, suspect.z);

  // Autopilot: turn (slowly, like a helicopter) to keep the suspect dead ahead and fly toward it,
  // holding a stand-off distance. The view is relative to the helicopter's nose.
  const hx = suspect.x - heli.position.x, hz = suspect.z - heli.position.z;
  const hd = Math.hypot(hx, hz);
  let dh = Math.atan2(-hx, -hz) - heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const wantRate = Math.max(-0.75, Math.min(0.75, dh * 1.4));
  turnRate += (wantRate - turnRate) * Math.min(1, dt * 2.5);
  heading += turnRate * dt;
  const wantSpeed = Math.max(-12, Math.min(62, (hd - 100) * 0.7)) * Math.max(0, Math.cos(dh));
  heliSpeed += (wantSpeed - heliSpeed) * Math.min(1, dt * 1.2);
  heli.position.x -= Math.sin(heading) * heliSpeed * dt;
  heli.position.z -= Math.cos(heading) * heliSpeed * dt;
  heli.rotation.y = heading;
  heliQ.setFromAxisAngle(yAxis, heading);

  tilt.update(dt, t);
  if (tilt.look) {
    camera.position.set(heli.position.x, EYE_HEIGHT, heli.position.z);
    camera.quaternion.copy(heliQ).multiply(tilt.camQ);
    city.sky.position.copy(camera.position);
  } else {
    const d = EYE_DIST * WINDOW_HALF;
    updatePortal(tilt.x * d, tilt.y * d, d);
  }
  camera.updateMatrixWorld(true);

  // Spotlight swings after the view with a little lag so you can see it move.
  camera.getWorldPosition(lamp);
  camera.getWorldDirection(fwd);
  beam.lerp(fwd, 1 - Math.exp(-dt * 9)).normalize();

  toCar.copy(carPos).sub(lamp);
  const dist = toCar.length();
  const cos = toCar.dot(beam) / dist;
  const inBeam = cos > COS_HIT && dist < 1000;
  lit += ((inBeam ? 1 : 0) - lit) * Math.min(1, dt * 8);
  contact = Math.max(0, Math.min(1, contact + (inBeam ? 0.22 : -0.1) * dt));

  // HUD
  fillEl.style.transform = `scaleX(${contact.toFixed(3)})`;
  meterEl.classList.toggle('on', inBeam);
  retEl.classList.toggle('on', inBeam);
  statEl.textContent = contact >= 1 ? 'SUSPECT LOCKED' : inBeam ? 'VISUAL' : 'NO VISUAL';
  modeEl.textContent = tilt.mode + (tilt.look ? ' · 360' : ' · PORTAL');

  // Edge arrow toward the suspect when it is off screen.
  ndc.copy(carPos).project(camera);
  const behind = toCar.dot(fwd) < 0;
  if (!behind && Math.abs(ndc.x) < 0.92 && Math.abs(ndc.y) < 0.92) arrowEl.style.opacity = 0;
  else {
    let ax = ndc.x * camera.aspect, ay = ndc.y;
    if (behind) { ax = -ax; ay = -ay; }
    const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
    const r = Math.min(window.innerWidth, window.innerHeight) * 0.4;
    arrowEl.style.opacity = 0.9;
    arrowEl.style.transform = `translate(${(ax * r).toFixed(1)}px,${(-ay * r).toFixed(1)}px) rotate(${Math.atan2(-ay, ax).toFixed(3)}rad)`;
  }

  city.update(t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Debug hook for automated checks.
window.__game = { tilt, camera, suspect, heli, get heading() { return heading; }, get contact() { return contact; }, get lit() { return lit; } };
