import { createHero } from './hero.js';
import { initManifesto } from './manifesto.js';
import { initJourney } from './journey.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('still');
const html = document.documentElement;

// the opening should always start from the top
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) window.scrollTo(0, 0);

$('#year').textContent = new Date().getFullYear();

/* ------------------------------------------------------------------ */
/* Boot: wait for fonts + the hero image, then roll                     */
/* ------------------------------------------------------------------ */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.decode ? img.decode().catch(() => {}).then(() => resolve(img)) : resolve(img));
    img.onerror = reject;
    img.src = src;
  });
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

async function boot() {
  const fill = $('#bootFill');
  const small = window.innerWidth < 760 || window.innerWidth / window.innerHeight < 0.95;
  const figSrc = small ? 'assets/img/hero-portrait-sm.webp' : 'assets/img/hero-portrait.webp';

  let done = 0;
  const total = 3;
  const tick = () => { done++; fill.style.transform = `scaleX(${done / total})`; };

  const fontsP = withTimeout(
    Promise.all([document.fonts.load('400 200px Anton'), document.fonts.load('500 16px Oswald'), document.fonts.ready]).catch(() => {}),
    3500
  ).then(tick);
  const figP = loadImage(figSrc).then((i) => { tick(); return i; });
  const jfigP = loadImage('assets/img/about-cutout.webp').catch(() => {}).then(tick);

  const [, figImg] = await Promise.all([fontsP, figP, jfigP]);

  let hero = null;
  try {
    hero = await createHero({ canvas: $('#heroCanvas'), stage: $('#stage'), figureImage: figImg, reducedMotion });
  } catch (err) {
    console.warn('[hero] falling back to static composition:', err);
    html.classList.add('no-gl');
  }

  return hero;
}

/* ------------------------------------------------------------------ */
/* Header / nav                                                         */
/* ------------------------------------------------------------------ */

function initNav() {
  const burger = $('#burger');
  const menu = $('#menu');
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    html.classList.toggle('menu-open', open);
  };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  $$('[data-menu], #menu a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  // active link by section
  const links = $$('[data-nav]');
  const sections = ['about', 'experience', 'work', 'contact'].map((id) => document.getElementById(id)).filter(Boolean);
  const setActive = (id) => links.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === id));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => io.observe(s));
  addEventListener('scroll', () => { if (scrollY < innerHeight * 0.5) setActive('top'); }, { passive: true });
}

/* ------------------------------------------------------------------ */
/* Hero cues: DOM furniture rides the same clock as the canvas          */
/* ------------------------------------------------------------------ */

function initHeroCues(hero) {
  const stage = $('#stage');
  const tc = $('#hudTc');
  const cue = [
    [3.3, 'cue-welcome'],
    [3.9, 'cue-tapes'],
    [4.3, 'cue-hud'],
    [4.7, 'cue-header'],
    [5.6, 'cue-scroll'],
  ];
  const fired = new Set();
  let lastFrame = -1;

  const fire = (t) => {
    for (const [at, cls] of cue) {
      if (t >= at && !fired.has(cls)) { fired.add(cls); html.classList.add(cls); }
    }
    // 24fps timecode
    const f = Math.floor(t * 24);
    if (f !== lastFrame && t > 0.2) {
      lastFrame = f;
      const ff = f % 24, ss = Math.floor(f / 24) % 60, mm = Math.floor(f / 1440) % 60, hh = Math.floor(f / 86400);
      const p = (v) => String(v).padStart(2, '0');
      tc.textContent = `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
    }
  };

  if (!hero) { // static fallback: everything on
    cue.forEach(([, c]) => html.classList.add(c));
    return;
  }
  if (reducedMotion) { cue.forEach(([, c]) => html.classList.add(c)); return; }
  hero.onFrame = (t) => fire(t);
}

/* ------------------------------------------------------------------ */
/* Scroll + pointer orchestration                                       */
/* ------------------------------------------------------------------ */

function initScroll(hero, manifesto, journey) {
  const stage = $('#stage');
  const hud = $('.hud');
  let ticking = false;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const vh = innerHeight;
      const sp = clamp(scrollY / (vh * 1.1));
      if (hero) { hero.setScroll(sp); hero.setVisible(scrollY < vh * 1.25); }
      stage.style.setProperty('--sp', sp.toFixed(3));
      // fade the HUD faster than the picture
      hud.style.opacity = String(clamp(1 - sp * 2.4));
      manifesto.update();
      journey.update();
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  let rz = 0;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => { hero?.resize(); onScroll(); }, 140);
  }, { passive: true });
  onScroll();

  if (hero) {
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      hero.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    }, { passive: true });
  }
}

/* ------------------------------------------------------------------ */
/* Interim sections (Work + Contact) — restyled in the next phase       */
/* ------------------------------------------------------------------ */

function initWork() {
  $$('.vcard').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.yt;
      const thumb = $('.vcard__thumb', card);
      thumb.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      card.classList.add('is-playing');
    }, { once: true });
  });
}

function initContact() {
  const form = $('#contactForm');
  const status = $('#cformStatus');
  const btn = $('#cformBtn');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true; btn.textContent = 'Sending…';
    status.textContent = ''; status.className = 'cform__status';
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (res.ok) {
        form.reset();
        status.textContent = "Thanks — that's in my inbox. I'll get back to you soon.";
        status.classList.add('is-ok');
      } else {
        status.textContent = 'Something went wrong — try again, or email me directly.';
        status.classList.add('is-err');
      }
    } catch {
      status.textContent = 'Network error — try again, or email me directly.';
      status.classList.add('is-err');
    } finally {
      btn.disabled = false; btn.textContent = 'Send request';
    }
  });
}

/* ------------------------------------------------------------------ */

(async function main() {
  initNav();
  initWork();
  initContact();

  const manifesto = initManifesto({ reducedMotion });
  const journey = initJourney({ reducedMotion });

  const hero = await boot();
  initHeroCues(hero);
  initScroll(hero, manifesto, journey);

  html.classList.remove('is-booting');
  html.classList.add('is-ready');
  if (hero) hero.start();

  // dev helpers: ?t=end jumps to the settled hero, ?t=3.2 starts mid-sequence
  if (hero) {
    const t = params.get('t');
    if (t === 'end') hero.seek(9);
    else if (t && !Number.isNaN(parseFloat(t))) hero.seek(parseFloat(t));
    window.__hero = hero;
  }
  window.__journey = journey;
})();
