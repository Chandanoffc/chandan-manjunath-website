// Scene 1 — the opening.
//
// One WebGL2 canvas composites, back to front:
//   fog + red haze  ->  glowing distressed wordmark  ->  the person (a cutout still)  ->  embers
// The person is lit from behind: a red rim light is derived from the cutout's own alpha edge,
// the wordmark receives a soft contact shadow from his silhouette, and the whole thing
// emerges from black on a timeline (see `at()` below).

import { createProgram, createQuad, createTexture, bindTexture, GLSL_NOISE } from './gl.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
};

/* ------------------------------------------------------------------ */
/* Shaders                                                            */
/* ------------------------------------------------------------------ */

const VS_QUAD = /* glsl */ `#version 300 es
layout(location=0) in vec2 aPos;
uniform vec2 uRes;
uniform vec4 uRect;
out vec2 vUv;
out vec2 vPx;
void main(){
  vec2 px = uRect.xy + aPos * uRect.zw;
  vUv = aPos;
  vPx = px;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const FS_BG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vPx;
uniform vec2 uRes;
uniform float uTime, uGlow, uLight;
uniform vec4 uBand;
out vec4 o;
${GLSL_NOISE}
void main(){
  vec2 uv = vPx / uRes;
  float asp = uRes.x / uRes.y;
  vec3 col = vec3(0.014, 0.005, 0.007);

  vec2 q = vec2(uv.x * asp, uv.y);
  float f1 = fbm(q * 1.5 + vec2(uTime * 0.010, -uTime * 0.018));
  float f2 = fbm(q * 3.1 + vec2(-uTime * 0.020, uTime * 0.012) + 7.3);

  vec2 c = vec2((uBand.x + uBand.z * 0.5) / uRes.x, (uBand.y + uBand.w * 0.5) / uRes.y);
  vec2 d = (uv - c) * vec2(asp, 1.0);
  vec2 e = d * vec2(0.50, 1.25);
  float haze = exp(-dot(e, e) * 2.6);
  col += vec3(0.085, 0.008, 0.012) * haze * (0.35 + 1.0 * f1) * uGlow;
  col += vec3(0.060, 0.006, 0.010) * f2 * smoothstep(0.30, 1.0, uv.y) * uGlow * 0.7;
  col *= mix(1.0, 0.30, smoothstep(0.34, 0.0, uv.y));
  col *= uLight;
  o = vec4(col, 1.0);
}`;

const FS_WORD = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vPx;
uniform sampler2D uMask;
uniform sampler2D uFig;
uniform vec4 uInk;       // ink rect in px
uniform vec4 uFigRect;   // figure rect in px
uniform float uTime, uReveal, uLod, uOpacity, uGlowAmt, uWear;
out vec4 o;
${GLSL_NOISE}
void main(){
  float m = textureLod(uMask, vUv, uLod).a;
  float g = 0.55 * textureLod(uMask, vUv, 3.2).a + 0.45 * textureLod(uMask, vUv, 5.4).a;

  vec2 ip = (vPx - uInk.xy) / uInk.zw;
  float asp = uInk.z / uInk.w;
  vec2 p = vec2(ip.x * asp, ip.y);

  // paint: red, darker toward the bottom, blotchy
  vec3 hi = vec3(0.96, 0.10, 0.11);
  vec3 lo = vec3(0.50, 0.050, 0.070);
  vec3 paint = mix(hi, lo, smoothstep(0.05, 1.10, ip.y));
  float blot = fbm(p * 5.5 + 3.1);
  paint *= 0.88 + 0.26 * blot;
  paint *= 0.90 + 0.20 * vnoise(p * 70.0);

  // worn-through speckle + scratches
  float sp = fbm(p * 30.0 + 11.0);
  float cluster = smoothstep(0.38, 0.70, fbm(p * 8.0 + 2.0));
  float hole = smoothstep(0.60, 0.72, sp) * cluster;
  m *= 1.0 - hole * 0.85 * uWear;
  float sc = smoothstep(0.84, 0.93, vnoise(vec2(p.x * 190.0, p.y * 2.5) + 4.0)) * smoothstep(0.45, 0.80, vnoise(p * 5.0));
  paint = mix(paint, paint * 0.30, sc * 0.85 * uWear);

  // dissolve in
  float nz = fbm(p * 4.5 + vec2(0.0, uTime * 0.04));
  float rv = smoothstep(nz - 0.18, nz + 0.02, uReveal * 1.35 - 0.18);
  m *= rv;

  // contact shadow cast by the figure
  vec2 fuv = (vPx - uFigRect.xy) / uFigRect.zw + vec2(0.020, 0.012);
  float fs = 0.0;
  if (fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) fs = textureLod(uFig, fuv, 3.0).a;
  paint *= 1.0 - 0.72 * fs;

  // ember bloom behind the letters
  float pulse = 0.72 + 0.28 * sin(uTime * 1.2 + ip.x * 5.0);
  vec3 glow = vec3(1.0, 0.20, 0.09) * g * uGlowAmt * pulse;

  vec3 rgb = paint * m + glow * (1.0 - m);
  o = vec4(rgb * uOpacity, m * uOpacity);
}`;

const FS_FIG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vPx;
uniform sampler2D uTex;
uniform vec2 uFigPx;     // figure size in css px
uniform float uExpose, uSweep, uRim, uTime;
uniform vec2 uBandY;
out vec4 o;
void main(){
  vec4 c = texture(uTex, vUv);
  float a = c.a;
  vec3 rgb = c.rgb / max(a, 1e-3);

  // grade: slightly desaturated, warm shadows
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(vec3(lum), rgb, 0.90);
  rgb *= vec3(1.06, 0.96, 0.94);
  rgb = pow(rgb, vec3(1.07));

  // rim light from the alpha edge
  vec2 e = vec2(3.4) / uFigPx;   // ~3.4 css px, independent of figure scale
  float aL = textureLod(uTex, vUv - vec2(e.x, 0.0), 1.0).a;
  float aR = textureLod(uTex, vUv + vec2(e.x, 0.0), 1.0).a;
  float aU = textureLod(uTex, vUv - vec2(0.0, e.y), 1.0).a;
  float aD = textureLod(uTex, vUv + vec2(0.0, e.y), 1.0).a;
  vec2 g = vec2(aR - aL, aD - aU);
  float edge = clamp(length(g) * 1.5, 0.0, 1.0);
  vec2 nOut = -g / (length(g) + 1e-4);
  float rimR = max(dot(nOut, normalize(vec2( 1.0, -0.25))), 0.0);
  float rimL = max(dot(nOut, normalize(vec2(-1.0, -0.25))), 0.0);
  float band = smoothstep(uBandY.x - 70.0, uBandY.x + 70.0, vPx.y) * (1.0 - smoothstep(uBandY.y - 20.0, uBandY.y + 180.0, vPx.y));
  float gate = mix(0.38, 1.0, band);
  vec3 rim = vec3(1.0, 0.17, 0.10) * (rimR + 0.8 * rimL) * edge * uRim * gate * 1.35;

  // red bounce light creeping up from the floor
  rgb += vec3(0.20, 0.025, 0.03) * smoothstep(0.40, 1.0, vUv.y) * 0.45;

  // emerge from black: sweep up from the bottom, then expose
  float h = 1.0 - vUv.y;
  float vis = 1.0 - smoothstep(uSweep - 0.35, uSweep, h);
  float fade = smoothstep(1.0, 0.84, vUv.y);
  float A = a * vis * fade;

  vec3 col = (rgb * uExpose + rim) * A;
  o = vec4(col, A);
}`;

const VS_EMBER = /* glsl */ `#version 300 es
layout(location=0) in vec4 aP;   // x, y (px), size (px), alpha
uniform vec2 uRes;
uniform float uDpr;
out float vA;
void main(){
  gl_Position = vec4(aP.x / uRes.x * 2.0 - 1.0, 1.0 - aP.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = aP.z * uDpr;
  vA = aP.w;
}`;

const FS_EMBER = /* glsl */ `#version 300 es
precision highp float;
in float vA;
out vec4 o;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  float k = exp(-r * 4.0);
  o = vec4(vec3(1.0, 0.34, 0.13) * k * vA, 0.0);
}`;

/* ------------------------------------------------------------------ */
/* Wordmark mask (Anton, drawn on a 2D canvas, mip-mapped on the GPU)   */
/* ------------------------------------------------------------------ */

const FONT = (px) => `400 ${px}px Anton, Impact, "Arial Narrow", sans-serif`;

function measureWord(text) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = FONT(400);
  const m = ctx.measureText(text);
  const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  return { aspect: w / h };
}

function buildMask(text, wantInkW, dpr) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = FONT(400);
  const m = probe.measureText(text);
  const inkL = m.actualBoundingBoxLeft;
  const inkW = inkL + m.actualBoundingBoxRight;
  const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;

  const texInkW = Math.round(clamp(wantInkW * dpr, 700, 1900));
  const k = texInkW / inkW;
  const pad = Math.round(inkH * k * 0.30);

  const c = document.createElement('canvas');
  c.width = Math.ceil(texInkW + pad * 2);
  c.height = Math.ceil(inkH * k + pad * 2);
  const ctx = c.getContext('2d');
  ctx.font = FONT(400 * k);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, pad + inkL * k, pad + m.actualBoundingBoxAscent * k);

  return { canvas: c, pad, texInkW, texInkH: inkH * k };
}

/* ------------------------------------------------------------------ */
/* Layout — landscape: one line. portrait: two stacked lines.         */
/* ------------------------------------------------------------------ */

function computeLayout(W, H, figAspect) {
  const portrait = W / H < 0.95;
  let lines, fig;

  if (!portrait) {
    const asp = measureWord('CHANDAN').aspect;
    let w = 0.935 * W;
    let h = (w / asp) * 1.26;
    const maxH = 0.50 * H;
    if (h > maxH) { const k = maxH / h; w *= k; h *= k; }
    const cy = 0.585 * H;
    lines = [{ text: 'CHANDAN', ink: [(W - w) / 2, cy - h / 2, w, h] }];
    const fh = 1.02 * H;
    const fw = fh * figAspect;
    fig = [0.545 * W - fw / 2, 0.105 * H, fw, fh];
  } else {
    const a1 = measureWord('CHAN').aspect;
    const a2 = measureWord('DAN').aspect;
    const stretch = 1.0;
    let w1 = 0.90 * W;
    let h = (w1 / a1) * stretch;
    let w2 = (h / stretch) * a2;
    const gap = h * 0.07;
    const total = h * 2 + gap;
    const cy = 0.40 * H;
    const y1 = cy - total / 2;
    lines = [
      { text: 'CHAN', ink: [(W - w1) / 2, y1, w1, h] },
      { text: 'DAN', ink: [(W - w2) / 2, y1 + h + gap, w2, h] },
    ];
    const fh = 0.60 * H;
    const fw = fh * figAspect;
    fig = [0.5 * W - fw / 2, 0.44 * H, fw, fh];
  }

  const top = Math.min(...lines.map((l) => l.ink[1]));
  const bot = Math.max(...lines.map((l) => l.ink[1] + l.ink[3]));
  const left = Math.min(...lines.map((l) => l.ink[0]));
  const right = Math.max(...lines.map((l) => l.ink[0] + l.ink[2]));
  return { portrait, lines, fig, band: [left, top, right - left, bot - top] };
}

/* ------------------------------------------------------------------ */
/* Public factory                                                     */
/* ------------------------------------------------------------------ */

export async function createHero({ canvas, stage, figureImage, reducedMotion = false }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 unavailable');

  const quad = createQuad(gl);
  const pBg = createProgram(gl, VS_QUAD, FS_BG, 'bg');
  const pWord = createProgram(gl, VS_QUAD, FS_WORD, 'word');
  const pFig = createProgram(gl, VS_QUAD, FS_FIG, 'fig');
  const pEmber = createProgram(gl, VS_EMBER, FS_EMBER, 'ember');

  const figAspect = figureImage.naturalWidth / figureImage.naturalHeight;
  const figTex = createTexture(gl, figureImage, { mips: true, premultiply: true });

  // embers
  const N_BACK = 110;
  const N_FRONT = 70;
  const N = N_BACK + N_FRONT;
  const eb = new Float32Array(N * 4);
  const es = Array.from({ length: N }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, ph: Math.random() * 6.28 }));
  const emberVao = gl.createVertexArray();
  const emberBuf = gl.createBuffer();
  gl.bindVertexArray(emberVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, emberBuf);
  gl.bufferData(gl.ARRAY_BUFFER, eb.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  let W = 0, H = 0, dpr = 1;
  let layout = null;
  let words = []; // { tex, ink, rect }
  let vis = true;
  let running = false;
  let tOffset = reducedMotion ? 99 : 0;
  let t0 = 0;
  let tNow = 0;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  let scroll = 0;

  function respawn(e, init) {
    const [bx, by, bw, bh] = layout.band;
    e.x = bx + Math.random() * bw;
    e.y = by + bh * (0.35 + Math.random() * 0.75);
    if (init) e.y = by + Math.random() * (H - by);
    e.vx = (Math.random() - 0.5) * 8;
    e.vy = -(8 + Math.random() * 26);
    e.max = 3.5 + Math.random() * 5;
    e.life = init ? Math.random() * e.max : 0;
    e.size = 1.6 + Math.random() * 3.2;
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    W = Math.max(320, rect.width);
    H = Math.max(320, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    layout = computeLayout(W, H, figAspect);

    for (const w of words) gl.deleteTexture(w.tex);
    words = layout.lines.map((l) => {
      const mk = buildMask(l.text, l.ink[2], dpr);
      const tex = createTexture(gl, mk.canvas, { mips: true, premultiply: true });
      const sx = l.ink[2] / mk.texInkW;
      const sy = l.ink[3] / mk.texInkH;
      const rect = [l.ink[0] - mk.pad * sx, l.ink[1] - mk.pad * sy, mk.canvas.width * sx, mk.canvas.height * sy];
      return { tex, ink: l.ink, rect };
    });

    // let the DOM furniture hug the wordmark
    const [bx, by, bw, bh] = layout.band;
    stage.style.setProperty('--band-top', `${by}px`);
    stage.style.setProperty('--band-bot', `${by + bh}px`);
    stage.style.setProperty('--band-left', `${bx}px`);
    stage.style.setProperty('--band-right', `${W - bx - bw}px`);
    stage.dataset.layout = layout.portrait ? 'portrait' : 'landscape';

    es.forEach((e, i) => respawn(e, true));
    if (!running) draw(tNow);
  }

  /* ---- the opening, in seconds ---- */
  function at(t) {
    return {
      light: E.inOutCubic(seg(t, 0.2, 1.7)),
      glow: E.inOutCubic(seg(t, 1.3, 4.8)),
      figExpose: E.inOutCubic(seg(t, 0.8, 3.5)),
      figSweep: lerp(0, 1.4, E.inOutCubic(seg(t, 0.8, 3.7))),
      figRim: E.inOutCubic(seg(t, 2.6, 4.6)),
      figScale: lerp(1.06, 1.0, E.outCubic(seg(t, 0.8, 5.5))),
      wReveal: E.inOutCubic(seg(t, 2.0, 4.4)),
      wLod: lerp(5.2, 0.0, E.outCubic(seg(t, 2.1, 4.6))),
      wRise: (1 - E.outCubic(seg(t, 2.0, 4.3))) * 0.085,
      wOpacity: seg(t, 2.0, 2.8),
      wGlow: E.inOutCubic(seg(t, 2.8, 5.2)) * 0.30,
      embers: seg(t, 2.4, 5.2),
    };
  }

  function stepEmbers(dt, s) {
    for (let i = 0; i < N; i++) {
      const e = es[i];
      e.life += dt;
      if (e.life > e.max) respawn(e, false);
      e.x += (e.vx + Math.sin(tNow * 0.7 + e.ph) * 6) * dt;
      e.y += e.vy * dt;
      const k = e.life / e.max;
      const fade = Math.sin(Math.PI * clamp(k)) * (0.65 + 0.35 * Math.sin(tNow * 3.1 + e.ph * 3.0));
      eb[i * 4 + 0] = e.x;
      eb[i * 4 + 1] = e.y;
      eb[i * 4 + 2] = e.size * (1 + 0.5 * Math.sin(tNow * 2.0 + e.ph));
      eb[i * 4 + 3] = fade * 0.9 * s.embers;
    }
  }

  function drawEmbers(from, count, s) {
    pEmber.use();
    pEmber.f2('uRes', W, H);
    pEmber.f1('uDpr', dpr);
    gl.bindVertexArray(emberVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, emberBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, from * 16, eb.subarray(from * 4, (from + count) * 4));
    gl.drawArrays(gl.POINTS, from, count);
    gl.bindVertexArray(null);
  }

  let lastDt = 0.016;
  function draw(t) {
    if (!layout) return;
    const s = at(t);
    const sp = clamp(scroll);

    // pointer parallax (smoothed), plus a touch of scroll travel
    ptr.x += (ptr.tx - ptr.x) * 0.06;
    ptr.y += (ptr.ty - ptr.y) * 0.06;
    const breathe = reducedMotion ? 0 : Math.sin(t * 0.55);

    const [fx, fy, fw, fh] = layout.fig;
    const fs = s.figScale * (1 + 0.003 * breathe);
    const figRect = [
      fx + (fw - fw * fs) / 2 + ptr.x * 16,
      fy + (fh - fh * fs) * 0.35 + ptr.y * 8 - sp * H * 0.10 + 3 * breathe,
      fw * fs,
      fh * fs,
    ];

    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const dim = 1 - sp * 0.85;
    const [bx, by, bw, bh] = layout.band;
    const wOff = [-ptr.x * 7, -ptr.y * 4 - sp * H * 0.05];

    // 1 · background
    gl.disable(gl.BLEND);
    pBg.use();
    pBg.f2('uRes', W, H);
    pBg.f4('uRect', 0, 0, W, H);
    pBg.f1('uTime', t);
    pBg.f1('uGlow', s.glow);
    pBg.f1('uLight', s.light * dim);
    pBg.f4('uBand', bx + wOff[0], by + wOff[1], bw, bh);
    quad.draw();

    stepEmbers(Math.min(lastDt, 0.05), s);

    // 2 · embers behind
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    drawEmbers(0, N_BACK, s);

    // 3 · wordmark
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    pWord.use();
    pWord.f2('uRes', W, H);
    const riseY = s.wRise * H;
    const wScale = 1 + 0.004 * breathe;
    for (const w of words) {
      const cx = w.rect[0] + w.rect[2] / 2, cy = w.rect[1] + w.rect[3] / 2;
      const rw = w.rect[2] * wScale, rh = w.rect[3] * wScale;
      const ox = wOff[0], oy = wOff[1] + riseY;
      const rect = [cx - rw / 2 + ox, cy - rh / 2 + oy, rw, rh];
      const ink = [
        w.ink[0] + (w.ink[2] - w.ink[2] * wScale) / 2 + ox,
        w.ink[1] + (w.ink[3] - w.ink[3] * wScale) / 2 + oy,
        w.ink[2] * wScale,
        w.ink[3] * wScale,
      ];
      pWord.f4('uRect', rect[0], rect[1], rect[2], rect[3]);
      pWord.f4('uInk', ink[0], ink[1], ink[2], ink[3]);
      pWord.f4('uFigRect', figRect[0], figRect[1], figRect[2], figRect[3]);
      pWord.f1('uTime', t);
      pWord.f1('uReveal', s.wReveal);
      pWord.f1('uLod', s.wLod);
      pWord.f1('uOpacity', s.wOpacity * dim);
      pWord.f1('uGlowAmt', s.wGlow * dim);
      pWord.f1('uWear', 0.70);
      pWord.i1('uMask', 0);
      pWord.i1('uFig', 1);
      bindTexture(gl, 0, w.tex);
      bindTexture(gl, 1, figTex);
      quad.draw();
    }

    // 4 · the person
    pFig.use();
    pFig.f2('uRes', W, H);
    pFig.f4('uRect', figRect[0], figRect[1], figRect[2], figRect[3]);
    pFig.f2('uFigPx', figRect[2], figRect[3]);
    pFig.f1('uExpose', s.figExpose * dim);
    pFig.f1('uSweep', s.figSweep);
    pFig.f1('uRim', s.figRim * dim);
    pFig.f1('uTime', t);
    pFig.f2('uBandY', by + wOff[1], by + bh + wOff[1]);
    pFig.i1('uTex', 0);
    bindTexture(gl, 0, figTex);
    quad.draw();

    // 5 · embers in front
    gl.blendFunc(gl.ONE, gl.ONE);
    drawEmbers(N_BACK, N_FRONT, s);

    return s;
  }

  /* ---- loop ---- */
  let raf = 0;
  let lastNow = 0;
  const onFrame = (now) => {
    raf = requestAnimationFrame(onFrame);
    lastDt = (now - lastNow) / 1000;
    lastNow = now;
    if (!vis || document.hidden) return;
    tNow = (now - t0) / 1000 + tOffset;
    const s = draw(tNow);
    if (api.onFrame) api.onFrame(tNow, s);
  };

  const api = {
    layout: () => layout,
    onFrame: null,
    start() {
      if (running) return;
      running = true;
      t0 = performance.now();
      lastNow = t0;
      raf = requestAnimationFrame(onFrame);
    },
    seek(t) { tOffset = t - (performance.now() - t0) / 1000; },
    time: () => tNow,
    resize,
    setPointer(nx, ny) { ptr.tx = reducedMotion ? 0 : nx; ptr.ty = reducedMotion ? 0 : ny; },
    setScroll(p) { scroll = p; },
    setVisible(v) { vis = v; },
    destroy() { cancelAnimationFrame(raf); running = false; },
  };

  resize();
  return api;
}
