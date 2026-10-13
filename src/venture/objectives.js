// VENTURE MODE: the board memo and its objectives. Each quarter the board
// offers 2–3 objectives generated from the company's state; the one you pick
// becomes the floor's need sheet (toMandate). Meeting it is a milestone, not
// the end of the floor: NEED MET keeps trading, and every deal after it, or
// any deal that doesn't meet the sheet, goes into the book as optional.
//
//   SCALE  enough GPUs to serve next quarter's demand (H100/H200, 30 days, 6+ months)
//   TRAIN  H200 or B200 for the next model (30 days, 6+ months), while below v4
//   PILOT  a customer pays up front and adds demand, but needs GPUs within 7 days on 12+ months
//          (not offered while POWER is in force: nothing on that floor is live within a week)
//   LOCK   next year's base load on 24 months: the market-direction bet
//
// Randomness: stream(vs, 'memo', q) for the memo, drawn in a fixed order
// whatever the state, so the same venture shows the same memo.

import { C } from './constants.js';
import { capacity } from './state.js';
import { nextCard, DECK } from './events.js';
import { safeOffers } from './safe.js';
import { stream, round2, clamp, usd, int } from '../util.js';

const O = C.objectives;
const ceilTo = (n, step) => Math.ceil(n / step) * step;
const qtyIn = (n, lo, hi) => clamp(ceilTo(Math.max(n, lo), O.qtyStep), lo, hi);
const floor500k = (n) => Math.max(0, Math.floor(n / 5e5) * 5e5);
const M = (n) => `$${(n / 1e6).toFixed(1)}M`;

export const OBJECTIVES = ['SCALE', 'TRAIN', 'PILOT', 'LOCK'];

// The board memo for the quarter s.q: { q, options, rumor, offers, chosen }.
export function boardMemo(s) {
  const rng = stream(s.seed, 'memo', s.q);
  const rPilot = rng.next(), rLock = rng.next(), rDrop = rng.next(), rOrder = rng.next(), rRumor = rng.next(), rDecoy = rng.next();
  const D = s.demand;
  const lvl = s.model.level;
  const out = [];

  const scaleGap = O.scale.cover * D * (1 + C.growth) - capacity(s, s.q + 1).serve;
  out.push({
    type: 'SCALE', gpu: 'H100', accept: ['H100', 'H200'], qty: qtyIn(scaleGap, O.scale.min, O.scale.max),
    deliveryDays: O.scale.deliveryDays, minTerm: O.scale.minTerm, power: 'serve',
    brief: `Serve next quarter's demand: about ${int(D * (1 + C.growth))} GPU-eq forecast, ${int(capacity(s, s.q + 1).serve)} contracted.`,
  });
  if (lvl < 4) {
    const need = C.thresholds[lvl - 1] - s.model.progress;
    out.push({
      type: 'TRAIN', gpu: 'H200', accept: ['H200', 'B200'], qty: qtyIn(need / O.train.perUnit, O.train.min, O.train.max),
      deliveryDays: O.train.deliveryDays, minTerm: O.train.minTerm, power: 'train',
      brief: `Train model v${lvl + 1}: ${int(Math.max(0, need))} training units to go.`,
    });
  }
  const pilot = () => {
    const qty = lvl === 1 ? O.pilot.qty[0] : O.pilot.qty[1];
    const bonus = O.pilot.bonus * (s.pending.enterprise ? C.ev.enterprise : 1);
    return {
      type: 'PILOT', gpu: 'H100', accept: ['H100', 'H200', 'B200'], qty,
      deliveryDays: O.pilot.deliveryDays, minTerm: O.pilot.minTerm, power: 'serve', bonus,
      brief: `A pilot customer pays ${M(bonus)} up front and brings ${int(O.pilot.demandPerGpu * qty)} GPU-eq of demand, if the GPUs are live within ${O.pilot.deliveryDays} days.`,
    };
  };
  const lockGap = O.lock.base * D * (1 + C.growth) ** 2 - capacity(s, s.q + 2).serve;
  const lock = () => ({
    type: 'LOCK', gpu: 'H100', accept: ['H100'], qty: qtyIn(lockGap, O.lock.min, O.lock.max),
    deliveryDays: O.lock.deliveryDays, minTerm: O.lock.minTerm, power: 'serve',
    brief: `Lock next year's base load on 24 months: about ${int(Math.max(0, lockGap))} GPU-eq not yet contracted.`,
  });
  // No 7-day pilot while POWER holds the grid (ENTERPRISE and POWER are never both pending).
  if (s.pending.enterprise || (rPilot < O.pilot.chance && !s.pending.power)) out.push(pilot());
  if (rLock < O.lock.chance && lockGap >= O.lock.minGap) out.push(lock());
  // At v4 there is nothing left to train: the board still gives you a choice.
  if (out.length < 2) out.push(s.pending.power ? lock() : pilot());
  while (out.length > 3) out.splice(1 + Math.floor(rDrop * (out.length - 1)), 1); // SCALE always stays
  // Display order is seeded, so "always take the first one" is a random pick.
  const k = Math.floor(rOrder * out.length);
  const options = [...out.slice(k), ...out.slice(0, k)];
  for (const o of options) o.payoff = o.type === 'PILOT' ? `${M(o.bonus)} up front + demand` : `${M(C.tranche)} tranche, × price quality`;

  const next = nextCard(s);
  const others = DECK.filter((id) => id !== next);
  const rumor = next ? (rRumor < C.rumorAcc ? next : others[Math.floor(rDecoy * others.length)]) : null;
  return { q: s.q, options, rumor, offers: safeOffers(s), chosen: null };
}

export const optionOf = (memo, type) => (memo && memo.options.find((o) => o.type === type)) || null;

// The need sheet for an objective. market: the floor's (tilted) market; base:
// the daily need sheet createRun drew anyway (kept for its sector line);
// money: what the company can put down today.
export function toMandate(obj, market, base, { player, cash, lineLeft, q }) {
  const target = round2(market.bench[obj.gpu] - 0.12);
  return {
    company: player.firm,
    sector: base.sector,
    stage: `Q${q} of ${C.quarters}`,
    objective: obj.type,
    q,
    gpu: obj.gpu,
    accept: obj.accept.slice(),
    qty: obj.qty,
    deliveryDays: obj.deliveryDays,
    minTerm: obj.minTerm,
    power: obj.power,                     // other GPUs are priced per serving (or training) unit of obj.gpu
    target,
    walk: round2(target + 0.15),
    budget: floor500k(cash),              // cash for deposits
    capitalLine: floor500k(lineLeft),     // what the capital desk will still carry
    payment: 'Cash deals put one quarter down. The capital desk carries the rest, for a fee every quarter.',
  };
}

// The need sheet's lines without a floor (the quarter's floor was skipped):
// what evaluate() needs to judge SAFE compute against the objective.
export function sheetOf(obj, s) {
  const target = round2(s.market[obj.gpu] - 0.12);
  return { objective: obj.type, q: s.q, gpu: obj.gpu, accept: obj.accept.slice(), qty: obj.qty, deliveryDays: obj.deliveryDays, minTerm: obj.minTerm, power: obj.power, target, walk: round2(target + 0.15) };
}

// Does a deal (or a SAFE entry) meet the need sheet's lines?
export const legalFor = (md, d) => md.accept.includes(d.gpu) && d.delivery <= md.deliveryDays && d.term >= md.minTerm;

// A deal's rate per unit of the sheet's GPU: an H200 on an H100 sheet is
// priced per serving unit (÷ 1.3), a B200 on a TRAIN sheet per training unit.
export function equivRate(md, gpu, eff) {
  if (gpu === md.gpu) return eff;
  const P = md.power === 'train' ? C.train : C.serve;
  return round2((eff * P[md.gpu]) / P[gpu]);
}

// The Floor Score v2 price factor, 0..1 (0.40 at target, 1 at 15¢ under, 0 at walk).
export function priceFactor(md, d) {
  if (!legalFor(md, d)) return 0;
  const e = equivRate(md, d.gpu, d.eff);
  if (e >= md.walk) return 0;
  if (e <= md.target) return 0.40 + 0.60 * Math.min(1, (md.target - e) / 0.15);
  return (0.40 * (md.walk - e)) / (md.walk - md.target);
}

// The order the board counts things in: SAFE compute taken before the floor,
// then the floor's deals in signing order, with SAFE compute taken on the floor
// slotted in where it was taken (e.seq = deals signed by then). So a SAFE taken
// after a deal can't push that deal out of the count (no tranche farming).
export function boardOrder(safes, deals) {
  const later = safes.filter((e) => e.seq != null);
  const out = safes.filter((e) => e.seq == null);
  deals.forEach((d, i) => { out.push(...later.filter((e) => e.seq === i), d); });
  out.push(...later.filter((e) => e.seq >= deals.length));
  return out;
}

// What met the objective. items: this quarter's SAFE entries, then the floor's
// deals in signing order. A legal item counts until the need is met; every
// other item is optional. SAFE compute counts at the neutral price quality.
export function evaluate(md, items) {
  let secured = 0, safeQty = 0, wq = 0;
  const counted = [], optional = [];
  let weight = 0;
  for (const d of items) {
    if (secured >= md.qty || !legalFor(md, d)) { optional.push(d.id); continue; }
    counted.push(d.id);
    // Price quality is weighted by what each item did for the need: the
    // quantity past it doesn't count (a big cheap block can't buy the tranche).
    const w = Math.min(d.qty, md.qty - secured);
    secured += d.qty;
    if (d.src === 'safe') safeQty += d.qty;
    weight += w;
    wq += w * (d.src === 'safe' ? C.trancheQ.safe : priceFactor(md, d));
  }
  return { met: secured >= md.qty, secured, need: Math.max(0, md.qty - secured), safeQty, q: weight ? wq / weight : 0, counted, optional };
}

// What the board pays for an objective, given evaluate()'s result.
export function payoff(obj, result) {
  if (!obj || !result || !result.met) return { met: false, cash: 0, demand: 0, mult: 0 };
  if (obj.type === 'PILOT') return { met: true, cash: Math.round(obj.bonus), demand: O.pilot.demandPerGpu * obj.qty, mult: 1 };
  const mult = C.trancheQ.base + C.trancheQ.k * result.q;
  return { met: true, cash: Math.round(C.tranche * mult), demand: 0, mult };
}

// One plain line for the report.
export function objectiveLine(obj, md, result, pay) {
  if (!obj) return 'No board objective this quarter. The exit multiple takes 6% off.';
  const sec = result ? result.secured : 0;
  const got = sec > obj.qty ? `${int(sec)} GPUs against a need of ${int(obj.qty)}` : `${int(sec)} of ${int(obj.qty)}`;
  if (!pay.met) return `${obj.type} missed: ${got} ${obj.gpu}-class GPUs secured. No board money, and the exit multiple takes ${Math.round(C.missPenalty * 100)}% off.`;
  if (obj.type === 'PILOT') return `PILOT live: ${M(pay.cash)} up front and ${int(pay.demand)} GPU-eq of new demand.`;
  const safe = result.safeQty ? `, ${int(result.safeQty)} of them from a SAFE` : '';
  return `${obj.type} met: ${got}${safe}, priced at ${Math.round(result.q * 100)}% quality (target ${usd(md.target)}). Board tranche ${M(pay.cash)}.`;
}
