/* hud.js — overlays on top of the 3D view: date, Sun/Moon horizon coordinates,
 * the Moon-phase inset, the demo caption and the pointer arrow.
 * The pointer is anchored to a scene object (Sun, observer, a dome point ...) and
 * re-projected every frame, so it stays on target at any window size; the original
 * used fixed pixel positions for a 907x507 canvas. */
var FE = window.FE = window.FE || {};

(function () {
  var V = FE.V, M3 = FE.M3, U = FE.U, A = FE.Astro;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MS_PER_DAY = 86400000, EPOCH = Date.UTC(2017, 0, 1);

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateOf(t) { return new Date(EPOCH + t * MS_PER_DAY); }
  function fmtDate(t) {
    var dt = dateOf(Math.round(t * 1440) / 1440);
    return MONTHS[dt.getUTCMonth()] + ' ' + pad(dt.getUTCDate()) + ' ' + dt.getUTCFullYear() +
      ' · ' + pad(dt.getUTCHours()) + ':' + pad(dt.getUTCMinutes()) + ' UTC';
  }

  /* Live numbers inside demo text: {sunEl}, {ghostSunEl}, {domeSunDist}, {domeSunSize},
     {routeFlat}, {routeReal}, {sunSize}, {sunHeight}. They are recomputed every frame, so a caption can count
     along while a demo animates. */
  function live(s, d) {
    var SUN_FE_KM = s.SunSize;   // the model's Sun diameter (default 51 km, a common flat-earth figure)
    var F = d.frame, w = V.sub(d.sunDomeW, F.pos), distKm = V.len(w) * 1000;
    var ghost = V.norm([w[2], V.dot(w, F.east), V.dot(w, F.north)]);
    var out = {
      sunEl: d.sunAzEl.el.toFixed(1),
      sunAz: d.sunAzEl.az.toFixed(1),
      ghostSunAz: (U.wrap(Math.atan2(ghost[1], ghost[2]) / U.D2R, 360)).toFixed(0),
      // A north-facing pyramid face (slope 51.84°, the Great Pyramid) is sunlit when the
      // Sun is above the face's plane: cos(slope) sin(el) + sin(slope) cos(el) cos(az) > 0.
      northFace: (function () {
        var sl = 51.84 * U.D2R, e = d.sunAzEl.el * U.D2R, az = d.sunAzEl.az * U.D2R;
        if (e <= 0) return 'dark (the Sun is down)';
        return Math.cos(sl) * Math.sin(e) + Math.sin(sl) * Math.cos(e) * Math.cos(az) > 0 ? 'in sunlight' : 'in shadow';
      })(),
      ghostSunEl: (Math.asin(U.clamp(ghost[0], -1, 1)) / U.D2R).toFixed(0),
      domeSunDist: (Math.round(distKm / 10) * 10).toLocaleString('en-US'),
      domeSunSize: (2 * Math.atan(SUN_FE_KM / 2 / distKm) / U.D2R).toFixed(2),
      domeHeight: (Math.round(s.DomeHeight / 100) * 100).toLocaleString('en-US'),
      sunSize: Math.round(s.SunSize).toLocaleString('en-US'),
      sunHeight: (Math.round(d.sunDomeW[2] * 100) * 10).toLocaleString('en-US'),
      // Eclipses: Sun-Moon gap as seen here, local Eastern Standard Time.
      sunMoonSep: (Math.acos(U.clamp(V.dot(d.sunApp, d.moonApp), -1, 1)) / U.D2R).toFixed(1),
      moonEl: d.moonAzEl.el.toFixed(0),
      estTime: (function () {
        var m = Math.round(((d.t * 1440) % 1440 + 1440 - 300) % 1440), h = Math.floor(m / 60), mm = m % 60;
        return ((h + 11) % 12 + 1) + ':' + pad(mm) + (h < 12 ? ' am' : ' pm') + ' EST';
      })()
    };
    if (FE.Eclipse) {
      var es = FE.Eclipse.solar(d.t), el = FE.Eclipse.lunar(d.t);
      out.shadowAt = es.centre ? Math.abs(es.centre.lat).toFixed(1) + '° ' + (es.centre.lat < 0 ? 'S' : 'N') + ', ' +
        Math.abs(es.centre.lon).toFixed(1) + '° ' + (es.centre.lon < 0 ? 'W' : 'E') : 'off the Earth';
      out.penMag = Math.round(U.clamp(el.penMag, 0, 1) * 100);
    }
    if (s.Route) {
      var a = FE.Geo.fe(s.Route.a[0], s.Route.a[1]), b = FE.Geo.fe(s.Route.b[0], s.Route.b[1]);
      var ua = V.fromLatLon(s.Route.a[0], s.Route.a[1]), ub = V.fromLatLon(s.Route.b[0], s.Route.b[1]);
      out.routeFlat = (Math.round(V.dist(a, b) * 100) * 10).toLocaleString('en-US');
      out.routeReal = (Math.round(Math.acos(U.clamp(V.dot(ua, ub), -1, 1)) * A.EARTH_RADIUS_KM / 10) * 10).toLocaleString('en-US');
    }
    return out;
  }
  function fill(text, s, d) {
    if (!text || text.indexOf('{') < 0) return text || '';
    var L = live(s, d);
    return text.replace(/\{(\w+)\}/g, function (m, k) { return L[k] !== undefined ? L[k] : m; });
  }

  /* Shared Moon helpers (also used by the observer's sky view). */
  var Moon = {
    /* Phase angle i (0 = full, pi = new), lit fraction, and the Moon-to-Sun
       direction in the observer's horizon frame. */
    phase: function (d) {
      var moonKm = V.scale(d.moon.dir, d.moon.distKm), sunKm = V.scale(d.sun.dir, d.sun.distKm);
      var toSun = V.norm(V.sub(sunKm, moonKm)), toEarth = V.norm(V.scale(moonKm, -1));
      var i = Math.acos(U.clamp(V.dot(toSun, toEarth), -1, 1));
      return { i: i, illum: (1 + Math.cos(i)) / 2, toSunLocal: M3.apply(d.M, toSun) };
    },
    /* Draw a Moon disc whose bright limb points at angle chi (radians, counter-clockwise
       from screen-right, y up). */
    draw: function (g, x, y, r, i, chi, bright, dark) {
      g.save();
      g.translate(x, y); g.rotate(-chi);
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = dark; g.fillRect(-r, -r, 2 * r, 2 * r);
      g.fillStyle = bright;
      g.beginPath(); g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fill();
      g.fillStyle = i < Math.PI / 2 ? bright : dark;
      g.beginPath(); g.ellipse(0, 0, Math.max(Math.abs(Math.cos(i)) * r, 0.01), r, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  };

  function HUD(root, scene) {
    this.scene = scene;
    this.el = {
      date: root.querySelector('[data-hud=date]'),
      season: root.querySelector('[data-hud=season]'),
      azel: root.querySelector('[data-hud=azel]'),
      sun: root.querySelector('[data-hud=sun]'),
      moon: root.querySelector('[data-hud=moon]'),
      phaseBox: root.querySelector('[data-hud=phase]'),
      phase: root.querySelector('[data-hud=phase] canvas'),
      illum: root.querySelector('[data-hud=illum]'),
      caption: root.querySelector('[data-hud=caption]'),
      svg: root.querySelector('[data-hud=pointer]'),
      card: root.querySelector('[data-hud=card]')
    };
    this.root = root;
    // Cards can be folded down to their title; the choice holds for the rest of the visit.
    var self = this, tog = this.el.card.querySelector('.card-toggle');
    this.cardCollapsed = false;
    if (tog) tog.addEventListener('click', function () { self.cardCollapsed = !self.cardCollapsed; self.applyCardFold(); });
  }
  HUD.prototype.applyCardFold = function () {
    var box = this.el.card, tog = box.querySelector('.card-toggle'), c = this.cardCollapsed;
    box.classList.toggle('collapsed', c);
    if (tog) { tog.textContent = c ? 'Show' : 'Hide'; tog.setAttribute('aria-expanded', c ? 'false' : 'true'); tog.setAttribute('aria-label', c ? 'Show the details' : 'Hide the details'); }
  };

  HUD.prototype.update = function (s, d) {
    var e = this.el;
    e.date.textContent = fmtDate(d.t);
    var season = A.seasonOfDay(d.t);
    e.season.textContent = season; e.season.hidden = !season;

    var obsMode = s.RayTarget === 0 && !s.ShowStars;
    e.azel.hidden = !obsMode; e.phaseBox.hidden = !obsMode;
    if (obsMode) {
      e.sun.textContent = d.sunUp ? 'az ' + d.sunAzEl.az.toFixed(1) + '°  el ' + d.sunAzEl.el.toFixed(1) + '°' : 'below horizon';
      e.moon.textContent = d.moonUp ? 'az ' + d.moonAzEl.az.toFixed(1) + '°  el ' + d.moonAzEl.el.toFixed(1) + '°' : 'below horizon';
      this.drawPhase(d);
    }
    var cap = fill(s.Description, s, d);
    if (e.caption.textContent !== cap) e.caption.textContent = cap;
    e.caption.hidden = !cap;
    this.drawCard(s, d);
    this.ptrText = s.Pointer ? fill(s.Pointer.text, s, d) : '';
    this.drawPointer(s.ViewMode === 1 ? null : s.Pointer);
  };

  /* Moon phase and tilt as the observer sees it, from the real Sun/Moon geometry. */
  HUD.prototype.drawPhase = function (d) {
    var cv = this.el.phase, dpr = Math.min(window.devicePixelRatio || 1, 2), css = cv.clientWidth || 64;
    if (cv.width !== Math.round(css * dpr)) { cv.width = cv.height = Math.round(css * dpr); }
    var g = cv.getContext('2d'), N = cv.width;
    var ph = Moon.phase(d);
    // Bright-limb direction projected on the observer's view of the Moon (camera kept upright).
    var m = d.moonLocal, right = V.cross(m, [1, 0, 0]);
    right = V.len(right) < 1e-6 ? [0, 1, 0] : V.norm(right);
    var up = V.cross(right, m);
    var chi = Math.atan2(V.dot(ph.toSunLocal, up), V.dot(ph.toSunLocal, right));
    var day = d.sunUp, vis = d.moonUp;
    var bright = vis ? (day ? '#cdd8ff' : '#f3efe2') : (day ? '#3fb35a' : '#1f6b33');
    var dark = vis ? (day ? '#3a59c9' : '#141720') : (day ? '#0d7a2a' : '#06331a');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = dark; g.fillRect(0, 0, N, N);
    Moon.draw(g, N / 2, N / 2, N * 0.44, ph.i, chi, bright, dark);
    this.el.illum.textContent = (ph.illum * 100).toFixed(1) + '% lit';
  };

  /* Title and summary cards used by the demos. */
  HUD.prototype.drawCard = function (s, d) {
    var box = this.el.card, c = s.Card;
    this.root.classList.toggle('has-card', !!c);
    if (!c) { box.hidden = true; this.cardKey = ''; return; }
    var key = c.title + '|' + c.lines.map(function (l) { return fill(l, s, d); }).join('|');
    if (key !== this.cardKey) {
      this.cardKey = key;
      box.querySelector('h3').textContent = c.title;
      var ul = box.querySelector('ul'); ul.textContent = '';
      c.lines.forEach(function (l) { var li = document.createElement('li'); li.textContent = fill(l, s, d); ul.appendChild(li); });
      box.querySelector('.card-kicker').textContent = c.kicker || '';
      this.applyCardFold();
      box.querySelector('.card-panel').scrollTop = 0;
    }
    box.hidden = false;
  };

  HUD.prototype.drawPointer = function (ptr) {
    var svg = this.el.svg;
    if (!ptr || !ptr.text) { svg.style.display = 'none'; return; }
    var target;
    if (typeof ptr.anchor === 'string' && ptr.anchor.indexOf('hud:') === 0) {
      var box = this.el[ptr.anchor.slice(4)] || this.el.date;
      if (box.hidden) { svg.style.display = 'none'; return; }
      var rb = box.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
      target = { x: rb.left - rr.left + rb.width / 2, y: rb.bottom - rr.top + 2 };
    } else {
      var p = this.scene.anchor(ptr.anchor);
      if (!p) { svg.style.display = 'none'; return; }
      target = this.scene.toScreen(p);
    }
    var W = this.root.clientWidth, Hh = this.root.clientHeight;
    var off = ptr.offset || [-110, -70];
    // Keep the label inside the view: flip the offset if it would leave it.
    var fx = target.x + off[0], fy = target.y + off[1];
    if (fx < 70 || fx > W - 70) fx = target.x - off[0];
    if (fy < 24 || fy > Hh - 24) fy = target.y - off[1];
    fx = U.clamp(fx, 70, W - 70); fy = U.clamp(fy, 24, Hh - 24);
    var dx = target.x - fx, dy = target.y - fy, L = Math.hypot(dx, dy) || 1;
    var tipX = target.x - dx / L * 4, tipY = target.y - dy / L * 4;
    svg.removeAttribute('hidden'); svg.style.display = 'block';
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh);
    var line = svg.querySelector('line'), label = svg.querySelector('text'), bg = svg.querySelector('rect');
    line.setAttribute('x1', fx); line.setAttribute('y1', fy);
    line.setAttribute('x2', tipX); line.setAttribute('y2', tipY);
    label.textContent = this.ptrText || ptr.text;
    var below = dy < 0;
    label.setAttribute('x', fx); label.setAttribute('y', below ? fy + 16 : fy - 8);
    var bb = label.getBBox();
    bg.setAttribute('x', bb.x - 7); bg.setAttribute('y', bb.y - 4);
    bg.setAttribute('width', bb.width + 14); bg.setAttribute('height', bb.height + 8);
  };

  FE.HUD = HUD;
  FE.Moon = Moon;
  FE.fillText = fill;
  FE.liveNumbers = live;
  FE.fmtDate = fmtDate;
  FE.dateOf = dateOf;
})();
