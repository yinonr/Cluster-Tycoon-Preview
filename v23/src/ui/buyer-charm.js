import { buyerStakes } from '../tycoon/buyer-charm.js';
import { meterHTML } from './pit-charm.js';
import { money } from './pit-ledger.js';
export function buyerCharmView(g, b, qty) {
  const n = b.negotiation, e = n.attempts?.at(-1), s = buyerStakes(g, b, qty);
  const jackpot = e?.params.attempt === 3 && e.precision === 'perfect';
  const verdict = e?.status === 'resolved' ? `<div class="verdict-block tone-${e.tier === 'hit' ? 'hit' : 'miss'} ${jackpot ? 'is-jackpot' : ''}" role="status"><div class="verdict-meter">${meterHTML(e.params, e.position, true)}<strong class="verdict-stamp" data-fx-verdict style="--at:${Math.max(16, Math.min(84, e.position * 100))}%">${jackpot ? 'JACKPOT' : (e.precision || e.tier).toUpperCase()}</strong></div><p class="verdict-line">${e.premium >= 0 ? '+' : '-'}${money(Math.abs(e.premium))} resale premium</p></div>` : '';
  if (!s) return verdict;
  const stakes = `<div class="charm-stakes"><p class="stake stake-now"><span>BANKED</span><b>${money(s.premium)} premium</b></p><p class="stake stake-hit"><span>PERFECT HIT</span><b>+${money(s.upside)} cash</b></p><p class="stake stake-miss"><span>AT RISK</span><b>${money(s.premium)} premium</b><em>${s.params.attempt === 1 ? 'Miss: bid falls back' : s.params.attempt === 2 ? 'Severe miss: buyer walks' : 'Wide miss: buyer walks'}</em></p></div>`;
  return `${n.running ? '' : verdict}<section class="pit-charm tier-${s.params.attempt}">${stakes}${n.running ? `<button type="button" data-action="stop-rizz" class="charm-stop" data-primary>${meterHTML(s.params, 0)}<strong>STOP</strong></button>` : `${s.expires ? '<p class="charm-expiry">This push expires the buyer.</p>' : ''}<button type="button" data-action="start-rizz" data-qty="${qty}" class="charm-lever mat-risk tier-${s.params.attempt}"><span>${s.label.toUpperCase()}</span><small>${s.params.timeCost}s · ${qty} GPUs</small></button>`}</section>`;
}
