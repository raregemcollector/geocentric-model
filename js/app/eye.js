/* eye.js — the observer's view: what a person standing at the observer's spot sees,
 * through a camera-like (rectilinear) view with a limited field of view.
 *
 * The view looks toward azimuth SkyAz, tilted SkyAlt up, SkyFov degrees wide.
 * Everything is computed on the real globe. Optional "dome positions" mark where
 * the dome model puts the Sun and Moon if light reached the observer in a straight
 * line, so the gap between the two is visible from the ground. */
var FE = window.FE = window.FE || {};

(function () {
  var V = FE.V, M3 = FE.M3, U = FE.U, A = FE.Astro, D2R = U.D2R;
  var SU = FE.SkyUtil;

  /* Camera basis in horizon coordinates (x up, y east, z north). */
  function basis(az, alt) {
    var f = SU.fromAzAlt(az, alt), a = az * D2R;
    var r = [0, Math.cos(a), -Math.sin(a)];
    return { f: f, r: r, u: V.cross(r, f) };
  }

  /* Horizontal field of view actually shown, in degrees. SkyFov is the width on a
     landscape screen; on narrow (portrait) screens the width shrinks so the height
     does not balloon into a fish-eye: tall views keep a comfortable vertical span. */
  function hfov(s, aspect) {
    var k = Math.min(1, Math.sqrt(Math.max(0.2, aspect || 1.6) / 1.6));
    return 2 * Math.atan(Math.tan(s.SkyFov / 2 * D2R) * k) / D2R;
  }

  /* Directions of the view's outline (for drawing its footprint on the overview). */
  function frameDirs(s, aspect) {
    var B = basis(s.SkyAz, s.SkyAlt), t = Math.tan(hfov(s, aspect) / 2 * D2R), tv = t / aspect, out = [];
    function add(x, y) { out.push(V.norm(V.add(V.add(B.f, V.scale(B.r, x)), V.scale(B.u, y)))); }
    var n = 10, i;
    for (i = 0; i <= n; i++) add(-t + 2 * t * i / n, tv);
    for (i = 1; i <= n; i++) add(t, tv - 2 * tv * i / n);
    for (i = 1; i <= n; i++) add(t - 2 * t * i / n, -tv);
    for (i = 1; i < n; i++) add(-t, -tv + 2 * tv * i / n);
    return out;
  }

  function EyeView(canvas, app) {
    this.cv = canvas; this.app = app; this.hits = []; this.aspect = 1.6;
  }
  EyeView.frameDirs = frameDirs;
  EyeView.hfov = hfov;

  function fit(cv) {
    if (cv._fixed) return cv._k;        // offscreen canvas for video export
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return dpr;
  }

  /* Direction from the observer to a world point, in the observer's horizon frame,
     as it would appear if light travelled in a straight line on the flat model. */
  function straightLine(F, p) {
    var w = V.sub(p, F.pos);
    return V.norm([w[2], V.dot(w, F.east), V.dot(w, F.north)]);
  }

  /* Draw the view into a canvas. small = the picture-in-picture inset. */
  EyeView.prototype.draw = function (d, cv, small) {
    cv = cv || this.cv;
    if ((!cv.clientWidth && !cv._fixed) || !d) return;
    var app = this.app, s = app.model.s, k = fit(cv), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    if (!small) this.aspect = W / H;
    var fov = hfov(s, W / H), B = basis(s.SkyAz, s.SkyAlt), fpx = (W / 2) / Math.tan(fov / 2 * D2R);
    var cx = W / 2, cy = H / 2, M = d.M, sky = SU.skyFor(d, s);
    // Directions as seen: rotated into the horizon frame and lifted by refraction.
    function Lr(v) { return A.refract(M3.apply(M, v)); }
    var scale = small ? 0.75 : 1;
    function proj(v) {
      var cz = V.dot(v, B.f);
      if (cz <= 0.02) return null;
      return { x: cx + V.dot(v, B.r) / cz * fpx, y: cy - V.dot(v, B.u) / cz * fpx };
    }
    function onScreen(p, m) { m = m || 0; return p && p.x > -m && p.x < W + m && p.y > -m && p.y < H + m; }

    g.setTransform(1, 0, 0, 1, 0, 0);
    // Sky: horizon colour at the horizon line, zenith colour toward the top.
    var hz = proj(SU.fromAzAlt(s.SkyAz, 0)), horY = hz ? hz.y : H;
    var top = proj(SU.fromAzAlt(s.SkyAz, Math.min(75, s.SkyAlt + 60))), topY = top ? Math.min(top.y, horY - 10) : 0;
    g.fillStyle = SU.rgb(sky.zen); g.fillRect(0, 0, W, H);
    var grad = g.createLinearGradient(0, horY, 0, topY);
    grad.addColorStop(0, SU.rgb(sky.hor)); grad.addColorStop(1, SU.rgb(sky.zen));
    g.fillStyle = grad; g.fillRect(0, Math.min(topY, horY), W, Math.abs(horY - topY) + 1);

    // Polyline through a sampled curve, breaking where it leaves the view.
    function curve(pts, color, width, dash) {
      g.strokeStyle = color; g.lineWidth = (width || 1) * k; g.setLineDash(dash ? dash.map(function (x) { return x * k; }) : []);
      g.beginPath(); var prev = null;
      pts.forEach(function (v) {
        var p = proj(v);
        if (p && prev && Math.abs(p.x - prev.x) < W && Math.abs(p.y - prev.y) < H) { g.moveTo(prev.x, prev.y); g.lineTo(p.x, p.y); }
        prev = p;
      });
      g.stroke(); g.setLineDash([]);
    }

    if (s.SkyGrid) {
      for (var alt = 10; alt <= 80; alt += 10) {
        var row = []; for (var a1 = 0; a1 <= 360; a1 += 3) row.push(SU.fromAzAlt(a1, alt));
        curve(row, 'rgba(255,255,255,' + (alt % 30 ? 0.08 : 0.16) + ')', 1);
      }
      for (var a2 = 0; a2 < 360; a2 += 15) {
        var col = []; for (var e2 = 0; e2 <= 90; e2 += 3) col.push(SU.fromAzAlt(a2, e2));
        curve(col, 'rgba(255,255,255,' + (a2 % 45 ? 0.07 : 0.15) + ')', 1);
      }
    }
    if (s.ShowSunTrack) {
      var day = [], ecl = [];
      for (var r1 = 0; r1 <= 360; r1 += 2) {
        day.push(Lr(V.fromLatLon(d.sun.raDec.lat, r1)));
        ecl.push(Lr(A.eclipticPoint(r1, d.sun.eps)));
      }
      curve(day, 'rgba(255,190,90,0.75)', 1.4, [6, 5]);
      curve(ecl, 'rgba(255,150,90,0.35)', 1, [2, 4]);
    }

    // Analemma: one dot per day for the Sun at this clock time; solstices and equinoxes marked.
    // Dashed: the same days in the dome model, if its light came in a straight line.
    if (s.ShowAnalemma && !small) {
      var ana = app.model.analemma(d.H), Fa = d.frame;
      if (s.SkyDomeGhost) {
        curve(ana.map(function (p) { return straightLine(Fa, p.domeW); }), 'rgba(255,170,60,0.85)', 1.8, [6, 4]);
      }
      ana.forEach(function (p, i) {
        if (p.local[0] < -0.02) return;
        var q = proj(p.local); if (!onScreen(q, 6)) return;
        var last = i === ana.length - 1;
        g.fillStyle = last ? 'rgba(255,236,170,1)' : 'rgba(255,214,120,0.8)';
        g.beginPath(); g.arc(q.x, q.y, (last ? 3.6 : 2.1) * k, 0, Math.PI * 2); g.fill();
      });
      var EVT = [[79, 'Mar equinox'], [172, 'Jun solstice'], [265, 'Sep equinox'], [355, 'Dec solstice']];
      g.font = '600 ' + (10.5 * k) + 'px ' + SU.FONT;
      ana.forEach(function (p) {
        var dt = new Date(Date.UTC(2017, 0, 1) + p.t * 86400000), doy = Math.floor((dt - Date.UTC(dt.getUTCFullYear(), 0, 1)) / 86400000);
        EVT.forEach(function (e) {
          if (doy !== e[0] || p.local[0] < -0.02) return;
          var q = proj(p.local); if (!onScreen(q)) return;
          g.strokeStyle = 'rgba(255,236,170,0.95)'; g.lineWidth = 1.5 * k;
          g.beginPath(); g.arc(q.x, q.y, 5 * k, 0, Math.PI * 2); g.stroke();
          g.fillStyle = 'rgba(255,236,170,0.95)';
          var left = e[0] === 265;   // keep the two equinox labels apart
          g.fillText(e[1], left ? q.x - 8 * k - g.measureText(e[1]).width : q.x + 8 * k, q.y + (left ? 12 : 4) * k);
        });
      });
    }
    // Guide line from a demo: a circle of equal altitude, or a vertical at one azimuth.
    if (s.SkyMark && !small) {
      var mk = s.SkyMark, ln = [];
      if (mk.alt !== undefined) { for (var am = 0; am <= 360; am += 2) ln.push(SU.fromAzAlt(am, mk.alt)); }
      else { for (var em = 0; em <= 85; em += 2) ln.push(SU.fromAzAlt(mk.az, em)); }
      curve(ln, 'rgba(120,230,255,0.85)', 1.6, [7, 5]);
      var lp = proj(mk.alt !== undefined ? SU.fromAzAlt(s.SkyAz - fov / 2 + 4, mk.alt) : SU.fromAzAlt(mk.az, Math.max(2, s.SkyAlt + 6)));
      if (lp && mk.label) {
        g.font = '600 ' + (11 * k) + 'px ' + SU.FONT; g.fillStyle = 'rgba(160,240,255,0.95)';
        g.fillText(mk.label, U.clamp(lp.x + 6 * k, 4 * k, W - g.measureText(mk.label).width - 4 * k), lp.y - 6 * k);
      }
    }

    var cat = app.scene.catalog, lim = sky.lim, hits = small ? null : (this.hits = []);
    var labels = [], wantLabels = s.SkyLabels && !small;
    function place(x, y, w, h) {   // simple label collision avoidance
      for (var i = 0; i < labels.length; i++) {
        var L = labels[i];
        if (x < L[0] + L[2] && x + w > L[0] && y < L[1] + L[3] && y + h > L[1]) return false;
      }
      labels.push([x, y, w, h]); return true;
    }
    function ext(loc) { var e = Math.asin(U.clamp(loc[0], -1, 1)) / D2R; return U.clamp((e + 1) / 9, 0.25, 1); } // dimmer near the horizon

    // Constellations
    var lineA = U.clamp((lim + 0.5) / 4, 0.05, 0.38);
    if (s.ShowConstellations && lineA > 0.05) {
      g.strokeStyle = 'rgba(190,205,255,' + lineA + ')'; g.lineWidth = k; g.beginPath();
      cat.lines.forEach(function (ln) {
        var a = Lr(ln[0].dir), b = Lr(ln[1].dir);
        if (a[0] < -0.05 && b[0] < -0.05) return;
        var p = proj(a), q = proj(b);
        if (!p || !q || (!onScreen(p, 200) && !onScreen(q, 200))) return;
        g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
      });
      g.stroke();
      if (wantLabels) {
        g.font = '500 ' + (10 * k) + 'px ' + SU.FONT; g.fillStyle = 'rgba(190,205,255,' + Math.min(0.7, lineA * 1.8) + ')';
        g.textAlign = 'center';
        Object.keys(FE.Stars.FIGURES).forEach(function (name) {
          var sum = [0, 0, 0];
          cat.lines.forEach(function (ln) { if (ln[2] === name) { sum = V.add(sum, ln[0].dir); sum = V.add(sum, ln[1].dir); } });
          var loc = Lr(V.norm(sum));
          if (loc[0] < 0.03) return;
          var p = proj(loc); if (!onScreen(p)) return;
          var txt = name.toUpperCase(), w = g.measureText(txt).width;
          if (place(p.x - w / 2, p.y + 14 * k, w, 12 * k)) g.fillText(txt, p.x, p.y + 24 * k);
        });
        g.textAlign = 'start';
      }
    }

    // Stars
    if (s.ShowRealStars) {
      g.font = (11 * k) + 'px ' + SU.FONT;
      var nameLim = s.SkyFov < 50 ? 2.6 : s.SkyFov < 80 ? 1.8 : 1.3;
      cat.stars.forEach(function (st) {
        var loc = Lr(st.dir); if (loc[0] <= -0.01) return;
        var a = SU.starAlpha(st.mag, lim) * ext(loc); if (a <= 0.02) return;
        var p = proj(loc); if (!onScreen(p, 4)) return;
        var r = SU.starRadius(st.mag, k) * (s.SkyFov < 60 ? 1.25 : 1) * scale;
        if (r > 2.4 * k) {
          var gl = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
          gl.addColorStop(0, 'rgba(255,245,225,' + 0.35 * a + ')'); gl.addColorStop(1, 'rgba(255,245,225,0)');
          g.fillStyle = gl; g.beginPath(); g.arc(p.x, p.y, r * 3, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = 'rgba(255,248,232,' + a + ')';
        g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
        if (hits) hits.push({ x: p.x / k, y: p.y / k, name: st.name, mag: st.mag, loc: loc });
        if (wantLabels && st.mag < nameLim && a > 0.5) {
          var w = g.measureText(st.name).width;
          if (place(p.x + r + 3 * k, p.y - 12 * k, w, 13 * k)) {
            g.fillStyle = 'rgba(232,238,250,' + 0.8 * a + ')'; g.fillText(st.name, p.x + r + 4 * k, p.y - 3 * k);
          }
        }
      });
    }
    // Planets: point-like but bright; named when names are on.
    if (s.ShowPlanets) d.planets.forEach(function (pl) {
      var loc = pl.app; if (loc[0] <= -0.01) return;
      var a = U.clamp((lim + 1.5 - pl.mag) / 1.5, 0, 1) * ext(loc); if (a <= 0.02) return;
      var p = proj(loc); if (!onScreen(p, 4)) return;
      var r = U.clamp(2.6 - 0.4 * pl.mag, 1.3, 4) * k * scale;   // point-like, like a bright star
      var gl = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.5);
      gl.addColorStop(0, 'rgba(255,240,215,' + 0.4 * a + ')'); gl.addColorStop(1, 'rgba(255,240,215,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2); g.fill();
      g.globalAlpha = a; g.fillStyle = pl.color; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      if (hits) hits.push({ x: p.x / k, y: p.y / k, name: pl.name + ' (planet)', mag: pl.mag, loc: loc, r: r / k });
      if (wantLabels && a > 0.4) {
        g.font = '600 ' + (11 * k) + 'px ' + SU.FONT;
        var w = g.measureText(pl.name).width;
        if (place(p.x + r + 3 * k, p.y - 12 * k, w, 13 * k)) { g.fillStyle = 'rgba(255,226,170,' + 0.9 * a + ')'; g.fillText(pl.name, p.x + r + 4 * k, p.y - 3 * k); }
      }
    });

    // The demo's test-grid stars (coloured by declination), when switched on.
    if (s.ShowStars) {
      for (var dec = -90; dec < 89; dec += 30) for (var ra = 0; ra < 360; ra += 30) {
        var dc = dec === -90 ? -85 : dec, loc2 = Lr(V.fromLatLon(dc, ra));
        if (loc2[0] <= 0) continue;
        var p2 = proj(loc2); if (!onScreen(p2)) continue;
        var c = FE.hsv(1 - U.wrap(dec + 90, 180) / 180, 0.85, 1);
        g.strokeStyle = 'rgb(' + (c[0] * 255 | 0) + ',' + (c[1] * 255 | 0) + ',' + (c[2] * 255 | 0) + ')'; g.lineWidth = 1.6 * k;
        g.beginPath(); g.moveTo(p2.x - 5 * k, p2.y); g.lineTo(p2.x + 5 * k, p2.y); g.moveTo(p2.x, p2.y - 5 * k); g.lineTo(p2.x, p2.y + 5 * k); g.stroke();
      }
    }

    // Sun and Moon at (at least) a visible size; true size when zoomed in enough.
    var minR = (small ? 4 : 6) * k;
    var rSunPx = Math.max(minR, Math.tan(sky.rSun * D2R) * fpx), rMoonPx = rSunPx * sky.rMoon / sky.rSun;
    var sp = proj(d.sunApp), mp = proj(d.moonApp), ph = FE.Moon.phase(d);
    if (sp && d.sunApp[0] > -0.03 && onScreen(sp, 80 * k)) {
      var glow = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, rSunPx * 6);
      glow.addColorStop(0, 'rgba(255,244,214,' + (0.9 - sky.cover * 0.5) + ')'); glow.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(sp.x, sp.y, rSunPx * 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff6d6'; g.beginPath(); g.arc(sp.x, sp.y, rSunPx, 0, Math.PI * 2); g.fill();
      if (hits) hits.push({ x: sp.x / k, y: sp.y / k, name: 'Sun', loc: d.sunApp, r: rSunPx / k });
    }
    if (mp && d.moonApp[0] > -0.03 && onScreen(mp, 40 * k)) {
      var m = d.moonApp, t = V.sub(ph.toSunLocal, V.scale(m, V.dot(ph.toSunLocal, m)));
      var q = proj(V.norm(V.addScaled(m, V.norm(t), 0.01)));
      var chi = q ? Math.atan2(-(q.y - mp.y), q.x - mp.x) : 0;
      var dayLit = d.sunUp ? 'rgba(80,105,160,1)' : '#2a2e3a';
      FE.Moon.draw(g, mp.x, mp.y, rMoonPx, ph.i, chi, '#f4f0e2', sky.cover > 0.5 ? '#0d0f14' : dayLit);
      // Lunar eclipse: the Earth's shadow on the Moon. The shadow sits at the Moon's
      // distance, so it is offset from the Moon exactly as seen from the Earth's centre.
      var lun = s.ShowEclipse && FE.Eclipse ? FE.Eclipse.lunar(d.t) : null, mname = 'Moon · ' + Math.round(ph.illum * 100) + '% lit';
      if (lun && lun.active) {
        var off = V.sub(M3.apply(M, V.scale(d.sun.dir, -1)), M3.apply(M, d.moon.dir));
        var shp = proj(V.norm(V.add(d.moonApp, off)));
        if (shp) {
          var trueR = Math.tan(lun.rMoon * D2R) * fpx, f = rMoonPx / Math.max(trueR, 1e-6);   // drawn vs true size
          var sx = mp.x + (shp.x - mp.x) * f, sy = mp.y + (shp.y - mp.y) * f, pxDeg = rMoonPx / lun.rMoon;
          var rP = lun.rPen * pxDeg, fu = lun.rUmb / lun.rPen;
          var sg = g.createRadialGradient(sx, sy, 0, sx, sy, rP);
          sg.addColorStop(0, 'rgba(70,18,10,0.93)'); sg.addColorStop(fu, 'rgba(70,18,10,0.9)');
          sg.addColorStop(Math.min(1, fu + 0.01), 'rgba(12,8,10,0.78)'); sg.addColorStop(1, 'rgba(12,8,10,0)');
          g.save(); g.beginPath(); g.arc(mp.x, mp.y, rMoonPx, 0, Math.PI * 2); g.clip();
          g.fillStyle = sg; g.fillRect(mp.x - rMoonPx, mp.y - rMoonPx, 2 * rMoonPx, 2 * rMoonPx); g.restore();
        }
        mname = 'Moon · in the Earth’s ' + (lun.umbMag > 0 ? 'shadow' : 'penumbra') + ' (' + Math.round(Math.max(lun.umbMag > 0 ? lun.umbMag : lun.penMag, 0) * 100) + '%)';
      }
      if (hits) hits.push({ x: mp.x / k, y: mp.y / k, name: mname, loc: d.moonLocal, r: rMoonPx / k });
    }

    // Where the dome puts the Sun and Moon, if light reached the observer in a straight line.
    if (s.SkyDomeGhost && !small) {
      var F = d.frame;
      [[d.sunDomeW, sp, d.sunApp, 'Sun', 'rgba(255,170,60,', s.SunSize], [d.moonDomeW, mp, d.moonApp, 'Moon', 'rgba(200,210,230,', s.MoonSize]].forEach(function (o) {
        var loc = straightLine(F, o[0]), p = proj(loc);
        if (!p || !onScreen(p, 10)) return;
        // Ring at the size the model's Sun or Moon would appear (at least 11 px to stay visible).
        var distMm = V.len(V.sub(o[0], F.pos)), half = Math.atan(o[5] / 2000 / Math.max(1e-6, distMm));
        var rr = Math.max(11 * k, Math.tan(half) * fpx);
        g.strokeStyle = o[4] + '0.9)'; g.lineWidth = 1.5 * k; g.setLineDash([4 * k, 3 * k]);
        g.beginPath(); g.arc(p.x, p.y, rr, 0, Math.PI * 2); g.stroke();
        if (o[1] && o[2][0] > -0.03) {
          g.strokeStyle = o[4] + '0.45)'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(o[1].x, o[1].y); g.stroke();
        }
        g.setLineDash([]);
        g.font = '500 ' + (11 * k) + 'px ' + SU.FONT; g.fillStyle = o[4] + '0.95)';
        var label = o[3] + ' in the dome model, straight line', w = g.measureText(label).width;
        var lx = U.clamp(p.x - w / 2, 4 * k, W - w - 4 * k);
        g.fillText(label, lx, p.y < 70 * k + rr ? p.y + rr + 15 * k : p.y - rr - 5 * k);
        if (hits) hits.push({ x: p.x / k, y: p.y / k, name: o[3] + ' in the dome model (where straight light would come from) · ' + (2 * half / D2R).toFixed(2) + '° wide', loc: loc, r: Math.max(11, rr / k) });
      });
    }

    // Ground and compass along the horizon.
    if (horY < H) {
      var dark = U.clamp((d.sunAzEl.el + 8) / 16, 0, 1) * (1 - sky.cover * 0.7);
      var g1 = 'rgb(' + Math.round(14 + 30 * dark) + ',' + Math.round(20 + 38 * dark) + ',' + Math.round(16 + 24 * dark) + ')';
      var gg = g.createLinearGradient(0, horY, 0, H);
      gg.addColorStop(0, g1); gg.addColorStop(1, '#070a08');
      g.fillStyle = gg; g.fillRect(0, horY, W, H - horY);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = k;
      g.beginPath(); g.moveTo(0, horY); g.lineTo(W, horY); g.stroke();
    }
    var half = fov / 2 + 5, a0 = Math.ceil((s.SkyAz - half) / 5) * 5;
    g.textAlign = 'center'; g.fillStyle = '#e8ecf5';
    for (var az = a0; az <= s.SkyAz + half; az += 5) {
      var p3 = proj(SU.fromAzAlt(az, 0)); if (!p3) continue;
      var w8 = U.wrap(az, 360), major = w8 % 45 === 0, mid = w8 % 15 === 0;
      var ty = Math.min(p3.y, H - (small ? 14 : 26) * k);
      g.fillRect(p3.x - 0.5 * k, ty, k, (major ? 9 : mid ? 6 : 3) * k);
      if (major) {
        g.font = '700 ' + ((small ? 10 : 13) * k) + 'px ' + SU.FONT;
        g.fillText(SU.compass(w8), p3.x, ty + (small ? 20 : 23) * k);
      } else if (mid && !small) {
        g.font = (10 * k) + 'px ' + SU.FONT; g.fillStyle = 'rgba(232,236,245,0.6)';
        g.fillText(String(w8), p3.x, ty + 19 * k); g.fillStyle = '#e8ecf5';
      }
    }
    g.textAlign = 'start';
  };

  /* Nearest object to a screen point (CSS px), for tooltips. */
  EyeView.prototype.pick = function (x, y) {
    var best = null, bd = 14;
    this.hits.forEach(function (h) { var dd = Math.hypot(h.x - x, h.y - y) - (h.r || 0); if (dd < bd) { bd = dd; best = h; } });
    return best;
  };

  FE.EyeView = EyeView;
})();
