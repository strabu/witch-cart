/* ============================================================
   test/smoke.js - headless integration test
   boots the game against a stub DOM, drives menus with fake
   key events, renders frames, validates the mode-7 framebuffer
   and runs a full race simulation.
     node test/smoke.js
   ============================================================ */
'use strict';
const stub = require('./dom.js');
const doc = stub.install(global);

require('../js/util.js');
require('../js/track.js');
require('../js/sprites.js');
require('../js/particles.js');
require('../js/items.js');
require('../js/kart.js');
require('../js/ai.js');
require('../js/input.js');
require('../js/audio.js');
require('../js/render.js');
require('../js/game.js');

const WC = global.WC, U = WC.U, G = WC.Game;
let bad = 0;
const fail = (m) => { bad++; console.log('  !! ' + m); };
const ok = (m) => console.log('  ok  ' + m);
const finite = (v) => typeof v === 'number' && isFinite(v);

let vts = Date.now();
function frames(n, dtMs) {
  const dt = dtMs || 16.7;
  for (let i = 0; i < n; i++) {
    vts += dt;
    const cbs = global.__raf.splice(0, global.__raf.length);
    if (!cbs.length) throw new Error('main loop stopped requesting frames');
    for (const cb of cbs) cb(vts);
  }
}
function key(code) { global.__fire('keydown', { code: code }); frames(1); global.__fire('keyup', { code: code }); frames(1); }

console.log('boot');
WC.boot();
if (!WC.sprites.kart.length) fail('sprites not baked');
if (WC.sprites.kart.length !== WC.CHARS.length) fail('kart sprite count mismatch');
if (!WC.sprites.decor.tree || !WC.sprites.decor.gantry) fail('decor sprites missing');
ok('baked ' + Object.keys(WC.sprites.decor).length + ' decor + ' + WC.sprites.kart.length + ' karts');

console.log('title screen');
frames(20);
if (G.state !== 'title') fail('state=' + G.state + ' expected title');
const r0 = G.renderer;
if (!r0 || !r0.dst) fail('renderer missing');
ok('renderer ' + r0.W + 'x' + r0.H + ' display ' + r0.dw + 'x' + r0.dh);

console.log('menu navigation');
key('Enter');
if (G.state !== 'select') fail('Enter did not open select (state=' + G.state + ')');
const grid = doc.getElementById('courses');
if (grid.children.length !== WC.COURSES.length) fail('course cards: ' + grid.children.length);
if (doc.getElementById('chars').children.length !== WC.CHARS.length) fail('char cards');
key('ArrowRight'); key('ArrowRight');
if (G.courseIdx !== 2) fail('course navigation -> ' + G.courseIdx);
key('ArrowUp'); key('ArrowUp');
if (G.charIdx !== 2) fail('char navigation -> ' + G.charIdx);
frames(10);
ok('select works, course=' + WC.COURSES[G.courseIdx].id + ' rider=' + WC.CHARS[G.charIdx].name);

console.log('race + framebuffer');
key('Enter');
if (G.state !== 'countdown') fail('race did not start (state=' + G.state + ')');
frames(30);
if (G.state !== 'countdown') fail('countdown too short');
frames(240);                                   /* ~4 s: countdown + go */
if (G.state !== 'race') fail('never reached race (state=' + G.state + ')');
const p = G.player;
if (!p) return fail('no player kart');
global.__fire('keydown', { code: 'ArrowUp' });
frames(90);
if (!(p.spd > 200)) fail('player did not accelerate (spd=' + p.spd.toFixed(1) + ')');
if (!finite(p.x) || !finite(p.y) || !finite(p.ang)) fail('player state not finite');

/* framebuffer sanity: opaque, vertically graded (sky above, ground below) */
const dst = G.renderer.dst, W = G.renderer.W, H = G.renderer.H;
let opaque = true, distinct = new Set();
for (let i = 0; i < dst.length; i += 97) { if ((dst[i] >>> 24) !== 255) opaque = false; distinct.add(dst[i]); }
if (!opaque) fail('framebuffer has transparent pixels');
if (distinct.size < 40) fail('framebuffer looks flat (' + distinct.size + ' colours)');
const rowTop = dst[Math.floor(G.renderer.cam.horizon * 0.5) * W + 8];
const rowBot = dst[(H - 2) * W + 8];
if (rowTop === rowBot) fail('ground and sky rows identical');
ok('framebuffer ok, ' + distinct.size + ' sampled colours, horizon=' + G.renderer.cam.horizon.toFixed(1));

/* drift + item + pause round trip */
global.__fire('keydown', { code: 'ArrowRight' });
global.__fire('keydown', { code: 'ShiftLeft' });
frames(60);
if (!p.drift) fail('drift did not engage');
global.__fire('keyup', { code: 'ShiftLeft' });
frames(3);
if (p.drift) fail('drift did not release');
global.__fire('keyup', { code: 'ArrowRight' });
if (!p.boostT && !p.tier) ok('drift cycle clean (boost=' + p.boostT.toFixed(2) + ')');
key('Escape');
if (G.state !== 'paused') fail('pause failed');
key('Escape');
if (G.state !== 'race') fail('resume failed');
ok('pause/resume ok, particles=' + G.fx.list.length);

console.log('full race simulation (ai-driven)');
const t0 = Date.now();
let simT = 0, maxAd = 0, steps = 0, offWall = 0;
while (simT < 150 && !p.finished) {
  G.stepSim(1 / 60, true);
  simT += 1 / 60; steps++;
  for (const k of G.karts) {
    if (!finite(k.x) || !finite(k.y) || !finite(k.spd)) { fail('kart ' + k.ch.name + ' went NaN'); break; }
    const h = WC.sampleTrack(WC.COURSES[G.courseIdx], k.x, k.y);
    if (h.ad > h.wallD + 1) offWall++;
    if (h.ad > maxAd) maxAd = h.ad;
  }
}
const c = WC.COURSES[G.courseIdx];
if (offWall) fail(offWall + ' samples outside the fences');
console.log('  sim ' + simT.toFixed(1) + 's in ' + (Date.now() - t0) + 'ms | ' +
  G.karts.map(k => k.ch.name.slice(0, 3) + ':' + k.lap + 'L/' + Math.round(k.spd)).join(' '));
for (const k of G.karts) {
  if (k.lap < 1) fail(k.ch.name + ' completed no laps');
  if (!finite(k.prog)) fail(k.ch.name + ' NaN progress');
}
if (maxAd > c.geo.wall) fail('kart left the track (max lateral ' + Math.round(maxAd) + ' > ' + Math.round(c.geo.wall) + ')');

console.log('finish / results');
G.state = 'race';
G.stepSim(1 / 60, false);
if (!G.raceOver) fail('finish not detected');
G.rankAll(c);
G.fillResults();
if (!doc.getElementById('resultsList').children.length) fail('results list empty');
const ranks = G.karts.map(k => k.rank).sort((a, b) => a - b).join(',');
if (ranks !== '1,2,3,4,5,6,7,8') fail('ranks not unique: ' + ranks);
ok('player P' + p.rank + ' in ' + U.time(p.finishT) + ', laps ' + p.lapTimes.map(t => U.time(t)).join(' '));

console.log('shells / items / weather');
WC.Items.use(p, c, G.karts);
for (let i = 0; i < 400; i++) WC.Items.update(1 / 60, c, G.karts, G.fx);
if (!isFinite(WC.Items.ents.reduce((a, e) => a + Math.abs(e.x) + Math.abs(e.y), 0))) fail('entity NaN');
const storms = ['rain', 'embers', 'snow'];
for (const s of storms) { const w = new WC.Weather(s); for (let i = 0; i < 60; i++) { w.update(1 / 60, i / 60); w.draw(G.renderer.bctx, 480, 270, 108); } }
ok('items + ' + storms.join('/') + ' ok, ents=' + WC.Items.ents.length);

console.log('every course renders');
for (let i = 0; i < WC.COURSES.length; i++) {
  G.pickCourse(i, true);
  G.state = 'select';
  frames(30);
  const rr = G.renderer;
  if (rr.c !== WC.COURSES[i]) fail('renderer on wrong course: wanted ' + WC.COURSES[i].id + ' got ' + rr.c.id + ' (state=' + G.state + ', idx=' + G.courseIdx + ')');
  if (!rr.tex || rr.tex.mips.length !== 3) fail('mips missing for ' + WC.COURSES[i].id);
}
ok('all ' + WC.COURSES.length + ' circuits baked and rendered');

console.log(bad ? '\nFAIL (' + bad + ' problem(s))' : '\nALL OK');
process.exit(bad ? 1 : 0);
