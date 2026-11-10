/* model.js — app state, the coordinate systems and everything derived from them.
 *
 * Units: positions are in megameters (1 Mm = 1000 km) so floats stay well-conditioned
 * on the GPU. UI values stay in km and degrees.
 *
 * Coordinate systems (same as the original page):
 *   Celestial   equatorial of date: x = vernal equinox, z = north celestial pole.
 *   Local globe an observer's real horizon frame: x = zenith, y = east, z = north.
 *   World / FE  the flat disc, north pole at the origin, z up. Ground latitude lat and
 *               longitude lon sit at radius R*(90-lat)/180, angle lon
 *               (azimuthal-equidistant projection, east = counter-clockwise).
 *   Dome        same origin; a star at declination d, right ascension a sits above
 *               ground latitude d. The dome turns by -GMST about z each sidereal day. */
var FE = window.FE = window.FE || {};

(function () {
  var V = FE.V, M3 = FE.M3, U = FE.U, A = FE.Astro;

  var R_FE = 20.015;           // Mm: disc radius = half a meridian
  var CAMERA_DIST = 200.15;    // Mm
  var ZOOM_MIN = 1, ZOOM_MAX = 10;
  /* Date range: 2025-01-01 .. 2030-12-31, as days since 2017-01-01 (the time scale). */
  var DAY_MIN = 2922, DAY_MAX = 5112;

  /* Every property a demo, the UI or a saved state can set. */
  var FIELDS = {
    Description:     { type: 'str',  def: '' },
    Pointer:         { type: 'obj',  def: null, demoOnly: true },
    Card:            { type: 'obj',  def: null, demoOnly: true },   // demo title/summary card {title, lines}
    Route:           { type: 'obj',  def: null, demoOnly: true },   // a city-to-city route {a:[lat,lon], b:[lat,lon], names}
    SkyMark:         { type: 'obj',  def: null, demoOnly: true },   // sky-view guide line {alt, label} or {az, label}
    /* Analemma: the Sun at this same clock time on every day of a year */
    ShowAnalemma:    { type: 'bool', def: false },
    AnalemmaFrom:    { type: 'num',  def: -1,    min: -1, max: DAY_MAX + 1 },  // -1: the whole year around the date; else a growing trail from this day
    ObserverLat:     { type: 'num',  def: 40.71, min: -90,  max: 90 },     // New York
    ObserverLong:    { type: 'num',  def: -74.01, wrap180: true },
    Zoom:            { type: 'num',  def: 1.4,   min: ZOOM_MIN, max: ZOOM_MAX },
    CameraDirection: { type: 'num',  def: -60 },   // looking across the map toward New York
    CameraHeight:    { type: 'num',  def: 25,    min: 0, max: 89.9 },
    DateTime:        { type: 'num',  def: 3369.5, min: DAY_MIN, max: DAY_MAX + 0.99999 },
    DomeSize:        { type: 'num',  def: 1,     min: 1, max: 5 },
    DomeHeight:      { type: 'num',  def: 9000,  min: 2000, max: 20015 },
    RayParameter:    { type: 'num',  def: 1,     min: 0.5, max: 2 },
    DomeShape:       { type: 'num',  def: 1,     min: 0.3, max: 3 },   // profile: <1 flatter top, 1 half-ellipsoid, >1 more pointed
    /* Sun and Moon in the dome model: on the dome itself, or circling at a fixed height
       below it (a common flat-earth description: about 5,000 km up, about 51 km wide). */
    SunOnDome:       { type: 'bool', def: true },
    SunHeight:       { type: 'num',  def: 4800,  min: 100, max: 20000 },  // km above the map
    SunSize:         { type: 'num',  def: 51,    min: 1, max: 5000 },     // km, diameter
    MoonOnDome:      { type: 'bool', def: true },
    MoonHeight:      { type: 'num',  def: 4800,  min: 100, max: 20000 },
    MoonSize:        { type: 'num',  def: 51,    min: 1, max: 5000 },
    RayTarget:       { type: 'int',  def: 0,     min: 0, max: 1 },
    RaySource:       { type: 'int',  def: 0,     min: 0, max: 2 },
    ShowFeGrid:      { type: 'bool', def: true },
    ShowShadow:      { type: 'bool', def: true },
    ShowDomeGrid:    { type: 'bool', def: true },
    ShowSunTrack:    { type: 'bool', def: false },
    ShowMoonTrack:   { type: 'bool', def: false },
    ShowEclipse:     { type: 'bool', def: true },    // eclipse shadow on the map, and on the Moon
    ShowSphere:      { type: 'bool', def: true },
    ShowStars:       { type: 'bool', def: false },
    ShowDomeRays:    { type: 'bool', def: true },
    ShowSphereRays:  { type: 'bool', def: true },
    ShowManyRays:    { type: 'bool', def: false },
    ShowRealStars:   { type: 'bool', def: true },
    ShowConstellations: { type: 'bool', def: true },
    ShowSkyDaylight: { type: 'bool', def: false },
    /* Terrain on the flat map (heights exaggerated so they can be seen) */
    ShowRelief:      { type: 'bool', def: true },
    ReliefScale:     { type: 'num',  def: 20,    min: 1, max: 60 },   // vertical exaggeration of land (just enough to see it)
    IceWall:         { type: 'num',  def: 600,   min: 0, max: 2000 }, // km, height of the Antarctic ice wall on the map
    /* Observer's view (camera on the ground) */
    ViewMode:        { type: 'int',  def: 0,     min: 0, max: 2 },   // 0 = dome model, 1 = observer's view, 2 = globe
    SkyAz:           { type: 'num',  def: 180,   wrap360: true },    // facing direction, deg from north
    SkyAlt:          { type: 'num',  def: 15,    min: -10, max: 85 },
    SkyFov:          { type: 'num',  def: 90,    min: 4, max: 120 }, // horizontal field of view, deg
    SkyGrid:         { type: 'bool', def: false },
    SkyLabels:       { type: 'bool', def: true },
    SkyDomeGhost:    { type: 'bool', def: true },
    ShowPlanets:     { type: 'bool', def: true },
    /* Globe view camera */
    GlobeAz:         { type: 'num',  def: -74 },   // New York facing the viewer
    GlobeEl:         { type: 'num',  def: 30,    min: -89, max: 89 },
    GlobeZoom:       { type: 'num',  def: 1,     min: 0.6, max: 8 }
  };
  var PERSISTED = Object.keys(FIELDS);

  function Model() {
    this.version = 0;
    this.listeners = [];
    this.reset();
  }
  Model.FIELDS = FIELDS;

  Model.prototype.reset = function (silent) {
    var s = {};
    PERSISTED.forEach(function (k) { s[k] = FIELDS[k].def; });
    this.s = s;
    this.day = Math.floor(s.DateTime);
    this.time = (s.DateTime - this.day) * 24;
    if (!silent) this.touch();
  };
  Model.prototype.touch = function () {
    this.version++;
    for (var i = 0; i < this.listeners.length; i++) this.listeners[i]();
  };
  Model.prototype.onChange = function (fn) { this.listeners.push(fn); };

  /* Virtual properties: DayOfYear (always a whole day, as in the original, so a
     tween steps the Sun day by day at a fixed clock time) and Time (hours, may run
     past 24 or below 0 during a tween). DateTime = DayOfYear + Time/24. */
  Model.prototype.get = function (name) {
    if (name === 'DayOfYear') return this.day;
    if (name === 'Time') return this.time;
    return this.s[name];
  };
  Model.prototype.set = function (name, v, silent) {
    if (name === 'DayOfYear') {
      this.day = U.clamp(Math.round(v), DAY_MIN, DAY_MAX);
      this.s.DateTime = this.day + this.time / 24;
    } else if (name === 'Time') {
      this.time = +v;
      this.s.DateTime = this.day + this.time / 24;
    } else {
      var f = Object.prototype.hasOwnProperty.call(FIELDS, name) ? FIELDS[name] : null;
      if (!f) return;
      if (f.type === 'num' || f.type === 'int') {
        v = +v;
        if (!isFinite(v)) return;
        if (f.type === 'int') v = Math.round(v);
        if (f.min !== undefined) v = U.clamp(v, f.min, f.max);
        if (f.wrap180) v = U.wrap180(v);
        if (f.wrap360) v = U.wrap(v, 360);
      } else if (f.type === 'bool') v = !!v;
      else if (f.type === 'str') v = v == null ? '' : String(v);
      this.s[name] = v;
      if (name === 'DateTime') { this.day = Math.floor(v); this.time = (v - this.day) * 24; }
    }
    if (!silent) this.touch();
  };
  Model.prototype.setMany = function (obj) {
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) this.set(k, obj[k], true);
    this.touch();
  };
  Model.prototype.snapshot = function () {
    var o = {}, s = this.s;
    PERSISTED.forEach(function (k) { o[k] = s[k]; });
    return o;
  };
  /* Restore a saved state. Untrusted input (a shared link, browser storage) can
     only set the plain settings: values are type-checked and clamped, and the
     demo-only captions, pointers, cards and routes are ignored, so a link
     cannot put text on the page. */
  Model.prototype.restore = function (obj, silent, trusted) {
    this.reset(true);
    if (!obj || typeof obj !== 'object') obj = {};
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k) || !Object.prototype.hasOwnProperty.call(FIELDS, k)) continue;
      var f = FIELDS[k], v = obj[k];
      if (f.demoOnly && !trusted) continue;
      if (!trusted && f.type === 'str') continue;      // captions only come from the built-in demos
      if (f.type === 'str' && typeof v !== 'string') continue;
      if ((f.type === 'num' || f.type === 'int') && typeof v !== 'number') continue;
      if (f.type === 'bool' && typeof v !== 'boolean') continue;
      this.set(k, v, true);
    }
    if (!silent) this.touch();
  };
  Model.prototype.clearDescription = function () {
    this.s.Description = ''; this.s.Pointer = null; this.s.Card = null; this.s.Route = null; this.s.SkyMark = null;
  };

  /* The analemma: where the Sun is at today's clock time on each day of a year.
     Returns, per day: the time t, the Sun's apparent direction for this observer
     (horizon frame, refraction included), where the dome model puts the Sun (world),
     and the point on the map with the Sun overhead (world). Cached per frame state. */
  Model.prototype.analemma = function (H) {
    var s = this.s, frac = this.time / 24 - Math.floor(this.time / 24), day = this.day, d0, d1;
    if (s.AnalemmaFrom >= 0) { d0 = Math.floor(s.AnalemmaFrom); d1 = Math.max(d0, day); }
    else { d0 = day - 182; d1 = day + 182; }
    d0 = Math.max(d0, DAY_MIN); d1 = Math.min(d1, DAY_MAX);
    var key = [d0, d1, frac.toFixed(6), s.ObserverLat, s.ObserverLong, H, s.DomeSize, s.DomeShape, s.SunOnDome, s.SunHeight, Geo.relief.on, Geo.relief.scale, Geo.relief.wall].join('|');
    if (this._anaKey === key) return this._ana;
    var lat = s.ObserverLat, lon = s.ObserverLong, out = [];
    for (var dd = d0; dd <= d1; dd++) {
      var t = dd + frac, sun = A.sun(t), th = A.gmst(t), rot = M3.rotZ(-th * U.D2R);
      out.push({
        t: t,
        local: A.refract(M3.apply(Geo.celestToLocal(lat, lon, th), sun.dir)),
        domeW: M3.apply(rot, Geo.body(sun.raDec.lat, sun.raDec.lon, s, H, s.SunOnDome, s.SunHeight)),
        groundW: Geo.fe(sun.raDec.lat, sun.raDec.lon - th),
        globe: V.fromLatLon(sun.raDec.lat, sun.raDec.lon - th, 1)
      });
    }
    this._anaKey = key; this._ana = out;
    return out;
  };

  /* ---------------- geometry ---------------- */

  function feRadius(lat) { return R_FE * (90 - lat) / 180; }

  var Geo = {
    R: R_FE,
    CAMERA_DIST: CAMERA_DIST,
    ZOOM_MIN: ZOOM_MIN, ZOOM_MAX: ZOOM_MAX, DAY_MIN: DAY_MIN, DAY_MAX: DAY_MAX,

    /* Ground point on the disc, on top of the terrain when relief is shown. */
    fe: function (lat, lon) {
      var r = feRadius(lat), a = lon * U.D2R;
      return [r * Math.cos(a), r * Math.sin(a), Geo.groundZ(lat, lon)];
    },
    /* Terrain settings, set from the model state by derive(). */
    relief: { on: false, scale: 20, wall: 600 },
    setRelief: function (s) {
      var r = Geo.relief;
      r.on = !!s.ShowRelief && !!FE.Relief; r.scale = s.ReliefScale; r.wall = s.IceWall;
      return r.on ? 'R|' + r.scale + '|' + r.wall : 'flat';
    },
    /* Height of the map surface (Mm) at a ground point: land relief, exaggerated
       ReliefScale times so its shape shows, and Antarctica (only) raised much
       higher, as a flat-topped ice wall IceWall km high. */
    groundZ: function (lat, lon) {
      var r = Geo.relief;
      if (!r.on) return 0;
      var h = FE.Relief.height(lat, lon) * r.scale / 1000, a = FE.Relief.antarctic(lat, lon);
      if (a > 0) h = Math.max(h, a * r.wall / 1000);
      return h;
    },
    /* Ground point for a position on the disc (inverse of fe, ignoring height). */
    latLonOf: function (x, y) {
      return { lat: 90 - 180 * Math.hypot(x, y) / R_FE, lon: Math.atan2(y, x) * U.R2D };
    },
    /* Point on the dome (dome frame) for declination / right ascension in degrees. */
    dome: function (dec, ra, domeSize, domeHeightMm, shape) {
      var Rd = domeSize * R_FE, r = feRadius(dec), a = ra * U.D2R;
      return [r * Math.cos(a), r * Math.sin(a), Geo.domeZ(r, Rd, domeHeightMm, shape)];
    },
    /* Dome profile z = H * (1 - (r/Rd)^2)^(shape/2): shape 1 is a half ellipsoid,
       below 1 a flatter top with steeper sides, above 1 more pointed. */
    domeZ: function (r, Rd, H, shape) {
      var q = Math.max(0, 1 - (r / Rd) * (r / Rd));
      return H * (shape === undefined || shape === 1 ? Math.sqrt(q) : Math.pow(q, shape / 2));
    },
    /* The Sun or Moon in the dome model (dome frame): on the dome, or at a fixed height
       (km) above the map, never above the dome itself. */
    body: function (dec, ra, s, H, onDome, heightKm) {
      var p = Geo.dome(dec, ra, s.DomeSize, H, s.DomeShape);
      if (!onDome) p[2] = Math.min(heightKm / 1000, p[2]);
      return p;
    },
    /* Horizon frame of a ground point, as world vectors. */
    frame: function (lat, lon) {
      var a = lon * U.D2R, c = Math.cos(a), s = Math.sin(a);
      return { pos: Geo.fe(lat, lon), up: [0, 0, 1], east: [-s, c, 0], north: [-c, -s, 0] };
    },
    /* Local-globe vector (x up, y east, z north) -> world direction in a frame. */
    localToWorld: function (F, v) {
      return [v[1] * F.east[0] + v[2] * F.north[0],
              v[1] * F.east[1] + v[2] * F.north[1],
              v[0]];
    },
    /* Celestial -> local globe rotation for an observer at lat/lon, Earth angle theta. */
    celestToLocal: function (lat, lon, theta) {
      return M3.mul(M3.rotY(lat * U.D2R), M3.rotZ(-(lon + theta) * U.D2R));
    },
    azEl: function (local) {
      var el = Math.asin(U.clamp(local[0], -1, 1)) * U.R2D;
      var az = U.wrap(Math.atan2(local[1], local[2]) * U.R2D, 360);
      return { az: az, el: el };
    }
  };

  /* Compute everything the renderer and HUD need from the current state. */
  Model.prototype.derive = function () {
    var s = this.s, t = s.DateTime;
    var H = s.DomeHeight / 1000;
    var th = A.gmst(t);
    var sun = A.sun(t), moon = A.moon(t);
    var lat = s.ObserverLat, lon = s.ObserverLong;
    var reliefKey = Geo.setRelief(s);

    var F = Geo.frame(lat, lon);
    var M = Geo.celestToLocal(lat, lon, th);
    var obsCel = V.fromLatLon(lat, lon + th, 1);              // observer, Earth radii

    var sunLocal = M3.apply(M, sun.dir);
    var moonTopo = V.norm(V.sub(V.scale(moon.dir, moon.distER), obsCel)); // parallax-corrected
    var moonLocal = M3.apply(M, moonTopo);

    var sunApp = A.refract(sunLocal), moonApp = A.refract(moonLocal);
    var planets = A.planets(t).map(function (p) {
      var loc = M3.apply(M, p.dir);
      return { name: p.name, dir: p.dir, raDec: p.raDec, mag: p.mag, color: p.color, local: loc, app: A.refract(loc) };
    });
    var domeRot = M3.rotZ(-th * U.D2R);
    var toWorld = function (p) { return M3.apply(domeRot, p); };
    var sunDome = Geo.body(sun.raDec.lat, sun.raDec.lon, s, H, s.SunOnDome, s.SunHeight);
    var moonDome = Geo.body(moon.raDec.lat, moon.raDec.lon, s, H, s.MoonOnDome, s.MoonHeight);

    var zp = U.clamp((s.Zoom - 2) / (ZOOM_MAX - 2), 0, 1);
    var rSphere = Math.min(((1 - zp) * 3000 + 2000) / 1000, H);

    // View center slides from mid-dome (zoomed out) to the target (zoomed in).
    var target = F.pos;
    if (s.RayTarget === 1 && s.RaySource === 2) target = toWorld(Geo.dome(lat, lon, s.DomeSize, H, s.DomeShape));
    var w = Math.pow(U.clamp((s.Zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN), 0, 1) - 1, 4);
    var center = V.lerp(target, [0, 0, H / 2], w);

    return {
      t: t, theta: th, H: H, domeRot: domeRot, toWorld: toWorld,
      sun: sun, moon: moon, frame: F, M: M, obsCel: obsCel,
      sunLocal: sunLocal, moonLocal: moonLocal, moonTopo: moonTopo,
      // What people see is lifted slightly by the atmosphere (refraction).
      sunApp: sunApp, moonApp: moonApp,
      sunAzEl: Geo.azEl(sunApp), moonAzEl: Geo.azEl(moonApp),
      sunUp: sunApp[0] > 0, moonUp: moonApp[0] > 0,
      planets: planets,
      sunDomeW: toWorld(sunDome), moonDomeW: toWorld(moonDome),
      sunEarthFixed: M3.apply(domeRot, sun.dir),
      rSphere: rSphere, center: center, reliefKey: reliefKey
    };
  };

  FE.Model = Model;
  FE.Geo = Geo;
})();
