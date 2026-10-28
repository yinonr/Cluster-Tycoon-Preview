// V10.14 The World Gets Bigger: scenario content (data only). The engine is scenarios.js; the
// design and every number's rationale is docs/V10_13_SCENARIOS.md. Money is integer cents. Copy is
// short on purpose: a founder should understand an extraordinary offer at a glance.

// The recurring cast. `who` speaks on the Deal Room band; `org` is the organization.
export const CAST = Object.freeze({
  cirrostrata: { org: 'Cirrostrata Cloud', who: 'Dana Whitcombe', role: 'VP, AI Capacity' },
  estate: { org: 'Neocloud estate', who: 'The administrator', role: 'Distressed sale' },
  tessellate: { org: 'Tessellate Labs', who: 'Dr. Imogen Hale', role: 'CEO, Tessellate Labs' },
  ironbridge: { org: 'Ironbridge Infrastructure', who: 'Calloway Pryce', role: 'Partner, Ironbridge' },
  lastlight: { org: 'Last Light Special Situations', who: 'Mortimer Kestrel', role: 'Managing Partner' },
  northline: { org: 'Northline Logistics', who: 'Rhea Castellane', role: 'Head of Procurement' },
  orbit: { org: 'Orbit Retail Group', who: 'Theo Marchetti', role: 'Chief Digital Officer' },
  lantern: { org: 'The Lantern Collective', who: 'lantern-bot', role: 'Open-weights release' },
  tensorbay: { org: 'Tensorbay', who: 'Trust & Safety desk', role: 'Model hub' },
  mara: { org: 'Your lab', who: 'Mara Vale', role: 'ML engineer' },
  okafor: { org: 'The Okafor team', who: 'Dr. Ines Okafor', role: 'Ex-Tessellate research lead' },
});

// Pacing (docs §1 rule 5): one new proposal a round, two small scenarios a game.
export const PACE = Object.freeze({ smalls: 2, majorsQuiet: true });

// ---- M1 The Anchor Contract ------------------------------------------------------------------------
export const ANCHOR = Object.freeze({
  rounds: [5, 7], chance: [.5, .6, .75], investorBonus: .2, minValue: 200000000,
  stages: Object.freeze([
    { name: 'Region one', recipe: { H200: 4, B200: 4 }, revenue: 4000000 },
    { name: 'Region two', recipe: { H200: 6, B200: 12 }, revenue: 6000000 },
    { name: 'Global rollout', recipe: { H200: 4, B200: 14 }, revenue: 10000000 },
  ]),
  open: Object.freeze({ advance: 8000000, mult: 1 }),
  exclusive: Object.freeze({ advance: 16000000, mult: 1.3 }),
  damages: 2.5,        // × the advance, on a missed stage
  cure: .5,            // × the advance, for one one-round extension
  exitPremium: 1.05,   // strategic premium once the rollout is live
  line: 'We need your capacity, your uptime and your undivided attention. Mostly the capacity.',
  premise: 'A three-region deployment on Cirrostrata’s cloud. Deliver each region by its bell.',
  // The Second Call: another provider took the contract and may miss region two.
  secondCall: Object.freeze({ after: 2, chance: .5, stage: { name: 'Rescue region two', recipe: { H200: 6, B200: 12 }, revenue: 15000000 } }),
});

// ---- M2 The Fire Sale (V10.17.2: standalone, no recurring rival) -------------------------------------
// A neocloud that bought too fast sells its powered hall and its team. The hall, its tenant and the
// team's fee grow with the company's scale (index = scale), like the Dedicated Provider.
export const FIRESALE = Object.freeze({
  rounds: [5, 8], chance: .3, minValue: 100000000,
  hall: Object.freeze({ capex: 18000000, recipe: { H200: 2, B200: 2 }, rack: { gpu: 'B200', qty: 5 } }),
  tenant: Object.freeze({ recipe: { H200: 4 }, penalty: 6000000 }),
  team: Object.freeze({ capex: 6000000, burn: 800000, breakthrough: .15, legendary: .06 }),
  scale: Object.freeze([null, 1, 2, 3]),
  premise: 'A neocloud ran out of runway. Its powered data hall and its team are for sale today.',
  line: 'They bought too fast. The hall is powered, the racks are good and the lawyers are here.',
});

// ---- M3 The Buyout ---------------------------------------------------------------------------------
export const BUYOUT = Object.freeze({
  // Fresh suitors call from R7; callbacks (Cirrostrata after a rollout, a return) from R6.
  rounds: [7, 9], callbacks: [6, 9], minValue: 500000000, chance: .25, returnGrowth: 1.4, returnAfter: 2,
  forward: Object.freeze({ 6: 3.8, 7: 2.7, 8: 1.85, 9: 1.3 }),
  counter: .12, room: Object.freeze([.03, .2]), meet: .06,
  suitors: Object.freeze({
    cirrostrata: { anchorPremium: .15, line: 'Your best customer would like to become your owner.' },
    tessellate: { techPremium: .2, moonshotShare: .35, line: 'We buy frontier teams before they become frontier competitors.' },
    ironbridge: { rackRounds: 12, line: 'We don’t care about your model. We care that your racks are plugged in.' },
    lastlight: { mark: .9, line: 'Payroll is Friday. I am the only person who has called you this week.' },
  }),
});

// ---- Small scenarios -------------------------------------------------------------------------------
export const LANTERN = Object.freeze({
  rounds: [4, 8], chance: .3, b200Ask: .92, moat: Object.freeze({ mult: .8, until: 4 }),
  buyer: Object.freeze({ gpu: 'H200', qty: 8, open: 1.15, ceiling: 1.45, window: 30 }),
  endpoint: Object.freeze({ recipe: { H100: 6, H200: 4 }, revenue: 2500000 }),
  team: Object.freeze({ capex: 9000000, breakthrough: .10, legendary: .05 }),
  productBoost: Object.freeze({ mult: 1.06, rounds: 2 }),
  headline: 'The Lantern Collective releases Lantern-70: open weights, near the frontier, free.',
  line: 'weights are up. license is permissive. have fun. — the collective',
});
export const CRISIS = Object.freeze({
  rounds: [5, 9], share: .3, minRevenue: 2500000, base: .15, slope: .5, cap: .6,
  discount: .6, redeploy: Object.freeze({ gpus: .5, revenue: .7, cap: 12 }), settle: 1.5, sentiment: -.08,
  lines: Object.freeze({
    'Cirrostrata Cloud': 'A new VP is “re-scoping partner capacity.” I’m sorry. I fought for you.',
    'Northline Logistics': 'Freight volumes fell off a cliff. We have to cut every vendor we can.',
    'Orbit Retail Group': 'The board wants AI spend down 40% by Friday. You are most of our AI spend.',
    default: 'Our budget is gone. We need out of the contract.',
  }),
});
export const CAPACITY = Object.freeze({
  rounds: [4, 9], chance: .5, minTranche: 4, minFree: 8, forward: 1.15,
  buyer: Object.freeze({ qty: 10, open: 1.3, ceiling: 1.7, window: 25 }),
  line: 'We launch in three weeks and I’m short of B200s. I’ll pay for certainty.',
});
export const TALENT = Object.freeze({
  mara: Object.freeze({ rounds: [6, 8], burn: 1200000, equityBps: 150, breakthrough: .18, setback: .08, legendary: .08,
    line: 'A rival lab offered me triple. I’d rather finish what we started. Make it make sense.' }),
  okafor: Object.freeze({ rounds: [5, 8], capex: 12000000, burn: 1500000, rounds3: 3, equityBps: 200, equityBurn: 600000,
    breakthrough: .2, setback: -.06, legendary: .1,
    line: 'Four of us just left Tessellate. We want the hardest training run in the city.' }),
});
export const PROVIDER = Object.freeze({
  rounds: [6, 8], chance: .45, minProducts: 6,
  full: Object.freeze({ recipe: { H100: 6, H200: 6 }, revenue: 26000000, advance: 10000000 }),
  small: Object.freeze({ recipe: { H100: 3, H200: 3 }, revenue: 6000000 }),
  // V10.15: the deal grows with the company (index = scale). Fleet multiplies both recipes and the
  // smaller deal's revenue; closing the lab now forfeits Agentic and AI Researcher, so the full deal's
  // revenue and transition payment grow faster than its fleet.
  scale: Object.freeze([null, Object.freeze({ fleet: 1, revenue: 1, advance: 1 }), Object.freeze({ fleet: 2, revenue: 2.5, advance: 3 }), Object.freeze({ fleet: 3, revenue: 4, advance: 6 })]),
  line: 'Shut the lab. Run our inference. We will make it very, very worth your while.',
});
export const CHECKPOINT = Object.freeze({
  rounds: [3, 8], chance: .25, minProducts: 2,
  rescue: Object.freeze({ recipe: { H100: 3, H200: 1 }, prize: 1.5, window: 25, alumni: Object.freeze({ after: 2, recipe: { H200: 3 }, revenue: 2000000 }) }),
  mirror: Object.freeze({ recipe: { H100: 4 }, revenue: 5500000, risk: .3, penalty: 4000000, sentiment: -.1 }),
  clean: Object.freeze({ recipe: { B200: 3, H200: 2 }, revenue: 3500000, sentiment: .08, level: 2 }),
  headline: 'Tensorbay pulls Polyglot-34B in a license dispute. 3,000 apps broke at 9:14 a.m.',
  line: 'The checkpoint is down pending review. Please do not re-host it.',
});

// ---- Epilogues for the new endings (the world's epilogue engine reads these too) ------------------
export const SCENARIO_EPILOGUES = [
  { id: 'scn-sold-before-roll', kind: 'acquired', title: 'Sold before the roll', if: [['exit', '==', 'acquired'], ['flag.scn.sale.moonshot', '==', true]], weight: 3, line: '{company} sold with a frontier run still in the oven. Somebody else gets to find out.' },
  { id: 'scn-vulture', kind: 'acquired', title: 'Rescued by a vulture', if: [['exit', '==', 'acquired'], ['flag.scn.sale.lastlight', '==', true]], weight: 3, line: 'Mortimer Kestrel made payroll. Mortimer Kestrel also made money.' },
  { id: 'scn-cirro-owns', kind: 'acquired', title: 'Cirrostrata’s company', if: [['exit', '==', 'acquired'], ['flag.scn.sale.cirrostrata', '==', true]], weight: 2, line: 'Your biggest customer became your only shareholder.' },
  { id: 'scn-racks-sold', kind: 'acquired', title: 'Bought for the racks', if: [['exit', '==', 'acquired'], ['flag.scn.sale.ironbridge', '==', true]], weight: 2, line: 'Ironbridge paid for the power, the cooling and the cage. The model came free.' },
  { id: 'scn-frontier-bought', kind: 'acquired', title: 'Absorbed by a frontier lab', if: [['exit', '==', 'acquired'], ['flag.scn.sale.tessellate', '==', true]], weight: 2, line: 'Tessellate bought the team before it became the competition.' },
  { id: 'scn-acquired-plain', kind: 'acquired', title: 'Sold early', if: [['exit', '==', 'acquired']], line: '{company} took the guaranteed payout. Nobody will ever know what round ten looked like.' },
  { id: 'scn-anchor-sank', kind: 'any', title: 'The anchor that sank us', if: [['flag.scn.anchor.defaulted', '==', true], ['exit', '!=', 'shutdown']], weight: 3, line: 'The Cirrostrata contract was the best deal {company} ever signed, right up until region two.' },
  { id: 'scn-anchor-shutdown', kind: 'shutdown', title: 'Signed more than it could deliver', if: [['flag.scn.anchor.defaulted', '==', true]], weight: 4, line: 'Liquidated damages are very liquid.' },
  { id: 'scn-anchor-built', kind: 'any', title: 'The anchor tenant', if: [['flag.scn.anchor.completed', '==', true], ['exit', 'in', ['major', 'strategic', 'ipo']]], weight: 3, line: '{company} delivered three regions on three bells. Cirrostrata’s capacity team still talks about it.' },
  { id: 'scn-inference-company', kind: 'any', title: 'The inference company', if: [['flag.scn.provider.full', '==', true], ['exit', '!=', 'shutdown']], weight: 3, line: '{company} closed the lab and opened the meter. The meter kept running.' },
  { id: 'scn-bought-hall', kind: 'any', title: 'Bought the distressed hall', if: [['flag.scn.firesale.hall', '==', true], ['exit', '!=', 'shutdown']], weight: 3, line: 'A neocloud bought too fast. {company} bought what was left, at a fire-sale price.' },
  { id: 'scn-second-call', kind: 'any', title: 'The second call', if: [['flag.scn.anchor.rescued', '==', true], ['exit', '!=', 'shutdown']], weight: 3, line: 'Cirrostrata called someone else first. It called {company} second, and that was the call that mattered.' },
  { id: 'scn-declined-buyout', kind: 'any', title: 'Not for sale', if: [['flag.scn.buyout.declined', '==', true], ['exit', 'in', ['major', 'strategic', 'ipo']]], weight: 2, line: 'A buyer named a price. {company} named a bigger company instead.' },
];
