/* viewport.js — everything that sits on the view itself:
 *   - the three views: Dome (0), Globe (2) and Sky view (1); V cycles through them;
 *   - the time bar: time-lapse, hour steps, time scrubber, date, now;
 *   - the camera cluster: zoom plus preset views, all animated;
 *   - look-around input for the sky view: drag or scroll to turn east/west, drag
 *     up/down to tilt, pinch or Ctrl+scroll to zoom, arrow keys, edge buttons;
 *   - a picture-in-picture of the sky view while the 3D views are shown;
 *   - short usage hints that follow the view and the input device. */
var FE = window.FE = window.FE || {};

(function () {
  var U = FE.U, SU = FE.SkyUtil, EPOCH = Date.UTC(2017, 0, 1), DAY = 86400000;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayToISO(d) { var t = new Date(EPOCH + Math.floor(d) * DAY); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }

  var TOUCH = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  var HINTS = TOUCH ? {
    0: 'Drag to turn · Pinch to zoom · Tap Sky view to stand at the marker',
    1: 'Swipe sideways to turn east or west · Swipe up or down to tilt · Pinch to zoom',
    2: 'Drag to spin the globe · Pinch to zoom'
  } : {
    0: 'Drag to orbit · Shift-drag moves the observer · Scroll to zoom · V switches view',
    1: 'Drag or scroll sideways to turn · Drag up/down to tilt · Ctrl+scroll to zoom · Arrow keys and N E S W work too',
    2: 'Drag to spin the globe · Scroll to zoom · V switches view'
  };
  var CYCLE = { 0: 2, 2: 1, 1: 0 };   // button order: Dome, Globe, Sky view

  function ViewportControls(app) {
    var self = this, m = app.model;
    this.app = app; this.m = m;
    this.bar = $('#vp-bar'); this.stage = app.stage;
    this.eyeCv = $('#eye'); this.pipCv = $('#pip canvas'); this.pip = $('#pip');
    this.tip = $('#eye-tip'); this.hint = $('#vp-hint');
    this.lapse = false; this.lastTs = 0; this.rate = 1 / 6; this.anim = null; this.pipHidden = false;
    app.eye = new FE.EyeView(this.eyeCv, app);

    /* views */
    $$('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { self.setMode(+b.dataset.mode); });
    });
    this.pip.addEventListener('click', function (e) {
      if (e.target.closest('.pip-close')) { self.pipHidden = true; self.sync(); return; }
      if (self.pipDragged) { self.pipDragged = false; return; }   // that was a drag, not a tap
      self.setMode(1);
    });
    this.bindPip();
    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === 'v' || e.key === 'V') self.setMode(CYCLE[m.s.ViewMode]);
    });

    /* time bar */
    $('#vp-lapse').addEventListener('click', function () { self.toggleLapse(); });
    $('#vp-rate').addEventListener('change', function (e) { self.rate = +e.target.value; });
    $$('[data-step]', this.bar).forEach(function (b) {
      b.addEventListener('click', function () { app.userEdit(); m.set('DateTime', m.s.DateTime + (+b.dataset.step) / 24); });
    });
    var time = $('#vp-time');
    time.addEventListener('input', function () { app.userEdit(); m.set('Time', +time.value); });
    var date = $('#vp-date');
    date.addEventListener('change', function () {
      var mt = date.value.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!mt) return;
      app.userEdit(); m.set('DayOfYear', Math.round((Date.UTC(+mt[1], +mt[2] - 1, +mt[3]) - EPOCH) / DAY));
    });
    $('#vp-now').addEventListener('click', function () { app.setNow(); });

    /* camera cluster and edge buttons */
    $$('[data-vp]').forEach(function (b) { b.addEventListener('click', function () { self.command(b.dataset.vp); }); });

    this.bindEye();

    var measure = function () {
      // space the bar takes from the bottom of the view, including its (safe-area) offset
      // A hidden bar (the clean view for recording) takes no space.
      var h = 0;
      if (self.bar.offsetHeight) {
        h = self.stage.clientHeight - self.bar.offsetTop;
        if (!(h > 0)) h = self.bar.offsetHeight + 8;
      }
      self.stage.style.setProperty('--bar-h', h + 'px');
      app.dirty = true;
    };
    if (window.ResizeObserver) new ResizeObserver(measure).observe(this.bar);
    window.addEventListener('resize', measure);
    measure();
    this.sync();
  }

  ViewportControls.prototype.setMode = function (mode) {
    var m = this.m;
    if (m.s.ViewMode === mode) return;
    if (this.app.player.name) this.app.player.detach();
    else this.app.userEdit();
    m.set('ViewMode', mode);
    this.sync();                 // show the right canvas before the next frame draws
    this.app.dirty = true;
    (mode === 1 ? this.eyeCv : this.app.canvas).focus({ preventScroll: true });
  };

  ViewportControls.prototype.showHint = function () {
    var h = this.hint;
    if (this.app.player.name) { h.textContent = ''; return; }
    h.textContent = HINTS[this.m.s.ViewMode] || '';
    h.classList.remove('faded');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(function () { h.classList.add('faded'); }, 6500);
  };

  ViewportControls.prototype.toggleLapse = function (on) {
    this.lapse = on === undefined ? !this.lapse : !!on; this.lastTs = 0;
    if (this.lapse) {
      this.app.userEdit();
      if (this.m.s.DateTime >= FE.Geo.DAY_MAX + 0.999) this.m.set('DateTime', FE.Geo.DAY_MIN);
    }
    this.sync();
  };

  /* Smoothly move model properties to target values. */
  ViewportControls.prototype.animateTo = function (to, ms) {
    var s = this.m.s, tasks = [];
    for (var k in to) {
      var target = to[k];
      if (k === 'CameraDirection' || k === 'SkyAz' || k === 'GlobeAz') target = s[k] + U.wrap180(target - s[k]);
      tasks.push({ prop: k, to: target, span: ms || 650 });
    }
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { this.m.setMany(to); return; }
    this.anim = { run: new FE.Timeline.Run(FE.Timeline.compile({ parallel: tasks }), this.m), t0: 0 };
  };

  ViewportControls.prototype.command = function (kind) {
    var s = this.m.s, d = this.app.scene && this.app.scene.d;
    this.app.userEdit();
    var mode = s.ViewMode;
    switch (kind) {
      case 'zoom-in':
        if (mode === 1) this.animateTo({ SkyFov: U.clamp(s.SkyFov / 1.3, 4, 120) }, 250);
        else if (mode === 2) this.animateTo({ GlobeZoom: U.clamp(s.GlobeZoom * 1.3, 0.6, 8) }, 250);
        else this.animateTo({ Zoom: U.clamp(s.Zoom * 1.3, 1, 10) }, 250);
        break;
      case 'zoom-out':
        if (mode === 1) this.animateTo({ SkyFov: U.clamp(s.SkyFov * 1.3, 4, 120) }, 250);
        else if (mode === 2) this.animateTo({ GlobeZoom: U.clamp(s.GlobeZoom / 1.3, 0.6, 8) }, 250);
        else this.animateTo({ Zoom: U.clamp(s.Zoom / 1.3, 1, 10) }, 250);
        break;
      case 'view-top': this.animateTo({ CameraHeight: 89.9, Zoom: 1.25 }); break;
      case 'view-side': this.animateTo({ CameraHeight: 8, Zoom: 1.4 }); break;
      case 'view-obs':
        if (mode === 2) this.animateTo({ GlobeAz: s.ObserverLong, GlobeEl: U.clamp(s.ObserverLat, -80, 80), GlobeZoom: 1.8 });
        else this.animateTo({ CameraHeight: 22, Zoom: 3.2, CameraDirection: s.ObserverLong });
        break;
      case 'face-sun': if (d) this.animateTo({ SkyAz: d.sunAzEl.az, SkyAlt: U.clamp(d.sunAzEl.el, -5, 80) }); break;
      case 'face-moon': if (d) this.animateTo({ SkyAz: d.moonAzEl.az, SkyAlt: U.clamp(d.moonAzEl.el, -5, 80) }); break;
      case 'level': this.animateTo({ SkyAlt: 15, SkyFov: 90 }); break;
      case 'turn-left': this.animateTo({ SkyAz: s.SkyAz - 45 }, 450); break;
      case 'turn-right': this.animateTo({ SkyAz: s.SkyAz + 45 }, 450); break;
      default:
        if (kind.indexOf('face-') === 0) this.animateTo({ SkyAz: +kind.slice(5) }, 500);
    }
  };

  /* Look-around on the sky-view inset too: drag or swipe sideways to turn, up/down to
     tilt, scroll to turn. A tap (no drag) still opens the full sky view. */
  ViewportControls.prototype.bindPip = function () {
    var self = this, m = this.m, app = this.app, btn = $('.pip-open', this.pip), cv = this.pipCv, drag = null;
    function degPerPx() { var w = Math.max(1, cv.clientWidth); return FE.EyeView.hfov(m.s, w / Math.max(1, cv.clientHeight)) / w; }
    btn.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      self.pipDragged = false;
    });
    btn.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 6) return;   // small jitter still counts as a tap
        drag.moved = true;
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      }
      drag.x = e.clientX; drag.y = e.clientY;
      app.userEdit(); self.anim = null;
      m.setMany({ SkyAz: m.s.SkyAz - dx * degPerPx(), SkyAlt: m.s.SkyAlt + dy * degPerPx() });   // "grab the sky", as in the full view
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) self.pipDragged = e.type === 'pointerup';   // swallow the click that follows a drag
      drag = null;
    }
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
    btn.addEventListener('wheel', function (e) {
      e.preventDefault(); app.userEdit(); self.anim = null;
      var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cv.clientWidth : 1;
      var delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
      m.set('SkyAz', m.s.SkyAz + delta * degPerPx() * 0.6);
    }, { passive: false });
  };

  /* Look-around input on the sky view. */
  ViewportControls.prototype.bindEye = function () {
    var self = this, m = this.m, cv = this.eyeCv, app = this.app, pts = {}, pinch0 = 0, fov0 = 90, moved = false;
    function degPerPx() { var w = Math.max(1, cv.clientWidth); return FE.EyeView.hfov(m.s, w / Math.max(1, cv.clientHeight)) / w; }
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = false;
      var ids = Object.keys(pts);
      if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = m.s.SkyFov; }
    });
    cv.addEventListener('pointermove', function (e) {
      var p = pts[e.pointerId];
      if (!p) { if (e.pointerType === 'mouse') self.hover(e); return; }
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      p.x = e.clientX; p.y = e.clientY;
      app.userEdit(); self.anim = null;
      var ids = Object.keys(pts);
      if (ids.length >= 2) {
        var a = pts[ids[0]], b = pts[ids[1]], dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0 && dist > 0) m.set('SkyFov', fov0 * pinch0 / dist);
        return;
      }
      // "Grab the sky": the scene follows the finger.
      m.setMany({ SkyAz: m.s.SkyAz - dx * degPerPx(), SkyAlt: m.s.SkyAlt + dy * degPerPx() });
      self.tip.hidden = true;
    });
    function up(e) {
      var p = pts[e.pointerId]; delete pts[e.pointerId]; pinch0 = 0;
      if (p && !moved && e.type === 'pointerup') self.hover(e, true);   // a tap names the object
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') self.tip.hidden = true; });
    cv.addEventListener('wheel', function (e) {
      e.preventDefault(); app.userEdit(); self.anim = null;
      var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cv.clientWidth : 1;
      if (e.ctrlKey || e.metaKey) {
        m.set('SkyFov', m.s.SkyFov * Math.pow(1.002, e.deltaY * unit));
      } else {
        // Sideways or vertical scrolling both turn the view: right/down turns clockwise (N > E > S > W).
        var delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
        m.set('SkyAz', m.s.SkyAz + delta * degPerPx() * 0.6);
      }
    }, { passive: false });
    // Keys work whenever focus is anywhere on the view (canvas, edge buttons, cluster).
    this.stage.addEventListener('keydown', function (e) {
      if (m.s.ViewMode !== 1 || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target.closest && e.target.closest('.vp-bar')) return;
      var s = m.s, big = e.shiftKey, used = true;
      switch (e.key) {
        case 'ArrowLeft': self.animateTo({ SkyAz: s.SkyAz - (big ? 45 : 10) }, 220); break;
        case 'ArrowRight': self.animateTo({ SkyAz: s.SkyAz + (big ? 45 : 10) }, 220); break;
        case 'ArrowUp': self.animateTo({ SkyAlt: U.clamp(s.SkyAlt + 5, -10, 85) }, 200); break;
        case 'ArrowDown': self.animateTo({ SkyAlt: U.clamp(s.SkyAlt - 5, -10, 85) }, 200); break;
        case '+': case '=': self.command('zoom-in'); break;
        case '-': self.command('zoom-out'); break;
        case 'n': case 'N': self.command('face-0'); break;
        case 'e': case 'E': self.command('face-90'); break;
        case 's': case 'S': self.command('face-180'); break;
        case 'w': case 'W': self.command('face-270'); break;
        case ' ': self.toggleLapse(); break;
        default: used = false;
      }
      if (used) { e.preventDefault(); app.userEdit(); }
    });
  };

  ViewportControls.prototype.hover = function (e, sticky) {
    var rect = this.eyeCv.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
    var hit = this.app.eye.pick(x, y);
    if (!hit) { this.tip.hidden = true; return; }
    var aa = SU.toAzAlt(hit.loc);
    this.tip.textContent = hit.name + (hit.mag !== undefined ? ' · mag ' + hit.mag.toFixed(1) : '') +
      ' · ' + aa.az.toFixed(0) + '° ' + SU.compass(aa.az) + ', ' + aa.alt.toFixed(0) + '° up';
    var sr = this.stage.getBoundingClientRect();
    this.tip.hidden = false;
    var w = this.tip.offsetWidth;
    this.tip.style.left = U.clamp(e.clientX - sr.left - w / 2, 8, Math.max(8, sr.width - w - 8)) + 'px';
    this.tip.style.top = Math.max(8, e.clientY - sr.top - 44) + 'px';
    if (sticky) { var t = this.tip; clearTimeout(this.tipTimer); this.tipTimer = setTimeout(function () { t.hidden = true; }, 2600); }
  };

  /* Advance time-lapse and animations; returns true while animating. */
  ViewportControls.prototype.tick = function (ts) {
    var active = false, m = this.m;
    if (this.app.player.playing && this.lapse) { this.lapse = false; this.sync(); }
    if (this.lapse) {
      if (!this.lastTs) this.lastTs = ts;
      var dt = Math.min(250, ts - this.lastTs); this.lastTs = ts;
      var next = m.s.DateTime + this.rate * dt / 1000 / 24;
      if (next >= FE.Geo.DAY_MAX + 0.999) { next = FE.Geo.DAY_MAX + 0.999; this.lapse = false; this.sync(); }
      m.set('DateTime', next);
      active = true;
    }
    if (this.anim) {
      if (!this.anim.t0) this.anim.t0 = ts;
      if (this.anim.run.seek(ts - this.anim.t0)) this.anim = null;
      m.touch();
      active = true;
    }
    return active;
  };

  /* Draw the sky view (full or inset) for the current frame. */
  ViewportControls.prototype.render = function (d) {
    if (this.m.s.ViewMode === 1) this.app.eye.draw(d, this.eyeCv, false);
    else if (!this.pip.hidden) this.app.eye.draw(d, this.pipCv, true);
  };

  ViewportControls.prototype.sync = function () {
    var s = this.m.s, active = document.activeElement, mode = s.ViewMode, stage = this.stage;
    if (this.syncedMode !== mode) {
      this.syncedMode = mode;
      this.showHint();     // tips follow the view, including changes made by demos
    }
    stage.classList.toggle('mode-eye', mode === 1);
    stage.classList.toggle('mode-model', mode !== 1);
    stage.classList.toggle('mode-globe', mode === 2);
    stage.classList.toggle('has-caption', !!s.Description || !!s.Card);
    $$('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', +b.dataset.mode === mode ? 'true' : 'false'); });
    this.pip.hidden = mode === 1 || this.pipHidden || !!s.Card;

    var play = $('#vp-lapse');
    var lbl = this.lapse ? 'Pause time-lapse' : 'Play time-lapse';
    if (play.getAttribute('aria-label') !== lbl) {
      play.textContent = this.lapse ? '❚❚' : '▶';
      play.setAttribute('aria-label', lbl);
      play.title = lbl + ' (Space)';
      play.classList.toggle('on', this.lapse);
    }
    var time = $('#vp-time'), t = U.wrap(this.m.get('Time'), 24);
    if (active !== time) time.value = t;
    $('#vp-time-out').textContent = SU.hm(t) + ' UTC';
    var date = $('#vp-date');
    if (active !== date) date.value = dayToISO(s.DateTime);

    // Sky view: heading readout and edge-button labels name the actual directions.
    if (mode === 1) {
      var left = SU.compass(s.SkyAz - 45), right = SU.compass(s.SkyAz + 45);
      $('#eye-left .dir').textContent = left; $('#eye-right .dir').textContent = right;
      $('#eye-left').setAttribute('aria-label', 'Turn left toward ' + left);
      $('#eye-right').setAttribute('aria-label', 'Turn right toward ' + right);
      var head = 'Facing ' + SU.compass(s.SkyAz) + ' ' + s.SkyAz.toFixed(0) + '° · ' +
        (s.SkyAlt >= 0 ? s.SkyAlt.toFixed(0) + '° up' : (-s.SkyAlt).toFixed(0) + '° down') + ' · ' + FE.EyeView.hfov(s, this.app.viewAspect()).toFixed(0) + '° wide';
      $('#eye-heading').textContent = head;
      this.eyeCv.setAttribute('aria-label', 'Sky view. ' + head + '. Arrow keys turn and tilt, N E S W face a direction, plus and minus zoom.');
    } else {
      $('#pip-label').textContent = 'Sky view · ' + SU.compass(s.SkyAz);
    }
    $('#view').setAttribute('aria-label', mode === 2 ? 'Globe view. Drag to spin, pinch or scroll to zoom.' : 'Dome model. Drag to orbit, pinch or scroll to zoom.');
  };

  FE.ViewportControls = ViewportControls;
})();
