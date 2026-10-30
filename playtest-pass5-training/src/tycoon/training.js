import { puzzleInput } from './tetris.js';
import { cableInput } from './cable.js';
// Babur's training company is a separate, disposable company. Purchases, signing,
// reservations, building and both puzzles use the production engine. No practice
// balance, hardware, grade or reward is ever copied into the five-round company.
import { createArcade, claim, activeLot, cash, ledgerCash } from './arcade.js';
import { validSave } from './arcade-store.js';
import { fill, heldFor, build, integrate, updateScale, expansionCapital, FOUNDER, normalizeOrdinaryProgress } from './founder.js';
import { normalizeLanternSave } from './lantern-retirement.js';
import { postReceipt } from './pit-transactions.js';
import { recoverRizz } from './rizz.js';
import { GAMES, clearIntegration, integrationOutcome, recordDeployment, snakeAvailable } from './integration.js';
import { nameError } from './startup-name.js';
import { reviewTerm } from './investors.js';
import { prepareSigning, signTrade } from './arcade-signing.js';
import { ASK } from './founder-market.js';
import { rackNodes } from './cable.js';
import { normalizeExtension } from './extension.js';
import { normalizeSnakeIntro } from './replay-access.js';

export const TRAINING_VERSION = 3;
export const TRAINING_STEPS = Object.freeze(['meet','h100','h200','model','node','network','cable','funding','large','snake','ready']);
export const TRAINING_MODEL_CARD = 'practice-model';
export const TRAINING_CARD = 'practice-infra';
export const TRAINING_NETWORK_LOT = 'practice-network-h100';
export const TRAINING_LOTS = Object.freeze({H100:'practice-h100',H200:'practice-h200'});
export const TRAINING_INFRA_COST = 500000;
export const TRAINING_FUND_AMOUNT = 200000000;
export const TRAINING_FUND_PCT = 3333;
export const TRAINING_FUND_NAME = 'Aster Sovereign AI Fund';
export const TRAINING_FUND_ID = 'practice-sovereign';
export const TRAINING_LARGE_CARD = 'practice-cluster';
export const TRAINING_LARGE_LOT = 'practice-block';
export const TRAINING_LARGE_RECIPE = Object.freeze({H100:48});
const recipe = () => ({H100:1,H200:1});
const expectedGpu = t => ({h100:'H100',h200:'H200',network:'H100',large:'H100'})[t.step];
const cardOf = t => t.practice.arcade.objectives.find(o => o.id === TRAINING_CARD);

export function createTraining(seed, name, {replay = false} = {}) {
  const g = createArcade(seed, name, {scenarios:false}), a = g.arcade;
  a.practice = true;
  a.lots = ['H100','H200'].map((gpu,i) => ({id:TRAINING_LOTS[gpu],slot:i,firm:'Babur Training Supply',
    gpu,qty:1,ask:[245,319][i],floor:[215,279][i],at:0,until:a.seconds,cooldown:0,status:'open',negotiation:null}));
  a.objectives = [{id:TRAINING_MODEL_CARD,lane:'research',tier:1,name:'Your first model',
    blurb:'Build the model, then integrate its H100 and H200 nodes.',recipe:recipe(),mixed:true,
    reward:{level:1},cashCost:0,q:1,status:'open'}];
  a.buyers=[]; a.terms=[]; a.news=[]; a.message=null;
  return {version:TRAINING_VERSION,seed,name,replay:!!replay,step:'meet',practice:g,
    nodeDone:false,cableDone:false,buildId:null,lastCharm:null,charmed:{H100:false,H200:false},launchPending:false,launchFrom:null,
    funded:false,largePurchased:false,largeBuildId:null,snakeDone:false,modelBuildId:null,networkPurchased:false};
}

function networkProject(t) {
  const a=t.practice.arcade;
  if(!a.lots.some(l=>l.id===TRAINING_NETWORK_LOT))a.lots.push({id:TRAINING_NETWORK_LOT,slot:2,firm:'Babur Training Supply',
    gpu:'H100',qty:2,ask:235,floor:235,at:0,until:a.seconds,cooldown:0,status:'open',negotiation:null});
  if(!a.objectives.some(o=>o.id===TRAINING_CARD))a.objectives.push({id:TRAINING_CARD,lane:'infra',tier:1,name:'Connect a starter network',
    blurb:'Purchase two H100 nodes, build their network, then connect the switch.',recipe:{H100:2},mixed:false,cluster:true,
    reward:{rack:{gpu:'H100',qty:2}},cashCost:TRAINING_INFRA_COST,q:1,status:'open'});
}

function fundingOffer(t) {
  const a=t.practice.arcade;
  if (a.terms.some(x=>x.id===TRAINING_FUND_ID)) return;
  // Aster is the game's fictional sovereign fund. Its practice cash-for-equity
  // sheet uses real shares/signing, without the ordinary R9 research mandate.
  a.terms=[{id:TRAINING_FUND_ID,kind:'strategic',name:TRAINING_FUND_NAME,label:'Sovereign fund · practice',
    amount:TRAINING_FUND_AMOUNT,pct:TRAINING_FUND_PCT,openingPct:TRAINING_FUND_PCT,floorPct:TRAINING_FUND_PCT,
    patience:0,at:0,until:a.seconds,status:'open',valuation:TRAINING_FUND_AMOUNT*2,
    pitch:'Practice a large investment: cash for newly issued company shares.',
    conditions:'Practice only. The investment, ownership change and hardware return with the practice company before round 1. No continuing mandate.',
    tape:[{speaker:TRAINING_FUND_NAME,text:'$2,000,000 for 33.33% of this practice company.'}]}];
}

function largeProject(t) {
  const g=t.practice,a=g.arcade;
  updateScale(g);
  if (!a.lots.some(l=>l.id===TRAINING_LARGE_LOT)) a.lots.push({id:TRAINING_LARGE_LOT,slot:2,firm:'Babur Training Supply',
    gpu:'H100',qty:48,ask:ASK.H100,floor:ASK.H100,at:0,until:a.seconds,cooldown:0,status:'open',negotiation:null,block:true});
  if (!a.objectives.some(o=>o.id===TRAINING_LARGE_CARD)) {
    a.objectives=a.objectives.filter(o=>o.lane!=='infra' || o.status!=='open');
    a.objectives.push({id:TRAINING_LARGE_CARD,lane:'infra',tier:2,name:'Practice 48-GPU cluster',
      blurb:'Use the new capital to put 48 H100s into productive infrastructure.',recipe:{...TRAINING_LARGE_RECIPE},mixed:false,
      reward:{rack:{gpu:'H100',qty:48}},cashCost:expansionCapital(g,TRAINING_LARGE_RECIPE),q:1,status:'open'});
  }
}

// Preserve ongoing work from the first local Pass 5 implementation. A completed
// old lesson continues into its new funding beat; an already recorded launch
// intent must finish its original durable handoff instead of being rolled back.
export function upgradeTraining(previous) {
  if (![1,2].includes(previous?.version)) return previous;
  const t=structuredClone(previous);
  if(t.version===1) {
    Object.assign(t,{funded:false,largePurchased:false,largeBuildId:null,snakeDone:false});
    if (t.launchPending) t.legacyHandoff=true;
    else if (t.step==='ready') {t.step='funding';fundingOffer(t);}
  }
  // Before Node, only the two identical purchase contracts have happened.
  // Adopt the new model lesson without changing cash, stock or signed receipts.
  const early=['meet','h100','h200'].includes(t.step) && !t.launchPending && !t.practice.company.builds.length && !t.practice.arcade.reservations.length;
  Object.assign(t,{version:TRAINING_VERSION,legacySequence:!early,modelBuildId:null,networkPurchased:false});
  if(early) {
    const card=createTraining(t.seed,t.name).practice.arcade.objectives[0];
    t.practice.arcade.objectives=t.practice.arcade.objectives.map(o=>o.id===TRAINING_CARD?card:o);
    // An old H100 meter cannot remain running behind the new signing-only UI.
    // Cancelling an unresolved attempt changes no price, inventory or rewards.
    const lot=t.practice.arcade.lots.find(l=>l.id===TRAINING_LOTS.H100),n=lot?.negotiation;
    if(n?.running) {n.attempts=n.attempts.filter(a=>a.status!=='running');n.running=null;}
    if(t.step==='h100')t.lastCharm=null;
  }
  // Later rack-planning lessons retain their actual original assets/sequence.
  if(t.step==='h200' && (t.practice.arcade.signing || t.practice.arcade.confirm?.receipt))t.charmed.H200=true;
  return t;
}

export const canonicalRoundOne = t => createArcade(t.seed,t.name);

// Apply the same save migrations to both sides of a handoff comparison. These
// operate on copies only; unrelated economic and progression changes still conflict.
function normalizeHandoffCopy(g) {
  if (!g) return g;
  normalizeLanternSave(g);
  normalizeOrdinaryProgress(g);
  normalizeExtension(g);
  normalizeSnakeIntro(g);
  if (g.arcade) { delete g.arcade.replays; g.arcade.rev=0; g.arcade.initialCash ??=6500000; }
  return g;
}

const handoffJSON = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k,v[k]])) : v);

// Restart increments a storage revision; every economic/progression field must
// still match the full canonical company. An unrelated tab's progress is never
// mistaken for a launch to overwrite or for a completed training handoff.
// An older first-time launch could have committed its pristine $65k company
// before the next deployment. Recognize only that untouched target; never rebuild
// it with new economics or accept any elapsed/traded/owned campaign progress.
function pristineLegacyLaunch(t,g) {
  if(t.launchTarget || t.launchFrom!=='null' || !g || !validSave(g) || g.seed!==t.seed || g.company.name!==t.name || g.q!==1 || g.phase!=='floor')return false;
  const a=g.arcade,c=g.company;
  if(a.practice || (a.initialCash??6500000)!==6500000 || g.cash!==65000 || a.time!==0 || g.profit!==0 || g.clout!==0 || Object.keys(g.firms).length)return false;
  if(a.active || a.confirm || a.signing || a.exit || a.ending || a.workshop || a.workshopResult || a.snakeIntro?.seen || a.snakeIntro?.pending)return false;
  if(a.message?.text!=='Round 1 of 5. Buy the GPUs your company needs, then build.' || a.message?.tone!=='plain')return false;
  if(Object.values(a.ledger).some(n=>n!==0) || ['history','receipts','inventory','purchases','sales','reservations','built'].some(k=>a[k]?.length))return false;
  if(a.lots.some(l=>l.status!=='open'||l.negotiation) || a.objectives.some(o=>o.status!=='open') || a.terms.some(x=>x.status!=='open'))return false;
  if(c.level!==0 || c.builds.length || c.racks.length || c.products.length || c.shares.investors.length || c.shutdown || c.deploy)return false;
  const canonical=canonicalRoundOne(t).company;
  return c.shares.founder===canonical.shares.founder && c.shares.pool===canonical.shares.pool;
}

export function trainingHandoffStatus(t, main) {
  if (!t?.launchPending || t.replay) return 'none';
  if (pristineLegacyLaunch(t,main)) return 'complete';
  if (main) {
    const copy=normalizeHandoffCopy(structuredClone(main));
    // A pending launch from the earlier local pass may have committed the same
    // canonical resources before learned-access metadata existed. Its handoff
    // may finish after granting access; no company deployment is copied.
    const canonical=normalizeHandoffCopy(t.launchTarget ? JSON.parse(t.launchTarget) : canonicalRoundOne(t));
    if (handoffJSON(copy)===handoffJSON(canonical)) return 'complete';
  }
  try {
    const current=normalizeHandoffCopy(main?structuredClone(main):null),previous=normalizeHandoffCopy(JSON.parse(t.launchFrom));
    return handoffJSON(current)===handoffJSON(previous) ? 'retry' : 'conflict';
  } catch {return 'conflict';}
}

// Call through trainingStore.act. A practice facade can wrap every existing
// broker/game callback here, retaining the real controls and saved engine state.
export function trainingMutate(t, fn) {
  if (!t || t.launchPending || typeof fn !== 'function') return false;
  const g=t.practice, before={firms:structuredClone(g.firms),clout:g.clout,attempts:activeLot(t.practice)?.negotiation?.attempts.length || 0};
  if (!fn(g)) return false;
  // The floor never runs in training, including Charm's normal time cost.
  g.arcade.time=0;
  for (const l of g.arcade.lots) if (l.status==='open') l.cooldown=0;
  const l=activeLot(g), n=l?.negotiation, entry=n?.attempts.at(-1);
  if (l && l.gpu!==expectedGpu(t)) return false;
  if (['h100','network'].includes(t.step) && (n?.attempts.length || 0)>before.attempts) return false;
  if (entry?.status==='resolved' && !entry.practiceSeen) {
    entry.practiceSeen=true;
    t.charmed[l.gpu]=true;
    t.lastCharm={gpu:l.gpu,tier:entry.tier,precision:entry.precision || null};
    if (entry.tier==='hit' && t.step==='h200' && !g.arcade.signing) {
      if(!prepareSigning(g,'purchase'))return false;
    }
    if (entry.tier!=='hit') {
      // A real miss is evaluated first. In this explicitly labelled practice
      // company its relationship/time costs are waived and the same quote retries.
      g.firms=before.firms; g.clout=before.clout;
      l.status='open'; n.closed=false; n.running=null; n.attempts=[];
      n.price=entry.before; n.base=entry.before; n.rapport='cold';
      n.tape.push({speaker:l.firm,text:'Practice is free. Try the target again, or sign your previous quote.'});
      g.arcade.message={text:'Practice miss — no cash or relationship penalty. Try again, or sign your previous quote.',tone:'plain'};
    }
  }
  // The first purchase teaches signing only. Charm belongs to the H200 deal;
  // a resolved attempt is enough, without making precision a learning gate.
  if (g.arcade.signing?.kind==='purchase' && t.step==='h200' && !t.charmed.H200) return false;
  return g.q===1 && ['floor','integration'].includes(g.phase) && cash(g)===ledgerCash(g.arcade.ledger,g.arcade.initialCash ?? 6500000);
}

function puzzle(t, kind) {
  const g=t.practice, a=g.arcade, id=`practice-${kind}`;
  clearIntegration(g);
  g.phase='integration';
  const snake=kind==='kernel',scale=snake?50:2;
  const actualRecipe=snake?TRAINING_LARGE_RECIPE:kind==='cable'&&!t.legacySequence?{H100:2}:recipe();
  a.integration={id,kind,tier:snake?'cluster':'node',scale,fleet:snake?50:0,batch:snake?0:2,nodes:snake?7:2,milestone:null,training:true};
  const started=GAMES[kind].start(g,{id,training:true,target:snake&&!t.legacySequence?4:2,
    builds:[snake?t.largeBuildId:kind==='node'&&!t.legacySequence?t.modelBuildId:t.buildId || TRAINING_CARD],recipe:actualRecipe,scale});
  if(started && kind==='cable' && !t.legacySequence) {
    const nodes=rackNodes(actualRecipe,2);
    g.arcade.cable.nodes.forEach((node,i)=>{Object.assign(node,nodes[i]);Object.assign(g.arcade.cable.cells[node.i],nodes[i]);});
  }
  if(started && !t.legacySequence && kind==='node')puzzleInput(g,'start');
  if(started && !t.legacySequence && kind==='cable')cableInput(g,'start');
  return started;
}

function continuePuzzle(t) {
  const g=t.practice, out=integrationOutcome(g);
  if (!out?.perfect || out.skipped) return false;
  if (t.step==='node' && !t.nodeDone && g.arcade.integration?.kind==='node') {
    if(!t.legacySequence) {
      // Use the existing one-shot research preparation modifier to waive
      // setbacks in this disposable lesson; the real reward consumes it.
      g.company.mods.odds={...(g.company.mods.odds || {}),setback:-(FOUNDER.run.setback+FOUNDER.run.mixedSetback)};
      if(!integrate(g,t.modelBuildId,out.efficiency))return false;
    }
    t.nodeDone=true; t.step=t.legacySequence?'cable':'network'; clearIntegration(g); g.phase='floor';
    if(!t.legacySequence)networkProject(t);
    g.arcade.message={text:t.legacySequence?'Both GPUs are reserved for your rack. Buy the infrastructure next; it uses them once.':'Your first model is online. Purchase the hardware for a separate starter network.',tone:'good'};
    return true;
  }
  if (t.step==='cable' && t.buildId && !t.cableDone && g.arcade.integration?.kind==='cable') {
    // Production integration grants actual productive hardware, once, inside the
    // practice company. No workshop settlement or campaign grade is involved.
    if (!integrate(g,t.buildId,1)) return false;
    t.cableDone=true; t.step='funding'; clearIntegration(g); g.phase='floor'; fundingOffer(t);
    g.arcade.message={text:'Rack connected: 2 H100 delivered to practice stock. Aster has a practice investment offer.',tone:'good'};
    return true;
  }
  if (t.step==='snake' && t.largeBuildId && !t.snakeDone && g.arcade.integration?.kind==='kernel') {
    t.snakeDone=true; t.step='ready'; clearIntegration(g); g.phase='floor';
    g.arcade.message={text:'Workload complete. Your funded practice company is ready; its money, equity and hardware return before round 1.',tone:'good'};
    return true;
  }
  return false;
}

export function trainingAction(t, action, arg) {
  if (!t || t.launchPending) return false;
  action=({'training-begin':'begin','training-source':'source','training-node':'node-open',
    'training-build':'cable-build','training-cable':'cable-build','training-continue':'continue','training-fund':'fund',
    'training-large-source':'large-source','training-large-build':'large-build','training-snake':'snake-open',
    'training-model-build':'model-build','training-network-source':'network-source','training-network-build':'network-build',
    'post-receipt':'receiptadvance'})[action] || action;
  const g=t.practice, a=g.arcade;
  if (action==='begin') { if (t.step!=='meet') return false; t.step='h100'; return trainingMutate(t,s=>claim(s,TRAINING_LOTS.H100)); }
  if (action==='source') {
    const gpu=typeof arg==='string' ? arg : arg?.gpu;
    return gpu===expectedGpu(t) && trainingMutate(t,s=>claim(s,TRAINING_LOTS[gpu]));
  }
  if (action==='receiptadvance') {
    if (t.step==='funding' && t.funded && a.confirm?.receipt?.kind==='term' && a.confirm.receipt.termId===TRAINING_FUND_ID) {
      if (!postReceipt(g)) return false;
      t.step='large';largeProject(t);return true;
    }
    if (t.step==='large' && a.confirm?.receipt?.kind==='purchase' && a.confirm.receipt.gpu==='H100' && a.confirm.receipt.qty===48) {
      if (!postReceipt(g)) return false;
      t.largePurchased=true;return true;
    }
    if(t.step==='network' && a.confirm?.receipt?.kind==='purchase' && a.confirm.receipt.gpu==='H100' && a.confirm.receipt.qty===2) {
      if(!postReceipt(g))return false;t.networkPurchased=true;return true;
    }
    const gpu=expectedGpu(t), r=a.confirm?.receipt;
    if (!gpu || r?.kind!=='purchase' || r.gpu!==gpu || r.qty!==1 || !a.inventory.some(x=>x.id===TRAINING_LOTS[gpu] && x.left===1)) return false;
    if (!postReceipt(g)) return false;
    t.step=t.step==='h100' ? 'h200' : t.legacySequence?'node':'model'; t.lastCharm=null;
    return true;
  }
  if(action==='model-build') {
    if(t.legacySequence || t.step!=='model' || t.modelBuildId || g.phase!=='floor' || a.active || a.confirm || a.signing)return false;
    fill(g,TRAINING_MODEL_CARD);const b=build(g,TRAINING_MODEL_CARD);
    if(!b)return false;t.modelBuildId=b.id;t.step='node';return puzzle(t,'node');
  }
  if (action==='node-open') {
    if (t.step!=='node' || t.nodeDone || g.phase!=='floor' || a.active || a.confirm || a.signing) return false;
    if(t.legacySequence) {
      fill(g,TRAINING_CARD);
      if (heldFor(g,TRAINING_CARD,'H100')!==1 || heldFor(g,TRAINING_CARD,'H200')!==1) return false;
    } else if(!t.modelBuildId || !g.company.builds.some(b=>b.id===t.modelBuildId && b.status==='integrating'))return false;
    return puzzle(t,'node');
  }
  if(action==='network-source') {
    if(t.legacySequence || t.step!=='network' || t.networkPurchased || t.buildId)return false;
    return trainingMutate(t,s=>claim(s,TRAINING_NETWORK_LOT) && prepareSigning(s,'purchase'));
  }
  if(action==='network-build') {
    if(t.legacySequence || t.step!=='network' || t.buildId)return false;
    if(a.confirm?.receipt && !trainingAction(t,'receiptadvance'))return false;
    if(!t.networkPurchased || a.active || a.confirm || a.signing || g.phase!=='floor')return false;
    fill(g,TRAINING_CARD);const b=build(g,TRAINING_CARD);
    if(!b)return false;t.buildId=b.id;t.step='cable';return puzzle(t,'cable');
  }
  if (action==='cable-build') {
    if(!t.legacySequence)return false;
    if (t.step!=='cable' || !t.nodeDone || t.buildId || g.phase!=='floor' || a.active || a.confirm || a.signing) return false;
    const b=build(g,TRAINING_CARD);
    if (!b) return false;
    t.buildId=b.id;
    return puzzle(t,'cable');
  }
  if (action==='fund') {
    if (t.step!=='funding' || t.funded || a.active || a.confirm || a.signing) return false;
    if (!reviewTerm(g,TRAINING_FUND_ID) || !prepareSigning(g,'term') || !signTrade(g)) return false;
    t.funded=true;return true;
  }
  if (action==='large-source') {
    if (t.step!=='large' || !t.funded || t.largePurchased || t.largeBuildId) return false;
    return trainingMutate(t,s=>claim(s,TRAINING_LARGE_LOT) && prepareSigning(s,'purchase'));
  }
  if (action==='large-build') {
    if (t.step!=='large' || !t.funded || t.largeBuildId) return false;
    if (a.confirm?.receipt && !trainingAction(t,'receiptadvance')) return false;
    if (!t.largePurchased || a.active || a.confirm || a.signing || g.phase!=='floor') return false;
    fill(g,TRAINING_LARGE_CARD);
    const b=build(g,TRAINING_LARGE_CARD);
    if (!b || b.online!==1) return false;
    recordDeployment(g);
    if (!snakeAvailable(g)) return false;
    t.largeBuildId=b.id;t.step='snake';
    if(!t.legacySequence)return puzzle(t,'kernel') && GAMES.kernel.input(g,'start');
    return true;
  }
  if (action==='snake-open') {
    if (t.step!=='snake' || !t.largeBuildId || t.snakeDone || !snakeAvailable(g) || g.phase!=='floor') return false;
    return puzzle(t,'kernel');
  }
  if (action==='training-retry') action=t.step==='node' ? 'node-retry' : t.step==='snake' ? 'snake-retry' : 'cable-retry';
  if (['node-retry','cable-retry','snake-retry'].includes(action)) {
    const kind=action==='node-retry' ? 'node' : action==='snake-retry' ? 'kernel' : 'cable', out=integrationOutcome(g);
    if (t.step!==(kind==='kernel'?'snake':kind) || !out || out.perfect || (kind==='cable' && !t.buildId) || (kind==='kernel' && !t.largeBuildId)) return false;
    const restarted=puzzle(t,kind);
    return restarted && (kind!=='kernel' || t.legacySequence || GAMES.kernel.input(g,'start'));
  }
  if (action==='continue') return continuePuzzle(t);
  if (action==='recover') return trainingMutate(t,recoverRizz);
  return false;
}

// A damaged training save is preserved, just like a damaged campaign save.
// The shared campaign validator supplies monetary and allocation conservation.
export function validTraining(t) {
  try {
    const g=t?.practice, a=g?.arcade;
    if (t?.version!==TRAINING_VERSION || !Number.isSafeInteger(t.seed) || t.seed<0 || t.seed>0xffffffff || typeof t.name!=='string' || nameError(t.name) ||
      typeof t.replay!=='boolean' || !TRAINING_STEPS.includes(t.step) || typeof t.nodeDone!=='boolean' || typeof t.cableDone!=='boolean' ||
      !['funded','largePurchased','snakeDone'].every(k=>typeof t[k]==='boolean') || !(t.largeBuildId===null || typeof t.largeBuildId==='string') ||
      !t.charmed || !['H100','H200'].every(k=>typeof t.charmed[k]==='boolean') ||
      !(t.buildId===null || typeof t.buildId==='string') ||
      !(t.lastCharm===null || t.lastCharm && ['H100','H200'].includes(t.lastCharm.gpu) && ['hit','near','miss','severe','expired'].includes(t.lastCharm.tier))) return false;
    if (t.launchPending!==undefined && typeof t.launchPending!=='boolean') return false;
    if (t.launchPending) {
      if (t.replay || typeof t.launchFrom!=='string' || t.launchFrom.length>4000000) return false;
      const previous=JSON.parse(t.launchFrom);
      if (previous!==null && !validSave(previous)) return false;
      if (t.launchTarget!=null) {
        if (typeof t.launchTarget!=='string' || t.launchTarget.length>4000000) return false;
        const target=JSON.parse(t.launchTarget);
        if (!validSave(target) || target.seed!==t.seed || target.company.name!==t.name || target.q!==1 || target.phase!=='floor' || target.arcade.practice || target.arcade.time!==0) return false;
      }
    } else if (t.launchFrom!=null || t.launchTarget!=null) return false;
    if (!g || g.seed!==t.seed || g.company?.name!==t.name || g.q!==1 || a?.time!==0 || a.practice!==true || !validSave(g)) return false;
    if(t.legacySequence!==undefined && typeof t.legacySequence!=='boolean')return false;
    if(!t.legacySequence)return validCurrentTraining(t);
    const c=g.company, investors=c.shares.investors, large=a.purchases.find(p=>p.id===TRAINING_LARGE_LOT), small=a.purchases.filter(p=>p.id!==TRAINING_LARGE_LOT);
    if (a.ledger.workshops!==0 || a.workshops.seq!==0 || a.workshops.awards.length || c.grades.length || investors.length!==(t.funded?1:0)) return false;
    if (a.ledger.raised!==(t.funded?TRAINING_FUND_AMOUNT:0) || ['inKind','revenue','contracts','resale','burn','research','penalties','expired'].some(k=>a.ledger[k]!==0)) return false;
    if (t.funded && (investors[0].termId!==TRAINING_FUND_ID || investors[0].paid!==TRAINING_FUND_AMOUNT || investors[0].pct!==TRAINING_FUND_PCT || investors[0].shares!==Math.round(c.shares.founder*TRAINING_FUND_PCT/(10000-TRAINING_FUND_PCT)))) return false;
    if (a.purchases.length>3 || new Set(a.purchases.map(p=>p.id)).size!==a.purchases.length || small.some(p=>p.id!==TRAINING_LOTS[p.gpu] || p.qty!==1) || large && (large.gpu!=='H100' || large.qty!==48 || !t.funded)) return false;
    const capex=(t.buildId?TRAINING_INFRA_COST:0)+(t.largeBuildId?expansionCapital(g,TRAINING_LARGE_RECIPE):0);
    if (a.ledger.purchases!==a.purchases.reduce((sum,p)=>sum+p.cost,0) || a.ledger.capex!==capex || a.receipts.length!==a.purchases.length+(t.funded?1:0)) return false;
    const count=small.length;
    if (t.step==='meet' && count || t.step==='h100' && (count>1 || a.purchases.some(p=>p.gpu!=='H100')) ||
      t.step==='h200' && (count<1 || !small.some(p=>p.gpu==='H100')) || ['node','cable','funding','large','snake','ready'].includes(t.step) && count!==2) return false;
    if (c.builds.length!==(t.buildId?1:0)+(t.largeBuildId?1:0) || c.racks.length!==(t.cableDone?1:0)+(t.largeBuildId?1:0) || c.products.length) return false;
    if (t.buildId && !c.builds.some(b=>b.id===t.buildId && b.card===TRAINING_CARD)) return false;
    if (t.nodeDone!==['cable','funding','large','snake','ready'].includes(t.step) || t.cableDone!==['funding','large','snake','ready'].includes(t.step) || (t.cableDone && !t.buildId)) return false;
    const legacy=t.legacyHandoff===true && t.launchPending && t.step==='ready' && !t.funded && !t.largeBuildId;
    if (t.legacyHandoff && !legacy) return false;
    if (!legacy && (t.snakeDone!==(t.step==='ready') || ['large','snake','ready'].includes(t.step) && !t.funded || ['snake','ready'].includes(t.step) && !t.largeBuildId)) return false;
    if (t.largePurchased && !large || t.largeBuildId && (!t.largePurchased || !c.builds.some(b=>b.id===t.largeBuildId && b.card===TRAINING_LARGE_CARD && b.online===1) || !snakeAvailable(g))) return false;
    if (t.largeBuildId && (c.deploy?.milestones?.cluster!==1 || !c.deploy.history.some(h=>h.scale>=48 && h.tier==='cluster'))) return false;
    if (!t.largeBuildId && c.deploy) return false;
    if (g.phase==='integration' && (t.step==='node' ? !a.tetris?.training : t.step==='cable' ? !a.cable?.training : t.step==='snake' ? !a.kernel?.training : true)) return false;
    const card=cardOf(t);
    return !!card && JSON.stringify(card.recipe)===JSON.stringify(recipe()) && card.cashCost===TRAINING_INFRA_COST && card.reward?.rack?.gpu==='H100' && card.reward.rack.qty===2;
  } catch { return false; }
}

function validCurrentTraining(t) {
  const g=t.practice,a=g.arcade,c=g.company;
  if(!(t.modelBuildId===null || typeof t.modelBuildId==='string') || typeof t.networkPurchased!=='boolean')return false;
  const afterModel=['node','network','cable','funding','large','snake','ready'].includes(t.step);
  const afterNode=['network','cable','funding','large','snake','ready'].includes(t.step);
  const afterCable=['funding','large','snake','ready'].includes(t.step);
  if(!!t.modelBuildId!==afterModel || t.nodeDone!==afterNode || t.cableDone!==afterCable || t.snakeDone!==(t.step==='ready'))return false;
  if(['cable','funding','large','snake','ready'].includes(t.step)!==!!t.buildId || ['snake','ready'].includes(t.step)!==!!t.largeBuildId)return false;
  if(['large','snake','ready'].includes(t.step) && !t.funded)return false;
  const small=a.purchases.filter(p=>Object.values(TRAINING_LOTS).includes(p.id));
  const network=a.purchases.find(p=>p.id===TRAINING_NETWORK_LOT),large=a.purchases.find(p=>p.id===TRAINING_LARGE_LOT);
  if(a.purchases.length>4 || new Set(a.purchases.map(p=>p.id)).size!==a.purchases.length ||
    a.purchases.some(p=>!Object.values(TRAINING_LOTS).includes(p.id) && ![TRAINING_NETWORK_LOT,TRAINING_LARGE_LOT].includes(p.id)) ||
    small.some(p=>p.id!==TRAINING_LOTS[p.gpu] || p.qty!==1) || network && (network.gpu!=='H100'||network.qty!==2) || large && (large.gpu!=='H100'||large.qty!==48))return false;
  if(t.step==='meet' && small.length || t.step==='h100' && (small.length>1 || small.some(p=>p.gpu!=='H100')) ||
    t.step==='h200' && (small.length<1 || !small.some(p=>p.gpu==='H100')) || !['meet','h100','h200'].includes(t.step) && small.length!==2)return false;
  if(t.networkPurchased && !network || t.buildId && !t.networkPurchased || t.largePurchased && !large || t.largeBuildId && !t.largePurchased || large && !t.funded)return false;
  const model=c.builds.find(b=>b.id===t.modelBuildId),net=c.builds.find(b=>b.id===t.buildId),big=c.builds.find(b=>b.id===t.largeBuildId);
  if(t.modelBuildId && !model || t.buildId && !net || t.largeBuildId && !big)return false;
  if(model && (model.card!==TRAINING_MODEL_CARD || model.reward.level!==1 || model.online!==(t.nodeDone?1:0)))return false;
  if(net && (net.card!==TRAINING_CARD || net.online!==(t.cableDone?1:0)))return false;
  if(big && (big.card!==TRAINING_LARGE_CARD || big.online!==1 || !snakeAvailable(g)))return false;
  if(c.builds.length!==(t.modelBuildId?1:0)+(t.buildId?1:0)+(t.largeBuildId?1:0) ||
    c.racks.length!==(t.cableDone?1:0)+(t.largeBuildId?1:0) || c.products.length || c.level!==(t.nodeDone?1:0))return false;
  if(t.nodeDone && c.mods.odds!==null || !t.largeBuildId && c.deploy)return false;
  if(t.largeBuildId && (c.deploy?.milestones?.cluster!==1 || !c.deploy.history.some(h=>h.scale>=48)))return false;
  const capex=(t.buildId?TRAINING_INFRA_COST:0)+(t.largeBuildId?expansionCapital(g,TRAINING_LARGE_RECIPE):0);
  if(a.ledger.capex!==capex || a.ledger.purchases!==a.purchases.reduce((n,p)=>n+p.cost,0) ||
    a.ledger.raised!==(t.funded?TRAINING_FUND_AMOUNT:0) || c.shares.investors.length!==(t.funded?1:0) ||
    a.receipts.length!==a.purchases.length+(t.funded?1:0))return false;
  if(['workshops','inKind','revenue','contracts','resale','burn','research','penalties','expired'].some(k=>a.ledger[k]!==0) ||
    a.workshops.seq || a.workshops.awards.length || c.grades.length)return false;
  if(t.funded && (c.shares.investors[0].termId!==TRAINING_FUND_ID || c.shares.investors[0].paid!==TRAINING_FUND_AMOUNT ||
    c.shares.investors[0].shares!==Math.round(c.shares.founder*TRAINING_FUND_PCT/(10000-TRAINING_FUND_PCT))))return false;
  if(g.phase==='integration' && (t.step==='node'?!a.tetris?.training:t.step==='cable'?!a.cable?.training:t.step==='snake'?!a.kernel?.training:true))return false;
  const card=a.objectives.find(o=>o.id===TRAINING_MODEL_CARD);
  return !!card && JSON.stringify(card.recipe)===JSON.stringify(recipe()) && card.reward?.level===1;
}
