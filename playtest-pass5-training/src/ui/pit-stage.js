import { campaignLimit, qualification } from '../tycoon/extension.js';
// The simplified company floor: one inventory, task requirements, and contextual sourcing.
// Secondary games and financial details have named destinations; every offer remains engine state.
import { figureSVG } from './character.js';
import { esc } from '../util.js';
import { activeLot, available, cash, cents, owned, V7 } from '../tycoon/arcade.js';
import { buyerLive, saleQuote } from '../tycoon/arcade-buyers.js';
import { companyStats, openCards, cardState, GPUS, freeOf } from '../tycoon/founder.js';
import { money as sum, short, pctOf, bpsText, reservedOf, rackStock } from './pit-ledger.js';
import { companyBoard, assets, tray, gpuTag } from './pit-company.js';
import { taskDeck } from '../tycoon/task-navigation.js';
import { brokerOffer } from './broker-offer.js';
import { stableOfferSeats, fundingArrival } from '../tycoon/pit-layout-state.js';
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
  for (const o of openCards(g)) for (const r of cardState(g, o).rows) if (r.held < r.need) need.add(r.gpu);
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

function hud(g,ui,open) {
 const st=companyStats(g),clock=Math.max(0,Math.ceil(V7.seconds-g.arcade.time)),free=GPUS.reduce((n,gpu)=>n+freeOf(g,gpu),0);
 return `<header class="pit-hud floor-hud"><div class="hud-co"><span class="hud-name"><b title="${esc(st.name)}">${esc(st.name)}</b><span class="floor-cycle">Round ${g.q}/${campaignLimit(g)} · ${g.phase!=='floor'?'Closed':`${open?'Paused · ':''}<span data-floor-clock>${clock}s</span>`}</span></span></div><div class="hud-cash" style="--cash-chars:${money(cash(g)).length}"><span>Cash</span><strong data-fx-cash>${money(cash(g))}</strong></div><div class="hud-val" title="Estimated paper stake, not final payout"><span>Your stake · est.</span><strong data-paper-stake="${st.founderValue}">${short(st.founderValue)}</strong><small>${pctOf(st.founderPct)} owned</small></div>${button('open-inventory',`Inventory <small>${free} free</small>`,`class="hud-inventory" ${g.phase!=='floor'||g.arcade.active||g.arcade.confirm||g.arcade.signing?'disabled':''}`)}${button('help','Help',`class="pit-help floor-help" ${activeLot(g)?.negotiation.running?'disabled':''}`)}</header>`;
}
const floorSize=()=>4;
function floorOffer(g,lot,live,seat=0) {
 const total=cents(lot.qty,lot.negotiation?.price??lot.ask),shortfall=total>cash(g),cooling=lot.cooldown>g.arcade.time;
 const label=`Review ${lot.qty} ${lot.gpu} for ${sum(total)} total from ${lot.firm}${shortfall?'. Not enough cash at this quote.':'.'}`;
 const inside=`<span class="floor-broker-art" aria-hidden="true">${lot.firm==='Babur Training Supply'?baburPortrait('broker'):person('seller',lot.firm)}</span><span class="floor-quote">${brokerOffer(lot,total,cooling?'Back shortly':shortfall?'Not enough cash':'')}</span>`;
 return live&&!cooling?`<button type="button" class="floor-offer pit-seat-${seat}" data-seat="${seat}" data-floor-offer data-gpu="${esc(lot.gpu)}" data-action="focus-supplier" data-id="${esc(lot.id)}" data-station-id="${esc(lot.id)}" aria-label="${esc(label)}">${inside}</button>`:`<div class="floor-offer pit-seat-${seat} is-backdrop" data-seat="${seat}" aria-hidden="true">${inside}</div>`;
}
function retiredFloorSeat(slot) {
 const lot=slot.previous;
 if(!lot)return '';
 const status={sold:'Sold',expired:'Offer expired',walked:'Offer closed',cooldown:'Back shortly',vacant:'No live offer'}[slot.status] || 'No live offer';
 return `<div class="floor-offer floor-retired pit-seat-${slot.seat}" data-seat="${slot.seat}" data-seat-status="${esc(slot.status)}" role="group" aria-label="${esc(lot.firm)}: ${status}"><span class="floor-broker-art" aria-hidden="true">${person('seller',lot.firm)}</span><span class="retired-offer-status">${status}</span></div>`;
}
// Decorative architecture stays quiet and never receives pointer or keyboard input.
function pitGeometry() {
 return `<svg class="open-pit-geometry" viewBox="0 0 720 600" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M30 85 150 35h420l120 50M55 104l108-47h394l108 47"/><path d="M48 192Q48 118 360 118t312 74v204q0 94-312 94T48 396Z"/><path d="M74 202q0-62 286-62t286 62v178q0 85-286 85T74 380Z"/><path d="M102 230q0-60 258-60t258 60v132q0 76-258 76t-258-76Z"/><path d="M102 248q0 74 258 74t258-74M74 220q0 83 286 83t286-83M48 201q0 89 312 89t312-89"/><path d="M48 207v-35m26 61v-40m64 78v-37m102 61v-39m120 48v-41m120 32v-39m102-24v-37m64-1v-40m26 14v-35"/><path d="m126 425-65 106m145-81-37 114m112-103-12 122m170-122 12 122m99-133 37 114m43-139 65 106M167 58l35 85m80-85 12 82m132-82-12 82m139-82-35 85"/></g></svg>`;
}
function floorFunding(g,term,live) {
 if(!term)return '';
 const a=g.arcade,capital=term.funding==='compute'?'Compute value':'Capital',deadlineId=`funding-deadline-${term.id.replace(/[^a-zA-Z0-9_-]/g,'-')}`;
 const label=`Review funding from ${term.name}: ${sum(term.amount)} ${capital.toLowerCase()} for ${bpsText(term.pct)} ownership.`;
 const inside=`<span class="funding-person-art" aria-hidden="true">${person('investor',term.name)}</span><span class="funding-invitation">${term.funding==='compute'?'Compute value offer':'Let’s talk funding'}</span><span class="funding-person-name">${esc(term.name)}</span><span class="funding-person-terms"><b>${sum(term.amount)}</b><span>for ${bpsText(term.pct)} equity</span></span><span class="funding-person-deadline" id="${esc(deadlineId)}">Offer closes in ${fuse(term.until,term.at,a.time)}</span>`;
 return control(live,'review-term','floor-funding-person',inside,`data-floor-funding data-id="${esc(term.id)}" aria-label="${esc(label)}" aria-describedby="${esc(deadlineId)}"`);
}
// Visible demand is a shortcut to real live buyers, with their actual hourly bids.
function buyerPulse(g,bids,live) {
 const groups=GPUS.map(gpu=>({gpu,buyers:bids.filter(b=>b.gpu===gpu&&buyerQty(b)>0)})).filter(x=>x.buyers.length);
 if(!groups.length)return '';
 return `<nav class="floor-demand" aria-label="Live buyer demand">${groups.map(({gpu,buyers})=>{
  const best=Math.max(...buyers.map(b=>b.rate)),matching=buyers.some(b=>saleQuote(g,b.id,1));
  return control(live,'open-market',`floor-demand-button${matching?' has-stock':''}`,`<b>${esc(gpu)} buyers</b><span>Up to ${rate(best)}/h${matching?' · Match':''}</span>`,`data-filter="buyers" data-context="all" data-gpu="${esc(gpu)}" aria-label="View ${esc(gpu)} buyers, bids up to ${rate(best)} per GPU-hour${matching?', matching your available stock':''}"`);
 }).join('')}</nav>`;
}
export function stage(g,ui={}) {
 const live=!ui.focusOpen,a=g.arcade,lots=g.phase==='floor'?a.lots.filter(l=>available(g,l)):[];
 const layout=stableOfferSeats(g,ui,floorSize()),{seats,page,pages,total,liveHere,hasFuture}=layout;
 const term=g.phase==='floor'?fundingArrival(g,ui).term:null,bids=a.buyers.filter(b=>buyerLive(g,b));
 const selected=taskDeck(g,ui).card,row=selected&&cardState(g,selected).rows.find(r=>r.gpu===ui.floorGpu),remaining=selected?.status==='open'&&row?Math.max(0,row.need-row.held-row.free):0;
 const title=ui.floorGpu?remaining?`Find ${remaining} ${ui.floorGpu}`:`${ui.floorGpu} offers`:'Trading floor';
 const supplyNote=liveHere?'':total?'No live offers here. Jump to live offers.':hasFuture?`No ${ui.floorGpu?`${ui.floorGpu} `:''}offers yet. More arrive this round.`:ui.floorGpu?`No ${ui.floorGpu} offers. Reset to see other GPUs.`:'No more offers this round. Check Suppliers.';
 return `<section class="pit-stage floor-stage open-pit ${live?'':'is-backdrop'}" aria-label="The GPU trading floor and your current task">${hud(g,ui,!live)}<div class="pit-main floor-main"><section class="trading-room" aria-label="Live broker offers"><header class="floor-heading"><div class="floor-filter-heading" data-floor-filter tabindex="-1"><h2>${esc(title)}</h2>${ui.floorGpu?control(live,'floor-filter-reset','floor-reset','Reset','aria-label="Reset GPU filter: show every GPU"')+control(live,'open-market','floor-matching-buyers',`View ${esc(ui.floorGpu)} buyers`,`data-filter="buyers" data-context="all" data-gpu="${esc(ui.floorGpu)}"`):''}</div><div class="floor-pagination">${control(live,'floor-page','floor-page-button','‹',`data-step="-1" aria-label="Previous broker offers" ${page===0?'disabled':''}`)}<span>Page ${page+1}/${pages} · ${total} live</span>${control(live,'floor-page','floor-page-button','›',`data-step="1" aria-label="Next broker offers" ${page>=pages-1?'disabled':''}`)}${!liveHere&&total?control(live,'floor-live','floor-live-button','Live offers'): ''}</div><p class="floor-supply-note">${esc(supplyNote)}</p>${buyerPulse(g,bids,live)}</header><div class="floor-scene ${term?'has-floor-funding':''}">${pitGeometry()}<div class="visible-brokers">${seats.map(slot=>slot.lot?floorOffer(g,slot.lot,live,slot.seat):retiredFloorSeat(slot)).join('')}</div>${floorFunding(g,term,live)}</div><nav class="floor-secondary" aria-label="Trading information">${control(live,'open-market','floor-secondary-button',`Suppliers <span>${lots.length}</span>`,'data-filter="supply" data-context="all"')}${control(live,'open-market','floor-secondary-button',`Buyers <span>${bids.length}</span>${bids.some(b=>saleQuote(g,b.id,1)) ? ' <small>· Match</small>' : ''}`,'data-filter="buyers" data-context="all"')}${control(live,'open-details','floor-secondary-button','Company')}</nav></section><aside class="pit-board current-task-panel">${companyBoard(g,ui,live)}</aside></div></section>`;
}
export function utilityView(g,ui={}) {
 if(ui.panel==='sale-review') {
  const q=ui.saleQuote, b=g.arcade.buyers.find(x=>x.id===ui.saleBuyer), committed=ui.saleStock?.committed ?? (b ? reservedOf(g,b.gpu) : 0), free=ui.saleStock ? ui.saleStock.owned-committed : b ? freeOf(g,b.gpu) : 0;
  const maximum=ui.saleMax ?? 0;
  return {title:'Review sale',role:'inventory',desk:'paper',exit:null,body:`<div class="resale-review"><h3 data-review-buyer>${esc(b?.name || 'Buyer')}</h3><p data-review-gpu>${esc(b?.gpu || '')} · partial sales supported</p><label for="review-qty">Quantity to sell</label><input id="review-qty" data-review-qty data-autofocus aria-describedby="review-validation" aria-invalid="false" type="number" min="1" max="${maximum}" step="1" inputmode="numeric" value="${esc(String(ui.saleQty ?? ''))}"><p data-review-range>${maximum ? `Choose a whole number from 1 to ${maximum}.` : 'This offer is no longer available. Return to buyers.'}</p><p id="review-validation" data-review-validation role="status" aria-live="polite"></p><dl><div><dt>Price basis</dt><dd data-review-rate>${q ? rate(q.rate) : b ? rate(b.rate) : '—'} per GPU-hour × 2,190 hours</dd></div><div><dt>Total proceeds</dt><dd data-review-proceeds>${q ? sum(q.revenue) : 'Enter a valid quantity'}</dd></div><div><dt>Payment</dt><dd>Cash received immediately</dd></div><div><dt>Available after sale</dt><dd data-review-remaining>${q ? free-q.qty : free} ${esc(b?.gpu || '')}</dd></div><div><dt>Committed unchanged</dt><dd data-review-committed>${committed} ${esc(b?.gpu || '')}</dd></div></dl><p role="alert">${esc(ui.saleError || '')}</p></div>`,footer:button('sale-buyers','Back to buyers','class="resale-secondary"')+button('cancel-sale','Cancel','class="resale-secondary"')+button('confirm-sale','Confirm sale',`class="resale-action" ${q ? '' : 'disabled'}`)};
 }
 if(ui.panel==='inventory')return {title:'GPU inventory',role:'inventory',desk:'paper',exit:null,body:`<div class="utility-sheet inventory-sheet resale-inventory"><p>Owned stock includes GPUs committed to your tasks. Only available GPUs can be sold.</p><div class="inventory-cards">${GPUS.map(gpu=>{const free=freeOf(g,gpu), reserved=reservedOf(g,gpu), count=matches(g,gpu).length; return `<article class="inventory-card" data-inventory-gpu="${esc(gpu)}"><h3>${gpuTag(gpu)}</h3><dl><div><dt>Owned</dt><dd>${free+reserved}</dd></div><div><dt>Committed</dt><dd>${reserved}</dd></div><div><dt>Available to sell</dt><dd>${free}</dd></div></dl>${count ? `<p>${count} matching buyer${count===1?'':'s'}</p>${button('open-market','View matching buyers',`class="resale-action" data-filter="buyers" data-context="all" data-gpu="${esc(gpu)}"`)}` : `<p>${!free && reserved ? 'Committed to your current builds.' : !free ? 'No stock available.' : 'No matching buyers right now.'}</p>`}</article>`}).join('')}</div><p>Unbuilt stock expires at the bell.</p></div>`,footer:button('close-focus','Back to floor','class="mat-exit rail-quiet"')};
 if(ui.panel!=='details')return null;
 const extension=qualification(g);
 const progress=g.q<10&&!g.arcade.practice?`<section class="extension-progress"><h3>Earn another round</h3><p>${esc(extension.summary)}</p><ul>${extension.paths.map(p=>`<li>${p.complete?'✓ ':''}${esc(p.label)} <b>${Math.min(p.current,p.target)}/${p.target}</b></li>`).join('')}</ul><p>Five rounds make a complete run. Each earned continuation adds one round, up to ten.</p></section>`:'';
 const st=companyStats(g),terms=g.arcade.terms.filter(t=>t.status==='open'&&t.at<=g.arcade.time&&t.until>g.arcade.time);
 return {title:'Company details',role:'details',desk:'paper',exit:null,body:`<div class="utility-sheet"><dl class="company-financials"><div><dt>Revenue / round</dt><dd>${sum(st.revenue)}</dd></div><div><dt>Burn / round</dt><dd>${sum(st.burn)}</dd></div><div><dt>Cash runway</dt><dd>${st.runway===Infinity?'Profitable':`${st.runway} rounds`}</dd></div><div><dt>Model</dt><dd>${esc(st.model)}</dd></div></dl>${assets(g)}${progress}<h3>Funding</h3>${terms.length?terms.map(t=>button('review-term',`Review ${esc(t.name)} · ${sum(t.amount)} for ${bpsText(t.pct)}`,`class="detail-action" data-id="${esc(t.id)}"`)).join(''):'<p>No live term sheets.</p>'}${button('sound',ui.sound?'Sound on · turn off':'Sound off · turn on',`class="detail-action" aria-pressed="${!!ui.sound}"`)}</div>`,footer:button('close-focus','Back to floor','class="mat-exit rail-quiet"')};
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
    <div class="pit-focus-body" data-desk="${esc(desk)}">${view.guidance ? baburSays(view.guidance,{small:true,expression:view.baburExpression || 'explaining'}) : ''}${view.body || ''}</div>
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
  const lots = a.lots.filter(l => available(g, l)), bids = a.buyers.filter(b => buyerLive(g, b));
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
