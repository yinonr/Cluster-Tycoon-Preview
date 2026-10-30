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
  const a=g?.arcade,available=!!(unlocked && betweenRounds && Number.isSafeInteger(round) && round===g.q-1 && round>=1 && round<5 &&
    !a.active && !a.confirm && !a.signing && !a.workshop);
  return {unlocked,betweenRounds,available,round,reason:!unlocked?'locked':!betweenRounds?'between-rounds-only':available?'ready':'busy'};
}
export function gameLaunchAllowed(g,kind,training=false) {
  const a=g?.arcade;
  if (g?.phase!=='integration' || !a) return false;
  if (training) return a.practice===true && a.integration?.training===true && a.integration.kind===kind;
  if (!replayAvailable(g,kind)) return false;
  if (a.workshop) return a.workshop.kind===kind && a.workshop.returnPhase==='report' && a.workshop.q===completedRound(g) && g.q===a.workshop.q+1 &&
    a.workshop.q<5 && a.integration?.kind===kind && a.integration.workshop===true;
  return a.bellIntegration?.q===g.q && a.bellIntegration.kind===kind &&
    !!g.company?.builds?.some(b=>b.status==='integrating');
}
export function gameSessionAllowed(g,kind) {
  const field={node:'tetris',cable:'cable',kernel:'kernel'}[kind],board=g?.arcade?.[field];
  return !!board && gameLaunchAllowed(g,kind,board.training===true);
}
export function unlockBuiltGames(g,b,previous) {
  const access=contextualUnlocks(g),earned=['node','cable'].filter(k=>access[k] && !previous[k]);
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
