import { V7 } from './arcade.js';
import { validSave } from './arcade-store.js';
import { createTraining, validTraining, trainingAction, upgradeTraining } from './training.js';
import { normalizeReplayAccess } from './replay-access.js';

export const TRAINING_KEY = `${V7.key}-training`;
const empty = () => ({version:1,rev:0,completed:false,session:null});
const valid = p => p?.version===1 && Number.isSafeInteger(p.rev) && p.rev>=0 && typeof p.completed==='boolean' && (p.session===null || validTraining(p.session));

// Completion and the active lesson are one atomic record. Campaign storage is
// never read, copied, reset or written by this store, including during replay.
export function trainingStore(storage) {
  let profile=empty(), raw=null, error='', migrated=false;
  try {
    raw=storage.getItem(TRAINING_KEY);
    if (raw!==null) {
      profile=JSON.parse(raw);
      if (profile?.session?.version===1) {profile.session=upgradeTraining(profile.session);migrated=true;}
      if (profile?.session?.practice?.arcade && normalizeReplayAccess(profile.session.practice)) migrated=true;
      if (!valid(profile)) throw Error('Invalid training save');
    }
  } catch { profile=empty(); error='Cannot read this training save. It has been preserved. Your campaign save is unchanged.'; }
  function commit(next) {
    if (error || !valid(next)) return false;
    try {
      if (storage.getItem(TRAINING_KEY)!==raw) { error='Another tab changed training. Reload this tab to continue.'; return false; }
      next.rev++;
      const encoded=JSON.stringify(next);
      storage.setItem(TRAINING_KEY,encoded); raw=encoded; profile=next;
      return true;
    } catch { error='Training could not be saved. Free browser storage and reload to protect your progress.'; return false; }
  }
  const api={
    get state() {return profile.session;}, get completed() {return profile.completed;}, get error() {return error;},
    begin(seed,name,options={}) {
      if (profile.session || error) return false;
      const next=structuredClone(profile);
      try {next.session=createTraining(seed,name,options);} catch {return false;}
      return commit(next);
    },
    act(fn) {
      if (!profile.session || profile.session.launchPending || error) return false;
      const next=structuredClone(profile);
      if (!fn(next.session)) return false;
      return commit(next);
    },
    prepareFinish(mainState=null) {
      if (!profile.session || profile.session.replay || error) return false;
      if (profile.session.launchPending) return true;
      try {
        if (mainState!==null && !validSave(mainState)) return false;
        const from=JSON.stringify(mainState);
        if (from.length>4000000) return false;
        const next=structuredClone(profile);
        next.session.launchPending=true; next.session.launchFrom=from;
        return commit(next);
      } catch {return false;}
    },
    finish() {
      if (!profile.session || error) return false;
      const next=structuredClone(profile); next.session=null; next.completed=true;
      return commit(next);
    },
  };
  if (migrated && !error) commit(structuredClone(profile));
  // Reloading a running practice Charm settles the real interrupted attempt,
  // then grants the explicitly free friendly retry. Signed receipts stay put.
  if (profile.session?.practice.arcade.active && !error) api.act(t=>trainingAction(t,'recover'));
  return api;
}
