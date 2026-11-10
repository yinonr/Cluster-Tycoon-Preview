// V22.4 Quick Sell: instant liquidation of free GPUs at a market bid. Buying compute is strategic; selling
// the excess is one tap. The bid is a fixed share of today's market ask (shortage and glut events move it),
// always below what a supplier lot can be bought for (V24.2: Charm can never take a lot under 60% of the market ask,
// see CHARM_LIMITS), so there is no buy-and-sell loop. Only free units sell, oldest first; units committed to a launched build are gone already.
import { cash, cents, record, notice } from './arcade.js';
import { freeIn, freeOf, GPUS } from './founder.js';
import { marketAsk } from './founder-market.js';

export const QUICK_SELL_SHARE = .55;
export const bidRate = (g, gpu) => Math.max(1, Math.floor(marketAsk(g, gpu) * QUICK_SELL_SHARE)); // cents per GPU-hour

export function quickSellQuote(g, gpu, qty) {
  if (!GPUS.includes(gpu) || g.phase !== 'floor') return null;
  const max = freeOf(g, gpu), rate = bidRate(g, gpu);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > max) return { gpu, max, rate, qty: 0, revenue: 0, cost: 0, legs: [], valid: false };
  const legs = []; let want = qty, cost = 0;
  for (const x of g.arcade.inventory.filter(x => x.gpu === gpu)) {
    const take = Math.min(want, freeIn(g, x)); if (take <= 0) continue;
    legs.push({ id: x.id, qty: take }); cost += take * x.unitCost; want -= take; if (!want) break;
  }
  return { gpu, max, rate, qty, revenue: cents(qty, rate), cost, legs, valid: want === 0 };
}

export function quickSell(g, gpu, qty) {
  const a = g.arcade;
  if (g.phase !== 'floor' || a.active || a.signing || a.confirm?.receipt || a.confirm?.built) return false;
  const q = quickSellQuote(g, gpu, qty);
  if (!q?.valid) return false;
  for (const leg of q.legs) a.inventory.find(x => x.id === leg.id).left -= leg.qty;
  record(g, 'resale', q.revenue);
  g.cash = (cash(g) + q.revenue) / 100;
  g.profit = (Math.round(g.profit * 100) + q.revenue - q.cost) / 100;
  a.sales.push({ kind: 'quick', gpu, qty, rate: q.rate, revenue: q.revenue, cost: q.cost, legs: q.legs, q: g.q });
  notice(g, `Sold ${qty} ${gpu} for ${(q.revenue / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.`, 'good');
  return true;
}
