import { supplierStyle, negotiationTime } from './exchange.js';
import { stream } from '../util.js';
import { activeLot, notice } from './arcade.js';
export function openingNegotiation(g,l) {
  const posture=l.liquidation?'flexible':supplierStyle(l.firm), firm=posture==='firm', trust=g.firms[l.firm]?.trust||0;
  return { ...(g.arcade.version>=101?{rapport:'cold'}:{}), charmUnlocked:false, price:l.ask, base:l.ask, haggles:0, attempts:[], running:null, closed:false, patience:Math.max(2,(posture==='patient'?4:firm?2:3)+(trust>=4?1:trust<0?-1:0)), posture, tape:[{speaker:l.firm,text:firm?'My book is nearly full. Give me a reason to move.':'Bring me your number. I have room, but not all afternoon.'}] };
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
  if(g.arcade.version>=101){
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
// V10.2 Rival Quote: a live competing quote for the same GPU is the one reason a
// seller must answer. Real market data only; one play per lot, before Charm.
const quoteRate = x => x.negotiation?.price ?? x.ask;
const RIVAL_BEAT = Object.freeze({firm:0,patient:1,flexible:2});
export function rivalQuotes(g) {
  const l=activeLot(g), n=l?.negotiation;
  if(g.phase!=='floor'||!n||n.closed||n.running||n.attempts.length||n.leverage||n.patience<=0||g.arcade.signing||l.status!=='open'||l.until<=g.arcade.time)return [];
  // A rival's quote stays live while you cool off with that desk; only its own window counts.
  return g.arcade.lots.filter(x=>x.id!==l.id&&x.gpu===l.gpu&&x.firm!==l.firm&&x.status==='open'&&x.at<=g.arcade.time&&x.until>g.arcade.time&&!x.negotiation?.closed&&quoteRate(x)<n.price)
    .map(x=>({id:x.id,firm:x.firm,qty:x.qty,rate:quoteRate(x),until:x.until})).sort((a,b)=>a.rate-b.rate||a.until-b.until);
}
export function playRival(g, rivalId) {
  const rival=rivalQuotes(g).find(x=>x.id===rivalId), l=activeLot(g), n=l?.negotiation;
  if(!rival)return false;
  const before=n.price, quoted=rival.rate;
  n.haggles++;n.patience--;negotiationTime(g);
  n.tape.push({speaker:'YOU',text:`${rival.firm} is quoting $${(quoted/100).toFixed(2)}.`,rival:rival.id,offer:quoted});
  let text, outcome;
  if(quoted<l.floor){
    outcome='decline';
    text=n.posture==='firm'?'Then go buy from them. My quote stands.':`I cannot touch $${(quoted/100).toFixed(2)}. If they will really sell there, take it.`;
    if(n.rapport!=='irritated')n.rapport='guarded';
  }else{
    n.price=Math.max(l.floor,quoted-RIVAL_BEAT[n.posture]);
    outcome=n.price<quoted?'beat':'match';
    text=n.posture==='firm'?`Fine. I match $${(n.price/100).toFixed(2)}. Do not make a habit of it.`:n.posture==='patient'?`I will not lose this to ${rival.firm}. $${(n.price/100).toFixed(2)}.`:`${rival.firm}? I can beat that. $${(n.price/100).toFixed(2)}.`;
    if(n.rapport!=='irritated')n.rapport=n.posture==='firm'?'guarded':'receptive';
  }
  if(!n.patience&&!n.closed)text+=' That is my last counter. What is it going to be?';
  if(l.until<=g.arcade.time){n.closed=true;outcome='expired';text='The window closed while we were bargaining. I cannot sell that period now.';}
  if(before-n.price>=3&&!n.closed)n.charmUnlocked=true;
  n.base=n.price;
  n.leverage={rival:rival.id,firm:rival.firm,rate:quoted,outcome,before,after:n.price};
  n.tape.push({speaker:l.firm,text,outcome,before,after:n.price,patience:n.patience});
  notice(g,text,n.price<before?'good':'plain');return true;
}
