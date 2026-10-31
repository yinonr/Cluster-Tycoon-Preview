import { campaignLimit, EXTENDED_ROUNDS } from './extension.js';
// V10.14 The World Gets Bigger: late-game scenarios. Design: docs/V10_13_SCENARIOS.md; content and
// numbers: scenario-content.js. A small engine of four primitives over the existing economy:
//   proposals  a Deal Room document with two or three options, offered at a round's open;
//   chains     commitments delivered through ordinary opportunity-slot cards, due at a bell;
//   buyers     funded special bids on the existing resale desk;
//   dues       disclosed penalties, paid after payroll (any unpaid rest is next bell's burn).
// Every draw comes from a named stream ('v113-scn', key, round). Money is integer cents; every cent
// moves through the arcade ledger (contracts in; capex and penalties out); equity only through issued
// shares; revenue only from built, integrated cards; GPUs only from inventory.
import { ECONOMY } from './economy-balance.js';
import { stream } from '../util.js';
import { FOUNDER, GPUS, isMixed, recipeCost, revenueNow, revenueOf, enterpriseValue, burnOf, cashRevenueNow, founderPct, totalShares,
  freeOf, focusOf, liveProducts, concentration, rackOutput, MODEL_NAMES, heldFor, valuation } from './founder.js';
import { ASK, DRIFT } from './founder-market.js';
import { HOURS_PER_MONTH } from '../data/gpus.js';
import { strategicBusy, partnershipStarts } from './strategic.js';
import { moonshotActive, moonshotOdds, MOONSHOT } from './moonshot.js';
import { sovereignEligible } from './institutional.js';
import { CAST, ANCHOR, FIRESALE, BUYOUT, CRISIS, CAPACITY, TALENT, PROVIDER, CHECKPOINT, PACE } from './scenario-content.js';

export const SCENARIOS_ENABLED = true;
// Small scenarios share a two-a-game budget. The Customer Crisis is not one of them: it is the
// consequence of a concentration the founder chose, so it is never crowded out.
export const SMALL = Object.freeze(['capacity', 'talent', 'provider', 'checkpoint']);
const MAJOR = Object.freeze(['anchor', 'firesale', 'buyout']);
const OFFER_STATES = Object.freeze(['open', 'chosen', 'declined', 'expired', 'walked']);
const CHAIN_STATES = Object.freeze(['active', 'waiting', 'completed', 'defaulted', 'lapsed', 'ended', 'assumed', 'settled', 'deferred']);

// `enabled: false` is the QA control: a campaign where no scenario is ever proposed (saved with the run).
export function createScenarios(enabled = true) {
  return { v: 1, enabled: !!enabled, offers: [], chains: [], buyers: [], dues: [], due: [], log: [], smalls: 0, quietQ: 0, lastQ: 0, seq: 0, pending: null,
    cash: { in: 0, capex: 0, penalties: 0 }, bonus: null, sale: null,
    anchor: null, firesale: null, buyout: null, crisis: null, capacity: null, talent: null, provider: null, checkpoint: null };
}

// ---- Small shared helpers ----------------------------------------------------------------------------
const S = g => g.world.scen;
const cashOf = g => Math.round(g.cash * 100);
export const markOf = g => cashOf(g) + enterpriseValue(g.company);
const rng = (g, key, ...salt) => stream(g.seed, 'v113-scn', key, g.q, ...salt);
const unitNow = (g, gpu) => Math.round(FOUNDER.unit[gpu] * (1 + DRIFT * (g.q - 1)));
const rateNow = (g, gpu) => Math.round(ASK[gpu] * (1 + DRIFT * (g.q - 1)));
const recipeNow = (g, r) => GPUS.reduce((n, k) => n + (r[k] || 0) * unitNow(g, k), 0);
const prizeOf = (g, recipe, x) => Math.round(recipeCost(recipe) * x * (1 + .03 * g.q) / 100) * 100;
const round10k = x => Math.max(1000000, Math.round(x / 1000000) * 1000000);
const plural = (n, a, b = `${a}s`) => `${n} ${n === 1 ? a : b}`;
const money = c => `$${Math.round(c / 100).toLocaleString('en-US')}`;
const shortM = c => { const d = c / 100; return d >= 1e6 ? `$${(d / 1e6).toFixed(d >= 1e7 ? 1 : 2)}M` : `$${Math.round(d / 1000)}k`; };
const recipeText = r => GPUS.filter(k => r[k]).map(k => `${r[k]} ${k}`).join(' + ');
const flag = (g, name, value = true) => { g.world.flags[`scn.${name}`] = value; };
const roundOf = g => g.phase === 'report' ? g.q - 1 : g.q;
export const anchorExclusive = g => !!S(g)?.anchor?.exclusive && ['active', 'waiting', 'completed'].includes(S(g).anchor.state);
const opportunityOpen = g => g.arcade.objectives.some(o => o.lane === 'opportunity' && o.status === 'open' && (!o.until || g.arcade.time < o.until));
// A scenario card needs the opportunity desk: never while a partnership holds it, and one chain at a time.
export const scenarioSlotFree = g => !strategicBusy(g) && !S(g)?.chains.some(ch => ['active', 'waiting'].includes(ch.state)) && !g.arcade.objectives.some(o => o.kind === 'scenario' && o.status === 'open');
// At the open, before due cards are dealt: will a commitment or callback card claim the desk this round?
const CARD_DUES = Object.freeze(['second-call', 'alumni']);
const slotClaimed = g => !scenarioSlotFree(g) || partnershipStarts(g) || S(g).chains.some(ch => ch.state === 'active' && ch.due === g.q && !ch.card) || S(g).due.some(d => d.q === g.q && CARD_DUES.includes(d.key));
const dueNow = (g, key) => S(g).due.find(d => d.key === key && d.q === g.q) || null;
const quality = c => 1 + FOUNDER.quality * c.level;

let atBell = false; // set while scenarioBell runs, so bell-time news is labelled as such
function news(g, id, headline, { size = 'major', tone = 'plain', when = atBell || g.phase !== 'floor' ? 'bell' : 'open', detail = '' } = {}) {
  const n = { id: `scn-${id}`, q: roundOf(g), when, size, category: 'scenario', headline, detail, tone, surface: 'news' };
  g.world.news.push(n); g.world.log.push({ id: n.id, q: n.q, headline });
  if (g.phase === 'floor') g.arcade.news = g.world.news.slice();
  S(g).log.push({ q: n.q, id, text: headline });
}
function payIn(g, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return 0;
  g.cash = (cashOf(g) + amount) / 100; g.arcade.ledger.contracts += amount; S(g).cash.in += amount; return amount;
}
function capex(g, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > cashOf(g)) return false;
  g.cash = (cashOf(g) - amount) / 100; g.arcade.ledger.capex += amount; S(g).cash.capex += amount; return true;
}
function burnFor(g, delta, rounds, event) {
  if (delta && rounds > 0) g.company.mods.burn.push({ delta, left: rounds, event: `scn-${event}` });
}
function arm(g, bonus) {
  const s = S(g), b = s.bonus && !s.bonus.used ? s.bonus : null;
  s.bonus = { breakthrough: (b?.breakthrough || 0) + (bonus.breakthrough || 0), setback: (b?.setback || 0) + (bonus.setback || 0), legendary: (b?.legendary || 0) + (bonus.legendary || 0),
    frontier: !!(b?.frontier || bonus.frontier), source: [b?.source, bonus.source].filter(Boolean).join(' + '), used: false, q: g.q };
}
// A real equity grant: new shares issued at no cash, exactly like a primary round's arithmetic.
function grant(g, name, bps) {
  const c = g.company, total = totalShares(c), shares = Math.round(total * bps / (10000 - bps));
  c.shares.investors.push({ name, kind: 'talent', shares, paid: 0, inKind: 0, termId: `q${g.q}-talent`, pct: bps, q: g.q, grant: true });
  return shares;
}
function lose(g, products) {
  for (const p of products) if (!p.lost) { p.lost = true; p.lostQ = roundOf(g); }
}
const customerProducts = (g, customer) => g.company.products.filter(p => p.customer === customer && !p.lost);

// ---- Proposals ------------------------------------------------------------------------------------------
function propose(g, key, data, { major = MAJOR.includes(key), until = g.arcade.seconds } = {}) {
  const s = S(g), o = { id: `q${g.q}-${key}`, key, q: g.q, at: 0, until, state: 'open', choice: null, seen: false, major, log: [], ...data };
  s.offers.push(o); s.lastQ = g.q;
  if (SMALL.includes(key)) s.smalls++;
  return o;
}
export const offerLive = (g, o) => !!o && g.phase === 'floor' && o.state === 'open' && o.q === g.q && o.at <= g.arcade.time && g.arcade.time < o.until;
export const liveOffers = g => (S(g)?.offers || []).filter(o => offerLive(g, o));
export function reviewScenario(g, id) {
  const a = g.arcade, o = S(g).offers.find(o => o.id === id);
  if (a.active || a.signing || a.confirm || !offerLive(g, o)) return false;
  o.seen = true; a.confirm = { scenario: id }; return true;
}
export const reviewedOffer = g => S(g)?.offers.find(o => o.id === g.arcade.confirm?.scenario) || null;

// ---- Chains: commitments delivered through cards --------------------------------------------------------
// spec: { key, name, customer, stages:[{name, recipe, reward, cashCost?}], due, whole, terminates, penalty, cure,
//          window, label, blurb, onDone, onMiss }
function startChain(g, spec) {
  const s = S(g), id = `${spec.key}-${++s.seq}`;
  const ch = { id, key: spec.key, name: spec.name, org: spec.org || spec.name, customer: spec.customer || null, label: spec.label || 'Contract', stages: spec.stages.map(x => structuredClone(x)),
    stage: 0, due: spec.due ?? g.q, state: 'active', card: null, cards: [], history: [], whole: !!spec.whole, terminates: !!spec.terminates,
    penalty: spec.penalty || 0, cure: spec.cure || 0, cureUsed: false, window: spec.window || 0, blurb: spec.blurb || '', contract: !!spec.contract, opened: g.q };
  s.chains.push(ch);
  if (ch.due === g.q && g.phase === 'floor') spawnStage(g, ch);
  return ch;
}
function spawnStage(g, ch) {
  const a = g.arcade, st = ch.stages[ch.stage], now = Math.round(a.time), total = ch.stages.length;
  // The commitment takes the opportunity desk: an open pilot or rush is withdrawn, its GPUs freed.
  const gone = new Set(a.objectives.filter(o => o.lane === 'opportunity' && o.status === 'open' && o.kind !== 'scenario').map(o => o.id));
  if (gone.size) { a.reservations = a.reservations.filter(r => !gone.has(r.card)); a.objectives = a.objectives.filter(o => !gone.has(o.id)); }
  const c = g.company; c.cardSeq++;
  const recipe = { ...st.recipe }, until = ch.window ? Math.min(a.seconds, now + ch.window) : a.seconds;
  const cure = ch.cure && !ch.cureUsed && g.q < campaignLimit(g) ? ch.cure : 0;
  const card = { id: `q${g.q}-scn-${ch.key}-${ch.stage}-${c.cardSeq}`, lane: 'opportunity', kind: 'scenario', tier: 0,
    name: total > 1 ? `${ch.org} · ${st.name}` : st.name, blurb: st.blurb || ch.blurb, recipe, mixed: isMixed(recipe), reward: structuredClone(st.reward), q: g.q,
    at: now, until, status: 'open', ...(st.cashCost ? { cashCost: st.cashCost } : {}), ...(ch.customer ? { customer: ch.customer } : {}),
    scenario: { key: ch.key, chain: ch.id, stage: ch.stage, total, label: ch.label, whole: ch.whole, penalty: ch.penalty, terminates: ch.terminates, cure, due: g.q, ...(ch.contract ? { contract: true } : {}) } };
  a.objectives.push(card); ch.card = card.id; ch.cards.push(card.id); ch.cardQ = g.q;
  return card;
}
// A paid extension: this stage (and every later one) moves a round. Once a contract, never past R5.
export function cureStage(g, cardId) {
  const a = g.arcade, card = a.objectives.find(o => o.id === cardId), ch = S(g).chains.find(x => x.id === card?.scenario?.chain);
  if (g.phase !== 'floor' || a.active || a.signing || a.confirm || !card || card.status !== 'open' || !ch || ch.card !== card.id || ch.cureUsed || !ch.cure || g.q >= campaignLimit(g)) return false;
  const lastDue = g.q + (ch.stages.length - ch.stage);
  if (lastDue > campaignLimit(g) || ch.cure > cashOf(g)) return false;
  g.cash = (cashOf(g) - ch.cure) / 100; a.ledger.penalties += ch.cure; S(g).cash.penalties += ch.cure;
  ch.cureUsed = true; ch.cureQ = g.q; ch.due = g.q + 1; ch.card = null;
  a.reservations = a.reservations.filter(r => r.card !== card.id);
  card.status = 'expired'; card.deferred = true; card.scenario.due = ch.due;
  news(g, `${ch.key}-extension`, `${ch.org}: extension granted. ${ch.stages[ch.stage].name} now due R${ch.due}; ${money(ch.cure)} paid.`, { size: 'minor' });
  return true;
}

// ---- Special buyers on the resale desk -------------------------------------------------------------------
function addBuyer(g, key, { name, gpu, qty, open, ceiling, window, posture = 'flexible', reason, at = Math.round(g.arcade.time) }) {
  const a = g.arcade, market = rateNow(g, gpu), rate = Math.round(market * open), top = Math.round(market * ceiling);
  const id = `q${g.q}-scn-${key}`, budget = qty * top * HOURS_PER_MONTH * 3;
  a.buyers.unshift({ id, slot: 0, name, gpu, qty, filled: 0, rate, openingRate: rate, ceiling: top, budget, initialBudget: budget, at, until: Math.min(a.seconds, at + window), posture, flash: window < 20, premium: true, scenario: key,
    reason: reason || `${name}: funded ${qty}-GPU bid`, negotiation: { counters: 0, walked: false, tape: [{ speaker: name, text: 'Funded. Fast. Above the market. Your move.' }] } });
  S(g).buyers.push({ id, key, q: g.q });
  return id;
}

// ---- Eligibility ---------------------------------------------------------------------------------------------
const inRounds = (g, [lo, hi]) => g.q >= lo && g.q <= hi;
const credible = g => liveProducts(g.company).length >= 3 || g.company.racks.length >= 2 || g.world.strategic?.state === 'completed';
const productLeaning = g => { const n = l => g.company.builds.filter(b => b.lane === l).length; return n('product') >= 2 * n('research'); };
const runway = g => { const c = g.company, net = cashRevenueNow(c) - burnOf(c); return net >= 0 ? 99 : Math.floor(cashOf(g) / -net); };
const distressed = g => runway(g) <= 1 && (g.world.institutional?.moonshot?.outcome === 'setback' || S(g).anchor?.state === 'defaulted' || !!S(g).crisis || g.company.mods.burn.some(m => m.event === 'scn-settlement'));
const pendingB200Next = g => g.company.compute.flatMap(k => k.tranches).filter(d => d.status === 'pending' && d.q === g.q + 1);

const HANDLERS = {};
// Ordered: callbacks, majors, smalls. The first that passes its gate and its seeded roll fires.
const ORDER = ['buyout-return', 'crisis', 'buyout-forced', 'anchor', 'firesale', 'buyout', 'provider', 'capacity', 'talent', 'checkpoint'];

export function scenarioPlan(g) {
  const s = S(g); s.quietQ = 0; s.pending = null;
  if (!s.enabled || !SCENARIOS_ENABLED || g.q!==5) return;
  // Preserve the one core R5 shock; extension rounds follow existing commitments without repeating it.
  const key=HANDLERS.crisis.eligible(g) ? 'crisis' : 'checkpoint';
  s.pending={key}; s.quietQ=g.q;

}

// After worldOpen / strategicOpen / moonshotOpen: due commitments take their cards, the planned
// proposal opens.
export function scenarioOpen(g) {
  const s = S(g), a = g.arcade;
  for (const ch of s.chains) if (ch.state === 'active' && ch.due === g.q && !ch.card) {
    if (strategicBusy(g)) { ch.state = 'lapsed'; ch.reason = 'the opportunity desk was committed to a partnership'; continue; }
    spawnStage(g, ch);
  }
  for (const d of s.due.filter(d => d.q === g.q)) HANDLERS[d.key]?.due?.(g, d);
  s.due = s.due.filter(d => d.q > g.q);
  if (s.pending?.key) HANDLERS[s.pending.key]?.propose?.(g, s.pending);
  s.pending = null;
  return true;
}

export function scenarioTick(g) {
  for (const o of S(g)?.offers || []) if (o.state === 'open' && o.q === g.q && g.arcade.time >= o.until && g.arcade.confirm?.scenario !== o.id) expire(g, o);
}
function expire(g, o) { o.state = 'expired'; HANDLERS[o.key]?.lapse?.(g, o); }

// ---- The bell ---------------------------------------------------------------------------------------------------
// After integration (stage builds are online or delayed), before revenue: deliveries, misses,
// terminations and the dues that follow payroll.
export function scenarioBell(g) {
  atBell = true;
  try { return bellOf(g); } finally { atBell = false; }
}
function bellOf(g) {
  const s = S(g), a = g.arcade, q = g.q, out = { delivered: [], missed: [], dues: 0 };
  for (const o of s.offers) if (o.state === 'open' && o.q === q) expire(g, o);
  for (const ch of s.chains) {
    if (!['active', 'waiting'].includes(ch.state)) continue;
    const card = a.objectives.find(o => o.id === ch.card);
    const b = g.company.builds.find(b => b.card === ch.card);
    if (ch.state === 'waiting') { if (b?.online >= 1) deliver(g, ch, b, out); continue; }
    if (!card || ch.cardQ !== q) continue;
    if (card.deferred) continue;
    if (!b) { miss(g, ch, out); continue; }
    if (b.online < 1) { ch.state = 'waiting'; news(g, `${ch.key}-waiting`, `${ch.org}: ${ch.stages[ch.stage].name} is integrating. It counts at the next bell.`, { size: 'minor' }); continue; }
    deliver(g, ch, b, out);
  }
  for (const h of Object.values(HANDLERS)) h.bell?.(g, out);
  out.dues = s.dues.reduce((n, d) => n + d.amount, 0);
  return out;
}
function deliver(g, ch, b, out) {
  ch.history.push({ stage: ch.stage, build: b.id, q: roundOf(g) });
  ch.stage++; ch.card = null; out.delivered.push(ch.id);
  if (ch.stage >= ch.stages.length) { ch.state = 'completed'; ch.ended = roundOf(g); HANDLERS[ch.key]?.done?.(g, ch, b); }
  else { ch.state = 'active'; ch.due = roundOf(g) + 1; if (ch.due > campaignLimit(g)) { ch.state = 'ended'; ch.reason = 'the campaign ended before the next stage'; } else HANDLERS[ch.key]?.stage?.(g, ch, b); }
}
function miss(g, ch, out) {
  ch.state = ch.penalty || ch.terminates ? 'defaulted' : 'lapsed'; ch.ended = roundOf(g); ch.card = null; out.missed.push(ch.id);
  if (ch.terminates) lose(g, g.company.products.filter(p => ch.history.some(h => h.build === p.build)));
  if (ch.penalty) S(g).dues.push({ chain: ch.id, amount: ch.penalty, reason: `${ch.org}: ${ch.stages[ch.stage].name} missed` });
  HANDLERS[ch.key]?.miss?.(g, ch);
}
// Called by settle after payroll. Damages come out of what is left; the rest is next bell's burn.
export function payDues(g) {
  const s = S(g), total = s.dues.reduce((n, d) => n + d.amount, 0);
  if (!total) return { due: 0, paid: 0, carried: 0 };
  const paid = Math.min(total, cashOf(g)), carried = total - paid;
  g.cash = (cashOf(g) - paid) / 100; g.arcade.ledger.penalties += paid; s.cash.penalties += paid;
  if (carried) g.company.mods.burn.push({ delta: carried, left: 2, event: 'scn-settlement' });
  const lines = s.dues.map(d => d.reason); s.dues = [];
  return { due: total, paid, carried, lines };
}
export function endScenarios(g, ending) {
  const s = S(g); if (!s) return;
  for (const o of s.offers) if (o.state === 'open') o.state = 'expired';
  for (const ch of s.chains) if (['active', 'waiting'].includes(ch.state)) { ch.state = ending === 'acquired' ? 'assumed' : 'ended'; ch.ended = roundOf(g); }
  s.dues = []; s.due=[];
}

// ---- Choosing ---------------------------------------------------------------------------------------------------
export function scenarioOptions(g, o) {
  if (!o || !HANDLERS[o.key]) return [];
  return HANDLERS[o.key].options(g, o).map(x => ({ ...x, enabled: x.enabled !== false && offerLive(g, o) }));
}
// Returns true, false, or 'sale' (the caller ends the campaign through the arcade's finish).
export function chooseScenario(g, optionId) {
  const a = g.arcade, o = reviewedOffer(g);
  if (!o || a.signing || a.active || !offerLive(g, o)) return false;
  const opt = scenarioOptions(g, o).find(x => x.id === optionId);
  if (!opt || !opt.enabled) return false;
  const r = HANDLERS[o.key].choose(g, o, optionId);
  if (r === false) return false;
  if (r === 'stay' || o.state === 'walked') return true; // Keep the outcome visible until acknowledged.
  if (o.state === 'open') { o.state = opt.decline ? 'declined' : 'chosen'; o.choice = optionId; }
  a.confirm = null;
  return r === 'sale' ? 'sale' : true;
}

// =================================================================================================================
// M1 The Anchor Contract
// =================================================================================================================
function anchorTerms(g, exclusive) {
  const T = exclusive ? ANCHOR.exclusive : ANCHOR.open;
  const scope=Math.max(1,Math.min(12,Math.round(revenueNow(g.company)/15000000))), gpuScale=Math.sqrt(scope);
  return { exclusive, advance: T.advance*scope, damages: T.advance * scope * ANCHOR.damages, cure: Math.round(T.advance * scope * ANCHOR.cure), stages: ANCHOR.stages.map(st => ({ name: st.name, recipe: Object.fromEntries(Object.entries(st.recipe).map(([k,n])=>[k,Math.ceil(n*gpuScale)])), reward: { revenue: Math.round(st.revenue * scope * T.mult / 100) * 100 } })) };
}
HANDLERS.anchor = {
  eligible: g => inRounds(g, ANCHOR.rounds) && !S(g).anchor && !slotClaimed(g) && markOf(g) >= ANCHOR.minValue && credible(g) && !sovereignEligible(g),
  chance: g => Math.min(.95, ANCHOR.chance[g.q - ANCHOR.rounds[0]] + (g.company.shares.investors.some(i => i.name === 'Gideon Thorne') ? ANCHOR.investorBonus : 0)),
  propose(g) {
    const open = anchorTerms(g, false), excl = anchorTerms(g, true);
    S(g).anchor = { state: 'offered', offeredQ: g.q };
    propose(g, 'anchor', { cast: 'cirrostrata', kicker: 'PRIVATE · CONTRACT PROPOSAL', title: 'The Anchor Contract', premise: ANCHOR.premise, line: ANCHOR.line,
      terms: { open, exclusive: excl, schedule: open.stages.map((st, i) => ({ round: g.q + 1 + i, name: st.name, recipe: st.recipe, open: st.reward.revenue, exclusive: excl.stages[i].reward.revenue })) } });
    news(g, 'anchor-offer', 'Cirrostrata Cloud wants an anchor partner: three regions, three bells, and a lot of B200s.');
  },
  options(g, o) {
    const t = o.terms, sum = k => t.schedule.reduce((n, x) => n + x[k], 0), busy = moonshotActive(g) || g.world.institutional?.fund?.milestone === 'pending';
    return [
      { id: 'exclusive', label: `Sign exclusive · ${shortM(t.exclusive.advance)} now`, note: `+${shortM(sum('exclusive'))}/round base when live. Closes the Frontier Moonshot; Cirrostrata becomes your only buyer. Miss a region: terminated, −${shortM(t.exclusive.damages)}.`,
        enabled: !busy && scenarioSlotFree(g), reason: busy ? 'Your Frontier commitment needs an open lab.' : !scenarioSlotFree(g) ? 'The opportunity desk is committed.' : '', primary: true },
      { id: 'open', label: `Sign open terms · ${shortM(t.open.advance)} now`, note: `+${shortM(sum('open'))}/round base when live. Miss a region: terminated, −${shortM(t.open.damages)}.`, enabled: scenarioSlotFree(g), reason: scenarioSlotFree(g) ? '' : 'The opportunity desk is committed this round.' },
      { id: 'pass', label: 'Pass', note: 'Another provider is next on their list.', decline: true },
    ];
  },
  choose(g, o, id) {
    const s = S(g);
    if (id === 'pass') { s.anchor = { state: 'passed', offeredQ: o.q, endedQ: g.q }; anchorElsewhere(g, o.q); return true; }
    const t = structuredClone(id === 'exclusive' ? o.terms.exclusive : o.terms.open);
    payIn(g, t.advance);
    s.anchor = { state: 'active', exclusive: t.exclusive, offeredQ: o.q, signedQ: g.q, advance: t.advance, damages: t.damages };
    flag(g, 'anchor.signed'); if (t.exclusive) flag(g, 'anchor.exclusive');
    if (t.exclusive) { const m = g.world.institutional?.moonshot; if (m?.state === 'offered') { m.state = 'declined'; m.reason = 'Cirrostrata exclusivity'; } }
    const ch = startChain(g, { key: 'anchor', name: 'The Anchor Contract', org: CAST.cirrostrata.org, customer: CAST.cirrostrata.org, label: t.exclusive ? 'Exclusive' : 'Contract',
      stages: t.stages, due: o.terms.schedule[0].round, whole: true, terminates: true, penalty: t.damages, cure: t.cure, contract: true, blurb: 'Deliver the region by its bell.' });
    s.anchor.chain = ch.id;
    news(g, 'anchor-signed', `Cirrostrata signed: ${money(t.advance)} advance. First delivery R${ch.due}.`, { tone: 'good' });
    return true;
  },
  lapse(g, o) { if (o.key === 'anchor' && S(g).anchor?.state === 'offered') { S(g).anchor = { state: 'passed', offeredQ: o.q, endedQ: g.q }; anchorElsewhere(g, o.q); } },
  stage(g, ch) { if (ch.key === 'anchor') news(g, 'anchor-stage', `Cirrostrata: region delivered. ${ch.stages[ch.stage].name} (${recipeText(ch.stages[ch.stage].recipe)}) is due at the R${ch.due} bell.`, { tone: 'good' }); },
  done(g, ch) {
    if (ch.key === 'second-call') { flag(g, 'anchor.rescued'); news(g, 'second-call-done', 'Cirrostrata’s rescue region is live. They called you second; you delivered first.', { tone: 'good' }); return; }
    if (ch.key !== 'anchor') return;
    S(g).anchor.state = 'completed'; S(g).anchor.completedQ = roundOf(g); flag(g, 'anchor.completed');
    if (!g.world.exitMods.some(x => x.mod === 'anchor')) g.world.exitMods.push({ mod: 'anchor', mult: ANCHOR.exitPremium, event: 'scn-anchor' });
    news(g, 'anchor-complete', 'Cirrostrata’s global rollout is live on your cluster. Corporate development has started asking questions.', { tone: 'good' });
    if (roundOf(g) + 1 <= BUYOUT.callbacks[1]) S(g).due.push({ key: 'buyout-forced', q: roundOf(g) + 1, suitor: 'cirrostrata' });
  },
  miss(g, ch) {
    if (ch.key === 'second-call') return;
    if (ch.key !== 'anchor') return;
    S(g).anchor.state = 'defaulted'; S(g).anchor.defaultedQ = roundOf(g); flag(g, 'anchor.defaulted');
    news(g, 'anchor-default', `Cirrostrata terminates the contract. Every Cirrostrata region goes dark; ${money(ch.penalty)} in damages are due after payroll.`, { tone: 'bad' });
    anchorElsewhere(g, roundOf(g));
  },
};
// The contract does not disappear: another provider signs it, and may miss region two. Then
// Cirrostrata calls you back (no named rival, no buyout: V10.17.3).
function anchorElsewhere(g, q) {
  news(g, 'anchor-elsewhere', 'Cirrostrata signs another provider for its three regions.', { size: 'minor' });
  const call = q + ANCHOR.secondCall.after;
  if (call > campaignLimit(g)) return;
  if (stream(g.seed, 'v113-scn', 'second-call', q).next() < ANCHOR.secondCall.chance) S(g).due.push({ key: 'second-call', q: call });
}
HANDLERS['second-call'] = {
  eligible: () => false, chance: () => 0,
  due(g) {
    const s = S(g); if (!scenarioSlotFree(g) || s.anchor?.state === 'defaulted') return;
    const st = ANCHOR.secondCall.stage;
    startChain(g, { key: 'second-call', name: 'The Second Call', org: CAST.cirrostrata.org, customer: CAST.cirrostrata.org, label: 'Rescue contract',
      stages: [{ name: st.name, recipe: { ...st.recipe }, reward: { revenue: st.revenue } }], whole: true, contract: true, blurb: 'Their provider missed region two. No advance, no damages: just deliver.' });
    news(g, 'second-call', 'Cirrostrata’s other provider missed region two. Dana Whitcombe calls you back: “Can you take it by the bell?”', { tone: 'good' });
  },
  options: () => [], choose: () => false,
  done: (...x) => HANDLERS.anchor.done(...x), miss: () => {},
};

// =================================================================================================================
// M2 The Fire Sale: a failing neocloud's hall and team (standalone since V10.17.3)
// =================================================================================================================
const fireSaleTerms = g => {
  const F = FIRESALE, k = F.scale[g.company.scale || 1] || 1, times = r => Object.fromEntries(Object.entries(r).map(([gpu, n]) => [gpu, n * k]));
  return { k, hall: { capex: F.hall.capex * k, recipe: times(F.hall.recipe), rack: { gpu: F.hall.rack.gpu, qty: F.hall.rack.qty * k } },
    tenant: { recipe: times(F.tenant.recipe), penalty: F.tenant.penalty * k }, team: { ...F.team } };
};
HANDLERS.firesale = {
  eligible: g => inRounds(g, FIRESALE.rounds) && !S(g).firesale && markOf(g) >= FIRESALE.minValue && !slotClaimed(g),
  chance: () => FIRESALE.chance,
  propose(g) {
    S(g).firesale = { state: 'offered', q: g.q };
    propose(g, 'firesale', { cast: 'estate', kicker: 'PRIVATE · DISTRESSED SALE', title: 'The Fire Sale', premise: FIRESALE.premise, line: FIRESALE.line, terms: fireSaleTerms(g) });
    news(g, 'firesale', 'A neocloud that bought too fast collapses. Its data hall is on the block by lunchtime.', { tone: 'plain' });
  },
  options(g, o) {
    const t = o.terms, slot = scenarioSlotFree(g), cash = cashOf(g);
    return [
      { id: 'hall', label: `Buy the hall · ${shortM(t.hall.capex)} + ${recipeText(t.hall.recipe)}`, note: `+${t.hall.rack.qty} ${t.hall.rack.gpu} every round. Comes with their tenant: ${recipeText(t.tenant.recipe)} due next bell (paid at cost), or −${shortM(t.tenant.penalty)}.`,
        enabled: slot, reason: slot ? '' : 'The opportunity desk is committed this round.', primary: true },
      { id: 'team', label: `Hire their team · ${shortM(t.team.capex)}`, note: `+${Math.round(t.team.breakthrough * 100)}pp on your next training run (+${Math.round(t.team.legendary * 100)}pp legendary on a Moonshot). ${shortM(t.team.burn)}/round salary for the rest of the game.`,
        enabled: cash >= t.team.capex && !g.company.researchClosed, reason: g.company.researchClosed ? 'Your lab is closed.' : cash >= t.team.capex ? '' : `Needs ${shortM(t.team.capex)} cash.` },
      { id: 'pass', label: 'Let Tessellate have it', note: 'No cost. No hall.', decline: true },
    ];
  },
  choose(g, o, id) {
    const t = o.terms, f = S(g).firesale; f.state = 'decided'; f.choice = id;
    if (id === 'hall') {
      const ch = startChain(g, { key: 'hall', name: 'Distressed data hall', org: CAST.estate.org, label: 'Distressed asset',
        stages: [{ name: 'Commission the distressed hall', recipe: { ...t.hall.recipe }, reward: { rack: { ...t.hall.rack } }, cashCost: t.hall.capex }], blurb: 'Pay the estate, bring the commissioning GPUs, own the power.' });
      f.hallChain = ch.id; f.tenant = t.tenant;
    }
    if (id === 'team') {
      if (!capex(g, t.team.capex)) return false;
      burnFor(g, t.team.burn, campaignLimit(g) + 1 - g.q, 'estate-team');
      arm(g, { breakthrough: t.team.breakthrough, legendary: t.team.legendary, source: 'the neocloud team' });
      f.team = true; flag(g, 'firesale.team');
      news(g, 'firesale-team', 'The failed neocloud’s engineers join your lab. They bring their own cable ties.', { size: 'minor', tone: 'good' });
    }
    return true;
  },
  lapse(g, o) { if (o.key === 'firesale' && S(g).firesale?.state === 'offered') { S(g).firesale.state = 'decided'; S(g).firesale.choice = 'pass'; } },
};
HANDLERS.hall = {
  eligible: () => false, chance: () => 0, options: () => [], choose: () => false,
  done(g, ch) {
    if (ch.key !== 'hall') return;
    const f = S(g).firesale; f.hall = true; flag(g, 'firesale.hall');
    news(g, 'hall-bought', 'The hall is yours. Its tenant, Hearth AI, expects its H200s next round.', { tone: 'good' });
    const q = roundOf(g) + 1, T = f.tenant || FIRESALE.tenant;
    if (q <= campaignLimit(g)) startChain(g, { key: 'tenant', name: 'Hearth AI tenancy', org: 'Hearth AI', label: 'Inherited contract', due: q,
      stages: [{ name: 'Hearth AI tenancy (inherited)', recipe: { ...T.recipe }, reward: { cash: prizeOf(g, T.recipe, 1) } }], penalty: T.penalty, blurb: 'You bought the liabilities too. Paid at cost; miss it and pay damages.' });
  },
};
HANDLERS.tenant = { eligible: () => false, chance: () => 0, options: () => [], choose: () => false,
  miss(g, ch) { if (ch.key === 'tenant') news(g, 'tenant-missed', `Hearth AI’s capacity went undelivered: ${money(ch.penalty)} in damages.`, { tone: 'bad', size: 'minor' }); } };

// =================================================================================================================
// M3 The Buyout
// =================================================================================================================
function buyoutPrice(g, suitor) {
  // V10.17.3: suitors price the components they want (contracts, research IP, racks) on top of the company's value.
  const c = g.company, cash = cashOf(g), v = valuation(c), ev = v.total, F = BUYOUT.forward[g.q] || 1, U = BUYOUT.suitors;
  if (suitor === 'lastlight') return round10k(U.lastlight.mark * (cash + ev));
  let x = ev;
  if (suitor === 'cirrostrata') {
    // Cirrostrata values its own contract at the full product multiple (it is buying its supplier),
    // plus a premium on the share of your revenue it already depends on.
    const own = customerProducts(g, CAST.cirrostrata.org), base = own.reduce((n, p) => n + Math.round(p.revenue * p.online), 0), share = base / Math.max(1, revenueOf(c));
    const discount = own.filter(p => p.contract).reduce((n, p) => n + Math.round(p.revenue * p.online), 0) * quality(c) * (1 - FOUNDER.contractMultiple) * 4 * FOUNDER.value.product;
    x = (ev + discount) * (1 + U.cirrostrata.anchorPremium * share);
  }
  if (suitor === 'tessellate') {
    const m = g.world.institutional?.moonshot;
    x = ev + U.tessellate.techPremium * v.research;
    if (m && ['cluster', 'cluster-integrating', 'training', 'training-integrating'].includes(m.state)) {
      const legendaryEV = 4 * MOONSHOT.legendaryRevenue * (1 + FOUNDER.quality * 5) * FOUNDER.value.product;
      x += U.tessellate.moonshotShare * moonshotOdds(g).legendary * legendaryEV / F;
    }
  }
  if (suitor === 'ironbridge') { const racks = c.racks.reduce((n, k) => n + Math.floor(k.qty * k.online) * FOUNDER.unit[k.gpu], 0); x = ev + racks * Math.max(0, U.ironbridge.rackRounds - FOUNDER.rackYears); }
  return round10k(cash + x * F);
}
function suitorFor(g) {
  const c = g.company, s = S(g), m = g.world.institutional?.moonshot;
  if (anchorExclusive(g)) return 'cirrostrata';
  const fits = [];
  if (s.anchor?.state === 'completed' || liveProducts(c).length >= 8 && revenueNow(c) >= 15000000) fits.push('cirrostrata');
  if (c.level >= 4 || c.breakthroughs >= 2 || ['training', 'training-integrating', 'cluster-integrating'].includes(m?.state) || ['legendary', 'useful'].includes(m?.outcome)) fits.push('tessellate');
  if (c.racks.length >= 4 || focusOf(c) === 'AI cloud') fits.push('ironbridge');
  if (!fits.length && liveProducts(c).length >= 4) fits.push('cirrostrata');
  if (!fits.length) return null;
  return fits.map(x => [x, buyoutPrice(g, x)]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}
function offerBuyout(g, suitor, why = 'fresh') {
  const s = S(g), price = buyoutPrice(g, suitor), pct = founderPct(g.company), mark = markOf(g);
  s.buyout ||= { offers: 0 };
  s.buyout.offers++; s.buyout.suitor = suitor; s.buyout.lastQ = g.q; s.buyout.lastMark = mark; s.buyout.why = why;
  const room = suitor === 'lastlight' ? 0 : stream(g.seed, 'v113-scn', 'buyout-room', g.q).range(...BUYOUT.room);
  const U = BUYOUT.suitors[suitor];
  propose(g, 'buyout', { cast: suitor, suitor, kicker: suitor === 'lastlight' ? 'PRIVATE · RESCUE OFFER' : 'PRIVATE · LETTER OF INTENT', title: `${CAST[suitor].org} wants to buy ${g.company.name}`,
    premise: suitor === 'lastlight' ? 'A distressed buyer will take the company today, payroll and all.' : why === 'return' ? 'They passed on your no. Your numbers changed their mind.' : 'An offer for the whole company, today. Say yes and the campaign ends here.',
    line: U.line, terms: { price, opening: price, mark, pct, room: Math.round(room * 1000) / 1000, countered: false, response: null } });
  flag(g, `buyout.offered.${suitor}`);
  news(g, 'buyout-offer', `${CAST[suitor].org} sends a letter of intent: ${shortM(price)} for the company.`, { tone: suitor === 'lastlight' ? 'bad' : 'good' });
}
HANDLERS.buyout = {
  eligible: g => { const s = S(g); if (!inRounds(g, BUYOUT.rounds) || s.buyout?.offers) return false; return distressed(g) && !anchorExclusive(g) || markOf(g) >= BUYOUT.minValue && !!suitorFor(g); },
  chance: g => distressed(g) ? .7 : BUYOUT.chance,
  propose(g) { offerBuyout(g, distressed(g) && !anchorExclusive(g) ? 'lastlight' : suitorFor(g)); },
  options(g, o) {
    const t = o.terms, pct = founderPct(g.company), payout = Math.floor(pct * t.price), x = t.price / Math.max(1, markOf(g));
    const opts = [{ id: 'sell', label: `Sell the company · ${shortM(payout)} to you`, note: `${shortM(t.price)} for 100% (${x.toFixed(1)}× today’s ${shortM(markOf(g))} mark). The campaign ends now; the buyer assumes every contract.`, primary: true }];
    if (!t.countered && o.suitor !== 'lastlight') opts.push({ id: 'counter', label: `Counter at ${shortM(Math.round(t.price * (1 + BUYOUT.counter) / 1000000) * 1000000)}`, note: 'One counter. They may agree, meet you partway, or walk.' });
    opts.push({ id: 'decline', label: 'Decline', note: o.suitor === 'lastlight' ? 'Find the runway yourself.' : 'Keep building. They may come back if you outgrow this price.', decline: true });
    return opts;
  },
  choose(g, o, id) {
    const s = S(g), t = o.terms;
    if (id === 'counter') {
      t.countered = true; const ask = Math.round(t.price * (1 + BUYOUT.counter) / 1000000) * 1000000;
      if (t.room >= BUYOUT.counter) { t.price = ask; t.response = 'accept'; o.log.push({ speaker: CAST[o.suitor].who, text: `Fine. ${shortM(ask)}. Sign today.` }); }
      else if (t.room >= BUYOUT.meet) { t.price = Math.round(t.price * (1 + t.room) / 1000000) * 1000000; t.response = 'meet'; o.log.push({ speaker: CAST[o.suitor].who, text: `We can do ${shortM(t.price)}. That is the number.` }); }
      else { t.response = 'walk'; o.state = 'walked'; o.choice = 'counter'; s.buyout.walked = true; o.log.push({ speaker: CAST[o.suitor].who, text: 'We were clear about our price. Good luck.' }); news(g, 'buyout-walk', `${CAST[o.suitor].org} walks away from the table.`, { size: 'minor' }); return true; }
      return 'stay';
    }
    if (id === 'decline') {
      s.buyout.declinedQ = g.q; flag(g, 'buyout.declined'); flag(g, `buyout.declined.${o.suitor}`);
      if (o.suitor !== 'lastlight' && g.q + BUYOUT.returnAfter <= BUYOUT.callbacks[1] && !s.buyout.returned) s.due.push({ key: 'buyout-return', q: g.q + BUYOUT.returnAfter, suitor: o.suitor, mark: markOf(g) });
      return true;
    }
    // Sell: the arcade ends the campaign with this exact price and the founder's actual stake.
    s.sale = { suitor: o.suitor, org: CAST[o.suitor].org, price: t.price, q: g.q, offer: o.id, moonshot: moonshotActive(g) };
    flag(g, `sale.${o.suitor}`); if (s.sale.moonshot) flag(g, 'sale.moonshot');
    return 'sale';
  },
  lapse(g, o) { if (o.key === 'buyout') S(g).buyout.declinedQ = o.q; },
};
HANDLERS['buyout-return'] = {
  dueKey: 'buyout-return',
  eligible: g => { const d = dueNow(g, 'buyout-return'); return !!d && (S(g).buyout?.offers || 0) < 2 && markOf(g) >= BUYOUT.returnGrowth * d.mark && !anchorExclusive(g); },
  chance: () => 1,
  propose(g, p) { S(g).buyout.returned = true; offerBuyout(g, p.due.suitor, 'return'); },
};
// Callback: Cirrostrata after a completed rollout.
HANDLERS['buyout-forced'] = {
  dueKey: 'buyout-forced',
  eligible: g => { const d = dueNow(g, 'buyout-forced'); return !!d && (S(g).buyout?.offers || 0) < 2 && markOf(g) >= BUYOUT.minValue / 2 && (d.suitor === 'cirrostrata' || !anchorExclusive(g)); },
  chance: () => 1,
  propose(g, p) { offerBuyout(g, p.due.suitor, 'forced'); },
};

// Settled sale: the exit record (founder % × agreed price; company cash is inside the price).
export function saleOutcome(g) {
  const s = S(g).sale, c = g.company, cash = cashOf(g), pct = founderPct(c), v = valuation(c), ev = v.total;
  return { kind: 'acquired', title: `Acquired by ${s.org}`, suitor: s.suitor, round: s.q, price: s.price, market: 1, baseMarket: 1, ev, parts: { products: v.products, research: v.research, infra: v.infra, contracts: v.contracts }, evx: Math.max(0, s.price - cash), cash, equity: s.price,
    founderPct: pct, payout: Math.floor(pct * s.price), realized: Math.floor(pct * s.price), retained: 0, remainingOwnership: 0, mark: false, unicorn: s.price >= FOUNDER.exitBands.unicorn, legendary: false };
}

// =================================================================================================================
// Small scenarios
// =================================================================================================================
HANDLERS.crisis = {
  eligible: g => { if (!inRounds(g, CRISIS.rounds) || S(g).crisis) return false; const x = concentration(g.company); return x.share >= CRISIS.share && x.revenue >= CRISIS.minRevenue && !S(g).chains.some(ch => ch.customer === x.customer && ['active', 'waiting'].includes(ch.state)); },
  chance: g => Math.min(CRISIS.cap, CRISIS.base + CRISIS.slope * concentration(g.company).share),
  propose(g) {
    const x = concentration(g.company), c = g.company, ps = customerProducts(g, x.customer);
    const builds = ps.map(p => c.builds.find(b => b.id === p.build)).filter(Boolean);
    const gpus = {}; for (const b of builds) for (const k of GPUS) if (b.recipe[k]) gpus[k] = (gpus[k] || 0) + b.recipe[k];
    const total = GPUS.reduce((n, k) => n + (gpus[k] || 0), 0), scale = Math.min(1, CRISIS.redeploy.cap / Math.max(1, total * CRISIS.redeploy.gpus));
    const recipe = {}; for (const k of GPUS) if (gpus[k]) recipe[k] = Math.max(1, Math.ceil(gpus[k] * CRISIS.redeploy.gpus * scale));
    if (!Object.keys(recipe).length) recipe.H100 = 2;
    const base = ps.reduce((n, p) => n + Math.round(p.revenue * p.online), 0);
    S(g).crisis = { q: g.q, customer: x.customer, share: Math.round(x.share * 1000) / 1000 };
    const who = Object.values(CAST).find(k => k.org === x.customer) || { org: x.customer, who: x.customer, role: 'Customer' };
    propose(g, 'crisis', { cast: Object.keys(CAST).find(k => CAST[k].org === x.customer) || null, castName: who.who, castOrg: who.org, kicker: 'CUSTOMER CRISIS', title: `${x.customer} wants out`,
      premise: `${x.customer} is ${Math.round(x.share * 100)}% of your revenue. Its budget just collapsed.`, line: CRISIS.lines[x.customer] || CRISIS.lines.default,
      terms: { customer: x.customer, share: x.share, base, now: Math.round(base * quality(c)), recipe, redeploy: Math.round(base * CRISIS.redeploy.revenue), settlement: Math.round(base * quality(c) * CRISIS.settle) } });
    news(g, 'crisis', `${x.customer} calls an emergency meeting about your contract.`, { tone: 'bad' });
  },
  options(g, o) {
    const t = o.terms, slot = scenarioSlotFree(g);
    return [
      { id: 'discount', label: 'Keep them at a discount', note: `Their revenue −${Math.round((1 - CRISIS.discount) * 100)}% for good (about −${shortM(Math.round(t.now * (1 - CRISIS.discount)))}/round).`, primary: true },
      { id: 'redeploy', label: `Let them go, redeploy · ${recipeText(t.recipe)}`, note: `Lose them. Rebuild for new customers this round: +${shortM(t.redeploy)}/round base.`, enabled: slot, reason: slot ? '' : 'The opportunity desk is committed this round.' },
      { id: 'enforce', label: `Enforce the contract · ${shortM(t.settlement)}`, note: 'Lose them, collect a settlement now. Investors flinch for two rounds; they never come back.', decline: false },
    ];
  },
  choose(g, o, id) {
    const t = o.terms, ps = customerProducts(g, t.customer), s = S(g);
    s.crisis.choice = id; flag(g, `crisis.${id}`);
    if (id === 'discount') { for (const p of ps) p.revenue = Math.round(p.revenue * CRISIS.discount); news(g, 'crisis-discount', `${t.customer} stays, at a discount.`, { size: 'minor' }); return true; }
    lose(g, ps);
    if (t.customer === CAST.cirrostrata.org && s.anchor) { s.anchor.state = 'settled'; flag(g, 'anchor.settled'); }
    if (id === 'redeploy') startChain(g, { key: 'redeploy', name: `Redeploy ${t.customer}’s capacity`, org: 'New customers', label: 'Recovery',
      stages: [{ name: 'Redeploy the capacity', recipe: { ...t.recipe }, reward: { revenue: t.redeploy } }], blurb: 'New customers, if you can rebuild before the bell.' });
    if (id === 'enforce') { payIn(g, t.settlement); g.world.sentiment.push({ delta: CRISIS.sentiment, left: 2, event: 'scn-crisis' }); flag(g, `crisis.enforced.${t.customer}`); }
    news(g, `crisis-${id}`, `${t.customer} is gone.${id === 'enforce' ? ` Settlement ${money(t.settlement)} received.` : ''}`, { size: 'minor', tone: 'bad' });
    return true;
  },
};
HANDLERS.redeploy = { eligible: () => false, chance: () => 0, options: () => [], choose: () => false };
// Ignoring the call is a choice too: the customer renegotiates without you.
HANDLERS.crisis.lapse = (g, o) => {
  if (o.key !== 'crisis' || S(g).crisis.choice) return;
  S(g).crisis.choice = 'ignored'; flag(g, 'crisis.ignored');
  for (const p of customerProducts(g, o.terms.customer)) p.revenue = Math.round(p.revenue * CRISIS.discount);
  news(g, 'crisis-ignored', `${o.terms.customer} did not wait for an answer: it cut your contract by ${Math.round((1 - CRISIS.discount) * 100)}%.`, { size: 'minor', tone: 'bad' });
};

HANDLERS.capacity = {
  eligible: g => inRounds(g, CAPACITY.rounds) && !S(g).capacity && !anchorExclusive(g) && (pendingB200Next(g).filter(d => d.gpu === 'B200').reduce((n, d) => n + d.qty, 0) >= CAPACITY.minTranche || freeOf(g, 'B200') >= CAPACITY.minFree),
  chance: () => CAPACITY.chance,
  propose(g) {
    const next = pendingB200Next(g), value = next.reduce((n, d) => n + d.qty * d.unitCost, 0);
    S(g).capacity = { q: g.q };
    propose(g, 'capacity', { cast: 'tessellate', kicker: 'PRIVATE · CAPACITY DESK', title: 'Tessellate wants your allocation', premise: 'A frontier lab short of B200s will pay for certainty: now, or for next round’s delivery.', line: CAPACITY.line,
      terms: { tranches: next.map(d => d.id), units: next.map(d => `${d.qty} ${d.gpu}`).join(' + '), value, forward: Math.round(value * CAPACITY.forward), qty: Math.min(CAPACITY.buyer.qty, freeOf(g, 'B200')) } });
    news(g, 'capacity', 'Tessellate Labs is buying B200 allocations at a premium. Including ones you have not received yet.', { size: 'minor' });
  },
  options(g, o) {
    const t = o.terms, excl = anchorExclusive(g), free = freeOf(g, 'B200');
    return [
      { id: 'forward', label: t.tranches.length ? `Sell next round’s delivery · ${shortM(t.forward)}` : 'No delivery due next round', note: t.tranches.length ? `${t.units} due R${g.q + 1} are cancelled for cash now (${Math.round((CAPACITY.forward - 1) * 100)}% over contract value).` : 'Only contracted compute can be sold forward.',
        enabled: !!t.tranches.length && !excl, reason: excl ? 'Cirrostrata exclusivity: no capacity sales to its rivals.' : '', primary: !!t.tranches.length },
      { id: 'sell', label: `Sell B200s now · up to ${Math.min(t.qty, free)}`, note: `A funded Tessellate bid at 1.3× market, room to 1.7×, for ${CAPACITY.buyer.window} seconds.`, enabled: free >= 4 && !excl, reason: excl ? 'Cirrostrata exclusivity: no capacity sales to its rivals.' : free >= 4 ? '' : 'Needs 4 free B200.' },
      { id: 'keep', label: 'Keep the capacity', note: 'Your B200s, your plans.', decline: true },
    ];
  },
  choose(g, o, id) {
    const t = o.terms;
    if (id === 'forward') {
      const ds = g.company.compute.flatMap(k => k.tranches).filter(d => t.tranches.includes(d.id) && d.status === 'pending');
      if (!ds.length) return false;
      for (const d of ds) { d.status = 'sold'; d.soldQ = g.q; }
      payIn(g, Math.round(ds.reduce((n, d) => n + d.qty * d.unitCost, 0) * CAPACITY.forward));
      flag(g, 'capacity.forward');
      news(g, 'capacity-forward', `Next round’s ${t.units} now belong to Tessellate. Cash received.`, { size: 'minor', tone: 'good' });
    }
    if (id === 'sell') addBuyer(g, 'tessellate', { name: CAST.tessellate.org, gpu: 'B200', qty: Math.min(t.qty, freeOf(g, 'B200')), open: CAPACITY.buyer.open, ceiling: CAPACITY.buyer.ceiling, window: CAPACITY.buyer.window, reason: 'Tessellate: launch capacity at a premium' });
    return true;
  },
};

HANDLERS.talent = {
  eligible: g => {
    const f = g.world.flags, c = g.company;
    if (S(g).talent || c.researchClosed || c.level >= 5) return false;
    if (f.engineerHired) return inRounds(g, TALENT.mara.rounds) && !!f.engineerUsed && ['solid', 'breakthrough'].includes(f.engineerResult);
    return inRounds(g, TALENT.okafor.rounds) && c.builds.filter(b => b.lane === 'research').length >= 2 && c.level >= 2;
  },
  chance: g => g.world.flags.engineerHired ? .7 : .45,
  propose(g) {
    const mara = !!g.world.flags.engineerHired, T = mara ? TALENT.mara : TALENT.okafor;
    S(g).talent = { q: g.q, who: mara ? 'mara' : 'okafor' };
    propose(g, 'talent', { cast: mara ? 'mara' : 'okafor', kicker: 'TALENT WAR', title: mara ? 'A rival wants Mara Vale' : 'The Okafor team is free', premise: mara ? 'Your best engineer has a triple offer from a rival lab.' : 'Four frontier researchers just walked out of Tessellate. Everyone is calling them.',
      line: T.line, terms: { mara, ...T } });
    news(g, 'talent', mara ? 'A rival lab makes Mara Vale an offer that is mostly zeros.' : 'Dr. Ines Okafor’s team leaves Tessellate Labs.', { size: 'minor' });
  },
  options(g, o) {
    const t = o.terms, left = campaignLimit(g) + 1 - g.q;
    if (t.mara) return [
      { id: 'match', label: `Match it · ${shortM(t.burn)}/round`, note: `Salary through R5 (${plural(left, 'bell')}). Her bonus re-arms: +${Math.round(t.breakthrough * 100)}pp breakthrough on your next run, +${Math.round(t.legendary * 100)}pp legendary on a Moonshot.`, primary: true },
      { id: 'equity', label: `Give her ${t.equityBps / 100}% equity`, note: `No cash. Next run: +${Math.round(t.breakthrough * 100)}pp breakthrough, +${Math.round(t.setback * 100)}pp setback. Moonshot: +${Math.round(t.legendary * 100)}pp legendary.` },
      { id: 'release', label: 'Let her go', note: 'She takes the offer. Your odds return to normal.', decline: true },
    ];
    return [
      { id: 'cash', label: `Hire them · ${shortM(t.capex)} + ${shortM(t.burn)}/round`, note: `Three rounds of salary. +${Math.round(t.breakthrough * 100)}pp breakthrough, ${Math.round(t.setback * 100)}pp setback on your next run; +${Math.round(t.legendary * 100)}pp legendary on a Moonshot; level 2 labs become Moonshot-ready.`, enabled: cashOf(g) >= t.capex, reason: cashOf(g) >= t.capex ? '' : `Needs ${shortM(t.capex)} cash.`, primary: true },
      { id: 'equity', label: `Hire for ${t.equityBps / 100}% equity`, note: `${shortM(t.equityBurn)}/round for three rounds. Next run: +${Math.round(t.breakthrough * 100)}pp breakthrough, ${Math.round(t.setback * 100)}pp setback. Moonshot: +${Math.round(t.legendary * 100)}pp legendary; level 2 labs qualify.` },
      { id: 'pass', label: 'Pass', note: 'Tessellate will probably rehire them.', decline: true },
    ];
  },
  choose(g, o, id) {
    const t = o.terms, s = S(g); s.talent.choice = id;
    if (t.mara) {
      if (id === 'release') { flag(g, 'talent.mara-left'); news(g, 'mara-left', 'Mara Vale takes the offer. She takes her coffee mug.', { size: 'minor' }); return true; }
      if (id === 'match') burnFor(g, t.burn, campaignLimit(g) + 1 - g.q, 'mara');
      if (id === 'equity') grant(g, 'Mara Vale', t.equityBps);
      arm(g, { breakthrough: t.breakthrough, setback: t.setback, legendary: t.legendary, source: 'Mara Vale' });
      flag(g, 'talent.mara-stays'); return true;
    }
    if (id === 'pass') return true;
    if (id === 'cash') { if (!capex(g, t.capex)) return false; burnFor(g, t.burn, t.rounds3, 'okafor'); }
    if (id === 'equity') { grant(g, 'The Okafor team', t.equityBps); burnFor(g, t.equityBurn, t.rounds3, 'okafor'); }
    arm(g, { breakthrough: t.breakthrough, setback: t.setback, legendary: t.legendary, frontier: true, source: 'the Okafor team' });
    flag(g, 'talent.okafor'); return true;
  },
};

HANDLERS.provider = {
  eligible: g => { const c = g.company, m = g.world.institutional?.moonshot;
    return inRounds(g, PROVIDER.rounds) && !S(g).provider && !c.researchClosed && liveProducts(c).length >= PROVIDER.minProducts && c.level >= 2 && c.level <= 4 && productLeaning(g) && !moonshotActive(g) && !['legendary', 'useful'].includes(m?.outcome) && !slotClaimed(g); },
  chance: () => PROVIDER.chance,
  propose(g) {
    const f = g.world.flags, who = f['delivered.whale-evaluation'] || f['delivered.whale-rollout'] ? 'northline' : 'orbit';
    S(g).provider = { q: g.q, who };
    propose(g, 'provider', { cast: who, kicker: 'PRIVATE · STRATEGIC OFFER', title: 'Become our inference arm', premise: `${CAST[who].org} wants a dedicated provider. It wants you to stop training frontier models to do it.`, line: PROVIDER.line,
      terms: providerTerms(g, who) });
    news(g, 'provider', `${CAST[who].org} asks you to shut your lab and run its inference.`, { size: 'minor' });
  },
  options(g, o) {
    const t = o.terms, slot = scenarioSlotFree(g), mandate = g.world.institutional?.fund?.milestone === 'pending';
    return [
      { id: 'full', label: `Close lab forever · ${shortM(t.full.advance)} now`, note: `${recipeText(t.full.recipe)} · Due R${t.due}. +${shortM(t.full.revenue)}/round base if delivered. Miss: no revenue; lab stays closed. Existing salaries continue.`, enabled: slot && !mandate, reason: mandate ? 'Your Aster mandate needs an open lab.' : slot ? '' : 'The opportunity desk is committed.', primary: true },
      { id: 'small', label: `Smaller deal · ${recipeText(t.small.recipe)}`, note: `Due R${t.due}. +${shortM(t.small.revenue)}/round base if delivered. Lab stays open.`, enabled: slot, reason: slot ? '' : 'The opportunity desk is committed.' },
      { id: 'decline', label: 'Decline', note: 'You are building a lab, not a utility.', decline: true },
    ];
  },
  choose(g, o, id) {
    const t = o.terms, org = CAST[t.who].org, a = g.arcade, c = g.company;
    if (id === 'decline') return true;
    if (id === 'full') {
      c.researchClosed = true; flag(g, 'provider.full');
      payIn(g, t.full.advance);
      const research = new Set(a.objectives.filter(x => x.lane === 'research' && x.status === 'open').map(x => x.id));
      a.reservations = a.reservations.filter(r => !research.has(r.card)); a.objectives = a.objectives.filter(x => !research.has(x.id));
      const m = g.world.institutional?.moonshot; if (m?.state === 'offered') { m.state = 'declined'; m.reason = 'research closed'; }
      news(g, 'provider-full', `${c.name} closes its research lab to become ${org}’s inference arm.`, { tone: 'plain' });
    } else flag(g, 'provider.small');
    const spec = t[id];
    startChain(g, { key: 'provider-fleet', name: `${org} dedicated fleet`, org, customer: org, label: 'Dedicated provider', due: t.due,
      stages: [{ name: `${org} dedicated fleet`, recipe: { ...spec.recipe }, reward: { revenue: spec.revenue } }], contract: true, blurb: id === 'full' ? 'The lab is closed. Make this the best inference fleet in the city.' : 'A dedicated fleet; your lab stays open.' });
    return true;
  },
};
function providerTerms(g, who) {
  const k = PROVIDER.scale[g.company.scale || 1], fleet = r => Object.fromEntries(Object.entries(r).map(([gpu, n]) => [gpu, n * k.fleet]));
  return { who, due: g.q + 1, full: { recipe: fleet(PROVIDER.full.recipe), revenue: Math.round(PROVIDER.full.revenue * k.revenue), advance: Math.round(PROVIDER.full.advance * k.advance) },
    small: { recipe: fleet(PROVIDER.small.recipe), revenue: PROVIDER.small.revenue * k.fleet } };
}
HANDLERS['provider-fleet'] = { eligible: () => false, chance: () => 0, options: () => [], choose: () => false };

HANDLERS.checkpoint = {
  eligible: g => inRounds(g, CHECKPOINT.rounds) && !S(g).checkpoint && liveProducts(g.company).length >= CHECKPOINT.minProducts && !slotClaimed(g),
  chance: () => CHECKPOINT.chance,
  propose(g) {
    const K = CHECKPOINT; S(g).checkpoint = { q: g.q };
    propose(g, 'checkpoint', { cast: 'tensorbay', kicker: 'INCIDENT · MODEL HUB', title: 'The Checkpoint Takedown', premise: 'Polyglot-34B vanished from Tensorbay. Thousands of customers need a working model by lunch.', line: K.line,
      terms: { rescue: { recipe: { ...K.rescue.recipe }, cash: prizeOf(g, K.rescue.recipe, K.rescue.prize), window: K.rescue.window }, mirror: { ...K.mirror, recipe: { ...K.mirror.recipe } }, clean: { ...K.clean, recipe: { ...K.clean.recipe } } } });
    news(g, 'checkpoint', CHECKPOINT.headline, { size: 'minor' });
  },
  options(g, o) {
    const t = o.terms, slot = scenarioSlotFree(g), why = slot ? '' : 'The opportunity desk is committed this round.';
    return [
      { id: 'rescue', label: `Migration rescue · ${recipeText(t.rescue.recipe)}`, note: `${t.rescue.window} seconds; paid ${shortM(t.rescue.cash)}. Paid at this bell; your earlier capacity can earn one last contract.`, enabled: slot, reason: why, primary: true },
      { id: 'mirror', label: `Host the mirror · ${recipeText(t.mirror.recipe)}`, note: `+${shortM(t.mirror.revenue)}/round base. License disputed: ${Math.round(t.mirror.risk * 100)}% takedown chance at each later bell (lose it, pay ${shortM(t.mirror.penalty)}).`, enabled: slot, reason: why },
      { id: 'clean', label: `Clean-room retrain · ${recipeText(t.clean.recipe)}`, note: `+${shortM(t.clean.revenue)}/round base and investors like the good guys.`, enabled: slot && g.company.level >= t.clean.level, reason: g.company.level < t.clean.level ? 'Needs a Specialist model.' : why },
      { id: 'pass', label: 'Stay out of it', note: 'Not your outage.', decline: true },
    ];
  },
  choose(g, o, id) {
    const t = o.terms; S(g).checkpoint.choice = id;
    if (id === 'pass') return true;
    const spec = id === 'rescue' ? { name: 'Polyglot migration rescue', reward: { cash: t.rescue.cash }, window: t.rescue.window, label: 'Rescue' }
      : id === 'mirror' ? { name: 'Polyglot mirror', reward: { revenue: t.mirror.revenue }, label: 'Grey market' } : { name: 'Clean-room Polyglot', reward: { revenue: t.clean.revenue }, label: 'Clean room' };
    startChain(g, { key: `checkpoint-${id}`, name: spec.name, org: 'Tensorbay', label: spec.label, window: spec.window || 0,
      stages: [{ name: spec.name, recipe: { ...t[id].recipe }, reward: spec.reward }], blurb: { rescue: 'Their apps are down. Yours are up. Be quick.', mirror: 'Fast money on a checkpoint nobody is supposed to host.', clean: 'Slower, cleaner, yours.' }[id] });
    return true;
  },
};
HANDLERS['checkpoint-rescue'] = { eligible: () => false, chance: () => 0, options: () => [], choose: () => false,
  done(g) { const q = roundOf(g) + CHECKPOINT.rescue.alumni.after; if (q <= campaignLimit(g)) S(g).due.push({ key: 'alumni', q }); } };
HANDLERS.alumni = { eligible: () => false, chance: () => 0, options: () => [], choose: () => false,
  due(g) {
    if (!scenarioSlotFree(g)) return;
    const A = CHECKPOINT.rescue.alumni;
    startChain(g, { key: 'alumni', name: 'Polyglot alumni contract', org: 'Polyglot alumni', label: 'Customer', stages: [{ name: 'Polyglot alumni contract', recipe: { ...A.recipe }, reward: { revenue: A.revenue } }], blurb: 'The customers you rescued want to stay.' });
    news(g, 'alumni', 'The customers you migrated off Polyglot want a real contract.', { size: 'minor', tone: 'good' });
  } };
HANDLERS['checkpoint-mirror'] = { eligible: () => false, chance: () => 0, options: () => [], choose: () => false,
  done(g, ch, b) { S(g).checkpoint.mirror = b.id; S(g).checkpoint.mirrorQ = roundOf(g); },
  bell(g) {
    const k = S(g).checkpoint; if (!k?.mirror || k.takedown || g.q <= k.mirrorQ) return;
    if (stream(g.seed, 'v113-scn', 'mirror-takedown', g.q).next() >= CHECKPOINT.mirror.risk) return;
    k.takedown = g.q; flag(g, 'checkpoint.takedown');
    lose(g, g.company.products.filter(p => p.build === k.mirror));
    S(g).dues.push({ chain: 'checkpoint-mirror', amount: CHECKPOINT.mirror.penalty, reason: 'Polyglot mirror takedown' });
    g.world.sentiment.push({ delta: CHECKPOINT.mirror.sentiment, left: 2, event: 'scn-mirror' });
    news(g, 'mirror-takedown', `Tensorbay’s lawyers found your Polyglot mirror. It goes dark; ${money(CHECKPOINT.mirror.penalty)} penalty.`, { tone: 'bad' });
  } };
HANDLERS['checkpoint-clean'] = { eligible: () => false, chance: () => 0, options: () => [], choose: () => false,
  done(g) { g.world.sentiment.push({ delta: CHECKPOINT.clean.sentiment, left: 2, event: 'scn-clean' }); flag(g, 'checkpoint.clean'); } };

// ---- Save validation --------------------------------------------------------------------------------------------
export function validScenarioSave(g) {
  const s = g.world?.scen, int = Number.isSafeInteger, L = g.arcade.ledger;
  if (!s || typeof s !== 'object' || s.v !== 1 || typeof s.enabled !== 'boolean' || !['offers', 'chains', 'buyers', 'dues', 'due', 'log'].every(k => Array.isArray(s[k]))) return false;
  if (!s.cash || !['in', 'capex', 'penalties'].every(k => int(s.cash[k]) && s.cash[k] >= 0)) return false;
  if (!int(L.capex) || !int(L.penalties) || L.penalties !== s.cash.penalties) return false;
  const capexBuilds = g.company.builds.filter(b => b.moonshot === undefined && b.cashCost).reduce((n, b) => n + b.cashCost, 0);
  if (L.capex !== s.cash.capex + capexBuilds) return false;
  if (!int(s.smalls) || s.smalls < 0 || s.smalls > PACE.smalls) return false;
  if (!s.offers.every(o => typeof o.id === 'string' && (HANDLERS[o.key] || ['lantern','lantern-endpoint'].includes(o.key)) && OFFER_STATES.includes(o.state) && int(o.q) && o.q >= 1 && o.q <= campaignLimit(g))) return false;
  if (new Set(s.offers.map(o => o.id)).size !== s.offers.length) return false;
  // Offers stay open through the bell's integration phase; the settlement expires them.
  if (!['floor', 'integration'].includes(g.phase) && s.offers.some(o => o.state === 'open')) return false;
  if (!s.chains.every(ch => typeof ch.id === 'string' && CHAIN_STATES.includes(ch.state) && Array.isArray(ch.stages) && ch.stages.length > 0 && int(ch.stage) && ch.stage >= 0 && ch.stage <= ch.stages.length &&
    Array.isArray(ch.history) && ch.history.length === ch.stage && ch.history.every((h, i) => h.stage === i && g.company.builds.some(b => b.id === h.build && b.scenario?.chain === ch.id)))) return false;
  if (s.chains.some(ch => ch.state === 'completed' && ch.stage !== ch.stages.length)) return false;
  // Every open scenario card belongs to its chain's current stage.
  const open = g.arcade.objectives.filter(o => o.kind === 'scenario' && o.status === 'open');
  if (!open.every(o => s.chains.some(ch => ch.id === o.scenario?.chain && ch.card === o.id && ch.stage === o.scenario.stage))) return false;
  const grants = g.company.shares.investors.filter(i => i.kind === 'talent');
  if (grants.some(i => i.paid !== 0 || i.inKind || !i.grant) || grants.length > 1) return false;
  if (s.bonus && !['breakthrough', 'setback', 'legendary'].every(k => Number.isFinite(s.bonus[k]))) return false;
  if (g.arcade.confirm?.scenario && !s.offers.some(o => o.id === g.arcade.confirm.scenario)) return false;
  if (g.arcade.ending === 'acquired' && !(s.sale && int(s.sale.price) && s.sale.price > 0 && g.arcade.exit?.kind === 'acquired' && g.arcade.exit.price === s.sale.price)) return false;
  return true;
}
