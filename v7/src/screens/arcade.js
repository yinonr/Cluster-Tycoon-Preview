import { capitalDesk, vcReview, vcMath } from '../ui/arcade-vc.js';
import { vcLive, reviewVC } from '../tycoon/arcade-vc.js';
import { hall, contract, floorNav } from '../ui/arcade-hall.js';
import { prepareSigning, signTrade } from '../tycoon/arcade-signing.js';
import { createAudio } from '../audio.js';
import { esc, newSeed } from '../util.js';
import { BRAND } from '../config.js';
import { buyerLive, saleQuote, reviewBuyer, sellBuyer } from '../tycoon/arcade-buyers.js';
import { signalOf } from '../tycoon/game.js';
import { V7, advance, available, activeLot, cash, cashCapacity, cents, claim, haggle, leave, buy, owned, remaining, inventoryCost, prepareDelivery, deliveryQuote, deliver, closeQuarter, openQuarter, score, portfolio, notice } from '../tycoon/arcade.js';
import { arcadeStore } from '../tycoon/arcade-store.js';
import { rizzParameters, markerAt, startRizz, resolveRizz, recoverRizz } from '../tycoon/rizz.js';

let audio = null, sound = null;
const root = document.querySelector('#arcade');
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw Error('Storage blocked'); } }; }
const store = arcadeStore(storage);
if (store.state) store.act(recoverRizz);
const money = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(c / 100);
const badge = gpu => `<span class="gpu ${gpu}">${gpu}</span>`;
const btn = (action, label, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
let last = performance.now(), lastPaint = '', returnFocus = null;
let meterStart = 0, meterFrame = 0, meterKey = null;
const act = fn => { const ok = store.act(fn); if (ok || store.error) render(); return ok; };
const head = () => `<header class="masthead"><div><p class="eyebrow">Haight Street Compute · V7.3 playtest</p><h1>Cluster Tycoon</h1></div><span class="eyebrow">The Art of the Deal</span><button data-action="sound" class="quiet">Sound: ${sound ? 'on' : 'off'}</button></header>`;

function orderCard(g, o) {
  const qty = Math.min(remaining(o), owned(g, o.gpu));
  const funded = cashCapacity(g, o), defaultQty = funded ? Math.min(qty, funded) : qty;
  return `<article class="panel" data-order="${o.id}"><p class="eyebrow">${o.client === g.arcade.anchor ? 'Your anchor startup' : 'Startup opportunity'}</p><h2>${esc(o.name)}</h2><p>${badge(o.gpu)} ${remaining(o) ? `${remaining(o)} GPUs still needed` : '<b class="good">Order complete · launch compute secured</b>'}</p><div class="progress" role="progressbar" aria-label="${esc(o.name)} order progress" aria-valuemin="0" aria-valuemax="${o.qty}" aria-valuenow="${o.delivered}"><span style="width:${100 * o.delivered / o.qty}%"></span></div><p><b>${o.delivered} / ${o.qty} delivered</b> · ${owned(g, o.gpu)} in your inventory</p><p>Order value <b>${money(cents(o.qty, o.rate))}</b><br>Cash for ${funded} more GPUs · or take equity</p>${qty ? `<div class="order-controls"><label>GPUs<input aria-label="GPUs for ${esc(o.name)}" type="number" value="${defaultQty}" min="1" max="${qty}" step="1"></label><label>Receive<select aria-label="Compensation for ${esc(o.name)}"><option value="cash" ${!funded ? 'disabled' : ''}>Cash</option><option value="equity" ${!funded ? 'selected' : ''}>Startup equity</option></select></label>${btn('prepare', 'Review delivery', `data-id="${o.id}" class="primary"`)}</div>` : `<p class="muted">${remaining(o) ? `Buy ${o.gpu}, then deliver any amount for cash or equity.` : 'Completion reward: Trust +1 · Clout +40.'}</p>`}</article>`;
}

const cashOrder = (g, l) => g.arcade.orders.find(o => o.gpu === l.gpu && cashCapacity(g, o) > owned(g, o.gpu)) || g.arcade.orders.find(o => o.gpu === l.gpu && remaining(o));

function lotCard(g, l) {
  const rate = l.negotiation?.price ?? l.ask, cost = cents(l.qty, rate);
  const o = cashOrder(g, l);
  const cover = o ? Math.min(l.qty, Math.max(0, cashCapacity(g, o) - owned(g, o.gpu))) : 0, expected = o ? cents(cover, o.rate) - cost : -cost;
  return `<article class="lot ${l.gpu} ${l.flash ? 'flash' : ''} ${g.arcade.time - l.at < 2 ? 'new' : ''}" data-lot="${l.id}"><span>${badge(l.gpu)} <b>× ${l.qty}</b></span><h3>${esc(l.firm)}</h3><p class="price">${money(cost)}</p><p>Total commitment · fully prepaid</p><p class="${cover && expected >= 0 ? 'good' : 'bad'}">${cover ? `${cover} toward ${esc(o.name)} · ${expected >= 0 ? '+' : ''}${money(expected)} if delivered for cash` : (o ? 'No uncovered cash demand · equity or speculation' : 'No startup order · check outside buyers; resale is speculative')}</p><p class="${l.flash ? 'flash-label' : 'muted'}">${l.flash ? '⚡ FLASH' : 'Regular offer'} · <span data-expiry="${l.id}">${Math.ceil(l.until - g.arcade.time)}</span>s of floor time</p>${btn('claim', 'Claim & negotiate', `data-id="${l.id}"`)}</article>`;
}

function inventory(g) {
  return `<section class="panel inventory" id="inventory" tabindex="-1"><h2>YOUR INVENTORY</h2><div class="inventory-grid">${['H100', 'H200', 'B200'].map(gpu => {
    const cost = g.arcade.inventory.filter(x => x.gpu === gpu).reduce((n, x) => n + x.left * x.unitCost, 0);
    const buyers = g.arcade.buyers.filter(b => buyerLive(g, b) && b.gpu === gpu);
    return `<div data-owned="${gpu}"><p>${badge(gpu)} <b>${owned(g, gpu)} available</b></p><p>${money(cost)} prepaid cost basis</p><small>${buyers.length ? buyers.map(b => esc(b.name)).join(' · ') : 'No active outside buyer'}</small></div>`;
  }).join('')}</div><p class="muted small">Unused rights expire at quarter end: ${money(inventoryCost(g))} at risk. Sold or delivered GPUs leave this inventory immediately.</p></section>`;
}
function buyers(g) {
  const live = g.arcade.buyers.filter(b => buyerLive(g, b));
  return `<section class="buyer-floor" id="buyers" tabindex="-1"><h2>Buyers seeking compute</h2><p class="muted">Cash now, or progress and equity with your anchor. Interest is not a sale.</p>${live.map(b => `<article class="panel" data-buyer="${b.id}"><h3>${esc(b.name)}</h3><p>${badge(b.gpu)} ${b.qty - b.filled} wanted · <b>${money(cents(b.qty - b.filled, b.rate))} total payment</b></p><p>${owned(g, b.gpu)} owned · ${b.flash ? 'FLASH BUYER' : 'Regular request'} · <span data-buyer-expiry="${b.id}">${Math.ceil(b.until - g.arcade.time)}</span>s left</p>${btn('review-buyer', 'Review buyer offer', `data-id="${b.id}"`)}</article>`).join('') || '<p class="muted">No outside buyers on the floor yet. New requests arrive during the quarter.</p>'}</section>`;
}
function buyerConfirmation(g, id) {
  const b = g.arcade.buyers.find(b => b.id === id), qty = Math.min(owned(g, b.gpu), b.qty - b.filled);
  return `<p class="eyebrow">Buyer offer · floor paused</p><h2 id="dialog-title">${esc(b.name)}</h2><p>${badge(b.gpu)} ${b.qty - b.filled} still wanted · ${money(cents(b.qty - b.filled, b.rate))} maximum payment</p><label>GPUs to sell <input data-sale-qty aria-label="GPUs to sell" type="number" min="1" max="${qty}" step="1" value="${qty || 1}"></label><div data-sale-math></div><p>Each right sells once. Your anchor receives no progress from this sale; its Trust does not decrease.</p><div class="actions">${btn('sell-buyer', 'Confirm cash sale', `class="primary" ${!qty ? 'disabled' : ''}`)}${btn('cancel', 'Back to floor', 'class="quiet"')}</div>`;
}
function paintSale() {
  const input = root.querySelector('[data-sale-qty]'); if (!input) return;
  const g = store.state, d = saleQuote(g, g.arcade.confirm.buyerId, Number(input.value));
  const o = g.arcade.orders.find(o => o.gpu === d?.gpu && remaining(o));
  root.querySelector('[data-sale-math]').innerHTML = d ? `<div class="economics"><span>Prepaid cost of these GPUs</span><strong>${money(d.cost)}</strong><span>Buyer cash payment</span><strong>${money(d.revenue)}</strong><span>Realized profit / loss</span><strong>${money(d.revenue - d.cost)}</strong><span>Cash after sale</span><strong>${money(cash(g) + d.revenue)}</strong></div><p>${o ? `${esc(o.name)} alternative: ${money(cents(Math.min(d.qty, cashCapacity(g, o)), o.rate))} funded cash for up to ${Math.min(d.qty, cashCapacity(g, o))} GPUs, or equity; advances its order.` : 'No matching startup order.'}</p>` : '<p>Choose a whole quantity within your available inventory and the buyer’s remaining demand.</p>';
  root.querySelector('[data-action="sell-buyer"]').disabled = !d;
}
function paintVC() {
  const input=root.querySelector('[data-vc-percent]');if(!input)return;
  const m=vcMath(store.state,Math.round(Number(input.value)*100),money);
  root.querySelector('[data-vc-math]').innerHTML=m.html;root.querySelector('[data-action="sell-vc"]').disabled=!m.valid;
}
function paintCounter() {
  const input=root.querySelector('[data-counter]'); if(!input)return;
  const l=activeLot(store.state), offer=Number(input.value), valid=Number.isSafeInteger(offer)&&offer>0&&offer<=l.negotiation.price;
  root.querySelector('[data-counter-total]').textContent=valid ? `Your proposed total: ${money(cents(l.qty,offer))}. Seller must agree first.` : 'Enter a whole number of cents within the current quote.';
  root.querySelector('[data-action="haggle"]').disabled=!valid;
}
function floor(g) {
  const a = g.arcade, next = a.lots.find(l => l.status === 'open' && l.at > a.time);
  const lots = a.lots.filter(l => available(g, l));
  return `${head()}${floorNav()}<div class="stats"><div class="stat">Cash available<b>${money(cash(g))}</b></div><div class="stat">Realized profit<b>${money(Math.round(g.profit * 100))}</b></div><div class="stat">Quarter ${g.q}<b data-clock>${Math.ceil(V7.seconds - a.time)}s</b></div><div class="stat">Clout · Tycoon Score<b>${g.clout} · ${score(g).total}</b></div></div><div class="message ${a.message?.tone || ''}" role="status">${esc(a.message?.text || '')}</div>${hall(g)}${inventory(g)}<div class="columns"><section>${buyers(g)}<div class="row" id="supply" tabindex="-1"><h2>Supply floor</h2><small data-floor-state>${a.active || a.confirm ? 'PAUSED · take your time' : 'LIVE · claim to pause'}</small></div><p class="muted">Claiming costs nothing. Compare the whole lot’s cost with the order it can fill.</p><div class="lots">${lots.map(l => lotCard(g, l)).join('') || '<p>No open lots right now. Your inventory can still be delivered.</p>'}</div><p class="muted" data-next>${next ? `Next release in ${Math.ceil(next.at - a.time)}s of floor time.` : 'All releases are on the board. Supply is finite.'}</p><details><summary>How your money and compute work</summary>Each purchase is a three-month compute-service block, paid in full. Transfer GPUs to a startup for immediate cash payment or shares. No future supplier payments, borrowing, or guaranteed sublets. Unused rights expire at the bell and their full cost becomes a loss. Pending demand is not cash. Inventory at cost: ${money(inventoryCost(g))}. Unpaid commitments: $0.</details><div class="actions">${btn('finish-review', 'Finish quarter', 'class="quiet"')}</div></section><aside class="orders" id="anchor" tabindex="-1">${a.orders.map(o => orderCard(g, o)).join('')}${capitalDesk(g,money)}<details class="panel"><summary>Portfolio · ${money(Math.round(portfolio(g) * 100))} paper value</summary><p>Shares are speculative. They do not count as cash or realized profit.</p>${g.startups.filter(s => s.stake).map(s => `<div class="portfolio-item"><b>${esc(s.name)}</b><p>${(s.stake * 100).toFixed(3)}% ownership · ${esc(signalOf(s))}</p></div>`).join('') || '<p>Deliver compute for equity to begin your portfolio.</p>'}</details></aside></div>`;
}

function rizzPanel(g, l) {
  const n = l.negotiation, running = n.running && n.attempts[n.running - 1], p = running?.params || rizzParameters(g, l);
  if (n.closed) return `<div class="rizz-result bad"><b>SUPPLIER WALKED</b><p>This lot is gone. Reliable purchases from this firm in later quarters rebuild Trust.</p></div>`;
  if (!p || p.concession <= 0) return `<div class="rizz-result"><b>${n.attempts.length === 3 ? 'Three attempts used.' : 'Best available price reached.'}</b><p>Bank the current price or return to the floor.</p></div>`;
  const labels = ['Rizz', 'Push your luck', 'Over-Rizz'];
  const risk = ['A miss keeps your current quote. A severe miss costs 1 Trust.', 'Near miss: lose half your Rizz gains, −1 Trust. Larger miss: lose all Rizz gains, −2 to −4 Trust.', 'Near miss: lose Rizz gains, −3 Trust. Larger miss: lose all negotiated gains, −5 Trust. Severe miss: seller walks, −8 Trust and −20 Clout.'];
  return `<section class="rizz-panel tier-${p.attempt}" aria-label="Rizz negotiation"><div class="row"><h3>${labels[p.attempt - 1]} · ${p.attempt} / 3</h3><span class="eyebrow">${p.attempt === 1 ? 'First shot. Best reward.' : p.attempt === 2 ? 'A smaller reward. More risk.' : 'Last shot. Real consequences.'}</span></div><p><b class="good">Perfect hit: save up to ${money(cents(l.qty, p.concession))}</b>${p.attempt > 1 ? ` · ${money(cents(l.qty, Math.max(0, n.base - n.price)))} of Rizz gains at risk` : ''}</p><p class="risk">${risk[p.attempt - 1]}</p><p class="muted">Trust ${p.trust} · Clout ${p.clout} · target ${Math.round(p.width * 100)}% wide · ${p.speed.toFixed(2)} bar widths/sec</p>${!n.attempts.length ? `<label class="assist"><input type="checkbox" data-assist ${g.arcade.assistance ? 'checked' : ''}> Calm pace: 45% slower, 35% smaller rewards</label>` : ''}<div class="meter" aria-hidden="true"><span class="target" style="left:${(0.5 - p.width / 2) * 100}%;width:${p.width * 100}%"></span><span class="marker" style="left:${markerAt(p, 0) * 100}%"></span></div><p class="small muted">${running ? 'Tap STOP, click, or press Space / Enter. The floor stays paused.' : 'Edge / strong / perfect: 40% / 70% / 100% reward. Aim for the center. Counteroffers need no timing.'}</p>${running ? btn('stop-rizz', 'STOP THE MARKER', 'class="stop-rizz primary"') : btn('start-rizz', `${p.attempt === 1 ? 'Try Rizz' : p.attempt === 2 ? 'Risk attempt 2' : 'Risk Over-Rizz'}`, `class="${p.attempt === 3 ? 'danger' : 'primary'}"`)}<p class="muted small">Starting consumes an attempt. Reloading mid-attempt counts as a severe miss.</p></section>`;
}

function negotiation(g, l) {
  const n = l.negotiation, cost = cents(l.qty, n.price), f = g.firms[l.firm];
  const o = cashOrder(g, l), cover = o ? Math.min(l.qty, Math.max(0, cashCapacity(g, o) - owned(g, o.gpu))) : 0;
  return `<div class="modal-content"><p class="eyebrow">Claimed · floor paused · no purchase yet</p><h2 id="dialog-title">${esc(l.firm)}</h2><p>${badge(l.gpu)} <b>${l.qty} GPUs</b> · Trust ${f?.trust || 0}</p><p class="total">${money(cost)}</p><p>Total purchase cost · all three months paid</p><div class="economics"><span>Cash available</span><strong>${money(cash(g))}</strong><span>Cash after signing</span><strong class="${cost > cash(g) ? 'bad' : ''}">${money(cash(g) - cost)}</strong><span>Uncovered cash-order fit</span><strong>${cover} / ${l.qty} GPUs</strong><span>Expected cash-delivery profit</span><strong>${money((o ? cents(cover, o.rate) : 0) - cost)}</strong></div><p class="muted">${cover ? `Payment requires a separate delivery to ${esc(o.name)} after buying. ${l.qty - cover ? `${l.qty - cover} GPUs are not covered by this startup cash order.` : ''}` : (o ? 'Existing inventory or the startup cash budget limits cash sales. Equity is speculative and brings in no cash.' : 'No uncovered startup cash order. Compare outside buyers before buying; unused capacity loses its full cost.')}</p><div class="message ${g.arcade.message?.tone || ''}" role="status">${esc(g.arcade.message?.text || '')}</div><section class="negotiation-tape" aria-label="Negotiation tape" aria-live="polite">${n.tape.map(t => `<p><b>${esc(t.speaker)}</b> ${esc(t.text)}</p>`).join('')}</section><p>${esc(n.posture)} posture · ${n.patience} counteroffers of patience left</p><fieldset class="counter-controls" ${!n.patience || n.attempts.length || n.running || n.closed ? 'disabled' : ''}><legend>YOUR NUMBER · cents per GPU-hour</legend><input data-counter aria-label="Your counteroffer in cents per GPU-hour" type="number" min="1" max="${n.price}" step="1" value="${Math.max(1,n.price-8)}"><div class="actions">${[-5,-1,1,5].map(v=>btn('step-counter',`${v>0?'+':''}${v}¢`,`data-step="${v}"`)).join('')}${btn('haggle','COUNTER')}</div><p data-counter-total></p></fieldset>${rizzPanel(g, l)}<details><summary>Supplier & contract reference</summary>${esc(l.profile)}. ${money(n.price)} per GPU-hour × ${V7.hours} hours × ${l.qty} GPUs. Fixed three-month service rights; immediately assignable, fully paid. No remaining liability or finance fee.</details></div><div class="actions modal-footer">${btn('buy', `Sign & pay · ${money(cost)}`, `class="primary" ${cost > cash(g) || n.running || n.closed ? 'disabled' : ''}`)}${btn('leave', 'Back to floor', `class="quiet" ${n.running ? 'disabled' : ''}`)}</div>`;
}

function confirmation(g) {
  const c = g.arcade.confirm;
  if (c.vcId) return vcReview(g,c.vcId,money);
  if (c.receipt) return contract(c.receipt, money, true);
  if (c.buyerId) return buyerConfirmation(g, c.buyerId);
  if (c.restart) return `<h2 id="dialog-title">Start a fresh broker run?</h2><p>This replaces your current run. Earlier version saves are preserved.</p><div class="actions">${btn('restart', 'Start fresh', 'class="danger"')}${btn('cancel', 'Keep this run')}</div>`;
  if (c.finish) return `<h2 id="dialog-title">Close this quarter?</h2><p>Unsold inventory expires with no refund. ${money(inventoryCost(g))} will become a realized loss.</p><div class="actions">${btn('finish', 'Close quarter', 'class="danger"')}${btn('cancel', 'Keep trading')}</div>`;
  const d = deliveryQuote(g, c.orderId, c.qty, c.payment), o = g.arcade.orders.find(o => o.id === c.orderId);
  if (!d) return `<h2 id="dialog-title">Delivery unavailable</h2>${btn('cancel', 'Back to floor')}`;
  return `<p class="eyebrow">Delivery confirmation · floor paused</p><h2 id="dialog-title">${esc(o.name)}</h2><p>${d.qty} ${badge(o.gpu)} · ${o.delivered + d.qty} / ${o.qty} delivered after signing</p><div class="economics"><span>Supply already paid</span><strong>${money(d.cost)}</strong><span>Cash received now</span><strong>${money(d.revenue)}</strong><span>Realized profit / loss</span><strong>${money(d.revenue - d.cost)}</strong><span>Cash after delivery</span><strong>${money(cash(g) + d.revenue)}</strong>${c.payment === 'equity' ? `<span>New total ownership</span><strong>${(d.stake * 100).toFixed(3)}%</strong>` : ''}</div><p>${c.payment === 'equity' ? 'Compute worth ' + money(d.value) + ' buys shares at the current valuation. No cash comes in. The supply cost is a realized expense; the shares may fail or eventually pay at an acquisition.' : 'Transfer these fully paid service rights and receive the cash payment now. Each GPU can be assigned once.'}</p><div class="actions">${btn('deliver', `Confirm ${c.payment} delivery`, 'class="primary"')}${btn('cancel', 'Back', 'class="quiet"')}</div>`;
}

function report(g) {
  const r = g.arcade.history.at(-1);
  return `${head()}<section class="report panel"><p class="eyebrow">Quarter ${r.q} · books closed</p><h2>${r.orders[0].milestone ? 'You powered their next step.' : 'Every deal leaves a mark.'}</h2><div class="stats"><div class="stat">Quarter profit<b>${money(Math.round(r.profit * 100))}</b></div><div class="stat">Cash available<b>${money(cash(g))}</b></div><div class="stat">Delivered<b>${r.delivered} GPUs</b></div><div class="stat">Expired inventory loss<b>${money(r.lost)}</b></div></div>${r.orders.map(o => `<p><b>${esc(o.name)}</b> · ${o.delivered}/${o.qty} ${o.gpu} delivered${o.milestone ? ' · ORDER COMPLETE · Clout +40' : ''}</p>`).join('')}<p>Outside buyers: ${r.outsideSold} GPUs sold · ${money(r.outsideProfit)} realized sale profit.</p>${inventory(g)}<p>Secondary cash this quarter: ${money(g.arcade.secondarySales.filter(s=>s.q===r.q).reduce((n,s)=>n+s.proceeds,0))}. Equity remains speculative; see the financial desk next quarter.</p><h3>Your startups</h3>${r.startups.map(s => `<article class="portfolio-item"><p><b>${esc(s.name)} · ${esc(s.status)}</b></p><p>${esc(s.text)} ${esc(s.delivery || '')}</p>${s.stake ? `<p>${(s.stake * 100).toFixed(3)}% ownership · ${money(Math.round(s.paper * 100))} paper value</p>` : ''}</article>`).join('')}${r.lines.map(l => `<p>${esc(l.text)}</p>`).join('')}<p>Tycoon Score ${score(g).total} = profit ${score(g).profit} + Clout ${score(g).clout} + compute ${score(g).cp}. Paper equity is excluded.</p><p class="muted">Next quarter: new finite supply. ${g.q <= 2 ? 'Build your anchor relationship before the wider market opens in Q3.' : 'Compare opportunities across startup customers.'}</p><p class="hsc-transition"><b>${esc(BRAND.name)}</b> · ${esc(BRAND.adBody[0])}</p>${btn('next', `Open quarter ${g.q}`, 'class="primary"')} ${btn('restart-review', 'New broker run', 'class="quiet"')}</section>`;
}

function render() {
  cancelAnimationFrame(meterFrame);
  const focused = document.activeElement?.dataset?.action;
  const g = store.state;
  if (store.error) { root.innerHTML = `<div class="shell"><h1>Trading paused</h1><p role="alert">${esc(store.error)}</p></div>`; return; }
  if (!g) { root.innerHTML = `<div class="shell">${head()}<section class="welcome panel"><p class="eyebrow">Start small. Make the next deal count.</p><h1>Could you become the next Cluster Tycoon?</h1><p>Imagine if compute buyers, sellers, and the money were all in one room.</p><ol><li>Claim a small GPU lot. The floor pauses while you negotiate.</li><li>Find a good price and sign. Deliver part of your startup’s order.</li><li>Take cash for the next deal, or equity in their future.</li></ol><p>You start with $65,000 and one startup to supply. Your progress continues from V7.2 on this device.</p>${btn('start', 'START TRADING', 'class="primary"')}<p class="muted">Existing game: <a href="lab.html">V6.4 / Daily Floor / Venture</a></p></section></div>`; return; }
  root.innerHTML = `<div class="shell">${g.phase === 'floor' ? floor(g) : report(g)}</div>${activeLot(g) || g.arcade.confirm ? `<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${g.arcade.signing ? `<div class="modal-content">${contract(g.arcade.signing, money)}</div>` : activeLot(g) ? negotiation(g, activeLot(g)) : `<div class="modal-content">${confirmation(g)}</div>`}</section></div>` : ''}`;
  paintSale(); paintCounter(); paintVC();
  const modal = root.querySelector('.modal');
  root.querySelector('.shell').inert = !!modal;
  if (modal) (modal.querySelector('[data-action="stop-rizz"]') || modal.querySelector(`[data-action="${focused}"]:not(:disabled)`) || modal.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
  else if (returnFocus) { root.querySelector(returnFocus)?.focus({ preventScroll: true }); returnFocus = null; }
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

const visibleKey = g => [...g.arcade.lots.filter(l => available(g, l)), ...g.arcade.buyers.filter(b => buyerLive(g, b)), ...g.arcade.vcOffers.filter(b=>vcLive(g,b))].map(x => x.id).join(',');
root.addEventListener('click', e => {
  const b = e.target.closest('button[data-action]'); if (!b || b.disabled) return;
  const action = b.dataset.action;
  if(action==='visit'){visit(b.dataset.target);return;}
  if(action==='skip-presentation'){b.closest('.sign-room').classList.add('accelerated');b.textContent='Animation skipped';return;}
  if (action === 'start') { const p = new URLSearchParams(location.search).get('seed'); store.start(p && /^\d+$/.test(p) ? Number(p) >>> 0 : newSeed()); if (matchMedia('(prefers-reduced-motion: reduce)').matches) store.act(g => { g.arcade.assistance = true; return true; }); render(); return; }
  if (action === 'claim') { returnFocus = `[data-action="claim"][data-id="${b.dataset.id}"]`; act(g => claim(g, b.dataset.id)); }
  else if (action === 'haggle') { const offer=Number(root.querySelector('[data-counter]').value); act(g=>haggle(g,offer)); }
  else if (action === 'step-counter') { const input=root.querySelector('[data-counter]'); input.value=Math.max(1,Math.min(Number(input.max),Number(input.value)+Number(b.dataset.step))); paintCounter(); }
  else if (action === 'start-rizz') act(startRizz);
  else if (action === 'stop-rizz') stopMeter();
  else if (action === 'buy') { if (act(g => prepareSigning(g, 'purchase'))) sound?.printer(.35); }
  else if (action === 'sign-it') { if (act(signTrade)) { sound?.scratch(.35); const playing=sound; setTimeout(()=>{if(playing&&sound===playing&&store.state.arcade.confirm?.receipt){playing.stamp();playing.bell({strikes:1});}},matchMedia('(prefers-reduced-motion: reduce)').matches?0:450); } }
  else if (action === 'cancel-sign') act(g => { g.arcade.signing = null; return true; });
  else if (action === 'capital') visit('capital-desk');
  else if (action === 'sound') { sound = sound ? null : (audio ||= createAudio()); b.textContent = sound ? 'Sound: on' : 'Sound: off'; }
  else if (action === 'leave') act(leave);
  else if (action === 'prepare') { const card = b.closest('[data-order]'); returnFocus = `[data-action="prepare"][data-id="${b.dataset.id}"]`; act(g => { if (prepareDelivery(g, b.dataset.id, Number(card.querySelector('input').value), card.querySelector('select').value)) return true; notice(g, 'Delivery unavailable: use a whole GPU quantity within your inventory and the order. For cash, stay within the startup’s cash budget, or choose equity.', 'bad'); return true; }); }
  else if (action === 'review-vc') act(g=>reviewVC(g,b.dataset.id));
  else if (action === 'sell-vc') {const bps=Math.round(Number(root.querySelector('[data-vc-percent]').value)*100);if(act(g=>prepareSigning(g,'secondary',bps)))sound?.printer(.35);}
  else if (action === 'review-buyer') act(g => reviewBuyer(g, b.dataset.id));
  else if (action === 'sell-buyer') { const qty = Number(root.querySelector('[data-sale-qty]').value); if (act(g => prepareSigning(g, 'buyer', qty))) sound?.printer(.35); }
  else if (action === 'deliver') act(deliver);
  else if (action === 'cancel') {const receipt=store.state.arcade.confirm?.receipt;if(act(g => { g.arcade.confirm = null; return true; })&&receipt)visit(receipt.kind==='purchase'?'inventory':receipt.kind==='secondary'?'capital-desk':'buyers');}
  else if (action === 'finish-review') act(g => { if (g.arcade.active || g.arcade.confirm) return false; g.arcade.confirm = { finish: true }; return true; });
  else if (action === 'finish') act(g => { g.arcade.confirm = null; return closeQuarter(g); });
  else if (action === 'next') act(openQuarter);
  else if (action === 'restart-review') act(g => { g.arcade.confirm = { restart: true }; return true; });
  else if (action === 'restart') { store.restart(newSeed()); render(); }
});
function visit(id) {const target=document.getElementById(id);if(!target)return;target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.scrollIntoView({block:'start'});}
function stopMeter() {
  const l = activeLot(store.state), entry = l?.negotiation?.running && l.negotiation.attempts.at(-1);
  // Debounce the input that started the meter; consume a single normalized result.
  if (!entry || performance.now() - meterStart < 180) return;
  const pos = markerAt(entry.params, performance.now() - meterStart);
  act(g => resolveRizz(g, pos));
}
root.addEventListener('input', e => { if (e.target.matches('[data-sale-qty]')) paintSale(); if(e.target.matches('[data-counter]')) paintCounter(); if(e.target.matches('[data-vc-percent]'))paintVC(); });
root.addEventListener('change', e => { if (e.target.matches('[data-assist]')) act(g => { const n = activeLot(g)?.negotiation; if (!n || n.attempts.length) return false; g.arcade.assistance = e.target.checked; return true; }); });
document.addEventListener('keydown', e => {
  const modal = root.querySelector('.modal'); if (!modal) return;
  if ((e.key === ' ' || e.key === 'Enter') && activeLot(store.state)?.negotiation?.running) { e.preventDefault(); if (!e.repeat) stopMeter(); return; }
  if (e.key === 'Escape') { e.preventDefault(); if (store.state.arcade.signing) act(g => { g.arcade.signing = null; return true; }); else if (store.state.arcade.confirm) act(g => { g.arcade.confirm = null; return true; }); else act(leave); }
  if (e.key === 'Tab') { const all = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a')]; const first = all[0], end = all.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); } else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); } }
});
setInterval(() => {
  const now = performance.now(), dt = (now - last) / 1000; last = now;
  const g = store.state;
  if (!g || store.error || document.hidden || g.phase !== 'floor' || g.arcade.active || g.arcade.confirm) return;
  if (!store.act(g => advance(g, dt))) { if (store.error) render(); return; }
  const next = store.state;
  if (next.phase !== 'floor' || lastPaint !== visibleKey(next)) { render(); return; }
  root.querySelector('[data-clock]').textContent = `${Math.ceil(V7.seconds - next.arcade.time)}s`;
  for (const el of root.querySelectorAll('[data-expiry]')) el.textContent = Math.ceil(next.arcade.lots.find(l => l.id === el.dataset.expiry).until - next.arcade.time);
  for (const el of root.querySelectorAll('[data-buyer-expiry]')) el.textContent = Math.ceil(next.arcade.buyers.find(b => b.id === el.dataset.buyerExpiry).until - next.arcade.time);
  for(const el of root.querySelectorAll('[data-vc-expiry]'))el.textContent=Math.ceil(next.arcade.vcOffers.find(b=>b.id===el.dataset.vcExpiry).until-next.arcade.time);
  for(const el of root.querySelectorAll('[data-desk-until]'))el.textContent=Math.max(0,Math.ceil(Number(el.dataset.deskUntil)-next.arcade.time));
  const hc=root.querySelector('[data-hall-clock]');if(hc)hc.textContent=`${Math.ceil(V7.seconds-next.arcade.time)}s`;
  const arrival=root.querySelector('[data-arrival-at]');if(arrival)arrival.textContent=Math.max(0,Math.ceil(Number(arrival.dataset.arrivalAt)-next.arcade.time));
  const upcoming = next.arcade.lots.find(l => l.at > next.arcade.time);
  root.querySelector('[data-next]').textContent = upcoming ? `Next release in ${Math.ceil(upcoming.at - next.arcade.time)}s of floor time.` : 'All releases are on the board. Supply is finite.';
}, 250);
window.addEventListener('storage', e => { if (e.key === V7.key) { store.act(() => true); render(); } });
render();
