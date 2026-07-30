/**
 * Minimal QR code encoder — no dependencies, no network calls.
 *
 * Scope: QR model 2, byte mode (UTF-8), error correction level M, versions 1-10
 * (up to 213 bytes). That covers every link this dashboard produces and keeps the
 * whole encoder small enough to ship inline with the page.
 *
 * Generated matrices were verified module-for-module against the `segno`
 * reference implementation across versions 1-10 and all eight masks.
 *
 * window.KEQR.matrix(text)  -> { size, modules: boolean[][], version }
 * window.KEQR.svg(text, o)  -> SVG string
 * window.KEQR.draw(canvas, text, o)
 */
(function (global) {
  'use strict';

  /* ---------- GF(256) arithmetic ---------- */
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gmul(a, b) {
    return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
  }

  function polyMul(a, b) {
    var r = new Array(a.length + b.length - 1).fill(0);
    for (var i = 0; i < a.length; i++) {
      for (var j = 0; j < b.length; j++) r[i + j] ^= gmul(a[i], b[j]);
    }
    return r;
  }

  var genCache = {};
  function rsGenerator(n) {
    if (genCache[n]) return genCache[n];
    var g = [1];
    for (var i = 0; i < n; i++) g = polyMul(g, [1, EXP[i]]);
    genCache[n] = g;
    return g;
  }

  function rsRemainder(data, ecLen) {
    var gen = rsGenerator(ecLen);
    var buf = new Uint8Array(data.length + ecLen);
    buf.set(data);
    for (var i = 0; i < data.length; i++) {
      var coef = buf[i];
      if (coef === 0) continue;
      for (var j = 1; j < gen.length; j++) buf[i + j] ^= gmul(gen[j], coef);
    }
    return buf.subarray(data.length);
  }

  /* ---------- Version tables (error correction level M) ----------
     [total codewords, ec codewords per block, [[blocks, data codewords], ...]] */
  var VERSIONS = {
    1: [26, 10, [[1, 16]]],
    2: [44, 16, [[1, 28]]],
    3: [70, 26, [[1, 44]]],
    4: [100, 18, [[2, 32]]],
    5: [134, 24, [[2, 43]]],
    6: [172, 16, [[4, 27]]],
    7: [196, 18, [[4, 31]]],
    8: [242, 22, [[2, 38], [2, 39]]],
    9: [292, 22, [[3, 36], [2, 37]]],
    10: [346, 26, [[4, 43], [1, 44]]]
  };

  var ALIGNMENT = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  var MAX_VERSION = 10;

  function dataCodewords(version) {
    return VERSIONS[version][2].reduce(function (sum, g) {
      return sum + g[0] * g[1];
    }, 0);
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    var out = [];
    var esc = unescape(encodeURIComponent(text));
    for (var i = 0; i < esc.length; i++) out.push(esc.charCodeAt(i));
    return new Uint8Array(out);
  }

  function pickVersion(byteLen) {
    for (var v = 1; v <= MAX_VERSION; v++) {
      var countBits = v < 10 ? 8 : 16;
      if (4 + countBits + byteLen * 8 <= dataCodewords(v) * 8) return v;
    }
    throw new Error('QR: текст слишком длинный (максимум 213 байт)');
  }

  /* ---------- Bit stream -> interleaved codewords ---------- */
  function buildCodewords(bytes, version) {
    var capacity = dataCodewords(version);
    var bits = [];
    function push(value, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }

    push(0b0100, 4); // byte mode
    push(bytes.length, version < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);

    var limit = capacity * 8;
    push(0, Math.min(4, limit - bits.length)); // terminator
    while (bits.length % 8 !== 0) bits.push(0);

    var data = new Uint8Array(capacity);
    for (var b = 0; b < bits.length; b += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[b + k];
      data[b / 8] = byte;
    }
    var pads = [0xec, 0x11];
    for (var p = bits.length / 8, n = 0; p < capacity; p++, n++) data[p] = pads[n % 2];

    // Split into blocks, compute EC, then interleave both halves.
    var ecLen = VERSIONS[version][1];
    var blocks = [];
    var offset = 0;
    VERSIONS[version][2].forEach(function (group) {
      for (var i = 0; i < group[0]; i++) {
        var chunk = data.subarray(offset, offset + group[1]);
        offset += group[1];
        blocks.push({ data: chunk, ec: rsRemainder(chunk, ecLen) });
      }
    });

    var result = [];
    var maxData = Math.max.apply(null, blocks.map(function (bl) { return bl.data.length; }));
    for (var i2 = 0; i2 < maxData; i2++) {
      blocks.forEach(function (bl) {
        if (i2 < bl.data.length) result.push(bl.data[i2]);
      });
    }
    for (var i3 = 0; i3 < ecLen; i3++) {
      blocks.forEach(function (bl) {
        result.push(bl.ec[i3]);
      });
    }
    return new Uint8Array(result);
  }

  function formatBits(mask) {
    // EC level M = 0b00, followed by the 3 mask bits.
    var data = (0b00 << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }

  function versionBits(version) {
    var rem = version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    return (version << 12) | rem;
  }

  /* ---------- Matrix assembly ---------- */
  function newGrid(size, value) {
    var g = new Array(size);
    for (var i = 0; i < size; i++) g[i] = new Array(size).fill(value);
    return g;
  }

  function buildMatrix(codewords, version, mask) {
    var size = version * 4 + 17;
    var m = newGrid(size, false);
    var fn = newGrid(size, false); // function-pattern modules (never masked)

    function set(row, col, dark) {
      m[row][col] = dark;
      fn[row][col] = true;
    }

    // Finder patterns + separators.
    [[0, 0], [0, size - 7], [size - 7, 0]].forEach(function (pos) {
      for (var dr = -1; dr <= 7; dr++) {
        for (var dc = -1; dc <= 7; dc++) {
          var r = pos[0] + dr;
          var c = pos[1] + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          var dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
          set(r, c, dist !== 2 && dist <= 3);
        }
      }
    });

    // Timing patterns.
    for (var i = 8; i < size - 8; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }

    // Alignment patterns (skipping the three finder corners).
    var pos = ALIGNMENT[version];
    for (var a = 0; a < pos.length; a++) {
      for (var b = 0; b < pos.length; b++) {
        var isCorner =
          (a === 0 && b === 0) ||
          (a === 0 && b === pos.length - 1) ||
          (a === pos.length - 1 && b === 0);
        if (isCorner) continue;
        for (var dr2 = -2; dr2 <= 2; dr2++) {
          for (var dc2 = -2; dc2 <= 2; dc2++) {
            set(pos[a] + dr2, pos[b] + dc2, Math.max(Math.abs(dr2), Math.abs(dc2)) !== 1);
          }
        }
      }
    }

    // Format information (two copies) + the always-dark module.
    var fmt = formatBits(mask);
    function fbit(i) {
      return ((fmt >>> i) & 1) === 1;
    }
    for (var f = 0; f <= 5; f++) set(f, 8, fbit(f));
    set(7, 8, fbit(6));
    set(8, 8, fbit(7));
    set(8, 7, fbit(8));
    for (var f2 = 9; f2 < 15; f2++) set(8, 14 - f2, fbit(f2));
    for (var f3 = 0; f3 < 8; f3++) set(8, size - 1 - f3, fbit(f3));
    for (var f4 = 8; f4 < 15; f4++) set(size - 15 + f4, 8, fbit(f4));
    set(size - 8, 8, true);

    // Version information (version 7 and up).
    if (version >= 7) {
      var vbits = versionBits(version);
      for (var v = 0; v < 18; v++) {
        var bit = ((vbits >>> v) & 1) === 1;
        var lo = size - 11 + (v % 3);
        var hi = Math.floor(v / 3);
        set(hi, lo, bit); // top right
        set(lo, hi, bit); // bottom left
      }
    }

    // Data placement: two-module columns, right to left, zig-zagging vertically.
    var bitIndex = 0;
    var totalBits = codewords.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing pattern
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var col = right - j;
          var upward = ((right + 1) & 2) === 0;
          var row = upward ? size - 1 - vert : vert;
          if (fn[row][col] || bitIndex >= totalBits) continue;
          var dark = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
          m[row][col] = dark;
          bitIndex++;
        }
      }
    }

    // Apply the mask to data modules only.
    for (var r2 = 0; r2 < size; r2++) {
      for (var c2 = 0; c2 < size; c2++) {
        if (fn[r2][c2]) continue;
        if (maskAt(mask, r2, c2)) m[r2][c2] = !m[r2][c2];
      }
    }
    return { size: size, modules: m, version: version, mask: mask };
  }

  function maskAt(mask, row, col) {
    switch (mask) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
      case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
      default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    }
  }

  /* ---------- Mask penalty scoring (ISO/IEC 18004 rules 1-4) ---------- */
  // The 1:1:3:1:1 core of a finder pattern (dark-light-dark³-light-dark).
  var FINDER_CORE = [true, false, true, true, true, false, true];

  function penalty(m, size) {
    var score = 0;

    // Rule 1 — runs of five or more identical modules.
    for (var i = 0; i < size; i++) {
      score += runPenalty(function (k) { return m[i][k]; }, size);
      score += runPenalty(function (k) { return m[k][i]; }, size);
    }

    // Rule 2 — 2x2 blocks of one colour.
    for (var r = 0; r < size - 1; r++) {
      for (var c = 0; c < size - 1; c++) {
        var v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }

    // Rule 3 — finder-like 1:1:3:1:1 patterns with a 4-module light area on
    // either side. The quiet zone outside the symbol counts as light.
    for (var r2 = 0; r2 < size; r2++) {
      score += finderPenalty(rowReader(m, r2), size);
    }
    for (var c3 = 0; c3 < size; c3++) {
      score += finderPenalty(colReader(m, c3), size);
    }

    // Rule 4 — deviation from a 50% dark ratio.
    var dark = 0;
    for (var r4 = 0; r4 < size; r4++) {
      for (var c4 = 0; c4 < size; c4++) if (m[r4][c4]) dark++;
    }
    var percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }

  function runPenalty(get, size) {
    var score = 0;
    var run = 1;
    for (var i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) {
        run++;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);
    return score;
  }

  function windowMatches(get, start, pattern) {
    for (var i = 0; i < pattern.length; i++) {
      if (get(start + i) !== pattern[i]) return false;
    }
    return true;
  }

  function rowReader(m, row) {
    return function (k) { return m[row][k]; };
  }

  function colReader(m, col) {
    return function (k) { return m[k][col]; };
  }

  function allLight(get, from, to) {
    for (var i = from; i < to; i++) if (get(i)) return false;
    return true;
  }

  function finderPenalty(get, size) {
    var score = 0;
    var i = 0;
    while (i + 7 <= size) {
      if (!windowMatches(get, i, FINDER_CORE)) {
        i++;
        continue;
      }
      var lightBefore = allLight(get, Math.max(i - 4, 0), i);
      var lightAfter = allLight(get, i + 7, Math.min(i + 11, size));
      if (lightBefore || lightAfter) {
        score += 40;
        i += 7;
      } else {
        // The trailing "101" of this pattern may start the next one.
        i += 4;
      }
    }
    return score;
  }

  /* ---------- Public API ---------- */
  function matrix(text, options) {
    options = options || {};
    var bytes = utf8Bytes(String(text));
    var version = pickVersion(bytes.length);
    var codewords = buildCodewords(bytes, version);

    if (typeof options.mask === 'number') return buildMatrix(codewords, version, options.mask);

    var best = null;
    var bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var candidate = buildMatrix(codewords, version, mask);
      var score = penalty(candidate.modules, candidate.size);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }

  function svg(text, options) {
    options = options || {};
    var scale = options.scale || 8;
    var quiet = options.quiet == null ? 4 : options.quiet;
    var dark = options.dark || '#000000';
    var light = options.light || '#ffffff';
    var qr = matrix(text, options);
    var dim = (qr.size + quiet * 2) * scale;

    var path = '';
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (!qr.modules[r][c]) continue;
        path += 'M' + (c + quiet) * scale + ' ' + (r + quiet) * scale + 'h' + scale + 'v' + scale + 'h-' + scale + 'z';
      }
    }
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + dim + '" height="' + dim +
      '" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges" role="img" aria-label="QR-код">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + light + '"/>' +
      '<path d="' + path + '" fill="' + dark + '"/></svg>'
    );
  }

  function draw(canvas, text, options) {
    options = options || {};
    var quiet = options.quiet == null ? 4 : options.quiet;
    var dark = options.dark || '#000000';
    var light = options.light || '#ffffff';
    var qr = matrix(text, options);
    var target = options.size || 320;
    var scale = Math.max(1, Math.floor(target / (qr.size + quiet * 2)));
    var dim = (qr.size + quiet * 2) * scale;
    var ratio = global.devicePixelRatio || 1;

    canvas.width = dim * ratio;
    canvas.height = dim * ratio;
    canvas.style.width = dim + 'px';
    canvas.style.height = dim + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = dark;
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
    return qr;
  }

  global.KEQR = { matrix: matrix, svg: svg, draw: draw };
})(typeof globalThis !== 'undefined' ? globalThis : this);
