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

// V22: every live broker is on the floor at once. A quote keeps its seat for the round;
// a new arrival takes the first seat whose quote is gone, so targets never slide under a press.
export function floorSeats(g,ui,min=8) {
  const key=`${g.seed}:${g.q}`;
  let state=ui.floorSeatState;
  if (state?.key!==key) state=ui.floorSeatState={key,ids:[]};
  const live=g.arcade.lots.filter(l=>available(g,l)),isLive=id=>live.some(l=>l.id===id);
  for (const lot of live) {
    if (state.ids.includes(lot.id)) continue;
    const free=state.ids.findIndex(id=>!id || !isLive(id));
    if (free<0) state.ids.push(lot.id); else state.ids[free]=lot.id;
  }
  const count=Math.max(min,state.ids.length);
  return {seats:Array.from({length:count},(_,seat)=>{
    const id=state.ids[seat] || null,previous=id?g.arcade.lots.find(l=>l.id===id) || null:null,lot=previous && isLive(id)?previous:null;
    return {seat,id,lot,previous,status:lot?'live':!previous?'vacant':previous.status==='open'&&previous.cooldown>g.arcade.time?'cooldown':previous.status};
  }),total:live.length,hasFuture:g.arcade.lots.some(l=>l.status==='open' && l.at>g.arcade.time)};
}

// V22.2 trading floor: a fixed hall of desks, each belonging to a broker firm. A firm's home desk comes
// from its name, so the same firm sits in the same place every round of the campaign; a taken home
// desk probes to the next free one in arrival order, so earlier brokers never move for a newcomer.
// The hall never resizes for traffic (only a rare 13th firm opens one extra row). Derived from
// engine state alone, so a reload rebuilds exactly the same floor. Sold-out desks keep their firm for
// the rest of the round; the next round starts from that round's brokers.
export const DESKS = 12;
const home = name => [...String(name)].reduce((n, c) => (n * 33 + c.charCodeAt(0)) >>> 0, 5381) % DESKS;
export function firmDesks(g) {
  const a = g.arcade, t = a.time, arrived = a.lots.filter(l => l.at <= t).sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1));
  const live = id => { const l = a.lots.find(x => x.id === id); return !!l && available(g, l); };
  const desks = Array.from({ length: DESKS }, () => null), byKey = new Map();
  for (const lot of arrived) {
    // A firm's second concurrently live lot takes a desk of its own; otherwise one desk per firm.
    let key = lot.firm;
    const desk = byKey.get(key);
    if (desk && desk.lots.some(id => live(id)) && live(lot.id) && !desk.lots.includes(lot.id)) key = `${lot.firm}#2`;
    let d = byKey.get(key);
    if (!d) {
      let i = home(key), n = 0;
      while (n < desks.length && desks[i]) { i = (i + 1) % desks.length; n++; }
      if (n >= desks.length) { i = desks.length; for (let k = 0; k < 4; k++) desks.push(null); }
      d = desks[i] = { seat: i, key, firm: lot.firm, lots: [] }; byKey.set(key, d);
    }
    d.lots.push(lot.id);
  }
  return desks.map((d, seat) => {
    if (!d) return { seat, id: null, lot: null, previous: null, status: 'vacant' };
    const lots = d.lots.map(id => a.lots.find(l => l.id === id)), lot = lots.find(l => available(g, l)) || null, previous = lot || lots.at(-1);
    // V25.1 `since`: when the desk first filled (view-only), so narrow screens can list desks in arrival order.
    return { seat, id: previous.id, firm: d.firm, lot, previous, since: lots[0].at, status: lot ? 'live' : previous.status === 'open' && previous.cooldown > t ? 'cooldown' : previous.status };
  });
}
