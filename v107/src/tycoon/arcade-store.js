import { createArcade, V7 } from './arcade.js';
import { cleanName, nameError } from './startup-name.js';

const int = n => Number.isSafeInteger(n);
const GPU = ['H100', 'H200', 'B200'];
// V10.7 save validation: a damaged or foreign save is preserved and never half-loaded.
function validSave(g) {
  const a = g?.arcade, c = g?.company, L = a?.ledger;
  if (typeof c?.name !== 'string' || (c.name && nameError(c.name))) return false;
  if (!(a?.version === V7.version && int(a.rev) && a.rev >= 0 && ['floor', 'integration', 'report', 'over'].includes(g.phase) && int(g.q) && g.q > 0 && g.q <= V7.rounds)) return false;
  if (![g.cash, g.profit, g.clout, a.time].every(Number.isFinite) || g.cash < 0 || !g.firms || typeof g.firms !== 'object') return false;
  if (!['lots', 'inventory', 'purchases', 'buyers', 'sales', 'receipts', 'history', 'objectives', 'reservations', 'built', 'terms'].every(k => Array.isArray(a[k]))) return false;
  if (!L || !['raised', 'revenue', 'contracts', 'resale', 'purchases', 'burn', 'expired'].every(k => int(L[k]) && L[k] >= 0)) return false;
  if (V7.cash + L.raised + L.revenue + L.contracts + L.resale - L.purchases - L.burn !== Math.round(g.cash * 100)) return false;
  if (!c || !int(c.level) || c.level < 0 || c.level > 5 || !int(c.shares?.founder) || c.shares.founder <= 0 || !Array.isArray(c.shares.investors) || !c.shares.investors.every(i => int(i.shares) && i.shares > 0 && int(i.paid) && i.paid > 0)) return false;
  if (c.shares.investors.reduce((n, i) => n + i.paid, 0) !== L.raised || c.raised !== L.raised) return false;
  if (!['products', 'racks', 'builds'].every(k => Array.isArray(c[k])) || !c.builds.every(b => typeof b.id === 'string' && b.online >= 0 && b.online <= 1)) return false;
  if (!a.inventory.every(x => typeof x.id === 'string' && GPU.includes(x.gpu) && int(x.left) && int(x.qty) && x.left >= 0 && x.left <= x.qty && int(x.unitCost) && x.unitCost >= 0)) return false;
  // No unit in two places: reservations never exceed what a lot still holds, nor a card's recipe.
  if (!a.reservations.every(r => int(r.qty) && r.qty > 0 && a.inventory.some(x => x.id === r.inv && x.gpu === r.gpu) && a.objectives.some(o => o.id === r.card && o.status === 'open'))) return false;
  if (!a.inventory.every(x => a.reservations.filter(r => r.inv === x.id).reduce((n, r) => n + r.qty, 0) <= x.left)) return false;
  if (!a.objectives.every(o => typeof o.id === 'string' && o.recipe && GPU.every(k => o.recipe[k] === undefined || (int(o.recipe[k]) && o.recipe[k] > 0)) && a.reservations.filter(r => r.card === o.id).every(r => o.recipe[r.gpu]) &&
    GPU.every(k => a.reservations.filter(r => r.card === o.id && r.gpu === k).reduce((n, r) => n + r.qty, 0) <= (o.recipe[k] || 0)))) return false;
  if (!a.lots.every(l => typeof l.id === 'string' && int(l.qty) && l.qty > 0 && Number.isFinite(l.ask) && Number.isFinite(l.floor) && l.floor > 0 && l.ask >= l.floor && ['open', 'sold', 'expired', 'walked'].includes(l.status) &&
    (!l.negotiation || (Array.isArray(l.negotiation.attempts) && l.negotiation.attempts.length <= 3 && int(l.negotiation.patience) && l.negotiation.patience >= 0 && Number.isFinite(l.negotiation.price) && l.negotiation.price >= l.floor && l.negotiation.price <= l.ask)))) return false;
  if (!a.buyers.every(b => int(b.initialBudget) && int(b.budget) && b.budget >= 0 && b.budget <= b.initialBudget && int(b.qty) && int(b.filled) && b.filled >= 0 && b.filled <= b.qty && int(b.rate) && b.rate > 0 && b.rate <= b.ceiling && b.negotiation && int(b.negotiation.counters) && b.negotiation.counters <= 2)) return false;
  if (!a.terms.every(t => int(t.amount) && t.amount > 0 && int(t.pct) && t.pct > 0 && t.pct < 10000 && ['open', 'signed', 'walked', 'declined', 'expired', 'withdrawn'].includes(t.status))) return false;
  if (a.active !== null && !a.lots.some(l => l.id === a.active && l.negotiation)) return false;
  const w = g.world;
  if (!w || typeof w !== 'object' || !['flags', 'seen', 'inv'].every(k => w[k] && typeof w[k] === 'object' && !Array.isArray(w[k])) || !['due', 'spawns', 'sentiment', 'exitMods', 'news', 'log'].every(k => Array.isArray(w[k]))) return false;
  if (w.memo !== null && !(g.phase === 'report' && typeof w.memo === 'object' && Array.isArray(w.memo.options) && w.memo.options.length === 2)) return false;
  if (!c.mods || !['revenue', 'burn', 'prepaid'].every(k => Array.isArray(c.mods[k]))) return false;
  if (g.phase === 'integration' ? !(a.tetris && typeof a.tetris === 'object' && Array.isArray(a.tetris.builds) && a.tetris.builds.length) : a.tetris) return false;
  if (!['floor', 'integration'].includes(g.phase) && a.history.length === 0) return false;
  if (g.phase === 'over' && !a.exit) return false;
  return true;
}

// All mutations, including elapsed floor time, are committed synchronously. Another
// tab's revision blocks this tab before it can spend, deliver, or resolve an attempt.
export function arcadeStore(storage) {
  let state = null, raw = null, error = '';
  try {
    raw = storage.getItem(V7.key);
    if (raw) {
      state = JSON.parse(raw);
      if (!validSave(state)) throw Error('Unsupported or damaged V7 save');
    }
  } catch { state = null; error = 'Cannot read this V10.7 save. It has been preserved. Restore a valid save or clear only hsc-tycoon-v107 in browser storage.'; }
  function commit(next) {
    if (error) return false;
    try {
      if (storage.getItem(V7.key) !== raw) { error = 'Another tab changed this run. Reload this tab to continue from the latest save.'; return false; }
      next.arcade.rev++;
      const encoded = JSON.stringify(next);
      storage.setItem(V7.key, encoded);
      raw = encoded; state = next; return true;
    } catch { error = 'Saving is unavailable. Trading is paused to protect your progress. Free browser storage and reload.'; return false; }
  }
  return {
    get state() { return state; }, get error() { return error; },
    start(seed, name) { return !state && !nameError(name) && commit(createArcade(seed, cleanName(name))); },
    restart(seed, name) { return !nameError(name) && commit(createArcade(seed, cleanName(name))); },
    act(fn) {
      if (!state || error) return false;
      const next = structuredClone(state);
      if (!fn(next)) return false;
      return commit(next);
    },
  };
}
