// V10.6 The Living World: the round engine (V10.5 The Founder plus the integration phase).
// You are one AI startup with company cash and a cap table. Buy GPU capacity on the floor,
// allocate it to objectives, build, raise, resell, and exit after ten rounds. Integer cents
// throughout (legacy g.cash/g.profit are dollars). Base streams keep their V10.5 names, so a
// seed deals the same base market as V10.5.
import { growProduct } from './commerce.js';
import { HOURS_PER_MONTH } from '../data/gpus.js';
import { openingNegotiation, counteroffer } from './arcade-negotiation.js';
import { FOUNDER, createCompany, dealCards, opportunityCard, openCards, freeOf, freeIn, rackOutput, revenueNow, burnOf, prepaidNow, integrate, pendingIntegration,
  exitOutcome, enterpriseValue, founderPct, GPUS, updateScale, gradeOf, applyGrade, cardState, fileUnits, nextOpportunity, executionOf, qualityOf, outcomeEligible, resolveOutcome, applyReward } from './founder.js';
import { createWorld, worldOpen, worldTick, worldBell, exitMarket, epilogue } from './world.js';
import { makeRoundLots, makeResaleBids, marketEvent, commitmentLots, PHASES, sourcingQuote, sourcedLot } from './founder-market.js';
import { planInvestor } from './investors.js';
import { startPuzzle, puzzleOutcome } from './tetris.js';
import { stream } from '../util.js';
import { strategicOpen, strategicBell, strategicBusy, deliverCompute, endStrategic, computeAlternative } from './strategic.js';
import { institutionalTerms, institutionalBell } from './institutional.js';
import { moonshotOpen, moonshotBell, offerMoonshot, endMoonshot } from './moonshot.js';
import { createScenarios, scenarioPlan, scenarioOpen, scenarioTick, scenarioBell, payDues, endScenarios, chooseScenario, saleOutcome } from './scenarios.js';

export const V7 = { key: 'hsc-tycoon-v118', version: 1180, cash: 6500000, rounds: 10, seconds: 45, months: 3, hours: HOURS_PER_MONTH * 3 };
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
// cash = start + raised + revenue + contracts + resale − purchases − burn − research − capex − penalties
// (V10.14: capex is scenario capital such as a distressed data hall; penalties are disclosed damages.)
export function record(g, kind, amount) {
  const L = g.arcade.ledger;
  if (!L || !Number.isSafeInteger(amount) || !(kind in L)) return;
  L[kind] += amount;
}
export const ledgerCash = L => V7.cash + L.raised + L.revenue + L.contracts + L.resale - L.purchases - L.burn - L.research - L.capex - L.penalties;

export function createArcade(seed, name = '', { scenarios = true } = {}) {
  const g = { v: V7.version, seed, q: 1, phase: 'ready', cash: V7.cash / 100, profit: 0, clout: 0, firms: {}, company: createCompany(seed, name), world: createWorld() };
  g.arcade = { version: V7.version, rev: 0, seconds: V7.seconds, time: 0, active: null, confirm: null, signing: null, history: [], receipts: [], lots: [], inventory: [], purchases: [],
    buyers: [], sales: [], objectives: [], reservations: [], built: [], terms: [], event: null, message: null, sourcingFor: null,
    ledger: { raised: 0, inKind: 0, revenue: 0, contracts: 0, resale: 0, purchases: 0, burn: 0, research: 0, capex: 0, penalties: 0, expired: 0 }, exit: null, ending: null };
  g.world.scen = createScenarios(scenarios);
  openQuarter(g);
  return g;
}

export function openQuarter(g) {
  if (!g?.arcade || g.q > V7.rounds || !['ready', 'report'].includes(g.phase) || g.world?.memo) return false; // the board's memo is answered first
  const a = g.arcade, c = g.company;
  Object.assign(a, { time: 0, active: null, confirm: null, signing: null, lots: [], inventory: [], purchases: [], buyers: [], sales: [], reservations: [], built: [], message: null, sourcingFor: null, sourced: 0, exec: 0 });
  g.phase = 'floor';
  // V10.15: the company's scale (Startup, Scale-up, AI Giant) is set before cards and lots are dealt.
  const scaleBefore = c.scale || 1, scale = updateScale(g);
  deliverCompute(g);
  a.event = marketEvent(g);
  // Owned racks deliver their GPUs at the open: free capacity, cost 0, same expiry as any.
  for (const [gpu, qty] of rackOutput(c)) a.inventory.push({ id: `q${g.q}-rack-${gpu}`, gpu, qty, left: qty, unitCost: 0, firm: 'Your racks', cost: 0, q: g.q, produced: true });
  dealCards(g);
  // Some rounds open with a rush: traffic you can serve at once, for cash, before second 26.
  if (!a.objectives.some(o=>o.lane === 'opportunity' && o.status === 'open') && g.q >= 2 && stream(g.seed, 'v105-rush', g.q).next() < .30) a.objectives.push(opportunityCard(g, 'rush'));
  a.lots = makeRoundLots(g);
  a.buyers = makeResaleBids(g, cents);
  // The living world reacts to the company as the round opens: lots, customers, investors, news.
  // V10.14: the scenario layer decides first (a round with a scenario proposal has no world major),
  // then opens after the world, partnerships and the Moonshot have taken their slots.
  scenarioPlan(g);
  worldOpen(g);
  strategicOpen(g);
  moonshotOpen(g);
  scenarioOpen(g);
  a.lots.push(...commitmentLots(g));
  a.terms = institutionalTerms(g, computeAlternative(g, planInvestor(g), Math.round(g.cash * 100) + enterpriseValue(c)));
  const lead = a.news?.find(n => n.size === 'major') || a.news?.[0];
  notice(g, g.q === 1 ? `Round 1 of ${V7.rounds}. Buy the GPUs your company needs, then build.`
    : scale > scaleBefore ? `${scale === 3 ? 'AI Giant' : 'Scale-up'}: block suppliers${scale === 3 ? ', bigger projects and two sourcing orders' : ', flagship projects and a sourcing order'} are open to you.`
    : `Round ${g.q} · ${PHASES[g.q].name}. ${lead ? lead.headline : a.event.text}`);
  if (scale > scaleBefore) g.world.flags[`scale.${scale}`] = g.q;
  return true;
}

// V10.15 sourcing order: a dedicated block for one project's largest missing GPU, at a premium, a few
// seconds later. Scale-ups place one a round, AI Giants two. It is an ordinary lot when it arrives.
export function sourceBlock(g, cardId) {
  const a = g.arcade, card = a.objectives.find(o => o.id === cardId);
  if (g.phase !== 'floor' || a.active || a.signing || a.confirm?.receipt || a.confirm?.termId || a.confirm?.scenario || a.confirm?.moonshot) return false;
  const quote = sourcingQuote(g, card);
  if (!quote) return false;
  const lot = sourcedLot(g, quote);
  a.lots.push(lot); a.sourced = (a.sourced || 0) + 1;
  notice(g, `Sourcing order placed: ${lot.qty} ${lot.gpu} from ${lot.firm}, on the floor in ${Math.round(lot.at - a.time)} seconds.`, 'good');
  return lot;
}

// Opportunity triggers checked on every tick and purchase (deterministic: state and time only).
export function checkOpportunities(g) {
  const a = g.arcade;
  offerMoonshot(g);
  for (const o of a.objectives) if (o.status === 'open' && o.until && a.time >= o.until) {
    o.status = 'expired'; a.reservations = a.reservations.filter(r => r.card !== o.id);
  }
  if (g.q >= 3 && !strategicBusy(g) && !a.objectives.some(o => o.lane === 'opportunity' && o.status === 'open') && !a.objectives.some(o => o.kind === 'partner') && freeOf(g, 'B200') >= 2 && a.time < g.arcade.seconds - 16)
    a.objectives.push(opportunityCard(g, 'partner'));
  // V10.17.3: research IP, compute arbitrage, licensing and capacity contracts take the free opportunity desk.
  if (!strategicBusy(g) && !a.objectives.some(o => o.lane === 'opportunity' && o.status === 'open')) {
    const next = nextOpportunity(g);
    if (next) a.objectives.push(opportunityCard(g, ...next));
  }
}

export function advance(g, dt) {
  if (g.phase !== 'floor' || g.arcade.active || g.arcade.confirm || g.arcade.signing || !Number.isFinite(dt) || dt <= 0) return false;
  g.arcade.time = Math.min(V7.seconds, g.arcade.time + Math.min(dt, 1));
  for (const l of g.arcade.lots) if (l.status === 'open' && l.until <= g.arcade.time) l.status = 'expired';
  worldTick(g);
  scenarioTick(g);
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
  // V10.17.3: a Charmed block earns a repeat allocation next round at the negotiated rate.
  const repeat = l.block && !l.sourced && n.attempts?.some(e => e.tier === 'hit') && g.q < V7.rounds;
  if (repeat) f.lock = { gpu: l.gpu, qty: l.qty, rate: n.price, q: g.q };
  // One trust step per firm per round, so splitting lots cannot buy a relationship.
  const first = g.arcade.purchases.filter(p => p.firm === l.firm).length <= 1;
  if (first) { f.trust = Math.min(12, f.trust + 1); g.clout += 4; }
  g.arcade.active = null;
  // V10.15 Agentic: your agents file new capacity into the one open project that needs it.
  const filed = g.company.level >= 6 ? fileUnits(g, item) : null;
  checkOpportunities(g);
  const more = `${first ? ' Trust +1.' : ''}${repeat ? ` ${l.firm} holds a repeat block for you next round.` : ''}`;
  notice(g, filed ? `${l.qty} ${l.gpu} signed. Your agents filed ${filed.qty} into ${filed.name}.${more}` : `${l.qty} ${l.gpu} in your inventory. Allocate them to a project, or resell spare capacity.${more}`, 'good');
  return true;
}

// The bell. With a mixed build waiting to integrate, the bell opens the integration phase
// first (Cluster Tetris; the floor clock is stopped); otherwise the round settles at once.
export function closeQuarter(g) {
  if (g.phase !== 'floor' || g.arcade.active || g.arcade.confirm || g.arcade.signing) return false;
  // V10.17.3 execution quality: a voluntary bell with time left improves this round's outcomes (a timeout earns 0).
  g.arcade.exec = executionOf(g.arcade.time, V7.seconds);
  // 1. Reservations lapse: anything not built is just unused capacity.
  g.arcade.reservations = [];
  if (pendingIntegration(g).some(b => b.status === 'integrating')) {
    g.phase = 'integration';
    startPuzzle(g);
    notice(g, 'The bell has rung. Integrate your mixed cluster: the better it fits, the more comes online now.');
    return true;
  }
  return settle(g, null);
}

// The integration phase ends with the puzzle's outcome (played or skipped); then the round settles.
export function finishIntegration(g) {
  if (g.phase !== 'integration') return false;
  const out = puzzleOutcome(g);
  if (!out || !(out.efficiency >= 0 && out.efficiency <= 1)) return false;
  return settle(g, out);
}

function settle(g, out) {
  const a = g.arcade, c = g.company, q = g.q, cashBefore = cash(g), valueBefore = cashBefore + enterpriseValue(c), levelBefore = c.level, breaksBefore = c.breakthroughs, contractsBefore = a.ledger.contracts;
  // V10.15: the rack's grade (S/A/B/C, or CREW when skipped) is stamped on its builds before they come
  // online (the AGI attempt reads it); its company bonuses apply after.
  const grade = out ? gradeOf(out) : null, racked = pendingIntegration(g).filter(b => b.status === 'integrating');
  if (grade) for (const b of racked) b.grade = grade;
  // V10.17.3: execution and quality are stamped on every project of this round before anything resolves.
  const exec = a.exec || 0;
  for (const b of c.builds.filter(b => b.q === q && b.quality === undefined)) { b.exec = exec; b.quality = qualityOf(g, b, exec); }
  // 2. Integration (the Cluster Tetris boundary). This round's mixed builds come online at the
  // puzzle's efficiency; capacity delayed at an earlier bell comes online in full now.
  const integrated = pendingIntegration(g).map(b => {
    const fresh = b.status === 'integrating', before = b.online, efficiency = fresh ? out.efficiency : 1;
    integrate(g, b.id, efficiency, fresh && !!out.perfect);
    return { id: b.id, name: b.name, efficiency, online: b.online, before, delayed: b.status === 'delayed', carried: !fresh, tuned: !!b.tuned };
  });
  // Training runs built this round finish at the bell; then every project of this round resolves its outcome.
  for (const b of c.builds.filter(b => b.status === 'training')) applyReward(g, b, 1);
  for (const b of c.builds.filter(b => !b.outcome && b.online > 0 && (!b.reward.ip || b.online === 1) && outcomeEligible(b))) resolveOutcome(g, b);
  const gains = grade ? applyGrade(g, grade, racked) : null;
  const puzzle = out ? { efficiency: out.efficiency, perfect: !!out.perfect, skipped: !!out.skipped, score: out.score ?? null, rows: out.rows ?? null, placed: out.placed ?? null, pieces: out.pieces ?? null, grade, gains } : null;
  a.tetris = null;
  g.phase = 'floor';
  strategicBell(g);
  moonshotBell(g);
  institutionalBell(g);
  const scenario = scenarioBell(g);
  // 3. Unused capacity expires at the end of its service period: its cost was already paid.
  const expiredQty = a.inventory.reduce((n, x) => n + x.left, 0), expiredCost = inventoryCost(g);
  if (expiredCost) record(g, 'expired', expiredCost);
  for (const x of a.inventory) x.left = 0;
  for (const l of a.lots) if (l.status === 'open') l.status = 'expired';
  for (const o of a.objectives) if (o.status === 'open') o.status = o.lane === 'opportunity' ? 'expired' : 'lapsed';
  for (const t of a.terms) if (t.status === 'open') t.status = 'expired';
  // 4. Revenue in (less any a customer already prepaid), burn out.
  const earned = revenueNow(c), prepaid = Math.min(earned, prepaidNow(c)), revenue = earned - prepaid, burn = burnOf(c);
  g.cash = (cash(g) + revenue) / 100; record(g, 'revenue', revenue);
  // Customers grow: every online product earns 3% more next round.
  for (const p of c.products) if (p.online > 0 && !p.lost) p.revenue = growProduct(c, p);
  const shortfall = cash(g) < burn;
  const paid = Math.min(burn, cash(g));
  g.cash = (cash(g) - paid) / 100; record(g, 'burn', paid);
  // Disclosed damages are paid after payroll; whatever cash cannot cover becomes next bell's burn.
  const dues = payDues(g);
  const builds = c.builds.filter(b => b.q === q);
  const report = { q, cashBefore, cashAfter: cash(g), revenue, burn, paidBurn: paid, integrated, puzzle, exec, builds: builds.map(b => b.id), expiredQty, expiredCost,
    levelBefore, level: c.level, breakthrough: c.breakthroughs > breaksBefore, valueBefore, value: cash(g) + enterpriseValue(c), founderPct: founderPct(c),
    raised: c.shares.investors.filter(i => i.q === q).reduce((n, i) => n + i.paid, 0), inKind: c.shares.investors.filter(i => i.q === q).reduce((n, i) => n + (i.inKind || 0), 0), event: a.event, shortfall, prepaid, prizes: a.ledger.contracts - contractsBefore, burnWorld: c.mods.burn.reduce((n, m) => n + m.delta, 0), news: (a.news || []).map(n => n.headline),
    scenario: { delivered: scenario.delivered, missed: scenario.missed, dues: dues.due, paid: dues.paid, carried: dues.carried, lines: dues.lines || [] } };
  a.history.push(report);
  report.research = builds.filter(b=>b.moonshot !== undefined).reduce((n,b)=>n+(b.cashCost||0),0);
  report.capex = builds.filter(b=>b.moonshot === undefined).reduce((n,b)=>n+(b.cashCost||0),0);
  report.moonshot = g.world.institutional?.moonshot ? structuredClone(g.world.institutional.moonshot) : null;
  worldBell(g, report);
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
  // A sale closes mid-round: no desk stays open and the round never settles.
  if (ending === 'acquired') Object.assign(a, { active: null, confirm: null, signing: null, reservations: [] });
  endStrategic(g);
  endMoonshot(g);
  institutionalBell(g);
  endScenarios(g, ending);
  // Capacity still delayed at the exit counts in full: the buyer gets the hardware, integrated
  // after closing. It earned no revenue at the final bell.
  if (ending === 'exit') a.exitIntegrated = pendingIntegration(g).map(b => { integrate(g, b.id, 1); return b.id; });
  a.exit = ending === 'acquired' ? saleOutcome(g) : exitOutcome(g, m => exitMarket(g, m));
  a.exit.epilogue = epilogue(g, a.exit);
  a.finalScore = { payout: a.exit.payout, founderPct: a.exit.founderPct, equity: a.exit.equity, kind: a.exit.kind, rounds: a.history.length };
  notice(g, ending === 'shutdown' ? 'Payroll missed. The company shuts down.' : `${a.exit.title}. Founder payout ${money(a.exit.payout)}.`, ending === 'shutdown' ? 'bad' : 'good');
  return true;
}

// The Deal Room's choice, as one engine step. Selling the company ends the campaign at once.
export function decideScenario(g, optionId) {
  if (g.phase !== 'floor') return false;
  const r = chooseScenario(g, optionId);
  if (r === 'sale') return finish(g, 'acquired');
  return r;
}

const money = c => `$${Math.round(c / 100).toLocaleString('en-US')}`;
export { GPUS, openCards };
