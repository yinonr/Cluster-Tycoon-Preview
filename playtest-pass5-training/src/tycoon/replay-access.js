// Learned play access is independent of the company's operational deployment.
// It never changes tier selection, production, equity or either reward record.
export const learnedReplays = () => ({version:1,node:true,cable:true,kernel:true});
export const validReplayAccess = g => g?.arcade?.replays===undefined || !!(g.arcade.replays &&
  g.arcade.replays.version===1 && ['node','cable','kernel'].every(k=>typeof g.arcade.replays[k]==='boolean'));
export const replayAvailable = (g,kind) => !!g?.arcade && (['node','cable'].includes(kind) || kind==='kernel' &&
  !!(g.arcade.replays?.kernel || g.company?.deploy?.milestones?.cluster || g.company?.deploy?.milestones?.fleet));
export const contextualUnlocks = g => Object.fromEntries(['node','cable','kernel'].map(k=>[k,replayAvailable(g,k)]));
export function grantTrainingReplays(g) {
  if (!g?.arcade || ['node','cable','kernel'].every(k=>g.arcade.replays?.[k]===true)) return false;
  g.arcade.replays=learnedReplays();
  return true;
}
export const migrateLearnedAccess = (store,completed) => !!completed && !!store.state && !store.error && store.act(grantTrainingReplays);
