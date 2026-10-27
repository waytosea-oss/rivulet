/* Rivulet — screen-space water.
   Particle solver lives in sim.js. This file only draws it: orthographic
   splats, depth + thickness, bilateral blur, then a clear-water shade
   (refraction, fresnel, specular) over the painted board.
   Technique adapted from the fluid lab: CPU particles, depth-thickness
   bilateral shading. Visuals here are clear water only. Three.js is MIT. */
import * as THREE from './vendor/three.module.min.js';

const Q = new URLSearchParams(location.search);
const LEVELS = [
  { id: 'low', rt: 0.55, dpr: 1, blur: 6, fill: 6 },
  { id: 'high', rt: 0.85, dpr: 1.5, blur: 8, fill: 5 }
];

function deviceQi() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const q = (Q.get('q') || '').toLowerCase();
  if (q === 'low' || q === '0') return 0;
  if (q === 'high' || q === '1') return 1;
  if ((mem && mem <= 2) || (cores && cores <= 2)) return 0;
  return 1;
}

let qMode = (Q.get('q') === 'low' || Q.get('q') === 'high') ? Q.get('q') : 'auto';
let qAuto = qMode === 'auto';
let qi = deviceQi();
let onQ = null;

const canvas = document.createElement('canvas');
canvas.id = 'glfx';
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: false, alpha: false,
    powerPreference: 'high-performance', depth: true, stencil: false
  });
} catch (e) { renderer = null; }
if (renderer) {
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
}

const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 8);
cam.position.set(0, 0, 2);
cam.up.set(0, 1, 0);
cam.lookAt(0, 0, 0);

const MAXP = 8000;
let W = 2, H = 2, worldW = 1, worldH = 1;
let view = { x: 0, y: 0, bw: 1, bh: 1, W: 2, H: 2 };
let viewSig = '';
let radius = 0.01;
let bgCanvas = null, bgTex = null;
let RT = {}, mats = null, pGeo = null, pts = null, ptScene = null;
let quadScene = null, quadCam = null, quadMesh = null;
const _look = new THREE.Vector3();

function rtNew(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false
  });
}

function layout() {
  if (!renderer) return;
  const L = LEVELS[qi];
  const dpr = Math.min(window.devicePixelRatio || 1, L.dpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(Math.max(2, W), Math.max(2, H), false);
  const ppm = view.bw > 2 ? worldW / view.bw : 1;
  const frustumW = W * ppm;
  const frustumH = H * ppm;
  const cx = (W / 2 - view.x) * ppm;
  const cy = (view.y + view.bh - H / 2) * ppm;
  cam.left = -frustumW / 2; cam.right = frustumW / 2;
  cam.top = frustumH / 2; cam.bottom = -frustumH / 2;
  cam.position.set(cx, cy, 2);
  _look.set(cx, cy, 0);
  cam.lookAt(_look);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  cam.userData.frustumH = frustumH;
  if (bgTex) bgTex.dispose();
  if (bgCanvas) {
    bgTex = new THREE.CanvasTexture(bgCanvas);
    bgTex.minFilter = THREE.LinearFilter;
    bgTex.magFilter = THREE.LinearFilter;
    bgTex.generateMipmaps = false;
    bgTex.colorSpace = THREE.NoColorSpace;
  }
  const rw = Math.max(2, Math.round(W * dpr * L.rt));
  const rh = Math.max(2, Math.round(H * dpr * L.rt));
  for (const k in RT) if (RT[k] && RT[k].dispose) RT[k].dispose();
  RT = {
    depth: rtNew(rw, rh), thick: rtNew(rw, rh),
    a: rtNew(rw, rh), b: rtNew(rw, rh),
    ta: rtNew(rw, rh), tb: rtNew(rw, rh),
    size: [rw, rh]
  };
  if (mats) mats.comp.uniforms.bg.value = bgTex;
}

function initGL() {
  pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('colorId', new THREE.BufferAttribute(new Float32Array(MAXP), 1).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('sz', new THREE.BufferAttribute(new Float32Array(MAXP), 1).setUsage(THREE.DynamicDrawUsage));
  pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.5, 0.6, 0), 4);
  const pv = `
    attribute float colorId; attribute float sz;
    uniform float uPx; uniform float uRad;
    varying float vZ; varying float vR; varying float vId;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vZ = -mv.z; vR = uRad * sz; vId = colorId;
      gl_PointSize = max(2.0, vR * 2.0 * uPx);
      gl_Position = projectionMatrix * mv;
    }`;
  const colorFn = `
    vec3 waterColor(float id) {
      if (id < 0.5) return vec3(0.22, 0.58, 0.98);
      if (id < 1.5) return vec3(0.98, 0.80, 0.16);
      if (id < 2.5) return vec3(0.95, 0.38, 0.58);
      if (id < 3.5) return vec3(0.30, 0.82, 0.46);
      if (id < 4.5) return vec3(0.98, 0.55, 0.16);
      if (id < 5.5) return vec3(0.64, 0.40, 0.95);
      if (id < 6.5) return vec3(0.42, 0.78, 0.28);
      if (id < 7.5) return vec3(0.95, 0.28, 0.08);
      return vec3(0.96, 0.72, 0.16);
    }`;
  const depthMat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uRad: { value: 0.01 } },
    vertexShader: pv,
    fragmentShader: `
      varying float vZ; varying float vR;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0; c.y = -c.y;
        float r2 = dot(c, c); if (r2 > 1.0) discard;
        float nz = sqrt(1.0 - r2);
        /* Eye depth packed into 0–1. Empty pixels stay at 1 so min-blend
           works even when clearColor clamps, including on phone GPUs. */
        float eyeZ = max(0.02, vZ - nz * vR);
        gl_FragColor = vec4(clamp(eyeZ / 6.0, 0.02, 0.92), 0.0, 0.0, 1.0);
      }`,
    depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.MinEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor
  });
  const thickMat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uRad: { value: 0.01 } },
    vertexShader: pv,
    fragmentShader: colorFn + `
      varying float vR; varying float vId;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(c, c); if (r2 > 1.0) discard;
        float nz = sqrt(1.0 - r2);
        float t = nz * vR * 260.0;
        gl_FragColor = vec4(waterColor(vId) * t, t);
      }`,
    depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor
  });
  const vsQuad = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const blurDepth = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() }, rad: { value: 5 }, fall: { value: 0.025 } },
    vertexShader: vsQuad,
    fragmentShader: `
      uniform sampler2D tex; uniform vec2 dir; uniform float rad; uniform float fall; varying vec2 vUv;
      void main() {
        float d0 = texture2D(tex, vUv).r;
        if (d0 > 0.97) {
          float s = 0.0, w = 0.0;
          for (int i = -3; i <= 3; i++) {
            float d = texture2D(tex, vUv + dir * float(i)).r;
            if (d < 0.97) { s += d; w += 1.0; }
          }
          gl_FragColor = vec4(w >= 4.0 ? s / w : 1.0, 0.0, 0.0, 1.0);
          return;
        }
        float s = 0.0, w = 0.0; float sig = rad * 0.45;
        for (int i = -8; i <= 8; i++) {
          float fi = float(i); if (abs(fi) > rad) continue;
          float d = texture2D(tex, vUv + dir * fi).r; if (d > 0.97) continue;
          float ws = exp(-fi * fi / (2.0 * sig * sig));
          float dz = (d - d0) / fall; float wr = exp(-dz * dz);
          s += d * ws * wr; w += ws * wr;
        }
        gl_FragColor = vec4(s / max(w, 1e-5), 0.0, 0.0, 1.0);
      }`,
    depthTest: false, depthWrite: false
  });
  const blurThick = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() }, rad: { value: 4 } },
    vertexShader: vsQuad,
    fragmentShader: `
      uniform sampler2D tex; uniform vec2 dir; uniform float rad; varying vec2 vUv;
      void main() {
        vec4 s2 = vec4(0.0); float w = 0.0; float sig = rad * 0.5;
        for (int i = -8; i <= 8; i++) {
          float fi = float(i); if (abs(fi) > rad) continue;
          float ws = exp(-fi * fi / (2.0 * sig * sig));
          s2 += texture2D(tex, vUv + dir * fi) * ws; w += ws;
        }
        gl_FragColor = s2 / max(w, 1e-5);
      }`,
    depthTest: false, depthWrite: false
  });
  const comp = new THREE.ShaderMaterial({
    uniforms: {
      bg: { value: null }, dep: { value: null }, thk: { value: null },
      invP: { value: new THREE.Matrix4() }, texel: { value: new THREE.Vector2() },
      uLite: { value: 0 }
    },
    vertexShader: vsQuad,
    fragmentShader: `
      uniform sampler2D bg, dep, thk; uniform mat4 invP; uniform vec2 texel; uniform float uLite; varying vec2 vUv;
      vec3 vpos(vec2 uv, float d) {
        vec4 v = invP * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
        return vec3(v.x / v.w, v.y / v.w, -d);
      }
      void main() {
        vec3 base = texture2D(bg, vUv).rgb;
        float dn = texture2D(dep, vUv).r;
        vec4 tk = texture2D(thk, vUv);
        float th = tk.a;
        if (dn > 0.97 || th < 0.015) { gl_FragColor = vec4(base, 1.0); return; }
        float d = dn * 6.0;
        vec3 tint = tk.rgb / max(th, 1e-4);
        vec3 p = vpos(vUv, d);
        float dr = texture2D(dep, vUv + vec2(texel.x, 0.0)).r;
        float dl = texture2D(dep, vUv - vec2(texel.x, 0.0)).r;
        float du = texture2D(dep, vUv + vec2(0.0, texel.y)).r;
        float dd = texture2D(dep, vUv - vec2(0.0, texel.y)).r;
        vec3 ddx = (dr < 0.97) ? vpos(vUv + vec2(texel.x, 0.0), dr * 6.0) - p : p - vpos(vUv - vec2(texel.x, 0.0), dl * 6.0);
        vec3 ddx2 = (dl < 0.97) ? p - vpos(vUv - vec2(texel.x, 0.0), dl * 6.0) : ddx;
        if (abs(ddx2.z) < abs(ddx.z)) ddx = ddx2;
        vec3 ddy = (du < 0.97) ? vpos(vUv + vec2(0.0, texel.y), du * 6.0) - p : p - vpos(vUv - vec2(0.0, texel.y), dd * 6.0);
        vec3 ddy2 = (dd < 0.97) ? p - vpos(vUv - vec2(0.0, texel.y), dd * 6.0) : ddy;
        if (abs(ddy2.z) < abs(ddy.z)) ddy = ddy2;
        vec3 n = normalize(cross(ddx, ddy));
        if (n.z < 0.0) n = -n;
        n = normalize(mix(n, vec3(0.0, 0.0, 1.0), 0.18));
        vec3 viewDir = vec3(0.0, 0.15, 1.0);
        float t = clamp(th * 1.35, 0.0, 5.0);
        float oil = smoothstep(0.55, 0.9, tint.r) * (1.0 - smoothstep(0.25, 0.7, tint.b));
        vec3 sigma = mix(vec3(1.15, 0.42, 0.14), vec3(0.18, 0.55, 1.7), oil);
        vec3 beer = exp(-sigma * t);
        vec2 ruv = vUv + n.xy * (0.012 + 0.01 * t);
        vec3 refr = texture2D(bg, clamp(ruv, 0.002, 0.998)).rgb;
        vec3 trans = refr * beer + tint * (1.0 - beer) * 0.55;
        float ndv = clamp(dot(n, viewDir), 0.0, 1.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 L1 = normalize(vec3(-0.35, 0.72, 0.6));
        float spec = pow(max(dot(n, normalize(L1 + viewDir)), 0.0), uLite > 0.5 ? 48.0 : 90.0);
        if (uLite < 0.5) {
          vec3 L2 = normalize(vec3(0.55, 0.15, 0.82));
          spec += pow(max(dot(n, normalize(L2 + viewDir)), 0.0), 36.0) * 0.45;
        }
        spec *= 0.62;
        vec3 env = mix(vec3(0.55, 0.78, 0.92), vec3(1.0, 0.98, 0.94), smoothstep(-0.2, 0.85, reflect(-viewDir, n).y));
        vec3 col = mix(trans, env, fres * 0.55) + spec * vec3(1.0, 0.99, 0.94);
        float foam = smoothstep(0.55, 0.04, th) * smoothstep(0.0, 0.035, th);
        foam = max(foam, smoothstep(0.45, 0.9, 1.0 - n.z) * smoothstep(0.05, 0.35, th));
        col = mix(col, vec3(0.94, 0.98, 1.0), clamp(foam, 0.0, 0.72) * 0.62);
        float a = smoothstep(0.01, 0.08, th);
        gl_FragColor = vec4(mix(base, col, a), 1.0);
      }`,
    depthTest: false, depthWrite: false
  });
  mats = { depthMat: depthMat, thickMat: thickMat, blurDepth: blurDepth, blurThick: blurThick, comp: comp };
  pts = new THREE.Points(pGeo, depthMat);
  pts.frustumCulled = false;
  ptScene = new THREE.Scene();
  ptScene.add(pts);
  quadCam = new THREE.Camera();
  quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), comp);
  quadMesh.frustumCulled = false;
  quadScene = new THREE.Scene();
  quadScene.add(quadMesh);
}

function runQuad(mat, target) {
  quadMesh.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(quadScene, quadCam);
}

let slowWin = 0, slowN = 0, ftAvg = 16, goodT = 0, qFrames = 0, capped = false, lastNotify = qi;
const clearFar = new Float32Array([1, 0, 0, 1]);

function autoQ(dtms) {
  if (!qAuto) return;
  qFrames++;
  if (qFrames < 12 || dtms > 2000) { slowWin = 0; slowN = 0; return; }
  slowWin += dtms; slowN++;
  if (slowWin < 700) return;
  const m = slowWin / slowN; slowWin = 0; slowN = 0;
  ftAvg += (m - ftAvg) * (m > 21 ? 0.6 : 0.35);
  if (ftAvg > 21 && qi > 0) {
    qi = 0; capped = true; ftAvg = 16; qFrames = 0; goodT = 0; layout();
    if (qi !== lastNotify) { lastNotify = qi; if (onQ) onQ('low'); }
  } else if (ftAvg < 14 && !capped && qi < 1) {
    goodT += 0.7;
    if (goodT > 3) {
      qi = 1; goodT = 0; ftAvg = 16; qFrames = 0; layout();
      if (qi !== lastNotify) { lastNotify = qi; if (onQ) onQ('high'); }
    }
  } else goodT = 0;
}

const api = {
  ok: false,
  canvas: canvas,
  get quality() { return LEVELS[qi].id; },
  get mode() { return qMode; },
  onQuality: function (fn) { onQ = fn; },
  setQuality: function (mode) {
    qMode = mode || 'auto';
    qAuto = qMode === 'auto';
    if (qMode === 'low') qi = 0;
    else if (qMode === 'high') qi = 1;
    else qi = deviceQi();
    if (!qAuto) capped = false;
    lastNotify = qi;
    layout();
  },
  setBackground: function (c) {
    if (bgCanvas === c && bgTex) return;
    bgCanvas = c;
    if (renderer && mats) layout();
  },
  setView: function (v, ww, wh) {
    var sig = [v.W, v.H, v.x | 0, v.y | 0, v.bw | 0, v.bh | 0, ww, wh, qi].join(',');
    view = v; worldW = ww; worldH = wh; W = v.W; H = v.H;
    if (sig !== viewSig && renderer && mats) { viewSig = sig; layout(); }
  },
  setRadius: function (r) { radius = r; },
  sync: function (P) {
    if (!pGeo) return;
    const pos = pGeo.attributes.position.array;
    const cid = pGeo.attributes.colorId.array;
    const sz = pGeo.attributes.sz.array;
    let m = 0;
    const n = P ? P.n : 0;
    const fills = LEVELS[qi].fill;
    for (let i = 0; i < n && m < MAXP; i++) {
      if (P.steam[i]) continue;
      pos[m * 3] = P.x[i]; pos[m * 3 + 1] = P.y[i]; pos[m * 3 + 2] = P.z[i] || 0.02;
      cid[m] = P.cid[i]; sz[m] = 1; m++;
      const sp = Math.hypot(P.vx[i], P.vy[i]);
      if (sp > 0.25) {
        const span = Math.min(0.06, sp * 0.02);
        for (let k = 1; k <= fills && m < MAXP; k++) {
          const f = k / (fills + 1) * span;
          pos[m * 3] = P.x[i] - P.vx[i] * f;
          pos[m * 3 + 1] = P.y[i] - P.vy[i] * f;
          pos[m * 3 + 2] = P.z[i] || 0.02;
          cid[m] = P.cid[i]; sz[m] = 0.9; m++;
        }
      }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.colorId.needsUpdate = true;
    pGeo.attributes.sz.needsUpdate = true;
    pGeo.setDrawRange(0, m);
  },
  render: function (dtms) {
    if (!renderer || !mats || !RT.size) return;
    const L = LEVELS[qi];
    const rw = RT.size[0], rh = RT.size[1];
    const uPx = rh / (cam.userData.frustumH || 1);
    mats.depthMat.uniforms.uPx.value = uPx;
    mats.thickMat.uniforms.uPx.value = uPx;
    mats.depthMat.uniforms.uRad.value = radius;
    mats.thickMat.uniforms.uRad.value = radius;
    if (bgTex) bgTex.needsUpdate = true;
    pts.material = mats.depthMat;
    renderer.setRenderTarget(RT.depth);
    const gl = renderer.getContext();
    /* 1 = empty. clearBufferfv is unclamped on float targets; clearColor(1)
       is the safe fallback when the implementation clamps. */
    if (gl.clearBufferfv) gl.clearBufferfv(gl.COLOR, 0, clearFar);
    else { gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.clear(gl.DEPTH_BUFFER_BIT);
    renderer.render(ptScene, cam);
    pts.material = mats.thickMat;
    renderer.setRenderTarget(RT.thick);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    renderer.render(ptScene, cam);
    const bd = mats.blurDepth.uniforms, bt = mats.blurThick.uniforms;
    bd.rad.value = L.blur; bd.fall.value = 0.004; bt.rad.value = Math.max(2, L.blur * 0.65);
    bd.tex.value = RT.depth.texture; bd.dir.value.set(1 / rw, 0); runQuad(mats.blurDepth, RT.a);
    bd.tex.value = RT.a.texture; bd.dir.value.set(0, 1 / rh); runQuad(mats.blurDepth, RT.b);
    bt.tex.value = RT.thick.texture; bt.dir.value.set(1 / rw, 0); runQuad(mats.blurThick, RT.ta);
    bt.tex.value = RT.ta.texture; bt.dir.value.set(0, 1 / rh); runQuad(mats.blurThick, RT.tb);
    const cu = mats.comp.uniforms;
    cu.bg.value = bgTex; cu.dep.value = RT.b.texture; cu.thk.value = RT.tb.texture;
    cu.invP.value.copy(cam.projectionMatrixInverse);
    cu.texel.value.set(1 / rw, 1 / rh);
    cu.uLite.value = qi === 0 ? 1 : 0;
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    runQuad(mats.comp, null);
    autoQ(dtms || 16);
  },
  stats: function () { return { q: LEVELS[qi].id, mode: qMode, ft: ftAvg, px: cam.userData.frustumH, rad: radius }; }
};

try {
  if (!renderer) throw new Error('no webgl');
  const gl = renderer.getContext();
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_float_blend');
  gl.getExtension('EXT_blend_minmax');
  gl.getExtension('OES_texture_float_linear');
  initGL();
  api.ok = true;
} catch (e) {
  console.warn('Rivulet water renderer unavailable', e);
  api.ok = false;
}
window.FLUID = api;
if (api.ok) document.body.appendChild(canvas);
window.dispatchEvent(new Event('fluidready'));
