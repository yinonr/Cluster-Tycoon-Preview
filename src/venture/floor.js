// VENTURE MODE: building a quarter's floor. The floor is the Buyer floor
// (createRun), seeded by hash32(vs, 'floor', q) whatever objective you picked,
// tilted to the venture's market, with the objective as its need sheet. The
// cards in force (s.pending) and a TRAIN objective add venture-only extras,
// drawn from stream(floorSeed, 'venture') after the day is scheduled, so
// they never move a draw of the floor itself.

import { ventureMode } from './mode.js';
import { C, GPU_IDS } from './constants.js';
import { lineLeft, clone } from './state.js';
import { toMandate, optionOf } from './objectives.js';
import { safeThisQuarter } from './safe.js';
import { look } from '../modes/buyer.js';
import { GPUS } from '../data/gpus.js';
import { SITES } from '../data/names.js';
import { hash32, makeRng, round2, pickAt } from '../util.js';

export const floorSeed = (s) => hash32(s.seed, 'floor', s.q);

// Everything createRun needs: { seed, venture: { bias, mandate, extend } }.
// objective: a memo option (defaults to the one picked on the memo).
export function floorSpec(s, objective = optionOf(s.memo, s.memo && s.memo.chosen)) {
  if (!objective) throw new Error('floorSpec: no objective picked');
  const seed = floorSeed(s);
  const bias = {};
  for (const g of GPU_IDS) bias[g] = s.market[g] / GPUS[g].base - 1;
  const ctx = {
    q: s.q,
    objective: objective.type,
    cash: s.cash,
    lineLeft: lineLeft(s),
    spread: s.spread,
    pending: { ...s.pending },
    safe: safeThisQuarter(s),
  };
  return {
    seed,
    venture: {
      bias,
      mandate: (market, base) => toMandate(objective, market, base, { player: s.player, cash: ctx.cash, lineLeft: ctx.lineLeft, q: s.q }),
      extend: (run, rng) => extend(run, rng, ctx),
    },
  };
}

// The quarter's floor, ready for floor.js (M2) or tools/floor-sim.mjs.
export function buildRun(s, objective) {
  const spec = floorSpec(s, objective);
  const run = ventureMode.createRun({ rng: makeRng(spec.seed), seed: spec.seed, venture: spec.venture });
  run.kind = 'venture';
  run.q = s.q;
  run.playerName = s.player.name;
  return run;
}

// Venture-only extras, after scheduleDay. rng = stream(floorSeed, 'venture').
function extend(run, rng, ctx) {
  const m = run.market;
  const md = run.mandate;
  const G = md.gpu;
  const Q = md.qty;
  const step = Q / 4;
  run.venture = clone(ctx); // a replay of the same spec starts clean
  run.lineSpent = 0;

  // The venture afternoon is shorter: rescale the bell, the schedule and every
  // fuse, now and later (no draws, so the floor is still a function of its seed).
  const k = C.floorSeconds / m.duration;
  m.duration = C.floorSeconds;
  for (const ev of m.schedule) ev.at *= k;
  for (const l of m.lots) if (l.fuse) { l.fuse.endsAt *= k; l.fuse.total *= k; }
  const setFuse = m.setFuse.bind(m);
  m.setFuse = (lot, seconds, rival) => setFuse(lot, seconds * k, rival);

  // Every number is drawn now, in this order, whatever the cards say.
  const roll = {
    bwAsk: rng.range(-0.05, 0.05), bwRoom: rng.range(0.06, 0.13), bwSite: rng.next(), bwLook: look(rng),
    glutSite: rng.next(), glutLook: look(rng),
    crunchFuse: rng.range(40, 70),
    longAsk: rng.range(-0.05, 0.05), longRoom: rng.range(0.06, 0.13), longSite: rng.next(), longLook: look(rng),
  };
  const freeSite = (u) => pickAt(SITES.filter((x) => x.code !== 'DSM' && !m.lots.some((l) => l.site.code === x.code)), u) || SITES[0];
  const half = (lot) => {
    const st = lot.step || step;
    lot.qty = Math.max(st, Math.floor((lot.qty * C.ev.crunchSupply) / st) * st);
  };
  const late = (lot) => { lot.delivery += C.ev.powerDelay; lot.deliveryLabel = `${lot.delivery} DAYS`; };

  // POWER: the prime, mid and broker blocks (and fresh capacity later) deliver 45 days later.
  if (ctx.pending.power) for (const l of m.lots) if (['prime', 'mid', 'broker'].includes(l.archetype)) late(l);
  // CRUNCH: every block but the prime one is half the size, and rivals move faster.
  if (ctx.pending.crunch) {
    for (const l of m.lots) if (l.archetype !== 'prime') half(l);
    for (const l of m.lots) if (l.fuse) { l.fuse.endsAt = round2(l.fuse.endsAt * (1 - C.ev.crunchRival)); l.fuse.total = l.fuse.endsAt; }
    const target = m.lots.find((l) => l.archetype === 'half');
    if (target && run.rivals[1]) m.setFuse(target, roll.crunchFuse, run.rivals[1]);
  }
  // Blocks that arrive during the day take the same cards.
  const addSeller = run.addSeller;
  run.addSeller = (archetype, spec, person) => {
    const lot = addSeller(archetype, spec, person);
    if (ctx.pending.power && archetype === 'fresh') late(lot);
    if (ctx.pending.crunch && ['fresh', 'distressed'].includes(archetype)) half(lot);
    return lot;
  };

  // GLUT: a second wind-down seller is on the floor from the open.
  if (ctx.pending.glut) {
    const B = m.bench[G];
    const lot = addSeller('distressed', {
      qty: 2 * Q, site: freeSite(roll.glutSite), delivery: 0, deliveryLabel: 'TODAY', divisible: true,
      ask: B - 0.20, floor: B - 0.40, concession: 0.62, patience: 7,
    }, { firm: 'Sandbar Cloud (in wind-down)', dressed: roll.glutLook });
    if (ctx.pending.crunch) half(lot);
  }

  // The 24-month desk is always in when the board asks for 24 months (LOCK), and
  // under POWER, when long commitments are the ones that get power on time.
  if ((md.minTerm >= 24 || ctx.pending.power) && !m.lots.some((l) => l.archetype === 'long')) {
    const B = m.bench[G];
    const ask = round2(B - 0.22 + roll.longAsk);
    const lot = addSeller('long', {
      qty: Q * 2, site: freeSite(roll.longSite), delivery: 10, deliveryLabel: '10 DAYS', divisible: true, minQty: Q, step: Q, terms: [24], baseTerm: 24,
      ask, floor: round2(ask - round2(roll.longRoom)), concession: 0.4, patience: 5,
    }, { dressed: roll.longLook });
    if (ctx.pending.crunch) half(lot);
  }

  // Blackwell: a B200 block whenever the objective takes B200.
  if (md.accept.includes('B200')) {
    const ask = round2(m.bench.B200 + C.blackwell.askOff + roll.bwAsk);
    const qty = Math.max(step, Q * C.blackwell.share);
    const lot = addSeller('blackwell', {
      gpu: 'B200', qty, site: freeSite(roll.bwSite), delivery: C.blackwell.delivery, deliveryLabel: '3 WEEKS',
      terms: C.blackwell.terms.slice(), baseTerm: 12, ask, floor: round2(ask - round2(roll.bwRoom)), concession: 0.4, patience: 4,
    }, { dressed: roll.bwLook });
    if (ctx.pending.crunch) half(lot);
  }

  // SAFE compute taken this quarter may meet the objective before the first trade.
  if (ventureMode.isFilled(run)) run.filledAt = 0;
}
