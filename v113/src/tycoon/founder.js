// V10.5 The Founder: one player-owned AI startup, three lanes of competing objectives, GPU
// recipes, allocation, builds, integration and the company's growth. Rules: docs/V10_5_FOUNDER.md.
// Money is integer cents. Every random draw comes from a named seeded stream.
import { stream } from '../util.js';

export const GPUS = Object.freeze(['H100', 'H200', 'B200']);
export const LANES = Object.freeze(['product', 'research', 'infra']);
export const LANE = Object.freeze({
  product: { label: 'Product', verb: 'Ship', gives: 'revenue every round' },
  research: { label: 'Research', verb: 'Train', gives: 'a better model' },
  infra: { label: 'Infrastructure', verb: 'Build', gives: 'GPUs every round' },
  opportunity: { label: 'Opportunity', verb: 'Win', gives: 'a one-off prize' },
});
export const MODEL_NAMES = Object.freeze(['Prototype', 'Tuned', 'Specialist', 'Competitive', 'Frontier', 'State of the art']);

// One table holds every tunable constant (tools/sim-v105.mjs reads the same table).
export const FOUNDER = Object.freeze({
  // Product revenue is paid at every bell: base × (1 + quality × model level).
  quality: .08,
  // Team burn per round, paid at every bell after revenue.
  burn: Object.freeze({ base: 300000, perLevel: 500000, perProduct: 50000 }),
  // Equity value = cash + EV. EV = 4 × revenue × multiple(level) + tech(level) + infra, × hype.
  multiple: Object.freeze([4, 5, 6, 7, 8, 9]),
  tech: Object.freeze([30000000, 50000000, 90000000, 150000000, 240000000, 360000000]),
  expansion: .6,                   // each successive copy earns 60% of the previous copy
  rackYears: 6,                    // a rack is valued at six rounds of its GPU output at base cost
  hype: .10,                       // each breakthrough lifts EV by 10%, at most three
  // A finished training run is seeded per build: breakthrough, solid, or a setback (no new
  // level; the lane deals the same tier next round). Mixed runs swing both ways harder.
  run: Object.freeze({ breakthrough: .16, mixedBreakthrough: .10, setback: .14, mixedSetback: .06 }),
  engineer: Object.freeze({ breakthrough: .18, setback: .08 }),
  growth: .03,                     // each product's revenue grows 3% a round while it is online
  // Lane gates: a product tier may be at most model level + 1; infra at most level + 2.
  productGate: 1, infraGate: 2,
  // GPU base cost per quarter at the base ask (used for rack value and pilot prizes only).
  unit: Object.freeze({ H100: 536550, H200: 698610, B200: 1064340 }),
  exitMarket: Object.freeze([.90, 1.15]),
  // Exit bands on EV × market (cents): acqui-hire, acquisition, major acquisition; above the last
  // band an IPO when ARR and the model qualify, otherwise a strategic acquisition.
  exitBands: Object.freeze({ acquihire: 150000000, acquisition: 800000000, major: 1900000000, ipoArr: 100000000, ipoLevel: 4, unicorn: 100000000000 }),
  // The rarest exit: an IPO with a State-of-the-art model and two breakthroughs, above $22M.
  legendary: Object.freeze({ level: 5, breakthroughs: 2, evx: 2200000000 }),
  // V10.6 Cluster Tetris: a training run or partnership completes at the bell when at least this
  // share of its cluster is online; below it the whole run waits for the next bell.
  researchOnline: .75,
  // A perfect integration (every module seated, no gaps) tunes the build for good: products earn
  // 10% more, racks deliver one more GPU, a training run gets +8% breakthrough odds.
  tuned: Object.freeze({ revenue: .10, rack: 1, breakthrough: .08 }),
  // V10.13: dedicated contract revenue (one big customer: an anchor, a dedicated fleet) is valued at
  // this share of the product multiple. It pays the same cash; it is worth less at the exit.
  contractMultiple: .4,
});

// The objective catalogue. Each tier has a homogeneous and a mixed variant where it makes
// sense; a seeded draw picks one per lane per round. Rewards compound differently by lane.
export const CATALOG = Object.freeze({
  product: [null,
    [{ name: 'Chatbot beta', blurb: 'Your first paying users.', recipe: { H100: 2 }, revenue: 400000 },
     { name: 'Code-review assistant', blurb: 'A tool developers pay for.', recipe: { H100: 3 }, revenue: 600000 },
     { name: 'Small-business inference', blurb: 'A small customer, a small commitment.', recipe: { H100: 1 }, revenue: 200000 }],
    [{ name: 'Support agents', blurb: 'Customer service that runs itself.', recipe: { H100: 4 }, revenue: 850000 },
     { name: 'Document AI API', blurb: 'Contracts and invoices, read instantly.', recipe: { H200: 2 }, revenue: 600000 },
     { name: 'Overnight batch inference', blurb: 'Older GPUs, a patient customer.', recipe: { H100: 6 }, revenue: 1100000 }],
    [{ name: 'Enterprise API', blurb: 'Fortune 500 customers on your model.', recipe: { H200: 4 }, revenue: 900000 },
     { name: 'Voice agents', blurb: 'Phone calls answered by your model.', recipe: { H100: 3, H200: 2 }, revenue: 1000000 },
     { name: 'Enterprise agent rollout', blurb: 'A demanding customer with a real budget.', recipe: { H200: 2, B200: 2 }, revenue: 1150000 },
     { name: 'Warehouse vision service', blurb: 'Camera feeds on a mixed fleet.', recipe: { H100: 5, H200: 1 }, revenue: 1080000 }],
    [{ name: 'Inference fleet', blurb: 'Serve millions of requests a day.', recipe: { H100: 10 }, revenue: 1300000 },
     { name: 'Realtime multimodal app', blurb: 'See, hear and answer live.', recipe: { H200: 4, B200: 3 }, revenue: 1400000 },
     { name: 'Multimodal support desk', blurb: 'Resolve a call, a photo and a problem.', recipe: { H200: 3, B200: 4 }, revenue: 1550000 }],
    [{ name: 'Hyperscale serving', blurb: 'A product the whole market uses.', recipe: { H200: 10 }, revenue: 1600000 },
     { name: 'Agent platform', blurb: 'Every company builds on you.', recipe: { H200: 6, B200: 4 }, revenue: 1900000 },
     { name: 'Developer coding cloud', blurb: 'Frontier reasoning, economical serving.', recipe: { H100: 4, H200: 4, B200: 3 }, revenue: 2050000 }],
  ],
  research: [null,
    [{ name: 'Distill a small model', blurb: 'Cheap, fast, yours.', recipe: { H200: 2 } },
     { name: 'Fine-tune an open model', blurb: 'Make it speak your domain.', recipe: { H100: 1, H200: 1 } }],
    [{ name: 'Long-context fine-tune', blurb: 'Reads whole codebases.', recipe: { H200: 4 } },
     { name: 'Train a specialist model', blurb: 'Best in class at one thing.', recipe: { H200: 1, B200: 2 } }],
    [{ name: 'Scale-up run', blurb: 'Bigger model, better everything.', recipe: { B200: 6 } },
     { name: 'Pretrain a mid-size model', blurb: 'Your own base model.', recipe: { H100: 2, H200: 2, B200: 4 } }],
    [{ name: 'Big B200 run', blurb: 'A serious frontier attempt.', recipe: { B200: 10 } },
     { name: 'Multimodal frontier run', blurb: 'Text, images and audio together.', recipe: { H200: 3, B200: 7 } }],
    [{ name: 'Giant training run', blurb: 'Everything you have, one model.', recipe: { B200: 14 } },
     { name: 'Next-generation model', blurb: 'The model the market talks about.', recipe: { H100: 3, H200: 4, B200: 9 } }],
  ],
  infra: [null,
    [{ name: 'Lease a rack', blurb: 'Your own H100s, every round.', recipe: { H100: 3 }, rack: { gpu: 'H100', qty: 2 } },
     { name: 'Refurbished H100 shelf', blurb: 'One reliable unit from older hardware.', recipe: { H100: 2 }, rack: { gpu: 'H100', qty: 1 } }],
    [{ name: 'Colocation cage', blurb: 'H200s on tap.', recipe: { H200: 5 }, rack: { gpu: 'H200', qty: 3 } },
     { name: 'Dedicated inference cluster', blurb: 'Trade older capacity for reliable H200s.', recipe: { H100: 3, H200: 2 }, rack: { gpu: 'H200', qty: 2 } }],
    [{ name: 'B200 pod', blurb: 'Frontier compute you own.', recipe: { B200: 6 }, rack: { gpu: 'B200', qty: 2 } },
     { name: 'Frontier research pod', blurb: 'A mixed investment in next-round B200s.', recipe: { H200: 3, B200: 3 }, rack: { gpu: 'B200', qty: 2 } }],
    [{ name: 'Data hall', blurb: 'A building full of your GPUs.', recipe: { H200: 6, B200: 8 }, rack: { gpu: 'B200', qty: 4 } },
     { name: 'Regional inference site', blurb: 'A broad fleet devoted to H200 production.', recipe: { H100: 5, H200: 4, B200: 3 }, rack: { gpu: 'H200', qty: 5 } }],
  ],
});
// One-off opportunities (the fourth card): deterministic triggers, a ticking deadline.
export const OPPORTUNITIES = Object.freeze({
  pilot: { names: ['Pilot for a bank', 'Pilot for a hospital network', 'Pilot for a retailer', 'Pilot for an airline'], blurb: 'A customer wants proof before signing.', prize: 1.6, window: 18 },
  partner: { names: ['Co-train with a university lab', 'Joint paper with a research institute'], blurb: 'Publish together: investors notice.', window: 16 },
  rush: { names: ['Hackathon rush', 'Launch-day traffic spike'], blurb: 'Traffic you can serve right now.', prize: 1.45, window: 26 },
});

const sumRecipe = r => GPUS.reduce((n, k) => n + (r[k] || 0), 0);
export const isMixed = r => GPUS.filter(k => r[k] > 0).length > 1;
export const recipeCost = r => GPUS.reduce((n, k) => n + (r[k] || 0) * FOUNDER.unit[k], 0);
export function researchOdds(g, run) {
  const U = FOUNDER.run, odds = g?.company.mods?.odds;
  const engineer = !!g?.world.flags.engineerHired && !g.world.flags.engineerUsed;
  // V10.13: a scenario talent bonus (Mara retained, the Okafor team, the Lantern team) applies to
  // the next completed training run once, alongside the existing one-shot odds.
  const talent = talentBonus(g);
  return {
    breakthrough: U.breakthrough + (run.mixed ? U.mixedBreakthrough : 0) + (run.tuned ? FOUNDER.tuned.breakthrough : 0) + (odds?.breakthrough || 0) + (engineer ? FOUNDER.engineer.breakthrough : 0) + (talent?.breakthrough || 0),
    setback: Math.max(0, U.setback + (run.mixed ? U.mixedSetback : 0) + (odds?.setback || 0) + (engineer ? FOUNDER.engineer.setback : 0) + (talent?.setback || 0)),
    engineer, talent: !!talent,
  };
}
// The armed scenario talent bonus, if any (consumed by the next training run or Moonshot).
export const talentBonus = g => { const b = g?.world?.scen?.bonus; return b && !b.used ? b : null; };

export function createCompany(seed, name = '') {
  return {
    name, level: 0, products: [], racks: [], breakthroughs: 0,
    shares: { founder: 1000000, investors: [] }, raised: 0, compute: [], builds: [], seq: 0, cardSeq: 0, oppSeq: 0,
    tiers: { product: 1, research: 1, infra: 1 }, shutdown: false, researchClosed: false,
    // V10.6 world modifiers (empty in a quiet world): temporary revenue multipliers, burn changes,
    // prepaid revenue, and the next training run's odds.
    // V10.13: tech is a proprietary-model discount (Lantern-70) that lifts at a model level.
    mods: { revenue: [], burn: [], prepaid: [], odds: null, tech: null },
  };
}

// ---- Derived company figures (pure) ----------------------------------------------------
export const totalShares = c => c.shares.founder + c.shares.investors.reduce((n, i) => n + i.shares, 0);
export const founderPct = c => c.shares.founder / totalShares(c);
// V10.13: a lost customer's product stays on record (it was built) but earns and costs nothing.
export const liveProducts = c => c.products.filter(p => !p.lost);
export const revenueOf = c => c.products.filter(p => p.online > 0 && !p.lost).reduce((n, p) => n + Math.round(p.revenue * p.online), 0);
const revenueMod = c => (c.mods?.revenue || []).reduce((m, x) => m * x.mult, 1);
export const revenueNow = c => Math.round(revenueOf(c) * (1 + FOUNDER.quality * c.level) * revenueMod(c));
// The part of revenueNow that comes from dedicated contracts (products flagged `contract`).
export const contractRevenueNow = c => Math.round(c.products.filter(p => p.contract && p.online > 0 && !p.lost).reduce((n, p) => n + Math.round(p.revenue * p.online), 0) * (1 + FOUNDER.quality * c.level) * revenueMod(c));
export const burnOf = c => FOUNDER.burn.base + FOUNDER.burn.perLevel * c.level + FOUNDER.burn.perProduct * liveProducts(c).length + (c.mods?.burn || []).reduce((n, x) => n + x.delta, 0);
// Revenue a customer already prepaid (V10.6 world): it arrives as cash earlier, not again.
export const prepaidNow = c => (c.mods?.prepaid || []).reduce((n, x) => n + x.perRound, 0);
export const cashRevenueNow = c => Math.max(0, revenueNow(c) - prepaidNow(c));
export const rackOutput = c => GPUS.map(gpu => [gpu, c.racks.filter(r => r.gpu === gpu && r.online > 0).reduce((n, r) => n + Math.floor(r.qty * r.online), 0)]).filter(([, n]) => n);
export function enterpriseValue(c) {
  const racks = c.racks.reduce((n, r) => n + Math.floor(r.qty * r.online) * FOUNDER.unit[r.gpu] * FOUNDER.rackYears, 0);
  const t = c.mods?.tech, tech = Math.round(FOUNDER.tech[c.level] * (t && c.level < t.until ? t.mult : 1));
  const valued = revenueNow(c) - Math.round((1 - FOUNDER.contractMultiple) * contractRevenueNow(c));
  const core = 4 * valued * FOUNDER.multiple[c.level] + tech + racks;
  return Math.round(core * (1 + FOUNDER.hype * Math.min(3, c.breakthroughs)));
}
export const stageName = v => v < 100000000 ? 'Garage' : v < 500000000 ? 'Seed' : v < 2500000000 ? 'Series A' : v < 10000000000 ? 'Growth' : v < 100000000000 ? 'Scale-up' : 'Unicorn';
export function focusOf(c) {
  const n = { product: 0, research: 0, infra: 0 };
  for (const b of c.builds) if (n[b.lane] !== undefined) n[b.lane]++;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return !top[1] ? 'Unknown startup' : { product: 'AI apps company', research: 'Frontier lab', infra: 'AI cloud' }[top[0]];
}

// ---- Objective cards -------------------------------------------------------------------
function laneTier(c, lane) {
  if (lane === 'research') return Math.min(5, c.level + 1);
  if (lane === 'product') return Math.min(5, c.tiers.product, c.level + FOUNDER.productGate);
  return Math.min(4, c.tiers.infra, c.level + FOUNDER.infraGate);
}
export function drawCard(g, lane, salt = 0) {
  const c = g.company, tier = laneTier(c, lane);
  if (lane === 'research' && (c.level >= 5 || c.researchClosed)) return null;
  const options = g.q === 1 && lane === 'product' && !c.builds.length ? CATALOG[lane][tier].slice(0, 2) : CATALOG[lane][tier];
  const r = stream(g.seed, 'v105-card', lane, g.q, c.cardSeq, salt);
  // Count committed builds too: mixed projects cannot evade saturation before integration.
  const copies = o => c.builds.filter(b => b.catalog === o.name).length;
  const least = Math.min(...options.map(copies)), pool = options.filter(o => copies(o) === least);
  const pick = pool[r.int(0, pool.length - 1)], repeat = copies(pick);
  c.cardSeq++;
  return { id: `q${g.q}-${lane}-${c.cardSeq}`, lane, tier, catalog: pick.name, repeat, name: repeat ? `${pick.name} · expansion` : pick.name, blurb: repeat ? `${pick.blurb} Smaller marginal returns from expansion.` : pick.blurb, recipe: { ...pick.recipe }, mixed: isMixed(pick.recipe),
    reward: lane === 'product' ? { revenue: Math.round(pick.revenue * FOUNDER.expansion ** repeat) } : lane === 'research' ? { level: tier } : { rack: { ...pick.rack, qty: Math.max(1, Math.floor(pick.rack.qty / (1 + repeat))) } }, q: g.q, status: 'open' };
}
// A one-off opportunity: a cash prize at a premium to market cost, or a research partnership.
export function opportunityCard(g, kind, gpu) {
  const c = g.company, O = OPPORTUNITIES[kind], r = stream(g.seed, 'v105-opp', g.q, c.oppSeq, kind);
  c.oppSeq++; c.cardSeq++;
  const now = g.arcade.time;
  // A partnership scales with your model: frontier labs only co-train with frontier compute.
  const recipe = kind === 'partner' ? { H200: 1 + Math.floor(c.level / 2), B200: 2 + c.level } : kind === 'rush' ? { H100: 2 + r.int(0, Math.min(3, g.q)) } : { [gpu]: 2 + r.int(0, 1 + Math.floor(g.q / 4)) };
  const reward = kind === 'partner' ? { hype: 1 } : { cash: Math.round(recipeCost(recipe) * O.prize * (1 + .03 * g.q) / 100) * 100 };
  return { id: `q${g.q}-opp-${c.cardSeq}`, lane: 'opportunity', kind, tier: 0, name: r.pick(O.names), blurb: O.blurb, recipe, mixed: isMixed(recipe), reward, q: g.q,
    at: now, until: Math.min(g.arcade.seconds, Math.round(now) + O.window), status: 'open' };
}
export function dealCards(g) {
  g.arcade.objectives = LANES.map(lane => drawCard(g, lane)).filter(Boolean);
}
export const openCards = g => g.arcade.objectives.filter(o => o.status === 'open' && (!o.until || g.arcade.time < o.until));

// ---- Inventory, reservations and builds -----------------------------------------------
// Purchased or rack-produced capacity is available until it is reserved to a card, resold,
// built (consumed) or expires at the bell. A unit is never in two places.
export const reservedOn = (g, invId) => g.arcade.reservations.filter(r => r.inv === invId).reduce((n, r) => n + r.qty, 0);
export const freeIn = (g, x) => x.left - reservedOn(g, x.id);
export const freeOf = (g, gpu) => g.arcade.inventory.filter(x => x.gpu === gpu).reduce((n, x) => n + freeIn(g, x), 0);
export const heldFor = (g, cardId, gpu) => g.arcade.reservations.filter(r => r.card === cardId && (!gpu || r.gpu === gpu)).reduce((n, r) => n + r.qty, 0);
export function cardState(g, card) {
  const rows = GPUS.filter(k => card.recipe[k]).map(gpu => ({ gpu, need: card.recipe[gpu], held: heldFor(g, card.id, gpu), free: freeOf(g, gpu) }));
  const missing = rows.reduce((n, r) => n + Math.max(0, r.need - r.held), 0);
  const live = card.status === 'open' && (!card.until || g.arcade.time < card.until) && g.phase === 'floor';
  const cashNeeded = Math.max(0, (card.cashCost || 0) - Math.round(g.cash * 100));
  return { rows, missing, cashNeeded, ready: live && missing === 0 && cashNeeded === 0, live, total: sumRecipe(card.recipe), held: rows.reduce((n, r) => n + r.held, 0) };
}

export function reserve(g, cardId, gpu, qty = 1) {
  const a = g.arcade, card = a.objectives.find(o => o.id === cardId);
  if (!card || a.active || a.signing || a.confirm || !cardState(g, card).live || !card.recipe[gpu] || !Number.isSafeInteger(qty) || qty <= 0) return false;
  let want = Math.min(qty, card.recipe[gpu] - heldFor(g, cardId, gpu), freeOf(g, gpu));
  if (!Number.isSafeInteger(want) || want <= 0) return false;
  // FIFO: the oldest purchased capacity is committed first; rack output (cost 0) is just stock.
  for (const x of a.inventory.filter(x => x.gpu === gpu)) {
    const take = Math.min(want, freeIn(g, x)); if (take <= 0) continue;
    const r = a.reservations.find(r => r.card === cardId && r.inv === x.id);
    if (r) r.qty += take; else a.reservations.push({ card: cardId, inv: x.id, gpu, qty: take });
    want -= take; if (!want) break;
  }
  return true;
}
export function release(g, cardId, gpu, qty = 1) {
  const a = g.arcade;
  if (a.active || a.signing || a.confirm || !Number.isSafeInteger(qty) || qty <= 0) return false;
  let left = qty, any = false;
  for (const r of [...a.reservations].reverse().filter(r => r.card === cardId && (!gpu || r.gpu === gpu))) {
    const take = Math.min(left, r.qty); r.qty -= take; left -= take; any = any || take > 0;
    if (!left) break;
  }
  a.reservations = a.reservations.filter(r => r.qty > 0);
  return any;
}
// Fill every row from free stock, as far as it goes. Never takes from another card.
export function fill(g, cardId) {
  const card = g.arcade.objectives.find(o => o.id === cardId);
  if (!card) return false;
  let any = false;
  for (const gpu of GPUS) if (card.recipe[gpu]) any = reserve(g, cardId, gpu, card.recipe[gpu]) || any;
  return any;
}

// Build: irreversible. Consumes the reserved units, records the build and applies the reward.
// Homogeneous builds come online at once; mixed builds integrate at the bell (see integrate).
export function build(g, cardId) {
  const a = g.arcade, c = g.company, card = a.objectives.find(o => o.id === cardId);
  if (!card || a.active || a.signing || a.confirm || !cardState(g, card).ready) return false;
  const moonshot = card.moonshot !== undefined, m = g.world.institutional?.moonshot;
  if (moonshot && (m?.card !== card.id || m.state !== (card.moonshot ? 'training' : 'cluster'))) return false;
  // Validate every reservation before consuming any: the build is all or nothing.
  const held = a.reservations.filter(r => r.card === cardId).map(r => [r, a.inventory.find(x => x.id === r.inv)]);
  if (held.some(([r, x]) => !x || x.left < r.qty)) return false;
  const cashCost = card.cashCost || 0;
  if (!Number.isSafeInteger(cashCost) || cashCost < 0 || cashCost > Math.round(g.cash * 100)) return false;
  // Frontier capital is Research; any other capital a card asks for (a data hall) is capex.
  if (cashCost) { g.cash = (Math.round(g.cash * 100) - cashCost) / 100; a.ledger[moonshot ? 'research' : 'capex'] += cashCost; }
  let cost = 0;
  for (const [r, x] of held) { x.left -= r.qty; cost += r.qty * x.unitCost; }
  a.reservations = a.reservations.filter(r => r.card !== cardId);
  card.status = 'built';
  c.seq++;
  const b = { id: `b${c.seq}`, q: g.q, card: card.id, lane: card.lane, kind: card.kind || null, tier: card.tier, name: card.name, recipe: { ...card.recipe }, mixed: card.mixed,
    cost, catalog: card.catalog || null, event: card.event || null, reward: structuredClone(card.reward), strategic: card.strategic || null, status: card.mixed ? 'integrating' : 'online', online: 0, at: a.time };
  if (card.scenario) { b.scenario = structuredClone(card.scenario); if (cashCost) b.cashCost = cashCost; }
  const customer = card.customer || customerOf(card);
  if (customer) b.customer = customer;
  c.builds.push(b);
  if (moonshot) {
    b.moonshot = card.moonshot; b.cashCost = cashCost;
    m[card.moonshot ? 'trainingBuild' : 'clusterBuild'] = b.id;
    m.state = card.moonshot ? 'training-integrating' : 'cluster-integrating';
  }
  a.built.push(b.id);
  if (!card.mixed) applyReward(g, b, 1);
  // Follow-up: the lane deals its next card at once (the dynamic objective).
  if (LANES.includes(card.lane)) {
    if (card.lane === 'product') c.tiers.product = Math.min(5, card.tier + 1);
    if (card.lane === 'infra') c.tiers.infra = Math.min(4, card.tier + 1);
    // Research takes the quarter. Other lanes always replace their committed project.
    const next = card.lane === 'research' ? null : drawCard(g, card.lane, 1);
    const i = a.objectives.indexOf(card);
    if (next) a.objectives.splice(i, 1, card, next); // the built card stays visible, stamped
    if (card.lane === 'product' && !['offered', 'waiting', 'next'].includes(g.world.strategic?.state) && !a.objectives.some(o => o.lane === 'opportunity' && o.status === 'open')) a.objectives.push(opportunityCard(g, 'pilot', Object.keys(card.recipe).at(-1)));
  }
  return b;
}

// Rewards apply once per build, scaled by the integrated fraction (1 for homogeneous builds).
export function applyReward(g, b, fraction) {
  const c = g.company, R = b.reward, before = b.online;
  b.online = before + fraction >= 1 - 1e-9 ? 1 : before + fraction;
  const add = b.online - before;
  if (add <= 0) return;
  const T = FOUNDER.tuned;
  if (R.revenue) {
    const p = c.products.find(p => p.build === b.id);
    if (p) p.online = b.online; else c.products.push({ build: b.id, name: b.name, revenue: b.tuned ? Math.round(R.revenue * (1 + T.revenue)) : R.revenue, online: b.online, ...(b.customer ? { customer: b.customer } : {}), ...(b.scenario?.contract ? { contract: true } : {}) });
  }
  if (R.rack) {
    const k = c.racks.find(k => k.build === b.id);
    if (k) k.online = b.online; else c.racks.push({ build: b.id, name: b.name, gpu: R.rack.gpu, qty: R.rack.qty + (b.tuned ? T.rack : 0), online: b.online });
  }
  if (R.level && b.online >= 1 && !b.result) {
    const u = stream(g.seed, 'v105-run', b.id).next(), applied = researchOdds(g, b);
    const odds = c.mods?.odds; if (c.mods) c.mods.odds = null;
    const pBreak = applied.breakthrough, pSet = applied.setback;
    if (odds) b.odds = { breakthrough: odds.breakthrough || 0, setback: odds.setback || 0 };
    b.result = u < pBreak ? 'breakthrough' : u >= 1 - pSet ? 'setback' : 'solid';
    if (applied.engineer) { g.world.flags.engineerUsed = true; g.world.flags.engineerResult = b.result; b.engineer = true; }
    if (applied.talent) { const t = g.world.scen.bonus; t.used = true; t.usedBy = b.id; t.result = b.result; b.talent = t.source; }
    if (b.result !== 'setback' && c.level < R.level) c.level = R.level;
    if (b.result === 'breakthrough') c.breakthroughs++;
  }
  if (R.hype && b.online >= 1) c.breakthroughs++;
  if (R.cash && b.online >= 1 && !b.paid) { b.paid = R.cash; g.cash = (Math.round(g.cash * 100) + R.cash) / 100; g.arcade.ledger.contracts += R.cash; }
  if (b.online >= 1) { b.status = 'online'; b.onlineQ ??= g.q; if (b.event) g.world.flags[`delivered.${b.event}`] = true; }
}

// Integration lifecycle (the Cluster Tetris boundary). Mixed builds sit at 'integrating'
// until the bell, where the Cluster Tetris result (or the skip baseline) is the efficiency:
// the share of the build brought online now. The rest stays 'delayed' and comes online in full
// at the next bell: capacity is delayed, never destroyed. A training run or partnership is all
// or nothing: it completes now at researchOnline or better, otherwise it all waits a bell.
export function integrate(g, buildId, efficiency = 1, tuned = false) {
  const b = g.company.builds.find(b => b.id === buildId);
  if (!b || !['integrating', 'delayed'].includes(b.status) || !(efficiency >= 0 && efficiency <= 1)) return false;
  if (b.status === 'integrating') { b.efficiency = efficiency; if (tuned && efficiency >= 1) b.tuned = true; }
  const whole = b.reward.level || b.reward.hype || b.strategic || b.moonshot !== undefined || b.scenario?.whole;
  const e = whole ? (efficiency >= FOUNDER.researchOnline ? 1 : 0) : efficiency;
  const remaining = 1 - b.online, now = b.status === 'delayed' ? remaining : remaining * e;
  applyReward(g, b, now);
  if (b.online < 1) b.status = 'delayed';
  return true;
}
export const pendingIntegration = g => g.company.builds.filter(b => ['integrating', 'delayed'].includes(b.status));

// ---- Exit ---------------------------------------------------------------------------------
// Equity value = company cash + EV × exit market (seeded). Founder payout = founder % × equity.
export function exitOutcome(g, adjust = m => m) {
  const c = g.company, cash = Math.round(g.cash * 100), m = stream(g.seed, 'v105-exit').range(...FOUNDER.exitMarket);
  const base = Math.round(m * 100) / 100, market = adjust(base), ev = enterpriseValue(c), evx = Math.round(ev * market), equity = cash + evx, pct = founderPct(c);
  if (c.shutdown) return { kind: 'shutdown', title: 'Shut down', market, baseMarket: base, ev, evx: 0, cash, equity: Math.max(0, cash), founderPct: pct, payout: Math.floor(pct * Math.max(0, cash)), mark: false };
  const arr = 4 * revenueNow(c);
  // Exit bands on EV × market: under $1.5M an acqui-hire, under $8M an acquisition, under $19M a
  // major acquisition; above that an IPO when ARR ≥ $1M and the model is Frontier or better.
  const X = FOUNDER.exitBands, Lg = FOUNDER.legendary;
  const kind = evx < X.acquihire ? 'acquihire' : evx < X.acquisition ? 'acquisition' : evx < X.major ? 'major'
    : arr >= X.ipoArr && c.level >= X.ipoLevel ? 'ipo' : 'strategic';
  const unicorn = equity >= X.unicorn, legendary = kind === 'ipo' && c.level >= Lg.level && c.breakthroughs >= Lg.breakthroughs && evx >= Lg.evx;
  const title = unicorn ? (kind === 'ipo' ? 'Unicorn IPO' : 'Unicorn acquisition') : legendary ? 'Category-defining IPO'
    : { acquihire: 'Acqui-hire', acquisition: 'Acquisition', major: 'Major acquisition', ipo: 'IPO', strategic: 'Strategic acquisition' }[kind];
  return { kind, title, unicorn, legendary,
    market, baseMarket: base, ev, evx, cash, equity, founderPct: pct, payout: Math.floor(pct * equity), mark: kind === 'ipo' };
}

// One summary for the HUD, the company board and the bots. Valuation = cash + EV (no exit
// market): what investors mark the company at today. Founder value is paper, not cash.
// V10.13 customer concentration: the named customers behind recurring revenue. Catalog products
// sell to a broad market and are never concentrated.
const EVENT_CUSTOMERS = Object.freeze({ 'whale-evaluation': 'Northline Logistics', 'whale-rollout': 'Northline Logistics' });
const PARTNER_CUSTOMERS = Object.freeze({ atlas: 'Helios', meridian: 'Meridian Health', openlab: 'Open Lab', harbor: 'Harbor Cloud', forge: 'Factory Forge', frontier: 'Frontier Relay', civic: 'Civic Grid' });
export function customerOf(card) {
  if (!card?.reward?.revenue) return null;
  if (card.event && EVENT_CUSTOMERS[card.event]) return EVENT_CUSTOMERS[card.event];
  if (card.strategic) return PARTNER_CUSTOMERS[card.strategic.id] || null;
  return null;
}
export function concentration(c) {
  const total = revenueOf(c), by = {};
  for (const p of c.products) if (p.customer && p.online > 0 && !p.lost) by[p.customer] = (by[p.customer] || 0) + Math.round(p.revenue * p.online);
  const top = Object.entries(by).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];
  return top && total > 0 ? { customer: top[0], revenue: top[1], share: top[1] / total } : { customer: null, revenue: 0, share: 0 };
}

export function companyStats(g) {
  const c = g.company, cash = Math.round(g.cash * 100), revenue = revenueNow(c), burn = burnOf(c), ev = enterpriseValue(c), valuation = cash + ev, pct = founderPct(c);
  const net = revenue - burn, cashRevenue = cashRevenueNow(c), cashNet = cashRevenue - burn;
  return { name: c.name, level: c.level, model: MODEL_NAMES[c.level], revenue, cashRevenue, prepaid: revenue - cashRevenue, burn, net, runway: cashNet >= 0 ? Infinity : Math.floor(cash / -cashNet),
    ev, valuation, founderPct: pct, founderValue: Math.floor(pct * valuation), stage: stageName(valuation), focus: focusOf(c), raised: c.raised,
    racks: rackOutput(c), products: liveProducts(c).length, breakthroughs: c.breakthroughs };
}
