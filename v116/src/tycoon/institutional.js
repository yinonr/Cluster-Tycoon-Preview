import { enterpriseValue, revenueNow } from './founder.js';
import { frontierPossible, frontierClosed } from './moonshot.js';

export const BIG_LEAGUES_ENABLED = true;
export function institutionalNews(g, id, headline) {
  const n = { id, q: g.q, when: 'open', size: 'major', headline, detail: '', tone: 'plain' };
  g.world.news.push(n); g.world.log.push({ id, q: g.q, headline }); g.arcade.news = g.world.news.slice();
}
// V10.15: the research ladder is a second frontier route. An Agentic model (level 6) by the due bell
// meets the mandate as well as a useful or legendary Moonshot.
export const MANDATE_LEVEL = 6;
export const ladderPossible = (g, due = 9) => !frontierClosed(g) && !g.company.agi && g.q + Math.max(0, MANDATE_LEVEL - g.company.level) <= due;
export function sovereignEligible(g) {
  const c = g.company, value = Math.round(g.cash * 100) + enterpriseValue(c);
  return g.q >= 5 && g.q <= 8 && !g.world.institutional?.fund && (frontierPossible(g) || ladderPossible(g)) && value >= 300000000 &&
    (g.q + Math.max(0, 3 - c.level) <= 8 || c.level >= 2 && c.breakthroughs > 0) &&
    (c.level >= 3 || c.breakthroughs > 0 || revenueNow(c) >= 6000000 || g.world.strategic?.state === 'completed');
}
export function sovereignTerm(g) {
  if (!sovereignEligible(g)) return null;
  const valuation = Math.round(g.cash * 100) + enterpriseValue(g.company), pre = Math.round(valuation * .9);
  const amount = Math.min(500000000, Math.max(200000000, Math.round(pre * .5 / 1000000) * 1000000));
  const pct = Math.ceil(10000 * amount / (pre + amount)), due = 9;
  const conditions = `By the R${due} bell: a useful or legendary Frontier Moonshot, or an Agentic model. Miss it and exit enterprise value falls 15%. The cash is never reclaimed.`;
  return { id: `q${g.q}-sovereign`, kind: 'strategic', institutional: 'sovereign', name: 'Aster Sovereign AI Fund',
    label: 'Sovereign AI Fund', fund: 'National AI champion mandate', pitch: 'Build a frontier company. We will fund the attempt, not guarantee the outcome.',
    amount, pct, openingPct: pct, floorPct: Math.ceil(pct * .85), patience: 2, valuation,
    at: 3, until: g.arcade.seconds, status: 'open', conditions, milestoneDue: due,
    tape: [{ speaker: 'Aster Sovereign AI Fund', text: conditions }] };
}
export function institutionalTerms(g, terms) {
  if (!BIG_LEAGUES_ENABLED) return terms;
  const t = sovereignTerm(g);
  if (!t) return terms;
  g.world.institutional ||= {};
  g.world.institutional.fund = { termId: t.id, state: 'offered', offeredQ: g.q, due: t.milestoneDue };
  institutionalNews(g, 'sovereign-offer', 'Aster Sovereign AI Fund: a national champion mandate is on the table.');
  const alternative = terms.find(x => x.funding === 'compute') || terms[0];
  return [t, ...(alternative ? [{ ...alternative, rivalOf: t.id }] : [])];
}
export function institutionalSigned(g, t, quote) {
  if (t.institutional !== 'sovereign') return;
  g.world.institutional ||= {};
  g.world.institutional.fund = { termId: t.id, state: 'signed', offeredQ: g.q, signedQ: g.q, due: t.milestoneDue,
    amount: quote.amount, shares: quote.shares, milestone: 'pending' };
  g.world.flags.sovereignSigned = true;
  institutionalNews(g, 'sovereign-signed', `Aster funded the company. Frontier milestone due R${t.milestoneDue}; equity issued, no personal payout.`);
}
export function institutionalBell(g) {
  const f = g.world.institutional?.fund;
  if (!f) return;
  if (f.state === 'offered') {
    f.state = g.arcade.terms.find(t => t.id === f.termId)?.status === 'declined' ? 'declined' : 'passed';
    g.world.flags.sovereignIndependent = true;
    institutionalNews(g, 'sovereign-independent', 'Aster mandate passed. The independent frontier route remains open.');
  }
  if (f.state !== 'signed' || f.milestone !== 'pending') return;
  const m = g.world.institutional.moonshot;
  if (m?.state === 'resolved' && ['legendary', 'useful'].includes(m.outcome) || g.company.level >= MANDATE_LEVEL) {
    f.milestone = 'met'; g.world.flags.sovereignMilestone = true;
    institutionalNews(g, 'sovereign-delivered', 'Aster mandate delivered. The frontier commercial launch is backed by its anchor investor.');
  } else if (g.q >= f.due || g.company.shutdown) {
    f.milestone = 'missed'; g.world.flags.sovereignMissed = true;
    if (!g.world.exitMods.some(x => x.mod === 'sovereign-missed')) g.world.exitMods.push({ mod: 'sovereign-missed', mult: .85, event: 'sovereign-milestone' });
    institutionalNews(g, 'sovereign-missed', 'Aster milestone missed: exit enterprise value -15%. No investment cash clawback.');
  }
}
export function validInstitutionalSave(g) {
  const i = g.world.institutional, f = i?.fund, int = Number.isSafeInteger;
  if (i !== undefined && (!i || typeof i !== 'object' || Array.isArray(i))) return false;
  if (i?.computeOffers && (!Array.isArray(i.computeOffers) || i.computeOffers.length > 3 || new Set(i.computeOffers).size !== i.computeOffers.length || !i.computeOffers.every(q => int(q) && q >= 2 && q <= 10))) return false;
  if (!f) return true;
  if (!['offered', 'signed', 'declined', 'passed'].includes(f.state) || typeof f.termId !== 'string' ||
    !int(f.offeredQ) || f.offeredQ < 5 || f.offeredQ > 8 || !int(f.due) || f.due <= f.offeredQ || f.due > 10) return false;
  if (f.state === 'signed' && (!['pending', 'met', 'missed'].includes(f.milestone) ||
    !g.company.shares.investors.some(x => x.termId === f.termId && x.paid === f.amount && x.shares === f.shares && x.q === f.signedQ))) return false;
  return true;
}
