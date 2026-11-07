// Landing page behaviour: reveals, the sticky download button, and the 3D story driven by scroll.
const { lang } = window.MEWNAY ?? { lang: 'ru' };
const params = new URLSearchParams(location.search);
const capture = params.get('capture');
const mobile = () => innerWidth < 900;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

document.querySelectorAll('.langs a').forEach((a) => a.addEventListener('click', () => {
  try { localStorage.setItem('mewnay-lang', a.dataset.lang); } catch { /* private mode */ }
}));

const topbar = document.querySelector('.topbar');
const dock = document.querySelector('.dock-cta');
const hero = document.querySelector('.hero');
const final = document.querySelector('.final');
function onScroll() {
  topbar.classList.toggle('solid', scrollY > 30);
  const heroGone = hero.getBoundingClientRect().bottom < innerHeight * 0.35;
  const finalIn = final.getBoundingClientRect().top < innerHeight * 0.7;
  dock?.classList.toggle('show', heroGone && !finalIn);
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const reveal = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) {
    e.target.classList.add('in');
    reveal.unobserve(e.target);
  }
}), { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));

// Scroll position -> film time. Each chapter plays its part while its copy is on screen.
const chapter = (name) => document.querySelector(`[data-chapter="${name}"]`);
function anchors() {
  const vh = innerHeight;
  const top = (el) => el.getBoundingClientRect().top + scrollY;
  const span = (name, from, to, start = 0.45, end = 0.9) => {
    const el = chapter(name);
    if (mobile() && name !== 'final') {
      // On phones the copy scrolls away first, then the story plays in the clear.
      const copy = el.querySelector('.copy');
      return [[top(el) + copy.offsetHeight * 0.55, from], [top(el) + el.offsetHeight - vh, to]];
    }
    return [[top(el) - vh * start, from], [top(el) + el.offsetHeight - vh * end, to]];
  };
  return [[0, 2.2], ...span('widgets', 2.25, 5.95, 0.55), ...span('pay', 6.0, 9.6, 0.3), ...span('style', 9.85, 13.3, 0.3), ...span('final', 13.42, 14.6, 0.75, 0.6)];
}
let marks = anchors();
addEventListener('resize', () => { marks = anchors(); });
addEventListener('load', () => { marks = anchors(); });
function filmTime() {
  const y = scrollY;
  if (y <= marks[0][0]) return marks[0][1];
  for (let i = 1; i < marks.length; i += 1) {
    if (y <= marks[i][0]) {
      const [y0, t0] = marks[i - 1];
      const [y1, t1] = marks[i];
      return t0 + (t1 - t0) * clamp((y - y0) / Math.max(1, y1 - y0));
    }
  }
  return marks[marks.length - 1][1];
}

// How far down the screen the copy reaches; on phones the 3D phone keeps below it.
const copies = [...document.querySelectorAll('.hero .copy, .chapter .copy')];
function cover() {
  if (params.has('cover')) return Number(params.get('cover'));
  if (!mobile()) return 0;
  let reach = 0;
  for (const el of copies) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) reach = Math.max(reach, clamp(r.bottom / innerHeight));
  }
  return reach;
}

const finalCopy = document.querySelector('.final .copy');
const layout = () => ({ reach: cover(), finalTop: finalCopy.getBoundingClientRect().top / innerHeight });

function webglWorks() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function start() {
  if (capture) document.body.classList.add(capture === 'og' ? 'capture-og' : 'capture');
  if (!webglWorks()) return;
  const { createScene } = await import('./scene.js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('gl');
  const fixed = params.has('t') ? Number(params.get('t')) : null;
  const scene = await createScene(canvas, { lang, mobile, still: fixed !== null });
  const began = performance.now();
  scene.run((now) => {
    if (fixed !== null) return fixed;
    const t = filmTime();
    if (t > 2.2) return t;
    const intro = reduced ? 2.2 : clamp((now - began) / 2400) * 2.2;
    return Math.min(t, intro);
  }, layout);
  document.body.classList.add('gl-ready');
  if (capture) setTimeout(() => { window.captureReady = true; }, 600);
}
start().catch((error) => console.warn('3D scene unavailable:', error));
