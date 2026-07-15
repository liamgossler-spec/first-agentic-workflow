/* GOSS® — interactions
   navbar glass · mobile menu · scroll reveals · image fallbacks
   hover parallax · FAQ accordion · Formspree submit */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Glassy navbar on scroll ---------- */
  const header = document.getElementById('site-header');
  if (header) {
    let ticking = false;
    const onScroll = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 24);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
    }, { passive: true });
    onScroll();
  }

  /* ---------- Mobile menu ---------- */
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.getElementById('mobile-menu');
  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    };
    toggle.addEventListener('click', () =>
      setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => setOpen(false)));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  /* ---------- Scroll-reveal stagger ---------- */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------- Imagery fallback chain ----------
     local .webp → local .png → temporary CDN original → styled placeholder.
     The chain disappears entirely once assets/*.webp exist. */
  document.querySelectorAll('img[data-fallback]').forEach((img) => {
    const tryNext = () => {
      const local = img.getAttribute('data-fallback');
      const cdn = img.getAttribute('data-fallback-2');
      if (local) {
        img.removeAttribute('srcset');
        img.removeAttribute('data-fallback');
        img.src = local;
      } else if (cdn) {
        img.removeAttribute('data-fallback-2');
        img.src = cdn;
      } else {
        img.removeEventListener('error', tryNext);
        const fig = img.closest('.case-media, .studio-media');
        if (fig) fig.classList.add('is-placeholder');
      }
    };
    img.addEventListener('error', tryNext);
    if (img.complete && img.naturalWidth === 0) tryNext();
  });

  /* ---------- Hover parallax on imagery ---------- */
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('[data-parallax]').forEach((fig) => {
      const img = fig.querySelector('img');
      if (!img) return;
      let raf = null;
      let tx = 0, ty = 0, cx = 0, cy = 0, hovering = false;

      const loop = () => {
        cx += (tx - cx) * 0.09;
        cy += (ty - cy) * 0.09;
        img.style.transform = `scale(1.06) translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`;
        if (hovering || Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
          raf = requestAnimationFrame(loop);
        } else {
          img.style.transform = '';
          raf = null;
        }
      };
      const start = () => { if (!raf) raf = requestAnimationFrame(loop); };

      fig.addEventListener('pointerenter', () => { hovering = true; start(); });
      fig.addEventListener('pointermove', (e) => {
        const r = fig.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * -14;
        ty = ((e.clientY - r.top) / r.height - 0.5) * -14;
      });
      fig.addEventListener('pointerleave', () => {
        hovering = false; tx = 0; ty = 0; start();
      });
    });
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.faq-q').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.setAttribute('aria-expanded',
        String(btn.getAttribute('aria-expanded') !== 'true'));
    });
  });

  /* ---------- Contact form (Formspree) ---------- */
  const form = document.querySelector('.contact-form');
  if (form) {
    const status = form.querySelector('.form-status');
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.action.includes('YOUR_FORM_ID')) {
        status.textContent = 'Form not wired up yet — email hello@gossagency.com instead.';
        status.classList.add('is-error');
        return;
      }
      status.classList.remove('is-error');
      status.textContent = 'Sending…';
      button.disabled = true;
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          form.reset();
          status.textContent = 'Received. Expect a reply within one business day.';
        } else {
          throw new Error('bad status');
        }
      } catch {
        status.textContent = 'Something broke — email hello@gossagency.com and we’ll take it from there.';
        status.classList.add('is-error');
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ---------- Footer year ---------- */
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
