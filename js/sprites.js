/* ============================================================
   WITCH CART - sprites.js
   Procedurally baked billboard sprites (decor, karts, items).
   Every sprite is { cv, ww, wh, ax } :
     cv = offscreen canvas, ww/wh = size in WORLD units,
     ax = horizontal anchor 0..1, vertical anchor = bottom edge.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC, U = WC.U, TAU = WC.TAU;

  WC.sprites = { decor: {}, kart: [], item: {}, box: null, flag: null };

  function bake(ww, wh, px, draw) {
    const cw = Math.max(2, Math.round(ww * px)), ch = Math.max(2, Math.round(wh * px));
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const x = cv.getContext('2d');
    x.translate(cw / 2, ch);          // anchor: bottom-centre
    x.scale(px, px);                  // 1 unit = 1 world unit
    x.lineJoin = 'round'; x.lineCap = 'round';
    draw(x, ww, wh);
    return { cv: cv, ww: ww, wh: wh, ax: 0.5 };
  }

  /* ------------------------------------------------ decor ---- */
  const rnd0 = U.rng(4242);

  function trunk(x, w, h, col) {
    x.fillStyle = col;
    U.poly(x, [[-w, 0], [w, 0], [w * 0.55, -h], [-w * 0.55, -h]]); x.fill();
  }

  const DECOR = {
    tree: function (x) {
      trunk(x, 7, 34, '#4a3222');
      const g = ['#1f5c2a', '#277030', '#2f8438'];
      for (let i = 0; i < 3; i++) {
        const y = -28 - i * 20, w = 34 - i * 7, h = 30 - i * 4;
        x.fillStyle = g[i % 3];
        U.poly(x, [[-w, y], [w, y], [0, y - h]]); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.10)';
        U.poly(x, [[-w * 0.45, y], [0, y], [0, y - h * 0.86]]); x.fill();
      }
    },
    deadtree: function (x) {
      trunk(x, 6, 44, '#3b2b23');
      x.strokeStyle = '#4a3529'; x.lineWidth = 4.5;
      for (let i = 0; i < 6; i++) {
        const y = -30 - i * 9, s = (i & 1) ? 1 : -1;
        x.beginPath(); x.moveTo(0, y);
        x.quadraticCurveTo(s * 18, y - 8, s * 30 - s * 3, y - 24 - (i % 3) * 6);
        x.stroke();
      }
      x.strokeStyle = '#2c211c'; x.lineWidth = 2.2;
      x.beginPath(); x.moveTo(-3, -60); x.lineTo(4, -84); x.stroke();
    },
    palm: function (x) {
      x.strokeStyle = '#8a6a41'; x.lineWidth = 8;
      x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(10, -40, 4, -74); x.stroke();
      x.strokeStyle = '#2f7a3d'; x.lineWidth = 7;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.52;
        x.beginPath(); x.moveTo(4, -74);
        x.quadraticCurveTo(4 + Math.cos(a) * 26, -74 + Math.sin(a) * 20,
          4 + Math.cos(a) * 44, -74 + Math.sin(a) * 34 + 8);
        x.stroke();
      }
      x.fillStyle = '#7c5b33';
      x.beginPath(); x.arc(2, -70, 5, 0, TAU); x.fill();
    },
    mushroom: function (x) {
      x.fillStyle = '#e9e2cf';
      U.poly(x, [[-9, 0], [9, 0], [7, -26], [-7, -26]]); x.fill();
      x.fillStyle = '#d2483f';
      x.beginPath(); x.ellipse(0, -28, 27, 19, 0, Math.PI, TAU); x.fill();
      x.fillStyle = '#f7f2e6';
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + 0.35 + i * 0.42;
        x.beginPath(); x.ellipse(Math.cos(a) * 18, -28 + Math.sin(a) * 13, 4.6, 3.4, 0, 0, TAU); x.fill();
      }
      x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(-8, -12, 16, 3);
    },
    crystal: function (x) {
      const c = ['#7be0f2', '#57b8e8', '#3f7fd8'];
      for (let i = 0; i < 3; i++) {
        const s = (i - 1) * 13, h = 40 - i * 8, w = 11 - i * 2;
        x.fillStyle = c[i];
        U.poly(x, [[s - w, 0], [s + w, 0], [s + w * 0.4, -h], [s - w * 0.5, -h * 0.86]]); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.35)';
        U.poly(x, [[s - w * 0.2, 0], [s + w * 0.15, 0], [s, -h * 0.9]]); x.fill();
      }
    },
    pumpkin: function (x) {
      x.fillStyle = '#e07a24';
      for (let i = -2; i <= 2; i++) {
        x.beginPath();
        x.ellipse(i * 9, -20, 12 - Math.abs(i) * 2.6, 21 - Math.abs(i) * 2, 0, 0, TAU); x.fill();
      }
      x.strokeStyle = '#4d7a2c'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(0, -39); x.quadraticCurveTo(7, -48, 2, -54); x.stroke();
      x.fillStyle = '#2a1a10';
      U.poly(x, [[-11, -24], [-4, -18], [-4, -27]]); x.fill();
      U.poly(x, [[11, -24], [4, -18], [4, -27]]); x.fill();
      x.fillRect(-8, -13, 16, 4);
    },
    rock: function (x) {
      x.fillStyle = '#6b6f76';
      U.poly(x, [[-28, 0], [-16, -26], [4, -34], [22, -22], [30, 0]]); x.fill();
      x.fillStyle = '#868b93';
      U.poly(x, [[-16, -26], [4, -34], [10, -18], [-8, -12]]); x.fill();
      x.fillStyle = 'rgba(0,0,0,0.30)';
      U.poly(x, [[-28, 0], [-8, -12], [30, 0]]); x.fill();
    },
    tomb: function (x) {
      x.fillStyle = '#7d8089';
      x.beginPath();
      x.moveTo(-18, 0); x.lineTo(-18, -34);
      x.quadraticCurveTo(0, -58, 18, -34); x.lineTo(18, 0); x.closePath(); x.fill();
      x.fillStyle = '#5f636c'; x.fillRect(-22, -8, 44, 8);
      x.strokeStyle = '#3c3f46'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(0, -44); x.lineTo(0, -22); x.moveTo(-9, -34); x.lineTo(9, -34); x.stroke();
    },
    lamp: function (x) {
      x.fillStyle = '#2b2a35';
      x.fillRect(-3.5, -74, 7, 74);
      x.fillRect(-11, -4, 22, 6);
      const g = x.createRadialGradient(0, -80, 2, 0, -80, 26);
      g.addColorStop(0, 'rgba(255,238,170,0.95)');
      g.addColorStop(0.35, 'rgba(255,208,102,0.55)');
      g.addColorStop(1, 'rgba(255,190,80,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(0, -80, 26, 0, TAU); x.fill();
      x.fillStyle = '#fff3cf';
      x.beginPath(); x.arc(0, -80, 9, 0, TAU); x.fill();
      x.fillStyle = '#2b2a35';
      U.poly(x, [[-12, -70], [12, -70], [8, -78], [-8, -78]]); x.fill();
    },
    fence: function (x) {
      x.fillStyle = '#6b4c30';
      x.fillRect(-34, -30, 6, 30); x.fillRect(28, -30, 6, 30);
      x.fillStyle = '#87613c';
      x.fillRect(-36, -26, 72, 5); x.fillRect(-36, -13, 72, 5);
    },
    barrier: function (x) {
      x.fillStyle = '#3a3550'; x.fillRect(-52, -34, 104, 34);
      x.fillStyle = '#e8483f';
      for (let i = 0; i < 5; i++) x.fillRect(-52 + i * 21, -34, 10, 34);
      x.fillStyle = '#f5f2ea'; x.fillRect(-52, -38, 104, 5);
    },
    banner: function (x) {
      x.fillStyle = '#2b2a35'; x.fillRect(-3, -96, 6, 96);
      const w = 34, top = -94;
      x.fillStyle = '#8b2f6b';
      U.poly(x, [[-2, top], [w, top + 5], [w * 0.8, top + 34], [-2, top + 28]]); x.fill();
      x.fillStyle = '#ffd166';
      x.beginPath(); x.arc(w * 0.45, top + 17, 7, 0, TAU); x.fill();
    },
    stand: function (x) {
      x.fillStyle = '#2d2b3d';
      U.poly(x, [[-130, 0], [130, 0], [112, -96], [-112, -96]]); x.fill();
      for (let r = 0; r < 6; r++) {
        const y = -12 - r * 14, w = 124 - r * 4;
        x.fillStyle = r & 1 ? '#3b3852' : '#464261';
        x.fillRect(-w, y - 10, w * 2, 10);
        const rng = U.rng(77 + r * 31);
        for (let i = 0; i < 42; i++) {
          x.fillStyle = U.rgb(U.mix(U.hex('#ffd166'), U.hex('#8ce0ff'), rng()));
          x.globalAlpha = 0.5 + rng() * 0.5;
          x.beginPath(); x.arc(-w + 5 + i * (w * 2 - 10) / 41, y - 6, 2.6, 0, TAU); x.fill();
        }
        x.globalAlpha = 1;
      }
      x.fillStyle = '#1c1b28'; x.fillRect(-130, -100, 260, 8);
    },
    gantry: function (x, ww) {
      const half = ww / 2, h = whOf(ww);
      x.fillStyle = '#221f30'; x.fillRect(-half, -h, 20, h); x.fillRect(half - 20, -h, 20, h);
      x.fillStyle = '#312c46'; x.fillRect(-half, -h, ww, 26);
      const cols = 10;
      for (let i = 0; i < cols; i++) {
        x.fillStyle = (i & 1) ? '#f6f4ee' : '#15141b';
        x.fillRect(-half + i * (ww / cols), -h + 26, ww / cols, 12);
      }
      x.fillStyle = '#ffd166';
      x.font = 'bold 26px system-ui, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('START', 0, -h + 13);
    }
  };
  function whOf(ww) { return ww * 0.42; }

  const DSIZE = {
    tree: [64, 110, 2.2], deadtree: [58, 96, 2.2], palm: [96, 96, 2.2], mushroom: [54, 54, 3],
    crystal: [54, 56, 3], pumpkin: [60, 56, 3], rock: [62, 36, 3], tomb: [48, 60, 3],
    lamp: [54, 108, 2.4], fence: [76, 32, 3], barrier: [104, 38, 3], banner: [72, 100, 2.4],
    stand: [260, 104, 1.6], gantry: [620, 250, 1.2]
  };

  /* ------------------------------------------------- karts ---- */
  function kartPaint(x, ch, view) {
    /* view: 0 = rear, 1 = side, 2 = front - each one is drawn separately
       so a pack of karts reads as karts, not as eight portraits. */
    const body = ch.body, trim = ch.trim, side = view === 1, rear = view === 0;
    const dk = U.rgb(U.shade(U.hex(body), 0.55));
    const cloak = ch.cloak || U.rgb(U.shade(U.hex(body), 0.72));
    const hair = ch.hair || U.rgb(U.shade(U.hex(ch.hat), 0.85));
    const hy = -50;                        // rider head centre
    const ghost = ch.kind === 'ghost', cat = ch.kind === 'cat';

    /* contact shadow */
    x.fillStyle = 'rgba(0,0,0,0.28)';
    x.beginPath();
    if (side) x.ellipse(-2, -3, 46, 6, 0, 0, TAU); else x.ellipse(0, -3, 41, 7, 0, 0, TAU);
    x.fill();

    /* wheels */
    x.fillStyle = '#16151c';
    if (side) {
      U.rrect(x, -43, -21, 18, 21, 7); x.fill();
      U.rrect(x, 26, -21, 18, 21, 7); x.fill();
      x.fillStyle = '#c9c3b2';
      x.beginPath(); x.arc(-34, -11, 4.2, 0, TAU); x.fill();
      x.beginPath(); x.arc(35, -11, 4.2, 0, TAU); x.fill();
    } else {
      U.rrect(x, -45, -19, 14, 19, 5); x.fill();
      U.rrect(x, 31, -19, 14, 19, 5); x.fill();
      if (rear) { x.fillStyle = '#2b2934'; x.fillRect(-45, -8, 14, 4); x.fillRect(31, -8, 14, 4); }
    }

    /* chassis */
    if (side) {
      x.fillStyle = dk; U.poly(x, [[-46, -6], [-40, -24], [18, -27], [42, -17], [46, -6]]); x.fill();
      x.fillStyle = body; U.poly(x, [[-44, -8], [-38, -22], [18, -25], [40, -16], [44, -8]]); x.fill();
      x.fillStyle = trim; x.fillRect(-38, -25, 58, 4);
      x.fillStyle = '#6c6a78'; U.rrect(x, -52, -15, 11, 8, 3); x.fill();
      x.fillStyle = 'rgba(255,150,60,0.45)';
      x.beginPath(); x.arc(-54, -11, 5, 0, TAU); x.fill();
    } else if (rear) {
      x.fillStyle = dk; U.poly(x, [[-42, -6], [-36, -28], [36, -28], [42, -6]]); x.fill();
      x.fillStyle = body; U.poly(x, [[-38, -8], [-33, -25], [33, -25], [38, -8]]); x.fill();
      x.fillStyle = trim; x.fillRect(-33, -25, 66, 4);
      x.fillStyle = '#ff5a3c';
      U.rrect(x, -30, -21, 13, 7, 3); x.fill();
      U.rrect(x, 17, -21, 13, 7, 3); x.fill();
      x.fillStyle = '#7b7989';
      U.rrect(x, -18, -13, 9, 9, 3); x.fill();
      U.rrect(x, 9, -13, 9, 9, 3); x.fill();
      x.fillStyle = 'rgba(255,150,60,0.40)';
      x.beginPath(); x.arc(-13.5, -9, 6, 0, TAU); x.fill();
      x.beginPath(); x.arc(13.5, -9, 6, 0, TAU); x.fill();
    } else {
      x.fillStyle = dk; U.poly(x, [[-42, -6], [-36, -27], [36, -27], [42, -6]]); x.fill();
      x.fillStyle = body; U.poly(x, [[-38, -8], [-33, -24], [33, -24], [38, -8]]); x.fill();
      x.fillStyle = trim; x.fillRect(-33, -24, 66, 4);
      x.fillStyle = '#ffe9a8';
      x.beginPath(); x.ellipse(-21, -15, 8, 6, 0, 0, TAU); x.fill();
      x.beginPath(); x.ellipse(21, -15, 8, 6, 0, 0, TAU); x.fill();
      x.fillStyle = '#7b7989'; x.fillRect(-10, -12, 20, 5);
    }

    /* rider */
    if (ghost) {
      x.fillStyle = 'rgba(216,233,255,0.80)';
      x.beginPath(); x.arc(0, hy + 3, 15, Math.PI, TAU); x.fill();
      x.beginPath(); x.moveTo(-15, hy + 3);
      for (let i = 0; i <= 4; i++) x.lineTo(-15 + i * 7.5, hy + (i % 2 ? 15 : 7));
      x.lineTo(15, hy + 3); x.closePath(); x.fill();
      if (!rear) {
        x.fillStyle = '#1b2340';
        x.beginPath();
        if (side) { x.arc(5, hy + 1, 2.6, 0, TAU); }
        else { x.arc(-5, hy + 1, 2.8, 0, TAU); x.moveTo(7.8, hy + 1); x.arc(5, hy + 1, 2.8, 0, TAU); }
        x.fill();
      }
    } else {
      /* shoulders */
      x.fillStyle = cloak;
      if (side) U.poly(x, [[-13, hy + 17], [-8, hy + 2], [11, hy + 2], [17, hy + 17]]);
      else U.poly(x, [[-19, hy + 17], [-12, hy + 3], [12, hy + 3], [19, hy + 17]]);
      x.fill();
      /* head */
      x.fillStyle = ch.skin;
      x.beginPath(); x.arc(0, hy, side ? 13 : 14, 0, TAU); x.fill();
      if (cat) {
        x.fillStyle = hair;
        U.poly(x, [[-11, hy - 5], [-8, hy - 20], [-1, hy - 8]]); x.fill();
        if (!side) { U.poly(x, [[11, hy - 5], [8, hy - 20], [1, hy - 8]]); x.fill(); }
      } else if (rear) {
        U.poly(x, [[-13, hy + 9], [-11, hy - 7], [11, hy - 7], [13, hy + 9], [5, hy + 14], [-5, hy + 14]]); x.fill();
      } else {
        U.rrect(x, -13, hy - 9, 26, 19, 8); x.fill();
      }
      if (!cat) {
        /* hat */
        x.fillStyle = ch.hat;
        if (side) U.poly(x, [[-14, hy - 6], [13, hy - 6], [3, hy - 38], [-5, hy - 36]]);
        else U.poly(x, [[-18, hy - 5], [18, hy - 5], [7, hy - 38], [-4, hy - 38]]);
        x.fill();
        x.fillStyle = U.rgb(U.shade(U.hex(ch.hat), 0.72));
        x.beginPath(); x.ellipse(0, hy - 5, side ? 17 : 21, 5, 0, 0, TAU); x.fill();
        x.fillStyle = trim; x.fillRect(side ? -5 : -8, hy - 13, side ? 11 : 16, 4);
      }
      /* face - the rear view stays faceless */
      if (!rear) {
        x.fillStyle = '#1b1526';
        x.beginPath();
        if (side) { x.arc(6, hy + 3, 2.1, 0, TAU); }
        else { x.arc(-4.5, hy + 3, 2.2, 0, TAU); x.moveTo(6.7, hy + 3); x.arc(4.5, hy + 3, 2.2, 0, TAU); }
        x.fill();
        if (cat) {
          x.strokeStyle = '#1b1526'; x.lineWidth = 1.2;
          x.beginPath();
          if (side) { x.moveTo(9, hy + 6); x.lineTo(18, hy + 4); x.moveTo(9, hy + 8); x.lineTo(17, hy + 9); }
          else {
            x.moveTo(-8, hy + 6); x.lineTo(-18, hy + 4); x.moveTo(-8, hy + 8); x.lineTo(-17, hy + 9);
            x.moveTo(8, hy + 6); x.lineTo(18, hy + 4); x.moveTo(8, hy + 8); x.lineTo(17, hy + 9);
          }
          x.stroke();
        } else if (ch.stache) {
          x.strokeStyle = '#d8d2c6'; x.lineWidth = 2;
          x.beginPath(); x.arc(side ? 5 : 0, hy + 8, 5, 0.2, Math.PI - 0.2); x.stroke();
        }
      }
      if (side) {
        x.strokeStyle = ch.skin; x.lineWidth = 5.5;
        x.beginPath(); x.moveTo(3, hy + 12); x.lineTo(21, hy + 5); x.stroke();
      }
    }
  }

  /* ------------------------------------------------ items ---- */
  const ITEM_DRAW = {
    mushroom: function (x) {
      x.fillStyle = '#f2ead6'; U.poly(x, [[-7, 0], [7, 0], [5, -18], [-5, -18]]); x.fill();
      x.fillStyle = '#e63f36'; x.beginPath(); x.ellipse(0, -19, 20, 15, 0, Math.PI, TAU); x.fill();
      x.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + 0.5 + i * 0.52;
        x.beginPath(); x.ellipse(Math.cos(a) * 13, -19 + Math.sin(a) * 10, 3.6, 2.8, 0, 0, TAU); x.fill();
      }
    },
    shell: function (x) {
      x.fillStyle = '#2fbf5a'; x.beginPath(); x.ellipse(0, -16, 22, 16, 0, 0, TAU); x.fill();
      x.fillStyle = '#f7f2e2'; x.beginPath(); x.ellipse(0, -8, 15, 8, 0, 0, TAU); x.fill();
      x.strokeStyle = '#137a34'; x.lineWidth = 3;
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 8, -30); x.lineTo(i * 6, -8); x.stroke(); }
    },
    redshell: function (x) {
      x.fillStyle = '#e0392f'; x.beginPath(); x.ellipse(0, -16, 22, 16, 0, 0, TAU); x.fill();
      x.fillStyle = '#f7f2e2'; x.beginPath(); x.ellipse(0, -8, 15, 8, 0, 0, TAU); x.fill();
      x.strokeStyle = '#8c1b16'; x.lineWidth = 3;
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 8, -30); x.lineTo(i * 6, -8); x.stroke(); }
    },
    banana: function (x) {
      x.strokeStyle = '#f2d13c'; x.lineWidth = 11;
      x.beginPath(); x.arc(0, 4, 20, Math.PI * 1.12, Math.PI * 1.9); x.stroke();
      x.strokeStyle = '#8a6b1f'; x.lineWidth = 4;
      x.beginPath(); x.arc(0, 4, 20, Math.PI * 1.16, Math.PI * 1.86); x.stroke();
    },
    hex: function (x) {
      x.fillStyle = '#ffd166';
      U.poly(x, [[0, -36], [10, -22], [26, -20], [16, -8], [22, 8], [0, -2], [-22, 8], [-16, -8], [-26, -20], [-10, -22]]); x.fill();
      x.strokeStyle = '#b8862a'; x.lineWidth = 2; x.stroke();
    },
    star: function (x) {
      x.fillStyle = '#ffe98a';
      U.poly(x, [[0, -34], [8, -16], [28, -14], [13, -2], [18, 16], [0, 7], [-18, 16], [-13, -2], [-28, -14], [-8, -16]]); x.fill();
    }
  };

  /* ------------------------------------------------- bake ---- */
  WC.bakeSprites = function (chars) {
    const S = WC.sprites;
    for (const k in DECOR) {
      const d = DSIZE[k] || [60, 60, 2];
      S.decor[k] = bake(d[0], d[1], d[2], DECOR[k]);
    }
    S.kart = [];
    const KW = 96, KH = 76;
    for (const ch of chars) {
      const views = [];
      for (let v = 0; v < 3; v++) views.push(bake(KW, KH, 3, function (x) { kartPaint(x, ch, v); }));
      S.kart.push(views);
    }
    S.item = {};
    for (const k in ITEM_DRAW) S.item[k] = bake(56, 44, 3, ITEM_DRAW[k]);
    S.box = bake(74, 74, 2.4, function (x) {
      const t = Date.now();
      x.fillStyle = 'rgba(90,220,255,0.30)';
      x.beginPath(); x.arc(0, -36, 38, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.16)';
      U.poly(x, [[-26, -36], [0, -62], [26, -36], [0, -10]]); x.fill();
      x.strokeStyle = '#9beaff'; x.lineWidth = 3.5;
      U.poly(x, [[-24, -36], [0, -60], [24, -36], [0, -12]]); x.stroke();
      x.fillStyle = '#eafaff';
      x.font = 'bold 30px system-ui, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('?', 0, -36);
      void t;
    });
    S.flag = bake(60, 60, 3, function (x) {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        x.fillStyle = ((r + c) & 1) ? '#15141b' : '#f6f4ee';
        x.fillRect(-30 + c * 15, -60 + r * 15, 15, 15);
      }
    });
    return S;
  };
})(typeof window !== 'undefined' ? window : global);
