// V10.6 investors: primary capital for newly issued shares. A term sheet offers a fixed
// amount for a percentage of the company after the round (post-money). Countering asks for a
// smaller percentage for the same money. Signing issues shares, so the founder's percentage
// falls exactly; the cash goes to the company, never to the founder. V10.6: the money comes
// from people (world-content PERSONAS) with a thesis, a price, patience, memory and rivals.
import { stream } from '../util.js';
import { negotiationTime } from './exchange.js';
import { enterpriseValue, revenueNow, prepaidNow, burnOf, totalShares, founderPct, cardState } from './founder.js';
import { facts, holds, sentimentOf, WORLD } from './world.js';
import { PERSONAS } from './world-content.js';
import { deliverCompute, deliveryText } from './strategic.js';
import { institutionalSigned, ladderPossible } from './institutional.js';
import { frontierPossible } from './moonshot.js';

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

// ---- Personas: who is interested in this company today ---------------------------------------
export const persona = id => PERSONAS.find(p => p.id === id) || null;
// Stage fit by today's valuation (cents): angels write early checks, growth funds want scale.
const FIT = { angel: [0, 300000000], seed: [50000000, 800000000], growth: [200000000, Infinity], strategic: [500000000, Infinity], bridge: [0, Infinity] };
export function interest(g, F, p) {
  const mem = g.world?.inv?.[p.id], q = g.q;
  // V10.14: a founder who defaulted on Cirrostrata, or sued it, never sees its venture arm again.
  if (p.id === 'cirro' && (g.world?.flags?.['scn.anchor.defaulted'] || g.world?.flags?.['scn.crisis.enforced.Cirrostrata Cloud'])) return { chance: 0 };
  if (p.rounds && (q < p.rounds[0] || q > p.rounds[1])) return { chance: 0 };
  if (!holds(g, F, p.requires || [])) return { chance: 0 };
  let returning = false;
  if (mem) {
    if (mem.state === 'signed') return { chance: 0 };
    if (['declined', 'walked'].includes(mem.state)) {
      const R = p.returns;
      if (!R || !(R.after || []).includes(mem.state) || q - mem.q < 1 || !holds(g, F, R.if || [])) return { chance: 0 };
      returning = true;
    } else if (q - mem.q < 2) return { chance: 0 }; // met or let lapse: not back before two rounds pass
  }
  let x = p.base ?? .1;
  for (const [conds, w] of p.appetite || []) if (holds(g, F, conds)) x += w;
  x += sentimentOf(g) * (p.mood ?? 1);
  if (returning) x += .25;
  const [lo, hi] = FIT[p.stage] || FIT.seed, fit = F.valuation >= lo && F.valuation < hi ? 1 : .25;
  return { chance: Math.max(0, Math.min(.95, x)) * fit, returning };
}
const lineOf = (g, p, slot, salt) => { const L = p?.lines?.[slot]; return L?.length ? L[stream(g.seed, 'v106-line', p.id, slot, salt).int(0, L.length - 1)] : null; };

function makeTerm(g, p, r, { at, mods = {}, returning = false, rivalOf = null, id = `q${g.q}-vc`, factorOver = null } = {}) {
  const I = INVESTORS[p.stage] || INVESTORS.seed, value = equityValue(g), check = p.check || I.check;
  let factor = factorOver ?? (r.range(...(p.factor || I.factor)) + sentimentOf(g) + (returning ? p.returns?.factor || 0 : 0) + (mods.factor || 0));
  factor = Math.max(.3, Math.min(1.25, factor));
  // Proven profit improves price; scale brings larger checks for the same dilution model.
  const profitable = revenueNow(g.company) > burnOf(g.company);
  if (profitable) factor = Math.min(1.25, factor + .10);
  const pre = Math.max(100000, Math.round(value * factor));
  let amount = Math.round(r.range(...check) * (g.company.scale === 3 ? Math.min(100, Math.max(5, value / 1500000000)) : g.company.scale === 2 ? 3 : 1) * (mods.check || 1) * (p.special?.kind === 'upsize' ? 1.5 : 1) / 100000) * 100000 || 100000;
  let pct = Math.round(10000 * amount / (pre + amount) / 50) * 50;
  if (pct > 3500) { pct = 3500; amount = amountFor(pre, pct); }
  if (p.stage === 'bridge' && pct < I.pct[0]) pct = I.pct[0];
  pct = Math.max(200, pct);
  const patience = Math.max(0, (p.special?.kind === 'final' ? 0 : p.patience ?? I.patience) + (mods.patience || 0));
  const until = p.special?.kind === 'exploding' ? Math.min(g.arcade.seconds, at + 10) : g.arcade.seconds;
  const pitch = (returning && lineOf(g, p, 'return', g.q)) || (rivalOf && (p.rival?.line || lineOf(g, p, 'rival', g.q))) || lineOf(g, p, 'pitch', g.q) || p.thesis || I.pitch;
  return { id, kind: p.stage, investor: p.id, fund: p.fund, archetype: p.archetype, label: p.archetype || I.label, name: p.name, pitch, amount, pct, openingPct: pct,
    floorPct: Math.round(pct * (1 - (p.room ?? I.room)) / 50) * 50, patience, factor, special: p.special?.kind || null, returning, rivalOf,
    at, until, status: 'open', valuation: value, tape: [{ speaker: p.name, text: `${money(amount)} for ${pct / 100}% of the company. ${pitch}` }] };
}

// One term sheet a round at most, plus (rarely) a rival trying to steal it. Who comes depends on
// the company's state and the founder's history with them; nobody is a guaranteed rescue.
export function planInvestor(g) {
  if (!PERSONAS.length) { const t = planGeneric(g); return t ? [t] : []; }
  const a = g.arcade, c = g.company, w = g.world, r = stream(g.seed, 'v106-investor', g.q), F = facts(g);
  const projected = Math.round(g.cash * 100) + revenueNow(c) - Math.min(revenueNow(c), prepaidNow(c)) - burnOf(c);
  const pool = filter => PERSONAS.filter(filter).map(p => ({ p, ...interest(g, F, p) })).filter(x => x.chance > 0);
  const choose = list => list.length ? r.weighted(list.map(x => ({ w: x.chance, v: x }))) : null;
  let lead = null, at = r.int(3, 14), mods = {};
  if (w.forceTerm) {
    const p = persona(w.forceTerm.investor), x = p && interest(g, F, p);
    if (p && (x.chance > 0 || g.world.inv[p.id]?.state !== 'signed')) { lead = { p, returning: !!x?.returning }; at = w.forceTerm.at; mods = w.forceTerm.mods; }
  }
  if (!lead && g.q >= 2 && projected < 0) {
    // Desperate: predatory money, a real investor who still believes, or nobody at all.
    const u = r.next();
    if (u < .55) lead = choose(pool(p => p.stage === 'bridge'));
    else if (u < .70 && (F.level >= 2 || F.revenue >= 1500000)) lead = choose(pool(p => p.stage !== 'bridge'));
    at = 0;
  } else if (!lead && g.q === 2) lead = choose(pool(p => p.stage === 'angel'));
  else if (!lead && g.q >= 3) {
    // Momentum brings investors (V10.5 odds), and the market's mood moves them.
    const last = a.history.at(-1), built = last?.builds?.length || 0, rose = last && last.level > last.levelBefore, broke = last?.breakthrough;
    const chance = Math.min(.9, .15 + (built ? .20 : 0) + (rose ? .25 : 0) + (broke ? .30 : 0) + sentimentOf(g));
    if (r.next() < chance) lead = choose(pool(p => p.stage !== 'bridge'));
  }
  // No investor spam: at most WORLD.sheets term sheets in a game (rivals included).
  if (!lead || (w.sheets || 0) >= WORLD.sheets) return [];
  const t = makeTerm(g, lead.p, r, { at, mods, returning: lead.returning });
  w.sheets = (w.sheets || 0) + 1;
  const out = [t];
  // A rival sees the sheet and tries to steal the deal with a better price (at most twice a game).
  if (w.rivals < WORLD.rivals && w.sheets < WORLD.sheets && t.kind !== 'bridge') {
    const rivals = pool(p => p.id !== lead.p.id && p.rival?.steals && p.stage !== 'bridge');
    const x = choose(rivals);
    if (x && r.next() < Math.min(.8, .2 + x.chance)) {
      const rt = makeTerm(g, x.p, r, { at: Math.min(a.seconds - 12, t.at + r.int(4, 8)), id: `q${g.q}-vc2`, rivalOf: t.id, factorOver: t.factor * (1 + (x.p.rival.beat ?? .08)) });
      out.push(rt); w.rivals++; w.sheets++;
    }
  }
  return out;
}

function planGeneric(g) {
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

const vultureBlocked = (g, card) => {
  if (!card || !Number.isSafeInteger(card.cashCost) || card.cashCost <= 0) return false;
  const st = cardState(g, card);
  return st.live && st.cashNeeded > 0 && st.rows.length > 0 && st.rows.every(r => r.held + r.free >= r.need);
};
export const termLive = (g, t) => !!t && g.phase === 'floor' && t.status === 'open' && t.at <= g.arcade.time && g.arcade.time < t.until &&
  (!t.vulture || vultureBlocked(g, g.arcade.objectives.find(c => c.id === t.cardId))) &&
  (t.institutional !== 'sovereign' || frontierPossible(g) || ladderPossible(g));

// One seeded chance on the first cash-blocked, fully stocked card encountered each round.
// A rejected roll is persisted too, so reopening cards or reloading cannot reroll the offer.
export function maybeVulture(g, cardId) {
  const a = g.arcade, card = a.objectives.find(c => c.id === cardId), v = g.world.vulture || { offers: 0, attemptQ: 0 };
  if (a.active || a.signing || a.confirm || a.terms.some(t => t.vulture) || v.offers >= 2 || v.attemptQ === g.q || !vultureBlocked(g, card)) return false;
  v.attemptQ = g.q; g.world.vulture = v;
  if (stream(g.seed, 'v119-vulture-round', g.q, card.id).next() >= .18) return 'passed';
  const shortfall = cardState(g, card).cashNeeded, buffer = Math.min(100_000_000, Math.max(1_000_000, Math.round(card.cashCost * .05)));
  const amount = shortfall + buffer, pct = 4000 + 100 * stream(g.seed, 'v119-vulture-price', g.q, card.id).int(0, 9);
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'passed';
  const name = 'Mortimer Kestrel', pitch = "You've got the GPUs. We've got the cash. And we both know you're out of options.";
  const t = { id: `q${g.q}-vulture`, kind: 'bridge', investor: 'vulture-round', vulture: true, cardId, shortfall, buffer,
    fund: 'Last Light Special Situations', label: 'The Vulture Round', name, pitch, amount, pct, openingPct: pct, floorPct: pct,
    patience: 0, at: a.time, until: a.seconds, status: 'open', valuation: equityValue(g),
    conditions: `For ${card.name}. Cash goes to the company. You must still BUILD the project. This offer expires at the bell.`,
    tape: [{ speaker: name, text: pitch }] };
  a.terms.push(t); v.offers++;
  a.confirm = { termId: t.id };
  return 'offer';
}
export const liveTerm = g => g.arcade.terms.find(t => termLive(g, t)) || null;
export const liveTerms = g => g.arcade.terms.filter(t => termLive(g, t));
// The other live sheet the founder could show this investor (a competing offer on the table).
export const rivalTerm = (g, t) => t?.vulture ? null : g.arcade.terms.find(x => x.id !== t?.id && !x.vulture && termLive(g, x)) || null;

// Exact cap-table effect of signing the current terms.
export function termQuote(g, id = g.arcade.confirm?.termId) {
  const t = g.arcade.terms.find(t => t.id === id), c = g.company;
  if (!termLive(g, t)) return null;
  const total = totalShares(c), shares = Math.round(total * t.pct / (10000 - t.pct));
  const after = c.shares.founder / (total + shares), pre = Math.round(t.amount * (10000 - t.pct) / t.pct);
  return { termId: t.id, name: t.name, amount: t.amount, funding: t.funding || 'cash', tranches: t.tranches || null, conditions: t.conditions || null, pct: t.pct, shares, founderBefore: founderPct(c), founderAfter: after, pre, post: pre + t.amount };
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
  t.tape.push({ speaker: 'YOU', text: `${t.funding === 'compute' ? 'The same capacity' : money(t.amount)} for ${bps / 100}%.`, offer: bps });
  let outcome, text;
  if (bps < t.floorPct - 300) {
    outcome = t.patience ? 'hold' : 'walk';
    text = t.patience ? 'That is not a serious number. Our terms stand.' : 'We are out. Good luck with the raise.';
    if (!t.patience) t.status = 'walked';
  } else if (bps < t.floorPct) { outcome = 'hold'; text = 'That is below what our model allows. Our terms stand.'; }
  else if (before - bps <= Math.max(50, Math.round((before - t.floorPct) * .5))) { t.pct = bps; outcome = 'accept'; text = `Done. ${bps / 100}% it is.`; }
  else { t.pct = Math.max(t.floorPct, Math.round((before + bps) / 2 / 50) * 50); outcome = 'counter'; text = `Meet us at ${t.pct / 100}%.`; }
  if (g.arcade.time >= t.until && t.status === 'open') { t.status = 'expired'; outcome = 'expired'; text = 'The window closed while we talked.'; }
  const said = lineOf(g, persona(t.investor), { accept: 'accept', counter: 'counter', hold: 'hold', walk: 'walk' }[outcome], t.tape.length);
  if (said) text = outcome === 'counter' ? `${said} ${text}` : outcome === 'accept' ? `${said} ${bps / 100}% it is.` : said;
  if (!t.patience && t.status === 'open') text += ' That is our final offer.';
  t.tape.push({ speaker: t.name, text, outcome, before, after: t.pct });
  if (t.status !== 'open') a.confirm = null;
  return true;
}

export function declineTerm(g) {
  const a = g.arcade, t = a.terms.find(t => t.id === a.confirm?.termId);
  if (a.signing || !t || t.status !== 'open') return false;
  t.status = 'declined'; a.confirm = null;
  const said = lineOf(g, persona(t.investor), 'declined', g.q);
  if (said) a.message = { text: `${t.name}: “${said}”`, tone: 'plain' };
  return true;
}

// Show this investor the competing sheet. They match the rival's valuation if their model allows,
// meet at their floor if they love the deal, or walk out of an auction. Once per sheet; 1 second.
export function playRivalTerm(g) {
  const a = g.arcade, t = a.terms.find(t => t.id === a.confirm?.termId), x = rivalTerm(g, t);
  if (a.signing || !termLive(g, t) || !x || t.rivalPlayed) return false;
  t.rivalPlayed = true; negotiationTime(g);
  const pre = v => v.amount * (10000 - v.pct) / v.pct, before = t.pct, p = persona(t.investor);
  t.tape.push({ speaker: 'YOU', text: `${x.name} offers ${money(x.amount)}${x.funding === 'compute' ? ' in compute' : ' cash'} for ${x.pct / 100}%. Beat it.`, rival: x.id });
  let outcome, text;
  if (pre(x) <= pre(t)) { outcome = 'hold'; text = 'Our price is already better. Read it again.'; }
  else {
    const want = Math.max(50, Math.ceil(10000 * t.amount / (pre(x) + t.amount) / 50) * 50);
    if (want >= t.floorPct) { t.pct = want; outcome = 'accept'; text = lineOf(g, p, 'rival', 'match') || 'Fine. We match.'; text = `${text} ${want / 100}%.`; }
    else if (p?.rival?.steals) { t.pct = t.floorPct; outcome = 'counter'; text = `Best we can do: ${t.floorPct / 100}%.`; }
    else { t.status = 'walked'; outcome = 'walk'; text = lineOf(g, p, 'walk', 'rival') || 'We do not do auctions.'; a.confirm = null; }
  }
  if (g.arcade.time >= t.until && t.status === 'open') { t.status = 'expired'; outcome = 'expired'; text = 'The window closed while we talked.'; a.confirm = null; }
  t.tape.push({ speaker: t.name, text, outcome, before, after: t.pct });
  return true;
}

// Signing: issue shares, raise cash. Called only through arcade-signing (atomic, once).
export function signTerm(g) {
  const a = g.arcade, d = termQuote(g), c = g.company;
  if (!d) return false;
  const t = a.terms.find(t => t.id === d.termId);
  const inKind = t.funding === 'compute' ? d.amount : 0, paid = inKind ? 0 : d.amount;
  c.shares.investors.push({ name: t.name, kind: t.kind, shares: d.shares, paid, inKind, termId: t.id, pct: d.pct, q: g.q });
  c.raised += paid; a.ledger.raised += paid; a.ledger.inKind += inKind;
  g.cash = (Math.round(g.cash * 100) + paid) / 100;
  if (inKind) {
    c.compute.push({ termId: t.id, name: t.name, value: d.amount, tranches: structuredClone(t.tranches) });
    deliverCompute(g);
    a.message = { text: `Capacity secured. ${deliveryText(t.tranches)}. Unused units expire at their delivery bell.`, tone: 'good' };
  }
  institutionalSigned(g, t, d);
  t.status = 'signed'; a.confirm = null;
  // The round is taken: the competing sheet is withdrawn (one raise per contest).
  for (const x of a.terms) if (x.status === 'open') x.status = 'withdrawn';
  return d;
}

const money = c => `$${Math.round(c / 100).toLocaleString('en-US')}`;
