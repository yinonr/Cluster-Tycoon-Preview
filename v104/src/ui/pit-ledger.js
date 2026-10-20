// Pure derived facts for the Broker's Desk. Every value is an engine record or exact
// arithmetic of recorded fields (tape, leverage, attempts, receipts). Nothing here writes
// state, ranks counterparties, or invents a number the engine did not record.
import { CHARM_RULES } from '../tycoon/rizz.js';
import { cents, V7 } from '../tycoon/arcade.js';
import { outlook, stageName, VENTURE } from '../tycoon/ventures.js';
import { buyerLive } from '../tycoon/arcade-buyers.js';
import { PHASES, BID, WHALE, whaleRound, whalePremium } from '../tycoon/score-market.js';

export const money = n => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const signed = n => `${n < 0 ? '−' : n > 0 ? '+' : '±'}${money(Math.abs(n))}`;
export const rate = n => `$${(n / 100).toFixed(2)}`;
export const centsPerHour = n => `${Math.abs(n)}¢/h`;

// The latest thing the supplier did, as one event. Charm attempts only exist once ordinary
// bargaining is over, so the newest attempt (if any) is always the newest event.
export function supplierNews(l) {
  const n = l?.negotiation;
  if (!n) return null;
  const entry = n.attempts.at(-1), reply = [...n.tape].reverse().find(t => t.speaker !== 'YOU');
  if (n.running) return { kind: 'running', mood: 'thinking' };
  if (entry?.status === 'resolved') {
    const tier = entry.tier, gone = entry.walked || tier === 'expired';
    return { kind: 'charm', entry, tier, before: entry.before, after: entry.after,
      mood: gone ? 'gone' : tier === 'hit' ? 'pleased' : 'annoyed' };
  }
  const outcome = reply?.outcome;
  if (!outcome) return { kind: 'opening', mood: n.posture === 'firm' ? 'thinking' : 'neutral' };
  const mood = { accept: 'pleased', beat: 'pleased', counter: 'talking', match: 'talking', hold: 'annoyed', decline: 'annoyed', walk: 'gone', expired: 'gone' }[outcome] || 'neutral';
  return { kind: ['match', 'beat', 'decline'].includes(outcome) ? 'rival' : 'reply', outcome, before: reply.before, after: reply.after, mood };
}

// Buyer moods from the buyer's own recorded reply.
export function buyerMood(b, live) {
  if (!live) return 'gone';
  const outcome = b.negotiation.tape.at(-1)?.outcome;
  return { accept: 'pleased', counter: 'talking', hold: 'annoyed', walk: 'gone', expired: 'gone' }[outcome] || 'eager';
}

// Meter geometry, as percentages of the meter width, from the attempt's own parameters and the
// shared rules. resolveRizz: hit when |pos−.5| ≤ width/2; accuracy = 1 − |pos−.5|/(width/2);
// PERFECT at accuracy ≥ .8 (the centre 20% of the target), STRONG at ≥ .4 (the centre 60%).
const PERFECT_CORE = 1 - .8, STRONG_CORE = 1 - .4;
export function meterBands(p) {
  const w = p.width, clamp = x => Math.max(0, Math.min(1, x));
  const span = half => { const a = clamp(.5 - half), b = clamp(.5 + half); return { left: +(a * 100).toFixed(3), width: +((b - a) * 100).toFixed(3) }; };
  return {
    miss: span(w / 2 + CHARM_RULES.missDistance),
    near: span(w / 2 + CHARM_RULES.nearDistance),
    target: span(w / 2),
    strong: span(w * STRONG_CORE / 2),
    perfect: span(w * PERFECT_CORE / 2),
  };
}

// A resolved attempt, read back as a stamp. Labels come from the recorded tier/precision/walked.
export function verdictOf(entry, qty) {
  if (!entry || entry.status !== 'resolved') return null;
  const stamp = entry.tier === 'expired' ? 'EXPIRED' : entry.walked ? 'WALKED' : entry.tier === 'hit' ? String(entry.precision || 'edge').toUpperCase()
    : ({ near: 'NEAR MISS', miss: 'MISSED', severe: 'SEVERE' })[entry.tier] || 'MISSED';
  const tone = entry.tier === 'hit' ? 'hit' : entry.tier === 'near' ? 'near' : 'miss';
  const perHour = entry.after - entry.before;
  return { stamp, tone, perHour, total: cents(qty, perHour), trust: entry.trust || 0, clout: entry.clout || 0,
    position: Number.isFinite(entry.position) ? entry.position : null, interrupted: !!entry.interrupted, timeCost: entry.timeCost };
}

// Recorded Charm consequences on this desk (attempts[] only). A haggle walkout records no
// Trust loss on the tape, so a desk without attempts reports nothing numeric.
export function charmLosses(n, qty) {
  const used = (n?.attempts || []).filter(a => a.status === 'resolved');
  if (!used.length) return null;
  const gaveBack = used.filter(a => a.tier !== 'hit' && a.tier !== 'expired').reduce((s, a) => s + Math.max(0, a.after - a.before), 0);
  return { attempts: used.length, gaveBack: cents(qty, gaveBack), trust: used.reduce((s, a) => s + (a.trust || 0), 0), clout: used.reduce((s, a) => s + (a.clout || 0), 0),
    seconds: used.reduce((s, a) => s + (a.timeCost || 0), 0) };
}

// Sale payoff: realized profit is exactly revenue − FIFO cost. The bar is proportional:
// the grey part is the smaller of cost and revenue, the coloured tail is |profit|.
export function salePayoff(d) {
  const revenue = d.total, cost = d.cost, profit = revenue - cost, top = Math.max(revenue, cost, 1);
  return { revenue, cost, profit, win: profit >= 0,
    costRate: cost / (d.qty * V7.hours), soldRate: Number.isFinite(d.rate) ? d.rate : revenue / (d.qty * V7.hours),
    base: +(Math.min(revenue, cost) / top * 100).toFixed(2), tail: +(Math.abs(profit) / top * 100).toFixed(2) };
}

// Purchase payoff: inventory acquired and cash paid; savings is the signed document's own field.
export function purchasePayoff(d) {
  return { qty: d.qty, gpu: d.gpu, paid: d.total, savings: Number.isFinite(d.savings) ? d.savings : 0 };
}

// ---- V10.4 Score Attack: ventures, round news, the whale, the final books -----------------
// Still pure: every figure is an engine record (ventures.js, score-market.js, arcade.score)
// or exact arithmetic of one. Odds come only from ventures.outlook; nothing here ranks a
// choice for the player or invents a probability.

export const phaseName = q => PHASES[Math.max(1, Math.min(V7.rounds, q))]?.name || '';
export const odds = p => `${Math.round(p * 100)}%`;
export const stakePct = s => `${(s * 100).toFixed(s > 0 && s < .001 ? 3 : s < .1 ? 2 : 1)}%`;
// Valuations are whole dollars in the engine; marks are shown short, cash always exact.
export function short(c) {
  const d = Math.abs(c) / 100, sign = c < 0 ? '−' : '';
  if (d >= 1e6) return `${sign}$${(d / 1e6).toFixed(d >= 1e7 ? 1 : 2)}M`;
  if (d >= 1e4) return `${sign}$${Math.round(d / 1000)}k`;
  return money(c);
}
export const paperOf = s => Math.floor(s.stake * s.val * 100);
export const liveCompanies = g => g.startups.filter(s => s.alive && !s.exited);
export const orderOf = (g, s) => g.arcade.orders.find(o => o.client === s.id) || null;
export { stageName };

// The one speed rule: the whole order before second VENTURE.early counts as early.
export function earlyState(g, o) {
  const at = o?.early ?? VENTURE.early, t = g.arcade.time;
  if (!o) return { kind: 'none', at };
  if (o.earlyMet) return { kind: 'met', at };
  if (t >= at || g.phase !== 'floor') return { kind: 'closed', at };
  return { kind: 'open', at, left: at - t };
}

// Odds now, and if you deliver qty more right now (early only when that completes the order
// before the deadline). Ownership never enters: these are the company's odds, not yours.
export function ventureOdds(g, s, o, qty = 0) {
  const now = outlook(s, o), delivered = Math.min(o.qty, o.delivered + Math.max(0, qty));
  const early = delivered >= o.qty && (o.earlyMet || (g.phase === 'floor' && g.arcade.time < (o.early ?? VENTURE.early)));
  return { now, next: outlook(s, o, { delivered, early }), early, delivered };
}

// The best funded outside bid for these GPUs right now: same GPU, live, budget-limited.
// The whale counts; its completion bonus only when this sale would complete its order.
export function outsideBid(g, gpu, qty) {
  let best = null;
  for (const b of g.arcade.buyers) {
    if (b.gpu !== gpu || !buyerLive(g, b)) continue;
    const n = Math.max(0, Math.min(qty, b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))));
    if (!n) continue;
    const bonus = b.whale && !b.whale.paid && b.filled + n === b.qty ? b.whale.bonus : 0, revenue = cents(n, b.rate) + bonus;
    if (revenue > b.budget) continue;
    if (!best || revenue > best.revenue) best = { buyer: b, qty: n, revenue, bonus };
  }
  return best;
}

// The whale's premium against this phase's market bid, as generated (score-market.js).
export function whaleFacts(g, b) {
  const market = Math.round(BID[b.gpu] * (1 + PHASES[g.q].drift));
  return { market, premium: b.whale.premium, clout: b.whale.clout, bonus: b.whale.bonus, paid: b.whale.paid, left: b.qty - b.filled, filled: b.filled, qty: b.qty };
}
export const whaleNext = g => g.phase === 'report' && whaleRound(g.seed) === g.q;
// Before the whale: its round window, the premium your Clout earns now and the next tier.
export function whaleOutlook(g) {
  if (g.phase !== 'report' || g.q > whaleRound(g.seed) || g.q < 5) return null;
  const clout = Math.max(0, Math.round(g.clout)), next = WHALE.premium.find(([c]) => c > clout);
  return { next: whaleRound(g.seed) === g.q, clout, premium: whalePremium(clout), tier: next ? { clout: next[0], premium: next[1] } : null };
}

// Round news: one entry per company, straight from the settlement line.
export function newsEntry(g, line, orders = []) {
  const o = orders.find(x => x.client === line.id), inv = g.arcade.investments[line.id];
  const exit = line.exit, invested = inv?.invested || 0;
  const value = exit ? exit.proceeds : line.after.alive ? line.paperAfter : 0;
  const multiple = invested > 0 && value > 0 ? value / invested : 0;
  const kind = exit ? exit.kind : line.kind;
  return { id: line.id, name: line.name, kind, outcome: line.kind, multiple: line.multiple || 0, raise: line.raise || 0,
    valBefore: Math.round(line.before.val * 100), valAfter: Math.round(line.after.val * 100),
    stakeBefore: line.stakeBefore, stakeAfter: line.after.stake, paperBefore: line.paperBefore, paperAfter: line.paperAfter,
    lostStake: line.lostStake || 0, exit, backed: o ? { delivered: o.delivered, qty: o.qty, early: !!o.earlyMet } : null,
    invested, x: multiple, moment: multiple >= 10 };
}

// The final books: each company's fate in one line, from its own events and the ledgers.
export function fateOf(g, s) {
  const a = g.arcade, closing = (a.closing || []).find(c => c.id === s.id);
  const exitLine = a.history.flatMap(h => h.news || []).find(n => n.id === s.id && n.exit);
  const last = s.v104.events.at(-1);
  const kind = s.v104.exitKind || (closing ? 'closing' : 'live');
  return { name: s.name, kind, round: last?.q || s.v104.born, born: s.v104.born, events: s.v104.events, peak: Math.round(s.v104.peak * 100),
    proceeds: exitLine?.exit?.proceeds || closing?.proceeds || 0, mark: closing?.mark || 0, stake: closing?.stake || exitLine?.exit?.stake || 0 };
}

export function bestDeal(best) {
  if (!best) return null;
  // record() spreads its meta over the entry, so an exit's kind arrives as 'ipo' or 'acquired'.
  const exit = ['exit', 'ipo', 'acquired'].includes(best.kind);
  const what = exit ? `${best.company} ${best.kind === 'ipo' ? 'IPO' : best.kind === 'acquired' ? 'acquisition' : 'exit'}`
    : best.kind === 'secondary' ? `${best.company} shares to a VC`
    : best.kind === 'closing' ? `${best.company} stake at the bell`
    : best.buyer ? `${best.qty} ${best.gpu} to ${best.buyer}${best.whale ? ' (the whale)' : ''}` : `${best.qty} ${best.gpu} to ${best.company}`;
  return { round: best.q, what, amount: best.amount, label: best.kind === 'trade' ? 'profit' : 'cash' };
}
