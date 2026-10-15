import { startupInfluence, recordFortune } from './arcade-fortunes.js';
// THE TYCOON (V6, Deal Lab): an ongoing market, one quarter per trading floor.
//
// A game carries cash, a book of service contracts (compute you deliver to startups),
// supplier and startup relationships, equity stakes and the Tycoon Score from quarter to
// quarter. Each quarter's floor is a Deal Lab floor (src/modes/lab.js + economy.js): the
// quarter's anchor client is one of the game's startups, the buyers on the floor are the
// others, and the floor's ledger books the quarter's deals.
//
// THE TYCOON SCORE = PROFIT + CLOUT + COMPUTE POWERED (all points, auditable):
//   PROFIT    1 point per $1,000 of booked profit: each quarter's deals as the floor's ledger
//             books them at signing (revenue contracted, every GPU-month committed, idle
//             capacity sublet at a loss), less write-offs when a client fails, plus equity
//             proceeds when a startup exits. Paper equity value never counts.
//   CLOUT     points for commitments kept and broken (capped per counterparty and quarter):
//             a client's order filled or missed, each quarter of compute delivered, signed
//             supplier deals, backing out of an agreed deal, insolvency.
//   COMPUTE POWERED  1 point per 40 compute units delivered: GPU-months delivered to a
//             startup × that GPU's power for their work (gpu.js), counted once per quarter
//             of service actually delivered (never for a client who has failed).
//
// Accounting assumptions (explicit): a deal's booked margin turns into cash evenly over its
// term; a quarter's new commitments up to your cash need no financing (beyond it, the
// capital desk carries them at a fee); unsold capacity at the bell is sublet for its term at
// 12¢ under your rate, unless you hold it (V6.1: see HOLDINGS); equity is priced at the
// startup's valuation and dilutes (yours and theirs) on every issue; a quarter is three months.
//
// HOLDINGS (V6.1): the compute portfolio. Unsold spare capacity on a contract that runs past
// the quarter isn't gone at the bell: it's held, with its GPU, quantity, cost rate and the
// months left on its term. Its booked value is still the sublet (12¢ under your rate), so
// holding changes nothing until it pays: a held block can be sold to a buyer on a later floor
// (the gain over that sublet is booked then) or traded for equity; each quarter it's held
// costs TY.carry an hour on top (short sublets pay less), and SUBLET THE REST on the report
// locks the sublet for the rest of its term (no further cost). A block can't be sold twice:
// each sale takes it off the holding, and a quarter's sales settle once.
//
// Randomness: stream(game seed, 'tycoon' | 'quarter' | 'startup', …). Never shared streams.

import { round2, stream, pickAt, usd, int } from '../util.js';
import { BUYER_COMPANIES, FIRST_NAMES } from '../data/names.js';
import { ledger, dealLedger, priceOf, scheduleBuyers, spareLeft, ECON, money } from '../modes/economy.js';
import { demandOf } from './demand.js';
import { WORK, GPU_LIST, fitOf, powerOf, valueAt } from './gpu.js';
import { look } from '../modes/buyer.js';
import { saleVersion, planRevision, reviseBuyer, addSpotSupply, customerDelivery } from './sale-market.js';
import { installSupplierInventory } from './suppliers.js';

export const TY = {
  key: 'hsc-tycoon-v1',
  v: 1,
  cash0: 20e6,          // starting cash
  profitPer: 1000,      // $ of booked profit per PROFIT point
  cpPer: 40,            // compute units per COMPUTE POWERED point
  checkpoint: 4,        // the comparable score: after this many quarters
  share: 0.25,          // share of a better-fit GPU's value (over the board) a startup pays for
  clout: { filled: 80, half: 20, missed: -80, deliver: 10, deliverCap: 30, supplier: 12, supplierPerQ: 2, backOut: -30, insolvent: -400 },
  carry: 0.08,          // $/GPU-hr a quarter that holding capacity costs over subletting it for its term
  firstCall: 2,         // supplier trust (deals honored) that earns a first call on their next block
  trustedClient: 3,     // startup trust that brings them to you first
};

// Startup archetypes: growth per quarter (low/high), failure odds, a breakout's milestone,
// the exit (valuation multiple of where they started, and the odds once there), burn.
const ARCH = {
  steady: { label: 'Steady enterprise AI', g: [0.03, 0.15], fail: 0.03, jump: 0, exitX: 2.0, exitP: 0.4, burn: 0.10, work: 'serve', months: 12, size: [1.0, 1.3], val: [40e6, 80e6] },
  breakout: { label: 'Breakout robotics', g: [-0.08, 0.10], fail: 0.07, jump: 0.2, exitX: 2.8, exitP: 0.45, burn: 0.14, work: 'serve', months: 12, size: [0.6, 0.9], val: [25e6, 60e6] },
  rocket: { label: 'High-growth consumer AI', g: [0.05, 0.55], fail: 0.12, jump: 0, exitX: 2.5, exitP: 0.4, burn: 0.20, work: 'serve', months: 6, size: [0.8, 1.2], val: [50e6, 140e6] },
};
export const ARCH_LABEL = Object.fromEntries(Object.entries(ARCH).map(([k, v]) => [k, v.label]));
const lerp = (a, b, u) => a + (b - a) * u;
const H = ECON.hours;

// ---- A new game -------------------------------------------------------------------------
export function newGame(seed, player = {}, { marketVersion = 61, supplierVersion = null } = {}) {
  const r = stream(seed, 'tycoon', 'start');
  const pool = r.shuffle(BUYER_COMPANIES);
  const archs = ['steady', 'breakout', 'rocket', r.pick(['steady', 'breakout', 'rocket'])];
  const names = r.shuffle(FIRST_NAMES);
  const startups = archs.map((arch, i) => makeStartup(r, arch, pool[i], names[i], `s${i + 1}`));
  const game = {
    v: TY.v, seed, player: { name: player.name || '', firm: player.firm || 'Your desk' },
    q: 1, phase: 'ready', seq: 1,
    cash: TY.cash0, profit: 0, clout: 0, cpUnits: 0,
    book: [], flows: [], firms: {}, startups, holdings: [], hist: [], report: null, draft: null, cur: null, events: [],
  };
  if (marketVersion === 62) game.marketVersion = 62;
  if ([63, 64].includes(supplierVersion)) game.supplierVersion = supplierVersion;
  return game;
}

function makeStartup(r, arch, c, contact, id) {
  const A = ARCH[arch];
  const val = Math.round(lerp(A.val[0], A.val[1], r.next()) / 1e6) * 1e6;
  return {
    id, name: c.name, sector: c.sector, arch, contact,
    quality: round2(lerp(0.3, 0.9, r.next())), // hidden: how good the company really is
    work: A.work, months: A.months, size: round2(lerp(A.size[0], A.size[1], r.next())),
    val0: val, val, cash: Math.round(val * lerp(0.15, 0.3, r.next())), burn: Math.round((val * A.burn) / 4),
    rich: round2(r.next()), alive: true, exited: false, stake: 0, trust: 0, lastGrowth: null, news: [],
  };
}

// New companies come in as others fail or sell, so a long run keeps its customers.
const ENTRANTS = [
  { name: 'Kiln Robotics', sector: 'warehouse robots' }, { name: 'Tessellate AI', sector: 'design models' },
  { name: 'Juniper Vision', sector: 'video understanding' }, { name: 'Cobalt Voice', sector: 'voice agents' },
  { name: 'Wharf Analytics', sector: 'enterprise search' }, { name: 'Lantern Health AI', sector: 'clinical models' },
  { name: 'Sable Agents', sector: 'agent platforms' }, { name: 'Ferry Genomics', sector: 'genomics models' },
];
function entrant(game, q, i) {
  const used = new Set(game.startups.map((x) => x.name));
  const free = [...BUYER_COMPANIES, ...ENTRANTS].filter((c) => !used.has(c.name));
  if (!free.length) free.push({ name: `Pier ${game.startups.length + 1} AI`, sector: 'applied models' });
  const r = stream(game.seed, 'entrant', q, i);
  const c = free[Math.floor(r.next() * free.length)];
  const arch = r.pick(['steady', 'breakout', 'rocket']);
  const contact = FIRST_NAMES[Math.floor(r.next() * FIRST_NAMES.length)];
  const s = makeStartup(r, arch, c, contact, `s${game.startups.length + 1}`);
  for (const field of ['val', 'val0', 'cash', 'burn']) s[field] = Math.round(s[field] / 25);
  s.born = q + 1;
  return s;
}

// A startup's signals, in one truthful line: last quarter's growth and its runway.
export const signalOf = (s) => (s.lastGrowth == null ? 'New on the floor: no track record yet.' : `Usage ${s.lastGrowth >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(s.lastGrowth * 100))}% last quarter · runway ${Math.max(0, Math.round(s.cash / Math.max(1, s.burn)))} quarters`);

export const quarterSeed = (game) => (stream(game.seed, 'quarter', game.q, 'floor').int(1, 2 ** 31 - 2) >>> 0);
const startupById = (game, id) => game.startups.find((s) => s.id === id);

// What a startup pays for a GPU-hour of each GPU it accepts: the board, less what its cash
// position lets it haggle, plus a share of the GPU's extra value for its work.
export function pricesFor(s, bench) {
  const delta = -0.10 + 0.06 * s.rich;
  const out = {};
  for (const g of WORK[s.work].accepts) out[g] = round2(bench[g] + delta + TY.share * (valueAt(s.work, g, bench) - bench[g]));
  return out;
}
const matchGpu = (work, bench) => WORK[work].accepts.find((g) => fitOf(work, g, bench) === 'match');
const steps = (x, step, lo, hi) => Math.max(lo, Math.min(hi, Math.round(x / step) * step));

// ---- A quarter's floor ----------------------------------------------------------------------
// The lab floor for this quarter's seed, turned into this game's market: the anchor client's
// order, the other startups as buyers, a frontier (B200) desk, and first calls from trusted suppliers.
export function setupQuarter(run, game) {
  const md = run.mandate, m = run.market;
  const r = stream(game.seed, 'quarter', game.q, 'setup');
  const u = { bwAsk: r.next(), bwRoom: r.next(), bwQty: r.next(), jit: [r.next(), r.next(), r.next(), r.next()], room: [r.next(), r.next(), r.next(), r.next()] };
  const prime = m.lots.find((l) => l.archetype === 'prime');
  const Q = prime ? prime.qty : 512, step = Q / 4;
  installSupplierInventory(run, game, Q);
  if (saleVersion(game)) addSpotSupply(run, game, Q, prime ? prime.site : m.lots[0].site);
  const alive = game.startups.filter((s) => s.alive && !s.exited);
  // The anchor: the startup with the biggest need whose work takes this floor's GPU.
  const anchor = alive.filter((s) => WORK[s.work].accepts.includes(md.gpu)).sort((a, b) => b.size - a.size)[0] || null;
  if (anchor) {
    const prices = pricesFor(anchor, m.bench);
    Object.assign(md, {
      company: anchor.name, client: anchor.id, work: anchor.work,
      accept: WORK[anchor.work].accepts.slice(), priceFor: prices,
      qty: steps(Q * anchor.size * 1.25, step, Q * 0.75, Q * 2.5),
    });
    md.price = prices[md.gpu];
    md.walk = md.price;
    md.target = round2(md.price - ECON.over);
    run.labUse = anchor.months;
    md.minTerm = anchor.months;
  }
  md.budget = Math.max(0, Math.round(game.cash));
  for (const l of m.lots) l.labWant = null; // wants are read against the client's months
  // The frontier desk: B200 for the startups (and anyone) who need frontier compute.
  const bAsk = round2(m.bench.B200 - 0.12 + 0.1 * u.bwAsk);
  run.addSeller('frontier', {
    gpu: 'B200', qty: steps(Q * (0.5 + 0.5 * u.bwQty), step, step, Q), site: prime ? prime.site : m.lots[0].site, delivery: 21, deliveryLabel: '3 WEEKS',
    divisible: true, minQty: step, step, terms: [12, 24], baseTerm: 12, ask: bAsk, floor: round2(bAsk - (0.08 + 0.07 * u.bwRoom)), concession: 0.4, patience: 4,
  }, { dressed: look(stream(game.seed, 'quarter', game.q, 'look')) });
  // First call: a supplier who trusts you holds their block for you, with a little more room.
  const calls = [];
  for (const l of m.lots) {
    const f = game.firms[l.firm];
    if (!l.sellerId || !f || f.trust < TY.firstCall || l.status !== 'open') continue;
    if (l.fuse) l.fuse.done = true;
    l.floor = round2(l.floor - 0.03);
    l.patience += 2;
    l.labFirstCall = true;
    calls.push(l);
  }
  if (calls.length) m.at(3, () => m.bulletin({ headline: `FIRST CALL · ${calls[0].firm.toUpperCase()}`, sub: `${int(calls[0].qty)} ${calls[0].gpu} held for you before the floor sees it. Trust pays.`, tone: 'down' }));
  // The floor's demand (demand.js): the other startups (the ones who trust you, first), and the
  // brokers and labs who come this quarter, each at their time.
  for (const b of run.labBuyers || []) b.state = 'void'; // the lab's own buyers stand down
  const others = alive.filter((s) => s !== anchor).map((s) => { const gpu = matchGpu(s.work, m.bench); return { s, gpu, price: pricesFor(s, m.bench)[gpu] }; });
  const { heat, pool } = demandOf({ seed: game.seed, q: game.q, bench: m.bench, Q, startups: others });
  const coming = pool.filter((c) => c.come);
  const taken = new Set(m.characters.map((c) => c.name));
  const contacts = FIRST_NAMES.filter((x) => !taken.has(x));
  const gap = saleVersion(game) ? Math.floor(140 / Math.max(1, coming.length - 1)) : Math.max(15, Math.floor(170 / Math.max(1, coming.length)));
  let at = saleVersion(game) ? 25 : 40;
  const buyers = coming.map((c, i) => {
    const s = c.s || null;
    const first = s && s.trust >= TY.trustedClient;
    const b = {
      id: s ? `eco${s.id}` : `${c.kind}${i}`, kind: c.kind, client: s ? s.id : null,
      firm: s ? s.name : c.name, sector: s ? s.sector : c.kind === 'lab' ? 'research lab' : 'compute broker',
      name: s ? s.contact : contacts[(i * 5) % contacts.length] || 'Sam', gpu: c.gpu,
      qty: c.qty, minTerm: c.minTerm, delivery: c.delivery, u: c.u, room: c.room, window: saleVersion(game) ? Math.max(c.window, c.kind === 'broker' ? 50 : 70) : c.window,
      at: first ? 20 + 5 * i : Math.round(at + 10 * u.jit[i % 4]), state: 'due',
      // Equity: a startup short of cash offers it; one you already own a piece of takes more.
      equityOk: !!s && (s.cash < s.burn * 3 || s.stake > 0), stake: s ? s.stake : 0, val: s ? s.val : 0,
      signal: s ? signalOf(s) : null,
      ...(saleVersion(game) ? { trusted: !!first, work: s ? s.work : c.work || 'serve', reliability: s?.trust >= 3 ? 'Trusted customer · steadier request' : c.kind === 'lab' ? 'Established lab · lower revision risk' : s && s.cash < s.burn * 3 ? 'Short runway · funding risk' : c.kind === 'broker' ? 'Broker demand · can change quickly' : 'Independent startup · unsigned request' } : {}),
    };
    if (saleVersion(game)) b.revisionPlan = planRevision(game.seed, game.q, b, s, Q / 8);
    if (!first) at += gap;
    return b;
  });
  scheduleBuyers(run, buyers);
  if (saleVersion(game)) for (const b of buyers) if (b.revisionPlan) m.at(b.revisionPlan.at, () => reviseBuyer(run, b));
  run.tyHeat = heat;
  run.tyPool = pool.length;
  // The compute you hold from earlier quarters: on this floor's books as spares you can sell.
  run.labHoldings = (game.holdings || []).filter((h) => h.qty > 0 && h.months > 0)
    .map((h) => ({ id: h.id, gpu: h.gpu, qty: h.qty, eff: h.eff, rate: h.eff, term: h.months, delivery: 0, alloc: 0, sold: 0, saleRev: 0, held: true, firm: h.firm }));
  game.cur = { q: game.q, anchor: anchor ? anchor.id : null, orderQty: md.qty, gpu: md.gpu, work: md.work || null, client: anchor ? anchor.name : md.company };
  return run;
}

// ---- What a quarter booked (from the live floor; saved as it goes) -------------------------
export function summarizeQuarter(run, game) {
  const md = run.mandate;
  const L = ledger(run);
  const deals = run.deals.filter((d) => !d.push);
  const clientWork = (id) => (startupById(game, id) || {}).work || md.work || 'serve';
  const contracts = [];
  for (const d of deals) if (d.alloc > 0) contracts.push({ client: md.client || null, gpu: d.gpu, qty: d.alloc, months: md.minTerm, price: priceOf(md, d.gpu), eff: d.eff, work: md.work || 'serve' });
  for (const s of run.labSales || []) for (const leg of s.legs || []) contracts.push({ client: s.client || null, gpu: leg.gpu, qty: leg.qty, months: leg.term, price: s.equity ? 0 : s.price, eff: leg.eff, work: s.work || clientWork(s.client), equity: !!s.equity });
  const firms = {};
  for (const d of deals) if (!d.auction) firms[d.firm] = (firms[d.firm] || 0) + 1;
  // Held capacity sold this quarter: its gain over the sublet it was booked at (an equity sale
  // gives up that sublet: no cash). Spares that outlive the quarter become holdings.
  const held = (run.labHoldings || []).filter((h) => h.sold > 0);
  const heldGain = held.reduce((t, h) => t + h.saleRev - h.sold * Math.max(0, h.eff - ECON.sublet) * h.term * H, 0);
  const heldFlows = held.map((h) => { const g = h.saleRev - h.sold * Math.max(0, h.eff - ECON.sublet) * h.term * H; return { perQ: (g * 3) / h.term, left: h.term / 3 }; });
  return {
    q: game.q, booked: L.net + heldGain, heldGain, fill: L.fill, filled: L.filled, orderQty: md.qty, anchor: md.client || null,
    contracts, flows: [...deals.map((d) => ({ perQ: (dealLedger(run, d).net * 3) / d.term, left: d.term / 3 })), ...heldFlows],
    stakes: (run.labSales || []).filter((s) => s.equity && s.client).map((s) => ({ client: s.client, invest: s.equity.worth })),
    heldSales: held.map((h) => ({ id: h.id, sold: h.sold })),
    newHold: deals.filter((d) => spareLeft(d) > 0 && d.term > 3).map((d) => ({ gpu: d.gpu, qty: spareLeft(d), eff: d.eff, months: d.term - 3, firm: d.firm })),
    firms, backOuts: (run.tyBackOuts || []).slice(), sales: (run.labSales || []).length, bought: L.bought, spare: L.spare,
    ...(saleVersion(game) ? { buyerChanges: (run.buyerChanges || []).slice() } : {}),
  };
}

// The live quarter on top of the saved game, for the running score: what the floor has booked
// so far, the compute its new contracts deliver this quarter, the supplier deals and back-outs.
export function liveQuarter(run, game) {
  const s = summarizeQuarter(run, game);
  const cpUnits = s.contracts.reduce((t, c) => t + c.qty * 3 * powerOf(c.work, c.gpu), 0);
  const clout = Object.values(s.firms).reduce((t, n) => t + Math.min(n, TY.clout.supplierPerQ) * TY.clout.supplier, 0) + s.backOuts.length * TY.clout.backOut;
  return { profit: s.booked, cpUnits, clout, fill: s.fill };
}

// Points from dollars, clout and compute units. Each part is shown on its own; the total is their sum.
export function scoreOf(profit$, clout, cpUnits) {
  const profit = Math.round(profit$ / TY.profitPer), cp = Math.round(cpUnits / TY.cpPer), cl = Math.round(clout);
  return { profit, clout: cl, cp, total: profit + cl + cp };
}
export const gameScore = (game, live = null) => scoreOf(game.profit + (live ? live.profit : 0), game.clout + (live ? live.clout : 0), game.cpUnits + (live ? live.cpUnits : 0));

// ---- Settlement: the quarter's books close, the market moves on -----------------------------
const firm = (game, name) => (game.firms[name] = game.firms[name] || { trust: 0, deals: 0 });
const note = (rep, kind, text, pts = null) => rep.lines.push({ kind, text, pts });

export function settleQuarter(game, sum) {
  if (!game || game.phase !== 'floor' || !sum || sum.q !== game.q) return game; // a quarter settles once
  const q = game.q;
  const before = gameScore(game);
  const cashBefore = game.cash;
  const rep = { q, lines: [], before, cashBefore, startups: [], perks: [] };
  if (saleVersion(game)) for (const change of sum.buyerChanges || []) note(rep, 'market', `${change.buyer}: ${change.text}`);
  const addClout = (pts, text, kind = 'clout') => { game.clout += pts; note(rep, kind, text, pts); };

  // 1. The floor's deals, booked at signing (the floor's ledger).
  game.profit += sum.booked;
  rep.booked = sum.booked;
  note(rep, 'profit', `The floor booked ${money(sum.booked)} (${int(sum.bought)} GPUs bought${sum.sales ? `, ${sum.sales} sale${sum.sales > 1 ? 's' : ''}` : ''}${sum.heldGain ? `, held capacity sold ${money(sum.heldGain)} over its sublet` : ''}${sum.spare ? `, ${int(sum.spare)} spare valued at a sublet` : ''})`, Math.round(sum.booked / TY.profitPer));
  for (const c of sum.contracts) game.book.push({ ...c, id: `c${game.seq++}`, q0: q, total: Math.max(1, Math.round(c.months / 3)), done: 0, status: 'active' });
  for (const f of sum.flows) game.flows.push({ ...f });
  // Equity: new shares at the startup's valuation (pre-money V, investment I): your stake
  // becomes (old × V + I) / (V + I), and they're worth V + I after.
  for (const st of sum.stakes) {
    const s = startupById(game, st.client);
    const I = st.invest ?? st.worth ?? 0;
    if (!s || !s.alive || s.exited || !(I > 0)) continue;
    const was = s.stake;
    s.stake = (s.stake * s.val + I) / (s.val + I);
    s.val = Math.round(s.val + I);
    note(rep, 'equity', `${s.name}: compute worth ${money(I)} for equity: you own ${(s.stake * 100).toFixed(2)}%${was ? ` (was ${(was * 100).toFixed(2)}%)` : ''}. Paper until they exit`);
  }
  // Reserve/carry is owed on capacity brought into this quarter, even when it sells:
  // selling later must not give a free quarter of optionality. New spares start next quarter.
  game.holdings = game.holdings || [];
  let carry = 0;
  for (const h of game.holdings) {
    if (h.qty <= 0 || h.months <= 0) continue;
    if (h.q0 < q) carry += h.qty * TY.carry * 3 * H;
    h.months -= 3;
  }
  for (const hs of sum.heldSales || []) { const h = game.holdings.find((x) => x.id === hs.id); if (h) h.qty = Math.max(0, h.qty - hs.sold); }
  if (carry) { game.profit -= carry; game.cash = Math.round(game.cash - carry); note(rep, 'profit', `Holding capacity a quarter: ${money(-carry)} (${Math.round(TY.carry * 100)}¢/GPU-hr over subletting it)`, -Math.round(carry / TY.profitPer)); }
  game.holdings = game.holdings.filter((h) => h.qty > 0 && h.months > 0);
  for (const n of sum.newHold || []) game.holdings.push({ ...n, id: `h${game.seq++}`, q0: q });

  // 2. Suppliers: deals signed (capped per supplier), deals backed out of.
  for (const [name, n] of Object.entries(sum.firms)) {
    const k = Math.min(n, TY.clout.supplierPerQ);
    const f = firm(game, name);
    f.trust += k; f.deals += n;
    addClout(k * TY.clout.supplier, `${name}: ${n} deal${n > 1 ? 's' : ''} signed and paid`);
    if (f.trust >= TY.firstCall) rep.perks.push(`${name} will call you first with their next block`);
  }
  for (const b of sum.backOuts) { firm(game, b.firm).trust -= 2; addClout(TY.clout.backOut, `Backed out of an agreed deal with ${b.firm}`); }

  // 3. The client's order: filled, half filled, or missed.
  const anchor = sum.anchor ? startupById(game, sum.anchor) : null;
  if (anchor) {
    const pct = Math.floor(sum.fill * 100);
    if (sum.fill >= 0.999) { anchor.trust += 1; addClout(TY.clout.filled, `${anchor.name}'s order: filled`); }
    else if (sum.fill >= 0.5) addClout(TY.clout.half, `${anchor.name}'s order: ${pct}% filled`);
    else {
      if (!saleVersion(game)) anchor.trust -= 1;
      addClout(TY.clout.missed, `${anchor.name}'s order: ${pct}% filled. A missed order`);
    }
  }

  // 4. Deliveries: one quarter of every live contract (a client who has failed gets nothing).
  const fed = {};
  const fedQty = {};
  const deliveredClout = {};
  for (const c of game.book) {
    if (c.status !== 'active') continue;
    const s = c.client ? startupById(game, c.client) : null;
    if (s && (!s.alive || s.exited)) continue;
    c.done += 1;
    const units = c.qty * 3 * powerOf(c.work, c.gpu);
    game.cpUnits += units;
    rep.cp = (rep.cp || 0) + units;
    if (s) {
      fed[s.id] = (fed[s.id] || 0) + units;
      fedQty[s.id] = (fedQty[s.id] || 0) + c.qty;
      deliveredClout[s.id] = Math.min(TY.clout.deliverCap, (deliveredClout[s.id] || 0) + TY.clout.deliver);
    }
    if (c.done >= c.total) c.status = 'done';
  }
  for (const [id, pts] of Object.entries(deliveredClout)) { const s = startupById(game, id); s.trust += pts >= TY.clout.deliverCap ? 1 : 0; addClout(pts, `Compute delivered to ${s.name}`); }
  if (rep.cp) note(rep, 'cp', `${int(rep.cp)} compute units delivered`, Math.round(rep.cp / TY.cpPer));

  // 5. Cash: this quarter's share of every contract's booked margin.
  let flow = 0;
  for (const f of game.flows) if (f.left > 0) { flow += f.perQ; f.left -= 1; }
  game.flows = game.flows.filter((f) => f.left > 0);
  game.cash = Math.round(game.cash + flow);

  // 6. The startups move: growth, a milestone, a raise, a failure or an exit.
  for (const s of game.startups) {
    if (!s.alive || s.exited) continue;
    const A = ARCH[s.arch];
    const rr = stream(game.seed, 'startup', s.id, q);
    const u1 = rr.next(), u2 = rr.next(), u3 = rr.next(), u4 = rr.next();
    const effect74 = startupInfluence(game,s);
    const need = Math.max(1, s.size * 1000 * 3);
    const boost = saleVersion(game) ? customerDelivery(s, fed[s.id] || 0, fedQty[s.id] || 0).boost : Math.min(1, (fed[s.id] || 0) / need); // the right compute, delivered, helps
    let g = lerp(A.g[0], A.g[1], 0.6 * u1 + 0.4 * s.quality) + 0.06 * boost + (effect74?.growth || 0);
    const runway = s.cash / Math.max(1, s.burn);
    // No one fails in their first quarter: you get a quarter of signals before the risk is live.
    const pFail = q === (s.born || 1) ? 0 : A.fail * (1.6 - s.quality) * (runway < 1 ? 1.8 : 1) * (1 - 0.4 * boost) * (effect74?.failFactor ?? 1);
    const line = { name: s.name, id: s.id, arch: s.arch };
    if (saleVersion(game)) {
      const delivered = customerDelivery(s, fed[s.id] || 0, fedQty[s.id] || 0);
      s.service = s.service || { quarters: 0, gpuMonths: 0, units: 0 };
      s.service.gpuMonths += (fedQty[s.id] || 0) * 3;
      s.service.units += fed[s.id] || 0;
      s.service.last = delivered.text;
      if (fedQty[s.id] > 0) { s.service.quarters++; s.trust += 1; }
      line.delivery = delivered.text;
      if (s.stake > 0) line.ownershipBefore = s.stake;
    }
    if (u3 < pFail) {
      s.alive = false;
      line.status = 'SHUT DOWN';
      line.text = runway < 1 ? 'Ran out of runway.' : 'The market moved on without them.';
      // Their contracts stop paying: the rest of each is written off (the GPUs go to sublet).
      let lost = 0;
      for (const c of game.book) {
        if (c.client !== s.id || c.status !== 'active') continue;
        const left = c.total - c.done;
        const loss = c.qty * Math.max(0, c.price - Math.max(0, c.eff - ECON.sublet)) * 3 * H * left;
        lost += loss;
        game.flows.push({ perQ: -loss / left, left });
        c.status = 'failed';
      }
      if (lost > 0) { game.profit -= lost; note(rep, 'profit', `${s.name} shut down: ${money(-lost)} of contracted revenue written off`, -Math.round(lost / TY.profitPer)); }
      if (s.stake > 0) note(rep, 'equity', `${s.name} shut down: your ${round2(s.stake * 100)}% is worth nothing`);
      s.stake = 0;
    } else {
      if (A.jump && u2 < A.jump * (1 + boost)) {
        g = 0.8 + 0.8 * u2 / A.jump + (effect74?.growth || 0);
        s.work = 'train';
        s.size = round2(s.size * 1.5);
        line.milestone = true;
        line.text = 'Hit a milestone: now training a bigger model. Needs frontier compute.';
      }
      s.lastGrowth = round2(g);
      s.val = Math.round(s.val * (1 + g));
      s.size = round2(Math.max(0.4, Math.min(3, s.size * (1 + 0.8 * g))));
      if (s.arch === 'rocket' && s.work === 'serve' && s.size > 1.5) { s.work = 'memory'; line.text = 'Launched long-context features: now needs high-memory GPUs.'; }
      // A round from other investors: new shares at their valuation dilute every holder, you too.
      const raise = g > 0.2 || effect74?.funding || (runway < 2 && u4 < 0.5) ? Math.round(s.val * 0.15) : 0;
      s.cash = Math.round(s.cash - s.burn + raise);
      if (raise) {
        s.stake = (s.stake * s.val) / (s.val + raise); s.val += raise;
        if (saleVersion(game) && s.stake > 0) note(rep, 'equity', `${s.name} raised ${money(raise).slice(1)}. Ownership diluted to ${(s.stake * 100).toFixed(2)}%; paper value is not cash.`);
      }
      s.burn = Math.round((s.val * A.burn) / 4);
      line.status = g > 0.2 ? 'GROWING FAST' : g > 0.05 ? 'GROWING' : g >= -0.02 ? 'FLAT' : 'SHRINKING';
      if (!line.text) line.text = `Usage ${g >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(g * 100))}% last quarter. Runway ${Math.max(0, Math.round(s.cash / Math.max(1, s.burn)))} quarters.`;
      // The exit: acquired once they've multiplied their value, sometimes.
      if (s.val >= A.exitX * s.val0 && u4 < A.exitP) {
        s.exited = true;
        line.status = 'ACQUIRED';
        line.text = `Acquired at ${money(s.val).slice(1)}.`;
        if (s.stake > 0) {
          const proceeds = Math.round(s.stake * s.val);
          game.cash += proceeds;
          game.profit += proceeds;
          note(rep, 'profit', `${s.name} was acquired: your ${round2(s.stake * 100)}% paid ${money(proceeds)}`, Math.round(proceeds / TY.profitPer));
          s.stake = 0;
        }
      }
    }
    recordFortune(game,s,line,effect74);
    line.stake = s.stake;
    line.paper = Math.round(s.stake * s.val);
    rep.startups.push(line);
  }

  // 7. Insolvency: the capital desk calls your lines.
  if (game.cash < 0) { addClout(TY.clout.insolvent, 'Insolvent: the capital desk called your lines'); game.phase = 'over'; game.insolvent = true; }

  // New companies take the places of the gone.
  const gone = rep.startups.filter((l) => l.status === 'SHUT DOWN' || l.status === 'ACQUIRED').length;
  for (let i = 0; i < gone; i++) { const e = entrant(game, q, i); if (e) { game.startups.push(e); note(rep, 'market', `${e.name} (${e.sector}) comes onto the market`); } }

  const after = gameScore(game);
  rep.after = after;
  rep.cashAfter = game.cash;
  game.hist.push({ q, ...after, cash: game.cash, profit$: Math.round(game.profit) });
  game.report = rep;
  game.draft = null;
  game.cur = null;
  if (game.phase !== 'over') { game.q += 1; game.phase = 'report'; }
  return game;
}

export const emptySummary = (game) => ({ q: game.q, booked: 0, fill: 0, filled: 0, orderQty: game.cur ? game.cur.orderQty : 0, anchor: game.cur ? game.cur.anchor : null, contracts: [], flows: [], stakes: [], firms: {}, backOuts: [], sales: 0, bought: 0, spare: 0, heldGain: 0, heldSales: [], newHold: [] });
export const paperValue = (game) => game.startups.reduce((t, s) => t + (s.alive && !s.exited ? Math.round(s.stake * s.val) : 0), 0);
export const checkpointScore = (game) => (game.hist.length >= TY.checkpoint ? game.hist[TY.checkpoint - 1].total : null);
export const commitments = (game) => game.book.filter((c) => c.status === 'active').reduce((t, c) => t + c.qty * Math.max(0, c.eff) * 3 * H * (c.total - c.done), 0);

// ---- The store: one game, saved under a versioned key -------------------------------------
function load(key) {
  try {
    const raw = localStorage.getItem(key);
    const g = raw ? JSON.parse(raw) : null;
    return g && g.v === TY.v && Array.isArray(g.startups) && typeof g.q === 'number' ? g : null;
  } catch { return null; }
}

export function createTycoonStore({ marketVersion = 61, supplierVersion = null } = {}) {
  const key = [63, 64].includes(supplierVersion) ? `hsc-tycoon-v${supplierVersion}` : marketVersion === 62 ? 'hsc-tycoon-v62' : TY.key;
  let state = load(key);
  const save = () => { try { if (state) localStorage.setItem(key, JSON.stringify(state)); } catch { /* storage blocked: the game plays on in memory */ } };
  return {
    get state() { return state; },
    newGame(seed, player) { state = newGame(seed, player, { marketVersion, supplierVersion }); save(); return state; },
    // The floor opens: from here a reload settles the quarter with what was signed.
    startQuarter() { if (state) { state.phase = 'floor'; state.draft = null; save(); } },
    draft(sum) { if (state && state.phase === 'floor' && sum && sum.q === state.q) { state.draft = sum; save(); } },
    settle(sum) { settleQuarter(state, sum); save(); return state; },
    recover() { if (state && state.phase === 'floor') { settleQuarter(state, state.draft || emptySummary(state)); save(); return true; } return false; },
    end() { if (state && state.phase !== 'over') { state.phase = 'over'; save(); } return state; },
    // SUBLET THE REST: a holding leaves the portfolio at the sublet it's booked at (no score change, no more carry).
    dispose(id) { if (state && state.phase === 'report' && state.holdings) { state.holdings = state.holdings.filter((h) => h.id !== id); save(); } return state; },
    clear() { state = null; try { localStorage.removeItem(key); } catch { /* nothing to clear */ } },
  };
}

// For the report and the cycle screen: a startup's need next quarter, in words.
export function needText(s, bench) {
  const g = matchGpu(s.work, bench);
  return `${WORK[s.work].label}, ${s.months}-month terms · best fit ${g} at about ${usd(pricesFor(s, bench)[g])}`;
}
export { matchGpu };
export const GPU_KINDS = GPU_LIST;
