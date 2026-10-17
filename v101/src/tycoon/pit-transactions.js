// Presentation adapters use the same quotes and commit functions as the market.
// Call mutating adapters through arcadeStore.act; projections never touch a save.
import { activeLot, available, buy, cash, cents, claim, deliver, deliveryQuote, inventoryCost, notice, owned, V7 } from './arcade.js';
import { buyerLive, reviewBuyer, saleQuote } from './arcade-buyers.js';

export function sourceBuyer(g, lotId, buyerId = g.arcade.confirm?.buyerId) {
  const a = g.arcade, b = a.buyers.find(b => b.id === buyerId), l = a.lots.find(l => l.id === lotId);
  if (a.active || a.signing || a.confirm?.receipt || !b || !buyerLive(g, b) || !l || l.gpu !== b.gpu || !available(g, l) || l.negotiation?.closed) return false;
  if (a.confirm && a.confirm.buyerId !== buyerId) return false;
  const previous = a.confirm;
  a.confirm = null;
  if (!claim(g, lotId)) { a.confirm = previous; return false; }
  a.sourcingFor = buyerId;
  notice(g, `Sourcing for ${b.name}. Their budget and deadline are still live; no capacity is reserved.`);
  return true;
}

export function returnToBuyer(g) {
  const a = g.arcade, id = a.sourcingFor;
  if (!id || a.active || a.signing || a.confirm) return false;
  const b = a.buyers.find(b => b.id === id);
  a.sourcingFor = null;
  if (b && buyerLive(g, b) && reviewBuyer(g, id)) return true;
  notice(g, `${b?.name || 'The remembered buyer'} is no longer available. Your purchased inventory is still yours; find another customer.`, 'bad');
  return false;
}

export function postReceipt(g) {
  const receipt = g.arcade.confirm?.receipt;
  if (!receipt || g.arcade.signing) return false;
  g.arcade.confirm = null;
  if (receipt.kind === 'purchase' && g.arcade.sourcingFor) returnToBuyer(g);
  return true;
}

export function deliverWithReceipt(g) {
  const a = g.arcade, pending = a.confirm;
  if (a.signing || !pending?.orderId || a.time >= V7.seconds) return false;
  const d = deliveryQuote(g, pending.orderId, pending.qty, pending.payment);
  if (!d) return false;
  const o = a.orders.find(o => o.id === d.orderId), s = g.startups.find(s => s.id === o.client), ownershipBefore = s.stake;
  if (!deliver(g)) return false;
  const receipt = { ...d, kind: 'startup', counterparty: s.name, gpu: o.gpu, total: d.revenue,
    ownershipBefore, ownershipAfter: s.stake, equityReceived: s.stake - ownershipBefore,
    id: `q${g.q}-fill${a.receipts.length + 1}`, q: g.q };
  a.receipts.push(receipt); a.confirm = { receipt };
  return true;
}

// Investigate one selected match. This never discovers or ranks better trades.
// Buying on a clone preserves existing FIFO inventory ahead of the proposed lot.
export function matchedProjection(g, lotId = activeLot(g)?.id, { buyerId = g.arcade.sourcingFor, orderId, qty, payment = 'cash' } = {}) {
  const l = g.arcade.lots.find(l => l.id === lotId);
  if (!l || !available(g, l) || l.negotiation?.closed || l.negotiation?.running) return null;
  const next = structuredClone(g), a = next.arcade;
  if (a.signing || (a.active && a.active !== lotId)) return null;
  a.confirm = null;
  if (!a.active && !claim(next, lotId)) return null;
  const beforeStock = owned(next, l.gpu), beforeBasis = inventoryCost(next);
  const price = activeLot(next).negotiation.price, purchaseCost = cents(l.qty, price);
  if (!buy(next)) return null;
  let quote, customer, kind;
  if (buyerId) {
    const b = a.buyers.find(b => b.id === buyerId);
    if (!b || b.gpu !== l.gpu || !buyerLive(next, b)) return null;
    const max = Math.min(owned(next, l.gpu), b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate)));
    quote = saleQuote(next, b.id, qty ?? max); customer = b.name; kind = 'buyer';
  } else if (orderId) {
    const o = a.orders.find(o => o.id === orderId), s = o && next.startups.find(s => s.id === o.client);
    if (!o || o.gpu !== l.gpu || !s) return null;
    const max = Math.min(owned(next, l.gpu), o.qty - o.delivered, payment === 'cash' ? Math.floor(Math.round(s.cash * 100) / cents(1, o.rate)) : Infinity);
    quote = deliveryQuote(next, o.id, qty ?? max, payment); customer = o.name; kind = 'startup';
  }
  if (!quote) return null;
  const purchasedUsed = quote.legs.find(leg => leg.id === l.id)?.qty || 0;
  const matchingBasis = a.inventory.filter(x => x.gpu === l.gpu).reduce((n, x) => n + x.left * x.unitCost, 0);
  return { ...quote, kind, customer, purchaseCost, cashAfterPurchase: cash(next),
    cashAfterSale: cash(next) + quote.revenue, conditionalProfit: quote.revenue - quote.cost,
    beforeStock, beforeBasis, purchasedUsed, purchasedLeft: l.qty - purchasedUsed,
    purchasedResidualBasis: cents(l.qty - purchasedUsed, price),
    residualQty: owned(next, l.gpu) - quote.qty, residualBasis: matchingBasis - quote.cost };
}
