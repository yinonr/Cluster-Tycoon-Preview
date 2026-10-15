import { supplierStyle, negotiationTime } from './exchange.js';
import { stream } from '../util.js';
import { activeLot, notice } from './arcade.js';
export function openingNegotiation(g,l) {
  const posture=l.liquidation?'flexible':supplierStyle(l.firm), firm=posture==='firm', trust=g.firms[l.firm]?.trust||0;
  return { ...(g.arcade.version===92?{rapport:'cold'}:{}), charmUnlocked:false, price:l.ask, base:l.ask, haggles:0, attempts:[], running:null, closed:false, patience:Math.max(2,(posture==='patient'?4:firm?2:3)+(trust>=4?1:trust<0?-1:0)), posture, tape:[{speaker:l.firm,text:firm?'My book is nearly full. Give me a reason to move.':'Bring me your number. I have room, but not all afternoon.'}] };
}
export function counteroffer(g, offer) {
  const l=activeLot(g), n=l?.negotiation;
  if(g.phase!=='floor'||l?.until<=g.arcade.time||!n||n.closed||n.running||n.attempts.length||g.arcade.signing||n.patience<=0||!Number.isSafeInteger(offer)||offer<=0||offer>=n.price)return false;
  const before=n.price, room=l.ask-l.floor;
  n.haggles++;n.patience--;negotiationTime(g);
  n.tape.push({speaker:'YOU',text:`$${(offer/100).toFixed(2)} per GPU-hour`,offer});
  let text, outcome;
  if(offer<l.floor || before-offer>room*.85){
    n.patience=Math.max(0,n.patience-1);outcome='hold';text='Too light. My quote stands. One more offer like that and I am out.';
    if(!n.patience){outcome='walk';text='We are done. Find another desk.';n.closed=true;l.status='walked';const f=g.firms[l.firm]||={trust:0,deals:0};f.trust=Math.max(-12,f.trust-1);}
  }else if(n.posture==='firm' && offer<before){outcome='hold';const f=g.firms[l.firm]||={trust:0,deals:0};f.trust=Math.max(-12,f.trust-1);text='That number does not work for me. My quote stands.';}
  else if(before-offer<=Math.max(1,Math.floor(room*.20))){n.price=offer;outcome='accept';text='That is a serious number. Agreed.';}
  else {n.price=Math.max(l.floor,before-Math.max(1,Math.min(Math.floor(room*.18),Math.floor((before-offer)/2))));outcome='counter';text=`Meet me at $${(n.price/100).toFixed(2)}. That is a real quote.`;}
  if(!n.patience&&!n.closed)text+=' That is my last counter. What is it going to be?';
  if(g.arcade.version===92){
    // Per-offer pressure, never cumulative pennies. No bonus stacks; lowballs
    // leave lasting irritation for this lot even if a later quote improves.
    if(offer<l.floor||before-offer>room*.85)n.rapport='irritated';
    else if(n.rapport!=='irritated'){
      if(outcome==='hold')n.rapport='guarded';
      else if(n.price<before&&before-offer>=Math.max(3,Math.ceil(room*.12)))n.rapport='receptive';
    }
  }
  if(l.until<=g.arcade.time){n.closed=true;outcome='expired';text='The window closed while we were bargaining. I cannot sell that period now.';}
  if(before-offer>=3&&!n.closed)n.charmUnlocked=true;
  n.base=n.price;
  n.tape.push({speaker:l.firm,text,outcome,before,after:n.price,patience:n.patience});
  notice(g,text,outcome==='walk'?'bad':n.price<before?'good':'plain');return true;
}
