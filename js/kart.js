/* ============================================================
   WITCH CART - kart.js
   Arcade kart physics: grip circle, drift + mini-turbo,
   surface penalties, wall collisions, lap bookkeeping.
   Pure maths - no DOM, so it runs headless in the tests.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC, U = WC.U, TAU = WC.TAU;

  WC.CHARS = [
    { id: 'mora', name: 'MORA', kind: 'witch', body: '#8b2f6b', trim: '#ffd166', hat: '#2b1a3a', skin: '#f4d3bb', power: 1.00, grip: 1.00, drift: 1.00 },
    { id: 'bog', name: 'BOGCAT', kind: 'cat', body: '#2f5fd0', trim: '#ffe9a8', hat: '#2f5fd0', skin: '#e6d3b3', power: 0.98, grip: 1.06, drift: 1.04 },
    { id: 'nyx', name: 'NYX', kind: 'ghost', body: '#7a4fd8', trim: '#c8f7ff', hat: '#3a2170', skin: '#dfeaff', power: 1.03, grip: 0.95, drift: 1.02 },
    { id: 'jinx', name: 'JINX', kind: 'witch', body: '#e0492f', trim: '#ffe15c', hat: '#25202e', skin: '#f0cfae', power: 1.05, grip: 0.93, drift: 0.98 },
    { id: 'witch', name: 'GRIMWald', kind: 'wizard', body: '#2c8f7a', trim: '#f7f2e2', hat: '#1d3b33', skin: '#e9cfae', power: 0.97, grip: 1.04, drift: 1.06, stache: 1 },
    { id: 'pump', name: 'LANTERN', kind: 'cat', body: '#e07a24', trim: '#fff1c8', hat: '#e07a24', skin: '#f7dfc0', power: 1.01, grip: 1.00, drift: 0.97 },
    { id: 'spi', name: 'SPARKLE', kind: 'witch', body: '#38c8d8', trim: '#ffffff', hat: '#146a80', skin: '#f6dcC4', power: 0.99, grip: 1.02, drift: 1.08 },
    { id: 'mor', name: 'EMBERRIX', kind: 'wizard', body: '#b8324f', trim: '#ffd166', hat: '#33182a', skin: '#e6c39c', power: 1.04, grip: 0.97, drift: 1.00, stache: 1 }
  ];
  WC.CHARS[4].name = 'GRIMWALD';

  const HW = 33;              // kart half width (world units)
  const GRAV = 2600;

  const SURF = {
    road: { grip: 1.00, drag: 1.00, max: 1.00, bump: 0 },
    kerb: { grip: 0.84, drag: 1.14, max: 0.975, bump: 1.0 },
    grass: { grip: 0.58, drag: 2.60, max: 0.52, bump: 2.0 },
    wall: { grip: 0.30, drag: 4.00, max: 0.30, bump: 1.4 }
  };

  WC.Kart = function (o) {
    o = o || {};
    const rng = U.rng((o.seed || 17) + (o.slot || 0) * 3137);
    this.ch = o.ch || WC.CHARS[0];
    this.isAI = !!o.isAI;
    this.slot = o.slot || 0;
    this.x = o.x || 0; this.y = o.y || 0; this.z = 0;
    this.ang = o.ang || 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.vf = 0; this.vl = 0; this.spd = 0;
    this.steer = 0; this.gas = 0; this.brake = 0; this.drift = false;
    this.steerSm = 0;
    this.boostT = 0; this.boostP = 0;
    this.charge = 0; this.tier = 0; this.driftTime = 0;
    this.spin = 0; this.zapT = 0; this.stun = 0; this.starT = 0; this.stuckT = 0;
    this.idx = 0; this.lat = 0; this.surf = 'road'; this.s = 0; this.prevS = 0; this.half = false;
    this.lap = 0; this.prog = 0; this.lapT = 0; this.lapTimes = []; this.raceT = 0;
    this.finished = false; this.finishT = 0; this.rank = 1;
    this.item = null; this.count = 0;
    this.offT = 0; this.wallHits = 0; this.boosts = 0;
    this.ground = 0;                      // cumulative wheel bump phase
    this.ko = false;
    this.ai = { skill: o.skill != null ? o.skill : 0.9, off: o.aiOff || 0, look: 0, drift: 0, useT: U.rr(rng, 1.5, 5), wob: U.rr(rng, 0, TAU) };
    this.rng = rng;
    this.ev = [];                        // events for audio / fx
  };

  WC.Kart.prototype.addBoost = function (t, p) {
    this.boostT = Math.max(this.boostT, t);
    this.boostP = Math.max(this.boostP, p);
    if (t > 0) { this.boosts++; this.ev.push({ t: 'boost', k: this }); }
  };

  WC.Kart.prototype.knock = function (kind, power) {
    if (this.finished || this.starT > 0) return;
    if (kind === 'spin') { this.spin = Math.max(this.spin, 0.85 * (power || 1)); this.stun = 0.25; }
    else if (kind === 'zap') { this.zapT = Math.max(this.zapT, 1.1); this.spin = Math.max(this.spin, 0.5); }
    this.ev.push({ t: kind, k: this });
  };

  WC.Kart.prototype.hop = function (v) {
    if (this.z <= 0.5) { this.vz = v || 250; this.ev.push({ t: 'hop', k: this }); }
  };

  /* release the drift -> mini turbo */
  WC.Kart.prototype.releaseDrift = function () {
    if (this.drift && this.tier > 0) {
      const t = this.tier;
      this.addBoost(0.30 + t * 0.30, 0.55 + t * 0.25);
      this.ev.push({ t: 'turbo' + t, k: this });
    }
    this.drift = false; this.charge = 0; this.tier = 0;
  };

  WC.Kart.prototype.reset = function (x, y, ang) {
    this.x = x; this.y = y; this.ang = ang;
    this.vx = this.vy = this.vz = 0;
    this.z = 0; this.vf = this.vl = this.spd = 0;
    this.spin = this.zapT = this.stun = this.starT = this.stuckT = 0;
    this.boostT = this.boostP = this.charge = this.tier = 0;
    this.lap = 0; this.prog = 0; this.lapT = 0; this.lapTimes = []; this.raceT = 0;
    this.s = 0; this.prevS = 0; this.half = false; this.lat = 0; this.surf = 'road'; this.idx = 0;
    this.finished = this.ko = false; this.finishT = 0;
    this.offT = 0; this.wallHits = 0; this.boosts = 0;
    this.item = null; this.count = 0;
  };

  /* ------------------------------------------------------- */
  WC.Kart.prototype.step = function (dt, c) {
    const ch = this.ch, g = c.geo;
    if (this.ko) { this.spd = 0; return; }

    /* --- surface under the kart ------------------------- */
    let h = WC.sampleTrack(c, this.x, this.y);
    this.idx = h.idx; this.lat = h.d; this.surf = h.surf; this.s = h.s;
    const sf = SURF[this.surf] || SURF.road;

    /* --- timers ------------------------------------------- */
    this.raceT += dt; this.lapT += dt;
    if (this.boostT > 0) { this.boostT -= dt; if (this.boostT <= 0) { this.boostT = 0; this.boostP = 0; } }
    if (this.spin > 0) this.spin -= dt;
    if (this.stun > 0) this.stun -= dt;
    if (this.zapT > 0) this.zapT -= dt;
    if (this.starT > 0) { this.starT -= dt; this.spin = 0; this.zapT = 0; }

    const disabled = this.spin > 0 || this.stun > 0;
    const gas = disabled ? 0 : this.gas;
    const brake = disabled ? 0 : this.brake;
    const steer = disabled ? 0 : this.steer;
    this.steerSm = U.damp(this.steerSm, steer, 12, dt);

    /* --- speed in the kart frame ------------------------ */
    let cf = Math.cos(this.ang), sf2 = Math.sin(this.ang);
    this.vf = this.vx * cf + this.vy * sf2;
    this.vl = this.vx * -sf2 + this.vy * cf;

    /* --- longitudinal ------------------------------------- */
    const boostK = 1 + 0.30 * this.boostP;
    const vmax = 900 * ch.power * sf.max * boostK * (this.starT > 0 ? 1.14 : 1);
    if (gas > 0) {
      const rate = (this.boostT > 0 ? 3.1 : 1.75) * ch.power;
      this.vf += (vmax - this.vf) * rate * dt;
      if (this.vf < 120) this.vf += 240 * dt;         // punchy launch
    } else if (brake > 0) {
      if (this.vf > 8) this.vf -= 1150 * ch.grip * dt;
      else this.vf = Math.max(this.vf - 400 * dt, -170);
    } else {
      this.vf = U.damp(this.vf, 0, 0.62 * sf.drag, dt);
    }
    if (this.vf > vmax) this.vf = U.damp(this.vf, vmax, 3.4, dt);
    if (this.vf < -220) this.vf = -220;

    /* --- steering / yaw ---------------------------------- */
    const spd = Math.abs(this.vf);
    let yaw = (3.30 - 1.15 * U.clamp01(spd / 900)) * (this.drift ? 1.26 : 1);
    if (disabled) yaw = 0;
    const gripSteer = U.clamp(0.35 + spd / 160, 0, 1) * (this.zapT > 0 ? 0.45 : 1);
    const ang0 = this.ang;
    this.ang = U.angNorm(this.ang + this.steerSm * yaw * gripSteer * dt * (this.vf >= 0 ? 1 : -1) * (this.spin > 0 ? 2.6 : 1));

    /* --- lateral grip / slide --------------------------
       Rotate the velocity into the new kart frame: turning
       leaves the momentum pointing somewhere else, which reads
       as a slide, and lateral friction drags it back in line. */
    cf = Math.cos(this.ang); sf2 = Math.sin(this.ang);
    const dA = this.ang - ang0;
    const cd = Math.cos(dA), sd = Math.sin(dA);
    const vf1 = this.vf * cd + this.vl * sd;
    const vl1 = -this.vf * sd + this.vl * cd;
    let gripK = (this.drift ? 2.05 : 8.6) * ch.grip * sf.grip;
    if (this.zapT > 0) gripK *= 0.35;
    if (brake > 0 && spd > 60) gripK *= 0.72;          // trail-brake slide
    this.vl = U.damp(vl1, 0, gripK, dt);
    this.vf = vf1;

    /* --- recompose + integrate ------------------------- */
    this.vx = cf * this.vf - sf2 * this.vl;
    this.vy = sf2 * this.vf + cf * this.vl;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.spd = Math.hypot(this.vx, this.vy);

    /* --- hop / bumps ------------------------------------ */
    if (this.z > 0 || this.vz > 0) {
      this.z += this.vz * dt; this.vz -= GRAV * dt;
      if (this.z <= 0) { this.z = 0; this.vz = 0; this.ev.push({ t: 'land', k: this }); }
    } else if (sf.bump > 0 && spd > 120) {
      this.ground += spd * dt * 0.05;
      const b = Math.sin(this.ground) * sf.bump * Math.min(1, spd / 620);
      if (b > 0.55) this.vz = b * 26;
    }

    /* --- drift charge ----------------------------------- */
    if (this.drift && this.z <= 2 && spd > 300 && Math.abs(this.steerSm) > 0.3) {
      this.driftTime += dt;
      this.charge += dt * (0.95 + Math.abs(this.vl) / 240);
      this.tier = this.charge > 2.7 ? 3 : this.charge > 1.5 ? 2 : this.charge > 0.55 ? 1 : 0;
      this.ev.push({ t: 'drift', k: this, v: Math.abs(this.vl) });
    } else if (!this.drift) { this.driftTime = 0; }

    /* --- walls ------------------------------------------- */
    h = WC.sampleTrack(c, this.x, this.y);
    const lim = h.wallD - HW;
    if (h.ad > lim) {
      const d = U.clamp(h.d, -lim, lim);
      this.x = h.x + h.rx * d; this.y = h.y + h.ry * d;
      const s = h.d >= 0 ? 1 : -1;
      const nx = h.rx * s, ny = h.ry * s;                  // outward normal
      const ta = Math.atan2(h.ty, h.tx);                    // fence direction
      let vt = this.vx * h.tx + this.vy * h.ty;
      const impact = this.vx * nx + this.vy * ny;           // outward speed
      if (impact > 0) {
        const k = U.clamp01(impact / 700);
        vt *= (1 - 0.15 * k);                               // scrub only on a real hit
        const vn = -impact * (0.10 + 0.16 * k);
        this.vx = h.tx * vt + nx * vn; this.vy = h.ty * vt + ny * vn;
        /* the fence steers you: turn the nose down the track so you
           scrape along it instead of digging in and stalling */
        this.ang = U.angNorm(this.ang + U.angNorm(ta - this.ang) * Math.min(1, 5.5 * dt));
        this.vl *= 0.4;
        if (impact > 110) {
          this.wallHits++;
          this.ev.push({ t: 'wall', k: this, v: Math.min(1, impact / 520), x: this.x, y: this.y });
          if (impact > 330) this.spin = Math.max(this.spin, 0.42);
        }
      }
      this.surf = 'wall'; this.lat = d;
    }

    /* --- unstick ------------------------------------------ */
    if (this.spd < 34 && gas > 0) {
      this.stuckT += dt;
      if (this.stuckT > 1.4) {
        this.stuckT = 0;
        const q = WC.sampleTrack(c, this.x, this.y);
        this.ang = Math.atan2(q.ty, q.tx);
        this.vx = q.tx * 190; this.vy = q.ty * 190;
        this.lat = q.d * 0.7;
        this.x = q.x + q.rx * U.clamp(q.d * 0.7, -(q.wallD - HW), q.wallD - HW);
        this.y = q.y + q.ry * U.clamp(q.d * 0.7, -(q.wallD - HW), q.wallD - HW);
        this.ev.push({ t: 'unstuck', k: this });
      }
    } else this.stuckT = 0;

    /* --- boost pads -------------------------------------- */
    if (h.boost && this.boostT < 0.45) this.addBoost(0.55, 0.6);

    /* --- off-road accounting --------------------------- */
    if (this.surf === 'grass') {
      this.offT += dt;
      if (Math.random() < 0.4) this.ev.push({ t: 'grass', k: this });
    }

    /* --- lap bookkeeping ------------------------------- */
    let ds = this.s - this.prevS;
    if (ds < -g.len * 0.5) ds += g.len;
    else if (ds > g.len * 0.5) ds -= g.len;
    this.prog += ds;
    /* the halfway beacon must be ticked before a lap counts, so cars
       jostling across the line on the grid earn nothing */
    if (this.s > g.len * 0.42 && this.s < g.len * 0.58) this.half = true;
    if (this.half && this.prevS > g.len * 0.72 && this.s < g.len * 0.28) {
      this.lap++;
      this.half = false;
      this.lapTimes.push(this.lapT); this.lapT = 0;
      if (this.lap >= c.laps && !this.finished) { this.finished = true; this.finishT = this.raceT; }
      this.ev.push({ t: 'lap', k: this });
    }
    this.prevS = this.s;
  };

  WC.KART_HW = HW;
})(typeof window !== 'undefined' ? window : global);
