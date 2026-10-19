// VENTURE MODE: every tunable number in one place. The values come from the
// calibrated economy prototype (docs/venture-proto/venture-econ.mjs, its C
// object) and Amendment A (docs/VENTURE_SYSTEM.md): two-way mark-to-market at
// the exit, the bridge as equity, Compute SAFE pricing.
//
// Bump VENTURE_RULES whenever a change makes an old venture seed play
// differently (a saved venture records the rules it started under).

import { TERM_ADJ } from '../data/gpus.js';
import { FUND_FIRMS } from '../data/names.js';

export const VENTURE_RULES = 2; // 2: word of mouth (C.reliable), the 150 s venture afternoon

export const GPU_IDS = ['H100', 'H200', 'B200'];

export const C = {
  quarters: 6,
  // A venture afternoon (noon → 5 PM) runs in this many seconds; the Daily Floor
  // keeps its 240. Every bulletin, the 1 PM call, every fuse and the bell keep
  // their place in the afternoon, just sooner (floor.js extend).
  floorSeconds: 150,
  hoursQ: 2190,                       // 730 h × 3 months
  cash0: 14e6,
  // The book you start with: one quarter left on a small H100 contract.
  start: { gpu: 'H100', qty: 256, rate: 2.45, term: 3, firm: 'Your first cluster' },
  D0: 300,                            // inference demand, in serving GPU-equivalents

  // Revenue: $ per served GPU-eq hour, model v1..v4. 20% of it tracks the H100
  // bench (compute gets cheaper, so does inference); RIVAL takes 12% off until
  // your next launch.
  price: [3.55, 3.80, 4.05, 4.30],
  priceFollowsCompute: 0.2,
  serve: { H100: 1.0, H200: 1.3, B200: 1.8 },   // serving power per GPU
  train: { H100: 1.0, H200: 1.5, B200: 2.4 },   // training power per GPU
  thresholds: [800, 2150, 4750],      // cumulative training units for v2, v3, v4
  idleTrain: 0.6,                     // serving capacity above demand trains at this efficiency
  growth: 0.14,                       // organic demand growth per quarter
  launchJump: 1.15,                   // demand × on each model launch
  churn: 0.4,                         // share of unserved demand lost to rivals each quarter
  // Word of mouth, only in a surge quarter (a DEMAND or CRUNCH card in force:
  // customers are shopping and rivals can't serve them all). Serve every
  // customer, with serving capacity to spare, and you win new ones: demand next
  // quarter × (1 + max × (1 − e^(−(headroom − min) / h0))), headroom = spare
  // serving capacity ÷ demand. Diminishing: +8% at 10% headroom, +14% at 20%,
  // +22% at 50%, never +25%. Tuned in M3/M4 with tools/venture-sim.mjs: plain
  // headroom (every quarter) lifted every company ~50%, because training GPUs
  // serve too and every strategy carries 18–40% headroom.
  reliable: { max: 0.25, h0: 0.25, min: 0 },
  burn0: 0.9e6, burnGrowth: 0.10,     // the team: $0.9M in Q1, +10% a quarter

  // The market: the venture's own bench, moved at each close by drift, the
  // venture's regime (a third each) and the event cards.
  bench0: { H100: 2.42, H200: 3.08, B200: 4.65 },
  drift: { H100: -0.02, H200: -0.02, B200: -0.03 },
  regimes: [
    { id: 'LOOSENING', drift: -0.045 },
    { id: 'STEADY', drift: 0 },
    { id: 'TIGHTENING', drift: 0.045 },
  ],
  termAdj: TERM_ADJ,                  // V1's, unchanged
  termQ: { 3: 1, 6: 2, 12: 4, 24: 8 },

  // Paying for compute. Cash: one quarter of payments as a deposit at signing,
  // credited to the contract's last quarter. Capital desk: no deposit, a fee on
  // every hour of the term, floating (+ the CREDIT spread while it lasts), on a
  // line of $13M + 0.85 × run-rate ARR measured against financed payments still owed.
  depositQ: 1,
  fee: { 3: 0.10, 6: 0.11, 12: 0.13, 24: 0.16 }, // $/GPU-hr (no lot offers 3 months yet)
  line0: 13e6, lineARR: 0.85,

  // The board. A met SCALE, TRAIN or LOCK releases the tranche, scaled by how
  // well you priced the deals that met it: × (0.2 + 1.6 × q), q = the Floor
  // Score price factor, weighted by what met the need. SAFE compute counts as a deal at target.
  // Tuned in M1 from tools/venture-sim.mjs (was $2.5M × (0.6 + 0.8q)): about
  // the same money at target ($2.5M), up to $5.4M for a floor-legend price and
  // $0.6M at walk-away, so floor skill shows in the company's cash.
  tranche: 3.0e6,
  trancheQ: { base: 0.2, k: 1.6, safe: 0.4 },        // SAFE compute: as if bought at target (no tranche edge for equity)
  missPenalty: 0.06,                  // each missed objective: exit multiple × (1 − this)

  // Board objectives (objectives.js). Quantities are multiples of 128.
  objectives: {
    qtyStep: 128, qtyMin: 128, qtyMax: 2048,
    scale: { cover: 1.05, min: 128, max: 1024, deliveryDays: 30, minTerm: 6 },
    train: { perUnit: 4.5, min: 256, max: 512, deliveryDays: 30, minTerm: 6 },
    pilot: { chance: 0.45, qty: [256, 384], bonus: 1.0e6, demandPerGpu: 0.2, deliveryDays: 7, minTerm: 12 },
    lock: { chance: 0.5, base: 0.8, minGap: 128, min: 256, max: 768, deliveryDays: 30, minTerm: 24 },
  },
  rumorAcc: 0.75,                     // the memo's word on the floor names the next card this often

  // Event cards (events.js).
  ev: { glut: 0.18, glutB200: 0.23, crunch: 0.17, crunchB200: 0.20, efficient: 0.17, demand: 0.28, creditSpread: 0.25, creditLine: 0.65, rival: 0.12, rivalDemand: 0.05, enterprise: 1.5, crunchSupply: 0.5, crunchRival: 0.2, powerDelay: 45 },

  // Venture-only B200 "blackwell" lot on floors whose objective accepts B200:
  // half the objective's quantity, three weeks out, 12 or 24 months.
  blackwell: { share: 0.5, delivery: 21, terms: [12, 24], askOff: -0.02 },

  // The first cash shortfall: the capital desk bridges you for equity. The second: sold for parts.
  bridge: { cash: 9.5e6, equityPct: 40, investor: 'Capital desk bridge' },

  // Exit after Q6: valuation = ARR × clamp(3 + 4g, 2, 6) × model factor × gross-margin
  // factor × (1 − 0.06 × missed) + cash + unconsumed deposits + mark-to-market.
  // Contract hours left after Q6 are marked at (1 − haircut) × bench − effective rate:
  // losses count in full, gains at gainShare (resale friction).
  exit: { base: 3, kG: 4, lo: 2, hi: 6, model: [1, 1.05, 1.10, 1.15], gmRef: 0.37, kGM: 1 / 0.37, gmLo: 0.4, gmHi: 1.4, haircut: 0.15, gainShare: 0.5 },

  // Compute SAFE (safe.js): investors offer compute reservations for equity.
  safe: {
    count: [{ w: 3, v: 0 }, { w: 4, v: 1 }, { w: 3, v: 2 }],      // offers per quarter
    gpu: [{ w: 4, v: 'H100' }, { w: 4, v: 'H200' }, { w: 2, v: 'B200' }],
    qty: { min: 128, max: 768, step: 128 },
    termQ: [2, 4],
    premium: [1.1, 1.4],           // M1 tuning (was 1.25–1.6): after the review's fixes SAFE-heavy fell to 4.5% best; now ~7%
    preMoneyFloor: 40e6,
    delivery: { now: 30, next: 60 }, // startQ q = within 30 days; q + 1 = next quarter
  },

  // The TRAIN ◄► SERVE lever: share of online compute sent to training.
  levers: [0, 0.25, 0.5, 0.75, 1],

  // Exit tiers, graded on your stake (valuation × your ownership). PROVISIONAL:
  // names and bands are tuned in M4 from tools/venture-sim.mjs.
  tiers: [
    { min: 360e6, id: 'CATEGORY LEADER' },
    { min: 240e6, id: 'BIDDING WAR' },
    { min: 140e6, id: 'STRATEGIC SALE' },
    { min: 60e6, id: 'TUCK-IN' },
    { min: 0, id: 'ACQUI-HIRED' },
  ],
};

// Fictional investors for Compute SAFE offers (the floor's funds, plus a few).
export const INVESTORS = [...FUND_FIRMS, 'Stanyan & Cole Ventures', 'Kezar Partners', 'Duboce Compute Fund'];
