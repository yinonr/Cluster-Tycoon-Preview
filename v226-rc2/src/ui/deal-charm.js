// V22.1 Deal Charm on the Deal Room and the term sheet: what a hit or a miss would do, in money or
// ownership, before the lever is pulled; then the meter; then the frozen verdict. Engine: tycoon/deal-charm.js.
import { dealStakes, currentDeal } from '../tycoon/deal-charm.js';
import { meterHTML } from './pit-charm.js';
import { short, bpsText } from './pit-ledger.js';

const said = (kind, r, t) => r.walk ? (kind === 'buyout' ? 'They walk' : 'They withdraw') : kind === 'buyout' ? short(r.price) : r.more ? (t?.funding === 'compute' ? `+${Math.round((r.more - 1) * 100)}% GPUs` : `${short(Math.round(t.amount * r.more))} raise`) : bpsText(r.pct);
export function dealCharmView(g, t = null) {
  const deal = currentDeal(g), n = deal?.negotiation, e = n?.attempts?.at(-1), s = dealStakes(g);
  const jackpot = e?.params.attempt === 3 && e.precision === 'perfect';
  const verdict = e?.status === 'resolved' ? `<div class="verdict-block tone-${e.tier === 'hit' ? 'hit' : 'miss'} ${jackpot ? 'is-jackpot' : ''}" role="status"><div class="verdict-meter">${meterHTML(e.params, e.position, true)}<strong class="verdict-stamp" data-fx-verdict style="--at:${Math.max(16, Math.min(84, e.position * 100))}%">${jackpot ? 'JACKPOT' : (e.precision || e.tier).toUpperCase()}</strong></div></div>` : '';
  if (n?.running) { const p = n.attempts.at(-1).params; return `<section class="pit-charm deal-charm tier-${p.attempt}"><button type="button" data-action="stop-rizz" class="charm-stop" data-primary>${meterHTML(p, 0)}<strong>STOP</strong></button></section>`; }
  if (!s) return verdict;
  const k = s.kind, rows = [['HIT', s.hit, 'stake-hit'], ['NEAR', s.near, 'stake-now'], ['MISS', s.miss, 'stake-miss'], ['WIDE', s.severe, 'stake-miss']];
  const stakes = `<div class="charm-stakes deal-stakes">${rows.map(([label, r, cls]) => `<p class="stake ${cls}"><span>${label}</span><b>${said(k, r, t)}</b></p>`).join('')}</div>`;
  // V22.3: the player feels the risk; the HIT/NEAR/MISS table lives behind an optional details toggle.
  return `${verdict}<section class="pit-charm deal-charm tier-${s.attempt}"><button type="button" data-action="start-rizz" class="charm-lever mat-risk tier-${s.attempt}"><span>${s.label.toUpperCase()}</span><small>${s.attempt}/3</small></button><details class="charm-odds"><summary>Odds</summary>${stakes}</details></section>`;
}
