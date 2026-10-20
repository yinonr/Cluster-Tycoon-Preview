// V10.4 Score Attack market: ten rounds that escalate from small flips to whale-sized
// orders. Every lot and bid is generated once per round from seeded streams; nothing is
// created at action time. Structures match V10.3 lots and buyers, so haggling, Rival
// Quote, Charm and signing work unchanged.
import { stream } from '../util.js';
import { SELLER_FIRMS } from '../data/names.js';
import { supplierStyle, BUYER_NAMES } from './exchange.js';

// Tuned with tools/sim-v104.mjs (200 seeds × 13 strategy bots). Every phase keeps a
// 2-GPU lot in its mix so a player who lost a bet can still trade back up; spreads come
// mostly from negotiation and picking the right pair, not from drift. The whale rounds
// carry fewer supplier slots, so the whale's GPU is deep but finite.
export const PHASES = Object.freeze([
  null,
  { name: 'Find your footing', slots: 5, lotQty: [2, 4, 4], buyers: 3, buyerQty: [2, 4], drift: 0 },
  { name: 'Find your footing', slots: 5, lotQty: [2, 4, 4], buyers: 3, buyerQty: [2, 4, 4], drift: 0 },
  { name: 'Make your bets', slots: 6, lotQty: [2, 4, 4, 6], buyers: 4, buyerQty: [4, 4, 6], drift: .01 },
  { name: 'Make your bets', slots: 6, lotQty: [2, 4, 6, 6], buyers: 4, buyerQty: [4, 6], drift: .015 },
  { name: 'Fortune swings', slots: 7, lotQty: [2, 4, 6, 8], buyers: 4, buyerQty: [4, 6, 8], drift: .02 },
  { name: 'Fortune swings', slots: 7, lotQty: [2, 6, 6, 8], buyers: 4, buyerQty: [6, 8], drift: .02 },
  { name: 'Chase the whale', slots: 6, lotQty: [2, 6, 8, 10], buyers: 4, buyerQty: [6, 8, 8], drift: .025 },
  { name: 'Chase the whale', slots: 6, lotQty: [2, 6, 8, 10], buyers: 4, buyerQty: [6, 8, 8], drift: .025 },
  { name: 'Final gambles', slots: 8, lotQty: [2, 8, 10, 12], buyers: 4, buyerQty: [6, 8, 10], drift: .03 },
  { name: 'Final gambles', slots: 8, lotQty: [2, 8, 10, 12], buyers: 4, buyerQty: [6, 8, 10], drift: .03 },
]);
export const ASK = Object.freeze({ H100: 245, H200: 319, B200: 486 });
export const BID = Object.freeze({ H100: 247, H200: 321, B200: 488 });
export const SECONDS = 50;
// The whale arrives in round 7 or 8 (seeded): a large block wanted before second 28, so it
// competes with the early-delivery window for your seconds and cash. Clout sets the premium
// (company orders completed for cash or equity are what lift Clout past 300 and 600).
export const WHALE = Object.freeze({ rounds: [7, 8], qty: [28, 36, 44], until: 28, bonus: .10, premium: Object.freeze([[0, 1.05], [300, 1.10], [600, 1.15]]) });
export const whaleRound = seed => WHALE.rounds[stream(seed, 'v104-whale-round').int(0, 1)];
export const whalePremium = clout => WHALE.premium.filter(([c]) => clout >= c).at(-1)[1];

// GPUs this round's demand leans on: company orders first, then the whale.
function focusGPUs(g, orders) { return [...new Set([...orders.map(o => o.gpu), 'H100', 'H200', 'B200'])]; }

export function makeRoundLots(g, orders, whale) {
  const P = PHASES[g.q], r = stream(g.seed, 'v104-supply', g.q), lots = [], focus = focusGPUs(g, orders);
  for (let wave = 0; wave < 2; wave++) for (let slot = 0; slot < P.slots; slot++) {
    const at = wave === 0 ? 0 : 18 + slot * 2;
    const until = wave === 0 ? Math.min(SECONDS, 24 + slot * 2) : SECONDS;
    const i = lots.length, firm = SELLER_FIRMS[(i + g.q * 5) % SELLER_FIRMS.length];
    // Whale rounds deepen the whale's GPU across several firms; it is still finite.
    const gpu = whale && slot % 2 === 0 ? whale.gpu : slot < focus.length && wave === 0 ? focus[slot] : ['H100', 'H200', 'B200'][(slot + wave + g.q) % 3];
    const small = g.q === 1 && slot === 0 && wave === 0;
    const qty = small ? 2 : r.pick(P.lotQty);
    const liquidation = wave > 0 && r.next() < .10;
    const ask = Math.round(ASK[gpu] * (1 + P.drift * .6)) + r.int(-22, 30);
    const trust = Math.max(-4, Math.min(8, g.firms[firm]?.trust || 0));
    const room = liquidation ? Math.floor(ask * .40) : r.int(20, 42) + Math.max(0, trust);
    lots.push({ id: `q${g.q}-l${i}`, slot, firm, profile: supplierStyle(firm), gpu, qty, ask, floor: ask - room, liquidation, at, until, flash: until - at < 20, cooldown: 0, status: 'open', negotiation: null });
  }
  // Earned favor: a firm you have traded well with calls you first with a held block.
  const favored = Object.entries(g.firms).filter(([, f]) => (f.trust || 0) >= 3).sort((a, b) => b[1].trust - a[1].trust || a[0].localeCompare(b[0])).slice(0, 2);
  for (const [j, [firm, f]] of favored.entries()) {
    if (g.q < 3) break;
    const fr = stream(g.seed, 'v104-favor', g.q, firm), gpu = whale ? whale.gpu : focus[j % focus.length];
    const qty = fr.pick(P.lotQty), ask = Math.round(ASK[gpu] * (1 + P.drift * .6) * .96) + fr.int(-6, 6);
    lots.push({ id: `q${g.q}-f${j}`, slot: 90 + j, firm, profile: supplierStyle(firm), gpu, qty, ask, floor: ask - fr.int(14, 26) - Math.min(8, f.trust), liquidation: false, favor: true, at: 0, until: SECONDS, flash: false, cooldown: 0, status: 'open', negotiation: null });
  }
  return lots.sort((a, b) => a.at - b.at);
}

export function makeRoundBuyers(g, cents, whale) {
  const P = PHASES[g.q], r = stream(g.seed, 'v104-buyers', g.q), buyers = [];
  for (let wave = 0; wave < 2; wave++) for (let slot = 0; slot < P.buyers; slot++) {
    const at = wave === 0 ? 0 : 16 + slot * 3, until = wave === 0 ? 24 + slot * 3 : SECONDS;
    const i = buyers.length, gpu = ['H100', 'H200', 'B200'][(slot + wave + g.q) % 3];
    const qty = r.pick(P.buyerQty), posture = r.pick(['firm', 'cautious', 'flexible', 'urgent']);
    const room = posture === 'firm' ? 0 : posture === 'cautious' ? r.int(3, 9) : posture === 'flexible' ? r.int(12, 28) : r.int(18, 38);
    const rate = Math.round(BID[gpu] * (1 + P.drift)) + r.int(-30, 22), budget = cents(qty, rate + room);
    buyers.push({ id: `q${g.q}-b${i}`, slot, name: BUYER_NAMES[(i + g.q * 5) % BUYER_NAMES.length], gpu, qty, filled: 0, rate, openingRate: rate, ceiling: rate + room, budget, initialBudget: budget, at, until, posture, flash: until - at < 20, premium: posture === 'urgent',
      reason: { firm: 'Fixed procurement price', cautious: 'A narrow purchasing allowance', flexible: 'Room for a sensible proposal', urgent: 'A launch deadline and a larger allowance' }[posture],
      negotiation: { counters: 0, walked: false, tape: [{ speaker: 'BUYER', text: `I need ${qty} ${gpu} for this service period. Here is my funded bid.` }] } });
  }
  if (whale) buyers.push(whaleBuyer(g, cents, whale));
  return buyers.sort((a, b) => a.at - b.at);
}

// Round 1 opens with a starter pair: the first funded buyer wants 2 GPUs, and a supplier on
// the floor holds exactly 2 of them a few cents under that bid, with room to haggle. Selling
// at the ask is a small win; one good counter doubles it. Seeded on its own stream.
export function starterPair(g, buyers, lots, cents) {
  if (g.q !== 1) return null;
  const b = buyers.find(b => b.at === 0 && !b.whale);
  if (!b) return null;
  const r = stream(g.seed, 'v104-starter'), used = new Set(lots.filter(l => l.at === 0).map(l => l.firm));
  const from = r.int(0, SELLER_FIRMS.length - 1), firm = [...SELLER_FIRMS.slice(from), ...SELLER_FIRMS.slice(0, from)].find(f => !used.has(f)) || SELLER_FIRMS[from];
  b.qty = 2; b.budget = b.initialBudget = cents(2, b.ceiling);
  b.negotiation.tape = [{ speaker: 'BUYER', text: `I need 2 ${b.gpu} for this service period. Here is my funded bid.` }];
  const ask = b.rate - r.int(6, 14), lot = { id: 'q1-start', slot: 80, firm, profile: supplierStyle(firm), gpu: b.gpu, qty: 2, ask, floor: ask - r.int(22, 34), liquidation: false, at: 0, until: 32, flash: false, cooldown: 0, status: 'open', negotiation: null };
  lots.unshift(lot);
  return lot;
}

// The whale: one huge, fully funded order at a premium, plus a completion bonus paid only
// if the whole order is delivered before their deadline. Partial sales pay the premium rate.
export function planWhale(g) {
  if (g.q !== whaleRound(g.seed)) return null;
  const r = stream(g.seed, 'v104-whale', g.q), gpu = r.pick(['H100', 'H200', 'B200']);
  return { gpu, qty: r.pick(WHALE.qty), name: r.pick(['Helios Frontier Labs', 'Atlas Meridian Cloud', 'Monolith Compute']) };
}
function whaleBuyer(g, cents, w) {
  const premium = whalePremium(Math.max(0, g.clout)), rate = Math.round(BID[w.gpu] * (1 + PHASES[g.q].drift) * premium);
  const bonus = Math.round(cents(w.qty, rate) * WHALE.bonus), budget = cents(w.qty, rate) + bonus;
  return { id: `q${g.q}-whale`, slot: 99, name: w.name, gpu: w.gpu, qty: w.qty, filled: 0, rate, openingRate: rate, ceiling: rate, budget, initialBudget: budget, at: 0, until: WHALE.until, posture: 'firm', flash: false, premium: true,
    whale: { bonus, premium, clout: Math.max(0, g.clout), paid: false }, reason: 'A frontier build-out: everything you can source, at a premium',
    negotiation: { counters: 2, walked: false, tape: [{ speaker: 'BUYER', text: `We need ${w.qty} ${w.gpu} before second ${WHALE.until}. Premium rate, and a bonus if you deliver the whole block.` }] } };
}
