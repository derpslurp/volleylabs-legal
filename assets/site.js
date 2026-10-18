// VolleyLabs launch page: the hero's key moments advance on their own (the
// skeleton, callouts and timer bar are CSS animations that restart when a
// frame turns "on"), the score counts up, and sections rise in on scroll.
// The page is complete without this file; it adds the "js" class itself so a
// failed load hides nothing.
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  // Reduced motion is handled in site.css: it keeps fades and drops movement.
  var canObserve = 'IntersectionObserver' in window;
  var CYCLE_MS = 3200; // matches the .tick animation in site.css

  function hero() {
    var shot = document.querySelector('.shot');
    var row = document.querySelector('.moments');
    if (!shot || !row) return;
    var frames = Array.prototype.slice.call(shot.querySelectorAll('.frame'));
    var buttons = Array.prototype.slice.call(row.querySelectorAll('.moment'));
    var order = buttons.map(function (b) { return b.dataset.moment; });
    var current = 0, timer = null, inView = true, paused = false;

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
    if (!el) return;
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
    if (!canObserve) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) {
      // Items in one group (steps, cards, plans) fade in one after another.
      var group = Array.prototype.filter.call(e.parentNode.children, function (c) {
        return c.classList.contains('reveal');
      });
      e.style.setProperty('--stagger', Math.min(group.indexOf(e), 4) * 0.1 + 's');
      io.observe(e);
    });
  }

  // The result-screen recording plays while it is on screen; a tap pauses it.
  function resultVideo() {
    var v = document.querySelector('.phone-video');
    if (!v) return;
    var userPaused = false;
    function play() {
      var p = v.play();
      if (p && p.catch) p.catch(function () { v.controls = true; }); // Low Power Mode
    }
    v.addEventListener('click', function () {
      userPaused = !v.paused;
      if (v.paused) play(); else v.pause();
    });
    if (!canObserve) { v.controls = true; return; }
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !userPaused) play(); else v.pause();
    }, { threshold: 0.35 }).observe(v);
  }

  // Eased scrolling for mouse wheels and trackpads: the page glides to where
  // the wheel points instead of jumping. Touch screens keep native scrolling,
  // and keyboard, scrollbar and link scrolling are left alone.
  var linkScroll = null; // the in-page link scroll in progress, if any

  // In-page links (the menu, "See how it works", Support) ease to their
  // section: a gentle start and finish, landing just under the sticky menu.
  function easeLinks() {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var el = id ? document.getElementById(id) : null;
      if (!el) return;
      e.preventDefault();
      var margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var from = window.scrollY;
      var to = Math.max(0, Math.min(max, el.getBoundingClientRect().top + from - margin));
      var dist = Math.abs(to - from);
      // Longer trips take a little longer, within limits.
      var ms = Math.min(1400, Math.max(500, dist * 0.35));
      if (reduced) ms = Math.min(ms, 450);
      var t0 = null, run = {};
      linkScroll = run;
      function step(t) {
        if (linkScroll !== run) return; // a newer link or the wheel took over
        if (t0 === null) t0 = t;
        var k = Math.min((t - t0) / ms, 1);
        window.scrollTo({ top: from + (to - from) * easeInOut(k), behavior: 'instant' });
        if (k < 1) { requestAnimationFrame(step); return; }
        linkScroll = null;
        if (history.pushState) history.pushState(null, '', '#' + id);
        // Move keyboard focus to the section without jumping again.
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
      }
      requestAnimationFrame(step);
    });
  }

  function smoothWheel() {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    var EASE = 0.11;
    var target = window.scrollY, current = target, running = false;
    function maxY() { return document.documentElement.scrollHeight - window.innerHeight; }
    function tick() {
      current += (target - current) * EASE;
      if (Math.abs(target - current) < 0.5) current = target;
      window.scrollTo({ top: current, behavior: 'instant' });
      if (current !== target) requestAnimationFrame(tick); else running = false;
    }
    window.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // zoom, sideways
      e.preventDefault();
      linkScroll = null;
      var step = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      if (!running) { current = window.scrollY; target = current; }
      target = Math.max(0, Math.min(maxY(), target + step));
      if (!running) { running = true; requestAnimationFrame(tick); }
    }, { passive: false });
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
  resultVideo();
  // motion.js scrolls with Lenis when GSAP and Lenis load and motion is
  // allowed; these hand-rolled versions are the fallback for everyone else.
  var lenisScrolls = window.Lenis && window.gsap && window.ScrollTrigger &&
    window.SplitText && window.ScrambleTextPlugin &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!lenisScrolls) {
    easeLinks();
    smoothWheel();
  }
  keepDeepLink();
})();
