import * as THREE from '../vendor/three.module.min.js';
import { buildCity, PITCH, BLOCKS } from './city.js?v=8';
import { Tilt } from './tilt.js?v=8';
import { Car } from './car.js?v=8';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const FOG = new THREE.Color(0x0a0618);
const scene = new THREE.Scene();
scene.background = FOG;

const camera = new THREE.PerspectiveCamera();
scene.add(camera);
const city = buildCity(THREE, FOG, 170);
scene.add(city.group);
const rainRig = new THREE.Group();      // rain volume follows the camera
rainRig.add(city.rain);
scene.add(rainRig);

// ---------- Cars ----------
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

// Player patrol car (ground unit): reuses the car body, adds a light bar.
const cruiser = new Car(THREE, PITCH, LIMIT, { color: 0x2a6bff });
cruiser.bodyMat.color.setScalar(0.5);
const barL = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1.5), new THREE.MeshBasicMaterial({ color: 0xff1030 }));
const barR = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1.5), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
barL.position.set(-0.5, 3.6, -0.85); barR.position.set(-0.5, 3.6, 0.85);
cruiser.group.add(barL, barR);
scene.add(cruiser.group);

// AI partner helicopter (seen from the ground) + its visible light cone.
const chopper = new THREE.Group();
{
  const dark = new THREE.MeshBasicMaterial({ color: 0x0b0a14 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 5), dark);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 1.2), dark); tail.position.set(-13, 1, 0);
  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 0.2, 20),
    new THREE.MeshBasicMaterial({ color: 0x8899bb, transparent: true, opacity: 0.18, depthWrite: false }));
  rotor.position.y = 3.4;
  const nav = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2030 }));
  nav.position.set(-19, 1.5, 0);
  const lampGlow = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xeaf4ff }));
  lampGlow.position.set(3, -3, 0);
  chopper.add(body, tail, rotor, nav, lampGlow);
  chopper.userData.nav = nav;
}
scene.add(chopper);
const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true);
coneGeo.translate(0, -0.5, 0);           // apex at origin, opening toward -Y
const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
  color: 0xbfd8ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
cone.frustumCulled = false;
scene.add(cone);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 75 : 55; camera.near = 1; camera.far = 6000;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Input ----------
const tilt = new Tilt(THREE, canvas);
const $ = (id) => document.getElementById(id);
const modeEl = $('mode'), startEl = $('start'), fillEl = $('fill'), statEl = $('stat'), arrowEl = $('arrow'),
  retEl = $('ret'), meterEl = $('meter'), timerEl = $('timer'), endEl = $('end'), stickEl = $('stick'),
  hintEl = $('hint'), mlabelEl = $('mlabel'), flashEl = $('flash'), pG = $('pG'), pB = $('pB');

let role = 'air';
const stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };   // air: drag = orbit + altitude
const touches = new Map();                               // ground: pedals (left half brake, right half gas)
const keys = {};
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, ox: e.clientX });
  if (role !== 'air' || !tilt.gyroSeen || stick.id !== null) return;   // without gyro, drag is the look control
  stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY;
  stickEl.style.display = 'block'; stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px';
  stickEl.firstElementChild.style.transform = '';
});
window.addEventListener('pointermove', (e) => {
  const tc = touches.get(e.pointerId); if (tc) tc.x = e.clientX;
  if (e.pointerId !== stick.id) return;
  const c = (v) => Math.max(-1, Math.min(1, v / 55));
  stick.x = c(e.clientX - stick.ox); stick.y = c(e.clientY - stick.oy);
  stickEl.firstElementChild.style.transform = `translate(${stick.x * 32}px,${stick.y * 32}px)`;
});
const endTouch = (e) => {
  touches.delete(e.pointerId);
  if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; stickEl.style.display = 'none'; }
};
window.addEventListener('pointerup', endTouch);
window.addEventListener('pointercancel', endTouch);
window.addEventListener('keydown', (e) => { keys[e.key] = true; });
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

// ---------- Shared round state ----------
const lamp = city.U.uLamp.value, beam = city.U.uBeam.value;
const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), carPos = new THREE.Vector3(), ndc = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
let state = 'ready';                     // ready | play | over
let played = 0, t = 0;

function finish(win, title, line) {
  state = 'over';
  endEl.classList.toggle('lose', !win);
  $('endT').textContent = title;
  $('endS').innerHTML = line;
  endEl.classList.remove('off');
}
function showArrow(show) {
  // Edge arrow pointing toward the suspect when it is off screen.
  ndc.copy(carPos).project(camera);
  tmp.copy(carPos).sub(camera.position);
  const behind = tmp.dot(fwd) < 0;
  if (!show || (!behind && Math.abs(ndc.x) < 0.92 && Math.abs(ndc.y) < 0.92)) { arrowEl.style.opacity = 0; return; }
  let ax = ndc.x * camera.aspect, ay = ndc.y;
  if (behind) { ax = -ax; ay = -ay; }
  const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
  const r = Math.min(window.innerWidth, window.innerHeight) * 0.4;
  arrowEl.style.opacity = 0.9;
  arrowEl.style.transform = `translate(${(ax * r).toFixed(1)}px,${(-ay * r).toFixed(1)}px) rotate(${Math.atan2(-ay, ax).toFixed(3)}rad)`;
}
const clock2 = (s) => `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;

// =====================================================================================
// AIR UNIT — helicopter: gyro look + spotlight, autopilot keeps the suspect ahead.
// =====================================================================================
const air = (() => {
  const ALT_MIN = 185, ALT_MAX = 380, ALT_START = 215;
  const ROUND = 90, LOSE_AFTER = 8, COS_HIT = Math.cos(5.2 * Math.PI / 180);
  const heliQ = new THREE.Quaternion();
  const known = { x: 0, z: 0 }, pos = { x: 0, z: 0 };
  let heading, turnRate, speed, alt, contact, lit, timeLeft, zeroT, litTime;

  const inCone = (x, z) => {
    tmp.set(x, 2.5, z).sub(lamp);
    const d = tmp.length();
    return d < 1000 && tmp.dot(beam) / d > COS_HIT;
  };

  return {
    enter() {
      document.body.classList.remove('ground');
      mlabelEl.textContent = 'VISUAL CONTACT';
      hintEl.textContent = 'DRAG ◄► ORBIT · ▲▼ ALTITUDE';
      cruiser.group.visible = chopper.visible = cone.visible = false;
    },
    reset() {
      suspect.base = 28; suspect.threat = null; suspect.flee = true;
      suspect.place(0, 0); suspect.lit = 0;
      civs.forEach((c) => respawnCiv(c, 60));
      pos.x = suspect.x - suspect.dx * 160; pos.z = suspect.z - suspect.dz * 160;   // start behind it
      heading = Math.atan2(-suspect.dx, -suspect.dz); turnRate = 0; speed = 0; alt = ALT_START;
      contact = 0.6; lit = 0; timeLeft = ROUND; zeroT = 0; litTime = 0;
      known.x = suspect.x; known.z = suspect.z;
      tilt.recenter();
    },
    update(dt) {
      suspect.update(dt, lit);
      carPos.set(suspect.x, 2.5, suspect.z);
      for (const c of civs) {
        if (Math.hypot(c.x - suspect.x, c.z - suspect.z) > 520) respawnCiv(c, 280);
        c.update(dt, inCone(c.x, c.z) ? 1 : 0);
      }

      // Autopilot: keep the last known suspect position dead ahead, with a helicopter's slow turn.
      if (contact > 0) { known.x = suspect.x; known.z = suspect.z; }
      const hx = known.x - pos.x, hz = known.z - pos.z, hd = Math.hypot(hx, hz);
      let dh = hd > 5 ? Math.atan2(-hx, -hz) - heading : 0; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      turnRate += (Math.max(-0.75, Math.min(0.75, dh * 1.4)) - turnRate) * Math.min(1, dt * 2.5);
      heading += turnRate * dt;
      const want = Math.max(-40, Math.min(62, (hd - 80) * 0.7)) * Math.max(0, Math.cos(dh));
      speed += (want - speed) * Math.min(1, dt * 1.2);
      // Pilot influence: strafe (an orbit, since the nose keeps tracking) and altitude.
      const sx = stick.x + (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
      const sy = stick.y + (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
      const sn = Math.sin(heading), cs = Math.cos(heading);
      pos.x += (-sn * speed + cs * sx * 55) * dt;
      pos.z += (-cs * speed - sn * sx * 55) * dt;
      alt = Math.max(ALT_MIN, Math.min(ALT_MAX, alt - sy * 70 * dt));

      camera.position.set(pos.x, alt, pos.z);
      camera.quaternion.copy(heliQ.setFromAxisAngle(yAxis, heading)).multiply(tilt.camQ);
      camera.updateMatrixWorld(true);

      // Spotlight swings after the view with a little lag so you can see it move.
      lamp.copy(camera.position);
      camera.getWorldDirection(fwd);
      beam.lerp(fwd, 1 - Math.exp(-dt * 9)).normalize();

      const aimed = inCone(suspect.x, suspect.z);
      const blocked = aimed && city.blocked(lamp.x, lamp.y, lamp.z, carPos.x, carPos.y, carPos.z);
      const visual = aimed && !blocked;
      lit += ((visual ? 1 : 0) - lit) * Math.min(1, dt * 8);

      if (state === 'play') {
        if (visual) litTime += dt;
        contact = Math.max(0, Math.min(1, contact + (visual ? 0.22 : -0.08) * dt));
        zeroT = contact <= 0 ? zeroT + dt : 0;
        timeLeft -= dt;
        const stats = () => `<br>EYES ON SUSPECT ${Math.round(100 * litTime / Math.max(1, played))}% OF ${Math.round(played)}s`;
        if (zeroT >= LOSE_AFTER) finish(false, 'SUSPECT LOST', 'CONTACT LOST — PURSUIT TERMINATED' + stats());
        else if (timeLeft <= 0) { timeLeft = 0; finish(true, 'SUSPECT IN CUSTODY', 'BACKUP ON SCENE — GROUND UNITS MOVED IN' + stats()); }
      }

      fillEl.style.transform = `scaleX(${contact.toFixed(3)})`;
      meterEl.classList.toggle('on', visual);
      retEl.classList.toggle('on', visual);
      const lost = contact <= 0 && state === 'play';
      statEl.classList.toggle('warn', lost);
      statEl.textContent = lost ? `CONTACT LOST ${Math.max(0, LOSE_AFTER - zeroT).toFixed(1)}`
        : visual ? 'VISUAL' : blocked ? 'BLOCKED' : 'NO VISUAL';
      timerEl.textContent = clock2(Math.ceil(timeLeft));
      modeEl.textContent = tilt.mode + ` · ${Math.round(alt)}m`;
      showArrow(contact > 0);
    },
    get debug() { return { contact, lit, timeLeft, zeroT, alt, heading }; },
  };
})();

// =====================================================================================
// GROUND UNIT — patrol car: tilt-to-steer, thumb pedals, ram the suspect to disable it.
// =====================================================================================
const ground = (() => {
  const R_CAR = 3.2, MAX_SPEED = 80, ESCAPE_DIST = 420, ESCAPE_AFTER = 10, SUSPECT_BASE = 30;
  const p = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0 };
  const aim = new THREE.Vector3(), camDir = { x: 1, z: 0 };
  let damage, farT, ramCool, rams, steerS, shake;

  return {
    enter() {
      document.body.classList.add('ground');
      mlabelEl.textContent = 'SUSPECT DAMAGE';
      hintEl.textContent = 'TILT TO STEER · RAM THE SUSPECT';
      cruiser.group.visible = chopper.visible = cone.visible = true;
      meterEl.classList.remove('on');
    },
    reset() {
      suspect.base = SUSPECT_BASE; suspect.flee = true;
      suspect.place(0, 0); suspect.lit = 0;
      civs.forEach((c) => respawnCiv(c, 120));
      p.x = suspect.x - suspect.dx * 75; p.z = suspect.z - suspect.dz * 75;
      p.yaw = Math.atan2(-suspect.dz, suspect.dx);
      p.vx = suspect.dx * 20; p.vz = suspect.dz * 20;
      camDir.x = suspect.dx; camDir.z = suspect.dz;
      damage = 0; farT = 0; ramCool = 0; rams = 0; steerS = 0; shake = 0;
      aim.set(suspect.x, 0, suspect.z);
    },
    update(dt) {
      // --- Controls ---
      let gas = keys.ArrowUp || keys.w ? 1 : 0, brake = keys.ArrowDown || keys.s ? 1 : 0, touchSteer = 0;
      const half = window.innerWidth / 2;
      for (const tc of touches.values()) {
        if (tc.ox >= half) gas = 1; else brake = 1;
        if (!tilt.gyroSeen) touchSteer = Math.max(-1, Math.min(1, (tc.x - tc.ox) / 70));   // no gyro: slide thumb
      }
      if (state !== 'play') { gas = 0; brake = 1; }
      pG.classList.toggle('on', !!gas); pB.classList.toggle('on', !!brake);
      let steer = (tilt.gyroSeen ? tilt.steer : touchSteer) + (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
      steer = Math.max(-1, Math.min(1, steer));
      if (Math.abs(steer) < 0.04) steer = 0;
      steerS += (steer - steerS) * Math.min(1, dt * 10);

      // --- Arcade physics: forward/lateral split, grip loss when cornering hard = drift ---
      let fx = Math.cos(p.yaw), fz = -Math.sin(p.yaw);
      let vf = p.vx * fx + p.vz * fz, vl = -p.vx * fz + p.vz * fx;
      if (gas) vf += 58 * (1 - Math.max(0, vf) / MAX_SPEED) * dt;
      if (brake) vf -= (vf > 0 ? 95 : 35) * dt;
      vf -= vf * 0.12 * dt;
      if (!gas && !brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 6 * dt);
      vf = Math.max(-22, vf);
      const sp = Math.abs(vf);
      p.yaw -= steerS * 2.1 * Math.min(1, sp / 14) * Math.sign(vf || 1) * dt;
      const grip = 7 - 4.2 * Math.min(1, (sp / MAX_SPEED) * Math.abs(steerS) * 1.6);
      // Momentum carries on in its old direction; only the sideways part (in the new heading) is scrubbed off by grip.
      const wx = fx * vf - fz * vl, wz = fz * vf + fx * vl;
      fx = Math.cos(p.yaw); fz = -Math.sin(p.yaw);
      const nf = wx * fx + wz * fz, nl = (-wx * fz + wz * fx) * Math.exp(-grip * dt);
      p.vx = fx * nf - fz * nl; p.vz = fz * nf + fx * nl;
      p.x += p.vx * dt; p.z += p.vz * dt;

      // --- Collisions: buildings ---
      const hit = city.collide(p.x, p.z, R_CAR);
      if (hit) {
        p.x = hit.x; p.z = hit.z;
        const vn = p.vx * hit.nx + p.vz * hit.nz;
        if (vn < 0) {
          p.vx -= hit.nx * vn * 1.3; p.vz -= hit.nz * vn * 1.3;       // small bounce
          const loss = Math.min(1, -vn / 40);
          p.vx *= 1 - 0.35 * loss; p.vz *= 1 - 0.35 * loss;
          if (-vn > 18) shake = Math.max(shake, Math.min(1, -vn / 50));
        }
      }
      const B = LIMIT + 80;
      p.x = Math.max(-B, Math.min(B, p.x)); p.z = Math.max(-B, Math.min(B, p.z));

      // --- Suspect AI: runs from the cruiser when it is close ---
      const sdx = suspect.x - p.x, sdz = suspect.z - p.z, sd = Math.hypot(sdx, sdz);
      suspect.threat = sd < 260 ? p : null;
      suspect.base = damage >= 100 ? 0 : SUSPECT_BASE * (1 - 0.45 * damage / 100);
      if (damage >= 100) suspect.speed *= Math.exp(-dt * 2.5);
      suspect.update(dt, damage < 100 && sd < 170 ? 1 : 0);
      carPos.set(suspect.x, 2.5, suspect.z);
      for (const c of civs) {
        if (Math.hypot(c.x - suspect.x, c.z - suspect.z) > 520) respawnCiv(c, 280);
        c.update(dt, 0);
      }

      // --- Collisions: cars ---
      ramCool -= dt;
      const bump = (c, isSuspect) => {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = 7.2;
        if (d >= min || d < 1e-4) return;
        const nx = dx / d, nz = dz / d;
        p.x = c.x + nx * min; p.z = c.z + nz * min;
        const closing = -((p.vx - c.dx * c.speed) * nx + (p.vz - c.dz * c.speed) * nz);
        if (closing <= 0) return;
        p.vx += nx * closing * 1.25; p.vz += nz * closing * 1.25;
        shake = Math.max(shake, Math.min(1, closing / 45));
        if (isSuspect && closing > 9 && ramCool <= 0 && state === 'play' && damage < 100) {
          damage = Math.min(100, damage + closing * 0.85);
          c.speed *= 0.45; ramCool = 0.6; rams++;
          flashEl.style.transition = 'none'; flashEl.style.opacity = 0.35;
          requestAnimationFrame(() => { flashEl.style.transition = 'opacity .3s'; flashEl.style.opacity = 0; });
        } else if (!isSuspect) c.speed *= 0.6;
      };
      bump(suspect, true);
      for (const c of civs) bump(c, false);

      // --- Cruiser visuals ---
      cruiser.group.position.set(p.x, 0, p.z);
      cruiser.group.rotation.set(0, p.yaw, 0);
      const fl = (t * 6) % 1 < 0.5;
      barL.material.color.setHex(fl ? 0xff1030 : 0x30060c);
      barR.material.color.setHex(fl ? 0x061238 : 0x3a7bff);

      // --- AI partner helicopter: circles the suspect with its light on it (your intel) ---
      const ca = t * 0.28;
      chopper.position.set(suspect.x + Math.cos(ca) * 75, 195, suspect.z + Math.sin(ca) * 75);
      chopper.rotation.y = -ca - Math.PI / 2;
      chopper.userData.nav.visible = (t * 1.6) % 1 < 0.5;
      aim.x += (suspect.x - aim.x) * Math.min(1, dt * 3.5); aim.z += (suspect.z - aim.z) * Math.min(1, dt * 3.5);
      lamp.set(chopper.position.x, chopper.position.y - 3, chopper.position.z);
      beam.copy(aim).sub(lamp);
      const bl = beam.length(); beam.divideScalar(bl);
      cone.position.copy(lamp);
      cone.quaternion.setFromUnitVectors(DOWN, beam);
      const cr = bl * Math.tan(5.6 * Math.PI / 180);
      cone.scale.set(cr, bl, cr);

      // --- Chase camera: lags the car's heading so slides read ---
      const k = Math.min(1, dt * 4.5);
      camDir.x += (fx - camDir.x) * k; camDir.z += (fz - camDir.z) * k;
      const cl = Math.hypot(camDir.x, camDir.z) || 1; camDir.x /= cl; camDir.z /= cl;
      shake *= Math.exp(-dt * 6);
      const sh = shake * 1.6;
      camera.position.set(p.x - camDir.x * 27 + (Math.random() - 0.5) * sh, 12 + (Math.random() - 0.5) * sh, p.z - camDir.z * 27);
      camera.up.set(0, 1, 0);
      camera.lookAt(p.x + camDir.x * 22, 4, p.z + camDir.z * 22);
      camera.rotateZ(-steerS * 0.05 * Math.min(1, sp / 40));
      camera.updateMatrixWorld(true);
      camera.getWorldDirection(fwd);

      // --- Round rules ---
      if (state === 'play') {
        farT = sd > ESCAPE_DIST ? farT + dt : 0;
        const stats = `<br>${rams} RAM${rams === 1 ? '' : 'S'} · ${clock2(Math.round(played))}`;
        if (damage >= 100) finish(true, 'SUSPECT APPREHENDED', 'VEHICLE DISABLED — SUSPECT IN CUSTODY' + stats);
        else if (farT >= ESCAPE_AFTER) finish(false, 'SUSPECT ESCAPED', 'YOU LOST THE PURSUIT' + stats);
      }

      // --- HUD ---
      fillEl.style.transform = `scaleX(${(damage / 100).toFixed(3)})`;
      const far = sd > ESCAPE_DIST && state === 'play';
      statEl.classList.toggle('warn', far);
      statEl.textContent = far ? `LOSING SUSPECT ${Math.max(0, ESCAPE_AFTER - farT).toFixed(1)}` : `${Math.round(sd)}m`;
      timerEl.textContent = clock2(Math.floor(played));
      modeEl.textContent = `${Math.round(Math.hypot(p.vx, p.vz) * 2.4)} KM/H`;
      showArrow(true);
    },
    get debug() { return { p, damage, farT, rams }; },
  };
})();

// ---------- Role select / flow ----------
const modes = { air, ground };
function begin(r) {
  role = r;
  modes[role].enter(); modes[role].reset();
  played = 0; state = 'play';
}
air.enter(); air.reset();                 // attract mode behind the menu
document.querySelectorAll('.role').forEach((b) => b.addEventListener('click', async () => {
  startEl.classList.add('off');
  await tilt.enableGyro();
  begin(b.dataset.role);
}));
$('again').addEventListener('click', () => { endEl.classList.add('off'); begin(role); });
$('swap').addEventListener('click', () => { endEl.classList.add('off'); startEl.classList.remove('off'); });

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  if (state === 'play') played += dt;
  tilt.update(dt, t);
  modes[role].update(dt);
  city.sky.position.copy(camera.position);
  rainRig.position.set(camera.position.x, 0, camera.position.z);
  city.update(t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Debug hook for automated checks.
window.__game = { tilt, camera, suspect, civs, city, keys, begin, air, ground, get state() { return state; }, get role() { return role; } };
