// V20 The Scale-Up: one integration challenge per bell, chosen by operational scale
// (contract: docs/V10_19_INTEGRATION_CONTRACT.md).
//
// Early game, the company provisions GPUs (Node Tetris); then it networks nodes into clusters (Cable Mania); at fleet
// scale it operates the deployment (Kernel Snake). The game is picked from the infrastructure the company actually
// runs (GPUs behind live products and owned racks) and the work being integrated at this bell: never the round,
// the valuation or lifetime purchases. Every game returns the same result shape and the engine applies it through
// the V10.18 code paths (gradeOf, integrate, applyGrade): same 0.55 floor, 0.75 crew skip, same grades and bonuses.
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
  start: g => tetris.startPuzzle(g),
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
export const integrationLive = g => g?.phase === 'integration' && !!integrationState(g) && !integrationState(g).done;

// The bell: pick the game for the company's tier, record the deployment, start it. Classic mode (a test seam)
// always plays Node Tetris and records nothing new: the V10.18 engine exactly.
export function startIntegration(g) {
  if (g.phase !== 'integration') return false;
  const builds = pendingIntegration(g).filter(b => b.status === 'integrating');
  if (!builds.length) return false;
  if (g.arcade.integrationMode === 'classic') return NODE.start(g);
  const d = deploymentOf(g), c = g.company;
  c.deploy ||= { tier: 'node', peak: 'node', history: [], milestones: {} };
  const milestone = d.tier !== 'node' && !c.deploy.milestones[d.tier] ? d.tier : null;
  if (milestone) c.deploy.milestones[d.tier] = g.q;
  c.deploy.tier = d.tier;
  if (tierIndex(d.tier) > tierIndex(c.deploy.peak)) c.deploy.peak = d.tier;
  c.deploy.history.push({ q: g.q, tier: d.tier, scale: d.scale, fleet: d.fleet, batch: d.batch });
  const G = GAMES[d.game].ready ? GAMES[d.game] : NODE;
  g.arcade.integration = { kind: G.kind, id: `q${g.q}-${G.kind}`, tier: d.tier, scale: d.scale, fleet: d.fleet, batch: d.batch, nodes: d.nodes, milestone };
  const recipe = tetris.puzzleRecipe(g);
  return G.start(g, { builds: builds.map(b => b.id), recipe, groups: nodeGroups(recipe), tier: d.tier, scale: d.scale });
}
export const integrationInput = (g, action, arg) => { const G = integrationGame(g); return G && g.phase === 'integration' ? G.input(g, action, arg) : false; };
export const integrationTick = (g, dt) => { const G = integrationGame(g); return G && g.phase === 'integration' ? G.tick(g, dt) : false; };
export const skipIntegration = g => { const G = integrationGame(g); return G && g.phase === 'integration' ? G.skip(g) : false; };
export function integrationOutcome(g) {
  const G = integrationGame(g), out = G ? G.outcome(g) : null;
  return out ? { kind: G.kind, ...out } : null;
}
export const autoplayIntegration = (g, skill) => { const G = integrationGame(g); return G && g.phase === 'integration' ? G.autoplay(g, skill) : false; };
// Settle: every game's state and the bell's record go; a.tetris returns to null as in V10.18.
export function clearIntegration(g) {
  const a = g.arcade;
  a.tetris = null;
  for (const f of FIELDS.slice(1)) delete a[f];
  delete a.integration;
}
// Save validation for the integration fields (arcade-store.js).
export function validIntegrationSave(g) {
  const a = g.arcade, c = g.company;
  if (c.deploy !== undefined) {
    const d = c.deploy;
    if (!d || !TIERS.some(t => t.id === d.tier) || !TIERS.some(t => t.id === d.peak) || !Array.isArray(d.history) || !d.milestones || typeof d.milestones !== 'object') return false;
    if (!d.history.every(h => Number.isSafeInteger(h.q) && TIERS.some(t => t.id === h.tier) && [h.scale, h.fleet, h.batch].every(n => Number.isSafeInteger(n) && n >= 0))) return false;
  }
  if (g.phase !== 'integration') return !a.tetris && FIELDS.slice(1).every(f => a[f] == null) && a.integration == null;
  const kind = a.integration?.kind || (a.tetris ? 'node' : null), G = GAMES[kind];
  if (!G) return false;
  if (a.integration && (typeof a.integration.id !== 'string' || !TIERS.some(t => t.id === a.integration.tier))) return false;
  if (!G.valid(a[G.field])) return false;
  return FIELDS.filter(f => f !== G.field).every(f => a[f] == null);
}
