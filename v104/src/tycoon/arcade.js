// V7's prepaid-quarter trading adapter. Protected V6 contracts are never migrated.
// Money uses integer cents; inventory represents transferable, prepaid service rights.
import { stream } from '../util.js';
import { SELLER_FIRMS } from '../data/names.js';
import { HOURS_PER_MONTH } from '../data/gpus.js';
import { newGame, paperValue } from './game.js';
import { supplierOf } from './suppliers.js';
import { powerOf } from './gpu.js';
import { investment } from './arcade-vc.js';
import { openingNegotiation, counteroffer } from './arcade-negotiation.js';
import { fortune, wealthScore, opportunityTier } from './wealth.js';
import { createVentures, arrive, ventureOrders, settleVentures, ventureVCOffers, closingQuote, VENTURE } from './ventures.js';
import { makeRoundLots, makeRoundBuyers, planWhale, starterPair, PHASES } from './score-market.js';

export const V7 = { key: 'hsc-tycoon-v104', version: 104, cash: 6500000, rounds: 10, seconds: 50, months: 3, hours: HOURS_PER_MONTH * 3 };
export const cents = (qty, rate) => qty * rate * V7.hours; // rate: cents/GPU-hour
export const remaining = o => o.qty - o.delivered;
export const inventoryCost = g => g.arcade.inventory.reduce((n, x) => n + x.left * x.unitCost, 0);
export const cash = g => Math.round(g.cash * 100);
export const activeLot = g => g.arcade.lots.find(l => l.id === g.arcade.active);
export const available = (g, l) => g.phase === 'floor' && l.status === 'open' && l.at <= g.arcade.time && l.until > g.arcade.time && l.cooldown <= g.arcade.time;
export const owned = (g, gpu) => g.arcade.inventory.filter(x => x.gpu === gpu).reduce((n, x) => n + x.left, 0);
const byClient = (g, id) => g.startups.find(s => s.id === id);
// Score ledger: every realized cent lands in exactly one category (see docs/V10_4_SCORE_ATTACK.md).
export function record(g, kind, amount, meta = {}) {
  const L = g.arcade.score, key = { trade: 'trading', exit: 'exits', secondary: 'secondary', closing: 'closing', expired: 'expired', equity: 'equityCost' }[kind];
  if (!L || !key || !Number.isSafeInteger(amount)) return;
  L[key] += amount;
  if (['trade', 'exit', 'secondary', 'closing'].includes(kind) && (!L.best || amount > L.best.amount)) L.best = { kind, amount, q: g.q, ...meta };
}
export const cashCapacity = (g, o) => Math.max(0, Math.min(remaining(o), Math.floor(Math.round(byClient(g, o.client).cash * 100) / cents(1, o.rate))));
const rel = (g, firm) => g.firms[firm] ||= { trust: 0, deals: 0 };
export function notice(g, text, tone = 'plain') { g.arcade.message = { text, tone }; }

export function createArcade(seed) {
  const g = newGame(seed, {}, { marketVersion: 62, supplierVersion: 64 });
  g.cash = V7.cash / 100;
  // V10.4 replaces the legacy archetype startups with short, support-driven ventures.
  g.startups = createVentures(seed);
  g.arcade = { mandateCompleted: false, mandateHistory: [], version: V7.version, rev: 0, anchor: g.startups[0].id, history: [], receipts: [], signing: null, investments: {}, secondarySales: [], equityLifecycle: [], vcOffers: [], ventureNews: [],
    score: { trading: 0, equityCost: 0, exits: 0, secondary: 0, closing: 0, expired: 0, best: null } };
  openQuarter(g);
  return g;
}

export function openQuarter(g) {
  if (!g?.arcade || g.q > V7.rounds || !['ready', 'report'].includes(g.phase)) return false;
  const a = g.arcade;
  arrive(g);
  const live = g.startups.filter(s => s.alive && !s.exited);
  if (!byClient(g, a.anchor)?.alive || byClient(g, a.anchor)?.exited) a.anchor = live[0]?.id || a.anchor;
  Object.assign(a, { time: 0, active: null, confirm: null, lots: [], orders: [], inventory: [], deliveries: [], purchases: [], completions: [], message: null, startCash: cash(g), startProfit: g.profit, favorsUsed: {} });
  a.orders = ventureOrders(g, cents);
  const whale = planWhale(g);
  a.whale = whale ? { ...whale, q: g.q } : null;
  a.buyers = makeRoundBuyers(g, cents, whale); a.sales = [];
  a.lots = makeRoundLots(g, a.orders, whale);
  starterPair(g, a.buyers, a.lots, cents);
  a.vcOffers = ventureVCOffers(g);
  a.mandate = null;
  for (const s of g.startups) s.v7NeedUnits = null;
  g.phase = 'floor';
  const held = a.lots.find(l => l.favor);
  notice(g, g.q === 1 ? `Round 1 of ${V7.rounds}. Buy cheap, sell dear, and back a company that could change your fortune.` : `Round ${g.q} · ${PHASES[g.q].name}.${whale ? ` A whale is on the floor: ${whale.name} wants ${whale.qty} ${whale.gpu}.` : ''}${held ? ` ${held.firm} held a block for you.` : ''}`);
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
  // One trust step per firm per round, so splitting or farming lots cannot buy a relationship.
  const signed = g.arcade.purchases.filter(p => p.firm === l.firm).length;
  if (signed <= 1) { f.trust = Math.min(12, f.trust + 1); g.clout += 4; }
  g.arcade.active = null;
  notice(g, `${l.qty} ${l.gpu} secured. Paid in full. Deliver to a matching startup to earn cash or equity. Trust +${signed <= 1 ? 1 : 0}.`, 'good');
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
  // Early credit: the whole order delivered before the company's early deadline.
  if (o.delivered >= o.qty && g.arcade.time < (o.early ?? 0)) o.earlyMet = true;
  if (d.payment === 'cash') record(g, 'trade', d.revenue - d.cost, { company: s.name, qty: d.qty, gpu: o.gpu }); else record(g, 'equity', d.cost);
  g.cash = (cash(g) + d.revenue) / 100;
  // Equity is expensed supply, never realized cash or paper profit.
  g.profit = (Math.round(g.profit * 100) + d.revenue - d.cost) / 100;
  if (d.payment === 'cash') s.cash -= d.value / 100;
  else { s.stake = d.stake; s.val += d.value / 100; const inv=investment(g,s.id); inv.basis+=d.cost; inv.invested+=d.cost; inv.serial++; }
  g.arcade.deliveries.push({ ...d, client: s.id, gpu: o.gpu, work: s.work });
  if (!remaining(o) && !o.milestone) {
    o.milestone = true; s.trust++; g.clout += 40;
    g.arcade.completions.push(`${s.name}: order complete${o.earlyMet ? ' early' : ''}. Trust +1 · Clout +40.`);
  }
  g.arcade.confirm = null;
  notice(g, `${d.qty} ${o.gpu} delivered to ${s.name}. ${o.delivered}/${o.qty} supplied.${o.milestone ? ' ORDER COMPLETE · Clout +40.' : ''} ${d.payment === 'cash' ? 'Cash received; ready for the next deal.' : 'Ownership increased; no cash received.'}`, 'good');
  return true;
}

// Bust: no live shares, no stock (it expired at the bell), and every lot of the next round
// costs more than your cash even at its floor price. No move is possible, so the run ends now
// rather than playing out dead rounds. Previewed on a copy; the real round is never opened.
export function bust(g) {
  if (g.startups.some(s => s.alive && !s.exited && s.stake > 0)) return false;
  // At the bell (phase 'floor') the next round is q + 1; after it ('report') q already is.
  const next = structuredClone(g); if (next.phase === 'floor') { next.q += 1; next.phase = 'report'; }
  return openQuarter(next) && next.arcade.lots.every(l => cents(l.qty, l.floor) > cash(next));
}

export function closeQuarter(g) {
  if (g.phase !== 'floor' || g.arcade.active || g.arcade.confirm) return false;
  const a = g.arcade, lost = inventoryCost(g), quarter = g.q;
  // Unsold prepaid rights expire at the bell: their full cost is a realized loss.
  g.profit = (Math.round(g.profit * 100) - lost) / 100;
  if (lost) record(g, 'expired', lost);
  for (const x of a.inventory) x.left = 0;
  const before = cash(g);
  const news = settleVentures(g, { cents, record: (kind, amount, meta) => { g.cash = (cash(g) + amount) / 100; g.profit = (Math.round(g.profit * 100) + amount) / 100; record(g, kind, amount, meta); } });
  for (const line of news) {
    const inv = a.investments[line.id];
    if (inv && inv.basis && (!line.after.alive || line.after.exited)) { inv.closedBasis += inv.basis; inv.basis = 0; }
  }
  a.ventureNews = news;
  a.equityLifecycle.push({ q: quarter, exitProceeds: cash(g) - before });
  const record$ = { q: quarter, profit: g.profit - a.startProfit, cash: cash(g), lost, bought: a.purchases.reduce((n, p) => n + p.qty, 0), delivered: a.deliveries.reduce((n, d) => n + d.qty, 0), orders: a.orders.map(o => ({ ...o })), completions: [...a.completions], news, startups: news.map(n => ({ name: n.name, status: n.kind.toUpperCase(), text: n.text })), lines: [] };
  record$.outsideSold = a.sales.reduce((n, s) => n + s.qty, 0);
  record$.outsideProfit = a.sales.reduce((n, s) => n + s.revenue - s.cost, 0);
  a.history.push(record$);
  g.report = { q: quarter, startups: record$.startups, lines: [] };
  g.hist.push({ q: quarter, cash: g.cash, profit$: Math.round(g.profit) });
  for (const l of a.lots) if (l.status === 'open') l.status = 'expired';
  if (quarter >= V7.rounds || bust(g)) {
    // Closing bell: the liquidity desk buys every remaining live stake at a fixed haircut.
    const closing = closingQuote(g);
    for (const c of closing) {
      const s = byClient(g, c.id);
      if (c.proceeds > 0) { g.cash = (cash(g) + c.proceeds) / 100; g.profit = (Math.round(g.profit * 100) + c.proceeds) / 100; record(g, 'closing', c.proceeds, { company: c.name, stake: c.stake }); }
      s.stake = 0; const inv = a.investments[s.id]; if (inv?.basis) { inv.closedBasis += inv.basis; inv.basis = 0; }
    }
    g.phase = 'over'; g.q = quarter;
    a.ending = quarter >= V7.rounds ? 'completed' : 'insolvent';
    a.closing = closing;
    a.finalScore = { cash: cash(g), start: V7.cash, ...a.score, rounds: quarter };
    a.finalFortune = fortune(g);
  } else { g.q = quarter + 1; g.phase = 'report'; }
  notice(g, lost ? 'Unused prepaid capacity expired. Its full cost is now a realized loss.' : 'Round closed. The companies you backed have news.');
  return true;
}

export const portfolio = g => paperValue(g);
export const score = g => wealthScore(g);
export { fortune, opportunityTier, VENTURE };
