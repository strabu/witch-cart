/* ============================================================
   WITCH CART - game.js
   States, race director, HUD, attract mode, main loop.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC, U = WC.U, TAU = WC.TAU;
  const DT = 1 / 60, AI_DT = 1 / 40;

  function el(id) { return global.document.getElementById(id); }

  /* ---- minimap path (cached per course) ---- */
  WC.miniPath = function (c, w, h, pad) {
    if (c._mini && c._mini.w === w && c._mini.h === h) return c._mini;
    const g = c.geo;
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let i = 0; i < g.N; i += 2) {
      if (g.xs[i] < minx) minx = g.xs[i];
      if (g.xs[i] > maxx) maxx = g.xs[i];
      if (g.ys[i] < miny) miny = g.ys[i];
      if (g.ys[i] > maxy) maxy = g.ys[i];
    }
    const k = Math.min((w - pad * 2) / (maxx - minx), (h - pad * 2) / (maxy - miny));
    const ox = (w - (maxx - minx) * k) / 2 - minx * k;
    const oy = (h - (maxy - miny) * k) / 2 - miny * k;
    const pts = [];
    for (let i = 0; i < g.N; i += 3) pts.push([g.xs[i] * k + ox, g.ys[i] * k + oy]);
    return (c._mini = { w: w, h: h, pts: pts, k: k, ox: ox, oy: oy, hw: g.hw * k });
  };

  const G = WC.Game = {
    state: 'boot',
    courseIdx: 0, charIdx: 0,
    karts: [], player: null,
    renderer: null, fx: null,
    acc: 0, aiAcc: 0, last: 0,
    t: 0, count: 0, raceOver: false,
    msg: '', msgT: 0, msgCol: '#fff',
    sfxLock: {},

    /* ================= boot ================= */
    boot: function () {
      G.cv = el('view');
      WC.bakeSprites(WC.CHARS);
      WC.Input.bind();
      G.buildCourseCards();
      G.buildCharRow();
      G.bindUI();
      global.addEventListener('resize', G.onResize);
      G.onResize();
      G.pickCourse(0, true);
      G.state = 'title';
      G.show('title');
      G.last = performance.now();
      requestAnimationFrame(G.loop);
    },

    onResize: function () {
      const st = el('stage');
      if (G.renderer) G.renderer.resize(st.clientWidth, st.clientHeight);
    },

    /* ================= screens ================= */
    show: function (id) {
      const list = document.querySelectorAll('.screen');
      for (const s of list) s.classList.toggle('hidden', s.id !== id);
      const ov = el('overlay');
      ov.classList.toggle('pass', !id);
    },

    bindUI: function () {
      el('btnStart').onclick = function () { WC.Audio.init(); WC.Audio.sfx('select'); G.state = 'select'; G.show('select'); };
      el('btnBack').onclick = function () { WC.Audio.sfx('ui'); G.state = 'title'; G.show('title'); };
      el('btnRace').onclick = function () { G.startRace(); };
      el('btnResume').onclick = function () { G.resume(); };
      el('btnQuit').onclick = function () { G.state = 'select'; G.show('select'); G.pickCourse(G.courseIdx, true); };
      el('btnAgain').onclick = function () { G.startRace(); };
      el('btnMenu').onclick = function () { G.state = 'select'; G.show('select'); G.pickCourse(G.courseIdx, true); };
      el('btnMute').onclick = function () {
        WC.Audio.init();
        WC.Audio.setMute(!WC.Audio.muted);
        el('btnMute').textContent = WC.Audio.muted ? 'SOUND OFF' : 'SOUND ON';
      };
    },

    buildCourseCards: function () {
      const host = el('courses');
      host.innerHTML = '';
      WC.COURSES.forEach(function (c, i) {
        const d = document.createElement('div');
        d.className = 'card';
        const cv = document.createElement('canvas');
        cv.width = 168; cv.height = 128;
        const x = cv.getContext('2d');
        WC.buildCourse(c);
        const m = WC.miniPath(c, 168, 128, 12);
        x.lineJoin = 'round'; x.lineCap = 'round';
        x.strokeStyle = 'rgba(255,255,255,0.10)'; x.lineWidth = m.hw * 2 + 10;
        x.beginPath(); m.pts.forEach(function (p, j) { j ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); x.stroke();
        x.strokeStyle = c.asphalt[0]; x.lineWidth = m.hw * 2;
        x.beginPath(); m.pts.forEach(function (p, j) { j ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); x.stroke();
        x.strokeStyle = c.kerbA; x.lineWidth = 2.5; x.setLineDash([6, 7]);
        x.beginPath(); m.pts.forEach(function (p, j) { j ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); x.stroke();
        x.setLineDash([]);
        x.fillStyle = '#ffd166';
        x.beginPath(); x.arc(m.pts[0][0], m.pts[0][1], 4.5, 0, TAU); x.fill();
        const info = document.createElement('div');
        info.className = 'cardinfo';
        info.innerHTML = '<b>' + c.name + '</b><span>' + c.laps +
          ' laps &middot; ' + c.weather + '</span>';
        d.appendChild(cv); d.appendChild(info);
        d.onclick = function () { WC.Audio.sfx('select'); G.pickCourse(i, true); };
        host.appendChild(d);
        c._card = d;
      });
    },

    buildCharRow: function () {
      const host = el('chars');
      host.innerHTML = '';
      WC.CHARS.forEach(function (ch, i) {
        const d = document.createElement('div');
        d.className = 'char';
        const cv = document.createElement('canvas');
        cv.width = 92; cv.height = 76;
        const x = cv.getContext('2d');
        x.translate(46, 74);
        x.drawImage(WC.sprites.kart[i][0].cv, -WC.sprites.kart[i][0].cv.width / 2, -WC.sprites.kart[i][0].cv.height, WC.sprites.kart[i][0].ww, WC.sprites.kart[i][0].wh);
        d.appendChild(cv);
        const n = document.createElement('span');
        n.textContent = ch.name;
        d.appendChild(n);
        d.onclick = function () { WC.Audio.sfx('ui'); G.charIdx = i; G.hlChar(); };
        host.appendChild(d);
        ch._card = d;
      });
      G.hlChar();
    },
    hlChar: function () {
      WC.CHARS.forEach(function (ch, i) { ch._card.classList.toggle('sel', i === G.charIdx); });
    },

    hlCourse: function () {
      WC.COURSES.forEach(function (c, i) { if (c._card) c._card.classList.toggle('sel', i === G.courseIdx); });
    },

    /* ---- attract mode for the chosen course ---- */
    pickCourse: function (i, rebuild) {
      G.courseIdx = (i + WC.COURSES.length) % WC.COURSES.length;
      const c = WC.COURSES[G.courseIdx];
      WC.buildCourse(c);
      G.hlCourse();
      if (rebuild) {
        G.renderer = new WC.Renderer(G.cv, c);
        G.fx = new WC.FX();
        G.renderer.fx = G.fx;
        G.onResize();
        G.grid(true);
      }
    },

    /* ================= race setup ================= */
    grid: function (attract) {
      const c = WC.COURSES[G.courseIdx];
      const g = c.geo;
      G.karts.length = 0;
      G.raceOver = false;
      const playerSlot = 6;
      let player = null;
      for (let n = 0; n < 8; n++) {
        const isPlayer = !attract && n === playerSlot;
        const chIdx = isPlayer ? G.charIdx : (G.charIdx + 1 + n) % WC.CHARS.length;
        const row = n >> 1, col = n & 1;
        const back = 46 + row * 96;
        const lat = col ? 66 : -66;
        const p = WC.trackPoint(c, (g.len - back + g.len) % g.len, lat);
        const k = new WC.Kart({
          ch: WC.CHARS[chIdx], isAI: !isPlayer, slot: n, seed: 1000 + n * 97 + G.courseIdx * 13,
          skill: 0.86 + (n % 5) * 0.032 + (c.ai ? c.ai.skill - 0.93 : 0)
        });
        k.chIdx = chIdx;
        k.x = p.x; k.y = p.y; k.ang = p.ang;
        k.prevS = k.s = WC.sampleTrack(c, k.x, k.y).s;
        k.rank = n + 1;
        k.ai.off = ((n % 3) - 1) * 0.35;
        G.karts.push(k);
        if (isPlayer) player = k;
      }
      G.player = player || G.karts[attract ? 3 : 0];
      WC.Items.reset(c);
      G.fx.clear();
      if (G.renderer) { G.renderer.cam.x = G.player.x; G.renderer.cam.y = G.player.y; G.renderer.cam.ang = G.player.ang; }
      G.rankAll(c);
    },

    startRace: function () {
      const c = WC.COURSES[G.courseIdx];
      WC.Audio.init();
      if (!G.renderer || G.renderer.c !== c) {
        G.renderer = new WC.Renderer(G.cv, c);
        G.renderer.fx = G.fx || (G.fx = new WC.FX());
        G.onResize();
      }
      G.grid(false);
      G.count = 3.4;
      G.state = 'countdown';
      G.show(null);
      G.msg = ''; G.msgT = 0;
      WC.Audio.stopMusic();
      WC.Audio.sfx('ui');
    },

    pause: function () { if (G.state === 'race' || G.state === 'countdown') { G.state = 'paused'; G.show('pause'); } },
    resume: function () { if (G.state === 'paused') { G.state = G.count > 0 ? 'countdown' : 'race'; G.show(null); } },

    /* ================= loop ================= */
    loop: function (ts) {
      requestAnimationFrame(G.loop);
      let dt = (ts - G.last) / 1000;
      G.last = ts;
      if (!(dt >= 0)) dt = 0;            // defensive: monotonic clock
      if (dt > 0.25) dt = 0.25;
      G.t += dt;
      WC.Input.poll(dt);
      WC.Audio.tick();

      /* global keys */
      if (WC.Input.consume('mute')) { WC.Audio.setMute(!WC.Audio.muted); el('btnMute').textContent = WC.Audio.muted ? 'SOUND OFF' : 'SOUND ON'; }
      if (WC.Input.consume('pause')) {
        if (G.state === 'paused') G.resume(); else if (G.state === 'race' || G.state === 'countdown') G.pause();
      }
      if (WC.Input.consume('restart') && (G.state === 'race' || G.state === 'paused')) { G.startRace(); return; }

      if (G.state === 'title') {
        if (WC.Input.consume('start') || WC.Input.consume('item')) { WC.Audio.init(); WC.Audio.sfx('select'); G.state = 'select'; G.show('select'); }
        G.attractCam(dt);
      } else if (G.state === 'select') {
        const c = WC.COURSES[G.courseIdx];
        if (WC.Input.consume('left')) G.pickCourse(G.courseIdx - 1, true);
        if (WC.Input.consume('right')) G.pickCourse(G.courseIdx + 1, true);
        if (WC.Input.consume('gas')) { G.charIdx = (G.charIdx + 1) % WC.CHARS.length; G.hlChar(); WC.Audio.sfx('ui'); }
        if (WC.Input.consume('brake')) { G.charIdx = (G.charIdx + WC.CHARS.length - 1) % WC.CHARS.length; G.hlChar(); WC.Audio.sfx('ui'); }
        if (WC.Input.consume('start') || WC.Input.consume('item')) G.startRace();
        G.stepSim(dt, true);
      } else if (G.state === 'countdown') {
        G.stepSim(dt, false);
        const before = Math.ceil(G.count);
        G.count -= dt;
        const after = Math.ceil(G.count);
        if (after !== before && after > 0) { G.say(String(after), '#ffd166', 0.6); WC.Audio.sfx('beep'); }
        if (G.count <= 0) {
          G.state = 'race';
          G.say('GO!', '#7ef7a0', 0.8);
          WC.Audio.sfx('go');
          WC.Audio.music(WC.COURSES[G.courseIdx]);
        }
      } else if (G.state === 'race') {
        G.stepSim(dt, false);
      } else if (G.state === 'paused') {
        /* frozen */
      } else if (G.state === 'results') {
        G.stepSim(dt, true);
      }
      if (G.msgT > 0) G.msgT -= dt;

      /* draw */
      if (G.renderer) {
        const showHud = G.state === 'race' || G.state === 'countdown' || G.state === 'paused';
        G.renderer.frame(dt, G.karts, G.player || G.karts[0], showHud ? G : null);
      }
      WC.Input.endFrame();
    },

    attractCam: function (dt) {
      /* slow orbit over the course for the title screen */
      const c = WC.COURSES[G.courseIdx];
      const g = c.geo;
      if (!G.attS) G.attS = 0;
      G.attS += dt * 260;
      const p = WC.trackPoint(c, G.attS % g.len, Math.sin(G.attS * 0.0016) * c.hw * 0.4);
      if (!G.renderer) { G.fx = G.fx || new WC.FX(); G.renderer = new WC.Renderer(G.cv, c); G.renderer.fx = G.fx; G.onResize(); }
      const cam = G.renderer.cam;
      cam.x = U.damp(cam.x, p.x, 4, dt); cam.y = U.damp(cam.y, p.y, 4, dt);
      cam.ang = U.damp(cam.ang, p.ang, 3, dt);
      cam.camH = 46 + Math.sin(G.t * 0.7) * 10;
    },

    /* ================= sim ================= */
    stepSim: function (dt, attract) {
      const c = WC.COURSES[G.courseIdx];
      const locked = G.state === 'countdown';
      G.acc += dt; G.aiAcc += dt;
      let steps = 0;
      const runAI = G.aiAcc >= AI_DT;
      if (runAI) G.aiAcc = 0;
      while (G.acc >= DT && steps < 4) {
        G.acc -= DT; steps++;
        const doAI = runAI && steps === 1;
        for (const k of G.karts) {
          if (locked) {
            k.gas = 0; k.brake = 0; k.steer = 0;
            k.vx = k.vy = k.vf = k.vl = k.spd = 0;        // held on the grid
          } else if (!attract && k === G.player) G.playerCtrl(k, DT);
          else if (doAI) WC.AI.step(k, c, G.karts, DT);
          k.step(DT, c);
        }
        G.kartCollisions();
        if (!locked) WC.Items.update(DT, c, G.karts, G.fx);
      }
      G.drainEvents();
      if (!attract && G.state === 'race') {
        G.rankAll(c);
        G.checkFinish(c);
      }
      G.fx.update(dt);
    },

    playerCtrl: function (k, dt) {
      const I = WC.Input;
      k.gas = I.gas; k.brake = I.brake; k.steer = I.steer;
      if (I.drift) {
        if (!k.drift && k.spd > 190 && k.z <= 1) { k.drift = true; k.hop(215); }
      } else if (k.drift) k.releaseDrift();
      if (WC.Input.consume('item') && k.item) {
        const it = WC.Items.use(k, WC.COURSES[G.courseIdx], G.karts);
        if (it === 'star') G.say('STAR!', '#ffe98a', 1.0);
        if (it === 'hex') { G.say('HEX!', '#ff9bd0', 1.0); G.renderer.shake(0.8); }
      }
    },

    kartCollisions: function () {
      const ks = G.karts, R = 62;
      for (let i = 0; i < ks.length; i++) {
        for (let j = i + 1; j < ks.length; j++) {
          const a = ks[i], b = ks[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > R * R || d2 < 1e-4) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          const push = (R - d) * 0.5;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rvn < 0) {
            const imp = -rvn * 0.45;
            a.vx -= nx * imp; a.vy -= ny * imp;
            b.vx += nx * imp; b.vy += ny * imp;
            a.spin = Math.max(a.spin, 0.12); b.spin = Math.max(b.spin, 0.12);
            if (a === G.player || b === G.player) { WC.Audio.sfx('wall'); G.renderer.shake(0.35); }
          }
          /* keep both inside the fences */
          const c = WC.COURSES[G.courseIdx];
          for (const k of [a, b]) {
            const h = WC.sampleTrack(c, k.x, k.y);
            const lim = h.wallD - WC.KART_HW;
            if (h.ad > lim) {
              const dd = U.clamp(h.d, -lim, lim);
              k.x = h.x + h.rx * dd; k.y = h.y + h.ry * dd;
            }
          }
        }
      }
    },

    rankAll: function (c) {
      const arr = G.karts.slice();
      arr.sort(function (a, b) {
        if (a.finished && b.finished) return a.finishT - b.finishT;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.prog - a.prog;
      });
      for (let i = 0; i < arr.length; i++) arr[i].rank = i + 1;
      void c;
    },

    checkFinish: function (c) {
      if (G.raceOver) return;
      const p = G.player;
      if (p.finished) {
        G.raceOver = true;
        WC.Audio.stopMusic();
        WC.Audio.sfx('finish');
        G.say('FINISH!', '#ffd166', 2.4);
        setTimeout(function () {
          G.rankAll(c);
          G.fillResults();
          G.state = 'results';
          G.show('results');
        }, 1800);
      }
    },

    /* ---- events -> particles + audio ---- */
    drainEvents: function () {
      const fx = G.fx;
      const near = [];
      for (const k of G.karts) {
        if (k.isAI) near.push({ k: k, d: Math.hypot(k.x - (G.player ? G.player.x : k.x), k.y - (G.player ? G.player.y : k.y)) });
      }
      near.sort(function (a, b) { return a.d - b.d; });
      const engines = [G.player].concat(near.slice(0, 2).map(function (o) { return o.k; }));
      WC.Audio.engines(engines, 0.016);

      for (const k of G.karts) {
        const ev = k.ev;
        for (const e of ev) {
          switch (e.t) {
            case 'drift':
              if (Math.random() < 0.34) {
                const bx = k.x - Math.cos(k.ang) * 30, by = k.y - Math.sin(k.ang) * 30;
                const col = k.tier === 3 ? '#ff7ad0' : k.tier === 2 ? '#8ef0ff' : k.tier === 1 ? '#ffe98a' : '#d8d2e2';
                fx.smoke(bx, by, 3, -k.vx * 0.05, -k.vy * 0.05, 6, col);
              }
              break;
            case 'boost':
              G.sfx('boost');
              if (k === G.player && G.renderer) G.renderer.shake(0.35);
              break;
            case 'turbo1': case 'turbo2': case 'turbo3':
              G.sfx(e.t);
              if (k === G.player) { G.say(['', 'MINI TURBO', 'SUPER TURBO', 'KATASTROPHE'][e.t.charAt(5)], '#8ef0ff', 0.7); if (G.renderer) G.renderer.shake(0.4); }
              break;
            case 'hop': fx.poof(k.x, k.y, 18); break;
            case 'unstuck': fx.poof(k.x, k.y, 46); G.sfx('hop'); break;
            case 'land': fx.poof(k.x, k.y, 22); G.sfx('land'); break;
            case 'wall':
              fx.spark(e.x, e.y, 8 + (e.v * 14) | 0);
              G.sfx('wall');
              if (k === G.player && G.renderer) G.renderer.shake(0.3 + e.v);
              break;
            case 'grass': fx.grass(k.x, k.y); break;
            case 'spin': G.sfx('spin'); break;
            case 'zap': G.sfx('hex'); break;
            case 'item': fx.poof(e.x, e.y, 26); G.sfx('item'); break;
            case 'lap':
              if (k === G.player) {
                const lt = k.lapTimes[k.lapTimes.length - 1];
                G.say('LAP ' + Math.min(k.lap + 1, WC.COURSES[G.courseIdx].laps) + '  ' + U.time(lt), '#ffd166', 1.4);
                G.sfx('lap');
              }
              break;
          }
        }
        ev.length = 0;
      }
      /* exhaust for the leader-ish karts */
      for (let i = 0; i < 2; i++) {
        const k = engines[i];
        if (k && k.spd > 200) {
          const bx = k.x - Math.cos(k.ang) * 26, by = k.y - Math.sin(k.ang) * 26;
          fx.flame(bx, by, 12, -k.vx, -k.vy, k.boostT > 0 ? 1.7 : 0.8);
        }
      }
    },

    sfx: function (n) {
      const now = G.t;
      if (G.sfxLock[n] && now - G.sfxLock[n] < 0.06) return;
      G.sfxLock[n] = now;
      WC.Audio.sfx(n);
    },

    say: function (txt, col, dur) { G.msg = txt; G.msgCol = col || '#fff'; G.msgT = dur || 1; },

    /* ================= results ================= */
    fillResults: function () {
      const host = el('resultsList');
      host.innerHTML = '';
      const c = WC.COURSES[G.courseIdx];
      G.karts.slice().sort(function (a, b) { return a.rank - b.rank; }).forEach(function (k) {
        const row = document.createElement('div');
        row.className = 'rrow' + (k === G.player ? ' me' : '');
        const best = k.lapTimes.length ? Math.min.apply(null, k.lapTimes) : 0;
        row.innerHTML = '<i>' + k.rank + '</i><b style="color:' + k.ch.body + '">' + k.ch.name + '</b>' +
          '<span>' + (k.finished ? U.time(k.finishT) : 'DNF') + '</span>' +
          '<em>best ' + (best ? U.time(best) : '--') + '</em>';
        host.appendChild(row);
      });
      el('resultsTitle').textContent = c.name + ' — ' + (G.player.rank === 1 ? 'VICTORY' : G.player.rank <= 3 ? 'PODIUM' : 'RACE OVER');
      el('resultsTitle').className = G.player.rank === 1 ? 'win' : '';
    },

    /* ================= HUD ================= */
    panel: function (ctx, x, y, w, h, r) {
      ctx.fillStyle = 'rgba(12,9,26,0.62)';
      U.rrect(ctx, x, y, w, h, r || 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      ctx.stroke();
    },

    drawHUD: function (ctx, r, w, h) {
      const p = G.player;
      if (!p) return;
      const c = WC.COURSES[G.courseIdx];
      ctx.textBaseline = 'alphabetic';

      /* ---- top-left: lap / time ---- */
      G.panel(ctx, 22, 20, 372, 96, 18);
      ctx.fillStyle = '#ffe9a8';
      ctx.font = '700 20px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText('LAP', 40, 52);
      ctx.fillStyle = '#fff';
      ctx.font = '800 44px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(Math.min(p.lap + 1, c.laps) + '/' + c.laps, 92, 62);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '600 22px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText('TIME ' + U.time(p.raceT), 40, 98);
      const best = p.lapTimes.length ? Math.min.apply(null, p.lapTimes) : 0;
      ctx.fillStyle = '#8ef0ff';
      ctx.fillText('BEST ' + (best ? U.time(best) : '--:--.--'), 224, 98);

      /* ---- top-right: minimap ---- */
      const MS = 176, mx = w - MS - 26, my = 22;
      G.panel(ctx, mx, my, MS + 16, MS + 16, 18);
      const m = WC.miniPath(c, MS, MS, 16);
      ctx.save();
      ctx.translate(mx + 8, my + 8);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = m.hw * 2 + 6;
      ctx.beginPath(); m.pts.forEach(function (q, j) { j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,238,255,0.55)'; ctx.lineWidth = m.hw * 2;
      ctx.beginPath(); m.pts.forEach(function (q, j) { j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke();
      /* boost pads */
      ctx.strokeStyle = '#5fe4ff'; ctx.lineWidth = 3;
      for (const z of (c.boost || [])) {
        ctx.beginPath();
        for (let s = z[0]; s <= z[1]; s += 0.01) {
          const q = WC.trackPoint(c, s * c.geo.len, 0);
          const px = q.x * m.k + m.ox, py = q.y * m.k + m.oy;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      /* item boxes */
      ctx.fillStyle = '#7ce8ff';
      for (const b of WC.Items.boxes) {
        if (b.taken) continue;
        ctx.fillRect(b.x * m.k + m.ox - 2, b.y * m.k + m.oy - 2, 4.5, 4.5);
      }
      /* rival dots */
      for (const k of G.karts) {
        if (k === p) continue;
        ctx.fillStyle = k.ch.body;
        ctx.beginPath(); ctx.arc(k.x * m.k + m.ox, k.y * m.k + m.oy, 4, 0, TAU); ctx.fill();
      }
      /* player arrow */
      ctx.save();
      ctx.translate(p.x * m.k + m.ox, p.y * m.k + m.oy);
      ctx.rotate(p.ang);
      ctx.fillStyle = '#fff';
      U.poly(ctx, [[7, 0], [-5, 5], [-2, 0], [-5, -5]]);
      ctx.fill();
      ctx.restore();
      ctx.restore();

      /* ---- standings ---- */
      const sy = my + MS + 30;
      G.panel(ctx, w - 262, sy, 236, 214, 16);
      ctx.font = '700 16px "Trebuchet MS", system-ui, sans-serif';
      const board = G.karts.slice().sort(function (a, b) { return a.rank - b.rank; });
      const lead = board[0];
      for (let i = 0; i < board.length; i++) {
        const k = board[i];
        const y = sy + 26 + i * 24;
        ctx.fillStyle = k === p ? '#ffd166' : 'rgba(255,255,255,0.55)';
        ctx.textAlign = 'left';
        ctx.fillText(String(k.rank), w - 248, y);
        ctx.fillStyle = k.ch.body;
        ctx.beginPath(); ctx.arc(w - 222, y - 5, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = k === p ? '#fff' : 'rgba(255,255,255,0.8)';
        ctx.fillText(k.ch.name, w - 210, y);
        if (i > 0) {
          const gap = (lead.prog - k.prog) / Math.max(180, k.spd);
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.textAlign = 'right';
          ctx.fillText(k.finished ? 'FIN' : (gap < 99 ? '+' + gap.toFixed(1) : ''), w - 36, y);
          ctx.textAlign = 'left';
        }
      }

      /* ---- speedometer ---- */
      const cx = 132, cy = h - 96, rr = 78;
      G.panel(ctx, 22, h - 196, 220, 176, 20);
      const spd = p.spd, kmh = Math.round(spd * 0.26);
      const a0 = Math.PI * 0.82, a1 = Math.PI * 2.18;
      const tt = U.clamp01(spd / 1150);
      ctx.lineWidth = 13; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1); ctx.stroke();
      const grd = ctx.createLinearGradient(cx - rr, cy, cx + rr, cy);
      grd.addColorStop(0, '#8ef0ff'); grd.addColorStop(0.6, '#ffd166'); grd.addColorStop(1, '#ff5c8a');
      ctx.strokeStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a0 + (a1 - a0) * tt); ctx.stroke();
      ctx.strokeStyle = '#ff7a5c'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, rr - 22, a0, a0 + (a1 - a0) * tt); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '800 46px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(kmh, cx, cy + 6);
      ctx.font = '700 15px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('KM/H', cx, cy + 28);
      ctx.textAlign = 'left';

      /* boost / drift charge bar */
      const bw = 200, bx = 32, by = h - 26;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      U.rrect(ctx, bx, by, bw, 14, 7); ctx.fill();
      let fill = 0, col = '#8ef0ff';
      if (p.boostT > 0) { fill = U.clamp01(p.boostT); col = '#ffb14a'; }
      else if (p.drift) {
        fill = U.clamp01(p.charge / 2.7);
        col = p.tier === 3 ? '#ff7ad0' : p.tier === 2 ? '#8ef0ff' : p.tier === 1 ? '#ffe98a' : '#9a93b8';
      }
      if (fill > 0) {
        ctx.fillStyle = col;
        U.rrect(ctx, bx, by, Math.max(14, bw * fill), 14, 7); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '700 13px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(p.boostT > 0 ? 'BOOST' : p.drift ? 'SLIDE POWER' : 'DRIFT: HOLD SHIFT', bx + 4, by - 6);

      /* ---- item slot ---- */
      const ix = 264, iy = h - 176;
      G.panel(ctx, ix, iy, 132, 132, 20);
      if (p.item) {
        const sp = WC.sprites.item[p.item];
        if (sp) {
          ctx.save();
          ctx.translate(ix + 66, iy + 108);
          ctx.scale(1.55, 1.55);
          ctx.drawImage(sp.cv, -sp.ww * 0.5, -sp.wh, sp.ww, sp.wh);
          ctx.restore();
        }
        ctx.fillStyle = '#ffd166';
        ctx.font = '700 15px "Trebuchet MS", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.item === 'redshell' ? 'RED SHELL' : p.item.toUpperCase(), ix + 66, iy + 22);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '600 12px "Trebuchet MS", system-ui, sans-serif';
        ctx.fillText('SPACE', ix + 46, iy + 128);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '700 42px "Trebuchet MS", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', ix + 66, iy + 82);
        ctx.textAlign = 'left';
      }

      /* ---- centre messages ---- */
      if (G.state === 'countdown') {
        const n = Math.ceil(G.count);
        const txt = n > 3 ? '' : String(n);
        if (txt) {
          const k = 1 - (G.count % 1);
          ctx.save();
          ctx.translate(w / 2, h * 0.42);
          ctx.scale(1 + k * 0.25, 1 + k * 0.25);
          ctx.globalAlpha = 0.35 + 0.65 * (1 - k);
          ctx.fillStyle = '#ffd166';
          ctx.font = '900 150px "Trebuchet MS", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.strokeStyle = 'rgba(20,10,30,0.8)'; ctx.lineWidth = 12;
          ctx.strokeText(txt, 0, 0);
          ctx.fillText(txt, 0, 0);
          ctx.restore();
        }
      }
      if (G.msgT > 0 && G.msg) {
        const a = U.clamp01(G.msgT * 2.2);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(w / 2, h * 0.30);
        ctx.scale(1 + (1 - a) * 0.12, 1 + (1 - a) * 0.12);
        ctx.font = '900 58px "Trebuchet MS", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(18,10,28,0.85)'; ctx.lineWidth = 10;
        ctx.strokeText(G.msg, 0, 0);
        ctx.fillStyle = G.msgCol;
        ctx.fillText(G.msg, 0, 0);
        ctx.restore();
      }
      ctx.textAlign = 'left';
    }
  };

  WC.boot = function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { G.boot(); });
    else G.boot();
  };
})(typeof window !== 'undefined' ? window : global);
