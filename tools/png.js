/* ============================================================
   tools/png.js - minimal PNG writer (RGBA, filter 0, zlib).
   ============================================================ */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

/* rgba: Uint8ClampedArray of w*h*4. Opaque the output unless keepAlpha. */
function writePNG(file, w, h, rgba, keepAlpha) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const o = y * stride + 1;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, p = o + x * 4;
      const a = keepAlpha ? rgba[i + 3] : 255;
      /* composite over black when flattening so viewers agree */
      const f = keepAlpha ? 1 : rgba[i + 3] / 255;
      raw[p] = keepAlpha ? rgba[i] : rgba[i] * f;
      raw[p + 1] = keepAlpha ? rgba[i + 1] : rgba[i + 1] * f;
      raw[p + 2] = keepAlpha ? rgba[i + 2] : rgba[i + 2] * f;
      raw[p + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))
  ]));
  return file;
}
module.exports = { writePNG };
