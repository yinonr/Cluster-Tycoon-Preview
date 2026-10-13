// VENTURE MODE: the company's state and the contract book. Pure data and pure
// functions, no DOM and no storage (save.js persists what these return).
//
// A contract runs whole quarters: it starts the quarter it was signed if the
// GPUs arrive within 30 days, otherwise the next one (startQ), and is active
// for exactly termQ quarters (startQ ≤ q < endQ). Book entries come from
// three places, by `src`:
//   'cash'     signed on the floor, deposit of one quarter's payments up front
//   'capital'  signed on the floor, carried by the capital desk (fee every quarter)
//   'safe'     a Compute SAFE: compute for equity, no cash at all
// `optional: true` marks a deal that didn't count toward the board objective
// (signed after NEED MET, or not meeting the need sheet). It still serves,
// trains, costs and is marked to market like any other contract.

/* global structuredClone */
import { C, VENTURE_RULES } from './constants.js';
import { deck } from './events.js';
import { stream, clamp } from '../util.js';

export const termQOf = (term) => C.termQ[term] ?? Math.max(1, Math.round(term / 3));
export const startQOf = (delivery, q) => (delivery <= 30 ? q : q + 1);
export const active = (e, q) => q >= e.startQ && q < e.endQ;
export const burnAt = (q) => Math.round(C.burn0 * (1 + C.burnGrowth) ** (q - 1));
// A cash contract's payment for one quarter, to the dollar, and its deposit:
// one quarter of payments, never more than the whole contract.
export const payQ = (qty, rate) => Math.round(qty * rate * C.hoursQ);
export const depositFor = (qty, rate, termQ) => Math.min(termQ, C.depositQ) * payQ(qty, rate);

// What an entry costs per GPU-hour right now: the capital desk's fee floats with the CREDIT spread.
export const effNow = (s, e) => e.rate + (e.financed ? e.fee + s.spread : 0);

// A deal signed on the floor (mode.lotDeal / auctionDeal) as a book entry.
export function bookEntry(deal, q, idx) {
  const termQ = termQOf(deal.term);
  const startQ = startQOf(deal.delivery, q);
  const financed = !!deal.financed;
  const value = termQ * payQ(deal.qty, deal.rate);
  return {
    id: deal.id ?? `q${q}-${idx}`,
    q,
    src: financed ? 'capital' : 'cash',
    gpu: deal.gpu,
    qty: deal.qty,
    rate: deal.rate,
    fee: financed ? deal.fee ?? C.fee[deal.term] : 0, // the base fee; the spread floats on top
    eff: deal.eff ?? deal.rate,                       // as signed, for the board's price check
    financed,
    term: deal.term,
    termQ,
    delivery: deal.delivery,
    startQ,
    endQ: startQ + termQ,
    firm: deal.firm || '',
    archetype: deal.archetype || '',
    auction: !!deal.auction,
    optional: !!deal.optional,
    value,                                            // qty × rate × hours over the term
    deposit: financed ? 0 : depositFor(deal.qty, deal.rate, termQ),
    remaining: value,                                 // contract value not yet run (unfinanced payments)
  };
}

export function newVenture({ seed, player = {}, dev = false, now = null, id = null }) {
  const st = C.start;
  const start = bookEntry({ id: 'start', gpu: st.gpu, qty: st.qty, rate: st.rate, term: st.term, delivery: 0, financed: false, firm: st.firm, archetype: 'start' }, 1, 0);
  start.deposit = 0; // signed before the venture began: paid as it runs
  return {
    id: id || `v${seed}`,  // the save gives each venture its own id (same seed twice = two ventures)
    seed,
    rules: VENTURE_RULES,
    persona: 'startup',
    dev: !!dev,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    player: { name: player.name || 'You', firm: player.firm || 'Your company' },
    q: 1,
    phase: 'memo',           // memo → briefed → floor → close → report → memo … → over
    cash: C.cash0,
    cashQ: C.cash0,          // cash when the quarter opened (the report's first line)
    burn: burnAt(1),
    bridges: 0,
    dead: false,
    model: { level: 1, progress: 0 },
    demand: C.D0,
    market: { ...C.bench0 },
    regime: stream(seed, 'regime').pick(C.regimes).id,
    priceMult: 1,            // RIVAL: 0.88 until your next launch
    spread: 0,               // CREDIT: added to every financed contract's fee
    lineMul: 1,              // CREDIT: the capital line shrinks
    pending: { enterprise: false, power: false, crunch: false, glut: false, demand: false }, // cards in force next quarter
    book: [start],
    capTable: { founderPct: 100, holders: [] },
    met: 0,
    missed: 0,
    memo: null,              // { q, options, rumor, offers, chosen }
    floor: null,             // { q, seed, objective, mandate, deals, startedAt, ended, result }
    lastReport: null,
    history: [],
    events: { deck: deck(seed), i: 0, next: null },
    exit: null,
  };
}

// Online compute in quarter q: GPUs, serving power and training power.
export function capacity(s, q) {
  const out = { gpus: 0, serve: 0, train: 0 };
  for (const e of s.book) {
    if (!active(e, q)) continue;
    out.gpus += e.qty;
    out.serve += e.qty * C.serve[e.gpu];
    out.train += e.qty * C.train[e.gpu];
  }
  return out;
}

// Contract payments for the quarters after `afterQ`, at today's effective rates.
export function obligations(s, afterQ, filter = () => true) {
  let sum = 0;
  for (const e of s.book) {
    if (!filter(e)) continue;
    const quarters = Math.max(0, e.endQ - Math.max(e.startQ, afterQ + 1));
    sum += e.qty * effNow(s, e) * C.hoursQ * quarters;
  }
  return Math.round(sum);
}

// The capital line: $13M (× 0.65 after CREDIT) + 0.85 × run-rate ARR, against
// the financed payments still owed from this quarter on.
export function runARR(s) {
  const last = s.history[s.history.length - 1];
  return Math.round(4 * (last ? last.revenue : C.start.qty * C.price[0] * C.hoursQ));
}
export const lineLimit = (s) => Math.round(C.line0 * s.lineMul + C.lineARR * runARR(s));
export const lineUsed = (s) => obligations(s, s.q - 1, (e) => e.financed);
export const lineLeft = (s) => Math.max(0, lineLimit(s) - lineUsed(s));

// $ per served GPU-eq hour this quarter.
export function priceNow(s) {
  const k = C.priceFollowsCompute;
  return C.price[s.model.level - 1] * (1 - k + k * s.market.H100 / C.bench0.H100) * s.priceMult;
}

// The exit's multiple on ARR: growth over the last two quarters, model level,
// gross margin and missed objectives.
export function multiple(s, { g = 0, gm = C.exit.gmRef } = {}) {
  const E = C.exit;
  return clamp(E.base + E.kG * g, E.lo, E.hi) * E.model[s.model.level - 1] * marginFactor(gm) * (1 - C.missPenalty * s.missed);
}

// Gross margin on the exit multiple: 1 at gmRef, kGM per unit of margin
// either side. Margin is set on the floor: what you paid for the compute that
// serves your customers.
export const marginFactor = (gm) => clamp(1 + C.exit.kGM * (gm - C.exit.gmRef), C.exit.gmLo, C.exit.gmHi);

// What an investor would call the company today (SAFE pricing): run-rate ARR
// × the exit multiple on the growth and margin so far.
export function valuationEstimate(s) {
  const h = s.history;
  const last = h[h.length - 1];
  const back = h[h.length - 3];
  const g = last && back && back.revenue > 0 ? last.revenue / back.revenue - 1 : 0;
  const gm = last && last.revenue > 0 ? (last.revenue - last.cogs) / last.revenue : C.exit.gmRef;
  return Math.round(runARR(s) * multiple(s, { g, gm }));
}

// A new holder on the cap table gets pct of the company after the deal.
// Everyone already on it (the founder and earlier investors alike) is diluted
// by the same factor, so the table always adds up to 100%. A holder's `pct` is
// what they own now; `granted` is what they got when they came in.
export function grant(capTable, holder) {
  const keep = 1 - holder.pct / 100;
  return {
    founderPct: capTable.founderPct * keep,
    holders: [...capTable.holders.map((h) => ({ ...h, pct: h.pct * keep })), { ...holder, granted: holder.pct }],
  };
}

// Founder + holders, in percent (100 up to float error).
export const capTotal = (capTable) => capTable.founderPct + capTable.holders.reduce((t, h) => t + h.pct, 0);

// A deep copy of plain data (state, mandates, deals).
export const clone = (s) => structuredClone(s);
