/* vec.js — small allocation-light vector/matrix helpers.
 * Vectors are plain [x,y,z] arrays. 3x3 matrices are row-major arrays of 9 numbers.
 * 4x4 matrices (for the GPU) are column-major Float32Array(16), like WebGL expects. */
var FE = window.FE = window.FE || {};

(function () {
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  FE.U = {
    D2R: D2R,
    R2D: R2D,
    rad: function (d) { return d * D2R; },
    deg: function (r) { return r * R2D; },
    clamp: function (x, a, b) { return x < a ? a : x > b ? b : x; },
    /* Wrap x into [0, m). Correct for negative input too (the original ToRange
       returned m itself for exact negative multiples). */
    wrap: function (x, m) { var v = x % m; return v < 0 ? v + m : v; },
    /* Wrap an angle into (-180, 180]. */
    wrap180: function (x) { var v = ((x + 180) % 360 + 360) % 360 - 180; return v === -180 ? 180 : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; }
  };

  var V = FE.V = {
    add: function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    scale: function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
    addScaled: function (a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    },
    len: function (a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); },
    dist: function (a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); },
    norm: function (a) { var l = V.len(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; },
    lerp: function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
    /* Unit vector from latitude/longitude in degrees (z = north). */
    fromLatLon: function (lat, lon, r) {
      r = r === undefined ? 1 : r;
      var la = lat * D2R, lo = lon * D2R, c = Math.cos(la);
      return [r * c * Math.cos(lo), r * c * Math.sin(lo), r * Math.sin(la)];
    },
    /* Inverse of fromLatLon; returns {lat, lon} in degrees. Stable at the poles. */
    toLatLon: function (v) {
      var h = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
      return { lat: Math.atan2(v[2], h) * R2D, lon: h > 0 ? Math.atan2(v[1], v[0]) * R2D : 0 };
    }
  };

  var M3 = FE.M3 = {
    I: function () { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; },
    rotX: function (a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; },
    rotY: function (a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; },
    rotZ: function (a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; },
    mul: function (a, b) {
      var r = new Array(9);
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++)
        r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
      return r;
    },
    apply: function (m, v) {
      return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
              m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
              m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
    }
  };

  FE.M4 = {
    perspective: function (fovY, aspect, near, far) {
      var f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far), m = new Float32Array(16);
      m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = 2 * far * near * nf;
      return m;
    },
    /* View matrix from an orthonormal camera basis. */
    view: function (eye, right, up, back) {
      var m = new Float32Array(16);
      m[0] = right[0]; m[4] = right[1]; m[8] = right[2];
      m[1] = up[0]; m[5] = up[1]; m[9] = up[2];
      m[2] = back[0]; m[6] = back[1]; m[10] = back[2];
      m[12] = -V.dot(right, eye); m[13] = -V.dot(up, eye); m[14] = -V.dot(back, eye); m[15] = 1;
      return m;
    },
    mul: function (a, b) {
      var r = new Float32Array(16);
      for (var c = 0; c < 4; c++) for (var rr = 0; rr < 4; rr++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + rr] * b[c * 4 + k];
        r[c * 4 + rr] = s;
      }
      return r;
    },
    rotZ: function (a) {
      var m = new Float32Array(16), c = Math.cos(a), s = Math.sin(a);
      m[0] = c; m[1] = s; m[4] = -s; m[5] = c; m[10] = 1; m[15] = 1;
      return m;
    },
    identity: function () { var m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    /* Project world point with a view-projection matrix; returns NDC [x,y,z,w]. */
    project: function (m, p) {
      var x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
      var y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
      var z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
      var w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      return [x / w, y / w, z / w, w];
    }
  };

  /* Colors: parse '#rgb' / '#rrggbb' into [r,g,b,a] 0..1, with a cache. */
  var cache = {};
  FE.color = function (hex, alpha) {
    var key = hex + '|' + (alpha === undefined ? 1 : alpha);
    if (cache[key]) return cache[key];
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return (cache[key] = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, alpha === undefined ? 1 : alpha]);
  };
  FE.hsv = function (h, s, v, a) {
    var i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), r, g, b;
    switch (((i % 6) + 6) % 6) {
      case 0: r = v; g = t; b = p; break; case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break; case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break; default: r = v; g = p; b = q;
    }
    return [r, g, b, a === undefined ? 1 : a];
  };
})();
