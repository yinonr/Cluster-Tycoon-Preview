// Game feel. Presentation-only feedback derived from the difference between two authoritative
// engine states: what the player just did, the room answers. Nothing here writes engine state,
// saves, or invents values; every number shown is the rendered engine value, only its arrival
// is animated (chips dropping into slots, the BUILT stamp, cash and valuation counting).
import { activeLot, available, cash } from '../tycoon/arcade.js';
import { buyerLive } from '../tycoon/arcade-buyers.js';
import { companyStats, heldFor, GPUS } from '../tycoon/founder.js';
import { short } from './pit-ledger.js';

const money = n => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function snapshot(g) {
  if (!g?.arcade) return null;
  const a = g.arcade, l = activeLot(g), n = l?.negotiation, b = a.buyers.find(x => x.id === a.confirm?.buyerId), t = a.terms.find(x => x.id === a.confirm?.termId);
  const s = g.company ? companyStats(g) : null, held = {};
  for (const o of a.objectives) if (o.status === 'open') for (const k of GPUS) if (o.recipe[k]) held[`${o.id}|${k}`] = heldFor(g, o.id, k);
  return {
    phase: g.phase, q: g.q, cash: cash(g), active: l?.id || null, price: n?.price ?? null, status: l?.status || null,
    tape: n?.tape.length || 0, outcome: n?.tape.at(-1)?.outcome || null, attempts: n?.attempts.length || 0,
    attempt: n?.attempts.at(-1) || null, running: !!n?.running,
    buyer: b?.id || null, rate: b?.rate ?? null, buyerTape: b?.negotiation.tape.length || 0, buyerOutcome: b?.negotiation.tape.at(-1)?.outcome || null,
    term: t?.id || null, termTape: t?.tape.length || 0, termOutcome: t?.tape.at(-1)?.outcome || null,
    signing: !!a.signing, receipt: a.confirm?.receipt || null, built: a.confirm?.built || null,
    valuation: s?.valuation ?? null, held, builds: g.company?.builds.length || 0,
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
    if (!after.running && before.running && after.attempt?.status === 'resolved') fx.push({ type: 'charm-result', tier: after.attempt.tier, precision: after.attempt.precision, walked: after.attempt.walked, jackpot: after.attempt.params?.attempt === 3 && after.attempt.precision === 'perfect' });
  }
  if (after.buyer && after.buyer === before.buyer) {
    if (after.rate !== before.rate) fx.push({ type: 'quote', from: before.rate, to: after.rate, buyer: true });
    if (after.buyerTape > before.buyerTape) fx.push({ type: 'reaction', side: 'buyer', outcome: after.buyerOutcome });
  }
  if (after.term && after.term === before.term && after.termTape > before.termTape) fx.push({ type: 'reaction', side: 'investor', outcome: after.termOutcome });
  if ((after.active && after.active !== before.active) || (after.buyer && after.buyer !== before.buyer) || (after.term && after.term !== before.term)) fx.push({ type: 'arrive-desk' });
  if (after.signing && !before.signing) fx.push({ type: 'contract' });
  if (after.receipt && !before.receipt) {
    // Purchases book no profit; a raise is company cash in; resale realizes total − FIFO cost.
    const r = after.receipt, profit = r.kind === 'purchase' || r.funding === 'compute' ? null : r.kind === 'term' ? r.total : Number.isFinite(r.cost) ? r.total - r.cost : null;
    fx.push({ type: 'signed', kind: r.kind, profit });
  }
  // Chips that just landed in a card's slots (and the ones that just left).
  const drops = [];
  for (const [key, n] of Object.entries(after.held)) { const was = before.held[key] ?? 0; if (n > was) { const [card, gpu] = key.split('|'); drops.push({ card, gpu, from: was, to: n }); } }
  if (drops.length) fx.push({ type: 'reserve', drops });
  else if (Object.entries(before.held).some(([k, n]) => (after.held[k] ?? n) < n)) fx.push({ type: 'release' });
  if (after.built && !before.built) fx.push({ type: 'build' });
  if (after.cash !== before.cash) fx.push({ type: 'cash', from: before.cash, to: after.cash });
  if (after.valuation !== before.valuation && Number.isFinite(before.valuation) && Number.isFinite(after.valuation)) fx.push({ type: 'valuation', from: before.valuation, to: after.valuation });
  const arrived = [...after.live].filter(id => !before.live.has(id));
  if (arrived.length) fx.push({ type: 'arrival', ids: arrived });
  const moved = Object.keys(after.quotes).filter(id => before.quotes[id] !== undefined && before.quotes[id] !== after.quotes[id] && id !== after.active);
  if (moved.length) fx.push({ type: 'moved', ids: moved });
  return fx;
}

function tween(el, from, to, ms = 520) {
  const final = el.textContent;
  if (reduced() || !Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
  const cents2 = /\.\d\d(?!\d)/.test(final), start = performance.now();
  const format = el.dataset.fxFormat === 'short' ? short : el.dataset.fxFormat === 'rate' ? n => `$${(n / 100).toFixed(2)}` : cents2 ? n => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : money;
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
      if (sound) fx.walked ? sound.alert() : fx.tier === 'hit' ? sound.bell({ strikes: fx.jackpot ? 3 : fx.precision === 'perfect' ? 2 : 1 }) : sound.buzz();
      if (fx.jackpot) sound?.clatter(12, .5);
    } else if (fx.type === 'arrive-desk') {
      pulse(root.querySelector('[data-fx-figure]'), 'fx-step-in');
    } else if (fx.type === 'contract') {
      pulse(root.querySelector('[data-fx-contract]'), 'fx-slide-up'); sound?.printer(.35);
    } else if (fx.type === 'signed') {
      pulse(root.querySelector('[data-fx-stamp]'), 'fx-stamp');
      pulse(root.querySelector('[data-fx-payoff]'), fx.profit === null ? 'fx-payoff-stock' : fx.profit >= 0 ? 'fx-payoff-win' : 'fx-payoff-loss');
      if (sound) { sound.stamp(); if (fx.profit > 0) setTimeout(() => sound.clatter(10, .35), 180); }
    } else if (fx.type === 'reserve') {
      // Each new chip drops into its slot, a beat apart, wherever the card is drawn.
      let k = 0;
      for (const d of fx.drops) for (let i = d.from; i < d.to; i++) {
        for (const el of root.querySelectorAll(`[data-slot="${CSS.escape(`${d.card}|${d.gpu}|${i}`)}"]`)) { el.style.setProperty('--drop', `${k * 70}ms`); pulse(el, 'fx-drop'); }
        k++;
      }
      for (const d of fx.drops) for (const el of root.querySelectorAll(`[data-card-id="${CSS.escape(d.card)}"]`)) if (el.classList.contains('is-ready')) pulse(el, 'fx-ready');
      sound?.tap();
    } else if (fx.type === 'release') {
      sound?.blip(660, .03);
    } else if (fx.type === 'build') {
      pulse(root.querySelector('[data-fx-stamp]'), 'fx-stamp');
      pulse(root.querySelector('[data-fx-payoff]'), 'fx-payoff-build');
      if (sound) { sound.stamp(); setTimeout(() => sound.bell({ strikes: 2, f: 880, ring: 1.4 }), 200); }
    } else if (fx.type === 'cash') {
      for (const el of root.querySelectorAll('[data-fx-cash]')) { tween(el, fx.from, fx.to, 700); pulse(el, fx.to > fx.from ? 'fx-cash-in' : 'fx-cash-out'); }
    } else if (fx.type === 'valuation') {
      for (const el of root.querySelectorAll('[data-fx-valuation]')) { tween(el, fx.from, fx.to, 800); pulse(el, fx.to > fx.from ? 'fx-cash-in' : 'fx-cash-out'); }
    } else if (fx.type === 'arrival' || fx.type === 'moved') {
      for (const id of fx.ids) pulse(root.querySelector(`[data-station-id="${CSS.escape(id)}"]`), fx.type === 'arrival' ? 'fx-arrive' : 'fx-moved');
      if (fx.type === 'arrival' && sound) sound.blip(1180, .03);
    }
  }
}
