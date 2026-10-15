// Explicit, replayable outcomes. No random success roll; the meter position decides.
import { stream } from '../util.js';
import { activeLot, notice, cents } from './arcade.js';

export const RAPPORT_WIDTH = Object.freeze({cold:1,receptive:1.12,guarded:.90,irritated:.82});

export function rizzParameters(g, lot) {
  const n = lot.negotiation, attempt = n.attempts.length + 1;
  if (attempt > 3) return null;
  const trust = g.firms[lot.firm]?.trust || 0;
  // Capped help: even max relationships leave tier 3 narrower/faster than tier 2.
  const help = Math.max(0, Math.min(0.25, trust * 0.015 + Math.max(0, g.clout) * 0.0003));
  const assist = !!g.arcade.assistance;
  const rapport=g.arcade.version===80?(n.rapport||'cold'):'cold';
  return { attempt, trust, clout: g.clout, assist, rapport,
    width: [0.26, 0.15, 0.075][attempt - 1] * (1 + help) * RAPPORT_WIDTH[rapport],
    speed: [0.68, 1.08, 1.55][attempt - 1] / (1 + help) * (assist ? 0.55 : 1),
    phase: stream(g.seed, 'v7-rizz', lot.id, attempt).range(0, 2),
    concession: Math.min(n.price - lot.floor, Math.max(1, Math.floor((lot.ask - lot.floor) * [0.40, 0.65, 1.00][attempt - 1] * (assist ? 0.65 : 1)))),
  };
}

export function markerAt(params, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  const u = (params.phase + elapsedMs / 1000 * params.speed) % 2;
  return u <= 1 ? u : 2 - u;
}

// Highest reachable non-walkout price on the next miss; shared with the stakes UI.
export function failurePrice(l,attempt) {
  const n=l.negotiation;
  return attempt===1?Math.min(l.ask,n.price+Math.max(1,Math.ceil((l.ask-l.floor)*.40))):attempt===2?l.ask:l.ask;
}

export function startRizz(g) {
  const l = activeLot(g), n = l?.negotiation;
  if (g.arcade.signing || g.phase !== 'floor' || !n || n.closed || n.running || l.status !== 'open') return false;
  const params = rizzParameters(g, l);
  if (!params || params.concession <= 0) return false;
  // Consume and persist the attempt BEFORE the moving meter starts.
  n.attempts.push({ params, before: n.price, status: 'running' });
  n.running = params.attempt;
  notice(g, `Attempt ${params.attempt}: stop inside the target. Reloading or leaving mid-attempt counts as a severe miss.`);
  return true;
}

export function resolveRizz(g, position, interrupted = false) {
  const l = activeLot(g), n = l?.negotiation;
  if (!n?.running || n.closed || !Number.isFinite(position) || position < 0 || position > 1) return false;
  const entry = n.attempts[n.running - 1];
  if (!entry || entry.status !== 'running') return false;
  const p = entry.params, distance = Math.max(0, Math.abs(position - 0.5) - p.width / 2);
  const tier = interrupted ? 'severe' : distance <= 1e-12 ? 'hit' : distance <= 0.08 ? 'near' : distance <= 0.22 ? 'miss' : 'severe';
  let trust = 0, clout = 0, walked = false;
  const accuracy = Math.max(0, 1 - Math.abs(position - 0.5) / (p.width / 2));
  const precision = tier !== 'hit' ? null : accuracy >= 0.8 - 1e-12 ? 'perfect' : accuracy >= 0.4 - 1e-12 ? 'strong' : 'edge';
  const multiplier = precision ? { edge: 0.4, strong: 0.7, perfect: 1 }[precision] : 0;
  const reward = precision ? Math.max(1, Math.floor(p.concession * multiplier)) : 0;
  if (tier === 'hit') n.price = Math.max(l.floor, n.price - reward);
  else if (p.attempt === 1) {
    trust = tier === 'severe' ? -1 : 0;
    // A bad first read gives back some haggling gains; at ask, it costs Trust.
    if (tier !== 'near') n.price = Math.min(l.ask, n.price + Math.max(1, Math.ceil((l.ask-l.floor)*.40)));
  }
  else if (p.attempt === 2) {
    trust = { near: -1, miss: -2, severe: -4 }[tier];
    n.price = Math.max(n.price, tier === 'near' ? Math.ceil((n.price + n.base) / 2) : l.ask);
  } else {
    trust = { near: -3, miss: -5, severe: -8 }[tier];
    n.price = Math.max(n.price, tier === 'near' ? n.base : l.ask);
    if (tier === 'severe') { walked = true; clout = -20; l.status = 'walked'; n.closed = true; }
  }
  const f = g.firms[l.firm] ||= { trust: 0, deals: 0 };
  const beforeTrust = f.trust;
  f.trust = Math.max(-12, Math.min(12, f.trust + trust));
  trust = f.trust - beforeTrust; g.clout += clout;
  Object.assign(entry, { status: 'resolved', position, distance, tier, accuracy, precision, multiplier, reward, interrupted, after: n.price, trust, clout, walked });
  n.running = null;
  n.tape.push({speaker:l.firm, outcome:walked?'walk':tier==='hit'?'accept':'hold', text:walked?'Too far. This deal is gone.':tier==='hit'?`You got me. $${(n.price/100).toFixed(2)}. Bank it?`:`No. $${(n.price/100).toFixed(2)} is my quote now.`});
  const outcome = tier === 'hit' ? `${precision === 'perfect' ? 'BULLSEYE · PERFECT CHARM' : precision.toUpperCase() + ' CHARM HIT'} · ${new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(cents(l.qty,entry.before-n.price)/100)} SAVED (${Math.round(multiplier * 100)}% reward). Bank the deal or risk the next attempt.` : walked ? 'CATASTROPHIC OVER-RIZZ · supplier walked. This lot is gone.' : tier === 'near' ? 'NEAR MISS · ' + (p.attempt === 1 ? 'your quote is safe.' : 'some or all Charm gains lost.') : 'MISSED · quote and relationship at risk.';
  notice(g, `${interrupted ? 'Interrupted attempt settled as a severe miss. ' : ''}${outcome} ${tier !== 'hit' && n.price > entry.before ? `Concessions lost: $${(cents(l.qty,n.price-entry.before)/100).toFixed(2)}. ` : ''}Trust ${trust >= 0 ? '+' : ''}${trust}${clout ? ` · Clout ${clout}` : ''}.`, tier === 'hit' ? 'good' : 'bad');
  return true;
}

export function recoverRizz(g) {
  return activeLot(g)?.negotiation?.running ? resolveRizz(g, 0, true) : false;
}
