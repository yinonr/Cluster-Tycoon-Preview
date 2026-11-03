import { termLive } from '../tycoon/investors.js';
import { campaignLimit } from '../tycoon/extension.js';
// The simplified company floor: one inventory, task requirements, and contextual sourcing.
// Secondary games and financial details have named destinations; every offer remains engine state.
import { figureSVG } from './character.js';
import { esc } from '../util.js';
import { activeLot, available, cash, cents, owned, V7 } from '../tycoon/arcade.js';
import { buyerLive, saleQuote } from '../tycoon/arcade-buyers.js';
import { buyerMatches, saleReview } from '../tycoon/resale.js';
import { quickSellQuote } from '../tycoon/quick-sell.js';
import { liveOffers } from '../tycoon/scenarios.js';
import { CAST } from '../tycoon/scenario-content.js';
import { companyStats, openCards, cardState, GPUS, freeOf, executionOf } from '../tycoon/founder.js';
import { money as sum, short, pctOf, bpsText, reservedOf, rackStock, plural } from './pit-ledger.js';
import { companyBoard, assets, tray, gpuTag, projectsPanel, pinnedBar } from './pit-company.js';
import { taskDeck } from '../tycoon/task-navigation.js';
import { brokerOffer } from './broker-offer.js';
import { floorSeats, firmDesks } from '../tycoon/pit-layout-state.js';
import { mini, BROKER_SHAPES } from './tetris.js';
import { baburSays, baburPortrait } from './babur.js';

// HUD cash always shows cents (pit-fx rolls it in that format).
const money = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c / 100);
const faceOf = name => [...String(name || 'HSC')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
const rate = n => `$${(n / 100).toFixed(2)}`;
const gpu = name => `<span class="pit-gpu gpu-${esc(name.toLowerCase())}">${esc(name)}</span>`;
const button = (action, text, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${text}</button>`;
// While a desk is open the room is an inert backdrop: no duplicate data-action controls.
const control = (live, action, cls, inner, attrs = '') => live ? `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${inner}</button>` : `<span class="${cls}">${inner}</span>`;
const matches = (g, gpu) => g.arcade.buyers.filter(b => b.gpu === gpu && saleQuote(g, b.id, 1));
const buyerQty = b => Math.max(0, Math.min(b.qty - b.filled, Math.floor(b.budget / cents(1, b.rate))));

// A fuse is the real time window: the controller rewrites its text and --left every 250ms.
function fuse(until, at, now, cls = '') {
  const left = Math.max(0, until - now), span = Math.max(1, until - at);
  return `<span class="pit-fuse ${cls} ${left < 8 ? 'is-short' : ''}" data-fuse style="--left:${Math.min(1, left / span).toFixed(3)}"><b data-station-until="${until}" data-station-at="${at}">${Math.ceil(left)}s</b></span>`;
}

export function person(role, name, { paddle = false } = {}) {
  const i = faceOf(name), investor = role === 'capital' || role === 'investor';
  // HSC design pass: the same cast in 1-bit. Each former colour is now a pattern of the same index (see character.js).
  const P = id => `url(#hsc-f-${id})`;
  return figureSVG({ badge: investor ? 'VC' : role === 'seller' ? 'SUPPLY' : role === 'buyer' ? 'BUYER' : 'HSC', look: {
    skin: ['#F8F7F5', '#E2DCD2', '#B9B1A4', '#8E867A'][i % 4],   // solid tones: no dither on faces (owner, 28 Oct)
    hair: ['#161514', P('p75'), P('hatch'), '#161514'][Math.floor(i / 5) % 4],
    hairStyle: ['slick', 'bob', 'curly', 'short', 'bighair', 'bald'][Math.floor(i / 11) % 6],
    suit: investor ? ['#161514', P('pin'), P('p75')][Math.floor(i / 17) % 3] : role === 'seller' ? [P('check'), P('hound'), P('hatch')][Math.floor(i / 17) % 3] : role === 'buyer' ? [P('p50'), P('chalk'), P('pin')][Math.floor(i / 17) % 3] : '#161514',
    shirt: i % 3 === 1 ? P('shirt') : '#F8F7F5', tie: investor ? P('dots') : [P('stripe'), P('dots'), '#161514'][i % 3], glasses: !!(i % 2), phone: role === 'seller', paddle: paddle || role === 'buyer'
  } });
}

// GPUs some open card still needs: a relevance cue only (never a price ranking).
export function neededGPUs(g) {
  const need = new Set();
  if (g.phase !== 'floor') return need;
  for (const o of openCards(g)) for (const r of cardState(g, o).rows) if (r.short > 0) need.add(r.gpu);
  return need;
}

function station(g, l, seatName, ctx) {
  const a = g.arcade, t = a.time, price = l.negotiation?.price ?? l.ask, opening = l.ask;
  const vacated = ctx.open && a.active === l.id, cooling = !vacated && l.cooldown > t, rival = ctx.open && l.id === ctx.rivalId;
  const live = !ctx.open && !cooling, worked = price !== opening, favor = l.favor, needed = ctx.need.has(l.gpu);
  const cls = `pit-station seller seat-${seatName} ${needed ? 'is-relevant' : ''} ${vacated ? 'is-vacated' : ''} ${cooling ? 'is-cooling' : ''} ${rival ? 'is-rival' : ''} ${worked ? 'is-worked' : ''} ${favor ? 'is-favor' : ''} ${l.event ? 'is-event' : ''} ${l.block ? 'is-block' : ''} broker-station`;
  const total = cents(l.qty, price), affordable = total <= cash(g);
  const state = vacated ? 'Selected' : cooling ? 'Back shortly' : !affordable ? 'Not enough cash' : '';
  const label = `${l.qty} ${l.gpu}, ${sum(total)} total. ${state || 'Review purchase'}. Supplier ${l.firm}`;
  const inner = brokerOffer(l, total, state);

  return live
    ? `<button type="button" class="${cls}" data-action="focus-supplier" data-id="${esc(l.id)}" data-station-id="${esc(l.id)}" aria-label="${esc(label)}">${inner}</button>`
    : `<div class="${cls}" data-station-id="${esc(l.id)}" ${ctx.open ? 'aria-hidden="true"' : `role="group" aria-label="${esc(label)}"`}>${inner}</div>`;
}

// V22: the V20 hall returns as the one game board. Every live broker has a booth; the
// V21 inventory, investor seats and Babur's handoff ride in the same room.
const fastClose = g => g.phase === 'floor' && g.company.builds.some(b => b.q === g.q) ? Math.round(executionOf(g.arcade.time, V7.seconds) * 100) : 0;
export function hud(g,ui,open) {
  const s=companyStats(g),a=g.arcade,clock=Math.max(0,Math.ceil(V7.seconds-a.time)),cashC=cash(g),limit=campaignLimit(g);
  const runway=s.runway===Infinity?'Profitable':`${s.prepaid?'Cash runway':'Runway'} ${plural(s.runway,'rd')}`,red=s.runway!==Infinity&&s.runway<2;
  const busy=g.phase!=='floor'||a.active||a.confirm||a.signing;
  const inventory=GPUS.map(type=>{const free=freeOf(g,type),held=reservedOf(g,type);return button('quick-sell',`${mini({gpu:type,cells:BROKER_SHAPES[type]},'hud-piece')}<span class="hud-gpu-name">${type}</span><strong data-free-gpu="${type}">${free.toLocaleString('en-US')}</strong>${held?`<small>+${held} held</small>`:''}`,`class="hud-gpu gpu-${type.toLowerCase()} ${free?'has-free':''} ${ui.bump?.[type]?'is-bump':''}" data-filter="buyers" data-context="all" data-gpu="${type}" aria-label="${free} available ${type}${held?`, ${held} committed`:''}; sell to interested buyers" ${busy?'disabled':''}`);}).join('');
  return `<header class="pit-hud v22-hud ${cashC>=10000000?'has-large-cash':''} ${cashC>=100000000?'has-huge-cash':''} ${open?'is-paused':''}">
    <div class="hud-co">${button('help','?',`class="pit-help" aria-label="Help" title="How to play" ${activeLot(g)?.negotiation.running?'disabled':''}`)}<span class="hud-name"><b title="${esc(s.name)}">${esc(s.name)}</b><span class="hud-chips"><i class="hud-stage ${s.scale>=2?`is-scale-${s.scale}`:''}">${esc((s.scale>=2?s.scaleName:s.stage).toUpperCase())}</i><i class="hud-model-inline">${esc(s.model)}</i></span></span></div>
    <div class="hud-cash ${ui.bump?.cash?'is-bump':''}"><span>CASH</span><strong data-fx-cash>${money(cashC)}</strong></div>
    <div class="hud-val" title="Estimated paper stake, not final payout"><span>YOUR STAKE</span><strong data-paper-stake="${s.founderValue}">${short(s.founderValue)}</strong><small>est. · <b>${pctOf(s.founderPct)}</b></small></div>
    <div class="hud-flow ${red?'is-red':''}" aria-label="Revenue ${sum(s.revenue)} a round, burn ${sum(s.burn)} a round. ${runway}"><span>REVENUE · BURN</span><strong><i class="rev">+${short(s.revenue)}</i><i class="sep">·</i><i class="burn">−${short(s.burn)}</i></strong><small>${runway}</small></div>
    <nav class="hud-stock" aria-label="Available uncommitted GPUs">${inventory}</nav>
    <div class="hud-round" aria-label="Round ${g.q} of ${limit}"><span>ROUND</span><strong>${g.q}<small>/${limit}</small></strong></div>
    ${g.phase!=='floor'?'<div class="pit-clock is-paused is-closed"><span>FLOOR</span><strong>CLOSED</strong></div>':`<div class="pit-clock ${open?'is-paused':''}"><span>${open?'⏸ PAUSED':'FLOOR'}</span><strong data-floor-clock>${clock}s</strong></div>`}
    ${button('sound',`<span class="pit-sound-icon" aria-hidden="true">${ui.sound?'♫':'♪'}</span>`,`class="pit-sound ${ui.sound?'is-on':''}" aria-label="Sound ${ui.sound?'on; turn off':'off; turn on'}" aria-pressed="${!!ui.sound}"`)}
  </header>`;
}
// A booth: the broker, a CRT with the live quote, and a brass plaque. Highlighting never filters.
// V22.3 supplier quantity at a glance: a lot of <=16 shows one chip per GPU; larger lots show racks of 8
// (plus loose chips), and very large lots blocks of 32. The exact quantity is always printed beside it.
export function gpuChips(qty,gpuName) {
  const n=Math.max(0,Math.floor(qty)),cls=`gpu-${String(gpuName).toLowerCase()}`;
  const dots=k=>'<i class="qc"></i>'.repeat(k);
  let body;
  if (n<=16) body=dots(n);
  else { const big=n>96?Math.floor(n/32):0,rest=n-big*32,racks=Math.floor(rest/8),loose=rest-racks*8;
    body='<i class="qb"></i>'.repeat(big)+'<i class="qr"></i>'.repeat(racks)+dots(loose); }
  return `<span class="desk-chips ${cls} ${n>16?'is-grouped':''}" aria-hidden="true">${body}</span>`;
}
// V22.3 compact desk: a broker (face above the screen, never behind it), an offer screen with the lot drawn
// as chips, and a counter. Tap anywhere to open the negotiation. Same data and controls as the booth.
export function desk(g,slot,ctx) {
  const lot=slot.lot,t=g.arcade.time,prev=slot.previous,ord=ctx.orderOf?ctx.orderOf(slot):0,st=ord?` style="order:${ord}"`:'';
  const face=firm=>firm==='Babur Training Supply'?baburPortrait('broker'):person('seller',firm);
  if (!lot) {
    const status={sold:'SOLD',expired:'GONE',walked:'CLOSED',cooldown:'BACK SOON'}[slot.status]||'';
    return `<div class="v222-desk is-idle ${prev?`is-${esc(slot.status||'gone')}`:'is-vacant'}" data-seat="${slot.seat}"${st} aria-hidden="true">${prev?`<span class="desk-head"><span class="desk-who">${face(prev.firm)}</span><span class="desk-plate">${esc(prev.firm)}</span></span><span class="desk-screen"><b class="desk-away">${status}</b></span>`:''}</div>`;
  }
  const price=lot.negotiation?.price??lot.ask,worked=price!==lot.ask,total=cents(lot.qty,price),cooling=lot.cooldown>t;
  const afford=cash(g)>=total,reach=afford?'full':'none';
  const needed=ctx.need.has(lot.gpu),match=!!ctx.target&&lot.gpu===ctx.target,live=ctx.live&&!cooling;
  const cls=`v222-desk pit-station seller broker-station gpu-${lot.gpu.toLowerCase()} reach-${reach} ${needed?'is-relevant':''} ${match?'is-match':''} ${cooling?'is-cooling':''} ${worked?'is-worked':''} ${lot.favor?'is-favor':''}`;
  const tag=cooling?'<em class="desk-tag">BACK SOON</em>':!afford?'<em class="desk-tag is-cash">SHORT CASH</em>':needed?'<em class="desk-tag is-need">NEEDED</em>':'';
  const askTotal=cents(lot.qty,lot.ask);
  const screen=`<span class="desk-screen"><span class="desk-gpu"><b class="desk-qty">${lot.qty}×</b>${gpu(lot.gpu)}${tag}</span>${gpuChips(lot.qty,lot.gpu)}<span class="desk-total ${afford?'':'is-short'}"><small>TOTAL</small><strong>${sum(total)}</strong>${worked?`<s>${sum(askTotal)}</s>`:''}</span>${fuse(cooling?lot.cooldown:lot.until,cooling?lot.cooldown-5:lot.at,t)}</span>`;
  const inner=`${match?'<i class="desk-quest" aria-hidden="true">!</i>':''}<span class="desk-head"><span class="desk-who" aria-hidden="true">${face(lot.firm)}</span><span class="desk-plate">${esc(lot.firm)}</span></span>${screen}`;
  const label=`${lot.qty} ${lot.gpu} for ${sum(total)} the lot, from ${lot.firm}${!afford?'. Not enough cash for the whole lot':''}${needed?'. Your projects need this GPU':''}${match?'. Matches your search':''}`;
  return live?`<button type="button" class="${cls}" data-seat="${slot.seat}"${st} data-floor-offer data-gpu="${esc(lot.gpu)}" data-action="focus-supplier" data-id="${esc(lot.id)}" data-station-id="${esc(lot.id)}" aria-label="${esc(label)}">${inner}</button>`
    :`<div class="${cls}" data-seat="${slot.seat}"${st} data-station-id="${esc(lot.id)}" aria-hidden="true">${inner}</div>`;
}
export function booth(g,slot,ctx) {
  const lot=slot.lot,a=g.arcade,t=a.time;
  if (!lot) {
    const prev=slot.previous,status={sold:'SOLD',expired:'GONE',walked:'CLOSED',cooldown:'BACK SOON'}[slot.status]||'OPEN BOOTH';
    return `<div class="pit-station seller booth is-empty ${prev?`is-retired is-${esc(slot.status||'gone')}`:''}" data-seat="${slot.seat}" ${prev?`data-seat-status="${esc(slot.status)}"`:''} aria-hidden="true"><span class="pit-station-person">${prev?person('seller',prev.firm):''}</span><span class="pit-crt"><span class="pit-crt-away">${status}</span></span><span class="pit-station-plaque"><b>${esc(prev?.firm||'Open booth')}</b><small>SUPPLIER</small></span></div>`;
  }
  const price=lot.negotiation?.price??lot.ask,worked=price!==lot.ask,total=cents(lot.qty,price),cooling=lot.cooldown>t;
  // V22.1 reach: the whole lot, the part you can pay for (partial purchase), or nothing at all.
  // Only a lot you cannot buy a single GPU of is subdued.
  const can=Math.min(lot.qty,Math.floor(cash(g)/Math.max(1,cents(1,price)))),reach=can>=lot.qty?'full':'none',short_=reach==='none';
  const needed=ctx.need.has(lot.gpu),match=ctx.target&&lot.gpu===ctx.target,live=ctx.live&&!cooling;
  const cls=`pit-station seller booth broker-station gpu-${lot.gpu.toLowerCase()} reach-${reach} ${needed?'is-relevant':''} ${match?'is-match':''} ${match&&ctx.pulse?'is-pulse':''} ${cooling?'is-cooling':''} ${worked?'is-worked':''} ${lot.favor?'is-favor':''} ${lot.block?'is-block':''} ${short_?'is-short-cash':''}`;
  const piece=mini({gpu:lot.gpu,cells:BROKER_SHAPES[lot.gpu]},'booth-piece');
  const screen=cooling?`<span class="pit-crt-head">${lot.qty} ${piece}${gpu(lot.gpu)}</span><span class="pit-crt-away">BACK IN</span>${fuse(lot.cooldown,lot.cooldown-5,t,'is-cooldown')}`
    :`<span class="pit-crt-rate">${worked?`<s>${rate(lot.ask)}</s>`:''}<b>${rate(price)}</b><small>/h</small></span><span class="pit-crt-head">${lot.qty} ${piece}${gpu(lot.gpu)}${needed?'<em class="pit-need">NEEDED</em>':''}</span><span class="pit-crt-total ${short_?'is-short':''}">${reach==='part'?`<em class="pit-part">BUY ${can}</em>`:''}${sum(total)}</span>${fuse(lot.until,lot.at,t)}`;
  const inner=`<span class="pit-station-person" aria-hidden="true">${lot.firm==='Babur Training Supply'?baburPortrait('broker'):person('seller',lot.firm)}</span><span class="pit-crt">${screen}</span><span class="pit-station-plaque"><b>${esc(lot.firm)}</b><small>${lot.label?esc(lot.label.toUpperCase()):lot.favor?'HELD FOR YOU':'SUPPLIER'}</small></span>`;
  const label=`${lot.qty} ${lot.gpu}, ${sum(total)} total from ${lot.firm}${short_?'. Not enough cash for one GPU':reach==='part'?`. You can buy ${can} now`:''}${needed?'. Your projects need this GPU':''}`;
  return live?`<button type="button" class="${cls}" data-seat="${slot.seat}" data-floor-offer data-gpu="${esc(lot.gpu)}" data-action="focus-supplier" data-id="${esc(lot.id)}" data-station-id="${esc(lot.id)}" aria-label="${esc(label)}">${inner}</button>`
    :`<div class="${cls}" data-seat="${slot.seat}" data-station-id="${esc(lot.id)}" aria-hidden="true">${inner}</div>`;
}
// Investors take booths on the same floor: cash or compute, each signed on its own sheet.
export function investorBooth(g,term,live) {
  const a=g.arcade,now=a.time,compute=term.funding==='compute';
  const capacity=compute?Object.entries(term.tranches.reduce((m,d)=>(m[d.gpu]=(m[d.gpu]||0)+d.qty,m),{})):[];
  const offer=compute?capacity.map(([type,n])=>`<span class="ib-gpu">${mini({gpu:type,cells:BROKER_SHAPES[type]},'booth-piece')}${n} ${esc(type)}</span>`).join(''):`<b class="ib-check">${sum(term.amount)}</b>`;
  const plain=compute?capacity.map(([type,n])=>`${n} ${type}`).join(' + '):sum(term.amount);
  const schedule=compute?`<small class="ib-when">R${[...new Set(term.tranches.map(d=>d.q))].join(', R')}</small>`:'';
  const inner=`<span class="ib-person" aria-hidden="true">${person('investor',term.name)}</span><span class="ib-tag">${compute?'COMPUTE':'CASH'}</span><span class="ib-sheet"><span class="ib-offer">${offer}</span><span class="ib-for">for <b>${bpsText(term.pct)}</b></span>${schedule}${fuse(term.until,term.at,now,'is-term')}</span><span class="ib-name"><b>${esc(term.name)}</b></span>`;
  const label=`${compute?'Compute for equity':'Cash investment'} from ${term.name}: ${plain} for ${bpsText(term.pct)} ownership. ${Math.ceil(Math.max(0,term.until-now))} seconds left`;
  return live?`<button type="button" class="pit-investor ${compute?'is-compute':'is-cash'}" data-floor-funding data-action="review-term" data-id="${esc(term.id)}" data-station-id="${esc(term.id)}" aria-label="${esc(label)}">${inner}</button>`
    :`<div class="pit-investor ${compute?'is-compute':'is-cash'}" data-station-id="${esc(term.id)}" aria-hidden="true">${inner}</div>`;
}
// A buyer for the whole company takes the gallery too: the price, the stake it buys, the clock.
function acquirerBooth(g,o,live) {
 const org=CAST[o.suitor]?.org || 'Buyer',price=o.terms.price,mult=price/Math.max(1,o.terms.mark);
 const inner=`<span class="ib-person" aria-hidden="true">${person('investor',org)}</span><span class="ib-tag">BUYOUT</span><span class="ib-sheet"><b class="ib-check">${short(price)}</b><span class="ib-for">for <b>100%</b> · ${mult.toFixed(1)}× mark</span>${fuse(o.until,o.at,g.arcade.time,'is-term')}</span><span class="ib-name"><b>${esc(org)}</b></span>`;
 const label=`${org} offers ${sum(price)} for the whole company, ${mult.toFixed(1)} times today's mark. Review the offer`;
 return live?`<button type="button" class="pit-investor is-acquirer" data-action="review-scenario" data-id="${esc(o.id)}" aria-label="${esc(label)}">${inner}</button>`:`<div class="pit-investor is-acquirer" aria-hidden="true">${inner}</div>`;
}
// The resale desk: funded bids as tickets. A ticket opens the one-step sale for that buyer.
function resaleDesk(g,bids,live) {
  const a=g.arcade,ticket=b=>{
    const qty=buyerQty(b),free=freeOf(g,b.gpu),match=!!saleQuote(g,b.id,1);
    const inner=`<span class="rt-who">${esc(b.name)}</span><span class="rt-want">${mini({gpu:b.gpu,cells:BROKER_SHAPES[b.gpu]},'booth-piece')}<b>${qty}</b> ${gpu(b.gpu)} <b>${rate(b.rate)}</b><small>/h</small></span><span class="rt-own ${free?'has-stock':''}">${free?`${free} free`:'none free'}</span>${fuse(b.until,b.at,a.time)}`;
    const label=`Resale bid from ${b.name}: ${qty} ${b.gpu} at ${rate(b.rate)} per GPU-hour. You have ${free} ${b.gpu} available`;
    return live?`<button type="button" class="resale-ticket gpu-${b.gpu.toLowerCase()} ${match?'has-stock is-match':''}" data-action="${match?'quick-sell':'focus-buyer'}" data-gpu="${esc(b.gpu)}" data-id="${esc(b.id)}" data-station-id="${esc(b.id)}" aria-label="${esc(label)}">${inner}</button>`
      :`<div class="resale-ticket gpu-${b.gpu.toLowerCase()} ${match?'has-stock':''}" aria-hidden="true">${inner}</div>`;
  };
  const shown=[...bids].sort((x,y)=>(saleQuote(g,y.id,1)?1:0)-(saleQuote(g,x.id,1)?1:0)).slice(0,3);
  return `<div class="rest-resale" role="group" aria-label="Resale desk"><span class="rest-tag">RESALE<i> DESK</i></span>${shown.length?shown.map(ticket).join(''):'<span class="rest-none">No bids</span>'}</div>`;
}
function marketLine(g,t) {
  if (g.phase!=='floor') return '';
  const a=g.arcade,upcoming=[...a.lots,...a.buyers,...a.terms.filter(x=>x.status==='open')].filter(x=>x.at>t).sort((x,y)=>x.at-y.at)[0];
  const lastArrival=Math.max(0,...[...a.lots,...a.buyers].filter(x=>x.at<=t).map(x=>x.at));
  return `<small class="ledger-line">${upcoming?`<span class="tape-next ledger-next">next ${fuse(upcoming.at,lastArrival,t,'is-next')}</span>`:'<span class="tape-next ledger-next">no more arrivals</span>'}</small>`;
}
// V22.1: the column count that gives the largest booth in a desktop hall (about 1.65:1, booths ~1:1.25).
export const floorCols=n=>{let best=4,size=0;for(let c=3;c<=8;c++){const s=Math.min(1.65/c,1/(Math.ceil(n/c)*1.25));if(s>size+1e-9){size=s;best=c;}}return best;};
export function stage(g,ui={}) {
  const live=!ui.focusOpen,a=g.arcade,t=a.time;
  const seats=firmDesks(g),need=neededGPUs(g),bids=g.phase==='floor'?a.buyers.filter(b=>buyerLive(g,b)):[];
  const terms=g.phase==='floor'?a.terms:[],shownTerms=terms.some(x=>termLive(g,x))?terms:[];
  const pulse=!!ui.floorPulse;ui.floorPulse=false;
  // V22.3 Find: the matching desks seen when the player pressed Find come to the front in a fixed order;
  // arrivals later keep their desk (marked), so only the deliberate press moves anything.
  const front=ui.floorGpu&&ui.findIds?ui.findIds:[],rankOf=slot=>{const i=front.indexOf(slot.lot?.id??slot.previous?.id);return i<0?0:i-1000;};
  const ctx={live,need,target:ui.floorGpu||null,pulse,orderOf:rankOf};
  const lots=g.phase==='floor'?a.lots.filter(l=>available(g,l)):[];
  const booths=seats.map(slot=>desk(g,slot,ctx)).join(''),cols=4,rows=Math.ceil(seats.length/cols),dense=false;
  const teaser=g.phase==='floor'&&g.q===5&&!a.practice&&g.world.scen?.enabled&&!liveOffers(g).some(o=>o.key==='buyout')?'<span class="pit-investor is-acquirer is-teaser" aria-label="An acquisition offer arrives after this round’s bell"><span class="ib-tag">BUYOUT</span><span class="ib-sheet"><b class="ib-check">At the bell</b><span class="ib-for">Buyers are watching this round</span></span></span>':'';
  const investors=shownTerms.filter(x=>termLive(g,x)).map(x=>investorBooth(g,x,live)).join('')+(g.phase==='floor'?liveOffers(g).filter(o=>o.key==='buyout').map(o=>acquirerBooth(g,o,live)).join(''):'')+teaser;
  const target=ctx.target?`<div class="floor-target gpu-${ctx.target.toLowerCase()}" data-floor-filter tabindex="-1">${mini({gpu:ctx.target,cells:BROKER_SHAPES[ctx.target]},'booth-piece')}<b>${(n=>`${n} ${esc(ctx.target)} broker${n===1?'':'s'}`)(lots.filter(l=>l.gpu===ctx.target).length)}</b>${control(live,'floor-filter-reset','floor-reset','✕','aria-label="Clear GPU highlight"')}</div>`:'';
  const arrival=ui.arrival?`<div class="v21-arrival v22-arrival">${baburSays('Build your first project by clicking on one of the tasks on the right.',{small:true,expression:'broker',phone:'Build your first project by tapping one of the tasks in Projects.'})}</div>`:'';
  const fast=fastClose(g);
  return `<section class="pit-stage v22-floor ${live?'':'is-backdrop'} ${investors?'has-term':''} ${ui.arrival?'v21-arriving':''} ${g.q>5?'v21-frenzy':''}" aria-label="Haight Street Compute: your company and the GPU floor">
    ${hud(g,ui,!live)}
    <div class="pit-main v22-main ${ui.projectsCollapsed?'projects-collapsed':''}">
      <div class="pit-room">
        <div class="pit-hintbar">${arrival}${ui.projectsCollapsed&&ui.pinId?`<div class="floor-pin">${pinnedBar(g,ui.pinId)}</div>`:''}${target}</div>
        <div class="pit-hall ${dense?'is-dense':''}" style="--cols:${cols};--rows:${rows}">
          <div class="pit-architecture" aria-hidden="true"><div class="pit-coffer"></div><div class="pit-sign"><img src="brand/logo/hsc-lockup-ink.svg" width="148" height="52" alt=""></div><div class="pit-frieze"><img src="brand/logo/hsc-mark-white.svg" width="37" height="47" alt=""><span>HAIGHT STREET COMPUTE</span></div><div class="pit-column column-left"></div><div class="pit-column column-right"></div><div class="pit-marble"></div><div class="pit-balustrade"></div></div>
          <div class="pit-center" aria-hidden="true"><div class="pit-center-inset"><img class="pit-center-mark" src="brand/logo/hsc-mark-ink.svg" width="37" height="47" alt=""></div></div>
          ${investors?`<div class="v22-investors v212-investors" aria-label="Investors on the trading floor">${investors}</div>`:''}
          <div class="pit-stations v22-booths v222-floor" aria-label="Trading floor: live broker offers">${booths}</div>
        </div>
        <div class="pit-desk-rest">
          ${control(live,'open-market','pit-ledger',`<span class="pit-ledger-tag">MARKET</span><b>${lots.length} live</b><i aria-hidden="true">→</i>${marketLine(g,t)}`,`data-filter="all" data-context="all" aria-label="Market ledger: ${lots.length} broker quotes"`)}
          ${control(live&&g.phase==='floor','finish-review','pit-bell',`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6c-1.4 0-2.4 1-2.4 2.3v1.1C11.9 10.6 9 15.3 9 21v6.2L5.8 31h28.4L31 27.2V21c0-5.7-2.9-10.4-8.6-11.6V8.3C22.4 7 21.4 6 20 6z"/><circle cx="20" cy="33.4" r="3"/></svg><span>End round${fast?`<small class="bell-fast">+${fast}% fast close</small>`:''}</span>`,'aria-label="End round: ring the bell"')}
        </div>
      </div>
      <aside class="pit-board projects-board">${projectsPanel(g,ui,live)}</aside>
    </div>
  </section>`;
}
// Quick Sell: select GPU → choose buyer → SELL. Every number is the engine's saleReview of the
// persisted review; nothing sells without the explicit SELL press, and stale reviews refuse to settle.
function quickSellView(g,ui) {
 const type=GPUS.includes(ui.sellGpu)?ui.sellGpu:(GPUS.find(x=>freeOf(g,x)>0)||'H100'),max=freeOf(g,type),qty=Math.max(0,Math.min(max,Number(ui.sellQty)||0)),q=quickSellQuote(g,type,qty);
 const tabs=GPUS.map(x=>button('quick-sell',`${mini({gpu:x,cells:BROKER_SHAPES[x]},'booth-piece')}<span>${x}</span><b>${freeOf(g,x)}</b>`,`class="qs-tab gpu-${x.toLowerCase()}" data-gpu="${x}" aria-pressed="${x===type}" aria-label="${freeOf(g,x)} ${x} available to sell"`)).join('');
 const committed=reservedOf(g,type);
 const body=max?`<div class="qs-deal qs-instant"><p class="qs-avail"><b>${max}</b> ${esc(type)} available</p><div class="qs-qty">${button('qs-step','−','class="qs-step" data-step="-1" aria-label="One fewer"')}<output class="qs-n" aria-live="polite">${qty}</output>${button('qs-step','+','class="qs-step" data-step="1" aria-label="One more"')}${button('qs-step','ALL','class="qs-step qs-all" data-step="max" aria-label="Sell all available"')}</div><p class="qs-proceeds"><span>YOU RECEIVE</span><strong data-qs-proceeds>${q?.valid?sum(q.revenue):'—'}</strong></p></div>`
  :`<div class="qs-deal is-empty"><p>${committed?`All your ${esc(type)} are committed.`:`No ${esc(type)} to sell.`}</p></div>`;
 return {title:'Quick sell',role:'inventory',desk:'paper',exit:null,body:`<div class="quick-sell"><nav class="qs-tabs" aria-label="GPU to sell">${tabs}</nav>${body}</div>`,
  footer:button('close-focus','Back to floor','class="resale-secondary mat-exit"')+(max?button('qs-confirm',`SELL ${qty} ${esc(type)}`,`class="resale-action qs-sell is-lit" ${q?.valid?'':'disabled'}`):'')};
}
export function utilityView(g,ui={}) {
 if(ui.panel==='quick-sell') return quickSellView(g,ui);
 if(ui.panel==='inventory')return {title:'GPU inventory',role:'inventory',desk:'paper',exit:null,body:`<div class="utility-sheet inventory-sheet resale-inventory"><p>Owned stock includes GPUs committed to your tasks. Only available GPUs can be sold.</p><div class="inventory-cards">${GPUS.map(gpu=>{const free=freeOf(g,gpu), reserved=reservedOf(g,gpu), count=matches(g,gpu).length; return `<article class="inventory-card" data-inventory-gpu="${esc(gpu)}"><h3>${gpuTag(gpu)}</h3><dl><div><dt>Owned</dt><dd>${free+reserved}</dd></div><div><dt>Committed</dt><dd>${reserved}</dd></div><div><dt>Available to sell</dt><dd>${free}</dd></div></dl>${count ? `<p>${count} matching buyer${count===1?'':'s'}</p>${button('open-market','View matching buyers',`class="resale-action" data-filter="buyers" data-context="all" data-gpu="${esc(gpu)}"`)}` : `<p>${!free && reserved ? 'Committed to your current builds.' : !free ? 'No stock available.' : 'No matching buyers right now.'}</p>`}</article>`}).join('')}</div><p>Unbuilt stock expires at the bell.</p></div>`,footer:button('close-focus','Back to floor','class="mat-exit rail-quiet"')};
 if(ui.panel!=='details')return null;
 const st=companyStats(g);
 return {title:'Company details',role:'details',desk:'paper',exit:null,body:`<div class="utility-sheet"><dl class="company-financials"><div><dt>Revenue / round</dt><dd>${sum(st.revenue)}</dd></div><div><dt>Burn / round</dt><dd>${sum(st.burn)}</dd></div><div><dt>Cash runway</dt><dd>${st.runway===Infinity?'Profitable':`${st.runway} rounds`}</dd></div><div><dt>Model</dt><dd>${esc(st.model)}</dd></div><div><dt>Founder ownership</dt><dd>${pctOf(st.founderPct)}</dd></div><div><dt>Cash raised</dt><dd>${sum(g.company.raised)}</dd></div></dl>${assets(g)}${g.company.shares.investors.length?`<h3>Signed investments</h3><ul>${g.company.shares.investors.map(i=>`<li>${esc(i.name)} · ${i.inKind?`${sum(i.inKind)} compute value`:i.paid?`${sum(i.paid)} cash`:'Equity grant'}</li>`).join('')}</ul>`:''}${button('sound',ui.sound?'Sound on · turn off':'Sound off · turn on',`class="detail-action" aria-pressed="${!!ui.sound}"`)}</div>`,footer:button('close-focus','Back to floor','class="mat-exit rail-quiet"')};
}

// The desk frame: no modal over a blurred room. A dock below the never-dimmed HUD holds a
// band (the counterparty at the far edge of your desk), the desk instrument and the rail.
export function focusFrame(g, view) {
  const identity = g.arcade.practice ? null : view.identity, identityRole = identity?.role || view.role || 'capital';
  const role = ['seller', 'buyer', 'startup', 'capital', 'investor'].includes(identityRole) ? identityRole : 'capital';
  const desk = view.desk || (identity ? 'deal' : 'paper');
  const exit = view.exit === null || g.phase !== 'floor' ? null : view.exit || { action: 'close-focus', label: 'Floor' };
  const roleName = identity?.tag ? identity.tag : role === 'seller' ? 'SUPPLIER' : role === 'buyer' ? 'RESALE BUYER' : role === 'investor' ? 'INVESTOR' : role === 'startup' ? 'FOUNDER' : 'CAPITAL';
  return `<div class="pit-focus-scrim ${identity ? 'has-band' : 'is-paper'}"><section class="pit-focus ${identity ? 'has-identity' : 'is-paper'} tone-${esc(view.tone || 'plain')} focus-${esc(view.role || 'deal')} desk-${esc(desk)}" data-desk="${esc(desk)}" role="dialog" aria-modal="true" aria-labelledby="focus-title" tabindex="-1">
    <header class="pit-focus-heading">${exit ? button(exit.action, `<span class="exit-arrow" aria-hidden="true"></span><span class="exit-label">${esc(exit.label)}</span>`, `class="pit-focus-close mat-exit" aria-label="${esc(exit.aria || exit.label)}"`) : ''}<h2 id="focus-title">${esc(view.title)}</h2>${g.arcade.practice?button('training-skip','Skip training','class="focus-training-skip"'): ''}</header>
    ${identity ? `<aside class="pit-counterparty ${role}" data-mood="${esc(identity.mood || 'neutral')}"><div class="pit-bust" data-fx-figure aria-hidden="true">${identity.name === 'Babur Training Supply' ? baburPortrait() : person(role, identity.name)}</div><div class="pit-bubble" data-fx-bubble>${identity.reaction ? `<strong class="pit-reaction">${esc(identity.reaction)}</strong>` : ''}${identity.line ? `<blockquote>“${esc(identity.line)}”</blockquote>` : ''}</div><div class="pit-nameplate"><span class="pit-counterparty-role">${roleName}</span><h3>${esc(identity.name)}</h3>${identity.subtitle ? `<p>${esc(identity.subtitle)}</p>` : ''}</div></aside>` : ''}
    <div class="pit-focus-body" data-desk="${esc(desk)}">${view.pinned || ''}${view.guideHtml || (view.guidance ? baburSays(view.guidance,{small:true,expression:view.baburExpression || 'explaining'}) : '')}${view.body || ''}</div>
    <footer class="pit-focus-footer">${view.footer || ''}</footer>
  </section></div>`;
}

// Page size follows the composition: two ledger columns of four on a desk, four rows on a phone.
const compact = () => { try { return matchMedia('(max-width: 768px)').matches; } catch { return false; } };

// Compare only arrived, visible supply against an open card's unmet recipe after free stock.
export function supplierCoverage(g, lot, cardId = null) {
  const cards = cardId ? openCards(g).filter(c => c.id === cardId) : openCards(g);
  return cards.map(card => {
    const row = cardState(g, card).rows.find(r => r.gpu === lot.gpu);
    const need = row ? Math.max(0, row.need - row.held - row.free) : 0;
    return { card, need, cover: Math.min(lot.qty, need) };
  }).filter(x => x.cover > 0).sort((a,b) => b.cover - a.cover || b.need - a.need)[0] || null;
}

// The market ledger: every live lot and resale bid, optionally one GPU type.
export function directoryView(g, ui = {}) {
  if (ui.marketContext && ui.gpu) {
    const card = openCards(g).find(c=>c.id===ui.marketCardId), row = card && cardState(g,card).rows.find(r=>r.gpu===ui.gpu);
    const qty = row ? Math.max(1,row.need-row.held-row.free) : Math.max(1,Number(ui.marketNeed)||1);
    const lots = g.arcade.lots.filter(l=>available(g,l)&&l.gpu===ui.gpu).slice(0,2);
    const future = g.arcade.lots.filter(l=>l.gpu===ui.gpu&&l.at>g.arcade.time).sort((a,b)=>a.at-b.at)[0];
    return { title:`Find ${qty} ${ui.gpu}`,role:'market',desk:'ledger',exit:null,body:`<section class="context-market">${card?`<p>For ${esc(card.name)}</p>`:''}<p>Choose a quote to review. Nothing is purchased until you sign.</p><div class="context-offers">${lots.map(l=>station(g,l,'context',{open:false,need:new Set([ui.gpu])})).join('') || `<div class="context-empty"><h3>No ${esc(ui.gpu)} offers right now</h3><p>${future?`More ${esc(ui.gpu)} supply arrives in about ${Math.ceil(future.at-g.arcade.time)} floor seconds. Return to your company to let arrivals continue.`:'No more matching supply is scheduled this round. Inspect other offers or work on another task.'}</p></div>`}</div></section>`,footer:button('close-focus','Back to task','class="mat-exit rail-quiet"')+button('open-market','All offers →','class="mat-exit" data-filter="all" data-context="all"') };
  }
  const a = g.arcade, filter = ['supply', 'buyers'].includes(ui.marketFilter) ? ui.marketFilter : 'all', need = neededGPUs(g);
  const project = openCards(g).find(c => c.id === ui.marketCardId);
  const coverage = lot => supplierCoverage(g, lot, project?.id);
  const only = list => ui.gpu ? list.filter(({ item }) => item.gpu === ui.gpu) : list;
  const lots = a.lots.filter(l => available(g, l)), bids = []; // V22.4: no resale buyers on the floor; Quick Sell replaces them
  const suppliers = only(lots.map(item => ({ item, role: 'seller' }))).sort((x,y) => (coverage(y.item)?.cover || 0) - (coverage(x.item)?.cover || 0) || y.item.qty - x.item.qty), buyers = only(bids.map(item => ({ item, role: 'buyer' })));
  const row = ({ item, role }) => {
    const seller = role === 'seller', name = seller ? item.firm : item.name, qty = seller ? item.qty : buyerQty(item), price = seller ? item.negotiation?.price ?? item.ask : item.rate;
    const opening = seller ? item.ask : item.openingRate ?? item.rate, free = seller ? 0 : owned(g, item.gpu);
    const fit = seller ? coverage(item) : null;
    const tag = seller ? item.favor ? `HELD FOR YOU · TRUST ${g.firms[item.firm]?.trust ?? 0}` : need.has(item.gpu) ? 'SUPPLIER · NEEDED' : 'SUPPLIER' : `RESALE BID · ${free} FREE`;
    const fitText = fit ? `Covers ${fit.cover}/${fit.need} for ${fit.card.name}` : '';
    if (seller) return `<button type="button" class="pit-market-row seller broker-row" data-action="focus-supplier" data-id="${esc(item.id)}" aria-label="Review ${qty} ${esc(item.gpu)} for ${sum(cents(qty, price))} total from ${esc(name)}">${brokerOffer(item, cents(qty, price), cents(qty, price) > cash(g) ? 'Not enough cash' : '')}</button>`;
    const committed = reservedOf(g, item.gpu), match = !!saleQuote(g, item.id, 1);
    const feedback = free ? `You have ${free} ${esc(item.gpu)} available.` : committed ? `You own ${committed} ${esc(item.gpu)}, but all ${committed} are committed.` : `You have no ${esc(item.gpu)} available.`;
    return `<article class="resale-buyer ${match ? 'is-match' : ''}"><div><small>${match ? 'MATCHING STOCK' : 'RESALE BUYER'}</small><h3>${esc(name)}</h3><p>Wants ${item.qty-item.filled} ${esc(item.gpu)} · ${qty} funded</p><p>${feedback}</p><p>${Math.ceil(Math.max(0,item.until-a.time))}s left · partial sales supported</p></div><div class="resale-buyer-quote"><strong>${rate(price)} <small>per GPU-hour</small></strong>${match ? button('review-sale','Review sale',`class="resale-action" data-id="${esc(item.id)}"`) : ''}${button('focus-buyer','Negotiate',`class="resale-secondary" data-id="${esc(item.id)}"`)}</div></article>`;
  };
  const split = !compact() && filter === 'all', size = split ? 4 : compact() ? 4 : 8;
  const entries = filter === 'supply' ? suppliers : filter === 'buyers' ? buyers : Array.from({ length: Math.max(suppliers.length, buyers.length) }, (_, i) => [suppliers[i], buyers[i]]).flat().filter(Boolean);
  const pages = Math.max(1, split ? Math.ceil(Math.max(suppliers.length, buyers.length) / size) : Math.ceil(entries.length / size)), page = Math.max(0, Math.min(pages - 1, Number(ui.page) || 0));
  const cut = list => list.slice(page * size, page * size + size);
  const scheduled = (filter === 'buyers' ? a.buyers : filter === 'supply' ? a.lots : [...a.lots, ...a.buyers]).some(item => item.at > a.time);
  const empty = `<p class="pit-market-empty">${filter === 'buyers' ? 'No resale bids in this view.' : 'No live quotes in this view.'} ${scheduled ? 'More offers are scheduled. Return to the floor to advance time; this directory pauses arrivals.' : 'No more scheduled arrivals. Try another view or GPU.'}</p>`;
  const list = !entries.length ? `<div class="pit-market-list">${empty}</div>`
    : split ? `<div class="pit-market-list is-split"><div class="pit-market-col seller"><h3>Suppliers</h3>${cut(suppliers).map(row).join('')}</div><div class="pit-market-col buyer"><h3>Resale bids</h3>${cut(buyers).map(row).join('') || '<p class="pit-market-empty">None live</p>'}</div></div>`
    : `<div class="pit-market-list">${cut(entries).map(row).join('')}</div>`;
  const filters = [['all', 'All', lots.length + bids.length], ['supply', 'Suppliers', lots.length], ['buyers', 'Resale', bids.length]];
  const title = filter === 'buyers' ? (ui.gpu ? `${ui.gpu} resale bids` : 'Resale desk') : ui.gpu ? `${ui.gpu} on the floor` : 'Market ledger';
  return { title, role: 'market', desk: 'ledger',
    body: `<div class="pit-directory"><nav class="pit-market-filters" aria-label="Market view">${filters.map(([key, label, n]) => button('open-market', `${label} <b>${n}</b>`, `class="pit-tab" data-filter="${key}" ${ui.gpu ? `data-gpu="${esc(ui.gpu)}"` : ''} aria-pressed="${filter === key}"`)).join('')}${ui.gpu ? button('open-market', filter === 'buyers' ? 'View all buyers' : `${esc(ui.gpu)} ✕`, `class="pit-tab pit-tab-gpu gpu-${esc(ui.gpu.toLowerCase())}" data-filter="${filter}" aria-label="${filter === 'buyers' ? 'View all buyers' : 'Show every GPU'}"`) : ''}</nav>${project ? `<p class="pit-market-context">Comparing lots for <b>${esc(project.name)}</b></p>` : ''}<div class="pit-ledger-sheet">${list}</div></div>`,
    footer: `<div class="pit-directory-footer"><div class="pit-pagination">${button('market-page', 'Prev', `class="pit-page-prev" data-step="-1" aria-label="Previous page" ${page === 0 ? 'disabled' : ''}`)}<span aria-label="Page ${page + 1} of ${pages}">Page <b>${page + 1}</b>/${pages}</span>${button('market-page', 'Next', `class="pit-page-next" data-step="1" aria-label="Next page" ${page >= pages - 1 ? 'disabled' : ''}`)}</div></div>` };
}
