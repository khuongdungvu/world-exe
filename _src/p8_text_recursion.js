
/* ============================================================================
   8a. TEXT OVERLAY SYSTEM — a 5×7 dot-matrix font defined as bit rows.
   No system fonts: every lit bit becomes a square point sprite in screen
   space, so text glows, glitches and finally dissolves into particles like
   everything else in the film.
   ========================================================================== */
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15],
  I: [14, 4, 4, 4, 4, 4, 14], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], '_': [0, 0, 0, 0, 0, 0, 31], '>': [8, 4, 2, 1, 2, 4, 8],
  '?': [14, 17, 1, 2, 4, 0, 4], '%': [24, 25, 2, 4, 8, 19, 3], '-': [0, 0, 0, 31, 0, 0, 0],
};
const GLYPHS = Object.keys(FONT).filter(k => k !== ' ');
/* The words of the film.  t = first character, end = hard cut, cps = typing
   speed.  The soundtrack schedules one key-click per character from this table. */
const TEXT_CUES = [
  { t: 15.05, end: 16.0, lines: ['WORLD', 'INITIALIZED'], cps: 38, y: 0.5, bar: true },
  { t: 16.05, end: 17.0, lines: ['LIFE', 'INITIALIZED'], cps: 38, y: 0.5 },
  { t: 17.05, end: 18.0, lines: ['CONSCIOUSNESS', 'INITIALIZING...'], cps: 40, y: 0.5 },
  { t: 20.0, end: 21.9, lines: ['ERROR', '', 'GOD_PROCESS', 'NOT FOUND'], cps: 60, y: 0.17, red: true },
  { t: 25.0, end: 28.0, lines: ['RESTART WORLD?'], cps: 30, menu: true },
  { t: 28.85, end: 30.0, lines: ['WORLD.EXE', 'RUNNING...'], cps: 44, y: 0.8 },
];

class TextOverlaySystem {
  constructor() { this.px = 4; }
  layout(W, H) { this.px = Math.max(2, Math.round(H * 0.0047)); }
  /** one glyph at top-left (x,y); inv = inverted 7×9 block (selection, cursor);
      collect = array → gather pixel centres instead of drawing */
  glyph(P, ch, x, y, px, col, a, collect, inv) {
    const rows = FONT[ch] || FONT['?'], sz = px * 0.84;
    for (let r = inv ? -1 : 0; r < (inv ? 8 : 7); r++) {
      for (let c = inv ? -1 : 0; c < (inv ? 6 : 5); c++) {
        const on = r >= 0 && r < 7 && c >= 0 && c < 5 && (rows[r] & (16 >> c)) !== 0;
        if (on === !!inv) continue;
        const X = x + (c + 0.5) * px, Y = y + (r + 0.5) * px;
        if (collect) collect.push(X, Y);
        else P.pt(X, Y, -1, col[0] * a, col[1] * a, col[2] * a, sz, SH_SQUARE);
      }
    }
  }
  /** lines centred on (o.x, o.y) unless o.left / o.top; o.reveal types the text;
      o.corrupt / o.jitter break it.  Returns the next character slot (cursor). */
  block(P, lines, o) {
    const px = this.px, adv = 7 * px, lh = 12 * px;
    const wmax = Math.max(1, ...lines.map(l => l.length)) * adv - 2 * px;
    const x0 = o.left ? o.x : o.x - wmax / 2, y0 = o.top ? o.y : o.y - (lines.length * lh - 5 * px) / 2;
    const a = o.alpha === undefined ? 1 : o.alpha, seed = o.seed || 0;
    let budget = o.reveal === undefined ? 1e9 : o.reveal, nx = x0, ny = y0;
    for (let li = 0; li < lines.length; li++) {
      const s = lines[li], col = (o.colors && o.colors[li]) || PAL.white, gy = y0 + li * lh;
      for (let ci = 0; ci < s.length && budget > 0; ci++, budget--) {
        let ch = s[ci], gx = x0 + ci * adv;
        if (o.corrupt && ch !== ' ' && rand1(li * 97 + ci * 13 + seed * 131, 61) < o.corrupt) ch = GLYPHS[Math.floor(rand1(ci * 7 + seed * 3, 62) * GLYPHS.length)];
        if (o.jitter) gx += (rand1(li * 31 + ci + seed * 17, 63) - 0.5) * o.jitter * px * 6;
        this.glyph(P, ch, gx, gy, px, col, a, o.collect);
        nx = x0 + (ci + 1) * adv; ny = gy;
      }
    }
    return { x: nx, y: ny, x0, y0 };
  }
}

/* ============================================================================
   8b. RECURSION ENGINE — the final pull-back.
   World k+1 holds world k in one of its nodes (the "slot" at p, scale s,
   turned by φ).  Zooming out about the FIXED POINT c = (I − s·R(φ))⁻¹·p of
   that similarity makes every level identical at integer zoom u: an endless
   regress.  Level transforms reach ~10⁵× scale, so they are composed in
   double precision on the CPU and handed to the batches as 2D similarities.
   ========================================================================== */
class RecursionEngine {
  constructor(geo) {
    this.geo = geo; this.s = 0.075; this.phi = 0.55;
    this.p = [Math.cos(0.62) * 0.64, Math.sin(0.62) * 0.64];
    const cs = Math.cos(this.phi) * this.s, sn = Math.sin(this.phi) * this.s, det = (1 - cs) * (1 - cs) + sn * sn;
    this.c = [((1 - cs) * this.p[0] - sn * this.p[1]) / det, (sn * this.p[0] + (1 - cs) * this.p[1]) / det];
  }
  view(u) {           // level-0 → view: zoom s^u, rotation φu, centre drifting onto the fixed point
    const w = smoothstep(0, 0.85, u);
    return { z: Math.pow(this.s, u), rot: this.phi * u, cx: this.c[0] * w, cy: this.c[1] * w };
  }
  particleXf(u) {     // the same transform for the GPU particles (they live in level-0 space)
    const V = this.view(u), a = V.z * Math.cos(V.rot), b = V.z * Math.sin(V.rot);
    return [a, b, -(a * V.cx - b * V.cy), -(b * V.cx + a * V.cy)];
  }
  draw(L, P, T, u) {
    const V = this.view(u), cr = Math.cos(V.rot), sr = Math.sin(V.rot), s = this.s;
    const cp = Math.cos(-this.phi), sp = Math.sin(-this.phi);
    let zx = 0, zy = 0;   // centre of level k in level-0 coordinates: z_k = R(−φ)(z_{k−1} − p) / s
    for (let k = 0; k <= Math.floor(u) + 2; k++) {
      if (k > 0) { const dx = zx - this.p[0], dy = zy - this.p[1]; zx = (cp * dx - sp * dy) / s; zy = (sp * dx + cp * dy) / s; }
      const sc = Math.pow(s, u - k);
      if (sc < 0.004 || sc > 40) continue;
      const vx = V.z * (cr * (zx - V.cx) - sr * (zy - V.cy)), vy = V.z * (sr * (zx - V.cx) + cr * (zy - V.cy));
      L.setXform2D(vx, vy, sc, this.phi * (u - k));
      P.setXform2D(vx, vy, sc, this.phi * (u - k));
      this.level(L, P, T, k, sc, smoothstep(0.004, 0.03, sc) * (1 - smoothstep(10, 40, sc)) * (k === 0 ? 1 : smoothstep(k - 0.95, k - 0.45, u)));   // a larger world is revealed only when the pull-back reaches it
    }
    L.resetXform(); P.resetXform();
  }
  level(L, P, T, k, sc, al) {
    if (al < 0.003) return;
    const W = PAL.white, G = PAL.gray, geo = this.geo;
    if (k === 0) geo.draw(L, P, T < 28.6 ? 1.0 + (T - 28.0) * 5.1 : 4.06 + (T - 28.6) * 0.6, { alpha: al });   // the world regenerates (fast replay of 1–4 s)
    else if (sc > 0.05) geo.draw(L, P, 4.4 + k * 1.37 + (T - 28) * 0.3, { alpha: al * 0.85, figAlpha: sc > 0.15 ? 0.8 : 0, ringAlpha: i => ((i + k) % 3 === 0 ? 0.25 : 1) });
    else for (const r of [0.38, 0.63, 1.0]) L.arc(0, 0, 0, r, 0, TAU, 48, W[0] * al * 0.5, W[1] * al * 0.5, W[2] * al * 0.5, 1);
    const ga = al * (k === 0 ? smoothstep(28.35, 28.6, T) : 1);
    if (ga < 0.003) return;
    const e = 0.2, h = 0.5, R = (1 + h * h) / (2 * h), c = R - h, th = Math.atan2(c, 1), I = ga * 0.6;   // every world has an eye
    L.arc(0, -c * e, 0, R * e, th, Math.PI - th, 120, W[0] * I, W[1] * I, W[2] * I, 1);
    L.arc(0, c * e, 0, R * e, -th, -(Math.PI - th), 120, W[0] * I, W[1] * I, W[2] * I, 1);
    L.arc(0, 0, 0, 0.42 * e, 0, TAU, 40, W[0] * I, W[1] * I, W[2] * I, 1);
    L.arc(0, 0, 0, 0.16 * e, 0, TAU, 24, W[0] * I * 1.5, W[1] * I * 1.5, W[2] * I * 1.5, 1);
    const sx = this.p[0], sy = this.p[1], rr = this.s * 1.3, J = ga * 0.5;                              // …and a slot holding a smaller world
    L.arc(sx, sy, 0, rr, 0, TAU, 40, G[0] * J, G[1] * J, G[2] * J, 0.9);
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI / 2;
      L.seg(sx + Math.cos(a) * rr * 1.15, sy + Math.sin(a) * rr * 1.15, 0, sx + Math.cos(a) * rr * 1.7, sy + Math.sin(a) * rr * 1.7, 0, G[0] * J, G[1] * J, G[2] * J, 0.9);
    }
    if (k === 0) P.pt(sx, sy, 0, W[0] * ga * 2, W[1] * ga * 2, W[2] * ga * 2, 3, SH_GLINT);
  }
}
