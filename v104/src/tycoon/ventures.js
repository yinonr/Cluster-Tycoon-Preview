// V10.4 Score Attack ventures: short, legible startup arcs whose odds the player moves
// with real compute. Each live startup gets ONE seeded draw per round. Support only
// shifts the outcome thresholds, so for the same luck more support never produces a
// worse outcome. Ownership never changes the odds; it only changes your exposure.
import { stream, round2 } from '../util.js';

export const VENTURE = Object.freeze({
  // Composite support x ∈ [0,1]: delivered share of this round's need, early completion,
  // and a capped streak of fully supported rounds. Hidden quality nudges it (±0.10).
  weight: Object.freeze({ delivered: .62, early: .14, streak: .08, streakCap: 3, quality: .20 }),
  // Outcome bands, probability at x=0 and at x=1 (linear between). Order matters: the
  // single draw walks collapse → stall → flat → growth → breakout.
  // Tuned (tools/sim-v104.mjs): expected multiple per round ≈ 0.72× unsupported and ≈ 1.56×
  // fully supported; half support (x ≈ 0.31) still loses value (≈ 0.98×). Ownership never pays odds.
  bands: Object.freeze([
    Object.freeze({ kind: 'collapse', p0: .34, p1: .05 }),
    Object.freeze({ kind: 'stall', p0: .28, p1: .14 }),
    Object.freeze({ kind: 'flat', p0: .22, p1: .27 }),
    Object.freeze({ kind: 'growth', p0: .12, p1: .34 }),
    Object.freeze({ kind: 'breakout', p0: .04, p1: .20 }),
  ]),
  // Valuation multiple inside each band, interpolated by where the draw fell in the band.
  mult: Object.freeze({ stall: [.50, .78], flat: [.92, 1.10], growth: [1.28, 1.72], breakout: [2.5, 4.4] }),
  raise: .10,            // outside round after growth or breakout: new shares dilute everyone
  // Exits are rarer than raises but pay a premium in cash; IPOs need stage 3.
  exit: Object.freeze({ base: .05, perStage: .08, age: .08, ageFrom: 4, ipoStage: 3, ipoPremium: 1.4, acquire: [1.1, 1.35] }),
  closingRate: .30,      // closing-bell liquidity desk: remaining live stakes at 30% of mark
  vc: Object.freeze({ chance: .85, bid: [.70, 1.08], strategic: .12, share: [.5, 1.0] }),
  early: 22,             // seconds into the round: full delivery before this counts as early
});
const STAGES = ['Seed', 'Product', 'Growth', 'Scale', 'Frontier'];
export const stageName = s => STAGES[Math.max(0, Math.min(4, Math.floor(s.v104.stage)))];

const POOL = [
  { name: 'Fathom Robotics', sector: 'robot foundation models', gpu: 'H100' },
  { name: 'Kestrel AI', sector: 'coding agents', gpu: 'H100' },
  { name: 'Lumen Bio', sector: 'protein models', gpu: 'H200' },
  { name: 'Parallax Labs', sector: 'video models', gpu: 'B200' },
  { name: 'Driftwood Speech', sector: 'voice models', gpu: 'H100' },
  { name: 'Quarry Search', sector: 'retrieval', gpu: 'H200' },
  { name: 'Sable Agents', sector: 'agent platforms', gpu: 'H200' },
  { name: 'Ferry Genomics', sector: 'genomics models', gpu: 'B200' },
  { name: 'Kiln Robotics', sector: 'warehouse robots', gpu: 'H100' },
  { name: 'Cobalt Voice', sector: 'voice agents', gpu: 'H100' },
];
const CONTACTS = ['Rita', 'Del', 'June', 'Nik', 'Bea', 'Ray', 'Wen', 'Lou', 'Ines', 'Hal'];
// When new companies reach the floor. A failed or exited company is replaced next round,
// up to three live companies, so every run keeps fresh bets without scripted outcomes.
const ARRIVALS = [1, 2, 3, 5];
const MAX_LIVE = 3, MAX_PER_RUN = 6;

function makeVenture(seed, index, born) {
  // One shuffle of the pool per run: every company in a run is distinct.
  const c = POOL[stream(seed, 'v104-venture-pool').shuffle(POOL.map((_, i) => i))[index % POOL.length]];
  const r = stream(seed, 'v104-venture-make', index);
  const val = Math.round(r.range(300000, 620000) / 1000) * 1000;
  return {
    id: `s${index + 1}`, name: c.name, sector: c.sector, contact: CONTACTS[(index * 3 + r.int(0, 9)) % CONTACTS.length],
    val0: val, val, cash: Math.round(val * r.range(.05, .11)), stake: 0, alive: true, exited: false, trust: 0,
    v104: { index, born, gpu: c.gpu, quality: round2(r.range(0, 1)), stage: 0, age: 0, streak: 0, peak: val, events: [], last: null, exitKind: null },
  };
}

// The first company is on the floor from round 1; later ones arrive on schedule.
export function createVentures(seed) { return [makeVenture(seed, 0, 1)]; }

export function arrive(g) {
  // Due by now: the scheduled arrivals plus one replacement for every company already gone.
  const live = () => g.startups.filter(s => s.alive && !s.exited).length;
  const gone = g.startups.filter(s => !s.alive || s.exited).length;
  const due = Math.min(MAX_PER_RUN, ARRIVALS.filter(q => q <= g.q).length + gone), out = [];
  while (g.startups.length < due && live() < MAX_LIVE) { const s = makeVenture(g.seed, g.startups.length, g.q); g.startups.push(s); out.push(s); }
  // The floor always has at least one company to back, even past the per-run cap.
  if (!live() && g.startups.length < POOL.length) { const s = makeVenture(g.seed, g.startups.length, g.q); g.startups.push(s); out.push(s); }
  return out;
}

const gpuFor = s => { const st = Math.floor(s.v104.stage); return st >= 3 ? 'B200' : st >= 2 && s.v104.gpu === 'H100' ? 'H200' : s.v104.gpu; };
// One compute order per live company per round. Need grows with stage; price is a fair
// service rate so a cash delivery earns a modest trading margin.
export function ventureOrders(g, cents) {
  const orders = [];
  for (const s of g.startups.filter(s => s.alive && !s.exited)) {
    const r = stream(g.seed, 'v104-order', s.id, g.q), gpu = gpuFor(s), st = Math.floor(s.v104.stage);
    const qty = [4, 6, 8, 10, 12][st] + (r.next() < .5 ? 0 : 2);
    const rate = { H100: 262, H200: 338, B200: 522 }[gpu] + r.int(-4, 6) + Math.round(3 * (g.q - 1));
    orders.push({ id: `q${g.q}-${s.id}`, client: s.id, name: s.name, gpu, qty, delivered: 0, rate, milestone: false, critical: true, early: VENTURE.early, earlyMet: false });
  }
  return orders;
}

// Pure: composite support for a company this round, given its order state.
export function supportOf(s, o, { delivered = o?.delivered ?? 0, early = !!o?.earlyMet } = {}) {
  // x = 0.62 × share delivered + 0.14 if delivered in full before the early deadline
  //   + 0.08 per consecutive fully supported round (max 3) + 0.20 × (hidden quality − ½).
  const W = VENTURE.weight, ratio = o ? Math.min(1, delivered / o.qty) : 0, full = ratio >= 1;
  const streak = full ? Math.min(W.streakCap, s.v104.streak + 1) : 0;
  const x = W.delivered * ratio + (full && early ? W.early : 0) + W.streak * streak + W.quality * (s.v104.quality - .5);
  return { ratio, early: full && early, streak, x: Math.max(0, Math.min(1, x)) };
}

export function bandsAt(x) {
  return VENTURE.bands.map(b => ({ kind: b.kind, p: b.p0 + (b.p1 - b.p0) * x }));
}
// Odds a player can read: chance of collapse and of a breakout this round.
export function outlook(s, o, opts) {
  const { x, ratio, early } = supportOf(s, o, opts), bands = bandsAt(x);
  const p = k => bands.find(b => b.kind === k).p;
  return { x, ratio, early, collapse: p('collapse'), breakout: p('breakout'), upside: p('growth') + p('breakout') };
}

function eventFor(x, u) {
  let acc = 0;
  for (const b of bandsAt(x)) { const lo = acc; acc += b.p; if (u < acc || b.kind === 'breakout') return { kind: b.kind, within: Math.min(1, Math.max(0, (u - lo) / Math.max(1e-9, b.p))) }; }
}

// Settle every live company at the bell. Returns news lines; credits exit cash to the player.
export function settleVentures(g, { cents, record }) {
  const lines = [];
  for (const s of g.startups.filter(s => s.alive && !s.exited)) {
    const v = s.v104, o = g.arcade.orders.find(o => o.client === s.id);
    const sup = supportOf(s, o), r = stream(g.seed, 'v104-venture', s.id, g.q), u = r.next(), u2 = r.next(), u3 = r.next();
    const ev = eventFor(sup.x, u), before = { val: s.val, stake: s.stake, stage: v.stage };
    v.age++; v.streak = sup.ratio >= 1 ? sup.streak : 0;
    const line = { id: s.id, name: s.name, kind: ev.kind, support: sup, before, stakeBefore: s.stake, paperBefore: Math.floor(s.stake * s.val * 100) };
    if (ev.kind === 'collapse') {
      s.alive = false; line.lostStake = s.stake; s.stake = 0; v.exitKind = 'collapse';
      line.text = sup.ratio ? 'Ran out of road despite your compute.' : 'Missed its compute and ran out of road.';
    } else {
      const [lo, hi] = VENTURE.mult[ev.kind] || [1, 1], m = lo + (hi - lo) * ev.within;
      s.val = Math.max(1000, Math.round(s.val * m));
      if (ev.kind === 'breakout') v.stage = Math.min(4, v.stage + 1);
      else if (ev.kind === 'growth') v.stage = Math.min(4, v.stage + .5);
      else if (ev.kind === 'stall') v.stage = Math.max(0, v.stage - .5);
      line.multiple = round2(m);
      if (ev.kind === 'growth' || ev.kind === 'breakout') {
        const raise = Math.round(s.val * VENTURE.raise);
        s.stake = s.stake * s.val / (s.val + raise); s.val += raise; s.cash += raise; line.raise = raise;
      }
      v.peak = Math.max(v.peak, s.val);
      // Exits: an acquisition or IPO pays every holder in cash at the deal price.
      const E = VENTURE.exit, stage = Math.floor(v.stage);
      const pExit = stage >= 2 || v.age >= E.ageFrom ? E.base + E.perStage * stage + (v.age >= E.ageFrom ? E.age : 0) : 0;
      if (ev.kind !== 'stall' && u2 < pExit) {
        const ipo = stage >= E.ipoStage, premium = ipo ? E.ipoPremium : E.acquire[0] + (E.acquire[1] - E.acquire[0]) * u3;
        const price = Math.round(s.val * premium), proceeds = Math.floor(s.stake * price * 100);
        s.exited = true; v.exitKind = ipo ? 'ipo' : 'acquired'; line.exit = { kind: v.exitKind, price, proceeds, stake: s.stake };
        if (proceeds > 0) record('exit', proceeds, { company: s.name, kind: v.exitKind, stake: s.stake });
        s.stake = 0;
      }
      line.text = line.exit ? `${line.exit.kind === 'ipo' ? 'Rang the IPO bell' : 'Acquired'} at ${money(line.exit.price)}.`
        : { stall: 'Usage slipped; the next round is harder.', flat: 'Holding steady.', growth: 'Growing fast. Raised a new round.', breakout: 'BREAKOUT. Valuation multiplied.' }[ev.kind];
    }
    line.after = { val: s.val, stake: s.stake, stage: v.stage, alive: s.alive, exited: s.exited };
    line.paperAfter = Math.floor(s.stake * s.val * 100);
    v.last = line; v.events.push({ q: g.q, kind: ev.kind, multiple: line.multiple || 0, exit: line.exit?.kind || null });
    lines.push(line);
  }
  return lines;
}

// VC secondary bids open at the start of a round for companies that just grew.
export function ventureVCOffers(g) {
  const offers = [];
  for (const s of g.startups) {
    const last = s.v104?.last;
    if (!s.alive || s.exited || s.stake <= 0 || !last || !['growth', 'breakout', 'flat'].includes(last.kind)) continue;
    const r = stream(g.seed, 'v104-vc', s.id, g.q);
    if (r.next() > (last.kind === 'flat' ? .45 : VENTURE.vc.chance)) continue;
    const C = VENTURE.vc, strategic = r.next() < C.strategic + (last.kind === 'breakout' ? .15 : 0);
    const discount = strategic ? r.range(1.0, 1.18) : r.range(C.bid[0], C.bid[1]);
    const bidVal = Math.max(1, Math.floor(s.val * 100 * discount));
    const budget = Math.max(1, Math.floor(s.stake * bidVal * r.range(C.share[0], C.share[1])));
    const type = strategic ? 'Strategic buyer' : r.next() < .5 ? 'Growth fund' : 'Value fund';
    offers.push({ id: `q${g.q}-vc-${s.id}`, client: s.id, name: r.pick(['Foundry Ventures', 'Pacific Growth Partners', 'Mission Capital', 'Twin Peaks Ventures']), type, val: s.val, stake: s.stake, serial: g.arcade.investments[s.id]?.serial ?? 0, bidVal, budget, maxBps: 10000, at: 2 + offers.length * 6, until: 46, used: false });
  }
  return offers;
}

// Closing bell: the liquidity desk buys every remaining live stake at a fixed haircut.
export function closingQuote(g) {
  return g.startups.filter(s => s.alive && !s.exited && s.stake > 0).map(s => ({ id: s.id, name: s.name, stake: s.stake, mark: Math.floor(s.stake * s.val * 100), proceeds: Math.floor(s.stake * s.val * 100 * VENTURE.closingRate) }));
}

const money = d => `$${Math.round(d).toLocaleString('en-US')}`;
