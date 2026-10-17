import {charmStakes,markerAt} from '../tycoon/rizz.js';
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:n%100?2:0,maximumFractionDigits:2}).format(n/100);
export function charmView(g,l){
 const n=l?.negotiation;
 if(!n||n.closed||l.status!=='open'||l.until<=g.arcade.time)return '';
 if(!n.charmUnlocked)return '<div class="charm-locked">Charm · make a meaningful counter first</div>';
 const s=charmStakes(g,l);
 if(!s||(!s.running&&s.params.concession<=0))return '<div class="charm-finished">Final quote. Bank it or walk.</div>';
 const p=s.params;
 const risk=s.attempt===1?`Miss: give back up to ${money(s.gainsAtRisk)}.`:s.attempt===2?`Miss: lose up to ${money(s.gainsAtRisk)}; severe miss loses the supplier.`:`Near miss: lose up to ${money(s.gainsAtRisk)}; wider miss loses the supplier.`;
 return `<section class="pit-charm tier-${s.attempt} ${s.running?'charm-playing':''}" aria-label="${s.label} risk and timing"><div class="charm-heading"><strong>${s.running?'Make your pitch':s.label}</strong><span>${s.attempt}/3 · ${s.timeCost}s ${s.running?'spent':''}</span></div><div class="charm-upside">Perfect hit: <b>${money(s.perfectCost)}</b> <span>· save ${money(s.savings)}</span></div>${s.running?`<div class="meter" aria-hidden="true"><span class="target" style="left:${(.5-p.width/2)*100}%;width:${p.width*100}%"></span><span class="marker" style="left:${markerAt(p,0)*100}%"></span></div><button type="button" data-action="stop-rizz" class="charm-stop primary">STOP THE MARKER</button><p class="charm-help">Center · tap, Space or Enter<br>Leaving or reloading counts as a severe miss.</p>`:`<p class="charm-risk">${risk} <span>Trust up to ${s.trustRisk} · Clout up to ${s.cloutRisk}</span></p>${s.expiresOnStart?'<p class="charm-expiry">This push expires the supplier.</p>':''}${s.buyerExpiresOnStart?'<p class="charm-expiry">This push expires your buyer.</p>':''}<button type="button" data-action="start-rizz" class="${s.attempt===3?'danger':'primary'}" ${s.canStart?'':'disabled'}>Push ${s.label}</button>`}</section>`;
}
