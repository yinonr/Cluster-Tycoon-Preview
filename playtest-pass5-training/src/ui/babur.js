// Character presentation is optional and decorative. It never changes game state,
// progress, timing, or dialogue. Missing art leaves the same stable portrait box.
import { esc } from '../util.js';
import { cash, cents } from '../tycoon/arcade.js';
import { BABUR_ART } from './babur-assets.js';
export { BABUR_ART };
export const BABUR_ASSET_NOTE = 'Babur’s four expressions use the supplied babur-training-art.zip originals; no generated portrait is used.';

// Snapshot-only selection: errors and investment receipts take precedence over
// success art. In particular, accepting dilution is never a celebration state.
export function selectBaburExpression(session = null, { context = 'stage', game = null, view = null, failed = false, blocked = false } = {}) {
  const g = game || session?.practice, a = g?.arcade || {};
  const board = a.tetris || a.cable || a.kernel;
  const receipt = a.confirm?.receipt;
  const lot = a.active && a.lots?.find(l => l.id === a.active), negotiation = lot?.negotiation;
  const unavailable = !receipt && lot && (lot.status !== 'open' || negotiation?.closed || (g && cents(lot.qty, negotiation?.price ?? lot.ask) > cash(g)));
  const missedCharm = !receipt && lot && session?.lastCharm?.gpu === lot.gpu && session.lastCharm.tier !== 'hit';
  if (failed || blocked || view?.blocked || view?.desk === 'closed' || view?.tone === 'error' || unavailable || missedCharm || (board?.done && (!board.result?.perfect || board.result.skipped))) return 'explaining';
  if (receipt?.kind === 'term') return 'explaining';
  if (context === 'help') return 'explaining';
  if (board) return board.done && board.result?.perfect ? 'celebrating' : 'explaining';
  if (receipt?.kind === 'purchase' || a.confirm?.built) return 'celebrating';
  if (a.signing) return 'explaining';
  if (lot) return session || negotiation?.running || negotiation?.attempts?.length ? 'explaining' : 'broker';
  if (session?.step === 'funding' && !session.funded) return 'equity-offer';
  if (session?.step === 'ready' || (session?.step === 'snake' && session.largeBuildId)) return 'celebrating';
  if (!session || session.step === 'meet') return 'broker';
  return 'explaining';
}

export function baburPortrait(expression = 'broker') {
  const key = Object.hasOwn(BABUR_ART.expressions, expression) ? expression : 'broker';
  const asset = BABUR_ART.expressions[key];
  return `<span class="babur-portrait" data-babur-expression="${key}" aria-hidden="true">${asset.url ? `<img class="babur-art-image" data-babur-art src="${esc(asset.url)}" width="${BABUR_ART.width}" height="${BABUR_ART.height}" alt="" aria-hidden="true" decoding="async">` : ''}</span>`;
}
export function baburSays(line, { small = false, label = 'Babur', expression = 'broker' } = {}) {
  return `<aside class="babur-guide ${small ? 'is-small' : ''}" aria-label="Babur’s guidance"><div class="babur-picture">${baburPortrait(expression)}</div><div class="babur-dialogue"><b>${esc(label)}</b><p>${esc(line)}</p></div></aside>`;
}

// Error capture is installed once on the persistent application root. A failed
// image becomes invisible without a retry or expression swap; the box stays put.
export function attachBaburArtFallback(root) {
  const onError = event => {
    const target = event.target;
    if (target?.matches?.('img[data-babur-art]')) {
      target.style.visibility = 'hidden';
      target.dataset.baburArtFailed = 'true';
    }
  };
  root.addEventListener('error', onError, true);
  return () => root.removeEventListener('error', onError, true);
}
