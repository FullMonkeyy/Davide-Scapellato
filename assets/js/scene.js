/**
 * One particle system, five bodies.
 *   0 — 3D relief of the portrait photo
 *   1 — neural sphere
 *   2 — alpine terrain (Ticino)
 *   3 — torus knot
 *   4 — spiral galaxy
 * Scroll drives `morph` (0..4); every particle has its own delay so
 * transitions ripple instead of snapping.
 */
(function () {
const THREE = window.THREE;

const SHAPES = 5;
const SPHERE_R = 2.1;

// Per-shape placement, interpolated by the current morph value.
// [x, y, scale, tiltX, dim]
const LAYOUT_DESKTOP = [
  [2.15, 0.15, 1.0, 0.0, 1.0],
  [2.9, 0.0, 1.0, 0.25, 0.6],
  [0.0, -1.5, 1.0, 0.5, 0.85],
  [3.2, 0.1, 0.95, 0.3, 0.5],
  [2.6, -1.5, 0.95, 1.0, 0.45],
];
const LAYOUT_MOBILE = [
  [0.0, 0.55, 0.62, 0.0, 0.75],
  [0.0, 0.6, 0.65, 0.25, 0.45],
  [0.0, -0.6, 0.6, 0.5, 0.8],
  [0.0, 0.4, 0.6, 0.3, 0.4],
  [0.0, 0.0, 0.7, 1.05, 0.5],
];

const vertexShader = /* glsl */ `
  attribute vec3 aP0;
  attribute vec3 aP1;
  attribute vec3 aP2;
  attribute vec3 aP3;
  attribute vec3 aP4;
  attribute vec4 aRand;
  attribute float aLum;

  uniform float uTime;
  uniform float uMorph;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec2 uMouse;
  uniform float uMouseStrength;
  uniform float uDim;

  varying float vAlpha;
  varying float vAccent;
  varying float vLum;
  varying float vTerrain;
  varying float vH;

  void main() {
    // Each particle starts its leg of the journey a little later than the last,
    // but every particle is exactly at rest when uMorph sits on an integer.
    float seg = floor(uMorph);
    float f = clamp((uMorph - seg - aRand.x * 0.4) / 0.6, 0.0, 1.0);
    float m = min(seg + f, 4.0);
    float w0 = clamp(1.0 - abs(m - 0.0), 0.0, 1.0);
    float w1 = clamp(1.0 - abs(m - 1.0), 0.0, 1.0);
    float w2 = clamp(1.0 - abs(m - 2.0), 0.0, 1.0);
    float w3 = clamp(1.0 - abs(m - 3.0), 0.0, 1.0);
    float w4 = clamp(1.0 - abs(m - 4.0), 0.0, 1.0);
    vec3 p = aP0 * w0 + aP1 * w1 + aP2 * w2 + aP3 * w3 + aP4 * w4;

    // Turbulence peaks mid-transition, vanishes at rest.
    float k = 1.0 - abs(fract(m) - 0.5) * 2.0;
    float t = uTime * 0.6;
    p += vec3(
      sin(t + aRand.y * 6.283 + p.y * 1.7),
      cos(t * 1.1 + aRand.z * 6.283 + p.x * 1.3),
      sin(t * 0.9 + aRand.w * 6.283 + p.z * 1.5)
    ) * k * 0.55;

    // Idle breathing.
    p += vec3(
      sin(uTime * 0.8 + aRand.y * 40.0),
      cos(uTime * 0.7 + aRand.z * 40.0),
      sin(uTime * 0.6 + aRand.x * 40.0)
    ) * 0.012;

    vec4 world = modelMatrix * vec4(p, 1.0);

    // Mouse repulsion in screen-aligned plane.
    vec2 d = world.xy - uMouse;
    float dist = length(d);
    float push = smoothstep(1.3, 0.0, dist) * uMouseStrength;
    world.xy += normalize(d + 1e-4) * push * 0.55;
    world.z += push * 0.6;

    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;

    float size = uSize * (0.55 + aRand.w * 0.9);
    // Portrait: brighter pixels draw larger, like a halftone.
    size *= mix(1.0, 0.55 + aLum * 0.9, w0);

    vTerrain = w2;
    vH = aP2.y;
    size *= 1.0 + w2 * 0.35;
    gl_PointSize = size * uPixelRatio * (8.0 / -mv.z);
    vAccent = step(0.935, aRand.z) * (1.0 - w2);
    vLum = mix(1.0, 0.25 + aLum * 0.95, w0);
    vAlpha = uDim * (0.55 + 0.45 * smoothstep(-3.0, 2.0, world.z));
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying float vAccent;
  varying float vLum;
  varying float vTerrain;
  varying float vH;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.18, d);
    vec3 bone = vec3(0.925, 0.91, 0.882);
    vec3 accent = vec3(1.0, 0.302, 0.122);
    vec3 col = mix(bone * vLum, accent, vAccent);
    // Terrain: lake blue in the valleys, warm accent on the slopes, snow on the peaks.
    vec3 lake = vec3(0.30, 0.55, 1.0);
    vec3 snow = vec3(1.0, 0.97, 0.93);
    vec3 ter = mix(lake, accent, smoothstep(0.02, 0.7, vH));
    ter = mix(ter, snow, smoothstep(0.9, 1.6, vH));
    col = mix(col, ter, vTerrain);
    gl_FragColor = vec4(col, a * vAlpha * (0.45 + 0.55 * vLum));
  }
`;

/* ---------- Shape generators ---------- */

function rand(seed) {
  // Small deterministic PRNG so shapes look identical on every visit.
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sphere(n, r) {
  const out = new Float32Array(n * 3);
  const R = rand(11);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const shell = Math.floor(n * 0.78);
  for (let i = 0; i < shell; i++) {
    const y = 1 - (i / (shell - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = golden * i;
    const jitter = 1 + (R() - 0.5) * 0.04;
    out[i * 3] = Math.cos(th) * rad * r * jitter;
    out[i * 3 + 1] = y * r * jitter;
    out[i * 3 + 2] = Math.sin(th) * rad * r * jitter;
  }
  // Inner "neurons": tight clusters inside the shell.
  const nodes = [];
  for (let k = 0; k < 26; k++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.cbrt(R()) * r * 0.78;
    const s = Math.sqrt(1 - u * u);
    nodes.push([Math.cos(a) * s * rr, u * rr, Math.sin(a) * s * rr]);
  }
  for (let i = shell; i < n; i++) {
    const a = nodes[Math.floor(R() * nodes.length)];
    const b = nodes[Math.floor(R() * nodes.length)];
    const t = R();
    // Half the points sit on nodes, half trace synapses between them.
    const onNode = R() < 0.45;
    const f = onNode ? 0 : t;
    const spread = onNode ? 0.12 : 0.025;
    out[i * 3] = a[0] + (b[0] - a[0]) * f + (R() - 0.5) * spread;
    out[i * 3 + 1] = a[1] + (b[1] - a[1]) * f + (R() - 0.5) * spread;
    out[i * 3 + 2] = a[2] + (b[2] - a[2]) * f + (R() - 0.5) * spread;
  }
  return out;
}

function terrain(n) {
  const out = new Float32Array(n * 3);
  const cols = Math.ceil(Math.sqrt(n * 1.8));
  const rows = Math.ceil(n / cols);
  const W = 13, D = 7.5;
  const h = (x, z) => {
    // Ridged sum of sines — reads as an alpine skyline without a noise lib.
    let v = 0, amp = 1, f = 0.35;
    for (let o = 0; o < 5; o++) {
      const s = Math.sin(x * f + o * 1.7) * Math.cos(z * f * 1.3 + o * 2.3);
      v += (1 - Math.abs(s)) * amp;
      amp *= 0.5; f *= 2.05;
    }
    const lake = Math.exp(-((x + 1.5) ** 2 + (z - 1.2) ** 2) * 0.25); // Lago di Lugano
    return Math.max(0, (v - 0.9) * 1.1 - lake * 1.2);
  };
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = (c / (cols - 1) - 0.5) * W;
    const z = (r / (rows - 1) - 0.5) * D;
    out[i * 3] = x;
    out[i * 3 + 1] = h(x, z);
    out[i * 3 + 2] = z;
  }
  return out;
}

function torusKnot(n) {
  const out = new Float32Array(n * 3);
  const R = rand(7);
  const p = 2, q = 3, rad = 1.35, tube = 0.36;
  const curve = (t) => {
    const r = rad * (2 + Math.cos(q * t)) / 3;
    return [r * Math.cos(p * t), r * Math.sin(p * t), rad * Math.sin(q * t) / 3];
  };
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const a = curve(t), b = curve(t + 0.001);
    const T = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const tl = Math.hypot(...T);
    T[0] /= tl; T[1] /= tl; T[2] /= tl;
    // Frame from the tangent and the world Z axis.
    let N = [T[1], -T[0], 0];
    const nl = Math.hypot(...N) || 1;
    N = [N[0] / nl, N[1] / nl, N[2] / nl];
    const B = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    const ang = R() * Math.PI * 2;
    const rr = tube * (0.92 + R() * 0.08);
    const ca = Math.cos(ang) * rr, sa = Math.sin(ang) * rr;
    out[i * 3] = (a[0] + N[0] * ca + B[0] * sa) * 1.45;
    out[i * 3 + 1] = (a[1] + N[1] * ca + B[1] * sa) * 1.45;
    out[i * 3 + 2] = (a[2] + N[2] * ca + B[2] * sa) * 1.45;
  }
  return out;
}

function galaxy(n) {
  const out = new Float32Array(n * 3);
  const R = rand(3);
  const arms = 3;
  for (let i = 0; i < n; i++) {
    const r = Math.pow(R(), 1.6) * 4.6;
    const arm = (i % arms) / arms * Math.PI * 2;
    const spin = r * 0.9;
    const spread = Math.pow(R(), 3) * (0.25 + r * 0.22);
    const a = arm + spin + (R() - 0.5) * 0.5;
    out[i * 3] = Math.cos(a) * r + (R() - 0.5) * spread;
    out[i * 3 + 1] = (R() - 0.5) * spread * 0.6;
    out[i * 3 + 2] = Math.sin(a) * r + (R() - 0.5) * spread;
  }
  return out;
}

async function portrait(n, url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();

  const S = 220;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, S, S);
  const data = ctx.getImageData(0, 0, S, S).data;

  // Keep the subject, drop the flat grey wall behind it:
  // skin is saturated, hair/sweater/glasses are dark, the wall is neither.
  const cand = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S * 0.86; x++) {
      const i = (y * S + x) * 4;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = max > 0 ? (max - min) / max : 0;
      if (lum < 0.42 || (sat > 0.13 && r > b)) cand.push([x, y, lum]);
    }
  }
  if (cand.length < 200) throw new Error('portrait sampling failed');

  const out = new Float32Array(n * 3);
  const lums = new Float32Array(n);
  const R = rand(5);
  const H = 4.9;
  for (let i = 0; i < n; i++) {
    const c = cand[i < cand.length ? Math.floor((i / n) * cand.length) : Math.floor(R() * cand.length)];
    const jx = (R() - 0.5), jy = (R() - 0.5);
    const nx = (c[0] + jx) / S - 0.5;
    const ny = 0.5 - (c[1] + jy) / S;
    // Relief: lighter = closer, plus a gentle dome so rotation reads as 3D.
    const dome = Math.cos(nx * 2.4) * Math.cos(ny * 1.6) * 0.9;
    out[i * 3] = nx * H;
    out[i * 3 + 1] = ny * H;
    out[i * 3 + 2] = dome + c[2] * 0.55 + (R() - 0.5) * 0.05;
    lums[i] = Math.min(1, c[2] * 1.25);
  }
  return { pos: out, lum: lums };
}

/* ---------- Scene ---------- */

async function createScene(canvas, { portraitUrl, reducedMotion }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  // Points are soft discs, so 1.5x is visually identical to 2x and much cheaper on 4K screens.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const isMobile = () => window.innerWidth < 900;
  const N = isMobile() ? 8000 : 16000;

  let p0, lum;
  try {
    ({ pos: p0, lum } = await portrait(N, portraitUrl));
  } catch {
    p0 = sphere(N, 2.1);
    lum = new Float32Array(N).fill(1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aP0', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aP1', new THREE.BufferAttribute(sphere(N, SPHERE_R), 3));
  geo.setAttribute('aP2', new THREE.BufferAttribute(terrain(N), 3));
  geo.setAttribute('aP3', new THREE.BufferAttribute(torusKnot(N), 3));
  geo.setAttribute('aP4', new THREE.BufferAttribute(galaxy(N), 3));
  geo.setAttribute('aLum', new THREE.BufferAttribute(lum, 1));
  const r4 = new Float32Array(N * 4);
  const R = rand(99);
  for (let i = 0; i < r4.length; i++) r4[i] = R();
  geo.setAttribute('aRand', new THREE.BufferAttribute(r4, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);

  const uniforms = {
    uTime: { value: 0 },
    uMorph: { value: 0 },
    uSize: { value: isMobile() ? 2.6 : 2.3 },
    uPixelRatio: { value: dpr },
    uMouse: { value: new THREE.Vector2(99, 99) },
    uMouseStrength: { value: 0 },
    uDim: { value: 1 },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  const group = new THREE.Group();
  group.add(points);
  scene.add(group);

  // State driven from outside.
  // anchor: optional fn returning a DOM element's on-screen circle {x, y, r} in px;
  // the sphere shape snaps to it so particles wrap that element exactly while scrolling.
  const state = { anchor: null, anchorMix: 0, lastAnchor: null, target: 0, morph: 0, dx: 0, dxTarget: 0, dy: 0, dyTarget: 0, mx: 0, my: 0, smx: 0, smy: 0, hasMouse: false, intro: 0 };

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.mx = (e.clientX / window.innerWidth) * 2 - 1;
    state.my = -(e.clientY / window.innerHeight) * 2 + 1;
    state.hasMouse = true;
  }, { passive: true });
  document.addEventListener('mouseleave', () => { state.hasMouse = false; });

  const lerp = (a, b, t) => a + (b - a) * t;
  const layoutAt = (m) => {
    const L = isMobile() ? LAYOUT_MOBILE : LAYOUT_DESKTOP;
    const i = Math.min(SHAPES - 2, Math.floor(m));
    const f = m - i;
    return L[i].map((v, k) => lerp(v, L[i + 1][k], f));
  };

  const clock = new THREE.Clock();
  const ndc = new THREE.Vector3();
  let running = true;
  let visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    uniforms.uTime.value = reducedMotion ? 0 : t;

    state.morph = lerp(state.morph, state.target, reducedMotion ? 1 : 1 - Math.pow(0.02, dt));
    uniforms.uMorph.value = state.morph;

    state.smx = lerp(state.smx, state.mx, 1 - Math.pow(0.001, dt));
    state.smy = lerp(state.smy, state.my, 1 - Math.pow(0.001, dt));

    let [x, y, s, tilt, dim] = layoutAt(state.morph);
    state.dx = lerp(state.dx, state.dxTarget, 1 - Math.pow(0.03, dt));
    state.dy = lerp(state.dy, state.dyTarget, 1 - Math.pow(0.03, dt));
    // Intro: particles fly in from a scattered, larger cloud.
    const intro = state.intro;
    x += state.dx;
    y += state.dy;

    state.anchorMix = lerp(state.anchorMix, state.anchor ? 1 : 0, 1 - Math.pow(0.02, dt));
    if (state.anchor) {
      const a = state.anchor();
      if (a) {
        // Screen px -> world units on the z = 0 plane.
        const wpp = (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / window.innerHeight;
        state.lastAnchor = [(a.x - window.innerWidth / 2) * wpp, -(a.y - window.innerHeight / 2) * wpp, (a.r * wpp) / SPHERE_R];
      }
    }
    if (state.lastAnchor && state.anchorMix > 0.001) {
      // Only the sphere shape follows the anchor; fade the effect out as we morph away from it.
      const m = state.anchorMix * Math.max(0, 1 - Math.abs(state.morph - 1));
      x = lerp(x, state.lastAnchor[0], m);
      y = lerp(y, state.lastAnchor[1], m);
      s = lerp(s, state.lastAnchor[2], m);
    }

    group.position.set(x, y, 0);
    group.scale.setScalar(s * (1 + (1 - intro) * 0.6));
    uniforms.uDim.value = dim * intro;

    const portraitWeight = Math.max(0, 1 - state.morph);
    const spin = reducedMotion ? 0 : t * 0.12;
    group.rotation.x = tilt + state.smy * -0.18;
    group.rotation.y = lerp(spin, 0, portraitWeight) + state.smx * 0.35;
    group.rotation.z = (1 - intro) * 0.4;

    // Mouse in world coords on the z=0 plane.
    ndc.set(state.smx, state.smy, 0.5).unproject(camera);
    ndc.sub(camera.position).normalize();
    const dist = -camera.position.z / ndc.z;
    const wx = camera.position.x + ndc.x * dist;
    const wy = camera.position.y + ndc.y * dist;
    uniforms.uMouse.value.set(wx, wy);
    uniforms.uMouseStrength.value = lerp(uniforms.uMouseStrength.value, state.hasMouse ? 1 : 0, 0.08);

    renderer.render(scene, camera);
  }
  frame();

  return {
    setAnchor(fn) { state.anchor = fn; },
    setTarget(v, dx = 0, dy = 0) { state.target = Math.max(0, Math.min(SHAPES - 1, v)); state.dxTarget = dx; state.dyTarget = dy; },
    setIntro(v) { state.intro = v; },
    get introState() { return state; },
    destroy() { running = false; renderer.dispose(); },
  };
}

window.DSScene = { createScene };
})();
