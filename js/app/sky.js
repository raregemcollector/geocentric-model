/* sky.js — shared sky rendering helpers and the "Sky overview" panel.
 *
 * FE.SkyUtil   sky colour, star brightness and eclipse darkening, used by both the
 *              overview chart and the observer's view in the viewport (eye.js).
 * FE.SkyView   the overview below the viewport: an all-sky chart (zenith in the
 *              middle, horizon on the rim, north up, east on the LEFT as when lying on
 *              your back) with the observer's field of view drawn on it. Click or drag
 *              on the chart to aim the observer's view. Beside it: rise/set times and
 *              what is up right now. */
var FE = window.FE = window.FE || {};

(function () {
  var V = FE.V, M3 = FE.M3, U = FE.U, A = FE.Astro, D2R = U.D2R;
  var FONT = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

  /* ---------------- shared helpers ---------------- */
  var STOPS = [ // [sun alt, zenith rgb, horizon rgb, limiting magnitude]
    [-90, [6, 9, 20], [12, 18, 36], 5.5], [-18, [6, 9, 20], [12, 18, 36], 5.5],
    [-12, [10, 17, 38], [26, 36, 66], 4.2], [-6, [20, 34, 74], [70, 72, 110], 2.6],
    [0, [52, 86, 150], [205, 140, 110], 0.6], [6, [70, 125, 205], [170, 200, 235], -1.6],
    [90, [62, 120, 205], [160, 195, 235], -1.6]
  ];
  function skyState(h) {
    for (var k = 1; k < STOPS.length; k++) {
      if (h <= STOPS[k][0]) {
        var a = STOPS[k - 1], b = STOPS[k], f = (h - a[0]) / (b[0] - a[0]);
        var mix = function (p, q) { return [0, 1, 2].map(function (j) { return Math.round(p[j] + (q[j] - p[j]) * f); }); };
        return { zen: mix(a[1], b[1]), hor: mix(a[2], b[2]), lim: a[3] + (b[3] - a[3]) * f };
      }
    }
    var e = STOPS[STOPS.length - 1];
    return { zen: e[1], hor: e[2], lim: e[3] };
  }
  /* Sky for the current moment, including the darkening of a solar eclipse. */
  function skyFor(d, s) {
    var el = d.sunAzEl.el;
    var sep = Math.acos(U.clamp(V.dot(d.sunApp, d.moonApp), -1, 1)) / D2R;
    var rSun = Math.asin(696000 / d.sun.distKm) / D2R, rMoon = Math.asin(1737.4 / d.moon.distKm) / D2R;
    var cover = U.clamp((rSun + rMoon - sep) / (2 * rSun), 0, 1);
    var hEff = el > 0 ? U.lerp(el, -7, Math.pow(cover, 4)) : el;
    var st = skyState(hEff);
    st.cover = el > -1 ? cover : 0;
    st.rSun = rSun; st.rMoon = rMoon;
    if (s && s.ShowSkyDaylight) st.lim = Math.max(st.lim, 5);
    return st;
  }
  function rgb(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a === undefined ? 1 : a) + ')'; }
  function starRadius(mag, k) { return U.clamp(3.4 - 0.62 * mag, 0.7, 4.6) * k; }
  function starAlpha(mag, lim) { return U.clamp((lim - mag) / 1.2 + 0.25, 0, 1); }
  /* Horizon (local) vector from azimuth/altitude in degrees: x up, y east, z north. */
  function fromAzAlt(az, alt) {
    var a = az * D2R, e = alt * D2R, c = Math.cos(e);
    return [Math.sin(e), c * Math.sin(a), c * Math.cos(a)];
  }
  function toAzAlt(v) {
    return { az: U.wrap(Math.atan2(v[1], v[2]) / D2R, 360), alt: Math.asin(U.clamp(v[0], -1, 1)) / D2R };
  }
  var COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function compass(az) { return COMPASS[Math.round(U.wrap(az, 360) / 22.5) % 16]; }
  function hm(h) { var m = Math.round(U.wrap(h, 24) * 60) % 1440; return ('0' + (m / 60 | 0)).slice(-2) + ':' + ('0' + m % 60).slice(-2); }

  /* Rise and set times (UTC) within the current UTC day, found by stepping 5 minutes
     and refining the crossing linearly. Standard altitudes include refraction. */
  function riseSet(lat, lon, day) {
    function alts(t) {
      var th = A.gmst(t), M = FE.Geo.celestToLocal(lat, lon, th), sun = A.sun(t), moon = A.moon(t);
      var obs = V.fromLatLon(lat, lon + th, 1);
      var mv = V.norm(V.sub(V.scale(moon.dir, moon.distER), obs));
      return [Math.asin(M3.apply(M, sun.dir)[0]) / D2R + 0.833, Math.asin(M3.apply(M, mv)[0]) / D2R + 0.583];
    }
    var res = [{ rise: null, set: null, up: 0 }, { rise: null, set: null, up: 0 }], step = 5 / 1440, prev = alts(day);
    for (var t = day + step; t <= day + 1 + 1e-9; t += step) {
      var cur = alts(t);
      for (var k = 0; k < 2; k++) {
        if (cur[k] > 0) res[k].up++;
        if ((prev[k] <= 0) !== (cur[k] <= 0)) {
          var f = prev[k] / (prev[k] - cur[k]), when = (t - step + f * step - day) * 24;
          if (cur[k] > 0) { if (res[k].rise === null) res[k].rise = when; }
          else if (res[k].set === null) res[k].set = when;
        }
      }
      prev = cur;
    }
    return res;
  }

  FE.SkyUtil = { skyState: skyState, skyFor: skyFor, rgb: rgb, starRadius: starRadius, starAlpha: starAlpha,
    fromAzAlt: fromAzAlt, toAzAlt: toAzAlt, compass: compass, hm: hm, FONT: FONT };

  /* ---------------- overview panel ---------------- */
  function SkyView(root, app) {
    this.root = root; this.app = app; this.model = app.model;
    this.cAll = root.querySelector('[data-sky=all]');
    this.info = root.querySelector('[data-sky=info]');
    this.facts = root.querySelector('[data-sky=facts]');
    this.tip = root.querySelector('[data-sky=tip]');
    this.hits = []; this.rsKey = ''; this.rs = null;
    var self = this, dragging = false;
    function aim(e) {
      var g = self.geom; if (!g) return;
      var rect = self.cAll.getBoundingClientRect();
      var x = (e.clientX - rect.left) * g.k - g.cx, y = (e.clientY - rect.top) * g.k - g.cy;
      var r = Math.hypot(x, y) / g.R; if (r > 1.02) return;
      var alt = 90 - Math.min(r, 1) * 90, az = U.wrap(Math.atan2(-x, -y) / D2R, 360);
      app.userEdit();
      self.model.setMany({ SkyAz: az, SkyAlt: U.clamp(alt - 0, -10, 85) });
    }
    this.cAll.addEventListener('pointerdown', function (e) { dragging = true; self.cAll.setPointerCapture(e.pointerId); aim(e); });
    this.cAll.addEventListener('pointermove', function (e) { if (dragging) aim(e); else self.hover(e); });
    this.cAll.addEventListener('pointerup', function () { dragging = false; });
    this.cAll.addEventListener('pointerleave', function () { self.tip.hidden = true; });
  }

  function fit(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return dpr;
  }

  SkyView.prototype.draw = function (d) {
    if (!this.cAll.clientWidth || !d) return;
    var s = this.model.s, sky = skyFor(d, s);
    this.drawAll(d, s, sky);
    this.drawFacts(d, s, sky);
  };

  SkyView.prototype.drawAll = function (d, s, sky) {
    var cv = this.cAll, k = fit(cv), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    var R = Math.min(W, H) / 2 - 22 * k, cx = W / 2, cy = H / 2, M = d.M;
    this.geom = { k: k, R: R, cx: cx, cy: cy };
    function proj(loc) {
      var el = Math.asin(U.clamp(loc[0], -1, 1)), az = Math.atan2(loc[1], loc[2]);
      var r = (Math.PI / 2 - el) / (Math.PI / 2) * R;
      return { x: cx - r * Math.sin(az), y: cy - r * Math.cos(az), up: el > 0 };
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    var grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, rgb(sky.zen)); grad.addColorStop(1, rgb(sky.hor));
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();

    g.lineWidth = k; g.setLineDash([3 * k, 4 * k]); g.strokeStyle = 'rgba(255,255,255,0.16)';
    [30, 60].forEach(function (alt) { g.beginPath(); g.arc(cx, cy, (90 - alt) / 90 * R, 0, Math.PI * 2); g.stroke(); });
    function curve(fn, color) {
      g.strokeStyle = color; g.beginPath(); var pen = false;
      for (var a = 0; a <= 360; a += 3) {
        var q = proj(M3.apply(M, fn(a)));
        if (q.up) { if (pen) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); pen = true; } else pen = false;
      }
      g.stroke();
    }
    curve(function (a) { return V.fromLatLon(0, a); }, 'rgba(120,220,210,0.45)');
    curve(function (a) { return A.eclipticPoint(a, d.sun.eps); }, 'rgba(255,190,90,0.5)');
    g.setLineDash([]);

    var cat = this.app.scene.catalog, lim = sky.lim;
    if (s.ShowConstellations) {
      g.strokeStyle = 'rgba(200,215,255,' + U.clamp((lim + 0.5) / 4, 0.05, 0.35) + ')'; g.lineWidth = k;
      g.beginPath();
      cat.lines.forEach(function (ln) {
        var a = M3.apply(M, ln[0].dir), b = M3.apply(M, ln[1].dir);
        if (a[0] <= 0 && b[0] <= 0) return;
        var p = proj(a), q = proj(b); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
      });
      g.stroke();
    }
    var hits = this.hits = [];
    if (s.ShowRealStars) cat.stars.forEach(function (st) {
      var loc = M3.apply(M, st.dir); if (loc[0] <= 0) return;
      var a = starAlpha(st.mag, lim); if (a <= 0) return;
      var q = proj(loc), r = starRadius(st.mag, k);
      g.fillStyle = 'rgba(255,247,230,' + a + ')';
      g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.fill();
      hits.push({ x: q.x / k, y: q.y / k, name: st.name, mag: st.mag, loc: loc });
    });
    if (s.ShowPlanets) d.planets.forEach(function (pl) {
      if (pl.app[0] <= 0) return;
      var q = proj(pl.app), r = U.clamp(2.8 - 0.45 * pl.mag, 1.2, 4.2) * k;
      g.fillStyle = pl.color; g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.fill();
      g.font = '600 ' + (10 * k) + 'px ' + FONT; g.fillStyle = 'rgba(255,226,170,0.9)'; g.fillText(pl.name, q.x + r + 3 * k, q.y - 2 * k);
      hits.push({ x: q.x / k, y: q.y / k, name: pl.name + ' (planet)', mag: pl.mag, loc: pl.app });
    });
    var pole = proj(M3.apply(M, [0, 0, s.ObserverLat >= 0 ? 1 : -1]));
    if (pole.up) {
      g.strokeStyle = 'rgba(255,120,120,0.8)'; g.lineWidth = 1.2 * k;
      g.beginPath(); g.moveTo(pole.x - 5 * k, pole.y); g.lineTo(pole.x + 5 * k, pole.y);
      g.moveTo(pole.x, pole.y - 5 * k); g.lineTo(pole.x, pole.y + 5 * k); g.stroke();
    }
    // Sun and Moon
    var ph = FE.Moon.phase(d);
    if (d.sunApp[0] > -0.02) {
      var sp = proj(d.sunApp), glow = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 26 * k);
      glow.addColorStop(0, 'rgba(255,240,200,0.9)'); glow.addColorStop(1, 'rgba(255,220,150,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(sp.x, sp.y, 26 * k, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(sp.x, sp.y, 8 * k, 0, Math.PI * 2); g.fill();
      hits.push({ x: sp.x / k, y: sp.y / k, name: 'Sun', loc: d.sunApp });
    }
    if (d.moonApp[0] > -0.02) {
      var mp = proj(d.moonApp), m = d.moonApp;
      var tt = V.sub(ph.toSunLocal, V.scale(m, V.dot(ph.toSunLocal, m)));
      var q2 = proj(V.norm(V.addScaled(m, V.norm(tt), 0.03)));
      FE.Moon.draw(g, mp.x, mp.y, 8 * k * sky.rMoon / sky.rSun, ph.i, Math.atan2(-(q2.y - mp.y), q2.x - mp.x), '#f2eedf', '#2a2e3a');
      hits.push({ x: mp.x / k, y: mp.y / k, name: 'Moon', loc: d.moonApp });
    }
    // The observer's field of view, as its outline on the sky.
    var F = FE.EyeView.frameDirs(s, this.app.viewAspect());
    g.beginPath();
    F.forEach(function (v, i) { var q = proj(v); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    g.closePath();
    g.fillStyle = 'rgba(240,164,58,0.12)'; g.fill();
    g.strokeStyle = 'rgba(240,164,58,0.95)'; g.lineWidth = 1.6 * k; g.stroke();
    g.restore();

    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.2 * k;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e8ecf5'; g.font = '600 ' + (12 * k) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(function (c) {
      var a = c[1] * D2R, r = R + 11 * k;
      g.fillText(c[0], cx - r * Math.sin(a), cy - r * Math.cos(a));
    });
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  };

  SkyView.prototype.drawFacts = function (d, s, sky) {
    var day = Math.floor(d.t), key = day + '|' + s.ObserverLat.toFixed(3) + '|' + s.ObserverLong.toFixed(3);
    if (key !== this.rsKey) { this.rs = riseSet(s.ObserverLat, s.ObserverLong, day); this.rsKey = key; }
    var rs = this.rs, el = d.sunAzEl.el;
    function rsText(r) {
      if (r.rise === null && r.set === null) return r.up > 0 ? 'Up all day' : 'Down all day';
      return (r.rise !== null ? 'Rises ' + hm(r.rise) : 'No rise') + ' · ' + (r.set !== null ? 'Sets ' + hm(r.set) : 'No set');
    }
    var phase = el > 0 ? 'Daytime' : el > -6 ? 'Civil twilight' : el > -12 ? 'Nautical twilight' : el > -18 ? 'Astronomical twilight' : 'Night';
    var ph = FE.Moon.phase(d), visible = 0, lim = sky.lim;
    this.app.scene.catalog.stars.forEach(function (st) { if (M3.apply(d.M, st.dir)[0] > 0 && st.mag < lim) visible++; });
    var solar = U.wrap(12 + (s.ObserverLong - (d.sun.raDec.lon - d.theta)) / 15, 24);
    var rows = [
      ['Sky', phase + (sky.cover > 0 ? ' · eclipse, ' + Math.round(sky.cover * 100) + '% covered' : '')],
      ['Sun', (d.sunUp ? 'az ' + d.sunAzEl.az.toFixed(0) + '°, el ' + el.toFixed(1) + '°' : 'Below the horizon (' + el.toFixed(1) + '°)')],
      ['', rsText(rs[0]) + ' UTC'],
      ['Moon', (d.moonUp ? 'az ' + d.moonAzEl.az.toFixed(0) + '°, el ' + d.moonAzEl.el.toFixed(1) + '°' : 'Below the horizon') + ' · ' + Math.round(ph.illum * 100) + '% lit'],
      ['', rsText(rs[1]) + ' UTC'],
      ['Dome Sun', (function () {
        var w = V.sub(d.sunDomeW, d.frame.pos), dist = V.len(w) * 1000;
        var el = Math.asin(U.clamp(w[2] / V.len(w), -1, 1)) / D2R, size = 2 * Math.atan(s.SunSize / 2 / dist) / D2R;
        return Math.round(d.sunDomeW[2] * 1000).toLocaleString('en-US') + ' km up · ' + Math.round(dist).toLocaleString('en-US') +
          ' km away · seen ' + el.toFixed(0) + '° up, ' + size.toFixed(2) + '° wide (real Sun 0.53°)';
      })()],
      ['Stars', visible + ' of the catalog visible to the eye now'],
      ['Planets', (function () {
        var up = d.planets.filter(function (pl) { return pl.app[0] > 0; }).map(function (pl) {
          var aa = toAzAlt(pl.app); return pl.name + ' ' + compass(aa.az) + ' ' + aa.alt.toFixed(0) + '\u00b0';
        });
        return up.length ? up.join(', ') : 'none above the horizon';
      })()],
      ['Facing', s.SkyAz.toFixed(0) + '° ' + compass(s.SkyAz) + ', ' + s.SkyAlt.toFixed(0) + '° up, ' + FE.EyeView.hfov(s, this.app.viewAspect()).toFixed(0) + '° wide'],
      ['Local', 'solar time ' + hm(solar)]
    ];
    var sig = JSON.stringify(rows);
    if (sig !== this.lastFacts) {
      this.lastFacts = sig;
      var frag = document.createDocumentFragment();
      rows.forEach(function (r) {
        var dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = r[0]; dd.textContent = r[1]; frag.appendChild(dt); frag.appendChild(dd);
      });
      this.facts.replaceChildren(frag);
    }
    this.info.textContent = (Math.abs(s.ObserverLat)).toFixed(2) + '°' + (s.ObserverLat >= 0 ? 'N' : 'S') + ', ' +
      Math.abs(s.ObserverLong).toFixed(2) + '°' + (s.ObserverLong >= 0 ? 'E' : 'W');
  };

  SkyView.prototype.hover = function (e) {
    var rect = this.cAll.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
    var best = null, bd = 12;
    this.hits.forEach(function (h) { var dd = Math.hypot(h.x - x, h.y - y); if (dd < bd) { bd = dd; best = h; } });
    if (!best) { this.tip.hidden = true; return; }
    var aa = toAzAlt(best.loc);
    this.tip.textContent = best.name + (best.mag !== undefined ? ' · mag ' + best.mag.toFixed(1) : '') +
      ' · az ' + aa.az.toFixed(0) + '° el ' + aa.alt.toFixed(0) + '°';
    var rr = this.root.getBoundingClientRect();
    this.tip.style.left = (e.clientX - rr.left + 12) + 'px';
    this.tip.style.top = (e.clientY - rr.top - 28) + 'px';
    this.tip.hidden = false;
  };

  FE.SkyView = SkyView;
})();
