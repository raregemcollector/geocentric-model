/* maptex.js — decodes the land outlines and paints the azimuthal-equidistant map
 * (north pole at the center, south pole on the rim) into a canvas used as the
 * disc texture. Replaces EarthMap.inc. */
var FE = window.FE = window.FE || {};

(function () {
  var ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_~';
  var LOOKUP = {};
  for (var i = 0; i < ALPHA.length; i++) LOOKUP[ALPHA[i]] = i;

  /* Returns an array of rings, each an array of [lon, lat] in degrees. */
  function decode(str) {
    return str.split(';').map(function (s) {
      var vals = [], v = 0, shift = 0;
      for (var k = 0; k < s.length; k++) {
        var c = LOOKUP[s[k]];
        if (c >= 32) { v |= (c - 32) << shift; shift += 5; }
        else {
          v |= c << shift;
          vals.push(v & 1 ? -((v + 1) >> 1) : v >> 1);
          v = 0; shift = 0;
        }
      }
      var ring = [], x = 0, y = 0;
      for (var j = 0; j + 1 < vals.length; j += 2) { x += vals[j]; y += vals[j + 1]; ring.push([x / 5, y / 5]); }
      return ring;
    });
  }

  /* Insert points so no edge spans more than maxDeg; longitude steps take the short way. */
  function densify(ring, maxDeg) {
    var out = [];
    for (var i = 0; i < ring.length; i++) {
      var a = ring[i], b = ring[(i + 1) % ring.length];
      var dlon = b[0] - a[0];
      if (dlon > 180) dlon -= 360; else if (dlon < -180) dlon += 360;
      var dlat = b[1] - a[1];
      var n = Math.max(1, Math.ceil(Math.max(Math.abs(dlon), Math.abs(dlat)) / maxDeg));
      for (var k = 0; k < n; k++) out.push([a[0] + dlon * k / n, a[1] + dlat * k / n]);
    }
    return out;
  }

  var COLORS = {
    water: '#16304d', land: '#a2c286', landEdge: '#76995a',
    ice: '#eef1f4', iceEdge: '#c3cad3', rim: '#7d8796'
  };

  /* Antarctica's big ice shelves. Natural Earth's land outlines stop at the grounding
     line, so the Ross, Ronne-Filchner and Amery shelves would show as open sea (deep
     notches in the coast). Each polygon runs along the shelf's seaward ice front
     (positions from standard atlases, about 0.5° accurate) and closes on the inland
     side, where it only overlaps ice that is drawn anyway. [lon, lat] degrees. */
  var SHELVES = [
    // Ross Ice Shelf: Ross Island to the Edward VII Peninsula, closed through the ice sheet
    [[166.2, -78.3], [167.5, -77.7], [170, -77.9], [173, -78.2], [176, -78.3], [179, -78.4], [182, -78.4], [185, -78.3],
     [188, -78.4], [191, -78.5], [194, -78.6], [197, -78.3], [200, -78.1], [202, -78.0], [203, -78.6], [204, -80.5],
     [205, -86], [163, -86], [162, -82], [163.5, -79]],
    // Ronne-Filchner Ice Shelf: the Antarctic Peninsula's base to the Luitpold Coast
    [[-61.8, -74.5], [-60.8, -75.0], [-59.5, -75.5], [-57.5, -76.0], [-55, -76.6], [-52.5, -77.0], [-50, -77.4],
     [-48, -77.8], [-45.5, -78.0], [-43, -77.9], [-40, -77.8], [-37.5, -77.9], [-35.4, -78.2], [-34, -79],
     [-34, -86], [-82, -86], [-82, -78], [-78, -76.9], [-70, -76.2], [-64.5, -75.1]],
    // Amery Ice Shelf, Prydz Bay
    [[69.5, -69.5], [71, -69.6], [72.5, -69.7], [74, -69.9], [75, -69.7], [75, -73.5], [67.5, -73.5], [67.5, -70.5]]
  ];

  function splitRings() {
    var rings = decode(FE.LAND_110M), land = [], ice = null, polar = [];
    rings.forEach(function (r) {
      // The Antarctic mainland is the one ring that spans every longitude.
      var lo = 999, hi = -999, top = -99;
      for (var i = 0; i < r.length; i++) { lo = Math.min(lo, r[i][0]); hi = Math.max(hi, r[i][0]); top = Math.max(top, r[i][1]); }
      if (hi - lo > 350 && !ice) ice = r;
      else if (top < -60) polar.push(r);      // Antarctic islands (Berkner, Roosevelt, Alexander, Thurston...): ice-covered
      else land.push(r);
    });
    return { land: land, ice: ice, polar: polar, shelves: SHELVES };
  }

  /* Shaded relief: repaint land and ice pixels with height colours and hill shading
     from FE.Relief. maskFill(g) must fill land (red) and Antarctica (green) on a black
     canvas of the same size; toLatLon(x, y, out) writes [lat, lon] of a pixel and
     returns false to skip it. */
  function paintRelief(cv, maskFill, toLatLon) {
    if (!FE.Relief) return;
    FE.Relief.build();
    var W = cv.width, H = cv.height, m = document.createElement('canvas');
    m.width = W; m.height = H;
    var mg = m.getContext('2d', { willReadFrequently: true });
    mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H);
    maskFill(mg);
    var mask = mg.getImageData(0, 0, W, H).data, g = cv.getContext('2d'), img = g.getImageData(0, 0, W, H), px = img.data;
    var G = FE.Relief.colorGrid(), C = G.C, NX = G.NX, NY = G.NY, ST = G.STEP, ll = [0, 0];
    var RG = FE.Relief.build(), ANT = RG.ant, LAND = RG.land, ICE_RGB = [236, 240, 245];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var k = (y * W + x) * 4, isIce = mask[k + 1] > mask[k], t = (isIce ? mask[k + 1] : mask[k]) / 255;
      if (t <= 0 || !toLatLon(x + 0.5, y + 0.5, ll)) continue;
      // bilinear lookup in the colour grid (longitude wraps)
      var gx = (ll[1] + 180) / ST - 0.5, gy = (90 - ll[0]) / ST - 0.5;
      var x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      if (y0 < 0) { y0 = 0; fy = 0; } if (y0 > NY - 2) { y0 = NY - 2; fy = 1; }
      var xa = x0 < 0 ? x0 + NX : x0 >= NX ? x0 - NX : x0, xb = xa + 1 === NX ? 0 : xa + 1;
      var a = (y0 * NX + xa) * 3, b = (y0 * NX + xb) * 3, c = a + NX * 3, d = b + NX * 3;
      var w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      // The 0.5° grid is coarser than the outlines: near a coast, some of the four cells
      // are sea (coloured as bare lowland) or the wrong kind of ground. Use only cells of
      // the same kind as this pixel (ice for Antarctica, ice-free land otherwise), so the
      // Antarctic coast and shelves do not pick up green specks.
      var ia = a / 3, ib = b / 3, ic = c / 3, id = d / 3;
      var m00 = isIce ? ANT[ia] : LAND[ia] && !ANT[ia], m10 = isIce ? ANT[ib] : LAND[ib] && !ANT[ib];
      var m01 = isIce ? ANT[ic] : LAND[ic] && !ANT[ic], m11 = isIce ? ANT[id] : LAND[id] && !ANT[id];
      var v00 = m00 ? w00 : 0, v10 = m10 ? w10 : 0, v01 = m01 ? w01 : 0, v11 = m11 ? w11 : 0, ws = v00 + v10 + v01 + v11;
      if (ws > 1e-4) { v00 /= ws; v10 /= ws; v01 /= ws; v11 /= ws; }
      else if (isIce) { for (var c2 = 0; c2 < 3; c2++) px[k + c2] += (ICE_RGB[c2] - px[k + c2]) * t; continue; }
      else { v00 = w00; v10 = w10; v01 = w01; v11 = w11; }
      for (var ch = 0; ch < 3; ch++) {
        var v = C[a + ch] * v00 + C[b + ch] * v10 + C[c + ch] * v01 + C[d + ch] * v11;
        // The grid's coastal ice cells are hill-shaded as a steep drop to the sea, which
        // shows as grey dots along the coast; keep ice no darker than the shelf ice colour.
        if (isIce && v < ICE_RGB[ch]) v = ICE_RGB[ch];
        px[k + ch] += (v - px[k + ch]) * t;
      }
    }
    g.putImageData(img, 0, 0);
  }

  function build(size) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var g = cv.getContext('2d', { willReadFrequently: true }), c = size / 2, s = c * 0.998;   // read back once for relief: keep it on the CPU
    function P(lon, lat) {
      var r = s * (90 - lat) / 180, a = lon * Math.PI / 180;
      return [c + r * Math.cos(a), c - r * Math.sin(a)];   // canvas y down; texture is flipped on upload
    }
    g.fillStyle = COLORS.water;
    g.beginPath(); g.arc(c, c, s, 0, Math.PI * 2); g.fill();

    var sp = splitRings(), land = sp.land, ice = sp.ice, extra = sp.polar.concat(sp.shelves);
    function tracePath(gg, r) {
      var d = densify(r, 1.5);
      for (var i = 0; i < d.length; i++) { var p = P(d[i][0], d[i][1]); if (i) gg.lineTo(p[0], p[1]); else gg.moveTo(p[0], p[1]); }
      gg.closePath();
    }
    function fillLand(gg, col) { gg.beginPath(); land.forEach(function (r) { tracePath(gg, r); }); gg.fillStyle = col; gg.fill('evenodd'); }
    function fillIce(gg, col) {
      if (!ice) return;
      gg.beginPath(); gg.arc(c, c, s, 0, Math.PI * 2); tracePath(gg, ice);
      gg.fillStyle = col; gg.fill('evenodd');
      // ice-covered islands and the ice shelves, each filled on its own
      extra.forEach(function (r) { gg.beginPath(); tracePath(gg, r); gg.fill(); });
    }
    // Land: one even-odd path so lake holes stay water. Antarctica wraps around the rim:
    // the region between its coast loop and the rim.
    fillLand(g, COLORS.land);
    fillIce(g, COLORS.ice);
    paintRelief(cv, function (mg) { fillLand(mg, '#f00'); mg.globalCompositeOperation = 'lighter'; fillIce(mg, '#0f0'); }, function (x, y, out) {
      var dx = x - c, dy = c - y, r = Math.sqrt(dx * dx + dy * dy) / s;
      if (r > 1) return false;
      out[0] = 90 - 180 * r; out[1] = Math.atan2(dy, dx) * 57.29577951308232;
      return true;
    });
    g.beginPath(); land.forEach(function (r) { tracePath(g, r); });
    g.lineWidth = Math.max(1, size / 1400); g.strokeStyle = FE.Relief ? 'rgba(70,96,60,0.55)' : COLORS.landEdge; g.stroke();
    if (ice) { g.beginPath(); tracePath(g, ice); g.strokeStyle = COLORS.iceEdge; g.stroke(); }
    g.beginPath(); g.arc(c, c, s - 1, 0, Math.PI * 2);
    g.lineWidth = Math.max(1.5, size / 900); g.strokeStyle = COLORS.rim; g.stroke();
    return cv;
  }

  /* The same land in plate carree (longitude/latitude) for the globe. */
  function buildEquirect(w) {
    var h = w / 2, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var g = cv.getContext('2d', { willReadFrequently: true });
    function P(lon, lat) { return [(lon + 180) / 360 * w, (90 - lat) / 180 * h]; }
    g.fillStyle = COLORS.water; g.fillRect(0, 0, w, h);
    var sp = splitRings(), ice = sp.ice;
    // Rings that cross the 180° meridian (Eurasia via Chukotka, Fiji, Wrangel Island) jump
    // from +180 to -180; drawn as-is that jump becomes an edge across the whole map and the
    // even-odd fill floods a band of the Arctic and Canada. Unwrap each ring so longitudes
    // run continuously, then draw it again shifted by ±360° to cover both sides of the seam.
    function unwrap(r) {
      var out = [], prev = null, off = 0;
      r.forEach(function (pt) {
        if (prev !== null) { var dl = pt[0] - prev; if (dl > 180) off -= 360; else if (dl < -180) off += 360; }
        prev = pt[0]; out.push([pt[0] + off, pt[1]]);
      });
      return out;
    }
    var land = sp.land.map(unwrap), iceU = ice ? unwrap(ice) : null;
    var extra = sp.polar.concat(sp.shelves).map(unwrap);   // ice-covered islands and ice shelves
    function fillExtra(gg, col) {
      gg.fillStyle = col;
      extra.forEach(function (r) {
        [-360, 0, 360].forEach(function (sh) {
          gg.beginPath();
          r.forEach(function (pt, i) { var p = P(pt[0] + sh, pt[1]); if (i) gg.lineTo(p[0], p[1]); else gg.moveTo(p[0], p[1]); });
          gg.closePath(); gg.fill();
        });
      });
    }
    function landPath(gg) {
      gg.beginPath();
      land.forEach(function (r) {
        var lo = 999, hi = -999;
        r.forEach(function (pt) { if (pt[0] < lo) lo = pt[0]; if (pt[0] > hi) hi = pt[0]; });
        [-360, 0, 360].forEach(function (sh) {
          if (hi + sh < -180 || lo + sh > 180) return;   // this copy is entirely off the map
          r.forEach(function (pt, i) { var p = P(pt[0] + sh, pt[1]); if (i) gg.lineTo(p[0], p[1]); else gg.moveTo(p[0], p[1]); });
          gg.closePath();
        });
      });
    }
    function icePath(gg) {
      // Antarctica: unwrap the coast so it runs once around in longitude, then close it
      // along the South Pole line; drawn shifted by ±360° too so any part past the seam shows.
      var pts = iceU;
      gg.beginPath();
      [-360, 0, 360].forEach(function (sh) {
        pts.forEach(function (pt, i) { var p = P(pt[0] + sh, pt[1]); if (i) gg.lineTo(p[0], p[1]); else gg.moveTo(p[0], p[1]); });
        var a = P(pts[pts.length - 1][0] + sh, -90), b = P(pts[0][0] + sh, -90);
        gg.lineTo(a[0], a[1]); gg.lineTo(b[0], b[1]);
        gg.closePath();
      });
    }
    landPath(g); g.fillStyle = COLORS.land; g.fill('evenodd');
    if (ice) { icePath(g); g.fillStyle = COLORS.ice; g.fill(); }
    fillExtra(g, COLORS.ice);
    paintRelief(cv, function (mg) {
      landPath(mg); mg.fillStyle = '#f00'; mg.fill('evenodd');
      mg.globalCompositeOperation = 'lighter';
      if (ice) { icePath(mg); mg.fillStyle = '#0f0'; mg.fill(); }
      fillExtra(mg, '#0f0');
    }, function (x, y, out) { out[0] = 90 - y / h * 180; out[1] = x / w * 360 - 180; return true; });
    landPath(g); g.lineWidth = Math.max(1, w / 1600); g.strokeStyle = FE.Relief ? 'rgba(70,96,60,0.55)' : COLORS.landEdge; g.stroke();
    return cv;
  }

  FE.Land = { decode: decode, densify: densify };
  FE.MapTexture = { build: build, buildEquirect: buildEquirect, COLORS: COLORS };
})();
