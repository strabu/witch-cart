/* ============================================================
   WITCH CART - util.js
   Math helpers, RNG, colours, packed-pixel helpers.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC = global.WC || {};
  const TAU = Math.PI * 2;
  WC.TAU = TAU;

  /* World: the baked ground texture covers WORLD x WORLD units. */
  WC.WORLD = 4096;
  WC.TEX = 1024;                      // ground texture resolution
  WC.TS = WC.TEX / WC.WORLD;         // texels per world unit

  const U = WC.U = {
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    inv(a, b, v) { return b === a ? 0 : (v - a) / (b - a); },
    smooth(t) { return t * t * (3 - 2 * t); },
    // frame-rate independent exponential smoothing
    damp(a, b, rate, dt) { return U.lerp(a, b, 1 - Math.exp(-rate * dt)); },
    angNorm(a) {
      a %= TAU;
      if (a > Math.PI) a -= TAU;
      else if (a < -Math.PI) a += TAU;
      return a;
    },
    angTo(target, cur, maxStep) {
      const d = U.angNorm(target - cur);
      if (d > maxStep) return maxStep;
      if (d < -maxStep) return -maxStep;
      return d;
    },
    sgn(v) { return v < 0 ? -1 : 1; },

    /* deterministic RNG (mulberry32) */
    rng(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    rr(rng, a, b) { return a + rng() * (b - a); },
    ri(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); },
    pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; },

    /* ---- colour ---- */
    hex(h) {
      h = h.replace('#', '');
      return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
    },
    rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; },
    rgb(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; },
    shade(c, k) {
      return [U.clamp(c[0] * k, 0, 255), U.clamp(c[1] * k, 0, 255), U.clamp(c[2] * k, 0, 255)];
    },
    mix(c1, c2, t) {
      return [U.lerp(c1[0], c2[0], t), U.lerp(c1[1], c2[1], t), U.lerp(c1[2], c2[2], t)];
    },

    /* ---- packed pixels (Canvas ImageData, little-endian ABGR) ---- */
    LE: (function () {
      const b = new ArrayBuffer(4);
      new Uint32Array(b)[0] = 0x11223344;
      return new Uint8Array(b)[0] === 0x44;
    })(),
    pack(c, a) {
      if (a === undefined) a = 255;
      if (U.LE) return ((a << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
      return ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | a) >>> 0;
    },
    packRGB(r, g, b, a) {
      if (a === undefined) a = 255;
      if (U.LE) return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
      return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
    },
    unpackR(p) { return U.LE ? (p & 255) : ((p >>> 24) & 255); },
    unpackG(p) { return (p >>> 8) & 255; },
    unpackB(p) { return U.LE ? ((p >>> 16) & 255) : (p & 255); },

    /* blend packed pixel src over packed pixel dst (src alpha 0..255 in .a) */
    fmt(n, pad) {
      let s = n.toFixed(2);
      if (pad) while (s.length < pad) s = ' ' + s;
      return s;
    },
    time(sec) {
      if (!isFinite(sec) || sec < 0) return '--:--.--';
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60), c = Math.floor((sec * 100) % 100);
      return m + ':' + (s < 10 ? '0' + s : s) + '.' + (c < 10 ? '0' + c : c);
    },

    /* rounded-rect path */
    rrect(ctx, x, y, w, h, r) {
      r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    },
    ellipse(ctx, x, y, rx, ry, rot) {
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    },
    poly(ctx, pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    }
  };

  /* ---------------- Catmull-Rom spline (closed loop) ---------------- */
  WC.spline = function (pts, samplesPerSeg) {
    const n = pts.length, out = [];
    const S = samplesPerSeg || 12;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let j = 0; j < S; j++) {
        const t = j / S, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    return out;
  };

  /* distance from point to segment ab -> {t, d, px, py} */
  WC.segDist = function (px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const wx = px - ax, wy = py - ay;
    const vv = vx * vx + vy * vy;
    let t = vv > 1e-9 ? (wx * vx + wy * vy) / vv : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + vx * t, cy = ay + vy * t;
    const dx = px - cx, dy = py - cy;
    return { t: t, d: Math.sqrt(dx * dx + dy * dy), px: cx, py: cy };
  };
})(typeof window !== 'undefined' ? window : global);
