/* ============================================================================
   4a. SACRED GEOMETRY ENGINE
   Eight concentric rings in polar coordinates, each with its own angular
   velocity and engraving style (ticks, dashes, dots, markers — an astrolabe).
   On top: line figures whose endpoints live in the rotating frame of a ring
   (rotation matrices per ring).  Figures that span two counter-rotating rings
   shear and breathe; figures inside one ring stay rigid.  Includes a hexagram,
   a triangulated annulus lattice, a recursively subdivided (Sierpinski)
   triangle, star polygons {12/5} and {9/2}, spokes and "Metatron" ties.
   Every figure vertex is also exported as a node seed for the constellation.
   ========================================================================== */
class SacredGeometryEngine {
  constructor(rng) {
    this.R = [0.085, 0.16, 0.25, 0.38, 0.5, 0.63, 0.79, 1.0];
    this.styles = [
      { solid: 1, dots: 3, I: 0.55 },
      { dashes: 24, duty: 0.55, I: 0.5 },
      { solid: 1, ticks: 72, tickDir: -1, tickLen: 0.014, major: 6, majorLen: 2.2, I: 0.55 },
      { solid: 1, double: 0.011, markers: 4, bead: 1, I: 0.9 },
      { dotted: 120, gaps: 3, I: 0.65 },
      { solid: 1, ticks: 36, tickDir: 1, tickLen: 0.022, major: 3, majorLen: 1.8, I: 0.5 },
      { arcs: 5, arcDuty: 0.82, ticks: 120, tickDir: -1, tickLen: 0.009, major: 10, majorLen: 2.5, I: 0.45 },
      { solid: 1, ticks: 360, tickDir: -1, tickLen: 0.011, major: 10, majorLen: 2.6, I: 0.42 },
    ];
    this.rings = this.R.map((r, k) => ({
      r, k, st: this.styles[k],
      w: (k === 3 ? 0.3 : 0.09 + rng.next() * 0.3) * (k % 2 ? -1 : 1),
      phase: rng.next() * TAU,
      appear: k === 3 ? 1.0 : 2.0 + Math.abs(k - 3) * 0.125 + rng.range(-0.02, 0.02),
    }));
    this.audioRot = 0;          // accumulated MID-band rotation
    this.figs = [];
    this.buildFigures(rng);
    this.buildNodes();
    this._p = [0, 0];
  }
  /** integrated spin: full speed until 3 s, the rings "lock" (slow) by 4.2 s */
  static spin(t) {
    if (t <= 1) return 0;
    if (t < 3) return t - 1;
    if (t < 4.2) { const u = t - 3; return 2 + u - (0.7 / 1.2) * u * u / 2; }
    return 2.78 + 0.3 * (t - 4.2);
  }
  ringAngle(k, t) { const g = this.rings[k]; return g.phase + g.w * (SacredGeometryEngine.spin(t) + this.audioRot); }
  ringRadius(k, t) {
    const g = this.rings[k];
    if (k === 3) return g.r * Ease.outExpo(seg(t, 1.0, 1.75));   // the point opens into the first ring
    return lerp(this.R[3], g.r, Ease.outCubic(seg(t, g.appear, g.appear + 0.55))); // ripples
  }
  ringDraw(k, t) { const g = this.rings[k]; return k === 3 ? (t >= 1.0 ? 1 : 0) : Ease.inOutCubic(seg(t, g.appear, g.appear + 0.62)); }

  fig(k0, a, k1, b, t0, dur, I, col) {
    this.figs.push({ k0, x0: a[0], y0: a[1], k1, x1: b[0], y1: b[1], t0, dur, I, col: col || 0, id: this.figs.length });
  }
  buildFigures(rng) {
    const R = this.R, P = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
    // hexagram inscribed in the first ring
    for (let tri = 0; tri < 2; tri++) {
      const base = tri ? -Math.PI / 2 : Math.PI / 2;
      for (let i = 0; i < 3; i++)
        this.fig(3, P(R[3], base + i * TAU / 3), 3, P(R[3], base + (i + 1) * TAU / 3), 3.0 + tri * 0.09 + i * 0.05, 0.38, 0.8);
    }
    // triangulated annulus lattice between rings 4 and 5
    for (let i = 0, n = 18; i < n; i++) {
      const a = P(R[4], i * TAU / n), b = P(R[5], (i + 0.5) * TAU / n), c = P(R[4], (i + 1) * TAU / n);
      this.fig(4, a, 5, b, 3.12 + i * 0.016, 0.3, 0.55);
      this.fig(5, b, 4, c, 3.16 + i * 0.016, 0.3, 0.55);
    }
    // recursive subdivision (Sierpinski) of a triangle inscribed in ring 6
    const tri = (a, b, c, t0, I) => { this.fig(6, a, 6, b, t0, 0.3, I); this.fig(6, b, 6, c, t0 + 0.03, 0.3, I); this.fig(6, c, 6, a, t0 + 0.06, 0.3, I); };
    const A = P(R[6], Math.PI / 2), B = P(R[6], Math.PI / 2 + TAU / 3), C = P(R[6], Math.PI / 2 + 2 * TAU / 3);
    tri(A, B, C, 3.18, 0.75);
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const sub = (a, b, c, lvl) => {
      if (lvl > 3) return;
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      tri(ab, bc, ca, 3.28 + lvl * 0.16 + rng.range(0, 0.06), 0.62 - lvl * 0.1);
      sub(a, ab, ca, lvl + 1); sub(ab, b, bc, lvl + 1); sub(ca, bc, c, lvl + 1);
    };
    sub(A, B, C, 1);
    tri(P(R[6], -Math.PI / 2), P(R[6], -Math.PI / 2 + TAU / 3), P(R[6], -Math.PI / 2 + 2 * TAU / 3), 3.26, 0.38);
    // star polygon {12/5} on the outer ring
    for (let i = 0; i < 12; i++) this.fig(7, P(R[7], i * TAU / 12), 7, P(R[7], ((i + 5) % 12) * TAU / 12), 3.42 + i * 0.022, 0.42, 0.4);
    // enneagram {9/2}
    for (let i = 0; i < 9; i++) this.fig(2, P(R[2], i * TAU / 9 + 0.3), 2, P(R[2], ((i + 2) % 9) * TAU / 9 + 0.3), 3.05 + i * 0.02, 0.3, 0.6);
    // inner annulus between rings 1 and 2
    for (let i = 0; i < 12; i++) {
      const a = P(R[1], i * TAU / 12), b = P(R[2], (i + 0.5) * TAU / 12), c = P(R[1], (i + 1) * TAU / 12);
      this.fig(1, a, 2, b, 3.0 + i * 0.02, 0.28, 0.5);
      this.fig(2, b, 1, c, 3.02 + i * 0.02, 0.28, 0.5);
    }
    // twelve spokes
    for (let i = 0; i < 12; i++) this.fig(3, P(R[0], i * TAU / 12), 3, P(R[3], i * TAU / 12), 3.55 + i * 0.012, 0.3, 0.36);
    // ties between hexagram vertices and the outer star (they stretch as rings counter-rotate)
    for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + i * TAU / 6; this.fig(3, P(R[3], a), 7, P(R[7], a), 3.72 + i * 0.02, 0.35, 0.3, 1); }
  }
  buildNodes() {
    const map = new Map();
    this.nodes = [];
    const key = (k, x, y) => k + ':' + Math.round(x * 1e4) + ':' + Math.round(y * 1e4);
    for (const f of this.figs) {
      for (const e of [[f.k0, f.x0, f.y0], [f.k1, f.x1, f.y1]]) {
        const kk = key(e[0], e[1], e[2]);
        if (!map.has(kk)) { map.set(kk, this.nodes.length); this.nodes.push({ k: e[0], x: e[1], y: e[2], t: f.t0 }); }
        else { const n = this.nodes[map.get(kk)]; n.t = Math.min(n.t, f.t0); }
      }
    }
  }
  nodePos(i, t, out) {
    const n = this.nodes[i], a = this.ringAngle(n.k, t), c = Math.cos(a), s = Math.sin(a);
    out[0] = n.x * c - n.y * s; out[1] = n.x * s + n.y * c;
  }
  /** A: { alpha, figAlpha, ringAlpha(k), dissolve, scale, z, bright } */
  draw(L, P, t, A) {
    const al = A.alpha;
    if (al <= 0.002) return;
    for (let k = 0; k < 8; k++) {
      const ra = al * (A.ringAlpha ? A.ringAlpha(k) : 1);
      if (ra > 0.002) this.drawRing(L, P, k, t, ra, A);
    }
    const fa = al * (A.figAlpha === undefined ? 1 : A.figAlpha);
    if (fa <= 0.002) return;
    const S = A.scale || 1, z = A.z || 0;
    for (const f of this.figs) {
      const pr = Ease.inOutCubic(seg(t, f.t0, f.t0 + f.dur));
      if (pr <= 0) continue;
      if (A.dissolve > 0 && rand1(f.id, 3) < A.dissolve) continue;
      const a0 = this.ringAngle(f.k0, t), a1 = this.ringAngle(f.k1, t);
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const x0 = (f.x0 * c0 - f.y0 * s0) * S, y0 = (f.x0 * s0 + f.y0 * c0) * S;
      let x1 = (f.x1 * c1 - f.y1 * s1) * S, y1 = (f.x1 * s1 + f.y1 * c1) * S;
      x1 = x0 + (x1 - x0) * pr; y1 = y0 + (y1 - y0) * pr;
      const C = f.col ? PAL.cyan : PAL.white;
      const I = fa * f.I * (A.bright || 1) * (1 + (1 - pr) * 1.6);
      L.seg(x0, y0, z, x1, y1, z, C[0] * I, C[1] * I, C[2] * I, 1.0);
      if (pr < 1) P.pt(x1, y1, z, C[0] * I * 2.2, C[1] * I * 2.2, C[2] * I * 2.2, 2.4, SH_SOFT);
    }
  }
  drawRing(L, P, k, t, al, A) {
    const g = this.rings[k], st = g.st, S = A.scale || 1, z = A.z || 0;
    const r = this.ringRadius(k, t) * S;
    if (r <= 1e-4) return;
    const frac = this.ringDraw(k, t);
    if (frac <= 0) return;
    const a0 = this.ringAngle(k, t), W = PAL.white, G = PAL.gray;
    const I = al * st.I * (A.bright || 1);
    const wr = W[0] * I, wg = W[1] * I, wb = W[2] * I;
    const segs = Math.max(48, Math.round(300 * r / S));
    if (st.solid) L.arc(0, 0, z, r, a0, a0 + TAU * frac, segs, wr, wg, wb, 1);
    if (st.double) L.arc(0, 0, z, r + st.double * S, a0, a0 + TAU * frac, segs, G[0] * I * 0.8, G[1] * I * 0.8, G[2] * I * 0.8, 0.8);
    const parts = (n, duty) => {
      for (let i = 0; i < n; i++) {
        const s0 = i / n; if (s0 >= frac) break;
        const s1 = Math.min(frac, s0 + duty / n);
        L.arc(0, 0, z, r, a0 + s0 * TAU, a0 + s1 * TAU, segs, wr, wg, wb, 1);
      }
    };
    if (st.dashes) parts(st.dashes, st.duty);
    if (st.arcs) parts(st.arcs, st.arcDuty);
    if (st.ticks) {
      for (let i = 0; i < st.ticks; i++) {
        const s0 = i / st.ticks; if (s0 >= frac) break;
        const major = st.major && i % st.major === 0;
        const len = st.tickLen * S * (major ? st.majorLen : 1) * st.tickDir;
        const a = a0 + s0 * TAU, c = Math.cos(a), s = Math.sin(a), m = major ? 1 : 0.55;
        L.seg(c * r, s * r, z, c * (r + len), s * (r + len), z, wr * m, wg * m, wb * m, 0.9);
      }
    }
    if (st.dotted) {
      for (let i = 0; i < st.dotted; i++) {
        const s0 = i / st.dotted; if (s0 >= frac) break;
        if (st.gaps && fract(s0 * st.gaps) > 0.86) continue;
        const a = a0 + s0 * TAU;
        P.pt(Math.cos(a) * r, Math.sin(a) * r, z, wr * 1.1, wg * 1.1, wb * 1.1, 1.7, SH_SOFT);
      }
    }
    if (st.markers) for (let i = 0; i < st.markers; i++) {
      const a = a0 + i / st.markers * TAU + Math.PI / 4;
      L.arc(Math.cos(a) * r, Math.sin(a) * r, z, 0.017 * S, 0, TAU, 18, wr, wg, wb, 1);
    }
    if (st.dots) for (let i = 0; i < st.dots; i++) {
      const a = a0 + i / st.dots * TAU;
      P.pt(Math.cos(a) * r, Math.sin(a) * r, z, wr * 1.6, wg * 1.6, wb * 1.6, 2.4, SH_SOFT);
    }
    if (st.bead) {
      const a = a0 * 2.6 + t * 0.9, b = al * 2.2;
      P.pt(Math.cos(a) * r, Math.sin(a) * r, z, W[0] * b, W[1] * b, W[2] * b, 3.4, SH_SOFT);
    }
  }
}

/* ============================================================================
   4b. CONSTELLATION ENGINE
   ~950 nodes (x, y, radius, brightness, phase …) and ~1500 candidate edges
   chosen by distance + probability.  The secret: every node has a slot in an
   *eye layout* (lids, creases, limbus, iris rings, fibres, pupil boundary,
   halo, camouflage stars), but nodes are placed in 3D as an ANAMORPHIC
   sculpture — scattered in depth with x,y scaled by (D - z) / D, so that only
   from the camera's exact viewpoint, with rotation 0, do they project onto
   the eye.  While the cloud is turned, it reads as a random 3D constellation;
   as the rapid rotation decelerates into alignment, the eye snaps into
   recognition.  It is never drawn as an eye — it emerges.
   ========================================================================== */
class ConstellationEngine {
  constructor(rng, geo) {
    this.geo = geo;
    const S = [];
    const add = (x, y, kind, size, b) => S.push({ x, y, kind, size, b });
    // kinds: 1 lid, 2 crease, 3 limbus, 4 iris ring, 5 pupil, 6 fibre, 7 corner, 8 halo, 9 star
    const h = 0.5, R = (1 + h * h) / (2 * h), c = R - h;
    for (let i = 0; i < 92; i++) {
      const x = -1 + 2 * (i + 0.5) / 92 + rng.range(-0.004, 0.004);
      const y = Math.sqrt(R * R - x * x) - c;
      add(x, y, 1, 1.5, 0.95); add(x, -y, 1, 1.4, 0.85);
    }
    for (let i = 0; i < 42; i++) { const x = -0.86 + 1.72 * (i + 0.5) / 42; add(x, 0.07 + 0.6 * Math.pow(1 - x * x, 0.85), 2, 1.1, 0.5); }
    for (let i = 0; i < 26; i++) { const x = -0.62 + 1.24 * (i + 0.5) / 26; add(x, -(0.1 + 0.5 * Math.pow(Math.max(0, 1 - (x / 0.75) ** 2), 0.9)), 2, 1.0, 0.4); }
    const ring = (r, n, kind, size, b, wob = 0, wf = 0) => {
      const off = rng.next() * TAU;
      for (let i = 0; i < n; i++) { const a = off + i / n * TAU, rr = r + wob * Math.sin(a * wf); add(Math.cos(a) * rr, Math.sin(a) * rr, kind, size, b); }
    };
    ring(0.42, 88, 3, 1.6, 1.0); ring(0.36, 60, 4, 1.1, 0.55); ring(0.27, 54, 4, 1.2, 0.7, 0.014, 9);
    ring(0.205, 36, 4, 1.0, 0.5); ring(0.16, 44, 5, 1.4, 1.0);
    for (let j = 0; j < 36; j++) {
      const a0 = j / 36 * TAU + rng.range(-0.03, 0.03);
      for (let s = 0; s < 5; s++) { const r = 0.185 + s * 0.052, a = a0 + 0.18 * (r - 0.185); add(Math.cos(a) * r, Math.sin(a) * r, 6, 0.9, 0.55); }
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) add(sx * (1.0 + rng.range(-0.04, 0.06)), rng.range(-0.035, 0.035), 7, 1.2, 0.7);
    for (let i = 0; i < 72; i++) { if (rng.next() < 0.2) continue; const a = i / 72 * TAU; add(Math.cos(a) * 1.32, Math.sin(a) * 1.32, 8, 1.2, 0.45); }
    for (let i = 0; i < 170; i++) {
      let x, y;
      do { x = rng.range(-1.95, 1.95); y = rng.range(-1.2, 1.2); } while (x * x + y * y < 0.04);
      const big = rng.next() < 0.12;
      add(x, y, 9, big ? 2.4 : 1.0 + rng.next(), big ? 1.5 : 0.3 + rng.next() * 0.5);
    }
    const N = this.N = S.length;
    this.ex = new Float32Array(N); this.ey = new Float32Array(N); this.ez = new Float32Array(N);
    this.size = new Float32Array(N); this.bright = new Float32Array(N); this.phase = new Float32Array(N);
    this.kind = new Uint8Array(N); this.birth = new Float32Array(N); this.depart = new Float32Array(N);
    this.travel = new Float32Array(N); this.g = new Int32Array(N).fill(-1); this.parent = new Int32Array(N).fill(-1);
    this.sx = new Float32Array(N); this.sy = new Float32Array(N); this.sz = new Float32Array(N); this.rr = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const s = S[i];
      this.ex[i] = s.x; this.ey[i] = s.y; this.size[i] = s.size; this.bright[i] = s.b; this.kind[i] = s.kind;
      this.ez[i] = (s.kind === 9 ? 1.35 : 1.0) * rng.range(-1, 1);
      this.phase[i] = rng.next() * TAU;
      const u = rng.next() * 2 - 1, th = rng.next() * TAU, q = Math.sqrt(1 - u * u);
      this.sx[i] = q * Math.cos(th); this.sy[i] = u; this.sz[i] = q * Math.sin(th);   // scatter direction
      this.rr[i] = rng.next();
    }
    // geometry vertices claim their nearest eye slot: the mandala *becomes* the constellation
    const free = new Uint8Array(N).fill(1), gp = [0, 0];
    const order = rng.shuffle([...Array(geo.nodes.length).keys()]);
    for (const gi of order) {
      geo.nodePos(gi, 4.0, gp);
      let best = -1, bd = 1e9;
      for (let i = 0; i < N; i++) {
        if (!free[i] || this.kind[i] === 9) continue;
        const dx = this.ex[i] - gp[0], dy = this.ey[i] - gp[1], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) continue;
      free[best] = 0; this.g[best] = gi;
      this.birth[best] = clamp(geo.nodes[gi].t + 0.32, 3.45, 3.98);
      this.depart[best] = 4.0 + rng.next() * 0.55;
      this.travel[best] = 0.85;
    }
    for (let i = 0; i < N; i++) {
      if (this.g[i] >= 0) continue;
      const u = rng.next();
      this.birth[i] = this.kind[i] === 9 ? 4.25 + 1.3 * u : 4.45 + 1.85 * Math.sqrt(u);
      this.depart[i] = this.birth[i];
      this.travel[i] = 0.6;
    }
    // parents: nearest earlier-born node (new stars are spawned out of old ones)
    this.order = [...Array(N).keys()].sort((a, b) => this.birth[a] - this.birth[b]);
    for (let oi = 0; oi < N; oi++) {
      const i = this.order[oi];
      if (this.g[i] >= 0) continue;
      let best = -1, bd = 1e9;
      for (let oj = 0; oj < oi; oj++) {
        const j = this.order[oj];
        const dx = this.ex[i] - this.ex[j], dy = this.ey[i] - this.ey[j], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = j; }
      }
      this.parent[i] = best;
    }
    // candidate edges by distance and probability (degree-limited)
    const E = [], deg = new Uint8Array(N);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const si = this.kind[i] === 9, sj = this.kind[j] === 9;
      if (si !== sj) continue;
      const dx = this.ex[i] - this.ex[j], dy = this.ey[i] - this.ey[j], d = Math.sqrt(dx * dx + dy * dy);
      const maxD = si ? 0.34 : 0.075;
      if (d > maxD) continue;
      const p = si ? 0.42 * (1 - d / maxD) : (d < 0.045 ? 0.9 : 0.45);
      if (rng.next() > p || deg[i] >= 4 || deg[j] >= 4) continue;
      deg[i]++; deg[j]++;
      E.push(i, j, si ? 0.55 : 1.0);
    }
    this.E = new Float32Array(E);
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N); this.al = new Float32Array(N);
    this._gp = [0, 0];
  }
  /** Space A: anamorphic placement.  P: { camD, theta, tilt, depth, scale, geoScale } */
  updateA(t, P) {
    const geo = this.geo, gp = this._gp;
    const ct = Math.cos(P.theta), st = Math.sin(P.theta), cx = Math.cos(P.tilt), sx = Math.sin(P.tilt);
    for (let oi = 0; oi < this.N; oi++) {
      const i = this.order[oi];
      const z = this.ez[i] * P.depth, k = (P.camD - z) / P.camD;
      const x = this.ex[i] * k * P.scale, y = this.ey[i] * k * P.scale;
      let X = x * ct + z * st, Z = -x * st + z * ct;
      const Y = y * cx - Z * sx; Z = y * sx + Z * cx;
      let Yf = Y;
      const d0 = this.depart[i], u = Ease.inOutCubic(seg(t, d0, d0 + this.travel[i]));
      if (u < 1) {
        let ox, oy, oz;
        if (this.g[i] >= 0) { geo.nodePos(this.g[i], t, gp); ox = gp[0] * P.geoScale; oy = gp[1] * P.geoScale; oz = 0; }
        else { const p = this.parent[i]; ox = this.px[p]; oy = this.py[p]; oz = this.pz[p]; }
        X = ox + (X - ox) * u; Yf = oy + (Y - oy) * u; Z = oz + (Z - oz) * u;
      }
      this.px[i] = X; this.py[i] = Yf; this.pz[i] = Z;
      this.al[i] = smoothstep(this.birth[i], this.birth[i] + 0.14, t);
    }
  }
  /** Space B: the constellation re-assembles as the giant eye in a world frame.
      F: {o,x,y,z} world vectors (x,y,z already scaled).  P: { open, form, scatter, jitter, depth, seed } */
  updateEye(t, F, P) {
    const o = F.o, X = F.x, Y = F.y, Z = F.z;
    for (let i = 0; i < this.N; i++) {
      const rad = Math.hypot(this.ex[i], this.ey[i]);
      const d0 = 0.22 * rad + 0.12 * this.rr[i];
      const u = Ease.outCubic(seg(P.form, d0, d0 + 0.5));
      let lx = this.ex[i] * u, ly = this.ey[i] * u * (this.kind[i] === 9 || this.kind[i] === 8 ? 1 : P.open);
      let lz = this.ez[i] * P.depth * u;
      if (P.scatter > 0) {
        const s = P.scatter * (0.4 + this.rr[i] * 1.2);
        lx += this.sx[i] * s; ly += this.sy[i] * s; lz += this.sz[i] * s;
      }
      if (P.jitter > 0) {
        const h = rand1(i * 7 + P.seed * 131, 5);
        if (h < P.jitter * 0.5) { lx += (h - 0.25) * P.jitter * 0.8; ly += (rand1(i, P.seed) - 0.5) * P.jitter * 0.3; }
      }
      this.px[i] = o[0] + X[0] * lx + Y[0] * ly + Z[0] * lz;
      this.py[i] = o[1] + X[1] * lx + Y[1] * ly + Z[1] * lz;
      this.pz[i] = o[2] + X[2] * lx + Y[2] * ly + Z[2] * lz;
      this.al[i] = smoothstep(0, 0.25, u);
    }
  }
  /** A: { alpha, bright, sizeMul } */
  drawNodes(P, t, A) {
    const W = PAL.white, C = PAL.cyan;
    for (let i = 0; i < this.N; i++) {
      const a = this.al[i] * A.alpha;
      if (a < 0.01) continue;
      const tw = 0.72 + 0.28 * Math.sin(this.phase[i] + t * (1.4 + (i % 7) * 0.45));
      const I = a * this.bright[i] * tw * A.bright;
      const kind = this.kind[i], col = kind === 4 || kind === 6 ? C : W;
      const glint = kind === 9 && this.size[i] > 2;
      P.pt(this.px[i], this.py[i], this.pz[i], col[0] * I, col[1] * I, col[2] * I,
        this.size[i] * A.sizeMul * (glint ? 3.4 : 1), glint ? SH_GLINT : SH_SOFT);
    }
  }
  /** A: { alpha, maxLen } */
  drawEdges(L, A) {
    const E = this.E, px = this.px, py = this.py, pz = this.pz, W = PAL.white, G = PAL.gray;
    for (let e = 0; e < E.length; e += 3) {
      const i = E[e], j = E[e + 1];
      let a = this.al[i] * this.al[j] * A.alpha * E[e + 2];
      if (a < 0.01) continue;
      const dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      a *= 1 - smoothstep(A.maxLen * 0.5, A.maxLen, len);
      if (a < 0.01) continue;
      const C = E[e + 2] < 1 ? G : W, I = a * 0.3;
      L.seg(px[i], py[i], pz[i], px[j], py[j], pz[j], C[0] * I, C[1] * I, C[2] * I, 0.85);
    }
  }
  /** the network loses its topology: random connections, re-wired every frame */
  drawRandomEdges(L, count, alpha, seed) {
    const W = PAL.white, Cy = PAL.cyan;
    for (let k = 0; k < count; k++) {
      const i = Math.floor(rand1(seed * 1031 + k, 11) * this.N), j = Math.floor(rand1(seed * 977 + k * 3, 13) * this.N);
      const a = alpha * (0.3 + 0.7 * rand1(k, seed)), C = k % 5 === 0 ? Cy : W;
      L.seg(this.px[i], this.py[i], this.pz[i], this.px[j], this.py[j], this.pz[j], C[0] * a, C[1] * a, C[2] * a, 0.8);
    }
  }
}

/* ============================================================================
   4c. EYE GENERATOR
   The eye is assembled from layers: (1) this fragment shader on a world-space
   quad — periodic-noise iris fibres, crypts, collarette, engraved rings, a
   copper-plate hatched sclera, and a black-hole pupil (event horizon that
   occludes via depth, gravitational lensing + swirl of the iris near the
   horizon, a Doppler-asymmetric photon ring, accretion glow); (2) the
   constellation nodes in eye layout; (3) GPU particles on iris targets;
   (4) the halo: concentric rings, rays and triangles drawn by drawHalo().
   ========================================================================== */
const EYE_VS = `#version 300 es
precision highp float;
uniform mat4 uView, uProj;
uniform vec3 uC, uU, uV;
uniform vec2 uHalf;
uniform float uScale;
out vec2 vQ;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vec2 q = c * uHalf;
  vQ = q;
  gl_Position = uProj * uView * vec4(uC + (uU * q.x + uV * q.y) * uScale, 1.0);
}`;
const EYE_FS = `#version 300 es
precision highp float;
in vec2 vQ;
out vec4 o;
uniform float uTime, uOpen, uIrisR, uPupilR, uI, uRed, uGlitch, uHole, uSeed, uSclera;
uniform vec3 uWhite, uCyan, uRedC;
${GLSL_HASH}
const float TAU = 6.28318530718;
float pn(vec2 p, float P){            // value noise, periodic in x (seamless around the iris)
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, P), x1 = mod(i.x + 1.0, P);
  return mix(mix(h21(vec2(x0, i.y)), h21(vec2(x1, i.y)), u.x), mix(h21(vec2(x0, i.y + 1.0)), h21(vec2(x1, i.y + 1.0)), u.x), u.y);
}
float ring(float r, float r0, float w){ float d = (r - r0) / w; return exp(-d * d); }
void main(){
  vec2 q = vQ;
  if (uGlitch > 0.0) {
    float row = floor(q.y * 22.0);
    float g = h21(vec2(row, floor(uTime * 24.0) + uSeed));
    if (g < uGlitch * 0.45) q.x += (h21(vec2(row * 3.1, g * 91.0)) - 0.5) * 0.35 * uGlitch;
  }
  float r = length(q), a = atan(q.y, q.x);
  float h = max(0.52 * uOpen, 0.0015);
  float R = (1.0 + h * h) / (2.0 * h), cc = R - h;
  float lid = max(length(q - vec2(0.0, -cc)) - R, length(q - vec2(0.0, cc)) - R);
  float inside = 1.0 - smoothstep(-0.004, 0.004, lid);
  float Rp = uPupilR;
  float rl = r - uHole * Rp * Rp / max(r, 1e-3) * 0.85;
  float al = a + uHole * 0.22 * Rp / max(r - Rp * 0.85, 0.015) + uTime * 0.02;
  float irisMask = smoothstep(uIrisR + 0.01, uIrisR - 0.006, rl) * smoothstep(Rp * 0.98, Rp * 1.08, r);
  float fib = pn(vec2(al / TAU * 180.0, rl * 6.0), 180.0);
  float fib2 = pn(vec2(al / TAU * 64.0 + 7.0, rl * 16.0), 64.0);
  float crypt = smoothstep(0.62, 0.8, pn(vec2(al / TAU * 28.0, rl * 22.0 + 3.0), 28.0));
  float streak = pow(fib, 3.0) * 0.9 + fib2 * 0.25;
  float radial = smoothstep(Rp, uIrisR, rl);
  vec3 irisCol = mix(uCyan, uWhite, 0.35 + 0.65 * fib) * streak * (0.16 + 0.3 * radial) * (1.0 - crypt * 0.7);
  float rings = ring(rl, 0.27 + 0.012 * sin(al * 9.0), 0.006) * 0.55 + ring(rl, 0.205, 0.003) * 0.35 + ring(rl, 0.36, 0.003) * 0.3;
  float limbus = ring(rl, uIrisR, 0.007);
  vec3 col = (irisCol + uWhite * (rings * 0.4 + limbus * 0.55)) * irisMask + uWhite * limbus * 0.25;
  float hatch = pow(0.5 + 0.5 * sin(r * 260.0), 6.0) * smoothstep(uIrisR, uIrisR + 0.1, r);
  col += uWhite * (hatch * 0.022 + vnoise(vec3(q * 14.0, 1.0)) * 0.012) * uSclera * (1.0 - irisMask);
  float hole = 1.0 - smoothstep(Rp * 0.97, Rp * 1.02, r);
  float dop = 0.65 + 0.55 * cos(a - 0.7 + uTime * 0.3);
  float photon = ring(r, Rp * 1.035, 0.0045) * 2.4 * dop;
  float accr = exp(-max(r - Rp, 0.0) / 0.03) * (1.0 - hole) * (0.35 + 0.65 * pn(vec2(al / TAU * 40.0 - uTime * 0.6, r * 30.0), 40.0)) * 0.55;
  col += mix(uWhite, uRedC, uRed) * (photon + accr) * (1.0 - hole);
  col *= inside * uI;
  col += uWhite * exp(-abs(lid) / 0.0045) * 0.3 * uI;
  float alpha = hole * inside * clamp(uI * 1.5, 0.0, 1.0);
  gl_FragDepth = alpha > 0.5 ? gl_FragCoord.z : 1.0;
  o = vec4(col, alpha);
}`;

class EyeGenerator {
  constructor(r) {
    this.r = r;
    this.prog = r.program(EYE_VS, EYE_FS);
    this.haloRings = [
      { r: 1.17, z: -0.05, I: 0.5, w: 0.05, phase: 0 },
      { r: 1.30, z: -0.12, I: 0.36, w: -0.07, dash: 60, duty: 0.5, phase: 1 },
      { r: 1.62, z: -0.22, I: 0.4, w: 0.03, ticks: 90, tickLen: -0.03, major: 6, phase: 2 },
      { r: 2.05, z: -0.35, I: 0.3, w: -0.02, phase: 3 },
      { r: 2.72, z: -0.5, I: 0.28, w: 0.015, ticks: 180, tickLen: 0.04, major: 5, phase: 4 },
      { r: 3.6, z: -0.7, I: 0.2, w: -0.01, phase: 5 },
    ];
  }
  /** E: { c, u, v, scale, half, open, iris, pupil, I, red, glitch, hole, sclera, time, seed } */
  draw(cam, E) {
    if (E.I <= 0.002) return;
    const gl = this.r.gl, u = this.prog.u;
    gl.useProgram(this.prog.p);
    gl.uniformMatrix4fv(u.uView, false, cam.view);
    gl.uniformMatrix4fv(u.uProj, false, cam.proj);
    gl.uniform3fv(u.uC, E.c); gl.uniform3fv(u.uU, E.u); gl.uniform3fv(u.uV, E.v);
    gl.uniform2fv(u.uHalf, E.half); gl.uniform1f(u.uScale, E.scale);
    gl.uniform1f(u.uTime, E.time); gl.uniform1f(u.uOpen, E.open); gl.uniform1f(u.uIrisR, E.iris);
    gl.uniform1f(u.uPupilR, E.pupil); gl.uniform1f(u.uI, E.I); gl.uniform1f(u.uRed, E.red);
    gl.uniform1f(u.uGlitch, E.glitch); gl.uniform1f(u.uHole, E.hole); gl.uniform1f(u.uSeed, E.seed);
    gl.uniform1f(u.uSclera, E.sclera);
    gl.uniform3fv(u.uWhite, PAL.white); gl.uniform3fv(u.uCyan, PAL.cyan); gl.uniform3fv(u.uRedC, PAL.red);
    gl.bindVertexArray(this.r.emptyVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  /** eyelid outline: the vesica's two arcs for an opening half-height h */
  static lids(L, h, z, r, g, b, w = 1) {
    h = Math.max(h, 0.003);
    const R = (1 + h * h) / (2 * h), c = R - h, th = Math.atan2(c, 1);
    L.arc(0, -c, z, R, th, Math.PI - th, 220, r, g, b, w);
    L.arc(0, c, z, R, -th, -(Math.PI - th), 220, r, g, b, w);
  }
  /** concentric rings, rays and triangles around the giant eye (local eye units).
      A: { alpha, grow, open, spin } */
  drawHalo(L, P, t, A) {
    const al = A.alpha;
    if (al <= 0.002) return;
    const W = PAL.white, G = PAL.gray, C = PAL.cyan, g = A.grow;
    this.haloRings.forEach((R, i) => {
      const pr = Ease.inOutCubic(clamp01(g * 1.6 - i * 0.1));
      if (pr <= 0) return;
      const a0 = R.phase + t * R.w * A.spin, I = al * R.I;
      const n = Math.round(150 * R.r);
      if (R.dash) {
        for (let d = 0; d < R.dash; d++) {
          const s0 = d / R.dash; if (s0 >= pr) break;
          L.arc(0, 0, R.z, R.r, a0 + s0 * TAU, a0 + Math.min(pr, s0 + R.duty / R.dash) * TAU, n, W[0] * I, W[1] * I, W[2] * I, 1);
        }
      } else L.arc(0, 0, R.z, R.r, a0, a0 + TAU * pr, n, W[0] * I, W[1] * I, W[2] * I, 1);
      if (R.ticks) for (let k = 0; k < R.ticks; k++) {
        const s0 = k / R.ticks; if (s0 >= pr) break;
        const a = a0 + s0 * TAU, major = k % R.major === 0, len = R.tickLen * (major ? 2.2 : 1), m = major ? 0.9 : 0.5;
        L.seg(Math.cos(a) * R.r, Math.sin(a) * R.r, R.z, Math.cos(a) * (R.r + len), Math.sin(a) * (R.r + len), R.z, W[0] * I * m, W[1] * I * m, W[2] * I * m, 0.9);
      }
    });
    for (let i = 0; i < 48; i++) {
      const pr = Ease.outCubic(clamp01(g * 1.5 - 0.3 - (i % 4) * 0.05));
      if (pr <= 0) continue;
      const a = i / 48 * TAU + t * 0.01, r0 = 1.18;
      const r1 = i % 4 === 0 ? 3.5 : i % 2 === 0 ? 2.35 : 1.75, re = r0 + (r1 - r0) * pr;
      const I = al * (i % 4 === 0 ? 0.34 : 0.2);
      L.seg(Math.cos(a) * r0, Math.sin(a) * r0, -0.4, Math.cos(a) * re, Math.sin(a) * re, -0.4, G[0] * I, G[1] * I, G[2] * I, 0.8);
    }
    for (let tri = 0; tri < 2; tri++) {
      const pr = Ease.inOutCubic(clamp01(g * 1.4 - 0.45 - tri * 0.2));
      if (pr <= 0) continue;
      const base = tri ? -Math.PI / 2 : Math.PI / 2, rad = 2.05, z = 0.1 - tri * 0.2;
      const I = al * (tri ? 0.2 : 0.42), col = tri ? C : W;
      for (let k = 0; k < 3; k++) {
        const a0 = base + k * TAU / 3 + t * 0.012, a1 = a0 + TAU / 3;
        const x0 = Math.cos(a0) * rad, y0 = Math.sin(a0) * rad, x1 = Math.cos(a1) * rad, y1 = Math.sin(a1) * rad;
        L.seg(x0, y0, z, x0 + (x1 - x0) * pr, y0 + (y1 - y0) * pr, z, col[0] * I, col[1] * I, col[2] * I, 1);
      }
    }
    const lo = al * 0.75 * smoothstep(0.0, 0.4, g);
    EyeGenerator.lids(L, 0.52 * A.open, 0.12, W[0] * lo, W[1] * lo, W[2] * lo, 1.3);
    EyeGenerator.lids(L, 0.52 * A.open * 1.07 + 0.015, 0.16, G[0] * lo * 0.4, G[1] * lo * 0.4, G[2] * lo * 0.4, 0.9);
  }
}
