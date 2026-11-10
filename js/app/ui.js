/* ui.js — the app shell: panel (bottom sheet on phones, side panel on wide screens),
 * controls, demos list and player bar, 3D-view input, share links, saving, and the
 * render loop.
 *
 * Security notes: nothing is fetched from other servers. Shared links and browser
 * storage are treated as untrusted input and go through Model.restore(), which only
 * accepts known, type-checked, clamped settings. All text is set with textContent. */
var FE = window.FE = window.FE || {};

(function () {
  var U = FE.U, CONFIG = FE.CONFIG || {};
  var EPOCH = Date.UTC(2017, 0, 1), DAY = 86400000;
  var STORE_KEY = 'dome-model-state-v1';
  var WIDE = window.matchMedia ? matchMedia('(min-width: 1000px)') : { matches: false };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---- formatting and parsing of the number fields ---- */
  var FMT = {
    hours: function (h) { var m = Math.round(U.wrap(h, 24) * 60) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); },
    day: function (d) { var t = new Date(EPOCH + Math.round(d) * DAY); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); },
    lat: function (v) { return Math.abs(v).toFixed(2) + '° ' + (v >= 0 ? 'N' : 'S'); },
    lon: function (v) { return Math.abs(v).toFixed(2) + '° ' + (v >= 0 ? 'E' : 'W'); },
    deg: function (v) { return v.toFixed(0) + '°'; },
    km: function (v) { return Math.round(v).toLocaleString('en-US') + ' km'; },
    times: function (v) { return '×' + v.toFixed(2); },
    x: function (v) { return '×' + Math.round(v); },
    shape: function (v) { return v.toFixed(2) + (v < 0.95 ? ' flat' : v > 1.05 ? ' tall' : ' round'); }
  };
  var PARSE = {
    hours: function (s) {
      var m = s.trim().match(/^(\d{1,2})(?:[:h.](\d{1,2}))?\s*(?:utc)?$/i);
      if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return NaN;
      return +m[1] + (+(m[2] || 0)) / 60;
    },
    day: function (s) {
      var m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!m) return NaN;
      var t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      // Reject dates like 2026-02-31 instead of letting them roll into the next month.
      if (t.getUTCMonth() !== +m[2] - 1 || t.getUTCDate() !== +m[3]) return NaN;
      return Math.round((t.getTime() - EPOCH) / DAY);
    },
    lat: function (s) { var v = parseFloat(s); return /s/i.test(s) ? -Math.abs(v) : v; },
    lon: function (s) { var v = parseFloat(s); return /w/i.test(s) ? -Math.abs(v) : v; },
    num: function (s) { return parseFloat(String(s).replace(/[^\d.+\-eE]/g, '')); }
  };

  var SLIDERS = [
    { group: 'time', key: 'Time', label: 'Time (UTC)', min: 0, max: 24, step: 0.01, fmt: 'hours', parse: 'hours', tone: 'ink' },
    { group: 'time', key: 'DayOfYear', label: 'Date (2025–2030)', min: FE.Geo.DAY_MIN, max: FE.Geo.DAY_MAX, step: 1, fmt: 'day', parse: 'day', tone: 'ink' },
    { group: 'place', key: 'ObserverLat', label: 'Latitude', min: -90, max: 90, step: 0.01, fmt: 'lat', parse: 'lat', tone: 'obs' },
    { group: 'place', key: 'ObserverLong', label: 'Longitude', min: -180, max: 180, step: 0.01, fmt: 'lon', parse: 'lon', tone: 'obs' },
    { group: 'camera', key: 'CameraDirection', label: 'Camera direction', min: -180, max: 180, step: 1, fmt: 'deg', tone: 'cam', wrap: true },
    { group: 'camera', key: 'CameraHeight', label: 'Camera height', min: 0, max: 89.9, step: 0.5, fmt: 'deg', tone: 'cam' },
    { group: 'camera', key: 'Zoom', label: 'Zoom', min: 1, max: 10, step: 0.01, fmt: 'times', tone: 'zoom' },
    { group: 'dome', key: 'DomeHeight', label: 'Dome height', min: 2000, max: 20015, step: 100, fmt: 'km', tone: 'dome' },
    { group: 'dome', key: 'DomeSize', label: 'Dome width', min: 1, max: 5, step: 0.05, fmt: 'times', tone: 'dome' },
    { group: 'dome', key: 'DomeShape', label: 'Dome shape (flat top ↔ pointed)', min: 0.3, max: 3, step: 0.05, fmt: 'shape', tone: 'dome' },
    { group: 'dome', key: 'RayParameter', label: 'Ray bend', min: 0.5, max: 2, step: 0.05, fmt: 'times', tone: 'ray' },
    // Moving a height slider takes the Sun or Moon off the dome (unset).
    { group: 'sun', key: 'SunHeight', label: 'Sun height above the map', min: 100, max: 20000, step: 50, fmt: 'km', tone: 'zoom', unset: 'SunOnDome' },
    { group: 'sun', key: 'SunSize', label: 'Sun diameter', min: 1, max: 5000, step: 1, fmt: 'km', tone: 'zoom' },
    { group: 'moon', key: 'MoonHeight', label: 'Moon height above the map', min: 100, max: 20000, step: 50, fmt: 'km', tone: 'ink', unset: 'MoonOnDome' },
    { group: 'moon', key: 'MoonSize', label: 'Moon diameter', min: 1, max: 5000, step: 1, fmt: 'km', tone: 'ink' },
    { group: 'terrain', key: 'ReliefScale', label: 'Land height exaggeration', min: 1, max: 60, step: 1, fmt: 'x', tone: 'obs' },
    { group: 'terrain', key: 'IceWall', label: 'Antarctic ice wall height', min: 0, max: 2000, step: 10, fmt: 'km', tone: 'dome' }
  ];

  var CHECKS = [
    { key: 'ShowRelief', label: 'Terrain and ice wall' }, { key: 'ShowShadow', label: 'Night shadow' }, { key: 'ShowFeGrid', label: 'Map grid' },
    { key: 'ShowDomeGrid', label: 'Dome grid' }, { key: 'ShowSunTrack', label: 'Sun track' },
    { key: 'ShowMoonTrack', label: 'Moon track' }, { key: 'ShowEclipse', label: 'Eclipse shadows' }, { key: 'ShowRealStars', label: 'Stars' },
    { key: 'ShowConstellations', label: 'Constellations' }, { key: 'ShowPlanets', label: 'Planets' },
    { key: 'ShowSphere', label: 'Observer’s sky dome', observerOnly: true },
    { key: 'ShowDomeRays', label: 'Bent rays', observerOnly: true },
    { key: 'ShowSphereRays', label: 'Straight rays', observerOnly: true },
    { key: 'ShowStars', label: 'Star-grid rays', observerOnly: true },
    { key: 'ShowManyRays', label: 'More rays', many: true },
    { key: 'SkyLabels', label: 'Names (sky view)' }, { key: 'SkyDomeGhost', label: 'Dome positions (sky view)' },
    { key: 'ShowAnalemma', label: 'Analemma (Sun at this time, all year)' },
    { key: 'SunOnDome', label: 'Sun rides on the dome', group: 'sunchk' },
    { key: 'MoonOnDome', label: 'Moon rides on the dome', group: 'moonchk' },
    { key: 'SkyGrid', label: 'Alt-az grid (sky view)' }, { key: 'ShowSkyDaylight', label: 'Stars by day (sky view)' }
  ];

  var PLACES = [
    ['North Pole', 90, 0], ['Reykjavik', 64.15, -21.94], ['London', 51.51, -0.13], ['Moscow', 55.76, 37.62],
    ['New York', 40.71, -74.01], ['Los Angeles', 34.05, -118.24], ['Tokyo', 35.68, 139.69], ['Cairo', 30.04, 31.24],
    ['Mumbai', 19.08, 72.88], ['Mexico City', 19.43, -99.13], ['Lagos', 6.52, 3.38], ['Singapore', 1.35, 103.82],
    ['Quito (equator)', -0.18, -78.47], ['Nairobi', -1.29, 36.82], ['Jakarta', -6.21, 106.85], ['Rio de Janeiro', -22.91, -43.17],
    ['Johannesburg', -26.2, 28.05], ['Sydney', -33.87, 151.21], ['Santiago', -33.45, -70.67], ['Cape Town', -33.92, 18.42],
    ['Buenos Aires', -34.6, -58.38], ['Auckland', -36.85, 174.76], ['Ushuaia', -54.8, -68.3], ['South Pole', -90, 0]
  ];

  function App() {
    var self = this;
    this.model = new FE.Model();
    this.root = $('#app');
    this.stage = $('#stage');
    this.canvas = $('#view');
    try {
      this.scene = new FE.Scene(this.canvas, this.model);
    } catch (err) {
      var box = $('#gl-error');
      box.hidden = false;
      box.textContent = 'This page needs WebGL, which this browser could not start. Try another browser, or turn on hardware acceleration in its settings.';
      throw err;
    }
    this.hud = new FE.HUD(this.stage, this.scene);
    this.sky = new FE.SkyView($('#tab-sky'), this);
    this.player = new FE.DemoPlayer(this.model, { onChange: function () { self.syncDemo(); } });
    this.dirty = true;
    this.model.onChange(function () { self.dirty = true; self.uiDirty = true; self.saveSoon(); });

    this.buildPanel();
    this.buildControls();
    this.buildDemos();
    this.vpc = new FE.ViewportControls(this);
    this.bindPointer();
    this.bindShare();
    this.buildRecording();
    this.fillAbout();
    this.restoreInitial();
    this.syncDemo();

    window.addEventListener('resize', function () { self.dirty = true; });
    if (window.ResizeObserver) new ResizeObserver(function () { self.dirty = true; }).observe(this.stage);
    window.addEventListener('hashchange', function () { self.readHash(); });
    requestAnimationFrame(function loop(ts) {
      if (!self.exporting) self.frame(ts);    // a video recorder may drive frames itself
      requestAnimationFrame(loop);
    });
  }

  /* One frame: advance animations, draw if anything changed. */
  App.prototype.frame = function (ts, force) {
    var animating = this.player.tick(ts);
    if (this.vpc.tick(ts)) animating = true;
    if (this.dirty || animating || force) {
      this.dirty = false;
      var d, s = this.model.s;
      // Show the right canvas before drawing; a hidden canvas would render at 1x1 px.
      if (this.vpc.syncedMode !== s.ViewMode) this.vpc.sync();
      if (s.ViewMode === 1) { d = this.scene.d = this.model.derive(); }   // 3D view hidden: skip the GPU work
      else d = this.scene.render();
      this.vpc.render(d);
      if (s.ViewMode === 1 && !this.vpc.eyeCv.clientWidth) this.dirty = true;
      this.hud.update(s, d);
      if (this.tab === 'sky' && this.panelOpen) this.sky.draw(d);
      this.lastD = d;
    }
    if (this.uiDirty) { this.uiDirty = false; this.syncControls(); }
  };

  App.prototype.viewAspect = function () {
    var w = this.stage.clientWidth, h = this.stage.clientHeight;
    return w > 0 && h > 0 ? w / h : 1.6;
  };

  /* The user takes over: leave any running demo. */
  App.prototype.userEdit = function () {
    if (this.player.name) this.player.detach();
    else if (this.model.s.Description || this.model.s.Pointer || this.model.s.Card || this.model.s.Route) this.model.clearDescription();
  };

  App.prototype.setNow = function () {
    this.userEdit();
    var now = (Date.now() - EPOCH) / DAY;
    this.model.set('DateTime', now);
    var note = $('#here-note');
    if (now < FE.Geo.DAY_MIN || now >= FE.Geo.DAY_MAX + 1) note.textContent = 'Today is outside 2025–2030, so the nearest date in range is shown.';
  };

  /* ---------------- panel: bottom sheet / side panel ---------------- */
  App.prototype.buildPanel = function () {
    var self = this, toggle = $('#panel-toggle');
    this.panelOpen = false; this.tab = 'controls';
    toggle.addEventListener('click', function () { self.openPanel(!self.panelOpen); });
    $('#sheet-close').addEventListener('click', function () { self.openPanel(false); });
    $$('[data-open-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.dataset.openTab;
        if (self.panelOpen && self.tab === t && !WIDE.matches) self.openPanel(false);
        else { self.selectTab(t); self.openPanel(true); }
      });
    });
    var tabs = $$('[role=tab]');
    tabs.forEach(function (b, i) {
      b.addEventListener('click', function () { self.selectTab(b.dataset.tab); });
      b.addEventListener('keydown', function (e) {
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -2;
        if (j === -2) return;
        e.preventDefault();
        var nb = tabs[(j + tabs.length) % tabs.length];
        self.selectTab(nb.dataset.tab); nb.focus();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && self.panelOpen && !WIDE.matches && !/SELECT/.test(e.target.tagName)) self.openPanel(false);
    });

    // Grab handle: tap toggles a taller sheet; drag up for tall, down to shrink or close.
    var grab = $('#sheet-grab'), y0 = null, dragged = false;
    grab.addEventListener('pointerdown', function (e) { y0 = e.clientY; dragged = false; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', function (e) { if (y0 !== null && Math.abs(e.clientY - y0) > 8) dragged = true; });
    grab.addEventListener('pointerup', function (e) {
      if (y0 === null) return;
      var dy = e.clientY - y0; y0 = null;
      var tall = self.root.classList.contains('panel-tall');
      if (!dragged) self.setTall(!tall);
      else if (dy < -30) self.setTall(true);
      else if (dy > 30) { if (tall) self.setTall(false); else self.openPanel(false); }
    });
    grab.addEventListener('pointercancel', function () { y0 = null; });
    grab.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') { e.preventDefault(); self.setTall(true); }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (self.root.classList.contains('panel-tall')) self.setTall(false); else self.openPanel(false); }
    });

    if (WIDE.matches) this.openPanel(true);
  };
  App.prototype.setTall = function (on) {
    this.root.classList.toggle('panel-tall', on);
    this.dirty = true;
  };
  App.prototype.openPanel = function (on) {
    this.panelOpen = on;
    this.root.classList.toggle('panel-open', on);
    if (!on) this.root.classList.remove('panel-tall');
    var t = $('#panel-toggle');
    t.setAttribute('aria-expanded', on ? 'true' : 'false');
    t.setAttribute('aria-label', on ? 'Hide controls' : 'Show controls');
    this.dirty = true;
  };
  App.prototype.selectTab = function (name) {
    this.tab = name;
    $$('[role=tab]').forEach(function (b) {
      var on = b.dataset.tab === name;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    $$('.tabpanel').forEach(function (p) { p.hidden = p.id !== 'tab-' + name; });
    $('.sheet-body').scrollTop = 0;
    this.dirty = true;
  };

  /* ---------------- controls ---------------- */
  App.prototype.buildControls = function () {
    var self = this, m = this.model;
    this.sliderEls = {};
    SLIDERS.forEach(function (sd) {
      var host = $('[data-group=' + sd.group + ']');
      var id = 'ctl-' + sd.key;
      var range = el('input', { type: 'range', id: id, min: sd.min, max: sd.max, step: sd.step });
      var text = el('input', { type: 'text', id: id + '-text', class: 'num', spellcheck: 'false', autocomplete: 'off',
        inputmode: sd.parse === 'hours' || sd.parse === 'day' ? 'text' : 'decimal', 'aria-label': sd.label + ', typed value' });
      host.appendChild(el('div', { class: 'slider tone-' + sd.tone }, [
        el('label', { for: id }, [el('span', { class: 'dot', 'aria-hidden': 'true' }), sd.label]), range, text
      ]));
      function setVal(v) {
        var o = {}; o[sd.key] = v;
        if (sd.unset) o[sd.unset] = false;
        m.setMany(o);
      }
      range.addEventListener('input', function () { self.userEdit(); setVal(+range.value); });
      function commit() {
        var v = (PARSE[sd.parse] || PARSE.num)(text.value);
        if (isFinite(v)) { self.userEdit(); setVal(v); }
        self.uiDirty = true;
      }
      text.addEventListener('change', commit);
      text.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); text.blur(); } /* blur fires 'change', which commits once */ });
      self.sliderEls[sd.key] = { range: range, text: text, def: sd, row: host.lastElementChild };
    });

    var showHost = $('[data-group=show]');
    this.checkEls = {};
    CHECKS.forEach(function (cd) {
      var id = 'chk-' + cd.key, input = el('input', { type: 'checkbox', id: id });
      var lab = el('label', { class: 'check', for: id }, [input, el('span', { text: cd.label })]);
      (cd.group ? $('[data-group=' + cd.group + ']') : showHost).appendChild(lab);
      input.addEventListener('change', function () { self.userEdit(); m.set(cd.key, input.checked); });
      self.checkEls[cd.key] = { input: input, label: lab, def: cd };
    });

    this.radioEls = $$('input[type=radio][data-key]');
    this.radioEls.forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) { self.userEdit(); m.set(r.dataset.key, +r.value); } });
    });

    // Places
    var place = $('#place');
    PLACES.forEach(function (p, i) { place.appendChild(el('option', { value: String(i), text: p[0] })); });
    place.addEventListener('change', function () {
      var p = PLACES[+place.value]; if (!p || place.value === '') return;
      self.userEdit(); m.setMany({ ObserverLat: p[1], ObserverLong: p[2] });
      $('#here-note').textContent = 'Observer moved to ' + p[0] + '.';
    });
    $('#btn-now').addEventListener('click', function () { self.setNow(); });
    this.bindLocation();
    this.syncControls();
  };

  /* "Use my location": read once, rounded to about 10 km, kept on this device only. */
  App.prototype.bindLocation = function () {
    var self = this, btn = $('#btn-here'), note = $('#here-note');
    if (!('geolocation' in navigator) || !window.isSecureContext) { btn.disabled = true; note.textContent = 'Location is not available in this browser.'; return; }
    btn.addEventListener('click', function () {
      btn.disabled = true; note.textContent = 'Asking for your location…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        btn.disabled = false;
        var lat = Math.round(pos.coords.latitude * 10) / 10, lon = Math.round(pos.coords.longitude * 10) / 10;
        if (!isFinite(lat) || !isFinite(lon)) { note.textContent = 'Could not read a location.'; return; }
        self.userEdit();
        self.model.setMany({ ObserverLat: lat, ObserverLong: lon });
        note.textContent = 'Observer moved to your area (rounded to about 10 km). It stays on this device; a shared link would include it.';
      }, function (err) {
        btn.disabled = false;
        note.textContent = err && err.code === 1 ? 'Location permission was declined. Pick a place instead.' : 'Could not get your location. Pick a place instead.';
      }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    });
  };

  App.prototype.syncControls = function () {
    var m = this.model, s = m.s, active = document.activeElement;
    for (var k in this.sliderEls) {
      var e = this.sliderEls[k], v = m.get(k), sd = e.def;
      var shown = sd.wrap ? U.wrap180(v) : (k === 'Time' ? U.wrap(v, 24) : v);
      if (active !== e.range) e.range.value = shown;
      if (active !== e.text) e.text.value = FMT[sd.fmt](shown);
      if (sd.unset && e.row) e.row.classList.toggle('dim', !!s[sd.unset]);   // height is unused while on the dome
    }
    var obs = s.RayTarget === 0, many = (s.ShowStars && s.ShowDomeRays) || s.RayTarget === 1;
    for (var c in this.checkEls) {
      var ce = this.checkEls[c], enabled = ce.def.observerOnly ? obs : ce.def.many ? many : true;
      ce.input.checked = !!s[c]; ce.input.disabled = !enabled;
      ce.label.classList.toggle('off', !enabled);
    }
    this.radioEls.forEach(function (r) {
      r.checked = +r.value === s[r.dataset.key];
      if (r.dataset.key === 'RaySource') { r.disabled = obs; r.parentNode.classList.toggle('off', obs); }
    });
    var place = $('#place'), match = '';
    PLACES.forEach(function (p, i) {
      if (Math.abs(p[1] - s.ObserverLat) < 0.01 && (Math.abs(p[1]) === 90 || Math.abs(U.wrap180(p[2] - s.ObserverLong)) < 0.01)) match = String(i);
    });
    if (active !== place) {
      place.value = match;
      place.options[0].textContent = match ? 'Choose a place…' : 'Custom position';
    }
    if (this.vpc) this.vpc.sync();
  };

  /* ---------------- demos ---------------- */
  function mmss(ms) { var t = Math.round(ms / 1000); return Math.floor(t / 60) + ':' + pad(t % 60); }

  App.prototype.buildDemos = function () {
    var self = this, p = this.player, host = $('#demo-list');
    this.demoBtns = {};
    p.names().forEach(function (n, i) {
      var b = el('button', { type: 'button', class: 'demo-item', 'data-demo': n, 'aria-pressed': 'false' }, [
        el('span', { class: 'demo-num', text: pad(i + 1), 'aria-hidden': 'true' }),
        el('span', { class: 'demo-title', text: p.label(n) }),
        el('span', { class: 'demo-len', text: mmss(p.duration(n)), 'aria-label': 'length ' + mmss(p.duration(n)) }),
        el('span', { class: 'demo-desc', text: p.desc(n) })
      ]);
      b.addEventListener('click', function () { self.startDemo(n); });
      var rec = el('button', { type: 'button', class: 'demo-rec', title: 'Record this demo with every control hidden',
        'aria-label': 'Record ' + p.label(n) + ' with controls hidden' }, [
        el('span', { class: 'rec-dot', 'aria-hidden': 'true' }), el('span', { text: 'Rec' })
      ]);
      rec.addEventListener('click', function () { self.startRecording(n); });
      host.appendChild(el('li', { class: 'demo-row' }, [b, rec]));
      self.demoBtns[n] = b;
    });
    $('#btn-exit').addEventListener('click', function () { p.detach(); });
    $('#btn-prev').addEventListener('click', function () { p.prev(); });
    $('#btn-play').addEventListener('click', function () { p.toggle(); });
    $('#btn-next').addEventListener('click', function () { p.next(); });
    $('#speed').addEventListener('change', function (e) { p.speed = U.clamp(+e.target.value || 1, 0.25, 4); });
  };
  App.prototype.startDemo = function (name) {
    if (!this.player.demos[name]) return;
    this.vpc.toggleLapse(false);
    this.player.name = null;
    this.player.start(name);
    if (!WIDE.matches) this.openPanel(false);   // phones: give the demo the whole screen
  };
  App.prototype.syncDemo = function () {
    var p = this.player, on = !!p.name;
    for (var n in this.demoBtns) {
      this.demoBtns[n].classList.toggle('active', p.name === n);
      this.demoBtns[n].setAttribute('aria-pressed', p.name === n ? 'true' : 'false');
    }
    $('#demo-bar').hidden = !on;
    $('#time-row').hidden = on;
    if (on) {
      var play = $('#btn-play');
      play.textContent = p.playing ? '❚❚' : '▶';
      play.setAttribute('aria-label', p.playing ? 'Pause' : (p.atEnd() ? 'Play again' : 'Play'));
      play.classList.toggle('on', p.playing);
      $('#db-name').textContent = p.label(p.name);
      $('#db-step').textContent = p.atEnd() ? 'Finished' : 'Step ' + (p.pos + 1) + ' of ' + (p.count() - 1);
      $('#btn-prev').disabled = p.pos === 0 && !p.playing;
      $('#btn-next').disabled = p.atEnd();
    }
    if (this.vpc) { this.vpc.showHint(); this.vpc.sync(); }
    this.dirty = true;
  };

  /* ---------------- pointer / touch input on the 3D views ---------------- */
  App.prototype.bindPointer = function () {
    var self = this, m = this.model, c = this.canvas, pts = {}, pinch0 = 0, zoom0 = 1;
    function zoomKey() { return m.s.ViewMode === 2 ? 'GlobeZoom' : 'Zoom'; }
    c.addEventListener('pointerdown', function (e) {
      c.setPointerCapture(e.pointerId);
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = m.s[zoomKey()];
      }
    });
    c.addEventListener('pointermove', function (e) {
      var p = pts[e.pointerId];
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      var ids = Object.keys(pts);
      self.userEdit(); self.vpc.anim = null;
      if (ids.length >= 2) {
        var a = pts[ids[0]], b = pts[ids[1]], dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) m.set(zoomKey(), zoom0 * dist / pinch0);
        return;
      }
      var W = c.clientWidth || 1, H = c.clientHeight || 1;
      if (m.s.ViewMode === 2) {
        var k = 180 / Math.min(W, H) / Math.sqrt(m.s.GlobeZoom);
        m.setMany({ GlobeAz: U.wrap180(m.s.GlobeAz - dx * k), GlobeEl: m.s.GlobeEl + dy * k });
      } else if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) {
        // Move the observer across the map.
        m.setMany({ ObserverLat: m.s.ObserverLat - dy / H * 150, ObserverLong: U.wrap180(m.s.ObserverLong + dx / W * 300) });
      } else {
        m.setMany({ CameraDirection: U.wrap180(m.s.CameraDirection - dx / W * 200), CameraHeight: m.s.CameraHeight + dy / H * 120 });
      }
    });
    function up(e) { delete pts[e.pointerId]; pinch0 = 0; }
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', function (e) {
      e.preventDefault(); self.userEdit(); self.vpc.anim = null;
      var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1, key = zoomKey();
      m.set(key, m.s[key] * Math.pow(1.0015, -e.deltaY * unit));
    }, { passive: false });
    c.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var s = m.s, step = e.shiftKey ? 10 : 3, used = true, globe = s.ViewMode === 2;
      if (e.key === 'ArrowLeft') m.set(globe ? 'GlobeAz' : 'CameraDirection', U.wrap180((globe ? s.GlobeAz : s.CameraDirection) + step));
      else if (e.key === 'ArrowRight') m.set(globe ? 'GlobeAz' : 'CameraDirection', U.wrap180((globe ? s.GlobeAz : s.CameraDirection) - step));
      else if (e.key === 'ArrowUp') m.set(globe ? 'GlobeEl' : 'CameraHeight', (globe ? s.GlobeEl : s.CameraHeight) + step);
      else if (e.key === 'ArrowDown') m.set(globe ? 'GlobeEl' : 'CameraHeight', (globe ? s.GlobeEl : s.CameraHeight) - step);
      else if (e.key === '+' || e.key === '=') self.vpc.command('zoom-in');
      else if (e.key === '-') self.vpc.command('zoom-out');
      else if (e.key === ' ') self.vpc.toggleLapse();
      else used = false;
      if (used) { e.preventDefault(); self.userEdit(); }
    });
  };

  /* ---------------- share links ----------------
   * #v=<base64url JSON of the settings that differ from the defaults>
   * #demo=<name> starts a demo. */
  function b64url(str) { return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64url(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return atob(str); }

  App.prototype.shareState = function () {
    var snap = this.model.snapshot(), F = FE.Model.FIELDS, o = {};
    for (var k in snap) {
      var f = F[k], v = snap[k];
      if (f.demoOnly || f.type === 'str') continue;
      if (typeof v === 'number') v = Math.round(v * 1e5) / 1e5;
      if (v !== f.def) o[k] = v;
    }
    return o;
  };
  App.prototype.shareUrl = function () {
    // A file:// link only works on this computer and would expose a local folder path.
    if (location.protocol === 'file:') return '';
    var base = location.href.split('#')[0];
    return base + '#v=' + b64url(JSON.stringify(this.shareState()));
  };
  App.prototype.bindShare = function () {
    var self = this, out = $('#share-url'), note = $('#share-note');
    $('#btn-share').addEventListener('click', function () {
      var url = self.shareUrl();
      if (!url) { out.hidden = true; note.textContent = 'Links can only be shared from the hosted site, not from a file opened on this computer.'; return; }
      out.value = url; out.hidden = false;
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        navigator.share({ title: CONFIG.name || document.title, url: url }).then(function () { note.textContent = ''; },
          function () { note.textContent = 'You can also copy the link above.'; });
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { note.textContent = 'Link copied.'; },
          function () { out.select(); note.textContent = 'Select the link above and copy it.'; });
      } else { out.select(); note.textContent = 'Select the link above and copy it.'; }
    });
    out.addEventListener('focus', function () { out.select(); });
    $('#btn-reset').addEventListener('click', function () {
      self.player.detach(); self.vpc.toggleLapse(false);
      self.model.reset();
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* storage unavailable */ }
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      note.textContent = 'Everything is back to the start.';
    });
  };

  /* ---------------- clean view for screen recording ----------------
   * Hides every control so a screen recording shows only the model (plus, if chosen,
   * demo captions and the date / Moon-phase readout). Demo cards and pointer labels stay,
   * since they are part of the demo. The view still responds to drag and pinch.
   * Ways in:  "Hide everything" in Controls, "Rec" next to a demo, the H key,
   *           or a link ending in #rec=<demo>[,cap].
   * Ways out: Esc or H, or press and hold anywhere on the view for about a second. */
  var REC_KEY = 'dome-model-rec-v1';

  App.prototype.buildRecording = function () {
    var self = this, root = this.root, stage = this.stage;
    this.recOpts = { captions: false, info: false };
    try {
      var saved = JSON.parse(localStorage.getItem(REC_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        this.recOpts.captions = saved.captions === true;
        this.recOpts.info = saved.info === true;
      }
    } catch (e) { /* storage unavailable */ }
    var cap = $('#rec-captions'), info = $('#rec-info');
    cap.checked = this.recOpts.captions; info.checked = this.recOpts.info;
    function saveOpts() {
      self.recOpts.captions = cap.checked; self.recOpts.info = info.checked;
      try { localStorage.setItem(REC_KEY, JSON.stringify(self.recOpts)); } catch (e) { /* storage unavailable */ }
    }
    cap.addEventListener('change', saveOpts); info.addEventListener('change', saveOpts);
    $('#btn-clean').addEventListener('click', function () { self.setClean(true); });

    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      var on = root.classList.contains('rec');
      if (e.key === 'Escape' && on) { e.preventDefault(); self.setClean(false); }
      else if (e.key === 'h' || e.key === 'H') { e.preventDefault(); self.setClean(!on); }
    });

    // Press and hold (no drag) anywhere on the view to bring the controls back. While a
    // finger is held still, its small jitters are kept from the 3D view so they don't
    // count as a drag (which would stop a running demo). A real drag still orbits.
    var hold = null, HOLD_MS = 900, SLOP = 12;
    function cancel() { if (hold) { clearTimeout(hold.timer); hold = null; } }
    stage.addEventListener('pointerdown', function (e) {
      if (!root.classList.contains('rec')) return;
      if (hold) { cancel(); return; }                          // second finger: a pinch, not a hold
      if (e.button > 0 || (e.target.closest && e.target.closest('#rec-start'))) return;
      hold = { id: e.pointerId, x: e.clientX, y: e.clientY, still: true,
        timer: setTimeout(function () { hold = null; self.setClean(false); }, HOLD_MS) };
    }, true);
    stage.addEventListener('pointermove', function (e) {
      if (!hold || e.pointerId !== hold.id || !hold.still) return;
      if (Math.abs(e.clientX - hold.x) + Math.abs(e.clientY - hold.y) > SLOP) { hold.still = false; clearTimeout(hold.timer); return; }
      e.stopPropagation();
    }, true);
    stage.addEventListener('pointerup', function (e) { if (hold && e.pointerId === hold.id) cancel(); }, true);
    stage.addEventListener('pointercancel', function (e) { if (hold && e.pointerId === hold.id) cancel(); }, true);
    stage.addEventListener('contextmenu', function (e) { if (root.classList.contains('rec')) e.preventDefault(); });
  };

  /* Turn the clean view on or off. opts overrides the saved choices ({captions, info}). */
  App.prototype.setClean = function (on, opts) {
    var root = this.root, o = opts || this.recOpts;
    var b = document.getElementById('rec-start'); if (b) b.remove();
    clearTimeout(this.recToastTimer);
    var t = document.getElementById('rec-toast'); if (t) t.remove();
    if (on) {
      this.openPanel(false);
      root.classList.add('rec');
      root.classList.toggle('rec-cap', !!o.captions);
      root.classList.toggle('rec-info', !!o.info);
      // Cards are always shown in full: their Hide button is gone in this view.
      this.hud.cardCollapsed = false; this.hud.applyCardFold();
      this.toastClean();
    } else {
      root.classList.remove('rec', 'rec-cap', 'rec-info');
      if (/^#rec=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    }
    this.dirty = true;
  };

  /* A short note on how to leave; it fades before most recordings start. */
  App.prototype.toastClean = function () {
    var touch = matchMedia('(pointer: coarse)').matches;
    var t = el('div', { id: 'rec-toast', class: 'rec-toast', role: 'status',
      text: touch ? 'Controls hidden · hold anywhere to bring them back' : 'Controls hidden · press Esc or H, or hold anywhere, to bring them back' });
    this.stage.appendChild(t);
    this.recToastTimer = setTimeout(function () {
      t.classList.add('gone');
      setTimeout(function () { t.remove(); }, 400);
    }, 2200);
  };

  /* Record one demo: clean view, the demo waits on its first frame until the person
     taps the overlay (start the screen recorder first), then plays from the start. */
  App.prototype.startRecording = function (name, captions) {
    var self = this, p = this.player;
    if (!p.demos[name]) return;
    this.vpc.toggleLapse(false);
    var o = { captions: captions === undefined ? this.recOpts.captions : !!captions, info: this.recOpts.info };
    this.setClean(true, o);
    var t = document.getElementById('rec-toast'); if (t) t.remove();   // the overlay says it instead
    clearTimeout(this.recToastTimer);
    p.name = name; p.goTo(0, false);
    var touch = matchMedia('(pointer: coarse)').matches;
    var go = el('button', { type: 'button', id: 'rec-start', class: 'rec-start' }, [
      el('span', { class: 'rec-start-title', text: 'Ready to record' }),
      el('span', { class: 'rec-start-demo', text: p.label(name) }),
      el('span', { text: touch
        ? 'Start your screen recorder, then tap here. Afterwards, hold anywhere for a second to bring the controls back.'
        : 'Start your screen recorder, then click here or press Space. Esc or H brings the controls back.' })
    ]);
    function begin(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      document.removeEventListener('keydown', onKey, true);
      go.remove();
      setTimeout(function () { if (p.name === name) p.goTo(0, true); }, 700);   // a short still frame to trim on
    }
    function onKey(e) {
      if (!document.getElementById('rec-start')) { document.removeEventListener('keydown', onKey, true); return; }
      if (e.key === ' ' || e.key === 'Enter') begin(e);
    }
    go.addEventListener('click', begin);
    document.addEventListener('keydown', onKey, true);
    this.stage.appendChild(go);
    go.focus({ preventScroll: true });
    this.dirty = true;
  };

  /* Returns true if the hash set the view. */
  App.prototype.readHash = function () {
    var hash = (location.hash || '').slice(1);
    if (!hash || hash.length > 4000) return false;
    var mt;
    if ((mt = hash.match(/^rec=([A-Za-z]{1,20})(,cap)?$/))) {
      if (Object.prototype.hasOwnProperty.call(this.player.demos, mt[1])) { this.startRecording(mt[1], !!mt[2]); return true; }
      return false;
    }
    if ((mt = hash.match(/^demo=([A-Za-z]{1,20})$/)) || (mt = hash.match(/^([A-Za-z]{1,20})$/))) {
      if (Object.prototype.hasOwnProperty.call(this.player.demos, mt[1])) { this.startDemo(mt[1]); return true; }
      return false;
    }
    if ((mt = hash.match(/^v=([A-Za-z0-9_-]+)$/))) {
      try {
        var obj = JSON.parse(unb64url(mt[1]));
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
        this.player.detach();
        this.model.restore(obj);        // untrusted: type-checked and clamped
        return true;
      } catch (e) { return false; }
    }
    return false;
  };

  /* ---------------- remembering the last view (this browser only) ---------------- */
  App.prototype.saveSoon = function () {
    var self = this;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(function () {
      if (self.player.name) return;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(self.shareState())); } catch (e) { /* storage unavailable */ }
    }, 800);
  };
  App.prototype.restoreInitial = function () {
    if (this.readHash()) return;
    // A copy of the site can open straight into one demo (config.js: startDemo).
    var first = FE.CONFIG && FE.CONFIG.startDemo, app = this;
    if (first && Object.prototype.hasOwnProperty.call(this.player.demos, first)) {
      setTimeout(function () { app.startDemo(first); }, 600); return;
    }
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw && raw.length < 8000) {
        var saved = JSON.parse(raw);
        // Views saved before New York became the default still sit at the old default spot
        // (equator, 15° E); move those to New York, but keep any place a person chose.
        if (saved && saved.ObserverLat === 0 && saved.ObserverLong === 15) {
          var F = FE.Model.FIELDS;
          saved.ObserverLat = F.ObserverLat.def; saved.ObserverLong = F.ObserverLong.def;
          if (saved.CameraDirection === 30) saved.CameraDirection = F.CameraDirection.def;
          if (saved.GlobeAz === 0) { saved.GlobeAz = F.GlobeAz.def; saved.GlobeEl = F.GlobeEl.def; }
        }
        this.model.restore(saved);
      }
    } catch (e) { /* ignore */ }
  };

  /* ---------------- about tab ---------------- */
  App.prototype.fillAbout = function () {
    var link = $('#source-link'), url = String(CONFIG.sourceUrl || '');
    if (/^https:\/\/[^\s"'<>]+$/.test(url)) link.href = url;
    else link.parentNode.textContent = 'Free to use, study, change and share under the MIT license.';
    $('#version-note').textContent = (CONFIG.name || 'Geocentric Model') + ' ' + (CONFIG.version || '');
  };

  FE.App = App;
  FE.PLACES = PLACES;

  function boot() {
    try { FE.app = new App(); } catch (err) { if (window.console) console.error(err); }
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
