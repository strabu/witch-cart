/* ============================================================
   WITCH CART - track.js
   Course definitions, spline geometry, surface queries,
   mode-7 ground texture baking and roadside decor scatter.

   Coordinate system: x right, y "down" on the map, z up.
   Travel tangent  T = (tx,ty);  screen-right R = (-ty, tx).
   Signed lateral offset: positive == right of travel direction.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC, U = WC.U, TAU = WC.TAU;

  const STEP = 7;              // world units between centre-line samples
  const GRID_CELL = 128;     // spatial hash cell size (world units)
  const GRIP_G = 1500;       // lateral acceleration budget for AI speed

  WC.SURF = { ROAD: 0, KERB: 1, GRASS: 2, WALL: 3 };

  /* ---------------------------------------------------------
     Courses.  pts normalised 0..100 (y = down on the map).
     hw = road half-width, kerb = rumble strip depth,
     barrier = open run-off before the solid wall.
     --------------------------------------------------------- */
  WC.COURSES = [
    {
      id: 'hex', name: 'HEX HOLLOW', laps: 3,
      pts: [[50, 12], [68, 14], [80, 24], [84, 40], [76, 52], [82, 66], [74, 82], [58, 88],
            [46, 80], [34, 90], [20, 84], [12, 68], [18, 54], [10, 42], [16, 26], [30, 16], [40, 20]],
      hw: 215, kerb: 46, barrier: 110,
      asphalt: ['#5b5570', '#4e4862'], edge: '#efeafc',
      grass: ['#2f7a3d', '#2a6e37'], grassSpeck: ['#3f9150', '#256431'],
      gravel: '#8a6b4a', kerbA: '#e8483f', kerbB: '#f5f2ea',
      sky: { top: '#191038', mid: '#5b3080', low: '#ea7a66', sun: '#ffd166', star: 0.45 },
      fog: '#b87f9a', weather: 'clear', night: 0.30,
      decor: ['tree', 'deadtree', 'mushroom', 'crystal', 'pumpkin', 'lamp', 'fence'],
      crowd: [0.02, 0.44],
      boost: [[0.09, 0.16], [0.53, 0.60], [0.80, 0.86]],
      music: { bpm: 140, key: 0, mode: 'minor', pattern: 0 },
      ai: { skill: 0.90 }
    },
    {
      id: 'coast', name: 'CAULDRON COAST', laps: 3,
      pts: [[22, 20], [44, 12], [66, 16], [82, 30], [86, 50], [74, 62], [82, 78], [62, 90],
            [44, 84], [28, 92], [12, 80], [10, 58], [20, 46], [12, 30]],
      hw: 245, kerb: 50, barrier: 130,
      asphalt: ['#4c6c86', '#415e76'], edge: '#f7fbff',
      grass: ['#d9c58b', '#cfba7d'], grassSpeck: ['#e8d8a8', '#bda874'],
      gravel: '#c2a878', kerbA: '#20538b', kerbB: '#f7f4ea',
      sky: { top: '#0f5aa4', mid: '#57b4e8', low: '#ffe3a8', sun: '#fff8dc', star: 0 },
      fog: '#a9d9f2', weather: 'clear', night: 0,
      decor: ['palm', 'rock', 'crystal', 'mushroom', 'banner', 'lamp', 'fence'],
      crowd: [0.30, 0.74],
      boost: [[0.03, 0.10], [0.36, 0.44], [0.66, 0.72], [0.88, 0.95]],
      music: { bpm: 152, key: 2, mode: 'major', pattern: 1 },
      ai: { skill: 0.93 }
    },
    {
      id: 'grim', name: 'GRIMWOOD GP', laps: 3,
      pts: [[16, 15], [36, 11], [52, 21], [45, 36], [61, 44], [79, 34], [88, 52], [76, 66],
            [84, 82], [64, 91], [50, 79], [36, 91], [18, 84], [12, 64], [25, 52], [13, 34]],
      hw: 180, kerb: 42, barrier: 80,
      asphalt: ['#484b52', '#3e4147'], edge: '#e9e6d8',
      grass: ['#14441f', '#103a1b'], grassSpeck: ['#1d5a29', '#0c2e16'],
      gravel: '#6b5138', kerbA: '#f2d33c', kerbB: '#22201f',
      sky: { top: '#080d12', mid: '#1b382a', low: '#3d6b45', sun: '#b8d8a0', star: 0.75 },
      fog: '#2b4b3a', weather: 'embers', night: 0.55,
      decor: ['tree', 'deadtree', 'mushroom', 'tomb', 'crystal', 'lamp', 'fence'],
      crowd: [0.10, 0.28],
      boost: [[0.20, 0.25], [0.47, 0.53], [0.72, 0.79]],
      music: { bpm: 132, key: 5, mode: 'minor', pattern: 2 },
      ai: { skill: 0.95 }
    },
    {
      id: 'dome', name: 'THUNDER DOME', laps: 4,
      pts: [[50, 10], [70, 12], [84, 24], [88, 42], [78, 52], [88, 64], [78, 80], [58, 90],
            [42, 86], [33, 72], [24, 85], [12, 70], [13, 46], [22, 26], [36, 13]],
      hw: 258, kerb: 54, barrier: 110,
      asphalt: ['#3b3d55', '#33354a'], edge: '#cfe3ff',
      grass: ['#585a78', '#4f5170'], grassSpeck: ['#6a6c8c', '#454766'],
      gravel: '#646080', kerbA: '#e84f9c', kerbB: '#4ce0e8',
      sky: { top: '#06060e', mid: '#241d3d', low: '#5c3a6b', sun: '#dfe9ff', star: 1 },
      fog: '#413b60', weather: 'rain', night: 0.65,
      decor: ['lamp', 'crystal', 'rock', 'banner', 'fence', 'deadtree'],
      crowd: [0.02, 0.52],
      boost: [[0.0, 0.06], [0.25, 0.31], [0.50, 0.56], [0.75, 0.81]],
      music: { bpm: 160, key: 7, mode: 'minor', pattern: 3 },
      ai: { skill: 0.98 }
    }
  ];

  /* ---------------------------------------------------------
     Loop hygiene: push non-adjacent control points apart so the
     track ribbon can never overlap itself, ease the result smooth,
     then scale the whole loop so the barriers stay inside the map.
     --------------------------------------------------------- */
  WC.relaxLoop = function (ctrl, minD, iters) {
    const n = ctrl.length;
    for (let it = 0; it < (iters || 500); it++) {
      let moved = false;
      // separation
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const ring = Math.min(j - i, n - (j - i));
          if (ring < 2) continue;
          let dx = ctrl[j][0] - ctrl[i][0], dy = ctrl[j][1] - ctrl[i][1];
          let d = Math.hypot(dx, dy);
          if (d >= minD) continue;
          if (d < 1e-3) { dx = (i & 1) ? 1 : -1; dy = (j & 1) ? 1 : -1; d = 1.414; }
          const push = (minD - d) * 0.25;
          ctrl[i][0] -= dx / d * push; ctrl[i][1] -= dy / d * push;
          ctrl[j][0] += dx / d * push; ctrl[j][1] += dy / d * push;
          moved = true;
        }
      }
      // ease (keeps the authored shape flowing)
      const cp = ctrl.map(p => [p[0], p[1]]);
      for (let i = 0; i < n; i++) {
        const a = cp[(i + n - 1) % n], b = cp[(i + 1) % n];
        ctrl[i][0] = U.lerp(ctrl[i][0], (a[0] + b[0]) / 2, 0.16);
        ctrl[i][1] = U.lerp(ctrl[i][1], (a[1] + b[1]) / 2, 0.16);
      }
      if (!moved) break;
    }
    return ctrl;
  };

  function fitToWorld(c, ctrl, hw) {
    const dense = WC.spline(ctrl, 12);
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const p of dense) {
      minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
      miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]);
    }
    const pad = (hw || c.hw) + c.kerb + c.barrier + 210;
    const k = Math.min(WC.WORLD / ((maxx - minx) + pad * 2), WC.WORLD / ((maxy - miny) + pad * 2), 1);
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    for (let i = 0; i < ctrl.length; i++) {
      ctrl[i][0] = WC.WORLD / 2 + (ctrl[i][0] - cx) * k;
      ctrl[i][1] = WC.WORLD / 2 + (ctrl[i][1] - cy) * k;
    }
    return ctrl;
  }

  /* Closest approach between genuinely separate parts of the loop.
     A pair only counts when the arc distance cannot be explained by a
     single smooth ribbon curving (arc > 1.6 * straight-line dist). */
  function sampleGap(c, d, hw) {
    const wall = (hw || c.hw) + c.kerb + c.barrier;
    const L = d.length;
    const seg = [];                       // resample by arc length
    for (let i = 0; i < L; i++) {
      const a = d[i], b = d[(i + 1) % L];
      const dd = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t < dd; t += STEP) seg.push([a[0] + (b[0] - a[0]) * (t / dd), a[1] + (b[1] - a[1]) * (t / dd)]);
    }
    const n = seg.length;
    let sep = 1e9, ai = 0, bi = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        const ds = Math.min(j - i, n - (j - i)) * STEP;
        const dd = Math.hypot(seg[i][0] - seg[j][0], seg[i][1] - seg[j][1]);
        if (ds <= dd * 1.6) continue;    // same ribbon, just curving
        if (dd < sep) { sep = dd; ai = i; bi = j; }
      }
    }
    return { sep, ai, bi };
  }

  function buildGeometry(c) {
    const W = WC.WORLD;
    let ctrl = c.pts.map(p => [p[0] * W / 100, p[1] * W / 100]);

    /* Alternate: fit inside the map, separate overlapping sections,
       verify at sample level.  Shrink the road if we ever run out of
       room, so a course can never be built with colliding ribbons. */
    let hw = c.hw, ok = false;
    for (let tryRound = 0; tryRound < 8 && !ok; tryRound++) {
      fitToWorld(c, ctrl, hw);
      WC.relaxLoop(ctrl, (hw + c.kerb) * 2 + 90 + tryRound * 60, 600);
      fitToWorld(c, ctrl, hw);
      const gap = sampleGap(c, WC.spline(ctrl, 14), hw);
      ok = gap.sep >= (hw + c.kerb) * 2 + 46;
      if (!ok && gap.sep < (hw + c.kerb) * 2 + 10) hw = Math.round(hw * 0.93);
    }
    c.hw = hw;
    c.ctrl = ctrl;
    const dense = WC.spline(ctrl, 26);

    // --- uniform arc-length resample -----------------------
    const xs = [], ys = [], tx = [], ty = [], rx = [], ry = [], ss = [];
    let acc = 0, prev = dense[0], need = 0;
    for (let i = 1; i <= dense.length; i++) {
      const p = dense[i % dense.length];
      const seg = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      if (seg < 1e-7) { prev = p; continue; }
      while (need <= seg) {
        const t = need / seg;
        xs.push(prev[0] + (p[0] - prev[0]) * t);
        ys.push(prev[1] + (p[1] - prev[1]) * t);
        ss.push(acc + need);
        need += STEP;
      }
      need -= seg; acc += seg; prev = p;
    }
    if (xs.length > 3 && Math.hypot(xs[xs.length - 1] - xs[0], ys[ys.length - 1] - ys[0]) < STEP * 0.6) {
      xs.pop(); ys.pop(); ss.pop();
    }
    const N = xs.length;
    const len = ss[N - 1] + Math.hypot(xs[0] - xs[N - 1], ys[0] - ys[N - 1]);

    // --- tangents / normals ------------------------------------
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N;
      let dx = xs[b] - xs[a], dy = ys[b] - ys[a];
      const m = Math.hypot(dx, dy) || 1;
      dx /= m; dy /= m;
      tx[i] = dx; ty[i] = dy;
      rx[i] = -dy; ry[i] = dx;
    }
    tx.length = ty.length = rx.length = ry.length = N;

    // --- curvature -> corner speed limit --------------------
    const raw = new Float32Array(N), sm = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N;
      raw[i] = U.angNorm(Math.atan2(ty[b], tx[b]) - Math.atan2(ty[a], tx[a])) / STEP;
    }
    for (let i = 0; i < N; i++) {
      let a = 0, w = 0;
      for (let k = -5; k <= 5; k++) {
        const wk = 1 / (1 + Math.abs(k));
        a += raw[(i + k + N) % N] * wk; w += wk;
      }
      sm[i] = a / w;
    }
    const vlimit = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const k = Math.abs(sm[i]);
      vlimit[i] = k > 1e-5 ? U.clamp(Math.sqrt(GRIP_G / k), 260, 1010) : 1010;
    }

    // --- racing line (apex clipping, smoothed) --------------
    const race = new Float32Array(N);
    for (let i = 0; i < N; i++) race[i] = -U.clamp(sm[i] * 4500, -1, 1) * c.hw * 0.55;
    for (let pass = 0; pass < 4; pass++) {
      const cp = Float32Array.from(race);
      for (let i = 0; i < N; i++) {
        race[i] = (cp[(i + N - 1) % N] + cp[i] * 2 + cp[(i + 1) % N]) / 4;
      }
    }

    // --- boost pads -------------------------------------------
    const boost = new Uint8Array(N);
    (c.boost || []).forEach(z => {
      const a = Math.floor(z[0] * N), b = Math.floor(z[1] * N);
      for (let i = a; i <= b; i++) boost[i % N] = 1;
    });

    // --- spatial hash -----------------------------------------
    const GN = Math.ceil(W / GRID_CELL);
    const heads = new Int32Array(GN * GN).fill(-1);
    const next = new Int32Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      const gx = U.clamp(xs[i] / GRID_CELL | 0, 0, GN - 1);
      const gy = U.clamp(ys[i] / GRID_CELL | 0, 0, GN - 1);
      const k = gy * GN + gx;
      next[i] = heads[k]; heads[k] = i;
    }

    // --- adaptive barrier distance ------------------------------
    // where the loop doubles back the fence moves in so it cannot
    // intersect the other half of the track.
    const g_limit = c.hw + c.kerb, g_wallMax = c.hw + c.kerb + c.barrier;
    const wallArr = new Float32Array(N).fill(g_wallMax);
    let minGap = 1e9;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        let ds = Math.abs(ss[j] - ss[i]); ds = Math.min(ds, len - ds);
        if (ds < g_wallMax * 1.4) continue;
        const d = Math.hypot(xs[i] - xs[j], ys[i] - ys[j]);
        if (d < minGap) minGap = d;
        const w = d * 0.5 - 14;
        if (w < wallArr[i]) wallArr[i] = w;
      }
    }
    for (let i = 0; i < N; i++) wallArr[i] = U.clamp(wallArr[i], g_limit + 26, g_wallMax);
    for (let pass = 0; pass < 6; pass++) {
      const cp = Float32Array.from(wallArr);
      for (let i = 0; i < N; i++) {
        wallArr[i] = (cp[(i + N - 1) % N] + cp[i] * 2 + cp[(i + 1) % N]) / 4;
      }
    }
    c.minGap = minGap;

    c.geo = {
      N, xs, ys, tx, ty, rx, ry, s: ss, len, curv: sm, vlimit, race, boost,
      heads, next, GN, hw: c.hw, kerb: c.kerb, barrier: c.barrier,
      limit: c.hw + c.kerb, wall: g_wallMax, wallArr
    };
    buildDecor(c);
  }

  /* closest approach between non-adjacent parts of the spline */
  function ribbonGap(ctrl, c) {
    return sampleGap(c, WC.spline(ctrl, 10), c.hw);
  }

  /* nearest centre-line sample index */
  function nearest(c, px, py) {
    const g = c.geo, GN = g.GN;
    const gx = U.clamp(px / GRID_CELL | 0, 0, GN - 1);
    const gy = U.clamp(py / GRID_CELL | 0, 0, GN - 1);
    let best = 1e18, bi = 0;
    for (let ring = 1; ring <= 9; ring++) {
      const x0 = Math.max(0, gx - ring), x1 = Math.min(GN - 1, gx + ring);
      const y0 = Math.max(0, gy - ring), y1 = Math.min(GN - 1, gy + ring);
      for (let cy = y0; cy <= y1; cy++) {
        const row = cy * GN;
        for (let cx = x0; cx <= x1; cx++) {
          let i = heads_get(g, row + cx);
          while (i !== -1) {
            const dx = g.xs[i] - px, dy = g.ys[i] - py;
            const dd = dx * dx + dy * dy;
            if (dd < best) { best = dd; bi = i; }
            i = g.next[i];
          }
        }
      }
      if (best < 1e18 && best <= (GRID_CELL * ring) * (GRID_CELL * ring)) break;
    }
    return bi;
  }
  function heads_get(g, k) { return g.heads[k]; }

  const hit = { idx: 0, x: 0, y: 0, d: 0, ad: 0, s: 0, type: 0, surf: 'road', boost: 0,
              tx: 1, ty: 0, rx: 0, ry: 1, wallD: 0 };

  WC.sampleTrack = function (c, px, py) {
    const g = c.geo;
    const i = nearest(c, px, py);
    const dx = px - g.xs[i], dy = py - g.ys[i];
    const lat = dx * g.rx[i] + dy * g.ry[i];
    const ad = Math.abs(lat);
    const wallD = g.wallArr[i];
    hit.idx = i; hit.x = g.xs[i]; hit.y = g.ys[i];
    hit.d = lat; hit.ad = ad; hit.s = g.s[i];
    hit.boost = g.boost[i];
    hit.tx = g.tx[i]; hit.ty = g.ty[i];
    hit.rx = g.rx[i]; hit.ry = g.ry[i];
    hit.wallD = wallD;
    hit.type = ad <= g.hw ? 0 : (ad <= g.limit ? 1 : (ad <= wallD ? 2 : 3));
    hit.surf = ['road', 'kerb', 'grass', 'wall'][hit.type];
    return hit;
  };

  /* world point + frame at (arc length s, lateral offset lat) */
  const tp = { x: 0, y: 0, rx: 0, ry: 0, tx: 0, ty: 0, ang: 0 };
  WC.trackPoint = function (c, s, lat) {
    const g = c.geo;
    let i = Math.floor(s / STEP) % g.N;
    if (i < 0) i += g.N;
    const j = (i + 1) % g.N;
    const segLen = j === 0 ? g.len - g.s[i] : (g.s[j] - g.s[i] || STEP);
    const t = U.clamp01((s - g.s[i]) / segLen);
    let tx2 = U.lerp(g.tx[i], g.tx[j], t), ty2 = U.lerp(g.ty[i], g.ty[j], t);
    const m = Math.hypot(tx2, ty2) || 1; tx2 /= m; ty2 /= m;
    lat = lat || 0;
    tp.x = U.lerp(g.xs[i], g.xs[j], t) + (-ty2) * lat;
    tp.y = U.lerp(g.ys[i], g.ys[j], t) + (tx2) * lat;
    tp.tx = tx2; tp.ty = ty2; tp.rx = -ty2; tp.ry = tx2;
    tp.ang = Math.atan2(ty2, tx2);
    return tp;
  };

  /* ---------------------------------------------------------
     Decor scatter.
     --------------------------------------------------------- */
  function buildDecor(c) {
    const g = c.geo;
    const rng = U.rng(0xC0FFEE + c.pts.length * 7919 + c.hw);
    const list = [];
    const push = (type, x, y, scale, ang) => list.push({ type, x, y, scale: scale || 1, ang: ang || 0 });

    // verge clutter
    for (let i = 0; i < g.N; i += 2) {
      if (rng() > 0.55) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const d = g.wallArr[i] + U.rr(rng, 50, 280);
      const x = g.xs[i] + g.rx[i] * d * side, y = g.ys[i] + g.ry[i] * d * side;
      if (x < 30 || y < 30 || x > WC.WORLD - 30 || y > WC.WORLD - 30) continue;
      push(U.pick(rng, c.decor), x, y, U.rr(rng, 0.8, 1.5), U.rr(rng, -0.25, 0.25));
    }
    // distant backdrop clutter
    for (let i = 0; i < g.N; i += 6) {
      if (rng() > 0.45) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const d = g.wallArr[i] + U.rr(rng, 340, 1000);
      const x = g.xs[i] + g.rx[i] * d * side, y = g.ys[i] + g.ry[i] * d * side;
      if (x < 20 || y < 20 || x > WC.WORLD - 20 || y > WC.WORLD - 20) continue;
      push(U.pick(rng, ['tree', 'deadtree', 'rock', 'crystal']), x, y, U.rr(rng, 1.3, 2.6), 0);
    }
    // solid barrier posts along the wall line
    for (let i = 0; i < g.N; i += 6) {
      const ang = Math.atan2(g.ty[i], g.tx[i]);
      for (const side of [-1, 1]) {
        const d = g.wallArr[i] + 8;
        push('barrier', g.xs[i] + g.rx[i] * d * side, g.ys[i] + g.ry[i] * d * side, 1, ang);
      }
    }
    // grandstands
    for (const cf of c.crowd) {
      const s = cf * g.len;
      const i = Math.floor(s / STEP) % g.N;
      const ang = Math.atan2(g.ty[i], g.tx[i]);
      for (const side of [-1, 1]) {
        const d = g.wallArr[i] + 140;
        push('stand', g.xs[i] + g.rx[i] * d * side, g.ys[i] + g.ry[i] * d * side, 1.2, ang);
      }
    }
    // start gantry
    const a0 = WC.trackPoint(c, 0, 0);
    push('gantry', a0.x, a0.y, 1, a0.ang);
    c.decor = list;
  }

  /* ---------------------------------------------------------
     Bake the ground texture (drawn in world units on a
     TEX x TEX canvas, then read back into Uint32 mips).
     --------------------------------------------------------- */
  WC.bakeTrack = function (c) {
    const T = WC.TEX, TS = WC.TS, g = c.geo, R = WC.WORLD;
    const cv = document.createElement('canvas');
    cv.width = cv.height = T;
    const x = cv.getContext('2d');
    x.setTransform(TS, 0, 0, TS, 0, 0);
    const rnd = U.rng(9001 + c.pts.length * 131);

    const loop = () => {
      x.beginPath();
      x.moveTo(g.xs[0], g.ys[0]);
      for (let i = 1; i < g.N; i++) x.lineTo(g.xs[i], g.ys[i]);
      x.closePath();
    };

    // ground
    x.fillStyle = c.grass[0]; x.fillRect(0, 0, R, R);
    x.globalAlpha = 0.45;
    for (let i = 0; i < 800; i++) {
      x.fillStyle = rnd() < 0.5 ? c.grass[1] : c.grassSpeck[0];
      x.beginPath();
      x.arc(rnd() * R, rnd() * R, U.rr(rnd, 25, 140), 0, TAU);
      x.fill();
    }
    x.globalAlpha = 0.7;
    for (let i = 0; i < 2800; i++) {
      x.fillStyle = rnd() < 0.5 ? c.grassSpeck[1] : c.grassSpeck[0];
      x.fillRect(rnd() * R, rnd() * R, U.rr(rnd, 4, 13), U.rr(rnd, 3, 8));
    }
    x.globalAlpha = 1;

    x.lineJoin = 'round'; x.lineCap = 'round';

    // run-off / gravel apron (follows the adaptive wall line)
    x.lineWidth = g.hw * 2;
    for (let i = 0; i < g.N; i += 4) {
      const w = g.wallArr[i] + 60;
      x.lineWidth = w * 2; x.strokeStyle = c.gravel;
      x.beginPath();
      x.moveTo(g.xs[i], g.ys[i]);
      for (let k = 1; k <= 4 && i + k < g.N; k++) x.lineTo(g.xs[i + k], g.ys[i + k]);
      x.stroke();
    }
    x.globalAlpha = 0.55;
    for (let i = 0; i < g.N; i += 8) {
      const w = g.wallArr[i] - 20;
      x.lineWidth = w * 2; x.strokeStyle = U.rgb(U.shade(U.hex(c.gravel), 0.9));
      x.beginPath();
      x.moveTo(g.xs[i], g.ys[i]);
      for (let k = 1; k <= 8 && i + k < g.N; k++) x.lineTo(g.xs[i + k], g.ys[i + k]);
      x.stroke();
    }
    x.globalAlpha = 1;

    // kerb stripes (asphalt overpaints the middle later)
    const ST = 3;
    x.lineWidth = (g.hw + g.kerb) * 2;
    for (let i = 0; i < g.N; i += ST) {
      x.strokeStyle = (((i / ST) | 0) & 1) ? c.kerbA : c.kerbB;
      x.beginPath();
      x.moveTo(g.xs[i], g.ys[i]);
      for (let k = 1; k <= ST; k++) { const j = (i + k) % g.N; x.lineTo(g.xs[j], g.ys[j]); }
      x.stroke();
    }

    // asphalt + patchwork
    x.lineWidth = g.hw * 2;
    loop(); x.strokeStyle = c.asphalt[0]; x.stroke();
    for (let i = 0; i < g.N; i += 9) {
      x.strokeStyle = (((i / 9) | 0) & 1) ? c.asphalt[1] : c.asphalt[0];
      x.beginPath();
      x.moveTo(g.xs[i], g.ys[i]);
      for (let k = 1; k <= 9 && i + k < g.N; k++) x.lineTo(g.xs[i + k], g.ys[i + k]);
      x.stroke();
    }
    x.globalAlpha = 0.16;
    for (let i = 0; i < g.N; i += 3) {
      if (rnd() > 0.32) continue;
      const lat = U.rr(rnd, -g.hw * 0.8, g.hw * 0.8);
      x.fillStyle = rnd() < 0.5 ? '#000000' : '#ffffff';
      x.beginPath();
      x.ellipse(g.xs[i] + g.rx[i] * lat, g.ys[i] + g.ry[i] * lat, U.rr(rnd, 8, 48), U.rr(rnd, 5, 26), rnd() * 3, 0, TAU);
      x.fill();
    }
    x.globalAlpha = 0.85;

    // painted edge lines
    for (const side of [-1, 1]) {
      x.beginPath();
      for (let i = 0; i <= g.N; i++) {
        const j = i % g.N;
        const px = g.xs[j] + g.rx[j] * (g.hw - 13) * side, py = g.ys[j] + g.ry[j] * (g.hw - 13) * side;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.lineWidth = 12; x.strokeStyle = c.edge; x.stroke();
    }
    x.globalAlpha = 1;

    // centre dashes
    x.lineWidth = 7; x.strokeStyle = c.edge; x.globalAlpha = 0.3;
    for (let i = 0; i < g.N; i += 11) {
      x.beginPath();
      x.moveTo(g.xs[i], g.ys[i]);
      for (let k = 1; k <= 4 && i + k < g.N; k++) x.lineTo(g.xs[i + k], g.ys[i + k]);
      x.stroke();
    }
    x.globalAlpha = 1;

    // boost pads
    x.fillStyle = '#5fe4ff';
    for (let i = 0; i < g.N; i++) {
      if (!g.boost[i] || i % 5) continue;
      const j = (i + 3) % g.N;
      const ang = Math.atan2(g.ty[j], g.tx[j]);
      for (const side of [-0.52, 0.52]) {
        x.save();
        x.translate(g.xs[i] + g.rx[i] * g.hw * side, g.ys[i] + g.ry[i] * g.hw * side);
        x.rotate(ang);
        x.globalAlpha = 0.92;
        U.poly(x, [[-24, -44], [24, 0], [-24, 44], [-8, 0]]);
        x.fill();
        x.restore();
      }
    }
    x.globalAlpha = 1;

    // start / finish chequered band
    {
      const p = WC.trackPoint(c, 0, 0);
      x.save();
      x.translate(p.x, p.y);
      x.rotate(p.ang);
      const cols = 16, rows = 3, dep = 70, wid = g.hw * 2;
      for (let r = 0; r < rows; r++) {
        for (let cix = 0; cix < cols; cix++) {
          x.fillStyle = ((r + cix) & 1) ? '#15141b' : '#f6f4ee';
          x.fillRect(-dep / 2 + r * dep / rows, -wid / 2 + cix * wid / cols, dep / rows + 0.5, wid / cols + 0.5);
        }
      }
      x.restore();
    }

    // soften the map border so the edge never pops
    x.globalAlpha = 1;
    const grd = x.createRadialGradient(R / 2, R / 2, R * 0.28, R / 2, R / 2, R * 0.74);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.6)');
    x.fillStyle = grd; x.fillRect(0, 0, R, R);

    // read back + mips
    const mips = [new Uint32Array(x.getImageData(0, 0, T, T).data.buffer)];
    let src = cv, srcSize = T;
    for (let lvl = 1; lvl <= 2; lvl++) {
      const size = T >> lvl;
      const c2 = document.createElement('canvas');
      c2.width = c2.height = size;
      const x2 = c2.getContext('2d');
      x2.imageSmoothingEnabled = true;
      x2.drawImage(src, 0, 0, srcSize, srcSize, 0, 0, size, size);
      mips.push(new Uint32Array(x2.getImageData(0, 0, size, size).data.buffer));
      src = c2; srcSize = size;
    }
    c.tex = { size: T, mips };
    return c.tex;
  };

  WC.buildCourse = function (c) { if (!c.geo) buildGeometry(c); return c; };
  WC.GRID_CELL = GRID_CELL;
})(typeof window !== 'undefined' ? window : global);
