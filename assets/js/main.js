(function () {
const { DICT, META } = window.DS_I18N;
const { gsap, ScrollTrigger, Lenis } = window;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const root = document.documentElement;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const isDesktop = () => window.innerWidth > 900;
const hasGsap = !!(gsap && ScrollTrigger);
if (hasGsap) gsap.registerPlugin(ScrollTrigger);

/* =========================================================
   i18n
   ========================================================= */
const EN = {};
$$('[data-i18n]').forEach((el) => { EN[el.dataset.i18n] = el.textContent; });
$$('[data-i18n-html]').forEach((el) => { EN[el.dataset.i18nHtml] = el.innerHTML; });
$$('[data-i18n-ph]').forEach((el) => { EN[el.dataset.i18nPh] = el.placeholder; });

let lang = root.dataset.lang || 'en';
const t = (key) => (lang === 'en' ? EN[key] : DICT[lang]?.[key]) ?? EN[key];

function applyLang(next, { persist = true } = {}) {
  lang = next;
  root.lang = next;
  root.dataset.lang = next;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));
  document.title = META[next].title;
  $('meta[name="description"]').setAttribute('content', META[next].desc);
  renderAge();
  splitStatement();
  if (persist) {
    try { localStorage.setItem('ds-lang', next); } catch { /* private mode */ }
    const url = new URL(location.href);
    if (next === 'en') url.searchParams.delete('lang'); else url.searchParams.set('lang', next);
    history.replaceState(null, '', url);
  }
  if (hasGsap) ScrollTrigger.refresh();
}

function renderAge() {
  const b = new Date(2006, 1, 15), n = new Date();
  let age = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), 1, 15)) age--;
  $$('.age').forEach((el) => { el.textContent = META[lang].age.replace('{n}', age); });
}

$$('.lang button').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));

/* =========================================================
   Text splitting
   ========================================================= */
let statementST = null;
function splitStatement() {
  const el = $('[data-split]');
  if (!el || !hasGsap) return;
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
  if (reducedMotion) return;
  statementST?.kill();
  const spans = $$('.w', el);
  statementST = ScrollTrigger.create({
    trigger: el,
    start: 'top 80%',
    end: 'bottom 45%',
    scrub: true,
    onUpdate: (self) => {
      const lit = self.progress * spans.length;
      spans.forEach((s, i) => { s.style.opacity = i < lit ? 1 : 0.14 + Math.max(0, 1 - (i - lit)) * 0.5; });
    },
  });
}

function splitChars(el) {
  const text = el.textContent;
  el.innerHTML = [...text].map((c) => `<span class="char">${c}</span>`).join('');
  return $$('.char', el);
}

/* =========================================================
   Smooth scroll
   ========================================================= */
let lenis = null;
if (Lenis && !reducedMotion) {
  lenis = new Lenis({ duration: 1.15, easing: (x) => 1 - Math.pow(1 - x, 4), smoothWheel: true });
  if (hasGsap) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  lenis.stop();
}

function scrollToTarget(target) {
  const el = typeof target === 'string' ? (target === '#top' ? document.body : $(target)) : target;
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.6 });
  else el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
}

$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const href = a.getAttribute('href');
  if (href.length < 2) return;
  e.preventDefault();
  closeMenu();
  scrollToTarget(href);
}));

/* =========================================================
   WebGL scene (loaded lazily so a CDN hiccup never breaks the page)
   ========================================================= */
let scene = null;
const scenePromise = (async () => {
  const canvas = $('#gl');
  try {
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) throw new Error('no webgl');
    if (!window.THREE || !window.DSScene) throw new Error('three.js not loaded');
    // Data URI: a file:// image would taint the canvas and block pixel sampling.
    scene = await window.DSScene.createScene(canvas, { portraitUrl: window.DS_PORTRAIT || 'Photo/web/portrait.webp', reducedMotion });
  } catch (err) {
    canvas.remove();
    console.warn('[scene] disabled:', err.message);
  }
})();

/* =========================================================
   Preloader + intro
   ========================================================= */
async function intro() {
  const loader = $('.loader');
  const num = $('.loader__num');
  const bar = $('.loader__bar span');
  const heroChars = $$('.hero__title [data-chars]').flatMap(splitChars);

  if (!hasGsap) {
    window.__dsLoader?.stop();
    loader?.remove();
    await scenePromise;
    scene?.setIntro(1);
    return;
  }

  const fonts = document.fonts?.ready ?? Promise.resolve();
  const counter = { v: window.__dsLoader ? window.__dsLoader.stop() : 0 };
  const minTime = reducedMotion ? 0.2 : Math.max(0.3, 1.4 * (1 - counter.v / 80));

  // Continue to 80 on a timer, the last 20 only once assets are in.
  const tick = (v) => {
    const n = Math.round(v);
    num.textContent = String(n).padStart(3, '0');
    bar.style.transform = `scaleX(${v / 100})`;
  };
  await new Promise((res) => gsap.to(counter, { v: 80, duration: minTime, ease: 'power2.inOut', onUpdate: () => tick(counter.v), onComplete: res }));
  await Promise.race([Promise.all([fonts, scenePromise]), new Promise((r) => setTimeout(r, 6000))]);
  await new Promise((res) => gsap.to(counter, { v: 100, duration: 0.4, ease: 'power2.out', onUpdate: () => tick(counter.v), onComplete: res }));

  const tl = gsap.timeline({ defaults: { ease: 'expo.inOut' } });
  tl.to(loader, { clipPath: 'inset(0 0 100% 0)', duration: 1.1 }, 0.1)
    .set(loader, { display: 'none' })
    .from(heroChars, { yPercent: 110, rotate: 6, duration: 1.3, stagger: 0.035, ease: 'expo.out' }, 0.55)
    .from('.hero__meta .meta, .hero__lede, .hero__actions > *, .hero__scroll, .nav > *', {
      y: 24, opacity: 0, duration: 1, stagger: 0.06, ease: 'expo.out',
    }, 0.9);

  if (scene) {
    const s = { v: 0 };
    tl.to(s, { v: 1, duration: 2.4, ease: 'expo.out', onUpdate: () => scene.setIntro(s.v) }, 0.5);
  }
  tl.add(() => lenis?.start(), 0.8);
}

/* =========================================================
   Scroll-driven bits
   ========================================================= */
function setupScroll() {
  if (!hasGsap) return;

  // Scene morph follows whichever section owns the middle of the viewport.
  $$('[data-shape]').forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => {
        if (!self.isActive) return;
        const d = isDesktop();
        scene?.setTarget(Number(sec.dataset.shape), d ? Number(sec.dataset.dx || 0) : 0, d ? Number(sec.dataset.dy || 0) : 0);
      },
    });
  });

  // While the toolbox is on screen, the particle sphere wraps the word sphere exactly.
  const wrap = $('.sphere-wrap');
  if (wrap) {
    ScrollTrigger.create({
      trigger: '#skills', start: 'top 55%', end: 'bottom 55%',
      onToggle: (self) => scene?.setAnchor(self.isActive ? () => {
        const r = wrap.getBoundingClientRect();
        // Words orbit at 0.4 × width; the particle shell sits just outside them.
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width * 0.4 * 1.2 };
      } : null),
    });
  }

  // Progress bar.
  gsap.to('.progress span', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

  // Nav: hide on scroll down, show on scroll up.
  const nav = $('.nav');
  let lastY = 0;
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      nav.classList.toggle('is-scrolled', y > 40);
      if (!$('#nav-links').classList.contains('is-open')) nav.classList.toggle('is-hidden', y > lastY && y > 400);
      lastY = y;
    },
  });

  // Active nav link.
  $$('.nav__links a').forEach((a) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    ScrollTrigger.create({
      trigger: target, start: 'top 50%', end: 'bottom 50%',
      onToggle: (self) => a.classList.toggle('is-active', self.isActive),
    });
  });

  if (reducedMotion) return;

  // Generic reveals.
  const reveal = (sel, opts = {}) => $$(sel).forEach((el) => {
    gsap.from(el, {
      y: 50, opacity: 0, duration: 1.2, ease: 'expo.out', ...opts,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
  reveal('.section__head, .big-title, .contact__kicker, .work__intro');
  reveal('.about__text p, .facts div, .skill-group, .usi__body > *, .diploma, .courses li, .contact__grid > div');
  reveal('.row, .award', { y: 30 });

  // Hero title drifts apart as you leave.
  gsap.to('.hero__title .line:first-child', { xPercent: -8, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__title .line--indent', { xPercent: 6, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  // Portrait clip reveal.
  gsap.from('.portrait__inner', {
    clipPath: 'inset(100% 0 0 0)', duration: 1.6, ease: 'expo.inOut',
    scrollTrigger: { trigger: '.portrait', start: 'top 80%', once: true },
  });

  // USI image: clip reveal + parallax.
  gsap.from('.usi__media', { clipPath: 'inset(0 100% 0 0)', duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: '.usi', start: 'top 80%', once: true } });
  gsap.fromTo('.usi__media img', { yPercent: -8 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.usi', start: 'top bottom', end: 'bottom top', scrub: true } });

  // Contact outline word slides in.
  gsap.from('.contact__giant', { yPercent: 60, ease: 'none', scrollTrigger: { trigger: '.contact__giant', start: 'top bottom', end: 'bottom bottom', scrub: true } });

  // Counters.
  $$('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count);
    const o = { v: 0 };
    gsap.to(o, {
      v: end, duration: 2, ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate: () => { el.textContent = Math.round(o.v); },
    });
  });

  // Horizontal project gallery.
  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px)', () => {
    const track = $('.work__track');
    const pin = $('.work__pin');
    const cards = $$('.card', track);
    const bar = $('.work__bar span');
    const distance = () => track.scrollWidth - (window.innerWidth - track.getBoundingClientRect().left + gsap.getProperty(track, 'x'));
    const tween = gsap.to(track, {
      x: () => -Math.max(0, distance()),
      ease: 'none',
      scrollTrigger: {
        trigger: pin, pin: true, scrub: true, start: 'top top',
        end: () => '+=' + Math.max(1, distance()),
        invalidateOnRefresh: true,
        onUpdate: (self) => { bar.style.transform = `scaleX(${self.progress})`; },
      },
    });
    // Images drift inside their frames as the track moves — maps 1:1 to scroll, no extra smoothing.
    const imgs = cards.map((c) => $('.card__media img', c)).filter(Boolean);
    cards.forEach((c) => {
      const img = $('.card__media img', c);
      if (!img) return;
      ScrollTrigger.create({
        trigger: c, containerAnimation: tween, start: 'left right', end: 'right left',
        onUpdate: (self) => { img.style.translate = `${(self.progress - 0.5) * -12}% 0`; },
      });
    });
    return () => { gsap.set(track, { x: 0 }); imgs.forEach((img) => { img.style.translate = ''; }); };
  });
}

/* =========================================================
   Cursor, magnetic, tilt
   ========================================================= */
function setupPointer() {
  if (!finePointer || !hasGsap) return;
  // Only hide the system cursor once ours is actually wired up.
  root.classList.add('has-cursor');
  const cursor = $('.cursor');
  const dot = $('.cursor__dot');
  const ring = $('.cursor__ring');
  const label = $('.cursor__label');
  const dx = gsap.quickTo(dot, 'x', { duration: 0.08 }), dy = gsap.quickTo(dot, 'y', { duration: 0.08 });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'expo.out' }), ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'expo.out' });
  gsap.set(cursor, { opacity: 0 });
  window.addEventListener('pointermove', (e) => { gsap.to(cursor, { opacity: 1, duration: 0.3, overwrite: 'auto' }); dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); }, { passive: true });
  window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
  window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
  document.addEventListener('mouseleave', () => gsap.to(cursor, { opacity: 0, duration: 0.3 }));
  document.addEventListener('mouseenter', () => gsap.to(cursor, { opacity: 1, duration: 0.3 }));

  document.addEventListener('pointerover', (e) => {
    const lab = e.target.closest('[data-cursor]');
    const hov = e.target.closest('a, button, .skill-group li');
    if (lab) { label.textContent = lab.dataset.cursor; cursor.classList.add('is-label'); cursor.classList.remove('is-hover'); }
    else { cursor.classList.remove('is-label'); cursor.classList.toggle('is-hover', !!hov); }
  });

  // Magnetic buttons.
  $$('.magnetic').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.35);
      yTo((e.clientY - r.top - r.height / 2) * 0.45);
    });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });

  // 3D tilt on the portrait and project cards.
  const tilt = (el, inner, max) => {
    // Plain tweens: quickTo can't register a rotation whose start and end are both 0.
    gsap.set(inner, { transformPerspective: 1000 });
    const to = (rx, ry) => gsap.to(inner, { rotateX: rx, rotateY: ry, duration: 0.8, ease: 'expo.out', overwrite: 'auto' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      to(-((e.clientY - r.top) / r.height - 0.5) * max, ((e.clientX - r.left) / r.width - 0.5) * max);
    });
    el.addEventListener('pointerleave', () => to(0, 0));
  };
  $$('.tilt').forEach((el) => tilt(el, $('.portrait__inner', el), 14));
  $$('.card:not(.card--more) .card__media').forEach((m) => tilt(m.closest('.card'), m, 6));

  // Award hover previews.
  const preview = $('.award-preview');
  const pImg = $('img', preview);
  const px = gsap.quickTo(preview, 'x', { duration: 0.6, ease: 'expo.out' });
  const py = gsap.quickTo(preview, 'y', { duration: 0.6, ease: 'expo.out' });
  const pr = gsap.quickTo(preview, 'rotate', { duration: 0.8, ease: 'expo.out' });
  let lastX = 0;
  $$('.award').forEach((a) => {
    a.addEventListener('pointerenter', () => { pImg.src = a.dataset.img; preview.classList.add('is-on'); });
    a.addEventListener('pointerleave', () => preview.classList.remove('is-on'));
    a.addEventListener('pointermove', (e) => {
      px(e.clientX - 170); py(e.clientY - 128);
      pr(gsap.utils.clamp(-12, 12, (e.clientX - lastX) * 0.6));
      lastX = e.clientX;
    });
  });
}

/* =========================================================
   Skill sphere (DOM 3D — crisp text at any DPI)
   ========================================================= */
function setupSphere() {
  const wrap = $('.sphere-wrap');
  const host = $('.sphere');
  if (!wrap) return;
  // [key linking to a pill in the list, label]. Keyless words come from the project stacks.
  const words = [
    ['c', 'C'], ['cs', 'C#'], ['java', 'Java'], ['py', 'Python'], ['php', 'PHP'], ['js', 'JavaScript'], ['sql', 'SQL'],
    ['algo', 'Algorithms'], ['ml', 'Machine Learning'], ['llm', 'LLMs'], ['fs', 'Full-stack'], ['cloud', 'Cloud'],
    ['asp', 'ASP.NET'], ['ef', 'EF Core'], ['design', 'Software Design'],
    [null, 'Swift'], [null, 'Node.js'], [null, 'Express'], [null, 'WPF'], [null, 'REST'], [null, 'AWS'],
    [null, 'Gemini'], [null, 'Telegram API'], [null, 'TCP'], [null, 'HTML/CSS'],
  ];
  const accent = new Set(['algo', 'ml', 'llm', 'fs']);
  const n = words.length;
  const byKey = {};
  const pts = words.map(([key, label], i) => {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = Math.PI * (3 - Math.sqrt(5)) * i;
    const span = document.createElement('span');
    span.textContent = label;
    if (accent.has(key)) span.className = 'acc';
    host.appendChild(span);
    const p = { x: Math.cos(th) * r, y, z: Math.sin(th) * r, el: span, key, k: 1 };
    if (key) byKey[key] = p;
    return p;
  });
  const pills = $$('.skill-group li[data-skill]');

  // Idle: slow spin. Pointer over the sphere: it glides to a stop so words are easy to hover.
  // Hovering a word highlights it in place (never moves it out from under the cursor).
  // Hovering a pill in the list is the only thing that turns the sphere, bringing that word to the front.
  const IDLE_X = 0.0012, IDLE_Y = 0.003;
  let ax = 0.3, ay = 0, vx = IDLE_X, vy = IDLE_Y;
  let inside = false;
  let focus = null;
  let bringToFront = false;
  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(wrap);

  const setFocus = (key, rotate = false) => {
    focus = key ? byKey[key] : null;
    bringToFront = !!focus && rotate;
    wrap.classList.toggle('has-focus', !!focus);
    pts.forEach((p) => p.el.classList.toggle('is-focus', p === focus));
    pills.forEach((li) => li.classList.toggle('is-linked', !!key && li.dataset.skill === key));
  };

  pills.forEach((li) => {
    li.addEventListener('pointerenter', () => setFocus(li.dataset.skill, true));
    li.addEventListener('pointerleave', () => setFocus(null));
    li.addEventListener('click', () => setFocus(focus?.key === li.dataset.skill ? null : li.dataset.skill, true));
  });
  pts.forEach((p) => {
    if (!p.key) return;
    p.el.addEventListener('pointerenter', () => setFocus(p.key));
    p.el.addEventListener('pointerleave', () => setFocus(null));
  });
  wrap.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') inside = true; });
  wrap.addEventListener('pointerleave', () => { inside = false; });

  const TAU = Math.PI * 2;
  const lerpAngle = (from, to, t) => from + ((((to - from + Math.PI) % TAU) + TAU) % TAU - Math.PI) * t;

  const loop = () => {
    requestAnimationFrame(loop);
    if (!visible) return;
    const R = wrap.clientWidth * 0.4;
    if (focus && bringToFront) {
      // Solve for the rotation that puts this point at (0, 0, 1).
      const ty = Math.atan2(-focus.x, focus.z);
      const tx = Math.atan2(focus.y, Math.hypot(focus.x, focus.z));
      ay = lerpAngle(ay, ty, 0.09);
      ax = lerpAngle(ax, tx, 0.09);
      vx = vy = 0;
    } else if (!reducedMotion) {
      const still = inside || focus;
      vx += ((still ? 0 : IDLE_X) - vx) * 0.08;
      vy += ((still ? 0 : IDLE_Y) - vy) * 0.08;
      ax += vx; ay += vy;
    }
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    for (const p of pts) {
      const x1 = p.x * cy + p.z * sy;
      const z1 = -p.x * sy + p.z * cy;
      const y2 = p.y * cx - z1 * sx;
      const z2 = p.y * sx + z1 * cx;
      p.k += ((p === focus ? (bringToFront ? 1.6 : 1.3) : 1) - p.k) * 0.15;
      const s = ((z2 + 2.2) / 3.2) * p.k;
      let o = 0.15 + ((z2 + 1) / 2) * 0.85;
      if (focus && p !== focus) o *= 0.35;
      p.el.style.transform = `translate(-50%, -50%) translate3d(${x1 * R}px, ${y2 * R}px, 0) scale(${s})`;
      p.el.style.opacity = o.toFixed(3);
      p.el.style.zIndex = p === focus ? 999 : Math.round(z2 * 100) + 100;
      // Words on the far side shouldn't steal hover from the ones in front.
      p.el.style.pointerEvents = z2 > 0 && p.key ? 'auto' : 'none';
    }
  };
  loop();
}

/* =========================================================
   Small utilities
   ========================================================= */
function setupClock() {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const els = $$('.clock');
  const tick = () => { const s = fmt.format(new Date()); els.forEach((e) => { e.textContent = s; }); };
  tick();
  setInterval(tick, 1000);
  $$('.year').forEach((e) => { e.textContent = new Date().getFullYear(); });
}

let toastTimer;
function toast(msg) {
  const el = $('.toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
}

async function copyEmail() {
  const email = 'scapellatodavide552@gmail.com';
  try {
    await navigator.clipboard.writeText(email);
    toast(META[lang].copied);
  } catch {
    location.href = `mailto:${email}`;
  }
}
$('.contact__mail')?.addEventListener('click', copyEmail);

// Mobile menu.
const burger = $('.nav__burger');
const links = $('#nav-links');
function closeMenu() {
  if (!links.classList.contains('is-open')) return;
  links.classList.remove('is-open');
  burger.setAttribute('aria-expanded', 'false');
  lenis?.start();
}
burger.addEventListener('click', () => {
  const open = !links.classList.contains('is-open');
  links.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
  if (open) lenis?.stop(); else lenis?.start();
});

/* =========================================================
   Command palette (⌘K / Ctrl+K)
   ========================================================= */
function setupPalette() {
  const pal = $('.palette');
  const input = $('.palette__input');
  const list = $('.palette__list');
  let items = [], sel = 0;

  const commands = () => {
    const c = META[lang].cmds;
    return [
      { id: 'work', label: c.work, hint: '05', run: () => scrollToTarget('#work') },
      { id: 'about', label: c.about, hint: '01', run: () => scrollToTarget('#about') },
      { id: 'exp', label: c.exp, hint: '03', run: () => scrollToTarget('#experience') },
      { id: 'edu', label: c.edu, hint: '04', run: () => scrollToTarget('#education') },
      { id: 'awards', label: c.awards, hint: '06', run: () => scrollToTarget('#awards') },
      { id: 'contact', label: c.contact, hint: '07', run: () => scrollToTarget('#contact') },
      { id: 'email', label: c.email, hint: '@', run: copyEmail },
      { id: 'github', label: c.github, hint: '↗', run: () => window.open('https://github.com/FullMonkeyy', '_blank', 'noopener') },
      { id: 'linkedin', label: c.linkedin, hint: '↗', run: () => window.open('https://www.linkedin.com/in/davide-scapellato-87a742291', '_blank', 'noopener') },
      ...['en', 'it', 'de'].filter((l) => l !== lang).map((l) => ({ id: l, label: c[l], hint: l.toUpperCase(), run: () => applyLang(l) })),
      { id: 'top', label: c.top, hint: '↑', run: () => scrollToTarget('#top') },
    ];
  };

  const render = () => {
    const q = input.value.trim().toLowerCase();
    items = commands().filter((c) => !q || c.label.toLowerCase().includes(q) || c.id.includes(q));
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.map((c, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}"><span>${c.label}</span><span class="mono">${c.hint}</span></li>`).join('');
  };
  const open = () => { pal.hidden = false; input.value = ''; sel = 0; render(); input.focus(); lenis?.stop(); };
  const close = () => { pal.hidden = true; lenis?.start(); };
  const run = (i) => { const c = items[i]; if (!c) return; close(); c.run(); };

  $$('[data-palette]').forEach((b) => b.addEventListener('click', open));
  input.addEventListener('input', () => { sel = 0; render(); });
  list.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) run(Number(li.dataset.i)); });
  list.addEventListener('pointermove', (e) => {
    const li = e.target.closest('li');
    if (li && Number(li.dataset.i) !== sel) { sel = Number(li.dataset.i); render(); }
  });
  pal.addEventListener('click', (e) => { if (e.target === pal) close(); });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? open() : close(); return; }
    if (e.key === 'Escape') { if (!pal.hidden) close(); closeMenu(); return; }
    if (pal.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); render(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); render(); }
    if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  });
}

/* =========================================================
   Boot
   ========================================================= */
applyLang(lang, { persist: false });
setupClock();
setupScroll();
setupPointer();
setupSphere();
setupPalette();
intro().then(() => hasGsap && ScrollTrigger.refresh());
window.addEventListener('load', () => hasGsap && ScrollTrigger.refresh());
})();
