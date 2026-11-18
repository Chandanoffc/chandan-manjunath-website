// Chapter 01 — the manifesto. A pinned statement whose words light up as you scroll,
// followed by the supporting facts.

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export function initManifesto({ reducedMotion = false } = {}) {
  const section = document.getElementById('about');
  const text = section?.querySelector('[data-manifesto]');
  const body = document.getElementById('manifestoBody');
  if (!section || !text) return { update() {} };

  // split into word spans, keeping <em> emphasis
  const words = [];
  const walk = (node, emph) => {
    // static copy: we replace nodes while walking
    Array.from(node.childNodes).forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((tok) => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { frag.append(' '); return; }
          const s = document.createElement('span');
          s.className = 'mw' + (emph ? ' mw--em' : '');
          s.textContent = tok;
          words.push(s);
          frag.append(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) {
        walk(n, emph || n.tagName === 'EM');
      }
    });
  };
  const label = text.textContent.trim();
  text.setAttribute('aria-label', label);
  walk(text, false);
  words.forEach((w) => w.setAttribute('aria-hidden', 'true'));

  const N = words.length;

  function update() {
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight;
    const total = r.height - vh;
    const p = reducedMotion ? 1 : clamp(-r.top / Math.max(total, 1));

    // words: 6% -> 62% of the pinned travel
    const a = 0.06, b = 0.62;
    for (let i = 0; i < N; i++) {
      const start = a + (b - a) * (i / N);
      const k = clamp((p - start) / ((b - a) / N * 2.2));
      words[i].style.setProperty('--k', k.toFixed(3));
    }
    // body: 66% -> 88%
    const kb = clamp((p - 0.64) / 0.2);
    body.style.setProperty('--kb', kb.toFixed(3));
    section.style.setProperty('--p', p.toFixed(3));
  }

  update();
  return { update };
}
