/* ============================================================
   tools/shot.js - render real screenshots of the game in node.

   Uses the software Canvas2D in test/raster.js, boots the actual
   game modules, drives a race with synthetic input, and writes PNGs
   out of the display canvas (and optionally the internal 480x270
   buffer and the sprite atlas).

     node tools/shot.js                          four circuits, mid-race
     node tools/shot.js --course=grim --at=400 --internal
     node tools/shot.js --sprites
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const stub = require(path.join(ROOT, 'test/dom.js'));
const raster = require(path.join(ROOT, 'test/raster.js'));
const { writePNG } = require(path.join(ROOT, 'tools/png.js'));

const argv = process.argv.slice(2).reduce((a, s) => {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(s); if (m) a[m[1]] = m[2] === undefined ? true : m[2]; return a;
}, {});
const OUT = argv.out || '/tmp/wc';
fs.mkdirSync(OUT, { recursive: true });

/* ---- headless DOM whose canvases actually rasterize ------- */
stub.install(global);
const ce = global.document.createElement;
global.document.createElement = function (t) {
  const el = ce.call(global.document, t);
  if (String(t).toLowerCase() === 'canvas') raster.attach(el);
  return el;
};
const gei = global.document.getElementById;
global.document.getElementById = function (id) {
  const el = gei.call(global.document, id);
  if (el.tagName === 'CANVAS' && !el._ctx) raster.attach(el);
  return el;
};

for (const f of ['util', 'track', 'sprites', 'particles', 'items', 'kart', 'ai', 'input', 'audio', 'render', 'game'])
  require(path.join(ROOT, 'js', f + '.js'));

const WC = global.WC, G = WC.Game;
WC.boot();

let ts = Date.now();
const frames = (n) => { for (let i = 0; i < n; i++) { ts += 16.7; global.__raf.splice(0).forEach(f => f(ts)); } };
const down = (c) => global.__fire('keydown', { code: c });
const up = (c) => global.__fire('keyup', { code: c });

function shot(name, w, h, buf, alpha) {
  const file = path.join(OUT, name + '.png');
  writePNG(file, w, h, buf, alpha);
  let lit = 0, sum = 0, n = w * h;
  for (let i = 0; i < buf.length; i += 4) { const l = (buf[i] + buf[i + 1] + buf[i + 2]) / 3; if (buf[i + 3] > 8 && l > 24) lit++; sum += l; }
  console.log('  ' + file + '  ' + w + 'x' + h + '  ink ' + (lit / n * 100).toFixed(0) + '%  avg ' + (sum / n).toFixed(0));
}

if (argv.sprites) {
  const S = WC.sprites;
  let x = 0, y = 0, maxw = 0;
  const items = [];
  for (const id in S.decor) items.push([id, S.decor[id]]);
  for (const id in S.item) items.push(['item:' + id, S.item[id]]);
  for (const id in S.kart) for (const v of ['rear', 'side', 'front']) if (S.kart[id][v]) items.push([id + ':' + v, S.kart[id][v]]);
  const W = 1024, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  for (const [nm, sp] of items) {
    if (!sp || !sp.cv || !sp.cv.width) continue;
    if (x + sp.cv.width > W) { x = 0; y += maxw + 4; maxw = 0; }
    ctx.drawImage(sp.cv, x, y);
    ctx.fillStyle = '#ff0'; ctx.fillRect(x, y, 1, sp.cv.height);
    x += sp.cv.width + 2; maxw = Math.max(maxw, sp.cv.height);
  }
  shot('sprites', W, H, c.getContext('2d').fb, true);
  process.exit(0);
}

if (argv.ground) {
  const c = WC.COURSES.filter(x => x.id === argv.ground)[0] || WC.COURSES[0];
  WC.buildCourse(c);
  const t = c.tex || WC.bakeTrack(c);
  t.mips.forEach((buf, i) => {
    const sz = t.size >> i, rgba = new Uint8Array(sz * sz * 4);
    for (let n = 0; n < sz * sz; n++) {
      const p = buf[n];
      rgba[n * 4] = (p >> 16) & 255; rgba[n * 4 + 1] = (p >> 8) & 255; rgba[n * 4 + 2] = p & 255; rgba[n * 4 + 3] = 255;
    }
    shot('ground-' + c.id + '-mip' + i, sz, sz, rgba);
  });
  process.exit(0);
}

if (argv.title) { frames(90); const cv = G.cv; shot('title', cv.width, cv.height, cv.getContext('2d').fb); }

const courses = argv.course ? [argv.course] : WC.COURSES.map(c => c.id);
for (const id of courses) {
  const i = WC.COURSES.findIndex(c => c.id === id);
  if (i < 0) { console.log('no such course: ' + id); continue; }
  G.pickCourse(i, true);
  G.startRace();
  G.state = 'race'; G.count = 0;                 // skip the countdown for the shot
  const upto = parseInt(argv.at || '240', 10);
  /* autopilot - follow the racing line so the shot shows real driving,
     not a kart pinned into the first fence */
  const c = G.c || WC.COURSES[G.courseIdx], keys = {};
  const setKey = (code, on) => {
    if (!!keys[code] === !!on) return;
    keys[code] = on;
    global.__fire(on ? 'keydown' : 'keyup', { code: code });
  };
  for (let s = 0; s < upto; s++) {
    const p = G.player;
    const h = WC.sampleTrack(c, p.x, p.y);
    const look = WC.trackPoint(c, h.s + 170 + p.spd * 0.16, 0);
    const err = WC.U.angNorm(Math.atan2(look.y - p.y, look.x - p.x) - p.ang);
    const wide = Math.abs(h.d) > c.hw * 0.55;
    setKey('ArrowLeft', err < -0.035 || (wide && h.d > 0));
    setKey('ArrowRight', err > 0.035 || (wide && h.d < 0));
    const hair = Math.abs(err) > 0.30 && p.spd > 470;
    setKey('ArrowUp', !hair);
    setKey('ArrowDown', hair);
    const drifting = Math.abs(err) > 0.16 && p.spd > 430;
    setKey('ShiftLeft', drifting);
    setKey('Space', drifting && p.spd > 500);
    if (s % 90 === 0 && p.item) WC.Items.use(p, c, G.karts);
    frames(1);
  }
  for (const k in keys) setKey(k, false);
  const p = G.player;
  console.log(id.padEnd(6), 'lap ' + (p.lap + 1) + '/3  P' + p.rank + '  ' + Math.round(p.spd * 0.26) + ' km/h  item=' + (p.item || '-') + '  boost=' + p.boostT.toFixed(1));
  const cv = G.cv;
  shot(id, cv.width, cv.height, cv.getContext('2d').fb);
  if (argv.internal) shot(id + '-internal', G.renderer.W, G.renderer.H, G.renderer.img.data);
}
console.log('\nwrote to ' + OUT);
