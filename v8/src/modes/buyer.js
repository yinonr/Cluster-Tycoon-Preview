// BUYER BADGE: an AI startup with a need sheet and until the five o'clock bell.
// A mode owns: the need sheet (mandate), who's on the floor, the bulletin
// schedule, what the player may trade, and how the day is scored.

import { Market, isLive } from '../engine/market.js';
import { Auction } from '../engine/auction.js';
import { Negotiation } from '../engine/negotiation.js';
import { GPUS, contractValue } from '../data/gpus.js';
import {
  SITES, SELLER_FIRMS, BROKER_FIRMS, CAPITAL_FIRMS, RIVAL_FIRMS, BUYER_COMPANIES, FIRST_NAMES,
  SKIN, HAIR, SUITS, TIES, SHIRTS, HAIR_STYLES,
} from '../data/names.js';
import { FLOOR_SECONDS } from '../config.js';
import { round2, usd, int, clamp, stream, pickAt } from '../util.js';

const roundTo = (n, step) => Math.round(n / step) * step;

// Des Moines is the wind-down seller's home; everyone else racks elsewhere.
const WIND_DOWN = { city: 'Des Moines', code: 'DSM' };
const RACKS = SITES.filter((s) => s.code !== WIND_DOWN.code);

// ---------------------------------------------------------------------------
// People
export function look(rng, overrides = {}) {
  return {
    skin: rng.pick(SKIN),
    hair: rng.pick(HAIR),
    hairStyle: rng.pick(HAIR_STYLES),
    suit: rng.pick(SUITS),
    shirt: rng.pick(SHIRTS),
    tie: rng.pick(TIES),
    glasses: rng.chance(0.25),
    phone: rng.chance(0.3),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Need sheet
function makeMandate(rng, market) {
  const co = rng.pick(BUYER_COMPANIES);
  const gpu = rng.chance(0.72) ? 'H100' : 'H200';
  const qty = rng.weighted([{ w: 6, v: 512 }, { w: 2, v: 256 }, { w: 2, v: 1024 }]);
  const b = market.bench[gpu];
  // To the cent, so the best price on the floor sits the same distance under
  // target on every seed (rounding to 5¢ made that 11–15¢ by luck).
  const target = round2(b - 0.12);
  const walk = round2(target + 0.15);
  return {
    company: co.name,
    sector: co.sector,
    stage: 'Series B',
    gpu,
    accept: gpu === 'H100' ? ['H100', 'H200'] : ['H200', 'B200'],
    qty,
    deliveryDays: 30,
    minTerm: 6,
    target,
    walk,
    budget: roundTo(qty * target * 730 * 13, 500000),
    payment: 'Monthly, from the Series B. Financing considered.',
  };
}

// Venture Mode: the quarter's market level, set before any desk is priced. No draws.
function tilt(market, bias) {
  for (const id of Object.keys(bias)) {
    if (!(id in market.bench) || !bias[id]) continue;
    const v = round2(market.bench[id] * (1 + bias[id]));
    market.bench[id] = v; market.level[id] = v; market.open[id] = v;
  }
}

// ---------------------------------------------------------------------------
// Shouts: short, readable, uppercase on the floor.
const SHOUTS = {
  prime: (l) => [`${int(l.qty)} ${l.gpu}s! ${l.site.city.toUpperCase()}! AVAILABLE ${l.deliveryLabel}!`, `${int(l.qty)} ${l.gpu}. CLEAN BLOCK. WHO'S IN?`, 'TWELVE MONTHS GETS YOU A BETTER NUMBER.'],
  half: (l) => [`${int(l.qty)} ${l.gpu}s, LIVE TODAY!`, `IT'S ${int(l.qty)}. STILL GOOD THOUGH.`, 'RACKS ARE WARM. COME LOOK.'],
  broker: (l) => [`I CAN STITCH ${int(l.qty)} ACROSS TWO SITES.`, 'FRAGMENTED SUPPLY? I ASSEMBLE IT.', `${l.gpu}s, ${l.siteLabel.toUpperCase()}.`],
  mid: (l) => [`${int(l.qty)} ${l.gpu}s. ${l.site.city.toUpperCase()}. THREE WEEKS.`, 'HOUSE CONFIRMED, READY TO SIGN.'],
  long: (l) => [`${int(l.qty)} ${l.gpu}s. 24 MONTHS OR NOTHING.`, 'LONG COMMIT, SHORT PRICE.', 'BRING YOUR LENDER.'],
  upgrade: (l) => [`${l.gpu}s! IMMEDIATE!`, `WHO'S GOT ${l.gpu} MONEY?`, `${int(l.qty)} ${l.gpu}. NOT CHEAP. WORTH IT.`],
  late: (l) => [`CHEAPEST ${l.gpu}s ON THE FLOOR!`, 'SHIPS IN 60. PROBABLY.', 'PATIENT MONEY GETS PAID.'],
  distressed: (l) => ['NEED THIS GONE BY THE BELL!', `${int(l.qty)} ${l.gpu}s. MAKE ME AN OFFER.`, 'ANY REAL BID. ANY.'],
  fresh: (l) => [`NEW ${l.gpu}s JUST LANDED!`, `${l.site.city.toUpperCase()} JUST CAME ONLINE!`, `${int(l.qty)} ${l.gpu}. FIRST COME.`],
  capital: () => ['WE CAN FINANCE THAT.', 'CAPITAL DESK. NO PITCH DECK.', 'OVER BUDGET? WALK OVER.'],
  rival: (c, md) => [`WHO'S GOT ${md.gpu === 'H100' ? 'H200' : 'H100'}?`, `I NEED ${int(md.qty * 2)} BY MONTH END.`, `I'LL TAKE THE WHOLE BLOCK AT ${usd(md.target - 0.2)}.`, 'MY SERIES B JUST CLOSED.'],
  expert: () => ['FIRST TRADE? ASK ME.', "PSST. I'VE SEEN THOSE RACKS.", 'ASK ABOUT INTERCONNECT.'],
  founder: () => ['RAISING A ROUND. IN GPUs.', 'DATA ROOM IS OPEN.', 'WHO WANTS EQUITY FOR COMPUTE?'],
  runner: () => ['SIGNING ROOM IS OPEN!', 'LOT SHEETS, FRESH!', 'RUNNER! COMING THROUGH!'],
};

// ---------------------------------------------------------------------------
// Floor population
function populate(run) {
  const { market: m, mandate: md, rng } = run;
  const G = md.gpu;
  const Q = md.qty;
  const B = m.bench[G];
  const step = Q / 4;
  const sites = rng.shuffle(RACKS);
  const firms = rng.shuffle(SELLER_FIRMS);
  const names = rng.shuffle(FIRST_NAMES);
  let si = 0, fi = 0, ni = 0;
  const nextSite = () => sites[si++ % sites.length];
  const nextFirm = () => firms[fi++ % firms.length];
  const nextName = () => names[ni++ % names.length];

  run.addSeller = (archetype, spec, person = {}) => {
    const lot = {
      id: m.id('lot'),
      archetype,
      gpu: G,
      divisible: false,
      minQty: step,
      step,
      terms: [6, 12],
      baseTerm: 12,
      confirmed: true,
      ...spec,
    };
    lot.ask = round2(lot.ask);
    lot.floor = round2(lot.floor);
    lot.siteLabel = lot.siteLabel || lot.site.city;
    const c = {
      id: m.id('c'),
      role: person.role || 'seller',
      side: 'sell',
      name: person.name || nextName(),
      firm: person.firm || nextFirm(),
      look: person.dressed || look(rng, person.look),
      lotId: lot.id,
    };
    lot.sellerId = c.id;
    lot.firm = c.firm;
    m.addLot(lot);
    m.addCharacter(c);
    return lot;
  };

  const add = run.addSeller;

  // Each seed prices the room afresh (setup draws only): a desk's posted ask
  // and hidden floor move together by up to 5¢, and how much room it has to
  // give, ask to floor, is drawn from 6–13¢. The cheapest way to fill the
  // sheet changes from day to day instead of always being the same desk.
  const priced = (ask) => {
    const a = round2(ask + rng.range(-0.05, 0.05));
    return { ask: a, floor: round2(a - round2(rng.range(0.06, 0.13))) };
  };

  const prime = add('prime', {
    qty: Q, site: nextSite(), delivery: 3, deliveryLabel: 'MONDAY', terms: [6, 12, 24],
    ...priced(B - 0.08), concession: 0.45, patience: 5,
  });

  const fragSite = nextSite();
  add('half', {
    qty: Q / 2, site: fragSite, delivery: 0, deliveryLabel: 'TODAY', terms: [6, 12], baseTerm: 6,
    ...priced(B - 0.10), concession: 0.5, patience: 5,
  });

  const s1 = nextSite(), s2 = nextSite();
  add('broker', {
    qty: Q / 2, site: s1, siteLabel: `${s1.city} + ${s2.city}`, delivery: 14, deliveryLabel: '2 WEEKS',
    ...priced(B - 0.06), concession: 0.4, patience: 6,
  }, { role: 'broker', firm: rng.pick(BROKER_FIRMS), look: { suit: 'var(--house)' } });

  add('mid', {
    qty: step * 3, site: nextSite(), delivery: 21, deliveryLabel: '3 WEEKS', divisible: true, minQty: step, terms: [12, 24],
    ...priced(B - 0.04), concession: 0.35, patience: 3,
  });

  // The 24-month block is on the floor most days, not every day.
  if (rng.chance(0.6)) {
    add('long', {
      qty: Q * 2, site: nextSite(), delivery: 10, deliveryLabel: '10 DAYS', divisible: true, minQty: Q, step: Q, terms: [24], baseTerm: 24,
      ...priced(B - 0.22), concession: 0.4, patience: 5,
    });
  }

  const up = md.gpu === 'H100' ? 'H200' : 'H100';
  add('upgrade', {
    gpu: up, qty: Q, site: nextSite(), delivery: 0, deliveryLabel: 'TODAY',
    ...priced(m.bench[up] - 0.04), concession: 0.4, patience: 3,
  });

  add('late', {
    qty: Q, site: nextSite(), delivery: 60, deliveryLabel: '60 DAYS',
    ...priced(B - 0.30), concession: 0.45, patience: 5,
  });

  // The rest of the room.
  const cap = m.addCharacter({ id: m.id('c'), role: 'capital', side: 'money', name: nextName(), firm: rng.pick(CAPITAL_FIRMS), look: look(rng, { suit: '#22252B', tie: '#B8913F', phone: true }) });
  const rivalFirms = rng.shuffle(RIVAL_FIRMS);
  const rivals = [0, 1].map((i) => m.addCharacter({ id: m.id('c'), role: 'rival', side: 'buy', name: nextName(), firm: rivalFirms[i], paddle: 41 + i * 17, look: look(rng) }));
  m.addCharacter({ id: m.id('c'), role: 'expert', side: 'house', name: nextName(), firm: 'The House', look: look(rng, { suit: 'var(--house)', glasses: true, phone: false }) });
  const founder = m.addCharacter({ id: m.id('c'), role: 'founder', side: 'raise', name: nextName(), firm: rng.pick(BUYER_COMPANIES.filter((b) => b.name !== md.company)).name, look: look(rng, { tie: null }) });

  run.rivals = rivals;
  run.capitalDesk = cap;
  run.matched = { seller: prime, capital: cap, founder };

  // A rival is already circling the best block on the floor.
  m.setFuse(prime, rng.range(82, 100), rivals[0]);
}

// ---------------------------------------------------------------------------
// Bulletins. SOURCE: the MC "keeps the floor on the clock."
function scheduleDay(run) {
  const { market: m, mandate: md, rng } = run;
  const G = md.gpu;
  const Q = md.qty;
  // Every number an event needs is rolled now, from the events' own stream,
  // and only read when it fires: no bulletin draws from a shared stream, so
  // what happened before it (frames, clicks, intel) can't change it. A pick
  // from a live pool (which desk, which site) keeps a number u in [0, 1).
  const ev = stream(run.seed, 'events');
  const roll = {
    absorb: ev.range(0.08, 0.12), absorbVictim: ev.next(),
    power: ev.next(),
    freshSite: ev.next(), freshFuse: ev.range(48, 60),
    distressedFuse: ev.range(66, 78),
    callSite: ev.next(), rivalUnder: ev.range(0.05, 0.25),
  };
  const dress = { fresh: look(ev), distressed: look(ev) };
  const say = (headline, sub, tone = 'flat', extra = {}) => m.bulletin({ headline, sub, tone, ...extra });
  const priceSub = (gpu, r) => `${gpu} ${usd(r.from)} → ${usd(r.to)}`;

  const EVENTS = {
    labAbsorbs() {
      const r = m.shift(G, roll.absorb);
      const victim = pickAt(m.liveLots().filter((l) => ['late', 'mid'].includes(l.archetype)), roll.absorbVictim);
      if (victim) m.removeLot(victim, 'left');
      say(`MAJOR AI LAB ABSORBS 2,000 ${G}s`, `${priceSub(G, r)}${victim ? ` · ${victim.site.city.toUpperCase()} BLOCK LEFT THE FLOOR` : ''}`, 'up');
    },
    blackwellDelay() {
      const r = m.shift(G, 0.06); m.shift('B200', 0.2); m.shift(G === 'H100' ? 'H200' : 'H100', 0.05);
      say('BLACKWELL SHIPMENT DELAYED', `Everyone falls back to Hopper · ${priceSub(G, r)}`, 'up');
    },
    shipmentEarly() {
      const r = m.shift(G, -0.07); m.shift('B200', -0.25); m.shift(G === 'H100' ? 'H200' : 'H100', -0.06);
      say('CHIP SHIPMENT ARRIVES EARLY', `Supply on the floor · ${priceSub(G, r)}`, 'down');
    },
    demandSpike() {
      const r = m.shift(G, round2(m.bench[G] * 0.04)); m.shift('B200', 0.15);
      say('NEW MODEL SPIKES INFERENCE DEMAND', priceSub(G, r), 'up');
    },
    efficientModel() {
      const r = m.shift(G, -round2(m.bench[G] * 0.04));
      say('NEW MODEL CUTS TRAINING COMPUTE IN HALF', priceSub(G, r), 'down');
    },
    power() {
      const pool = m.liveLots().filter((l) => l.gpu === G && l.delivery <= 30 && !l.engaged);
      const lot = pool.length ? pickAt(pool, roll.power) : null;
      if (!lot) return EVENTS.demandSpike();
      lot.delivery += 45;
      lot.deliveryLabel = `${lot.delivery} DAYS`;
      m.emit('lot:status', lot);
      say(`POWER CONSTRAINT IN ${lot.site.city.toUpperCase()}`, `${lot.firm} delivery slips to ${lot.delivery} days`, 'up');
    },
    fresh() {
      const site = pickAt(RACKS.filter((s) => !m.lots.some((l) => l.site.code === s.code)), roll.freshSite);
      const b = m.bench[G];
      const lot = run.addSeller('fresh', {
        qty: Q, site: site || RACKS[0], delivery: 7, deliveryLabel: '1 WEEK', terms: [6, 12, 24],
        ask: b - 0.09, floor: b - 0.19, concession: 0.5, patience: 4,
      }, { dressed: dress.fresh });
      m.setFuse(lot, roll.freshFuse, run.rivals[1]);
      say(`NEW CAPACITY ONLINE IN ${lot.site.city.toUpperCase()}`, `${int(Q)} ${G} · rivals already looking`, 'down', { lotId: lot.id });
    },
    sovereign() {
      const pool = m.liveLots().filter((l) => l.gpu === G && !l.fuse);
      if (!pool.length) return EVENTS.blackwellDelay();
      const lot = pool.sort((a, b) => b.qty - a.qty)[0];
      m.setFuse(lot, 32, { name: 'Sovereign buyer', firm: 'A sovereign fund', paddle: 1, sovereign: true });
      say('SOVEREIGN BUYER ENTERS THE FLOOR', `Circling the ${lot.site.city} block. 30 seconds.`, 'up', { lotId: lot.id });
    },
    megaRound() {
      const r = m.shift(G, 0.05);
      m.liveLots().forEach((l) => { if (l.fuse && !l.fuse.done) l.fuse.endsAt -= 12; });
      say('RIVAL LAB RAISES $1B ROUND', `Paddles up. Fuses shorter · ${priceSub(G, r)}`, 'up');
    },
    distressed() {
      const b = m.bench[G];
      const lot = run.addSeller('distressed', {
        qty: Q + Q / 2, site: WIND_DOWN, delivery: 0, deliveryLabel: 'TODAY', divisible: true,
        ask: b - 0.16, floor: b - 0.34, concession: 0.62, patience: 7,
      }, { firm: 'Hollowpoint Cloud (in wind-down)', dressed: dress.distressed });
      m.setFuse(lot, roll.distressedFuse, run.rivals[1]);
      say('DISTRESSED NEOCLOUD RELEASES CAPACITY', `${int(lot.qty)} ${G} · live today · motivated seller`, 'down', { lotId: lot.id });
    },
    callLot() {
      const b = m.bench[G];
      const site = pickAt(RACKS.filter((s) => !m.lots.some((l) => l.site.code === s.code)), roll.callSite) || RACKS[0];
      const lot = {
        id: m.id('auc'), archetype: 'called', gpu: G, qty: Q, site, delivery: 7, deliveryLabel: '1 WEEK',
        terms: [12], baseTerm: 12, opening: round2(b - 0.30), confirmed: true, firm: 'Called by the house', number: 1,
      };
      // Sometimes the rival folds under your target; sometimes they'll chase it past your walk-away.
      const rivalMax = round2(b - roll.rivalUnder);
      const a = new Auction({ lot, rng: stream(run.seed, 'auction'), rivalMax, rivalPaddle: run.rivals[0].paddle, playerPaddle: run.paddle, t: m.t });
      // Losing the call counts as losing a block, if you were in the bidding.
      a.on('sold', ({ winner }) => {
        if (winner === 'rival' && a.bids.some((x) => x.who === 'you')) run.lost.push({ lotId: lot.id, city: site.city, paddle: a.rivalPaddle, sovereign: false, t: m.t });
      });
      m.auction = a;
      m.emit('auction:start', a);
      say(`LOT ${lot.number} CALLED: ${int(Q)} ${G}`, `${site.city} · 12 months · opening ${usd(lot.opening)} · to the rostrum`, 'flat', { auction: true });
    },
    halfHour() {
      m.liveLots().forEach((l) => { l.concession = Math.min(0.85, l.concession + 0.18); l.patience += 1; });
      say('HALF AN HOUR TO THE BELL', 'Sellers get flexible near the close.', 'down');
    },
  };
  run.events = EVENTS;

  m.at(rng.range(30, 37), EVENTS.labAbsorbs);
  m.at(50, EVENTS.callLot); // "At one the lots are called."
  m.at(rng.range(92, 104), EVENTS.distressed);
  const pool = rng.shuffle(['blackwellDelay', 'shipmentEarly', 'demandSpike', 'efficientModel', 'power', 'fresh', 'sovereign', 'megaRound']);
  m.at(rng.range(138, 150), EVENTS[pool[0]]);
  m.at(rng.range(182, 194), EVENTS[pool[1]]);
  m.at(FLOOR_SECONDS - 24, EVENTS.halfHour);
}

// ---------------------------------------------------------------------------
// Can this lot fill a line on the need sheet at all?
const usable = (md, lot) => md.accept.includes(lot.gpu) && lot.delivery <= md.deliveryDays && lot.terms.some((t) => t >= md.minTerm);
const legal = (md, d) => md.accept.includes(d.gpu) && d.delivery <= md.deliveryDays && d.term >= md.minTerm;

// Floor Score weights. SCORE_V goes on every shared score; bump it when the
// weights change. (1 was the critics' draft and never shipped.)
const SCORE_V = 2;
const SCORE = { fill: 2500, price: 5500, speed: 1500, clean: 500 };

export const buyerMode = {
  id: 'buyer',
  // Bump whenever a change makes an old seed play differently: it is part of
  // the daily seed and of challenge links, so old links stop matching.
  rulesVersion: 1,
  scoreVersion: SCORE_V,
  // Filling the need sheet ends your floor (Venture Mode keeps trading).
  endsOnFill: true,
  canBid(run) { return !this.endsOnFill || !this.isFilled(run); },

  // Randomness, by job (a seed replays the same market whatever the frame
  // rate, the cosmetic code or the cards you opened):
  //   run.rng                 setup only: need sheet, desks, looks, schedule
  //   'events'                every number a bulletin needs, rolled up front
  //   'drift'                 the board's tick-by-tick wander (market.js)
  //   'auction'               the rival paddle at the 1 PM lot call
  //   seed + lot id           each haggle (lotsheet.js), its lines on '…voice'
  //   'tips', 'plan', 'chatter'  expert tips and the room (never game state)
  //   'venture'               Venture Mode's floor extras (venture.extend)
  // venture (Venture Mode only): { bias: { gpu: fraction }, mandate(market, base) -> need sheet,
  // extend(run, rng) }. Absent on the daily path, which draws exactly as before.
  createRun({ rng, seed = rng.seed, venture = null }) {
    const market = new Market({ rng, duration: FLOOR_SECONDS, driftRng: stream(seed, 'drift') });
    if (venture && venture.bias) tilt(market, venture.bias);
    const run = {
      seed,
      persona: 'buyer',
      rng,
      market,
      deals: [],
      spent: 0,
      paddle: 7,
      badgeNo: `B-${String(100 + Math.floor(rng.next() * 899)).padStart(4, '0')}`,
      filledAt: null,
      lost: [],              // usable blocks that went to a rival: { lotId, city, paddle, sovereign, t }
      tips: stream(seed, 'tips'),
    };
    const base = makeMandate(rng, market); // drawn on every path, so run.rng stays in step
    run.mandate = venture ? venture.mandate(market, base) : base;
    populate(run);
    scheduleDay(run);
    if (venture && venture.extend) venture.extend(run, stream(seed, 'venture'));
    market.on('lot:gone', ({ lot, rival }) => {
      if (rival && usable(run.mandate, lot)) run.lost.push({ lotId: lot.id, city: lot.site.city, paddle: rival.paddle, sovereign: !!rival.sovereign, t: market.t });
    });
    return run;
  },

  secured(run) { return run.deals.reduce((s, d) => s + d.qty, 0); },
  need(run) { return Math.max(0, run.mandate.qty - this.secured(run)); },
  budgetLeft(run) { return Math.max(0, run.mandate.budget - run.spent); },
  isFilled(run) { return this.secured(run) >= run.mandate.qty; },

  // Who the player can trade with.
  canTrade(char) { return char.side === 'sell'; },

  shouts(char, run) {
    const lot = char.lotId ? run.market.lot(char.lotId) : null;
    const fn = SHOUTS[lot ? lot.archetype : char.role];
    return fn ? fn(lot || char, run.mandate) : ['…'];
  },

  defaultTerm(lot, run) {
    const ok = lot.terms.filter((t) => t >= run.mandate.minTerm);
    if (ok.includes(lot.baseTerm)) return lot.baseTerm;
    return ok[0] ?? lot.baseTerm;
  },

  qtyOptions(lot, run) {
    if (!lot.divisible) return [lot.qty];
    const need = this.need(run);
    const opts = new Set();
    for (let q = lot.minQty; q <= lot.qty; q += lot.step) opts.add(q);
    opts.add(lot.qty);
    // Prefer showing amounts around what you still need.
    const list = [...opts].sort((a, b) => a - b);
    const near = list.filter((q) => q <= Math.max(need, lot.minQty) * 1.5 || q === lot.qty);
    return near.slice(-4);
  },

  defaultQty(lot, run) {
    const opts = this.qtyOptions(lot, run);
    const need = this.need(run);
    return opts.find((q) => q >= need) ?? opts[opts.length - 1];
  },

  financingFee(term) { return round2(0.04 + 0.01 * (term / 12)); },

  // A fresh haggle over a lot (lotsheet.js and tools/). Each draws from its
  // own stream, seed + lot id, with the seller's lines on a stream of their
  // own: the same moves on the same lot get the same answers, whatever else
  // happened on the floor.
  haggle(run, lot) {
    return new Negotiation({
      market: run.market, lot,
      rng: stream(run.seed, lot.id), voice: stream(run.seed, lot.id, 'voice'),
      defaultTerm: this.defaultTerm(lot, run),
      defaultQty: this.defaultQty(lot, run),
    });
  },

  // Live checks for the lot sheet and the tape.
  checks(run, { gpu, qty, term, rate, delivery, financed }) {
    const md = run.mandate;
    const value = contractValue(qty, rate, term);
    const left = this.budgetLeft(run);
    const eff = financed ? round2(rate + this.financingFee(term)) : rate;
    return {
      value,
      eff,
      overBudget: !financed && value > left,
      items: [
        { id: 'chip', ok: md.accept.includes(gpu), label: md.accept.includes(gpu) ? `${gpu} ✓` : `${gpu} is not on the need sheet` },
        { id: 'delivery', ok: delivery <= md.deliveryDays, label: `Delivery ${delivery === 0 ? 'today' : `${delivery}d`}${delivery <= md.deliveryDays ? '' : ` > ${md.deliveryDays}d`}` },
        { id: 'term', ok: term >= md.minTerm, label: `${term} mo${term >= md.minTerm ? '' : ` < ${md.minTerm}`}` },
        { id: 'price', ok: eff <= md.target, warn: eff > md.target && eff <= md.walk, label: eff <= md.target ? `${usd(eff)} under target` : eff <= md.walk ? `${usd(eff)} over target` : `${usd(eff)} over walk-away` },
        { id: 'budget', ok: financed || value <= left, label: financed ? 'Financed' : value <= left ? `$${(value / 1e6).toFixed(1)}M of $${(left / 1e6).toFixed(1)}M` : `Over budget by $${((value - left) / 1e6).toFixed(1)}M` },
      ],
    };
  },

  // The deal as signed off a lot sheet (lotsheet.js and tools/ build it here).
  lotDeal(run, lot, { qty, term, rate, financed, seller, rounds }) {
    const fee = financed ? this.financingFee(term) : 0;
    return {
      lotId: lot.id, archetype: lot.archetype, firm: lot.firm, seller, gpu: lot.gpu, qty, siteLabel: lot.siteLabel, site: lot.site.code,
      delivery: lot.delivery, term, rate, financed, fee, eff: financed ? round2(rate + fee) : rate,
      value: contractValue(qty, rate, term), t: run.market.t, rounds,
    };
  },

  // The deal when the hammer falls on your paddle; the capital desk carries
  // it automatically if it won't fit the budget left.
  auctionDeal(run, lot, price) {
    const term = lot.baseTerm;
    const value = contractValue(lot.qty, price, term);
    const financed = value > this.budgetLeft(run);
    const fee = financed ? this.financingFee(term) : 0;
    return {
      lotId: lot.id, archetype: lot.archetype, firm: 'Lot called by the house', seller: 'The house', gpu: lot.gpu, qty: lot.qty, siteLabel: lot.site.city, site: lot.site.code,
      delivery: lot.delivery, term, rate: price, financed, fee, eff: round2(price + fee), value, t: run.market.t, auction: true,
    };
  },

  recordDeal(run, deal) {
    run.deals.push(deal);
    if (!deal.financed) run.spent += deal.value;
    if (this.isFilled(run) && run.filledAt == null) {
      run.filledAt = run.market.t;
      if (this.endsOnFill) run.market.halt(); // your floor is over: the tape reads the market as it stood
    }
  },

  // The contract, as printed in the signing room.
  contract(run, deal) {
    const md = run.mandate;
    return [
      ['BUYER', md.company.toUpperCase()],
      ['SELLER', deal.firm.toUpperCase()],
      ['PRODUCT', `${int(deal.qty)} × ${deal.gpu}`],
      ['SITE', deal.siteLabel.toUpperCase()],
      ['DELIVERY', deal.delivery === 0 ? 'IMMEDIATE' : `${deal.delivery} DAYS`],
      ['TERM', `${deal.term} MONTHS`],
      ['RATE', `${usd(deal.rate)} / GPU-HR`],
      ['FINANCING', deal.financed ? `${run.capitalDesk.firm.toUpperCase()} +${usd(deal.fee)}` : '—'],
      ['CONTRACT VALUE', `$${int(deal.value)}`],
    ];
  },

  summarize(run) {
    const md = run.mandate;
    const m = run.market;
    const deals = run.deals;
    const secured = this.secured(run);
    const filled = secured >= md.qty;
    const avg = secured ? round2(deals.reduce((s, d) => s + d.eff * d.qty, 0) / secured) : null;
    const bench = m.bench[md.gpu];
    const checks = [
      { label: `${int(md.qty)} ${md.gpu}`, ok: filled, detail: `${int(secured)} / ${int(md.qty)}` },
      { label: `Delivery ≤ ${md.deliveryDays} days`, ok: deals.length > 0 && deals.every((d) => d.delivery <= md.deliveryDays) },
      { label: `Term ≥ ${md.minTerm} months`, ok: deals.length > 0 && deals.every((d) => d.term >= md.minTerm) },
      { label: `At or under ${usd(md.target)}`, ok: avg != null && avg <= md.target, detail: avg != null ? usd(avg) : '—' },
      { label: `Never over ${usd(md.walk)}`, ok: deals.length > 0 && deals.every((d) => d.eff <= md.walk) },
      { label: md.accept.join(' or '), ok: deals.length > 0 && deals.every((d) => md.accept.includes(d.gpu)) },
    ];
    const clean = checks.every((c) => c.ok);
    let rating, line, headline;
    if (!deals.length) {
      headline = 'MARKET CLOSED';
      rating = 'NO FILL';
      line = 'Capacity no longer available. Should’ve closed.';
    } else if (!filled) {
      headline = 'PARTIAL FILL';
      rating = 'PARTIAL';
      line = `${int(md.qty - secured)} short at the bell. The floor waits for no one.`;
    } else if (clean && avg <= md.target - 0.05) {
      headline = 'COMPUTE SECURED';
      rating = 'FLOOR LEGEND';
      line = 'Under target, on time, zero NDAs.';
    } else if (clean) {
      headline = 'COMPUTE SECURED';
      rating = 'CLEAN FILL';
      line = 'Every line on the need sheet, met.';
    } else {
      headline = 'COMPUTE SECURED';
      rating = 'FILLED, WITH NOTES';
      line = 'You got the deal done. The need sheet has comments.';
    }
    const closeT = run.filledAt ?? (deals.length ? deals[deals.length - 1].t : null);
    const sites = [...new Set(deals.map((d) => d.siteLabel))];
    const terms = [...new Set(deals.map((d) => d.term))];
    return {
      headline, rating, line, filled, secured, avg, bench, checks, deals, closeT, sites, terms,
      gpuLabel: [...new Set(deals.map((d) => d.gpu))].join(' + ') || md.gpu,
      financed: deals.some((d) => d.financed),
      savings: avg != null ? Math.round(deals.reduce((s, d) => s + (bench - d.eff) * d.qty * 730 * d.term, 0)) : 0,
      fills: m.fills.length,
    };
  },

  // The Floor Score (out of 10,000), from summarize(). Fill and price carry
  // most of it; a deal that breaks the need sheet scores no price but its
  // GPUs still count toward the fill.
  score(run, r = this.summarize(run)) {
    const md = run.mandate;
    const duration = run.market.duration;
    const f = Math.min(1, r.secured / md.qty);
    const pf = (d) => {
      if (!legal(md, d) || d.eff >= md.walk) return 0;
      if (d.eff <= md.target) return 0.40 + 0.60 * Math.min(1, (md.target - d.eff) / 0.15);
      return 0.40 * (md.walk - d.eff) / (md.walk - md.target);
    };
    const qty = r.deals.reduce((s, d) => s + d.qty, 0);
    const price = qty ? r.deals.reduce((s, d) => s + pf(d) * d.qty, 0) / qty : 0;
    const pts = {
      fill: Math.round(SCORE.fill * f),
      price: Math.round(SCORE.price * f * price),
      // Full marks for closing inside the first 30 floor seconds.
      speed: r.filled ? Math.round(SCORE.speed * clamp((duration - r.closeT) / (duration - 30), 0, 1)) : 0,
      clean: r.checks.every((c) => c.ok) ? SCORE.clean : 0,
    };
    return {
      total: pts.fill + pts.price + pts.speed + pts.clean,
      v: SCORE_V,
      parts: [
        { id: 'fill', label: 'Fill', pts: pts.fill, max: SCORE.fill },
        { id: 'price', label: 'Price', pts: pts.price, max: SCORE.price },
        { id: 'speed', label: 'Speed', pts: pts.speed, max: SCORE.speed },
        { id: 'clean', label: 'Clean sheet', pts: pts.clean, max: SCORE.clean },
      ],
    };
  },

  // One line for the tape and the share card: the most telling thing about
  // how the day went (first match wins). null when nothing was signed.
  deskNote(run, r = this.summarize(run)) {
    const md = run.mandate;
    const deals = r.deals;
    if (!deals.length) return null;
    const lost = run.lost || [];
    const sov = lost.find((l) => l.sovereign);
    const rival = lost.find((l) => !l.sovereign);
    const sites = new Set(deals.flatMap((d) => d.siteLabel.split(' + ')));
    const upgrade = deals.find((d) => d.gpu !== md.gpu);
    const pricier = upgrade && GPUS[upgrade.gpu].base > GPUS[md.gpu].base;
    if (deals.some((d) => d.auction)) return 'Won Lot 1 off the rostrum.';
    if (deals.some((d) => d.archetype === 'distressed')) return 'Bought from a neocloud in wind-down.';
    if (sov) return 'Lost a block to a sovereign fund.';
    if (rival) return `Lost the ${rival.city} block to paddle ${rival.paddle}.`;
    if (deals.some((d) => d.financed)) return 'Levered up at the capital desk.';
    if (upgrade) return pricier ? `Paid up for ${upgrade.gpu}s.` : `Bought ${upgrade.gpu}s off the sheet.`;
    if (deals.some((d) => d.term >= 24)) return 'Signed 24 months. Bold.';
    if (sites.size >= 2) return `Stitched ${sites.size} sites.`;
    return null; // nothing notable: the share text and card already say "0 NDAs"
  },

  // Intel cards for people you can't trade with.
  intel(char, run) {
    const md = run.mandate;
    const m = run.market;
    if (char.role === 'capital') {
      return {
        title: `${char.name} · ${char.firm}`,
        kicker: 'THE MONEY · CAPITAL DESK',
        body: [
          'Over budget on a lot? Bring us in from the lot sheet.',
          `We carry the commitment and you pay monthly. Fee: about ${usd(this.financingFee(12))}–${usd(this.financingFee(24))} per GPU-hour, depending on term.`,
          'Underwritten in seconds. Try that by phone.',
        ],
      };
    }
    if (char.role === 'rival') {
      const hunting = m.liveLots().find((l) => l.fuse && !l.fuse.done && l.fuse.rival === char);
      return {
        title: `${char.name} · ${char.firm}`,
        kicker: `ANOTHER BUYER · PADDLE ${char.paddle}`,
        body: [
          'Same need, bigger budget.',
          hunting ? `They're circling the ${hunting.site.city} block. Beat them to it.` : 'Not circling anything right now. Give it a minute.',
        ],
      };
    }
    if (char.role === 'expert') {
      const pool = m.liveLots().filter((l) => !l.tipped && md.accept.includes(l.gpu) && l.delivery <= md.deliveryDays);
      const lot = pool.length ? run.tips.pick(pool) : null;
      if (lot) lot.tipped = true;
      return {
        title: `${char.name} · The House`,
        kicker: 'THE EXPERTS · PLANTED TO MAKE A FIRST TRADE LESS FRIGHTENING',
        body: lot
          ? [`Between us: ${lot.firm} will go to about ${usd(m.floorAt(lot, lot.baseTerm))} on ${lot.baseTerm} months.`, 'Don\'t tell them I told you.']
          : ['Nothing on the floor I\'d tip you on right now. Watch the board.'],
      };
    }
    if (char.role === 'founder') {
      return {
        title: `${char.name} · ${char.firm}`,
        kicker: 'FOUNDER · RAISING COMPUTE',
        body: ['"Raising a round in GPUs instead of cash. The data room\'s open."', 'The Raising badge opens in a future session.'],
        locked: 'founder',
      };
    }
    return { title: char.name, kicker: '', body: ['…'] };
  },
};

export { isLive };
