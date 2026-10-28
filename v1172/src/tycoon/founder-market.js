// V10.5 founder market: finite supplier lots shaped by what your company is trying to build,
// one market event per round, a compact resale desk and held blocks from trusted firms.
// Every lot, bid and event is generated once per round from seeded streams.
import { stream } from '../util.js';
import { SELLER_FIRMS } from '../data/names.js';
import { supplierStyle, BUYER_NAMES } from './exchange.js';
import { GPUS, heldFor, freeOf, cardState } from './founder.js';

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
export const LOT_SCALE = Object.freeze([1, 1, 1.75, 2.5]); // lot size by company scale (index = scale; V10.15: 1, 1.5, 2)
// V10.17.2: four waves across the round. The opening brings every slot; three later waves (0:10–0:15,
// 0:20–0:27, 0:30–0:38) bring half as many again each, so useful supply keeps arriving all round. Later
// waves carry more distressed (liquidation) books.
export const WAVES = Object.freeze([
  Object.freeze({ at: 0, span: 0, share: 1, liquidation: 0 }),
  Object.freeze({ at: 10, span: 5, share: .5, liquidation: .10 }),
  Object.freeze({ at: 20, span: 7, share: .5, liquidation: .10 }),
  Object.freeze({ at: 28, span: 4, share: .5, liquidation: .25 }),
]);

// Separate reservation stream preserves the existing ask, quantity and arrival draws.
// Even a perfect third attempt pays at least 48% of ask; unusual liquidation books have
// the most room, while firm suppliers protect their margins.
export function reservationPrice(g, lot) {
  const ranges = { firm: [.20,.25], patient: [.28,.34], flexible: [.34,.40] };
  // V10.17.2: capacity houses leave 30–40% room on a block (a sourced block keeps the seller's range).
  const range = lot.liquidation ? [.48,.52] : lot.id === 'q1-start' ? [.30,.30] : lot.favor ? [.24,.30] : lot.block && !lot.sourced ? [.38,.48] : ranges[lot.profile];
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
  for (const [wave, W] of WAVES.entries()) for (let slot = 0, n = Math.ceil(P.slots * W.share); slot < n; slot++) {
    const i = lots.length, firm = SELLER_FIRMS[(i + g.q * 5) % SELLER_FIRMS.length];
    let gpu = r.weighted(GPUS.map(k => ({ w: w[k] * (ev.kind === 'shortage' && ev.gpu === k ? .4 : ev.kind === 'glut' && ev.gpu === k ? 2 : 1), v: k })));
    const at = W.at + (n > 1 ? Math.round(slot * W.span / (n - 1)) : 0), until = wave === 0 ? Math.min(seconds, 20 + slot * 3) : seconds;
    // Suppliers quote bigger lots to bigger companies (Scale-up ×1.75, AI Giant ×2.5).
    const qty = Math.round(r.pick(P.qty) * LOT_SCALE[g.company.scale || 1]);
    const shift = ev.gpu === gpu ? (ev.kind === 'shortage' ? 1.12 : ev.kind === 'glut' ? .90 : 1) : 1;
    const ask = Math.round(ASK[gpu] * (1 + DRIFT * (g.q - 1)) * shift) + r.int(-18, 26);
    const trust = Math.max(-4, Math.min(8, g.firms[firm]?.trust || 0));
    const liquidation = wave > 0 && r.next() < W.liquidation;
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
    // V10.17.2: a Scale-up keeps three trusted firms, and their held lots are sized to the company.
    const favored = Object.entries(g.firms).filter(([, f]) => (f.trust || 0) >= 3).sort((a, b) => b[1].trust - a[1].trust || a[0].localeCompare(b[0])).slice(0, (g.company.scale || 1) >= 2 ? 3 : 2);
    const need = GPUS.slice().sort((a, b) => w[b] - w[a]);
    for (const [j, [firm, f]] of favored.entries()) {
      const fr = stream(g.seed, 'v105-favor', g.q, firm), gpu = need[j % 3], qty = Math.round(fr.pick(P.qty) * LOT_SCALE[g.company.scale || 1]);
      const ask = Math.round(ASK[gpu] * (1 + DRIFT * (g.q - 1)) * .96) + fr.int(-6, 6);
      lots.push({ id: `q${g.q}-f${j}`, slot: 90 + j, firm, profile: supplierStyle(firm), gpu, qty, ask, floor: ask - fr.int(14, 26) - Math.min(8, f.trust), liquidation: false, favor: true, at: 0, until: seconds, flash: false, cooldown: 0, status: 'open', negotiation: null });
    }
  }
  // V10.15 block suppliers: a Scale-up meets capacity houses through the round. A block is one lot (one
  // negotiation, one signature) of the GPU your open projects miss most.
  lots.push(...blockLots(g, w), ...repeatLots(g));
  for (const lot of lots) lot.floor = reservationPrice(g, lot);
  return lots.sort((a, b) => a.at - b.at);
}

// ---- V10.15 blocks, sourcing orders and offtake buyers ------------------------------------------
export const BLOCK = Object.freeze({
  firms: Object.freeze(['Titan Allocation Desk', 'Northstar Capacity', 'Gigawatt Partners', 'Meridian Bulk Compute']),
  // V10.17.2: blocks arrive through the round (Scale-up two, AI Giant four); from R8 the last giant block
  // can be a 64-GPU institutional allocation.
  scaleup: Object.freeze([{ qty: [8, 10, 12], at: 0, until: 30 }, { qty: [10, 12, 16], at: 22, until: 45 }]),
  giant: Object.freeze([{ qty: [16, 20, 24], at: 0, until: 30 }, { qty: [24, 32], at: 12, until: 45 }, { qty: [24, 32, 40], at: 24, until: 45 },
    { qty: [32, 40, 48], at: 30, until: 45, big: 64, bigFrom: 8, bigChance: .15 }]),
  discount: .97,
  // Sourcing orders: a dedicated block for one project, at a premium, a few seconds later.
  source: Object.freeze({ premium: 1.18, delay: 3, window: 20, min: 4, latest: 35, orders: Object.freeze([0, 0, 1, 2]) }),
  // Offtake mandates on the resale desk for big sellers.
  // A company with flagship fleets is offered its fleet's GPU, sized to fleetShare of the fleet's output (max fleetMax).
  offtake: Object.freeze({ chance: Object.freeze([0, 0, .5, .85]), qty: Object.freeze([12, 16, 20, 24]), low: 1.10, high: 1.45, fleetShare: .75, fleetMax: 128,
    names: Object.freeze(['Frontier lab offtake', 'Hyperscaler offtake', 'Sovereign cloud offtake']) }),
});
// Units still missing across open cards, after free stock.
export function deficits(g) {
  const d = { H100: 0, H200: 0, B200: 0 };
  for (const o of g.arcade.objectives.filter(o => o.status === 'open')) for (const k of GPUS) if (o.recipe[k]) d[k] += Math.max(0, o.recipe[k] - heldFor(g, o.id, k));
  for (const k of GPUS) d[k] = Math.max(0, d[k] - freeOf(g, k));
  return d;
}
const marketAsk = (g, gpu) => {
  const ev = g.arcade.event, shift = ev?.gpu === gpu ? (ev.kind === 'shortage' ? 1.12 : ev.kind === 'glut' ? .90 : 1) : 1;
  return ASK[gpu] * (1 + DRIFT * (g.q - 1)) * shift;
};
// V10.17.2 repeat allocation: a block you Charmed last round comes back, held for you all round at the
// negotiated rate plus market drift (never under REPEAT_FLOOR of the market ask). Charm it again to keep it.
export const REPEAT_FLOOR = .68;
function repeatLots(g) {
  return Object.entries(g.firms).filter(([, f]) => f.lock && f.lock.q === g.q - 1).sort((x, y) => x[0].localeCompare(y[0])).map(([firm, f], j) => {
    const L = f.lock, ask = Math.max(Math.round(L.rate * (1 + DRIFT)), Math.round(marketAsk(g, L.gpu) * REPEAT_FLOOR));
    return { id: `q${g.q}-r${j}`, slot: 85 + j, firm, profile: supplierStyle(firm), gpu: L.gpu, qty: L.qty, ask, floor: 0, liquidation: false, favor: true, block: true, repeat: true,
      label: 'Repeat allocation', at: 0, until: g.arcade.seconds, flash: false, cooldown: 0, status: 'open', negotiation: null };
  });
}
function blockLots(g, w) {
  const scale = g.company.scale || 1;
  if (scale < 2) return [];
  const r = stream(g.seed, 'v115-blocks', g.q), ev = g.arcade.event, need = deficits(g), out = [];
  for (const [j, spec] of (scale >= 3 ? BLOCK.giant : BLOCK.scaleup).entries()) {
    const gpu = r.weighted(GPUS.map(k => ({ w: (1 + need[k]) * w[k] * (ev.kind === 'shortage' && ev.gpu === k ? .5 : 1), v: k })));
    let qty = spec.big && g.q >= spec.bigFrom && r.next() < spec.bigChance ? spec.big : r.pick(spec.qty);
    // One scarce GPU type per block, sized to current visible demand, capped at 192.
    if (g.q >= 4) qty = Math.min(192, Math.max(qty, 4 * Math.ceil(Math.min(need[gpu], qty * (g.company.scale === 3 ? 4 : 2)) / 4)));
    const firm = BLOCK.firms[(g.q + j) % BLOCK.firms.length], trust = Math.max(0, Math.min(5, g.firms[firm]?.trust || 0));
    // V10.17.2 relationships: each Trust point (max 5) takes 1% off a house's block, and at Trust 4+ its later
    // blocks reach you 10 seconds early.
    const ask = Math.round(marketAsk(g, gpu) * (BLOCK.discount - .01 * trust)) + r.int(-8, 10), early = spec.at > 0 && trust >= 4;
    out.push({ id: `q${g.q}-k${j}`, slot: 70 + j, firm, profile: supplierStyle(firm), gpu, qty, ask, floor: 0, liquidation: false, block: true, label: early ? 'Early access' : qty >= 64 ? 'Institutional allocation' : qty >= 40 ? 'Exceptional block' : 'Block', at: early ? Math.max(0, spec.at - 10) : spec.at, until: Math.min(g.arcade.seconds, spec.until), flash: false, cooldown: 0, status: 'open', negotiation: null });
  }
  return out;
}
// How many sourcing orders the company may place this round, and what one would bring for a card.
export const sourcingLeft = g => (BLOCK.source.orders[g.company.scale || 1] || 0) - (g.arcade.sourced || 0);
export function sourcingQuote(g, card) {
  const S = BLOCK.source;
  if (!card || sourcingLeft(g) <= 0 || g.phase !== 'floor' || g.arcade.time >= S.latest) return null;
  const st = cardState(g, card);
  if (!st.live) return null;
  const rows = st.rows.map(r => ({ gpu: r.gpu, short: Math.max(0, r.need - r.held - r.free) })).filter(r => r.short > 0).sort((a, b) => b.short - a.short || GPUS.indexOf(b.gpu) - GPUS.indexOf(a.gpu));
  if (!rows.length) return null;
  const gpu = rows[0].gpu, qty = Math.max(S.min, rows[0].short + (rows[0].short % 2));
  const rate = Math.round(marketAsk(g, gpu) * S.premium);
  return { card: card.id, gpu, qty, rate, premium: S.premium };
}
// The sourced block: a lot like any other (Charm, walk away, expiry), arriving a few seconds later.
export function sourcedLot(g, quote) {
  const S = BLOCK.source, n = (g.arcade.sourced || 0) + 1, firm = BLOCK.firms[(g.q + n + 1) % BLOCK.firms.length];
  const at = Math.round((g.arcade.time + S.delay) * 10) / 10;
  const lot = { id: `q${g.q}-s${n}`, slot: 60 + n, firm, profile: supplierStyle(firm), gpu: quote.gpu, qty: quote.qty, ask: quote.rate, floor: 0, liquidation: false, block: true, sourced: quote.card, label: 'Sourced for you',
    at, until: Math.min(g.arcade.seconds, at + S.window), flash: false, cooldown: 0, status: 'open', negotiation: null };
  lot.floor = reservationPrice(g, lot);
  return lot;
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
  // V10.15: big sellers meet funded offtake mandates (own stream: base bids are unchanged).
  const scale = g.company?.scale || 1, o = BLOCK.offtake, x = stream(g.seed, 'v115-offtake', g.q);
  if (x.next() < o.chance[scale]) {
    const output = fleet => GPUS.map(k => [k, g.company.racks.filter(r => r.gpu === k && r.online > 0 && (!fleet || r.fleet)).reduce((n, r) => n + Math.floor(r.qty * r.online), 0)]).sort((a, b) => b[1] - a[1]);
    const racks = output(false), fleet = output(true)[0], follow = x.next() < .6;
    const gpu = fleet[1] > 0 ? fleet[0] : racks[0][1] > 0 && follow ? racks[0][0] : x.pick(['H200', 'B200', 'B200']);
    const qty = Math.max(x.pick(o.qty), fleet[1] > 0 ? Math.min(o.fleetMax, 4 * Math.round(fleet[1] * o.fleetShare / 4)) : 0), name = x.pick(o.names), market = ASK[gpu] * (1 + DRIFT * (g.q - 1));
    const rate = Math.round(market * o.low), ceiling = Math.round(market * o.high), budget = cents(qty, ceiling);
    bids.push({ id: `q${g.q}-offtake`, slot: 40, name, gpu, qty, filled: 0, rate, openingRate: rate, ceiling, budget, initialBudget: budget, at: 4, until: seconds, posture: 'flexible', flash: false, premium: true, offtake: true, reason: `${name}: funded ${qty}-GPU mandate`, negotiation: { counters: 0, walked: false, tape: [{ speaker: name, text: 'We take big blocks. Funded, today.' }] } });
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

// A signed, visible mandate can buy scarce replacement capacity at a premium. This avoids impossible
// commitments when a new commercial recipe skews the round's ordinary supply toward a different GPU.
export function commitmentLots(g) {
 const cards=g.arcade.objectives.filter(o=>o.scenario && o.status==='open'), out=[];
 for(const gpu of GPUS) {
  const need=cards.reduce((n,o)=>n+(o.recipe[gpu]||0),0), supply=g.arcade.lots.filter(l=>l.gpu===gpu).reduce((n,l)=>n+l.qty,0)+freeOf(g,gpu);
  if(need<=supply)continue;
  const ask=Math.round(marketAsk(g,gpu)*1.25), qty=need-supply;
  const lot={id:`q${g.q}-mandate-${gpu}`,slot:96+GPUS.indexOf(gpu),firm:BLOCK.firms[GPUS.indexOf(gpu)],profile:'firm',gpu,qty,ask,at:0,until:45,block:true,label:'Mandate replacement',floor:0,flash:false,cooldown:0,status:'open',negotiation:null};
  lot.floor=reservationPrice(g,lot);out.push(lot);
 }
 return out;
}
