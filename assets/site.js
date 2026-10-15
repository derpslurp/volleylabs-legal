// VolleyLabs launch page: the hero's key moments advance on their own (the
// skeleton, callouts and timer bar are CSS animations that restart when a
// frame turns "on"), the score counts up, and sections rise in on scroll.
// The page is complete without this file; it adds the "js" class itself so a
// failed load hides nothing.
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canObserve = 'IntersectionObserver' in window;
  var CYCLE_MS = 3200; // matches the .tick animation in site.css

  function hero() {
    var shot = document.querySelector('.shot');
    var row = document.querySelector('.moments');
    if (!shot || !row) return;
    var frames = Array.prototype.slice.call(shot.querySelectorAll('.frame'));
    var buttons = Array.prototype.slice.call(row.querySelectorAll('.moment'));
    var order = buttons.map(function (b) { return b.dataset.moment; });
    var current = 0, timer = null, inView = true, paused = reduce;

    function show(i) {
      current = i;
      var id = order[i];
      frames.forEach(function (f) { f.classList.toggle('on', f.dataset.moment === id); });
      buttons.forEach(function (b) {
        var on = b.dataset.moment === id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    function start() {
      if (timer || paused || !inView || document.hidden) return;
      row.classList.add('timing');
      // Restart the active button's timer bar in step with the interval.
      var on = buttons[current];
      on.classList.remove('on'); void on.offsetWidth; on.classList.add('on');
      timer = setInterval(function () { show((current + 1) % order.length); }, CYCLE_MS);
    }
    function stop() {
      clearInterval(timer); timer = null;
      row.classList.remove('timing');
    }

    buttons.forEach(function (b, i) {
      b.addEventListener('click', function () {
        // A visitor who picks a moment is in charge from then on.
        paused = true;
        stop();
        show(i);
      });
    });

    if (reduce) return;
    if (canObserve) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) start(); else stop();
      }).observe(shot);
    } else {
      start();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
  }

  function countUp() {
    var el = document.querySelector('.score-num');
    if (!el || reduce) return;
    var to = Number(el.dataset.to), t0 = null;
    el.textContent = '0';
    function step(t) {
      if (t0 === null) t0 = t;
      var k = Math.min((t - t0) / 1400, 1);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    }
    // Start as the hero image rises in.
    setTimeout(function () { requestAnimationFrame(step); }, 350);
  }

  function reveals() {
    var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (reduce || !canObserve) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  // The web fonts arrive after the first paint and change how headings wrap,
  // which can shift a deep-linked section (Apple's reviewer opens #support)
  // under the sticky nav in Safari. Re-align once they load, unless the
  // visitor has already started scrolling.
  function keepDeepLink() {
    var id = location.hash.slice(1);
    if (!id || !document.fonts || !document.fonts.ready) return;
    var moved = false;
    function touched() { moved = true; }
    ['wheel', 'touchstart', 'keydown'].forEach(function (t) {
      window.addEventListener(t, touched, { once: true, passive: true });
    });
    document.fonts.ready.then(function () {
      var el = document.getElementById(id);
      if (el && !moved) el.scrollIntoView();
    });
  }

  hero();
  countUp();
  reveals();
  keepDeepLink();
})();
