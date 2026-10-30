// Focused resale projections and adapters. Pricing and settlement remain the
// production buyer -> signing -> signed receipt transaction, in integer cents.
import { GPUS } from './founder.js';
import { stockOf, owned, cents, V7, notice } from './arcade.js';
import { buyerLive, saleQuote, reviewBuyer } from './arcade-buyers.js';
import { prepareSigning, signTrade } from './arcade-signing.js';

const messages={stock:'No stock available.',committed:'Committed to your current tasks.',demand:'This buyer has filled its demand.',
  budget:'This buyer has no funded demand remaining.',future:'This buyer has not arrived yet.',expired:'This buyer’s offer has expired.',
  walked:'This buyer has left the floor.',negotiating:'Finish the current Charm attempt first.',quantity:'Choose a positive whole-number quantity.',
  excessive:'That quantity exceeds available stock or this buyer’s remaining funded demand.',none:'No matching buyers right now.',busy:'Close the current transaction first.'};
const holdings=(g,gpu)=>({owned:stockOf(g,gpu),committed:g.arcade.reservations.filter(r=>r.gpu===gpu).reduce((n,r)=>n+r.qty,0),free:owned(g,gpu)});
function buyerModel(g,b) {
  const stock=holdings(g,b.gpu),remaining=Math.max(0,b.qty-b.filled),budgetQty=Math.max(0,Math.floor(b.budget/cents(1,b.rate)));
  const live=buyerLive(g,b),locked=b.negotiation.lockedQty || Number.MAX_SAFE_INTEGER;
  let maxQty=live&&!b.negotiation.running?Math.max(0,Math.min(stock.free,remaining,budgetQty,locked)):0;
  if(maxQty>0 && !saleQuote(g,b.id,1))maxQty=0;
  let reason=null;
  if(g.phase!=='floor')reason='busy';else if(b.negotiation.walked)reason='walked';else if(g.arcade.time<b.at)reason='future';
  else if(g.arcade.time>=b.until)reason='expired';else if(!remaining)reason='demand';else if(!budgetQty)reason='budget';
  else if(b.negotiation.running)reason='negotiating';else if(!stock.free)reason=stock.owned?'committed':'stock';
  return {id:b.id,name:b.name,gpu:b.gpu,remaining,rate:b.rate,hours:V7.hours,deadline:b.until,secondsLeft:Math.max(0,b.until-g.arcade.time),
    ...stock,maxQty,eligible:maxQty>0,live,reason,message:messages[reason] || '',partial:true,buyer:b};
}
export const buyerMatches=(g,gpu=null)=>g.arcade.buyers.filter(b=>!gpu || b.gpu===gpu).map(b=>buyerModel(g,b));
export function inventoryRows(g) {
  return GPUS.map(gpu=>{
    const stock=holdings(g,gpu),matches=buyerMatches(g,gpu).filter(b=>b.eligible).length;
    const reason=!stock.free?(stock.owned?'committed':'stock'):!matches?'none':null;
    return {gpu,...stock,matches,reason,message:messages[reason] || ''};
  });
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function snapshot(g,b,quote) {
  return {version:1,round:g.q,buyer:structuredClone(b),
    inventory:structuredClone(g.arcade.inventory.filter(x=>x.gpu===b.gpu)),
    reservations:structuredClone(g.arcade.reservations.filter(r=>r.gpu===b.gpu)),quote:structuredClone(quote)};
}
export function saleReview(g,id,qty) {
  const b=g.arcade.buyers.find(b=>b.id===id),model=b?buyerModel(g,b):null;
  const quote=b?saleQuote(g,id,qty):null,current=quote?snapshot(g,b,quote):null;
  const saved=g.arcade.confirm?.buyerId===id?g.arcade.confirm.saleReview:null;
  const reason=!model?'none':!Number.isSafeInteger(qty)||qty<=0?'quantity':model.reason || (!quote?'excessive':null);
  return {valid:!!quote,stale:!!saved && !same(saved.expected,current),maxQty:model?.maxQty || 0,qty,quote,snapshot:current,
    expected:saved?.expected || null,reason,message:messages[reason] || '',
    owned:model?.owned || 0,committed:model?.committed || 0,free:model?.free || 0,
    remainingFree:quote?model.free-qty:model?.free || 0,remainingOwned:quote?model.owned-qty:model?.owned || 0,
    buyer:model,hours:V7.hours,fees:0,payment:'immediate'};
}
export function reviewSale(g,id,qty) {
  const a=g.arcade;
  if (a.active || a.signing || a.confirm && a.confirm.buyerId!==id) return false;
  const b=g.arcade.buyers.find(b=>b.id===id);
  if(!b)return false;
  qty=qty===undefined?buyerModel(g,b).maxQty:qty;
  const review=saleReview(g,id,qty);
  if(!review.valid)return false;
  if(!a.confirm && !reviewBuyer(g,id))return false;
  a.confirm.saleReview={version:1,qty,expected:review.snapshot};
  return true;
}
export function updateSaleReview(g,qty) {
  const a=g.arcade,id=a.confirm?.buyerId;
  if(a.active || a.signing || !a.confirm?.saleReview)return false;
  const review=saleReview(g,id,qty);
  if(!review.valid)return false;
  a.confirm.saleReview={version:1,qty,expected:review.snapshot};return true;
}
export function refreshSaleReview(g) {
  const a=g.arcade,saved=a.confirm?.saleReview,id=a.confirm?.buyerId;
  if(a.active || a.signing || !saved)return false;
  let qty=saved.qty,review=saleReview(g,id,qty);
  if(!review.valid && review.maxQty>0){qty=Math.min(qty,review.maxQty);review=saleReview(g,id,qty);}
  a.confirm.saleReview={version:1,qty,expected:review.snapshot};
  notice(g,review.valid?'The offer or stock changed. Review the updated quantity and proceeds, then confirm again.':review.message,'plain');
  return true;
}
export function confirmSale(g,{buyerId,qty,expected}={}) {
  const a=g.arcade,saved=a.confirm?.saleReview;
  if(a.active || a.signing || !saved || a.confirm.buyerId!==buyerId || saved.qty!==qty || !expected || !same(saved.expected,expected))return false;
  const review=saleReview(g,buyerId,qty);
  if(!review.valid || !same(review.snapshot,expected))return false;
  if(!prepareSigning(g,'buyer',qty))return false;
  if(!signTrade(g)){a.signing=null;return false;}
  const receipt=a.confirm.receipt;
  receipt.payment='received';
  receipt.stock={ownedBefore:review.owned,freeBefore:review.free,committedBefore:review.committed,
    ownedAfter:stockOf(g,receipt.gpu),freeAfter:owned(g,receipt.gpu),committedAfter:holdings(g,receipt.gpu).committed};
  return true;
}

// Stale reviews remain loadable so the player can review their current offer.
// Structural checks prevent damaged review/receipt metadata from being trusted.
export function validResaleSave(g) {
  const r=g.arcade.confirm?.saleReview;
  if(r!==undefined) {
    if(!r || r.version!==1 || !Number.isSafeInteger(r.qty) || r.qty<=0 || typeof g.arcade.confirm.buyerId!=='string' ||
      !g.arcade.buyers.some(b=>b.id===g.arcade.confirm.buyerId))return false;
    const s=r.expected;
    if(s!==null && (!s || s.version!==1 || !Number.isSafeInteger(s.round) || s.round<1 || s.round>5 || s.buyer?.id!==g.arcade.confirm.buyerId ||
      !Array.isArray(s.inventory) || !s.inventory.every(x=>x && typeof x.id==='string' && GPUS.includes(x.gpu) && Number.isSafeInteger(x.left) && x.left>=0 && Number.isSafeInteger(x.qty) && x.left<=x.qty && Number.isSafeInteger(x.unitCost) && x.unitCost>=0) ||
      !Array.isArray(s.reservations) || !s.reservations.every(x=>x && typeof x.inv==='string' && typeof x.card==='string' && GPUS.includes(x.gpu) && Number.isSafeInteger(x.qty) && x.qty>0) ||
      s.quote?.buyerId!==s.buyer.id || s.quote.gpu!==s.buyer.gpu || s.quote.qty!==r.qty ||
      !Number.isSafeInteger(s.quote.rate) || s.quote.rate<=0 || !Number.isSafeInteger(s.quote.revenue) || s.quote.revenue!==cents(r.qty,s.quote.rate) ||
      !Number.isSafeInteger(s.quote.cost) || s.quote.cost<0 || !Array.isArray(s.quote.legs) ||
      !s.quote.legs.every(l=>typeof l.id==='string' && Number.isSafeInteger(l.qty) && l.qty>0) || s.quote.legs.reduce((n,l)=>n+l.qty,0)!==r.qty))return false;
  }
  const current=g.arcade.confirm?.receipt;
  if(current?.stock!==undefined && !g.arcade.receipts.some(r=>r.id===current.id && same(r,current)))return false;
  for(const receipt of g.arcade.receipts) if(receipt.stock!==undefined) {
    const s=receipt.stock;
    if(receipt.kind!=='buyer' || receipt.payment!=='received' || !s ||
      !['ownedBefore','freeBefore','committedBefore','ownedAfter','freeAfter','committedAfter'].every(k=>Number.isSafeInteger(s[k]) && s[k]>=0) ||
      s.ownedBefore!==s.freeBefore+s.committedBefore || s.ownedAfter!==s.freeAfter+s.committedAfter ||
      s.freeBefore-s.freeAfter!==receipt.qty || s.ownedBefore-s.ownedAfter!==receipt.qty || s.committedBefore!==s.committedAfter)return false;
  }
  return true;
}
