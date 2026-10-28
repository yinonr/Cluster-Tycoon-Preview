import { stream } from '../util.js';
import { enterpriseValue, rackOutput, opsOf } from './founder.js';
import { institutionalNews } from './institutional.js';

export const MOONSHOT = Object.freeze({
  cluster: { recipe: { H200: 4, B200: 12 }, cash: 30000000 },
  training: { recipe: { H200: 4, B200: 14 }, cash: 150000000 },
  legendaryRevenue: 160000000, usefulRevenue: 12000000, recoveryBurn: 25000000,
});
export const moonshotActive = g => ['cluster', 'cluster-integrating', 'training', 'training-integrating'].includes(g.world.institutional?.moonshot?.state);
// V10.14: an exclusive Cirrostrata anchor or a closed lab takes the Moonshot off the table; a
// recruited frontier team (the Okafor team) makes a level-2 lab ready without a breakthrough.
export const frontierClosed = g => g.company.researchClosed || !!g.world.scen?.anchor?.exclusive && ['active', 'waiting', 'completed'].includes(g.world.scen.anchor.state);
export function frontierPossible(g) {
  const m = g.world.institutional?.moonshot, c = g.company;
  if (frontierClosed(g) || ['declined', 'expired', 'abandoned', 'resolved'].includes(m?.state)) return false;
  if (moonshotActive(g)) return g.q + (m.state.startsWith('cluster') ? 1 : 0) <= Math.min(9, m.deadline);
  const ready = c.level >= 3 || c.level >= 2 && (c.breakthroughs > 0 || !!armed(g)?.frontier);
  const researchBusy = c.builds.some(b => b.q === g.q && b.lane === 'research');
  return g.q + Math.max(researchBusy ? 1 : 0, ready ? 0 : 3 - c.level) <= 8;
}
const armed = g => { const b = g.world.scen?.bonus; return b && !b.used ? b : null; };
export function moonshotEligible(g) {
  const c = g.company;
  return g.q >= 5 && g.q <= 8 && !frontierClosed(g) && (c.level >= 3 || c.level >= 2 && (c.breakthroughs > 0 || !!armed(g)?.frontier)) &&
    Math.round(g.cash * 100) + enterpriseValue(c) >= 300000000;
}
export function moonshotOdds(g, tuned = false) {
  const c = g.company, m = g.world.institutional?.moonshot;
  const prepared = rackOutput(c).some(([gpu, qty]) => gpu === 'B200' && qty >= 4);
  const talent = armed(g);
  // V10.15: half of the company's frontier readiness (earned by grading research racks) counts too.
  const legendary = Math.min(.5, .14 + .04 * Math.min(5, c.level) + .04 * Math.min(2, c.breakthroughs) + (m?.clusterTuned ? .04 : 0) + (prepared ? .04 : 0) + (tuned ? .06 : 0) + (talent?.legendary || 0) + opsOf(c).readiness / 2);
  const setback = Math.max(.12, .4 - .035 * Math.min(5, c.level) - .02 * Math.min(2, c.breakthroughs) - (tuned ? .04 : 0));
  return { legendary, useful: 1 - legendary - setback, setback };
}
export function offerMoonshot(g) {
  const i = g.world.institutional ||= {};
  if (!i.moonshot && moonshotEligible(g)) {
    i.moonshot = { state: 'offered', offeredQ: g.q };
    institutionalNews(g, 'frontier-proposal', 'Frontier Moonshot proposal: a two-stage Research commitment. Capital and compute at risk.');
  }
}
export function moonshotOpen(g) {
  offerMoonshot(g);
  const m = g.world.institutional?.moonshot;
  if (!m) return;
  if (m.state === 'offered' && g.q > 8) m.state = 'expired';
  if (m.state === 'offered' && frontierClosed(g)) { m.state = 'declined'; m.reason ||= g.company.researchClosed ? 'research closed' : 'Cirrostrata exclusivity'; }
  if (m.recoveryFrom <= g.q && g.q <= m.recoveryUntil && !g.company.mods.burn.some(x => x.event === 'frontier-recovery'))
    g.company.mods.burn.push({ delta: MOONSHOT.recoveryBurn, left: 1, event: 'frontier-recovery' });
  if (!moonshotActive(g)) return;
  if (!['cluster', 'training'].includes(m.state)) return;
  g.arcade.objectives = g.arcade.objectives.filter(o => o.lane !== 'research');
  const stage = m.state === 'cluster' ? 0 : 1, spec = stage ? MOONSHOT.training : MOONSHOT.cluster;
  const card = { id: `q${g.q}-moonshot-${stage}`, lane: 'research', kind: 'moonshot', moonshot: stage,
    name: stage ? 'Frontier: training run' : 'Frontier: assemble cluster', tier: 0, q: g.q, status: 'open',
    blurb: stage ? 'Irreversible training capital. A frontier model or a costly setback.' : 'Reserve the frontier cluster. Training follows after integration.',
    recipe: { ...spec.recipe }, reward: {}, cashCost: spec.cash, mixed: true };
  g.arcade.objectives.push(card); m.card = card.id;
}
export function reviewMoonshot(g) {
  const a = g.arcade;
  if (g.phase !== 'floor' || !g.world.institutional?.moonshot || a.active || a.confirm || a.signing) return false;
  a.confirm = { moonshot: true }; return true;
}
export function acceptMoonshot(g) {
  const m = g.world.institutional?.moonshot, a = g.arcade;
  if (g.phase !== 'floor' || !a.confirm?.moonshot || a.signing || m?.state !== 'offered' || g.q > 8 || frontierClosed(g) ||
    g.company.builds.some(b => b.q === g.q && b.lane === 'research')) return false;
  Object.assign(m, { state: 'cluster', startedQ: g.q, deadline: Math.min(9, g.q + 2) });
  const old = new Set(a.objectives.filter(o => o.lane === 'research').map(o => o.id));
  a.reservations = a.reservations.filter(r => !old.has(r.card)); a.confirm = null;
  moonshotOpen(g);
  institutionalNews(g, 'frontier-accepted', `Frontier cluster committed. Assemble this round; complete training by R${m.deadline}.`);
  return true;
}
export function declineMoonshot(g) {
  const m = g.world.institutional?.moonshot;
  if (!g.arcade.confirm?.moonshot || g.arcade.signing || m?.state !== 'offered') return false;
  m.state = 'declined'; g.arcade.confirm = null; return true;
}
function abandon(g, reason) {
  const m = g.world.institutional.moonshot;
  m.state = 'abandoned'; m.endedQ = g.q; m.reason = reason;
  g.world.flags.moonshotAbandoned = true;
  institutionalNews(g, 'frontier-abandoned', `Frontier Moonshot ended: ${reason}. Spent capital and compute are not refunded.`);
}
export function endMoonshot(g) {
  if (moonshotActive(g)) abandon(g, g.company.shutdown ? 'company shut down' : 'campaign ended');
}
export function moonshotBell(g) {
  const m = g.world.institutional?.moonshot;
  if (!moonshotActive(g)) return;
  const b = g.company.builds.find(b => b.id === (m.state.startsWith('cluster') ? m.clusterBuild : m.trainingBuild));
  if (m.state === 'cluster') return abandon(g, 'cluster not assembled at its first bell');
  if (m.state === 'cluster-integrating' && b?.online === 1) {
    m.clusterTuned = !!b.tuned; m.state = 'training';
    institutionalNews(g, 'frontier-cluster-ready', 'Frontier cluster integrated. The training commitment opens next round.');
  } else if (m.state === 'training-integrating' && b?.online === 1) {
    const talent = armed(g), odds = moonshotOdds(g, !!b.tuned), u = stream(g.seed, 'v112-moonshot-outcome', m.startedQ).next();
    const outcome = u < odds.legendary ? 'legendary' : u < odds.legendary + odds.useful ? 'useful' : 'setback';
    if (talent?.legendary) { talent.used = true; talent.usedBy = b.id; talent.result = outcome; m.talent = talent.source; }
    Object.assign(m, { state: 'resolved', outcome, odds, roll: u, endedQ: g.q }); b.moonshotOutcome = outcome;
    b.result = { legendary: 'breakthrough', useful: 'solid', setback: 'setback' }[outcome];
    const lv = g.company.level;
    b.reward.level = outcome === 'legendary' ? Math.max(lv, 5) : outcome === 'useful' ? Math.max(lv, Math.min(5, lv + 1)) : lv;
    if (outcome !== 'setback') {
      const c = g.company, revenue = outcome === 'legendary' ? MOONSHOT.legendaryRevenue : MOONSHOT.usefulRevenue;
      c.level = b.reward.level;
      if (outcome === 'legendary') c.breakthroughs++;
      b.reward.revenue = revenue;
      c.products.push({ build: b.id, name: outcome === 'legendary' ? 'Frontier commercial launch' : 'Specialist licensing', revenue, online: 1 });
      g.world.flags[`moonshot.${outcome}`] = true;
      institutionalNews(g, `frontier-${outcome}`, outcome === 'legendary' ? 'Legendary frontier breakthrough: $1.6M base quarterly commercial demand, before model quality. No valuation multiplier.' : 'Useful, below the frontier promise: $120k base quarterly licensing, before model quality. The capital is still spent.');
    } else {
      m.recoveryFrom = g.q + 1; m.recoveryUntil = Math.min(10, g.q + 2);
      g.world.flags.moonshotSetback = true;
      g.world.sentiment.push({ delta: -.12, left: 3, event: 'frontier-setback' });
      institutionalNews(g, 'frontier-setback', `Frontier training setback: no commercial reward. Remediation adds $250k burn in R${m.recoveryFrom}-R${m.recoveryUntil}; trading and bridge finance remain available.`);
    }
    return;
  }
  if (g.q >= m.deadline) abandon(g, 'training did not integrate before the deadline');
}
export function validMoonshotSave(g) {
  const m = g.world.institutional?.moonshot, int = Number.isSafeInteger;
  const builds = g.company.builds.filter(b => b.moonshot !== undefined);
  if (!int(g.arcade.ledger.research) || g.arcade.ledger.research < 0 ||
    builds.reduce((n,b) => n + b.cashCost, 0) !== g.arcade.ledger.research ||
    builds.some(b => ![0, 1].includes(b.moonshot) || b.cashCost !== (b.moonshot ? MOONSHOT.training.cash : MOONSHOT.cluster.cash))) return false;
  if (!m) return builds.length === 0;
  if (!['offered','declined','expired','cluster','cluster-integrating','training','training-integrating','resolved','abandoned'].includes(m.state) || !int(m.offeredQ) || m.offeredQ < 5 || m.offeredQ > 8) return false;
  if (['offered','declined','expired'].includes(m.state)) return builds.length === 0;
  if (!int(m.startedQ) || m.startedQ < m.offeredQ || m.startedQ > 8 || !int(m.deadline) || m.deadline <= m.startedQ || m.deadline > 9) return false;
  if (builds.filter(b => b.moonshot === 0).length > 1 || builds.filter(b => b.moonshot === 1).length > 1) return false;
  const cluster = builds.find(b => b.id === m.clusterBuild && b.moonshot === 0);
  const training = builds.find(b => b.id === m.trainingBuild && b.moonshot === 1);
  if (m.clusterBuild && !cluster || m.trainingBuild && !training) return false;
  if (['training','training-integrating','resolved'].includes(m.state) && cluster?.online !== 1) return false;
  if (m.state === 'cluster-integrating' && !cluster || m.state === 'training-integrating' && !training) return false;
  if (m.state === 'resolved' && (!['legendary','useful','setback'].includes(m.outcome) || training?.online !== 1 || training.moonshotOutcome !== m.outcome ||
    g.company.products.filter(p => p.build === training.id).length !== (m.outcome === 'setback' ? 0 : 1))) return false;
  return true;
}
