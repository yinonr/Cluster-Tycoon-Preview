import { makeLots } from './exchange.js';
// V7's prepaid-quarter trading adapter. Protected V6 contracts are never migrated.
// Money uses integer cents; inventory represents transferable, prepaid service rights.
import { stream } from '../util.js';
import { SELLER_FIRMS } from '../data/names.js';
import { HOURS_PER_MONTH } from '../data/gpus.js';
import { newGame, settleQuarter, emptySummary, paperValue } from './game.js';
import { supplierOf } from './suppliers.js';
import { powerOf } from './gpu.js';
import { investment, makeVCOffers } from './arcade-vc.js';
import { openingNegotiation, counteroffer } from './arcade-negotiation.js';
import { fortune, wealthScore, opportunityTier } from './wealth.js';
import { makeMandate } from './mandate.js';
import { makeBuyers } from './arcade-buyers.js';

export const V7 = { key: 'hsc-tycoon-v10', version: 100, cash: 6500000, rounds: 18, seconds: 72, months: 3, hours: HOURS_PER_MONTH * 3 };
export const cents = (qty, rate) => qty * rate * V7.hours; // rate: cents/GPU-hour
export const remaining = o => o.qty - o.delivered;
export const inventoryCost = g => g.arcade.inventory.reduce((n, x) => n + x.left * x.unitCost, 0);
export const cash = g => Math.round(g.cash * 100);
export const activeLot = g => g.arcade.lots.find(l => l.id === g.arcade.active);
export const available = (g, l) => g.phase === 'floor' && l.status === 'open' && l.at <= g.arcade.time && l.until > g.arcade.time && l.cooldown <= g.arcade.time;
export const owned = (g, gpu) => g.arcade.inventory.filter(x => x.gpu === gpu).reduce((n, x) => n + x.left, 0);
const byClient = (g, id) => g.startups.find(s => s.id === id);
export const cashCapacity = (g, o) => Math.max(0, Math.min(remaining(o), Math.floor(Math.round(byClient(g, o.client).cash * 100) / cents(1, o.rate))));
const rel = (g, firm) => g.firms[firm] ||= { trust: 0, deals: 0 };
export function notice(g, text, tone = 'plain') { g.arcade.message = { text, tone }; }

export function createArcade(seed) {
  const g = newGame(seed, {}, { marketVersion: 62, supplierVersion: 64 });
  g.cash = V7.cash / 100;
  // Scrappy startup scale; retain the existing archetypes, cash runway and cap tables.
  for (const s of g.startups) for (const field of ['val', 'val0', 'cash', 'burn']) s[field] = Math.round(s[field] / 25);
  g.arcade = { mandateCompleted: false, mandateHistory: [], version: V7.version, rev: 0, anchor: g.startups[0].id, history: [], receipts: [], signing: null, investments: {}, secondarySales: [], equityLifecycle: [], vcOffers: [], assistance: false };
  openQuarter(g);
  return g;
}

export function openQuarter(g) {
  if (!g?.arcade || g.q > V7.rounds || !['ready', 'report'].includes(g.phase)) return false;
  const a = g.arcade, r = stream(g.seed, 'v77-floor', g.q);
  const tier = opportunityTier(g);
  let anchor = byClient(g, a.anchor);
  if (!anchor?.alive || anchor.exited) anchor = g.startups.find(s => s.alive && !s.exited);
  if (!anchor) return false;
  a.anchor = anchor.id;
  Object.assign(a, { time: 0, active: null, confirm: null, lots: [], orders: [], inventory: [], deliveries: [], purchases: [], completions: [], message: null, startCash: cash(g), startProfit: g.profit });
  a.buyers = makeBuyers(g.seed, g.q, g.startups, tier); a.sales = [];
  const clients = [anchor, ...g.startups.filter(s => s !== anchor && s.alive && !s.exited)].slice(0, tier ? 3 : 1);
  for (const [i, s] of clients.entries()) {
    const gpu = s.work === 'train' ? 'B200' : s.work === 'memory' ? 'H200' : 'H100';
    const rate = { H100: 258, H200: 329, B200: 510 }[gpu] + r.int(-4, 4);
    a.orders.push({ id: `q${g.q}-${s.id}`, client: s.id, name: s.name, gpu, qty: i === 0 ? 16 + Math.min(16, (g.q - 1) * 2) : 8 + 4 * i, delivered: 0, rate, milestone: false, critical: (g.q+i)%3===0 });
  }
  for (const s of g.startups) {
    const o = a.orders.find(o => o.client === s.id);
    s.v7NeedUnits = o ? o.qty * V7.months * powerOf(s.work, o.gpu) : null;
  }
  a.lots = makeLots(g, tier);
  a.vcOffers = makeVCOffers(g);
  a.mandate = makeMandate(g, tier);
  g.phase = 'floor';
  notice(g, `Start with ${anchor.name}: buy a small matching lot, then deliver for cash to fund your next deal.`);
  return true;
}

export function advance(g, dt) {
  if (g.phase !== 'floor' || g.arcade.active || g.arcade.confirm || !Number.isFinite(dt) || dt <= 0) return false;
  g.arcade.time = Math.min(V7.seconds, g.arcade.time + Math.min(dt, 1));
  for (const l of g.arcade.lots) if (l.status === 'open' && l.until <= g.arcade.time) l.status = 'expired';
  if (g.arcade.time >= V7.seconds) closeQuarter(g);
  return true;
}

export function claim(g, id) {
  const l = g.arcade.lots.find(x => x.id === id);
  if (g.arcade.signing || g.arcade.active || g.arcade.confirm || !l || !available(g, l)) return false;
  l.negotiation ||= openingNegotiation(g,l);
  if (l.negotiation.closed) return false;
  g.arcade.active = id;
  notice(g, 'Opportunity claimed. No money spent. The floor is paused while you decide.');
  return true;
}

export function leave(g) {
  const l = activeLot(g);
  if (g.arcade.signing || !l || l.negotiation.running) return false;
  // Reopening keeps quotes and attempts; cooling off consumes live floor time.
  l.cooldown = g.arcade.time + 5;
  g.arcade.active = null;
  notice(g, 'Back on the floor. This quote and its used attempts are remembered.');
  return true;
}

export const haggle = counteroffer;

export function buy(g) {
  const l = activeLot(g), n = l?.negotiation;
  if (g.phase !== 'floor' || !n || n.running || n.closed || !available(g,l)) return false;
  const cost = cents(l.qty, n.price);
  if (!Number.isSafeInteger(cost) || cost <= 0 || n.price < l.floor || cost > cash(g)) return false;
  g.cash = (cash(g) - cost) / 100;
  l.status = 'sold'; n.closed = true;
  const purchase = { id: l.id, gpu: l.gpu, qty: l.qty, left: l.qty, unitCost: cents(1, n.price), firm: l.firm, cost, q: g.q };
  g.arcade.inventory.push(purchase); g.arcade.purchases.push({ ...purchase });
  const f = rel(g, l.firm); f.deals++;
  // No extra reward from reload/sign duplication or repeated slices of one lot.
  const signed = g.arcade.purchases.filter(p => p.firm === l.firm).length;
  if (signed <= 2) { f.trust = Math.min(12, f.trust + 1); g.clout += 4; }
  g.arcade.active = null;
  notice(g, `${l.qty} ${l.gpu} secured. Paid in full. Deliver to a matching startup to earn cash or equity. Trust +${signed <= 2 ? 1 : 0}.`, 'good');
  return true;
}

export function deliveryQuote(g, orderId, qty, payment) {
  const o = g.arcade.orders.find(o => o.id === orderId), s = o && byClient(g, o.client);
  if (g.phase !== 'floor' || !o || !s?.alive || s.exited || !Number.isSafeInteger(qty) || qty <= 0 || qty > remaining(o) || !['cash', 'equity'].includes(payment) || qty > owned(g, o.gpu)) return null;
  let left = qty, cost = 0; const legs = [];
  for (const x of g.arcade.inventory.filter(x => x.gpu === o.gpu && x.left)) {
    const take = Math.min(left, x.left); left -= take; cost += take * x.unitCost; legs.push({ id: x.id, qty: take });
    if (!left) break;
  }
  const value = cents(qty, o.rate);
  if (payment === 'cash' && Math.round(s.cash * 100) < value) return null;
  return { orderId, qty, payment, cost, value, revenue: payment === 'cash' ? value : 0, legs, stake: (s.stake * s.val + value / 100) / (s.val + value / 100) };
}

export function prepareDelivery(g, orderId, qty, payment) {
  if (g.arcade.active || g.arcade.confirm) return false;
  const quote = deliveryQuote(g, orderId, qty, payment);
  if (!quote) return false;
  g.arcade.confirm = { orderId, qty, payment }; return true;
}

export function deliver(g) {
  const pending = g.arcade.confirm;
  if (!pending || g.arcade.active) return false;
  const d = deliveryQuote(g, pending.orderId, pending.qty, pending.payment);
  if (!d) return false;
  const o = g.arcade.orders.find(x => x.id === d.orderId), s = byClient(g, o.client);
  for (const leg of d.legs) g.arcade.inventory.find(x => x.id === leg.id).left -= leg.qty;
  o.delivered += d.qty;
  g.cash = (cash(g) + d.revenue) / 100;
  // Equity is expensed supply, never realized cash or paper profit.
  g.profit = (Math.round(g.profit * 100) + d.revenue - d.cost) / 100;
  if (d.payment === 'cash') s.cash -= d.value / 100;
  else { s.stake = d.stake; s.val += d.value / 100; const inv=investment(g,s.id); inv.basis+=d.cost; inv.invested+=d.cost; inv.serial++; }
  g.arcade.deliveries.push({ ...d, client: s.id, gpu: o.gpu, work: s.work });
  if (!remaining(o) && !o.milestone) {
    o.milestone = true; s.trust++; g.clout += 40;
    g.arcade.completions.push(`${s.name}: order complete. Launch compute secured. Trust +1 · Clout +40.`);
  }
  g.arcade.confirm = null;
  notice(g, `${d.qty} ${o.gpu} delivered to ${s.name}. ${o.delivered}/${o.qty} supplied.${o.milestone ? ' ORDER COMPLETE · Clout +40.' : ''} ${d.payment === 'cash' ? 'Cash received; ready for the next deal.' : 'Ownership increased; no cash received.'}`, 'good');
  return true;
}

export function closeQuarter(g) {
  if (g.phase !== 'floor' || g.arcade.active || g.arcade.confirm) return false;
  const a = g.arcade, lost = inventoryCost(g);
  g.profit = (Math.round(g.profit * 100) - lost) / 100;
  for (const x of a.inventory) x.left = 0;
  const summary = emptySummary(g);
  // Feed real prepaid deliveries into the existing startup lifecycle. No future cash
  // flows, financing or supplier charges remain on these fully paid 3-month rights.
  // Aggregate slices so splitting a delivery cannot farm delivery reputation.
  for (const o of a.orders.filter(o => o.delivered)) summary.contracts.push({ client: o.client, gpu: o.gpu, qty: o.delivered, months: 3, price: 0, eff: 0, work: byClient(g, o.client).work });
  const quarter = g.q;
  const cashRemainder = g.cash - Math.round(g.cash);
  const beforeSettlement = cash(g);
  settleQuarter(g, summary);
  // Legacy settlement rounds cash to dollars; V7 invoices retain every cent.
  g.cash = Math.round((g.cash + cashRemainder) * 100) / 100;
  let exitBasis=0, failedBasis=0;
  for(const s of g.startups) {
    const inv=a.investments[s.id];
    if(inv && inv.basis && (!s.alive || s.exited)) {
      if(s.exited)exitBasis+=inv.basis;else failedBasis+=inv.basis;
      inv.closedBasis+=inv.basis;inv.basis=0;
    }
  }
  a.equityLifecycle.push({q:quarter,exitProceeds:cash(g)-beforeSettlement,exitBasis,failedBasis});
  g.hist.at(-1).cash = g.cash; g.report.cashAfter = g.cash;
  Object.assign(g.hist.at(-1), wealthScore(g));
  g.report.after = wealthScore(g);
  const record = { q: quarter, profit: g.profit - a.startProfit, cash: cash(g), lost, bought: a.purchases.reduce((n, p) => n + p.qty, 0), delivered: a.deliveries.reduce((n, d) => n + d.qty, 0), orders: a.orders.map(o => ({ ...o })), completions: [...a.completions], score: wealthScore(g), startups: g.report.startups, lines: g.report.lines.filter(l => l.kind === 'equity' || /acquired|shut down/.test(l.text)) };
  record.outsideSold = a.sales.reduce((n, s) => n + s.qty, 0);
  record.outsideProfit = a.sales.reduce((n, s) => n + s.revenue - s.cost, 0);
  a.history.push(record);
  if (a.mandate && !a.mandate.complete) a.mandate.expired = true;
  const minTicket = cents(1, 170);
  if (quarter >= V7.rounds || (cash(g) < minTicket && fortune(g).equity === 0)) {
    g.phase = 'over'; g.q = quarter;
    a.ending = quarter >= V7.rounds ? 'completed' : 'insolvent';
    a.finalFortune = fortune(g);
  }
  // Persist zero paid inventory. Unsold rights have no guaranteed sublet or recovery.
  for (const l of a.lots) if (l.status === 'open') l.status = 'expired';
  notice(g, lost ? 'Unused prepaid capacity expired. Its full cost is now a realized loss.' : 'Quarter closed. Your startup deliveries are now reflected in company progress.');
  return true;
}

export const portfolio = g => paperValue(g);
export const score = g => wealthScore(g);
export { fortune, opportunityTier };
