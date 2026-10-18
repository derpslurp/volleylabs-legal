// VolleyLabs launch page, motion layer. GSAP (ScrollTrigger, SplitText,
// ScrambleText) and Lenis drive it; the effects follow React Bits (DotGrid,
// SplitText, DecryptedText, ScrollReveal, TiltedCard, Magnet, SpotlightCard,
// TextType, CountUp, ScrollVelocity, ClickSpark) rebuilt in plain JS.
//
// site.js still owns the hero cycle, score count and base reveals. This file
// only adds to them: if it or the libraries fail to load, the page is exactly
// what it was without it. Visitors who ask for reduced motion (on Windows,
// "Show animations" off, which many turn off for speed) still get the fades,
// decoding text, count-ups, typing, fills and highlights; only the large
// movement (Lenis inertia, parallax, magnets, swing-ins and 3D entrances,
// the moving marquee, rising letters, blur) is left out for them, and the
// cursor tilts are gentler.
(function () {
  'use strict';
  var gsap = window.gsap;
  if (!gsap || !window.ScrollTrigger || !window.SplitText || !window.ScrambleTextPlugin) return;
  gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return gsap.utils.toArray(s); };
  var lenis = null;

  // Everything below lives inside one matchMedia context, so changing the
  // motion setting mid-visit reverts every tween, trigger and split and
  // rebuilds the right version. Listeners and added elements are undone by
  // the cleanups each effect returns.
  gsap.matchMedia().add({
    full: '(prefers-reduced-motion: no-preference)',
    fine: '(pointer: fine)',
    wide: '(min-width: 900px)'
  }, function (ctx) {
    var full = ctx.conditions.full, fine = ctx.conditions.fine, wide = ctx.conditions.wide;
    var root = document.documentElement;
    root.classList.add('vl-motion');
    var undo = [
      full && smoothScroll(), navChrome(), courtFloor(fine, full),
      heroIntro(full), full && heroParallax(), headings(full), glance(), steps(),
      fixCard(full), bars(), chat(), full && phone(), full && marquee(), prices(), faq(), wordmark(),
      rotation(full, wide), full && depthIn()
    ];
    if (fine) undo.push(tilt(full), cardTilt(full), spotlights(), clickSpark());
    if (fine && full) undo.push(magnets());
    // Late fonts, decoding text that briefly wraps, opening answers: anything
    // that changes the page's height moves every trigger below it, so measure
    // again once the height settles.
    var lastH = 0, settle = null;
    var heightWatch = new ResizeObserver(function () {
      var h = document.documentElement.scrollHeight;
      if (h === lastH) return;
      lastH = h;
      clearTimeout(settle);
      settle = setTimeout(function () { ScrollTrigger.refresh(); }, 200);
    });
    heightWatch.observe(document.body);
    undo.push(function () { heightWatch.disconnect(); clearTimeout(settle); });
    return function () {
      undo.forEach(function (fn) { if (typeof fn === 'function') fn(); });
      root.classList.remove('vl-motion');
    };
  });

  // Labels a heading before it is split. SplitText's own label runs lines
  // together at each <br> ("See everymoment"), so split with aria: 'hidden'.
  function label(el) {
    el.setAttribute('aria-label', el.innerHTML.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  }

  // Adds a listener and hands back its removal.
  function on(el, type, fn, opts) {
    el.addEventListener(type, fn, opts);
    return function () { el.removeEventListener(type, fn, opts); };
  }
  function all(fns) { return function () { fns.forEach(function (f) { f(); }); }; }

  // ---- Lenis: inertia scrolling for wheel and trackpad, synced to GSAP ----
  function smoothScroll() {
    if (!window.Lenis) return;
    lenis = new Lenis({ lerp: 0.09 });
    lenis.on('scroll', ScrollTrigger.update);
    function raf(t) { lenis.raf(t * 1000); }
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // In-page links glide to their section, land under the sticky menu, then
    // take keyboard focus without a second jump.
    var offLinks = on(document, 'click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var el = id ? document.getElementById(id) : null;
      if (!el) return;
      e.preventDefault();
      var margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      var dist = Math.abs(el.getBoundingClientRect().top - margin);
      lenis.scrollTo(id === 'top' ? 0 : el, {
        offset: -margin,
        duration: Math.min(1.6, Math.max(0.7, dist / 2200)),
        easing: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
        onComplete: function () {
          if (history.pushState) history.pushState(null, '', '#' + id);
          if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
          el.focus({ preventScroll: true });
        }
      });
    });

    return function () {
      offLinks();
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      lenis = null;
    };
  }

  // ---- Menu: a scroll progress line, and it tucks away while reading down ----
  function navChrome() {
    var nav = $('.nav');
    if (!nav) return;
    var bar = document.createElement('span');
    bar.className = 'nav-progress';
    nav.appendChild(bar);
    gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        nav.classList.toggle('nav-hidden', self.direction === 1 && self.scroll() > 240);
      }
    });
    return function () { bar.remove(); nav.classList.remove('nav-hidden'); };
  }

  // ---- Hero background: a court floor of dots receding to a vanishing point,
  // with sidelines, attack lines and the net drawn in perspective. Light
  // ripples across it toward you, the dots part around the cursor and the
  // vanishing point leans with it (DotGrid, in 3D). With reduced motion the
  // floor, its light and the lean hold still; the dots still part. ----
  function courtFloor(hasPointer, full) {
    var hero = $('.hero');
    if (!hero) return;
    var cv = document.createElement('canvas');
    cv.className = 'vl-dots';
    cv.setAttribute('aria-hidden', 'true');
    hero.insertBefore(cv, hero.firstChild);
    var g = cv.getContext('2d');
    var COLS = 31, ROWS = 28, Z0 = 1, Z1 = 10, R = 140;
    var w = 0, h = 0, dots = [], lean = 0, leanTo = 0;
    var px = -1e4, py = -1e4;

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = hero.clientWidth; h = hero.clientHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          dots.push({ x: (c / (COLS - 1) - 0.5) * 2.4, z: Z0 + r * (Z1 - Z0) / (ROWS - 1), ox: 0, oy: 0, vx: 0, vy: 0 });
        }
      }
    }
    // World x in [-1.2, 1.2], depth z in [1, 10] -> screen. Nearer is bigger.
    function sx(x, z) { return w / 2 + lean * w * 0.07 * (1 - 1 / z) + x * w * 0.62 / z; }
    function sy(z) { var hz = h * 0.3; return hz + (h * 1.12 - hz) / z; }
    function line(x1, z1, x2, z2, a) {
      g.strokeStyle = 'rgba(110,160,255,' + a + ')';
      g.beginPath(); g.moveTo(sx(x1, z1), sy(z1)); g.lineTo(sx(x2, z2), sy(z2)); g.stroke();
    }
    function draw(time) {
      var t = full ? time : 0;
      if (full) lean += (leanTo - lean) * 0.04;
      g.clearRect(0, 0, w, h);
      g.lineWidth = 1;
      line(-1, Z0, -1, Z1, 0.16); line(1, Z0, 1, Z1, 0.16);   // sidelines
      line(-1, 2.6, 1, 2.6, 0.1); line(-1, 4.6, 1, 4.6, 0.1); // attack lines
      g.lineWidth = 2;
      line(-1.08, 3.6, 1.08, 3.6, 0.32);                      // the net
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i], s = 1 / d.z;
        var x = sx(d.x, d.z), y = sy(d.z);
        var dx = x - px, dy = y - py;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var near = dist < R ? 1 - dist / R : 0;
        d.vx += (dx / dist * near * 24 * s - d.ox) * 0.12;
        d.vy += (dy / dist * near * 24 * s - d.oy) * 0.12;
        d.vx *= 0.78; d.vy *= 0.78;
        d.ox += d.vx; d.oy += d.vy;
        var wave = 0.5 + 0.5 * Math.sin(d.z * 1.3 + t * 1.6);
        var fade = Math.min(1, (Z1 - d.z) / 3 + 0.15);
        g.fillStyle = near > 0.02
          ? 'rgba(110,160,255,' + ((0.25 + near * 0.7) * fade).toFixed(3) + ')'
          : 'rgba(147,160,184,' + ((0.08 + wave * wave * 0.2) * fade).toFixed(3) + ')';
        g.beginPath();
        g.arc(x + d.ox, y + d.oy, 0.5 + 2.4 * s + near * 1.6 * s, 0, 6.2832);
        g.fill();
      }
    }

    size();
    var ro = new ResizeObserver(function () { size(); draw(0); });
    ro.observe(hero);
    var running = false;
    function start() { if (!running) { running = true; gsap.ticker.add(draw); } }
    function stop() { running = false; gsap.ticker.remove(draw); }
    var st = ScrollTrigger.create({ trigger: hero, start: 'top bottom', end: 'bottom top', onToggle: function (s) { if (s.isActive) start(); else stop(); } });
    if (st.isActive) start();
    var offs = [];
    if (hasPointer) {
      offs.push(on(window, 'pointermove', function (e) {
        var r = cv.getBoundingClientRect();
        px = e.clientX - r.left; py = e.clientY - r.top;
        leanTo = Math.max(-1, Math.min(1, (px / w - 0.5) * 2));
      }, { passive: true }));
      offs.push(on(document, 'pointerleave', function () { px = py = -1e4; leanTo = 0; }));
    }
    return function () { stop(); ro.disconnect(); offs.forEach(function (f) { f(); }); cv.remove(); };
  }

  // ---- Hero copy: the headline rises letter by letter (fades in, with
  // reduced motion), the eyebrow decodes ----
  function heroIntro(full) {
    var h1 = $('.hero h1');
    if (h1) {
      h1.classList.remove('load2'); // the per-letter rise replaces the CSS one
      label(h1);
      SplitText.create(h1, {
        type: 'lines,chars', mask: 'lines', autoSplit: true, aria: 'hidden',
        onSplit: function (self) {
          return full
            ? gsap.from(self.chars, { yPercent: 118, rotate: 7, duration: 1.05, ease: 'expo.out', stagger: 0.024, delay: 0.12 })
            : gsap.from(self.chars, { opacity: 0, duration: 0.5, ease: 'power1.out', stagger: 0.03, delay: 0.12 });
        }
      });
    }
    var eb = $('.eyebrow');
    if (eb && eb.lastChild && eb.lastChild.nodeType === 3) {
      var text = eb.lastChild.nodeValue;
      var span = document.createElement('span');
      span.className = 'eb-text';
      span.textContent = text;
      eb.replaceChild(span, eb.lastChild);
      gsap.to(span, { duration: 1.5, delay: 0.25, scrambleText: { text: text, chars: 'upperCase', revealDelay: 0.35, speed: 0.55 } });
    }
    var shot = $('.hero-shot');
    if (shot && full) { // reduced motion keeps the CSS fade
      shot.classList.remove('load5');
      gsap.from(shot, { y: 70, opacity: 0, scale: 0.96, duration: 1.2, ease: 'expo.out', delay: 0.25 });
    }
  }

  // ---- Hero depth on scroll: copy drifts and dims, the phone frame lifts ----
  function heroParallax() {
    if (!$('.hero')) return;
    gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
      .to('.hero-copy', { yPercent: -14, opacity: 0.25, ease: 'none' }, 0)
      .to('.hero-shot', { yPercent: -10, ease: 'none' }, 0)
      .to('.vl-dots', { yPercent: 12, ease: 'none' }, 0);
  }

  // ---- Section headings come into focus word by word as you scroll
  // (ScrollReveal); reduced motion drops the blur and rise ----
  function headings(full) {
    $$('.section h2').forEach(function (h) {
      h.classList.remove('reveal');
      label(h);
      SplitText.create(h, {
        type: 'words', aria: 'hidden',
        onSplit: function (self) {
          return gsap.fromTo(self.words,
            full ? { opacity: 0.1, filter: 'blur(10px)', yPercent: 35 } : { opacity: 0.1 },
            { opacity: 1, filter: full ? 'blur(0px)' : 'none', yPercent: 0, ease: 'none', stagger: 0.1,
              scrollTrigger: { trigger: h, start: 'top 96%', end: 'top 72%', scrub: 0.6 } });
        }
      });
    });
  }

  // ---- At a glance: each figure decodes into place (DecryptedText) ----
  function glance() {
    $$('.glance .big').forEach(function (el, i) {
      var text = el.textContent;
      el.setAttribute('aria-label', text);
      ScrollTrigger.create({
        trigger: el, start: 'top 92%', once: true,
        onEnter: function () {
          gsap.to(el, { duration: 1.3, delay: i * 0.12, scrambleText: { text: text, chars: '0123456789#%/', revealDelay: 0.45, speed: 0.5 } });
        }
      });
    });
  }

  // ---- Three steps: the rule draws across and the big numeral fills as you pass ----
  function steps() {
    $$('.steps li').forEach(function (li) {
      gsap.fromTo(li, { '--sl': 0, '--sn': 0 }, {
        '--sl': 1, '--sn': 1, ease: 'none',
        scrollTrigger: { trigger: li, start: 'top 88%', end: 'top 48%', scrub: 0.5 }
      });
    });
  }

  // ---- The fix card: its headline rises (or fades, with reduced motion) word by word ----
  function fixCard(full) {
    var h = $('.fix h3');
    if (!h) return;
    label(h);
    SplitText.create(h, {
      type: 'words', mask: 'words', aria: 'hidden',
      onSplit: function (self) {
        return gsap.from(self.words, { yPercent: full ? 105 : 0, opacity: full ? 1 : 0, duration: 0.9, ease: 'expo.out', stagger: 0.045, scrollTrigger: { trigger: h, start: 'top 85%' } });
      }
    });
  }

  // ---- Score bars: the numbers count up with the bars (CountUp) ----
  function bars() {
    $$('.bar b').forEach(function (b, i) {
      var to = Number(b.textContent);
      if (!to) return;
      var o = { v: 0 };
      ScrollTrigger.create({
        trigger: b, start: 'top 90%', once: true,
        onEnter: function () {
          gsap.to(o, { v: to, duration: 1.1, delay: 0.25 + i * 0.06, ease: 'power3.out', onUpdate: function () { b.textContent = Math.round(o.v); } });
        }
      });
    });
  }

  // ---- Coach chat: a typing indicator, then the reply types itself (TextType).
  // The full reply stays in the page for screen readers and holds the bubble's
  // size, so nothing shifts while it types. ----
  function chat() {
    var msg = $('.msg-coach');
    if (!msg) return;
    var full = msg.textContent;
    msg.innerHTML = '';
    var sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = full;
    var shown = document.createElement('span'); shown.setAttribute('aria-hidden', 'true');
    var caret = document.createElement('i'); caret.className = 'caret'; caret.setAttribute('aria-hidden', 'true');
    var rest = document.createElement('span'); rest.className = 'rest'; rest.setAttribute('aria-hidden', 'true'); rest.textContent = full;
    var dots = document.createElement('span'); dots.className = 'typing'; dots.setAttribute('aria-hidden', 'true'); dots.innerHTML = '<i></i><i></i><i></i>';
    msg.append(sr, shown, caret, rest, dots);
    msg.classList.add('is-waiting');
    var o = { n: 0 };
    var tl = gsap.timeline({ paused: true })
      .to({}, { duration: 1.1 })
      .add(function () { msg.classList.remove('is-waiting'); })
      .to(o, {
        n: full.length, duration: full.length * 0.022, ease: 'none',
        onUpdate: function () {
          var n = Math.round(o.n);
          shown.textContent = full.slice(0, n);
          rest.textContent = full.slice(n);
        }
      })
      .add(function () { msg.classList.add('is-done'); }, '+=0.8');
    ScrollTrigger.create({ trigger: msg, start: 'top 85%', once: true, onEnter: function () { tl.play(); } });
    return function () { tl.kill(); msg.className = 'msg msg-coach'; msg.textContent = full; };
  }

  // ---- Result phone: swings round to face you as it scrolls in ----
  function phone() {
    if (!$('.phone')) return;
    gsap.fromTo('.phone',
      { rotationY: -24, rotationX: 10, transformPerspective: 900, y: 40 },
      { rotationY: 0, rotationX: 0, y: 0, ease: 'none', scrollTrigger: { trigger: '.phone-card', start: 'top bottom', end: 'center 60%', scrub: 0.6 } });
  }

  // ---- Skills: two rows of skill names slide in opposite directions, faster
  // the faster you scroll, and flip when you scroll back up (ScrollVelocity).
  // The original list stays for screen readers. ----
  function marquee() {
    var list = $('.skills-in');
    if (!list) return;
    var skills = [['Spike'], ['Serve'], ['Block'], ['Set', true], ['Dig', true]];
    var stage = document.createElement('div');
    stage.className = 'vl-marquee';
    stage.setAttribute('aria-hidden', 'true');
    var rows = [1, -1].map(function (dir, r) {
      var row = document.createElement('div');
      row.className = 'vl-row' + (r ? ' vl-row-alt' : '');
      var track = document.createElement('div');
      track.className = 'vl-track';
      var unit = document.createElement('div');
      unit.className = 'vl-unit';
      (r ? skills.slice().reverse() : skills).forEach(function (s) {
        var item = document.createElement('span');
        item.className = 'vl-item' + (s[1] ? ' soon' : '');
        item.textContent = s[0];
        if (s[1]) { var b = document.createElement('small'); b.textContent = 'Soon'; item.appendChild(b); }
        var dot = document.createElement('span'); dot.className = 'vl-ball';
        unit.append(item, dot);
      });
      track.appendChild(unit);
      row.appendChild(track);
      stage.appendChild(row);
      return { dir: dir, track: track, unit: unit, x: 0, w: 0 };
    });
    list.classList.add('sr');
    list.parentNode.appendChild(stage);

    function fill() {
      rows.forEach(function (r) {
        while (r.track.children.length > 1) r.track.lastChild.remove();
        r.w = r.unit.offsetWidth;
        var copies = Math.ceil(window.innerWidth / Math.max(r.w, 1)) + 1;
        for (var i = 0; i < copies; i++) r.track.appendChild(r.unit.cloneNode(true));
      });
    }
    fill();
    var ro = new ResizeObserver(fill);
    ro.observe(stage);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fill);

    var sign = 1;
    function tick(time, dt) {
      var v = lenis ? lenis.velocity : 0;
      if (v > 0.5) sign = 1; else if (v < -0.5) sign = -1;
      var speed = 55 + Math.min(Math.abs(v) * 14, 900);
      rows.forEach(function (r) {
        if (!r.w) return;
        r.x = gsap.utils.wrap(-r.w, 0, r.x - r.dir * sign * speed * dt / 1000);
        r.track.style.transform = 'translate3d(' + r.x + 'px,0,0)';
      });
    }
    var st = ScrollTrigger.create({
      trigger: stage, start: 'top bottom', end: 'bottom top',
      onToggle: function (s) { if (s.isActive) gsap.ticker.add(tick); else gsap.ticker.remove(tick); }
    });
    if (st.isActive) gsap.ticker.add(tick);
    return function () { gsap.ticker.remove(tick); ro.disconnect(); stage.remove(); list.classList.remove('sr'); };
  }

  // ---- Pricing: each price counts up as its plan rises in (CountUp) ----
  function prices() {
    $$('.price').forEach(function (p, i) {
      var node = p.firstChild;
      if (!node || node.nodeType !== 3) return;
      var text = node.nodeValue, to = parseFloat(text.replace('$', ''));
      if (!to) return;
      var o = { v: 0 };
      ScrollTrigger.create({
        trigger: p, start: 'top 92%', once: true,
        onEnter: function () {
          gsap.to(o, { v: to, duration: 1.3, delay: i * 0.1, ease: 'power3.out', onUpdate: function () { node.nodeValue = '$' + o.v.toFixed(2); }, onComplete: function () { node.nodeValue = text; } });
        }
      });
    });
  }

  // ---- FAQ: answers open and close smoothly instead of snapping ----
  function faq() {
    var offs = $$('.faq details').map(function (d) {
      var s = d.querySelector('summary'), p = d.querySelector('p');
      if (!s || !p) return function () {};
      return on(s, 'click', function (e) {
        e.preventDefault();
        gsap.killTweensOf(p);
        if (d.open && !d.classList.contains('closing')) {
          d.classList.add('closing');
          gsap.to(p, { height: 0, opacity: 0, marginBottom: 0, duration: 0.35, ease: 'power2.inOut', onComplete: function () {
            d.open = false; d.classList.remove('closing'); gsap.set(p, { clearProps: 'height,opacity,marginBottom' }); ScrollTrigger.refresh();
          } });
        } else {
          d.classList.remove('closing');
          d.open = true;
          gsap.fromTo(p, { height: 0, opacity: 0, marginBottom: 0 }, { height: 'auto', opacity: 1, marginBottom: 22, duration: 0.5, ease: 'power3.out', onComplete: function () {
            gsap.set(p, { clearProps: 'height,opacity,marginBottom' }); ScrollTrigger.refresh();
          } });
        }
      });
    });
    return all(offs);
  }

  // ---- Why choose: six reasons on a court. On a wide screen with full
  // motion the court pins while you scroll and a volleyball hops round the
  // rotation, 1 to 6, lighting each reason as it lands. With reduced motion
  // the ball jumps (no flight) to whichever position you point at or focus.
  // On a phone the positions are a lineup that lights up as you scroll. ----
  function rotation(full, wide) {
    var wrap = $('.court-wrap');
    if (!wrap) return;
    var court = wrap.querySelector('.rot-court'), ball = wrap.querySelector('.ball');
    var zones = $$('.rot-court .zone'), n = zones.length;
    function setOn(i) {
      zones.forEach(function (z, k) { z.classList.toggle('on', k === i); });
      court.classList.toggle('has-on', i >= 0);
    }
    // Where the ball sits in position i: just left of its big numeral.
    function spot(i) {
      var z = zones[i].getBoundingClientRect(), w = wrap.getBoundingClientRect();
      return { x: z.right - w.left - 150, y: z.top - w.top + 40 };
    }
    var offs = [];

    if (wide && full) {
      wrap.classList.add('has-ball');
      court.classList.add('has-on');
      zones.forEach(function (z) { z.style.transition = 'none'; }); // the scrub drives --lit
      var HOP = 1, HOLD = 0.9, STEP = HOP + HOLD;
      var spots = [];
      function measure() { spots = zones.map(function (z, i) { return spot(i); }); }
      // Each position glows by how close the ball is to it, so the light
      // slides from one to the next with your scroll instead of switching.
      function light(t) {
        zones.forEach(function (z, k) {
          var d = Math.max(0, Math.abs(t - (k * STEP + HOLD / 2)) - HOLD / 2);
          z.style.setProperty('--lit', Math.max(0, 1 - d / (HOP * 0.7)).toFixed(3));
        });
      }
      // The ball flies one quadratic curve per hop, peaking halfway. The peak
      // lifts with how sideways the hop is: a full arc across the court, a
      // straight glide on a hop forward or back.
      function fly(i, k) {
        var a = spots[i - 1], b = spots[i];
        var dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
        var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 - 2 * 120 * dx / (dx + dy + 1);
        var u = 1 - k;
        gsap.set(ball, { x: u * u * a.x + 2 * u * k * cx + k * k * b.x, y: u * u * a.y + 2 * u * k * cy + k * k * b.y, rotation: (i - 1 + k) * 280 });
      }
      measure();
      var tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrap, pin: true, scrub: 1.4, invalidateOnRefresh: true,
          start: function () { return wrap.offsetHeight + 140 < window.innerHeight ? 'center center' : 'top 90px'; },
          end: '+=' + n * 480,
          onRefresh: function () { measure(); fly(1, 0); light(tl.time()); }
        },
        onUpdate: function () { light(tl.time()); }
      });
      tl.set({}, {}, 0);
      for (var i = 1; i < n; i++) {
        (function (i) {
          var hop = { k: 0 };
          tl.to(hop, { k: 1, duration: HOP, ease: 'sine.inOut', onUpdate: function () { fly(i, hop.k); } }, (i - 1) * STEP + HOLD);
        })(i);
      }
      tl.to({}, { duration: HOLD }, (n - 1) * STEP);
      fly(1, 0); light(0);
    } else if (wide) {
      wrap.classList.add('has-ball');
      gsap.set(ball, { opacity: 0 });
      zones.forEach(function (z, i) {
        function show() {
          setOn(i);
          var p = spot(i);
          gsap.set(ball, { x: p.x, y: p.y });
          gsap.to(ball, { opacity: 1, duration: 0.25, overwrite: true });
        }
        offs.push(on(z, 'pointerenter', show), on(z, 'focus', show));
      });
      offs.push(on(court, 'pointerleave', function () {
        if (court.contains(document.activeElement)) return;
        setOn(-1); gsap.to(ball, { opacity: 0, duration: 0.25, overwrite: true });
      }));
    } else {
      zones.forEach(function (z, i) {
        ScrollTrigger.create({ trigger: z, start: 'top 62%', end: 'bottom 62%', onToggle: function (st) { if (st.isActive) setOn(i); } });
      });
      ScrollTrigger.create({ trigger: court, start: 'top 62%', end: 'bottom 62%', onLeave: function () { setOn(-1); }, onLeaveBack: function () { setOn(-1); } });
    }
    return function () {
      all(offs)(); setOn(-1); wrap.classList.remove('has-ball'); gsap.set(ball, { clearProps: 'all' });
      zones.forEach(function (z) { z.style.removeProperty('transition'); z.style.removeProperty('--lit'); });
    };
  }

  // ---- Footer: the outlined wordmark fills with colour as you reach the end ----
  function wordmark() {
    if (!$('.wordmark')) return;
    // Ends at the very bottom of the page, so it is always full there however
    // the layout above shifted after load.
    gsap.fromTo('.wordmark', { '--wp': 0 }, { '--wp': 1, ease: 'none', scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'max', scrub: 0.6 } });
  }

  // ---- Hero card tilts toward the cursor with a moving glare (TiltedCard),
  // and its layers separate: the photo and skeleton sink back while the tags,
  // callouts and score float forward. Gentler with reduced motion. ----
  function tilt(full) {
    var shot = $('.shot');
    if (!shot) return;
    var amp = full ? 11 : 4;
    var glare = document.createElement('span');
    glare.className = 'vl-glare';
    glare.setAttribute('aria-hidden', 'true');
    shot.appendChild(glare);
    shot.classList.add('vl-layers');
    gsap.set(shot, { transformPerspective: 1100 });
    var rx = gsap.quickTo(shot, 'rotationX', { duration: 0.7, ease: 'power3' });
    var ry = gsap.quickTo(shot, 'rotationY', { duration: 0.7, ease: 'power3' });
    var cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 };
    function ease() {
      cur.x += (tgt.x - cur.x) * 0.1; cur.y += (tgt.y - cur.y) * 0.1;
      shot.style.setProperty('--px', cur.x.toFixed(4));
      shot.style.setProperty('--py', cur.y.toFixed(4));
    }
    gsap.ticker.add(ease);
    var offs = [
      on(shot, 'pointermove', function (e) {
        var r = shot.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        ry(nx * amp); rx(-ny * amp);
        tgt.x = nx * (full ? 2 : 1); tgt.y = ny * (full ? 2 : 1);
        shot.style.setProperty('--gx', (nx + 0.5) * 100 + '%');
        shot.style.setProperty('--gy', (ny + 0.5) * 100 + '%');
        shot.classList.add('tilting');
      }),
      on(shot, 'pointerleave', function () { rx(0); ry(0); tgt.x = tgt.y = 0; shot.classList.remove('tilting'); })
    ];
    return function () {
      all(offs)(); gsap.ticker.remove(ease); glare.remove();
      shot.classList.remove('tilting', 'vl-layers');
      shot.style.removeProperty('--px'); shot.style.removeProperty('--py');
    };
  }

  // ---- Feature cards and plans lean toward the cursor and lift (TiltedCard).
  // Their transform transition is switched off so GSAP drives it alone. ----
  function cardTilt(full) {
    var els = $$('.bento > article, .plan, .vs');
    var offs = els.map(function (el) {
      el.style.transitionProperty = 'opacity, border-color';
      gsap.set(el, { transformPerspective: 1000 });
      var rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3' });
      var ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3' });
      var y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      return all([
        on(el, 'pointermove', function (e) {
          var r = el.getBoundingClientRect();
          var amp = (full ? 7 : 3) * Math.min(1, 520 / r.width);
          ry(((e.clientX - r.left) / r.width - 0.5) * amp);
          rx(-((e.clientY - r.top) / r.height - 0.5) * amp);
          y(-6);
        }),
        on(el, 'pointerleave', function () { rx(0); ry(0); y(0); })
      ]);
    });
    return function () { offs.forEach(function (f) { f(); }); els.forEach(function (el) { el.style.transitionProperty = ''; }); };
  }

  // ---- Cards, plans and steps rise out of the page in 3D as they arrive ----
  function depthIn() {
    var els = $$('.bento > article, .plans > .plan, .steps li, .versus > .vs');
    els.forEach(function (el) {
      el.style.transitionProperty = 'opacity, border-color';
      var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
      // fromTo, not from: a from() would take the CSS reveal's 40px offset as
      // the resting place, leaving cards low until a hover reset them.
      gsap.fromTo(el, { rotationX: 24, y: 90, z: -140 }, {
        rotationX: 0, y: 0, z: 0, transformPerspective: 1000, transformOrigin: '50% 100%',
        duration: 1.3, ease: 'expo.out', delay: Math.min(idx, 4) * 0.09,
        scrollTrigger: { trigger: el, start: 'top 94%' }
      });
    });
    return function () { els.forEach(function (el) { el.style.transitionProperty = ''; }); };
  }

  // ---- Main buttons lean toward a nearby cursor (Magnet) ----
  function magnets() {
    var items = $$('.store, .ghost, .mail').map(function (el) {
      return { el: el, x: gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' }), y: gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' }) };
    });
    return on(window, 'pointermove', function (e) {
      items.forEach(function (m) {
        var r = m.el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        var near = Math.abs(dx) < r.width / 2 + 50 && Math.abs(dy) < r.height / 2 + 50;
        m.x(near ? dx * 0.28 : 0); m.y(near ? dy * 0.35 : 0);
      });
    }, { passive: true });
  }

  // ---- Cards and plans light up under the cursor (SpotlightCard) ----
  function spotlights() {
    var els = $$('.card, .fix, .plan, .vs-us');
    els.forEach(function (el) { el.classList.add('spot'); });
    var offs = els.map(function (el) {
      return on(el, 'pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', e.clientX - r.left + 'px');
        el.style.setProperty('--my', e.clientY - r.top + 'px');
      });
    });
    return function () { all(offs)(); els.forEach(function (el) { el.classList.remove('spot'); }); };
  }

  // ---- A burst of sparks wherever you click (ClickSpark) ----
  function clickSpark() {
    var cv = document.createElement('canvas');
    cv.className = 'vl-sparks';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    var g = cv.getContext('2d'), sparks = [], running = false;
    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    function draw() {
      var now = performance.now();
      g.clearRect(0, 0, innerWidth, innerHeight);
      sparks = sparks.filter(function (s) { return now - s.t < 450; });
      sparks.forEach(function (s) {
        var k = (now - s.t) / 450, e = 1 - Math.pow(1 - k, 3);
        var d1 = 6 + e * 26, d2 = d1 + 12 * (1 - k);
        g.strokeStyle = s.c;
        g.lineWidth = 2;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(s.x + Math.cos(s.a) * d1, s.y + Math.sin(s.a) * d1);
        g.lineTo(s.x + Math.cos(s.a) * d2, s.y + Math.sin(s.a) * d2);
        g.stroke();
      });
      if (!sparks.length) { running = false; gsap.ticker.remove(draw); }
    }
    var offs = [
      on(window, 'resize', size),
      on(window, 'pointerdown', function (e) {
        if (e.button !== 0) return;
        var now = performance.now();
        for (var i = 0; i < 9; i++) sparks.push({ x: e.clientX, y: e.clientY, a: i / 9 * Math.PI * 2, t: now, c: i % 3 ? '#6EA0FF' : '#37E0A6' });
        if (!running) { running = true; gsap.ticker.add(draw); }
      }, { passive: true })
    ];
    return function () { all(offs)(); gsap.ticker.remove(draw); cv.remove(); };
  }
})();
