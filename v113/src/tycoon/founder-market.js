// V10.5 founder market: finite supplier lots shaped by what your company is trying to build,
// one market event per round, a compact resale desk and held blocks from trusted firms.
// Every lot, bid and event is generated once per round from seeded streams.
import { stream } from '../util.js';
import { SELLER_FIRMS } from '../data/names.js';
import { supplierStyle, BUYER_NAMES } from './exchange.js';
import { GPUS, heldFor } from './founder.js';

export const ASK = Object.freeze({ H100: 245, H200: 319, B200: 486 });
export const PHASES = Object.freeze([null,
  { name: 'Scrappy beginnings', slots: 4, qty: [1, 2, 2, 3], bids: 2 },
  { name: 'Scrappy beginnings', slots: 4, qty: [1, 2, 3, 4], bids: 2 },
  { name: 'Strategic direction', slots: 5, qty: [1, 2, 3, 4], bids: 2 },
  { name: 'Strategic direction', slots: 5, qty: [2, 2, 3, 4], bids: 2 },
  { name: 'Build something real', slots: 5, qty: [2, 3, 4, 6], bids: 2 },
  { name: 'Build something real', slots: 6, qty: [2, 4, 5, 6], bids: 3 },
  { name: 'Scale or struggle', slots: 6, qty: [2, 4, 6, 8], bids: 3 },
  { name: 'Scale or struggle', slots: 6, qty: [3, 4, 6, 8], bids: 3 },
  { name: 'The final push', slots: 6, qty: [3, 5, 6, 8], bids: 3 },
  { name: 'The final push', slots: 6, qty: [3, 5, 6, 8], bids: 3 },
]);
export const DRIFT = .035; // compute gets dearer: asks rise 3.5% a round (round 10 ≈ +32%)

// Separate reservation stream preserves the existing ask, quantity and arrival draws.
// Even a perfect third attempt pays at least 48% of ask; unusual liquidation books have
// the most room, while firm suppliers protect their margins.
export function reservationPrice(g, lot) {
  const ranges = { firm: [.20,.25], patient: [.28,.34], flexible: [.34,.40] };
  const range = lot.liquidation ? [.48,.52] : lot.id === 'q1-start' ? [.30,.30] : lot.favor ? [.24,.30] : ranges[lot.profile];
  const ratio = stream(g.seed, 'v108-reservation', g.q, lot.id).range(...range);
  return Math.max(1, Math.ceil(lot.ask * (1-ratio)));
}

// One market event per round (seeded): a shortage or a glut of one GPU type, or a quiet tape.
export function marketEvent(g) {
  if (g.q === 1) return { kind: 'quiet', text: 'A quiet open. Learn the floor.' };
  const r = stream(g.seed, 'v105-event', g.q), u = r.next(), gpu = GPUS[r.int(0, 2)];
  if (u < .28) return { kind: 'shortage', gpu, text: `${gpu} shortage: fewer lots, asks up 12%.` };
  if (u < .50) return { kind: 'glut', gpu, text: `${gpu} glut: extra lots, asks down 10%.` };
  return { kind: 'quiet', text: 'Normal trading.' };
}

// GPU demand from the visible cards: what is still missing, plus a base weight per type.
function demand(g) {
  const w = { H100: 3, H200: 2.5, B200: 1.5 };
  for (const o of g.arcade.objectives.filter(o => o.status === 'open')) for (const k of GPUS) if (o.recipe[k]) w[k] += .5 * Math.max(0, o.recipe[k] - heldFor(g, o.id, k));
  return w;
}

export function makeRoundLots(g) {
  const P = PHASES[g.q], r = stream(g.seed, 'v105-supply', g.q), lots = [], ev = g.arcade.event, w = demand(g);
  const seconds = g.arcade.seconds;
  for (let wave = 0; wave < 2; wave++) for (let slot = 0; slot < P.slots; slot++) {
    const i = lots.length, firm = SELLER_FIRMS[(i + g.q * 5) % SELLER_FIRMS.length];
    let gpu = r.weighted(GPUS.map(k => ({ w: w[k] * (ev.kind === 'shortage' && ev.gpu === k ? .4 : ev.kind === 'glut' && ev.gpu === k ? 2 : 1), v: k })));
    const at = wave === 0 ? 0 : 12 + slot * 2, until = wave === 0 ? Math.min(seconds, 20 + slot * 3) : seconds;
    const qty = r.pick(P.qty);
    const shift = ev.gpu === gpu ? (ev.kind === 'shortage' ? 1.12 : ev.kind === 'glut' ? .90 : 1) : 1;
    const ask = Math.round(ASK[gpu] * (1 + DRIFT * (g.q - 1)) * shift) + r.int(-18, 26);
    const trust = Math.max(-4, Math.min(8, g.firms[firm]?.trust || 0));
    const liquidation = wave > 0 && r.next() < .10;
    const room = liquidation ? Math.floor(ask * .30) : r.int(26, 52) + Math.max(0, trust);
    lots.push({ id: `q${g.q}-l${i}`, slot, firm, profile: supplierStyle(firm), gpu, qty, ask, floor: ask - room, liquidation, at, until, flash: until - at < 18, cooldown: 0, status: 'open', negotiation: null });
  }
  // Round 1 starter: a lot that exactly completes the product card, at a fair ask with room.
  if (g.q === 1) {
    const card = g.arcade.objectives.find(o => o.lane === 'product'), [gpu, qty] = Object.entries(card.recipe)[0], s = stream(g.seed, 'v105-starter');
    const used = new Set(lots.filter(l => l.at === 0).map(l => l.firm)), firm = SELLER_FIRMS.find(f => !used.has(f)) || SELLER_FIRMS[0];
    const ask = ASK[gpu] - s.int(4, 12);
    lots.unshift({ id: 'q1-start', slot: 80, firm, profile: supplierStyle(firm), gpu, qty, ask, floor: ask - s.int(20, 30), liquidation: false, at: 0, until: 32, flash: false, cooldown: 0, status: 'open', negotiation: null });
  }
  // Earned favor: from round 3, up to two firms at Trust ≥ 3 hold a block of the GPU your
  // cards miss most, 4% under the market, open all round.
  if (g.q >= 3) {
    const favored = Object.entries(g.firms).filter(([, f]) => (f.trust || 0) >= 3).sort((a, b) => b[1].trust - a[1].trust || a[0].localeCompare(b[0])).slice(0, 2);
    const need = GPUS.slice().sort((a, b) => w[b] - w[a]);
    for (const [j, [firm, f]] of favored.entries()) {
      const fr = stream(g.seed, 'v105-favor', g.q, firm), gpu = need[j % 3], qty = fr.pick(P.qty);
      const ask = Math.round(ASK[gpu] * (1 + DRIFT * (g.q - 1)) * .96) + fr.int(-6, 6);
      lots.push({ id: `q${g.q}-f${j}`, slot: 90 + j, firm, profile: supplierStyle(firm), gpu, qty, ask, floor: ask - fr.int(14, 26) - Math.min(8, f.trust), liquidation: false, favor: true, at: 0, until: seconds, flash: false, cooldown: 0, status: 'open', negotiation: null });
    }
  }
  for (const lot of lots) lot.floor = reservationPrice(g, lot);
  return lots.sort((a, b) => a.at - b.at);
}

// The resale desk: a few funded spot bids for surplus capacity, near the market ask.
export function makeResaleBids(g, cents) {
  const P = PHASES[g.q], r = stream(g.seed, 'v105-resale', g.q), bids = [], seconds = g.arcade.seconds;
  for (let i = 0; i < P.bids; i++) {
    const gpu = GPUS[(i + g.q) % 3], qty = r.pick([2, 3, 4, 6]), posture = r.pick(['firm', 'cautious', 'flexible']);
    const room = posture === 'firm' ? r.int(3, 8) : posture === 'cautious' ? r.int(10, 25) : r.int(25, 55);
    const rate = Math.round(ASK[gpu] * (1 + DRIFT * (g.q - 1)) * r.range(.95, 1.02)), at = i === 0 ? 0 : 10 + 8 * i, until = seconds;
    const budget = cents(qty, rate + room);
    bids.push({ id: `q${g.q}-b${i}`, slot: i, name: BUYER_NAMES[(i + g.q * 3) % BUYER_NAMES.length], gpu, qty, filled: 0, rate, openingRate: rate, ceiling: rate + room, budget, initialBudget: budget, at, until, posture, flash: false, premium: false,
      reason: { firm: 'Fixed spot bid', cautious: 'A narrow budget', flexible: 'Room for a sensible proposal' }[posture],
      negotiation: { counters: 0, walked: false, tape: [{ speaker: 'BUYER', text: `I will take up to ${qty} ${gpu} of spare capacity. Funded bid.` }] } });
  }
  if (g.q >= 2 && r.next() < .65) {
    const types = [
      ['Urgent frontier lab', 'B200', 4, 1.04, 1.40, 'flexible', 18],
      ['Hyperscaler overflow', 'H200', 7, 1.00, 1.22, 'cautious', 28],
      ['Distressed launch team', 'B200', 2, 1.10, 1.55, 'flexible', 14],
      ['Compute trading desk', 'H200', 8, .93, 1.08, 'firm', 30],
    ];
    const [name, gpu, qty, low, high, posture, window] = r.pick(types), market = ASK[gpu] * (1 + DRIFT * (g.q - 1));
    const rate = Math.round(market * low), ceiling = Math.round(market * high), budget = cents(qty, ceiling), at = 6;
    bids.push({ id: `q${g.q}-special`, slot: bids.length, name, gpu, qty, filled: 0, rate, openingRate: rate, ceiling, budget, initialBudget: budget, at, until: Math.min(seconds, at + window), posture, flash: window < 20, premium: true, reason: `${name}: funded ${qty}-GPU mandate`, negotiation: { counters: 0, walked: false, tape: [{speaker:name,text:'This block has a funded ceiling. Earn the premium.'}] } });
  }
  return bids;
}
