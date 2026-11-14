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

    el.addEventListener('pointerdown', (ev) => {
      const n = performance.now();
      if (n - (this.lastTap || 0) < 320) this.recenter();
      this.lastTap = n;
      if (ev.pointerType !== 'mouse') this.drag = { x: ev.clientX, y: ev.clientY, tx: this.tx, ty: this.ty };
    });
    window.addEventListener('pointermove', (ev) => {
      if (this.gyroSeen) return;
      const w = window.innerWidth, h = window.innerHeight;
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
    try {
      const D = window.DeviceOrientationEvent;
      if (!D) return;
      if (typeof D.requestPermission === 'function') {
        const r = await D.requestPermission();   // iOS: must be inside a tap
        if (r !== 'granted') { this.mode = 'GYRO DENIED'; return; }
      }
      window.addEventListener('deviceorientation', (ev) => this.onOrient(ev));
    } catch (e) { this.mode = 'NO GYRO'; }
  }

  recenter() { this.q0 = null; this.tx = 0; this.ty = 0; }

  onOrient(ev) {
    if (ev.beta == null || ev.gamma == null) return;
    const r = Math.PI / 180;
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
