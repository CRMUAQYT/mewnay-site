// The 3D story behind the landing page: a titanium phone with the real app screens,
// widgets orbiting it, a tap at a terminal, card backgrounds, and the app icon.
// place(t) poses everything for a film time t (0..15); site.js maps scroll to t.
import * as THREE from '/vendor/three.module.min.js';

const TAP = 7.35;
const END = 13.4;
const TWO_PI = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const outCubic = (p) => 1 - (1 - p) ** 3;
const inCubic = (p) => p ** 3;
const inOut = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const inOutSine = (p) => -(Math.cos(Math.PI * p) - 1) / 2;
const outBack = (p, s = 0.9) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;

// Keyframes with continuous velocity, so the camera glides through keys without stopping.
function track(keys) {
  const n = keys.length;
  const slope = keys.map((k, i) => {
    const a = keys[Math.max(0, i - 1)];
    const b = keys[Math.min(n - 1, i + 1)];
    return k.map((_, j) => (j === 0 || b[0] === a[0] ? 0 : (b[j] - a[j]) / (b[0] - a[0])));
  });
  return (t) => {
    if (t <= keys[0][0]) return keys[0].slice(1);
    if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
    let i = 0;
    while (t > keys[i + 1][0]) i += 1;
    const span = keys[i + 1][0] - keys[i][0];
    const u = (t - keys[i][0]) / span;
    const u2 = u * u;
    const u3 = u2 * u;
    return keys[i].slice(1).map((v, j) => {
      const k = j + 1;
      return (2 * u3 - 3 * u2 + 1) * v + (u3 - 2 * u2 + u) * span * slope[i][k] + (-2 * u3 + 3 * u2) * keys[i + 1][k] + (u3 - u2) * span * slope[i + 1][k];
    });
  };
}

function rounded(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
function flat(w, h, r) {
  const g = new THREE.ShapeGeometry(rounded(w, h, r), 32);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i += 1) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
  return g;
}
function slab(w, h, r, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(rounded(w, h, r), { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 6, curveSegments: 32 });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return g;
}

// The background: slow flowing light, drawn by a shader every frame.
const BG_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float time;
uniform vec2 res;
uniform vec2 focus;
uniform vec3 tintA;
uniform vec3 tintB;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0., a = .5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; }
  return v;
}
void main() {
  vec2 p = (vUv - .5) * vec2(res.x / res.y, 1.);
  float t = time * .05;
  vec2 q = vec2(fbm(p * 1.5 + t), fbm(p * 1.5 - t + 3.1));
  float n = fbm(p * 1.15 + q * 1.9 + vec2(t * .7, -t));
  float d = length(p - focus);
  vec3 col = vec3(.008, .010, .016);
  col += tintA * smoothstep(.38, .95, n) * .62 * exp(-d * 1.25);
  col += tintB * pow(smoothstep(.5, 1., n), 2.) * .5 * exp(-d * .8);
  col += tintA * .05 * exp(-d * 2.4);
  col += (hash(vUv * res + fract(time)) - .5) * .014;
  gl_FragColor = vec4(col, 1.);
}`;

const MOODS = [
  [0, [0.12, 0.3, 0.95], [0.05, 0.55, 0.85]],
  [6.0, [0.12, 0.3, 0.95], [0.05, 0.55, 0.85]],
  [6.8, [0.04, 0.62, 0.42], [0.1, 0.42, 0.95]],
  [9.6, [0.04, 0.62, 0.42], [0.1, 0.42, 0.95]],
  [10.2, [0.78, 0.22, 0.5], [0.95, 0.5, 0.15]],
  [13.3, [0.78, 0.22, 0.5], [0.95, 0.5, 0.15]],
  [13.6, [0.14, 0.34, 1.0], [0.4, 0.3, 0.95]],
];
function mood(t) {
  let i = 0;
  while (i < MOODS.length - 2 && t > MOODS[i + 1][0]) i += 1;
  const [t0, a0, b0] = MOODS[i];
  const [t1, a1, b1] = MOODS[i + 1];
  const p = inOutSine(prog(t, t0, t1));
  return [a0.map((v, k) => lerp(v, a1[k], p)), b0.map((v, k) => lerp(v, b1[k], p))];
}

export async function createScene(canvas, { lang, mobile, still = false }) {
  const base = `/assets/tex/${lang}`;
  const META = await (await fetch(`${base}/meta.json`)).json();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: still });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile() ? 2 : 1.75));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 10, 4000);

  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bg = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, focus: { value: new THREE.Vector2() }, tintA: { value: new THREE.Color() }, tintB: { value: new THREE.Color() } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: BG_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bg));

  // A photo studio of softboxes: all the metal and glass reflect it.
  const room = new THREE.Scene();
  const softbox = (w, h, pos, power, color = 0xffffff) => {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    light.position.set(...pos);
    light.lookAt(0, 0, 0);
    room.add(light);
  };
  softbox(9, 3.4, [0, 7, 3], 5);
  softbox(1.1, 11, [-7, 0.5, 3.5], 17);
  softbox(0.6, 11, [7, 1, 2.5], 15, 0xdbe7ff);
  softbox(11, 1, [0, -6.5, 3], 2.2, 0x7aa5ff);
  softbox(4, 10, [3, 0, -8], 3, 0xa9c2ee);
  softbox(4, 10, [-4, 0, -8], 2, 0xf3dfc2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.015).texture;
  pmrem.dispose();
  scene.environment = env;

  const titanium = new THREE.MeshPhysicalMaterial({ color: 0x8f8c86, metalness: 1, roughness: 0.3 });
  const blackGlass = new THREE.MeshPhysicalMaterial({ color: 0x030304, metalness: 0, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 });
  const backGlass = new THREE.MeshPhysicalMaterial({ color: 0x6f6c66, metalness: 0.75, roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const sheen = (power) => new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: power, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  const SW = 68;
  const SH = 147.16;
  const PW = 71.6;
  const PH = 150.8;
  const PD = 8.25;
  const MM = SW / 390;

  const rig = new THREE.Group();
  scene.add(rig);
  const phone = new THREE.Group();
  rig.add(phone);
  phone.add(new THREE.Mesh(slab(PW, PH, 12.6, PD, 1.25), titanium));
  const front = new THREE.Mesh(flat(PW - 0.7, PH - 0.7, 12.2), blackGlass);
  front.position.z = PD / 2 + 0.02;
  phone.add(front);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const screen = new THREE.Mesh(flat(SW, SH, 10.6), screenMat);
  screen.position.z = PD / 2 + 0.05;
  phone.add(screen);
  const glassTop = new THREE.Mesh(flat(SW, SH, 10.6), sheen(0.03));
  glassTop.position.z = PD / 2 + 0.08;
  glassTop.renderOrder = 5;
  phone.add(glassTop);
  const back = new THREE.Mesh(flat(PW - 0.7, PH - 0.7, 12.2), backGlass);
  back.rotation.y = Math.PI;
  back.position.z = -PD / 2 - 0.02;
  phone.add(back);
  const plateau = new THREE.Mesh(slab(36, 38, 10, 1.6, 0.6), backGlass);
  plateau.position.set(16, 53.5, -PD / 2 - 0.7);
  phone.add(plateau);
  [[9, 62], [24, 53.5], [9, 45]].forEach(([x, y]) => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 2.2, 40), titanium);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(x, y, -PD / 2 - 2);
    phone.add(barrel);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(4.7, 40), blackGlass);
    lens.rotation.y = Math.PI;
    lens.position.set(x, y, -PD / 2 - 3.15);
    phone.add(lens);
  });
  [[-1, 34, 15], [-1, 18, 15], [-1, 50, 7], [1, 26, 22]].forEach(([side, y, len]) => {
    const key = new THREE.Mesh(slab(1.1, len, 0.5, 3, 0.3), titanium);
    key.position.set(side * (PW / 2 + 0.2), y, 0);
    phone.add(key);
  });

  function plate(w, h, r, depth, power = 0.02) {
    const group = new THREE.Group();
    const edge = new THREE.Mesh(slab(w, h, r, depth, Math.min(depth / 2.2, 0.8)), new THREE.MeshPhysicalMaterial({ color: 0x1b2230, metalness: 0.85, roughness: 0.2, clearcoat: 1, transparent: true }));
    const face = new THREE.Mesh(flat(w, h, r), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.06, 1.06, 1.06), transparent: true }));
    face.position.z = depth / 2 + 0.03;
    const top = new THREE.Mesh(flat(w, h, r), sheen(power));
    top.position.z = depth / 2 + 0.06;
    top.renderOrder = 6;
    group.add(edge, face, top);
    const fade = (alpha) => {
      edge.material.opacity = alpha;
      face.material.opacity = alpha;
      top.material.opacity = alpha;
      edge.material.depthWrite = alpha > 0.99;
    };
    return { group, face, fade };
  }

  const WIDGETS = [['w1', 346, 22, 66], ['w2', 165, 22, 240], ['w3', 165, 203, 240], ['w4', 346, 22, 414], ['w5', 346, 22, 588]].map(([name, w, px, py], i) => {
    const p = plate(w * MM, 158 * MM, 3.9, 2.6);
    rig.add(p.group);
    return { ...p, name, gx: (px + w / 2 - 195) * MM, gy: (422 - py - 79) * MM, phase: (i / 5) * TWO_PI, y: (2 - i) * 21 };
  });
  const ringTilt = new THREE.Euler(0.42, 0, -0.34);

  const note = plate(366 * MM, 84 * MM, 4.6, 1.8, 0.012);
  phone.add(note.group);

  const terminal = new THREE.Group();
  terminal.add(new THREE.Mesh(slab(74, 104, 11, 15, 2.2), new THREE.MeshPhysicalMaterial({ color: 0x16181d, metalness: 0.2, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 })));
  const termFaceA = new THREE.Mesh(flat(62, 91, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 1.05, 1.05) }));
  const termFaceB = new THREE.Mesh(flat(62, 91, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 1.05, 1.05), transparent: true, opacity: 0 }));
  termFaceA.position.z = 7.54;
  termFaceB.position.z = 7.58;
  const termGlass = new THREE.Mesh(flat(62, 91, 6), sheen(0.03));
  termGlass.position.z = 7.62;
  terminal.add(termFaceA, termFaceB, termGlass);
  scene.add(terminal);

  const DECK = ['ocean', 'aurora', 'neon', 'sakura', 'dala'];
  const cards = DECK.map((name) => {
    const p = plate(112, (112 * META.card.h) / META.card.w, (112 * 28) / META.card.w, 2.2, 0.05);
    scene.add(p.group);
    return { ...p, name };
  });

  const badge = new THREE.Group();
  badge.add(new THREE.Mesh(slab(58, 58, 13.4, 7, 1.8), titanium));
  const badgeFace = new THREE.Mesh(flat(55.4, 55.4, 12.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 1.05, 1.05) }));
  badgeFace.position.z = 3.53;
  const badgeGlass = new THREE.Mesh(flat(55.4, 55.4, 12.2), sheen(0.035));
  badgeGlass.position.z = 3.56;
  badge.add(badgeFace, badgeGlass);
  scene.add(badge);

  // Timelines. Rig: x y z rx ry rz. Camera: x y z, then the point it looks at.
  const rigA = track([
    [0, 15, -46, 0, 0.08, -1.46, 0.16], [1.3, 7, -40, 0, 0.05, -0.74, 0.08], [2.7, 0, -30, 0, 0.03, -0.12, 0], [4.5, 0, -26, 0, 0.02, 0.05, 0], [5.6, 0, -26, 0, 0.02, -0.12, 0],
    [6.08, 0, -26, 0, 0.02, -0.04, 0], [6.8, 40, -40, 0, 0.03, TWO_PI - 0.2, -0.06], [7.1, 30, -38, 12, 0.05, TWO_PI - 0.26, 0.12], [TAP, 16, -36, 20, 0.05, TWO_PI - 0.32, 0.27],
    [7.62, 28, -34, 14, 0.03, TWO_PI - 0.1, 0.04], [8.3, 28, -34, 14, 0, TWO_PI - 0.02, 0], [9.75, 28, -33, 14, 0, TWO_PI + 0.05, 0],
  ]);
  const rigB = track([[11.3, 0, -300, 0, 0.14, -0.34, 0], [12.25, 0, -28, 0, 0.03, -0.1, 0], [END, 0, -26, 0, 0.02, 0.09, 0]]);
  const camA = track([
    [0, 34, 6, 340, 2, 0, 0], [1.3, 18, 2, 420, 0, 0, 0], [2.7, 0, 4, 580, 0, 0, 0], [4.3, -6, 12, 760, 0, -4, 0], [5.6, 0, 6, 590, 0, -6, 0], [6.1, 0, 6, 600, 0, -6, 0],
    [6.8, 0, 2, 690, 0, -20, 0], [TAP, 0, 2, 670, 0, -20, 0], [8.2, 28, -8, 450, 28, -8, 0], [9.75, 28, -8, 420, 28, -8, 0],
  ]);
  const SLIDES = [10.15, 10.52, 10.89, 11.26];
  const SLOT_X = (META.card.x + META.card.w / 2 - 195) * MM;
  const SLOT_Y = (422 - META.card.y - META.card.h / 2) * MM;
  const SLOT_SCALE = (META.card.w * MM) / 112;
  const slotPosition = new THREE.Vector3();
  const slotQuaternion = new THREE.Quaternion();
  const ring = new THREE.Vector3();
  const euler = new THREE.Euler();

  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = async (url) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    return t;
  };
  const names = ['app', 'home', 'lock', 'note', 'termWait', 'termOk', ...WIDGETS.map((w) => w.name), ...DECK.map((d) => `card-${d}`)];
  const loaded = await Promise.all(names.map((n) => load(`${base}/${n}.webp`)));
  const textures = Object.fromEntries(names.map((n, i) => [n, loaded[i]]));
  WIDGETS.forEach((w) => { w.face.material.map = textures[w.name]; });
  cards.forEach((c) => { c.face.material.map = textures[`card-${c.name}`]; });
  note.face.material.map = textures.note;
  termFaceA.material.map = textures.termWait;
  termFaceB.material.map = textures.termOk;
  badgeFace.material.map = await load('/assets/icon-512.webp');

  let current = null;
  function setScreen(map, brightness) {
    if (current !== map) {
      screenMat.map = map;
      screenMat.needsUpdate = true;
      current = map;
    }
    screenMat.color.setScalar(brightness);
  }

  function place(t) {
    const stage = t < 9.75 ? 0 : t < END ? 1 : 2;
    rig.visible = stage === 0 || (stage === 1 && t > 11.3);
    cards.forEach((c) => { c.group.visible = stage === 1; });
    badge.visible = stage === 2;

    let r = [0, 0, 0, 0, 0, 0];
    let c = [0, 0, 560, 0, 0, 0];
    if (stage === 0) { r = rigA(t); c = camA(t); }
    if (stage === 1) { r = rigB(t); r[1] = lerp(-300, -37, outCubic(prog(t, 11.3, 12.25))) + prog(t, 12.25, END) * 2; c = [Math.sin(t * 1.4) * 6, 4, 620, 0, -4, 0]; }
    rig.position.set(r[0], r[1], r[2]);
    rig.rotation.set(r[3], r[4], r[5]);
    camera.position.set(c[0], c[1], c[2]);
    camera.lookAt(c[3], c[4], c[5]);

    if (stage === 0) {
      if (t < 2.3) setScreen(textures.app, inOutSine(prog(t, 0.5, 0.95)) * 1.06);
      else if (t < 6.4) setScreen(textures.home, lerp(1.06, 1.02, prog(t, 2.3, 2.6)) * (t < 2.5 ? lerp(1, 0.35, Math.sin(prog(t, 2.3, 2.5) * Math.PI)) : 1));
      else setScreen(textures.lock, 1.04);
    } else if (stage === 1) {
      setScreen(textures.app, 1.06);
    }

    const widgetsOn = stage === 0 && t > 2.25 && t < 6.42;
    const spin = outCubic(prog(t, 2.25, 5.0)) * TWO_PI * 1.05 + (t - 2.25) * 0.3;
    const open = outCubic(prog(t, 2.25, 2.95));
    WIDGETS.forEach((w, i) => {
      w.group.visible = widgetsOn;
      if (!widgetsOn) return;
      const th = w.phase + spin;
      ring.set(Math.sin(th) * 84 * open, w.y * open, Math.cos(th) * 92 * open).applyEuler(ringTilt);
      const land = inOut(prog(t, 4.55 + i * 0.09, 5.3 + i * 0.09));
      const flatten = clamp(land * 1.3);
      w.group.position.set(lerp(ring.x, w.gx, land), lerp(ring.y, w.gy, land), lerp(ring.z, PD / 2 + 0.22, land) + Math.sin(land * Math.PI) * 16);
      w.group.rotation.set(lerp(-0.1, 0, flatten), lerp(Math.sin(th) * 0.62, 0, flatten), lerp(0.12, 0, flatten));
      const s = lerp(1.32, 1, land) * clamp(open * 1.4);
      w.group.scale.set(s, s, lerp(1, 0.08, land));
      w.face.material.color.setScalar(lerp(lerp(0.34, 1.06, (Math.cos(th) + 1) / 2), 1.04, land));
    });

    const termOn = stage === 0 && t > 6.3 && t < 8.5;
    terminal.visible = termOn;
    if (termOn) {
      const inP = outCubic(prog(t, 6.32, 7.0));
      const outP = inCubic(prog(t, 7.75, 8.45));
      // Wide screens have copy on the left, so the terminal rises from below instead.
      if (mobile()) terminal.position.set(lerp(-190, -46, inP) - outP * 150, -30, -30);
      else terminal.position.set(-46, -30 - (1 - inP) * 230 - outP * 230, -30);
      terminal.rotation.set(-0.06, 0.34, 0.03);
    }
    termFaceB.material.opacity = prog(t, TAP + 0.02, TAP + 0.16);

    const noteOn = stage === 0 && t > TAP + 0.18;
    note.group.visible = noteOn;
    if (noteOn) {
      const slide = outBack(prog(t, TAP + 0.2, TAP + 0.72), 1.1);
      const lift = inOut(prog(t, 8.05, 8.75));
      note.group.position.set(0, lerp(92, 8, slide), lerp(PD / 2 + 0.3, PD / 2 + 26, lift));
      note.group.rotation.set(lerp(0, -0.06, lift), lerp(0, 0.1, lift), 0);
      note.group.scale.setScalar(lerp(1, 1.04, lift));
      note.face.material.opacity = prog(t, TAP + 0.2, TAP + 0.34);
    }

    if (stage === 1) {
      let pos = 0;
      SLIDES.forEach((at) => { pos += inOutSine(prog(t, at, at + 0.34)); });
      const land = inOut(prog(t, 11.62, 12.4));
      rig.updateMatrixWorld();
      rig.localToWorld(slotPosition.set(SLOT_X, SLOT_Y, PD / 2 + 0.26));
      rig.getWorldQuaternion(slotQuaternion);
      cards.forEach((card, i) => {
        const o = i - pos;
        const a = Math.abs(o);
        const chosen = i === cards.length - 1;
        card.group.visible = a < 2.6 && (chosen || land < 0.9);
        card.group.position.set(Math.sign(o) * Math.min(a, 1) * 92 + o * 22 + (chosen ? 0 : Math.sign(o) * land * 170), -8 + Math.sin(t * 2 + i) * 1.2, -Math.min(a, 1) * 78 - a * 30);
        card.group.quaternion.setFromEuler(euler.set(0.05, -clamp(o, -1, 1) * 0.92, Math.sin(t * 1.6) * 0.012));
        card.group.scale.setScalar(1);
        card.face.material.color.setScalar(lerp(1.06, 0.34, clamp(a * 0.8)));
        card.fade(chosen ? 1 : clamp(1 + o * 2.4));
        if (chosen) {
          card.group.position.lerp(slotPosition, land);
          card.group.position.z += Math.sin(land * Math.PI) * 26;
          card.group.quaternion.slerp(slotQuaternion, land);
          const s = lerp(1, SLOT_SCALE, land);
          card.group.scale.set(s, s, lerp(1, 0.08, land));
        }
      });
    }

    if (stage === 2) {
      const p = outCubic(prog(t, END, END + 1.0));
      badge.position.set(0, 0, 0);
      badge.rotation.set(lerp(0.34, 0.02, p), lerp(-1.05, 0, p) + Math.sin(performance.now() / 900) * 0.06, lerp(0.1, 0, p));
      badge.scale.setScalar(lerp(0.9, 1.5, p) * (mobile() ? 0.72 * badgeRoom : 1));
      camera.position.set(0, 0, 560);
      camera.lookAt(0, 0, 0);
    }
    return stage;
  }

  // Where the subject sits on screen: right of the copy on wide screens, below it on phones.
  // `reach` is how far down the screen the copy goes (0..1); the phone's top sits near 27%.
  let lift = 0;
  let badgeRoom = 1;
  function frame(t, w, h, { reach, finalTop }, dt) {
    const wide = !mobile();
    let x = 0;
    let y = 0;
    if (wide) {
      const orbit = inOutSine(prog(t, 2.25, 2.8)) * (1 - inOutSine(prog(t, 4.7, 5.4)));
      const tap = inOutSine(prog(t, 6.2, 6.9)) * (1 - prog(t, 8.2, 8.8));
      x = -lerp(0.2, 0.27, Math.max(orbit, tap)) * w;
      y = (t < END ? lerp(0.08, -0.03, prog(t, 6.1, 7.4)) : 0) * h;
      if (t >= 9.75 && t < END) y = 0.05 * h;
      badgeRoom = 1;
    } else {
      // The icon centres itself in the space above the final copy and shrinks away when there is none.
      const goal = t >= END ? -(0.5 - clamp(finalTop * 0.5, 0.12, 0.42)) : Math.min(0.42, Math.max(0, reach + 0.04 - 0.27));
      badgeRoom = clamp((finalTop - 0.2) / 0.16);
      lift += (goal - lift) * (1 - Math.exp(-dt * 7));
      y = -lift * h;
    }
    if (camera.fov !== (wide ? 21 : 24)) {
      camera.fov = wide ? 21 : 24;
      camera.updateProjectionMatrix();
    }
    camera.setViewOffset(w, h, x, y, w, h);
    bg.uniforms.focus.value.set(wide ? 0.25 * (w / h) : 0, wide ? -0.08 : -y / h - 0.1);
  }

  let width = 0;
  let height = 0;
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === width && Math.abs(h - height) < 90 && height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    bg.uniforms.res.value.set(w, h);
  }

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  let shown = null;
  let last = performance.now();
  return {
    run(target, reachOf = () => ({ reach: 0, finalTop: 1 })) {
      const loop = (now) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        resize();
        const goal = target(now);
        shown = shown === null || still ? goal : shown + (goal - shown) * (1 - Math.exp(-dt * 6));
        if (Math.abs(goal - shown) > 2.5) shown = goal;
        const stage = place(shown);
        pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 4));
        pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 4));
        const idle = still ? 0 : Math.sin(now / 1600) * 0.04;
        if (stage === 0 || stage === 1) {
          rig.rotation.y += pointer.x * 0.16 + idle;
          rig.rotation.x += pointer.y * 0.06;
        }
        frame(shown, width, height, reachOf() ?? { reach: 0, finalTop: 1 }, still ? 10 : dt);
        const [a, b] = mood(shown);
        bg.uniforms.tintA.value.setRGB(...a);
        bg.uniforms.tintB.value.setRGB(...b);
        bg.uniforms.time.value = still ? 40 : now / 1000;
        const dip = Math.max(Math.exp(-Math.abs(shown - 9.75) * 9), Math.exp(-Math.abs(shown - END) * 9));
        canvas.style.filter = dip > 0.02 ? `brightness(${1 - dip * 0.85})` : '';
        renderer.clear();
        renderer.render(bgScene, bgCamera);
        renderer.clearDepth();
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
  };
}
