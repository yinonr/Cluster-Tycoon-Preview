import { integrationBuilds } from './founder.js';
import { campaignLimit } from './extension.js';
// Learned play access is independent of the company's operational deployment.
// It never changes tier selection, production, equity or either reward record.
export const campaignReplayAccess = () => ({version:2,node:false,cable:false,kernel:false});
export function validReplayAccess(g,{legacy=false}={}) {
  const r=g?.arcade?.replays;
  if (r===undefined) return true;
  if (!r || ![2,...(legacy?[1]:[])].includes(r.version) || !['node','cable','kernel'].every(k=>typeof r[k]==='boolean')) return false;
  return r.version===1 || ['node','cable','kernel'].every(k=>!r[k] || replayAvailable(g,k));
}
const consumed = b => b?.recipe && Object.values(b.recipe).some(n=>Number.isSafeInteger(n) && n>0);
export const replayAvailable = (g,kind) => {
  if (!g?.arcade || !['node','cable','kernel'].includes(kind)) return false;
  if (kind==='kernel') return !!(g.company?.deploy?.milestones?.cluster || g.company?.deploy?.milestones?.fleet);
  return !!g.company?.builds?.some(b=>consumed(b) && (kind==='node' || b.lane==='infra' || b.reward?.rack));
};
export const contextualUnlocks = g => Object.fromEntries(['node','cable','kernel'].map(k=>[k,replayAvailable(g,k)]));
export const completedRound = g => g?.arcade?.history?.at(-1)?.q || null;
export const minigameRound = g => g?.arcade?.workshop?.q || g.q;
export function minigameEligibility(g,kind) {
  const unlocked=replayAvailable(g,kind),betweenRounds=g?.phase==='report',round=betweenRounds?completedRound(g):null;
  const a=g?.arcade,available=!!(unlocked && betweenRounds && Number.isSafeInteger(round) && round===g.q-1 && round>=1 && round<campaignLimit(g) &&
    !a.active && !a.confirm && !a.signing && !a.workshop && !a.snakeIntro?.pending);
  return {unlocked,betweenRounds,available,round,reason:!unlocked?'locked':!betweenRounds?'between-rounds-only':available?'ready':'busy'};
}
export function gameLaunchAllowed(g,kind,training=false) {
  const a=g?.arcade;
  if (g?.phase!=='integration' || !a) return false;
  if (training) return a.practice===true && a.integration?.training===true && a.integration.kind===kind;
  // Free-play workshops still require an earned unlock. A real deployment does
  // not: the player earns its minigame by committing GPUs to the build.
  if (a.workshop) return replayAvailable(g,kind) && a.workshop.kind===kind && a.workshop.returnPhase==='report' && a.workshop.q===completedRound(g) && g.q===a.workshop.q+1 &&
    a.workshop.q<campaignLimit(g) && a.integration?.kind===kind && a.integration.workshop===true;
  return a.bellIntegration?.q===g.q && a.bellIntegration.kind===kind &&
    integrationBuilds(g).length>0;
}
export function gameSessionAllowed(g,kind) {
  const field={node:'tetris',cable:'cable',kernel:'kernel'}[kind],board=g?.arcade?.[field];
  return !!board && gameLaunchAllowed(g,kind,board.training===true);
}
export function unlockBuiltGames(g,b,previous) {
  const access=contextualUnlocks(g),earned=['node','cable','kernel'].filter(k=>access[k] && !previous[k]);
  if (!earned.length) return;
  g.arcade.replays={version:2,...access};b.replayUnlocks=earned;
}
export function normalizeReplayAccess(g) {
  const earned=contextualUnlocks(g),r=g.arcade.replays;
  if (r?.version===2 && ['node','cable','kernel'].every(k=>r[k]===earned[k])) return false;
  g.arcade.replays={version:2,...earned};
  return true;
}
// Older callers cannot turn completion preferences into campaign achievements.
export function grantTrainingReplays() {
  return false;
}
export const migrateLearnedAccess = () => false;

// Practice and campaign introductions have independent state. Unlock alone is
// not evidence that an older save has already played the campaign game.
export function normalizeSnakeIntro(g) {
  const a=g?.arcade;
  if(a?.snakeIntro?.pending && !a.practice) {a.snakeIntro.pending=false;a.snakeIntro.q=null;return true;}
  if(!a || a.snakeIntro!==undefined)return false;
  const played=!a.practice && replayAvailable(g,'kernel') && (!!(a.kernel && !a.kernel.training) || a.workshopResult?.kind==='kernel' ||
    a.history?.some(h=>h.puzzle?.kind==='kernel' && h.puzzle.reason!=='crew-locked'));
  a.snakeIntro={version:1,seen:!!played,pending:false,q:null};return true;
}
export function validSnakeIntro(g) {
  const a=g?.arcade,s=a?.snakeIntro;
  if(!a)return false;
  if(s===undefined)return true;
  if(!s || s.version!==1 || typeof s.seen!=='boolean' || typeof s.pending!=='boolean' ||
    !(s.q===null || Number.isSafeInteger(s.q) && s.q>=1 && s.q<=10))return false;
  if(s.pending && (a.practice || s.seen || g.phase!=='report' || s.q!==completedRound(g) || g.q!==s.q+1 ||
    !replayAvailable(g,'kernel') || a.workshop || a.active || a.confirm || a.signing))return false;
  if(a.practice && (s.seen || s.pending))return false;
  if(s.seen && !replayAvailable(g,'kernel'))return false;
  return true;
}
