// Pass 2: the five-round campaign. Money is integer cents; arrivals use floor-clock seconds.
export const ECONOMY = Object.freeze({
  key: 'hsc-tycoon-preview-pass5-training', version: 1191, rounds: 5, seconds: 45, cash: 6500000,
  waveAt: Object.freeze([0, 12, 26]),
  supply: Object.freeze([null,
    Object.freeze({ name: 'Scrappy beginnings', waves: [5,3,2], qty: [1,2,2,3], bids: 2 }),
    Object.freeze({ name: 'Build momentum', waves: [5,2,2], qty: [2,3,4,6], bids: 2 }),
    Object.freeze({ name: 'Choose your direction', waves: [4,2,1], qty: [4,6,8,12], bids: 2 }),
    Object.freeze({ name: 'The market turns', waves: [3,1,1], qty: [8,12,16,24], bids: 2 }),
    Object.freeze({ name: 'The final commitment', waves: [2,1,1], qty: [12,16,24,32], bids: 2 }),
    Object.freeze({ name: 'Scale what you built', waves: [5,3,2], qty: [16,24,32,48], bids: 3 }),
    Object.freeze({ name: 'Deliver at global scale', waves: [5,3,2], qty: [24,32,48,64], bids: 3 }),
  ]),
  business: Object.freeze({ earliest: [1,2,3,4], capex: [500000,3500000,10000000,30000000], size: [1,2,4,8], revenue: [.30,.20,.13,.09] }),
  workshop: Object.freeze({ prizes: [0,500000,600000,800000,1000000,1200000,1200000,1200000], recipe: Object.freeze({H100:4,H200:2}), scale: 48 }),
  funding: Object.freeze({ 2: Object.freeze({amount:8000000,pct:1200,name:'Foundry Seed'}), 3: Object.freeze({amount:24000000,pct:1800,name:'Cole Valley Partners'}) }),
  reliableAllocation: Object.freeze({discount:.97,from:4}),
  starter: Object.freeze({ recipe: Object.freeze({H100:2}), capital: 500000, revenue: 1800000, rackRecipe: Object.freeze({H100:2}), rackQty: 2 }),
});
