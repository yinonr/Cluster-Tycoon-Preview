// THE TRADING ECONOMY (Deal Lab v5, V3 experiment). You run a trading desk: a
// customer's order to fill at their price, and an aftermarket for what you don't
// deliver. Lab-only: the Daily and Venture Mode never import this module.
//
// The ledger, per supply contract, in GPU-hours (730 a month, like contractValue):
//   cost       qty × effective rate (financing in) × term: the whole commitment
//   customer   GPUs allocated to the order × the customer's price × their months
//   sold       spare GPUs sold to an aftermarket buyer: their price × the contract's term
//   idle       capacity you hold but don't deliver or sell (months past the customer's on
//              allocated GPUs, spare GPUs never sold): sublet at SUBLET under your rate
//   net        customer + sold + idle − cost: "booked margin" (contracted, not cash)
// Every GPU-month lands in exactly one line, so a resale replaces a sublet, never adds to it.
// Allocation is fixed at signing: a contract's GPUs go to the order (if it meets the order:
// GPU, delivery, the customer's months) up to what the order still needs; the rest is spare.
//
// The score: ORDER (4,000 × the share of the order filled) + MARGIN (400 a cent of booked
// margin per GPU-hour of the order). Filling a GPU at a loss worse than 10¢ an hour costs
// points; a GPU never filled earns none; a trade earns only what it books.
//
// Aftermarket buyers are drawn at setup from stream(seed, 'lab', 'after') and arrive on the
// market's own clock: independent of what you buy, finite, and not always worth selling to.

import { round2, stream, usd, int, pickAt } from '../util.js';
import { useMonths } from './wants.js';
import { BUYER_COMPANIES, FIRST_NAMES } from '../data/names.js';

export const ECON = {
  scale: 1.5,          // the customer's order, against the Daily's need sheet (whole steps)
  bigLong: 0.4,        // share of floors whose 24-month desk keeps the Daily's double block
  over: 0.05,          // the customer pays the need sheet's target + this (about the board less 8¢)
  sublet: 0.12,        // $/GPU-hr under your rate that idle capacity is sublet at
  fillPts: 4000,       // a full order
  centPts: 400,        // per cent of booked margin per GPU-hour of the order
  hours: 730,          // GPU-hours a month
  buyers: { second: 0.6, first: [60, 115], gap: [45, 75], window: [40, 55] },
  // A buyer's bid against the board when they arrive: rich, about the market, or a lowball.
  bid: [{ w: 3, v: [0.0, 0.08] }, { w: 3, v: [-0.1, -0.01] }, { w: 2, v: [-0.3, -0.15] }],
  room: [0.02, 0.08],  // how far over their bid they'd go (hidden until they say "final")
  share: [1, 3],       // their order, in the Daily's steps (a quarter of its need sheet each)
  walkOver: 0.15,      // a counter this far over their limit and they walk
};

const H = ECON.hours;

// Money, signed and short: +$412K, −$1.20M.
export function money(x) {
  const a = Math.abs(x);
  const v = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${Math.round(a / 1e3)}K` : `$${Math.round(a)}`;
  return `${x < 0 ? '−' : '+'}${v}`;
}
const lerp = (a, b, u) => a + (b - a) * u;

// The real price of a GPU-hour you deliver: your rate plus the idle months, sublet at a loss.
export function econReal(run, term, eff) {
  const U = useMonths(run);
  return round2(eff + (term > U ? ECON.sublet * (term - U) / U : 0));
}

// The customer's price for a GPU: one price, or one per GPU (Tycoon mode: a better fit for their work pays more).
export const priceOf = (md, gpu) => (md.priceFor && md.priceFor[gpu] != null ? md.priceFor[gpu] : md.price);

// Can this contract serve the order? (the order's GPU, delivery and the customer's months)
export const servesOrder = (md, d) => md.accept.includes(d.gpu) && d.delivery <= md.deliveryDays && d.term >= md.minTerm;
export const spareLeft = (d) => d.qty - (d.alloc || 0) - (d.sold || 0);

// ---- The ledger -----------------------------------------------------------------
export function dealLedger(run, d) {
  const md = run.mandate, U = useMonths(run);
  const alloc = d.alloc || 0, sold = d.sold || 0, spare = d.qty - alloc - sold;
  const cost = d.qty * d.eff * d.term * H;
  const fin = d.qty * (d.eff - d.rate) * d.term * H;
  const customer = alloc * priceOf(md, d.gpu) * Math.min(d.term, U) * H;
  const back = Math.max(0, d.eff - ECON.sublet);
  const idle = alloc * back * Math.max(0, d.term - U) * H + spare * back * d.term * H;
  const sales = d.saleRev || 0;
  return { d, alloc, sold, spare, cost, fin, customer, idle, sales, net: customer + sales + idle - cost };
}

export function ledger(run) {
  const md = run.mandate;
  const rows = run.deals.filter((d) => !d.push).map((d) => dealLedger(run, d));
  const sum = (k) => rows.reduce((s, x) => s + x[k], 0);
  const filled = sum('alloc');
  const U = useMonths(run), loss = (d) => Math.min(d.eff, ECON.sublet);
  // The same margin as the story of the round (they add up to net): what the customer order made
  // at your rates, what idle months and unsold spares lost when sublet, what the sales made over cost.
  const story = {
    delivered: rows.reduce((t, x) => t + x.alloc * (priceOf(md, x.d.gpu) - x.d.eff) * Math.min(x.d.term, U) * H, 0),
    idleMonths: -rows.reduce((t, x) => t + x.alloc * loss(x.d) * Math.max(0, x.d.term - U) * H, 0),
    unsold: -rows.reduce((t, x) => t + x.spare * loss(x.d) * x.d.term * H, 0),
    salesGain: rows.reduce((t, x) => t + x.sales - x.sold * x.d.eff * x.d.term * H, 0),
  };
  return {
    rows, filled, fill: Math.min(1, filled / md.qty), story,
    customer: sum('customer'), sales: sum('sales'), idle: sum('idle'), cost: sum('cost'), fin: sum('fin'), net: sum('net'),
    spare: sum('spare'), sold: sum('sold'), bought: rows.reduce((s, x) => s + x.d.qty, 0),
  };
}

// Points for a share of the order and a booked margin (additive: the deals' points sum to the score).
export function econPts(run, alloc, net) {
  const md = run.mandate;
  return {
    fill: Math.round(ECON.fillPts * Math.min(1, alloc / md.qty)),
    margin: Math.round(ECON.centPts * 100 * net / (md.qty * useMonths(run) * H)),
  };
}

export function econScore(run, L = ledger(run)) {
  const p = econPts(run, L.filled, L.net);
  return { total: p.fill + p.margin, fill: p.fill, margin: p.margin, L };
}

// ---- Aftermarket buyers ---------------------------------------------------------------
// Drawn now, in this order, whatever is used; they arrive at their floor time.
export function planBuyers(run, dailyQty) {
  const md = run.mandate, m = run.market;
  const r = stream(run.seed, 'lab', 'after');
  const B = ECON.buyers;
  const n = r.next() < B.second ? 2 : 1;
  const step = dailyQty / 4;
  const taken = new Set(m.characters.map((c) => c.name));
  const firms = BUYER_COMPANIES.filter((c) => c.name !== md.company && (!run.matched || c.name !== run.matched.founder.firm));
  const names = FIRST_NAMES.filter((x) => !taken.has(x));
  const other = md.gpu === 'H100' ? 'H200' : 'H100';
  const list = [];
  let at = lerp(B.first[0], B.first[1], r.next());
  for (let i = 0; i < n; i++) {
    const u = { firm: r.next(), name: r.next(), gpu: r.next(), qty: r.next(), term: r.next(), deliv: r.next(), room: r.next(), window: r.next(), gap: r.next(), bid: r.next() };
    const band = r.weighted(ECON.bid);
    const firm = pickAt(firms.filter((f) => !list.some((b) => b.firm === f.name)), u.firm) || firms[0];
    list.push({
      id: `buyer${i + 1}`,
      firm: firm.name, sector: firm.sector,
      name: pickAt(names.filter((x) => !list.some((b) => b.name === x)), u.name) || 'Sam',
      gpu: u.gpu < 0.75 ? md.gpu : other,
      qty: step * (ECON.share[0] + Math.floor(u.qty * (ECON.share[1] - ECON.share[0] + 1))),
      minTerm: u.term < 0.5 ? 6 : 12,
      delivery: u.deliv < 0.3 ? 90 : 30,
      u: round2(lerp(band[0], band[1], u.bid)),
      room: round2(lerp(ECON.room[0], ECON.room[1], u.room)),
      window: Math.round(lerp(B.window[0], B.window[1], u.window)),
      at: Math.round(at),
      state: 'due', // due → open → (final) → sold | walked | gone
    });
    at += lerp(B.gap[0], B.gap[1], u.gap);
  }
  return scheduleBuyers(run, list);
}

// Put buyers on the floor's clock (each arrives at b.at, if there's time left for them).
export function scheduleBuyers(run, list) {
  const m = run.market;
  run.labBuyers = list;
  for (const b of list) if (b.at < m.duration - 20) m.at(b.at, () => arrive(run, b));
  return list;
}

function arrive(run, b) {
  const m = run.market;
  if (m.closed || b.state !== 'due') return;
  b.state = 'open';
  b.bid = round2(m.bench[b.gpu] + b.u);
  b.limit = round2(b.bid + b.room);
  b.endsAt = Math.min(m.duration, m.t + b.window);
  m.bulletin({ headline: `BUYER ON THE FLOOR · ${b.firm.toUpperCase()}`, sub: `Wants ${int(b.qty)} ${b.gpu}, ${b.minTerm}+ months${b.delivery > 30 ? ', any delivery' : ''}. Bids ${usd(b.bid)}. Got spares?`, tone: 'flat', buyer: b.id });
  m.at(b.endsAt, () => {
    if (b.state !== 'open' && b.state !== 'final') return;
    b.state = 'gone';
    m.bulletin({ headline: `${b.firm.toUpperCase()} LEFT THE FLOOR`, sub: 'Their bid went unfilled.', tone: 'flat' });
  });
}

export const buyerLive = (b) => b.state === 'open' || b.state === 'final';
export const liveBuyers = (run) => (run.labBuyers || []).filter(buyerLive);

// Your contracts a buyer can take: their GPU, their months or longer, delivering in time, with
// spares. Held capacity from earlier quarters (Tycoon: run.labHoldings, its months left as its
// term) comes first: it's aging, and holding it costs.
const stock = (run) => [...(run.labHoldings || []), ...run.deals.filter((d) => !d.push)];
export const spareFor = (run, b) => stock(run).filter((d) => d.gpu === b.gpu && d.term >= b.minTerm && d.delivery <= b.delivery && spareLeft(d) > 0);
export const sellable = (run, b) => Math.min(b.qty, spareFor(run, b).reduce((s, d) => s + spareLeft(d), 0));
// The price on the table: their bid, or their final number after your counter.
export const askOf = (b) => (b.state === 'final' ? b.final : b.bid);

// What selling the spares at a price books: against their cost, and against subletting them.
export function saleMath(run, b, price) {
  let left = sellable(run, b), cost = 0, rev = 0, sublet = 0, months = 0;
  for (const d of spareFor(run, b)) {
    const k = Math.min(left, spareLeft(d));
    if (k <= 0) break;
    cost += k * d.eff * d.term * H;
    rev += k * price * d.term * H;
    sublet += k * Math.max(0, d.eff - ECON.sublet) * d.term * H;
    months = Math.max(months, d.term);
    left -= k;
  }
  return { qty: sellable(run, b), rev, cost, vsCost: rev - cost, vsSublet: rev - sublet, months };
}

// Settle once: the buyer takes over your spare GPUs (whole contract terms) at the price.
// For equity (Tycoon mode, a buyer who offers it): no cash, so the GPUs' revenue is nothing;
// the stake is the price's worth of the company at their valuation, paper until they exit.
function settle(run, b, price, { equity = false } = {}) {
  if (!buyerLive(b) || run.market.closed) return null;
  const qty = sellable(run, b);
  if (qty <= 0) return null;
  const math = saleMath(run, b, price);
  let left = qty;
  const legs = [];
  for (const d of spareFor(run, b)) {
    const k = Math.min(left, spareLeft(d));
    if (k <= 0) break;
    d.sold = (d.sold || 0) + k;
    d.saleRev = (d.saleRev || 0) + (equity ? 0 : k * price * d.term * H);
    legs.push({ qty: k, term: d.term, eff: d.eff, gpu: d.gpu, held: !!d.held,
      ...(run.tycoon?.marketVersion === 62 ? { source: d.id || d.lotId, delivery: d.delivery } : {}) });
    left -= k;
  }
  b.state = 'sold';
  // New shares at their valuation: (old × V + I) / (V + I) of the company after (Tycoon's convention).
  const before = b.stake || 0, after = equity ? (before * b.val + math.rev) / (b.val + math.rev) : before;
  const stake = equity ? { before, after, pct: round2(100 * after), val: b.val, worth: math.rev } : null;
  const sale = { buyer: b.firm, client: b.client || null, name: b.name, gpu: b.gpu, qty, price, t: run.market.t, legs, ...math, ...(equity ? { rev: 0, vsCost: -math.cost, vsSublet: -(math.rev - math.vsSublet), equity: stake } : {}) };
  b.sale = sale;
  if (run.tycoon?.marketVersion === 62) sale.work = b.work || 'serve';
  (run.labSales = run.labSales || []).push(sale);
  run.market.bulletin(equity
    ? { headline: `EQUITY · ${int(qty)} ${b.gpu} TO ${b.firm.toUpperCase()}`, sub: `You'll own ${stake.pct}% of the company${before ? ` (from ${round2(100 * before)}%)` : ''}. No cash: worth something only if they make it.`, tone: 'flat' }
    : { headline: `SOLD · ${int(qty)} ${b.gpu} TO ${b.firm.toUpperCase()}`, sub: `At ${usd(price)}. ${math.vsCost >= 0 ? `+$${int(math.vsCost)} over what you paid.` : `$${int(-math.vsCost)} under what you paid, $${int(math.vsSublet)} better than subletting.`}`, tone: 'down' });
  return sale;
}

// Compute for equity: only with a buyer who offers it, at the price on the table.
export function sellForEquity(run, b) { return buyerLive(b) && b.equityOk && b.val > 0 ? settle(run, b, askOf(b), { equity: true }) : null; }

// SELL at the price on the table.
export function sellTo(run, b) { return buyerLive(b) ? settle(run, b, askOf(b)) : null; }

// One counter: at or under their limit, done; far over it, they walk; otherwise their final
// number (their real limit). A second counter walks them.
export function counterBuyer(run, b, price) {
  if (!buyerLive(b) || sellable(run, b) <= 0) return { kind: 'none' };
  price = round2(price);
  if (b.state === 'final') { b.state = 'walked'; return { kind: 'walk', line: 'I said final. I’m out.' }; }
  if (price <= b.limit + 1e-9) { const sale = settle(run, b, price); return { kind: 'deal', sale, line: 'Done. Send the paper.' }; }
  if (price - b.limit >= ECON.walkOver - 1e-9) { b.state = 'walked'; return { kind: 'walk', line: 'Not even close. I’ll find it elsewhere.' }; }
  b.state = 'final';
  b.final = b.limit;
  return { kind: 'final', price: b.final, line: `Can’t go there. ${usd(b.final)}, final.` };
}
