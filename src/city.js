// Procedural neon city: instanced buildings, glowing street grid, beacons, rain.
export const PITCH = 60;      // block + street
const STREET = 16;
export const BLOCKS = 26;     // per side

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const FOG_GLSL = `
  uniform vec3 uFog; uniform float uAlt; uniform vec3 uLamp; uniform vec3 uBeam;
  float spot(vec3 w){
    vec3 v = w - uLamp; float d = length(v);
    return smoothstep(0.9945, 0.9975, dot(v / d, uBeam)) * clamp(1.0 - d / 1100.0, 0.0, 1.0);
  }
  vec3 haze(vec3 c, vec3 w){
    float d = length(cameraPosition - w);
    float f = 1.0 - exp(-d * 0.0009);
    float low = smoothstep(uAlt * 0.9, 0.0, w.y) * 0.12;   // street-level smog
    return mix(c, uFog, clamp(f + low, 0.0, 0.95));
  }`;

export function buildCity(THREE, fog, altitude) {
  const group = new THREE.Group();
  const U = { uFog: { value: fog }, uAlt: { value: altitude }, uTime: { value: 0 },
    uLamp: { value: new THREE.Vector3(0, 200, 0) }, uBeam: { value: new THREE.Vector3(0, -1, 0) } };
  const r = rng(1043);
  const palette = [[0.1, 0.95, 1.0], [1.0, 0.2, 0.9], [1.0, 0.55, 0.1], [0.45, 0.35, 1.0], [0.2, 1.0, 0.55]];

  // ---- Buildings ----
  const B = [];
  const half = BLOCKS / 2;
  for (let i = 0; i < BLOCKS; i++) for (let j = 0; j < BLOCKS; j++) {
    const cx = (i - half + 0.5) * PITCH, cz = (j - half + 0.5) * PITCH;
    const lot = PITCH - STREET;
    const split = r() < 0.55 ? 2 : 1;
    const downtown = Math.exp(-((cx * cx + cz * cz) / (2 * 420 * 420)));
    for (let a = 0; a < split; a++) for (let b = 0; b < split; b++) {
      if (r() < 0.06) continue;                       // empty lot / plaza
      const s = lot / split;
      const w = s * (0.7 + r() * 0.25), d = s * (0.7 + r() * 0.25);
      let h = 12 + r() * 45 + downtown * r() * 70;
      if (r() < 0.07) h = 95 + r() * 55;              // towers reaching up at the viewer
      const x = cx + (a - (split - 1) / 2) * s, z = cz + (b - (split - 1) / 2) * s;
      const col = palette[(r() * palette.length) | 0];
      B.push({ x, z, w, d, h, col, seed: r() * 100 });
      if (h > 80 && r() < 0.7) {                      // setback crown
        B.push({ x, z, w: w * 0.55, d: d * 0.55, h: h + 8 + r() * 14, col, seed: r() * 100 });
      }
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const n = B.length;
  const aCol = new Float32Array(n * 3), aSize = new Float32Array(n * 3), aSeed = new Float32Array(n);
  const mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `
      attribute vec3 aCol; attribute vec3 aSize; attribute float aSeed;
      varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vCol; varying vec3 vSize; varying float vSeed;
      void main(){
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normal; vUv = uv; vCol = aCol; vSize = aSize; vSeed = aSeed;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vCol; varying vec3 vSize; varying float vSeed;
      ${FOG_GLSL}
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 c;
        if (vN.y > 0.5) {
          // Roof: dark slab, neon parapet, a few rooftop units.
          vec2 e = min(vUv, 1.0 - vUv) * vSize.xz;
          float edge = min(e.x, e.y);
          float glow = smoothstep(1.6, 0.3, edge) + 0.25 * smoothstep(7.0, 0.0, edge);
          vec2 cell = floor(vUv * vSize.xz / 5.0);
          float unit = step(0.82, hash(cell + vSeed)) * step(3.0, edge);
          c = vec3(0.025, 0.02, 0.05) + vCol * glow * 0.9 + vec3(0.07, 0.07, 0.1) * unit;
        } else {
          // Walls: window grid in world space so scale never stretches it.
          float u = abs(vN.x) > 0.5 ? vW.z : vW.x;
          vec2 g = vec2(u / 2.4, vW.y / 3.2);
          vec2 cell = floor(g), f = fract(g);
          float mask = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.8);
          float rnd = hash(cell + vSeed);
          float lit = step(0.5, rnd);
          vec3 wc = mix(vec3(1.0, 0.82, 0.5), vCol, step(0.85, rnd));
          float aa = clamp(fwidth(g.x) * 1.2, 0.0, 1.0);          // fade detail when tiny
          float w = mix(mask * lit, 0.2, aa);
          float top = smoothstep(vSize.y - 2.5, vSize.y, vW.y);   // neon crown band
          c = vec3(0.03, 0.025, 0.06) + wc * w * 0.85 + vCol * top * 0.8;
        }
        float L = spot(vW);
        c = c * (1.0 + 2.5 * L) + vec3(0.10, 0.11, 0.13) * L;
        gl_FragColor = vec4(haze(c, vW), 1.0);
      }`,
  }), n);
  const m = new THREE.Matrix4();
  B.forEach((b, i) => {
    m.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
    mesh.setMatrixAt(i, m);
    aCol.set(b.col, i * 3); aSize.set([b.w, b.h, b.d], i * 3); aSeed[i] = b.seed;
  });
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  mesh.frustumCulled = false;
  group.add(mesh);

  // ---- Ground: wet asphalt with glowing lane markings ----
  const ext = BLOCKS * PITCH;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ext * 3, ext * 3), new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      varying vec3 vW;
      ${FOG_GLSL}
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        const float P = ${PITCH.toFixed(1)}, S = ${STREET.toFixed(1)};
        vec2 q = abs(mod(vW.xz + P * 0.5, P) - P * 0.5);          // 0 at street centre lines
        vec2 inStreet = step(q, vec2(S * 0.5));
        float street = max(inStreet.x, inStreet.y);
        float dc = min(q.x, q.y);                        // distance to nearest centre line
        float along = q.x < q.y ? vW.z : vW.x;
        float dash = step(0.5, fract(along / 8.0));
        float centre = smoothstep(0.5, 0.15, dc) * dash;
        float kerb = smoothstep(0.6, 0.0, abs(dc - S * 0.5));
        float wet = noise(vW.xz * 0.08) * noise(vW.xz * 0.31);
        vec3 c = mix(vec3(0.03, 0.025, 0.06), vec3(0.07, 0.06, 0.13), street);
        c += street * wet * vec3(0.25, 0.12, 0.5);     // puddle sheen
        c += centre * street * vec3(0.1, 0.9, 1.0) * 1.4;
        c += kerb * vec3(1.0, 0.15, 0.8) * 1.0;
        float L = spot(vW);
        c = c * (1.0 + 2.5 * L) + vec3(0.20, 0.22, 0.27) * L;
        gl_FragColor = vec4(haze(c, vW), 1.0);
      }`,
  }));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // ---- Rooftop beacons ----
  const tall = B.filter((b) => b.h > 60);
  const bp = new Float32Array(tall.length * 3), bs = new Float32Array(tall.length);
  tall.forEach((b, i) => { bp.set([b.x, b.h + 1.5, b.z], i * 3); bs[i] = b.seed; });
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  bg.setAttribute('aSeed', new THREE.BufferAttribute(bs, 1));
  const beacons = new THREE.Points(bg, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSeed; uniform float uTime; varying float vB;
      void main(){ vB = 0.25 + 0.75 * step(0.6, fract(uTime * 0.7 + aSeed));
        vec4 mv = viewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = 2600.0 / -mv.z; }`,
    fragmentShader: `varying float vB; void main(){ float d = length(gl_PointCoord - 0.5);
      gl_FragColor = vec4(vec3(1.0, 0.12, 0.15) * vB, smoothstep(0.5, 0.0, d)); }`,
  }));
  beacons.frustumCulled = false;
  group.add(beacons);

  // ---- Rain: falls through the window plane, so it pops out toward the viewer ----
  const RN = 900, RH = 420, RX = 260;
  const rp = new Float32Array(RN * 6), ro = new Float32Array(RN * 2), rt = new Float32Array(RN * 2);
  for (let i = 0; i < RN; i++) {
    const x = (r() - 0.5) * 2 * RX, z = (r() - 0.5) * 2 * RX, y = r() * RH, sp = 0.8 + r() * 0.5;
    rp.set([x, y, z, x, y, z], i * 6);
    ro.set([sp, sp], i * 2); rt.set([0, 1], i * 2);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rg.setAttribute('aSp', new THREE.BufferAttribute(ro, 1));
  rg.setAttribute('aTip', new THREE.BufferAttribute(rt, 1));
  const rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSp; attribute float aTip; uniform float uTime; uniform vec3 uLamp; uniform vec3 uBeam;
      varying float vA; varying float vL;
      void main(){ vec3 p = position;
        p.y = mod(p.y - uTime * 150.0 * aSp, ${RH.toFixed(1)}) + aTip * 7.0;
        vA = aTip; vec4 w = modelMatrix * vec4(p, 1.0);
        vec3 v = w.xyz - uLamp; float d = length(v);
        vL = smoothstep(0.9945, 0.9975, dot(v / d, uBeam)) * smoothstep(8.0, 40.0, d) * clamp(1.0 - d / 700.0, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying float vA; varying float vL; void main(){ gl_FragColor = vec4(vec3(0.55, 0.7, 1.0), (0.28 + 0.6 * vL) * (1.0 - vA)); }`,
  }));
  rain.frustumCulled = false;

  // ---- Sky dome: light-polluted horizon fading to a starry night ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3500, 32, 16), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vD; uniform vec3 uFog;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vD);
        float h = max(d.y, 0.0);
        vec3 c = mix(uFog, vec3(0.01, 0.008, 0.03), smoothstep(0.0, 0.55, h));
        c += vec3(0.55, 0.12, 0.5) * exp(-h * 9.0) * 0.35 * step(0.0, d.y);      // city glow
        vec2 g = vec2(atan(d.z, d.x) * 220.0, d.y * 330.0);
        float s = step(0.9975, hash(floor(g))) * smoothstep(0.08, 0.4, d.y);
        c += vec3(0.8, 0.85, 1.0) * s * (0.4 + 0.6 * hash(floor(g) + 7.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -1; sky.frustumCulled = false;
  group.add(sky);

  // Line of sight: does any building block the segment a -> b?
  function blocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const minx = Math.min(ax, bx), maxx = Math.max(ax, bx), minz = Math.min(az, bz), maxz = Math.max(az, bz);
    for (let i = 0; i < B.length; i++) {
      const b = B[i], hw = b.w / 2, hd = b.d / 2;
      if (b.x + hw < minx || b.x - hw > maxx || b.z + hd < minz || b.z - hd > maxz) continue;
      let t0 = 0, t1 = 1, ok = true;
      const slabs = [[ax, dx, b.x - hw, b.x + hw], [ay, dy, 0, b.h], [az, dz, b.z - hd, b.z + hd]];
      for (const [o, d, lo, hi] of slabs) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
        let u0 = (lo - o) / d, u1 = (hi - o) / d;
        if (u0 > u1) { const q = u0; u0 = u1; u1 = q; }
        t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  return { group, rain, sky, U, blocked, update(t) { U.uTime.value = t; } };
}
