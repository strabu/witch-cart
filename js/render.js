/* ============================================================
   WITCH CART - render.js
   Software Mode-7 ground (textured perspective floor with mips
   and fog) + billboard sprite pass + weather + HUD hook.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC, U = WC.U, TAU = WC.TAU;

  const W = 480, H = 270;            // internal render buffer
  const CAM_BACK = 240;              // chase distance behind the player
  const CAM_H = 74;                  // camera height above the road
  const HORIZON = 0.40;              // fraction of H
  const VIEW = 2600;                // ground draw distance (world units)

  WC.Renderer = function (canvas, course) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.c = course;
    this.buf = document.createElement('canvas');
    this.buf.width = W; this.buf.height = H;
    this.bctx = this.buf.getContext('2d');
    this.img = this.bctx.createImageData(W, H);
    this.dst = new Uint32Array(this.img.data.buffer);
    this.W = W; this.H = H;
    this.focal = 268;
    this.t = 0;
    this.tex = course.tex || WC.bakeTrack(course);
    this.TS = WC.TS;
    this.fx = null;
    this.cam = { x: WC.WORLD / 2, y: WC.WORLD / 2, ang: 0, camH: CAM_H, horizon: H * HORIZON, shake: 0 };
    this.shakeT = 0; this.shakeA = 0;
    this.weather = new WC.Weather(course.weather);
    this.bakeSky();
    this.stars = this.makeStars(course.sky.star || 0);
    this.sunAz = 0.9; this.sunEl = 0.13;
    this.dw = W; this.dh = H; this.vs = 1; this.vx0 = 0; this.vy0 = 0;
  };

  WC.Renderer.prototype.bakeSky = function () {
    const s = this.c.sky;
    const c1 = U.hex(s.top), c2 = U.hex(s.mid), c3 = U.hex(s.low);
    const lut = this.skyLut = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const col = t < 0.55 ? U.mix(c1, c2, U.smooth(t / 0.55)) : U.mix(c2, c3, U.smooth((t - 0.55) / 0.45));
      lut[i] = U.packRGB(col[0], col[1], col[2], 255);
    }
    const night = this.c.night || 0;
    const fog = U.mix(U.hex(this.c.fog), [8, 10, 28], night * 0.45);
    this.fogRGB = fog;
    this.fogNear = VIEW * 0.26;
    this.fogFar = VIEW * 0.92;
    this.fogPacked = U.packRGB(fog[0], fog[1], fog[2], 255);
  };

  WC.Renderer.prototype.makeStars = function (n) {
    const rng = U.rng(0xBEEF), out = [];
    for (let i = 0; i < Math.round(n * 160); i++) {
      out.push({ az: rng() * TAU, el: Math.pow(rng(), 1.7) * 0.9, b: U.rr(rng, 0.35, 1), tw: rng() * TAU });
    }
    return out;
  };

  /* -------------------------------------------------- mode 7 ---- */
  WC.Renderer.prototype.ground = function () {
    const cam = this.cam, dst = this.dst, mips = this.tex.mips, TS = this.TS;
    const hz = cam.horizon, focal = this.focal, camH = cam.camH;
    const ca = Math.cos(cam.ang), sa = Math.sin(cam.ang);
    const fx = ca, fy = sa, rx = -sa, ry = ca;
    const fogR = this.fogRGB[0], fogG = this.fogRGB[1], fogB = this.fogRGB[2];
    const fn = this.fogNear, fspan = this.fogFar - this.fogNear;
    const y0 = Math.max(0, Math.ceil(hz));

    /* sky (vertical gradient LUT) */
    for (let sy = 0; sy <= y0 && sy < H; sy++) {
      const px = this.skyLut[(sy / Math.max(1, y0) * 255) | 0];
      let o = sy * W;
      for (let x = 0; x < W; x++) dst[o++] = px;
    }

    /* ground rows */
    for (let sy = y0 + 1; sy < H; sy++) {
      const dy = sy - hz;
      const dd = focal * camH / dy;                    // forward depth of row
      const stepL = camH / dy;                        // lateral world units / px
      const o = sy * W;
      if (dd > VIEW) {
        dst.fill(this.fogPacked, o, o + W);
        continue;
      }
      const f = U.clamp01((dd - fn) / fspan);
      const fp = stepL * TS;                          // texels per pixel
      const lvl = fp > 1.9 ? (fp > 3.6 ? 2 : 1) : 0;
      const m = mips[lvl], msz = this.tex.size >> lvl;
      const inv = 1 - f, fr = fogR * f, fg = fogG * f, fb = fogB * f;

      let ux = (cam.x + fx * dd - rx * W * 0.5 * stepL) * TS;
      let uy = (cam.y + fy * dd - ry * W * 0.5 * stepL) * TS;
      const dux = rx * stepL * TS;
      const duy = ry * stepL * TS;
      const isc = 1 / (1 << lvl);

      for (let x = 0; x < W; x++) {
        /* wrap, don't clamp - the world is a torus and clamped texels
           smear a bright edge across half the horizon */
        const tx = ((ux * isc) | 0) & (msz - 1), ty = ((uy * isc) | 0) & (msz - 1);
        const p = m[ty * msz + tx];
        dst[o + x] = 0xff000000 |
          ((fb + ((p >>> 16) & 255) * inv) << 16) |
          ((fg + ((p >>> 8) & 255) * inv) << 8) |
          ((fr + (p & 255) * inv) | 0);
        ux += dux; uy += duy;
      }
    }
    this.bctx.putImageData(this.img, 0, 0);
  };

  /* --------------------------------------------------- sky ---- */
  WC.Renderer.prototype.sky = function () {
    const x = this.bctx, cam = this.cam, Wl = this.W, hz = cam.horizon, focal = this.focal;
    const night = this.c.night || 0;
    if (night > 0.12) {
      for (const s of this.stars) {
        const da = U.angNorm(s.az - cam.ang);
        if (Math.abs(da) > 1.35) continue;
        const sx = Wl * 0.5 + focal * Math.tan(da);
        if (sx < -4 || sx > Wl + 4) continue;
        const sy = hz - Math.tan(s.el) * focal;
        if (sy < 0) continue;
        const tw = 0.55 + 0.45 * Math.sin(this.t * 3 + s.tw);
        x.fillStyle = 'rgba(255,252,235,' + (s.b * tw * night).toFixed(3) + ')';
        const sz = s.b > 0.8 ? 2 : 1;
        x.fillRect(sx, sy, sz, sz);
      }
    }
    /* sun / moon */
    const da = U.angNorm(this.sunAz - cam.ang);
    if (Math.abs(da) < 1.15) {
      const sx = Wl * 0.5 + focal * Math.tan(da);
      const sy = hz - Math.tan(this.sunEl) * focal;
      const col = U.hex(this.c.sky.sun);
      const g = x.createRadialGradient(sx, sy, 2, sx, sy, 56);
      g.addColorStop(0, U.rgba(col, 0.95));
      g.addColorStop(0.3, U.rgba(col, 0.4));
      g.addColorStop(1, U.rgba(col, 0));
      x.fillStyle = g;
      x.beginPath(); x.arc(sx, sy, 56, 0, TAU); x.fill();
      x.fillStyle = U.rgb(col);
      x.beginPath(); x.arc(sx, sy, night > 0.4 ? 15 : 21, 0, TAU); x.fill();
    }
    /* drifting cloud band */
    x.globalAlpha = this.c.weather === 'rain' ? 0.5 : 0.26;
    for (let i = 0; i < 8; i++) {
      const az = i * 0.79 + Math.sin(i * 3.1) * 0.4;
      const el = 0.18 + ((i * 37) % 10) / 22;
      const sz = 26 + ((i * 53) % 40);
      const d2 = U.angNorm(az - cam.ang + this.t * 0.012);
      if (Math.abs(d2) > 1.2) continue;
      const cx = Wl * 0.5 + focal * Math.tan(d2), cy = hz - Math.tan(el) * focal;
      x.fillStyle = U.rgba(U.hex(this.c.sky.low), 0.75);
      for (let k = 0; k < 4; k++) {
        x.beginPath();
        x.ellipse(cx + (k - 1.5) * sz * 0.5, cy + Math.sin(k * 1.7) * 4, sz * (0.55 + k * 0.1), sz * 0.2, 0, 0, TAU);
        x.fill();
      }
    }
    x.globalAlpha = 1;
  };

  /* -------------------------------------------- projection ---- */
  const tmp = { fw: 0, sx: 0, sy: 0, sc: 0 };
  WC.Renderer.prototype.project = function (wx, wy, wz, cam) {
    const dx = wx - cam.x, dy = wy - cam.y;
    const ca = Math.cos(cam.ang), sa = Math.sin(cam.ang);
    const fw = dx * ca + dy * sa;
    if (fw < 14) return null;
    const rt = dx * -sa + dy * ca;
    tmp.fw = fw;
    tmp.sx = W * 0.5 + this.focal * rt / fw;
    tmp.sy = cam.horizon + this.focal * (cam.camH - (wz || 0)) / fw;
    tmp.sc = Math.min(this.focal / fw, 4);
    return tmp;
  };

  /* ------------------------------------------------- sprites ---- */
  const queue = [];
  function qpush(sp, wx, wy, wz, layer, extra, pr) {
    if (!pr) return;
    const hw = sp.ww * pr.sc * 0.5;
    if (pr.sx + hw < -10 || pr.sx - hw > W + 10) return;
    if (pr.sy < -60) return;
    queue.push({ sp: sp, sx: pr.sx, sy: pr.sy, sc: pr.sc, fw: pr.fw, layer: layer, e: extra });
  }

  WC.Renderer.prototype.sprites = function (karts) {
    const x = this.bctx, cam = this.cam, S = WC.sprites, f = this.focal;
    const ca = Math.cos(cam.ang), sa = Math.sin(cam.ang);
    queue.length = 0;

    const proj = (wx, wy, wz) => {
      const dx = wx - cam.x, dy = wy - cam.y;
      const fw = dx * ca + dy * sa;
      if (fw < 24) return null;
      tmp.fw = fw;
      tmp.sx = W * 0.5 + f * (dx * -sa + dy * ca) / fw;
      tmp.sy = cam.horizon + f * (cam.camH - (wz || 0)) / fw;
      tmp.sc = Math.min(f / fw, 4);          // never let a billboard balloon
      return tmp;
    };
    /* NOTE: tmp is shared - qpush copies what it needs before the next call */

    /* drop roadside props once they would tower over the cockpit view - they
       sit outside the ribbon, so they leave the frame naturally long before
       this bites, except when the kart is scraped along the fence */
    const MAXH = H * 0.55;
    for (const d of this.c.decor) {
      const sp = S.decor[d.type]; if (!sp) continue;
      const dx = d.x - cam.x, dy = d.y - cam.y;
      const fw = dx * ca + dy * sa;
      if (fw < 40 || fw > VIEW * 0.72) continue;
      if (d.type !== 'gantry' && d.type !== 'stand' && sp.wh * (d.scale || 1) * Math.min(f / fw, 4) > MAXH) continue;
      const pr = proj(d.x, d.y, 0);
      if (pr) qpush(sp, 0, 0, 0, 0, null, pr);
    }
    for (const b of WC.Items.boxes) {
      if (b.taken) continue;
      const z = 26 + Math.sin(b.ph) * 7;
      const pr = proj(b.x, b.y, z);
      if (pr) qpush(S.box, 0, 0, 0, 1, null, pr);
    }
    for (const e of WC.Items.ents) {
      const sp = e.t === 'shell' ? S.item[e.sub === 'redshell' ? 'redshell' : 'shell'] : e.t === 'banana' ? S.item.banana : null;
      if (!sp) continue;
      const z = e.t === 'shell' ? 16 : 2;
      const pr = proj(e.x, e.y, z);
      if (pr) qpush(sp, 0, 0, 0, 2, e, pr);
    }
    for (const k of karts) {
      const dx = k.x - cam.x, dy = k.y - cam.y;
      const fw = dx * ca + dy * sa;
      if (fw < 22 || fw > VIEW * 0.7) continue;
      const ar = Math.abs(U.angNorm(k.ang - cam.ang));
      const vi = ar < 0.62 ? 0 : ar < 2.05 ? 1 : 2;
      const views = S.kart[k.chIdx || 0];
      if (!views) continue;
      const shp = proj(k.x, k.y, 0);
      if (shp) queue.push({ sp: { cv: null, ww: 74, wh: 26, ax: 0.5 }, sx: shp.sx, sy: shp.sy, sc: shp.sc, fw: fw - 1, layer: 2.5, e: k });
      const pr = proj(k.x, k.y, k.z);
      if (pr) qpush(views[vi], 0, 0, 0, 3, k, pr);
    }

    queue.sort((a, b) => b.fw - a.fw);

    for (const q of queue) {
      const w = q.sp.ww * q.sc, h = q.sp.wh * q.sc;
      if (q.layer === 2.5) {
        x.globalAlpha = 0.42 * U.clamp01(1 - q.fw / (VIEW * 0.45));
        x.fillStyle = '#000';
        x.beginPath();
        x.ellipse(q.sx, q.sy, Math.max(1.5, w * 0.5), Math.max(0.8, h * 0.5), 0, 0, TAU);
        x.fill();
        x.globalAlpha = 1;
        continue;
      }
      x.save();
      x.translate(q.sx, q.sy);
      if (q.e) {
        if (q.layer === 3) x.rotate(-U.clamp(q.e.vl / 900, -0.22, 0.22));
        if (q.e.spin > 0) x.rotate(Math.sin(q.e.raceT * 24) * 0.2);
      }
      if (q.sc > 0.12) x.imageSmoothingEnabled = false;
      x.drawImage(q.sp.cv, -w * q.sp.ax, -h, w, h);
      if (q.e && q.e.starT > 0) {
        x.globalAlpha = 0.3 + 0.35 * Math.sin(this.t * 20);
        x.drawImage(q.sp.cv, -w * q.sp.ax, -h, w, h);
        x.globalAlpha = 1;
      }
      x.restore();
    }

    /* particles */
    const fx = this.fx;
    if (fx) {
      for (const p of fx.list) {
        const pr = proj(p.x, p.y, p.z);
        if (!pr) continue;
        const a = U.clamp01(p.life / p.max);
        x.globalAlpha = p.k === 'spark' || p.k === 'flame' ? a : a * 0.5;
        x.fillStyle = p.col;
        x.beginPath();
        x.arc(pr.sx, pr.sy, Math.min(H * 0.16, Math.max(0.7, p.r * pr.sc)), 0, TAU);
        x.fill();
      }
      x.globalAlpha = 1;
    }
  };

  /* ------------------------------------------------ compose ---- */
  WC.Renderer.prototype.resize = function (w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.max(320, Math.round(w * dpr));
    this.cv.height = Math.max(180, Math.round(h * dpr));
    this.dw = this.cv.width; this.dh = this.cv.height;
    this.vs = Math.min(this.dw / W, this.dh / H);
    this.vx0 = (this.dw - W * this.vs) / 2;
    this.vy0 = (this.dh - H * this.vs) / 2;
    this.ctx.imageSmoothingEnabled = false;
  };

  WC.Renderer.prototype.frame = function (dt, karts, player, game) {
    this.t += dt;
    const cam = this.cam;

    /* chase camera - the lens rides the ribbon a fixed arc-length behind the
       kart. A straight-line trail drifts off the road in corners and drags
       the fence line across the view. */
    const cc = this.c, geo = cc && cc.geo;
    let tx = player.x - Math.cos(player.ang) * CAM_BACK,
      ty = player.y - Math.sin(player.ang) * CAM_BACK,
      tang = player.ang;
    if (geo) {
      const h = WC.sampleTrack(cc, player.x, player.y);
      let bs = h.s - CAM_BACK; if (bs < 0) bs += geo.len;
      const tp = WC.trackPoint(cc, bs, U.clamp(h.d, -cc.hw * 0.55, cc.hw * 0.55));
      tx = tp.x; ty = tp.y;
      /* view heading: mostly the road tangent at the kart, a little of the
         kart's own yaw - keeps the fence line out of the middle of the frame */
      const rp = WC.trackPoint(cc, h.s, 0);
      const bx = rp.tx * 0.72 + Math.cos(player.ang) * 0.28;
      const by = rp.ty * 0.72 + Math.sin(player.ang) * 0.28;
      tang = Math.atan2(by, bx);
    }
    cam.x = U.damp(cam.x, tx, 10, dt);
    cam.y = U.damp(cam.y, ty, 10, dt);
    cam.ang = U.angNorm(cam.ang + U.angNorm(tang + player.steerSm * 0.10 - cam.ang) * Math.min(1, 8 * dt));
    cam.camH = U.damp(cam.camH, CAM_H + player.spd * 0.010 + player.z * 0.5, 6, dt);
    cam.horizon = U.clamp(H * HORIZON - player.z * 0.34 - player.vz * 0.014 + Math.sin(this.t * 1.7) * 1.1, 6, H - 26);

    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeA * U.clamp01(this.shakeT / 0.4);
      cam.x += (Math.random() - 0.5) * a * 16;
      cam.y += (Math.random() - 0.5) * a * 16;
      this.shakeA = a;
    }
    this.sunAz += dt * 0.005;
    this.weather.update(dt, this.t);

    this.ground();
    this.sky();
    this.sprites(karts);
    this.weather.draw(this.bctx, W, H, cam.horizon);
    if (this.c.night > 0.3) {
      this.bctx.fillStyle = 'rgba(10,12,34,' + (this.c.night * 0.20).toFixed(3) + ')';
      this.bctx.fillRect(0, 0, W, H);
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#04030a';
    ctx.fillRect(0, 0, this.dw, this.dh);
    ctx.drawImage(this.buf, 0, 0, W, H, this.vx0, this.vy0, W * this.vs, H * this.vs);
    if (game && game.drawHUD) {
      ctx.save();
      ctx.setTransform(this.dw / 1280, 0, 0, this.dh / 720, 0, 0);
      game.drawHUD(ctx, this, 1280, 720);
      ctx.restore();
    }
  };

  WC.Renderer.prototype.shake = function (a) {
    if (a >= this.shakeA || this.shakeT <= 0) { this.shakeA = a; this.shakeT = 0.4; }
  };

  WC.RFONTS = { ui: '700 26px "Trebuchet MS", system-ui, sans-serif' };
})(typeof window !== 'undefined' ? window : global);
