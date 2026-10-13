// VENTURE MODE on the floor: the Buyer mode with the company's money rules.
// Same floor, same desks, same haggling; what changes:
//   - filling the board objective is NEED MET, not the end: the floor keeps
//     running and every later deal is an optional trade (endsOnFill false);
//   - the need sheet counts legal deals only (and this quarter's SAFE compute);
//   - a cash deal needs one quarter of payments as a deposit (budgetLeft is
//     the cash for deposits); a financed deal needs room on the capital line;
//   - the capital desk's fee is 0.11 / 0.13 / 0.16 per GPU-hour for 6 / 12 / 24
//     months, paid every quarter of the term, plus the CREDIT spread;
//   - B200 "Blackwell" blocks shout.
// run.venture (set by floor.js) carries { q, cash, lineLeft, spread, safe, objective }.

import { buyerMode } from '../modes/buyer.js';
import { C, VENTURE_RULES } from './constants.js';
import { termQOf, depositFor, startQOf } from './state.js';
import { evaluate, legalFor, equivRate, boardOrder } from './objectives.js';
import { contractValue } from '../data/gpus.js';
import { round2, usd, int } from '../util.js';

const M = (n) => `$${(n / 1e6).toFixed(1)}M`;

const SHOUTS = {
  blackwell: (l) => [`${int(l.qty)} B200s! BLACKWELL!`, 'NEXT GENERATION. RACKED IN THREE WEEKS.', `TRAINING MONEY? ${int(l.qty)} B200.`],
};

// Which quarters a contract would run: whole quarters, from this one if the
// GPUs arrive within 30 days. Hours past the exit are marked to market.
function runsItem(run, { term, delivery }) {
  const q = run.venture ? run.venture.q : run.mandate.q;
  const from = startQOf(delivery, q);
  const to = from + termQOf(term) - 1;
  const past = Math.max(0, to - C.quarters);
  return { id: 'runs', ok: past === 0, warn: past > 0, label: `Runs Q${from}–Q${to}${past ? `: ${past} quarter${past > 1 ? 's' : ''} past the exit, marked to market` : ''}` };
}

export const ventureMode = {
  ...buyerMode,
  id: 'venture',
  ventureRules: VENTURE_RULES,
  endsOnFill: false,

  // The need sheet: this quarter's SAFE compute and legal deals in the order
  // they were taken (objectives.boardOrder), up to the objective's quantity.
  progress(run) { return evaluate(run.mandate, boardOrder((run.venture && run.venture.safe) || [], run.deals)); },
  secured(run) { return this.progress(run).secured; },

  spread(run) { return (run.venture && run.venture.spread) || 0; },
  financingFee(term) { return C.fee[term] ?? C.fee[12]; },
  budgetLeft(run) { return Math.max(0, run.mandate.budget - run.spent); },
  lineLeft(run) { return Math.max(0, run.mandate.capitalLine - (run.lineSpent || 0)); },

  // What signing takes now: a cash deal's deposit, or what a financed deal adds to the line.
  cost(run, { qty, rate, term, financed }) {
    const termQ = termQOf(term);
    if (!financed) return { deposit: depositFor(qty, rate, termQ), owed: 0 };
    return { deposit: 0, owed: Math.round(qty * (rate + this.financingFee(term) + this.spread(run)) * C.hoursQ * termQ) };
  },

  // While your paddle leads the 1 PM call the lot is nearly yours: what it will
  // take at the hammer (its deposit, else its capital-line use) is held back
  // from other deals, so the hammer can never land you past your cash or line.
  held(run) {
    const a = run.market && run.market.auction;
    if (!a || a.state !== 'calling' || a.leader !== 'you') return { cash: 0, line: 0 };
    const spec = { qty: a.lot.qty, rate: a.high, term: a.lot.baseTerm };
    const dep = this.cost(run, { ...spec, financed: false }).deposit;
    if (dep <= this.budgetLeft(run)) return { cash: dep, line: 0 };
    return { cash: 0, line: this.cost(run, { ...spec, financed: true }).owed };
  },

  // Live checks for the lot sheet and the tape. overBudget: a cash deal's
  // deposit is more than the cash left, or a financed one won't fit the line.
  checks(run, spec) {
    const { gpu, qty, term, rate, delivery, financed } = spec;
    const md = run.mandate;
    const value = contractValue(qty, rate, term);
    const eff = financed ? round2(rate + this.financingFee(term) + this.spread(run)) : rate;
    const { deposit, owed } = this.cost(run, spec);
    const held = this.held(run);
    const cash = Math.max(0, this.budgetLeft(run) - held.cash);
    const line = Math.max(0, this.lineLeft(run) - held.line);
    const overBudget = financed ? owed > line : deposit > cash;
    const eq = equivRate(md, gpu, eff);
    const per = gpu === md.gpu ? usd(eff) : `${usd(eff)} (${usd(eq)} per ${md.gpu})`;
    const optional = this.isFilled(run) || !legalFor(md, { gpu, delivery, term });
    return {
      value, eff, deposit, owed, overBudget, optional,
      items: [
        { id: 'chip', ok: md.accept.includes(gpu), label: md.accept.includes(gpu) ? `${gpu} ✓` : `${gpu} is not on the need sheet` },
        { id: 'delivery', ok: delivery <= md.deliveryDays, label: `Delivery ${delivery === 0 ? 'today' : `${delivery}d`}${delivery <= md.deliveryDays ? '' : ` > ${md.deliveryDays}d`}` },
        { id: 'term', ok: term >= md.minTerm, label: `${term} mo${term >= md.minTerm ? '' : ` < ${md.minTerm}`}` },
        { id: 'price', ok: eq <= md.target, warn: eq > md.target && eq <= md.walk, label: eq <= md.target ? `${per} under target` : eq <= md.walk ? `${per} over target` : `${per} over walk-away` },
        runsItem(run, spec),
        {
          id: 'budget', ok: !overBudget,
          label: financed
            ? (overBudget ? `Over the capital line by ${M(owed - line)}` : `Capital line ${M(owed)} of ${M(line)}`)
            : (overBudget ? `Deposit over cash by ${M(deposit - cash)}` : `Deposit ${M(deposit)} of ${M(cash)} cash`) + (held.cash || held.line ? ' (some held for your bid at the call)' : ''),
        },
      ],
    };
  },

  lotDeal(run, lot, opts) {
    const deal = buyerMode.lotDeal.call(this, run, lot, opts);
    if (deal.financed) deal.eff = round2(deal.rate + deal.fee + this.spread(run));
    return deal;
  },

  // Every deal can go to the capital desk (no deposit, a fee every quarter),
  // not only one over budget: cash or financing is the player's call.
  offersFinance() { return true; },

  // The hammer falls on your paddle: a cash deal if the deposit fits, else the capital desk carries it.
  auctionDeal(run, lot, price) {
    const deal = buyerMode.auctionDeal.call(this, run, lot, price);
    const financed = this.cost(run, { qty: lot.qty, rate: price, term: deal.term, financed: false }).deposit > this.budgetLeft(run);
    const fee = financed ? this.financingFee(deal.term) : 0;
    return { ...deal, financed, fee, eff: financed ? round2(price + fee + this.spread(run)) : price };
  },

  // Bid at the rostrum only while you could carry the lot (cash deposit or line).
  canBid(run) {
    const a = run.market.auction;
    if (!a || a.state !== 'calling') return true;
    const spec = { qty: a.lot.qty, rate: a.nextBid(0.05), term: a.lot.baseTerm };
    return this.cost(run, { ...spec, financed: false }).deposit <= this.budgetLeft(run)
      || this.cost(run, { ...spec, financed: true }).owed <= this.lineLeft(run);
  },

  // A signed deal: its id (the book entry's), whether it counted for the
  // board, and what it took from cash or the line. The floor never halts.
  recordDeal(run, deal) {
    const before = this.secured(run);
    const q = run.venture ? run.venture.q : run.mandate.q;
    deal.id = deal.id || `q${q}-${run.deals.length}`;
    deal.optional = before >= run.mandate.qty || !legalFor(run.mandate, deal);
    const { deposit, owed } = this.cost(run, deal);
    deal.deposit = deposit;
    run.deals.push(deal);
    run.spent += deposit;
    run.lineSpent = (run.lineSpent || 0) + owed;
    if (this.isFilled(run) && run.filledAt == null) run.filledAt = run.market.t;
  },

  shouts(char, run) {
    const lot = char.lotId ? run.market.lot(char.lotId) : null;
    const fn = lot && SHOUTS[lot.archetype];
    return fn ? fn(lot, run.mandate) : buyerMode.shouts.call(this, char, run);
  },

  intel(char, run) {
    if (char.role !== 'capital') return buyerMode.intel.call(this, char, run);
    const sp = this.spread(run);
    return {
      title: `${char.name} · ${char.firm}`,
      kicker: 'THE MONEY · CAPITAL DESK',
      body: [
        'No deposit: we carry the contract. You pay our fee on every hour of it, every quarter of the term.',
        `Fee: ${[6, 12, 24].map((t) => usd(this.financingFee(t))).join(' / ')} per GPU-hour on 6 / 12 / 24 months${sp ? `, plus ${usd(sp)} since rates went up` : ''}. It floats.`,
        `Your line today: ${M(this.lineLeft(run))}.`,
      ],
    };
  },
};
