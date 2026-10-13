// VENTURE MODE: the quarter economy. Pure functions: a state in, a new state
// and a report out, no DOM, no storage, no randomness (the event deck was
// shuffled when the venture began).
//
// A quarter closes in this order:
//   1. the floor's deals join the book; cash deals take their deposit
//   2. the board objective pays (tranche × price quality, or the pilot bonus) or is missed
//   3. the TRAIN ◄► SERVE lever: serve up to demand, train with the rest, pay
//      every active contract and the team
//   4. a cash shortfall: the first is bridged for equity, the second is SOLD FOR PARTS
//   5. the next card is drawn and the market moves (drift + regime)
//   6. after Q6, the exit: valuation, your stake, the tier
//
// Every contract is valued by what it does: the demand it serves, the
// training it adds, what it costs each quarter, and at the exit the market
// value of the hours it has left (losses in full, gains at half). Buying more
// than you can use is never rewarded on its own.

import { C, GPU_IDS } from './constants.js';
import { active, effNow, burnAt, priceNow, multiple, bookEntry, grant, clone, payQ, valuationEstimate } from './state.js';
import { optionOf, evaluate, payoff, objectiveLine, boardOrder } from './objectives.js';
import { EVENTS, drawEvent } from './events.js';
import { round2, clamp, int, usd } from '../util.js';

const M = (n) => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1e6).toFixed(1)}M`;
const pct = (x) => `${Math.round(x * 100)}%`;
export const leverOf = (share) => clamp(Number(share) || 0, 0, 1);

// 1. The floor's deals join the book (by id, so a deal is never booked twice).
function bookFloor(s, floor) {
  if (!floor || floor.q !== s.q) return;
  (floor.deals || []).forEach((d, i) => {
    const e = bookEntry(d, s.q, i);
    if (s.book.some((x) => x.id === e.id)) return;
    s.book.push(e);
    s.cash -= e.deposit;
  });
}

// 2. The board objective, counted in boardOrder (SAFE compute and the floor's deals as they were taken).
function board(s, floor) {
  const obj = optionOf(s.memo, s.memo && s.memo.chosen);
  const md = floor && floor.q === s.q ? floor.mandate : null;
  const mine = s.book.filter((e) => e.q === s.q && e.archetype !== 'start');
  const items = boardOrder(mine.filter((e) => e.src === 'safe'), mine.filter((e) => e.src !== 'safe'));
  const result = md ? evaluate(md, items) : null;
  if (result) for (const e of items) e.optional = !result.counted.includes(e.id);
  const pay = payoff(md ? obj : null, result);
  if (pay.met) { s.met += 1; s.cash += pay.cash; s.demand += pay.demand; } else s.missed += 1;
  return { obj, md, result, pay };
}

// 3. The close, at a lever share (0 = serve everything, 1 = train everything).
function close(s, share) {
  const q = s.q;
  let SC = 0, TC = 0, cost = 0, book = 0, paid = 0, paidCapital = 0;
  for (const e of s.book) {
    if (!active(e, q)) continue;
    SC += e.qty * C.serve[e.gpu];
    TC += e.qty * C.train[e.gpu];
    const accrued = e.qty * effNow(s, e) * C.hoursQ;
    cost += accrued;
    // Gross margin counts SAFE compute at its market price when granted:
    // paying in equity saves cash, it doesn't make serving cheaper.
    book += e.src === 'safe' ? e.qty * (e.bookRate || 0) * C.hoursQ : accrued;
    if (e.financed) { paid += accrued; paidCapital += accrued; continue; }
    // Cash contracts: the deposit paid at signing covers the last quarter.
    const base = payQ(e.qty, e.rate);
    paid += Math.max(0, Math.min(base, e.remaining - e.deposit));
    e.remaining = Math.max(0, e.remaining - base);
  }
  const D = s.demand;
  const served = Math.min(D, (1 - share) * SC);
  const price = priceNow(s);
  const revenue = Math.round(served * price * C.hoursQ);
  const payments = Math.round(paid);
  const burn = burnAt(q);
  s.cash += revenue - payments - burn;
  // Racks never sit idle: serving capacity nobody asked for trains, at 60%.
  const spare = Math.max(0, (1 - share) * SC - served);
  const trained = share * TC + (SC > 0 ? C.idleTrain * (spare / SC) * TC : 0);
  const from = s.model.level;
  s.model.progress += trained;
  let launched = 0;
  while (s.model.level < 4 && s.model.progress >= C.thresholds[s.model.level - 1]) { s.model.level += 1; launched += 1; s.priceMult = 1; }
  const unserved = D - served;
  const churned = C.churn * unserved;
  // Word of mouth, in a surge quarter (DEMAND or CRUNCH in force: customers are
  // shopping and rivals can't serve them all): serve everyone, with capacity to
  // spare, and you win new customers. Diminishing in the headroom.
  const reliable = unserved < 0.5;
  const surge = !!(s.pending.demand || s.pending.crunch);
  const headroom = reliable && D > 0 ? Math.max(0, (1 - share) * SC - D) / D : 0;
  const word = reliable && surge ? C.reliable.max * (1 - Math.exp(-Math.max(0, headroom - C.reliable.min) / C.reliable.h0)) : 0;
  s.demand = (D - churned) * (1 + C.growth) * C.launchJump ** launched * (1 + word);
  return {
    capacity: { serve: SC, train: TC }, demand: D, served, unserved, churned, spare, price, reliable, surge, headroom, word,
    revenue, cost: Math.round(cost), cogs: SC > 0 ? Math.round(book * (served / SC)) : 0, payments, paidCapital: Math.round(paidCapital), burn,
    trained, levelFrom: from, launched,
  };
}

// The forecast for the close at a lever share, without drawing the next card:
// what the quarter screen shows while you move the lever.
export function preview(s, share = 0) {
  const w = clone(s);
  bookFloor(w, w.floor);
  const b = board(w, w.floor);
  const c = close(w, leverOf(share));
  return {
    q: s.q, share: leverOf(share), met: b.pay.met, payoff: b.pay.cash, ...c,
    level: w.model.level, progress: w.model.progress, next: C.thresholds[w.model.level - 1] ?? null, demandNext: w.demand,
    cashEnd: w.cash, shortfall: w.cash < 0, bridge: w.cash < 0 && s.bridges === 0, soldForParts: w.cash < 0 && (s.bridges > 0 || w.cash + C.bridge.cash < 0),
  };
}

// Close the quarter: { next, report }. next is the state for the next quarter
// (phase 'report'), or the finished venture (phase 'over', with s.exit).
export function resolveQuarter(s0, { share = 0, floor = s0.floor } = {}) {
  if (s0.phase === 'over' || s0.dead) return { next: s0, report: null };
  const s = clone(s0);
  const q = s.q;
  const lever = leverOf(share);
  const cashStart = s.cashQ ?? s.cash;
  const lines = [];

  bookFloor(s, floor);
  const deposits = s.book.filter((e) => e.q === q && e.src === 'cash' && e.archetype !== 'start').reduce((t, e) => t + e.deposit, 0);
  const { obj, md, result, pay } = board(s, floor);
  lines.push(objectiveLine(obj, md, result, pay));
  for (const e of s.book.filter((x) => x.q === q && x.src === 'safe')) lines.push(`SAFE: ${e.firm} put ${int(e.qty)} ${e.gpu} on your book for ${e.termQ} quarters, for ${e.equityPct}% of the company.`);
  const optional = s.book.filter((e) => e.q === q && e.optional);
  if (optional.length) lines.push(`Optional trades: ${optional.length} contract${optional.length > 1 ? 's' : ''}, ${int(optional.reduce((t, e) => t + e.qty, 0))} GPUs, on their own merits (they don't count for the board).`);

  const c = close(s, lever);
  lines.push(`You served ${int(c.served)} of ${int(c.demand)} GPU-eq of demand${c.unserved >= 1 ? `. ${int(c.unserved)} went unserved, and ${int(c.churned)} of it left for rivals` : ''}.`);
  if (c.word >= 0.005) lines.push(`Customers went looking for capacity and you had ${pct(c.headroom)} to spare: demand +${(100 * c.word).toFixed(1)}% next quarter.`);
  else if (c.surge && !c.reliable) lines.push('Customers went looking for capacity this quarter, and you turned some away.');
  lines.push(`Revenue ${M(c.revenue)} at ${usd(c.price)} per GPU-hour (model v${c.levelFrom}).`);
  lines.push(`Compute paid ${M(c.payments)}${c.paidCapital ? ` (${M(c.paidCapital)} to the capital desk)` : ''}${deposits ? `, plus ${M(deposits)} of deposits at signing` : ''}. The team cost ${M(c.burn)}.`);
  if ((lever > 0 || c.spare > 0) && c.levelFrom < 4) lines.push(`Training: +${int(c.trained)} units (lever ${pct(lever)}${c.spare > 0 ? `, ${int(c.spare)} GPU-eq of spare serving capacity at ${pct(C.idleTrain)}` : ''}).`);
  if (c.launched) lines.push(`MODEL v${s.model.level} LAUNCHED: price up, demand × ${(C.launchJump ** c.launched).toFixed(2)}.`);
  else if (s.model.level < 4) lines.push(`Model v${s.model.level + 1}: ${int(s.model.progress)} of ${int(C.thresholds[s.model.level - 1])} training units.`);
  else if (c.spare > 0 || lever > 0) lines.push(`${int(c.spare + lever * c.capacity.serve)} GPU-eq sat idle: no model left to train, and no demand for it.`);

  // 4. A cash shortfall: the first one is bridged for equity, the second sells the company.
  let bridge = 0;
  if (s.cash < 0) {
    if (s.bridges === 0) {
      s.bridges = 1;
      bridge = C.bridge.cash;
      s.cash += bridge;
      s.capTable = grant(s.capTable, { name: C.bridge.investor, pct: C.bridge.equityPct, q, kind: 'bridge' });
      lines.push(`Cash ran out. The capital desk bridged you ${M(bridge)} for ${C.bridge.equityPct}% of the company.`);
    }
    if (s.cash < 0) { s.dead = true; lines.push('Cash ran out again. The company is SOLD FOR PARTS.'); }
  }
  const cash = { start: cashStart, deposits, payoff: pay.cash, revenue: c.revenue, payments: c.payments, burn: c.burn, bridge, end: s.cash };
  lines.push(`Cash ${M(cashStart)} → ${M(s.cash)}.`);

  // 5. Next quarter's card, then the market moves.
  s.pending = { enterprise: false, power: false, crunch: false, glut: false, demand: false }; // this quarter's cards are spent
  let event = null;
  if (!s.dead && q < C.quarters) {
    const id = drawEvent(s);
    event = { id, head: EVENTS[id].head, line: EVENTS[id].line };
    lines.push(`Next quarter: ${event.head}. ${event.line}`);
  }
  if (!s.dead && q < C.quarters) {
    const regime = C.regimes.find((r) => r.id === s.regime) || C.regimes[1];
    for (const g of GPU_IDS) s.market[g] = round2(s.market[g] * (1 + C.drift[g] + regime.drift));
  }

  const report = {
    q, share: lever,
    objective: obj ? { type: obj.type, qty: obj.qty, met: pay.met, secured: result ? result.secured : 0, safeQty: result ? result.safeQty : 0, quality: result ? result.q : 0, payoff: pay.cash, demand: pay.demand } : null,
    ...c, cash, level: s.model.level, progress: s.model.progress, launchedTo: c.launched ? s.model.level : null,
    event, bridged: bridge > 0, dead: s.dead, founderPct: s.capTable.founderPct, lines,
  };
  s.history.push(report);
  s.lastReport = report;
  // If you sold today: run-rate ARR × the multiple so far, plus cash (the exit
  // adds deposits and contracts marked to market). The office tracks it.
  const worth = s.dead ? 0 : Math.max(0, valuationEstimate(s) + s.cash);
  report.worth = { valuation: worth, stake: Math.round((worth * s.capTable.founderPct) / 100) };

  // 6. The end: SOLD FOR PARTS, or the exit after Q6.
  if (s.dead) {
    s.phase = 'over';
    s.exit = { soldForParts: true, q, valuation: 0, stake: 0, founderPct: s.capTable.founderPct, tier: 'SOLD FOR PARTS' };
  } else if (q >= C.quarters) {
    s.phase = 'over';
    s.exit = exitValue(s);
    report.lines.push(...s.exit.lines);
  } else {
    s.q = q + 1;
    s.phase = 'report';
    s.burn = burnAt(s.q);
  }
  return { next: s, report };
}

// Mark-to-market of the contract hours left after Q6, per contract:
// (1 − haircut) × bench at the exit − the effective rate. Losses count in
// full, gains at half (resale friction): hoarding cheap capacity isn't free money.
export function markToMarket(s) {
  const E = C.exit;
  let losses = 0, gains = 0;
  for (const e of s.book) {
    const left = Math.max(0, e.endQ - Math.max(e.startQ, C.quarters + 1));
    if (!left) continue;
    const v = left * C.hoursQ * e.qty * ((1 - E.haircut) * s.market[e.gpu] - effNow(s, e));
    if (v < 0) losses += v; else gains += v;
  }
  losses = Math.round(losses);
  gains = Math.round(gains);
  return { losses, gains, net: Math.round(losses + E.gainShare * gains) };
}

// Deposits still to be credited against payments after the exit (an asset).
export const unconsumedDeposits = (s) => s.book.reduce((t, e) => t + (e.financed ? 0 : Math.min(e.deposit, e.remaining)), 0);

export const tierFor = (stake) => (C.tiers.find((t) => stake >= t.min) || C.tiers[C.tiers.length - 1]).id;

// The exit after Q6: the company's valuation and your stake in it.
export function exitValue(s) {
  const h = s.history;
  const h6 = h[h.length - 1];
  const h4 = h[h.length - 3];
  const ARR = 4 * h6.revenue;
  const g = h4 && h4.revenue > 0 ? h6.revenue / h4.revenue - 1 : 0;
  const gm = h6.revenue > 0 ? (h6.revenue - h6.cogs) / h6.revenue : -1;
  const mult = multiple(s, { g, gm });
  const mtm = markToMarket(s);
  const deposits = unconsumedDeposits(s);
  const valuation = Math.max(0, Math.round(ARR * mult + s.cash + deposits + mtm.net));
  const founderPct = s.capTable.founderPct;
  const stake = Math.round((valuation * founderPct) / 100);
  const tier = tierFor(stake);
  const lines = [
    `Exit: ${M(ARR)} ARR × ${mult.toFixed(2)} (${h6.revenue > 0 ? `growth ${pct(g)}, gross margin ${pct(gm)}` : 'no revenue'}${s.missed ? `, ${s.missed} missed objective${s.missed > 1 ? 's' : ''}` : ''}) + ${M(s.cash)} cash${deposits ? ` + ${M(deposits)} deposits` : ''}${mtm.net ? ` ${mtm.net < 0 ? '−' : '+'} ${M(Math.abs(mtm.net))} contracts marked to market` : ''} = ${M(valuation)}.`,
    `You own ${founderPct.toFixed(1)}%: your stake is ${M(stake)}. ${tier}.`,
  ];
  return { soldForParts: false, q: s.q, valuation, stake, founderPct, ARR, multiple: mult, g, gm, cash: s.cash, deposits, mtm, missed: s.missed, tier, lines };
}
