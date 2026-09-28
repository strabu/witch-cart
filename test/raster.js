/* ============================================================
   test/raster.js - a small software Canvas2D for node.

   Implements just the subset Witch Cart draws with: transformed
   paths (line/arc/ellipse/quad), even-odd polygon fill, stroking,
   gradients, alpha blending, drawImage with rotation + nearest
   filtering, a 5x7 bitmap font for the HUD, and real ImageData.

   Purpose: the headless tests can produce genuine screenshots of
   the game - proof that sprites land at the right scale, anchors
   and z-order - instead of trusting assertions about numbers.
   ============================================================ */
'use strict';

/* ------------------------------------------------- colours -- */
const NAMES = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], transparent: [0, 0, 0, 0]
};
function parseColor(c) {
  if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0, c.length > 3 ? c[3] : 1];
  if (typeof c !== 'string') return [255, 0, 255, 1];
  const s = c.trim().toLowerCase();
  if (s[0] === '#') {
    if (s.length === 4) return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16), 1];
    if (s.length >= 7) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16),
      s.length === 9 ? parseInt(s.slice(7, 9), 16) / 255 : 1];
  }
  let m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const p = m[1].split(',').map(v => parseFloat(v)); return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? p[3] : 1]; }
  if (NAMES[s]) { const n = NAMES[s]; return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]; }
  return [255, 0, 255, 1];
}

class Grad {
  constructor(kind, g) { this.kind = kind; this.g = g; this.stops = []; }
  addColorStop(o, col) {
    if (!(o >= 0 && o <= 1)) throw new Error('bad gradient stop offset ' + o);
    if (typeof col !== 'string' || /NaN|undefined/.test(col)) throw new Error('bad gradient colour ' + col);
    this.stops.push([o, parseColor(col)]);
    this.stops.sort((a, b) => a[0] - b[0]);
  }
  at(x, y) {
    const s = this.stops;
    if (!s.length) return [0, 0, 0, 1];
    let t = 0;
    if (this.kind === 'lin') {
      const [x0, y0, x1, y1] = this.g;
      const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
      t = l2 ? ((x - x0) * dx + (y - y0) * dy) / l2 : 0;
    } else {
      const [x0, y0, r0, x1, y1, r1] = this.g;
      const d = Math.hypot(x - x1, y - y1);
      t = (r1 - r0) ? (d - r0) / (r1 - r0) : d / (r1 || 1);
    }
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    let i = 0; while (i < s.length - 2 && s[i + 1][0] < t) i++;
    const a = s[i], b = s[i + 1] || s[i];
    const k = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
    const q = Math.max(0, Math.min(1, k));
    return [a[1][0] + (b[1][0] - a[1][0]) * q, a[1][1] + (b[1][1] - a[1][1]) * q,
      a[1][2] + (b[1][2] - a[1][2]) * q, a[1][3] + (b[1][3] - a[1][3]) * q];
  }
}

/* ---------------------------------------------- bitmap font -- */
/* 5x7, '#' = lit. Uppercase only (the HUD shouts anyway). */
const FONT = {
  'A': '0e11111f111111',
  'B': '1e11111e11111e',
  'C': '0e11101010110e',
  'D': '1e11111111111e',
  'E': '1f10101e10101f',
  'F': '1f10101e101010',
  'G': '0e11101711110e',
  'H': '1111111f111111',
  'I': '0e04040404040e',
  'J': '0702020202120c',
  'K': '11121418141211',
  'L': '1010101010101f',
  'M': '111b1515111111',
  'N': '11191513111111',
  'O': '0e11111111110e',
  'P': '1e11111e101010',
  'Q': '0e11111115120d',
  'R': '1e11111e141211',
  'S': '0f10100e01011e',
  'T': '1f040404040404',
  'U': '1111111111110e',
  'V': '11111111110a04',
  'W': '11111115151b11',
  'X': '11110a040a1111',
  'Y': '11110a04040404',
  'Z': '1f01020408101f',
  '0': '0e11131519110e',
  '1': '040c040404040e',
  '2': '0e11010608101f',
  '3': '0e11010601110e',
  '4': '02060a121f0202',
  '5': '1f101e0101110e',
  '6': '0608101e11110e',
  '7': '1f010204080808',
  '8': '0e11110e11110e',
  '9': '0e11110f01020c',
  ' ': '00000000000000',
  '.': '00000000000c0c',
  ',': '00000000040408',
  ':': '000c0c000c0c00',
  '-': '0000000e000000',
  '+': '0004041f040400',
  '/': '01010204081010',
  '%': '18190204081303',
  '!': '04040404040004',
  '?': '0e110106040004',
  "'": '04040000000000',
  '(': '02040808080402',
  ')': '08040202020408',
  '*': '000a041f040a00',
  '=': '00001f001f0000',
  '<': '02040810080402',
  '>': '08040201020408',
  '#': '0a1f0a0a1f0a00',
  '&': '0c12120c15120d',
  '@': '0e11171517100e',
  '·': '0000000c0c0000',
  '×': '00110a040a1100',
  '°': '06090600000000',
  '♥': '0a1f1f1f0e0400',
  '★': '04041f0a040a11',
  '→': '00040e1f0e0400'
};

/* ------------------------------------------------- rasterizer -- */
class Raster {
  constructor(cv) {
    this.canvas = cv;
    this._w = 0; this._h = 0; this.fb = null;
    this.globalAlpha = 1; this.fillStyle = '#000'; this.strokeStyle = '#000';
    this.lineWidth = 1; this.lineJoin = 'miter'; this.lineCap = 'butt';
    this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic';
    this.imageSmoothingEnabled = true; this.globalCompositeOperation = 'source-over';
    this.filter = 'none'; this.shadowBlur = 0; this.shadowColor = '';
    this.shadowOffsetX = 0; this.shadowOffsetY = 0;
    this.m = [1, 0, 0, 1, 0, 0]; this.stack = [];
    this.path = []; this.closed = [];
  }
  /* framebuffer, sized from the canvas whenever it changes */
  ensure() {
    const w = Math.max(0, this.canvas.width | 0), h = Math.max(0, this.canvas.height | 0);
    if (this._w !== w || this._h !== h || !this.fb) {
      this._w = w; this._h = h;
      this.fb = new Uint8ClampedArray(w * h * 4);
    }
  }

  /* --- transform --- */
  save() { this.stack.push([this.m.slice(), this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha, this.font, this.textAlign, this.textBaseline, this.globalCompositeOperation]); }
  restore() {
    const s = this.stack.pop(); if (!s) return;
    this.m = s[0]; this.fillStyle = s[1]; this.strokeStyle = s[2]; this.lineWidth = s[3];
    this.globalAlpha = s[4]; this.font = s[5]; this.textAlign = s[6]; this.textBaseline = s[7];
    this.globalCompositeOperation = s[8];
  }
  _mul(n) { const a = this.m, b = n;
    this.m = [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
  transform(a, b, c, d, e, f) { this._mul([a, b, c, d, e, f]); }
  setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; }
  resetTransform() { this.m = [1, 0, 0, 1, 0, 0]; }
  translate(x, y) { this._mul([1, 0, 0, 1, x, y]); }
  scale(x, y) { this._mul([x, 0, 0, y === undefined ? x : y, 0, 0]); }
  rotate(r) { const c = Math.cos(r), s = Math.sin(r); this._mul([c, s, -s, c, 0, 0]); }
  tp(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  inv(x, y) {
    const m = this.m, det = m[0] * m[3] - m[1] * m[2] || 1e-9;
    const dx = x - m[4], dy = y - m[5];
    return [(m[3] * dx - m[2] * dy) / det, (-m[1] * dx + m[0] * dy) / det];
  }
  _scale() { const m = this.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }

  /* --- paths --- */
  beginPath() { this.path = []; this.closed = []; }
  moveTo(x, y) { this.path.push([this.tp(x, y)]); this.closed.push(false); }
  lineTo(x, y) {
    if (!this.path.length) return this.moveTo(x, y);
    const s = this.path[this.path.length - 1]; s.push(this.tp(x, y));
  }
  closePath() {
    if (!this.path.length) return;
    const s = this.path[this.path.length - 1];
    if (s.length) { s.push([s[0][0], s[0][1]]); }
    this.closed[this.path.length - 1] = true;
  }
  rect(x, y, w, h) {
    const p = [[this.tp(x, y)], [this.tp(x + w, y)], [this.tp(x + w, y + h)], [this.tp(x, y + h)]];
    this.path.push([p[0][0], p[1][0], p[2][0], p[3][0], [p[0][0][0], p[0][0][1]]]); this.closed.push(true);
  }
  ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) {
    const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 0.22));
    if (ccw && a1 > a0) a1 -= Math.PI * 2;
    if (!ccw && a1 < a0) a1 += Math.PI * 2;
    const cr = Math.cos(rot), sr = Math.sin(rot), sub = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * i / steps, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      sub.push(this.tp(cx + ex * cr - ey * sr, cy + ex * sr + ey * cr));
    }
    if (!sub.length) return;
    if (!this.path.length) { this.path.push(sub); this.closed.push(false); }
    else { const s = this.path[this.path.length - 1]; if (s.length) s.shift(); for (const p of sub) s.push(p); }
  }
  arc(cx, cy, r, a0, a1, ccw) { this.ellipse(cx, cy, r, r, 0, a0, a1, ccw); }
  quadraticCurveTo(cx, cy, x, y) {
    const s = this.path[this.path.length - 1]; if (!s || !s.length) return this.moveTo(cx, cy);
    const p0 = this.inv(s[s.length - 1][0], s[s.length - 1][1]);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      const px = u * u * p0[0] + 2 * u * t * cx + t * t * x;
      const py = u * u * p0[1] + 2 * u * t * cy + t * t * y;
      s.push(this.tp(px, py));
    }
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    const s = this.path[this.path.length - 1]; if (!s || !s.length) return this.moveTo(c1x, c1y);
    const p0 = this.inv(s[s.length - 1][0], s[s.length - 1][1]);
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      this.lineTo(u * u * u * p0[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * p0[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y);
    }
  }
  clip() { /* not modelled - nothing in the game relies on it */ }
  setLineDash() {}

  /* --- pixels --- */
  _col() { return this.fillStyle instanceof Grad ? this.fillStyle : parseColor(this.fillStyle); }
  _px(x, y, c, a) {
    if (x < 0 || y < 0 || x >= this._w || y >= this._h) return;
    const i = (y * this._w + x) * 4, sa = (c[3] === undefined ? 1 : c[3]) * a;
    if (sa <= 0) return;
    const fb = this.fb;
    if (this.globalCompositeOperation === 'copy' || sa >= 1) {
      fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2]; fb[i + 3] = 255 * (sa >= 1 ? 1 : sa) + fb[i + 3] * (1 - sa);
      if (sa >= 1) fb[i + 3] = 255;
      return;
    }
    const ia = 1 - sa;
    fb[i] = c[0] * sa + fb[i] * ia; fb[i + 1] = c[1] * sa + fb[i + 1] * ia;
    fb[i + 2] = c[2] * sa + fb[i + 2] * ia; fb[i + 3] = 255 * sa + fb[i + 3] * ia;
  }
  _span(y, x0, x1, col) {
    const sx = Math.max(0, Math.ceil(x0 - 0.5)), ex = Math.min(this._w - 1, Math.floor(x1 - 0.5));
    const ga = this.globalAlpha;
    for (let x = sx; x <= ex; x++) {
      const c = col instanceof Grad ? col.at(x + 0.5, y + 0.5) : col;
      this._px(x, y, c, ga);
    }
  }
  _fillPoly(pts, col) {
    let miny = Infinity, maxy = -Infinity, minx = Infinity, maxx = -Infinity;
    for (const p of pts) { if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; }
    if (!(maxy >= miny)) return;
    const y0 = Math.max(0, Math.floor(miny)), y1 = Math.min(this._h - 1, Math.ceil(maxy));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const yy = y + 0.5; xs.length = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy))
          xs.push(a[0] + (yy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) this._span(y, xs[i], xs[i + 1], col);
    }
  }
  fill(rule) { this.ensure(); for (const s of this.path) if (s.length > 2) this._fillPoly(s, this._col()); }
  stroke() {
    this.ensure();
    const lw = Math.max(1, this.lineWidth * this._scale()), col = this.strokeStyle instanceof Grad ? this.strokeStyle : parseColor(this.strokeStyle);
    for (const s of this.path) {
      for (let i = 0; i < s.length - 1; i++) {
        const a = s[i], b = s[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (L < 1e-6) continue;
        const nx = -dy / L * lw / 2, ny = dx / L * lw / 2;
        this._fillPoly([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]], col);
      }
    }
  }
  fillRect(x, y, w, h) {
    this.ensure();
    const q = [this.tp(x, y), this.tp(x + w, y), this.tp(x + w, y + h), this.tp(x, y + h), this.tp(x, y)];
    this._fillPoly(q, this._col());
  }
  strokeRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.stroke(); }
  clearRect(x, y, w, h) {
    const q = [this.tp(x, y), this.tp(x + w, y), this.tp(x + w, y + h), this.tp(x, y + h), this.tp(x, y)];
    this._fillPoly(q, [0, 0, 0, 1]);
  }

  /* --- images --- */
  drawImage(img, ...a) {
    if (!img) throw new Error('drawImage: missing image');
    this.ensure();
    let sx = 0, sy = 0, sw, sh, dx, dy, dw, dh;
    if (a.length === 2) { [dx, dy] = a; sw = img.width; sh = img.height; dw = sw; dh = sh; }
    else if (a.length === 4) { [dx, dy, dw, dh] = a; sx = 0; sy = 0; sw = img.width; sh = img.height; }
    else if (a.length === 8) { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
    else throw new Error('drawImage: unsupported arity ' + a.length);
    if (!(sw > 0) || !(sh > 0) || !(dw > 0) || !(dh > 0)) throw new Error('drawImage: bad rect ' + JSON.stringify(a));
    const src = img._ctx && img._ctx.fb ? img._ctx.fb : (img.fb || null);
    if (!src) return;                      // no pixel source (e.g. external <img>): nothing to show
    const sc = this._scale();
    const corners = [this.tp(dx, dy), this.tp(dx + dw, dy), this.tp(dx + dw, dy + dh), this.tp(dx, dy + dh)];
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of corners) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
    const x0 = Math.max(0, Math.floor(minx)), x1 = Math.min(this._w - 1, Math.ceil(maxx));
    const y0 = Math.max(0, Math.floor(miny)), y1 = Math.min(this._h - 1, Math.ceil(maxy));
    const ga = this.globalAlpha, swf = sw / dw, shf = sh / dh;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const l = this.inv(x + 0.5, y + 0.5);
        let u = (l[0] - dx) * swf, v = (l[1] - dy) * shf;
        if (u < 0 || v < 0 || u >= sw || v >= sh) continue;
        u = Math.min(img.width - 1, Math.max(0, Math.floor(sx + u)));
        v = Math.min(img.height - 1, Math.max(0, Math.floor(sy + v)));
        const i = (v * img.width + u) * 4;
        const sa = (src[i + 3] / 255) * ga;
        if (sa <= 0.004) continue;
        this._px(x, y, [src[i], src[i + 1], src[i + 2], 1], sa);
      }
    }
    if (sc === 0) this.globalAlpha = ga;
  }

  /* --- text --- */
  _fsize() {
    /* "700 26px Trebuchet" -> 26, not 700. Prefer a number that carries a unit. */
    const f = String(this.font);
    let m = /(\d+(?:\.\d+)?)(px|pt|em|%)/.exec(f);
    if (m) { const v = parseFloat(m[1]); return m[2] === 'pt' ? v * 96 / 72 : m[2] === '%' ? v / 100 * 16 : v; }
    m = /(\d+(?:\.\d+)?)/.exec(f.replace(/^\d{3}\s/, ''));   // skip a leading weight
    return m ? parseFloat(m[1]) : 10;
  }
  measureText(t) { const s = this._fsize(); return { width: String(t).length * s * 0.62, actualBoundingBoxAscent: s * 0.7, actualBoundingBoxDescent: s * 0.2 }; }
  fillText(t, x, y) {
    this.ensure();
    t = String(t); const size = this._fsize(), sc = size / 7, col = this._col();
    const cw = sc * 4.1;              // ~0.58em advance, like Trebuchet
    let tw = t.length * cw;
    let ox = this.textAlign === 'center' ? x - tw / 2 : this.textAlign === 'right' ? x - tw : x;
    let oy = this.textBaseline === 'middle' ? y - size / 2 : this.textBaseline === 'top' ? y : this.textBaseline === 'bottom' ? y - size : y - size * 0.8;
    for (let n = 0; n < t.length; n++) {
      const g = FONT[t[n].toUpperCase()] || FONT['?'];
      for (let r = 0; r < 7; r++) {
        const bits = parseInt(g.substr(r * 2, 2), 16);
        for (let c = 0; c < 5; c++) {
          if (!(bits & (1 << (4 - c)))) continue;
          const p = this.tp(ox + n * cw + c * sc, oy + r * sc);
          const q = this.tp(ox + n * cw + (c + 1) * sc, oy + (r + 1) * sc);
          for (let yy = Math.floor(p[1]); yy < Math.ceil(q[1]); yy++)
            for (let xx = Math.floor(p[0]); xx < Math.ceil(q[0]); xx++) this._px(xx, yy, col, this.globalAlpha);
        }
      }
    }
  }
  strokeText(t, x, y) { const c = this.fillStyle; this.fillStyle = this.strokeStyle; this.fillText(t, x - 1, y - 1); this.fillStyle = c; }

  /* --- image data --- */
  createImageData(w, h) { return { width: w | 0, height: h | 0, data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) }; }
  getImageData(sx, sy, w, h) {
    this.ensure();
    const out = { width: w | 0, height: h | 0, data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) };
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const si = ((sy + y) * this._w + (sx + x)) * 4, di = (y * out.width + x) * 4;
      out.data[di] = this.fb[si]; out.data[di + 1] = this.fb[si + 1]; out.data[di + 2] = this.fb[si + 2]; out.data[di + 3] = this.fb[si + 3];
    }
    return out;
  }
  putImageData(img, dx, dy) {
    if (!img || !img.data) throw new Error('putImageData: bad image');
    this.ensure();
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const X = (dx | 0) + x, Y = (dy | 0) + y;
      if (X < 0 || Y < 0 || X >= this._w || Y >= this._h) continue;
      const si = (y * img.width + x) * 4, di = (Y * this._w + X) * 4;
      this.fb[di] = img.data[si]; this.fb[di + 1] = img.data[si + 1];
      this.fb[di + 2] = img.data[si + 2]; this.fb[di + 3] = img.data[si + 3];
    }
  }
  createLinearGradient(x0, y0, x1, y1) { return new Grad('lin', [x0, y0, x1, y1]); }
  createRadialGradient(x0, y0, r0, x1, y1, r1) { return new Grad('rad', [x0, y0, r0, x1, y1, r1]); }
  createPattern() { return null; }
}

function attach(el) {
  const R = new Raster(el);
  el.getContext = () => R;
  el._ctx = R;
  return R;
}

module.exports = { Raster, attach, parseColor, FONT };
