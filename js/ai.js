/* ============================================================
   WITCH CART - ai.js
   Drivers: reads the baked corner-speed table, brakes on the
   braking triangle, aims at a moving point on the racing line,
   slides for mini-turbos and uses items when it makes sense.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC, U = WC.U, TAU = WC.TAU;
  const STEP = 7, DECEL = 980;

  WC.AI = {
    targetSpeed: function (k, c, h, skill) {
      const g = c.geo, N = g.N;
      let best = 1e9;
      const ahead = 420 + k.spd * 1.15;
      const stride = STEP * 2;
      for (let d = 0; d < ahead; d += stride) {
        const i = (h.idx + (d / stride | 0) * 2) % N;
        const v = g.vlimit[i] * skill;
        // braking triangle: how fast we may be now to be at v by i
        const allow = Math.sqrt(v * v + 2 * DECEL * d);
        if (allow < best) best = allow;
      }
      const bot = (h.idx + 4) % N;
      if (g.boost[bot]) best = Math.max(best, 940 * skill);
      return best;
    },

    step: function (k, c, karts, dt) {
      const g = c.geo, ai = k.ai;
      const h = WC.sampleTrack(c, k.x, k.y);
      const skill = U.clamp(ai.skill + (c.ai ? (c.ai.skill - 0.93) : 0), 0.72, 1.06);

      /* ---- where to point the kart ---------------------- */
      const lead = 95 + k.spd * 0.40;
      const li = h.idx;
      const line = g.race[li] + ai.off * c.hw * 0.5 +
        Math.sin(k.raceT * 0.7 + ai.wob) * c.hw * 0.10;
      const p = WC.trackPoint(c, (h.s + lead) % g.len, line);
      let want = Math.atan2(p.y - k.y, p.x - k.x);

      /* dodge the kart in front, steal space behind */
      for (let n = 0; n < karts.length; n++) {
        const o = karts[n];
        if (o === k || o.ko) continue;
        const dx = o.x - k.x, dy = o.y - k.y;
        const fw = dx * Math.cos(k.ang) + dy * Math.sin(k.ang);
        const rt = dx * -Math.sin(k.ang) + dy * Math.cos(k.ang);
        if (fw > 0 && fw < 150 && Math.abs(rt) < 62) {
          want = Math.atan2(p.y - k.y - Math.sign(rt || 1) * 34 * Math.cos(k.ang),
            p.x - k.x - Math.sign(rt || 1) * 34 * -Math.sin(k.ang));
          if (fw < 70 && k.spd > o.spd + 40) k.brake = Math.min(1, (fw - 40) / 60);
        }
      }

      const err = U.angNorm(want - k.ang);
      k.steer = U.clamp(err * 3.1, -1, 1);

      /* fence avoidance - hug the middle whenever a wall gets too close */
      const edge = c.hw * 0.78;
      if (h.ad > edge) {
        const w = U.clamp01((h.ad - edge) / (c.hw * 0.7));
        const inward = -U.sgn(h.d);
        const safe = U.angNorm(Math.atan2(h.ty, h.tx) + inward * 0.38);
        k.steer = U.clamp(U.lerp(k.steer, U.angNorm(safe - k.ang) * 3.4, w), -1, 1);
        if (h.ad > c.hw * 1.05) k.gas = Math.min(k.gas, 0.72);
      }

      /* ---- throttle / brake ------------------------------ */
      const tgt = WC.AI.targetSpeed(k, c, h, skill);
      if (k.spd > tgt + 18) { k.brake = U.clamp((k.spd - tgt) / 130, 0.25, 1); k.gas = 0; }
      else { k.gas = U.clamp(0.55 + (tgt - k.spd) / 260, 0.5, 1); k.brake = 0; }
      if (k.surf === 'grass' && k.spd > 420) k.gas *= 0.7;

      /* ---- slide for boost ------------------------------- */
      const curv = g.curv[li];
      const tight = Math.abs(curv) > 0.0019;
      if (!ai.drift && tight && k.spd > 430 && Math.abs(k.steer) > 0.42 && k.z <= 1) {
        ai.drift = 1; ai.dAng = U.sgn(curv); k.drift = true; k.hop(210);
      } else if (ai.drift) {
        const off = Math.abs(U.angNorm(k.ang - (h.idx ? Math.atan2(g.ty[li], g.tx[li]) : 0)));
        if (!tight || Math.sign(curv || ai.dAng) !== ai.dAng || off > 1.15 || k.spd < 300) {
          ai.drift = 0; k.releaseDrift();
        }
      }

      /* ---- items ------------------------------------------- */
      ai.useT -= dt;
      if (k.item && ai.useT <= 0) {
        ai.useT = U.rr(k.rng, 2.2, 6.5);
        const straight = Math.abs(curv) < 0.0011;
        if (k.item === 'mushroom' && !straight && k.spd < 700) { /* save it */ }
        else if (k.item === 'hex' && k.rank < 4) { /* save it for the leaders */ }
        else WC.Items.use(k, c, karts);
      }
      void TAU;
    }
  };
})(typeof window !== 'undefined' ? window : global);
