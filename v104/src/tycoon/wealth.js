// All public financial totals are integer cents. Profit is a flow, never an asset.
// V10.4: worth now = cash + unexpired inventory at cost + live stakes at the closing desk's
// 30% of mark, i.e. what the final score would be if the bell rang now (inventory aside).
export function fortune(g) {
  const cash = Math.round(g.cash * 100), factor = .30;
  const holdings = g.startups.filter(s => s.alive && !s.exited && s.stake > 0).map(s => ({ id: s.id, name: s.name, paper: Math.round(s.stake * s.val * 100), factor, value: Math.floor(s.stake * s.val * 100 * factor) }));
  const equity = holdings.reduce((sum, s) => sum + s.value, 0);
  const inventory = g.phase === 'floor' ? g.arcade.inventory.reduce((n, x) => n + x.left * x.unitCost, 0) : 0;
  return { cash, equity, inventory, liabilities: 0, netWorth: cash + equity + inventory, holdings };
}

export function wealthScore(g) {
  const wealth = Math.max(0, Math.floor(fortune(g).netWorth / 100));
  const clout = Math.min(200, Math.floor(Math.max(0, g.clout) / 5));
  const trust = Math.min(200, Object.values(g.firms).reduce((n, f) => n + Math.max(0, f.trust) * 2, 0));
  const cp = Math.min(200, Math.floor(g.cpUnits / 100));
  const bonus = Math.min(clout + trust + cp, Math.floor(wealth * .02));
  return { wealth, clout, trust, cp, bonus, total: wealth + bonus };
}

export function opportunityTier(g) {
  const trust = Math.max(0, ...Object.values(g.firms).map(f => f.trust));
  return g.cash >= 150000 || g.clout >= 100 || trust >= 4 || g.cpUnits >= 300 ? 2
    : g.cash >= 90000 || g.clout >= 35 || trust >= 2 || g.cpUnits >= 72 ? 1 : 0;
}
