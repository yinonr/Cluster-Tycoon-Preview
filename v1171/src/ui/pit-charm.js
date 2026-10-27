// Charm on the desk: a risk card with a red lacquer lever, a takeover meter you stop on the
// press, and a verdict that freezes the needle where it landed. Every stake is charmStakes();
// every verdict is the attempt record. Meter timing (meterStart, the 180ms guard) is the
// controller's; this module only renders.
import { charmStakes, markerAt } from '../tycoon/rizz.js';
import { money, signed, meterBands, verdictOf } from './pit-ledger.js';

const chip = s => `<i class="t-chip" aria-hidden="true">${s}s</i>`;
const neg = n => (n < 0 ? `−${Math.abs(n)}` : String(n));

// The meter is drawn only from the attempt's parameters and the shared rules.
export function meterHTML(p, position, frozen = false) {
  const b = meterBands(p), band = (cls, x) => `<span class="${cls}" style="left:${x.left}%;width:${x.width}%"></span>`;
  return `<span class="meter${frozen ? ' is-frozen' : ''}" aria-hidden="true">${band('band-miss', b.miss)}${band('band-near', b.near)}<span class="target" style="left:${b.target.left}%;width:${b.target.width}%"></span>${band('band-strong', b.strong)}${band('band-perfect', b.perfect)}${position === null ? '' : `<span class="marker" style="left:${(position * 100).toFixed(3)}%"></span>`}</span>`;
}

// HIT / NOW / MISS as a three-line price strip. MISS carries the give-back sentence.
function stakeStrip(s) {
  const walk = s.walkoutTiers.length === 2 ? '<em>wider miss: they walk</em>' : s.walkoutTiers.length ? '<em>severe: they walk</em>' : '';
  const missLabel = s.walkoutTiers.length === 2 ? 'NEAR' : 'MISS';
  return `<div class="charm-stakes"><p class="stake stake-now"><span>BANKED</span><b>${money(s.secured)} saved</b></p><p class="stake stake-hit"><span>PERFECT<i> HIT</i></span><b>Save ${money(s.savings)} more</b></p><p class="stake stake-miss"><span>${missLabel}</span><b>${s.gainsAtRisk ? `Lose up to ${money(s.gainsAtRisk)}` : 'Trust at risk'}</b>${walk}</p></div>`;
}

export function charmView(g, l) {
  const n = l?.negotiation;
  if (!n || n.closed || l.status !== 'open' || l.until <= g.arcade.time) return '';
  const s = charmStakes(g, l);
  if (!s || (!s.running && s.params.concession <= 0)) return '<div class="charm-finished"><b>Final quote</b> Bank it or step away</div>';
  const p = s.params, tier = `tier-${s.attempt}`;
  if (s.running) {
    return `<section class="pit-charm charm-playing ${tier}" aria-label="${s.label}: stop the marker inside the target">${stakeStrip(s)}<button type="button" data-action="stop-rizz" class="charm-stop" data-primary aria-label="Stop the marker. Leaving or reloading counts as a severe miss.">${meterHTML(p, markerAt(p, 0))}<strong>STOP</strong><small>tap anywhere · Space · Enter</small></button></section>`;
  }
  const rel = [s.trustRisk ? `<span>Trust ${neg(s.trustRisk)}</span>` : '', s.cloutRisk ? `<span>Clout ${neg(s.cloutRisk)}</span>` : ''].filter(Boolean).join(' ');
  const warn = (s.expiresOnStart ? '<p class="charm-expiry">This push expires the supplier.</p>' : '') + (s.buyerExpiresOnStart ? '<p class="charm-expiry">This push expires your buyer.</p>' : '');
  return `<section class="pit-charm ${tier}" aria-label="${s.label} risk and timing">${stakeStrip(s)}${rel ? `<p class="charm-risk">${rel}</p>` : ''}${warn}<button type="button" data-action="start-rizz" class="charm-lever mat-risk ${tier}" aria-label="${s.label}: save up to ${money(s.savings)} more; risk ${money(s.gainsAtRisk)}, uses ${s.timeCost} seconds${s.walkoutTiers.length ? '; supplier can walk' : ''}" ${s.canStart ? '' : 'disabled'}><span>${s.label.toUpperCase()}</span><small class="lever-risk">${s.attempt===1 ? 'THE PITCH' : s.attempt===2 ? 'Risk your savings' : 'All on the line'}</small>${chip(s.timeCost)}</button></section>`;
}

// Where the needle landed on the last attempt, without a stamp (closed desks carry their own).
export function frozenMeter(entry) {
  return entry?.status === 'resolved' && entry.params && Number.isFinite(entry.position) ? `<div class="verdict-meter">${meterHTML(entry.params, entry.position, true)}</div>` : '';
}

// Spoken summary of the latest attempt, for the focused verdict desk.
export function verdictLabel(l) {
  const v = verdictOf(l?.negotiation?.attempts.at(-1), l?.qty);
  if (!v) return '';
  const rel = [v.trust ? `Trust ${neg(v.trust)}` : '', v.clout ? `Clout ${neg(v.clout)}` : ''].filter(Boolean).join(', ');
  return `${v.tone === 'hit' ? `${v.stamp} Charm` : v.stamp}. Quote ${v.total < 0 ? 'down' : v.total > 0 ? 'up' : 'unchanged'}${v.total ? ` ${money(Math.abs(v.total))}` : ''}${rel ? `. ${rel}` : ''}.`;
}

// The latest resolved attempt, frozen: needle where it landed, a stamp, the recorded delta.
export function charmVerdict(l) {
  const n = l?.negotiation, entry = n?.attempts.at(-1), v = verdictOf(entry, l?.qty);
  if (!v) return '';
  const pos = v.position, at = pos === null ? 50 : Math.max(16, Math.min(84, pos * 100));
  const delta = v.total ? `<b class="${v.total < 0 ? 'down' : 'up'}">${v.total < 0 ? signed(v.total) : `+${money(v.total)} given back`}</b>` : '<b>No change</b>';
  const rel = [v.trust ? `Trust ${neg(v.trust)}` : '', v.clout ? `Clout ${neg(v.clout)}` : ''].filter(Boolean).join(', ');
  const jackpot = entry.params?.attempt === 3 && entry.precision === 'perfect';
  return `<div class="verdict-block tone-${v.tone} ${jackpot ? 'is-jackpot' : ''}"><div class="verdict-meter">${entry.params && pos !== null ? meterHTML(entry.params, pos, true) : ''}<strong class="verdict-stamp" data-fx-verdict style="--at:${at}%">${jackpot ? 'JACKPOT' : v.stamp}</strong></div><p class="verdict-line">${delta}${rel ? rel.split(', ').map(x => `<span>${x}</span>`).join(' ') : ''}</p></div>`;
}
