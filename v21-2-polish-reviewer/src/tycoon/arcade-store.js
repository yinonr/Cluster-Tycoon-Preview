import { campaignLimit, validExtension, normalizeExtension } from './extension.js';
import { HIRES, BUSINESSES, validCommerce } from './commerce.js';
import { createArcade, V7 } from './arcade.js';
import { FOUNDER, EXECUTION, OUTCOME, OUTCOME_NAMES, normalizeOrdinaryProgress } from './founder.js';
import { cleanName, nameError } from './startup-name.js';
import { validStrategicSave } from './strategic.js';
import { validInstitutionalSave } from './institutional.js';
import { validMoonshotSave } from './moonshot.js';
import { validScenarioSave } from './scenarios.js';
import { validIntegrationSave, validWorkshopSave, normalizeMinigameSave } from './integration.js';
import { validReplayAccess, normalizeReplayAccess, validSnakeIntro, normalizeSnakeIntro } from './replay-access.js';
import { validPendingMemo } from './world.js';
import { validResaleSave } from './resale.js';
import { normalizeLanternSave } from './lantern-retirement.js';

const int = n => Number.isSafeInteger(n);
const GPU = ['H100', 'H200', 'B200'];
// V10.15 save validation: a damaged or foreign save is preserved and never half-loaded.
export function validSave(g,{legacyMinigames=false}={}) {
  const a = g?.arcade, c = g?.company, L = a?.ledger;
  if(!validExtension(g) || !validSnakeIntro(g))return false;
  if (typeof c?.name !== 'string' || (c.name && nameError(c.name))) return false;
  if (!(a?.version === V7.version && int(a.rev) && a.rev >= 0 && ['floor', 'integration', 'report', 'extension', 'over'].includes(g.phase) && int(g.q) && g.q > 0 && g.q <= campaignLimit(g))) return false;
  if (![g.cash, g.profit, g.clout, a.time].every(Number.isFinite) || g.cash < 0 || !g.firms || typeof g.firms !== 'object') return false;
  if (!['lots', 'inventory', 'purchases', 'buyers', 'sales', 'receipts', 'history', 'objectives', 'reservations', 'built', 'terms'].every(k => Array.isArray(a[k]))) return false;
  if (!L || !['workshops', 'raised', 'revenue', 'contracts', 'resale', 'purchases', 'burn', 'research', 'capex', 'penalties', 'expired'].every(k => int(L[k]) && L[k] >= 0)) return false;
  const initialCash=a.initialCash ?? 6500000;
  if(!int(initialCash) || initialCash<=0)return false;
  if (initialCash + L.raised + L.revenue + L.contracts + L.resale + L.workshops - L.purchases - L.burn - L.research - L.capex - L.penalties !== Math.round(g.cash * 100)) return false;
  if (!c || !int(c.level) || c.level < 0 || c.level > 7 || !int(c.shares?.founder) || c.shares.founder <= 0 || !Array.isArray(c.shares.investors) || !c.shares.investors.every(i => int(i.shares) && i.shares > 0 && int(i.paid) && i.paid >= 0)) return false;
  if (c.shares.investors.reduce((n, i) => n + i.paid, 0) !== L.raised || c.raised !== L.raised) return false;
  if (!['products', 'racks', 'builds'].every(k => Array.isArray(c[k])) || !c.builds.every(b => typeof b.id === 'string' && b.online >= 0 && b.online <= 1)) return false;
  if (new Set(c.builds.map(b => b.id)).size !== c.builds.length || new Set(a.objectives.map(o => o.id)).size !== a.objectives.length) return false;
  if (['product', 'research', 'infra', 'opportunity'].some(lane => a.objectives.filter(o => o.lane === lane && o.status === 'open').length > 1)) return false;
  if (c.builds.some(b => b.catalog != null && typeof b.catalog !== 'string')) return false;
  if (!a.inventory.every(x => typeof x.id === 'string' && GPU.includes(x.gpu) && int(x.left) && int(x.qty) && x.left >= 0 && x.left <= x.qty && int(x.unitCost) && x.unitCost >= 0)) return false;
  // No unit in two places: reservations never exceed what a lot still holds, nor a card's recipe.
  if (!a.reservations.every(r => int(r.qty) && r.qty > 0 && a.inventory.some(x => x.id === r.inv && x.gpu === r.gpu) && a.objectives.some(o => o.id === r.card && o.status === 'open'))) return false;
  if (!a.inventory.every(x => a.reservations.filter(r => r.inv === x.id).reduce((n, r) => n + r.qty, 0) <= x.left)) return false;
  if (!a.objectives.every(o => typeof o.id === 'string' && o.recipe && GPU.every(k => o.recipe[k] === undefined || (int(o.recipe[k]) && o.recipe[k] > 0)) && a.reservations.filter(r => r.card === o.id).every(r => o.recipe[r.gpu]) &&
    GPU.every(k => a.reservations.filter(r => r.card === o.id && r.gpu === k).reduce((n, r) => n + r.qty, 0) <= (o.recipe[k] || 0)))) return false;
  if (!a.lots.every(l => typeof l.id === 'string' && int(l.qty) && l.qty > 0 && Number.isFinite(l.ask) && Number.isFinite(l.floor) && l.floor > 0 && l.ask >= l.floor && ['open', 'sold', 'expired', 'walked'].includes(l.status) &&
    (!l.negotiation || (Array.isArray(l.negotiation.attempts) && l.negotiation.attempts.length <= 3 && int(l.negotiation.patience) && l.negotiation.patience >= 0 && Number.isFinite(l.negotiation.price) && l.negotiation.price >= l.floor && l.negotiation.price <= l.ask)))) return false;
  if (!a.buyers.every(b => int(b.initialBudget) && int(b.budget) && b.budget >= 0 && b.budget <= b.initialBudget && int(b.qty) && int(b.filled) && b.filled >= 0 && b.filled <= b.qty && int(b.rate) && b.rate > 0 && b.rate <= b.ceiling && b.negotiation && int(b.negotiation.counters) && b.negotiation.counters <= 2)) return false;
  if (!a.terms.every(t => int(t.amount) && t.amount > 0 && int(t.pct) && t.pct > 0 && t.pct < 10000 && ['open', 'signed', 'walked', 'declined', 'expired', 'withdrawn'].includes(t.status))) return false;
  if (a.active !== null && !a.lots.some(l => l.id === a.active && l.negotiation)) return false;
  const w = g.world;
  for (const b of a.buyers) {
    const n = b.negotiation;
    if (n.attempts && (!Array.isArray(n.attempts) || n.attempts.length > 3 || !int(n.lockedQty) || n.lockedQty < 1 || n.lockedQty > b.qty || n.attempts.some((e, i) =>
      !e.params || e.params.attempt !== i + 1 || !['running', 'resolved'].includes(e.status) ||
      !['width', 'speed', 'phase', 'timeCost', 'concession'].every(k => Number.isFinite(e.params[k])) ||
      e.params.width <= 0 || e.params.width > 1 || e.params.speed <= 0 ||
      !e.stakes || e.stakes.qty !== n.lockedQty || !int(e.stakes.cap) || e.stakes.cap > b.ceiling ||
      (e.status === 'running' ? n.running !== i + 1 : !Number.isFinite(e.position) || e.position < 0 || e.position > 1)))) return false;
    if (n.running && (n.running !== n.attempts?.length || n.attempts.at(-1).status !== 'running' || a.confirm?.buyerId !== b.id || a.signing)) return false;
  }
  if (!w || typeof w !== 'object' || !['flags', 'seen', 'inv'].every(k => w[k] && typeof w[k] === 'object' && !Array.isArray(w[k])) || !['due', 'spawns', 'sentiment', 'exitMods', 'news', 'log'].every(k => Array.isArray(w[k]))) return false;
  if (w.vulture !== undefined && (!w.vulture || !int(w.vulture.offers) || w.vulture.offers < 0 || w.vulture.offers > 2 || !int(w.vulture.attemptQ) || w.vulture.attemptQ < 1 || w.vulture.attemptQ > g.q)) return false;
  if (a.terms.filter(t => t.vulture).length > 1 || a.terms.some(t => t.vulture && (t.id !== `q${g.phase === 'report' ? g.q - 1 : g.q}-vulture` || t.pct < 4000 || t.pct > 4900 || typeof t.cardId !== 'string' || !w.vulture?.offers))) return false;
  if (w.memo !== null && !(g.phase === 'report' && validPendingMemo(w.memo))) return false;
  if (!c.mods || !['revenue', 'burn', 'prepaid'].every(k => Array.isArray(c.mods[k]))) return false;
  if (c.mods.tech !== null && !(typeof c.mods.tech === 'object' && Number.isFinite(c.mods.tech.mult) && c.mods.tech.mult > 0 && c.mods.tech.mult <= 1 && int(c.mods.tech.until))) return false;
  // V10.15: scale, integration bonuses (capped), grades, the AGI outcome, sourcing orders this round.
  if (![1, 2, 3].includes(c.scale) || !c.ops || !['serving', 'research', 'readiness'].every(k => Number.isFinite(c.ops[k]) && c.ops[k] >= 0 && c.ops[k] <= FOUNDER.ops.cap[k] + 1e-9)) return false;
  if (!Array.isArray(c.grades) || c.grades.length > campaignLimit(g) || !c.grades.every(x => int(x.q) && ['S', 'A', 'B', 'C', 'CREW'].includes(x.grade) && x.gains && typeof x.gains === 'object')) return false;
  if (c.agi !== null && !(typeof c.agi === 'object' && ['agi', 'partial', 'failure'].includes(c.agi.outcome) && int(c.agi.tech) && c.agi.tech >= 0 && c.builds.some(b => b.id === c.agi.build && b.kind === 'agi'))) return false;
  if (c.builds.filter(b => b.kind === 'agi').length > 1 || a.sourced !== undefined && !(int(a.sourced) && a.sourced >= 0 && a.sourced <= 3)) return false;
  // V10.17.3: research IP (benchmarks, exceeded and breakthrough runs) is a non-negative cent amount.
  if (c.ip !== undefined && !(int(c.ip) && c.ip >= 0)) return false;
  // V10.17.3: execution quality from a voluntary early bell (0 on a timeout), capped.
  if (a.exec !== undefined && !(Number.isFinite(a.exec) && a.exec >= 0 && a.exec <= EXECUTION.cap + 1e-9)) return false;
  // V10.17.3: each resolved outcome is one of four tiers with a bounded size and quality (set once, never rerolled).
  const top = OUTCOME.breakthrough.mult + OUTCOME.breakthrough.q * OUTCOME.max + 1e-9, inQ = x => Number.isFinite(x) && x >= OUTCOME.min - 1e-9 && x <= OUTCOME.max + 1e-9;
  if (!c.builds.every(b => (b.outcome === undefined || b.outcome && OUTCOME_NAMES[b.outcome.tier] && Number.isFinite(b.outcome.mult) && b.outcome.mult >= OUTCOME.under.mult - 1e-9 && b.outcome.mult <= top && inQ(b.outcome.q)) &&
    (b.exec === undefined || Number.isFinite(b.exec) && b.exec >= 0 && b.exec <= EXECUTION.cap + 1e-9) && (b.quality === undefined || inQ(b.quality)))) return false;
  // V10.17.3: a repeat allocation a block house holds for you: one GPU type, its size, the negotiated rate, the round earned.
  if (!Object.values(g.firms || {}).every(f => f?.lock === undefined || f.lock && GPU.includes(f.lock.gpu) && int(f.lock.qty) && f.lock.qty > 0 && int(f.lock.rate) && f.lock.rate > 0 && int(f.lock.q) && f.lock.q >= 1 && f.lock.q <= campaignLimit(g))) return false;
  // V10.17.3 commercial terms, grants and specialties must survive round trips intact.
  if (!Array.isArray(c.team) || c.team.length > 3 || new Set(c.team.map(h=>h.id)).size !== c.team.length || !c.team.every(h=>HIRES.some(x=>x.id===h.id) && Number.isFinite(h.effect) && h.effect>=.5 && h.effect<=1.3 && c.builds.some(b=>b.id===h.build && b.reward.hire===h.id && b.commerceApplied))) return false;
  if (!Array.isArray(c.specialties) || new Set(c.specialties).size !== c.specialties.length || !c.specialties.every(x=>['efficiency','margin','research','quality','ip'].includes(x) && c.builds.some(b=>b.reward.specialty===x && b.commerceApplied))) return false;
  const commercial = x => x === undefined || x && ['cost','growth','risk'].every(k=>Number.isFinite(x[k]) && x[k]>=0 && x[k]<=.5);
  if (!c.products.every(p=>int(p.revenue)&&p.revenue>=0&&commercial(p.commercial)) || !c.builds.every(b=>commercial(b.commercial) && (!b.business || BUSINESSES.some(x=>x[0]===b.business) && int(b.stage) && b.stage>=0 && b.stage<4) && (b.cashCost===undefined || int(b.cashCost)&&b.cashCost>=0) && (b.pilotResult===undefined || ['customer','failed'].includes(b.pilotResult)))) return false;
  if (!c.team.every(h=>{const spec=HIRES.find(x=>x.id===h.id); const grants=c.shares.investors.filter(i=>i.hire===h.build); return grants.length===(spec.equity ? 1 : 0) && grants.every(i=>i.paid===0 && i.kind==='leadership');})) return false;
  if (typeof c.researchClosed !== 'boolean' || !c.products.every(p => p.lost === undefined || p.lost === true)) return false;
  if (g.phase === 'over' && !['exit', 'shutdown', 'acquired'].includes(a.ending)) return false;
  // New AGI commitments snapshot their scale-dependent terms; old saves keep fixed terms.
  for (const b of [...a.objectives, ...c.builds]) if (b.agiStakes !== undefined) {
    const s = b.agiStakes, A = FOUNDER.agi;
    if (b.kind !== 'agi' || !s || !['capital','tech','partialTech','failBurn'].every(k => int(s[k]) && s[k] >= 0) || s.capital !== b.cashCost || s.capital < A.capital || s.tech !== Math.max(A.tech, s.capital * 8) || s.partialTech !== Math.max(A.partialTech, s.capital * 3) || s.failBurn !== Math.max(A.failBurn, Math.round(s.capital * .15))) return false;
  }
  if (!validIntegrationSave(g,{legacy:legacyMinigames}) || !validWorkshopSave(g,{legacy:legacyMinigames}) || !validReplayAccess(g,{legacy:legacyMinigames})) return false;
  if (!validResaleSave(g)) return false;
  if (!['floor', 'integration'].includes(g.phase) && a.history.length === 0) return false;
  if (g.phase === 'over' && !a.exit) return false;
  return validCommerce(g) && validStrategicSave(g) && validInstitutionalSave(g) && validMoonshotSave(g) && validScenarioSave(g);
}

// All mutations, including elapsed floor time, are committed synchronously. Another
// tab's revision blocks this tab before it can spend, deliver, or resolve an attempt.
export function arcadeStore(storage) {
  let state = null, raw = null, error = '', retiredFinal = null;
  try {
    raw = storage.getItem(V7.key);
    if (raw) {
      state = JSON.parse(raw);
      if (!validSave(state,{legacyMinigames:true})) throw Error('Unsupported or damaged V7 save');
    }
  } catch { state = null; error = 'Cannot read this V21 save. It has been preserved. Restore a valid save or clear only hsc-tycoon-preview-v21-2-polish in browser storage. Earlier ten-round saves are unchanged.'; }
  function commit(next) {
    if (error) return false;
    try {
      if (storage.getItem(V7.key) !== raw) { error = 'Another tab changed this run. Reload this tab to continue from the latest save.'; return false; }
      next.arcade.rev++;
      const encoded = JSON.stringify(next);
      storage.setItem(V7.key, encoded);
      raw = encoded; state = next; return true;
    } catch { error = 'Saving is unavailable. Trading is paused to protect your progress. Free browser storage and reload.'; return false; }
  }
  if (state && !error) {
    const next=structuredClone(state),oldFinal=state.phase==='over' && state.arcade.ending!=='acquired'?state.arcade.exit?.payout:null;
    const continuationChanged=normalizeExtension(next),snakeChanged=normalizeSnakeIntro(next),retiredChanged=normalizeLanternSave(next),accessChanged=normalizeReplayAccess(next),gameChanged=normalizeMinigameSave(next),progressChanged=normalizeOrdinaryProgress(next);
    if (continuationChanged || snakeChanged || retiredChanged || accessChanged || gameChanged || progressChanged) {
      if (!validSave(next)) error='Cannot safely resume this minigame save. It has been preserved; trading is paused.';
      else if(commit(next) && retiredChanged && Number.isSafeInteger(oldFinal) && oldFinal!==next.arcade.exit?.payout)retiredFinal=Object.freeze({seed:next.seed,oldPayout:oldFinal,newPayout:next.arcade.exit.payout});
    } else if (!validSave(state)) error='Cannot safely resume this minigame save. It has been preserved; trading is paused.';
  }
  return {
    get state() { return state; }, get error() { return error; }, get retiredFinal() {return retiredFinal;},
    start(seed, name, options) { return !state && !nameError(name) && commit(createArcade(seed, cleanName(name), options)); },
    restart(seed, name, options) { return !nameError(name) && commit(createArcade(seed, cleanName(name), options)); },
    act(fn) {
      if (!state || error) return false;
      const next = structuredClone(state);
      if (!fn(next)) return false;
      return commit(next);
    },
  };
}
