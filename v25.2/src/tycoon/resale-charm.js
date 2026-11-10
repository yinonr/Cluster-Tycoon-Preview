// V24.4 resale Charm: the alternative to Quick Sell. A real buyer on the resale desk (funded demand for one GPU type,
// a posted bid, a hidden ceiling and a budget) hears your pitch for free units you hold. The buyer opens at the Quick
// Sell bid; a hit lifts the offer toward the buyer's own posted bid, and Double Down pushes it on toward their ceiling.
// One negotiation per buyer per round: a missed Charm and the buyer passes, a missed Double Down and the buyer walks
// with the offer. Either way the buyer is gone until the next round, your GPUs stay yours and Quick Sell is unchanged.
// Prices only ever move within what the buyer can pay: min(ceiling, budget / units), so demand stays finite.
import { stream } from '../util.js';
import { CHARM_RULES as R } from './rizz.js';
import { buyerLive } from './arcade-buyers.js';
import { cents, cash, record, notice, V7 } from './arcade.js';
import { expireTimed } from './exchange.js';
import { freeIn, freeOf, GPUS } from './founder.js';
import { bidRate } from './quick-sell.js';

// Shares of the remaining gap each hit takes, by precision. Attempt 1 closes the gap from the Quick Sell bid to the
// buyer's posted bid; attempt 2 (Double Down) closes the gap from the current offer to the buyer's ceiling.
export const RESALE_CHARM = Object.freeze({
  labels: Object.freeze(['Charm', 'Double Down']),
  reach: Object.freeze({ edge: .40, strong: .65, perfect: .85 }),
  push: Object.freeze({ edge: .35, strong: .60, perfect: .85 }),
  posture: Object.freeze({ firm: .8, cautious: 1, flexible: 1.1 }),
});
const STATUS = ['open', 'passed', 'walked', 'expired', 'sold'];

export const currentResale = g => { const id = g?.arcade?.confirm?.resaleId; return id ? g.arcade.buyers.find(b => b.id === id && b.resale) : null; };
// The meter controller reads any Charm table as { id, negotiation: { running, attempts } }.
export const resaleActor = g => { const b = currentResale(g); return b ? { id: `resale:${b.id}`, negotiation: b.resale } : null; };

// Units this buyer would take of a requested block: free stock, remaining demand and budget at their posted bid.
const takes = (g, b, qty) => Math.max(0, Math.min(qty, freeOf(g, b.gpu), b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))));
// The most a buyer pays per GPU-hour for a block of k units: their ceiling, and never past their budget.
export const resaleCap = (b, k) => Math.max(0, Math.min(b.ceiling, Math.floor(b.budget / cents(k, 1))));
const fresh = (g, b) => buyerLive(g, b) && !b.resale && !b.negotiation.attempts?.length;
const held = (g, b) => b.resale?.status === 'open' && b.resale.attempts.length > 0 && !b.resale.running && buyerLive(g, b);

// The buyer the Charm button would pitch for a requested block: one already holding a negotiated offer first, else the
// fresh buyer who takes the most units, then pays the most for them. null when no eligible buyer exists (never invented).
export function resaleBuyer(g, gpu, qty) {
  if (g?.phase !== 'floor' || !GPUS.includes(gpu) || !Number.isSafeInteger(qty) || qty < 1) return null;
  const a = g.arcade, quick = bidRate(g, gpu);
  const open = a.buyers.find(b => b.gpu === gpu && held(g, b));
  if (open) return { buyer: open, qty: Math.min(open.resale.qty, freeOf(g, gpu)), quick: open.resale.quick, offer: open.resale.offer, held: true };
  const rows = a.buyers.filter(b => b.gpu === gpu && fresh(g, b)).map(b => ({ b, k: takes(g, b, qty) })).filter(x => x.k > 0 && resaleCap(x.b, x.k) > quick)
    .sort((x, y) => y.k - x.k || cents(y.k, resaleCap(y.b, y.k)) - cents(x.k, resaleCap(x.b, x.k)) || x.b.id.localeCompare(y.b.id));
  if (!rows.length) return null;
  const { b, k } = rows[0];
  return { buyer: b, qty: k, quick, offer: quick, held: false };
}

// What the Quick Sell panel's Charm option shows for a requested block: the buyer, the units they take, the guaranteed
// Quick Sell total for those units, and what a perfect first Charm would make the offer (or the offer already held).
export function resalePreview(g, gpu, qty) {
  const pick = resaleBuyer(g, gpu, qty);
  if (!pick) {
    const later = g?.phase === 'floor' && g.arcade.buyers.some(b => b.gpu === gpu && !b.resale && !b.negotiation.walked && b.at > g.arcade.time && b.at < g.arcade.seconds);
    return { buyer: null, later };
  }
  const b = pick.buyer, k = pick.qty, target = Math.min(b.rate, resaleCap(b, k));
  const perfect = pick.held ? pick.offer : pick.quick + Math.max(1, Math.floor((target - pick.quick) * RESALE_CHARM.reach.perfect));
  return { buyer: b, name: b.name, qty: k, held: pick.held, quickTotal: cents(k, pick.quick), offerTotal: cents(k, pick.offer), perfectTotal: cents(k, perfect), timeCost: R.seconds[0] };
}

// Every stake the desk shows comes from here: the offer now, what a perfect hit would make it, and what a miss costs.
export function resaleStakes(g, b = currentResale(g)) {
  const n = b?.resale;
  if (!n) return null;
  const qty = n.qty, attempt = n.attempts.length + 1, entry = n.running ? n.attempts[n.running - 1] : null;
  const p = entry?.params || (n.status === 'open' && attempt <= 2 && buyerLive(g, b) && !g.arcade.signing ? resaleParams(g, b, attempt) : null);
  const now = cents(qty, n.offer), quick = cents(qty, n.quick);
  if (!p) return { attempt, qty, running: false, canStart: false, nowTotal: now, quickTotal: quick, bonus: now - quick };
  const perfect = Math.min(p.target, n.offer + Math.max(1, Math.floor((p.target - n.offer) * (p.attempt === 1 ? RESALE_CHARM.reach : RESALE_CHARM.push).perfect)));
  const nextTime = Math.min(V7.seconds, g.arcade.time + p.timeCost);
  return { params: p, attempt: p.attempt, label: RESALE_CHARM.labels[p.attempt - 1], qty, running: !!entry, timeCost: p.timeCost,
    canStart: !entry && p.target > n.offer, nowTotal: now, quickTotal: quick, bonus: now - quick,
    perfectRate: perfect, perfectTotal: cents(qty, perfect), upside: cents(qty, perfect - n.offer), atRisk: now - quick,
    missText: p.attempt === 1 ? 'Miss: buyer passes' : 'Miss: buyer walks, offer lost', expires: !entry && (b.until <= nextTime || nextTime >= V7.seconds) };
}

function resaleParams(g, b, attempt) {
  const n = b.resale, cap = resaleCap(b, n.qty), target = attempt === 1 ? Math.min(b.rate, cap) : cap;
  return { attempt, timeCost: R.seconds[attempt - 1], width: R.widths[attempt - 1] * (RESALE_CHARM.posture[b.posture] || 1), speed: R.speeds[attempt - 1],
    phase: stream(g.seed, 'v244-resale-charm', b.id, attempt).range(0, 2), target, cap };
}

// Open a buyer's desk and pitch at once (one tap from Quick Sell). A held offer reopens without spending an attempt.
export function openResale(g, gpu, qty) {
  const a = g.arcade;
  if (g.phase !== 'floor' || a.active || a.signing || a.confirm) return false;
  const pick = resaleBuyer(g, gpu, qty);
  if (!pick) return false;
  const b = pick.buyer;
  if (!pick.held) b.resale = { v: 1, q: g.q, gpu, qty: pick.qty, quick: pick.quick, offer: pick.quick, attempts: [], running: null, status: 'open' };
  a.confirm = { resaleId: b.id };
  return true;
}

export function startResaleCharm(g) {
  const b = currentResale(g), n = b?.resale;
  if (!n || n.running || n.status !== 'open' || g.arcade.signing || g.arcade.active || freeOf(g, b.gpu) < 1) return false;
  const s = resaleStakes(g, b);
  if (!s?.canStart) return false;
  // One persisted action consumes the attempt and its full time, exactly as on a supplier desk.
  const entry = { params: s.params, before: n.offer, status: 'running', timeBefore: g.arcade.time };
  n.attempts.push(entry); n.running = s.params.attempt;
  g.arcade.time = Math.min(V7.seconds, g.arcade.time + s.params.timeCost); entry.timeAfter = g.arcade.time;
  for (const l of g.arcade.lots) if (l.status === 'open' && l.until <= g.arcade.time) l.status = 'expired';
  expireTimed(g);
  if (!buyerLive(g, b) || g.arcade.time >= V7.seconds) return resolveResaleCharm(g, 0, true);
  notice(g, `${s.label} · ${s.params.timeCost}s spent. Stop inside the target. Leaving or reloading during the meter is a severe miss.`);
  return true;
}

export function resolveResaleCharm(g, position, interrupted = false) {
  const b = currentResale(g), n = b?.resale, e = n?.running && n.attempts[n.running - 1];
  if (!e || e.status !== 'running' || !Number.isFinite(position) || position < 0 || position > 1) return false;
  const p = e.params, expired = !buyerLive(g, b) || g.arcade.time >= V7.seconds;
  const distance = Math.max(0, Math.abs(position - .5) - p.width / 2);
  const tier = expired ? 'expired' : interrupted ? 'severe' : distance <= 1e-12 ? 'hit' : distance <= R.nearDistance + 1e-12 ? 'near' : distance <= R.missDistance + 1e-12 ? 'miss' : 'severe';
  const accuracy = Math.max(0, 1 - Math.abs(position - .5) / (p.width / 2));
  const precision = tier === 'hit' ? accuracy >= .8 - 1e-12 ? 'perfect' : accuracy >= .4 - 1e-12 ? 'strong' : 'edge' : null;
  if (precision) {
    const share = (p.attempt === 1 ? RESALE_CHARM.reach : RESALE_CHARM.push)[precision];
    n.offer = Math.min(p.target, resaleCap(b, n.qty), n.offer + Math.max(1, Math.floor((p.target - n.offer) * share)));
  } else {
    // A miss closes this buyer for the round: the offer goes, the buyer leaves the desk, your GPUs stay.
    n.status = expired ? 'expired' : p.attempt === 1 ? 'passed' : 'walked';
    if (n.offer > n.quick) n.lost = n.offer;
    n.offer = n.quick;
    b.negotiation.walked = true;
  }
  Object.assign(e, { status: 'resolved', tier, precision, position, interrupted, after: n.offer, gain: cents(n.qty, n.offer - e.before) });
  n.running = null;
  const said = n.status === 'expired' ? 'My window closed. No sale.' : n.status === 'walked' ? 'You pushed too far. I am out.' : n.status === 'passed' ? 'Not at that pitch. I will pass.'
    : `${precision === 'perfect' ? 'You have earned it.' : precision === 'strong' ? 'A fair case.' : 'All right, a little more.'} $${(n.offer / 100).toFixed(2)}/h for ${n.qty} ${b.gpu}.`;
  b.negotiation.tape.push({ speaker: b.name, text: said, outcome: precision ? 'accept' : 'walk' });
  notice(g, `${interrupted && !expired ? 'Interrupted attempt settled as a severe miss. ' : ''}${precision ? `${precision.toUpperCase()} ${RESALE_CHARM.labels[p.attempt - 1].toUpperCase()} · offer up to ${money(cents(n.qty, n.offer))}.` : n.status === 'expired' ? 'The buyer’s window closed. No sale made; your GPUs are still yours.' : `BUYER ${n.status === 'walked' ? 'WALKED' : 'PASSED'} · no sale; your GPUs are still yours.`}`, precision ? 'good' : 'bad');
  return true;
}
export const recoverResaleCharm = g => currentResale(g)?.resale.running ? resolveResaleCharm(g, 0, true) : false;
const money = v => (v / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// The sale a held offer would make right now: free units oldest first (FIFO, like Quick Sell), never past budget.
export function resaleQuote(g, b = currentResale(g)) {
  const n = b?.resale;
  if (!n || n.status !== 'open' || n.running || !n.attempts.length || n.offer <= n.quick || !buyerLive(g, b)) return null;
  const qty = Math.min(n.qty, freeOf(g, b.gpu), b.qty - b.filled);
  if (qty < 1) return null;
  const revenue = cents(qty, n.offer);
  if (!Number.isSafeInteger(revenue) || revenue <= 0 || revenue > b.budget || n.offer > resaleCap(b, n.qty)) return null;
  const legs = []; let want = qty, cost = 0;
  for (const x of g.arcade.inventory.filter(x => x.gpu === b.gpu)) {
    const take = Math.min(want, freeIn(g, x)); if (take <= 0) continue;
    legs.push({ id: x.id, qty: take }); cost += take * x.unitCost; want -= take; if (!want) break;
  }
  if (want) return null;
  return { buyerId: b.id, gpu: b.gpu, qty, rate: n.offer, quick: n.quick, revenue, quickRevenue: cents(qty, n.quick), cost, legs };
}

// Settlement, called only by signTrade with the signed document: exact units out, exact cash in, demand and budget down.
export function sellResale(g, d) {
  const b = g.arcade.buyers.find(b => b.id === d.buyerId), q = resaleQuote(g, b);
  if (!q || q.qty !== d.qty || q.rate !== d.rate || q.revenue !== d.total || q.cost !== d.cost || JSON.stringify(q.legs) !== JSON.stringify(d.legs)) return false;
  for (const leg of q.legs) g.arcade.inventory.find(x => x.id === leg.id).left -= leg.qty;
  b.filled += q.qty; b.budget -= q.revenue;
  b.resale.status = 'sold'; b.resale.sold = { qty: q.qty, revenue: q.revenue };
  record(g, 'resale', q.revenue);
  g.cash = (cash(g) + q.revenue) / 100;
  g.profit = (Math.round(g.profit * 100) + q.revenue - q.cost) / 100;
  g.arcade.sales.push({ kind: 'charm', buyerId: b.id, gpu: b.gpu, qty: q.qty, rate: q.rate, quick: q.quick, revenue: q.revenue, cost: q.cost, legs: q.legs, q: g.q });
  g.clout += 5;
  notice(g, `${q.qty} ${b.gpu} sold to ${b.name} for ${money(q.revenue)}: ${money(q.revenue - q.quickRevenue)} more than Quick Sell.`, 'good');
  return true;
}

// Structural save checks: a damaged negotiation never loads half-trusted.
export function validResaleCharmSave(g) {
  const a = g.arcade, int = Number.isSafeInteger;
  for (const b of a.buyers) {
    const n = b.resale;
    if (n === undefined) continue;
    if (!n || n.v !== 1 || n.gpu !== b.gpu || !STATUS.includes(n.status) || !int(n.qty) || n.qty < 1 || n.qty > b.qty || !int(n.quick) || n.quick < 1 || !int(n.offer) ||
      n.offer < n.quick || n.offer > b.ceiling || !Array.isArray(n.attempts) || n.attempts.length > 2 || (n.status !== 'open' && n.status !== 'sold' && n.offer !== n.quick)) return false;
    if (n.attempts.some((e, i) => !e?.params || e.params.attempt !== i + 1 || !['running', 'resolved'].includes(e.status) ||
      !['width', 'speed', 'phase', 'timeCost', 'target', 'cap'].every(k => Number.isFinite(e.params[k])) || e.params.width <= 0 || e.params.width > 1 || e.params.speed <= 0 ||
      e.params.target > b.ceiling || (e.status === 'running' ? n.running !== i + 1 : !Number.isFinite(e.position) || e.position < 0 || e.position > 1))) return false;
    if (n.running !== null && (n.running !== n.attempts.length || n.attempts.at(-1).status !== 'running' || a.confirm?.resaleId !== b.id || a.signing)) return false;
    if (['passed', 'walked', 'expired'].includes(n.status) && !b.negotiation.walked) return false;
    if (n.lost !== undefined && (!int(n.lost) || n.lost <= n.quick || n.lost > b.ceiling || n.status === 'open')) return false;
  }
  if (a.confirm?.resaleId !== undefined && !a.buyers.some(b => b.id === a.confirm.resaleId && b.resale)) return false;
  if (a.signing?.kind === 'resale' && a.confirm?.resaleId !== a.signing.buyerId) return false;
  return true;
}
