// Repair only a best record provably tied to the migrated final. The previous
// best stores no seed, so it remains anonymous if it is the higher payout.
export function reconcileMigratedBest(storage, key, migration) {
  const {seed, oldPayout, newPayout} = migration || {};
  if (![seed, oldPayout, newPayout].every(Number.isSafeInteger) || seed < 0 || oldPayout < 0 || newPayout < 0 || oldPayout === newPayout) return false;
  try {
    const raw = storage.getItem(key), best = JSON.parse(raw || 'null');
    if (!best || best.seed !== seed || best.payout !== oldPayout) return false;
    const previous = Number.isSafeInteger(best.prev) && best.prev >= 0 && best.prev <= oldPayout ? best.prev : null;
    const next = previous !== null && previous >= newPayout
      ? { ...best, payout: previous, seed: null, prev: newPayout }
      : { ...best, payout: newPayout, prev: previous };
    // Avoid overwriting a record changed by another tab since it was read.
    if (storage.getItem(key) !== raw) return false;
    storage.setItem(key, JSON.stringify(next));
    return true;
  } catch { return false; }
}
