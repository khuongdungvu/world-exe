/* ============================================================================
   5a. L-SYSTEM WORLD TREE
   A stochastic, parametric L-system is rewritten symbol by symbol:
     axiom   [ &(180) /(20) B(l,w,0) ]  I(4,w)  A(l,w,0)
     I(n,w)  → F /(θ) I(n-1, w·0.93)                        trunk internodes
     A(l,w,d)→ F(l,w) [ /(φ+i·360/n) &(δd) A(l·k, w·0.62, d+1) ]×n  (+ leader)
     A(l,w,6)→ F T                                          crown apex → tip
     B(l,w,d)→ F [ /(…) &(…) B(l·k, w·0.6, d+1) ]×n          roots
   The final string is read by a 3D turtle (heading H, left L, up U) with
   controlled noise (tiny frame rotations per sub-segment) and tropism (the
   crown leans to the light, roots sink).  The result is a graph of nodes,
   each storing its path distance from the seed — so growth is a front that
   moves outward along the branches, and DECAY is the same front reversed.
   Thick limbs are drawn as braided strands (organic + mechanical); later the
   tips sprout dendrites and synapses (neural), circuit traces with pads
   (circuitry) and orbits with planets (cosmic); impulses race up the tree.
   ========================================================================== */
class LSystemWorldTree {
  constructor(rng) {
    this.MAXD = 6;
    this.interpret(this.expand(rng, 9), rng);
    this.buildExtras(rng);
  }
  expand(rng, gens) {
    const M = (s, a) => ({ s, a });
    let w = [M('['), M('&', [180]), M('/', [20]), M('B', [0.8, 0.24, 0]), M(']'), M('I', [4, 0.34]), M('A', [1.05, 0.26, 0])];
    for (let g = 0; g < gens; g++) {
      const out = [];
      for (const m of w) {
        const a = m.a;
        if (m.s === 'I') {
          if (a[0] > 0) out.push(M('F', [0.92 + rng.range(-0.1, 0.12), a[1], 0, 0]), M('/', [rng.range(15, 40)]), M('I', [a[0] - 1, a[1] * 0.93]));
        } else if (m.s === 'A') {
          const [l, wd, d] = a;
          if (d >= this.MAXD) { out.push(M('F', [l * 0.8, wd, d, 0]), M('T')); continue; }
          const n = d === 0 ? 4 : (rng.next() < 0.68 ? 2 : 3);
          out.push(M('F', [l, wd, d, 0]));
          const spread = [34, 40, 44, 48, 52, 56, 58][d], rot0 = rng.next() * 360;
          for (let i = 0; i < n; i++)
            out.push(M('['), M('/', [rot0 + i * 360 / n + rng.range(-25, 25)]), M('&', [spread + rng.range(-12, 12)]),
              M('A', [l * rng.range(0.7, 0.86), wd * 0.62, d + 1]), M(']'));
          if (d < 3 && rng.next() < 0.55) out.push(M('/', [rng.range(60, 140)]), M('&', [rng.range(4, 14)]), M('A', [l * 0.78, wd * 0.7, d + 1]));
        } else if (m.s === 'B') {
          const [l, wd, d] = a;
          if (d >= 4) { out.push(M('F', [l * 0.8, wd, d, 1]), M('T')); continue; }
          const n = d === 0 ? 5 : 2;
          out.push(M('F', [l, wd, d, 1]));
          for (let i = 0; i < n; i++)
            out.push(M('['), M('/', [i * 360 / n + rng.range(-30, 30)]), M('&', [(d === 0 ? 55 : 32) + rng.range(-10, 10)]),
              M('B', [l * rng.range(0.72, 0.85), wd * 0.6, d + 1]), M(']'));
        } else out.push(m);
      }
      w = out;
    }
    this.symbols = w.length;
    return w;
  }
  pitch(st, a) { const c = Math.cos(a), s = Math.sin(a), H = st.H, U = st.U;
    st.H = [H[0] * c - U[0] * s, H[1] * c - U[1] * s, H[2] * c - U[2] * s]; st.U = [H[0] * s + U[0] * c, H[1] * s + U[1] * c, H[2] * s + U[2] * c]; }
  yaw(st, a) { const c = Math.cos(a), s = Math.sin(a), H = st.H, L = st.L;
    st.H = [H[0] * c + L[0] * s, H[1] * c + L[1] * s, H[2] * c + L[2] * s]; st.L = [-H[0] * s + L[0] * c, -H[1] * s + L[1] * c, -H[2] * s + L[2] * c]; }
  roll(st, a) { const c = Math.cos(a), s = Math.sin(a), L = st.L, U = st.U;
    st.L = [L[0] * c + U[0] * s, L[1] * c + U[1] * s, L[2] * c + U[2] * s]; st.U = [-L[0] * s + U[0] * c, -L[1] * s + U[1] * c, -L[2] * s + U[2] * c]; }
  interpret(str, rng) {
    this.nodes = [{ p: [0, 0, 0], L: [-1, 0, 0], U: [0, 0, 1], w: 0.34, dist: 0, depth: 0, root: 0, parent: -1, tip: 0 }];
    this.tips = [];
    const st = { p: [0, 0, 0], H: [0, 1, 0], L: [-1, 0, 0], U: [0, 0, 1], dist: 0, node: 0 }, stack = [];
    for (const m of str) {
      switch (m.s) {
        case 'F': this.forward(st, m.a[0], m.a[1], m.a[2], m.a[3], rng); break;
        case '&': this.pitch(st, m.a[0] * DEG); break;
        case '/': this.roll(st, m.a[0] * DEG); break;
        case '[': stack.push({ p: st.p.slice(), H: st.H.slice(), L: st.L.slice(), U: st.U.slice(), dist: st.dist, node: st.node }); break;
        case ']': Object.assign(st, stack.pop()); break;
        case 'T': this.tips.push(st.node); this.nodes[st.node].tip = 1; break;
      }
    }
  }
  forward(st, len, w, depth, root, rng) {
    const n = Math.max(2, Math.round(len / 0.2)), step = len / n;
    for (let i = 0; i < n; i++) {
      this.pitch(st, rng.gauss() * 0.075);                 // controlled noise
      this.yaw(st, rng.gauss() * 0.075);
      const H = st.H;
      const T = root ? [H[0] * 0.6, -1, H[2] * 0.6] : [H[0] * 0.3, 1, H[2] * 0.3];
      const e = root ? 0.07 : depth === 0 ? 0.012 : 0.026 + depth * 0.004;   // tropism
      const nh = V3.norm([H[0] + T[0] * e, H[1] + T[1] * e, H[2] + T[2] * e]);
      const d = V3.dot(st.L, nh);
      st.H = nh;
      st.L = V3.norm([st.L[0] - nh[0] * d, st.L[1] - nh[1] * d, st.L[2] - nh[2] * d]);
      st.U = V3.cross(nh, st.L);
      st.p = [st.p[0] + nh[0] * step, st.p[1] + nh[1] * step, st.p[2] + nh[2] * step];
      st.dist += step;
      this.nodes.push({ p: st.p.slice(), L: st.L.slice(), U: st.U.slice(), w: w * (1 - 0.22 * (i + 1) / n), dist: st.dist, depth, root, parent: st.node, tip: 0 });
      st.node = this.nodes.length - 1;
    }
  }
  buildExtras(rng) {
    const nodes = this.nodes, N = nodes.length;
    this.maxDist = 0; this.maxRootDist = 0;
    for (const n of nodes) { if (n.root) this.maxRootDist = Math.max(this.maxRootDist, n.dist); else this.maxDist = Math.max(this.maxDist, n.dist); }
    this.rnd = new Float32Array(N);
    for (let i = 0; i < N; i++) this.rnd[i] = rng.next();
    this.crownTips = this.tips.filter(i => !nodes[i].root);
    // dendrites (neural transformation of the tips)
    this.dend = [];
    for (const ti of this.tips) {
      const n = nodes[ti], dir = V3.norm(V3.sub(n.p, nodes[n.parent].p));
      const grow = (o, d, len, lvl) => {
        if (lvl > 2) return;
        for (let i = 0, k = lvl === 0 ? 3 : 2; i < k; i++) {
          const rv = V3.norm([rng.gauss(), rng.gauss(), rng.gauss()]);
          const nd = V3.norm(V3.add(d, V3.scale(rv, 0.8)));
          const e = V3.add(o, V3.scale(nd, len * rng.range(0.7, 1.2)));
          this.dend.push({ tip: ti, a: o, b: e, th: rng.next() * 0.55 + lvl * 0.12, lvl, root: n.root });
          grow(e, nd, len * 0.62, lvl + 1);
        }
      };
      grow(n.p, dir, n.root ? 0.15 : 0.24, 0);
    }
    // synapses between neighbouring tips → a neural network
    this.syn = [];
    const ct = this.crownTips;
    for (let a = 0; a < ct.length; a++) {
      let c = 0;
      for (let b = a + 1; b < ct.length && c < 2; b++) {
        const d = V3.len(V3.sub(nodes[ct[a]].p, nodes[ct[b]].p));
        if (d < 0.95 && d > 0.15 && rng.next() < 0.45) { this.syn.push({ a: ct[a], b: ct[b], ph: rng.next(), sp: rng.range(0.5, 1.2) }); c++; }
      }
    }
    // circuit traces (orthogonal / 45° runs ending in pads or vias)
    this.circ = [];
    const cand = [];
    for (let i = 1; i < N; i++) { const n = nodes[i]; if (!n.root && n.depth >= 1 && n.depth <= 3 && !n.tip) cand.push(i); }
    for (let k = 0; k < 42 && cand.length; k++) {
      const i = cand[Math.floor(rng.next() * cand.length)], n = nodes[i];
      const H = V3.norm(V3.sub(n.p, nodes[n.parent].p)), B = n.L, sg = rng.sign();
      const a = rng.range(0.18, 0.42), b = rng.range(0.1, 0.25), c = rng.range(0.15, 0.4);
      const pts = [n.p.slice()];
      let q = n.p.slice();
      const go = (v, l) => { q = V3.add(q, V3.scale(v, l)); pts.push(q.slice()); };
      go(V3.scale(B, sg), a);
      go(V3.norm(V3.add(V3.scale(B, sg), H)), b);
      go(H, c);
      if (rng.next() < 0.5) go(V3.scale(B, -sg), a * 0.5);
      let len = 0;
      for (let j = 1; j < pts.length; j++) len += V3.len(V3.sub(pts[j], pts[j - 1]));
      this.circ.push({ node: i, pts, len, pad: rng.next() < 0.5 ? 0 : 1, th: rng.next() * 0.5, B, H });
    }
    // cosmic orbits around junctions
    this.orb = [];
    const jc = [];
    for (let i = 1; i < N; i++) { const n = nodes[i]; if (!n.root && n.depth >= 2 && n.depth <= 4) jc.push(i); }
    for (let k = 0; k < 24 && jc.length; k++) {
      const nrm = V3.norm([rng.gauss(), rng.gauss(), rng.gauss()]);
      const ax1 = V3.norm(V3.cross(nrm, Math.abs(nrm[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      this.orb.push({ node: jc[Math.floor(rng.next() * jc.length)], r: rng.range(0.12, 0.32), ax1, ax2: V3.cross(nrm, ax1),
        w: rng.range(0.6, 2.0) * rng.sign(), ph: rng.next() * TAU, planets: rng.int(1, 2), th: rng.next() * 0.6 });
    }
    // impulses (root → tip), quantised to 16th notes
    this.sig = [];
    for (let k = 0; k < 56 && ct.length; k++) {
      const path = [];
      let i = ct[Math.floor(rng.next() * ct.length)];
      while (i >= 0) { path.push(i); i = nodes[i].parent; }
      path.reverse();
      this.sig.push({ path, t0: 9.5 + Math.floor(rng.next() * 16) * 0.125, speed: rng.range(5.2, 7.6), period: 2.0 });
    }
    this.dx = new Float32Array(N); this.dy = new Float32Array(N); this.dz = new Float32Array(N);
  }
  /** A: { time, growth 0..1, rootGrowth 0..1, neural 0..1, alpha, decay, sway, signals, bright, wave } */
  draw(L, P, A) {
    const nodes = this.nodes, N = nodes.length, t = A.time, al = A.alpha;
    if (al <= 0.002) return;
    const g = A.growth * this.maxDist, gr = A.rootGrowth * this.maxRootDist;
    const dx = this.dx, dy = this.dy, dz = this.dz, sw = A.sway;
    for (let i = 0; i < N; i++) {
      const p = nodes[i].p, amp = sw * 0.016 * Math.pow(Math.max(0, p[1] - 1.0), 1.25);
      dx[i] = p[0] + amp * Math.sin(t * 0.7 + p[0] * 0.8 + p[2] * 0.5);
      dy[i] = p[1] + amp * 0.3 * Math.sin(t * 0.9 + p[2] * 0.7);
      dz[i] = p[2] + amp * Math.cos(t * 0.55 + p[2] * 0.9 - p[0] * 0.4);
    }
    const W = PAL.white, G = PAL.gray, C = PAL.cyan;
    const STR = [7, 5, 4, 3, 2, 2, 1, 1];
    const bright = A.bright || 1, wave = A.wave || -10;
    for (let i = 1; i < N; i++) {
      const n = nodes[i], pi = n.parent, p = nodes[pi];
      const front = n.root ? gr : g;
      let f = (front - p.dist) / (n.dist - p.dist), fall = 0;
      if (f <= 0) {
        if (!(A.decay > 0) || n.root) continue;
        fall = p.dist - front;
        if (fall > 1.5) continue;
        f = 1;
      }
      if (f > 1) f = 1;
      let x0 = dx[pi], y0 = dy[pi], z0 = dz[pi];
      let x1 = x0 + (dx[i] - x0) * f, y1 = y0 + (dy[i] - y0) * f, z1 = z0 + (dz[i] - z0) * f;
      let I = al * bright * (n.root ? 0.19 : 0.33 - n.depth * 0.024);
      const glow = Math.exp(-(front - n.dist) * (front - n.dist) * 2.5);
      if (!A.decay) I *= 1 + glow * 2.2 * (1 - smoothstep(0.95, 1.0, A.growth));
      I *= 1 + 0.9 * Math.exp(-(n.dist - wave) * (n.dist - wave) * 1.5);
      if (fall > 0) {
        const k = fall * fall * 0.9, r = this.rnd[i];
        x0 += (r - 0.5) * k; x1 += (r - 0.5) * k * 1.3; z0 += (fract(r * 7.7) - 0.5) * k; z1 += (fract(r * 7.7) - 0.5) * k * 1.3;
        y0 -= k * 1.6; y1 -= k * 1.9;
        I *= (1 - fall / 1.5) * 1.4;
      }
      const col = n.root || n.depth >= 5 ? G : W;
      const ns = n.root ? Math.max(1, STR[n.depth] - 2) : STR[n.depth];
      if (ns === 1) { L.seg(x0, y0, z0, x1, y1, z1, col[0] * I, col[1] * I, col[2] * I, 1.0); }
      else {
        const tw0 = p.dist * 2.4, tw1 = (p.dist + (n.dist - p.dist) * f) * 2.4;
        const r0 = p.w * 0.5, r1 = (p.w + (n.w - p.w) * f) * 0.5, Is = I * (1.2 / Math.sqrt(ns));
        for (let s = 0; s < ns; s++) {
          const b0 = s / ns * TAU + tw0, b1 = s / ns * TAU + tw1;
          const c0 = Math.cos(b0) * r0, s0 = Math.sin(b0) * r0, c1 = Math.cos(b1) * r1, s1 = Math.sin(b1) * r1;
          L.seg(x0 + p.L[0] * c0 + p.U[0] * s0, y0 + p.L[1] * c0 + p.U[1] * s0, z0 + p.L[2] * c0 + p.U[2] * s0,
            x1 + n.L[0] * c1 + n.U[0] * s1, y1 + n.L[1] * c1 + n.U[1] * s1, z1 + n.L[2] * c1 + n.U[2] * s1,
            col[0] * Is, col[1] * Is, col[2] * Is, 0.9);
        }
      }
      if (f < 1 && !A.decay) P.pt(x1, y1, z1, W[0] * I * 3, W[1] * I * 3, W[2] * I * 3, 2.2, SH_SOFT); // growing tip
    }
    const m = A.neural;
    if (m > 0.001) this.drawNeural(L, P, A, g, gr, m);
    if (A.signals > 0) this.drawSignals(L, P, A, g);
  }
  drawNeural(L, P, A, g, gr, m) {
    const nodes = this.nodes, dx = this.dx, dy = this.dy, dz = this.dz, t = A.time, al = A.alpha * (A.bright || 1);
    const W = PAL.white, G = PAL.gray, C = PAL.cyan;
    for (const d of this.dend) {
      const tn = nodes[d.tip];
      if ((tn.root ? gr : g) < tn.dist) continue;
      const pr = clamp01((m - d.th) / 0.35);
      if (pr <= 0) continue;
      const ox = dx[d.tip] - tn.p[0], oy = dy[d.tip] - tn.p[1], oz = dz[d.tip] - tn.p[2];
      const ax = d.a[0] + ox, ay = d.a[1] + oy, az = d.a[2] + oz;
      const bx = ax + (d.b[0] - d.a[0]) * pr, by = ay + (d.b[1] - d.a[1]) * pr, bz = az + (d.b[2] - d.a[2]) * pr;
      const I = al * (0.22 - d.lvl * 0.05) * (d.root ? 0.6 : 1), col = d.lvl === 2 ? C : W;
      L.seg(ax, ay, az, bx, by, bz, col[0] * I, col[1] * I, col[2] * I, 0.75);
      if (d.lvl === 2 && pr >= 1) P.pt(bx, by, bz, W[0] * I * 2.6, W[1] * I * 2.6, W[2] * I * 2.6, 1.6, SH_SOFT);
    }
    for (const s of this.syn) {
      const a = s.a, b = s.b;
      if (g < nodes[a].dist || g < nodes[b].dist) continue;
      const I = al * 0.17 * m;
      L.seg(dx[a], dy[a], dz[a], dx[b], dy[b], dz[b], C[0] * I, C[1] * I, C[2] * I, 0.7);
      const u = fract(t * s.sp + s.ph), J = I * 5;
      P.pt(lerp(dx[a], dx[b], u), lerp(dy[a], dy[b], u), lerp(dz[a], dz[b], u), C[0] * J, C[1] * J, C[2] * J, 1.8, SH_SOFT);
    }
    for (const c of this.circ) {
      const n = nodes[c.node];
      if (g < n.dist) continue;
      const pr = clamp01((m - c.th) / 0.4);
      if (pr <= 0) continue;
      const ox = dx[c.node] - n.p[0], oy = dy[c.node] - n.p[1], oz = dz[c.node] - n.p[2];
      let budget = c.len * pr;
      const I = al * 0.24;
      let ex = 0, ey = 0, ez = 0;
      for (let j = 1; j < c.pts.length && budget > 0; j++) {
        const a = c.pts[j - 1], b = c.pts[j], l = V3.len(V3.sub(b, a)), u = Math.min(1, budget / l);
        budget -= l;
        ex = a[0] + (b[0] - a[0]) * u + ox; ey = a[1] + (b[1] - a[1]) * u + oy; ez = a[2] + (b[2] - a[2]) * u + oz;
        L.seg(a[0] + ox, a[1] + oy, a[2] + oz, ex, ey, ez, G[0] * I, G[1] * I, G[2] * I, 0.85);
      }
      if (pr >= 1) {
        const s = 0.035, B = c.B, H = c.H, J = I * 1.6;
        if (c.pad) {
          const q = (u, v) => [ex + (B[0] * u + H[0] * v) * s, ey + (B[1] * u + H[1] * v) * s, ez + (B[2] * u + H[2] * v) * s];
          const k = [q(-1, -1), q(1, -1), q(1, 1), q(-1, 1)];
          for (let j = 0; j < 4; j++) { const a = k[j], b = k[(j + 1) % 4]; L.seg(a[0], a[1], a[2], b[0], b[1], b[2], W[0] * J, W[1] * J, W[2] * J, 0.9); }
        } else P.pt(ex, ey, ez, W[0] * J * 0.9, W[1] * J * 0.9, W[2] * J * 0.9, 4.0, SH_RING);
      }
    }
    for (const o of this.orb) {
      const n = nodes[o.node];
      if (g < n.dist) continue;
      const pr = clamp01((m - o.th) / 0.4);
      if (pr <= 0) continue;
      const cx = dx[o.node], cy = dy[o.node], cz = dz[o.node], I = al * 0.16 * pr;
      let px = cx + o.ax1[0] * o.r, py = cy + o.ax1[1] * o.r, pz = cz + o.ax1[2] * o.r;
      for (let k = 1; k <= 28; k++) {
        const a = k / 28 * TAU * pr, c = Math.cos(a) * o.r, s = Math.sin(a) * o.r;
        const x = cx + o.ax1[0] * c + o.ax2[0] * s, y = cy + o.ax1[1] * c + o.ax2[1] * s, z = cz + o.ax1[2] * c + o.ax2[2] * s;
        L.seg(px, py, pz, x, y, z, G[0] * I, G[1] * I, G[2] * I, 0.7);
        px = x; py = y; pz = z;
      }
      for (let k = 0; k < o.planets; k++) {
        const a = o.ph + t * o.w + k * Math.PI, c = Math.cos(a) * o.r, s = Math.sin(a) * o.r, J = I * 5;
        P.pt(cx + o.ax1[0] * c + o.ax2[0] * s, cy + o.ax1[1] * c + o.ax2[1] * s, cz + o.ax1[2] * c + o.ax2[2] * s, W[0] * J, W[1] * J, W[2] * J, 2.0, SH_SOFT);
      }
    }
  }
  drawSignals(L, P, A, g) {
    const nodes = this.nodes, dx = this.dx, dy = this.dy, dz = this.dz, t = A.time, W = PAL.white, C = PAL.cyan;
    const al = A.alpha * A.signals * (A.bright || 1);
    for (const s of this.sig) {
      const tt = t - s.t0;
      if (tt < 0) continue;
      const path = s.path, d = (tt % s.period) * s.speed;
      if (d > nodes[path[path.length - 1]].dist || d > g) continue;
      let lo = 0, hi = path.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (nodes[path[mid]].dist <= d) lo = mid; else hi = mid; }
      const a = path[lo], b = path[hi], da = nodes[a].dist, db = nodes[b].dist, u = clamp01((d - da) / (db - da + 1e-6));
      const hx = lerp(dx[a], dx[b], u), hy = lerp(dy[a], dy[b], u), hz = lerp(dz[a], dz[b], u);
      const I = al * 1.1;
      P.pt(hx, hy, hz, W[0] * I * 2.4, W[1] * I * 2.4, W[2] * I * 2.4, 2.6, SH_SOFT);
      L.seg(dx[a], dy[a], dz[a], hx, hy, hz, W[0] * I * 0.8, W[1] * I * 0.8, W[2] * I * 0.8, 1.2);
      const pa = nodes[a].parent;
      if (pa >= 0) L.seg(dx[pa], dy[pa], dz[pa], dx[a], dy[a], dz[a], C[0] * I * 0.35, C[1] * I * 0.35, C[2] * I * 0.35, 1.0);
    }
  }
}

/* ============================================================================
   5b. SYMBOL ENGINE — twelve glyphs invented by a small grammar
   base shape (circle, triangles, square, vesica piscis, crescent, hexagon…)
   + stem (vertical, foot-cross, arrow, horns, bar) + inner mark + satellites.
   They resemble alchemical / planetary signs without being any of them.
   ========================================================================== */
class SymbolEngine {
  constructor(rng) {
    this.glyphs = [];
    const seen = new Set();
    for (let guard = 0; this.glyphs.length < 12 && guard < 800; guard++) {
      const base = rng.pick(['circle', 'circle', 'tri', 'triDown', 'square', 'diamond', 'vesica', 'crescent', 'semi', 'hex', 'none']);
      const stem = rng.pick(['none', 'none', 'vert', 'cross', 'arrow', 'horns', 'foot', 'bar']);
      const inner = rng.pick(['none', 'dot', 'ring', 'hbar', 'tri', 'dots3', 'vbar']);
      const sat = rng.pick(['none', 'none', 'dots2', 'ticks', 'orbit']);
      if (base === 'none' && (stem === 'none' || inner === 'none')) continue;
      const sig = base + stem + inner + sat, shape = base + stem;
      if (seen.has(sig) || seen.has(shape)) continue;
      seen.add(sig); seen.add(shape);
      this.glyphs.push(this.build(base, stem, inner, sat));
    }
  }
  build(base, stem, inner, sat) {
    const S = [];
    const circ = (cx, cy, r, a0 = 0, a1 = TAU, n = 36) => { const s = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; s.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } S.push(s); };
    const poly = (n, r, rot) => { const s = []; for (let i = 0; i <= n; i++) { const a = rot + i * TAU / n; s.push([Math.cos(a) * r, Math.sin(a) * r]); } S.push(s); };
    const line = (x0, y0, x1, y1) => S.push([[x0, y0], [x1, y1]]);
    switch (base) {
      case 'circle': circ(0, 0, 0.62); break;
      case 'tri': poly(3, 0.72, Math.PI / 2); break;
      case 'triDown': poly(3, 0.72, -Math.PI / 2); break;
      case 'square': poly(4, 0.7, Math.PI / 4); break;
      case 'diamond': poly(4, 0.74, 0); break;
      case 'vesica': circ(-0.24, 0, 0.5); circ(0.24, 0, 0.5); break;
      case 'crescent': circ(0, 0, 0.62, Math.PI * 0.28, Math.PI * 1.72); circ(0.3, 0, 0.5, Math.PI * 0.47, Math.PI * 1.53); break;
      case 'semi': circ(0, -0.12, 0.62, 0, Math.PI); line(-0.62, -0.12, 0.62, -0.12); break;
      case 'hex': poly(6, 0.66, 0); break;
    }
    switch (stem) {
      case 'vert': line(0, -0.98, 0, 0.98); break;
      case 'cross': line(0, -0.62, 0, -1.02); line(-0.2, -0.84, 0.2, -0.84); break;
      case 'arrow': line(0.44, 0.44, 0.92, 0.92); line(0.92, 0.92, 0.58, 0.92); line(0.92, 0.92, 0.92, 0.58); break;
      case 'horns': circ(0, 0.98, 0.34, Math.PI * 1.08, Math.PI * 1.92, 18); break;
      case 'foot': line(-0.5, -0.98, 0.5, -0.98); line(0, -0.62, 0, -0.98); break;
      case 'bar': line(-0.98, 0, 0.98, 0); break;
    }
    switch (inner) {
      case 'dot': circ(0, 0, 0.07, 0, TAU, 10); break;
      case 'ring': circ(0, 0, 0.26); break;
      case 'hbar': line(-0.3, 0, 0.3, 0); break;
      case 'tri': poly(3, 0.26, Math.PI / 2); break;
      case 'dots3': for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + i * TAU / 3; circ(Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0.05, 0, TAU, 8); } break;
      case 'vbar': line(0, -0.3, 0, 0.3); break;
    }
    switch (sat) {
      case 'dots2': circ(-0.86, 0.76, 0.05, 0, TAU, 8); circ(0.86, 0.76, 0.05, 0, TAU, 8); break;
      case 'ticks': for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + TAU / 16; line(Math.cos(a) * 0.84, Math.sin(a) * 0.84, Math.cos(a) * 0.98, Math.sin(a) * 0.98); } break;
      case 'orbit': circ(0, 0, 0.92, -0.45, 1.45, 24); break;
    }
    let len = 0;
    for (const s of S) for (let i = 1; i < s.length; i++) len += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    return { strokes: S, len };
  }
  drawGlyph(L, k, cx, cy, z, sz, pr, r, g, b, w = 1.1) {
    const G = this.glyphs[k % this.glyphs.length];
    let budget = G.len * pr;
    for (const s of G.strokes) {
      for (let i = 1; i < s.length; i++) {
        if (budget <= 0) return;
        const x0 = s[i - 1][0], y0 = s[i - 1][1], x1 = s[i][0], y1 = s[i][1];
        const l = Math.hypot(x1 - x0, y1 - y0), u = Math.min(1, budget / l);
        budget -= l;
        L.seg(cx + x0 * sz, cy + y0 * sz, z, cx + (x0 + (x1 - x0) * u) * sz, cy + (y0 + (y1 - y0) * u) * sz, z, r, g, b, w);
      }
    }
  }
  /** the wheel of twelve (local frame).  A: { alpha, R, size, ringPr, pr[12], pulse, rot, shatter, flicker, seed } */
  draw(L, P, t, A) {
    const al = A.alpha;
    if (al <= 0.002) return;
    const W = PAL.white, G = PAL.gray, R = A.R, sz = A.size, rp = A.ringPr;
    if (rp > 0) {
      const I = al * (0.3 + 0.35 * A.pulse);
      L.arc(0, 0, 0, R + sz * 1.5, Math.PI / 2, Math.PI / 2 - TAU * rp, 300, W[0] * I, W[1] * I, W[2] * I, 1);
      L.arc(0, 0, 0, R - sz * 1.5, Math.PI / 2, Math.PI / 2 - TAU * rp, 240, G[0] * I, G[1] * I, G[2] * I, 0.9);
      L.arc(0, 0, 0, R + sz * 1.62, Math.PI / 2, Math.PI / 2 - TAU * rp, 300, G[0] * I * 0.5, G[1] * I * 0.5, G[2] * I * 0.5, 0.8);
      for (let k = 0; k < 72; k++) {
        if (k / 72 > rp) break;
        const a = Math.PI / 2 - k / 72 * TAU + A.rot, r0 = R + sz * 1.5, r1 = r0 + (k % 6 === 3 ? sz * 0.45 : sz * 0.12);
        L.seg(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0, G[0] * I, G[1] * I, G[2] * I, 0.8);
      }
    }
    for (let k = 0; k < 12; k++) {
      const pr = A.pr[k];
      if (pr <= 0) continue;
      const ang = Math.PI / 2 - k * TAU / 12 + A.rot;
      let cx = Math.cos(ang) * R, cy = Math.sin(ang) * R;
      if (A.shatter > 0) {
        const s = A.shatter * (0.5 + rand1(k, 21));
        cx += Math.cos(ang) * s * 2 + (rand1(k, 22) - 0.5) * s; cy += Math.sin(ang) * s * 2 + (rand1(k, 23) - 0.5) * s;
      }
      const sc = sz * (1 + 0.22 * A.pulse);
      let I = al * (0.7 + 1.7 * A.pulse) * (1 + (1 - pr) * 1.5);
      if (A.flicker > 0 && rand1(k + A.seed * 13, 24) < A.flicker) I *= 0.08;
      L.arc(cx, cy, 0, sc * 1.25, ang + Math.PI, ang + Math.PI + TAU * pr, 44, G[0] * I * 0.36, G[1] * I * 0.36, G[2] * I * 0.36, 0.9);
      this.drawGlyph(L, k, cx, cy, 0, sc * 0.9, pr, W[0] * I * 0.85, W[1] * I * 0.85, W[2] * I * 0.85, 1.2);
      if (pr >= 1) {
        const J = I * 0.12;
        L.seg(Math.cos(ang) * (R - sz * 1.5), Math.sin(ang) * (R - sz * 1.5), 0, Math.cos(ang) * R * 0.18, Math.sin(ang) * R * 0.18, 0, G[0] * J, G[1] * J, G[2] * J, 0.7);
        P.pt(cx, cy, 0, W[0] * I * 0.5, W[1] * I * 0.5, W[2] * I * 0.5, 2.0 + 3 * A.pulse, SH_SOFT);
      }
    }
  }
}
