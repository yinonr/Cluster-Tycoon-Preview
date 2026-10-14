// Presentation adapter: original vector characters, brass hall, desks and paper.
// No legacy market controller or economics are imported.
import { vcLive } from '../tycoon/arcade-vc.js';
import { figureSVG } from './character.js';
import { esc } from '../util.js';
import { available } from '../tycoon/arcade.js';
import { buyerLive } from '../tycoon/arcade-buyers.js';
export function portrait(role, i = 0) {
  return figureSVG({ badge: role === 'seller' ? 'SUPPLY' : role === 'buyer' ? 'BUY' : 'VC', look: { skin: ['#C98E62','#E3AE87','#8C573D'][i % 3], hair: '#30241C', hairStyle: ['slick','bob','curly'][i % 3], suit: role === 'seller' ? '#516557' : role === 'buyer' ? '#655074' : '#485678', shirt: '#F4F1EA', tie: '#B5301F', glasses: i % 2, phone: role === 'seller' } });
}
export function hall(g) {
  const vc=g.arcade.vcOffers.find(b=>vcLive(g,b));
  const desks = [
    ...g.arcade.lots.filter(l => available(g,l)).slice(0,3).map(l => ({ role:'seller', name:l.firm, text:`${l.qty} ${l.gpu} · SUPPLY`, action:'claim', id:l.id })),
    ...g.arcade.buyers.filter(b => buyerLive(g,b)).slice(0,2).map(b => ({ role:'buyer', name:b.name, text:`${b.qty-b.filled} ${b.gpu} WANTED`, action:'review-buyer', id:b.id })),
    { role:'capital', name:vc?.name||'Compute VC', text:vc?'SECONDARY BID LIVE':'EQUITY & CAPITAL', action:vc?'review-vc':'capital', id:vc?.id||'' },
  ];
  const fill = g.arcade.receipts.at(-1);
  return `<section class="exchange" aria-label="Illustrated trading hall"><div class="exchange-board"><b>HAIGHT STREET COMPUTE</b><span>SUPPLY · DEMAND · CAPITAL</span><small>${fill ? `LAST FILL · ${esc(fill.counterparty)} · ${fill.qty} ${esc(fill.gpu)}` : 'THE FLOOR IS OPEN · FIND YOUR NEXT DEAL'}</small></div><div class="hall arcade-hall"><div class="hall-floor"></div><div class="pit"><span class="pit-ring r1"></span><span class="pit-ring r2"></span><span class="pit-ring r3"></span><span class="pit-seal">HSC</span></div><div class="arcade-desks">${desks.map((d,i) => `<button class="exchange-desk ${d.role}" data-action="${d.action}" data-id="${d.id}" aria-label="Visit ${esc(d.name)}"><span class="hall-person">${portrait(d.role,i)}</span><span class="desk-monitor">${esc(d.text)}</span><span class="desk-plaque">${esc(d.name)}</span></button>`).join('')}</div></div></section>`;
}
export function contract(d, money, complete = false) {
  return `<div class="sign-room ${complete ? 'signed' : 'printing'}"><p class="eyebrow">THE SIGNING ROOM · FLOOR PAUSED</p><h2 id="dialog-title">${complete ? 'Your fill is on the board.' : 'Read it. Make it yours.'}</h2><div class="arcade-printer"><i></i>HSC · DOT MATRIX</div><article class="arcade-contract"><small>HAIGHT STREET COMPUTE · FICTIONAL GAME CONTRACT</small><h3>${d.kind === 'purchase' ? 'COMPUTE PURCHASE' : d.kind === 'secondary' ? 'SECONDARY EQUITY TRANSFER' : 'COMPUTE SALE'}</h3><dl><dt>Counterparty</dt><dd>${esc(d.counterparty)}</dd><dt>Asset</dt><dd>${d.qty} ${esc(d.gpu)}</dd><dt>Price</dt><dd>${money(d.rate)}${d.kind === 'secondary' ? ' bid valuation' : ' / GPU-hour'}</dd><dt>${d.kind === 'purchase' ? 'Total prepaid cost' : 'Cash received'}</dt><dd class="contract-total">${money(d.total)}</dd></dl><p>${d.kind === 'secondary' ? 'Existing shares transfer to the buyer. Future upside belongs to their holder.' : 'Three-month compute rights · 2,190 hours · paid in full. No financing or future supplier payments.'}</p><div class="signature">${complete ? '<svg class="signed-stroke" viewBox="0 0 300 70" aria-label="Broker signature"><path d="M10 52 C18 14 34 8 30 36 C27 58 44 22 52 30 C59 37 51 51 62 46 C73 41 70 25 80 30 C90 35 83 50 95 45 C107 40 104 24 115 29 C127 34 119 52 133 46 C147 40 151 18 156 30 C160 40 152 52 166 46 C182 39 176 30 190 34 C204 38 196 52 214 46 C236 38 252 28 288 24 M36 60 C110 66 200 62 290 54"/></svg><b class="trade-stamp">TRADE CONFIRMED</b>' : '✕ __________________________'}</div></article><div class="actions">${complete ? '<button data-action="cancel" class="primary">POST FILL · BACK TO FLOOR</button>' : '<button data-action="sign-it" class="primary">SIGN IT</button><button data-action="cancel-sign" class="quiet">Back to review</button>'}</div><p class="small muted">${complete ? 'Saved. Presentation never transfers money a second time.' : 'Sign when ready. Animation can be skipped; signing commits this trade once.'}</p></div>`;
}
