// VolleyLabs launch page: hero key-moment cycle, skeleton draw, score
// count-up, scroll reveals and the demo video. The page is complete without
// this file; it adds the "js" class itself so a failed load hides nothing.
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canObserve = 'IntersectionObserver' in window;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var W = 600, H = 750; // the hero frames' size, and the SVG viewBox
  // Same joints, bones and confidence cut-off as the app (mobile/lib/pose.ts).
  var BONES = [[1, 2], [1, 3], [3, 5], [2, 4], [4, 6], [1, 7], [2, 8], [7, 8],
    [7, 9], [9, 11], [8, 10], [10, 12]];
  var MIN_VISIBILITY = 0.5;
  var CYCLE_MS = 2400;

  function sure(p) { return p && p[2] >= MIN_VISIBILITY; }

  function drawSkeleton(svg, pose, animate) {
    svg.classList.remove('drawn');
    svg.textContent = '';
    if (!pose) return;
    BONES.forEach(function (bone, i) {
      var a = pose[bone[0]], b = pose[bone[1]];
      if (!sure(a) || !sure(b)) return;
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M' + a[0] * W + ' ' + a[1] * H + 'L' + b[0] * W + ' ' + b[1] * H);
      path.setAttribute('pathLength', '1');
      if (animate) path.style.transitionDelay = i * 0.04 + 's';
      svg.appendChild(path);
    });
    pose.forEach(function (p) {
      if (!sure(p)) return;
      var dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', p[0] * W);
      dot.setAttribute('cy', p[1] * H);
      dot.setAttribute('r', 7);
      svg.appendChild(dot);
    });
    if (!animate) { svg.classList.add('drawn'); return; }
    // Two frames so the undrawn state is painted before the transition starts.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { svg.classList.add('drawn'); });
    });
  }

  function hero() {
    var root = document.querySelector('.hero-shot');
    if (!root) return;
    var frames = Array.prototype.slice.call(root.querySelectorAll('.frame'));
    var svg = root.querySelector('.skeleton');
    var chip = root.querySelector('.moment-chip');
    var poses = window.HERO_POSES || {};
    var contact = Math.max(0, frames.findIndex(function (f) { return f.classList.contains('frame-contact'); }));

    function show(i, animate) {
      frames.forEach(function (f, j) { f.classList.toggle('on', j === i); });
      drawSkeleton(svg, poses[frames[i].dataset.key], animate);
      chip.textContent = frames[i].dataset.moment;
      if (animate) {
        chip.classList.remove('pop');
        void chip.offsetWidth; // restart the animation
        chip.classList.add('pop');
      }
    }

    if (reduce || !canObserve) { show(contact, false); return; }

    var current = 0, timer = null, inView = false;
    show(current, true);
    function start() {
      if (timer || !inView || document.hidden) return;
      timer = setInterval(function () {
        current = (current + 1) % frames.length;
        show(current, true);
      }, CYCLE_MS);
    }
    function stop() { clearInterval(timer); timer = null; }
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) start(); else stop();
    }).observe(root);
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
      var k = Math.min((t - t0) / 1200, 1);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
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

  function demoVideo() {
    var v = document.querySelector('.phone-video');
    if (!v) return;
    // Reduced motion, or no observer: the poster with controls, never autoplay.
    if (reduce || !canObserve) { v.controls = true; return; }
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        // Low Power Mode blocks autoplay: fall back to controls.
        var playing = v.play();
        if (playing && playing.catch) playing.catch(function () { v.controls = true; });
      } else {
        v.pause();
      }
    }, { threshold: 0.3 }).observe(v);
  }

  hero();
  countUp();
  reveals();
  demoVideo();
})();
