/* ============================================================================
   6a. GLITCH ENGINE  (post-processing chain)
   scene (HDR) → bright pass → 3-level separable Gaussian bloom → composite.
   One control variable, glitchAmount (0 = pristine … 1 = reality failing),
   drives every layer.  All randomness is a pure function of the timeline
   (a 24 Hz "glitch clock"), so the same moment always breaks the same way.

     1 RGB channel offset        6 random geometry corruption (in the batches)
     2 horizontal tearing        7 brightness spikes / inversion / posterize
     3 scanlines + interlace     8 frame skipping + vertical roll
     4 temporal frame echo       9 particle explosions (in the ParticleEngine)
     5 pixel (macro-block) displacement + datamosh from the previous frame

   Layers 6 and 9 live in other systems but read the same glitchAmount.
   The composite also owns tone mapping, grain, vignette, the freeze-frame
   "sweep line", and the final eyelid that closes on the viewer.
   ========================================================================== */
const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThr, uKnee;
void main(){
  vec3 c = (texture(uTex, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture(uTex, vUv + uTexel * vec2(0.5, -0.5)).rgb
          + texture(uTex, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture(uTex, vUv + uTexel * vec2(0.5, 0.5)).rgb) * 0.25;
  c = min(c, vec3(48.0));
  float l = max(c.r, max(c.g, c.b));
  float s = clamp(l - uThr + uKnee, 0.0, 2.0 * uKnee);
  s = s * s / (4.0 * uKnee + 1e-4);
  o = vec4(c * max(s, l - uThr) / max(l, 1e-4), 1.0);
}`;
const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  o = vec4((texture(uTex, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture(uTex, vUv + uTexel * vec2(0.5, -0.5)).rgb
          + texture(uTex, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture(uTex, vUv + uTexel * vec2(0.5, 0.5)).rgb) * 0.25, 1.0);
}`;
const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 c = texture(uTex, vUv).rgb * 0.2270270;
  c += (texture(uTex, vUv + uDir * 1.3846154).rgb + texture(uTex, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture(uTex, vUv + uDir * 3.2307692).rgb + texture(uTex, vUv - uDir * 3.2307692).rgb) * 0.0702703;
  o = vec4(c, 1.0);
}`;
const COPY_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
void main(){ o = vec4(texture(uTex, vUv).rgb, 1.0); }`;
const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene, uBloomA, uBloomB, uBloomC, uHist;
uniform vec2 uRes;
uniform float uTime, uRnd, uG, uRGB, uTear, uBands, uBlock, uBlockPx, uEcho, uEchoZoom, uSpike, uInvert, uQuant;
uniform float uScan, uRoll, uGrain, uGrainSeed, uVig, uExposure, uBlack, uLid, uBloomStr, uDesat, uSweep, uSweepY;
uniform float uInterlace, uMosh, uWarp;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 tonemap(vec3 c){ c = 1.0 - exp(-max(c, 0.0) * uExposure); return pow(c, vec3(1.0 / 2.2)); }
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 d0 = vUv - 0.5;
  vec2 uv = 0.5 + d0 * (1.0 + uWarp * dot(d0, d0) * 2.0);            // lens warp
  uv.y = fract(uv.y + uRoll);                                        // 8 vertical roll
  float band = floor(uv.y * uBands);                                 // 2 horizontal tearing
  float tear = 0.0;
  if (h21(vec2(band, floor(uRnd * 977.0))) < 0.15 + 0.45 * uG) tear = (h21(vec2(band * 1.7 + 3.0, floor(uRnd * 613.0))) - 0.5) * uTear;
  tear += sin(uv.y * 31.0 + uTime * 47.0) * uTear * 0.035;
  tear += (mod(floor(fc.y), 2.0) - 0.5) * uInterlace;                // 3 interlace
  uv.x += tear;
  vec2 bc = floor(fc / uBlockPx);                                    // 5 macro-block displacement
  bool blk = h21(bc + floor(uRnd * 389.0)) < uBlock;
  vec2 suv = uv;
  if (blk) suv += (vec2(h21(bc + 1.3 + floor(uRnd * 211.0)), h21(bc + 7.1 + floor(uRnd * 157.0))) - 0.5) * vec2(0.16, 0.05) * (0.4 + uG);
  vec2 dc = suv - 0.5;                                               // 1 RGB channel offset
  vec2 ca = vec2(uRGB, uRGB * 0.2) + dc * (0.0025 + uRGB * 0.5) * length(dc) * 2.0;
  vec3 c = vec3(texture(uScene, suv + ca).r, texture(uScene, suv).g, texture(uScene, suv - ca).b);
  c += (texture(uBloomA, suv).rgb * 0.5 + texture(uBloomB, suv).rgb * 0.75 + texture(uBloomC, suv).rgb * 0.9) * uBloomStr;
  c *= 1.0 + uSpike;                                                 // 7 brightness spikes
  c = tonemap(c);
  vec2 huv = (vUv - 0.5) * uEchoZoom + 0.5 + vec2(tear * 0.6, 0.0);  // 4 temporal echo
  vec3 hist = texture(uHist, huv).rgb;
  c = max(c, hist * uEcho);
  if (blk && h21(bc + 9.7 + floor(uRnd * 83.0)) < uMosh) c = texture(uHist, suv).rgb * 0.96;  // datamosh
  c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), uDesat);
  if (uQuant > 1.0) c = floor(c * uQuant + 0.5) / uQuant;            // 7 posterize
  c *= 1.0 - uScan * (0.5 + 0.5 * cos(fc.y * 2.0943951));            // 3 scanlines
  if (uSweep > 0.0) c += vec3(0.55, 0.62, 0.62) * exp(-abs(vUv.y - uSweepY) * uRes.y * 0.6) * uSweep;
  c += (h21(fc + vec2(uGrainSeed * 37.0, uGrainSeed * 91.0)) - 0.5) * uGrain;
  c *= 1.0 - uVig * dot(d0, d0) * 1.3;
  if (uInvert > 0.5) c = vec3(1.0) - c;
  if (uLid > 0.0) {                                                  // the eyelid that closes on the viewer
    vec2 q = d0 * 2.0; q.x /= 1.25;
    float h = max(1.6 * (1.0 - uLid), 1e-3);
    float R = (1.0 + h * h) / (2.0 * h), cc = R - h;
    float lid = max(length(q - vec2(0.0, -cc)) - R, length(q - vec2(0.0, cc)) - R);
    c *= 1.0 - smoothstep(-0.02, 0.02, lid);
  }
  c *= 1.0 - uBlack;
  o = vec4(max(c, 0.0), 1.0);
}`;

class GlitchEngine {
  constructor(r) {
    this.r = r;
    this.pBright = r.program(FULLSCREEN_VS, BRIGHT_FS);
    this.pDown = r.program(FULLSCREEN_VS, DOWN_FS);
    this.pBlur = r.program(FULLSCREEN_VS, BLUR_FS);
    this.pComp = r.program(FULLSCREEN_VS, COMPOSITE_FS);
    this.pCopy = r.program(FULLSCREEN_VS, COPY_FS);
    this.scene = r.target(4, 4, { depth: true });
    this.bloom = [0, 1, 2].map(() => [r.target(2, 2), r.target(2, 2)]);   // half, quarter, eighth
    this.hist = [r.target(4, 4, { hdr: false }), r.target(4, 4, { hdr: false })];
    this.hi = 0;
    this.enabled = true;       // G key
    this.glitchAmount = 0;     // the control variable (after master / toggle)
    this.P = {};
  }
  resize(w, h) {
    const r = this.r, gl = r.gl;
    r.resizeTarget(this.scene, w, h);
    this.bloom.forEach((pair, i) => pair.forEach(t => r.resizeTarget(t, w >> (i + 1), h >> (i + 1))));
    this.hist.forEach(t => { r.resizeTarget(t, w, h); r.bind(t); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); });
  }
  clearHistory() {
    const gl = this.r.gl;
    this.hist.forEach(t => { this.r.bind(t); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); });
  }
  /** Derive every layer from glitchAmount.  X = scene-driven extras
      { echo, echoZoom, black, lid, desat, sweep, sweepY, warp, flash, exposure, grainSeed, oneFrame } */
  compute(T, g, X) {
    const P = this.P;
    g = this.enabled ? clamp(g * CONFIG.glitchMaster, 0, 1.5) : 0;
    this.glitchAmount = g;
    const f = Math.floor(T * 24), r = k => rand1(f, 100 + k);
    P.time = T; P.g = g; P.rnd = r(0);
    P.rgb = 0.0005 + g * (0.003 + 0.022 * Math.pow(r(1), 3));
    P.tear = g * g * (r(2) < 0.25 + 0.6 * g ? 0.02 + 0.14 * r(3) : 0.004);
    P.bands = 6 + Math.floor(r(4) * 60);
    P.scan = CONFIG.scanlines + g * 0.3;
    P.echo = clamp(Math.max(X.echo || 0, g * 0.82), 0, 0.97);
    P.echoZoom = X.echoZoom || (1 - g * 0.012 * (r(5) - 0.3));
    P.block = g > 0.15 ? (g - 0.15) * 0.4 * (r(6) < 0.6 ? 1 : 0.2) : 0;
    P.blockPx = [16, 24, 32, 48, 64][Math.floor(r(7) * 5)] * this.scene.h / 1080;
    P.mosh = g > 0.4 ? 0.6 : 0;
    P.spike = (r(8) < g * 0.16 ? 0.8 + 2.5 * r(9) : 0) + (X.flash || 0);
    P.invert = g > 0.55 && r(10) < (g - 0.5) * 0.14 ? 1 : 0;
    P.quant = g > 0.6 && r(11) < 0.25 ? 3 + Math.floor(r(12) * 5) : 0;
    P.roll = g > 0.7 && r(13) < 0.12 ? r(14) : 0;
    P.interlace = g * 0.004;
    P.warp = (X.warp || 0) + g * 0.25 * (r(15) - 0.5);
    P.skip = g > 0.25 && r(16) < (g - 0.2) * 0.3;          // 8 frame skipping (executed by the App)
    if (X.oneFrame && this.enabled) {                       // the blink: the whole scene distorts for one frame
      P.tear = 0.2; P.bands = 11; P.rgb = 0.03; P.warp = 0.9; P.block = 0.3; P.spike = 1.2; P.g = 1; P.mosh = 0; P.skip = false;
    }
    P.grain = CONFIG.grain * (1 + g * 2.5);
    P.grainSeed = X.grainSeed || 0;
    P.vig = CONFIG.vignette;
    P.exposure = CONFIG.exposure * (X.exposure === undefined ? 1 : X.exposure);
    P.black = X.black || 0; P.lid = X.lid || 0; P.desat = X.desat || 0;
    P.sweep = X.sweep || 0; P.sweepY = X.sweepY || 0;
    P.bloomStr = CONFIG.bloom.strength * (1 + g * 0.6);
    return P;
  }
  blur(src, dst, dx, dy) {
    const r = this.r, gl = r.gl, u = this.pBlur.u;
    r.bind(dst);
    gl.useProgram(this.pBlur.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uDir, dx / src.w, dy / src.h);
    r.fullscreen();
  }
  render(P) {
    const r = this.r, gl = r.gl, S = this.scene, B = this.bloom;
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    // bright pass → half res
    r.bind(B[0][0]);
    gl.useProgram(this.pBright.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.tex);
    gl.uniform1i(this.pBright.u.uTex, 0);
    gl.uniform2f(this.pBright.u.uTexel, 1 / S.w, 1 / S.h);
    gl.uniform1f(this.pBright.u.uThr, CONFIG.bloom.threshold);
    gl.uniform1f(this.pBright.u.uKnee, CONFIG.bloom.knee);
    r.fullscreen();
    this.blur(B[0][0], B[0][1], 1, 0); this.blur(B[0][1], B[0][0], 0, 1);
    for (let i = 1; i < 3; i++) {                    // quarter, eighth
      r.bind(B[i][0]);
      gl.useProgram(this.pDown.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, B[i - 1][0].tex);
      gl.uniform1i(this.pDown.u.uTex, 0);
      gl.uniform2f(this.pDown.u.uTexel, 1 / B[i - 1][0].w, 1 / B[i - 1][0].h);
      r.fullscreen();
      this.blur(B[i][0], B[i][1], 1, 0); this.blur(B[i][1], B[i][0], 0, 1);
    }
    // composite (reads the previous output for echo / datamosh)
    const src = this.hist[this.hi], dst = this.hist[1 - this.hi], u = this.pComp.u;
    r.bind(dst);
    gl.useProgram(this.pComp.p);
    const tex = [S.tex, B[0][0].tex, B[1][0].tex, B[2][0].tex, src.tex];
    const names = ['uScene', 'uBloomA', 'uBloomB', 'uBloomC', 'uHist'];
    for (let i = 0; i < 5; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[i]); gl.uniform1i(u[names[i]], i); }
    gl.uniform2f(u.uRes, S.w, S.h);
    gl.uniform1f(u.uTime, P.time); gl.uniform1f(u.uRnd, P.rnd); gl.uniform1f(u.uG, P.g);
    gl.uniform1f(u.uRGB, P.rgb); gl.uniform1f(u.uTear, P.tear); gl.uniform1f(u.uBands, P.bands);
    gl.uniform1f(u.uBlock, P.block); gl.uniform1f(u.uBlockPx, Math.max(4, P.blockPx));
    gl.uniform1f(u.uEcho, P.echo); gl.uniform1f(u.uEchoZoom, P.echoZoom);
    gl.uniform1f(u.uSpike, P.spike); gl.uniform1f(u.uInvert, P.invert); gl.uniform1f(u.uQuant, P.quant);
    gl.uniform1f(u.uScan, P.scan); gl.uniform1f(u.uRoll, P.roll);
    gl.uniform1f(u.uGrain, P.grain); gl.uniform1f(u.uGrainSeed, P.grainSeed);
    gl.uniform1f(u.uVig, P.vig); gl.uniform1f(u.uExposure, P.exposure);
    gl.uniform1f(u.uBlack, P.black); gl.uniform1f(u.uLid, P.lid); gl.uniform1f(u.uBloomStr, P.bloomStr);
    gl.uniform1f(u.uDesat, P.desat); gl.uniform1f(u.uSweep, P.sweep); gl.uniform1f(u.uSweepY, P.sweepY);
    gl.uniform1f(u.uInterlace, P.interlace); gl.uniform1f(u.uMosh, P.mosh); gl.uniform1f(u.uWarp, P.warp);
    r.fullscreen();
    gl.activeTexture(gl.TEXTURE0);
    this.hi = 1 - this.hi;
    this.present();
  }
  /** show the most recent composite (also used to hold a frame when skipping) */
  present() {
    const r = this.r, gl = r.gl;
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    r.bind(null);
    gl.useProgram(this.pCopy.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.hist[this.hi].tex);
    gl.uniform1i(this.pCopy.u.uTex, 0);
    r.fullscreen();
  }
}

/* ============================================================================
   6b. CAMERA SYSTEM
   A procedural camera with three "spaces" joined through darkness:
     A (0–8 s)   on the axis of the mandala: almost static → slow push →
                 exponential dive into the pupil (with a slow roll).
     B (8–24 s)  the tree world: a Catmull-Rom helix that rises through the
                 structure and pulls back for the wheel of symbols; a hard
                 freeze; a subtle orbit around the giant eye; then an unstable
                 hand that jolts, rolls and pumps its focal length.
     C (24–30 s) a fixed plate camera — the recursive zoom-out is done in
                 double precision on the CPU, not by moving this camera.
   Shake is smooth noise scaled by BASS, plus the glitch section's jolts.
   ========================================================================== */
const EYE_DIST = 4.0;      // distance from the frozen camera to the giant eye
const EYE_SCALE = 1.3;     // world units per eye unit (Space B)
class CameraSystem {
  constructor(noise) {
    this.noise = noise;
    this.pos = [0, 0, 3]; this.target = [0, 0, 0];
    this.fov = 40 * DEG; this.near = 0.01; this.far = 400; this.roll = 0; this.aspect = 16 / 9;
    this.view = new Float32Array(16); this.proj = new Float32Array(16);
    this.basis = { right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1] };
    this.tanHalf = Math.tan(this.fov / 2);
    // [time, position, look-at] — the path through the world tree
    this.keys = [
      [8.0,  [0.0, 0.35, 6.2],  [0, 0.5, 0]],
      [9.0,  [0.9, 1.0, 7.6],   [0, 1.9, 0]],
      [10.0, [2.4, 2.3, 8.6],   [0, 3.6, 0]],
      [11.0, [3.9, 3.9, 6.4],   [0, 5.0, 0]],
      [12.0, [3.1, 5.5, 4.4],   [0, 6.1, 0]],
      [13.0, [4.2, 7.0, 9.0],   [0, 6.3, 0]],
      [14.0, [4.6, 7.4, 10.6],  [0, 6.3, 0]],
    ];
    // the frozen pose (t = 14) defines where the giant eye will later form
    const p = this.treePose(14.0), fwd = V3.norm(V3.sub(p.target, p.pos));
    const right = V3.norm(V3.cross(fwd, [0, 1, 0])), up = V3.cross(right, fwd);
    this.frozen = { pos: p.pos, target: p.target, fwd, right, up };
    const o = V3.add(p.pos, V3.scale(fwd, EYE_DIST));
    this.eye = { o, right, up, back: V3.scale(fwd, -1),
      x: V3.scale(right, EYE_SCALE), y: V3.scale(up, EYE_SCALE), z: V3.scale(fwd, -EYE_SCALE) };
    this.treeFov = 46 * DEG;
  }
  static cr(p0, p1, p2, p3, t) {   // uniform Catmull-Rom
    const t2 = t * t, t3 = t2 * t, out = [0, 0, 0];
    for (let i = 0; i < 3; i++)
      out[i] = 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
    return out;
  }
  treePose(T) {
    const K = this.keys, n = K.length;
    const t = clamp(T, K[0][0], K[n - 1][0] - 1e-6);
    let i = 0;
    while (i < n - 2 && t >= K[i + 1][0]) i++;
    const u = (t - K[i][0]) / (K[i + 1][0] - K[i][0]);
    const a = K[Math.max(0, i - 1)], b = K[i], c = K[i + 1], d = K[Math.min(n - 1, i + 2)];
    return { pos: CameraSystem.cr(a[1], b[1], c[1], d[1], u), target: CameraSystem.cr(a[2], b[2], c[2], d[2], u) };
  }
  /** S: { shake, glitch } */
  update(T, S) {
    let roll = 0;
    if (T < 8.0) {                                   // ---- SPACE A
      let D;
      if (T < 4) D = 3.05 - 0.0125 * T;                                   // almost static
      else if (T < 7) D = lerp(3.0, 2.45, Ease.inOutQuad(seg(T, 4, 7))); // slow zoom forward
      else D = 2.45 * Math.pow(0.02, Math.pow(seg(T, 7.0, 8.0), 1.5));   // the dive
      this.pos = [0, 0, D]; this.target = [0, 0, 0];
      this.fov = 40 * DEG;
      roll = 0.5 * Ease.inCubic(seg(T, 7.0, 8.0));
    } else if (T < 24.0) {                           // ---- SPACE B
      this.fov = this.treeFov;
      if (T < 14.0) { const p = this.treePose(T); this.pos = p.pos; this.target = p.target; }
      else if (T < 18.0) { this.pos = this.frozen.pos.slice(); this.target = this.frozen.target.slice(); }
      else {
        const F = this.frozen, E = this.eye.o;
        const yaw = 0.2 * Ease.inOutQuad(seg(T, 18.0, 20.8)), pitch = 0.05 * Math.sin((T - 18) * 1.1);
        let dist = lerp(EYE_DIST, 3.5, Ease.inOutCubic(seg(T, 18.0, 21.0)));
        let off = V3.scale(F.fwd, -1);
        off = V3.rot(off, F.up, yaw);
        off = V3.rot(off, F.right, pitch);
        let tgt = E.slice();
        if (T >= 21.0) {                             // unstable: jolts, roll, focal pumping, pull-back
          const g = clamp01(S.glitch || 0), j = Math.floor(T * 12), q = k => rand1(j, 40 + k) - 0.5;
          dist += 2.6 * Ease.inOutCubic(seg(T, 21.8, 23.2));
          off = V3.rot(off, F.up, q(1) * 0.22 * g);
          off = V3.rot(off, F.right, q(2) * 0.12 * g);
          tgt = V3.add(tgt, V3.add(V3.scale(F.right, q(3) * 0.5 * g), V3.scale(F.up, q(4) * 0.3 * g)));
          roll = q(5) * 0.16 * g;
          this.fov = (46 + q(6) * 26 * g) * DEG;
        }
        this.pos = V3.add(E, V3.scale(off, dist));
        this.target = tgt;
      }
    } else {                                         // ---- SPACE C
      this.pos = [0, 0, 3]; this.target = [0, 0, 0]; this.fov = 40 * DEG;
    }
    // orthonormal basis, roll, and smooth (noise) shake proportional to distance
    const fwd = V3.norm(V3.sub(this.target, this.pos));
    const r0 = V3.norm(V3.cross(fwd, Math.abs(fwd[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0])), u0 = V3.cross(r0, fwd);
    const sh = S.shake || 0;
    if (sh > 0) {
      const d = V3.len(V3.sub(this.target, this.pos)), n = this.noise, f = S.shakeFreq || 7;
      const ox = n.n1(T * f, 1) * sh * d, oy = n.n1(T * f, 2) * sh * d;
      this.target = V3.add(this.target, V3.add(V3.scale(r0, ox), V3.scale(u0, oy)));
      this.pos = V3.add(this.pos, V3.add(V3.scale(r0, ox * 0.3), V3.scale(u0, oy * 0.3)));
      roll += n.n1(T * f * 0.7, 3) * sh * 0.6;
    }
    this.roll = roll;
    const up = V3.add(V3.scale(u0, Math.cos(roll)), V3.scale(r0, Math.sin(roll)));
    M4.lookAt(this.view, this.pos, this.target, up, this.basis);
    M4.perspective(this.proj, this.fov, this.aspect, this.near, this.far);
    this.tanHalf = Math.tan(this.fov / 2);
  }
}
