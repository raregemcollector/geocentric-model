/* astro.js — compact ephemeris for the Sun and Moon.
 *
 * Replaces the original model's circular orbits and hand-tuned Moon offsets with
 * standard low-precision theory, so any date works, not just 2017:
 *   Sun:  Astronomical Almanac low-precision formulae (~0.01 deg).
 *   Moon: Schlyter's orbital elements plus the 12 largest longitude and
 *         5 largest latitude perturbations (~2 arcmin).
 *   Earth rotation: IAU 1982 GMST (mean sidereal time).
 *
 * Time unit "t": days since 2017-01-01 00:00 UTC — the same DateTime scale as the
 * original page, so its demo timings still apply.
 *
 * Celestial frame: equatorial of date, x = vernal equinox, z = north celestial pole. */
var FE = window.FE = window.FE || {};

(function () {
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var sin = function (d) { return Math.sin(d * D2R); };
  var cos = function (d) { return Math.cos(d * D2R); };
  var wrap = FE.U.wrap;

  var T2017_J2000 = 6209.5;          // 2017-01-01 00:00 UTC is JD 2457754.5
  var EARTH_RADIUS_KM = 6371.0;
  var AU_KM = 149597870.7;

  function dJ2000(t) { return t + T2017_J2000; }

  function obliquity(t) { return 23.439291 - 3.563e-7 * dJ2000(t); }

  /* Rotate ecliptic (lon, lat, deg) to an equatorial unit vector. */
  function eclToEq(lon, lat, eps) {
    var cl = cos(lat), x = cl * cos(lon), y = cl * sin(lon), z = sin(lat);
    var ce = cos(eps), se = sin(eps);
    return [x, y * ce - z * se, y * se + z * ce];
  }

  function sun(t) {
    var d = dJ2000(t);
    var L = wrap(280.460 + 0.9856474 * d, 360);
    var g = wrap(357.528 + 0.9856003 * d, 360);
    var lambda = wrap(L + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    var R = 1.00014 - 0.01671 * cos(g) - 0.00014 * cos(2 * g);
    var eps = obliquity(t);
    var dir = eclToEq(lambda, 0, eps);
    return { lambda: lambda, eps: eps, dir: dir, distKm: R * AU_KM, raDec: FE.V.toLatLon(dir) };
  }

  /* Greenwich mean sidereal angle in degrees: rotation of the Earth relative to the
     vernal equinox. Replaces the original's linear 23.93447 h sidereal-day model. */
  function gmst(t) {
    var d = dJ2000(t), T = d / 36525;
    return wrap(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T, 360);
  }

  /* Moon: geocentric equatorial direction, distance and current node. */
  function moon(t) {
    var d = dJ2000(t) + 1.5;                 // Schlyter day number (epoch 1999-12-31 0h)
    var N = wrap(125.1228 - 0.0529538083 * d, 360);
    var i = 5.1454;
    var w = wrap(318.0634 + 0.1643573223 * d, 360);
    var a = 60.2666, e = 0.054900;
    var M = wrap(115.3654 + 13.0649929509 * d, 360);
    var ws = 282.9404 + 4.70935e-5 * d;
    var Ms = wrap(356.0470 + 0.9856002585 * d, 360);

    // Kepler's equation
    var E = M + R2D * e * sin(M) * (1 + e * cos(M));
    for (var k = 0; k < 5; k++) {
      var dE = (E - R2D * e * sin(E) - M) / (1 - e * cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-6) break;
    }
    var xv = a * (cos(E) - e), yv = a * Math.sqrt(1 - e * e) * sin(E);
    var v = Math.atan2(yv, xv) * R2D, r = Math.sqrt(xv * xv + yv * yv);
    var vw = v + w;
    var xh = r * (cos(N) * cos(vw) - sin(N) * sin(vw) * cos(i));
    var yh = r * (sin(N) * cos(vw) + cos(N) * sin(vw) * cos(i));
    var zh = r * sin(vw) * sin(i);
    var lon = Math.atan2(yh, xh) * R2D;
    var lat = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) * R2D;

    var Ls = Ms + ws, Lm = M + w + N, D = Lm - Ls, F = Lm - N;
    lon += -1.274 * sin(M - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Ms)
         - 0.059 * sin(2 * M - 2 * D) - 0.057 * sin(M - 2 * D + Ms) + 0.053 * sin(M + 2 * D)
         + 0.046 * sin(2 * D - Ms) + 0.041 * sin(M - Ms) - 0.035 * sin(D)
         - 0.031 * sin(M + Ms) - 0.015 * sin(2 * F - 2 * D) + 0.011 * sin(M - 4 * D);
    lat += -0.173 * sin(F - 2 * D) - 0.055 * sin(M - F - 2 * D) - 0.046 * sin(M + F - 2 * D)
         + 0.033 * sin(F + 2 * D) + 0.017 * sin(2 * M + F);
    r += -0.58 * cos(M - 2 * D) - 0.46 * cos(2 * D);

    var eps = obliquity(t);
    var dir = eclToEq(lon, lat, eps);
    return {
      dir: dir, distER: r, distKm: r * EARTH_RADIUS_KM, node: N, incl: i, eps: eps,
      eclLon: wrap(lon, 360), eclLat: lat, raDec: FE.V.toLatLon(dir)
    };
  }

  /* Point on the Moon's current orbit, u degrees past the ascending node (unit vector). */
  function moonOrbitPoint(node, incl, eps, u) {
    var cn = cos(node), sn = sin(node), cu = cos(u), su = sin(u), ci = cos(incl), si = sin(incl);
    var x = cn * cu - sn * su * ci, y = sn * cu + cn * su * ci, z = su * si;
    var ce = cos(eps), se = sin(eps);
    return [x, y * ce - z * se, y * se + z * ce];
  }

  /* Point on the ecliptic at longitude lon (unit vector, equatorial frame). */
  function eclipticPoint(lon, eps) { return eclToEq(lon, 0, eps); }

  /* Season marker: name of the equinox/solstice that falls within the UTC day of t. */
  function seasonOfDay(t) {
    var d0 = Math.floor(t), a = sun(d0).lambda, b = sun(d0 + 1).lambda;
    var names = ['March Equinox', 'June Solstice', 'September Equinox', 'December Solstice'];
    for (var k = 0; k < 4; k++) {
      var target = k * 90;
      var da = FE.U.wrap180(a - target), db = FE.U.wrap180(b - target);
      if (da < 0 && db >= 0) return names[k];
    }
    return '';
  }

  /* ---------------- planets ----------------
     Schlyter's orbital elements with the main Jupiter-Saturn perturbations
     (about 1-2 arcmin). Returns geocentric equatorial direction, distance (AU),
     and visual magnitude. */
  var PLANETS = {
    Mercury: { N: [48.3313, 3.24587e-5], i: [7.0047, 5.00e-8], w: [29.1241, 1.01444e-5], a: [0.387098, 0], e: [0.205635, 5.59e-10], M: [168.6562, 4.0923344368],
      mag: function (r, R, fv) { return -0.36 + 5 * Math.log10(r * R) + 0.027 * fv + 2.2e-13 * Math.pow(fv, 6); }, color: '#d8cfc2' },
    Venus: { N: [76.6799, 2.46590e-5], i: [3.3946, 2.75e-8], w: [54.8910, 1.38374e-5], a: [0.723330, 0], e: [0.006773, -1.302e-9], M: [48.0052, 1.6021302244],
      mag: function (r, R, fv) { return -4.34 + 5 * Math.log10(r * R) + 0.013 * fv + 4.2e-7 * Math.pow(fv, 3); }, color: '#fff6dc' },
    Mars: { N: [49.5574, 2.11081e-5], i: [1.8497, -1.78e-8], w: [286.5016, 2.92961e-5], a: [1.523688, 0], e: [0.093405, 2.516e-9], M: [18.6021, 0.5240207766],
      mag: function (r, R, fv) { return -1.51 + 5 * Math.log10(r * R) + 0.016 * fv; }, color: '#ff9a6b' },
    Jupiter: { N: [100.4542, 2.76854e-5], i: [1.3030, -1.557e-7], w: [273.8777, 1.64505e-5], a: [5.20256, 0], e: [0.048498, 4.469e-9], M: [19.8950, 0.0830853001],
      mag: function (r, R, fv) { return -9.25 + 5 * Math.log10(r * R) + 0.014 * fv; }, color: '#f3e3c3' },
    Saturn: { N: [113.6634, 2.38980e-5], i: [2.4886, -1.081e-7], w: [339.3939, 2.97661e-5], a: [9.55475, 0], e: [0.055546, -9.499e-9], M: [316.9670, 0.0334442282],
      mag: function (r, R, fv) { return -9.0 + 5 * Math.log10(r * R) + 0.044 * fv; }, color: '#efd9a0' }
  };
  function lin(p, d) { return p[0] + p[1] * d; }

  function helio(name, d) {
    var P = PLANETS[name];
    var N = lin(P.N, d), i = lin(P.i, d), w = lin(P.w, d), a = P.a[0], e = lin(P.e, d), M = wrap(lin(P.M, d), 360);
    var E = M + R2D * e * sin(M) * (1 + e * cos(M));
    for (var k = 0; k < 8; k++) {
      var dE = (E - R2D * e * sin(E) - M) / (1 - e * cos(E));
      E -= dE; if (Math.abs(dE) < 1e-7) break;
    }
    var xv = a * (cos(E) - e), yv = a * Math.sqrt(1 - e * e) * sin(E);
    var v = Math.atan2(yv, xv) * R2D, r = Math.sqrt(xv * xv + yv * yv), vw = v + w;
    var xh = r * (cos(N) * cos(vw) - sin(N) * sin(vw) * cos(i));
    var yh = r * (sin(N) * cos(vw) + cos(N) * sin(vw) * cos(i));
    var zh = r * sin(vw) * sin(i);
    return { x: xh, y: yh, z: zh, r: r, M: M };
  }

  function planet(name, t) {
    var d = dJ2000(t) + 1.5;
    var h = helio(name, d);
    if (name === 'Jupiter' || name === 'Saturn') {
      var Mj = wrap(lin(PLANETS.Jupiter.M, d), 360), Ms = wrap(lin(PLANETS.Saturn.M, d), 360);
      var lon = Math.atan2(h.y, h.x) * R2D, lat = Math.atan2(h.z, Math.sqrt(h.x * h.x + h.y * h.y)) * R2D;
      if (name === 'Jupiter') {
        lon += -0.332 * sin(2 * Mj - 5 * Ms - 67.6) - 0.056 * sin(2 * Mj - 2 * Ms + 21) + 0.042 * sin(3 * Mj - 5 * Ms + 21)
             - 0.036 * sin(Mj - 2 * Ms) + 0.022 * cos(Mj - Ms) + 0.023 * sin(2 * Mj - 3 * Ms + 52) - 0.016 * sin(Mj - 5 * Ms - 69);
      } else {
        lon += 0.812 * sin(2 * Mj - 5 * Ms - 67.6) - 0.229 * cos(2 * Mj - 4 * Ms - 2) + 0.119 * sin(Mj - 2 * Ms - 3)
             + 0.046 * sin(2 * Mj - 6 * Ms - 69) + 0.014 * sin(Mj - 3 * Ms + 32);
        lat += -0.020 * cos(2 * Mj - 4 * Ms - 2) + 0.018 * sin(2 * Mj - 6 * Ms - 49);
      }
      h.x = h.r * cos(lat) * cos(lon); h.y = h.r * cos(lat) * sin(lon); h.z = h.r * sin(lat);
    }
    // Geocentric = heliocentric planet + geocentric Sun.
    var s = sun(t), sd = s.distKm / AU_KM;
    var xs = sd * cos(s.lambda), ys = sd * sin(s.lambda);
    var xg = h.x + xs, yg = h.y + ys, zg = h.z;
    var R = Math.sqrt(xg * xg + yg * yg + zg * zg);
    var eps = obliquity(t), ce = cos(eps), se = sin(eps);
    var dir = [xg / R, (yg * ce - zg * se) / R, (yg * se + zg * ce) / R];
    var cfv = (h.r * h.r + R * R - sd * sd) / (2 * h.r * R);
    var fv = Math.acos(Math.max(-1, Math.min(1, cfv))) * R2D;
    return { name: name, dir: dir, distAU: R, mag: PLANETS[name].mag(h.r, R, fv), color: PLANETS[name].color, raDec: FE.V.toLatLon(dir) };
  }
  function planets(t) { return Object.keys(PLANETS).map(function (n) { return planet(n, t); }); }

  /* Atmospheric refraction (Saemundsson): how much higher an object appears, in
     degrees, for a true (airless) elevation h in degrees, at sea level, 10 C. */
  function refraction(h) {
    if (h < -2) return 0;
    var hh = Math.max(h, -1.9);
    return 1.02 / Math.tan((hh + 10.3 / (hh + 5.11)) * D2R) / 60;
  }
  /* Refract a horizon-frame direction (x up, y east, z north). */
  function refract(v) {
    var el = Math.asin(Math.max(-1, Math.min(1, v[0]))) * R2D, r = refraction(el);
    if (r <= 0) return v;
    var h = Math.sqrt(v[1] * v[1] + v[2] * v[2]);
    if (h < 1e-9) return v;
    var e2 = (el + r) * D2R, c = Math.cos(e2) / h;
    return [Math.sin(e2), v[1] * c, v[2] * c];
  }

  FE.Astro = {
    EARTH_RADIUS_KM: EARTH_RADIUS_KM,
    T2017_J2000: T2017_J2000,
    sun: sun, moon: moon, gmst: gmst, obliquity: obliquity,
    moonOrbitPoint: moonOrbitPoint, eclipticPoint: eclipticPoint, seasonOfDay: seasonOfDay,
    planet: planet, planets: planets, PLANET_NAMES: Object.keys(PLANETS),
    refraction: refraction, refract: refract
  };
})();
