// Presentation only: all alternatives use existing transaction quotes.
import { choices } from '../tycoon/arcade-choices.js';
import { cash } from '../tycoon/arcade.js';
import { esc } from '../util.js';
import { gpuBadge } from './arcade-gpu.js';
const signed=(n,money)=>`${n>=0?'+':'−'}${money(Math.abs(n))}`;
const gain=(d,s)=>((d.stake-s.stake)*100).toFixed(3);
export function tradeoff(c,money) {
  if(c.premium===null)return c.outside?`Outside bid covers ${c.outside.qty} GPUs; compare quantities.`:'No live outside bid — resale is speculative.';
  if(c.premium===0)return `Same cash for ${c.outside.qty} GPUs; startup delivery also advances its target.`;
  return `${c.premium>0?'OUTSIDE BID':'STARTUP PAYS'}: +${money(Math.abs(c.premium))} MORE CASH for the same ${c.outside.qty} GPUs.`;
}
export function progress(o,qty) {
  const after=o.delivered+qty,left=o.qty-after;
  return left?`${after}/${o.qty} supplied · ${left} GPUs still needed.`:`TARGET COMPLETE · ${after}/${o.qty} supplied · Trust +1 · Clout +40. Improves prospects; success is uncertain.`;
}
export function accounting(g,d,money,s=null) {
  return `<details class="accounting"><summary>Accounting & terms</summary><dl class="detail-ledger"><dt>FIFO cost basis</dt><dd>${money(d.cost)}</dd><dt>Realized profit / expense</dt><dd>${signed(d.revenue-d.cost,money)}</dd>${s?`<dt>Ownership before → after</dt><dd>${(s.stake*100).toFixed(3)}% → ${(d.stake*100).toFixed(3)}%</dd><dt>New shares at current valuation</dt><dd>${money(d.value)} paper</dd>`:''}</dl><p>Three-month prepaid rights. ${s?'Compute cost is expensed now; paper equity is excluded from realized profit. New shares dilute existing ownership.':'Profit is cash received minus the prepaid cost of these GPUs.'}</p></details>`;
}
export function selectedOutcome(g,d,money,s=null) {
  return `<div class="selected-outcome ${s?'equity-outcome':'cash-outcome'}">${s?`<span class="eyebrow">Take startup equity</span><strong class="outcome-number">+${gain(d,s)}<small> percentage points</small></strong><p>New shares ≈ ${money(d.value)} paper · $0 cash today</p><p class="tradeoff-note">Long-term upside. Capital tied up. Shares can become worthless.</p>`:`<span class="eyebrow">Cash received</span><strong class="outcome-number">${money(d.revenue)}</strong><p class="outcome-profit ${d.revenue>=d.cost?'good':'bad'}">${signed(d.revenue-d.cost,money)} ${d.revenue>=d.cost?'profit':'loss'}</p>`}<p class="cash-after">Cash after: <b>${money(cash(g)+d.revenue)}</b></p></div>`;
}
export function decisionView(g,gpu,qty,money,lot=null,buyerId=null,orderId=null,selected='cash',interactive=true) {
  const c=choices(g,gpu,qty,lot,buyerId,orderId),s=c.startup;
  const row=(route,d,name,extra)=>{
    const active=route===selected,attrs=`class="choice-row ${active?'selected-choice':''} ${route==='equity'?'equity-choice':''}"`;
    const body=`<span>${esc(name)}${active?' · SELECTED':''}<small>${d.qty} GPUs · ${extra}</small></span><b>${route==='equity'?`+${gain(d,s)} pp`:money(d.revenue)}</b>`;
    return interactive&&!lot?`<button type="button" ${attrs} data-action="choose-route" data-route="${route}" data-order-id="${c.order?.id||''}" data-buyer="${d.buyerId||''}" data-qty="${d.qty}" aria-pressed="${active}">${body}</button>`:`<div ${attrs}>${body}</div>`;
  };
  return `<section class="decision-view" aria-label="Compare compute alternatives"><p class="tradeoff-note">${tradeoff(c,money)}</p><div class="choice-list">${c.anchor?row('cash',c.anchor,`${c.order.name} · cash`,`${signed(c.anchor.revenue-c.anchor.cost,money)} ${c.anchor.revenue>=c.anchor.cost?'profit':'loss'}${c.anchor.qty<c.qty?' · partial cash capacity':''}`):'<p class="choice-unavailable">Startup cash unavailable: no funded matching order.</p>'}${c.equity?row('equity',c.equity,`${c.order.name} · equity`,`≈ ${money(c.equity.value)} paper · no cash today`):'<p class="choice-unavailable">No matching startup equity order.</p>'}${c.outside?row('outside',c.outside,'Outside buyer',`${signed(c.outside.revenue-c.outside.cost,money)} ${c.outside.revenue>=c.outside.cost?'profit':'loss'}`):''}</div>${c.equity?`<p class="small">${progress(c.order,selected==='cash'?(c.anchor?.qty||0):selected==='equity'?c.equity.qty:0)}</p>`:''}<details><summary>Compare accounting</summary>${[['Startup cash',c.anchor],['Startup equity',c.equity],['Outside cash',c.outside]].filter(([,d])=>d).map(([name,d])=>`<p><b>${name} · ${d.qty} GPUs</b><br>FIFO basis ${money(d.cost)} · realized ${signed(d.revenue-d.cost,money)} · ${c.inventory-d.qty} GPUs remain · cash after ${money(c.cash+d.revenue)}</p>`).join('')}${s?`<p>${esc(s.v74?.stage||'Prototype')} · ${Math.max(0,s.cash/Math.max(1,s.burn)).toFixed(1)} quarters runway · ${Math.round((s.lastGrowth||0)*100)}% last growth. Paper value is uncertain.</p>`:''}</details></section>`;
}
export function discoveryView(g,l,money) {
  const c=choices(g,l.gpu,l.qty,l),best=[c.anchor,c.outside].filter(Boolean).sort((a,b)=>(b.revenue-b.cost)-(a.revenue-a.cost))[0];
  return `<div class="discovery-note">${best?`<b>${signed(best.revenue-best.cost,money)} potential cash profit</b> · ${best.qty} GPUs to ${best===c.anchor?esc(c.order.name):'a live outside buyer'}.${c.inventory>best.qty?` ${c.inventory-best.qty} GPUs remain in projected inventory.`:''}${c.inventory>l.qty?' Includes existing FIFO inventory.':''}`:`<b>No funded cash route now.</b> ${c.equity?'Equity or speculative resale':'Speculative resale'}; unused rights expire.`}<details><summary>Compare options</summary>${decisionView(g,l.gpu,l.qty,money,l,null,null,'',false)}<p>Quotes assume current live demand. FIFO includes existing inventory. Purchase ${money(c.purchase)}; cash after buying ${money(c.cash)}.</p></details></div>`;
}
export function deliveryReview(g,d,o,money) {
  const s=d.payment==='equity'?g.startups.find(s=>s.id===o.client):null;
  return `<div class="delivery-review"><p class="eyebrow">Delivery confirmation · floor paused</p><h2 id="dialog-title">Deliver ${d.qty} ${o.gpu} to ${esc(o.name)}</h2><p>${gpuBadge(o.gpu)}</p>${selectedOutcome(g,d,money,s)}<p class="delivery-progress">${progress(o,d.qty)}</p>${accounting(g,d,money,s)}</div><div class="actions confirmation-actions"><button data-action="deliver" class="primary">CONFIRM ${s?'EQUITY':'CASH'} DELIVERY</button><button data-action="change-choice" class="quiet">Change my choice</button></div>`;
}
