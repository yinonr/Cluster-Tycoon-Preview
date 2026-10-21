// V10.5 The Founder: the round engine. You are one AI startup with company cash and a cap
// table. Buy GPU capacity on the floor, allocate it to objectives, build, raise, resell, and
// exit after ten rounds. Integer cents throughout (legacy g.cash/g.profit are dollars).
import { HOURS_PER_MONTH } from '../data/gpus.js';
import { openingNegotiation, counteroffer } from './arcade-negotiation.js';
import { FOUNDER, createCompany, dealCards, opportunityCard, openCards, freeOf, freeIn, rackOutput, revenueNow, burnOf, integrate, pendingIntegration,
  exitOutcome, enterpriseValue, founderPct, GPUS } from './founder.js';
import { makeRoundLots, makeResaleBids, marketEvent, PHASES } from './founder-market.js';
import { planInvestor } from './investors.js';
import { stream } from '../util.js';

export const V7 = { key: 'hsc-tycoon-v105', version: 105, cash: 6500000, rounds: 10, seconds: 45, months: 3, hours: HOURS_PER_MONTH * 3 };
export const cents = (qty, rate) => qty * rate * V7.hours; // rate: cents/GPU-hour
export const cash = g => Math.round(g.cash * 100);
export const activeLot = g => g.arcade.lots.find(l => l.id === g.arcade.active);
export const available = (g, l) => g.phase === 'floor' && l.status === 'open' && l.at <= g.arcade.time && l.until > g.arcade.time && l.cooldown <= g.arcade.time;
// Free units only: reserved capacity can never be sold or reserved again.
export const owned = (g, gpu) => freeOf(g, gpu);
export const stockOf = (g, gpu) => g.arcade.inventory.filter(x => x.gpu === gpu).reduce((n, x) => n + x.left, 0);
export const inventoryCost = g => g.arcade.inventory.reduce((n, x) => n + x.left * x.unitCost, 0);
export const remaining = o => o.qty - o.delivered; // legacy helper kept for shared desk code
export function notice(g, text, tone = 'plain') { g.arcade.message = { text, tone }; }
const rel = (g, firm) => g.firms[firm] ||= { trust: 0, deals: 0 };

// The company ledger: every cent of company cash lands in exactly one line.
// cash = start + raised + revenue + contracts + resale − purchases − burn
export function record(g, kind, amount) {
  const L = g.arcade.ledger;
  if (!L || !Number.isSafeInteger(amount) || !(kind in L)) return;
  L[kind] += amount;
}
export const ledgerCash = L => V7.cash + L.raised + L.revenue + L.contracts + L.resale - L.purchases - L.burn;

export function createArcade(seed) {
  const g = { v: V7.version, seed, q: 1, phase: 'ready', cash: V7.cash / 100, profit: 0, clout: 0, firms: {}, company: createCompany(seed) };
  g.arcade = { version: V7.version, rev: 0, seconds: V7.seconds, time: 0, active: null, confirm: null, signing: null, history: [], receipts: [], lots: [], inventory: [], purchases: [],
    buyers: [], sales: [], objectives: [], reservations: [], built: [], terms: [], event: null, message: null, sourcingFor: null,
    ledger: { raised: 0, revenue: 0, contracts: 0, resale: 0, purchases: 0, burn: 0, expired: 0 }, exit: null, ending: null };
  openQuarter(g);
  return g;
}

export function openQuarter(g) {
  if (!g?.arcade || g.q > V7.rounds || !['ready', 'report'].includes(g.phase)) return false;
  const a = g.arcade, c = g.company;
  Object.assign(a, { time: 0, active: null, confirm: null, signing: null, lots: [], inventory: [], purchases: [], buyers: [], sales: [], reservations: [], built: [], message: null, sourcingFor: null });
  g.phase = 'floor';
  a.event = marketEvent(g);
  // Owned racks deliver their GPUs at the open: free capacity, cost 0, same expiry as any.
  for (const [gpu, qty] of rackOutput(c)) a.inventory.push({ id: `q${g.q}-rack-${gpu}`, gpu, qty, left: qty, unitCost: 0, firm: 'Your racks', cost: 0, q: g.q, produced: true });
  dealCards(g);
  // Some rounds open with a rush: traffic you can serve at once, for cash, before second 26.
  if (g.q >= 2 && stream(g.seed, 'v105-rush', g.q).next() < .30) a.objectives.push(opportunityCard(g, 'rush'));
  a.lots = makeRoundLots(g);
  a.buyers = makeResaleBids(g, cents);
  const term = planInvestor(g);
  a.terms = term ? [term] : [];
  notice(g, g.q === 1 ? `Round 1 of ${V7.rounds}. Buy the GPUs your company needs, then build.` : `Round ${g.q} · ${PHASES[g.q].name}. ${a.event.text}`);
  return true;
}

// Opportunity triggers checked on every tick and purchase (deterministic: state and time only).
export function checkOpportunities(g) {
  const a = g.arcade;
  for (const o of a.objectives) if (o.status === 'open' && o.until && a.time >= o.until) {
    o.status = 'expired'; a.reservations = a.reservations.filter(r => r.card !== o.id);
  }
  if (g.q >= 3 && !a.objectives.some(o => o.lane === 'opportunity' && o.status === 'open') && !a.objectives.some(o => o.kind === 'partner') && freeOf(g, 'B200') >= 2 && a.time < g.arcade.seconds - 16)
    a.objectives.push(opportunityCard(g, 'partner'));
}

export function advance(g, dt) {
  if (g.phase !== 'floor' || g.arcade.active || g.arcade.confirm || g.arcade.signing || !Number.isFinite(dt) || dt <= 0) return false;
  g.arcade.time = Math.min(V7.seconds, g.arcade.time + Math.min(dt, 1));
  for (const l of g.arcade.lots) if (l.status === 'open' && l.until <= g.arcade.time) l.status = 'expired';
  checkOpportunities(g);
  if (g.arcade.time >= V7.seconds) closeQuarter(g);
  return true;
}

export function claim(g, id) {
  const l = g.arcade.lots.find(x => x.id === id);
  if (g.arcade.signing || g.arcade.active || g.arcade.confirm || !l || !available(g, l)) return false;
  l.negotiation ||= openingNegotiation(g, l);
  if (l.negotiation.closed) return false;
  g.arcade.active = id;
  notice(g, 'Supplier desk open. No money spent. The floor is paused while you decide.');
  return true;
}

export function leave(g) {
  const l = activeLot(g);
  if (g.arcade.signing || !l || l.negotiation.running) return false;
  l.cooldown = g.arcade.time + 5;
  g.arcade.active = null;
  notice(g, 'Back on the floor. This quote and its used attempts are remembered.');
  return true;
}

export const haggle = counteroffer;

export function buy(g) {
  const l = activeLot(g), n = l?.negotiation;
  if (g.phase !== 'floor' || !n || n.running || n.closed || !available(g, l)) return false;
  const cost = cents(l.qty, n.price);
  if (!Number.isSafeInteger(cost) || cost <= 0 || n.price < l.floor || cost > cash(g)) return false;
  g.cash = (cash(g) - cost) / 100;
  record(g, 'purchases', cost);
  l.status = 'sold'; n.closed = true;
  const item = { id: l.id, gpu: l.gpu, qty: l.qty, left: l.qty, unitCost: cents(1, n.price), firm: l.firm, cost, q: g.q };
  g.arcade.inventory.push(item); g.arcade.purchases.push({ ...item });
  const f = rel(g, l.firm); f.deals++;
  // One trust step per firm per round, so splitting lots cannot buy a relationship.
  const first = g.arcade.purchases.filter(p => p.firm === l.firm).length <= 1;
  if (first) { f.trust = Math.min(12, f.trust + 1); g.clout += 4; }
  g.arcade.active = null;
  checkOpportunities(g);
  notice(g, `${l.qty} ${l.gpu} in your inventory. Allocate them to a project, or resell spare capacity.${first ? ' Trust +1.' : ''}`, 'good');
  return true;
}

export function closeQuarter(g) {
  if (g.phase !== 'floor' || g.arcade.active || g.arcade.confirm || g.arcade.signing) return false;
  const a = g.arcade, c = g.company, q = g.q, cashBefore = cash(g), valueBefore = cashBefore + enterpriseValue(c), levelBefore = c.level, breaksBefore = c.breakthroughs;
  // 1. Reservations lapse: anything not built is just unused capacity.
  a.reservations = [];
  // 2. Integration of mixed builds (the Cluster Tetris boundary). V10.5: full integration.
  const integrated = pendingIntegration(g).map(b => { const before = b.online; integrate(g, b.id, 1); return { id: b.id, name: b.name, efficiency: 1, online: b.online, before }; });
  // 3. Unused capacity expires at the end of its service period: its cost was already paid.
  const expiredQty = a.inventory.reduce((n, x) => n + x.left, 0), expiredCost = inventoryCost(g);
  if (expiredCost) record(g, 'expired', expiredCost);
  for (const x of a.inventory) x.left = 0;
  for (const l of a.lots) if (l.status === 'open') l.status = 'expired';
  for (const o of a.objectives) if (o.status === 'open') o.status = o.lane === 'opportunity' ? 'expired' : 'lapsed';
  for (const t of a.terms) if (t.status === 'open') t.status = 'expired';
  // 4. Revenue in, burn out.
  const revenue = revenueNow(c), burn = burnOf(c);
  g.cash = (cash(g) + revenue) / 100; record(g, 'revenue', revenue);
  // Customers grow: every online product earns 8% more next round.
  for (const p of c.products) p.revenue = Math.round(p.revenue * (1 + FOUNDER.growth));
  const shortfall = cash(g) < burn;
  const paid = Math.min(burn, cash(g));
  g.cash = (cash(g) - paid) / 100; record(g, 'burn', paid);
  const builds = c.builds.filter(b => b.q === q);
  const report = { q, cashBefore, cashAfter: cash(g), revenue, burn, paidBurn: paid, integrated, builds: builds.map(b => b.id), expiredQty, expiredCost,
    levelBefore, level: c.level, breakthrough: c.breakthroughs > breaksBefore, valueBefore, value: cash(g) + enterpriseValue(c), founderPct: founderPct(c),
    raised: c.shares.investors.filter(i => i.q === q).reduce((n, i) => n + i.paid, 0), event: a.event, shortfall };
  a.history.push(report);
  // 5. Out of money: payroll cannot be met, the company shuts down now.
  if (shortfall) { c.shutdown = true; return finish(g, 'shutdown'); }
  if (q >= V7.rounds) return finish(g, 'exit');
  g.q = q + 1; g.phase = 'report';
  notice(g, `Round ${q} closed. Revenue ${money(revenue)}, burn ${money(burn)}.`);
  return true;
}

function finish(g, ending) {
  const a = g.arcade;
  g.phase = 'over';
  a.ending = ending;
  a.exit = exitOutcome(g);
  a.finalScore = { payout: a.exit.payout, founderPct: a.exit.founderPct, equity: a.exit.equity, kind: a.exit.kind, rounds: a.history.length };
  notice(g, ending === 'shutdown' ? 'Payroll missed. The company shuts down.' : `${a.exit.title}. Founder payout ${money(a.exit.payout)}.`, ending === 'shutdown' ? 'bad' : 'good');
  return true;
}

const money = c => `$${Math.round(c / 100).toLocaleString('en-US')}`;
export { GPUS, openCards };
