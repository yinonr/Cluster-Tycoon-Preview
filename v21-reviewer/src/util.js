// Small shared helpers: seeded RNG, formatting, DOM.

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    weighted(items) { // [{w, v}]
      const total = items.reduce((s, it) => s + it.w, 0);
      let r = next() * total;
      for (const it of items) { if ((r -= it.w) <= 0) return it.v; }
      return items[items.length - 1].v;
    },
  };
}

export const newSeed = () => (Math.random() * 2 ** 31) >>> 0;

// A stable 32-bit hash of any parts (numbers, strings): FNV-1a over the joined
// text, then a murmur3 finalizer so neighbouring seeds land far apart.
export function hash32(...parts) {
  const s = parts.join('\u001f');
  let h = 0x811C9DC5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B);
  h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35);
  h ^= h >>> 16;
  return h >>> 0;
}

// An independent random stream for one job ('drift', 'auction', a lot id…):
// drawing from one never moves another, so a seed replays the same market
// whatever the frame rate or the cosmetic code did.
export const stream = (seed, ...salt) => makeRng(hash32(seed, ...salt));

// Pick from a live pool with a number drawn earlier (u in [0, 1)).
export const pickAt = (arr, u) => arr[Math.floor(u * arr.length)];

export const round2 = (n) => Math.round(n * 100) / 100;
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const usd = (n) => '$' + n.toFixed(2);
export const usdM = (n) => '$' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
export const int = (n) => Math.round(n).toLocaleString('en-US');

export function mmss(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// "3m 14s" for results.
export function dur(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  return m ? `${m}m ${String(sec % 60).padStart(2, '0')}s` : `${sec}s`;
}

// Board clock: maps floor seconds onto 12:00 → 5:00 PM.
export function wallClock(t, total, openHour = 12, closeHour = 17) {
  const mins = (t / total) * (closeHour - openHour) * 60;
  const h24 = openHour + Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  const h12 = ((h24 + 11) % 12) + 1;
  return { h24, m, label: `${h12}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`, mins };
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// "A · B · C" with each part kept whole, so a narrow line wraps between parts.
export const dotted = (parts) => parts.map((s) => `<span class="nowrap">${esc(s)}</span>`).join(' · ');

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const $ = (root, sel) => root.querySelector(sel);
export const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function shake(node) {
  if (!node || reducedMotion()) return;
  node.classList.remove('shake');
  void node.offsetWidth;
  node.classList.add('shake');
}

// Tiny event emitter
export function emitter() {
  const map = new Map();
  return {
    on(evt, fn) { if (!map.has(evt)) map.set(evt, new Set()); map.get(evt).add(fn); return () => map.get(evt)?.delete(fn); },
    emit(evt, data) { map.get(evt)?.forEach((fn) => fn(data)); },
    clear() { map.clear(); },
  };
}
