// Cars drive the street grid, turning at intersections. Streets run along x = k*PITCH and z = k*PITCH.
export class Car {
  constructor(THREE, pitch, limit, { seed = 7, color = 0xff8a00, flee = false, speed = 28 } = {}) {
    this.pitch = pitch; this.limit = limit; this.flee = flee; this.base = speed;
    this.x = 0; this.z = 0; this.dx = 1; this.dz = 0;
    this.speed = speed; this.lit = 0; this.yaw = 0; this.threat = null;
    let s = seed >>> 0;
    this.rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

    const g = this.group = new THREE.Group();
    const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
    const glow = (c, op) => basic(c, { transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
    this.bodyMat = basic(0x16121f);
    const body = new THREE.Mesh(new THREE.BoxGeometry(8.5, 1.6, 4), this.bodyMat); body.position.y = 1.3;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 3.4), basic(0x07060c)); cab.position.set(-0.5, 2.6, 0);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.25, 1.3), basic(color)); strip.position.y = 2.15;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 1.3), basic(color)); roof.position.set(-0.5, 3.25, 0);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 3.6), basic(0xff1030)); tail.position.set(-4.3, 1.5, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 3.4), basic(0xfff2c0)); head.position.set(4.3, 1.4, 0);
    const flat = (w, d, mat, x) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.15, 0); return m; };
    g.add(body, cab, strip, roof, tail, head,
      flat(16, 7, glow(0xffe9a8, 0.35), 12.5),     // headlight throw
      flat(7, 5, glow(0xff1030, 0.3), -7),         // tail glow
      flat(11, 6.5, glow(color, 0.25), 0));        // underglow
  }

  // Put the car on the nearest intersection, facing a random open direction.
  place(x, z) {
    const P = this.pitch, L = this.limit;
    this.x = Math.max(-L, Math.min(L, Math.round(x / P) * P));
    this.z = Math.max(-L, Math.min(L, Math.round(z / P) * P));
    const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][(this.rnd() * 4) | 0];
    this.dx = d[0]; this.dz = d[1];
    this.turn(); this._turned = true; this.speed = this.base;
    this.yaw = Math.atan2(-this.dz, this.dx);
  }

  // lit: 0..1, how much the spotlight is on the car
  update(dt, lit) {
    this.lit = lit;
    const target = this.flee && lit > 0.5 ? this.base * 1.65 : this.base;   // suspect floors it when spotted
    this.speed += (target - this.speed) * Math.min(1, dt * 1.5);
    let step = this.speed * dt;
    const P = this.pitch;
    for (let guard = 0; guard < 4 && step > 0; guard++) {
      // distance to the next intersection along the current heading
      const along = this.dx ? this.x * this.dx : this.z * this.dz;
      let dist = Math.ceil(along / P - 1e-6) * P - along;
      if (dist < 1e-4) dist = this._turned ? P : 0;
      if (step < dist) { this.x += this.dx * step; this.z += this.dz * step; this._turned = false; break; }
      this.x += this.dx * dist; this.z += this.dz * dist; step -= dist;
      this.x = Math.round(this.x / P) * P; this.z = Math.round(this.z / P) * P;
      this.turn(); this._turned = true;
    }
    const want = Math.atan2(-this.dz, this.dx);
    let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 9);
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.yaw;
    this.bodyMat.color.setScalar(0.09 + lit * 0.5);
  }

  turn() {
    const { dx, dz, pitch: P, limit: L } = this;
    const evading = this.flee && this.lit > 0.5;
    let opts = [[dx, dz, evading ? 1 : 2.5], [-dz, dx, 1], [dz, -dx, 1]];
    if (this.threat) {
      // Being chased on the ground: favour exits that lead away from the pursuer.
      let ax = this.x - this.threat.x, az = this.z - this.threat.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      opts = opts.map(([a, b]) => [a, b, 0.25 + Math.max(0, a * ax + b * az) * 3]);
    }
    opts = opts.filter(([a, b]) => Math.abs(this.x + a * P) <= L && Math.abs(this.z + b * P) <= L);
    if (!opts.length) { this.dx = -dx; this.dz = -dz; return; }
    let r = this.rnd() * opts.reduce((s, o) => s + o[2], 0);
    for (const o of opts) { if ((r -= o[2]) <= 0) { this.dx = o[0]; this.dz = o[1]; return; } }
  }
}
