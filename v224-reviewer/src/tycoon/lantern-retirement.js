// Retire one removed scenario without refunding or confiscating paid transactions.
// Historical purchased/built assets keep their actual base economics; no future
// scenario bonus, discount, choice, or premium buyer survives this normalization.
import {exitOutcome} from './founder.js';
import {ASK,DRIFT,makeRoundLots,reservationPrice} from './founder-market.js';
import {exitMarket,epilogue} from './world.js';
const keys=new Set(['lantern','lantern-endpoint']);
const retired=x=>keys.has(x?.key) || x?.event==='scn-lantern';
const text=x=>typeof x==='string' && /Lantern-70|Lantern Collective|the Lantern team/.test(x);
const round4=x=>Math.round(x*10000)/10000;
function restoreUntouchedQuotes(g,queued) {
  const a=g.arcade;
  if(queued || g.world.scen?.lantern?.q!==g.q)return;
  // Reproduce the named supplier streams, then prove both discounted ask and
  // floor match before restoring. Never divide an integer quote or touch a
  // negotiated/signed contract. Unprovable historical quotes remain honored.
  const generated=makeRoundLots(g),market=gpu=>Math.round(ASK[gpu]*(1+DRIFT*(g.q-1))*(a.event?.gpu===gpu?(a.event.kind==='shortage'?1.12:a.event.kind==='glut'?.9:1):1));
  for(const lot of a.lots) {
    if(lot.status!=='open' || lot.negotiation || lot.favor || lot.gpu!=='B200' || lot.id===a.active)continue;
    const base=generated.find(l=>l.id===lot.id);if(!base)continue;
    const ask=lot.recovery?Math.round(ASK[lot.gpu]*(1+DRIFT*(g.q-1))*1.08):base.gpu===lot.gpu?base.ask:base.ask-market(base.gpu)+market(lot.gpu);
    const floor=reservationPrice(g,{...lot,ask}),discounted=Math.max(50,Math.round(ask*.92));
    if(lot.ask===discounted && lot.floor===Math.max(1,discounted-Math.round((ask-floor)*.92)))Object.assign(lot,{ask,floor});
  }
}
export function normalizeLanternSave(g) {
  const a=g?.arcade,c=g?.company,w=g?.world,s=w?.scen;
  if(!a || !c || !w || !s)return false;
  const affected=!!(s.lantern || s.offers?.some(retired) || s.chains?.some(retired) || c.mods?.tech?.event==='scn-lantern' ||
    c.mods?.revenue?.some(retired) || w.spawns?.some(retired) || text(s.bonus?.source));
  if(!affected)return false;
  const before=JSON.stringify(g),oldOffers=s.offers.filter(retired),oldCards=new Set(a.objectives.filter(o=>keys.has(o.scenario?.key)).map(o=>o.id));
  restoreUntouchedQuotes(g,w.spawns.some(x=>x.event==='scn-lantern' && x.op==='ask'));
  c.mods.tech=null;c.mods.revenue=c.mods.revenue.filter(x=>!retired(x));
  if(text(s.bonus?.source)) {
    const b=s.bonus,terms=oldOffers.find(o=>o.key==='lantern')?.terms?.team;
    b.source=b.source.split(' + ').filter(x=>x!=='the Lantern team').join(' + ');
    b.breakthrough=round4(Math.max(0,b.breakthrough-(terms?.breakthrough ?? .10)));
    b.legendary=round4(Math.max(0,b.legendary-(terms?.legendary ?? .05)));
    if(!b.source && !b.breakthrough && !b.setback && !b.legendary && !b.frontier)s.bonus=null;
  }
  const assetBuilds=new Set(c.builds.filter(b=>keys.has(b.scenario?.key)).map(b=>b.id));
  for(const b of c.builds)if(assetBuilds.has(b.id)) {b.name='Legacy model endpoint';b.kind='legacy-asset';delete b.scenario;}
  for(const p of c.products)if(assetBuilds.has(p.build))p.name='Legacy model endpoint';
  a.objectives=a.objectives.filter(o=>!oldCards.has(o.id) || o.status==='built');
  for(const o of a.objectives)if(oldCards.has(o.id)){o.name='Legacy model endpoint';o.blurb='Previously purchased model-serving capacity.';o.kind='legacy-asset';delete o.scenario;}
  a.reservations=a.reservations.filter(r=>!oldCards.has(r.card));
  const buyerIds=new Set(a.buyers.filter(b=>b.scenario==='lantern').map(b=>b.id));
  a.buyers=a.buyers.filter(b=>!buyerIds.has(b.id) || a.sales.some(x=>x.buyerId===b.id));
  for(const b of a.buyers)if(buyerIds.has(b.id)) {
    b.name='Closed legacy buyer';b.reason='Closed';delete b.scenario;b.until=0;b.negotiation.walked=true;b.negotiation.running=null;
    if(b.negotiation.attempts)b.negotiation.attempts=b.negotiation.attempts.filter(x=>x.status!=='running');
  }
  if(oldOffers.some(o=>o.id===a.confirm?.scenario) || buyerIds.has(a.confirm?.buyerId)) {a.confirm=null;if(a.signing?.kind==='buyer')a.signing=null;}
  s.offers=s.offers.filter(x=>!retired(x));s.chains=s.chains.filter(x=>!retired(x));s.buyers=s.buyers.filter(x=>!keys.has(x.key));
  s.due=s.due.filter(x=>!keys.has(x.key));if(keys.has(s.pending?.key))s.pending=null;
  s.smalls=Math.max(0,s.smalls-oldOffers.filter(o=>o.key==='lantern').length);delete s.lantern;
  if(s.quietQ===4 && oldOffers.some(o=>o.q===4))s.quietQ=0;
  for(const key of Object.keys(w.flags))if(key.startsWith('scn.lantern'))delete w.flags[key];
  for(const key of Object.keys(w.seen))if(key==='scn-lantern')delete w.seen[key];
  w.spawns=w.spawns.filter(x=>!retired(x));s.log=s.log.filter(x=>!keys.has(x.id) && !text(x.text));
  for(const target of [w,a])if(Array.isArray(target.news))target.news=target.news.filter(x=>x.id!=='scn-lantern' && !text(x.headline));
  w.log=w.log.filter(x=>x.id!=='scn-lantern' && !text(x.headline));
  for(const h of a.history)if(Array.isArray(h.news))h.news=h.news.filter(x=>!text(x));
  if(text(a.message?.text))a.message=null;
  // A completed unsold company's payout is derived again from its actual assets
  // and the same seeded market. A negotiated acquisition price remains binding.
  if(g.phase==='over' && a.exit && a.ending!=='acquired') {
    const previous=a.exit,computed=exitOutcome(g,m=>exitMarket(g,m));
    // Exit classification is historical; the underlying mark and founder payout
    // are corrected without rerolling the recorded ending.
    computed.kind=previous.kind;computed.title=previous.title;
    const realized=computed.kind==='secondary'?Math.floor(computed.payout*.25):['ipo','private'].includes(computed.kind)?0:computed.payout;
    Object.assign(computed,{realized,retained:computed.payout-realized,remainingOwnership:computed.kind==='secondary'?computed.founderPct*.75:['ipo','private'].includes(computed.kind)?computed.founderPct:0});
    computed.epilogue=epilogue(g,computed);a.exit=computed;
    a.finalScore={...a.finalScore,payout:computed.payout,founderPct:computed.founderPct,equity:computed.equity,kind:computed.kind};
  }
  return before!==JSON.stringify(g);
}
