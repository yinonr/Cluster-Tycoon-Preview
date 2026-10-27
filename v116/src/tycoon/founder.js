// V10.15 The Scaling Game: company scale, flagship projects, levels beyond State of the art, the AGI
// attempt and integration grades that leave capped company bonuses (docs/V10_15_DESIGN.md).
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
export const MODEL_NAMES = Object.freeze(['Prototype', 'Tuned', 'Specialist', 'Competitive', 'Frontier', 'State of the art', 'Agentic', 'AI Researcher']);
export const MAX_LEVEL = 7;
export const SCALE_NAMES = Object.freeze([null, 'Startup', 'Scale-up', 'AI Giant']);

// One table holds every tunable constant (tools/sim-v105.mjs reads the same table).
export const FOUNDER = Object.freeze({
  // Product revenue is paid at every bell: base × (1 + quality × model level).
  quality: .08,
  // Team burn per round, paid at every bell after revenue.
  burn: Object.freeze({ base: 300000, perLevel: 500000, perProduct: 50000 }),
  // Equity value = cash + EV. EV = 4 × revenue × multiple(level) + tech(level) + infra, × hype.
  multiple: Object.freeze([4, 5, 6, 7, 8, 9, 10, 11]),
  tech: Object.freeze([36000000, 60000000, 110000000, 180000000, 290000000, 430000000, 720000000, 1080000000]),
  // V10.16 valuation: product revenue is worth this many years (×4 rounds); research adds its own value.
  value: Object.freeze({ product: 8, lease: .7, partnershipIp: .15 }),
  expansion: .6,                   // each successive copy earns 60% of the previous copy
  rackYears: 8,                    // a rack is valued at eight rounds of its GPU output at base cost (V10.15: 6)
  hype: .10,                       // each breakthrough lifts EV by 10%, at most three
  // A finished training run is seeded per build: breakthrough, solid, or a setback (no new
  // level; the lane deals the same tier next round). Mixed runs swing both ways harder.
  run: Object.freeze({ breakthrough: .16, mixedBreakthrough: .10, setback: .14, mixedSetback: .06 }),
  engineer: Object.freeze({ breakthrough: .18, setback: .08 }),
  growth: .03,                     // each product's revenue grows 3% a round while it is online
  // Lane gates: a product tier may be at most model level + 1; infra at most level + 2.
  productGate: 1, infraGate: 2, infraScaleTier: Object.freeze([null, 2, 4, 5]),
  // GPU base cost per quarter at the base ask (used for rack value and pilot prizes only).
  unit: Object.freeze({ H100: 536550, H200: 698610, B200: 1064340 }),
  exitMarket: Object.freeze([.96, 1.06]),     // V10.16: narrowed from 0.90–1.15 so the company decides the payout
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
  // V10.14: dedicated contract revenue (one big customer: an anchor, a dedicated fleet) is valued at
  // this share of the product multiple. It pays the same cash; it is worth less at the exit.
  contractMultiple: .4,
  // V10.15 company scale: recomputed at each round open, never falls. Valuation = cash + EV.
  scale: Object.freeze({ scaleup: Object.freeze({ value: 250000000, cash: 75000000 }), giant: Object.freeze({ value: 900000000, cash: 200000000 }) }),
  // Flagship fleets are valued at more rounds of output than an ordinary rack.
  fleetYears: 10,
  // Ordinary cards: at most this many copies of one catalog project (the second earns 60%).
  copies: 2,
  // A flagship is dealt when cash + one round of revenue covers this share of its market cost.
  flagshipAfford: .75, flagshipRepeat: .75,
  // Integration grades leave capped, diminishing bonuses: each gain is a share of the headroom.
  ops: Object.freeze({ cap: Object.freeze({ serving: .12, research: .20, readiness: .20 }), gain: Object.freeze({ S: .40, A: .20, B: .06, C: 0, CREW: .04 }), readinessGpus: 16 }),
  grades: Object.freeze({ A: .88, B: .75 }),
  // Level 7 (AI Researcher) adds research efficiency at once.
  researcherBoost: .10,
  // The AGI attempt (fictional): odds and outcomes. Revenue mult and tech are permanent.
  // An AI Researcher (level 7) adds `researcher`; a level-6 lab may attempt from R9 without one.
  agi: Object.freeze({ base: .05, researcher: .10, perBreak: .04, maxBreaks: 3, readiness: 1, research: .3, gradeS: .10, gradeA: .05, cap: .55, partial: .35, earlyFrom: 9,
    tech: 3000000000, revenue: 1.25, partialTech: 800000000, failBurn: 30000000, failRounds: 2, capital: 150000000 }),
});

// The objective catalogue. Each tier has a homogeneous and a mixed variant where it makes
// sense; a seeded draw picks one per lane per round. Rewards compound differently by lane.
export const CATALOG = Object.freeze({
  product: [null,
    [{ name: 'Chatbot beta', blurb: 'Your first paying users.', recipe: { H100: 2 }, revenue: 400000 },
     { name: 'Code-review assistant', blurb: 'A tool developers pay for.', recipe: { H100: 3 }, revenue: 600000 },
     { name: 'Small-business inference', blurb: 'A small customer, a small commitment.', recipe: { H100: 1 }, revenue: 200000 },
     { name: 'Meeting-notes assistant', blurb: 'Every call, summarized.', recipe: { H100: 2 }, revenue: 450000 }],
    [{ name: 'Support agents', blurb: 'Customer service that runs itself.', recipe: { H100: 4 }, revenue: 850000 },
     { name: 'Document AI API', blurb: 'Contracts and invoices, read instantly.', recipe: { H200: 2 }, revenue: 600000 },
     { name: 'Overnight batch inference', blurb: 'Older GPUs, a patient customer.', recipe: { H100: 6 }, revenue: 1100000 },
     { name: 'Coding copilot', blurb: 'Developers ship faster.', recipe: { H100: 2, H200: 2 }, revenue: 950000, boost: 'tuned' }],
    [{ name: 'Enterprise API', blurb: 'Fortune 500 customers on your model.', recipe: { H200: 4 }, revenue: 900000 },
     { name: 'Voice agents', blurb: 'Phone calls answered by your model.', recipe: { H100: 3, H200: 2 }, revenue: 1000000 },
     { name: 'Enterprise agent rollout', blurb: 'A demanding customer with a real budget.', recipe: { H200: 2, B200: 2 }, revenue: 1150000 },
     { name: 'Warehouse vision service', blurb: 'Camera feeds on a mixed fleet.', recipe: { H100: 5, H200: 1 }, revenue: 1080000 },
     { name: 'Specialized inference API', blurb: 'One vertical, served well.', recipe: { H100: 4, H200: 2 }, revenue: 1200000, boost: 'fleet' }],
    [{ name: 'Inference fleet', blurb: 'Serve millions of requests a day.', recipe: { H100: 10 }, revenue: 1300000 },
     { name: 'Realtime multimodal app', blurb: 'See, hear and answer live.', recipe: { H200: 4, B200: 3 }, revenue: 1400000, boost: 'tuned' },
     { name: 'Multimodal support desk', blurb: 'Resolve a call, a photo and a problem.', recipe: { H200: 3, B200: 4 }, revenue: 1550000 },
     { name: 'Agentic customer success', blurb: 'Agents that close the ticket.', recipe: { H200: 5, B200: 3 }, revenue: 1600000, boost: 'agentic' }],
    [{ name: 'Hyperscale serving', blurb: 'A product the whole market uses.', recipe: { H200: 10 }, revenue: 1600000, boost: 'fleet' },
     { name: 'Agent platform', blurb: 'Every company builds on you.', recipe: { H200: 6, B200: 4 }, revenue: 1900000, boost: 'agentic' },
     { name: 'Developer coding cloud', blurb: 'Frontier reasoning, economical serving.', recipe: { H100: 4, H200: 4, B200: 3 }, revenue: 2050000 },
     { name: 'Dedicated inference service', blurb: 'Reserved capacity, premium price.', recipe: { H100: 8, H200: 4 }, revenue: 1900000, boost: 'fleet' },
     { name: 'Enterprise agent studio', blurb: 'Customers build agents on you.', recipe: { H200: 6, B200: 6 }, revenue: 2300000, boost: 'agentic' }],
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
    // V10.15: beyond State of the art. Agents first, then a model that does research.
    [{ name: 'Agentic model training', blurb: 'A model that plans, uses tools and finishes the job.', recipe: { H200: 6, B200: 14 } },
     { name: 'Tool-use RL run', blurb: 'Millions of tasks, graded and learned from.', recipe: { H100: 4, H200: 4, B200: 12 } }],
    [{ name: 'Automated researcher', blurb: 'A model that runs experiments on itself.', recipe: { H100: 6, H200: 8, B200: 18 } },
     { name: 'Self-improving training loop', blurb: 'The model writes its own curriculum.', recipe: { H100: 4, H200: 6, B200: 16 } }],
    [{ name: 'The AGI attempt', blurb: 'Fictional and speculative. Everything you built, one roll.', recipe: { H200: 12, B200: 36 }, agi: true }],
  ],
  infra: [null,
    [{ name: 'Lease a rack', blurb: 'Your own H100s, every round.', recipe: { H100: 3 }, rack: { gpu: 'H100', qty: 2 } },
     { name: 'Refurbished H100 shelf', blurb: 'One reliable unit from older hardware.', recipe: { H100: 2 }, rack: { gpu: 'H100', qty: 1 } }],
    [{ name: 'Colocation cage', blurb: 'H200s on tap.', recipe: { H200: 5 }, rack: { gpu: 'H200', qty: 3 } },
     { name: 'Dedicated inference cluster', blurb: 'Trade older capacity for reliable H200s.', recipe: { H100: 3, H200: 2 }, rack: { gpu: 'H200', qty: 2 } }],
    [{ name: 'B200 pod', blurb: 'Frontier compute you own.', recipe: { B200: 6 }, rack: { gpu: 'B200', qty: 2 } },
     { name: 'Frontier research pod', blurb: 'A mixed investment in next-round B200s.', recipe: { H200: 3, B200: 3 }, rack: { gpu: 'B200', qty: 2 } },
     { name: 'Edge inference site', blurb: 'Close to customers, cheap to run.', recipe: { H100: 4, H200: 2 }, rack: { gpu: 'H100', qty: 4 } }],
    [{ name: 'Data hall', blurb: 'A building full of your GPUs.', recipe: { H200: 6, B200: 8 }, rack: { gpu: 'B200', qty: 4 } },
     { name: 'Regional inference site', blurb: 'A broad fleet devoted to H200 production.', recipe: { H100: 5, H200: 4, B200: 3 }, rack: { gpu: 'H200', qty: 5 } }],
    // V10.16: a fifth infrastructure tier, so a compute company keeps building between flagships.
    [{ name: 'Liquid-cooled B200 hall', blurb: 'Dense, cool, yours.', recipe: { H200: 4, B200: 10 }, rack: { gpu: 'B200', qty: 5 } },
     { name: 'Inference capacity block', blurb: 'H200 output for every product you run.', recipe: { H100: 6, H200: 6 }, rack: { gpu: 'H200', qty: 6 } }],
  ],
});
// One-off opportunities (the fourth card): deterministic triggers, a ticking deadline.
export const OPPORTUNITIES = Object.freeze({
  pilot: { names: ['Pilot for a bank', 'Pilot for a hospital network', 'Pilot for a retailer', 'Pilot for an airline'], blurb: 'A customer wants proof before signing.', prize: 1.6, window: 18 },
  partner: { names: ['Co-train with a university lab', 'Joint paper with a research institute'], blurb: 'Publish together: investors notice.', window: 16 },
  rush: { names: ['Hackathon rush', 'Launch-day traffic spike'], blurb: 'Traffic you can serve right now.', prize: 1.45, window: 26 },
  // V10.16: research IP, trading, licensing and capacity deals (one opportunity card at a time).
  benchmark: { names: ['Frontier benchmark push', 'Reasoning leaderboard run', 'Public eval sweep'], blurb: 'Top the leaderboard: IP you keep.', ip: 10000000, window: 18 },
  arbitrage: { names: ['Compute arbitrage', 'Overflow capacity resale'], blurb: 'A buyer pays a premium for capacity now.', prize: 1.30, window: 20 },
  licensing: { names: ['Model licensing deal', 'OEM model license'], blurb: 'License your model to a partner.', revenue: 250000, window: 18 },
  capacity: { names: ['Capacity contract', 'Reserved-capacity deal'], blurb: 'A customer reserves your rack output.', lease: 60000, window: 22 },
});

// V10.15 flagship projects: big clusters for big companies (gates: scale, model level). A lane deals
// its flagship instead of an ordinary card when the gates pass and the company can afford it; each
// flagship can be built twice (the second earns flagshipRepeat). Flagships always integrate.
export const FLAGSHIPS = Object.freeze({
  product: [
    { name: 'Enterprise inference deployment', blurb: 'A Fortune 50 customer moves everything to you.', recipe: { H200: 8, B200: 4 }, revenue: 3000000, scale: 2, level: 3, tier: 6, boost: 'fleet' },
    { name: 'Global AI service', blurb: 'One product, every timezone.', recipe: { H100: 12, H200: 6 }, revenue: 3200000, scale: 2, level: 3, tier: 6, boost: 'fleet' },
    { name: 'AI-native enterprise suite', blurb: 'Every department, one platform.', recipe: { H100: 8, H200: 8 }, revenue: 3800000, scale: 2, level: 4, tier: 6, boost: 'tuned' },
    { name: 'Industry copilot suite', blurb: 'Law, finance and medicine on one model.', recipe: { H100: 6, H200: 6, B200: 4 }, revenue: 3600000, scale: 2, level: 3, tier: 6 },
    { name: 'Agent workforce platform', blurb: 'Companies hire your agents by the thousand.', recipe: { H200: 12, B200: 12 }, revenue: 7000000, scale: 3, level: 6, tier: 7 },
    { name: 'Autonomous enterprise agents', blurb: 'Agents that run whole departments.', recipe: { H100: 8, H200: 8, B200: 8 }, revenue: 6200000, scale: 3, level: 6, tier: 7, boost: 'tuned' },
    { name: 'Agent marketplace', blurb: 'Millions of agents, your rails.', recipe: { H200: 16, B200: 8 }, revenue: 8000000, scale: 3, level: 6, tier: 7, boost: 'fleet' },
  ],
  infra: [
    { name: 'Hyperscale fleet', blurb: 'Your own B200 fleet, leased out by the hour.', recipe: { H200: 6, B200: 12 }, rack: { gpu: 'B200', qty: 8 }, lease: 1200000, scale: 2, tier: 5 },
    { name: 'Inference cloud region', blurb: 'A region of H200s that never sleeps.', recipe: { H100: 12, H200: 10 }, rack: { gpu: 'H200', qty: 10 }, lease: 1000000, scale: 2, tier: 5 },
    { name: 'Frontier compute campus', blurb: 'The labs come to you for capacity.', recipe: { H200: 12, B200: 24 }, rack: { gpu: 'B200', qty: 16 }, lease: 3000000, scale: 3, tier: 6 },
    { name: 'Hyperscaler services region', blurb: 'A cloud of your own, sold by the hour.', recipe: { H100: 16, H200: 16, B200: 16 }, rack: { gpu: 'B200', qty: 20 }, lease: 5000000, scale: 3, tier: 7 },
  ],
});

const sumRecipe = r => GPUS.reduce((n, k) => n + (r[k] || 0), 0);
export const isMixed = r => GPUS.filter(k => r[k] > 0).length > 1;
export const recipeCost = r => GPUS.reduce((n, k) => n + (r[k] || 0) * FOUNDER.unit[k], 0);
export function researchOdds(g, run) {
  const U = FOUNDER.run, odds = g?.company.mods?.odds;
  const engineer = !!g?.world.flags.engineerHired && !g.world.flags.engineerUsed;
  // V10.14: a scenario talent bonus (Mara retained, the Okafor team, the Lantern team) applies to
  // the next completed training run once, alongside the existing one-shot odds.
  const talent = talentBonus(g);
  return {
    breakthrough: U.breakthrough + (run.mixed ? U.mixedBreakthrough : 0) + (run.tuned ? FOUNDER.tuned.breakthrough : 0) + (odds?.breakthrough || 0) + (engineer ? FOUNDER.engineer.breakthrough : 0) + (talent?.breakthrough || 0) + opsOf(g?.company).research / 2,
    setback: Math.max(0, U.setback + (run.mixed ? U.mixedSetback : 0) + (odds?.setback || 0) + (engineer ? FOUNDER.engineer.setback : 0) + (talent?.setback || 0)),
    engineer, talent: !!talent,
  };
}
// The armed scenario talent bonus, if any (consumed by the next training run or Moonshot).
export const talentBonus = g => { const b = g?.world?.scen?.bonus; return b && !b.used ? b : null; };

export function createCompany(seed, name = '') {
  return {
    name, level: 0, products: [], racks: [], breakthroughs: 0, ip: 0,
    shares: { founder: 1000000, investors: [] }, raised: 0, compute: [], builds: [], seq: 0, cardSeq: 0, oppSeq: 0,
    tiers: { product: 1, research: 1, infra: 1 }, shutdown: false, researchClosed: false,
    // V10.6 world modifiers (empty in a quiet world): temporary revenue multipliers, burn changes,
    // prepaid revenue, and the next training run's odds.
    // V10.14: tech is a proprietary-model discount (Lantern-70) that lifts at a model level.
    mods: { revenue: [], burn: [], prepaid: [], odds: null, tech: null },
    // V10.15: company scale (1–3), integration bonuses, the AGI attempt's outcome.
    scale: 1, ops: { serving: 0, research: 0, readiness: 0 }, grades: [], agi: null,
  };
}

// ---- Derived company figures (pure) ----------------------------------------------------
export const totalShares = c => c.shares.founder + c.shares.investors.reduce((n, i) => n + i.shares, 0);
export const founderPct = c => c.shares.founder / totalShares(c);
// V10.14: a lost customer's product stays on record (it was built) but earns and costs nothing.
export const liveProducts = c => c.products.filter(p => !p.lost);
export const revenueOf = c => c.products.filter(p => p.online > 0 && !p.lost).reduce((n, p) => n + Math.round(p.revenue * p.online), 0);
// V10.15: integration bonuses (absent on older saves read by shared code: zero).
export const opsOf = c => c?.ops || { serving: 0, research: 0, readiness: 0 };
const agiRevenue = c => c?.agi?.outcome === 'agi' ? FOUNDER.agi.revenue : 1;
const revenueMod = c => (c.mods?.revenue || []).reduce((m, x) => m * x.mult, 1) * (1 + opsOf(c).serving) * agiRevenue(c);
export const revenueNow = c => Math.round(revenueOf(c) * (1 + FOUNDER.quality * c.level) * revenueMod(c));
// The part of revenueNow that comes from dedicated contracts (products flagged `contract`).
// V10.16: the part of contract revenue that is leases from your own racks (fleets and capacity contracts).
export const leaseRevenueNow = c => Math.round(c.products.filter(p => p.lease && p.online > 0 && !p.lost).reduce((n, p) => n + Math.round(p.revenue * p.online), 0) * (1 + FOUNDER.quality * c.level) * revenueMod(c));
export const contractRevenueNow = c => Math.round(c.products.filter(p => p.contract && p.online > 0 && !p.lost).reduce((n, p) => n + Math.round(p.revenue * p.online), 0) * (1 + FOUNDER.quality * c.level) * revenueMod(c));
export const burnOf = c => FOUNDER.burn.base + FOUNDER.burn.perLevel * c.level + FOUNDER.burn.perProduct * liveProducts(c).length + (c.mods?.burn || []).reduce((n, x) => n + x.delta, 0);
// Revenue a customer already prepaid (V10.6 world): it arrives as cash earlier, not again.
export const prepaidNow = c => (c.mods?.prepaid || []).reduce((n, x) => n + x.perRound, 0);
export const cashRevenueNow = c => Math.max(0, revenueNow(c) - prepaidNow(c));
export const rackOutput = c => GPUS.map(gpu => [gpu, c.racks.filter(r => r.gpu === gpu && r.online > 0).reduce((n, r) => n + Math.floor(r.qty * r.online), 0)]).filter(([, n]) => n);
// V10.16 valuation by accomplishment: enterprise value is the sum of what the company earns and owns, each
// counted once. PRODUCTS: recurring product revenue × FOUNDER.value.product years of revenue. CONTRACTS:
// contract revenue at the contract multiple of that. RESEARCH & IP: the model's value by level, research IP
// (benchmarks, exceptional runs, breakthroughs, partnerships) and the AGI outcome. INFRASTRUCTURE: rack output
// at its unit value × rounds (fleets longer). No research multiple on revenue and no breakthrough multiplier
// on everything: research already lifts product revenue 8% a level and adds its own IP.
export function valuation(c) {
  const contract = contractRevenueNow(c), lease = leaseRevenueNow(c), product = revenueNow(c) - contract, V = FOUNDER.value;
  const t = c.mods?.tech, model = Math.round(FOUNDER.tech[c.level] * (t && c.level < t.until ? t.mult : 1));
  const products = 4 * product * V.product, contracts = Math.round(4 * (contract - lease) * V.product * FOUNDER.contractMultiple);
  const research = model + (c.ip || 0) + (c.agi?.tech || 0);
  // Owned capacity: rack output at unit value × rounds, plus the leases those racks earn (long-term capacity
  // rented from your own hardware is worth more than a customer contract: V.lease of the product multiple).
  const infra = c.racks.reduce((n, r) => n + Math.floor(r.qty * r.online) * FOUNDER.unit[r.gpu] * (r.fleet ? FOUNDER.fleetYears : FOUNDER.rackYears), 0) + Math.round(4 * lease * V.product * V.lease);
  return { products, contracts, research, infra, total: products + contracts + research + infra };
}
export const enterpriseValue = c => valuation(c).total;
export const stageName = v => v < 100000000 ? 'Garage' : v < 500000000 ? 'Seed' : v < 2500000000 ? 'Series A' : v < 10000000000 ? 'Growth' : v < 100000000000 ? 'Scale-up' : 'Unicorn';
export function focusOf(c) {
  const n = { product: 0, research: 0, infra: 0 };
  for (const b of c.builds) if (n[b.lane] !== undefined) n[b.lane]++;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return !top[1] ? 'Unknown startup' : { product: 'AI apps company', research: 'Frontier lab', infra: 'AI cloud' }[top[0]];
}

// ---- Objective cards -------------------------------------------------------------------
function laneTier(c, lane) {
  if (lane === 'research') return Math.min(MAX_LEVEL + 1, c.level + 1);
  if (lane === 'product') return Math.min(5, c.tiers.product, c.level + FOUNDER.productGate);
  // V10.16: infrastructure unlocks by model level or by company scale, so a compute company grows without training.
  return Math.min(5, c.tiers.infra, Math.max(c.level + FOUNDER.infraGate, FOUNDER.infraScaleTier[c.scale || 1]));
}
// V10.15 company scale: Startup (1), Scale-up (2), AI Giant (3). Recomputed at each round open; it
// never falls. Valuation = cash + EV, the same mark the HUD stake uses.
export function scaleOf(g) {
  const c = g.company, cash = Math.round(g.cash * 100), value = cash + enterpriseValue(c), S = FOUNDER.scale;
  return value >= S.giant.value || cash >= S.giant.cash ? 3 : value >= S.scaleup.value || cash >= S.scaleup.cash ? 2 : 1;
}
export function updateScale(g) { const c = g.company; c.scale = Math.max(c.scale || 1, scaleOf(g)); return c.scale; }
// Research efficiency shrinks training recipes (each GPU type at least one).
export const researchRecipe = (c, recipe) => Object.fromEntries(GPUS.filter(k => recipe[k]).map(k => [k, Math.max(1, Math.round(recipe[k] * (1 - opsOf(c).research)))]));
// Market cost of a recipe this round (asks drift 3.5% a round; founder-market uses the same drift).
const marketCost = (g, recipe) => Math.round(recipeCost(recipe) * (1 + .035 * (g.q - 1)));
const copiesOf = (c, name) => c.builds.filter(b => b.catalog === name).length;
// A lane's flagship, when the gates pass: scale, model level, two copies at most, one flagship per lane
// per round, and cash + one round of revenue covering flagshipAfford of its market cost.
export function flagshipFor(g, lane, salt = 0) {
  const c = g.company, list = FLAGSHIPS[lane];
  if (!list || c.builds.some(b => b.q === g.q && b.flagship && b.lane === lane)) return null;
  const power = Math.round(g.cash * 100) + cashRevenueNow(c);
  const options = list.filter(f => (c.scale || 1) >= f.scale && c.level >= (f.level || 0) && copiesOf(c, f.name) < FOUNDER.copies && power >= FOUNDER.flagshipAfford * marketCost(g, f.recipe));
  if (!options.length) return null;
  const r = stream(g.seed, 'v115-flagship', lane, g.q, c.cardSeq, salt);
  const top = Math.max(...options.map(f => f.tier)), tierPool = options.filter(f => f.tier === top);
  const least = Math.min(...tierPool.map(f => copiesOf(c, f.name))), pool = tierPool.filter(f => copiesOf(c, f.name) === least);
  const f = pool[r.int(0, pool.length - 1)], repeat = copiesOf(c, f.name), k = repeat ? FOUNDER.flagshipRepeat : 1;
  c.cardSeq++;
  return { id: `q${g.q}-${lane}-${c.cardSeq}`, lane, tier: f.tier, catalog: f.name, repeat, flagship: true, cluster: true, name: repeat ? `${f.name} · second site` : f.name, blurb: f.blurb, recipe: { ...f.recipe }, mixed: isMixed(f.recipe),
    reward: lane === 'product' ? { revenue: Math.round(f.revenue * k) } : { rack: { gpu: f.rack.gpu, qty: Math.max(1, Math.floor(f.rack.qty * k)), fleet: true }, lease: Math.round(f.lease * k) }, q: g.q, status: 'open', ...(f.boost ? { boost: f.boost } : {}) };
}
export function drawCard(g, lane, salt = 0) {
  const c = g.company, tier = lane === 'research' && c.level === MAX_LEVEL - 1 && g.q >= FOUNDER.agi.earlyFrom ? MAX_LEVEL + 1 : laneTier(c, lane);
  if (lane === 'research' && (c.researchClosed || c.agi || !CATALOG.research[tier])) return null;
  const flagship = flagshipFor(g, lane, salt);
  if (flagship) return flagship;
  const all = g.q === 1 && lane === 'product' && !c.builds.length ? CATALOG[lane][tier].slice(0, 2) : CATALOG[lane][tier];
  // V10.15: an ordinary project can be built at most twice; an exhausted lane waits for a bigger card.
  const options = lane === 'research' ? all : all.filter(o => copiesOf(c, o.name) < FOUNDER.copies);
  if (!options.length) return null;
  const r = stream(g.seed, 'v105-card', lane, g.q, c.cardSeq, salt);
  // Count committed builds too: mixed projects cannot evade saturation before integration.
  const copies = o => copiesOf(c, o.name);
  const least = Math.min(...options.map(copies)), pool = options.filter(o => copies(o) === least);
  const pick = pool[r.int(0, pool.length - 1)], repeat = lane === 'research' ? 0 : copies(pick);
  c.cardSeq++;
  // V10.16 lab supply: owning 4+ B200 rack output trims a training run's recipe by a fifth.
  const supply = lane === 'research' && !pick.agi && labSupply(c), recipe = lane === 'research' ? researchRecipe(c, supply ? scaleRecipe(pick.recipe, 1 - BOOSTS.labSupply.pct) : pick.recipe) : { ...pick.recipe };
  const card = { id: `q${g.q}-${lane}-${c.cardSeq}`, lane, tier, catalog: pick.name, repeat, name: repeat ? `${pick.name} · expansion` : pick.name, blurb: repeat ? `${pick.blurb} Smaller marginal returns from expansion.` : pick.blurb, recipe, mixed: isMixed(recipe),
    reward: lane === 'product' ? { revenue: Math.round(pick.revenue * FOUNDER.expansion ** repeat) } : lane === 'research' ? (pick.agi ? { agi: true } : { level: tier }) : { rack: { ...pick.rack, qty: Math.max(1, Math.floor(pick.rack.qty / (1 + repeat))) } }, q: g.q, status: 'open' };
  // Big training runs (16+ GPUs) and the AGI attempt are clusters: they always integrate.
  if (lane === 'research' && sumRecipe(recipe) >= FOUNDER.ops.readinessGpus) card.cluster = true;
  if (pick.agi) Object.assign(card, { kind: 'agi', cashCost: FOUNDER.agi.capital, cluster: true });
  if (pick.boost) card.boost = pick.boost;
  if (supply) card.labSupply = true;
  return card;
}
// V10.16 combinations: some projects earn more when another lane already delivered (checked when the
// project comes online). Lab supply is a research discount from your own B200 racks.
export const BOOSTS = Object.freeze({
  fleet: Object.freeze({ pct: .25, label: 'on your own fleet', test: c => c.racks.some(r => r.fleet && r.online > 0) }),
  agentic: Object.freeze({ pct: .30, label: 'with an Agentic model', test: c => c.level >= 6 }),
  tuned: Object.freeze({ pct: .20, label: 'after an S or A rack', test: c => ['S', 'A'].includes(c.grades?.at(-1)?.grade) }),
  labSupply: Object.freeze({ pct: .20, label: 'lab supply from your B200 racks', gpus: 4 }),
});
export const boostMet = (c, kind) => !!BOOSTS[kind]?.test?.(c);
export const labSupply = c => c.racks.filter(r => r.gpu === 'B200' && r.online > 0).reduce((n, r) => n + Math.floor(r.qty * r.online), 0) >= BOOSTS.labSupply.gpus;
const scaleRecipe = (recipe, k) => Object.fromEntries(Object.entries(recipe).map(([gpu, n]) => [gpu, Math.max(1, Math.round(n * k))]));
// A one-off opportunity: a cash prize at a premium to market cost, or a research partnership.
export function opportunityCard(g, kind, gpu, qty = 0) {
  const c = g.company, O = OPPORTUNITIES[kind], r = stream(g.seed, 'v105-opp', g.q, c.oppSeq, kind);
  c.oppSeq++; c.cardSeq++;
  const now = g.arcade.time;
  // A partnership scales with your model: frontier labs only co-train with frontier compute.
  const recipe = kind === 'partner' ? { H200: 1 + Math.floor(c.level / 2), B200: 2 + c.level } : kind === 'rush' ? { H100: 2 + r.int(0, Math.min(3, g.q)) }
    : kind === 'benchmark' ? { H200: 2 + Math.floor(c.level / 3), B200: 3 + c.level } : kind === 'licensing' ? { H200: 2 + Math.floor(c.level / 2) }
    : kind === 'arbitrage' || kind === 'capacity' ? { [gpu]: qty } : { [gpu]: 2 + r.int(0, 1 + Math.floor(g.q / 4)) };
  const reward = kind === 'partner' ? { hype: 1 } : kind === 'benchmark' ? { ip: O.ip * c.level } : kind === 'licensing' ? { revenue: O.revenue * c.level }
    : kind === 'capacity' ? { lease: O.lease * qty } : { cash: Math.round(recipeCost(recipe) * O.prize * (1 + .03 * g.q) / 100) * 100 };
  return { id: `q${g.q}-opp-${c.cardSeq}`, lane: 'opportunity', kind, tier: 0, name: r.pick(O.names), blurb: O.blurb, recipe, mixed: isMixed(recipe), reward, q: g.q,
    at: now, until: Math.min(g.arcade.seconds, Math.round(now) + O.window), status: 'open', ...(kind === 'licensing' || kind === 'capacity' ? { contract: true } : {}) };
}
// V10.16: which new opportunity (if any) the floor offers now. Deterministic: state and time only; each
// kind at most once a round, and only while no other opportunity is open.
export function nextOpportunity(g) {
  const a = g.arcade, c = g.company, t = a.time, had = k => a.objectives.some(o => o.kind === k), late = a.seconds - 14;
  if (t >= late) return null;
  const researched = c.builds.some(b => b.q === g.q && b.lane === 'research');
  if (researched && c.level >= 3 && g.q >= 4 && !had('benchmark')) return ['benchmark'];
  const block = (c.scale || 1) >= 2 && a.lots.find(l => l.block && !l.sourced && l.status === 'open' && l.at <= t && l.until > t + 6);
  if (block && !had('arbitrage')) return ['arbitrage', block.gpu, Math.max(6, Math.min(24, Math.round(block.qty / 2)))];
  if (c.level >= 4 && g.q >= 5 && !had('licensing') && !c.builds.some(b => b.kind === 'licensing' && b.reward.revenue === OPPORTUNITIES.licensing.revenue * c.level)) return ['licensing'];
  const [gpu, out] = rackOutput(c).sort((x, y) => y[1] - x[1])[0] || [];
  if (out >= 8 && g.q >= 4 && !had('capacity')) return ['capacity', gpu, Math.min(24, out)];
  return null;
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
// V10.15 Agentic filing: new capacity goes into the one open project that still needs that GPU (none
// when two projects compete: that stays your decision). No desk guards: called inside a signing.
export function fileUnits(g, item) {
  const a = g.arcade, cards = openCards(g).filter(o => o.recipe[item.gpu] && cardState(g, o).live && heldFor(g, o.id, item.gpu) < o.recipe[item.gpu]);
  if (cards.length !== 1) return null;
  const card = cards[0], qty = Math.min(item.left - reservedOn(g, item.id), card.recipe[item.gpu] - heldFor(g, card.id, item.gpu));
  if (!(qty > 0)) return null;
  const r = a.reservations.find(r => r.card === card.id && r.inv === item.id);
  if (r) r.qty += qty; else a.reservations.push({ card: card.id, inv: item.id, gpu: item.gpu, qty });
  return { card: card.id, name: card.name, qty };
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
    cost, catalog: card.catalog || null, event: card.event || null, reward: structuredClone(card.reward), strategic: card.strategic || null, status: card.mixed || card.cluster ? 'integrating' : 'online', online: 0, at: a.time };
  if (card.flagship) b.flagship = true;
  if (card.boost) b.boost = card.boost;
  if (card.contract) b.contract = true;
  if (card.kind === 'agi') b.cashCost = cashCost;
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
  // V10.16: a homogeneous training run trains until the bell (its result uses the round's execution).
  if (!card.mixed && !card.cluster) { if (card.lane === 'research' && b.reward.level) b.status = 'training'; else applyReward(g, b, 1); }
  // Follow-up: the lane deals its next card at once (the dynamic objective).
  if (LANES.includes(card.lane)) {
    if (card.lane === 'product') c.tiers.product = Math.min(5, card.tier + 1);
    if (card.lane === 'infra') c.tiers.infra = Math.min(5, card.tier + 1);
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
    // V10.16: a met combination (fleet, Agentic, tuned clusters) lifts the product when it first comes online.
    if (!p && b.boost && boostMet(c, b.boost)) b.boosted = true;
    const k = (b.tuned ? 1 + T.revenue : 1) * (b.boosted ? 1 + BOOSTS[b.boost].pct : 1);
    if (p) p.online = b.online; else c.products.push({ build: b.id, name: b.name, revenue: Math.round(R.revenue * k), online: b.online, ...(b.customer ? { customer: b.customer } : {}), ...(b.scenario?.contract || b.contract ? { contract: true } : {}) });
  }
  if (R.rack) {
    const k = c.racks.find(k => k.build === b.id);
    if (k) k.online = b.online; else c.racks.push({ build: b.id, name: b.name, gpu: R.rack.gpu, qty: R.rack.qty + (b.tuned ? T.rack : 0), online: b.online, ...(R.rack.fleet ? { fleet: true } : {}) });
  }
  // V10.15: a fleet's lease income is contract revenue (valued at the contract multiple).
  if (R.lease) {
    const p = c.products.find(p => p.build === b.id);
    if (p) p.online = b.online; else c.products.push({ build: b.id, name: `${b.name} lease`, revenue: b.tuned ? Math.round(R.lease * (1 + T.revenue)) : R.lease, online: b.online, contract: true, lease: true });
  }
  if (R.agi && b.online >= 1 && !b.result) resolveAgi(g, b);
  if (R.level && b.online >= 1 && !b.result) {
    const u = stream(g.seed, 'v105-run', b.id).next(), applied = researchOdds(g, b);
    const odds = c.mods?.odds; if (c.mods) c.mods.odds = null;
    // V10.16: the run's quality (execution, integration, research efficiency) moves the roll.
    const qy = b.quality || 0, RO = OUTCOME.research;
    const pBreak = applied.breakthrough + RO.breakthrough * qy, pSet = applied.setback > 0 ? Math.max(RO.setbackMin, applied.setback - RO.setback * qy) : 0;
    if (odds) b.odds = { breakthrough: odds.breakthrough || 0, setback: odds.setback || 0 };
    b.result = u < pBreak ? 'breakthrough' : u >= 1 - pSet ? 'setback' : 'solid';
    const exceeded = b.result === 'solid' && stream(g.seed, 'v116-outcome', b.id).next() < band(OUTCOME.exceeded, qy);
    b.outcome = { tier: b.result === 'setback' ? 'under' : b.result === 'breakthrough' ? 'breakthrough' : exceeded ? 'exceeded' : 'met', mult: 1, q: qy };
    const ip = b.outcome.tier === 'breakthrough' || b.outcome.tier === 'exceeded' ? Math.round(RO.ip[b.outcome.tier] * FOUNDER.tech[R.level]) : 0;
    if (ip) { b.ipPaid = ip; c.ip = (c.ip || 0) + ip; }
    if (applied.engineer) { g.world.flags.engineerUsed = true; g.world.flags.engineerResult = b.result; b.engineer = true; }
    if (applied.talent) { const t = g.world.scen.bonus; t.used = true; t.usedBy = b.id; t.result = b.result; b.talent = t.source; }
    if (b.result !== 'setback' && c.level < R.level) {
      c.level = R.level;
      // V10.15: an AI Researcher makes every later run more efficient at once.
      if (R.level === 7) boostOps(c, 'research', FOUNDER.researcherBoost);
    }
    if (b.result === 'breakthrough') c.breakthroughs++;
  }
  if (R.hype && b.online >= 1 && !b.ipPaid) { c.breakthroughs++; b.ipPaid = Math.round(FOUNDER.value.partnershipIp * FOUNDER.tech[Math.max(1, c.level)]); c.ip = (c.ip || 0) + b.ipPaid; }
  if (R.ip && b.online >= 1 && !b.ipPaid) { b.ipPaid = R.ip; c.ip = (c.ip || 0) + R.ip; }
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
  const whole = b.reward.level || b.reward.hype || b.reward.agi || b.strategic || b.moonshot !== undefined || b.scenario?.whole;
  const e = whole ? (efficiency >= FOUNDER.researchOnline ? 1 : 0) : efficiency;
  const remaining = 1 - b.online, now = b.status === 'delayed' ? remaining : remaining * e;
  applyReward(g, b, now);
  if (b.online < 1) b.status = 'delayed';
  return true;
}
export const pendingIntegration = g => g.company.builds.filter(b => ['integrating', 'delayed'].includes(b.status));

// ---- V10.16 execution quality and variable outcomes -------------------------------------------------------
// Ringing the bell early with time left improves the expected outcome of this round's work (never a cash
// payment). Each project completed this round resolves at the bell: quality = execution + integration +
// preparation moves both the odds and the size of its result. Applied once per project.
export const EXECUTION = Object.freeze({ perSecond: .004, cap: .10, grace: 1 });
export const executionOf = (time, seconds) => { const left = seconds - time; return left > EXECUTION.grace ? Math.round(Math.min(EXECUTION.cap, left * EXECUTION.perSecond) * 10000) / 10000 : 0; };
export const OUTCOME = Object.freeze({
  grade: Object.freeze({ S: .10, A: .06, B: .02, C: -.04, CREW: 0 }), clean: .03, prep: .02, prepMin: -2, prepMax: 3, min: -.10, max: .35,
  under: Object.freeze({ base: .18, k: -.6, min: .03, max: .30, mult: .80 }),
  exceeded: Object.freeze({ base: .22, k: .9, min: .10, max: .50, mult: 1.20, q: .5 }),
  breakthrough: Object.freeze({ base: .04, k: .25, min: .02, max: .14, mult: 1.50, q: 1 }),
  research: Object.freeze({ breakthrough: .25, setback: .4, setbackMin: .02, ip: Object.freeze({ exceeded: .15, breakthrough: .35 }) }),
});
export const OUTCOME_NAMES = Object.freeze({ under: 'UNDERPERFORMED', met: 'MET EXPECTATIONS', exceeded: 'EXCEEDED EXPECTATIONS', breakthrough: 'BREAKTHROUGH' });
const clampTo = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const band = (B, q) => clampTo(B.base + B.k * q, B.min, B.max);
export function qualityOf(g, b, exec) {
  const c = g.company, O = OUTCOME;
  const integ = b.grade ? (O.grade[b.grade] ?? 0) : b.mixed || b.status === 'integrating' ? 0 : O.clean;
  const prep = b.lane === 'product' ? O.prep * clampTo(c.level - (b.tier - 1), O.prepMin, O.prepMax) : isResearchBuild(b) ? opsOf(c).research / 2 : 0;
  return round4(clampTo(exec + integ + prep, O.min, O.max));
}
// Products, fleets and racks, and research IP projects; contracted terms, prizes and partnerships are fixed.
export const outcomeEligible = b => !b.scenario && !b.strategic && !b.moonshot && !b.contract && !b.reward?.agi && !b.reward?.level &&
  (b.lane === 'product' || b.lane === 'infra' || !!b.reward?.ip);
export function outcomeOdds(q) {
  const under = band(OUTCOME.under, q), breakthrough = band(OUTCOME.breakthrough, q), exceeded = band(OUTCOME.exceeded, q);
  return { under, exceeded, breakthrough, met: Math.max(0, 1 - under - exceeded - breakthrough) };
}
export function resolveOutcome(g, b) {
  const c = g.company, O = OUTCOME, q = b.quality || 0, p = outcomeOdds(q), u = stream(g.seed, 'v116-outcome', b.id).next();
  const tier = u >= 1 - p.breakthrough ? 'breakthrough' : u < p.under ? 'under' : u < p.under + p.exceeded ? 'exceeded' : 'met';
  const mult = round4(tier === 'under' ? O.under.mult : tier === 'exceeded' ? O.exceeded.mult + O.exceeded.q * q : tier === 'breakthrough' ? O.breakthrough.mult + O.breakthrough.q * q : 1);
  b.outcome = { tier, mult, q };
  if (mult === 1) return b.outcome;
  for (const x of c.products) if (x.build === b.id) x.revenue = Math.max(1, Math.round(x.revenue * mult));
  for (const k of c.racks) if (k.build === b.id) k.qty = Math.max(1, Math.round(k.qty * mult));
  if (b.ipPaid) { const d = Math.round(b.ipPaid * (mult - 1)); b.ipPaid += d; c.ip = Math.max(0, (c.ip || 0) + d); }
  return b.outcome;
}

// ---- V10.15 integration grades and company bonuses ------------------------------------------
// One grade per rack: S (perfect), A (≥ 90%), B (≥ 75%), C (below); a skipped rack is the CREW baseline.
export function gradeOf(out) {
  if (!out) return null;
  if (out.skipped) return 'CREW';
  if (out.perfect) return 'S';
  return out.efficiency >= FOUNDER.grades.A ? 'A' : out.efficiency >= FOUNDER.grades.B ? 'B' : 'C';
}
const round4 = x => Math.round(x * 10000) / 10000;
function boostOps(c, k, add) {
  c.ops ||= { serving: 0, research: 0, readiness: 0 };
  const before = c.ops[k]; c.ops[k] = round4(Math.min(FOUNDER.ops.cap[k], before + add)); return c.ops[k] - before;
}
export const isResearchBuild = b => b.lane === 'research' || b.kind === 'partner' || b.moonshot !== undefined;
// Each grade gains a share of the remaining headroom of the bonuses its rack can earn: research racks
// earn research efficiency (and frontier readiness when 16+ GPUs train together), everything else
// earns serving efficiency.
// The bonuses a grade would add (pure: the integration screen previews it before Continue).
export function gradeGains(g, grade, builds) {
  const c = g.company, O = FOUNDER.ops, gain = O.gain[grade] || 0, kinds = new Set(), o = opsOf(c), gains = {};
  let researchGpus = 0;
  for (const b of builds) { if (isResearchBuild(b)) { kinds.add('research'); researchGpus += sumRecipe(b.recipe); } else kinds.add('serving'); }
  if (researchGpus >= O.readinessGpus) kinds.add('readiness');
  for (const k of ['serving', 'research', 'readiness']) if (kinds.has(k) && gain > 0) {
    const after = round4(Math.min(O.cap[k], o[k] + (O.cap[k] - o[k]) * gain));
    if (after > o[k]) gains[k] = round4(after - o[k]);
  }
  return gains;
}
export function applyGrade(g, grade, builds) {
  const c = g.company, gains = gradeGains(g, grade, builds);
  c.ops ||= { serving: 0, research: 0, readiness: 0 }; c.grades ||= [];
  for (const [k, d] of Object.entries(gains)) c.ops[k] = round4(Math.min(FOUNDER.ops.cap[k], c.ops[k] + d));
  c.grades.push({ q: g.q, grade, gains });
  return gains;
}
// The AGI attempt (fictional): odds from breakthroughs, readiness, research efficiency and the grade
// of the attempt's own rack. Never certain, never hopeless for a prepared lab.
export function agiOdds(g, grade = null, exec = 0) {
  const c = g.company, A = FOUNDER.agi, o = opsOf(c);
  // V10.16: a fast close (execution quality) adds half its value to the attempt's AGI odds.
  const agi = Math.min(A.cap, A.base + (c.level >= MAX_LEVEL ? A.researcher : 0) + A.perBreak * Math.min(A.maxBreaks, c.breakthroughs) + o.readiness * A.readiness + o.research * A.research + (grade === 'S' ? A.gradeS : grade === 'A' ? A.gradeA : 0) + exec / 2);
  const failure = Math.max(.10, 1 - agi - A.partial);
  return { agi: round4(agi), partial: round4(1 - agi - failure), failure: round4(failure) };
}
function resolveAgi(g, b) {
  const c = g.company, A = FOUNDER.agi, odds = agiOdds(g, b.grade, b.exec || 0), u = stream(g.seed, 'v115-agi', b.id).next();
  const outcome = u < odds.agi ? 'agi' : u < odds.agi + odds.partial ? 'partial' : 'failure';
  c.agi = { outcome, odds, build: b.id, q: g.q, tech: outcome === 'agi' ? A.tech : outcome === 'partial' ? A.partialTech : 0 };
  b.result = outcome === 'failure' ? 'setback' : 'breakthrough'; b.agiOutcome = outcome;
  if (outcome !== 'failure') c.breakthroughs++;
  else c.mods.burn.push({ delta: A.failBurn, left: A.failRounds, event: 'agi-failure' });
  g.world.flags[`agi.${outcome}`] = true;
}

// ---- Exit ---------------------------------------------------------------------------------
// Equity value = company cash + EV × exit market (seeded). Founder payout = founder % × equity.
export function exitOutcome(g, adjust = m => m) {
  const c = g.company, cash = Math.round(g.cash * 100), m = stream(g.seed, 'v105-exit').range(...FOUNDER.exitMarket);
  const base = Math.round(m * 100) / 100, market = adjust(base), v = valuation(c), ev = v.total, evx = Math.round(ev * market), equity = cash + evx, pct = founderPct(c);
  if (c.shutdown) return { kind: 'shutdown', title: 'Shut down', market, baseMarket: base, ev, evx: 0, cash, equity: Math.max(0, cash), founderPct: pct, payout: Math.floor(pct * Math.max(0, cash)), mark: false };
  const arr = 4 * revenueNow(c);
  // Exit bands on EV × market: under $1.5M an acqui-hire, under $8M an acquisition, under $19M a
  // major acquisition; above that an IPO when ARR ≥ $1M and the model is Frontier or better.
  const X = FOUNDER.exitBands, Lg = FOUNDER.legendary;
  const kind = evx < X.acquihire ? 'acquihire' : evx < X.acquisition ? 'acquisition' : evx < X.major ? 'major'
    : arr >= X.ipoArr && c.level >= X.ipoLevel ? 'ipo' : 'strategic';
  const unicorn = equity >= X.unicorn, legendary = kind === 'ipo' && c.level >= Lg.level && c.breakthroughs >= Lg.breakthroughs && evx >= Lg.evx;
  const title = c.agi?.outcome === 'agi' ? 'The AGI Company' : unicorn ? (kind === 'ipo' ? 'Unicorn IPO' : 'Unicorn acquisition') : legendary ? 'Category-defining IPO'
    : { acquihire: 'Acqui-hire', acquisition: 'Acquisition', major: 'Major acquisition', ipo: 'IPO', strategic: 'Strategic acquisition' }[kind];
  // V10.16: the four components behind EV (they sum to it exactly), for the final sheet.
  return { kind, title, unicorn, legendary, parts: { products: v.products, research: v.research, infra: v.infra, contracts: v.contracts },
    market, baseMarket: base, ev, evx, cash, equity, founderPct: pct, payout: Math.floor(pct * equity), mark: kind === 'ipo' };
}

// One summary for the HUD, the company board and the bots. Valuation = cash + EV (no exit
// market): what investors mark the company at today. Founder value is paper, not cash.
// V10.14 customer concentration: the named customers behind recurring revenue. Catalog products
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
    racks: rackOutput(c), products: liveProducts(c).length, breakthroughs: c.breakthroughs, scale: c.scale || 1, scaleName: SCALE_NAMES[c.scale || 1], ops: { ...opsOf(c) } };
}
