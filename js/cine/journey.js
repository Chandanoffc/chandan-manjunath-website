// Chapter 02 — "A Journey Through Time".
//
// Six cards sit on an arc whose centre is the clock's pivot, so the hand's angle IS the
// timeline position: pointing straight at card i means u === i. The cursor is mapped by
// its angle around the pivot (not raw x), so it picks the right card no matter how high or
// low the pointer is. The hand follows with inertia; the intro sweeps the whole timeline
// once and then hands control to the visitor.
//
// Landscape: cursor on desktop, scroll position on touch.
// Portrait:  a horizontal card carousel + vertical rail, driven by scroll or taps.

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const DEG = Math.PI / 180;
const SVGNS = 'http://www.w3.org/2000/svg';

export function initJourney({ reducedMotion = false } = {}) {
  const root = document.getElementById('experience');
  const pin = document.getElementById('journeyPin');
  if (!root || !pin) return { update() {} };

  const cards = [...pin.querySelectorAll('.jcard')];
  const n = cards.length;
  const svg = pin.querySelector('#jclock');
  const $ = (id) => svg.querySelector('#' + id);
  const el = {
    ring: $('dRing'), ticks: $('dTicks'), labels: $('dLabels'),
    beam: $('beam'), beamSoft: $('beamSoft'),
    hand: $('hand'), handGlow: $('handGlow'), tip: $('tip'), pivot: $('pivot'),
    gBeam: svg.querySelector('#gBeam'),
  };
  const rail = pin.querySelector('#jrail');
  const liveRegion = pin.querySelector('#jlive');

  // dynamic svg bits
  const tickLines = [];
  const labelNodes = [];
  for (let i = 0; i < n; i++) {
    const l = document.createElementNS(SVGNS, 'line');
    l.setAttribute('class', 'dtick');
    svg.insertBefore(l, el.labels);
    tickLines.push(l);
    const t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('class', 'dlabel');
    t.setAttribute('text-anchor', 'middle');
    t.textContent = cards[i].dataset.label || '';
    el.labels.appendChild(t);
    labelNodes.push(t);
  }
  const gStops = [...el.gBeam.querySelectorAll('stop')];

  // rail buttons (portrait)
  const railBtns = cards.map((c, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<i></i><span>${c.dataset.short || c.dataset.label}</span>`;
    b.addEventListener('click', () => choose(i));
    li.appendChild(b);
    rail.appendChild(li);
    return b;
  });

  /* ---------------- state ---------------- */
  let W = 0, H = 0, portrait = false;
  let P = { x: 0, y: 0 };
  let R = 0, th0 = -44 * DEG, th1 = 34 * DEG, rd = 0, cw = 200, ch = 300;
  let u = 0;
  let userTarget = 0;
  let scrollTarget = 0;
  let pointerActive = false;
  let authority = reducedMotion ? 1 : 0;
  let activeIdx = -1;
  let inSince = -1; // seconds since the intro started
  let onScreen = false;
  let raf = 0;
  let last = 0;

  const thetaOf = (i) => lerp(th0, th1, n > 1 ? i / (n - 1) : 0);

  function layout() {
    const r = pin.getBoundingClientRect();
    W = r.width; H = r.height;
    portrait = W / H < 0.95;
    pin.dataset.layout = portrait ? 'portrait' : 'landscape';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);

    if (!portrait) {
      R = 0.76 * H;
      const dth = (th1 - th0) / (n - 1);
      const chord = 2 * R * Math.sin(dth / 2);
      cw = clamp(chord * 0.97, 150, 250);
      ch = cw * 1.55;
      P = { x: 0.40 * W, y: 0.045 * H };
      // keep the first card (scaled when active) on screen
      const leftX = P.x + R * Math.sin(th0);
      const minX = (cw / 2) * 1.17 + 0.03 * W;
      if (leftX < minX) P.x += minX - leftX;
      rd = R - ch / 2 - 30;
    } else {
      cw = Math.min(0.74 * W, 330);
      ch = Math.min(0.5 * H, cw * 0.95);
      P = { x: 0.5 * W, y: 0.03 * H };
      R = 0.5 * H;
      rd = 0.2 * H;
    }

    // card sizes + landscape positions
    pin.style.setProperty('--cw', `${cw}px`);
    pin.style.setProperty('--ch', `${ch}px`);
    cards.forEach((c, i) => {
      if (!portrait) {
        const th = thetaOf(i);
        c.style.setProperty('--x', `${P.x + R * Math.sin(th)}px`);
        c.style.setProperty('--y', `${P.y + R * Math.cos(th)}px`);
        c.style.setProperty('--rot', `${(-0.42 * th / DEG).toFixed(2)}deg`);
      }
    });

    // static dial pieces
    el.ring.setAttribute('cx', P.x); el.ring.setAttribute('cy', P.y); el.ring.setAttribute('r', rd);
    const circ = 2 * Math.PI * rd;
    const nTicks = 240;
    el.ticks.setAttribute('cx', P.x); el.ticks.setAttribute('cy', P.y); el.ticks.setAttribute('r', rd + 7);
    el.ticks.style.strokeDasharray = `1.1 ${(2 * Math.PI * (rd + 7)) / nTicks - 1.1}`;
    for (let i = 0; i < n; i++) {
      const th = thetaOf(i);
      const s = Math.sin(th), c = Math.cos(th);
      const l = tickLines[i];
      l.setAttribute('x1', P.x + (rd - 12) * s); l.setAttribute('y1', P.y + (rd - 12) * c);
      l.setAttribute('x2', P.x + (rd + 16) * s); l.setAttribute('y2', P.y + (rd + 16) * c);
      const lab = labelNodes[i];
      const lr = rd - 30;
      lab.setAttribute('transform', `translate(${P.x + lr * s} ${P.y + lr * c}) rotate(${-th / DEG})`);
    }
    el.pivot.setAttribute('r', portrait ? 8 : 12);
    el.tip.setAttribute('r', 5);
    if (!reducedMotion) render(); else renderNow();
  }

  /* ---------------- control ---------------- */
  function choose(i) {
    pointerActive = true;
    userTarget = clamp(i, 0, n - 1);
    if (authority < 1) authority = 1;
  }

  pin.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || portrait) return;
    const r = pin.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (y < P.y + 30) return;
    pointerActive = true;
    const ang = Math.atan2(x - P.x, y - P.y);
    userTarget = clamp((ang - th0) / (th1 - th0), 0, 1) * (n - 1);
  });

  cards.forEach((c, i) => {
    c.addEventListener('click', () => choose(i));
    c.addEventListener('focus', () => choose(i));
  });
  pin.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); choose(Math.round(userTarget) + 1); cards[clamp(Math.round(userTarget), 0, n - 1)].focus({ preventScroll: true }); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); choose(Math.round(userTarget) - 1); cards[clamp(Math.round(userTarget), 0, n - 1)].focus({ preventScroll: true }); }
  });

  function updateScrollTarget() {
    const r = root.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    const p = clamp(-r.top / Math.max(total, 1));
    scrollTarget = clamp((p - 0.16) / 0.72) * (n - 1);
  }

  /* ---------------- render ---------------- */
  function setActive(i) {
    if (i === activeIdx) return;
    activeIdx = i;
    cards.forEach((c, k) => {
      c.classList.toggle('is-active', k === i);
      c.setAttribute('aria-current', k === i ? 'true' : 'false');
    });
    railBtns.forEach((b, k) => b.classList.toggle('is-active', k === i));
    labelNodes.forEach((t, k) => t.classList.toggle('is-active', k === i));
    tickLines.forEach((t, k) => t.classList.toggle('is-active', k === i));
    const c = cards[i];
    liveRegion.textContent = `${c.querySelector('.jcard__date').textContent}: ${c.querySelector('.jcard__role').textContent}, ${c.querySelector('.jcard__org').textContent}`;
  }

  function render() {
    const th = n > 1 ? lerp(th0, th1, u / (n - 1)) : 0;
    const s = Math.sin(th), c = Math.cos(th);

    // hand + tip
    const hx = P.x + rd * s, hy = P.y + rd * c;
    const tx = P.x - 26 * s, ty = P.y - 26 * c;
    el.hand.setAttribute('x1', tx); el.hand.setAttribute('y1', ty);
    el.hand.setAttribute('x2', hx); el.hand.setAttribute('y2', hy);
    el.handGlow.setAttribute('x1', P.x); el.handGlow.setAttribute('y1', P.y);
    el.handGlow.setAttribute('x2', hx); el.handGlow.setAttribute('y2', hy);
    el.tip.setAttribute('cx', hx); el.tip.setAttribute('cy', hy);
    el.pivot.setAttribute('cx', P.x); el.pivot.setAttribute('cy', P.y);

    // beam: pivot -> top of the active card
    let bx, by;
    if (!portrait) {
      const br = R - ch * 0.5 + 8;
      bx = P.x + br * s; by = P.y + br * c;
    } else {
      bx = P.x; by = H * 0.5 - ch * 0.5 + 4;
    }
    const half = Math.min(cw * 0.44, 120);
    const dx = bx - P.x, dy = by - P.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    const pts = `${P.x},${P.y} ${bx + px * half},${by + py * half} ${bx - px * half},${by - py * half}`;
    el.beam.setAttribute('points', pts);
    el.beamSoft.setAttribute('points', pts);
    el.gBeam.setAttribute('x1', P.x); el.gBeam.setAttribute('y1', P.y);
    el.gBeam.setAttribute('x2', bx); el.gBeam.setAttribute('y2', by);

    // portrait carousel
    if (portrait) {
      cards.forEach((card, i) => {
        const d = i - u;
        const ad = Math.abs(d);
        card.style.setProperty('--x', `${W * 0.5 + d * cw * 0.98 + W * 0.0}px`);
        card.style.setProperty('--y', `${H * 0.5}px`);
        card.style.setProperty('--rot', `0deg`);
        card.style.setProperty('--s', `${(1 - 0.12 * Math.min(ad, 1.5)).toFixed(3)}`);
        card.style.setProperty('--o', `${clamp(1 - ad * 0.75, 0, 1).toFixed(3)}`);
      });
    }

    setActive(clamp(Math.round(u), 0, n - 1));
  }

  function renderNow() {
    root.classList.add('is-in', 'is-live');
    u = userTarget = scrollTarget;
    render();
  }

  /* ---------------- loop ---------------- */
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (inSince >= 0) inSince += dt;

    // intro: sweep the whole timeline once, then hand over
    let introTarget = 0;
    if (inSince >= 0) {
      introTarget = inOut(seg(inSince, 2.5, 4.9)) * (n - 1);
      authority = reducedMotion ? 1 : Math.max(authority, inOut(seg(inSince, 4.6, 5.6)));
      if (inSince > 3.2) root.classList.add('is-live');
    }

    let wantScroll = scrollTarget;
    if (portrait) {
      const i = Math.floor(wantScroll), f = wantScroll - i;
      wantScroll = i + (f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2);
    }
    const wantUser = pointerActive ? userTarget : wantScroll;
    const eff = lerp(introTarget, wantUser, authority);
    u += (eff - u) * (1 - Math.exp(-dt * (portrait ? 7 : 5.5)));
    if (Math.abs(eff - u) < 0.0005) u = eff;
    render();
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      onScreen = e.isIntersecting;
      if (onScreen) {
        if (inSince < 0 && e.intersectionRatio > 0.0) {
          // start the intro once a good part of the stage is visible
          const r = pin.getBoundingClientRect();
          if (r.top < window.innerHeight * 0.55) { inSince = 0; root.classList.add('is-in'); }
        }
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
      } else if (raf) {
        cancelAnimationFrame(raf); raf = 0;
      }
    });
  }, { threshold: [0, 0.15, 0.4] });
  io.observe(root);

  // portrait: tapping a card should advance, scroll still drives
  window.addEventListener('resize', layout, { passive: true });

  let lastScrollTarget = 0;
  function update() {
    updateScrollTarget();
    // in portrait, scrolling takes control back from a tap
    if (portrait && Math.abs(scrollTarget - lastScrollTarget) > 0.04) pointerActive = false;
    lastScrollTarget = scrollTarget;
    if (inSince < 0 && onScreen) {
      const r = pin.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.55) { inSince = 0; root.classList.add('is-in'); }
    }
  }

  layout();
  updateScrollTarget();
  if (reducedMotion) renderNow();

  return { update, layout, debug: () => ({ u, userTarget, scrollTarget, authority, inSince, portrait }) };
}
