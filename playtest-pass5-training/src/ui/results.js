// Result records never settle the company or pay rewards. Five and seven are
// separate score categories; old unlabelled personal bests remain untouched.
export const resultRounds = g => g.arcade.history.length;
export const resultHorizon = g => g.arcade.finalScore?.campaignRounds || (g.arcade.extension?.choice === 'extend' ? 7 : 5);
export const resultLabel = g => resultRounds(g) === resultHorizon(g) ? `${resultHorizon(g)}-round result` : `${resultHorizon(g) === 7 ? 'Extended campaign · ' : ''}early exit in round ${g.q}`;
function record(storage, key, score, seed, rounds) {
  let best = null;
  try { best = JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
  if (!score || score.kind === 'shutdown' || !Number.isSafeInteger(score.payout)) return best;
  if (best?.rounds === rounds && Number.isSafeInteger(best.payout) && best.payout >= score.payout) return best;
  const next = { rounds, payout: score.payout, seed, prev: best?.rounds === rounds && Number.isSafeInteger(best.payout) ? best.payout : null };
  try { storage.setItem(key, JSON.stringify(next)); } catch { return null; }
  return next;
}
export function recordCampaignResults(storage, key, g) {
  const bank = g.arcade.extension?.bankedFive;
  let five = bank ? record(storage, `${key}-best-5`, bank.finalScore, g.seed, 5) : null;
  if (g.phase !== 'over') return five;
  const rounds = resultRounds(g);
  if ((rounds !== 5 && rounds !== 7) || rounds !== resultHorizon(g)) return null;
  return record(storage, `${key}-best-${rounds}`, g.arcade.finalScore, g.seed, rounds);
}
