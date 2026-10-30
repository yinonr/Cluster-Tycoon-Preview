// Babur's training company is a separate, disposable company. Purchases, signing,
// reservations, building and both puzzles use the production engine. No practice
// balance, hardware, grade or reward is ever copied into the five-round company.
import { createArcade, claim, activeLot, cash, ledgerCash } from './arcade.js';
import { validSave } from './arcade-store.js';
import { fill, heldFor, build, integrate, updateScale, expansionCapital } from './founder.js';
import { postReceipt } from './pit-transactions.js';
import { recoverRizz } from './rizz.js';
import { GAMES, clearIntegration, integrationOutcome, recordDeployment, snakeAvailable } from './integration.js';
import { nameError } from './startup-name.js';
import { reviewTerm } from './investors.js';
import { prepareSigning, signTrade } from './arcade-signing.js';
import { ASK } from './founder-market.js';

export const TRAINING_VERSION = 2;
export const TRAINING_STEPS = Object.freeze(['meet','h100','h200','node','cable','funding','large','snake','ready']);
export const TRAINING_CARD = 'practice-infra';
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
const expectedGpu = t => ({h100:'H100',h200:'H200',large:'H100'})[t.step];
const cardOf = t => t.practice.arcade.objectives.find(o => o.id === TRAINING_CARD);

export function createTraining(seed, name, {replay = false} = {}) {
  const g = createArcade(seed, name, {scenarios:false}), a = g.arcade;
  a.practice = true;
  a.lots = ['H100','H200'].map((gpu,i) => ({id:TRAINING_LOTS[gpu],slot:i,firm:'Babur Training Supply',
    gpu,qty:1,ask:[245,319][i],floor:[215,279][i],at:0,until:a.seconds,cooldown:0,status:'open',negotiation:null}));
  a.objectives = [{id:TRAINING_CARD,lane:'infra',tier:1,name:'Practice starter rack',
    blurb:'Reserve both GPUs, buy the rack, then connect its network.',recipe:recipe(),mixed:true,
    reward:{rack:{gpu:'H100',qty:2}},cashCost:TRAINING_INFRA_COST,q:1,status:'open'}];
  a.buyers=[]; a.terms=[]; a.news=[]; a.message=null;
  return {version:TRAINING_VERSION,seed,name,replay:!!replay,step:'meet',practice:g,
    nodeDone:false,cableDone:false,buildId:null,lastCharm:null,charmed:{H100:false,H200:false},launchPending:false,launchFrom:null,
    funded:false,largePurchased:false,largeBuildId:null,snakeDone:false};
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
  if (previous?.version!==1) return previous;
  const t=structuredClone(previous);
  Object.assign(t,{version:TRAINING_VERSION,funded:false,largePurchased:false,largeBuildId:null,snakeDone:false});
  if (t.launchPending) t.legacyHandoff=true;
  else if (t.step==='ready') {t.step='funding';fundingOffer(t);}
  return t;
}

export const canonicalRoundOne = t => createArcade(t.seed,t.name,{learnedGames:true});

// Restart increments a storage revision; every economic/progression field must
// still match the full canonical company. An unrelated tab's progress is never
// mistaken for a launch to overwrite or for a completed training handoff.
export function trainingHandoffStatus(t, main) {
  if (!t?.launchPending || t.replay) return 'none';
  if (main) {
    const copy=structuredClone(main);
    if (copy.arcade) copy.arcade.rev=0;
    // A pending launch from the earlier local pass may have committed the same
    // canonical resources before learned-access metadata existed. Its handoff
    // may finish after granting access; no company deployment is copied.
    const canonical=canonicalRoundOne(t);
    delete copy.arcade.replays;delete canonical.arcade.replays;
    if (JSON.stringify(copy)===JSON.stringify(canonical)) return 'complete';
  }
  return JSON.stringify(main??null)===t.launchFrom ? 'retry' : 'conflict';
}

// Call through trainingStore.act. A practice facade can wrap every existing
// broker/game callback here, retaining the real controls and saved engine state.
export function trainingMutate(t, fn) {
  if (!t || t.launchPending || typeof fn !== 'function') return false;
  const g=t.practice, before={firms:structuredClone(g.firms),clout:g.clout};
  if (!fn(g)) return false;
  // The floor never runs in training, including Charm's normal time cost.
  g.arcade.time=0;
  for (const l of g.arcade.lots) if (l.status==='open') l.cooldown=0;
  const l=activeLot(g), n=l?.negotiation, entry=n?.attempts.at(-1);
  if (l && l.gpu!==expectedGpu(t)) return false;
  if (entry?.status==='resolved' && !entry.practiceSeen) {
    entry.practiceSeen=true;
    t.charmed[l.gpu]=true;
    t.lastCharm={gpu:l.gpu,tier:entry.tier,precision:entry.precision || null};
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
  // First action teaches Charm before a review. Success is not a precision gate.
  if (g.arcade.signing?.kind==='purchase' && t.step==='h100' && !t.charmed.H100) return false;
  return g.q===1 && ['floor','integration'].includes(g.phase) && cash(g)===ledgerCash(g.arcade.ledger);
}

function puzzle(t, kind) {
  const g=t.practice, a=g.arcade, id=`practice-${kind}`;
  clearIntegration(g);
  g.phase='integration';
  const snake=kind==='kernel',scale=snake?50:2;
  a.integration={id,kind,tier:snake?'cluster':'node',scale,fleet:snake?50:0,batch:snake?0:2,nodes:snake?7:2,milestone:null,training:true};
  return GAMES[kind].start(g,{id,training:true,builds:[snake?t.largeBuildId:t.buildId || TRAINING_CARD],recipe:snake?TRAINING_LARGE_RECIPE:recipe(),scale});
}

function continuePuzzle(t) {
  const g=t.practice, out=integrationOutcome(g);
  if (!out?.perfect || out.skipped) return false;
  if (t.step==='node' && !t.nodeDone && g.arcade.integration?.kind==='node') {
    t.nodeDone=true; t.step='cable'; clearIntegration(g); g.phase='floor';
    g.arcade.message={text:'Both GPUs are reserved for your rack. Buy the infrastructure next; it uses them once.',tone:'good'};
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
    g.arcade.message={text:'Two jobs run. Your funded practice company is ready; its money, equity and hardware return before round 1.',tone:'good'};
    return true;
  }
  return false;
}

export function trainingAction(t, action, arg) {
  if (!t || t.launchPending) return false;
  action=({'training-begin':'begin','training-source':'source','training-node':'node-open',
    'training-build':'cable-build','training-cable':'cable-build','training-continue':'continue','training-fund':'fund',
    'training-large-source':'large-source','training-large-build':'large-build','training-snake':'snake-open',
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
    const gpu=expectedGpu(t), r=a.confirm?.receipt;
    if (!gpu || r?.kind!=='purchase' || r.gpu!==gpu || r.qty!==1 || !a.inventory.some(x=>x.id===TRAINING_LOTS[gpu] && x.left===1)) return false;
    if (!postReceipt(g)) return false;
    t.step=t.step==='h100' ? 'h200' : 'node'; t.lastCharm=null;
    return true;
  }
  if (action==='node-open') {
    if (t.step!=='node' || t.nodeDone || g.phase!=='floor' || a.active || a.confirm || a.signing) return false;
    fill(g,TRAINING_CARD);
    if (heldFor(g,TRAINING_CARD,'H100')!==1 || heldFor(g,TRAINING_CARD,'H200')!==1) return false;
    return puzzle(t,'node');
  }
  if (action==='cable-build') {
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
    if (t.step==='funding' && t.funded && a.confirm?.receipt?.kind==='term' && !trainingAction(t,'receiptadvance')) return false;
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
    t.largeBuildId=b.id;t.step='snake';return true;
  }
  if (action==='snake-open') {
    if (t.step!=='snake' || !t.largeBuildId || t.snakeDone || !snakeAvailable(g) || g.phase!=='floor') return false;
    return puzzle(t,'kernel');
  }
  if (action==='training-retry') action=t.step==='node' ? 'node-retry' : t.step==='snake' ? 'snake-retry' : 'cable-retry';
  if (['node-retry','cable-retry','snake-retry'].includes(action)) {
    const kind=action==='node-retry' ? 'node' : action==='snake-retry' ? 'kernel' : 'cable', out=integrationOutcome(g);
    if (t.step!==(kind==='kernel'?'snake':kind) || !out || out.perfect || (kind==='cable' && !t.buildId) || (kind==='kernel' && !t.largeBuildId)) return false;
    return puzzle(t,kind);
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
    } else if (t.launchFrom!=null) return false;
    if (!g || g.seed!==t.seed || g.company?.name!==t.name || g.q!==1 || a?.time!==0 || a.practice!==true || !validSave(g)) return false;
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
