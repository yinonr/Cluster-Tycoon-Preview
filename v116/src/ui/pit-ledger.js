// Pure derived facts for the Founder's desk. Every value is an engine record or exact
// arithmetic of recorded fields (tape, attempts, receipts, the company, the bell reports).
// Nothing here writes state, ranks counterparties, or invents a number the engine did not record.
import { CHARM_RULES } from '../tycoon/rizz.js';
import { cents, V7 } from '../tycoon/arcade.js';
import { FOUNDER, MODEL_NAMES, LANE, openCards, revenueOf, revenueNow, totalShares, opsOf, agiOdds, BOOSTS, boostMet } from '../tycoon/founder.js';
import { PHASES } from '../tycoon/founder-market.js';

export const money = n => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const signed = n => `${n < 0 ? '−' : n > 0 ? '+' : '±'}${money(Math.abs(n))}`;
export const rate = n => `$${(n / 100).toFixed(2)}`;
export const centsPerHour = n => `${Math.abs(n)}¢/h`;
// Paper values (valuation, EV, payouts) read short; cash always reads exact.
export function short(c) {
  const d = Math.abs(c) / 100, sign = c < 0 ? '−' : '';
  if (d >= 1e9) return `${sign}$${(d / 1e9).toFixed(d >= 1e10 ? 1 : 2)}B`;
  if (d >= 1e6) return `${sign}$${(d / 1e6).toFixed(d >= 1e7 ? 1 : 2)}M`;
  if (d >= 1e4) return `${sign}$${Math.round(d / 1000)}k`;
  return money(c);
}
// Ownership: a share of the cap table, one decimal (two when it is small).
export const pctOf = p => p >= .99995 ? '100%' : `${(p * 100).toFixed(p < .1 ? 2 : 1)}%`;
export const bpsText = b => `${(b / 100).toFixed(b % 100 ? (b % 10 ? 2 : 1) : 0)}%`;
export const phaseName = q => PHASES[Math.max(1, Math.min(V7.rounds, q))]?.name || '';
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---- Objective cards ------------------------------------------------------------------------
export const laneOf = card => (card.lane in LANE ? card.lane : 'opportunity');
export const laneLabel = card => card.scenario ? (card.scenario.total > 1 ? `${card.scenario.label} ${card.scenario.stage + 1}/${card.scenario.total}` : card.scenario.label) : card.strategic ? `Stage ${card.strategic.stage + 1}/${card.strategic.total}` : card.lane === 'opportunity' ? ({ pilot: 'Pilot', rush: 'Rush', partner: 'Partnership', contract: 'Customer', benchmark: 'Benchmark', arbitrage: 'Arbitrage', licensing: 'Licensing', capacity: 'Capacity' }[card.kind] || 'Opportunity') : LANE[card.lane].label;
const pct = x => `${Math.round(x * 100)}%`;
// What the card does to the company, in the card's own reward terms (exact at today's model).
export function rewardLine(g, card) {
  if (card.moonshot !== undefined) return `${card.moonshot ? 'Training' : 'Cluster'} · ${short(card.cashCost || 0)} capital`;
  const R = card.reward || {}, c = g.company, q = (1 + FOUNDER.quality * c.level) * (1 + opsOf(c).serving);
  // V10.16: a met combination is already in the quoted number.
  const boost = card.boost && boostMet(c, card.boost) ? 1 + BOOSTS[card.boost].pct : 1;
  if (R.revenue) return `+${money(Math.round(R.revenue * q * boost))}/round ${card.scenario?.contract || card.contract ? 'contract revenue' : 'revenue'}`;
  if (R.ip) return `+${short(R.ip)} research IP`;
  if (R.level) return `Model → ${MODEL_NAMES[R.level]}`;
  if (R.agi) { const o = agiOdds(g); return `AGI ${pct(o.agi)} · partial ${pct(o.partial)} · fail ${pct(o.failure)}`; }
  if (R.rack) return `+${R.rack.qty} ${R.rack.gpu} every round${R.lease ? ` · +${short(Math.round(R.lease * q))}/rd lease` : ''}`;
  if (R.lease) return `+${short(Math.round(R.lease * q))}/round lease`;
  if (R.cash) return `+${money(R.cash)} cash`;
  if (R.hype) return `Breakthrough · +${short(Math.round(FOUNDER.value.partnershipIp * FOUNDER.tech[Math.max(1, c.level)]))} research IP`;
  return '';
}
// Other open cards that draw on the same GPU types: the competition for every unit.
export function competesWith(g, card) {
  return openCards(g).filter(o => o.id !== card.id && Object.keys(o.recipe).some(k => card.recipe[k]));
}
export const reservedOf = (g, gpu) => g.arcade.reservations.filter(r => r.gpu === gpu).reduce((n, r) => n + r.qty, 0);
export const rackStock = (g, gpu) => g.arcade.inventory.filter(x => x.produced && x.gpu === gpu).reduce((n, x) => n + x.left, 0);

// The company change a build made, read from the build record and the company now.
export function buildChange(g, b) {
  if (b.moonshot !== undefined) return { tone: b.moonshotOutcome === 'setback' ? 'setback' : 'research', head: b.moonshotOutcome || (b.status === 'online' ? 'Cluster ready' : 'Integrating'), text: b.moonshotOutcome ? 'See the Frontier program for the outcome' : 'Frontier commitment; capital and GPUs spent' };
  const c = g.company, R = b.reward || {};
  if (b.status === 'integrating') return { tone: 'mixed', head: 'Integrating', text: 'Comes online at the bell' };
  if (b.status === 'training') return { tone: 'research', head: 'Training', text: 'Result at the bell · a fast close helps' };
  if (R.revenue) {
    const p = c.products.find(p => p.build === b.id), m = 1 + FOUNDER.quality * c.level, S = revenueOf(c);
    const add = p ? revenueNow(c) - Math.round((S - Math.round(p.revenue * p.online)) * m) : 0;
    return { tone: 'product', head: `+${money(add)}/round`, text: `Revenue now ${money(revenueNow(c))} a round` };
  }
  if (R.agi) {
    const o = b.agiOutcome, A = FOUNDER.agi;
    return !o ? { tone: 'mixed', head: 'Racked', text: `The attempt runs once ${Math.round(FOUNDER.researchOnline * 100)}% is online` }
      : o === 'agi' ? { tone: 'research', head: 'AGI', text: `General intelligence (fictional) · +${short(A.tech)} technology value, +${Math.round((A.revenue - 1) * 100)}% revenue` }
      : o === 'partial' ? { tone: 'research', head: 'Superhuman researcher', text: `Partial success · +${short(A.partialTech)} technology value` }
      : { tone: 'setback', head: 'AGI attempt failed', text: `The capital is spent · remediation ${short(A.failBurn)} a round for ${A.failRounds} rounds` };
  }
  if (R.level) {
    if (b.result === 'breakthrough') return { tone: 'research', head: 'Breakthrough', text: `Model → ${MODEL_NAMES[c.level]}${b.ipPaid ? ` · +${short(b.ipPaid)} research IP` : ''}` };
    if (b.result === 'setback') return { tone: 'setback', head: 'Setback', text: `Model stays ${MODEL_NAMES[c.level]}. The run returns next round.` };
    return { tone: 'research', head: `Model → ${MODEL_NAMES[c.level]}`, text: 'Solid training run' };
  }
  if (R.rack) return { tone: 'infra', head: `+${R.rack.qty} ${R.rack.gpu}/round`, text: R.lease ? `Fleet delivers from next round · lease ${money(Math.round(R.lease * (1 + FOUNDER.quality * c.level) * (1 + opsOf(c).serving)))}/round` : 'Your rack delivers from next round' };
  if (R.ip) return { tone: 'research', head: `+${short(b.ipPaid || R.ip)} IP`, text: 'Research IP, kept in your valuation' };
  if (R.lease) return { tone: 'infra', head: `+${short(R.lease)}/round`, text: 'Lease revenue from your racks' };
  if (R.cash) return { tone: 'opportunity', head: `+${money(b.paid || R.cash)}`, text: 'Prize paid to company cash' };
  if (R.hype) return { tone: 'opportunity', head: 'Breakthrough', text: b.ipPaid ? `+${short(b.ipPaid)} research IP` : 'Published together' };
  return { tone: 'plain', head: 'Built', text: '' };
}
export const runText = r => ({ breakthrough: 'Breakthrough', solid: 'Solid run', setback: 'Setback' })[r] || '';

// Cap-table effect of a percentage the founder is drafting (same arithmetic as investors.termQuote).
export function draftOwnership(g, bps) {
  const c = g.company, total = totalShares(c), shares = Math.round(total * bps / (10000 - bps));
  return c.shares.founder / (total + shares);
}

// ---- Desk reactions (V10.3) ------------------------------------------------------------------
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

// Recorded Charm consequences on this desk (attempts[] only).
export function charmLosses(n, qty) {
  const used = (n?.attempts || []).filter(a => a.status === 'resolved');
  if (!used.length) return null;
  const gaveBack = used.filter(a => a.tier !== 'hit' && a.tier !== 'expired').reduce((s, a) => s + Math.max(0, a.after - a.before), 0);
  return { attempts: used.length, gaveBack: cents(qty, gaveBack), trust: used.reduce((s, a) => s + (a.trust || 0), 0), clout: used.reduce((s, a) => s + (a.clout || 0), 0),
    seconds: used.reduce((s, a) => s + (a.timeCost || 0), 0) };
}

// Resale payoff: realized profit is exactly revenue − FIFO cost. The bar is proportional:
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
