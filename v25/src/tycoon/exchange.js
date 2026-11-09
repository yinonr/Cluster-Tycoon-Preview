// V9 releases are seeded once. Slots are reused only after the prior quote ends.
import { stream } from '../util.js';
import { SELLER_FIRMS } from '../data/names.js';
export const BUYER_NAMES = ['Civic Inference', 'Lantern Research', 'Pacific Model Works', 'Fogline Robotics', 'Redwood Speech', 'Mission Search', 'Mosaic Biology', 'Beacon Simulation', 'Mariner Agents', 'Foundry Vision', 'Sutro Analytics', 'Orchard Models', 'Cablecar Systems', 'Portola Science', 'Presidio Compute', 'Golden Gate Rendering', 'Ridgeline AI', 'Seabright Labs'];
export const supplierStyle = firm => ['firm','flexible','patient'][stream(90,'seller-style',firm).int(0,2)];
export function makeLots(g,tier) {
  const r=stream(g.seed,'v9-supply',g.q), slots=6+tier, lots=[];
  for(let wave=0;wave<3;wave++) for(let slot=0;slot<slots;slot++) {
    const at=wave===0?0:wave===1?28+slot*2:56+slot*2;
    if(at>64)continue;
    const until=wave===0?28+slot*2:wave===1?Math.min(72,56+slot*2):72;
    const i=lots.length, firm=SELLER_FIRMS[(i+g.q*3)%SELLER_FIRMS.length];
    const gpu=slot<2?g.arcade.orders[0].gpu:['H100','H200','B200'][(slot+wave+g.q)%3];
    const small=g.cash<25000&&slot===0;
    const qty=small?1:slot<2?4:r.pick(tier===2?[2,4,6,8]:[2,2,4]);
    const liquidation=wave>0&&r.next()<.10;
    const ask=small?190:{H100:245,H200:319,B200:486}[gpu]+r.int(-22,32);
    const trust=Math.min(8,Math.max(0,g.firms[firm]?.trust||0));
    const room=small?20:liquidation?Math.floor(ask*.42):r.int(22,46)+trust;
    lots.push({id:`q${g.q}-l${i}`,slot,firm,profile:supplierStyle(firm),gpu:small?'H100':gpu,qty,ask,floor:ask-room,liquidation,at,until,flash:until-at<20,cooldown:0,status:'open',negotiation:null});
  }
  return lots.sort((a,b)=>a.at-b.at);
}
// Decisions pause reading time. A submitted counter uses two disclosed floor seconds.
// Timed opportunity cards lapse with the clock, wherever the clock moves (counters, Charm),
// and release any GPUs reserved to them.
export function expireTimed(g) {
  const a=g.arcade;
  for(const o of a.objectives||[])if(o.status==='open'&&o.until&&a.time>=o.until){o.status='expired';a.reservations=a.reservations.filter(r=>r.card!==o.id);}
}
export function negotiationTime(g) {
  g.arcade.time=Math.min(g.arcade.seconds??72,g.arcade.time+(g.arcade.version>=105?1:2));
  for(const l of g.arcade.lots) if(l.status==='open'&&l.until<=g.arcade.time)l.status='expired';
  expireTimed(g);
}
