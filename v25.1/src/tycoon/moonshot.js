import { stream } from '../util.js';
import { enterpriseValue, rackOutput, opsOf } from './founder.js';
import { staffEffect } from './commerce.js';
import { institutionalNews } from './institutional.js';
import { campaignLimit } from './extension.js';
// V22: every round cap follows the accepted horizon (5 in the core; an earned round extends it).
const horizon = g => campaignLimit(g);

export const MOONSHOT = Object.freeze({
  // V22.5.2: one frontier project, GPUs only (the old cluster and training stages, combined).
  frontier: { recipe: { H200: 8, B200: 26 } },
  cluster: { recipe: { H200: 4, B200: 12 }, cash: 0 },
  training: { recipe: { H200: 4, B200: 14 }, cash: 0 },
  legendaryRevenue: 160000000, usefulRevenue: 12000000, recoveryBurn: 25000000,
});
export const moonshotActive = g => g.world.institutional?.moonshot?.state === 'training-integrating';
// V10.14: an exclusive Cirrostrata anchor or a closed lab takes the Moonshot off the table; a
// recruited frontier team (the Okafor team) makes a level-2 lab ready without a breakthrough.
export const frontierClosed = g => g.company.researchClosed || !!g.world.scen?.anchor?.exclusive && ['active', 'waiting', 'completed'].includes(g.world.scen.anchor.state);
export function frontierPossible(g) {
  const m = g.world.institutional?.moonshot, c = g.company;
  if (frontierClosed(g) || ['declined', 'expired', 'abandoned', 'resolved'].includes(m?.state)) return false;
  if (moonshotActive(g)) return g.q <= Math.min(horizon(g), m.deadline);
  const ready = c.level >= 3 || c.level >= 2 && (c.breakthroughs > 0 || !!armed(g)?.frontier);
  const researchBusy = c.builds.some(b => b.lane === 'research' && b.online < 1);
  return g.q + Math.max(researchBusy ? 1 : 0, ready ? 0 : 3 - c.level) <= horizon(g) - 1;
}
const armed = g => { const b = g.world.scen?.bonus; return b && !b.used ? b : null; };
export function moonshotEligible(g) {
  const c = g.company;
  return g.q >= 3 && g.q <= horizon(g) - 1 && !frontierClosed(g) && (c.level >= 3 || c.level >= 2 && (c.breakthroughs > 0 || !!armed(g)?.frontier)) &&
    Math.round(g.cash * 100) + enterpriseValue(c) >= 300000000;
}
export function moonshotOdds(g, tuned = false) {
  const c = g.company, m = g.world.institutional?.moonshot;
  const prepared = rackOutput(c).some(([gpu, qty]) => gpu === 'B200' && qty >= 4);
  const talent = armed(g);
  // V10.15: half of the company's frontier readiness (earned by grading research racks) counts too.
  const legendary = Math.min(.5, .14 + .04 * Math.min(5, c.level) + .04 * Math.min(2, c.breakthroughs) + (prepared ? .04 : 0) + (tuned ? .06 : 0) + (talent?.legendary || 0) + opsOf(c).readiness / 2 + staffEffect(c, 'breakthrough'));
  const setback = Math.max(.12, .4 - .035 * Math.min(5, c.level) - .02 * Math.min(2, c.breakthroughs) - (tuned ? .04 : 0) + staffEffect(c, 'setback'));
  return { legendary, useful: 1 - legendary - setback, setback };
}
export function offerMoonshot(g) {
  const i = g.world.institutional ||= {};
  if (!i.moonshot && moonshotEligible(g)) {
    i.moonshot = { state: 'offered', offeredQ: g.q };
    institutionalNews(g, 'frontier-proposal', 'A frontier model run is on the Projects board: a large GPU commitment for a legendary model, a useful one, or a costly setback.');
  }
}
// V22.5.2: the frontier run is an ordinary research project. While it is on offer it takes the research slot
// in its first two rounds, then every third round; launching it commits GPUs (no cash) and integration at the bell decides it.
export function moonshotOpen(g) {
  offerMoonshot(g);
  const m = g.world.institutional?.moonshot;
  if (!m) return;
  if (m.state === 'offered' && g.q > horizon(g) - 1) m.state = 'expired';
  if (m.state === 'offered' && frontierClosed(g)) { m.state = 'declined'; m.reason ||= g.company.researchClosed ? 'research closed' : 'Cirrostrata exclusivity'; }
  if (m.recoveryFrom <= g.q && g.q <= m.recoveryUntil && !g.company.mods.burn.some(x => x.event === 'frontier-recovery'))
    g.company.mods.burn.push({ delta: MOONSHOT.recoveryBurn, left: 1, event: 'frontier-recovery' });
  if (m.state !== 'offered' || (g.q - m.offeredQ) % 3 === 2) return;
  if (g.company.builds.some(b => b.lane === 'research' && b.online < 1) || g.arcade.objectives.some(o => o.lane === 'research' && o.q === g.q && o.status === 'built')) return;
  const dropped = new Set(g.arcade.objectives.filter(o => o.lane === 'research' && o.status === 'open').map(o => o.id));
  g.arcade.objectives = g.arcade.objectives.filter(o => !dropped.has(o.id));
  g.arcade.reservations = g.arcade.reservations.filter(r => !dropped.has(r.card));
  const card = { id: `q${g.q}-frontier`, lane: 'research', kind: 'moonshot', moonshot: 1, name: 'Train a frontier model', tier: 0, q: g.q, status: 'open',
    blurb: 'The frontier run: a legendary model, a useful one, or a costly setback. Researchers raise the odds.', recipe: { ...MOONSHOT.frontier.recipe },
    reward: {}, cashCost: 0, mixed: true, cluster: true };
  g.arcade.objectives.push(card); m.card = card.id;
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
  const b = g.company.builds.find(b => b.id === m.trainingBuild);
  if (m.state === 'training-integrating' && b?.online === 1) {
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
      m.recoveryFrom = g.q + 1; m.recoveryUntil = Math.min(horizon(g), g.q + 2);
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
  if (!int(g.arcade.ledger.research) || g.arcade.ledger.research < 0 || builds.reduce((n, b) => n + (b.cashCost || 0), 0) !== g.arcade.ledger.research) return false;
  if (!m) return builds.length === 0;
  if (!['offered', 'declined', 'expired', 'training-integrating', 'resolved', 'abandoned'].includes(m.state) || !int(m.offeredQ) || m.offeredQ < 3 || m.offeredQ > 9) return false;
  if (['offered', 'declined', 'expired'].includes(m.state)) return builds.length === 0;
  if (m.state === 'abandoned' && !m.trainingBuild) return builds.length === 0;
  if (!int(m.startedQ) || m.startedQ < m.offeredQ || !int(m.deadline) || m.deadline < m.startedQ || m.deadline > 10) return false;
  if (builds.length !== 1 || builds[0].moonshot !== 1 || builds[0].id !== m.trainingBuild) return false;
  const training = builds[0];
  if (m.state === 'resolved' && (!['legendary', 'useful', 'setback'].includes(m.outcome) || training.online !== 1 || training.moonshotOutcome !== m.outcome ||
    g.company.products.filter(p => p.build === training.id).length !== (m.outcome === 'setback' ? 0 : 1))) return false;
  return true;
}
