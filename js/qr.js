// Tiny QR code generator (byte mode, versions 1-10, error-correction L/M/Q/H), no dependencies.
// Usage:  QR.svg('https://example.com/add.html', { ecl: 'M', size: 200 })  ->  '<svg ...>...</svg>'
// Based on the published QR Code specification (ISO/IEC 18004); checked against OpenCV's decoder.
(function (root) {
  'use strict';
  var ECL = { L: 0, M: 1, Q: 2, H: 3 }, FORMAT_BITS = [1, 0, 3, 2];
  var ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28]];
  var NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8]];
  var MAX_VERSION = 10;

  function bit(x, i) { return ((x >>> i) & 1) !== 0; }
  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { var n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(ver, e) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[e][ver] * NUM_BLOCKS[e][ver]; }

  function utf8(s) { return Array.prototype.slice.call(unescape(encodeURIComponent(s))).map(function (c) { return c.charCodeAt(0); }); }

  // ---- Reed-Solomon over GF(256)
  function gfMul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
  function rsDivisor(deg) {
    var r = []; for (var i = 0; i < deg; i++) r.push(0); r[deg - 1] = 1;
    var root = 1;
    for (i = 0; i < deg; i++) {
      for (var j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
      root = gfMul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      div.forEach(function (c, i) { r[i] ^= gfMul(c, f); });
    });
    return r;
  }

  function encode(text, eclName) {
    var e = ECL[eclName || 'M'], bytes = utf8(text), ver, cap;
    for (ver = 1; ver <= MAX_VERSION; ver++) {
      cap = dataCodewords(ver, e) * 8;
      if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap) break;
    }
    if (ver > MAX_VERSION) throw new Error('Text too long for the QR code');
    // data bits
    var bits = [];
    function put(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); }
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = []; for (var i = 0; i < bits.length; i += 8) { var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; data.push(v); }

    // error correction + interleave
    var nBlocks = NUM_BLOCKS[e][ver], eccLen = ECC_PER_BLOCK[e][ver];
    var raw = Math.floor(rawModules(ver) / 8), nShort = nBlocks - raw % nBlocks, shortLen = Math.floor(raw / nBlocks);
    var blocks = [], div = rsDivisor(eccLen);
    for (i = 0, k = 0; i < nBlocks; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1)); k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var all = [];
    for (i = 0; i < blocks[0].length; i++) blocks.forEach(function (b, j) { if (i !== shortLen - eccLen || j >= nShort) all.push(b[i]); });

    // matrix
    var size = ver * 4 + 17, mod = [], fn = [];
    for (i = 0; i < size; i++) { mod.push([]); fn.push([]); for (var j = 0; j < size; j++) { mod[i].push(false); fn[i].push(false); } }
    function setFn(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }
    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    function finder(x, y) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var pos = [];
    if (ver > 1) {
      var n = Math.floor(ver / 7) + 2, step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
      pos = [6]; for (var p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    }
    pos.forEach(function (cy, a) { pos.forEach(function (cx, b) {
      if ((a === 0 && b === 0) || (a === 0 && b === pos.length - 1) || (a === pos.length - 1 && b === 0)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }); });
    function formatBits(mask) {
      var d = (FORMAT_BITS[e] << 3) | mask, rem = d;
      for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var b = ((d << 10) | rem) ^ 0x5412, t;
      for (t = 0; t <= 5; t++) setFn(8, t, bit(b, t));
      setFn(8, 7, bit(b, 6)); setFn(8, 8, bit(b, 7)); setFn(7, 8, bit(b, 8));
      for (t = 9; t < 15; t++) setFn(14 - t, 8, bit(b, t));
      for (t = 0; t < 8; t++) setFn(size - 1 - t, 8, bit(b, t));
      for (t = 8; t < 15; t++) setFn(8, size - 15 + t, bit(b, t));
      setFn(8, size - 8, true);
    }
    formatBits(0);                                   // reserve the format area
    if (ver >= 7) {
      var rem = ver; for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (ver << 12) | rem;
      for (i = 0; i < 18; i++) { var c = bit(vb, i), a = size - 11 + i % 3, b2 = Math.floor(i / 3); setFn(a, b2, c); setFn(b2, a, c); }
    }
    // codewords, zig-zag
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (j = 0; j < 2; j++) {
        var x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && idx < all.length * 8) { mod[y][x] = bit(all[idx >>> 3], 7 - (idx & 7)); idx++; }
      }
    }
    // pick the mask with the lowest penalty
    function applyMask(m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = x * y % 2 + x * y % 3 === 0; break;
          case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
        if (inv && !fn[y][x]) mod[y][x] = !mod[y][x];
      }
    }
    function penalty() {
      var s = 0, y, x, dark = 0;
      function lineScore(get) {            // runs of 5+ and finder-like patterns along one row/column
        var sc = 0, runC = get(0), runL = 1, q, str = '';
        for (q = 1; q < size; q++) {
          if (get(q) === runC) { runL++; if (runL === 5) sc += 3; else if (runL > 5) sc++; } else { runC = get(q); runL = 1; }
        }
        for (q = 0; q < size; q++) str += get(q) ? '1' : '0';
        for (q = 0; q + 11 <= size; q++) { var sub = str.substr(q, 11); if (sub === '00001011101' || sub === '10111010000') sc += 40; }
        return sc;
      }
      for (y = 0; y < size; y++) s += lineScore(function (q) { return mod[y][q]; });
      for (x = 0; x < size; x++) s += lineScore(function (q) { return mod[q][x]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) { var c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) s += 3; }
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
      var total = size * size, off = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      return s + Math.max(0, off) * 10;
    }
    var best = 0, bestPen = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); formatBits(m);
      var pen = penalty();
      if (pen < bestPen) { best = m; bestPen = pen; }
      applyMask(m);                                  // undo (XOR again)
    }
    applyMask(best); formatBits(best);
    return { size: size, version: ver, get: function (x, y) { return mod[y][x]; } };
  }

  // SVG string: dark modules as one path on a white square with a 4-module quiet zone.
  function svg(text, o) {
    o = o || {};
    var q = encode(text, o.ecl || 'M'), pad = 4, n = q.size + pad * 2, d = '';
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) if (q.get(x, y)) d += 'M' + (x + pad) + ' ' + (y + pad) + 'h1v1h-1z';
    var px = o.size ? ' width="' + o.size + '" height="' + o.size + '"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '"' + px + ' shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#111"/></svg>';
  }
  root.QR = { encode: encode, svg: svg };
})(typeof window !== 'undefined' ? window : globalThis);
