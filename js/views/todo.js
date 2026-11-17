// To Do: one shared list. Add on the frame, from a phone (/add.html) or by voice (see docs/TODO-VOICE.md).
// The list itself is kept in sync by js/live.js (App.todo.*).
(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null, who: 'all', pick: '' };

  function known(id) { return D.people.filter(function (p) { return p.id === id; })[0]; }
  function mine(g) { return V.who === 'all' || g.who === V.who; }
  function openItems() { return D.todos.filter(function (g) { return !g.done && mine(g); }).sort(function (a, b) { return a.created - b.created; }); }
  function doneItems() { return D.todos.filter(function (g) { return g.done && mine(g); }).sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); }); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function chip(g) {
    if (!g.who) return '';
    var p = known(g.who);
    return p ? '<span class="t-who" style="' + App.pstyle(p) + '">' + App.esc(p.name) + '</span>' : '<span class="t-who">' + App.esc(cap(g.who)) + '</span>';
  }
  function row(g) {
    return '<div class="t-row" data-id="' + App.esc(g.id) + '"><button class="t-hit" data-check="' + App.esc(g.id) + '">' +
      '<span class="t-box">' + App.icon('check', 22) + '</span><span class="t-text">' + App.esc(g.text) + '</span>' + chip(g) + '</button></div>';
  }
  function listHTML() {
    var open = openItems(), allDone = doneItems(), done = allDone.slice(0, 6);
    var h = open.length ? open.map(row).join('') : '<div class="t-empty serif">Nothing to do.<br><i>Enjoy it.</i></div>';
    if (done.length) {
      h += '<div class="t-done-h"><span class="label">Done · tap to put back</span><button class="t-clear" data-clear>Clear done</button></div>' + done.map(function (g) {
        return '<button class="t-got" data-revive="' + App.esc(g.id) + '"><span>' + App.esc(g.text) + '</span>' + chip(g) + '</button>';
      }).join('');
    }
    return h;
  }
  function headHTML() {
    var all = D.todos.filter(function (g) { return !g.done; });
    var seg = [['all', 'All', null]].concat(D.people.map(function (p) { return [p.id, p.name, p]; })).map(function (s) {
      var n = s[0] === 'all' ? all.length : all.filter(function (g) { return g.who === s[0]; }).length;
      return '<button class="' + (V.who === s[0] ? 'is-on' : '') + '" data-who="' + s[0] + '">' +
        (s[2] ? '<i class="t-dot" style="' + App.pstyle(s[2]) + '"></i>' : '') + s[1] + ' <span class="num">' + n + '</span></button>';
    }).join('');
    return seg;
  }
  function pickHTML() {
    var pick = V.who !== 'all' && !V.pick ? V.who : V.pick;
    return [['', 'Anyone', null]].concat(D.people.map(function (p) { return [p.id, p.name, p]; })).map(function (s) {
      var on = pick === s[0];
      return '<button class="t-pick-b' + (on ? ' is-on' : '') + '" data-pick="' + s[0] + '"' + (s[2] ? ' style="' + App.pstyle(s[2]) + '"' : '') + '>' + s[1] + '</button>';
    }).join('');
  }

  function paint() {
    if (!V.el || !V.el.querySelector('.t-list')) return;
    var l = V.el.querySelector('.t-list'), st = l.scrollTop;
    l.innerHTML = listHTML(); l.scrollTop = st;
    V.el.querySelector('.t-count').innerHTML = '<span class="num">' + openItems().length + '</span> to do';
    V.el.querySelector('.t-who-seg').innerHTML = headHTML();
    V.el.querySelector('.t-pick').innerHTML = pickHTML();
  }

  function render() {
    V.el.innerHTML = '<div class="todo">' +
      '<header class="t-head"><div><div class="label">Shared list</div><h1 class="serif">To Do</h1></div><div class="t-count"></div><div class="seg t-who-seg"></div></header>' +
      '<div class="t-list"></div>' +
      '<aside class="t-side">' +
      '  <div class="t-add">' +
      '    <label class="t-input-wrap">' + App.icon('plus', 30) + '<input class="t-input" placeholder="Add a to-do…" autocomplete="off" enterkeyhint="done" maxlength="120"></label>' +
      '    <div class="label label--light">Who is it for?</div><div class="t-pick"></div>' +
      '    <button class="btn t-go" data-addgo>Add to list</button>' +
      '  </div>' +
      '  <div class="t-phone"><div class="label">Add from your phone</div><div class="t-qr" aria-hidden="true"></div></div>' +
      '</aside></div>';
    try { V.el.querySelector('.t-qr').innerHTML = QR.svg(location.origin + '/add.html', { ecl: 'M' }); } catch (e) { V.el.querySelector('.t-qr').style.display = 'none'; }
    V.el.querySelector('.t-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    paint();
  }

  function add() {
    var input = V.el.querySelector('.t-input'), text = input.value.trim();
    if (!text) return;
    var who = V.who !== 'all' && !V.pick ? V.who : V.pick;
    var g = App.todo.add(text, who);
    input.value = ''; V.pick = '';
    paint();
    App.toast('Added <b>' + App.esc(g.text) + '</b>' + (g.who && known(g.who) ? ' for ' + App.esc(known(g.who).name) : ''), { icon: 'check', ms: 2500 });
  }

  function onClick(e) {
    var t;
    if ((t = e.target.closest('[data-check]'))) {
      var id = t.dataset.check, g = D.todos.filter(function (x) { return x.id === id; })[0];
      if (!g) return;
      App.todo.toggle(id, true); paint();
      App.toast('<b>' + App.esc(g.text) + '</b> done', { icon: 'check', undo: function () { App.todo.toggle(id, false); paint(); } });
      return;
    }
    if (e.target.closest('[data-clear]')) {
      var n = App.todo.clearDone(V.who === 'all' ? '' : V.who); paint();
      return App.toast('Cleared <b>' + n + '</b> done item' + (n === 1 ? '' : 's'), { icon: 'check', ms: 2500 });
    }
    if ((t = e.target.closest('[data-revive]'))) { App.todo.toggle(t.dataset.revive, false); return paint(); }
    if ((t = e.target.closest('[data-who]'))) { V.who = t.dataset.who; V.pick = ''; return paint(); }
    if ((t = e.target.closest('[data-pick]'))) { V.pick = t.dataset.pick; if (!V.pick && V.who !== 'all') V.pick = ''; V.el.querySelector('.t-pick').innerHTML = pickHTML(); return; }
    if (e.target.closest('[data-addgo]')) return add();
  }

  App.register('todo', {
    show: function (el, opts) {
      if (!V.el) { V.el = el; el.addEventListener('click', onClick); }
      var keep = el.querySelector('.t-input'), typed = keep ? keep.value : '';
      if (!el.querySelector('.todo') || !opts || !opts.rerender) render(); else paint();
      if (typed) V.el.querySelector('.t-input').value = typed;
    }
  });
})();
