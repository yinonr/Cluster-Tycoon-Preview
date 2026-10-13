// V6.2 only: preplanned unsigned buyer changes, finite spot supply and customer signals.
import { stream, round2, int, usd } from '../util.js';
import { buyerLive, sellable, spareLeft, saleMath, askOf } from '../modes/economy.js';
import { look } from '../modes/buyer.js';
import { GPU_LIST } from './gpu.js';

export const saleVersion = (game) => game?.marketVersion === 62;
export const buyerStage = (b) => b.state === 'sold' ? 'SIGNED' : b.state === 'due' ? 'INTERESTED' : b.negotiating ? 'NEGOTIATING' : 'INTERESTED';
export function planRevision(seed, q, b, startup, step) {
  const r = stream(seed, 'sale-revision', q, b.id);
  const fragile = startup && startup.cash < startup.burn * 3;
  const chance = startup?.trust >= 3 ? 0.10 : b.kind === 'lab' ? 0.12 : fragile ? 0.38 : b.kind === 'broker' ? 0.32 : 0.24;
  if (r.next() >= chance) return null;
  const kind = r.pick(['smaller', 'urgent', 'larger', 'price-cut', 'delivery', 'workload', 'cancel']);
  const at = b.at + Math.round(b.window * (0.38 + r.next() * 0.18));
  const other = GPU_LIST.filter((g) => g !== b.gpu);
  const gpu = b.gpu === 'H100' && startup ? 'H200' : r.pick(other);
  return { id: `${b.id}-revision`, at, kind, step, gpu, delta: kind === 'urgent' ? 0.10 : kind === 'price-cut' ? -0.10 : 0 };
}

export function reviseBuyer(run, b, plan = b.revisionPlan) {
  if (!saleVersion(run.tycoon) || !plan || b.revisionId || !buyerLive(b) || run.market.closed) return false;
  b.revisionId = plan.id;
  b.changedAt = run.market.t;
  const was = `${int(b.qty)} ${b.gpu} · ${usd(askOf(b))} · delivery ${b.delivery}d`;
  if (plan.kind === 'cancel') b.state = 'cancelled';
  else {
    b.state = 'open'; delete b.final; // a revised proposal supersedes the old counter, never a signed sale
    if (plan.kind === 'smaller') b.qty = Math.max(plan.step, Math.round(b.qty * 0.75 / plan.step) * plan.step);
    if (plan.kind === 'larger') b.qty += plan.step * 2;
    if (plan.kind === 'urgent' || plan.kind === 'price-cut') b.bid = round2(Math.max(0.01, b.bid + plan.delta));
    if (plan.kind === 'delivery') b.delivery = b.delivery <= 30 ? 60 : 14;
    if (plan.kind === 'workload') {
      b.gpu = plan.gpu;
      b.work = b.gpu === 'B200' ? 'train' : b.gpu === 'H200' ? 'memory' : 'serve';
      b.bid = round2(run.market.bench[b.gpu] + b.u);
    }
    b.limit = round2(b.bid + b.room);
  }
  const reasons = { smaller: 'Deployment scaled down', larger: 'Deployment expanded', urgent: 'Urgent launch: higher bid', 'price-cut': 'Budget tightened', delivery: 'Delivery plan changed', workload: 'Workload changed', cancel: 'Unsigned request withdrawn' };
  b.changeNote = `${reasons[plan.kind]}. Was ${was}.${b.state === 'cancelled' ? '' : ` Now ${int(b.qty)} ${b.gpu} · ${usd(b.bid)} · delivery ${b.delivery}d.`}`;
  (run.buyerChanges ||= []).push({ id: plan.id, buyer: b.firm, kind: plan.kind, text: b.changeNote });
  run.market.bulletin({ headline: `BUYER UPDATE · ${b.firm.toUpperCase()}`, sub: b.changeNote, tone: plan.kind === 'urgent' ? 'down' : 'flat' });
  run.onBuyerChanged?.();
  return true;
}

export function addSpotSupply(run, game, Q, site) {
  const r = stream(game.seed, 'sale-supply', game.q);
  const pool = r.shuffle(GPU_LIST);
  const offers = [25, 90].map((at, i) => {
    const gpu = pool[i], step = Q / 8, qty = step * (2 + r.int(0, 2));
    const ask = round2(run.market.bench[gpu] - 0.20 + r.next() * 0.28), delivery = r.next() < 0.8 ? 14 : 45;
    return { at, spec: { gpu, qty, site, delivery, deliveryLabel: `${delivery} DAYS`, divisible: true, minQty: step, step,
      terms: r.next() < 0.75 ? [6, 12, 24] : [6, 12], baseTerm: 12, ask, floor: round2(ask - 0.06 - r.next() * 0.04), concession: 0.4, patience: 4 },
      person: { name: i ? 'Alex' : 'Rory', firm: i ? 'Harbor Compute' : 'Cedar GPU Desk', dressed: look(stream(game.seed, 'sale-supply-look', game.q, i)) } };
  });
  for (const o of offers) run.market.at(o.at, () => {
    const l = run.addSeller('resale', o.spec, o.person);
    run.market.bulletin({ headline: `NEW SUPPLY · ${o.spec.gpu}`, sub: `${int(l.qty)} ${l.gpu} at ${usd(l.ask)} · ${l.terms.join('/')} months · ${l.delivery}d delivery. Limited block at ${l.firm}.`, tone: 'flat' });
  });
}

export function opportunity(run, b, price = askOf(b)) {
  const have = sellable(run, b), math = saleMath(run, b, price);
  const supply = run.market.lots.filter((l) => l.sellerId && l.status === 'open' && l.gpu === b.gpu && l.delivery <= b.delivery && l.terms.some((t) => t >= b.minTerm))
    .sort((a, c) => (a.divisible ? a.minQty : a.qty) - (c.divisible ? c.minQty : c.qty) || a.ask - c.ask);
  const total = [...(run.labHoldings || []), ...run.deals].filter((d) => d.gpu === b.gpu).reduce((n, d) => n + spareLeft(d), 0);
  let left = have, carry = 0;
  for (const d of [...(run.labHoldings || []), ...run.deals]) {
    if (d.gpu !== b.gpu || d.term < b.minTerm || d.delivery > b.delivery) continue;
    const qty = Math.min(left, spareLeft(d)); left -= qty;
    if (d.held) carry += qty * 0.08 * 3 * 730;
  }
  return { ...math, have, total, missing: Math.max(0, b.qty - have), supply, carry, netWithCarry: math.vsCost - carry };
}

export function customerDelivery(s, units, qty) {
  const need = Math.max(1, s.size * 1000 * 3);
  const boost = Math.min(1, units / need);
  return { boost, growthHelp: 0.06 * boost, failureMultiplier: 1 - 0.4 * boost,
    text: qty > 0 ? `${int(qty)} GPUs supplied this quarter. Suitable compute supports growth and milestones; commercial risk remains.` : 'No service from your desk this quarter. Unsigned interest creates no delivery obligation.' };
}
