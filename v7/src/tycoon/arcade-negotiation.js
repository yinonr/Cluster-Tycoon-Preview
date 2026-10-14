import { stream } from '../util.js';
import { activeLot, notice } from './arcade.js';
export function openingNegotiation(g,l) {
  const r=stream(g.seed,'v72-patience',l.id), firm=r.next()<.28;
  return { price:l.ask, base:l.ask, haggles:0, attempts:[], running:null, closed:false, patience:firm?2:3, posture:firm?'firm':'flexible', tape:[{speaker:l.firm,text:firm?'This quote is firm. Pushing for a discount costs Trust.':'Bring me your number. I have room, but not all afternoon.'}] };
}
export function counteroffer(g, offer) {
  const l=activeLot(g), n=l?.negotiation;
  if(!n||n.closed||n.running||n.attempts.length||g.arcade.signing||n.patience<=0||!Number.isSafeInteger(offer)||offer<=0||offer>n.price)return false;
  const before=n.price, room=l.ask-l.floor;
  n.haggles++;n.patience--;
  n.tape.push({speaker:'YOU',text:`$${(offer/100).toFixed(2)} per GPU-hour`,offer});
  let text, outcome;
  if(offer<l.floor || before-offer>room*.85){
    n.patience=Math.max(0,n.patience-1);outcome='hold';text='Too light. My quote stands. One more offer like that and I am out.';
    if(!n.patience){outcome='walk';text='We are done. Find another desk.';n.closed=true;l.status='walked';const f=g.firms[l.firm]||={trust:0,deals:0};f.trust=Math.max(-12,f.trust-1);}
  }else if(n.posture==='firm' && offer<before){outcome='hold';const f=g.firms[l.firm]||={trust:0,deals:0};f.trust=Math.max(-12,f.trust-1);text='I said this quote is firm. Trust −1. Take it, try Rizz, or walk.';}
  else if(before-offer<=Math.max(1,Math.floor(room*.20))){n.price=offer;outcome='accept';text='That is a serious number. Agreed.';}
  else {n.price=Math.max(l.floor,before-Math.max(1,Math.min(Math.floor(room*.18),Math.floor((before-offer)/2))));outcome='counter';text=`Meet me at $${(n.price/100).toFixed(2)}. That is a real quote.`;}
  if(!n.patience&&!n.closed)text+=' Final price. Sign, try Rizz, or walk.';
  n.base=n.price;
  n.tape.push({speaker:l.firm,text,outcome,before,after:n.price,patience:n.patience});
  notice(g,text,outcome==='walk'?'bad':n.price<before?'good':'plain');return true;
}
