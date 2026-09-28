/* ============================================================
   test/dom.js - a tiny headless DOM/Canvas/WebAudio stub so
   the browser modules can be smoke-tested in node.
   ============================================================ */
'use strict';

function Ctx(cv) {
  const c = {
    canvas: cv, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    lineJoin: 'miter', lineCap: 'butt', font: '10px sans-serif', textAlign: 'start',
    textBaseline: 'alphabetic', imageSmoothingEnabled: true, globalCompositeOperation: 'source-over',
    filter: 'none', shadowBlur: 0, shadowColor: '', shadowOffsetX: 0, shadowOffsetY: 0,
    setTransform() {}, transform() {}, translate() {}, scale() {}, rotate() {},
    save() {}, restore() {}, clip() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    arc() {}, ellipse() {}, rect() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {},
    fillText() {}, strokeText() {}, measureText() { return { width: 12 }; }, setLineDash() {},
    drawImage(img, ...a) {
      if (!img) throw new Error('drawImage: missing image');
      if (a.length === 8) {
        const [, , sw, sh, , , dw, dh] = a;
        if (!(sw > 0) || !(sh > 0) || !(dw > 0) || !(dh > 0)) throw new Error('drawImage: bad rect ' + JSON.stringify(a));
      }
    },
    createLinearGradient() { return { addColorStop(o, col) { chk(o, col); } }; },
    createRadialGradient() { return { addColorStop(o, col) { chk(o, col); } }; },
    createPattern() { return null; },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(sx, sy, w, h) {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        d[i * 4] = (i * 37) & 255; d[i * 4 + 1] = (i * 71) & 255; d[i * 4 + 2] = (i * 113) & 255; d[i * 4 + 3] = 255;
      }
      return { width: w, height: h, data: d };
    },
    putImageData(img) { if (!img || !img.data) throw new Error('putImageData: bad image'); }
  };
  return c;
}
function chk(o, col) {
  if (!(o >= 0 && o <= 1)) throw new Error('bad gradient stop offset ' + o);
  if (typeof col !== 'string' || /NaN|undefined/.test(col)) throw new Error('bad gradient colour ' + col);
}

class El {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this.children = [];
    this.style = {};
    this.attrs = {};
    this._cls = new Set();
    this.textContent = '';
    this._html = '';
    this.listeners = {};
    this.onclick = null;
    this.width = 0; this.height = 0;
    this.clientWidth = 1280; this.clientHeight = 720;
    this._ctx = null;
  }
  getContext() { return (this._ctx = this._ctx || Ctx(this)); }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : null; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { const l = this.listeners[t] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  dispatch(t, ev) { (this.listeners[t] || []).forEach(f => f(Object.assign({ preventDefault() {}, stopPropagation() {} }, ev))); }
  classListAdd(c) { this._cls.add(c); }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (sel === '[data-btn]' ? c.attrs['data-btn'] : c.tagName === sel.toUpperCase()) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  get classList() {
    const s = this._cls;
    return {
      add: (...c) => c.forEach(x => s.add(x)),
      remove: (...c) => c.forEach(x => s.delete(x)),
      contains: (c) => s.has(c),
      toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; }
    };
  }
  set innerHTML(v) { this._html = v; if (v === '') this.children.length = 0; }
  get innerHTML() { return this._html; }
}

function install(global) {
  const doc = {
    _byId: {},
    readyState: 'complete',
    body: new El('body'),
    createElement: (t) => new El(t),
    getElementById: (id) => (doc._byId[id] = doc._byId[id] || new El(id === 'view' ? 'canvas' : 'div', id)),
    querySelectorAll: (sel) => (sel === '.screen' ? ['title', 'select', 'pause', 'results'].map(i => doc.getElementById(i)) : doc.body.querySelectorAll(sel)),
    querySelector: (sel) => doc.body.querySelectorAll(sel)[0] || null,
    addEventListener(t, fn) { (doc.listeners = doc.listeners || {})[t] = (doc.listeners[t] || []).concat(fn); }
  };
  global.document = doc;
  global.window = global;
  global.devicePixelRatio = 1;
  global.innerWidth = 1280; global.innerHeight = 720;
  const listeners = {};
  global.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
  global.removeEventListener = () => {};
  global.__fire = (t, ev) => (listeners[t] || []).forEach(f => f(Object.assign({ preventDefault() {} }, ev)));
  global.__keys = { down: {} };
  global.performance = global.performance || { now: () => Date.now() };
  const raf = [];
  global.requestAnimationFrame = (fn) => { raf.push(fn); return raf.length; };
  global.cancelAnimationFrame = () => {};
  global.__raf = raf;
  /* no WebAudio in node - modules must guard on it */
  global.AudioContext = undefined;
  return doc;
}

module.exports = { install, El, Ctx };
