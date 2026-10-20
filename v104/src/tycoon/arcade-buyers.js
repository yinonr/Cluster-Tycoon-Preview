import { BUYER_NAMES, negotiationTime } from './exchange.js';
// Finite spot demand for the same prepaid rights. Interest is never booked revenue.
import { stream } from '../util.js';
import { BROKERS, LABS } from './demand.js';
import { cents, cash, owned, notice, record } from './arcade.js';

export function makeBuyers(seed, q, startups = [], tier = 0) {
  const r=stream(seed,'v9-buyers',q), buyers=[], slots=4+tier;
  for(let wave=0;wave<3;wave++) for(let slot=0;slot<slots;slot++) {
    const at=wave===0?0:wave===1?26+slot*3:52+slot*3;
    if(at>64)continue;
    const until=wave===0?26+slot*3:wave===1?Math.min(72,52+slot*3):72;
    const i=buyers.length, gpu=['H100','H200','B200'][(slot+wave)%3];
    const qty=r.pick(tier===2?[4,6,8,12]:[2,4,6]);
    const posture=r.pick(['firm','cautious','flexible','urgent']);
    const room=posture==='firm'?0:posture==='cautious'?r.int(3,9):posture==='flexible'?r.int(12,28):r.int(18,38);
    const rate={H100:248,H200:320,B200:488}[gpu]+r.int(-32,24);
    const budget=cents(qty,rate+room);
    buyers.push({id:`q${q}-b${i}`,slot,name:BUYER_NAMES[(i+q*5)%BUYER_NAMES.length],gpu,qty,filled:0,rate,openingRate:rate,ceiling:rate+room,budget,initialBudget:budget,at,until,posture,flash:until-at<20,premium:posture==='urgent',reason:{firm:'Fixed procurement price',cautious:'A narrow purchasing allowance',flexible:'Room for a sensible proposal',urgent:'A launch deadline and a larger allowance'}[posture],negotiation:{counters:0,walked:false,tape:[{speaker:'BUYER',text:`I need ${qty} ${gpu} for this service period. Here is my funded bid.`}]}});
  }
  return buyers.sort((a,b)=>a.at-b.at);
}
export const buyerLive = (g, b) => g.phase === 'floor' && !b.negotiation.walked && b.at <= g.arcade.time && g.arcade.time < b.until && b.filled < b.qty && b.budget >= cents(1, b.rate);
export function counterBuyer(g, offer, qty) {
  const b=g.arcade.buyers.find(b=>b.id===g.arcade.confirm?.buyerId),n=b?.negotiation;
  if(g.arcade.active||g.arcade.signing||!b||!buyerLive(g,b)||n.counters>=2||!Number.isSafeInteger(offer)||offer<=b.rate||!Number.isSafeInteger(qty)||qty<1||qty>b.qty-b.filled)return false;
  const before=b.rate, remaining=b.qty-b.filled;
  n.counters++;negotiationTime(g);
  n.tape.push({speaker:'YOU',text:`${qty} GPUs at $${(offer/100).toFixed(2)} per GPU-hour.`,qty,offer});
  let outcome,text;
  // The authority and money were funded at generation, never at negotiation/signing.
  const cap=Math.min(b.ceiling,Math.floor(b.budget/cents(1,1)/qty));
  const room=Math.max(0,cap-before), pressure=offer-before;
  if(g.arcade.time>=b.until){outcome='expired';text='My procurement window closed. We missed it.';}
  else if(pressure>Math.max(12,(b.ceiling-b.openingRate)*1.7)||b.posture==='firm'&&n.counters===2){
    n.walked=true;outcome='walk';text='That is outside my mandate. I am pulling this order.';
  }else if(!room||b.posture==='firm'||b.posture==='cautious'&&pressure>room){
    outcome='hold';text='The bid stands. I cannot justify that increase.';
  }else if(offer<=cap&&(b.posture==='urgent'||pressure<=Math.max(2,Math.floor(room*.65)))){
    b.rate=offer;outcome='accept';text=`Agreed. $${(b.rate/100).toFixed(2)}. Send the contract.`;
  }else{
    b.rate=Math.min(cap,before+Math.max(1,Math.floor(room*.45)));outcome='counter';text=`I can get to $${(b.rate/100).toFixed(2)}. That is a funded number.`;
  }
  const affordable=Math.min(remaining,Math.floor(b.budget/cents(1,b.rate)));
  if(affordable<remaining)text+=` My remaining budget covers ${affordable} at that rate.`;
  if(n.counters===2&&!n.walked)text+=' Final bid.';
  n.tape.push({speaker:b.name,text,outcome,before,after:b.rate,qty});
  notice(g,text,outcome==='walk'||outcome==='expired'?'bad':b.rate>before?'good':'plain');return true;
}
export function saleQuote(g, id, qty) {
  const b = g.arcade.buyers.find(b => b.id === id);
  if (!b || !buyerLive(g, b) || !Number.isSafeInteger(qty) || qty <= 0 || qty > b.qty - b.filled || qty > owned(g, b.gpu)) return null;
  const revenue = cents(qty, b.rate);
  // The whale's completion bonus is part of the funded budget, paid only by the sale that completes the order.
  const bonus = b.whale && !b.whale.paid && b.filled + qty === b.qty ? b.whale.bonus : 0;
  if (revenue + bonus > b.budget) return null;
  let left = qty, cost = 0; const legs = [];
  for (const x of g.arcade.inventory.filter(x => x.gpu === b.gpu && x.left)) {
    const take = Math.min(left, x.left); left -= take; cost += take * x.unitCost; legs.push({ id: x.id, qty: take });
    if (!left) break;
  }
  return { buyerId: id, gpu: b.gpu, qty, rate:b.rate, cost, revenue: revenue + bonus, bonus, legs };
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
  if (d.bonus) { b.whale.paid = true; g.clout += 60; }
  g.clout += 5;
  record(g, 'trade', d.revenue - d.cost, { buyer: b.name, qty, gpu: b.gpu, whale: !!b.whale });
  g.cash = (cash(g) + d.revenue) / 100;
  g.profit = (Math.round(g.profit * 100) + d.revenue - d.cost) / 100;
  g.arcade.sales.push(d); g.arcade.confirm = null;
  notice(g, d.bonus ? `${b.name}'s whole block delivered. Premium paid plus the completion bonus. Clout +60.` : `${qty} ${b.gpu} sold to ${b.name}. Cash received.`, 'good');
  return true;
}
