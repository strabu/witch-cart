/* ============================================================
   WITCH CART - items.js
   Item boxes, weighted draws by standing, usable items and
   the projectile / hazard entities they spawn.
   Pure logic - no DOM.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC, U = WC.U, TAU = WC.TAU;

  /* rank band -> weights [mushroom, shell, redshell, banana, hex, star] */
  const TABLE = [
    [0.20, [34, 20, 10, 16, 14, 6]],
    [0.45, [30, 22, 16, 14, 12, 6]],
    [0.70, [22, 20, 20, 16, 16, 6]],
    [0.90, [12, 14, 26, 18, 22, 8]],
    [1.01, [6, 8, 22, 20, 30, 14]]
  ];
  const KINDS = ['mushroom', 'shell', 'redshell', 'banana', 'hex', 'star'];

  WC.Items = {
    KINDS: KINDS,
    ents: [],
    boxes: [],

    reset: function (c) {
      this.ents.length = 0;
      for (const b of this.boxes) { b.taken = 0; b.ph = 0; }
      if (!this.boxes.length || this.boxesFor !== c.id) this.makeBoxes(c);
    },

    /* rows of boxes on the racing line and the flanks */
    makeBoxes: function (c) {
      const g = c.geo, list = [];
      const rows = [[0.07, [-0.5, 0, 0.5]], [0.30, [-0.72, 0, 0.72]], [0.52, [0]],
      [0.68, [-0.45, 0.45]], [0.86, [-0.6, 0, 0.6]]];
      for (const r of rows) {
        for (const lat of r[1]) {
          const p = WC.trackPoint(c, r[0] * g.len, lat * c.hw * 0.72);
          list.push({ x: p.x, y: p.y, taken: 0, respawn: 0, ph: U.rr(U.rng(list.length * 977 + 31), 0, TAU) });
        }
      }
      this.boxes = list; this.boxesFor = c.id;
      return list;
    },

    draw: function (rng, rankFrac) {
      let w = TABLE[TABLE.length - 1][1];
      for (const band of TABLE) if (rankFrac <= band[0]) { w = band[1]; break; }
      let sum = 0; for (const q of w) sum += q;
      let r = rng() * sum;
      for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return KINDS[i]; }
      return 'mushroom';
    },

    /* pick up a box */
    grab: function (k, c, box) {
      box.taken = 1; box.respawn = 2.6;
      const n = c.gridCount || 8;
      const frac = U.clamp01((k.rank - 1) / (n - 1));
      if (k.item) { k.count++; this.ents.push({ t: 'pop', x: box.x, y: box.y, z: 40, life: 0.5 }); }
      else k.item = this.draw(k.rng, frac);
      k.ev.push({ t: 'item', k: k, x: box.x, y: box.y });
    },

    use: function (k, c, karts) {
      const it = k.item;
      if (!it || k.finished) return null;
      k.item = null;
      const h = WC.sampleTrack(c, k.x, k.y);
      switch (it) {
        case 'mushroom':
          k.addBoost(1.15, 1.0); break;
        case 'star':
          k.starT = 7.0; k.addBoost(0.5, 0.8); break;
        case 'hex':
          for (const o of karts) if (o !== k && !o.finished) {
            o.zapT = Math.max(o.zapT, 1.15); o.spin = Math.max(o.spin, 0.55);
            this.ents.push({ t: 'zap', x: o.x, y: o.y, z: 60, life: 0.7 });
          }
          k.ev.push({ t: 'hex', k: k });
          break;
        case 'banana': {
          const bx = k.x - Math.cos(k.ang) * 58, by = k.y - Math.sin(k.ang) * 58;
          this.ents.push({ t: 'banana', x: bx, y: by, life: 1e9, spin: 0 });
          k.ev.push({ t: 'drop', k: k });
          break;
        }
        case 'shell':
        case 'redshell': {
          let tgt = null;
          if (it === 'redshell') {
            let bd = 1e9;
            for (const o of karts) {
              if (o === k || o.ko || o.starT > 0) continue;
              const d = Math.hypot(o.x - k.x, o.y - k.y);
              if (d < bd && this._ahead(k, o, c)) { bd = d; tgt = o; }
            }
            if (!tgt) { for (const o of karts) if (o !== k && !o.ko) tgt = o; }
          }
          const sp = it === 'redshell' ? 1150 : 1000;
          this.ents.push({
            t: 'shell', sub: it, x: k.x + Math.cos(k.ang) * 46, y: k.y + Math.sin(k.ang) * 46,
            ang: k.ang, v: sp, life: 7.5, tgt: tgt, owner: k, wobble: 0, lat: h.d
          });
          k.ev.push({ t: 'fire', k: k });
          break;
        }
      }
      k.ev.push({ t: 'use', k: k, item: it });
      return it;
    },

    _ahead: function (k, o, c) {
      return o.prog > k.prog - 40;
    },

    /* ---------------------------------------------------- */
    update: function (dt, c, karts, fx) {
      const g = c.geo;

      /* boxes */
      for (const b of this.boxes) {
        b.ph += dt * 2.4;
        if (b.taken) {
          b.respawn -= dt;
          if (b.respawn <= 0) b.taken = 0;
          continue;
        }
        for (const k of karts) {
          if (k.ko) continue;
          if (Math.abs(k.x - b.x) < 46 && Math.abs(k.y - b.y) < 46) {
            const dx = k.x - b.x, dy = k.y - b.y;
            if (dx * dx + dy * dy < 44 * 44) this.grab(k, c, b);
          }
        }
      }

      /* entities */
      const keep = [];
      for (const e of this.ents) {
        if (e.t === 'pop' || e.t === 'zap' || e.t === 'poof') {
          e.life -= dt; if (e.life > 0) keep.push(e);
          continue;
        }
        if (e.t === 'banana') {
          e.spin += dt * 3;
          for (const k of karts) {
            if (k.ko || k.starT > 0) continue;
            const dx = k.x - e.x, dy = k.y - e.y;
            if (dx * dx + dy * dy < 42 * 42) {
              k.knock('spin', 1); e.life = -1;
              if (fx) fx.poof(e.x, e.y, 30);
              break;
            }
          }
          if (e.life > 0) keep.push(e);
          continue;
        }
        if (e.t === 'shell') {
          e.life -= dt;
          if (e.tgt && (e.tgt.ko || e.tgt.finished)) e.tgt = null;
          if (e.sub === 'redshell' && e.tgt) {
            const want = Math.atan2(e.tgt.y - e.y, e.tgt.x - e.x);
            e.ang += U.angNorm(want - e.ang) * Math.min(1, 3.4 * dt);
          } else {
            e.wobble += dt;
            e.ang += Math.sin(e.wobble * 2.2) * 1.1 * dt;
          }
          e.x += Math.cos(e.ang) * e.v * dt;
          e.y += Math.sin(e.ang) * e.v * dt;
          const h = WC.sampleTrack(c, e.x, e.y);
          const lim = h.wallD - 18;
          if (h.ad > lim) {
            const s = Math.sign(h.d || 1);
            e.x = h.x + h.rx * U.clamp(h.d, -lim, lim);
            e.y = h.y + h.ry * U.clamp(h.d, -lim, lim);
            const nx = h.rx * s, ny = h.ry * s;             // outward normal
            const dx = Math.cos(e.ang), dy = Math.sin(e.ang);
            const dn = dx * nx + dy * ny;
            if (dn > 0) {
              const rx2 = dx - 2 * dn * nx, ry2 = dy - 2 * dn * ny;
              e.ang = Math.atan2(ry2, rx2);
            }
            if (fx) fx.spark(e.x, e.y, 20);
          }
          for (const k of karts) {
            if (k === e.owner && e.life > 6.9) continue;
            if (k.ko || k.starT > 0) continue;
            const dx = k.x - e.x, dy = k.y - e.y;
            if (dx * dx + dy * dy < 44 * 44) {
              k.knock('spin', 1.1);
              e.life = -1;
              if (fx) fx.poof(e.x, e.y, 44);
              break;
            }
          }
          if (e.life > 0) keep.push(e);
        }
      }
      this.ents = keep;
    }
  };
})(typeof window !== 'undefined' ? window : global);
