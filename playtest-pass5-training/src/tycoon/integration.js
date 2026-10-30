import { campaignLimit, EXTENDED_ROUNDS } from './extension.js';
// V20 The Scale-Up: one integration challenge per bell, chosen by operational scale
// (contract: docs/V10_19_INTEGRATION_CONTRACT.md).
//
// Early game, the company provisions GPUs (Node Tetris); then it networks nodes into clusters (Cable Mania); at fleet
// scale it operates the deployment (Kernel Snake). The game is picked from the infrastructure the company actually
// runs (GPUs behind live products and owned racks) and the work being integrated at this bell: never the round,
// the valuation or lifetime purchases. Every game returns the same result shape and the engine applies it through
// the V10.18 code paths (gradeOf, integrate, applyGrade): same 0.55 floor, 0.75 crew skip, same grades and bonuses.
import { ECONOMY } from './economy-balance.js';
import { replayAvailable, normalizeReplayAccess, minigameEligibility, completedRound, gameSessionAllowed, gameLaunchAllowed, normalizeSnakeIntro } from './replay-access.js';
import { finishIntegration } from './arcade.js';
import { validPendingMemo } from './world.js';
import { stream } from '../util.js';
import { pendingIntegration, GPUS } from './founder.js';
import * as tetris from './tetris.js';
import * as cableGame from './cable.js';
import * as kernelGame from './kernel.js';

export const NODE_GPUS = 8;                         // the game's node reference: display and grouping only
export const INTEGRATION = Object.freeze({ skip: tetris.TETRIS.skip, floor: tetris.TETRIS.floor, cap: .99 });
// Tiers by operational scale (GPUs). A company enters a tier at `min` and keeps it while its scale stays at or above
// `stay` (85% of `min`): a bell-to-bell wobble never flips the game, a real loss of capacity does.
export const TIERS = Object.freeze([
  Object.freeze({ id: 'node', game: 'node', min: 0, stay: 0, name: 'Node Tetris', verb: 'Provision', stage: 'Provisioning nodes' }),
  Object.freeze({ id: 'cluster', game: 'cable', min: 48, stay: 40, name: 'Cable Mania', verb: 'Network', stage: 'Networking a cluster' }),
  Object.freeze({ id: 'fleet', game: 'kernel', min: 256, stay: 216, name: 'Kernel Snake', verb: 'Operate', stage: 'Operating a fleet' }),
]);
const tierIndex = id => Math.max(0, TIERS.findIndex(t => t.id === id));
const gpusOf = r => GPUS.reduce((n, k) => n + (r?.[k] || 0), 0);

// ---- Operational scale ------------------------------------------------------------------------------------------
// Fleet: GPUs × share online of every build that still delivers a live product or owns a rack fleet.
export function fleetGpus(c) {
  const lasting = new Set([...(c.products || []).filter(p => !p.lost).map(p => p.build), ...(c.racks || []).map(k => k.build)]);
  return Math.round(c.builds.filter(b => lasting.has(b.id) && b.status !== 'integrating').reduce((n, b) => n + gpusOf(b.recipe) * (b.online || 0), 0));
}
// Batch: GPUs being integrated at this bell (all builds waiting at 'integrating').
export const batchGpus = g => pendingIntegration(g).filter(b => b.status === 'integrating').reduce((n, b) => n + gpusOf(b.recipe), 0);
export const nodesOf = gpus => Math.ceil(Math.max(0, gpus) / NODE_GPUS);
// The tier for a scale, given the tier the company held at its last integration (hysteresis on the way down).
export function tierFor(scale, previous = 'node') {
  let i = 0;
  for (let k = 0; k < TIERS.length; k++) if (scale >= TIERS[k].min) i = k;
  const p = tierIndex(previous);
  while (i < p && scale >= TIERS[i + 1].stay) i++;
  return TIERS[i].id;
}
export function deploymentOf(g) {
  const c = g.company, fleet = fleetGpus(c), batch = batchGpus(g), scale = Math.max(fleet, batch), previous = c.deploy?.tier || 'node';
  const tier = tierFor(scale, previous), T = TIERS[tierIndex(tier)];
  return { fleet, batch, scale, nodes: nodesOf(scale), tier, game: T.game, name: T.name, previous };
}
// Node groups: a recipe split into nodes of one GPU type (the last node of a type may be partial). Shared with the
// company tray's GPU grouping (Codex) so a node means the same thing everywhere.
export function nodeGroups(recipe, size = NODE_GPUS) {
  const out = [];
  for (const k of GPUS) { let n = recipe?.[k] || 0; while (n > 0) { const take = Math.min(size, n); out.push({ gpu: k, gpus: take }); n -= take; } }
  return out;
}
export const recipeKey = recipe => GPUS.filter(k => recipe?.[k] > 0).map(k => `${k}x${recipe[k]}`).join('+');

// ---- The games --------------------------------------------------------------------------------------------------
// Each adapter: { kind, field, name, ready, start(g, spec), input(g, action, arg), tick(g, dt), skip(g), outcome(g),
// autoplay(g, skill), live(g), valid(state) }. Node Tetris wraps the V10.18 engine unchanged.
const NODE = Object.freeze({
  kind: 'node', field: 'tetris', name: 'Node Tetris', ready: true,
  start: (g, spec) => tetris.startPuzzle(g, spec),
  input: (g, action) => tetris.puzzleInput(g, action),
  tick: (g, dt) => tetris.puzzleTick(g, dt),
  skip: g => tetris.skipPuzzle(g),
  outcome: g => tetris.puzzleOutcome(g),
  autoplay: (g, skill) => tetris.autoplay(g, skill),
  valid: t => !!(t && typeof t === 'object' && Array.isArray(t.builds) && t.builds.length && Array.isArray(t.pieces) && Array.isArray(t.cells)),
});
export const GAMES = Object.freeze({ node: NODE, cable: cableGame.ADAPTER, kernel: kernelGame.ADAPTER });
const FIELDS = ['tetris', 'cable', 'kernel'];

export const integrationKind = g => g?.arcade?.integration?.kind || (g?.arcade?.tetris ? 'node' : null);
export const integrationGame = g => GAMES[integrationKind(g)] || null;
export const integrationState = g => { const G = integrationGame(g); return G ? g.arcade[G.field] : null; };
export const integrationLive = g => gameSessionAllowed(g,integrationKind(g)) && !integrationState(g).done;

// Record an actual deployment. Training calls this only after its purchased
// large build is online; normal campaigns still record at their existing bell.
export function recordDeployment(g) {
  const d = deploymentOf(g), c = g.company;
  c.deploy ||= { tier: 'node', peak: 'node', history: [], milestones: {} };
  const milestone = d.tier !== 'node' && !c.deploy.milestones[d.tier] ? d.tier : null;
  if (milestone) c.deploy.milestones[d.tier] = g.q;
  c.deploy.tier = d.tier;
  if (tierIndex(d.tier) > tierIndex(c.deploy.peak)) c.deploy.peak = d.tier;
  c.deploy.history.push({ q: g.q, tier: d.tier, scale: d.scale, fleet: d.fleet, batch: d.batch });
  normalizeReplayAccess(g);
  return { ...d, milestone };
}

// The bell: pick the game for the company's tier, record the deployment, start it. Classic mode (a test seam)
// always plays Node Tetris and records nothing new: the V10.18 engine exactly.
export function startIntegration(g) {
  if (g.phase !== 'integration' || g.arcade.bellIntegration?.q!==g.q) return false;
  const builds = pendingIntegration(g).filter(b => b.status === 'integrating');
  if (!builds.length) return false;
  if (g.arcade.integrationMode === 'classic') {g.arcade.bellIntegration.kind='node';return NODE.start(g);}
  const d = recordDeployment(g), milestone = d.milestone;
  const G = GAMES[d.game].ready ? GAMES[d.game] : NODE;
  g.arcade.integration = { kind: G.kind, id: `q${g.q}-${G.kind}`, tier: d.tier, scale: d.scale, fleet: d.fleet, batch: d.batch, nodes: d.nodes, milestone };
  g.arcade.bellIntegration.kind=G.kind;
  if (!gameLaunchAllowed(g,G.kind)) return false;
  const recipe = tetris.puzzleRecipe(g);
  return G.start(g, { builds: builds.map(b => b.id), recipe, groups: nodeGroups(recipe), tier: d.tier, scale: d.scale });
}
export const integrationInput = (g, action, arg) => { const G = integrationGame(g); return G && gameSessionAllowed(g,G.kind) ? G.input(g, action, arg) : false; };
export const integrationTick = (g, dt) => { const G = integrationGame(g); return G && gameSessionAllowed(g,G.kind) ? G.tick(g, dt) : false; };
export const skipIntegration = g => { const G = integrationGame(g); return G && gameSessionAllowed(g,G.kind) ? G.skip(g) : false; };
export function integrationOutcome(g) {
  if (g.arcade.integration?.crew) return {...g.arcade.integration.crew};
  const G = integrationGame(g), out = G ? G.outcome(g) : null;
  return out ? { kind: G.kind, ...out } : null;
}
export const autoplayIntegration = (g, skill) => { const G = integrationGame(g); return G && gameSessionAllowed(g,G.kind) ? G.autoplay(g, skill) : false; };
export const crewIntegrationOutcome = g => ({kind:integrationKind(g)||'node',efficiency:INTEGRATION.skip,perfect:false,skipped:true,
  score:0,rows:0,placed:0,pieces:0,reason:'crew-locked',seconds:0});
// Settle: every game's state and the bell's record go; a.tetris returns to null as in V10.18.
export function clearIntegration(g) {
  const a = g.arcade;
  a.tetris = null;
  for (const f of FIELDS.slice(1)) delete a[f];
  delete a.integration;
  delete a.bellIntegration;
}
// Save validation for the integration fields (arcade-store.js).
export function validIntegrationSave(g,{legacy=false}={}) {
  const a = g.arcade, c = g.company;
  if (c.deploy !== undefined) {
    const d = c.deploy;
    if (!d || !TIERS.some(t => t.id === d.tier) || !TIERS.some(t => t.id === d.peak) || !Array.isArray(d.history) || !d.milestones || typeof d.milestones !== 'object') return false;
    if (!d.history.every(h => Number.isSafeInteger(h.q) && TIERS.some(t => t.id === h.tier) && [h.scale, h.fleet, h.batch].every(n => Number.isSafeInteger(n) && n >= 0))) return false;
  }
  if (g.phase !== 'integration') return !a.tetris && FIELDS.slice(1).every(f => a[f] == null) && a.integration == null && a.bellIntegration==null;
  const kind = a.integration?.kind || (a.tetris ? 'node' : null), G = GAMES[kind];
  if (!G) return false;
  if (a.integration && (typeof a.integration.id !== 'string' || !TIERS.some(t => t.id === a.integration.tier))) return false;
  if (!G.valid(a[G.field])) return false;
  if (!legacy && !gameSessionAllowed(g,kind)) return false;
  return FIELDS.filter(f => f !== G.field).every(f => a[f] == null);
}

// Free operator workshops use loaner hardware. They never integrate company builds or grant grades.
// Each game's best performance can earn at most its disclosed prize once per round.
const WORKSHOP_KINDS = ['node','cable'];
// The original fleet bell still requires 256 GPUs. In the five-round campaign,
// earning the existing cluster milestone also opens optional Snake free play.
// It awards no money and cannot touch either game's per-round reward record.
export const snakeAvailable = g => replayAvailable(g,'kernel');
const playableWorkshop = (g, kind) => ['node','cable','kernel'].includes(kind) && replayAvailable(g,kind);
export function workshopQuote(g, kind) {
  if (!playableWorkshop(g,kind) || !g?.arcade || g.q<1 || g.q>campaignLimit(g)) return null;
  const a=g.arcade, round=a.workshop?.q || (g.phase==='report'?completedRound(g):g.q),award=a.workshops?.awards.find(x=>x.q===round && x.kind===kind);
  const max=kind==='kernel' ? 0 : ECONOMY.workshop.prizes[round], paid=award?.paid || 0;
  const out=a.workshop?.kind===kind ? integrationOutcome(g) : null;
  const performance=!out || out.skipped ? 0 : Math.max(0,Math.min(1,(out.efficiency-INTEGRATION.floor)/(1-INTEGRATION.floor)));
  const reward=out ? Math.max(0,Math.round(max*Math.max(award?.best || 0,performance))-paid) : 0;
  return {kind,round,max,reward,paid,remaining:max-paid,best:award?.best || 0,
    available:minigameEligibility(g,kind).available};
}
export function startWorkshop(g, kind) {
  if (!workshopQuote(g,kind)?.available) return false;
  const a=g.arcade;
  normalizeSnakeIntro(g);
  if(kind==='kernel' && !a.snakeIntro.seen) {a.snakeIntro.pending=true;a.snakeIntro.q=completedRound(g);return true;}
  a.workshops ||= {seq:0,awards:[]};
  const round=completedRound(g),seq=++a.workshops.seq,id=`workshop-${round}-${kind}-${seq}`;
  const recipe={...ECONOMY.workshop.recipe}, seed=stream(g.seed,'v20-workshop',round,kind,seq).int(1,2147483646);
  a.workshop={id,kind,q:round,seq,returnPhase:'report'};
  if (g.world.memo) {a.workshop.returnMemo=structuredClone(g.world.memo);g.world.memo=null;}
  a.integration={id,kind,tier:'node',scale:ECONOMY.workshop.scale,fleet:0,batch:0,nodes:6,milestone:null,workshop:true};
  g.phase='integration';
  if (!GAMES[kind].start(g,{id,builds:[id],recipe,seed,scale:ECONOMY.workshop.scale})) {
    const memo=a.workshop.returnMemo;delete a.workshop;clearIntegration(g);g.phase='report';if(memo)g.world.memo=memo;return false;
  }
  return true;
}
export function startCampaignSnake(g) {
  const s=g?.arcade?.snakeIntro;
  if(g?.arcade?.practice || g?.phase!=='report' || !s?.pending || s.seen || s.q!==completedRound(g) || !replayAvailable(g,'kernel'))return false;
  s.pending=false;s.seen=true;
  if(!startWorkshop(g,'kernel')) {s.pending=true;s.seen=false;return false;}
  GAMES.kernel.input(g,'start');
  return true;
}
export function cancelCampaignSnake(g) {
  const s=g?.arcade?.snakeIntro;
  if(g?.phase!=='report' || !s?.pending)return false;
  s.pending=false;s.q=null;return true;
}
export function finishWorkshop(g) {
  if (!g.arcade.workshop || g.arcade.workshop.returnPhase!=='report' || !gameSessionAllowed(g,g.arcade.workshop.kind)) return false;
  return settleWorkshop(g,'report');
}
function settleWorkshop(g,returnPhase,legacyRecorded=false) {
  const a=g.arcade, w=a.workshop, out=integrationOutcome(g);
  if (g.phase!=='integration' || !w || !out || (!legacyRecorded&&!playableWorkshop(g,w.kind))) return false;
  const round=w.q,memo=w.returnMemo;
  if (w.kind === 'kernel') {
    delete a.workshop;clearIntegration(g);g.phase=returnPhase;if(memo)g.world.memo=memo;
    a.workshopResult={id:w.id,kind:w.kind,paid:0,earned:0,max:0};
    a.message={text:'Cluster Snake complete. Your earned free play has no cash prize; your company is unchanged.',tone:'plain'};
    return true;
  }
  // Skip is always a safe return to the floor; playing poorly never reduces an earlier prize.
  const performance=out.skipped ? 0 : Math.max(0,Math.min(1,(out.efficiency-INTEGRATION.floor)/(1-INTEGRATION.floor)));
  let award=a.workshops.awards.find(x=>x.q===round && x.kind===w.kind);
  if (!award) {award={q:round,kind:w.kind,best:0,paid:0,plays:0};a.workshops.awards.push(award);}
  award.plays++; award.best=Math.max(award.best,performance);
  const earned=Math.round(ECONOMY.workshop.prizes[round]*award.best), paid=Math.max(0,earned-award.paid);
  award.paid+=paid;
  a.ledger.workshops+=paid;
  g.cash=(Math.round(g.cash*100)+paid)/100;
  a.workshopResult={id:w.id,kind:w.kind,paid,earned:award.paid,max:ECONOMY.workshop.prizes[round]};
  delete a.workshop;clearIntegration(g);g.phase=returnPhase;if(memo)g.world.memo=memo;
  a.message={text:paid ? `Workshop contract paid $${(paid/100).toLocaleString('en-US')}. Replay either game freely; each round pays only improvements to your best result.` : 'Workshop complete. Replay freely; only improvements to your best result earn more this round.',tone:paid?'good':'plain'};
  return true;
}
export function validWorkshopSave(g,{legacy=false}={}) {
  const a=g.arcade, w=a.workshops, int=Number.isSafeInteger;
  if (!w || !int(w.seq) || w.seq<0 || !Array.isArray(w.awards) || w.awards.length>campaignLimit(g)*2) return false;
  const keys=new Set();
  for (const x of w.awards) {
    const key=`${x.q}-${x.kind}`;
    if (keys.has(key) || !int(x.q) || x.q<1 || x.q>g.q || !WORKSHOP_KINDS.includes(x.kind) || !Number.isFinite(x.best) || x.best<0 || x.best>1 || !int(x.plays) || x.plays<1 || !int(x.paid) || x.paid!==Math.round(ECONOMY.workshop.prizes[x.q]*x.best)) return false;
    keys.add(key);
  }
  if (w.awards.reduce((sum,x)=>sum+x.paid,0)!==a.ledger.workshops) return false;
  if (a.workshop) {
    const p=a.workshop,old=legacy && p.returnPhase===undefined;
    if (g.phase!=='integration' || !int(p.seq) || p.seq!==w.seq || !int(p.q) || (old?p.q!==g.q:p.returnPhase!=='report' || p.q!==completedRound(g) || g.q!==p.q+1 || p.q>=campaignLimit(g)) ||
      (!old&&!playableWorkshop(g,p.kind)) || !['node','cable','kernel'].includes(p.kind) || p.kind!==integrationKind(g) || p.id!==a.integration?.id || a.integration?.workshop!==true) return false;
    if (p.returnMemo!==undefined && (!validPendingMemo(p.returnMemo) || p.returnMemo.q!==p.q)) return false;
  }
  if (a.integration?.workshop && !a.workshop) return false;
  return true;
}

// Earlier previews allowed active-round workshops. Resume no such live board:
// unfinished practice is cancelled without payment; an already recorded result
// is settled once against its original round budget. Real bell integrations
// keep their board and receive the explicit post-bell authorization marker.
export function normalizeMinigameSave(g) {
  if (g.phase!=='integration' || g.arcade.practice) return false;
  const a=g.arcade,w=a.workshop;
  if (w && w.returnPhase===undefined) {
    const out=integrationOutcome(g);
    if (out) {
      if (!settleWorkshop(g,'floor',true)) return false;
      a.message={text:'Your saved workshop result was settled once. Minigames are now available only between rounds.',tone:'plain'};
    } else {
      delete a.workshop;clearIntegration(g);g.phase='floor';
      a.message={text:'Your unfinished workshop was closed without a prize. Company resources are unchanged; earned games are playable between rounds.',tone:'plain'};
    }
    return true;
  }
  if (!w && !a.bellIntegration && g.company.builds.some(b=>b.status==='integrating')) {
    const kind=integrationKind(g);a.bellIntegration={q:g.q,kind};
    if (!replayAvailable(g,kind)) {
      if (integrationState(g)?.done) return finishIntegration(g);
      a.integration ||= {kind,id:`q${g.q}-${kind}`,tier:'node'};a.integration.crew=crewIntegrationOutcome(g);return finishIntegration(g);
    }
    return true;
  }
  return false;
}
