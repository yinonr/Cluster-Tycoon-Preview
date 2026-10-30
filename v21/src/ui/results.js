// One final total bag. Recording a result never settles the company or pays cash.
const whole = n => Number.isSafeInteger(n) && n >= 0;
const roundsKnown = n => Number.isSafeInteger(n) && n >= 1 && n <= 10;
const seedKnown = n => n === null || Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;

// An acquisition can end during a round, before that round has a bell report.
// The label counts the rounds actually entered, including that partial final round.
export const resultRounds = g => roundsKnown(g?.q) ? g.q
  : roundsKnown(g?.arcade?.finalScore?.rounds) ? g.arcade.finalScore.rounds : g?.arcade?.history?.length || 0;
export const resultLabel = g => `over ${resultRounds(g)} round${resultRounds(g) === 1 ? '' : 's'}`;
export const resultHorizon = resultRounds; // compatibility for older callers; no score categories
export function resultAmounts(g) {
  const x = g.arcade.exit;
  return {total:x.payout, realized:x.realized ?? (x.mark ? 0 : x.payout), retained:x.retained ?? (x.mark ? x.payout : 0)};
}
function candidate(value, rounds = value?.rounds) {
  if (!value || !whole(value.payout) || !roundsKnown(rounds) || !seedKnown(value.seed)) return null;
  return {version:1,payout:value.payout,rounds,seed:value.seed,
    prev:whole(value.prev) && value.prev < value.payout ? value.prev : null};
}
const higher = (a,b) => !b || a && a.payout >= b.payout ? a : b;

export function recordCampaignResults(storage, key, g) {
  const target = `${key}-best-total`;
  let raw, stored, legacy;
  try {
    raw = storage.getItem(target);
    const parse = text => {try {return JSON.parse(text || 'null');} catch {return null;}};
    stored = candidate(parse(raw));
    // Pass 12's seven-round best was written only at a completed ending.
    // Its five-round key could be an unfinished run's bank: preserve that key
    // without treating it as a final result. A loaded completed five-round game
    // is recorded below from its actual exit. Unlabelled old keys stay intact.
    const seven = parse(storage.getItem(`${key}-best-7`));
    legacy = [seven?.rounds === 7 ? candidate(seven) : null];
  } catch {return null;}
  let best = legacy.reduce(higher, stored);
  const x = g?.arcade?.exit, score = g?.arcade?.finalScore;
  if (g?.phase === 'over' && x && score && score.payout === x.payout && score.kind === x.kind) {
    const current = candidate({payout:x.payout,rounds:resultRounds(g),seed:g.seed});
    if (current && (!best || current.payout > best.payout)) best = {...current,prev:best?.payout ?? null};
  }
  if (!best) return null;
  try {
    // Respect a better record written since the first read. No old keys are removed.
    const latestRaw = storage.getItem(target);
    if (latestRaw !== raw) {
      let latest = null;
      try {latest = candidate(JSON.parse(latestRaw || 'null'));} catch {}
      best = higher(latest,best);
    }
    const next = JSON.stringify(best);
    if (next !== latestRaw) storage.setItem(target,next);
  } catch {return null;}
  return best;
}
