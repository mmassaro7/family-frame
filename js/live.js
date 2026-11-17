// Live data: weather (Open-Meteo), calendar, photos and the shared shopping list.
// Everything degrades gracefully: if an /api route isn't configured the frame keeps working.
(function () {
  'use strict';
  var D = window.DATA, C = window.CONFIG;

  // ---- optional shared secret (?key=... in the Start URL) remembered in localStorage
  var KEY = '';
  try {
    var m = location.search.match(/[?&]key=([^&]*)/);
    if (m) localStorage.setItem('ff-key', decodeURIComponent(m[1]));
    KEY = localStorage.getItem('ff-key') || '';
  } catch (e) { if (m) KEY = decodeURIComponent(m[1]); }

  function api(path, opts) {
    var url = path + (KEY ? (path.indexOf('?') > -1 ? '&' : '?') + 'key=' + encodeURIComponent(KEY) : '');
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) { var err = new Error(j.error || r.status); err.status = r.status; throw err; } return j; });
    });
  }
  function every(ms, fn) { fn(); setInterval(function () { if (!document.hidden) fn(); }, ms); }
  function dateLocal(s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }

  // ------------------------------------------------------------ weather
  var SNOW = { 71: 1, 73: 1, 75: 1, 77: 1, 85: 1, 86: 1 };
  function cond(code, isDay) {
    if (code === 0 || code === 1) return isDay ? 'sun' : 'moon';
    if (code === 2) return isDay ? 'partly' : 'cloud';
    if (code === 3 || code === 45 || code === 48) return 'cloud';
    if (SNOW[code]) return 'snow';
    return 'rain';
  }
  function localDate(iso) {                                       // "2026-11-08T06:52" (already local time)
    var m = /^(\d+)-(\d+)-(\d+)T(\d+):(\d+)/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
  }
  function loadWeather() {
    var L = C.location, f = L.units === 'celsius' ? 'celsius' : 'fahrenheit';
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + L.lat + '&longitude=' + L.lon +
      '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max,precipitation_sum' +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day' +
      '&temperature_unit=' + f + (f === 'fahrenheit' ? '&wind_speed_unit=mph&precipitation_unit=inch' : '') + '&timezone=auto&forecast_days=7';
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var H = j.hourly;
      if (!H || H.time.length < 48) return;
      var W = D.weather;
      // Hourly arrays stay 48 long (today + tomorrow); the 7-day outlook comes from the daily block.
      W.t = H.temperature_2m.slice(0, 48).map(Math.round);
      W.c = H.weather_code.slice(0, 48).map(function (c, i) { return cond(c, H.is_day[i]); });
      W.p = H.precipitation_probability.slice(0, 48).map(function (p) { return p || 0; });
      var DY = j.daily;
      W.days = DY.time.map(function (iso, i) {
        var q = iso.split('-');
        return { date: new Date(+q[0], +q[1] - 1, +q[2]), c: cond(DY.weather_code[i], 1), code: DY.weather_code[i],
          uv: Math.round((DY.uv_index_max || [])[i] || 0), wind: Math.round((DY.wind_speed_10m_max || [])[i] || 0),
          rain: Math.round(((DY.precipitation_sum || [])[i] || 0) * 100) / 100,
          rise: localDate((DY.sunrise || [])[i]), set: localDate((DY.sunset || [])[i]),
          hi: Math.round(DY.temperature_2m_max[i]), lo: Math.round(DY.temperature_2m_min[i]),
          p: (DY.precipitation_probability_max || [])[i] || 0 };
      });
      var N = j.current;                                           // "right now" details for the Weather page
      W.now = N ? { t: Math.round(N.temperature_2m), feels: Math.round(N.apparent_temperature), hum: Math.round(N.relative_humidity_2m),
        wind: Math.round(N.wind_speed_10m), dir: N.wind_direction_10m, code: N.weather_code, c: cond(N.weather_code, N.is_day) } : null;
      W.hi = Math.round(j.daily.temperature_2m_max[0]);
      W.lo = Math.round(j.daily.temperature_2m_min[0]);
      W.wet = H.weather_code.slice(0, 24).some(function (c) { return SNOW[c]; }) ? 'Snow' : 'Rain';
      W.units = f; W.live = true;
      App.emit('data');
      if (App.current === 'home') App.rerender();
    }).catch(function () { /* offline: keep the last weather */ });
  }

  // ------------------------------------------------------------ calendar
  // Optional per-calendar color from the CALENDARS variable, e.g. "color":"#8BD18F"
  function tint(e) {
    if (!/^#[0-9a-f]{6}$/i.test(e.color || '')) return null;
    var h = e.color.slice(1);
    return { id: 'tint', name: e.label || '', color: e.color, ink: e.ink || '#111111',
      rgb: [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }).join(' ') };
  }
  var known = {};
  C.people.forEach(function (p) { known[p.id] = 1; });
  function applyEvents(list) {
    D.events = list.map(function (e) {
      var ppl = [];
      e.people.forEach(function (id) {
        if (id === 'family' || id === 'all') D.ALL.forEach(function (x) { if (ppl.indexOf(x) < 0) ppl.push(x); });
        else if (known[id] && ppl.indexOf(id) < 0) ppl.push(id);
      });
      if (!ppl.length) ppl = D.ALL.slice();
      return {
        id: e.id, title: e.title, loc: e.loc, notes: e.notes, allDay: e.allDay, people: ppl, tint: tint(e),
        start: e.allDay ? dateLocal(e.start) : new Date(e.start),
        end: e.allDay ? dateLocal(e.end) : new Date(e.end)
      };
    });
    App.emit('data');
    if (App.current === 'home' || App.current === 'calendar') App.rerender();
  }
  var retryTimer = null, warned = false;
  function loadCalendar() {
    api('/api/calendar').then(function (j) {
      applyEvents(j.events);
      warned = false;
      try { localStorage.setItem('ff-events', JSON.stringify(j.events)); } catch (e) { /* storage unavailable */ }
      if (j.errors && j.errors.length) console.warn('Calendar feeds failed:', j.errors);
    }).catch(function (e) {
      if (e.status === 501) return console.info('Calendar not configured yet (set CALENDARS in Vercel).');
      if (e.status === 401) return console.warn('Calendar: unauthorized — is ?key= in the URL?');
      // Network hiccup or a slow/failed server: keep showing the last good copy and try again soon.
      console.warn('Calendar update failed:', e.message);
      if (!warned && App.toast) { warned = true; App.toast('Calendar couldn’t update. Showing the last copy.', { icon: 'calendar', ms: 4000 }); }
      clearTimeout(retryTimer); retryTimer = setTimeout(loadCalendar, 30000);
    });
  }
  // Show the last good copy instantly on start (until the first fresh load arrives).
  try { var cached = JSON.parse(localStorage.getItem('ff-events') || 'null'); if (cached && cached.length) applyEvents.cached = cached; } catch (e) { /* ignore */ }

  // ------------------------------------------------------------ photos
  function loadPhotos() {
    api('/api/photos').then(function (j) {
      if (!j.photos.length) return useSamples();
      D.photos = j.photos.map(function (p) { return { id: p.id, base: p.base, o: p.o, date: p.date || '2000-01-01', dated: p.dated !== false && !!p.date, place: p.place, tag: p.date }; });
      App.loadFavs();
      App.resetSlideshows();
    }).catch(function (e) {
      if (e.status !== 501) console.warn('Photos:', e.message);
      useSamples();   // Drive not connected (or unreachable and nothing loaded yet): show the sample photos
    });
  }
  function useSamples() {
    if (D.photos.length) return;  // never replace real photos with samples
    D.photos = D.samplePhotos;
    App.resetSlideshows();
  }

  // ------------------------------------------------------------ shopping (server-synced, local fallback)
  var LS = 'ff-shopping', server = true, lastSeen = 0, dirty = false, putTimer = null;
  function readLocal() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
  function writeLocal() { try { localStorage.setItem(LS, JSON.stringify(D.groceries)); } catch (e) { /* storage unavailable */ } }

  function pushShopping() {
    clearTimeout(putTimer);
    putTimer = setTimeout(function () {
      api('/api/shopping', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: D.groceries }) })
        .then(function (r) { lastSeen = r.updated; dirty = false; })
        .catch(function () { /* will retry on the next change */ });
    }, 700);
  }
  function pullShopping() {
    if (!server) return;
    if (dirty) { pushShopping(); return; }   // an earlier save didn't go through; try again
    api('/api/shopping').then(function (j) {
      if (j.counts) {
        D.usualCounts = j.counts;
        try { localStorage.setItem('ff-usual-counts', JSON.stringify(j.counts)); } catch (e) { /* ignore */ }
        App.emit('usuals');
      }
      if (j.updated && j.updated !== lastSeen) {
        lastSeen = j.updated;
        D.groceries = App.tidyGroceries ? App.tidyGroceries(j.items) : j.items;
        lastSig = sig();            // so the 'data' handler below doesn't push it straight back
        writeLocal();
        App.emit('data');
        if (App.current === 'shopping' || App.current === 'home') App.rerender();
      } else if (!j.updated && D.groceries.length) pushShopping(); // first run: seed the server with what's on the frame
    }).catch(function (e) { if (e.status === 501) server = false; });
  }
  // How often items get added (for the Usuals tiles): the server keeps the family-wide counts.
  App.shopBump = function (name) {
    if (!server) return;
    api('/api/shopping', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'bump', name: name }) }).catch(function () { /* local count still applies */ });
  };
  var lastSig = '';
  function sig() { return JSON.stringify(D.groceries); }
  App.on('data', function () {
    var s = sig();
    if (s === lastSig) return;       // 'data' also fires for calendar/weather loads
    lastSig = s;
    writeLocal();
    if (server) { dirty = true; pushShopping(); }
  });

  var saved = readLocal();
  if (saved) D.groceries = saved;
  lastSig = sig();


  // ------------------------------------------------------------ to-do list (server-synced, local fallback)
  // Every change is sent as its own small request (add / toggle), so phones, voice assistants and the
  // frame can all change the list at once without overwriting each other.
  var TLS = 'ff-todos', todoServer = true, todoBusy = 0, todoSig = '';
  function saveTodos() { try { localStorage.setItem(TLS, JSON.stringify(D.todos)); } catch (e) { /* storage unavailable */ } }
  function todoChanged() {
    var s = JSON.stringify(D.todos);
    if (s === todoSig) return;
    todoSig = s; saveTodos(); App.emit('data');
  }
  function todoSend(body) {
    todoBusy++;
    return api('/api/todo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { todoBusy--; return r; }, function (e) { todoBusy--; if (e.status === 501) todoServer = false; throw e; });
  }
  function todoFind(id) { return D.todos.filter(function (t) { return t.id === id; })[0]; }
  function sendAdd(t) {
    todoSend({ action: 'add', text: t.text, who: t.who, source: 'frame' }).then(function (r) {
      var mine = todoFind(t.id), item = r.item;
      D.todos = D.todos.filter(function (x) { return x.id !== t.id && x.id !== item.id; });   // swap the placeholder for the saved item
      D.todos.push(item);
      if (mine && mine.done !== item.done) todoSend({ action: 'toggle', id: item.id, done: mine.done }).catch(function () {});
      if (mine && mine.done) { item.done = true; item.doneAt = mine.doneAt; }
      todoChanged();
      if (App.current === 'todo' || App.current === 'home') App.rerender();
    }).catch(function () { /* stays on the frame; sent again on the next refresh */ });
  }
  App.todo = {
    add: function (text, who) {
      var t = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: text.charAt(0).toUpperCase() + text.slice(1), who: who || '', done: false, created: Date.now(), pending: true };
      D.todos.push(t); todoChanged();
      if (todoServer) sendAdd(t); else t.pending = false;
      return t;
    },
    clearDone: function (who) {                 // who: a person id, or '' / undefined for everyone
      var gone = D.todos.filter(function (t) { return t.done && (!who || t.who === who); });
      D.todos = D.todos.filter(function (t) { return gone.indexOf(t) < 0; });
      todoChanged();
      if (todoServer && gone.length) todoSend({ action: 'clear-done', who: who || undefined }).catch(function () {});
      return gone.length;
    },
    toggle: function (id, done) {
      var t = todoFind(id); if (!t) return;
      t.done = done; t.doneAt = done ? Date.now() : 0; todoChanged();
      if (todoServer && !t.pending) todoSend({ action: 'toggle', id: id, done: done }).catch(function () {});
    }
  };
  function pullTodos() {
    if (!todoServer || todoBusy) return;
    var waiting = D.todos.filter(function (t) { return t.pending; });
    waiting.forEach(sendAdd);                       // earlier adds that didn't get through
    api('/api/todo').then(function (j) {
      if (todoBusy) return;
      D.todos = j.items.concat(waiting.filter(function (t) { return !j.items.some(function (i) { return i.text.toLowerCase() === t.text.toLowerCase() && !i.done; }); }));
      todoChanged();
      if (App.current === 'todo') App.rerender();
    }).catch(function (e) { if (e.status === 501) todoServer = false; });
  }
  try { var savedTodos = JSON.parse(localStorage.getItem(TLS) || 'null'); if (savedTodos) D.todos = savedTodos; } catch (e) { /* ignore */ }
  todoSig = JSON.stringify(D.todos);

  App.on('ready', function () {
    if (applyEvents.cached) applyEvents(applyEvents.cached);
    every(20 * 60000, loadWeather);
    every(5 * 60000, loadCalendar);
    every(30 * 60000, loadPhotos);
    every(20000, pullShopping);
    every(20000, pullTodos);
  });
})();
