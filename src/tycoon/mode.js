// TYCOON MODE (V6): the Deal Lab's floor (src/modes/lab.js) as one quarter of an ongoing
// game (game.js). Same desks, wants, Dealcraft, Market Pulse and aftermarket; the order
// comes from the game's startups, the score is the Tycoon Score, and the floor's end
// settles the quarter instead of printing a tape.

import { labMode } from '../modes/lab.js';
import { setupQuarter, summarizeQuarter, liveQuarter, gameScore, scoreOf, TY } from './game.js';
import { dealLedger, priceOf, money, ledger } from '../modes/economy.js';
import { WORK, badge, fitTag, fitOf, powerOf } from './gpu.js';
import { usd, int, esc } from '../util.js';

const persist = (run) => { if (run.tyStore) run.tyStore.draft(summarizeQuarter(run, run.tycoon)); };

export const tycoonMode = {
  ...labMode,
  id: 'tycoon',
  tycoon: true,
  scoreVersion: 'tycoon1',
  needTitle: 'CLIENT ORDER',
  finishLabel: 'FINISH QUARTER',
  filledTag: 'ORDER FILLED',
  filledStamp: 'ORDER FILLED',
  pulseAll: true, // the Pulse lists every GPU on the floor: the startups need more than the order's

  createRun(opts) {
    const run = labMode.createRun.call(this, opts);
    run.tycoon = opts.game;
    run.tyStore = opts.store || null;
    setupQuarter(run, opts.game);
    return run;
  },

  // The running score: the saved game plus what this floor has done so far.
  liveScore(run) { return gameScore(run.tycoon, liveQuarter(run, run.tycoon)); },

  recordDeal(run, deal) { labMode.recordDeal.call(this, run, deal); persist(run); },
  onSale(run) { persist(run); },
  onBackOut(run, lot) { (run.tyBackOuts = run.tyBackOuts || []).push({ firm: lot.firm }); persist(run); },

  // The signing stamp: the grade, and what this deal adds to the Tycoon Score.
  stamp(run, deal) {
    const st = labMode.stamp.call(this, run, deal);
    if (!st || deal.push) return st;
    const net = dealLedger(run, deal).net;
    const units = (deal.alloc || 0) * 3 * powerOf(run.mandate.work || 'serve', deal.gpu);
    const n = run.deals.filter((d) => d.firm === deal.firm && !d.auction).length;
    const clout = !deal.auction && n <= TY.clout.supplierPerQ ? TY.clout.supplier : 0;
    const p = scoreOf(net, clout, units);
    st.pts = p.total;
    st.line = [`PROFIT ${p.profit >= 0 ? '+' : '−'}${int(Math.abs(p.profit))} (${money(net)})`, `COMPUTE +${int(p.cp)}`, clout ? `CLOUT +${clout}` : '', deal.alloc < deal.qty ? `${int(deal.qty - deal.alloc)} spare: sell them or they're sublet at a loss` : ''].filter(Boolean).join(' · ');
    return st;
  },

  // The order is for GPUs that fit the client's work, any accepted type, each at its own price.
  needBig(run) { return `${int(run.mandate.qty)} GPUs`; },
  openingBulletin(run) {
    const md = run.mandate, g = run.tycoon, best = md.accept.find((x) => fitOf(md.work || 'serve', x, run.market.bench) === 'match') || md.gpu;
    return { headline: `Q${g.q} · ${md.company.toUpperCase()} NEEDS ${int(md.qty)} GPUS`, sub: `${WORK[md.work || 'serve'].label}, ${md.minTerm} months. Best fit ${best} at ${usd(priceOf(md, best))}. Other startups come onto the floor later.`, tone: 'flat' };
  },
  needLine(run) {
    const md = run.mandate, need = this.need(run);
    return need > 0
      ? `${esc(md.company.toUpperCase())} · ${int(need)} GPUs to go · ${md.minTerm} months · pays ${md.accept.map((x) => `${x} ${usd(priceOf(md, x))}`).join(' · ')}`
      : 'ORDER FILLED · anything you buy now is spare: sell it to a startup on the floor, or it’s sublet at a loss';
  },
  filledBulletin(run) { return { headline: 'CLIENT ORDER FILLED', sub: `${money(ledger(run).net)} booked this quarter. Trade on, or finish the quarter.`, tone: 'down' }; },
  needCardExtra(run) { return `<li>Work: <b>${esc(WORK[run.mandate.work || 'serve'].label)}</b> · commit past your cash and the capital desk charges a fee</li>`; },
  priceLine(run) {
    const md = run.mandate, bench = run.market.bench;
    return `<li class="ty-prices">Pays ${md.accept.map((g) => `${badge(g)} <b>${usd(priceOf(md, g))}</b> ${fitTag(fitOf(md.work || 'serve', g, bench))}`).join(' · ')}</li>`;
  },
  posExtra(run) {
    const L = ledger(run), s = summarizeQuarter(run, run.tycoon);
    const held = (run.labHoldings || []).reduce((t, h) => t + h.qty - h.sold, 0);
    return `<div>CASH <b>$${(run.tycoon.cash / 1e6).toFixed(1)}M</b> · SPARE <b>${int(L.spare)}</b>${held ? ` · HELD <b>${int(held)}</b>` : ''} · BOOKED <b class="${s.booked < 0 ? 'neg' : ''}">${money(s.booked)}</b></div>`;
  },
  // The lot sheet's product line: the GPU's badge and how it fits the client's work.
  prodLine(run, lot) {
    const md = run.mandate;
    const fit = md.accept.includes(lot.gpu) ? fitOf(md.work || 'serve', lot.gpu, run.market.bench) : 'wrong';
    return `${int(lot.qty)} × ${badge(lot.gpu)}${lot.divisible ? ` (min ${int(lot.minQty)})` : ' · whole block'} ${fitTag(fit)} <small>for ${esc(md.company)}</small>`;
  },
  // Only a lot that can serve the order (its GPU, delivery and the client's months) gets a fit tag.
  pulseFit(run, lot) { const md = run.mandate; return md.accept.includes(lot.gpu) && lot.delivery <= md.deliveryDays && lot.terms.some((t) => t >= md.minTerm) ? fitOf(md.work || 'serve', lot.gpu, run.market.bench) : null; },

  // The floor's end settles the quarter (the cycle screen shows it).
  afterFloor(ctx, run) {
    ctx.tycoon.settle(summarizeQuarter(run, run.tycoon));
    ctx.go('cycle');
  },
  ledgerHTML: null,
};
