// Presentation adapters use the same quotes and commit functions as the engine.
// Call mutating adapters through arcadeStore.act; projections never touch a save.
import { build, buildMany, fill, reserve, cardState } from './founder.js';

export function postReceipt(g) {
  const c = g.arcade.confirm;
  if (!(c?.receipt || c?.built) || g.arcade.signing) return false;
  g.arcade.confirm = null;
  return true;
}

// After a purchase: put the new GPUs straight onto a card (one tap from the receipt).
export function allocateFromReceipt(g, cardId) {
  const r = g.arcade.confirm?.receipt;
  if (!r || r.kind !== 'purchase' || g.arcade.signing) return false;
  g.arcade.confirm = null;
  if (!reserve(g, cardId, r.gpu, r.qty)) { g.arcade.confirm = { receipt: r }; return false; }
  return true;
}

// Build with a stamped moment: the confirm holds the build id until the player moves on.
export function buildWithStamp(g, cardId) {
  const a = g.arcade, card = a.objectives.find(o => o.id === cardId);
  if (!card || a.confirm || a.signing || a.active || !cardState(g, card).ready) return false;
  const b = build(g, cardId);
  if (!b) return false;
  a.confirm = { built: b.id };
  return true;
}

export function buildManyWithStamp(g, cardId, count) {
  const result = buildMany(g, cardId, count);
  if (!result) return false;
  g.arcade.confirm = { built: result.ids.at(-1), ...(result.ids.length > 1 ? { batch: result } : {}) };
  return true;
}

export { fill, reserve };
