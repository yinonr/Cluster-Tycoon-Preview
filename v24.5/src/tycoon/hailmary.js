// V22.5 The Hail Mary: an optional Round 6 double-or-nothing for a company that did not earn a
// continuation. It reuses the engine end to end: the Round 5 buyout offer is the only door, the build is an
// ordinary launch (GPUs, no cash), the bell runs Node Tetris -> Network Mania -> Cluster Snake, and the
// ending is the usual exit record. Everything here is integer cents and seeded.
import { GPUS, founderPct, rackOutput, exitOutcome } from './founder.js';
import { ASK, DRIFT, reservationPrice } from './founder-market.js';
import { qualification, normalizeExtension } from './extension.js';
import { stream } from '../util.js';
import { SELLER_FIRMS } from '../data/names.js';
import { supplierStyle } from './exchange.js';
import { exitMarket } from './world.js';
import { HOURS_PER_MONTH } from '../data/gpus.js';

export const HAIL = Object.freeze({
  round: 6, chain: Object.freeze(['node', 'cable', 'kernel']),
  spend: Object.freeze([.10, .16]), minSpend: 12000000, maxGpus: 160,   // procurement spend as a share of the locked price
  margin: 1.10,                    // the facility covers the cheapest plan plus 10%
  haircut: .5, failCap: .6,        // a missed deal sells at half the enterprise value; never more than 60% of the withdrawn payout
  kernel: Object.freeze({ base: 16, min: 12 }),                          // kernels to schedule; strong earlier stages lower it
  scale: Object.freeze({ cable: 48, kernel: 256 }),
  org: 'the powered-site customer',
});
const HOURS = HOURS_PER_MONTH * 3;
const unit = (k, q) => Math.round(ASK[k] * (1 + DRIFT * (q - 1)));
export const hailMaryState = g => g?.arcade?.hailMary?.state || null;
export const hailMaryLive = g => hailMaryState(g) === 'active';
export const hailMaryPending = g => hailMaryState(g) === 'pending';

// Offered with the Round 5 acquisition, only to a company that did not earn a continuation.
export function hailMaryEligible(g, price) {
  if (!g?.arcade || g.q !== 5 || g.phase !== 'acquisition' || g.arcade.practice || g.arcade.hailMary || g.company.shutdown) return false;
  if (qualification(g).qualified) return false;
  return Math.floor(founderPct(g.company) * (price ?? 0)) >= 1;
}

// A procurement puzzle that always has an answer: for every GPU type that must be bought, the
// "solution" lots add up to the need (with some waste) and are priced near the market; decoys are an
// oversized bargain and a small premium lot. The cheapest covering subset is found by brute force and
// the facility is sized to it, so a feasible, affordable path exists by construction.
export function hailMaryPlan(g, price, q = HAIL.round) {
  const r = stream(g.seed, 'v225-hail-plan'), free = Object.fromEntries(rackOutput(g.company));
  const spend = Math.max(HAIL.minSpend, Math.round(price * r.range(...HAIL.spend)));
  const share = { B200: r.range(.42, .58), H200: r.range(.28, .38) }; share.H100 = 1 - share.B200 - share.H200;
  let recipe = Object.fromEntries(GPUS.map(k => [k, Math.max(3, Math.round(spend * share[k] / (unit(k, q) * HOURS)))]));
  const total = GPUS.reduce((n, k) => n + recipe[k], 0);
  if (total > HAIL.maxGpus) recipe = Object.fromEntries(GPUS.map(k => [k, Math.max(3, Math.floor(recipe[k] * HAIL.maxGpus / total))]));
  for (const k of GPUS) if (recipe[k] % 4 === 0) recipe[k] += r.pick([1, -1]);          // unusual counts
  const lots = [], need = {}, minCost = {};
  let n = 0;
  for (const k of GPUS) {
    const m = Math.max(0, recipe[k] - (free[k] || 0)); need[k] = m; minCost[k] = 0;
    if (!m) continue;
    const base = unit(k, q), mine = [];
    const push = (qty, f, atMax, tag) => mine.push({ gpu: k, qty, ask: Math.max(50, Math.round(base * f) + r.int(-5, 7)), at: r.int(0, atMax), tag });
    const waste = r.int(0, Math.ceil(m * .2)), pool = m + waste, pieces = pool < 4 ? 1 : m < 7 ? r.pick([1, 2]) : r.pick([2, 3]);
    let left = pool;
    for (let i = 0; i < pieces; i++) {
      const rest = pieces - i - 1, qty = i === pieces - 1 ? left : Math.max(1, Math.min(left - rest, Math.round(pool / pieces * r.range(.6, 1.4))));
      push(qty, r.range(.97, 1.10), 8, 'fit'); left -= qty;
    }
    const ref = Math.max(m, 4);
    push(Math.ceil(ref * r.range(1.2, 1.6)), r.range(.88, .95), 14, 'bulk');
    push(r.int(2, Math.max(3, Math.ceil(ref / 2))), r.range(1.12, 1.25), 14, 'small');
    let best = Infinity;
    for (let mask = 1; mask < 1 << mine.length; mask++) {
      let qty = 0, cost = 0;
      mine.forEach((l, i) => { if (mask >> i & 1) { qty += l.qty; cost += l.qty * l.ask * HOURS; } });
      if (qty >= m && cost < best) best = cost;
    }
    minCost[k] = best;
    for (const l of mine) lots.push({ ...l, i: n++ });
  }
  lots.sort((a, b) => a.at - b.at || a.i - b.i);
  const planCost = GPUS.reduce((s, k) => s + minCost[k], 0), facility = Math.ceil(planCost * HAIL.margin / 100000) * 100000;
  return { recipe, free, need, lots: lots.map((l, j) => ({ ...l, i: j })), planCost, facility };
}
// The cheapest cost of covering `need` from the given lots, by exhaustive search per GPU (tests re-run it).
export function cheapestCover(lots, need) {
  let sum = 0;
  for (const k of GPUS) {
    if (!need[k]) continue;
    const mine = lots.filter(l => l.gpu === k && (l.status ?? 'open') !== 'walked');
    let best = Infinity;
    for (let mask = 1; mask < 1 << mine.length; mask++) {
      let qty = 0, cost = 0;
      mine.forEach((l, i) => { if (mask >> i & 1) { qty += l.qty; cost += l.qty * l.ask * HOURS; } });
      if (qty >= need[k] && cost < best) best = cost;
    }
    if (best === Infinity) return null;
    sum += best;
  }
  return sum;
}

// Accepting the deal at the Round 5 offer: lock the price, pass to a special Round 6.
export function startHailMary(g, price) {
  const a = g.arcade;
  if (!hailMaryEligible(g, price)) return false;
  const pct = founderPct(g.company), payout = Math.floor(pct * price), plan = hailMaryPlan(g, price);
  normalizeExtension(g);
  a.hailMary = { version: 1, state: 'pending', price, payout, pct, facility: plan.facility, plan, chain: [...HAIL.chain], stage: 0, stages: [], launched: false, credited: false, cashStart: null, kernelTarget: null, won: null };
  a.extension.decisions.push({ q: 5, choice: 'extend', hailMary: true });
  a.extension.pending = null; a.extension.limit = HAIL.round;
  g.q = HAIL.round; g.phase = 'report'; a.confirm = null;
  a.message = { text: 'The Hail Mary: a powered site and a buyer. One round to deliver.', tone: 'good' };
  return true;
}

// Round 6 opens: a clean floor with one project, the supplier lots and the secured facility.
export function openHailMary(g) {
  const a = g.arcade, hm = a.hailMary, cash = Math.round(g.cash * 100), seconds = a.seconds;
  a.event = { kind: 'quiet', text: 'The Hail Mary. The prices on the board are the prices.' };
  hm.state = 'active';
  if (!hm.credited) { hm.cashStart = cash; g.cash = (cash + hm.facility) / 100; a.ledger.facility = hm.facility; hm.credited = true; }
  a.objectives = [{ id: 'q6-hailmary', lane: 'opportunity', kind: 'hailmary', tier: 0, name: 'The Hail Mary', blurb: 'Powered site. Buyer lined up. One round to deliver.', recipe: { ...hm.plan.recipe },
    mixed: true, cluster: true, reward: { hailmary: true }, cashCost: 0, q: HAIL.round, at: 0, until: seconds, status: 'open' }];
  a.lots = hm.plan.lots.map((p, j) => {
    const firm = SELLER_FIRMS[(j * 5 + 2) % SELLER_FIRMS.length], lot = { id: `q6-h${j}`, slot: 30 + j, firm, profile: supplierStyle(firm), gpu: p.gpu, qty: p.qty, ask: p.ask, floor: 0, liquidation: false,
      at: p.at, until: seconds, flash: false, cooldown: 0, status: 'open', negotiation: null };
    lot.floor = Math.min(lot.ask, reservationPrice(g, lot)); return lot;
  });
  a.buyers = []; a.terms = [];
  a.message = { text: `The Hail Mary. Secured facility ${money(hm.facility)}, repaid first. Source the GPUs, launch, run the workload.`, tone: 'good' };
}

// The kernels Cluster Snake must schedule: 16, less up to 4 for strong Node Tetris and Network Mania runs.
export function kernelTargetFor(stages) {
  const r = stages.reduce((n, s) => n + (s.perfect ? 1 : s.efficiency), 0) / Math.max(1, stages.length);
  const k = HAIL.kernel;
  return Math.max(k.min, Math.min(k.base, k.base - Math.round((k.base - k.min) * Math.max(0, Math.min(1, (r - .55) / .45)))));
}

// The bell of Round 6: success only if the launch happened and Cluster Snake hit its visible target.
export function resolveHailMary(g, shortfall) {
  const hm = g.arcade.hailMary, last = hm.stages.at(-1);
  hm.won = !shortfall && hm.launched && hm.stages.length === HAIL.chain.length && last?.kind === 'kernel' && last.perfect === true;
  hm.state = hm.won ? 'won' : 'lost';
  return hm.won;
}

// Settlement. cash already holds the facility; the facility is a senior claim in both branches.
//  WIN : price = 2 x locked price + max(0, cash - facility - cashAtOpen) (this round's own net cash); payout = pct x price >= 2 x locked payout.
//  LOSS: gross = cash + 50% of enterprise value x market; the facility is repaid first; payout = pct x remainder, capped at 60% of the locked payout.
export function hailMaryExit(g) {
  const hm = g.arcade.hailMary, c = g.company, base = exitOutcome(g, m => exitMarket(g, m)), cash = Math.round(g.cash * 100), won = hm.won;
  const stages = hm.stages.map(s => ({ kind: s.kind, efficiency: s.efficiency, perfect: s.perfect, kernels: s.kernels ?? null, target: s.target ?? null }));
  const detail = { won, lockedPrice: hm.price, lockedPayout: hm.payout, facility: hm.facility, stages, target: hm.kernelTarget, launched: hm.launched };
  if (won) {
    const extra = Math.max(0, cash - hm.facility - hm.cashStart), price = 2 * hm.price + extra, payout = Math.floor(hm.pct * price);
    return { ...base, kind: 'acquired', title: 'Hail Mary delivered', suitor: 'hailmary', round: HAIL.round, price, market: 1, baseMarket: 1, evx: Math.max(0, price - cash), cash, equity: price, founderPct: hm.pct, payout, realized: payout, retained: 0, remainingOwnership: 0, mark: false,
      unicorn: false, legendary: false, hailMary: { ...detail, extra, repaid: hm.facility, net: price } };
  }
  const gross = cash + Math.floor(HAIL.haircut * base.evx), repaid = Math.min(hm.facility, gross), net = gross - repaid, cap = Math.floor(HAIL.failCap * hm.payout), pct = founderPct(c);
  const payout = Math.min(Math.floor(pct * net), cap);
  return { ...base, kind: 'acquihire', title: 'Hail Mary missed', unicorn: false, legendary: false, evx: Math.floor(HAIL.haircut * base.evx), cash, equity: net, founderPct: pct, payout, realized: payout, retained: 0, remainingOwnership: 0, mark: false,
    hailMary: { ...detail, gross, repaid, net, cap } };
}

// Save checks: a coherent record, and the facility present in the ledger exactly while credited.
export function validHailMary(g) {
  const a = g.arcade, hm = a.hailMary, int = Number.isSafeInteger;
  if (hm === undefined) return !a.ledger.facility && a.ending !== 'hailmary';
  if (!hm || hm.version !== 1 || !['pending', 'active', 'won', 'lost'].includes(hm.state) || ![hm.price, hm.payout, hm.facility].every(n => int(n) && n >= 0)) return false;
  if (!Array.isArray(hm.stages) || hm.stages.length > 3 || hm.stage !== hm.stages.length) return false;
  if ((a.ledger.facility || 0) !== (hm.credited ? hm.facility : 0)) return false;
  if (hm.state === 'pending' && !(g.q === HAIL.round && g.phase === 'report')) return false;
  if (hm.state === 'active' && !(g.q === HAIL.round && ['floor', 'integration'].includes(g.phase))) return false;
  if (['won', 'lost'].includes(hm.state) && !(g.phase === 'over' && a.ending === 'hailmary' && a.exit?.hailMary)) return false;
  if (g.phase === 'over' && a.ending === 'hailmary' && !['won', 'lost'].includes(hm.state)) return false;
  return true;
}
const money = c => `$${Math.round(c / 100).toLocaleString('en-US')}`;
