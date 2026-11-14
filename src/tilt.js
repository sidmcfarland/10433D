// Turns device orientation (or touch/mouse) into an eye offset relative to the screen.
// Output x,y are in units of eye distance: (0,0) = looking straight through the window.
export class Tilt {
  constructor(THREE, el) {
    this.T = THREE;
    this.x = 0; this.y = 0;          // smoothed output
    this.tx = 0; this.ty = 0;        // target
    this.mode = 'STANDBY';
    // Default: tilt moves the camera (flipped). ?eye=1 restores eye-behind-window mapping.
    this.sign = new URLSearchParams(location.search).has('eye') ? 1 : -1;
    this.gain = 1.6;                 // exaggerate parallax beyond physical
    this.max = 0.85;
    this.q = new THREE.Quaternion();
    this.q0 = null;                  // baseline (neutral) orientation
    this.e = new THREE.Vector3();
    this.euler = new THREE.Euler();
    this.tmp = new THREE.Quaternion();
    this.gyroSeen = false;
    this.lastInput = -99;
    this.now = 0;
    this.drag = null;
    // 360 look mode: the phone is a viewport you point anywhere.
    this.look = true;
    this.steer = 0;                   // -1..1 steering wheel angle (ground unit)
    this.enabled = false;
    this.yaw = 0; this.pitch = -1.0;
    this.lookQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, 0, 0, 'YXZ'));
    this.camQ = this.lookQ.clone();   // smoothed camera orientation
    this.qFix = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
    this.qScr = new THREE.Quaternion();
    this.zAxis = new THREE.Vector3(0, 0, 1);
    // Comfort offset: holding the phone at ~45 degrees looks straight down.
    this.qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 4);
    this.alpha0 = null;               // phone heading that maps to "helicopter forward"

    el.addEventListener('pointerdown', (ev) => {
      const n = performance.now();
      if (n - (this.lastTap || 0) < 320) this.recenter();
      this.lastTap = n;
      if (this.look || ev.pointerType !== 'mouse') this.drag = { x: ev.clientX, y: ev.clientY, tx: this.tx, ty: this.ty };
    });
    window.addEventListener('pointermove', (ev) => {
      if (this.gyroSeen) return;
      const w = window.innerWidth, h = window.innerHeight;
      if (this.look) {
        if (!this.drag) return;
        this.yaw += (ev.clientX - this.drag.x) * 0.005;
        this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch + (ev.clientY - this.drag.y) * 0.005));
        this.drag.x = ev.clientX; this.drag.y = ev.clientY;
        this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
        this.lookQ.setFromEuler(this.euler);
        this.lastInput = this.now; this.mode = 'TOUCH';
        return;
      }
      if (ev.pointerType === 'mouse') {
        this.tx = -(ev.clientX / w - 0.5) * 1.6;
        this.ty = (ev.clientY / h - 0.5) * 1.6;
      } else if (this.drag) {
        this.tx = this.drag.tx - (ev.clientX - this.drag.x) / w * 2.2;
        this.ty = this.drag.ty + (ev.clientY - this.drag.y) / w * 2.2;
      } else return;
      this.lastInput = this.now;
      this.mode = 'TOUCH';
    });
    window.addEventListener('pointerup', () => { this.drag = null; });
  }

  async enableGyro() {
    if (this.enabled) return;
    try {
      const D = window.DeviceOrientationEvent;
      if (!D) return;
      if (typeof D.requestPermission === 'function') {
        const r = await D.requestPermission();   // iOS: must be inside a tap
        if (r !== 'granted') { this.mode = 'GYRO DENIED'; return; }
      }
      window.addEventListener('deviceorientation', (ev) => this.onOrient(ev));
      this.enabled = true;
    } catch (e) { this.mode = 'NO GYRO'; }
  }

  recenter() {
    this.q0 = null; this.tx = 0; this.ty = 0; this.alpha0 = null;
    if (this.look && !this.gyroSeen) { this.yaw = 0; this.euler.set(this.pitch, 0, 0, 'YXZ'); this.lookQ.setFromEuler(this.euler); }
  }

  onOrient(ev) {
    if (ev.beta == null || ev.gamma == null) return;
    const r = Math.PI / 180;
    {
      // Steering wheel: how far the screen's "up" is rolled away from world up, in the screen plane.
      const b = ev.beta * r, g = ev.gamma * r;
      const ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b);        // world-up in device coords (x, y)
      const a = -((screen.orientation && screen.orientation.angle) || window.orientation || 0) * r;
      const sx = ux * Math.cos(a) - uy * Math.sin(a), sy = ux * Math.sin(a) + uy * Math.cos(a);
      const ang = Math.atan2(-sx, Math.max(Math.abs(sy), 0.3));
      this.steer = Math.max(-1, Math.min(1, ang / 0.55));
    }
    if (this.look) {
      // Absolute orientation: camera looks out the back of the phone.
      const o = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * r;
      const al = (ev.alpha || 0) * r;
      if (this.alpha0 === null) this.alpha0 = al;
      this.euler.set(ev.beta * r, al - this.alpha0, -ev.gamma * r, 'YXZ');
      this.lookQ.setFromEuler(this.euler).multiply(this.qFix)
        .multiply(this.qScr.setFromAxisAngle(this.zAxis, -o)).multiply(this.qPitch);
      this.gyroSeen = true; this.mode = 'GYRO';
      return;
    }
    // Device-to-world rotation: Rz(alpha) * Rx(beta) * Ry(gamma)
    this.euler.set(ev.beta * r, ev.gamma * r, (ev.alpha || 0) * r, 'ZXY');
    this.q.setFromEuler(this.euler);
    if (!this.q0) this.q0 = this.q.clone();
    this.gyroSeen = true;
    this.mode = 'GYRO';

    // The viewer's eye stays where the baseline screen normal pointed.
    // Express that direction in the current device frame.
    this.tmp.copy(this.q).invert().multiply(this.q0);
    this.e.set(0, 0, 1).applyQuaternion(this.tmp);

    // Account for screen rotation (landscape etc.).
    const a = -((screen.orientation && screen.orientation.angle) || window.orientation || 0) * r;
    const c = Math.cos(a), s = Math.sin(a);
    const ex = this.e.x * c - this.e.y * s, ey = this.e.x * s + this.e.y * c;
    this.tx = ex * this.gain * this.sign;
    this.ty = ey * this.gain * this.sign;

    // If held far off-centre, let neutral slowly follow so any posture works.
    if (Math.hypot(ex, ey) > 0.45) this.q0.slerp(this.q, 0.02);
  }

  update(dt, t) {
    this.now = t;
    if (this.look) {
      if (!this.gyroSeen && t - this.lastInput > 4) {
        this.euler.set(this.pitch + Math.sin(t * 0.4) * 0.15, this.yaw + Math.sin(t * 0.25) * 0.5, 0, 'YXZ');
        this.lookQ.setFromEuler(this.euler);
      }
      this.camQ.slerp(this.lookQ, 1 - Math.exp(-dt * 14));
      return;
    }
    let tx = this.tx, ty = this.ty;
    if (!this.gyroSeen && t - this.lastInput > 4) {
      // Idle demo sway when there is no input at all.
      tx = Math.sin(t * 0.6) * 0.45; ty = Math.cos(t * 0.43) * 0.35;
    }
    const m = Math.hypot(tx, ty);
    if (m > this.max) { tx *= this.max / m; ty *= this.max / m; }
    const k = 1 - Math.exp(-dt * 12);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }
}
