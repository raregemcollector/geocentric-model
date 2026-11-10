/* director.js — drives the Geocentric Model frame by frame for a vertical video and draws
 * the motion-graphics overlay. Injected into the page; DIR.render(t) sets the model
 * for time t (seconds), draws one frame, and rebuilds the overlay. */
(function () {
  var app = FE.app, Geo = FE.Geo, A = FE.Astro, V = FE.V, M3 = FE.M3, U = FE.U, D2R = Math.PI / 180;
  var W = 540, H = 960;

  /* ---------- helpers ---------- */
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function P(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  var out3 = function (u) { return 1 - Math.pow(1 - u, 3); };
  var io = function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  var sine = function (u) { return 0.5 - 0.5 * Math.cos(Math.PI * u); };
  function vis(t, a, b, fi, fo) {
    fi = fi || 0.45; fo = fo || 0.35;
    if (t < a || t > b) return 0;
    return Math.min(out3(P(t, a, a + fi)), 1 - sine(P(t, b - fo, b)));
  }
  function dt(y, mo, d, h, mi) { return (Date.UTC(y, mo - 1, d, h || 0, mi || 0) - Date.UTC(2017, 0, 1)) / 864e5; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateOf(T, offH) {
    var ms = Date.UTC(2017, 0, 1) + (T + (offH || 0) / 24) * 864e5, D = new Date(ms);
    return { y: D.getUTCFullYear(), m: D.getUTCMonth(), d: D.getUTCDate(), h: D.getUTCHours(), mi: D.getUTCMinutes() };
  }
  function clock(o) { var h = o.h % 12 || 12; return h + ':' + (o.mi < 10 ? '0' : '') + o.mi + (o.h < 12 ? ' AM' : ' PM'); }
  function clock24(o) { return (o.h < 10 ? '0' : '') + o.h + ':' + (o.mi < 10 ? '0' : '') + o.mi; }

  var C = { sun: '#ffb13d', moon: '#cfd5e2', dome: '#9db2ff', green: '#5fe39a', red: '#ff6b5b', white: '#f4f6fb', muted: '#9aa4b8' };

  /* ---------- overlay root ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '#ov{position:absolute;inset:0;z-index:20;pointer-events:none;font-family:"Inter Display",Inter,sans-serif;color:#f4f6fb;overflow:hidden}',
    '#ov svg{position:absolute;inset:0;width:100%;height:100%}',
    '#ov .mg-abs{position:absolute}',
    '#ov .mg-vtop{left:0;right:0;top:0;height:260px;background:linear-gradient(#05070cee 0,#05070c99 55%,#05070c00)}',
    '#ov .mg-vbot{left:0;right:0;bottom:0;height:200px;background:linear-gradient(#05070c00,#05070caa)}',
    '#ov .mg-prog{left:22px;right:22px;top:22px;height:4px;display:flex;gap:5px}',
    '#ov .mg-prog i{flex:1;background:#ffffff26;border-radius:2px;overflow:hidden;position:relative}',
    '#ov .mg-prog b{position:absolute;left:0;top:0;bottom:0;background:#ffb13d;border-radius:2px}',
    '#ov .mg-kick{left:24px;top:46px;right:60px}',
    '#ov .mg-kn{font:800 13px "Inter Display";letter-spacing:.18em;color:#ffb13d;text-transform:uppercase;display:flex;align-items:center;gap:8px}',
    '#ov .mg-kn em{font-style:normal;background:#ffb13d;color:#1a1206;border-radius:5px;padding:2px 6px;letter-spacing:.06em}',
    '#ov .mg-kt{font:800 34px/1.04 "Inter Display";letter-spacing:-.01em;margin-top:8px;text-shadow:0 2px 14px #000a}',
    '#ov .mg-ks{font:500 15px/1.35 Inter;color:#c9d0de;margin-top:8px;max-width:420px}',
    '#ov .mg-tag{display:flex;align-items:center;gap:6px;white-space:nowrap;font:700 13px Inter;padding:5px 9px 5px 8px;border-radius:999px;background:#0b1020d9;border:1px solid #ffffff2a;box-shadow:0 4px 18px #0008}',
    '#ov .mg-tag i{width:8px;height:8px;border-radius:50%;flex:none}',
    '#ov .mg-tag small{font:500 12px Inter;color:#b8c0d0}',
    '#ov .mg-card{background:#0b1020e6;border:1px solid #ffffff22;border-radius:16px;padding:14px 16px;box-shadow:0 10px 40px #000a}',
    '#ov .mg-cl{font:700 11px Inter;letter-spacing:.14em;text-transform:uppercase;color:#9aa4b8}',
    '#ov .mg-cv{font:800 40px/1.05 "Inter Display";letter-spacing:-.02em;margin-top:4px}',
    '#ov .mg-cs{font:500 13px/1.35 Inter;color:#c3cad8;margin-top:4px}',
    '#ov .mg-chip{font:700 14px Inter;padding:7px 12px;border-radius:10px;background:#0b1020d9;border:1px solid #ffffff26;white-space:nowrap}',
    '#ov .mg-foot{left:24px;right:60px;font:500 11px Inter;color:#8f98aa}',
    '#ov .mg-dip{inset:0;background:#05070c}',
    '#ov .mg-big{left:28px;right:28px;text-align:left}',
    '#ov .mg-step{display:flex;align-items:center;gap:12px;font:700 20px Inter;margin:10px 0}',
    '#ov .mg-step b{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:#ffb13d;color:#1a1206;font:800 18px Inter;flex:none}'
  ].join('');
  document.head.appendChild(css);
  var ov = document.createElement('div'); ov.id = 'ov';
  document.getElementById('stage').appendChild(ov);

  /* ---------- overlay builders (each returns an HTML string) ---------- */
  function box(x, y, a, inner, cls, extra) {
    if (a <= 0.001) return '';
    return '<div class="mg-abs ' + (cls || '') + '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;opacity:' + a.toFixed(3) + ';' + (extra || '') + '">' + inner + '</div>';
  }
  function kicker(n, title, sub, t, a, b, subAt) {
    var al = vis(t, a, b, 0.5, 0.3);
    if (!al) return '';
    var u = out3(P(t, a, a + 0.7)), su = vis(t, subAt === undefined ? a + 0.6 : subAt, b, 0.5, 0.3);
    return '<div class="mg-abs mg-kick" style="opacity:' + al.toFixed(3) + ';transform:translateY(' + ((1 - u) * 18).toFixed(1) + 'px)">' +
      '<div class="mg-kn"><em>' + n + '</em>' + esc(title.k) + '</div>' +
      '<div class="mg-kt">' + title.h + '</div>' +
      (sub ? '<div class="mg-ks" style="opacity:' + su.toFixed(3) + '">' + sub + '</div>' : '') + '</div>';
  }
  /* a pill label with a leader line from (x,y) by (dx,dy) */
  var svgParts = [];
  function tag(x, y, dx, dy, text, color, a, small) {
    if (a <= 0.001 || !isFinite(x)) return '';
    var u = out3(Math.min(1, a * 1.2));
    var lx = x + dx * u, ly = y + dy * u;
    svgParts.push('<line x1="' + x + '" y1="' + y + '" x2="' + lx + '" y2="' + ly + '" stroke="' + color + '" stroke-width="1.6" opacity="' + a + '"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (4 + 6 * (1 - u)) + '" fill="none" stroke="' + color + '" stroke-width="1.6" opacity="' + a + '"/>');
    var right = dx < 0, tw = String(text).replace(/<[^>]*>/g, '').length * 7.6 + (small ? small.length * 6.2 : 0) + 34;
    lx = right ? Math.max(lx, tw + 14) : Math.min(lx, W - 14 - tw);
    return '<div class="mg-abs mg-tag" style="left:' + lx.toFixed(1) + 'px;top:' + ly.toFixed(1) + 'px;opacity:' + a.toFixed(3) +
      ';transform:translate(' + (right ? '-100%' : '0') + ',-50%)"><i style="background:' + color + '"></i>' + text + (small ? ' <small>' + small + '</small>' : '') + '</div>';
  }
  function card(x, y, w, a, label, value, sub, color) {
    if (a <= 0.001) return '';
    var u = out3(Math.min(1, a));
    return '<div class="mg-abs mg-card" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;opacity:' + a.toFixed(3) + ';transform:translateY(' + ((1 - u) * 14).toFixed(1) + 'px) scale(' + (0.96 + 0.04 * u).toFixed(3) + ')">' +
      '<div class="mg-cl">' + label + '</div><div class="mg-cv" style="color:' + (color || C.white) + '">' + value + '</div>' + (sub ? '<div class="mg-cs">' + sub + '</div>' : '') + '</div>';
  }
  function poly(pts, color, w, a, draw, dash, glow) {
    if (a <= 0.001 || pts.length < 2) return;
    var d = 'M' + pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join('L');
    var dd = dash ? ' stroke-dasharray="' + dash + '"' : '';
    if (typeof draw === 'number' && draw < 1) {
      // draw-on: keep only the first part of the polyline
      var n = Math.max(2, Math.round(pts.length * draw));
      d = 'M' + pts.slice(0, n).map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join('L');
    }
    if (glow) svgParts.push('<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + (w * 4) + '" opacity="' + (a * 0.18) + '" stroke-linecap="round" stroke-linejoin="round"/>');
    svgParts.push('<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + w + '" opacity="' + a + '" stroke-linecap="round" stroke-linejoin="round"' + dd + '/>');
  }
  function ring(lat, n) { var pts = []; for (var i = 0; i <= n; i++) pts.push(scr(Geo.fe(lat, i / n * 360))); return pts; }
  function scr(p) { return app.scene.toScreen(p); }
  function moonIcon(cx, cy, r, k, wax) {
    var rx = r * Math.abs(1 - 2 * k);
    var s1 = wax ? 1 : 0, s2 = k < 0.5 ? (wax ? 0 : 1) : (wax ? 1 : 0);
    svgParts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#1c2233" stroke="#ffffff30"/>' +
      '<path d="M' + cx + ',' + (cy - r) + ' A' + r + ',' + r + ' 0 0 ' + s1 + ' ' + cx + ',' + (cy + r) + ' A' + rx.toFixed(2) + ',' + r + ' 0 0 ' + s2 + ' ' + cx + ',' + (cy - r) + ' Z" fill="#e9ecf3"/>');
  }

  /* Sky-view projection (same as eye.js) */
  function skyProj(s, v) {
    var aspect = W / H, k = Math.min(1, Math.sqrt(Math.max(0.2, aspect) / 1.6));
    var hf = 2 * Math.atan(Math.tan(s.SkyFov / 2 * D2R) * k);
    var f = FE.SkyUtil.fromAzAlt(s.SkyAz, s.SkyAlt), a = s.SkyAz * D2R, r = [0, Math.cos(a), -Math.sin(a)], up = V.cross(r, f);
    var cz = V.dot(v, f); if (cz <= 0.02) return null;
    var fpx = (W / 2) / Math.tan(hf / 2);
    return { x: W / 2 + V.dot(v, r) / cz * fpx, y: H / 2 - V.dot(v, up) / cz * fpx };
  }
  function sunLocalAt(T, lat, lon) { return A.refract(M3.apply(Geo.celestToLocal(lat, lon, A.gmst(T)), A.sun(T).dir)); }
  function altOf(v) { return Math.asin(clamp(v[0], -1, 1)) / D2R; }

  /* ---------- the model state ---------- */
  var BASE = {
    ViewMode: 0, SunOnDome: false, SunHeight: 4828, SunSize: 51, MoonOnDome: false, MoonHeight: 4828, MoonSize: 51,
    DomeHeight: 5100, DomeShape: 0.2, DomeSize: 1, ShowFeGrid: true, ShowShadow: true, ShowDomeGrid: true,
    ShowSunTrack: false, ShowMoonTrack: false, ShowEclipse: false, ShowSphere: false, ShowStars: false,
    ShowDomeRays: false, ShowSphereRays: false, ShowManyRays: false, ShowRealStars: true, ShowConstellations: true,
    ShowPlanets: true, ShowRelief: true, ReliefScale: 20, IceWall: 600, ObserverLat: 40.71, ObserverLong: -74.01,
    RayTarget: 0, RaySource: 0, RayParameter: 1, ShowAnalemma: false, SkyGrid: false, SkyLabels: true, SkyDomeGhost: true,
    SkyAz: 0, SkyAlt: 30, SkyFov: 100, Zoom: 1.6, CameraHeight: 30, CameraDirection: -60, DateTime: dt(2027, 3, 20, 17)
  };
  function st(o) { var s = {}; for (var k in BASE) s[k] = BASE[k]; for (k in o) s[k] = o[k]; return s; }

  /* New moon near March 2027, for the Moon scene */
  var NEW_MOON = (function () {
    var best = 1e9, bt = 0;
    for (var T = dt(2027, 3, 1); T < dt(2027, 4, 5); T += 1 / 24) {
      var e = Math.acos(clamp(V.dot(A.sun(T).dir, A.moon(T).dir), -1, 1));
      if (e < best) { best = e; bt = T; }
    }
    return bt;
  })();
  function moonPhase(T) {
    var s = A.sun(T), m = A.moon(T), e = Math.acos(clamp(V.dot(s.dir, m.dir), -1, 1));
    var k = (1 - Math.cos(e)) / 2, wax = U.wrap(m.raDec.lon - s.raDec.lon, 360) < 180;
    return { k: k, wax: wax };
  }

  /* ---------- scenes ---------- */
  var SECT = ['map', 'dome', 'sun', 'moon', 'stars', 'ny', 'light', 'you'];
  var SCENES = [];
  function scene(name, dur, state, over) { SCENES.push({ name: name, dur: dur, state: state, over: over }); }

  /* 1 — THE MAP */
  scene('map', 22, function (t) {
    var orbit = -150 + t * 9;
    var tilt = lerp(28, 89.9, io(P(t, 4, 7.5)));
    if (t > 14.5) tilt = lerp(89.9, 16, io(P(t, 14.5, 18.5)));
    var z = t < 4 ? lerp(1.7, 2.0, sine(P(t, 0, 4))) : t < 14.5 ? lerp(2.0, 1.42, io(P(t, 4, 7.5))) : lerp(1.42, 2.4, io(P(t, 14.5, 18.5)));
    var dir = t < 7.5 ? orbit : t < 14.5 ? lerp(-150 + 7.5 * 9, -90, io(P(t, 7.5, 9))) : lerp(-90, -105, io(P(t, 14.5, 22)));
    var hook = t < 4.6;
    return st({
      Zoom: z, CameraHeight: tilt, CameraDirection: dir, DateTime: dt(2027, 3, 20, 13) + t / 24 * (hook ? 3 : 0),
      ShowDomeGrid: hook, ShowRealStars: hook, ShowConstellations: hook, ShowPlanets: hook, ShowShadow: hook,
      DomeHeight: 5100
    });
  }, function (t, s, h) {
    // hook title
    var ha = vis(t, 0.15, 4.4, 0.5, 0.45);
    if (ha) {
      var u = out3(P(t, 0.15, 1.1));
      h.push('<div class="mg-abs mg-big" style="top:118px;opacity:' + ha + ';transform:translateY(' + ((1 - u) * 22) + 'px)">' +
        '<div class="mg-kn"><em>NEW SERIES</em>The Geocentric Model</div>' +
        '<div class="mg-kt" style="font-size:44px;margin-top:12px">How the flat-earth<br>dome model <span style="color:#ffb13d">works</span></div>' +
        '<div class="mg-ks" style="opacity:' + vis(t, 1.1, 4.4) + '">Sun, Moon and stars — every position computed live from real astronomy.</div></div>');
    }
    h.push(kicker('01', { k: 'The map', h: 'The flat-earth map' }, 'An azimuthal equidistant projection, centered on the North Pole.', t, 4.6, 22, 5.6));
    if (t > 7.5 && t < 15) {
      var a1 = vis(t, 8, 14.8);
      h.push(tag(scr([0, 0, 0.02]).x, scr([0, 0, 0.02]).y, 40, -40, 'North Pole', C.red, a1, 'center'));
      var a2 = vis(t, 9.2, 14.8);
      poly(ring(0, 120), C.sun, 2.2, a2, out3(P(t, 9.2, 10.6)), null, true);
      poly(ring(23.44, 120), C.white, 1.2, vis(t, 10, 14.8) * 0.75, out3(P(t, 10, 11.4)), '4 5');
      poly(ring(-23.44, 120), C.white, 1.2, vis(t, 10, 14.8) * 0.75, out3(P(t, 10, 11.4)), '4 5');
      var eq = scr(Geo.fe(0, -100));
      h.push(tag(eq.x, eq.y, -30, 34, 'Equator', C.sun, a2));
      var a3 = vis(t, 11.4, 14.8);
      var c0 = scr([0, 0, 0.02]), rim = scr(Geo.fe(-90, -125));
      poly([c0, { x: lerp(c0.x, rim.x, out3(P(t, 11.4, 12.6))), y: lerp(c0.y, rim.y, out3(P(t, 11.4, 12.6))) }], C.white, 2.4, a3);
      var mid = { x: (c0.x + rim.x) / 2, y: (c0.y + rim.y) / 2 };
      h.push(box(clamp(mid.x + 14, 24, W - 230), mid.y - 10, vis(t, 12.2, 14.8), '<div class="mg-chip">Pole → edge ≈ <b style="color:#ffb13d">12,000 mi</b></div>'));
      h.push(box(24, 168, vis(t, 7.8, 14.8), '<div class="mg-chip" style="font-weight:600">Every line of latitude is a circle</div>'));
    }
    if (t > 15) {
      var a4 = vis(t, 16.6, 22, 0.6, 0.3);
      poly(ring(-78, 160), '#e8f4ff', 3, a4 * 0.9, out3(P(t, 16.6, 18.6)), null, true);
      var w = scr(Geo.fe(-86, -105));
      h.push(tag(w.x, w.y, 20, -120, '<span style="font-size:16px">THE ICE WALL</span>', '#cfeaff', vis(t, 17.4, 22), 'Antarctica as a ring'));
    }
  });

  /* 2 — THE DOME */
  scene('dome', 24, function (t) {
    return st({
      Zoom: lerp(2.0, 2.35, sine(P(t, 0, 24))), CameraHeight: lerp(8, 17, io(P(t, 0, 4))), CameraDirection: -120 + t * 2.2,
      DomeHeight: lerp(2000, 5100, io(P(t, 0.4, 3.6))), DateTime: dt(2027, 3, 20, 15) + t / 24 * 0.6,
      ShowShadow: true, ShowConstellations: false
    });
  }, function (t, s, h) {
    h.push(kicker('02', { k: 'The dome', h: 'The firmament' }, 'A dome over the map holds the Sun, the Moon and the stars.', t, 0.2, 24, 1.0));
    var d = app.lastD;
    var sp = scr(d.sunDomeW), sg = Geo.latLonOf(d.sunDomeW[0], d.sunDomeW[1]), sgp = scr([d.sunDomeW[0], d.sunDomeW[1], Geo.groundZ(sg.lat, sg.lon)]);
    var mp = scr(d.moonDomeW);
    // height dimension line under the Sun
    var a1 = vis(t, 4.2, 15.5);
    if (a1) {
      var u = out3(P(t, 4.2, 5.4));
      var top = { x: lerp(sgp.x, sp.x, u), y: lerp(sgp.y, sp.y, u) };
      svgParts.push('<line x1="' + (sgp.x + 16) + '" y1="' + sgp.y + '" x2="' + (top.x + 16) + '" y2="' + top.y + '" stroke="#ffb13d" stroke-width="2" opacity="' + a1 + '"/>' +
        '<line x1="' + (sgp.x + 9) + '" y1="' + sgp.y + '" x2="' + (sgp.x + 23) + '" y2="' + sgp.y + '" stroke="#ffb13d" stroke-width="2" opacity="' + a1 + '"/>' +
        '<line x1="' + (top.x + 9) + '" y1="' + top.y + '" x2="' + (top.x + 23) + '" y2="' + top.y + '" stroke="#ffb13d" stroke-width="2" opacity="' + a1 + '"/>');
      h.push(box((sgp.x + sp.x) / 2 + 26, (sgp.y + sp.y) / 2 - 14, vis(t, 5, 15.5), '<div class="mg-chip"><span style="color:#ffb13d">≈ 3,000 mi</span> up</div>'));
    }
    var sl = sp.x < mp.x ? -1 : 1;
    h.push(tag(sp.x, sp.y, sl * 30, 58, 'SUN', C.sun, vis(t, 4.6, 15.5), '32 mi wide'));
    h.push(tag(mp.x, mp.y, -sl * 30, -58, 'MOON', C.moon, vis(t, 7.2, 15.5), '≈ 3,000 mi up · 32 mi wide'));
    var dt0 = scr(d.toWorld(Geo.dome(60, 200, 1, d.H, s.DomeShape)));
    h.push(tag(dt0.x, dt0.y, dt0.x > W / 2 ? -20 : 20, -84, 'STARS', C.dome, vis(t, 9.8, 15.5), 'on the dome ≈ 3,100 mi up'));
    // stat cards
    h.push(card(24, 560, 236, vis(t, 12.2, 24), 'Sun diameter', '<span>' + fmt(32 * out3(P(t, 12.2, 13.6))) + '</span> mi', 'Rowbotham, 1800s', C.sun));
    h.push(card(280, 560, 236, vis(t, 13, 24), 'Sun height', fmt(3000 * out3(P(t, 13, 14.4))) + ' mi', 'above the map', C.sun));
    h.push(card(24, 672, 492, vis(t, 16.2, 24), 'For comparison · mainstream astronomy',
      '<span style="font-size:30px">' + fmt(93e6 * out3(P(t, 16.2, 18))) + ' mi</span> <span style="font-size:18px;color:#9aa4b8">away</span>',
      'and about 864,000 miles wide', '#8fc2ff'));
    h.push(box(24, 790, vis(t, 12.6, 24), '<div class="mg-foot" style="position:static">Flat-earth figures: Samuel Rowbotham, <i>Zetetic Astronomy</i>.</div>'));
  });

  /* 3 — THE SUN */
  var SUN_DAY0 = dt(2027, 3, 20, 4);
  scene('sun', 32, function (t) {
    var T;
    if (t < 12) T = SUN_DAY0 + io(P(t, 0.6, 11.6));                       // one full lap
    else {
      var day;
      if (t < 17) day = lerp(dt(2027, 3, 21), dt(2027, 6, 21), io(P(t, 12, 17)));
      else if (t < 21) day = dt(2027, 6, 21);
      else if (t < 27) day = lerp(dt(2027, 6, 21), dt(2027, 12, 21), io(P(t, 21, 27)));
      else day = dt(2027, 12, 21);
      T = Math.round(day) + 17 / 24;
    }
    return st({
      Zoom: lerp(1.75, 1.95, sine(P(t, 0, 32))), CameraHeight: t < 12 ? 42 : lerp(42, 62, io(P(t, 12, 15))),
      CameraDirection: t < 12 ? -100 : lerp(-100, -150, io(P(t, 12, 15))),
      DateTime: T, ShowSunTrack: true, ShowDomeGrid: false, ShowRealStars: false, ShowConstellations: false, ShowPlanets: false
    });
  }, function (t, s, h) {
    h.push(kicker('03', { k: 'The Sun', h: 'A circling spotlight' }, 'One lap above the map every 24 hours — day and night sweep around.', t, 0.2, 12.4, 1.0));
    h.push(kicker('03', { k: 'The Sun · seasons', h: 'The circle changes size' }, 'In and out between the tropics over the year.', t, 12.3, 32, 12.9));
    var d = app.lastD, o = dateOf(s.DateTime);
    if (t < 12.2) {
      var ch = vis(t, 0.8, 12.0);
      var hrs = (s.DateTime - SUN_DAY0) * 24;
      h.push(box(24, 186, ch, '<div class="mg-chip">⟳ <span style="color:#ffb13d">' + Math.floor(hrs) + ' h</span> of 24 · ' + clock24(o) + ' UTC</div>'));
      var sp = scr(d.sunDomeW);
      h.push(tag(sp.x, sp.y, 30, -46, 'SUN', C.sun, vis(t, 1.2, 12.0)));
      h.push(box(24, 760, vis(t, 4, 12), '<div class="mg-chip" style="font-weight:600"><span style="color:#ffb13d">●</span> Lit side = day &nbsp; <span style="color:#7486ad">●</span> Shaded side = night</div>'));
    } else {
      h.push(box(24, 186, vis(t, 12.6, 32), '<div class="mg-chip">' + MON[o.m] + ' ' + o.d + ', ' + o.y + '</div>'));
      var aJ = vis(t, 16.6, 21.2, 0.5, 0.4), aD = vis(t, 26.6, 32, 0.5, 0.3);
      poly(ring(23.44, 120), C.sun, 2.6, aJ, out3(P(t, 16.6, 18)), null, true);
      poly(ring(-23.44, 120), '#7fc1ff', 2.6, aD, out3(P(t, 26.6, 28)), null, true);
      poly(ring(23.44, 120), C.white, 1, (t > 21 ? 0.45 : 0) * vis(t, 21, 32), null, '3 5');
      h.push(card(24, 610, 300, aJ, 'June · Tropic of Cancer', '≈ 4,600 mi', 'from the pole — the smallest circle.<br>Summer in the north.', C.sun));
      h.push(card(24, 610, 300, aD, 'December · Tropic of Capricorn', '≈ 7,800 mi', 'from the pole — the widest circle.<br>Summer in the south.', '#7fc1ff'));
      var mov = vis(t, 12.6, 16.6) || vis(t, 21.2, 26.6);
      h.push(box(330, 186, mov, '<div class="mg-chip" style="color:#ffb13d">same time each day</div>'));
    }
  });

  /* 4 — THE MOON */
  var MOON_T0 = Math.round(NEW_MOON) + 17 / 24;
  scene('moon', 22, function (t) {
    var k = Math.floor(lerp(0, 29.999, P(t, 2.2, 17.5)));
    return st({
      Zoom: 1.85, CameraHeight: lerp(50, 66, io(P(t, 0, 4))), CameraDirection: lerp(-140, -160, P(t, 0, 22)),
      DateTime: MOON_T0 + k, ShowMoonTrack: false, ShowSunTrack: false, ShowDomeGrid: false,
      ShowRealStars: false, ShowConstellations: false, ShowPlanets: false
    });
  }, function (t, s, h) {
    h.push(kicker('04', { k: 'The Moon', h: 'It slips behind the Sun' }, 'Same height and size as the Sun — but about 50 minutes later every day.', t, 0.2, 22, 1.0));
    var d = app.lastD, k = Math.round(s.DateTime - MOON_T0);
    // trail of earlier days
    var pts = [];
    for (var i = 0; i <= k; i++) {
      var T = MOON_T0 + i, m = A.moon(T), th = A.gmst(T);
      var w = M3.apply(M3.rotZ(-th * D2R), Geo.body(m.raDec.lat, m.raDec.lon, s, d.H, false, s.MoonHeight));
      pts.push(scr(w));
    }
    var a = vis(t, 2.2, 22);
    if (a) {
      poly(pts, C.moon, 1.6, a * 0.7, null, '2 5');
      pts.forEach(function (p, i) {
        if (i === pts.length - 1) return;
        svgParts.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="#cfd5e2" opacity="' + (a * (0.35 + 0.5 * i / Math.max(1, k))) + '"/>');
      });
      var mp = pts[pts.length - 1], sp = scr(d.sunDomeW);
      h.push(tag(sp.x, sp.y, 26, 44, 'SUN', C.sun, a));
      h.push(tag(mp.x, mp.y, mp.x > W / 2 ? -34 : 34, -40, 'MOON', C.moon, a, 'day ' + (k + 1)));
      // phase widget
      var ph = moonPhase(s.DateTime);
      var cx = 470, cy = 214;
      if (a > 0.01) {
        svgParts.push('<g opacity="' + a + '">'); moonIcon(cx, cy, 28, ph.k, ph.wax); svgParts.push('</g>');
        h.push(box(cx - 60, cy + 34, a, '<div style="width:120px;text-align:center;font:700 12px Inter;color:#c9d0de">' + Math.round(ph.k * 100) + '% lit</div>'));
      }
      h.push(box(24, 196, a, '<div class="mg-chip">Day <span style="color:#cfd5e2">' + (k + 1) + '</span> · same clock time each day</div>'));
    }
    h.push(card(24, 640, 340, vis(t, 17.8, 22), 'One lap of the map', '≈ 29.5 days', 'with its phase changing as it goes', C.moon));
  });

  /* 5 — STARS & PLANETS */
  var STAR_T0 = dt(2027, 3, 20, 2);
  scene('stars', 23, function (t) {
    return st({
      Zoom: lerp(2.2, 2.45, sine(P(t, 0, 23))), CameraHeight: lerp(13, 18, sine(P(t, 0, 23))), CameraDirection: -120,
      DateTime: STAR_T0 + 0.9973 * io(P(t, 0.8, 16.5)) + 0.08 * P(t, 16.5, 23), ShowDomeGrid: true, ShowShadow: true
    });
  }, function (t, s, h) {
    h.push(kicker('05', { k: 'Stars & planets', h: 'The whole dome turns' }, 'Once a day, around Polaris — directly above the North Pole.', t, 0.2, 23, 1.0));
    var d = app.lastD;
    var pol = scr(d.toWorld(Geo.dome(89.3, 38, 1, d.H, s.DomeShape))), np = scr([0, 0, 0.05]);
    var a = vis(t, 1.6, 23);
    poly([np, pol], C.red, 1.6, a * 0.85, out3(P(t, 1.6, 2.6)), '4 4');
    h.push(tag(pol.x, pol.y, 36, -70, '★ POLARIS', '#ffe27a', vis(t, 2.2, 23), 'the pivot'));
    // rotation arrow around the pole
    if (a) {
      var r = 64, a0 = (s.DateTime - STAR_T0) * 360 * -1, arc = [];
      for (var i = 0; i <= 40; i++) {
        var ang = (a0 + i * 6) * D2R;
        arc.push({ x: pol.x + r * Math.cos(ang), y: pol.y + r * 0.32 * Math.sin(ang) });
      }
      poly(arc, '#ffe27a', 2, a * 0.8);
      var pe = arc[arc.length - 1], pb = arc[arc.length - 3];
      var ang2 = Math.atan2(pe.y - pb.y, pe.x - pb.x);
      svgParts.push('<path d="M' + pe.x + ',' + pe.y + ' L' + (pe.x - 10 * Math.cos(ang2 - 0.5)) + ',' + (pe.y - 10 * Math.sin(ang2 - 0.5)) +
        ' L' + (pe.x - 10 * Math.cos(ang2 + 0.5)) + ',' + (pe.y - 10 * Math.sin(ang2 + 0.5)) + 'Z" fill="#ffe27a" opacity="' + a + '"/>');
    }
    var hrs = (s.DateTime - STAR_T0) * 24;
    h.push(box(24, 196, vis(t, 1.2, 16.8), '<div class="mg-chip">⟳ ' + Math.floor(hrs) + ' h ' + (Math.floor(hrs * 60) % 60) + ' min</div>'));
    // planets
    var pa = vis(t, 7, 23), names = { Venus: 1, Mars: 1, Jupiter: 1, Saturn: 1 }, side = 1;
    d.planets.forEach(function (pl) {
      if (!names[pl.name]) return;
      var p = scr(d.toWorld(Geo.dome(pl.raDec.lat, pl.raDec.lon, 1, d.H, s.DomeShape)));
      if (!p.front) return;
      side = -side;
      h.push(tag(p.x, p.y, side * 26, -30, pl.name, pl.color, pa));
    });
    h.push(card(24, 640, 400, vis(t, 16.6, 23), 'One turn of the stars', '23 h 56 min', 'about 4 min less than a day — so stars rise a little earlier each night', '#ffe27a'));
  });

  /* 6 — NEW YORK */
  var NY = { lat: 40.71, lon: -74.01 };
  var NIGHT0 = dt(2027, 11, 16, 0), JUN0 = dt(2027, 6, 21, 14, 0), DEC0 = dt(2027, 12, 21, 13, 15);
  scene('ny', 29, function (t) {
    if (t < 4.5) {
      return st({ Zoom: lerp(1.7, 6.5, io(P(t, 0.2, 4.2))), CameraHeight: lerp(40, 30, P(t, 0, 4.5)), CameraDirection: lerp(-110, -160, io(P(t, 0, 4.5))),
        DateTime: dt(2027, 6, 21, 16, 50), ShowDomeGrid: false, ShowRealStars: false, ShowConstellations: false, ShowPlanets: false, ShowSphere: true });
    }
    if (t < 13) {
      return st({ ViewMode: 1, SkyAz: 0, SkyAlt: 38, SkyFov: 112, DateTime: NIGHT0 + lerp(0, 7, P(t, 4.5, 13)) / 24, ShowPlanets: true, SkyDomeGhost: false });
    }
    if (t < 21) {
      return st({ ViewMode: 1, SkyAz: 180, SkyAlt: 42, SkyFov: 150, DateTime: JUN0 + lerp(0, 6, io(P(t, 13.4, 20.4))) / 24, SkyDomeGhost: false });
    }
    return st({ ViewMode: 1, SkyAz: 180, SkyAlt: 42, SkyFov: 150, DateTime: DEC0 + lerp(0, 7, io(P(t, 21.4, 28.2))) / 24, SkyDomeGhost: false });
  }, function (t, s, h) {
    h.push(kicker('06', { k: 'From New York', h: 'Standing in New York' }, '40.7°N · about 3,400 mi from the pole.', t, 0.2, 29, 0.9));
    var d = app.lastD;
    if (t < 4.5) {
      var p = scr(d.frame.pos);
      h.push(tag(p.x, p.y, 34, 60, 'NEW YORK', C.red, vis(t, 1.6, 4.5)));
      return;
    }
    if (t < 13) {
      var pl = skyProj(s, FE.SkyUtil.fromAzAlt(0, 40.7)), hz = skyProj(s, FE.SkyUtil.fromAzAlt(0, 0.01));
      var a = vis(t, 5.2, 13);
      if (pl && hz) {
        poly([hz, { x: hz.x, y: lerp(hz.y, pl.y, out3(P(t, 5.4, 6.6))) }], '#ffe27a', 2, a, null, '5 4');
        h.push(tag(pl.x, pl.y, 40, -40, 'POLARIS', '#ffe27a', vis(t, 6, 13), '≈ 41° up — every night'));
        // rotation arc
        var arc = [], r = 120, a0 = -(s.DateTime - NIGHT0) * 360 + 140;
        for (var i = 0; i <= 30; i++) { var g = (a0 - i * 4) * D2R; arc.push({ x: pl.x + r * Math.cos(g), y: pl.y + r * Math.sin(g) }); }
        poly(arc, '#ffe27a', 2, vis(t, 7.2, 13) * 0.7);
        h.push(box(24, 740, vis(t, 7.4, 13), '<div class="mg-chip" style="font-weight:600">Stars wheel counter-clockwise around it</div>'));
      }
      var o = dateOf(s.DateTime, -5);
      h.push(box(24, 196, vis(t, 4.8, 13), '<div class="mg-chip">Facing north · ' + clock(o) + '</div>'));
      return;
    }
    var jun = t < 21, T0 = jun ? JUN0 : DEC0, aS = jun ? vis(t, 13.2, 21.2, 0.4, 0.3) : vis(t, 21.2, 29, 0.4, 0.3);
    var trail = [], maxAlt = -90, peak = null;
    for (var T = T0; T <= s.DateTime + 1e-6; T += 6 / 1440) {
      var v = sunLocalAt(T, NY.lat, NY.lon), q = skyProj(s, v), al = altOf(v);
      if (q && al > -1) trail.push(q);
      if (al > maxAlt) { maxAlt = al; peak = q; }
    }
    if (!jun) {   // June's path, faded, for comparison
      var jt = [];
      for (var T2 = JUN0; T2 <= JUN0 + 6 / 24; T2 += 10 / 1440) { var v2 = sunLocalAt(T2, NY.lat, NY.lon), q2 = skyProj(s, v2); if (q2 && altOf(v2) > -1) jt.push(q2); }
      poly(jt, C.sun, 1.4, aS * 0.45, null, '3 5');
    }
    poly(trail, jun ? C.sun : '#ffcf7a', 2.6, aS, null, null, true);
    var nowAlt = altOf(sunLocalAt(s.DateTime, NY.lat, NY.lon));
    var o2 = dateOf(s.DateTime, jun ? -4 : -5);
    h.push(box(24, 196, aS, '<div class="mg-chip">Facing south · ' + (jun ? 'June 21' : 'December 21') + ' · ' + clock(o2) + '</div>'));
    h.push(card(24, 630, 250, aS, 'Sun altitude now', Math.max(0, nowAlt).toFixed(0) + '°', '', C.sun));
    var done = P(t, jun ? 17 : 25, jun ? 17.6 : 25.6);
    h.push(card(290, 630, 226, aS * done, 'Highest at noon', (jun ? 73 : 26) + '°', jun ? 'rises north of east' : 'rises south of east', jun ? C.sun : '#ffcf7a'));
    if (peak && done > 0) h.push(tag(peak.x, peak.y, 30, -36, 'noon', C.sun, aS * done));
  });

  /* 7 — THE LIGHT PATHS */
  var SS0 = dt(2027, 6, 21, 21, 0);
  scene('light', 27, function (t) {
    if (t < 14.5) {
      return st({ Zoom: lerp(2.6, 3.0, P(t, 0, 14)), CameraHeight: lerp(14, 20, P(t, 0, 14)), CameraDirection: lerp(-200, -185, P(t, 0, 14)),
        DateTime: SS0 + lerp(0, 3.8, io(P(t, 1, 13.5))) / 24, ShowDomeRays: true, ShowSphere: true, ShowSphereRays: true,
        ShowDomeGrid: false, ShowRealStars: false, ShowConstellations: false, ShowPlanets: false, RayParameter: 1 });
    }
    return st({ ViewMode: 1, SkyAz: 308, SkyAlt: 6, SkyFov: 76, DateTime: dt(2027, 6, 22, 0, 31), SkyDomeGhost: true, ShowPlanets: false });
  }, function (t, s, h) {
    h.push(kicker('07', { k: 'What makes it different', h: 'The light has to bend' }, 'It uses real astronomy to find where people actually see the Sun.', t, 0.2, 27, 1.0));
    var d = app.lastD, F = d.frame;
    var w = V.sub(d.sunDomeW, F.pos), straight = Math.atan2(w[2], Math.hypot(w[0], w[1])) / D2R, real = d.sunAzEl.el;
    if (t < 14.5) {
      var sp = scr(d.sunDomeW), op = scr(F.pos), a = vis(t, 2, 14.4);
      poly([op, { x: lerp(op.x, sp.x, out3(P(t, 2, 3.2))), y: lerp(op.y, sp.y, out3(P(t, 2, 3.2))) }], C.white, 2, a, null, '7 6');
      h.push(tag(sp.x, sp.y, -24, -40, 'Dome Sun', C.sun, vis(t, 1.4, 14.4)));
      h.push(tag(op.x, op.y, 30, 50, 'New York', C.red, vis(t, 1.4, 14.4)));
      h.push(card(24, 600, 236, vis(t, 3.4, 14.4), 'Real Sun (seen)', Math.max(0, real).toFixed(1) + '°', real > 0.2 ? 'above the horizon' : 'set — on the horizon', C.sun));
      h.push(card(280, 600, 236, vis(t, 4.2, 14.4), 'Straight line', straight.toFixed(1) + '°', 'to the dome Sun', C.white));
      h.push(box(24, 732, vis(t, 6, 14.4), '<div class="mg-chip" style="font-weight:600"><span style="color:#ff9d1f">━</span> model\'s light ray, curved &nbsp; <span style="color:#fff">┅</span> straight line</div>'));
      return;
    }
    var o = dateOf(s.DateTime, -4);
    h.push(box(24, 196, vis(t, 14.6, 27), '<div class="mg-chip">June 21 · sunset · ' + clock(o) + ' · facing WNW</div>'));
    var rs = skyProj(s, d.sunApp);
    var wl = V.norm([w[2], V.dot(w, F.east), V.dot(w, F.north)]), gs = skyProj(s, wl);
    var a2 = vis(t, 15.6, 27);
    if (rs && gs && a2) {
      var x = Math.min(rs.x, gs.x) - 40, y0 = rs.y, y1 = lerp(rs.y, gs.y, out3(P(t, 15.6, 17)));
      svgParts.push('<g opacity="' + a2 + '" stroke="#fff" stroke-width="2"><line x1="' + x + '" y1="' + y0 + '" x2="' + x + '" y2="' + y1 + '"/>' +
        '<line x1="' + (x - 7) + '" y1="' + y0 + '" x2="' + (x + 7) + '" y2="' + y0 + '"/><line x1="' + (x - 7) + '" y1="' + y1 + '" x2="' + (x + 7) + '" y2="' + y1 + '"/></g>');
      h.push(box(x - 12, (y0 + y1) / 2 - 18, vis(t, 16.6, 27), '<div class="mg-chip" style="font-size:18px;transform:translateX(-100%)">≈ ' + Math.round(straight - Math.max(0, real)) + '° gap</div>'));
      h.push(tag(rs.x, rs.y, -30, 34, 'Real Sun, setting', C.sun, vis(t, 15, 27)));
    }
    h.push(card(24, 650, 492, vis(t, 19.6, 27), 'In a straight line', 'It would never set', 'From New York, a Sun 3,000 mi up never sinks below ~15–20°. To match real sunsets, the model\'s light rays have to curve.', C.white));
  });

  /* 8 — YOUR TURN */
  var CITIES = [['New York', 40.71, -74.01], ['London', 51.51, -0.13], ['Sydney', -33.87, 151.21], ['Quito', -0.18, -78.47], ['Tokyo', 35.68, 139.69]];
  scene('you', 28, function (t) {
    var ci = CITIES[Math.min(CITIES.length - 1, Math.floor(P(t, 0, 10.5) * CITIES.length))];
    return st({ Zoom: lerp(1.55, 1.35, P(t, 0, 28)), CameraHeight: lerp(24, 18, P(t, 0, 28)), CameraDirection: -40 + t * 4,
      DateTime: dt(2028, 1, 15, 6) + t * 0.12 + Math.floor(P(t, 0, 10.5) * 5) * 37, ObserverLat: ci[1], ObserverLong: ci[2],
      ShowDomeRays: true, ShowConstellations: false });
  }, function (t, s, h) {
    h.push(kicker('08', { k: 'Your turn', h: 'Explore it yourself' }, 'Every position is computed live.', t, 0.2, 10.8, 0.9));
    var o = dateOf(s.DateTime), ci = CITIES[Math.min(CITIES.length - 1, Math.floor(P(t, 0, 10.5) * CITIES.length))];
    var a = vis(t, 1.4, 10.8);
    h.push(box(24, 196, a, '<div style="display:flex;flex-wrap:wrap;gap:8px"><div class="mg-chip">📅 ' + MON[o.m] + ' ' + o.d + ', ' + o.y + '</div><div class="mg-chip">🕒 ' + clock24(o) + ' UTC</div><div class="mg-chip">📍 <span style="color:#ff8a7a">' + ci[0] + '</span></div></div>'));
    var p = scr(app.lastD.frame.pos);
    h.push(tag(p.x, p.y, 30, 46, ci[0], C.red, a));
    // end card
    var e = vis(t, 10.8, 28, 0.6, 0.01);
    if (e) {
      h.push('<div class="mg-abs" style="inset:0;background:linear-gradient(#05070cf2 0,#05070ce6 62%,#05070c88 100%);opacity:' + e + '"></div>');
      var u1 = vis(t, 11.2, 28), u2 = vis(t, 15.4, 28), u3 = vis(t, 19.2, 28);
      h.push(box(28, 110, u1, '<div class="mg-kn"><em>08</em>Your turn</div><div class="mg-kt" style="font-size:40px;margin-top:10px">Spot a mistake?<br><span style="color:#ffb13d">Got an improvement?</span></div>' +
        '<div class="mg-ks" style="font-size:17px;max-width:470px">If something in the model is wrong — a distance, a motion, anything — I want to know.</div>'));
      var steps = [['↓', 'Download it'], ['✎', 'Change it'], ['!', 'Open an issue'], ['⇄', 'Send a pull request']];
      var sh = '<div style="font:700 13px Inter;letter-spacing:.14em;color:#9aa4b8;margin-bottom:6px">OPEN SOURCE ON GITHUB · MIT LICENSE</div>';
      steps.forEach(function (sp, i) {
        var ai = vis(t, 15.6 + i * 0.5, 28);
        sh += '<div class="mg-step" style="opacity:' + ai + ';transform:translateX(' + ((1 - out3(Math.min(1, ai))) * -16) + 'px)"><b>' + sp[0] + '</b>' + sp[1] + '</div>';
      });
      h.push(box(28, 380, u2, sh));
      var pulse = 1 + 0.04 * Math.sin(t * 5);
      h.push(box(28, 640, u3, '<div style="display:inline-block;transform:scale(' + pulse.toFixed(3) + ');transform-origin:left center;background:#ffb13d;color:#1a1206;font:800 26px Inter Display;padding:14px 22px;border-radius:16px;box-shadow:0 0 40px #ffb13d55">Repository link in bio ↗</div>'));
    }
  });

  /* ---------- timeline ---------- */
  var starts = [], total = 0;
  SCENES.forEach(function (sc) { starts.push(total); total += sc.dur; });

  function globalChrome(t, si, lt, sc, h) {
    h.unshift('<div class="mg-abs mg-vtop"></div><div class="mg-abs mg-vbot"></div>');
    var bars = '';
    for (var i = 0; i < SCENES.length; i++) {
      var f = i < si ? 1 : i > si ? 0 : lt / sc.dur;
      bars += '<i><b style="width:' + (f * 100).toFixed(2) + '%"></b></i>';
    }
    h.push('<div class="mg-abs mg-prog">' + bars + '</div>');
    // dips between scenes and on view switches inside a scene
    var dip = 0;
    if (si > 0) dip = Math.max(dip, 1 - P(lt, 0, 0.3));
    if (si < SCENES.length - 1) dip = Math.max(dip, P(lt, sc.dur - 0.25, sc.dur));
    if (sc.name === 'ny') dip = Math.max(dip, 1 - Math.min(1, Math.abs(lt - 4.5) / 0.25));
    if (sc.name === 'light') dip = Math.max(dip, 1 - Math.min(1, Math.abs(lt - 14.5) / 0.25));
    if (si === 0) dip = Math.max(dip, 1 - P(lt, 0, 0.35));
    if (dip > 0.001) h.push('<div class="mg-abs mg-dip" style="opacity:' + dip.toFixed(3) + '"></div>');
  }

  window.DIR = {
    total: total,
    scenes: SCENES.map(function (s, i) { return { name: s.name, start: starts[i], dur: s.dur }; }),
    render: function (t) {
      var si = 0;
      while (si < SCENES.length - 1 && t >= starts[si + 1]) si++;
      var sc = SCENES[si], lt = t - starts[si];
      var s = sc.state(lt);
      app.model.restore(s, true, true);
      app.model.touch();
      app.frame(performance.now(), true);
      svgParts = [];
      var h = [];
      sc.over(lt, app.model.s, h);
      globalChrome(t, si, lt, sc, h);
      ov.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '">' + svgParts.join('') + '</svg>' + h.join('');
    }
  };
})();
