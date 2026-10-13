import { createArcade, V7 } from './arcade.js';

function validSave(g) {
  const a = g?.arcade;
  return a?.version === V7.version && Number.isSafeInteger(a.rev) && a.rev >= 0 &&
    ['floor', 'report', 'over'].includes(g.phase) && Number.isSafeInteger(g.q) && g.q > 0 &&
    [g.cash, g.profit, g.clout, g.cpUnits, a.time].every(Number.isFinite) &&
    Array.isArray(g.startups) && g.startups.length > 0 && g.startups.every(s => typeof s.id === 'string' && typeof s.name === 'string' && [s.val, s.stake, s.cash].every(Number.isFinite)) &&
    Array.isArray(g.book) && Array.isArray(g.hist) && g.firms && typeof g.firms === 'object' &&
    ['lots', 'orders', 'inventory', 'deliveries', 'purchases', 'completions', 'history'].every(k => Array.isArray(a[k])) &&
    a.orders.length > 0 && a.orders.every(o => typeof o.id === 'string' && g.startups.some(s => s.id === o.client) && Number.isSafeInteger(o.qty) && Number.isSafeInteger(o.delivered) && o.delivered >= 0 && o.delivered <= o.qty && Number.isSafeInteger(o.rate) && o.rate > 0) &&
    a.lots.length > 0 && a.lots.every(l => typeof l.id === 'string' && typeof l.firm === 'string' && Number.isSafeInteger(l.qty) && l.qty > 0 && Number.isFinite(l.ask) && Number.isFinite(l.floor) && l.floor > 0 && l.ask >= l.floor && ['open', 'sold', 'expired', 'walked'].includes(l.status) && (!l.negotiation || (Array.isArray(l.negotiation.attempts) && l.negotiation.attempts.length <= 3 && Number.isFinite(l.negotiation.price) && l.negotiation.price >= l.floor && l.negotiation.price <= l.ask))) &&
    a.inventory.every(x => Number.isSafeInteger(x.left) && x.left >= 0 && x.left <= x.qty && Number.isSafeInteger(x.unitCost) && x.unitCost > 0) &&
    (a.active === null || a.lots.some(l => l.id === a.active && l.negotiation)) &&
    (g.phase === 'floor' || a.history.length > 0);
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
  } catch { state = null; error = 'Cannot read this V7 save. It has been preserved. Restore a valid save or clear only hsc-tycoon-v7 in browser storage.'; }
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
    start(seed) { return !state && commit(createArcade(seed)); },
    restart(seed) { return commit(createArcade(seed)); },
    act(fn) {
      if (!state || error) return false;
      const next = structuredClone(state);
      if (!fn(next)) return false;
      return commit(next);
    },
  };
}
