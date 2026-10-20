// V10.3 game feel. Presentation-only feedback derived from the difference between
// two authoritative engine states: what the player just did, the room answers.
// Nothing here writes engine state, saves, or invents values; every number shown
// is the rendered engine value, only its arrival is animated.
import { activeLot, available, cash } from '../tycoon/arcade.js';
import { buyerLive } from '../tycoon/arcade-buyers.js';

const money = n => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function snapshot(g) {
  if (!g?.arcade) return null;
  const a = g.arcade, l = activeLot(g), n = l?.negotiation, b = a.buyers.find(x => x.id === a.confirm?.buyerId);
  return {
    phase: g.phase, q: g.q, cash: cash(g), active: l?.id || null, price: n?.price ?? null, status: l?.status || null,
    tape: n?.tape.length || 0, outcome: n?.tape.at(-1)?.outcome || null, attempts: n?.attempts.length || 0,
    attempt: n?.attempts.at(-1) || null, running: !!n?.running,
    buyer: b?.id || null, rate: b?.rate ?? null, buyerTape: b?.negotiation.tape.length || 0, buyerOutcome: b?.negotiation.tape.at(-1)?.outcome || null,
    signing: !!a.signing, receipt: a.confirm?.receipt || null,
    live: new Set([...a.lots.filter(x => available(g, x)).map(x => x.id), ...a.buyers.filter(x => buyerLive(g, x)).map(x => x.id)]),
    quotes: Object.fromEntries(a.lots.map(x => [x.id, x.negotiation?.price ?? x.ask])),
  };
}

export function effects(before, after) {
  if (!before || !after || before.q !== after.q || before.phase !== after.phase) return [];
  const fx = [];
  if (after.active && after.active === before.active) {
    if (after.price !== before.price) fx.push({ type: 'quote', from: before.price, to: after.price });
    if (after.tape > before.tape && after.attempts === before.attempts) fx.push({ type: 'reaction', side: 'seller', outcome: after.outcome });
    if (after.running && !before.running) fx.push({ type: 'charm-start' });
    if (!after.running && before.running && after.attempt?.status === 'resolved') fx.push({ type: 'charm-result', tier: after.attempt.tier, precision: after.attempt.precision, walked: after.attempt.walked });
  }
  if (after.buyer && after.buyer === before.buyer) {
    if (after.rate !== before.rate) fx.push({ type: 'quote', from: before.rate, to: after.rate, buyer: true });
    if (after.buyerTape > before.buyerTape) fx.push({ type: 'reaction', side: 'buyer', outcome: after.buyerOutcome });
  }
  if (after.active && after.active !== before.active) fx.push({ type: 'arrive-desk' });
  if (after.buyer && after.buyer !== before.buyer) fx.push({ type: 'arrive-desk' });
  if (after.signing && !before.signing) fx.push({ type: 'contract' });
  if (after.receipt && !before.receipt) {
    // Purchases and equity book no profit; a secondary sale is cash in; sales realize total − FIFO cost.
    const r = after.receipt, profit = r.kind === 'purchase' || r.payment === 'equity' ? null : r.kind === 'secondary' ? r.total : Number.isFinite(r.cost) ? r.total - r.cost : null;
    fx.push({ type: 'signed', kind: r.kind, profit });
  }
  if (after.cash !== before.cash) fx.push({ type: 'cash', from: before.cash, to: after.cash });
  const arrived = [...after.live].filter(id => !before.live.has(id));
  if (arrived.length) fx.push({ type: 'arrival', ids: arrived });
  const moved = Object.keys(after.quotes).filter(id => before.quotes[id] !== undefined && before.quotes[id] !== after.quotes[id] && id !== after.active);
  if (moved.length) fx.push({ type: 'moved', ids: moved });
  return fx;
}

function tween(el, from, to, ms = 520) {
  const final = el.textContent;
  if (reduced() || !Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
  // Roll in the same format the final text uses (the HUD always shows cents; desks drop .00).
  const cents2 = /\.\d\d(?!\d)/.test(final), start = performance.now();
  const format = el.dataset.fxFormat === 'rate' ? n => `$${(n / 100).toFixed(2)}` : cents2 ? n => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : money;
  const frame = now => {
    if (!el.isConnected) return;
    const t = Math.min(1, (now - start) / ms), e = 1 - (1 - t) ** 3;
    el.textContent = t < 1 ? format(Math.round(from + (to - from) * e)) : final;
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function pulse(el, cls) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

const SOUND = {
  accept: s => s.bell({ strikes: 1, f: 990, ring: 1.2 }), beat: s => s.bell({ strikes: 1, f: 990, ring: 1.2 }), match: s => s.tap(),
  counter: s => s.tap(), hold: s => s.buzz(), decline: s => s.buzz(), walk: s => s.alert(), expired: s => s.alert(),
};

// Apply effects to the freshly rendered DOM. `qty` multiplies per-hour quotes into
// the totals the desk displays, so a quote roll counts through real lot totals.
export function play(root, list, sound) {
  for (const fx of list) {
    if (fx.type === 'quote') {
      const el = root.querySelector('[data-fx-quote]');
      if (el) { const per = Number(el.dataset.fxPer) || 1; tween(el, fx.from * per, fx.to * per); pulse(el.closest('[data-fx-board]') || el, fx.to < fx.from ? 'fx-quote-down' : 'fx-quote-up'); }
    } else if (fx.type === 'reaction') {
      pulse(root.querySelector('[data-fx-bubble]'), 'fx-pop');
      pulse(root.querySelector('[data-fx-figure]'), `fx-react-${fx.outcome || 'plain'}`);
      if (sound) (SOUND[fx.outcome] || (s => s.tap()))(sound);
    } else if (fx.type === 'charm-start') {
      sound?.ring(1);
    } else if (fx.type === 'charm-result') {
      pulse(root.querySelector('[data-fx-verdict]'), 'fx-slam');
      pulse(root.querySelector('[data-fx-figure]'), `fx-react-${fx.walked ? 'walk' : fx.tier === 'hit' ? 'accept' : 'hold'}`);
      if (sound) fx.walked ? sound.alert() : fx.tier === 'hit' ? sound.bell({ strikes: fx.precision === 'perfect' ? 2 : 1 }) : sound.buzz();
    } else if (fx.type === 'arrive-desk') {
      pulse(root.querySelector('[data-fx-figure]'), 'fx-step-in');
    } else if (fx.type === 'contract') {
      pulse(root.querySelector('[data-fx-contract]'), 'fx-slide-up'); sound?.printer(.35);
    } else if (fx.type === 'signed') {
      pulse(root.querySelector('[data-fx-stamp]'), 'fx-stamp');
      pulse(root.querySelector('[data-fx-payoff]'), fx.profit === null ? 'fx-payoff-stock' : fx.profit >= 0 ? 'fx-payoff-win' : 'fx-payoff-loss');
      if (sound) { sound.stamp(); if (fx.profit > 0) setTimeout(() => sound.clatter(10, .35), 180); }
    } else if (fx.type === 'cash') {
      for (const el of root.querySelectorAll('[data-fx-cash]')) { tween(el, fx.from, fx.to, 700); pulse(el, fx.to > fx.from ? 'fx-cash-in' : 'fx-cash-out'); }
    } else if (fx.type === 'arrival' || fx.type === 'moved') {
      for (const id of fx.ids) pulse(root.querySelector(`[data-station-id="${CSS.escape(id)}"]`), fx.type === 'arrival' ? 'fx-arrive' : 'fx-moved');
      if (fx.type === 'arrival' && sound) sound.blip(1180, .03);
    }
  }
}
