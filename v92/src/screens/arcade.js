import { introView } from '../ui/tycoon-intro.js';
import { wealthLedger, finalReport } from '../ui/tycoon-wealth.js';
import { hyperscalerCard as mandateCard } from '../ui/hyperscaler.js';
import { mandateQuote } from '../tycoon/mandate.js';
import { fortuneReport } from '../ui/arcade-fortunes.js';
import { decisionView, discoveryView, deliveryReview, selectedOutcome, accounting } from '../ui/arcade-choices.js';
import { gpuBadge } from '../ui/arcade-gpu.js';
import { capitalDesk, vcReview, vcMath } from '../ui/arcade-vc.js';
import { vcLive, reviewVC } from '../tycoon/arcade-vc.js';
import { hall, contract, floorNav, portrait } from '../ui/arcade-hall.js';
import { prepareSigning, signTrade } from '../tycoon/arcade-signing.js';
import { createAudio } from '../audio.js';
import { esc, newSeed } from '../util.js';
import { BRAND } from '../config.js';
import { buyerLive, saleQuote, reviewBuyer, sellBuyer, counterBuyer } from '../tycoon/arcade-buyers.js';
import { signalOf } from '../tycoon/game.js';
import { V7, advance, available, activeLot, cash, cashCapacity, cents, claim, haggle, leave, buy, owned, remaining, inventoryCost, prepareDelivery, deliveryQuote, deliver, closeQuarter, openQuarter, score, portfolio, fortune, notice } from '../tycoon/arcade.js';
import { arcadeStore } from '../tycoon/arcade-store.js';
import { rizzParameters, failurePrice, markerAt, startRizz, resolveRizz, recoverRizz } from '../tycoon/rizz.js';

let audio = null, sound = null;
// Transient presentation choices; pending economic reviews keep the V7.4 schema.
let choosing=false, reviewQty=null;
const root = document.querySelector('#arcade');
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw Error('Storage blocked'); } }; }
const store = arcadeStore(storage);
if (store.state) store.act(recoverRizz);
let introStep = store.state ? null : 0;
const money = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(c / 100);
const badge = gpuBadge;
const visibleControl = el => !!el.getClientRects().length && !el.closest('details:not([open]) > :not(summary)');
const btn = (action, label, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
let last = performance.now(), lastPaint = '', returnFocus = null;
let meterStart = 0, meterFrame = 0, meterKey = null;
const act = fn => { const ok = store.act(fn); if (ok || store.error) render(); return ok; };
const head = () => `<header class="masthead"><div><p class="eyebrow">Haight Street Compute · V9.2 · 18 rounds to a fortune</p><h1>Cluster Tycoon</h1></div><span class="eyebrow">Fortune Favors the Bold</span><button data-action="intro-replay" class="quiet">Replay Intro</button><button data-action="sound" class="quiet">Sound: ${sound ? 'on' : 'off'}</button></header>`;

function orderCard(g, o) {
  const qty = Math.min(remaining(o), owned(g, o.gpu));
  const funded = cashCapacity(g, o), defaultQty = funded ? Math.min(qty, funded) : qty;
  return `<article class="panel" data-order="${o.id}" ${o.client===g.arcade.anchor?'id="anchor" tabindex="-1"':''}><p class="eyebrow">${o.client === g.arcade.anchor ? 'Your anchor startup' : 'Startup opportunity'}</p><h2>${esc(o.name)}</h2><p>${esc(g.startups.find(s=>s.id===o.client)?.v74?.stage||"Prototype")} ${o.critical?"· CRITICAL DEADLINE: missing compute consumes runway and worsens growth/risk.":""}</p><p>${badge(o.gpu)} ${remaining(o) ? `${remaining(o)} GPUs still needed` : '<b class="good">Order complete · launch compute secured</b>'}</p><div class="progress" role="progressbar" aria-label="${esc(o.name)} order progress" aria-valuemin="0" aria-valuemax="${o.qty}" aria-valuenow="${o.delivered}"><span style="width:${100 * o.delivered / o.qty}%"></span></div><p><b>${o.delivered} / ${o.qty} delivered</b> · ${owned(g, o.gpu)} in your inventory</p><p>Order value <b>${money(cents(o.qty, o.rate))}</b><br>Cash for ${funded} more GPUs · or take equity</p>${qty ? `<div class="order-controls"><label>GPUs<input aria-label="GPUs for ${esc(o.name)}" type="number" value="${defaultQty}" min="1" max="${qty}" step="1"></label><label>Receive<select aria-label="Compensation for ${esc(o.name)}"><option value="cash" ${!funded ? 'disabled' : ''}>Cash</option><option value="equity" ${!funded ? 'selected' : ''}>Startup equity</option></select></label>${btn('prepare', 'Review delivery', `data-id="${o.id}" class="primary"`)}</div><div class="order-outcome" data-order-preview></div>` : `<p class="muted">${remaining(o) ? `Buy ${o.gpu}, then deliver any amount for cash or equity.` : 'Completion reward: Trust +1 · Clout +40.'}</p>`}</article>`;
}

const cashOrder = (g, l) => g.arcade.orders.find(o => o.gpu === l.gpu && cashCapacity(g, o) > owned(g, o.gpu)) || g.arcade.orders.find(o => o.gpu === l.gpu && remaining(o));

function lotCard(g, l) {
  const rate = l.negotiation?.price ?? l.ask, cost = cents(l.qty, rate);
  const o = cashOrder(g, l);
  const cover = o ? Math.min(l.qty, Math.max(0, cashCapacity(g, o) - owned(g, o.gpu))) : 0, expected = o ? cents(cover, o.rate) - cost : -cost;
  return `<article class="lot ${l.gpu} ${l.flash ? 'flash' : ''} ${g.arcade.time - l.at < 2 ? 'new' : ''}" data-lot="${l.id}"><span>${badge(l.gpu)} <b>× ${l.qty}</b></span><h3>${esc(l.firm)}</h3><p class="price">${money(cost)}</p><p>Total commitment · fully prepaid</p><p class="${cover && expected >= 0 ? 'good' : 'bad'}">${cover ? `${cover} toward ${esc(o.name)} · ${expected >= 0 ? '+' : ''}${money(expected)} if delivered for cash` : (o ? 'No uncovered cash demand · equity or speculation' : 'No startup order · check outside buyers; resale is speculative')}</p><p class="${l.flash ? 'flash-label' : 'muted'}">${l.liquidation?'LIQUIDATION · deep negotiating room':l.flash ? '⚡ FLASH' : 'Regular offer'} · <span data-expiry="${l.id}">${Math.ceil(l.until - g.arcade.time)}</span>s of floor time</p>${btn('claim', 'Claim & negotiate', `data-id="${l.id}"`)}</article>`;
}

function inventory(g) {
  return `<section class="panel inventory" id="inventory" tabindex="-1"><h2>YOUR INVENTORY</h2><div class="inventory-grid">${['H100', 'H200', 'B200'].map(gpu => {
    const cost = g.arcade.inventory.filter(x => x.gpu === gpu).reduce((n, x) => n + x.left * x.unitCost, 0);
    const buyers = g.arcade.buyers.filter(b => buyerLive(g, b) && b.gpu === gpu);
    return `<div data-owned="${gpu}"><p>${badge(gpu)} <b>${owned(g, gpu)} available</b></p><p>${money(cost)} prepaid cost basis</p><small>${buyers.length ? buyers.map(b => esc(b.name)).join(' · ') : 'No active outside buyer'}</small>${owned(g,gpu)?`<details><summary>Compare uses for these GPUs</summary>${decisionView(g,gpu,owned(g,gpu),money)}</details>`:""}</div>`;
  }).join('')}</div><p class="muted small">Unused rights expire at quarter end: ${money(inventoryCost(g))} at risk. Sold or delivered GPUs leave this inventory immediately.</p></section>`;
}
function buyers(g) {
  const live = g.arcade.buyers.filter(b => buyerLive(g, b));
  return `<section class="buyer-floor" id="buyers" tabindex="-1"><h2>Buyer Desks</h2><p class="muted">Cash now, or progress and equity with your anchor. Interest is not a sale.</p>${live.map(b => `<article class="panel" data-buyer="${b.id}"><h3>${esc(b.name)}</h3><p>${badge(b.gpu)} ${b.qty - b.filled} wanted · <b>${money(cents(b.qty - b.filled, b.rate))} total payment</b></p><p>${owned(g, b.gpu)} owned · ${b.flash ? 'FLASH BUYER' : 'Regular request'} · <span data-buyer-expiry="${b.id}">${Math.ceil(b.until - g.arcade.time)}</span>s left</p>${btn('review-buyer', 'Review buyer offer', `data-id="${b.id}"`)}</article>`).join('') || '<p class="muted">No outside buyers on the floor yet. New requests arrive during the quarter.</p>'}</section>`;
}
function buyerConfirmation(g,id) {
  const b=g.arcade.buyers.find(b=>b.id===id),n=b.negotiation,live=buyerLive(g,b),max=b.qty-b.filled;
  const qty=Math.min(reviewQty??(owned(g,b.gpu)||Math.min(4,max)),max),response=n.tape.at(-1);
  const sources=g.arcade.lots.filter(l=>l.gpu===b.gpu&&available(g,l));
  return `<div class="modal-content buyer-deal"><p class="eyebrow">Buyer deal sheet · floor paused</p><div class="seller-exchange reaction-${response.outcome||'opening'}"><div class="seller-portrait">${portrait('buyer',[...b.name].reduce((n,c)=>n+c.charCodeAt(0),0))}</div><div><h2 id="dialog-title">${esc(b.name)}</h2><p class="seller-line">${esc(response.text)}</p><p>${esc(b.posture.toUpperCase())} · ${esc(b.reason)}</p></div></div><div class="current-deal"><span class="eyebrow">${live?'Funded bid':'ORDER CLOSED'} · ${Math.max(0,Math.ceil(b.until-g.arcade.time))}s remaining</span><b>${money(b.rate)} / GPU-hour</b><span>${max} ${b.gpu} wanted · ${owned(g,b.gpu)} owned · ${money(b.budget)} budget left</span></div><p class="small">Three-month service rights. Higher bids can reduce the quantity their remaining budget covers.</p><label>GPUs to offer <input data-sale-qty aria-label="GPUs to sell" type="number" min="1" max="${max}" step="1" value="${qty||1}" ${!live?'disabled':''}></label><div data-sale-math></div>${live&&n.counters<2?`<fieldset class="counter-controls"><legend>Ask for more · ${2-n.counters} counters left</legend><div class="counter-entry"><input data-buyer-counter aria-label="Your asking rate in dollars per GPU-hour" type="number" min="${((b.rate+1)/100).toFixed(2)}" step="0.01" value="${((b.rate+5)/100).toFixed(2)}">${btn('counter-buyer','COUNTEROFFER')}</div><div class="actions counter-steps">${[-5,-1,1,5].map(v=>btn('step-buyer',`${v>0?'+':'−'}${Math.abs(v)}¢`,`data-step="${v}"`)).join('')}</div><p data-buyer-proposal></p><p class="small muted">Submitting uses 2s of floor time. A high ask can lose this buyer. Reading takes no floor time.</p></fieldset>`:''}${live?`<details class="source-list" ${!owned(g,b.gpu)?'open':''}><summary>Source ${b.gpu} · ${sources.length} live suppliers</summary><p class="small">Buy supply, then return here. This buyer's deadline still applies.</p>${sources.map(l=>btn('source-buyer',`${esc(l.firm)} · ${l.qty} GPUs · ${money(cents(l.qty,l.negotiation?.price??l.ask))}`,`data-id="${l.id}"`)).join('')||'<p>No compatible supply currently posted.</p>'}</details>`:''}<details class="conversation" ${n.counters?'open':''}><summary>Negotiation tape</summary><section class="negotiation-tape">${n.tape.map(t=>`<p><b>${esc(t.speaker)}</b> ${esc(t.text)}</p>`).join('')}</section></details></div><div class="actions modal-footer">${btn('sell-buyer','SELL AT BID · REVIEW',`class="primary" ${!live?'disabled':''}`)}${btn('cancel','Not now','class="quiet"')}</div>`;
}
function paintBuyerCounter() {
  const input=root.querySelector('[data-buyer-counter]');if(!input)return;
  const g=store.state,b=g.arcade.buyers.find(b=>b.id===g.arcade.confirm.buyerId),qty=Number(root.querySelector('[data-sale-qty]').value),rate=Number(input.value)*100;
  const valid=Number.isSafeInteger(Math.round(rate))&&Math.abs(rate-Math.round(rate))<1e-7&&rate>b.rate&&Number.isSafeInteger(qty)&&qty>0&&qty<=b.qty-b.filled;
  root.querySelector('[data-action="counter-buyer"]').disabled=!valid;
  root.querySelector('[data-buyer-proposal]').textContent=valid?`Ask ${money(cents(qty,Math.round(rate)))} for ${qty} GPUs · +${money(cents(qty,Math.round(rate)-b.rate))} above bid. Not agreed.`:'Enter a higher cent rate and a whole quantity within remaining demand.';
}
function paintSale() {
  const input=root.querySelector('[data-sale-qty]');if(!input)return;
  const g=store.state,b=g.arcade.buyers.find(b=>b.id===g.arcade.confirm.buyerId),qty=Number(input.value),d=saleQuote(g,b.id,qty);
  const missing=buyerLive(g,b)&&Number.isSafeInteger(qty)&&qty>owned(g,b.gpu)&&qty<=b.qty-b.filled&&cents(qty,b.rate)<=b.budget;
  root.querySelector('[data-sale-math]').innerHTML=d?`${selectedOutcome(g,d,money)}<p class="basis-line">Actual inventory cost basis: <b>${money(d.cost)}</b></p><details><summary>Compare alternatives</summary>${decisionView(g,d.gpu,d.qty,money,null,d.buyerId,null,'outside')}</details>${accounting(g,d,money)}`:missing?`<p><b>${money(cents(qty,b.rate))} funded payment</b> for ${qty} GPUs. You own ${owned(g,b.gpu)}; source ${qty-owned(g,b.gpu)} more ${b.gpu} before signing. Profit depends on what you pay for that supply.</p>`:'<p>No sale available for this quantity. Use whole GPUs within your stock, the buyer’s demand, budget and deadline.</p>';
  root.querySelector('[data-action="sell-buyer"]').disabled=!d;
}
function paintOrders(card=null) {
  const g=store.state;if(!g)return;
  for(const el of card?[card]:root.querySelectorAll('[data-order]')) {
    const box=el.querySelector('[data-order-preview]');if(!box)continue;
    const o=g.arcade.orders.find(o=>o.id===el.dataset.order),qty=Number(el.querySelector('input').value),payment=el.querySelector('select').value,d=deliveryQuote(g,o.id,qty,payment);
    const open=!!box.querySelector('details[open]');
    box.innerHTML=d?`${payment==='cash'?`<strong>${money(d.revenue)}</strong> cash · <b>${d.revenue>=d.cost?'+':'−'}${money(Math.abs(d.revenue-d.cost))} ${d.revenue>=d.cost?'profit':'loss'}</b>`:`<strong>+${((d.stake-g.startups.find(s=>s.id===o.client).stake)*100).toFixed(3)} pp</strong> ownership · no cash today`}<details ${open?'open':''}><summary>Compare options</summary>${decisionView(g,o.gpu,qty,money,null,null,o.id,payment)}</details>`:'<p>Unavailable quantity for this route. Lower the quantity or choose equity.</p>';
    el.querySelector('[data-action="prepare"]').disabled=!d;
  }
}
function choiceReview(g) {
  const c=g.arcade.confirm,o=g.arcade.orders.find(o=>o.id===c.orderId);
  return `<p class="eyebrow">Choose a route · floor paused</p><h2 id="dialog-title">Your ${o.gpu}, your move</h2><label>GPUs <input data-choice-qty type="number" min="1" max="${owned(g,o.gpu)}" step="1" value="${c.qty}"></label><div data-choice-options>${decisionView(g,o.gpu,c.qty,money,null,null,o.id,c.payment)}</div><div class="actions confirmation-actions">${btn('return-confirm','Keep my choice','class="primary"')}${btn('cancel','Back to floor','class="quiet"')}</div>`;
}
function paintVC() {
  const input=root.querySelector('[data-vc-percent]');if(!input)return;
  const m=vcMath(store.state,Math.round(Number(input.value)*100),money);
  root.querySelector('[data-vc-math]').innerHTML=m.html;root.querySelector('[data-action="sell-vc"]').disabled=!m.valid;
}
function paintCounter() {
  const input=root.querySelector('[data-counter]'); if(!input)return;
  const l=activeLot(store.state), offer=Math.round(Number(input.value)*100), valid=Number.isFinite(Number(input.value))&&Math.abs(Number(input.value)*100-offer)<1e-7&&offer>0&&offer<l.negotiation.price;
  root.querySelector('[data-counter-total]').textContent=valid ? `Proposed total: ${money(cents(l.qty,offer))} · not agreed.` : 'Enter dollars per GPU-hour, to two decimal places, within the current quote.';
  root.querySelector('[data-action="haggle"]').disabled=!valid;
}
function floor(g) {
  const a = g.arcade;
  return `${head()}${floorNav(g)}<div class="wealth-banner"><span>ESTIMATED NET WORTH</span><strong>${money(fortune(g).netWorth)}</strong><span>Round ${g.q} / 18 · three months per round</span></div>${wealthLedger(g,money)}<div class="stats"><div class="stat">Cash available<b>${money(cash(g))}</b></div><div class="stat">Realized profit<b>${money(Math.round(g.profit * 100))}</b></div><div class="stat">Round ${g.q} / 18<b data-clock>${Math.ceil(V7.seconds - a.time)}s</b></div><div class="stat">Reputation<b>${g.clout} Clout</b></div></div><div class="message ${a.message?.tone || ''}" role="status">${esc(a.message?.text || '')}</div>${hall(g)}${inventory(g)}<div class="columns"><aside class="orders">${a.orders.map(o => orderCard(g, o)).join('')}${mandateCard(g,money)}${capitalDesk(g,money)}<details class="panel"><summary>Portfolio · ${money(Math.round(portfolio(g) * 100))} paper value</summary><p>Shares are speculative. They do not count as cash or realized profit.</p>${g.startups.filter(s => s.stake).map(s => `<div class="portfolio-item"><b>${esc(s.name)}</b><p>${(s.stake * 100).toFixed(3)}% ownership · ${esc(signalOf(s))}</p></div>`).join('') || '<p>Deliver compute for equity to begin your portfolio.</p>'}</details></aside></div>`;
}

function rizzPanel(g, l) {
  const n=l.negotiation, running=n.running&&n.attempts[n.running-1], p=running?.params||rizzParameters(g,l);
  if(!n.charmUnlocked&&!n.closed)return `<div class="charm-lock"><button type="button" class="charm-locked" data-action="explain-charm" aria-disabled="true" aria-describedby="charm-hint">🔒 CHARM</button><small id="charm-hint">Break the ice. Make a counteroffer.</small></div>`;
  if(n.closed)return `<div class="rizz-result bad"><b>QUOTE CLOSED</b><p>This lot is gone. Reliable purchases from this firm in later quarters rebuild Trust.</p></div>`;
  if(!p||p.concession<=0)return `<div class="rizz-result"><b>${n.attempts.length===3?'Three attempts used.':'Best available price reached.'}</b><p>Bank the current price or return to the floor.</p></div>`;
  const worst=failurePrice(l,p.attempt),labels=['Charm Meter','Double Down','Over-Rizz'];
  const risk=['Near miss: quote safe. Larger miss: up to 40% of original room returned to seller. Severe miss also costs 1 Trust.','Near miss: lose half your Charm gains, −1 Trust. Larger miss: lose all negotiated gains, −2 to −4 Trust.','Near miss: lose Charm gains, −3 Trust. Larger miss: lose all negotiated gains, −5 Trust. Severe miss: seller walks, −8 Trust and −20 Clout.'];
  return `<section class="rizz-panel tier-${p.attempt} ${running?'rizz-playing':''}" aria-label="Charm Meter negotiation"><div class="row"><h3>${running?'Aim for the center':labels[p.attempt-1]}</h3><span class="eyebrow rapport-cue">${({cold:"COLD · STANDARD TARGET",receptive:"RECEPTIVE · TARGET +12%",guarded:"GUARDED · TARGET −10%",irritated:"IRRITATED · TARGET −18%"})[p.rapport]} · ${p.attempt}/3</span></div><p class="rizz-stakes"><b>Perfect hit: save ${money(cents(l.qty,p.concession))}${p.attempt>1?' more':''}</b></p>${running?`<div class="meter" aria-hidden="true"><span class="target" style="left:${(0.5-p.width/2)*100}%;width:${p.width*100}%"></span><span class="marker" style="left:${markerAt(p,0)*100}%"></span></div><p class="small">Tap STOP or press Space / Enter.</p>${btn('stop-rizz','STOP THE MARKER','class="stop-rizz primary"')}`:`<p class="risk">Miss: lose up to ${money(cents(l.qty,worst-n.price))} in concessions; quote ${money(cents(l.qty,worst))}${cash(g)<cents(l.qty,worst)?' · unaffordable':''}${p.attempt===3?' · severe miss loses the lot':p.attempt===2?' · up to −4 Trust':' · severe miss −1 Trust'}.</p>${!n.attempts.length?`<label class="assist"><input type="checkbox" data-assist ${g.arcade.assistance?'checked':''}> Calm pace: slower, smaller rewards</label>`:''}${btn('start-rizz',labels[p.attempt-1].toUpperCase(),`class="${p.attempt===3?'danger':'primary'}"`)}<details><summary>Risk & timing rules</summary><p>Seller rapport changes target width only. Meaningful successful counters can widen it; firm holds and lowballs narrow it. Penny counters earn no bonus. Concession room is unchanged.</p><p>${risk[p.attempt-1]}</p><p>Edge / strong / perfect: 40% / 70% / 100% reward. Perfect quote: ${money(cents(l.qty,n.price-p.concession))}. Up to ${money(cents(l.qty,worst-n.price))} in concessions at risk.</p><p>Trust ${p.trust} · Clout ${p.clout} · target ${Math.round(p.width*100)}% wide · ${p.speed.toFixed(2)} bar widths/sec. Calm pace: 45% slower, 35% smaller rewards.</p></details>`}<p class="small muted">Starting uses an attempt. Reloading mid-attempt is a severe miss.</p></section>`;
}

function negotiation(g,l) {
  const n=l.negotiation,cost=cents(l.qty,n.price),response=n.tape.at(-1),reaction=n.running?'rizz':response.outcome||'opening',last=n.attempts.at(-1);
  const result=last?.status==='resolved'?`<div class="rizz-feedback ${last.tier==='hit'?'good':'bad'}" role="status"><b>${last.walked?'DEAL LOST':last.tier==='hit'?`${last.precision.toUpperCase()} HIT · ${money(cents(l.qty,last.before-last.after))} SAVED`:`${last.interrupted?'INTERRUPTED · ':''}${last.tier==='near'?'NEAR MISS':'MISSED'} · ${last.after>last.before?money(cents(l.qty,last.after-last.before))+' GIVEN BACK':'QUOTE HELD'}`}</b>${last.trust||last.clout?`<small>Trust ${last.trust} ${last.clout?'· Clout '+last.clout:''}</small>`:''}</div>`:'';
  return `<div class="modal-content negotiation-room ${n.running?'meter-stage':''}"><p class="eyebrow">Supplier desk · floor paused</p><div class="seller-exchange reaction-${reaction}"><div class="seller-portrait">${portrait('seller',[...l.firm].reduce((n,c)=>n+c.charCodeAt(0),0))}</div><div><h2 id="dialog-title">${esc(l.firm)}</h2><p class="seller-line">${esc(n.running?'Show me what you have.':response.text)}</p><p>${badge(l.gpu)} × ${l.qty} · ${Math.max(0,Math.ceil(l.until-g.arcade.time))}s left · Trust ${g.firms[l.firm]?.trust||0}</p></div></div><div class="current-deal"><span class="eyebrow">Prepaid 3-month service contract</span><b>${money(cost)}</b><span>${money(n.price)} / GPU-hour · cash ${money(cash(g))} · after ${money(cash(g)-cost)}</span></div>${n.running?'':`${result}${l.liquidation?'<p class="flash-label">CAPACITY LIQUIDATION · finite stock</p>':''}${!n.attempts.length&&!n.closed?`<fieldset class="counter-controls" ${!n.patience?'disabled':''}><legend>Your counter · $/GPU-hour · 2s to submit</legend><div class="counter-entry"><input data-counter aria-label="Your counteroffer in dollars per GPU-hour" type="number" min="0.01" max="${(n.price/100).toFixed(2)}" step="0.01" value="${(Math.max(1,n.price-8)/100).toFixed(2)}">${btn('haggle','MAKE COUNTEROFFER')}</div><div class="actions counter-steps">${[-5,-1,1,5].map(v=>btn('step-counter',`${v>0?'+':'−'}$${(Math.abs(v)/100).toFixed(2)}`,`data-step="${v}"`)).join('')}<small>${n.patience} left</small></div><p data-counter-total></p></fieldset>`:''}`}${rizzPanel(g,l)}${n.running?'':`${!n.closed?discoveryView(g,l,money):''}<details class="conversation" ${n.haggles?'open':''}><summary>Conversation & contract</summary><section class="negotiation-tape" aria-label="Negotiation tape">${n.tape.map(t=>`<p><b>${esc(t.speaker)}</b> ${esc(t.text)}</p>`).join('')}</section><p>${esc(n.posture)} · ${n.patience} counteroffers left. ${esc(l.profile)}.</p><p>Opening ask ${money(l.ask)} / hr · supplier minimum ${money(cents(l.qty,l.floor))}${cash(g)<cents(l.qty,l.floor)?' · Below the floor: this lot cannot rescue your cash.':''}. ${money(n.price)} per GPU-hour × ${V7.hours} hours × ${l.qty} GPUs. Fixed three-month service rights; fully prepaid.</p></details>`}</div><div class="actions modal-footer">${btn('buy',`${n.haggles?'BANK THE DEAL':'BUY NOW'} · ${money(cost)}`,`class="primary" ${cost>cash(g)||n.running||n.closed?'disabled':''}`)}${btn('leave','Walk away',`class="quiet" ${n.running?'disabled':''}`)}</div>`;
}

function confirmation(g) {
  const c = g.arcade.confirm;
  if (c.mandate) { const q=mandateQuote(g); return `<h2 id="dialog-title">Three suppliers. One hyperscaler.</h2><p>Atlas Meridian Cloud · ${q?.secured || 0} / 20 GPUs secured.</p>${q?.ready ? `<p>Purchase basis ${money(q.cost)} · funded payout ${money(q.revenue)}<br><b>Delivery profit ${money(q.margin)}</b></p><p>Twenty GPUs leave inventory once, at signing. No credit or future supplier payments.</p><div class="actions">${btn('mandate-sign','Review signing ticket','class="primary"')}${btn('cancel','Keep sourcing')}</div>` : btn('cancel','Back to floor')}`; }
  if (c.vcId) return vcReview(g,c.vcId,money);
  if (c.receipt) return contract(c.receipt, money, true);
  if (c.buyerId) return buyerConfirmation(g, c.buyerId);
  if (c.restart) return `<h2 id="dialog-title">Start a fresh broker run?</h2><p>This replaces your current run. Earlier version saves are preserved.</p><div class="actions">${btn('restart', 'Start fresh', 'class="danger"')}${btn('cancel', 'Keep this run')}</div>`;
  if (c.finish) return `<h2 id="dialog-title">End this round?</h2><p>Unsold inventory expires with no refund. ${money(inventoryCost(g))} will become a realized loss.</p><div class="actions">${btn('finish', 'Settle round', 'class="danger"')}${btn('cancel', 'Keep trading')}</div>`;
  const d = deliveryQuote(g, c.orderId, c.qty, c.payment), o = g.arcade.orders.find(o => o.id === c.orderId);
  if (!d) return `<h2 id="dialog-title">Delivery unavailable</h2>${btn('cancel', 'Back to floor')}`;
  return choosing?choiceReview(g):deliveryReview(g,d,o,money);
}

function report(g) {
  const r = g.arcade.history.at(-1);
  return `${head()}<section class="report panel"><p class="eyebrow">Round ${r.q} / 18 · books closed</p><h2>${r.orders[0].milestone ? 'You powered their next step.' : 'Every deal leaves a mark.'}</h2><div class="stats"><div class="stat">Quarter profit<b>${money(Math.round(r.profit * 100))}</b></div><div class="stat">Cash available<b>${money(cash(g))}</b></div><div class="stat">Delivered<b>${r.delivered} GPUs</b></div><div class="stat">Expired inventory loss<b>${money(r.lost)}</b></div></div>${r.orders.map(o => `<p><b>${esc(o.name)}</b> · ${o.delivered}/${o.qty} ${badge(o.gpu)} delivered${o.milestone ? ' · ORDER COMPLETE · Clout +40' : ''}</p>`).join('')}<p>Outside buyers: ${r.outsideSold} GPUs sold · ${money(r.outsideProfit)} realized sale profit.</p>${inventory(g)}<p>Secondary cash this quarter: ${money(g.arcade.secondarySales.filter(s=>s.q===r.q).reduce((n,s)=>n+s.proceeds,0))}. Equity remains speculative; see the financial desk next quarter.</p><h3>Your startups</h3>${r.startups.map(s => `<article class="portfolio-item"><p><b>${esc(s.name)} · ${esc(s.status)}</b></p><p>${esc(s.text)} ${esc(s.delivery || '')}</p>${fortuneReport(s,money)}${s.stake ? `<p>${(s.stake * 100).toFixed(3)}% ownership · ${money(Math.round(s.paper * 100))} paper value</p>` : ''}</article>`).join('')}${r.lines.map(l => `<p>${esc(l.text)}</p>`).join('')}<div class="wealth-banner"><span>ESTIMATED NET WORTH</span><strong>${money(fortune(g).netWorth)}</strong></div>${wealthLedger(g,money)}<p>Secondary Tycoon Score ${score(g).total} = wealth ${score(g).wealth} + capped reputation and compute bonus ${score(g).bonus}.</p><p class="muted">Next round: new finite supply. ${g.q <= 2 ? 'Profits and relationships unlock larger market books.' : 'Compare opportunities across startup customers.'}</p><p class="hsc-transition"><b>${esc(BRAND.name)}</b> · ${esc(BRAND.adBody[0])}</p>${btn('next', `Open round ${g.q} / 18`, 'class="primary"')} ${btn('restart-review', 'New broker run', 'class="quiet"')}</section>`;
}

function render() {
  cancelAnimationFrame(meterFrame);
  const focused = document.activeElement?.dataset?.action;
  const focusedSeat=document.activeElement?.dataset?.slot;
  const charmWasLocked=!!root.querySelector('.charm-locked');
  const g = store.state;
  if (store.error) { root.innerHTML = `<div class="shell"><h1>Trading paused</h1><p role="alert">${esc(store.error)}</p></div>`; return; }
  if (introStep !== null) { root.innerHTML = `<div class="shell intro-shell">${head()}${introView(introStep,!!g)}</div>`; root.querySelector('[data-action="intro-next"]')?.focus({preventScroll:true}); return; }
  root.innerHTML = `<div class="shell">${g.phase === 'floor' ? floor(g) : g.phase === 'over' ? head()+finalReport(g,money) : report(g)}</div>${activeLot(g) || g.arcade.confirm ? `<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${g.arcade.signing ? `<div class="modal-content">${contract(g.arcade.signing, money)}</div>` : activeLot(g) ? negotiation(g, activeLot(g)) : g.arcade.confirm?.buyerId ? buyerConfirmation(g,g.arcade.confirm.buyerId) : `<div class="modal-content">${confirmation(g)}</div>`}</section></div>` : ''}`;
  paintSale(); paintBuyerCounter(); paintCounter(); paintVC(); paintOrders();
  const modal = root.querySelector('.modal');
  root.querySelector('.shell').inert = !!modal;
  if (modal) {
    const buttons=[...modal.querySelectorAll('button:not(:disabled)')].filter(visibleControl);
    (buttons.find(el=>el.dataset.action==='stop-rizz')||buttons.find(el=>el.dataset.action===focused)||buttons[0])?.focus({preventScroll:true});
  }
  else if (returnFocus || focusedSeat) {
    const target=root.querySelector(returnFocus||`[data-slot="${focusedSeat}"]`);
    (target&&!target.disabled?target:root.querySelector('#exchange'))?.focus({preventScroll:true});
    returnFocus=null;
  }
  if(charmWasLocked&&root.querySelector('[data-action="start-rizz"]')) {
    const status=document.createElement('span');status.className='sr-only';status.setAttribute('role','status');root.querySelector('.rizz-panel').append(status);
    queueMicrotask(()=>{status.textContent='Charm Meter unlocked.';});
  }
  lastPaint = g.phase === 'floor' ? visibleKey(g) : '';
  if (activeLot(g)?.negotiation.running) {
    const key = `${activeLot(g).id}:${activeLot(g).negotiation.running}`;
    if (meterKey !== key) { meterKey = key; meterStart = performance.now(); }
    const params = activeLot(g).negotiation.attempts.at(-1).params;
    const marker = root.querySelector('.marker');
    const animate = now => { marker.style.left = `${markerAt(params, now - meterStart) * 100}%`; meterFrame = requestAnimationFrame(animate); };
    meterFrame = requestAnimationFrame(animate);
    root.querySelector('[data-action="stop-rizz"]')?.scrollIntoView({ block: 'nearest' });
  } else { meterKey = null; if (focused === 'stop-rizz') root.querySelector('.rizz-panel, .rizz-result')?.scrollIntoView({ block: 'nearest' }); }
}

const visibleKey = g => [...g.arcade.lots.filter(l => available(g, l)), ...g.arcade.buyers.filter(b => buyerLive(g, b)), ...g.arcade.vcOffers.filter(b=>vcLive(g,b))].map(x => x.id).join(',') + ':' + !!(g.arcade.mandate && g.arcade.time >= g.arcade.mandate.until);
root.addEventListener('click', e => {
  const b = e.target.closest('button[data-action]'); if (!b || b.disabled) return;
  const action = b.dataset.action;
  if(action==='intro-next'){introStep=Math.min(4,introStep+1);render();return;}
  if(action==='intro-replay'){introStep=0;render();return;}
  if(action==='resume-intro'){introStep=null;last=performance.now();render();return;}
  if(action==='change-choice'){choosing=true;render();return;}
  if(action==='return-confirm'){choosing=false;render();return;}
  if(action==='choose-route'){
    const qty=Number(b.dataset.qty),route=b.dataset.route;choosing=false;reviewQty=qty;
    act(g=>{if(g.arcade.active||g.arcade.signing||g.arcade.confirm?.receipt)return false;g.arcade.confirm=null;return route==='outside'?!!saleQuote(g,b.dataset.buyer,qty)&&reviewBuyer(g,b.dataset.buyer):prepareDelivery(g,b.dataset.orderId,qty,route);});return;
  }
  if(action==='visit'){visit(b.dataset.target);return;}
  if(action==='explain-charm'){const input=root.querySelector('[data-counter]');input?.focus();input?.select();input?.scrollIntoView({block:'nearest'});return;}
  if(action==='skip-presentation'){b.closest('.sign-room').classList.add('accelerated');b.textContent='Animation skipped';return;}
  if (action === 'start') { introStep=null; last=performance.now(); const p = new URLSearchParams(location.search).get('seed'); store.start(p && /^\d+$/.test(p) ? Number(p) >>> 0 : newSeed()); if (matchMedia('(prefers-reduced-motion: reduce)').matches) store.act(g => { g.arcade.assistance = true; return true; }); render(); visit('exchange'); return; }
  if (action === 'mandate-review') act(g=>{if(!mandateQuote(g)?.ready||g.arcade.active||g.arcade.confirm)return false;g.arcade.confirm={mandate:true};return true;});
  else if (action === 'mandate-sign') act(g=>prepareSigning(g,'mandate'));
  else if (action === 'claim') { returnFocus = `[data-slot="${b.dataset.slot}"]`; act(g => claim(g, b.dataset.id)); }
  else if (action === 'haggle') { const offer=Math.round(Number(root.querySelector('[data-counter]').value)*100); act(g=>haggle(g,offer)); }
  else if (action === 'step-counter') { const input=root.querySelector('[data-counter]'); input.value=(Math.max(1,Math.min(Math.round(Number(input.max)*100),Math.round(Number(input.value)*100)+Number(b.dataset.step)))/100).toFixed(2); paintCounter(); }
  else if (action === 'start-rizz') act(startRizz);
  else if (action === 'stop-rizz') stopMeter();
  else if (action === 'buy') { if (act(g => prepareSigning(g, 'purchase'))) sound?.printer(.35); }
  else if (action === 'sign-it') { if (act(signTrade)) { sound?.scratch(.35); const playing=sound; setTimeout(()=>{if(playing&&sound===playing&&store.state.arcade.confirm?.receipt){playing.stamp();const receipt=store.state.arcade.confirm.receipt;playing.bell({strikes:receipt.kind==="secondary"&&receipt.total>=10000000?3:receipt.kind==="buyer"&&receipt.total-receipt.cost>=500000?2:1});}},matchMedia('(prefers-reduced-motion: reduce)').matches?0:450); } }
  else if (action === 'cancel-sign') act(g => { g.arcade.signing = null; return true; });
  else if (action === 'capital') visit('capital-desk');
  else if (action === 'sound') { sound = sound ? null : (audio ||= createAudio()); b.textContent = sound ? 'Sound: on' : 'Sound: off'; }
  else if (action === 'leave') act(leave);
  else if (action === 'prepare') { choosing=false; const card = b.closest('[data-order]'); returnFocus = `[data-action="prepare"][data-id="${b.dataset.id}"]`; act(g => { if (prepareDelivery(g, b.dataset.id, Number(card.querySelector('input').value), card.querySelector('select').value)) return true; notice(g, 'Delivery unavailable: use a whole GPU quantity within your inventory and the order. For cash, stay within the startup’s cash budget, or choose equity.', 'bad'); return true; }); }
  else if (action === 'review-vc') act(g=>reviewVC(g,b.dataset.id));
  else if (action === 'sell-vc') {const bps=Math.round(Number(root.querySelector('[data-vc-percent]').value)*100);if(act(g=>prepareSigning(g,'secondary',bps)))sound?.printer(.35);}
  else if (action === 'review-buyer') {returnFocus=`[data-slot="${b.dataset.slot}"]`;reviewQty=null;act(g => reviewBuyer(g, b.dataset.id));}
  else if(action==='counter-buyer'){const rate=Math.round(Number(root.querySelector('[data-buyer-counter]').value)*100),qty=Number(root.querySelector('[data-sale-qty]').value);reviewQty=qty;act(g=>counterBuyer(g,rate,qty));}
  else if(action==='step-buyer'){const input=root.querySelector('[data-buyer-counter]');input.value=(Math.max(Number(input.min)*100,Math.round(Number(input.value)*100)+Number(b.dataset.step))/100).toFixed(2);paintBuyerCounter();}
  else if(action==='source-buyer'){act(g=>{if(g.arcade.signing||!g.arcade.confirm?.buyerId)return false;const id=g.arcade.confirm.buyerId;g.arcade.confirm=null;if(!claim(g,b.dataset.id))return false;g.arcade.sourcingFor=id;return true;});}
  else if (action === 'sell-buyer') { const qty = Number(root.querySelector('[data-sale-qty]').value); if (act(g => prepareSigning(g, 'buyer', qty))) sound?.printer(.35); }
  else if (action === 'deliver') act(deliver);
  else if (action === 'cancel') {choosing=false;reviewQty=null;const receipt=store.state.arcade.confirm?.receipt;if(act(g => { g.arcade.confirm = null; if(receipt?.kind==='purchase'&&g.arcade.sourcingFor){const id=g.arcade.sourcingFor;g.arcade.sourcingFor=null;reviewBuyer(g,id);} return true; })&&receipt&&!store.state.arcade.confirm)visit(receipt.kind==='purchase'?'inventory':receipt.kind==='secondary'?'capital-desk':'buyers');}
  else if (action === 'finish-review') act(g => { if (g.phase !== 'floor' || g.arcade.active || g.arcade.confirm) return false; g.arcade.confirm = { finish: true }; return true; });
  else if (action === 'finish') {if(act(g => { g.arcade.confirm = null; return closeQuarter(g); })&&store.state.report.startups.some(s=>s.fortune?.launch))sound?.bell({strikes:2,ring:.8});}
  else if (action === 'next') {if(act(openQuarter))visit('exchange');}
  else if (action === 'restart-review') act(g => { g.arcade.confirm = { restart: true }; return true; });
  else if (action === 'restart') { store.restart(newSeed()); render(); }
});
function visit(id) {const role={buyers:'buyer',supply:'seller'}[id];const target=role?root.querySelector(`.exchange-desk.${role}:not(:disabled)`):document.getElementById(id);if(!target)return;if(!role)target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.scrollIntoView({block:'start'});}
function stopMeter() {
  const l = activeLot(store.state), entry = l?.negotiation?.running && l.negotiation.attempts.at(-1);
  // Debounce the input that started the meter; consume a single normalized result.
  if (!entry || performance.now() - meterStart < 180) return;
  const pos = markerAt(entry.params, performance.now() - meterStart);
  if(act(g => resolveRizz(g, pos))) { const e=activeLot(store.state)?.negotiation.attempts.at(-1); if(e?.walked)sound?.alert();else if(e?.precision==="perfect")sound?.bell({f:1100,ring:.5}); }
}
root.addEventListener('input', e => { if(e.target.matches('[data-order] input, [data-order] select'))paintOrders(e.target.closest('[data-order]')); if(e.target.matches('[data-choice-qty]')) {const g=store.state,c=g.arcade.confirm,o=g.arcade.orders.find(o=>o.id===c.orderId),qty=Number(e.target.value);root.querySelector('[data-choice-options]').innerHTML=Number.isSafeInteger(qty)&&qty>0&&qty<=owned(g,o.gpu)?decisionView(g,o.gpu,qty,money,null,null,o.id,c.payment):'<p>Choose a whole quantity within your inventory.</p>'; } if (e.target.matches('[data-sale-qty]')) {reviewQty=Number(e.target.value);paintSale();paintBuyerCounter();} if(e.target.matches('[data-buyer-counter]'))paintBuyerCounter(); if(e.target.matches('[data-counter]')) paintCounter(); if(e.target.matches('[data-vc-percent]'))paintVC(); });
root.addEventListener('change', e => { if (e.target.matches('[data-assist]')) act(g => { const n = activeLot(g)?.negotiation; if (!n || n.attempts.length) return false; g.arcade.assistance = e.target.checked; return true; }); });
document.addEventListener('keydown', e => {
  const modal = root.querySelector('.modal'); if (!modal) return;
  if ((e.key === ' ' || e.key === 'Enter') && activeLot(store.state)?.negotiation?.running) { e.preventDefault(); if (!e.repeat) stopMeter(); return; }
  if (e.key === 'Escape') { e.preventDefault(); choosing=false; reviewQty=null; if (store.state.arcade.signing) act(g => { g.arcade.signing = null; return true; }); else if (store.state.arcade.confirm) act(g => { g.arcade.confirm = null; return true; }); else act(leave); }
  if (e.key === 'Tab') { const all = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a')].filter(visibleControl); const first = all[0], end = all.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); } else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); } }
});
setInterval(() => {
  const now = performance.now(), dt = (now - last) / 1000; last = now;
  const g = store.state;
  if (!g || introStep !== null || store.error || document.hidden || g.phase !== 'floor' || g.arcade.active || g.arcade.confirm) return;
  if (!store.act(g => advance(g, dt))) { if (store.error) render(); return; }
  const next = store.state;
  if (next.phase !== 'floor' || lastPaint !== visibleKey(next)) { render(); return; }
  root.querySelector('[data-clock]').textContent = `${Math.ceil(V7.seconds - next.arcade.time)}s`;
  const mandateClock=root.querySelector('[data-mandate-clock]');if(mandateClock)mandateClock.textContent=Math.max(0,Math.ceil(next.arcade.mandate.until-next.arcade.time));
  for (const el of root.querySelectorAll('[data-expiry]')) el.textContent = Math.ceil(next.arcade.lots.find(l => l.id === el.dataset.expiry).until - next.arcade.time);
  for (const el of root.querySelectorAll('[data-buyer-expiry]')) el.textContent = Math.ceil(next.arcade.buyers.find(b => b.id === el.dataset.buyerExpiry).until - next.arcade.time);
  for(const el of root.querySelectorAll('[data-vc-expiry]'))el.textContent=Math.ceil(next.arcade.vcOffers.find(b=>b.id===el.dataset.vcExpiry).until-next.arcade.time);
  for(const el of root.querySelectorAll('[data-desk-until]'))el.textContent=Math.max(0,Math.ceil(Number(el.dataset.deskUntil)-next.arcade.time));
  for(const el of root.querySelectorAll('[data-hall-clock],[data-way-clock]'))el.textContent=`${Math.ceil(V7.seconds-next.arcade.time)}s`;
  for(const el of root.querySelectorAll('[data-desk-cooldown]'))el.textContent=Math.max(0,Math.ceil(Number(el.dataset.deskCooldown)-next.arcade.time));
  for(const arrival of root.querySelectorAll('[data-arrival-at]'))arrival.textContent=Math.max(0,Math.ceil(Number(arrival.dataset.arrivalAt)-next.arcade.time));
  const upcoming = [...next.arcade.lots,...next.arcade.buyers].filter(x=>x.at>next.arcade.time).sort((a,b)=>a.at-b.at)[0];
  root.querySelector('[data-next]').textContent = upcoming ? `Next arrival in ${Math.ceil(upcoming.at - next.arcade.time)}s.` : 'All releases are on the board. Supply is finite.';
}, 250);
window.addEventListener('storage', e => { if (e.key === V7.key) { store.act(() => true); render(); } });
render();
