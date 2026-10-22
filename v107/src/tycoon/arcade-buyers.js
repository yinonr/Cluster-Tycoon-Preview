// V10.5 resale desk: a few funded spot bids for spare (unreserved) capacity. Interest is
// never booked revenue; a sale realizes cash at the signed bid. Reserved units never sell.
import { negotiationTime } from './exchange.js';
import { cents, cash, owned, notice, record } from './arcade.js';
import { freeIn } from './founder.js';

export const buyerLive = (g, b) => g.phase === 'floor' && !b.negotiation.walked && b.at <= g.arcade.time && g.arcade.time < b.until && b.filled < b.qty && b.budget >= cents(1, b.rate);
export function counterBuyer(g, offer, qty) {
  const b = g.arcade.buyers.find(b => b.id === g.arcade.confirm?.buyerId), n = b?.negotiation;
  if (g.arcade.active || g.arcade.signing || !b || !buyerLive(g, b) || n.counters >= 2 || !Number.isSafeInteger(offer) || offer <= b.rate || !Number.isSafeInteger(qty) || qty < 1 || qty > b.qty - b.filled) return false;
  const before = b.rate, remaining = b.qty - b.filled;
  n.counters++; negotiationTime(g);
  n.tape.push({ speaker: 'YOU', text: `${qty} GPUs at $${(offer / 100).toFixed(2)} per GPU-hour.`, qty, offer });
  let outcome, text;
  const cap = Math.min(b.ceiling, Math.floor(b.budget / cents(1, 1) / qty));
  const room = Math.max(0, cap - before), pressure = offer - before;
  if (g.arcade.time >= b.until) { outcome = 'expired'; text = 'My window closed. We missed it.'; }
  else if (pressure > Math.max(12, (b.ceiling - b.openingRate) * 1.7) || b.posture === 'firm' && n.counters === 2) { n.walked = true; outcome = 'walk'; text = 'That is outside my budget. I am out.'; }
  else if (!room || b.posture === 'firm' || b.posture === 'cautious' && pressure > room) { outcome = 'hold'; text = 'The bid stands.'; }
  else if (offer <= cap && pressure <= Math.max(2, Math.floor(room * .65))) { b.rate = offer; outcome = 'accept'; text = `Agreed. $${(b.rate / 100).toFixed(2)}.`; }
  else { b.rate = Math.min(cap, before + Math.max(1, Math.floor(room * .45))); outcome = 'counter'; text = `I can get to $${(b.rate / 100).toFixed(2)}.`; }
  const affordable = Math.min(remaining, Math.floor(b.budget / cents(1, b.rate)));
  if (affordable < remaining) text += ` My budget covers ${affordable} at that rate.`;
  if (n.counters === 2 && !n.walked) text += ' Final bid.';
  n.tape.push({ speaker: b.name, text, outcome, before, after: b.rate, qty });
  notice(g, text, outcome === 'walk' || outcome === 'expired' ? 'bad' : b.rate > before ? 'good' : 'plain'); return true;
}
export function saleQuote(g, id, qty) {
  const b = g.arcade.buyers.find(b => b.id === id);
  if (!b || !buyerLive(g, b) || !Number.isSafeInteger(qty) || qty <= 0 || qty > b.qty - b.filled || qty > owned(g, b.gpu)) return null;
  const revenue = cents(qty, b.rate);
  if (revenue > b.budget) return null;
  let left = qty, cost = 0; const legs = [];
  for (const x of g.arcade.inventory.filter(x => x.gpu === b.gpu && freeIn(g, x) > 0)) {
    const take = Math.min(left, freeIn(g, x)); left -= take; cost += take * x.unitCost; legs.push({ id: x.id, qty: take });
    if (!left) break;
  }
  return { buyerId: id, gpu: b.gpu, qty, rate: b.rate, cost, revenue, legs };
}
export function reviewBuyer(g, id) {
  const b = g.arcade.buyers.find(b => b.id === id);
  if (g.arcade.signing || g.arcade.active || g.arcade.confirm || !b || !buyerLive(g, b)) return false;
  g.arcade.confirm = { buyerId: id }; return true;
}
export function sellBuyer(g, qty) {
  if (g.arcade.active || !g.arcade.confirm?.buyerId) return false;
  const d = saleQuote(g, g.arcade.confirm.buyerId, qty);
  if (!d) return false;
  const b = g.arcade.buyers.find(b => b.id === d.buyerId);
  for (const leg of d.legs) g.arcade.inventory.find(x => x.id === leg.id).left -= leg.qty;
  b.filled += qty; b.budget -= d.revenue;
  g.clout += 5;
  record(g, 'resale', d.revenue);
  g.cash = (cash(g) + d.revenue) / 100;
  g.profit = (Math.round(g.profit * 100) + d.revenue - d.cost) / 100;
  g.arcade.sales.push(d); g.arcade.confirm = null;
  notice(g, `${qty} ${b.gpu} resold to ${b.name}. Cash received.`, 'good');
  return true;
}
