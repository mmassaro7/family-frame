// Weather: a colorful cartoon page with a detailed "today" and the 7-day forecast. Data: D.weather (js/live.js).
(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null };
  var INK = '#1B1B1B';

  // ------------------------------------------------------------ original cartoon art (24 x 24 grid scaled to 200 x 200)
  var FACE = '<ellipse cx="82" cy="94" rx="9" ry="12" fill="#fff" stroke="' + INK + '" stroke-width="4"/><ellipse cx="118" cy="94" rx="9" ry="12" fill="#fff" stroke="' + INK + '" stroke-width="4"/>' +
    '<circle cx="85" cy="97" r="5" fill="' + INK + '"/><circle cx="121" cy="97" r="5" fill="' + INK + '"/>' +
    '<path d="M71 76q11-9 22 0M107 76q11-9 22 0" stroke="' + INK + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="64" cy="114" r="8" fill="#FF8FA3" opacity=".85"/><circle cx="136" cy="114" r="8" fill="#FF8FA3" opacity=".85"/>' +
    '<path d="M74 114q26 38 52 0z" fill="#B3262F" stroke="' + INK + '" stroke-width="5" stroke-linejoin="round"/><path d="M86 128q14-8 28 0q-14 14-28 0z" fill="#FF7F8E"/>';
  var CLOUD = 'M55 150C28 150 22 118 46 110C42 80 80 66 98 86C112 62 156 72 154 104C180 104 184 150 150 150Z';
  function cloud(fill, dy) { return '<path transform="translate(0 ' + (dy || 0) + ')" d="' + CLOUD + '" fill="' + fill + '" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/>'; }
  function sunDisc(face, cx, cy, s) {
    var rays = '';
    for (var i = 0; i < 12; i++) rays += '<path transform="rotate(' + (i * 30) + ' 100 100)" d="M100 24L111 48H89Z" fill="#FF8A1F" stroke="' + INK + '" stroke-width="5" stroke-linejoin="round"/>';
    return '<g transform="translate(' + cx + ' ' + cy + ') scale(' + s + ') translate(-100 -100)"><g class="wx-rot">' + rays + '</g>' +
      '<circle cx="100" cy="100" r="56" fill="#FFD21F" stroke="' + INK + '" stroke-width="6"/>' + (face ? FACE : '') + '</g>';
  }
  var KINDS = {
    sun: function (f) { return sunDisc(f, 100, 100, 1); },
    moon: function (f) {
      return '<path d="M118 34A64 64 0 1 0 168 134A52 52 0 1 1 118 34Z" fill="#FFE9A8" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/>' +
        (f ? '<g transform="translate(-26 4) scale(.8)">' + FACE + '</g>' : '') +
        '<path class="wx-twinkle" d="M158 46l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#fff" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    },
    partly: function (f) { return sunDisc(false, 78, 76, .62) + cloud('#fff', 8) + (f ? '<g transform="translate(0 28) scale(1)">' + FACE.replace(/cy="94"/g, 'cy="94"') + '</g>' : ''); },
    cloud: function (f) { return cloud('#F4F8FF', 0) + (f ? '<g transform="translate(0 16)">' + FACE + '</g>' : ''); },
    rain: function (f) {
      var d = '';
      [[62, 0], [100, .5], [138, 1]].forEach(function (x) { d += '<path class="wx-drop" style="animation-delay:' + x[1] + 's" d="M' + x[0] + ' 156q10 18 0 26q-10-8 0-26z" fill="#3AA0FF" stroke="' + INK + '" stroke-width="4" stroke-linejoin="round"/>'; });
      return cloud('#D5E3F6', -18) + (f ? '<g transform="translate(0 -4)">' + FACE + '</g>' : '') + d;
    },
    snow: function (f) {
      var d = '';
      [[58, 0], [100, .6], [142, 1.2]].forEach(function (x) { d += '<path class="wx-drop" style="animation-delay:' + x[1] + 's" d="M' + x[0] + ' 160v22M' + (x[0] - 9) + ' 165l18 12M' + (x[0] + 9) + ' 165l-18 12" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>'; });
      return cloud('#EAF3FF', -18) + (f ? '<g transform="translate(0 -4)">' + FACE + '</g>' : '') + d;
    },
    storm: function (f) {
      return cloud('#9AA7C0', -18) + (f ? '<g transform="translate(0 -4)">' + FACE + '</g>' : '') +
        '<path class="wx-twinkle" d="M108 138l-26 30h18l-8 26l32-36h-18z" fill="#FFD21F" stroke="' + INK + '" stroke-width="5" stroke-linejoin="round"/>';
    }
  };
  function toon(kind, size, face) {
    return '<svg class="wx-art wx-art--' + kind + '" width="' + size + '" height="' + size + '" viewBox="0 0 200 200" aria-hidden="true">' + (KINDS[kind] || KINDS.cloud)(!!face) + '</svg>';
  }

  // ------------------------------------------------------------ words
  var DESC = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Foggy', 48: 'Foggy', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 56: 'Icy drizzle', 57: 'Icy drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Showers', 81: 'Showers', 82: 'Downpour', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
  function kindOf(code, base) { return code >= 95 ? 'storm' : base; }
  var QUIP = { sun: 'Shades on, folks!', partly: 'A little sun, a little cloud!', cloud: 'Cloudy with a chance of couch.', rain: 'Umbrella time!', snow: 'Brrr! Bundle up!', storm: 'Duck! Here comes the boom!', moon: 'Sweet dreams, stargazers!' };
  function dir(deg) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((deg || 0) / 45) % 8]; }
  function clock(d) { return d ? (d.getHours() % 12 || 12) + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + (d.getHours() >= 12 ? ' PM' : ' AM') : '—'; }
  var SKY = { sun: 'sun', partly: 'sun', cloud: 'cloud', rain: 'rain', snow: 'snow', storm: 'storm', moon: 'moon' };

  // ------------------------------------------------------------ page
  function model() {
    var W = D.weather, n = W.now, h = App.now().getHours(), wn = App.weatherNow(), today = (W.days || [])[0] || {};
    var code = n ? n.code : null;
    var base = n ? n.c : wn.cond;
    var kind = kindOf(code == null ? 0 : code, base);
    return {
      kind: kind, t: n ? n.t : wn.temp, feels: n ? n.feels : wn.temp, hum: n ? n.hum : null, wind: n ? n.wind : null, dir: n ? dir(n.dir) : '',
      desc: code != null && DESC[code] ? DESC[code] : wn.label, hi: W.hi, lo: W.lo, uv: today.uv, rise: today.rise, set: today.set,
      rainP: today.p != null ? today.p : Math.max.apply(null, W.p.slice(0, 24)), rainAmt: today.rain, unit: W.units === 'celsius' ? 'C' : 'F', speed: W.units === 'celsius' ? 'km/h' : 'mph',
      summary: wn.summary, hour: h
    };
  }
  function stat(cls, icon, label, value, sub) {
    return '<div class="wx-stat ' + cls + '">' + App.icon(icon, 34) + '<div><small>' + label + '</small><b>' + value + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div></div>';
  }
  function hours() {
    var W = D.weather, h = App.now().getHours(), out = '';
    for (var i = 0; i < 8 && h + i < W.t.length; i++) {
      var x = h + i, hr = x % 24, c = W.c[x];
      out += '<div class="wx-hr wx-sky--' + SKY[c] + '"><b>' + (i === 0 ? 'NOW' : (hr % 12 || 12) + (hr >= 12 ? 'PM' : 'AM')) + '</b>' + toon(c, 46, false) +
        '<span class="wx-t">' + W.t[x] + '°</span><span class="wx-p">' + (W.p[x] >= 10 ? App.icon('drop', 14) + W.p[x] + '%' : '&nbsp;') + '</span></div>';
    }
    return out;
  }
  function days() {
    var list = D.weather.days || [];
    if (!list.length) return '<div class="wx-wait">Hang on, the forecast is on its way!</div>';
    return list.slice(0, 7).map(function (d, i) {
      var kind = kindOf(d.code == null ? 0 : d.code, d.c);
      return '<div class="wx-day wx-sky--' + SKY[kind] + (i === 0 ? ' is-today' : '') + '"><b class="wx-dn">' + (i === 0 ? 'TODAY' : App.fmt.dayShort(d.date).toUpperCase()) + '</b>' + toon(kind, 62, false) +
        '<span class="wx-hl"><i>' + d.hi + '°</i><u>' + d.lo + '°</u></span><span class="wx-dd">' + (DESC[d.code] || '') + '</span>' +
        '<span class="wx-dp">' + App.icon('drop', 14) + d.p + '%</span></div>';
    }).join('');
  }
  function render() {
    var m = model(), el = V.el;
    var sub = el.querySelector('.wx');
    var html =
      '<div class="wx-scene wx-sky--' + SKY[m.kind] + '"><div class="wx-dots"></div>' +
      '<div class="wx-bubble"><b>' + QUIP[m.kind] + '</b><span>' + App.esc(m.summary) + '</span></div>' +
      '<div class="wx-hero">' + toon(m.kind, 300, true) + '</div><div class="wx-hill"></div><div class="wx-hill wx-hill--b"></div></div>' +
      '<div class="wx-now"><div class="wx-title">Right now</div>' +
      '<div class="wx-big"><span class="wx-deg">' + (m.t == null ? '--' : m.t) + '<sup>°</sup></span><div class="wx-sum"><b>' + App.esc(m.desc) + '</b>' +
      '<span>Feels like ' + (m.feels == null ? '--' : m.feels) + '°</span><span>High ' + m.hi + '° &nbsp;·&nbsp; Low ' + m.lo + '°</span></div></div>' +
      '<div class="wx-stats">' +
      stat('s1', 'drop', 'Rain today', m.rainP + '%', m.rainAmt ? m.rainAmt + (m.unit === 'F' ? ' in' : ' mm') : '') +
      stat('s2', 'bolt', 'Wind', m.wind == null ? '—' : m.wind + ' ' + m.speed, m.dir) +
      stat('s3', 'thermo', 'Humidity', m.hum == null ? '—' : m.hum + '%', '') +
      stat('s4', 'sun', 'UV index', m.uv == null ? '—' : m.uv, m.uv >= 8 ? 'Slather it on!' : m.uv >= 6 ? 'High' : m.uv >= 3 ? 'Moderate' : 'Low') +
      stat('s5', 'sun', 'Sunrise', clock(m.rise), '') +
      stat('s6', 'moon', 'Sunset', clock(m.set), '') +
      '</div></div>' +
      '<div class="wx-hours">' + hours() + '</div>' +
      '<div class="wx-days">' + days() + '</div>';
    if (!sub) { el.innerHTML = '<div class="wx">' + html + '</div>'; } else sub.innerHTML = html;
  }

  App.register('weather', {
    show: function (el) { V.el = el; render(); }
  });
  App.on('minute', function (n) { if (App.current === 'weather' && V.el && n.getMinutes() % 10 === 0) render(); });
})();
