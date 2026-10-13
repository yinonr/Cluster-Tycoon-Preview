// DEAL LAB (V3 experiment; opt-in with ?lab or #lab; never official, never
// recorded, never shared). The Daily Floor's engine: createRun is buyerMode's, so
// a seed gives the same desks, sellers, events and draws. The lab changes how you
// negotiate, what a deal really costs, what you're told and how you're scored:
//   1. SELLER WANTS (wants.js). Every seller values something: a long tenant, an
//      empty rack, a fast close, a straight counter. Read it from their shouts,
//      their opening line and how they react; give it when it's worth it.
//   2. REAL COST. Your GPUs will be used for a set number of months (6, 12 or 24,
//      on the need card). Contract months past that and GPUs past your need are
//      sublet at a loss. The lot sheet shows the real cost before you commit; the
//      grade, the score and par all use it. Twenty-four months is no longer free.
//   3. THE STAMP. Each deal is graded the moment you sign it, on real cents under
//      target, with its points. The seller's floor is shown only when you hit it.
//   4. PAR. The best a perfect negotiator could do with the noon desks, knowing
//      every seller's want. The book says how far over or under par you finished,
//      and whether the desk/term or the haggle cost you more.
//   5. THE SCORE pays for the deal, not the stopwatch: no speed part, no 15¢ cap.
//   6. THE MARKET STORY (labmarket.js): the Daily's always-up first event becomes a
//      seeded squeeze, slide or calm, with early word from the floor that's usually right.
//   7. Guards: agreed paper lapses after LAPSE floor seconds; a seller remembers an
//      open haggle when you close the sheet; the House gives one tip a floor (a
//      seller's want, not a floor).
//   8. BANK OR PUSH. Fill the need sheet and the floor asks: bank the score, or push
//      for one more deal (PUSH below). One push, then the tape.
// Lab randomness comes only from keyed streams ('want' + lot id, 'lab' + 'use',
// 'lab' + 'push'): nothing here moves a Daily draw, writes storage or touches the daily stats.

import { buyerMode, look } from './buyer.js';
import { contractValue } from '../data/gpus.js';
import { SITES, SELLER_FIRMS, FIRST_NAMES, BUYER_COMPANIES } from '../data/names.js';
import { round2, makeRng, wallClock, usd, int, stream, pickAt, esc } from '../util.js';
import { FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR } from '../config.js';
import { wantOf, wantHaggle, moodOf, realCost, satisfiable, useMonths, defaultTermFor, SHOUTS, TIP, WANT_LABEL, WANT } from './wants.js';
import { applyStory, storyOf } from './labmarket.js';
import { ECON, ledger, dealLedger, econPts, econScore, planBuyers, liveBuyers, servesOrder, money, priceOf } from './economy.js';

// BANK OR PUSH. The push is a startup's order: their GPUs at their price, from the
// one seller who has them (posted above it), before another broker gets there.
// Every cent you buy under the startup's price scores, every cent over costs, and no
// deal costs the stake. The push deal never counts toward your need sheet, the other
// desks wait while it's on, and it's the floor's last deal. The offer is drawn from
// stream(seed, 'lab', 'push') when the sheet fills; the startup pays the board less
// a spread, so a market move shifts their price and the seller's together.
export const PUSH = {
  perCent: 120,            // points per cent under the startup's price (and lost per cent over)
  cap: 1200,               // the most a push can win (10¢ under)
  stake: 500,              // no deal (another broker, the bell, leaving) costs this; so does the worst loss
  window: 30,              // floor seconds before another broker takes the block
  minLeft: 24,             // no push with less than this left on the clock
  gap: [0.04, 0.13],       // the seller's posted price over the startup's
  room: [0.06, 0.13],      // the seller's room, posted to floor (the Daily's desks)
  share: [0.25, 0.5],      // the startup's block, as a share of your need sheet
  term: 12,
  wants: [{ w: 2.5, v: 'respect' }, { w: 2, v: 'hungry' }, { w: 2, v: 'quick' }, { w: 1.5, v: 'none' }],
};
// A push deal's points at a rate: whole cents under the startup's price, capped both ways.
export const pushPts = (p, rate) => Math.max(-PUSH.stake, Math.min(PUSH.cap, PUSH.perCent * Math.round((p.price - rate) * 100)));
const pushOn = (run) => !!run.labPush && run.labPush.state === 'on';

export const LAB_VERSION = 5; // 5: the trading economy (economy.js: a customer order at their price, margin, the aftermarket; no BANK OR PUSH). 4: truthful sellers, BANK OR PUSH
export const LAPSE = 10;           // floor seconds an agreed price waits for your signature
const PTS = { fill: 2500, price: 5500, clean: 500 };
const HIT = 0.01;                  // within a cent of the floor: "their floor"

// Grades, by real cents under the target (the quantity the score pays for).
export const GRADES = [
  { id: 'steal', label: 'STEAL', min: 0.15 },
  { id: 'sharp', label: 'SHARP', min: 0.09 },
  { id: 'good', label: 'GOOD', min: 0.04 },
  { id: 'fair', label: 'FAIR', min: 0 },
  { id: 'soft', label: 'SOFT', min: -Infinity },
];
const realOf = (d) => (d.real != null ? d.real : d.eff);
export function gradeOf(md, d) {
  if (!legal(md, d)) return { id: 'off', label: 'OFF THE SHEET' };
  // A per-GPU customer price (Tycoon mode) grades each GPU against its own price.
  const P = md.priceFor && md.priceFor[d.gpu] != null ? md.priceFor[d.gpu] : null;
  const walk = P ?? md.walk, target = P != null ? round2(P - ECON.over) : md.target;
  if (realOf(d) > walk) return { id: 'over', label: md.price != null ? 'UNDERWATER' : 'OVER WALK-AWAY' };
  const under = round2(target - realOf(d));
  return GRADES.find((g) => under >= g.min - 1e-9);
}

const legal = (md, d) => md.accept.includes(d.gpu) && d.delivery <= md.deliveryDays && d.term >= md.minTerm;
const usableLot = (md, l) => md.accept.includes(l.gpu) && l.delivery <= md.deliveryDays && l.terms.some((t) => t >= md.minTerm);
const live = (l) => l.status === 'open' || l.status === 'cooling';
const cents = (x) => `${Math.round(Math.abs(x) * 100)}¢`;

// Price factor: Floor Score v2's slope on the real price, without the cap above 15¢ under target.
export function labPf(md, d) {
  const p = realOf(d);
  if (!legal(md, d) || p >= md.walk) return 0;
  // Past 15¢ under target the slope halves: a great deal still pays more, but one lucky desk can't swamp the floor.
  if (p <= md.target) { const u = md.target - p; return u <= 0.15 ? 0.40 + 0.60 * u / 0.15 : 1.0 + 0.30 * (u - 0.15) / 0.15; }
  return 0.40 * (md.walk - p) / (md.walk - md.target);
}

// One deal's points: the GPUs it counted toward the need, at its price factor.
export const dealPoints = (md, d, counted) => Math.round((counted / md.qty) * (PTS.fill + PTS.price * labPf(md, d)));

// A perfect negotiator's real price on a lot: its floor at that term (less the
// seller's give, when this term and size meet their want) + eps, the fee if it
// can't be paid in cash, plus months and GPUs you won't use.
function perfect(mode, run, lot, term, qty, counted, cashLeft, eps = 0) {
  const m = run.market;
  const w = wantOf(run, lot);
  const rate = round2(m.floorAt(lot, term) - (satisfiable(w, lot, term, qty) ? w.give : 0) + eps);
  const fee = contractValue(qty, rate, term) > cashLeft ? mode.financingFee(term) : 0;
  const rc = realCost(run, { qty, term, eff: round2(rate + fee) }, counted);
  return { rate, eff: round2(rate + fee), real: rc.real, fee, value: fee ? 0 : contractValue(qty, rate, term) };
}

// The cheapest way to fill the sheet from the desks live right now, with one or
// two of them, for a perfect negotiator who reads every want (floor + eps), on the
// real price. Mirrors score-sim's search.
export function bestPath(mode, run, eps = HIT) {
  const m = run.market, md = run.mandate, Q = md.qty;
  const opts = [];
  for (const l of m.lots.filter((x) => live(x) && usableLot(md, x))) {
    for (const term of l.terms.filter((t) => t >= md.minTerm)) {
      const qs = l.divisible ? Array.from({ length: Math.floor((l.qty - l.minQty) / l.step) + 1 }, (_, i) => l.minQty + i * l.step) : [l.qty];
      for (const q of qs) opts.push({ l, term, q });
    }
  }
  const name = (o) => ({ desk: o.l.archetype, firm: o.l.firm, term: o.term, want: wantOf(run, o.l).id });
  let best = null;
  for (const a of opts) {
    if (a.q >= Q) {
      const e = perfect(mode, run, a.l, a.term, a.q, Q, md.budget, eps);
      if (!best || e.real < best.real) best = { real: e.real, legs: [{ ...name(a), qty: a.q, real: e.real }] };
      continue;
    }
    const ea = perfect(mode, run, a.l, a.term, a.q, a.q, md.budget, eps);
    for (const b of opts) {
      if (b.l === a.l || a.q + b.q < Q) continue;
      const eb = perfect(mode, run, b.l, b.term, b.q, Q - a.q, md.budget - ea.value, eps);
      const real = round2((ea.real * a.q + eb.real * (Q - a.q)) / Q);
      if (!best || real < best.real) best = { real, legs: [{ ...name(a), qty: a.q, real: ea.real }, { ...name(b), qty: b.q, real: eb.real }] };
    }
  }
  return best;
}

export const labMode = {
  ...buyerMode,
  id: 'lab',
  labVersion: LAB_VERSION,
  scoreVersion: `lab${LAB_VERSION}`,

  createRun(opts) {
    const run = buyerMode.createRun.call(this, opts);
    run.lab = true;
    run.labNeg = {};
    useMonths(run);
    applyStory(run); // the floor's market story replaces the Daily's always-up first event (labmarket.js)
    // The trading economy (economy.js): the need sheet becomes a customer's order, half again
    // the Daily's size (so it takes two or three deals, or one big block), at the customer's
    // price, for the months they'll use it. No draws: the floor itself is the Daily's.
    const md = run.mandate;
    const dailyQty = md.qty, step = dailyQty / 4;
    md.qty = Math.round((dailyQty * ECON.scale) / step) * step;
    md.budget = Math.round(md.budget * ECON.scale);
    md.price = round2(md.target + ECON.over);
    md.walk = md.price; // over the customer's price, every hour you deliver loses money
    md.minTerm = Math.max(md.minTerm, useMonths(run)); // the customer needs them for their months
    // Most floors' 24-month desk sells one block the size of the Daily's need; on some it's the
    // big double block, one of the floor's two one-deal fills (the wind-down seller is the other).
    const long = run.market.lots.find((l) => l.archetype === 'long');
    if (long && stream(run.seed, 'lab', 'big').next() >= ECON.bigLong) long.qty = dailyQty;
    run.econ = ECON;
    run.labSales = [];
    planBuyers(run, dailyQty);
    return run;
  },

  // The Daily's haggle (same streams, same answers), with the seller's want
  // (wants.js), the floor and posted ask noted at agreement (the market can move
  // before you sign), and agreed paper that lapses after LAPSE floor seconds.
  // A seller remembers an open haggle: closing the sheet and coming back is not a reset.
  haggle(run, lot) {
    const prev = run.labNeg && run.labNeg[lot.id];
    if (prev && (prev.status === 'open' || prev.status === 'agreed')) return prev;
    if (prev && prev.status === 'walked' && prev.resume) { prev.resume(); return prev; } // they remember you
    const neg = wantHaggle(buyerMode.haggle.call(this, run, lot), run, lot);
    if (run.labNeg) run.labNeg[lot.id] = neg;
    const m = run.market;
    const agree = neg.agree.bind(neg);
    neg.agree = (price) => {
      lot.labAgreed = { floor: neg.floor(), posted: neg.posted(), t: m.t, met: neg.wantMet() };
      return agree(price);
    };
    const check = neg.checkMarket.bind(neg);
    neg.checkMarket = () => {
      if (neg.status === 'agreed' && lot.labAgreed && m.t - lot.labAgreed.t > LAPSE && lot.status === 'open') {
        neg.status = 'open';
        neg.price = null;
        lot.labAgreed = null;
        const e = { who: 'seller', price: neg.ask(), text: `Paper sat too long. ${usd(neg.ask())} now.`, kind: 'moveUp' };
        neg.tape.push(e);
        return e;
      }
      return check();
    };
    return neg;
  },

  // Floor shouts: a desk's want joins its lines, for the sellers who show it. Every
  // shout is true: a plain seller shouts only the desk's own lines.
  shouts(char, run) {
    const base = buyerMode.shouts.call(this, char, run);
    const lot = char.lotId ? run.market.lot(char.lotId) : null;
    if (!lot) return base;
    const w = wantOf(run, lot);
    if (lot.archetype === 'push') return [...(SHOUTS[w.id] ? [SHOUTS[w.id][0]] : []), `${int(lot.qty)} ${lot.gpu}s. READY TODAY.`, ...(SHOUTS[w.id] ? [SHOUTS[w.id][1]] : [])];
    // The Daily's term lines sound like a want; the lab's floor drops them.
    const plain = base.filter((x) => !/MONTHS|LONG COMMIT/.test(x));
    return w.tells && SHOUTS[w.id] ? [SHOUTS[w.id][0], ...plain, SHOUTS[w.id][1]] : plain;
  },

  // The House gives one tip a floor, and in the lab it's a seller's want, not a floor.
  intel(char, run) {
    if (char.role !== 'expert') return buyerMode.intel.call(this, char, run);
    const title = `${char.name} · The House`;
    if (run.labTipped) return { title, kicker: 'THE EXPERTS', body: ['One tip a floor, and you had it. Read the sellers yourself.'] };
    const md = run.mandate;
    // Proud and hungry first: their openings are the bet (a long tenant announces itself).
    const rank = (l) => (['respect', 'hungry'].includes(wantOf(run, l).id) ? 1 : 0) + wantOf(run, l).give;
    const pool = run.market.liveLots().filter((l) => usableLot(md, l) && !['none', 'desperate'].includes(wantOf(run, l).id));
    const lot = pool.sort((a, b) => rank(b) - rank(a))[0];
    if (!lot) return { title, kicker: 'THE EXPERTS', body: ['Nothing on the floor I’d tip you on right now. Watch the sellers.'] };
    run.labTipped = true;
    const who = run.market.character(lot.sellerId);
    lot.labTip = `${who.name} at ${lot.firm} ${TIP[wantOf(run, lot).id]}`;
    return { title, kicker: 'THE EXPERTS · ONE TIP A FLOOR', body: [`Between us: ${lot.labTip}`, 'Don’t tell them I told you.'] };
  },
  // The order counts only GPUs allocated to it (economy.js); the rest of a contract is spare.
  secured(run) { return run.econ ? run.deals.reduce((s, d) => s + (d.push ? 0 : d.alloc || 0), 0) : buyerMode.secured.call(this, run); },
  need(run) { return Math.max(0, run.mandate.qty - this.secured(run)); },
  isFilled(run) { return this.secured(run) >= run.mandate.qty; },
  summarize(run) {
    const r = buyerMode.summarize.call(this, run);
    if (!run.econ) return r;
    const bought = run.deals.reduce((s, d) => s + d.qty, 0);
    const L = ledger(run);
    r.avg = bought ? round2(run.deals.reduce((s, d) => s + d.eff * d.qty, 0) / bought) : null;
    // The order's lines, judged on the GPUs allocated to it (spares are the aftermarket's).
    const md = run.mandate, alloc = run.deals.filter((d) => d.alloc > 0);
    const avgReal = L.filled ? round2(alloc.reduce((s, d) => s + d.real * d.alloc, 0) / L.filled) : null;
    r.checks = [
      { label: `${int(md.qty)} ${md.gpu}`, ok: L.fill >= 1, detail: `${int(L.filled)} / ${int(md.qty)}` },
      { label: `Delivery ≤ ${md.deliveryDays} days · ${md.minTerm}+ months`, ok: alloc.length > 0 },
      { label: `Under the customer’s ${usd(md.price)}`, ok: avgReal != null && avgReal <= md.price, detail: avgReal != null ? `${usd(avgReal)} real` : '—' },
    ];
    r.headline = !run.deals.length ? 'NO TRADES' : L.fill >= 1 ? 'ORDER FILLED' : `ORDER ${Math.floor(L.fill * 100)}% FILLED`;
    return r;
  },
  tipFor(run, lot) { return lot.labTip ? `The House says: ${lot.labTip}` : null; },
  mood(run, lot, neg) { return moodOf(run, lot, neg); },
  // The real cost, in one line under TAKE (above the fold on a phone), when it isn't just the ask.
  costLine(run, spec) {
    if (pushOn(run)) {
      const p = run.labPush, pts = pushPts(p, spec.rate);
      return `<div class="ctl-row cost-line ${pts > 0 ? 'ok' : pts === 0 ? 'warn' : 'no'}"><b>PUSH ${pts >= 0 ? '+' : '−'}${int(Math.abs(pts))}</b> at ${usd(spec.rate)} · ${esc(p.client)} pays ${usd(p.price)} · no deal: −${int(PUSH.stake)}</div>`;
    }
    if (run.econ) return econCostLine(this, run, spec);
    const chk = this.checks(run, spec);
    const counted = Math.min(spec.qty, this.need(run));
    const rc = realCost(run, { qty: spec.qty, term: spec.term, eff: chk.eff }, counted);
    const bits = [];
    if (chk.eff > spec.rate + 1e-9) bits.push(`+${cents(chk.eff - spec.rate)} financing`);
    if (rc.strand) bits.push(`+${cents(rc.strand)}: ${rc.stranded} months you won’t use`);
    if (rc.excess) bits.push(`+${cents(rc.excess)}: ${int(rc.extra)} GPUs you don’t need`);
    if (!bits.length) return '';
    const cls = rc.real <= run.mandate.target ? 'ok' : rc.real <= run.mandate.walk ? 'warn' : 'no';
    return `<div class="ctl-row cost-line ${cls}"><b>REAL ${usd(rc.real)}</b> · ${bits.join(' · ')}</div>`;
  },
  // TERM chips show the real price at each term.
  chipPrice(run, lot, neg, term, at) {
    const o = neg.offerTerms ? (neg.offerTerms() || []).find((x) => x.term === term) : null;
    if (o) at = o.rate; // while a long tenant's offer stands, their term's chip shows it
    const spec = { gpu: lot.gpu, qty: neg.qty, term, rate: at, delivery: lot.delivery, financed: false };
    return this.checks(run, spec).real;
  },
  // A long tenant's offer on the lot sheet (wants.js): each package they'd sign now, with its
  // rate, term and real cost against how long you'll use the GPUs. Tap one to take it as quoted.
  offerCard(run, lot, neg) {
    const offer = neg.offerTerms ? neg.offerTerms() : null;
    if (!offer) return '';
    const md = run.mandate;
    const rows = offer.map((o) => {
      const chk = this.checks(run, { gpu: lot.gpu, qty: neg.qty, term: o.term, rate: o.rate, delivery: lot.delivery, financed: false });
      const unused = Math.max(0, o.term - useMonths(run));
      const cls = chk.real <= md.target ? 'ok' : chk.real <= md.walk ? 'warn' : 'no';
      return `<button class="oc-pick ${cls}" data-offer="${o.term}" type="button"><b>${o.term} mo · ${usd(o.rate)}</b><span>real ${usd(chk.real)}${unused ? ` · ${unused} mo unused` : ''}${chk.eff > o.rate + 1e-9 ? ' · financed' : ''}</span><i>TAKE</i></button>`;
    });
    return `<div class="ctl-row offer-card"><span class="ctl-l ui">THEIR OFFER · YOU USE ${useMonths(run)} MO</span>${rows.join('')}<span class="oc-or">Or keep talking: their ${offer[1].term} months costs you no patience.</span></div>`;
  },
  takeOffer(run, lot, neg, term) { return neg.takeOffer ? neg.takeOffer(term) : null; },
  dropBadge: 0.03,
  // The lot sheet opens on a fair number (6¢ under): a lowball is a choice, not the default,
  // and YOUR NUMBER says LOWBALL when it is one.
  openingGap() { return 0.06; },
  offerTag(run, lot, neg, offer) { return neg.status === 'open' && neg.ask() - offer >= 0.07 - 1e-9 ? 'LOWBALL' : null; },
  // The default term is the one that matches how long you'll use the GPUs (or the nearest above it).
  defaultTerm(lot, run) { return defaultTermFor(run, lot); },
  // Every lab signing prints the contract at once (you still sign it): the stamp is the payoff.
  quickSigning: true,
  marketPulse: true,       // the floor shows the Market Pulse (src/ui/pulse.js)

  // In the lab a deal over the budget is carried by the capital desk automatically: the fee
  // shows in the real cost, not as a red banner.
  autoFinance(run, spec) { return !pushOn(run) && !spec.financed && buyerMode.checks.call(this, run, spec).overBudget; },
  // The lot sheet's checks: the Daily's, with the price judged on the real cost and
  // one line saying what's in it, before you commit.
  checks(run, spec) {
    if (pushOn(run)) return pushChecks(run, spec); // while the push is on, its desk is the only one open to you
    if (this.autoFinance(run, spec)) spec = { ...spec, financed: true };
    if (run.econ) return econChecks(this, run, spec);
    const base = buyerMode.checks.call(this, run, spec);
    const md = run.mandate;
    const counted = Math.min(spec.qty, this.need(run));
    const rc = realCost(run, { qty: spec.qty, term: spec.term, eff: base.eff }, counted);
    const parts = [];
    if (rc.strand) parts.push(`+${cents(rc.strand)}: ${rc.stranded} months you won’t use`);
    if (rc.excess) parts.push(`+${cents(rc.excess)}: ${int(rc.extra)} GPUs you don’t need`);
    const items = base.items.map((i) => {
      if (i.id !== 'price') return i;
      const p = rc.real;
      return { id: 'price', ok: p <= md.target, warn: p > md.target && p <= md.walk, label: `${usd(p)} ${parts.length ? 'real ' : ''}${p <= md.target ? 'under target' : p <= md.walk ? 'over target' : 'over walk-away'}${parts.length ? ` (${parts.join(' · ')})` : ''}` };
    });
    return { ...base, real: rc.real, items };
  },

  lotDeal(run, lot, o) {
    if (o.qty > lot.qty) o = { ...o, qty: lot.qty }; // never more GPUs than the lot has left
    if (lot.archetype === 'push') {
      const d = buyerMode.lotDeal.call(this, run, lot, { ...o, financed: false });
      return { ...d, push: true, real: d.rate, strand: 0, excess: 0 };
    }
    if (this.autoFinance(run, { gpu: lot.gpu, qty: o.qty, term: o.term, rate: o.rate, delivery: lot.delivery, financed: o.financed })) o = { ...o, financed: true };
    const d = buyerMode.lotDeal.call(this, run, lot, o);
    const rc = realCost(run, d, Math.min(d.qty, this.need(run)));
    return { ...d, real: rc.real, strand: rc.strand, excess: rc.excess };
  },
  auctionDeal(run, lot, price) {
    const d = buyerMode.auctionDeal.call(this, run, lot, price);
    const rc = realCost(run, d, Math.min(d.qty, this.need(run)));
    return { ...d, real: rc.real, strand: rc.strand, excess: rc.excess };
  },

  // Grade the deal before it is recorded (the need it counts against is the need before it).
  recordDeal(run, deal) {
    if (deal.push) { recordPush(run, deal); return; }
    const md = run.mandate;
    const m = run.market;
    // The trading economy: GPUs that serve the order go to it, up to what it still needs; the rest are spare.
    const counted = (run.tycoon?.marketVersion === 62 && deal.resale) || (run.econ && !servesOrder(md, deal)) ? 0 : Math.min(deal.qty, this.need(run));
    if (run.econ) Object.assign(deal, { alloc: counted, sold: 0, saleRev: 0 });
    if (deal.real == null) Object.assign(deal, (({ real, strand, excess }) => ({ real, strand, excess }))(realCost(run, deal, counted)));
    const g = run.econ && !counted ? { id: 'spec', label: 'FOR RESALE' } : gradeOf(md, deal);
    const lot = m.lot(deal.lotId);
    const agreed = !deal.auction && lot && lot.labAgreed;
    const floor = agreed ? agreed.floor : null;
    const posted = agreed ? agreed.posted : null;
    let limit = null;
    if (deal.auction && m.auction && m.auction.lot && m.auction.lot.id === deal.lotId) limit = m.auction.rivalMax;
    const w = lot && !deal.auction ? wantOf(run, lot) : null;
    // A long tenant's offer stood on this lot: the other package, as last quoted, for the stamp.
    const q = lot && !deal.auction && run.labNeg && run.labNeg[lot.id] && run.labNeg[lot.id].labState ? run.labNeg[lot.id].labState.quotes : null;
    const altTerm = q && q[deal.term] != null ? Number(Object.keys(q).find((t) => Number(t) !== deal.term)) : null;
    const alt = altTerm ? { term: altTerm, rate: q[altTerm], real: this.checks(run, { gpu: deal.gpu, qty: deal.qty, term: altTerm, rate: q[altTerm], delivery: lot.delivery, financed: false }).real } : null;
    deal.lab = {
      grade: g.id,
      label: g.label,
      under: round2(md.target - deal.real),
      offPosted: posted != null ? round2(posted - deal.rate) : null,
      hitFloor: floor != null && deal.rate <= floor + HIT + 1e-9,
      floor,
      limit,
      want: w ? w.id : null,
      met: !!(agreed && agreed.met),
      counted,
      alt,
      pts: dealPoints(md, deal, counted),
    };
    if (run.econ) {
      const Ld = dealLedger(run, deal), p = econPts(run, counted, Ld.net);
      Object.assign(deal.lab, { pts: p.fill + p.margin, fillPts: p.fill, marginPts: p.margin, net: Ld.net, margin: round2(priceOf(md, deal.gpu) - deal.real), spare: deal.qty - counted });
    }
    if (lot) lot.labAgreed = null;
    if (run.labNeg && lot) delete run.labNeg[lot.id]; // signed paper is spent: a reopen starts a fresh haggle
    buyerMode.recordDeal.call(this, run, deal);
  },

  score(run, r = this.summarize(run)) {
    if (run.econ) {
      const s = econScore(run);
      return {
        total: s.total, v: this.scoreVersion, fill: s.L.fill, margin: s.L.net,
        parts: [
          { id: 'fill', label: `Order filled · ${int(s.L.filled)} of ${int(run.mandate.qty)}`, pts: s.fill, max: ECON.fillPts },
          { id: 'margin', label: `Booked margin · ${money(s.L.net)}`, pts: s.margin, max: null },
        ],
      };
    }
    const deals = r.deals;
    const fill = deals.reduce((s, d) => s + (d.lab ? Math.round((d.lab.counted / run.mandate.qty) * PTS.fill) : 0), 0);
    const all = deals.reduce((s, d) => s + (d.lab ? d.lab.pts : 0), 0);
    // The clean sheet on the lab's terms: every line met, judged on the real price.
    const reals = deals.filter((d) => d.lab);
    const n = reals.reduce((s, d) => s + d.lab.counted, 0);
    const avgReal = n ? reals.reduce((s, d) => s + d.real * d.lab.counted, 0) / n : Infinity;
    const clean = r.checks.every((c) => c.ok || /under|Never over/i.test(c.label)) && avgReal <= run.mandate.target + 1e-9 && reals.every((d) => d.real <= run.mandate.walk + 1e-9) ? PTS.clean : 0;
    const push = pushScore(run);
    return {
      total: all + clean + (push || 0),
      v: this.scoreVersion,
      parts: [
        { id: 'fill', label: 'Fill', pts: fill, max: PTS.fill },
        { id: 'price', label: 'Price (real, no cap)', pts: all - fill, max: null },
        { id: 'clean', label: 'Clean sheet', pts: clean, max: PTS.clean },
        ...(push == null ? [] : [{ id: 'push', label: 'Push', pts: push, max: null }]),
      ],
    };
  },

  // The tape's lab section, from the floor replayed without you (a fresh market
  // from the same seed: the live run is untouched):
  //   par    the best noon path for a perfect negotiator who reads every want (floor + 1¢, real cost)
  //   noon   the best real price any noon desk offered (0–30 floor s)
  //   after  the best real price after 1 PM (from 60 floor s)
  //   yours  your average real price, and the split of your gap to par:
  //          desk and term (the floors you chose vs par) and haggle (price vs floor)
  book(run, { step = 1 } = {}) {
    const ghost = this.createRun({ rng: makeRng(run.seed), seed: run.seed });
    const md = run.mandate;
    const m = ghost.market;
    const par = bestPath(this, ghost);
    const at = (t) => wallClock(t, m.duration, FLOOR_OPEN_HOUR, FLOOR_CLOSE_HOUR).label;
    let noon = null, after = null;
    for (let t = 0; t <= m.duration; t += step) {
      m.runTo(t);
      for (const lot of m.lots) {
        if (!live(lot) || !usableLot(md, lot)) continue;
        for (const term of lot.terms.filter((x) => x >= md.minTerm)) {
          const q = Math.min(lot.qty, md.qty);
          const e = perfect(this, ghost, lot, term, q, q, md.budget);
          const hit = { real: e.real, term, firm: lot.firm, desk: lot.archetype, want: wantOf(ghost, lot).id, t, at: at(t) };
          if (t <= 30 && (!noon || hit.real < noon.real)) noon = hit;
          if (t >= 60 && (!after || hit.real < after.real)) after = hit;
        }
      }
    }
    const deals = run.deals.filter((d) => d.lab && d.lab.counted > 0);
    const n = deals.reduce((s, d) => s + d.lab.counted, 0);
    let yours = null;
    if (n) {
      const avg = round2(deals.reduce((s, d) => s + d.real * d.lab.counted, 0) / n);
      const withFloor = deals.filter((d) => d.lab.floor != null);
      const haggle = withFloor.length ? round2(withFloor.reduce((s, d) => s + Math.max(0, d.rate - d.lab.floor) * d.lab.counted, 0) / n) : null;
      const vsPar = par ? round2(avg - par.real) : null; // + = over par (worse)
      yours = { avg, vsPar, haggle, choice: haggle != null && vsPar != null ? round2(vsPar - haggle) : null };
    }
    // Your best and worst calls: the deal with the most and the fewest real cents under target.
    const sorted = deals.slice().sort((a, b) => b.lab.under - a.lab.under);
    const best = sorted[0] || null, worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;
    // The same run on the Daily's Floor Score v2, to tell the lab's effect from the Daily's.
    const daily = buyerMode.score.call(buyerMode, run, buyerMode.summarize.call(buyerMode, run)).total;
    const story = storyOf(run);
    return { par, noon, after, yours, best, worst, daily, use: useMonths(run), story, next: nextTime(run, deals, yours, story, noon, after), target: md.target, push: pushBook(run) };
  },

  // The stamp in the signing room (signing.js), or null.
  stamp(run, deal) {
    const L = deal.lab;
    if (!L) return null;
    if (deal.push) return pushStamp(run, deal);
    const bits = [];
    if (!run.econ && L.offPosted != null && L.offPosted > 0) bits.push(`${cents(L.offPosted)} off the posted`);
    if (deal.real > deal.eff + 1e-9) bits.push(`${usd(deal.eff)} + ${cents(deal.real - deal.eff)} unused = ${usd(deal.real)} real`);
    if (run.econ) {
      if (deal.alloc) bits.push(`${L.margin >= 0 ? '+' : '−'}${cents(L.margin)}/hr on ${int(deal.alloc)} for the customer`);
      if (L.spare) bits.push(`${int(L.spare)} spare to sell`);
      bits.push(`${money(L.net)} booked`);
    } else bits.push(L.under >= 0 ? `${cents(L.under)} under target` : `${cents(L.under)} over target`);
    // One note: what cost you on a weak deal, what you read right on a good one.
    const unused = round2(deal.real - deal.eff);
    let note = null;
    if (L.alt) note = altNote(deal, L.alt);
    else if (L.under < 0 && unused >= 0.04) note = `${unused >= 0.1 ? 'Ouch: ' : ''}${deal.strand ? `the months you won’t use cost ${cents(deal.strand)}` : ''}${deal.strand && deal.excess ? ' and ' : ''}${deal.excess ? `the GPUs you don’t need cost ${cents(deal.excess)}` : ''}.`;
    else if (L.want && L.want !== 'none' && READ[L.want]) note = `They were ${WANT_LABEL[L.want].toLowerCase()}. ${L.met ? READ[L.want] : MISSED[L.want]}`;
    if (L.hitFloor) note = `${note ? `${note} ` : ''}Their floor. Nothing left on the table.`;
    else if (L.limit != null && deal.rate > L.limit) note = `${note ? `${note} ` : ''}Paddle ${run.rivals[0].paddle} quit at ${usd(L.limit)}.`;
    return { grade: L.grade, label: L.label, line: bits.join(' · '), pts: L.pts, note };
  },

  // What the need card and the lot sheet say in the lab.
  needCardExtra(run) { return run.econ ? '<li>Spares? Sell them to buyers on the floor</li>' : `<li>You’ll use them <b>${useMonths(run)} months</b></li>`; },
  needLine(run, lot) {
    if (run.econ && !(lot && lot.archetype === 'push')) {
      const md = run.mandate, need = this.need(run);
      return need > 0
        ? `ORDER · ${int(need)} ${md.gpu} to go · customer pays ${usd(md.price)} · for ${useMonths(run)} months`
        : `ORDER FILLED · anything you buy now is spare: sell it to a buyer, or it’s sublet at −${cents(ECON.sublet)}`;
    }
    const p = run.labPush;
    if (lot && lot.archetype === 'push' && p) return `PUSH · ${esc(p.client)} pays ${usd(p.price)} for ${int(p.qty)} ${p.gpu} · +${PUSH.perCent} a cent under (up to +${int(PUSH.cap)}) · over it or no deal: down to −${int(PUSH.stake)}`;
    const md = run.mandate;
    return `YOUR NEED · ${int(this.need(run))} ${md.gpu} to go · target ${usd(md.target)} · walk ${usd(md.walk)} · used for ${useMonths(run)} months`;
  },
  openingBulletin(run) {
    const md = run.mandate;
    if (run.econ) return { headline: `CUSTOMER ORDER · ${int(md.qty)} ${md.gpu} AT ${usd(md.price)}`, sub: `For ${useMonths(run)} months. Buy under their price, sell your spares, finish when you’re done.`, tone: 'flat' };
    return { headline: `DEAL LAB · BUY ${int(md.qty)} ${md.gpu}`, sub: `Every seller wants something. Read them. You’ll use these GPUs for ${useMonths(run)} months.`, tone: 'flat' };
  },

  // ---- BANK OR PUSH (see PUSH) -------------------------------------------------
  // The offer, once, when the need sheet fills (null without time left for one).
  pushOffer(run) {
    if (run.econ) return null; // the trading economy has no push: the aftermarket replaced it
    if (run.labPush) return run.labPush.state === 'offer' ? run.labPush : null;
    const m = run.market, md = run.mandate;
    if (!this.isFilled(run) || m.timeLeft() < PUSH.minLeft) return null;
    // Not while your paddle leads the lot call: a push restarts the floor, and the hammer would
    // land a second contract on a filled sheet. The fill ends the floor, as on the Daily.
    if (m.auction && m.auction.state === 'calling' && m.auction.leader === 'you') return null;
    const r = stream(run.seed, 'lab', 'push');
    // Every number is drawn now, in this order, whatever is used.
    const u = { client: r.next(), share: r.next(), gap: r.next(), room: r.next(), give: r.next(), k: r.next(), line: r.next(), site: r.next(), post: r.next(), name: r.next(), firm: r.next() };
    const want = r.weighted(PUSH.wants);
    const dressed = look(r);
    const G = md.gpu;
    const step = md.qty / 8;
    const qty = Math.max(step, Math.round((md.qty * (PUSH.share[0] + (PUSH.share[1] - PUSH.share[0]) * u.share)) / step) * step);
    const posted = round2(m.bench[G] - 0.06 + 0.06 * u.post);
    const gap = round2(PUSH.gap[0] + (PUSH.gap[1] - PUSH.gap[0]) * u.gap);
    const room = round2(PUSH.room[0] + (PUSH.room[1] - PUSH.room[0]) * u.room);
    const g = WANT.give[want];
    const taken = new Set(m.characters.map((c) => c.name));
    const clients = BUYER_COMPANIES.filter((c) => c.name !== md.company && c.name !== run.matched.founder.firm);
    const sites = SITES.filter((x) => x.code !== 'DSM' && !m.lots.some((l) => l.site.code === x.code));
    const firms = SELLER_FIRMS.filter((f) => !m.lots.some((l) => l.firm === f));
    run.labPush = {
      state: 'offer',
      t: m.t,
      bank: this.score(run).total,
      client: pickAt(clients, u.client).name,
      qty, gpu: G, term: PUSH.term,
      price: round2(posted - gap), posted, floor: round2(posted - room), gap,
      want: { id: want, give: g ? round2(g[0] + (g[1] - g[0]) * u.give) : 0, counters: u.k < 0.5 ? WANT.quickCounters[0] : WANT.quickCounters[1], lineU: u.line, tells: true },
      site: pickAt(sites, u.site) || SITES[0],
      seller: pickAt(FIRST_NAMES.filter((x) => !taken.has(x)), u.name) || FIRST_NAMES[0],
      firm: pickAt(firms, u.firm) || SELLER_FIRMS[0],
      dressed,
      window: Math.min(PUSH.window, m.timeLeft() - 2),
      shout: SHOUTS[want] ? SHOUTS[want][0] : `${int(qty)} ${G}s. READY TODAY.`,
      perCent: PUSH.perCent, cap: PUSH.cap, stake: PUSH.stake,
    };
    return run.labPush;
  },
  bank(run) { if (run.labPush && run.labPush.state === 'offer') run.labPush.state = 'banked'; },
  // PUSH: the seller arrives on the floor with the startup's order and another broker's clock.
  startPush(run) {
    const p = run.labPush;
    if (!p || p.state !== 'offer') return null;
    const m = run.market;
    p.state = 'on';
    p.startedAt = m.t;
    m.halted = false; // the filling deal halted the floor (buyerMode.recordDeal); the push plays on it
    const lot = run.addSeller('push', {
      qty: p.qty, site: p.site, delivery: 0, deliveryLabel: 'TODAY', terms: [p.term], baseTerm: p.term,
      minQty: p.qty, step: p.qty, ask: p.posted, floor: p.floor, concession: 0.45, patience: 5, labWant: { ...p.want },
    }, { name: p.seller, firm: p.firm, dressed: p.dressed });
    p.lotId = lot.id;
    m.setFuse(lot, p.window, { name: 'Another broker', firm: 'Another broker', paddle: 0 });
    m.on('reprice', ({ gpu, delta }) => { if (gpu === p.gpu && p.state === 'on') { p.price = round2(p.price + delta); p.posted = round2(p.posted + delta); p.floor = round2(p.floor + delta); } });
    m.on('lot:gone', ({ lot: l }) => { if (l === lot && p.state === 'on') { p.state = 'lost'; p.reason = 'gone'; } });
    m.bulletin({ headline: `PUSH · ${int(p.qty)} ${p.gpu} FOR ${p.client.toUpperCase()}`, sub: `Buy under ${usd(p.price)} at ${p.firm}. ${Math.round(p.window)} seconds.`, tone: 'flat' });
    return lot;
  },
  // The push is over: banked, signed, or lost (another broker took the block).
  pushDone(run) { const p = run.labPush; return !!p && ['banked', 'signed', 'lost'].includes(p.state); },
  // While the push is on, its desk is the only one that trades with you.
  blockedLot(run, lot) { return pushOn(run) && lot.id !== run.labPush.lotId ? 'YOU’RE FILLED. GO CLOSE YOUR PUSH.' : null; },
  signingNext(run, deal, offer) {
    if (run.econ && !deal.push) return !deal.alloc ? 'SPARE GPUS · FIND THEM A BUYER →' : this.isFilled(run) ? 'ORDER FILLED · BACK TO THE FLOOR →' : null;
    return offer ? 'NEED MET · BANK IT OR PUSH? →' : deal.push ? 'PUSH SIGNED · SEE THE TAPE →' : null; },
  // ---- THE TRADING ECONOMY on the floor and the tape (economy.js) -------------------------
  endsOnFill: false,       // filling the order is a milestone: trade on, or finish
  keepsTrading: true,
  aftermarket: true,
  needTitle: 'CUSTOMER ORDER',
  finishLabel: 'FINISH TRADING',
  filledTag: 'ORDER FILLED',
  filledStamp: 'ORDER FILLED',
  scoreLabel: 'TRADING SCORE',
  priceLine(run) { return `<li>Customer pays <b>${usd(run.mandate.price)}</b>/GPU-hr</li>`; },
  finishConfirm(run) { return `SURE? ORDER ${Math.floor(ledger(run).fill * 100)}% FILLED`; },
  filledBulletin(run) { return { headline: 'CUSTOMER ORDER FILLED', sub: `${money(ledger(run).net)} booked so far. Trade your spares, or finish.`, tone: 'down' }; },
  posExtra(run) {
    const L = ledger(run);
    return `<div>SPARE <b>${int(L.spare)}</b> · BOOKED <b class="${L.net < 0 ? 'neg' : ''}">${money(L.net)}</b></div>`;
  },
  pulseBuyers(run) { return liveBuyers(run); },
  ledgerHTML(run) { return econBook(run); },

  contract(run, deal) {
    const rows = buyerMode.contract.call(this, run, deal);
    if (deal.push && run.labPush) rows[0] = ['BUYER', `${run.labPush.client.toUpperCase()} VIA ${run.mandate.company.toUpperCase()}`];
    return rows;
  },
};

// The push deal's checks on its lot sheet: the price against the startup's, and their money.
function pushChecks(run, spec) {
  const p = run.labPush;
  const under = round2(p.price - spec.rate);
  const pts = pushPts(p, spec.rate);
  return {
    value: contractValue(spec.qty, spec.rate, spec.term), eff: spec.rate, real: spec.rate, overBudget: false,
    items: [
      { id: 'price', ok: under > 0, warn: under === 0, label: under > 0 ? `${cents(under)} under ${p.client}’s ${usd(p.price)}: +${int(pts)}` : under === 0 ? `At ${p.client}’s ${usd(p.price)}: 0` : `${cents(under)} over ${p.client}’s ${usd(p.price)}: −${int(-pts)}` },
      { id: 'budget', ok: true, label: `${p.client} pays for it` },
    ],
  };
}

// The push deal settles the push (a deal over the startup's price still settles; it costs).
function recordPush(run, deal) {
  const p = run.labPush;
  const lot = run.market.lot(deal.lotId);
  const agreed = lot && lot.labAgreed;
  if (p && p.state === 'on' && lot && lot.id === p.lotId) {
    p.state = 'signed';
    p.rate = deal.rate;
    p.pts = pushPts(p, deal.rate);
    p.signedAt = run.market.t;
    deal.lab = { push: true, pts: p.pts, under: round2(p.price - deal.rate), grade: p.pts > 0 ? 'push' : p.pts === 0 ? 'fair' : 'under', label: p.pts > 0 ? 'PUSH WON' : p.pts === 0 ? 'BROKE EVEN' : 'UNDERWATER', want: wantOf(run, lot).id, met: !!(agreed && agreed.met), hitFloor: !!agreed && deal.rate <= agreed.floor + HIT + 1e-9 };
    p.deal = deal;
  }
  if (lot) lot.labAgreed = null;
  if (run.labNeg && lot) delete run.labNeg[lot.id]; // signed paper is spent
}

// The push's points on the score: null without a push (banked, or never offered).
function pushScore(run) {
  const p = run.labPush;
  if (!p || p.state === 'offer' || p.state === 'banked') return null;
  return p.state === 'signed' ? p.pts : -PUSH.stake; // lost, or still open when the floor ended
}

function pushStamp(run, deal) {
  const p = run.labPush;
  const L = deal.lab;
  const read = L.want && L.want !== 'none' && READ[L.want] ? `They were ${WANT_LABEL[L.want].toLowerCase()}. ${L.met ? READ[L.want] : MISSED[L.want]}` : null;
  // Under water: what it cost, and the read you missed, if you missed one.
  let note = L.pts < 0 ? `You paid ${cents(L.under)} over ${p.client}’s price.${read && !L.met ? ` ${MISSED[L.want]}` : ''}` : read;
  if (L.hitFloor) note = `${note ? `${note} ` : ''}Their floor. Nothing left on the table.`;
  return { grade: L.grade, label: L.label, line: `${usd(deal.rate)} for ${p.client} at ${usd(p.price)} · ${L.under >= 0 ? `${cents(L.under)} under` : `${cents(L.under)} over`}`, pts: L.pts, note };
}

// The best price the push seller would give, by how they deal: a proud one at your straight
// opening (under 7¢ off posted), one on the clock at the fast price less 4¢, a hungry one
// (won over) or a plain one near their floor.
function pushBest(p) {
  const fl = round2(p.floor - p.want.give);
  const id = p.want.id;
  return round2(id === 'respect' ? Math.max(fl + HIT, p.posted - 0.06) : id === 'quick' ? Math.max(fl, p.posted - p.want.give - 0.04) : fl + HIT);
}
// The tape's push line, with the best that seller would have done.
function pushBook(run) {
  const p = run.labPush;
  if (!p || p.state === 'offer') return null;
  const bestRate = pushBest(p);
  return { state: p.state, client: p.client, qty: p.qty, gpu: p.gpu, price: p.price, posted: p.posted, rate: p.rate ?? null, pts: pushScore(run) ?? 0, bestRate, best: pushPts(p, bestRate), want: p.want.id, seller: p.seller, firm: p.firm, bank: p.bank, reason: p.reason || (p.state === 'on' ? 'open' : null) };
}

// One thing to do differently next time: the biggest lever this round, in plain words.
function nextTime(run, deals, yours, story, noon, after) {
  if (!deals.length) return 'Sign something: an unfilled sheet scores nothing for the GPUs you didn’t buy.';
  const unused = deals.reduce((s, d) => s + (d.real - d.eff) * d.lab.counted, 0) / Math.max(1, deals.reduce((s, d) => s + d.lab.counted, 0));
  if (unused >= 0.04) return `Match the term to how long you’ll use the GPUs (${useMonths(run)} months): months and GPUs you won’t use cost you ${cents(unused)} a GPU-hour.`;
  if (deals.some((d) => d.lab.want === 'respect' && !d.lab.met)) return 'A proud seller wants a straight opening number. Lowball them and they stop negotiating.';
  if (deals.some((d) => ['hungry', 'desperate'].includes(d.lab.want) && !d.lab.met)) return 'A hungry seller only opens up to a bold opening number. Polite costs you their room.';
  if (story.id === 'slide' && after && noon && after.real < noon.real - 0.02 && deals.every((d) => d.t < 60)) return 'When the word on the floor says racks are landing early, waiting can pay.';
  if (story.id === 'squeeze' && deals.some((d) => d.t > story.at)) return 'When the word says a big lab is shopping, lock in before the board jumps.';
  if (yours && yours.vsPar > 0 && yours.haggle != null && yours.choice > yours.haggle) return 'Pick the desk and term on the real cost, not the posted price.';
  if (yours && yours.vsPar > 0) return 'Read the seller before your opening number: what they want decides whether to push.';
  return 'Under par. Try a new market, or this one again from another desk.';
}

// The stamp's line when you gave a seller what they wanted.
// The stamp's note on a deal made with a long tenant's offer on the table: what you signed
// against the other package they offered, both at real cost (unused months included).
function altNote(deal, a) {
  const d = round2(a.real - deal.real); // > 0: what you signed costs less, real
  if (deal.term > a.term) {
    const costs = [deal.strand ? 'the unused months' : '', deal.eff > deal.rate + 1e-9 ? 'the financing' : '', deal.excess ? 'the spare GPUs' : ''].filter(Boolean).join(' and ') || 'the longer commitment';
    return d > 0 ? `You gave them ${deal.term} months and it paid: ${cents(d)} under their ${a.term}-month price, ${costs} included.`
      : d < 0 ? `Lower rate, but ${costs} made it ${cents(d)} dearer than their ${a.term}-month price.`
        : `Their ${deal.term} months came out even with their ${a.term}-month price.`;
  }
  return d > 0 ? `You kept it to ${deal.term} months: their ${a.term}-month offer would have cost ${cents(d)} more, real.`
    : d < 0 ? `Their ${a.term}-month offer was ${cents(d)} cheaper, real, even with the unused months.`
      : `Their ${a.term}-month offer would have come out even.`;
}

const MISSED = {
  certainty: 'Their longest term would have moved them.',
  volume: 'The whole block would have moved them.',
  quick: 'Their fast price was the deal.',
  respect: 'A straight opening number would have moved them.',
  hungry: 'A bold opening number would have opened their room.',
  desperate: 'A bold opening number would have opened their room.',
};
const READ = {
  certainty: 'You read them: a long tenant was worth it to them.',
  volume: 'You read them: they needed the racks empty.',
  quick: 'Closed before their board call.',
  respect: 'Straight all the way: they met you.',
  hungry: 'You read them: a bold opener won them over.',
  desperate: 'You read them: a bold opener won them over.',
};


// ---- The trading economy: the lot sheet and the tape ---------------------------------------
// The lot sheet's checks: the Daily's, with the price line as your margin on the customer's
// price at the real cost (idle months in), and a block that can't serve the order marked spare.
function econChecks(mode, run, spec) {
  const md = run.mandate;
  const base = buyerMode.checks.call(mode, run, spec);
  const alloc = servesOrder(md, spec) ? Math.min(spec.qty, mode.need(run)) : 0;
  const rc = realCost(run, { qty: spec.qty, term: spec.term, eff: base.eff }, alloc);
  const mg = round2(priceOf(md, spec.gpu) - rc.real);
  const items = base.items.map((i) => {
    if (i.id !== 'price') return i;
    if (!alloc) return { id: 'price', ok: false, warn: true, label: `Spare: ${mode.need(run) ? 'this block can’t serve the order' : 'the order is filled'}` };
    return { id: 'price', ok: mg >= 0, label: mg >= 0 ? `+${cents(mg)}/hr margin (real ${usd(rc.real)})` : `−${cents(mg)}/hr: underwater (real ${usd(rc.real)})` };
  });
  return { ...base, real: rc.real, items };
}

// One line under TAKE: what this deal books for the customer, and what its spares risk.
function econCostLine(mode, run, spec) {
  const md = run.mandate, U = useMonths(run);
  const chk = mode.checks(run, spec);
  const alloc = servesOrder(md, spec) ? Math.min(spec.qty, mode.need(run)) : 0;
  const spare = spec.qty - alloc;
  const mg = round2(priceOf(md, spec.gpu) - chk.real);
  const bits = [];
  if (alloc) bits.push(`<b>${mg >= 0 ? '+' : '−'}${cents(mg)}/hr</b> on ${int(alloc)} for the customer (${money(mg * alloc * U * ECON.hours)})`);
  if (spare) bits.push(`${alloc ? '' : '<b>SPARE</b> '}${int(spare)} spare: sell them, or ${money(-spare * ECON.sublet * spec.term * ECON.hours)} if sublet`);
  if (chk.eff > spec.rate + 1e-9) bits.push(`+${cents(chk.eff - spec.rate)} financing`);
  bits.unshift(`<b>COMMIT $${(contractValue(spec.qty, chk.eff, spec.term) / 1e6).toFixed(1)}M</b> over ${spec.term} mo`);
  const cls = alloc && mg < 0 ? 'no' : !alloc || spare ? 'warn' : 'ok';
  return `<div class="ctl-row cost-line ${cls}">${bits.join(' · ')}</div>`;
}

// The tape's trading desk: the order, the margin, the ledger in five lines, the best and worst call.
function econBook(run) {
  const md = run.mandate, U = useMonths(run);
  const L = ledger(run);
  const sales = run.labSales || [];
  const pct = Math.floor(L.fill * 100);
  const line = (label, v, cls = '') => `<li class="${cls}"><span>${label}</span><b>${v}</b></li>`;
  const best = L.rows.filter((x) => x.net > 0).sort((a, b) => b.net - a.net)[0];
  const worst = L.rows.filter((x) => x.net < 0).sort((a, b) => a.net - b.net)[0];
  const sale = sales.slice().sort((a, b) => b.vsSublet - a.vsSublet)[0];
  const what = (x) => `${int(x.d.qty)} ${x.d.gpu} from ${esc(x.d.firm)} at ${usd(x.d.rate)}, ${x.d.term} mo`;
  const why = (x) => (x.spare > 0 ? `${int(x.spare)} spare sublet at a loss` : x.d.real > priceOf(md, x.d.gpu) ? 'paid over the customer’s price' : x.d.term > U ? 'months past the customer’s, sublet at a loss' : 'thin margin');
  const calls = [
    best ? `<p class="econ-call"><span class="ui">BEST TRADE</span> ${what(best)}: <b>${money(best.net)}</b>.</p>` : '',
    sale ? `<p class="econ-call"><span class="ui">AFTERMARKET</span> Sold ${int(sale.qty)} ${sale.gpu} to ${esc(sale.buyer)} at ${usd(sale.price)}: <b>${money(sale.vsCost)}</b> on what you paid, ${money(sale.vsSublet)} against subletting.</p>` : '',
    worst ? `<p class="econ-call bad"><span class="ui">BIGGEST MISS</span> ${what(worst)}: <b>${money(worst.net)}</b> (${why(worst)}).</p>` : '',
    !run.deals.length ? '<p class="econ-call bad"><span class="ui">NO TRADES</span> The customer went elsewhere.</p>' : '',
  ].join('');
  return `
    <section class="econ paper">
      <div class="lb-h caps">The trading desk</div>
      <div class="econ-big">
        <div><span class="ui">ORDER FILLED</span><b class="hl">${pct}%</b><small>${int(L.filled)} of ${int(md.qty)} ${md.gpu} · ${U} months at ${usd(md.price)}</small></div>
        <div><span class="ui">BOOKED MARGIN</span><b class="hl ${L.net < 0 ? 'neg' : ''}">${money(L.net)}</b><small>contracted, not cash</small></div>
      </div>
      <ul class="econ-ledger">
        ${line(`Customer order: ${int(L.filled)} GPUs at ${usd(md.price)}, against your rates`, money(L.story.delivered))}
        ${L.story.idleMonths ? line(`Months past the customer’s ${U}, sublet at −${cents(ECON.sublet)}`, money(L.story.idleMonths)) : ''}
        ${L.sold ? line(`Spares sold (${int(L.sold)} GPUs), over what you paid`, money(L.story.salesGain)) : ''}
        ${L.spare ? line(`Spares unsold (${int(L.spare)} GPUs), sublet at −${cents(ECON.sublet)}`, money(L.story.unsold)) : ''}
        ${line('Booked margin', money(L.net), 'net')}
      </ul>
      <p class="econ-totals">Revenue $${int(L.customer + L.sales)} (customer $${int(L.customer)}${L.sales ? `, aftermarket $${int(L.sales)}` : ''}) · supply commitments $${int(L.cost)} for ${int(L.bought)} GPUs${L.fin > 0 ? ` (financing $${int(L.fin)})` : ''} · idle capacity sublet back $${int(L.idle)}.</p>
      ${calls}
    </section>`;
}
