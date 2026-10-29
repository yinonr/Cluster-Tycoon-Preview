import { stream } from '../util.js';
import { CHARM_RULES as R } from './rizz.js';
import { buyerLive, saleQuote } from './arcade-buyers.js';
import { cents, notice } from './arcade.js';
import { expireTimed } from './exchange.js';

export const currentBuyer = g => g?.arcade.buyers.find(b => b.id === g.arcade.confirm?.buyerId);
export function buyerStakes(g, b, qty) {
  const n = b?.negotiation;
  if (!n) return null;
  const entries = n.attempts || [], attempt = entries.length + 1;
  if (n.running) return entries.at(-1).stakes;
  if (!buyerLive(g, b) || n.charmClosed || attempt > 3 || !saleQuote(g, b.id, qty) || (n.lockedQty && qty !== n.lockedQty)) return null;
  const cap = Math.min(b.ceiling, Math.floor(b.budget / cents(qty, 1)));
  const room = cap - b.rate;
  if (room <= 0) return null;
  const concession = Math.min(room, Math.max(1, Math.floor((cap - b.openingRate) * R.concessions[attempt - 1])));
  const p = { attempt, timeCost: R.seconds[attempt - 1], width: R.widths[attempt - 1] * (b.posture === 'firm' ? .8 : b.posture === 'flexible' ? 1.1 : 1), speed: R.speeds[attempt - 1], phase: stream(g.seed, 'v111-selling-charm', b.id, attempt).range(0, 2), concession };
  return { params: p, qty, cap, label: R.labels[attempt - 1], premium: cents(qty, Math.max(0, b.rate - b.openingRate)), upside: cents(qty, concession), expires: g.arcade.time + p.timeCost >= Math.min(b.until, g.arcade.seconds) };
}
export function startBuyerCharm(g, qty) {
  const b = currentBuyer(g), n = b?.negotiation;
  if (!n || n.running || g.arcade.signing || g.arcade.active) return false;
  const s = buyerStakes(g, b, qty); if (!s) return false;
  n.attempts ||= []; n.lockedQty = qty;
  n.attempts.push({ params: s.params, stakes: s, before: b.rate, status: 'running' }); n.running = n.attempts.length;
  g.arcade.time = Math.min(g.arcade.seconds, g.arcade.time + s.params.timeCost);
  for (const l of g.arcade.lots) if (l.status === 'open' && l.until <= g.arcade.time) l.status = 'expired';
  expireTimed(g);
  if (!buyerLive(g, b) || g.arcade.time >= g.arcade.seconds) return resolveBuyerCharm(g, 0, true);
  notice(g, `${s.label}: ${s.params.timeCost}s spent. Quantity locked at ${qty}. Interrupting the meter forfeits this attempt.`);
  return true;
}
export function resolveBuyerCharm(g, position, interrupted = false) {
  const b = currentBuyer(g), n = b?.negotiation, e = n?.running && n.attempts[n.running - 1];
  if (!e || e.status !== 'running' || !Number.isFinite(position) || position < 0 || position > 1) return false;
  const p = e.params, distance = Math.max(0, Math.abs(position - .5) - p.width / 2);
  const expired = !buyerLive(g, b) || g.arcade.time >= g.arcade.seconds;
  const tier = expired ? 'expired' : interrupted ? 'severe' : distance <= 1e-12 ? 'hit' : distance <= R.nearDistance ? 'near' : distance <= R.missDistance ? 'miss' : 'severe';
  const accuracy = Math.max(0, 1 - Math.abs(position - .5) / (p.width / 2));
  const precision = tier === 'hit' ? accuracy >= .8 - 1e-12 ? 'perfect' : accuracy >= .4 - 1e-12 ? 'strong' : 'edge' : null;
  if (precision) b.rate = Math.min(e.stakes.cap, b.rate + Math.max(1, Math.floor(p.concession * R.precision[precision])));
  else if (!expired) {
    const gain = Math.max(0, b.rate - b.openingRate);
    b.rate = tier === 'near' ? Math.max(b.openingRate, b.rate - Math.max(1, Math.ceil(gain / 2))) : b.openingRate;
    if ((p.attempt === 2 && tier === 'severe') || (p.attempt === 3 && tier !== 'near')) n.walked = true;
  }
  Object.assign(e, { status: 'resolved', tier, precision, position, interrupted, after: b.rate, premium: cents(e.stakes.qty, b.rate - e.before), walked: n.walked }); n.running = null;
  const reaction = { firm: 'Your numbers add up.', cautious: 'Approved within my mandate.', flexible: 'That is a convincing pitch.' }[b.posture];
  const text = expired ? 'The funded bid expired. No sale made.' : n.walked ? 'Buyer walked. This bid is gone.' : precision ? `${reaction} $${(b.rate / 100).toFixed(2)}/h for your block.` : b.rate < e.before ? 'The pitch cost you premium. The remaining bid stands.' : 'No premium earned. My opening bid stands.';
  n.tape.push({ speaker: b.name, text, outcome: n.walked ? 'walk' : precision ? 'accept' : 'hold' }); notice(g, text, precision ? 'good' : 'bad');
  return true;
}
export const recoverBuyerCharm = g => currentBuyer(g)?.negotiation.running ? resolveBuyerCharm(g, 0, true) : false;
