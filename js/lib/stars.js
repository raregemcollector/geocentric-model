/* stars.js — bright-star catalog and constellation figures.
 * About 190 stars (most of the sky down to magnitude ~3, plus fainter stars that
 * complete well-known figures). J2000 positions to ~0.1 deg; FE.Stars.load()
 * precesses them to the epoch used by the app. Hand-compiled from standard
 * bright-star tables. Format: [name, "RA h m", "Dec +/-d m", V magnitude]. */
var FE = window.FE = window.FE || {};

(function () {
  var S = [
    ['Sirius', '6 45.1', '-16 43', -1.46], ['Canopus', '6 24.0', '-52 42', -0.74],
    ['Rigil Kentaurus', '14 39.6', '-60 50', -0.27], ['Arcturus', '14 15.7', '+19 11', -0.05],
    ['Vega', '18 36.9', '+38 47', 0.03], ['Capella', '5 16.7', '+46 00', 0.08],
    ['Rigel', '5 14.5', '-08 12', 0.13], ['Procyon', '7 39.3', '+05 13', 0.34],
    ['Achernar', '1 37.7', '-57 14', 0.46], ['Betelgeuse', '5 55.2', '+07 24', 0.50],
    ['Hadar', '14 03.8', '-60 22', 0.61], ['Altair', '19 50.8', '+08 52', 0.76],
    ['Acrux', '12 26.6', '-63 06', 0.76], ['Aldebaran', '4 35.9', '+16 31', 0.86],
    ['Antares', '16 29.4', '-26 26', 0.96], ['Spica', '13 25.2', '-11 10', 0.97],
    ['Pollux', '7 45.3', '+28 02', 1.14], ['Fomalhaut', '22 57.6', '-29 37', 1.16],
    ['Deneb', '20 41.4', '+45 17', 1.25], ['Mimosa', '12 47.7', '-59 41', 1.25],
    ['Regulus', '10 08.4', '+11 58', 1.35], ['Adhara', '6 58.6', '-28 58', 1.50],
    ['Castor', '7 34.6', '+31 53', 1.58], ['Gacrux', '12 31.2', '-57 07', 1.63],
    ['Shaula', '17 33.6', '-37 06', 1.62], ['Bellatrix', '5 25.1', '+06 21', 1.64],
    ['Elnath', '5 26.3', '+28 36', 1.65], ['Miaplacidus', '9 13.2', '-69 43', 1.68],
    ['Alnilam', '5 36.2', '-01 12', 1.69], ['Alnair', '22 08.2', '-46 58', 1.74],
    ['Alnitak', '5 40.8', '-01 57', 1.77], ['Alioth', '12 54.0', '+55 58', 1.77],
    ['Dubhe', '11 03.7', '+61 45', 1.79], ['Mirfak', '3 24.3', '+49 52', 1.79],
    ['Wezen', '7 08.4', '-26 24', 1.84], ['Sargas', '17 37.3', '-43 00', 1.86],
    ['Kaus Australis', '18 24.2', '-34 23', 1.85], ['Avior', '8 22.5', '-59 31', 1.86],
    ['Alkaid', '13 47.5', '+49 19', 1.86], ['Menkalinan', '5 59.5', '+44 57', 1.90],
    ['Atria', '16 48.7', '-69 02', 1.91], ['Alhena', '6 37.7', '+16 24', 1.92],
    ['Peacock', '20 25.6', '-56 44', 1.94], ['Alsephina', '8 44.7', '-54 43', 1.96],
    ['Mirzam', '6 22.7', '-17 57', 1.98], ['Alphard', '9 27.6', '-08 40', 1.99],
    ['Polaris', '2 31.8', '+89 16', 1.98], ['Hamal', '2 07.2', '+23 28', 2.00],
    ['Algieba', '10 20.0', '+19 50', 2.08], ['Diphda', '0 43.6', '-17 59', 2.04],
    ['Nunki', '18 55.3', '-26 18', 2.05], ['Menkent', '14 06.7', '-36 22', 2.06],
    ['Mirach', '1 09.7', '+35 37', 2.06], ['Alpheratz', '0 08.4', '+29 05', 2.06],
    ['Rasalhague', '17 34.9', '+12 34', 2.08], ['Kochab', '14 50.7', '+74 09', 2.08],
    ['Saiph', '5 47.8', '-09 40', 2.09], ['Denebola', '11 49.1', '+14 34', 2.13],
    ['Algol', '3 08.2', '+40 57', 2.12], ['Tiaki', '22 42.7', '-46 53', 2.07],
    ['Muhlifain', '12 41.5', '-48 58', 2.20], ['Aspidiske', '9 17.1', '-59 17', 2.21],
    ['Suhail', '9 08.0', '-43 26', 2.23], ['Alphecca', '15 34.7', '+26 43', 2.23],
    ['Mizar', '13 23.9', '+54 56', 2.23], ['Sadr', '20 22.2', '+40 15', 2.23],
    ['Eltanin', '17 56.6', '+51 29', 2.24], ['Schedar', '0 40.5', '+56 32', 2.24],
    ['Naos', '8 03.6', '-40 00', 2.25], ['Almach', '2 03.9', '+42 20', 2.26],
    ['Caph', '0 09.2', '+59 09', 2.28], ['Mintaka', '5 32.0', '-00 18', 2.23],
    ['Izar', '14 45.0', '+27 04', 2.37], ['Dschubba', '16 00.3', '-22 37', 2.29],
    ['Larawag', '16 50.2', '-34 18', 2.29], ['Epsilon Centauri', '13 39.9', '-53 28', 2.30],
    ['Alpha Lupi', '14 41.9', '-47 23', 2.30], ['Eta Centauri', '14 35.5', '-42 09', 2.31],
    ['Merak', '11 01.8', '+56 23', 2.37], ['Ankaa', '0 26.3', '-42 18', 2.40],
    ['Girtab', '17 42.5', '-39 02', 2.39], ['Enif', '21 44.2', '+09 53', 2.39],
    ['Scheat', '23 03.8', '+28 05', 2.42], ['Sabik', '17 10.4', '-15 43', 2.43],
    ['Phecda', '11 53.8', '+53 42', 2.44], ['Aludra', '7 24.1', '-29 18', 2.45],
    ['Markeb', '9 22.1', '-55 01', 2.47], ['Navi', '0 56.7', '+60 43', 2.47],
    ['Markab', '23 04.8', '+15 12', 2.48], ['Aljanah', '20 46.2', '+33 58', 2.48],
    ['Menkar', '3 02.3', '+04 05', 2.54], ['Zosma', '11 14.1', '+20 31', 2.56],
    ['Acrab', '16 05.4', '-19 48', 2.62], ['Arneb', '5 32.7', '-17 49', 2.58],
    ['Ruchbah', '1 25.8', '+60 14', 2.68], ['Megrez', '12 15.4', '+57 02', 3.31],
    ['Gienah', '12 15.8', '-17 33', 2.59], ['Unukalhai', '15 44.3', '+06 26', 2.63],
    ['Sheratan', '1 54.6', '+20 48', 2.64], ['Kaus Media', '18 21.0', '-29 50', 2.70],
    ['Kaus Borealis', '18 28.0', '-25 25', 2.81], ['Ascella', '19 02.6', '-29 53', 2.60],
    ['Albaldah', '19 09.8', '-21 01', 2.89], ['Alnasl', '18 05.8', '-30 25', 2.99],
    ['Phi Sagittarii', '18 45.7', '-26 59', 3.17], ['Tau Sagittarii', '19 06.9', '-27 40', 3.32],
    ['Tarazed', '19 46.3', '+10 37', 2.72], ['Alshain', '19 55.3', '+06 24', 3.71],
    ['Delta Aquilae', '19 25.5', '+03 07', 3.36], ['Zeta Aquilae', '19 05.4', '+13 52', 2.99],
    ['Lambda Aquilae', '19 06.2', '-04 53', 3.43], ['Theta Aquilae', '20 11.3', '-00 49', 3.23],
    ['Sheliak', '18 50.1', '+33 22', 3.52], ['Sulafat', '18 59.0', '+32 41', 3.25],
    ['Zeta Lyrae', '18 44.8', '+37 36', 4.30], ['Delta Lyrae', '18 54.5', '+36 54', 4.30],
    ['Albireo', '19 30.7', '+27 58', 3.08], ['Fawaris', '19 45.0', '+45 08', 2.87],
    ['Alcyone', '3 47.5', '+24 06', 2.87], ['Tianguan', '5 37.6', '+21 09', 3.00],
    ['Ain', '4 28.6', '+19 11', 3.53], ['Prima Hyadum', '4 19.8', '+15 38', 3.65],
    ['Secunda Hyadum', '4 22.9', '+17 33', 3.76], ['Mebsuta', '6 44.0', '+25 08', 3.06],
    ['Wasat', '7 20.1', '+21 59', 3.53], ['Tejat', '6 23.0', '+22 31', 2.87],
    ['Propus', '6 14.9', '+22 30', 3.30], ['Gomeisa', '7 27.2', '+08 17', 2.90],
    ['Furud', '6 20.3', '-30 04', 3.02], ['Meissa', '5 35.1', '+09 56', 3.39],
    ['Kornephoros', '16 30.2', '+21 29', 2.78], ['Zeta Herculis', '16 41.3', '+31 36', 2.81],
    ['Pi Herculis', '17 15.0', '+36 48', 3.16], ['Eta Herculis', '16 42.9', '+38 55', 3.48],
    ['Epsilon Herculis', '17 00.3', '+30 56', 3.92], ['Rasalgethi', '17 14.6', '+14 23', 3.08],
    ['Muphrid', '13 54.7', '+18 24', 2.68], ['Seginus', '14 32.1', '+38 18', 3.03],
    ['Nekkar', '15 01.9', '+40 23', 3.49], ['Delta Bootis', '15 15.5', '+33 19', 3.47],
    ['Rho Bootis', '14 31.8', '+30 22', 3.58],
    ['Vindemiatrix', '13 02.2', '+10 58', 2.83], ['Porrima', '12 41.7', '-01 27', 2.74],
    ['Zavijava', '11 50.7', '+01 46', 3.61], ['Heze', '13 34.7', '-00 36', 3.37],
    ['Minkar', '12 10.1', '-22 37', 3.02], ['Kraz', '12 34.4', '-23 24', 2.65],
    ['Algorab', '12 29.9', '-16 31', 2.95], ['Imai', '12 15.1', '-58 45', 2.79],
    ['Chertan', '11 14.2', '+15 26', 3.33], ['Ras Elased', '9 45.9', '+23 46', 2.98],
    ['Adhafera', '10 16.7', '+23 25', 3.43], ['Eta Leonis', '10 07.3', '+16 46', 3.48],
    ['Rasalas', '9 52.8', '+26 00', 3.88], ['Cebalrai', '17 43.5', '+04 34', 2.76],
    ['Yed Prior', '16 14.3', '-03 42', 2.73], ['Zeta Ophiuchi', '16 37.2', '-10 34', 2.54],
    ['Paikauhale', '16 35.9', '-28 13', 2.82], ['Fang', '15 58.9', '-26 07', 2.89],
    ['Alniyat', '16 21.2', '-25 36', 2.90], ['Mu Scorpii', '16 51.9', '-38 03', 3.00],
    ['Zeta Scorpii', '16 54.6', '-42 22', 3.62], ['Eta Scorpii', '17 12.2', '-43 14', 3.33],
    ['Iota Scorpii', '17 47.6', '-40 08', 3.00], ['Lesath', '17 30.8', '-37 18', 2.70],
    ['Segin', '1 54.4', '+63 40', 3.38], ['Yildun', '17 32.2', '+86 35', 4.36],
    ['Epsilon UMi', '16 46.0', '+82 02', 4.21], ['Zeta UMi', '15 44.1', '+77 48', 4.29],
    ['Eta UMi', '16 17.5', '+75 45', 4.95], ['Pherkad', '15 20.7', '+71 50', 3.00],
    ['Zeta Centauri', '13 55.5', '-47 17', 2.55], ['Delta Centauri', '12 08.4', '-50 43', 2.58],
    ['Algenib', '0 13.2', '+15 11', 2.83], ['Delta Andromedae', '0 39.3', '+30 52', 3.27],
    ['Epsilon Persei', '3 57.9', '+40 01', 2.89], ['Zeta Persei', '3 54.1', '+31 53', 2.85],
    ['Delta Persei', '3 42.9', '+47 47', 3.01], ['Gamma Persei', '3 04.8', '+53 30', 2.93],
    ['Mahasim', '5 59.7', '+37 13', 2.62], ['Hassaleh', '4 57.0', '+33 10', 2.69],
    ['Beta TrA', '15 55.1', '-63 26', 2.83], ['Gamma TrA', '15 18.9', '-68 41', 2.87],
    ['Rastaban', '17 30.4', '+52 18', 2.79], ['Thuban', '14 04.4', '+64 23', 3.65],
    ['Alderamin', '21 18.6', '+62 35', 2.45], ['Sadalsuud', '21 31.6', '-05 34', 2.90],
    ['Sadalmelik', '22 05.8', '-00 19', 2.95], ['Deneb Algedi', '21 47.0', '-16 08', 2.85],
    ['Zubenelgenubi', '14 50.9', '-16 02', 2.75], ['Zubeneschamali', '15 17.0', '-09 23', 2.61],
    ['Nihal', '5 28.3', '-20 46', 2.84], ['Phact', '5 39.6', '-34 04', 2.65],
    ['Wazn', '5 51.0', '-35 46', 3.12], ['Hatysa', '5 35.4', '-05 55', 2.77]
  ];

  /* Stick figures, as runs of star names (each run is a polyline). */
  var FIG = {
    'Orion': [['Meissa', 'Betelgeuse', 'Alnitak', 'Saiph'], ['Meissa', 'Bellatrix', 'Mintaka', 'Rigel'],
      ['Mintaka', 'Alnilam', 'Alnitak'], ['Betelgeuse', 'Bellatrix']],
    'Ursa Major': [['Dubhe', 'Merak', 'Phecda', 'Megrez', 'Dubhe'], ['Megrez', 'Alioth', 'Mizar', 'Alkaid']],
    'Ursa Minor': [['Polaris', 'Yildun', 'Epsilon UMi', 'Zeta UMi', 'Kochab', 'Pherkad', 'Eta UMi', 'Zeta UMi']],
    'Cassiopeia': [['Caph', 'Schedar', 'Navi', 'Ruchbah', 'Segin']],
    'Cygnus': [['Deneb', 'Sadr', 'Albireo'], ['Aljanah', 'Sadr', 'Fawaris']],
    'Lyra': [['Vega', 'Zeta Lyrae', 'Sheliak', 'Sulafat', 'Delta Lyrae', 'Zeta Lyrae']],
    'Aquila': [['Tarazed', 'Altair', 'Alshain', 'Theta Aquilae'], ['Altair', 'Delta Aquilae', 'Lambda Aquilae'], ['Delta Aquilae', 'Zeta Aquilae']],
    'Crux': [['Acrux', 'Gacrux'], ['Mimosa', 'Imai']],
    'Centaurus': [['Rigil Kentaurus', 'Hadar', 'Epsilon Centauri', 'Muhlifain', 'Delta Centauri'],
      ['Epsilon Centauri', 'Zeta Centauri', 'Eta Centauri'], ['Zeta Centauri', 'Menkent']],
    'Scorpius': [['Acrab', 'Dschubba', 'Fang'], ['Dschubba', 'Alniyat', 'Antares', 'Paikauhale', 'Larawag', 'Mu Scorpii',
      'Zeta Scorpii', 'Eta Scorpii', 'Sargas', 'Iota Scorpii', 'Girtab', 'Shaula', 'Lesath']],
    'Sagittarius': [['Alnasl', 'Kaus Media', 'Kaus Australis', 'Alnasl'], ['Kaus Media', 'Kaus Borealis', 'Phi Sagittarii', 'Kaus Media'],
      ['Phi Sagittarii', 'Nunki', 'Tau Sagittarii', 'Ascella', 'Phi Sagittarii'], ['Ascella', 'Kaus Australis']],
    'Leo': [['Regulus', 'Eta Leonis', 'Algieba', 'Zosma', 'Denebola', 'Chertan', 'Regulus'],
      ['Algieba', 'Adhafera', 'Rasalas', 'Ras Elased'], ['Zosma', 'Chertan']],
    'Gemini': [['Castor', 'Mebsuta', 'Tejat', 'Propus'], ['Pollux', 'Wasat', 'Alhena'], ['Castor', 'Pollux']],
    'Taurus': [['Prima Hyadum', 'Aldebaran', 'Tianguan'], ['Prima Hyadum', 'Secunda Hyadum', 'Ain', 'Elnath']],
    'Canis Major': [['Mirzam', 'Sirius', 'Wezen', 'Adhara', 'Furud'], ['Wezen', 'Aludra']],
    'Canis Minor': [['Procyon', 'Gomeisa']],
    'Pegasus': [['Markab', 'Scheat', 'Alpheratz', 'Algenib', 'Markab'], ['Markab', 'Enif']],
    'Andromeda': [['Alpheratz', 'Delta Andromedae', 'Mirach', 'Almach']],
    'Perseus': [['Gamma Persei', 'Mirfak', 'Delta Persei', 'Epsilon Persei', 'Zeta Persei'], ['Mirfak', 'Algol']],
    'Auriga': [['Capella', 'Menkalinan', 'Mahasim', 'Elnath', 'Hassaleh', 'Capella']],
    'Bootes': [['Arcturus', 'Rho Bootis', 'Seginus', 'Nekkar', 'Delta Bootis', 'Izar', 'Arcturus'], ['Arcturus', 'Muphrid']],
    'Hercules': [['Zeta Herculis', 'Eta Herculis', 'Pi Herculis', 'Epsilon Herculis', 'Zeta Herculis', 'Kornephoros']],
    'Triangulum Australe': [['Atria', 'Beta TrA', 'Gamma TrA', 'Atria']],
    'Corvus': [['Gienah', 'Algorab', 'Kraz', 'Minkar', 'Gienah']],
    'Draco': [['Eltanin', 'Rastaban']],
    'Libra': [['Zubenelgenubi', 'Zubeneschamali']],
    'Aries': [['Hamal', 'Sheratan']],
    'Lepus': [['Arneb', 'Nihal']],
    'Columba': [['Phact', 'Wazn']],
    'Virgo': [['Spica', 'Heze', 'Porrima', 'Zavijava'], ['Porrima', 'Vindemiatrix']],
    'Carina': [['Canopus', 'Avior'], ['Avior', 'Aspidiske', 'Markeb', 'Alsephina', 'Avior']]
  };

  function parseRA(s) { var p = s.split(' '); return (+p[0] + +p[1] / 60) * 15; }
  function parseDec(s) { var neg = s[0] === '-', p = s.slice(1).split(' '); var v = +p[0] + +p[1] / 60; return neg ? -v : v; }

  /* Unit vectors of date: precess J2000 positions by ecliptic-longitude drift. */
  function load(epochYear) {
    var V = FE.V, eps = 23.4393 * Math.PI / 180, ce = Math.cos(eps), se = Math.sin(eps);
    var dLon = (epochYear - 2000) * 50.29 / 3600 * Math.PI / 180;
    var cd = Math.cos(dLon), sd = Math.sin(dLon);
    var byName = {};
    var stars = S.map(function (r) {
      var v = V.fromLatLon(parseDec(r[2]), parseRA(r[1]));
      // equatorial -> ecliptic, rotate by precession, -> equatorial
      var x = v[0], y = v[1] * ce + v[2] * se, z = -v[1] * se + v[2] * ce;
      var x2 = x * cd - y * sd, y2 = x * sd + y * cd;
      var e = [x2, y2 * ce - z * se, y2 * se + z * ce];
      var ll = V.toLatLon(e);
      var star = { name: r[0], mag: r[3], dir: e, dec: ll.lat, ra: ll.lon };
      byName[r[0]] = star;
      return star;
    });
    var lines = [];
    Object.keys(FIG).forEach(function (c) {
      FIG[c].forEach(function (run) {
        for (var i = 1; i < run.length; i++) {
          var a = byName[run[i - 1]], b = byName[run[i]];
          if (a && b) lines.push([a, b, c]);
        }
      });
    });
    return { stars: stars, lines: lines, byName: byName };
  }

  FE.Stars = { load: load, RAW: S, FIGURES: FIG };
})();
