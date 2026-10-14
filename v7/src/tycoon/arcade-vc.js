// Secondary sales transfer existing ownership. Basis is reporting-only: compute
// cost was already expensed on equity delivery, so proceeds enter game profit in full.
import { stream } from '../util.js';
import { cash, notice } from './arcade.js';
export function investment(g, id) {
  return g.arcade.investments[id] ||= { basis:0, invested:0, allocated:0, proceeds:0, serial:0, offered:0, closedBasis:0 };
}
export function makeVCOffers(g) {
  if(g.q<2)return [];
  const offers=[];
  for(const s of g.startups){
    const inv=g.arcade.investments[s.id];
    if(!inv || !s.alive || s.exited || s.stake<=0 || inv.serial<=inv.offered || !(s.lastGrowth>.03) || !s.service?.quarters)continue;
    const r=stream(g.seed,'v72-vc',s.id,g.q,inv.serial);
    // This completed investment batch receives one approach window, not a reroll each quarter.
    inv.offered=inv.serial;
    if(r.next()>.72)continue;
    const discount=r.int(58,84)/100, bidVal=Math.floor(s.val*100*discount);
    offers.push({ id:`q${g.q}-vc-${s.id}`, client:s.id, name:r.pick(['Foundry Ventures','Pacific Growth Partners','Mission Capital']), val:s.val, stake:s.stake, serial:inv.serial, bidVal, budget:r.int(18000,55000)*100, maxBps:5000, at:18+offers.length*25, until:145+offers.length*25, used:false });
  }
  return offers;
}
export function vcLive(g,b) {
  const s=g.startups.find(s=>s.id===b.client), inv=g.arcade.investments[b.client];
  return g.phase==='floor' && !b.used && b.at<=g.arcade.time && g.arcade.time<b.until && s?.alive && !s.exited && s.stake===b.stake && s.val===b.val && inv?.serial===b.serial;
}
export const maxSaleBps = b => Math.max(0,Math.min(b.maxBps,Math.floor(b.budget/(b.stake*b.bidVal)*10000)));
export function secondaryQuote(g,id,bps) {
  const b=g.arcade.vcOffers.find(b=>b.id===id);
  if(!b||!vcLive(g,b)||!Number.isSafeInteger(bps)||bps<1||bps>maxSaleBps(b))return null;
  const s=g.startups.find(s=>s.id===b.client),inv=g.arcade.investments[s.id], sold=s.stake*bps/10000;
  const proceeds=Math.floor(sold*b.bidVal),basis=Math.round(inv.basis*bps/10000);
  if(sold<=0||sold>s.stake||proceeds<1||proceeds>b.budget)return null;
  return {id,client:s.id,bps,sold,remaining:s.stake-sold,proceeds,basis,gain:proceeds-basis,bidVal:b.bidVal,counterparty:b.name,company:s.name};
}
export function reviewVC(g,id) {
  const b=g.arcade.vcOffers.find(b=>b.id===id);
  if(g.arcade.active||g.arcade.confirm||g.arcade.signing||!b||!vcLive(g,b))return false;
  g.arcade.confirm={vcId:id};return true;
}
export function sellSecondary(g,bps) {
  if(g.arcade.active||!g.arcade.confirm?.vcId)return false;
  const d=secondaryQuote(g,g.arcade.confirm.vcId,bps);if(!d)return false;
  const b=g.arcade.vcOffers.find(b=>b.id===d.id),s=g.startups.find(s=>s.id===d.client),inv=g.arcade.investments[s.id];
  s.stake=d.remaining;b.used=true;b.budget-=d.proceeds;
  inv.basis-=d.basis;inv.allocated+=d.basis;inv.proceeds+=d.proceeds;
  g.cash=(cash(g)+d.proceeds)/100;g.profit=(Math.round(g.profit*100)+d.proceeds)/100;
  g.arcade.secondarySales.push({...d,q:g.q});g.arcade.confirm=null;
  notice(g,`${b.name} bought existing ${s.name} shares. Cash received; you retain ${(s.stake*100).toFixed(3)}% ownership.`, 'good');return true;
}
