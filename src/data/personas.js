// The sides of the market, as declared on the coupon. SOURCE: Notion Act I:
// "you declare your side of the market: buying, selling, investing, or raising."
// The coupon labels (Buy / Sell / Invest / Raise) were revised in review (Oct 10).
// Only the buyer side is playable in V1; the others carry their need-sheet teasers so
// the full market reads from the first screen.

export const PERSONAS = [
  {
    id: 'buyer',
    side: 'buy',
    coupon: 'Buy',
    title: 'AI Startup · Compute Buyer',
    who: 'AI tycoons, founders, CTOs and infra leads with a budget.',
    teaser: 'Need 512 H100s this quarter. Find someone real who has them.',
    playable: true,
  },
  {
    id: 'seller',
    side: 'sell',
    coupon: 'Sell',
    title: 'Neocloud · Compute Seller',
    who: 'Neoclouds, GPU clouds and data center operators.',
    teaser: '2,048 idle H100s. Every idle second costs you. Sell 75% before the bell.',
    playable: false,
  },
  {
    id: 'investor',
    side: 'money',
    coupon: 'Invest',
    title: 'Fund Partner · Lender',
    who: 'Fund partners, lenders and lessors.',
    teaser: 'Three portfolio companies, three compute problems. Finance the deals that are stuck.',
    playable: false,
  },
  {
    id: 'founder',
    side: 'raise',
    coupon: 'Raise',
    title: 'Founder · Raising Compute',
    who: 'Founders raising GPUs instead of funding.',
    teaser: 'Open the data room. Raise a round in compute, not cash.',
    playable: false,
  },
  {
    id: 'broker',
    side: 'house',
    coupon: null, // not on the coupon: brokers work for the house
    title: 'House Broker',
    who: 'Each broker represents five to ten participants.',
    teaser: 'No GPUs. All information. Find the mismatch, earn the spread.',
    playable: false,
  },
];

export const getPersona = (id) => PERSONAS.find((p) => p.id === id);
