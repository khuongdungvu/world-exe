/* ============================================================================
   3. PARTICLE ENGINE  (GPU, WebGL2 transform feedback)
   State per particle: position.xyz + brightness, velocity.xyz + age, plus a
   static random vec4.  Each simulation step is one draw call with the
   rasterizer disabled: the vertex shader integrates forces and writes the new
   state into the other buffer (ping-pong).

   Forces:  attraction (spring toward a procedural target shape), repulsion
            (inverse-square), orbit (tangential around an axis), collapse
            (radial pull + swirl), explosion (impulse), noise (divergence-free
            ABC-style flow field) and damping.
   Targets (computed in GLSL from the particle's random vector — no buffers):
            0 STARS  cosmic dust shell        3 CORE   collapsed singularity
            1 TREE   spores around the tree   4 EYE    iris fibres, limbus,
            2 LIFE   seven micro-organisms             accretion inflow, lids
                                              5 WORLD  rings of a reborn world
   Two targets can be cross-faded with a per-particle stagger, which is how
   one shape morphs into the next.
   ========================================================================== */
const PARTICLE_UPDATE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aPos;
layout(location=1) in vec4 aVel;
layout(location=2) in vec4 aRnd;
out vec4 oPos;
out vec4 oVel;
uniform float uDt, uTime;
uniform int uModeA, uModeB;
uniform float uMix, uAttract, uDamp, uNoise, uNoiseFreq, uOrbit, uCollapse, uSwirl, uExplode, uFreeze, uJitter, uForce;
uniform float uRepulse;
uniform vec3 uCenter, uAxis, uRepPos;
uniform vec3 uFO, uFX, uFY, uFZ;
uniform vec4 uLife[7];
uniform float uBlink, uIrisR, uPupilR;
const float TAU = 6.28318530718;
const float RR[8] = float[8](0.0, 0.16, 0.25, 0.38, 0.5, 0.63, 0.79, 1.0);
${GLSL_HASH}

vec3 flow(vec3 p, float t){
  vec3 a = vec3(sin(p.y * 1.7 + t) + cos(p.z * 1.3 - t * 0.7),
                sin(p.z * 1.5 + t * 0.8) + cos(p.x * 1.1 + t * 0.5),
                sin(p.x * 1.4 - t * 0.6) + cos(p.y * 1.2 + t * 0.9));
  p *= 2.3;
  return a + 0.5 * vec3(sin(p.y + t * 1.3), sin(p.z - t * 1.1), sin(p.x + t * 0.9));
}
vec3 frameP(vec2 q, float z){ return uFO + uFX * q.x + uFY * q.y + uFZ * z; }

vec3 tStars(vec4 r, out float b){
  float u = r.x * 2.0 - 1.0, th = r.y * TAU, s = sqrt(1.0 - u * u);
  b = 0.3 + 0.7 * r.w;
  return uCenter + vec3(s * cos(th), u, s * sin(th)) * mix(1.2, 9.0, pow(r.z, 0.7));
}
vec3 tTree(vec4 r, out float b){
  float y = mix(-3.0, 12.0, pow(r.x, 0.85));
  float crown = smoothstep(2.0, 6.0, y) * (1.0 - smoothstep(10.0, 12.5, y));
  float rad = 0.4 + pow(r.y, 0.6) * (1.5 + 6.5 * crown);
  float a = r.z * TAU + uTime * (0.03 + 0.07 * r.w);
  b = 0.2 + 0.8 * r.w * r.w;
  return uCenter + vec3(cos(a) * rad, y, sin(a) * rad);
}
vec3 tLife(vec4 r, out float b){
  int k = int(min(floor(r.x * 7.0), 6.0));
  vec4 L = uLife[k];
  float u = fract(r.x * 7.0), v = r.y, w = r.z, t = uTime, fk = float(k);
  float sz = L.z * (1.0 + 0.07 * sin(t * 2.3 + fk * 1.7));
  int type = int(L.w + 0.5);
  vec2 q;
  b = 0.6;
  float rot = t * (0.18 + 0.07 * fk) * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0);
  if (type == 0) {            // radiolarian: shell, radial spines, inner lattice
    if (u < 0.45) { float a = u / 0.45 * TAU; q = vec2(cos(a), sin(a)) * (1.0 + 0.03 * sin(a * 12.0 + t * 3.0)); b = 0.9; }
    else if (u < 0.85) { float j = floor(v * 18.0); float a = j / 18.0 * TAU + 0.02 * (w - 0.5); float l = (u - 0.45) / 0.4;
      q = vec2(cos(a), sin(a)) * (1.0 + l * (0.45 + 0.55 * h11(j + 3.0))); b = 0.75 * (1.0 - l * 0.6); }
    else { float a = v * TAU; q = vec2(cos(a), sin(a)) * 0.55 * sqrt(w); b = 0.4; }
  } else if (type == 1) {     // phyllotaxis disc (sunflower lattice)
    float a = u * 600.0 * 2.39996323;
    q = vec2(cos(a), sin(a)) * sqrt(u) * 1.1; b = 0.45 + 0.55 * (1.0 - u);
  } else if (type == 2) {     // cell: breathing membrane, nucleus, cytoplasm
    if (u < 0.5) { float a = u * 2.0 * TAU; float rr = 1.0 + 0.10 * sin(3.0 * a + t * 1.7) + 0.05 * sin(5.0 * a - t * 2.3);
      q = vec2(cos(a), sin(a)) * rr; b = 0.9; }
    else if (u < 0.7) { float a = v * TAU; q = vec2(0.18, 0.08) + vec2(cos(a), sin(a)) * 0.28 * sqrt(w); b = 1.0; }
    else { float a = v * TAU; q = vec2(cos(a), sin(a)) * 0.85 * sqrt(w); b = 0.28; }
  } else if (type == 3) {     // two-armed logarithmic spiral
    float arm = step(0.5, v); float th = u * 9.0;
    float a = th + arm * 3.14159 + t * 0.5;
    q = vec2(cos(a), sin(a)) * min(0.08 * exp(0.28 * th), 1.25) + (vec2(w, fract(w * 7.3)) - 0.5) * 0.07;
    b = 0.85 * (1.0 - u * 0.5);
  } else if (type == 4) {     // flagellum: a travelling wave
    q = vec2((u - 0.5) * 3.2, sin(u * 10.0 - t * 5.0) * 0.25 * (0.3 + u) + (v - 0.5) * 0.05); b = 0.75;
  } else if (type == 5) {     // diatom: elliptic frustule with ribs
    if (u < 0.5) { float a = u * 2.0 * TAU; q = vec2(cos(a) * 1.4, sin(a) * 0.42); b = 0.85; }
    else { float j = floor(v * 13.0); float x = (j / 12.0 - 0.5) * 2.4;
      float hh = 0.42 * sqrt(max(0.0, 1.0 - (x / 1.4) * (x / 1.4))); q = vec2(x, mix(-hh, hh, w)); b = 0.42; }
  } else {                    // medusa: pulsing bell and trailing tentacles
    if (u < 0.4) { float a = u / 0.4 * 3.14159; q = vec2(cos(a) * 0.9, sin(a) * 0.65 * (1.0 + 0.12 * sin(t * 3.0))); b = 0.9; }
    else { float j = floor(v * 7.0); float l = (u - 0.4) / 0.6;
      q = vec2((j / 6.0 - 0.5) * 1.5 + sin(l * 7.0 - t * 3.0 + j) * 0.12 * l, -l * 1.6); b = 0.6 * (1.0 - l * 0.7); }
  }
  float c = cos(rot), s = sin(rot);
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c) * sz + L.xy;
  return frameP(q, (w - 0.5) * 0.04);
}
vec3 tCore(vec4 r, out float b){
  float u = r.x * 2.0 - 1.0, th = r.y * TAU, s = sqrt(1.0 - u * u);
  vec3 d = vec3(s * cos(th), u, s * sin(th)) * (0.012 + 0.05 * pow(r.z, 3.0));
  b = 1.0;
  return uFO + normalize(uFX) * d.x + normalize(uFY) * d.y + normalize(uFZ) * d.z;
}
vec3 tEye(vec4 r, out float b){
  float t = uTime, open = 1.0 - uBlink, z = (r.w - 0.5) * 0.05, sel = r.x;
  vec2 q;
  if (sel < 0.46) {           // iris fibres
    float j = floor(r.y * 120.0);
    float a = j / 120.0 * TAU + (fract(r.y * 120.0) - 0.5) * 0.035 + t * 0.015;
    float rr = mix(uPupilR * 1.12, uIrisR * 0.98, pow(r.z, 0.9));
    rr += 0.01 * sin(a * 7.0 + rr * 30.0);
    q = vec2(cos(a), sin(a)) * rr; b = 0.45 + 0.55 * (1.0 - r.z);
  } else if (sel < 0.58) {    // limbal ring
    float a = r.y * TAU; q = vec2(cos(a), sin(a)) * (uIrisR + (r.z - 0.5) * 0.02); b = 0.8;
  } else if (sel < 0.70) {    // accretion inflow into the black-hole pupil
    float ph = fract(t * 0.4 + r.y);
    float rr = mix(uIrisR * 0.85, uPupilR * 1.02, pow(ph, 0.6));
    float a = r.z * TAU + ph * 5.0;
    q = vec2(cos(a), sin(a)) * rr;
    b = 1.2 * smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.85, 1.0, ph));
  } else if (sel < 0.86) {    // eyelids: two circular arcs (vesica)
    float x = r.y * 2.0 - 1.0;
    float h = max(0.52 * open, 0.002);
    float R = (1.0 + h * h) / (2.0 * h), c = R - h;
    float y = sqrt(max(R * R - x * x, 0.0)) - c;
    q = vec2(x, r.z < 0.5 ? y : -y); b = 0.7;
  } else {                    // halo dust
    float a = r.y * TAU, rr = mix(1.08, 2.2, pow(r.z, 0.5));
    q = vec2(cos(a) * rr, sin(a) * rr * 0.8); z = (r.w - 0.5) * 0.9; b = 0.22;
  }
  if (sel < 0.70) { q.y *= open; b *= 0.2 + 0.8 * open; }
  return frameP(q, z);
}
vec3 tWorld(vec4 r, out float b){
  int j = int(min(floor(r.x * 8.0), 7.0));
  float sp = (mod(float(j), 2.0) < 0.5 ? 1.0 : -1.0) * (0.12 + 0.05 * float(j));
  float a = r.y * TAU + uTime * sp;
  vec2 q = vec2(cos(a), sin(a)) * (RR[j] + (r.z - 0.5) * 0.008);
  if (j == 0) q = (vec2(r.y, r.z) - 0.5) * 0.025;
  b = j == 0 ? 1.3 : 0.5 + 0.5 * r.w;
  return frameP(q, (r.w - 0.5) * 0.02);
}
vec3 target(int m, vec4 r, out float b){
  if (m == 0) return tStars(r, b);
  if (m == 1) return tTree(r, b);
  if (m == 2) return tLife(r, b);
  if (m == 3) return tCore(r, b);
  if (m == 4) return tEye(r, b);
  return tWorld(r, b);
}
void main(){
  vec4 r = aRnd;
  vec3 p = aPos.xyz, v = aVel.xyz;
  if (uFreeze > 0.5) { oPos = aPos; oVel = aVel; return; }
  float bA = 0.0;
  vec3 tA = target(uModeA, r, bA);
  float bB = bA;
  vec3 tB = tA;
  if (uModeB != uModeA) tB = target(uModeB, r, bB);
  float m = clamp(uMix * 1.6 - r.w * 0.6, 0.0, 1.0);
  vec3 tgt = mix(tA, tB, m);
  float bT = mix(bA, bB, m);
  vec3 acc = (tgt - p) * uAttract * (0.55 + 0.9 * r.y);
  acc += flow(p * uNoiseFreq, uTime * 0.6 + r.z * 6.0) * uNoise;
  vec3 rel = p - uCenter;
  float rl = length(rel) + 1e-3;
  vec3 tang = cross(uAxis, rel);
  acc += tang / (0.6 + rl) * uOrbit;
  acc += -rel / rl * uCollapse * (0.6 + r.x) + tang / rl * uSwirl;
  vec3 rp = p - uRepPos;
  float rd = length(rp) + 0.05;
  acc += rp / (rd * rd * rd) * uRepulse;
  acc *= uForce;
  if (uExplode > 0.0) {
    vec3 dir = normalize(rel + (r.xyz - 0.5) * 1.1 * rl + 1e-4);
    v += dir * uExplode * (0.25 + 1.5 * r.z * r.z);
  }
  if (uJitter > 0.0) v += (h33(p * 91.7 + uTime * 13.1) - 0.5) * uJitter;
  v += acc * uDt;
  v *= exp(-uDamp * uDt);
  p += v * uDt;
  oPos = vec4(p, mix(aPos.w, bT, 1.0 - exp(-uDt * 4.0)));
  oVel = vec4(v, aVel.w + uDt);
}`;
const PARTICLE_UPDATE_FS = `#version 300 es
precision highp float;
out vec4 o;
void main(){ o = vec4(0.0); }`;

const PARTICLE_RENDER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aPos;
layout(location=1) in vec4 aVel;
layout(location=2) in vec4 aRnd;
uniform mat4 uView, uProj;
uniform float uPx, uSize, uAlpha, uRefDist, uMax, uRed, uCyan, uXfOn, uStreak;
uniform vec4 uXf;
uniform vec3 uWhite, uGray, uCyanC, uRedC;
out vec3 vCol;
out float vSize;
void main(){
  vec3 p = aPos.xyz;
  if (uXfOn > 0.5) p = vec3(uXf.x * p.x - uXf.y * p.y + uXf.z, uXf.y * p.x + uXf.x * p.y + uXf.w, p.z * length(uXf.xy));
  vec4 v = uView * vec4(p, 1.0);
  vCol = vec3(0.0); vSize = 0.0;
  if (-v.z < 0.03) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); gl_PointSize = 0.0; return; }
  gl_Position = uProj * v;
  float k = clamp(uRefDist / -v.z, 0.12, 9.0);
  float s = uSize * (0.45 + 1.1 * aRnd.x * aRnd.x) * uPx * k;
  float b = max(aPos.w, 0.0) * uAlpha * (0.3 + 0.7 * aRnd.y);
  float sp = length(aVel.xyz);
  b *= 1.0 + min(sp * uStreak, 2.5);
  if (aRnd.z > 0.986) { b *= 2.6; s *= 1.35; }
  if (s < 1.2) { b *= s / 1.2; s = 1.2; }
  s = min(s, uMax - 2.0);
  vec3 col = mix(uWhite, uGray, aRnd.w);
  col = mix(col, uCyanC, step(1.0 - uCyan, fract(aRnd.w * 7.13)));
  col = mix(col, uRedC, step(1.0 - uRed, fract(aRnd.x * 5.71 + aRnd.y)));
  vCol = col * b;
  vSize = s;
  gl_PointSize = s + 2.0;
}`;
const PARTICLE_RENDER_FS = `#version 300 es
precision highp float;
in vec3 vCol; in float vSize;
out vec4 o;
void main(){
  vec2 p = (gl_PointCoord - 0.5) * (vSize + 2.0);
  float d = length(p), r = vSize * 0.5;
  float a = clamp(r + 0.5 - d, 0.0, 1.0) * 0.8 + exp(-d * d / max(r * r, 0.3)) * 0.28;
  o = vec4(vCol * a, 1.0);
}`;

class ParticleEngine {
  constructor(r, count) {
    this.r = r;
    this.upd = r.program(PARTICLE_UPDATE_VS, PARTICLE_UPDATE_FS, ['oPos', 'oVel']);
    this.ren = r.program(PARTICLE_RENDER_VS, PARTICLE_RENDER_FS);
    this.n = 0;
    this.U = ParticleEngine.defaults();
    this.allocate(count);
  }
  static defaults() {
    return {
      modeA: 0, modeB: 0, mix: 0, attract: 1, damp: 2, noise: 0.1, noiseFreq: 0.6, orbit: 0, collapse: 0,
      swirl: 0, explode: 0, freeze: 0, jitter: 0, force: 1, repulse: 0,
      center: [0, 0, 0], axis: [0, 1, 0], repPos: [0, 0, 100],
      fo: [0, 0, 0], fx: [1, 0, 0], fy: [0, 1, 0], fz: [0, 0, 1], life: new Float32Array(28),
      blink: 0, irisR: 0.42, pupilR: 0.16,
      alpha: 0, size: 1.6, refDist: 3, red: 0, cyan: 0.16, streak: 0, xf: [1, 0, 0, 0], xfOn: 0,
    };
  }
  allocate(n) {
    const gl = this.r.gl;
    if (this.bufs) {
      this.bufs.forEach(b => gl.deleteBuffer(b));
      this.vaos.forEach(v => gl.deleteVertexArray(v));
      gl.deleteBuffer(this.rndBuf);
    }
    this.n = n;
    const rng = makeRNG('particles');
    this.rnd = new Float32Array(n * 4);
    for (let i = 0; i < this.rnd.length; i++) this.rnd[i] = rng.next();
    this.rndBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rndBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.rnd, gl.STATIC_DRAW);
    this.state = new Float32Array(n * 8);
    this.bufs = [0, 1].map(() => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, this.state.byteLength, gl.DYNAMIC_COPY);
      return b;
    });
    this.vaos = this.bufs.map(b => {
      const v = gl.createVertexArray();
      gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rndBuf);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      return v;
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.read = 0;
    this.reset('stars');
  }
  /** CPU re-seed of the state buffer (used at scene boundaries and seeks) */
  reset(kind, opt = {}) {
    const n = this.n, s = this.state, R = this.rnd;
    for (let i = 0; i < n; i++) {
      const o = i * 8, r0 = R[i * 4], r1 = R[i * 4 + 1], r2 = R[i * 4 + 2], r3 = R[i * 4 + 3];
      let x = 0, y = 0, z = 0, b = 0;
      if (kind === 'stars') {
        const u = r0 * 2 - 1, th = r1 * TAU, sq = Math.sqrt(1 - u * u), rad = lerp(1.2, 9, Math.pow(r2, 0.7));
        x = sq * Math.cos(th) * rad; y = u * rad; z = sq * Math.sin(th) * rad - 1.6;
      } else if (kind === 'tree') {
        y = lerp(-3, 12, Math.pow(r0, 0.85));
        const crown = smoothstep(2, 6, y) * (1 - smoothstep(10, 12.5, y));
        const rad = 0.4 + Math.pow(r1, 0.6) * (1.5 + 6.5 * crown), a = r2 * TAU;
        x = Math.cos(a) * rad; z = Math.sin(a) * rad;
      } else if (kind === 'points') {          // e.g. pixels of a line of text
        const pts = opt.points, cnt = pts.length / 3;
        const k = Math.min(cnt - 1, Math.floor(fract(r0 * 13.7 + r1 * 3.1) * cnt)) * 3;
        x = pts[k] + (r2 - 0.5) * opt.jitter; y = pts[k + 1] + (r3 - 0.5) * opt.jitter; z = pts[k + 2];
        b = 1;
      }
      s[o] = x; s[o + 1] = y; s[o + 2] = z; s[o + 3] = b;
      s[o + 4] = 0; s[o + 5] = 0; s[o + 6] = 0; s[o + 7] = 0;
    }
    const gl = this.r.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[this.read]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, s);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  step(dt, U, time) {
    const gl = this.r.gl, u = this.upd.u;
    gl.useProgram(this.upd.p);
    gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uTime, time);
    gl.uniform1i(u.uModeA, U.modeA); gl.uniform1i(u.uModeB, U.modeB);
    gl.uniform1f(u.uMix, U.mix); gl.uniform1f(u.uAttract, U.attract); gl.uniform1f(u.uDamp, U.damp);
    gl.uniform1f(u.uNoise, U.noise); gl.uniform1f(u.uNoiseFreq, U.noiseFreq); gl.uniform1f(u.uOrbit, U.orbit);
    gl.uniform1f(u.uCollapse, U.collapse); gl.uniform1f(u.uSwirl, U.swirl); gl.uniform1f(u.uExplode, U.explode);
    gl.uniform1f(u.uFreeze, U.freeze); gl.uniform1f(u.uJitter, U.jitter); gl.uniform1f(u.uForce, U.force);
    gl.uniform1f(u.uRepulse, U.repulse);
    gl.uniform3fv(u.uCenter, U.center); gl.uniform3fv(u.uAxis, U.axis); gl.uniform3fv(u.uRepPos, U.repPos);
    gl.uniform3fv(u.uFO, U.fo); gl.uniform3fv(u.uFX, U.fx); gl.uniform3fv(u.uFY, U.fy); gl.uniform3fv(u.uFZ, U.fz);
    gl.uniform4fv(u.uLife, U.life);
    gl.uniform1f(u.uBlink, U.blink); gl.uniform1f(u.uIrisR, U.irisR); gl.uniform1f(u.uPupilR, U.pupilR);
    const write = 1 - this.read;
    gl.bindVertexArray(this.vaos[this.read]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.bufs[write]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.n);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindVertexArray(null);
    this.read = write;
  }
  draw(cam, px, U) {
    if (U.alpha <= 0.001) return;
    const gl = this.r.gl, u = this.ren.u;
    gl.useProgram(this.ren.p);
    gl.uniformMatrix4fv(u.uView, false, cam.view);
    gl.uniformMatrix4fv(u.uProj, false, cam.proj);
    gl.uniform1f(u.uPx, px); gl.uniform1f(u.uSize, U.size); gl.uniform1f(u.uAlpha, U.alpha);
    gl.uniform1f(u.uRefDist, U.refDist); gl.uniform1f(u.uMax, Math.min(this.r.maxPoint, 128));
    gl.uniform1f(u.uRed, U.red); gl.uniform1f(u.uCyan, U.cyan); gl.uniform1f(u.uStreak, U.streak);
    gl.uniform4fv(u.uXf, U.xf); gl.uniform1f(u.uXfOn, U.xfOn);
    gl.uniform3fv(u.uWhite, PAL.white); gl.uniform3fv(u.uGray, PAL.gray);
    gl.uniform3fv(u.uCyanC, PAL.cyan); gl.uniform3fv(u.uRedC, PAL.red);
    gl.bindVertexArray(this.vaos[this.read]);
    gl.drawArrays(gl.POINTS, 0, this.n);
    gl.bindVertexArray(null);
  }
}
