/* ============================================================
   WITCH CART - particles.js
   Drift smoke, boost flame, wall sparks, grass clods,
   shell explosions, rain / embers.  World-space billboards.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC, U = WC.U, TAU = WC.TAU;

  WC.FX = function (max) {
    this.list = [];
    this.max = max || 460;
    this.rng = U.rng(0x51A3);
  };

  WC.FX.prototype._add = function (p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(p);
    return p;
  };

  WC.FX.prototype.smoke = function (x, y, z, vx, vy, r, col) {
    const g = this.rng;
    if (this.list.length > this.max - 40 && g() > 0.35) return;
    this._add({
      k: 'smoke', x: x, y: y, z: z || 6,
      vx: vx + U.rr(g, -14, 14), vy: vy + U.rr(g, -14, 14), vz: U.rr(g, 5, 18),
      r: (r || 5) * 0.7, gr: 8, gz: -7, life: U.rr(g, 0.22, 0.42), max: 0.42, col: col || '#cfc8dd'
    });
  };

  WC.FX.prototype.flame = function (x, y, z, vx, vy, s) {
    const g = this.rng;
    this._add({
      k: 'flame', x: x, y: y, z: z || 10,
      vx: vx * 0.22 + U.rr(g, -22, 22), vy: vy * 0.22 + U.rr(g, -22, 22), vz: U.rr(g, 12, 34),
      r: 5.5 * (s || 1), gr: 3, gz: -14, life: U.rr(g, 0.14, 0.26), max: 0.26, col: '#ffcf5c'
    });
  };

  WC.FX.prototype.spark = function (x, y, n) {
    const g = this.rng;
    for (let i = 0; i < (n || 8); i++) {
      const a = g() * TAU;
      this._add({
        k: 'spark', x: x, y: y, z: U.rr(g, 12, 40),
        vx: Math.cos(a) * U.rr(g, 60, 320), vy: Math.sin(a) * U.rr(g, 60, 320), vz: U.rr(g, 80, 320),
        r: U.rr(g, 2, 4.5), gr: 0, gz: 900, life: U.rr(g, 0.2, 0.55), max: 0.55, col: g() < 0.5 ? '#fff2b0' : '#ffa32a'
      });
    }
  };

  WC.FX.prototype.grass = function (x, y) {
    const g = this.rng;
    for (let i = 0; i < 3; i++) {
      const a = g() * TAU;
      this._add({
        k: 'clod', x: x, y: y, z: 4,
        vx: Math.cos(a) * U.rr(g, 30, 130), vy: Math.sin(a) * U.rr(g, 30, 130), vz: U.rr(g, 40, 150),
        r: U.rr(g, 3, 6), gr: 0, gz: 900, life: U.rr(g, 0.3, 0.6), max: 0.6, col: g() < 0.5 ? '#3f9150' : '#256431'
      });
    }
  };

  WC.FX.prototype.poof = function (x, y, r) {
    const g = this.rng;
    for (let i = 0; i < 12; i++) {
      const a = g() * TAU, sp = U.rr(g, 60, 260);
      this._add({
        k: 'smoke', x: x, y: y, z: U.rr(g, 8, 36),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: U.rr(g, 30, 120),
        r: U.rr(g, 5, 10) * ((r || 30) / 30), gr: 13, gz: -8, life: U.rr(g, 0.26, 0.5), max: 0.5, col: '#f4ecd8'
      });
    }
  };

  WC.FX.prototype.zapBolt = function (x, y) {
    const g = this.rng;
    for (let i = 0; i < 10; i++) {
      const a = g() * TAU;
      this._add({
        k: 'spark', x: x, y: y, z: 70,
        vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, vz: -U.rr(g, 40, 160),
        r: 3, gr: 0, gz: 700, life: 0.4, max: 0.4, col: '#ffe98a'
      });
    }
  };

  WC.FX.prototype.update = function (dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz -= (p.gz != null ? p.gz : 380) * dt;
      if (p.z < 1) { p.z = 1; p.vz *= -0.32; }
      p.r += (p.gr || 0) * dt;
      if (p.r < 0.4) p.r = 0.4;
    }
  };

  WC.FX.prototype.clear = function () { this.list.length = 0; };

  /* -------------------- weather ---------------------------- */
  WC.Weather = function (kind) {
    this.kind = kind || 'clear';
    this.drops = [];
    this.rng = U.rng(7717);
    const n = this.kind === 'rain' ? 190 : this.kind === 'embers' ? 90 : this.kind === 'clear' ? 0 : 60;
    for (let i = 0; i < n; i++) {
      this.drops.push({
        x: this.rng(), y: this.rng(), z: this.rng(),
        v: U.rr(this.rng, 0.55, 1.5), s: U.rr(this.rng, 0.5, 1.6), ph: this.rng() * TAU
      });
    }
  };

  WC.Weather.prototype.update = function (dt, t) {
    for (const d of this.drops) {
      if (this.kind === 'rain') {
        d.y += d.v * dt * 1.7;
        if (d.y > 1.05) { d.y = -0.08; d.x = this.rng(); }
      } else {
        d.y -= d.v * dt * 0.16;
        d.x += Math.sin(t * 0.8 + d.ph) * 0.04 * dt;
        if (d.y < -0.05) { d.y = 1.04; d.x = this.rng(); }
      }
    }
  };

  WC.Weather.prototype.draw = function (ctx, w, h, horizon) {
    if (!this.drops.length) return;
    if (this.kind === 'rain') {
      ctx.strokeStyle = 'rgba(198,224,255,0.5)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const d of this.drops) {
        const x = d.x * w, y = horizon + d.y * (h - horizon), len = 16 * d.s;
        ctx.moveTo(x, y); ctx.lineTo(x - 3 * d.s, y + len);
      }
      ctx.stroke();
    } else if (this.kind === 'embers' || this.kind === 'snow') {
      const col = this.kind === 'snow' ? 'rgba(255,255,255,0.85)' : 'rgba(255,170,70,0.85)';
      for (const d of this.drops) {
        const x = d.x * w, y = horizon * 0.35 + d.y * (h - horizon * 0.35);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(d.ph + y * 0.05));
        ctx.beginPath(); ctx.arc(x, y, (this.kind === 'snow' ? 2.4 : 1.8) * d.s, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };
})(typeof window !== 'undefined' ? window : global);
