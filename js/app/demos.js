/* demos.js — the six guided demos and the player that runs them.
 *
 * Each demo is a start state plus a list of segments (timelines). The keyframe
 * reached after each segment is computed by running the segment to its end, so
 * jumping back and forth always lands exactly where playback would. */
var FE = window.FE = window.FE || {};

(function () {
  var T1 = 1000, T2 = 2000, T3 = 3000, T4 = 4000, T5 = 5000, T6 = 6000, T7 = 7000, T8 = 8000, T10 = 10000;

  /* --- timeline helpers (mirroring the original Tval/Ttxt/Tpnt/Tpse) --- */
  /* Demo dates are written as day-of-year in 2026 (day 0 = 2026-01-01). The model's
     time scale counts days since 2017-01-01, so date values are shifted on the way in.
     2026 is 9 years after 2017, which keeps the Sun within 0.2 deg of the original
     demos' positions on the same calendar days. */
  var SHIFT = 3287;
  function val(prop, to, span, delay, ease) {
    if ((prop === 'DateTime' || prop === 'DayOfYear') && typeof to === 'number') to += SHIFT;
    return { prop: prop, to: to, span: span || 0, delay: delay || 0, ease: ease };
  }
  function lin(prop, to, span, delay) { return val(prop, to, span, delay, 'linear'); }
  function ser() { return { serial: [].slice.call(arguments) }; }
  function par() { return { parallel: [].slice.call(arguments) }; }
  function after(delay, node) { node.delay = (node.delay || 0) + delay; return node; }
  function pse(ms) { return { span: ms === undefined ? T2 : ms }; }
  function txt(s, delay) {
    if (typeof s !== 'string') return val('Description', '', 0, s || 0);
    return ser(val('Description', '', 0, delay || 0), val('Description', s, 0, 500));
  }
  /* Pointer: anchor names a scene object (see Scene.anchor) or a HUD box ('hud:date'). */
  function pnt(text, anchor, offset, delay) {
    if (typeof text !== 'string') return val('Pointer', null, 0, text === undefined ? 1 : text);
    return val('Pointer', { text: text, anchor: anchor, offset: offset }, 0, delay === undefined ? 1 : delay);
  }

  /* Clock time on a given day that keeps the dome at the same orientation (same GMST)
     as a reference moment, so only the Sun moves along its track. */
  function siderealTime(day, refT) {
    var g0 = FE.Astro.gmst(refT + SHIFT), g = FE.Astro.gmst(day + SHIFT);
    var h = FE.U.wrap(g0 - g, 360) / 360.98564736629 * 24;
    return h;
  }
  var ECL_REF = 117 + 9.44 / 24;

  var DEFAULT = {};
  Object.keys(FE.Model.FIELDS).forEach(function (k) { DEFAULT[k] = FE.Model.FIELDS[k].def; });
  // The demos were choreographed (camera moves, pointers, latitude sweeps) for an observer
  // on the equator at 15° E, so they keep that start even though the site opens on New York.
  DEFAULT.ObserverLat = 0; DEFAULT.ObserverLong = 15; DEFAULT.CameraDirection = 30; DEFAULT.GlobeAz = 0; DEFAULT.GlobeEl = 25;
  function state(over) {
    var o = {}; for (var k in DEFAULT) o[k] = DEFAULT[k];
    for (var j in over) o[j] = j === 'DateTime' ? over[j] + SHIFT : over[j];
    return o;
  }

  var DEMOS = {};

  DEMOS.Intro = { start: state({}), segs: [
    ser(val('ShowSphere', false), val('ShowSphereRays', false), val('ShowDomeRays', false),
      txt('This is the flat earth model with a dome, as flat earthers propose it.'),
      val('DateTime', 76.46, T10), val('ShowDomeRays', true), pse()),
    ser(pnt('Current date and time', 'hud:date', [-150, 60]),
      lin('DayOfYear', 63, T2, T1), lin('DayOfYear', 76, T2),
      pnt('Sun and Moon azimuth / elevation', 'hud:azel', [-160, 60], T1),
      pnt('The Sun', 'sun', null, T4),
      pnt('The Moon', 'moon', null, T4),
      val('ShowDomeGrid', false, 0, T3),
      pnt('Flat earth equator', { feNear: 0 }),
      pnt('Flat earth 0° meridian', { fe: [30, 0] }, null, T3),
      val('ShowDomeGrid', true, 0, T3), val('ShowFeGrid', false),
      pnt('Dome equator', { domeNear: 0 }),
      pnt('Dome 0° meridian', { dome: [30, 0] }, null, T3),
      pnt(T3), val('ShowFeGrid', true), val('Zoom', 3.4, T3),
      pnt('Observer location', 'observer', [-100, 70], T1),
      val('ObserverLat', -15, T2), val('ObserverLat', 15, T3), val('ObserverLat', 0, T2),
      pnt('North pole', 'pole', [80, -70], T1),
      pnt('Light ray from the Sun to the observer', 'sunRayMid', null, T3),
      pnt(T3), val('Zoom', 1.4, T3), val('ShowFeGrid', false), val('ShowDomeGrid', false),
      pnt('Night shadow', 'night', [110, -60], T1),
      val('Time', 13.20, T3), val('Time', 11.04, T3),
      pnt(), val('ShowDomeGrid', true, 0, T1), pse()),
    ser(txt('To produce sunrise and sunset as they are observed,'),
      txt('light rays cannot be straight. They must bend!', T4),
      val('DateTime', 78.2113, 2 * T10), pse()),
    ser(txt("From the observer's point of view,"),
      txt('the dome looks like a celestial sphere above the observer.', T3),
      val('ShowSphere', true, 0, T3),
      pnt('Celestial sphere', 'sphereNear'), pnt(T2),
      val('ShowSphereRays', true),
      par(val('CameraDirection', 76, T3), val('CameraHeight', 13, T3), val('Zoom', 2.5, T3)),
      pnt("The Sun's position on the dome", 'sun', null, T1),
      pnt("The Sun's apparent position", 'sunSphere', null, T3),
      pnt("The Moon's position on the dome", 'moon', null, T3),
      pnt("The Moon's apparent position", 'moonSphere', null, T3),
      pnt('Moon phase as the observer sees it', 'hud:phaseBox', [130, 70], T3),
      pse(T4)),
    ser(txt('While the Sun and Moon turn with the dome around its north pole,'),
      txt('they appear to move along latitude lines of the celestial sphere.', T4),
      pnt('Latitude line', { sphereCel: ['sun', -40] }, null, T4), pnt(T2),
      val('Time', 16.99, T5, T1), val('Time', 5.07, T5, T1), pse()),
    ser(txt("The elevation of the celestial pole equals the observer's latitude."),
      val('ShowFeGrid', true, 1, T3),
      val('ObserverLat', 90, T5), val('ObserverLat', 45, T3),
      pnt('Observer latitude 45°', 'observer', [-110, 70]), pse(T2),
      pnt('Pole elevation 45°', { sphereCel: [90, 0] }, [90, -70]), pse(T2), pnt(T2),
      val('Time', 16.99, T5), val('Time', 5.07, T5, T2), pse()),
    ser(txt('North of the equator, one celestial pole always points due north.'),
      pnt('North celestial pole', { sphereCel: [90, 0] }, [90, -70], T3), pnt(T2),
      val('ObserverLat', 90, T3), val('ObserverLat', 15, T3),
      txt('South of the equator, one celestial pole always points due south.'),
      val('ObserverLat', -45, T3),
      pnt('South celestial pole', { sphereCel: [-90, 0] }, [-90, -70]), pnt(T2),
      val('ObserverLat', -90, T3), val('ObserverLat', -15, T3),
      txt('At the equator the celestial poles sit on the horizon, due north and due south.'),
      val('ObserverLat', 0, T2, T3),
      txt('Sun, Moon and stars appear to turn around the celestial poles everywhere on Earth (see star trails)!'),
      after(T3, par(lin('DateTime', 82.5, 5 * T10),
        val('ObserverLat', -80, T10), val('ObserverLat', 80, 2 * T10, T10), val('ObserverLat', 0.001, T10, 3 * T10))),
      after(T1, par(val('CameraDirection', 30, T3), val('CameraHeight', 25, T3), val('Zoom', 1.4, T3))))
  ]};

  var eclipseNoGrid = ser(val('ShowFeGrid', false), val('ShowShadow', false), val('ShowDomeGrid', false),
    val('ShowSphere', false), val('ShowSphereRays', false), val('ShowDomeRays', false));

  DEMOS.Eclipses = { start: state({}), segs: [
    ser(txt("Let's look at the tracks of the Sun and Moon on the dome..."),
      eclipseNoGrid, val('ShowSunTrack', true), val('ObserverLat', 90), val('ObserverLong', 0),
      par(val('CameraDirection', 0, T4), val('CameraHeight', 89.9, T4), val('Zoom', 1.25, T4),
        lin('DayOfYear', 117, T4), val('Time', 9.44, T4)),
      pse(T3)),
    ser(txt("Earth's axis is tilted 23.4° against its orbital plane around the Sun (the ecliptic)."),
      txt('So the Sun follows a tilted track against the fixed stars, which causes the seasons.', T5),
      pnt("The Sun's ecliptic: its yearly track on the dome", { ecl: 200 }, null, T5),
      pse(T5)),
    ser(pnt(), txt('The 4 red dots mark the equinoxes and solstices.'),
      pnt('Celestial equator', { domeNear: 0 }, null, T5),
      pnt('June solstice line', { domeNear: 23.44 }, null, T3),
      pnt('December solstice line', { domeNear: -23.44 }, null, T3),
      pnt(T3),
      after(T1, par(val('DayOfYear', 171, T2), val('Time', siderealTime(171, ECL_REF), T2))),
      pnt('June solstice', 'sun', null, T1), pnt(T3),
      par(val('DayOfYear', 265, T3), val('Time', siderealTime(265, ECL_REF), T3)),
      pnt('September equinox', 'sun', null, T1), pnt(T3),
      par(val('DayOfYear', 354, T3), val('Time', siderealTime(354, ECL_REF), T3)),
      pnt('December solstice', 'sun', null, T1), pnt(T3),
      par(val('DayOfYear', 443, T3), val('Time', siderealTime(443, ECL_REF), T3)),
      pnt('March equinox', 'sun', null, T1), pnt(T3),
      par(val('DayOfYear', 482, T2), val('Time', siderealTime(482, ECL_REF), T2)),
      val('DayOfYear', 117), val('Time', 9.44), pse()),
    ser(txt("Now the track of the Moon:"),
      val('ShowSunTrack', false, 0, T1), val('ShowMoonTrack', true, 0, T1),
      pnt("The Moon's orbit: its monthly track on the dome", { moonOrb: 100 }, null, T5),
      txt("The Moon's orbit is tilted 5.1° against the Sun's ecliptic.", T5),
      txt("So the Moon's track reaches up to 5.1° farther north and south than the Sun's.", T7),
      pse(T5)),
    ser(pnt(), val('ShowSunTrack', true, 0, T1),
      txt("The green dots are the nodes, where the Moon's track crosses the Sun's."),
      pnt('Ascending node', 'node', null, T1),
      txt("The Moon's orbit turns backwards by 19.3° per year,", T5),
      txt('so the nodes slowly drift against the motion of the Sun and Moon.', T5),
      after(T3, par(lin('DayOfYear', 482, 2 * T10), lin('Time', -14.48, 2 * T10))),
      val('Time', 9.47), val('DayOfYear', 117, 0, T3), val('Time', 9.44),
      pnt(T3), pse()),
    ser(txt('When the Sun and Moon meet at opposite nodes, there is a lunar eclipse.'),
      txt('When they meet at the same node, there is a solar eclipse.', T5),
      after(T5, par(lin('DayOfYear', 223, T10), val('Time', 17.82, T10))),
      pnt('Solar eclipse, 12 Aug 2026, 17:49 UTC', 'sun', null, T1),
      pse()),
    ser(txt('Total solar eclipse of 12 August 2026, seen from Reykjavik'), pnt(),
      val('ShowDomeGrid', true), val('ObserverLong', -21.94),
      par(val('ObserverLat', 64.15, T5), val('CameraDirection', -5, T5), val('CameraHeight', 19, T5), val('Zoom', 3.1, T5)),
      val('ShowSphere', true), val('ShowSphereRays', true),
      pnt('Sun and Moon in the same direction', 'sunSphere', null, T1),
      val('ShowDomeRays', true, 0, T3),
      pnt('Sun and Moon at the same spot on the dome', 'sun', null, T1),
      pnt(T3)),
    ser(val('Zoom', 2.2, T3), val('ShowShadow', true),
      val('DateTime', 223.2221, T5),
      pnt('Sunrise: not yet aligned', 'sunSphere', null, T1),
      pnt('Sunrise: not yet aligned', 'sun', null, T3), pnt(T3),
      val('DateTime', 223.9058, T5),
      pnt('Sunset: no longer aligned', 'sunSphere', null, T1),
      pnt('Sunset: no longer aligned', 'sun', null, T3), pnt(T3),
      val('ShowSunTrack', false), val('ShowMoonTrack', false), txt(),
      par(val('ObserverLat', 0, T4), val('ObserverLong', 15, T4), val('CameraDirection', 30, T4),
        val('CameraHeight', 25, T4), val('Zoom', 1.4, T4), val('DateTime', 82.5, T4)),
      val('ShowFeGrid', true))
  ]};

  DEMOS.Equinox = { start: state({}), segs: [
    ser(txt("Let's look at the light rays at the equinox."), val('ShowFeGrid', false),
      par(val('CameraDirection', 45, T3), val('CameraHeight', 15, T3), val('Zoom', 1.9, T3),
        val('DateTime', 78.254167, T3), val('ObserverLong', 0, T3)),
      pse()),
    ser(txt('At the equinox the Sun rises due east everywhere on Earth.'),
      pnt('Sunrise due east', { sphere: [90, 0] }, null, T1), pnt(T3),
      par(val('ObserverLong', -360, T10), val('Time', 30.1, T10), val('CameraDirection', -315, T10),
        val('ObserverLat', 85, T3), val('ObserverLat', -75, T4, T3), val('ObserverLat', 0.01, T3, T7)),
      val('DateTime', 79.2542),
      txt('And at the equinox the Sun sets due west everywhere on Earth.'),
      val('DateTime', 79.7458, T3),
      pnt('Sunset due west', { sphere: [270, 0] }, null, T1), pnt(T3),
      val('DayOfYear', 78), val('Time', 41.9),
      par(val('ObserverLong', 0, T10), val('Time', 17.9, T10), val('CameraDirection', 45, T10),
        val('ObserverLat', 85, 0.9 * T3), val('ObserverLat', -60, 0.9 * T4, T3), val('ObserverLat', 0.001, T3, T7)),
      pse()),
    ser(txt("Let's see how the Sun spreads its light:"),
      val('ShowSphere', false), val('ShowSphereRays', false), val('ShowManyRays', true),
      val('RayTarget', 1, 0, T2), pse()),
    ser(val('DateTime', 78.4875, T3, T1),
      after(T1, par(val('ObserverLat', -90, T5), val('Zoom', 1.6, T5), val('CameraDirection', 184, T5), val('CameraHeight', 89.9, T5))),
      txt('Equinox: sunrise due east, sunset due west, everywhere.'),
      pnt('Sunrise due east', 'dawn', null, T1), pnt(T3),
      pnt('Sunset due west', 'dusk', null, T1), pnt(T3)),
    ser(after(T1, par(val('Zoom', 1.3, T5), val('CameraHeight', 20, T5))),
      val('DateTime', 79.489933, 2 * T10), val('DateTime', 78.489933))
  ]};

  var yearOfNoons = ser(lin('DayOfYear', 443, T10, T1), val('DayOfYear', 78));

  DEMOS.DayNight = { start: state({}), segs: [
    ser(txt("Let's look at the shape of the night shadow on the flat earth."),
      val('ShowFeGrid', false), val('ShowSphere', false), val('ShowSphereRays', false), val('ShowDomeRays', false),
      par(val('ObserverLong', 0, T2), val('CameraDirection', 0, T2), val('CameraHeight', 30, T2),
        val('Zoom', 1.25, T2), lin('DayOfYear', 78, T2), val('Time', 12, T2))),
    ser(txt("The edge of the night shadow is computed from reality. It depends on the Sun's position."),
      yearOfNoons,
      txt('Each step shows the Sun at noon at longitude 0°, starting at the March equinox.'),
      ser(lin('DayOfYear', 443, T10, T1), val('DayOfYear', 78)),
      pse()),
    ser(txt('Note the figure 8 (the analemma) the Sun traces through the year.'),
      val('ShowSunTrack', true),
      ser(lin('DayOfYear', 443, T10, T1), val('DayOfYear', 78)),
      pse()),
    ser(txt('This is how the Sun lights the day side of the flat earth.'),
      val('ShowDomeGrid', false), val('ShowSunTrack', false), val('ShowManyRays', true), val('RayTarget', 1),
      par(val('Zoom', 1.5, T2), val('CameraHeight', 25, T2)),
      ser(lin('DayOfYear', 443, T10, T1), val('DayOfYear', 78)),
      pse()),
    ser(val('CameraDirection', 90, T3),
      par(ser(lin('DayOfYear', 717, 3 * T5, T1), val('DayOfYear', 352)), val('CameraHeight', 10, 3 * T5)),
      pse())
  ]};

  DEMOS.Poles = { start: state({}), segs: [
    ser(txt("Let's look at day and night at the poles at the solstices:"),
      val('ShowFeGrid', false), val('ShowSunTrack', true),
      par(val('CameraDirection', 45, T3), val('CameraHeight', 15, T3), val('Zoom', 1.9, T3)),
      txt('Setting the date to the June solstice:'),
      val('DayOfYear', 171, T3), val('DateTime', 171.5),
      txt('June solstice, north pole'),
      val('ObserverLat', 90, T3), val('DateTime', 172.5, T3),
      txt('June solstice, north pole: 24 hours of daylight'),
      val('DateTime', 174.5, T6), pse()),
    ser(txt('June solstice, Antarctica'), val('DateTime', 171.5),
      val('ObserverLat', -90, T3), val('DateTime', 172.5, T3),
      txt('June solstice, Antarctica: 24 hours of darkness'),
      val('DateTime', 174.5, T6), pse()),
    ser(txt('Setting the date to the December solstice:'),
      val('ObserverLat', 0, T2), val('DayOfYear', 354, T3), val('DateTime', 354.5),
      txt('December solstice, north pole'),
      val('ObserverLat', 90, T3), val('DateTime', 355.5, T3),
      txt('December solstice, north pole: 24 hours of darkness'),
      val('DateTime', 357.5, T6), val('DateTime', 354.5, 0, T1), pse()),
    ser(txt('December solstice, Antarctica'),
      val('ObserverLat', -90, T3), val('DateTime', 355.5, T5),
      txt('December solstice, Antarctica: 24 hours of daylight'),
      val('DateTime', 357.9583, 2 * T10), pse()),
    ser(txt('To light Antarctica, sun rays would have to arc over the night side, past the north pole!'),
      val('CameraDirection', 15, T3), val('CameraDirection', -15, T3, T1), val('CameraDirection', 45, T5, T1),
      val('Zoom', 1.6, T2, T1), val('ShowManyRays', true), val('RayTarget', 1), val('ShowSunTrack', false),
      val('CameraDirection', 15, T3, T1), val('CameraDirection', -15, T3, T1),
      after(T1, par(val('CameraDirection', 105, T10), val('ObserverLat', 35, T5))),
      val('CameraHeight', 89.9, T5, T1), val('CameraHeight', 15, T5, T1))
  ]};

  DEMOS.Stars = {
    start: state({ ObserverLat: 45, ObserverLong: -100, Zoom: 1.25, CameraDirection: -35, CameraHeight: 25, DateTime: 78.25,
      ShowFeGrid: false, ShowShadow: false, ShowDomeRays: false, ShowSphereRays: false }),
    segs: [
      ser(txt("Let's see how starlight would have to bend to produce real star trails."),
        val('ShowStars', true, 0, T2),
        par(val('CameraDirection', -85, T2), val('CameraHeight', 4, T2), val('Zoom', 3, T2)),
        pse()),
      ser(txt('The observer sees the stars turn around one celestial pole, at an elevation equal to the latitude.'),
        par(lin('DateTime', 82.25, 4 * T8),
          val('Description', 'North of the equator, the stars turn counter-clockwise around Polaris.', 0, T8),
          pnt('Polaris', { sphereCel: [90, 0] }, [90, -70], T8),
          pnt(2 * T8),
          val('Description', 'At the equator, the stars turn around two poles on the horizon.', 0, 2 * T8),
          val('ObserverLat', 0, T3, 2 * T8), val('CameraDirection', -50, T3, 2 * T8),
          val('Description', 'South of the equator, the stars turn clockwise around a pole due south.', 0, 3 * T8),
          val('ObserverLat', -45, T3, 3 * T8), val('CameraDirection', 80, T3, 3 * T8)),
        pse()),
      ser(txt("These are the light rays to the stars on the observer's celestial sphere:"),
        val('ShowSphereRays', true), val('ShowManyRays', true),
        par(lin('DateTime', 90.25, 8 * T8),
          val('Description', 'And these are the light rays to the same stars on the dome.', 0, T8),
          val('ShowDomeRays', true, 0, T8),
          val('Zoom', 1, T5, 2 * T8), val('CameraHeight', 89.9, T5, 2 * T8), val('ShowSphereRays', false, 0, 2 * T8),
          val('Zoom', 1.4, T5, 3 * T8), val('CameraHeight', 25, T5, 3 * T8), val('CameraDirection', -35, T5, 3 * T8),
          val('CameraDirection', -100, T5, 4 * T8),
          val('CameraDirection', 300, 2 * T10, 5 * T8))),
      ser(par(lin('DateTime', 96.25, 8 * T8),
          val('ObserverLat', -90, T4, T8), val('ObserverLat', 90, T8, 2 * T8), val('ObserverLat', 0, T4, 4 * T8),
          val('ObserverLat', -61, T4, 5 * T8)),
        pse()),
      ser(txt('How can the same southern star be seen from 3 continents at once, looking south?'),
        val('ShowShadow', true), val('ShowSphere', false), val('ShowDomeRays', false), val('ShowSphereRays', false),
        val('RaySource', 2),
        par(val('DayOfYear', 172, T2), val('ObserverLat', 90, T2), val('Zoom', 1, T2)),
        val('ObserverLong', -95),
        par(val('DateTime', 172.9, T3), val('CameraDirection', 30, T3), val('CameraHeight', 30, T3)),
        pse()),
      ser(txt('At the June solstice it can be night on 3 continents at the same time.'),
        pnt('South America', { fe: [-15, -60] }, null, T3),
        pnt('Africa', { fe: [-5, 22] }, null, T2),
        pnt('Australia', { fe: [-25, 134] }, null, T2), pnt(T2),
        txt('The same star is visible due south from all of them at once!'),
        val('RayTarget', 1, 0, T1),
        par(val('ObserverLat', -70, T3), val('Zoom', 1.4, T3)),
        val('ShowFeGrid', true), val('ShowDomeGrid', false),
        after(T2, par(val('CameraDirection', -60, T3), val('CameraHeight', 89.9, T3), val('Zoom', 1.2, T3))),
        pse(T4),
        val('CameraHeight', 36, T4),
        val('CameraDirection', -150, T3, T2), val('CameraDirection', -60, T3, T2),
        txt('Move the star with the green latitude and longitude sliders.'))
    ]
  };

  /* ---------------- cards, new chapters, and the order ---------------- */
  /* A title or summary card, shown for ms (scaled by playback speed). */
  function card(title, lines, ms, kicker) {
    return ser(val('Card', { title: title, lines: lines, kicker: kicker || '' }), pse(ms || 9000), val('Card', null));
  }
  function opening(name, title, lines, ms) { DEMOS[name].segs.unshift(card(title, lines, ms || 7000, 'Demo')); }
  function closing(name, lines, ms) {
    DEMOS[name].segs.push(ser(txt(), pnt(), card('What this shows', lines, ms || 10000, 'Summary')));
  }

  DEMOS.How = {
    start: state({ ObserverLat: 51.51, ObserverLong: -0.13, DateTime: 78 + 16 / 24, ShowSphereRays: true }),
    segs: [
      card('How this model works', [
        'Every position of the Sun, Moon and stars comes from real astronomy, computed for a round Earth.',
        'Each object is then placed on the dome, above the spot on the map where it is overhead.',
        'The observer sees each object where people actually see it in the sky.',
        'Where those two directions disagree, light would have to bend. The curved rays show how much.'
      ], 12000, 'Start here'),
      ser(txt('The Sun sits on the dome above the point where it is overhead right now.'),
        pnt('The Sun on the dome', 'sun', null, T1),
        pnt('The point where the Sun is overhead', 'subsolar', [110, 60], T4), pnt(T4),
        txt('This observer is in London, at 16:00 UTC on the March equinox.', T1),
        pnt('Observer in London', 'observer', [-110, 70], T1),
        par(val('Zoom', 2.6, T4), val('CameraDirection', 20, T4), val('CameraHeight', 16, T4)),
        pnt('Where the Sun really appears: {sunEl}° up, in the southwest', 'sunSphere', null, T1), pse(T4),
        pnt('So the ray has to curve to arrive from that direction', 'sunRayMid', null, T1), pse(T5), pnt()),
      ser(txt("Now look through the observer's eyes."),
        val('SkyAz', 244), val('SkyAlt', 22), val('SkyFov', 100), val('SkyDomeGhost', true), val('ShowRealStars', true),
        val('ViewMode', 1, 0, T2), pse(T2),
        txt('The dashed ring is where the dome Sun would be if its light came in a straight line: {ghostSunEl}° up.'), pse(T7),
        txt('The real Sun is {sunEl}° up. Watch both as the Sun sets.'), pse(T3),
        par(lin('Time', 18.45, 1.6 * T10), val('SkyAz', 270, 1.6 * T10)),
        txt('The real Sun has set. The dome Sun is still {ghostSunEl}° above the horizon.'), pse(T7)),
      ser(txt('The same moment on a globe. Sunlight arrives as parallel, straight rays.'),
        val('GlobeAz', -75), val('GlobeEl', 20), val('GlobeZoom', 1), val('ViewMode', 2), pse(T4),
        par(val('GlobeAz', -25, T6), val('GlobeEl', 42, T6), val('GlobeZoom', 1.6, T6)),
        txt('London has turned onto the night side, so the Sun has set there. No ray has to bend.'), pse(T7)),
      ser(val('ViewMode', 0), txt(),
        card('The key idea', [
          'On a globe, every ray of light from the Sun to an observer is straight.',
          'On the dome, light would have to bend by a different amount for every observer, at every moment, to give the sky people see.',
          'No known physics bends light like this. The other demos show where it gets extreme.'
        ], 11000, 'Summary'))
    ]
  };

  DEMOS.Limits = {
    start: state({ ObserverLat: 0, ObserverLong: 0, DateTime: 171, ShowSphere: true }),
    segs: [
      card('Where the dome model breaks', [
        'These are everyday observations the dome model can only match by bending light, or not at all.',
        '1. The Sun never sets on the dome.',
        '2. The Sun would change size during the day.',
        '3. Southern distances come out far too long.',
        '4. One star is seen due south from three continents at once.'
      ], 12000, 'Limitations'),
      ser(txt('1. It is midnight on the equator, on the June solstice.'),
        val('SkyAz', 0), val('SkyAlt', 18), val('SkyFov', 100), val('SkyDomeGhost', true), val('ViewMode', 1, 0, T2), pse(T3),
        txt('The sky is dark, yet the dome Sun is {ghostSunEl}° above the northern horizon.'), pse(T7),
        txt('Seen in a straight line, a Sun on a dome never goes below the horizon for anyone.'), pse(T6)),
      ser(val('ViewMode', 0), txt('2. The same observer, from sunrise to sunset.'),
        val('DateTime', 171 + 6 / 24), par(val('Zoom', 1.4, T3), val('CameraHeight', 22, T3)), pse(T2),
        txt('A Sun {sunSize} km wide (a common flat-earth figure) is {domeSunDist} km away, so it would look {domeSunSize}° wide.'),
        lin('DateTime', 171 + 18 / 24, 2 * T10), pse(T2),
        txt('The real Sun looks about 0.53° wide all day. It does not shrink at sunset.'), pse(T6)),
      ser(txt('3. Sydney to Santiago.'),
        val('Route', { a: [-33.87, 151.21], b: [-33.45, -70.67], names: ['Sydney', 'Santiago'] }),
        par(val('CameraHeight', 89.9, T3), val('CameraDirection', 0, T3), val('Zoom', 1.15, T3)),
        pnt('Sydney', { fe: [-33.87, 151.21] }, [-90, -60], T1), pse(T2),
        pnt('Santiago', { fe: [-33.45, -70.67] }, [90, -60], T1), pse(T2), pnt(),
        txt('On the globe the trip is about {routeReal} km (green). Nonstop flights take about 13 hours, which fits.'), pse(T7),
        txt('On the flat map the same trip is {routeFlat} km (orange), more than twice as far.'), pse(T7),
        txt(), val('Route', null)),
      ser(txt('4. June solstice, night in South America, Africa and Australia.'),
        val('ShowStars', true), val('ShowShadow', true), val('ShowDomeGrid', false), val('ShowFeGrid', true),
        val('DateTime', 172.9), val('ObserverLat', -70), val('ObserverLong', -95), val('RaySource', 2), val('RayTarget', 1),
        par(val('CameraHeight', 60, T3), val('CameraDirection', -60, T3), val('Zoom', 1.25, T3)), pse(T2),
        txt('One southern star is seen due south from all three. Its light would have to fan out across the whole rim.'), pse(T8),
        val('RayTarget', 0), val('ShowStars', false), val('ObserverLat', 0), val('ObserverLong', 15)),
      ser(txt(), card('Summary', [
        'The dome model needs light to bend differently for each observer.',
        'Even then, it cannot keep the Sun the same size or make southern distances fit.',
        'A round Earth explains all four with straight light.'
      ], 11000, 'Limitations'))
    ]
  };

  DEMOS.Sim = {
    start: state({ ObserverLat: 51.51, ObserverLong: -0.13, DateTime: 78 + 18.2 / 24 }),
    segs: [
      card('About this simulation', [
        'The real sky is computed with standard astronomy formulas for the Sun, the Moon and the Earth’s rotation, accurate to a few arcminutes.',
        'Stars: about 190 of the brightest, accurate to about 0.1°.',
        'The map is the azimuthal equidistant projection, centered on the North Pole, as flat-earth maps use.'
      ], 11000, 'This simulation'),
      card('Its limitations', [
        'The bent rays are smooth curves that join the two ends. They are not a law of physics; the dome model has none.',
        'Refraction uses a standard average atmosphere, so real sunsets can differ by a minute or two.',
        'Planets Mercury to Saturn, and only the brightest stars.',
        'Dates from 2025 to 2030.'
      ], 12000, 'This simulation'),
      ser(txt("The dome's height is a free choice. Does any height fix sunset?"),
        val('SkyAz', 285), val('SkyAlt', 20), val('SkyFov', 110), val('SkyDomeGhost', true), val('ViewMode', 1, 0, T1), pse(T3),
        txt('Dome height {domeHeight} km: the dome Sun is {ghostSunEl}° up while the real Sun is setting.'),
        val('DomeHeight', 2000, T8), pse(T3), val('DomeHeight', 20000, T10), pse(T3), val('DomeHeight', 9000, T5),
        txt('A lower or higher dome moves the dome Sun, but never down to the horizon.'), pse(T6),
        txt('Many flat-earth descriptions put the Sun below the dome instead, about 5,000 km up.'),
        val('SunOnDome', false), val('SunHeight', 4800), pse(T5),
        txt('Sun {sunHeight} km up: the dome-model Sun is {ghostSunEl}° above the horizon.'),
        val('SunHeight', 500, T8), pse(T2), val('SunHeight', 15000, T10), pse(T2), val('SunHeight', 4800, T5),
        txt('A lower Sun sits lower in the sky, but it still never sets.'), pse(T6),
        val('SunOnDome', true),
        val('ViewMode', 0), txt()),
      card('What could be improved', [
        'Twilight colors and a fuller star catalog.',
        'Let viewers measure things themselves: Polaris’s height from two cities, shadow lengths, flight times.',
        'More cities and routes to compare on the dome and the globe.',
        'The source code is open: anyone can check it, fix it or add to it.'
      ], 13000, 'Next steps')
    ]
  };

  /* ---------------- the 2-minute introduction video ----------------
   * Nine beats, each timed to one paragraph of the narration script. Open the site
   * with #rec=Video for a clean recording view (or #rec=Video,cap to keep captions). */
  function beat(caption, main) { return par(txt(caption), main); }
  DEMOS.Video = {
    start: state({ ObserverLat: 40.71, ObserverLong: -74.01, DateTime: 78.5,
      CameraDirection: 0, CameraHeight: 89.9, Zoom: 1.15,
      ShowSphere: false, ShowSphereRays: false, ShowDomeRays: false, ShowShadow: false, ShowDomeGrid: false }),
    segs: [
      // 1. The map (0:00-0:13)
      par(lin('CameraDirection', 25, 13000),
        ser(val('Card', { title: 'The Geocentric Model', lines: ['How the flat-earth dome model works'], kicker: 'Introduction' }),
          pse(4000), val('Card', null),
          pnt('North Pole: the center of the map', 'pole', [90, -70]), pse(4000),
          pnt('Every latitude is a circle', { feNear: 30 }, [-110, -60]), pse(4500), pnt())),
      // 2. Antarctica as the ice wall (0:13-0:25)
      beat('Antarctica is stretched around the whole edge: the ice wall.',
        par(val('CameraHeight', 14, 6000), val('Zoom', 1.7, 6000), val('CameraDirection', 110, 12000),
          ser(pse(4000), pnt('Antarctica: the ice wall', { feNear: -80 }, [-100, -70]), pse(7500), pnt()))),
      // 3. The dome (0:25-0:33)
      beat('Above the map stands the dome, the firmament.',
        par(val('ShowDomeGrid', true), val('CameraHeight', 24, 5000), val('Zoom', 1.35, 5000), val('CameraDirection', 140, 8000),
          ser(pse(1500), pnt('The dome', { domeNear: 35 }, [-110, -60]), pse(6000), pnt()))),
      // 4. The Sun circles once a day, lighting one part at a time (0:33-0:48)
      beat('The Sun circles the center once a day, lighting one part of the world at a time.',
        par(val('ShowShadow', true), lin('DateTime', 79.5, 15000), val('CameraDirection', 200, 15000),
          ser(pnt('The Sun', 'sun', null), pse(4500),
            pnt('Night', 'night', [110, -60]), pse(5000),
            pnt('Day', 'subsolar', [-110, 60]), pse(5000), pnt()))),
      // 5. Seasons: between the tropics (0:48-1:10)
      beat('Through the year the Sun moves between the Tropic of Cancer and the Tropic of Capricorn.',
        ser(par(val('CameraHeight', 89.9, 3000), val('CameraDirection', 0, 3000), val('Zoom', 1.2, 3000),
              val('ShowSunTrack', true), val('ShowDomeGrid', false), val('DayOfYear', 171, 3000)),
          pnt('June: over the Tropic of Cancer', 'sun', null), pse(4000), pnt(),
          lin('DayOfYear', 354, 7000),
          pnt('December: over the Tropic of Capricorn', 'sun', null), pse(4000), pnt(),
          lin('DayOfYear', 536, 4000))),
      // 6. The Moon (1:10-1:22), one frame per day at the same clock time
      beat('The Moon follows a similar path, slipping behind the Sun a little each day.',
        ser(val('ShowSunTrack', false), val('ShowMoonTrack', true),
          par(lin('DayOfYear', 566, 11000), val('CameraHeight', 55, 4000), val('Zoom', 1.3, 4000),
            ser(pnt('The Moon, at the same time each day', 'moon', null), pse(5500),
              pnt('Its phase', 'hud:phaseBox', [130, 70]), pse(5500), pnt())), pse(1000))),
      // 7. Stars and planets on the turning dome (1:22-1:35)
      beat('The stars and planets sit on the dome and turn with it, around Polaris.',
        ser(val('ShowMoonTrack', false), val('ShowDomeGrid', true),
          par(val('CameraHeight', 9, 4000), val('Zoom', 1.45, 4000), val('CameraDirection', 260, 4000),
            lin('DateTime', 567.5, 13000),
            ser(pse(3500), pnt('Polaris, above the North Pole', { dome: [89.9, 0] }, [100, -60]), pse(5000),
              pnt('Stars and planets on the dome', { domeNear: 20 }, [-110, -60]), pse(4500), pnt())))),
      // 8. The observer and the light ray (1:35-1:52)
      beat('Light from the dome Sun has to curve to arrive where people really see the Sun.',
        ser(val('ObserverLat', 51.51), val('ObserverLong', -0.13), val('DateTime', 78 + 16 / 24),
          val('ShowSphere', true), val('ShowSphereRays', true), val('ShowDomeRays', true),
          par(val('Zoom', 2.6, 4000), val('CameraDirection', 380, 4000), val('CameraHeight', 16, 4000)),
          pnt('Observer in London', 'observer', [-110, 70]), pse(3000),
          pnt('Where the Sun really appears', 'sunSphere', null), pse(3000),
          pnt('The light ray has to curve', 'sunRayMid', null), lin('Time', 17.95, 7000), pnt())),
      // 9. Outro (1:52-2:02)
      beat('',
        par(val('Zoom', 1.3, 8000), val('CameraHeight', 30, 8000), val('CameraDirection', 470, 10000),
          ser(pse(2500), val('Card', { title: 'Explore the Geocentric Model', kicker: 'Try it yourself',
            lines: ['Change the date, the time and your place.', 'Free and open source.'] }), pse(7500))))
    ]
  };

  /* ---------------- the next eclipse (Feb 2027) ----------------
   * The annular solar eclipse of 6 Feb 2027 (not visible from New York) and the
   * penumbral lunar eclipse of 20 Feb 2027, the next one New York can see.
   * Dates are days of 2026 as elsewhere: 401 = 6 Feb 2027, 415 = 20 Feb 2027. */
  var E27 = 401, L27 = 415;
  function h(day, hours) { return day + hours / 24; }
  DEMOS.NextEclipse = {
    start: state({ ObserverLat: 40.71, ObserverLong: -74.01, DateTime: h(E27, 12.6),
      CameraDirection: -40, CameraHeight: 89.9, Zoom: 1.15, ShowEclipse: true,
      ShowSphere: false, ShowSphereRays: false, ShowDomeRays: false, ShowDomeGrid: false, ShowFeGrid: false, ShowShadow: true }),
    segs: [
      // 1. The Moon's shadow crosses the map, 12:57-19:02 UTC.
      ser(txt('6 February 2027: the Sun and the new Moon meet on the dome.'),
        val('ShowSunTrack', true), val('ShowMoonTrack', true),
        pnt('Sun and Moon at the same spot', 'sun', null, T1), pse(T4), pnt(),
        val('ShowSunTrack', false), val('ShowMoonTrack', false),
        txt("12:57 UTC: the Moon's shadow first touches the Earth."),
        par(lin('DateTime', h(E27, 19.1), 3 * T10), val('CameraHeight', 60, 3 * T10), val('Zoom', 1.3, 3 * T10),
          ser(pse(T3), pnt('Partial eclipse inside the yellow outline', 'penumbra', [110, -60]), pse(T6),
            pnt('Ring of fire here now: {shadowAt}', 'shadow', [-120, -60]), pse(T10 + T3), pnt(),
            txt('19:02 UTC: the shadow leaves the Earth off West Africa.'))),
        pse(T2)),
      // 2. Greatest eclipse, about 16:00 UTC off southern Brazil.
      ser(txt('Greatest eclipse: about 16:00 UTC, in the South Atlantic off southern Brazil.'),
        par(val('DateTime', h(E27, 15.983), T4), val('ObserverLat', -30.16, T4), val('ObserverLong', -49.0, T4),
          val('CameraHeight', 22, T4), val('Zoom', 3.0, T4), val('CameraDirection', -35, T4)),
        val('ShowSphere', true), val('ShowSphereRays', true), val('ShowDomeRays', true),
        pnt('Sun and Moon in the same direction', 'sunSphere', [120, -70], T1), pse(T4),
        pnt('Sun and Moon at the same spot on the dome', 'sun', [120, -60], T1), pse(T4), pnt()),
      // 3. The ring of fire, through the observer's eyes.
      ser(txt("Through this observer's eyes: the Moon is too small to cover the whole Sun."),
        val('SkyAz', 336.6), val('SkyAlt', 74.2), val('SkyFov', 60), val('DateTime', h(E27, 15.93)), val('ViewMode', 1, 0, T1),
        val('SkyFov', 4, T4), txt('A ring of fire, lasting up to nearly 8 minutes.'),
        par(lin('DateTime', h(E27, 16.03), T10), lin('SkyAz', 331.7, T10), lin('SkyAlt', 73.7, T10)), pse(T2)),
      // 4. New York: daytime, but outside the shadow.
      ser(val('ViewMode', 0), txt('Meanwhile in New York the Sun is up, but the shadow misses.'),
        par(val('ObserverLat', 40.71, T4), val('ObserverLong', -74.01, T4), val('CameraHeight', 45, T4),
          val('Zoom', 1.6, T4), val('CameraDirection', -60, T4)),
        pnt('New York: outside the outline', 'observer', [-110, 70], T1), pse(T4), pnt(),
        txt('From New York, the Moon passes {sunMoonSep}° below the Sun: no eclipse.'),
        val('SkyAz', 144.8), val('SkyAlt', 25.7), val('SkyFov', 8), val('DateTime', h(E27, 15)), val('ViewMode', 1, 0, T1),
        pse(T2),
        par(lin('DateTime', h(E27, 16), T4), lin('SkyAz', 160.1, T4), lin('SkyAlt', 31.0, T4)),
        par(lin('DateTime', h(E27, 17), T4), lin('SkyAz', 177.1, T4), lin('SkyAlt', 33.3, T4)),
        par(lin('DateTime', h(E27, 18), T4), lin('SkyAz', 194.3, T4), lin('SkyAlt', 32.4, T4)),
        pse(T2)),
      // 5. Two weeks later: the lunar eclipse, on the dome.
      ser(val('ViewMode', 0), txt('Two weeks later, 20 February 2027: a lunar eclipse.'),
        val('ShowSphere', false), val('ShowSphereRays', false), val('ShowDomeRays', false), val('DateTime', h(L27, 23.2)),
        par(val('CameraHeight', 89.9, T3), val('Zoom', 1.15, T3), val('CameraDirection', 0, T3)),
        val('ShowSunTrack', true), val('ShowMoonTrack', true),
        pnt('The full Moon, opposite the Sun', 'moon', null, T1), pse(T4),
        pnt('The Sun', 'sun', null, T1), pse(T3), pnt(),
        txt("On the globe, the Moon passes through the edge of the Earth's shadow."), pse(T5),
        txt('In the dome model, nothing sits between the Sun and the Moon to cast that shadow.'), pse(T6),
        val('ShowSunTrack', false), val('ShowMoonTrack', false)),
      // 6. The lunar eclipse from New York, moonrise to the end.
      ser(txt('From New York: the Moon rises around 5:30 pm, already in the faint outer shadow.'),
        val('DateTime', h(L27, 22.6)), val('SkyAz', 77.6), val('SkyAlt', 6), val('SkyFov', 50), val('ViewMode', 1, 0, T1), pse(T3),
        par(lin('DateTime', h(L27, 23.21), T8), lin('SkyAz', 83.3, T8), lin('SkyAlt', 6.4, T8), val('SkyFov', 6, T8)),
        txt('{estTime}, maximum: {penMag}% of the Moon is in the penumbra, so one edge looks dusky.'), pse(T7),
        txt('It is subtle: no dark bite, just a shading.'),
        par(lin('DateTime', h(L27, 25.22), T10), lin('SkyAz', 103.9, T10), lin('SkyAlt', 28.3, T10)),
        txt('8:13 pm EST: the Moon leaves the penumbra.'), pse(T3))
    ]
  };

  opening('NextEclipse', 'The next eclipse', ['Saturday 6 February 2027: an annular “ring of fire” eclipse of the Sun, over South America, the South Atlantic and West Africa.',
    'Then 20 February 2027: a faint lunar eclipse that New York can see.'], 8000);
  closing('NextEclipse', ['6 Feb 2027: annular eclipse, 12:57–19:02 UTC. Ring of fire in Chile, Argentina, Uruguay, southern Brazil and West Africa. Not visible from New York.',
    '20 Feb 2027: penumbral lunar eclipse. From New York, moonrise (about 5:30 pm) to 8:13 pm EST; maximum 6:13 pm.',
    'Shadow, timings and sky positions come from the globe calculation. The dome only matches them if light bends, and it has nothing to cast the Earth’s shadow on the Moon.'], 14000);
  opening('Intro', 'A tour of the model', ['The dome, the Sun and Moon on it, the observer, and the light ray between them.'], 6000);
  closing('Intro', ['Sunrise and sunset need light rays that curve.',
    'Sun, Moon and stars circle the celestial poles everywhere, as they do on a globe.']);
  opening('Eclipses', 'Eclipses', ['The Sun’s and Moon’s tracks on the dome, the nodes where they cross, and the eclipse of 12 August 2026.'], 6000);
  closing('Eclipses', ['Eclipses follow from the Sun’s and Moon’s tracks and their nodes, as in standard astronomy.',
    'The eclipse path itself comes from the globe calculation. The dome only matches it if light bends.']);
  opening('Equinox', 'The equinox', ['On two days a year the Sun rises due east and sets due west for everyone.'], 6000);
  closing('Equinox', ['At the equinox the Sun rises due east and sets due west for every observer.',
    'From one dome Sun, rays would have to fan out and arrive level from the east, or the west, at every spot at once.']);
  opening('DayNight', 'Day and night', ['The real day-night border, drawn on the flat map through a whole year.'], 6000);
  closing('DayNight', ['The real day-night border is a circle on the globe.',
    'On the flat map it takes shapes that no single lamp above the disc could light.']);
  opening('Poles', 'The poles', ['Midnight sun and polar night at both ends of the year.'], 6000);
  closing('Poles', ['In December, Antarctica has 24 hours of sunlight.',
    'On the dome, that light would have to arc over the night side and past the north pole.']);
  opening('Stars', 'Star trails', ['Why stars circle one pole in the north and another in the south.'], 6000);
  closing('Stars', ['Stars turn around a pole due north in the north, and a pole due south in the south.',
    'A dome has no single south pole star. Its light would have to fan out to every southern viewer at once.']);

  /* ---------------- the analemma ----------------
     The Sun photographed at the same clock time every day for a year traces a figure
     eight. Its tilt and position in the sky depend on latitude. Times below are each
     place's local mean noon in UTC (12:00 minus longitude / 15). */
  var A0 = SHIFT;   // trail starts on 2026-01-01
  DEMOS.Analemma = {
    start: state({ ObserverLat: 51.51, ObserverLong: -0.13, DateTime: 12 / 24, ViewMode: 1, SkyAz: 180, SkyAlt: 38, SkyFov: 100,
      SkyDomeGhost: false, ShowAnalemma: true, AnalemmaFrom: A0, SkyLabels: false }),
    segs: [
      card('The analemma', [
        'Photograph the Sun at the same clock time every day for a year and it traces a figure eight in the sky.',
        'Tall, because the Sun moves north and south with the seasons. Wide, because the Earth’s orbit is an ellipse and its axis is tilted, so the Sun runs up to 16 minutes ahead of or behind the clock.',
        'Watch it form in four places, then compare it with the dome model.'
      ], 12000, 'Demo'),
      ser(txt('London, 12:00 UTC: one dot for each day of 2026.'), pse(T2),
        lin('DayOfYear', 364, 2.2 * T10), pse(T1),
        txt('A figure eight in the southern sky, high in June and low in December.'), pse(T6)),
      ser(txt('Quito, on the equator, at local noon.'),
        val('ObserverLat', -0.18), val('ObserverLong', -78.47), val('Time', 17.23), val('DayOfYear', 0), val('AnalemmaFrom', A0),
        val('SkyAz', 180), val('SkyAlt', 66), val('SkyFov', 120), pse(T2),
        lin('DayOfYear', 364, 2 * T10), pse(T1),
        txt('On the equator it stands straight up through the zenith: the noon Sun is overhead in March and September.'), pse(T6)),
      ser(txt('Sydney, at local noon. Turn to face north.'),
        val('ObserverLat', -33.87), val('ObserverLong', 151.21), val('Time', 1.92), val('DayOfYear', 0), val('AnalemmaFrom', A0),
        val('SkyAz', 0), val('SkyAlt', 50), val('SkyFov', 105), pse(T2),
        lin('DayOfYear', 364, 2 * T10), pse(T1),
        txt('South of the tropics the figure eight is in the northern sky and upside down, highest in December.'), pse(T6)),
      ser(txt('Tromsø, in the Arctic, at local noon.'),
        val('ObserverLat', 69.65), val('ObserverLong', 18.96), val('Time', 10.74), val('DayOfYear', 0), val('AnalemmaFrom', A0),
        val('SkyAz', 180), val('SkyAlt', 18), val('SkyFov', 100), pse(T2),
        lin('DayOfYear', 364, 2 * T10), pse(T1),
        txt('Here the lower loop sinks below the horizon: around midwinter the noon Sun does not rise at all.'), pse(T6)),
      ser(txt('Back to London, with the dome model added.'),
        val('ObserverLat', 51.51), val('ObserverLong', -0.13), val('Time', 12), val('DayOfYear', 0), val('AnalemmaFrom', -1),
        val('SkyAz', 180), val('SkyAlt', 45), val('SkyFov', 115), val('SkyDomeGhost', true), pse(T2),
        txt('Dashed: where the dome would put the Sun at the same times, with straight light: a squashed figure, far too high in winter.'), pse(T8),
        val('ViewMode', 0), val('CameraHeight', 55), val('CameraDirection', 0), val('Zoom', 1.4), txt('On the map, the spot under the Sun traces its own figure eight between the tropics.'), pse(T8))
    ]
  };
  closing('Analemma', ['The analemma’s height comes from the tilt of the Earth’s axis; its width from that tilt and the elliptical orbit.',
    'Its shape and tilt at each place match the globe. On the dome, straight light would put it somewhere else entirely.']);

  /* ---------------- the Great Pyramid and the Sun ----------------
     Giza 29.979° N, 31.134° E. Face slope 51.84°. The model finds the north face sunlit at
     noon from 28 Feb to 14 Oct 2026, and the equinox Sun rising at azimuth 89.9°. */
  DEMOS.Pyramid = {
    start: state({ ObserverLat: 29.979, ObserverLong: 31.134, DateTime: 78 + 3.75 / 24, ViewMode: 1, SkyAz: 90, SkyAlt: 6, SkyFov: 70,
      SkyDomeGhost: false, SkyLabels: false }),
    segs: [
      card('The Great Pyramid and the Sun', [
        'The Great Pyramid of Giza was built about 4,500 years ago. Its sides face north, east, south and west to within about 4 arcminutes, a fifteenth of a degree.',
        'Its faces rise at an angle of about 51.8°.',
        'Both facts tie it to the real path of the Sun across the sky.'
      ], 12000, 'Demo'),
      ser(txt('Giza, at dawn on the March equinox, 20 March 2026.'), val('SkyMark', { az: 90, label: 'Due east' }), pse(T2),
        lin('Time', 4.35, T8),
        txt('The Sun rises at azimuth {sunAz}°: due east, square to the pyramid’s sides.'), pse(T6),
        txt('On the equinox the tip of a stick’s shadow moves in a straight east–west line all day: one way the builders may have found their directions.'), pse(T8)),
      ser(txt('Noon on the same day. The dashed line is the slope of the pyramid’s faces.'),
        val('SkyMark', { alt: 51.84, label: 'Pyramid face slope, 51.8°' }),
        val('Time', 10.03), val('SkyAz', 180), val('SkyAlt', 42), val('SkyFov', 95), pse(T3),
        txt('The Sun is {sunEl}° up, higher than the faces, so even the north face is {northFace}.'), pse(T6),
        txt('Day by day at noon: the Sun is {sunEl}° up and the north face is {northFace}.'),
        lin('DayOfYear', 300, 1.6 * T10), pse(T2),
        txt('From mid-October to late February the noon Sun is lower than the faces, and the north face stays in shadow all day.'), pse(T7)),
      ser(txt('The dome model, at the same equinox sunrise.'),
        val('DayOfYear', 78), val('Time', 4.05), val('SkyAz', 90), val('SkyAlt', 20), val('SkyFov', 110),
        val('SkyMark', { az: 90, label: 'Due east' }), val('SkyDomeGhost', true), pse(T2),
        txt('With straight light, the dome’s Sun would be {ghostSunEl}° up at azimuth {ghostSunAz}°, not rising in the east.'), pse(T8),
        val('SkyMark', null), val('ViewMode', 0), val('CameraHeight', 30), val('Zoom', 2.4), val('CameraDirection', 31),
        pnt('Giza', { fe: [29.979, 31.134] }, [-80, -60], T1), pse(T6), pnt())
    ]
  };
  closing('Pyramid', ['The Great Pyramid lines up with the real Sun: due east at the equinox, and faces that the noon Sun clears for most of the year.',
    'These directions are the sky computed for a round Earth, the same sky this site shows in Sky view.']);

  var DESC = {
    NextEclipse: 'The annular solar eclipse of 6 Feb 2027 on the dome, and the 20 Feb 2027 lunar eclipse seen from New York.',
    How: 'The idea in two minutes: real sky, dome positions, and the bent light between them.',
    Video: 'A narrated-style introduction: the map, ice wall, dome, Sun, seasons, Moon, stars and light rays.',
    Intro: 'The dome, the Sun and Moon on it, the observer, and a full day of light rays.',
    Eclipses: 'The Sun and Moon tracks, their crossing points, and the eclipse of 12 August 2026.',
    Equinox: 'Why the Sun rises due east for everyone on two days a year.',
    DayNight: 'The real day-night border drawn on the flat map through a year.',
    Poles: 'Midnight sun and polar night, north and south.',
    Stars: 'Why stars circle one pole in the north and another in the south.',
    Limits: 'Four everyday observations the dome cannot match with straight light.',
    Sim: 'How accurate this simulation is, its limits, and what could be added.',
    Analemma: 'The Sun at the same time each day traces a figure eight; see it form in London, Quito, Sydney and Tromsø.',
    Pyramid: 'How the Great Pyramid of Giza lines up with the Sun: equinox sunrise and its sunlit faces.'
  };
  var ORDER = ['NextEclipse', 'Video', 'How', 'Intro', 'Eclipses', 'Equinox', 'Analemma', 'Pyramid', 'DayNight', 'Poles', 'Stars', 'Limits', 'Sim'];
  var INFO = {
    NextEclipse: 'Next eclipse', Video: 'Intro video', How: 'How it works', Intro: 'Tour', Eclipses: 'Eclipses', Equinox: 'Equinox', DayNight: 'Day & night',
    Poles: 'Poles', Stars: 'Stars', Limits: 'Limitations', Sim: 'This simulation', Analemma: 'Analemma', Pyramid: 'Pyramids & the Sun'
  };

  /* ---------------- player ---------------- */
  function Player(model, hooks) {
    this.model = model;
    this.hooks = hooks || {};
    this.demos = {};
    for (var name in DEMOS) {
      this.demos[name] = { start: DEMOS[name].start, segs: DEMOS[name].segs.map(FE.Timeline.compile), states: null };
    }
    this.name = null; this.pos = 0; this.run = null; this.playing = false;
    this.speed = 1; this.lastTs = 0; this.elapsed = 0;
  }
  Player.prototype.names = function () { return ORDER.slice(); };
  Player.prototype.label = function (n) { return INFO[n] || n; };
  Player.prototype.desc = function (n) { return DESC[n] || ''; };
  /* Running time in ms at 1x speed. */
  Player.prototype.duration = function (n) {
    return this.demos[n].segs.reduce(function (a, c) { return a + c.duration; }, 0);
  };

  function snap(m) { var o = m.snapshot(); o._day = m.day; o._time = m.time; return o; }
  function load(m, st, silent) {
    m.restore(st, true, true);   // demo keyframes are trusted
    if (st._day !== undefined) { m.day = st._day; m.time = st._time; m.s.DateTime = m.day + m.time / 24; }
    if (!silent) m.touch();
  }

  /* Keyframes are computed lazily: run each segment to its end from the previous one. */
  Player.prototype.states = function (name) {
    var dm = this.demos[name];
    if (dm.states) return dm.states;
    var sim = new FE.Model(), st = [dm.start];
    for (var i = 0; i < dm.segs.length; i++) {
      load(sim, st[i], true);
      new FE.Timeline.Run(dm.segs[i], sim).seek(Infinity);
      st.push(snap(sim));
    }
    return (dm.states = st);
  };
  Player.prototype.count = function () { return this.name ? this.demos[this.name].segs.length + 1 : 0; };
  Player.prototype.atEnd = function () { return this.name && this.pos >= this.count() - 1; };

  Player.prototype.goTo = function (pos, play) {
    if (!this.name) return;
    var st = this.states(this.name);
    this.pos = FE.U.clamp(pos, 0, st.length - 1);
    this.run = null; this.playing = false;
    load(this.model, st[this.pos]);
    if (play) this.play();
    this.changed();
  };
  Player.prototype.start = function (name) {
    if (this.name === name && this.playing) { this.next(); return; }
    this.name = name; this.goTo(0, true);
  };
  Player.prototype.play = function () {
    if (!this.name) return;
    if (this.atEnd()) { this.goTo(0, false); }
    var dm = this.demos[this.name];
    load(this.model, this.states(this.name)[this.pos]);
    this.run = new FE.Timeline.Run(dm.segs[this.pos], this.model);
    this.elapsed = 0; this.lastTs = 0; this.playing = true;
    this.changed();
  };
  Player.prototype.stop = function () { this.playing = false; this.changed(); };
  Player.prototype.toggle = function () { if (this.playing) this.stop(); else this.play(); };
  Player.prototype.next = function () { if (this.name) this.goTo(this.pos + 1, this.playing && this.pos + 1 < this.count() - 1); };
  Player.prototype.prev = function () {
    if (!this.name) return;
    var midway = this.run && this.elapsed > 0;
    this.goTo(midway ? this.pos : this.pos - 1, false);
  };
  Player.prototype.toEnds = function () { this.goTo(this.atEnd() ? 0 : this.count() - 1, false); };
  /* The user took over (dragged, used a slider): leave the demo, keep the view. */
  Player.prototype.detach = function () {
    if (!this.name) return;
    this.playing = false; this.run = null; this.name = null;
    this.model.clearDescription();
    this.changed();
  };
  Player.prototype.changed = function () { if (this.hooks.onChange) this.hooks.onChange(this); };

  /* Advance by wall-clock time; returns true while animating. */
  Player.prototype.tick = function (ts) {
    if (!this.playing || !this.run) return false;
    if (!this.lastTs) this.lastTs = ts;
    var dt = Math.min(100, ts - this.lastTs); this.lastTs = ts;
    this.elapsed += dt * this.speed;
    var done = this.run.seek(this.elapsed);
    this.model.touch();
    if (done) {
      this.pos++;
      if (this.pos < this.count() - 1) {
        this.run = new FE.Timeline.Run(this.demos[this.name].segs[this.pos], this.model);
        this.elapsed = 0;
      } else { this.playing = false; this.run = null; }
      this.changed();
    }
    return true;
  };

  FE.DEMOS = DEMOS;
  FE.DEMO_ORDER = ORDER;
  FE.DEMO_LABELS = INFO;
  FE.DemoPlayer = Player;
})();
