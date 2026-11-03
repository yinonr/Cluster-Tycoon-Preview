// V22.1 Deal Charm: the same three-attempt Charm bar (Charm, Double Down, Over-Rizz) on the two biggest
// tables in the game, a buyout offer for the whole company and an investor's term sheet. Timing decides;
// the meter's width and speed are the GPU desk's own CHARM_RULES. Every attempt is persisted before the
// meter runs, so leaving or reloading during the meter settles as a severe miss (recoverDealCharm).
//   Buyout: fundamentals set the opening price; a hit multiplies it (and closes part of any gap to today's
//           mark), with a disproportionate Over-Rizz. Misses cut the price; wider misses and later tiers
//           make the buyer walk, and a walked buyer does not come back.
//   Terms:  Charm and Double Down cut dilution; Over-Rizz raises more (cash) or more GPUs (compute) at the
//           same ownership. Misses raise the ask; later tiers can make the investor withdraw.
import { stream } from '../util.js';
import { CHARM_RULES as R } from './rizz.js';
import { reviewedOffer, offerLive, markOf } from './scenarios.js';
import { termLive } from './investors.js';
import { notice } from './arcade.js';

export const DEAL_CHARM = Object.freeze({
  buyout: Object.freeze({ up: [.30, .80, 2.5], gap: [.30, .50, .80], near: [.94, .88, .80], miss: [.85, .72, null], severe: [.75, null, null] }),
  term: Object.freeze({ cut: [.35, .55, 0], more: [0, 0, 1], near: [100, 200, 300], miss: [200, 400, null], severe: [300, null, null], maxPct: 4900 }),
});
const round10k = n => Math.max(10000, Math.round(n / 1000000) * 1000000 || Math.round(n / 10000) * 10000);
const tierOf = (p, position, interrupted) => {
  const distance = Math.max(0, Math.abs(position - .5) - p.width / 2);
  return interrupted ? 'severe' : distance <= 1e-12 ? 'hit' : distance <= R.nearDistance + 1e-12 ? 'near' : distance <= R.missDistance + 1e-12 ? 'miss' : 'severe';
};

function table(g) {
  const a = g.arcade;
  const o = reviewedOffer(g);
  if (o && o.key === 'buyout' && offerLive(g, o)) return { kind: 'buyout', id: o.id, o, n: o.terms.charm };
  const t = a.confirm?.termId && a.terms.find(t => t.id === a.confirm.termId);
  if (t && termLive(g, t) && !t.vulture && (!g.arcade.practice || t.scripted)) return { kind: 'term', id: t.id, t, n: t.charm };
  return null;
}
// For the shared Charm controller: an actor with an id and a negotiation (attempts, running).
export function currentDeal(g) { const x = table(g); return x ? { id: x.id, kind: x.kind, negotiation: x.n || { attempts: [], running: null } } : null; }

export function dealParams(g) {
  const x = table(g); if (!x) return null;
  const n = x.n, attempt = (n?.attempts.length || 0) + 1;
  if (n?.running || n?.closed || attempt > 3) return null;
  if (g.arcade.signing || g.arcade.active) return null;
  return { attempt, width: R.widths[attempt - 1], speed: R.speeds[attempt - 1], phase: stream(g.seed, 'v221-deal-charm', x.id, attempt).range(0, 2), timeCost: 0 };
}

// What each outcome would do, disclosed before the player pulls the lever.
function outcome(g, x, k, tier, precision = 'perfect') {
  const m = R.precision[precision] || 1;
  if (x.kind === 'buyout') {
    const B = DEAL_CHARM.buyout, price = x.o.terms.price, gap = Math.max(0, markOf(g) - price);
    if (tier === 'hit') return { price: round10k(price * (1 + B.up[k] * m) + gap * B.gap[k] * m) };
    const f = B[tier][k]; return f === null ? { walk: true } : { price: round10k(price * f) };
  }
  const T = DEAL_CHARM.term, t = x.t, floor = Math.max(100, Math.round(t.floorPct * .5 / 50) * 50);
  if (tier === 'hit') {
    if (T.more[k]) return { pct: t.pct, more: 1 + T.more[k] * m };
    return { pct: Math.max(floor, t.pct - Math.max(50, Math.round((t.pct - floor) * T.cut[k] * m / 50) * 50)) };
  }
  const d = T[tier][k]; return d === null ? { walk: true } : { pct: Math.min(T.maxPct, t.pct + d) };
}
export function dealStakes(g) {
  const x = table(g), p = dealParams(g); if (!x || !p) return null;
  const k = p.attempt - 1;
  return { attempt: p.attempt, label: R.labels[k], params: p, kind: x.kind, hit: outcome(g, x, k, 'hit'), near: outcome(g, x, k, 'near'), miss: outcome(g, x, k, 'miss'), severe: outcome(g, x, k, 'severe') };
}

export function startDealCharm(g) {
  const x = table(g), p = dealParams(g); if (!x || !p) return false;
  const n = x.kind === 'buyout' ? (x.o.terms.charm ||= { attempts: [], running: null, closed: false }) : (x.t.charm ||= { attempts: [], running: null, closed: false });
  n.attempts.push({ params: p, status: 'running', before: x.kind === 'buyout' ? x.o.terms.price : { pct: x.t.pct, amount: x.t.amount } });
  n.running = n.attempts.length;
  notice(g, `${R.labels[p.attempt - 1]}: stop in the target. Leaving or reloading during the meter is a severe miss.`);
  return true;
}

export function resolveDealCharm(g, position, interrupted = false) {
  const x = table(g), n = x?.n, e = n?.running && n.attempts[n.running - 1];
  if (!e || e.status !== 'running' || !Number.isFinite(position) || position < 0 || position > 1) return false;
  const p = e.params, k = p.attempt - 1, tier = x.kind === 'term' && x.t.scripted ? 'hit' : tierOf(p, position, interrupted);
  const accuracy = Math.max(0, 1 - Math.abs(position - .5) / (p.width / 2));
  const precision = tier === 'hit' ? accuracy >= .8 - 1e-12 ? 'perfect' : accuracy >= .4 - 1e-12 ? 'strong' : 'edge' : null;
  // V22.3 onboarding: a scripted practice term lands on its target whatever the stop, once, and never walks.
  const sc = x.kind === 'term' && x.t.scripted;
  const r = sc ? { pct: x.t.scripted.target } : outcome(g, x, k, tier, precision || 'perfect');
  let text;
  if (x.kind === 'buyout') {
    const o = x.o, who = o.cast;
    if (r.walk) {
      o.state = 'walked'; o.choice = 'charm'; n.closed = true;
      const s = g.world.scen; s.buyout ||= { offers: 1 }; s.buyout.walked = true; s.due = s.due.filter(d => !String(d.key).startsWith('buyout')); g.world.flags[`buyout.walked.${o.suitor}`] = true;
      text = p.attempt === 3 ? 'You overplayed it. We are done here.' : 'That was not serious. Our offer is withdrawn.';
    } else {
      o.terms.price = r.price;
      text = tier === 'hit' ? (p.attempt === 3 && precision === 'perfect' ? 'You are out of your mind. …Fine. Done.' : precision === 'perfect' ? 'You drive a hard bargain. Deal.' : 'All right. We can stretch.') : tier === 'near' ? 'Close. Not that close.' : 'That cost you. Here is our revised number.';
    }
    o.log.push({ speaker: who, text });
    Object.assign(e, { status: 'resolved', tier, precision, position, interrupted, after: r.walk ? e.before : o.terms.price, walked: !!r.walk });
  } else {
    const t = x.t;
    if (r.walk) { t.status = 'walked'; n.closed = true; g.arcade.confirm = null; g.world.flags[`investor.walked.${t.investor || t.name}`] = true; text = 'We are out. Good luck with the raise.'; }
    else {
      t.pct = r.pct;
      if (r.more) {
        if (t.funding === 'compute') { for (const d of t.tranches) d.qty = Math.max(d.qty, Math.round(d.qty * r.more)); t.amount = t.tranches.reduce((s, d) => s + d.qty * d.unitCost, 0); }
        else t.amount = Math.round(t.amount * r.more / 100000) * 100000;
      }
      text = tier === 'hit' ? (r.more ? (t.funding === 'compute' ? 'Fine. More capacity, same terms.' : 'Fine. Bigger check, same terms.') : 'You make a good case. Better terms.') : 'That pitch cost you. Our terms just got worse.';
    }
    if (sc) { n.closed = true; text = 'Fine. Twenty percent.'; }
    t.tape.push({ speaker: t.name, text, outcome: r.walk ? 'walk' : tier === 'hit' || sc ? 'accept' : 'hold' });
    Object.assign(e, { status: 'resolved', tier, precision, position, interrupted, after: { pct: t.pct, amount: t.amount }, walked: !!r.walk });
  }
  n.running = null;
  notice(g, `${interrupted ? 'Interrupted: settled as a severe miss. ' : ''}${text}`, tier === 'hit' ? 'good' : 'bad');
  return true;
}
export const recoverDealCharm = g => currentDeal(g)?.negotiation?.running ? resolveDealCharm(g, 0, true) : false;
