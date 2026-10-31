// View state only. Broker identities occupy stable seats for the round; sold
// or expired quotes leave non-actionable tombstones instead of sliding targets.
import { available } from './arcade.js';
import { termLive } from './investors.js';

export function stableOfferSeats(g,ui,size=4) {
  size=Math.max(1,Math.min(4,Math.trunc(size)||4));
  const gpu=ui.floorGpu || null,key=`${g.seed}:${g.q}:${gpu || 'all'}:${size}`;
  let state=ui.pitSeatState;
  if (state?.key!==key) state=ui.pitSeatState={key,ids:[]};
  const matching=g.arcade.lots.filter(l=>!gpu || l.gpu===gpu);
  const arrived=matching.filter(l=>available(g,l));
  for (const lot of arrived) if (!state.ids.includes(lot.id)) state.ids.push(lot.id);
  const pages=Math.max(1,Math.ceil(state.ids.length/size)),page=Math.max(0,Math.min(pages-1,Math.trunc(ui.floorPage)||0));
  ui.floorPageCount=pages;
  const seats=Array.from({length:size},(_,seat)=>{
    const id=state.ids[page*size+seat] || null,previous=matching.find(l=>l.id===id) || null;
    const lot=previous && available(g,previous)?previous:null;
    const status=lot?'live':!previous?'vacant':previous.status==='open'&&previous.cooldown>g.arcade.time?'cooldown':previous.status;
    return {seat,id,lot,previous,status};
  });
  const firstLive=state.ids.findIndex(id=>matching.some(l=>l.id===id && available(g,l)));
  return {seats,page,pages,total:matching.filter(l=>available(g,l)).length,liveHere:seats.filter(s=>s.lot).length,
    firstLivePage:firstLive<0?null:Math.floor(firstLive/size),hasFuture:matching.some(l=>l.status==='open' && l.at>g.arcade.time)};
}

export function fundingArrival(g,ui) {
  const term=g.arcade.terms.find(t=>termLive(g,t)) || null,key=term?`${g.seed}:${g.q}:${term.id}`:null;
  ui.pitFundingSeen ||= [];
  const arriving=!!key && !ui.pitFundingSeen.includes(key);
  if (arriving) ui.pitFundingSeen.push(key);
  return {term,arriving,remainingSeconds:term?Math.max(0,term.until-g.arcade.time):0,
    capital:term?.amount || 0,equityBasisPoints:term?.pct || 0};
}
