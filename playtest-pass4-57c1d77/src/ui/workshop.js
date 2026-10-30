// Free floor activities share the real game boards, with a separate best-prize budget.
import { INTEGRATION, workshopQuote } from '../tycoon/integration.js';
import { V7 } from '../tycoon/arcade.js';
import { money } from './pit-ledger.js';
export const workshopFraction = (efficiency, skipped = false) => skipped ? 0 : Math.max(0, Math.min(1, (efficiency - INTEGRATION.floor) / (1 - INTEGRATION.floor)));
const nextPrize = g => g.q < V7.rounds ? 'Each game gets a fresh prize next round.' : 'This is the final round’s prize.';
export function workshopIntro(g, kind) {
  const q = workshopQuote(g, kind);
  return `<p class="workshop-note">Free loaner hardware · floor paused. ${q.remaining > 0 ? `${money(q.paid)} earned; up to ${money(q.remaining)} more this round for a better result.` : `This round’s ${money(q.max)} prize is earned. Practice is free.`} ${kind === 'node' ? 'Power whole rows' : 'Connect GPUs'} to grow your prize; points do not affect cash. Leaving pays $0. ${nextPrize(g)}</p>`;
}
export function workshopResult(g, kind, out) {
  const q = workshopQuote(g, kind);
  const outcome = out.skipped ? 'Left practice · no prize' : kind === 'node' ? `${out.rows}/${out.height} rows powered` : `${out.detail.online}/${out.detail.nodes} nodes connected`;
  return `<div class="tt-result workshop-result" role="status"><strong class="tt-stamp">${out.skipped ? 'PRACTICE ENDED' : out.perfect ? 'PERFECT' : 'SESSION COMPLETE'}</strong><p>${outcome}</p><p class="workshop-prize">${money(q.reward)} prize on Continue</p><p>Best prize: ${money(q.paid + q.reward)} of ${money(q.max)} this round. Matching or lower results add $0. Replay free from the floor. ${nextPrize(g)}</p></div>`;
}
