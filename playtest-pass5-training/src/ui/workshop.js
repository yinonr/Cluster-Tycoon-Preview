// Between-round activities share the real game boards and completed-round prize budget.
import { INTEGRATION, workshopQuote } from '../tycoon/integration.js';
import { V7 } from '../tycoon/arcade.js';
import { completedRound } from '../tycoon/replay-access.js';
import { money } from './pit-ledger.js';
export const workshopFraction = (efficiency, skipped = false) => skipped ? 0 : Math.max(0, Math.min(1, (efficiency - INTEGRATION.floor) / (1 - INTEGRATION.floor)));
const nextPrize = g => (g.arcade.workshop?.q || completedRound(g) || g.q) < V7.rounds - 1 ? 'Each game gets a new prize budget after the next round.' : 'This is the last between-round practice window.';
export function workshopIntro(g, kind) {
  if (kind === 'kernel') return '<p class="workshop-note">Cluster Snake unlocked · free loaner fleet · between rounds. This game has no cash prize and does not change your company.</p>';
  const q = workshopQuote(g, kind);
  return `<p class="workshop-note">Free loaner hardware · between rounds. ${q.remaining > 0 ? `${money(q.paid)} earned; up to ${money(q.remaining)} more for the completed round with a better result.` : `The completed round’s ${money(q.max)} prize is earned. Practice is free.`} ${kind === 'node' ? 'Power whole rows' : 'Connect GPUs'} to grow your prize; points do not affect cash. Leaving pays $0. ${nextPrize(g)}</p>`;
}
export function workshopResult(g, kind, out) {
  if (kind === 'kernel') return `<div class="tt-result workshop-result" role="status"><strong class="tt-stamp">${out.skipped ? 'FREE PLAY ENDED' : out.perfect ? 'PERFECT' : 'SESSION COMPLETE'}</strong><p>${out.skipped ? 'Return to the board update.' : `${out.detail.kernels}/${out.detail.target} kernels run.`}</p><p>No cash prize. Your company and Node Tetris / Cable Mania prize eligibility are unchanged.</p></div>`;
  const q = workshopQuote(g, kind);
  const outcome = out.skipped ? 'Left practice · no prize' : kind === 'node' ? `${out.rows}/${out.height} rows powered` : `${out.detail.online}/${out.detail.nodes} nodes connected`;
  return `<div class="tt-result workshop-result" role="status"><strong class="tt-stamp">${out.skipped ? 'PRACTICE ENDED' : out.perfect ? 'PERFECT' : 'SESSION COMPLETE'}</strong><p>${outcome}</p><p class="workshop-prize">${money(q.reward)} prize on return</p><p>Best prize: ${money(q.paid + q.reward)} of ${money(q.max)} for the completed round. Matching or lower results add $0. Replay free from the board update. ${nextPrize(g)}</p></div>`;
}
