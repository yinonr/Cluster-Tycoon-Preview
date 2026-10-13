// Finite spot demand for the same prepaid rights. Interest is never booked revenue.
import { stream } from '../util.js';
import { BROKERS, LABS } from './demand.js';
import { cents, cash, owned, notice } from './arcade.js';

export function makeBuyers(seed, q) {
  const r = stream(seed, 'v71-buyers', q);
  return Array.from({ length: q < 3 ? 4 : 7 }, (_, i) => {
    const gpu = ['H100', 'H200', 'B200'][i % 3], qty = r.pick([4, 6, 8]);
    const rate = { H100: 250, H200: 310, B200: 470 }[gpu] + r.int(-35, 35);
    const at = 10 + i * (q < 3 ? 48 : 29), flash = i % 3 === 1;
    return { id: `q${q}-b${i}`, name: i % 2 ? LABS[i % LABS.length].name : BROKERS[i % BROKERS.length], gpu, qty, filled: 0, rate, budget: cents(qty, rate), at, until: Math.min(240, at + (flash ? 32 : 66)), flash };
  });
}
export const buyerLive = (g, b) => g.phase === 'floor' && b.at <= g.arcade.time && g.arcade.time < b.until && b.filled < b.qty && b.budget >= cents(1, b.rate);
export function saleQuote(g, id, qty) {
  const b = g.arcade.buyers.find(b => b.id === id);
  if (!b || !buyerLive(g, b) || !Number.isSafeInteger(qty) || qty <= 0 || qty > b.qty - b.filled || qty > owned(g, b.gpu)) return null;
  const revenue = cents(qty, b.rate);
  if (revenue > b.budget) return null;
  let left = qty, cost = 0; const legs = [];
  for (const x of g.arcade.inventory.filter(x => x.gpu === b.gpu && x.left)) {
    const take = Math.min(left, x.left); left -= take; cost += take * x.unitCost; legs.push({ id: x.id, qty: take });
    if (!left) break;
  }
  return { buyerId: id, gpu: b.gpu, qty, cost, revenue, legs };
}
export function reviewBuyer(g, id) {
  const b = g.arcade.buyers.find(b => b.id === id);
  if (g.arcade.active || g.arcade.confirm || !b || !buyerLive(g, b)) return false;
  g.arcade.confirm = { buyerId: id }; return true;
}
export function sellBuyer(g, qty) {
  if (g.arcade.active || !g.arcade.confirm?.buyerId) return false;
  const d = saleQuote(g, g.arcade.confirm.buyerId, qty);
  if (!d) return false;
  const b = g.arcade.buyers.find(b => b.id === d.buyerId);
  for (const leg of d.legs) g.arcade.inventory.find(x => x.id === leg.id).left -= leg.qty;
  b.filled += qty; b.budget -= d.revenue;
  g.cash = (cash(g) + d.revenue) / 100;
  g.profit = (Math.round(g.profit * 100) + d.revenue - d.cost) / 100;
  g.arcade.sales.push(d); g.arcade.confirm = null;
  notice(g, `${qty} ${b.gpu} sold to ${b.name}. Cash received. Your anchor order and Trust are unchanged.`, 'good');
  return true;
}
