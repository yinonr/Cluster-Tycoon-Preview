import { stream } from '../util.js';
import { FOUNDER, isMixed, burnOf, freeOf, openCards, recipeCost } from './founder.js';
import { DRIFT } from './founder-market.js';
import { PARTNERSHIPS, COMPUTE_OFFERS, FOLLOWUPS } from './strategic-content.js';

export const strategicBusy = g => ['offered', 'waiting', 'next'].includes(g.world.strategic?.state);
const news = (g, id, headline) => {
  const n = { id, q: g.q, when: 'open', size: 'minor', headline, detail: '', tone: 'plain' };
  g.world.news.push(n); g.world.log.push({ id, q: g.q, headline });
  g.arcade.news = g.world.news.slice();
};
// Whether a partnership opens this round (pure: a fresh copy of the same seeded draw). V10.13's
// scenario planner reads it before the round opens, so the opportunity desk is never double-booked.
export const partnershipStarts = g => !g.world.strategic && g.q >= 2 && g.q <= 4 && stream(g.seed, 'v109-partnership', g.q).next() < .42;
export function strategicOpen(g) {
  const w = g.world, r = stream(g.seed, 'v109-partnership', g.q);
  if (!w.strategic && g.q >= 2 && g.q <= 4 && r.next() < .42) {
    const p = r.pick(PARTNERSHIPS.filter(p => p.live));
    w.strategic = { id: p.id, stage: 0, due: g.q, state: 'next', history: [] };
  }
  const s = w.strategic;
  if (!strategicBusy(g)) return;
  // The existing fourth slot belongs to this commitment until it ends.
  g.arcade.objectives = g.arcade.objectives.filter(o => o.lane !== 'opportunity');
  if (s.state === 'waiting' || s.due !== g.q) return;
  const p = PARTNERSHIPS.find(p => p.id === s.id), spec = p.stages[s.stage];
  const recipe = { ...spec.recipe }, reward = { ...spec.reward };
  const variants = FOLLOWUPS.filter(f => f.live && f.chain === p.id && f.stage === s.stage);
  const twist = variants.length && r.next() < .55 ? r.pick(variants) : null;
  if (twist) {
    for (const [gpu, n] of Object.entries(twist.add || {})) recipe[gpu] = (recipe[gpu] || 0) + n;
    for (const k of ['cash', 'revenue']) if (reward[k] && twist[k]) reward[k] = Math.round(reward[k] * twist[k]);
  }
  const card = { id: `q${g.q}-strategic-${p.id}-${s.stage}`, lane: 'opportunity', kind: 'strategic', tier: 0,
    name: `${p.name} - Stage ${s.stage + 1}/${p.stages.length}`, blurb: `${spec.name}. ${twist ? twist.headline : p.pitch}`,
    recipe, reward, mixed: isMixed(recipe), q: g.q, at: 0, until: g.arcade.seconds, status: 'open',
    strategic: { id: p.id, stage: s.stage, total: p.stages.length, twist: twist?.id || null } };
  s.state = 'offered'; s.card = card.id;
  g.arcade.objectives.push(card);
  news(g, card.id, `${card.name}: ${spec.name}. Due at this bell.`);
}

// Run after integration, before payroll. The stage advances only on actual delivery.
export function strategicBell(g) {
  const s = g.world.strategic;
  if (!strategicBusy(g)) return;
  const b = g.company.builds.find(b => b.card === s.card);
  if (!b) {
    s.state = s.stage ? 'failed' : 'declined';
    s.ended = g.q; g.world.flags[`strategic.${s.id}.${s.state}`] = true;
    news(g, `strategic-${s.state}`, `${PARTNERSHIPS.find(p => p.id === s.id).name}: ${s.state}. No further stages.`);
    return;
  }
  if (b.online < 1) { s.state = 'waiting'; return; }
  s.history.push({ stage: s.stage, built: b.id, delivered: g.q, reward: { ...b.reward } });
  g.world.flags[`strategic.${s.id}.stage${s.stage + 1}`] = true;
  const p = PARTNERSHIPS.find(p => p.id === s.id);
  s.stage++;
  if (s.stage === p.stages.length) { s.state = 'completed'; s.ended = g.q; }
  else { s.state = 'next'; s.due = g.q + 1; }
  news(g, `strategic-stage-${s.stage}`, `${p.name}: ${s.state === 'completed' ? 'partnership secured.' : `stage delivered. Stage ${s.stage + 1} opens next round.`}`);
}

export function makeComputeTerm(g, spec) {
  const tranches = spec.tranches.map((d, i) => {
    const q = g.q + d.after + (d.delay || 0);
    return { id: `${g.q}-${spec.id}-${i}`, gpu: d.gpu, qty: d.qty, q, scheduledQ: g.q + d.after,
      unitCost: Math.round(FOUNDER.unit[d.gpu] * (1 + DRIFT * (g.q - 1)) * spec.factor * .92 ** (q - g.q)), status: 'pending' };
  });
  if (tranches.some(d => d.q > 10)) return null;
  const amount = tranches.reduce((n, d) => n + d.qty * d.unitCost, 0);
  // A fairly priced in-kind round, with a small strategic discount to today's pre-money.
  return { amount, tranches };
}

export function computeAlternative(g, terms, valuation) {
  const w = g.world, r = stream(g.seed, 'v109-compute', g.q);
  const large = institutionalCompute(g, valuation);
  if (large) { large.rivalOf = terms[0]?.id || null; return [...terms.slice(0, 1), large]; }
  if (g.q < 2 || g.q > 7 || (w.computeOffered || 0) >= 2 || terms.length > 1 || r.next() >= .42) return terms;
  const spec = r.pick(COMPUTE_OFFERS.filter(o => o.live));
  const deal = makeComputeTerm(g, spec);
  if (!deal) return terms;
  const pct = Math.max(1, Math.ceil(10000 * deal.amount / (Math.max(100000, valuation * .95) + deal.amount)));
  if (pct > 3500) return terms;
  const t = { id: `q${g.q}-compute`, kind: 'strategic', funding: 'compute', offer: spec.id, name: spec.name,
    label: 'Compute for equity', pitch: spec.pitch, ...deal, pct, openingPct: pct, floorPct: Math.max(1, Math.ceil(pct * .85)), patience: 1,
    at: terms[0]?.at ?? 4, until: g.arcade.seconds, status: 'open', valuation, rivalOf: terms[0]?.id || null,
    tape: [{ speaker: spec.name, text: spec.pitch }] };
  w.computeOffered = (w.computeOffered || 0) + 1;
  return [...terms, t];
}

export function institutionalComputeTerm(g, tier, valuation) {
  const advanced = g.company.level >= 2;
  const specs = {
    emergency: { name: 'Lifeline Compute Credit', factor: 1.2, pre: .8, tranches: [{ after: 0, gpu: advanced ? 'B200' : 'H200', qty: advanced ? 4 : 6 }] },
    scale: { name: 'Stratos Scale-Up Partnership', factor: 1.05, pre: .95, tranches: [{ after: 0, gpu: 'H200', qty: 6 }, { after: 0, gpu: 'B200', qty: 4 }, { after: 1, gpu: 'H200', qty: 4 }, { after: 1, gpu: 'B200', qty: 4 }] },
    landgrab: { name: 'Meridian GPU Consortium', factor: 1.12, pre: .9, tranches: [{ after: 0, gpu: 'B200', qty: 10 }, { after: 0, gpu: 'H200', qty: 4 }, { after: 1, gpu: 'B200', qty: 14 }, { after: 1, gpu: 'H200', qty: 4 }] },
  };
  const spec = specs[tier]; if (!spec) return null;
  const deal = makeComputeTerm(g, { ...spec, id: `institutional-${tier}` }); if (!deal) return null;
  const pct = Math.max(1, Math.ceil(10000 * deal.amount / (Math.max(100000, valuation * spec.pre) + deal.amount)));
  if (pct > 4500) return null;
  const pitch = tier === 'emergency' ? 'Capacity today, expensive equity. Keep the critical project alive.' : tier === 'scale' ? 'Two guaranteed serving and research tranches. Scale only what you can use.' : 'A scarce frontier allocation: 24 B200 plus 8 H200 over two rounds. No resale guarantee.';
  return { id: `q${g.q}-compute-${tier}`, kind: 'strategic', funding: 'compute', offer: `institutional-${tier}`, institutional: tier,
    name: spec.name, label: { emergency: 'Emergency compute', scale: 'Scale-up compute', landgrab: 'GPU Land Grab' }[tier], pitch,
    ...deal, pct, openingPct: pct, floorPct: Math.max(1, Math.ceil(pct * .9)), patience: 1,
    at: tier === 'emergency' ? 0 : 3, until: g.arcade.seconds, status: 'open', valuation,
    conditions: 'Guaranteed capacity, not cash. Each tranche expires at its delivery bell. Unused units are not refunded; issued equity remains. Buyer demand is finite.',
    tape: [{ speaker: spec.name, text: pitch }] };
}
function institutionalCompute(g, valuation) {
  const w = g.world, i = w.institutional ||= {}, history = i.computeOffers ||= [];
  if (g.q < 2 || history.length >= 3 || history.includes(g.q) || g.q < 5 && history.length >= 1) return null;
  const r = stream(g.seed, 'v112-institutional-compute', g.q), c = g.company;
  const shortage = Math.round(g.cash * 100) < burnOf(c) * 2 && openCards(g).some(o =>
    Object.entries(o.recipe).some(([gpu, qty]) => freeOf(g, gpu) < qty) && recipeCost(o.recipe) > Math.round(g.cash * 100));
  const frontier = g.q >= 5 && g.q <= 8 && (c.level >= 3 || w.flags.sovereignSigned) && !c.compute.some(x => x.termId.includes('landgrab'));
  const tier = shortage ? 'emergency' : frontier ? 'landgrab' : g.q >= 3 && g.q <= 7 && c.products.length >= 2 ? 'scale' : null;
  if (!tier || (!w.flags.sovereignSigned && r.next() > .6)) return null;
  const t = institutionalComputeTerm(g, tier, valuation);
  if (t) history.push(g.q);
  return t;
}

export function deliverCompute(g) {
  if (g.phase !== 'floor') return;
  for (const c of g.company.compute) for (const d of c.tranches) if (d.status === 'pending' && d.q === g.q) {
    d.status = 'delivered';
    g.arcade.inventory.push({ id: `compute-${d.id}`, gpu: d.gpu, qty: d.qty, left: d.qty, unitCost: d.unitCost,
      cost: d.qty * d.unitCost, firm: c.name, q: g.q, compute: c.termId });
  }
}
export function endStrategic(g) {
  for (const c of g.company.compute) for (const d of c.tranches) if (d.status === 'pending') d.status = 'cancelled';
  if (strategicBusy(g)) { g.world.strategic.state = 'failed'; g.world.strategic.ended = g.q; }
}

export const deliveryText = tranches => tranches.map(d => `R${d.q}: ${d.qty} ${d.gpu}${d.q !== d.scheduledQ ? ` (delayed from R${d.scheduledQ})` : ''}`).join(' / ');

export function validStrategicSave(g) {
  const c = g.company, a = g.arcade, int = Number.isSafeInteger;
  const tranche = d => d && typeof d.id === 'string' && ['H100', 'H200', 'B200'].includes(d.gpu) &&
    int(d.qty) && d.qty > 0 && int(d.q) && d.q >= 1 && d.q <= 10 && int(d.scheduledQ) && d.scheduledQ >= 1 && d.scheduledQ <= d.q &&
    int(d.unitCost) && d.unitCost > 0 && ['pending', 'delivered', 'cancelled', 'sold'].includes(d.status) && (d.status !== 'sold' || int(d.soldQ) && d.soldQ < d.q);
  if (!Array.isArray(c.compute) || !int(a.ledger.inKind) || a.ledger.inKind < 0) return false;
  const inv = c.shares.investors;
  // V10.13 talent grants are shares issued for no cash and no compute (scenarios.js validates them).
  if (inv.some(i => !int(i.inKind || 0) || (i.inKind || 0) < 0 || (i.inKind && i.paid !== 0) || (!i.inKind && i.paid <= 0 && i.kind !== 'talent'))) return false;
  if (inv.reduce((n, i) => n + (i.inKind || 0), 0) !== a.ledger.inKind) return false;
  if (!c.compute.every(k => typeof k.termId === 'string' && Array.isArray(k.tranches) && k.tranches.length > 0 && k.tranches.every(tranche) &&
    k.value === k.tranches.reduce((n, d) => n + d.qty * d.unitCost, 0) && inv.some(i => i.termId === k.termId && i.inKind === k.value))) return false;
  if (new Set(c.compute.map(k => k.termId)).size !== c.compute.length || c.compute.reduce((n, k) => n + k.value, 0) !== a.ledger.inKind) return false;
  const ds = c.compute.flatMap(k => k.tranches);
  if (new Set(ds.map(d => d.id)).size !== ds.length) return false;
  if (ds.some(d => d.status === 'pending' && (d.q <= (g.phase === 'report' ? g.q - 1 : g.q) || g.phase === 'over') ||
    d.status === 'delivered' && d.q > (g.phase === 'report' ? g.q - 1 : g.q) || d.status === 'cancelled' && g.phase !== 'over')) return false;
  const inventoryQ = g.phase === 'report' ? g.q - 1 : g.q;
  if (!ds.filter(d => d.status === 'delivered' && d.q === inventoryQ).every(d => a.inventory.filter(x => x.id === `compute-${d.id}`).length === 1)) return false;
  if (!a.inventory.filter(x => x.compute).every(x => ds.some(d => d.status === 'delivered' && x.id === `compute-${d.id}` && x.q === d.q && x.qty === d.qty && x.gpu === d.gpu && x.unitCost === d.unitCost))) return false;
  if (!a.terms.every(t => t.funding !== 'compute' || (Array.isArray(t.tranches) && t.tranches.length > 0 && t.tranches.every(d => tranche(d) && d.status === 'pending') &&
    t.amount === t.tranches.reduce((n, d) => n + d.qty * d.unitCost, 0)))) return false;
  const s = g.world.strategic;
  if (s) {
    const p = PARTNERSHIPS.find(p => p.id === s.id);
    if (!p || !int(s.stage) || s.stage < 0 || s.stage > p.stages.length || !Array.isArray(s.history) || s.history.length !== s.stage ||
      !['next', 'offered', 'waiting', 'failed', 'declined', 'completed'].includes(s.state) || !int(s.due) || s.due < 1 || s.due > 10) return false;
    if (s.state === 'completed' && s.stage !== p.stages.length) return false;
    if (s.history.some((h, i) => h.stage !== i || !c.builds.some(b => b.id === h.built && b.online === 1 && b.strategic?.id === s.id && b.strategic.stage === i))) return false;
  }
  return true;
}
