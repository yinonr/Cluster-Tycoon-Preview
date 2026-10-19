import {parseRate,stepRate,formatRate} from '../ui/offers.js';
import {stage,focusFrame,directoryView} from '../ui/pit-stage.js';
import * as deals from '../ui/pit-deals.js';
import * as transactions from '../tycoon/pit-transactions.js';
import {arcadeStore} from '../tycoon/arcade-store.js';
import {V7,advance,available,activeLot,cash,claim,leave,haggle,prepareDelivery,closeQuarter,openQuarter,notice} from '../tycoon/arcade.js';
import {buyerLive,reviewBuyer,counterBuyer,saleQuote} from '../tycoon/arcade-buyers.js';
import {prepareSigning,signTrade} from '../tycoon/arcade-signing.js';
import {reviewVC} from '../tycoon/arcade-vc.js';
import {mandateQuote} from '../tycoon/mandate.js';
import {startRizz,resolveRizz,recoverRizz,markerAt} from '../tycoon/rizz.js';
import {playRival} from '../tycoon/arcade-negotiation.js';
import {createAudio} from '../audio.js';
import {esc,newSeed} from '../util.js';

const root=document.querySelector('#pit');
let storage;try{storage=localStorage;}catch{storage={getItem(){throw Error('Storage blocked');}};}
const store=arcadeStore(storage);
if(store.state)store.act(recoverRizz);
const ui={panel:'floor',marketFilter:'all',gpu:null,page:0,buyerId:store.state?.arcade.sourcingFor||null,orderId:null,qty:null};
let sound=null,last=performance.now(),paintKey='',returnFocus=null,meterFrame=0,meterKey=null,meterStart=0;
const seed=()=>{const s=new URLSearchParams(location.search).get('seed');return s&&/^\d+$/.test(s)?Number(s)>>>0:newSeed();};
const act=fn=>{const ok=store.act(fn);if(ok||store.error)render();return ok;};
const controls=()=>[...root.querySelectorAll('.pit-focus button:not(:disabled),.pit-focus input:not(:disabled),.pit-focus select:not(:disabled),.pit-focus summary')].filter(e=>e.getClientRects().length&&!e.closest('details:not([open]) > :not(summary)'));
function remember(el){if(!el)return null;for(const a of ['data-id','data-action'])if(el.hasAttribute(a)){let s=`[${a}="${CSS.escape(el.getAttribute(a))}"]`;if(a==='data-id'&&el.dataset.action)s+=`[data-action="${CSS.escape(el.dataset.action)}"]`;return s;}return null;}
function clearInputs(){for(const k of ['qty','counter','buyerCounter','payment','vcPercent','buyerSources'])delete ui[k];}
const marketKey=g=>g.phase+':'+g.q+':'+g.arcade.lots.filter(l=>available(g,l)).map(l=>l.id).join(',')+':'+g.arcade.buyers.filter(b=>buyerLive(g,b)).map(b=>b.id).join(',');
function render(){
 cancelAnimationFrame(meterFrame);
 const focused=remember(document.activeElement),wasFocus=!!root.querySelector('.pit-focus'),g=store.state;
 if(store.error){root.innerHTML=`<section class="pit-error"><h1>Trading paused</h1><p role="alert">${esc(store.error)}</p><p>Your saved run is preserved. Reload to resume from the latest valid state.</p></section>`;return;}
 if(!g){root.innerHTML='<div class="pit-welcome"><section><p class="eyebrow">HAIGHT STREET COMPUTE</p><h1>The Trading Pit</h1><h2>CLUSTER TYCOON · V10.2</h2><p>You are a GPU broker. Find the buyer.<br>Work the supplier. Make your spread.</p><p>$65,000. Eighteen rounds. Your fortune to build.</p><button data-action="start">ENTER THE EXCHANGE</button><p class="eyebrow">BRASS NERVES. REAL NUMBERS.</p></section></div>';return;}
 const view=deals.dealView(g,ui)||(ui.panel==='market'?directoryView(g,ui):null);
 root.innerHTML=`<div class="pit-background" ${view?'inert aria-hidden="true"':''}>${stage(g,ui)}</div>${view?focusFrame(g,view):''}<span class="pit-announcement" role="status" aria-live="polite">${esc(g.arcade.message?.text||'')}</span>`;
 const focus=root.querySelector('.pit-focus');
 if(focus){
  focus.setAttribute('tabindex','-1');
  const same=focused&&focus.querySelector(focused);
  const target=root.querySelector('[data-action="stop-rizz"]')||(same&&!same.disabled?same:null)||(!wasFocus?focus:focus.querySelector('.pit-focus-footer button:not(:disabled)'))||focus;
  target.focus({preventScroll:true});
 }else if(returnFocus||focused){const target=root.querySelector(returnFocus||focused);(target&&!target.disabled?target:root.querySelector('[data-action="open-market"]'))?.focus({preventScroll:true});returnFocus=null;}
 paintKey=marketKey(g);last=performance.now();
 const l=activeLot(g),entry=l?.negotiation?.running&&l.negotiation.attempts.at(-1);
 if(entry){
  const key=l.id+':'+l.negotiation.running;if(key!==meterKey){meterKey=key;meterStart=performance.now();}
  const marker=root.querySelector('.marker');
  const animate=now=>{if(marker)marker.style.left=`${markerAt(entry.params,now-meterStart)*100}%`;meterFrame=requestAnimationFrame(animate);};
  meterFrame=requestAnimationFrame(animate);
 }else meterKey=null;
}
function stopMeter(){
 const n=activeLot(store.state)?.negotiation,p=n?.running&&n.attempts.at(-1).params;
 if(!p||performance.now()-meterStart<180)return;
 if(act(g=>resolveRizz(g,markerAt(p,performance.now()-meterStart)))){const result=activeLot(store.state)?.negotiation.attempts.at(-1);if(result?.walked)sound?.alert();else if(result?.tier==='hit')sound?.bell({strikes:result.precision==='perfect'?2:1});}
}
function closeFocus(){
 const g=store.state;if(activeLot(g)?.negotiation.running)return;
 if(g.arcade.signing){act(g=>{g.arcade.signing=null;return true;});return;}
 if(g.arcade.confirm?.receipt){postReceipt();return;}
 ui.panel='floor';clearInputs();
 if(g.arcade.active)act(leave);else if(g.arcade.confirm)act(g=>{g.arcade.confirm=null;return true;});else render();
 settleAtBell();
}
function settleAtBell(){const g=store.state;if(g?.phase==='floor'&&g.arcade.time>=V7.seconds&&!g.arcade.active&&!g.arcade.confirm)act(closeQuarter);}
function postReceipt(){ui.panel=store.state.arcade.confirm?.receipt?.kind==='purchase'&&!store.state.arcade.sourcingFor?'stock':'floor';clearInputs();act(transactions.postReceipt);settleAtBell();}
function openPanel(panel){if(store.state.arcade.active||store.state.arcade.confirm)return;ui.panel=panel;ui.page=0;clearInputs();render();}
root.addEventListener('click',e=>{
 const b=e.target.closest('button[data-action]');if(!b||b.disabled)return;const a=b.dataset.action,g=store.state;
 if(a==='start'){store.start(seed());render();return;}
 if(a==='sound'){sound=sound?null:createAudio();ui.sound=!!sound;render();return;}
 if(!g||store.error)return;
 if(['focus-supplier','focus-buyer','focus-anchor','open-panel','open-market'].includes(a))returnFocus=remember(b);
 if(a==='open-market'){ui.marketFilter=({seller:'supply',buyer:'buyers'})[b.dataset.filter]||b.dataset.filter||'all';ui.gpu=b.dataset.gpu||null;openPanel('market');}
 else if(a==='market-page'){ui.page=Math.max(0,ui.page+Number(b.dataset.step));render();}
 else if(a==='open-panel'){if(b.dataset.panel==='startup'&&b.dataset.id)ui.orderId=b.dataset.id;openPanel(b.dataset.panel);}
 else if(a==='focus-anchor'){ui.orderId=b.dataset.id||g.arcade.orders.find(o=>o.client===g.arcade.anchor)?.id;openPanel('startup');}
 else if(a==='focus-order'){ui.panel='startup';ui.orderId=b.dataset.id;clearInputs();render();}
 else if(a==='focus-supplier'){ui.panel='floor';clearInputs();act(g=>claim(g,b.dataset.id));}
 else if(a==='focus-buyer'){ui.panel='floor';ui.buyerId=b.dataset.id;clearInputs();act(g=>reviewBuyer(g,b.dataset.id));}
 else if(a==='buyer-sources'){ui.buyerSources=true;render();}
 else if(a==='buyer-bargain'){ui.buyerSources=false;render();}
 else if(a==='step-offer'){
  const supplier=b.dataset.kind==='supplier',input=root.querySelector(supplier?'[data-counter]':'[data-buyer-counter]');
  if(!input)return;const next=stepRate(input.value,Number(b.dataset.step),parseRate(input.min),parseRate(input.max));
  if(next!==null){input.value=formatRate(next);paintInputs({target:input});}
 }
 else if(a==='source-buyer'){ui.buyerId=g.arcade.confirm?.buyerId||ui.buyerId;ui.panel='floor';clearInputs();act(g=>transactions.sourceBuyer(g,b.dataset.id,ui.buyerId));}
 else if(a==='return-buyer'){ui.panel='floor';clearInputs();act(g=>{if(g.arcade.active&&!leave(g))return false;if(g.arcade.signing||g.arcade.confirm?.receipt)return false;g.arcade.confirm=null;transactions.returnToBuyer(g);return true;});}
 else if(a==='close-focus')closeFocus();
 else if(a==='haggle'){const value=parseRate(root.querySelector('[data-counter]')?.value);if(!deals.supplierCounterPreview(g,value).valid)return;act(g=>{if(!haggle(g,value))return false;ui.counter=formatRate(activeLot(g).negotiation.price);return true;});}
 else if(a==='play-rival'){if(act(g=>{if(!playRival(g,b.dataset.id))return false;ui.counter=formatRate(activeLot(g).negotiation.price);return true;})&&activeLot(store.state)?.negotiation.leverage?.after<activeLot(store.state)?.negotiation.leverage?.before)sound?.bell({strikes:1});}
 else if(a==='explain-charm'){root.querySelector('[data-counter]')?.focus();root.querySelector('[data-counter]')?.select();}
 else if(a==='start-rizz')act(startRizz);
 else if(a==='stop-rizz')stopMeter();
 else if(a==='buy'){if(act(g=>prepareSigning(g,'purchase')))sound?.printer(.2);}
 else if(a==='sign-it'){if(act(signTrade)){sound?.scratch(.2);sound?.bell({strikes:1});}}
 else if(a==='cancel-sign')act(g=>{g.arcade.signing=null;return true;});
 else if(a==='post-receipt')postReceipt();
 else if(a==='counter-buyer'){const rate=parseRate(root.querySelector('[data-buyer-counter]')?.value),qty=Number(root.querySelector('[data-sale-qty]')?.value);if(!deals.buyerCounterPreview(g,rate,qty).valid)return;ui.qty=qty;act(g=>{if(!counterBuyer(g,rate,qty))return false;ui.buyerCounter=formatRate(g.arcade.buyers.find(b=>b.id===g.arcade.confirm.buyerId).rate);return true;});}
 else if(a==='sell-buyer'){const qty=Number(root.querySelector('[data-sale-qty]')?.value);act(g=>prepareSigning(g,'buyer',qty));}
 else if(a==='prepare'){const id=b.dataset.id||ui.orderId||g.arcade.orders[0].id,qty=Number(root.querySelector('[data-order-qty]')?.value),payment=root.querySelector('[data-payment]')?.value;act(g=>prepareDelivery(g,id,qty,payment));}
 else if(a==='review-order'){const c=g.arcade.confirm;if(!c?.orderId)return;ui.panel='startup';ui.orderId=c.orderId;ui.qty=c.qty;ui.payment=c.payment;act(g=>{g.arcade.confirm=null;return true;});}
 else if(a==='deliver')act(transactions.deliverWithReceipt);
 else if(a==='review-vc'){clearInputs();act(g=>reviewVC(g,b.dataset.id));}
 else if(a==='sell-vc'){const bps=Math.round(Number(root.querySelector('[data-vc-percent]')?.value)*100);act(g=>prepareSigning(g,'secondary',bps));}
 else if(a==='mandate-review')act(g=>{if(!mandateQuote(g)?.ready||g.arcade.active||g.arcade.confirm)return false;g.arcade.confirm={mandate:true};return true;});
 else if(a==='mandate-sign')act(g=>prepareSigning(g,'mandate'));
 else if(a==='finish-review')act(g=>{if(g.arcade.active||g.arcade.confirm)return false;g.arcade.confirm={finish:true};return true;});
 else if(a==='finish'){ui.panel='floor';act(g=>{g.arcade.confirm=null;return closeQuarter(g);});}
 else if(a==='next'){ui.panel='floor';ui.buyerId=null;ui.orderId=null;clearInputs();act(openQuarter);}
 else if(a==='restart-review')act(g=>{g.arcade.confirm={restart:true};return true;});
 else if(a==='restart'){ui.panel='floor';ui.buyerId=null;ui.orderId=null;clearInputs();store.restart(seed());render();}
});
function paintInputs(e){
 const g=store.state;if(!g)return;
 const input=e.target,bindings={'data-counter':'counter','data-buyer-counter':'buyerCounter','data-sale-qty':'qty','data-order-qty':'qty','data-payment':'payment','data-vc-percent':'vcPercent'};
 for(const [attr,key] of Object.entries(bindings))if(input.hasAttribute(attr))ui[key]=input.value;
 // Workstream C provides pure preview renderers; replace only dependent terms.
 const update=(selector,value)=>{const el=root.querySelector(selector);if(el)el.innerHTML=value?.html??value??'';};
 if(input.matches('[data-counter]')&&deals.supplierCounterPreview){const p=deals.supplierCounterPreview(g,parseRate(input.value));update('[data-counter-total]',p);const b=root.querySelector('[data-action="haggle"]');if(b)b.disabled=!p.valid;}
 if(input.matches('[data-sale-qty],[data-buyer-counter]')){
  const qty=Number(root.querySelector('[data-sale-qty]')?.value),rate=parseRate(root.querySelector('[data-buyer-counter]')?.value);
  if(deals.buyerQuoteView)update('[data-sale-math]',deals.buyerQuoteView(g,qty));
  if(deals.buyerCounterPreview){const p=deals.buyerCounterPreview(g,rate,qty);update('[data-buyer-proposal]',p);const b=root.querySelector('[data-action="counter-buyer"]');if(b)b.disabled=!p.valid;}
  update('[data-buyer-actions]',deals.buyerActions(g,qty));
 }
 if(input.matches('[data-order-qty],[data-payment]')&&deals.startupQuoteView){const p=deals.startupQuoteView(g,ui.orderId||g.arcade.orders[0].id,Number(root.querySelector('[data-order-qty]')?.value),root.querySelector('[data-payment]')?.value);update('[data-order-preview]',p);const b=root.querySelector('[data-action="prepare"]');if(b)b.disabled=!p.valid;}
 if(input.matches('[data-vc-percent]')&&deals.secondaryQuoteView){const p=deals.secondaryQuoteView(g,parseRate(input.value));update('[data-vc-math]',p);const b=root.querySelector('[data-action="sell-vc"]');if(b)b.disabled=!p.valid;}
}
root.addEventListener('input',paintInputs);root.addEventListener('change',paintInputs);
document.addEventListener('keydown',e=>{
 if(!root.querySelector('.pit-focus'))return;
 if(e.repeat&&(e.key==='Enter'||e.key===' ')){e.preventDefault();return;}
 if((e.key===' '||e.key==='Enter')&&activeLot(store.state)?.negotiation.running){e.preventDefault();if(!e.repeat)stopMeter();return;}
 if(e.key==='Escape'){e.preventDefault();if(activeLot(store.state)?.negotiation.running)act(recoverRizz);else closeFocus();return;}
 if(e.key==='Tab'){const all=controls(),first=all[0],end=all.at(-1);if(!all.length)return;if(e.shiftKey&&(document.activeElement===first||document.activeElement.classList.contains('pit-focus'))){e.preventDefault();end.focus();}else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();first.focus();}}
});
setInterval(()=>{
 const now=performance.now(),dt=(now-last)/1000;last=now;const g=store.state;
 if(!g||store.error||document.hidden||g.phase!=='floor'||g.arcade.active||g.arcade.confirm||ui.panel!=='floor')return;
 if(!store.act(g=>advance(g,dt))){if(store.error)render();return;}
 const next=store.state;if(marketKey(next)!==paintKey){render();return;}
 for(const el of root.querySelectorAll('[data-floor-clock]'))el.textContent=`${Math.ceil(V7.seconds-next.arcade.time)}s`;
 for(const el of root.querySelectorAll('[data-station-until]'))el.textContent=`${Math.max(0,Math.ceil(Number(el.dataset.stationUntil)-next.arcade.time))}s`;
},250);
window.addEventListener('storage',e=>{if(e.key===V7.key){store.act(()=>true);render();}});
render();
