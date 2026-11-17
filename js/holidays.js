// Holidays shown on the calendar, on the day they actually fall. The list follows the ORNL holiday schedule (non-bargaining
// employees) as a guide to WHICH holidays to show; ORNL's "companion" and observed days are deliberately not shown.
// Rules: fixed: [month, day]   nth: [month, weekday 0=Sun..6=Sat, n]  (n = -1 for the last one)   easter: days after Easter Sunday
(function () {
  'use strict';
  var HOLIDAYS = [
    { id: 'newyear',      name: "New Year's Day",     short: "New Year's",   icon: 'sparkle',   t: 'newyear', fixed: [1, 1] },
    { id: 'mlk',          name: "Martin Luther King Jr. Day", short: 'MLK Day', icon: 'heart',   t: 'mlk',     nth: [1, 1, 3] },
    { id: 'goodfri',      name: 'Good Friday',        short: 'Good Friday',  icon: 'cross',     t: 'goodfri', easter: -2 },
    { id: 'memorial',     name: 'Memorial Day',       short: 'Memorial Day', icon: 'flag',      t: 'patriot', nth: [5, 1, -1] },
    { id: 'july4',        name: 'Independence Day',   short: '4th of July',  icon: 'firework',  t: 'july4',   fixed: [7, 4] },
    { id: 'labor',        name: 'Labor Day',          short: 'Labor Day',    icon: 'hammer',    t: 'labor',   nth: [9, 1, 1] },
    { id: 'thanksgiving', name: 'Thanksgiving Day',   short: 'Thanksgiving', icon: 'leaf',      t: 'thanks',  nth: [11, 4, 4] },
    { id: 'xmas',         name: 'Christmas Day',      short: 'Christmas',    icon: 'candycane', t: 'xmas',    fixed: [12, 25] }
  ];

  function nth(year, month, wd, n) {
    if (n > 0) { var d = new Date(year, month - 1, 1); d.setDate(1 + ((wd - d.getDay() + 7) % 7) + (n - 1) * 7); return d; }
    var e = new Date(year, month, 0); e.setDate(e.getDate() - ((e.getDay() - wd + 7) % 7)); return e;   // last weekday of the month
  }
  function easter(y) {                                            // Gregorian Easter Sunday (anonymous algorithm)
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  var cache = {};
  function year(y) {
    if (cache[y]) return cache[y];
    var map = {};
    HOLIDAYS.forEach(function (h) {
      var d = h.fixed ? new Date(y, h.fixed[0] - 1, h.fixed[1]) : h.nth ? nth(y, h.nth[0], h.nth[1], h.nth[2]) : easter(y);
      if (h.easter) d.setDate(d.getDate() + h.easter);
      map[d.getMonth() + '-' + d.getDate()] = h;
    });
    return (cache[y] = map);
  }

  // The holiday on a date, or null.
  App.holidayOn = function (d) { return year(d.getFullYear())[d.getMonth() + '-' + d.getDate()] || null; };

  // Icon + name in the holiday's own colors and type. size: 'm' month pill, 'b' bar. short: use the short name.
  App.holidayChip = function (h, size, short) {
    var px = size === 'b' ? 22 : 15;
    return '<span class="hol hol--' + (size || 'm') + '" data-t="' + h.t + '">' + App.icon(h.icon, px) + '<span class="hol-n">' + App.esc(short || size === 'm' ? h.short : h.name) + '</span></span>';
  };

  // Festive all-day banner for the Today view.
  App.holidayBanner = function (h) {
    var ic = function (c) { return '<i class="hol-sp ' + c + '">' + App.icon(h.icon, 56) + '</i>'; };
    return '<div class="hol-banner" data-t="' + h.t + '">' + ic('sp1') + ic('sp2') + ic('sp3') + ic('sp4') +
      '<div class="hol-b-icon">' + App.icon(h.icon, 44) + '</div>' +
      '<div class="hol-b-text"><small>Holiday</small><b>' + App.esc(h.name) + '</b></div></div>';
  };
})();
