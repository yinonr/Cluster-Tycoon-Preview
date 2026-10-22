// Signing is a persisted review followed by one atomic commit. Animation is read-only.
// V10.5 documents: a supplier purchase, a resale of spare capacity, an investor term sheet.
import { activeLot, buy, cents } from './arcade.js';
import { saleQuote, sellBuyer } from './arcade-buyers.js';
import { termQuote, signTerm } from './investors.js';
export function prepareSigning(g, kind, qty) {
  const a = g.arcade;
  if (g.phase !== 'floor' || a.signing || a.confirm?.receipt) return false;
  let doc;
  if (kind === 'purchase') {
    const l = activeLot(g), n = l?.negotiation;
    if (!n || n.closed || n.running) return false;
    doc = { kind, counterparty: l.firm, gpu: l.gpu, qty: l.qty, rate: n.price, total: cents(l.qty, n.price), savings: cents(l.qty, l.ask - n.price) };
  } else if (kind === 'buyer') {
    const d = saleQuote(g, a.confirm?.buyerId, qty);
    if (!d) return false;
    const b = a.buyers.find(b => b.id === d.buyerId);
    doc = { kind, buyerId: b.id, counterparty: b.name, gpu: b.gpu, qty, rate: b.rate, total: d.revenue, cost: d.cost, legs: d.legs };
  } else if (kind === 'term') {
    const d = termQuote(g);
    if (!d) return false;
    doc = { kind, termId: d.termId, counterparty: d.name, gpu: 'equity', qty: d.pct, rate: d.pre, total: d.amount, shares: d.shares, founderBefore: d.founderBefore, founderAfter: d.founderAfter, post: d.post };
  } else return false;
  a.signing = doc; return true;
}
export function signTrade(g) {
  const d = g.arcade.signing;
  if (!d) return false;
  if (d.kind === 'purchase') {
    const l = activeLot(g);
    if (!l || l.firm !== d.counterparty || l.gpu !== d.gpu || l.qty !== d.qty || l.negotiation.price !== d.rate || cents(l.qty, d.rate) !== d.total) return false;
  } else if (d.kind === 'buyer') {
    const quote = saleQuote(g, g.arcade.confirm?.buyerId, d.qty);
    if (!quote || quote.buyerId !== d.buyerId || quote.revenue !== d.total || quote.rate !== d.rate || quote.cost !== d.cost || JSON.stringify(quote.legs) !== JSON.stringify(d.legs) || quote.gpu !== d.gpu) return false;
  } else if (d.kind === 'term') {
    const quote = termQuote(g);
    if (!quote || quote.termId !== d.termId || quote.amount !== d.total || quote.pct !== d.qty || quote.shares !== d.shares) return false;
  } else return false;
  const ok = d.kind === 'purchase' ? buy(g) : d.kind === 'term' ? signTerm(g) : sellBuyer(g, d.qty);
  if (!ok) return false;
  g.arcade.signing = null;
  const receipt = { ...d, id: `q${g.q}-fill${g.arcade.receipts.length + 1}`, q: g.q };
  g.arcade.receipts.push(receipt);
  g.arcade.confirm = { receipt };
  return true;
}
