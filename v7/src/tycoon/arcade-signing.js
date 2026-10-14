// Signing is a persisted review followed by one atomic commit. Animation is read-only.
import { activeLot, buy, cents } from './arcade.js';
import { secondaryQuote, sellSecondary } from './arcade-vc.js';
import { saleQuote, sellBuyer } from './arcade-buyers.js';
export function prepareSigning(g, kind, qty) {
  const a = g.arcade;
  if (a.signing || a.confirm?.receipt) return false;
  let doc;
  if (kind === 'purchase') {
    const l = activeLot(g), n = l?.negotiation;
    if (!n || n.closed || n.running) return false;
    doc = { kind, counterparty: l.firm, gpu: l.gpu, qty: l.qty, rate: n.price, total: cents(l.qty, n.price) };
  } else if (kind === 'buyer') {
    const d = saleQuote(g, a.confirm?.buyerId, qty);
    if (!d) return false;
    const b = a.buyers.find(b => b.id === d.buyerId);
    doc = { kind, counterparty: b.name, gpu: b.gpu, qty, rate: b.rate, total: d.revenue };
  } else if (kind === 'secondary') {
    const d=secondaryQuote(g,a.confirm?.vcId,qty);if(!d)return false;
    doc={kind,counterparty:d.counterparty,gpu:`% of ${d.company} ownership`,qty:Number((d.sold*100).toFixed(6)),bps:qty,rate:d.bidVal,total:d.proceeds};
  } else return false;
  a.signing = doc; return true;
}
export function signTrade(g) {
  const d = g.arcade.signing;
  if (!d) return false;
  if(d.kind==='purchase') {
    const l=activeLot(g);
    if(!l||l.firm!==d.counterparty||l.gpu!==d.gpu||l.qty!==d.qty||l.negotiation.price!==d.rate||cents(l.qty,d.rate)!==d.total)return false;
  } else if(d.kind==='buyer') {
    const quote=saleQuote(g,g.arcade.confirm?.buyerId,d.qty);
    if(!quote||quote.revenue!==d.total||quote.gpu!==d.gpu)return false;
  } else if(d.kind==='secondary') {
    const quote=secondaryQuote(g,g.arcade.confirm?.vcId,d.bps);
    if(!quote||quote.proceeds!==d.total||quote.bidVal!==d.rate)return false;
  } else return false;
  const ok = d.kind === 'purchase' ? buy(g) : d.kind === 'secondary' ? sellSecondary(g,d.bps) : sellBuyer(g, d.qty);
  if (!ok) return false;
  g.arcade.signing = null;
  const receipt = { ...d, id: `q${g.q}-fill${g.arcade.receipts.length + 1}`, q: g.q };
  g.arcade.receipts.push(receipt);
  g.arcade.confirm = { receipt };
  return true;
}
