import { parseRate } from './offers.js';
import { esc } from '../util.js';
import { activeLot, available, cash, cashCapacity, cents, deliveryQuote, fortune, inventoryCost, owned, remaining, score, V7 } from '../tycoon/arcade.js';
import { buyerLive, saleQuote } from '../tycoon/arcade-buyers.js';
import { maxSaleBps, secondaryQuote, vcLive } from '../tycoon/arcade-vc.js';
import { mandateQuote } from '../tycoon/mandate.js';
import { matchedProjection } from '../tycoon/pit-transactions.js';
import { charmView } from './pit-charm.js';
import { rivalQuotes } from '../tycoon/arcade-negotiation.js';

export const money = n => `${n < 0 ? '−' : ''}$${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const rate = n => `$${(n / 100).toFixed(2)}`;
const pct = n => `${(n * 100).toFixed(3)}%`;
const button = (action, label, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${label}</button>`;
const close = (label = 'Back to the floor') => button('close-focus', label, 'class="quiet"');
const number = n => esc(String(n));
const metric = (label, value, tone = '') => `<div class="deal-metric ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
const metrics = (...rows) => `<div class="deal-metrics">${rows.join('')}</div>`;
const note = (text, tone = '') => `<p class="deal-note ${tone}">${text}</p>`;
const hero = (label, value, subtitle = '') => `<div class="deal-quote"><span>${label}</span><strong>${value}</strong>${subtitle ? `<small>${subtitle}</small>` : ''}</div>`;
const input = (attr, value, min = 1, max = 999, step = 1, label = '') => `<input ${attr} type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${number(value)}" aria-label="${esc(label)}">`;
const contractDetails = body => `<details class="deal-details"><summary>Contract & accounting</summary>${body}</details>`;
const identity = (name, role, subtitle = '', line = '', reaction = '') => ({ name, role, subtitle, line, reaction });

export function supplierCounterPreview(g, offer) {
  const l = activeLot(g), n = l?.negotiation;
  const valid = !!n && available(g, l) && !n.running && !n.closed && !n.attempts.length && n.patience > 0 && Number.isSafeInteger(offer) && offer > 0 && offer < n.price;
  return { valid, html: valid ? `Your offer: <b>${money(cents(l.qty, offer))}</b> · not agreed` : 'Offer a lower rate, in whole cents.' };
}

export function buyerCounterPreview(g, offer, qty) {
  const b = g.arcade.buyers.find(b => b.id === g.arcade.confirm?.buyerId);
  const valid = !!b && buyerLive(g, b) && b.negotiation.counters < 2 && Number.isSafeInteger(offer) && offer > b.rate && offer <= 99900 && Number.isSafeInteger(qty) && qty > 0 && qty <= b.qty - b.filled;
  return { valid, html: valid ? `Your ask: <b>${money(cents(qty, offer))}</b> · not agreed` : 'Use whole GPUs and a higher rate, in whole cents.' };
}

export function buyerQuoteView(g, qty) {
  const b=g.arcade.buyers.find(b=>b.id===g.arcade.confirm?.buyerId),d=b&&saleQuote(g,b.id,qty);
  if(d)return {valid:true,html:hero('Current buyer payment',money(d.revenue),`${qty} ${b.gpu} · ${rate(b.rate)}/h`) + note(`${money(Math.abs(d.revenue-d.cost))} ${d.revenue>=d.cost?'profit':'loss'} if signed`,d.revenue>=d.cost?'positive':'negative')};
  const funded=b&&buyerLive(g,b)&&Number.isSafeInteger(qty)&&qty>0&&qty<=b.qty-b.filled&&cents(qty,b.rate)<=b.budget;
  return {valid:false,html:funded?hero('Current buyer payment',money(cents(qty,b.rate)),`${qty} ${b.gpu} · ${rate(b.rate)}/h · ${owned(g,b.gpu)} owned`):note('Choose a quantity within the buyer’s funded demand.','negative')};
}

export function startupQuoteView(g, orderId, qty, payment) {
  const o = g.arcade.orders.find(o => o.id === orderId), d = o && g.arcade.time < V7.seconds && deliveryQuote(g, orderId, qty, payment);
  if (!d) return { valid: false, html: note('Choose whole GPUs within your stock and this order. Cash payment also needs enough startup cash.', 'negative') };
  const s = g.startups.find(s => s.id === o.client);
  return { valid: true, html: payment === 'cash'
    ? metrics(metric('Cash received', money(d.revenue)), metric('Profit if signed', money(d.revenue - d.cost), d.revenue >= d.cost ? 'positive' : 'negative')) + note(`FIFO cost basis ${money(d.cost)}.`)
    : metrics(metric('Ownership received', `+${pct(d.stake - s.stake)}`), metric('Cash received', '$0')) + note(`Compute cost ${money(d.cost)} becomes a realized expense. Ownership after delivery: ${pct(d.stake)}.`, 'equity') };
}

export function secondaryQuoteView(g, bps) {
  const d = secondaryQuote(g, g.arcade.confirm?.vcId, bps);
  if (!d) return { valid: false, html: note('Choose a portion within this bid’s ownership, capital and deadline limits.', 'negative') };
  return { valid: true, html: metrics(metric('Cash received', money(d.proceeds)), metric('Ownership retained', pct(d.remaining))) + note(`You transfer ${pct(d.sold)} of the company. Historical basis ${money(d.basis)}; economic gain/loss ${money(d.gain)}.`) };
}

function selectedProjection(g, l, ui) {
  const buyerId = g.arcade.sourcingFor || ui.buyerId;
  const o = g.arcade.orders.find(o => o.id === ui.orderId) || g.arcade.orders.find(o => o.client === g.arcade.anchor && o.gpu === l.gpu);
  return matchedProjection(g, l.id, { buyerId, orderId: buyerId ? undefined : o?.id });
}

function offerControls(kind,value,min,max,remaining,preview) {
  const supplier=kind==='supplier',attr=supplier?'data-counter':'data-buyer-counter',submit=supplier?'haggle':'counter-buyer';
  const step=n=>button('step-offer',`${n<0?'−':'+'}${Math.abs(n)}¢`,`data-kind="${kind}" data-step="${n}" aria-label="${n<0?'Decrease':'Increase'} ${kind} proposal by ${Math.abs(n)} cents"`);
  return `<fieldset class="deal-counter bargain-controls"><legend>Your ${supplier?'offer':'ask'} · $/GPU-hour</legend><div class="bargain-stepper">${step(-5)}${step(-1)}${input(attr,value,min,max,.01,`Your ${kind} proposal in dollars per GPU-hour`)}${step(1)}${step(5)}</div><div class="bargain-submit"><span ${supplier?'data-counter-total':'data-buyer-proposal'} aria-live="polite">${preview.html}</span>${button(submit,supplier?'Make offer':'Negotiate bid',preview.valid?'':'disabled')}</div><small>${remaining} ${supplier?'offers':'counters'} left · submit uses 2s</small></fieldset>`;
}
function supplierReaction(l) {
  const n=l.negotiation,r=n.tape.at(-1),last=n.attempts.at(-1);
  if(n.running)return ['Make your pitch','Let’s see what you’ve got.'];
  if(l.status==='walked')return ['Supplier walked','We’re done. Try another desk.'];
  if(l.status==='expired'||r?.outcome==='expired')return ['Quote expired','Too late. That allocation is closed.'];
  if(last){const label=last.tier==='hit'?`${last.precision} Charm`:last.tier==='near'?'Near miss':'Charm missed';return [label,n.tape.at(-1)?.text];}
  const label={accept:'Offer accepted',counter:'Counteroffer',hold:'Offer rejected',match:'Rival matched',beat:'Rival beaten',decline:'Rival refused'}[r?.outcome]||'Opening quote';
  // Posture tells come from the seller's own truthful lines: firm desks never move on a counter, only on the market.
  const line=['match','beat','decline'].includes(r?.outcome)?r.text.replace(/ That is my last counter.*$/,''):r?.outcome==='accept'?`Agreed. ${rate(n.price)}. Shall we sign?`:r?.outcome==='counter'?`Meet me at ${rate(n.price)}. Your move.`:r?.outcome==='hold'?(n.posture==='firm'&&/^That number does not work/.test(r.text)?`Haggling won’t move me. Show me a better quote.`:`No deal at that number. ${rate(n.price)} stands.`):n.tape[0]?.text||'Bring me your number. Let’s talk.';
  return [n.patience===0&&!n.closed?`${label} · final quote`:label,line];
}
function supplierView(g, ui) {
  const l=activeLot(g),n=l.negotiation,cost=cents(l.qty,n.price),live=available(g,l)&&!n.closed;
  const offer=ui.counter??((n.haggles?n.price:Math.max(1,n.price-8))/100).toFixed(2),preview=supplierCounterPreview(g,parseRate(offer));
  const canBank=live&&!n.running&&cost<=cash(g)&&n.price>=l.floor,[reaction,line]=supplierReaction(l);
  const projection=(g.arcade.sourcingFor||ui.buyerId)&&selectedProjection(g,l,ui),savings=cents(l.qty,l.ask-n.price);
  const counter=live&&!n.running&&!n.attempts.length&&n.patience?offerControls('supplier',offer,.01,(n.price/100).toFixed(2),n.patience,preview):'';
  const rival=live&&!n.running?rivalQuotes(g)[0]:null;
  const rivalCard=rival?`<div class="rival-slip"><div><span>Rival quote · on the floor</span><b>${esc(rival.firm)} · ${rate(rival.rate)}/h</b><small>${l.until<=g.arcade.time+2?'<em>Using it now expires this quote.</em>':`${rival.qty} ${l.gpu} · ${Math.max(0,Math.ceil(rival.until-g.arcade.time))}s left · one play per desk`}</small></div>${button('play-rival','Use it · 2s',`data-id="${esc(rival.id)}" aria-label="Tell ${esc(l.firm)} that ${esc(rival.firm)} is quoting ${rate(rival.rate)} per GPU-hour. Uses one counter and 2 seconds."`)}</div>`:'';
  const summary=!n.running?`<p class="bargain-savings">${money(savings)} saved from opening ask${projection?` <span>· ${money(Math.abs(projection.conditionalProfit))} ${projection.conditionalProfit<0?'loss':'profit'} if ${projection.qty} resell</span>`:''}</p>`:'';
  return {title:n.running?'Make it count.':live?'Work the deal.':'This quote is closed',role:'seller',tone:'negotiation',
    identity:identity(l.firm,'seller',`${l.qty} ${l.gpu} · ${n.rapport}`,line,reaction),
    body:hero('Current supplier quote',money(cost),`${l.qty} ${l.gpu} · ${rate(n.price)}/h · ${Math.max(0,Math.ceil(l.until-g.arcade.time))}s left`)+summary+counter+rivalCard+
      (live&&!n.running&&!n.attempts.length&&!n.patience?note('No counters left. Take this quote, push Charm, or leave.'):'')+
      `<div class="deal-charm">${charmView(g,l)}</div>`+(live&&cost>cash(g)?note(`Need ${money(cost-cash(g))} more cash to buy.`,'negative'):''),
    footer:button('buy',`${n.haggles||n.attempts.length?'Bank':'Accept'} · ${money(cost)}`,`class="primary" ${canBank?'':'disabled'}`)+button(g.arcade.sourcingFor?'return-buyer':'close-focus',g.arcade.sourcingFor?'Return to buyer':'Walk away',`class="quiet" ${n.running?'disabled':''}`)};
}
function buyerView(g, ui) {
  const b=g.arcade.buyers.find(b=>b.id===g.arcade.confirm.buyerId),n=b.negotiation,live=buyerLive(g,b),wanted=b.qty-b.filled;
  const funded=Math.min(wanted,Math.floor(b.budget/cents(1,b.rate))),stock=owned(g,b.gpu),qty=ui.qty??Math.max(1,Math.min(stock||funded,funded));
  const offer=ui.buyerCounter??((b.rate+(n.counters?0:5))/100).toFixed(2),quote=buyerQuoteView(g,Number(qty)),counter=buyerCounterPreview(g,parseRate(offer),Number(qty));
  const r=n.tape.at(-1),reaction=!live?(n.walked?'Buyer walked':'Order closed'):({accept:'Bid raised',counter:'Counteroffer',hold:'Bid stands'}[r?.outcome]||'Funded buyer');
  const line=!live?'This order is off the table.':r?.outcome==='hold'?`That’s my limit. ${rate(b.rate)} stands.`:r?.outcome==='accept'||r?.outcome==='counter'?`${rate(b.rate)}. My budget covers ${funded} ${b.gpu}.`:`I need ${funded} ${b.gpu}. What’s your number?`;
  const sources=g.arcade.lots.filter(l=>l.gpu===b.gpu&&available(g,l)&&!l.negotiation?.closed);
  const sourcing=live&&ui.buyerSources;
  const sourceBody=`<div class="deal-source-list">${sources.map(l=>button('source-buyer',`<span>${esc(l.firm)}</span><b>${l.qty} ${l.gpu} · ${money(cents(l.qty,l.negotiation?.price??l.ask))}</b>`,`data-id="${esc(l.id)}" class="deal-source"`)).join('')||note('No matching supply right now. Check the next arrivals.')}</div>`;
  return {title:sourcing?'Find their compute.':'Work the bid.',role:'buyer',tone:'negotiation',identity:identity(b.name,'buyer',`${funded} funded · ${stock} owned · ${Math.max(0,Math.ceil(b.until-g.arcade.time))}s left`,line,reaction),
    body:sourcing?sourceBody:`<div data-sale-math>${quote.html}</div>`+(live?`<label class="deal-quantity">GPUs ${input('data-sale-qty',qty,1,wanted,1,'GPUs to sell')}</label>`:'')+
      (live&&n.counters<2?offerControls('buyer',offer,(b.rate/100).toFixed(2),999,2-n.counters,counter):live?note('Final bid. Source supply or take the deal.'):'')+
      (live?`<small class="bargain-budget">${money(b.budget)} budget · higher bids may fund fewer GPUs</small>`:''),
    footer:sourcing?button('buyer-bargain','Back to negotiation','class="primary"')+close():`<span data-buyer-actions>${buyerActions(g,Number(qty))}</span>`+close()};
}
export function buyerActions(g,qty){
  const b=g.arcade.buyers.find(b=>b.id===g.arcade.confirm?.buyerId);
  if(!b||!buyerLive(g,b))return '';
  return (saleQuote(g,b.id,qty)?button('sell-buyer','Review sale','class="primary"'):'')+button('buyer-sources','Find Supply',`class="${saleQuote(g,b.id,qty)?'quiet':'primary'}"`);
}

function receiptView(g, d, signed) {
  const purchase = d.kind === 'purchase', equity = d.kind === 'startup' && d.payment === 'equity', secondary = d.kind === 'secondary';
  let body = `<div class="deal-ticket ${signed ? 'is-signed' : ''}"><div class="deal-ticket-top"><span>HSC / ${signed ? d.id : 'EXECUTION COPY'}</span>${signed ? '<strong class="deal-stamp">SIGNED</strong>' : '<span>Awaiting signature</span>'}</div>`;
  if (purchase) body += hero(signed ? 'Purchase paid' : 'Purchase commitment', money(d.total), `${d.qty} ${d.gpu} acquired${signed ? '' : ' on signature'}`) + metrics(metric('Realized profit', '$0'), metric(signed ? 'Cash available' : 'Cash after purchase', money(cash(g) - (signed ? 0 : d.total)))) + note('You own prepaid inventory. Profit is realized when you sell or deliver it.');
  else if (equity) body += hero('Ownership received', `+${pct(d.equityReceived ?? (d.stake - g.startups.find(s => s.id === g.arcade.orders.find(o => o.id === d.orderId)?.client)?.stake))}`, `${d.qty} ${d.gpu} delivered for startup shares`) + metrics(metric('Cash received', '$0'), metric('Realized compute expense', money(d.cost), 'negative')) + note(`Ownership after delivery ${pct(d.ownershipAfter ?? d.stake)}. Shares are speculative; no immediate cash profit.`);
  else if (secondary) {
    const sale = signed ? [...g.arcade.secondarySales].reverse().find(s => s.q === d.q && s.counterparty === d.counterparty && s.proceeds === d.total) : secondaryQuote(g, g.arcade.confirm?.vcId, d.bps);
    body += hero(signed ? 'Cash received' : 'Cash on signature', money(d.total), `${d.qty.toFixed(3)}% company ownership transferred`) + metrics(metric('Historical basis allocated', money(sale?.basis || 0)), metric('Economic gain / loss', money(d.total - (sale?.basis || 0)))) + note(`Retained ownership ${pct(sale?.remaining || 0)}. Compute cost was expensed earlier; game profit increases by ${money(d.total)} without charging it twice.`);
  } else body += hero(signed ? 'Cash received' : 'Cash on signature', money(d.total), `${d.qty} ${d.gpu} ${signed ? 'delivered' : 'to deliver'}`) + metrics(metric('FIFO cost basis', money(d.cost)), metric(signed ? 'Realized profit' : 'Profit if signed', money(d.total - d.cost), d.total >= d.cost ? 'positive' : 'negative'));
  body += `<p class="deal-ticket-party">${esc(d.counterparty)}</p></div>`;
  if (!signed) body += note('Signing rechecks the current quote, deadline, inventory and money.');
  return { title: signed ? purchase ? 'Inventory secured.' : equity ? 'You own a piece of it.' : 'Deal on the tape.' : 'Put it in writing.', role: purchase ? 'seller' : secondary ? 'capital' : 'buyer', tone: signed ? 'receipt' : 'signing',
    identity: identity(d.counterparty, purchase ? 'seller' : secondary ? 'capital' : d.kind === 'startup' ? 'startup' : 'buyer', signed ? 'Transaction complete' : 'Contract ready', signed ? purchase ? 'Your compute. Your next move.' : equity ? 'Now we build something.' : 'Good doing business.' : 'One signature makes it official.'),
    body, footer: signed ? button('post-receipt', purchase && g.arcade.sourcingFor ? 'Return to buyer' : purchase ? 'Put your inventory to work' : 'Find the next deal', 'class="primary"') : button('sign-it', purchase ? `Sign · pay ${money(d.total)}` : 'Sign the contract', 'class="primary"') + button('cancel-sign', 'Keep negotiating', 'class="quiet"') };
}

function startupView(g, ui) {
  const o = g.arcade.orders.find(o => o.id === ui.orderId) || g.arcade.orders.find(o => o.client === g.arcade.anchor) || g.arcade.orders[0], s = g.startups.find(s => s.id === o.client);
  const stock = owned(g, o.gpu), qty = ui.qty ?? Math.max(1, Math.min(stock, remaining(o), cashCapacity(g, o) || stock)), payment = ui.payment || 'cash';
  const q = startupQuoteView(g, o.id, Number(qty), payment);
  return { title: 'The founder’s order', role: 'startup', identity: identity(s.name, 'startup', `${remaining(o)} ${o.gpu} still needed`, o.milestone ? 'You got our launch over the line.' : 'Keep our compute running. We can pay cash—or make you an owner.'),
    body: `<div data-order="${esc(o.id)}"><div class="deal-bid"><b>${money(cents(remaining(o), o.rate))} remaining order</b><span>${o.delivered}/${o.qty} supplied · ${stock} ${o.gpu} owned</span></div><div class="deal-field-row"><label>GPUs${input('data-order-qty', qty, 1, remaining(o), 1, 'GPUs to deliver')}</label><label>Payment<select data-payment aria-label="Startup payment"><option value="cash" ${payment === 'cash' ? 'selected' : ''}>Cash</option><option value="equity" ${payment === 'equity' ? 'selected' : ''}>Startup equity</option></select></label></div><div data-order-preview>${q.html}</div></div>` +
      note(`${cashCapacity(g, o)} GPUs cash-funded at ${rate(o.rate)}/GPU-hour. Completing the order earns +1 startup Trust and +40 Clout.`) +
      (!stock && remaining(o) ? button('open-market', `Find ${o.gpu} suppliers`, `data-filter="seller" data-gpu="${o.gpu}" class="deal-inline-action"`) : '') +
      contractDetails(`<p>Startup cash ${money(Math.round(s.cash * 100))} · ownership ${pct(s.stake)} · ${Math.max(0, s.cash / Math.max(1, s.burn)).toFixed(1)} quarters runway.</p><p>Cash delivery books revenue minus FIFO cost. Equity delivery expenses compute immediately and changes ownership at the actual company valuation. Paper value is not cash.</p>${g.arcade.orders.length > 1 ? `<div class="deal-other-orders">${g.arcade.orders.filter(x => x.id !== o.id).map(x => button('focus-order', `${esc(x.name)} · ${remaining(x)} ${x.gpu}`, `data-id="${esc(x.id)}"`)).join('')}</div>` : ''}`),
    footer: button('prepare', 'Review delivery', `data-id="${esc(o.id)}" class="primary" ${q.valid ? '' : 'disabled'}`) + close() };
}

function deliveryView(g) {
  const c = g.arcade.confirm, d = g.arcade.time < V7.seconds && deliveryQuote(g, c.orderId, c.qty, c.payment), o = g.arcade.orders.find(o => o.id === c.orderId);
  if (!d) return { title: 'Delivery unavailable', role: 'startup', body: note('Inventory or startup funding changed. Review the order again.'), footer: close() };
  return { title: d.payment === 'cash' ? 'Deliver for cash.' : 'Take the startup upside.', role: 'startup', identity: identity(o.name, 'startup', `${d.qty} ${o.gpu} · ${d.payment === 'cash' ? 'Cash invoice' : 'Equity exchange'}`, 'Ready when you are.'),
    body: hero('Delivery', `${d.qty} ${o.gpu}`, `${V7.hours}-hour prepaid service rights`) + startupQuoteView(g, o.id, d.qty, d.payment).html + note(d.payment === 'equity' ? 'Future growth and exits are uncertain. These shares cannot fund your next purchase until cash is actually received.' : 'Cash and inventory change together when you sign.'),
    footer: button('deliver', d.payment === 'cash' ? 'Sign & receive cash' : 'Sign & receive equity', 'class="primary"') + button('review-order','Review order','class="quiet"') };
}

function stockView(g) {
  const stock = g.arcade.inventory.filter(x => x.left), types = [...new Set(stock.map(x => x.gpu))];
  const mandate = mandateQuote(g);
  return { title: 'Your compute book', role: 'stock', body: hero('Unexpired inventory at cost', money(inventoryCost(g)), `${stock.reduce((n, x) => n + x.left, 0)} prepaid GPUs`) +
    (types.map(gpu => `<article class="deal-stock-row"><div><b>${owned(g, gpu)} ${gpu}</b><span>${money(stock.filter(x => x.gpu === gpu).reduce((n, x) => n + x.left * x.unitCost, 0))} basis</span></div>${button('open-market', 'Find buyers', `data-filter="buyer" data-gpu="${gpu}"`)}${g.arcade.orders.filter(o => o.gpu === gpu && remaining(o)).map(o => button('focus-order', esc(o.name), `data-id="${esc(o.id)}"`)).join('')}</article>`).join('') || note('Your book is empty. Choose a buyer, then source matching compute.')) +
    (mandate && owned(g, mandate.gpu) ? button('open-panel', `Atlas procurement · ${mandate.secured}/${mandate.qty} secured`, 'data-panel="mandate" class="deal-inline-action"') : '') +
    note('Rights expire at the round’s bell. Undelivered cost becomes a realized loss.') + (stock.length ? contractDetails(stock.map(x => `<p>${esc(x.firm)} · ${x.left}/${x.qty} ${x.gpu} remaining · ${money(x.left * x.unitCost)} basis.</p>`).join('')) : ''), footer: close() };
}

function capitalView(g, ui) {
  const a = g.arcade, id = a.confirm?.vcId;
  if (id) {
    const b = a.vcOffers.find(b => b.id === id), s = g.startups.find(s => s.id === b.client), max = maxSaleBps(b), percent = ui.vcPercent ?? Math.min(25, max / 100), q = secondaryQuoteView(g, Math.round(Number(percent) * 100));
    return { title: 'Sell a piece of your upside', role: 'capital', identity: identity(b.name, 'capital', `${b.type} · ${s.name}`, 'Your ownership has a cash price. How much are you selling?'),
      body: hero('Funded secondary offer', money(b.budget), `${Math.max(0, Math.ceil(b.until - a.time))}s left · one acceptance`) + `<label class="deal-quantity">% of your current stake${input('data-vc-percent', percent, 0.01, max / 100, 0.01, 'Percent of current stake to sell')}</label><div data-vc-math>${q.html}</div>` + note(`Maximum ${(max / 100).toFixed(2)}% of your ${pct(s.stake)} stake. Bid valuation ${money(b.bidVal)}.`) + contractDetails('<p>This transfers existing shares. The cash goes to you; the startup receives no funding. Sold shares lose future upside. A partial transfer uses this entire offer window.</p>'),
      footer: button('sell-vc', 'Review share transfer', `class="primary" ${q.valid ? '' : 'disabled'}`) + close() };
  }
  const bids = a.vcOffers.filter(b => vcLive(g, b));
  return { title: 'The capital office', role: 'capital', body: note('Turn earned startup ownership into spendable cash when a funded investor makes an offer.') +
    (bids.map(b => `<article class="deal-list-card"><div><b>${esc(b.name)}</b><span>${esc(g.startups.find(s => s.id === b.client)?.name)} · ${money(b.budget)} capital</span></div>${button('review-vc', 'Review bid', `data-id="${esc(b.id)}"`)}</article>`).join('') || note('No bids on the board.')) +
    contractDetails(g.startups.filter(s => a.investments[s.id]).map(s => { const i = a.investments[s.id]; return `<p><b>${esc(s.name)}</b> · ${pct(s.stake)} retained. Compute invested ${money(i.invested)}; secondary cash received ${money(i.proceeds)}; remaining historical basis ${money(i.basis)}.</p>`; }).join('') || '<p>Deliver compute for equity to begin a portfolio. Future offers depend on actual startup performance and funded investor demand.</p>'), footer: close() };
}

function mandateView(g) {
  const m = g.arcade.mandate, q = mandateQuote(g);
  if (!m || !q) return { title: m?.complete || g.arcade.mandateCompleted ? 'Atlas delivered.' : 'Procurement closed', role: 'buyer', body: note(m?.complete || g.arcade.mandateCompleted ? 'Atlas Meridian Cloud paid the assembled procurement. Your completed deal is in the ledger.' : 'There is no live procurement to sign.'), footer: close() };
  return { title: 'Three suppliers. One big deal.', role: 'buyer', identity: identity(m.name, 'buyer', `${m.qty} ${m.gpu} · ${m.suppliersRequired} suppliers`, 'Assemble the whole allocation. Then we pay in full.'),
    body: hero('Funded payment on full delivery', money(q.revenue), `${Math.max(0, Math.ceil(m.until - g.arcade.time))}s left`) + metrics(metric('Compute secured', `${q.secured}/${m.qty} ${m.gpu}`), metric('Supplier firms', `${q.suppliers}/${m.suppliersRequired}`)) +
      (q.ready ? metrics(metric('Delivered cost basis', money(q.cost)), metric('Profit if signed', money(q.margin), q.margin >= 0 ? 'positive' : 'negative')) : note('Source matching inventory from at least three firms. No payment for partial fulfillment.')) +
      contractDetails(`<p>Actual committed basis ${money(q.cost)}. The contract consumes exact inventory legs once and pays from a finite ${money(m.budget)} budget. Purchased surplus remains yours until the bell. No deposit, financing or partial payout.</p>`),
    footer: button(g.arcade.confirm?.mandate ? 'mandate-sign' : 'mandate-review', q.ready ? 'Review Atlas contract' : 'Assemble the allocation', `class="primary" ${q.ready ? '' : 'disabled'}`) + (q.ready ? '' : button('open-market', 'Find suppliers', `data-filter="seller" data-gpu="${m.gpu}"`)) + close() };
}

function fortuneBody(g) {
  const w = fortune(g);
  return hero('Estimated net worth', money(w.netWorth), `Started with ${money(V7.cash)}`) + metrics(metric('Spendable cash', money(w.cash)), metric('Estimated equity', money(w.equity)), metric('Inventory at cost', money(w.inventory)), metric('Realized profit to date', money(Math.round(g.profit * 100)))) +
    contractDetails(`<p>Cash + estimated live equity + unexpired inventory − ${money(w.liabilities)} liabilities. Profit is already reflected in these assets and is never added again.</p><p>Shares count at 25% of paper value, or 10% with less than one quarter of runway. This estimate is not a guaranteed sale price.</p>${w.holdings.map(h => `<p>${esc(h.name)} · ${money(h.paper)} paper × ${h.factor * 100}% = ${money(h.value)} estimated.</p>`).join('')}<p>Secondary Tycoon score ${score(g).total.toLocaleString('en-US')}; reputation and compute bonus ${score(g).bonus}, capped at 2% of wealth.</p>`);
}

function reportView(g) {
  const r = g.arcade.history.at(-1), final = g.phase === 'over';
  return { title: final ? g.arcade.ending === 'completed' ? 'Your fortune, on the record.' : 'The trading desk closes.' : `Round ${r.q} · books closed`, role: 'report',
    body: final ? fortuneBody(g) + note(`${g.arcade.history.length}/18 rounds settled · ${g.arcade.history.reduce((n, h) => n + h.delivered, 0)} GPUs delivered to startups · ${g.arcade.secondarySales.length} secondary sales · Atlas ${g.arcade.mandateCompleted ? 'completed' : 'not completed'}.`) + note('Remaining shares are estimated, not cashed out.')
      : hero('Realized profit this round', money(Math.round(r.profit * 100)), `${r.delivered} GPUs to startups · ${r.outsideSold} to outside buyers`) + metrics(metric('Cash available', money(cash(g))), metric('Expired inventory loss', money(r.lost)), metric('Estimated net worth', money(fortune(g).netWorth))) +
        `<div class="deal-round-orders">${r.orders.map(o => note(`<b>${esc(o.name)}</b> · ${o.delivered}/${o.qty} ${o.gpu}${o.milestone ? ' · order complete' : ''}`)).join('')}</div><details class="deal-details"><summary>Startup fortunes & round ledger</summary>${r.startups.map(s => `<article><b>${esc(s.name)} · ${esc(s.status)}</b><p>${esc(s.text || '')} ${esc(s.delivery || '')}</p>${s.fortune ? `<p>${esc(s.fortune.headline)} · ${esc(s.fortune.status)} · actual growth ${Math.round(s.fortune.growth * 100)}%. Service contribution ${Math.round(s.fortune.serviceGrowth * 100)} growth points; commercial outcomes remain uncertain.</p>` : ''}</article>`).join('')}${r.lines.map(l => note(esc(l.text))).join('')}</details>`,
    footer: final ? button('restart-review', 'New broker run', 'class="primary"') : button('next', `Open round ${g.q} / 18`, 'class="primary"') + button('restart-review', 'New run', 'class="quiet"') };
}

export function dealView(g, ui = {}) {
  const a = g.arcade, c = a.confirm;
  if (c?.restart) return { title: 'Start a fresh broker run?', role: 'report', body: note('This replaces your current V10.2 run. Its cash, deals and campaign progress will be reset.'), footer: button('restart', 'Start fresh', 'class="danger"') + close('Keep this run') };
  if (g.phase !== 'floor') return reportView(g);
  if (a.signing) return receiptView(g, a.signing, false);
  if (c?.receipt) return receiptView(g, c.receipt, true);
  if (c?.finish) return { title: 'Ring the closing bell?', role: 'report', body: hero('Unsold inventory expiring', money(inventoryCost(g)), 'Full cost becomes a realized loss; no refund.') + note('Startup deliveries settle and new finite opportunities arrive next round.'), footer: button('finish', 'Settle this round', 'class="danger"') + close('Keep trading') };
  if (a.active) return supplierView(g, ui);
  if (c?.buyerId) return buyerView(g, ui);
  if (c?.orderId) return deliveryView(g);
  if (c?.vcId) return capitalView(g, ui);
  if (c?.mandate) return mandateView(g);
  if (ui.panel === 'stock') return stockView(g);
  if (ui.panel === 'startup') return startupView(g, ui);
  if (ui.panel === 'capital') return capitalView(g, ui);
  if (ui.panel === 'mandate') return mandateView(g);
  if (ui.panel === 'fortune') return { title: 'Your fortune', role: 'capital', body: fortuneBody(g), footer: close() };
  return null;
}
