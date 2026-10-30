// V20 Cable Mania: untimed network puzzle. The cable identifier and saved board remain stable.
// A Pipe Mania-style puzzle on a 7 × 7 data-hall floor. The spine switch sits near the middle; GPU nodes stand in racks
// around the walls, each with one network port facing the room; equipment blocks some floor tiles. The player places,
// rotates and reclaims finite cable pieces (straight, corner, tee, cross), then commits with TEST NETWORK. The signal
// travels one tile at a time: every node it reaches comes online; an open cable end is a dropped link. Perfect means
// every node online and no dropped link. The generator first builds a
// switch tree that reaches every node and deals exactly its pieces first, so a perfect fabric is always possible.
// Pure, deterministic (stream(seed, 'v119-cable', …), no Math.random, no clock) and JSON state in g.arcade.cable.
import { stream } from '../util.js';
import { GPUS } from './founder.js';

export const CABLE = Object.freeze({
  w: 7, h: 7,
  nodes: Object.freeze([4, 6]),         // node racks on the board, by deployment scale (4 at 48 GPUs, +1 per 70)
  blocks: Object.freeze([3, 5]),        // equipment tiles
  step: 520,                            // ms per tile the signal travels
  score: Object.freeze({ cable: 10, node: 250, perfect: 1000 }),
  skip: .75, floor: .55,
});
// Directions as bits: N 1, E 2, S 4, W 8.
export const DIRS = Object.freeze([1, 2, 4, 8]);
const DX = { 1: 0, 2: 1, 4: 0, 8: -1 }, DY = { 1: -1, 2: 0, 4: 1, 8: 0 };
export const opposite = d => ({ 1: 4, 2: 8, 4: 1, 8: 2 })[d];
export const rotateMask = (m, r = 1) => { for (let i = 0; i < ((r % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
export const KINDS = Object.freeze({ I: 5, L: 3, T: 7, X: 15 });     // base masks: straight, corner, tee (leaf switch), cross
const degree = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
const kindOf = m => degree(m) === 4 ? 'X' : degree(m) === 3 ? 'T' : (m === 5 || m === 10) ? 'I' : 'L';
export const pieceMask = p => rotateMask(KINDS[p.k], p.r);
const recipeKey = r => GPUS.filter(k => r?.[k] > 0).map(k => `${k}x${r[k]}`).join('+');

// ---- The board -------------------------------------------------------------------------------------------------
const W = CABLE.w, H = CABLE.h;
const xy = i => [i % W, Math.floor(i / W)];
const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : y * W + x;
export const neighbour = (i, d) => { const [x, y] = xy(i); return at(x + DX[d], y + DY[d]); };
const border = i => { const [x, y] = xy(i); return x === 0 || y === 0 || x === W - 1 || y === H - 1; };
const corner = i => { const [x, y] = xy(i); return (x === 0 || x === W - 1) && (y === 0 || y === H - 1); };
const inward = i => { const [x, y] = xy(i); return y === 0 ? 4 : y === H - 1 ? 1 : x === 0 ? 2 : 8; };
const manhattan = (a, b) => { const [ax, ay] = xy(a), [bx, by] = xy(b); return Math.abs(ax - bx) + Math.abs(ay - by); };

// Node racks for a deployment: 3–6 by scale; GPU types in the recipe's proportions (largest remainder, each ≥ 1).
export function nodeCount(scale) { return Math.max(CABLE.nodes[0], Math.min(CABLE.nodes[1], CABLE.nodes[0] + Math.floor((Math.max(48, scale) - 48) / 70))); }
export function rackNodes(recipe, n) {
  const types = GPUS.filter(k => recipe?.[k] > 0), total = types.reduce((s, k) => s + recipe[k], 0);
  if (!total) return [];
  n = Math.max(n, types.length);
  const quota = Object.fromEntries(types.map(k => [k, recipe[k] * n / total])), count = Object.fromEntries(types.map(k => [k, Math.max(1, Math.floor(quota[k]))]));
  let left = n - types.reduce((s, k) => s + count[k], 0);
  const order = [...types].sort((a, b) => (quota[b] - Math.floor(quota[b])) - (quota[a] - Math.floor(quota[a])) || recipe[b] - recipe[a]);
  for (let i = 0; left > 0; i++, left--) count[order[i % order.length]]++;
  while (left < 0) { const k = [...types].sort((a, b) => count[b] - count[a])[0]; if (count[k] <= 1) break; count[k]--; left++; }
  const out = [];
  for (const k of types) { const c = count[k]; for (let j = 0; j < c; j++) out.push({ gpu: k, gpus: Math.floor(recipe[k] / c) + (j < recipe[k] % c ? 1 : 0) }); }
  return out;
}

// The generator: spine, node racks on the walls, equipment, then a switch tree reaching every node (BFS from each
// node's port to the tree, random tie-breaks); kept when the tree has 8–22 cable tiles. Returns the board and the
// solution (cable tile → mask).
export function generateCable(seed, q, recipe, scale) {
  const specs = rackNodes(recipe, nodeCount(scale)), rk = recipeKey(recipe);
  for (let attempt = 0; attempt < 600; attempt++) {
    const r = stream(seed, 'v119-cable', q, rk, scale, attempt), cells = Array.from({ length: W * H }, () => ({ t: 'e' }));
    const spine = at(r.int(2, 4), r.int(2, 4));
    cells[spine] = { t: 's', m: 15 };
    const nodes = [], walls = r.shuffle(Array.from({ length: W * H }, (_, i) => i).filter(i => border(i) && !corner(i)));
    for (const i of walls) {
      if (nodes.length >= specs.length) break;
      if (manhattan(i, spine) < 3 || nodes.some(n => manhattan(n.i, i) < 3)) continue;
      nodes.push({ i, m: inward(i), ...specs[nodes.length] });
    }
    if (nodes.length < specs.length) continue;
    for (const n of nodes) cells[n.i] = { t: 'n', m: n.m, gpu: n.gpu, gpus: n.gpus };
    const entries = new Set(nodes.map(n => neighbour(n.i, n.m)));
    const free = r.shuffle(Array.from({ length: W * H }, (_, i) => i).filter(i => cells[i].t === 'e' && !border(i) && !entries.has(i) && manhattan(i, spine) > 1));
    const nb = r.int(CABLE.blocks[0], CABLE.blocks[1]);
    for (const i of free.slice(0, nb)) cells[i] = { t: 'b' };
    // The switch tree.
    const tree = new Set([spine]), links = new Map(); // cell → mask of tree links
    const link = (a, d) => { const b = neighbour(a, d); links.set(a, (links.get(a) || 0) | d); links.set(b, (links.get(b) || 0) | opposite(d)); };
    let ok = true;
    for (const n of r.shuffle(nodes)) {
      const entry = neighbour(n.i, n.m);
      if (entry < 0 || cells[entry].t === 'b' || cells[entry].t === 'n') { ok = false; break; }
      link(n.i, n.m);
      if (tree.has(entry)) continue;
      // BFS from the entry through empty floor to any tile next to the tree.
      const prev = new Map([[entry, -1]]), queue = [entry];
      let hit = -1, hitDir = 0;
      while (queue.length && hit < 0) {
        const c = queue.shift();
        for (const d of r.shuffle(DIRS)) {
          const m = neighbour(c, d);
          if (m < 0) continue;
          if (tree.has(m)) { hit = c; hitDir = d; break; }
          if (prev.has(m) || cells[m].t !== 'e' || entries.has(m) && m !== entry) continue;
          prev.set(m, c); queue.push(m);
        }
      }
      if (hit < 0) { ok = false; break; }
      link(hit, hitDir);
      for (let c = hit; c !== -1; c = prev.get(c)) { tree.add(c); const p = prev.get(c); if (p !== -1 && p !== undefined) link(p, DIRS.find(d => neighbour(p, d) === c)); }
    }
    if (!ok) continue;
    const solution = [...tree].filter(i => cells[i].t === 'e').map(i => ({ i, m: links.get(i) }));
    if (solution.length < 8 || solution.length > 22 || solution.some(s => degree(s.m) < 2)) continue;
    return { cells, spine, nodes: nodes.map(n => ({ i: n.i, m: n.m, gpu: n.gpu, gpus: n.gpus })), solution, attempt };
  }
  throw Error(`Cable Mania: no board for ${rk}`);
}
// The queue: the solution's pieces (shuffled, random rotations) with a spare dealt after every third one (spares must
// be laid somewhere harmless: a decision, not a dead end), then spares in the same mix plus a few straights and
// corners. Long enough for every replacement a player will ever make; a perfect fabric needs no luck.
function dealQueue(seed, q, solution) {
  const r = stream(seed, 'v119-cable-queue', q, solution.length), first = r.shuffle(solution.map(s => kindOf(s.m)));
  const mix = solution.map(s => kindOf(s.m)).concat(['I', 'L', 'L', 'I']), out = [];
  first.forEach((k, j) => { out.push({ k, r: r.int(0, 3) }); if (j % 3 === 2 && j < first.length - 1) out.push({ k: r.pick(['I', 'L']), r: r.int(0, 3), spare: true }); });
  while (out.length < solution.length * 2 + 12) out.push({ k: r.pick(mix), r: r.int(0, 3) });
  return out;
}

// ---- Lifecycle --------------------------------------------------------------------------------------------------
export function startCable(g, spec) {
  if (g.phase !== 'integration' || !spec?.builds?.length) return false;
  const B = generateCable(spec.seed ?? g.seed, g.q, spec.recipe, spec.scale || 48);
  g.arcade.cable = {
    id: spec.id ?? `q${g.q}-cable`, builds: [...spec.builds], recipe: { ...spec.recipe }, w: W, h: H, cells: B.cells, spine: B.spine,
    nodes: B.nodes.map(n => ({ ...n, online: false, at: null })), solution: B.solution, queue: dealQueue(g.seed, g.q, B.solution), qi: 0, selected: 0,
    cursor: B.spine, prime: 0, seconds: 0, started: false, done: false, result: null, reason: null,
    ms: 0, signal: { on: false, fast: false, acc: 0, front: [], steps: 0, sentAt: null }, live: Array(W * H).fill(0), drops: [],
    placed: 0, replaced: 0, energized: 0, last: null, attempt: B.attempt,
  };
  return true;
}
const state = g => g?.arcade?.cable;
const live = g => g?.phase === 'integration' && !!state(g) && !state(g).done;
export const cableOutcome = g => state(g)?.done ? state(g).result : null;
export const handPiece = t => t.selected === undefined ? t.queue[t.qi] || null : t.queue[t.selected] && !t.queue[t.selected].used ? t.queue[t.selected] : null;
export const handMask = t => { const p = handPiece(t); return p ? pieceMask(p) : 0; };
// A tile can take a cable if it is open floor, or a cable the signal has not reached yet (replace).
export const canLay = (t, i) => i >= 0 && i < t.cells.length && t.cells[i].t === 'e' && !t.signal.on;
// Existing /v119xq/ saves may have an unfinished timed board. Keep its placed cables and remaining hand.
function normalizeCable(t) {
  if (t.selected !== undefined) return;
  for (let i = 0; i < t.qi; i++) t.queue[i].used = true;
  const assigned = new Set();
  for (const c of t.cells) if (c.t === 'c' && c.piece === undefined) {
    const i = t.queue.findIndex((p, n) => n < t.qi && p.k === c.k && !assigned.has(n));
    if (i >= 0) { c.piece = i; assigned.add(i); }
  }
  t.selected = t.queue.findIndex(p => !p.used);
}

// Preview connectivity without committing the test. Only reciprocal ports carry a link.
export function connectedCable(t) {
  const seen = new Set([t.spine]), queue = [t.spine];
  for (const i of queue) for (const d of DIRS) {
    if (!(t.cells[i].m & d)) continue;
    const j = neighbour(i, d), c = t.cells[j];
    if (c && (c.t === 'c' || c.t === 'n') && c.m & opposite(d) && !seen.has(j)) { seen.add(j); if (c.t === 'c') queue.push(j); }
  }
  return seen;
}

function lay(t, i) {
  const p = handPiece(t);
  if (!p || !canLay(t, i)) return false;
  const index = t.queue.indexOf(p);
  t.cells[i] = { t: 'c', m: pieceMask(p), k: p.k, piece: index };
  p.used = true; t.qi++; t.placed++; t.cursor = i; t.last = { i, n: t.placed };
  // Stay with the player's chosen type and orientation; an exhausted type requires an explicit new choice.
  t.selected = t.queue.findIndex(x => x.k === p.k && !x.used);
  if (t.selected >= 0) t.queue[t.selected].r = p.r;
  return true;
}
function remove(t, i) {
  if (t.signal.on || t.cells[i]?.t !== 'c') return false;
  const p = t.queue[t.cells[i].piece]; if (p) p.used = false;
  t.cells[i] = { t: 'e' }; t.qi = Math.max(0, t.qi - 1); t.replaced++; t.cursor = i; return true;
}
function send(t) {
  if (!t.signal.on) { t.signal.on = true; t.signal.sentAt = t.ms; t.signal.front = [{ i: t.spine, from: 0 }]; t.live[t.spine] = 1; t.signal.acc = 0; return true; }
  return false;
}
// One signal step: every front tile pushes the signal through each of its ports. A node goes online; an open end is
// a dropped link (once); a switch port with nothing on it is simply unused.
function advance(t) {
  const next = [];
  t.signal.steps++;
  for (const f of t.signal.front) {
    const c = t.cells[f.i];
    for (const d of DIRS) {
      if (!(c.m & d) || d === f.from) continue;
      const n = neighbour(f.i, d), nc = n >= 0 ? t.cells[n] : null;
      const connects = nc && (nc.t === 'c' || nc.t === 'n') && (nc.m & opposite(d));
      if (!connects) { if (c.t !== 's' && !t.drops.some(x => x.i === f.i && x.d === d)) t.drops.push({ i: f.i, d, step: t.signal.steps }); continue; }
      if (t.live[n]) continue;
      t.live[n] = t.signal.steps + 1;
      if (nc.t === 'n') { const node = t.nodes.find(x => x.i === n); node.online = true; node.at = t.signal.steps; }
      else { t.energized++; next.push({ i: n, from: opposite(d) }); }
    }
  }
  t.signal.front = next;
  if (!next.length) finish(t, t.nodes.every(n => n.online) ? 'complete' : 'dark');
}
export function evaluateCable(t) {
  const total = t.nodes.reduce((s, n) => s + n.gpus, 0), online = t.nodes.filter(n => n.online).reduce((s, n) => s + n.gpus, 0);
  const share = total ? online / total : 0, perfect = t.nodes.every(n => n.online) && t.drops.length === 0;
  const efficiency = perfect ? 1 : Math.min(.99, Math.round((CABLE.floor + (1 - CABLE.floor) * share) * 100) / 100);
  return { share, efficiency, perfect, online: t.nodes.filter(n => n.online).length, nodes: t.nodes.length, gpusOnline: online, gpus: total };
}
// Display-score only: a clean, fully connected fabric earns at most 150 points for a shorter route.
// Count cables left on the board, never placement actions, so extra pieces cannot improve the bonus.
export function leanNetwork(t, e = evaluateCable(t)) {
  const used = t.cells.filter(c => c.t === 'c').length;
  const saved = e.perfect ? Math.max(0, t.solution.length - used) : 0;
  return { saved, bonus: Math.min(3, saved) * 50 };
}
function finish(t, reason) {
  const e = evaluateCable(t), S = CABLE.score, lean = leanNetwork(t, e);
  t.done = true; t.reason = reason; t.signal.front = [];
  t.result = { efficiency: e.efficiency, perfect: e.perfect, skipped: false, reason, seconds: Math.round(t.ms / 100) / 10,
    score: S.cable * t.energized + S.node * e.online + (e.perfect ? S.perfect : 0) + lean.bonus,
    rows: null, placed: t.placed, pieces: t.solution.length, detail: { nodes: e.nodes, online: e.online, drops: t.drops.length, placed: t.placed, replaced: t.replaced, early: 0, lean } };
  return true;
}

// ---- Inputs and time --------------------------------------------------------------------------------------------
// start; move (arg: 'up'|'down'|'left'|'right'); rotate (the piece in hand, clockwise); lay (arg: a tile index, or the
// cursor); send (signal now, then fast-forward). Returns false when nothing changed.
export function cableInput(g, action, arg) {
  if (!live(g)) return false;
  const t = state(g);
  normalizeCable(t);
  if (action === 'start') { if (t.started) return false; t.started = true; return true; }
  if (!t.started) return false;
  if (t.signal.on && action !== 'move') return false;
  if (action === 'drop') {
    const { from, to, piece, mask, rotation } = arg || {};
    if (Number.isSafeInteger(from)) {
      const c = t.cells[from];
      if (c?.t !== 'c' || c.piece !== piece || c.m !== mask) return false;
      if (to === 'inventory') return remove(t, from);
      if (!Number.isSafeInteger(to) || !canLay(t, to)) return false;
      t.cells[to] = c; t.cells[from] = { t: 'e' }; t.cursor = to; t.last = { i: to, n: t.placed };
      return true;
    }
    const p = t.queue[piece];
    if (!Number.isSafeInteger(piece) || !p || p.used || pieceMask(p) !== mask || !Number.isInteger(rotation) || rotation < 0 || rotation > 3 || !Number.isSafeInteger(to) || !canLay(t, to)) return false;
    t.selected = piece; p.r = rotation;
    return lay(t, to);
  }
  if (action === 'move') {
    const d = { up: 1, right: 2, down: 4, left: 8 }[arg], n = d ? neighbour(t.cursor, d) : -1;
    if (n < 0) return false; t.cursor = n; return true;
  }
  if (action === 'rotate') { const p = handPiece(t); if (!p || p.k === 'X') return false; p.r = (p.r + 1) % 4; return true; }
  if (action === 'select') { const i = t.queue.findIndex(p => p.k === arg && !p.used); if (i < 0 || i === t.selected) return false; t.selected = i; return true; }
  if (action === 'remove') return remove(t, Number.isSafeInteger(arg) ? arg : t.cursor);
  if (action === 'lay') { const i = Number.isSafeInteger(arg) ? arg : t.cursor; return t.cells[i]?.t === 'c' ? remove(t, i) : lay(t, i); }
  if (action === 'send') return send(t);
  return false;
}
// Time advances only after TEST NETWORK. Planning never starts a countdown or launches the signal.
export function cableTick(g, dt) {
  if (!live(g) || !(dt > 0)) return false;
  const t = state(g);
  if (!t.signal.on) return false;
  let ms = Math.round(Math.min(dt, 1) * 1000);
  while (ms > 0 && !t.done) {
    const per = CABLE.step, step = Math.min(ms, per - t.signal.acc);
    t.ms += step; t.signal.acc += step; ms -= step;
    if (t.signal.acc >= per) { t.signal.acc = 0; advance(t); }
  }
  return true;
}
export const msToNext = t => !t || !t.signal.on ? 1000 : CABLE.step - t.signal.acc;
export function skipCable(g) {
  if (!live(g) || state(g).started) return false;
  const t = state(g);
  t.done = true; t.reason = 'skip';
  t.result = { efficiency: CABLE.skip, perfect: false, skipped: true, score: 0, reason: 'skip', seconds: 0, rows: null, placed: 0, pieces: t.solution.length, detail: { nodes: t.nodes.length, online: 0, drops: 0, placed: 0, replaced: 0, early: 0 } };
  return true;
}

// ---- Autoplay: the real game through cableInput / cableTick (bots and tests) ----------------------------------------
// Bots choose a seeded share of wrong orientations and correct some of them before the single final test.
export const cableBotMix = s => ({ pWrong: .55 * (1 - s) ** .6, pFix: 1 - .45 * (1 - s) ** .6 });
export function autoplayCable(g, skill = 1, override = null) {
  if (!live(g)) return false;
  const t = state(g), s = Math.max(0, Math.min(1, Number.isFinite(Number(skill)) ? Number(skill) : 1));
  const mix = { ...cableBotMix(s), ...override };
  cableInput(g, 'start');
  for (const x of t.solution) {
    const k = kindOf(x.m), r = stream(g.seed, 'v119-cable-bot', g.q, Math.round(s * 1000), x.i);
    cableInput(g, 'select', k);
    const wrong = r.chance(mix.pWrong) && !r.chance(mix.pFix);
    const target = wrong ? rotateMask(x.m, r.int(1, 3)) : x.m;
    for (let n = 0; n < 4 && handMask(t) !== target; n++) cableInput(g, 'rotate');
    cableInput(g, 'lay', x.i);
  }
  cableInput(g, 'send');
  for (let guard = 0; guard < 100 && !t.done; guard++) cableTick(g, 1);
  return t.done;
}

// ---- Adapter (integration.js registry) --------------------------------------------------------------------------
export const ADAPTER = Object.freeze({
  kind: 'cable', field: 'cable', name: 'Cable Mania', ready: true,
  start: (g, spec) => startCable(g, spec),
  input: (g, action, arg) => cableInput(g, action, arg),
  tick: (g, dt) => cableTick(g, dt),
  skip: g => skipCable(g),
  outcome: g => cableOutcome(g),
  autoplay: (g, skill) => autoplayCable(g, skill),
  valid: t => !!(t && typeof t === 'object' && Array.isArray(t.builds) && t.builds.length && Array.isArray(t.cells) && t.cells.length === CABLE.w * CABLE.h &&
    Array.isArray(t.nodes) && t.nodes.length >= 1 && Array.isArray(t.queue) && Number.isSafeInteger(t.qi) && Array.isArray(t.live) && t.live.length === t.cells.length && Array.isArray(t.drops)),
});
