// V10.5 investors: primary capital for newly issued shares. A term sheet offers a fixed
// amount for a percentage of the company after the round (post-money). Countering asks for a
// smaller percentage for the same money. Signing issues shares, so the founder's percentage
// falls exactly; the cash goes to the company, never to the founder.
import { stream } from '../util.js';
import { negotiationTime } from './exchange.js';
import { enterpriseValue, revenueNow, burnOf, totalShares, founderPct } from './founder.js';

// Check sizes are fixed ranges by investor type (cents); the percentage follows from their
// view of the company (pre-money = today's valuation × their factor), at most 35%.
export const INVESTORS = Object.freeze({
  angel: { label: 'Angel investor', names: ['Maya Chen', 'Theo Okafor', 'Rosa Lindqvist'], check: [3000000, 8000000], pct: [1000, 1500], factor: [.80, .95], room: .25, patience: 2,
    pitch: 'I like founders who ship. Small check, fast yes.' },
  seed: { label: 'Seed fund', names: ['Foundry Seed', 'Cole Valley Partners', 'Ninth Ave Capital'], check: [10000000, 30000000], pct: [1200, 2000], factor: [.60, .85], room: .20, patience: 2,
    pitch: 'We lead rounds for teams with momentum.' },
  growth: { label: 'Growth fund', names: ['Pacific Growth', 'Twin Peaks Ventures'], check: [25000000, 80000000], pct: [1500, 2500], factor: [.65, .85], room: .15, patience: 1,
    pitch: 'Big check. We expect a big slice.' },
  strategic: { label: 'Strategic investor', names: ['Helios Cloud', 'Atlas Meridian'], check: [40000000, 120000000], pct: [1000, 2000], factor: [.85, 1.05], room: .10, patience: 1,
    pitch: 'We pay up for companies that matter to our platform.' },
  bridge: { label: 'Bridge lender', names: ['Embarcadero Credit', 'Long Bridge Capital'], check: [4000000, 15000000], pct: [2500, 3500], factor: [.40, .55], room: .10, patience: 1,
    pitch: 'You are out of runway. This keeps the lights on.' },
});

export const equityValue = g => Math.round(g.cash * 100) + enterpriseValue(g.company);
// The money a term sheet raises for pct (basis points of the post-money company).
export const amountFor = (pre, bps) => Math.round(pre * bps / (10000 - bps) / 100000) * 100000 || 100000;

export function planInvestor(g) {
  const a = g.arcade, c = g.company, r = stream(g.seed, 'v105-investor', g.q), value = equityValue(g);
  const projected = Math.round(g.cash * 100) + revenueNow(c) - burnOf(c);
  let kind = null;
  if (g.q >= 2 && projected < 0) kind = 'bridge';
  else if (g.q === 2) kind = 'angel';
  else if (g.q >= 3) {
    // Investors follow momentum: a quiet round rarely brings a term sheet; a new model level or a
    // breakthrough usually does.
    const last = a.history.at(-1), built = last?.builds?.length || 0, rose = last && last.level > last.levelBefore, broke = last?.breakthrough;
    const chance = Math.min(.9, .15 + (built ? .20 : 0) + (rose ? .25 : 0) + (broke ? .30 : 0));
    if (r.next() < chance) kind = value < 200000000 ? r.pick(['angel', 'seed']) : value < 2000000000 ? r.pick(['seed', 'growth']) : r.pick(['growth', 'strategic']);
  }
  if (!kind) return null;
  const I = INVESTORS[kind], name = r.pick(I.names), pre = Math.round(value * r.range(...I.factor));
  // The check is their size; the slice is what that check buys at their valuation (≤ 35%,
  // a bridge at least its minimum), rounded to half a point.
  let amount = Math.round(r.range(...I.check) / 100000) * 100000, pct = Math.round(10000 * amount / (pre + amount) / 50) * 50;
  if (pct > 3500) { pct = 3500; amount = amountFor(pre, pct); }
  if (pct < I.pct[0] && kind === 'bridge') { pct = I.pct[0]; }
  pct = Math.max(200, pct);
  const at = kind === 'bridge' ? 0 : r.int(3, 14);
  return { id: `q${g.q}-vc`, kind, label: I.label, name, pitch: I.pitch, amount, pct, openingPct: pct, floorPct: Math.round(pct * (1 - I.room) / 50) * 50, patience: I.patience,
    at, until: a.seconds, status: 'open', valuation: value, tape: [{ speaker: name, text: `${money(amount)} for ${pct / 100}% of the company. ${I.pitch}` }] };
}

export const termLive = (g, t) => !!t && g.phase === 'floor' && t.status === 'open' && t.at <= g.arcade.time && g.arcade.time < t.until;
export const liveTerm = g => g.arcade.terms.find(t => termLive(g, t)) || null;

// Exact cap-table effect of signing the current terms.
export function termQuote(g, id = g.arcade.confirm?.termId) {
  const t = g.arcade.terms.find(t => t.id === id), c = g.company;
  if (!termLive(g, t)) return null;
  const total = totalShares(c), shares = Math.round(total * t.pct / (10000 - t.pct));
  const after = c.shares.founder / (total + shares), pre = Math.round(t.amount * (10000 - t.pct) / t.pct);
  return { termId: t.id, name: t.name, amount: t.amount, pct: t.pct, shares, founderBefore: founderPct(c), founderAfter: after, pre, post: pre + t.amount };
}

export function reviewTerm(g, id) {
  const a = g.arcade, t = a.terms.find(t => t.id === id);
  if (a.signing || a.active || a.confirm || !termLive(g, t)) return false;
  a.confirm = { termId: id }; return true;
}

// Counter for a smaller slice of the company for the same money (basis points).
export function counterTerm(g, bps) {
  const a = g.arcade, t = a.terms.find(t => t.id === a.confirm?.termId);
  if (a.signing || !termLive(g, t) || t.patience <= 0 || !Number.isSafeInteger(bps) || bps <= 0 || bps >= t.pct) return false;
  const before = t.pct;
  t.patience--; negotiationTime(g);
  t.tape.push({ speaker: 'YOU', text: `${money(t.amount)} for ${bps / 100}%.`, offer: bps });
  let outcome, text;
  if (bps < t.floorPct - 300) {
    outcome = t.patience ? 'hold' : 'walk';
    text = t.patience ? 'That is not a serious number. Our terms stand.' : 'We are out. Good luck with the raise.';
    if (!t.patience) t.status = 'walked';
  } else if (bps < t.floorPct) { outcome = 'hold'; text = 'That is below what our model allows. Our terms stand.'; }
  else if (before - bps <= Math.max(50, Math.round((before - t.floorPct) * .5))) { t.pct = bps; outcome = 'accept'; text = `Done. ${bps / 100}% it is.`; }
  else { t.pct = Math.max(t.floorPct, Math.round((before + bps) / 2 / 50) * 50); outcome = 'counter'; text = `Meet us at ${t.pct / 100}%.`; }
  if (g.arcade.time >= t.until && t.status === 'open') { t.status = 'expired'; outcome = 'expired'; text = 'The window closed while we talked.'; }
  if (!t.patience && t.status === 'open') text += ' That is our final offer.';
  t.tape.push({ speaker: t.name, text, outcome, before, after: t.pct });
  if (t.status !== 'open') a.confirm = null;
  return true;
}

export function declineTerm(g) {
  const a = g.arcade, t = a.terms.find(t => t.id === a.confirm?.termId);
  if (a.signing || !t || t.status !== 'open') return false;
  t.status = 'declined'; a.confirm = null; return true;
}

// Signing: issue shares, raise cash. Called only through arcade-signing (atomic, once).
export function signTerm(g) {
  const a = g.arcade, d = termQuote(g), c = g.company;
  if (!d) return false;
  const t = a.terms.find(t => t.id === d.termId);
  c.shares.investors.push({ name: t.name, kind: t.kind, shares: d.shares, paid: d.amount, pct: d.pct, q: g.q });
  c.raised += d.amount; a.ledger.raised += d.amount;
  g.cash = (Math.round(g.cash * 100) + d.amount) / 100;
  t.status = 'signed'; a.confirm = null;
  return d;
}

const money = c => `$${Math.round(c / 100).toLocaleString('en-US')}`;
