/* scene.js — builds and draws the 3D scene from the model each frame.
 * Static geometry (map grid, dome grid, celestial grid) is built once and only
 * re-transformed; per-frame geometry (rays, markers, tracks) is refilled into
 * preallocated buffers. Rendering happens only when something changed. */
var FE = window.FE = window.FE || {};

(function () {
  var V = FE.V, M3 = FE.M3, M4 = FE.M4, U = FE.U, A = FE.Astro, Geo = FE.Geo, C = FE.color;
  var R = Geo.R;

  var COL = {
    feGrid: C('#4a5568', 0.30), feMain: C('#1f2733', 0.45),
    domeGrid: C('#7d9bff', 0.22), domeMain: C('#8fa8ff', 0.45), domeTrack: C('#8fa8ff', 0.35),
    sunPath: C('#ffad33', 0.95), sunTrack: C('#ff6b5b', 0.55), moonPath: C('#c9ced8', 0.8),
    moonTrack: C('#5bd18a', 0.6), starLat: C('#ff9a3c', 0.75),
    sphereGrid: C('#e8ecf5', 0.16), sphereEq: C('#e8ecf5', 0.42), sphereBase: C('#e8ecf5', 0.55),
    sphereSun: C('#ffad33', 0.9), sphereMoon: C('#5bd18a', 0.85),
    axisN: C('#ff5a5a', 0.9), axisS: C('#5a8bff', 0.9),
    sunRay: C('#ff9d1f', 1), sunHalo: C('#ffffff', 0.45), sunSphereRay: C('#ff8c00', 0.9),
    moonRay: C('#c4c9d4', 1), moonHalo: C('#ffffff', 0.4), moonSphereRay: C('#9aa2b1', 0.9),
    obsLine: C('#ff4040', 0.5)
  };

  function starColor(lat, a) {
    var c = FE.hsv(1 - U.wrap(lat + 90, 180) / 180, 0.85, 1, a === undefined ? 1 : a);
    return c;
  }
  function starBig(ra) { var r = U.wrap(ra, 120); return r < 1 || r > 119; }

  /* Build a 4x4 model matrix from a 3x3 row-major rotation, uniform scale, translation. */
  function m4From3(m, s, t) {
    var o = new Float32Array(16);
    o[0] = m[0] * s; o[1] = m[3] * s; o[2] = m[6] * s;
    o[4] = m[1] * s; o[5] = m[4] * s; o[6] = m[7] * s;
    o[8] = m[2] * s; o[9] = m[5] * s; o[10] = m[8] * s;
    o[12] = t[0]; o[13] = t[1]; o[14] = t[2]; o[15] = 1;
    return o;
  }

  function circlePts(fn, n) { var p = []; for (var i = 0; i <= n; i++) p.push(fn(i / n * 360)); return p; }

  function Scene(canvas, model) {
    this.model = model;
    var gl = this.gl = new FE.Renderer(canvas);
    this.disc = gl.disc(R, FE.MapTexture.build(2048));

    this.feGrid = gl.lines({ capacity: 2000 });
    this.feMain = gl.lines({ capacity: 600 });
    this.domeGrid = gl.lines({ capacity: 3000 });
    this.domeMain = gl.lines({ capacity: 600 });
    this.domeTrack = gl.lines({ capacity: 900 });
    this.domeDyn = gl.lines({ capacity: 600 });
    this.sphereGrid = gl.lines({ capacity: 2200, clipGround: true });
    this.sphereDyn = gl.lines({ capacity: 400, clipGround: true });
    this.world = gl.lines({ capacity: 4000, clipGround: false });
    this.domeStars = gl.lines({ capacity: 1400 });
    this.sphereStars = gl.lines({ capacity: 1400, clipGround: true });
    this.catalog = FE.Stars.load(2027);
    this.pts = gl.points();
    this.tris = gl.tris();
    this.npMarker = gl.tris();

    this.buildFeGrid();
    this.buildSphereGrid();
    this.buildSphereStars();
    this.domeKey = '';
    this.vp = M4.identity();
    this.cssW = 1; this.cssH = 1;
  }

  /* ---------- static geometry ---------- */
  Scene.prototype.buildFeGrid = function () {
    var g = this.feGrid.clear(), m = this.feMain.clear(), z = 0.004;
    var lift = function (p) { return [p[0], p[1], p[2] + z]; };
    var meridian = function (lo) { var pts = []; for (var la = 89.99; la > -90; la -= 1.5) pts.push(lift(Geo.fe(la, lo))); pts.push(lift(Geo.fe(-90, lo))); return pts; };
    for (var lat = -75; lat <= 75; lat += 15) {
      if (lat === 0) continue;
      g.poly(circlePts(function (lo) { return lift(Geo.fe(lat, lo)); }, 144), COL.feGrid, 1);
    }
    for (var lo = 0; lo < 360; lo += 15) {
      if (lo === 0) continue;
      g.poly(meridian(lo), COL.feGrid, 1);
    }
    m.poly(circlePts(function (lo) { return lift(Geo.fe(0, lo)); }, 180), COL.feMain, 1.2);
    m.poly(circlePts(function (lo) { return lift(Geo.fe(-90, lo)); }, 240), COL.feMain, 1.2);
    m.poly(meridian(0), COL.feMain, 1.2);

    // North-pole marker (red/white diamond star, as in the original).
    var t = this.npMarker.clear(), s = 0.5, w = 0.1, h = Geo.groundZ(90, 0) + 0.012;
    var red = C('#e03a3a'), white = C('#ffffff');
    t.tri([0, 0, h], [s, 0, h], [w, w, h], red); t.tri([0, 0, h], [w, -w, h], [s, 0, h], white);
    t.tri([0, 0, h], [0, s, h], [-w, w, h], red); t.tri([0, 0, h], [w, w, h], [0, s, h], white);
    t.tri([0, 0, h], [-s, 0, h], [-w, -w, h], red); t.tri([0, 0, h], [-w, w, h], [-s, 0, h], white);
    t.tri([0, 0, h], [0, -s, h], [w, -w, h], red); t.tri([0, 0, h], [-w, -w, h], [0, -s, h], white);
  };

  /* Celestial grid on a unit sphere, in celestial coordinates; drawn through a
     per-frame matrix that places it at the observer. */
  Scene.prototype.buildSphereGrid = function () {
    var g = this.sphereGrid.clear();
    for (var lat = -75; lat <= 75; lat += 15) {
      g.poly(circlePts(function (lo) { return V.fromLatLon(lat, lo); }, 72), lat === 0 ? COL.sphereEq : COL.sphereGrid, lat === 0 ? 1.3 : 1);
    }
    for (var lo = 0; lo < 360; lo += 15) {
      var pts = [];
      for (var la = -90; la <= 90; la += 5) pts.push(V.fromLatLon(la, lo));
      g.poly(pts, COL.sphereGrid, 1);
    }
  };

  /* Interpolated points along a constellation line, as unit vectors. */
  function lineDirs(a, b, n) {
    var out = [];
    for (var i = 0; i <= n; i++) out.push(V.norm(V.lerp(a.dir, b.dir, i / n)));
    return out;
  }
  Scene.prototype.buildSphereStars = function () {
    var L = this.sphereStars.clear(), col = C('#ffffff', 0.32);
    this.catalog.lines.forEach(function (ln) { L.poly(lineDirs(ln[0], ln[1], 6), col, 1); });
  };

  Scene.prototype.buildDome = function (s, H) {
    var g = this.domeGrid.clear(), m = this.domeMain.clear(), tr = this.domeTrack.clear();
    var ds = s.DomeSize, sh = s.DomeShape, P = function (dec, ra) { return Geo.dome(dec, ra, ds, H, sh); };
    var SP = function (dec, ra) { return Geo.body(dec, ra, s, H, s.SunOnDome, s.SunHeight); };
    var lat, lo;
    for (lat = -90; lat < 90; lat += 15) {
      g.poly(circlePts(function (r) { return P(lat, r); }, 96), COL.domeGrid, 1);
    }
    for (lo = 0; lo < 360; lo += 15) {
      var pts = [];
      for (lat = -90; lat <= 90; lat += 2.5) pts.push(P(lat, lo));
      g.poly(pts, COL.domeGrid, 1);
    }
    // Outline of a dome wider than the disc: meridian arcs down to the floor + base circle.
    if (ds > 1.0001) {
      var Rd = ds * R, maxA = Math.acos(1 / ds);
      for (lo = 0; lo < 360; lo += 15) {
        var arc = [], c = Math.cos(lo * U.D2R), sn = Math.sin(lo * U.D2R);
        for (var k = 0; k <= 16; k++) {
          var a = maxA * k / 16, r = Rd * Math.cos(a);
          arc.push([r * c, r * sn, Geo.domeZ(r, Rd, H, sh)]);
        }
        g.poly(arc, C('#aab4c8', 0.22), 1);
      }
      g.poly(circlePts(function (r) { return [Rd * Math.cos(r * U.D2R), Rd * Math.sin(r * U.D2R), 0.004]; }, 180), C('#aab4c8', 0.3), 1);
    }
    m.poly(circlePts(function (r) { return P(0, r); }, 120), COL.domeMain, 2);
    var mer = [];
    for (lat = -90; lat <= 90; lat += 2.5) mer.push(P(lat, 0));
    m.poly(mer, COL.domeMain, 1);
    m.seg([0, 0, 0], [0, 0, H], COL.domeMain, 1);

    var ds2 = this.domeStars.clear(), ccol = C('#cfd8ff', 0.3);
    this.catalog.lines.forEach(function (ln) {
      ds2.poly(lineDirs(ln[0], ln[1], 8).map(function (v) { var q = V.toLatLon(v); return P(q.lat, q.lon); }), ccol, 1);
    });
    var eps = A.obliquity(s.DateTime);
    // The Sun's tropics and yearly track, at the Sun's height in the model.
    tr.poly(circlePts(function (r) { return SP(eps, r); }, 120), COL.domeTrack, 1.5);
    tr.poly(circlePts(function (r) { return SP(-eps, r); }, 120), COL.domeTrack, 1.5);
    tr.poly(circlePts(function (r) { return P(-89.9, r); }, 120), C('#8fa8ff', 0.55), 1.5);
    var ecl = circlePts(function (l) { var d = V.toLatLon(A.eclipticPoint(l, eps)); return SP(d.lat, d.lon); }, 120);
    this.eclipticPts = ecl;
    this.domeEps = eps;
  };

  /* ---------- camera ---------- */
  Scene.prototype.camera = function (s, d) {
    var gl = this.gl;
    var a = s.CameraDirection * U.D2R, h = s.CameraHeight * U.D2R, D = Geo.CAMERA_DIST;
    var back = [Math.cos(h) * Math.cos(a), Math.cos(h) * Math.sin(a), Math.sin(h)];
    var right = [-Math.sin(a), Math.cos(a), 0];
    var up = V.cross(back, right);
    var eye = V.addScaled(d.center, back, D);
    var aspect = gl.width / gl.height;
    // Fit about 2.5 disc radii across the narrower of width and height; on portrait
    // screens a little more, since the tilted disc is wider than it is tall.
    var halfH = 1.25 * R / s.Zoom * (aspect < 1 ? (1 + 0.3 * Math.min(1, (1 - aspect) / 0.4)) / aspect : 1);
    var fov = 2 * Math.atan(halfH / D);
    var reach = R * s.DomeSize + 10;
    var proj = M4.perspective(fov, aspect, Math.max(1, D - reach), D + reach);
    this.eye = eye; this.camRight = right; this.camUp = up; this.camBack = back;
    this.vp = M4.mul(proj, M4.view(eye, right, up, back));
  };

  /* Screen position (CSS px) of a world point. */
  Scene.prototype.toScreen = function (p) {
    var q = M4.project(this.vp, p);
    return { x: (q[0] + 1) / 2 * this.cssW, y: (1 - q[1]) / 2 * this.cssH, front: q[3] > 0 };
  };

  /* ---------- rays ---------- */
  function rayTo(lines, G, dirW, objW, rayParam, col, w) {
    var cp = V.dist(objW, G) * rayParam / 3;
    lines.bezier(G, V.addScaled(G, dirW, cp), objW, col, w, 18);
  }

  /* Fan of rays from one dome object to a grid of ground points. dirAt(lat, lon, M)
     returns the object's local (horizon) direction seen from that ground point. */
  Scene.prototype.fan = function (s, d, objW, dirAt, isStar) {
    var dLat = s.ShowManyRays ? 15 : 30, dLon = s.ShowManyRays ? 7.5 : 15;
    for (var lat = -90; lat <= 90; lat += dLat) {
      for (var lon = 0; lon < 360; lon += dLon) {
        var M = Geo.celestToLocal(lat, lon, d.theta);
        if (isStar && s.ShowShadow && M3.apply(M, d.sun.dir)[0] >= 0) { if (lat >= 90) break; continue; }
        var loc = dirAt(lat, lon, M);
        if (loc[0] > 0) {
          var F = Geo.frame(lat, lon);
          rayTo(this.world, F.pos, Geo.localToWorld(F, loc), objW, s.RayParameter, starColor(lat, 0.85), 1);
        }
        if (lat >= 90) break;   // the pole is a single point
      }
    }
  };

  Scene.prototype.observerRay = function (s, d, local, objW, rayCol, haloCol, haloW, sphereRayCol, markerCol) {
    var F = d.frame, dirW = Geo.localToWorld(F, local), sp = V.addScaled(F.pos, dirW, d.rSphere);
    if (local[0] <= 0) return;
    if (s.ShowSphereRays) this.world.seg(F.pos, sp, sphereRayCol, 1.2);
    if (s.ShowSphere) this.pts.add(sp, markerCol, 9, 'disc');
    if (s.ShowDomeRays) {
      rayTo(this.world, F.pos, dirW, objW, s.RayParameter, haloCol, haloW);
      rayTo(this.world, F.pos, dirW, objW, s.RayParameter, rayCol, 1.6);
    }
  };

  Scene.prototype.starGrid = function (fn) {
    for (var dec = -90; dec < 89; dec += 30) {
      var dc = dec === -90 ? -85 : dec;           // no single "south star": use a ring near -90
      for (var ra = 0; ra < 360; ra += 30) fn(dc, ra, dec);
    }
    fn(90, 0, 90);                                  // Polaris
  };

  /* ---------- frame ---------- */
  Scene.prototype.render = function () {
    var gl = this.gl, s = this.model.s, d = this.model.derive();
    this.d = d;
    gl.resize(this.forceSize);
    if (this.forceSize) { this.cssW = this.forceSize.w / this.forceSize.scale; this.cssH = this.forceSize.h / this.forceSize.scale; }
    else { this.cssW = gl.canvas.clientWidth; this.cssH = gl.canvas.clientHeight; }
    if (s.ViewMode === 2) return this.renderGlobe(s, d);
    gl.clipPlane = [0, 0, 1, -d.frame.pos[2]];       // the observer's sky ends at their horizon
    this.camera(s, d);
    if (d.reliefKey !== this.reliefKey) {
      this.reliefKey = d.reliefKey;
      gl.discMesh(this.disc, Geo.relief.on ? Geo.groundZ : null);
      this.buildFeGrid();
    }

    var key = [s.DomeSize, s.DomeHeight, s.DomeShape, s.SunOnDome, s.SunHeight, Math.round(s.DateTime / 3650)].join('|');
    if (key !== this.domeKey) { this.buildDome(s, d.H); this.domeKey = key; }
    var domeM = M4.rotZ(-d.theta * U.D2R);
    this.domeGrid.model = this.domeMain.model = this.domeTrack.model = this.domeDyn.model = this.domeStars.model = domeM;

    var obsTarget = s.RayTarget === 0, F = d.frame, W = this.world.clear(), P = this.pts.clear();
    var H = d.H, ds = s.DomeSize, self = this;
    var dome = function (dec, ra) { return Geo.dome(dec, ra, ds, H, s.DomeShape); };
    var sunAt = function (dec, ra) { return Geo.body(dec, ra, s, H, s.SunOnDome, s.SunHeight); };
    var moonAt = function (dec, ra) { return Geo.body(dec, ra, s, H, s.MoonOnDome, s.MoonHeight); };

    // Observer marker: four triangles (north red, south blue), plus a line to the pole.
    var T = this.tris.clear();
    if (obsTarget) {
      var L = function (up, e, n) { return V.add(F.pos, [e * F.east[0] + n * F.north[0], e * F.east[1] + n * F.north[1], up + 0.02]); };
      var o = L(0, 0, 0), k = 0.5, q = 0.1;
      T.quad(L(0, 0, k), L(0, q, q), o, L(0, -q, q), C('#e03a3a'));
      T.quad(L(0, k, 0), L(0, q, -q), o, L(0, q, q), C('#f4f4f4'));
      T.quad(L(0, 0, -k), L(0, q, -q), o, L(0, -q, -q), C('#3a6bff'));
      T.quad(L(0, -k, 0), L(0, -q, -q), o, L(0, -q, q), C('#f4f4f4'));
      var pl = [];                                  // along the ground to the north pole
      for (var la = s.ObserverLat; la < 90; la += 1.5) { var gp = Geo.fe(la, s.ObserverLong); gp[2] += 0.01; pl.push(gp); }
      pl.push([0, 0, Geo.groundZ(90, 0) + 0.01]);
      if (pl.length > 1) W.poly(pl, COL.obsLine, 1);
    }

    // Local celestial sphere at the observer.
    var Lw = [0, F.east[0], F.north[0], 0, F.east[1], F.north[1], 1, 0, 0];
    var A3 = M3.mul(Lw, d.M), sphereM = m4From3(A3, d.rSphere, F.pos);
    var showSphere = obsTarget && s.ShowSphere;
    this.sphereGrid.visible = this.sphereDyn.visible = showSphere;
    if (showSphere) {
      this.sphereGrid.model = this.sphereDyn.model = sphereM;
      var sd = this.sphereDyn.clear();
      if (!s.ShowStars) {
        var decCircle = function (dec, col) { sd.poly(circlePts(function (lo) { return V.fromLatLon(dec, lo); }, 72), col, 1.3); };
        decCircle(d.sun.raDec.lat, COL.sphereSun);
        decCircle(d.moon.raDec.lat, COL.sphereMoon);
        sd.seg([0, 0, 0], [0, 0, 1], COL.axisN, 1.4);
        sd.seg([0, 0, 0], [0, 0, -1], COL.axisS, 1.4);
      }
      W.poly(circlePts(function (a) { var r = a * U.D2R; return [F.pos[0] + d.rSphere * Math.cos(r), F.pos[1] + d.rSphere * Math.sin(r), F.pos[2] + 0.006]; }, 96), COL.sphereBase, 1);
    }
    this.sphereStars.model = sphereM;
    this.sphereStars.visible = showSphere && s.ShowConstellations;
    this.domeStars.visible = s.ShowConstellations;
    var sphereCel = function (cel) { return V.addScaled(F.pos, Geo.localToWorld(F, M3.apply(d.M, cel)), d.rSphere); };

    // Rays.
    if (obsTarget && !s.ShowStars) {
      this.observerRay(s, d, d.moonLocal, d.moonDomeW, COL.moonRay, COL.moonHalo, 4, COL.moonSphereRay, C('#9aa2b1'));
      this.observerRay(s, d, d.sunLocal, d.sunDomeW, COL.sunRay, COL.sunHalo, 5, COL.sunSphereRay, C('#ffad33'));
    } else if (!obsTarget) {
      if (s.RaySource === 0) {
        this.fan(s, d, d.sunDomeW, function (lat, lon, M) { return M3.apply(M, d.sun.dir); }, false);
      } else if (s.RaySource === 1) {
        var mv = V.scale(d.moon.dir, d.moon.distER);
        this.fan(s, d, d.moonDomeW, function (lat, lon, M) {
          return M3.apply(M, V.norm(V.sub(mv, V.fromLatLon(lat, lon + d.theta, 1))));
        }, false);
      } else {
        var starCel = V.fromLatLon(s.ObserverLat, s.ObserverLong);
        var starW = d.toWorld(dome(s.ObserverLat, s.ObserverLong));
        this.fan(s, d, starW, function (lat, lon, M) { return M3.apply(M, starCel); }, true);
        P.add(starW, C('#ffe14d'), 20, 'star6');
      }
    }
    if (obsTarget && s.ShowStars && (s.ShowDomeRays || s.ShowSphereRays)) {
      var step = s.ShowManyRays ? 30 : 120;
      this.starGrid(function (dec, ra, decKey) {
        if (dec !== 90 && U.wrap(ra, step) !== 0) return;
        var cel = V.fromLatLon(dec, ra), loc = M3.apply(d.M, cel);
        if (loc[0] <= 0) return;
        var w = dec === 90 ? 2 : (s.ShowManyRays && starBig(ra) ? 2 : 1), col = starColor(decKey, 0.9);
        var dirW = Geo.localToWorld(F, loc);
        if (s.ShowSphereRays) W.seg(F.pos, V.addScaled(F.pos, dirW, d.rSphere), [col[0], col[1], col[2], 0.5], 1);
        if (s.ShowDomeRays) rayTo(W, F.pos, dirW, d.toWorld(dome(dec, ra)), s.RayParameter, col, w);
      });
    }

    // Stars on the local sphere and on the dome.
    if (obsTarget && s.ShowStars) {
      var zoomAdd = 3 + 3 * ((s.Zoom - 1) / 10);
      this.starGrid(function (dec, ra, decKey) {
        var cel = V.fromLatLon(dec, ra), up = M3.apply(d.M, cel)[0] > 0;
        var big = dec === 90 || starBig(ra);
        if (s.ShowSphere && up) P.add(sphereCel(cel), starColor(decKey), 8 + (big ? zoomAdd : 0), 'star4');
        P.add(d.toWorld(dome(dec, ra)), starColor(decKey, up ? 1 : 0.3), 11 + (big ? zoomAdd * 1.3 : 0), 'star5');
      });
    }

    // Dynamic dome lines: current declination circles, Moon orbit, star latitude.
    var dd = this.domeDyn.clear();
    var showTracks = s.ShowSunTrack || s.ShowMoonTrack;
    this.domeGrid.visible = s.ShowDomeGrid;
    this.domeMain.visible = s.ShowDomeGrid || showTracks;
    this.domeTrack.visible = showTracks;
    if (s.ShowMoonTrack) {
      var mo = d.moon;
      dd.poly(circlePts(function (r) { return moonAt(mo.raDec.lat, r); }, 96), COL.moonPath, 1);
      dd.poly(circlePts(function (u) { var q = V.toLatLon(A.moonOrbitPoint(mo.node, mo.incl, mo.eps, u)); return moonAt(q.lat, q.lon); }, 96), COL.moonTrack, 2);
      [0, 180].forEach(function (u) {
        var q = V.toLatLon(A.moonOrbitPoint(mo.node, mo.incl, mo.eps, u));
        P.add(d.toWorld(moonAt(q.lat, q.lon)), C('#5bd18a', 0.95), 9, 'disc');
      });
    }
    if (s.ShowSunTrack) {
      dd.poly(circlePts(function (r) { return sunAt(d.sun.raDec.lat, r); }, 96), COL.sunPath, 1);
      dd.poly(this.eclipticPts, COL.sunTrack, 2);
      [0, 90, 180, 270].forEach(function (l) {
        var q = V.toLatLon(A.eclipticPoint(l, self.domeEps));
        P.add(d.toWorld(sunAt(q.lat, q.lon)), C('#ff5b4d', 0.95), 9, 'disc');
      });
    }
    if (!obsTarget && s.RaySource === 2) {
      dd.poly(circlePts(function (r) { return dome(s.ObserverLat, r); }, 96), COL.starLat, 1.2);
    }

    // Real stars: on the dome (dimmed when below this observer's horizon) and on the sphere.
    if (s.ShowRealStars) {
      var starCol = [1, 0.96, 0.88, 1];
      this.catalog.stars.forEach(function (st) {
        var up = M3.apply(d.M, st.dir)[0] > 0;
        var a = obsTarget ? (up ? 0.95 : 0.3) : 0.85;
        P.add(d.toWorld(dome(st.dec, st.ra)), [starCol[0], starCol[1], starCol[2], a], U.clamp(8 - 1.6 * st.mag, 2.5, 11), 'dot');
        if (showSphere && up) P.add(sphereCel(st.dir), starCol, U.clamp(6.5 - 1.3 * st.mag, 2, 8), 'dot');
      });
    }

    // A city-to-city route: straight on the flat map (orange) vs. the real shortest path (green).
    if (s.Route) {
      var ra = s.Route.a, rb = s.Route.b, lift = function (p) { return [p[0], p[1], p[2] + 0.03]; };
      var pa = Geo.fe(ra[0], ra[1]), pb = Geo.fe(rb[0], rb[1]), flat = [];
      for (var fi = 0; fi <= 64; fi++) {            // straight across the map, over the terrain
        var x = pa[0] + (pb[0] - pa[0]) * fi / 64, y = pa[1] + (pb[1] - pa[1]) * fi / 64, ll = Geo.latLonOf(x, y);
        flat.push([x, y, Geo.groundZ(ll.lat, ll.lon) + 0.03]);
      }
      W.poly(flat, C('#ff9d1f'), 3);
      var ua = V.fromLatLon(ra[0], ra[1]), ub = V.fromLatLon(rb[0], rb[1]), gc = [];
      var om = Math.acos(U.clamp(V.dot(ua, ub), -1, 1));
      for (var gi = 0; gi <= 96; gi++) {          // slerp along the great circle
        var tt = gi / 96, sa = Math.sin((1 - tt) * om) / Math.sin(om), sb = Math.sin(tt * om) / Math.sin(om);
        var q = V.toLatLon(V.add(V.scale(ua, sa), V.scale(ub, sb)));
        gc.push(lift(Geo.fe(q.lat, q.lon)));
      }
      for (var gj = 1; gj < gc.length; gj++) if (V.dist(gc[gj - 1], gc[gj]) < 5) W.seg(gc[gj - 1], gc[gj], C('#4fd08a'), 3);
      P.add(lift(Geo.fe(ra[0], ra[1])), C('#ffffff'), 11, 'disc');
      P.add(lift(Geo.fe(rb[0], rb[1])), C('#ffffff'), 11, 'disc');
    }

    // Planets: on the dome, and on the observer's sphere when above the horizon.
    if (s.ShowPlanets) d.planets.forEach(function (pl) {
      var col = FE.color(pl.color), size = U.clamp(6 - pl.mag, 3.5, 8);   // about as big as the brightest stars
      var up = pl.app[0] > 0;
      P.add(d.toWorld(dome(pl.raDec.lat, pl.raDec.lon)), [col[0], col[1], col[2], obsTarget ? (up ? 1 : 0.35) : 0.9], size, 'disc');
      if (showSphere && up) P.add(V.addScaled(F.pos, Geo.localToWorld(F, pl.local), d.rSphere), col, size * 0.75, 'disc');
    });

    // Solar eclipse: the Moon's shadow, found on the globe and drawn on the map.
    if (s.ShowEclipse && FE.Eclipse) this.eclipseMarks(d, W, P, function (lat, lon, h) {
      var p = Geo.fe(lat, lon); p[2] += h; return p;
    }, 6);

    // Analemma: the Sun at this clock time through a year, on the dome (dashed path of
    // the dome Sun) and the spot under it on the map, tracing a figure eight.
    if (s.ShowAnalemma) {
      var ana = this.model.analemma(H), dw = [], gw = [];
      ana.forEach(function (p) { dw.push(p.domeW); gw.push([p.groundW[0], p.groundW[1], p.groundW[2] + 0.02]); P.add(p.domeW, C('#ffcf70', 0.75), 4, 'dot'); });
      if (gw.length > 1) { W.poly(gw, C('#ffcf70', 0.95), 2.2); W.poly(dw, C('#ffcf70', 0.45), 1.2); }
    }

    // Sun and Moon in the dome model. Below the dome, a faint plumb line to the map
    // shows how high they are.
    if (!s.SunOnDome) {
      var sg = Geo.latLonOf(d.sunDomeW[0], d.sunDomeW[1]);
      W.seg(d.sunDomeW, [d.sunDomeW[0], d.sunDomeW[1], Geo.groundZ(sg.lat, sg.lon)], C('#ffb347', 0.45), 1.2);
    }
    if (!s.MoonOnDome) {
      var mg = Geo.latLonOf(d.moonDomeW[0], d.moonDomeW[1]);
      W.seg(d.moonDomeW, [d.moonDomeW[0], d.moonDomeW[1], Geo.groundZ(mg.lat, mg.lon)], C('#c4c9d4', 0.4), 1.2);
    }
    P.add(d.moonDomeW, C('#b8bec9'), 13, 'disc');
    P.add(d.sunDomeW, C('#ff9d1f'), 30, 'sun');

    // Draw, back to front where it matters.
    this.disc.sun = d.sunEarthFixed; this.disc.shadow = s.ShowShadow;
    gl.begin(this.vp);
    gl.drawDisc(this.disc);
    this.feGrid.visible = this.feMain.visible = s.ShowFeGrid;
    gl.drawLines(this.feGrid); gl.drawLines(this.feMain);
    gl.drawTris(this.npMarker); gl.drawTris(this.tris);
    gl.drawLines(this.sphereGrid); gl.drawLines(this.sphereDyn); gl.drawLines(this.sphereStars);
    gl.drawLines(this.domeGrid); gl.drawLines(this.domeMain); gl.drawLines(this.domeTrack); gl.drawLines(this.domeStars);
    gl.drawLines(dd);
    gl.drawLines(W);
    gl.drawPoints(P);
    return d;
  };

  /* ---------- the globe ----------
     The same moment on a round Earth, to scale for the Earth (Sun and Moon markers
     are placed close by and labelled, since their true distances would not fit).
     Every ray here is straight. */
  var RG = 6.371;    // Mm, Earth radius
  Scene.prototype.renderGlobe = function (s, d) {
    var gl = this.gl, self = this;
    if (!this.globeMesh) {
      this.globeMesh = gl.globe(RG, FE.MapTexture.buildEquirect(2048));
      this.globeGrid = gl.lines({ capacity: 2000 });
      this.globeWorld = gl.lines({ capacity: 600 });
      this.globePts = gl.points();
      this.globeTris = gl.tris();
      var gg = this.globeGrid, rr = RG * 1.002;
      for (var la = -75; la <= 75; la += 15) {
        gg.poly(circlePts(function (lo) { return V.fromLatLon(la, lo, rr); }, 96), la === 0 ? C('#26303d', 0.55) : C('#3a4658', 0.35), la === 0 ? 1.4 : 1);
      }
      for (var lo = 0; lo < 360; lo += 15) {
        var mer = []; for (var l2 = -90; l2 <= 90; l2 += 3) mer.push(V.fromLatLon(l2, lo, rr));
        gg.poly(mer, lo === 0 ? C('#26303d', 0.55) : C('#3a4658', 0.35), lo === 0 ? 1.4 : 1);
      }
    }
    // camera orbiting the globe
    var a = s.GlobeAz * U.D2R, h = s.GlobeEl * U.D2R, D = 60;
    var back = [Math.cos(h) * Math.cos(a), Math.cos(h) * Math.sin(a), Math.sin(h)];
    var right = [-Math.sin(a), Math.cos(a), 0], up = V.cross(back, right), eye = V.scale(back, D);
    var aspect = gl.width / gl.height, halfH = 1.5 * RG / s.GlobeZoom * Math.max(1, 1 / aspect);
    var proj = M4.perspective(2 * Math.atan(halfH / D), aspect, 1, D + 200);
    this.eye = eye; this.camRight = right; this.camUp = up; this.camBack = back;
    this.vp = M4.mul(proj, M4.view(eye, right, up, back));

    var lat = s.ObserverLat, lon = s.ObserverLong;
    var pUp = V.fromLatLon(lat, lon, 1), p = V.scale(pUp, RG);
    var east = [-Math.sin(lon * U.D2R), Math.cos(lon * U.D2R), 0], north = V.cross(pUp, east);
    var Lw = [pUp[0], east[0], north[0], pUp[1], east[1], north[1], pUp[2], east[2], north[2]];
    var toW = function (loc) { return M3.apply(Lw, loc); };
    var sunEF = d.sunEarthFixed, moonEF = M3.apply(d.domeRot, d.moon.dir);
    var W = this.globeWorld.clear(), P = this.globePts.clear(), T = this.globeTris.clear();

    // Sunlight: parallel rays onto the day side, and the one that reaches the observer.
    for (var k = 0; k < 12; k++) {
      var ang = k / 12 * Math.PI * 2, off = [Math.cos(ang) * 0.55, Math.sin(ang) * 0.55];
      var ax = V.norm(V.cross(sunEF, [0, 0, 1])); if (!isFinite(ax[0])) ax = [1, 0, 0];
      var ay = V.cross(sunEF, ax);
      var target = V.norm(V.add(V.scale(sunEF, Math.sqrt(1 - 0.3025)), V.add(V.scale(ax, off[0]), V.scale(ay, off[1]))));
      var tp = V.scale(target, RG);
      W.seg(V.addScaled(tp, sunEF, RG * 2.2), tp, C('#ffc061', 0.4), 1.2);
    }
    if (s.ShowAnalemma) {        // the point under the Sun at this clock time, each day for a year
      W.poly(this.model.analemma(d.H).map(function (q) { return V.scale(q.globe, RG * 1.004); }), C('#ffcf70', 0.95), 2.2);
    }
    if (d.sunUp) {
      W.seg(V.addScaled(p, sunEF, RG * 2.6), p, C('#ffffff', 0.45), 5);
      W.seg(V.addScaled(p, sunEF, RG * 2.6), p, C('#ff9d1f'), 2);
    }
    if (d.moonUp) W.seg(p, V.addScaled(p, toW(d.moonLocal), RG * 2.0), C('#c4c9d4'), 1.6);
    this.globeAnchors = {
      observer: p, pole: [0, 0, RG], sun: V.scale(sunEF, RG * 3.4), moon: V.scale(moonEF, RG * 2.6),
      sunRayMid: V.addScaled(p, sunEF, RG * 1.3), subsolar: V.scale(sunEF, RG)
    };
    if (s.ShowEclipse && FE.Eclipse) {
      var ecA = this.eclipseMarks(d, W, P, function (lat, lon, h) { return V.fromLatLon(lat, lon, RG * (1.004 + h * 0.02)); }, 3);
      if (ecA) { this.globeAnchors.shadow = ecA.shadow; this.globeAnchors.penumbra = ecA.penumbra; }
    }
    P.add(this.globeAnchors.sun, C('#ff9d1f'), 44, 'sun');
    P.add(this.globeAnchors.moon, C('#b8bec9'), 14, 'disc');
    if (s.ShowRealStars) this.catalog.stars.forEach(function (st) {
      P.add(V.scale(M3.apply(d.domeRot, st.dir), RG * 25), [1, 0.96, 0.88, 0.85], U.clamp(6 - 1.3 * st.mag, 1.8, 7), 'dot');
    });
    if (s.ShowPlanets) d.planets.forEach(function (pl) {
      P.add(V.scale(M3.apply(d.domeRot, pl.dir), RG * 24), FE.color(pl.color), U.clamp(5 - 0.8 * pl.mag, 2.5, 7), 'disc');
    });
    // observer marker on the surface
    var Lp = function (u2, e2, n2) { return V.add(p, V.add(V.scale(pUp, u2 + 0.02), V.add(V.scale(east, e2), V.scale(north, n2)))); };
    var o = Lp(0, 0, 0), kk = 0.32, q = 0.07;
    T.quad(Lp(0, 0, kk), Lp(0, q, q), o, Lp(0, -q, q), C('#e03a3a'));
    T.quad(Lp(0, kk, 0), Lp(0, q, -q), o, Lp(0, q, q), C('#f4f4f4'));
    T.quad(Lp(0, 0, -kk), Lp(0, q, -q), o, Lp(0, -q, -q), C('#3a6bff'));
    T.quad(Lp(0, -kk, 0), Lp(0, -q, -q), o, Lp(0, -q, q), C('#f4f4f4'));

    // the observer's celestial sphere, sitting on the local horizon
    var showSphere = s.ShowSphere, rS = RG * 0.42;
    var A3 = M3.mul(Lw, d.M), sphereM = m4From3(A3, rS, p);
    this.sphereGrid.model = this.sphereDyn.model = this.sphereStars.model = sphereM;
    this.sphereGrid.visible = showSphere; this.sphereStars.visible = showSphere && s.ShowConstellations;
    this.sphereDyn.visible = false;
    W.poly(circlePts(function (aa) { var r2 = aa * U.D2R; return V.add(p, V.add(V.scale(east, rS * Math.cos(r2)), V.scale(north, rS * Math.sin(r2)))); }, 72), COL.sphereBase, 1);

    this.globeMesh.sun = sunEF; this.globeMesh.eye = V.scale(eye, 1 / RG); this.globeMesh.shadow = s.ShowShadow;
    gl.begin(this.vp);
    gl.drawGlobe(this.globeMesh);
    this.globeGrid.visible = s.ShowFeGrid;
    gl.drawLines(this.globeGrid);
    gl.drawTris(T);
    gl.clipPlane = [pUp[0], pUp[1], pUp[2], -V.dot(pUp, p)];
    gl.drawLines(this.sphereGrid); gl.drawLines(this.sphereStars);
    gl.clipPlane = null;
    gl.drawLines(W);
    gl.drawPoints(P);
    this.sphereDyn.visible = true;
    return d;
  };

  /* The Moon's shadow on the ground during a solar eclipse: the partial-eclipse region
     (penumbra outline), the central line over the whole eclipse, and the spot where the
     eclipse is total or annular right now. place(lat, lon, lift) maps a ground point into
     the view; jump is the largest step drawn as one line (map wrap-around). */
  Scene.prototype.eclipseMarks = function (d, W, P, place, jump) {
    var ec = FE.Eclipse.solar(d.t);
    if (!ec.partial) return null;
    function line(pts, col, w) {
      for (var i = 1; i < pts.length; i++) if (V.dist(pts[i - 1], pts[i]) < jump) W.seg(pts[i - 1], pts[i], col, w);
    }
    var ring = ec.outline.map(function (q) { return place(q.lat, q.lon, 0.05); });
    line(ring, C('#ffcf6b', 0.85), 2);
    var north = ring.reduce(function (a, b) { return V.len(b) < V.len(a) ? b : a; }, ring[0]);
    var path = FE.Eclipse.path(d.t);
    if (path.length > 1) {
      var done = [], todo = [];
      path.forEach(function (q) { var p = place(q.lat, q.lon, 0.06); (q.t <= d.t ? done : todo).push(p); });
      if (done.length && todo.length) todo.unshift(done[done.length - 1]);
      line(done, C('#ff7a3d', 0.95), 3);
      line(todo, C('#ff7a3d', 0.45), 2);
    }
    var spot = null;
    if (ec.centre) {
      spot = place(ec.centre.lat, ec.centre.lon, 0.08);
      P.add(spot, C('#ffe9b0', 0.95), 18, 'disc');
      P.add(spot, C('#14101c'), 12, 'disc');
    }
    this.eclipseNow = { shadow: spot, penumbra: north, info: ec };
    return this.eclipseNow;
  };

  /* ---------- anchors for demo pointers ---------- */
  Scene.prototype.anchor = function (a) {
    if (this.model.s.ViewMode === 2 && this.globeAnchors) {
      return typeof a === 'string' && this.globeAnchors[a] ? this.globeAnchors[a] : null;
    }
    var s = this.model.s, d = this.d, F = d.frame, H = d.H, ds = s.DomeSize;
    var dome = function (dec, ra) { return d.toWorld(Geo.dome(dec, ra, ds, H, s.DomeShape)); };
    var moonAt = function (dec, ra) { return d.toWorld(Geo.body(dec, ra, s, H, s.MoonOnDome, s.MoonHeight)); };
    var sphere = function (local) { return V.addScaled(F.pos, Geo.localToWorld(F, local), d.rSphere); };
    var camAz = s.CameraDirection, subLon = d.sun.raDec.lon - d.theta;
    if (typeof a === 'string') {
      switch (a) {
        case 'sun': return d.sunDomeW;
        case 'moon': return d.moonDomeW;
        case 'sunSphere': return sphere(d.sunLocal);
        case 'moonSphere': return sphere(d.moonLocal);
        case 'shadow': case 'penumbra': {
          var en = FE.Eclipse && this.eclipseNow && Math.abs(this.eclipseNow.info.t - d.t) < 1e-6 ? this.eclipseNow : null;
          return en ? en[a] : null;
        }
        case 'observer': return F.pos;
        case 'pole': return [0, 0, 0];
        case 'sphereNear': {           // sphere surface facing the camera, 35 deg up
          var hd = V.norm([this.camBack[0], this.camBack[1], 0]), c35 = Math.cos(35 * U.D2R), s35 = Math.sin(35 * U.D2R);
          return V.add(F.pos, [hd[0] * c35 * d.rSphere, hd[1] * c35 * d.rSphere, s35 * d.rSphere]);
        }
        case 'sunRayMid': {
          var G = F.pos, dw = Geo.localToWorld(F, d.sunLocal), cp = V.dist(d.sunDomeW, G) * s.RayParameter / 3;
          var P1 = V.addScaled(G, dw, cp), t = 0.5, u = 0.5;
          return V.add(V.add(V.scale(G, u * u * u), V.scale(P1, 3 * u * u * t)), V.scale(d.sunDomeW, 3 * u * t * t + t * t * t));
        }
        case 'night': return Geo.fe(-d.sun.raDec.lat, subLon + 180);
        case 'subsolar': return Geo.fe(d.sun.raDec.lat, subLon);
        case 'dawn': return Geo.fe(0, subLon - 90);
        case 'dusk': return Geo.fe(0, subLon + 90);
        case 'node': {
          var mo = d.moon, q = V.toLatLon(A.moonOrbitPoint(mo.node, mo.incl, mo.eps, 0));
          return moonAt(q.lat, q.lon);
        }
      }
      return null;
    }
    if (a.fe) return Geo.fe(a.fe[0], a.fe[1]);
    if (a.feNear !== undefined) return Geo.fe(a.feNear, camAz);
    if (a.dome) return dome(a.dome[0], a.dome[1]);
    if (a.domeNear !== undefined) return dome(a.domeNear, camAz + d.theta);
    if (a.sphere) {
      var az = a.sphere[0] * U.D2R, el = a.sphere[1] * U.D2R;
      return sphere([Math.sin(el), Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az)]);
    }
    if (a.sphereCel) {
      var dec = a.sphereCel[0] === 'sun' ? d.sun.raDec.lat : a.sphereCel[0];
      var ra = s.ObserverLong + d.theta - a.sphereCel[1];
      return sphere(M3.apply(d.M, V.fromLatLon(dec, ra)));
    }
    if (a.ecl !== undefined) { var e = V.toLatLon(A.eclipticPoint(a.ecl, d.sun.eps)); return d.toWorld(Geo.body(e.lat, e.lon, s, H, s.SunOnDome, s.SunHeight)); }
    if (a.moonOrb !== undefined) {
      var m2 = d.moon, p = V.toLatLon(A.moonOrbitPoint(m2.node, m2.incl, m2.eps, a.moonOrb));
      return moonAt(p.lat, p.lon);
    }
    return null;
  };

  FE.Scene = Scene;
})();
