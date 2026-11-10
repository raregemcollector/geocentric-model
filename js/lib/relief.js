/* relief.js — an approximate elevation model of the land, for shaded relief on the
 * maps and raised terrain on the flat-earth disc.
 *
 * There is no elevation file: the site stays small and self-contained. Instead the
 * height field is built at start-up on a 0.5° grid from
 *   - the Natural Earth land outlines (which cells are land, how far from the coast),
 *   - about 70 mountain ranges and plateaus traced as lines with a crest height and
 *     width (positions and heights from standard atlases),
 *   - the Greenland and Antarctic ice sheets as domes rising from their coasts,
 *   - a little fractal noise so slopes are not perfectly smooth.
 * It places every major range, plateau and ice sheet where it is and about as high as
 * it is; it is not a survey-grade terrain model (no individual valleys or peaks).
 * Heights are in km above sea level; the oceans are 0 (no sea floor).
 *
 * FE.Relief.build()            builds the grid (once, about 50-150 ms)
 * FE.Relief.height(lat, lon)   km, bilinear
 * FE.Relief.shade(lat, lon)    hill shading 0..1 (light from the north-west)
 * FE.Relief.ice(lat, lon)      0..1: 1 on the ice sheets
 * FE.Relief.antarctic(lat,lon) 0..1: 1 on Antarctica */
var FE = window.FE = window.FE || {};

(function () {
  var NX = 720, NY = 360, STEP = 0.5;          // cell (i, j): lon -180 + (i+0.5)*STEP, lat 90 - (j+0.5)*STEP
  var KM_PER_DEG = 111.2;
  var grid = null;

  /* Ranges: [crest height km, half-width deg, flat-top (plateau) 0/1, [lon, lat], ...] */
  var RANGES = [
    // Asia
    [6.6, 1.1, 0, [73, 35.5], [77, 34], [81, 30.5], [84, 28.5], [88, 27.9], [92, 27.9], [95, 28.6]],    // Himalaya
    [4.9, 4.2, 1, [79, 34.5], [84, 33], [89, 32.5], [94, 33], [98, 33.5]],                             // Tibetan Plateau
    [5.6, 1.0, 0, [78, 36], [84, 36], [90, 36.3], [96, 35.8], [100, 35]],                              // Kunlun
    [5.8, 1.2, 0, [69, 35.3], [72, 36.8], [74.5, 38.3], [76.5, 36.2]],                                 // Hindu Kush, Pamir, Karakoram
    [4.2, 1.3, 0, [70, 41.5], [75, 41.6], [80, 42], [85, 43], [90, 43.5]],                             // Tian Shan
    [3.0, 1.5, 0, [85, 50], [88, 49], [91, 48], [96, 46.5], [100, 45.5]],                              // Altai
    [3.8, 2.0, 0, [97, 33], [99, 29], [101, 26], [102, 24]],                                           // Hengduan, Yunnan
    [1.5, 4.0, 1, [97, 47], [103, 47], [110, 45], [116, 44]],                                          // Mongolian Plateau
    [1.2, 2.5, 1, [102, 37], [108, 37], [112, 38]],                                                    // Loess Plateau
    [1.0, 1.5, 0, [111, 40], [115, 39], [118, 41], [122, 46], [121, 50]],                              // Taihang, Greater Khingan
    [2.7, 1.4, 0, [45, 36.5], [48, 33.5], [51, 30.5], [55, 28], [58, 27]],                             // Zagros
    [2.8, 0.8, 0, [48.5, 36.8], [52, 36.2], [56, 37.2], [60, 37]],                                     // Alborz, Kopet Dag
    [1.3, 4.0, 1, [53, 32], [58, 31], [62, 31]],                                                       // Iranian Plateau
    [2.6, 1.6, 0, [62, 34.5], [66, 34], [69, 33.5]],                                                   // Afghan highlands
    [3.6, 0.8, 0, [39.5, 43.4], [43, 42.8], [46.5, 41.7], [49, 41]],                                   // Caucasus
    [1.5, 2.5, 1, [30, 39], [34, 38.6], [38, 39], [42, 39.5], [44, 39.3]],                             // Anatolian Plateau
    [1.1, 1.2, 0, [59, 67], [59.5, 62], [58.7, 56], [58, 52]],                                         // Urals
    [1.8, 2.0, 0, [127, 66], [135, 67], [145, 66], [155, 64], [165, 64.5], [172, 65]],                 // Verkhoyansk, Chersky
    [1.6, 1.2, 0, [158, 53], [159.5, 56], [161, 58]],                                                  // Kamchatka
    [0.7, 5.0, 1, [95, 63], [102, 64], [108, 63]],                                                     // Central Siberian Plateau
    [1.5, 1.5, 0, [98, 53], [106, 52], [113, 54], [118, 56], [127, 57]],                               // Sayan, Baikal, Stanovoy
    [1.1, 1.0, 0, [73.5, 20], [74.3, 16], [75.5, 12], [77, 9]],                                        // Western Ghats
    [0.7, 4.0, 1, [76, 19], [78, 16], [79, 13]],                                                       // Deccan
    [2.0, 1.1, 0, [35.5, 29], [37, 26], [39.5, 22], [41.5, 19], [43.5, 15], [44, 13.5]],               // Hejaz, Asir, Yemen
    [1.9, 0.7, 0, [130.5, 31.5], [134, 34], [137.5, 35.8], [139, 37.5], [140.3, 39.5], [142.5, 43.5]], // Japan
    [3.3, 0.9, 0, [134, -3.6], [137, -4], [140, -4.6], [143, -5.8], [146, -6.8], [148, -8]],           // New Guinea
    [1.4, 1.2, 0, [116.5, 6], [115.5, 3], [114, 1], [113, -0.5]],                                      // Borneo
    [1.8, 0.7, 0, [95.5, 4.5], [98.5, 2], [101, -1], [103.5, -3.8]],                                  // Sumatra
    [1.5, 1.0, 0, [94, 26], [95.5, 22], [97, 18], [98.5, 15]],                                         // Myanmar ranges
    [1.6, 1.2, 0, [103, 21], [105, 18.5], [107, 15.5], [108, 13]],                                     // Annamite Range
    [3.0, 0.6, 0, [121, 24.5], [121.2, 23]],                                                           // Taiwan
    // Europe
    [3.3, 0.8, 0, [6.7, 44.3], [7.2, 45.8], [8.5, 46.4], [10.5, 46.6], [12.5, 47.1], [15, 47.3]],      // Alps
    [2.4, 0.55, 0, [-1.5, 43], [0.5, 42.7], [2.8, 42.5]],                                              // Pyrenees
    [0.8, 2.8, 1, [-6, 40.5], [-3.5, 40.2], [-2, 39.5]],                                               // Meseta
    [1.6, 0.6, 0, [-8, 43], [-5, 43.1], [-2.5, 43]],                                                   // Cantabrian
    [1.8, 0.8, 0, [-5, 37.1], [-2.5, 37.3]],                                                           // Sierra Nevada (Spain)
    [1.6, 1.0, 0, [18, 49.3], [22, 49], [25, 47.5], [25.6, 45.6], [22.5, 45.2]],                       // Carpathians
    [1.6, 1.4, 0, [7, 59], [8, 61.5], [12.5, 63.8], [15.5, 66.5], [19, 68.5], [22, 69.8]],             // Scandinavian Mountains
    [1.8, 1.1, 0, [15, 45], [17.5, 43.5], [19.5, 42], [21, 40.5], [22, 39.2]],                         // Dinaric Alps, Pindus
    [1.6, 0.7, 0, [11, 44], [13.3, 42.3], [15.5, 40.5], [16.2, 39]],                                   // Apennines
    [0.9, 1.5, 0, [3, 45.3], [3.5, 44.5]],                                                             // Massif Central
    [1.0, 1.2, 0, [-5, 57], [-4, 56.8]],                                                               // Scottish Highlands
    [1.0, 0.8, 0, [-21, 64.5], [-18, 64.8], [-16, 65]],                                                // Iceland
    // Africa
    [2.8, 1.1, 0, [-9, 30.5], [-5.5, 32.3], [-1, 33.8], [3, 35], [7, 35.8], [9.5, 36.3]],              // Atlas
    [2.6, 2.6, 1, [37, 13], [38.4, 10], [39.2, 7.5], [39, 6]],                                         // Ethiopian Highlands
    [1.9, 2.0, 1, [36.5, 1], [37, -2], [35.5, -5], [34, -8.5], [33.5, -10]],                           // East African highlands
    [1.5, 4.5, 1, [29, -3], [32, -3]],                                                                 // Lake plateau
    [2.4, 1.1, 0, [27, -31.5], [29.3, -29.2], [30.6, -27]],                                            // Drakensberg
    [1.2, 5.5, 1, [19, -24], [24, -27], [29, -24], [26, -20]],                                         // Southern African Plateau
    [1.2, 3.5, 1, [15, -12], [20, -11], [26, -11], [30, -11]],                                         // Angolan, Katanga plateaus
    [2.0, 1.4, 0, [5.6, 23.2]],                                                                        // Ahaggar
    [2.3, 1.3, 0, [18.5, 21]],                                                                         // Tibesti
    [1.4, 1.0, 0, [11.5, 6.8], [9.5, 5]],                                                              // Cameroon highlands
    [1.4, 1.2, 0, [49.2, -13.5], [47.5, -18.5], [46.4, -22.5]],                                        // Madagascar
    [0.9, 1.5, 0, [-10.5, 9.5], [-9, 8]],                                                              // Guinea highlands
    // North America
    [3.0, 1.9, 0, [-150, 62.5], [-140, 61], [-129, 57], [-121, 52], [-115, 47.5], [-111, 43.5], [-107.5, 39.5], [-106, 35.5]], // Rockies
    [3.7, 0.7, 0, [-156, 62], [-151, 63], [-146, 63.2], [-141, 61.5], [-137, 60]],                     // Alaska Range, St Elias
    [2.3, 0.9, 0, [-129, 54], [-124, 50.5], [-121.5, 47], [-121.8, 44], [-121.5, 41.5], [-119.8, 38.5], [-118.4, 36.3]], // Coast Mts, Cascades, Sierra Nevada
    [1.7, 3.0, 1, [-117, 40.5], [-113, 38], [-110, 36.5], [-108, 36]],                                 // Great Basin, Colorado Plateau
    [1.0, 3.8, 1, [-103, 47], [-102, 41], [-101.5, 35]],                                               // High Plains
    [2.3, 1.7, 0, [-108.5, 29], [-105, 25], [-102, 21.5], [-99, 19.3], [-97, 18]],                    // Sierra Madre, Mexican Plateau
    [1.7, 1.0, 0, [-93, 15.5], [-89, 14.5], [-86, 13], [-84, 10]],                                     // Central America
    [1.0, 1.2, 0, [-84.5, 34], [-81.5, 36.5], [-78.5, 39], [-75.5, 41.6], [-72.5, 44], [-69.5, 46]],   // Appalachians
    [0.8, 1.5, 0, [-70, 54], [-64, 57.5], [-63, 59]],                                                  // Labrador highlands
    [1.0, 1.5, 0, [-72, 73], [-76, 76], [-80, 79.5]],                                                  // Baffin, Ellesmere
    // South America
    [4.4, 1.4, 0, [-73.5, 10.5], [-75.8, 6], [-77.8, 1], [-78.8, -3], [-77.5, -8], [-75.5, -12], [-71.5, -15.8], [-68.5, -19.5], [-68, -23.5], [-69.3, -28], [-70, -32.5], [-70.3, -36], [-71.4, -40], [-72.3, -45], [-73.3, -49.5], [-72.5, -52.5], [-70, -54.5]], // Andes
    [3.9, 2.2, 1, [-69.5, -15.5], [-67.5, -18.5], [-66.8, -22], [-67, -25]],                           // Altiplano, Puna
    [1.6, 2.0, 0, [-62.5, 5], [-61, 4.5], [-63.5, 3]],                                                 // Guiana Highlands
    [1.0, 4.0, 1, [-48, -12], [-45, -18], [-47, -22], [-51, -25]],                                     // Brazilian Highlands
    [1.3, 1.0, 0, [-43, -22.5], [-45.5, -22.7], [-41.5, -20]],                                         // Serra do Mar, Mantiqueira
    // Oceania
    [1.1, 1.3, 0, [145.5, -15.5], [146.6, -20], [149.5, -25], [151.8, -29], [150.2, -33], [148.6, -36.3], [146.3, -37.5]], // Great Dividing Range
    [0.45, 6.0, 1, [118, -25], [124, -25], [130, -24]],                                                // Western Plateau
    [2.4, 0.6, 0, [166.8, -46], [169, -44.2], [171.5, -42.6], [173.5, -41.5]],                         // Southern Alps
    [1.0, 0.6, 0, [175.6, -39.2], [176.3, -38.5]]                                                      // North Island volcanoes
  ];
  /* Single peaks worth marking: [lon, lat, height km, radius deg] */
  var PEAKS = [
    [86.93, 27.99, 8.85, 0.45], [76.5, 35.9, 8.0, 0.5], [-70.0, -32.65, 6.96, 0.4], [-151.0, 63.07, 6.19, 0.4],
    [37.35, -3.07, 5.9, 0.35], [42.44, 43.35, 5.6, 0.35], [-98.6, 18.9, 5.6, 0.3], [-78.8, -1.47, 6.26, 0.3],
    [-77.6, -9.1, 6.76, 0.35], [-140.4, 60.57, 5.96, 0.3], [6.86, 45.83, 4.8, 0.3], [38.0, 13.2, 4.5, 0.4],
    [138.73, 35.36, 3.8, 0.25], [9.17, 4.2, 4.1, 0.3]
  ];

  function decodeRings() { return FE.Land.decode(FE.LAND_110M); }
  function sat(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function hash(i, j) { var h = Math.imul(i * 374761393 + j * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {     // value noise, periodic in x over NX cells
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), p = 4096;
    var a = hash(((xi % p) + p) % p, yi), b = hash((((xi + 1) % p) + p) % p, yi);
    var c = hash(((xi % p) + p) % p, yi + 1), d = hash((((xi + 1) % p) + p) % p, yi + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  /* Rings that cross the 180° meridian (Eurasia, Fiji, Wrangel Island) jump from +180
     to -180. Unwrap them so longitudes run continuously (they may then pass ±180). */
  function unwrapRing(r) {
    var out = [], prev = null, off = 0;
    for (var k = 0; k < r.length; k++) {
      var x = r[k][0];
      if (prev !== null) { if (x - prev > 180) off -= 360; else if (x - prev < -180) off += 360; }
      prev = x; out.push([x + off, r[k][1]]);
    }
    return out;
  }
  /* Even-odd scanline fill of rings into a mask (row by row). Each unwrapped ring is
     also tested shifted by ±360°, so a ring past the seam fills both map edges. (Just
     skipping the wrap-around edges left an odd number of crossings on the rows they
     span, which filled whole bands of sea and emptied bands of land.) */
  function fillRows(mask, rings, value) {
    rings = rings.map(unwrapRing);
    for (var j = 0; j < NY; j++) {
      var lat = 90 - (j + 0.5) * STEP, xs = [];
      rings.forEach(function (r) {
        for (var k = 0; k < r.length; k++) {
          var a = r[k], b = r[(k + 1) % r.length];
          if ((a[1] > lat) !== (b[1] > lat)) {
            var x = a[0] + (lat - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
            xs.push(x - 360, x, x + 360);
          }
        }
      });
      xs.sort(function (p, q) { return p - q; });
      for (var n = 0; n + 1 < xs.length; n += 2) {
        var i0 = Math.ceil((xs[n] + 180) / STEP - 0.5), i1 = Math.floor((xs[n + 1] + 180) / STEP - 0.5);
        for (var i = Math.max(0, i0); i <= Math.min(NX - 1, i1); i++) mask[j * NX + i] = value;
      }
    }
  }
  /* Antarctica: one ring around the pole. Column by column, inside at the pole,
     toggling at each coastline crossing going north. */
  function fillPolar(mask, ring, value) {
    for (var i = 0; i < NX; i++) {
      var lon = -180 + (i + 0.5) * STEP, ys = [];
      for (var k = 0; k < ring.length; k++) {
        // Unwrap each edge so one crossing the ±180° line is kept, not dropped:
        // test it against this column at lon and at lon ± 360.
        var a = ring[k], b = ring[(k + 1) % ring.length], a0 = a[0], b0 = b[0];
        if (b0 - a0 > 180) b0 -= 360; else if (a0 - b0 > 180) b0 += 360;
        for (var sh = -360; sh <= 360; sh += 360) {
          var L = lon + sh;
          if ((a0 > L) !== (b0 > L)) ys.push(a[1] + (L - a0) / (b0 - a0) * (b[1] - a[1]));
        }
      }
      ys.sort(function (p, q) { return q - p; });
      // Walk south from the open ocean, toggling at each coastline crossing.
      var inside = false, n = 0;
      for (var j = 0; j < NY; j++) {
        var lat = 90 - (j + 0.5) * STEP;
        while (n < ys.length && ys[n] > lat) { inside = !inside; n++; }
        if (inside && lat < -60) mask[j * NX + i] = value;   // Antarctica lies wholly south of 60°S
      }
    }
  }

  /* 3x3 majority vote: removes one-cell slivers and pinholes along the coast, which
     would otherwise stand up as spikes or notches in the ice wall. */
  function smoothMask(mask) {
    var out = new Uint8Array(mask.length);
    for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) {
      var n = 0;
      for (var dj = -1; dj <= 1; dj++) {
        var jj = Math.min(NY - 1, Math.max(0, j + dj));
        for (var di = -1; di <= 1; di++) n += mask[jj * NX + (i + di + NX) % NX] ? 1 : 0;
      }
      out[j * NX + i] = n >= 5 ? 1 : 0;
    }
    mask.set(out);
  }
  function pointInRing(ring, lon, lat) {
    var c = false;
    for (var k = 0, m = ring.length - 1; k < ring.length; m = k++) {
      var a = ring[k], b = ring[m];
      if ((a[1] > lat) !== (b[1] > lat) && lon < a[0] + (lat - a[1]) / (b[1] - a[1]) * (b[0] - a[0])) c = !c;
    }
    return c;
  }

  /* Distance (km) from each cell in the mask to the nearest cell outside it
     (two-pass chamfer, longitude wraps). */
  function coastDistance(mask) {
    var D = new Float32Array(NX * NY), INF = 1e9, dy = STEP * KM_PER_DEG, i, j, k;
    for (k = 0; k < D.length; k++) D[k] = mask[k] ? INF : 0;
    function dx(j) { return Math.max(1, STEP * KM_PER_DEG * Math.cos((90 - (j + 0.5) * STEP) * Math.PI / 180)); }
    function relax(j, i, jj, ii, w) {
      if (jj < 0 || jj >= NY) return;
      ii = (ii + NX) % NX;
      var v = D[jj * NX + ii] + w;
      if (v < D[j * NX + i]) D[j * NX + i] = v;
    }
    for (var pass = 0; pass < 2; pass++) {
      for (j = 0; j < NY; j++) {
        var x = dx(j), dg = Math.hypot(x, dy);
        for (i = 0; i < NX; i++) {
          if (!D[j * NX + i]) continue;
          relax(j, i, j, i - 1, x); relax(j, i, j - 1, i, dy); relax(j, i, j - 1, i - 1, dg); relax(j, i, j - 1, i + 1, dg);
        }
      }
      for (j = NY - 1; j >= 0; j--) {
        var x2 = dx(j), dg2 = Math.hypot(x2, dy);
        for (i = NX - 1; i >= 0; i--) {
          if (!D[j * NX + i]) continue;
          relax(j, i, j, i + 1, x2); relax(j, i, j + 1, i, dy); relax(j, i, j + 1, i + 1, dg2); relax(j, i, j + 1, i - 1, dg2);
        }
      }
    }
    return D;
  }

  /* Adds a crest (gaussian across, optionally flat-topped) around a point. */
  function splat(H, lon0, lat0, peak, w, flat, land) {
    var rad = w * 2.6, j0 = Math.max(0, Math.floor((90 - lat0 - rad) / STEP)), j1 = Math.min(NY - 1, Math.ceil((90 - lat0 + rad) / STEP));
    for (var j = j0; j <= j1; j++) {
      var lat = 90 - (j + 0.5) * STEP, cl = Math.max(0.05, Math.cos(lat * Math.PI / 180)), rx = rad / cl;
      var i0 = Math.floor((lon0 - rx + 180) / STEP), i1 = Math.ceil((lon0 + rx + 180) / STEP);
      for (var ii = i0; ii <= i1; ii++) {
        var i = ((ii % NX) + NX) % NX, k = j * NX + i;
        if (!land[k]) continue;
        var lon = -180 + (ii + 0.5) * STEP, ddx = (lon - lon0) * cl, ddy = lat - lat0;
        var g = Math.exp(-(ddx * ddx + ddy * ddy) / (w * w));
        if (flat) g = Math.min(1, g * 1.7);
        var v = peak * g;
        if (v > H[k]) H[k] = v;
      }
    }
  }

  /* Builds the height field from the outlines and ranges (slow: about a second).
     The site normally loads the stored result from reliefdata.js instead; run
     tools/build-relief.mjs after changing RANGES or PEAKS. */
  function generate() {
    var rings = decodeRings(), land = new Uint8Array(NX * NY), ant = new Uint8Array(NX * NY), green = new Uint8Array(NX * NY);
    var others = [], antRing = null, greenRing = null;
    rings.forEach(function (r) {
      var lo = 999, hi = -999;
      for (var i = 0; i < r.length; i++) { lo = Math.min(lo, r[i][0]); hi = Math.max(hi, r[i][0]); }
      if (hi - lo > 350 && !antRing) antRing = r; else others.push(r);
      if (!greenRing && pointInRing(r, -42, 72)) greenRing = r;
    });
    fillRows(land, others, 1);
    if (antRing) { fillPolar(ant, antRing, 1); smoothMask(ant); smoothMask(ant); for (var a = 0; a < land.length; a++) if (ant[a]) land[a] = 1; }
    if (greenRing) fillRows(green, [greenRing], 1);

    var dist = coastDistance(land), H = new Float32Array(NX * NY), k;
    // Lowlands rise gently inland.
    for (k = 0; k < H.length; k++) if (land[k]) H[k] = 0.08 + 0.35 * sat(dist[k] / 1400);
    // Ranges and plateaus, sampled along each line.
    RANGES.forEach(function (rg) {
      var peak = rg[0], w = rg[1], flat = rg[2], pts = rg.slice(3);
      if (pts.length === 1) { splat(H, pts[0][0], pts[0][1], peak, w, flat, land); return; }
      for (var n = 0; n + 1 < pts.length; n++) {
        var p = pts[n], q = pts[n + 1], len = Math.hypot((q[0] - p[0]) * Math.cos(p[1] * Math.PI / 180), q[1] - p[1]);
        var steps = Math.max(1, Math.ceil(len / (w / 2)));
        for (var s = 0; s <= steps; s++) splat(H, p[0] + (q[0] - p[0]) * s / steps, p[1] + (q[1] - p[1]) * s / steps, peak, w, flat, land);
      }
    });
    // Texture: fractal noise roughens slopes in proportion to their height.
    for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) {
      k = j * NX + i;
      if (!land[k]) continue;
      var n2 = 0, amp = 0.5, f = 1 / 6;
      for (var o = 0; o < 4; o++) { n2 += amp * (vnoise(i * f, j * f) * 2 - 1); amp *= 0.5; f *= 2.1; }
      H[k] = Math.max(0.01, H[k] * (1 + 0.32 * n2) + 0.04 * n2);
    }
    // Ice sheets: domes rising from the coast.
    var ice = new Float32Array(NX * NY);
    var dAnt = coastDistance(ant), dGreen = coastDistance(green);
    for (k = 0; k < H.length; k++) {
      if (ant[k]) { H[k] = Math.max(H[k], 1.6 + 2.2 * Math.pow(sat(dAnt[k] / 1300), 0.6)); ice[k] = 1; }
      else if (green[k]) { H[k] = Math.max(H[k], 3.1 * Math.pow(sat(dGreen[k] / 380), 0.55)); ice[k] = sat(dGreen[k] / 60); }
    }
    // Light 3x3 blur to soften the 0.5° steps (land only, coast kept).
    var B = new Float32Array(H.length);
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) {
      k = j * NX + i;
      if (!land[k]) continue;
      var sum = 0, cnt = 0;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
        var jj = j + dj; if (jj < 0 || jj >= NY) continue;
        var kk = jj * NX + (i + di + NX) % NX;
        if (land[kk]) { sum += H[kk]; cnt++; }
      }
      B[k] = sum / cnt;
    }
    // Named summits on top, so the highest peaks keep their height.
    PEAKS.forEach(function (p) { splat(B, p[0], p[1], p[2], Math.max(p[3], 0.6), 0, land); });
    return { H: B, ice: ice, ant: ant, land: land };
  }

  /* Stored form: heights in 40 m steps (land is at least 1), ice 0..255, Antarctica 0/1;
     a zero byte starts a run [0, value, count]. Base-64 text. */
  var QH = 0.04;
  function encode(g) {
    var n = NX * NY, raw = new Uint8Array(n * 3), out = [], k;
    for (k = 0; k < n; k++) {
      raw[k] = g.land[k] ? Math.max(1, Math.min(255, Math.round(g.H[k] / QH))) : 0;
      raw[n + k] = Math.round(g.ice[k] * 255);
      raw[2 * n + k] = g.ant[k] ? 1 : 0;
    }
    for (k = 0; k < raw.length;) {
      var v = raw[k], run = 1;
      while (k + run < raw.length && raw[k + run] === v && run < 255) run++;
      if (v === 0 || run > 3) { out.push(0, v, run); k += run; } else { out.push(v); k++; }
    }
    var bin = '';
    for (k = 0; k < out.length; k++) bin += String.fromCharCode(out[k]);
    return typeof btoa === 'function' ? btoa(bin) : Buffer.from(out).toString('base64');
  }
  function decode(str) {
    var bin = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('latin1');
    var n = NX * NY, raw = new Uint8Array(n * 3), p = 0, k;
    for (var i = 0; i < bin.length;) {
      var c = bin.charCodeAt(i);
      if (c === 0) { var v = bin.charCodeAt(i + 1), run = bin.charCodeAt(i + 2); for (k = 0; k < run; k++) raw[p++] = v; i += 3; }
      else { raw[p++] = c; i++; }
    }
    var H = new Float32Array(n), ice = new Float32Array(n), ant = new Uint8Array(n), land = new Uint8Array(n);
    for (k = 0; k < n; k++) {
      H[k] = raw[k] * QH; land[k] = raw[k] ? 1 : 0;
      ice[k] = raw[n + k] / 255; ant[k] = raw[2 * n + k];
    }
    return { H: H, ice: ice, ant: ant, land: land };
  }

  function build() {
    if (grid) return grid;
    var g = FE.RELIEF_DATA ? decode(FE.RELIEF_DATA) : generate();
    var B = g.H, land = g.land, j, i, k;
    // Hill shading (light from the north-west, 40° up), heights exaggerated for legibility.
    var S = new Float32Array(B.length), az = 315 * Math.PI / 180, alt = 40 * Math.PI / 180, ex = 22;
    for (j = 0; j < NY; j++) {
      var lat = 90 - (j + 0.5) * STEP, ddx = Math.max(5, STEP * KM_PER_DEG * Math.cos(lat * Math.PI / 180)), ddy = STEP * KM_PER_DEG;
      for (i = 0; i < NX; i++) {
        k = j * NX + i;
        if (!land[k]) { S[k] = 1; continue; }
        var e = B[j * NX + (i + 1) % NX], w2 = B[j * NX + (i - 1 + NX) % NX];
        var nN = B[Math.max(0, j - 1) * NX + i], sS = B[Math.min(NY - 1, j + 1) * NX + i];
        var gx = (e - w2) / (2 * ddx) * ex, gy = (nN - sS) / (2 * ddy) * ex;     // east, north slopes
        var slope = Math.atan(Math.hypot(gx, gy)), aspect = Math.atan2(gx, gy);  // downhill direction is -gradient
        var v = Math.cos(Math.PI / 2 - alt) * Math.cos(slope) + Math.sin(Math.PI / 2 - alt) * Math.sin(slope) * Math.cos(az - aspect - Math.PI);
        S[k] = sat(v / Math.sin(alt));
      }
    }
    grid = { H: B, S: S, ice: g.ice, ant: g.ant, land: land };
    return grid;
  }

  function sample(arr, lat, lon) {
    if (!grid) build();
    var x = (lon + 180) / STEP - 0.5, y = (90 - lat) / STEP - 0.5;
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    var y1 = Math.min(NY - 1, Math.max(0, y0 + 1)); y0 = Math.min(NY - 1, Math.max(0, y0));
    var xa = ((x0 % NX) + NX) % NX, xb = (xa + 1) % NX;
    var a = arr[y0 * NX + xa], b = arr[y0 * NX + xb], c = arr[y1 * NX + xa], d = arr[y1 * NX + xb];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  /* Map colours by height (km): lowland green to upland tan, rock, then snow. */
  var RAMP = [[0, [128, 170, 102]], [0.4, [150, 184, 112]], [1.0, [192, 194, 136]], [2.0, [205, 182, 140]],
    [3.2, [182, 154, 126]], [4.8, [166, 142, 122]], [5.8, [200, 194, 190]], [6.6, [244, 244, 246]]];
  function landColor(h, out) {
    var n = RAMP.length - 1;
    if (h >= RAMP[n][0]) { out[0] = RAMP[n][1][0]; out[1] = RAMP[n][1][1]; out[2] = RAMP[n][1][2]; return out; }
    for (var i = 0; i < n; i++) {
      if (h < RAMP[i + 1][0]) {
        var t = (h - RAMP[i][0]) / (RAMP[i + 1][0] - RAMP[i][0]), A = RAMP[i][1], B2 = RAMP[i + 1][1];
        out[0] = A[0] + (B2[0] - A[0]) * t; out[1] = A[1] + (B2[1] - A[1]) * t; out[2] = A[2] + (B2[2] - A[2]) * t;
        return out;
      }
    }
    return out;
  }
  /* Shaded colour of land at a point: [r, g, b] 0..255. */
  function color(lat, lon, out) {
    out = out || [0, 0, 0];
    var h = sample(grid.H, lat, lon), sh = sample(grid.S, lat, lon), ic = sample(grid.ice, lat, lon);
    landColor(h, out);
    if (ic > 0) { out[0] += (236 - out[0]) * ic; out[1] += (241 - out[1]) * ic; out[2] += (247 - out[2]) * ic; }
    var k = 0.62 + 0.5 * sh;
    out[0] = Math.min(255, out[0] * k); out[1] = Math.min(255, out[1] * k); out[2] = Math.min(255, out[2] * (k + (ic > 0 ? 0.04 : 0)));
    return out;
  }

  /* Shaded colour of every cell, for fast texture painting: RGB floats per cell. */
  var colorGridCache = null;
  function colorGrid() {
    if (colorGridCache) return colorGridCache;
    build();
    var C = new Float32Array(NX * NY * 3), out = [0, 0, 0];
    for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) {
      var k = j * NX + i;
      color(90 - (j + 0.5) * STEP, -180 + (i + 0.5) * STEP, out);
      C[k * 3] = out[0]; C[k * 3 + 1] = out[1]; C[k * 3 + 2] = out[2];
    }
    colorGridCache = { C: C, NX: NX, NY: NY, STEP: STEP };
    return colorGridCache;
  }

  FE.Relief = {
    colorGrid: colorGrid,
    build: build,
    generate: generate, encode: encode, decode: decode,
    ready: function () { return !!grid; },
    height: function (lat, lon) { return sample(grid ? grid.H : build().H, lat, lon); },
    shade: function (lat, lon) { return sample(build().S, lat, lon); },
    ice: function (lat, lon) { return sample(build().ice, lat, lon); },
    antarctic: function (lat, lon) { return sample(build().ant, lat, lon); },
    color: function (lat, lon, out) { build(); return color(lat, lon, out); },
    RANGES: RANGES, PEAKS: PEAKS
  };
})();
