// Pass 13: a complete five-round core with earned, one-round continuations.
// Money is integer cents; the finite books mix small working lots and larger deployments.
export const ECONOMY = Object.freeze({
  key: 'hsc-tycoon-preview-v21-2-polish', version: 1191, rounds: 5, seconds: 45, cash: 10000000,
  waveAt: Object.freeze([0, 12, 26]),
  supply: Object.freeze([null,
    Object.freeze({ name: 'Start trading', waves: [7,4,4], qty: [1,2,3,4], bids: 5, bidQty:[2,3,4,6] }),
    Object.freeze({ name: 'Build momentum', waves: [7,4,4], qty: [2,4,6,8], bids: 5, bidQty:[4,6,8,12] }),
    Object.freeze({ name: 'Scale your company', waves: [8,5,5], qty: [4,8,12,16], bids: 5, bidQty:[8,12,16,24] }),
    Object.freeze({ name: 'Deliver at scale', waves: [8,5,5], qty: [8,16,24,32], bids: 5, bidQty:[12,16,24,32] }),
    Object.freeze({ name: 'Make your mark', waves: [8,5,5], qty: [12,24,40,64], bids: 5, bidQty:[16,24,32,48] }),
    Object.freeze({ name: 'Keep building', waves: [8,5,5], qty: [16,24,48,64], bids: 5, bidQty:[16,24,48,64] }),
    Object.freeze({ name: 'Expand your reach', waves: [8,5,5], qty: [16,32,48,80], bids: 5, bidQty:[16,32,48,64] }),
    Object.freeze({ name: 'Serve the next market', waves: [8,5,5], qty: [24,32,64,80], bids: 5, bidQty:[24,32,48,80] }),
    Object.freeze({ name: 'Build lasting capacity', waves: [8,5,5], qty: [24,48,64,96], bids: 5, bidQty:[24,48,64,80] }),
    Object.freeze({ name: 'Bring it home', waves: [8,5,5], qty: [32,48,80,96], bids: 5, bidQty:[32,48,64,96] }),
  ]),
  business: Object.freeze({ earliest: [1,2,3,4], capex: [500000,3500000,10000000,30000000], size: [1,2,4,8], revenue: [.30,.20,.13,.09] }),
  workshop: Object.freeze({ prizes: [0,500000,600000,800000,1000000,1200000,1200000,1200000,1200000,1200000,1200000], recipe: Object.freeze({H100:4,H200:2}), scale: 48 }),
  funding: Object.freeze({ 2: Object.freeze({amount:20000000,pct:1200,name:'Foundry Seed'}), 3: Object.freeze({amount:60000000,pct:1800,name:'Cole Valley Partners'}) }),
  reliableAllocation: Object.freeze({discount:.97,from:4}),
  starter: Object.freeze({ recipe: Object.freeze({H100:2}), capital: 500000, revenue: 1800000, rackRecipe: Object.freeze({H100:2}), rackQty: 2 }),
});

export function bonusCapital(g) {
  if(g.q<=5 || g.arcade?.practice)return 0;
  const last=g.arcade.history?.at(-1);
  return Math.min(100_000_000_000,Math.max(500_000_000,Math.round((last?.cashAfter ?? g.cash*100)*1.2)));
}
