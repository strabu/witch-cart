/* ============================================================
   test/race.js - race quality / tuning harness (no rendering)
   Drives full AI fields over every circuit and checks that the
   cars can actually race: laps, pace, contact, containment,
   ranking and determinism.
     node test/race.js
   ============================================================ */
'use strict';
global.window = global;
require('../js/util.js');
require('../js/track.js');
require('../js/items.js');
require('../js/kart.js');
require('../js/ai.js');
require('../js/particles.js');

const WC = global.WC, U = WC.U;
const DT = 1 / 60;
let bad = 0;
const fail = (m) => { bad++; console.log('   !! ' + m); };

function field(c, skillJitter) {
  const g = c.geo, ks = [];
  for (let n = 0; n < 8; n++) {
    const row = n >> 1, col = n & 1;
    const p = WC.trackPoint(c, (g.len - 46 - row * 96 + g.len) % g.len, col ? 66 : -66);
    const k = new WC.Kart({
      ch: WC.CHARS[n], isAI: true, slot: n, seed: 4242 + n * 31,
      skill: 0.88 + (n % 4) * 0.03 + (skillJitter || 0)
    });
    k.chIdx = n;
    k.x = p.x; k.y = p.y; k.ang = p.ang;
    k.prevS = k.s = WC.sampleTrack(c, k.x, k.y).s;
    k.ai.off = ((n % 3) - 1) * 0.3;
    ks.push(k);
  }
  return ks;
}

function collide(ks, c) {
  const R = 62;
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = ks[i], b = ks[j];
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 > R * R || d2 < 1e-4) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (R - d) * 0.5;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rvn < 0) {
      const imp = -rvn * 0.4;
      a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp;
    }
    for (const k of [a, b]) {
      const h = WC.sampleTrack(c, k.x, k.y), lim = h.wallD - WC.KART_HW;
      if (h.ad > lim) { const dd = U.clamp(h.d, -lim, lim); k.x = h.x + h.rx * dd; k.y = h.y + h.ry * dd; }
    }
  }
}

function race(c, jitter) {
  const ks = field(c, jitter);
  WC.Items.reset(c);
  const fx = new WC.FX();
  const stuck = ks.map(() => 0);
  let t = 0, offT = 0, maxAd = 0, worstAd = 0, steps = 0;
  while (t < 260 && !ks.every(k => k.finished)) {
    for (const k of ks) {
      WC.AI.step(k, c, ks, DT);
      k.step(DT, c);
      if (k.spd < 40 && k.gas > 0) { stuck[ks.indexOf(k)] += DT; } else stuck[ks.indexOf(k)] = 0;
      const h = WC.sampleTrack(c, k.x, k.y);
      if (h.surf === 'grass' || h.surf === 'kerb') offT += DT;
      if (h.ad > maxAd) maxAd = h.ad;
    }
    collide(ks, c);
    WC.Items.update(DT, c, ks, fx);
    fx.update(DT);
    t += DT; steps++;
  }
  return { ks: ks, t: t, offT: offT, maxAd: maxAd, worstAd: worstAd, stuck: stuck, fx: fx };
}

console.log('race quality harness');
for (const c of WC.COURSES) {
  WC.buildCourse(c);
  const r = race(c);
  const ks = r.ks;
  const finished = ks.filter(k => k.finished);
  const laps = ks.map(k => Math.min(k.lap, c.laps));   // karts coast past the flag in the harness
  const lapTimes = ks.reduce((a, k) => a.concat(k.lapTimes), []);
  const slow = lapTimes.filter(t => t > 26), fast = lapTimes.filter(t => t < 6);
  const hits = ks.map(k => k.wallHits);
  const hitsPerLap = ks.reduce((a, k) => a + k.wallHits / Math.max(1, k.lap), 0) / ks.length;
  const stuckTotal = r.stuck.reduce((a, b) => a + b, 0);
  const ranks = ks.map(k => -k.prog).sort((a, b) => a - b);
  const ordered = ranks.every((v, i) => i === 0 || ranks[i - 1] <= v + 1e-6);

  console.log('  ' + c.id.padEnd(6),
    'fin=' + finished.length + '/8',
    'laps=[' + laps.join(',') + ']',
    'lapT=' + (Math.min.apply(null, lapTimes)).toFixed(1) + '-' + (Math.max.apply(null, lapTimes)).toFixed(1) + 's',
    'wall/kart=[' + hits.join(',') + '] avg/lap=' + hitsPerLap.toFixed(1),
    'off=' + (r.offT / ks.length).toFixed(1) + 's/kart',
    'lat=' + Math.round(r.maxAd) + '/' + Math.round(c.geo.wall),
    'stuck=' + stuckTotal.toFixed(1) + 's',
    'items=' + ks.filter(k => k.item).length + '+' + WC.Items.ents.length + 'ents');

  if (finished.length !== 8) fail(c.id + ': only ' + finished.length + '/8 finished');
  if (laps.some(l => l < c.laps)) fail(c.id + ': someone did not complete the race distance ' + JSON.stringify(laps));
  if (!lapTimes.length) fail(c.id + ': no lap times');
  if (slow.length) fail(c.id + ': ' + slow.length + ' lap times over 26s (' + slow.map(s => s.toFixed(1)).join(' ') + ')');
  if (fast.length) fail(c.id + ': ' + fast.length + ' implausibly fast laps (' + fast.map(s => s.toFixed(1)).join(' ') + ')');
  if (hitsPerLap > 3.5) fail(c.id + ': too much wall contact (' + hitsPerLap.toFixed(1) + '/lap/kart)');
  if (r.maxAd > c.geo.wall + 2) fail(c.id + ': cars escaped the fences (' + Math.round(r.maxAd) + ' > ' + Math.round(c.geo.wall) + ')');
  if (stuckTotal > 6) fail(c.id + ': cars stalled for ' + stuckTotal.toFixed(1) + 's');
  if (!ordered) fail(c.id + ': progress not monotonic in the table');
  if (ks.some(k => k.lapTimes.length < c.laps)) fail(c.id + ': missing lap bookkeeping');
  ks.forEach((k, i) => { k.rank = i + 1; });
}

console.log('determinism');
const c = WC.COURSES[0];
const a1 = race(c), a2 = race(c);
const p1 = a1.ks.reduce((s, k) => s + k.prog, 0), p2 = a2.ks.reduce((s, k) => s + k.prog, 0);
console.log('  two identical runs -> prog ' + p1.toFixed(3) + ' vs ' + p2.toFixed(3));
if (Math.abs(p1 - p2) > 0.01) fail('simulation is not reproducible');

console.log('drive-off-road recovery');
const c2 = WC.COURSES[2];
const k = new WC.Kart({ ch: WC.CHARS[0], seed: 7 });
const p0 = WC.trackPoint(c2, 300, c2.hw * 0.95);   // out on the grass
k.x = p0.x; k.y = p0.y; k.ang = p0.ang + 0.6;        // pointed at the fence
k.prevS = WC.sampleTrack(c2, k.x, k.y).s;
k.gas = 1;
for (let i = 0; i < 60 * 12; i++) k.step(1 / 60, c2);
console.log('  grass start -> spd ' + k.spd.toFixed(0) + ' surf ' + k.surf + ' prog ' + k.prog.toFixed(0) + ' walls ' + k.wallHits + ' stuck ' + k.stuckT.toFixed(2));
if (k.spd < 120) fail('kart could not get going off-track (spd=' + k.spd.toFixed(0) + ')');
if (k.prog < 2500) fail('kart made no progress from the grass (' + k.prog.toFixed(0) + ')');
if (!isFinite(k.x) || !isFinite(k.y)) fail('kart position went non-finite');

console.log(bad ? '\nFAIL (' + bad + ')' : '\nALL OK');
process.exit(bad ? 1 : 0);
