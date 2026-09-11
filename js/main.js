// Year
document.getElementById('year').textContent = new Date().getFullYear();

// Nav background on scroll
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

// Mobile menu
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
burger.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  burger.classList.toggle('open', isOpen);
});
mobileMenu.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    burger.classList.remove('open');
  });
});

// Scrollspy — highlight the current section's tab
const navTabs = document.querySelectorAll('.nav__tab');
const mobileTabs = document.querySelectorAll('.mobile-menu a[href^="#"]');
const spySections = ['about', 'experience', 'expertise', 'videos', 'contact']
  .map(id => document.getElementById(id))
  .filter(Boolean);
const spy = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navTabs.forEach(t => t.classList.toggle('is-active', t.getAttribute('href') === `#${id}`));
      mobileTabs.forEach(t => t.classList.toggle('is-active', t.getAttribute('href') === `#${id}`));
    }
  });
}, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
spySections.forEach(s => spy.observe(s));

// Scroll reveal
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
revealEls.forEach(el => io.observe(el));

// Experience tabs
const tabBtns = document.querySelectorAll('.tabs__btn');
const tabPanels = document.querySelectorAll('.tabs__panel');
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach(b => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    tabPanels.forEach(p => p.classList.toggle('is-active', p.dataset.panel === target));
  });
});

// Click-to-play video embeds
document.querySelectorAll('.video-card').forEach(card => {
  card.addEventListener('click', () => {
    const id = card.dataset.yt;
    const thumb = card.querySelector('.video-card__thumb');
    thumb.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }, { once: true });
});

// Contact form
const contactForm = document.getElementById('contactForm');
const cfStatus = document.getElementById('cfStatus');
if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = contactForm.querySelector('.contact-form__submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    cfStatus.textContent = '';
    cfStatus.className = 'contact-form__status';

    try {
      const res = await fetch(contactForm.action, {
        method: 'POST',
        body: new FormData(contactForm),
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        contactForm.reset();
        cfStatus.textContent = "Thanks — that's in my inbox. I'll get back to you soon.";
        cfStatus.classList.add('is-success');
      } else {
        cfStatus.textContent = 'Something went wrong — try again, or email me directly.';
        cfStatus.classList.add('is-error');
      }
    } catch {
      cfStatus.textContent = 'Network error — try again, or email me directly.';
      cfStatus.classList.add('is-error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send request';
    }
  });
}

// Cursor glow (desktop only)
const glow = document.getElementById('cursorGlow');
if (matchMedia('(hover: hover)').matches) {
  window.addEventListener('mousemove', (e) => {
    glow.style.left = e.clientX + 'px';
    glow.style.top = e.clientY + 'px';
  }, { passive: true });
}
