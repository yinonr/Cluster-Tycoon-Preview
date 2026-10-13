// VENTURE MODE: Compute SAFE. Investors offer real compute reservations for
// future equity: no cash, no deposit, no fee, but every grant shrinks your
// share of the exit. The player weighs three ways to get capacity: cash (a
// deposit plus quarterly payments), the capital desk (no deposit, a floating
// fee every quarter) and a SAFE (no cash; dilution).
//
// Offers: 0–2 a quarter from stream(vs, 'safe', q), listed on the board memo
// (and, from M2, at an investor desk on the floor). An offer expires at the
// end of that quarter's floor.
//   computeValue = qty × bench(gpu) × 2190 × termQ
//   preMoney     = max($40M, valuation estimate: run-rate ARR × multiple)
//   equityPct    = round1(100 × computeValue × premium / (preMoney + computeValue)), premium 1.25–1.6
// so equity is dear while the company is small and cheaper as it grows.
//
// Not modelled (deferred by design): legal SAFE terms (caps, discounts, MFN)
// and a SAFE auction.

import { C, INVESTORS } from './constants.js';
import { valuationEstimate, grant, clone } from './state.js';
import { stream, round2 } from '../util.js';

const round1 = (n) => Math.round(n * 10) / 10;
const OPEN = ['memo', 'briefed', 'floor'];

export function safeOffers(s) {
  const rng = stream(s.seed, 'safe', s.q);
  // Every number is drawn, in this order, whatever is kept: the same quarter
  // always shows the same offers.
  const n = rng.weighted(C.safe.count);
  const names = rng.shuffle(INVESTORS);
  const preMoney = Math.max(C.safe.preMoneyFloor, valuationEstimate(s));
  const Q = C.safe.qty;
  const out = [];
  for (let k = 0; k < 2; k++) {
    const gpu = rng.weighted(C.safe.gpu);
    const qty = Q.min + Q.step * rng.int(0, (Q.max - Q.min) / Q.step);
    const termQ = rng.pick(C.safe.termQ);
    const later = rng.chance(0.5) && s.q < C.quarters;
    const premium = round2(rng.range(C.safe.premium[0], C.safe.premium[1]));
    if (k >= n) continue;
    const startQ = later ? s.q + 1 : s.q;
    const computeValue = Math.round(qty * s.market[gpu] * C.hoursQ * termQ);
    out.push({
      id: `safe-q${s.q}-${k}`,
      investor: names[k],
      q: s.q,
      gpu,
      qty,
      termQ,
      term: termQ * 3,
      startQ,
      delivery: later ? C.safe.delivery.next : C.safe.delivery.now,
      equityPct: round1((100 * computeValue * premium) / (preMoney + computeValue)),
      computeValue,
      preMoney,
      premium,
    });
  }
  return out;
}

// The offer as a book entry: real capacity that serves and trains, at no cash cost.
export function safeEntry(offer) {
  return {
    id: offer.id,
    q: offer.q,
    src: 'safe',
    gpu: offer.gpu,
    qty: offer.qty,
    rate: 0,
    fee: 0,
    eff: 0,
    financed: false,
    term: offer.term,
    termQ: offer.termQ,
    delivery: offer.delivery,
    startQ: offer.startQ,
    endQ: offer.startQ + offer.termQ,
    firm: offer.investor,
    archetype: 'safe',
    auction: false,
    optional: false,
    value: 0,
    deposit: 0,
    remaining: 0,
    equityPct: offer.equityPct,
    bookRate: round2(offer.computeValue / (offer.qty * C.hoursQ * offer.termQ)), // its market price, for gross margin
  };
}

// Take an offer on this quarter's memo: the compute joins the book and the
// investor joins the cap table (your share × (1 − pct/100)). Taking it twice,
// or after the quarter's floor, changes nothing.
export function acceptOffer(s, id) {
  const offer = s.memo && s.memo.q === s.q ? s.memo.offers.find((o) => o.id === id) : null;
  if (!offer || !OPEN.includes(s.phase) || s.book.some((e) => e.id === id)) return s;
  const next = clone(s);
  const e = safeEntry(offer);
  if (s.phase === 'floor' && s.floor) e.seq = s.floor.deals.length; // counts after the deals already signed
  next.book.push(e);
  next.capTable = grant(next.capTable, { id, name: offer.investor, pct: offer.equityPct, q: s.q, kind: 'safe' });
  return next;
}

// This quarter's SAFE compute, in the order it was taken (objectives.boardOrder places it).
export const safeThisQuarter = (s) => s.book.filter((e) => e.src === 'safe' && e.q === s.q);
