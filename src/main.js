import * as THREE from '../vendor/three.module.min.js';
import { buildCity, PITCH, BLOCKS } from './city.js?v=7';
import { Tilt } from './tilt.js?v=7';
import { Car } from './car.js?v=7';

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
const ALT_MIN = 185, ALT_MAX = 380, ALT_START = 215;   // flight altitude range (clears every tower)
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

const LIMIT = (BLOCKS / 2 - 2) * PITCH;
const suspect = new Car(THREE, PITCH, LIMIT, { seed: 7, color: 0xff8a00, flee: true, speed: 28 });
scene.add(suspect.group);
const CIV_COLORS = [0x19f2ff, 0xffffff, 0x33ff8c, 0x8a5cff, 0xff3df2, 0xffe14a];
const civs = [];
for (let i = 0; i < 16; i++) {
  const c = new Car(THREE, PITCH, LIMIT, { seed: 100 + i * 31, color: CIV_COLORS[i % CIV_COLORS.length], speed: 20 + (i % 5) * 3 });
  civs.push(c); scene.add(c.group);
}
function respawnCiv(c, minR) {
  const a = c.rnd() * Math.PI * 2, r = minR + c.rnd() * 200;
  c.place(suspect.x + Math.cos(a) * r, suspect.z + Math.sin(a) * r);
}

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
const modeEl = $('mode'), startEl = $('start'), fillEl = $('fill'), statEl = $('stat'), arrowEl = $('arrow'),
  retEl = $('ret'), meterEl = $('meter'), timerEl = $('timer'), endEl = $('end'), stickEl = $('stick');

// --- Light pilot influence: drag = orbit left/right + altitude. Arrow keys on desktop. ---
const stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
const keys = {};
canvas.addEventListener('pointerdown', (e) => {
  if (!tilt.gyroSeen || stick.id !== null) return;   // without gyro, drag is the look control
  stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY;
  stickEl.style.display = 'block'; stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px';
  stickEl.firstElementChild.style.transform = '';
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stick.id) return;
  const c = (v) => Math.max(-1, Math.min(1, v / 55));
  stick.x = c(e.clientX - stick.ox); stick.y = c(e.clientY - stick.oy);
  stickEl.firstElementChild.style.transform = `translate(${stick.x * 32}px,${stick.y * 32}px)`;
});
const endStick = (e) => { if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; stickEl.style.display = 'none'; } };
window.addEventListener('pointerup', endStick);
window.addEventListener('pointercancel', endStick);
window.addEventListener('keydown', (e) => { keys[e.key] = true; });
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

// --- Round state ---
const ROUND = 90, LOSE_AFTER = 8, COS_HIT = Math.cos(5.2 * Math.PI / 180);
const lamp = city.U.uLamp.value, beam = city.U.uBeam.value;
const fwd = new THREE.Vector3(), toCar = new THREE.Vector3(), carPos = new THREE.Vector3(), ndc = new THREE.Vector3();
const heliQ = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
const known = { x: 0, z: 0 };            // last known suspect position (what the autopilot chases)
let state = 'ready';                     // ready | play | over
let heading, turnRate, heliSpeed, alt, contact, lit, timeLeft, zeroT, litTime, played;

function reset() {
  suspect.place(0, 0); suspect.lit = 0;
  civs.forEach((c) => respawnCiv(c, 60));
  heli.position.set(suspect.x - suspect.dx * 160, 0, suspect.z - suspect.dz * 160);   // start behind it
  heading = Math.atan2(-suspect.dx, -suspect.dz); turnRate = 0; heliSpeed = 0; alt = ALT_START;
  contact = 0.6; lit = 0; timeLeft = ROUND; zeroT = 0; litTime = 0; played = 0;
  known.x = suspect.x; known.z = suspect.z;
}
reset();

function finish(win) {
  state = 'over';
  endEl.classList.toggle('lose', !win);
  $('endT').textContent = win ? 'SUSPECT IN CUSTODY' : 'SUSPECT LOST';
  const pct = Math.round(100 * litTime / Math.max(1, played));
  $('endS').innerHTML = (win ? 'BACKUP ON SCENE — GROUND UNITS MOVED IN' : 'CONTACT LOST — PURSUIT TERMINATED')
    + `<br>EYES ON SUSPECT ${pct}% OF ${Math.round(played)}s`;
  endEl.classList.remove('off');
}
startEl.addEventListener('click', async () => {
  startEl.classList.add('off');
  await tilt.enableGyro();
  reset(); state = 'play';
}, { once: true });
$('again').addEventListener('click', () => { endEl.classList.add('off'); tilt.recenter(); reset(); state = 'play'; });

const inCone = (x, z) => {
  toCar.set(x, 2.5, z).sub(lamp);
  const d = toCar.length();
  return d < 1000 && toCar.dot(beam) / d > COS_HIT;
};

const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  // --- Cars ---
  suspect.update(dt, lit);
  carPos.set(suspect.x, 2.5, suspect.z);
  for (const c of civs) {
    if (Math.hypot(c.x - suspect.x, c.z - suspect.z) > 520) respawnCiv(c, 280);
    c.update(dt, inCone(c.x, c.z) ? 1 : 0);
  }

  // --- Autopilot: keep the last known suspect position dead ahead, with a helicopter's slow turn. ---
  if (contact > 0) { known.x = suspect.x; known.z = suspect.z; }
  const hx = known.x - heli.position.x, hz = known.z - heli.position.z;
  const hd = Math.hypot(hx, hz);
  let dh = hd > 5 ? Math.atan2(-hx, -hz) - heading : 0; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const wantRate = Math.max(-0.75, Math.min(0.75, dh * 1.4));
  turnRate += (wantRate - turnRate) * Math.min(1, dt * 2.5);
  heading += turnRate * dt;
  const wantSpeed = Math.max(-40, Math.min(62, (hd - 80) * 0.7)) * Math.max(0, Math.cos(dh));
  heliSpeed += (wantSpeed - heliSpeed) * Math.min(1, dt * 1.2);
  // Pilot influence: strafe (which becomes an orbit, since the nose keeps tracking) and altitude.
  const sx = stick.x + (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  const sy = stick.y + (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
  const sn = Math.sin(heading), cs = Math.cos(heading);
  heli.position.x += (-sn * heliSpeed + cs * sx * 55) * dt;
  heli.position.z += (-cs * heliSpeed - sn * sx * 55) * dt;
  alt = Math.max(ALT_MIN, Math.min(ALT_MAX, alt - sy * 70 * dt));
  heli.rotation.y = heading;
  heliQ.setFromAxisAngle(yAxis, heading);

  tilt.update(dt, t);
  if (tilt.look) {
    camera.position.set(heli.position.x, alt, heli.position.z);
    camera.quaternion.copy(heliQ).multiply(tilt.camQ);
    city.sky.position.copy(camera.position);
  } else {
    const d = EYE_DIST * WINDOW_HALF;
    updatePortal(tilt.x * d, tilt.y * d, d);
  }
  camera.updateMatrixWorld(true);

  // --- Spotlight: swings after the view with a little lag so you can see it move. ---
  camera.getWorldPosition(lamp);
  camera.getWorldDirection(fwd);
  beam.lerp(fwd, 1 - Math.exp(-dt * 9)).normalize();

  const aimed = inCone(suspect.x, suspect.z);
  const blocked = aimed && city.blocked(lamp.x, lamp.y, lamp.z, carPos.x, carPos.y, carPos.z);
  const visual = aimed && !blocked;
  lit += ((visual ? 1 : 0) - lit) * Math.min(1, dt * 8);

  // --- Round rules ---
  if (state === 'play') {
    played += dt; if (visual) litTime += dt;
    contact = Math.max(0, Math.min(1, contact + (visual ? 0.22 : -0.08) * dt));
    zeroT = contact <= 0 ? zeroT + dt : 0;
    timeLeft -= dt;
    if (zeroT >= LOSE_AFTER) finish(false);
    else if (timeLeft <= 0) { timeLeft = 0; finish(true); }
  }

  // --- HUD ---
  fillEl.style.transform = `scaleX(${contact.toFixed(3)})`;
  meterEl.classList.toggle('on', visual);
  retEl.classList.toggle('on', visual);
  const lost = contact <= 0 && state === 'play';
  statEl.classList.toggle('warn', lost);
  statEl.textContent = lost ? `CONTACT LOST ${Math.max(0, LOSE_AFTER - zeroT).toFixed(1)}`
    : visual ? 'VISUAL' : blocked ? 'BLOCKED' : 'NO VISUAL';
  const s = Math.ceil(timeLeft);
  timerEl.textContent = `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
  modeEl.textContent = tilt.mode + ` · ${Math.round(alt)}m`;

  // Edge arrow toward the suspect when off screen — only while we still have contact.
  ndc.copy(carPos).project(camera);
  toCar.copy(carPos).sub(lamp);
  const behind = toCar.dot(fwd) < 0;
  if (contact <= 0 || (!behind && Math.abs(ndc.x) < 0.92 && Math.abs(ndc.y) < 0.92)) arrowEl.style.opacity = 0;
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
window.__game = {
  tilt, camera, suspect, civs, heli, stick, city,
  get s() { return { state, contact, lit, timeLeft, zeroT, alt, heading }; },
};
