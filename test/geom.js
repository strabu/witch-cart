/* node test: course geometry validation (ribbon separation, surface queries, world fit) */
global.window = global;
require('../js/util.js');
require('../js/track.js');
const WC = global.WC, U = WC.U;

let bad = 0;
const t0 = Date.now();
for (const c of WC.COURSES) {
  const s0 = Date.now();
  WC.buildCourse(c);
  const g = c.geo;
  const need = 2 * g.limit + 40;

  // closest approach of genuinely separate parts of the loop
  let sep = 1e9, wi = 0, wj = 0;
  for (let i = 0; i < g.N; i++) {
    for (let j = 0; j < g.N; j++) {
      const ds = Math.min(Math.abs(g.s[j] - g.s[i]), g.len - Math.abs(g.s[j] - g.s[i]));
      const dd = Math.hypot(g.xs[i] - g.xs[j], g.ys[i] - g.ys[j]);
      if (ds <= dd * 1.6) continue;
      if (dd < sep) { sep = dd; wi = i; wj = j; }
    }
  }
  const okSep = sep >= need;

  // fence overlap check between separate parts
  let fenceOK = true, fenceBad = 0;
  for (let i = 0; i < g.N; i++) {
    for (let j = 0; j < g.N; j++) {
      const ds = Math.min(Math.abs(g.s[j] - g.s[i]), g.len - Math.abs(g.s[j] - g.s[i]));
      const dd = Math.hypot(g.xs[i] - g.xs[j], g.ys[i] - g.ys[j]);
      if (ds <= dd * 1.6) continue;
      if (g.wallArr[i] + 8 + g.wallArr[j] + 8 > dd + 2) fenceBad++;
    }
  }
  fenceOK = fenceBad === 0;

  // surface query accuracy inside the fence line
  let errs = 0, maxErr = 0, samples = 0;
  for (let i = 0; i < g.N; i += 7) {
    const w = g.wallArr[i];
    for (const lat of [0, g.hw * .5, -g.hw * .5, g.hw - 2, g.hw + 2, g.limit - 2, g.limit + 2,
      w - 2, w * .5, -w + 2, -w - 60]) {
      const p = WC.trackPoint(c, g.s[i], lat);
      const h = WC.sampleTrack(c, p.x, p.y);
      samples++;
      const ad = Math.abs(lat);
      if (ad <= w) maxErr = Math.max(maxErr, Math.abs(Math.abs(h.d) - ad));
      const want = ad <= g.hw ? 0 : (ad <= g.limit ? 1 : (ad <= w ? 2 : 3));
      const got = h.type;
      const okType = (want === 3) ? (got >= 2) : (got === want || (want === 2 && got === 3));
      if (!okType || (ad <= w && maxErr > 8)) errs++;
    }
  }

  // ribbon + decor stays inside the world texture
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let i = 0; i < g.N; i++) {
    minx = Math.min(minx, g.xs[i] - g.wallArr[i]); maxx = Math.max(maxx, g.xs[i] + g.wallArr[i]);
    miny = Math.min(miny, g.ys[i] - g.wallArr[i]); maxy = Math.max(maxy, g.ys[i] + g.wallArr[i]);
  }
  const fits = minx > 0 && miny > 0 && maxx < WC.WORLD && maxy < WC.WORLD;

  let vmin = 1e9, vmax = 0;
  for (let i = 0; i < g.N; i++) { vmin = Math.min(vmin, g.vlimit[i]); vmax = Math.max(vmax, g.vlimit[i]); }
  const outside = c.decor.filter(d => d.x < 0 || d.y < 0 || d.x > WC.WORLD || d.y > WC.WORLD).length;

  console.log(
    c.id.padEnd(6), 'N=' + g.N, 'lap=' + Math.round(g.len),
    'sep=' + Math.round(sep) + '/need>' + Math.round(need), okSep ? 'ok' : '!!OVERLAP@' + wi + '/' + wj,
    fenceOK ? 'fence-ok' : '!!FENCE(' + fenceBad + ')',
    'qErr=' + errs + '/' + samples + ' maxErr=' + maxErr.toFixed(1),
    fits ? 'fits' : '!!OVERFLOW',
    'v=' + Math.round(vmin) + '-' + Math.round(vmax),
    'wall=' + Math.round(g.wall) + '/' + Math.round(Math.min.apply(null, g.wallArr)),
    'decor=' + c.decor.length + (outside ? ' OUT' : ''),
    (Date.now() - s0) + 'ms');
  if (!okSep || !fenceOK || errs || !fits) bad++;
}
console.log('total ' + (Date.now() - t0) + 'ms -', bad ? 'FAIL (' + bad + ')' : 'ALL OK');
