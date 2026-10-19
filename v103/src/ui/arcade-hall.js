// Presentation adapter: original vector characters, brass hall, desks and paper.
// No legacy market controller or economics are imported.
import { gpuBadge, gpuLabel } from './arcade-gpu.js';
import { vcLive } from '../tycoon/arcade-vc.js';
import { figureSVG } from './character.js';
import { esc } from '../util.js';
import { available, cash, cents, remaining, V7 } from '../tycoon/arcade.js';
import { buyerLive } from '../tycoon/arcade-buyers.js';
export function portrait(role, i = 0) {
  return figureSVG({ badge: role === 'seller' ? 'SUPPLY' : role === 'buyer' ? 'BUY' : 'VC', look: { skin: ['#C98E62','#E3AE87','#8C573D'][Math.floor(i/11) % 3], hair: '#30241C', hairStyle: ['slick','bob','curly'][Math.floor(i/17) % 3], suit: role === 'seller' ? '#516557' : role === 'buyer' ? '#655074' : '#485678', shirt: '#F4F1EA', tie: '#B5301F', glasses: i % 2, phone: role === 'seller' } });
}
const dollars = c => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(c/100);
const faceOf = name => [...name].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
export function floorNav(g) {
  return `<nav class="floor-wayfinding" aria-label="Trading floor navigation">${[['exchange','Floor'],['inventory','Stock'],['buyers','Buyers'],['supply','Supply'],['anchor','Anchor'],['mandate','Big deal'],['capital-desk','Finance']].filter(([id])=>id!=='mandate'||g.arcade.mandate||g.arcade.mandateCompleted).map(([id,label])=>`<button data-action="visit" data-target="${id}">${label}${id==='exchange'?` <small data-way-clock>${Math.ceil(V7.seconds-g.arcade.time)}s</small>`:''}</button>`).join('')}</nav>`;
}
// Presentation seats never modify economic slots or reorder on quote replacement.
const SEATS = [
  ['seller',0,33,0], ['buyer',0,57,8], ['seller',1,12,115], ['buyer',1,86,130],
  ['buyer',2,13,345], ['seller',2,86,365], ['buyer',5,36,245], ['seller',3,62,270],
  ['seller',4,32,505], ['buyer',3,60,525], ['seller',7,11,610], ['seller',5,86,600],
  ['seller',6,34,745], ['buyer',4,63,755]
];
export function hall(g) {
  const a=g.arcade, lots=a.lots.filter(l=>available(g,l)), buyers=a.buyers.filter(b=>buyerLive(g,b)), vc=a.vcOffers.find(b=>vcLive(g,b));
  const anchor=a.orders.find(o=>o.client===a.anchor)||a.orders[0],fill=a.receipts.at(-1);
  const upcoming=[...a.lots,...a.buyers].filter(x=>x.at>a.time).sort((x,y)=>x.at-y.at)[0];
  const seats=SEATS.filter(([role,slot])=>(role==='seller'?a.lots:a.buyers).some(x=>x.slot===slot));
  const desks=seats.map(([role,slot,x,y],i)=>{
    const items=role==='seller'?a.lots:a.buyers;
    const item=items.filter(x=>x.slot===slot&&x.at<=a.time).at(-1);
    const next=items.find(x=>x.slot===slot&&x.at>a.time);
    const live=item&&(role==='seller'?available(g,item):buyerLive(g,item));
    const cooling=role==='seller'&&item.status==='open'&&item.until>a.time&&item.cooldown>a.time;
    const closedLabel=item.status==='sold'?'SIGNED & POSTED':item.status==='walked'||item.negotiation?.walked?'DEAL WITHDRAWN':role==='buyer'&&(item.filled>=item.qty||item.budget<cents(1,item.rate))?'ORDER FILLED':'QUOTE EXPIRED';
    const qty=role==='seller'?item.qty:Math.min(item.qty-item.filled,Math.floor(item.budget/cents(1,item.rate)));
    const name=role==='seller'?item.firm:item.name;
    const amount=cents(qty,role==='seller'?item.negotiation?.price??item.ask:item.rate);
    return `<button class="exchange-desk ${role} ${live?'':'desk-closed'}" style="--seat-x:${x}%;--seat-y:${y}px;--mobile-y:${Math.floor(i/2)*220+(i%2)*24}px;--seat-z:${Math.floor(y/250)+2}" data-side="${i%2}" data-slot="${role}-${slot}" data-action="${role==='seller'?'claim':'review-buyer'}" data-id="${item.id}" ${live?'':'disabled'} aria-label="${role==='seller'?'Supplier':'Buyer'} ${esc(name)}"><span class="desk-call">${role==='seller'?'SUPPLY':'BUYER'} · ${item.liquidation?'LIQUIDATION':role==='seller'?item.profile:item.posture}</span><span class="hall-person" aria-hidden="true">${portrait(role,faceOf(name))}</span><span class="desk-monitor"><b>${qty} ${gpuBadge(item.gpu)}</b><span>${live||cooling?dollars(amount)+(role==='seller'?' COST':' PAYOUT'):closedLabel}</span><i class="monitor-led" aria-hidden="true"></i></span><span class="desk-props" aria-hidden="true"><i class="desk-paper"></i><i class="desk-phone-mini"></i></span><span class="desk-plaque">${esc(name)}<small>${live?`<span data-desk-until="${item.until}">${Math.ceil(item.until-a.time)}</span>s · OPEN DEAL →`:cooling?item.cooldown<item.until?`Returns in <span data-desk-cooldown="${item.cooldown}">${Math.ceil(item.cooldown-a.time)}</span>s`:'NO TIME TO REOPEN':next?`Next desk in <span data-arrival-at="${next.at}">${Math.ceil(next.at-a.time)}</span>s`:item.status==='sold'?'SIGNED & POSTED':'SESSION FINISHED'}</small></span></button>`;
  }).join('');
  return `<section class="exchange trading-room" id="exchange" tabindex="-1" aria-label="Haight Street Compute trading room">
    <div class="exchange-wall">
      <div class="house-sign"><span>THE COMPUTE EXCHANGE</span><h2><span>HAIGHT STREET</span><strong>COMPUTE</strong></h2><span>SAN FRANCISCO · THE TRADING FLOOR</span></div>
      <button class="anchor-person" data-action="visit" data-target="anchor" aria-label="Visit your anchor startup ${esc(anchor.name)}">
        <span class="anchor-ribbon">YOUR ANCHOR</span>
        <span class="anchor-figure" aria-hidden="true">${figureSVG({badge:'FOUNDER',look:{skin:'#C98E62',hair:'#31231f',hairStyle:'bighair',suit:'#b16c40',shirt:'#f0dfba',tie:'#264f43',glasses:false,phone:false}})}</span>
        <span class="anchor-name">${esc(anchor.name)}</span>
        <span class="anchor-demand">${remaining(anchor)?remaining(anchor)+' '+anchor.gpu+' needed':'ORDER COMPLETE'}</span>
        <span class="anchor-link">Visit startup →</span>
      </button>
      <div class="exchange-board"><div class="board-counts"><span>SUPPLY <b>${lots.length}</b></span><span>BUYERS <b>${buyers.length}</b></span><span>ROUND ${g.q} / 18 <b data-hall-clock>${Math.ceil(V7.seconds-a.time)}s</b></span></div><small>${a.active||a.confirm?'FLOOR PAUSED':'OPEN FOR TRADING'}</small><div class="board-cash">CASH ON HAND <b>${dollars(cash(g))}</b></div></div>
    </div>
    <div class="exchange-concourse"><button class="finance-door" data-action="capital"><span>CAPITAL OFFICE</span><b>${vc?esc(vc.name):'Secondary shares'} →</b>${vc?'<small>FUNDED BID ON THE BOARD</small>':''}</button>${a.mandate||a.mandateCompleted?`<button class="major-door" data-action="visit" data-target="mandate"><span>BLOCK TRADES</span><b>Atlas Meridian Cloud →</b><small>${a.mandateCompleted?'PROCUREMENT COMPLETE':a.time>=a.mandate.until?'WINDOW CLOSED':'20 GPU PROCUREMENT'}</small></button>`:''}<span class="concourse-mark" aria-hidden="true">HSC / MEMBERS’ FLOOR</span></div>
    <div class="hall arcade-hall" style="--room-height:${Math.max(...seats.map(s=>s[3]))+240}px;--mobile-height:${Math.ceil(seats.length/2)*220+60}px">
      <div class="hall-floor" aria-hidden="true"></div><div class="room-architecture" aria-hidden="true"><div class="room-aisle"></div><div class="trading-pit"><span>HAIGHT STREET COMPUTE</span><b>HSC</b><small>THE EXCHANGE</small></div><div class="room-balustrade"></div></div>
      <div class="mixed-desks" aria-label="Live supplier and buyer desks">${desks}</div>
    </div>
    <div class="floor-pulse"><b>MARKET PULSE</b><span data-next>${upcoming?`Next arrival in ${Math.ceil(upcoming.at-a.time)}s.`:'All releases are on the board.'}</span><button data-action="finish-review" class="quiet">End round early</button></div>
    <div class="posted-tape"><b>ON THE TAPE</b><span>${fill?`${esc(fill.counterparty)} · ${fill.qty} ${esc(fill.gpu)} · ${dollars(fill.total)} ${fill.kind==='purchase'?'PAID':'RECEIVED'}`:'Find a spread. Make your number. Sign the paper.'}</span></div>
  </section>`;
}
export function contract(d, money, complete = false) {
  return `<div class="sign-room ${complete ? 'signed' : 'printing'}"><p class="eyebrow">THE SIGNING ROOM · FLOOR PAUSED</p><h2 id="dialog-title">${complete ? 'Your fill is on the board.' : 'Read it. Make it yours.'}</h2><div class="arcade-printer"><span class="printer-led"></span><i></i>HSC · TRADE SERVICES · DOT MATRIX</div><article class="arcade-contract"><small>HAIGHT STREET COMPUTE · FICTIONAL GAME CONTRACT</small><div class="contract-reference">${complete ? esc(d.id.toUpperCase()) : "DEAL TICKET · AWAITING YOUR SIGNATURE"}</div><h3>${d.kind === 'purchase' ? 'COMPUTE PURCHASE' : d.kind === 'secondary' ? 'SECONDARY EQUITY TRANSFER' : 'COMPUTE SALE'}</h3><dl><dt>Counterparty</dt><dd>${esc(d.counterparty)}</dd><dt>Asset</dt><dd>${d.qty} ${gpuBadge(d.gpu)||esc(d.gpu)}</dd><dt>Price</dt><dd>${money(d.rate)}${d.kind === 'secondary' ? ' bid valuation' : ' / GPU-hour'}</dd><dt>${d.kind === 'purchase' ? 'Total prepaid cost' : 'Cash received'}</dt><dd class="contract-total">${money(d.total)}</dd></dl><p>${d.kind === 'secondary' ? 'Existing shares transfer to the buyer. Future upside belongs to their holder.' : 'Three-month compute rights · 2,190 hours · paid in full. No financing or future supplier payments.'}</p><div class="signature">${complete ? '<svg class="signed-stroke" viewBox="0 0 300 70" aria-label="Broker signature"><path d="M10 52 C18 14 34 8 30 36 C27 58 44 22 52 30 C59 37 51 51 62 46 C73 41 70 25 80 30 C90 35 83 50 95 45 C107 40 104 24 115 29 C127 34 119 52 133 46 C147 40 151 18 156 30 C160 40 152 52 166 46 C182 39 176 30 190 34 C204 38 196 52 214 46 C236 38 252 28 288 24 M36 60 C110 66 200 62 290 54"/></svg><b class="trade-stamp">TRADE CONFIRMED</b>' : '✕ __________________________'}</div></article><div class="sign-payoff ${complete&&((d.savings||0)>d.total*.25||d.kind==='secondary'&&d.total>=10000000||d.kind==='buyer'&&d.total-d.cost>=500000)?'exceptional-fill':''}">${complete ? `<b>${d.kind==='purchase'?'CAPACITY SECURED':'CASH RECEIVED'}</b><span>${money(d.total)} · ${esc(d.counterparty)}</span>${d.savings?`<span>${money(d.savings)} saved against the opening quote.</span>`:d.kind==='buyer'?`<span>${money(d.total-d.cost)} realized profit.</span>`:d.kind==='secondary'&&d.total>=10000000?'<span>SIX-FIGURE LIQUIDITY · Your next move is funded.</span>':''}` : 'Review → Sign → Posted fill'}</div><div class="actions signing-controls">${complete ? '<button data-action="cancel" class="primary">POST FILL · BACK TO FLOOR</button>' : '<button data-action="sign-it" class="primary">SIGN IT</button><button data-action="cancel-sign" class="quiet">Back to review</button>'}</div><button class="quiet skip-presentation" data-action="skip-presentation">Skip animation</button><p class="small muted">${complete ? 'Your signed receipt is saved. Back to the floor for the next deal.' : 'Paid in full at signing. Take your time; the floor is paused.'}</p></div>`;
}
