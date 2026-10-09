/* ============================================================================
   2. RENDERER
   WebGL2 with half-float HDR render targets (EXT_color_buffer_float) when the
   GPU allows it.  Scene drawing is additive *light* on near-black: lines and
   points are emissive, so overlapping structure glows brighter — brightness
   becomes the compositional tool.  A depth buffer exists only so the eye's
   black-hole pupil can occlude what lies behind it.
   ========================================================================== */
const GLSL_HASH = `
float h11(float n){ return fract(sin(n * 127.1) * 43758.5453123); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 h33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), u.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), u.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), u.x), u.y), u.z);
}
`;

const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    this.maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [1, 64])[1];
    this.emptyVAO = gl.createVertexArray();
    this.lost = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
  }
  shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const numbered = src.split('\n').map((l, i) => String(i + 1).padStart(4) + '  ' + l).join('\n');
      throw new Error('Shader compile error:\n' + log + '\n' + numbered);
    }
    return s;
  }
  /** compile + link; returns { p, u } where u maps uniform name → location */
  program(vs, fs, tfVaryings) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this.shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.shader(gl.FRAGMENT_SHADER, fs));
    if (tfVaryings) gl.transformFeedbackVaryings(p, tfVaryings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  /** render target: colour texture (+ optional depth renderbuffer) */
  target(w, h, opt = {}) {
    const gl = this.gl;
    const rt = {
      w: 0, h: 0, tex: gl.createTexture(), fbo: gl.createFramebuffer(),
      depth: opt.depth ? gl.createRenderbuffer() : null,
      hdr: opt.hdr !== false && this.hdr, linear: opt.linear !== false,
    };
    this.resizeTarget(rt, w, h);
    return rt;
  }
  resizeTarget(rt, w, h) {
    const gl = this.gl;
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (rt.w === w && rt.h === h) return;
    rt.w = w; rt.h = h;
    gl.bindTexture(gl.TEXTURE_2D, rt.tex);
    if (rt.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = rt.linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt.tex, 0);
    if (rt.depth) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, rt.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rt.depth);
    }
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && rt.hdr) {
      rt.hdr = false; rt.w = 0; // fall back to 8-bit
      this.resizeTarget(rt, w, h);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  bind(rt) {
    const gl = this.gl;
    if (rt) { gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo); gl.viewport(0, 0, rt.w, rt.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); }
  }
  fullscreen() { const gl = this.gl; gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); }
}

/* ---- LineBatch ----------------------------------------------------------
   Every line in the film goes through here.  Each segment is one instance of
   a 4-vertex strip that the vertex shader expands in *screen space* around
   the projected segment, so widths are exact in pixels (optionally scaled by
   perspective), sub-pixel lines fade instead of aliasing, and segments that
   cross the near plane are clipped in view space.  The fragment shader uses
   linear AA ramps along the segment so chained polylines join seamlessly.

   CPU side: systems push segments in their own local coordinates; the batch
   applies a current affine transform (3 axes + origin) — this is how the same
   geometry code draws the mandala, the eye halo and the nested worlds.
   It also hosts the "random geometry corruption" glitch layer.          */
const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aP0;
layout(location=2) in vec3 aP1;
layout(location=3) in vec4 aCol;
layout(location=4) in vec2 aW;
uniform mat4 uView, uProj;
uniform vec2 uRes;
uniform float uPx, uPersp, uRefDist, uNear, uWidth;
out vec4 vCol;
out vec2 vLocal;
out float vLen, vHalf, vSoft;
void main(){
  vec4 v0 = uView * vec4(aP0, 1.0);
  vec4 v1 = uView * vec4(aP1, 1.0);
  float nz = -uNear;
  vCol = vec4(0.0); vLocal = vec2(0.0); vLen = 0.0; vHalf = 0.0; vSoft = 0.0;
  if (v0.z > nz && v1.z > nz) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  if (v0.z > nz) v0 = mix(v0, v1, (v0.z - nz) / (v0.z - v1.z));
  if (v1.z > nz) v1 = mix(v1, v0, (v1.z - nz) / (v1.z - v0.z));
  vec4 c0 = uProj * v0, c1 = uProj * v1;
  vec2 s0 = c0.xy / c0.w * 0.5 * uRes;
  vec2 s1 = c1.xy / c1.w * 0.5 * uRes;
  vec2 d = s1 - s0;
  float len = length(d);
  vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float k0 = 1.0, k1 = 1.0;
  if (uPersp > 0.5) { k0 = clamp(uRefDist / -v0.z, 0.3, 14.0); k1 = clamp(uRefDist / -v1.z, 0.3, 14.0); }
  float w = aW.x * uWidth * uPx * mix(k0, k1, aCorner.x);
  float bright = 1.0;
  if (w < 1.0) { bright = max(w, 0.0); w = 1.0; }
  float soft = aW.y;
  float hw = w * 0.5 * (1.0 + soft * 2.5);
  float ext = hw + 1.0;
  float along = mix(-1.0, len + 1.0, aCorner.x);
  vec2 sp = s0 + dir * along + nrm * aCorner.y * ext;
  float t = clamp(along / max(len, 1e-5), 0.0, 1.0);
  float z = mix(c0.z / c0.w, c1.z / c1.w, t);
  gl_Position = vec4(sp / (0.5 * uRes), clamp(z, -1.0, 1.0), 1.0);
  vCol = vec4(aCol.rgb * aCol.a * bright / (1.0 + soft * 1.5), 1.0);
  vLocal = vec2(along, aCorner.y * ext);
  vLen = len;
  vHalf = w * 0.5;
  vSoft = soft;
}`;
const LINE_FS = `#version 300 es
precision highp float;
in vec4 vCol; in vec2 vLocal; in float vLen, vHalf, vSoft;
out vec4 o;
void main(){
  float a = clamp(vLocal.x + 0.5, 0.0, 1.0) * clamp(vLen - vLocal.x + 0.5, 0.0, 1.0);
  float d = abs(vLocal.y);
  float crisp = clamp(vHalf + 0.5 - d, 0.0, 1.0);
  float hs = vHalf * (1.0 + vSoft * 2.5);
  float soft = exp(-d * d / max(hs * hs * 0.35, 0.2));
  o = vec4(vCol.rgb * a * mix(crisp, soft, vSoft), 1.0);
}`;

class LineBatch {
  constructor(r, capacity) {
    const gl = r.gl;
    this.r = r; this.cap = capacity; this.n = 0;
    this.data = new Float32Array(capacity * 12);
    this.prog = r.program(LINE_VS, LINE_FS);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const at = (loc, size, off) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 48, off);
      gl.vertexAttribDivisor(loc, 1);
    };
    at(1, 3, 0); at(2, 3, 12); at(3, 4, 24); at(4, 2, 40);
    gl.bindVertexArray(null);
    this.m = new Float64Array(12);
    this.resetXform();
    this.alpha = 1;          // global intensity multiplier for subsequent pushes
    this.corrupt = 0;        // 0..1 geometry corruption (GlitchEngine layer 6)
    this.corruptScale = 0.1; // world-space size of corruption offsets
    this.seed = 0;
    this.total = 0;          // stats
  }
  resetXform() { this.m.set([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]); }
  /** local→world: p = o + X*x + Y*y + Z*z */
  setXform(o, X, Y, Z) {
    const m = this.m;
    m[0] = X[0]; m[1] = X[1]; m[2] = X[2]; m[3] = Y[0]; m[4] = Y[1]; m[5] = Y[2];
    m[6] = Z[0]; m[7] = Z[1]; m[8] = Z[2]; m[9] = o[0]; m[10] = o[1]; m[11] = o[2];
  }
  /** 2D similarity in the z=0 plane: translate, uniform scale, rotate */
  setXform2D(tx, ty, s, ang, tz = 0) {
    const c = Math.cos(ang) * s, sn = Math.sin(ang) * s;
    this.m.set([c, sn, 0, -sn, c, 0, 0, 0, s, tx, ty, tz]);
  }
  seg(x0, y0, z0, x1, y1, z1, r, g, b, w = 1, soft = 0) {
    if (this.n >= this.cap) return;
    const m = this.m;
    let X0 = m[0] * x0 + m[3] * y0 + m[6] * z0 + m[9];
    let Y0 = m[1] * x0 + m[4] * y0 + m[7] * z0 + m[10];
    let Z0 = m[2] * x0 + m[5] * y0 + m[8] * z0 + m[11];
    let X1 = m[0] * x1 + m[3] * y1 + m[6] * z1 + m[9];
    let Y1 = m[1] * x1 + m[4] * y1 + m[7] * z1 + m[10];
    let Z1 = m[2] * x1 + m[5] * y1 + m[8] * z1 + m[11];
    if (this.corrupt > 0) {
      const h = hash32((this.n * 747796405 + this.seed) >>> 0) / 4294967296;
      if (h < this.corrupt * 0.2) {
        const h2 = hash32((this.n * 2891336453 + this.seed * 3) >>> 0) / 4294967296;
        const h3 = hash32((this.n * 1103515245 + this.seed * 7) >>> 0) / 4294967296;
        if (h2 < 0.25) return;                              // dropout
        if (h2 < 0.6) {                                     // spike: segment shoots outward
          const k = 1 + h3 * 9;
          X1 = X0 + (X1 - X0) * k; Y1 = Y0 + (Y1 - Y0) * k; Z1 = Z0 + (Z1 - Z0) * k;
        } else {                                            // displacement
          const s = this.corruptScale, ox = (h3 - 0.5) * s * 2, oy = (fract(h3 * 7.31) - 0.5) * s;
          X0 += ox; X1 += ox; Y0 += oy; Y1 += oy;
        }
        r *= 1.6; g *= 1.6; b *= 1.6;
      }
    }
    const d = this.data, o = this.n++ * 12;
    d[o] = X0; d[o + 1] = Y0; d[o + 2] = Z0; d[o + 3] = X1; d[o + 4] = Y1; d[o + 5] = Z1;
    d[o + 6] = r; d[o + 7] = g; d[o + 8] = b; d[o + 9] = this.alpha; d[o + 10] = w; d[o + 11] = soft;
  }
  /** polyline arc in local coordinates */
  arc(cx, cy, z, rad, a0, a1, segsFull, r, g, b, w = 1, soft = 0) {
    const n = Math.max(1, Math.ceil(segsFull * Math.abs(a1 - a0) / TAU));
    let px = cx + Math.cos(a0) * rad, py = cy + Math.sin(a0) * rad;
    for (let i = 1; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      this.seg(px, py, z, x, y, z, r, g, b, w, soft);
      px = x; py = y;
    }
  }
  flush(cam, res, opt) {
    if (!this.n) return;
    const gl = this.r.gl, P = this.prog, u = P.u;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(u.uView, false, cam.view);
    gl.uniformMatrix4fv(u.uProj, false, cam.proj);
    gl.uniform2f(u.uRes, res[0], res[1]);
    gl.uniform1f(u.uPx, opt.px);
    gl.uniform1f(u.uPersp, opt.persp ? 1 : 0);
    gl.uniform1f(u.uRefDist, opt.refDist || 1);
    gl.uniform1f(u.uNear, opt.near || 0.02);
    gl.uniform1f(u.uWidth, CONFIG.lineWidth);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * 12);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
    gl.bindVertexArray(null);
    this.total += this.n;
    this.n = 0;
  }
}

/* ---- PointBatch -------------------------------------------------------------
   CPU-built point sprites (constellation stars, tree neurons, text pixels…).
   Shapes: soft disc, square (dot-matrix text), ring, star-chart glint. */
const POINT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in vec2 aSz;
uniform mat4 uView, uProj;
uniform float uPx, uPersp, uRefDist, uNear, uMax;
out vec3 vCol;
out float vShape, vSize, vPad;
void main(){
  vec4 v = uView * vec4(aPos, 1.0);
  vCol = vec3(0.0); vShape = aSz.y; vSize = 0.0; vPad = 0.0;
  if (-v.z < uNear) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); gl_PointSize = 0.0; return; }
  gl_Position = uProj * v;
  float k = uPersp > 0.5 ? clamp(uRefDist / -v.z, 0.25, 14.0) : 1.0;
  float s = aSz.x * uPx * k;
  float b = 1.0;
  float minS = aSz.y > 0.5 && aSz.y < 1.5 ? 1.0 : 1.4;
  if (s < minS) { b = s / minS; s = minS; }
  float pad = (aSz.y > 0.5 && aSz.y < 1.5) ? 0.0 : 2.0;
  s = min(s, uMax - pad);
  vSize = s; vPad = pad;
  gl_PointSize = s + pad;
  vCol = aCol.rgb * aCol.a * b;
}`;
const POINT_FS = `#version 300 es
precision highp float;
in vec3 vCol; in float vShape, vSize, vPad;
out vec4 o;
void main(){
  vec2 p = (gl_PointCoord - 0.5) * (vSize + vPad);
  float r = vSize * 0.5, a;
  if (vShape < 0.5) {               // soft disc with a faint halo
    float d = length(p);
    a = clamp(r + 0.5 - d, 0.0, 1.0) * 0.8 + exp(-d * d / max(r * r * 1.4, 0.35)) * 0.32;
  } else if (vShape < 1.5) {        // square "pixel"
    vec2 q = abs(p);
    a = clamp(r + 0.5 - q.x, 0.0, 1.0) * clamp(r + 0.5 - q.y, 0.0, 1.0);
  } else if (vShape < 2.5) {        // thin ring
    float d = length(p);
    a = clamp(1.0 - abs(d - (r - 1.0)), 0.0, 1.0) * 0.9;
  } else {                          // glint: core + diffraction cross
    float d = length(p);
    float cross = (clamp(0.9 - abs(p.x), 0.0, 1.0) + clamp(0.9 - abs(p.y), 0.0, 1.0)) * clamp(1.0 - d / r, 0.0, 1.0);
    a = clamp(r * 0.28 + 0.5 - d, 0.0, 1.0) + cross * 0.7 + exp(-d * d / max(r * r * 0.08, 0.3)) * 0.4;
  }
  o = vec4(vCol * a, 1.0);
}`;

class PointBatch {
  constructor(r, capacity) {
    const gl = r.gl;
    this.r = r; this.cap = capacity; this.n = 0;
    this.data = new Float32Array(capacity * 9);
    this.prog = r.program(POINT_VS, POINT_FS);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 28);
    gl.bindVertexArray(null);
    this.m = new Float64Array(12);
    this.resetXform();
    this.alpha = 1; this.corrupt = 0; this.corruptScale = 0.1; this.seed = 0; this.total = 0;
    this.sizeScale = 1;      // multiplies sizes (used by the recursion LOD)
  }
  resetXform() { this.m.set([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]); }
  setXform(o, X, Y, Z) { LineBatch.prototype.setXform.call(this, o, X, Y, Z); }
  setXform2D(tx, ty, s, ang, tz = 0) { LineBatch.prototype.setXform2D.call(this, tx, ty, s, ang, tz); }
  pt(x, y, z, r, g, b, size, shape = SH_SOFT) {
    if (this.n >= this.cap) return;
    const m = this.m;
    let X = m[0] * x + m[3] * y + m[6] * z + m[9];
    let Y = m[1] * x + m[4] * y + m[7] * z + m[10];
    const Z = m[2] * x + m[5] * y + m[8] * z + m[11];
    if (this.corrupt > 0) {
      const h = hash32((this.n * 747796405 + this.seed) >>> 0) / 4294967296;
      if (h < this.corrupt * 0.25) {
        const h2 = hash32((this.n * 2891336453 + this.seed) >>> 0) / 4294967296;
        if (h2 < 0.3) return;
        X += (h2 - 0.5) * this.corruptScale * 3; Y += (fract(h2 * 9.17) - 0.5) * this.corruptScale;
        size *= 1 + h2 * 2;
      }
    }
    const d = this.data, o = this.n++ * 9;
    d[o] = X; d[o + 1] = Y; d[o + 2] = Z;
    d[o + 3] = r; d[o + 4] = g; d[o + 5] = b; d[o + 6] = this.alpha;
    d[o + 7] = size * this.sizeScale; d[o + 8] = shape;
  }
  flush(cam, res, opt) {
    if (!this.n) return;
    const gl = this.r.gl, P = this.prog, u = P.u;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(u.uView, false, cam.view);
    gl.uniformMatrix4fv(u.uProj, false, cam.proj);
    gl.uniform1f(u.uPx, opt.px);
    gl.uniform1f(u.uPersp, opt.persp ? 1 : 0);
    gl.uniform1f(u.uRefDist, opt.refDist || 1);
    gl.uniform1f(u.uNear, opt.near || 0.02);
    gl.uniform1f(u.uMax, Math.min(this.r.maxPoint, 256));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * 9);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.n);
    gl.bindVertexArray(null);
    this.total += this.n;
    this.n = 0;
  }
}

/* ---- Background: near-black void with an optional procedural sky ----------
   The nebula is evaluated on the *view direction* (a sky sphere), so it
   parallaxes correctly as the camera turns.  It is kept at a few percent of
   brightness: darkness is the canvas. */
const BG_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec3 uBg, uRight, uUp, uFwd, uTint;
uniform float uTan, uAspect, uNebula, uTime;
${GLSL_HASH}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.07 + 11.3; a *= 0.5; } return s; }
void main(){
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 c = uBg * (1.0 - 0.35 * dot(ndc, ndc));
  if (uNebula > 0.0005) {
    vec3 dir = normalize(uRight * ndc.x * uTan * uAspect + uUp * ndc.y * uTan + uFwd);
    float n = fbm(dir * 2.3 + vec3(0.0, uTime * 0.008, 0.0));
    float m = fbm(dir * 6.1 - 4.7);
    float cloud = pow(clamp(n * 1.25 - 0.28, 0.0, 1.0), 3.0) * (0.55 + 0.9 * m);
    float lanes = smoothstep(0.42, 0.62, m) * 0.6;   // dark dust lanes
    c += uTint * cloud * (1.0 - lanes) * uNebula;
  }
  o = vec4(c, 1.0);
}`;
