// THE FLOOR'S DEMAND (V6.1): who comes to buy this quarter.
//
// Each quarter has a pool of 8–12 candidate buyers: the run's startups (all but the
// quarter's client), compute brokers and research labs. A subset comes onto the floor at
// their own times and leaves when their window closes:
//   STARTUP  the run's companies: their best-fit GPU, their months, cash or (short of cash, or
//            if you already own a piece) equity. They always come: they're your relationships.
//   BROKER   buys spare capacity to resell: any GPU, any delivery, 6+ months, a bid under the
//            board, little room, a short window. Liquidity, not the best price.
//   LAB      a research lab or established AI company: one GPU (B200 for training, H200 for
//            long-context work), longer terms (12 or 24 months), a premium for the right capacity.
// Demand for each GPU runs cool, normal or hot each quarter (HEAT): it moves bids and who
// shows up. Before a quarter, the word on the street names next quarter's heat; it's right
// about 70% of the time. Everything is drawn from stream(game seed, …, quarter): the same run
// gets the same market, whatever you do.

import { round2, stream } from '../util.js';
import { GPU_LIST } from './gpu.js';

export const BROKERS = ['Mission Street Capacity', 'Dogpatch Compute Exchange', 'Rincon GPU Partners', 'Bayshore Spot Desk'];
export const LABS = [
  { name: 'Northlight Research', work: 'train' }, { name: 'Calder Institute', work: 'train' },
  { name: 'Presidio Foundation Models', work: 'train' }, { name: 'Meridian Long Context', work: 'memory' },
];
export const KIND_LABEL = { startup: 'STARTUP', broker: 'BROKER', lab: 'LAB' };
const HEATS = ['cool', 'normal', 'hot'];
export const HEAT_SHIFT = { cool: -0.06, normal: 0, hot: 0.06 }; // on every bid for that GPU
const SHOW = { cool: 0.35, normal: 0.55, hot: 0.8 };              // odds a broker or lab for that GPU comes
const lerp = (a, b, u) => a + (b - a) * u;

// This quarter's heat by GPU (the market's, not the player's).
export function heatOf(seed, q) {
  const r = stream(seed, 'heat', q);
  return Object.fromEntries(GPU_LIST.map((g) => [g, r.weighted([{ w: 1, v: 'cool' }, { w: 2, v: 'normal' }, { w: 1, v: 'hot' }])]));
}
// The word on the street about a quarter's heat: right about 70% of the time.
export function wordOf(seed, q) {
  const r = stream(seed, 'heat-word', q);
  const real = heatOf(seed, q);
  return Object.fromEntries(GPU_LIST.map((g) => {
    const u = r.next(), v = r.next();
    const wrong = HEATS.filter((h) => h !== real[g]);
    return [g, u < 0.7 ? real[g] : wrong[Math.floor(v * wrong.length)]];
  }));
}

// The candidates and who comes. startups: [{ s, gpu, price }] for the run's non-client startups.
export function demandOf({ seed, q, bench, Q, startups }) {
  const r = stream(seed, 'demand', q);
  const heat = heatOf(seed, q);
  const step = Q / 4;
  const pool = [];
  for (const { s, gpu, price } of startups) {
    pool.push({ kind: 'startup', s, gpu, u: round2(price - bench[gpu] + HEAT_SHIFT[heat[gpu]]), qty: Math.max(step, Math.min(Q, Math.round((Q * s.size * 0.6) / step) * step)), minTerm: s.months, delivery: s.arch === 'breakout' ? 90 : 30, room: round2(0.02 + 0.04 * r.next()), window: 55, come: true });
  }
  const brokers = r.shuffle(BROKERS).slice(0, 3);
  for (const name of brokers) {
    const gpu = GPU_LIST[Math.floor(r.next() * 3)];
    pool.push({ kind: 'broker', name, gpu, u: round2(lerp(-0.14, -0.06, r.next()) + HEAT_SHIFT[heat[gpu]]), qty: step * (1 + Math.floor(r.next() * 2)), minTerm: 6, delivery: 90, room: round2(lerp(0.01, 0.03, r.next())), window: Math.round(lerp(30, 40, r.next())), come: r.next() < SHOW[heat[gpu]] });
  }
  const labs = r.shuffle(LABS).slice(0, 3);
  for (const lab of labs) {
    const gpu = lab.work === 'train' ? 'B200' : 'H200';
    pool.push({ kind: 'lab', name: lab.name, work: lab.work, gpu, u: round2(lerp(0.0, 0.1, r.next()) + HEAT_SHIFT[heat[gpu]]), qty: step * (2 + Math.floor(r.next() * 3)), minTerm: r.next() < 0.5 ? 12 : 24, delivery: 30, room: round2(lerp(0.03, 0.06, r.next())), window: Math.round(lerp(45, 55, r.next())), come: r.next() < SHOW[heat[gpu]] });
  }
  return { heat, pool };
}
