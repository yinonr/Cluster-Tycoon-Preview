// Timing determines outcomes; all displayed stakes come from these same rules.
import { stream } from '../util.js';
import { expireTimed } from './exchange.js';
import { activeLot, available, notice, cents, V7 } from './arcade.js';

export const RAPPORT_WIDTH = Object.freeze({cold:1,receptive:1.12,guarded:.90,irritated:.82});
export const CHARM_RULES = Object.freeze({
  labels:Object.freeze(['Charm','Double Down','Over-Rizz']),
  seconds:Object.freeze([2,3,5]),
  widths:Object.freeze([.30,.16,.07]),
  speeds:Object.freeze([.65,1.05,1.65]),
  concessions:Object.freeze([.30,.32,1]),
  precision:Object.freeze({edge:.5,strong:.75,perfect:1}),
  nearDistance:.08, missDistance:.22,
});
const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:Math.abs(value)%100?2:0,maximumFractionDigits:2}).format(value/100);
const boundedPrice = (l, price) => Math.max(l.floor, Math.min(l.ask, price));

export function rizzParameters(g, lot) {
  const n=lot?.negotiation, attempt=(n?.attempts.length||0)+1;
  if (!n || attempt>3 || n.closed || n.running || !available(g,lot)) return null;
  const trust=g.firms[lot.firm]?.trust||0;
  // Relationships help within caps; each successive tier remains harder.
  const help=Math.max(-.15,Math.min(.25,trust*.015+g.clout*.0003));
  const rapport=n.rapport||'cold';
  return {attempt,trust,clout:g.clout,rapport,timeCost:CHARM_RULES.seconds[attempt-1],
    width:CHARM_RULES.widths[attempt-1]*(1+help)*RAPPORT_WIDTH[rapport],
    speed:CHARM_RULES.speeds[attempt-1]/(1+help),
    phase:stream(g.seed,'v7-rizz',lot.id,attempt).range(0,2),
    concession:Math.min(n.price-lot.floor,Math.max(1,Math.floor((lot.ask-lot.floor)*CHARM_RULES.concessions[attempt-1]))),
  };
}

export function markerAt(params, elapsedMs) {
  if (!Number.isFinite(elapsedMs)||elapsedMs<0) return null;
  const u=(params.phase+elapsedMs/1000*params.speed)%2;
  return u<=1?u:2-u;
}

// Shared non-random miss outcomes, evaluated before activation and at settlement.
function failureOutcome(l,attempt,tier) {
  const n=l.negotiation, index=['near','miss','severe'].indexOf(tier);
  const trust=[[-1,-2,-3],[-2,-4,-6],[-3,-6,-9]][attempt-1][index];
  const clout=[[-1,-2,-4],[-2,-6,-12],[-4,-14,-24]][attempt-1][index];
  const walked=(attempt===2&&tier==='severe')||(attempt===3&&tier!=='near');
  let price;
  if(attempt===1)price=tier==='severe'?l.ask:n.price+Math.max(1,Math.ceil((l.ask-n.price)*(tier==='near'?.25:.65)));
  else if(attempt===2)price=tier==='near'?n.price+Math.max(1,Math.ceil(Math.max(0,n.base-n.price)/2)):l.ask;
  else price=tier==='near'?Math.max(n.base,n.price+1):l.ask;
  return {tier,price:boundedPrice(l,price),trust,clout,walked,rapport:tier==='near'&&n.rapport!=='irritated'?'guarded':'irritated'};
}

// Highest reachable non-walkout price, not a reservation or signing guarantee.
export function failurePrice(l,attempt) {
  return Math.max(...['near','miss','severe'].map(t=>failureOutcome(l,attempt,t)).filter(x=>!x.walked).map(x=>x.price));
}

export function charmStakes(g,l) {
  const n=l?.negotiation;
  if(!n)return null;
  const entry=n.running?n.attempts[n.running-1]:null, p=entry?.params||rizzParameters(g,l);
  if(!p)return null;
  const outcomes=['near','miss','severe'].map(t=>{
    const x=failureOutcome(l,p.attempt,t), trust=g.firms[l.firm]?.trust||0;
    return {...x,trust:Math.max(-12,trust+x.trust)-trust,cost:cents(l.qty,x.price),loss:cents(l.qty,x.price-n.price)};
  });
  const missRate=failurePrice(l,p.attempt), nextTime=Math.min(V7.seconds,g.arcade.time+p.timeCost);
  const remembered=g.arcade.buyers?.find(b=>b.id===g.arcade.sourcingFor);
  return {params:p,attempt:p.attempt,label:CHARM_RULES.labels[p.attempt-1],running:!!entry,
    canStart:!entry&&!g.arcade.signing&&g.arcade.active===l.id&&p.concession>0,
    timeCost:p.timeCost,currentRate:n.price,currentCost:cents(l.qty,n.price),secured:cents(l.qty,l.ask-n.price),
    perfectRate:Math.max(l.floor,n.price-p.concession),perfectCost:cents(l.qty,Math.max(l.floor,n.price-p.concession)),
    savings:cents(l.qty,p.concession),gainsAtRisk:cents(l.qty,missRate-n.price),missCost:cents(l.qty,missRate),
    walkoutTiers:outcomes.filter(x=>x.walked).map(x=>x.tier),trustRisk:Math.min(...outcomes.map(x=>x.trust)),
    cloutRisk:Math.min(...outcomes.map(x=>x.clout)),expiresOnStart:!entry&&(l.until<=nextTime||nextTime>=V7.seconds),
    buyerExpiresOnStart:!entry&&!!remembered&&remembered.until>g.arcade.time&&remembered.until<=nextTime,
    outcomes,
  };
}

export function startRizz(g) {
  const l=activeLot(g),n=l?.negotiation;
  if(g.arcade.signing||!n||n.running)return false;
  const params=rizzParameters(g,l);
  if(!params||params.concession<=0)return false;
  // One persisted action consumes one attempt and its full deterministic time.
  const entry={params,before:n.price,status:'running',timeBefore:g.arcade.time,timeCost:params.timeCost};
  n.attempts.push(entry);n.running=params.attempt;
  g.arcade.time=Math.min(V7.seconds,g.arcade.time+params.timeCost);
  entry.timeAfter=g.arcade.time;
  for(const lot of g.arcade.lots)if(lot.status==='open'&&lot.until<=g.arcade.time)lot.status='expired';
  expireTimed(g);
  if(l.status!=='open'||g.arcade.time>=V7.seconds){
    Object.assign(entry,{status:'resolved',tier:'expired',after:n.price,trust:0,clout:0,walked:false,interrupted:false});
    n.running=null;n.closed=true;l.status='expired';
    n.tape.push({speaker:l.firm,outcome:'expired',text:'Time is money. My quote expired while you pushed.'});
    notice(g,`${CHARM_RULES.labels[params.attempt-1]} used ${params.timeCost}s. The supplier quote expired; no purchase was made.`,'bad');
    return true;
  }
  notice(g,`${CHARM_RULES.labels[params.attempt-1]} · ${params.timeCost}s spent. Stop inside the target. Leaving or reloading during the meter is a severe miss.`);
  return true;
}

export function resolveRizz(g,position,interrupted=false) {
  const l=activeLot(g),n=l?.negotiation;
  if(!n?.running||!Number.isFinite(position)||position<0||position>1)return false;
  const entry=n.attempts[n.running-1];
  if(!entry||entry.status!=='running')return false;
  // A stale quote can never be revived by a perfect stop or reload recovery.
  if(g.phase!=='floor'||n.closed||l.status!=='open'||l.until<=g.arcade.time||g.arcade.time>=V7.seconds){
    Object.assign(entry,{status:'resolved',tier:'expired',after:n.price,trust:0,clout:0,walked:false,interrupted});
    n.running=null;n.closed=true;if(l.status==='open')l.status='expired';
    notice(g,'The quote has expired. Charm cannot restore it.','bad');return true;
  }
  const p=entry.params,distance=Math.max(0,Math.abs(position-.5)-p.width/2);
  const tier=interrupted?'severe':distance<=1e-12?'hit':distance<=CHARM_RULES.nearDistance+1e-12?'near':distance<=CHARM_RULES.missDistance+1e-12?'miss':'severe';
  const accuracy=Math.max(0,1-Math.abs(position-.5)/(p.width/2));
  const precision=tier!=='hit'?null:accuracy>=.8-1e-12?'perfect':accuracy>=.4-1e-12?'strong':'edge';
  const multiplier=precision?CHARM_RULES.precision[precision]:0;
  const reward=precision?Math.min(n.price-l.floor,Math.max(1,Math.floor(p.concession*multiplier))):0;
  let trust=0,clout=0,walked=false;
  if(tier==='hit'){
    n.price=boundedPrice(l,n.price-reward);
    n.rapport=n.rapport==='irritated'?'guarded':'receptive';
  }else{
    const outcome=failureOutcome(l,p.attempt,tier);
    n.price=outcome.price;n.rapport=outcome.rapport;trust=outcome.trust;clout=outcome.clout;walked=outcome.walked;
    if(walked){l.status='walked';n.closed=true;}
  }
  const f=g.firms[l.firm]||={trust:0,deals:0},beforeTrust=f.trust;
  // V10.16: a missed pitch or a walkout cancels any repeat allocation this firm was holding for you.
  if(tier!=='hit')delete f.lock;
  f.trust=Math.max(-12,Math.min(12,f.trust+trust));trust=f.trust-beforeTrust;g.clout+=clout;
  Object.assign(entry,{status:'resolved',position,distance,tier,accuracy,precision,multiplier,reward,interrupted,after:n.price,trust,clout,walked,rapport:n.rapport});
  n.running=null;
  const response=walked?(p.attempt===3?'Greed is expensive. My book is closed to you.':'You pushed a good deal too far. I am out.'):
    tier==='hit'?`${p.attempt===3&&precision==='perfect'?'Unbelievable. That is my absolute floor.':precision==='perfect'?'Right on the money.':'You have a way with people.'} $${(n.price/100).toFixed(2)}. Take the win?`:
    tier==='near'?`Close does not close deals. $${(n.price/100).toFixed(2)} now.`:`That pitch cost you. $${(n.price/100).toFixed(2)}. Last word.`;
  n.tape.push({speaker:l.firm,outcome:walked?'walk':tier==='hit'?'accept':'hold',text:response});
  const result=tier==='hit'?`${precision.toUpperCase()} ${CHARM_RULES.labels[p.attempt-1].toUpperCase()} · ${money(cents(l.qty,entry.before-n.price))} additional savings. ${p.attempt<3&&n.price>l.floor?'Bank the deal or push again.':'Bank your final quote.'}`:
    walked?'SUPPLIER WALKED · this lot is gone.':`${tier==='near'?'NEAR MISS':'MISSED'} · ${money(cents(l.qty,n.price-entry.before))} concessions lost.`;
  notice(g,`${interrupted?'Interrupted attempt settled as a severe miss. ':''}${result}${tier==='hit'?'':` Trust ${trust} · Clout ${clout}.`}`,tier==='hit'?'good':'bad');
  return true;
}

export function recoverRizz(g) {
  return activeLot(g)?.negotiation?.running?resolveRizz(g,0,true):false;
}
