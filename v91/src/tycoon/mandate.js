// One cash-funded hyperscaler procurement per run, assembled from finite releases.
import { cash, cents, notice } from './arcade.js';

export function makeMandate(g, tier) {
  if (!tier || g.arcade.mandateCompleted) return null;
  const gpu = g.arcade.orders[0].gpu;
  const qty = 20, suppliersRequired = 3, until = 64;
  // Quotes use only the existing schedule; accepting never creates supply.
  const supply = g.arcade.lots.filter(l => l.gpu === gpu && l.at < until);
  const capital = cents(qty, { H100: 271, H200: 338, B200: 509 }[gpu]);
  if (cash(g) < capital || supply.reduce((n,l) => n+l.qty,0) < qty || new Set(supply.map(l=>l.firm)).size < suppliersRequired) return null;
  const rate = { H100: 390, H200: 485, B200: 720 }[gpu];
  return { id: `q${g.q}-mandate`, name: 'Atlas Meridian Cloud', gpu, qty,
    suppliersRequired, rate, budget: cents(qty, rate), until, complete: false, expired: false };
}

export function mandateQuote(g) {
  const m = g.arcade.mandate;
  if (!m || g.phase !== 'floor' || m.complete || m.expired || g.arcade.time >= m.until) return null;
  const stock = g.arcade.inventory.filter(x => x.gpu === m.gpu && x.left > 0);
  const firms = [...new Set(stock.map(x => x.firm))];
  // Reserve one unit from each of two suppliers before filling FIFO, so a large
  // first purchase cannot accidentally hide the second supplier's contribution.
  const taken = new Map();
  for (const firm of firms.slice(0, m.suppliersRequired)) {
    const x = stock.find(x => x.firm === firm); taken.set(x.id, 1);
  }
  let left = m.qty - taken.size;
  for (const x of stock) {
    const n = Math.min(left, x.left - (taken.get(x.id) || 0));
    taken.set(x.id, (taken.get(x.id) || 0) + n); left -= n;
  }
  const legs = [...taken].filter(([, qty]) => qty).map(([id, qty]) => ({ id, qty }));
  const cost = legs.reduce((n, leg) => n + leg.qty * stock.find(x => x.id === leg.id).unitCost, 0);
  const revenue = cents(m.qty, m.rate);
  // Price a possible completion using actual unsold releases, at their current
  // quotes. Charge whole lots, including surplus; never assume a resale recovery.
  // This is an estimate, not a reservation or a promise that supply will wait.
  let needed = left, estimatedCost = cost;
  const projectedFirms = new Set(firms);
  const supply = g.arcade.lots.filter(l => l.gpu === m.gpu && l.status === 'open' &&
    !l.negotiation?.closed && l.until > g.arcade.time && l.at < m.until).slice();
  const planned = [];
  while (needed > 0 || projectedFirms.size < m.suppliersRequired) {
    const choices = supply.filter(l => projectedFirms.size >= m.suppliersRequired || !projectedFirms.has(l.firm));
    choices.sort((a, b) => cents(a.qty, a.negotiation?.price ?? a.ask) - cents(b.qty, b.negotiation?.price ?? b.ask));
    const l = choices[0];
    if (!l) { estimatedCost = null; break; }
    supply.splice(supply.indexOf(l), 1); projectedFirms.add(l.firm);
    estimatedCost += cents(l.qty, l.negotiation?.price ?? l.ask);
    needed = Math.max(0, needed - l.qty); planned.push(l.id);
  }
  return { id: m.id, gpu: m.gpu, qty: m.qty, secured: m.qty - left, suppliers: firms.length,
    ready: left === 0 && firms.length >= m.suppliersRequired && m.budget >= revenue, cost, revenue, margin: revenue - cost, legs,
    estimatedCost, estimatedMargin: estimatedCost === null ? null : revenue - estimatedCost, planned };
}

export function fulfillMandate(g) {
  const q = mandateQuote(g);
  if (!q?.ready || g.arcade.active || !g.arcade.confirm?.mandate) return false;
  for (const leg of q.legs) g.arcade.inventory.find(x => x.id === leg.id).left -= leg.qty;
  g.cash = (cash(g) + q.revenue) / 100;
  g.profit = (Math.round(g.profit * 100) + q.revenue - q.cost) / 100;
  g.arcade.mandate.complete = true;
  g.arcade.mandate.budget -= q.revenue;
  g.arcade.mandateCompleted = true;
  g.arcade.mandateHistory.push({ ...q, q: g.q });
  g.arcade.confirm = null;
  notice(g, 'Twenty GPUs. Three supplier commitments. Atlas Meridian Cloud paid your assembled procurement in full.', 'good');
  return true;
}
