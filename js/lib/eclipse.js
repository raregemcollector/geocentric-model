/* eclipse.js — where eclipses fall on the map, computed with standard round-Earth geometry.
 *
 * Solar: the Moon's shadow is a cone from the Sun past the Moon. Where its axis hits
 * the Earth is the centre of the eclipse (total or annular there); the wider penumbra
 * cone gives the region that sees a partial eclipse. Both are found on the globe and
 * then drawn wherever the map puts those latitudes and longitudes.
 * Lunar: the Earth's shadow at the Moon's distance; how far the Moon sits inside it.
 *
 * Units: Earth radii (ER) unless noted. Accuracy follows astro.js (a few arcminutes),
 * enough to place the shadow within a few tens of km and contact times within minutes. */
var FE = window.FE = window.FE || {};

(function () {
  var V = FE.V, M3 = FE.M3, A = FE.Astro, D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var ER_KM = A.EARTH_RADIUS_KM || 6371;
  var R_MOON = 1737.4 / ER_KM, R_SUN = 695700 / ER_KM;

  function earthFixed(p, t) { return V.toLatLon(M3.apply(M3.rotZ(-A.gmst(t) * D2R), p)); }

  /* Shadow geometry at time t (days since 2017-01-01). */
  function solar(t) {
    var sun = A.sun(t), moon = A.moon(t);
    var S = V.scale(sun.dir, sun.distKm / ER_KM), Mn = V.scale(moon.dir, moon.distER);
    var u = V.norm(V.sub(Mn, S));                       // shadow axis, Sun -> Moon -> beyond
    var Dsm = V.len(V.sub(Mn, S));
    var tanP = (R_SUN + R_MOON) / Dsm, tanU = (R_SUN - R_MOON) / Dsm;
    // Fundamental plane through the Earth's centre, perpendicular to the axis.
    var z = -V.dot(Mn, u);                              // distance Moon -> plane along u
    var c = V.add(Mn, V.scale(u, z));                   // axis point on the plane
    var dAxis = V.len(c);                               // axis miss distance (ER), gamma
    var rPen = R_MOON + z * tanP, rUmb = R_MOON - z * tanU;  // rUmb < 0 means annular
    var out = { t: t, gamma: dAxis, rPen: rPen, rUmb: rUmb, partial: dAxis < 1 + rPen, centre: null, outline: [] };
    if (!out.partial) return out;
    // Where a ray parallel to the axis, through plane point q, meets the near side of the Earth.
    function hit(q) {
      var h2 = V.dot(q, q); if (h2 >= 1) return null;
      return V.addScaled(q, u, -Math.sqrt(1 - h2));
    }
    var ch = hit(c);
    if (ch) {
      out.centre = earthFixed(ch, t);
      // Shadow width on the ground, perpendicular to the path (km), ignoring the slant.
      out.widthKm = Math.abs(2 * (R_MOON - (z - Math.sqrt(1 - dAxis * dAxis)) * tanU)) * ER_KM;
      out.annular = rUmb < 0;
    }
    // Penumbra outline: circle of radius rPen around the axis, clipped to the Earth's disc.
    var e1 = V.norm(V.cross(u, Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = V.cross(u, e1);
    var cur = [];
    for (var k = 0; k <= 120; k++) {
      var a = k / 120 * 2 * Math.PI;
      var q = V.add(c, V.add(V.scale(e1, rPen * Math.cos(a)), V.scale(e2, rPen * Math.sin(a))));
      var r = V.len(q);
      if (r >= 1) q = V.scale(q, 0.9999 / r);         // beyond the limb: follow the limb
      cur.push(earthFixed(hit(q), t));
    }
    out.outline = cur;
    return out;
  }

  /* The central line over the whole eclipse, sampled every 3 minutes (cached). */
  var pathCache = {};
  function path(t) {
    var key = Math.round(t * 2);
    if (pathCache[key]) return pathCache[key];
    var pts = [];
    for (var m = -360; m <= 360; m += 3) {
      var s = solar(t + m / 1440);
      if (s.centre) pts.push({ t: s.t, lat: s.centre.lat, lon: s.centre.lon });
    }
    return (pathCache[key] = pts);
  }

  /* Lunar eclipse at time t: angular radii (deg) as seen from the Earth's centre. */
  function lunar(t) {
    var sun = A.sun(t), moon = A.moon(t);
    var pM = Math.asin(1 / moon.distER) * R2D, pS = Math.asin(ER_KM / sun.distKm) * R2D;
    var sS = Math.asin(695700 / sun.distKm) * R2D, sM = Math.asin(R_MOON / moon.distER) * R2D;
    var sep = Math.acos(Math.max(-1, Math.min(1, -V.dot(moon.dir, sun.dir)))) * R2D;
    var rPen = 1.02 * (pM + pS + sS), rUmb = 1.02 * (pM + pS - sS);   // 2% for the atmosphere
    return { sep: sep, rPen: rPen, rUmb: rUmb, rMoon: sM,
      penMag: (rPen - (sep - sM)) / (2 * sM), umbMag: (rUmb - (sep - sM)) / (2 * sM),
      active: sep < rPen + sM };
  }

  FE.Eclipse = { solar: solar, path: path, lunar: lunar };
})();
