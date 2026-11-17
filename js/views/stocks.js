// Stocks: a tile per stock (red/green for the day's move), a small Add button, and the data
// the screensaver ticker uses (App.stocks). Quotes come from /api/stocks; the watchlist is kept
// on the server when storage is set up, otherwise on this frame.
(function () {
  'use strict';
  function key() { try { return localStorage.getItem('ff-key') || ''; } catch (e) { return ''; } }   // read late: live.js stores it from ?key=
  var LS = 'ff-stocks', S = { symbols: [], quotes: {}, stored: true, updated: 0, loaded: false, error: false };
  var V = { el: null };

  function api(path, opts) {
    var k = key(), url = path + (k ? (path.indexOf('?') > -1 ? '&' : '?') + 'key=' + encodeURIComponent(k) : '');
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || r.status); e.status = r.status; e.why = j.why; throw e; } return j; });
    });
  }
  function localList() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
  function saveLocal() { try { localStorage.setItem(LS, JSON.stringify(S.symbols)); } catch (e) { /* ignore */ } }
  function take(j) {
    S.symbols = j.symbols; S.stored = j.stored !== false; S.loaded = true; S.error = false; S.updated = Date.now();
    var q = {}; j.quotes.forEach(function (x) { q[x.symbol] = x; }); S.quotes = q;
    if (!S.stored) saveLocal();
  }
  function load() {
    var local = localList();
    return api('/api/stocks' + (local ? '?symbols=' + encodeURIComponent(local.join(',')) : '')).then(function (j) {
      if (j.stored && local) return api('/api/stocks');          // server keeps the list: ignore the frame's copy
      take(j);
    }).then(function (j) { if (j) take(j); }).catch(function () { S.error = true; S.loaded = true; }).then(function () { App.emit('stocks'); });
  }
  App.stocks = {
    state: S,
    list: function () { return S.symbols.map(function (s) { return S.quotes[s]; }).filter(function (q) { return q && !q.error; }); },
    refresh: load
  };

  function money(n) { return n >= 1000 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toFixed(2); }
  function sign(n) { return n > 0 ? '+' : n < 0 ? '−' : ''; }
  App.stocks.fmt = { money: money, sign: sign };

  function spark(q, w, h) {
    var a = q.spark || []; if (a.length < 2) return '';
    var lo = Math.min.apply(null, a), hi = Math.max.apply(null, a), r = hi - lo || 1, pts = a.map(function (v, i) {
      return (i / (a.length - 1) * w).toFixed(1) + ',' + (h - 3 - (v - lo) / r * (h - 6)).toFixed(1);
    }).join(' ');
    return '<svg class="sk-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function dir(q) { return q.change > 0.004 ? 'up' : q.change < -0.004 ? 'down' : 'flat'; }
  function arrow(d) { return d === 'up' ? '▲' : d === 'down' ? '▼' : '■'; }

  function tile(sym) {
    var q = S.quotes[sym];
    if (!q || q.error) return '<button class="sk-tile sk-tile--err" data-sym="' + App.esc(sym) + '"><div class="sk-sym">' + App.esc(sym) + '</div><div class="sk-name">No quote right now</div>' + (q && q.why ? '<div class="sk-why">' + App.esc(q.why.slice(0, 90)) + '</div>' : '') + '</button>';
    var d = dir(q);
    return '<button class="sk-tile sk-tile--' + d + '" data-sym="' + App.esc(sym) + '">' +
      '<div class="sk-top"><div class="sk-sym">' + App.esc(sym) + '</div><div class="sk-pct num">' + arrow(d) + ' ' + Math.abs(q.pct).toFixed(2) + '%</div></div>' +
      '<div class="sk-name">' + App.esc(q.name) + '</div>' +
      '<div class="sk-price num">' + money(q.price) + '</div>' +
      '<div class="sk-chg">' + sign(q.change) + money(Math.abs(q.change)) + ' today</div>' +
      spark(q, 220, 46) + '</button>';
  }

  function paint() {
    if (!V.el) return;
    var grid = V.el.querySelector('.sk-grid'); if (!grid) return;
    var st = grid.scrollTop;
    grid.innerHTML = S.symbols.length ? S.symbols.map(tile).join('') : '<div class="sk-empty serif">' + (S.loaded ? 'No stocks yet.<br><i>Tap Add.</i>' : 'Loading…') + '</div>';
    grid.scrollTop = st;
    var live = App.stocks.list(), first = live[0];
    var note = S.error ? 'Couldn’t reach the market feed' : !S.loaded ? '' : first && first.state && first.state !== 'REGULAR' ? 'Market closed · showing the last close' : S.updated ? 'Updated ' + App.fmt.time(new Date(S.updated)) : '';
    V.el.querySelector('.sk-note').textContent = note;
  }

  function addSheet() {
    App.sheet('<div class="sk-sheet"><div class="label">Watchlist</div><h2 class="serif">Add a stock</h2>' +
      '<input class="sk-input" placeholder="Company or ticker, like Apple" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40">' +
      '<div class="sk-sugg" role="listbox"></div>' +
      '<div class="sk-msg"></div><button class="btn sk-go">Add to page</button></div>', {
      onMount: function (sheet, close) {
        var inp = sheet.querySelector('.sk-input'), msg = sheet.querySelector('.sk-msg'), go = sheet.querySelector('.sk-go'), box = sheet.querySelector('.sk-sugg');
        // Suggestions: ask the server a moment after typing stops; ignore answers to older text.
        var timer = null, asked = '', results = [];
        function paintSugg() {
          box.innerHTML = results.map(function (r) {
            var on = S.symbols.indexOf(r.symbol) > -1;
            return '<button class="sk-sg' + (on ? ' is-on' : '') + '" data-pick="' + App.esc(r.symbol) + '"' + (on ? ' disabled' : '') + '>' +
              '<b>' + App.esc(r.symbol) + '</b><span>' + App.esc(r.name) + '</span><small>' + (on ? 'On page' : App.esc(r.exch || '')) + '</small></button>';
          }).join('');
        }
        function lookup() {
          var text = inp.value.trim();
          clearTimeout(timer);
          if (!text) { asked = ''; results = []; paintSugg(); return; }
          timer = setTimeout(function () {
            asked = text;
            api('/api/stocks?search=' + encodeURIComponent(text)).then(function (j) {
              if (asked !== text || inp.value.trim() !== text) return;   // a newer search is coming
              results = j.results || []; paintSugg();
              msg.textContent = results.length ? '' : 'No matches. Try the ticker, like AAPL.';
            }, function () { /* no suggestions: typing a ticker still works */ });
          }, 250);
        }
        inp.addEventListener('input', function () { msg.textContent = ''; lookup(); });
        box.addEventListener('click', function (e) { var b = e.target.closest('[data-pick]'); if (b && !b.disabled) submit(b.dataset.pick); });
        function submit(pick) {
          // Add the tapped suggestion; otherwise an exact ticker match in the list; otherwise the top
          // suggestion ("apple" + Add -> AAPL, or "AAPL is already on the page"); with none, the typed ticker.
          var typed = inp.value.toUpperCase().replace(/^\$/, '').replace(/\s+/g, '');
          var exact = results.filter(function (r) { return r.symbol === typed; })[0];
          var sym = typeof pick === 'string' ? pick : exact ? exact.symbol : results[0] ? results[0].symbol : typed;
          if (!/^[A-Z0-9][A-Z0-9.\-^=]{0,11}$/.test(sym)) { msg.textContent = 'Type a company name or ticker, then pick it from the list'; return; }
          if (S.symbols.indexOf(sym) > -1) { msg.textContent = sym + ' is already on the page'; return; }
          go.disabled = true; msg.textContent = 'Checking…';
          var done = function () { close(); load().then(paint); App.toast('Added <b>' + App.esc(sym) + '</b>', { icon: 'check', ms: 2500 }); };
          var fail = function (e) { go.disabled = false; msg.textContent = e.status === 404 ? 'Couldn’t find “' + sym + '”' + (e.why ? ' (' + e.why.slice(0, 70) + ')' : '') : 'Couldn’t add it right now'; };
          api('/api/stocks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', symbol: sym }) }).then(done, function (e) {
            if (e.status !== 501) return fail(e);
            S.symbols.push(sym); saveLocal();                          // no shared storage: keep it on this frame
            api('/api/stocks?symbols=' + encodeURIComponent(S.symbols.join(','))).then(function (j) {
              if (j.quotes.filter(function (x) { return x.symbol === sym && !x.error; }).length) done(); else { S.symbols.pop(); saveLocal(); fail({ status: 404 }); }
            }, function () { S.symbols.pop(); saveLocal(); fail({}); });
          });
        }
        go.addEventListener('click', function () { submit(); });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
        setTimeout(function () { inp.focus(); }, 50);
      }
    });
  }
  function detailSheet(sym) {
    var q = S.quotes[sym], d = q && !q.error ? dir(q) : 'flat';
    App.sheet('<div class="sk-sheet"><div class="label">' + App.esc(sym) + '</div><h2 class="serif">' + App.esc(q ? q.name : sym) + '</h2>' +
      (q && !q.error ? '<div class="sk-big sk-' + d + ' num">' + money(q.price) + ' <small>' + arrow(d) + ' ' + sign(q.change) + money(Math.abs(q.change)) + ' (' + Math.abs(q.pct).toFixed(2) + '%)</small></div><div class="sk-detail-spark sk-' + d + '">' + spark(q, 420, 90) + '</div>' : '') +
      '<button class="btn sk-del">Remove from page</button></div>', {
      onMount: function (sheet, close) {
        sheet.querySelector('.sk-del').addEventListener('click', function () {
          S.symbols = S.symbols.filter(function (s) { return s !== sym; }); delete S.quotes[sym]; saveLocal(); paint(); App.emit('stocks'); close();
          api('/api/stocks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove', symbol: sym }) }).catch(function () { /* frame-only list */ });
        });
      }
    });
  }

  App.register('stocks', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        el.innerHTML = '<div class="stocks"><header class="sk-head"><div><div class="label">Watchlist</div><h1 class="serif">Stocks</h1></div><div class="sk-note"></div></header><div class="sk-grid"></div><button class="sk-add" data-skadd aria-label="Add a stock">' + App.icon('plus', 22) + '<span>Add</span></button></div>';
        el.addEventListener('click', function (e) {
          if (e.target.closest('[data-skadd]')) return addSheet();
          var t = e.target.closest('[data-sym]'); if (t) detailSheet(t.dataset.sym);
        });
      }
      paint(); load().then(paint);
    }
  });
  App.on('ready', function () { load(); setInterval(function () { if (!document.hidden) load().then(function () { if (App.current === 'stocks') paint(); }); }, 3 * 60000); });
})();
